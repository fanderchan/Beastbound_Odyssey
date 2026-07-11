"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {createBattleActorRules} = require("../src/auth/battle-actor-rules");
const {loadBattlePassiveCatalog} = require("../src/auth/battle-passive-catalog");

function rules() {
  const templates = {
    bui_fire: {
      lineId: "bui",
      elements: {fire: 10, water: 0, earth: 0, wind: 0},
      passiveSkillIds: ["bui_resistant_skin"],
    },
    wuli_earth: {
      lineId: "wuli",
      elements: {fire: 0, water: 0, earth: 10, wind: 0},
      passiveSkillIds: ["wuli_hard_shell"],
    },
  };
  return createBattleActorRules({
    passiveCatalog: loadBattlePassiveCatalog(),
    templateResolver: (formId) => templates[formId] || {},
  });
}

test("pet actors derive elements, line and resistance only from the server template", () => {
  const source = {
    actorId: "pet_bui",
    kind: "pet",
    formId: "bui_fire",
    elements: {earth: 10},
    statusResist: {all: 1},
    statusImmune: {all: true},
    passiveSkillIds: [],
  };
  const result = rules().materializeActor(source);

  assert.equal(result.actor.lineId, "bui");
  assert.deepEqual(result.actor.elements, {fire: 10, water: 0, earth: 0, wind: 0});
  assert.deepEqual(result.actor.statusResist, {stone: 0, poison: 0, confusion: 0.1, sleep: 0});
  assert.deepEqual(result.actor.statusImmune, {});
  assert.deepEqual(result.actor.passiveSkillIds, ["bui_resistant_skin"]);
  assert.deepEqual(source.statusImmune, {all: true});
});

test("server template passives and inherited instance passives share one materialization path", () => {
  const result = rules().materializeActor({
    actorId: "pet_wuli",
    kind: "wild_pet",
    formId: "wuli_earth",
    passiveSkillIds: ["poison_resistance", "unknown_legacy_passive"],
  });

  assert.equal(result.actor.statusResist.stone, 1);
  assert.equal(result.actor.statusResist.poison, 0.35);
  assert.equal(result.actor.statusImmune.stone, true);
  assert.deepEqual(result.unknownPassiveIds, ["unknown_legacy_passive"]);
});

test("non-pet actors remain untouched and actor diagnostics stay outside public facts", () => {
  const actorRules = rules();
  const player = {actorId: "player", kind: "player", statusResist: {stone: 0.2}};
  const materialized = actorRules.materializeActors([
    player,
    {actorId: "pet", kind: "pet", formId: "bui_fire", passiveSkillIds: ["unknown_passive"]},
  ]);

  assert.deepEqual(materialized.actors[0], player);
  assert.equal(Object.hasOwn(materialized.actors[1], "unknownPassiveIds"), false);
  assert.deepEqual(materialized.diagnostics, [{actorId: "pet", passiveIds: ["unknown_passive"]}]);
});
