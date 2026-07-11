"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FULL_EXP_LEVEL_DELTA = 5;
const EXP_DECAY_LEVEL_RANGE = 15;

function loadBattleExpCatalog(options = {}) {
  const dataDir = path.resolve(
    options.dataDir || path.resolve(__dirname, "../../../..", "client/godot/data"),
  );
  const filePath = path.join(dataDir, "balance", "reward_economy.json");
  const document = readJson(filePath);
  const battleExp = objectOrEmpty(document.battleExp);
  const activeFormulaId = requiredIdentifier(battleExp.activeFormulaId, `${filePath} activeFormulaId`);
  const formulas = arrayOfObjects(battleExp.formulas);
  const formula = formulas.find((entry) => String(entry.id || "") === activeFormulaId);
  if (!formula) {
    throw new Error(`battle EXP active formula does not exist: ${activeFormulaId}`);
  }
  validateFormula(formula, filePath);
  const frozenFormula = deepFreeze(clone(formula));
  const groupMultipliers = frozenFormula.groupMultipliers;

  function rewardForActor(actorValue, rewardGroupId = "", fallback = 0) {
    const actor = objectOrEmpty(actorValue);
    const maxHp = positiveInteger(actor.maxHp, 1);
    const attack = nonNegativeInteger(actor.attack, 0);
    const defense = nonNegativeInteger(actor.defense, 0);
    const quick = nonNegativeInteger(actor.quick ?? actor.agility, 0);
    let base = maxHp / frozenFormula.maxHpDivisor;
    base += attack * frozenFormula.attackWeight;
    base += defense * frozenFormula.defenseWeight;
    base += quick / frozenFormula.quickDivisor;
    let scaled = Math.max(frozenFormula.minPerEnemy, base);
    scaled *= levelMultiplier(positiveInteger(actor.level, 1), frozenFormula);
    scaled *= groupMultiplier(rewardGroupId, frozenFormula);
    const result = Math.max(0, Math.round(scaled));
    return Number.isFinite(result) ? result : Math.max(0, Math.trunc(Number(fallback || 0)));
  }

  function hasExplicitGroupMultiplier(groupId) {
    const normalized = String(groupId || "").trim();
    return normalized !== "" && Object.hasOwn(groupMultipliers, normalized);
  }

  return Object.freeze({
    dataDir,
    formula: frozenFormula,
    formulaId: activeFormulaId,
    rewardForActor,
    hasExplicitGroupMultiplier,
    scaledForRecipientLevel,
  });
}

function scaledForRecipientLevel(baseReward, recipientLevel, enemyLevel) {
  const base = Math.max(1, Math.trunc(Number(baseReward || 1)));
  const levelDelta = Math.trunc(Number(recipientLevel || 1)) - positiveInteger(enemyLevel, 1);
  if (levelDelta <= FULL_EXP_LEVEL_DELTA) {
    return base;
  }
  const decayFactor = FULL_EXP_LEVEL_DELTA + EXP_DECAY_LEVEL_RANGE - levelDelta;
  if (decayFactor <= 0) {
    return 1;
  }
  return Math.max(1, Math.trunc(base * decayFactor / EXP_DECAY_LEVEL_RANGE));
}

function levelMultiplier(level, formula) {
  const scale = objectOrEmpty(formula.levelScale);
  if (!scale.enabled) {
    return 1;
  }
  const raw = Math.pow(Math.max(1, level) / scale.pivotLevel, scale.exponent);
  return clamp(raw, scale.minMultiplier, scale.maxMultiplier);
}

function groupMultiplier(groupId, formula) {
  const multipliers = objectOrEmpty(formula.groupMultipliers);
  const normalized = String(groupId || "").trim();
  if (normalized && Object.hasOwn(multipliers, normalized)) {
    return multipliers[normalized];
  }
  return Object.hasOwn(multipliers, "default_wild") ? multipliers.default_wild : 1;
}

function validateFormula(formula, filePath) {
  requiredIdentifier(formula.id, `${filePath} formula id`);
  for (const key of ["minPerEnemy", "maxHpDivisor", "attackWeight", "defenseWeight", "quickDivisor"]) {
    requireFiniteNumber(formula[key], `${formula.id}.${key}`);
  }
  if (formula.minPerEnemy < 0 || formula.maxHpDivisor <= 0 || formula.attackWeight < 0 || formula.defenseWeight < 0 || formula.quickDivisor <= 0) {
    throw new Error(`battle EXP formula has invalid base weights: ${formula.id}`);
  }
  const levelScale = objectOrEmpty(formula.levelScale);
  if (typeof levelScale.enabled !== "boolean") {
    throw new Error(`battle EXP formula has invalid levelScale.enabled: ${formula.id}`);
  }
  for (const key of ["pivotLevel", "exponent", "minMultiplier", "maxMultiplier"]) {
    requireFiniteNumber(levelScale[key], `${formula.id}.levelScale.${key}`);
  }
  if (levelScale.pivotLevel <= 0 || levelScale.exponent < 0 || levelScale.minMultiplier < 0 || levelScale.maxMultiplier < levelScale.minMultiplier) {
    throw new Error(`battle EXP formula has invalid level scaling: ${formula.id}`);
  }
  const multipliers = objectOrEmpty(formula.groupMultipliers);
  if (!Object.hasOwn(multipliers, "default_wild")) {
    throw new Error(`battle EXP formula is missing default_wild multiplier: ${formula.id}`);
  }
  for (const [groupId, multiplier] of Object.entries(multipliers)) {
    requiredIdentifier(groupId, `${formula.id} group multiplier id`);
    requireFiniteNumber(multiplier, `${formula.id}.groupMultipliers.${groupId}`);
    if (multiplier < 0) {
      throw new Error(`battle EXP group multiplier cannot be negative: ${groupId}`);
    }
  }
}

function readJson(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`JSON document must be an object: ${filePath}`);
  }
  return parsed;
}

function requiredIdentifier(value, label) {
  const normalized = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(normalized)) {
    throw new Error(`invalid identifier for ${label}`);
  }
  return normalized;
}

function requireFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`invalid number for ${label}`);
  }
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}

function nonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayOfObjects(value) {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)) : [];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

module.exports = {
  loadBattleExpCatalog,
  scaledForRecipientLevel,
};
