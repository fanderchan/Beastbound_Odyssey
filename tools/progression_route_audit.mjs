#!/usr/bin/env node

import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {loadPetEncounterCatalog} = require("../server/node/src/auth/pet-encounter-authority");
const {loadBattleExpCatalog} = require("../server/node/src/auth/battle-exp-catalog");
const {loadProgressionRouteCatalog} = require("../server/node/src/auth/progression-route-catalog");

const encounterCatalog = loadPetEncounterCatalog();
const battleExpCatalog = loadBattleExpCatalog({dataDir: encounterCatalog.dataDir});
const routeCatalog = loadProgressionRouteCatalog({battleExpCatalog, encounterCatalog});
const report = {
  schemaVersion: 1,
  status: "ok",
  progressionId: routeCatalog.progressionId,
  battleExpFormulaId: battleExpCatalog.formulaId,
  maxLevel: routeCatalog.maxLevel,
  coverage: routeCatalog.coverage,
  routeEntryCount: routeCatalog.routeEntries.length,
  mapCount: new Set(routeCatalog.routeEntries.map((entry) => entry.mapId)).size,
  repeatableGroupCount: new Set(
    routeCatalog.routeEntries
      .filter((entry) => entry.contentType === "wild_training")
      .map((entry) => entry.encounterGroupId),
  ).size,
  lv1Placements: routeCatalog.routeEntries
    .filter((entry) => entry.contentType === "wild_training" && entry.lv1PerEnemyRate > 0)
    .map((entry) => ({
      progressionZoneId: entry.progressionZoneId,
      mapId: entry.mapId,
      encounterZoneId: entry.encounterZoneId,
      lv1PerEnemyRate: entry.lv1PerEnemyRate,
    })),
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`progression route audit: ${report.status}\n`);
  process.stdout.write(`progression=${report.progressionId} coverage=Lv1-${report.maxLevel} bands=${report.coverage.length}\n`);
  process.stdout.write(`entries=${report.routeEntryCount} maps=${report.mapCount} repeatable_groups=${report.repeatableGroupCount}\n`);
  for (const placement of report.lv1Placements) {
    process.stdout.write(`lv1 ${placement.mapId}/${placement.encounterZoneId} rate=${(placement.lv1PerEnemyRate * 100).toFixed(2)}%\n`);
  }
}
