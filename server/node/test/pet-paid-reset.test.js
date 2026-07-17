"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  loadPetGrowthCatalog,
} = require("../src/auth/pet-growth-catalog");
const {
  initializePetGrowth,
  settlePetGrowthToLevel,
  validatePetGrowth,
} = require("../src/auth/pet-growth-runtime");
const {createPetRebirthGrowthCycle} = require("../src/auth/pet-rebirth-growth-cycle");
const {
  createPetPaidResetPolicyCatalog,
  resolvePetPaidResetQuote,
} = require("../src/auth/pet-paid-reset-policy-catalog");
const {planPetPaidResetDebit} = require("../src/auth/pet-paid-reset-payment");
const {
  PET_PAID_RESET_AUDIT_MAX_RECORDS,
  applyPetPaidReset,
  canonicalPaidResetState,
} = require("../src/auth/pet-paid-reset");

const PRIVATE_SEED = `bps1_${"P".repeat(43)}`;
const FORM_ID = "rebirth_starter_four_spirit_cub";

function cultivationEvent(stage, beforeLevel) {
  return {
    schemaVersion: 1,
    mode: "rebirth",
    timestamp: 1700000000 + stage,
    petInstanceId: "paid_reset_pet",
    petName: "审计四灵幼兽",
    formId: FORM_ID,
    beforeLevel,
    afterLevel: 1,
    beforeRebirthCount: stage - 1,
    afterRebirthCount: stage,
    beforeEnhanceLevel: 3,
    afterEnhanceLevel: 3,
    visibleGrowthBonus: stage === 1
      ? {maxHp: 0.4, attack: 0.2, defense: 0.1, quick: 0.3}
      : {maxHp: 0.3, attack: 0.3, defense: 0.2, quick: 0.2},
    summary: `${stage - 1}转 -> ${stage}转`,
    message: `第${stage}次转生`,
  };
}

function cultivationRecord(stage) {
  const events = [cultivationEvent(1, 140)];
  if (stage >= 2) {
    events.push(cultivationEvent(2, 140));
  }
  return {
    schemaVersion: 1,
    rebirthCount: stage,
    enhanceLevel: 3,
    rebirthGrowthBonus: stage === 1
      ? {maxHp: 0.4, attack: 0.2, defense: 0.1, quick: 0.3}
      : {maxHp: 0.7, attack: 0.5, defense: 0.3, quick: 0.5},
    history: [
      {
        schemaVersion: 1,
        mode: "enhance",
        timestamp: 1699999999,
        petInstanceId: "paid_reset_pet",
        petName: "审计四灵幼兽",
        formId: FORM_ID,
        beforeLevel: 100,
        afterLevel: 100,
        beforeRebirthCount: 0,
        afterRebirthCount: 0,
        beforeEnhanceLevel: 2,
        afterEnhanceLevel: 3,
        summary: "强化 +2 -> +3",
        message: "强化完成",
      },
      ...events,
    ],
    lastPreview: {schemaVersion: 1, stage},
    lastResult: structuredClone(events[events.length - 1]),
  };
}

function twoRebirthPet() {
  const catalog = loadPetGrowthCatalog();
  const profile = catalog.requireProfileById("rebirth_starter_four_spirit_cub_v1");
  const cycle = createPetRebirthGrowthCycle({growthCatalog: catalog});
  let pet = initializePetGrowth({
    instanceId: "paid_reset_pet",
    petId: "paid_reset_pet",
    formId: FORM_ID,
    templateId: FORM_ID,
    speciesId: FORM_ID,
    growthSpeciesProfileId: profile.profileId,
    name: "审计四灵幼兽",
    formName: "四灵幼兽",
    state: "standby",
    level: 1,
    exp: 0,
    nextExp: 100,
    hp: 1,
    maxHp: 1,
    attack: 1,
    defense: 1,
    quick: 1,
    binding: "bound",
    bound: true,
    bindingLocked: true,
    locked: false,
    favorite: true,
    activeSkillIds: ["pet_attack", "pet_defend", "pet_bui_charge"],
    petSkillSlots: ["pet_attack", "pet_defend", "pet_bui_charge"],
    passiveSkillIds: ["bui_resistant_skin"],
    learnedSkillIds: ["pet_bui_charge"],
    inheritedSkillIds: ["future_inherited_skill"],
    evolutionLineage: {schemaVersion: 1, sourceFormId: "future_source"},
  }, profile, {
    privateSeed: PRIVATE_SEED,
    cultivation: {
      schemaVersion: 1,
      initialBonus: {maxHp: 1.2, attack: 0.3, defense: 0.2, quick: 0.1},
      growthBonus: {maxHp: 0, attack: 0, defense: 0, quick: 0},
    },
  }).pet;
  pet = settlePetGrowthToLevel(pet, profile, 140).pet;
  pet = cycle.restart(pet, cultivationRecord(1)).pet;
  pet.exp = 0;
  pet.nextExp = 100;
  pet = settlePetGrowthToLevel(pet, profile, 140).pet;
  pet = cycle.restart(pet, cultivationRecord(2)).pet;
  pet.exp = 0;
  pet.nextExp = 100;
  pet = settlePetGrowthToLevel(pet, profile, 88).pet;
  return {catalog, cycle, profile, pet};
}

function paidResetInput(pet, operationId = "paid_reset_operation_0001") {
  const policyCatalog = createPetPaidResetPolicyCatalog();
  const quoted = resolvePetPaidResetQuote(policyCatalog, {}, FORM_ID);
  assert.equal(quoted.ok, true);
  const paymentProfile = {diamonds: 100, boundDiamonds: 250};
  const paymentPlan = planPetPaidResetDebit(paymentProfile, quoted);
  assert.equal(paymentPlan.ok, true);
  return {
    operationId,
    recordedAt: "2026-07-17T12:00:00.000Z",
    quote: quoted.quote,
    paymentPlan,
    growthCycle: pet.cycle,
    expToNextLevel: () => 100,
  };
}

test("paid reset returns a legal two-rebirth authority pet to Lv1/0 without rerolling identity", () => {
  const fixture = twoRebirthPet();
  const source = structuredClone(fixture.pet);
  const result = applyPetPaidReset(fixture.pet, paidResetInput(fixture));

  assert.equal(result.ok, true);
  assert.deepEqual(fixture.pet, source);
  assert.equal(result.pet.level, 1);
  assert.equal(result.pet.exp, 0);
  assert.equal(result.pet.nextExp, 100);
  assert.equal(result.pet.petCultivation.rebirthCount, 0);
  assert.equal(result.pet.petCultivation.enhanceLevel, 3);
  assert.deepEqual(result.pet.petCultivation.rebirthGrowthBonus, {maxHp: 0, attack: 0, defense: 0, quick: 0});
  assert.deepEqual(result.pet.petGrowth.private.cultivation.growthBonus, {maxHp: 0, attack: 0, defense: 0, quick: 0});
  assert.equal(result.pet.petCultivation.history.some((entry) => entry.mode === "rebirth"), false);
  assert.equal(result.pet.petCultivation.history.some((entry) => entry.mode === "enhance"), true);
  assert.equal(result.pet.petCultivation.history.at(-1).mode, "paid_reset");
  assert.equal(result.pet.binding, "unbound");
  assert.equal(result.pet.bound, false);
  assert.equal(result.pet.bindingLocked, false);
  assert.equal(result.pet.paidResetCount, 1);
  assert.equal(result.pet.paidResetAudit.totalCount, 1);
  assert.equal(result.pet.paidResetAudit.records[0].operationId, "paid_reset_operation_0001");
  assert.equal(result.pet.paidResetAudit.records[0].price.amount, 300);
  assert.deepEqual(result.pet.paidResetAudit.records[0].debits, [
    {binding: "bound", amount: 250},
    {binding: "unbound", amount: 50},
  ]);
  assert.equal(result.publicResult.beforeLevel, 88);
  assert.equal(result.publicResult.beforeRebirthCount, 2);
  assert.equal(result.publicResult.clearedRebirthHistoryCount, 2);
  assert.equal(result.publicResult.payment.amount, 300);

  assert.equal(result.pet.petGrowth.private.privateSeed, source.petGrowth.private.privateSeed);
  assert.deepEqual(result.pet.petGrowth.private.privateRoll, source.petGrowth.private.privateRoll);
  assert.deepEqual(result.pet.initialStats, source.initialStats);
  assert.deepEqual(result.pet.growthSpeciesLevel1Stats, source.growthSpeciesLevel1Stats);
  assert.deepEqual(result.pet.petGrowth.private.cultivation.initialBonus, source.petGrowth.private.cultivation.initialBonus);
  assert.deepEqual(result.pet.activeSkillIds, source.activeSkillIds);
  assert.deepEqual(result.pet.petSkillSlots, source.petSkillSlots);
  assert.deepEqual(result.pet.passiveSkillIds, source.passiveSkillIds);
  assert.deepEqual(result.pet.learnedSkillIds, source.learnedSkillIds);
  assert.deepEqual(result.pet.inheritedSkillIds, source.inheritedSkillIds);
  assert.deepEqual(result.pet.evolutionLineage, source.evolutionLineage);
  assert.equal(result.pet.favorite, true);
  assert.deepEqual(validatePetGrowth(result.pet, fixture.profile), {ok: true, code: "", errors: []});
});

test("paid reset fails closed for legacy, zero-rebirth, damaged and duplicate-operation pets", () => {
  const fixture = twoRebirthPet();
  const source = structuredClone(fixture.pet);

  const legacy = {
    instanceId: "legacy_paid_reset_pet",
    petId: "legacy_paid_reset_pet",
    formId: FORM_ID,
    templateId: FORM_ID,
    speciesId: FORM_ID,
    name: "旧档四灵幼兽",
    state: "standby",
    level: 140,
    maxHp: 900,
    hp: 900,
    attack: 200,
    defense: 160,
    quick: 180,
  };
  const legacyResult = applyPetPaidReset(legacy, paidResetInput(fixture));
  assert.equal(legacyResult.ok, false);
  assert.equal(legacyResult.code, "pet_paid_reset_growth_unsupported");

  const first = applyPetPaidReset(source, paidResetInput(fixture));
  assert.equal(first.ok, true);
  const zeroResult = applyPetPaidReset(
    first.pet,
    paidResetInput(fixture, "paid_reset_operation_0002"),
  );
  assert.equal(zeroResult.ok, false);
  assert.equal(zeroResult.code, "pet_paid_reset_cultivation_invalid");

  const damaged = structuredClone(source);
  damaged.petGrowth.settledLevel = 1;
  const damagedResult = applyPetPaidReset(damaged, paidResetInput(fixture));
  assert.equal(damagedResult.ok, false);
  assert.equal(damagedResult.code, "pet_growth_state_invalid");

  const rerolled = structuredClone(source);
  rerolled.paidResetCount = first.pet.paidResetCount;
  rerolled.paidResetAudit = structuredClone(first.pet.paidResetAudit);
  const duplicateResult = applyPetPaidReset(rerolled, paidResetInput(fixture));
  assert.equal(duplicateResult.ok, false);
  assert.equal(duplicateResult.code, "pet_paid_reset_operation_reused");
  assert.deepEqual(fixture.pet, source);
});

test("paid reset audit remains bounded while permanent count and archived count agree", () => {
  const fixture = twoRebirthPet();
  const first = applyPetPaidReset(fixture.pet, paidResetInput(fixture));
  assert.equal(first.ok, true);
  const prototype = first.pet.paidResetAudit.records[0];
  const records = [];
  for (let index = 0; index < PET_PAID_RESET_AUDIT_MAX_RECORDS; index += 1) {
    records.push({
      ...structuredClone(prototype),
      operationId: `paid_reset_archived_${String(index).padStart(4, "0")}`,
      resetNumber: index + 11,
      after: {...structuredClone(prototype.after), paidResetCount: index + 11},
    });
  }
  const audited = structuredClone(fixture.pet);
  audited.paidResetCount = 60;
  audited.paidResetAudit = {
    schemaVersion: 1,
    totalCount: 60,
    archivedCount: 10,
    records,
  };
  const canonical = canonicalPaidResetState(audited);
  assert.equal(canonical.ok, true);
  assert.equal(canonical.count, 60);
  assert.equal(canonical.audit.records.length, PET_PAID_RESET_AUDIT_MAX_RECORDS);
  assert.equal(canonical.audit.archivedCount, 10);

  const damagedAudit = structuredClone(audited);
  damagedAudit.paidResetAudit.records[0].after.paidResetCount = 999;
  const rejected = canonicalPaidResetState(damagedAudit);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "pet_paid_reset_audit_invalid");
});
