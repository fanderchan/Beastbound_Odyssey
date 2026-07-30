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
  loadPetFusionRecipeCatalog,
  PET_FUSION_ROLE_IDS,
} = require("../src/auth/pet-fusion-recipe-catalog");
const {
  loadPetGrowthCatalog,
} = require("../src/auth/pet-growth-catalog");
const {
  createPetFusionRandomAuthority,
} = require("../src/auth/pet-fusion-random-authority");
const {
  inspectPetFusionEligibility,
} = require("../src/auth/pet-fusion");
const {
  createEnabledTestFusionCatalog,
  createFusionMaterial,
  createTestFusionGrowthCatalog,
  fusionTargetTemplateForFormId,
  seedFusionAccount,
} = require("../test-support/pet-fusion-fixture");

const NOW_MS = Date.parse("2026-07-30T02:00:00.000Z");
const FORMAL_RECIPE_ID = "emberhorn_solar_crown_fusion_v1";
const FORMAL_MOSS_RECIPE_ID = "emberhorn_moss_rampart_fusion_v1";
const MATERIAL_INSTANCE_IDS = Object.freeze({
  core: "pet_closed_core",
  resonance_one: "pet_closed_resonance_one",
  resonance_two: "pet_closed_resonance_two",
});
const PRODUCTION_ROUTE_CASES = Object.freeze([
  Object.freeze({
    name: "曜冠角兽路线",
    recipeId: FORMAL_RECIPE_ID,
    geneProfileIdsByRole: Object.freeze({
      core: "fusion_gene_emberhorn_red_v1",
      resonance_one: "fusion_gene_emberhorn_gale_v1",
      resonance_two: "fusion_gene_mossback_sunbaked_v1",
    }),
  }),
  Object.freeze({
    name: "苔垒角兽路线",
    recipeId: FORMAL_MOSS_RECIPE_ID,
    geneProfileIdsByRole: Object.freeze({
      core: "fusion_gene_emberhorn_ash_v1",
      resonance_one: "fusion_gene_mossback_marsh_v1",
      resonance_two: "fusion_gene_emberhorn_red_v1",
    }),
  }),
]);
const DISABLED_TEST_EVOLUTION_CATALOG = Object.freeze({
  schemaVersion: 2,
  catalogId: "test_pet_evolution_disabled",
  runtimeEnabled: false,
  disabledMessage: "关闭态回执测试不启用进化目录。",
  routes: Object.freeze([]),
  routesById: Object.freeze({}),
  targetFormIds: Object.freeze([]),
  manualEncounterRules: Object.freeze([]),
});

function createCountingMemoryStore(initialData = null) {
  const backing = createMemoryAuthStore(initialData);
  let saveCount = 0;
  const store = {
    mode: backing.mode,
    checkHealth() {
      return backing.checkHealth();
    },
    checkHealthAsync() {
      return backing.checkHealthAsync();
    },
    load() {
      return backing.load();
    },
    save(nextData) {
      saveCount += 1;
      return backing.save(nextData);
    },
  };
  return {
    store,
    saveCount() {
      return saveCount;
    },
  };
}

function quoteRequest(
  recipeId = FORMAL_RECIPE_ID,
  materialInstanceIds = MATERIAL_INSTANCE_IDS,
) {
  return {
    recipeId,
    materialInstanceIds: {...materialInstanceIds},
  };
}

function executeRequest(
  profileRevision,
  catalogId,
  overrides = {},
  recipeId = FORMAL_RECIPE_ID,
  materialInstanceIds = MATERIAL_INSTANCE_IDS,
) {
  return {
    ...quoteRequest(recipeId, materialInstanceIds),
    expectedProfileRevision: profileRevision,
    expectedCatalogId: catalogId,
    ...overrides,
  };
}

async function postJson(base, path, payload, headers = {}) {
  return fetchJson(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

function seedProductionFusionMaterials(service, catalog, routeCase, username) {
  const registered = service.register({
    username,
    password: "test1234",
    displayName: `${routeCase.name}关闭态猎人`,
  });
  assert.equal(registered.ok, true, registered.message);
  const loaded = service.getProfile(registered.session.token);
  assert.equal(loaded.ok, true, loaded.message);
  const growthCatalog = loadPetGrowthCatalog();
  const materials = {};
  for (const [index, roleId] of PET_FUSION_ROLE_IDS.entries()) {
    const geneProfileId = routeCase.geneProfileIdsByRole[roleId];
    const geneProfile = catalog.geneProfilesById[geneProfileId];
    assert.ok(geneProfile, `missing production gene profile ${geneProfileId}`);
    materials[roleId] = createFusionMaterial(geneProfile, {
      growthCatalog,
      instanceId: `${username}_${roleId}`,
      privateSeedByte: 0x61 + index,
      state: index === 0 ? "battle" : (index === 1 ? "standby" : "storage"),
    });
  }
  const profile = structuredClone(loaded.profile);
  profile.petInstances = PET_FUSION_ROLE_IDS.map((roleId) => materials[roleId]);
  profile.activePetInstanceId = materials.core.instanceId;
  profile.ridePetInstanceId = "";
  profile.nextPetInstanceSerial = 100;
  const saved = service.saveProfile(registered.session.token, {
    expectedRevision: loaded.profileSummary.profileRevision,
    profile,
  });
  assert.equal(saved.ok, true, saved.message);
  return {
    ...registered,
    materials,
    materialInstanceIds: Object.fromEntries(
      PET_FUSION_ROLE_IDS.map((roleId) => [
        roleId,
        materials[roleId].instanceId,
      ]),
    ),
    profileRevision: saved.profileSummary.profileRevision,
  };
}

async function createClosedHttpFixture(t, routeCase, username) {
  const catalog = loadPetFusionRecipeCatalog();
  assert.equal(catalog.catalogId, "pet_fusion_recipes_v2");
  assert.equal(catalog.runtimeEnabled, false);
  assert.ok(catalog.recipesById[routeCase.recipeId]);
  assert.equal(catalog.recipesById[routeCase.recipeId].assetGate.status, "formal");

  const countedStore = createCountingMemoryStore();
  let randomOpenCount = 0;
  const service = createAuthService({
    store: countedStore.store,
    now: () => NOW_MS,
    petFusionRecipeCatalog: catalog,
    petFusionRandomAuthority: Object.freeze({
      open() {
        randomOpenCount += 1;
        throw new Error("disabled fusion must not open its random authority");
      },
    }),
  });
  const account = seedProductionFusionMaterials(
    service,
    catalog,
    routeCase,
    username,
  );
  const authorization = {
    authorization: `Bearer ${account.session.token}`,
  };

  const server = createHttpServer({service, store: countedStore.store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await service.waitForDurableIdle();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    account,
    authorization,
    base,
    catalog,
    countedStore,
    randomOpenCount: () => randomOpenCount,
    routeCase,
    service,
  };
}

function closedBaseline(fixture) {
  const accountId = fixture.account.account.accountId;
  const authority = fixture.service.snapshot();
  return {
    authority,
    profile: structuredClone(
      internalProfileForAccount(fixture.service, accountId),
    ),
    receipts: structuredClone(authority.mutationReceipts),
    saveCount: fixture.countedStore.saveCount(),
    store: fixture.countedStore.store.load(),
  };
}

async function assertClosedSideEffectsUnchanged(
  fixture,
  before,
  operationIds = [],
) {
  await fixture.service.waitForDurableIdle();
  const accountId = fixture.account.account.accountId;
  assert.equal(fixture.randomOpenCount(), 0);
  assert.equal(fixture.countedStore.saveCount(), before.saveCount);
  assert.deepEqual(fixture.countedStore.store.load(), before.store);
  assert.deepEqual(fixture.service.snapshot(), before.authority);
  assert.deepEqual(
    internalProfileForAccount(fixture.service, accountId),
    before.profile,
  );
  assert.deepEqual(fixture.service.snapshot().mutationReceipts, before.receipts);
  for (const operationId of operationIds) {
    assert.equal(
      Object.hasOwn(fixture.service.snapshot().mutationReceipts, operationId),
      false,
    );
  }
  const afterProfile = fixture.service.getProfile(fixture.account.session.token);
  assert.equal(afterProfile.ok, true, afterProfile.message);
  assert.equal(
    afterProfile.profileBinding.profileRevision,
    fixture.account.profileRevision,
  );
  assert.deepEqual(
    internalProfileForAccount(fixture.service, accountId).petInstances,
    before.profile.petInstances,
  );
}

test("both formal production fusion recipes stay closed with three real eligible materials and zero side effects", async (t) => {
  for (const [index, routeCase] of PRODUCTION_ROUTE_CASES.entries()) {
    await t.test(routeCase.name, async (routeTest) => {
      const fixture = await createClosedHttpFixture(
        routeTest,
        routeCase,
        `fusionclosedroute${index}`,
      );
      const before = closedBaseline(fixture);
      assert.equal(before.profile.petInstances.length, PET_FUSION_ROLE_IDS.length);
      assert.deepEqual(
        before.profile.petInstances.map((pet) => pet.formId),
        PET_FUSION_ROLE_IDS.map(
          (roleId) => fixture.account.materials[roleId].formId,
        ),
      );
      assert.equal(
        before.profile.petInstances.every((pet) => (
          pet.level >= 131
          && pet.level <= 140
          && pet.petCultivation.rebirthCount === 1
          && pet.petGrowth.modelVersion === "pet_growth_authority_v1"
        )),
        true,
      );
      const eligibility = inspectPetFusionEligibility(
        fixture.account.materials,
        {
          catalog: fixture.catalog,
          recipeId: routeCase.recipeId,
        },
      );
      assert.equal(eligibility.ok, true, eligibility.message);

      const quote = await postJson(
        fixture.base,
        "/pets/fusion/quote",
        quoteRequest(routeCase.recipeId, fixture.account.materialInstanceIds),
        fixture.authorization,
      );
      assert.equal(quote.ok, false);
      assert.equal(quote.code, "pet_fusion_disabled");

      const operationId = `pet_fusion_closed_route_${index}_0001`;
      const exactExecute = executeRequest(
        fixture.account.profileRevision,
        fixture.catalog.catalogId,
        {},
        routeCase.recipeId,
        fixture.account.materialInstanceIds,
      );
      const executed = await postJson(
        fixture.base,
        "/pets/fusion",
        exactExecute,
        {
          ...fixture.authorization,
          "Idempotency-Key": operationId,
        },
      );
      assert.equal(executed.ok, false);
      assert.equal(executed.code, "pet_fusion_disabled");
      assert.equal(Object.hasOwn(executed, "durableCommit"), false);

      const retried = await postJson(
        fixture.base,
        "/pets/fusion",
        exactExecute,
        {
          ...fixture.authorization,
          "Idempotency-Key": operationId,
        },
      );
      assert.equal(retried.ok, false);
      assert.equal(retried.code, "pet_fusion_disabled");
      assert.equal(Object.hasOwn(retried, "durableCommit"), false);
      await assertClosedSideEffectsUnchanged(fixture, before, [operationId]);
    });
  }
});

test("production-disabled fusion preserves outer validation priority and rejects adversarial requests without mutation", async (t) => {
  const fixture = await createClosedHttpFixture(
    t,
    PRODUCTION_ROUTE_CASES[0],
    "fusionclosedmatrix",
  );
  const before = closedBaseline(fixture);
  const exactExecute = executeRequest(
    fixture.account.profileRevision,
    fixture.catalog.catalogId,
    {},
    fixture.routeCase.recipeId,
    fixture.account.materialInstanceIds,
  );
  const operationIds = [];

  // Quote keeps its established request-before-auth boundary.
  const malformedQuote = await postJson(fixture.base, "/pets/fusion/quote", {});
  assert.equal(malformedQuote.ok, false);
  assert.equal(malformedQuote.code, "pet_fusion_request_invalid");

  const unauthorizedQuote = await postJson(
    fixture.base,
    "/pets/fusion/quote",
    quoteRequest(
      fixture.routeCase.recipeId,
      fixture.account.materialInstanceIds,
    ),
  );
  assert.equal(unauthorizedQuote.ok, false);
  assert.equal(unauthorizedQuote.code, "session_missing");

  const unknownRecipeQuote = await postJson(
    fixture.base,
    "/pets/fusion/quote",
    quoteRequest(
      "unknown_but_well_formed_fusion_recipe",
      fixture.account.materialInstanceIds,
    ),
    fixture.authorization,
  );
  assert.equal(unknownRecipeQuote.ok, false);
  assert.equal(unknownRecipeQuote.code, "pet_fusion_disabled");

  const adversarialIds = {
    core: "../../pet_closed_core",
    resonance_one: "__proto__",
    resonance_two: "constructor",
  };
  const adversarialQuote = await postJson(
    fixture.base,
    "/pets/fusion/quote",
    quoteRequest(fixture.routeCase.recipeId, adversarialIds),
    fixture.authorization,
  );
  assert.equal(adversarialQuote.ok, false);
  assert.equal(adversarialQuote.code, "pet_fusion_disabled");

  for (const [name, payload, expectedCode] of [
    [
      "outer_extra",
      {
        ...quoteRequest(
          fixture.routeCase.recipeId,
          fixture.account.materialInstanceIds,
        ),
        inheritedSkillIds: ["forged"],
      },
      "pet_fusion_request_invalid",
    ],
    [
      "nested_extra",
      {
        ...quoteRequest(
          fixture.routeCase.recipeId,
          fixture.account.materialInstanceIds,
        ),
        materialInstanceIds: {
          ...fixture.account.materialInstanceIds,
          injected: "forged",
        },
      },
      "pet_fusion_request_invalid",
    ],
    [
      "duplicate",
      quoteRequest(fixture.routeCase.recipeId, {
        ...fixture.account.materialInstanceIds,
        resonance_two: fixture.account.materialInstanceIds.core,
      }),
      "pet_fusion_material_duplicate",
    ],
    [
      "long_recipe",
      quoteRequest("x".repeat(161), fixture.account.materialInstanceIds),
      "pet_fusion_request_invalid",
    ],
    [
      "long_material",
      quoteRequest(fixture.routeCase.recipeId, {
        ...fixture.account.materialInstanceIds,
        core: "x".repeat(161),
      }),
      "pet_fusion_request_invalid",
    ],
  ]) {
    const response = await postJson(
      fixture.base,
      "/pets/fusion/quote",
      payload,
      fixture.authorization,
    );
    assert.equal(response.ok, false, name);
    assert.equal(response.code, expectedCode, name);
  }

  // Mutation HTTP idempotency remains the outermost boundary.
  const missingKey = await postJson(
    fixture.base,
    "/pets/fusion",
    exactExecute,
  );
  assert.equal(missingKey.ok, false);
  assert.equal(missingKey.code, "idempotency_key_required");

  const invalidKey = await postJson(
    fixture.base,
    "/pets/fusion",
    exactExecute,
    {"Idempotency-Key": "short"},
  );
  assert.equal(invalidKey.ok, false);
  assert.equal(invalidKey.code, "idempotency_key_invalid");

  // With a valid key, request normalization still precedes authentication.
  operationIds.push("pet_fusion_closed_malformed_0001");
  const malformedExecute = await postJson(
    fixture.base,
    "/pets/fusion",
    {},
    {"Idempotency-Key": "pet_fusion_closed_malformed_0001"},
  );
  assert.equal(malformedExecute.ok, false);
  assert.equal(malformedExecute.code, "pet_fusion_request_invalid");

  operationIds.push("pet_fusion_closed_unauthorized_0001");
  const unauthorizedExecute = await postJson(
    fixture.base,
    "/pets/fusion",
    exactExecute,
    {"Idempotency-Key": "pet_fusion_closed_unauthorized_0001"},
  );
  assert.equal(unauthorizedExecute.ok, false);
  assert.equal(unauthorizedExecute.code, "session_missing");

  // Revision and catalog conflicts intentionally remain ahead of the runtime gate.
  operationIds.push("pet_fusion_closed_stale_revision_0001");
  const staleRevision = await postJson(
    fixture.base,
    "/pets/fusion",
    executeRequest(
      fixture.account.profileRevision + 1,
      "pet_fusion_recipes_stale",
      {},
      fixture.routeCase.recipeId,
      fixture.account.materialInstanceIds,
    ),
    {
      ...fixture.authorization,
      "Idempotency-Key": "pet_fusion_closed_stale_revision_0001",
    },
  );
  assert.equal(staleRevision.ok, false);
  assert.equal(staleRevision.code, "revision_conflict");

  operationIds.push("pet_fusion_closed_stale_catalog_0001");
  const staleCatalog = await postJson(
    fixture.base,
    "/pets/fusion",
    executeRequest(
      fixture.account.profileRevision,
      "pet_fusion_recipes_stale",
      {},
      fixture.routeCase.recipeId,
      fixture.account.materialInstanceIds,
    ),
    {
      ...fixture.authorization,
      "Idempotency-Key": "pet_fusion_closed_stale_catalog_0001",
    },
  );
  assert.equal(staleCatalog.ok, false);
  assert.equal(staleCatalog.code, "pet_fusion_catalog_conflict");

  const unknownRecipeOperationId = "pet_fusion_closed_unknown_recipe_0001";
  operationIds.push(unknownRecipeOperationId);
  const unknownRecipeExecute = await postJson(
    fixture.base,
    "/pets/fusion",
    executeRequest(
      fixture.account.profileRevision,
      fixture.catalog.catalogId,
      {},
      "unknown_but_well_formed_fusion_recipe",
      fixture.account.materialInstanceIds,
    ),
    {
      ...fixture.authorization,
      "Idempotency-Key": unknownRecipeOperationId,
    },
  );
  assert.equal(unknownRecipeExecute.ok, false);
  assert.equal(unknownRecipeExecute.code, "pet_fusion_disabled");

  const adversarialOperationId = "pet_fusion_closed_adversarial_ids_0001";
  operationIds.push(adversarialOperationId);
  const adversarialExecute = await postJson(
    fixture.base,
    "/pets/fusion",
    executeRequest(
      fixture.account.profileRevision,
      fixture.catalog.catalogId,
      {},
      fixture.routeCase.recipeId,
      adversarialIds,
    ),
    {
      ...fixture.authorization,
      "Idempotency-Key": adversarialOperationId,
    },
  );
  assert.equal(adversarialExecute.ok, false);
  assert.equal(adversarialExecute.code, "pet_fusion_disabled");

  for (const [index, [name, overrides, expectedCode]] of [
    [
      "nested_extra",
      {
        materialInstanceIds: {
          ...fixture.account.materialInstanceIds,
          injected: "forged",
        },
      },
      "pet_fusion_request_invalid",
    ],
    [
      "duplicate",
      {
        materialInstanceIds: {
          ...fixture.account.materialInstanceIds,
          resonance_two: fixture.account.materialInstanceIds.core,
        },
      },
      "pet_fusion_material_duplicate",
    ],
    [
      "long_material",
      {
        materialInstanceIds: {
          ...fixture.account.materialInstanceIds,
          core: "x".repeat(161),
        },
      },
      "pet_fusion_request_invalid",
    ],
    [
      "outer_extra",
      {targetFormId: "forged_target"},
      "pet_fusion_request_invalid",
    ],
  ].entries()) {
    const operationId = `pet_fusion_closed_matrix_${index}_0001`;
    operationIds.push(operationId);
    const response = await postJson(
      fixture.base,
      "/pets/fusion",
      executeRequest(
        fixture.account.profileRevision,
        fixture.catalog.catalogId,
        overrides,
        fixture.routeCase.recipeId,
        fixture.account.materialInstanceIds,
      ),
      {
        ...fixture.authorization,
        "Idempotency-Key": operationId,
      },
    );
    assert.equal(response.ok, false, name);
    assert.equal(response.code, expectedCode, name);
  }

  // Battle/offline-hang/equipment-integrity locks are established service
  // wrappers outside the fusion domain. They intentionally remain capable of
  // returning their lock code before pet_fusion_disabled; this test does not
  // redefine those generic mutation boundaries as part of the runtime gate.
  await assertClosedSideEffectsUnchanged(fixture, before, operationIds);
});

test("a historical committed fusion receipt replays outside the closed runtime gate without a second mutation", async (t) => {
  const backing = createMemoryAuthStore();
  const enabledCatalog = createEnabledTestFusionCatalog();
  const enabledService = createAuthService({
    store: backing,
    now: () => NOW_MS,
    petGrowthCatalog: createTestFusionGrowthCatalog(),
    petEvolutionRouteCatalog: DISABLED_TEST_EVOLUTION_CATALOG,
    petFusionRecipeCatalog: enabledCatalog,
    petFusionTargetTemplateForFormId: fusionTargetTemplateForFormId,
    petFusionRandomAuthority: createPetFusionRandomAuthority({
      randomBytes(size) {
        return Buffer.alloc(size, 0x55);
      },
    }),
  });
  const account = seedFusionAccount(enabledService, {
    catalog: enabledCatalog,
    username: "fusionclosedreplay",
    coreBinding: "bound",
  });
  const historicalRequest = executeRequest(
    account.profileRevision,
    enabledCatalog.catalogId,
    {},
    "test_alpha_beta_fusion_v1",
    {
      core: account.materials.core.instanceId,
      resonance_one: account.materials.resonance_one.instanceId,
      resonance_two: account.materials.resonance_two.instanceId,
    },
  );
  const operationId = "pet_fusion_historical_success_0001";
  const enabledServer = createHttpServer({service: enabledService, store: backing});
  enabledServer.listen(0, "127.0.0.1");
  await once(enabledServer, "listening");
  t.after(async () => {
    await enabledService.waitForDurableIdle();
    if (enabledServer.listening) {
      await new Promise((resolve) => enabledServer.close(resolve));
    }
  });
  const enabledBase = `http://127.0.0.1:${enabledServer.address().port}`;
  const authorization = {
    authorization: `Bearer ${account.session.token}`,
    "Idempotency-Key": operationId,
  };
  const committed = await postJson(
    enabledBase,
    "/pets/fusion",
    historicalRequest,
    authorization,
  );
  assert.equal(committed.ok, true, committed.message);
  assert.equal(committed.durableCommit.replayed, false);
  await enabledService.waitForDurableIdle();
  await new Promise((resolve) => enabledServer.close(resolve));

  const countedStore = createCountingMemoryStore(backing.load());
  const productionCatalog = loadPetFusionRecipeCatalog();
  let closedRandomOpenCount = 0;
  const closedService = createAuthService({
    store: countedStore.store,
    now: () => NOW_MS,
    petFusionRecipeCatalog: productionCatalog,
    petFusionRandomAuthority: Object.freeze({
      open() {
        closedRandomOpenCount += 1;
        throw new Error("historical replay must not reopen fusion randomness");
      },
    }),
  });
  const closedServer = createHttpServer({
    service: closedService,
    store: countedStore.store,
  });
  closedServer.listen(0, "127.0.0.1");
  await once(closedServer, "listening");
  t.after(async () => {
    await closedService.waitForDurableIdle();
    await new Promise((resolve) => closedServer.close(resolve));
  });
  const closedBase = `http://127.0.0.1:${closedServer.address().port}`;
  const beforeSaveCount = countedStore.saveCount();
  const beforeStore = countedStore.store.load();
  const beforeAuthority = closedService.snapshot();

  // Durable idempotency is deliberately outside feature enablement. A retry
  // of an already committed operation must replay the historical result; it
  // does not execute the now-closed fusion domain a second time.
  const replay = await postJson(
    closedBase,
    "/pets/fusion",
    historicalRequest,
    authorization,
  );
  assert.equal(replay.ok, true, replay.message);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(
    replay.petFusion.resultInstanceId,
    committed.petFusion.resultInstanceId,
  );
  await closedService.waitForDurableIdle();
  assert.equal(productionCatalog.runtimeEnabled, false);
  assert.equal(closedRandomOpenCount, 0);
  assert.equal(countedStore.saveCount(), beforeSaveCount);
  assert.deepEqual(countedStore.store.load(), beforeStore);
  assert.deepEqual(closedService.snapshot(), beforeAuthority);
});
