"use strict";

const PLAYER_STAT_ALLOCATE_BATCH_ACTION_ID = "player_stat_allocate_batch";
const PLAYER_STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);
const PLAYER_STAT_LABELS = Object.freeze({
  maxHp: "生命",
  attack: "攻击",
  defense: "防御",
  quick: "敏捷",
});

function applyPlayerStatAllocationBatch(profile, params = {}, options = {}) {
  const allocationsResult = normalizeAllocations(params && params.allocations);
  if (!allocationsResult.ok) {
    return allocationsResult;
  }

  const player = object(profile && profile.player);
  const availablePoints = nonNegativeInteger(player.statPoints);
  const allocations = allocationsResult.allocations;
  const totalPoints = allocationsResult.totalPoints;
  if (totalPoints > availablePoints) {
    return {
      ok: false,
      code: "player_stat_points_insufficient",
      message: `可分配属性点不足（需要${totalPoints}点，当前${availablePoints}点）。`,
    };
  }

  const pointGainFor = typeof options.pointGainFor === "function"
    ? options.pointGainFor
    : () => 1;
  const baseStatsFromPlayer = typeof options.baseStatsFromPlayer === "function"
    ? options.baseStatsFromPlayer
    : defaultBaseStatsFromPlayer;
  const baseStats = {...baseStatsFromPlayer(player)};
  const gains = {};
  for (const statKey of PLAYER_STAT_KEYS) {
    const allocatedPoints = allocations[statKey];
    const gainPerPoint = positiveInteger(pointGainFor(statKey), 1);
    const totalGain = allocatedPoints * gainPerPoint;
    gains[statKey] = totalGain;
    baseStats[statKey] = positiveInteger(baseStats[statKey], 1) + totalGain;
  }

  const nextPlayer = {
    ...player,
    baseStats,
    statPoints: availablePoints - totalPoints,
  };
  if (gains.maxHp > 0) {
    const defaultMaxHp = positiveInteger(options.defaultMaxHp, 1);
    nextPlayer.hp = Math.max(1, Math.trunc(Number(player.hp || defaultMaxHp)) + gains.maxHp);
    nextPlayer.maxHp = Math.max(
      baseStats.maxHp,
      Math.trunc(Number(player.maxHp || defaultMaxHp)) + gains.maxHp,
    );
  }
  profile.player = nextPlayer;

  const gainLabels = PLAYER_STAT_KEYS
    .filter((statKey) => allocations[statKey] > 0)
    .map((statKey) => `${PLAYER_STAT_LABELS[statKey]} +${gains[statKey]}`);
  return {
    ok: true,
    message: `属性加点已确认：${gainLabels.join("，")}。剩余${nextPlayer.statPoints}点。`,
    allocations,
    gains,
    count: totalPoints,
    amount: totalPoints,
    changedCount: totalPoints,
    remainingPoints: nextPlayer.statPoints,
  };
}

function normalizeAllocations(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {ok: false, code: "player_stat_allocations_invalid", message: "属性加点方案不正确。"};
  }
  const unknownKeys = Object.keys(value).filter((key) => !PLAYER_STAT_KEYS.includes(key));
  if (unknownKeys.length > 0) {
    return {ok: false, code: "player_stat_invalid", message: "加点方案包含不能分配的属性。"};
  }
  const allocations = {};
  let totalPoints = 0;
  for (const statKey of PLAYER_STAT_KEYS) {
    const amount = Object.prototype.hasOwnProperty.call(value, statKey) ? value[statKey] : 0;
    if (!Number.isInteger(amount) || amount < 0) {
      return {ok: false, code: "player_stat_allocation_invalid", message: "每项属性点必须是非负整数。"};
    }
    allocations[statKey] = amount;
    totalPoints += amount;
  }
  if (totalPoints < 1) {
    return {ok: false, code: "player_stat_allocation_empty", message: "请至少分配1点属性。"};
  }
  return {ok: true, allocations, totalPoints};
}

function defaultBaseStatsFromPlayer(player) {
  const source = object(player && player.baseStats);
  return Object.fromEntries(PLAYER_STAT_KEYS.map((key) => [key, positiveInteger(source[key], 1)]));
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  const integer = Math.trunc(number);
  return Number.isFinite(number) && integer > 0 ? integer : fallback;
}

module.exports = {
  PLAYER_STAT_ALLOCATE_BATCH_ACTION_ID,
  PLAYER_STAT_KEYS,
  applyPlayerStatAllocationBatch,
  normalizeAllocations,
};
