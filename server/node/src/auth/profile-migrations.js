"use strict";

const crypto = require("node:crypto");
const {
  auditEquipmentProfileV3,
  migrateEquipmentProfileV2ToV3,
  snapshotExternalEquipmentConflicts,
} = require("./equipment-profile-migration");

const CURRENT_PROFILE_SCHEMA_VERSION = 3;
const LEGACY_PROFILE_SCHEMA_VERSION = 1;
const PROFILE_MIGRATION_V1_TO_V2 = "profile_v1_to_v2";
const PROFILE_MIGRATION_V2_TO_V3 = "profile_v2_to_v3_equipment_instances";
const EQUIPMENT_MIGRATION_FIELDS = Object.freeze([
  "equipmentInstances",
  "equipmentSlotInstanceIds",
  "nextEquipmentInstanceSerial",
  "equipmentSlotsVersion",
]);

function isRecord(value) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.prototype.toString.call(value) === "[object Object]"
  );
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function deepClone(value) {
  return structuredClone(value);
}

function compareCanonicalStrings(left, right) {
  return left < right ? -1 : (left > right ? 1 : 0);
}

function canonicalValue(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      return {"$type": "number", value: "NaN"};
    }
    if (value === Infinity) {
      return {"$type": "number", value: "Infinity"};
    }
    if (value === -Infinity) {
      return {"$type": "number", value: "-Infinity"};
    }
    if (Object.is(value, -0)) {
      return {"$type": "number", value: "-0"};
    }
    return value;
  }
  if (typeof value === "undefined") {
    return {"$type": "undefined"};
  }
  if (typeof value === "bigint") {
    return {"$type": "bigint", value: value.toString()};
  }
  if (typeof value === "symbol") {
    return {"$type": "symbol", value: String(value.description || "")};
  }
  if (typeof value === "function") {
    return {"$type": "function", value: String(value.name || "")};
  }
  if (ancestors.has(value)) {
    throw new TypeError("stable digest does not accept cyclic values");
  }
  ancestors.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map((entry) => canonicalValue(entry, ancestors));
  } else if (value instanceof Date) {
    result = {"$type": "date", value: value.toISOString()};
  } else if (value instanceof Map) {
    const entries = Array.from(value.entries()).map(([key, entry]) => ([
      canonicalValue(key, ancestors),
      canonicalValue(entry, ancestors),
    ]));
    entries.sort((left, right) => compareCanonicalStrings(JSON.stringify(left[0]), JSON.stringify(right[0])));
    result = {"$type": "map", entries};
  } else if (value instanceof Set) {
    const entries = Array.from(value.values()).map((entry) => canonicalValue(entry, ancestors));
    entries.sort((left, right) => compareCanonicalStrings(JSON.stringify(left), JSON.stringify(right)));
    result = {"$type": "set", entries};
  } else {
    result = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalValue(value[key], ancestors);
    }
  }
  ancestors.delete(value);
  return result;
}

function stableDigest(value) {
  const canonical = JSON.stringify(canonicalValue(value));
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function sortedCountObject(value) {
  const result = {};
  for (const key of Object.keys(value || {}).sort()) {
    result[key] = value[key];
  }
  return result;
}

function itemCountsFromEntries(value) {
  const result = {};
  for (const entry of Array.isArray(value) ? value : []) {
    if (!isRecord(entry)) {
      continue;
    }
    const itemId = String(entry.itemId || entry.id || "").trim();
    const numericCount = Number(entry.count ?? entry.amount ?? 0);
    const count = Number.isFinite(numericCount) ? Math.max(0, Math.trunc(numericCount)) : 0;
    if (itemId !== "" && count > 0) {
      result[itemId] = (result[itemId] || 0) + count;
    }
  }
  return sortedCountObject(result);
}

function bankEquipmentEnvelopeSummary(bankValue) {
  const bank = isRecord(bankValue) ? bankValue : {};
  const itemCounts = {};
  const envelopeIds = new Set();
  let envelopeCount = 0;
  for (const slot of Array.isArray(bank.slots) ? bank.slots : []) {
    if (!isRecord(slot) || !Array.isArray(slot.equipmentEnvelopes)) {
      continue;
    }
    const slotItemId = String(slot.itemId || "").trim() || "<missing>";
    for (const envelope of slot.equipmentEnvelopes) {
      if (!isRecord(envelope)) {
        continue;
      }
      envelopeCount += 1;
      const itemId = String(envelope.itemId || "").trim() || slotItemId;
      itemCounts[itemId] = (itemCounts[itemId] || 0) + 1;
      const envelopeId = String(envelope.envelopeId || "").trim();
      if (envelopeId !== "") {
        envelopeIds.add(envelopeId);
      }
    }
  }
  return {
    envelopeCount,
    uniqueEnvelopeIdCount: envelopeIds.size,
    itemCounts: sortedCountObject(itemCounts),
    rawDigest: stableDigest((Array.isArray(bank.slots) ? bank.slots : []).map((slot) => (
      isRecord(slot) ? slot.equipmentEnvelopes : undefined
    ))),
  };
}

function petReferences(profile) {
  const result = [];
  const appendPets = (value, prefix) => {
    for (const [index, pet] of (Array.isArray(value) ? value : []).entries()) {
      if (isRecord(pet)) {
        result.push({path: `${prefix}[${index}]`, pet});
      }
    }
  };
  appendPets(profile.petInstances, "petInstances");
  appendPets(profile.pets, "pets");
  for (const [index, drop] of (Array.isArray(profile.groundPetDrops) ? profile.groundPetDrops : []).entries()) {
    if (isRecord(drop) && isRecord(drop.pet)) {
      result.push({path: `groundPetDrops[${index}].pet`, pet: drop.pet});
    }
  }
  for (const [index, partner] of (Array.isArray(profile.trainingPartners) ? profile.trainingPartners : []).entries()) {
    if (isRecord(partner) && isRecord(partner.pet)) {
      result.push({path: `trainingPartners[${index}].pet`, pet: partner.pet});
    }
  }
  return result;
}

function profileContentDigestExcludingSchemaVersion(profile) {
  if (!isRecord(profile)) {
    return stableDigest(profile);
  }
  const content = deepClone(profile);
  delete content.schemaVersion;
  return stableDigest(content);
}

function profileContentDigestExcludingEquipmentMigrationFields(profile) {
  if (!isRecord(profile)) {
    return stableDigest(profile);
  }
  const content = deepClone(profile);
  delete content.schemaVersion;
  for (const field of EQUIPMENT_MIGRATION_FIELDS) {
    delete content[field];
  }
  return stableDigest(content);
}

function profileAssetSummary(profileValue) {
  if (!isRecord(profileValue)) {
    const invalid = {
      validProfileRoot: false,
      rootDigest: stableDigest(profileValue),
    };
    return {...invalid, digest: stableDigest(invalid)};
  }
  const profile = profileValue;
  const bank = isRecord(profile.bank) ? profile.bank : {};
  const bankEquipmentEnvelopes = bankEquipmentEnvelopeSummary(bank);
  const references = petReferences(profile);
  const petFormCounts = {};
  const petStateCounts = {};
  const petIdentities = new Set();
  for (const {pet} of references) {
    const identity = String(pet.instanceId || pet.petId || pet.id || "").trim();
    const formId = String(pet.formId || pet.templateId || pet.speciesId || "").trim() || "<missing>";
    const state = String(pet.state || pet.status || pet.battleState || "").trim() || "<missing>";
    if (identity !== "") {
      petIdentities.add(identity);
    }
    petFormCounts[formId] = (petFormCounts[formId] || 0) + 1;
    petStateCounts[state] = (petStateCounts[state] || 0) + 1;
  }

  const instances = isRecord(profile.equipmentInstances) ? profile.equipmentInstances : {};
  const equipmentSlots = isRecord(profile.equipmentSlots) ? profile.equipmentSlots : {};
  const equippedItemCounts = {};
  for (const itemIdValue of Object.values(equipmentSlots)) {
    const itemId = String(itemIdValue || "").trim();
    if (itemId !== "") {
      equippedItemCounts[itemId] = (equippedItemCounts[itemId] || 0) + 1;
    }
  }
  const equipmentItemCounts = {};
  const equipmentLocationCounts = {};
  for (const rawInstance of Object.values(instances)) {
    if (!isRecord(rawInstance)) {
      continue;
    }
    const itemId = String(rawInstance.itemId || "").trim() || "<missing>";
    const location = String(rawInstance.location || "").trim() || "<missing>";
    equipmentItemCounts[itemId] = (equipmentItemCounts[itemId] || 0) + 1;
    equipmentLocationCounts[location] = (equipmentLocationCounts[location] || 0) + 1;
  }

  const core = {
    validProfileRoot: true,
    currencies: {
      stoneCoins: hasOwn(profile, "stoneCoins") ? profile.stoneCoins : null,
      legacyCoins: hasOwn(profile, "coins") ? profile.coins : null,
      diamonds: hasOwn(profile, "diamonds") ? profile.diamonds : null,
      bankStoneCoins: hasOwn(bank, "stoneCoins") ? bank.stoneCoins : null,
    },
    backpack: {
      slotCount: Array.isArray(profile.backpackSlots) ? profile.backpackSlots.length : 0,
      extraSlots: hasOwn(profile, "backpackExtraSlots") ? profile.backpackExtraSlots : null,
      itemCounts: itemCountsFromEntries(profile.backpackSlots),
      rawDigest: stableDigest(profile.backpackSlots),
      captureToolsDigest: stableDigest(profile.captureTools),
    },
    bank: {
      slotCount: Array.isArray(bank.slots) ? bank.slots.length : 0,
      unlockedTabs: hasOwn(bank, "unlockedTabs") ? bank.unlockedTabs : null,
      slotItemCounts: itemCountsFromEntries(bank.slots),
      legacyItemCounts: itemCountsFromEntries(bank.items),
      equipmentEnvelopeCount: bankEquipmentEnvelopes.envelopeCount,
      uniqueEquipmentEnvelopeIdCount: bankEquipmentEnvelopes.uniqueEnvelopeIdCount,
      equipmentEnvelopeItemCounts: bankEquipmentEnvelopes.itemCounts,
      equipmentEnvelopeDigest: bankEquipmentEnvelopes.rawDigest,
      rawDigest: stableDigest(bank),
    },
    pets: {
      referenceCount: references.length,
      uniqueIdentityCount: petIdentities.size,
      formCounts: sortedCountObject(petFormCounts),
      stateCounts: sortedCountObject(petStateCounts),
      referenceDigest: stableDigest(references),
    },
    equipment: {
      equippedSlotCount: Object.keys(equipmentSlots).length,
      equippedItemCounts: sortedCountObject(equippedItemCounts),
      instanceCount: Object.keys(instances).length,
      slotMappingCount: Object.keys(isRecord(profile.equipmentSlotInstanceIds) ? profile.equipmentSlotInstanceIds : {}).length,
      instanceItemCounts: sortedCountObject(equipmentItemCounts),
      instanceLocationCounts: sortedCountObject(equipmentLocationCounts),
      slotsDigest: stableDigest(profile.equipmentSlots),
      instancesDigest: stableDigest(profile.equipmentInstances),
      slotMappingsDigest: stableDigest(profile.equipmentSlotInstanceIds),
      compatibilityDigest: stableDigest({
        equipmentDurability: profile.equipmentDurability,
        equipmentEnhancement: profile.equipmentEnhancement,
        equipmentWearCounters: profile.equipmentWearCounters,
        equipmentExpPillCharge: profile.equipmentExpPillCharge,
      }),
    },
    contentDigestExcludingSchemaVersion: profileContentDigestExcludingSchemaVersion(profile),
  };
  const assetFacts = {
    currencies: core.currencies,
    backpack: {
      slotCount: core.backpack.slotCount,
      extraSlots: core.backpack.extraSlots,
      itemCounts: core.backpack.itemCounts,
    },
    bank: {
      slotCount: core.bank.slotCount,
      unlockedTabs: core.bank.unlockedTabs,
      slotItemCounts: core.bank.slotItemCounts,
      legacyItemCounts: core.bank.legacyItemCounts,
      equipmentEnvelopeCount: core.bank.equipmentEnvelopeCount,
      uniqueEquipmentEnvelopeIdCount: core.bank.uniqueEquipmentEnvelopeIdCount,
      equipmentEnvelopeItemCounts: core.bank.equipmentEnvelopeItemCounts,
    },
    pets: {
      referenceCount: core.pets.referenceCount,
      uniqueIdentityCount: core.pets.uniqueIdentityCount,
      formCounts: core.pets.formCounts,
      stateCounts: core.pets.stateCounts,
      referenceDigest: core.pets.referenceDigest,
    },
    equipment: {
      equippedSlotCount: core.equipment.equippedSlotCount,
      equippedItemCounts: core.equipment.equippedItemCounts,
    },
  };
  return {
    ...core,
    digest: stableDigest(assetFacts),
    representationDigest: stableDigest({
      backpackRaw: core.backpack.rawDigest,
      bankRaw: core.bank.rawDigest,
      equipment: core.equipment,
    }),
  };
}

function profileVersionResult(profile) {
  if (!isRecord(profile)) {
    return {
      ok: false,
      version: null,
      assumedLegacy: false,
      errors: [{code: "profile_root_invalid", message: "profile must be an object"}],
      warnings: [],
    };
  }
  if (!hasOwn(profile, "schemaVersion")) {
    return {
      ok: true,
      version: LEGACY_PROFILE_SCHEMA_VERSION,
      assumedLegacy: true,
      errors: [],
      warnings: [{
        code: "profile_schema_version_missing_assumed_v1",
        message: "missing profile schemaVersion is treated as legacy version 1",
      }],
    };
  }
  if (!Number.isInteger(profile.schemaVersion) || profile.schemaVersion < LEGACY_PROFILE_SCHEMA_VERSION) {
    return {
      ok: false,
      version: profile.schemaVersion,
      assumedLegacy: false,
      errors: [{code: "profile_schema_invalid", message: "profile schemaVersion must be a positive integer"}],
      warnings: [],
    };
  }
  if (profile.schemaVersion > CURRENT_PROFILE_SCHEMA_VERSION) {
    return {
      ok: false,
      version: profile.schemaVersion,
      assumedLegacy: false,
      errors: [{
        code: "profile_schema_too_new",
        message: `profile schemaVersion ${profile.schemaVersion} is newer than supported version ${CURRENT_PROFILE_SCHEMA_VERSION}`,
      }],
      warnings: [],
    };
  }
  if (![1, 2, CURRENT_PROFILE_SCHEMA_VERSION].includes(profile.schemaVersion)) {
    return {
      ok: false,
      version: profile.schemaVersion,
      assumedLegacy: false,
      errors: [{code: "profile_schema_unsupported", message: `unsupported profile schemaVersion ${profile.schemaVersion}`}],
      warnings: [],
    };
  }
  return {
    ok: true,
    version: profile.schemaVersion,
    assumedLegacy: false,
    errors: [],
    warnings: [],
  };
}

function migrateProfile(profileValue) {
  const source = deepClone(profileValue);
  const beforeDigest = stableDigest(source);
  const beforeAssets = profileAssetSummary(source);
  const version = profileVersionResult(source);
  const failure = (errors, steps = [], candidate = source) => {
    const candidateAssets = profileAssetSummary(candidate);
    const planDigest = stableDigest({
      fromVersion: version.version,
      toVersion: version.version,
      beforeDigest,
      candidateDigest: stableDigest(candidate),
      steps: steps.map((step) => ({
        id: step.id,
        fromVersion: step.fromVersion,
        toVersion: step.toVersion,
        ok: step.ok !== false,
      })),
      errors: errors.map((error) => ({
        code: error.code,
        path: error.path || "",
        slotId: error.slotId || "",
        itemId: error.itemId || "",
        instanceId: error.instanceId || "",
      })),
    });
    return {
      ok: false,
      applySafe: false,
      changed: false,
      wouldChange: stableDigest(candidate) !== beforeDigest,
      profile: deepClone(source),
      fromVersion: version.version,
      toVersion: version.version,
      assumedLegacy: version.assumedLegacy,
      steps,
      errors,
      warnings: version.warnings,
      beforeDigest,
      afterDigest: beforeDigest,
      candidateDigest: stableDigest(candidate),
      planDigest,
      beforeAssets,
      afterAssets: beforeAssets,
      candidateAssets,
      assetsUnchanged: true,
      contentUnchanged: true,
    };
  };
  if (!version.ok) {
    return failure(version.errors);
  }

  let migrated = deepClone(source);
  let currentVersion = version.version;
  const steps = [];
  if (currentVersion === LEGACY_PROFILE_SCHEMA_VERSION) {
    const stepBefore = deepClone(migrated);
    migrated.schemaVersion = 2;
    const stepAssetsBefore = profileAssetSummary(stepBefore);
    const stepAssetsAfter = profileAssetSummary(migrated);
    const stepAssetsUnchanged = stepAssetsBefore.digest === stepAssetsAfter.digest;
    const stepContentUnchanged = profileContentDigestExcludingSchemaVersion(stepBefore)
      === profileContentDigestExcludingSchemaVersion(migrated);
    const step = {
      id: PROFILE_MIGRATION_V1_TO_V2,
      fromVersion: LEGACY_PROFILE_SCHEMA_VERSION,
      toVersion: 2,
      ok: stepAssetsUnchanged && stepContentUnchanged,
      assetsUnchanged: stepAssetsUnchanged,
      contentUnchanged: stepContentUnchanged,
      beforeDigest: stableDigest(stepBefore),
      afterDigest: stableDigest(migrated),
    };
    steps.push(step);
    if (!step.ok) {
      const errors = [];
      if (!stepAssetsUnchanged) {
        errors.push({code: "profile_assets_changed", message: "profile v1-to-v2 migration changed the asset summary"});
      }
      if (!stepContentUnchanged) {
        errors.push({
          code: "profile_content_changed_outside_schema",
          message: "profile v1-to-v2 migration changed content outside schemaVersion",
        });
      }
      return failure(errors, steps, migrated);
    }
    currentVersion = 2;
  }

  if (currentVersion === 2) {
    const stepBefore = deepClone(migrated);
    const equipmentMigration = migrateEquipmentProfileV2ToV3(stepBefore);
    const step = {
      id: PROFILE_MIGRATION_V2_TO_V3,
      fromVersion: 2,
      toVersion: 3,
      ok: equipmentMigration.ok,
      equipment: equipmentMigration.report,
      beforeDigest: stableDigest(stepBefore),
      afterDigest: equipmentMigration.ok ? stableDigest(equipmentMigration.profile) : stableDigest(stepBefore),
    };
    if (!equipmentMigration.ok) {
      steps.push(step);
      const errors = equipmentMigration.conflicts.map((entry) => ({
        ...entry,
        message: entry.message || "equipment profile migration conflict",
      }));
      return failure(errors, steps, stepBefore);
    }
    migrated = equipmentMigration.profile;
    migrated.schemaVersion = 3;
    const stepAssetsBefore = profileAssetSummary(stepBefore);
    const stepAssetsAfter = profileAssetSummary(migrated);
    const stepAssetsUnchanged = stepAssetsBefore.digest === stepAssetsAfter.digest;
    const stepContentUnchanged = profileContentDigestExcludingEquipmentMigrationFields(stepBefore)
      === profileContentDigestExcludingEquipmentMigrationFields(migrated);
    step.ok = stepAssetsUnchanged && stepContentUnchanged;
    step.assetsUnchanged = stepAssetsUnchanged;
    step.contentUnchanged = stepContentUnchanged;
    step.afterDigest = stableDigest(migrated);
    steps.push(step);
    if (!step.ok) {
      const errors = [];
      if (!stepAssetsUnchanged) {
        errors.push({
          code: "profile_assets_changed",
          message: "profile v2-to-v3 equipment migration changed logical assets",
        });
      }
      if (!stepContentUnchanged) {
        errors.push({
          code: "profile_content_changed_outside_equipment_migration",
          message: "profile v2-to-v3 migration changed content outside its allowed equipment fields",
        });
      }
      return failure(errors, steps, migrated);
    }
    currentVersion = 3;
  }

  if (currentVersion === CURRENT_PROFILE_SCHEMA_VERSION && steps.length === 0) {
    const audit = auditEquipmentProfileV3(migrated);
    if (!audit.ok) {
      return failure(audit.conflicts.map((entry) => ({
        ...entry,
        message: entry.message || "version-3 equipment profile is not canonical",
      })), [{
        id: "profile_v3_equipment_audit",
        fromVersion: 3,
        toVersion: 3,
        ok: false,
        equipment: audit.report,
        beforeDigest,
        afterDigest: beforeDigest,
      }]);
    }
  }
  const afterAssets = profileAssetSummary(migrated);
  const assetsUnchanged = beforeAssets.digest === afterAssets.digest;
  const contentUnchanged = profileContentDigestExcludingEquipmentMigrationFields(source)
    === profileContentDigestExcludingEquipmentMigrationFields(migrated);
  const errors = [];
  if (!assetsUnchanged) {
    errors.push({
      code: "profile_assets_changed",
      message: "profile migration changed the asset summary",
    });
  }
  if (!contentUnchanged) {
    errors.push({
      code: "profile_content_changed_outside_migration",
      message: "profile migration changed content outside schema and equipment representation fields",
    });
  }
  if (errors.length > 0) {
    return failure(errors, steps, migrated);
  }
  const afterDigest = stableDigest(migrated);
  const planDigest = stableDigest({
    fromVersion: version.version,
    toVersion: CURRENT_PROFILE_SCHEMA_VERSION,
    beforeDigest,
    afterDigest,
    steps: steps.map((step) => ({
      id: step.id,
      fromVersion: step.fromVersion,
      toVersion: step.toVersion,
      beforeDigest: step.beforeDigest,
      afterDigest: step.afterDigest,
    })),
  });
  return {
    ok: true,
    applySafe: true,
    changed: afterDigest !== beforeDigest,
    wouldChange: afterDigest !== beforeDigest,
    profile: migrated,
    fromVersion: version.version,
    toVersion: CURRENT_PROFILE_SCHEMA_VERSION,
    assumedLegacy: version.assumedLegacy,
    steps,
    errors,
    warnings: version.warnings,
    beforeDigest,
    afterDigest,
    candidateDigest: afterDigest,
    planDigest,
    beforeAssets,
    afterAssets,
    assetsUnchanged,
    contentUnchanged,
  };
}

function profileDocumentMetadata(document) {
  if (!isRecord(document)) {
    return document;
  }
  const result = deepClone(document);
  delete result.profile;
  return result;
}

function rootBucketDigests(snapshot) {
  const result = {};
  if (!isRecord(snapshot)) {
    return result;
  }
  for (const key of Object.keys(snapshot).filter((key) => key !== "profiles").sort()) {
    result[key] = stableDigest(snapshot[key]);
  }
  return result;
}

function sameStringKeys(left, right) {
  return stableDigest(Object.keys(left || {}).sort()) === stableDigest(Object.keys(right || {}).sort());
}

function migrateProfilesSnapshot(snapshotValue) {
  const source = deepClone(snapshotValue);
  const beforeDigest = stableDigest(source);
  if (!isRecord(source)) {
    return {
      ok: false,
      applySafe: false,
      changed: false,
      wouldChange: false,
      snapshot: source,
      currentProfileSchemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
      counts: {total: 0, eligible: 0, changed: 0, unchanged: 0, invalid: 0},
      profiles: [],
      errors: [{code: "snapshot_root_invalid", message: "snapshot must be an object"}],
      warnings: [],
      beforeDigest,
      afterDigest: beforeDigest,
      candidateDigest: beforeDigest,
      planDigest: stableDigest({beforeDigest, errors: ["snapshot_root_invalid"]}),
      profileKeysPreserved: true,
      nonProfileBucketsPreserved: true,
      nonProfileBucketDigests: rootBucketDigests(source),
    };
  }
  if (!hasOwn(source, "profiles")) {
    return {
      ok: true,
      applySafe: true,
      changed: false,
      wouldChange: false,
      snapshot: source,
      currentProfileSchemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
      counts: {total: 0, eligible: 0, changed: 0, unchanged: 0, invalid: 0},
      profiles: [],
      errors: [],
      warnings: [{code: "snapshot_profiles_missing", message: "snapshot has no profiles bucket"}],
      beforeDigest,
      afterDigest: beforeDigest,
      candidateDigest: beforeDigest,
      planDigest: stableDigest({beforeDigest, profiles: []}),
      profileKeysPreserved: true,
      nonProfileBucketsPreserved: true,
      nonProfileBucketDigests: rootBucketDigests(source),
    };
  }
  if (!isRecord(source.profiles)) {
    return {
      ok: false,
      applySafe: false,
      changed: false,
      wouldChange: false,
      snapshot: source,
      currentProfileSchemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
      counts: {total: 0, eligible: 0, changed: 0, unchanged: 0, invalid: 1},
      profiles: [],
      errors: [{code: "snapshot_profiles_invalid", message: "snapshot profiles bucket must be an object"}],
      warnings: [],
      beforeDigest,
      afterDigest: beforeDigest,
      candidateDigest: beforeDigest,
      planDigest: stableDigest({beforeDigest, errors: ["snapshot_profiles_invalid"]}),
      profileKeysPreserved: true,
      nonProfileBucketsPreserved: true,
      nonProfileBucketDigests: rootBucketDigests(source),
    };
  }

  const candidate = deepClone(source);
  const profileReports = [];
  const errors = [];
  const warnings = [];
  let eligible = 0;
  let changed = 0;
  let unchanged = 0;
  let invalid = 0;
  for (const playerId of Object.keys(source.profiles).sort()) {
    const sourceDocument = source.profiles[playerId];
    if (!isRecord(sourceDocument) || !hasOwn(sourceDocument, "profile")) {
      const error = {
        code: "profile_document_invalid",
        message: "profile document must be an object containing profile",
      };
      invalid += 1;
      errors.push({playerId, ...error});
      profileReports.push({
        playerId,
        ok: false,
        changed: false,
        errors: [error],
        warnings: [],
        documentDigest: stableDigest(sourceDocument),
        documentMetadataPreserved: true,
      });
      continue;
    }
    const metadataBefore = profileDocumentMetadata(sourceDocument);
    const migration = migrateProfile(sourceDocument.profile);
    if (!migration.ok) {
      invalid += 1;
      for (const error of migration.errors) {
        errors.push({playerId, ...error});
      }
    } else {
      eligible += 1;
      if (migration.changed) {
        changed += 1;
        candidate.profiles[playerId].profile = migration.profile;
      } else {
        unchanged += 1;
      }
    }
    for (const warning of migration.warnings) {
      warnings.push({playerId, ...warning});
    }
    const metadataAfter = profileDocumentMetadata(candidate.profiles[playerId]);
    profileReports.push({
      playerId,
      ok: migration.ok,
      changed: migration.ok && migration.changed,
      fromVersion: migration.fromVersion,
      toVersion: migration.toVersion,
      assumedLegacy: migration.assumedLegacy,
      steps: migration.steps,
      errors: migration.errors,
      warnings: migration.warnings,
      beforeDigest: migration.beforeDigest,
      afterDigest: migration.afterDigest,
      candidateDigest: migration.candidateDigest,
      planDigest: migration.planDigest,
      beforeAssetDigest: migration.beforeAssets.digest,
      afterAssetDigest: migration.afterAssets.digest,
      beforeRepresentationDigest: migration.beforeAssets.representationDigest,
      afterRepresentationDigest: migration.afterAssets.representationDigest,
      assetsUnchanged: migration.assetsUnchanged,
      contentUnchanged: migration.contentUnchanged,
      documentMetadataPreserved: stableDigest(metadataBefore) === stableDigest(metadataAfter),
    });
  }

  for (const externalConflict of snapshotExternalEquipmentConflicts(source)) {
    errors.push(externalConflict);
  }

  const candidateBucketDigests = rootBucketDigests(candidate);
  const sourceBucketDigests = rootBucketDigests(source);
  const nonProfileBucketsPreserved = stableDigest(candidateBucketDigests) === stableDigest(sourceBucketDigests);
  const profileKeysPreserved = sameStringKeys(source.profiles, candidate.profiles);
  if (!nonProfileBucketsPreserved) {
    errors.push({code: "snapshot_bucket_changed", message: "a non-profile snapshot bucket changed"});
  }
  if (!profileKeysPreserved) {
    errors.push({code: "snapshot_profile_keys_changed", message: "profile keys changed during migration"});
  }
  if (profileReports.some((report) => !report.documentMetadataPreserved)) {
    errors.push({code: "profile_document_metadata_changed", message: "profile document metadata changed during migration"});
  }
  const applySafe = errors.length === 0;
  const output = applySafe ? candidate : deepClone(source);
  const planFacts = {
    currentProfileSchemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
    beforeDigest,
    errors: errors.map((error) => ({
      code: error.code,
      path: error.path || "",
      playerId: error.playerId || "",
    })),
    profiles: profileReports.map((report) => ({
      playerId: report.playerId,
      ok: report.ok,
      changed: report.changed,
      fromVersion: report.fromVersion,
      toVersion: report.toVersion,
      beforeDigest: report.beforeDigest || report.documentDigest,
      afterDigest: report.afterDigest || report.documentDigest,
      errorCodes: report.errors.map((error) => error.code),
    })),
  };
  return {
    ok: applySafe,
    applySafe,
    changed: applySafe && changed > 0,
    wouldChange: changed > 0,
    snapshot: output,
    currentProfileSchemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
    counts: {
      total: Object.keys(source.profiles).length,
      eligible,
      changed,
      unchanged,
      invalid,
    },
    profiles: profileReports,
    errors,
    warnings,
    beforeDigest,
    afterDigest: stableDigest(output),
    candidateDigest: stableDigest(candidate),
    planDigest: stableDigest(planFacts),
    profileKeysPreserved,
    nonProfileBucketsPreserved,
    nonProfileBucketDigests: sourceBucketDigests,
  };
}

module.exports = {
  CURRENT_PROFILE_SCHEMA_VERSION,
  LEGACY_PROFILE_SCHEMA_VERSION,
  PROFILE_MIGRATION_V1_TO_V2,
  PROFILE_MIGRATION_V2_TO_V3,
  migrateProfile,
  migrateProfilesSnapshot,
  profileAssetSummary,
  profileContentDigestExcludingEquipmentMigrationFields,
  profileContentDigestExcludingSchemaVersion,
  stableDigest,
};
