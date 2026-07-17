"use strict";

const {
  assert,
  test,
  createAuthService,
  createAsyncWriteAuthStore,
  createMemoryAuthStore,
  internalProfileForAccount,
} = require("../test-support/auth-service-test-context");
const {seedPaidResetAccount} = require("../test-support/pet-paid-reset-fixture");

const NOW_MS = Date.parse("2026-07-17T15:00:00.000Z");
const OPERATION = Object.freeze({
  operationId: "paid_reset_commit_boundary_0001",
  requestHash: "9".repeat(64),
  actionId: "POST /pets/paid-reset",
});

function deferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });
  return {promise, resolve};
}

function requestFor(account) {
  return {
    instanceId: account.fixture.pet.instanceId,
    expectedProfileRevision: account.profileRevision,
    expectedPriceConfigRevision: 0,
  };
}

function seededBase(username) {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base, now: () => NOW_MS});
  const account = seedPaidResetAccount(seed, {username});
  return {base, account};
}

test("paid reset publishes no success, currency, or pet mutation before the owning COMMIT", async (t) => {
  const fixture = seededBase("prs_commitgate");
  const writeStarted = deferred();
  const releaseWrite = deferred();
  let capturedOptions = null;
  const service = createAuthService({
    now: () => NOW_MS,
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => fixture.base.load(),
      async saveAsync(nextData, options) {
        capturedOptions = structuredClone(options);
        writeStarted.resolve();
        await releaseWrite.promise;
        fixture.base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  t.after(async () => {
    releaseWrite.resolve();
    await service.waitForDurableIdle();
  });
  const beforePublished = structuredClone(internalProfileForAccount(
    service,
    fixture.account.account.accountId,
  ));
  const beforeStored = structuredClone(fixture.base.load());
  let settled = false;
  const pending = service.invokeDurable("paidResetPet", [
    fixture.account.session.token,
    requestFor(fixture.account),
  ], OPERATION).then((result) => {
    settled = true;
    return result;
  });

  await writeStarted.promise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  assert.deepEqual(
    internalProfileForAccount(service, fixture.account.account.accountId),
    beforePublished,
  );
  assert.deepEqual(fixture.base.load(), beforeStored);
  assert.deepEqual(capturedOptions.consistencyScope, {
    kind: "row_local_profile_v1",
    accountId: fixture.account.account.accountId,
    playerId: fixture.account.profileBinding.playerId,
    ...OPERATION,
  });

  releaseWrite.resolve();
  const committed = await pending;
  assert.equal(committed.ok, true);
  assert.equal(committed.durableCommit.replayed, false);
  const published = internalProfileForAccount(service, fixture.account.account.accountId);
  assert.equal(published.petInstances[0].level, 1);
  assert.equal(published.petInstances[0].paidResetCount, 1);
  assert.equal(published.boundDiamonds, 0);
  assert.equal(published.diamonds, 50);
  const stored = fixture.base.load();
  const binding = stored.profileBindings[fixture.account.account.accountId];
  assert.equal(stored.profiles[binding.playerId].profile.petInstances[0].paidResetCount, 1);
});

test("confirmed storage rollback returns no success and leaves paid-reset assets untouched", async () => {
  const fixture = seededBase("prs_rollback");
  const before = structuredClone(fixture.base.load());
  let saveAttempts = 0;
  const service = createAuthService({
    now: () => NOW_MS,
    store: createAsyncWriteAuthStore({
      mode: "mysql",
      load: () => fixture.base.load(),
      async saveAsync() {
        saveAttempts += 1;
        const error = new Error("injected transaction rollback");
        error.code = "mysql_transaction_rolled_back";
        error.outcomeUnknown = false;
        error.rollbackConfirmed = true;
        throw error;
      },
    }, {onError: () => {}}),
  });

  await assert.rejects(
    service.invokeDurable("paidResetPet", [
      fixture.account.session.token,
      requestFor(fixture.account),
    ], {...OPERATION, operationId: "paid_reset_confirmed_rollback_0001"}),
    (error) => error.code === "storage_write_failed" && error.outcomeUnknown === false,
  );
  assert.equal(saveAttempts, 1);
  assert.deepEqual(fixture.base.load(), before);
  const published = internalProfileForAccount(service, fixture.account.account.accountId);
  assert.equal(published.petInstances[0].level, 88);
  assert.equal(Object.hasOwn(published.petInstances[0], "paidResetCount"), false);
  assert.equal(published.boundDiamonds, 250);
  assert.equal(published.diamonds, 100);
});

test("ambiguous COMMIT returns success only after the exact paid-reset receipt proves one commit", async () => {
  const fixture = seededBase("prs_ambiguous");
  let loadedReceipt = null;
  let receiptReads = 0;
  let saveAttempts = 0;
  const operation = {...OPERATION, operationId: "paid_reset_ambiguous_commit_0001"};
  const service = createAuthService({
    now: () => NOW_MS,
    store: createAsyncWriteAuthStore({
      mode: "mysql",
      load() {
        const snapshot = fixture.base.load();
        loadedReceipt = structuredClone(snapshot.mutationReceipts[operation.operationId] || null);
        return snapshot;
      },
      async readDurableMutationReceipt(operationId) {
        receiptReads += 1;
        const receipt = structuredClone(fixture.base.load().mutationReceipts[operationId] || null);
        return {
          schemaVersion: 1,
          operationId,
          authorityCurrent: JSON.stringify(receipt) === JSON.stringify(loadedReceipt),
          receipt,
        };
      },
      async saveAsyncOwned(nextData) {
        saveAttempts += 1;
        fixture.base.save(nextData);
        const error = new Error("injected lost COMMIT acknowledgement");
        error.code = "mysql_commit_outcome_ambiguous";
        error.outcomeUnknown = true;
        throw error;
      },
    }, {onError: () => {}}),
  });

  const recovered = await service.invokeDurable("paidResetPet", [
    fixture.account.session.token,
    requestFor(fixture.account),
  ], operation);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.durableCommit.replayed, true);
  assert.equal(receiptReads, 1);
  assert.equal(saveAttempts, 1);
  assert.equal(recovered.profile.petInstances[0].paidResetCount, 1);
  assert.equal(recovered.profile.boundDiamonds, 0);
  assert.equal(recovered.profile.diamonds, 50);
  const stored = fixture.base.load();
  const binding = stored.profileBindings[fixture.account.account.accountId];
  const profile = stored.profiles[binding.playerId].profile;
  assert.equal(profile.petInstances[0].paidResetCount, 1);
  assert.equal(profile.boundDiamonds, 0);
  assert.equal(profile.diamonds, 50);
});
