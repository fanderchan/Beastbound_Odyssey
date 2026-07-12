"use strict";

const crypto = require("node:crypto");
const {validatePetGrowth} = require("./pet-growth-runtime");

const GM_PREPARE_QA_PET_SAMPLES_COMMAND_ID = "gm_prepare_qa_pet_samples";
const QA_PET_SAMPLES_MANIFEST_ID = "qa_pet_samples_v1";
const QA_PET_SAMPLE_MANIFESTS_PROFILE_KEY = "gmQaPetSampleManifests";
const QA_PET_SAMPLE_MARKER_KEY = "qaSample";
const QA_PET_SAMPLE_SOURCE = "gm_qa_pet_manifest";
const QA_PET_SAMPLE_COUNT = 13;
const QA_PET_BLUE_LV1_COUNT = 10;
const QA_PET_COMPARISON_LV20_COUNT = 3;
const QA_PET_RESERVED_CAPTURE_SLOTS = 1;

const QA_PET_SAMPLE_PLAN = Object.freeze([
  ...Array.from({length: QA_PET_BLUE_LV1_COUNT}, (_, index) => Object.freeze({
    slotId: `blue_l1_${String(index + 1).padStart(2, "0")}`,
    formId: "blue_man_dragon_water10",
    growthSpeciesProfileId: "blue_man_dragon_v1",
    initialLevel: 1,
    targetLevel: 1,
  })),
  Object.freeze({
    slotId: "tank_l20_01",
    formId: "wuli_normal_tough_earth10",
    growthSpeciesProfileId: "wuli_normal_tough_earth10_v1",
    initialLevel: 1,
    targetLevel: 20,
  }),
  Object.freeze({
    slotId: "speed_l20_01",
    formId: "driftfox_highland_wind9_earth1",
    growthSpeciesProfileId: "driftfox_highland_wind9_earth1_v1",
    initialLevel: 1,
    targetLevel: 20,
  }),
  Object.freeze({
    slotId: "balanced_l20_01",
    formId: "tidefin_mist_water8_wind2",
    growthSpeciesProfileId: "tidefin_mist_water8_wind2_v1",
    initialLevel: 1,
    targetLevel: 20,
  }),
]);

const LEDGER_KEYS = Object.freeze([
  "schemaVersion",
  "manifestId",
  "preparedAt",
  "slots",
]);
const LEDGER_SLOT_KEYS = Object.freeze([
  "slotId",
  "instanceId",
  "originFormId",
  "initialLevel",
  "targetLevel",
]);
const QA_SAMPLE_KEYS = Object.freeze([
  "schemaVersion",
  "manifestId",
  "slotId",
  "originFormId",
  "initialLevel",
  "targetLevel",
]);

function createGmQaPetsDomain(ctx) {
  const {
    BATTLE_PET_MAX_PER_PARTICIPANT,
    BATTLE_PET_STATE_STANDBY,
    BATTLE_PET_STATE_STORAGE,
    BATTLE_PET_STORAGE_LIMIT,
    CURRENT_PROFILE_SCHEMA_VERSION,
    MAX_PET_LEVEL,
    clone,
    createDefaultServerPet,
    expToNextLevel,
    fail,
    gmCommandAccess,
    isoNow,
    load,
    newPetFactory,
    nextProfilePetInstanceSerial,
    ok,
    petExpSettlement,
    petGrowthCatalog,
    persistProfileForAccount,
    profilePartyVisiblePetCount,
    profileStoragePetCount,
    profileSummaryForAccount,
    publicAccount,
    rawBackpackAssetConflict,
    recordGmCommandAudit,
    recordProfilePetCodexForm,
    save,
  } = ctx;

  function auditedFailure(data, access, code, message, details = {}) {
    const audit = recordGmCommandAudit(data, access, false, message, details);
    if (audit.recorded !== false) {
      save(data);
    }
    return fail(code, message, audit.auditId ? {auditId: audit.auditId} : {});
  }

  function prepareGmQaPetSamples(token, payload = {}) {
    const data = load();
    const access = gmCommandAccess(data, token, GM_PREPARE_QA_PET_SAMPLES_COMMAND_ID);
    if (!access.ok) {
      return auditedFailure(data, access, access.code, access.message);
    }
    if (!validPayload(payload)) {
      return auditedFailure(
        data,
        access,
        "gm_qa_pet_samples_payload_invalid",
        "GM宠物样本参数不正确，请刷新后重试。",
      );
    }

    const manifest = resolveManifest(petGrowthCatalog, MAX_PET_LEVEL);
    if (!manifest.ok) {
      return auditedFailure(data, access, manifest.code, manifest.message, {
        manifestId: QA_PET_SAMPLES_MANIFEST_ID,
      });
    }
    const existing = existingProfileForAccount(data, access.resolved.account);
    if (!existing.ok) {
      return auditedFailure(data, access, existing.code, existing.message, {
        manifestId: QA_PET_SAMPLES_MANIFEST_ID,
      });
    }
    const sourceProfile = existing.profileDoc.profile;
    const assetConflict = rawBackpackAssetConflict(sourceProfile);
    if (assetConflict) {
      return auditedFailure(data, access, assetConflict.code, assetConflict.message, {
        manifestId: QA_PET_SAMPLES_MANIFEST_ID,
      });
    }
    const beforeRevision = strictRevision(existing.binding.profileRevision);
    const expectedSlots = manifest.samples.map((sample) => ({
      ...sample,
      instanceId: instanceIdForSlot(access.resolved.account.accountId, sample.slotId),
    }));
    const inspection = inspectProfile(sourceProfile, expectedSlots, {
      currentProfileSchemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
      maxParty: BATTLE_PET_MAX_PER_PARTICIPANT,
      maxStorage: BATTLE_PET_STORAGE_LIMIT,
      profilePartyVisiblePetCount,
      profileStoragePetCount,
    });
    if (!inspection.ok) {
      return auditedFailure(data, access, inspection.code, inspection.message, {
        manifestId: QA_PET_SAMPLES_MANIFEST_ID,
        profileRevisionBefore: beforeRevision,
        profileRevisionAfter: beforeRevision,
      });
    }

    if (inspection.ledgerPresent) {
      if (!preparedSamplesRemainValid(sourceProfile.petInstances, expectedSlots, petGrowthCatalog)) {
        return auditedFailure(
          data,
          access,
          "gm_qa_pet_samples_state_invalid",
          "宠物样本成长或绑定档案异常，本次操作已取消。",
          {
            manifestId: QA_PET_SAMPLES_MANIFEST_ID,
            profileRevisionBefore: beforeRevision,
            profileRevisionAfter: beforeRevision,
          },
        );
      }
      const result = buildResultSummary({
        changed: false,
        alreadyPrepared: true,
        presentCount: inspection.presentSlotIds.size,
        partyAdded: 0,
        storageAdded: 0,
        reservedCaptureSlots: Math.max(
          0,
          BATTLE_PET_MAX_PER_PARTICIPANT + BATTLE_PET_STORAGE_LIMIT - inspection.rosterPets.length,
        ),
        primaryInstanceId: inspection.presentSlotIds.has(QA_PET_SAMPLE_PLAN[0].slotId)
          ? expectedSlots[0].instanceId
          : "",
        profileRevisionBefore: beforeRevision,
        profileRevisionAfter: beforeRevision,
      });
      const message = result.summary.missingCount > 0
        ? `GM宠物样本档已准备过，当前缺少${result.summary.missingCount}只；为避免重抽不会自动补发。`
        : "GM宠物样本档已经准备过，不会重复生成。";
      const audit = recordGmCommandAudit(data, access, true, message, {
        accountId: access.resolved.account.accountId,
        targetAccountId: access.resolved.account.accountId,
        manifestId: QA_PET_SAMPLES_MANIFEST_ID,
        changed: false,
        presentCount: result.summary.presentCount,
        missingCount: result.summary.missingCount,
        profileRevisionBefore: beforeRevision,
        profileRevisionAfter: beforeRevision,
      });
      save(data);
      return ok({
        account: publicAccount(access.resolved.account),
        profileBinding: existing.binding,
        profileSummary: profileSummaryForAccount(access.resolved.account, data),
        profile: sourceProfile,
        result,
        auditId: audit.auditId,
        message,
      });
    }

    const totalCapacity = BATTLE_PET_MAX_PER_PARTICIPANT + BATTLE_PET_STORAGE_LIMIT;
    if (inspection.rosterPets.length + QA_PET_SAMPLE_COUNT > totalCapacity - QA_PET_RESERVED_CAPTURE_SLOTS) {
      return auditedFailure(
        data,
        access,
        "gm_qa_pet_samples_capacity_full",
        "宠物空间不足；请至少为13只样本和1次真实捕捉留出位置，本次未作改变。",
        {
          manifestId: QA_PET_SAMPLES_MANIFEST_ID,
          profileRevisionBefore: beforeRevision,
          profileRevisionAfter: beforeRevision,
        },
      );
    }

    const profile = clone(sourceProfile);
    const instances = profile.petInstances;
    let serial = nextProfilePetInstanceSerial(profile, instances);
    let partyCount = profilePartyVisiblePetCount(profile);
    let storageCount = profileStoragePetCount(profile);
    let partyAdded = 0;
    let storageAdded = 0;
    const privateSeeds = new Set();

    for (const sample of expectedSlots) {
      const state = partyCount < BATTLE_PET_MAX_PER_PARTICIPANT
        ? BATTLE_PET_STATE_STANDBY
        : BATTLE_PET_STATE_STORAGE;
      if (state === BATTLE_PET_STATE_STORAGE && storageCount >= BATTLE_PET_STORAGE_LIMIT) {
        return auditedFailure(
          data,
          access,
          "gm_qa_pet_samples_capacity_full",
          "宠物空间不足，GM宠物样本档未作任何改变。",
          {
            manifestId: QA_PET_SAMPLES_MANIFEST_ID,
            profileRevisionBefore: beforeRevision,
            profileRevisionAfter: beforeRevision,
          },
        );
      }
      let pet = createDefaultServerPet(
        sample.instanceId,
        sample.formName,
        sample.formId,
        state,
        1,
      );
      pet.capturedSerial = serial;
      pet.isNew = true;
      try {
        const finalized = newPetFactory.finalizeLevelOne(pet, {purpose: QA_PET_SAMPLE_SOURCE});
        if (
          !isRecord(finalized)
          || finalized.profileId !== sample.growthSpeciesProfileId
          || !isRecord(finalized.pet)
        ) {
          throw new Error("factory result mismatch");
        }
        pet = finalized.pet;
      } catch (_error) {
        return auditedFailure(
          data,
          access,
          "gm_qa_pet_samples_creation_failed",
          "GM宠物样本创建失败，档案未改变。",
          {
            manifestId: QA_PET_SAMPLES_MANIFEST_ID,
            profileRevisionBefore: beforeRevision,
            profileRevisionAfter: beforeRevision,
          },
        );
      }
      try {
        pet = advancePetToLevel(
          pet,
          sample.targetLevel,
          petExpSettlement,
          expToNextLevel,
          MAX_PET_LEVEL,
        );
      } catch (_error) {
        return auditedFailure(
          data,
          access,
          "gm_qa_pet_samples_growth_failed",
          "GM宠物样本成长结算失败，档案未改变。",
          {
            manifestId: QA_PET_SAMPLES_MANIFEST_ID,
            profileRevisionBefore: beforeRevision,
            profileRevisionAfter: beforeRevision,
          },
        );
      }
      const privateSeed = privateSeedForAuthorityPet(pet);
      if (privateSeed === "" || privateSeeds.has(privateSeed)) {
        return auditedFailure(
          data,
          access,
          "gm_qa_pet_samples_creation_failed",
          "GM宠物样本私有身份冲突，档案未改变。",
          {
            manifestId: QA_PET_SAMPLES_MANIFEST_ID,
            profileRevisionBefore: beforeRevision,
            profileRevisionAfter: beforeRevision,
          },
        );
      }
      privateSeeds.add(privateSeed);
      pet.locked = true;
      pet.binding = "bound";
      pet.bound = true;
      pet.source = QA_PET_SAMPLE_SOURCE;
      pet[QA_PET_SAMPLE_MARKER_KEY] = markerForSample(sample);
      instances.push(pet);
      recordProfilePetCodexForm(profile, sample.formId, true);
      serial += 1;
      if (state === BATTLE_PET_STATE_STORAGE) {
        storageCount += 1;
        storageAdded += 1;
      } else {
        partyCount += 1;
        partyAdded += 1;
      }
    }

    profile.nextPetInstanceSerial = serial;
    const ledgers = hasOwn(profile, QA_PET_SAMPLE_MANIFESTS_PROFILE_KEY)
      ? profile[QA_PET_SAMPLE_MANIFESTS_PROFILE_KEY]
      : {};
    ledgers[QA_PET_SAMPLES_MANIFEST_ID] = {
      schemaVersion: 1,
      manifestId: QA_PET_SAMPLES_MANIFEST_ID,
      preparedAt: isoNow(ctx.now),
      slots: expectedSlots.map(ledgerSlotForSample),
    };
    profile[QA_PET_SAMPLE_MANIFESTS_PROFILE_KEY] = ledgers;

    const finalInspection = inspectProfile(profile, expectedSlots, {
      currentProfileSchemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
      maxParty: BATTLE_PET_MAX_PER_PARTICIPANT,
      maxStorage: BATTLE_PET_STORAGE_LIMIT,
      profilePartyVisiblePetCount,
      profileStoragePetCount,
    });
    if (
      !finalInspection.ok
      || !finalInspection.ledgerPresent
      || finalInspection.presentSlotIds.size !== QA_PET_SAMPLE_COUNT
      || !freshSamplesAreCanonical(profile.petInstances, expectedSlots)
    ) {
      return auditedFailure(
        data,
        access,
        "gm_qa_pet_samples_creation_failed",
        "GM宠物样本最终校验失败，档案未改变。",
        {
          manifestId: QA_PET_SAMPLES_MANIFEST_ID,
          profileRevisionBefore: beforeRevision,
          profileRevisionAfter: beforeRevision,
        },
      );
    }

    const persisted = persistProfileForAccount(
      data,
      access.resolved.account,
      existing.binding,
      profile,
      ctx.now,
    );
    const afterRevision = strictRevision(persisted.binding.profileRevision);
    const result = buildResultSummary({
      changed: true,
      alreadyPrepared: false,
      presentCount: QA_PET_SAMPLE_COUNT,
      partyAdded,
      storageAdded,
      reservedCaptureSlots: Math.max(0, totalCapacity - instances.length),
      primaryInstanceId: expectedSlots[0].instanceId,
      profileRevisionBefore: beforeRevision,
      profileRevisionAfter: afterRevision,
    });
    const message = "GM宠物样本档已准备：10只Lv1蓝人龙和3只Lv20成长对照。";
    const audit = recordGmCommandAudit(data, access, true, message, {
      accountId: access.resolved.account.accountId,
      targetAccountId: access.resolved.account.accountId,
      manifestId: QA_PET_SAMPLES_MANIFEST_ID,
      changed: true,
      sampleCount: QA_PET_SAMPLE_COUNT,
      partyAdded,
      storageAdded,
      reservedCaptureSlots: result.summary.reservedCaptureSlots,
      profileRevisionBefore: beforeRevision,
      profileRevisionAfter: afterRevision,
    });
    save(data);
    return ok({
      account: publicAccount(access.resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(access.resolved.account, data),
      profile,
      result,
      auditId: audit.auditId,
      message,
    });
  }

  return Object.freeze({prepareGmQaPetSamples});
}

function validPayload(value) {
  return isPlainRecord(value)
    && Object.keys(value).length === 1
    && hasOwn(value, "manifestId")
    && value.manifestId === QA_PET_SAMPLES_MANIFEST_ID;
}

function resolveManifest(catalog, maxPetLevel) {
  if (
    !isRecord(catalog)
    || typeof catalog.profileById !== "function"
    || typeof catalog.templateByFormId !== "function"
    || QA_PET_SAMPLE_PLAN.length !== QA_PET_SAMPLE_COUNT
  ) {
    return manifestFailure();
  }
  const slotIds = new Set();
  const samples = [];
  for (const sample of QA_PET_SAMPLE_PLAN) {
    if (
      slotIds.has(sample.slotId)
      || sample.initialLevel !== 1
      || !Number.isInteger(sample.targetLevel)
      || sample.targetLevel < 1
      || sample.targetLevel > maxPetLevel
    ) {
      return manifestFailure();
    }
    const profile = catalog.profileById(sample.growthSpeciesProfileId);
    const template = catalog.templateByFormId(sample.formId);
    if (
      !isRecord(profile)
      || profile.profileId !== sample.growthSpeciesProfileId
      || profile.formId !== sample.formId
      || !isRecord(template)
      || template.formId !== sample.formId
      || String(template.formName || "").trim() === ""
    ) {
      return manifestFailure();
    }
    slotIds.add(sample.slotId);
    samples.push({...sample, formName: String(template.formName).trim()});
  }
  return {ok: true, samples};
}

function manifestFailure() {
  return {
    ok: false,
    code: "gm_qa_pet_samples_manifest_invalid",
    message: "GM宠物样本清单异常，本次操作已取消。",
  };
}

function existingProfileForAccount(data, account) {
  const accountId = String(account && account.accountId || "");
  const binding = isRecord(data && data.profileBindings) && isRecord(data.profileBindings[accountId])
    ? data.profileBindings[accountId]
    : null;
  const playerId = String(binding && binding.playerId || "");
  const profileDoc = playerId !== "" && isRecord(data && data.profiles) && isRecord(data.profiles[playerId])
    ? data.profiles[playerId]
    : null;
  if (!binding || !profileDoc || !isRecord(profileDoc.profile)) {
    return {ok: false, code: "profile_missing", message: "请先创建角色档案。"};
  }
  const bindingRevision = strictRevision(binding.profileRevision);
  const profileRevision = strictRevision(profileDoc.profileRevision);
  if (
    String(binding.accountId || "") !== accountId
    || String(profileDoc.accountId || "") !== accountId
    || String(profileDoc.playerId || "") !== playerId
    || bindingRevision === null
    || profileRevision === null
    || bindingRevision !== profileRevision
  ) {
    return {
      ok: false,
      code: "profile_binding_conflict",
      message: "角色档案归属或版本不一致，本次操作已取消。",
    };
  }
  return {ok: true, binding, profileDoc};
}

function inspectProfile(profile, expectedSlots, options) {
  if (
    !isRecord(profile)
    || profile.schemaVersion !== options.currentProfileSchemaVersion
    || !Array.isArray(profile.petInstances)
    || !Array.isArray(profile.groundPetDrops)
    || !Number.isSafeInteger(profile.nextPetInstanceSerial)
    || profile.nextPetInstanceSerial < 1
    || (hasOwn(profile, "pets") && (!Array.isArray(profile.pets) || profile.pets.length > 0))
  ) {
    return profileInspectionFailure("gm_qa_pet_samples_profile_invalid", "宠物档案结构异常，本次操作已取消。");
  }

  const records = [];
  for (const pet of profile.petInstances) {
    const record = petRecord(pet, "roster");
    if (!record.ok) {
      return profileInspectionFailure("gm_qa_pet_samples_profile_invalid", "宠物档案结构异常，本次操作已取消。");
    }
    records.push(record);
  }
  for (const drop of profile.groundPetDrops) {
    if (!isRecord(drop) || !isRecord(drop.pet)) {
      return profileInspectionFailure("gm_qa_pet_samples_profile_invalid", "地面宠物档案结构异常，本次操作已取消。");
    }
    const record = petRecord(drop.pet, "ground");
    if (!record.ok) {
      return profileInspectionFailure("gm_qa_pet_samples_profile_invalid", "地面宠物档案结构异常，本次操作已取消。");
    }
    records.push(record);
  }
  const identitySet = new Set();
  for (const record of records) {
    if (identitySet.has(record.instanceId)) {
      return profileInspectionFailure("gm_qa_pet_samples_identity_conflict", "宠物实例编号重复，本次操作已取消。");
    }
    identitySet.add(record.instanceId);
  }

  const partyCount = options.profilePartyVisiblePetCount(profile);
  const storageCount = options.profileStoragePetCount(profile);
  if (
    !Number.isInteger(partyCount)
    || !Number.isInteger(storageCount)
    || partyCount < 0
    || storageCount < 0
    || partyCount > options.maxParty
    || storageCount > options.maxStorage
    || partyCount + storageCount !== profile.petInstances.length
  ) {
    return profileInspectionFailure("gm_qa_pet_samples_capacity_invalid", "宠物容量档案异常，本次操作已取消。");
  }

  const expectedBySlot = new Map(expectedSlots.map((sample) => [sample.slotId, sample]));
  const expectedIds = new Set(expectedSlots.map((sample) => sample.instanceId));
  const markerRecordsBySlot = new Map();
  for (const record of records) {
    if (!hasOwn(record.pet, QA_PET_SAMPLE_MARKER_KEY)) {
      continue;
    }
    const marker = normalizedMarker(record.pet[QA_PET_SAMPLE_MARKER_KEY]);
    if (!marker.ok) {
      return profileInspectionFailure("gm_qa_pet_samples_provenance_invalid", "宠物样本来源标记异常，本次操作已取消。");
    }
    if (marker.manifestId !== QA_PET_SAMPLES_MANIFEST_ID) {
      continue;
    }
    const expected = expectedBySlot.get(marker.slotId);
    if (!expected || !markerMatchesSample(marker, expected)) {
      return profileInspectionFailure("gm_qa_pet_samples_provenance_invalid", "宠物样本槽标记异常，本次操作已取消。");
    }
    if (!markerRecordsBySlot.has(marker.slotId)) {
      markerRecordsBySlot.set(marker.slotId, []);
    }
    markerRecordsBySlot.get(marker.slotId).push(record);
  }
  if (Array.from(markerRecordsBySlot.values()).some((entries) => entries.length > 1)) {
    return profileInspectionFailure("gm_qa_pet_samples_provenance_conflict", "宠物样本槽重复，本次操作已取消。");
  }

  const ledgerResult = readLedger(profile, expectedSlots);
  if (!ledgerResult.ok) {
    return ledgerResult;
  }
  if (!ledgerResult.present) {
    if (
      markerRecordsBySlot.size > 0
      || records.some((record) => expectedIds.has(record.instanceId))
    ) {
      return profileInspectionFailure("gm_qa_pet_samples_provenance_conflict", "发现不完整的宠物样本批次，本次操作已取消。");
    }
    return {
      ok: true,
      ledgerPresent: false,
      rosterPets: profile.petInstances,
      presentSlotIds: new Set(),
    };
  }

  const presentSlotIds = new Set();
  for (const expected of expectedSlots) {
    const idRecords = records.filter((record) => record.instanceId === expected.instanceId);
    const markerRecords = markerRecordsBySlot.get(expected.slotId) || [];
    if (idRecords.length > 1 || markerRecords.length > 1) {
      return profileInspectionFailure("gm_qa_pet_samples_provenance_conflict", "宠物样本实例重复，本次操作已取消。");
    }
    if (idRecords.length === 0 && markerRecords.length === 0) {
      continue;
    }
    if (
      idRecords.length !== 1
      || markerRecords.length !== 1
      || idRecords[0] !== markerRecords[0]
      || idRecords[0].pet.source !== QA_PET_SAMPLE_SOURCE
      || idRecords[0].pet.binding !== "bound"
      || idRecords[0].pet.bound !== true
    ) {
      return profileInspectionFailure("gm_qa_pet_samples_provenance_conflict", "宠物样本实例与批次账本不一致，本次操作已取消。");
    }
    if (idRecords[0].container === "roster") {
      presentSlotIds.add(expected.slotId);
    }
  }

  return {
    ok: true,
    ledgerPresent: true,
    rosterPets: profile.petInstances,
    presentSlotIds,
  };
}

function petRecord(pet, container) {
  if (!isRecord(pet)) {
    return {ok: false};
  }
  const instanceId = strictIdentity(pet.instanceId);
  const petId = strictIdentity(pet.petId);
  const legacyId = strictIdentity(pet.id);
  if (
    (instanceId === "" && petId === "")
    || (instanceId !== "" && petId !== "" && instanceId !== petId)
    || (legacyId !== "" && legacyId !== (instanceId || petId))
  ) {
    return {ok: false};
  }
  return {ok: true, pet, container, instanceId: instanceId || petId};
}

function readLedger(profile, expectedSlots) {
  if (!hasOwn(profile, QA_PET_SAMPLE_MANIFESTS_PROFILE_KEY)) {
    return {ok: true, present: false};
  }
  const ledgers = profile[QA_PET_SAMPLE_MANIFESTS_PROFILE_KEY];
  if (!isPlainRecord(ledgers)) {
    return profileInspectionFailure("gm_qa_pet_samples_ledger_invalid", "宠物样本批次账本异常，本次操作已取消。");
  }
  if (!hasOwn(ledgers, QA_PET_SAMPLES_MANIFEST_ID)) {
    return {ok: true, present: false};
  }
  const ledger = ledgers[QA_PET_SAMPLES_MANIFEST_ID];
  if (
    !hasExactKeys(ledger, LEDGER_KEYS)
    || ledger.schemaVersion !== 1
    || ledger.manifestId !== QA_PET_SAMPLES_MANIFEST_ID
    || !canonicalIsoTimestamp(ledger.preparedAt)
    || !Array.isArray(ledger.slots)
    || ledger.slots.length !== expectedSlots.length
  ) {
    return profileInspectionFailure("gm_qa_pet_samples_ledger_invalid", "宠物样本批次账本异常，本次操作已取消。");
  }
  const seenSlots = new Set();
  const seenInstances = new Set();
  for (let index = 0; index < expectedSlots.length; index += 1) {
    const entry = ledger.slots[index];
    const expected = expectedSlots[index];
    if (
      !hasExactKeys(entry, LEDGER_SLOT_KEYS)
      || entry.slotId !== expected.slotId
      || entry.instanceId !== expected.instanceId
      || entry.originFormId !== expected.formId
      || entry.initialLevel !== expected.initialLevel
      || entry.targetLevel !== expected.targetLevel
      || seenSlots.has(entry.slotId)
      || seenInstances.has(entry.instanceId)
    ) {
      return profileInspectionFailure("gm_qa_pet_samples_ledger_invalid", "宠物样本批次账本槽位异常，本次操作已取消。");
    }
    seenSlots.add(entry.slotId);
    seenInstances.add(entry.instanceId);
  }
  return {ok: true, present: true, ledger};
}

function normalizedMarker(value) {
  if (
    !hasExactKeys(value, QA_SAMPLE_KEYS)
    || value.schemaVersion !== 1
    || strictIdentity(value.manifestId) === ""
    || strictIdentity(value.slotId) === ""
    || strictIdentity(value.originFormId) === ""
    || value.initialLevel !== 1
    || !Number.isInteger(value.targetLevel)
    || value.targetLevel < 1
    || value.targetLevel > 140
  ) {
    return {ok: false};
  }
  return {ok: true, ...value};
}

function markerMatchesSample(marker, sample) {
  return marker.manifestId === QA_PET_SAMPLES_MANIFEST_ID
    && marker.slotId === sample.slotId
    && marker.originFormId === sample.formId
    && marker.initialLevel === sample.initialLevel
    && marker.targetLevel === sample.targetLevel;
}

function markerForSample(sample) {
  return {
    schemaVersion: 1,
    manifestId: QA_PET_SAMPLES_MANIFEST_ID,
    slotId: sample.slotId,
    originFormId: sample.formId,
    initialLevel: sample.initialLevel,
    targetLevel: sample.targetLevel,
  };
}

function ledgerSlotForSample(sample) {
  return {
    slotId: sample.slotId,
    instanceId: sample.instanceId,
    originFormId: sample.formId,
    initialLevel: sample.initialLevel,
    targetLevel: sample.targetLevel,
  };
}

function advancePetToLevel(pet, targetLevel, settlement, expToNextLevel, maxPetLevel) {
  let next = pet;
  while (next.level < targetLevel) {
    const beforeLevel = next.level;
    const nextExp = expToNextLevel(beforeLevel);
    const currentExp = next.exp;
    if (
      !Number.isInteger(beforeLevel)
      || !Number.isInteger(nextExp)
      || nextExp < 1
      || !Number.isInteger(currentExp)
      || currentExp < 0
      || currentExp >= nextExp
    ) {
      throw new Error("invalid pet exp state");
    }
    const result = settlement.settle(
      next,
      nextExp - currentExp,
      maxPetLevel,
      {name: profilePetNameSafe(next)},
    );
    if (!result || result.changed !== true || !isRecord(result.pet) || result.pet.level !== beforeLevel + 1) {
      throw new Error("pet exp settlement did not advance one level");
    }
    next = result.pet;
  }
  if (next.level !== targetLevel) {
    throw new Error("pet target level mismatch");
  }
  return next;
}

function profilePetNameSafe(pet) {
  return String(pet && (pet.name || pet.formName) || "宠物");
}

function privateSeedForAuthorityPet(pet) {
  return isRecord(pet)
    && isRecord(pet.petGrowth)
    && isRecord(pet.petGrowth.private)
    && typeof pet.petGrowth.private.privateSeed === "string"
    ? pet.petGrowth.private.privateSeed
    : "";
}

function freshSamplesAreCanonical(instances, expectedSlots) {
  if (!Array.isArray(instances)) {
    return false;
  }
  return expectedSlots.every((sample) => {
    const pet = instances.find((entry) => strictIdentity(entry && entry.instanceId) === sample.instanceId);
    const marker = pet && normalizedMarker(pet[QA_PET_SAMPLE_MARKER_KEY]);
    return isRecord(pet)
      && String(pet.petId || "") === sample.instanceId
      && String(pet.formId || "") === sample.formId
      && String(pet.templateId || "") === sample.formId
      && String(pet.growthSpeciesProfileId || "") === sample.growthSpeciesProfileId
      && pet.level === sample.targetLevel
      && isRecord(pet.petGrowth)
      && pet.petGrowth.settledLevel === sample.targetLevel
      && privateSeedForAuthorityPet(pet) !== ""
      && pet.locked === true
      && pet.binding === "bound"
      && pet.bound === true
      && pet.source === QA_PET_SAMPLE_SOURCE
      && marker.ok === true
      && markerMatchesSample(marker, sample);
  });
}

function preparedSamplesRemainValid(instances, expectedSlots, growthCatalog) {
  if (!Array.isArray(instances)) {
    return false;
  }
  return expectedSlots.every((sample) => {
    const pet = instances.find((entry) => strictIdentity(entry && entry.instanceId) === sample.instanceId);
    if (!pet) {
      return true;
    }
    if (
      pet.source !== QA_PET_SAMPLE_SOURCE
      || pet.binding !== "bound"
      || pet.bound !== true
      || !isRecord(pet[QA_PET_SAMPLE_MARKER_KEY])
    ) {
      return false;
    }
    const currentFormId = String(pet.formId || pet.templateId || "");
    if (currentFormId !== sample.formId) {
      // Future evolution may retain immutable QA provenance while changing form.
      return true;
    }
    const profile = growthCatalog.profileById(sample.growthSpeciesProfileId);
    const validation = profile ? validatePetGrowth(pet, profile) : null;
    return Boolean(validation && validation.ok === true);
  });
}

function buildResultSummary(input) {
  const presentCount = Math.max(0, Math.min(QA_PET_SAMPLE_COUNT, Number(input.presentCount || 0)));
  return {
    commandId: GM_PREPARE_QA_PET_SAMPLES_COMMAND_ID,
    summary: {
      manifestId: QA_PET_SAMPLES_MANIFEST_ID,
      changed: input.changed === true,
      alreadyPrepared: input.alreadyPrepared === true,
      sampleCount: QA_PET_SAMPLE_COUNT,
      presentCount,
      missingCount: QA_PET_SAMPLE_COUNT - presentCount,
      blueManDragonLv1Count: QA_PET_BLUE_LV1_COUNT,
      comparisonLv20Count: QA_PET_COMPARISON_LV20_COUNT,
      partyAdded: Math.max(0, Number(input.partyAdded || 0)),
      storageAdded: Math.max(0, Number(input.storageAdded || 0)),
      reservedCaptureSlots: Math.max(0, Number(input.reservedCaptureSlots || 0)),
      primaryInstanceId: String(input.primaryInstanceId || ""),
      profileRevisionBefore: Math.max(0, Number(input.profileRevisionBefore || 0)),
      profileRevisionAfter: Math.max(0, Number(input.profileRevisionAfter || 0)),
      schemaVersion: 1,
    },
    schemaVersion: 1,
  };
}

function instanceIdForSlot(accountId, slotId) {
  const accountDigest = crypto.createHash("sha256").update(String(accountId || "")).digest("hex").slice(0, 16);
  return `pet_gmqa_${accountDigest}_${slotId}`;
}

function profileInspectionFailure(code, message) {
  return {ok: false, code, message};
}

function canonicalIsoTimestamp(value) {
  if (typeof value !== "string" || value === "") {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function strictRevision(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function strictIdentity(value) {
  return typeof value === "string"
    && value !== ""
    && value === value.trim()
    && value.length <= 160
    ? value
    : "";
}

function hasExactKeys(value, keys) {
  return isPlainRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => hasOwn(value, key));
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPlainRecord(value) {
  if (!isRecord(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

module.exports = {
  GM_PREPARE_QA_PET_SAMPLES_COMMAND_ID,
  QA_PET_BLUE_LV1_COUNT,
  QA_PET_COMPARISON_LV20_COUNT,
  QA_PET_SAMPLE_COUNT,
  QA_PET_SAMPLE_MANIFESTS_PROFILE_KEY,
  QA_PET_SAMPLE_MARKER_KEY,
  QA_PET_SAMPLE_PLAN,
  QA_PET_SAMPLES_MANIFEST_ID,
  createGmQaPetsDomain,
};
