"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {loadBattleExpCatalog} = require("./battle-exp-catalog");
const {loadProgressionRouteCatalog} = require("./progression-route-catalog");

const MAX_ENEMY_COUNT = 10;
const MAX_PET_LEVEL = 140;
const DEFAULT_CAPTURE_DIFFICULTY = 42;
const DEFAULT_INTERACTION_DISTANCE = 3;
const DEFAULT_PARTY_DISTANCE = 4;
const CODEX_CATCHABLE_POOL_SOURCE = "codex_catchable";

function createPetEncounterAuthority(options = {}) {
  const catalog = options.catalog || loadPetEncounterCatalog(options);
  const battleExpCatalog = options.battleExpCatalog || loadBattleExpCatalog({dataDir: catalog.dataDir});
  const progressionRoutes = options.progressionRoutes || loadProgressionRouteCatalog({
    battleExpCatalog,
    dataDir: catalog.dataDir,
    encounterCatalog: catalog,
  });
  const interactionDistance = clampInt(
    options.interactionDistance,
    0,
    12,
    DEFAULT_INTERACTION_DISTANCE,
  );
  const partyDistance = clampInt(options.partyDistance, 0, 12, DEFAULT_PARTY_DISTANCE);

  function resolve(input = {}) {
    try {
      const mapId = String(input.mapId || "").trim();
      const map = ownValue(catalog.mapsById, mapId);
      if (!map) {
        return failure("encounter_map_invalid", "当前地图没有可用的服务端遇敌配置。");
      }
      const position = normalizedPosition(input.position);
      if (!position.hasCell) {
        return failure("encounter_position_missing", "遇敌前需要先同步当前位置。");
      }
      const partyPositionCheck = validatePartyEncounterPositions(
        input.participantPositions,
        input.participants,
        mapId,
        position,
        partyDistance,
      );
      if (!partyPositionCheck.ok) {
        return partyPositionCheck;
      }
      const intent = safeEncounterIntent(input.request);
      const resolvedSource = resolveEncounterSource(map, intent);
      if (!resolvedSource.ok) {
        return resolvedSource;
      }
      const source = resolvedSource.source;
      if (source.interaction) {
        if (!positionNearInteraction(position, source.interaction, interactionDistance)) {
          return failure("encounter_interaction_too_far", "距离挑战目标太远，无法开始战斗。");
        }
      } else {
        if (Boolean(source.zone.manualOnly)) {
          return failure("encounter_interaction_required", "这个挑战只能通过对应目标发起。");
        }
        if (!zoneContainsCell(source.zone, position.cellX, position.cellY)) {
          return failure("encounter_zone_position_mismatch", "当前位置不在该遇敌区域内。");
        }
      }
      return {
        ok: true,
        encounter: buildAuthoritativeEncounter({
          catalog,
          battleExpCatalog,
          map,
          source,
          seed: String(input.seed || ""),
          scenario: authoritativeEncounterScenario(input.profile, map, source),
          participantCharacterCount: partyEncounterCharacterCount(input.participants),
        }),
      };
    } catch {
      return failure("encounter_catalog_invalid", "服务端遇敌配置暂不可用，请稍后重试。");
    }
  }

  return Object.freeze({battleExpCatalog, catalog, progressionRoutes, resolve});
}

function loadPetEncounterCatalog(options = {}) {
  const dataDir = path.resolve(
    options.dataDir || path.resolve(__dirname, "../../../..", "client/godot/data"),
  );
  const petTemplatePath = path.join(dataDir, "pet_templates.json");
  const petTemplateDocument = readJsonDocument(petTemplatePath);
  const formsById = Object.create(null);
  for (const form of arrayOfObjects(petTemplateDocument.forms)) {
    const formId = requiredIdentifier(form.formId, `pet template formId in ${petTemplatePath}`);
    if (Object.hasOwn(formsById, formId)) {
      throw new Error(`duplicate pet formId: ${formId}`);
    }
    const capture = objectOrEmpty(form.capture);
    if (capture.catchable !== undefined && typeof capture.catchable !== "boolean") {
      throw new Error(`pet form ${formId} has invalid capture.catchable`);
    }
    if (capture.catchable !== false) {
      const encounterWeight = Number(form.encounterWeight ?? 1);
      if (!Number.isFinite(encounterWeight) || encounterWeight < 0) {
        throw new Error(`pet form ${formId} has invalid encounterWeight`);
      }
      const stats = objectOrEmpty(form.baseStats);
      for (const key of ["maxHp", "attack", "defense", "agility"]) {
        if (!Number.isFinite(Number(stats[key])) || Number(stats[key]) <= 0) {
          throw new Error(`catchable pet form ${formId} has invalid baseStats.${key}`);
        }
      }
      if (!Number.isInteger(Number(capture.difficulty)) || Number(capture.difficulty) < 1 || Number(capture.difficulty) > 100) {
        throw new Error(`catchable pet form ${formId} has invalid capture.difficulty`);
      }
    }
    formsById[formId] = deepFreeze(clone(form));
  }
  if (Object.keys(formsById).length < 1) {
    throw new Error("pet encounter catalog requires at least one pet form");
  }

  const mapsById = Object.create(null);
  const fileNames = fs.readdirSync(dataDir).filter((fileName) => fileName.endsWith("_map.json")).sort();
  for (const fileName of fileNames) {
    const filePath = path.join(dataDir, fileName);
    const document = readJsonDocument(filePath);
    const mapId = requiredIdentifier(document.id, `map id in ${filePath}`);
    if (Object.hasOwn(mapsById, mapId)) {
      throw new Error(`duplicate map id: ${mapId}`);
    }
    const gridSize = validatedGridSize(document.gridSize, mapId);
    const zonesById = Object.create(null);
    for (const zone of arrayOfObjects(document.encounterZones)) {
      const zoneId = requiredIdentifier(zone.id, `encounter zone id in ${filePath}`);
      if (Object.hasOwn(zonesById, zoneId)) {
        throw new Error(`duplicate encounter zone ${mapId}/${zoneId}`);
      }
      validateEncounterSource(zone, formsById, `${mapId}/${zoneId}`, {
        requireCandidates: true,
        requireGeometry: true,
        gridSize,
      });
      zonesById[zoneId] = deepFreeze(clone(zone));
    }
    const interactionsById = Object.create(null);
    for (const interaction of arrayOfObjects(document.interactionPoints)) {
      const interactionId = String(interaction.id || "").trim();
      if (!interactionId) {
        continue;
      }
      requiredIdentifier(interactionId, `interaction id in ${filePath}`);
      if (Object.hasOwn(interactionsById, interactionId)) {
        throw new Error(`duplicate map interaction ${mapId}/${interactionId}`);
      }
      if (interactionProvidesEncounter(interaction)) {
        validateEncounterSource(interaction, formsById, `${mapId}/${interactionId}`, {
          requireCandidates: String(interaction.encounterZoneId || "").trim() === "",
          requireInteractionCell: true,
          gridSize,
        });
      }
      interactionsById[interactionId] = deepFreeze(clone(interaction));
    }
    for (const interaction of Object.values(interactionsById)) {
      const zoneId = String(interaction.encounterZoneId || "").trim();
      if (zoneId && !ownValue(zonesById, zoneId)) {
        throw new Error(`interaction ${mapId}/${interaction.id} references missing encounter zone ${zoneId}`);
      }
    }
    mapsById[mapId] = deepFreeze({
      id: mapId,
      name: String(document.name || mapId),
      gridSize,
      zonesById,
      interactionsById,
    });
  }
  if (Object.keys(mapsById).length < 1) {
    throw new Error(`pet encounter catalog found no maps in ${dataDir}`);
  }
  return deepFreeze({
    dataDir,
    mapsById,
    formsById,
    schemaVersion: 1,
  });
}

function safeEncounterIntent(request = {}) {
  const payload = objectOrEmpty(request);
  const rawIntent = objectOrEmpty(payload.encounterIntent);
  const legacyIdentifiers = objectOrEmpty(payload.encounterZone);
  const source = Object.keys(rawIntent).length > 0 ? rawIntent : legacyIdentifiers;
  return {
    zoneId: String(source.zoneId || source.id || "").trim(),
    groupId: String(source.encounterGroupId || source.groupId || "").trim(),
    interactionId: String(source.sourceInteractionId || source.interactionId || "").trim(),
  };
}

function resolveEncounterSource(map, intent) {
  if (intent.interactionId) {
    const interaction = ownValue(map.interactionsById, intent.interactionId);
    if (!interaction || !interactionProvidesEncounter(interaction)) {
      return failure("encounter_interaction_invalid", "这个挑战目标不存在或不能发起战斗。");
    }
    const linkedZoneId = String(interaction.encounterZoneId || "").trim();
    const zone = linkedZoneId ? ownValue(map.zonesById, linkedZoneId) : interaction;
    if (!zone) {
      return failure("encounter_zone_invalid", "挑战对应的遇敌区域不存在。");
    }
    if (intent.zoneId && String(zone.id || "") !== intent.zoneId && linkedZoneId !== intent.zoneId) {
      return failure("encounter_intent_mismatch", "遇敌目标与挑战区域不一致。");
    }
    if (intent.groupId && String(zone.encounterGroupId || interaction.encounterGroupId || "") !== intent.groupId) {
      return failure("encounter_intent_mismatch", "遇敌目标与挑战分组不一致。");
    }
    return {ok: true, source: {zone, interaction}};
  }
  if (!intent.zoneId) {
    return failure("encounter_zone_missing", "缺少遇敌区域标识。");
  }
  const zone = ownValue(map.zonesById, intent.zoneId);
  if (!zone) {
    return failure("encounter_zone_invalid", "当前地图没有这个遇敌区域。");
  }
  if (intent.groupId && String(zone.encounterGroupId || "") !== intent.groupId) {
    return failure("encounter_intent_mismatch", "遇敌区域与分组不一致。");
  }
  return {ok: true, source: {zone, interaction: null}};
}

function buildAuthoritativeEncounter({catalog, battleExpCatalog, map, source, seed, scenario, participantCharacterCount}) {
  const zone = source.zone;
  const interaction = source.interaction;
  const fixedEntries = arrayOfObjects(zone.fixedWildPets);
  let pool = canonicalWildPetPool(catalog, zone);
  if (scenario.forceWuli) {
    pool = pool.filter((entry) => {
      const form = ownValue(catalog.formsById, String(entry.formId || entry.templateId || ""));
      return String(form && form.lineId || "") === "wuli" || String(entry.formId || "").startsWith("wuli_");
    });
  }
  if (fixedEntries.length < 1 && pool.length < 1) {
    throw new Error(`encounter ${String(map.id || "")}/${String(zone.id || "")} has no wild pet candidates`);
  }
  const enemyCount = scenario.forceSingleEnemy
    ? 1
    : authoritativeEnemyCount(zone, fixedEntries, participantCharacterCount, seed);
  const selectedWildPets = [];
  const nonCatchableByDefault = Boolean(interaction) || Boolean(zone.manualOnly);
  if (fixedEntries.length > 0) {
    for (let index = 0; index < enemyCount; index += 1) {
      const raw = fixedEntries[Math.min(index, fixedEntries.length - 1)];
      selectedWildPets.push(normalizeSelectedWildPet(catalog, raw, {
        levelLabel: `fixed:${index}:level`,
        nonCatchableByDefault,
        seed,
      }));
    }
  } else if (Boolean(zone.individualWildPets)) {
    for (let index = 0; index < enemyCount; index += 1) {
      selectedWildPets.push(selectWildPetFromPool(catalog, pool, seed, `individual:${index}`, nonCatchableByDefault));
    }
  } else {
    const shared = selectWildPetFromPool(catalog, pool, seed, "shared", nonCatchableByDefault);
    for (let index = 0; index < enemyCount; index += 1) {
      selectedWildPets.push(clone(shared));
    }
  }
  if (scenario.captureDifficulty !== null) {
    for (const pet of selectedWildPets) {
      pet.catchable = true;
      pet.captureDifficulty = scenario.captureDifficulty;
    }
  }
  const zoneId = String(zone.id || "").trim();
  const interactionId = String(interaction && interaction.id || "").trim();
  const groupId = String(zone.encounterGroupId || interaction && interaction.encounterGroupId || "");
  const rewardTableId = String(zone.rewardTableId || interaction && interaction.rewardTableId || groupId);
  for (const wildPet of selectedWildPets) {
    wildPet.expReward = battleExpCatalog.rewardForActor({
      level: wildPet.level,
      ...wildPet.battleStats,
    }, rewardTableId);
  }
  return {
    zoneId,
    groupId,
    rewardTableId,
    interactionId,
    sourceInteractionId: interactionId,
    sourceInteractionName: String(interaction && interaction.name || ""),
    name: String(zone.name || interaction && interaction.name || "野外"),
    formationTemplate: String(zone.formationTemplate || (enemyCount > 1 ? "10v10" : "")),
    enemyCount,
    selectedWildPet: clone(selectedWildPets[0]),
    selectedWildPets,
    scenarioId: scenario.id,
    authority: "server_pet_encounter_v1",
    schemaVersion: 1,
  };
}

function authoritativeEncounterScenario(profileValue, map, source) {
  const profile = objectOrEmpty(profileValue);
  const zone = source.zone;
  const groupId = String(zone.encounterGroupId || source.interaction && source.interaction.encounterGroupId || "");
  if (
    String(map && map.id || "") === "firebud_village_gate"
    && groupId === "firebud_grass_01"
    && String(profile.activeQuestId || "") === "quest_capture_wuli"
  ) {
    const states = objectOrEmpty(profile.questStates);
    const state = objectOrEmpty(states.quest_capture_wuli);
    const status = String(state.status || "active");
    const progress = Math.max(0, Math.trunc(Number(state.progress || 0)));
    if (status === "active" && progress < 1) {
      return {
        id: "tutorial_capture_wuli",
        forceWuli: true,
        forceSingleEnemy: true,
        captureDifficulty: 1,
      };
    }
  }
  return {
    id: "",
    forceWuli: false,
    forceSingleEnemy: false,
    captureDifficulty: null,
  };
}

function canonicalWildPetPool(catalog, zone) {
  const pool = arrayOfObjects(zone.wildPetPool).map((entry) => clone(entry));
  const source = String(zone.wildPetPoolSource || "").trim();
  if (!source) {
    return pool;
  }
  if (source !== CODEX_CATCHABLE_POOL_SOURCE) {
    throw new Error(`unsupported wildPetPoolSource: ${source}`);
  }
  const levelMin = clampInt(zone.levelMin, 1, MAX_PET_LEVEL, 1);
  const levelMax = clampInt(zone.levelMax, levelMin, MAX_PET_LEVEL, levelMin);
  for (const form of Object.values(catalog.formsById)) {
    const capture = objectOrEmpty(form.capture);
    if (capture.catchable !== true) {
      continue;
    }
    pool.push({
      formId: String(form.formId || ""),
      name: String(form.wildName || form.formName || "野生宠物"),
      weight: nonNegativeNumber(form.encounterWeight, 1),
      levelMin,
      levelMax,
      battleStats: clone(objectOrEmpty(form.baseStats)),
    });
  }
  return pool;
}

function authoritativeEnemyCount(zone, fixedEntries, participantCharacterCount, seed) {
  if (fixedEntries.length > 0) {
    return clampInt(fixedEntries.length, 1, MAX_ENEMY_COUNT, 1);
  }
  if (zone.enemyCountMin !== undefined || zone.enemyCountMax !== undefined) {
    const min = clampInt(zone.enemyCountMin ?? zone.enemyCount, 1, MAX_ENEMY_COUNT, 1);
    const max = clampInt(zone.enemyCountMax ?? min, min, MAX_ENEMY_COUNT, min);
    return deterministicInt(seed, "enemy_count", min, max);
  }
  if (zone.enemyCount !== undefined) {
    return clampInt(zone.enemyCount, 1, MAX_ENEMY_COUNT, 1);
  }
  return participantCharacterCount > 1 ? MAX_ENEMY_COUNT : 1;
}

function selectWildPetFromPool(catalog, pool, seed, label, nonCatchableByDefault) {
  const weighted = pool.map((entry) => ({
    entry,
    weight: nonNegativeNumber(entry.weight, 1),
  }));
  const total = weighted.reduce((sum, value) => sum + value.weight, 0);
  let selected = weighted[0] && weighted[0].entry;
  if (total > 0) {
    const roll = deterministicFloat(seed, `${label}:pool`) * total;
    let cursor = 0;
    for (const value of weighted) {
      cursor += value.weight;
      if (roll < cursor) {
        selected = value.entry;
        break;
      }
    }
  }
  if (!selected) {
    throw new Error("wild pet pool has no selectable entry");
  }
  return normalizeSelectedWildPet(catalog, selected, {
    levelLabel: `${label}:level`,
    nonCatchableByDefault,
    seed,
  });
}

function normalizeSelectedWildPet(catalog, rawEntry, options) {
  const entry = objectOrEmpty(rawEntry);
  const formId = requiredText(entry.formId || entry.templateId, "wild pet formId");
  const form = ownValue(catalog.formsById, formId);
  if (!form) {
    throw new Error(`wild pet references unknown formId: ${formId}`);
  }
  const formCapture = objectOrEmpty(form.capture);
  const configuredCapture = objectOrEmpty(entry.capture);
  const levelMin = clampInt(entry.levelMin ?? entry.level, 1, MAX_PET_LEVEL, 1);
  const levelMax = clampInt(entry.levelMax ?? entry.level, levelMin, MAX_PET_LEVEL, levelMin);
  const level = entry.level !== undefined
    ? clampInt(entry.level, levelMin, levelMax, levelMin)
    : deterministicInt(options.seed, options.levelLabel, levelMin, levelMax);
  const stats = normalizedBattleStats(entry.battleStats, form.baseStats);
  const hasExplicitCatchable = entry.catchable !== undefined || configuredCapture.catchable !== undefined;
  const catchable = hasExplicitCatchable
    ? Boolean(entry.catchable ?? configuredCapture.catchable)
    : (options.nonCatchableByDefault ? false : formCapture.catchable === true);
  const result = {
    formId,
    speciesId: formId,
    lineId: String(form.lineId || ""),
    name: String(entry.name || form.formName || "野生宠物"),
    level,
    battleStats: stats,
    weight: nonNegativeNumber(entry.weight, 1),
    catchable,
    captureDifficulty: clampInt(
      entry.captureDifficulty ?? entry.difficulty ?? configuredCapture.difficulty ?? formCapture.difficulty,
      1,
      100,
      DEFAULT_CAPTURE_DIFFICULTY,
    ),
  };
  const chanceOverride = optionalChance(
    entry.captureChanceOverride ?? entry.captureRateOverride ?? configuredCapture.chanceOverride,
  );
  if (chanceOverride !== undefined) {
    result.captureChanceOverride = chanceOverride;
  }
  const expReward = nonNegativeOptionalNumber(entry.expReward ?? entry.experience ?? entry.exp);
  if (expReward !== undefined) {
    result.expReward = expReward;
  }
  for (const key of ["activeSkillIds", "petSkillSlots", "passiveSkillIds"]) {
    if (Array.isArray(entry[key])) {
      result[key] = uniqueStrings(entry[key]);
    }
  }
  return result;
}

function normalizedBattleStats(primary, fallback) {
  const source = objectOrEmpty(primary);
  const defaults = objectOrEmpty(fallback);
  return {
    maxHp: positiveNumber(source.maxHp ?? source.hp ?? defaults.maxHp, 80),
    attack: positiveNumber(source.attack ?? defaults.attack, 10),
    defense: positiveNumber(source.defense ?? defaults.defense, 6),
    agility: positiveNumber(source.agility ?? source.quick ?? defaults.agility ?? defaults.quick, 48),
  };
}

function validateEncounterSource(source, formsById, label, options = {}) {
  const poolSource = String(source.wildPetPoolSource || "").trim();
  if (poolSource && poolSource !== CODEX_CATCHABLE_POOL_SOURCE) {
    throw new Error(`${label} has unsupported wildPetPoolSource ${poolSource}`);
  }
  if (!String(source.encounterGroupId || "").trim()) {
    throw new Error(`${label} is missing encounterGroupId`);
  }
  if (source.rewardTableId !== undefined) {
    requiredIdentifier(source.rewardTableId, `rewardTableId in ${label}`);
  }
  if (options.requireGeometry && !encounterSourceHasGeometry(source)) {
    throw new Error(`${label} is missing cells or rects`);
  }
  if (options.requireInteractionCell && (!Array.isArray(source.cell) || source.cell.length < 2)) {
    throw new Error(`${label} is missing an interaction cell`);
  }
  if (options.requireGeometry) {
    validateEncounterGeometry(source, options.gridSize, label);
    if (!Boolean(source.manualOnly)) {
      const encounterRate = Number(source.encounterRate);
      if (!Number.isFinite(encounterRate) || encounterRate < 0 || encounterRate > 1) {
        throw new Error(`${label} has invalid encounterRate`);
      }
    }
  }
  if (options.requireInteractionCell) {
    validateMapCell(source.cell, options.gridSize, `${label} interaction cell`);
  }
  const poolEntries = arrayOfObjects(source.wildPetPool);
  const fixedEntries = arrayOfObjects(source.fixedWildPets);
  const entries = [...poolEntries, ...fixedEntries];
  if (options.requireCandidates && entries.length < 1 && !poolSource) {
    throw new Error(`${label} has no wild pet candidates`);
  }
  if (fixedEntries.length > MAX_ENEMY_COUNT) {
    throw new Error(`${label} has more than ${MAX_ENEMY_COUNT} fixed wild pets`);
  }
  validateEncounterCountRange(source, fixedEntries, label);
  let poolWeight = 0;
  for (const entry of entries) {
    const formId = requiredText(entry.formId || entry.templateId, `wild pet formId in ${label}`);
    if (!ownValue(formsById, formId)) {
      throw new Error(`${label} references unknown pet formId ${formId}`);
    }
    const min = clampInt(entry.levelMin ?? entry.level, 1, MAX_PET_LEVEL, 1);
    const max = clampInt(entry.levelMax ?? entry.level, min, MAX_PET_LEVEL, min);
    if (Number(entry.levelMin ?? entry.level ?? min) !== min || Number(entry.levelMax ?? entry.level ?? max) !== max) {
      throw new Error(`${label}/${formId} has invalid level range`);
    }
    if (entry.weight !== undefined && (!Number.isFinite(Number(entry.weight)) || Number(entry.weight) < 0)) {
      throw new Error(`${label}/${formId} has invalid weight`);
    }
    if (poolEntries.includes(entry)) {
      poolWeight += nonNegativeNumber(entry.weight, 1);
    }
    const stats = objectOrEmpty(entry.battleStats);
    for (const key of ["maxHp", "attack", "defense"]) {
      if (!Number.isFinite(Number(stats[key])) || Number(stats[key]) <= 0) {
        throw new Error(`${label}/${formId} has invalid battleStats.${key}`);
      }
    }
    const agility = stats.agility ?? stats.quick;
    if (!Number.isFinite(Number(agility)) || Number(agility) <= 0) {
      throw new Error(`${label}/${formId} has invalid battleStats.agility`);
    }
    const capture = objectOrEmpty(entry.capture);
    if (entry.catchable !== undefined && typeof entry.catchable !== "boolean") {
      throw new Error(`${label}/${formId} has invalid catchable`);
    }
    if (capture.catchable !== undefined && typeof capture.catchable !== "boolean") {
      throw new Error(`${label}/${formId} has invalid capture.catchable`);
    }
    const difficulty = entry.captureDifficulty ?? entry.difficulty ?? capture.difficulty;
    if (difficulty !== undefined && (!Number.isInteger(Number(difficulty)) || Number(difficulty) < 1 || Number(difficulty) > 100)) {
      throw new Error(`${label}/${formId} has invalid capture difficulty`);
    }
    const chance = entry.captureChanceOverride ?? entry.captureRateOverride ?? capture.chanceOverride;
    if (chance !== undefined && (!Number.isFinite(Number(chance)) || Number(chance) < 0 || Number(chance) > 1)) {
      throw new Error(`${label}/${formId} has invalid capture chance override`);
    }
    const expReward = entry.expReward ?? entry.experience ?? entry.exp;
    if (expReward !== undefined && (!Number.isFinite(Number(expReward)) || Number(expReward) < 0)) {
      throw new Error(`${label}/${formId} has invalid EXP reward`);
    }
  }
  if (poolEntries.length > 0 && poolWeight <= 0) {
    throw new Error(`${label} has no positive wild pet pool weight`);
  }
}

function validateEncounterCountRange(source, fixedEntries, label) {
  for (const key of ["enemyCount", "enemyCountMin", "enemyCountMax"]) {
    if (source[key] === undefined) {
      continue;
    }
    const value = Number(source[key]);
    if (!Number.isInteger(value) || value < 1 || value > MAX_ENEMY_COUNT) {
      throw new Error(`${label} has invalid ${key}`);
    }
  }
  const min = Number(source.enemyCountMin ?? source.enemyCount ?? 1);
  const max = Number(source.enemyCountMax ?? source.enemyCount ?? min);
  if (min > max) {
    throw new Error(`${label} has an inverted enemy count range`);
  }
  if (fixedEntries.length > 0 && source.enemyCount !== undefined && Number(source.enemyCount) !== fixedEntries.length) {
    throw new Error(`${label} enemyCount does not match fixedWildPets`);
  }
}

function encounterSourceHasGeometry(source) {
  return (Array.isArray(source.cells) && source.cells.length > 0)
    || (Array.isArray(source.rects) && source.rects.length > 0);
}

function validatedGridSize(value, label) {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error(`map ${label} is missing gridSize`);
  }
  const width = Number(value[0]);
  const height = Number(value[1]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`map ${label} has invalid gridSize`);
  }
  return deepFreeze([width, height]);
}

function validateEncounterGeometry(source, gridSize, label) {
  for (const [index, cell] of (Array.isArray(source.cells) ? source.cells : []).entries()) {
    validateMapCell(cell, gridSize, `${label} cell ${index}`);
  }
  for (const [index, rect] of (Array.isArray(source.rects) ? source.rects : []).entries()) {
    if (!Array.isArray(rect) || rect.length < 4) {
      throw new Error(`${label} rect ${index} is invalid`);
    }
    const [x, y, width, height] = rect.map(Number);
    if (![x, y, width, height].every(Number.isInteger) || width < 1 || height < 1) {
      throw new Error(`${label} rect ${index} is invalid`);
    }
    if (x < 0 || y < 0 || x + width > gridSize[0] || y + height > gridSize[1]) {
      throw new Error(`${label} rect ${index} is outside the map grid`);
    }
  }
}

function validateMapCell(cell, gridSize, label) {
  if (!Array.isArray(cell) || cell.length < 2) {
    throw new Error(`${label} is invalid`);
  }
  const x = Number(cell[0]);
  const y = Number(cell[1]);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= gridSize[0] || y >= gridSize[1]) {
    throw new Error(`${label} is outside the map grid`);
  }
}

function interactionProvidesEncounter(interaction) {
  return String(interaction && interaction.encounterZoneId || "").trim() !== ""
    || String(interaction && interaction.actionType || "").trim() === "guardian_battle"
    || arrayOfObjects(interaction && interaction.fixedWildPets).length > 0
    || arrayOfObjects(interaction && interaction.wildPetPool).length > 0
    || String(interaction && interaction.wildPetPoolSource || "").trim() !== "";
}

function zoneContainsCell(zone, cellX, cellY) {
  for (const cell of Array.isArray(zone && zone.cells) ? zone.cells : []) {
    if (Array.isArray(cell) && Number(cell[0]) === cellX && Number(cell[1]) === cellY) {
      return true;
    }
  }
  for (const rect of Array.isArray(zone && zone.rects) ? zone.rects : []) {
    if (!Array.isArray(rect) || rect.length < 4) {
      continue;
    }
    const originX = Math.trunc(Number(rect[0] || 0));
    const originY = Math.trunc(Number(rect[1] || 0));
    const width = Math.max(0, Math.trunc(Number(rect[2] || 0)));
    const height = Math.max(0, Math.trunc(Number(rect[3] || 0)));
    if (cellX >= originX && cellY >= originY && cellX < originX + width && cellY < originY + height) {
      return true;
    }
  }
  return false;
}

function positionNearInteraction(position, interaction, maxDistance) {
  const cell = Array.isArray(interaction && interaction.cell) ? interaction.cell : [];
  if (cell.length < 2) {
    return false;
  }
  const distance = Math.max(
    Math.abs(position.cellX - Math.trunc(Number(cell[0] || 0))),
    Math.abs(position.cellY - Math.trunc(Number(cell[1] || 0))),
  );
  return distance <= maxDistance;
}

function normalizedPosition(value) {
  const position = objectOrEmpty(value);
  const cellX = Number(position.cellX);
  const cellY = Number(position.cellY);
  const hasCell = position.hasCell !== false && Number.isFinite(cellX) && Number.isFinite(cellY);
  return {
    hasCell,
    cellX: hasCell ? Math.trunc(cellX) : 0,
    cellY: hasCell ? Math.trunc(cellY) : 0,
  };
}

function validatePartyEncounterPositions(values, participants, mapId, leaderPosition, maxDistance) {
  if (!Array.isArray(values) || values.length < 1) {
    return failure("encounter_party_position_missing", "参战成员的位置尚未同步。");
  }
  const expectedAccountIds = new Set(
    (Array.isArray(participants) ? participants : [])
      .map((participant) => String(participant && participant.accountId || "").trim())
      .filter(Boolean),
  );
  const positionedAccountIds = new Set(
    values.map((value) => String(value && value.accountId || "").trim()).filter(Boolean),
  );
  if (expectedAccountIds.size < 1 || [...expectedAccountIds].some((accountId) => !positionedAccountIds.has(accountId))) {
    return failure("encounter_party_position_missing", "参战成员的位置尚未同步。");
  }
  for (const value of values) {
    const entry = objectOrEmpty(value);
    const position = objectOrEmpty(entry.position);
    const normalized = normalizedPosition(position);
    if (!String(entry.accountId || "").trim() || !normalized.hasCell) {
      return failure("encounter_party_position_missing", "参战成员的位置尚未同步。");
    }
    if (String(position.mapId || "") !== mapId) {
      return failure("encounter_party_map_mismatch", "参战成员不在同一张地图。");
    }
    if (Boolean(position.moving)) {
      return failure("encounter_party_member_moving", "参战成员需要先停稳。");
    }
    const distance = Math.max(
      Math.abs(normalized.cellX - leaderPosition.cellX),
      Math.abs(normalized.cellY - leaderPosition.cellY),
    );
    if (distance > maxDistance) {
      return failure("encounter_party_too_far", "参战成员距离队长太远。");
    }
  }
  return {ok: true};
}

function partyEncounterCharacterCount(participants) {
  const active = Array.isArray(participants)
    ? participants.slice(0, 5).filter((participant) => participant && String(participant.accountId || "").trim() !== "")
    : [];
  const partnerCount = active.reduce((sum, participant) => {
    const snapshot = objectOrEmpty(participant.teamSnapshot);
    return sum + arrayOfObjects(snapshot.trainingPartners).length;
  }, 0);
  return active.length + Math.min(partnerCount, Math.max(0, 4 - Math.max(0, active.length - 1)));
}

function deterministicFloat(seed, label) {
  const digest = crypto.createHash("sha256").update(`${seed}:${label}`).digest();
  const integer = digest.readUIntBE(0, 6);
  return integer / 281474976710656;
}

function deterministicInt(seed, label, min, max) {
  if (max <= min) {
    return min;
  }
  return min + Math.floor(deterministicFloat(seed, label) * (max - min + 1));
}

function readJsonDocument(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function failure(code, message, details = {}) {
  return {ok: false, code, message, ...details};
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayOfObjects(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) : [];
}

function requiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`missing ${label}`);
  }
  return text;
}

function requiredIdentifier(value, label) {
  const text = requiredText(value, label);
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(text)) {
    throw new Error(`invalid ${label}: ${text}`);
  }
  return text;
}

function ownValue(record, key) {
  if (!record || typeof record !== "object" || !Object.hasOwn(record, key)) {
    return null;
  }
  return record[key] || null;
}

function clampInt(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function nonNegativeOptionalNumber(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function optionalChance(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : undefined;
}

function uniqueStrings(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter((item, index, array) => item && array.indexOf(item) === index)
    : [];
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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
  createPetEncounterAuthority,
  loadPetEncounterCatalog,
  safeEncounterIntent,
  zoneContainsCell,
};
