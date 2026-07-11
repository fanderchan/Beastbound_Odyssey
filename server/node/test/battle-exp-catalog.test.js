"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {loadBattleExpCatalog, scaledForRecipientLevel} = require("../src/auth/battle-exp-catalog");

test("battle EXP catalog loads the versioned shared route formula and fixed cross-runtime samples", () => {
  const catalog = loadBattleExpCatalog();
  assert.equal(catalog.formulaId, "battle_exp_v2_route");
  assert.equal(Object.isFrozen(catalog.formula), true);
  const samples = [
    [{level: 1, maxHp: 92, attack: 15, defense: 7, agility: 72}, "firebud_grass_01", 40],
    [{level: 16, maxHp: 260, attack: 34, defense: 54, agility: 50}, "growth_training_01", 216],
    [{level: 40, maxHp: 520, attack: 105, defense: 72, agility: 94}, "growth_training_01", 1314],
    [{level: 60, maxHp: 760, attack: 150, defense: 90, agility: 195}, "rebirth_prep_training_01", 2468],
    [{level: 110, maxHp: 1250, attack: 225, defense: 190, agility: 230}, "high_cave_training_01", 19139],
    [{level: 126, maxHp: 1500, attack: 260, defense: 220, agility: 265}, "shadow_chase_training_01", 56722],
    [{level: 136, maxHp: 1800, attack: 305, defense: 265, agility: 305}, "shadow_capstone_training_01", 101569],
  ];
  for (const [actor, groupId, expected] of samples) {
    assert.equal(catalog.rewardForActor(actor, groupId), expected, groupId);
  }
  assert.equal(catalog.hasExplicitGroupMultiplier("shadow_capstone_training_01"), true);
  assert.equal(catalog.hasExplicitGroupMultiplier("unknown_group"), false);
});

test("recipient level decay keeps full EXP through plus five levels and reaches a one-EXP floor", () => {
  assert.equal(scaledForRecipientLevel(1000, 25, 20), 1000);
  assert.equal(scaledForRecipientLevel(1000, 26, 20), 933);
  assert.equal(scaledForRecipientLevel(1000, 39, 20), 66);
  assert.equal(scaledForRecipientLevel(1000, 40, 20), 1);
  assert.equal(scaledForRecipientLevel(1000, 140, 1), 1);
});

test("battle EXP catalog rejects inactive, stringly typed and unsafe multiplier documents", () => {
  const validFormula = {
    id: "test_exp_v1",
    minPerEnemy: 8,
    maxHpDivisor: 10,
    attackWeight: 1,
    defenseWeight: 1,
    quickDivisor: 8,
    levelScale: {enabled: true, pivotLevel: 20, exponent: 1.6, minMultiplier: 1, maxMultiplier: 30},
    groupMultipliers: {default_wild: 1, test_group: 2},
  };
  const cases = [
    {
      name: "missing active formula",
      document: {battleExp: {activeFormulaId: "missing", formulas: [validFormula]}},
      pattern: /active formula does not exist/,
    },
    {
      name: "numeric string",
      document: {battleExp: {activeFormulaId: "test_exp_v1", formulas: [{...validFormula, minPerEnemy: "8"}]}},
      pattern: /invalid number/,
    },
    {
      name: "missing default multiplier",
      document: {battleExp: {activeFormulaId: "test_exp_v1", formulas: [{...validFormula, groupMultipliers: {test_group: 1}}]}},
      pattern: /missing default_wild/,
    },
    {
      name: "negative multiplier",
      document: {battleExp: {activeFormulaId: "test_exp_v1", formulas: [{...validFormula, groupMultipliers: {default_wild: -1}}]}},
      pattern: /cannot be negative/,
    },
  ];
  for (const fixture of cases) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-battle-exp-"));
    try {
      fs.mkdirSync(path.join(dataDir, "balance"));
      fs.writeFileSync(path.join(dataDir, "balance", "reward_economy.json"), JSON.stringify(fixture.document));
      assert.throws(() => loadBattleExpCatalog({dataDir}), fixture.pattern, fixture.name);
    } finally {
      fs.rmSync(dataDir, {recursive: true, force: true});
    }
  }
});
