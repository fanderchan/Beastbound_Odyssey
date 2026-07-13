"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createAuthService,
  createMemoryAuthStore,
} = require("../src/auth-service");

function register(service, username, displayName) {
  const result = service.register({username, password: "test1234", displayName});
  assert.equal(result.ok, true);
  return result;
}

function position(service, session, cellX) {
  const result = service.updatePlayerPosition(session.token, {
    mapId: "firebud_village_gate",
    cellX,
    cellY: 10,
    facing: cellX < 11 ? "east" : "west",
    moving: false,
  });
  assert.equal(result.ok, true);
}

test("terminal party and battle invites leave no hot or persistent history", () => {
  const store = createMemoryAuthStore();
  const service = createAuthService({store, allowPositionTeleport: true});
  const leader = register(service, "hotleada", "热集队长");
  const member = register(service, "hotmembra", "热集队员");

  const partyInvite = service.inviteToParty(leader.session.token, {username: member.account.username});
  assert.equal(partyInvite.ok, true);
  const partyAccept = service.acceptPartyInvite(member.session.token, partyInvite.invite.inviteId);
  assert.equal(partyAccept.ok, true);
  assert.equal(partyAccept.invite.status, "accepted");
  assert.deepEqual(service.snapshot().partyInvites, {});
  assert.deepEqual(store.load().partyInvites, {});

  assert.equal(service.leaveParty(member.session.token).ok, true);
  position(service, leader.session, 10);
  position(service, member.session, 11);
  const battleInvite = service.inviteToBattle(leader.session.token, {username: member.account.username});
  assert.equal(battleInvite.ok, true);
  const battleAccept = service.acceptBattleInvite(member.session.token, battleInvite.invite.inviteId);
  assert.equal(battleAccept.ok, true);
  assert.equal(battleAccept.invite.status, "accepted");
  assert.deepEqual(service.snapshot().battleInvites, {});
  assert.deepEqual(store.load().battleInvites, {});

  const metrics = service.runtimeCapacityMetrics();
  const snapshot = service.snapshot();
  assert.equal(metrics.partyInvitesTerminal, 0);
  assert.equal(metrics.battleInvitesTerminal, 0);
  assert.equal(metrics.battleRecords, snapshot.battleRecords.length);
  assert.equal(metrics.battleTrace, snapshot.battleTrace.length);
  assert.equal(metrics.battleRecordOldestId, "");
  assert.equal(metrics.battleRecordNewestId, "");
  assert.equal(metrics.battleRecordNewestRoomId, "");
  assert.equal(metrics.battleTraceOldestId, snapshot.battleTrace[0].traceId);
  assert.equal(metrics.battleTraceNewestId, snapshot.battleTrace.at(-1).traceId);
  assert.equal(metrics.battleTraceNewestRoomId, snapshot.battleTrace.at(-1).roomId);
  assert.equal(metrics.battleTraceNewestType, snapshot.battleTrace.at(-1).type);
  assert.equal(metrics.chatMessages, snapshot.chatMessages.length);
  assert.equal(metrics.receiptActive, 0);
  assert.equal(metrics.receiptCheckpoints, 0);
  assert.equal(metrics.receiptHistoricalKeys, 0);
  assert.equal(metrics.receiptHistoryEntries, 0);
  assert.equal(metrics.receiptExpiryHeap, 0);
  assert.equal(metrics.receiptOldestHeap, 0);
  assert.equal(metrics.receiptPendingDeletes, 0);
  assert.equal(metrics.receiptPendingUpserts, 0);
});

test("closed battle rooms are removed from the active root and compacted", () => {
  const service = createAuthService({allowPositionTeleport: true});
  const challenger = register(service, "hotrooma", "压缩甲");
  const opponent = register(service, "hotroomb", "压缩乙");
  position(service, challenger.session, 10);
  position(service, opponent.session, 11);

  const invite = service.inviteToBattle(challenger.session.token, {username: opponent.account.username});
  const accepted = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  const activeDiagnosticBytes = JSON.stringify(service.snapshot().battleRooms[accepted.room.roomId]).length;
  const closed = service.leaveBattleRoom(opponent.session.token, accepted.room.roomId);
  assert.equal(closed.ok, true);

  const metrics = service.runtimeCapacityMetrics();
  assert.equal(metrics.activeBattleRooms, 0);
  assert.equal(metrics.battleRoomRecoveries, 1);
  assert.equal(metrics.battleRecoveryIndexedAccounts, 0, "leave without replay payload should not reappear in battle polling");
  assert.equal(metrics.battleRecords, 1);
  assert.equal(metrics.battleRecordOldestId, `battle_record_${accepted.room.roomId.replace(/^battle_room_/, "")}`);
  assert.equal(metrics.battleRecordNewestId, metrics.battleRecordOldestId);
  assert.equal(metrics.battleRecordNewestRoomId, accepted.room.roomId);
  assert.ok(metrics.battleTrace >= 1);
  assert.notEqual(metrics.battleTraceOldestId, "");
  assert.notEqual(metrics.battleTraceNewestId, "");
  assert.equal(metrics.battleTraceNewestRoomId, accepted.room.roomId);
  assert.equal(metrics.battleTraceNewestType, "battle_room_closed");
  assert.equal(service.getBattleState(challenger.session.token).room, null);

  const diagnosticRecovery = service.snapshot().battleRooms[accepted.room.roomId];
  assert.equal(diagnosticRecovery.status, "closed");
  assert.equal(diagnosticRecovery.seed, "");
  assert.equal(diagnosticRecovery.entry, null);
  assert.deepEqual(diagnosticRecovery.participants, []);
  assert.equal(diagnosticRecovery.battle.captureCandidatesByActorId, undefined);
  assert.ok(JSON.stringify(diagnosticRecovery).length < activeDiagnosticBytes);
});

test("event replay metadata exposes the retained global window", () => {
  const service = createAuthService();
  const leader = register(service, "windowaa", "窗口甲");
  const member = register(service, "windowbb", "窗口乙");
  const invite = service.inviteToParty(leader.session.token, {username: member.account.username});
  assert.equal(invite.ok, true);

  const replay = service.listEventsForSession(leader.session.token, {afterSeq: 0});
  assert.equal(replay.ok, true);
  assert.ok(replay.latestEventSeq >= replay.earliestEventSeq);
  assert.equal(replay.earliestEventSeq, service.snapshot().serviceEvents[0].eventSeq);
  assert.equal(replay.latestEventSeq, service.latestEventSeq());
});

test("battle replay hydrates exactly one authoritative room around compact command and turn events", () => {
  const service = createAuthService({allowPositionTeleport: true});
  const challenger = register(service, "compactrepa", "压缩补发甲");
  const opponent = register(service, "compactrepb", "压缩补发乙");
  position(service, challenger.session, 10);
  position(service, opponent.session, 11);
  const liveEvents = [];
  service.onEvent((event) => liveEvents.push(event));

  const invite = service.inviteToBattle(challenger.session.token, {username: opponent.account.username});
  const accepted = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  const readyReplay = service.listEventsForSession(opponent.session.token, {afterSeq: 0});
  const readyRoomEvents = readyReplay.events.filter((event) => event.roomId === accepted.room.roomId);
  const readyHydrated = readyRoomEvents.filter((event) => event.room && event.room.roomId === accepted.room.roomId);
  assert.equal(readyHydrated.length, 1, "a cold client with only room_ready receives one authority snapshot");
  assert.equal(readyHydrated[0].type, "battle.room_ready");
  assert.equal(readyHydrated[0].room.battle.round, 1);

  const first = service.submitBattleCommand(challenger.session.token, accepted.room.roomId, {
    round: 1,
    actionId: "defend",
  });
  const commandReplay = service.listEventsForSession(opponent.session.token, {afterSeq: 0});
  const commandRoomEvents = commandReplay.events.filter((event) => event.roomId === accepted.room.roomId);
  const commandHydrated = commandRoomEvents.filter((event) => event.room && event.room.roomId === accepted.room.roomId);
  const replayedCommand = commandRoomEvents.find((event) => event.type === "battle.command_submitted");
  assert.equal(commandHydrated.length, 1, "latest compact command retains one preceding room hydration");
  assert.equal(commandHydrated[0].type, "battle.room_ready");
  assert.ok(replayedCommand);
  assert.equal(Object.hasOwn(replayedCommand, "room"), false);
  assert.equal(replayedCommand.submittedActorIds.length, 1);

  const second = service.submitBattleCommand(opponent.session.token, accepted.room.roomId, {
    round: 1,
    actionId: "defend",
  });
  assert.equal(first.ok, true);
  assert.equal(first.turn, null);
  assert.equal(second.ok, true);
  assert.ok(second.turn);

  const retainedBattleEvents = service.snapshot().serviceEvents
    .filter((event) => String(event.type || "").startsWith("battle."));
  assert.ok(retainedBattleEvents.length >= 4);
  assert.equal(retainedBattleEvents.some((event) => Object.hasOwn(event, "room")), false);
  const retainedRoomReady = retainedBattleEvents.find((event) => event.type === "battle.room_ready");
  assert.equal(retainedRoomReady.roomId, accepted.room.roomId);
  const liveBattleEvents = liveEvents.filter((event) => String(event.type || "").startsWith("battle."));
  assert.equal(liveBattleEvents.some((event) => event.room && event.room.roomId === accepted.room.roomId), true);
  assert.equal(liveBattleEvents.filter((event) => event.type === "battle.command_submitted").some((event) => Object.hasOwn(event, "room")), false);
  assert.equal(liveBattleEvents.filter((event) => event.type === "battle.turn_resolved").some((event) => Object.hasOwn(event, "room")), false);
  const retainedTurn = retainedBattleEvents.find((event) => event.type === "battle.turn_resolved");
  assert.equal(retainedTurn.turn.actorSnapshotMode, "dynamic_v1");
  assert.equal(Object.hasOwn(retainedTurn.turn.actors[0], "equipmentStatSummary"), false);
  assert.ok(
    Buffer.byteLength(JSON.stringify(retainedBattleEvents))
      < Buffer.byteLength(JSON.stringify(liveBattleEvents)),
  );

  const replay = service.listEventsForSession(opponent.session.token, {afterSeq: 0});
  const roomEvents = replay.events.filter((event) => event.roomId === accepted.room.roomId);
  const hydrated = roomEvents.filter((event) => event.room && event.room.roomId === accepted.room.roomId);
  assert.equal(hydrated.length, 1);
  assert.equal(hydrated[0].type, "battle.turn_resolved");
  assert.equal(hydrated[0].eventSeq, Math.max(...roomEvents.map((event) => event.eventSeq)));
  assert.equal(hydrated[0].turn.kind, "battle_event_list");
  assert.equal(Object.hasOwn(hydrated[0].turn, "actorSnapshotMode"), false);
  assert.equal(Object.hasOwn(hydrated[0].turn.actors[0], "equipmentStatSummary"), true);
  assert.equal(Object.hasOwn(hydrated[0].room.battle, "lastEventList"), false);
});

test("repeated logins keep bounded per-account session history", () => {
  let nowMs = Date.parse("2026-07-13T03:00:00.000Z");
  const service = createAuthService({now: () => nowMs});
  const first = register(service, "sessioncap", "会话上限");
  let latest = first;
  for (let index = 0; index < 14; index += 1) {
    nowMs += 61 * 1000;
    latest = service.login({username: "sessioncap", password: "test1234"});
    assert.equal(latest.ok, true);
  }
  const sessions = Object.values(service.snapshot().sessions)
    .filter((session) => session && session.accountId === first.account.accountId);
  assert.equal(sessions.length, 8);
  assert.equal(service.getSession(latest.session.token).ok, true);
  assert.equal(service.getSession(first.session.token).ok, false);
});
