"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  battleProfile,
  createAuthService,
  createMemoryAuthStore,
} = require("../test-support/auth-service-test-context");
const {createBattleRandomAuthority} = require("../src/auth/battle-random-authority");

test("cluster battle runtime hydrates a half-finished duel with RNG and exact command replay intact", async () => {
  const sourceRandom = deterministicAuthority(0x35);
  const sourceStore = createMemoryAuthStore();
  const source = createAuthService({store: sourceStore, battleRandomAuthority: sourceRandom});
  const fixture = createDuel(source);
  const roomId = fixture.room.roomId;
  const firstPayload = {
    round: 1,
    actorId: fixture.challengerActor.actorId,
    actionId: "attack",
    targetActorId: fixture.opponentActor.actorId,
  };
  const firstOperation = durableOperation(
    "cluster-runtime-command-0001",
    "a".repeat(64),
  );
  const first = await source.invokeDurable(
    "submitBattleCommand",
    [fixture.challenger.session.token, roomId, firstPayload],
    firstOperation,
  );
  assert.equal(first.ok, true);
  assert.equal(first.turn, null);

  const sourceCredential = source._issueClusterBattleRuntimeCredential();
  const exported = source._clusterExportBattleRuntime(sourceCredential, roomId);
  assert.equal(exported.ok, true);
  assert.equal(exported.active, true);
  assert.match(exported.snapshot.randomSecret, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(
    exported.snapshot.room.clusterCommandReceiptOrder.includes(firstOperation.operationId),
    true,
  );

  const persistent = sourceStore.load();
  assert.deepEqual(persistent.battleRooms, {});
  const targetRandom = deterministicAuthority(0x62);
  const targetStore = createMemoryAuthStore(persistent);
  const target = createAuthService({
    store: targetStore,
    initialData: persistent,
    battleRandomAuthority: targetRandom,
  });
  let randomReadyAtHydrationEvent = false;
  target.onEvent((event) => {
    if (event && event.reason === "cluster_runtime_hydrated" && event.roomId === roomId) {
      randomReadyAtHydrationEvent = targetRandom.hasRoom(roomId);
    }
  });
  const interrupted = target.getBattleState(fixture.challenger.session.token);
  assert.equal(interrupted.ok, true);
  assert.equal(interrupted.room, null);
  assert.equal(interrupted.interruption.roomId, roomId);

  const targetCredential = target._issueClusterBattleRuntimeCredential();
  const forged = await target.invokeDurable(
    "_clusterHydrateBattleRuntime",
    [{...targetCredential}, exported.snapshot],
    {actionId: "CLUSTER forged battle runtime hydrate"},
  );
  assert.equal(forged.ok, false);
  assert.equal(forged.code, "cluster_battle_runtime_identity_invalid");

  const hydrated = await target.invokeDurable(
    "_clusterHydrateBattleRuntime",
    [targetCredential, exported.snapshot],
    {actionId: "CLUSTER battle runtime hydrate"},
  );
  assert.equal(hydrated.ok, true);
  assert.equal(hydrated.hydrated, true);
  assert.equal(hydrated.room.roomId, roomId);
  assert.equal(randomReadyAtHydrationEvent, true);
  assert.equal(
    hydrated.room.battle.submittedAccountIds.includes(fixture.challenger.account.accountId),
    true,
  );
  assert.equal(/randomSecret|clusterCommandReceipt/.test(JSON.stringify(hydrated.room)), false);

  const rollContext = {
    purpose: "critical.v1",
    turnSeq: 2,
    round: 1,
    sequence: 4,
    actorId: fixture.challengerActor.actorId,
    targetId: fixture.opponentActor.actorId,
    actionId: "attack",
    ordinal: 0,
  };
  assert.equal(targetRandom.roll(roomId, rollContext), sourceRandom.roll(roomId, rollContext));

  const replay = await target.invokeDurable(
    "submitBattleCommand",
    [fixture.challenger.session.token, roomId, firstPayload],
    firstOperation,
  );
  assert.deepEqual(replay, first);
  const conflict = await target.invokeDurable(
    "submitBattleCommand",
    [fixture.challenger.session.token, roomId, {...firstPayload, actionId: "defend"}],
    {...firstOperation, requestHash: "b".repeat(64)},
  );
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "idempotency_key_conflict");

  const resolved = await target.invokeDurable(
    "submitBattleCommand",
    [fixture.opponent.session.token, roomId, {
      round: 1,
      actorId: fixture.opponentActor.actorId,
      actionId: "defend",
    }],
    durableOperation("cluster-runtime-command-0002", "c".repeat(64)),
  );
  assert.equal(resolved.ok, true);
  assert.equal(resolved.turn.round, 1);
});

test("cluster battle runtime rejects corrupted snapshots and stale durable failure tickets", async () => {
  const store = createMemoryAuthStore();
  const service = createAuthService({store});
  const fixture = createDuel(service, "guard");
  const credential = service._issueClusterBattleRuntimeCredential();
  const exported = service._clusterExportBattleRuntime(credential, fixture.room.roomId);
  assert.equal(exported.ok, true);

  const corrupted = JSON.parse(JSON.stringify(exported.snapshot));
  corrupted.room.mode = "tampered";
  const corruptedResult = await service.invokeDurable(
    "_clusterHydrateBattleRuntime",
    [credential, corrupted],
    {actionId: "CLUSTER corrupt battle runtime hydrate"},
  );
  assert.equal(corruptedResult.ok, false);
  assert.equal(corruptedResult.code, "cluster_battle_runtime_snapshot_invalid");

  const staleData = store.load();
  for (const session of Object.values(staleData.sessions || {})) {
    if (String(session && session.accountId || "") === fixture.challenger.account.accountId) {
      delete session.battleFailureTicket;
    }
  }
  const staleRandom = deterministicAuthority(0x63);
  const staleService = createAuthService({
    store: createMemoryAuthStore(staleData),
    initialData: staleData,
    battleRandomAuthority: staleRandom,
  });
  const staleCredential = staleService._issueClusterBattleRuntimeCredential();
  const staleResult = await staleService.invokeDurable(
    "_clusterHydrateBattleRuntime",
    [staleCredential, exported.snapshot],
    {actionId: "CLUSTER stale battle runtime hydrate"},
  );
  assert.equal(staleResult.ok, false);
  assert.equal(staleResult.code, "cluster_battle_runtime_ticket_stale");
  assert.equal(staleRandom.hasRoom(fixture.room.roomId), false);
});

function deterministicAuthority(byte) {
  return createBattleRandomAuthority({
    randomBytes(size) {
      return Buffer.alloc(size, byte);
    },
  });
}

function createDuel(service, suffix = "live") {
  const challenger = service.register({
    username: `runtime${suffix}a`,
    password: "runtimepass123",
    displayName: "接管甲",
  });
  const opponent = service.register({
    username: `runtime${suffix}b`,
    password: "runtimepass123",
    displayName: "接管乙",
  });
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  assert.equal(service.saveProfile(challenger.session.token, {
    expectedRevision: 0,
    profile: battleProfile("接管甲", {
      level: 10,
      hp: 220,
      maxHp: 220,
      attack: 26,
      defense: 14,
      quick: 80,
    }, null),
  }).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {
    expectedRevision: 0,
    profile: battleProfile("接管乙", {
      level: 10,
      hp: 220,
      maxHp: 220,
      attack: 24,
      defense: 14,
      quick: 70,
    }, null),
  }).ok, true);
  assert.equal(service.updatePlayerPosition(challenger.session.token, {
    mapId: "firebud_training_yard",
    cellX: 10,
    cellY: 10,
    facing: "east",
    moving: false,
  }).ok, true);
  assert.equal(service.updatePlayerPosition(opponent.session.token, {
    mapId: "firebud_training_yard",
    cellX: 11,
    cellY: 10,
    facing: "west",
    moving: false,
  }).ok, true);
  const invite = service.inviteToBattle(challenger.session.token, {
    username: opponent.account.username,
  });
  assert.equal(invite.ok, true);
  const accepted = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accepted.ok, true);
  const challengerActor = accepted.room.battle.actors.find((actor) => (
    actor.accountId === challenger.account.accountId && actor.kind === "player"
  ));
  const opponentActor = accepted.room.battle.actors.find((actor) => (
    actor.accountId === opponent.account.accountId && actor.kind === "player"
  ));
  assert.ok(challengerActor);
  assert.ok(opponentActor);
  return {challenger, opponent, room: accepted.room, challengerActor, opponentActor};
}

function durableOperation(operationId, requestHash) {
  return {
    operationId,
    requestHash,
    actionId: "POST /battle/rooms/runtime/commands",
  };
}
