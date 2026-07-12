"use strict";

const {isDeepStrictEqual} = require("node:util");
const {
  validateEquipmentTransferEnvelope,
  validateEquipmentTransferEnvelopeBatch,
} = require("./equipment-transfer-envelope");

const BANK_PROFILE_SCHEMA_VERSION = 2;
const BANK_DEFAULT_TAB_COUNT = 6;
const BANK_DEFAULT_SLOTS_PER_TAB = 15;
const BANK_DEFAULT_UNLOCKED_TABS = 1;
const BANK_DEFAULT_STONE_COIN_LIMIT = 100000000;

const BANK_V1_ROOT_FIELDS = new Set([
  "stoneCoins",
  "coins",
  "items",
  "itemAmounts",
  "slots",
  "unlockedTabs",
  "tabs",
  "schemaVersion",
]);
const BANK_V2_ROOT_FIELDS = new Set([
  "stoneCoins",
  "items",
  "slots",
  "unlockedTabs",
  "schemaVersion",
]);
const BANK_ITEM_FIELDS = new Set(["itemId", "count"]);
const BANK_EQUIPMENT_SLOT_FIELDS = new Set(["itemId", "count", "equipmentEnvelopes"]);

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clone(value) {
  return structuredClone(value);
}

function fail(code, message, details = {}) {
  return {ok: false, code, message, ...details};
}

function positiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function bankConfig(options = {}) {
  const tabCount = positiveInteger(options.tabCount, BANK_DEFAULT_TAB_COUNT);
  const slotsPerTab = positiveInteger(options.slotsPerTab, BANK_DEFAULT_SLOTS_PER_TAB);
  return {
    tabCount,
    slotsPerTab,
    slotLimit: tabCount * slotsPerTab,
    defaultUnlockedTabs: Math.min(
      tabCount,
      positiveInteger(options.defaultUnlockedTabs, BANK_DEFAULT_UNLOCKED_TABS),
    ),
    stoneCoinLimit: positiveInteger(options.stoneCoinLimit, BANK_DEFAULT_STONE_COIN_LIMIT),
    itemById: typeof options.itemById === "function" ? options.itemById : () => null,
    isEquipmentItemId: typeof options.isEquipmentItemId === "function"
      ? options.isEquipmentItemId
      : (itemId) => Boolean(options.equipmentCatalog
        && options.equipmentCatalog.itemById instanceof Map
        && options.equipmentCatalog.itemById.has(itemId)),
    itemStackLimit: typeof options.itemStackLimit === "function"
      ? options.itemStackLimit
      : () => 1,
  };
}

function representationConflict(details = {}) {
  return fail(
    "bank_representation_conflict",
    "银行物品或石币的两份档案不一致，本次操作已取消；全部资产会原样保留，请联系GM处理。",
    details,
  );
}

function schemaFailure(status) {
  if (status === "future") {
    return fail(
      "bank_schema_future",
      "银行数据来自更高版本，本次操作已取消；石币和物品会原样保留，请联系GM处理。",
    );
  }
  return fail(
    "bank_schema_invalid",
    "银行数据版本无法识别，本次操作已取消；石币和物品会原样保留，请联系GM处理。",
  );
}

function itemUnknown(itemId) {
  return fail(
    "bank_item_unknown",
    "银行内有当前版本无法识别的物品，本次操作已取消；全部资产会原样保留，请联系GM处理。",
    {itemId},
  );
}

function legacyEquipmentUnsupported(itemId) {
  return fail(
    "bank_equipment_transfer_unsupported",
    "旧银行装备缺少实例信封，本次操作已取消；全部资产会原样保留，请联系GM处理。",
    {itemId},
  );
}

function schemaVersionFor(raw) {
  if (!Object.hasOwn(raw, "schemaVersion")) {
    return {ok: true, version: 1, legacy: true};
  }
  const version = raw.schemaVersion;
  if (!Number.isSafeInteger(version) || version < 1) {
    return schemaFailure("invalid");
  }
  if (version > BANK_PROFILE_SCHEMA_VERSION) {
    return schemaFailure("future");
  }
  return {ok: true, version, legacy: version < BANK_PROFILE_SCHEMA_VERSION};
}

function safeIntegerField(raw, primary, alias, minimum, maximum, fallback) {
  const fields = [primary, alias].filter((field) => Object.hasOwn(raw, field));
  for (const field of fields) {
    const value = raw[field];
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      return representationConflict({field});
    }
  }
  if (fields.length === 2 && raw[primary] !== raw[alias]) {
    return representationConflict({field: primary, alias});
  }
  return {ok: true, value: fields.length > 0 ? raw[fields[0]] : fallback};
}

function exactFields(value, allowedFields) {
  return Object.keys(value).every((key) => allowedFields.has(key));
}

function itemEntry(entry, config, options = {}) {
  if (!isRecord(entry) || !exactFields(entry, BANK_ITEM_FIELDS)) {
    return representationConflict({path: options.path || "items"});
  }
  const itemId = typeof entry.itemId === "string" ? entry.itemId : "";
  const count = entry.count ?? 0;
  if (itemId === "") {
    if (count !== 0 || Object.keys(entry).some((key) => !BANK_ITEM_FIELDS.has(key))) {
      return representationConflict({path: options.path || "items"});
    }
    return {ok: true, empty: true, itemId: "", count: 0};
  }
  if (itemId !== itemId.trim() || !config.itemById(itemId)) {
    return itemUnknown(itemId);
  }
  if (!Number.isSafeInteger(count) || count < 1) {
    return representationConflict({path: options.path || "items", itemId});
  }
  if (options.rejectEquipment === true && config.isEquipmentItemId(itemId)) {
    return legacyEquipmentUnsupported(itemId);
  }
  return {ok: true, empty: false, itemId, count};
}

function itemCounts(entries) {
  const counts = new Map();
  for (const entry of entries) {
    if (!entry || entry.empty || entry.itemId === "") {
      continue;
    }
    counts.set(entry.itemId, Number(counts.get(entry.itemId) || 0) + entry.count);
  }
  return counts;
}

function serializedCounts(counts) {
  return JSON.stringify(Array.from(counts.entries()).sort(([left], [right]) => left.localeCompare(right)));
}

function itemsFromSlots(slots) {
  const counts = new Map();
  for (const slot of slots) {
    const itemId = String(slot && slot.itemId || "");
    const count = Number(slot && slot.count || 0);
    if (itemId !== "" && Number.isSafeInteger(count) && count > 0) {
      counts.set(itemId, Number(counts.get(itemId) || 0) + count);
    }
  }
  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, count]) => ({itemId, count}));
}

function emptySlots(slotLimit) {
  return Array.from({length: slotLimit}, () => ({}));
}

function v1SlotsFromItems(items, config, unlockedSlots) {
  const slots = emptySlots(config.slotLimit);
  let slotIndex = 0;
  for (const item of items) {
    let remaining = item.count;
    const stackLimit = positiveInteger(config.itemStackLimit(item.itemId), 1);
    while (remaining > 0) {
      if (slotIndex >= unlockedSlots || slotIndex >= config.slotLimit) {
        return representationConflict({reason: "bank_capacity_exceeded"});
      }
      const count = Math.min(stackLimit, remaining);
      slots[slotIndex] = {itemId: item.itemId, count};
      remaining -= count;
      slotIndex += 1;
    }
  }
  return {ok: true, slots};
}

function readV1Bank(raw, config) {
  for (const field of ["slots", "items", "itemAmounts"]) {
    for (const value of Array.isArray(raw[field]) ? raw[field] : []) {
      if (!isRecord(value)) {
        continue;
      }
      const itemId = typeof value.itemId === "string" ? value.itemId.trim() : "";
      if (itemId !== "" && !config.itemById(itemId)) {
        return itemUnknown(itemId);
      }
      if (itemId !== "" && config.isEquipmentItemId(itemId)) {
        return legacyEquipmentUnsupported(itemId);
      }
    }
  }
  if (!exactFields(raw, BANK_V1_ROOT_FIELDS)) {
    return representationConflict({reason: "unknown_root_field"});
  }
  for (const field of ["slots", "items", "itemAmounts"]) {
    if (Object.hasOwn(raw, field) && !Array.isArray(raw[field])) {
      return representationConflict({field});
    }
  }
  const coins = safeIntegerField(raw, "stoneCoins", "coins", 0, config.stoneCoinLimit, 0);
  if (!coins.ok) {
    return coins;
  }
  const tabs = safeIntegerField(
    raw,
    "unlockedTabs",
    "tabs",
    config.defaultUnlockedTabs,
    config.tabCount,
    config.defaultUnlockedTabs,
  );
  if (!tabs.ok) {
    return tabs;
  }
  const unlockedSlots = tabs.value * config.slotsPerTab;
  const representations = [];
  for (const field of ["items", "itemAmounts"]) {
    if (!Array.isArray(raw[field])) {
      continue;
    }
    const entries = [];
    for (const [index, value] of raw[field].entries()) {
      const parsed = itemEntry(value, config, {path: `${field}[${index}]`, rejectEquipment: true});
      if (!parsed.ok) {
        return parsed;
      }
      if (!parsed.empty) {
        entries.push(parsed);
      }
    }
    representations.push({field, entries, counts: itemCounts(entries)});
  }
  if (representations.length === 2 && serializedCounts(representations[0].counts) !== serializedCounts(representations[1].counts)) {
    return representationConflict({reason: "legacy_item_alias_mismatch"});
  }

  let slots;
  if (Array.isArray(raw.slots) && raw.slots.length > 0) {
    if (raw.slots.length > config.slotLimit) {
      return representationConflict({reason: "slot_limit"});
    }
    slots = emptySlots(config.slotLimit);
    const parsedSlots = [];
    for (const [index, value] of raw.slots.entries()) {
      const parsed = itemEntry(value, config, {path: `slots[${index}]`, rejectEquipment: true});
      if (!parsed.ok) {
        return parsed;
      }
      if (!parsed.empty) {
        const stackLimit = positiveInteger(config.itemStackLimit(parsed.itemId), 1);
        if (parsed.count > stackLimit || index >= unlockedSlots) {
          return representationConflict({path: `slots[${index}]`});
        }
        slots[index] = {itemId: parsed.itemId, count: parsed.count};
        parsedSlots.push(parsed);
      }
    }
    const slotCounts = itemCounts(parsedSlots);
    if (representations.some((representation) => serializedCounts(representation.counts) !== serializedCounts(slotCounts))) {
      return representationConflict({reason: "legacy_slot_summary_mismatch"});
    }
  } else {
    const entries = representations.length > 0 ? representations[0].entries : [];
    const generated = v1SlotsFromItems(entries, config, unlockedSlots);
    if (!generated.ok) {
      return generated;
    }
    slots = generated.slots;
  }
  return {
    ok: true,
    changed: true,
    sourceSchemaVersion: 1,
    bank: {
      stoneCoins: coins.value,
      items: itemsFromSlots(slots),
      slots,
      unlockedTabs: tabs.value,
      schemaVersion: BANK_PROFILE_SCHEMA_VERSION,
    },
  };
}

function readV2Bank(raw, equipmentCatalog, config, envelopeOptions) {
  if (!exactFields(raw, BANK_V2_ROOT_FIELDS)) {
    return representationConflict({reason: "unknown_root_field"});
  }
  if (!Array.isArray(raw.items) || !Array.isArray(raw.slots) || raw.slots.length !== config.slotLimit) {
    return representationConflict({reason: "v2_container_shape"});
  }
  if (!Number.isSafeInteger(raw.stoneCoins) || raw.stoneCoins < 0 || raw.stoneCoins > config.stoneCoinLimit) {
    return representationConflict({field: "stoneCoins"});
  }
  if (
    !Number.isSafeInteger(raw.unlockedTabs)
    || raw.unlockedTabs < config.defaultUnlockedTabs
    || raw.unlockedTabs > config.tabCount
  ) {
    return representationConflict({field: "unlockedTabs"});
  }
  const itemSummaries = [];
  for (const [index, value] of raw.items.entries()) {
    const parsed = itemEntry(value, config, {path: `items[${index}]`});
    if (!parsed.ok) {
      return parsed;
    }
    if (!parsed.empty) {
      itemSummaries.push(parsed);
    }
  }
  const slots = emptySlots(config.slotLimit);
  const allEnvelopes = [];
  const parsedSlots = [];
  const unlockedSlots = raw.unlockedTabs * config.slotsPerTab;
  for (const [index, value] of raw.slots.entries()) {
    if (!isRecord(value)) {
      return representationConflict({path: `slots[${index}]`});
    }
    const itemId = typeof value.itemId === "string" ? value.itemId : "";
    const count = value.count ?? 0;
    if (itemId === "") {
      if (count !== 0 || Object.keys(value).some((key) => !BANK_ITEM_FIELDS.has(key))) {
        return representationConflict({path: `slots[${index}]`});
      }
      continue;
    }
    if (itemId !== itemId.trim() || !config.itemById(itemId)) {
      return itemUnknown(itemId);
    }
    if (!Number.isSafeInteger(count) || count < 1 || count > positiveInteger(config.itemStackLimit(itemId), 1) || index >= unlockedSlots) {
      return representationConflict({path: `slots[${index}]`, itemId});
    }
    if (config.isEquipmentItemId(itemId)) {
      if (!exactFields(value, BANK_EQUIPMENT_SLOT_FIELDS) || !Array.isArray(value.equipmentEnvelopes)) {
        return fail(
          "bank_equipment_envelope_required",
          "银行装备缺少完整实例信封，本次操作已取消；全部资产会原样保留，请联系GM处理。",
          {bankSlotIndex: index, itemId},
        );
      }
      if (value.equipmentEnvelopes.length !== count) {
        return representationConflict({path: `slots[${index}].equipmentEnvelopes`, itemId});
      }
      const validated = validateEquipmentTransferEnvelopeBatch(value.equipmentEnvelopes, equipmentCatalog, envelopeOptions);
      if (!validated.ok) {
        return {...validated, bankSlotIndex: index};
      }
      if (validated.envelopes.some((envelope) => envelope.itemId !== itemId)) {
        return representationConflict({path: `slots[${index}].equipmentEnvelopes`, itemId});
      }
      slots[index] = {itemId, count, equipmentEnvelopes: validated.envelopes};
      allEnvelopes.push(...validated.envelopes);
    } else {
      if (!exactFields(value, BANK_ITEM_FIELDS)) {
        return representationConflict({path: `slots[${index}]`, itemId});
      }
      slots[index] = {itemId, count};
    }
    parsedSlots.push({itemId, count});
  }
  const validatedBatch = validateEquipmentTransferEnvelopeBatch(allEnvelopes, equipmentCatalog, envelopeOptions);
  if (!validatedBatch.ok) {
    return validatedBatch;
  }
  if (serializedCounts(itemCounts(itemSummaries)) !== serializedCounts(itemCounts(parsedSlots))) {
    return representationConflict({reason: "v2_slot_summary_mismatch"});
  }
  const bank = {
    stoneCoins: raw.stoneCoins,
    items: itemsFromSlots(slots),
    slots,
    unlockedTabs: raw.unlockedTabs,
    schemaVersion: BANK_PROFILE_SCHEMA_VERSION,
  };
  return {
    ok: true,
    changed: !isDeepStrictEqual(raw, bank),
    sourceSchemaVersion: BANK_PROFILE_SCHEMA_VERSION,
    bank,
  };
}

function readBankProfileState(value, equipmentCatalog, options = {}) {
  if (value !== undefined && !isRecord(value)) {
    return schemaFailure("invalid");
  }
  const raw = value === undefined ? {} : value;
  const schema = schemaVersionFor(raw);
  if (!schema.ok) {
    return schema;
  }
  const config = bankConfig({...options, equipmentCatalog});
  if (schema.version === 1) {
    return readV1Bank(raw, config);
  }
  return readV2Bank(raw, equipmentCatalog, config, options.equipmentTransferOptions || {});
}

function writeCanonicalBank(bank, equipmentCatalog, options) {
  const checked = readBankProfileState(bank, equipmentCatalog, options);
  if (!checked.ok) {
    return checked;
  }
  return {ok: true, bank: checked.bank};
}

function addOrdinaryItemToBank(bankValue, itemIdValue, countValue, preferredIndex, equipmentCatalog, options = {}) {
  const current = readBankProfileState(bankValue, equipmentCatalog, options);
  if (!current.ok) {
    return current;
  }
  const config = bankConfig({...options, equipmentCatalog});
  const itemId = String(itemIdValue || "").trim();
  const count = Number(countValue);
  if (!config.itemById(itemId)) {
    return itemUnknown(itemId);
  }
  if (config.isEquipmentItemId(itemId) || !Number.isSafeInteger(count) || count < 1) {
    return representationConflict({itemId, count});
  }
  const slots = clone(current.bank.slots);
  const unlockedSlots = current.bank.unlockedTabs * config.slotsPerTab;
  const stackLimit = positiveInteger(config.itemStackLimit(itemId), 1);
  let remaining = count;
  const targetIndex = Number(preferredIndex);
  if (targetIndex !== -1) {
    if (!Number.isSafeInteger(targetIndex) || targetIndex < 0 || targetIndex >= unlockedSlots) {
      return fail("bank_storage_full", "银行格子不足，请先整理或解锁更多银行页。");
    }
    const target = slots[targetIndex];
    const targetItemId = String(target && target.itemId || "");
    if (targetItemId !== "" && targetItemId !== itemId) {
      return fail("bank_storage_full", "银行格子不足，请先整理或解锁更多银行页。");
    }
    const currentCount = Number(target && target.count || 0);
    const moved = Math.min(remaining, Math.max(0, stackLimit - currentCount));
    if (moved > 0) {
      slots[targetIndex] = {itemId, count: currentCount + moved};
      remaining -= moved;
    }
  }
  for (let index = 0; index < unlockedSlots && remaining > 0; index += 1) {
    if (String(slots[index] && slots[index].itemId || "") !== itemId) {
      continue;
    }
    const currentCount = Number(slots[index].count);
    const moved = Math.min(remaining, Math.max(0, stackLimit - currentCount));
    if (moved > 0) {
      slots[index] = {itemId, count: currentCount + moved};
      remaining -= moved;
    }
  }
  for (let index = 0; index < unlockedSlots && remaining > 0; index += 1) {
    if (String(slots[index] && slots[index].itemId || "") !== "") {
      continue;
    }
    const moved = Math.min(remaining, stackLimit);
    slots[index] = {itemId, count: moved};
    remaining -= moved;
  }
  if (remaining > 0) {
    return fail("bank_storage_full", "银行格子不足，请先整理或解锁更多银行页。", {lostCount: remaining});
  }
  const bank = {...current.bank, slots, items: itemsFromSlots(slots)};
  const written = writeCanonicalBank(bank, equipmentCatalog, options);
  return written.ok ? {...written, bankSlotIndex: targetIndex} : written;
}

function removeOrdinaryItemFromBank(bankValue, itemIdValue, countValue, sourceIndex, equipmentCatalog, options = {}) {
  const current = readBankProfileState(bankValue, equipmentCatalog, options);
  if (!current.ok) {
    return current;
  }
  const config = bankConfig({...options, equipmentCatalog});
  const itemId = String(itemIdValue || "").trim();
  const count = Number(countValue);
  if (!config.itemById(itemId)) {
    return itemUnknown(itemId);
  }
  if (config.isEquipmentItemId(itemId) || !Number.isSafeInteger(count) || count < 1) {
    return representationConflict({itemId, count});
  }
  const slots = clone(current.bank.slots);
  let remaining = count;
  const bankSlotIndex = Number(sourceIndex);
  if (bankSlotIndex !== -1) {
    if (!Number.isSafeInteger(bankSlotIndex) || bankSlotIndex < 0 || bankSlotIndex >= slots.length) {
      return fail("bank_item_not_enough", "银行物品数量不够，无法取出。", {itemId});
    }
    const slot = slots[bankSlotIndex];
    if (String(slot && slot.itemId || "") !== itemId || Number(slot.count || 0) < count) {
      return fail("bank_item_not_enough", "银行物品数量不够，无法取出。", {itemId});
    }
    const nextCount = Number(slot.count) - count;
    slots[bankSlotIndex] = nextCount > 0 ? {itemId, count: nextCount} : {};
    remaining = 0;
  } else {
    for (let index = 0; index < slots.length && remaining > 0; index += 1) {
      const slot = slots[index];
      if (String(slot && slot.itemId || "") !== itemId || config.isEquipmentItemId(itemId)) {
        continue;
      }
      const consumed = Math.min(remaining, Number(slot.count));
      const nextCount = Number(slot.count) - consumed;
      slots[index] = nextCount > 0 ? {itemId, count: nextCount} : {};
      remaining -= consumed;
    }
  }
  if (remaining > 0) {
    return fail("bank_item_not_enough", "银行物品数量不够，无法取出。", {itemId, missingCount: remaining});
  }
  const bank = {...current.bank, slots, items: itemsFromSlots(slots)};
  return writeCanonicalBank(bank, equipmentCatalog, options);
}

function addEquipmentEnvelopeToBank(bankValue, envelopeValue, preferredIndex, equipmentCatalog, options = {}) {
  const current = readBankProfileState(bankValue, equipmentCatalog, options);
  if (!current.ok) {
    return current;
  }
  const validated = validateEquipmentTransferEnvelope(
    envelopeValue,
    equipmentCatalog,
    options.equipmentTransferOptions || {},
  );
  if (!validated.ok) {
    return validated;
  }
  const config = bankConfig({...options, equipmentCatalog});
  const slots = clone(current.bank.slots);
  const unlockedSlots = current.bank.unlockedTabs * config.slotsPerTab;
  const stackLimit = positiveInteger(config.itemStackLimit(validated.envelope.itemId), 1);
  const requestedIndex = Number(preferredIndex);
  let bankSlotIndex = -1;
  if (requestedIndex !== -1) {
    if (!Number.isSafeInteger(requestedIndex) || requestedIndex < 0 || requestedIndex >= unlockedSlots) {
      return fail("bank_storage_full", "银行格子不足，请先整理或解锁更多银行页。");
    }
    const slot = slots[requestedIndex];
    const slotItemId = String(slot && slot.itemId || "");
    if (slotItemId !== "" && slotItemId !== validated.envelope.itemId) {
      return fail("bank_storage_full", "银行格子不足，请先整理或解锁更多银行页。");
    }
    const envelopes = slotItemId === "" ? [] : slot.equipmentEnvelopes;
    if (!Array.isArray(envelopes) || envelopes.length >= stackLimit) {
      return fail("bank_storage_full", "银行格子不足，请先整理或解锁更多银行页。");
    }
    bankSlotIndex = requestedIndex;
  } else {
    bankSlotIndex = slots.findIndex((slot, index) => (
      index < unlockedSlots
      && String(slot && slot.itemId || "") === validated.envelope.itemId
      && Array.isArray(slot.equipmentEnvelopes)
      && slot.equipmentEnvelopes.length < stackLimit
    ));
    if (bankSlotIndex < 0) {
      bankSlotIndex = slots.findIndex((slot, index) => (
        index < unlockedSlots && String(slot && slot.itemId || "") === ""
      ));
    }
  }
  if (bankSlotIndex < 0) {
    return fail("bank_storage_full", "银行格子不足，请先整理或解锁更多银行页。");
  }
  const existing = slots[bankSlotIndex];
  const envelopes = String(existing && existing.itemId || "") === ""
    ? []
    : clone(existing.equipmentEnvelopes);
  envelopes.push(validated.envelope);
  slots[bankSlotIndex] = {
    itemId: validated.envelope.itemId,
    count: envelopes.length,
    equipmentEnvelopes: envelopes,
  };
  const bank = {...current.bank, slots, items: itemsFromSlots(slots)};
  const written = writeCanonicalBank(bank, equipmentCatalog, options);
  return written.ok ? {...written, bankSlotIndex, envelope: validated.envelope} : written;
}

function removeEquipmentEnvelopeFromBank(
  bankValue,
  envelopeIdValue,
  bankSlotIndexValue,
  expectedItemIdValue,
  equipmentCatalog,
  options = {},
) {
  const current = readBankProfileState(bankValue, equipmentCatalog, options);
  if (!current.ok) {
    return current;
  }
  const envelopeId = String(envelopeIdValue || "").trim();
  const bankSlotIndex = Number(bankSlotIndexValue);
  const expectedItemId = String(expectedItemIdValue || "").trim();
  if (envelopeId === "" || !Number.isSafeInteger(bankSlotIndex) || bankSlotIndex < 0 || bankSlotIndex >= current.bank.slots.length) {
    return fail("bank_equipment_selection_stale", "银行装备选择已经变化，请刷新后重新选择。");
  }
  const slot = current.bank.slots[bankSlotIndex];
  const slotItemId = String(slot && slot.itemId || "");
  if (
    slotItemId === ""
    || (expectedItemId !== "" && slotItemId !== expectedItemId)
    || !Array.isArray(slot.equipmentEnvelopes)
  ) {
    return fail("bank_equipment_selection_stale", "银行装备选择已经变化，请刷新后重新选择。", {
      envelopeId,
      bankSlotIndex,
    });
  }
  const envelopeIndex = slot.equipmentEnvelopes.findIndex((entry) => entry.envelopeId === envelopeId);
  if (envelopeIndex < 0) {
    return fail("bank_equipment_selection_stale", "银行装备选择已经变化，请刷新后重新选择。", {
      envelopeId,
      bankSlotIndex,
    });
  }
  const envelopes = clone(slot.equipmentEnvelopes);
  const [envelope] = envelopes.splice(envelopeIndex, 1);
  const validated = validateEquipmentTransferEnvelope(
    envelope,
    equipmentCatalog,
    options.equipmentTransferOptions || {},
  );
  if (!validated.ok) {
    return validated;
  }
  const slots = clone(current.bank.slots);
  slots[bankSlotIndex] = envelopes.length > 0
    ? {itemId: slotItemId, count: envelopes.length, equipmentEnvelopes: envelopes}
    : {};
  const bank = {...current.bank, slots, items: itemsFromSlots(slots)};
  const written = writeCanonicalBank(bank, equipmentCatalog, options);
  return written.ok ? {...written, bankSlotIndex, envelope: validated.envelope} : written;
}

module.exports = {
  BANK_PROFILE_SCHEMA_VERSION,
  addEquipmentEnvelopeToBank,
  addOrdinaryItemToBank,
  readBankProfileState,
  removeEquipmentEnvelopeFromBank,
  removeOrdinaryItemFromBank,
};
