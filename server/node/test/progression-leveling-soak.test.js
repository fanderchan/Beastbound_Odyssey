"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {createAuthService, createMemoryAuthStore} = require("../src/auth-service");
const {createPetEncounterAuthority} = require("../src/auth/pet-encounter-authority");
const {loadPlayerLevelRuntime} = require("../src/auth/player-level-runtime");
const {runProgressionLevelingSoak, routeForLevel} = require("../src/auth/progression-leveling-soak");

test("isolated new-account leveling soak reaches Lv140 through authoritative routes within every target band", () => {
  const encounterAuthority = createPetEncounterAuthority();
  const playerLevelRuntime = loadPlayerLevelRuntime({dataDir: encounterAuthority.catalog.dataDir});
  const service = createAuthService({store: createMemoryAuthStore()});
  const account = service.register({username: "soaknewaccount", password: "test1234", displayName: "练级隔离号"});
  const startingProfile = service.getProfile(account.session.token).profile;
  assert.equal(startingProfile.player.level, 1);
  assert.equal(startingProfile.player.exp, 0);
  const report = runProgressionLevelingSoak({
    encounterAuthority,
    playerLevelRuntime,
    seed: "p0_3_leveling_soak_test",
    startingPlayer: startingProfile.player,
  });
  assert.equal(report.status, "ok");
  assert.equal(report.finalLevel, 140);
  assert.equal(report.checkedLevelCount, 139);
  assert.deepEqual(report.outOfTargetStages, []);
  assert.equal(report.totalBattles > 1000, true);
  assert.equal(report.rareLv1Encounters > 0, true);
  assert.equal(report.checkpoints.some((entry) => entry.level >= 80), true);
  assert.equal(report.checkpoints.at(-1).level, 140);
});

test("route selection advances to the newest matching band at shared boundaries", () => {
  const entries = [
    {progressionZoneId: "old", levelRange: [1, 10]},
    {progressionZoneId: "new", levelRange: [10, 20]},
  ];
  assert.equal(routeForLevel(entries, 9).progressionZoneId, "old");
  assert.equal(routeForLevel(entries, 10).progressionZoneId, "new");
  assert.throws(() => routeForLevel(entries, 21), /no training entry/);
});
