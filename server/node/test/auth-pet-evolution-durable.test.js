"use strict";

const {
  assert,
  test,
  createAuthService,
  createAsyncWriteAuthStore,
  createMemoryAuthStore,
  internalProfileForAccount,
} = require("../test-support/auth-service-test-context");
const {
  CORE_ITEM_ID,
  LINEAGE_ITEM_ID,
  ROUTE_ID,
  SOURCE_FORM_ID,
  TARGET_FORM_ID,
  createEnabledPetEvolutionRouteCatalog,
  seedEvolutionAccount,
} = require("../test-support/pet-evolution-fixture");

const NOW_MS = Date.parse("2026-07-18T06:00:00.000Z");
const OPERATION = Object.freeze({
  operationId: "pet_evolution_commit_boundary_0001",
  requestHash: "a".repeat(64),
  actionId: "POST /pets/evolution",
});

function deferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });
  return {promise, resolve};
}

function requestFor(account, catalog) {
  return {
    instanceId: account.fixture.pet.instanceId,
    routeId: ROUTE_ID,
    expectedProfileRevision: account.profileRevision,
    expectedCatalogId: catalog.catalogId,
  };
}

function itemCount(profile, itemId) {
  return (Array.isArray(profile.backpackSlots) ? profile.backpackSlots : [])
    .filter((slot) => String(slot && slot.itemId || "") === itemId)
    .reduce((sum, slot) => sum + Number(slot.count || 0), 0);
}

function seededBase(username) {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base, now: () => NOW_MS});
  const account = seedEvolutionAccount(seed, {username});
  return {base, account};
}

test("evolution publishes no success, pet reroll, or asset debit before the owning COMMIT", async (t) => {
  const fixture = seededBase("evolutioncommitgate");
  const catalog = createEnabledPetEvolutionRouteCatalog();
  const writeStarted = deferred();
  const releaseWrite = deferred();
  let capturedOptions = null;
  const service = createAuthService({
    now: () => NOW_MS,
    petEvolutionRouteCatalog: catalog,
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
  const beforePublished = structuredClone(internalProfileForAccount(service, fixture.account.account.accountId));
  const beforeStored = structuredClone(fixture.base.load());
  let settled = false;
  const pending = service.invokeDurable("evolvePet", [
    fixture.account.session.token,
    requestFor(fixture.account, catalog),
  ], OPERATION).then((result) => {
    settled = true;
    return result;
  });

  await writeStarted.promise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  assert.deepEqual(internalProfileForAccount(service, fixture.account.account.accountId), beforePublished);
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
  assert.equal(published.petInstances[0].formId, TARGET_FORM_ID);
  assert.equal(published.petInstances[0].evolutionLineage.stageSnapshots[1].formId, SOURCE_FORM_ID);
  assert.equal(published.boundStoneCoins, 0);
  assert.equal(published.stoneCoins, 50000);
  assert.equal(itemCount(published, CORE_ITEM_ID), 0);
  assert.equal(itemCount(published, LINEAGE_ITEM_ID), 0);
  const stored = fixture.base.load();
  const binding = stored.profileBindings[fixture.account.account.accountId];
  assert.equal(stored.profiles[binding.playerId].profile.petInstances[0].formId, TARGET_FORM_ID);
});

test("confirmed evolution rollback leaves the source pet and every asset untouched", async () => {
  const fixture = seededBase("evolutionrollback");
  const catalog = createEnabledPetEvolutionRouteCatalog();
  const before = structuredClone(fixture.base.load());
  const service = createAuthService({
    now: () => NOW_MS,
    petEvolutionRouteCatalog: catalog,
    store: createAsyncWriteAuthStore({
      mode: "mysql",
      load: () => fixture.base.load(),
      async saveAsync() {
        const error = new Error("injected evolution transaction rollback");
        error.code = "mysql_transaction_rolled_back";
        error.outcomeUnknown = false;
        error.rollbackConfirmed = true;
        throw error;
      },
    }, {onError: () => {}}),
  });

  await assert.rejects(
    service.invokeDurable("evolvePet", [
      fixture.account.session.token,
      requestFor(fixture.account, catalog),
    ], {...OPERATION, operationId: "pet_evolution_confirmed_rollback_0001"}),
    (error) => error.code === "storage_write_failed" && error.outcomeUnknown === false,
  );
  assert.deepEqual(fixture.base.load(), before);
  const published = internalProfileForAccount(service, fixture.account.account.accountId);
  assert.equal(published.petInstances[0].formId, SOURCE_FORM_ID);
  assert.equal(published.boundStoneCoins, 250000);
  assert.equal(published.stoneCoins, 100000);
  assert.equal(itemCount(published, CORE_ITEM_ID), 8);
  assert.equal(itemCount(published, LINEAGE_ITEM_ID), 12);
});
