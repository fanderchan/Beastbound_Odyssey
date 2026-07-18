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
  createEnabledPetEvolutionRouteCatalog,
  seedEvolutionAccount,
} = require("../test-support/pet-evolution-fixture");

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
  assert.equal(result.profileBinding.profileRevision, account.profileRevision + 1);

  const afterFirst = structuredClone(internal);
  const replay = await invokeEvolution(service, account, catalog);
  assert.equal(replay.ok, true);
	assert.equal(replay.durableCommit.replayed, true);
	assert.deepEqual(internalProfileForAccount(service, account.account.accountId), afterFirst);

	const restarted = createAuthService({store, now: () => NOW_MS, petEvolutionRouteCatalog: catalog});
	const restored = restarted.getProfile(account.session.token);
	assert.equal(restored.ok, true);
	assert.equal(restored.profile.petInstances[0].formId, TARGET_FORM_ID);
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

test("production evolution catalog remains closed until formal assets are installed", () => {
  const service = createAuthService({store: createMemoryAuthStore(), now: () => NOW_MS});
  const account = seedEvolutionAccount(service, {username: "evolutionassetgate"});
  const before = structuredClone(service.snapshot());
  const result = service.getPetEvolutionQuote(account.session.token, {
    instanceId: account.fixture.pet.instanceId,
    routeId: ROUTE_ID,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "pet_evolution_disabled");
  assert.deepEqual(service.snapshot(), before);
});
