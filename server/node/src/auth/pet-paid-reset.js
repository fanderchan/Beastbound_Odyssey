"use strict";

const {isDeepStrictEqual} = require("node:util");

const PET_PAID_RESET_SCHEMA_VERSION = 1;
const PET_PAID_RESET_AUDIT_MAX_RECORDS = 50;
const PET_CULTIVATION_HISTORY_MAX_RECORDS = 20;
const PET_PAID_RESET_OPERATION_ID_PATTERN = /^[A-Za-z0-9._:-]{16,160}$/;
const STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);
const CULTIVATION_KEYS = Object.freeze([
  "schemaVersion",
  "rebirthCount",
  "enhanceLevel",
  "rebirthGrowthBonus",
  "history",
  "lastPreview",
  "lastResult",
]);
const AUDIT_KEYS = Object.freeze([
  "schemaVersion",
  "totalCount",
  "archivedCount",
  "records",
]);
const AUDIT_RECORD_KEYS = Object.freeze([
  "schemaVersion",
  "operationId",
  "recordedAt",
  "instanceId",
  "formId",
  "resetNumber",
  "before",
  "after",
  "price",
  "debits",
]);
const AUDIT_BEFORE_KEYS = Object.freeze([
  "level",
  "rebirthCount",
  "enhanceLevel",
  "binding",
  "bound",
  "bindingLocked",
  "rebirthGrowthBonus",
  "cultivationHistoryCount",
]);
const AUDIT_AFTER_KEYS = Object.freeze([
  "level",
  "rebirthCount",
  "enhanceLevel",
  "binding",
  "paidResetCount",
]);
const AUDIT_PRICE_KEYS = Object.freeze([
  "policyId",
  "configRevision",
  "priceTierId",
  "priceSource",
  "currencyId",
  "amount",
  "walletPolicyId",
]);

function applyPetPaidReset(petValue, options = {}) {
  const operationId = String(options.operationId || "").trim();
  const recordedAt = canonicalIsoTimestamp(options.recordedAt);
  const quote = recordOrNull(options.quote);
  const paymentPlan = recordOrNull(options.paymentPlan);
  const growthCycle = options.growthCycle;
  const expToNextLevel = options.expToNextLevel;
  if (
    recordedAt === ""
    || !validPaymentPlan(paymentPlan, quote)
    || typeof expToNextLevel !== "function"
  ) {
    return failure("pet_paid_reset_context_invalid", "宠物重置校验信息不完整，本次操作未执行。");
  }
  const preflight = preflightPetPaidReset(petValue, {operationId, quote, growthCycle});
  if (!preflight.ok) {
    return preflight;
  }
  const {pet, instanceId, formId, cultivation, paidResetState, beforeLevel} = preflight;
  const nextCount = paidResetState.count + 1;
  if (!Number.isSafeInteger(nextCount)) {
    return failure("pet_paid_reset_audit_invalid", "宠物重置计数异常，本次操作未执行。");
  }
  const nowSec = Math.max(0, Math.trunc(Date.parse(recordedAt) / 1000));
  const resetEvent = buildResetEvent(pet, cultivation.record, nextCount, nowSec);
  const nextCultivation = buildNextCultivation(cultivation.record, resetEvent);
  const preserved = preservedIdentityFacts(pet);
  let restarted;
  try {
    restarted = growthCycle.restart(pet, nextCultivation);
  } catch {
    return failure("pet_growth_state_invalid", "宠物成长数据异常，本次重置未执行，货币未扣除。");
  }
  if (!restarted || restarted.restarted !== true || !recordOrNull(restarted.pet)) {
    return failure("pet_paid_reset_growth_unsupported", "该宠物不能安全重启成长周期，本次重置未执行。");
  }
  const nextPet = structuredClone(restarted.pet);
  nextPet.petCultivation = structuredClone(nextCultivation);
  nextPet.lastCultivationResult = structuredClone(resetEvent);
  nextPet.exp = 0;
  const nextExp = Number(expToNextLevel(1));
  if (!Number.isSafeInteger(nextExp) || nextExp < 1) {
    return failure("pet_paid_reset_context_invalid", "宠物等级经验配置异常，本次重置未执行。");
  }
  nextPet.nextExp = nextExp;
  delete nextPet.growthObservation;
  delete nextPet.growthObservationUnavailableReason;
  nextPet.binding = "unbound";
  nextPet.bound = false;
  nextPet.bindingLocked = false;
  nextPet.paidResetCount = nextCount;

  if (!isDeepStrictEqual(preservedIdentityFacts(nextPet), preserved)) {
    return failure("pet_paid_reset_identity_changed", "宠物身份或天生属性发生异常变化，本次重置未执行。");
  }
  const auditRecord = buildAuditRecord({
    cultivation: cultivation.record,
    formId,
    instanceId,
    nextCount,
    operationId,
    paymentPlan,
    pet,
    quote,
    recordedAt,
  });
  const records = [...paidResetState.audit.records, auditRecord];
  while (records.length > PET_PAID_RESET_AUDIT_MAX_RECORDS) {
    records.shift();
  }
  nextPet.paidResetAudit = {
    schemaVersion: PET_PAID_RESET_SCHEMA_VERSION,
    totalCount: nextCount,
    archivedCount: nextCount - records.length,
    records,
  };
  const finalAudit = canonicalPaidResetState(nextPet);
  if (!finalAudit.ok || finalAudit.count !== nextCount) {
    return failure("pet_paid_reset_audit_invalid", "宠物重置审计写入失败，本次操作未执行。");
  }

  return {
    ok: true,
    pet: nextPet,
    publicResult: {
      schemaVersion: PET_PAID_RESET_SCHEMA_VERSION,
      operationId,
      recordedAt,
      instanceId,
      formId,
      formName: String(quote.formName || pet.formName || pet.name || "宠物"),
      beforeLevel,
      afterLevel: 1,
      beforeRebirthCount: cultivation.record.rebirthCount,
      afterRebirthCount: 0,
      paidResetCount: nextCount,
      binding: "unbound",
      preservedEnhanceLevel: cultivation.record.enhanceLevel,
      clearedRebirthHistoryCount: cultivation.clearedRebirthHistoryCount,
      payment: publicPayment(quote, paymentPlan),
      message: resetEvent.message,
    },
  };
}

function preflightPetPaidReset(petValue, options = {}) {
  const pet = recordOrNull(petValue);
  if (!pet) {
    return failure("pet_paid_reset_pet_invalid", "宠物资料不完整，本次重置未执行。");
  }
  const operationId = String(options.operationId || "").trim();
  const quote = recordOrNull(options.quote);
  const growthCycle = options.growthCycle;
  if (
    !PET_PAID_RESET_OPERATION_ID_PATTERN.test(operationId)
    || !validQuote(quote)
    || !growthCycle
    || typeof growthCycle.preflight !== "function"
    || typeof growthCycle.restart !== "function"
  ) {
    return failure("pet_paid_reset_context_invalid", "宠物重置校验信息不完整，本次操作未执行。");
  }
  const instanceId = stablePetIdentity(pet);
  const formId = stablePetFormId(pet);
  if (instanceId === "" || formId === "" || formId !== quote.formId) {
    return failure("pet_paid_reset_pet_invalid", "宠物身份或形态资料不完整，本次重置未执行。");
  }
  if (recordOrNull(pet.petRebirthHelper)) {
    return failure("pet_paid_reset_helper_ineligible", "转生MM不能使用付费重置。");
  }
  let growthPreflight;
  try {
    growthPreflight = growthCycle.preflight(pet);
  } catch {
    return failure("pet_growth_state_invalid", "宠物成长数据异常，本次重置未执行，货币未扣除。");
  }
  if (!growthPreflight || growthPreflight.authorityV1 !== true) {
    return failure("pet_paid_reset_growth_unsupported", "该宠物仍使用旧成长档，不能安全重置，请联系GM处理。");
  }
  const cultivation = canonicalResettableCultivation(pet.petCultivation);
  if (!cultivation.ok) {
    return cultivation;
  }
  const paidResetState = canonicalPaidResetState(pet);
  if (!paidResetState.ok) {
    return paidResetState;
  }
  if (paidResetState.audit.records.some((record) => record.operationId === operationId)) {
    return failure("pet_paid_reset_operation_reused", "这个操作标识已经完成过宠物重置，不能再次使用。");
  }
  const beforeLevel = positiveInteger(pet.level);
  if (beforeLevel < 1) {
    return failure("pet_paid_reset_pet_invalid", "宠物等级资料异常，本次重置未执行。");
  }
  return {ok: true, pet, instanceId, formId, cultivation, paidResetState, beforeLevel};
}

function canonicalResettableCultivation(value) {
  const source = recordOrNull(value);
  if (!source || !hasExactKeys(source, CULTIVATION_KEYS)) {
    return failure("pet_paid_reset_cultivation_invalid", "宠物转生培养记录不完整，本次重置未执行。");
  }
  if (
    source.schemaVersion !== 1
    || !Number.isSafeInteger(source.rebirthCount)
    || source.rebirthCount < 1
    || source.rebirthCount > 2
    || !Number.isSafeInteger(source.enhanceLevel)
    || source.enhanceLevel < 0
    || source.enhanceLevel > 100
    || !validStatMap(source.rebirthGrowthBonus)
    || !Array.isArray(source.history)
    || source.history.length > PET_CULTIVATION_HISTORY_MAX_RECORDS
    || source.history.some((entry) => !recordOrNull(entry))
    || !recordOrNull(source.lastPreview)
    || !recordOrNull(source.lastResult)
  ) {
    return failure("pet_paid_reset_cultivation_invalid", "宠物转生培养记录异常，本次重置未执行。");
  }
  const rebirthEvents = source.history.filter((entry) => String(entry.mode || "") === "rebirth");
  if (rebirthEvents.length < source.rebirthCount) {
    return failure("pet_paid_reset_cultivation_invalid", "宠物转生历史与转生次数不一致，本次重置未执行。");
  }
  return {
    ok: true,
    record: structuredClone(source),
    clearedRebirthHistoryCount: rebirthEvents.length,
  };
}

function canonicalPaidResetState(pet) {
  const hasCount = Object.hasOwn(pet, "paidResetCount");
  const hasAudit = Object.hasOwn(pet, "paidResetAudit");
  if (!hasCount && !hasAudit) {
    return {
      ok: true,
      count: 0,
      audit: {schemaVersion: PET_PAID_RESET_SCHEMA_VERSION, totalCount: 0, archivedCount: 0, records: []},
    };
  }
  if (!hasCount || !hasAudit || !Number.isSafeInteger(pet.paidResetCount) || pet.paidResetCount < 0) {
    return failure("pet_paid_reset_audit_invalid", "宠物既有重置计数或审计异常，本次操作未执行。");
  }
  const audit = recordOrNull(pet.paidResetAudit);
  if (
    !audit
    || !hasExactKeys(audit, AUDIT_KEYS)
    || audit.schemaVersion !== PET_PAID_RESET_SCHEMA_VERSION
    || audit.totalCount !== pet.paidResetCount
    || !Number.isSafeInteger(audit.archivedCount)
    || audit.archivedCount < 0
    || !Array.isArray(audit.records)
    || audit.records.length > PET_PAID_RESET_AUDIT_MAX_RECORDS
    || audit.records.length !== Math.min(audit.totalCount, PET_PAID_RESET_AUDIT_MAX_RECORDS)
    || audit.archivedCount !== audit.totalCount - audit.records.length
    || audit.records.some((record) => !validAuditRecord(record))
  ) {
    return failure("pet_paid_reset_audit_invalid", "宠物既有重置计数或审计异常，本次操作未执行。");
  }
  const operationIds = audit.records.map((record) => record.operationId);
  if (new Set(operationIds).size !== operationIds.length) {
    return failure("pet_paid_reset_audit_invalid", "宠物重置审计包含重复操作，本次操作未执行。");
  }
  if (audit.records.some((record, index) => (
    record.resetNumber !== audit.archivedCount + index + 1
  ))) {
    return failure("pet_paid_reset_audit_invalid", "宠物重置审计顺序异常，本次操作未执行。");
  }
  return {ok: true, count: pet.paidResetCount, audit: structuredClone(audit)};
}

function buildNextCultivation(current, resetEvent) {
  const history = current.history
    .filter((entry) => String(entry.mode || "") !== "rebirth")
    .map((entry) => structuredClone(entry));
  history.push(structuredClone(resetEvent));
  while (history.length > PET_CULTIVATION_HISTORY_MAX_RECORDS) {
    history.shift();
  }
  return {
    schemaVersion: 1,
    rebirthCount: 0,
    enhanceLevel: current.enhanceLevel,
    rebirthGrowthBonus: zeroStatMap(),
    history,
    lastPreview: {},
    lastResult: structuredClone(resetEvent),
  };
}

function buildResetEvent(pet, cultivation, nextCount, nowSec) {
  const petName = String(pet.name || pet.formName || "宠物");
  const beforeLevel = positiveInteger(pet.level);
  const summary = `${cultivation.rebirthCount}转 -> 0转，Lv${beforeLevel} -> Lv1`;
  return {
    schemaVersion: 1,
    mode: "paid_reset",
    timestamp: nowSec,
    petInstanceId: stablePetIdentity(pet),
    petName,
    formId: stablePetFormId(pet),
    beforeLevel,
    afterLevel: 1,
    beforeRebirthCount: cultivation.rebirthCount,
    afterRebirthCount: 0,
    beforeEnhanceLevel: cultivation.enhanceLevel,
    afterEnhanceLevel: cultivation.enhanceLevel,
    amount: nextCount,
    summary,
    message: `${petName} 已付费重置：${summary}；原始4V、天生成长、强化与技能均保留。`,
  };
}

function buildAuditRecord(input) {
  return {
    schemaVersion: PET_PAID_RESET_SCHEMA_VERSION,
    operationId: input.operationId,
    recordedAt: input.recordedAt,
    instanceId: input.instanceId,
    formId: input.formId,
    resetNumber: input.nextCount,
    before: {
      level: positiveInteger(input.pet.level),
      rebirthCount: input.cultivation.rebirthCount,
      enhanceLevel: input.cultivation.enhanceLevel,
      binding: String(input.pet.binding || "unbound"),
      bound: Boolean(input.pet.bound),
      bindingLocked: Boolean(input.pet.bindingLocked),
      rebirthGrowthBonus: structuredClone(input.cultivation.rebirthGrowthBonus),
      cultivationHistoryCount: input.cultivation.history.length,
    },
    after: {
      level: 1,
      rebirthCount: 0,
      enhanceLevel: input.cultivation.enhanceLevel,
      binding: "unbound",
      paidResetCount: input.nextCount,
    },
    price: {
      policyId: String(input.quote.policyId || ""),
      configRevision: input.quote.configRevision,
      priceTierId: String(input.quote.priceTierId || ""),
      priceSource: String(input.quote.priceSource || ""),
      currencyId: String(input.quote.currencyId || ""),
      amount: input.quote.amount,
      walletPolicyId: String(input.quote.walletPolicy.walletPolicyId || ""),
    },
    debits: input.paymentPlan.debits.map((debit) => ({
      binding: String(debit.binding || ""),
      amount: debit.amount,
    })),
  };
}

function publicPayment(quote, paymentPlan) {
  return {
    schemaVersion: 1,
    policyId: String(quote.policyId || ""),
    configRevision: quote.configRevision,
    priceTierId: String(quote.priceTierId || ""),
    priceSource: String(quote.priceSource || ""),
    currencyId: String(quote.currencyId || ""),
    amount: quote.amount,
    walletPolicyId: String(quote.walletPolicy.walletPolicyId || ""),
    debits: paymentPlan.debits.map((debit) => ({
      binding: String(debit.binding || ""),
      amount: debit.amount,
    })),
  };
}

function preservedIdentityFacts(pet) {
  const privateGrowth = recordOrNull(pet.petGrowth) && recordOrNull(pet.petGrowth.private)
    ? pet.petGrowth.private
    : {};
  const cultivation = recordOrNull(privateGrowth.cultivation) ? privateGrowth.cultivation : {};
  return {
    instanceId: stablePetIdentity(pet),
    formId: stablePetFormId(pet),
    lineId: String(pet.lineId || ""),
    subtypeId: String(pet.subtypeId || ""),
    initialStats: structuredClone(pet.initialStats),
    growthSpeciesLevel1Stats: structuredClone(pet.growthSpeciesLevel1Stats),
    privateSeed: String(privateGrowth.privateSeed || ""),
    privateRoll: structuredClone(privateGrowth.privateRoll),
    initialCultivationBonus: structuredClone(cultivation.initialBonus),
    activeSkillIds: structuredClone(Array.isArray(pet.activeSkillIds) ? pet.activeSkillIds : []),
    petSkillSlots: structuredClone(Array.isArray(pet.petSkillSlots) ? pet.petSkillSlots : []),
    passiveSkillIds: structuredClone(Array.isArray(pet.passiveSkillIds) ? pet.passiveSkillIds : []),
    learnedSkillIds: structuredClone(Array.isArray(pet.learnedSkillIds) ? pet.learnedSkillIds : []),
    inheritedSkillIds: structuredClone(Array.isArray(pet.inheritedSkillIds) ? pet.inheritedSkillIds : []),
    evolutionLineage: structuredClone(recordOrNull(pet.evolutionLineage) || {}),
  };
}

function validQuote(quote) {
  const contract = quote && recordOrNull(quote.resetContract);
  const walletPolicy = quote && recordOrNull(quote.walletPolicy);
  return Boolean(
    quote
    && typeof quote.formId === "string"
    && quote.formId !== ""
    && typeof quote.policyId === "string"
    && quote.policyId !== ""
    && Number.isSafeInteger(quote.configRevision)
    && quote.configRevision >= 0
    && typeof quote.currencyId === "string"
    && quote.currencyId !== ""
    && Number.isSafeInteger(quote.amount)
    && quote.amount >= 1
    && walletPolicy
    && typeof walletPolicy.walletPolicyId === "string"
    && walletPolicy.walletPolicyId !== ""
    && contract
    && contract.resetLevel === 1
    && contract.resetRebirthStage === 0
    && contract.clearBindingOnSuccess === true
    && contract.unlimited === true
    && contract.refundPolicy === "technical_transaction_rollback_only"
  );
}

function validPaymentPlan(plan, quote) {
  return Boolean(
    plan
    && plan.ok === true
    && plan.currencyId === quote.currencyId
    && plan.amount === quote.amount
    && Array.isArray(plan.debits)
    && plan.debits.length >= 1
    && plan.debits.every((debit) => (
      recordOrNull(debit)
      && typeof debit.binding === "string"
      && typeof debit.field === "string"
      && Number.isSafeInteger(debit.amount)
      && debit.amount >= 1
      && Number.isSafeInteger(debit.before)
      && Number.isSafeInteger(debit.after)
      && debit.before - debit.amount === debit.after
      && debit.after >= 0
    ))
    && plan.debits.reduce((sum, debit) => sum + debit.amount, 0) === quote.amount
  );
}

function validAuditRecord(value) {
  const record = recordOrNull(value);
  const before = recordOrNull(record && record.before);
  const after = recordOrNull(record && record.after);
  const price = recordOrNull(record && record.price);
  if (
    !record
    || !hasExactKeys(record, AUDIT_RECORD_KEYS)
    || record.schemaVersion !== PET_PAID_RESET_SCHEMA_VERSION
    || !PET_PAID_RESET_OPERATION_ID_PATTERN.test(String(record.operationId || ""))
    || canonicalIsoTimestamp(record.recordedAt) === ""
    || typeof record.instanceId !== "string"
    || record.instanceId === ""
    || typeof record.formId !== "string"
    || record.formId === ""
    || !Number.isSafeInteger(record.resetNumber)
    || record.resetNumber < 1
    || !before
    || !hasExactKeys(before, AUDIT_BEFORE_KEYS)
    || positiveInteger(before.level) < 1
    || !Number.isSafeInteger(before.rebirthCount)
    || before.rebirthCount < 1
    || before.rebirthCount > 2
    || !Number.isSafeInteger(before.enhanceLevel)
    || before.enhanceLevel < 0
    || before.enhanceLevel > 100
    || typeof before.binding !== "string"
    || typeof before.bound !== "boolean"
    || typeof before.bindingLocked !== "boolean"
    || !validStatMap(before.rebirthGrowthBonus)
    || !Number.isSafeInteger(before.cultivationHistoryCount)
    || before.cultivationHistoryCount < before.rebirthCount
    || before.cultivationHistoryCount > PET_CULTIVATION_HISTORY_MAX_RECORDS
    || !after
    || !hasExactKeys(after, AUDIT_AFTER_KEYS)
    || after.level !== 1
    || after.rebirthCount !== 0
    || after.enhanceLevel !== before.enhanceLevel
    || after.binding !== "unbound"
    || after.paidResetCount !== record.resetNumber
    || !price
    || !hasExactKeys(price, AUDIT_PRICE_KEYS)
    || typeof price.policyId !== "string"
    || price.policyId === ""
    || !Number.isSafeInteger(price.configRevision)
    || price.configRevision < 0
    || typeof price.priceTierId !== "string"
    || price.priceTierId === ""
    || typeof price.priceSource !== "string"
    || price.priceSource === ""
    || typeof price.currencyId !== "string"
    || price.currencyId === ""
    || !Number.isSafeInteger(price.amount)
    || price.amount < 1
    || typeof price.walletPolicyId !== "string"
    || price.walletPolicyId === ""
    || !Array.isArray(record.debits)
    || record.debits.length < 1
  ) {
    return false;
  }
  const debitBindings = record.debits.map((debit) => String(debit && debit.binding || ""));
  return new Set(debitBindings).size === debitBindings.length
    && record.debits.reduce((sum, debit) => sum + Number(debit && debit.amount || 0), 0) === price.amount
    && record.debits.every((debit) => (
      recordOrNull(debit)
      && Object.keys(debit).length === 2
      && ["bound", "unbound"].includes(debit.binding)
      && Number.isSafeInteger(debit.amount)
      && debit.amount >= 1
    ));
}

function validStatMap(value) {
  const source = recordOrNull(value);
  return Boolean(
    source
    && hasExactKeys(source, STAT_KEYS)
    && STAT_KEYS.every((key) => (
      typeof source[key] === "number"
      && Number.isFinite(source[key])
      && source[key] >= 0
    ))
  );
}

function zeroStatMap() {
  return {maxHp: 0, attack: 0, defense: 0, quick: 0};
}

function stablePetIdentity(pet) {
  const values = [pet.instanceId, pet.petId]
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .map((value) => value.trim());
  return values.length >= 1 && values.every((value) => value === values[0]) ? values[0] : "";
}

function stablePetFormId(pet) {
  const values = [pet.formId, pet.templateId, pet.speciesId]
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .map((value) => value.trim());
  return values.length >= 1 && values.every((value) => value === values[0]) ? values[0] : "";
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value >= 1 ? value : 0;
}

function canonicalIsoTimestamp(value) {
  const text = String(value || "");
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  const canonical = new Date(parsed).toISOString();
  return canonical === text ? canonical : "";
}

function recordOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function failure(code, message) {
  return {ok: false, code: String(code || "pet_paid_reset_failed"), message: String(message || "宠物重置失败。")};
}

module.exports = {
  PET_PAID_RESET_AUDIT_MAX_RECORDS,
  PET_PAID_RESET_SCHEMA_VERSION,
  applyPetPaidReset,
  canonicalPaidResetState,
  preflightPetPaidReset,
};
