"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  DEFAULT_PRESENTATION_PATH,
  PetGrowthQualityPresentationConfigError,
  createPetGrowthQualityPresentation,
  loadPetGrowthQualityPresentation,
} = require("../src/auth/pet-growth-quality-presentation");
const {
  DEFAULT_POWER_FORMULA_PATH,
  DEFAULT_SPECIES_PROFILE_PATH,
  loadPetObservedGrowthScreening,
} = require("../src/auth/pet-observed-growth-screening");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function blueDragonPet(overrides = {}) {
  return {
    formId: "blue_man_dragon_water10",
    templateId: "blue_man_dragon_water10",
    growthModelVersion: "pet_growth_authority_v1",
    growthSpeciesProfileId: "blue_man_dragon_v1",
    level: 20,
    initialStats: {maxHp: 65, attack: 14, defense: 9, quick: 6},
    growthSpeciesLevel1Stats: {maxHp: 65, attack: 14, defense: 9, quick: 6},
    maxHp: 239,
    attack: 63,
    defense: 28,
    quick: 29,
    ...overrides,
  };
}

test("approved presentation maps D/C/B/A/S to blue/purple/orange/red/rainbow", () => {
  const presentation = loadPetGrowthQualityPresentation();
  const cases = [
    [0, "D", "blue", "蓝", "普通"],
    [24.9, "D", "blue", "蓝", "普通"],
    [25, "C", "purple", "紫", "优秀"],
    [54.9, "C", "purple", "紫", "优秀"],
    [55, "B", "orange", "橙", "稀有"],
    [84.9, "B", "orange", "橙", "稀有"],
    [85, "A", "red", "红", "极品"],
    [94.9, "A", "red", "红", "极品"],
    [95, "S", "rainbow", "彩", "完美"],
    [100, "S", "rainbow", "彩", "完美"],
  ];
  for (const [percentile, gradeId, toneId, colorName, qualityName] of cases) {
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(presentation.bandForPercentile(percentile))
          .filter(([key]) => ["gradeId", "toneId", "colorName", "qualityName"].includes(key)),
      ),
      {gradeId, colorName, qualityName, toneId},
    );
  }
});

test("Lv1 is unobserved, Lv2-Lv19 is preliminary, and burst cannot appear before Lv20", () => {
  const presentation = loadPetGrowthQualityPresentation();
  const benchmark = {
    label: "测试公开上限",
    power: 5,
    stats: {maxHp: 8, attack: 2, defense: 1, quick: 1},
  };
  const levelOne = presentation.presentObservation({
    level: 1,
    observedLevels: 0,
    hasRecord: false,
  }, benchmark);
  assert.equal(levelOne.available, false);
  assert.equal(levelOne.badgeText, "成长未观察");
  assert.equal(levelOne.burstAny, false);

  const levelTwo = presentation.presentObservation({
    level: 2,
    observedLevels: 1,
    hasRecord: true,
    statAverages: {maxHp: 9, attack: 2, defense: 1, quick: 1},
    statPercentiles: {maxHp: 100, attack: 55, defense: 25, quick: 0},
    powerGrowthPerLevel: 5.25,
    powerPercentile: 95,
  }, benchmark);
  assert.equal(levelTwo.available, true);
  assert.equal(levelTwo.preliminary, true);
  assert.equal(levelTwo.mature, false);
  assert.equal(levelTwo.badgeText, "彩·完美｜观察中");
  assert.equal(levelTwo.burstAny, false);
});

test("Lv20 burst reads only public observed averages and marks the exceeded rows", () => {
  const screening = loadPetObservedGrowthScreening();
  const ordinary = screening.qualityPresentationForPet(blueDragonPet());
  assert.equal(screening.qualityPresentationId, "pet_growth_quality_v1");
  assert.equal(ordinary.mature, true);
  assert.equal(ordinary.badgeText, "红·极品");
  assert.equal(ordinary.burstAny, false);

  const burst = screening.qualityPresentationForPet(blueDragonPet({
    maxHp: 244,
  }));
  assert.equal(burst.mature, true);
  assert.equal(burst.burstAny, true);
  assert.equal(burst.burstKeys.includes("maxHp"), true);
  assert.equal(burst.rows.find((row) => row.key === "maxHp").burst, true);
  assert.equal(burst.rows.find((row) => row.key === "maxHp").value, 9.421);
  assert.equal(burst.rows.find((row) => row.key === "maxHp").benchmark, 9.4);

  const earlyBurst = screening.qualityPresentationForPet(blueDragonPet({
    level: 2,
    maxHp: 75,
    attack: 17,
    defense: 11,
    quick: 8,
  }));
  assert.equal(earlyBurst.preliminary, true);
  assert.equal(earlyBurst.burstAny, false);
});

test("species top benchmark follows public growth ranges and active power weights", () => {
  const presentation = loadPetGrowthQualityPresentation();
  const profiles = readJson(DEFAULT_SPECIES_PROFILE_PATH).profiles;
  const profile = profiles.find((entry) => entry.profileId === "wuli_normal_orange_fire10_v1");
  const powerDocument = readJson(DEFAULT_POWER_FORMULA_PATH);
  const formula = powerDocument.powerFormulas.find(
    (entry) => entry.id === powerDocument.activePowerFormula,
  );
  const benchmark = presentation.speciesBenchmark(profile, formula.weights);
  assert.deepEqual(benchmark.stats, {
    maxHp: 9.65,
    attack: 2.5,
    defense: 1.33,
    quick: 1.35,
  });
  assert.equal(benchmark.power, 7.5925);
});

test("presentation contract fails closed when thresholds or burst rules drift", () => {
  const source = readJson(DEFAULT_PRESENTATION_PATH);
  const wrongBand = structuredClone(source);
  wrongBand.qualityBands[2].minimumPercentile = 50;
  assert.throws(
    () => createPetGrowthQualityPresentation({presentationDocument: wrongBand}),
    (error) => error instanceof PetGrowthQualityPresentationConfigError
      && /approved B band/.test(error.message),
  );

  const earlyBurst = structuredClone(source);
  earlyBurst.burst.minimumLevel = 2;
  assert.throws(
    () => createPetGrowthQualityPresentation({presentationDocument: earlyBurst}),
    /approved Lv20 public-observation comparison/,
  );
});
