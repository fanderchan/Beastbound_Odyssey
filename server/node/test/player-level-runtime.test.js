"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {loadPlayerLevelRuntime} = require("../src/auth/player-level-runtime");

test("player level runtime strictly loads the shared Lv1-140 curve and fixed anchors", () => {
  const runtime = loadPlayerLevelRuntime();
  assert.equal(runtime.curveId, "default_1_140");
  assert.equal(runtime.maxPlayerLevel, 140);
  assert.equal(Object.isFrozen(runtime.curve), true);
  assert.deepEqual([
    1, 2, 10, 20, 60, 80, 100, 120, 131, 139, 140,
  ].map((level) => runtime.expToNextLevel(level)), [
    122, 177, 1040, 3559, 62667, 204634, 656810, 2092785, 3943512, 6239168, 6606597,
  ]);
});

test("player level awards preserve overflow and cap semantics without mutating input", () => {
  const runtime = loadPlayerLevelRuntime();
  const entry = {level: 1, exp: 0};
  assert.deepEqual(runtime.awardEntry(entry, 1000000), {
    level: 61,
    exp: 37736,
    nextExp: 66552,
    levelsGained: 60,
    overflowExp: 0,
  });
  assert.deepEqual(entry, {level: 1, exp: 0});
  assert.deepEqual(runtime.awardEntry({level: 140, exp: 0}, 999), {
    level: 140,
    exp: 0,
    nextExp: 6606597,
    levelsGained: 0,
    overflowExp: 999,
  });
});

test("player level runtime rejects missing, unsupported, stringly typed and unsafe curves", () => {
  const validCurve = {
    id: "test_curve",
    formula: "v1_exponential_power",
    baseConstant: 80,
    linearPerLevel: 40,
    expGrowthRate: 1.052,
    powerExponent: 2.15,
    powerMultiplier: 2,
  };
  const cases = [
    {document: {maxPlayerLevel: 140, activeCurveId: "missing", curves: [validCurve]}, pattern: /does not exist/},
    {document: {maxPlayerLevel: 140, activeCurveId: "test_curve", curves: [{...validCurve, formula: "unknown"}]}, pattern: /unsupported/},
    {document: {maxPlayerLevel: 140, activeCurveId: "test_curve", curves: [{...validCurve, baseConstant: "80"}]}, pattern: /invalid player level curve number/},
    {document: {maxPlayerLevel: 140, activeCurveId: "test_curve", curves: [{...validCurve, expGrowthRate: 0}]}, pattern: /unsafe values/},
  ];
  for (const fixture of cases) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-level-curve-"));
    try {
      fs.mkdirSync(path.join(dataDir, "balance"));
      fs.writeFileSync(path.join(dataDir, "balance", "level_curves.json"), JSON.stringify(fixture.document));
      assert.throws(() => loadPlayerLevelRuntime({dataDir}), fixture.pattern);
    } finally {
      fs.rmSync(dataDir, {recursive: true, force: true});
    }
  }
});
