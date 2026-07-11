"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MAX_LEVEL = 140;
const TRAINING_CONTENT_TYPE = "wild_training";
const QUALIFICATION_CONTENT_TYPE = "qualification_battle";

function loadProgressionRouteCatalog(options = {}) {
  const encounterCatalog = options.encounterCatalog;
  const battleExpCatalog = options.battleExpCatalog;
  if (!encounterCatalog || !encounterCatalog.mapsById || !encounterCatalog.dataDir) {
    throw new Error("progression route catalog requires the strict encounter catalog");
  }
  if (!battleExpCatalog || typeof battleExpCatalog.hasExplicitGroupMultiplier !== "function") {
    throw new Error("progression route catalog requires the strict battle EXP catalog");
  }
  const dataDir = path.resolve(options.dataDir || encounterCatalog.dataDir);
  const progressionDocument = readJson(path.join(dataDir, "balance", "progression_zones.json"));
  const regionDocument = readJson(path.join(dataDir, "map_regions.json"));
  const rewardDocument = readJson(path.join(dataDir, "battle_rewards.json"));
  const progression = activeProgression(progressionDocument);
  const regions = arrayOfObjects(regionDocument.regions);
  const regionsByMapId = indexRegionsByMapId(regions);
  const rewardTableIds = new Set(arrayOfObjects(rewardDocument.rewardTables).map((table) => text(table.id)).filter(Boolean));
  const errors = [];
  const routeEntries = [];
  const seenZoneIds = new Set();

  if (!progression) {
    errors.push("active progression does not exist");
  }
  for (const zone of arrayOfObjects(progression && progression.zones)) {
    const zoneId = text(zone.id);
    if (!zoneId) {
      errors.push("progression zone id is empty");
      continue;
    }
    if (seenZoneIds.has(zoneId)) {
      errors.push(`duplicate progression zone: ${zoneId}`);
      continue;
    }
    seenZoneIds.add(zoneId);
    const levelRange = strictLevelRange(zone.levelRange, `${zoneId}.levelRange`, errors);
    const contentType = text(zone.contentType);
    const mapIds = uniqueStrings(zone.mapIds);
    const encounterGroupId = text(zone.encounterGroupId);
    const expectedRewardTableId = text(zone.rewardTableId || encounterGroupId);
    if (!levelRange) {
      continue;
    }
    if (mapIds.length < 1) {
      errors.push(`${zoneId}.mapIds is empty`);
    }
    if (!encounterGroupId) {
      errors.push(`${zoneId}.encounterGroupId is empty`);
    }
    if (![TRAINING_CONTENT_TYPE, QUALIFICATION_CONTENT_TYPE].includes(contentType)) {
      errors.push(`${zoneId}.contentType is unsupported: ${contentType}`);
    }
    const matches = [];
    for (const mapId of mapIds) {
      const map = ownValue(encounterCatalog.mapsById, mapId);
      if (!map) {
        errors.push(`${zoneId} references unknown map: ${mapId}`);
        continue;
      }
      const mapRegions = ownValue(regionsByMapId, mapId) || [];
      if (mapRegions.length < 1) {
        errors.push(`${zoneId}/${mapId} is not registered in map_regions.json`);
      } else {
        const advertisingRegion = mapRegions.find((region) => uniqueStrings(region.encounterGroups).includes(encounterGroupId));
        if (!advertisingRegion) {
          errors.push(`${zoneId}/${mapId} group is not advertised by any containing region: ${encounterGroupId}`);
        }
        if (contentType === TRAINING_CONTENT_TYPE && mapRegions.every((region) => text(region.type) === "gm")) {
          errors.push(`${zoneId}/${mapId} uses a GM-only region for the formal route`);
        }
      }
      const mapMatches = Object.values(map.zonesById || {}).filter((encounterZone) => (
        text(encounterZone.encounterGroupId) === encounterGroupId
        && (contentType !== TRAINING_CONTENT_TYPE || !Boolean(encounterZone.manualOnly))
      ));
      if (contentType === TRAINING_CONTENT_TYPE && mapMatches.length < 1) {
        errors.push(`${zoneId}/${mapId} has no repeatable encounter group: ${encounterGroupId}`);
      }
      for (const encounterZone of mapMatches) {
        const rewardTableId = text(encounterZone.rewardTableId || encounterZone.encounterGroupId);
        if (!rewardTableIds.has(rewardTableId)) {
          errors.push(`${zoneId}/${mapId}/${text(encounterZone.id)} references unknown reward table: ${rewardTableId}`);
        }
        if (!battleExpCatalog.hasExplicitGroupMultiplier(rewardTableId)) {
          errors.push(`${zoneId}/${mapId}/${text(encounterZone.id)} reward table has no explicit EXP multiplier: ${rewardTableId}`);
        }
        if (rewardTableId !== expectedRewardTableId) {
          errors.push(`${zoneId}/${mapId}/${text(encounterZone.id)} reward table ${rewardTableId} does not match progression ${expectedRewardTableId}`);
        }
        const encounterLevelRanges = candidateLevelRanges(encounterZone);
        if (contentType === TRAINING_CONTENT_TYPE && !encounterLevelRanges.some((range) => rangesOverlap(range, levelRange))) {
          errors.push(`${zoneId}/${mapId}/${text(encounterZone.id)} has no enemy level overlapping Lv${levelRange[0]}-${levelRange[1]}`);
        }
        const lv1Rate = lv1PerEnemyRate(encounterZone);
        const entry = {
          progressionZoneId: zoneId,
          contentType,
          levelRange,
          mapId,
          encounterZoneId: text(encounterZone.id),
          encounterGroupId,
          rewardTableId,
          encounterLevelRanges,
          lv1PerEnemyRate: round6(lv1Rate),
          encounterRate: Number(encounterZone.encounterRate || 0),
        };
        matches.push(entry);
        routeEntries.push(entry);
      }
    }
    if (contentType === QUALIFICATION_CONTENT_TYPE && matches.length < 1) {
      errors.push(`${zoneId} has no qualification encounter matching ${encounterGroupId}`);
    }
  }

  const coverage = trainingCoverage(arrayOfObjects(progression && progression.zones));
  errors.push(...coverage.errors);
  if (errors.length > 0) {
    const failure = new Error(`invalid progression route catalog:\n- ${errors.join("\n- ")}`);
    failure.errors = errors.slice();
    throw failure;
  }
  return deepFreeze({
    schemaVersion: 1,
    progressionId: text(progression.id),
    maxLevel: MAX_LEVEL,
    coverage: coverage.ranges,
    trainingZones: arrayOfObjects(progression.zones)
      .filter((zone) => text(zone.contentType) === TRAINING_CONTENT_TYPE)
      .map((zone) => ({
        id: text(zone.id),
        label: text(zone.label || zone.id),
        levelRange: normalizedLevelRange(zone.levelRange),
        targetBattlesPerLevel: normalizedLevelRange(zone.targetBattlesPerLevel),
      })),
    routeEntries,
  });
}

function activeProgression(document) {
  const activeId = text(document && document.activeProgressionId);
  return arrayOfObjects(document && document.progressions).find((value) => text(value.id) === activeId) || null;
}

function trainingCoverage(zones) {
  const errors = [];
  const ranges = zones
    .filter((zone) => text(zone.contentType) === TRAINING_CONTENT_TYPE)
    .map((zone) => ({id: text(zone.id), range: normalizedLevelRange(zone.levelRange)}))
    .filter((entry) => entry.range)
    .sort((left, right) => left.range[0] - right.range[0] || left.range[1] - right.range[1]);
  if (ranges.length < 1) {
    return {errors: ["formal training route is empty"], ranges: []};
  }
  let coveredMax = 0;
  for (const entry of ranges) {
    const [min, max] = entry.range;
    if (min > coveredMax + 1) {
      errors.push(`formal training route has a gap at Lv${coveredMax + 1}-${min - 1} before ${entry.id}`);
    }
    coveredMax = Math.max(coveredMax, max);
  }
  if (ranges[0].range[0] !== 1) {
    errors.push(`formal training route starts at Lv${ranges[0].range[0]}, expected Lv1`);
  }
  if (coveredMax < MAX_LEVEL) {
    errors.push(`formal training route stops at Lv${coveredMax}, expected Lv${MAX_LEVEL}`);
  }
  return {
    errors,
    ranges: ranges.map((entry) => ({id: entry.id, levelRange: entry.range})),
  };
}

function indexRegionsByMapId(regions) {
  const result = Object.create(null);
  for (const region of regions) {
    for (const mapId of uniqueStrings(region.mapIds)) {
      if (!Object.hasOwn(result, mapId)) {
        result[mapId] = [];
      }
      result[mapId].push(region);
    }
  }
  return result;
}

function candidateLevelRanges(encounterZone) {
  return [...arrayOfObjects(encounterZone.wildPetPool), ...arrayOfObjects(encounterZone.fixedWildPets)]
    .map((entry) => normalizedLevelRange([
      entry.levelMin ?? entry.level,
      entry.levelMax ?? entry.level,
    ]))
    .filter(Boolean);
}

function lv1PerEnemyRate(encounterZone) {
  const pool = arrayOfObjects(encounterZone.wildPetPool);
  const totalWeight = pool.reduce((sum, entry) => sum + positiveWeight(entry.weight), 0);
  if (totalWeight <= 0) {
    return 0;
  }
  let probability = 0;
  for (const entry of pool) {
    const range = normalizedLevelRange([entry.levelMin ?? entry.level, entry.levelMax ?? entry.level]);
    if (!range || range[0] > 1 || range[1] < 1) {
      continue;
    }
    probability += (positiveWeight(entry.weight) / totalWeight) * (1 / (range[1] - range[0] + 1));
  }
  return probability;
}

function strictLevelRange(value, label, errors) {
  const range = normalizedLevelRange(value);
  if (!range || range[0] < 1 || range[1] > MAX_LEVEL) {
    errors.push(`${label} is invalid`);
    return null;
  }
  return range;
}

function normalizedLevelRange(value) {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }
  const min = Number(value[0]);
  const max = Number(value[1]);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    return null;
  }
  return [min, max];
}

function rangesOverlap(left, right) {
  return left[0] <= right[1] && right[0] <= left[1];
}

function readJson(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`JSON document must be an object: ${filePath}`);
  }
  return parsed;
}

function arrayOfObjects(value) {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)) : [];
}

function uniqueStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))];
}

function positiveWeight(value) {
  const number = value === undefined ? 1 : Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function text(value) {
  return String(value || "").trim();
}

function ownValue(object, key) {
  return object && Object.hasOwn(object, key) ? object[key] : undefined;
}

function round6(value) {
  return Math.round(Number(value || 0) * 1e6) / 1e6;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

module.exports = {
  loadProgressionRouteCatalog,
  trainingCoverage,
  lv1PerEnemyRate,
};
