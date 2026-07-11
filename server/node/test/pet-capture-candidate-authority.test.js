"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  PROFILE_RESOLUTION_AUTHORITY_V1,
  PROFILE_RESOLUTION_LEGACY_UNLINKED,
  loadPetGrowthCatalog,
} = require("../src/auth/pet-growth-catalog");
const {createNewPetFactory} = require("../src/auth/new-pet-factory");
const {validatePetGrowth} = require("../src/auth/pet-growth-runtime");
const {
  PRIVATE_CANDIDATE_KEY,
  createPetCaptureCandidateAuthority,
} = require("../src/auth/pet-capture-candidate-authority");

const TEMPLATE_PATH = path.resolve(__dirname, "../../../client/godot/data/pet_templates.json");
const LEGACY_GROWTH_PATH = path.resolve(
  __dirname,
  "../../../client/godot/data/balance/pet_growth_profiles.json",
);
const TEMPLATE_DOCUMENT = JSON.parse(fs.readFileSync(TEMPLATE_PATH, "utf8"));
const LEGACY_GROWTH_DOCUMENT = JSON.parse(fs.readFileSync(LEGACY_GROWTH_PATH, "utf8"));

function clone(value) {
  return structuredClone(value);
}

function uniqueStrings(value) {
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)));
}

function templateResolver(formId) {
  const form = TEMPLATE_DOCUMENT.forms.find((entry) => entry.formId === formId);
  if (!form) {
    return null;
  }
  const line = TEMPLATE_DOCUMENT.lines.find((entry) => entry.lineId === form.lineId) || {};
  const subtype = TEMPLATE_DOCUMENT.subtypes.find((entry) => entry.subtypeId === form.subtypeId) || {};
  const activeSkillIds = uniqueStrings(subtype.activeSkillIds);
  const passiveSkillIds = uniqueStrings([
    ...uniqueStrings(line.passiveSkillIds),
    line.passiveSkillId,
  ]);
  return {
    ...clone(form),
    activeSkillIds,
    passiveSkillIds,
    petSkillSlots: [...activeSkillIds, ...Array.from({length: 7}, () => "")].slice(0, 7),
  };
}

function deterministicRandomBytes(label = "candidate-test") {
  let count = 0;
  const calls = [];
  return {
    randomBytes(size) {
      count += 1;
      calls.push(size);
      const digest = crypto.createHash("sha256").update(`${label}:${count}`, "utf8").digest();
      assert.ok(size <= digest.length);
      return digest.subarray(0, size);
    },
    callCount() {
      return calls.length;
    },
    calls,
  };
}

function harness(label = "candidate-test") {
  const growthCatalog = loadPetGrowthCatalog();
  const newPetFactory = createNewPetFactory({growthCatalog});
  const randomProbe = deterministicRandomBytes(label);
  const expToNextLevel = (level) => 100 + (level * 25);
  const authority = createPetCaptureCandidateAuthority({
    growthCatalog,
    newPetFactory,
    templateResolver,
    expToNextLevel,
    randomBytes: randomProbe.randomBytes,
    legacyGrowthDocument: LEGACY_GROWTH_DOCUMENT,
  });
  return {authority, growthCatalog, randomProbe, expToNextLevel};
}

function wildActor({
  actorId = "wild_1",
  formId = "wuli_normal_orange_fire10",
  level = 20,
} = {}) {
  return {
    actorId,
    side: "enemy",
    kind: "wild_pet",
    formId,
    speciesId: formId,
    level,
    hp: 9000,
    maxHp: 9000,
    attack: 8000,
    defense: 7000,
    speed: 6000,
    activeSkillIds: ["forged_combat_skill"],
    passiveSkillIds: ["forged_combat_passive"],
    catchable: true,
    captured: false,
    defeated: false,
    schemaVersion: 1,
  };
}

function battleRoom(actors, overrides = {}) {
  return {
    roomId: overrides.roomId || "battle_room_capture_test",
    seed: overrides.seed || "public-room-seed-visible-to-clients",
    participantAccountIds: ["account_alpha", "account_beta"],
    battle: {
      phase: "command",
      actors: [
        {
          actorId: "player_alpha",
          accountId: "account_alpha",
          side: "ally",
          kind: "player",
          hp: 100,
          maxHp: 100,
        },
        ...actors,
      ],
    },
  };
}

function candidateFor(room, actorId = "wild_1") {
  return room.battle[PRIVATE_CANDIDATE_KEY][actorId];
}

function captureInput(actorId = "wild_1", accountId = "account_alpha", captureToolId = "capture_rope_basic") {
  return {actorId, accountId, captureToolId};
}

test("linked capture candidates start at Lv1 in the strict factory, settle once, and ignore combat actor stats", () => {
  const {authority, growthCatalog, expToNextLevel} = harness("linked");
  const actor = wildActor({formId: "blue_man_dragon_water10", level: 28});
  const room = battleRoom([actor]);
  const actorBefore = clone(room.battle.actors[1]);

  const prepared = authority.prepareRoom(room);

  assert.equal(prepared.ok, true);
  assert.equal(prepared.candidateCount, 1);
  assert.equal(prepared.reused, false);
  assert.equal(Object.hasOwn(room.battle, PRIVATE_CANDIDATE_KEY), false);
  assert.deepEqual(prepared.room.battle.actors[1], actorBefore);
  const candidate = candidateFor(prepared.room);
  assert.equal(candidate.growthKind, PROFILE_RESOLUTION_AUTHORITY_V1);
  assert.equal(candidate.encounterLevel, 28);
  assert.equal(candidate.pet.level, 28);
  assert.equal(candidate.pet.exp, 0);
  assert.equal(candidate.pet.nextExp, expToNextLevel(28));
  assert.equal(candidate.pet.hp, candidate.pet.maxHp);
  assert.notEqual(candidate.pet.maxHp, actor.maxHp);
  assert.notEqual(candidate.pet.attack, actor.attack);
  assert.notEqual(candidate.pet.defense, actor.defense);
  assert.notEqual(candidate.pet.quick, actor.speed);
  assert.equal(candidate.pet.petGrowth.settledLevel, 28);
  assert.equal(candidate.pet.petGrowth.public.level, 28);
  assert.equal(candidate.pet.petGrowth.public.levelOneFourV.maxHp, candidate.pet.initialStats.maxHp);
  assert.equal(
    validatePetGrowth(candidate.pet, growthCatalog.profileForFormId(candidate.formId)).ok,
    true,
  );
  assert.equal(Object.hasOwn(candidate.pet, "candidateId"), false);
  assert.equal(Object.hasOwn(candidate.pet, "captureSecret"), false);
  assert.notEqual(candidate.candidateId, candidate.pet.instanceId);
  assert.notEqual(candidate.captureSecret, candidate.pet.petGrowth.private.privateSeed);
});

test("unlinked capture candidates freeze Lv1 facts and settle wild levels with the shared legacy JSON model", () => {
  const {authority, expToNextLevel} = harness("legacy");
  const prepared = authority.prepareRoom(battleRoom([
    wildActor({formId: "rebirth_beast_earth_lv50", level: 23}),
  ]));

  assert.equal(prepared.ok, true);
  const candidate = candidateFor(prepared.room);
  const pet = candidate.pet;
  assert.equal(candidate.growthKind, PROFILE_RESOLUTION_LEGACY_UNLINKED);
  assert.equal(pet.level, 23);
  assert.equal(pet.exp, 0);
  assert.equal(pet.nextExp, expToNextLevel(23));
  assert.deepEqual(pet.growthSpeciesLevel1Stats, pet.initialStats);
  assert.deepEqual(pet.growthRecord.initialStats, pet.initialStats);
  assert.equal(pet.growthRecord.level, 23);
  assert.deepEqual(pet.growthRecord.finalStats, {
    maxHp: pet.maxHp,
    attack: pet.attack,
    defense: pet.defense,
    quick: pet.quick,
  });
  for (const key of ["maxHp", "attack", "defense", "quick"]) {
    const expectedGain = Math.round(Math.max(
      0,
      pet.growthRecord.growthRates[key] + pet.individualVariance.growthBonus[key],
    ) * 22);
    assert.equal(pet.growthRecord.statGains[key], expectedGain);
    assert.equal(pet[key], pet.initialStats[key] + expectedGain);
  }
  assert.equal(Object.hasOwn(pet, "petGrowth"), false);
  assert.equal(Object.hasOwn(pet, "candidateId"), false);
  assert.equal(Object.hasOwn(pet, "captureSecret"), false);
  assert.notEqual(candidate.captureSecret, pet.individualSeed);
});

test("ten same-form wild actors get ten unique private pets, secrets, and growth identities without actor mutation", () => {
  const {authority, randomProbe} = harness("ten-unique");
  const actors = Array.from({length: 10}, (_, index) => wildActor({
    actorId: `wild_${index + 1}`,
    formId: "wuli_normal_orange_fire10",
    level: 12,
  }));
  const room = battleRoom(actors);
  const actorsBefore = clone(room.battle.actors);

  const prepared = authority.prepareRoom(room);

  assert.equal(prepared.ok, true);
  assert.equal(prepared.candidateCount, 10);
  assert.deepEqual(prepared.room.battle.actors, actorsBefore);
  const candidates = Object.values(prepared.room.battle[PRIVATE_CANDIDATE_KEY]);
  assert.equal(new Set(candidates.map((entry) => entry.candidateId)).size, 10);
  assert.equal(new Set(candidates.map((entry) => entry.captureSecret)).size, 10);
  assert.equal(new Set(candidates.map((entry) => entry.pet.instanceId)).size, 10);
  assert.equal(new Set(candidates.map((entry) => entry.pet.petGrowth.private.privateSeed)).size, 10);
  assert.equal(randomProbe.callCount(), 30);

  const preparedAgain = authority.prepareRoom(prepared.room);
  assert.equal(preparedAgain.ok, true);
  assert.equal(preparedAgain.reused, true);
  assert.equal(randomProbe.callCount(), 30);
  assert.deepEqual(
    preparedAgain.room.battle[PRIVATE_CANDIDATE_KEY],
    prepared.room.battle[PRIVATE_CANDIDATE_KEY],
  );
});

test("only valid attempts advance the private deterministic roll counter and a failed capture does not replace its pet", () => {
  const {authority} = harness("attempts");
  const prepared = authority.prepareRoom(battleRoom([wildActor()]));
  assert.equal(prepared.ok, true);
  const frozenPet = clone(candidateFor(prepared.room).pet);

  const invalid = authority.captureRoll(
    prepared.room,
    captureInput("wild_1", "account_outsider", "capture_rope_basic"),
  );
  assert.equal(invalid.ok, false);
  assert.equal(candidateFor(prepared.room).attemptCount, 0);

  const first = authority.captureRoll(prepared.room, captureInput());
  assert.equal(first.ok, true);
  assert.equal(first.attemptNumber, 1);
  assert.equal(candidateFor(first.room).attemptCount, 1);
  assert.deepEqual(candidateFor(first.room).pet, frozenPet);

  // Treat the first roll as a failed capture: retaining first.room is the authoritative advance.
  const second = authority.captureRoll(first.room, captureInput());
  assert.equal(second.ok, true);
  assert.equal(second.attemptNumber, 2);
  assert.notEqual(second.roll, first.roll);
  assert.equal(candidateFor(second.room).attemptCount, 2);
  assert.deepEqual(candidateFor(second.room).pet, frozenPet);

  // Replaying the same immutable state is deterministic instead of drawing a fresh random value.
  const replay = authority.captureRoll(prepared.room, captureInput());
  assert.equal(replay.ok, true);
  assert.equal(replay.attemptNumber, 1);
  assert.equal(replay.roll, first.roll);
  assert.deepEqual(candidateFor(replay.room).pet, frozenPet);
});

test("capture rolls do not depend on the public room seed and validation never exposes private candidate state", () => {
  const {authority} = harness("private-roll");
  const prepared = authority.prepareRoom(battleRoom([wildActor()], {seed: "known-public-seed"}));
  assert.equal(prepared.ok, true);
  const changedPublicSeed = clone(prepared.room);
  changedPublicSeed.seed = "attacker-chosen-public-seed";

  const validation = authority.validateAttempt(prepared.room, captureInput());
  assert.equal(validation.ok, true);
  assert.equal(JSON.stringify(validation).includes("captureSecret"), false);
  assert.equal(JSON.stringify(validation).includes("individualSeed"), false);

  const originalRoll = authority.captureRoll(prepared.room, captureInput());
  const changedSeedRoll = authority.captureRoll(changedPublicSeed, captureInput());
  assert.equal(originalRoll.ok, true);
  assert.equal(changedSeedRoll.ok, true);
  assert.equal(changedSeedRoll.roll, originalRoll.roll);
  assert.equal(changedSeedRoll.attemptNumber, originalRoll.attemptNumber);
});

test("claim assigns one owner and materialize transfers the exact frozen pet without candidate secrets", () => {
  const {authority} = harness("claim");
  const prepared = authority.prepareRoom(battleRoom([
    wildActor({formId: "blue_man_dragon_water10", level: 31}),
  ]));
  const rolled = authority.captureRoll(prepared.room, captureInput());
  assert.equal(rolled.ok, true);

  const claimed = authority.claim(rolled.room, {actorId: "wild_1", accountId: "account_alpha"});
  assert.equal(claimed.ok, true);
  assert.equal(claimed.changed, true);
  assert.equal(claimed.ownerAccountId, "account_alpha");
  const candidate = candidateFor(claimed.room);
  assert.equal(candidate.status, "claimed");
  assert.equal(candidate.claimedByAccountId, "account_alpha");

  const conflictingClaim = authority.claim(claimed.room, {
    actorId: "wild_1",
    accountId: "account_beta",
  });
  assert.equal(conflictingClaim.ok, false);
  assert.equal(conflictingClaim.code, "pet_capture_candidate_claim_conflict");
  const repeatedClaim = authority.claim(claimed.room, {
    actorId: "wild_1",
    accountId: "account_alpha",
  });
  assert.equal(repeatedClaim.ok, true);
  assert.equal(repeatedClaim.changed, false);

  const frozenPet = clone(candidate.pet);
  const materialized = authority.materialize(claimed.room, {
    actorId: "wild_1",
    accountId: "account_alpha",
    state: "storage",
    capturedSerial: 17,
    captureStatusIds: ["poison"],
  });
  assert.equal(materialized.ok, true);
  const expected = clone(frozenPet);
  expected.state = "storage";
  expected.capturedSerial = 17;
  expected.capturedBattleRoomId = claimed.room.roomId;
  expected.capturedBattleActorId = "wild_1";
  expected.capturedByAccountId = "account_alpha";
  expected.captureToolId = "capture_rope_basic";
  expected.captureStatusIds = ["poison"];
  expected.captureAttemptNumber = 1;
  expected.isNew = true;
  assert.deepEqual(materialized.pet, expected);
  assert.equal(Object.hasOwn(materialized.pet, "candidateId"), false);
  assert.equal(Object.hasOwn(materialized.pet, "captureSecret"), false);
  assert.equal(Object.hasOwn(materialized.pet, "integrityTag"), false);
  assert.equal(
    materialized.pet.petGrowth.private.privateSeed,
    frozenPet.petGrowth.private.privateSeed,
  );
  const roomAfterEveryoneLeft = clone(claimed.room);
  roomAfterEveryoneLeft.participantAccountIds = [];
  const settledAfterEveryoneLeft = authority.materialize(roomAfterEveryoneLeft, {
    actorId: "wild_1",
    accountId: "account_alpha",
    state: "storage",
    capturedSerial: 17,
    captureStatusIds: ["poison"],
  });
  assert.equal(settledAfterEveryoneLeft.ok, true);
  assert.deepEqual(settledAfterEveryoneLeft.pet, expected);
});

test("prepared candidate corruption is rejected instead of silently regenerating or materializing", () => {
  const {authority, randomProbe} = harness("corruption");
  const prepared = authority.prepareRoom(battleRoom([wildActor()]));
  assert.equal(prepared.ok, true);
  const callCount = randomProbe.callCount();

  const combatOnlyMutation = clone(prepared.room);
  combatOnlyMutation.battle.actors[1].attack += 333;
  assert.equal(authority.validateAttempt(combatOnlyMutation, captureInput()).ok, true);

  const corruptedPet = clone(prepared.room);
  candidateFor(corruptedPet).pet.attack += 1;
  const retry = authority.prepareRoom(corruptedPet);
  assert.equal(retry.ok, false);
  assert.equal(retry.code, "pet_capture_candidate_state_invalid");
  assert.equal(randomProbe.callCount(), callCount);
  assert.equal(authority.validateAttempt(corruptedPet, captureInput()).ok, false);

  const rolled = authority.captureRoll(prepared.room, captureInput());
  const claimed = authority.claim(rolled.room, {actorId: "wild_1", accountId: "account_alpha"});
  const corruptedSecret = clone(claimed.room);
  candidateFor(corruptedSecret).captureSecret = "0".repeat(64);
  const materialized = authority.materialize(corruptedSecret, {
    actorId: "wild_1",
    accountId: "account_alpha",
    state: "standby",
    capturedSerial: 1,
  });
  assert.equal(materialized.ok, false);
  assert.equal(materialized.code, "pet_capture_candidate_state_invalid");
});

test("factory rejects permissive growth dependencies", () => {
  const growthCatalog = loadPetGrowthCatalog();
  const newPetFactory = createNewPetFactory({growthCatalog});
  assert.throws(() => createPetCaptureCandidateAuthority({
    growthCatalog: {resolveNewPetProfile() {}, profileForFormId() {}},
    newPetFactory,
    templateResolver,
    expToNextLevel: (level) => level * 100,
    legacyGrowthDocument: LEGACY_GROWTH_DOCUMENT,
  }), /strict frozen catalog/);
});
