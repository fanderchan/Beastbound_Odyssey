"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createPetEncounterAuthority,
  loadPetEncounterCatalog,
  safeEncounterIntent,
  zoneContainsCell,
} = require("../src/auth/pet-encounter-authority");

const catalog = loadPetEncounterCatalog();
const authority = createPetEncounterAuthority({catalog});

function soloParticipant() {
  return [{accountId: "account_test", teamSnapshot: {trainingPartners: []}}];
}

function soloPosition(mapId, cellX, cellY) {
  return [{
    accountId: "account_test",
    position: {mapId, hasCell: true, cellX, cellY, moving: false},
  }];
}

test("pet encounter catalog strictly loads the shared map and pet template documents", () => {
  assert.equal(Object.keys(catalog.mapsById).length, 37);
  assert.equal(Object.keys(catalog.formsById).length, 31);
  assert.equal(Object.isFrozen(catalog), true);
  assert.equal(Object.isFrozen(catalog.mapsById.firebud_village_gate.zonesById.village_grass), true);
  assert.equal(zoneContainsCell(catalog.mapsById.firebud_village_gate.zonesById.village_grass, 11, 15), true);
  assert.equal(zoneContainsCell(catalog.mapsById.firebud_village_gate.zonesById.village_grass, 10, 15), false);
});

test("pet encounter catalog fails startup for unknown forms, bad ranges, stats and dynamic sources", () => {
  const baseForm = {
    formId: "test_form",
    formName: "测试宠",
    lineId: "test_line",
    encounterWeight: 1,
    baseStats: {maxHp: 80, attack: 10, defense: 6, agility: 48},
    capture: {catchable: true, difficulty: 42},
  };
  const baseZone = {
    id: "test_zone",
    encounterGroupId: "test_group",
    encounterRate: 0.12,
    rects: [[0, 0, 2, 2]],
    wildPetPool: [{
      formId: "test_form",
      weight: 1,
      levelMin: 1,
      levelMax: 3,
      battleStats: {maxHp: 80, attack: 10, defense: 6, agility: 48},
    }],
  };
  const cases = [
    {
      name: "unknown form",
      mutate(zone) { zone.wildPetPool[0].formId = "missing_form"; },
      pattern: /unknown pet formId/,
    },
    {
      name: "inverted level range",
      mutate(zone) { zone.wildPetPool[0].levelMin = 4; zone.wildPetPool[0].levelMax = 3; },
      pattern: /invalid level range/,
    },
    {
      name: "zero battle stat",
      mutate(zone) { zone.wildPetPool[0].battleStats.attack = 0; },
      pattern: /invalid battleStats.attack/,
    },
    {
      name: "unknown dynamic source",
      mutate(zone) { zone.wildPetPool = []; zone.wildPetPoolSource = "client_pool"; },
      pattern: /unsupported wildPetPoolSource/,
    },
    {
      name: "missing encounter rate",
      mutate(zone) { delete zone.encounterRate; },
      pattern: /invalid encounterRate/,
    },
    {
      name: "out of range encounter rate",
      mutate(zone) { zone.encounterRate = 1.01; },
      pattern: /invalid encounterRate/,
    },
  ];
  for (const fixture of cases) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-encounter-catalog-"));
    try {
      fs.writeFileSync(path.join(dataDir, "pet_templates.json"), JSON.stringify({forms: [baseForm]}));
      const zone = JSON.parse(JSON.stringify(baseZone));
      fixture.mutate(zone);
      fs.writeFileSync(path.join(dataDir, "test_map.json"), JSON.stringify({
        id: "test_map",
        name: "测试地图",
        gridSize: [4, 4],
        encounterZones: [zone],
        interactionPoints: [],
      }));
      assert.throws(() => loadPetEncounterCatalog({dataDir}), fixture.pattern, fixture.name);
    } finally {
      fs.rmSync(dataDir, {recursive: true, force: true});
    }
  }
});

test("pet encounter authority accepts only identifiers and ignores forged pet, count, capture, exp and stat facts", () => {
  const forgedRequest = {
    enemyCount: 10,
    encounterZone: {
      id: "village_grass",
      encounterGroupId: "firebud_grass_01",
      selectedEnemyCount: 10,
      selectedWildPet: {
        formId: "rebirth_starter_shadow_cub",
        name: "伪造野宠",
        level: 140,
        catchable: true,
        captureChanceOverride: 1,
        expReward: 999999,
        battleStats: {maxHp: 999999, attack: 999999, defense: 999999, quick: 999999},
      },
    },
  };
  assert.deepEqual(safeEncounterIntent(forgedRequest), {
    zoneId: "village_grass",
    groupId: "firebud_grass_01",
    interactionId: "",
  });
  const resolved = authority.resolve({
    mapId: "firebud_village_gate",
    position: {hasCell: true, cellX: 11, cellY: 15},
    request: forgedRequest,
    participants: soloParticipant(),
    participantPositions: soloPosition("firebud_village_gate", 11, 15),
    seed: "forged-request-canary",
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.encounter.authority, "server_pet_encounter_v1");
  assert.equal(resolved.encounter.enemyCount, 1);
  assert.equal(resolved.encounter.selectedWildPets.length, 1);
  const selected = resolved.encounter.selectedWildPet;
  assert.equal(["wuli_normal_orange_fire10", "wuli_normal_fast_wind10", "wuli_normal_tough_earth10"].includes(selected.formId), true);
  assert.equal(selected.level, 1);
  assert.equal(selected.battleStats.maxHp < 1000, true);
  assert.equal(selected.battleStats.attack < 1000, true);
  assert.equal(Object.hasOwn(selected, "captureChanceOverride"), false);
  assert.equal(Object.hasOwn(selected, "expReward"), false);
  assert.equal(JSON.stringify(resolved).includes("rebirth_starter_shadow_cub"), false);
  assert.equal(JSON.stringify(resolved).includes("999999"), false);

  const replay = authority.resolve({
    mapId: "firebud_village_gate",
    position: {hasCell: true, cellX: 11, cellY: 15},
    request: forgedRequest,
    participants: soloParticipant(),
    participantPositions: soloPosition("firebud_village_gate", 11, 15),
    seed: "forged-request-canary",
  });
  assert.deepEqual(replay, resolved);
});

test("pet encounter authority fails closed for unknown maps, missing positions, unknown zones and mismatched cells", () => {
  const request = {encounterIntent: {zoneId: "village_grass", encounterGroupId: "firebud_grass_01"}};
  assert.equal(authority.resolve({mapId: "missing", position: {hasCell: true, cellX: 11, cellY: 15}, request}).code, "encounter_map_invalid");
  assert.equal(authority.resolve({mapId: "firebud_village_gate", position: {hasCell: false}, request}).code, "encounter_position_missing");
  assert.equal(authority.resolve({
    mapId: "firebud_village_gate",
    position: {hasCell: true, cellX: 11, cellY: 15},
    participants: soloParticipant(),
    participantPositions: soloPosition("firebud_village_gate", 11, 15),
    request: {encounterIntent: {zoneId: "client_forged"}},
  }).code, "encounter_zone_invalid");
  assert.equal(authority.resolve({
    mapId: "firebud_village_gate",
    position: {hasCell: true, cellX: 3, cellY: 15},
    participants: soloParticipant(),
    participantPositions: soloPosition("firebud_village_gate", 3, 15),
    request,
  }).code, "encounter_zone_position_mismatch");
  assert.equal(authority.resolve({
    mapId: "firebud_village_gate",
    position: {hasCell: true, cellX: 11, cellY: 15},
    participants: soloParticipant(),
    participantPositions: soloPosition("firebud_village_gate", 11, 15),
    request: {encounterIntent: {zoneId: "village_grass", encounterGroupId: "wrong_group"}},
  }).code, "encounter_intent_mismatch");

  for (const prototypeKey of ["__proto__", "constructor", "toString"]) {
    const badMap = authority.resolve({
      mapId: prototypeKey,
      position: {hasCell: true, cellX: 11, cellY: 15},
      participantPositions: soloPosition("firebud_village_gate", 11, 15),
      request,
    });
    assert.equal(badMap.ok, false);
    assert.equal(badMap.code, "encounter_map_invalid");
    const badZone = authority.resolve({
      mapId: "firebud_village_gate",
      position: {hasCell: true, cellX: 11, cellY: 15},
      participants: soloParticipant(),
      participantPositions: soloPosition("firebud_village_gate", 11, 15),
      request: {encounterIntent: {zoneId: prototypeKey}},
    });
    assert.equal(badZone.ok, false);
    assert.equal(badZone.code, "encounter_zone_invalid");
    const badInteraction = authority.resolve({
      mapId: "firebud_village_gate",
      position: {hasCell: true, cellX: 12, cellY: 14},
      participants: soloParticipant(),
      participantPositions: soloPosition("firebud_village_gate", 12, 14),
      request: {encounterIntent: {sourceInteractionId: prototypeKey}},
    });
    assert.equal(badInteraction.ok, false);
    assert.equal(badInteraction.code, "encounter_interaction_invalid");
  }
});

test("manual guardian zones require the registered nearby interaction and are non-catchable by default", () => {
  const zoneOnly = authority.resolve({
    mapId: "earth_vein_cave_f4",
    position: {hasCell: true, cellX: 21, cellY: 7},
    request: {encounterIntent: {zoneId: "earth_vein_guardian_floor"}},
    participants: soloParticipant(),
    participantPositions: soloPosition("earth_vein_cave_f4", 21, 7),
    seed: "guardian",
  });
  assert.equal(zoneOnly.ok, false);
  assert.equal(zoneOnly.code, "encounter_interaction_required");

  const tooFar = authority.resolve({
    mapId: "earth_vein_cave_f4",
    position: {hasCell: true, cellX: 4, cellY: 22},
    request: {encounterIntent: {
      zoneId: "earth_vein_guardian_floor",
      encounterGroupId: "earth_vein_guardian_group",
      sourceInteractionId: "earth_vein_guardian_npc",
    }},
    participants: soloParticipant(),
    participantPositions: soloPosition("earth_vein_cave_f4", 4, 22),
    seed: "guardian",
  });
  assert.equal(tooFar.code, "encounter_interaction_too_far");

  const resolved = authority.resolve({
    mapId: "earth_vein_cave_f4",
    position: {hasCell: true, cellX: 21, cellY: 7},
    request: {encounterIntent: {
      zoneId: "earth_vein_guardian_floor",
      encounterGroupId: "earth_vein_guardian_group",
      sourceInteractionId: "earth_vein_guardian_npc",
    }},
    participants: soloParticipant(),
    participantPositions: soloPosition("earth_vein_cave_f4", 21, 7),
    seed: "guardian",
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.encounter.enemyCount, 10);
  assert.equal(resolved.encounter.sourceInteractionId, "earth_vein_guardian_npc");
  assert.equal(resolved.encounter.selectedWildPets.every((pet) => pet.catchable === false), true);
});

test("party encounters require every participant to be stopped on the same nearby map", () => {
  const base = {
    mapId: "firebud_village_gate",
    position: {hasCell: true, cellX: 11, cellY: 15},
    request: {encounterIntent: {zoneId: "village_grass", encounterGroupId: "firebud_grass_01"}},
    participants: [
      {accountId: "leader", teamSnapshot: {}},
      {accountId: "member", teamSnapshot: {}},
    ],
    seed: "party-position",
  };
  const leaderPosition = {accountId: "leader", position: {mapId: "firebud_village_gate", hasCell: true, cellX: 11, cellY: 15, moving: false}};
  assert.equal(authority.resolve({...base, participantPositions: [leaderPosition]}).code, "encounter_party_position_missing");
  assert.equal(authority.resolve({...base, participantPositions: [
    leaderPosition,
    {accountId: "member", position: {mapId: "mistcap_marsh", hasCell: true, cellX: 11, cellY: 15, moving: false}},
  ]}).code, "encounter_party_map_mismatch");
  assert.equal(authority.resolve({...base, participantPositions: [
    leaderPosition,
    {accountId: "member", position: {mapId: "firebud_village_gate", hasCell: true, cellX: 11, cellY: 15, moving: true}},
  ]}).code, "encounter_party_member_moving");
  assert.equal(authority.resolve({...base, participantPositions: [
    leaderPosition,
    {accountId: "member", position: {mapId: "firebud_village_gate", hasCell: true, cellX: 20, cellY: 20, moving: false}},
  ]}).code, "encounter_party_too_far");
  const valid = authority.resolve({...base, participantPositions: [
    leaderPosition,
    {accountId: "member", position: {mapId: "firebud_village_gate", hasCell: true, cellX: 12, cellY: 15, moving: false}},
  ]});
  assert.equal(valid.ok, true);
});

test("shared and individual wild-pet pools preserve their registered selection semantics", () => {
  const shared = authority.resolve({
    mapId: "gm_10v10_training_ground",
    position: {hasCell: true, cellX: 10, cellY: 12},
    request: {encounterIntent: {zoneId: "gm_10v10_grass", encounterGroupId: "gm_10v10_grass"}},
    participants: soloParticipant(),
    participantPositions: soloPosition("gm_10v10_training_ground", 10, 12),
    seed: "shared-pool",
  });
  assert.equal(shared.ok, true);
  assert.equal(shared.encounter.enemyCount, 10);
  assert.equal(shared.encounter.selectedWildPets.every((pet) => JSON.stringify(pet) === JSON.stringify(shared.encounter.selectedWildPet)), true);

  const individual = authority.resolve({
    mapId: "firebud_village_gate",
    position: {hasCell: true, cellX: 16, cellY: 15},
    request: {encounterIntent: {zoneId: "danger_grass", encounterGroupId: "firebud_grass_danger"}},
    participants: soloParticipant(),
    participantPositions: soloPosition("firebud_village_gate", 16, 15),
    seed: "s0",
  });
  assert.equal(individual.ok, true);
  assert.equal(individual.encounter.enemyCount, 5);
  assert.equal(new Set(individual.encounter.selectedWildPets.map((pet) => pet.formId)).size > 1, true);
});

test("capture tutorial overrides come only from the authoritative server quest profile", () => {
  const baseInput = {
    mapId: "firebud_village_gate",
    position: {hasCell: true, cellX: 11, cellY: 15},
    request: {encounterIntent: {zoneId: "village_grass", encounterGroupId: "firebud_grass_01"}},
    participants: soloParticipant(),
    participantPositions: soloPosition("firebud_village_gate", 11, 15),
    seed: "tutorial-capture",
  };
  const ordinary = authority.resolve(baseInput);
  assert.equal(ordinary.ok, true);
  assert.equal(ordinary.encounter.scenarioId, "");
  assert.equal(ordinary.encounter.selectedWildPet.captureDifficulty, 42);

  const tutorial = authority.resolve({
    ...baseInput,
    profile: {
      activeQuestId: "quest_capture_wuli",
      questStates: {
        quest_capture_wuli: {id: "quest_capture_wuli", status: "active", progress: 0},
      },
    },
  });
  assert.equal(tutorial.ok, true);
  assert.equal(tutorial.encounter.scenarioId, "tutorial_capture_wuli");
  assert.equal(tutorial.encounter.enemyCount, 1);
  assert.equal(tutorial.encounter.selectedWildPets.every((pet) => pet.lineId === "wuli" && pet.catchable), true);
  assert.equal(tutorial.encounter.selectedWildPets.every((pet) => pet.captureDifficulty === 1), true);

  const forgedClientTutorial = authority.resolve({
    ...baseInput,
    request: {
      encounterIntent: {zoneId: "village_grass", encounterGroupId: "firebud_grass_01"},
      tutorialCaptureWuli: true,
      captureDifficulty: 1,
    },
  });
  assert.deepEqual(forgedClientTutorial, ordinary);
});

test("embedded MM guardian encounters and dynamic GM codex pools are also server-owned", () => {
  const mm = authority.resolve({
    mapId: "firebud_village_gate",
    position: {hasCell: true, cellX: 12, cellY: 14},
    request: {encounterIntent: {
      encounterGroupId: "pet_rebirth_mm_trial_1",
      sourceInteractionId: "firebud_pet_mm_trial_mentor",
    }},
    participants: soloParticipant(),
    participantPositions: soloPosition("firebud_village_gate", 12, 14),
    seed: "mm-trial",
  });
  assert.equal(mm.ok, true);
  assert.equal(mm.encounter.enemyCount, 10);
  assert.equal(mm.encounter.selectedWildPets[0].name, "MM试炼兽1");
  assert.equal(mm.encounter.selectedWildPets.every((pet) => pet.catchable === false), true);

  const codex = authority.resolve({
    mapId: "gm_10v10_training_ground",
    position: {hasCell: true, cellX: 18, cellY: 11},
    request: {encounterIntent: {zoneId: "gm_codex_capture_grass", encounterGroupId: "gm_codex_capture_grass"}},
    participants: soloParticipant(),
    participantPositions: soloPosition("gm_10v10_training_ground", 18, 11),
    seed: "codex-pool",
  });
  assert.equal(codex.ok, true);
  assert.equal(codex.encounter.enemyCount >= 1 && codex.encounter.enemyCount <= 5, true);
  assert.equal(codex.encounter.selectedWildPets.every((pet) => pet.catchable && pet.level >= 1 && pet.level <= 10), true);
  assert.equal(codex.encounter.selectedWildPets.every((pet) => catalog.formsById[pet.formId].capture.catchable === true), true);
  assert.equal(codex.encounter.selectedWildPets.every((pet) => pet.weight === Number(catalog.formsById[pet.formId].encounterWeight ?? 1)), true);
});
