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
  webSocketOpen,
  webSocketJsonReader,
  profileItemCount,
} = require("../test-support/auth-service-test-context");
const {drainServerForShutdown} = require("../src/http-server");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return {promise, resolve, reject};
}

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
  const ws = new WebSocket(eventStreamUrl(wsBase, registered.session.token));
  const reader = webSocketJsonReader(ws);

  await webSocketOpen(ws);
  const ready = await reader.next("events.ready");
  assert.equal(ready.account.username, "durablewsrepair");
  assert.equal(saveCount, 1);
  assert.ok(base.load().profileBindings[registered.account.accountId]);
  assert.equal(Array.isArray(base.load().profiles[registered.profileBinding.playerId].profile), false);
  ws.close();
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
  const removal = events.find((event) => (
    event.type === "online.position"
    && event.accountId === actor.account.accountId
    && event.position === null
  ));
  assert.notEqual(removal, undefined);
  const roster = service.listOnlinePlayers(watcher.session.token, {scope: "map", mapId: "map_a"});
  assert.equal(roster.players.some((player) => player.accountId === actor.account.accountId), false);
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

  const replay = await service.invokeDurable("bankWithdraw", args, operation);
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(saveAttempts, 2);
  assert.deepEqual(base.load(), after);
});

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
