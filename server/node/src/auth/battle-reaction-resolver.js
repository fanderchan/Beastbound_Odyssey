"use strict";

const {
  counterCanTrigger,
  counterRateFor,
  criticalRateFor,
  dodgeRateFor,
  luckyStrikeDamageFor,
  reactionPolicyFor,
  rollSucceeds,
  targetCanDodge,
} = require("./battle-reaction-rules");

function requiredAuthority(value) {
  if (!value || typeof value.roll !== "function") {
    throw new TypeError("battle reaction resolver requires a random authority");
  }
  return value;
}

function rollContext(value, purpose, actor, target) {
  const context = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    purpose,
    turnSeq: Math.trunc(Number(context.turnSeq || 0)),
    round: Math.trunc(Number(context.round || 0)),
    sequence: Math.trunc(Number(context.rollSequence ?? context.sequence ?? 0)),
    actorId: String(actor && actor.actorId || ""),
    targetId: String(target && target.actorId || ""),
    actionId: String(context.actionId || ""),
    ordinal: Math.trunc(Number(context.ordinal || 0)),
  };
}

function resolveDamageReaction(value = {}) {
  const authority = requiredAuthority(value.randomAuthority);
  const roomId = String(value.roomId || "").trim();
  if (roomId === "") {
    throw new TypeError("battle reaction room id is required");
  }
  const actor = value.actor && typeof value.actor === "object" ? value.actor : {};
  const target = value.target && typeof value.target === "object" ? value.target : {};
  const eventType = String(value.eventType || "");
  const policy = reactionPolicyFor(eventType, value.effect);
  let dodged = false;
  if (policy.canDodge && targetCanDodge(target)) {
    dodged = rollSucceeds(
      authority.roll(roomId, rollContext(value, "dodge.v1", actor, target)),
      dodgeRateFor(actor, target),
    );
  }

  let critical = false;
  if (!dodged && policy.canCritical) {
    critical = rollSucceeds(
      authority.roll(roomId, rollContext(value, "critical.v1", actor, target)),
      criticalRateFor(actor, target),
    );
  }

  const baseDamage = Math.max(1, Math.trunc(Number(value.baseDamage || 1)));
  return {
    dodged,
    critical,
    damage: dodged ? 0 : (critical ? luckyStrikeDamageFor(baseDamage, actor, target) : baseDamage),
  };
}

function resolveCounterTrigger(value = {}) {
  const authority = requiredAuthority(value.randomAuthority);
  const roomId = String(value.roomId || "").trim();
  if (roomId === "") {
    throw new TypeError("battle reaction room id is required");
  }
  const attacker = value.attacker && typeof value.attacker === "object" ? value.attacker : {};
  const target = value.target && typeof value.target === "object" ? value.target : {};
  const eventType = String(value.eventType || "");
  const policy = reactionPolicyFor(eventType, value.effect);
  if (!counterCanTrigger({
    eventType,
    isCounter: Boolean(value.isCounter),
    canCounter: policy.canCounter,
    attacker,
    target,
    hpBefore: value.hpBefore,
    hpAfter: value.hpAfter,
  })) {
    return false;
  }
  return rollSucceeds(
    authority.roll(roomId, rollContext(value, "counter.v1", target, attacker)),
    counterRateFor(target, attacker),
  );
}

module.exports = {
  resolveCounterTrigger,
  resolveDamageReaction,
};
