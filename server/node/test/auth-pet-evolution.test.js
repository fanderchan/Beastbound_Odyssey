"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
  internalProfileForAccount,
} = require("../test-support/auth-service-test-context");
const {
  CORE_ITEM_ID,
  LINEAGE_ITEM_ID,
  ROUTE_ID,
  SOURCE_FORM_ID,
  TARGET_FORM_ID,
  createDisabledPetEvolutionRouteCatalog,
  createEnabledPetEvolutionRouteCatalog,
  createOneRebirthEvolutionPet,
  seedEvolutionAccount,
} = require("../test-support/pet-evolution-fixture");
const {
  TARGET_FORM_ID: FUSION_TARGET_FORM_ID,
  createEnabledTestFusionCatalog,
} = require("../test-support/pet-fusion-fixture");
const {
  applyPetEvolution,
  inspectCanonicalStageOneCultivation,
  inspectPetEvolutionEligibility,
  inspectPetEvolutionTerminalPath,
} = require("../src/auth/pet-evolution");

const NOW_MS = Date.parse("2026-07-18T04:00:00.000Z");
const ACTION_ID = "POST /pets/evolution";

function evolutionRequest(account, catalog, overrides = {}) {
  return {
    instanceId: account.fixture.pet.instanceId,
    routeId: ROUTE_ID,
    expectedProfileRevision: account.profileRevision,
    expectedCatalogId: catalog.catalogId,
    ...overrides,
  };
}

function invokeEvolution(service, account, catalog, options = {}) {
  return service.invokeDurable("evolvePet", [
    account.session.token,
    options.payload || evolutionRequest(account, catalog),
  ], {
    operationId: String(options.operationId || "pet_evolution_service_operation_0001"),
    requestHash: String(options.requestHash || "7".repeat(64)),
    actionId: ACTION_ID,
  });
}

function itemCount(profile, itemId) {
  return (Array.isArray(profile.backpackSlots) ? profile.backpackSlots : [])
    .filter((slot) => String(slot && slot.itemId || "") === itemId)
    .reduce((sum, slot) => sum + Math.max(0, Math.trunc(Number(slot.count || 0))), 0);
}

function mutateSeededEvolutionPet(service, account, mutate) {
  const loaded = service.getProfile(account.session.token);
  assert.equal(loaded.ok, true);
  const profile = structuredClone(loaded.profile);
  mutate(profile.petInstances[0]);
  const saved = service.saveProfile(account.session.token, {
    expectedRevision: loaded.profileSummary.profileRevision,
    profile,
  });
  assert.equal(saved.ok, true, saved.message);
  account.profileRevision = saved.profileSummary.profileRevision;
}

test("pure evolution guards reject every owned fusion marker and export the canonical one-rebirth audit", () => {
  const fusionCatalog = createEnabledTestFusionCatalog();
  const fixture = createOneRebirthEvolutionPet();
  const canonical = inspectCanonicalStageOneCultivation(fixture.pet.petCultivation);
  assert.equal(canonical.ok, true);
  assert.notEqual(canonical.record, fixture.pet.petCultivation);
  const damagedCultivation = structuredClone(fixture.pet.petCultivation);
  damagedCultivation.history = [];
  assert.deepEqual(inspectCanonicalStageOneCultivation(damagedCultivation), {
    ok: false,
    code: "pet_evolution_cultivation_invalid",
    message: "宠物一转培养记录不完整，本次进化未执行。",
  });

  for (const fusionLineage of [
    undefined,
    null,
    {},
    "damaged",
    {schemaVersion: 1, mode: "fusion", recipeId: "future_recipe"},
  ]) {
    const pet = structuredClone(fixture.pet);
    pet.fusionLineage = fusionLineage;
    const before = structuredClone(pet);
    for (const result of [
      inspectPetEvolutionEligibility(pet, {fusionCatalog}),
      applyPetEvolution(pet, {fusionCatalog}),
    ]) {
      assert.equal(result.ok, false);
      assert.equal(result.code, "pet_evolution_terminal_fusion");
      assert.equal(result.message, "融合宠已进入终局，不能再进行进化。");
    }
    assert.deepEqual(pet, before);
  }

  const targetFormPet = structuredClone(fixture.pet);
  targetFormPet.formId = FUSION_TARGET_FORM_ID;
  targetFormPet.templateId = FUSION_TARGET_FORM_ID;
  targetFormPet.speciesId = FUSION_TARGET_FORM_ID;
  assert.equal(
    inspectPetEvolutionTerminalPath(targetFormPet, {fusionCatalog}).code,
    "pet_evolution_terminal_fusion",
  );
  assert.deepEqual(inspectPetEvolutionTerminalPath(fixture.pet, {fusionCatalog}), {ok: true});
});

test("authoritative evolution rerolls the target while preserving source 0/1 public history", async () => {
	const catalog = createEnabledPetEvolutionRouteCatalog();
	const store = createMemoryAuthStore();
	const service = createAuthService({
		store,
    now: () => NOW_MS,
    petEvolutionRouteCatalog: catalog,
  });
  const account = seedEvolutionAccount(service, {username: "evolutionhappy"});
  const before = structuredClone(internalProfileForAccount(service, account.account.accountId));
  const source = before.petInstances[0];
  assert.equal(before.petCodexSeenFormIds.includes(TARGET_FORM_ID), false);
  assert.equal(before.petCodexCapturedFormIds.includes(TARGET_FORM_ID), false);

  const quote = service.getPetEvolutionQuote(account.session.token, {
    instanceId: source.instanceId,
    routeId: ROUTE_ID,
  });
  assert.equal(quote.ok, true);
  assert.equal(quote.petEvolutionQuote.catalogId, catalog.catalogId);
  assert.equal(quote.petEvolutionQuote.profileRevision, account.profileRevision);
  assert.equal(quote.petEvolutionQuote.pet.intrinsicCombatPower, 1410);
  assert.equal(quote.petEvolutionQuote.pet.minimumIntrinsicCombatPower, 1345);
  assert.equal(quote.petEvolutionQuote.pet.requiredPercentile, 90);
  assert.deepEqual(quote.petEvolutionQuote.result, {
    targetFormId: TARGET_FORM_ID,
    targetFormName: "晶甲乌力",
    level: 1,
    rebirthCount: 1,
    rerollLevelOneFourV: true,
    rerollHiddenGrowth: true,
    preservedHistoryStages: [0, 1],
    terminalStageLabel: "2转/进化/融合",
  });
  assert.equal(quote.petEvolutionQuote.cost.affordable, true);
  assert.deepEqual(quote.petEvolutionQuote.cost.stoneCoins.debits, [
    {binding: "bound", amount: 250000},
    {binding: "unbound", amount: 50000},
  ]);
  assert.equal(JSON.stringify(quote).includes(account.fixture.privateSeed), false);
  assert.deepEqual(internalProfileForAccount(service, account.account.accountId), before);

  const direct = service.evolvePet(account.session.token, evolutionRequest(account, catalog));
  assert.equal(direct.ok, false);
  assert.equal(direct.code, "idempotency_key_required");
  assert.deepEqual(internalProfileForAccount(service, account.account.accountId), before);

  const result = await invokeEvolution(service, account, catalog);
  assert.equal(result.ok, true);
  assert.equal(result.durableCommit.replayed, false);
  assert.equal(result.petEvolution.sourceFormId, SOURCE_FORM_ID);
  assert.equal(result.petEvolution.targetFormId, TARGET_FORM_ID);
  assert.equal(result.petEvolution.intrinsicCombatPower, 1410);
  assert.equal(result.petEvolution.minimumIntrinsicCombatPower, 1345);
  assert.deepEqual(result.petEvolution.cost.stoneCoinDebits, [
    {binding: "bound", amount: 250000},
    {binding: "unbound", amount: 50000},
  ]);
  assert.equal(result.profile.boundStoneCoins, 0);
  assert.equal(result.profile.stoneCoins, 50000);
  assert.equal(itemCount(result.profile, CORE_ITEM_ID), 0);
  assert.equal(itemCount(result.profile, LINEAGE_ITEM_ID), 0);
  assert.deepEqual(
    result.profile.petCodexSeenFormIds.filter((formId) => formId === TARGET_FORM_ID),
    [TARGET_FORM_ID],
  );
  assert.deepEqual(
    result.profile.petCodexCapturedFormIds.filter((formId) => formId === TARGET_FORM_ID),
    [TARGET_FORM_ID],
  );
  assert.equal(JSON.stringify(result).includes(account.fixture.privateSeed), false);

  const publicPet = result.profile.petInstances[0];
  assert.equal(publicPet.instanceId, source.instanceId);
  assert.equal(publicPet.formId, TARGET_FORM_ID);
  assert.equal(publicPet.level, 1);
  assert.equal(publicPet.binding, "bound");
  assert.equal(publicPet.paidResetCount, 2);
  assert.equal(publicPet.evolutionLineage.terminalStage, 2);
  assert.deepEqual(publicPet.evolutionLineage.stageSnapshots.map((entry) => entry.stage), [0, 1]);
  assert.equal(publicPet.evolutionLineage.stageSnapshots[1].formId, SOURCE_FORM_ID);
  assert.deepEqual(publicPet.evolutionLineage.stageSnapshots[1].stats, source.petGrowth.public.stats);

  const internal = internalProfileForAccount(service, account.account.accountId);
  const evolved = internal.petInstances[0];
  assert.equal(evolved.formId, TARGET_FORM_ID);
  assert.equal(evolved.templateId, TARGET_FORM_ID);
  assert.equal(evolved.speciesId, TARGET_FORM_ID);
  assert.equal(evolved.growthSpeciesProfileId, "wuli_evolved_crystal_earth8_water2_v1");
  assert.equal(evolved.level, 1);
  assert.equal(evolved.petCultivation.rebirthCount, 1);
  assert.equal(evolved.petCultivation.enhanceLevel, 3);
  assert.deepEqual(evolved.petCultivation.rebirthGrowthBonus, source.petCultivation.rebirthGrowthBonus);
  assert.notEqual(evolved.petGrowth.private.privateSeed, source.petGrowth.private.privateSeed);
  assert.notDeepEqual(evolved.petGrowth.private.privateRoll, source.petGrowth.private.privateRoll);
  assert.deepEqual(evolved.evolutionLineage.stageSnapshots[1].stats, source.petGrowth.public.stats);
  assert.equal(internal.boundStoneCoins, 0);
  assert.equal(internal.stoneCoins, 50000);
  assert.equal(itemCount(internal, CORE_ITEM_ID), 0);
  assert.equal(itemCount(internal, LINEAGE_ITEM_ID), 0);
  assert.deepEqual(
    internal.petCodexCapturedFormIds.filter((formId) => formId === TARGET_FORM_ID),
    [TARGET_FORM_ID],
  );
  assert.equal(result.profileBinding.profileRevision, account.profileRevision + 1);

  const afterFirst = structuredClone(internal);
  const replay = await invokeEvolution(service, account, catalog);
  assert.equal(replay.ok, true);
	assert.equal(replay.durableCommit.replayed, true);
	assert.equal(replay.profileBinding.profileRevision, result.profileBinding.profileRevision);
	assert.deepEqual(internalProfileForAccount(service, account.account.accountId), afterFirst);

	const restarted = createAuthService({store, now: () => NOW_MS, petEvolutionRouteCatalog: catalog});
	const restored = restarted.getProfile(account.session.token);
	assert.equal(restored.ok, true);
	assert.equal(restored.profile.petInstances[0].formId, TARGET_FORM_ID);
	assert.deepEqual(
		restored.profile.petCodexCapturedFormIds.filter((formId) => formId === TARGET_FORM_ID),
		[TARGET_FORM_ID],
	);
	assert.deepEqual(
		restored.profile.petInstances[0].evolutionLineage.stageSnapshots.map((entry) => entry.stage),
		[0, 1],
	);
	const replayAfterRestart = await invokeEvolution(restarted, account, catalog);
	assert.equal(replayAfterRestart.ok, true);
	assert.equal(replayAfterRestart.durableCommit.replayed, true);
	assert.equal(replayAfterRestart.profileBinding.profileRevision, result.profileBinding.profileRevision);
	assert.deepEqual(internalProfileForAccount(restarted, account.account.accountId), afterFirst);
});

test("evolution quote and execution reject fusion lineage or fusion target-form evidence with zero mutation", async (t) => {
  const evolutionCatalog = createEnabledPetEvolutionRouteCatalog();
  const fusionCatalog = createEnabledTestFusionCatalog();
  const cases = [
    {
      name: "valid fusion lineage",
      mutate(pet) {
        pet.fusionLineage = {schemaVersion: 1, mode: "fusion", recipeId: "future_recipe"};
      },
    },
    {name: "null fusion lineage", mutate(pet) { pet.fusionLineage = null; }},
    {name: "empty fusion lineage", mutate(pet) { pet.fusionLineage = {}; }},
    {name: "damaged fusion lineage", mutate(pet) { pet.fusionLineage = "damaged"; }},
    {
      name: "fusion target form without lineage",
      mutate(pet) {
        pet.formId = FUSION_TARGET_FORM_ID;
        pet.templateId = FUSION_TARGET_FORM_ID;
        pet.speciesId = FUSION_TARGET_FORM_ID;
        delete pet.fusionLineage;
      },
    },
  ];
  for (const [index, fixture] of cases.entries()) {
    await t.test(fixture.name, async () => {
      const service = createAuthService({
        store: createMemoryAuthStore(),
        now: () => NOW_MS,
        petEvolutionRouteCatalog: evolutionCatalog,
        petFusionRecipeCatalog: fusionCatalog,
      });
      const account = seedEvolutionAccount(service, {
        username: `evofusionterminal${index}`,
      });
      mutateSeededEvolutionPet(service, account, fixture.mutate);
      const before = structuredClone(service.snapshot());

      const quote = service.getPetEvolutionQuote(account.session.token, {
        instanceId: account.fixture.pet.instanceId,
        routeId: ROUTE_ID,
      });
      assert.equal(quote.ok, false);
      assert.equal(quote.code, "pet_evolution_terminal_fusion");
      assert.equal(quote.message, "融合宠已进入终局，不能再进行进化。");
      assert.deepEqual(service.snapshot(), before);

      const executed = await invokeEvolution(service, account, evolutionCatalog, {
        operationId: `pet_evolution_fusion_terminal_${index}_operation`,
        requestHash: String(index + 1).repeat(64),
      });
      assert.equal(executed.ok, false);
      assert.equal(executed.code, "pet_evolution_terminal_fusion");
      assert.equal(executed.message, "融合宠已进入终局，不能再进行进化。");
      assert.deepEqual(service.snapshot(), before);
    });
  }
});

test("evolution qualification, assets, protection and stale confirmations fail with zero mutation", async (t) => {
  const catalog = createEnabledPetEvolutionRouteCatalog();
  const cases = [
    {
      name: "below stage-one P90",
      account: {username: "evo_below_p90", pet: {rebirthGrowthBonus: {maxHp: 0, attack: 0, defense: 0, quick: 0}}},
      code: "pet_evolution_power_below_p90",
    },
    {
      name: "missing lineage license",
      account: {username: "evo_no_license", withLicense: false},
      code: "pet_evolution_license_required",
    },
    {
      name: "missing shared core",
      account: {username: "evo_no_core", coreCount: 7},
      code: "pet_evolution_assets_insufficient",
    },
    {
      name: "missing stone coins",
      account: {username: "evo_no_coins", stoneCoins: 0, boundStoneCoins: 299999},
      code: "pet_evolution_assets_insufficient",
    },
    {
      name: "locked source pet",
      account: {username: "evo_locked", pet: {locked: true}},
      code: "pet_locked",
    },
    {
      name: "riding source pet",
      account: {username: "evo_riding", pet: {state: "riding"}, ridePetInstanceId: "evolution_fixture_pet"},
      code: "pet_riding",
    },
    {
      name: "stale profile revision",
      account: {username: "evo_stale_revision"},
      payload(account) {
        return evolutionRequest(account, catalog, {expectedProfileRevision: account.profileRevision - 1});
      },
      code: "revision_conflict",
    },
    {
      name: "stale evolution catalog",
      account: {username: "evo_stale_catalog"},
      payload(account) {
        return evolutionRequest(account, catalog, {expectedCatalogId: "pet_evolution_routes_stale"});
      },
      code: "pet_evolution_catalog_conflict",
    },
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const service = createAuthService({
        store: createMemoryAuthStore(),
        now: () => NOW_MS,
        petEvolutionRouteCatalog: catalog,
      });
      const account = seedEvolutionAccount(service, fixture.account);
      const before = structuredClone(service.snapshot());
      const result = await invokeEvolution(service, account, catalog, {
        operationId: `pet_evolution_${fixture.account.username}_operation_0001`,
        requestHash: "8".repeat(64),
        payload: fixture.payload ? fixture.payload(account) : evolutionRequest(account, catalog),
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, fixture.code);
      assert.deepEqual(service.snapshot(), before);
    });
  }
});

test("production evolution catalog opens after formal assets and owner release attestation", () => {
  const service = createAuthService({store: createMemoryAuthStore(), now: () => NOW_MS});
  const account = seedEvolutionAccount(service, {username: "evolutionassetgate"});
  const before = structuredClone(service.snapshot());
  const result = service.getPetEvolutionQuote(account.session.token, {
    instanceId: account.fixture.pet.instanceId,
    routeId: ROUTE_ID,
  });
  assert.equal(result.ok, true, result.message);
  assert.equal(result.petEvolutionQuote.routeId, ROUTE_ID);
  assert.equal(result.petEvolutionQuote.result.targetFormId, TARGET_FORM_ID);
  assert.deepEqual(service.snapshot(), before);
});

test("an explicit disabled evolution fixture still fails closed without mutation", () => {
  const catalog = createDisabledPetEvolutionRouteCatalog();
  const service = createAuthService({
    store: createMemoryAuthStore(),
    now: () => NOW_MS,
    petEvolutionRouteCatalog: catalog,
  });
  const account = seedEvolutionAccount(service, {username: "evodisabled"});
  const before = structuredClone(service.snapshot());
  const result = service.getPetEvolutionQuote(account.session.token, {
    instanceId: account.fixture.pet.instanceId,
    routeId: ROUTE_ID,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "pet_evolution_disabled");
  assert.deepEqual(service.snapshot(), before);
});
