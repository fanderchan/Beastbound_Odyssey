"use strict";

const {
  assert,
  test,
  once,
  createAuthService,
  createMemoryAuthStore,
  createAsyncWriteAuthStore,
  createHttpServer,
  CLIENT_PROTOCOL_HEADER,
  CLIENT_VERSION_HEADER,
  PROTOCOL_VERSION,
  SERVER_VERSION,
  battleProfile,
  fetchJson,
  eventStreamUrl,
  eventStreamProtocols,
  webSocketOpen,
  webSocketJsonReader,
  profileItemCount,
} = require("../test-support/auth-service-test-context");
const {drainServerForShutdown} = require("../src/http-server");
const {
  RUNTIME_ROOT_FIELDS,
  captureRuntimeRootDelta,
  canonicalDurableMutationReceipts,
  durableBusinessChanged,
  mergeRuntimeObjectDelta,
} = require("../src/auth/durable-mutation-state");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return {promise, resolve, reject};
}

function assertPostcommitPublishMetrics(metrics, {count = 1, persistent = false} = {}) {
  assert.equal(metrics.count, count);
  assert.equal(Number.isFinite(metrics.averageMs), true);
  assert.equal(Number.isFinite(metrics.maxMs), true);
  assert.ok(metrics.averageMs >= 0);
  assert.ok(metrics.maxMs >= 0);
  for (const phase of [
    "authority_publish",
    "rollback_baseline",
    "runtime_effects",
    "maintenance_schedule",
    "service_event_publish",
  ]) {
    assert.equal(metrics.phases[phase].count, count, phase);
    assert.equal(Number.isFinite(metrics.phases[phase].averageMs), true, phase);
    assert.equal(Number.isFinite(metrics.phases[phase].maxMs), true, phase);
  }
  assert.equal(
    Object.hasOwn(metrics.phases, "large_collection_commit"),
    persistent,
  );
  if (persistent) {
    assert.equal(metrics.phases.large_collection_commit.count, count);
  }
}

function trackingBattleRandomAuthority() {
  const rooms = new Set();
  return Object.freeze({
    openRoom(roomId) {
      const id = String(roomId || "");
      if (id === "" || rooms.has(id)) return false;
      rooms.add(id);
      return true;
    },
    closeRoom(roomId) {
      return rooms.delete(String(roomId || ""));
    },
    hasRoom(roomId) {
      return rooms.has(String(roomId || ""));
    },
    roll(roomId) {
      assert.equal(rooms.has(String(roomId || "")), true);
      return 0.9999;
    },
    index(roomId, context, size) {
      void context;
      const count = Math.max(1, Math.trunc(Number(size || 0)));
      return Math.min(count - 1, Math.floor(this.roll(roomId) * count));
    },
  });
}

function deepFreezeTestValue(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreezeTestValue(child);
  }
  return Object.freeze(value);
}

function freezeDurableProjectionRoot(value) {
  for (const [key, child] of Object.entries(value)) {
    // The canonical receipt ledger is an immutable Proxy. Object.freeze()
    // cannot be applied to it because its traps deliberately reject extension
    // changes, so retain that production immutability contract as-is.
    if (key !== "mutationReceipts") {
      deepFreezeTestValue(child);
    }
  }
  return Object.freeze(value);
}

test("durable comparison mutates only its shallow projection of frozen authority roots", () => {
  const receipts = canonicalDurableMutationReceipts({});
  const before = freezeDurableProjectionRoot({
    profiles: {
      player_frozen_projection: {
        profileRevision: 1,
        profile: {stoneCoins: 20, backpackSlots: [{itemId: "item_meat_small", count: 1}]},
      },
    },
    playerPositions: {acc_frozen_projection: {mapId: "map_a", cellX: 10, cellY: 10}},
    battleTrace: [{traceId: "trace_frozen_projection"}],
    serviceEventSeq: 9,
    serviceEvents: [{eventSeq: 9, type: "chat.message", message: {text: "只读事件"}}],
    consumedEquipmentEnvelopes: {},
    mutationReceipts: receipts,
  });
  const candidate = freezeDurableProjectionRoot({
    ...before,
    profiles: {
      player_frozen_projection: {
        profileRevision: 2,
        profile: {stoneCoins: 12, backpackSlots: [{itemId: "item_meat_small", count: 2}]},
      },
    },
  });
  const beforeJson = JSON.stringify(before);
  const candidateJson = JSON.stringify(candidate);
  const options = {
    persistentDataForStore(data) {
      const projection = {...data};
      projection.playerPositions = {};
      projection.serviceEvents = data.serviceEvents.filter((event) => !String(event.type || "").startsWith("battle."));
      return projection;
    },
    normalizeEventSeq: (value) => Math.max(0, Math.trunc(Number(value || 0))),
    consumedEquipmentEnvelopeLedgerSignature: () => "equipment-ledger:frozen",
  };

  assert.equal(durableBusinessChanged(before, before, options), false);
  assert.equal(durableBusinessChanged(before, candidate, options), true);
  assert.equal(JSON.stringify(before), beforeJson);
  assert.equal(JSON.stringify(candidate), candidateJson);
  assert.equal(Object.isFrozen(before.battleTrace), true);
  assert.equal(Object.isFrozen(candidate.profiles.player_frozen_projection.profile.backpackSlots[0]), true);
});

test("runtime battle replay eviction defers durable journal retention until a real durable event", () => {
  const receipts = canonicalDurableMutationReceipts({});
  const firstChat = deepFreezeTestValue({eventSeq: 7, type: "chat.message", message: {text: "旧消息"}});
  const secondChat = deepFreezeTestValue({eventSeq: 8, type: "chat.message", message: {text: "保留消息"}});
  const battleEvent = deepFreezeTestValue({eventSeq: 9, type: "battle.command_submitted", roomId: "room_runtime"});
  const newChat = deepFreezeTestValue({eventSeq: 10, type: "chat.message", message: {text: "新消息"}});
  const before = freezeDurableProjectionRoot({
    profiles: {},
    battleTrace: [],
    serviceEventSeq: 8,
    serviceEvents: [firstChat, secondChat],
    consumedEquipmentEnvelopes: {},
    mutationReceipts: receipts,
  });
  const runtimeEviction = freezeDurableProjectionRoot({
    ...before,
    serviceEventSeq: 9,
    serviceEvents: [secondChat, battleEvent],
  });
  const durableAppend = freezeDurableProjectionRoot({
    ...before,
    serviceEventSeq: 10,
    serviceEvents: [secondChat, battleEvent, newChat],
  });
  const mutatedDurableTail = freezeDurableProjectionRoot({
    ...before,
    serviceEvents: [{...secondChat, message: {text: "被篡改"}}, battleEvent],
  });
  const reorderedDurableTail = freezeDurableProjectionRoot({
    ...before,
    serviceEvents: [secondChat, firstChat, battleEvent],
  });
  const options = {
    persistentDataForStore(data) {
      const projection = {...data};
      projection.serviceEvents = data.serviceEvents.filter((event) => !String(event.type || "").startsWith("battle."));
      return projection;
    },
    normalizeEventSeq: (value) => Math.max(0, Math.trunc(Number(value || 0))),
    consumedEquipmentEnvelopeLedgerSignature: () => "equipment-ledger:replay-retention",
  };

  assert.equal(durableBusinessChanged(before, runtimeEviction, options), false);
  assert.equal(durableBusinessChanged(before, durableAppend, options), true);
  assert.equal(durableBusinessChanged(before, mutatedDurableTail, options), true);
  assert.equal(durableBusinessChanged(before, reorderedDurableTail, options), true);
});

test("pre-commit runtime delta preserves live changes and applies only candidate-touched keys", () => {
  const before = {
    playerPositions: {
      acc_conflict: {mapId: "map_a", cellX: 1, cellY: 1},
      acc_current_delete: {mapId: "map_a", cellX: 2, cellY: 2},
    },
    battleRooms: {
      room_live: {
        roomId: "room_live",
        connectionState: {acc_live: {connected: true}},
      },
    },
    tradeOffers: {
      offer_candidate_delete: {tradeId: "offer_candidate_delete", amount: 1},
      offer_current_delete: {tradeId: "offer_current_delete", amount: 2},
    },
  };
  const candidate = structuredClone(before);
  candidate.playerPositions.acc_conflict = {mapId: "map_a", cellX: 3, cellY: 1};
  candidate.playerPositions.acc_candidate_add = {mapId: "map_b", cellX: 4, cellY: 4};
  delete candidate.tradeOffers.offer_candidate_delete;

  const delta = captureRuntimeRootDelta(before, candidate);
  const current = structuredClone(before);
  current.playerPositions.acc_conflict = {mapId: "map_a", cellX: 99, cellY: 99};
  current.playerPositions.acc_current_add = {mapId: "map_c", cellX: 5, cellY: 5};
  delete current.playerPositions.acc_current_delete;
  current.battleRooms.room_live.connectionState.acc_live.connected = false;
  delete current.tradeOffers.offer_current_delete;
  current.tradeOffers.offer_current_add = {tradeId: "offer_current_add", amount: 3};

  const merged = {};
  for (const field of RUNTIME_ROOT_FIELDS) {
    merged[field] = mergeRuntimeObjectDelta(delta[field], current[field]);
  }

  assert.deepEqual(merged.playerPositions.acc_conflict, {
    mapId: "map_a", cellX: 3, cellY: 1,
  });
  assert.deepEqual(merged.playerPositions.acc_candidate_add, {
    mapId: "map_b", cellX: 4, cellY: 4,
  });
  assert.deepEqual(merged.playerPositions.acc_current_add, {
    mapId: "map_c", cellX: 5, cellY: 5,
  });
  assert.equal(merged.playerPositions.acc_current_delete, undefined);
  assert.equal(merged.battleRooms.room_live.connectionState.acc_live.connected, false);
  assert.equal(merged.tradeOffers.offer_candidate_delete, undefined);
  assert.equal(merged.tradeOffers.offer_current_delete, undefined);
  assert.deepEqual(merged.tradeOffers.offer_current_add, {
    tradeId: "offer_current_add", amount: 3,
  });
  assert.equal(merged.battleRooms, current.battleRooms);
  assert.notEqual(merged.playerPositions, current.playerPositions);
  assert.notEqual(merged.tradeOffers, current.tradeOffers);
});

function seedShopAccount(base, username) {
  const seedService = createAuthService({store: base});
  const registered = seedService.register({
    username,
    password: "test1234",
    displayName: username,
  });
  const profile = battleProfile(username, {level: 1, hp: 120, maxHp: 120}, null);
  profile.stoneCoins = 20;
  profile.backpackSlots = Array.from({length: 15}, () => ({}));
  assert.equal(seedService.saveProfile(registered.session.token, {
    expectedRevision: 0,
    profile,
  }).ok, true);
  return registered;
}

function seedEquipmentBankAccount(base, username) {
  const service = createAuthService({store: base});
  const registered = service.register({
    username,
    password: "test1234",
    displayName: username,
  });
  const current = service.getProfile(registered.session.token);
  const profile = current.profile;
  profile.backpackSlots = [
    {itemId: "weapon_wooden_club", count: 1},
    ...Array.from({length: 14}, () => ({})),
  ];
  profile.equipmentInstances = {
    equip_durable_journal_0001: {
      schemaVersion: 1,
      instanceId: "equip_durable_journal_0001",
      itemId: "weapon_wooden_club",
      location: "backpack",
      slotId: "",
      durability: 30,
      enhancement: {itemId: "weapon_wooden_club", level: 2, history: []},
      wearCounters: {itemId: "weapon_wooden_club", attackCount: 0, hitCount: 0},
      expPillCharge: {},
      source: "durable_journal_test",
    },
  };
  profile.equipmentSlotInstanceIds = {};
  profile.equipmentSlotsVersion = 5;
  profile.nextEquipmentInstanceSerial = 2;
  assert.equal(service.saveProfile(registered.session.token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile,
  }).ok, true);
  const deposited = service.bankDeposit(registered.session.token, {
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      instanceId: "equip_durable_journal_0001",
      sourceSlotIndex: 0,
      bankSlotIndex: 1,
    }],
  });
  assert.equal(deposited.ok, true);
  return {
    ...registered,
    envelopeId: deposited.bank.slots[1].equipmentEnvelopes[0].envelopeId,
  };
}

async function listen(service) {
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

async function closeHarness(harness, service) {
  await service.waitForDurableIdle();
  if (!harness.server.listening) {
    return;
  }
  await new Promise((resolve) => harness.server.close(resolve));
}

function shopRequest(baseUrl, token, operationId, amount = 1) {
  return fetchJson(`${baseUrl}/shops/transaction`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "Idempotency-Key": operationId,
    },
    body: JSON.stringify({
      mode: "buy",
      shopId: "firebud_item_shop",
      itemId: "item_meat_small",
      amount,
    }),
  });
}

test("asset HTTP success and service event stay pending until the owning commit", async (t) => {
  const base = createMemoryAuthStore();
  const registered = seedShopAccount(base, "durablegate");
  const writeStarted = deferred();
  const releaseWrite = deferred();
  let saveCount = 0;
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      saveCount += 1;
      writeStarted.resolve();
      await releaseWrite.promise;
      base.save(nextData);
    },
  }, {onError: () => {}});
  const service = createAuthService({store});
  const events = [];
  service.onEvent((event) => events.push(event));
  const harness = await listen(service);
  t.after(() => closeHarness(harness, service));

  let responseSettled = false;
  const responsePromise = fetchJson(`${harness.baseUrl}/chat/send`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${registered.session.token}`,
      "Idempotency-Key": "bbo_chat_commit_gate_0001",
    },
    body: JSON.stringify({channel: "nearby", text: "提交后再广播"}),
  }).then((response) => {
    responseSettled = true;
    return response;
  });

  await writeStarted.promise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(responseSettled, false);
  assert.equal(events.length, 0);
  assert.equal(base.load().chatMessages.length, 0);

  releaseWrite.resolve();
  const response = await responsePromise;
  assert.equal(response.ok, true);
  assert.equal(response.durableCommit.replayed, false);
  assert.equal(saveCount, 1);
  assert.equal(base.load().chatMessages.length, 1);
  assert.equal(events.filter((event) => event.type === "chat.message").length, 1);
  const publishMetrics = service.durableMutationMetrics();
  assert.equal(publishMetrics.postcommitCount, 1);
  assert.equal(Number.isFinite(publishMetrics.postcommitAverageMs), true);
  assert.equal(Number.isFinite(publishMetrics.postcommitMaxMs), true);
  assertPostcommitPublishMetrics(publishMetrics.postcommitByMethod.sendChatMessage, {persistent: true});
});

test("auth responses wait for durability without persisting raw session tokens in receipts", async (t) => {
  const base = createMemoryAuthStore();
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  const harness = await listen(service);
  t.after(() => closeHarness(harness, service));
  const registered = await fetchJson(`${harness.baseUrl}/auth/register`, {
    method: "POST",
    headers: {"Idempotency-Key": "bbo_auth_token_exclusion_0001"},
    body: JSON.stringify({username: "durableauthsafe", password: "test1234", displayName: "安全认证"}),
  });
  assert.equal(registered.ok, true);
  assert.equal(typeof registered.session.token, "string");
  assert.equal(Object.keys(base.load().mutationReceipts).length, 0);
});

test("runtime battle invitation does not open a durable store transaction", async (t) => {
  const base = createMemoryAuthStore();
  const seedService = createAuthService({store: base});
  const challenger = seedService.register({username: "runtimeinvitea", password: "test1234", displayName: "邀请A"});
  const opponent = seedService.register({username: "runtimeinviteb", password: "test1234", displayName: "邀请B"});
  assert.equal(seedService.updatePlayerPosition(challenger.session.token, {
    mapId: "firebud_village_gate", cellX: 10, cellY: 10,
  }).ok, true);
  assert.equal(seedService.updatePlayerPosition(opponent.session.token, {
    mapId: "firebud_village_gate", cellX: 11, cellY: 10,
  }).ok, true);
  const fullReplayWindow = base.load();
  fullReplayWindow.serviceEventSeq = 500;
  fullReplayWindow.serviceEvents = Array.from({length: 500}, (_, index) => ({
    eventId: `server_event_${index + 1}`,
    eventSeq: index + 1,
    type: "chat.message",
    message: {channel: "nearby", text: `历史消息${index + 1}`},
    schemaVersion: 1,
  }));
  base.save(fullReplayWindow);
  let receiptReadCount = 0;
  let saveCount = 0;
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async readDurableMutationReceipt(operationId) {
        receiptReadCount += 1;
        return {schemaVersion: 1, operationId, authorityCurrent: true, receipt: null};
      },
      async saveAsync(nextData) {
        saveCount += 1;
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  const harness = await listen(service);
  t.after(() => closeHarness(harness, service));

  const challengerPosition = await fetchJson(`${harness.baseUrl}/players/position`, {
    method: "POST",
    headers: {authorization: `Bearer ${challenger.session.token}`},
    body: JSON.stringify({mapId: "firebud_village_gate", cellX: 10, cellY: 10}),
  });
  const opponentPosition = await fetchJson(`${harness.baseUrl}/players/position`, {
    method: "POST",
    headers: {authorization: `Bearer ${opponent.session.token}`},
    body: JSON.stringify({mapId: "firebud_village_gate", cellX: 11, cellY: 10}),
  });
  assert.equal(challengerPosition.ok, true);
  assert.equal(opponentPosition.ok, true);
  assert.equal(saveCount, 0);

  const invited = await fetchJson(`${harness.baseUrl}/battle/invite`, {
    method: "POST",
    headers: {authorization: `Bearer ${challenger.session.token}`},
    body: JSON.stringify({username: "runtimeinviteb"}),
  });
  assert.equal(invited.ok, true);
  assert.equal(saveCount, 0);

  const accepted = await fetchJson(`${harness.baseUrl}/battle/invites/${encodeURIComponent(invited.invite.inviteId)}/accept`, {
    method: "POST",
    headers: {authorization: `Bearer ${opponent.session.token}`},
  });
  assert.equal(accepted.ok, true);
  assert.equal(saveCount, 0);

  const intermediate = await service.invokeDurable("submitBattleCommand", [
    challenger.session.token,
    accepted.room.roomId,
    {round: 1, actionId: "defend"},
  ], {
    operationId: "bbo_runtime_battle_no_receipt_read_0001",
    requestHash: "9".repeat(64),
    actionId: "test_runtime_battle_command",
  });
  assert.equal(intermediate.ok, true);
  assert.equal(intermediate.turn, null);
  assert.equal(saveCount, 0);
  assert.equal(receiptReadCount, 0);

  intermediate.room.status = "corrupted_by_caller";
  intermediate.room.battle.actors[0].hp = 0;
  const authoritativeRoom = service.snapshot().battleRooms[accepted.room.roomId];
  assert.equal(authoritativeRoom.status, "ready");
  assert.ok(authoritativeRoom.battle.actors[0].hp > 0);
  const submitMetrics = service.durableMutationMetrics().precommitByMethod.submitBattleCommand;
  assert.equal(submitMetrics.count, 1);
  assert.equal(submitMetrics.phases.raw_compare.count, 1);
  assert.equal(submitMetrics.phases.runtime_normalize.count, 1);
  for (const phase of [
    "runtime_service_events",
    "runtime_service_events_scan",
    "runtime_service_events_canonicalize",
    "runtime_service_events_freeze",
    "runtime_player_positions",
    "runtime_battle_rooms",
    "runtime_battle_recoveries",
    "runtime_battle_trace",
    "runtime_candidate_trust",
  ]) {
    assert.equal(submitMetrics.phases[phase].count, 1, phase);
  }
  assert.equal(Object.hasOwn(submitMetrics.phases, "normalize"), false);
  assertPostcommitPublishMetrics(
    service.durableMutationMetrics().postcommitByMethod.submitBattleCommand,
  );

  const durableChat = await service.invokeDurable("sendChatMessage", [
    challenger.session.token,
    {channel: "nearby", text: "真实持久消息"},
  ], {actionId: "test_runtime_replay_retention_flush"});
  assert.equal(durableChat.ok, true);
  assert.equal(saveCount, 1);
  const persistedEvents = base.load().serviceEvents;
  assert.equal(persistedEvents.some((event) => String(event.type || "").startsWith("battle.")), false);
  assert.equal(persistedEvents.some((event) => event.message && event.message.text === "真实持久消息"), true);
  assert.equal(Number(persistedEvents[0] && persistedEvents[0].eventSeq || 0) > 1, true);
});

test("runtime fast candidate matches the full normalizer for all runtime roots and journals", async () => {
  const nowMs = Date.parse("2026-07-13T00:00:00.000Z");
  const source = createMemoryAuthStore();
  const seed = createAuthService({store: source, now: () => nowMs});
  const challenger = seed.register({username: "runtimeequiva", password: "test1234", displayName: "等价甲"});
  const opponent = seed.register({username: "runtimeequivb", password: "test1234", displayName: "等价乙"});
  const createService = () => {
    const base = createMemoryAuthStore(source.load());
    let saveCount = 0;
    const service = createAuthService({
      now: () => nowMs,
      randomId: () => "runtime_equivalence_fixed_id",
      randomBytes: (size) => Buffer.alloc(size, 7),
      store: createAsyncWriteAuthStore({
        mode: "memory",
        load: () => base.load(),
        async saveAsync(nextData) {
          saveCount += 1;
          base.save(nextData);
        },
      }, {onError: () => {}}),
    });
    for (const [registration, cellX] of [[challenger, 10], [opponent, 11]]) {
      assert.equal(service.updatePlayerPosition(registration.session.token, {
        mapId: "firebud_village_gate", cellX, cellY: 10,
      }).ok, true);
    }
    return {service, saveCount: () => saveCount};
  };
  const fast = createService();
  const fallback = createService();
  const fastInvite = await fast.service.invokeDurable("inviteToBattle", [
    challenger.session.token, {username: opponent.account.username},
  ], {actionId: "test_runtime_equivalence_invite"});
  const fallbackInvite = await fallback.service.invokeDurable("inviteToBattle", [
    challenger.session.token, {username: opponent.account.username},
  ], {actionId: "test_runtime_equivalence_invite"});
  assert.equal(fastInvite.ok, true);
  assert.equal(fallbackInvite.ok, true);

  const originalAccept = fallback.service.acceptBattleInvite;
  const originalFilter = Array.prototype.filter;
  let projectionFailureArmed = false;
  let projectionFailureObserved = false;
  fallback.service.acceptBattleInvite = (...args) => {
    const result = originalAccept(...args);
    projectionFailureArmed = true;
    return result;
  };
  Array.prototype.filter = function patchedFilter(...args) {
    if (projectionFailureArmed && !projectionFailureObserved) {
      projectionFailureObserved = true;
      throw new Error("synthetic raw durable projection failure");
    }
    return Reflect.apply(originalFilter, this, args);
  };
  let fallbackAccepted;
  try {
    const fastAccepted = await fast.service.invokeDurable("acceptBattleInvite", [
      opponent.session.token, fastInvite.invite.inviteId,
    ], {actionId: "test_runtime_equivalence_accept"});
    fallbackAccepted = await fallback.service.invokeDurable("acceptBattleInvite", [
      opponent.session.token, fallbackInvite.invite.inviteId,
    ], {actionId: "test_runtime_equivalence_accept"});
    assert.equal(fastAccepted.ok, true);
    assert.equal(fallbackAccepted.ok, true);
  } finally {
    Array.prototype.filter = originalFilter;
    fallback.service.acceptBattleInvite = originalAccept;
  }
  assert.equal(projectionFailureObserved, true);
  assert.equal(fast.saveCount(), 0);
  assert.equal(fallback.saveCount(), 0);
  const fastSnapshot = fast.service.snapshot();
  const fallbackSnapshot = fallback.service.snapshot();
  for (const field of RUNTIME_ROOT_FIELDS) {
    assert.deepEqual(fallbackSnapshot[field], fastSnapshot[field], field);
  }
  assert.deepEqual(
    fallbackSnapshot.battleTrace.map(({traceId, ...entry}) => entry),
    fastSnapshot.battleTrace.map(({traceId, ...entry}) => entry),
  );
  assert.equal(fallbackSnapshot.serviceEventSeq, fastSnapshot.serviceEventSeq);
  assert.deepEqual(fallbackSnapshot.serviceEvents, fastSnapshot.serviceEvents);
  const fastMetrics = fast.service.durableMutationMetrics().precommitByMethod.acceptBattleInvite;
  const fallbackMetrics = fallback.service.durableMutationMetrics().precommitByMethod.acceptBattleInvite;
  assert.equal(fastMetrics.phases.runtime_normalize.count, 1);
  assert.equal(Object.hasOwn(fastMetrics.phases, "normalize"), false);
  assert.equal(fallbackMetrics.phases.raw_compare.count, 1);
  assert.equal(fallbackMetrics.phases.normalize.count, 1);
  assert.equal(Object.hasOwn(fallbackMetrics.phases, "runtime_normalize"), false);
});

test("runtime replay and trace survive uncovered async mutation rollback", async () => {
  const nowMs = Date.parse("2026-07-13T00:00:00.000Z");
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base, now: () => nowMs});
  const challenger = seed.register({username: "rollbackjournala", password: "test1234", displayName: "回滚甲"});
  const opponent = seed.register({username: "rollbackjournalb", password: "test1234", displayName: "回滚乙"});
  const service = createAuthService({
    now: () => nowMs,
    randomId: () => "rollback_journal_fixed_id",
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  assert.equal(service.updatePlayerPosition(challenger.session.token, {
    mapId: "firebud_village_gate", cellX: 10, cellY: 10,
  }).ok, true);
  assert.equal(service.updatePlayerPosition(opponent.session.token, {
    mapId: "firebud_village_gate", cellX: 11, cellY: 10,
  }).ok, true);
  const invited = await service.invokeDurable("inviteToBattle", [
    challenger.session.token, {username: opponent.account.username},
  ], {actionId: "test_rollback_journal_invite"});
  const accepted = await service.invokeDurable("acceptBattleInvite", [
    opponent.session.token, invited.invite.inviteId,
  ], {actionId: "test_rollback_journal_accept"});
  assert.equal(accepted.ok, true);
  const before = service.snapshot();
  assert.ok(before.battleTrace.length > 0);
  assert.ok(before.serviceEvents.length > 0);
  assert.throws(() => service.grantGm({
    username: challenger.account.username,
    commandIds: ["gm_prepare_qa_profile"],
    policyId: "rollback_journal_test",
    expiresAt: new Date(nowMs + 60_000).toISOString(),
  }), (error) => error && error.code === "durable_context_required");
  const after = service.snapshot();
  assert.deepEqual(after.battleTrace, before.battleTrace);
  assert.deepEqual(after.serviceEvents, before.serviceEvents);
  assert.equal(after.serviceEventSeq, before.serviceEventSeq);
  assert.equal(after.accounts[challenger.account.username].role, "player");
});

test("battle random secret closes only after the terminal COMMIT succeeds", async () => {
  const nowMs = Date.parse("2026-07-13T00:00:00.000Z");
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base, now: () => nowMs});
  const challenger = seed.register({username: "rngcommita", password: "test1234", displayName: "随机甲"});
  const opponent = seed.register({username: "rngcommitb", password: "test1234", displayName: "随机乙"});
  const authority = trackingBattleRandomAuthority();
  let saveAttempts = 0;
  let rejectNextSave = true;
  const service = createAuthService({
    now: () => nowMs,
    randomId: () => "rng_commit_fixed_id",
    battleRandomAuthority: authority,
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        saveAttempts += 1;
        if (rejectNextSave) {
          rejectNextSave = false;
          throw new Error("synthetic terminal commit failure");
        }
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  assert.equal(service.updatePlayerPosition(challenger.session.token, {
    mapId: "firebud_village_gate", cellX: 10, cellY: 10,
  }).ok, true);
  assert.equal(service.updatePlayerPosition(opponent.session.token, {
    mapId: "firebud_village_gate", cellX: 11, cellY: 10,
  }).ok, true);
  const invited = await service.invokeDurable("inviteToBattle", [
    challenger.session.token, {username: opponent.account.username},
  ], {actionId: "test_rng_commit_invite"});
  const accepted = await service.invokeDurable("acceptBattleInvite", [
    opponent.session.token, invited.invite.inviteId,
  ], {actionId: "test_rng_commit_accept"});
  const roomId = accepted.room.roomId;
  const runtimeBeforeFailedCommit = service.snapshot();
  assert.ok(runtimeBeforeFailedCommit.battleTrace.length > 0);
  assert.ok(runtimeBeforeFailedCommit.serviceEvents.length > 0);
  assert.equal(authority.hasRoom(roomId), true);
  await assert.rejects(
    service.invokeDurable("leaveBattleRoom", [challenger.session.token, roomId], {
      actionId: "test_rng_commit_leave_failed",
    }),
    (error) => error && error.code === "storage_write_failed",
  );
  assert.equal(saveAttempts, 1);
  assert.equal(authority.hasRoom(roomId), true);
  assert.equal(base.load().battleRecords.some((record) => record.roomId === roomId), false);
  const refreshed = await service.invokeDurable("getProfile", [challenger.session.token], {
    actionId: "test_rng_commit_reload_after_failure",
  });
  assert.equal(refreshed.ok, true);
  const runtimeAfterReload = service.snapshot();
  assert.deepEqual(runtimeAfterReload.battleTrace, runtimeBeforeFailedCommit.battleTrace);
  assert.deepEqual(runtimeAfterReload.serviceEvents, runtimeBeforeFailedCommit.serviceEvents);
  assert.equal(runtimeAfterReload.serviceEventSeq, runtimeBeforeFailedCommit.serviceEventSeq);
  assert.equal(saveAttempts, 1);
  const retried = await service.invokeDurable("leaveBattleRoom", [challenger.session.token, roomId], {
    actionId: "test_rng_commit_leave_retry",
  });
  assert.equal(retried.ok, true);
  assert.equal(saveAttempts, 2);
  assert.equal(authority.hasRoom(roomId), false);
  assert.equal(base.load().battleRecords.some((record) => record.roomId === roomId), true);
});

test("terminal battle command falls back from raw comparison to durable victory settlement", async () => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const challenger = seed.register({username: "durablevictorya", password: "test1234", displayName: "终局甲"});
  const opponent = seed.register({username: "durablevictoryb", password: "test1234", displayName: "终局乙"});
  assert.equal(seed.saveProfile(challenger.session.token, {
    expectedRevision: 0,
    profile: battleProfile("终局甲", {
      level: 5, hp: 120, maxHp: 120, attack: 999, defense: 10, quick: 999,
    }, null),
  }).ok, true);
  assert.equal(seed.saveProfile(opponent.session.token, {
    expectedRevision: 0,
    profile: battleProfile("终局乙", {
      level: 5, hp: 1, maxHp: 1, attack: 1, defense: 1, quick: 1,
    }, null),
  }).ok, true);

  let saveCount = 0;
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        saveCount += 1;
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  assert.equal(service.updatePlayerPosition(challenger.session.token, {
    mapId: "firebud_village_gate", cellX: 10, cellY: 10,
  }).ok, true);
  assert.equal(service.updatePlayerPosition(opponent.session.token, {
    mapId: "firebud_village_gate", cellX: 11, cellY: 10,
  }).ok, true);
  const invited = await service.invokeDurable("inviteToBattle", [
    challenger.session.token,
    {username: opponent.account.username},
  ], {actionId: "test_terminal_victory_invite"});
  assert.equal(invited.ok, true);
  const accepted = await service.invokeDurable("acceptBattleInvite", [
    opponent.session.token,
    invited.invite.inviteId,
  ], {actionId: "test_terminal_victory_accept"});
  assert.equal(accepted.ok, true);
  assert.equal(saveCount, 0);
  const challengerActor = accepted.room.battle.actors.find((actor) => actor.accountId === challenger.account.accountId);
  const opponentActor = accepted.room.battle.actors.find((actor) => actor.accountId === opponent.account.accountId);
  const first = await service.invokeDurable("submitBattleCommand", [
    challenger.session.token,
    accepted.room.roomId,
    {round: 1, actorId: challengerActor.actorId, actionId: "attack", targetActorId: opponentActor.actorId},
  ], {actionId: "test_terminal_victory_attack"});
  assert.equal(first.ok, true);
  assert.equal(first.turn, null);
  assert.equal(saveCount, 0);
  const terminal = await service.invokeDurable("submitBattleCommand", [
    opponent.session.token,
    accepted.room.roomId,
    {round: 1, actorId: opponentActor.actorId, actionId: "defend"},
  ], {actionId: "test_terminal_victory_defend"});
  assert.equal(terminal.ok, true);
  assert.equal(terminal.room.status, "closed");
  assert.equal(saveCount, 1);
  assert.equal(base.load().battleRecords.some((record) => record.roomId === accepted.room.roomId), true);

  const metrics = service.durableMutationMetrics().precommitByMethod.submitBattleCommand;
  assert.equal(metrics.count, 2);
  assert.equal(metrics.phases.raw_compare.count, 2);
  assert.equal(metrics.phases.runtime_normalize.count, 1);
  assert.equal(metrics.phases.normalize.count, 1);
});

test("successful capture command durably writes the pet and consumed tool", async () => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const player = seed.register({username: "durablecapture", password: "test1234", displayName: "持久捕捉号"});
  const profile = battleProfile("持久捕捉号", {
    level: 5, hp: 120, maxHp: 120, attack: 20, defense: 8, quick: 90,
  }, null);
  profile.backpackSlots = [{itemId: "capture_net", count: 1}];
  profile.captureTools = {capture_net: 1};
  assert.equal(seed.saveProfile(player.session.token, {expectedRevision: 0, profile}).ok, true);

  let saveCount = 0;
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        saveCount += 1;
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  const encounter = await service.invokeDurable("startPartyEncounter", [player.session.token, {
    enemyCount: 1,
    encounterZone: {
      id: "durable_capture_grass",
      name: "持久捕捉草丛",
      formationTemplate: "10v10",
      selectedWildPet: {
        formId: "wuli_normal_orange_fire10",
        name: "持久捕捉乌力",
        level: 3,
        catchable: true,
        captureDifficulty: 1,
        captureChanceOverride: 1,
        battleStats: {maxHp: 80, attack: 1, defense: 1, quick: 10},
      },
    },
  }], {actionId: "test_durable_capture_encounter"});
  assert.equal(encounter.ok, true);
  assert.equal(saveCount, 0);
  const playerActor = encounter.room.battle.actors.find((actor) => actor.accountId === player.account.accountId);
  const enemyActor = encounter.room.battle.actors.find((actor) => actor.side === "enemy");
  const captured = await service.invokeDurable("submitBattleCommand", [
    player.session.token,
    encounter.room.roomId,
    {
      round: 1,
      actorId: playerActor.actorId,
      actionId: "capture",
      targetActorId: enemyActor.actorId,
      captureToolId: "capture_net",
    },
  ], {actionId: "test_durable_capture_command"});
  assert.equal(captured.ok, true);
  assert.equal(captured.room.status, "closed");
  assert.equal(saveCount, 1);
  const storedProfile = base.load().profiles[player.profileBinding.playerId].profile;
  assert.equal(profileItemCount(storedProfile, "capture_net"), 0);
  assert.equal(storedProfile.petInstances.some((pet) => pet.formId === "wuli_normal_orange_fire10"), true);
  assert.equal(base.load().battleRecords.some((record) => record.roomId === encounter.room.roomId), true);
  const encounterMetrics = service.durableMutationMetrics().precommitByMethod.startPartyEncounter;
  assert.equal(encounterMetrics.phases.runtime_normalize.count, 1);
  assert.equal(Object.hasOwn(encounterMetrics.phases, "normalize"), false);
  const captureMetrics = service.durableMutationMetrics().precommitByMethod.submitBattleCommand;
  assert.equal(captureMetrics.phases.raw_compare.count, 1);
  assert.equal(captureMetrics.phases.normalize.count, 1);
  assert.equal(Object.hasOwn(captureMetrics.phases, "runtime_normalize"), false);
});

test("battle timeout maintenance remains a durable record settlement", async () => {
  let nowMs = Date.parse("2026-07-13T00:00:00.000Z");
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base, now: () => nowMs});
  const challenger = seed.register({username: "durabletimeouta", password: "test1234"});
  const opponent = seed.register({username: "durabletimeoutb", password: "test1234"});
  let saveCount = 0;
  const service = createAuthService({
    now: () => nowMs,
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        saveCount += 1;
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  assert.equal(service.updatePlayerPosition(challenger.session.token, {
    mapId: "firebud_village_gate", cellX: 10, cellY: 10,
  }).ok, true);
  assert.equal(service.updatePlayerPosition(opponent.session.token, {
    mapId: "firebud_village_gate", cellX: 11, cellY: 10,
  }).ok, true);
  const invited = await service.invokeDurable("inviteToBattle", [
    challenger.session.token,
    {username: opponent.account.username},
  ], {actionId: "test_timeout_invite"});
  const accepted = await service.invokeDurable("acceptBattleInvite", [
    opponent.session.token,
    invited.invite.inviteId,
  ], {actionId: "test_timeout_accept"});
  assert.equal(accepted.ok, true);
  assert.equal(saveCount, 0);
  nowMs += 100_000;
  const maintenance = await service.invokeDurable("runBattleMaintenance", [], {
    actionId: "test_timeout_maintenance",
  });
  assert.equal(maintenance.ok, true);
  assert.equal(maintenance.events.some((event) => event.type === "battle.room_closed"), true);
  assert.equal(saveCount, 1);
  assert.equal(base.load().battleRecords.some((record) => record.roomId === accepted.room.roomId), true);
  const metrics = service.durableMutationMetrics().precommitByMethod.runBattleMaintenance;
  assert.equal(metrics.phases.raw_compare.count, 1);
  assert.equal(metrics.phases.normalize.count, 1);
  assert.equal(Object.hasOwn(metrics.phases, "runtime_normalize"), false);
  assertPostcommitPublishMetrics(
    service.durableMutationMetrics().postcommitByMethod.runBattleMaintenance,
    {persistent: true},
  );
});

test("timed encounter stone consumption cannot use the runtime-only fast path", async () => {
  let nowMs = Date.parse("2026-07-13T00:00:00.000Z");
  const base = createMemoryAuthStore();
  const seed = createAuthService({
    store: base,
    now: () => nowMs,
    useStrictPetEncounterPermitAuthority: true,
  });
  const player = seed.register({username: "durablestone", password: "test1234", displayName: "持久遇敌石号"});
  const profile = battleProfile("持久遇敌石号", {
    level: 5, hp: 120, maxHp: 120, attack: 18, defense: 8, quick: 70,
  }, null);
  profile.backpackSlots = [{itemId: "encounter_stone_patrol", count: 1}];
  assert.equal(seed.saveProfile(player.session.token, {expectedRevision: 0, profile}).ok, true);

  let saveCount = 0;
  const service = createAuthService({
    now: () => nowMs,
    useStrictPetEncounterPermitAuthority: true,
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        saveCount += 1;
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  assert.equal(service.updatePlayerPosition(player.session.token, {
    mapId: "firebud_village_gate", cellX: 10, cellY: 17, moving: false,
  }).ok, true);
  for (const [fromCellX, fromCellY, toCellX, toCellY] of [
    [10, 17, 11, 17], [11, 17, 11, 16], [11, 16, 11, 15],
  ]) {
    assert.equal(service.movePlayerStep(player.session.token, {
      mapId: "firebud_village_gate", fromCellX, fromCellY, toCellX, toCellY, moving: false,
    }).ok, true);
  }
  const started = await service.invokeDurable("startHangSession", [player.session.token, {
    mode: "encounter_stone",
    itemId: "encounter_stone_patrol",
    mapId: "firebud_village_gate",
    cellX: 11,
    cellY: 15,
  }], {actionId: "test_timed_stone_start"});
  assert.equal(started.ok, true);
  assert.equal(saveCount, 1);
  nowMs += 2500;
  const encounter = await service.invokeDurable("startPartyEncounter", [player.session.token, {
    encounterIntent: {zoneId: "village_grass", encounterGroupId: "firebud_grass_01"},
  }], {actionId: "test_timed_stone_encounter"});
  assert.equal(encounter.ok, true);
  assert.equal(saveCount, 2);
  const stored = base.load().profiles[player.profileBinding.playerId].profile;
  assert.equal(stored.hangSession.encounterConsumedSlot, 1);
  const metrics = service.durableMutationMetrics().precommitByMethod.startPartyEncounter;
  assert.equal(metrics.phases.raw_compare.count, 1);
  assert.equal(metrics.phases.normalize.count, 1);
  assert.equal(Object.hasOwn(metrics.phases, "runtime_normalize"), false);
});

test("healthy profile and party HTTP reads bypass the durable coordinator", async (t) => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const leader = seed.register({username: "purehttpleader", password: "test1234"});
  const member = seed.register({username: "purehttpmember", password: "test1234"});
  const invite = seed.inviteToParty(leader.session.token, {username: member.account.username});
  assert.equal(seed.acceptPartyInvite(member.session.token, invite.invite.inviteId).ok, true);
  assert.equal(seed.getPartyState(leader.session.token).ok, true);

  let saveCount = 0;
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        saveCount += 1;
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  assert.equal(service.markEventConnection({
    accountId: leader.account.accountId,
    sessionId: leader.session.sessionId,
  }, true).ok, true);
  assert.equal(service.markEventConnection({
    accountId: member.account.accountId,
    sessionId: member.session.sessionId,
  }, true).ok, true);
  const durableMethods = [];
  const invokeDurable = service.invokeDurable.bind(service);
  service.invokeDurable = (methodName, args, operation) => {
    durableMethods.push(methodName);
    return invokeDurable(methodName, args, operation);
  };
  const beforeReads = service.snapshot();
  const harness = await listen(service);
  t.after(() => closeHarness(harness, service));

  const [profile, party] = await Promise.all([
    fetchJson(`${harness.baseUrl}/profiles/me`, {
      headers: {authorization: `Bearer ${leader.session.token}`},
    }),
    fetchJson(`${harness.baseUrl}/party/state`, {
      headers: {authorization: `Bearer ${leader.session.token}`},
    }),
  ]);

  assert.equal(profile.ok, true);
  assert.equal(profile.profileSummary.accountId, leader.account.accountId);
  assert.equal(party.ok, true);
  assert.equal(party.party.partyId, invite.party.partyId);
  assert.deepEqual(durableMethods, []);
  assert.equal(saveCount, 0);
  assert.deepEqual(service.snapshot(), beforeReads);
  const metrics = service.durableMutationMetrics();
  assert.equal(metrics.pending, 0);
  assert.equal(metrics.running, 0);
  assert.equal(metrics.accepted, 0);
  assert.equal(metrics.completed, 0);
});

test("profile repair HTTP read stays pending until its durable commit", async (t) => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const registered = seed.register({username: "repairhttpprofile", password: "test1234"});
  const corrupted = base.load();
  delete corrupted.profiles[registered.profileBinding.playerId];
  base.save(corrupted);

  const writeStarted = deferred();
  const releaseWrite = deferred();
  let saveCount = 0;
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        saveCount += 1;
        writeStarted.resolve();
        await releaseWrite.promise;
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  assert.equal(service.markEventConnection({
    accountId: registered.account.accountId,
    sessionId: registered.session.sessionId,
  }, true).ok, true);
  const durableMethods = [];
  const invokeDurable = service.invokeDurable.bind(service);
  service.invokeDurable = (methodName, args, operation) => {
    durableMethods.push(methodName);
    return invokeDurable(methodName, args, operation);
  };
  const harness = await listen(service);
  t.after(() => closeHarness(harness, service));

  let responseSettled = false;
  const responsePromise = fetchJson(`${harness.baseUrl}/profiles/me`, {
    headers: {authorization: `Bearer ${registered.session.token}`},
  }).then((response) => {
    responseSettled = true;
    return response;
  });

  await writeStarted.promise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(responseSettled, false);
  assert.deepEqual(durableMethods, ["getProfile"]);
  assert.equal(saveCount, 1);

  releaseWrite.resolve();
  const response = await responsePromise;
  assert.equal(response.ok, true);
  assert.equal(response.profileSummary.accountId, registered.account.accountId);
  assert.ok(base.load().profiles[registered.profileBinding.playerId]);
});

test("party HTTP read with stale presence falls back to durable maintenance", async (t) => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const leader = seed.register({username: "partymainleader", password: "test1234"});
  const member = seed.register({username: "partymainmember", password: "test1234"});
  const invite = seed.inviteToParty(leader.session.token, {username: member.account.username});
  assert.equal(seed.acceptPartyInvite(member.session.token, invite.invite.inviteId).ok, true);
  assert.equal(seed.getPartyState(leader.session.token).ok, true);
  const stale = base.load();
  const party = stale.parties[invite.party.partyId];
  party.memberPresence[leader.account.accountId] = {
    accountId: leader.account.accountId,
    online: false,
    connectionState: "offline",
    offlineSince: new Date().toISOString(),
    autoKickAt: new Date(Date.now() + 60_000).toISOString(),
    updatedAt: new Date().toISOString(),
    schemaVersion: 1,
  };
  base.save(stale);

  let saveCount = 0;
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        saveCount += 1;
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  for (const identity of [leader, member]) {
    assert.equal(service.markEventConnection({
      accountId: identity.account.accountId,
      sessionId: identity.session.sessionId,
    }, true).ok, true);
  }
  const durableMethods = [];
  const invokeDurable = service.invokeDurable.bind(service);
  service.invokeDurable = (methodName, args, operation) => {
    durableMethods.push(methodName);
    return invokeDurable(methodName, args, operation);
  };
  const harness = await listen(service);
  t.after(() => closeHarness(harness, service));

  const response = await fetchJson(`${harness.baseUrl}/party/state`, {
    headers: {authorization: `Bearer ${leader.session.token}`},
  });
  assert.equal(response.ok, true);
  assert.equal(response.party.members.find((row) => row.accountId === leader.account.accountId).online, true);
  assert.deepEqual(durableMethods, ["getPartyState"]);
  assert.equal(saveCount, 1);
  const partyMetrics = service.durableMutationMetrics().precommitByMethod.getPartyState;
  assert.equal(partyMetrics.phases.raw_compare.count, 1);
  assert.equal(partyMetrics.phases.normalize.count, 1);
  assert.equal(Object.hasOwn(partyMetrics.phases, "runtime_normalize"), false);
});

test("websocket handshake durably repairs a malformed profile before accepting the player", async (t) => {
  const base = createMemoryAuthStore();
  const seedService = createAuthService({store: base});
  const registered = seedService.register({
    username: "durablewsrepair",
    password: "test1234",
    displayName: "握手补档",
  });
  const damaged = base.load();
  damaged.profiles[registered.profileBinding.playerId].profile = [];
  base.save(damaged);

  let saveCount = 0;
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        saveCount += 1;
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  const harness = await listen(service);
  t.after(async () => {
    harness.server.eventHub.close();
    await closeHarness(harness, service);
  });
  const wsBase = harness.baseUrl.replace(/^http:/, "ws:");
  const ws = new WebSocket(
    eventStreamUrl(wsBase, registered.session.token),
    eventStreamProtocols(registered.session.token),
  );
  const reader = webSocketJsonReader(ws);

  await webSocketOpen(ws);
  const ready = await reader.next("events.ready");
  assert.equal(ready.account.username, "durablewsrepair");
  assert.equal(saveCount, 1);
  assert.ok(base.load().profileBindings[registered.account.accountId]);
  assert.equal(Array.isArray(base.load().profiles[registered.profileBinding.playerId].profile), false);
  ws.close();
});

test("runtime trade offer created during a blocked commit survives durable publish merge", async () => {
  const base = createMemoryAuthStore();
  const assetOwner = seedShopAccount(base, "committradeasset");
  const trader = seedShopAccount(base, "committradealpha");
  const target = seedShopAccount(base, "committradebeta");
  const writeStarted = deferred();
  const releaseWrite = deferred();
  let saveCount = 0;
  const service = createAuthService({
    allowPositionTeleport: true,
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        saveCount += 1;
        writeStarted.resolve();
        await releaseWrite.promise;
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  assert.equal(service.updatePlayerPosition(trader.session.token, {
    mapId: "firebud_training_yard", cellX: 10, cellY: 10,
  }).ok, true);
  assert.equal(service.updatePlayerPosition(target.session.token, {
    mapId: "firebud_training_yard", cellX: 11, cellY: 10,
  }).ok, true);

  const commitPromise = service.invokeDurable("shopTransaction", [assetOwner.session.token, {
    mode: "buy",
    shopId: "firebud_item_shop",
    itemId: "item_meat_small",
    amount: 1,
  }], {actionId: "test_trade_runtime_merge"});
  await writeStarted.promise;

  const proposed = service.proposeTrade(trader.session.token, {
    targetUsername: target.account.username,
    stoneCoins: 1,
  });
  assert.equal(proposed.ok, true);
  assert.ok(service.snapshot().tradeOffers[proposed.trade.tradeId]);
  assert.equal(base.load().tradeOffers[proposed.trade.tradeId], undefined);

  releaseWrite.resolve();
  const committed = await commitPromise;
  assert.equal(committed.ok, true);
  assert.equal(saveCount, 1);
  assert.equal(committed.profile.stoneCoins, 12);
  const after = service.snapshot();
  assert.ok(after.tradeOffers[proposed.trade.tradeId]);
  assert.equal(after.tradeOffers[proposed.trade.tradeId].fromAccountId, trader.account.accountId);
  assert.equal(after.tradeOffers[proposed.trade.tradeId].toAccountId, target.account.accountId);
  assert.equal(base.load().tradeOffers[proposed.trade.tradeId], undefined);
});

test("logout blocks same-account runtime movement until its durable commit publishes removal", async () => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const actor = seed.register({username: "logoutbarriera", password: "test1234"});
  const watcher = seed.register({username: "logoutbarrierw", password: "test1234"});
  const partyInvite = seed.inviteToParty(watcher.session.token, {username: "logoutbarriera"});
  assert.equal(seed.acceptPartyInvite(actor.session.token, partyInvite.invite.inviteId).ok, true);
  const writeStarted = deferred();
  const releaseWrite = deferred();
  const service = createAuthService({
    allowPositionTeleport: true,
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        writeStarted.resolve();
        await releaseWrite.promise;
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  service.updatePlayerPosition(actor.session.token, {mapId: "map_a", cellX: 10, cellY: 10});
  service.updatePlayerPosition(watcher.session.token, {mapId: "map_a", cellX: 11, cellY: 10});
  const events = [];
  service.onEvent((event) => events.push(event));

  const logoutPromise = service.invokeDurable("logout", [actor.session.token], {actionId: "test_logout"});
  await writeStarted.promise;
  const concurrentMove = service.updatePlayerPosition(actor.session.token, {
    mapId: "map_b",
    cellX: 101,
    cellY: 100,
  });
  assert.equal(concurrentMove.ok, false);
  assert.equal(concurrentMove.code, "movement_account_committing");
  assert.equal(concurrentMove.movement.retryable, true);
  const leaderMove = service.movePlayerStep(watcher.session.token, {
    mapId: "map_a",
    fromCellX: 11,
    fromCellY: 10,
    toCellX: 12,
    toCellY: 10,
    moving: true,
  });
  assert.equal(leaderMove.ok, true);
  assert.equal(service.snapshot().playerPositions[actor.account.accountId].cellX, 10);
  assert.equal(events.some((event) => (
    event.type === "online.position" && event.accountId === actor.account.accountId
  )), false);

  releaseWrite.resolve();
  const loggedOut = await logoutPromise;
  assert.equal(loggedOut.ok, true);
  assert.equal(service.snapshot().playerPositions[watcher.account.accountId].cellX, 12);
  const removal = events.find((event) => (
    event.type === "online.position"
    && event.accountId === actor.account.accountId
    && event.position === null
  ));
  assert.notEqual(removal, undefined);
  const roster = service.listOnlinePlayers(watcher.session.token, {scope: "map", mapId: "map_a"});
  assert.equal(roster.players.some((player) => player.accountId === actor.account.accountId), false);
  assertPostcommitPublishMetrics(
    service.durableMutationMetrics().postcommitByMethod.logout,
    {persistent: true},
  );
});

test("failed blocked commit drops candidate runtime changes but keeps concurrent live movement", async () => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const actor = seed.register({username: "deltarollbacka", password: "test1234"});
  const watcher = seed.register({username: "deltarollbackw", password: "test1234"});
  const writeStarted = deferred();
  const releaseWrite = deferred();
  const service = createAuthService({
    allowPositionTeleport: true,
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync() {
        writeStarted.resolve();
        await releaseWrite.promise;
        throw new Error("forced blocked commit failure");
      },
    }, {onError: () => {}}),
  });
  assert.equal(service.updatePlayerPosition(actor.session.token, {
    mapId: "map_a", cellX: 10, cellY: 10,
  }).ok, true);
  assert.equal(service.updatePlayerPosition(watcher.session.token, {
    mapId: "map_a", cellX: 11, cellY: 10,
  }).ok, true);
  const events = [];
  service.onEvent((event) => events.push(event));

  const logoutPromise = service.invokeDurable("logout", [actor.session.token], {
    actionId: "test_runtime_delta_failed_logout",
  });
  await writeStarted.promise;
  const concurrentMove = service.movePlayerStep(watcher.session.token, {
    mapId: "map_a",
    fromCellX: 11,
    fromCellY: 10,
    toCellX: 12,
    toCellY: 10,
    moving: true,
  });
  assert.equal(concurrentMove.ok, true);
  assert.equal(service.snapshot().playerPositions[actor.account.accountId].cellX, 10);

  releaseWrite.resolve();
  await assert.rejects(
    logoutPromise,
    (error) => error && error.code === "storage_write_failed",
  );
  const after = service.snapshot();
  assert.equal(after.playerPositions[actor.account.accountId].cellX, 10);
  assert.equal(after.playerPositions[watcher.account.accountId].cellX, 12);
  assert.equal(service.getSession(actor.session.token).ok, true);
  assert.equal(events.some((event) => (
    event.type === "online.position"
    && event.accountId === actor.account.accountId
    && event.position === null
  )), false);
  await service.waitForDurableIdle();
});

test("failed logout and replacement login preserve published runtime presence", async () => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const actor = seed.register({username: "authrollbacka", password: "test1234"});
  const watcher = seed.register({username: "authrollbackw", password: "test1234"});
  let failWrites = true;
  const service = createAuthService({
    allowPositionTeleport: true,
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        if (failWrites) {
          throw new Error("forced auth commit failure");
        }
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  service.updatePlayerPosition(actor.session.token, {mapId: "map_a", cellX: 10, cellY: 10});
  service.updatePlayerPosition(watcher.session.token, {mapId: "map_a", cellX: 11, cellY: 10});
  service.markEventConnection({
    accountId: actor.account.accountId,
    sessionId: actor.session.sessionId,
  }, true);
  const events = [];
  service.onEvent((event) => events.push(event));

  await assert.rejects(
    service.invokeDurable("logout", [actor.session.token], {actionId: "test_logout_failure"}),
    (error) => error && error.code === "storage_write_failed",
  );
  assert.equal(service.getSession(actor.session.token).ok, true);
  let roster = service.listOnlinePlayers(watcher.session.token, {scope: "map", mapId: "map_a"});
  assert.equal(roster.players.some((player) => player.accountId === actor.account.accountId), true);
  assert.equal(events.some((event) => event.type === "online.position" && event.position === null), false);

  await assert.rejects(
    service.invokeDurable("login", [{username: "authrollbacka", password: "test1234"}], {actionId: "test_login_failure"}),
    (error) => error && error.code === "storage_write_failed",
  );
  assert.equal(service.getSession(actor.session.token).ok, true);
  roster = service.listOnlinePlayers(watcher.session.token, {scope: "map", mapId: "map_a"});
  assert.equal(roster.players.some((player) => player.accountId === actor.account.accountId), true);
  assert.equal(events.some((event) => event.type === "session.replaced"), false);

  failWrites = false;
  await service.waitForDurableIdle();
});

test("successful async replacement login keeps its party member prospectively online", async () => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const leader = seed.register({username: "loginpartyleader", password: "test1234"});
  const member = seed.register({username: "loginpartymember", password: "test1234"});
  const invite = seed.inviteToParty(leader.session.token, {username: "loginpartymember"});
  const accepted = seed.acceptPartyInvite(member.session.token, invite.invite.inviteId);
  assert.equal(accepted.ok, true);

  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  service.markEventConnection({
    accountId: member.account.accountId,
    sessionId: member.session.sessionId,
  }, true);
  const events = [];
  service.onEvent((event) => events.push(event));

  const login = await service.invokeDurable("login", [{
    username: "loginpartymember",
    password: "test1234",
  }], {actionId: "test_party_login"});
  assert.equal(login.ok, true);
  const partyEvent = events.find((event) => event.type === "party.update" && event.party);
  if (partyEvent) {
    const publicMember = partyEvent.party.members.find((row) => row.accountId === member.account.accountId);
    assert.equal(publicMember.online, true);
    assert.equal(publicMember.connectionState, "online");
    assert.equal(publicMember.autoKickAt, null);
  }
  const party = service.snapshot().parties[accepted.party.partyId];
  const presence = party.memberPresence[member.account.accountId];
  assert.equal(presence.online, true);
  assert.equal(presence.connectionState, "online");
  assert.equal(presence.offlineSince, null);
  assert.equal(presence.autoKickAt, null);
});

test("durable receipt replays across restart and rejects key reuse with another request", async (t) => {
  const base = createMemoryAuthStore();
  const registered = seedShopAccount(base, "durablereplay");
  let saveCount = 0;
  const makeService = () => createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        saveCount += 1;
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  const operationId = "bbo_shop_restart_replay_0001";

  const firstService = makeService();
  const firstHarness = await listen(firstService);
  const first = await shopRequest(firstHarness.baseUrl, registered.session.token, operationId);
  assert.equal(first.ok, true);
  assert.equal(first.profile.stoneCoins, 12);
  assert.equal(first.durableCommit.replayed, false);
  assert.equal(saveCount, 1);

  const replay = await shopRequest(firstHarness.baseUrl, registered.session.token, operationId);
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.profile.stoneCoins, 12);
  assert.equal(saveCount, 1);

  const conflictResponse = await fetch(`${firstHarness.baseUrl}/shops/transaction`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${registered.session.token}`,
      "Idempotency-Key": operationId,
      [CLIENT_VERSION_HEADER]: SERVER_VERSION,
      [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
    },
    body: JSON.stringify({
      mode: "buy",
      shopId: "firebud_item_shop",
      itemId: "item_meat_small",
      amount: 2,
    }),
  });
  assert.equal(conflictResponse.status, 409);
  assert.equal((await conflictResponse.json()).code, "idempotency_key_conflict");
  assert.equal(saveCount, 1);
  await closeHarness(firstHarness, firstService);

  const restartedService = makeService();
  const restartedHarness = await listen(restartedService);
  t.after(() => closeHarness(restartedHarness, restartedService));
  const afterRestart = await shopRequest(restartedHarness.baseUrl, registered.session.token, operationId);
  assert.equal(afterRestart.ok, true);
  assert.equal(afterRestart.durableCommit.replayed, true);
  assert.equal(afterRestart.profile.stoneCoins, 12);
  assert.equal(saveCount, 1);
  assert.equal(profileItemCount(afterRestart.profile, "item_meat_small"), 1);
});

test("a stale live Node turns a resource conflict into the first Node's exact receipt replay", async () => {
  const base = createMemoryAuthStore();
  const registered = seedShopAccount(base, "durablecrossnode");
  const staleSnapshot = base.load();
  const receiptView = (operationId, authorityCurrent = true) => {
    const receipt = base.load().mutationReceipts[operationId] || null;
    return {
      schemaVersion: 1,
      operationId,
      authorityCurrent,
      receipt: receipt === null ? null : JSON.parse(JSON.stringify(receipt)),
    };
  };
  const firstStore = createAsyncWriteAuthStore({
    mode: "cross-node-winner-test",
    load: () => base.load(),
    readDurableMutationReceipt: async (operationId) => receiptView(operationId),
    async saveAsyncOwned(nextData) {
      base.save(nextData);
    },
  }, {onError() {}});
  let staleLoadCalls = 0;
  let staleSaveAttempts = 0;
  const staleStore = createAsyncWriteAuthStore({
    mode: "cross-node-stale-test",
    load() {
      staleLoadCalls += 1;
      return staleLoadCalls === 1
        ? JSON.parse(JSON.stringify(staleSnapshot))
        : base.load();
    },
    readDurableMutationReceipt: async (operationId) => receiptView(
      operationId,
      staleLoadCalls > 1,
    ),
    async saveAsyncOwned() {
      staleSaveAttempts += 1;
      const error = new Error("remote Node already advanced this profile");
      error.code = "mysql_resource_revision_conflict";
      error.resource = "profile";
      error.outcomeUnknown = false;
      throw error;
    },
  }, {onError() {}});
  const firstNode = createAuthService({store: firstStore});
  const staleNode = createAuthService({store: staleStore});
  const operation = {
    operationId: "bbo_cross_node_conflict_replay_0001",
    requestHash: "5".repeat(64),
    actionId: "POST /shops/transaction",
  };
  const args = [registered.session.token, {
    mode: "buy",
    shopId: "firebud_item_shop",
    itemId: "item_meat_small",
    amount: 1,
  }];

  const first = await firstNode.invokeDurable("shopTransaction", args, operation);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.durableCommit.replayed, false);
  const replay = await staleNode.invokeDurable("shopTransaction", args, operation);
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.profile.stoneCoins, 12);
  assert.equal(profileItemCount(replay.profile, "item_meat_small"), 1);
  assert.equal(staleSaveAttempts, 1);
  assert.equal(staleLoadCalls, 2);
  assert.equal(staleStore.metrics().durableReceiptReads, 1);
  assert.equal(staleStore.metrics().durableReceiptReadHits, 1);
  assert.equal(staleStore.lastSaveError(), null);
  assert.equal(base.load().profiles[registered.profileBinding.playerId].profile.stoneCoins, 12);
  assert.equal(profileItemCount(base.load().profiles[registered.profileBinding.playerId].profile, "item_meat_small"), 1);
});

test("a stale domain failure reconciles the remote shop receipt before returning a false failure", async () => {
  const base = createMemoryAuthStore();
  const registered = seedShopAccount(base, "durabledomainreplay");
  const operation = {
    operationId: "bbo_cross_node_domain_failure_0001",
    requestHash: "d".repeat(64),
    actionId: "POST /shops/transaction",
  };
  const args = [registered.session.token, {
    mode: "buy",
    shopId: "firebud_item_shop",
    itemId: "item_meat_small",
    amount: 2,
  }];
  const writer = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "domain-replay-writer",
      load: () => base.load(),
      async saveAsyncOwned(nextData) {
        base.save(nextData);
      },
    }, {onError() {}}),
  });
  const first = await writer.invokeDurable("shopTransaction", args, operation);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.profile.stoneCoins, 4);

  const latestWithoutReceipt = base.load();
  delete latestWithoutReceipt.mutationReceipts[operation.operationId];
  let loadCalls = 0;
  let receiptReads = 0;
  let saveCalls = 0;
  const stale = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "domain-replay-stale",
      load() {
        loadCalls += 1;
        return loadCalls === 1 ? structuredClone(latestWithoutReceipt) : base.load();
      },
      async readDurableMutationReceipt(operationId) {
        receiptReads += 1;
        return {
          schemaVersion: 1,
          operationId,
          authorityCurrent: false,
          receipt: structuredClone(base.load().mutationReceipts[operationId]),
        };
      },
      async saveAsyncOwned() {
        saveCalls += 1;
      },
    }, {onError() {}}),
  });

  const replay = await stale.invokeDurable("shopTransaction", args, operation);
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.profile.stoneCoins, 4);
  assert.equal(profileItemCount(replay.profile, "item_meat_small"), 2);
  assert.equal(loadCalls, 2);
  assert.equal(receiptReads, 1);
  assert.equal(saveCalls, 0);
});

test("stale attachment mail failures replay the remote receipt without a second save", async () => {
  const scenarios = [
    {
      suffix: "ordinary",
      itemId: "item_meat_small",
      configure(profile) {
        profile.backpackSlots = [
          {itemId: "item_meat_small", count: 4},
          ...Array.from({length: 14}, () => ({})),
        ];
      },
      attachment: {itemId: "item_meat_small", count: 4},
    },
    {
      suffix: "equipment",
      itemId: "weapon_wooden_club",
      configure(profile) {
        profile.backpackSlots = [
          {itemId: "weapon_wooden_club", count: 1},
          ...Array.from({length: 14}, () => ({})),
        ];
        profile.equipmentInstances = {
          equip_mail_remote_replay_0001: {
            schemaVersion: 1,
            instanceId: "equip_mail_remote_replay_0001",
            itemId: "weapon_wooden_club",
            location: "backpack",
            slotId: "",
            durability: 23,
            enhancement: {itemId: "weapon_wooden_club", level: 2, history: []},
            wearCounters: {itemId: "weapon_wooden_club", attackCount: 3, hitCount: 0},
            expPillCharge: {},
            source: "mail_remote_replay_test",
          },
        };
        profile.equipmentSlotInstanceIds = {};
        profile.equipmentSlotsVersion = 5;
        profile.nextEquipmentInstanceSerial = 2;
      },
      attachment: {
        itemId: "weapon_wooden_club",
        count: 1,
        instanceId: "equip_mail_remote_replay_0001",
        sourceSlotIndex: 0,
      },
    },
  ];

  for (const scenario of scenarios) {
    const base = createMemoryAuthStore();
    const seed = createAuthService({store: base});
    const sender = seed.register({
      username: `mrs${scenario.suffix}`,
      password: "test1234",
      displayName: `寄件人${scenario.suffix}`,
    });
    const recipient = seed.register({
      username: `mrr${scenario.suffix}`,
      password: "test1234",
      displayName: `收件人${scenario.suffix}`,
    });
    const current = seed.getProfile(sender.session.token);
    const profile = current.profile;
    scenario.configure(profile);
    const saved = seed.saveProfile(sender.session.token, {
      expectedRevision: current.profileSummary.profileRevision,
      profile,
    });
    assert.equal(saved.ok, true, `${scenario.suffix}: ${JSON.stringify(saved)}`);

    const operation = {
      operationId: `bbo_cross_node_mail_failure_${scenario.suffix}_0001`,
      requestHash: scenario.suffix === "ordinary" ? "1".repeat(64) : "2".repeat(64),
      actionId: "POST /mail/send",
    };
    const args = [sender.session.token, {
      recipientUsername: recipient.account.username,
      title: `跨节点附件${scenario.suffix}`,
      body: "首次提交成功后，同一操作必须重放首次结果。",
      items: [scenario.attachment],
    }];
    let writerReceiptReads = 0;
    const writer = createAuthService({
      store: createAsyncWriteAuthStore({
        mode: `mail-replay-writer-${scenario.suffix}`,
        load: () => base.load(),
        async readDurableMutationReceipt(operationId) {
          writerReceiptReads += 1;
          return {
            schemaVersion: 1,
            operationId,
            authorityCurrent: true,
            receipt: null,
          };
        },
        async saveAsyncOwned(nextData) {
          base.save(nextData);
        },
      }, {onError() {}}),
    });
    const first = await writer.invokeDurable("sendMail", args, operation);
    assert.equal(first.ok, true, `${scenario.suffix}: ${JSON.stringify(first)}`);
    assert.equal(first.durableCommit.replayed, false);
    assert.equal(writerReceiptReads, 0, `${scenario.suffix}: healthy send must stay on the zero-read path`);

    const latestWithoutReceipt = base.load();
    delete latestWithoutReceipt.mutationReceipts[operation.operationId];
    let loadCalls = 0;
    let receiptReads = 0;
    let saveCalls = 0;
    const staleStore = createAsyncWriteAuthStore({
      mode: `mail-replay-stale-${scenario.suffix}`,
      load() {
        loadCalls += 1;
        return loadCalls === 1 ? structuredClone(latestWithoutReceipt) : base.load();
      },
      async readDurableMutationReceipt(operationId) {
        receiptReads += 1;
        return {
          schemaVersion: 1,
          operationId,
          authorityCurrent: false,
          receipt: structuredClone(base.load().mutationReceipts[operationId]),
        };
      },
      async saveAsyncOwned() {
        saveCalls += 1;
      },
    }, {onError() {}});
    const stale = createAuthService({store: staleStore});
    const replay = await stale.invokeDurable("sendMail", args, operation);

    assert.equal(replay.ok, true, `${scenario.suffix}: ${JSON.stringify(replay)}`);
    assert.equal(replay.durableCommit.replayed, true);
    assert.equal(replay.mail.mailId, first.mail.mailId);
    assert.equal(loadCalls, 2);
    assert.equal(receiptReads, 1);
    assert.equal(staleStore.metrics().durableReceiptReadHits, 1);
    assert.equal(saveCalls, 0);
    assert.equal(
      profileItemCount(base.load().profiles[sender.profileBinding.playerId].profile, scenario.itemId),
      0,
    );
    assert.equal(Object.keys(base.load().mailMessages).length, 1);
  }
});

test("a local active receipt missing from MySQL fails closed instead of re-executing", async () => {
  const base = createMemoryAuthStore();
  const registered = seedShopAccount(base, "durablemissingrow");
  const operation = {
    operationId: "bbo_local_receipt_missing_mysql_0001",
    requestHash: "6".repeat(64),
    actionId: "POST /shops/transaction",
  };
  const args = [registered.session.token, {
    mode: "buy",
    shopId: "firebud_item_shop",
    itemId: "item_meat_small",
    amount: 1,
  }];
  const writer = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "receipt-missing-writer",
      load: () => base.load(),
      async saveAsyncOwned(nextData) {
        base.save(nextData);
      },
    }, {onError() {}}),
  });
  assert.equal((await writer.invokeDurable("shopTransaction", args, operation)).ok, true);
  let exactLoads = 0;
  let exactSaves = 0;
  const exactReader = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "receipt-exact-reader",
      load() {
        exactLoads += 1;
        return base.load();
      },
      async readDurableMutationReceipt(operationId) {
        const stored = base.load().mutationReceipts[operationId];
        return {
          schemaVersion: 1,
          operationId,
          authorityCurrent: true,
          receipt: JSON.parse(JSON.stringify(stored)),
        };
      },
      async saveAsyncOwned() {
        exactSaves += 1;
      },
    }, {onError() {}}),
  });
  const exactReplay = await exactReader.invokeDurable("shopTransaction", args, operation);
  assert.equal(exactReplay.ok, true);
  assert.equal(exactReplay.durableCommit.replayed, true);
  assert.equal(exactSaves, 0);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const repeated = await exactReader.invokeDurable("shopTransaction", args, operation);
    assert.equal(repeated.ok, true);
    assert.equal(repeated.durableCommit.replayed, true);
  }
  assert.equal(exactLoads, 1, "same-Node exact replay must not full-reload the authority root");
  let unexpectedSaves = 0;
  const reader = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "receipt-missing-reader",
      load: () => base.load(),
      async readDurableMutationReceipt(operationId) {
        return {schemaVersion: 1, operationId, authorityCurrent: false, receipt: null};
      },
      async saveAsyncOwned() {
        unexpectedSaves += 1;
      },
    }, {onError() {}}),
  });

  await assert.rejects(
    reader.invokeDurable("shopTransaction", args, operation),
    (error) => error && error.code === "storage_read_failed",
  );
  assert.equal(unexpectedSaves, 0);
  assert.equal(base.load().profiles[registered.profileBinding.playerId].profile.stoneCoins, 12);
  assert.equal(profileItemCount(base.load().profiles[registered.profileBinding.playerId].profile, "item_meat_small"), 1);
});

test("a stale Node reloads an expired exact receipt before safely reusing its operation ID", async () => {
  const base = createMemoryAuthStore();
  const registered = seedShopAccount(base, "durableexpiredremote");
  const operation = {
    operationId: "bbo_cross_node_expired_reuse_0001",
    requestHash: "7".repeat(64),
    actionId: "POST /shops/transaction",
  };
  const staleSnapshot = base.load();
  const withExpired = base.load();
  withExpired.mutationReceipts[operation.operationId] = {
    schemaVersion: 1,
    operationId: operation.operationId,
    requestHash: "8".repeat(64),
    actionId: "POST /bank/deposit",
    accountId: registered.account.accountId,
    committedAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-07-02T00:00:00.000Z",
    response: {ok: true, generation: "expired"},
  };
  base.save(withExpired);
  let loadCalls = 0;
  let saveAttempts = 0;
  const store = createAsyncWriteAuthStore({
    mode: "cross-node-expired-receipt-test",
    load() {
      loadCalls += 1;
      return loadCalls === 1
        ? JSON.parse(JSON.stringify(staleSnapshot))
        : base.load();
    },
    async readDurableMutationReceipt(operationId) {
      const stored = base.load().mutationReceipts[operationId] || null;
      return {
        schemaVersion: 1,
        operationId,
        authorityCurrent: loadCalls > 1,
        receipt: stored === null ? null : JSON.parse(JSON.stringify(stored)),
      };
    },
    async saveAsyncOwned(nextData) {
      saveAttempts += 1;
      if (saveAttempts === 1) {
        const error = new Error("expired receipt primary key still exists remotely");
        error.code = "mysql_resource_revision_conflict";
        error.resource = "mutation_receipt";
        error.outcomeUnknown = false;
        throw error;
      }
      base.save(nextData);
    },
  }, {onError() {}});
  const service = createAuthService({store});
  const args = [registered.session.token, {
    mode: "buy",
    shopId: "firebud_item_shop",
    itemId: "item_meat_small",
    amount: 1,
  }];

  await assert.rejects(
    service.invokeDurable("shopTransaction", args, operation),
    (error) => error && error.code === "storage_write_failed",
  );
  assert.equal(store.lastSaveError(), null);
  const settled = await service.invokeDurable("shopTransaction", args, operation);
  assert.equal(settled.ok, true, JSON.stringify(settled));
  assert.equal(settled.durableCommit.replayed, false);
  assert.equal(saveAttempts, 2);
  assert.equal(base.load().mutationReceipts[operation.operationId].requestHash, operation.requestHash);
  assert.equal(base.load().profiles[registered.profileBinding.playerId].profile.stoneCoins, 12);
  assert.equal(profileItemCount(base.load().profiles[registered.profileBinding.playerId].profile, "item_meat_small"), 1);
});

test("an expired remote receipt refresh cannot publish the stale failure candidate over authority", async () => {
  const base = createMemoryAuthStore();
  const registered = seedShopAccount(base, "expiredcandguard");
  const operation = {
    operationId: "bbo_expired_candidate_guard_0001",
    requestHash: "e".repeat(64),
    actionId: "POST /shops/transaction",
  };
  const stale = base.load();
  stale.profiles[registered.profileBinding.playerId].profile.stoneCoins = 0;
  const authoritative = base.load();
  authoritative.profiles[registered.profileBinding.playerId].profile.stoneCoins = 777;
  authoritative.mutationReceipts[operation.operationId] = {
    schemaVersion: 1,
    operationId: operation.operationId,
    requestHash: "f".repeat(64),
    actionId: "POST /bank/deposit",
    accountId: registered.account.accountId,
    committedAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-07-02T00:00:00.000Z",
    response: {ok: true, generation: "expired"},
  };
  base.save(authoritative);
  let loadCalls = 0;
  let saveCalls = 0;
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "expired-candidate-guard",
      load() {
        loadCalls += 1;
        return loadCalls === 1 ? structuredClone(stale) : base.load();
      },
      async readDurableMutationReceipt(operationId) {
        return {
          schemaVersion: 1,
          operationId,
          authorityCurrent: false,
          receipt: structuredClone(base.load().mutationReceipts[operationId]),
        };
      },
      async saveAsyncOwned() {
        saveCalls += 1;
      },
    }, {onError() {}}),
  });

  await assert.rejects(
    service.invokeDurable("shopTransaction", [registered.session.token, {
      mode: "buy",
      shopId: "firebud_item_shop",
      itemId: "item_meat_small",
      amount: 1,
    }], operation),
    (error) => error && error.code === "storage_read_failed",
  );
  assert.equal(loadCalls, 2);
  assert.equal(saveCalls, 0);
  assert.equal(
    service.snapshot().profiles[registered.profileBinding.playerId].profile.stoneCoins,
    777,
  );
});

test("mutating committed results cannot alter authority or later durable receipt replays", async () => {
  const base = createMemoryAuthStore();
  const owner = seedShopAccount(base, "resultisolationa");
  let saveCount = 0;
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        saveCount += 1;
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  const request = {
    mode: "buy",
    shopId: "firebud_item_shop",
    itemId: "item_meat_small",
    amount: 1,
  };
  const operation = {
    operationId: "bbo_result_alias_isolation_0001",
    requestHash: "a".repeat(64),
    actionId: "POST /shops/transaction",
  };

  const committed = await service.invokeDurable(
    "shopTransaction",
    [owner.session.token, request],
    operation,
  );
  assert.equal(committed.ok, true);
  assert.equal(committed.durableCommit.replayed, false);
  assert.equal(saveCount, 1);
  const authoritativeProfile = service.snapshot().profiles[owner.profileBinding.playerId].profile;
  const persistedReceipt = base.load().mutationReceipts[operation.operationId];
  assert.equal(profileItemCount(authoritativeProfile, "item_meat_small"), 1);
  assert.equal(profileItemCount(persistedReceipt.response.profile, "item_meat_small"), 1);

  committed.profile.stoneCoins = 999999;
  committed.profile.backpackSlots[0].itemId = "caller_corrupted_item";
  committed.profile.backpackSlots[0].count = 999999;
  committed.profileSummary.profileRevision = 999999;
  committed.durableCommit.operationId = "caller_corrupted_operation";

  const afterMutation = service.snapshot().profiles[owner.profileBinding.playerId].profile;
  assert.equal(afterMutation.stoneCoins, 12);
  assert.equal(profileItemCount(afterMutation, "item_meat_small"), 1);
  assert.equal(profileItemCount(afterMutation, "caller_corrupted_item"), 0);
  assert.equal(base.load().mutationReceipts[operation.operationId].response.durableCommit.operationId, operation.operationId);

  const replay = await service.invokeDurable(
    "shopTransaction",
    [owner.session.token, request],
    operation,
  );
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.durableCommit.operationId, operation.operationId);
  assert.equal(replay.profile.stoneCoins, 12);
  assert.equal(profileItemCount(replay.profile, "item_meat_small"), 1);
  assert.equal(saveCount, 1);

  replay.profile.backpackSlots[0].count = 0;
  replay.durableCommit.actionId = "caller_corrupted_replay";
  const replayAgain = await service.invokeDurable(
    "shopTransaction",
    [owner.session.token, request],
    operation,
  );
  assert.equal(replayAgain.durableCommit.replayed, true);
  assert.equal(replayAgain.durableCommit.actionId, operation.actionId);
  assert.equal(profileItemCount(replayAgain.profile, "item_meat_small"), 1);
  assert.equal(saveCount, 1);
});

test("durable receipt follows its account across token rotation and rejects another account", async (t) => {
  const base = createMemoryAuthStore();
  const owner = seedShopAccount(base, "durabletokenowner");
  const other = seedShopAccount(base, "durabletokenother");
  let saveCount = 0;
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        saveCount += 1;
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  const harness = await listen(service);
  t.after(() => closeHarness(harness, service));
  const operationId = "bbo_shop_token_rotation_0001";

  const first = await shopRequest(harness.baseUrl, owner.session.token, operationId);
  assert.equal(first.ok, true);
  assert.equal(first.durableCommit.replayed, false);
  assert.equal(saveCount, 1);
  assert.equal(base.load().mutationReceipts[operationId].accountId, owner.account.accountId);

  const foreignResponse = await fetch(`${harness.baseUrl}/shops/transaction`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${other.session.token}`,
      "Idempotency-Key": operationId,
      [CLIENT_VERSION_HEADER]: SERVER_VERSION,
      [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
    },
    body: JSON.stringify({
      mode: "buy",
      shopId: "firebud_item_shop",
      itemId: "item_meat_small",
      amount: 1,
    }),
  });
  assert.equal(foreignResponse.status, 409);
  const foreignResult = await foreignResponse.json();
  assert.equal(foreignResult.ok, false);
  assert.equal(foreignResult.code, "idempotency_key_conflict");
  assert.equal(foreignResult.profile, undefined);
  assert.equal(foreignResult.durableCommit, undefined);
  assert.equal(saveCount, 1);

  const login = await fetchJson(`${harness.baseUrl}/auth/login`, {
    method: "POST",
    body: JSON.stringify({username: "durabletokenowner", password: "test1234"}),
  });
  assert.equal(login.ok, true);
  assert.notEqual(login.session.token, owner.session.token);
  const savesAfterLogin = saveCount;

  const replay = await shopRequest(harness.baseUrl, login.session.token, operationId);
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.profile.stoneCoins, 12);
  assert.equal(profileItemCount(replay.profile, "item_meat_small"), 1);
  assert.equal(saveCount, savesAfterLogin);
});

test("an expired durable operation ID is atomically replaced instead of blocking the next asset write", async () => {
  const base = createMemoryAuthStore();
  const owner = seedShopAccount(base, "durableexpiredreuse");
  const operationId = "bbo_expired_reuse_asset_0001";
  const requestHash = "e".repeat(64);
  const expired = base.load();
  expired.mutationReceipts[operationId] = {
    schemaVersion: 1,
    operationId,
    requestHash: "d".repeat(64),
    actionId: "bank.deposit",
    accountId: owner.account.accountId,
    committedAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-07-04T00:00:00.000Z",
    response: {ok: true, generation: 1},
  };
  base.save(expired);
  let saveCount = 0;
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        saveCount += 1;
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });

  const result = await service.invokeDurable(
    "bankDeposit",
    [owner.session.token, {stoneCoins: 1}],
    {operationId, requestHash, actionId: "bank.deposit"},
  );
  assert.equal(result.ok, true);
  assert.equal(result.durableCommit.replayed, false);
  assert.equal(saveCount, 1);
  const stored = base.load().mutationReceipts[operationId];
  assert.equal(stored.requestHash, requestHash);
  assert.equal(stored.response.durableCommit.operationId, operationId);
  assert.equal(stored.response.generation, undefined);

  const replay = await service.invokeDurable(
    "bankDeposit",
    [owner.session.token, {stoneCoins: 1}],
    {operationId, requestHash, actionId: "bank.deposit"},
  );
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(saveCount, 1);
});

test("failed commit publishes neither the staged tombstone nor its receipt and same-key retry settles once", async () => {
  const base = createMemoryAuthStore();
  const owner = seedEquipmentBankAccount(base, "durjrrollback");
  const before = base.load();
  let saveAttempts = 0;
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      saveAttempts += 1;
      if (saveAttempts === 1) {
        throw new Error("injected journal commit failure");
      }
      base.save(nextData);
    },
  }, {onError: () => {}});
  const service = createAuthService({store});
  const events = [];
  service.onEvent((event) => events.push(event));
  const operation = {
    operationId: "bbo_journal_rollback_retry_0001",
    requestHash: "f".repeat(64),
    actionId: "bank.withdraw",
  };
  const args = [owner.session.token, {
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      envelopeId: owner.envelopeId,
      bankSlotIndex: 1,
      targetSlotIndex: 5,
    }],
  }];

  await assert.rejects(
    service.invokeDurable("bankWithdraw", args, operation),
    (error) => error && error.code === "storage_write_failed",
  );
  assert.equal(saveAttempts, 1);
  assert.deepEqual(service.snapshot(), before);
  assert.deepEqual(base.load(), before);
  assert.equal(events.length, 0);
  assert.equal(Object.hasOwn(before.consumedEquipmentEnvelopes, owner.envelopeId), false);
  assert.equal(Object.hasOwn(before.mutationReceipts, operation.operationId), false);
  assert.equal(
    Object.hasOwn(service.durableMutationMetrics().postcommitByMethod, "bankWithdraw"),
    false,
  );

  const settled = await service.invokeDurable("bankWithdraw", args, operation);
  assert.equal(settled.ok, true);
  assert.equal(settled.durableCommit.replayed, false);
  assert.equal(saveAttempts, 2);
  const after = base.load();
  assert.equal(Object.hasOwn(after.consumedEquipmentEnvelopes, owner.envelopeId), true);
  assert.equal(Object.hasOwn(after.mutationReceipts, operation.operationId), true);
  assert.equal(after.profiles[owner.profileBinding.playerId].profileRevision, (
    before.profiles[owner.profileBinding.playerId].profileRevision + 1
  ));
  assertPostcommitPublishMetrics(
    service.durableMutationMetrics().postcommitByMethod.bankWithdraw,
    {persistent: true},
  );

  const replay = await service.invokeDurable("bankWithdraw", args, operation);
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(saveAttempts, 2);
  assert.deepEqual(base.load(), after);
});

test("storage failure recovery preserves published replay cursor without leaking failed events", async () => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const challenger = seed.register({username: "cursorrecovera", password: "test1234"});
  const opponent = seed.register({username: "cursorrecoverb", password: "test1234"});
  let failWrites = false;
  let saveAttempts = 0;
  const service = createAuthService({
    allowPositionTeleport: true,
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        saveAttempts += 1;
        if (failWrites) {
          throw new Error("forced cursor recovery failure");
        }
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  service.updatePlayerPosition(challenger.session.token, {mapId: "map_cursor", cellX: 10, cellY: 10});
  service.updatePlayerPosition(opponent.session.token, {mapId: "map_cursor", cellX: 11, cellY: 10});
  const invite = await service.invokeDurable("inviteToBattle", [
    challenger.session.token,
    {username: opponent.account.username},
  ], {actionId: "test_cursor_invite"});
  assert.equal(invite.ok, true);
  assert.equal(saveAttempts, 0);
  const before = service.listEventsForSession(challenger.session.token, {afterSeq: 0});
  const beforeIds = before.events.map((event) => event.eventId);
  assert.ok(before.latestEventSeq > 0);

  failWrites = true;
  await assert.rejects(
    service.invokeDurable("sendChatMessage", [
      challenger.session.token,
      {channel: "nearby", text: "这条失败消息不能发布"},
    ], {actionId: "test_cursor_failed_chat"}),
    (error) => error && error.code === "storage_write_failed",
  );
  failWrites = false;
  assert.equal(service.latestEventSeq(), before.latestEventSeq);

  const recovered = await service.invokeDurable("getProfile", [challenger.session.token], {
    actionId: "test_cursor_refresh",
  });
  assert.equal(recovered.ok, true);
  const after = service.listEventsForSession(challenger.session.token, {afterSeq: 0});
  assert.equal(after.latestEventSeq, before.latestEventSeq);
  assert.deepEqual(after.events.map((event) => event.eventId), beforeIds);
  assert.equal(after.events.some((event) => event.message && event.message.text === "这条失败消息不能发布"), false);

  const declined = await service.invokeDurable("declineBattleInvite", [
    opponent.session.token,
    invite.invite.inviteId,
  ], {actionId: "test_cursor_decline"});
  assert.equal(declined.ok, true);
  assert.equal(service.latestEventSeq(), before.latestEventSeq + 1);
  assert.equal(saveAttempts, 1);
});

test("only durable record point actions carry a matching row-local profile recovery scope", async () => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const owner = seed.register({
    username: "recordpointscope",
    password: "test1234",
    displayName: "记录点范围猎人",
  });
  const saveOptions = [];
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData, options) {
        saveOptions.push(structuredClone(options));
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  const recordOperation = {
    operationId: "bbo_record_scope_0001",
    requestHash: "a".repeat(64),
    actionId: "POST /profile/action",
  };

  const recordPoint = await service.invokeDurable("profileAction", [owner.session.token, {
    action: "record_point_save",
    payload: {
      recordPoint: {mapId: "firebud_training_yard", spawnName: "yard", label: "训练场"},
    },
  }], recordOperation);
  assert.equal(recordPoint.ok, true);
  assert.deepEqual(saveOptions[0].consistencyScope, {
    kind: "row_local_profile_v1",
    accountId: owner.account.accountId,
    playerId: owner.profileBinding.playerId,
    operationId: recordOperation.operationId,
    requestHash: recordOperation.requestHash,
    actionId: recordOperation.actionId,
  });

  const otherAction = await service.invokeDurable("profileAction", [owner.session.token, {
    action: "training_partner_set_count",
    payload: {count: 1},
  }], {
    operationId: "bbo_record_scope_other_0002",
    requestHash: "b".repeat(64),
    actionId: "POST /profile/action",
  });
  assert.equal(otherAction.ok, true);
  assert.equal(saveOptions.length, 2);
  assert.equal(Object.hasOwn(saveOptions[1], "consistencyScope"), false);
});

test("scoped ambiguous record point recovery publishes both target and unrelated profile commits", async () => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const owner = seed.register({
    username: "recordpointrecovera",
    password: "test1234",
    displayName: "记录点恢复甲",
  });
  const other = seed.register({
    username: "recordpointrecoverb",
    password: "test1234",
    displayName: "记录点恢复乙",
  });
  const operation = {
    operationId: "bbo_record_scoped_recovery_0001",
    requestHash: "c".repeat(64),
    actionId: "POST /profile/action",
  };
  const targetRecordPoint = {
    mapId: "firebud_training_yard",
    spawnName: "target_yard",
    label: "甲的训练场",
  };
  const unrelatedRecordPoint = {
    mapId: "firebud_training_yard",
    spawnName: "other_yard",
    label: "乙的训练场",
  };
  let saveCount = 0;
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      saveCount += 1;
      base.save(nextData);
      const concurrentService = createAuthService({store: base});
      const unrelated = concurrentService.profileAction(other.session.token, {
        action: "record_point_save",
        payload: {recordPoint: unrelatedRecordPoint},
      });
      assert.equal(unrelated.ok, true);
      throw new Error("connection lost after scoped record point commit");
    },
  }, {onError: () => {}});
  const service = createAuthService({store});

  const result = await service.invokeDurable("profileAction", [owner.session.token, {
    action: "record_point_save",
    payload: {recordPoint: targetRecordPoint},
  }], operation);
  assert.equal(result.ok, true);
  assert.equal(result.profile.recordPoint.label, targetRecordPoint.label);
  assert.equal(saveCount, 1);
  assert.equal(store.metrics().ambiguousCommitRecoveries, 1);

  const published = service.snapshot();
  assert.equal(
    published.profiles[owner.profileBinding.playerId].profile.recordPoint.label,
    targetRecordPoint.label,
  );
  assert.equal(
    published.profiles[other.profileBinding.playerId].profile.recordPoint.label,
    unrelatedRecordPoint.label,
  );
  assert.deepEqual(published, base.load());
});

for (const mismatch of ["receipt", "target_profile"]) {
  test(`scoped ambiguous record point recovery rejects a mismatched ${mismatch}`, async () => {
    const base = createMemoryAuthStore();
    const seed = createAuthService({store: base});
    const owner = seed.register({
      username: mismatch === "receipt" ? "recmmreceipt" : "recmmprofile",
      password: "test1234",
      displayName: "记录点错配猎人",
    });
    const operation = {
      operationId: `bbo_record_mismatch_${mismatch}_0001`,
      requestHash: "d".repeat(64),
      actionId: "POST /profile/action",
    };
    const beforePublished = base.load();
    const store = createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        base.save(nextData);
        if (mismatch === "receipt") {
          const mismatched = base.load();
          delete mismatched.mutationReceipts[operation.operationId];
          base.save(mismatched);
        } else {
          const concurrentService = createAuthService({store: base});
          const replaced = concurrentService.profileAction(owner.session.token, {
            action: "record_point_save",
            payload: {
              recordPoint: {
                mapId: "firebud_village_gate",
                spawnName: "replacement_record",
                label: "后提交的同角色记录点",
              },
            },
          });
          assert.equal(replaced.ok, true);
        }
        throw new Error(`connection lost after ${mismatch} mismatch`);
      },
    }, {onError: () => {}});
    const service = createAuthService({store});

    await assert.rejects(
      service.invokeDurable("profileAction", [owner.session.token, {
        action: "record_point_save",
        payload: {
          recordPoint: {
            mapId: "firebud_training_yard",
            spawnName: "candidate_record",
            label: "待确认记录点",
          },
        },
      }], operation),
      (error) => error && error.code === "storage_write_failed",
    );
    assert.equal(store.metrics().ambiguousCommitRecoveries, 0);
    assert.deepEqual(service.snapshot(), beforePublished);
  });
}

test("ambiguous commit is reconciled from the durable snapshot before success", async (t) => {
  const base = createMemoryAuthStore();
  const registered = seedShopAccount(base, "durableambiguous");
  let throwAfterCommit = true;
  const asyncErrors = [];
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      base.save(nextData);
      if (throwAfterCommit) {
        throwAfterCommit = false;
        throw new Error("connection lost after commit");
      }
    },
  }, {onError: (error) => asyncErrors.push(error)});
  const service = createAuthService({store});
  const harness = await listen(service);
  t.after(() => closeHarness(harness, service));

  const response = await shopRequest(
    harness.baseUrl,
    registered.session.token,
    "bbo_shop_ambiguous_commit_0001",
  );
  assert.equal(response.ok, true);
  assert.equal(response.profile.stoneCoins, 12);
  assert.equal(asyncErrors.length, 0);
  assert.equal(store.metrics().ambiguousCommitRecoveries, 1);
});

test("typed no-commit failure never probes a coincidentally matching snapshot", async () => {
  const base = createMemoryAuthStore();
  let recoveryLoads = 0;
  const store = createAsyncWriteAuthStore({
    mode: "mysql",
    load() {
      recoveryLoads += 1;
      return base.load();
    },
    async saveAsync() {
      const error = new Error("row lock timeout was rolled back");
      error.code = "mysql_transaction_rolled_back";
      error.outcomeUnknown = false;
      error.rollbackConfirmed = true;
      throw error;
    },
  }, {onError: () => {}});

  await assert.rejects(
    store.save(base.load()),
    (error) => error.code === "mysql_transaction_rolled_back"
      && error.outcomeUnknown === false,
  );
  assert.equal(recoveryLoads, 0);
  assert.equal(store.metrics().ambiguousCommitRecoveries, 0);
});

test("typed ambiguous COMMIT cannot use full-root equality without an exact scoped receipt", async () => {
  const base = createMemoryAuthStore();
  let recoveryLoads = 0;
  const store = createAsyncWriteAuthStore({
    mode: "mysql",
    load() {
      recoveryLoads += 1;
      return base.load();
    },
    async saveAsync(nextData) {
      base.save(nextData);
      const error = new Error("commit acknowledgement lost");
      error.code = "mysql_commit_outcome_ambiguous";
      error.outcomeUnknown = true;
      throw error;
    },
  }, {onError: () => {}});

  await assert.rejects(
    store.save(base.load()),
    (error) => error.code === "mysql_commit_outcome_ambiguous"
      && error.outcomeUnknown === true,
  );
  assert.equal(recoveryLoads, 1);
  assert.equal(store.metrics().ambiguousCommitRecoveries, 0);
});

test("unverified typed COMMIT ambiguity surfaces as storage_outcome_unknown", async () => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const owner = seed.register({
    username: "typedcommitunknown",
    password: "test1234",
    displayName: "模糊提交猎人",
  });
  const before = base.load();
  const store = createAsyncWriteAuthStore({
    mode: "mysql",
    load: () => base.load(),
    async saveAsync() {
      const error = new Error("commit acknowledgement lost");
      error.code = "mysql_commit_outcome_ambiguous";
      error.outcomeUnknown = true;
      throw error;
    },
  }, {onError: () => {}});
  const service = createAuthService({store});

  await assert.rejects(
    service.invokeDurable("profileAction", [owner.session.token, {
      action: "record_point_save",
      payload: {
        recordPoint: {
          mapId: "firebud_training_yard",
          spawnName: "typed_unknown",
          label: "模糊提交记录点",
        },
      },
    }], {
      operationId: "bbo_typed_commit_unknown_0001",
      requestHash: "e".repeat(64),
      actionId: "POST /profile/action",
    }),
    (error) => error.code === "storage_outcome_unknown"
      && error.outcomeUnknown === true,
  );
  assert.deepEqual(service.snapshot(), before);
  assert.equal(store.metrics().ambiguousCommitRecoveries, 0);
});

test("typed COMMIT ambiguity stays outcome-unknown when exact receipt reading fails", async () => {
  const base = createMemoryAuthStore();
  const owner = seedShopAccount(base, "ambiguousexactread");
  let loadCalls = 0;
  let receiptReads = 0;
  const store = createAsyncWriteAuthStore({
    mode: "mysql",
    load() {
      loadCalls += 1;
      return base.load();
    },
    async readDurableMutationReceipt() {
      receiptReads += 1;
      throw new Error("exact receipt database unavailable");
    },
    async saveAsyncOwned() {
      const error = new Error("commit acknowledgement lost");
      error.code = "mysql_commit_outcome_ambiguous";
      error.outcomeUnknown = true;
      throw error;
    },
  }, {onError() {}});
  const service = createAuthService({store});

  await assert.rejects(
    service.invokeDurable("shopTransaction", [owner.session.token, {
      mode: "buy",
      shopId: "firebud_item_shop",
      itemId: "item_meat_small",
      amount: 1,
    }], {
      operationId: "bbo_ambiguous_exact_read_fail_0001",
      requestHash: "1".repeat(64),
      actionId: "POST /shops/transaction",
    }),
    (error) => error.code === "storage_outcome_unknown"
      && error.outcomeUnknown === true,
  );
  assert.equal(loadCalls, 1, "typed ambiguity must reach exact read before any full reload");
  assert.equal(receiptReads, 1);
});

test("typed COMMIT ambiguity blocks re-execution until the same exact receipt becomes visible", async () => {
  const base = createMemoryAuthStore();
  const owner = seedShopAccount(base, "ambigexactmissing");
  const args = [owner.session.token, {
    mode: "buy",
    shopId: "firebud_item_shop",
    itemId: "item_meat_small",
    amount: 1,
  }];
  const operation = {
    operationId: "bbo_ambiguous_exact_missing_0001",
    requestHash: "2".repeat(64),
    actionId: "POST /shops/transaction",
  };
  let loadedReceipt = null;
  let pendingCommit = null;
  let receiptReads = 0;
  let saveAttempts = 0;
  const store = createAsyncWriteAuthStore({
    mode: "mysql",
    load() {
      const snapshot = base.load();
      loadedReceipt = structuredClone(
        snapshot.mutationReceipts[operation.operationId] || null,
      );
      return snapshot;
    },
    async readDurableMutationReceipt(operationId) {
      receiptReads += 1;
      const receipt = structuredClone(base.load().mutationReceipts[operationId] || null);
      return {
        schemaVersion: 1,
        operationId,
        authorityCurrent: JSON.stringify(receipt) === JSON.stringify(loadedReceipt),
        receipt,
      };
    },
    async saveAsyncOwned(nextData) {
      saveAttempts += 1;
      pendingCommit = nextData;
      const error = new Error("commit acknowledgement lost");
      error.code = "mysql_commit_outcome_ambiguous";
      error.outcomeUnknown = true;
      throw error;
    },
  }, {onError() {}});
  const service = createAuthService({store});

  await assert.rejects(
    service.invokeDurable("shopTransaction", args, operation),
    (error) => error.code === "storage_outcome_unknown"
      && error.outcomeUnknown === true,
  );
  assert.equal(receiptReads, 1);
  assert.equal(saveAttempts, 1);
  assert.deepEqual(store.lastSaveOperation(), operation);

  await assert.rejects(
    service.invokeDurable("shopTransaction", ["bad", args[1]], operation),
    (error) => error.code === "storage_outcome_unknown"
      && error.outcomeUnknown === true,
  );
  assert.equal(receiptReads, 1, "a malformed session must not reach MySQL or clear the write gate");
  assert.equal(saveAttempts, 1);
  assert.notEqual(store.lastSaveError(), null);

  await assert.rejects(
    service.invokeDurable("shopTransaction", ["", args[1]], operation),
    (error) => error.code === "storage_outcome_unknown"
      && error.outcomeUnknown === true,
  );
  assert.equal(receiptReads, 1, "an empty session must not reach MySQL or clear the write gate");
  assert.equal(saveAttempts, 1);

  await assert.rejects(
    service.invokeDurable("shopTransaction", args, {
      ...operation,
      operationId: "bbo_ambiguous_other_operation_0001",
    }),
    (error) => error.code === "storage_outcome_unknown"
      && error.outcomeUnknown === true,
  );
  assert.equal(receiptReads, 1, "a different operation must not probe or clear the prior ambiguity");
  assert.equal(saveAttempts, 1);

  await assert.rejects(
    service.invokeDurable("shopTransaction", args, operation),
    (error) => error.code === "storage_outcome_unknown"
      && error.outcomeUnknown === true,
  );
  assert.equal(receiptReads, 2);
  assert.equal(saveAttempts, 1, "an exact miss must not execute the mutation again");

  base.save(pendingCommit);
  const replay = await service.invokeDurable("shopTransaction", args, operation);
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.profile.stoneCoins, 12);
  assert.equal(receiptReads, 3);
  assert.equal(saveAttempts, 1);
  assert.equal(store.lastSaveError(), null);
  assert.equal(store.lastSaveOperation(), null);
});

test("typed COMMIT ambiguity stays outcome-unknown when receipt recovery cannot reload authority", async () => {
  const base = createMemoryAuthStore();
  const owner = seedShopAccount(base, "ambiguousexactreload");
  let loadCalls = 0;
  const operation = {
    operationId: "bbo_ambiguous_exact_reload_0001",
    requestHash: "3".repeat(64),
    actionId: "POST /shops/transaction",
  };
  const store = createAsyncWriteAuthStore({
    mode: "mysql",
    load() {
      loadCalls += 1;
      if (loadCalls > 1) {
        throw new Error("full authority reload unavailable");
      }
      return base.load();
    },
    async readDurableMutationReceipt(operationId) {
      return {
        schemaVersion: 1,
        operationId,
        authorityCurrent: false,
        receipt: structuredClone(base.load().mutationReceipts[operationId]),
      };
    },
    async saveAsyncOwned(nextData) {
      base.save(nextData);
      const error = new Error("commit acknowledgement lost");
      error.code = "mysql_commit_outcome_ambiguous";
      error.outcomeUnknown = true;
      throw error;
    },
  }, {onError() {}});
  const service = createAuthService({store});

  await assert.rejects(
    service.invokeDurable("shopTransaction", [owner.session.token, {
      mode: "buy",
      shopId: "firebud_item_shop",
      itemId: "item_meat_small",
      amount: 1,
    }], operation),
    (error) => error.code === "storage_outcome_unknown"
      && error.outcomeUnknown === true,
  );
  assert.equal(loadCalls, 2);
  assert.equal(base.load().profiles[owner.profileBinding.playerId].profile.stoneCoins, 12);
});

test("typed COMMIT ambiguity replays only after exact hit and bounded authority reload succeed", async () => {
  const base = createMemoryAuthStore();
  const owner = seedShopAccount(base, "ambigexactsuccess");
  let loadCalls = 0;
  let receiptReads = 0;
  const operation = {
    operationId: "bbo_ambiguous_exact_success_0001",
    requestHash: "4".repeat(64),
    actionId: "POST /shops/transaction",
  };
  const store = createAsyncWriteAuthStore({
    mode: "mysql",
    load() {
      loadCalls += 1;
      return base.load();
    },
    async readDurableMutationReceipt(operationId) {
      receiptReads += 1;
      return {
        schemaVersion: 1,
        operationId,
        authorityCurrent: false,
        receipt: structuredClone(base.load().mutationReceipts[operationId]),
      };
    },
    async saveAsyncOwned(nextData) {
      base.save(nextData);
      const error = new Error("commit acknowledgement lost");
      error.code = "mysql_commit_outcome_ambiguous";
      error.outcomeUnknown = true;
      throw error;
    },
  }, {onError() {}});
  const service = createAuthService({store});

  const replay = await service.invokeDurable("shopTransaction", [owner.session.token, {
    mode: "buy",
    shopId: "firebud_item_shop",
    itemId: "item_meat_small",
    amount: 1,
  }], operation);
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.profile.stoneCoins, 12);
  assert.equal(loadCalls, 2);
  assert.equal(receiptReads, 1);
  assert.equal(store.lastSaveError(), null);
});

test("unverifiable commit blocks re-execution until receipt reload proves the first outcome", async (t) => {
  const base = createMemoryAuthStore();
  const registered = seedShopAccount(base, "durableunknown");
  let failLoads = false;
  let saveCount = 0;
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load() {
      if (failLoads) {
        throw new Error("database temporarily unreachable");
      }
      return base.load();
    },
    async saveAsync(nextData) {
      saveCount += 1;
      base.save(nextData);
      failLoads = true;
      throw new Error("connection lost after commit");
    },
  }, {onError: () => {}});
  const service = createAuthService({store});
  const harness = await listen(service);
  t.after(() => closeHarness(harness, service));
  const operationId = "bbo_shop_unknown_outcome_0001";

  const first = await shopRequest(harness.baseUrl, registered.session.token, operationId);
  assert.equal(first.ok, false);
  assert.equal(first.code, "storage_write_failed");
  assert.equal(saveCount, 1);

  const stillUnknown = await shopRequest(harness.baseUrl, registered.session.token, operationId);
  assert.equal(stillUnknown.ok, false);
  assert.equal(stillUnknown.code, "storage_outcome_unknown");
  assert.equal(saveCount, 1);

  failLoads = false;
  const recovered = await shopRequest(harness.baseUrl, registered.session.token, operationId);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.durableCommit.replayed, true);
  assert.equal(recovered.profile.stoneCoins, 12);
  assert.equal(saveCount, 1);
});

test("commit timeout returns no success while background settlement remains retry-idempotent", async (t) => {
  const base = createMemoryAuthStore();
  const registered = seedShopAccount(base, "durabletimeout");
  const writeStarted = deferred();
  const releaseWrite = deferred();
  let saveCount = 0;
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      saveCount += 1;
      writeStarted.resolve();
      await releaseWrite.promise;
      base.save(nextData);
    },
  }, {onError: () => {}});
  const service = createAuthService({store, durableCommitTimeoutMs: 15});
  const harness = await listen(service);
  t.after(() => closeHarness(harness, service));
  const operationId = "bbo_shop_timeout_retry_0001";

  const firstResponsePromise = shopRequest(
    harness.baseUrl,
    registered.session.token,
    operationId,
  );
  await writeStarted.promise;
  const timedOut = await firstResponsePromise;
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.code, "storage_commit_timeout");
  assert.equal(base.load().profiles[registered.profileBinding.playerId].profile.stoneCoins, 20);

  releaseWrite.resolve();
  await service.waitForDurableIdle();
  assert.equal(base.load().profiles[registered.profileBinding.playerId].profile.stoneCoins, 12);

  const replay = await shopRequest(harness.baseUrl, registered.session.token, operationId);
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.profile.stoneCoins, 12);
  assert.equal(saveCount, 1);
});

test("shutdown seals durable admission and drains the already accepted commit", async () => {
  const base = createMemoryAuthStore();
  const registered = seedShopAccount(base, "durableshutdown");
  const writeStarted = deferred();
  const releaseWrite = deferred();
  let saveCount = 0;
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        saveCount += 1;
        writeStarted.resolve();
        await releaseWrite.promise;
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  const first = service.invokeDurable("shopTransaction", [registered.session.token, {
    mode: "buy",
    shopId: "firebud_item_shop",
    itemId: "item_meat_small",
    amount: 1,
  }], {
    operationId: "bbo_shutdown_drain_first_0001",
    actionId: "POST /shops/transaction",
    requestHash: "a".repeat(64),
  });
  await writeStarted.promise;

  let drainSettled = false;
  const drain = service.stopDurableAdmissionsAndDrain().then(() => {
    drainSettled = true;
  });
  await assert.rejects(service.invokeDurable("shopTransaction", [registered.session.token, {
    mode: "buy",
    shopId: "firebud_item_shop",
    itemId: "item_meat_small",
    amount: 1,
  }], {
    operationId: "bbo_shutdown_drain_late_0002",
    actionId: "POST /shops/transaction",
    requestHash: "b".repeat(64),
  }), (error) => error.code === "storage_shutting_down");
  assert.equal(drainSettled, false);
  assert.equal(saveCount, 1);

  releaseWrite.resolve();
  const committed = await first;
  assert.equal(committed.ok, true);
  await drain;
  assert.equal(drainSettled, true);
  assert.equal(base.load().profiles[registered.profileBinding.playerId].profile.stoneCoins, 12);
  assert.equal(saveCount, 1);
});

test("shutdown closes websocket sources before waiting for the HTTP close callback", async () => {
  const calls = [];
  let finishHttpClose = null;
  const server = {
    close(callback) {
      calls.push("http.close");
      finishHttpClose = callback;
    },
    eventHub: {
      close() {
        calls.push("ws.close");
      },
    },
    authService: {
      stopDurableAdmissionsAndDrain() {
        calls.push("durable.stop");
      },
    },
  };
  const store = {
    flush() {
      calls.push("store.flush");
    },
  };

  const drain = drainServerForShutdown(server, store);
  assert.deepEqual(calls, ["http.close", "ws.close", "durable.stop"]);
  assert.equal(typeof finishHttpClose, "function");
  finishHttpClose();
  await drain;
  assert.deepEqual(calls, ["http.close", "ws.close", "durable.stop", "store.flush"]);
});
