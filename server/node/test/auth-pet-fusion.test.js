"use strict";

const {
  assert,
  test,
  createAuthService,
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

const NOW_MS = Date.parse("2026-07-26T01:00:00.000Z");
const ACTION_ID = "POST /pets/fusion";
const FIXED_RANDOM_BYTE = 0x55;
const DISABLED_TEST_EVOLUTION_CATALOG = Object.freeze({
  schemaVersion: 2,
  catalogId: "test_pet_evolution_disabled",
  runtimeEnabled: false,
  disabledMessage: "融合测试不启用进化目录。",
  routes: Object.freeze([]),
  routesById: Object.freeze({}),
  targetFormIds: Object.freeze([]),
  manualEncounterRules: Object.freeze([]),
});

function createFusionService(options = {}) {
  const catalog = options.catalog || createEnabledTestFusionCatalog();
  return createAuthService({
    store: options.store || createMemoryAuthStore(),
    now: options.now || (() => NOW_MS),
    petGrowthCatalog: createTestFusionGrowthCatalog(),
    petEvolutionRouteCatalog:
      options.petEvolutionRouteCatalog || DISABLED_TEST_EVOLUTION_CATALOG,
    petFusionRecipeCatalog: catalog,
    petFusionTargetTemplateForFormId: fusionTargetTemplateForFormId,
    petFusionRandomAuthority: options.petFusionRandomAuthority
      || createPetFusionRandomAuthority({
        randomBytes(size) {
          return Buffer.alloc(size, FIXED_RANDOM_BYTE);
        },
      }),
  });
}

function quoteRequest(account, overrides = {}) {
  return {
    recipeId: RECIPE_ID,
    materialInstanceIds: {
      core: account.materials.core.instanceId,
      resonance_one: account.materials.resonance_one.instanceId,
      resonance_two: account.materials.resonance_two.instanceId,
    },
    ...overrides,
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

function invokeFusion(service, account, catalog, options = {}) {
  return service.invokeDurable("fusePets", [
    account.session.token,
    options.payload || executeRequest(account, catalog),
  ], {
    operationId: String(options.operationId || "pet_fusion_service_operation_0001"),
    requestHash: String(options.requestHash || "f".repeat(64)),
    actionId: ACTION_ID,
  });
}

function saveInternalProfile(service, account, mutate) {
  const profile = structuredClone(
    internalProfileForAccount(service, account.account.accountId),
  );
  mutate(profile);
  const current = service.getProfile(account.session.token);
  assert.equal(current.ok, true);
  const saved = service.saveProfile(account.session.token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile,
  });
  assert.equal(saved.ok, true, saved.message);
  account.profileRevision = saved.profileSummary.profileRevision;
}

function storedProfileForAccount(data, accountId) {
  const binding = data.profileBindings && data.profileBindings[accountId];
  const profileDoc = binding && data.profiles && data.profiles[binding.playerId];
  assert.ok(
    profileDoc && profileDoc.profile,
    `missing stored profile for account ${accountId}`,
  );
  return profileDoc.profile;
}

function mutateStoredProfile(store, accountId, mutate) {
  const data = store.load();
  mutate(storedProfileForAccount(data, accountId));
  store.save(data);
}

function deepFreezeTestValue(value, seen = new WeakSet()) {
  if (
    value === null
    || typeof value !== "object"
    || seen.has(value)
  ) {
    return value;
  }
  seen.add(value);
  for (const child of Object.values(value)) {
    deepFreezeTestValue(child, seen);
  }
  return Object.freeze(value);
}

function readOnlyFrozenStore(backingStore) {
  return {
    mode: "memory",
    checkHealth() {
      return {ok: true};
    },
    async checkHealthAsync() {
      return {ok: true};
    },
    load() {
      return deepFreezeTestValue(backingStore.load());
    },
    save() {
      throw new Error("read-only fusion quote store must not be saved");
    },
  };
}

function resultNumericFingerprint(pet) {
  return {
    maxHp: pet.maxHp,
    attack: pet.attack,
    defense: pet.defense,
    quick: pet.quick,
    initialStats: structuredClone(pet.initialStats),
    growthSpeciesLevel1Stats: structuredClone(pet.growthSpeciesLevel1Stats),
    growthPublic: structuredClone(pet.petGrowth.public),
    growthPrivateRoll: structuredClone(pet.petGrowth.private.privateRoll),
  };
}

test("fusion quote is read-only and authoritative fusion consumes three pets into one independent terminal result", async () => {
  const catalog = createEnabledTestFusionCatalog();
  const store = createMemoryAuthStore();
  const service = createFusionService({catalog, store});
  const account = seedFusionAccount(service, {
    catalog,
    username: "fusionhappy",
    coreBinding: "bound",
    overridesByRole: {
      core: {level: 131},
      resonance_one: {level: 140},
    },
  });
  const before = structuredClone(
    internalProfileForAccount(service, account.account.accountId),
  );
  const sourceIds = before.petInstances.map((pet) => pet.instanceId);
  const sourcePrivateSeeds = before.petInstances.map(
    (pet) => pet.petGrowth.private.privateSeed,
  );

  const quote = service.getPetFusionQuote(
    account.session.token,
    quoteRequest(account),
  );
  assert.equal(quote.ok, true, quote.message);
  assert.equal(quote.petFusionQuote.catalogId, catalog.catalogId);
  assert.equal(quote.petFusionQuote.profileRevision, account.profileRevision);
  assert.deepEqual(
    quote.petFusionQuote.materials.map((entry) => entry.level),
    [131, 140, 136],
  );
  assert.deepEqual(quote.petFusionQuote.inheritance, {
    baseActiveSkillIds: ["pet_attack", "pet_defend"],
    specialActiveInheritanceChance: 0.5,
    activeRollsIndependent: true,
    ordinaryOrTrainingActiveInheritance: false,
    duplicateActiveSkillPolicy: "deduplicate_after_roll_no_reroll",
    passiveSourceWeights: {
      core: 0.4,
      resonance_one: 0.3,
      resonance_two: 0.3,
    },
    resultPassiveSkillCount: 1,
  });
  assert.deepEqual(quote.petFusionQuote.result, {
    targetFormId: TARGET_FORM_ID,
    targetFormName: "测试融合兽",
    level: 1,
    rebirthCount: 1,
    terminalStage: 2,
    terminalStageLabel: "2转/进化/融合",
    numericSource: "target_profile_only_v1",
    materialNumericInheritance: false,
    rideable: false,
  });
  assert.deepEqual(
    internalProfileForAccount(service, account.account.accountId),
    before,
  );
  for (const seed of sourcePrivateSeeds) {
    assert.equal(JSON.stringify(quote).includes(seed), false);
  }

  const direct = service.fusePets(
    account.session.token,
    executeRequest(account, catalog),
  );
  assert.equal(direct.ok, false);
  assert.equal(direct.code, "idempotency_key_required");
  assert.deepEqual(
    internalProfileForAccount(service, account.account.accountId),
    before,
  );

  const result = await invokeFusion(service, account, catalog);
  assert.equal(result.ok, true, result.message);
  assert.equal(result.durableCommit.replayed, false);
  assert.equal(result.profileBinding.profileRevision, account.profileRevision + 1);
  assert.equal(result.profile.petInstances.length, 1);
  assert.equal(result.petFusion.targetFormId, TARGET_FORM_ID);
  assert.equal(result.petFusion.resultInstanceId, "pet_fusion_100");
  assert.equal(sourceIds.includes(result.petFusion.resultInstanceId), false);
  assert.deepEqual(
    result.petFusion.consumedMaterials.map((entry) => entry.instanceId),
    sourceIds,
  );
  assert.deepEqual(result.petFusion.baseActiveSkillIds, [
    "pet_attack",
    "pet_defend",
  ]);
  assert.deepEqual(result.petFusion.inheritedActiveSkillIds, [
    "pet_gene_gamma_roar",
  ]);
  assert.equal(result.petFusion.inheritedPassiveSkillId, "wuli_hard_shell");
  assert.equal(result.petFusion.passiveSourceRoleId, "core");
  assert.equal(result.petFusion.materialNumericInheritance, false);

  const publicPet = result.profile.petInstances[0];
  assert.equal(publicPet.instanceId, result.petFusion.resultInstanceId);
  assert.equal(publicPet.formId, TARGET_FORM_ID);
  assert.equal(publicPet.level, 1);
  assert.equal(publicPet.state, "battle");
  assert.equal(publicPet.binding, "bound");
  assert.equal(result.profile.activePetInstanceId, publicPet.instanceId);
  assert.deepEqual(publicPet.activeSkillIds, [
    "pet_attack",
    "pet_defend",
    "pet_gene_gamma_roar",
  ]);
  assert.equal(publicPet.activeSkillIds.includes("pet_focus_bite"), false);
  assert.equal(publicPet.activeSkillIds.includes("pet_sleep_powder"), false);
  assert.deepEqual(publicPet.passiveSkillIds, ["wuli_hard_shell"]);
  assert.equal(publicPet.fusionLineage.mode, "fusion");
  assert.equal(publicPet.fusionLineage.terminalStage, 2);
  assert.equal(publicPet.fusionLineage.sourceMaterials.length, 3);
  assert.deepEqual(publicPet.fusionLineage.activeInheritance, [{
    roleId: "resonance_two",
    skillId: "pet_gene_gamma_roar",
    inherited: true,
  }]);
  assert.deepEqual(publicPet.fusionLineage.passiveInheritance, {
    roleId: "core",
    skillId: "wuli_hard_shell",
  });
  assert.equal(Object.hasOwn(publicPet, "fusionPrivate"), false);
  assert.equal(Object.hasOwn(publicPet.petGrowth, "private"), false);
  assert.equal(
    Object.hasOwn(publicPet.fusionLineage.sourceMaterials[0], "geneProfileId"),
    false,
  );

  const internal = internalProfileForAccount(
    service,
    account.account.accountId,
  );
  assert.equal(internal.petInstances.length, 1);
  const fused = internal.petInstances[0];
  assert.equal(fused.fusionPrivate.privateRootSeed.startsWith("bpfr1_"), true);
  assert.equal(fused.fusionPrivate.growthPrivateSeed.startsWith("bps1_"), true);
  assert.equal(
    sourcePrivateSeeds.includes(fused.petGrowth.private.privateSeed),
    false,
  );
  assert.equal(fused.petCultivation.rebirthCount, 1);
  assert.equal(fused.petCultivation.enhanceLevel, 0);
  assert.deepEqual(fused.petCultivation.rebirthGrowthBonus, {
    maxHp: 0,
    attack: 0,
    defense: 0,
    quick: 0,
  });
  assert.equal(fused.attack === 222 || fused.attack === 999, false);
  const publicJson = JSON.stringify(result);
  assert.equal(publicJson.includes(fused.fusionPrivate.privateRootSeed), false);
  assert.equal(publicJson.includes(fused.fusionPrivate.growthPrivateSeed), false);
  assert.equal(publicJson.includes(fused.petGrowth.private.privateSeed), false);

  const alternateService = createFusionService({catalog});
  const alternateAccount = seedFusionAccount(alternateService, {
    catalog,
    username: "fusionalternate",
    coreBinding: "bound",
    privateSeedBytesByRole: {
      core: 0x71,
      resonance_one: 0x72,
      resonance_two: 0x73,
    },
    overridesByRole: {
      core: {level: 131},
      resonance_one: {level: 140},
    },
  });
  const alternateSources = internalProfileForAccount(
    alternateService,
    alternateAccount.account.accountId,
  ).petInstances;
  assert.notDeepEqual(
    alternateSources.map(resultNumericFingerprint),
    before.petInstances.map(resultNumericFingerprint),
  );
  const alternateResult = await invokeFusion(
    alternateService,
    alternateAccount,
    catalog,
    {
      operationId: "pet_fusion_alternate_sources_operation_0001",
      requestHash: "e".repeat(64),
    },
  );
  assert.equal(alternateResult.ok, true, alternateResult.message);
  const alternateFused = internalProfileForAccount(
    alternateService,
    alternateAccount.account.accountId,
  ).petInstances[0];
  assert.deepEqual(
    resultNumericFingerprint(alternateFused),
    resultNumericFingerprint(fused),
  );
});

test("fusion rejects tampered authority-v1 growth on quote and execute without persistence", async () => {
  const catalog = createEnabledTestFusionCatalog();
  const store = createMemoryAuthStore();
  const service = createFusionService({catalog, store});
  const account = seedFusionAccount(service, {
    catalog,
    username: "fusion_growth_tamper",
  });
  saveInternalProfile(service, account, (profile) => {
    const core = profile.petInstances.find(
      (pet) => pet.instanceId === account.materials.core.instanceId,
    );
    assert.ok(core && core.petGrowth && core.petGrowth.private);
    core.petGrowth.private.continuousStats.attack += 0.125;
  });
  const before = store.load();

  const quote = service.getPetFusionQuote(
    account.session.token,
    quoteRequest(account),
  );
  assert.equal(quote.ok, false);
  assert.equal(quote.code, "pet_fusion_material_growth_unsupported");
  assert.deepEqual(store.load(), before);

  const executed = await invokeFusion(service, account, catalog, {
    operationId: "pet_fusion_tampered_growth_operation_0001",
    requestHash: "a".repeat(64),
  });
  assert.equal(executed.ok, false);
  assert.equal(executed.code, "pet_fusion_material_growth_unsupported");
  assert.deepEqual(store.load(), before);
});

test("fusion rejects an evolution target form even when its lineage marker is missing", async () => {
  const catalog = createEnabledTestFusionCatalog();
  const store = createMemoryAuthStore();
  const service = createFusionService({
    catalog,
    store,
    petEvolutionRouteCatalog: Object.freeze({
      schemaVersion: 2,
      catalogId: "test_evolution_target_guard",
      runtimeEnabled: true,
      routes: Object.freeze([
        Object.freeze({targetFormId: "test_form_alpha_a"}),
      ]),
      routesById: Object.freeze({}),
      manualEncounterRules: Object.freeze([]),
    }),
  });
  const account = seedFusionAccount(service, {
    catalog,
    username: "fusionevoguard",
  });
  const before = store.load();

  const quote = service.getPetFusionQuote(
    account.session.token,
    quoteRequest(account),
  );
  assert.equal(quote.ok, false);
  assert.equal(quote.code, "pet_fusion_material_terminal");
  assert.deepEqual(store.load(), before);

  const executed = await invokeFusion(service, account, catalog, {
    operationId: "pet_fusion_evolution_target_guard_0001",
    requestHash: "9".repeat(64),
  });
  assert.equal(executed.ok, false);
  assert.equal(executed.code, "pet_fusion_material_terminal");
  assert.deepEqual(store.load(), before);
});

test("legacy-only profile.pets quotes read-only and fuses into canonical petInstances", async () => {
  const catalog = createEnabledTestFusionCatalog();
  const store = createMemoryAuthStore();
  const seedService = createFusionService({catalog, store});
  const account = seedFusionAccount(seedService, {
    catalog,
    username: "fusion_legacy_only",
  });
  const accountId = account.account.accountId;
  mutateStoredProfile(store, accountId, (profile) => {
    profile.pets = structuredClone(profile.petInstances);
    delete profile.petInstances;
  });
  const legacyBeforeQuote = store.load();
  const legacyProfile = storedProfileForAccount(legacyBeforeQuote, accountId);
  assert.equal(Object.hasOwn(legacyProfile, "petInstances"), false);
  assert.equal(legacyProfile.pets.length, 3);
  const sourceIds = legacyProfile.pets.map((pet) => pet.instanceId);

  const quoteService = createFusionService({
    catalog,
    store: readOnlyFrozenStore(store),
  });
  const quote = quoteService.getPetFusionQuote(
    account.session.token,
    quoteRequest(account),
  );
  assert.equal(quote.ok, true, quote.message);
  assert.deepEqual(store.load(), legacyBeforeQuote);
  assert.equal(
    Object.hasOwn(storedProfileForAccount(store.load(), accountId), "petInstances"),
    false,
  );

  const executeService = createFusionService({catalog, store});
  const result = await invokeFusion(executeService, account, catalog, {
    operationId: "pet_fusion_legacy_only_operation_0001",
    requestHash: "b".repeat(64),
  });
  assert.equal(result.ok, true, result.message);
  assert.equal(result.petFusion.consumedMaterials.length, 3);
  assert.deepEqual(
    result.petFusion.consumedMaterials.map((entry) => entry.instanceId),
    sourceIds,
  );
  const after = store.load();
  const canonicalProfile = storedProfileForAccount(after, accountId);
  assert.equal(Object.hasOwn(canonicalProfile, "pets"), false);
  assert.equal(Array.isArray(canonicalProfile.petInstances), true);
  assert.equal(canonicalProfile.petInstances.length, 1);
  assert.equal(
    sourceIds.includes(canonicalProfile.petInstances[0].instanceId),
    false,
  );
  assert.equal(
    canonicalProfile.petInstances[0].instanceId,
    result.petFusion.resultInstanceId,
  );
});

test("divergent petInstances and pets fail closed on quote and execute without persistence", async () => {
  const catalog = createEnabledTestFusionCatalog();
  const store = createMemoryAuthStore();
  const seedService = createFusionService({catalog, store});
  const account = seedFusionAccount(seedService, {
    catalog,
    username: "fusion_dual_conflict",
  });
  const accountId = account.account.accountId;
  mutateStoredProfile(store, accountId, (profile) => {
    profile.pets = structuredClone(profile.petInstances);
    profile.pets[0].name = `${profile.pets[0].name}（冲突副本）`;
  });
  const before = store.load();
  const conflictProfile = storedProfileForAccount(before, accountId);
  assert.equal(Array.isArray(conflictProfile.petInstances), true);
  assert.equal(Array.isArray(conflictProfile.pets), true);
  assert.notDeepEqual(conflictProfile.petInstances, conflictProfile.pets);

  const service = createFusionService({catalog, store});
  const quote = service.getPetFusionQuote(
    account.session.token,
    quoteRequest(account),
  );
  assert.equal(quote.ok, false);
  assert.equal(quote.code, "pet_profile_pet_container_conflict");
  assert.deepEqual(store.load(), before);

  const executed = await invokeFusion(service, account, catalog, {
    operationId: "pet_fusion_container_conflict_operation_0001",
    requestHash: "c".repeat(64),
  });
  assert.equal(executed.ok, false);
  assert.equal(executed.code, "pet_profile_pet_container_conflict");
  assert.deepEqual(store.load(), before);
});

test("fusion requests are exact and three material roles must contain unique instances", async () => {
  const catalog = createEnabledTestFusionCatalog();
  const service = createFusionService({catalog});
  const account = seedFusionAccount(service, {
    catalog,
    username: "fusion_exact_request",
  });
  const before = structuredClone(
    internalProfileForAccount(service, account.account.accountId),
  );

  const extraQuoteField = service.getPetFusionQuote(account.session.token, {
    ...quoteRequest(account),
    inheritedSkillIds: ["forged"],
  });
  assert.equal(extraQuoteField.ok, false);
  assert.equal(extraQuoteField.code, "pet_fusion_request_invalid");

  const missingRole = service.getPetFusionQuote(account.session.token, {
    recipeId: RECIPE_ID,
    materialInstanceIds: {
      core: account.materials.core.instanceId,
      resonance_one: account.materials.resonance_one.instanceId,
    },
  });
  assert.equal(missingRole.ok, false);
  assert.equal(missingRole.code, "pet_fusion_request_invalid");

  const duplicate = service.getPetFusionQuote(account.session.token, {
    recipeId: RECIPE_ID,
    materialInstanceIds: {
      core: account.materials.core.instanceId,
      resonance_one: account.materials.core.instanceId,
      resonance_two: account.materials.resonance_two.instanceId,
    },
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "pet_fusion_material_duplicate");

  const forgedMutation = await invokeFusion(service, account, catalog, {
    operationId: "pet_fusion_forged_request_0001",
    requestHash: "d".repeat(64),
    payload: {
      ...executeRequest(account, catalog),
      targetFormId: "forged_target",
    },
  });
  assert.equal(forgedMutation.ok, false);
  assert.equal(forgedMutation.code, "pet_fusion_request_invalid");
  assert.deepEqual(
    internalProfileForAccount(service, account.account.accountId),
    before,
  );
});

test("fusion eligibility enforces exact one-rebirth Lv131-140 ordinary materials and protection locks", async (t) => {
  const cases = [
    {
      name: "below Lv131",
      seed: {overridesByRole: {core: {level: 130}}},
      code: "pet_fusion_material_level",
    },
    {
      name: "above Lv140",
      seed: {overridesByRole: {core: {level: 141}}},
      code: "pet_fusion_material_level",
    },
    {
      name: "zero rebirth",
      seed: {
        overridesByRole: {
          core: {
            overrides: {
              petCultivation: {
                schemaVersion: 1,
                rebirthCount: 0,
                enhanceLevel: 0,
                rebirthGrowthBonus: {},
                history: [],
                lastPreview: {},
                lastResult: {},
              },
            },
          },
        },
      },
      code: "pet_fusion_material_rebirth",
    },
    {
      name: "second rebirth",
      seed: {
        overridesByRole: {
          core: {
            overrides: {
              petCultivation: {
                schemaVersion: 1,
                rebirthCount: 2,
                enhanceLevel: 0,
                rebirthGrowthBonus: {},
                history: [],
                lastPreview: {},
                lastResult: {},
              },
            },
          },
        },
      },
      code: "pet_fusion_material_rebirth",
    },
    {
      name: "already terminal",
      seed: {
        overridesByRole: {
          core: {
            overrides: {
              fusionLineage: {
                schemaVersion: 1,
                mode: "fusion",
                terminalStage: 2,
              },
            },
          },
        },
      },
      code: "pet_fusion_material_terminal",
    },
    {
      name: "locked material",
      seed: {overridesByRole: {core: {locked: true}}},
      code: "pet_locked",
    },
    {
      name: "riding material",
      seed: {overridesByRole: {core: {state: "riding"}}},
      code: "pet_riding",
    },
    {
      name: "offline hang active",
      setup(service, account) {
        saveInternalProfile(service, account, (profile) => {
          profile.offlineHang = {
            schemaVersion: 1,
            session: {
              schemaVersion: 1,
              status: "active",
              sessionId: "fusion_offline_hang",
            },
            ledger: [],
          };
        });
      },
      code: "offline_hang_active",
    },
    {
      name: "active battle room",
      setup(service, account) {
        const rival = service.register({
          username: "fusion_lock_rival",
          password: "test1234",
          displayName: "融合锁对手",
        });
        assert.equal(rival.ok, true);
        assert.equal(service.updatePlayerPosition(account.session.token, {
          mapId: "village",
          cellX: 10,
          cellY: 10,
          facing: "east",
          moving: false,
        }).ok, true);
        assert.equal(service.updatePlayerPosition(rival.session.token, {
          mapId: "village",
          cellX: 11,
          cellY: 10,
          facing: "west",
          moving: false,
        }).ok, true);
        const invitation = service.inviteToBattle(account.session.token, {
          username: "fusion_lock_rival",
        });
        assert.equal(invitation.ok, true);
        const accepted = service.acceptBattleInvite(
          rival.session.token,
          invitation.invite.inviteId,
        );
        assert.equal(accepted.ok, true);
      },
      code: "battle_profile_mutation_locked",
    },
  ];

  for (const [index, fixture] of cases.entries()) {
    await t.test(fixture.name, () => {
      const catalog = createEnabledTestFusionCatalog();
      const service = createFusionService({catalog});
      const account = seedFusionAccount(service, {
        catalog,
        username: `fusion_guard_${index}`,
        ...(fixture.seed || {}),
      });
      if (fixture.setup) fixture.setup(service, account);
      const before = structuredClone(
        internalProfileForAccount(service, account.account.accountId),
      );
      const result = service.getPetFusionQuote(
        account.session.token,
        quoteRequest(account),
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, fixture.code);
      assert.deepEqual(
        internalProfileForAccount(service, account.account.accountId),
        before,
      );
    });
  }
});
