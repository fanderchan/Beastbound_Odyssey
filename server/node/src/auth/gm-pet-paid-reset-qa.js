"use strict";

const crypto = require("node:crypto");
const {
  canonicalPaidResetState,
  inspectPetPaidResetEligibility,
} = require("./pet-paid-reset");
const {resolvePetPaidResetQuote} = require("./pet-paid-reset-policy-catalog");
const {
  setWalletBalance,
  walletBalance,
} = require("./currency-wallet");

const GM_PET_PAID_RESET_QA_COMMAND_ID = "gm_pet_paid_reset_config";
const GM_PET_PAID_RESET_QA_MANIFEST_ID = "pet_paid_reset_qa_v1";
const QA_MANIFESTS_PROFILE_KEY = "gmQaPetSampleManifests";
const QA_SAMPLE_MARKER_KEY = "qaSample";
const QA_SAMPLE_SOURCE = "gm_paid_reset_qa_manifest";
const QA_SAMPLE_PLANS = Object.freeze([
  Object.freeze({slotId: "paid_reset_stage1", stage: 1, targetLevel: 80, name: "重置验收·一转四灵"}),
  Object.freeze({slotId: "paid_reset_stage2", stage: 2, targetLevel: 88, name: "重置验收·二转四灵"}),
]);
const QA_FORM_ID = "rebirth_starter_four_spirit_cub";
const QA_GROWTH_PROFILE_ID = "rebirth_starter_four_spirit_cub_v1";
const QA_WALLET_MINIMUMS = Object.freeze({
  boundDiamonds: 1000,
  diamonds: 1000,
  boundStoneCoins: 1000000,
  stoneCoins: 1000000,
});

function createGmPetPaidResetQaDomain(ctx) {
  const {
    BATTLE_PET_MAX_PER_PARTICIPANT,
    BATTLE_PET_STATE_STANDBY,
    BATTLE_PET_STATE_STORAGE,
    BATTLE_PET_STORAGE_LIMIT,
    MAX_PET_LEVEL,
    activeBattleRoomForAccount,
    clone,
    createDefaultServerPet,
    expToNextLevel,
    fail,
    gmCommandAccess,
    load,
    newPetFactory,
    nextProfilePetInstanceSerial,
    ok,
    persistProfileForAccount,
    petExpSettlement,
    petGrowthCatalog,
    petPaidResetPolicyCatalog,
    petRebirthGrowthCycle,
    profilePartyVisiblePetCount,
    profileStoneCoinLimit,
    profileStoragePetCount,
    profileSummaryForAccount,
    publicAccount,
    rawBackpackAssetConflict,
    recordGmCommandAudit,
    recordProfilePetCodexForm,
    save,
  } = ctx;

  function run(token, payload = {}) {
    const data = load();
    const access = gmCommandAccess(data, token, GM_PET_PAID_RESET_QA_COMMAND_ID);
    if (!access.ok) {
      return auditedFailure(data, access, access.code, access.message);
    }
    if (!validPayload(payload)) {
      return auditedFailure(data, access, "gm_pet_paid_reset_qa_payload_invalid", "宠物重置验收参数不正确，请刷新后重试。");
    }
    const resolved = targetProfile(data, access.resolved.account);
    if (!resolved.ok) {
      return auditedFailure(data, access, resolved.code, resolved.message);
    }
    if (activeBattleRoomForAccount(data, access.resolved.account.accountId)) {
      return auditedFailure(data, access, "gm_pet_paid_reset_qa_target_in_battle", "当前账号正在战斗，不能准备宠物重置验收档。");
    }
    if (String(resolved.profile.offlineHang && resolved.profile.offlineHang.session && resolved.profile.offlineHang.session.status || "") === "active") {
      return auditedFailure(data, access, "offline_hang_active", "当前账号正在离线挂机，请先领取或取消离线收益。");
    }
    const conflict = rawBackpackAssetConflict(resolved.profile);
    if (conflict) {
      return auditedFailure(data, access, conflict.code, conflict.message);
    }
    const manifest = resolveManifest(petGrowthCatalog, petPaidResetPolicyCatalog, data.petPaidResetConfig);
    if (!manifest.ok) {
      return auditedFailure(data, access, manifest.code, manifest.message);
    }

    const beforeRevision = safeRevision(resolved.binding.profileRevision);
    const profile = clone(resolved.profile);
    const instances = Array.isArray(profile.petInstances) ? profile.petInstances : null;
    if (!instances) {
      return auditedFailure(data, access, "gm_pet_paid_reset_qa_profile_invalid", "宠物档案结构异常，验收档未改变。");
    }
    const expected = QA_SAMPLE_PLANS.map((plan) => ({
      ...plan,
      instanceId: instanceIdForSlot(access.resolved.account.accountId, plan.slotId),
    }));
    const ledgers = isRecord(profile[QA_MANIFESTS_PROFILE_KEY])
      ? profile[QA_MANIFESTS_PROFILE_KEY]
      : {};
    const ledger = isRecord(ledgers[GM_PET_PAID_RESET_QA_MANIFEST_ID])
      ? ledgers[GM_PET_PAID_RESET_QA_MANIFEST_ID]
      : null;
    let samplesCreated = 0;
    let partyAdded = 0;
    let storageAdded = 0;
    if (!ledger) {
      if (expected.some((sample) => instances.some((pet) => stablePetId(pet) === sample.instanceId))) {
        return auditedFailure(data, access, "gm_pet_paid_reset_qa_provenance_conflict", "发现没有验收清单的同名宠物，已停止以避免覆盖。");
      }
      const totalCapacity = BATTLE_PET_MAX_PER_PARTICIPANT + BATTLE_PET_STORAGE_LIMIT;
      if (instances.length + expected.length > totalCapacity) {
        return auditedFailure(data, access, "gm_pet_paid_reset_qa_capacity_full", "宠物空间不足；请至少留出2个位置后重试。");
      }
      let serial = nextProfilePetInstanceSerial(profile, instances);
      let partyCount = profilePartyVisiblePetCount(profile);
      let storageCount = profileStoragePetCount(profile);
      for (const sample of expected) {
        const state = partyCount < BATTLE_PET_MAX_PER_PARTICIPANT
          ? BATTLE_PET_STATE_STANDBY
          : BATTLE_PET_STATE_STORAGE;
        if (state === BATTLE_PET_STATE_STORAGE && storageCount >= BATTLE_PET_STORAGE_LIMIT) {
          return auditedFailure(data, access, "gm_pet_paid_reset_qa_capacity_full", "兽栏空间不足，验收档未改变。");
        }
        let pet;
        try {
          pet = createQaPet({
            ...sample,
            capturedSerial: serial,
            createDefaultServerPet,
            expToNextLevel,
            maxPetLevel: MAX_PET_LEVEL,
            newPetFactory,
            petExpSettlement,
            petRebirthGrowthCycle,
            state,
          });
        } catch (_error) {
          return auditedFailure(data, access, "gm_pet_paid_reset_qa_creation_failed", "重置验收宠物生成失败，档案未改变。");
        }
        const eligibility = inspectPetPaidResetEligibility(pet, {
          quote: manifest.quote,
          growthCycle: petRebirthGrowthCycle,
        });
        if (!eligibility.ok) {
          return auditedFailure(data, access, "gm_pet_paid_reset_qa_creation_failed", "重置验收宠物最终校验失败，档案未改变。");
        }
        instances.push(pet);
        recordProfilePetCodexForm(profile, QA_FORM_ID, true);
        serial += 1;
        samplesCreated += 1;
        if (state === BATTLE_PET_STATE_STORAGE) {
          storageCount += 1;
          storageAdded += 1;
        } else {
          partyCount += 1;
          partyAdded += 1;
        }
      }
      profile.nextPetInstanceSerial = serial;
      ledgers[GM_PET_PAID_RESET_QA_MANIFEST_ID] = {
        schemaVersion: 1,
        manifestId: GM_PET_PAID_RESET_QA_MANIFEST_ID,
        preparedAt: new Date(ctx.now()).toISOString(),
        slots: expected.map((sample) => ({
          slotId: sample.slotId,
          instanceId: sample.instanceId,
          originFormId: QA_FORM_ID,
          initialLevel: 1,
          targetLevel: sample.targetLevel,
        })),
      };
      profile[QA_MANIFESTS_PROFILE_KEY] = ledgers;
    } else if (!validLedger(ledger, expected)) {
      return auditedFailure(data, access, "gm_pet_paid_reset_qa_provenance_invalid", "宠物重置验收清单异常，未自动修复或重发。");
    }

    let walletChanges;
    try {
      walletChanges = topUpQaWallets(profile, {stoneCoinLimit: profileStoneCoinLimit});
    } catch (_error) {
      return auditedFailure(data, access, "gm_pet_paid_reset_qa_wallet_failed", "重置验收货币补齐失败，档案未改变。");
    }
    const changed = samplesCreated > 0 || walletChanges.length > 0;
    const persisted = changed
      ? persistProfileForAccount(data, access.resolved.account, resolved.binding, profile, ctx.now)
      : {binding: resolved.binding};
    const sampleSummaries = expected.map((sample) => summarizeSample(
      instances.find((pet) => stablePetId(pet) === sample.instanceId),
      sample,
      manifest.quote,
      petRebirthGrowthCycle,
    ));
    const negativeChecks = buildNegativeChecks({
      createDefaultServerPet,
      expToNextLevel,
      maxPetLevel: MAX_PET_LEVEL,
      newPetFactory,
      petExpSettlement,
      petRebirthGrowthCycle,
      quote: manifest.quote,
    });
    const afterRevision = safeRevision(persisted.binding.profileRevision);
    const result = {
      commandId: GM_PET_PAID_RESET_QA_COMMAND_ID,
      schemaVersion: 1,
      summary: {
        schemaVersion: 1,
        manifestId: GM_PET_PAID_RESET_QA_MANIFEST_ID,
        changed,
        alreadyPrepared: samplesCreated === 0,
        samplesCreated,
        sampleCount: expected.length,
        presentCount: sampleSummaries.filter((sample) => sample.present).length,
        partyAdded,
        storageAdded,
        walletFieldsRaised: walletChanges,
        primaryInstanceId: expected[1].instanceId,
        profileRevisionBefore: beforeRevision,
        profileRevisionAfter: afterRevision,
        wallets: qaWalletSummary(profile, {stoneCoinLimit: profileStoneCoinLimit}),
      },
      samples: sampleSummaries,
      negativeChecks,
      price: {
        configRevision: manifest.quote.configRevision,
        formId: manifest.quote.formId,
        formName: manifest.quote.formName,
        currencyId: manifest.quote.currencyId,
        amount: manifest.quote.amount,
        priceSource: manifest.quote.priceSource,
      },
    };
    const message = changed
      ? "宠物重置验收档已准备，并读取当前价格与安全审计。"
      : "宠物重置验收档已存在，已刷新当前价格、次数与安全审计。";
    const audit = recordGmCommandAudit(data, access, true, message, {
      manifestId: GM_PET_PAID_RESET_QA_MANIFEST_ID,
      samplesCreated,
      presentCount: result.summary.presentCount,
      walletFieldsRaised: walletChanges,
      profileRevisionBefore: beforeRevision,
      profileRevisionAfter: afterRevision,
      priceConfigRevision: manifest.quote.configRevision,
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

  function auditedFailure(data, access, code, message, details = {}) {
    const audit = recordGmCommandAudit(data, access, false, message, details);
    if (audit.recorded !== false) {
      save(data);
    }
    return fail(code, message, audit.auditId ? {auditId: audit.auditId} : {});
  }

  return Object.freeze({run});
}

function validPayload(value) {
  return isRecord(value)
    && Object.keys(value).length === 1
    && value.manifestId === GM_PET_PAID_RESET_QA_MANIFEST_ID;
}

function targetProfile(data, account) {
  const binding = data.profileBindings && data.profileBindings[account.accountId];
  const playerId = String(binding && binding.playerId || "");
  const profileDoc = playerId !== "" && data.profiles ? data.profiles[playerId] || null : null;
  const revision = safeRevision(binding && binding.profileRevision);
  if (
    !binding
    || !profileDoc
    || !isRecord(profileDoc.profile)
    || revision === null
    || safeRevision(profileDoc.profileRevision) !== revision
    || String(binding.accountId || "") !== account.accountId
    || String(profileDoc.accountId || "") !== account.accountId
    || String(profileDoc.playerId || "") !== playerId
  ) {
    return {ok: false, code: "profile_binding_conflict", message: "GM账号的角色档案归属或版本异常。"};
  }
  return {ok: true, binding, profile: profileDoc.profile};
}

function resolveManifest(growthCatalog, policyCatalog, config) {
  const profile = growthCatalog && growthCatalog.profileById(QA_GROWTH_PROFILE_ID);
  const quoted = resolvePetPaidResetQuote(policyCatalog, config, QA_FORM_ID);
  if (!profile || profile.formId !== QA_FORM_ID || !quoted.ok) {
    return {
      ok: false,
      code: quoted.code || "gm_pet_paid_reset_qa_manifest_invalid",
      message: quoted.message || "宠物重置验收清单与正式目录不一致。",
    };
  }
  return {ok: true, quote: quoted.quote};
}

function createQaPet(options) {
  let pet = options.createDefaultServerPet(
    options.instanceId,
    options.name,
    QA_FORM_ID,
    options.state,
    1,
  );
  pet.capturedSerial = options.capturedSerial;
  const finalized = options.newPetFactory.finalizeLevelOne(pet, {purpose: QA_SAMPLE_SOURCE});
  if (!isRecord(finalized) || finalized.profileId !== QA_GROWTH_PROFILE_ID || !isRecord(finalized.pet)) {
    throw new Error("paid reset QA factory mismatch");
  }
  pet = finalized.pet;
  for (let stage = 1; stage <= options.stage; stage += 1) {
    pet = advancePetToLevel(pet, 140, options.petExpSettlement, options.expToNextLevel, options.maxPetLevel);
    const restarted = options.petRebirthGrowthCycle.restart(pet, cultivationRecord(options.instanceId, options.name, stage));
    if (!restarted || restarted.restarted !== true || !isRecord(restarted.pet)) {
      throw new Error("paid reset QA rebirth restart failed");
    }
    pet = restarted.pet;
  }
  pet = advancePetToLevel(
    pet,
    options.targetLevel,
    options.petExpSettlement,
    options.expToNextLevel,
    options.maxPetLevel,
  );
  pet.binding = "bound";
  pet.bound = true;
  pet.bindingLocked = false;
  pet.locked = false;
  pet.source = QA_SAMPLE_SOURCE;
  pet[QA_SAMPLE_MARKER_KEY] = {
    schemaVersion: 1,
    manifestId: GM_PET_PAID_RESET_QA_MANIFEST_ID,
    slotId: options.slotId,
    originFormId: QA_FORM_ID,
    initialLevel: 1,
    targetLevel: options.targetLevel,
  };
  return pet;
}

function cultivationRecord(instanceId, name, stage) {
  const history = [{
    schemaVersion: 1,
    mode: "enhance",
    timestamp: 1700000000,
    petInstanceId: instanceId,
    petName: name,
    formId: QA_FORM_ID,
    beforeLevel: 100,
    afterLevel: 100,
    beforeRebirthCount: 0,
    afterRebirthCount: 0,
    beforeEnhanceLevel: 2,
    afterEnhanceLevel: 3,
    summary: "强化 +2 -> +3",
    message: "GM验收强化记录",
  }];
  const cumulative = stage === 1
    ? {maxHp: 0.4, attack: 0.2, defense: 0.1, quick: 0.3}
    : {maxHp: 0.7, attack: 0.5, defense: 0.3, quick: 0.5};
  for (let index = 1; index <= stage; index += 1) {
    const visible = index === 1
      ? {maxHp: 0.4, attack: 0.2, defense: 0.1, quick: 0.3}
      : {maxHp: 0.3, attack: 0.3, defense: 0.2, quick: 0.2};
    history.push({
      schemaVersion: 1,
      mode: "rebirth",
      timestamp: 1700000000 + index,
      petInstanceId: instanceId,
      petName: name,
      formId: QA_FORM_ID,
      beforeLevel: 140,
      afterLevel: 1,
      beforeRebirthCount: index - 1,
      afterRebirthCount: index,
      beforeEnhanceLevel: 3,
      afterEnhanceLevel: 3,
      visibleGrowthBonus: visible,
      summary: `${index - 1}转 -> ${index}转`,
      message: `GM验收第${index}次转生`,
    });
  }
  return {
    schemaVersion: 1,
    rebirthCount: stage,
    enhanceLevel: 3,
    rebirthGrowthBonus: cumulative,
    history,
    lastPreview: {schemaVersion: 1, stage},
    lastResult: structuredClone(history[history.length - 1]),
  };
}

function advancePetToLevel(pet, targetLevel, settlement, expToNextLevel, maxPetLevel) {
  let next = pet;
  while (next.level < targetLevel) {
    const required = expToNextLevel(next.level);
    const result = settlement.settle(next, required - next.exp, maxPetLevel, {name: String(next.name || "宠物")});
    if (!result || result.changed !== true || !isRecord(result.pet) || result.pet.level !== next.level + 1) {
      throw new Error("paid reset QA level settlement failed");
    }
    next = result.pet;
  }
  if (next.level !== targetLevel) {
    throw new Error("paid reset QA target level mismatch");
  }
  return next;
}

function validLedger(ledger, expected) {
  if (
    ledger.schemaVersion !== 1
    || ledger.manifestId !== GM_PET_PAID_RESET_QA_MANIFEST_ID
    || !Array.isArray(ledger.slots)
    || ledger.slots.length !== expected.length
  ) {
    return false;
  }
  return expected.every((sample) => ledger.slots.some((slot) => (
    isRecord(slot)
    && slot.slotId === sample.slotId
    && slot.instanceId === sample.instanceId
    && slot.originFormId === QA_FORM_ID
    && slot.initialLevel === 1
    && slot.targetLevel === sample.targetLevel
  )));
}

function topUpQaWallets(profile, options) {
  const changes = [];
  const targets = [
    ["diamonds", "bound", QA_WALLET_MINIMUMS.boundDiamonds, "boundDiamonds"],
    ["diamonds", "unbound", QA_WALLET_MINIMUMS.diamonds, "diamonds"],
    ["stoneCoins", "bound", QA_WALLET_MINIMUMS.boundStoneCoins, "boundStoneCoins"],
    ["stoneCoins", "unbound", QA_WALLET_MINIMUMS.stoneCoins, "stoneCoins"],
  ];
  for (const [currencyId, binding, minimum, field] of targets) {
    const current = walletBalance(profile, currencyId, binding, options);
    if (current >= minimum) {
      continue;
    }
    if (!setWalletBalance(profile, currencyId, binding, minimum, options)) {
      throw new Error("paid reset QA wallet top-up failed");
    }
    changes.push(field);
  }
  return changes;
}

function qaWalletSummary(profile, options) {
  return {
    boundDiamonds: walletBalance(profile, "diamonds", "bound", options),
    diamonds: walletBalance(profile, "diamonds", "unbound", options),
    boundStoneCoins: walletBalance(profile, "stoneCoins", "bound", options),
    stoneCoins: walletBalance(profile, "stoneCoins", "unbound", options),
  };
}

function summarizeSample(pet, sample, quote, growthCycle) {
  if (!isRecord(pet)) {
    return {
      schemaVersion: 1,
      slotId: sample.slotId,
      instanceId: sample.instanceId,
      present: false,
      eligible: false,
      eligibilityCode: "sample_missing",
      eligibilityMessage: "样本已不存在；为避免重复发放，不会自动补回。",
      paidResetCount: 0,
      audit: {totalCount: 0, archivedCount: 0, records: []},
    };
  }
  const eligibility = inspectPetPaidResetEligibility(pet, {quote, growthCycle});
  const audit = canonicalPaidResetState(pet);
  return {
    schemaVersion: 1,
    slotId: sample.slotId,
    instanceId: sample.instanceId,
    present: true,
    name: String(pet.name || pet.formName || "宠物"),
    level: Number(pet.level || 0),
    rebirthCount: Number(pet.petCultivation && pet.petCultivation.rebirthCount || 0),
    eligible: eligibility.ok === true,
    eligibilityCode: eligibility.ok ? "ok" : String(eligibility.code || "pet_paid_reset_failed"),
    eligibilityMessage: eligibility.ok ? "可以按当前服务端报价重置。" : String(eligibility.message || "当前不能重置。"),
    paidResetCount: audit.ok ? audit.count : 0,
    audit: audit.ok ? safeAudit(audit.audit) : {totalCount: 0, archivedCount: 0, records: []},
  };
}

function safeAudit(audit) {
  return {
    totalCount: audit.totalCount,
    archivedCount: audit.archivedCount,
    records: audit.records.slice(-10).map((record) => ({
      resetNumber: record.resetNumber,
      operationId: record.operationId,
      recordedAt: record.recordedAt,
      before: structuredClone(record.before),
      after: structuredClone(record.after),
      price: structuredClone(record.price),
      debits: structuredClone(record.debits),
    })),
  };
}

function buildNegativeChecks(options) {
  let source;
  try {
    source = createQaPet({
      slotId: "negative_probe",
      instanceId: "pet_gmqa_paid_reset_negative_probe",
      name: "重置拒绝自检",
      stage: 1,
      targetLevel: 20,
      capturedSerial: 1,
      state: "standby",
      ...options,
    });
  } catch (_error) {
    return {schemaVersion: 1, legacyRejected: false, damagedRejected: false};
  }
  const legacy = structuredClone(source);
  delete legacy.petGrowth;
  delete legacy.growthAuthority;
  const damaged = structuredClone(source);
  damaged.petGrowth.private.privateSeed = "";
  const legacyResult = inspectPetPaidResetEligibility(legacy, {
    quote: options.quote,
    growthCycle: options.petRebirthGrowthCycle,
  });
  const damagedResult = inspectPetPaidResetEligibility(damaged, {
    quote: options.quote,
    growthCycle: options.petRebirthGrowthCycle,
  });
  return {
    schemaVersion: 1,
    legacyRejected: legacyResult.ok === false,
    legacyMessage: String(legacyResult.message || ""),
    damagedRejected: damagedResult.ok === false,
    damagedMessage: String(damagedResult.message || ""),
  };
}

function instanceIdForSlot(accountId, slotId) {
  const digest = crypto.createHash("sha256").update(String(accountId || "")).digest("hex").slice(0, 16);
  return `pet_gmqa_${digest}_${slotId}`;
}

function stablePetId(pet) {
  return String(pet && (pet.instanceId || pet.petId) || "");
}

function safeRevision(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

module.exports = {
  GM_PET_PAID_RESET_QA_COMMAND_ID,
  GM_PET_PAID_RESET_QA_MANIFEST_ID,
  QA_SAMPLE_PLANS,
  QA_WALLET_MINIMUMS,
  createGmPetPaidResetQaDomain,
};
