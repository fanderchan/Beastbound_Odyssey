#!/usr/bin/env node

import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {createAuthService, createMemoryAuthStore} = require("../server/node/src/auth-service");
const {createPetEncounterAuthority} = require("../server/node/src/auth/pet-encounter-authority");
const {loadPlayerLevelRuntime} = require("../server/node/src/auth/player-level-runtime");
const {runProgressionLevelingSoak} = require("../server/node/src/auth/progression-leveling-soak");

const seedArgIndex = process.argv.indexOf("--seed");
const seed = seedArgIndex >= 0 ? String(process.argv[seedArgIndex + 1] || "") : "p0_3_leveling_soak_v1";
const encounterAuthority = createPetEncounterAuthority();
const playerLevelRuntime = loadPlayerLevelRuntime({dataDir: encounterAuthority.catalog.dataDir});
const isolatedService = createAuthService({store: createMemoryAuthStore()});
const isolatedAccount = isolatedService.register({
  username: "levelingsoak",
  password: "isolated1234",
  displayName: "隔离练级验证",
});
if (!isolatedAccount.ok) {
  throw new Error(`isolated account creation failed: ${String(isolatedAccount.code || "unknown")}`);
}
const startingProfile = isolatedService.getProfile(isolatedAccount.session.token).profile;
const report = runProgressionLevelingSoak({
  encounterAuthority,
  playerLevelRuntime,
  seed,
  startingPlayer: startingProfile.player,
});

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`progression leveling soak: ${report.status}\n`);
  process.stdout.write(`formula=${report.battleExpFormulaId} curve=${report.levelCurveId} seed=${report.seed}\n`);
  process.stdout.write(`Lv${report.startLevel}->Lv${report.finalLevel} battles=${report.totalBattles} rare_lv1=${report.rareLv1Encounters} out_of_target_stages=${report.outOfTargetStages.length} level_outliers=${report.levelOutlierCount}\n`);
  for (const checkpoint of report.checkpoints) {
    process.stdout.write(`checkpoint Lv${checkpoint.level} battles=${checkpoint.totalBattles} remaining_exp=${checkpoint.remainingExp}\n`);
  }
  for (const stage of report.stages) {
    process.stdout.write(`stage ${stage.progressionZoneId} Lv${stage.levelMin}-${stage.levelMax} avg_battles=${stage.avgBattlesPerLevel} target=${stage.targetBattlesPerLevel.join("-")} rare_lv1=${stage.rareLv1Encounters}\n`);
  }
}
process.exitCode = report.status === "ok" ? 0 : 1;
