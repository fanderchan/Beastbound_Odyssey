"use strict";

const CONFUSION_STATUS_ID = "confusion";
const STONE_STATUS_ID = "stone";
const CONFUSION_TARGET_PURPOSE = "confusion_target.v1";

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function actorHasStatus(actorValue, statusId) {
  const statuses = record(record(actorValue).statuses);
  const status = record(statuses[String(statusId || "")]);
  return Number(status.turns || 0) > 0;
}

function livingSameSideCandidates(actorsValue, actorValue) {
  const actor = record(actorValue);
  const actorId = String(actor.actorId || "");
  const side = String(actor.side || "");
  const candidates = (Array.isArray(actorsValue) ? actorsValue : []).filter((entry) => (
    entry &&
    String(entry.side || "") === side &&
    Number(entry.hp || 0) > 0 &&
    !Boolean(entry.escaped) &&
    !Boolean(entry.captured)
  ));
  if (candidates.length > 1) {
    return candidates.filter((entry) => String(entry.actorId || "") !== actorId);
  }
  return candidates;
}

function resolveConfusionTarget({
  randomAuthority,
  roomId,
  turnSeq,
  round,
  sequence,
  actionId,
  actor,
  declaredTargetActorId,
  actors,
} = {}) {
  const declared = String(declaredTargetActorId || "");
  if (!actorHasStatus(actor, CONFUSION_STATUS_ID)) {
    return {triggered: false, declaredTargetActorId: declared, targetActorId: declared};
  }
  if (!randomAuthority || typeof randomAuthority.index !== "function") {
    throw new TypeError("confusion target resolution requires private random authority");
  }
  const candidates = livingSameSideCandidates(actors, actor);
  if (candidates.length <= 0) {
    return {triggered: false, declaredTargetActorId: declared, targetActorId: declared};
  }
  const index = randomAuthority.index(String(roomId || ""), {
    purpose: CONFUSION_TARGET_PURPOSE,
    turnSeq: Math.trunc(Number(turnSeq || 0)),
    round: Math.trunc(Number(round || 0)),
    sequence: Math.trunc(Number(sequence || 0)),
    actorId: String(record(actor).actorId || ""),
    targetId: declared,
    actionId: String(actionId || ""),
  }, candidates.length);
  return {
    triggered: true,
    declaredTargetActorId: declared,
    targetActorId: String(candidates[index] && candidates[index].actorId || ""),
  };
}

function stoneDefenseExtraReduction(targetValue, defenseFactorValue) {
  const target = record(targetValue);
  if (!actorHasStatus(target, STONE_STATUS_ID)) {
    return 0;
  }
  const defense = Math.max(0, Math.trunc(Number(target.defense || 0)));
  const factor = Math.max(0, Number(defenseFactorValue || 0));
  if (!Number.isFinite(factor) || defense <= 0 || factor <= 0) {
    return 0;
  }
  return Math.max(0, Math.round(defense * 2 * factor) - Math.round(defense * factor));
}

function applyStoneDefenseReduction(damageBeforeValue, extraReductionValue) {
  const damageBefore = Math.max(1, Math.trunc(Number(damageBeforeValue || 1)));
  const theoreticalReduction = Math.max(0, Math.trunc(Number(extraReductionValue || 0)));
  const damage = Math.max(1, damageBefore - theoreticalReduction);
  return {
    damage,
    extraReduction: damageBefore - damage,
  };
}

module.exports = {
  CONFUSION_STATUS_ID,
  CONFUSION_TARGET_PURPOSE,
  STONE_STATUS_ID,
  actorHasStatus,
  applyStoneDefenseReduction,
  livingSameSideCandidates,
  resolveConfusionTarget,
  stoneDefenseExtraReduction,
};
