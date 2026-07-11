"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_FORMULA_PATH = path.resolve(__dirname, "../../../..", "client/godot/data/balance/combat_formulas.json");

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number(fallback || 0);
}

function positiveInteger(value, fallback = 1) {
  return Math.max(1, Math.trunc(finiteNumber(value, fallback)));
}

function actorHasStatus(actorValue, statusId) {
  const status = record(record(record(actorValue).statuses)[String(statusId || "")]);
  return finiteNumber(status.turns, 0) > 0;
}

function buildBattleCombatFormula(documentValue) {
  const document = record(documentValue);
  if (Math.trunc(finiteNumber(document.schemaVersion, 0)) < 1) {
    throw new Error("combat formula schemaVersion must be at least 1");
  }
  const formulas = Array.isArray(document.formulas) ? document.formulas : [];
  const activeId = String(document.activeFormulaId || "").trim();
  const formula = formulas.find((entry) => String(record(entry).id || "") === activeId);
  if (!formula) {
    throw new Error(`active combat formula is missing: ${activeId || "<empty>"}`);
  }
  const physical = record(formula.physicalDamage);
  for (const key of [
    "flatPower",
    "powerMultiplier",
    "defaultDefenseFactor",
    "petSkillDefenseFactor",
    "levelDifferenceMultiplierPerLevel",
    "levelMultiplierMin",
    "levelMultiplierMax",
    "guardMultiplier",
  ]) {
    if (!Number.isFinite(Number(physical[key]))) {
      throw new Error(`combat formula ${activeId} has invalid physicalDamage.${key}`);
    }
  }
  if (typeof physical.roundDefenseBeforeSubtract !== "boolean") {
    throw new Error(`combat formula ${activeId} has invalid physicalDamage.roundDefenseBeforeSubtract`);
  }
  if (!["floor", "round"].includes(String(physical.guardRounding || ""))) {
    throw new Error(`combat formula ${activeId} has invalid physicalDamage.guardRounding`);
  }
  const combo = record(formula.combo);
  for (const key of ["bonusPerExtraParticipant", "flatBonusPerExtraParticipant"]) {
    if (!Number.isFinite(Number(combo[key]))) {
      throw new Error(`combat formula ${activeId} has invalid combo.${key}`);
    }
  }
  const multiTarget = record(formula.multiTarget);
  if (typeof multiTarget.applyPowerMultiplierAfterDefense !== "boolean") {
    throw new Error(`combat formula ${activeId} has invalid multiTarget.applyPowerMultiplierAfterDefense`);
  }
  return Object.freeze({
    ...formula,
    id: activeId,
    physicalDamage: Object.freeze({...physical}),
    combo: Object.freeze({...combo}),
    multiTarget: Object.freeze({...multiTarget}),
  });
}

function loadBattleCombatFormula(filePath = DEFAULT_FORMULA_PATH) {
  let document;
  try {
    document = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const loadError = new Error(`failed to load authoritative combat formula: ${filePath}`);
    loadError.cause = error;
    throw loadError;
  }
  return buildBattleCombatFormula(document);
}

function levelMultiplier(physical, actorValue, targetValue) {
  const actor = record(actorValue);
  const target = record(targetValue);
  const perLevel = finiteNumber(physical.levelDifferenceMultiplierPerLevel, 0);
  const min = finiteNumber(physical.levelMultiplierMin, 1);
  const max = finiteNumber(physical.levelMultiplierMax, 1);
  const value = 1 + (positiveInteger(actor.level, 1) - positiveInteger(target.level, 1)) * perLevel;
  return Math.max(min, Math.min(max, value));
}

function calculateDamage({formula, actor, target, eventType, amountBonus, actionPowerMultiplier, stoneMultiplier}) {
  const physical = record(formula.physicalDamage);
  const multi = record(formula.multiTarget);
  const normalizedEventType = String(eventType || "attack");
  const rawActorAttack = positiveInteger(record(actor).attack, 1);
  const skillBonus = normalizedEventType === "pet_skill" ? Math.trunc(finiteNumber(amountBonus, 0)) : 0;
  const rawAttack = rawActorAttack + skillBonus + Math.trunc(finiteNumber(physical.flatPower, 0));
  let powerMultiplier = Math.max(0, finiteNumber(physical.powerMultiplier, 1));
  let postDefenseMultiplier = 1;
  if (normalizedEventType === "multi_attack") {
    const multiPower = Math.max(0, finiteNumber(actionPowerMultiplier, 1));
    if (Boolean(multi.applyPowerMultiplierAfterDefense)) {
      postDefenseMultiplier = multiPower;
    } else {
      powerMultiplier *= multiPower;
    }
  }
  const defenseFactor = normalizedEventType === "pet_skill"
    ? Math.max(0, finiteNumber(physical.petSkillDefenseFactor, physical.defaultDefenseFactor))
    : Math.max(0, finiteNumber(physical.defaultDefenseFactor, 0.35));
  const targetDefense = Math.max(0, finiteNumber(record(target).defense, 0));
  const effectiveDefense = targetDefense * Math.max(1, finiteNumber(stoneMultiplier, 1));
  let defenseReduction = effectiveDefense * defenseFactor;
  if (Boolean(physical.roundDefenseBeforeSubtract)) {
    defenseReduction = Math.round(defenseReduction);
  }
  const power = rawAttack * powerMultiplier;
  let reduced = (power - defenseReduction) * levelMultiplier(physical, actor, target);
  const damageBeforeGuard = Math.max(1, Math.round(reduced * postDefenseMultiplier));
  let guardMultiplier = 1;
  if (Boolean(record(target).guarding)) {
    guardMultiplier = Math.max(0, finiteNumber(physical.guardMultiplier, 0.45));
    reduced *= guardMultiplier;
    if (String(physical.guardRounding || "") === "floor") {
      reduced = Math.floor(reduced);
    }
  }
  reduced *= postDefenseMultiplier;
  return {
    damage: Math.max(1, Math.round(reduced)),
    rawAttack,
    actorAttack: rawActorAttack,
    amountBonus: skillBonus,
    targetDefense,
    effectiveDefense,
    defenseFactor,
    defenseReduction,
    powerMultiplier,
    postDefenseMultiplier,
    guardMultiplier,
    damageBeforeGuard,
  };
}

function resolvePhysicalDamage(options = {}) {
  const formula = options.formula;
  if (!formula || String(formula.id || "") === "") {
    throw new TypeError("authoritative combat formula is required");
  }
  const stoneApplied = actorHasStatus(options.target, "stone");
  const result = calculateDamage({...options, stoneMultiplier: stoneApplied ? 2 : 1});
  const normalResult = stoneApplied
    ? calculateDamage({...options, stoneMultiplier: 1})
    : result;
  return {
    ...result,
    formulaId: String(formula.id),
    eventType: String(options.eventType || "attack"),
    stoneDefenseApplied: stoneApplied,
    stoneDefenseMultiplier: stoneApplied ? 2 : 1,
    stoneDefenseExtraReduction: Math.max(0, normalResult.damage - result.damage),
    minimumDamage: 1,
  };
}

function comboDamageFor(formulaValue, participantDamageValues) {
  const formula = record(formulaValue);
  const combo = record(formula.combo);
  const values = (Array.isArray(participantDamageValues) ? participantDamageValues : [])
    .map((value) => Math.max(1, Math.trunc(finiteNumber(value, 1))));
  const participantCount = values.length;
  const baseDamage = values.reduce((sum, value) => sum + value, 0);
  const extraParticipants = Math.max(0, participantCount - 1);
  const percentBonus = Math.max(0, finiteNumber(combo.bonusPerExtraParticipant, 0));
  const flatBonusPerExtra = Math.trunc(finiteNumber(combo.flatBonusPerExtraParticipant, 0));
  const scaledDamage = Math.max(1, Math.round(baseDamage * (1 + percentBonus * extraParticipants)));
  const comboBonus = Math.max(0, scaledDamage - baseDamage)
    + Math.max(0, flatBonusPerExtra * extraParticipants);
  return {
    damage: Math.max(1, baseDamage + comboBonus),
    baseDamage,
    comboBonus,
    participantCount,
    formulaId: String(formula.id || ""),
  };
}

module.exports = {
  DEFAULT_FORMULA_PATH,
  actorHasStatus,
  buildBattleCombatFormula,
  comboDamageFor,
  loadBattleCombatFormula,
  resolvePhysicalDamage,
};
