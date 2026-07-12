"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {isDeepStrictEqual} = require("node:util");
const {
  equipmentWearRulesFromDocument,
  loadBattleEquipmentCatalog,
} = require("./battle-equipment-rules");
const {
  EQUIPMENT_SLOTS_VERSION,
  MAX_EQUIPMENT_INSTANCE_SERIAL,
  auditEquipmentProfileState,
  createFreshEquipmentInstance,
  equipmentInstanceIdForSerial,
  readEquipmentInstanceState,
} = require("./equipment-profile-state");
const {readBankProfileState} = require("./bank-profile-state");
const {createEquipmentEnvelopeOwnershipRegistry} = require("./equipment-envelope-registry");
const {readMailAttachmentState} = require("./mail-attachment-state");
const {auditMarketListingBook} = require("./market-listing-state");
const {loadPlayerLevelRuntime} = require("./player-level-runtime");

const EQUIPMENT_PROFILE_MIGRATION_SOURCE = "profile_v2_to_v3_backfill";
const DEFAULT_BAG_ITEMS_PATH = path.resolve(__dirname, "../../../..", "client/godot/data/bag_items.json");
const DEFAULT_PLAYER_GROWTH_PATH = path.resolve(
  __dirname,
  "../../../..",
  "client/godot/data/balance/player_growth.json",
);
const BACKPACK_BASE_SLOT_LIMIT = 15;
const WEAPON_SLOT_IDS = new Set(["right_hand_weapon", "left_hand_weapon"]);

let cachedDependencies = null;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function clone(value) {
  return structuredClone(value);
}

function record(value) {
  return isRecord(value) ? value : {};
}

function integer(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : Math.trunc(Number(fallback || 0));
}

function positiveInteger(value, fallback = 1) {
  return Math.max(1, integer(value, fallback));
}

function itemMaxDurability(item) {
  return item && item.usesDurability === false ? 0 : positiveInteger(item && item.durabilityMax, 30);
}

function itemMaxEnhancement(item) {
  return item && item.expPill === true ? 0 : Math.max(0, integer(item && item.enhanceMax, 5));
}

function conflict(code, message, details = {}) {
  return {...details, code, message};
}

function loadBagItemCatalog(filePath = DEFAULT_BAG_ITEMS_PATH) {
  let document;
  try {
    document = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const loadError = new Error(`failed to load authoritative bag item catalog: ${filePath}`);
    loadError.cause = error;
    throw loadError;
  }
  if (!isRecord(document) || !Number.isInteger(document.schemaVersion) || document.schemaVersion < 1) {
    throw new Error("bag item catalog schemaVersion must be a positive integer");
  }
  const itemById = new Map();
  for (const rawItem of Array.isArray(document.items) ? document.items : []) {
    if (!isRecord(rawItem)) {
      throw new Error("bag item catalog contains a non-object item");
    }
    const itemId = String(rawItem.id || "").trim();
    const stackLimit = Number(rawItem.stackLimit ?? 1);
    if (itemId === "" || itemById.has(itemId) || !Number.isSafeInteger(stackLimit) || stackLimit < 1) {
      throw new Error(`bag item catalog contains an invalid item: ${itemId || "<missing>"}`);
    }
    itemById.set(itemId, Object.freeze({...rawItem, id: itemId, stackLimit}));
  }
  const slotLimit = Number(document.slotLimit);
  if (itemById.size === 0 || !Number.isSafeInteger(slotLimit) || slotLimit < 1) {
    throw new Error("bag item catalog must declare items and a positive slotLimit");
  }
  return Object.freeze({schemaVersion: document.schemaVersion, slotLimit, itemById});
}

function defaultDependencies() {
  if (!cachedDependencies) {
    cachedDependencies = Object.freeze({
      catalog: loadBattleEquipmentCatalog(),
      bagCatalog: loadBagItemCatalog(),
      levelRuntime: loadPlayerLevelRuntime(),
      wearRules: equipmentWearRulesFromDocument(JSON.parse(fs.readFileSync(DEFAULT_PLAYER_GROWTH_PATH, "utf8"))),
    });
  }
  return cachedDependencies;
}

function dependencies(options = {}) {
  const defaults = defaultDependencies();
  return {
    catalog: options.catalog || defaults.catalog,
    bagCatalog: options.bagCatalog || defaults.bagCatalog,
    levelRuntime: options.levelRuntime || defaults.levelRuntime,
    wearRules: options.wearRules || defaults.wearRules,
  };
}

function validateBackpackAndCountEquipment(profile, catalog, bagCatalog) {
  const conflicts = [];
  const equipmentCounts = new Map();
  const extraSlots = hasOwn(profile, "backpackExtraSlots") ? profile.backpackExtraSlots : 0;
  const maxExtraSlots = Math.max(0, bagCatalog.slotLimit - BACKPACK_BASE_SLOT_LIMIT);
  if (!Number.isSafeInteger(extraSlots) || extraSlots < 0 || extraSlots > maxExtraSlots) {
    conflicts.push(conflict(
      "equipment_migration_backpack_invalid",
      "backpackExtraSlots is outside its authoritative range",
      {path: "backpackExtraSlots", extraSlots, maxExtraSlots},
    ));
  }
  if (!hasOwn(profile, "backpackSlots")) {
    return {conflicts, equipmentCounts};
  }
  const slots = profile.backpackSlots;
  if (!Array.isArray(slots)) {
    conflicts.push(conflict(
      "equipment_migration_backpack_invalid",
      "backpackSlots must be an array before equipment migration",
      {path: "backpackSlots", reason: "not_array"},
    ));
    return {conflicts, equipmentCounts};
  }
  const effectiveSlotLimit = BACKPACK_BASE_SLOT_LIMIT + (
    Number.isSafeInteger(extraSlots) ? Math.max(0, Math.min(maxExtraSlots, extraSlots)) : 0
  );
  if (slots.length > effectiveSlotLimit) {
    conflicts.push(conflict(
      "equipment_migration_backpack_invalid",
      "backpackSlots exceeds the player's unlocked slot limit",
      {path: "backpackSlots", slotCount: slots.length, slotLimit: effectiveSlotLimit},
    ));
  }
  for (const [index, slot] of slots.entries()) {
    const slotPath = `backpackSlots[${index}]`;
    if (!isRecord(slot)) {
      conflicts.push(conflict(
        "equipment_migration_backpack_invalid",
        "backpack slot must be an object",
        {path: slotPath, reason: "slot_not_object"},
      ));
      continue;
    }
    const keys = Object.keys(slot);
    const itemId = typeof slot.itemId === "string" ? slot.itemId : "";
    const count = slot.count;
    if (itemId !== itemId.trim() || keys.some((key) => !["itemId", "count"].includes(key))) {
      conflicts.push(conflict(
        "equipment_migration_backpack_invalid",
        "backpack slot contains non-canonical fields",
        {path: slotPath, itemId: String(slot.itemId || ""), reason: "non_canonical_slot"},
      ));
      continue;
    }
    if (itemId === "") {
      if (!Number.isSafeInteger(count ?? 0) || Number(count ?? 0) !== 0) {
        conflicts.push(conflict(
          "equipment_migration_backpack_invalid",
          "empty backpack slot must have count 0",
          {path: slotPath, reason: "empty_slot_count"},
        ));
      }
      continue;
    }
    const bagItem = bagCatalog.itemById.get(itemId) || null;
    if (!bagItem) {
      conflicts.push(conflict(
        "equipment_migration_backpack_item_unknown",
        "backpack contains an item unknown to this server version",
        {path: slotPath, itemId},
      ));
      continue;
    }
    if (!Number.isSafeInteger(count) || count < 1 || count > bagItem.stackLimit) {
      conflicts.push(conflict(
        "equipment_migration_backpack_invalid",
        "backpack item count is outside its authoritative stack limit",
        {path: slotPath, itemId, count, stackLimit: bagItem.stackLimit},
      ));
      continue;
    }
    if (catalog.itemById instanceof Map && catalog.itemById.has(itemId)) {
      equipmentCounts.set(itemId, Number(equipmentCounts.get(itemId) || 0) + count);
    }
  }
  return {conflicts, equipmentCounts};
}

function scanItemEntries(value, pathPrefix, catalog, bagCatalog, conflicts) {
  if (!Array.isArray(value)) {
    conflicts.push(conflict(
      "equipment_external_container_invalid",
      "an equipment-capable external container is not an array",
      {path: pathPrefix, reason: "not_array"},
    ));
    return;
  }
  for (const [index, entry] of value.entries()) {
    const pathValue = `${pathPrefix}[${index}]`;
    if (!isRecord(entry)) {
      conflicts.push(conflict(
        "equipment_external_container_invalid",
        "an external item entry is not an object",
        {path: pathValue, reason: "entry_not_object"},
      ));
      continue;
    }
    const unsupportedKeys = Object.keys(entry).filter((key) => !["itemId", "count"].includes(key));
    if (unsupportedKeys.length > 0) {
      conflicts.push(conflict(
        "equipment_external_envelope_unknown",
        "an external item entry contains fields this migration cannot preserve as an instance envelope",
        {path: pathValue, fields: unsupportedKeys.sort()},
      ));
    }
    const itemId = String(entry.itemId || "").trim();
    const count = Number(entry.count ?? 0);
    if (itemId === "") {
      if (Number.isSafeInteger(count) && count === 0) {
        continue;
      }
      conflicts.push(conflict(
        "equipment_external_container_invalid",
        "an external item entry has no item identity",
        {path: pathValue, reason: "item_id_missing"},
      ));
      continue;
    }
    if (!bagCatalog.itemById.has(itemId)) {
      conflicts.push(conflict(
        "equipment_external_item_unknown",
        "an external container contains an item unknown to this server version",
        {path: pathValue, itemId},
      ));
      continue;
    }
    if (!Number.isSafeInteger(count) || count < 1) {
      conflicts.push(conflict(
        "equipment_external_container_invalid",
        "an external item entry has an invalid count",
        {path: pathValue, itemId, count},
      ));
      continue;
    }
    if (catalog.itemById.has(itemId)) {
      conflicts.push(conflict(
        "equipment_external_container_blocked",
        "equipment in bank, mail, market, or trade needs an instance envelope before migration",
        {path: pathValue, itemId, count},
      ));
    }
  }
}

function validateExternalSchema(value, pathValue, conflicts) {
  if (!hasOwn(value, "schemaVersion")) {
    return;
  }
  if (value.schemaVersion !== 1) {
    conflicts.push(conflict(
      "equipment_external_schema_unsupported",
      "an external asset container uses an unsupported schema version",
      {path: pathValue, schemaVersion: value.schemaVersion},
    ));
  }
}

function validateNoUnknownEquipmentEnvelope(value, pathValue, knownFields, conflicts) {
  const unknownFields = Object.keys(value).filter((key) => !knownFields.includes(key));
  if (unknownFields.length > 0) {
    conflicts.push(conflict(
      "equipment_external_envelope_unknown",
      "an external container has fields this migration cannot safely interpret",
      {path: pathValue, fields: unknownFields.sort()},
    ));
  }
}

function externalItemCounts(entries) {
  const counts = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const itemId = String(entry && entry.itemId || "").trim();
    const count = Number(entry && entry.count || 0);
    if (itemId !== "" && Number.isSafeInteger(count) && count > 0) {
      counts.set(itemId, Number(counts.get(itemId) || 0) + count);
    }
  }
  return JSON.stringify(Array.from(counts.entries()).sort(([left], [right]) => (
    left < right ? -1 : (left > right ? 1 : 0)
  )));
}

function requiredBankSlots(entries, bagCatalog) {
  const counts = new Map(JSON.parse(externalItemCounts(entries)));
  let required = 0;
  for (const [itemId, count] of counts) {
    const item = bagCatalog.itemById.get(itemId);
    required += item ? Math.ceil(count / item.stackLimit) : 0;
  }
  return required;
}

function bankRepresentationConflict(conflicts, reason, details = {}) {
  conflicts.push(conflict(
    "equipment_external_container_invalid",
    "bank representations, aliases, capacity, or unlocked tabs are inconsistent",
    {path: "bank", reason, ...details},
  ));
}

function bankProfileStateOptions(catalog, bagCatalog, levelRuntime, wearRules) {
  return {
    itemById: (itemId) => bagCatalog.itemById.get(String(itemId || "").trim()) || null,
    isEquipmentItemId: (itemId) => catalog.itemById.has(String(itemId || "").trim()),
    itemStackLimit: (itemId) => positiveInteger(
      bagCatalog.itemById.get(String(itemId || "").trim())?.stackLimit,
      1,
    ),
    equipmentTransferOptions: {
      ...wearRules,
      expToNextLevel: levelRuntime.expToNextLevel,
      maxPlayerLevel: positiveInteger(levelRuntime.maxPlayerLevel, 140),
    },
  };
}

function bankProfileStateConflict(result) {
  const details = Object.fromEntries(Object.entries(result || {}).filter(([key]) => (
    !["ok", "code", "message", "bank"].includes(key)
  )));
  const relativePath = String(details.path || "").trim();
  return conflict(
    String(result && result.code || "equipment_external_container_invalid"),
    String(result && result.message || "bank instance envelopes failed authoritative validation"),
    {
      ...details,
      path: relativePath === "" ? "bank" : `bank.${relativePath}`,
    },
  );
}

function externalEscrowStateConflict(result, basePath) {
  const details = Object.fromEntries(Object.entries(result || {}).filter(([key]) => (
    !["ok", "code", "message", "mail", "listing", "listings", "listingById"].includes(key)
  )));
  const relativePath = String(details.path || details.listingKey || "").trim();
  return conflict(
    String(result && result.code || "equipment_external_container_invalid"),
    String(result && result.message || "external equipment escrow failed authoritative validation"),
    {
      ...details,
      path: relativePath === "" ? basePath : `${basePath}.${relativePath}`,
    },
  );
}

function profileExternalEquipmentConflicts(profile, catalog, bagCatalog, levelRuntime, wearRules) {
  const conflicts = [];
  if (hasOwn(profile, "bank")) {
    if (!isRecord(profile.bank)) {
      conflicts.push(conflict(
        "equipment_external_container_invalid",
        "bank must be an object before equipment migration",
        {path: "bank", reason: "not_object"},
      ));
    } else {
      const bank = profile.bank;
      if (hasOwn(bank, "schemaVersion") && bank.schemaVersion !== 1) {
        const checked = readBankProfileState(
          bank,
          catalog,
          bankProfileStateOptions(catalog, bagCatalog, levelRuntime, wearRules),
        );
        if (!checked.ok) {
          conflicts.push(bankProfileStateConflict(checked));
        }
      } else {
        const allowedFields = [
          "stoneCoins", "coins", "slots", "items", "itemAmounts", "unlockedTabs", "tabs", "schemaVersion",
        ];
        validateExternalSchema(bank, "bank", conflicts);
        const unknownFields = Object.keys(bank).filter((key) => !allowedFields.includes(key)).sort();
        if (unknownFields.length > 0) {
          bankRepresentationConflict(conflicts, "unknown_fields", {fields: unknownFields});
        }
        for (const field of ["slots", "items", "itemAmounts"]) {
          if (hasOwn(bank, field)) {
            scanItemEntries(bank[field], `bank.${field}`, catalog, bagCatalog, conflicts);
          }
        }
        const representations = ["items", "itemAmounts"]
          .filter((field) => Array.isArray(bank[field]))
          .map((field) => externalItemCounts(bank[field]));
        if (representations.length > 1 && representations.some((value) => value !== representations[0])) {
          bankRepresentationConflict(conflicts, "item_representations_disagree");
        }
        if (Array.isArray(bank.slots) && bank.slots.length > 0 && representations.length > 0) {
          const slotCounts = externalItemCounts(bank.slots);
          if (representations.some((value) => value !== slotCounts)) {
            bankRepresentationConflict(conflicts, "slot_representation_disagrees");
          }
        }
        if (Array.isArray(bank.slots) && bank.slots.length > 90) {
          bankRepresentationConflict(conflicts, "slot_limit", {slotCount: bank.slots.length, slotLimit: 90});
        }
        for (const [index, slot] of (Array.isArray(bank.slots) ? bank.slots : []).entries()) {
          const itemId = String(slot && slot.itemId || "").trim();
          const item = bagCatalog.itemById.get(itemId);
          if (item && Number(slot.count) > item.stackLimit) {
            bankRepresentationConflict(conflicts, "slot_stack_limit", {index, itemId, count: slot.count, stackLimit: item.stackLimit});
          }
        }
        const aliasedInteger = (primary, legacy, minimum, maximum, fallback) => {
          const fields = [primary, legacy].filter((field) => hasOwn(bank, field));
          const invalid = fields.some((field) => (
            !Number.isSafeInteger(bank[field]) || bank[field] < minimum || bank[field] > maximum
          ));
          const disagree = fields.length > 1 && bank[primary] !== bank[legacy];
          return {invalid: invalid || disagree, value: fields.length > 0 ? bank[fields[0]] : fallback};
        };
        const coins = aliasedInteger("stoneCoins", "coins", 0, 100000000, 0);
        const tabs = aliasedInteger("unlockedTabs", "tabs", 1, 6, 1);
        if (coins.invalid || tabs.invalid) {
          bankRepresentationConflict(conflicts, "numeric_alias_conflict");
        }
        const unlockedSlots = Number.isSafeInteger(tabs.value) ? tabs.value * 15 : 15;
        if (Array.isArray(bank.slots) && bank.slots.some((slot, index) => (
          index >= unlockedSlots && String(slot && slot.itemId || "").trim() !== ""
        ))) {
          bankRepresentationConflict(conflicts, "locked_slot_filled", {unlockedSlots});
        }
        if (!Array.isArray(bank.slots) || bank.slots.length === 0) {
          for (const field of ["items", "itemAmounts"]) {
            if (Array.isArray(bank[field]) && requiredBankSlots(bank[field], bagCatalog) > unlockedSlots) {
              bankRepresentationConflict(conflicts, "unlocked_capacity", {field, unlockedSlots});
            }
          }
        }
      }
    }
  }
  if (hasOwn(profile, "mailboxMessages")) {
    if (!Array.isArray(profile.mailboxMessages)) {
      conflicts.push(conflict(
        "equipment_external_container_invalid",
        "mailboxMessages must be an array before equipment migration",
        {path: "mailboxMessages", reason: "not_array"},
      ));
    } else {
      for (const [index, message] of profile.mailboxMessages.entries()) {
        if (!isRecord(message)) {
          conflicts.push(conflict(
            "equipment_external_container_invalid",
            "mailbox message must be an object",
            {path: `mailboxMessages[${index}]`, reason: "message_not_object"},
          ));
          continue;
        }
        validateExternalSchema(message, `mailboxMessages[${index}]`, conflicts);
        validateNoUnknownEquipmentEnvelope(
          message,
          `mailboxMessages[${index}]`,
          ["mailId", "sender", "title", "body", "createdAtSec", "expiresAtSec", "items", "schemaVersion"],
          conflicts,
        );
        if (hasOwn(message, "items")) {
          scanItemEntries(message.items, `mailboxMessages[${index}].items`, catalog, bagCatalog, conflicts);
        }
      }
    }
  }
  return conflicts;
}

function snapshotExternalEquipmentConflicts(snapshotValue, options = {}) {
  const snapshot = record(snapshotValue);
  const {catalog, bagCatalog, levelRuntime, wearRules} = dependencies(options);
  const escrowOptions = bankProfileStateOptions(catalog, bagCatalog, levelRuntime, wearRules);
  const conflicts = [];
  const snapshotAccountIds = new Set(
    Object.values(record(snapshot.accounts))
      .map((account) => String(account && account.accountId || "").trim())
      .filter(Boolean),
  );
  const accountBucketDeclared = hasOwn(snapshot, "accounts") && isRecord(snapshot.accounts);
  const envelopeRegistry = createEquipmentEnvelopeOwnershipRegistry(snapshot);
  for (const duplicate of envelopeRegistry.duplicates) {
    const ownerships = Array.isArray(duplicate.ownerships) ? duplicate.ownerships : [];
    const firstPath = String(ownerships[0] && ownerships[0].path || "");
    for (const ownership of ownerships.slice(1)) {
      conflicts.push(conflict(
        "equipment_external_envelope_duplicate",
        "an equipment escrow envelope is referenced by more than one persistent container or materialized instance",
        {
          path: String(ownership && ownership.path || "equipmentEnvelope"),
          envelopeId: String(duplicate.envelopeId || ""),
          firstPath,
        },
      ));
    }
  }
  for (const registryConflict of envelopeRegistry.conflicts) {
    if (registryConflict.code === "equipment_transfer_envelope_duplicate") {
      continue;
    }
    if (registryConflict.code === "equipment_materialized_origin_active") {
      for (const trace of Array.isArray(registryConflict.traces) ? registryConflict.traces : []) {
        conflicts.push(conflict(
          "equipment_external_envelope_duplicate",
          "a consumed or materialized equipment envelope reappears in a persistent escrow container",
          {
            path: String(trace && trace.path || "equipmentEnvelope"),
            envelopeId: String(registryConflict.originEnvelopeId || ""),
            firstPath: String(registryConflict.ownerships && registryConflict.ownerships[0]
              && registryConflict.ownerships[0].path || "consumedEquipmentEnvelopes"),
          },
        ));
      }
      continue;
    }
    if (registryConflict.code === "equipment_materialized_origin_duplicate") {
      const traces = Array.isArray(registryConflict.traces) ? registryConflict.traces : [];
      const firstPath = String(traces[0] && traces[0].path || "equipmentEnvelope");
      for (const trace of traces.slice(1)) {
        conflicts.push(conflict(
          "equipment_external_envelope_duplicate",
          "a consumed equipment envelope is referenced by more than one materialized state",
          {
            path: String(trace && trace.path || "equipmentEnvelope"),
            envelopeId: String(registryConflict.originEnvelopeId || ""),
            firstPath,
          },
        ));
      }
      continue;
    }
    conflicts.push(conflict(
      registryConflict.code || "equipment_external_envelope_registry_conflict",
      registryConflict.message || "equipment envelope registry conflict",
      {
        path: String(registryConflict.path || registryConflict.originEnvelopeId || "consumedEquipmentEnvelopes"),
        originEnvelopeId: String(registryConflict.originEnvelopeId || ""),
        reason: String(registryConflict.reason || ""),
      },
    ));
  }
  const scanObjectBucket = (bucketName, visit) => {
    if (!hasOwn(snapshot, bucketName)) {
      return;
    }
    const bucket = snapshot[bucketName];
    if (!isRecord(bucket)) {
      conflicts.push(conflict(
        "equipment_external_container_invalid",
        `${bucketName} must be an object before equipment migration`,
        {path: bucketName, reason: "not_object"},
      ));
      return;
    }
    for (const key of Object.keys(bucket).sort()) {
      visit(bucket[key], `${bucketName}.${key}`, key);
    }
  };

  scanObjectBucket("mailMessages", (message, basePath, mailKey) => {
    if (!isRecord(message)) {
      conflicts.push(conflict("equipment_external_container_invalid", "mail message must be an object", {
        path: basePath,
        reason: "message_not_object",
      }));
      return;
    }
    const mailId = typeof message.mailId === "string" ? message.mailId : "";
    const recipientAccountId = typeof message.recipientAccountId === "string"
      ? message.recipientAccountId
      : "";
    if (mailId === "" || mailId !== mailId.trim() || mailId !== mailKey) {
      conflicts.push(conflict(
        "mail_identity_conflict",
        "mail storage key and mail identity are inconsistent; attachments must remain untouched",
        {path: basePath, mailKey, mailId, reason: "mail_id_mismatch"},
      ));
    }
    if (recipientAccountId === "" || recipientAccountId !== recipientAccountId.trim()) {
      conflicts.push(conflict(
        "mail_identity_conflict",
        "mail recipient identity is missing or non-canonical; attachments must remain untouched",
        {path: basePath, mailKey, recipientAccountId, reason: "recipient_missing"},
      ));
    } else if (accountBucketDeclared && !snapshotAccountIds.has(recipientAccountId)) {
      conflicts.push(conflict(
        "mail_recipient_missing",
        "mail recipient account is absent from the persistent snapshot; attachments must remain untouched",
        {path: basePath, mailKey, recipientAccountId},
      ));
    }
    const checked = readMailAttachmentState(message, catalog, escrowOptions);
    if (!checked.ok) {
      conflicts.push(externalEscrowStateConflict(checked, basePath));
    }
  });
  if (hasOwn(snapshot, "marketListings")) {
    const checked = auditMarketListingBook(snapshot.marketListings, catalog, escrowOptions);
    if (!checked.ok) {
      conflicts.push(externalEscrowStateConflict(checked, "marketListings"));
    }
  }
  scanObjectBucket("tradeOffers", (offer, basePath) => {
    if (!isRecord(offer)) {
      conflicts.push(conflict("equipment_external_container_invalid", "trade offer must be an object", {
        path: basePath,
        reason: "offer_not_object",
      }));
      return;
    }
    validateExternalSchema(offer, basePath, conflicts);
    validateNoUnknownEquipmentEnvelope(
      offer,
      basePath,
      [
        "tradeId", "fromAccountId", "toAccountId", "offerItems", "counterItems", "offerStoneCoins",
        "counterStoneCoins", "createdAt", "expiresAt", "schemaVersion",
      ],
      conflicts,
    );
    for (const field of ["offerItems", "counterItems"]) {
      if (hasOwn(offer, field)) {
        scanItemEntries(offer[field], `${basePath}.${field}`, catalog, bagCatalog, conflicts);
      }
    }
  });
  return conflicts.sort(compareConflicts);
}

function canonicalEnhancement(value, itemId, item) {
  if (itemMaxEnhancement(item) <= 0) {
    return {};
  }
  const raw = record(value);
  return {
    itemId,
    level: Math.max(0, integer(raw.level, 0)),
    history: Array.isArray(raw.history) ? clone(raw.history) : [],
  };
}

function canonicalWearCounters(value, itemId, item) {
  if (itemMaxDurability(item) <= 0) {
    return {};
  }
  const raw = record(value);
  return {
    itemId,
    attackCount: Math.max(0, integer(raw.attackCount, 0)),
    hitCount: Math.max(0, integer(raw.hitCount, 0)),
  };
}

function canonicalExpPillCharge(value, itemId, item, levelRuntime) {
  if (!item || item.expPill !== true) {
    return {};
  }
  const raw = record(value);
  const level = positiveInteger(raw.level, positiveInteger(item.expPillLevel, 1));
  return {
    itemId,
    level,
    exp: Math.max(0, integer(raw.exp, 0)),
    nextExp: positiveInteger(raw.nextExp, levelRuntime.expToNextLevel(level)),
  };
}

function rawInstanceCanonicalConflicts(profile, catalog, levelRuntime, wearRules) {
  const conflicts = [];
  for (const instanceId of Object.keys(record(profile.equipmentInstances)).sort()) {
    const instanceValue = profile.equipmentInstances[instanceId];
    if (!isRecord(instanceValue)) {
      continue;
    }
    const raw = instanceValue;
    const itemId = typeof raw.itemId === "string" ? raw.itemId : "";
    const item = catalog.itemById.get(itemId) || null;
    const requiredFields = [
      "schemaVersion",
      "instanceId",
      "itemId",
      "location",
      "slotId",
      "durability",
      "enhancement",
      "wearCounters",
      "expPillCharge",
      "source",
    ];
    const missingFields = requiredFields.filter((field) => !hasOwn(raw, field));
    if (missingFields.length > 0) {
      conflicts.push(conflict(
        "equipment_instance_state_noncanonical",
        "an existing equipment instance is missing canonical schema fields",
        {instanceId, itemId, fields: missingFields},
      ));
      continue;
    }
    const nonCanonicalCore = [];
    if (raw.schemaVersion !== 1) {
      nonCanonicalCore.push("schemaVersion");
    }
    if (typeof raw.instanceId !== "string" || raw.instanceId !== instanceId) {
      nonCanonicalCore.push("instanceId");
    }
    if (typeof raw.itemId !== "string" || raw.itemId === "" || raw.itemId !== raw.itemId.trim()) {
      nonCanonicalCore.push("itemId");
    }
    if (typeof raw.location !== "string" || raw.location !== raw.location.trim()) {
      nonCanonicalCore.push("location");
    }
    if (typeof raw.slotId !== "string" || raw.slotId !== raw.slotId.trim()) {
      nonCanonicalCore.push("slotId");
    }
    if (typeof raw.source !== "string") {
      nonCanonicalCore.push("source");
    }
    if (nonCanonicalCore.length > 0) {
      conflicts.push(conflict(
        "equipment_instance_state_noncanonical",
        "an existing equipment instance has non-canonical identity fields",
        {instanceId, itemId, fields: nonCanonicalCore},
      ));
      continue;
    }
    if (!item) {
      continue;
    }
    const enhancement = record(raw.enhancement);
    const wearCounters = record(raw.wearCounters);
    const expPillCharge = record(raw.expPillCharge);
    const nestedProblems = [];
    if (itemMaxEnhancement(item) > 0) {
      if (
        enhancement.itemId !== itemId
        || !hasOwn(enhancement, "level")
        || !hasOwn(enhancement, "history")
      ) {
        nestedProblems.push("enhancement");
      }
    } else if (Object.keys(enhancement).length > 0) {
      nestedProblems.push("enhancement");
    }
    if (itemMaxDurability(item) > 0) {
      if (
        wearCounters.itemId !== itemId
        || !hasOwn(wearCounters, "attackCount")
        || !hasOwn(wearCounters, "hitCount")
      ) {
        nestedProblems.push("wearCounters");
      }
    } else if (Object.keys(wearCounters).length > 0) {
      nestedProblems.push("wearCounters");
    }
    if (item.expPill === true) {
      if (
        expPillCharge.itemId !== itemId
        || !hasOwn(expPillCharge, "level")
        || !hasOwn(expPillCharge, "exp")
        || !hasOwn(expPillCharge, "nextExp")
      ) {
        nestedProblems.push("expPillCharge");
      }
    } else if (Object.keys(expPillCharge).length > 0) {
      nestedProblems.push("expPillCharge");
    }
    if (nestedProblems.length > 0) {
      conflicts.push(conflict(
        "equipment_instance_state_noncanonical",
        "an existing equipment instance has incomplete canonical nested state",
        {instanceId, itemId, fields: Array.from(new Set(nestedProblems)).sort()},
      ));
    }
    conflicts.push(...instanceCanonicalStateConflicts(raw, item, levelRuntime, wearRules));
  }
  return conflicts;
}

function instanceCanonicalStateConflicts(instance, item, levelRuntime, wearRules) {
  const conflicts = [];
  const itemId = String(instance.itemId || "");
  const instanceId = String(instance.instanceId || "");
  if (itemMaxDurability(item) === 0 && hasOwn(instance, "durability") && Number(instance.durability) !== 0) {
    conflicts.push(conflict("equipment_instance_state_noncanonical", "non-durable equipment has durability state", {
      instanceId,
      itemId,
      field: "durability",
    }));
  }
  if (itemMaxEnhancement(item) === 0 && Object.keys(record(instance.enhancement)).length > 0) {
    conflicts.push(conflict("equipment_instance_state_noncanonical", "non-enhanceable equipment has enhancement state", {
      instanceId,
      itemId,
      field: "enhancement",
    }));
  }
  if (itemMaxDurability(item) === 0 && Object.keys(record(instance.wearCounters)).length > 0) {
    conflicts.push(conflict("equipment_instance_state_noncanonical", "non-durable equipment has wear state", {
      instanceId,
      itemId,
      field: "wearCounters",
    }));
  }
  if (item.expPill !== true && Object.keys(record(instance.expPillCharge)).length > 0) {
    conflicts.push(conflict("equipment_instance_state_noncanonical", "ordinary equipment has experience-pill state", {
      instanceId,
      itemId,
      field: "expPillCharge",
    }));
  }
  if (item.expPill === true) {
    const charge = canonicalExpPillCharge(instance.expPillCharge, itemId, item, levelRuntime);
    const baseLevel = positiveInteger(item.expPillLevel, 1);
    const maxLevel = positiveInteger(levelRuntime.maxPlayerLevel, 140);
    const expectedNextExp = levelRuntime.expToNextLevel(charge.level);
    if (
      charge.level < baseLevel
      || charge.level > maxLevel
      || charge.nextExp !== expectedNextExp
      || (charge.level < maxLevel && charge.exp >= charge.nextExp)
      || (charge.level >= maxLevel && charge.exp !== 0)
    ) {
      conflicts.push(conflict("equipment_exp_pill_state_noncanonical", "experience-pill progress is not canonical", {
        instanceId,
        itemId,
        field: "expPillCharge",
        level: charge.level,
        exp: charge.exp,
        nextExp: charge.nextExp,
        expectedNextExp,
      }));
    }
  }
  if (itemMaxDurability(item) > 0) {
    const counters = canonicalWearCounters(instance.wearCounters, itemId, item);
    const isWeapon = WEAPON_SLOT_IDS.has(String(item.slot || ""));
    const activeField = isWeapon ? "attackCount" : "hitCount";
    const inactiveField = isWeapon ? "hitCount" : "attackCount";
    const threshold = positiveInteger(
      isWeapon ? wearRules.weaponAttacksPerDurability : wearRules.armorHitsPerDurability,
      isWeapon ? 100 : 10,
    );
    if (counters[activeField] >= threshold || counters[inactiveField] !== 0) {
      conflicts.push(conflict("equipment_wear_state_noncanonical", "equipment wear counters are not canonical remainders", {
        instanceId,
        itemId,
        field: "wearCounters",
        activeField,
        activeCount: counters[activeField],
        inactiveField,
        inactiveCount: counters[inactiveField],
        threshold,
      }));
    }
  }
  return conflicts;
}

function compatibilityConflicts(profile, instance, item, slotId, levelRuntime) {
  const conflicts = [];
  const itemId = String(instance.itemId || "");
  const instanceId = String(instance.instanceId || "");
  const compare = (field, compatibleValue, instanceValue) => {
    if (!isDeepStrictEqual(compatibleValue, instanceValue)) {
      conflicts.push(conflict(
        "equipment_compatibility_instance_conflict",
        "legacy equipment compatibility state disagrees with its canonical instance",
        {slotId, itemId, instanceId, field},
      ));
    }
  };
  const durability = record(profile.equipmentDurability);
  if (itemMaxDurability(item) > 0) {
    compare("equipmentDurability", hasOwn(durability, slotId) ? durability[slotId] : itemMaxDurability(item), hasOwn(instance, "durability")
      ? instance.durability
      : itemMaxDurability(item));
  }
  const enhancement = record(profile.equipmentEnhancement);
  if (itemMaxEnhancement(item) > 0) {
    compare(
      "equipmentEnhancement",
      canonicalEnhancement(hasOwn(enhancement, slotId) ? enhancement[slotId] : {}, itemId, item),
      canonicalEnhancement(instance.enhancement, itemId, item),
    );
  }
  const wearCounters = record(profile.equipmentWearCounters);
  if (itemMaxDurability(item) > 0) {
    compare(
      "equipmentWearCounters",
      canonicalWearCounters(hasOwn(wearCounters, slotId) ? wearCounters[slotId] : {}, itemId, item),
      canonicalWearCounters(instance.wearCounters, itemId, item),
    );
  }
  if (slotId === "exp_pill") {
    compare(
      "equipmentExpPillCharge",
      canonicalExpPillCharge(profile.equipmentExpPillCharge, itemId, item, levelRuntime),
      canonicalExpPillCharge(instance.expPillCharge, itemId, item, levelRuntime),
    );
  }
  return conflicts;
}

function equippedInstanceFromCompatibility(item, itemId, instanceId, slotId, profile, levelRuntime) {
  const instance = createFreshEquipmentInstance(
    item,
    itemId,
    instanceId,
    EQUIPMENT_PROFILE_MIGRATION_SOURCE,
    {expToNextLevel: levelRuntime.expToNextLevel},
  );
  instance.location = "equipped";
  instance.slotId = slotId;
  const durability = record(profile.equipmentDurability);
  if (hasOwn(durability, slotId)) {
    instance.durability = durability[slotId];
  }
  const enhancement = record(profile.equipmentEnhancement);
  if (hasOwn(enhancement, slotId)) {
    instance.enhancement = canonicalEnhancement(enhancement[slotId], itemId, item);
  }
  const wearCounters = record(profile.equipmentWearCounters);
  if (hasOwn(wearCounters, slotId)) {
    instance.wearCounters = canonicalWearCounters(wearCounters[slotId], itemId, item);
  }
  if (slotId === "exp_pill" && Object.keys(record(profile.equipmentExpPillCharge)).length > 0) {
    instance.expPillCharge = canonicalExpPillCharge(
      profile.equipmentExpPillCharge,
      itemId,
      item,
      levelRuntime,
    );
  }
  return instance;
}

function compareConflicts(left, right) {
  const leftKey = [left.path, left.slotId, left.itemId, left.instanceId, left.code]
    .map((value) => String(value || ""))
    .join("\u0000");
  const rightKey = [right.path, right.slotId, right.itemId, right.instanceId, right.code]
    .map((value) => String(value || ""))
    .join("\u0000");
  return leftKey < rightKey ? -1 : (leftKey > rightKey ? 1 : 0);
}

function sourceStateFailure(source, report, conflicts) {
  const sorted = conflicts.slice().sort(compareConflicts);
  return {
    ok: false,
    changed: false,
    profile: clone(source),
    conflicts: sorted,
    report: {...report, conflicts: sorted},
  };
}

function baseReport(profile, slotsVersion, state) {
  return {
    schemaVersion: 1,
    source: EQUIPMENT_PROFILE_MIGRATION_SOURCE,
    slotsVersionBefore: slotsVersion,
    slotsVersionAfter: EQUIPMENT_SLOTS_VERSION,
    assumedLegacySlotsVersion: !hasOwn(profile, "equipmentSlotsVersion"),
    createdBackpack: [],
    createdEquipped: [],
    createdMappings: [],
    nextSerialBefore: state && state.ok ? state.nextSerial : null,
    nextSerialAfter: state && state.ok ? state.nextSerial : null,
    existingInstancesPreserved: true,
    existingMappingsPreserved: true,
    conflicts: [],
  };
}

function migrateEquipmentProfileV2ToV3(profileValue, options = {}) {
  const source = clone(profileValue);
  const {catalog, bagCatalog, levelRuntime, wearRules} = dependencies(options);
  const slotsVersion = hasOwn(source, "equipmentSlotsVersion") ? Number(source.equipmentSlotsVersion) : 1;
  const state = readEquipmentInstanceState(source, catalog);
  const report = baseReport(source, slotsVersion, state);
  if (!state.ok) {
    return sourceStateFailure(source, report, [conflict(state.code, state.message, {
      ...Object.fromEntries(Object.entries(state).filter(([key]) => !["ok", "code", "message"].includes(key))),
    })]);
  }

  const backpack = validateBackpackAndCountEquipment(source, catalog, bagCatalog);
  const conflicts = [
    ...backpack.conflicts,
    ...profileExternalEquipmentConflicts(source, catalog, bagCatalog, levelRuntime, wearRules),
    ...rawInstanceCanonicalConflicts(source, catalog, levelRuntime, wearRules),
  ];
  const slots = record(source.equipmentSlots);
  const mappings = record(source.equipmentSlotInstanceIds);
  if (slotsVersion < 3) {
    for (const slotId of catalog.slotIds) {
      const itemId = String(slots[slotId] || "");
      if (itemId !== "" && Number(backpack.equipmentCounts.get(itemId) || 0) > 0) {
        conflicts.push(conflict(
          "equipment_legacy_backpack_ownership_ambiguous",
          "legacy slotsVersion cannot prove whether a same-item backpack template is an equipped mirror",
          {slotId, itemId, slotsVersion},
        ));
      }
    }
  }

  const mappedOwner = new Map();
  const equippedCreates = [];
  const mappingRepairs = [];
  for (const slotId of catalog.slotIds) {
    const itemId = String(slots[slotId] || "");
    const mappingId = String(mappings[slotId] || "");
    const candidates = Object.values(state.instances).filter((instance) => (
      instance.location === "equipped" && instance.slotId === slotId
    ));
    if (itemId === "") {
      if (mappingId !== "") {
        conflicts.push(conflict("equipment_empty_slot_mapping", "an empty equipment slot still has a mapping", {
          slotId,
          instanceId: mappingId,
        }));
      }
      for (const instance of candidates) {
        conflicts.push(conflict("equipment_orphan_equipped_instance", "an equipped instance has no slot template", {
          slotId,
          itemId: instance.itemId,
          instanceId: instance.instanceId,
        }));
      }
      continue;
    }
    const item = catalog.itemById.get(itemId) || null;
    if (!item || String(item.slot || "") !== slotId) {
      conflicts.push(conflict("equipment_slot_item_invalid", "equipment slot references an invalid item", {slotId, itemId}));
      continue;
    }
    if (candidates.length > 1) {
      conflicts.push(conflict("equipment_slot_instance_ambiguous", "multiple equipped instances claim one slot", {
        slotId,
        itemId,
        instanceIds: candidates.map((entry) => entry.instanceId).sort(),
      }));
      continue;
    }
    if (mappingId !== "") {
      const instance = state.instances[mappingId] || null;
      if (mappedOwner.has(mappingId)) {
        conflicts.push(conflict("equipment_duplicate_slot_mapping", "one equipment instance is mapped by multiple slots", {
          slotId,
          otherSlotId: mappedOwner.get(mappingId),
          instanceId: mappingId,
        }));
      } else {
        mappedOwner.set(mappingId, slotId);
      }
      if (
        !instance
        || instance.itemId !== itemId
        || instance.location !== "equipped"
        || instance.slotId !== slotId
        || candidates.length !== 1
        || candidates[0].instanceId !== mappingId
      ) {
        conflicts.push(conflict("equipment_slot_instance_mismatch", "slot, mapping, and equipment instance disagree", {
          slotId,
          itemId,
          instanceId: mappingId,
        }));
        continue;
      }
      conflicts.push(...compatibilityConflicts(source, instance, item, slotId, levelRuntime));
      continue;
    }
    if (candidates.length === 1) {
      const instance = candidates[0];
      if (instance.itemId !== itemId) {
        conflicts.push(conflict("equipment_slot_instance_mismatch", "unmapped equipped instance has the wrong item", {
          slotId,
          itemId,
          instanceId: instance.instanceId,
          instanceItemId: instance.itemId,
        }));
        continue;
      }
      conflicts.push(...compatibilityConflicts(source, instance, item, slotId, levelRuntime));
      mappingRepairs.push({slotId, itemId, instanceId: instance.instanceId});
      continue;
    }
    equippedCreates.push({slotId, itemId, item});
  }

  const backpackCreates = [];
  for (const itemId of Array.from(catalog.itemById.keys()).sort()) {
    const templateCount = Number(backpack.equipmentCounts.get(itemId) || 0);
    const existing = Object.values(state.instances).filter((instance) => (
      instance.location === "backpack" && instance.itemId === itemId
    ));
    if (existing.length > templateCount) {
      conflicts.push(conflict("equipment_backpack_instance_surplus", "backpack has more equipment instances than templates", {
        itemId,
        templateCount,
        instanceCount: existing.length,
        surplus: existing.length - templateCount,
        instanceIds: existing.map((entry) => entry.instanceId).sort(),
      }));
    } else if (existing.length < templateCount) {
      backpackCreates.push({itemId, item: catalog.itemById.get(itemId), count: templateCount - existing.length});
    }
  }
  if (conflicts.length > 0) {
    return sourceStateFailure(source, report, conflicts);
  }

  const candidate = clone(source);
  candidate.equipmentInstances = clone(record(source.equipmentInstances));
  candidate.equipmentSlotInstanceIds = clone(record(source.equipmentSlotInstanceIds));
  let nextSerial = state.nextSerial;
  const allocateInstanceId = () => {
    while (nextSerial <= MAX_EQUIPMENT_INSTANCE_SERIAL) {
      const instanceId = equipmentInstanceIdForSerial(nextSerial);
      nextSerial += 1;
      if (!hasOwn(candidate.equipmentInstances, instanceId)) {
        return instanceId;
      }
    }
    return "";
  };

  for (const repair of mappingRepairs) {
    candidate.equipmentSlotInstanceIds[repair.slotId] = repair.instanceId;
    report.createdMappings.push({...repair, reason: "unique_equipped_instance"});
  }
  for (const entry of equippedCreates) {
    const instanceId = allocateInstanceId();
    if (instanceId === "") {
      return sourceStateFailure(source, report, [conflict(
        "equipment_instance_serial_exhausted",
        "equipment instance serial is exhausted",
      )]);
    }
    const instance = equippedInstanceFromCompatibility(
      entry.item,
      entry.itemId,
      instanceId,
      entry.slotId,
      source,
      levelRuntime,
    );
    candidate.equipmentInstances[instanceId] = instance;
    candidate.equipmentSlotInstanceIds[entry.slotId] = instanceId;
    report.createdEquipped.push({slotId: entry.slotId, itemId: entry.itemId, instanceId});
    report.createdMappings.push({
      slotId: entry.slotId,
      itemId: entry.itemId,
      instanceId,
      reason: "created_equipped_instance",
    });
  }
  for (const entry of backpackCreates) {
    const instanceIds = [];
    for (let index = 0; index < entry.count; index += 1) {
      const instanceId = allocateInstanceId();
      if (instanceId === "") {
        return sourceStateFailure(source, report, [conflict(
          "equipment_instance_serial_exhausted",
          "equipment instance serial is exhausted",
          {itemId: entry.itemId, remaining: entry.count - index},
        )]);
      }
      candidate.equipmentInstances[instanceId] = createFreshEquipmentInstance(
        entry.item,
        entry.itemId,
        instanceId,
        EQUIPMENT_PROFILE_MIGRATION_SOURCE,
        {expToNextLevel: levelRuntime.expToNextLevel},
      );
      instanceIds.push(instanceId);
    }
    report.createdBackpack.push({itemId: entry.itemId, count: entry.count, instanceIds});
  }
  candidate.nextEquipmentInstanceSerial = nextSerial;
  candidate.equipmentSlotsVersion = EQUIPMENT_SLOTS_VERSION;
  report.nextSerialAfter = nextSerial;

  const existingInstancesPreserved = Object.entries(record(source.equipmentInstances)).every(([instanceId, instance]) => (
    hasOwn(candidate.equipmentInstances, instanceId)
    && isDeepStrictEqual(candidate.equipmentInstances[instanceId], instance)
  ));
  const existingMappingsPreserved = Object.entries(record(source.equipmentSlotInstanceIds)).every(([slotId, instanceId]) => (
    hasOwn(candidate.equipmentSlotInstanceIds, slotId)
    && isDeepStrictEqual(candidate.equipmentSlotInstanceIds[slotId], instanceId)
  ));
  report.existingInstancesPreserved = existingInstancesPreserved;
  report.existingMappingsPreserved = existingMappingsPreserved;
  if (!existingInstancesPreserved || !existingMappingsPreserved) {
    return sourceStateFailure(source, report, [conflict(
      "equipment_migration_existing_state_changed",
      "equipment migration changed or removed an existing instance or mapping",
      {existingInstancesPreserved, existingMappingsPreserved},
    )]);
  }

  const finalAudit = auditEquipmentProfileV3(candidate, {catalog, bagCatalog, levelRuntime, wearRules});
  if (!finalAudit.ok) {
    return sourceStateFailure(source, report, finalAudit.conflicts.map((entry) => conflict(
      `equipment_migration_final_${entry.code}`,
      "equipment migration candidate failed its final canonical audit",
      entry,
    )));
  }
  return {
    ok: true,
    changed: !isDeepStrictEqual(candidate, source),
    profile: candidate,
    conflicts: [],
    report: {...report, conflicts: [], finalAudit: finalAudit.report.finalAudit},
  };
}

function auditEquipmentProfileV3(profileValue, options = {}) {
  const source = clone(profileValue);
  const {catalog, bagCatalog, levelRuntime, wearRules} = dependencies(options);
  const state = readEquipmentInstanceState(source, catalog);
  const report = baseReport(
    source,
    hasOwn(source, "equipmentSlotsVersion") ? Number(source.equipmentSlotsVersion) : 1,
    state,
  );
  const conflicts = [];
  if (!state.ok) {
    conflicts.push(conflict(state.code, state.message, {
      ...Object.fromEntries(Object.entries(state).filter(([key]) => !["ok", "code", "message"].includes(key))),
    }));
    return sourceStateFailure(source, report, conflicts);
  }
  for (const field of ["equipmentInstances", "equipmentSlotInstanceIds"]) {
    if (!hasOwn(source, field) || !isRecord(source[field])) {
      conflicts.push(conflict(
        "equipment_v3_representation_missing",
        "version-3 profile is missing an explicit equipment representation container",
        {path: field},
      ));
    }
  }
  if (source.equipmentSlotsVersion !== EQUIPMENT_SLOTS_VERSION) {
    conflicts.push(conflict(
      "equipment_v3_slots_version_noncanonical",
      "version-3 equipmentSlotsVersion must be the exact current integer",
      {path: "equipmentSlotsVersion", actual: source.equipmentSlotsVersion, expected: EQUIPMENT_SLOTS_VERSION},
    ));
  }
  if (
    !hasOwn(source, "nextEquipmentInstanceSerial")
    || !Number.isSafeInteger(source.nextEquipmentInstanceSerial)
    || source.nextEquipmentInstanceSerial !== state.nextSerial
  ) {
    conflicts.push(conflict(
      "equipment_v3_serial_noncanonical",
      "version-3 nextEquipmentInstanceSerial must be the exact next safe serial",
      {
        path: "nextEquipmentInstanceSerial",
        actual: source.nextEquipmentInstanceSerial,
        expected: state.nextSerial,
      },
    ));
  }
  conflicts.push(...validateBackpackAndCountEquipment(source, catalog, bagCatalog).conflicts);
  conflicts.push(...profileExternalEquipmentConflicts(source, catalog, bagCatalog, levelRuntime, wearRules));
  conflicts.push(...rawInstanceCanonicalConflicts(source, catalog, levelRuntime, wearRules));
  const audit = auditEquipmentProfileState(source, catalog);
  if (!audit.ok) {
    conflicts.push(...audit.conflicts.map((entry) => conflict(
      `equipment_v3_${entry.code}`,
      "version-3 equipment profile failed its invariant audit",
      entry,
    )));
  }
  const slots = record(source.equipmentSlots);
  const mappings = record(source.equipmentSlotInstanceIds);
  for (const slotId of catalog.slotIds) {
    const itemId = String(slots[slotId] || "");
    const instanceId = String(mappings[slotId] || "");
    if (itemId === "" || instanceId === "" || !state.instances[instanceId]) {
      continue;
    }
    const item = catalog.itemById.get(itemId);
    conflicts.push(...compatibilityConflicts(source, state.instances[instanceId], item, slotId, levelRuntime));
  }
  if (conflicts.length > 0) {
    return sourceStateFailure(source, report, conflicts);
  }
  return {
    ok: true,
    changed: false,
    profile: source,
    conflicts: [],
    report: {...report, conflicts: [], finalAudit: audit.summary},
  };
}

module.exports = {
  EQUIPMENT_PROFILE_MIGRATION_SOURCE,
  auditEquipmentProfileV3,
  loadBagItemCatalog,
  migrateEquipmentProfileV2ToV3,
  snapshotExternalEquipmentConflicts,
};
