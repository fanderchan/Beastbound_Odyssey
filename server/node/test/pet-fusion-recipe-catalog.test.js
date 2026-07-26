"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

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

test("production fusion catalog is strict, empty, frozen, and runtime disabled", () => {
  const catalog = loadPetFusionRecipeCatalog();

  assert.equal(catalog.schemaVersion, 1);
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
  assert.deepEqual(catalog.geneProfiles, []);
  assert.deepEqual(catalog.recipes, []);
  assert.deepEqual(catalog.targetFormIds, []);
  assert.equal(Object.isFrozen(catalog), true);
  assert.equal(Object.isFrozen(catalog.rules), true);
});

test("test-only recipe supports explicit core/resonance sets and wildcard resonance two", () => {
  const catalog = createTestFusionCatalog();
  const recipe = catalog.recipesById[RECIPE_ID];

  assert.equal(catalog.runtimeEnabled, false);
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
      (error) => catalogErrorIncludes(error, "bindingPolicy must equal one of"),
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
