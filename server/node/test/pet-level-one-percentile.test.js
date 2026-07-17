"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  distributionCdf,
  levelOnePercentiles,
  levelOneStatPercentile,
} = require("../src/auth/pet-level-one-percentile");

function profile(overrides = {}) {
  return {
    profileId: "percentile_fixture_v1",
    outputBase: {maxHp: 60, attack: 14, defense: 8, quick: 6},
    individualRules: {
      initialOutputSpread: {
        maxHp: [-5, 5],
        attack: [-2, 2],
        defense: [-1, 1],
        quick: [-2, 2],
      },
      distribution: "uniform",
      rareExtremeRate: 0,
    },
    ...overrides,
  };
}

test("uniform Lv1 percentiles follow the authority's rounded visible distribution", () => {
  const fixture = profile();
  assert.equal(levelOneStatPercentile(fixture, "maxHp", 55), 5);
  assert.equal(levelOneStatPercentile(fixture, "maxHp", 60), 55);
  assert.equal(levelOneStatPercentile(fixture, "maxHp", 65), 100);
  assert.equal(levelOneStatPercentile(fixture, "attack", 12), 12.5);
  assert.equal(levelOneStatPercentile(fixture, "attack", 14), 62.5);
  assert.equal(levelOneStatPercentile(fixture, "attack", 16), 100);

  assert.deepEqual(levelOnePercentiles(fixture, {
    maxHp: 60,
    attack: 14,
    defense: 8,
    quick: 6,
  }), {
    schemaVersion: 1,
    profileId: "percentile_fixture_v1",
    levelOneFourV: {maxHp: 60, attack: 14, defense: 8, quick: 6},
    statPercentiles: {maxHp: 55, attack: 62.5, defense: 75, quick: 62.5},
  });
});

test("weighted-center and rare-spike CDFs preserve their configured tails", () => {
  assert.equal(distributionCdf("weighted_center", 0.02, 0), 0.01);
  assert.equal(distributionCdf("weighted_center", 0.02, 0.5), 0.5);
  assert.equal(distributionCdf("weighted_center", 0.02, 1), 1);
  assert.equal(Math.round(distributionCdf("rare_spike", 0.02, 0.72) * 10000), 9800);
  assert.equal(Math.round(distributionCdf("rare_spike", 0.02, 0.96) * 10000), 9900);

  const weighted = profile({
    individualRules: {
      initialOutputSpread: {
        maxHp: [-2, 2], attack: [-2, 2], defense: [-2, 2], quick: [-2, 2],
      },
      distribution: "weighted_center",
      rareExtremeRate: 0.02,
    },
  });
  assert.equal(levelOneStatPercentile(weighted, "attack", 12), 4.1);
  assert.equal(levelOneStatPercentile(weighted, "attack", 14), 71.4);
  assert.equal(levelOneStatPercentile(weighted, "attack", 16), 100);
});

test("percentiles use only public species Lv1 facts and reject malformed inputs", () => {
  const fixture = profile();
  const guarded = new Proxy(fixture, {
    get(target, property, receiver) {
      if (property === "outputGrowth" || property === "growthOutputSpread" || property === "privateSeed") {
        throw new Error(`hidden growth read: ${String(property)}`);
      }
      return Reflect.get(target, property, receiver);
    },
  });
  assert.equal(levelOneStatPercentile(guarded, "quick", 6), 62.5);
  const wideButBounded = profile({
    outputBase: {maxHp: 1, attack: 14, defense: 8, quick: 6},
    individualRules: {
      initialOutputSpread: {
        maxHp: [-1_000_000, 1_000_000],
        attack: [-2, 2],
        defense: [-1, 1],
        quick: [-2, 2],
      },
      distribution: "uniform",
      rareExtremeRate: 0,
    },
  });
  assert.equal(levelOneStatPercentile(wideButBounded, "maxHp", 1), 50);
  assert.throws(() => levelOneStatPercentile(fixture, "unknown", 1), /unsupported/);
  assert.throws(() => levelOneStatPercentile(fixture, "attack", 0), /positive integer/);
  assert.throws(() => levelOnePercentiles(fixture, {maxHp: 60}), /invalid attack/);
  assert.throws(() => levelOneStatPercentile(profile({
    outputBase: {maxHp: 60, attack: 1_000_001, defense: 8, quick: 6},
  }), "attack", 1), /profile facts are invalid/);
});
