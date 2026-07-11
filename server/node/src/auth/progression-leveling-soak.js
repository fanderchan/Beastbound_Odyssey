"use strict";

function runProgressionLevelingSoak(options = {}) {
  const encounterAuthority = options.encounterAuthority;
  const playerLevelRuntime = options.playerLevelRuntime;
  if (!encounterAuthority || typeof encounterAuthority.resolve !== "function" || !encounterAuthority.progressionRoutes) {
    throw new Error("progression leveling soak requires the authoritative encounter service");
  }
  if (!playerLevelRuntime || typeof playerLevelRuntime.awardEntry !== "function") {
    throw new Error("progression leveling soak requires the authoritative player level runtime");
  }
  const routeCatalog = encounterAuthority.progressionRoutes;
  const trainingEntries = routeCatalog.routeEntries.filter((entry) => entry.contentType === "wild_training");
  const trainingZones = new Map(routeCatalog.trainingZones.map((zone) => [zone.id, zone]));
  const seed = String(options.seed || "p0_3_leveling_soak_v1");
  const maxBattlesPerLevel = Math.max(1, Math.trunc(Number(options.maxBattlesPerLevel || 1000)));
  const startingPlayer = options.startingPlayer && typeof options.startingPlayer === "object" && !Array.isArray(options.startingPlayer)
    ? options.startingPlayer
    : {level: 1, exp: 0};
  if (Number(startingPlayer.level || 1) !== 1 || Number(startingPlayer.exp || 0) !== 0) {
    throw new Error("progression leveling soak requires a fresh Lv1 zero-EXP account profile");
  }
  const player = {
    level: 1,
    exp: 0,
    nextExp: playerLevelRuntime.expToNextLevel(1),
  };
  const levelRows = [];
  const checkpointLevels = new Set([10, 20, 24, 35, 45, 55, 65, 80, 100, 120, 132, 140]);
  const checkpoints = [];
  let totalBattles = 0;
  let totalLv1Encounters = 0;
  let rareLv1Encounters = 0;

  while (player.level < playerLevelRuntime.maxPlayerLevel) {
    const startLevel = player.level;
    const route = routeForLevel(trainingEntries, startLevel);
    const zone = trainingZones.get(route.progressionZoneId);
    if (!zone) {
      throw new Error(`missing training zone facts for ${route.progressionZoneId}`);
    }
    const rowsForZone = trainingEntries.filter((entry) => entry.progressionZoneId === route.progressionZoneId);
    let battles = 0;
    let awardTotal = 0;
    let minAward = Infinity;
    let maxAward = 0;
    let lv1Encounters = 0;
    let rareLevelOneEncounters = 0;
    const usedMaps = new Set();
    while (player.level === startLevel) {
      battles += 1;
      totalBattles += 1;
      if (battles > maxBattlesPerLevel) {
        throw new Error(`leveling soak exceeded ${maxBattlesPerLevel} battles at Lv${startLevel}`);
      }
      const routeEntry = rowsForZone[(totalBattles - 1) % rowsForZone.length];
      const map = encounterAuthority.catalog.mapsById[routeEntry.mapId];
      const encounterZone = map && map.zonesById[routeEntry.encounterZoneId];
      const cell = firstEncounterCell(encounterZone);
      const accountId = "isolated_new_account";
      const resolved = encounterAuthority.resolve({
        mapId: routeEntry.mapId,
        position: {hasCell: true, cellX: cell[0], cellY: cell[1]},
        request: {encounterIntent: {
          zoneId: routeEntry.encounterZoneId,
          encounterGroupId: routeEntry.encounterGroupId,
        }},
        participants: [{accountId, teamSnapshot: {trainingPartners: []}}],
        participantPositions: [{
          accountId,
          position: {mapId: routeEntry.mapId, hasCell: true, cellX: cell[0], cellY: cell[1], moving: false},
        }],
        seed: `${seed}:level:${startLevel}:battle:${battles}:total:${totalBattles}`,
      });
      if (!resolved.ok) {
        throw new Error(`authoritative encounter failed at Lv${startLevel}: ${String(resolved.code || "unknown")}`);
      }
      const wildPets = Array.isArray(resolved.encounter.selectedWildPets) ? resolved.encounter.selectedWildPets : [];
      let battleAward = 0;
      for (const wildPet of wildPets) {
        const base = Math.max(1, Math.trunc(Number(wildPet.expReward || 0)));
        battleAward += encounterAuthority.battleExpCatalog.scaledForRecipientLevel(base, startLevel, wildPet.level);
        if (Number(wildPet.level) === 1) {
          lv1Encounters += 1;
          totalLv1Encounters += 1;
          if (routeEntry.lv1PerEnemyRate > 0 && routeEntry.lv1PerEnemyRate < 1) {
            rareLevelOneEncounters += 1;
            rareLv1Encounters += 1;
          }
        }
      }
      if (battleAward <= 0) {
        throw new Error(`authoritative encounter produced no EXP at Lv${startLevel}`);
      }
      const awarded = playerLevelRuntime.awardEntry(player, battleAward);
      player.level = awarded.level;
      player.exp = awarded.exp;
      player.nextExp = awarded.nextExp;
      awardTotal += battleAward;
      minAward = Math.min(minAward, battleAward);
      maxAward = Math.max(maxAward, battleAward);
      usedMaps.add(routeEntry.mapId);
    }
    const targetRange = zone.targetBattlesPerLevel;
    const withinTarget = Array.isArray(targetRange)
      && battles >= targetRange[0]
      && battles <= targetRange[1];
    const row = {
      level: startLevel,
      reachedLevel: player.level,
      progressionZoneId: route.progressionZoneId,
      targetBattlesPerLevel: targetRange,
      battles,
      withinTarget,
      avgExpPerBattle: Math.round(awardTotal / battles),
      minExpPerBattle: minAward,
      maxExpPerBattle: maxAward,
      lv1Encounters,
      rareLv1Encounters: rareLevelOneEncounters,
      mapIds: [...usedMaps].sort(),
    };
    levelRows.push(row);
    if (checkpointLevels.has(player.level) || [...checkpointLevels].some((level) => startLevel < level && player.level >= level)) {
      checkpoints.push({level: player.level, totalBattles, remainingExp: player.exp});
    }
  }

  const stages = stageRows(levelRows, trainingZones);
  const outOfTargetStages = stages.filter((row) => !row.withinTarget);
  const levelOutliers = levelRows.filter((row) => !row.withinTarget);
  return {
    schemaVersion: 1,
    status: outOfTargetStages.length === 0 && player.level === playerLevelRuntime.maxPlayerLevel ? "ok" : "failed",
    seed,
    battleExpFormulaId: encounterAuthority.battleExpCatalog.formulaId,
    levelCurveId: playerLevelRuntime.curveId,
    startLevel: 1,
    finalLevel: player.level,
    finalExp: player.exp,
    totalBattles,
    totalLv1Encounters,
    rareLv1Encounters,
    checkedLevelCount: levelRows.length,
    outOfTargetStages: outOfTargetStages.map((row) => ({
      progressionZoneId: row.progressionZoneId,
      avgBattlesPerLevel: row.avgBattlesPerLevel,
      target: row.targetBattlesPerLevel,
    })),
    levelOutlierCount: levelOutliers.length,
    checkpoints,
    stages,
    levels: levelRows,
  };
}

function stageRows(levelRows, trainingZones) {
  const grouped = new Map();
  for (const row of levelRows) {
    const current = grouped.get(row.progressionZoneId) || {
      progressionZoneId: row.progressionZoneId,
      levelMin: row.level,
      levelMax: row.level,
      levelCount: 0,
      totalBattles: 0,
      totalLv1Encounters: 0,
      rareLv1Encounters: 0,
    };
    current.levelMin = Math.min(current.levelMin, row.level);
    current.levelMax = Math.max(current.levelMax, row.level);
    current.levelCount += 1;
    current.totalBattles += row.battles;
    current.totalLv1Encounters += row.lv1Encounters;
    current.rareLv1Encounters += row.rareLv1Encounters;
    grouped.set(row.progressionZoneId, current);
  }
  return [...grouped.values()].map((row) => {
    const zone = trainingZones.get(row.progressionZoneId);
    const target = zone && zone.targetBattlesPerLevel;
    const average = Math.round((row.totalBattles / Math.max(1, row.levelCount)) * 100) / 100;
    return {
      ...row,
      targetBattlesPerLevel: target,
      avgBattlesPerLevel: average,
      withinTarget: Array.isArray(target) && average >= target[0] && average <= target[1],
    };
  });
}

function routeForLevel(entries, level) {
  const eligible = entries
    .filter((entry) => entry.levelRange[0] <= level && entry.levelRange[1] >= level)
    .sort((left, right) => right.levelRange[0] - left.levelRange[0] || left.levelRange[1] - right.levelRange[1]);
  if (eligible.length < 1) {
    throw new Error(`formal route has no training entry for Lv${level}`);
  }
  return eligible[0];
}

function firstEncounterCell(zone) {
  const rect = Array.isArray(zone && zone.rects) ? zone.rects[0] : null;
  if (Array.isArray(rect) && rect.length >= 4) {
    return [Math.trunc(Number(rect[0])), Math.trunc(Number(rect[1]))];
  }
  const cell = Array.isArray(zone && zone.cells) ? zone.cells[0] : null;
  if (Array.isArray(cell) && cell.length >= 2) {
    return [Math.trunc(Number(cell[0])), Math.trunc(Number(cell[1]))];
  }
  throw new Error(`encounter zone has no usable geometry: ${String(zone && zone.id || "")}`);
}

module.exports = {runProgressionLevelingSoak, routeForLevel, stageRows};
