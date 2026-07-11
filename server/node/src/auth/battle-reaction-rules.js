"use strict";

const DODGE_DEX_DIVISOR = 0.02;
const DODGE_MIN_RATE = 0.0001;
const DODGE_MAX_RATE = 0.75;
const CRITICAL_DEX_DIVISOR = 0.09;
const COUNTER_DEX_DIVISOR = 0.08;
const COUNTER_DAMAGE_FACTOR = 0.75;
const BLOCKING_STATUS_IDS = Object.freeze(["stone", "sleep"]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clampRate(value, min = 0, max = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function numericField(object, key, fallbackKey = "", fallback = 0) {
  const raw = hasOwn(object, key)
    ? object[key]
    : (fallbackKey !== "" && hasOwn(object, fallbackKey) ? object[fallbackKey] : fallback);
  const number = Number(raw);
  return Number.isFinite(number) ? number : fallback;
}

function actorHasStatus(actor, statusId) {
  const statuses = isRecord(actor && actor.statuses) ? actor.statuses : {};
  const status = statuses[statusId];
  return isRecord(status) && Number(status.turns || 0) > 0;
}

function blockingStatusId(actor) {
  return BLOCKING_STATUS_IDS.find((statusId) => actorHasStatus(actor, statusId)) || "";
}

function quickContestRate(favoredValue, opposingValue, divisor, minRate, maxRate, bonus) {
  const favored = isRecord(favoredValue) ? favoredValue : {};
  const opposing = isRecord(opposingValue) ? opposingValue : {};
  const favoredQuick = Math.max(1, numericField(favored, "quick", "speed", 50));
  const opposingQuick = Math.max(1, numericField(opposing, "quick", "speed", 50));
  const big = Math.max(favoredQuick, opposingQuick);
  const small = Math.min(favoredQuick, opposingQuick);
  const ratio = favoredQuick >= opposingQuick ? 1 : small / big;
  const work = Math.max(0, (big - small) / Math.max(0.001, divisor));
  const chancePercent = Math.sqrt(work) * ratio + Number(bonus || 0);
  return clampRate(chancePercent / 100, minRate, maxRate);
}

function dodgeRateFor(attackerValue, targetValue) {
  const attacker = isRecord(attackerValue) ? attackerValue : {};
  const target = isRecord(targetValue) ? targetValue : {};
  if (hasOwn(target, "dodgeRateOverride")) {
    return clampRate(target.dodgeRateOverride);
  }
  if (hasOwn(target, "evasionRateOverride")) {
    return clampRate(target.evasionRateOverride);
  }
  return quickContestRate(
    target,
    attacker,
    DODGE_DEX_DIVISOR,
    DODGE_MIN_RATE,
    DODGE_MAX_RATE,
    numericField(target, "luck") + numericField(target, "dodgeBonus", "evasionBonus"),
  );
}

function criticalRateFor(attackerValue, targetValue) {
  const attacker = isRecord(attackerValue) ? attackerValue : {};
  const target = isRecord(targetValue) ? targetValue : {};
  if (hasOwn(attacker, "criticalRateOverride")) {
    return clampRate(attacker.criticalRateOverride);
  }
  return quickContestRate(
    attacker,
    target,
    CRITICAL_DEX_DIVISOR,
    0,
    1,
    numericField(attacker, "luck") + numericField(attacker, "criticalBonus"),
  );
}

function counterRateFor(counterActorValue, targetValue) {
  const counterActor = isRecord(counterActorValue) ? counterActorValue : {};
  const target = isRecord(targetValue) ? targetValue : {};
  if (hasOwn(counterActor, "counterRateOverride")) {
    return clampRate(counterActor.counterRateOverride);
  }
  return quickContestRate(
    counterActor,
    target,
    COUNTER_DEX_DIVISOR,
    0,
    1,
    numericField(counterActor, "luck") + numericField(counterActor, "counterBonus"),
  );
}

function luckyStrikeDamageFor(baseDamageValue, attackerValue, targetValue) {
  const baseDamage = Math.max(1, Math.trunc(Number(baseDamageValue || 1)));
  const attacker = isRecord(attackerValue) ? attackerValue : {};
  const target = isRecord(targetValue) ? targetValue : {};
  const attackerLevel = Math.max(1, Number(attacker.level || 1));
  const targetLevel = Math.max(1, Number(target.level || 1));
  const defenseBonus = Math.max(0, Number(target.defense || 0)) * attackerLevel / targetLevel * 0.5;
  return Math.max(baseDamage + 1, baseDamage + Math.round(defenseBonus));
}

function counterDamageFor(normalAttackDamageValue) {
  const normalAttackDamage = Math.max(1, Math.trunc(Number(normalAttackDamageValue || 1)));
  return Math.max(1, Math.round(normalAttackDamage * COUNTER_DAMAGE_FACTOR));
}

function reactionPolicyFor(eventTypeValue, effectValue = {}) {
  const eventType = String(eventTypeValue || "");
  const effect = isRecord(effectValue) ? effectValue : {};
  const defaults = {
    canDodge: ["attack", "basic_attack", "skill_attack", "pet_skill", "counter_attack", "multi_attack"].includes(eventType),
    canCritical: ["attack", "basic_attack", "skill_attack", "pet_skill", "counter_attack", "multi_attack"].includes(eventType),
    canCounter: ["attack", "basic_attack"].includes(eventType),
  };
  return {
    canDodge: hasOwn(effect, "canDodge") ? Boolean(effect.canDodge) : defaults.canDodge,
    canCritical: hasOwn(effect, "canCritical") ? Boolean(effect.canCritical) : defaults.canCritical,
    canCounter: hasOwn(effect, "canCounter") ? Boolean(effect.canCounter) : defaults.canCounter,
  };
}

function targetCanDodge(target) {
  return Boolean(target && !target.guarding && blockingStatusId(target) === "");
}

function counterCanTrigger({eventType, isCounter, canCounter, attacker, target, hpBefore, hpAfter} = {}) {
  return (
    ["attack", "basic_attack"].includes(String(eventType || ""))
    && !Boolean(isCounter)
    && canCounter !== false
    && Number(hpBefore || 0) > 0
    && Number(hpAfter || 0) > 0
    && Number(attacker && attacker.hp || 0) > 0
    && Number(target && target.hp || 0) > 0
    && blockingStatusId(target) === ""
  );
}

function rollSucceeds(rollValue, rateValue) {
  return clampRate(rollValue) < clampRate(rateValue);
}

module.exports = {
  blockingStatusId,
  counterCanTrigger,
  counterDamageFor,
  counterRateFor,
  criticalRateFor,
  dodgeRateFor,
  luckyStrikeDamageFor,
  reactionPolicyFor,
  rollSucceeds,
  targetCanDodge,
};
