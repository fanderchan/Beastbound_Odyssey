"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const policy = require("../src/auth/pet-protection-policy");

function facts(overrides = {}) {
  return {
    isRiding: false,
    isActiveBattlePet: false,
    requiredByActiveQuest: false,
    hasLearnedSkillEvidence: false,
    hasForgottenSkillEvidence: false,
    hasCustomSkillEvidence: false,
    ...overrides,
  };
}

function pet(overrides = {}) {
  return {
    instanceId: "pet_captured_1",
    petId: "pet_captured_1",
    formId: "blue_man_dragon_water10",
    templateId: "blue_man_dragon_water10",
    source: "wild_capture",
    state: "storage",
    level: 1,
    exp: 0,
    locked: false,
    binding: "unbound",
    captureOverflowPending: false,
    activeInBattle: false,
    forgottenSkillIds: [],
    ...overrides,
  };
}

function evaluate(petOverrides = {}, factOverrides = {}) {
  return policy.evaluateAutomaticPetProcessing({
    pet: pet(petOverrides),
    facts: facts(factOverrides),
  });
}

function reasonCodes(result) {
  return result.reasons.map((entry) => entry.code);
}

function profileEvaluation(petOverrides = {}, profileOverrides = {}, templateOverrides = {}, requiredByActiveQuest = false) {
  const template = {
    formId: "blue_man_dragon_water10",
    activeSkillIds: ["pet_attack", "pet_defend"],
    passiveSkillIds: ["wuli_hard_shell"],
    petSkillSlots: ["pet_attack", "pet_defend", "", "", "", "", ""],
    ...templateOverrides,
  };
  const profilePet = pet({
    activeSkillIds: [...template.activeSkillIds],
    passiveSkillIds: [...template.passiveSkillIds],
    petSkillSlots: [...template.petSkillSlots],
    ...petOverrides,
  });
  return policy.evaluateProfilePetAutomaticProcessing({
    pet: profilePet,
    profile: {
      ridePetInstanceId: "",
      activePetInstanceId: "",
      ...profileOverrides,
    },
    template,
    requiredByActiveQuest,
  });
}

test("fresh trusted wild capture is the only automatic-processing candidate", () => {
  const input = {pet: pet(), facts: facts()};
  const before = structuredClone(input);
  const result = policy.evaluateAutomaticPetProcessing(input);

  assert.deepEqual(input, before);
  assert.deepEqual(result, {
    schemaVersion: 1,
    status: "eligible",
    eligible: true,
    protected: false,
    primaryReasonCode: "automatic_pet_processing_eligible",
    primaryReasonLabel: "仅符合自动处理候选的安全条件。",
    reasons: [{
      code: "automatic_pet_processing_eligible",
      label: "仅符合自动处理候选的安全条件。",
    }],
  });
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.REASON_CODES), true);
  assert.equal(Object.isFrozen(policy.REASON_LABELS), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.reasons), true);
  assert.equal(Object.isFrozen(result.reasons[0]), true);
});

test("protection matrix fails closed with stable public reason codes", () => {
  const cases = [
    [{source: undefined}, {}, "automatic_pet_source_untrusted"],
    [{source: "commercial"}, {}, "automatic_pet_source_untrusted"],
    [{source: " wild_capture "}, {}, "automatic_pet_source_untrusted"],
    [{locked: true}, {}, "automatic_pet_locked"],
    [{binding: "bound"}, {}, "automatic_pet_bound"],
    [{bound: true}, {}, "automatic_pet_bound"],
    [{bindingLocked: true}, {}, "automatic_pet_bound"],
    [{favorite: true}, {}, "automatic_pet_favorite"],
    [{state: "riding"}, {}, "automatic_pet_riding"],
    [{}, {isRiding: true}, "automatic_pet_riding"],
    [{state: "battle"}, {}, "automatic_pet_active"],
    [{activeInBattle: true}, {}, "automatic_pet_active"],
    [{}, {isActiveBattlePet: true}, "automatic_pet_active"],
    [{}, {requiredByActiveQuest: true}, "automatic_pet_required_by_quest"],
    [{captureOverflowPending: true}, {}, "automatic_pet_capture_overflow_pending"],
    [{level: 2}, {}, "automatic_pet_trained_level"],
    [{exp: 1}, {}, "automatic_pet_has_exp"],
    [{petRebirthHelper: {}}, {}, "automatic_pet_rebirth_helper"],
    [{forgottenSkillIds: ["pet_attack"]}, {}, "automatic_pet_skill_modified"],
    [{learnedSkillIds: ["pet_sleep_powder"]}, {}, "automatic_pet_skill_modified"],
    [{customSkillIds: ["pet_custom"]}, {}, "automatic_pet_skill_modified"],
    [{trainedSkillIds: ["pet_stone_gaze"]}, {}, "automatic_pet_skill_modified"],
    [{inheritedSkillIds: ["pet_inherited"]}, {}, "automatic_pet_skill_modified"],
    [{skillTrainingHistory: ["trained_once"]}, {}, "automatic_pet_skill_modified"],
    [{}, {hasLearnedSkillEvidence: true}, "automatic_pet_skill_modified"],
    [{}, {hasForgottenSkillEvidence: true}, "automatic_pet_skill_modified"],
    [{}, {hasCustomSkillEvidence: true}, "automatic_pet_skill_modified"],
  ];

  for (const [petOverrides, factOverrides, code] of cases) {
    const result = evaluate(petOverrides, factOverrides);
    assert.equal(result.status, "protected", code);
    assert.equal(result.eligible, false, code);
    assert.equal(result.protected, true, code);
    assert.equal(result.primaryReasonCode, code, code);
    assert.deepEqual(reasonCodes(result), [code], code);
    assert.equal(typeof result.reasons[0].label, "string", code);
    assert.notEqual(result.reasons[0].label, "", code);
  }
});

test("all meaningful cultivation evidence is protected while a canonical zero record is neutral", () => {
  const cultivated = [
    {rebirthCount: 1},
    {enhanceLevel: 1},
    {rebirthGrowthBonus: {attack: 0.001}},
    {history: [{mode: "enhance"}]},
    {lastPreview: {mode: "rebirth"}},
    {lastResult: {mode: "rebirth"}},
    {futureCultivationMarker: 0},
  ];
  for (const petCultivation of cultivated) {
    assert.deepEqual(
      reasonCodes(evaluate({petCultivation})),
      ["automatic_pet_cultivated"],
    );
  }

  const zero = evaluate({
    petCultivation: {
      schemaVersion: 1,
      rebirthCount: 0,
      enhanceLevel: 0,
      rebirthGrowthBonus: {maxHp: 0, attack: 0, defense: 0, quick: 0},
      history: [],
      lastPreview: {},
      lastResult: {},
    },
  });
  assert.equal(zero.eligible, true);
  assert.deepEqual(reasonCodes(zero), ["automatic_pet_processing_eligible"]);
});

test("strict malformed facts and pet protection fields never become eligible", () => {
  const invalidInputs = [
    null,
    {},
    {pet: pet(), facts: facts(), extra: true},
    {pet: pet(), facts: {}},
    {pet: pet(), facts: facts({isRiding: "false"})},
    {pet: pet({state: "future_state"}), facts: facts()},
    {pet: pet({instanceId: ""}), facts: facts()},
    {pet: pet({petId: "different_pet"}), facts: facts()},
    {pet: pet({formId: " blue_man_dragon_water10"}), facts: facts()},
    {pet: pet({templateId: "different_form"}), facts: facts()},
    {pet: pet({level: "1"}), facts: facts()},
    {pet: pet({exp: -1}), facts: facts()},
    {pet: pet({locked: "true"}), facts: facts()},
    {pet: pet({bound: "true"}), facts: facts()},
    {pet: pet({bindingLocked: 1}), facts: facts()},
    {pet: pet({favorite: "true"}), facts: facts()},
    {pet: pet({binding: "unknown"}), facts: facts()},
    {pet: pet({captureOverflowPending: 1}), facts: facts()},
    {pet: pet({activeInBattle: 1}), facts: facts()},
    {pet: pet({forgottenSkillIds: "pet_attack"}), facts: facts()},
    {pet: pet({petCultivation: null}), facts: facts()},
    {pet: pet({petCultivation: {rebirthCount: "1"}}), facts: facts()},
  ];
  for (const input of invalidInputs) {
    const result = policy.evaluateAutomaticPetProcessing(input);
    assert.equal(result.eligible, false);
    assert.equal(result.primaryReasonCode, "automatic_pet_input_invalid");
    assert.equal(result.reasons[0].label, "宠物保护资料不完整，不能自动处理。");
  }
});

test("multiple protections use a deterministic priority order", () => {
  const result = evaluate({
    source: "commercial",
    state: "riding",
    level: 20,
    exp: 9,
    locked: true,
    binding: "bound",
    favorite: true,
    captureOverflowPending: true,
    activeInBattle: true,
    petCultivation: {enhanceLevel: 1},
    petRebirthHelper: {stage: 1},
    forgottenSkillIds: ["pet_attack"],
  }, {
    isRiding: true,
    isActiveBattlePet: true,
    requiredByActiveQuest: true,
    hasLearnedSkillEvidence: true,
  });
  assert.deepEqual(reasonCodes(result), [
    "automatic_pet_source_untrusted",
    "automatic_pet_locked",
    "automatic_pet_bound",
    "automatic_pet_favorite",
    "automatic_pet_riding",
    "automatic_pet_active",
    "automatic_pet_required_by_quest",
    "automatic_pet_capture_overflow_pending",
    "automatic_pet_trained_level",
    "automatic_pet_has_exp",
    "automatic_pet_cultivated",
    "automatic_pet_rebirth_helper",
    "automatic_pet_skill_modified",
  ]);
  assert.equal(result.primaryReasonCode, "automatic_pet_source_untrusted");
});

test("hidden growth and private candidate getters are never read", () => {
  const hiddenFields = new Set([
    "petGrowth",
    "growthPrivate",
    "privateSeed",
    "privateRoll",
    "individualSeed",
    "qualityRoll",
    "growthSpeciesRoll",
    "captureSecret",
    "integrityTag",
  ]);
  const guardedPet = new Proxy(pet(), {
    get(target, property, receiver) {
      if (hiddenFields.has(property)) {
        throw new Error(`forbidden hidden pet read: ${String(property)}`);
      }
      return Reflect.get(target, property, receiver);
    },
  });
  for (const key of hiddenFields) {
    Object.defineProperty(guardedPet, key, {
      enumerable: true,
      configurable: true,
      get() {
        throw new Error(`forbidden hidden pet getter: ${key}`);
      },
    });
  }

  const result = policy.evaluateAutomaticPetProcessing({pet: guardedPet, facts: facts()});
  assert.equal(result.eligible, true);
  assert.deepEqual(reasonCodes(result), ["automatic_pet_processing_eligible"]);
});

test("profile authority builds riding, active, quest and real skill-change facts", () => {
  assert.equal(profileEvaluation().eligible, true);
  assert.deepEqual(
    reasonCodes(profileEvaluation({}, {ridePetInstanceId: "pet_captured_1"})),
    ["automatic_pet_riding"],
  );
  assert.deepEqual(
    reasonCodes(profileEvaluation({}, {activePetInstanceId: "pet_captured_1"})),
    ["automatic_pet_active"],
  );
  assert.deepEqual(
    reasonCodes(profileEvaluation({}, {}, {}, true)),
    ["automatic_pet_required_by_quest"],
  );
  assert.deepEqual(
    reasonCodes(profileEvaluation({
      activeSkillIds: ["pet_attack", "pet_defend", "pet_sleep_powder"],
      forgottenSkillIds: [],
    })),
    ["automatic_pet_skill_modified"],
  );
  assert.deepEqual(
    reasonCodes(profileEvaluation({
      activeSkillIds: ["pet_attack"],
      petSkillSlots: ["pet_attack", "", "", "", "", "", ""],
      forgottenSkillIds: [],
    })),
    ["automatic_pet_skill_modified"],
  );
  assert.deepEqual(
    reasonCodes(profileEvaluation({
      passiveSkillIds: ["wuli_hard_shell", "future_inherited_passive"],
    })),
    ["automatic_pet_skill_modified"],
  );
  assert.deepEqual(
    reasonCodes(profileEvaluation({passiveSkillIds: []})),
    ["automatic_pet_skill_modified"],
  );
  assert.deepEqual(
    reasonCodes(profileEvaluation({
      petSkillSlots: ["pet_defend", "pet_attack", "", "", "", "", ""],
    })),
    ["automatic_pet_skill_modified"],
  );
  assert.equal(profileEvaluation({}, {}, {formId: "wrong_form"}).primaryReasonCode, "automatic_pet_input_invalid");
  assert.equal(profileEvaluation({
    activeSkillIds: ["pet_attack", "pet_defend"],
    petSkillSlots: ["pet_attack", "unknown_skill", "", "", "", "", ""],
  }).primaryReasonCode, "automatic_pet_input_invalid");
});
