"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const equipmentTransferVectors = require("../../../tools/fixtures/equipment_transfer_public_v1_vectors.json");
const {loadBattleEquipmentCatalog} = require("../src/auth/battle-equipment-rules");
const {equipmentTransferStateFingerprint} = require("../src/auth/equipment-transfer-envelope");

const equipmentCatalog = loadBattleEquipmentCatalog();

const {
  GROWTH_MODEL_INVALID_AUTHORITY_V1,
  GROWTH_MODEL_LEGACY_INDIVIDUAL,
  GROWTH_MODEL_LEGACY_SPECIES_LINEAR,
  publicGrowthObservation,
  publicPet,
  publicProfile,
} = require("../src/auth/profile-visibility");

const PRIVATE_FIELD_KEYS = new Set([
  "continuousStats",
  "growthBonus",
  "growthPrivate",
  "growthRecord",
  "growthSpeciesRoll",
  "growthSpeciesSampleNo",
  "growthSpeciesSeed",
  "helperGrowthWeights",
  "individualQualityLabel",
  "individualQualityScore",
  "individualSeed",
  "individualVariance",
  "initialBonus",
  "innateGrowthBonus",
  "internalGrowthBonus",
  "petGrowthPrivate",
  "privateRoll",
  "privateSeed",
  "qualityRoll",
  "rebirthBonusInternalPower",
  "rebirthRollSeed",
  "settledContinuousStats",
]);

function isCultivationSeedOrRollKey(key) {
  return key === "seed"
    || key === "roll"
    || /(?:Seed|Roll)$/.test(key)
    || /(?:_seed|_roll)$/i.test(key);
}

function privatePaths(value, prefix = "", parentKey = "", insidePetCultivation = false) {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => privatePaths(
      entry,
      `${prefix}[${index}]`,
      parentKey,
      insidePetCultivation,
    ));
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  const result = [];
  for (const [key, nested] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (
      PRIVATE_FIELD_KEYS.has(key)
      || (parentKey === "petGrowth" && key === "private")
      || (insidePetCultivation && isCultivationSeedOrRollKey(key))
    ) {
      result.push(path);
      continue;
    }
    result.push(...privatePaths(
      nested,
      path,
      key,
      insidePetCultivation || key === "petCultivation" || key === "lastCultivationResult",
    ));
  }
  return result;
}

function fullObservation() {
  return {
    schemaVersion: 1,
    profileId: "blue_man_dragon_v1",
    level: 20,
    observedLevels: 19,
    stage: 0,
    stageLabel: "0转成长",
    enabled: true,
    hasRecord: true,
    statAverages: {maxHp: 10.2, attack: 2.3, defense: 1.7, quick: 1.4, luck: 999},
    statPercentiles: {maxHp: 91.2, attack: 96.4, defense: 72.1, quick: 65.5, hiddenMean: 3.14},
    statGrades: {maxHp: "A", attack: "S", defense: "B", quick: "B", privateSeed: "nested-secret"},
    powerGrowthPerLevel: 16.875,
    powerPercentile: 94.7,
    overallGrade: "A",
    exactLv140Stats: {attack: 612},
    privateSeed: "observation-secret",
    privateRoll: {innateGrowthBonus: {attack: 0.991}},
  };
}

function petFixture(instanceId) {
  return {
    instanceId,
    petId: instanceId,
    templateId: "blue_man_dragon_water10",
    formId: "blue_man_dragon_water10",
    speciesId: "blue_man_dragon_water10",
    lineId: "man_dragon",
    lineName: "人龙系",
    subtypeId: "blue_man_dragon",
    subtypeName: "蓝人龙",
    formName: "蓝人龙",
    name: "蓝人龙",
    state: "standby",
    level: 20,
    exp: 12,
    nextExp: 2200,
    hp: 180,
    maxHp: 200,
    attack: 91,
    defense: 68,
    quick: 74,
    elements: {water: 10, hiddenMean: 9.9},
    activeSkillIds: ["pet_attack", "pet_water_bite"],
    petSkillSlots: ["pet_attack", "pet_water_bite", "", "", "", "", ""],
    passiveSkillIds: ["pet_calm_skin"],
    forgottenSkillIds: ["pet_old_bite"],
    capturedSerial: 17,
    capturedBattleRoomId: "room_public_17",
    capturedBattleActorId: "enemy_2",
    captureToolId: "capture_rope_basic",
    captureStatusIds: ["sleep"],
    isNew: true,
    locked: true,
    binding: "bound",
    tameEligible: false,
    growthTierId: "blue_man_dragon_v1",
    growthTierLabel: "蓝人龙成长档",
    growthModelVersion: "pet_growth_authority_v1",
    growthSpeciesProfileId: "blue_man_dragon_v1",
    growthAuthority: {
      schemaVersion: 1,
      source: "server",
      modelVersion: "legacy_species_linear_v0",
      settledLevel: 20,
      seed: "DO_NOT_EXPOSE_AUTHORITY_SEED",
      roll: {attack: 0.9},
      hiddenMean: 9.9,
    },
    growthSpeciesLevel1Stats: {maxHp: 71, attack: 31, defense: 29, quick: 35, hiddenMean: 9.9},
    initialStats: {maxHp: 71, attack: 31, defense: 29, quick: 35},
    growthObservation: fullObservation(),
    individualSeed: `${instanceId}:legacy-seed`,
    individualVariance: {
      qualityRoll: 9911,
      initialBonus: {attack: 2},
      growthBonus: {attack: 0.8},
    },
    individualQualityScore: 9911,
    individualQualityLabel: "极品",
    growthSpeciesSeed: `${instanceId}:species-seed`,
    growthSpeciesSampleNo: 48,
    growthSpeciesRoll: {
      initialBonus: {attack: 2},
      growthBonus: {attack: 0.8},
    },
    growthRecord: {
      growthRates: {attack: 2.0},
      individualVariance: {growthBonus: {attack: 0.8}},
      finalStats: {attack: 91},
    },
    petGrowth: {
      schemaVersion: 1,
      modelVersion: "pet_growth_authority_v1",
      profileId: "blue_man_dragon_v1",
      settledLevel: 20,
      public: {
        schemaVersion: 1,
        growthModelVersion: "pet_growth_authority_v1",
        growthSpeciesProfileId: "blue_man_dragon_v1",
        level: 20,
        levelOneFourV: {maxHp: 71, attack: 31, defense: 29, quick: 35},
        stats: {maxHp: 200, attack: 91, defense: 68, quick: 74},
        hiddenMean: 9.9,
        exactLv140Stats: {attack: 612},
      },
      futurePrediction: {attack: 612},
      private: {
        schemaVersion: 1,
        privateSeed: `bps1_${"A".repeat(43)}`,
        privateRoll: {
          modelVersion: "pet_growth_authority_v1",
          profileId: "blue_man_dragon_v1",
          initialBonus: {maxHp: 1, attack: 2, defense: 0, quick: -1},
          innateGrowthBonus: {maxHp: 0.4, attack: 0.744, defense: 0.1, quick: -0.02},
        },
        cultivation: {
          schemaVersion: 1,
          initialBonus: {maxHp: 0, attack: 0, defense: 0, quick: 0},
          growthBonus: {maxHp: 0, attack: 0, defense: 0, quick: 0},
        },
        continuousStats: {maxHp: 199.8, attack: 90.718421, defense: 67.9, quick: 73.8},
      },
    },
    petCultivation: {
      schemaVersion: 1,
      rebirthCount: 1,
      enhanceLevel: 2,
      rebirthGrowthBonus: {maxHp: 1.2, attack: 0.4, defense: 0.2, quick: 0.1},
      history: [{
        schemaVersion: 1,
        mode: "rebirth",
        summary: "0转 -> 1转，Lv140 -> Lv1",
        visibleGrowthBonus: {maxHp: 1.2, attack: 0.4, defense: 0.2, quick: 0.1},
        rebirthBonusPercentile: 91.2,
        rebirthBonusGrade: "A",
        individualSeed: `${instanceId}:history-seed`,
        rebirthRollSeed: `${instanceId}:rebirth-seed`,
        helperGrowthWeights: {attack: 1.7},
        rebirthBonusInternalPower: 0.475,
        seed: `${instanceId}:generic-seed`,
        roll: {attack: 0.8},
        audit: {
          growthSeed: `${instanceId}:nested-growth-seed`,
          growthRoll: {quick: 0.2},
          visibleLabel: "转生结果已结算",
        },
      }],
      seedValue: "DO_NOT_EXPOSE_CULTIVATION_SEED",
      qualityEntropy: "DO_NOT_EXPOSE_CULTIVATION_ENTROPY",
      lastPreview: {
        mode: "rebirth",
        message: "DO_NOT_RETURN_STALE_PREVIEW",
        nextCultivation: {privateSeed: "DO_NOT_EXPOSE_PREVIEW_SEED"},
      },
    },
    lastCultivationResult: {
      summary: "最近一次转生完成",
      seed: `${instanceId}:last-result-seed`,
      roll: {maxHp: 0.4},
    },
    petRebirthHelper: {
      schemaVersion: 1,
      stage: 1,
      stonePoints: {maxHp: 3, attack: 4, defense: 2, quick: 1, hiddenMean: 9.9},
      helperSeed: "DO_NOT_EXPOSE_HELPER_SEED",
    },
    combatPower: 433,
    combatPowerBreakdown: {
      formula: "round(maxHp / 4 + attack + defense + agility)",
      maxHp: 200,
      maxHpContribution: 50,
      attack: 91,
      attackContribution: 91,
      defense: 68,
      defenseContribution: 68,
      quick: 74,
      agility: 74,
      quickContribution: 74,
      total: 283,
      privateFormulaSeed: "DO_NOT_EXPOSE_POWER_SEED",
    },
    futurePrivateGrowthState: "DO_NOT_EXPOSE_UNKNOWN_PET_FIELD",
  };
}

function canonicalPetFixture(instanceId) {
  const pet = petFixture(instanceId);
  for (const key of PRIVATE_FIELD_KEYS) {
    delete pet[key];
  }
  delete pet.growthAuthority;
  delete pet.petGrowth.futurePrediction;
  delete pet.petGrowth.public.hiddenMean;
  delete pet.petGrowth.public.exactLv140Stats;
  delete pet.growthSpeciesLevel1Stats.hiddenMean;
  pet.petGrowth.private.cultivation.growthBonus = structuredClone(
    pet.petCultivation.rebirthGrowthBonus,
  );
  return pet;
}

test("publicGrowthObservation keeps only player evidence fields and four stat axes", () => {
  const source = fullObservation();
  const before = structuredClone(source);

  const actual = publicGrowthObservation(source);

  assert.deepEqual(actual, {
    schemaVersion: 1,
    profileId: "blue_man_dragon_v1",
    level: 20,
    observedLevels: 19,
    stage: 0,
    stageLabel: "0转成长",
    enabled: true,
    hasRecord: true,
    statAverages: {maxHp: 10.2, attack: 2.3, defense: 1.7, quick: 1.4},
    statPercentiles: {maxHp: 91.2, attack: 96.4, defense: 72.1, quick: 65.5},
    statGrades: {maxHp: "A", attack: "S", defense: "B", quick: "B"},
    powerGrowthPerLevel: 16.875,
    powerPercentile: 94.7,
    overallGrade: "A",
  });
  assert.deepEqual(source, before);
  assert.deepEqual(privatePaths(actual), []);

  const malformed = fullObservation();
  malformed.powerPercentile = {secret: 99.9};
  malformed.overallGrade = {secret: "S"};
  malformed.statAverages.attack = {privateSeed: "hidden"};
  const malformedPublic = publicGrowthObservation(malformed);
  assert.equal(malformedPublic.powerPercentile, undefined);
  assert.equal(malformedPublic.overallGrade, undefined);
  assert.equal(malformedPublic.statAverages.attack, undefined);
});

test("publicPet deep-clones visible pet facts and removes private growth state at every depth", () => {
  const source = canonicalPetFixture("pet_primary");
  const before = structuredClone(source);

  const actual = publicPet(source);

  assert.equal(actual.instanceId, source.instanceId);
  assert.equal(actual.name, source.name);
  assert.equal(actual.level, source.level);
  assert.deepEqual(actual.elements, {water: 10});
  assert.deepEqual(actual.activeSkillIds, source.activeSkillIds);
  assert.deepEqual(actual.petSkillSlots, source.petSkillSlots);
  assert.deepEqual(actual.forgottenSkillIds, source.forgottenSkillIds);
  assert.equal(actual.binding, "bound");
  assert.equal(actual.capturedSerial, 17);
  assert.deepEqual(actual.growthAuthority, {
    schemaVersion: 1,
    source: "server",
    modelVersion: "pet_growth_authority_v1",
    settledLevel: 20,
  });
  assert.deepEqual(actual.growthSpeciesLevel1Stats, {maxHp: 71, attack: 31, defense: 29, quick: 35});
  assert.deepEqual(actual.initialStats, source.initialStats);
  assert.equal(actual.growthObservation.overallGrade, "A");
  assert.equal(actual.growthObservation.exactLv140Stats, undefined);
  assert.deepEqual(actual.petGrowth, {
    schemaVersion: 1,
    modelVersion: "pet_growth_authority_v1",
    profileId: "blue_man_dragon_v1",
    settledLevel: 20,
    public: {
      schemaVersion: 1,
      growthModelVersion: "pet_growth_authority_v1",
      growthSpeciesProfileId: "blue_man_dragon_v1",
      level: 20,
      levelOneFourV: {maxHp: 71, attack: 31, defense: 29, quick: 35},
      stats: {maxHp: 200, attack: 91, defense: 68, quick: 74},
    },
  });
  assert.deepEqual(actual.petCultivation.history[0].visibleGrowthBonus, {
    maxHp: 1.2,
    attack: 0.4,
    defense: 0.2,
    quick: 0.1,
  });
  assert.equal(actual.petCultivation.lastPreview, undefined);
  assert.equal(actual.petCultivation.history[0].summary, "0转 -> 1转，Lv140 -> Lv1");
  assert.equal(actual.petCultivation.history[0].audit, undefined);
  assert.deepEqual(actual.lastCultivationResult, {summary: "最近一次转生完成"});
  assert.deepEqual(actual.petRebirthHelper, {
    schemaVersion: 1,
    stage: 1,
    stonePoints: {maxHp: 3, attack: 4, defense: 2, quick: 1},
  });
  assert.equal(actual.combatPower, 433);
  assert.equal(actual.combatPowerBreakdown.total, 283);
  assert.equal(actual.combatPowerBreakdown.privateFormulaSeed, undefined);
  assert.deepEqual(privatePaths(actual), []);
  assert.equal(JSON.stringify(actual).includes("DO_NOT_EXPOSE"), false);
  assert.equal(actual.futurePrivateGrowthState, undefined);
  assert.deepEqual(source, before);

  actual.elements.water = 0;
  actual.activeSkillIds.push("forged_skill");
  actual.petCultivation.history[0].visibleGrowthBonus.attack = 999;
  assert.equal(source.elements.water, 10);
  assert.deepEqual(source.activeSkillIds, ["pet_attack", "pet_water_bite"]);
  assert.equal(source.petCultivation.history[0].visibleGrowthBonus.attack, 0.4);

  const replayed = publicPet(actual);
  assert.deepEqual(replayed, actual);

  const duplicatePrivate = petFixture("pet_duplicate_private");
  const duplicatePrivatePublic = publicPet(duplicatePrivate);
  assert.equal(
    duplicatePrivatePublic.growthAuthority.modelVersion,
    GROWTH_MODEL_INVALID_AUTHORITY_V1,
  );
  assert.equal(duplicatePrivatePublic.petGrowth, undefined);
  assert.deepEqual(privatePaths(duplicatePrivatePublic), []);

  const speciesLegacy = canonicalPetFixture("pet_species_legacy");
  delete speciesLegacy.petGrowth;
  delete speciesLegacy.growthModelVersion;
  assert.equal(publicPet(speciesLegacy).growthAuthority.modelVersion, GROWTH_MODEL_LEGACY_SPECIES_LINEAR);
  const missingEnvelopeV1 = canonicalPetFixture("pet_missing_envelope_v1");
  delete missingEnvelopeV1.petGrowth;
  assert.equal(publicPet(missingEnvelopeV1).growthAuthority.modelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  const missingEnvelopeModelV1 = canonicalPetFixture("pet_missing_envelope_model_v1");
  delete missingEnvelopeModelV1.petGrowth.modelVersion;
  assert.equal(
    publicPet(missingEnvelopeModelV1).growthAuthority.modelVersion,
    GROWTH_MODEL_INVALID_AUTHORITY_V1,
  );
  const missingBothModelFieldsV1 = canonicalPetFixture("pet_missing_both_model_fields_v1");
  delete missingBothModelFieldsV1.petGrowth.modelVersion;
  delete missingBothModelFieldsV1.growthModelVersion;
  assert.equal(
    publicPet(missingBothModelFieldsV1).growthAuthority.modelVersion,
    GROWTH_MODEL_INVALID_AUTHORITY_V1,
  );
  const corruptRootModelV1 = canonicalPetFixture("pet_corrupt_root_model_v1");
  delete corruptRootModelV1.petGrowth;
  corruptRootModelV1.growthModelVersion = "pet_growth_authority_v1 ";
  assert.equal(publicPet(corruptRootModelV1).growthAuthority.modelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  const numericRootModelV1 = canonicalPetFixture("pet_numeric_root_model_v1");
  delete numericRootModelV1.petGrowth;
  numericRootModelV1.growthModelVersion = 1;
  assert.equal(publicPet(numericRootModelV1).growthAuthority.modelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  const nonObjectEnvelopeV1 = canonicalPetFixture("pet_non_object_envelope_v1");
  nonObjectEnvelopeV1.petGrowth = "bad";
  delete nonObjectEnvelopeV1.growthModelVersion;
  assert.equal(publicPet(nonObjectEnvelopeV1).growthAuthority.modelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  const malformedV1 = canonicalPetFixture("pet_malformed_v1");
  delete malformedV1.petGrowth.private.continuousStats.quick;
  const malformedPublic = publicPet(malformedV1);
  assert.equal(malformedPublic.growthAuthority.modelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  assert.equal(malformedPublic.growthModelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  assert.equal(malformedPublic.petGrowth, undefined);
  assert.deepEqual(publicPet(malformedPublic), malformedPublic);
  const wrongProfileV1 = canonicalPetFixture("pet_wrong_profile_v1");
  wrongProfileV1.petGrowth.private.privateRoll.profileId = "wrong_profile";
  assert.equal(publicPet(wrongProfileV1).growthAuthority.modelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  const wrongPublicProfileV1 = canonicalPetFixture("pet_wrong_public_profile_v1");
  wrongPublicProfileV1.petGrowth.public.growthSpeciesProfileId = "wrong_profile";
  assert.equal(publicPet(wrongPublicProfileV1).growthAuthority.modelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  const missingCultivationV1 = canonicalPetFixture("pet_missing_cultivation_v1");
  delete missingCultivationV1.petGrowth.private.cultivation;
  assert.equal(publicPet(missingCultivationV1).growthAuthority.modelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  const malformedCultivationV1 = canonicalPetFixture("pet_malformed_cultivation_v1");
  malformedCultivationV1.petGrowth.private.cultivation.growthBonus.attack = "0";
  assert.equal(publicPet(malformedCultivationV1).growthAuthority.modelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  const wrongEnvelopeProfileV1 = canonicalPetFixture("pet_wrong_envelope_profile_v1");
  wrongEnvelopeProfileV1.petGrowth.profileId = "wrong_profile";
  assert.equal(publicPet(wrongEnvelopeProfileV1).growthAuthority.modelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  const extraPrivateV1 = canonicalPetFixture("pet_extra_private_v1");
  extraPrivateV1.petGrowth.private.secretCopy = `bps1_${"B".repeat(43)}`;
  assert.equal(publicPet(extraPrivateV1).growthAuthority.modelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  const extraGrowthV1 = canonicalPetFixture("pet_extra_growth_v1");
  extraGrowthV1.petGrowth.futurePrediction = {attack: 999};
  assert.equal(publicPet(extraGrowthV1).growthAuthority.modelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  const overPreciseCultivationV1 = canonicalPetFixture("pet_over_precise_cultivation_v1");
  overPreciseCultivationV1.petGrowth.private.cultivation.growthBonus.attack = 0.0000001;
  overPreciseCultivationV1.petCultivation.rebirthGrowthBonus.attack = 0.0000001;
  assert.equal(
    publicPet(overPreciseCultivationV1).growthAuthority.modelVersion,
    GROWTH_MODEL_INVALID_AUTHORITY_V1,
  );
  const persistedMarkerV1 = canonicalPetFixture("pet_persisted_marker_v1");
  persistedMarkerV1.growthAuthority = {
    schemaVersion: 1,
    source: "server",
    modelVersion: "pet_growth_authority_v1",
    settledLevel: 20,
  };
  assert.equal(publicPet(persistedMarkerV1).growthAuthority.modelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  const corruptCultivationRecordV1 = canonicalPetFixture("pet_corrupt_cultivation_record_v1");
  corruptCultivationRecordV1.petCultivation = "corrupt";
  assert.equal(
    publicPet(corruptCultivationRecordV1).growthAuthority.modelVersion,
    GROWTH_MODEL_INVALID_AUTHORITY_V1,
  );
  const conflictingRootModelV1 = canonicalPetFixture("pet_conflicting_root_model_v1");
  conflictingRootModelV1.growthModelVersion = GROWTH_MODEL_LEGACY_INDIVIDUAL;
  assert.equal(
    publicPet(conflictingRootModelV1).growthAuthority.modelVersion,
    GROWTH_MODEL_INVALID_AUTHORITY_V1,
  );
  const paddedProfileIdV1 = canonicalPetFixture("pet_padded_profile_id_v1");
  paddedProfileIdV1.growthSpeciesProfileId = " blue_man_dragon_v1 ";
  assert.equal(publicPet(paddedProfileIdV1).growthAuthority.modelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  const numericStringStatV1 = canonicalPetFixture("pet_numeric_string_stat_v1");
  numericStringStatV1.attack = "91";
  assert.equal(publicPet(numericStringStatV1).growthAuthority.modelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  const invalidHpV1 = canonicalPetFixture("pet_invalid_hp_v1");
  invalidHpV1.hp = invalidHpV1.maxHp + 1;
  assert.equal(publicPet(invalidHpV1).growthAuthority.modelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  const fractionalLevelV1 = canonicalPetFixture("pet_fractional_level_v1");
  fractionalLevelV1.level = 20.5;
  fractionalLevelV1.petGrowth.settledLevel = 20.5;
  assert.equal(publicPet(fractionalLevelV1).growthAuthority.modelVersion, GROWTH_MODEL_INVALID_AUTHORITY_V1);
  const individualLegacy = canonicalPetFixture("pet_individual_legacy");
  delete individualLegacy.petGrowth;
  delete individualLegacy.growthSpeciesProfileId;
  delete individualLegacy.growthModelVersion;
  assert.equal(publicPet(individualLegacy).growthAuthority.modelVersion, GROWTH_MODEL_LEGACY_INDIVIDUAL);

  const aliasLegacy = publicPet({
    id: "pet_alias_legacy",
    speciesId: "wuli_normal_orange_fire10",
    speciesName: "橙乌力",
    battleState: "battle",
    level: "7",
    exp: "12",
    hp: "61",
    maxHp: "73",
    attack: "18",
    defense: "11",
    quick: "15",
    rebirthHelper: {
      schemaVersion: "1",
      stage: "1",
      stonePoints: {maxHp: "3", attack: "4", defense: "2", quick: "1"},
    },
  });
  assert.equal(aliasLegacy.instanceId, "pet_alias_legacy");
  assert.equal(aliasLegacy.petId, "pet_alias_legacy");
  assert.equal(aliasLegacy.formId, "wuli_normal_orange_fire10");
  assert.equal(aliasLegacy.templateId, "wuli_normal_orange_fire10");
  assert.equal(aliasLegacy.name, "橙乌力");
  assert.equal(aliasLegacy.state, "battle");
  assert.equal(aliasLegacy.level, 7);
  assert.equal(aliasLegacy.maxHp, 73);
  assert.deepEqual(aliasLegacy.petRebirthHelper, {
    schemaVersion: 1,
    stage: 1,
    stonePoints: {maxHp: 3, attack: 4, defense: 2, quick: 1},
  });
});

test("publicProfile sanitizes current, legacy, dropped, and future nested pet containers", () => {
  const source = {
    schemaVersion: 1,
    player: {name: "成长边界测试", level: 42},
    stoneCoins: 123456,
    backpackSlots: [{itemId: "item_meat_small", count: 3}],
    petInstances: [
      petFixture("pet_current"),
      {instanceId: "pet_partial", formId: "future_form", futureSecret: "DO_NOT_EXPOSE_PARTIAL_PET"},
    ],
    pets: [petFixture("pet_legacy")],
    trainingPartners: [{partnerId: "partner_1", pet: petFixture("pet_partner_snapshot")}],
    groundPetDrops: [{
      dropId: "ground_pet_1",
      mapId: "village_south",
      cell: [12, 8],
      expiresAtSec: 999999,
      pet: petFixture("pet_drop"),
    }],
    futureFeature: {
      roster: {
        reserve: petFixture("pet_future"),
        partialReserve: {
          instanceId: "pet_future_partial",
          formId: "future_form",
          name: "未来精简宠",
          level: 1,
          hiddenMean: 9.9,
          privateGenome: "DO_NOT_EXPOSE_PARTIAL_FUTURE_PET",
        },
      },
      petGrowth: {
        public: {growthModelVersion: "pet_growth_authority_v1"},
        private: {privateSeed: "future-profile-secret"},
        exactLv140Stats: {attack: 9999},
      },
      unrelatedScorecard: {qualityScore: 91, growthBonus: 3, label: "保留非宠物同名字段"},
    },
  };
  const before = structuredClone(source);

  const actual = publicProfile(source);

  assert.deepEqual(actual.player, source.player);
  assert.equal(actual.stoneCoins, source.stoneCoins);
  assert.deepEqual(actual.backpackSlots, source.backpackSlots);
  assert.equal(actual.petInstances[0].instanceId, "pet_current");
  assert.deepEqual(actual.petInstances[1], {
    instanceId: "pet_partial",
    petId: "pet_partial",
    formId: "future_form",
    templateId: "future_form",
    growthModelVersion: GROWTH_MODEL_LEGACY_INDIVIDUAL,
    growthAuthority: {
      schemaVersion: 1,
      source: "server",
      modelVersion: GROWTH_MODEL_LEGACY_INDIVIDUAL,
      settledLevel: 1,
    },
  });
  assert.equal(actual.pets[0].instanceId, "pet_legacy");
  assert.equal(actual.trainingPartners[0].pet.instanceId, "pet_partner_snapshot");
  assert.equal(actual.groundPetDrops[0].pet.instanceId, "pet_drop");
  assert.equal(actual.futureFeature.roster.reserve.instanceId, "pet_future");
  assert.deepEqual(actual.futureFeature.roster.partialReserve, {
    instanceId: "pet_future_partial",
    petId: "pet_future_partial",
    formId: "future_form",
    templateId: "future_form",
    name: "未来精简宠",
    level: 1,
    growthModelVersion: GROWTH_MODEL_LEGACY_INDIVIDUAL,
    growthAuthority: {
      schemaVersion: 1,
      source: "server",
      modelVersion: GROWTH_MODEL_LEGACY_INDIVIDUAL,
      settledLevel: 1,
    },
  });
  assert.deepEqual(actual.futureFeature.petGrowth, {
    public: {growthModelVersion: "pet_growth_authority_v1"},
  });
  assert.deepEqual(actual.futureFeature.unrelatedScorecard, source.futureFeature.unrelatedScorecard);
  for (const pet of [
    ...actual.petInstances,
    ...actual.pets,
    actual.trainingPartners[0].pet,
    actual.groundPetDrops[0].pet,
    actual.futureFeature.roster.reserve,
    actual.futureFeature.roster.partialReserve,
  ]) {
    assert.deepEqual(privatePaths(pet), []);
  }
  assert.deepEqual(publicProfile(actual), actual);
  assert.deepEqual(source, before);
});

test("public visibility helpers fail closed for non-object roots", () => {
  assert.deepEqual(publicGrowthObservation(null), {});
  assert.deepEqual(publicGrowthObservation([]), {});
  assert.deepEqual(publicPet("pet"), {});
  assert.deepEqual(publicProfile([]), {});
});

test("public profile projects persisted equipment envelopes and hides transfer provenance", () => {
  const vector = equipmentTransferVectors.vectors[0];
  const internalEnvelope = structuredClone(vector.internalEnvelope);
  const source = {
    schemaVersion: 3,
    equipmentInstances: {
      equip_000500: {
        schemaVersion: 1,
        instanceId: "equip_000500",
        itemId: "weapon_wooden_club",
        location: "backpack",
        slotId: "",
        durability: 18,
        enhancement: {itemId: "weapon_wooden_club", level: 3, history: []},
        wearCounters: {itemId: "weapon_wooden_club", attackCount: 42, hitCount: 0},
        expPillCharge: {},
        source: "mail_claim",
        affixes: [{id: "power", value: 7}],
        transferProvenance: {
          schemaVersion: 1,
          originEnvelopeId: internalEnvelope.envelopeId,
          sourceInstanceId: "equip_private_source",
        },
      },
    },
    bank: {
      schemaVersion: 2,
      slots: [{
        itemId: "weapon_wooden_club",
        count: 1,
        equipmentEnvelopes: [internalEnvelope],
      }],
    },
    futureContainer: {
      equipmentEnvelope: structuredClone(internalEnvelope),
    },
  };
  const before = structuredClone(source);

  const projectionOptions = {equipmentCatalog};
  const projected = publicProfile(source, projectionOptions);

  assert.equal(Object.hasOwn(projected.equipmentInstances.equip_000500, "transferProvenance"), false);
  assert.equal(projected.equipmentInstances.equip_000500.source, "mail_claim");
  assert.deepEqual(projected.bank.slots[0].equipmentEnvelopes[0], vector.expectedPublic);
  assert.deepEqual(projected.futureContainer.equipmentEnvelope, vector.expectedPublic);
  assert.equal(Object.hasOwn(projected.bank.slots[0].equipmentEnvelopes[0], "provenance"), false);
  assert.equal(Object.hasOwn(projected.bank.slots[0].equipmentEnvelopes[0].instanceState, "source"), false);
  assert.equal(Object.hasOwn(projected.bank.slots[0].equipmentEnvelopes[0].instanceState, "transferProvenance"), false);
  assert.deepEqual(publicProfile(projected, projectionOptions), projected);
  assert.deepEqual(source, before);
});

test("public profile fails malformed and future equipment envelopes closed without leaking provenance", () => {
  const vector = equipmentTransferVectors.vectors[0];
  const futureEnvelope = structuredClone(vector.internalEnvelope);
  futureEnvelope.schemaVersion = 2;
  const missingFingerprint = structuredClone(vector.internalEnvelope);
  delete missingFingerprint.stateFingerprint;
  const unknownRoot = structuredClone(vector.internalEnvelope);
  unknownRoot.futureRoot = {privateAudit: "DO_NOT_EXPOSE"};
  const malformedState = structuredClone(vector.internalEnvelope);
  delete malformedState.instanceState;
  const exhaustedWear = structuredClone(vector.internalEnvelope);
  exhaustedWear.instanceState.wearCounters.attackCount = 100;
  exhaustedWear.stateFingerprint = equipmentTransferStateFingerprint(exhaustedWear);
  const source = {
    schemaVersion: 3,
    bank: {
      schemaVersion: 2,
      slots: [{
        itemId: "weapon_wooden_club",
        count: 5,
        equipmentEnvelopes: [futureEnvelope, missingFingerprint, unknownRoot, malformedState, exhaustedWear],
      }],
    },
    futureContainer: {
      equipmentEnvelope: structuredClone(malformedState),
    },
  };
  const before = structuredClone(source);

  const projected = publicProfile(source, {equipmentCatalog});

  assert.deepEqual(projected.bank.slots[0].equipmentEnvelopes, [{}, {}, {}, {}, {}]);
  assert.deepEqual(projected.futureContainer.equipmentEnvelope, {});
  assert.equal(JSON.stringify(projected).includes("equip_000042"), false);
  assert.equal(JSON.stringify(projected).includes("DO_NOT_EXPOSE"), false);
  assert.deepEqual(source, before);
});
