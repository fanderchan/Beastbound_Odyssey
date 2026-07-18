"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {loadPetRebirthBalance} = require("./pet-rebirth-balance");

const DEFAULT_BALANCE_PATH = path.resolve(
  __dirname,
  "../../../../client/godot/data/balance/pet_evolution_balance.json",
);
const THRESHOLD_KEYS = Object.freeze(["min", "p25", "p55", "p85", "p95", "max"]);
const EXPECTED_ATTEMPT_SOURCES = Object.freeze([
  "repeatable_floor_boss_personal_reward",
  "repeatable_lineage_material",
  "stone_coin_sink",
]);
const EXPECTED_PRESERVE = Object.freeze([
  "instance_identity",
  "owner_and_capture_history",
  "name",
  "source_stage_zero_and_one_public_history",
  "stage_one_rebirth_bonus_and_history",
  "enhancement",
  "active_passive_learned_inherited_skills",
  "paid_reset_history",
  "lock_and_binding_state",
  "form_lineage_history",
]);
const EXPECTED_CLEAR = Object.freeze([
  "level_and_exp",
  "current_hp",
  "growth_observation",
  "pending_rebirth_preview",
  "source_private_growth_identity",
]);

class PetEvolutionBalanceError extends Error {
  constructor(errors = []) {
    const safeErrors = (Array.isArray(errors) ? errors : [errors])
      .map((error) => String(error || "").trim())
      .filter(Boolean);
    super(`pet evolution balance rejected${safeErrors.length > 0 ? `: ${safeErrors.join("; ")}` : ""}`);
    this.name = "PetEvolutionBalanceError";
    this.code = "pet_evolution_balance_invalid";
    this.errors = safeErrors;
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerInRange(value, minimum, maximum) {
  const number = finite(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : null;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function exactStringArray(value, expected, pathLabel, errors) {
  if (!Array.isArray(value) || value.length !== expected.length) {
    errors.push(`${pathLabel} must contain ${expected.length} exact entries`);
    return [...expected];
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (value[index] !== expected[index]) {
      errors.push(`${pathLabel}[${index}] must equal ${expected[index]}`);
    }
  }
  return [...value];
}

function effortBlock(value, keys, pathLabel, errors) {
  const source = isRecord(value) ? value : {};
  if (!isRecord(value)) errors.push(`${pathLabel} must be an object`);
  let sum = 0;
  const result = {};
  for (const key of keys) {
    const number = finite(source[key]);
    if (number === null || number < 0) {
      errors.push(`${pathLabel}.${key} must be nonnegative`);
      result[key] = 0;
      continue;
    }
    result[key] = number;
    sum += number;
  }
  const total = finite(source.total);
  if (total === null || total <= 0 || Math.abs(total - sum) > 1e-9) {
    errors.push(`${pathLabel}.total must equal the component sum`);
  }
  result.total = total === null ? sum : total;
  return result;
}

function thresholdTable(value, pathLabel, errors) {
  const source = isRecord(value) ? value : {};
  if (!isRecord(value)) errors.push(`${pathLabel} must be an object`);
  const result = {};
  let previous = -Infinity;
  for (const key of THRESHOLD_KEYS) {
    const number = finite(source[key]);
    if (number === null || number < 0 || number < previous) {
      errors.push(`${pathLabel}.${key} is invalid`);
      result[key] = number === null ? 0 : number;
    } else {
      result[key] = number;
      previous = number;
    }
  }
  return result;
}

function assertThresholdParity(actual, expected, pathLabel, errors) {
  for (const key of THRESHOLD_KEYS) {
    if (Math.abs(Number(actual[key]) - Number(expected && expected[key])) > 0.000002) {
      errors.push(`${pathLabel}.${key} must match rebirth stage 2`);
    }
  }
}

function createPetEvolutionBalance(document, {rebirthBalance = loadPetRebirthBalance()} = {}) {
  const errors = [];
  if (!isRecord(document)) throw new PetEvolutionBalanceError(["document must be an object"]);
  if (document.schemaVersion !== 1) errors.push("schemaVersion must equal 1");
  const balanceVersion = String(document.balanceVersion || "").trim();
  if (!/^pet_evolution_balance_v[1-9][0-9]*$/.test(balanceVersion)) {
    errors.push("balanceVersion is invalid");
  }

  const reference = isRecord(document.reference) ? document.reference : {};
  if (reference.rebirthBalanceVersion !== rebirthBalance.balanceVersion) {
    errors.push("reference.rebirthBalanceVersion must match the active rebirth balance");
  }
  if (reference.rebirthEvaluationVersion !== rebirthBalance.evaluation.evaluationVersion) {
    errors.push("reference.rebirthEvaluationVersion must match the active rebirth evaluation");
  }
  if (reference.baselinePath !== "normal_second_rebirth_full_preparation") {
    errors.push("reference.baselinePath is invalid");
  }

  const eligibility = isRecord(document.eligibility) ? document.eligibility : {};
  const requiredLevel = integerInRange(eligibility.requiredLevel, 1, 140);
  if (eligibility.requiredRebirthCount !== 1) errors.push("eligibility.requiredRebirthCount must equal 1");
  if (requiredLevel !== rebirthBalance.target.fullPreparationLevel) {
    errors.push("eligibility.requiredLevel must equal the rebirth full-preparation level");
  }
  if (eligibility.requiredGrowthModelVersion !== "pet_growth_authority_v1") {
    errors.push("eligibility.requiredGrowthModelVersion is invalid");
  }
  if (eligibility.requiredIntrinsicPowerPercentile !== 90) {
    errors.push("eligibility.requiredIntrinsicPowerPercentile must equal 90");
  }
  if (eligibility.intrinsicPowerFormula !== "round(maxHp*0.25+attack+defense+quick)") {
    errors.push("eligibility.intrinsicPowerFormula is invalid");
  }
  if (eligibility.thresholdScope !== "same_source_form_stage_one_lv140") {
    errors.push("eligibility.thresholdScope is invalid");
  }
  if (eligibility.licenseScope !== "line") errors.push("eligibility.licenseScope must equal line");
  if (eligibility.licenseSource !== "one_time_quest_unlock_only") {
    errors.push("eligibility.licenseSource must be a one-time unlock-only quest");
  }
  if (eligibility.licenseDirectResult !== false) {
    errors.push("eligibility.licenseDirectResult must be false");
  }

  const acquisition = isRecord(document.acquisition) ? document.acquisition : {};
  const perAttemptSources = exactStringArray(
    acquisition.perAttemptSources,
    EXPECTED_ATTEMPT_SOURCES,
    "acquisition.perAttemptSources",
    errors,
  );
  if (acquisition.requiresTeamPve !== true) errors.push("acquisition.requiresTeamPve must be true");
  if (acquisition.requirementsConfigurableByRoute !== true) {
    errors.push("acquisition.requirementsConfigurableByRoute must be true");
  }
  if (acquisition.realMoneySkipAllowed !== false) errors.push("acquisition.realMoneySkipAllowed must be false");
  if (acquisition.paymentCurrencyId !== "stoneCoins") errors.push("acquisition.paymentCurrencyId must equal stoneCoins");
  if (acquisition.paymentWalletPolicyId !== "bound_first_split") {
    errors.push("acquisition.paymentWalletPolicyId must equal bound_first_split");
  }

  const effort = isRecord(document.effortModel) ? document.effortModel : {};
  if (effort.unit !== "normalized_nonpayer_effort") errors.push("effortModel.unit is invalid");
  const normalSecondRebirth = effortBlock(
    effort.normalSecondRebirth,
    ["targetTraining", "helperAcquisition", "helperTraining", "helperStones"],
    "effortModel.normalSecondRebirth",
    errors,
  );
  const evolutionRepeatable = effortBlock(
    effort.evolutionRepeatable,
    ["targetTraining", "floorBossCore", "lineageMaterials", "currencySink"],
    "effortModel.evolutionRepeatable",
    errors,
  );
  const firstUnlock = isRecord(effort.firstUnlock) ? effort.firstUnlock : {};
  const licenseQuest = finite(firstUnlock.licenseQuest);
  if (licenseQuest === null || licenseQuest <= 0) errors.push("effortModel.firstUnlock.licenseQuest must be positive");
  if (firstUnlock.excludedFromRepeatableRatio !== true) {
    errors.push("effortModel.firstUnlock.excludedFromRepeatableRatio must be true");
  }
  const targetRatio = isRecord(effort.repeatableTargetRatio) ? effort.repeatableTargetRatio : {};
  const ratioMin = finite(targetRatio.min);
  const ratioMax = finite(targetRatio.max);
  const repeatableRatio = normalSecondRebirth.total > 0
    ? evolutionRepeatable.total / normalSecondRebirth.total
    : 0;
  if (ratioMin === null || ratioMax === null || ratioMin < 1.5 || ratioMax > 2 || ratioMax < ratioMin) {
    errors.push("effortModel.repeatableTargetRatio must remain within 1.5..2.0");
  }
  if (ratioMin !== null && ratioMax !== null && (repeatableRatio < ratioMin || repeatableRatio > ratioMax)) {
    errors.push("evolution repeatable effort must stay within the configured target ratio");
  }
  if (Number(evolutionRepeatable.floorBossCore) <= 0 || Number(evolutionRepeatable.lineageMaterials) <= 0) {
    errors.push("evolution repeatable effort must include floor boss and lineage material costs");
  }

  const terminal = isRecord(document.terminalPath) ? document.terminalPath : {};
  if (terminal.pathId !== "evolution_terminal_v1") errors.push("terminalPath.pathId is invalid");
  if (terminal.resultLevel !== 1 || terminal.resultRebirthCount !== 1) {
    errors.push("terminalPath must return one-rebirth evolution to Lv1");
  }
  if (terminal.normalSecondRebirthAllowed !== false || terminal.fusionMaterialAllowed !== false) {
    errors.push("terminalPath must forbid second rebirth and fusion-material reuse");
  }
  if (terminal.successRate !== 1 || terminal.failureConsumes !== false) {
    errors.push("terminalPath must be guaranteed and non-consuming on failure");
  }
  if (terminal.formTransition !== "replace_form_preserve_instance") {
    errors.push("terminalPath.formTransition is invalid");
  }

  const quality = isRecord(document.qualityProjection) ? document.qualityProjection : {};
  if (quality.lv1FourV !== "fresh_target_species_roll_v1") {
    errors.push("qualityProjection.lv1FourV is invalid");
  }
  if (quality.hiddenGrowth !== "fresh_target_species_roll_v1") {
    errors.push("qualityProjection.hiddenGrowth is invalid");
  }
  if (
    quality.preserveIndependentDimensions !== true
    || quality.rerollAllowed !== true
    || quality.sourceQualityTransfer !== false
    || quality.preserveSourceStageSnapshots !== true
    || quality.publicCombinedScore !== false
  ) {
    errors.push("qualityProjection must reroll both independent qualities while preserving only public source-stage history");
  }

  const power = isRecord(document.powerBudget) ? document.powerBudget : {};
  if (power.preserveStageOneRebirthBonus !== true) errors.push("powerBudget must preserve the first rebirth bonus");
  if (power.evolvedIntrinsicUpliftReference !== "normal_second_rebirth_stage_2") {
    errors.push("powerBudget.evolvedIntrinsicUpliftReference is invalid");
  }
  const intrinsicUpliftInternalPower = thresholdTable(
    power.intrinsicUpliftInternalPower,
    "powerBudget.intrinsicUpliftInternalPower",
    errors,
  );
  assertThresholdParity(
    intrinsicUpliftInternalPower,
    rebirthBalance.evaluation.stageThresholds[2].power,
    "powerBudget.intrinsicUpliftInternalPower",
    errors,
  );
  if (power.terminalComparison !== "comparable_to_normal_two_rebirth") {
    errors.push("powerBudget.terminalComparison is invalid");
  }
  if (power.utilityMayExceedRawStats !== true || power.rawStatInflationBeyondBandAllowed !== false) {
    errors.push("powerBudget must reserve the premium for utility instead of raw-stat inflation");
  }

  const preserve = exactStringArray(document.preserve, EXPECTED_PRESERVE, "preserve", errors);
  const clear = exactStringArray(document.clear, EXPECTED_CLEAR, "clear", errors);
  const compatibility = isRecord(document.compatibility) ? document.compatibility : {};
  if (compatibility.applyTo !== "future_confirmed_evolutions_only") {
    errors.push("compatibility.applyTo must protect existing pets");
  }
  if (compatibility.existingPets !== "unchanged" || compatibility.existingHistory !== "unchanged") {
    errors.push("compatibility must preserve existing pets and history");
  }
  if (compatibility.oldClients !== "no_evolution_entry") {
    errors.push("compatibility.oldClients must fail closed without an evolution entry");
  }

  if (errors.length > 0) throw new PetEvolutionBalanceError(errors);
  return deepFreeze({
    schemaVersion: 1,
    balanceVersion,
    reference: {...reference},
    eligibility: {...eligibility, requiredLevel},
    acquisition: {...acquisition, perAttemptSources},
    effortModel: {
      unit: effort.unit,
      normalSecondRebirth,
      evolutionRepeatable,
      firstUnlock: {licenseQuest, excludedFromRepeatableRatio: true},
      repeatableTargetRatio: {min: ratioMin, max: ratioMax},
    },
    terminalPath: {...terminal},
    qualityProjection: {...quality},
    powerBudget: {...power, intrinsicUpliftInternalPower},
    preserve,
    clear,
    compatibility: {...compatibility},
  });
}

function loadPetEvolutionBalance({filePath = DEFAULT_BALANCE_PATH, rebirthBalance = loadPetRebirthBalance()} = {}) {
  let document;
  try {
    document = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new PetEvolutionBalanceError([`cannot load balance document: ${error.message}`]);
  }
  return createPetEvolutionBalance(document, {rebirthBalance});
}

function petEvolutionEffortSummary(balance) {
  const normal = balance.effortModel.normalSecondRebirth.total;
  const repeatable = balance.effortModel.evolutionRepeatable.total;
  const unlock = balance.effortModel.firstUnlock.licenseQuest;
  return Object.freeze({
    unit: balance.effortModel.unit,
    normalSecondRebirth: normal,
    evolutionRepeatable: repeatable,
    firstEvolution: repeatable + unlock,
    repeatableRatio: repeatable / normal,
    firstEvolutionRatio: (repeatable + unlock) / normal,
  });
}

module.exports = {
  DEFAULT_BALANCE_PATH,
  PetEvolutionBalanceError,
  createPetEvolutionBalance,
  loadPetEvolutionBalance,
  petEvolutionEffortSummary,
};
