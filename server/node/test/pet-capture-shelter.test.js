"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const shelter = require("../src/auth/pet-capture-shelter");

function capturedPet(overrides = {}) {
  return {
    instanceId: "pet_captured_17",
    petId: "pet_captured_17",
    formId: "blue_man_dragon_water10",
    templateId: "blue_man_dragon_water10",
    speciesId: "blue_man_dragon_water10",
    name: "蓝人龙",
    state: "standby",
    source: "wild_capture",
    capturedSerial: 17,
    capturedBattleRoomId: "battle_room_shelter_1",
    capturedBattleActorId: "wild_actor_1",
    level: 1,
    exp: 0,
    hp: 65,
    maxHp: 65,
    attack: 14,
    defense: 9,
    quick: 6,
    initialStats: {maxHp: 65, attack: 14, defense: 9, quick: 6},
    petGrowth: {
      schemaVersion: 1,
      private: {
        privateSeed: "a".repeat(64),
        privateRoll: {innateGrowthBonus: {maxHp: 1.2, attack: 0.3, defense: -0.1, quick: 0.2}},
      },
    },
    ...overrides,
  };
}

function stageInput(overrides = {}) {
  return {
    roomId: "battle_room_shelter_1",
    actorId: "wild_actor_1",
    pet: capturedPet(),
    createdAt: "2026-07-17T01:02:03.000Z",
    ...overrides,
  };
}

function fullProfile() {
  return {
    petInstances: Array.from({length: 25}, (_value, index) => ({
      instanceId: `pet_existing_${index + 1}`,
      petId: `pet_existing_${index + 1}`,
      formId: "wuli_normal_orange_fire10",
      templateId: "wuli_normal_orange_fire10",
      state: index < 5 ? "standby" : "storage",
    })),
    nextPetInstanceSerial: 17,
  };
}

test("capture staging keeps the exact private pet snapshot and replays idempotently", () => {
  const profile = {petInstances: [], nextPetInstanceSerial: 17};
  const input = stageInput();
  const expectedPet = structuredClone(input.pet);
  const staged = shelter.stagePetCapture(profile, input);

  assert.equal(staged.ok, true);
  assert.equal(staged.changed, true);
  assert.match(staged.recoveryId, /^pet_capture_[a-f0-9]{32}$/);
  assert.equal(profile.nextPetInstanceSerial, 18);
  assert.deepEqual(profile.petRecoveryShelter.pending[staged.recoveryId].pet, expectedPet);
  assert.equal(
    profile.petRecoveryShelter.pending[staged.recoveryId].pet.petGrowth.private.privateSeed,
    "a".repeat(64),
  );
  assert.deepEqual(input.pet, expectedPet);

  const beforeReplay = structuredClone(profile);
  const replay = shelter.stagePetCapture(profile, input);
  assert.deepEqual(replay, {
    ok: true,
    changed: false,
    replayed: true,
    recoveryId: staged.recoveryId,
    petInstanceId: "pet_captured_17",
  });
  assert.deepEqual(profile, beforeReplay);
});

test("staging rejects untrusted, secret-bearing and conflicting captures without mutation", () => {
  for (const pet of [
    capturedPet({source: "gm"}),
    capturedPet({captureSecret: "secret"}),
    capturedPet({integrityTag: "tag"}),
    capturedPet({petId: "different"}),
    capturedPet({capturedBattleActorId: "different"}),
  ]) {
    const profile = {petInstances: [], nextPetInstanceSerial: 17};
    const before = structuredClone(profile);
    const result = shelter.stagePetCapture(profile, stageInput({pet}));
    assert.equal(result.ok, false);
    assert.deepEqual(profile, before);
  }

  const profile = {petInstances: [], nextPetInstanceSerial: 17};
  const first = shelter.stagePetCapture(profile, stageInput());
  assert.equal(first.ok, true);
  const beforeConflict = structuredClone(profile);
  const conflict = shelter.stagePetCapture(profile, stageInput({
    pet: capturedPet({attack: 999}),
  }));
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "pet_capture_shelter_identity_conflict");
  assert.deepEqual(profile, beforeConflict);
});

test("recovery requires a real slot, preserves pending on full capacity, and restores the private pet", () => {
  const profile = fullProfile();
  const staged = shelter.stagePetCapture(profile, stageInput());
  assert.equal(staged.ok, true);
  const expectedSnapshot = structuredClone(profile.petRecoveryShelter.pending[staged.recoveryId].pet);
  const beforeFullRecovery = structuredClone(profile);
  const full = shelter.recoverPetCapture(profile, {
    recoveryId: staged.recoveryId,
    completedAt: "2026-07-17T01:03:00.000Z",
  });
  assert.equal(full.ok, false);
  assert.equal(full.code, "pet_capture_shelter_capacity_full");
  assert.deepEqual(profile, beforeFullRecovery);

  profile.petInstances.pop();
  const recovered = shelter.recoverPetCapture(profile, {
    recoveryId: staged.recoveryId,
    completedAt: "2026-07-17T01:04:00.000Z",
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.changed, true);
  assert.equal(recovered.replayed, false);
  assert.equal(recovered.disposition, "storage");
  assert.equal(profile.petInstances.length, 25);
  const restored = profile.petInstances.find((pet) => pet.instanceId === "pet_captured_17");
  assert.ok(restored);
  assert.deepEqual({...restored, state: expectedSnapshot.state}, expectedSnapshot);
  assert.equal(restored.petGrowth.private.privateSeed, "a".repeat(64));
  assert.equal(Object.keys(profile.petRecoveryShelter.pending).length, 0);
  assert.equal(Object.keys(profile.petRecoveryShelter.completed).length, 1);
  assert.deepEqual(profile.petRecoveryShelter.recentCompletedIds, [staged.recoveryId]);

  const beforeReplay = structuredClone(profile);
  const replay = shelter.recoverPetCapture(profile, {
    recoveryId: staged.recoveryId,
    completedAt: "2026-07-17T01:05:00.000Z",
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.changed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(profile, beforeReplay);
  assert.equal(profile.petInstances.filter((pet) => pet.instanceId === "pet_captured_17").length, 1);
});

test("malformed or future shelter state fails closed and pending records are never trimmed", () => {
  for (const value of [
    null,
    [],
    {schemaVersion: 2, pending: {}, completed: {}, recentCompletedIds: []},
    {schemaVersion: 1, pending: [], completed: {}, recentCompletedIds: []},
    {schemaVersion: 1, pending: {}, completed: {future: {future: true}}, recentCompletedIds: []},
  ]) {
    const profile = {petInstances: [], petRecoveryShelter: value};
    const before = structuredClone(profile);
    const staged = shelter.stagePetCapture(profile, stageInput());
    assert.equal(staged.ok, false);
    assert.deepEqual(profile, before);
  }

  const profile = {petInstances: [], nextPetInstanceSerial: 1};
  for (let index = 0; index < 125; index += 1) {
    const roomId = `battle_room_pending_${index}`;
    const actorId = `wild_actor_${index}`;
    const instanceId = `pet_captured_${index + 1}`;
    const result = shelter.stagePetCapture(profile, {
      roomId,
      actorId,
      pet: capturedPet({
        instanceId,
        petId: instanceId,
        capturedSerial: index + 1,
        capturedBattleRoomId: roomId,
        capturedBattleActorId: actorId,
      }),
      createdAt: "2026-07-17T01:02:03.000Z",
    });
    assert.equal(result.ok, true);
  }
  const pending = shelter.pendingPetCaptures(profile);
  assert.equal(pending.ok, true);
  assert.equal(pending.records.length, 125);
});

test("completed tombstones stay bounded while expired replays can never duplicate a pet", () => {
  const profile = {petInstances: [], nextPetInstanceSerial: 1};
  const recoveryIds = [];
  const completedBaseMs = Date.parse("2026-07-17T01:04:00.000Z");
  for (let index = 0; index < shelter.MAX_COMPLETED_RECORDS + 25; index += 1) {
    const roomId = `battle_room_completed_${index}`;
    const actorId = `wild_completed_${index}`;
    const instanceId = `pet_completed_${index + 1}`;
    const staged = shelter.stagePetCapture(profile, {
      roomId,
      actorId,
      pet: capturedPet({
        instanceId,
        petId: instanceId,
        capturedSerial: index + 1,
        capturedBattleRoomId: roomId,
        capturedBattleActorId: actorId,
      }),
      createdAt: "2026-07-17T01:02:03.000Z",
    });
    assert.equal(staged.ok, true);
    recoveryIds.push(staged.recoveryId);
    const recovered = shelter.recoverPetCapture(profile, {
      recoveryId: staged.recoveryId,
      completedAt: new Date(completedBaseMs + index).toISOString(),
    });
    assert.equal(recovered.ok, true);
    profile.petInstances = [];
  }

  assert.equal(Object.keys(profile.petRecoveryShelter.completed).length, shelter.MAX_COMPLETED_RECORDS);
  assert.equal(profile.petRecoveryShelter.recentCompletedIds.length, shelter.MAX_RECENT_COMPLETED_IDS);
  assert.equal(Object.hasOwn(profile.petRecoveryShelter.completed, recoveryIds[0]), false);
  assert.equal(Object.hasOwn(profile.petRecoveryShelter.completed, recoveryIds.at(-1)), true);
  assert.equal(profile.petRecoveryShelter.recentCompletedIds.includes(recoveryIds[0]), false);

  const beforeReplay = structuredClone(profile);
  const replay = shelter.recoverPetCapture(profile, {
    recoveryId: recoveryIds[0],
    completedAt: "2026-07-17T02:00:00.000Z",
  });
  assert.equal(replay.ok, false);
  assert.equal(replay.code, "pet_capture_shelter_pending_missing");
  assert.deepEqual(profile, beforeReplay);
  assert.equal(profile.petInstances.length, 0);
});
