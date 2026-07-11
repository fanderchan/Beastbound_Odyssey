"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BattlePassiveCatalogError,
  createBattlePassiveCatalog,
  loadBattlePassiveCatalog,
} = require("../src/auth/battle-passive-catalog");

function passive(overrides = {}) {
  return {
    id: "fixture_passive",
    label: "夹具被动",
    description: "用于严格目录测试。",
    effect: {},
    ...overrides,
  };
}

function documentWith(entries) {
  return {schemaVersion: 1, passives: entries};
}

test("default server catalog strictly loads all five shared passive definitions", () => {
  const catalog = loadBattlePassiveCatalog();

  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.passiveCount, 5);
  assert.deepEqual(catalog.passiveIds, [
    "bui_resistant_skin",
    "wuli_hard_shell",
    "stone_immunity",
    "poison_resistance",
    "quick_instinct",
  ]);
  assert.equal(Object.isFrozen(catalog), true);
  assert.equal(Object.isFrozen(catalog.passiveById("wuli_hard_shell")), true);
});

test("shared passive rules produce the same current resistance and immunity facts as Godot", () => {
  const catalog = loadBattlePassiveCatalog();
  const bui = catalog.applyActorPassives({
    elements: {fire: 10, water: 0, earth: 0, wind: 0},
    passiveSkillIds: ["bui_resistant_skin"],
  });
  assert.equal(bui.actor.statusResist.confusion, 0.1);
  assert.deepEqual(bui.actor.statusImmune, {});

  const wuli = catalog.applyActorPassives({
    elements: {fire: 0, water: 0, earth: 10, wind: 0},
    passiveSkillIds: ["wuli_hard_shell"],
  });
  assert.equal(wuli.actor.statusResist.stone, 1);
  assert.equal(wuli.actor.statusImmune.stone, true);

  const stone = catalog.applyActorPassives({passiveSkillIds: ["stone_immunity"]});
  assert.equal(stone.actor.statusImmune.stone, true);

  const poison = catalog.applyActorPassives({
    passiveSkillIds: ["poison_resistance"],
    statusResist: {poison: 0.5},
  });
  assert.equal(poison.actor.statusResist.poison, 0.5);
});

test("quick instinct remains an explicit no-op until a product formula is approved", () => {
  const catalog = loadBattlePassiveCatalog();
  const source = {speed: 80, quick: 80, passiveSkillIds: ["quick_instinct"]};
  const result = catalog.applyActorPassives(source);

  assert.equal(result.actor.speed, 80);
  assert.equal(result.actor.quick, 80);
  assert.deepEqual(result.actor.statusResist, {});
  assert.deepEqual(result.actor.statusImmune, {});
  assert.deepEqual(result.appliedPassiveIds, ["quick_instinct"]);
  assert.deepEqual(source, {speed: 80, quick: 80, passiveSkillIds: ["quick_instinct"]});
});

test("unknown instance passive ids grant no effect and remain internal diagnostics", () => {
  const catalog = loadBattlePassiveCatalog();
  const result = catalog.applyActorPassives({passiveSkillIds: ["unknown_legacy_passive"]});

  assert.deepEqual(result.appliedPassiveIds, []);
  assert.deepEqual(result.unknownPassiveIds, ["unknown_legacy_passive"]);
  assert.deepEqual(result.actor.statusResist, {});
  assert.deepEqual(result.actor.statusImmune, {});
});

test("strict passive catalog rejects duplicate ids, unsupported effects, and invalid rates", () => {
  const invalidDocuments = [
    documentWith([passive(), passive()]),
    documentWith([passive({effect: {unknownPower: 1}})]),
    documentWith([passive({effect: {statusResist: {poison: 1.5}}})]),
    documentWith([passive({effect: {
      type: "element_scaled_status_resist",
      scalePerPoint: 0.1,
      mapping: {light: "stone"},
    }})]),
  ];

  for (const document of invalidDocuments) {
    assert.throws(
      () => createBattlePassiveCatalog({document}),
      (error) => error instanceof BattlePassiveCatalogError,
    );
  }
});
