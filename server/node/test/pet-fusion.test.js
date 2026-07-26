"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  inspectPetFusionEligibility,
  resolvePetFusion,
  selectPassiveSourceRole,
} = require("../src/auth/pet-fusion");
const {
  createPetFusionRandomContext,
} = require("../src/auth/pet-fusion-random-authority");
const {
  GENE_CORE_A,
  GENE_RESONANCE_ONE,
  GENE_RESONANCE_TWO_DELTA,
  GENE_RESONANCE_TWO_GAMMA,
  RECIPE_ID,
  TARGET_FORM_ID,
  TARGET_GROWTH_PROFILE_ID,
  createFusionMaterials,
  createTestFusionCatalog,
  fixedFusionRandomContext,
} = require("../test-support/pet-fusion-fixture");

test("fusion inherits only explicit genes and emits a target-profile-only blueprint", () => {
  const catalog = createTestFusionCatalog();
  const materials = createFusionMaterials({catalog});
  const result = resolvePetFusion(materials, {
    catalog,
    recipeId: RECIPE_ID,
    randomContext: fusionRandomContext(21),
  });

  assert.equal(result.ok, true);
  assert.equal(result.blueprint.targetFormId, TARGET_FORM_ID);
  assert.equal(result.blueprint.catalogId, "pet_fusion_recipes_v1");
  assert.equal(result.blueprint.targetGrowthProfileId, TARGET_GROWTH_PROFILE_ID);
  assert.equal(result.blueprint.numericSource, "target_profile_only_v1");
  assert.equal(result.blueprint.rideable, false);
  assert.equal(result.blueprint.bindingPolicy, "bound_if_any_material_bound");
  assert.equal(result.blueprint.resultStatePolicy, "replace_active_else_core_state");
  assert.equal(result.blueprint.terminalStage, 2);
  assert.equal(result.blueprint.paidResetAllowed, false);
  assert.deepEqual(result.blueprint.activeSkillIds, [
    "pet_attack",
    "pet_defend",
    "pet_gene_alpha_pulse",
    "pet_gene_gamma_roar",
  ]);
  assert.deepEqual(result.blueprint.petSkillSlots, [
    "pet_attack",
    "pet_defend",
    "pet_gene_alpha_pulse",
    "pet_gene_gamma_roar",
    "",
    "",
    "",
  ]);
  assert.deepEqual(result.blueprint.passiveSkillIds, ["wuli_hard_shell"]);
  assert.equal(result.blueprint.activeSkillIds.includes("pet_focus_bite"), false);
  assert.equal(
    materials.core.forgottenSkillIds.includes("pet_gene_alpha_pulse"),
    true,
  );
  assert.deepEqual(result.publicResult.inheritedActiveSkillIds, [
    "pet_gene_alpha_pulse",
    "pet_gene_gamma_roar",
  ]);
  assert.equal(result.publicResult.inheritedPassiveSkillId, "wuli_hard_shell");
  assert.equal(result.publicResult.passiveSourceRoleId, "core");
  assert.equal(result.blueprint.fusionLineage.catalogId, "pet_fusion_recipes_v1");
});

test("fixed fusion root reproduces the complete blueprint and public result", () => {
  const catalog = createTestFusionCatalog();
  const materials = createFusionMaterials({catalog});
  const first = resolvePetFusion(materials, {
    catalog,
    recipeId: RECIPE_ID,
    randomContext: fixedFusionRandomContext(0x42),
  });
  const replay = resolvePetFusion(structuredClone(materials), {
    catalog,
    recipeId: RECIPE_ID,
    randomContext: fixedFusionRandomContext(0x42),
  });

  assert.equal(first.ok, true);
  assert.deepEqual(replay, first);
});

test("an evolution target form cannot fuse after its lineage marker is lost", () => {
  const catalog = createTestFusionCatalog();
  const materials = createFusionMaterials({catalog});
  const result = inspectPetFusionEligibility(materials, {
    catalog,
    evolutionRouteCatalog: {
      routes: [{targetFormId: materials.core.formId}],
    },
    recipeId: RECIPE_ID,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "pet_fusion_material_terminal");
});

test("fusion eligibility fails closed for role, identity, stage, and authority violations", async (t) => {
  const catalog = createTestFusionCatalog();
  const inspect = (materials) => inspectPetFusionEligibility(materials, {
    catalog,
    recipeId: RECIPE_ID,
  });

  for (const level of [131, 140]) {
    await t.test(`accepts boundary level ${level}`, () => {
      const materials = createFusionMaterials({
        catalog,
        overridesByRole: {
          core: {
            level,
            overrides: {
              level,
              petGrowth: boundaryGrowth(
                catalog.geneProfilesById[GENE_CORE_A],
                level,
                0x61 + level % 2,
              ),
            },
          },
        },
      });
      assert.equal(inspect(materials).ok, true);
    });
  }

  const cases = [
    {
      name: "missing role",
      code: "pet_fusion_material_roles_invalid",
      mutate(materials) {
        delete materials.resonance_two;
      },
    },
    {
      name: "extra role",
      code: "pet_fusion_material_roles_invalid",
      mutate(materials) {
        materials.extra = materials.core;
      },
    },
    {
      name: "duplicate identity",
      code: "pet_fusion_material_duplicate",
      mutate(materials) {
        const id = materials.core.instanceId;
        materials.resonance_one.instanceId = id;
        materials.resonance_one.petId = id;
      },
    },
    {
      name: "wrong gene role",
      code: "pet_fusion_material_gene_mismatch",
      mutate(materials) {
        materials.core = structuredClone(materials.resonance_one);
        const id = "test_wrong_core_gene";
        materials.core.instanceId = id;
        materials.core.petId = id;
      },
    },
    {
      name: "level 130",
      code: "pet_fusion_material_level",
      mutate(materials) {
        materials.core.level = 130;
      },
    },
    {
      name: "level 141",
      code: "pet_fusion_material_level",
      mutate(materials) {
        materials.core.level = 141;
      },
    },
    {
      name: "zero rebirth",
      code: "pet_fusion_material_rebirth",
      mutate(materials) {
        materials.core.petCultivation.rebirthCount = 0;
      },
    },
    {
      name: "second rebirth",
      code: "pet_fusion_material_rebirth",
      mutate(materials) {
        materials.core.petCultivation.rebirthCount = 2;
      },
    },
    {
      name: "legacy growth",
      code: "pet_fusion_material_growth_unsupported",
      mutate(materials) {
        materials.core.petGrowth.modelVersion = "legacy_growth";
      },
    },
    {
      name: "evolution terminal evidence",
      code: "pet_fusion_material_terminal",
      mutate(materials) {
        materials.core.evolutionLineage = null;
      },
    },
    {
      name: "fusion terminal evidence",
      code: "pet_fusion_material_terminal",
      mutate(materials) {
        materials.core.fusionLineage = {mode: "fusion"};
      },
    },
    {
      name: "fusion target form without lineage",
      code: "pet_fusion_material_terminal",
      mutate(materials) {
        materials.core.formId = TARGET_FORM_ID;
        materials.core.templateId = TARGET_FORM_ID;
        materials.core.speciesId = TARGET_FORM_ID;
      },
    },
    {
      name: "rebirth helper",
      code: "pet_fusion_material_helper",
      mutate(materials) {
        materials.core.petRebirthHelper = {stage: 1};
      },
    },
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const materials = createFusionMaterials({catalog});
      fixture.mutate(materials);
      assert.equal(inspect(materials).code, fixture.code);
    });
  }
});

test("passive source uses exact 40/30/30 boundaries and returns exactly one passive", () => {
  assert.equal(selectPassiveSourceRole(0, weights()), "core");
  assert.equal(selectPassiveSourceRole(0.399999999, weights()), "core");
  assert.equal(selectPassiveSourceRole(0.4, weights()), "resonance_one");
  assert.equal(selectPassiveSourceRole(0.699999999, weights()), "resonance_one");
  assert.equal(selectPassiveSourceRole(0.7, weights()), "resonance_two");
  assert.equal(selectPassiveSourceRole(0.999999999, weights()), "resonance_two");

  const catalog = createTestFusionCatalog();
  for (const [seedIndex, expectedRole] of [
    [1, "core"],
    [40, "resonance_one"],
    [31, "resonance_two"],
  ]) {
    const result = resolvePetFusion(createFusionMaterials({catalog}), {
      catalog,
      recipeId: RECIPE_ID,
      randomContext: fusionRandomContext(seedIndex),
    });
    assert.equal(result.ok, true);
    assert.equal(result.publicResult.passiveSourceRoleId, expectedRole);
    assert.equal(result.blueprint.passiveSkillIds.length, 1);
  }
});

test("material stats, ordinary skills, and forgotten state cannot influence fusion output", () => {
  const catalog = createTestFusionCatalog();
  const baseline = createFusionMaterials({catalog});
  const noisy = structuredClone(baseline);
  for (const [index, material] of Object.values(noisy).entries()) {
    material.hp = 1 + index;
    material.maxHp = 100000 + index;
    material.attack = 90000 + index;
    material.defense = 80000 + index;
    material.quick = 70000 + index;
    material.initialStats = {maxHp: 4, attack: 3, defense: 2, quick: 1};
    material.growthSpeciesLevel1Stats = {maxHp: 1, attack: 2, defense: 3, quick: 4};
    material.activeSkillIds = ["pet_attack", "pet_defend", "pet_sleep_powder"];
    material.petSkillSlots = ["pet_sleep_powder", "", "", "", "", "", ""];
    material.passiveSkillIds = ["unrelated_runtime_passive"];
    material.learnedSkillIds = ["pet_sleep_powder"];
    material.inheritedSkillIds = ["unrelated_inherited_skill"];
    material.forgottenSkillIds = [];
    material.petCultivation.enhanceLevel = 999;
    material.petCultivation.rebirthGrowthBonus = {
      maxHp: 999,
      attack: 999,
      defense: 999,
      quick: 999,
    };
    material.petGrowth.private.privateSeed = validPrivateSeed(0x71 + index);
    material.petGrowth.private.privateRoll = {quality: 0};
    material.petGrowth.public.levelOneFourV = {
      maxHp: 1,
      attack: 1,
      defense: 1,
      quick: 1,
    };
    material.petGrowth.public.stats = {
      maxHp: 1,
      attack: 1,
      defense: 1,
      quick: 1,
    };
  }
  const baselineResult = resolvePetFusion(baseline, {
    catalog,
    recipeId: RECIPE_ID,
    randomContext: fixedFusionRandomContext(0x53),
  });
  const noisyResult = resolvePetFusion(noisy, {
    catalog,
    recipeId: RECIPE_ID,
    randomContext: fixedFusionRandomContext(0x53),
  });

  assert.equal(baselineResult.ok, true);
  assert.deepEqual(noisyResult, baselineResult);
});

test("resonance two changes only its gene candidate, never target form or growth authority", () => {
  const catalog = createTestFusionCatalog();
  const gamma = resolvePetFusion(createFusionMaterials({
    catalog,
    resonanceTwoGeneProfileId: GENE_RESONANCE_TWO_GAMMA,
  }), {
    catalog,
    recipeId: RECIPE_ID,
    randomContext: allGenesRandomContext(),
  });
  const delta = resolvePetFusion(createFusionMaterials({
    catalog,
    resonanceTwoGeneProfileId: GENE_RESONANCE_TWO_DELTA,
  }), {
    catalog,
    recipeId: RECIPE_ID,
    randomContext: allGenesRandomContext(),
  });

  assert.equal(gamma.ok, true);
  assert.equal(delta.ok, true);
  assert.equal(delta.blueprint.targetFormId, gamma.blueprint.targetFormId);
  assert.equal(
    delta.blueprint.targetGrowthProfileId,
    gamma.blueprint.targetGrowthProfileId,
  );
  assert.equal(delta.blueprint.numericSource, gamma.blueprint.numericSource);
  assert.equal(
    delta.blueprint.fusionPrivate.growthPrivateSeed,
    gamma.blueprint.fusionPrivate.growthPrivateSeed,
  );
  assert.equal(gamma.blueprint.activeSkillIds.includes("pet_gene_gamma_roar"), true);
  assert.equal(delta.blueprint.activeSkillIds.includes("pet_gene_delta_guard"), true);
  assert.equal(gamma.publicResult.inheritedPassiveSkillId, "poison_resistance");
  assert.equal(delta.publicResult.inheritedPassiveSkillId, "quick_instinct");
});

test("duplicate successful special genes occupy only one active slot", () => {
  const catalog = createTestFusionCatalog({
    mutate(documents) {
      const delta = documents.document.geneProfiles.find(
        (profile) => profile.geneProfileId === GENE_RESONANCE_TWO_DELTA,
      );
      delta.specialActiveSkillId = "pet_gene_alpha_pulse";
    },
  });
  const result = resolvePetFusion(createFusionMaterials({
    catalog,
    resonanceTwoGeneProfileId: GENE_RESONANCE_TWO_DELTA,
  }), {
    catalog,
    recipeId: RECIPE_ID,
    randomContext: allGenesRandomContext(),
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.blueprint.activeSkillIds.filter(
      (skillId) => skillId === "pet_gene_alpha_pulse",
    ).length,
    1,
  );
  assert.equal(
    result.publicResult.inheritedActiveSkillIds.filter(
      (skillId) => skillId === "pet_gene_alpha_pulse",
    ).length,
    1,
  );
});

test("fusion resolver rejects inconsistent authority and ignores external roll overrides", () => {
  const catalog = createTestFusionCatalog();
  const materials = createFusionMaterials({catalog});

  assert.equal(resolvePetFusion(materials, {
    catalog,
    recipeId: RECIPE_ID,
  }).code, "pet_fusion_random_context_invalid");
  assert.equal(resolvePetFusion(materials, {
    catalog,
    recipeId: RECIPE_ID,
    randomContext: {
      ...fixedFusionRandomContext(),
      seedCommitment: "0".repeat(64),
    },
  }).code, "pet_fusion_random_context_invalid");
  const trusted = fusionRandomContext(21);
  const baseline = resolvePetFusion(materials, {
    catalog,
    recipeId: RECIPE_ID,
    randomContext: trusted,
  });
  const overridden = resolvePetFusion(structuredClone(materials), {
    catalog,
    recipeId: RECIPE_ID,
    randomContext: {
      ...trusted,
      roll() {
        return 1;
      },
    },
  });
  const serialized = {...trusted};
  delete serialized.roll;
  const withoutExternalRoll = resolvePetFusion(structuredClone(materials), {
    catalog,
    recipeId: RECIPE_ID,
    randomContext: serialized,
  });

  assert.equal(baseline.ok, true);
  assert.deepEqual(overridden, baseline);
  assert.deepEqual(withoutExternalRoll, baseline);
});

function allGenesRandomContext() {
  return fusionRandomContext(74);
}

function fusionRandomContext(seedIndex) {
  const bytes = Buffer.alloc(32);
  bytes.writeUInt32BE(seedIndex, 28);
  return createPetFusionRandomContext(`bpfr1_${bytes.toString("base64url")}`);
}

function weights() {
  return {
    core: 0.4,
    resonance_one: 0.3,
    resonance_two: 0.3,
  };
}

function boundaryGrowth(geneProfile, level, byte) {
  return {
    schemaVersion: 1,
    modelVersion: "pet_growth_authority_v1",
    profileId: geneProfile.growthProfileId,
    settledLevel: level,
    private: {
      schemaVersion: 1,
      privateSeed: validPrivateSeed(byte),
    },
    public: {
      schemaVersion: 1,
      growthSpeciesProfileId: geneProfile.growthProfileId,
      level,
    },
  };
}

function validPrivateSeed(byte) {
  return `bps1_${Buffer.alloc(32, byte).toString("base64url")}`;
}
