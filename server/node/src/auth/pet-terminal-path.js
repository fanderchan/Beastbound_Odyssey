"use strict";

const PET_PAID_RESET_TERMINAL_STAGE_CODE = "pet_paid_reset_terminal_stage";
const PET_PAID_RESET_TERMINAL_STAGE_MESSAGE = "宠物已进入2转、进化或融合终局，不能付费重置。";

function inspectPetTerminalPath(petValue, evolutionRouteCatalog, fusionCatalog) {
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
  if (petFormIds.size > 0 && fusionTargetFormIds(fusionCatalog).some((formId) => (
    petFormIds.has(formId)
  ))) {
    return {terminal: true, branch: "fusion", evidence: "target_form"};
  }
  const cultivation = recordOrNull(pet.petCultivation);
  const rebirthCount = Number(cultivation && cultivation.rebirthCount);
  if (Number.isFinite(rebirthCount) && Math.trunc(rebirthCount) >= 2) {
    return {terminal: true, branch: "rebirth", evidence: "rebirth_count"};
  }
  return {terminal: false, branch: "", evidence: ""};
}

function fusionTargetFormIds(catalogValue) {
  const catalog = recordOrNull(catalogValue);
  if (!catalog) {
    return [];
  }
  const result = new Set();
  const targetFormIds = Array.isArray(catalog.targetFormIds)
    ? catalog.targetFormIds
    : catalog.targetFormIds instanceof Set
      ? Array.from(catalog.targetFormIds)
      : [];
  for (const value of targetFormIds) {
    const formId = String(value || "").trim();
    if (formId !== "") {
      result.add(formId);
    }
  }
  const recipes = Array.isArray(catalog.recipes) ? catalog.recipes : [];
  for (const recipe of recipes) {
    const formId = String(recordOrNull(recipe) && recipe.targetFormId || "").trim();
    if (formId !== "") {
      result.add(formId);
    }
  }
  return Array.from(result);
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
