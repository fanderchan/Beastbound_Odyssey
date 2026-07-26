"use strict";

const PET_FUSION_SKILL_FORGET_ACKNOWLEDGEMENT =
  "double_confirm_irreversible_v1";
const PET_FUSION_BASE_ACTIVE_SKILL_IDS = Object.freeze([
  "pet_attack",
  "pet_defend",
]);
const PET_FUSION_ROLE_IDS = Object.freeze([
  "core",
  "resonance_one",
  "resonance_two",
]);
const PET_SKILL_ID_PATTERN = /^[a-z][a-z0-9_]{1,95}$/;

function inspectPetFusionSkillPolicy(petValue, options = {}) {
  const pet = recordOrNull(petValue);
  if (!pet) {
    return invalidFusionInspection(false);
  }
  const targetFormIds = normalizedIdSet(options.fusionTargetFormIds);
  const identityFormIds = [
    pet.formId,
    pet.templateId,
    pet.speciesId,
  ].map(normalizedId).filter(Boolean);
  const hasLineage = Object.hasOwn(pet, "fusionLineage");
  const isFusionTarget = identityFormIds.some((formId) => (
    targetFormIds.has(formId)
  ));
  if (!hasLineage && !isFusionTarget) {
    return {
      ok: true,
      isFusion: false,
      inheritedActiveSkillIds: [],
    };
  }

  const lineage = recordOrNull(pet.fusionLineage);
  if (
    !lineage
    || lineage.schemaVersion !== 1
    || lineage.mode !== "fusion"
    || !Array.isArray(lineage.activeInheritance)
    || lineage.activeInheritance.length !== PET_FUSION_ROLE_IDS.length
  ) {
    return invalidFusionInspection(true);
  }

  const roleIds = new Set();
  const inheritedActiveSkillIds = [];
  for (const entryValue of lineage.activeInheritance) {
    const entry = recordOrNull(entryValue);
    const roleId = entry ? String(entry.roleId || "").trim() : "";
    const skillId = entry ? String(entry.skillId || "").trim() : "";
    if (
      !entry
      || !PET_FUSION_ROLE_IDS.includes(roleId)
      || roleIds.has(roleId)
      || !PET_SKILL_ID_PATTERN.test(skillId)
      || PET_FUSION_BASE_ACTIVE_SKILL_IDS.includes(skillId)
      || typeof entry.inherited !== "boolean"
    ) {
      return invalidFusionInspection(true);
    }
    roleIds.add(roleId);
    if (entry.inherited === true && !inheritedActiveSkillIds.includes(skillId)) {
      inheritedActiveSkillIds.push(skillId);
    }
  }
  if (!PET_FUSION_ROLE_IDS.every((roleId) => roleIds.has(roleId))) {
    return invalidFusionInspection(true);
  }
  return {
    ok: true,
    isFusion: true,
    inheritedActiveSkillIds,
  };
}

function validatePetSkillSlotMutation(input = {}) {
  const previousSkillId = normalizedId(input.previousSkillId);
  const nextSkillId = normalizedId(input.nextSkillId);
  if (previousSkillId === nextSkillId) {
    return {ok: true};
  }
  if (PET_FUSION_BASE_ACTIVE_SKILL_IDS.includes(previousSkillId)) {
    return failure(
      "pet_skill_base",
      "攻击和防御是永久基础技能，不能清空或覆盖。",
    );
  }

  const inspection = inspectPetFusionSkillPolicy(input.pet, {
    fusionTargetFormIds: input.fusionTargetFormIds,
  });
  if (inspection.isFusion && !inspection.ok) {
    return failure(
      "pet_fusion_lineage_invalid",
      "融合技能资料异常，请联系GM处理后再操作。",
    );
  }
  if (previousSkillId === "") {
    const forgottenSkillIds = normalizedIdSet(
      input.pet && input.pet.forgottenSkillIds,
    );
    if (
      inspection.ok
      && inspection.isFusion
      && inspection.inheritedActiveSkillIds.includes(nextSkillId)
      && forgottenSkillIds.has(nextSkillId)
    ) {
      return failure(
        "pet_fusion_inherited_skill_retrain_forbidden",
        "已永久遗忘的遗传特殊主动不能重新训练。",
      );
    }
    return {ok: true};
  }
  if (!inspection.isFusion) {
    return {ok: true};
  }
  return failure(
    "pet_fusion_skill_slot_occupied",
    "融合宠只能在空技能位学习普通训练技能。",
  );
}

function validatePetSkillForget(input = {}) {
  const skillId = normalizedId(input.skillId);
  if (PET_FUSION_BASE_ACTIVE_SKILL_IDS.includes(skillId)) {
    return failure(
      "pet_skill_base",
      "攻击和防御是永久基础技能，不能遗忘。",
    );
  }
  const inspection = inspectPetFusionSkillPolicy(input.pet, {
    fusionTargetFormIds: input.fusionTargetFormIds,
  });
  if (!inspection.isFusion) {
    return {ok: true, inheritedActive: false};
  }
  if (!inspection.ok) {
    return failure(
      "pet_fusion_lineage_invalid",
      "融合技能资料异常，请联系GM处理后再操作。",
    );
  }
  if (!inspection.inheritedActiveSkillIds.includes(skillId)) {
    return {ok: true, inheritedActive: false};
  }
  if (
    String(input.acknowledgement || "").trim()
    !== PET_FUSION_SKILL_FORGET_ACKNOWLEDGEMENT
  ) {
    return failure(
      "pet_fusion_skill_forget_confirmation_required",
      "遗传特殊主动需要再次确认后才能永久遗忘。",
    );
  }
  return {ok: true, inheritedActive: true};
}

function invalidFusionInspection(isFusion) {
  return {
    ok: false,
    isFusion,
    inheritedActiveSkillIds: [],
  };
}

function normalizedId(value) {
  return String(value || "").trim();
}

function normalizedIdSet(value) {
  const result = new Set();
  for (const item of Array.isArray(value) ? value : []) {
    const id = normalizedId(item);
    if (id !== "") result.add(id);
  }
  return result;
}

function recordOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function failure(code, message) {
  return {ok: false, code, message};
}

module.exports = {
  PET_FUSION_BASE_ACTIVE_SKILL_IDS,
  PET_FUSION_SKILL_FORGET_ACKNOWLEDGEMENT,
  inspectPetFusionSkillPolicy,
  validatePetSkillForget,
  validatePetSkillSlotMutation,
};
