"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {loadPetEncounterCatalog, createPetEncounterAuthority} = require("../src/auth/pet-encounter-authority");
const {loadBattleExpCatalog} = require("../src/auth/battle-exp-catalog");
const {
  loadProgressionRouteCatalog,
  trainingCoverage,
  lv1PerEnemyRate,
} = require("../src/auth/progression-route-catalog");

const encounterCatalog = loadPetEncounterCatalog();
const battleExpCatalog = loadBattleExpCatalog({dataDir: encounterCatalog.dataDir});
const routeCatalog = loadProgressionRouteCatalog({battleExpCatalog, encounterCatalog});

test("formal progression route resolves real maps and repeatable encounter groups from Lv1 through Lv140", () => {
  assert.equal(routeCatalog.progressionId, "progression_v1");
  assert.equal(routeCatalog.coverage[0].levelRange[0], 1);
  assert.equal(routeCatalog.coverage.at(-1).levelRange[1], 140);
  assert.equal(routeCatalog.coverage.length, 12);
  assert.equal(routeCatalog.routeEntries.length, 23);
  assert.equal(Object.isFrozen(routeCatalog), true);

  const routeKeys = new Set(routeCatalog.routeEntries.map((entry) => (
    `${entry.progressionZoneId}/${entry.mapId}/${entry.encounterGroupId}`
  )));
  for (const key of [
    "mistcap_growth/mistcap_marsh/mistcap_reeds_01",
    "forest_rebirth_prep/earth_vein_cave/rebirth_prep_training_01",
    "post_rebirth_plateau/tide_echo_cave_f2/post_rebirth_training_01",
    "four_cave_high/gale_breath_cave_f3/high_cave_training_01",
    "shadow_chase/shadow_oath_cavern_f4/shadow_chase_training_01",
    "shadow_capstone/shadow_oath_cavern_f5/shadow_capstone_training_01",
  ]) {
    assert.equal(routeKeys.has(key), true, key);
  }
  const mistcap = routeCatalog.routeEntries.find((entry) => entry.progressionZoneId === "mistcap_growth");
  const windglass = routeCatalog.routeEntries.find((entry) => entry.progressionZoneId === "windglass_growth");
  assert.equal(mistcap.rewardTableId, "growth_training_01");
  assert.equal(windglass.rewardTableId, "rebirth_prep_training_01");
});

test("new cave and shadow training pools reserve one percent per-enemy probability for Lv1 cultivation candidates", () => {
  const targetEntries = routeCatalog.routeEntries.filter((entry) => [
    "forest_rebirth_prep",
    "post_rebirth_plateau",
    "four_cave_high",
    "shadow_chase",
    "shadow_capstone",
  ].includes(entry.progressionZoneId));
  assert.equal(targetEntries.length, 14);
  for (const entry of targetEntries) {
    assert.equal(entry.lv1PerEnemyRate, 0.01, `${entry.mapId}/${entry.encounterZoneId}`);
  }

  const shadowZone = encounterCatalog.mapsById.shadow_oath_cavern_f4.zonesById.shadow_chase_training_floor;
  assert.equal(lv1PerEnemyRate(shadowZone), 0.01);
  assert.equal(shadowZone.wildPetPool.filter((entry) => Number(entry.levelMin) === 1).length, 4);
});

test("coverage audit rejects empty and gapped formal leveling routes", () => {
  assert.deepEqual(trainingCoverage([]).errors, ["formal training route is empty"]);
  const report = trainingCoverage([
    {id: "start", contentType: "wild_training", levelRange: [1, 20]},
    {id: "gap", contentType: "wild_training", levelRange: [22, 140]},
  ]);
  assert.deepEqual(report.errors, ["formal training route has a gap at Lv21-21 before gap"]);
});

test("normal encounter authority startup includes the validated progression route catalog", () => {
  const authority = createPetEncounterAuthority({catalog: encounterCatalog});
  assert.equal(authority.progressionRoutes.progressionId, "progression_v1");
  assert.equal(authority.progressionRoutes.coverage.at(-1).levelRange[1], 140);

  const earlyAlias = authority.resolve({
    mapId: "mistcap_marsh",
    position: {hasCell: true, cellX: 10, cellY: 15},
    request: {encounterIntent: {zoneId: "mistcap_reeds_01", encounterGroupId: "mistcap_reeds_01"}},
    participants: [{accountId: "route_player", teamSnapshot: {trainingPartners: []}}],
    participantPositions: [{
      accountId: "route_player",
      position: {mapId: "mistcap_marsh", hasCell: true, cellX: 10, cellY: 15, moving: false},
    }],
    seed: "route-reward-alias",
  });
  assert.equal(earlyAlias.ok, true);
  assert.equal(earlyAlias.encounter.groupId, "mistcap_reeds_01");
  assert.equal(earlyAlias.encounter.rewardTableId, "growth_training_01");

  const request = {encounterIntent: {
    zoneId: "shadow_chase_training_floor",
    encounterGroupId: "shadow_chase_training_01",
  }};
  const participants = [{accountId: "route_player", teamSnapshot: {trainingPartners: []}}];
  const participantPositions = [{
    accountId: "route_player",
    position: {mapId: "shadow_oath_cavern_f4", hasCell: true, cellX: 10, cellY: 12, moving: false},
  }];
  let rareEncounter = null;
  for (let index = 0; index < 2000 && !rareEncounter; index += 1) {
    const resolved = authority.resolve({
      mapId: "shadow_oath_cavern_f4",
      position: {hasCell: true, cellX: 10, cellY: 12},
      request,
      participants,
      participantPositions,
      seed: `route-lv1-${index}`,
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.encounter.groupId, "shadow_chase_training_01");
    assert.equal([1, ...Array.from({length: 13}, (_, offset) => 120 + offset)].includes(resolved.encounter.selectedWildPet.level), true);
    if (resolved.encounter.selectedWildPet.level === 1) {
      rareEncounter = resolved.encounter;
    }
  }
  assert.notEqual(rareEncounter, null, "server-owned selection must be able to reach the registered rare Lv1 entries");
  assert.equal(rareEncounter.selectedWildPet.level, 1);
});
