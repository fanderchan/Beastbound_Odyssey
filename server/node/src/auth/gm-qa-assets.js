"use strict";

const crypto = require("node:crypto");
const {
  addEquipmentEnvelopeToBank,
  addOrdinaryItemToBank,
} = require("./bank-profile-state");
const {
  EQUIPMENT_SLOTS_VERSION,
  auditEquipmentProfileState,
  grantFreshBackpackEquipmentInstances,
  readEquipmentInstanceState,
} = require("./equipment-profile-state");
const {
  exportBackpackEquipmentEnvelope,
} = require("./equipment-transfer-envelope");
const {
  createEquipmentEnvelopeOwnershipRegistry,
} = require("./equipment-envelope-registry");

const GM_PREPARE_QA_ASSETS_COMMAND_ID = "gm_prepare_qa_assets";
const QA_ASSETS_MANIFEST_ID = "qa_assets_v1";
const QA_ASSET_MANIFESTS_PROFILE_KEY = "gmQaAssetManifests";
const QA_ASSET_SAMPLE_MARKER_KEY = "qaAssetSample";
const QA_ASSET_SOURCE = "gm_qa_asset_manifest";
const QA_ASSET_BANK_TABS = 6;
const QA_ASSET_BANK_SLOTS_PER_TAB = 15;
const QA_ASSET_BANK_SLOT_CAPACITY = QA_ASSET_BANK_TABS * QA_ASSET_BANK_SLOTS_PER_TAB;
const QA_ASSET_RESERVED_BANK_SLOTS = 1;

// This list is deliberately explicit. A catalog addition must create a new
// manifest version instead of silently widening a privileged GM grant.
const QA_ASSET_ORDINARY_TARGETS = Object.freeze([
  Object.freeze({itemId: "item_meat_small", count: 1}),
  Object.freeze({itemId: "tutorial_worn_hide", count: 1}),
  Object.freeze({itemId: "item_heal_all_5", count: 1}),
  Object.freeze({itemId: "item_heal_single_5", count: 1}),
  Object.freeze({itemId: "item_poison_single_5", count: 1}),
  Object.freeze({itemId: "item_poison_all_5", count: 1}),
  Object.freeze({itemId: "item_cleanse_single_5", count: 1}),
  Object.freeze({itemId: "capture_rope_basic", count: 1}),
  Object.freeze({itemId: "capture_net", count: 1}),
  Object.freeze({itemId: "capture_net_reinforced", count: 1}),
  Object.freeze({itemId: "capture_poison_wuli_net", count: 1}),
  Object.freeze({itemId: "encounter_stone_low", count: 1}),
  Object.freeze({itemId: "encounter_stone_mid", count: 1}),
  Object.freeze({itemId: "encounter_stone_high", count: 1}),
  Object.freeze({itemId: "trail_ration_pack", count: 1}),
  Object.freeze({itemId: "item_pet_salve_mid", count: 1}),
  Object.freeze({itemId: "item_pet_salve_large", count: 1}),
  Object.freeze({itemId: "encounter_stone_patrol", count: 1}),
  Object.freeze({itemId: "quest_welfare_token", count: 1}),
  Object.freeze({itemId: "quest_field_note", count: 1}),
  Object.freeze({itemId: "item_pet_exp_pill_lv131", count: 1}),
  Object.freeze({itemId: "mm_stone_hp_basic", count: 1}),
  Object.freeze({itemId: "mm_stone_hp_mid", count: 1}),
  Object.freeze({itemId: "mm_stone_hp_high", count: 1}),
  Object.freeze({itemId: "mm_stone_attack_basic", count: 1}),
  Object.freeze({itemId: "mm_stone_attack_mid", count: 1}),
  Object.freeze({itemId: "mm_stone_attack_high", count: 1}),
  Object.freeze({itemId: "mm_stone_defense_basic", count: 1}),
  Object.freeze({itemId: "mm_stone_defense_mid", count: 1}),
  Object.freeze({itemId: "mm_stone_defense_high", count: 1}),
  Object.freeze({itemId: "mm_stone_quick_basic", count: 1}),
  Object.freeze({itemId: "mm_stone_quick_mid", count: 1}),
  Object.freeze({itemId: "mm_stone_quick_high", count: 1}),
  Object.freeze({itemId: "pet_rebirth_mm1_egg", count: 1}),
  Object.freeze({itemId: "pet_rebirth_mm2_egg", count: 1}),
  Object.freeze({itemId: "rebirth_starter_four_spirit_cub_egg", count: 1}),
  Object.freeze({itemId: "novice_battle_pet_egg", count: 1}),
  Object.freeze({itemId: "novice_tiger_egg", count: 1}),
  Object.freeze({itemId: "thunder_dragon_egg", count: 1}),
  Object.freeze({itemId: "equip_frag_wood_basic", count: 20}),
  Object.freeze({itemId: "equip_frag_hide_basic", count: 20}),
  Object.freeze({itemId: "ring_earth_trial", count: 1}),
  Object.freeze({itemId: "ring_water_trial", count: 1}),
  Object.freeze({itemId: "ring_fire_trial", count: 1}),
  Object.freeze({itemId: "ring_wind_trial", count: 1}),
]);

const QA_ASSET_EQUIPMENT_PLAN = Object.freeze([
  Object.freeze({slotId: "equipment_01", itemId: "item_player_exp_pill_lv131"}),
  Object.freeze({slotId: "equipment_02", itemId: "item_exp_pill_lv1"}),
  Object.freeze({slotId: "equipment_03", itemId: "item_exp_pill_lv131"}),
  Object.freeze({slotId: "equipment_04", itemId: "item_exp_pill_lv140"}),
  Object.freeze({slotId: "equipment_05", itemId: "accessory_firebud_charm"}),
  Object.freeze({slotId: "equipment_06", itemId: "accessory_wind_ring"}),
  Object.freeze({slotId: "equipment_07", itemId: "helm_leather_cap"}),
  Object.freeze({slotId: "equipment_08", itemId: "weapon_training_spear"}),
  Object.freeze({slotId: "equipment_09", itemId: "armor_moist_cloth"}),
  Object.freeze({slotId: "equipment_10", itemId: "weapon_stone_dagger"}),
  Object.freeze({slotId: "equipment_11", itemId: "gloves_hide"}),
  Object.freeze({slotId: "equipment_12", itemId: "boots_grass"}),
  Object.freeze({slotId: "equipment_13", itemId: "helm_dew_band"}),
  Object.freeze({slotId: "equipment_14", itemId: "weapon_blessed_club"}),
  Object.freeze({slotId: "equipment_15", itemId: "armor_toxin_wrap"}),
  Object.freeze({slotId: "equipment_16", itemId: "boots_mist_sandals"}),
  Object.freeze({slotId: "equipment_17", itemId: "weapon_wooden_club"}),
  Object.freeze({slotId: "equipment_18", itemId: "weapon_stone_axe"}),
  Object.freeze({slotId: "equipment_19", itemId: "weapon_bone_blade"}),
  Object.freeze({slotId: "equipment_20", itemId: "weapon_rebirth_bone_axe"}),
  Object.freeze({slotId: "equipment_21", itemId: "weapon_hardwood_club"}),
  Object.freeze({slotId: "equipment_22", itemId: "armor_hide_vest"}),
  Object.freeze({slotId: "equipment_23", itemId: "armor_stitched_hide_vest"}),
  Object.freeze({slotId: "equipment_24", itemId: "armor_grace_cloth_3"}),
  Object.freeze({slotId: "equipment_25", itemId: "accessory_moist_charm_3"}),
  Object.freeze({slotId: "equipment_26", itemId: "armor_grace_cloth_5"}),
  Object.freeze({slotId: "equipment_27", itemId: "accessory_moist_charm_5"}),
  Object.freeze({slotId: "equipment_28", itemId: "weapon_flame_trial_spear"}),
  Object.freeze({slotId: "equipment_29", itemId: "boots_gale_trial"}),
  Object.freeze({slotId: "equipment_30", itemId: "accessory_four_spirit_charm"}),
  Object.freeze({slotId: "equipment_31", itemId: "weapon_shadow_group_bow"}),
]);

const QA_ASSET_ORDINARY_TARGET_QUANTITY = QA_ASSET_ORDINARY_TARGETS.reduce(
  (sum, entry) => sum + entry.count,
  0,
);
const LEDGER_KEYS = Object.freeze([
  "schemaVersion",
  "manifestId",
  "preparedAt",
  "originalAccountId",
  "ordinaryTargets",
  "equipmentSamples",
  "bankFreeSlotsAfterPrepare",
]);
const LEDGER_ORDINARY_KEYS = Object.freeze(["itemId", "count"]);
const LEDGER_EQUIPMENT_KEYS = Object.freeze(["slotId", "itemId", "initialEnvelopeId"]);
const QA_ASSET_MARKER_KEYS = Object.freeze([
  "schemaVersion",
  "manifestId",
  "slotId",
  "originItemId",
  "originalAccountId",
]);

function createGmQaAssetsDomain(ctx) {
  const {
    CURRENT_PROFILE_SCHEMA_VERSION,
    bagItemById,
    bagItemStackLimit,
    bagItems,
    battleEquipmentCatalog,
    clone,
    cloneAuthorityRoot = clone,
    equipmentTransferOptions,
    expToNextLevel,
    fail,
    gmCommandAccess,
    isoNow,
    isEquipmentItemId,
    load,
    ok,
    persistProfileForAccount,
    profileBackpackSlotLimit,
    profileBankStateOptions,
    profileSummaryForAccount,
    publicAccount,
    rawBackpackAssetConflict,
    readProfileBankState,
    recordGmCommandAudit,
    save,
  } = ctx;

  function auditedFailure(data, access, code, message, details = {}) {
    const audit = recordGmCommandAudit(data, access, false, message, details);
    if (audit.recorded !== false) {
      save(data);
    }
    return fail(code, message, audit.auditId ? {auditId: audit.auditId} : {});
  }

  function prepareGmQaAssets(token, payload = {}) {
    const data = load();
    const access = gmCommandAccess(data, token, GM_PREPARE_QA_ASSETS_COMMAND_ID);
    if (!access.ok) {
      return auditedFailure(data, access, access.code, access.message);
    }
    if (!validPayload(payload)) {
      return auditedFailure(
        data,
        access,
        "gm_qa_assets_payload_invalid",
        "GM装备与银行档参数不正确，请刷新后重试。",
      );
    }

    const manifest = resolveManifest({
      bagItemById,
      bagItemStackLimit,
      bagItems,
      battleEquipmentCatalog,
      isEquipmentItemId,
    });
    if (!manifest.ok) {
      return auditedFailure(data, access, manifest.code, manifest.message, {
        manifestId: QA_ASSETS_MANIFEST_ID,
      });
    }
    const existing = existingProfileForAccount(data, access.resolved.account);
    if (!existing.ok) {
      return auditedFailure(data, access, existing.code, existing.message, {
        manifestId: QA_ASSETS_MANIFEST_ID,
      });
    }
    const accountId = String(access.resolved.account.accountId || "");
    const playerId = String(existing.binding.playerId || "");
    manifest.equipmentSamples = withInitialEnvelopeIds(accountId, manifest.equipmentSamples);
    const sourceProfile = existing.profileDoc.profile;
    const beforeRevision = strictRevision(existing.binding.profileRevision);
    const profileState = inspectSourceProfile(sourceProfile, {
      currentProfileSchemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
      battleEquipmentCatalog,
      rawBackpackAssetConflict,
      readProfileBankState,
    });
    if (!profileState.ok) {
      return auditedFailure(data, access, profileState.code, profileState.message, revisionDetails(beforeRevision));
    }
    const bankOptions = profileBankStateOptions();
    if (
      !isRecord(bankOptions)
      || bankOptions.tabCount !== QA_ASSET_BANK_TABS
      || bankOptions.slotsPerTab !== QA_ASSET_BANK_SLOTS_PER_TAB
    ) {
      return auditedFailure(
        data,
        access,
        "gm_qa_assets_bank_config_invalid",
        "银行容量配置与GM测试档不一致，本次操作已取消。",
        revisionDetails(beforeRevision),
      );
    }

    const ledger = readLedger(sourceProfile, accountId, manifest.equipmentSamples);
    if (!ledger.ok) {
      return auditedFailure(data, access, ledger.code, ledger.message, revisionDetails(beforeRevision));
    }
    const markerInspection = inspectQaAssetMarkers(data, accountId, playerId, manifest.equipmentSamples);
    if (!markerInspection.ok) {
      return auditedFailure(data, access, markerInspection.code, markerInspection.message, revisionDetails(beforeRevision));
    }
    const envelopeRegistry = createEquipmentEnvelopeOwnershipRegistry(data);
    if (envelopeRegistry.conflicts.length > 0) {
      return auditedFailure(
        data,
        access,
        "equipment_transfer_envelope_duplicate",
        "装备托管档案存在重复归属，相关资产操作已暂停，请联系GM处理。",
        revisionDetails(beforeRevision),
      );
    }

    if (ledger.present) {
      if (profileState.bank.unlockedTabs !== QA_ASSET_BANK_TABS) {
        return auditedFailure(
          data,
          access,
          "gm_qa_assets_state_invalid",
          "GM装备与银行档状态异常，本次操作已取消。",
          revisionDetails(beforeRevision),
        );
      }
      const result = buildResultSummary({
        changed: false,
        alreadyPrepared: true,
        bank: profileState.bank,
        bankEquipmentSlotIds: markerInspection.currentBankSlotIds,
        profileRevisionBefore: beforeRevision,
        profileRevisionAfter: beforeRevision,
      });
      const message = missingAssetCount(result.summary) > 0
        ? "GM装备与银行档已经准备过；当前银行有样本移出或消耗，不会自动补发。"
        : "GM装备与银行档已经准备完成，不会重复发放。";
      const audit = recordGmCommandAudit(data, access, true, message, auditDetails(result.summary, accountId));
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

    if (markerInspection.accountEntries.length > 0) {
      return auditedFailure(
        data,
        access,
        "gm_qa_assets_provenance_conflict",
        "发现缺少永久账本的GM装备样本，本次操作已取消。",
        revisionDetails(beforeRevision),
      );
    }
    for (const sample of manifest.equipmentSamples) {
      if (!envelopeRegistry.isAvailable(sample.initialEnvelopeId)) {
        return auditedFailure(
          data,
          access,
          "gm_qa_assets_provenance_conflict",
          "发现已经使用过的GM装备样本身份，本次操作已取消。",
          revisionDetails(beforeRevision),
        );
      }
    }

    let profile = clone(sourceProfile);
    let bank = clone(profileState.bank);
    bank.unlockedTabs = QA_ASSET_BANK_TABS;
    const canonicalUnlockedBank = readProfileBankState(bank);
    if (!canonicalUnlockedBank.ok) {
      return auditedFailure(
        data,
        access,
        canonicalUnlockedBank.code || "gm_qa_assets_bank_invalid",
        canonicalUnlockedBank.message || "银行档案异常，本次操作已取消。",
        revisionDetails(beforeRevision),
      );
    }
    bank = canonicalUnlockedBank.bank;

    for (const target of QA_ASSET_ORDINARY_TARGETS) {
      const missing = Math.max(0, target.count - bankItemCount(bank, target.itemId));
      if (missing <= 0) {
        continue;
      }
      const added = addOrdinaryItemToBank(
        bank,
        target.itemId,
        missing,
        -1,
        battleEquipmentCatalog,
        bankOptions,
      );
      if (!added.ok) {
        return auditedFailure(
          data,
          access,
          "gm_qa_assets_capacity_full",
          "银行空间不足，GM装备与银行档未作任何改变。",
          revisionDetails(beforeRevision),
        );
      }
      bank = added.bank;
    }

    const originalBackpackSlots = clone(sourceProfile.backpackSlots);
    const originalCaptureTools = cloneOptional(sourceProfile.captureTools, clone);
    const originalEquipmentInstances = cloneOptional(sourceProfile.equipmentInstances, clone);
    const originalEquipmentSlotInstanceIds = cloneOptional(sourceProfile.equipmentSlotInstanceIds, clone);
    const originalSerial = sourceProfile.nextEquipmentInstanceSerial;
    for (const sample of manifest.equipmentSamples) {
      const beforeStagingSlots = clone(profile.backpackSlots);
      const stagingSlotIndex = beforeStagingSlots.findIndex((slot) => (
        isPlainRecord(slot) && Object.keys(slot).length === 0
      ));
      if (stagingSlotIndex < 0) {
        return auditedFailure(
          data,
          access,
          "gm_qa_assets_backpack_staging_full",
          "背包需要一个临时空位来生成正式装备实例，GM测试档未作任何改变。",
          revisionDetails(beforeRevision),
        );
      }
      profile.backpackSlots = clone(beforeStagingSlots);
      profile.backpackSlots[stagingSlotIndex] = {itemId: sample.itemId, count: 1};
      const granted = grantFreshBackpackEquipmentInstances(
        profile,
        battleEquipmentCatalog,
        [{itemId: sample.itemId, count: 1}],
        QA_ASSET_SOURCE,
        {expToNextLevel},
      );
      if (!granted.ok || granted.instanceIds.length !== 1) {
        return auditedFailure(
          data,
          access,
          granted.code || "gm_qa_assets_creation_failed",
          granted.message || "正式装备实例生成失败，GM测试档未作任何改变。",
          revisionDetails(beforeRevision),
        );
      }
      const instanceId = granted.instanceIds[0];
      profile.equipmentInstances[instanceId][QA_ASSET_SAMPLE_MARKER_KEY] = markerForSample(sample, accountId);
      const exported = exportBackpackEquipmentEnvelope(
        profile,
        battleEquipmentCatalog,
        sample.itemId,
        instanceId,
        {
          ...equipmentTransferOptions,
          backpackSlotLimit: profileBackpackSlotLimit(profile),
          stackLimit: bagItemStackLimit(sample.itemId),
          sourceSlotIndex: stagingSlotIndex,
          envelopeId: sample.initialEnvelopeId,
        },
      );
      if (!exported.ok) {
        return auditedFailure(
          data,
          access,
          exported.code || "gm_qa_assets_creation_failed",
          exported.message || "正式装备信封生成失败，GM测试档未作任何改变。",
          revisionDetails(beforeRevision),
        );
      }
      if (!sameDocument(exported.profile.backpackSlots, beforeStagingSlots)) {
        return auditedFailure(
          data,
          access,
          "gm_qa_assets_backpack_restore_failed",
          "装备生成后背包未能原样恢复，GM测试档未作任何改变。",
          revisionDetails(beforeRevision),
        );
      }
      profile = exported.profile;
      const banked = addEquipmentEnvelopeToBank(
        bank,
        exported.envelope,
        -1,
        battleEquipmentCatalog,
        bankOptions,
      );
      if (!banked.ok) {
        return auditedFailure(
          data,
          access,
          "gm_qa_assets_capacity_full",
          "银行空间不足，GM装备与银行档未作任何改变。",
          revisionDetails(beforeRevision),
        );
      }
      bank = banked.bank;
    }

    const bankUsage = bankSlotUsage(bank);
    if (bankUsage.free < QA_ASSET_RESERVED_BANK_SLOTS) {
      return auditedFailure(
        data,
        access,
        "gm_qa_assets_capacity_full",
        "银行至少需要保留一个测试空位，GM装备与银行档未作任何改变。",
        revisionDetails(beforeRevision),
      );
    }
    if (
      !sameDocument(profile.backpackSlots, originalBackpackSlots)
      || !sameDocument(profile.captureTools, originalCaptureTools)
      || !sameDocument(profile.equipmentInstances, originalEquipmentInstances)
      || !sameDocument(profile.equipmentSlotInstanceIds, originalEquipmentSlotInstanceIds)
      || profile.nextEquipmentInstanceSerial !== originalSerial + QA_ASSET_EQUIPMENT_PLAN.length
    ) {
      return auditedFailure(
        data,
        access,
        "gm_qa_assets_creation_failed",
        "装备样本生成后档案不满足原子约束，本次操作已取消。",
        revisionDetails(beforeRevision),
      );
    }

    profile.bank = bank;
    const ledgers = hasOwn(profile, QA_ASSET_MANIFESTS_PROFILE_KEY)
      ? clone(profile[QA_ASSET_MANIFESTS_PROFILE_KEY])
      : {};
    ledgers[QA_ASSETS_MANIFEST_ID] = {
      schemaVersion: 1,
      manifestId: QA_ASSETS_MANIFEST_ID,
      preparedAt: isoNow(ctx.now),
      originalAccountId: accountId,
      ordinaryTargets: QA_ASSET_ORDINARY_TARGETS.map((entry) => ({...entry})),
      equipmentSamples: manifest.equipmentSamples.map((entry) => ({
        slotId: entry.slotId,
        itemId: entry.itemId,
        initialEnvelopeId: entry.initialEnvelopeId,
      })),
      bankFreeSlotsAfterPrepare: bankUsage.free,
    };
    profile[QA_ASSET_MANIFESTS_PROFILE_KEY] = ledgers;

    const finalEquipmentAudit = auditEquipmentProfileState(profile, battleEquipmentCatalog);
    const finalBackpackConflict = rawBackpackAssetConflict(profile);
    const finalBank = readProfileBankState(profile.bank);
    if (!finalEquipmentAudit.ok || finalBackpackConflict || !finalBank.ok) {
      return auditedFailure(
        data,
        access,
        "gm_qa_assets_creation_failed",
        "GM装备与银行档最终校验失败，档案未改变。",
        revisionDetails(beforeRevision),
      );
    }

    const candidateData = cloneAuthorityRoot(data);
    candidateData.profiles[playerId] = {
      ...clone(existing.profileDoc),
      profile: clone(profile),
    };
    const finalMarkers = inspectQaAssetMarkers(candidateData, accountId, playerId, manifest.equipmentSamples);
    const finalRegistry = createEquipmentEnvelopeOwnershipRegistry(candidateData);
    if (
      !finalMarkers.ok
      || finalMarkers.currentBankSlotIds.size !== QA_ASSET_EQUIPMENT_PLAN.length
      || finalRegistry.conflicts.length > 0
    ) {
      return auditedFailure(
        data,
        access,
        "gm_qa_assets_creation_failed",
        "GM装备样本身份校验失败，档案未改变。",
        revisionDetails(beforeRevision),
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
      bank: finalBank.bank,
      bankEquipmentSlotIds: finalMarkers.currentBankSlotIds,
      profileRevisionBefore: beforeRevision,
      profileRevisionAfter: afterRevision,
    });
    const message = "GM装备与银行档已准备：45类物资和31件正式装备已存入银行。";
    const audit = recordGmCommandAudit(data, access, true, message, auditDetails(result.summary, accountId));
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

  return Object.freeze({prepareGmQaAssets});
}

function validPayload(value) {
  return isPlainRecord(value)
    && Object.keys(value).length === 1
    && hasOwn(value, "manifestId")
    && value.manifestId === QA_ASSETS_MANIFEST_ID;
}

function resolveManifest(ctx) {
  const catalogItems = typeof ctx.bagItems === "function" ? ctx.bagItems() : [];
  const equipmentById = ctx.battleEquipmentCatalog && ctx.battleEquipmentCatalog.itemById;
  if (
    !Array.isArray(catalogItems)
    || catalogItems.length !== QA_ASSET_ORDINARY_TARGETS.length + QA_ASSET_EQUIPMENT_PLAN.length
    || !(equipmentById instanceof Map)
    || equipmentById.size !== QA_ASSET_EQUIPMENT_PLAN.length
  ) {
    return manifestFailure();
  }
  const catalogIds = new Set();
  for (const item of catalogItems) {
    const itemId = strictIdentity(item && item.id);
    if (
      itemId === ""
      || catalogIds.has(itemId)
      || !Number.isSafeInteger(item.stackLimit)
      || item.stackLimit < 1
    ) {
      return manifestFailure();
    }
    catalogIds.add(itemId);
  }
  const manifestIds = new Set();
  for (const target of QA_ASSET_ORDINARY_TARGETS) {
    if (
      manifestIds.has(target.itemId)
      || !catalogIds.has(target.itemId)
      || !ctx.bagItemById(target.itemId)
      || ctx.isEquipmentItemId(target.itemId)
      || !Number.isSafeInteger(target.count)
      || target.count < 1
      || target.count > ctx.bagItemStackLimit(target.itemId)
    ) {
      return manifestFailure();
    }
    manifestIds.add(target.itemId);
  }
  const slotIds = new Set();
  const equipmentSamples = [];
  for (const sample of QA_ASSET_EQUIPMENT_PLAN) {
    if (
      slotIds.has(sample.slotId)
      || manifestIds.has(sample.itemId)
      || !catalogIds.has(sample.itemId)
      || !ctx.bagItemById(sample.itemId)
      || !ctx.isEquipmentItemId(sample.itemId)
      || !equipmentById.has(sample.itemId)
    ) {
      return manifestFailure();
    }
    slotIds.add(sample.slotId);
    manifestIds.add(sample.itemId);
    equipmentSamples.push({...sample});
  }
  if (
    manifestIds.size !== catalogIds.size
    || Array.from(catalogIds).some((itemId) => !manifestIds.has(itemId))
    || Array.from(equipmentById.keys()).some((itemId) => !manifestIds.has(itemId))
  ) {
    return manifestFailure();
  }
  return {ok: true, equipmentSamples};
}

function manifestFailure() {
  return {
    ok: false,
    code: "gm_qa_assets_manifest_invalid",
    message: "GM装备与银行档清单与当前物品目录不一致，本次操作已取消。",
  };
}

function inspectSourceProfile(profile, ctx) {
  if (
    !isRecord(profile)
    || profile.schemaVersion !== ctx.currentProfileSchemaVersion
    || profile.equipmentSlotsVersion !== EQUIPMENT_SLOTS_VERSION
    || !Array.isArray(profile.backpackSlots)
    || !Number.isSafeInteger(profile.nextEquipmentInstanceSerial)
    || profile.nextEquipmentInstanceSerial < 1
  ) {
    return profileFailure("gm_qa_assets_profile_invalid", "装备或银行档案结构异常，本次操作已取消。");
  }
  const backpackConflict = ctx.rawBackpackAssetConflict(profile);
  if (backpackConflict) {
    return backpackConflict;
  }
  const equipmentAudit = auditEquipmentProfileState(profile, ctx.battleEquipmentCatalog);
  if (!equipmentAudit.ok) {
    return equipmentAudit;
  }
  const instanceState = readEquipmentInstanceState(profile, ctx.battleEquipmentCatalog);
  if (!instanceState.ok || instanceState.nextSerial !== profile.nextEquipmentInstanceSerial) {
    return profileFailure("gm_qa_assets_profile_invalid", "装备实例序号不规范，本次操作已取消。");
  }
  const bank = ctx.readProfileBankState(profile.bank);
  if (!bank.ok) {
    return bank;
  }
  return {ok: true, bank: bank.bank};
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

function readLedger(profile, accountId, equipmentSamples) {
  if (!hasOwn(profile, QA_ASSET_MANIFESTS_PROFILE_KEY)) {
    return {ok: true, present: false};
  }
  const ledgers = profile[QA_ASSET_MANIFESTS_PROFILE_KEY];
  if (!isPlainRecord(ledgers)) {
    return ledgerFailure();
  }
  if (!hasOwn(ledgers, QA_ASSETS_MANIFEST_ID)) {
    return {ok: true, present: false};
  }
  const ledger = ledgers[QA_ASSETS_MANIFEST_ID];
  if (
    !hasExactKeys(ledger, LEDGER_KEYS)
    || ledger.schemaVersion !== 1
    || ledger.manifestId !== QA_ASSETS_MANIFEST_ID
    || ledger.originalAccountId !== accountId
    || !canonicalIsoTimestamp(ledger.preparedAt)
    || !Array.isArray(ledger.ordinaryTargets)
    || !Array.isArray(ledger.equipmentSamples)
    || ledger.ordinaryTargets.length !== QA_ASSET_ORDINARY_TARGETS.length
    || ledger.equipmentSamples.length !== equipmentSamples.length
    || !Number.isSafeInteger(ledger.bankFreeSlotsAfterPrepare)
    || ledger.bankFreeSlotsAfterPrepare < QA_ASSET_RESERVED_BANK_SLOTS
    || ledger.bankFreeSlotsAfterPrepare > QA_ASSET_BANK_SLOT_CAPACITY
  ) {
    return ledgerFailure();
  }
  for (let index = 0; index < QA_ASSET_ORDINARY_TARGETS.length; index += 1) {
    const entry = ledger.ordinaryTargets[index];
    const expected = QA_ASSET_ORDINARY_TARGETS[index];
    if (!hasExactKeys(entry, LEDGER_ORDINARY_KEYS) || !sameDocument(entry, expected)) {
      return ledgerFailure();
    }
  }
  const seenSlots = new Set();
  const seenEnvelopes = new Set();
  for (let index = 0; index < equipmentSamples.length; index += 1) {
    const entry = ledger.equipmentSamples[index];
    const expected = equipmentSamples[index];
    if (
      !hasExactKeys(entry, LEDGER_EQUIPMENT_KEYS)
      || entry.slotId !== expected.slotId
      || entry.itemId !== expected.itemId
      || entry.initialEnvelopeId !== expected.initialEnvelopeId
      || seenSlots.has(entry.slotId)
      || seenEnvelopes.has(entry.initialEnvelopeId)
    ) {
      return ledgerFailure();
    }
    seenSlots.add(entry.slotId);
    seenEnvelopes.add(entry.initialEnvelopeId);
  }
  return {ok: true, present: true, ledger};
}

function ledgerFailure() {
  return profileFailure("gm_qa_assets_ledger_invalid", "GM装备与银行档永久账本异常，本次操作已取消。");
}

function inspectQaAssetMarkers(data, accountId, playerId, equipmentSamples) {
  const expectedBySlot = new Map(equipmentSamples.map((sample) => [sample.slotId, sample]));
  const entries = collectQaAssetMarkerEntries(data);
  const seen = new Set();
  const accountEntries = [];
  const currentBankSlotIds = new Set();
  for (const entry of entries) {
    const marker = normalizeMarker(entry.state[QA_ASSET_SAMPLE_MARKER_KEY]);
    if (!marker.ok) {
      return markerFailure("GM装备样本来源标记异常，本次操作已取消。");
    }
    if (marker.manifestId !== QA_ASSETS_MANIFEST_ID) {
      continue;
    }
    const expected = expectedBySlot.get(marker.slotId);
    if (
      !expected
      || marker.originItemId !== expected.itemId
      || entry.itemId !== expected.itemId
      || String(entry.state.itemId || "") !== expected.itemId
      || entry.state.source !== QA_ASSET_SOURCE
    ) {
      return markerFailure("GM装备样本身份与来源不一致，本次操作已取消。");
    }
    const identity = `${marker.originalAccountId}:${marker.slotId}`;
    if (seen.has(identity)) {
      return markerFailure("同一GM装备样本槽存在多个实例，本次操作已取消。");
    }
    seen.add(identity);
    if (marker.originalAccountId !== accountId) {
      continue;
    }
    accountEntries.push({...entry, marker});
    if (entry.container === "bank" && entry.ownerPlayerId === playerId) {
      currentBankSlotIds.add(marker.slotId);
    }
  }
  return {ok: true, accountEntries, currentBankSlotIds};
}

function collectQaAssetMarkerEntries(data) {
  const entries = [];
  const append = (state, itemId, container, ownerPlayerId = "") => {
    if (isRecord(state) && hasOwn(state, QA_ASSET_SAMPLE_MARKER_KEY)) {
      entries.push({state, itemId: String(itemId || ""), container, ownerPlayerId});
    }
  };
  for (const [profileKey, document] of Object.entries(isRecord(data && data.profiles) ? data.profiles : {})) {
    const profile = isRecord(document) && isRecord(document.profile) ? document.profile : null;
    if (!profile) {
      continue;
    }
    const ownerPlayerId = String(document.playerId || profileKey || "");
    for (const instance of Object.values(isRecord(profile.equipmentInstances) ? profile.equipmentInstances : {})) {
      append(instance, instance && instance.itemId, "profile", ownerPlayerId);
    }
    const bank = isRecord(profile.bank) ? profile.bank : {};
    for (const slot of Array.isArray(bank.slots) ? bank.slots : []) {
      for (const envelope of Array.isArray(slot && slot.equipmentEnvelopes) ? slot.equipmentEnvelopes : []) {
        append(envelope && envelope.instanceState, envelope && envelope.itemId, "bank", ownerPlayerId);
      }
    }
  }
  for (const mail of Object.values(isRecord(data && data.mailMessages) ? data.mailMessages : {})) {
    for (const envelope of Array.isArray(mail && mail.equipmentEnvelopes) ? mail.equipmentEnvelopes : []) {
      append(envelope && envelope.instanceState, envelope && envelope.itemId, "mail");
    }
  }
  for (const listing of Object.values(isRecord(data && data.marketListings) ? data.marketListings : {})) {
    const envelope = listing && listing.equipmentEnvelope;
    append(envelope && envelope.instanceState, envelope && envelope.itemId, "market");
  }
  return entries;
}

function normalizeMarker(value) {
  if (
    !hasExactKeys(value, QA_ASSET_MARKER_KEYS)
    || value.schemaVersion !== 1
    || strictIdentity(value.manifestId) === ""
    || strictIdentity(value.slotId) === ""
    || strictIdentity(value.originItemId) === ""
    || strictIdentity(value.originalAccountId) === ""
  ) {
    return {ok: false};
  }
  return {ok: true, ...value};
}

function markerForSample(sample, accountId) {
  return {
    schemaVersion: 1,
    manifestId: QA_ASSETS_MANIFEST_ID,
    slotId: sample.slotId,
    originItemId: sample.itemId,
    originalAccountId: accountId,
  };
}

function markerFailure(message) {
  return profileFailure("gm_qa_assets_provenance_conflict", message);
}

function initialEnvelopeId(accountId, slotId) {
  const digest = crypto.createHash("sha256")
    .update(`${accountId}:${QA_ASSETS_MANIFEST_ID}:${slotId}`)
    .digest("hex")
    .slice(0, 40);
  return `eqx_${digest}`;
}

function withInitialEnvelopeIds(accountId, samples) {
  return samples.map((sample) => ({
    ...sample,
    initialEnvelopeId: initialEnvelopeId(accountId, sample.slotId),
  }));
}

function buildResultSummary(options) {
  const bank = options.bank;
  const ordinaryPresent = QA_ASSET_ORDINARY_TARGETS.filter((target) => (
    bankItemCount(bank, target.itemId) >= target.count
  )).length;
  const equipmentPresent = options.bankEquipmentSlotIds.size;
  const usage = bankSlotUsage(bank);
  return {
    commandId: GM_PREPARE_QA_ASSETS_COMMAND_ID,
    summary: {
      manifestId: QA_ASSETS_MANIFEST_ID,
      changed: options.changed,
      alreadyPrepared: options.alreadyPrepared,
      catalogItemKinds: QA_ASSET_ORDINARY_TARGETS.length + QA_ASSET_EQUIPMENT_PLAN.length,
      ordinaryItemKinds: QA_ASSET_ORDINARY_TARGETS.length,
      equipmentItemKinds: QA_ASSET_EQUIPMENT_PLAN.length,
      ordinaryTargetQuantity: QA_ASSET_ORDINARY_TARGET_QUANTITY,
      equipmentSampleCount: QA_ASSET_EQUIPMENT_PLAN.length,
      ordinaryItemKindsPresent: ordinaryPresent,
      ordinaryItemKindsMissing: QA_ASSET_ORDINARY_TARGETS.length - ordinaryPresent,
      bankEquipmentSamplesPresent: equipmentPresent,
      bankEquipmentSamplesMissing: QA_ASSET_EQUIPMENT_PLAN.length - equipmentPresent,
      bankUnlockedTabs: bank.unlockedTabs,
      bankSlotCapacity: QA_ASSET_BANK_SLOT_CAPACITY,
      bankUsedSlots: usage.used,
      bankFreeSlots: usage.free,
      reservedBankSlots: QA_ASSET_RESERVED_BANK_SLOTS,
      profileRevisionBefore: options.profileRevisionBefore,
      profileRevisionAfter: options.profileRevisionAfter,
      schemaVersion: 1,
    },
    schemaVersion: 1,
  };
}

function auditDetails(summary, accountId) {
  return {
    accountId,
    targetAccountId: accountId,
    manifestId: summary.manifestId,
    changed: summary.changed,
    ordinaryItemKindsPresent: summary.ordinaryItemKindsPresent,
    ordinaryItemKindsMissing: summary.ordinaryItemKindsMissing,
    bankEquipmentSamplesPresent: summary.bankEquipmentSamplesPresent,
    bankEquipmentSamplesMissing: summary.bankEquipmentSamplesMissing,
    bankUsedSlots: summary.bankUsedSlots,
    bankFreeSlots: summary.bankFreeSlots,
    profileRevisionBefore: summary.profileRevisionBefore,
    profileRevisionAfter: summary.profileRevisionAfter,
  };
}

function cloneOptional(value, clone) {
  return value === undefined ? undefined : clone(value);
}

function missingAssetCount(summary) {
  return summary.ordinaryItemKindsMissing + summary.bankEquipmentSamplesMissing;
}

function revisionDetails(revision) {
  return {
    manifestId: QA_ASSETS_MANIFEST_ID,
    profileRevisionBefore: revision,
    profileRevisionAfter: revision,
  };
}

function bankItemCount(bank, itemId) {
  return (Array.isArray(bank && bank.items) ? bank.items : []).reduce((sum, entry) => (
    String(entry && entry.itemId || "") === itemId
      ? sum + safeCount(entry.count)
      : sum
  ), 0);
}

function bankSlotUsage(bank) {
  const slots = Array.isArray(bank && bank.slots) ? bank.slots : [];
  const used = slots.filter((slot) => String(slot && slot.itemId || "") !== "").length;
  return {used, free: Math.max(0, QA_ASSET_BANK_SLOT_CAPACITY - used)};
}

function profileFailure(code, message) {
  return {ok: false, code, message};
}

function strictRevision(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function canonicalIsoTimestamp(value) {
  if (typeof value !== "string" || value === "") {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function strictIdentity(value) {
  return typeof value === "string" && value !== "" && value === value.trim() ? value : "";
}

function hasExactKeys(value, keys) {
  return isPlainRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => hasOwn(value, key));
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isPlainRecord(value) {
  if (!isRecord(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sameDocument(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

module.exports = {
  GM_PREPARE_QA_ASSETS_COMMAND_ID,
  QA_ASSETS_MANIFEST_ID,
  QA_ASSET_BANK_SLOT_CAPACITY,
  QA_ASSET_EQUIPMENT_PLAN,
  QA_ASSET_MANIFESTS_PROFILE_KEY,
  QA_ASSET_ORDINARY_TARGETS,
  QA_ASSET_ORDINARY_TARGET_QUANTITY,
  QA_ASSET_SAMPLE_MARKER_KEY,
  QA_ASSET_SOURCE,
  createGmQaAssetsDomain,
  initialEnvelopeId,
  withInitialEnvelopeIds,
};
