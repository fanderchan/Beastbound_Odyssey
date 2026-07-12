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

test("websocket handshake durably repairs a missing profile before accepting the player", async (t) => {
  const base = createMemoryAuthStore();
  const seedService = createAuthService({store: base});
  const registered = seedService.register({
    username: "durablewsrepair",
    password: "test1234",
    displayName: "握手补档",
  });
  const damaged = base.load();
  delete damaged.profileBindings[registered.account.accountId];
  delete damaged.profiles[registered.profileBinding.playerId];
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
  ws.close();
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
