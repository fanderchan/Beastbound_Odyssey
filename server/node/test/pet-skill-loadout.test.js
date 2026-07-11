"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MAX_PET_SKILL_SLOTS,
  equippedPetSkillIds,
  normalizePetSkillSlots,
  preferredSlotForAction,
} = require("../src/auth/pet-skill-loadout");

function fixtureActions() {
  return Array.from({length: 8}, (_, index) => ({
    id: `pet_fixture_${index + 1}`,
    owner: "pet_skill",
    preferredSlot: Math.min(index + 1, MAX_PET_SKILL_SLOTS),
  }));
}

function resolver(actions) {
  return (skillId) => actions.find((action) => action.id === skillId) || null;
}

test("an extensible pet skill catalog still equips at most seven unique instance slots", () => {
  const actions = fixtureActions();
  const skillIds = actions.map((action) => action.id);
  const slots = normalizePetSkillSlots(skillIds, [], resolver(actions));

  assert.equal(skillIds.length, 8);
  assert.equal(slots.length, 7);
  assert.deepEqual(slots, skillIds.slice(0, 7));
  assert.equal(new Set(slots.filter(Boolean)).size, 7);
  assert.deepEqual(equippedPetSkillIds(skillIds, [], resolver(actions)), skillIds.slice(0, 7));
  assert.equal(equippedPetSkillIds(skillIds, [], resolver(actions)).includes("pet_fixture_8"), false);
});

test("explicit instance slots win over duplicate catalog preferences without deleting learned skills", () => {
  const actions = fixtureActions();
  const skillIds = actions.map((action) => action.id);
  const rawSlots = ["pet_fixture_1", "", "", "", "", "", "pet_fixture_8"];
  const slots = normalizePetSkillSlots(skillIds, rawSlots, resolver(actions));

  assert.equal(slots.length, 7);
  assert.equal(slots[0], "pet_fixture_1");
  assert.equal(slots[6], "pet_fixture_8");
  assert.equal(slots.includes("pet_fixture_7"), false);
  assert.equal(skillIds.includes("pet_fixture_7"), true);
  assert.equal(new Set(slots.filter(Boolean)).size, 7);
});

test("loadout normalization ignores non-pet actions and reads legacy slot only as compatibility input", () => {
  const actions = [
    {id: "pet_legacy", owner: "pet_skill", slot: 3},
    {id: "player_attack", owner: "player", preferredSlot: 1},
  ];
  assert.equal(preferredSlotForAction(actions[0]), 3);
  assert.deepEqual(
    normalizePetSkillSlots(["player_attack", "pet_legacy"], [], resolver(actions)),
    ["", "", "pet_legacy", "", "", "", ""],
  );
});
