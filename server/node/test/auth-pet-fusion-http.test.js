"use strict";

const {
  assert,
  test,
  once,
  createAuthService,
  createMemoryAuthStore,
  createHttpServer,
  fetchJson,
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

const NOW_MS = Date.parse("2026-07-26T02:00:00.000Z");
const DISABLED_TEST_EVOLUTION_CATALOG = Object.freeze({
  schemaVersion: 2,
  catalogId: "test_pet_evolution_disabled",
  runtimeEnabled: false,
  disabledMessage: "融合 HTTP 测试不启用进化目录。",
  routes: Object.freeze([]),
  routesById: Object.freeze({}),
  targetFormIds: Object.freeze([]),
  manualEncounterRules: Object.freeze([]),
});

function quoteRequest(account) {
  return {
    recipeId: RECIPE_ID,
    materialInstanceIds: {
      core: account.materials.core.instanceId,
      resonance_one: account.materials.resonance_one.instanceId,
      resonance_two: account.materials.resonance_two.instanceId,
    },
  };
}

function executeRequest(account, catalog, overrides = {}) {
  return {
    ...quoteRequest(account),
    expectedProfileRevision: account.profileRevision,
    expectedCatalogId: catalog.catalogId,
    ...overrides,
  };
}

test("HTTP fusion quote needs no idempotency key while mutation is exact, conflict-safe, replay-safe, and private", async (t) => {
  const store = createMemoryAuthStore();
  const catalog = createEnabledTestFusionCatalog();
  const service = createAuthService({
    store,
    now: () => NOW_MS,
    petGrowthCatalog: createTestFusionGrowthCatalog(),
    petEvolutionRouteCatalog: DISABLED_TEST_EVOLUTION_CATALOG,
    petFusionRecipeCatalog: catalog,
    petFusionTargetTemplateForFormId: fusionTargetTemplateForFormId,
    petFusionRandomAuthority: createPetFusionRandomAuthority({
      randomBytes(size) {
        return Buffer.alloc(size, 0x55);
      },
    }),
  });
  const account = seedFusionAccount(service, {
    catalog,
    username: "fusionhttp",
    coreBinding: "bound",
  });
  const before = structuredClone(
    internalProfileForAccount(service, account.account.accountId),
  );
  const sourcePrivateSeeds = before.petInstances.map(
    (pet) => pet.petGrowth.private.privateSeed,
  );
  const server = createHttpServer({service, store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await service.waitForDurableIdle();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const authorization = {
    authorization: `Bearer ${account.session.token}`,
  };

  const unauthorized = await fetchJson(`${base}/pets/fusion/quote`, {
    method: "POST",
    body: JSON.stringify(quoteRequest(account)),
  });
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.code, "session_missing");

  const quote = await fetchJson(`${base}/pets/fusion/quote`, {
    method: "POST",
    headers: authorization,
    body: JSON.stringify(quoteRequest(account)),
  });
  assert.equal(quote.ok, true, quote.message);
  assert.equal(quote.petFusionQuote.catalogId, catalog.catalogId);
  assert.equal(quote.petFusionQuote.result.targetFormId, TARGET_FORM_ID);
  assert.equal(
    quote.petFusionQuote.inheritance.ordinaryOrTrainingActiveInheritance,
    false,
  );
  assert.deepEqual(
    internalProfileForAccount(service, account.account.accountId),
    before,
  );

  const missingKey = await fetchJson(`${base}/pets/fusion`, {
    method: "POST",
    headers: authorization,
    body: JSON.stringify(executeRequest(account, catalog)),
  });
  assert.equal(missingKey.ok, false);
  assert.equal(missingKey.code, "idempotency_key_required");

  const staleCatalog = await fetchJson(`${base}/pets/fusion`, {
    method: "POST",
    headers: {
      ...authorization,
      "Idempotency-Key": "pet_fusion_http_stale_catalog_0001",
    },
    body: JSON.stringify(executeRequest(account, catalog, {
      expectedCatalogId: "pet_fusion_recipes_stale",
    })),
  });
  assert.equal(staleCatalog.ok, false);
  assert.equal(staleCatalog.code, "pet_fusion_catalog_conflict");

  const staleRevision = await fetchJson(`${base}/pets/fusion`, {
    method: "POST",
    headers: {
      ...authorization,
      "Idempotency-Key": "pet_fusion_http_stale_revision_0001",
    },
    body: JSON.stringify(executeRequest(account, catalog, {
      expectedProfileRevision: account.profileRevision + 1,
    })),
  });
  assert.equal(staleRevision.ok, false);
  assert.equal(staleRevision.code, "revision_conflict");
  assert.deepEqual(
    internalProfileForAccount(service, account.account.accountId),
    before,
  );

  const operationId = "pet_fusion_http_success_0001";
  const first = await fetchJson(`${base}/pets/fusion`, {
    method: "POST",
    headers: {
      ...authorization,
      "Idempotency-Key": operationId,
    },
    body: JSON.stringify(executeRequest(account, catalog)),
  });
  assert.equal(first.ok, true, first.message);
  assert.equal(first.durableCommit.replayed, false);
  assert.equal(first.petFusion.targetFormId, TARGET_FORM_ID);
  assert.equal(first.profile.petInstances.length, 1);
  assert.equal(first.profile.petInstances[0].binding, "bound");
  assert.deepEqual(first.profile.petInstances[0].activeSkillIds, [
    "pet_attack",
    "pet_defend",
    "pet_gene_gamma_roar",
  ]);
  assert.equal(first.profile.petInstances[0].passiveSkillIds.length, 1);
  assert.equal(Object.hasOwn(first.profile.petInstances[0], "fusionPrivate"), false);
  assert.equal(
    Object.hasOwn(first.profile.petInstances[0].petGrowth, "private"),
    false,
  );

  const afterFirst = structuredClone(
    internalProfileForAccount(service, account.account.accountId),
  );
  assert.equal(afterFirst.petInstances.length, 1);
  const internalPet = afterFirst.petInstances[0];
  const firstJson = JSON.stringify(first);
  assert.equal(firstJson.includes(internalPet.fusionPrivate.privateRootSeed), false);
  assert.equal(firstJson.includes(internalPet.fusionPrivate.growthPrivateSeed), false);
  assert.equal(firstJson.includes(internalPet.petGrowth.private.privateSeed), false);
  for (const seed of sourcePrivateSeeds) {
    assert.equal(firstJson.includes(seed), false);
    assert.equal(JSON.stringify(quote).includes(seed), false);
  }

  const replay = await fetchJson(`${base}/pets/fusion`, {
    method: "POST",
    headers: {
      ...authorization,
      "Idempotency-Key": operationId,
    },
    body: JSON.stringify(executeRequest(account, catalog)),
  });
  assert.equal(replay.ok, true, replay.message);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(
    replay.petFusion.resultInstanceId,
    first.petFusion.resultInstanceId,
  );
  assert.equal(
    replay.profileBinding.profileRevision,
    first.profileBinding.profileRevision,
  );
  assert.deepEqual(
    internalProfileForAccount(service, account.account.accountId),
    afterFirst,
  );
});
