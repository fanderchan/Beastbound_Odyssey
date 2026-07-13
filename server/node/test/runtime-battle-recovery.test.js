"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  battleRoomRecoveryMetrics,
  latestBattleRoomRecoveryForAccount,
  pruneBattleRoomRecoveries,
  retireClosedBattleRooms,
} = require("../src/auth/runtime-battle-recovery");

function closedRoom(roomId, accountIds, closedAt, payloadBytes = 4096) {
  return {
    roomId,
    status: "closed",
    participantAccountIds: accountIds,
    closedAt,
    updatedAt: closedAt,
    privateCandidate: "x".repeat(payloadBytes),
    battle: {result: {reason: "victory"}},
  };
}

function compactRecovery(room) {
  return {
    participantAccountIds: room.participantAccountIds.slice(),
    battle: {result: {...room.battle.result}},
    schemaVersion: 1,
  };
}

test("closed rooms leave the hot root and become compact account-indexed recoveries", () => {
  const nowMs = Date.parse("2026-07-13T00:05:00.000Z");
  const full = closedRoom("room_1", ["acc_a", "acc_b"], "2026-07-13T00:04:00.000Z");
  const data = {battleRooms: {room_1: full}};

  const result = retireClosedBattleRooms(data, {
    now: () => nowMs,
    toRecovery: compactRecovery,
  });

  assert.equal(result.retired, 1);
  assert.deepEqual(data.battleRooms, {});
  assert.equal(data.battleRoomRecoveries.room_1.privateCandidate, undefined);
  assert.equal(data.battleRoomRecoveryByAccountId.acc_a, "room_1");
  assert.equal(latestBattleRoomRecoveryForAccount(data, "acc_b", {now: () => nowMs}).roomId, "room_1");
  assert.ok(JSON.stringify(data.battleRoomRecoveries.room_1).length < JSON.stringify(full).length / 2);
});

test("only the newest recovery is retained per account and expired summaries disappear", () => {
  const baseMs = Date.parse("2026-07-13T01:00:00.000Z");
  const data = {
    battleRooms: {
      old: closedRoom("old", ["acc_a"], new Date(baseMs - 2_000).toISOString()),
      newest: closedRoom("newest", ["acc_a"], new Date(baseMs - 1_000).toISOString()),
    },
  };
  retireClosedBattleRooms(data, {now: () => baseMs, ttlMs: 3_000, toRecovery: compactRecovery});
  assert.deepEqual(Object.keys(data.battleRoomRecoveries), ["newest"]);
  assert.equal(data.battleRoomRecoveries.old, undefined);
  assert.equal(latestBattleRoomRecoveryForAccount(data, "acc_a", {now: () => baseMs, ttlMs: 3_000}).roomId, "newest");

  const pruned = pruneBattleRoomRecoveries(data, {now: () => baseMs + 2_001, ttlMs: 3_000});
  assert.equal(pruned.pruned, 1);
  assert.equal(latestBattleRoomRecoveryForAccount(data, "acc_a", {now: () => baseMs + 2_001, ttlMs: 3_000}), null);
});

test("an older shared room remains only for accounts without a newer recovery", () => {
  const baseMs = Date.parse("2026-07-13T01:30:00.000Z");
  const data = {
    battleRooms: {
      shared_old: closedRoom("shared_old", ["acc_a", "acc_b"], new Date(baseMs - 2_000).toISOString()),
      shared_new: closedRoom("shared_new", ["acc_a", "acc_c"], new Date(baseMs - 1_000).toISOString()),
    },
  };

  retireClosedBattleRooms(data, {now: () => baseMs, toRecovery: compactRecovery});

  assert.deepEqual(data.battleRoomRecoveries.shared_new.recoveryAccountIds, ["acc_a", "acc_c"]);
  assert.deepEqual(data.battleRoomRecoveries.shared_old.recoveryAccountIds, ["acc_b"]);
  assert.deepEqual(data.battleRoomRecoveryByAccountId, {
    acc_a: "shared_new",
    acc_b: "shared_old",
    acc_c: "shared_new",
  });
  assert.equal(latestBattleRoomRecoveryForAccount(data, "acc_a", {now: () => baseMs}).roomId, "shared_new");
  assert.equal(latestBattleRoomRecoveryForAccount(data, "acc_b", {now: () => baseMs}).roomId, "shared_old");
});

test("global recovery cardinality is capped and the index never points at evicted rooms", () => {
  const baseMs = Date.parse("2026-07-13T02:00:00.000Z");
  const rooms = {};
  for (let index = 0; index < 12; index += 1) {
    const roomId = `room_${index}`;
    rooms[roomId] = closedRoom(roomId, [`acc_${index}`], new Date(baseMs + index).toISOString(), 1);
  }
  const data = {battleRooms: rooms};
  retireClosedBattleRooms(data, {
    now: () => baseMs + 20,
    maxRecoveries: 5,
    toRecovery: compactRecovery,
  });

  assert.deepEqual(battleRoomRecoveryMetrics(data), {
    activeRooms: 0,
    recoveries: 5,
    indexedAccounts: 5,
  });
  assert.equal(latestBattleRoomRecoveryForAccount(data, "acc_11", {now: () => baseMs + 20, maxRecoveries: 5}).roomId, "room_11");
  assert.equal(latestBattleRoomRecoveryForAccount(data, "acc_0", {now: () => baseMs + 20, maxRecoveries: 5}), null);
  for (const roomId of Object.values(data.battleRoomRecoveryByAccountId)) {
    assert.ok(data.battleRoomRecoveries[roomId]);
  }
});
