"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPOSITORY_ROOT = path.resolve(__dirname, "../../../..");
const DEFAULT_CATALOG_PATH = path.join(REPOSITORY_ROOT, "client/godot/data/battle_passive_skills.json");
const SCHEMA_VERSION = 1;
const ELEMENT_IDS = Object.freeze(["fire", "water", "earth", "wind"]);
const STATUS_IDS = Object.freeze(["poison", "sleep", "confusion", "stone"]);
const ALLOWED_EFFECT_KEYS = new Set([
  "type",
  "scalePerPoint",
  "immuneAtOrAbove",
  "mapping",
  "statusImmune",
  "statusResist",
]);

class BattlePassiveCatalogError extends Error {
  constructor(errors) {
    const normalized = (Array.isArray(errors) ? errors : [errors]).map(String).filter(Boolean);
    super(`battle passive catalog invalid: ${normalized.join("; ")}`);
    this.name = "BattlePassiveCatalogError";
    this.code = "battle_passive_catalog_invalid";
    this.errors = normalized;
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function strictId(value) {
  return typeof value === "string" && value !== "" && value === value.trim() ? value : "";
}

function rate(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function validateStatusList(value, fieldPath, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${fieldPath} must be an array`);
    return;
  }
  const seen = new Set();
  for (const statusId of value) {
    if (!STATUS_IDS.includes(statusId)) {
      errors.push(`${fieldPath} contains unsupported status ${String(statusId || "")}`);
    } else if (seen.has(statusId)) {
      errors.push(`${fieldPath} contains duplicate status ${statusId}`);
    } else {
      seen.add(statusId);
    }
  }
}

function validateStatusResist(value, fieldPath, errors) {
  if (!isRecord(value)) {
    errors.push(`${fieldPath} must be an object`);
    return;
  }
  for (const [statusId, resist] of Object.entries(value)) {
    if (statusId !== "all" && !STATUS_IDS.includes(statusId)) {
      errors.push(`${fieldPath} contains unsupported status ${statusId}`);
    }
    if (typeof resist !== "number" || !Number.isFinite(resist) || resist < 0 || resist > 1) {
      errors.push(`${fieldPath}.${statusId} must be between 0 and 1`);
    }
  }
}

function validateElementScaledEffect(effect, fieldPath, errors) {
  if (typeof effect.scalePerPoint !== "number" || !Number.isFinite(effect.scalePerPoint) || effect.scalePerPoint < 0 || effect.scalePerPoint > 1) {
    errors.push(`${fieldPath}.scalePerPoint must be between 0 and 1`);
  }
  if (
    Object.prototype.hasOwnProperty.call(effect, "immuneAtOrAbove")
    && (
      typeof effect.immuneAtOrAbove !== "number"
      || !Number.isFinite(effect.immuneAtOrAbove)
      || effect.immuneAtOrAbove < 0
      || effect.immuneAtOrAbove > 1
    )
  ) {
    errors.push(`${fieldPath}.immuneAtOrAbove must be between 0 and 1`);
  }
  if (!isRecord(effect.mapping) || Object.keys(effect.mapping).length === 0) {
    errors.push(`${fieldPath}.mapping must be a non-empty object`);
    return;
  }
  for (const [elementId, statusId] of Object.entries(effect.mapping)) {
    if (!ELEMENT_IDS.includes(elementId)) {
      errors.push(`${fieldPath}.mapping contains unsupported element ${elementId}`);
    }
    if (!STATUS_IDS.includes(statusId)) {
      errors.push(`${fieldPath}.mapping.${elementId} contains unsupported status ${String(statusId || "")}`);
    }
  }
}

function validatePassive(passive, index, ids, errors) {
  const fieldPath = `passives[${index}]`;
  if (!isRecord(passive)) {
    errors.push(`${fieldPath} must be an object`);
    return;
  }
  const passiveId = strictId(passive.id);
  if (passiveId === "") {
    errors.push(`${fieldPath}.id must be a stable non-empty id`);
  } else if (ids.has(passiveId)) {
    errors.push(`duplicate passive id ${passiveId}`);
  } else {
    ids.add(passiveId);
  }
  if (typeof passive.label !== "string" || passive.label.trim() === "") {
    errors.push(`${fieldPath}.label must be non-empty`);
  }
  if (typeof passive.description !== "string" || passive.description.trim() === "") {
    errors.push(`${fieldPath}.description must be non-empty`);
  }
  if (!isRecord(passive.effect)) {
    errors.push(`${fieldPath}.effect must be an object`);
    return;
  }
  for (const key of Object.keys(passive.effect)) {
    if (!ALLOWED_EFFECT_KEYS.has(key)) {
      errors.push(`${fieldPath}.effect.${key} is unsupported`);
    }
  }
  const effectType = String(passive.effect.type || "");
  if (effectType !== "" && effectType !== "element_scaled_status_resist") {
    errors.push(`${fieldPath}.effect.type is unsupported`);
  }
  if (effectType === "element_scaled_status_resist") {
    validateElementScaledEffect(passive.effect, `${fieldPath}.effect`, errors);
  }
  if (Object.prototype.hasOwnProperty.call(passive.effect, "statusImmune")) {
    validateStatusList(passive.effect.statusImmune, `${fieldPath}.effect.statusImmune`, errors);
  }
  if (Object.prototype.hasOwnProperty.call(passive.effect, "statusResist")) {
    validateStatusResist(passive.effect.statusResist, `${fieldPath}.effect.statusResist`, errors);
  }
}

function applyEffect(actor, effect) {
  const nextActor = actor;
  const statusResist = isRecord(nextActor.statusResist) ? structuredClone(nextActor.statusResist) : {};
  const statusImmune = isRecord(nextActor.statusImmune) ? structuredClone(nextActor.statusImmune) : {};

  if (String(effect.type || "") === "element_scaled_status_resist") {
    const elements = isRecord(nextActor.elements) ? nextActor.elements : {};
    const immuneAtOrAbove = Object.prototype.hasOwnProperty.call(effect, "immuneAtOrAbove")
      ? rate(effect.immuneAtOrAbove, 2)
      : 2;
    for (const [elementId, statusId] of Object.entries(effect.mapping || {})) {
      const elementPoints = Math.max(0, Math.min(10, Number(elements[elementId] || 0)));
      const passiveValue = rate(elementPoints * Number(effect.scalePerPoint || 0));
      statusResist[statusId] = Math.max(rate(statusResist[statusId]), passiveValue);
      if (passiveValue >= immuneAtOrAbove) {
        statusImmune[statusId] = true;
      }
    }
  }

  for (const statusId of Array.isArray(effect.statusImmune) ? effect.statusImmune : []) {
    statusImmune[statusId] = true;
  }
  for (const [statusId, value] of Object.entries(isRecord(effect.statusResist) ? effect.statusResist : {})) {
    statusResist[statusId] = Math.max(rate(statusResist[statusId]), rate(value));
  }
  nextActor.statusResist = statusResist;
  nextActor.statusImmune = statusImmune;
}

function createBattlePassiveCatalog({document} = {}) {
  const errors = [];
  if (!isRecord(document)) {
    throw new BattlePassiveCatalogError(["document must be an object"]);
  }
  if (document.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (!Array.isArray(document.passives) || document.passives.length === 0) {
    errors.push("passives must be a non-empty array");
  }
  const ids = new Set();
  for (const [index, passive] of (Array.isArray(document.passives) ? document.passives : []).entries()) {
    validatePassive(passive, index, ids, errors);
  }
  if (errors.length > 0) {
    throw new BattlePassiveCatalogError(errors);
  }

  const passives = document.passives.map((passive) => deepFreeze(structuredClone(passive)));
  const byId = new Map(passives.map((passive) => [passive.id, passive]));
  return deepFreeze({
    schemaVersion: SCHEMA_VERSION,
    passiveCount: passives.length,
    passiveIds: passives.map((passive) => passive.id),
    passiveById(passiveId) {
      return byId.get(String(passiveId || "")) || null;
    },
    applyActorPassives(actor) {
      const nextActor = isRecord(actor) ? structuredClone(actor) : {};
      nextActor.statusResist = isRecord(nextActor.statusResist) ? structuredClone(nextActor.statusResist) : {};
      nextActor.statusImmune = isRecord(nextActor.statusImmune) ? structuredClone(nextActor.statusImmune) : {};
      const appliedPassiveIds = [];
      const unknownPassiveIds = [];
      for (const passiveId of [...new Set(Array.isArray(nextActor.passiveSkillIds) ? nextActor.passiveSkillIds.map(String) : [])]) {
        const passive = byId.get(passiveId);
        if (!passive) {
          unknownPassiveIds.push(passiveId);
          continue;
        }
        applyEffect(nextActor, passive.effect);
        appliedPassiveIds.push(passiveId);
      }
      return {
        actor: nextActor,
        appliedPassiveIds,
        unknownPassiveIds,
      };
    },
  });
}

function loadBattlePassiveCatalog({filePath = DEFAULT_CATALOG_PATH} = {}) {
  let document;
  try {
    document = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new BattlePassiveCatalogError([`failed to load ${filePath}: ${error.message}`]);
  }
  return createBattlePassiveCatalog({document});
}

module.exports = {
  BattlePassiveCatalogError,
  DEFAULT_CATALOG_PATH,
  createBattlePassiveCatalog,
  loadBattlePassiveCatalog,
};
