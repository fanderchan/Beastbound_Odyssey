"use strict";

const fs = require("node:fs");
const {DEFAULT_FORMULA_PATH, resolvePhysicalDamage} = require("./battle-combat-formula");

const ELEMENT_IDS = Object.freeze(["earth", "water", "fire", "wind"]);
const ELEMENT_TOTAL_POINTS = 10;
const PLAYER_MAX_ACTIVE_ELEMENTS = 2;
const PLAYER_FORBIDDEN_ELEMENT_PAIRS = Object.freeze([
  Object.freeze(["earth", "fire"]),
  Object.freeze(["water", "wind"]),
]);
const BUILT_MATCHUPS = new WeakSet();

class BattleElementRulesError extends Error {
  constructor(code, message) {
    super(String(message || code || "battle element rules rejected input"));
    this.name = "BattleElementRulesError";
    this.code = String(code || "battle_element_invalid");
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function finitePositiveNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new BattleElementRulesError(
      "battle_element_matchup_invalid",
      `element matchup ${fieldName} must be a positive number`,
    );
  }
  return number;
}

function freezeElements(elements) {
  return Object.freeze(Object.fromEntries(ELEMENT_IDS.map((elementId) => [elementId, elements[elementId]])));
}

function inspectElementAllocation(value) {
  if (!isRecord(value)) {
    return {ok: false, reason: "missing"};
  }
  const unknownKeys = Object.keys(value).filter((key) => !ELEMENT_IDS.includes(key));
  if (unknownKeys.length > 0) {
    return {ok: false, reason: "unknown_keys", unknownKeys};
  }
  const elements = {};
  for (const elementId of ELEMENT_IDS) {
    if (!Object.prototype.hasOwnProperty.call(value, elementId)) {
      return {ok: false, reason: "missing_key", elementId};
    }
    const points = value[elementId];
    if (typeof points !== "number" || !Number.isInteger(points) || points < 0 || points > ELEMENT_TOTAL_POINTS) {
      return {ok: false, reason: "points_invalid", elementId};
    }
    elements[elementId] = points;
  }
  const totalPoints = ELEMENT_IDS.reduce((sum, elementId) => sum + elements[elementId], 0);
  if (totalPoints !== ELEMENT_TOTAL_POINTS) {
    return {ok: false, reason: "total_invalid", totalPoints};
  }
  const activeElementIds = ELEMENT_IDS.filter((elementId) => elements[elementId] > 0);
  return {
    ok: true,
    elements: freezeElements(elements),
    activeElementIds: Object.freeze(activeElementIds),
    totalPoints,
  };
}

function inspectPlayerElementAllocation(value) {
  const inspected = inspectElementAllocation(value);
  if (!inspected.ok) {
    return inspected;
  }
  if (inspected.activeElementIds.length > PLAYER_MAX_ACTIVE_ELEMENTS) {
    return {
      ok: false,
      reason: "too_many_active_elements",
      activeElementIds: inspected.activeElementIds,
    };
  }
  const forbiddenPair = PLAYER_FORBIDDEN_ELEMENT_PAIRS.find(([left, right]) => (
    inspected.elements[left] > 0 && inspected.elements[right] > 0
  ));
  if (forbiddenPair) {
    return {
      ok: false,
      reason: "forbidden_pair",
      forbiddenPair,
    };
  }
  return inspected;
}

function playerBattleElementAdmission(profileValue) {
  const profile = isRecord(profileValue) ? profileValue : {};
  const player = isRecord(profile.player) ? profile.player : {};
  if (!Object.prototype.hasOwnProperty.call(player, "elements")) {
    return {
      ok: false,
      code: "player_elements_required",
      message: "请先完成角色元素配点，再进入战斗。",
      schemaVersion: 1,
    };
  }
  const inspected = inspectPlayerElementAllocation(player.elements);
  if (!inspected.ok) {
    return {
      ok: false,
      code: "player_elements_invalid",
      message: "角色元素配点异常，请重新完成配点后再进入战斗。",
      reason: inspected.reason,
      schemaVersion: 1,
    };
  }
  return {
    ok: true,
    elements: {...inspected.elements},
    activeElementIds: Array.from(inspected.activeElementIds),
    totalPoints: inspected.totalPoints,
    schemaVersion: 1,
  };
}

function materializePlayerActorElements(actorValue, profileValue) {
  const admission = playerBattleElementAdmission(profileValue);
  if (!admission.ok) {
    return {...admission, actor: null};
  }
  const actor = isRecord(actorValue) ? structuredClone(actorValue) : {};
  actor.elements = {...admission.elements};
  return {
    ok: true,
    actor,
    elements: {...admission.elements},
    activeElementIds: admission.activeElementIds.slice(),
    totalPoints: admission.totalPoints,
    schemaVersion: 1,
  };
}

function buildBattleElementMatchup(documentValue) {
  if (isRecord(documentValue) && BUILT_MATCHUPS.has(documentValue)) {
    return documentValue;
  }
  const document = isRecord(documentValue) ? documentValue : {};
  const source = isRecord(document.elementMatchup) ? document.elementMatchup : document;
  const rawCycle = Array.isArray(source.cycle) ? source.cycle : [];
  if (rawCycle.length !== ELEMENT_IDS.length) {
    throw new BattleElementRulesError("battle_element_matchup_invalid", "element matchup cycle must cover four elements");
  }
  const seenPairs = new Set();
  const seenStrong = new Set();
  const seenWeak = new Set();
  const cycle = rawCycle.map((entryValue) => {
    const entry = isRecord(entryValue) ? entryValue : {};
    const strong = String(entry.strong || "").trim();
    const weak = String(entry.weak || "").trim();
    if (!ELEMENT_IDS.includes(strong) || !ELEMENT_IDS.includes(weak) || strong === weak) {
      throw new BattleElementRulesError("battle_element_matchup_invalid", "element matchup cycle contains an invalid pair");
    }
    const pairId = `${strong}>${weak}`;
    if (seenPairs.has(pairId) || seenStrong.has(strong) || seenWeak.has(weak)) {
      throw new BattleElementRulesError("battle_element_matchup_invalid", `element matchup repeats a cycle edge at ${pairId}`);
    }
    seenPairs.add(pairId);
    seenStrong.add(strong);
    seenWeak.add(weak);
    return Object.freeze({strong, weak});
  });
  const matchup = Object.freeze({
    cycle: Object.freeze(cycle),
    strongMultiplier: finitePositiveNumber(source.strongMultiplier, "strongMultiplier"),
    weakMultiplier: finitePositiveNumber(source.weakMultiplier, "weakMultiplier"),
    neutralMultiplier: finitePositiveNumber(source.neutralMultiplier, "neutralMultiplier"),
    schemaVersion: 1,
  });
  BUILT_MATCHUPS.add(matchup);
  return matchup;
}

function loadBattleElementMatchup(filePath = DEFAULT_FORMULA_PATH) {
  let document;
  try {
    document = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const loadError = new BattleElementRulesError(
      "battle_element_matchup_load_failed",
      `failed to load authoritative element matchup: ${filePath}`,
    );
    loadError.cause = error;
    throw loadError;
  }
  return buildBattleElementMatchup(document);
}

function requireElementAllocation(value, label) {
  const inspected = inspectElementAllocation(value);
  if (!inspected.ok) {
    throw new BattleElementRulesError(
      "battle_element_allocation_invalid",
      `${String(label || "actor")} element allocation is invalid: ${inspected.reason}`,
    );
  }
  return inspected;
}

function pairDisposition(matchup, attackerElementId, targetElementId) {
  if (attackerElementId === targetElementId) {
    return "neutral";
  }
  for (const pair of matchup.cycle) {
    if (pair.strong === attackerElementId && pair.weak === targetElementId) {
      return "strong";
    }
    if (pair.strong === targetElementId && pair.weak === attackerElementId) {
      return "weak";
    }
  }
  return "neutral";
}

function resolveBattleElementMatchup({matchup, attackerElements, targetElements} = {}) {
  const authoritativeMatchup = buildBattleElementMatchup(matchup);
  const attacker = requireElementAllocation(attackerElements, "attacker");
  const target = requireElementAllocation(targetElements, "target");
  let strongWeight = 0;
  let weakWeight = 0;
  let neutralWeight = 0;
  for (const attackerElementId of ELEMENT_IDS) {
    const attackerWeight = attacker.elements[attackerElementId] / ELEMENT_TOTAL_POINTS;
    if (attackerWeight <= 0) {
      continue;
    }
    for (const targetElementId of ELEMENT_IDS) {
      const targetWeight = target.elements[targetElementId] / ELEMENT_TOTAL_POINTS;
      if (targetWeight <= 0) {
        continue;
      }
      const weight = attackerWeight * targetWeight;
      const disposition = pairDisposition(authoritativeMatchup, attackerElementId, targetElementId);
      if (disposition === "strong") {
        strongWeight += weight;
      } else if (disposition === "weak") {
        weakWeight += weight;
      } else {
        neutralWeight += weight;
      }
    }
  }
  const multiplier = (
    strongWeight * authoritativeMatchup.strongMultiplier
    + weakWeight * authoritativeMatchup.weakMultiplier
    + neutralWeight * authoritativeMatchup.neutralMultiplier
  );
  return Object.freeze({
    multiplier,
    strongWeight,
    weakWeight,
    neutralWeight,
    attackerElements: attacker.elements,
    targetElements: target.elements,
    schemaVersion: 1,
  });
}

function applyBattleElementMatchup(damageResultValue, actorValue, targetValue, matchupValue) {
  const damageResult = isRecord(damageResultValue) ? damageResultValue : {};
  const damageBeforeElement = Math.max(1, Math.trunc(Number(damageResult.damage || 1)));
  const resolved = resolveBattleElementMatchup({
    matchup: matchupValue,
    attackerElements: isRecord(actorValue) ? actorValue.elements : null,
    targetElements: isRecord(targetValue) ? targetValue.elements : null,
  });
  const damage = Math.max(1, Math.round(damageBeforeElement * resolved.multiplier));
  return {
    ...damageResult,
    damage,
    damageBeforeElement,
    elementMultiplier: resolved.multiplier,
    elementDamageDelta: damage - damageBeforeElement,
    elementStrongWeight: resolved.strongWeight,
    elementWeakWeight: resolved.weakWeight,
    elementNeutralWeight: resolved.neutralWeight,
    attackerElements: {...resolved.attackerElements},
    targetElements: {...resolved.targetElements},
    elementMatchupSchemaVersion: resolved.schemaVersion,
  };
}

function resolveElementalPhysicalDamage(options = {}) {
  const matchup = options.elementMatchup;
  if (!matchup) {
    throw new BattleElementRulesError(
      "battle_element_matchup_missing",
      "authoritative element matchup is required",
    );
  }
  const baseResult = resolvePhysicalDamage(options);
  return applyBattleElementMatchup(baseResult, options.actor, options.target, matchup);
}

module.exports = {
  BattleElementRulesError,
  ELEMENT_IDS,
  ELEMENT_TOTAL_POINTS,
  PLAYER_FORBIDDEN_ELEMENT_PAIRS,
  PLAYER_MAX_ACTIVE_ELEMENTS,
  applyBattleElementMatchup,
  buildBattleElementMatchup,
  inspectElementAllocation,
  inspectPlayerElementAllocation,
  loadBattleElementMatchup,
  materializePlayerActorElements,
  playerBattleElementAdmission,
  resolveBattleElementMatchup,
  resolveElementalPhysicalDamage,
};
