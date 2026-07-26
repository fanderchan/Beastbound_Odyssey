"use strict";

const {
  PET_FUSION_ROLE_IDS,
  createPetFusionRecipeCatalog,
} = require("../src/auth/pet-fusion-recipe-catalog");
const {
  createPetFusionRandomContext,
} = require("../src/auth/pet-fusion-random-authority");
const {
  createPetGrowthCatalog,
} = require("../src/auth/pet-growth-catalog");
const {
  initializePetGrowth,
  settlePetGrowthToLevel,
} = require("../src/auth/pet-growth-runtime");
const {
  createPetRebirthGrowthCycle,
} = require("../src/auth/pet-rebirth-growth-cycle");

const RECIPE_ID = "test_alpha_beta_fusion_v1";
const TARGET_FORM_ID = "test_fusion_alpha_beta";
const TARGET_GROWTH_PROFILE_ID = "test_fusion_alpha_beta_growth_v1";

const GENE_CORE_A = "test_gene_core_alpha_a";
const GENE_CORE_B = "test_gene_core_alpha_b";
const GENE_RESONANCE_ONE = "test_gene_resonance_beta";
const GENE_RESONANCE_TWO_GAMMA = "test_gene_resonance_gamma";
const GENE_RESONANCE_TWO_DELTA = "test_gene_resonance_delta";

const GENE_PROFILES = Object.freeze([
  Object.freeze({
    geneProfileId: GENE_CORE_A,
    lineageId: "test_line_alpha",
    formId: "test_form_alpha_a",
    growthProfileId: "test_form_alpha_a_growth_v1",
    materialClass: "ordinary",
    specialActiveSkillId: "pet_gene_alpha_pulse",
    passiveSkillId: "wuli_hard_shell",
  }),
  Object.freeze({
    geneProfileId: GENE_CORE_B,
    lineageId: "test_line_alpha",
    formId: "test_form_alpha_b",
    growthProfileId: "test_form_alpha_b_growth_v1",
    materialClass: "ordinary",
    specialActiveSkillId: "pet_gene_alpha_arc",
    passiveSkillId: "stone_immunity",
  }),
  Object.freeze({
    geneProfileId: GENE_RESONANCE_ONE,
    lineageId: "test_line_beta",
    formId: "test_form_beta",
    growthProfileId: "test_form_beta_growth_v1",
    materialClass: "ordinary",
    specialActiveSkillId: "pet_gene_beta_dream",
    passiveSkillId: "bui_resistant_skin",
  }),
  Object.freeze({
    geneProfileId: GENE_RESONANCE_TWO_GAMMA,
    lineageId: "test_line_gamma",
    formId: "test_form_gamma",
    growthProfileId: "test_form_gamma_growth_v1",
    materialClass: "ordinary",
    specialActiveSkillId: "pet_gene_gamma_roar",
    passiveSkillId: "poison_resistance",
  }),
  Object.freeze({
    geneProfileId: GENE_RESONANCE_TWO_DELTA,
    lineageId: "test_line_delta",
    formId: "test_form_delta",
    growthProfileId: "test_form_delta_growth_v1",
    materialClass: "ordinary",
    specialActiveSkillId: "pet_gene_delta_guard",
    passiveSkillId: "quick_instinct",
  }),
]);

function createTestFusionCatalog(options = {}) {
  const documents = testFusionDocuments();
  const mutate = typeof options.mutate === "function" ? options.mutate : null;
  if (mutate) mutate(documents);
  return createPetFusionRecipeCatalog({
    ...documents,
    allowTestOnlyRecipes: options.allowTestOnlyRecipes !== false,
    catalogPath: "test://pet_fusion_recipes.json",
  });
}

function createEnabledTestFusionCatalog(options = {}) {
  return createTestFusionCatalog({
    ...options,
    mutate(documents) {
      documents.document.runtimeEnabled = true;
      documents.document.disabledMessage = "测试融合目录已启用。";
      documents.document.recipes[0].assetGate.status = "formal";
      if (typeof options.mutate === "function") options.mutate(documents);
    },
  });
}

function createTestFusionGrowthCatalog() {
  const targetTemplate = fusionTargetTemplate();
  const materialTemplates = GENE_PROFILES.map((geneProfile, index) => ({
    formId: geneProfile.formId,
    formName: geneProfile.formId,
    lineId: geneProfile.lineageId,
    lineName: geneProfile.lineageId,
    subtypeId: `${geneProfile.lineageId}_ordinary`,
    subtypeName: `${geneProfile.lineageId}_ordinary`,
    growthSpeciesProfileId: geneProfile.growthProfileId,
    growthProfileId: "balanced",
    elements: {earth: 4, water: 2, fire: 2, wind: 2},
    baseStats: testGrowthBaseStats(index),
  }));
  const profiles = GENE_PROFILES.map((geneProfile, index) => (
    testGrowthProfile(
      geneProfile.growthProfileId,
      geneProfile.formId,
      geneProfile.formId,
      index,
    )
  ));
  profiles.push(testGrowthProfile(
    TARGET_GROWTH_PROFILE_ID,
    TARGET_FORM_ID,
    targetTemplate.formName,
    GENE_PROFILES.length,
  ));
  return createPetGrowthCatalog({
    profileDocument: {
      schemaVersion: 1,
      profiles,
    },
    templateDocument: {
      schemaVersion: 1,
      forms: [...materialTemplates, targetTemplate],
    },
  });
}

function testGrowthProfile(profileId, formId, formName, index) {
  const baseStats = formId === TARGET_FORM_ID
    ? fusionTargetTemplate().baseStats
    : testGrowthBaseStats(index);
  return {
    profileId,
    displayName: `${formName}成长`,
    formId,
    formName,
    outputBase: {...baseStats},
    outputGrowth: {
      maxHp: 8 + index * 0.1,
      attack: 1.8 + index * 0.05,
      defense: 1.6 + index * 0.05,
      quick: 1.5 + index * 0.05,
    },
    individualRules: {
      initialOutputSpread: {
        maxHp: [-5, 5],
        attack: [-2, 2],
        defense: [-2, 2],
        quick: [-2, 2],
      },
      growthOutputSpread: {
        maxHp: [-1, 1],
        attack: [-0.2, 0.2],
        defense: [-0.2, 0.2],
        quick: [-0.2, 0.2],
      },
      distribution: "weighted_center",
      rareExtremeRate: 0.02,
    },
  };
}

function testGrowthBaseStats(index) {
  return {
    maxHp: 76 + index * 3,
    attack: 18 + index,
    defense: 16 + index,
    quick: 15 + index,
  };
}

function fusionTargetTemplate() {
  return {
    formId: TARGET_FORM_ID,
    formName: "测试融合兽",
    lineId: "test_line_fusion",
    lineName: "测试融合系",
    subtypeId: "test_fusion_alpha_beta",
    subtypeName: "测试融合亚种",
    growthSpeciesProfileId: TARGET_GROWTH_PROFILE_ID,
    growthProfileId: "balanced",
    riding: {rideable: false},
    elements: {earth: 4, water: 1, fire: 2, wind: 3},
    baseStats: {maxHp: 88, attack: 22, defense: 18, quick: 17},
  };
}

function fusionTargetTemplateForFormId(formId) {
  return String(formId || "") === TARGET_FORM_ID
    ? fusionTargetTemplate()
    : {};
}

function testFusionDocuments() {
  const forms = GENE_PROFILES.map((profile) => ({
    formId: profile.formId,
    formName: profile.formId,
    lineId: profile.lineageId,
    subtypeId: `${profile.lineageId}_ordinary`,
    growthSpeciesProfileId: profile.growthProfileId,
    baseStats: {maxHp: 1, attack: 1, defense: 1, quick: 1},
  }));
  forms.push({
    formId: TARGET_FORM_ID,
    formName: "测试融合兽",
    lineId: "test_line_fusion",
    subtypeId: "test_fusion_alpha_beta",
    growthSpeciesProfileId: TARGET_GROWTH_PROFILE_ID,
    riding: {rideable: false},
    baseStats: {maxHp: 88, attack: 22, defense: 18, quick: 17},
  });
  const growthProfiles = GENE_PROFILES.map((profile) => ({
    profileId: profile.growthProfileId,
    formId: profile.formId,
  }));
  growthProfiles.push({
    profileId: TARGET_GROWTH_PROFILE_ID,
    formId: TARGET_FORM_ID,
  });
  const specialActiveSkillIds = Array.from(new Set(
    GENE_PROFILES.map((profile) => profile.specialActiveSkillId),
  ));
  const passiveSkillIds = Array.from(new Set(
    GENE_PROFILES.map((profile) => profile.passiveSkillId),
  ));
  return {
    document: {
      schemaVersion: 1,
      catalogId: "pet_fusion_recipes_v1",
      runtimeEnabled: false,
      disabledMessage: "测试目录保持关闭。",
      rules: {
        roleIds: ["core", "resonance_one", "resonance_two"],
        requiredGrowthModelVersion: "pet_growth_authority_v1",
        requiredRebirthCount: 1,
        minimumLevel: 131,
        maximumLevel: 140,
        baseActiveSkillIds: ["pet_attack", "pet_defend"],
        specialActiveInheritanceChance: 0.5,
        passiveSourceWeights: {
          core: 0.4,
          resonance_one: 0.3,
          resonance_two: 0.3,
        },
        resultPassiveSkillCount: 1,
        materialNumericInheritance: false,
        resultRideable: false,
      },
      geneProfiles: GENE_PROFILES.map((profile) => ({...profile})),
      recipes: [{
        recipeId: RECIPE_ID,
        targetFormId: TARGET_FORM_ID,
        targetGrowthProfileId: TARGET_GROWTH_PROFILE_ID,
        roleGeneRules: {
          core: {
            allowedLineageIds: ["test_line_alpha"],
            allowedGeneProfileIds: [GENE_CORE_A, GENE_CORE_B],
          },
          resonance_one: {
            allowedLineageIds: ["test_line_beta"],
            allowedGeneProfileIds: [GENE_RESONANCE_ONE],
          },
          resonance_two: {
            allowedLineageIds: ["*"],
            allowedGeneProfileIds: ["*"],
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
          status: "test_only",
          replacementPath: "test/assets/pets/test_fusion_alpha_beta/",
        },
      }],
    },
    templatesDocument: {schemaVersion: 1, forms},
    growthProfilesDocument: {schemaVersion: 1, profiles: growthProfiles},
    actionsDocument: {
      schemaVersion: 1,
      actions: [
        {id: "pet_attack", owner: "pet_skill"},
        {id: "pet_defend", owner: "pet_skill"},
        {id: "pet_focus_bite", owner: "pet_skill"},
        {id: "pet_sleep_powder", owner: "pet_skill"},
        ...specialActiveSkillIds.map((id) => ({id, owner: "pet_skill"})),
      ],
    },
    passivesDocument: {
      schemaVersion: 1,
      passives: passiveSkillIds.map((id) => ({id})),
    },
    skillTrainingDocument: {
      schemaVersion: 1,
      trainers: [{
        trainerId: "test_training",
        skillIds: ["pet_focus_bite", "pet_sleep_powder"],
      }],
      skills: [
        {skillId: "pet_focus_bite", cost: 10},
        {skillId: "pet_sleep_powder", cost: 10},
      ],
    },
    paidResetDocument: {
      schemaVersion: 2,
      policyId: "pet_paid_reset_policy_v2",
      formPolicies: [{
        formId: TARGET_FORM_ID,
        acquisitionTier: "fusion",
        resetAllowed: false,
        ineligibleReason: "terminal_fusion",
      }],
    },
  };
}

function createFusionMaterials(options = {}) {
  const catalog = options.catalog || createTestFusionCatalog();
  const growthCatalog = options.growthCatalog || createTestFusionGrowthCatalog();
  const geneIds = {
    core: String(options.coreGeneProfileId || GENE_CORE_A),
    resonance_one: String(options.resonanceOneGeneProfileId || GENE_RESONANCE_ONE),
    resonance_two: String(
      options.resonanceTwoGeneProfileId || GENE_RESONANCE_TWO_GAMMA,
    ),
  };
  return Object.fromEntries(Object.entries(geneIds).map(([roleId, geneProfileId], index) => {
    const geneProfile = catalog.geneProfilesById[geneProfileId];
    if (!geneProfile) throw new Error(`unknown fixture gene profile ${geneProfileId}`);
    return [roleId, createFusionMaterial(geneProfile, {
      growthCatalog,
      instanceId: `test_fusion_material_${roleId}`,
      privateSeedByte: Number(
        (
          options.privateSeedBytesByRole
          && options.privateSeedBytesByRole[roleId]
        ) ?? 0x31 + index,
      ),
      ...(options.overridesByRole && options.overridesByRole[roleId] || {}),
    })];
  }));
}

function createFusionMaterial(geneProfile, options = {}) {
  const instanceId = String(options.instanceId || `test_material_${geneProfile.geneProfileId}`);
  const level = options.level === undefined ? 136 : options.level;
  const privateSeedByte = Number(options.privateSeedByte ?? 0x41);
  const privateSeed = `bps1_${Buffer.alloc(32, privateSeedByte).toString("base64url")}`;
  const growthCatalog = options.growthCatalog || createTestFusionGrowthCatalog();
  const growthProfile = growthCatalog.requireProfileById(geneProfile.growthProfileId);
  const growthCycle = createPetRebirthGrowthCycle({growthCatalog});
  const source = {
    schemaVersion: 1,
    instanceId,
    petId: instanceId,
    formId: geneProfile.formId,
    templateId: geneProfile.formId,
    speciesId: geneProfile.formId,
    lineId: geneProfile.lineageId,
    lineName: geneProfile.lineageId,
    subtypeId: `${geneProfile.lineageId}_ordinary`,
    subtypeName: `${geneProfile.lineageId}_ordinary`,
    formName: geneProfile.formId,
    name: geneProfile.formId,
    state: String(options.state || "standby"),
    growthSpeciesProfileId: geneProfile.growthProfileId,
    level: 1,
    exp: 0,
    nextExp: 100,
    hp: 1,
    maxHp: 1,
    attack: 1,
    defense: 1,
    quick: 1,
    elements: {earth: 4, water: 2, fire: 2, wind: 2},
    activeSkillIds: [
      "pet_attack",
      "pet_defend",
      "pet_focus_bite",
    ],
    petSkillSlots: [
      "pet_focus_bite",
      "pet_attack",
      "pet_defend",
      "",
      "",
      "",
      "",
    ],
    passiveSkillIds: ["material_runtime_passive_noise"],
    learnedSkillIds: ["pet_focus_bite"],
    inheritedSkillIds: ["pet_old_inherited_noise"],
    forgottenSkillIds: [geneProfile.specialActiveSkillId],
    binding: String(options.binding || "unbound"),
    bound: options.bound === true,
    bindingLocked: options.bindingLocked === true,
    locked: options.locked === true,
  };
  let pet = initializePetGrowth(source, growthProfile, {
    privateSeed,
    cultivation: {
      schemaVersion: 1,
      initialBonus: {maxHp: 0, attack: 0, defense: 0, quick: 0},
      growthBonus: {maxHp: 0, attack: 0, defense: 0, quick: 0},
    },
  }).pet;
  pet = settlePetGrowthToLevel(pet, growthProfile, 140).pet;
  const growthBonus = {
    maxHp: [0.4, 0.5, 0.6][privateSeedByte % 3],
    attack: [0.1, 0.2][privateSeedByte % 2],
    defense: 0.1,
    quick: 0.1,
  };
  const rebirthEvent = {
    schemaVersion: 1,
    mode: "rebirth",
    timestamp: 1700000000 + privateSeedByte,
    petInstanceId: instanceId,
    petName: geneProfile.formId,
    formId: geneProfile.formId,
    beforeLevel: 140,
    afterLevel: 1,
    beforeRebirthCount: 0,
    afterRebirthCount: 1,
    beforeEnhanceLevel: 9,
    afterEnhanceLevel: 9,
    visibleGrowthBonus: {...growthBonus},
    summary: "0转 -> 1转，Lv140 -> Lv1",
    message: "一转完成",
  };
  pet = growthCycle.restart(pet, {
    schemaVersion: 1,
    rebirthCount: 1,
    enhanceLevel: 9,
    rebirthGrowthBonus: {...growthBonus},
    history: [structuredClone(rebirthEvent)],
    lastPreview: {},
    lastResult: structuredClone(rebirthEvent),
  }).pet;
  const supportedLevel = Math.max(1, Math.min(140, Number(level)));
  pet = settlePetGrowthToLevel(pet, growthProfile, supportedLevel).pet;
  if (level !== supportedLevel) {
    pet.level = level;
    pet.petGrowth.settledLevel = level;
    pet.petGrowth.public.level = level;
  }
  pet.exp = 0;
  pet.nextExp = Math.max(1, level * 100);
  return {
    ...pet,
    ...(options.overrides || {}),
  };
}

function seedFusionAccount(service, options = {}) {
  const catalog = options.catalog || createEnabledTestFusionCatalog();
  const registered = service.register({
    username: String(options.username || "fusionfixture"),
    password: "test1234",
    displayName: String(options.displayName || "融合事务猎人"),
  });
  if (!registered.ok) {
    throw new Error(`fusion fixture registration failed: ${registered.code}`);
  }
  const loaded = service.getProfile(registered.session.token);
  if (!loaded.ok) {
    throw new Error(`fusion fixture profile load failed: ${loaded.code}`);
  }
  const materials = createFusionMaterials({
    catalog,
    resonanceTwoGeneProfileId: options.resonanceTwoGeneProfileId,
    privateSeedBytesByRole: options.privateSeedBytesByRole,
    overridesByRole: {
      core: {
        state: "battle",
        binding: String(options.coreBinding || "unbound"),
        bound: String(options.coreBinding || "unbound") === "bound",
        ...(options.overridesByRole && options.overridesByRole.core || {}),
      },
      resonance_one: {
        state: "standby",
        ...(options.overridesByRole && options.overridesByRole.resonance_one || {}),
      },
      resonance_two: {
        state: "storage",
        ...(options.overridesByRole && options.overridesByRole.resonance_two || {}),
      },
    },
  });
  const profile = structuredClone(loaded.profile);
  profile.petInstances = PET_FUSION_ROLE_IDS.map((roleId) => materials[roleId]);
  profile.activePetInstanceId = materials.core.instanceId;
  profile.ridePetInstanceId = "";
  profile.nextPetInstanceSerial = 100;
  const saved = service.saveProfile(registered.session.token, {
    expectedRevision: loaded.profileSummary.profileRevision,
    profile,
  });
  if (!saved.ok) {
    throw new Error(`fusion fixture profile seed failed: ${saved.code}`);
  }
  return {
    ...registered,
    catalog,
    materials,
    profileRevision: saved.profileSummary.profileRevision,
  };
}

function fixedFusionRandomContext(byte = 0x55) {
  return createPetFusionRandomContext(
    `bpfr1_${Buffer.alloc(32, byte).toString("base64url")}`,
  );
}

module.exports = {
  GENE_CORE_A,
  GENE_CORE_B,
  GENE_PROFILES,
  GENE_RESONANCE_ONE,
  GENE_RESONANCE_TWO_DELTA,
  GENE_RESONANCE_TWO_GAMMA,
  RECIPE_ID,
  TARGET_FORM_ID,
  TARGET_GROWTH_PROFILE_ID,
  createEnabledTestFusionCatalog,
  createFusionMaterial,
  createFusionMaterials,
  createTestFusionGrowthCatalog,
  createTestFusionCatalog,
  fixedFusionRandomContext,
  fusionTargetTemplate,
  fusionTargetTemplateForFormId,
  seedFusionAccount,
  testFusionDocuments,
};
