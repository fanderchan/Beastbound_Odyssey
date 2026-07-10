"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");

const PetGrowthAuthority = require("../src/auth/pet-growth-authority");

const ROOT = path.resolve(__dirname, "../../..");
const VECTOR_PATH = path.join(ROOT, "tools/fixtures/pet_growth_authority_v1_vectors.json");
const PROFILE_PATH = path.join(ROOT, "client/godot/data/balance/pet_growth_species_profiles.json");
const PRIVATE_KEYS = new Set([
  "continuousStats",
  "innateGrowthBonus",
  "initialBonus",
  "growthBonus",
  "privateSeed",
  "privateRoll",
  "individualSeed",
  "individualVariance",
  "growthSpeciesSeed",
  "growthSpeciesRoll",
  "growthSpeciesSampleNo",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function firstPrivatePath(value, prefix = "") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = firstPrivatePath(value[index], `${prefix}[${index}]`);
      if (found) {
        return found;
      }
    }
    return "";
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    if (PRIVATE_KEYS.has(key)) {
      return nextPath;
    }
    const found = firstPrivatePath(nested, nextPath);
    if (found) {
      return found;
    }
  }
  return "";
}

test("pet growth authority matches shared Node/Godot golden vectors", () => {
  const fixture = readJson(VECTOR_PATH);
  assert.equal(fixture.modelVersion, PetGrowthAuthority.MODEL_VERSION);
  assert.ok(fixture.vectors.length >= 3);

  for (const vector of fixture.vectors) {
    const privateRoll = PetGrowthAuthority.derivePrivateRoll(vector.profile, vector.privateSeed);
    assert.deepEqual(privateRoll, vector.expected.privateRoll, `${vector.id} private roll`);
    assert.deepEqual(
      PetGrowthAuthority.derivePrivateRoll(vector.profile, vector.privateSeed),
      privateRoll,
      `${vector.id} repeatability`,
    );
    for (const expectedSnapshot of vector.expected.publicSnapshots) {
      const actual = PetGrowthAuthority.buildPublicSnapshot(
        vector.profile,
        vector.privateSeed,
        expectedSnapshot.level,
        privateRoll,
        vector.cultivation,
      );
      assert.deepEqual(actual, expectedSnapshot, `${vector.id} Lv${expectedSnapshot.level}`);
      assert.equal(firstPrivatePath(actual), "", `${vector.id} public snapshot must not leak private state`);
      assert.deepEqual(Object.keys(actual).sort(), [
        "growthModelVersion",
        "growthSpeciesProfileId",
        "level",
        "levelOneFourV",
        "schemaVersion",
        "stats",
      ]);
      assert.deepEqual(Object.keys(actual.levelOneFourV).sort(), ["attack", "defense", "maxHp", "quick"]);
      assert.deepEqual(Object.keys(actual.stats).sort(), ["attack", "defense", "maxHp", "quick"]);
    }
    for (const expectedContinuous of vector.expected.continuousSnapshots) {
      assert.deepEqual(
        PetGrowthAuthority.continuousStatsAtLevel(
          vector.profile,
          vector.privateSeed,
          expectedContinuous.level,
          privateRoll,
          vector.cultivation,
        ),
        expectedContinuous.stats,
        `${vector.id} continuous Lv${expectedContinuous.level}`,
      );
    }
    for (const expectedDelta of vector.expected.growthDeltas) {
      assert.deepEqual(
        PetGrowthAuthority.growthDeltaForLevel(
          vector.profile,
          vector.privateSeed,
          expectedDelta.level,
          privateRoll,
          vector.cultivation,
        ),
        expectedDelta.stats,
        `${vector.id} delta Lv${expectedDelta.level}`,
      );
    }
    let replayed = PetGrowthAuthority.continuousStatsAtLevel(
      vector.profile,
      vector.privateSeed,
      1,
      privateRoll,
      vector.cultivation,
    );
    for (let targetLevel = 2; targetLevel <= PetGrowthAuthority.MAX_LEVEL; targetLevel += 1) {
      const delta = PetGrowthAuthority.growthDeltaForLevel(
        vector.profile,
        vector.privateSeed,
        targetLevel,
        privateRoll,
        vector.cultivation,
      );
      replayed = Object.fromEntries(PetGrowthAuthority.STAT_KEYS.map((key) => [
        key,
        PetGrowthAuthority.quantize(replayed[key] + delta[key]),
      ]));
    }
    assert.deepEqual(
      replayed,
      PetGrowthAuthority.continuousStatsAtLevel(
        vector.profile,
        vector.privateSeed,
        PetGrowthAuthority.MAX_LEVEL,
        privateRoll,
        vector.cultivation,
      ),
      `${vector.id} incremental and direct Lv140`,
    );
  }
});

test("pet growth authority defines cross-runtime rounding and level bounds", () => {
  assert.equal(PetGrowthAuthority.roundHalfAwayFromZero(1.5), 2);
  assert.equal(PetGrowthAuthority.roundHalfAwayFromZero(-1.5), -2);
  assert.equal(PetGrowthAuthority.roundHalfAwayFromZero(1.49), 1);
  assert.equal(PetGrowthAuthority.roundHalfAwayFromZero(-1.49), -1);
  assert.equal(PetGrowthAuthority.quantize(-0.1234565), -0.123457);

  const vector = readJson(VECTOR_PATH).vectors[0];
  const belowMinimum = PetGrowthAuthority.buildPublicSnapshot(vector.profile, vector.privateSeed, 0);
  const aboveMaximum = PetGrowthAuthority.buildPublicSnapshot(vector.profile, vector.privateSeed, 999);
  assert.equal(belowMinimum.level, 1);
  assert.equal(aboveMaximum.level, PetGrowthAuthority.MAX_LEVEL);
});

test("public growth snapshot exposes visible 4V and current stats but not the private seed or roll", () => {
  const vector = readJson(VECTOR_PATH).vectors[1];
  const privateSnapshot = PetGrowthAuthority.buildPrivateSnapshot(
    vector.profile,
    vector.privateSeed,
    20,
    vector.cultivation,
  );
  assert.equal(privateSnapshot.privateSeed, vector.privateSeed);
  assert.deepEqual(privateSnapshot.privateRoll, vector.expected.privateRoll);
  assert.deepEqual(privateSnapshot.publicSnapshot, vector.expected.publicSnapshots[2]);
  assert.equal(firstPrivatePath(privateSnapshot.publicSnapshot), "");
  assert.deepEqual(Object.keys(privateSnapshot.publicSnapshot.levelOneFourV).sort(), [
    "attack",
    "defense",
    "maxHp",
    "quick",
  ]);
  const forgedRoll = structuredClone(privateSnapshot.privateRoll);
  forgedRoll.innateGrowthBonus.attack += 0.1;
  assert.throws(
    () => PetGrowthAuthority.buildPublicSnapshot(
      vector.profile,
      vector.privateSeed,
      20,
      forgedRoll,
      vector.cultivation,
    ),
    /does not match private seed/,
  );
  const extendedRoll = {...privateSnapshot.privateRoll, "qualityTier": "S"};
  assert.throws(
    () => PetGrowthAuthority.buildPublicSnapshot(
      vector.profile,
      vector.privateSeed,
      20,
      extendedRoll,
      vector.cultivation,
    ),
    /does not match private seed/,
  );
  const stringRoll = structuredClone(privateSnapshot.privateRoll);
  stringRoll.innateGrowthBonus.attack = String(stringRoll.innateGrowthBonus.attack);
  assert.throws(
    () => PetGrowthAuthority.buildPublicSnapshot(
      vector.profile,
      vector.privateSeed,
      20,
      stringRoll,
      vector.cultivation,
    ),
    /does not match private seed/,
  );
});

test("runtime blue man dragon inputs used by the parity vector stay intentional", () => {
  const fixtureProfile = readJson(VECTOR_PATH).vectors[0].profile;
  const runtimeProfile = readJson(PROFILE_PATH).profiles.find(
    (profile) => profile.profileId === fixtureProfile.profileId,
  );
  assert.ok(runtimeProfile);
  assert.deepEqual(runtimeProfile.outputBase, fixtureProfile.outputBase);
  assert.deepEqual(runtimeProfile.outputGrowth, fixtureProfile.outputGrowth);
  assert.deepEqual(runtimeProfile.individualRules.initialOutputSpread, fixtureProfile.individualRules.initialOutputSpread);
  assert.deepEqual(runtimeProfile.individualRules.growthOutputSpread, fixtureProfile.individualRules.growthOutputSpread);
  assert.deepEqual(
    runtimeProfile.individualRules.levelOutputNoiseSpread || {},
    fixtureProfile.individualRules.levelOutputNoiseSpread || {},
  );
  assert.equal(runtimeProfile.individualRules.distribution, fixtureProfile.individualRules.distribution);
  assert.equal(runtimeProfile.individualRules.rareExtremeRate, fixtureProfile.individualRules.rareExtremeRate);
  assert.equal(
    runtimeProfile.individualRules.levelNoiseDistribution || "",
    fixtureProfile.individualRules.levelNoiseDistribution || "",
  );
  assert.equal(
    runtimeProfile.individualRules.levelNoiseRareExtremeRate || 0,
    fixtureProfile.individualRules.levelNoiseRareExtremeRate || 0,
  );
});

test("level deltas advance the private continuous accumulator, never rounded public stats", () => {
  const vector = readJson(VECTOR_PATH).vectors.find((entry) => entry.id === "weighted_noise_unicode");
  const privateRoll = PetGrowthAuthority.derivePrivateRoll(vector.profile, vector.privateSeed);
  let continuous = PetGrowthAuthority.continuousStatsAtLevel(
    vector.profile,
    vector.privateSeed,
    1,
    privateRoll,
    vector.cultivation,
  );
  let incorrectlyRounded = PetGrowthAuthority.visibleStatsAtLevel(
    vector.profile,
    vector.privateSeed,
    1,
    privateRoll,
    vector.cultivation,
  );
  for (let targetLevel = 2; targetLevel <= PetGrowthAuthority.MAX_LEVEL; targetLevel += 1) {
    const delta = PetGrowthAuthority.growthDeltaForLevel(
      vector.profile,
      vector.privateSeed,
      targetLevel,
      privateRoll,
      vector.cultivation,
    );
    for (const key of PetGrowthAuthority.STAT_KEYS) {
      continuous[key] = PetGrowthAuthority.quantize(continuous[key] + delta[key]);
      incorrectlyRounded[key] = Math.max(
        1,
        PetGrowthAuthority.roundHalfAwayFromZero(incorrectlyRounded[key] + delta[key]),
      );
    }
  }
  const correctVisible = Object.fromEntries(PetGrowthAuthority.STAT_KEYS.map((key) => [
    key,
    Math.max(1, PetGrowthAuthority.roundHalfAwayFromZero(continuous[key])),
  ]));
  assert.deepEqual(correctVisible, vector.expected.publicSnapshots.at(-1).stats);
  assert.notDeepEqual(incorrectlyRounded, correctVisible);
});
