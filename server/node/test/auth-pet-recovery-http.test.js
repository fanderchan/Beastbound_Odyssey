"use strict";

const {
  assert,
  test,
  once,
  createAuthService,
  createAsyncWriteAuthStore,
  createMemoryAuthStore,
  createHttpServer,
  battleProfile,
  fetchJson,
  internalProfileForAccount,
} = require("../test-support/auth-service-test-context");
const {stagePetCapture} = require("../src/auth/pet-capture-shelter");

function stagedPet(privateSeed) {
  return {
    instanceId: "pet_http_recovery_1",
    petId: "pet_http_recovery_1",
    formId: "blue_man_dragon_water10",
    templateId: "blue_man_dragon_water10",
    speciesId: "blue_man_dragon_water10",
    name: "待取回蓝人龙",
    state: "standby",
    source: "wild_capture",
    capturedSerial: 1,
    capturedBattleRoomId: "battle_room_http_recovery",
    capturedBattleActorId: "wild_http_recovery",
    capturedByAccountId: "",
    level: 1,
    exp: 0,
    hp: 65,
    maxHp: 65,
    attack: 14,
    defense: 9,
    quick: 6,
    initialStats: {maxHp: 65, attack: 14, defense: 9, quick: 6},
    petGrowth: {
      schemaVersion: 1,
      private: {
        privateSeed,
        privateRoll: {innateGrowthBonus: {maxHp: 1.2, attack: 0.3, defense: -0.1, quick: 0.2}},
      },
    },
  };
}

function seedRecoveryStore() {
  const store = createMemoryAuthStore();
  const seed = createAuthService({store, allowFullProfileSave: true});
  const owner = seed.register({username: "httprecoveryowner", password: "test1234", displayName: "HTTP收容号"});
  const other = seed.register({username: "httprecoveryother", password: "test1234", displayName: "其他账号"});
  const profile = battleProfile("HTTP收容号", {
    level: 10,
    hp: 160,
    maxHp: 160,
    attack: 24,
    defense: 12,
    quick: 80,
  });
  assert.equal(seed.saveProfile(owner.session.token, {expectedRevision: 0, profile}).ok, true);
  const privateSeed = "c".repeat(64);
  const snapshot = seed.snapshot();
  const binding = snapshot.profileBindings[owner.account.accountId];
  const internal = snapshot.profiles[binding.playerId].profile;
  const pet = stagedPet(privateSeed);
  pet.capturedByAccountId = owner.account.accountId;
  const staged = stagePetCapture(internal, {
    roomId: pet.capturedBattleRoomId,
    actorId: pet.capturedBattleActorId,
    pet,
    createdAt: "2026-07-17T06:00:00.000Z",
  });
  assert.equal(staged.ok, true);
  store.save(snapshot);
  return {store, owner, other, staged, pet, privateSeed};
}

function deferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });
  return {promise, resolve};
}

test("HTTP pet recovery is discoverable, idempotent, private, and owner-scoped", async (t) => {
  const fixture = seedRecoveryStore();
  const service = createAuthService({store: fixture.store});
  const server = createHttpServer({service, store: fixture.store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const ownerAuthorization = {authorization: `Bearer ${fixture.owner.session.token}`};

  const listed = await fetchJson(`${base}/pets/recovery`, {headers: ownerAuthorization});
  assert.equal(listed.ok, true);
  assert.equal(listed.count, 1);
  assert.equal(listed.recoveries[0].recoveryId, fixture.staged.recoveryId);
  assert.equal(JSON.stringify(listed).includes(fixture.privateSeed), false);
  assert.equal(JSON.stringify(listed).includes("privateRoll"), false);

  const battleMissingKey = await fetchJson(`${base}/battle/rooms/battle_room_missing/commands`, {
    method: "POST",
    headers: ownerAuthorization,
    body: JSON.stringify({round: 1, actionId: "defend"}),
  });
  assert.equal(battleMissingKey.ok, false);
  assert.equal(battleMissingKey.code, "idempotency_key_required");

  const missingKey = await fetchJson(`${base}/pets/recovery/${fixture.staged.recoveryId}/claim`, {
    method: "POST",
    headers: ownerAuthorization,
  });
  assert.equal(missingKey.ok, false);
  assert.equal(missingKey.code, "idempotency_key_required");
  const malformedKey = await fetchJson(`${base}/pets/recovery/${fixture.staged.recoveryId}/claim`, {
    method: "POST",
    headers: {...ownerAuthorization, "Idempotency-Key": "short"},
  });
  assert.equal(malformedKey.ok, false);
  assert.equal(malformedKey.code, "idempotency_key_invalid");

  const otherClaim = await fetchJson(`${base}/pets/recovery/${fixture.staged.recoveryId}/claim`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${fixture.other.session.token}`,
      "Idempotency-Key": "operation_pet_recovery_other_0001",
    },
  });
  assert.equal(otherClaim.ok, false);
  assert.equal(otherClaim.code, "pet_capture_shelter_pending_missing");

  const operationId = "operation_pet_recovery_owner_0001";
  const first = await fetchJson(`${base}/pets/recovery/${fixture.staged.recoveryId}/claim`, {
    method: "POST",
    headers: {...ownerAuthorization, "Idempotency-Key": operationId},
  });
  assert.equal(first.ok, true);
  assert.equal(first.recovery.replayed, false);
  assert.equal(first.recovery.instanceId, fixture.pet.instanceId);
  assert.equal(first.durableCommit.replayed, false);
  assert.equal(JSON.stringify(first).includes(fixture.privateSeed), false);
  assert.equal(JSON.stringify(first).includes("petRecoveryShelter"), false);
  const firstRevision = first.profileBinding.profileRevision;

  const sameKey = await fetchJson(`${base}/pets/recovery/${fixture.staged.recoveryId}/claim`, {
    method: "POST",
    headers: {...ownerAuthorization, "Idempotency-Key": operationId},
  });
  assert.equal(sameKey.ok, true);
  assert.equal(sameKey.durableCommit.replayed, true);
  assert.equal(sameKey.recovery.instanceId, first.recovery.instanceId);
  assert.equal(sameKey.profileBinding.profileRevision, firstRevision);

  const completedReplay = await fetchJson(`${base}/pets/recovery/${fixture.staged.recoveryId}/claim`, {
    method: "POST",
    headers: {...ownerAuthorization, "Idempotency-Key": "operation_pet_recovery_owner_0002"},
  });
  assert.equal(completedReplay.ok, true);
  assert.equal(completedReplay.recovery.replayed, true);
  assert.equal(completedReplay.profileBinding.profileRevision, firstRevision);
  const ownerInternal = internalProfileForAccount(service, fixture.owner.account.accountId);
  assert.equal(ownerInternal.petInstances.filter((pet) => pet.instanceId === fixture.pet.instanceId).length, 1);
  assert.equal(Object.keys(ownerInternal.petRecoveryShelter.pending).length, 0);
  assert.equal(JSON.stringify(service.snapshot().mutationReceipts).includes(fixture.privateSeed), false);
  assert.equal(JSON.stringify(service.snapshot().mutationReceipts).includes("petRecoveryShelter"), false);
});

test("HTTP profile read waits for orphan capture recovery to commit", async (t) => {
  const fixture = seedRecoveryStore();
  const writeStarted = deferred();
  const releaseWrite = deferred();
  let saveCount = 0;
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => fixture.store.load(),
      async saveAsync(nextData) {
        saveCount += 1;
        writeStarted.resolve();
        await releaseWrite.promise;
        fixture.store.save(nextData);
      },
    }, {onError: () => {}}),
  });
  assert.equal(service.markEventConnection({
    accountId: fixture.owner.account.accountId,
    sessionId: fixture.owner.session.sessionId,
  }, true).ok, true);
  const server = createHttpServer({service, store: fixture.store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    releaseWrite.resolve();
    await service.waitForDurableIdle();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  let responseSettled = false;
  const responsePromise = fetchJson(`${base}/profiles/me`, {
    headers: {authorization: `Bearer ${fixture.owner.session.token}`},
  }).then((response) => {
    responseSettled = true;
    return response;
  });
  await writeStarted.promise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(responseSettled, false);
  assert.equal(saveCount, 1);
  assert.equal(
    Object.keys(internalProfileForAccount(service, fixture.owner.account.accountId).petRecoveryShelter.pending).length,
    1,
  );

  releaseWrite.resolve();
  const response = await responsePromise;
  assert.equal(response.ok, true);
  assert.equal(response.profile.petInstances.some((pet) => pet.instanceId === fixture.pet.instanceId), true);
  assert.equal(Object.hasOwn(response.profile, "petRecoveryShelter"), false);
  assert.equal(JSON.stringify(response).includes(fixture.privateSeed), false);
  const persisted = fixture.store.load();
  const binding = persisted.profileBindings[fixture.owner.account.accountId];
  assert.equal(Object.keys(persisted.profiles[binding.playerId].profile.petRecoveryShelter.pending).length, 0);
});

test("HTTP profile recovery returns no success and publishes no pet when storage fails", async (t) => {
  const fixture = seedRecoveryStore();
  let saveAttempts = 0;
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => fixture.store.load(),
      async saveAsync() {
        saveAttempts += 1;
        throw new Error("injected recovery storage failure");
      },
    }, {onError: () => {}}),
  });
  assert.equal(service.markEventConnection({
    accountId: fixture.owner.account.accountId,
    sessionId: fixture.owner.session.sessionId,
  }, true).ok, true);
  const server = createHttpServer({service, store: fixture.store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await service.waitForDurableIdle();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const response = await fetchJson(`${base}/profiles/me`, {
    headers: {authorization: `Bearer ${fixture.owner.session.token}`},
  });
  assert.equal(response.ok, false);
  assert.equal(response.code, "storage_write_failed");
  assert.equal(saveAttempts, 1);
  const cached = internalProfileForAccount(service, fixture.owner.account.accountId);
  assert.equal(cached.petInstances.some((pet) => pet.instanceId === fixture.pet.instanceId), false);
  assert.equal(Object.keys(cached.petRecoveryShelter.pending).length, 1);
  const persisted = fixture.store.load();
  const binding = persisted.profileBindings[fixture.owner.account.accountId];
  const storedProfile = persisted.profiles[binding.playerId].profile;
  assert.equal(storedProfile.petInstances.some((pet) => pet.instanceId === fixture.pet.instanceId), false);
  assert.equal(Object.keys(storedProfile.petRecoveryShelter.pending).length, 1);
});
