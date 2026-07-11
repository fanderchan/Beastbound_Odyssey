"use strict";

const fs = require("node:fs");
const path = require("node:path");

function loadPlayerLevelRuntime(options = {}) {
  const dataDir = path.resolve(
    options.dataDir || path.resolve(__dirname, "../../../..", "client/godot/data"),
  );
  const filePath = path.join(dataDir, "balance", "level_curves.json");
  const document = readJson(filePath);
  const activeCurveId = requiredIdentifier(document.activeCurveId, `${filePath} activeCurveId`);
  const curve = arrayOfObjects(document.curves).find((entry) => String(entry.id || "") === activeCurveId);
  if (!curve) {
    throw new Error(`active player level curve does not exist: ${activeCurveId}`);
  }
  validateCurve(curve);
  const maxPlayerLevel = positiveInteger(document.maxPlayerLevel, 0);
  if (maxPlayerLevel < 1) {
    throw new Error("maxPlayerLevel must be a positive integer");
  }
  const frozenCurve = deepFreeze(clone(curve));

  function expToNextLevel(levelValue) {
    const level = Math.max(1, Math.trunc(Number(levelValue || 1)));
    const base = (frozenCurve.baseConstant + level * frozenCurve.linearPerLevel)
      * Math.pow(frozenCurve.expGrowthRate, level - 1);
    const highLevelShape = Math.pow(level, frozenCurve.powerExponent) * frozenCurve.powerMultiplier;
    return Math.max(1, Math.round(base + highLevelShape));
  }

  function awardEntry(entryValue, amountValue, maxLevelValue = maxPlayerLevel) {
    const entry = objectOrEmpty(entryValue);
    const maxLevel = clampInteger(maxLevelValue, 1, maxPlayerLevel, maxPlayerLevel);
    let level = clampInteger(entry.level, 1, maxLevel, 1);
    const startLevel = level;
    let exp = nonNegativeInteger(entry.exp, 0) + nonNegativeInteger(amountValue, 0);
    let nextExp = expToNextLevel(level);
    while (level < maxLevel && exp >= nextExp) {
      exp -= nextExp;
      level += 1;
      nextExp = expToNextLevel(level);
    }
    let overflowExp = 0;
    if (level >= maxLevel && exp > 0) {
      overflowExp = exp;
      exp = 0;
    }
    return {
      level,
      exp,
      nextExp,
      levelsGained: Math.max(0, level - startLevel),
      overflowExp,
    };
  }

  return Object.freeze({
    dataDir,
    curve: frozenCurve,
    curveId: activeCurveId,
    maxPlayerLevel,
    expToNextLevel,
    awardEntry,
  });
}

function validateCurve(curve) {
  requiredIdentifier(curve.id, "player level curve id");
  if (curve.formula !== "v1_exponential_power") {
    throw new Error(`unsupported player level formula: ${String(curve.formula || "")}`);
  }
  for (const key of ["baseConstant", "linearPerLevel", "expGrowthRate", "powerExponent", "powerMultiplier"]) {
    if (typeof curve[key] !== "number" || !Number.isFinite(curve[key])) {
      throw new Error(`invalid player level curve number: ${key}`);
    }
  }
  if (curve.baseConstant < 0 || curve.linearPerLevel < 0 || curve.expGrowthRate <= 0 || curve.powerExponent < 0 || curve.powerMultiplier < 0) {
    throw new Error(`player level curve contains unsafe values: ${curve.id}`);
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

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function nonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : fallback;
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

module.exports = {loadPlayerLevelRuntime};
