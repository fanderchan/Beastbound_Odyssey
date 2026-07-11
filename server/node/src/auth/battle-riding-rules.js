"use strict";

const RIDE_DAMAGE_RATIO = 0.5;
const RIDE_STATE_RIDING = "riding";
const RIDE_STATE_REST = "rest";

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function positiveInt(value, fallback = 1) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : Math.max(1, Math.trunc(Number(fallback || 1)));
}

function nonNegativeInt(value, fallback = 0) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : Math.max(0, Math.trunc(Number(fallback || 0)));
}

function clampInt(value, min, max, fallback = min) {
  const number = Math.trunc(Number(value));
  const safe = Number.isFinite(number) ? number : fallback;
  return Math.max(min, Math.min(max, safe));
}

function activeRideFacts(actorValue) {
  const actor = record(actorValue);
  const ridePetInstanceId = String(actor.ridePetInstanceId || "").trim();
  const ridePetMaxHp = nonNegativeInt(actor.ridePetMaxHp);
  const ridePetHp = clampInt(actor.ridePetHp, 0, ridePetMaxHp, ridePetMaxHp);
  const ridePetBattleState = String(actor.ridePetBattleState || RIDE_STATE_RIDING);
  const active = (
    ridePetInstanceId !== "" &&
    ridePetMaxHp > 0 &&
    ridePetHp > 0 &&
    ridePetBattleState === RIDE_STATE_RIDING &&
    !Boolean(actor.ridePetKnocked)
  );
  return {
    active,
    ridePetInstanceId,
    ridePetHp,
    ridePetMaxHp,
    ridePetBattleState,
  };
}

function resolveRideDamageShare(actorValue, damageValue) {
  const ride = activeRideFacts(actorValue);
  const damage = nonNegativeInt(damageValue);
  if (!ride.active || damage <= 0) {
    const ridePetKnocked = Boolean(
      ride.ridePetInstanceId &&
      ride.ridePetMaxHp > 0 &&
      (ride.ridePetHp <= 0 || Boolean(record(actorValue).ridePetKnocked))
    );
    return {
      damage,
      actorDamage: damage,
      rideDamage: 0,
      rideHpBefore: ride.ridePetHp,
      rideHpAfter: ride.ridePetHp,
      ridePetInstanceId: ride.ridePetInstanceId,
      ridePetKnocked,
      rideActiveBefore: ride.active,
      rideActiveAfter: ride.active,
      ridePetBattleStateAfter: ridePetKnocked ? RIDE_STATE_REST : ride.ridePetBattleState,
    };
  }
  // The established Beastbound rule gives the odd point to the mount.
  const desiredRideDamage = Math.ceil(damage * RIDE_DAMAGE_RATIO);
  const rideDamage = Math.min(ride.ridePetHp, desiredRideDamage);
  const actorDamage = damage - rideDamage;
  const rideHpAfter = ride.ridePetHp - rideDamage;
  const ridePetKnocked = rideHpAfter <= 0;
  return {
    damage,
    actorDamage,
    rideDamage,
    rideHpBefore: ride.ridePetHp,
    rideHpAfter,
    ridePetInstanceId: ride.ridePetInstanceId,
    ridePetKnocked,
    rideActiveBefore: true,
    rideActiveAfter: !ridePetKnocked,
    ridePetBattleStateAfter: ridePetKnocked ? RIDE_STATE_REST : RIDE_STATE_RIDING,
  };
}

function resolveRidingBattleStats(baseStatsValue, rideStatsValue, attackStyleValue = "melee") {
  const baseStats = record(baseStatsValue);
  const rideStats = record(rideStatsValue);
  const baseAttack = positiveInt(baseStats.attack);
  const baseDefense = positiveInt(baseStats.defense);
  const baseQuick = positiveInt(baseStats.quick ?? baseStats.speed);
  const rideAttack = positiveInt(rideStats.attack);
  const rideDefense = positiveInt(rideStats.defense);
  const rideQuick = positiveInt(rideStats.quick ?? rideStats.speed ?? rideStats.agility);
  const attackStyle = String(attackStyleValue || "melee") === "ranged" ? "ranged" : "melee";
  const attack = attackStyle === "ranged"
    ? Math.round(baseAttack + rideAttack * 0.4)
    : Math.round(baseAttack * 0.8 + rideAttack * 0.8);
  const quick = attackStyle === "ranged"
    ? Math.round(baseQuick * 0.8 + rideQuick * 0.2)
    : Math.round(baseQuick * 0.2 + rideQuick * 0.8);
  const defense = Math.round(baseDefense * 0.7 + rideDefense * 0.7);
  return {
    attack: Math.max(1, attack),
    defense: Math.max(1, defense),
    quick: Math.max(1, quick),
    speed: Math.max(1, quick),
    baseAttack,
    baseDefense,
    baseQuick,
    attackStyle,
    formulaId: "stoneage_like_ride_v1",
  };
}

module.exports = {
  RIDE_DAMAGE_RATIO,
  RIDE_STATE_REST,
  RIDE_STATE_RIDING,
  activeRideFacts,
  resolveRideDamageShare,
  resolveRidingBattleStats,
};
