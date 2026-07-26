"use strict";

const PET_PAID_RESET_TERMINAL_STAGE_CODE = "pet_paid_reset_terminal_stage";
const PET_PAID_RESET_TERMINAL_STAGE_MESSAGE = "宠物已进入2转、进化或融合终局，不能付费重置。";

function inspectPetTerminalPath(petValue, evolutionRouteCatalog) {
  const pet = recordOrNull(petValue);
  if (!pet) {
    return {terminal: false, branch: "", evidence: ""};
  }
  if (Object.hasOwn(pet, "evolutionLineage")) {
    return {terminal: true, branch: "evolution", evidence: "lineage"};
  }
  if (Object.hasOwn(pet, "fusionLineage")) {
    return {terminal: true, branch: "fusion", evidence: "lineage"};
  }
  const petFormIds = new Set([
    pet.formId,
    pet.templateId,
    pet.speciesId,
  ].map((value) => String(value || "").trim()).filter(Boolean));
  const routes = Array.isArray(evolutionRouteCatalog && evolutionRouteCatalog.routes)
    ? evolutionRouteCatalog.routes
    : [];
  if (
    petFormIds.size > 0
    && routes.some((route) => petFormIds.has(String(route && route.targetFormId || "").trim()))
  ) {
    return {terminal: true, branch: "evolution", evidence: "target_form"};
  }
  const cultivation = recordOrNull(pet.petCultivation);
  const rebirthCount = Number(cultivation && cultivation.rebirthCount);
  if (Number.isFinite(rebirthCount) && Math.trunc(rebirthCount) >= 2) {
    return {terminal: true, branch: "rebirth", evidence: "rebirth_count"};
  }
  return {terminal: false, branch: "", evidence: ""};
}

function petPaidResetTerminalStageFailure() {
  return {
    ok: false,
    code: PET_PAID_RESET_TERMINAL_STAGE_CODE,
    message: PET_PAID_RESET_TERMINAL_STAGE_MESSAGE,
  };
}

function recordOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

module.exports = {
  PET_PAID_RESET_TERMINAL_STAGE_CODE,
  PET_PAID_RESET_TERMINAL_STAGE_MESSAGE,
  inspectPetTerminalPath,
  petPaidResetTerminalStageFailure,
};
