"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const battleActionsDocument = require("../../../client/godot/data/battle_actions.json");
const skillTrainingDocument = require("../../../client/godot/data/pet_skill_training.json");

const {
  PET_FUSION_CATALOG_ID,
  PET_FUSION_ROLE_IDS,
  PetFusionRecipeCatalogError,
  createPetFusionRecipeCatalog,
  loadPetFusionRecipeCatalog,
} = require("../src/auth/pet-fusion-recipe-catalog");
const {
  GENE_CORE_A,
  GENE_CORE_B,
  RECIPE_ID,
  TARGET_FORM_ID,
  TARGET_GROWTH_PROFILE_ID,
  createTestFusionCatalog,
  testFusionDocuments,
} = require("../test-support/pet-fusion-fixture");

test("production fusion catalog registers two formal recipes while runtime stays closed", () => {
  const catalog = loadPetFusionRecipeCatalog();

  assert.equal(catalog.schemaVersion, 2);
  assert.equal(catalog.catalogId, PET_FUSION_CATALOG_ID);
  assert.equal(catalog.runtimeEnabled, false);
  assert.deepEqual(catalog.rules.roleIds, PET_FUSION_ROLE_IDS);
  assert.equal(catalog.rules.minimumLevel, 131);
  assert.equal(catalog.rules.maximumLevel, 140);
  assert.equal(catalog.rules.specialActiveInheritanceChance, 0.5);
  assert.deepEqual(catalog.rules.passiveSourceWeights, {
    core: 0.4,
    resonance_one: 0.3,
    resonance_two: 0.3,
  });
  assert.equal(catalog.rules.materialNumericInheritance, false);
  assert.equal(catalog.rules.resultRideable, false);
  assert.equal(catalog.rules.additionalCostPolicy, "materials_only");
  assert.equal(
    catalog.rules.resultBindingPolicy,
    "bound_if_any_material_bound",
  );
  assert.equal(
    catalog.rules.unboundResultTradePolicy,
    "eligible_when_pet_trading_available",
  );
  assert.equal(catalog.rules.baseActiveSkillForgetPolicy, "forbidden");
  assert.equal(
    catalog.rules.inheritedSpecialActiveForgetPolicy,
    "double_confirm_irreversible",
  );
  assert.equal(catalog.rules.postFusionTrainingPolicy, "empty_slots_only");
  assert.deepEqual(
    catalog.geneProfiles.map((profile) => ({
      geneProfileId: profile.geneProfileId,
      formId: profile.formId,
      specialActiveSkillId: profile.specialActiveSkillId,
      passiveSkillId: profile.passiveSkillId,
    })),
    [
      {
        geneProfileId: "fusion_gene_emberhorn_red_v1",
        formId: "emberhorn_red_fire8_earth2",
        specialActiveSkillId: "pet_gene_emberhorn_red_heavy_charge",
        passiveSkillId: "emberhorn_red_burning_mind",
      },
      {
        geneProfileId: "fusion_gene_emberhorn_ash_v1",
        formId: "emberhorn_ash_fire6_wind4",
        specialActiveSkillId: "pet_gene_emberhorn_ash_sure_charge",
        passiveSkillId: "emberhorn_ash_cinder_breath",
      },
      {
        geneProfileId: "fusion_gene_emberhorn_gale_v1",
        formId: "emberhorn_gale_fire5_wind5",
        specialActiveSkillId: "pet_gene_emberhorn_gale_rending_charge",
        passiveSkillId: "emberhorn_gale_wakeful_instinct",
      },
      {
        geneProfileId: "fusion_gene_mossback_marsh_v1",
        formId: "mossback_marsh_earth7_water3",
        specialActiveSkillId: "pet_gene_mossback_marsh_sure_crush",
        passiveSkillId: "mossback_marsh_adaptive_shell",
      },
      {
        geneProfileId: "fusion_gene_mossback_sunbaked_v1",
        formId: "mossback_sunbaked_earth6_fire4",
        specialActiveSkillId: "pet_gene_mossback_sunbaked_heavy_crush",
        passiveSkillId: "mossback_sunbaked_grounded_shell",
      },
    ],
  );
  assert.deepEqual(
    catalog.geneProfiles.map((profile) => profile.lineageId),
    ["emberhorn", "emberhorn", "emberhorn", "mossback", "mossback"],
  );
  assert.deepEqual(
    catalog.recipes.map((recipe) => ({
      recipeId: recipe.recipeId,
      targetFormId: recipe.targetFormId,
      targetGrowthProfileId: recipe.targetGrowthProfileId,
      roleGeneRules: recipe.roleGeneRules,
      result: recipe.result,
      assetGate: recipe.assetGate,
    })),
    [
      {
        recipeId: "emberhorn_solar_crown_fusion_v1",
        targetFormId: "emberhorn_fusion_solar_crown_fire7_wind3",
        targetGrowthProfileId:
          "emberhorn_fusion_solar_crown_fire7_wind3_v1",
        roleGeneRules: {
          core: {
            allowedLineageIds: ["emberhorn"],
            allowedGeneProfileIds: [
              "fusion_gene_emberhorn_red_v1",
              "fusion_gene_emberhorn_ash_v1",
              "fusion_gene_emberhorn_gale_v1",
            ],
          },
          resonance_one: {
            allowedLineageIds: ["emberhorn"],
            allowedGeneProfileIds: [
              "fusion_gene_emberhorn_red_v1",
              "fusion_gene_emberhorn_ash_v1",
              "fusion_gene_emberhorn_gale_v1",
            ],
          },
          resonance_two: {
            allowedLineageIds: ["emberhorn", "mossback"],
            allowedGeneProfileIds: [
              "fusion_gene_emberhorn_red_v1",
              "fusion_gene_emberhorn_ash_v1",
              "fusion_gene_emberhorn_gale_v1",
              "fusion_gene_mossback_marsh_v1",
              "fusion_gene_mossback_sunbaked_v1",
            ],
          },
        },
        result: {
          level: 1,
          rebirthCount: 1,
          terminalPathId: "fusion_terminal_v1",
          paidResetAllowed: false,
          newInstanceRequired: true,
          numericSource: "target_profile_only_v1",
          rideable: false,
          bindingPolicy: "bound_if_any_material_bound",
          resultStatePolicy: "replace_active_else_core_state",
        },
        assetGate: {
          status: "formal",
          replacementPath:
            "client/godot/assets/pets/"
            + "emberhorn_fusion_solar_crown_fire7_wind3",
        },
      },
      {
        recipeId: "emberhorn_moss_rampart_fusion_v1",
        targetFormId: "emberhorn_fusion_moss_rampart_fire4_earth6",
        targetGrowthProfileId:
          "emberhorn_fusion_moss_rampart_fire4_earth6_v1",
        roleGeneRules: {
          core: {
            allowedLineageIds: ["emberhorn"],
            allowedGeneProfileIds: [
              "fusion_gene_emberhorn_red_v1",
              "fusion_gene_emberhorn_ash_v1",
              "fusion_gene_emberhorn_gale_v1",
            ],
          },
          resonance_one: {
            allowedLineageIds: ["mossback"],
            allowedGeneProfileIds: [
              "fusion_gene_mossback_marsh_v1",
              "fusion_gene_mossback_sunbaked_v1",
            ],
          },
          resonance_two: {
            allowedLineageIds: ["emberhorn", "mossback"],
            allowedGeneProfileIds: [
              "fusion_gene_emberhorn_red_v1",
              "fusion_gene_emberhorn_ash_v1",
              "fusion_gene_emberhorn_gale_v1",
              "fusion_gene_mossback_marsh_v1",
              "fusion_gene_mossback_sunbaked_v1",
            ],
          },
        },
        result: {
          level: 1,
          rebirthCount: 1,
          terminalPathId: "fusion_terminal_v1",
          paidResetAllowed: false,
          newInstanceRequired: true,
          numericSource: "target_profile_only_v1",
          rideable: false,
          bindingPolicy: "bound_if_any_material_bound",
          resultStatePolicy: "replace_active_else_core_state",
        },
        assetGate: {
          status: "formal",
          replacementPath:
            "client/godot/assets/pets/"
            + "emberhorn_fusion_moss_rampart_fire4_earth6",
        },
      },
    ],
  );
  assert.deepEqual(catalog.targetFormIds, [
    "emberhorn_fusion_moss_rampart_fire4_earth6",
    "emberhorn_fusion_solar_crown_fire7_wind3",
  ]);
  assert.deepEqual(catalog.terminalTargetFormIds, [
    "emberhorn_fusion_moss_rampart_fire4_earth6",
    "emberhorn_fusion_solar_crown_fire7_wind3",
  ]);
  assert.equal(Object.isFrozen(catalog), true);
  assert.equal(Object.isFrozen(catalog.rules), true);
  assert.equal(Object.isFrozen(catalog.geneProfiles[0]), true);
  assert.equal(Object.isFrozen(catalog.recipes[0]), true);
  assert.equal(Object.isFrozen(catalog.terminalTargetFormIds), true);
});

test("staged fusion bloodline actives are distinct single-target non-training damage contracts", () => {
  const catalog = loadPetFusionRecipeCatalog();
  const actionsById = Object.fromEntries(
    battleActionsDocument.actions.map((action) => [action.id, action]),
  );
  const trainableSkillIds = new Set(
    skillTrainingDocument.skills.map((entry) => entry.skillId),
  );
  const expectedEffects = {
    pet_gene_emberhorn_red_heavy_charge: {
      amountBonus: 28,
      canDodge: true,
      canCritical: false,
      canCounter: false,
    },
    pet_gene_emberhorn_ash_sure_charge: {
      amountBonus: 6,
      canDodge: false,
      canCritical: false,
      canCounter: false,
    },
    pet_gene_emberhorn_gale_rending_charge: {
      amountBonus: 10,
      canDodge: true,
      canCritical: true,
      canCounter: false,
    },
    pet_gene_mossback_marsh_sure_crush: {
      amountBonus: 2,
      canDodge: false,
      canCritical: true,
      canCounter: false,
    },
    pet_gene_mossback_sunbaked_heavy_crush: {
      amountBonus: 20,
      canDodge: true,
      canCritical: false,
      canCounter: false,
    },
  };

  for (const profile of catalog.geneProfiles) {
    const skillId = profile.specialActiveSkillId;
    const action = actionsById[skillId];
    assert.ok(action, `missing action ${skillId}`);
    assert.equal(action.owner, "pet_skill");
    assert.equal(action.command, "pet_skill");
    assert.deepEqual(action.target, {
      isAll: false,
      canTargetAlly: false,
      canTargetEnemy: true,
      requiresSelection: true,
      selfOnly: false,
    });
    assert.deepEqual(action.effect, {
      type: "damage",
      ...expectedEffects[skillId],
    });
    assert.equal(trainableSkillIds.has(skillId), false);
  }
});

test("fusion catalog collection fields fail closed when they are not arrays", async (t) => {
  for (const field of ["geneProfiles", "recipes"]) {
    await t.test(field, () => {
      const documents = testFusionDocuments();
      documents.document[field] = {};
      assert.throws(
        () => createPetFusionRecipeCatalog({
          ...documents,
          allowTestOnlyRecipes: true,
        }),
        (error) => catalogErrorIncludes(error, `catalog.${field} must be an array`),
      );
    });
  }
});

test("legacy fusion catalog schema and identity fail closed", async (t) => {
  await t.test("schemaVersion", () => {
    assert.throws(
      () => createTestFusionCatalog({
        mutate(documents) {
          documents.document.schemaVersion = 1;
        },
      }),
      (error) => catalogErrorIncludes(error, "catalog.schemaVersion must equal 2"),
    );
  });
  await t.test("catalogId", () => {
    assert.throws(
      () => createTestFusionCatalog({
        mutate(documents) {
          documents.document.catalogId = "pet_fusion_recipes_v1";
        },
      }),
      (error) => catalogErrorIncludes(
        error,
        "catalog.catalogId must equal pet_fusion_recipes_v2",
      ),
    );
  });
});

test("fusion catalog v2 global policies are exact and cannot silently drift", async (t) => {
  const invalidPolicies = [
    ["additionalCostPolicy", "stone_coins"],
    ["resultBindingPolicy", "always_bound"],
    ["unboundResultTradePolicy", "tradeable_now"],
    ["baseActiveSkillForgetPolicy", "allowed"],
    ["inheritedSpecialActiveForgetPolicy", "single_confirm"],
    ["postFusionTrainingPolicy", "replace_any_slot"],
  ];
  for (const [field, invalidValue] of invalidPolicies) {
    await t.test(field, () => {
      assert.throws(
        () => createTestFusionCatalog({
          mutate(documents) {
            documents.document.rules[field] = invalidValue;
          },
        }),
        (error) => catalogErrorIncludes(error, `catalog.rules.${field} must equal`),
      );
    });
  }
});

test("test-only recipe supports explicit core/resonance sets and wildcard resonance two", () => {
  const catalog = createTestFusionCatalog();
  const recipe = catalog.recipesById[RECIPE_ID];

  assert.equal(catalog.runtimeEnabled, false);
  assert.deepEqual(catalog.terminalTargetFormIds, [TARGET_FORM_ID]);
  assert.equal(Object.isFrozen(catalog.terminalTargetFormIds), true);
  assert.equal(recipe.targetFormId, TARGET_FORM_ID);
  assert.deepEqual(recipe.roleGeneRules.core, {
    allowedLineageIds: ["test_line_alpha"],
    allowedGeneProfileIds: [GENE_CORE_A, GENE_CORE_B],
  });
  assert.deepEqual(recipe.roleGeneRules.resonance_two, {
    allowedLineageIds: ["*"],
    allowedGeneProfileIds: ["*"],
  });
  assert.equal(recipe.result.rideable, false);
  assert.equal(recipe.result.bindingPolicy, "bound_if_any_material_bound");
  assert.equal(recipe.result.resultStatePolicy, "replace_active_else_core_state");
  assert.equal(recipe.assetGate.status, "test_only");
  assert.equal(Object.isFrozen(recipe.roleGeneRules.resonance_two), true);
});

test("test-only recipes cannot enter the production catalog loader contract", () => {
  const documents = testFusionDocuments();
  assert.throws(
    () => createPetFusionRecipeCatalog({
      ...documents,
      allowTestOnlyRecipes: false,
    }),
    (error) => catalogErrorIncludes(error, "assetGate.status must equal formal"),
  );
});

test("fusion recipe rejects rideable targets and wildcard appearance roles", async (t) => {
  await t.test("rideable target", () => {
    assert.throws(
      () => createTestFusionCatalog({
        mutate(documents) {
          const target = documents.templatesDocument.forms
            .find((form) => form.formId === TARGET_FORM_ID);
          target.riding.rideable = true;
        },
      }),
      (error) => catalogErrorIncludes(error, "target form must not be rideable"),
    );
  });

  await t.test("core wildcard", () => {
    assert.throws(
      () => createTestFusionCatalog({
        mutate(documents) {
          documents.document.recipes[0].roleGeneRules.core = {
            allowedLineageIds: ["*"],
            allowedGeneProfileIds: ["*"],
          };
        },
      }),
      (error) => catalogErrorIncludes(error, "wildcard is allowed only for resonance_two"),
    );
  });

  await t.test("resonance one wildcard", () => {
    assert.throws(
      () => createTestFusionCatalog({
        mutate(documents) {
          documents.document.recipes[0].roleGeneRules.resonance_one = {
            allowedLineageIds: ["*"],
            allowedGeneProfileIds: ["*"],
          };
        },
      }),
      (error) => catalogErrorIncludes(error, "wildcard is allowed only for resonance_two"),
    );
  });
});

test("enabled or resettable fusion targets fail closed", async (t) => {
  await t.test("empty enabled catalog", () => {
    const documents = testFusionDocuments();
    documents.document.runtimeEnabled = true;
    documents.document.geneProfiles = [];
    documents.document.recipes = [];
    assert.throws(
      () => createPetFusionRecipeCatalog({
        ...documents,
        allowTestOnlyRecipes: true,
      }),
      (error) => catalogErrorIncludes(error, "enabled fusion catalog must contain"),
    );
  });

  await t.test("target paid reset", () => {
    assert.throws(
      () => createTestFusionCatalog({
        mutate(documents) {
          documents.paidResetDocument.formPolicies[0] = {
            formId: TARGET_FORM_ID,
            acquisitionTier: "fusion",
            resetAllowed: true,
            priceTierId: "illegal",
          };
        },
      }),
      (error) => catalogErrorIncludes(error, "terminal_fusion"),
    );
  });
});

test("terminal fusion target index validates template and growth registration without recipes", async (t) => {
  await t.test("missing template", () => {
    assert.throws(
      () => createTestFusionCatalog({
        mutate(documents) {
          documents.document.recipes = [];
          documents.templatesDocument.forms = documents.templatesDocument.forms
            .filter((form) => form.formId !== TARGET_FORM_ID);
        },
      }),
      (error) => catalogErrorIncludes(
        error,
        `terminal fusion target form ${TARGET_FORM_ID} is missing from pet templates`,
      ),
    );
  });

  await t.test("missing growth profile", () => {
    assert.throws(
      () => createTestFusionCatalog({
        mutate(documents) {
          documents.document.recipes = [];
          documents.growthProfilesDocument.profiles = documents.growthProfilesDocument.profiles
            .filter((profile) => profile.profileId !== TARGET_GROWTH_PROFILE_ID);
        },
      }),
      (error) => catalogErrorIncludes(
        error,
        `terminal fusion target form ${TARGET_FORM_ID}`
        + " must reference a known pet growth profile",
      ),
    );
  });

  await t.test("growth profile belongs to another form", () => {
    assert.throws(
      () => createTestFusionCatalog({
        mutate(documents) {
          documents.document.recipes = [];
          const targetGrowthProfile = documents.growthProfilesDocument.profiles
            .find((profile) => profile.profileId === TARGET_GROWTH_PROFILE_ID);
          targetGrowthProfile.formId = "test_form_alpha_a";
        },
      }),
      (error) => catalogErrorIncludes(
        error,
        `terminal fusion target growth profile ${TARGET_GROWTH_PROFILE_ID}`
        + ` must belong to form ${TARGET_FORM_ID}`,
      ),
    );
  });
});

test("ordinary trainer skills cannot masquerade as explicit fusion genes", () => {
  assert.throws(
    () => createTestFusionCatalog({
      mutate(documents) {
        documents.document.geneProfiles[0].specialActiveSkillId = "pet_focus_bite";
      },
    }),
    (error) => catalogErrorIncludes(error, "must not be an ordinary trainable skill"),
  );
});

test("a fusion target can never re-enter gene profiles through wildcard resonance two", () => {
  assert.throws(
    () => createTestFusionCatalog({
      mutate(documents) {
        documents.document.geneProfiles.push({
          geneProfileId: "test_gene_illegal_fusion_target",
          lineageId: "test_line_fusion",
          formId: TARGET_FORM_ID,
          growthProfileId: TARGET_GROWTH_PROFILE_ID,
          materialClass: "ordinary",
          specialActiveSkillId: "pet_gene_alpha_pulse",
          passiveSkillId: "wuli_hard_shell",
        });
      },
    }),
    (error) => catalogErrorIncludes(
      error,
      "target form cannot be an approved fusion material",
    ),
  );
});

test("core and resonance-one lineage pairs have one target independent of resonance two", () => {
  assert.throws(
    () => createTestFusionCatalog({
      mutate(documents) {
        const secondTargetFormId = "test_fusion_alpha_beta_second";
        const secondTargetGrowthProfileId = "test_fusion_alpha_beta_second_growth_v1";
        documents.templatesDocument.forms.push({
          formId: secondTargetFormId,
          formName: "第二测试融合兽",
          lineId: "test_line_fusion",
          subtypeId: "test_fusion_alpha_beta_second",
          growthSpeciesProfileId: secondTargetGrowthProfileId,
          riding: {rideable: false},
        });
        documents.growthProfilesDocument.profiles.push({
          profileId: secondTargetGrowthProfileId,
          formId: secondTargetFormId,
        });
        documents.paidResetDocument.formPolicies.push({
          formId: secondTargetFormId,
          acquisitionTier: "fusion",
          resetAllowed: false,
          ineligibleReason: "terminal_fusion",
        });
        const competingRecipe = structuredClone(documents.document.recipes[0]);
        competingRecipe.recipeId = "test_alpha_beta_fusion_second_v1";
        competingRecipe.targetFormId = secondTargetFormId;
        competingRecipe.targetGrowthProfileId = secondTargetGrowthProfileId;
        competingRecipe.roleGeneRules.resonance_two = {
          allowedLineageIds: ["test_line_delta"],
          allowedGeneProfileIds: ["test_gene_resonance_delta"],
        };
        documents.document.recipes.push(competingRecipe);
      },
    }),
    (error) => catalogErrorIncludes(
      error,
      "appearance lineage pair test_line_alpha/test_line_beta is already assigned",
    ),
  );
});

test("fusion result policies are explicit and never defaulted", async (t) => {
  await t.test("missing binding policy", () => {
    assert.throws(
      () => createTestFusionCatalog({
        mutate(documents) {
          delete documents.document.recipes[0].result.bindingPolicy;
        },
      }),
      (error) => catalogErrorIncludes(error, "bindingPolicy"),
    );
  });

  await t.test("unknown binding policy", () => {
    assert.throws(
      () => createTestFusionCatalog({
        mutate(documents) {
          documents.document.recipes[0].result.bindingPolicy = "unbound";
        },
      }),
      (error) => catalogErrorIncludes(
        error,
        "bindingPolicy must equal bound_if_any_material_bound",
      ),
    );
  });

  await t.test("legacy always-bound policy", () => {
    assert.throws(
      () => createTestFusionCatalog({
        mutate(documents) {
          documents.document.recipes[0].result.bindingPolicy = "always_bound";
        },
      }),
      (error) => catalogErrorIncludes(
        error,
        "bindingPolicy must equal bound_if_any_material_bound",
      ),
    );
  });

  await t.test("missing result-state policy", () => {
    assert.throws(
      () => createTestFusionCatalog({
        mutate(documents) {
          delete documents.document.recipes[0].result.resultStatePolicy;
        },
      }),
      (error) => catalogErrorIncludes(error, "resultStatePolicy"),
    );
  });
});

function catalogErrorIncludes(error, fragment) {
  return error instanceof PetFusionRecipeCatalogError
    && error.errors.some((message) => message.includes(fragment));
}
