"use strict";

const {
  assert,
  once,
  test,
  battleProfile,
  createAuthService,
  createAsyncWriteAuthStore,
  createHttpServer,
  createMemoryAuthStore,
  fetchJson,
} = require("../test-support/auth-service-test-context");
const {createPetEncounterAuthority} = require("../src/auth/pet-encounter-authority");
const {
  __retiredTrainingPartnerBattleAuthorityForTest: retiredPartnerBattle,
} = require("../src/auth-service");

const FORMAL_AUTHORITY = createPetEncounterAuthority();
const FORMAL_ZONES = new Map(FORMAL_AUTHORITY.progressionRoutes.trainingZones.map((zone) => [zone.id, zone]));
const ROUTES = new Map();
for (const route of FORMAL_AUTHORITY.progressionRoutes.routeEntries) {
  if (!ROUTES.has(route.progressionZoneId)) {
    ROUTES.set(route.progressionZoneId, route);
  }
}

function createMatchService(options = {}) {
  let nowMs = options.nowMs ?? Date.parse("2026-08-08T00:00:00.000Z");
  const service = createAuthService({
    store: options.store || createMemoryAuthStore(),
    now: () => nowMs,
    hangMatchmakingNpcFillDelayMs: options.npcFillDelayMs ?? 8_000,
    allowPositionTeleport: true,
    useStrictPetEncounterAuthority: true,
  });
  return {
    service,
    now: () => nowMs,
    advance(ms) {
      nowMs += ms;
      return nowMs;
    },
  };
}

function routeTarget(routeId = "firebud_newbie") {
  const route = ROUTES.get(routeId);
  const zone = FORMAL_ZONES.get(routeId);
  assert.ok(route, `missing route ${routeId}`);
  assert.ok(zone, `missing zone ${routeId}`);
  return {
    progressionZoneId: routeId,
    mapId: route.mapId,
    encounterGroupId: route.encounterGroupId,
    label: zone.label,
  };
}

function registerMatchPlayer(service, suffix, options = {}) {
  const route = ROUTES.get(options.routeId || "firebud_newbie");
  assert.ok(route);
  const username = `hmatch${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 24);
  const displayName = options.displayName || `匹配${suffix}`;
  const registered = service.register({username, password: "test1234", displayName});
  assert.equal(registered.ok, true, JSON.stringify(registered));
  const profile = battleProfile(displayName, {
    level: options.level || 8,
    hp: options.hp || 220,
    maxHp: options.maxHp || options.hp || 220,
    attack: options.attack || 42,
    defense: options.defense || 18,
    quick: options.quick || 76,
    comboRateOverride: 0,
  }, options.pet === undefined ? null : options.pet);
  profile.hangSession = options.hangEnabled === false ? {
    enabled: false,
    mode: "walk",
  } : {
    enabled: true,
    mode: "walk",
    originMapId: route.mapId,
    originCell: options.originCell || [11, 15],
    encounterZoneId: route.encounterZoneId,
    encounterGroupId: route.encounterGroupId,
    startedAt: "2026-08-08T00:00:00.000Z",
  };
  if (options.trainingPartners) {
    profile.trainingPartners = options.trainingPartners;
  }
  if (options.matchQuest) {
    profile.activeQuestId = "quest_training_partner_intro";
    profile.questStates = {
      quest_training_partner_intro: {
        questId: "quest_training_partner_intro",
        status: "active",
        progress: 0,
      },
    };
  }
  const saved = service.saveProfile(registered.session.token, {expectedRevision: 0, profile});
  assert.equal(saved.ok, true, JSON.stringify(saved));
  return registered;
}

function joinPayload(key, routeId = "firebud_newbie", extra = {}) {
  return {
    idempotencyKey: key,
    target: routeTarget(routeId),
    ...extra,
  };
}

function durableJoinOperation(operationId, requestHashByte = "a") {
  return {
    operationId,
    requestHash: String(requestHashByte).repeat(64),
    actionId: "POST /hang/match/join",
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return {promise, resolve, reject};
}

test("hang matchmaking derives the formal target, merges humans, honors preferred queues, and isolates routes", () => {
  const {service} = createMatchService();
  const leader = registerMatchPlayer(service, "mergea");
  const preferredMember = registerMatchPlayer(service, "mergeb");
  const otherRoute = registerMatchPlayer(service, "mergec", {routeId: "mistcap_growth"});
  const observer = registerMatchPlayer(service, "merged", {hangEnabled: false});

  const forged = service.joinHangMatchmaking(leader.session.token, joinPayload("join_merge_forged_0001", "firebud_newbie", {
    target: {...routeTarget("firebud_newbie"), label: "客户端伪造队列名称"},
  }));
  assert.equal(forged.ok, false);
  assert.equal(forged.code, "hang_match_target_mismatch");

  const first = service.joinHangMatchmaking(leader.session.token, {
    idempotencyKey: "join_merge_a_0001",
    target: {
      mapId: "firebud_village_gate",
      encounterGroupId: "firebud_grass_01",
    },
  });
  assert.equal(first.ok, true);
  assert.deepEqual(first.state.target, {...routeTarget("firebud_newbie"), schemaVersion: 1});
  assert.equal(first.state.humanCount, 1);
  assert.equal(first.state.listings[0].queueId, first.state.queueId);
  assert.equal(first.state.listings[0].routeId, "firebud_newbie");
  assert.equal(first.state.listings[0].routeLabel, "火芽村入口草丛");
  assert.equal(first.state.listings[0].leaderName, leader.account.displayName);

  const preferred = service.joinHangMatchmaking(preferredMember.session.token, joinPayload(
    "join_merge_b_0001",
    "firebud_newbie",
    {preferredQueueId: first.state.queueId},
  ));
  assert.equal(preferred.ok, true);
  assert.equal(preferred.state.queueId, first.state.queueId);
  assert.equal(preferred.state.humanCount, 2);
  assert.equal(service.getHangMatchState(leader.session.token).state.humanCount, 2);

  const mismatch = service.joinHangMatchmaking(otherRoute.session.token, joinPayload(
    "join_merge_c_bad_0001",
    "mistcap_growth",
    {preferredQueueId: first.state.queueId},
  ));
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, "hang_match_preferred_target_mismatch");
  const isolated = service.joinHangMatchmaking(otherRoute.session.token, joinPayload("join_merge_c_0001", "mistcap_growth"));
  assert.equal(isolated.ok, true);
  assert.notEqual(isolated.state.queueId, first.state.queueId);
  assert.equal(isolated.state.humanCount, 1);

  const idle = service.getHangMatchState(observer.session.token);
  assert.equal(idle.ok, true);
  assert.equal(idle.state.status, "idle");
  assert.equal(idle.state.listings.length, 2);
  assert.deepEqual(new Set(idle.state.listings.map((listing) => listing.routeId)), new Set(["firebud_newbie", "mistcap_growth"]));
  assert.equal(idle.state.listings.every((listing) => Array.isArray(listing.target) === false), true);

  const missing = service.joinHangMatchmaking(observer.session.token, joinPayload(
    "join_missing_queue_0001",
    "firebud_newbie",
    {preferredQueueId: "hang_match_missing"},
  ));
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "hang_match_hang_required");
});

test("hang matchmaking fills after eight seconds with bounded paired NPC snapshots and replaces them with humans", () => {
  const {service, advance} = createMatchService();
  const leader = registerMatchPlayer(service, "filla", {attack: 100, pet: null});
  const member = registerMatchPlayer(service, "fillb", {attack: 80, pet: null});
  const first = service.joinHangMatchmaking(leader.session.token, joinPayload("join_fill_a_0001"));
  assert.equal(first.ok, true);
  assert.equal(first.state.status, "matching");
  assert.equal(first.state.npcFillInMs, 8_000);
  advance(7_999);
  assert.equal(service.getHangMatchState(leader.session.token).state.npcCount, 0);
  advance(1);
  const filled = service.getHangMatchState(leader.session.token).state;
  assert.equal(filled.status, "npc_filled");
  assert.equal(filled.active, true);
  assert.equal(filled.humanCount, 1);
  assert.equal(filled.npcCount, 4);
  assert.equal(filled.emptyCount, 0);
  assert.equal(filled.waitingPlayerCount, 1);
  assert.equal(filled.npcMembers.length, 4);
  assert.equal(filled.npcMembers.every((npc) => npc.matchmakingNpc && npc.controller === "server_ai" && npc.rewardEligible === false), true);

  const joined = service.joinHangMatchmaking(member.session.token, joinPayload("join_fill_b_0001"));
  assert.equal(joined.ok, true);
  assert.equal(joined.state.queueId, first.state.queueId);
  assert.equal(joined.state.humanCount, 2);
  assert.equal(joined.state.npcCount, 3);
  assert.equal(joined.state.npcMembers.length, 3);

  const snapshot = service.snapshot();
  assert.equal(Object.keys(snapshot).some((key) => /hangMatch|matchmaking/i.test(key)), false);
  assert.equal(Object.values(snapshot.accounts).filter((account) => String(account.username || "").includes("npc")).length, 0);
});

test("preformed parties need only the leader hang session and non-leaders cannot control matching", () => {
  const {service} = createMatchService();
  const leader = registerMatchPlayer(service, "preforma");
  const member = registerMatchPlayer(service, "preformb", {hangEnabled: false});
  const invite = service.inviteToParty(leader.session.token, {username: member.account.username});
  assert.equal(invite.ok, true);
  assert.equal(service.acceptPartyInvite(member.session.token, invite.invite.inviteId).ok, true);

  const joined = service.joinHangMatchmaking(leader.session.token, joinPayload("join_preform_a_0001"));
  assert.equal(joined.ok, true);
  assert.equal(joined.state.humanCount, 2);
  const memberState = service.getHangMatchState(member.session.token);
  assert.equal(memberState.ok, true);
  assert.equal(memberState.state.queueId, joined.state.queueId);
  assert.equal(memberState.state.humanCount, 2);

  const memberProfile = service.getProfile(member.session.token).profile;
  memberProfile.hangSession = {
    enabled: true,
    mode: "walk",
    originMapId: "firebud_village_gate",
    originCell: [11, 15],
    encounterZoneId: "village_grass",
    encounterGroupId: "firebud_grass_01",
  };
  assert.equal(service.saveProfile(member.session.token, {expectedRevision: 1, profile: memberProfile}).ok, true);
  const memberJoin = service.joinHangMatchmaking(member.session.token, joinPayload("join_preform_b_0001"));
  assert.equal(memberJoin.ok, false);
  assert.equal(memberJoin.code, "hang_match_leader_required");
  const memberCancel = service.cancelHangMatchmaking(member.session.token, {idempotencyKey: "cancel_preform_b_0001"});
  assert.equal(memberCancel.ok, false);
  assert.equal(memberCancel.code, "hang_match_leader_required");
});

test("join and cancel idempotency are intent-bound, quest progress is authoritative, and stopping hang clears matching", () => {
  const {service} = createMatchService();
  const player = registerMatchPlayer(service, "idem", {matchQuest: true});
  const payload = joinPayload("join_idem_0001");
  const joined = service.joinHangMatchmaking(player.session.token, payload);
  assert.equal(joined.ok, true);
  const afterJoin = service.getProfile(player.session.token);
  assert.equal(afterJoin.profile.questStates.quest_training_partner_intro.status, "claimed");
  const revisionAfterJoin = afterJoin.profileSummary.profileRevision;

  const replay = service.joinHangMatchmaking(player.session.token, payload);
  assert.equal(replay.ok, true);
  assert.equal(replay.state.replayed, true);
  assert.equal(service.getProfile(player.session.token).profileSummary.profileRevision, revisionAfterJoin);
  const conflict = service.joinHangMatchmaking(player.session.token, {
    ...payload,
    target: {...payload.target, label: "换了意图"},
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "idempotency_key_conflict");

  const cancelled = service.cancelHangMatchmaking(player.session.token, {
    idempotencyKey: "cancel_idem_0001",
    reason: "manual",
  });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.state.status, "cancelled");
  assert.equal(cancelled.state.queueId, "");
  const cancelReplay = service.cancelHangMatchmaking(player.session.token, {
    idempotencyKey: "cancel_idem_0001",
    reason: "manual",
  });
  assert.equal(cancelReplay.ok, true);
  assert.equal(cancelReplay.state.replayed, true);
  const cancelConflict = service.cancelHangMatchmaking(player.session.token, {
    idempotencyKey: "cancel_idem_0001",
    reason: "different_reason",
  });
  assert.equal(cancelConflict.ok, false);
  assert.equal(cancelConflict.code, "idempotency_key_conflict");

  const rejoined = service.joinHangMatchmaking(player.session.token, joinPayload("join_idem_0002"));
  assert.equal(rejoined.ok, true);
  const stopped = service.stopHangSession(player.session.token, {reason: "manual"});
  assert.equal(stopped.ok, true);
  assert.equal(stopped.matchState.status, "cancelled");
  assert.equal(service.getHangMatchState(player.session.token).state.status, "idle");
});

test("full human parties become matching again with a newer revision when a member leaves", () => {
  const {service} = createMatchService();
  const players = Array.from({length: 5}, (_, index) => registerMatchPlayer(service, `full${index + 1}`));
  let joined = null;
  for (let index = 0; index < players.length; index += 1) {
    joined = service.joinHangMatchmaking(players[index].session.token, joinPayload(`join_full_${index + 1}_0001`));
    assert.equal(joined.ok, true, JSON.stringify(joined));
  }
  const full = service.getHangMatchState(players[0].session.token).state;
  assert.equal(full.status, "full");
  assert.equal(full.active, false);
  assert.equal(full.humanCount, 5);
  assert.equal(full.npcCount, 0);
  assert.equal(full.emptyCount, 0);
  assert.equal(service.leaveParty(players[4].session.token).ok, true);
  const reopened = service.getHangMatchState(players[0].session.token).state;
  assert.equal(reopened.active, true);
  assert.equal(reopened.status, "matching");
  assert.equal(reopened.humanCount, 4);
  assert.equal(reopened.npcCount, 0);
  assert.equal(reopened.emptyCount, 1);
  assert.ok(reopened.stateRevision > full.stateRevision);
});

test("failed persistence never publishes a ghost matchmaking queue", () => {
  const base = createMemoryAuthStore();
  let failSave = false;
  const store = {
    mode: "memory",
    checkHealth: () => ({ok: true}),
    checkHealthAsync: async () => ({ok: true}),
    load: () => base.load(),
    save(nextData) {
      if (failSave) {
        const error = new Error("synthetic matchmaking save failure");
        error.code = "storage_write_failed";
        throw error;
      }
      base.save(nextData);
    },
  };
  const {service} = createMatchService({store});
  const player = registerMatchPlayer(service, "savefail");
  failSave = true;
  assert.throws(
    () => service.joinHangMatchmaking(player.session.token, joinPayload("join_save_fail_0001")),
    /synthetic matchmaking save failure/,
  );
  failSave = false;
  const state = service.getHangMatchState(player.session.token);
  assert.equal(state.ok, true);
  assert.equal(state.state.status, "idle");
  assert.equal(state.state.queueId, "");
  assert.deepEqual(state.state.listings, []);
});

test("delayed durable join rebases onto GET pruning without reviving an expired queue or rolling revision back", async () => {
  const base = createMemoryAuthStore();
  const seed = createMatchService({store: base}).service;
  const expiredLeader = registerMatchPlayer(seed, "interleavea");
  const pendingLeader = registerMatchPlayer(seed, "interleaveb", {routeId: "mistcap_growth"});
  const observer = registerMatchPlayer(seed, "interleavec", {hangEnabled: false});
  const writeStarted = deferred();
  const releaseWrite = deferred();
  let delayNextWrite = false;
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsyncOwned(nextData) {
      if (delayNextWrite) {
        delayNextWrite = false;
        writeStarted.resolve();
        await releaseWrite.promise;
      }
      base.save(nextData);
    },
  }, {onError() {}});
  const {service, advance} = createMatchService({store});
  const first = await service.invokeDurable(
    "joinHangMatchmaking",
    [expiredLeader.session.token, joinPayload("join_interleave_a_0001")],
    durableJoinOperation("join_interleave_a_0001", "1"),
  );
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(service.getHangMatchState(expiredLeader.session.token).state.queueId, first.state.queueId);

  delayNextWrite = true;
  const pending = service.invokeDurable(
    "joinHangMatchmaking",
    [pendingLeader.session.token, joinPayload("join_interleave_b_0001", "mistcap_growth")],
    durableJoinOperation("join_interleave_b_0001", "2"),
  );
  await writeStarted.promise;
  advance(26_000);
  assert.equal(service.getProfile(pendingLeader.session.token).ok, true, "keep only the pending leader active");
  const pruned = service.getHangMatchState(observer.session.token);
  assert.equal(pruned.ok, true);
  assert.equal(pruned.state.listings.some((listing) => listing.queueId === first.state.queueId), false);
  const revisionAfterPrune = pruned.state.stateRevision;

  releaseWrite.resolve();
  const committed = await pending;
  assert.equal(committed.ok, true, JSON.stringify(committed));
  const after = service.getHangMatchState(observer.session.token).state;
  assert.equal(after.listings.some((listing) => listing.queueId === first.state.queueId), false);
  assert.deepEqual(after.listings.map((listing) => listing.routeId), ["mistcap_growth"]);
  assert.ok(after.stateRevision > revisionAfterPrune);
  assert.equal(service.getHangMatchState(expiredLeader.session.token).state.status, "idle");
});

test("typed ambiguous COMMIT restores one exact matchmaking queue and replays it after restart", async () => {
  const base = createMemoryAuthStore();
  const seed = createMatchService({store: base}).service;
  const player = registerMatchPlayer(seed, "ambiguous", {matchQuest: true});
  const operation = durableJoinOperation("join_ambiguous_commit_0001", "3");
  let saveAttempts = 0;
  let receiptReads = 0;
  const rawStore = {
    mode: "mysql",
    load: () => base.load(),
    async readDurableMutationReceipt(operationId) {
      receiptReads += 1;
      return {
        schemaVersion: 1,
        operationId,
        authorityCurrent: false,
        receipt: structuredClone(base.load().mutationReceipts[operationId] || null),
      };
    },
    async saveAsyncOwned(nextData) {
      saveAttempts += 1;
      base.save(nextData);
      const error = new Error("commit acknowledgement lost");
      error.code = "mysql_commit_outcome_ambiguous";
      error.outcomeUnknown = true;
      throw error;
    },
  };
  const store = createAsyncWriteAuthStore(rawStore, {onError() {}});
  const service = createMatchService({store}).service;
  const replay = await service.invokeDurable(
    "joinHangMatchmaking",
    [player.session.token, joinPayload("join_ambiguous_commit_0001")],
    operation,
  );
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.state.replayed, true);
  assert.equal(saveAttempts, 1);
  assert.equal(receiptReads, 2, "one precheck miss plus one exact post-COMMIT proof");
  const persistedReceipt = base.load().mutationReceipts[operation.operationId];
  const persistedReceiptJson = JSON.stringify(persistedReceipt);
  assert.deepEqual(Object.keys(persistedReceipt.response.state).sort(), ["party", "schemaVersion", "target"]);
  assert.deepEqual(Object.keys(persistedReceipt.response.state.party).sort(), ["partyId", "schemaVersion"]);
  assert.equal(persistedReceiptJson.includes("matchmakingNpc"), false);
  assert.equal(persistedReceiptJson.includes(replay.state.queueId), false);
  assert.equal(persistedReceiptJson.includes("npcMembers"), false);
  assert.equal(persistedReceiptJson.includes("listings"), false);
  assert.equal(service.getHangMatchState(player.session.token).state.listings.length, 1);
  const profileRevision = service.getProfile(player.session.token).profileSummary.profileRevision;

  const restarted = createMatchService({store}).service;
  const restartedReplay = await restarted.invokeDurable(
    "joinHangMatchmaking",
    [player.session.token, joinPayload("join_ambiguous_commit_0001")],
    operation,
  );
  assert.equal(restartedReplay.ok, true, JSON.stringify(restartedReplay));
  assert.equal(restartedReplay.durableCommit.replayed, true);
  assert.equal(restartedReplay.state.replayed, true);
  assert.equal(restarted.getHangMatchState(player.session.token).state.listings.length, 1);
  assert.equal(restarted.getProfile(player.session.token).profileSummary.profileRevision, profileRevision);
  assert.equal(saveAttempts, 1, "restart replay must not execute or save the join again");
});

test("merged member exact replay restores the receipt-bound surviving party queue after acknowledgement loss", async () => {
  const base = createMemoryAuthStore();
  const seed = createMatchService({store: base}).service;
  const leader = registerMatchPlayer(seed, "mergedambiga");
  const joiningMember = registerMatchPlayer(seed, "mergedambigb", {matchQuest: true});
  let ambiguousNextSave = false;
  let saveAttempts = 0;
  const rawStore = {
    mode: "mysql",
    load: () => base.load(),
    async readDurableMutationReceipt(operationId) {
      return {
        schemaVersion: 1,
        operationId,
        authorityCurrent: false,
        receipt: structuredClone(base.load().mutationReceipts[operationId] || null),
      };
    },
    async saveAsyncOwned(nextData) {
      saveAttempts += 1;
      base.save(nextData);
      if (!ambiguousNextSave) {
        return;
      }
      ambiguousNextSave = false;
      const error = new Error("merged join commit acknowledgement lost");
      error.code = "mysql_commit_outcome_ambiguous";
      error.outcomeUnknown = true;
      throw error;
    },
  };
  const store = createAsyncWriteAuthStore(rawStore, {onError() {}});
  const matchRuntime = createMatchService({store});
  const service = matchRuntime.service;
  const leaderJoin = await service.invokeDurable(
    "joinHangMatchmaking",
    [leader.session.token, joinPayload("join_merged_ambig_a_0001")],
    durableJoinOperation("join_merged_ambig_a_0001", "4"),
  );
  assert.equal(leaderJoin.ok, true, JSON.stringify(leaderJoin));
  matchRuntime.advance(9_000);
  assert.equal(service.getHangMatchState(leader.session.token).state.npcCount, 4);
  ambiguousNextSave = true;
  const memberOperation = durableJoinOperation("join_merged_ambig_b_0001", "5");
  const memberReplay = await service.invokeDurable(
    "joinHangMatchmaking",
    [joiningMember.session.token, joinPayload("join_merged_ambig_b_0001")],
    memberOperation,
  );
  assert.equal(memberReplay.ok, true, JSON.stringify(memberReplay));
  assert.equal(memberReplay.durableCommit.replayed, true);
  assert.equal(memberReplay.state.replayed, true);
  assert.notEqual(memberReplay.state.queueId, "");
  assert.equal(memberReplay.state.party.partyId, leaderJoin.state.party.partyId);
  assert.equal(memberReplay.state.humanCount, 2);
  assert.equal(memberReplay.state.npcCount, 3);
  assert.equal(service.getHangMatchState(leader.session.token).state.listings.length, 1);
  const memberReceiptJson = JSON.stringify(base.load().mutationReceipts[memberOperation.operationId]);
  assert.equal(memberReceiptJson.includes("matchmakingNpc"), false);
  assert.equal(memberReceiptJson.includes(memberReplay.state.queueId), false);
  assert.equal(memberReceiptJson.includes("npcMembers"), false);
  assert.equal(memberReceiptJson.includes("listings"), false);
  const memberRevision = service.getProfile(joiningMember.session.token).profileSummary.profileRevision;

  const restarted = createMatchService({store}).service;
  assert.equal(restarted.getProfile(leader.session.token).ok, true, "the durable party leader reconnects first");
  const restartedMemberReplay = await restarted.invokeDurable(
    "joinHangMatchmaking",
    [joiningMember.session.token, joinPayload("join_merged_ambig_b_0001")],
    memberOperation,
  );
  assert.equal(restartedMemberReplay.ok, true, JSON.stringify(restartedMemberReplay));
  assert.equal(restartedMemberReplay.durableCommit.replayed, true);
  assert.equal(restartedMemberReplay.state.replayed, true);
  assert.equal(restartedMemberReplay.state.party.partyId, leaderJoin.state.party.partyId);
  assert.equal(restartedMemberReplay.state.humanCount, 2);
  assert.equal(restarted.getHangMatchState(leader.session.token).state.listings.length, 1);
  assert.equal(restarted.getProfile(joiningMember.session.token).profileSummary.profileRevision, memberRevision);
  assert.equal(saveAttempts, 2, "only the two original joins may reach the store");
});

test("offline non-leaders consume NPC soft slots in the next battle while an offline leader cancels matching", () => {
  const {service, advance} = createMatchService({npcFillDelayMs: 0});
  const leader = registerMatchPlayer(service, "offlinea", {pet: null});
  const member = registerMatchPlayer(service, "offlineb", {hangEnabled: false, pet: null});
  const invite = service.inviteToParty(leader.session.token, {username: member.account.username});
  assert.equal(invite.ok, true);
  assert.equal(service.acceptPartyInvite(member.session.token, invite.invite.inviteId).ok, true);
  const joined = service.joinHangMatchmaking(leader.session.token, joinPayload("join_offline_party_0001"));
  assert.equal(joined.ok, true, JSON.stringify(joined));
  assert.equal(joined.state.humanCount, 2);
  assert.equal(joined.state.npcCount, 3);

  advance(26_000);
  assert.equal(service.getProfile(leader.session.token).ok, true, "keep the leader online");
  const withOfflineMember = service.getHangMatchState(leader.session.token).state;
  assert.equal(withOfflineMember.queueId, joined.state.queueId);
  assert.equal(withOfflineMember.humanCount, 1);
  assert.equal(withOfflineMember.npcCount, 4);
  assert.equal(withOfflineMember.waitingPlayerCount, 1);
  assert.equal(service.updatePlayerPosition(leader.session.token, {
    mapId: "firebud_village_gate",
    cellX: 11,
    cellY: 15,
    moving: false,
  }).ok, true);
  const encounter = service.startPartyEncounter(leader.session.token, {
    encounterIntent: {zoneId: "village_grass", encounterGroupId: "firebud_grass_01"},
  });
  assert.equal(encounter.ok, true, JSON.stringify(encounter));
  assert.deepEqual(encounter.room.participantAccountIds, [leader.account.accountId]);
  assert.equal(encounter.room.battle.actors.filter((actor) => actor.matchmakingNpc).length, 8);

  advance(26_000);
  const cancelledForOfflineLeader = service.getHangMatchState(member.session.token).state;
  assert.equal(cancelledForOfflineLeader.status, "idle");
  assert.equal(cancelledForOfflineLeader.queueId, "");
  assert.equal(cancelledForOfflineLeader.listings.length, 0);
});

test("matchmaking battle injects paired runtime NPCs only, excludes legacy partners, and awards only real participants", () => {
  const {service} = createMatchService({npcFillDelayMs: 0});
  const legacyPartner = {
    partnerId: "retired_training_partner",
    name: "旧手工陪练不应参战",
    level: 99,
    hp: 9_999,
    maxHp: 9_999,
    attack: 9_999,
    defense: 9_999,
    quick: 9_999,
  };
  const player = registerMatchPlayer(service, "battle", {
    attack: 9_999,
    pet: null,
    trainingPartners: [legacyPartner],
  });
  assert.equal(service.updatePlayerPosition(player.session.token, {
    mapId: "firebud_village_gate",
    cellX: 11,
    cellY: 15,
    moving: false,
  }).ok, true);
  const joined = service.joinHangMatchmaking(player.session.token, joinPayload("join_battle_0001"));
  assert.equal(joined.ok, true);
  assert.equal(joined.state.npcCount, 4);

  const encounter = service.startPartyEncounter(player.session.token, {
    encounterIntent: {zoneId: "village_grass", encounterGroupId: "firebud_grass_01"},
  });
  assert.equal(encounter.ok, true, JSON.stringify(encounter));
  assert.equal(encounter.room.mode, "party_pve");
  assert.equal(encounter.room.participantAccountIds.length, 1);
  assert.equal(encounter.room.participants.length, 1);
  assert.equal(encounter.room.participants[0].teamSnapshot.trainingPartners.length, 0);
  assert.equal(encounter.room.battle.actors.some((actor) => actor.displayName === legacyPartner.name), false);
  const bots = encounter.room.battle.actors.filter((actor) => actor.matchmakingNpc);
  assert.equal(bots.length, 8);
  assert.equal(bots.filter((actor) => actor.kind === "player").length, 4);
  assert.equal(bots.filter((actor) => actor.kind === "pet").length, 4);
  assert.equal(bots.every((actor) => (
    actor.controller === "server_ai"
    && actor.rewardEligible === false
    && actor.accountId === ""
    && actor.ownerAccountId === ""
    && actor.partnerId === ""
  )), true);
  const realPlayer = encounter.room.battle.actors.find((actor) => actor.accountId === player.account.accountId && actor.kind === "player");
  const enemy = encounter.room.battle.actors.find((actor) => actor.side === "enemy");
  const resolved = service.submitBattleCommand(player.session.token, encounter.room.roomId, {
    round: 1,
    actorId: realPlayer.actorId,
    actionId: "attack",
    targetActorId: enemy.actorId,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.room.status, "closed");
  const writeback = resolved.room.battle.profileWriteback;
  assert.deepEqual(writeback.profiles.map((entry) => entry.accountId), [player.account.accountId]);
  assert.equal(JSON.stringify(writeback).includes("retired_training_partner"), false);
  assert.equal(JSON.stringify(writeback).includes("matchmakingNpc"), false);
});

test("frozen legacy rooms may render old partners but cannot settle their serialized EXP credits", () => {
  const accountId = "frozen_legacy_owner";
  const partner = {
    partnerId: "frozen_partner",
    name: "冻结陪练",
    level: 7,
    exp: 45,
    hp: 120,
    maxHp: 120,
    attack: 20,
    defense: 8,
    quick: 60,
    pet: {
      petId: "frozen_partner_pet",
      name: "冻结陪练宠",
      formId: "bui_normal_red_fire10",
      level: 6,
      exp: 33,
      hp: 90,
      maxHp: 90,
      attack: 16,
      defense: 7,
      quick: 58,
    },
  };
  const participant = {
    accountId,
    teamSnapshot: {player: {elements: {earth: 3, water: 3, fire: 2, wind: 2}}},
  };
  const actor = retiredPartnerBattle.battleTrainingPartnerActorFromSnapshot(participant, partner, 0, 3);
  const petActor = retiredPartnerBattle.battleTrainingPartnerPetActorFromSnapshot(
    participant,
    partner,
    partner.pet,
    0,
    3,
  );
  assert.equal(actor.displayName, partner.name);
  assert.equal(petActor.displayName, partner.pet.name);
  assert.equal(actor.legacyTrainingPartner, true);
  assert.equal(petActor.legacyTrainingPartner, true);
  assert.equal(actor.rewardEligible, false);
  assert.equal(petActor.rewardEligible, false);
  assert.equal(retiredPartnerBattle.battlePrimaryExpRecipientForActor({}, actor, {}), null);
  assert.equal(retiredPartnerBattle.battlePrimaryExpRecipientForActor({}, petActor, {}), null);

  const room = {mode: "party_pve", participantAccountIds: [accountId]};
  const battle = {
    actors: [actor, petActor],
    expCredits: [{
      recipients: [
        {type: "training_partner_player", accountId, partnerId: partner.partnerId, amount: 999, baseAmount: 999},
        {type: "training_partner_pet", accountId, partnerId: partner.partnerId, amount: 999, baseAmount: 999},
      ],
    }],
  };
  const reward = retiredPartnerBattle.battleExpRewardForProfile(room, battle, accountId);
  assert.equal(reward.amount, 0);
  assert.equal(reward.baseAmount, 0);
  assert.equal(reward.killCount, 0);
  assert.deepEqual(reward.trainingPartners, []);

  const profile = {player: {level: 8, exp: 0}, trainingPartners: [structuredClone(partner)]};
  const frozenBefore = structuredClone(profile.trainingPartners);
  const applied = retiredPartnerBattle.applyBattleExpRewardToProfile(profile, battle, accountId, {
    ...reward,
    amount: 1_998,
    baseAmount: 1_998,
    trainingPartners: [{
      partnerId: partner.partnerId,
      player: {amount: 999},
      pet: {amount: 999},
    }],
  });
  assert.equal(applied.changed, false);
  assert.deepEqual(applied.publicExp.trainingPartners, []);
  assert.deepEqual(profile.trainingPartners, frozenBefore);
});

test("HTTP endpoints use body idempotency keys and return the frozen state envelope", async (t) => {
  const backingStore = createMemoryAuthStore();
  const {service} = createMatchService({store: backingStore});
  const player = registerMatchPlayer(service, "http");
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await service.waitForDurableIdle();
    await new Promise((resolve) => server.close(resolve));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const missing = await fetchJson(`${baseUrl}/hang/match/join`, {
    method: "POST",
    headers: {authorization: `Bearer ${player.session.token}`},
    body: JSON.stringify({target: routeTarget("firebud_newbie")}),
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "idempotency_key_required");
  const joined = await fetchJson(`${baseUrl}/hang/match/join`, {
    method: "POST",
    headers: {authorization: `Bearer ${player.session.token}`},
    body: JSON.stringify(joinPayload("join_http_body_0001")),
  });
  assert.equal(joined.ok, true, JSON.stringify(joined));
  assert.equal(joined.state.active, true);
  assert.equal(joined.state.status, "matching");
  assert.equal(joined.state.schemaVersion, 1);
  assert.equal(Array.isArray(joined.state.npcMembers), true);
  assert.equal(Array.isArray(joined.state.listings), true);
  assert.equal(joined.state.replayed, false);
  assert.equal(joined.durableCommit.replayed, false);

  const replay = await fetchJson(`${baseUrl}/hang/match/join`, {
    method: "POST",
    headers: {authorization: `Bearer ${player.session.token}`},
    body: JSON.stringify(joinPayload("join_http_body_0001")),
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.state.queueId, joined.state.queueId);
  assert.equal(replay.state.replayed, true);
  assert.equal(replay.durableCommit.replayed, true);

  const state = await fetchJson(`${baseUrl}/hang/match/state`, {
    headers: {authorization: `Bearer ${player.session.token}`},
  });
  assert.equal(state.ok, true);
  assert.equal(state.state.queueId, joined.state.queueId);

  // A persisted join receipt must not replay a stale queue snapshot after a
  // process restart. It proves the durable party/quest commit and then rebuilds
  // only the new process's closure-owned queue.
  const restarted = createMatchService({store: backingStore}).service;
  const restartedServer = createHttpServer({service: restarted});
  restartedServer.listen(0, "127.0.0.1");
  await once(restartedServer, "listening");
  t.after(async () => {
    await restarted.waitForDurableIdle();
    await new Promise((resolve) => restartedServer.close(resolve));
  });
  const restartedBaseUrl = `http://127.0.0.1:${restartedServer.address().port}`;
  const restored = await fetchJson(`${restartedBaseUrl}/hang/match/join`, {
    method: "POST",
    headers: {authorization: `Bearer ${player.session.token}`},
    body: JSON.stringify(joinPayload("join_http_body_0001")),
  });
  assert.equal(restored.ok, true, JSON.stringify(restored));
  assert.equal(restored.state.replayed, true);
  assert.equal(restored.state.active, true);
  assert.equal(restored.state.humanCount, 1);
  assert.notEqual(restored.state.queueId, "");
  assert.equal(restored.durableCommit.replayed, true);

  const cancelled = await fetchJson(`${baseUrl}/hang/match/cancel`, {
    method: "POST",
    headers: {authorization: `Bearer ${player.session.token}`},
    body: JSON.stringify({idempotencyKey: "cancel_http_body_0001", reason: "manual"}),
  });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.state.status, "cancelled");
  assert.equal(cancelled.state.replayed, false);
});
