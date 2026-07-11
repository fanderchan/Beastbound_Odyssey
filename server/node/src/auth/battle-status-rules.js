"use strict";

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clampRate(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function freezeStatusSourceCredit(actor) {
  const source = record(actor);
  const kind = String(source.kind || "player");
  const ridePetInstanceId = String(source.ridePetInstanceId || "");
  const rawRidePetMaxHp = Number(source.ridePetMaxHp || 0);
  const ridePetMaxHp = Math.max(0, Number.isFinite(rawRidePetMaxHp) ? Math.trunc(rawRidePetMaxHp) : 0);
  const rawRidePetHp = Number(source.ridePetHp || 0);
  const ridePetHp = Math.max(0, Math.min(ridePetMaxHp, Number.isFinite(rawRidePetHp) ? Math.trunc(rawRidePetHp) : 0));
  const ridePetBattleState = String(source.ridePetBattleState || "");
  return Object.freeze({
    actorId: String(source.actorId || ""),
    accountId: String(source.accountId || ""),
    ownerAccountId: String(source.ownerAccountId || ""),
    partnerId: String(source.partnerId || ""),
    kind,
    petId: String(source.petId || ""),
    displayName: String(source.displayName || source.username || ""),
    username: String(source.username || ""),
    level: Math.max(1, Math.trunc(Number(source.level || 1))),
    ridePetInstanceId,
    ridePetName: String(source.ridePetName || ""),
    ridePetLevel: Math.max(0, Math.trunc(Number(source.ridePetLevel || 0))),
    ridePetHp,
    ridePetMaxHp,
    ridePetBattleState,
    rideActiveAtApply: Boolean(
      kind === "player" &&
      ridePetInstanceId !== "" &&
      ridePetMaxHp > 0 &&
      ridePetHp > 0 &&
      ridePetBattleState === "riding" &&
      !Boolean(source.ridePetKnocked)
    ),
  });
}

function statusSourceActor(status) {
  const source = record(record(status).sourceCredit);
  if (String(source.actorId || "") === "") {
    return null;
  }
  return {...source};
}

function publicBattleStatus(statusId, status) {
  const source = record(status);
  const turns = Math.max(0, Math.trunc(Number(source.turns || 0)));
  if (turns <= 0) {
    return null;
  }
  return {
    id: String(source.id || statusId || ""),
    label: String(source.label || source.id || statusId || ""),
    turns,
    potency: Math.max(0, Math.trunc(Number(source.potency || 0))),
    sourceId: String(source.sourceId || record(source.sourceCredit).actorId || ""),
  };
}

function publicBattleStatuses(value) {
  const statuses = record(value);
  const result = {};
  for (const statusId of Object.keys(statuses).sort()) {
    const status = publicBattleStatus(statusId, statuses[statusId]);
    if (status) {
      result[statusId] = status;
    }
  }
  return result;
}

function resolveStatusHit(value = {}) {
  const authority = value.randomAuthority;
  if (!authority || typeof authority.roll !== "function") {
    throw new TypeError("battle status resolver requires a random authority");
  }
  const roomId = String(value.roomId || "").trim();
  if (roomId === "") {
    throw new TypeError("battle status room id is required");
  }
  const resistance = clampRate(value.resistance);
  if (Boolean(value.immune)) {
    return {hit: false, result: "immune", chance: 0, resistance, immune: true};
  }
  const chance = Math.max(0, Math.min(1, clampRate(value.baseRate) - resistance));
  const roll = authority.roll(roomId, {
    purpose: "status.v1",
    turnSeq: Math.trunc(Number(value.turnSeq || 0)),
    round: Math.trunc(Number(value.round || 0)),
    sequence: Math.trunc(Number(value.sequence || 0)),
    actorId: String(value.actorId || ""),
    targetId: String(value.targetId || ""),
    actionId: String(value.actionId || ""),
    statusId: String(value.statusId || ""),
    ordinal: Math.trunc(Number(value.ordinal || 0)),
  });
  const hit = Number(roll) < chance;
  return {
    hit,
    result: hit ? "applied" : "resisted",
    chance,
    resistance,
    immune: false,
  };
}

module.exports = {
  freezeStatusSourceCredit,
  publicBattleStatus,
  publicBattleStatuses,
  resolveStatusHit,
  statusSourceActor,
};
