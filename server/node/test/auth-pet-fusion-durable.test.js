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
  RECIPE_ID,
  TARGET_FORM_ID,
  createEnabledTestFusionCatalog,
  createTestFusionGrowthCatalog,
  fusionTargetTemplateForFormId,
  seedFusionAccount,
} = require("../test-support/pet-fusion-fixture");
const {
  createPetFusionRandomAuthority,
} = require("../src/auth/pet-fusion-random-authority");

const NOW_MS = Date.parse("2026-07-26T03:00:00.000Z");
const OPERATION = Object.freeze({
  operationId: "pet_fusion_commit_boundary_0001",
  requestHash: "a".repeat(64),
  actionId: "POST /pets/fusion",
});
const DISABLED_TEST_EVOLUTION_CATALOG = Object.freeze({
  schemaVersion: 2,
  catalogId: "test_pet_evolution_disabled",
  runtimeEnabled: false,
  disabledMessage: "融合 durable 测试不启用进化目录。",
  routes: Object.freeze([]),
  routesById: Object.freeze({}),
  targetFormIds: Object.freeze([]),
  manualEncounterRules: Object.freeze([]),
});

function deferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });
  return {promise, resolve};
}

function createFusionService(options = {}) {
  return createAuthService({
    store: options.store,
    now: () => NOW_MS,
    petGrowthCatalog: createTestFusionGrowthCatalog(),
    petEvolutionRouteCatalog: DISABLED_TEST_EVOLUTION_CATALOG,
    petFusionRecipeCatalog: options.catalog,
    petFusionTargetTemplateForFormId: fusionTargetTemplateForFormId,
    petFusionRandomAuthority: createPetFusionRandomAuthority({
      randomBytes(size) {
        return Buffer.alloc(size, 0x55);
      },
    }),
  });
}

function requestFor(account, catalog) {
  return {
    recipeId: RECIPE_ID,
    materialInstanceIds: {
      core: account.materials.core.instanceId,
      resonance_one: account.materials.resonance_one.instanceId,
      resonance_two: account.materials.resonance_two.instanceId,
    },
    expectedProfileRevision: account.profileRevision,
    expectedCatalogId: catalog.catalogId,
  };
}

function seededBase(username) {
  const base = createMemoryAuthStore();
  const catalog = createEnabledTestFusionCatalog();
  const seed = createFusionService({store: base, catalog});
  const account = seedFusionAccount(seed, {
    catalog,
    username,
    coreBinding: "bound",
  });
  return {base, account, catalog};
}

test("fusion publishes no pet consumption or success before owning COMMIT and carries row-local consistency scope", async (t) => {
  const fixture = seededBase("fusion_commit_gate");
  const writeStarted = deferred();
  const releaseWrite = deferred();
  let capturedOptions = null;
  const service = createFusionService({
    catalog: fixture.catalog,
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
  const beforePublished = structuredClone(
    internalProfileForAccount(
      service,
      fixture.account.account.accountId,
    ),
  );
  const beforeStored = structuredClone(fixture.base.load());
  let settled = false;
  const pending = service.invokeDurable("fusePets", [
    fixture.account.session.token,
    requestFor(fixture.account, fixture.catalog),
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
  assert.equal(committed.ok, true, committed.message);
  assert.equal(committed.durableCommit.replayed, false);
  assert.equal(committed.profile.petInstances.length, 1);
  assert.equal(committed.profile.petInstances[0].formId, TARGET_FORM_ID);

  const published = internalProfileForAccount(
    service,
    fixture.account.account.accountId,
  );
  assert.equal(published.petInstances.length, 1);
  assert.equal(published.petInstances[0].formId, TARGET_FORM_ID);
  assert.equal(
    published.activePetInstanceId,
    published.petInstances[0].instanceId,
  );
  const stored = fixture.base.load();
  const binding = stored.profileBindings[fixture.account.account.accountId];
  const storedProfile = stored.profiles[binding.playerId].profile;
  assert.equal(storedProfile.petInstances.length, 1);
  assert.equal(storedProfile.petInstances[0].formId, TARGET_FORM_ID);
});

test("confirmed fusion rollback preserves all three source pets and publishes zero mutation", async () => {
  const fixture = seededBase("fusion_rollback");
  const beforeStored = structuredClone(fixture.base.load());
  const service = createFusionService({
    catalog: fixture.catalog,
    store: createAsyncWriteAuthStore({
      mode: "mysql",
      load: () => fixture.base.load(),
      async saveAsync() {
        const error = new Error("injected fusion transaction rollback");
        error.code = "mysql_transaction_rolled_back";
        error.outcomeUnknown = false;
        error.rollbackConfirmed = true;
        throw error;
      },
    }, {onError: () => {}}),
  });
  const beforePublished = structuredClone(
    internalProfileForAccount(
      service,
      fixture.account.account.accountId,
    ),
  );

  await assert.rejects(
    service.invokeDurable("fusePets", [
      fixture.account.session.token,
      requestFor(fixture.account, fixture.catalog),
    ], {
      ...OPERATION,
      operationId: "pet_fusion_confirmed_rollback_0001",
    }),
    (error) => (
      error.code === "storage_write_failed"
      && error.outcomeUnknown === false
    ),
  );
  assert.deepEqual(fixture.base.load(), beforeStored);
  assert.deepEqual(
    internalProfileForAccount(service, fixture.account.account.accountId),
    beforePublished,
  );
  assert.equal(beforePublished.petInstances.length, 3);
  assert.deepEqual(
    beforePublished.petInstances.map((pet) => pet.instanceId),
    [
      fixture.account.materials.core.instanceId,
      fixture.account.materials.resonance_one.instanceId,
      fixture.account.materials.resonance_two.instanceId,
    ],
  );
});
