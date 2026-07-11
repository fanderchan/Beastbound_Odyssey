"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyStoneDefenseReduction,
  resolveConfusionTarget,
  stoneDefenseExtraReduction,
} = require("../src/auth/battle-control-rules");

function actor(actorId, side, overrides = {}) {
  return {actorId, side, hp: 100, statuses: {}, ...overrides};
}

function confused(value) {
  return {...value, statuses: {confusion: {id: "confusion", turns: 2}}};
}

function authorityAt(indexValue, contexts) {
  return {
    index(roomId, context, size) {
      contexts.push({roomId, context, size});
      return Math.max(0, Math.min(size - 1, indexValue));
    },
  };
}

test("confusion keeps declared target when absent and privately selects a living same-side ally when active", () => {
  const contexts = [];
  const source = actor("source", "ally");
  const allyA = actor("ally_a", "ally");
  const allyB = actor("ally_b", "ally");
  const enemy = actor("enemy", "enemy");
  assert.deepEqual(resolveConfusionTarget({actor: source, declaredTargetActorId: "enemy"}), {
    triggered: false,
    declaredTargetActorId: "enemy",
    targetActorId: "enemy",
  });

  const result = resolveConfusionTarget({
    randomAuthority: authorityAt(1, contexts),
    roomId: "room_control",
    turnSeq: 3,
    round: 2,
    sequence: 7,
    actionId: "attack",
    actor: confused(source),
    declaredTargetActorId: enemy.actorId,
    actors: [source, allyA, allyB, enemy],
  });
  assert.deepEqual(result, {
    triggered: true,
    declaredTargetActorId: "enemy",
    targetActorId: "ally_b",
  });
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].context.purpose, "confusion_target.v1");
  assert.equal(contexts[0].context.targetId, "enemy");
  assert.equal(/roll|secret/i.test(JSON.stringify(result)), false);
});

test("confusion excludes dead, escaped and captured allies but self-targets when the actor is alone", () => {
  const contexts = [];
  const source = confused(actor("source", "ally"));
  const alone = resolveConfusionTarget({
    randomAuthority: authorityAt(0, contexts),
    roomId: "room_alone",
    actor: source,
    declaredTargetActorId: "enemy",
    actors: [
      source,
      actor("dead", "ally", {hp: 0}),
      actor("escaped", "ally", {escaped: true}),
      actor("captured", "ally", {captured: true}),
      actor("enemy", "enemy"),
    ],
  });
  assert.equal(alone.triggered, true);
  assert.equal(alone.targetActorId, "source");
  assert.equal(contexts[0].size, 1);
  const unavailable = resolveConfusionTarget({
    randomAuthority: authorityAt(0, contexts),
    roomId: "room_unavailable",
    actor: source,
    declaredTargetActorId: "enemy",
    actors: [
      actor("dead", "ally", {hp: 0}),
      actor("escaped", "ally", {escaped: true}),
      actor("captured", "ally", {captured: true}),
      actor("enemy", "enemy"),
    ],
  });
  assert.deepEqual(unavailable, {
    triggered: false,
    declaredTargetActorId: "enemy",
    targetActorId: "enemy",
  });
  assert.throws(() => resolveConfusionTarget({
    actor: source,
    declaredTargetActorId: "enemy",
    actors: [source],
  }), /private random authority/);
});

test("stone contributes only the legacy doubled-defense delta for defense-aware direct damage", () => {
  const normal = actor("normal", "enemy", {defense: 10});
  const stone = actor("stone", "enemy", {defense: 10, statuses: {stone: {id: "stone", turns: 2}}});
  assert.equal(stoneDefenseExtraReduction(normal, 0.35), 0);
  assert.equal(stoneDefenseExtraReduction(stone, 0.35), 3);
  assert.equal(stoneDefenseExtraReduction(stone, 0.25), 2);
  assert.equal(stoneDefenseExtraReduction(stone, 0), 0);
  assert.deepEqual(applyStoneDefenseReduction(20, 3), {damage: 17, extraReduction: 3});
  assert.deepEqual(applyStoneDefenseReduction(2, 7), {damage: 1, extraReduction: 1});
});
