"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_WILD_CAPTURE_GROWTH_POLICY,
  acceptanceProbability,
  canonicalWildCaptureGrowthPolicy,
  evaluateWildCaptureGrowthDraw,
  growthQualityUnit,
  levelPressure,
  selectWildCaptureGrowthDraw,
  validateWildCaptureGrowthPolicy,
} = require("../src/auth/wild-capture-growth-selection");

const PROFILE = Object.freeze({
  profileId: "selection_fixture_v1",
  individualRules: {
    growthOutputSpread: {
      maxHp: [-4, 4],
      attack: [-1, 1],
      defense: [-1, 1],
      quick: [-1, 1],
    },
  },
});

function privateRoll(qualityUnit) {
  const quality = Math.max(0, Math.min(1, Number(qualityUnit)));
  return {
    innateGrowthBonus: {
      maxHp: -4 + (8 * quality),
      attack: -1 + (2 * quality),
      defense: -1 + (2 * quality),
      quick: -1 + (2 * quality),
    },
  };
}

test("wild capture growth policy is strict, canonical, and deeply frozen", () => {
  assert.deepEqual(validateWildCaptureGrowthPolicy(DEFAULT_WILD_CAPTURE_GROWTH_POLICY), []);
  const canonical = canonicalWildCaptureGrowthPolicy(structuredClone(DEFAULT_WILD_CAPTURE_GROWTH_POLICY));
  assert.equal(Object.isFrozen(canonical), true);
  assert.equal(Object.isFrozen(canonical.qualityPowerWeights), true);
  assert.throws(() => {
    canonical.maxSelectionAttempts = 99;
  }, TypeError);

  const missingFloor = structuredClone(DEFAULT_WILD_CAPTURE_GROWTH_POLICY);
  delete missingFloor.jackpotAcceptanceFloor;
  assert.match(validateWildCaptureGrowthPolicy(missingFloor)[0], /exactly/);

  const unknownField = {...structuredClone(DEFAULT_WILD_CAPTURE_GROWTH_POLICY), hiddenQuality: true};
  assert.match(validateWildCaptureGrowthPolicy(unknownField)[0], /exactly/);

  const zeroFloor = structuredClone(DEFAULT_WILD_CAPTURE_GROWTH_POLICY);
  zeroFloor.jackpotAcceptanceFloor = 0;
  assert.match(validateWildCaptureGrowthPolicy(zeroFloor).join(";"), /jackpotAcceptanceFloor/);
});

test("Lv1 keeps the species distribution while higher levels suppress only the hidden-growth upper tail", () => {
  assert.equal(levelPressure(1), 0);
  assert.equal(levelPressure(10), 0.5);
  assert.ok(levelPressure(140) > levelPressure(50));

  assert.equal(acceptanceProbability(0.1, 140), 1);
  assert.equal(acceptanceProbability(0.5, 140), 1);
  assert.equal(acceptanceProbability(1, 1), 1);
  const level10Jackpot = acceptanceProbability(1, 10);
  const level20Jackpot = acceptanceProbability(1, 20);
  const level140Jackpot = acceptanceProbability(1, 140);
  assert.ok(level10Jackpot > level20Jackpot);
  assert.ok(level20Jackpot > level140Jackpot);
  assert.ok(level140Jackpot > 0);

  const roll = privateRoll(0.83);
  assert.equal(growthQualityUnit(PROFILE, roll), 0.83);
  const levelOne = evaluateWildCaptureGrowthDraw({
    profile: PROFILE,
    privateSeed: "selection-lv1",
    privateRoll: roll,
    encounterLevel: 1,
    policy: DEFAULT_WILD_CAPTURE_GROWTH_POLICY,
  });
  assert.equal(levelOne.acceptanceProbability, 1);
  assert.equal(levelOne.accepted, true);

  const differentLv1FourV = {
    initialBonus: {maxHp: 999, attack: -999, defense: 777, quick: -777},
    innateGrowthBonus: {...roll.innateGrowthBonus},
  };
  const sameSeedFirst = evaluateWildCaptureGrowthDraw({
    profile: PROFILE,
    privateSeed: "selection-hidden-growth-only",
    privateRoll: roll,
    encounterLevel: 140,
    policy: DEFAULT_WILD_CAPTURE_GROWTH_POLICY,
  });
  const sameSeedSecond = evaluateWildCaptureGrowthDraw({
    profile: PROFILE,
    privateSeed: "selection-hidden-growth-only",
    privateRoll: differentLv1FourV,
    encounterLevel: 140,
    policy: DEFAULT_WILD_CAPTURE_GROWTH_POLICY,
  });
  assert.deepEqual(sameSeedSecond, sameSeedFirst);
});

test("selection is bounded and falls back to the least powerful attempted hidden-growth roll", () => {
  const policy = canonicalWildCaptureGrowthPolicy({
    ...structuredClone(DEFAULT_WILD_CAPTURE_GROWTH_POLICY),
    upperTailStart: 0.01,
    jackpotAcceptanceFloor: 0.000000000001,
    maxSelectionAttempts: 3,
  });
  const qualities = [1, 0.9, 0.8];
  const candidates = qualities.map((quality, index) => ({
    privateSeed: `bounded-rejection-${index + 1}`,
    privateRoll: privateRoll(quality),
    value: {id: `candidate-${index + 1}`, quality},
  }));
  for (const candidate of candidates) {
    const evaluation = evaluateWildCaptureGrowthDraw({
      profile: PROFILE,
      privateSeed: candidate.privateSeed,
      privateRoll: candidate.privateRoll,
      encounterLevel: 140,
      policy,
    });
    assert.equal(evaluation.accepted, false, candidate.privateSeed);
  }

  let drawCount = 0;
  const selected = selectWildCaptureGrowthDraw({
    profile: PROFILE,
    encounterLevel: 140,
    policy,
    draw() {
      const candidate = candidates[drawCount];
      drawCount += 1;
      return candidate;
    },
  });

  assert.equal(drawCount, 3);
  assert.equal(selected.attemptCount, 3);
  assert.equal(selected.fallbackUsed, true);
  assert.equal(selected.value.id, "candidate-3");
  assert.equal(selected.evaluation.qualityUnit, 0.8);
});

test("Lv1 selection accepts the first draw and never consumes extra private identities", () => {
  let drawCount = 0;
  const selected = selectWildCaptureGrowthDraw({
    profile: PROFILE,
    encounterLevel: 1,
    policy: DEFAULT_WILD_CAPTURE_GROWTH_POLICY,
    draw() {
      drawCount += 1;
      return {
        privateSeed: `level-one-${drawCount}`,
        privateRoll: privateRoll(1),
        value: {drawCount},
      };
    },
  });
  assert.equal(drawCount, 1);
  assert.equal(selected.attemptCount, 1);
  assert.equal(selected.fallbackUsed, false);
  assert.deepEqual(selected.value, {drawCount: 1});
});
