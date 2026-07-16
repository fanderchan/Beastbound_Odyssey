"use strict";

const POLICY_SCHEMA_VERSION = 1;
const TRUSTED_AUTOMATIC_SOURCE = "wild_capture";

const REASON_CODES = Object.freeze({
  ELIGIBLE: "automatic_pet_processing_eligible",
  INPUT_INVALID: "automatic_pet_input_invalid",
  SOURCE_UNTRUSTED: "automatic_pet_source_untrusted",
  LOCKED: "automatic_pet_locked",
  BOUND: "automatic_pet_bound",
  FAVORITE: "automatic_pet_favorite",
  RIDING: "automatic_pet_riding",
  ACTIVE: "automatic_pet_active",
  REQUIRED_BY_QUEST: "automatic_pet_required_by_quest",
  CAPTURE_OVERFLOW_PENDING: "automatic_pet_capture_overflow_pending",
  TRAINED_LEVEL: "automatic_pet_trained_level",
  HAS_EXP: "automatic_pet_has_exp",
  CULTIVATED: "automatic_pet_cultivated",
  REBIRTH_HELPER: "automatic_pet_rebirth_helper",
  SKILL_MODIFIED: "automatic_pet_skill_modified",
});

const REASON_LABELS = Object.freeze({
  [REASON_CODES.ELIGIBLE]: "仅符合自动处理候选的安全条件。",
  [REASON_CODES.INPUT_INVALID]: "宠物保护资料不完整，不能自动处理。",
  [REASON_CODES.SOURCE_UNTRUSTED]: "宠物来源未确认，不能自动处理。",
  [REASON_CODES.LOCKED]: "宠物已锁定，不能自动处理。",
  [REASON_CODES.BOUND]: "宠物已绑定，不能自动处理。",
  [REASON_CODES.FAVORITE]: "宠物已标记为珍藏，不能自动处理。",
  [REASON_CODES.RIDING]: "宠物正在骑乘，不能自动处理。",
  [REASON_CODES.ACTIVE]: "宠物正在出战，不能自动处理。",
  [REASON_CODES.REQUIRED_BY_QUEST]: "宠物为当前任务所需，不能自动处理。",
  [REASON_CODES.CAPTURE_OVERFLOW_PENDING]: "宠物仍在满栏临时收容中，不能自动处理。",
  [REASON_CODES.TRAINED_LEVEL]: "宠物已经升级培养，不能自动处理。",
  [REASON_CODES.HAS_EXP]: "宠物已有成长经验，不能自动处理。",
  [REASON_CODES.CULTIVATED]: "宠物已有培养记录，不能自动处理。",
  [REASON_CODES.REBIRTH_HELPER]: "宠物属于转生辅助宠，不能自动处理。",
  [REASON_CODES.SKILL_MODIFIED]: "宠物已有技能培养或调整，不能自动处理。",
});

const REQUIRED_FACT_KEYS = Object.freeze([
  "isRiding",
  "isActiveBattlePet",
  "requiredByActiveQuest",
  "hasLearnedSkillEvidence",
  "hasForgottenSkillEvidence",
  "hasCustomSkillEvidence",
]);

const ALLOWED_PET_STATES = Object.freeze([
  "standby",
  "rest",
  "storage",
  "battle",
  "riding",
]);

const SKILL_EVIDENCE_ARRAY_FIELDS = Object.freeze([
  "learnedSkillIds",
  "forgottenSkillIds",
  "customSkillIds",
  "trainedSkillIds",
  "inheritedSkillIds",
  "skillTrainingHistory",
]);

const CULTIVATION_KEYS = Object.freeze([
  "schemaVersion",
  "rebirthCount",
  "enhanceLevel",
  "rebirthGrowthBonus",
  "history",
  "lastPreview",
  "lastResult",
]);

const CULTIVATION_STAT_KEYS = Object.freeze([
  "maxHp",
  "attack",
  "defense",
  "quick",
]);

function isObjectRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function exactObjectKeys(value, expectedKeys) {
  if (!isObjectRecord(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function optionalBoolean(value, key) {
  if (!hasOwn(value, key)) {
    return {invalid: false, value: false};
  }
  return typeof value[key] === "boolean"
    ? {invalid: false, value: value[key]}
    : {invalid: true, value: false};
}

function stableIdentity(value, primaryKey, aliasKey) {
  const values = [];
  for (const key of [primaryKey, aliasKey]) {
    if (!hasOwn(value, key)) {
      continue;
    }
    const identity = value[key];
    if (typeof identity !== "string" || identity === "" || identity !== identity.trim()) {
      return {invalid: true, value: ""};
    }
    values.push(identity);
  }
  if (values.length <= 0 || values.some((identity) => identity !== values[0])) {
    return {invalid: true, value: ""};
  }
  return {invalid: false, value: values[0]};
}

function optionalStableIdentity(value, key) {
  if (!hasOwn(value, key) || value[key] === "") {
    return {invalid: false, value: ""};
  }
  return typeof value[key] === "string" && value[key] === value[key].trim()
    ? {invalid: false, value: value[key]}
    : {invalid: true, value: ""};
}

function canonicalStringArray(value, options = {}) {
  if (value === undefined && options.optional === true) {
    return {invalid: false, values: []};
  }
  if (!Array.isArray(value)) {
    return {invalid: true, values: []};
  }
  const allowEmpty = options.allowEmpty === true;
  const values = [];
  for (const entry of value) {
    if (
      typeof entry !== "string"
      || entry !== entry.trim()
      || (!allowEmpty && entry === "")
      || (entry !== "" && values.includes(entry))
    ) {
      return {invalid: true, values: []};
    }
    values.push(entry);
  }
  return {invalid: false, values};
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function meaningfulRecord(value) {
  return isObjectRecord(value) && Object.keys(value).length > 0;
}

function cultivationEvidence(pet) {
  if (!hasOwn(pet, "petCultivation")) {
    return {invalid: false, meaningful: false};
  }
  const cultivation = pet.petCultivation;
  if (!isObjectRecord(cultivation)) {
    return {invalid: true, meaningful: false};
  }
  const keys = Object.keys(cultivation);
  if (keys.some((key) => !CULTIVATION_KEYS.includes(key))) {
    // Future or damaged cultivation state is protected until its meaning is
    // explicitly added to this allowlist.
    return {invalid: false, meaningful: true};
  }

  if (hasOwn(cultivation, "schemaVersion")) {
    if (!Number.isSafeInteger(cultivation.schemaVersion) || cultivation.schemaVersion < 1) {
      return {invalid: true, meaningful: false};
    }
  }
  for (const key of ["rebirthCount", "enhanceLevel"]) {
    if (!hasOwn(cultivation, key)) {
      continue;
    }
    if (!Number.isSafeInteger(cultivation[key]) || cultivation[key] < 0) {
      return {invalid: true, meaningful: false};
    }
    if (cultivation[key] > 0) {
      return {invalid: false, meaningful: true};
    }
  }

  if (hasOwn(cultivation, "rebirthGrowthBonus")) {
    const bonus = cultivation.rebirthGrowthBonus;
    if (!isObjectRecord(bonus)) {
      return {invalid: true, meaningful: false};
    }
    const bonusKeys = Object.keys(bonus);
    if (bonusKeys.some((key) => !CULTIVATION_STAT_KEYS.includes(key))) {
      return {invalid: false, meaningful: true};
    }
    for (const key of bonusKeys) {
      if (typeof bonus[key] !== "number" || !Number.isFinite(bonus[key])) {
        return {invalid: true, meaningful: false};
      }
      if (bonus[key] !== 0) {
        return {invalid: false, meaningful: true};
      }
    }
  }

  if (hasOwn(cultivation, "history")) {
    if (!Array.isArray(cultivation.history)) {
      return {invalid: true, meaningful: false};
    }
    if (cultivation.history.length > 0) {
      return {invalid: false, meaningful: true};
    }
  }
  for (const key of ["lastPreview", "lastResult"]) {
    if (!hasOwn(cultivation, key)) {
      continue;
    }
    if (!isObjectRecord(cultivation[key])) {
      return {invalid: true, meaningful: false};
    }
    if (meaningfulRecord(cultivation[key])) {
      return {invalid: false, meaningful: true};
    }
  }
  return {invalid: false, meaningful: false};
}

function skillEvidence(pet) {
  let meaningful = false;
  for (const key of SKILL_EVIDENCE_ARRAY_FIELDS) {
    if (!hasOwn(pet, key)) {
      continue;
    }
    const entries = pet[key];
    if (!Array.isArray(entries)) {
      return {invalid: true, meaningful: false};
    }
    if (entries.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
      return {invalid: true, meaningful: false};
    }
    meaningful = meaningful || entries.length > 0;
  }
  // activeSkillIds and petSkillSlots are intentionally not inspected: newly
  // captured pets already contain their template-default loadout.
  return {invalid: false, meaningful};
}

function reason(code) {
  return Object.freeze({code, label: REASON_LABELS[code]});
}

function evaluation(reasonCodes) {
  const uniqueCodes = reasonCodes.filter((code, index, all) => all.indexOf(code) === index);
  const protectedPet = uniqueCodes.length > 0;
  const finalCodes = protectedPet ? uniqueCodes : [REASON_CODES.ELIGIBLE];
  const reasons = Object.freeze(finalCodes.map(reason));
  return Object.freeze({
    schemaVersion: POLICY_SCHEMA_VERSION,
    status: protectedPet ? "protected" : "eligible",
    eligible: !protectedPet,
    protected: protectedPet,
    primaryReasonCode: finalCodes[0],
    primaryReasonLabel: REASON_LABELS[finalCodes[0]],
    reasons,
  });
}

function evaluateStrict(input) {
  if (!exactObjectKeys(input, ["pet", "facts"])) {
    return evaluation([REASON_CODES.INPUT_INVALID]);
  }
  const pet = input.pet;
  const facts = input.facts;
  if (!isObjectRecord(pet) || !exactObjectKeys(facts, REQUIRED_FACT_KEYS)) {
    return evaluation([REASON_CODES.INPUT_INVALID]);
  }
  if (REQUIRED_FACT_KEYS.some((key) => typeof facts[key] !== "boolean")) {
    return evaluation([REASON_CODES.INPUT_INVALID]);
  }

  const locked = optionalBoolean(pet, "locked");
  const bound = optionalBoolean(pet, "bound");
  const bindingLocked = optionalBoolean(pet, "bindingLocked");
  const favorite = optionalBoolean(pet, "favorite");
  const overflow = optionalBoolean(pet, "captureOverflowPending");
  const activeInBattle = optionalBoolean(pet, "activeInBattle");
  const cultivation = cultivationEvidence(pet);
  const skills = skillEvidence(pet);
  const instanceIdentity = stableIdentity(pet, "instanceId", "petId");
  const formIdentity = stableIdentity(pet, "formId", "templateId");
  const binding = hasOwn(pet, "binding") ? pet.binding : "unbound";
  const state = pet.state;
  const level = pet.level;
  const exp = pet.exp;
  const inputInvalid = (
    locked.invalid
    || bound.invalid
    || bindingLocked.invalid
    || favorite.invalid
    || overflow.invalid
    || activeInBattle.invalid
    || cultivation.invalid
    || skills.invalid
    || instanceIdentity.invalid
    || formIdentity.invalid
    || !["unbound", "bound"].includes(binding)
    || !ALLOWED_PET_STATES.includes(state)
    || !Number.isSafeInteger(level)
    || level < 1
    || !Number.isSafeInteger(exp)
    || exp < 0
  );

  const codes = [];
  if (inputInvalid) {
    codes.push(REASON_CODES.INPUT_INVALID);
  }
  if (pet.source !== TRUSTED_AUTOMATIC_SOURCE) {
    codes.push(REASON_CODES.SOURCE_UNTRUSTED);
  }
  if (locked.value) {
    codes.push(REASON_CODES.LOCKED);
  }
  if (binding === "bound" || bound.value || bindingLocked.value) {
    codes.push(REASON_CODES.BOUND);
  }
  if (favorite.value) {
    codes.push(REASON_CODES.FAVORITE);
  }
  if (state === "riding" || facts.isRiding) {
    codes.push(REASON_CODES.RIDING);
  }
  if (state === "battle" || activeInBattle.value || facts.isActiveBattlePet) {
    codes.push(REASON_CODES.ACTIVE);
  }
  if (facts.requiredByActiveQuest) {
    codes.push(REASON_CODES.REQUIRED_BY_QUEST);
  }
  if (overflow.value) {
    codes.push(REASON_CODES.CAPTURE_OVERFLOW_PENDING);
  }
  if (Number.isSafeInteger(level) && level > 1) {
    codes.push(REASON_CODES.TRAINED_LEVEL);
  }
  if (Number.isSafeInteger(exp) && exp > 0) {
    codes.push(REASON_CODES.HAS_EXP);
  }
  if (cultivation.meaningful) {
    codes.push(REASON_CODES.CULTIVATED);
  }
  if (hasOwn(pet, "petRebirthHelper")) {
    codes.push(REASON_CODES.REBIRTH_HELPER);
  }
  if (
    skills.meaningful
    || facts.hasLearnedSkillEvidence
    || facts.hasForgottenSkillEvidence
    || facts.hasCustomSkillEvidence
  ) {
    codes.push(REASON_CODES.SKILL_MODIFIED);
  }
  return evaluation(codes);
}

function evaluateAutomaticPetProcessing(input) {
  try {
    return evaluateStrict(input);
  } catch (_error) {
    return evaluation([REASON_CODES.INPUT_INVALID]);
  }
}

function evaluateProfilePetAutomaticProcessing(input) {
  try {
    if (!exactObjectKeys(input, ["pet", "profile", "template", "requiredByActiveQuest"])) {
      return evaluation([REASON_CODES.INPUT_INVALID]);
    }
    const pet = input.pet;
    const profile = input.profile;
    const template = input.template;
    if (
      !isObjectRecord(pet)
      || !isObjectRecord(profile)
      || !isObjectRecord(template)
      || typeof input.requiredByActiveQuest !== "boolean"
    ) {
      return evaluation([REASON_CODES.INPUT_INVALID]);
    }
    const instanceIdentity = stableIdentity(pet, "instanceId", "petId");
    const formIdentity = stableIdentity(pet, "formId", "templateId");
    const templateFormId = optionalStableIdentity(template, "formId");
    const rideIdentity = optionalStableIdentity(profile, "ridePetInstanceId");
    const activeIdentity = optionalStableIdentity(profile, "activePetInstanceId");
    const petActiveSkills = canonicalStringArray(pet.activeSkillIds, {optional: true});
    const templateActiveSkills = canonicalStringArray(template.activeSkillIds, {optional: true});
    const petPassiveSkills = canonicalStringArray(pet.passiveSkillIds, {optional: true});
    const templatePassiveSkills = canonicalStringArray(template.passiveSkillIds, {optional: true});
    const petSkillSlots = canonicalStringArray(pet.petSkillSlots, {optional: true, allowEmpty: true});
    const templateSkillSlots = canonicalStringArray(template.petSkillSlots, {optional: true, allowEmpty: true});
    const forgottenSkills = canonicalStringArray(pet.forgottenSkillIds, {optional: true});
    if (
      instanceIdentity.invalid
      || formIdentity.invalid
      || templateFormId.invalid
      || templateFormId.value === ""
      || templateFormId.value !== formIdentity.value
      || rideIdentity.invalid
      || activeIdentity.invalid
      || petActiveSkills.invalid
      || templateActiveSkills.invalid
      || petPassiveSkills.invalid
      || templatePassiveSkills.invalid
      || petSkillSlots.invalid
      || templateSkillSlots.invalid
      || forgottenSkills.invalid
      || petSkillSlots.values.some((skillId) => skillId !== "" && !petActiveSkills.values.includes(skillId))
      || templateSkillSlots.values.some((skillId) => skillId !== "" && !templateActiveSkills.values.includes(skillId))
    ) {
      return evaluation([REASON_CODES.INPUT_INVALID]);
    }
    const hasLearnedSkillEvidence = petActiveSkills.values.some((skillId) => (
      !templateActiveSkills.values.includes(skillId)
    ));
    const hasForgottenSkillEvidence = forgottenSkills.values.length > 0;
    const hasCustomSkillEvidence = (
      !sameStringArray(petActiveSkills.values, templateActiveSkills.values)
      || !sameStringArray(petPassiveSkills.values, templatePassiveSkills.values)
      || !sameStringArray(petSkillSlots.values, templateSkillSlots.values)
    );
    return evaluateAutomaticPetProcessing({
      pet,
      facts: {
        isRiding: pet.state === "riding" || rideIdentity.value === instanceIdentity.value,
        isActiveBattlePet: pet.state === "battle" || activeIdentity.value === instanceIdentity.value,
        requiredByActiveQuest: input.requiredByActiveQuest,
        hasLearnedSkillEvidence,
        hasForgottenSkillEvidence,
        hasCustomSkillEvidence,
      },
    });
  } catch (_error) {
    return evaluation([REASON_CODES.INPUT_INVALID]);
  }
}

module.exports = Object.freeze({
  POLICY_SCHEMA_VERSION,
  REASON_CODES,
  REASON_LABELS,
  REQUIRED_FACT_KEYS,
  TRUSTED_AUTOMATIC_SOURCE,
  evaluateAutomaticPetProcessing,
  evaluateProfilePetAutomaticProcessing,
});
