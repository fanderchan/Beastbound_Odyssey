"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {requireEquippedEquipmentInstance} = require("./equipment-profile-state");

const STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);
const WEAPON_SLOTS = Object.freeze(["right_hand_weapon", "left_hand_weapon"]);
const ARMOR_SLOTS = Object.freeze(["body", "head", "hands", "feet", "accessory_left", "accessory_right"]);
const DEFAULT_PLAYER_STATS = Object.freeze({maxHp: 120, attack: 18, defense: 6, quick: 70});
const DEFAULT_EQUIPMENT_PATH = path.resolve(__dirname, "../../../..", "client/godot/data/equipment_items.json");

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : Math.trunc(Number(fallback || 0));
}

function positiveInteger(value, fallback = 1) {
  return Math.max(1, integer(value, fallback));
}

function nonNegativeInteger(value, fallback = 0) {
  return Math.max(0, integer(value, fallback));
}

function clampInteger(value, min, max, fallback = min) {
  return Math.max(min, Math.min(max, integer(value, fallback)));
}

function uniqueStrings(values) {
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = String(value || "").trim();
    if (normalized !== "" && !result.includes(normalized)) {
      result.push(normalized);
    }
  }
  return result;
}

function itemMaxDurability(itemValue) {
  const item = record(itemValue);
  if (item.usesDurability === false) {
    return 0;
  }
  return Math.max(1, integer(item.durabilityMax, 30));
}

function itemMaxEnhancement(itemValue) {
  const item = record(itemValue);
  if (item.expPill === true) {
    return 0;
  }
  return nonNegativeInteger(item.enhanceMax, 5);
}

function buildBattleEquipmentCatalog(documentValue) {
  const document = record(documentValue);
  if (integer(document.schemaVersion, 0) < 1) {
    throw new Error("equipment catalog schemaVersion must be at least 1");
  }
  const slotIds = uniqueStrings((Array.isArray(document.slots) ? document.slots : []).map((slot) => record(slot).id));
  if (slotIds.length === 0) {
    throw new Error("equipment catalog must declare slots");
  }
  const itemById = new Map();
  for (const rawItem of Array.isArray(document.items) ? document.items : []) {
    const item = record(rawItem);
    const itemId = String(item.id || "").trim();
    const slotId = String(item.slot || "").trim();
    if (itemId === "") {
      throw new Error("equipment catalog contains an item without id");
    }
    if (itemById.has(itemId)) {
      throw new Error(`equipment catalog contains duplicate item id: ${itemId}`);
    }
    if (!slotIds.includes(slotId)) {
      throw new Error(`equipment item ${itemId} uses unknown slot: ${slotId}`);
    }
    const stats = record(item.stats);
    for (const [key, value] of Object.entries(stats)) {
      if (!STAT_KEYS.includes(key) || !Number.isFinite(Number(value))) {
        throw new Error(`equipment item ${itemId} has invalid stat ${key}`);
      }
    }
    if (integer(item.requiredLevel, 1) < 1 || integer(item.requiredRebirth, 0) < 0) {
      throw new Error(`equipment item ${itemId} has invalid requirements`);
    }
    itemById.set(itemId, Object.freeze({...item, stats: Object.freeze({...stats})}));
  }
  if (itemById.size === 0) {
    throw new Error("equipment catalog must declare items");
  }
  return Object.freeze({
    schemaVersion: integer(document.schemaVersion, 1),
    slotIds: Object.freeze(slotIds.slice()),
    itemById,
  });
}

function loadBattleEquipmentCatalog(filePath = DEFAULT_EQUIPMENT_PATH) {
  let document;
  try {
    document = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const loadError = new Error(`failed to load authoritative equipment catalog: ${filePath}`);
    loadError.cause = error;
    throw loadError;
  }
  return buildBattleEquipmentCatalog(document);
}

function itemMeetsRequirements(itemValue, playerLevel, playerRebirth) {
  const item = record(itemValue);
  return positiveInteger(playerLevel, 1) >= positiveInteger(item.requiredLevel, 1)
    && nonNegativeInteger(playerRebirth, 0) >= nonNegativeInteger(item.requiredRebirth, 0);
}

function equipmentSlotIsBroken(slotId, itemValue, durabilityValue) {
  const maxDurability = itemMaxDurability(itemValue);
  if (maxDurability <= 0) {
    return false;
  }
  const durability = record(durabilityValue);
  return clampInteger(durability[slotId], 0, maxDurability, maxDurability) <= 0;
}

function enhancementLevelForSlot(slotId, itemId, item, enhancementValue) {
  const enhancement = record(enhancementValue);
  const entry = record(enhancement[slotId]);
  if (String(entry.itemId || itemId) !== itemId) {
    return 0;
  }
  return clampInteger(entry.level, 0, itemMaxEnhancement(item), 0);
}

function enhancementStatsForSlot(slotId, levelValue) {
  const level = nonNegativeInteger(levelValue, 0);
  const result = {maxHp: 0, attack: 0, defense: 0, quick: 0};
  if (WEAPON_SLOTS.includes(slotId)) {
    result.attack = level;
  } else if (["body", "head", "hands", "feet"].includes(slotId)) {
    result.defense = level;
  } else if (["accessory_left", "accessory_right"].includes(slotId)) {
    result.maxHp = level * 2;
  }
  return result;
}

function baseStatsFromProfile(profileValue) {
  const profile = record(profileValue);
  const source = record(record(profile.player).baseStats);
  return {
    maxHp: positiveInteger(source.maxHp, DEFAULT_PLAYER_STATS.maxHp),
    attack: positiveInteger(source.attack, DEFAULT_PLAYER_STATS.attack),
    defense: positiveInteger(source.defense, DEFAULT_PLAYER_STATS.defense),
    quick: positiveInteger(source.quick, DEFAULT_PLAYER_STATS.quick),
  };
}

function equipmentSlotActivation(profileValue, catalog, slotId, durabilityValue = null) {
  const profile = record(profileValue);
  const player = record(profile.player);
  const itemId = String(record(profile.equipmentSlots)[slotId] || "").trim();
  const item = catalog.itemById.get(itemId);
  if (itemId === "") {
    return {slotId, itemId, item: null, active: false, reason: "empty"};
  }
  if (!item) {
    return {slotId, itemId, item: null, active: false, reason: "unknown_item"};
  }
  if (String(item.slot || "") !== slotId) {
    return {slotId, itemId, item, active: false, reason: "slot_mismatch"};
  }
  const durability = durabilityValue === null ? record(profile.equipmentDurability) : record(durabilityValue);
  const broken = equipmentSlotIsBroken(slotId, item, durability);
  const requirementsMet = itemMeetsRequirements(
    item,
    positiveInteger(player.level, 1),
    nonNegativeInteger(profile.rebirthCount, 0),
  );
  return {
    slotId,
    itemId,
    item,
    active: !broken && requirementsMet,
    broken,
    requirementsMet,
    reason: broken ? "broken" : (requirementsMet ? "" : "requirements_not_met"),
  };
}

function validateEquipmentSlotInstanceForBattle(profile, catalog, slotId, options = {}) {
  const equipped = requireEquippedEquipmentInstance(profile, catalog, slotId);
  if (!equipped.ok) {
    return equipped;
  }
  const itemId = equipped.itemId;
  const item = catalog.itemById.get(itemId);
  const instance = record(equipped.instance);
  const maxDurability = itemMaxDurability(item);
  if (maxDurability > 0) {
    const slotDurability = clampInteger(record(profile.equipmentDurability)[slotId], 0, maxDurability, maxDurability);
    const instanceDurability = clampInteger(instance.durability, 0, maxDurability, maxDurability);
    if (slotDurability !== instanceDurability) {
      return {ok: false, code: "equipment_slot_instance_conflict", message: "装备耐久与实例档案不一致。"};
    }
  }
  const slotEnhancement = record(record(profile.equipmentEnhancement)[slotId]);
  const instanceEnhancement = record(instance.enhancement);
  const slotEnhancementLevel = enhancementLevelForSlot(slotId, itemId, item, profile.equipmentEnhancement);
  const instanceEnhancementLevel = String(instanceEnhancement.itemId || itemId) === itemId
    ? clampInteger(instanceEnhancement.level, 0, itemMaxEnhancement(item), 0)
    : -1;
  if (slotEnhancementLevel !== instanceEnhancementLevel || String(slotEnhancement.itemId || itemId) !== itemId) {
    return {ok: false, code: "equipment_slot_instance_conflict", message: "装备强化与实例档案不一致。"};
  }
  if (options.checkWear && maxDurability > 0) {
    const slotWear = record(record(profile.equipmentWearCounters)[slotId]);
    const instanceWear = record(instance.wearCounters);
    for (const key of ["attackCount", "hitCount"]) {
      if (nonNegativeInteger(slotWear[key], 0) !== nonNegativeInteger(instanceWear[key], 0)) {
        return {ok: false, code: "equipment_slot_instance_conflict", message: "装备磨损与实例档案不一致。"};
      }
    }
    if (String(slotWear.itemId || itemId) !== itemId || String(instanceWear.itemId || itemId) !== itemId) {
      return {ok: false, code: "equipment_slot_instance_conflict", message: "装备磨损物品与实例档案不一致。"};
    }
  }
  return equipped;
}

function resolveEquipmentBattleStats(profileValue, catalogValue, options = {}) {
  const profile = record(profileValue);
  const catalog = catalogValue && catalogValue.itemById instanceof Map
    ? catalogValue
    : buildBattleEquipmentCatalog(catalogValue);
  const player = record(profile.player);
  const slots = record(profile.equipmentSlots);
  const durability = record(profile.equipmentDurability);
  const enhancement = record(profile.equipmentEnhancement);
  const baseStats = baseStatsFromProfile(profile);
  const equipmentBonus = {maxHp: 0, attack: 0, defense: 0, quick: 0};
  const slotFacts = [];
  const spiritIds = [];
  const battleActionIds = [];
  const activeItemBySlot = {};
  const equipmentStateConflicts = [];
  const requireInstances = Boolean(options.requireInstances);

  for (const slotId of catalog.slotIds) {
    const activation = equipmentSlotActivation(profile, catalog, slotId, durability);
    const itemId = activation.itemId;
    if (itemId === "") {
      continue;
    }
    const item = activation.item;
    if (!item) {
      slotFacts.push({slotId, itemId, active: false, reason: activation.reason});
      continue;
    }
    if (requireInstances && String(item.slot || "") === slotId) {
      const instanceCheck = validateEquipmentSlotInstanceForBattle(profile, catalog, slotId, {checkWear: true});
      if (!instanceCheck.ok) {
        equipmentStateConflicts.push({slotId, itemId, code: String(instanceCheck.code || "equipment_slot_instance_conflict")});
        slotFacts.push({
          slotId,
          itemId,
          active: false,
          broken: Boolean(activation.broken),
          requirementsMet: Boolean(activation.requirementsMet),
          enhancementLevel: 0,
          reason: String(instanceCheck.code || "equipment_slot_instance_conflict"),
        });
        continue;
      }
    }
    const enhanceLevel = enhancementLevelForSlot(slotId, itemId, item, enhancement);
    slotFacts.push({
      slotId,
      itemId,
      active: activation.active,
      broken: Boolean(activation.broken),
      requirementsMet: Boolean(activation.requirementsMet),
      enhancementLevel: enhanceLevel,
      ...(activation.reason ? {reason: activation.reason} : {}),
    });
    if (!activation.active) {
      continue;
    }
    activeItemBySlot[slotId] = itemId;
    const enhanceStats = enhancementStatsForSlot(slotId, enhanceLevel);
    for (const key of STAT_KEYS) {
      equipmentBonus[key] += integer(record(item.stats)[key], 0) + integer(enhanceStats[key], 0);
    }
    for (const spiritId of uniqueStrings(item.spiritIds)) {
      if (!spiritIds.includes(spiritId)) {
        spiritIds.push(spiritId);
      }
    }
    for (const actionId of uniqueStrings(item.battleActionIds)) {
      if (!battleActionIds.includes(actionId)) {
        battleActionIds.push(actionId);
      }
    }
  }

  let attackActionId = "";
  for (const slotId of WEAPON_SLOTS) {
    const item = catalog.itemById.get(String(activeItemBySlot[slotId] || ""));
    const candidate = String(item && item.attackActionId || "").trim();
    if (candidate !== "") {
      attackActionId = candidate;
      if (!battleActionIds.includes(candidate)) {
        battleActionIds.push(candidate);
      }
      break;
    }
  }

  const effectiveStats = {};
  for (const key of STAT_KEYS) {
    effectiveStats[key] = Math.max(1, integer(baseStats[key], DEFAULT_PLAYER_STATS[key]) + integer(equipmentBonus[key], 0));
  }
  const currentHp = clampInteger(player.hp, 1, effectiveStats.maxHp, effectiveStats.maxHp);
  return {
    schemaVersion: 1,
    baseStats,
    equipmentBonus,
    effectiveStats,
    currentHp,
    activeItemBySlot,
    slotFacts,
    spiritIds: spiritIds.sort(),
    battleActionIds: battleActionIds.sort(),
    attackActionId,
    attackStyle: /(?:bow|shot|throw)/i.test(attackActionId) ? "ranged" : "melee",
    equipmentStateOk: equipmentStateConflicts.length === 0,
    equipmentStateConflicts,
  };
}

function equipmentWearRulesFromDocument(documentValue) {
  const wear = record(record(documentValue).equipmentWear);
  return Object.freeze({
    weaponAttacksPerDurability: positiveInteger(wear.weaponAttacksPerDurability, 100),
    armorHitsPerDurability: positiveInteger(wear.armorHitsPerDurability, 10),
  });
}

function activeWearSlot(profile, catalog, slotOrder, options = {}) {
  const durability = record(profile.equipmentDurability);
  for (const slotId of slotOrder) {
    const activation = equipmentSlotActivation(profile, catalog, slotId, durability);
    if (!activation.active || itemMaxDurability(activation.item) <= 0) {
      continue;
    }
    if (options.requireInstances && !validateEquipmentSlotInstanceForBattle(profile, catalog, slotId, {checkWear: true}).ok) {
      continue;
    }
    if (activation.active) {
      return slotId;
    }
  }
  return "";
}

function cloneRecord(value) {
  return JSON.parse(JSON.stringify(record(value)));
}

function applyEquipmentWearUsageToProfile(profileValue, usageValue, catalog, wearRulesValue) {
  const profile = record(profileValue);
  const usage = record(usageValue);
  const rules = record(wearRulesValue);
  const slots = record(profile.equipmentSlots);
  const durability = {...record(profile.equipmentDurability)};
  const counters = cloneRecord(profile.equipmentWearCounters);
  const slotInstanceIds = record(profile.equipmentSlotInstanceIds);
  const durabilityDrops = [];
  const brokenLabels = [];
  const changedSlots = new Set();
  let changed = false;

  function applyCounter(slotId, counterKey, amountValue, thresholdValue) {
    const amount = nonNegativeInteger(amountValue, 0);
    const threshold = positiveInteger(thresholdValue, 1);
    const itemId = String(slots[slotId] || "").trim();
    const item = catalog.itemById.get(itemId);
    if (slotId === "" || amount <= 0 || !item) {
      return;
    }
    const maxDurability = itemMaxDurability(item);
    const beforeDurability = clampInteger(durability[slotId], 0, maxDurability, maxDurability);
    if (maxDurability <= 0 || beforeDurability <= 0) {
      return;
    }
    const previous = record(counters[slotId]);
    const entry = String(previous.itemId || itemId) === itemId
      ? {...previous, itemId}
      : {itemId, attackCount: 0, hitCount: 0};
    const total = nonNegativeInteger(entry[counterKey], 0) + amount;
    const drop = Math.floor(total / threshold);
    entry[counterKey] = total % threshold;
    counters[slotId] = entry;
    durability[slotId] = beforeDurability;
    changed = true;
    changedSlots.add(slotId);
    if (drop <= 0) {
      return;
    }
    const afterDurability = Math.max(0, beforeDurability - drop);
    durability[slotId] = afterDurability;
    durabilityDrops.push({
      slotId,
      itemId,
      label: String(item.label || item.menuLabel || itemId),
      amount: beforeDurability - afterDurability,
      current: afterDurability,
      max: maxDurability,
    });
    if (beforeDurability > 0 && afterDurability <= 0) {
      brokenLabels.push(String(item.label || item.menuLabel || itemId));
    }
  }

  const weaponSlot = activeWearSlot({...profile, equipmentDurability: durability}, catalog, WEAPON_SLOTS, {requireInstances: true});
  applyCounter(weaponSlot, "attackCount", usage.weaponAttacks, rules.weaponAttacksPerDurability || 100);
  const armorSlot = activeWearSlot({...profile, equipmentDurability: durability}, catalog, ARMOR_SLOTS, {requireInstances: true});
  applyCounter(armorSlot, "hitCount", usage.armorHits, rules.armorHitsPerDurability || 10);

  let instances = null;
  for (const slotId of changedSlots) {
    const instanceCheck = validateEquipmentSlotInstanceForBattle(profile, catalog, slotId, {checkWear: true});
    if (!instanceCheck.ok) {
      return {
        ok: false,
        code: String(instanceCheck.code || "equipment_slot_instance_conflict"),
        message: String(instanceCheck.message || "装备实例档案异常，战斗磨损未写入。"),
        changed: false,
        usage: {
          weaponAttacks: nonNegativeInteger(usage.weaponAttacks, 0),
          armorHits: nonNegativeInteger(usage.armorHits, 0),
        },
        durabilityDrops: [],
        brokenLabels: [],
      };
    }
    if (!instances) {
      instances = cloneRecord(instanceCheck.state.instances);
    }
  }

  for (const slotId of changedSlots) {
    const instanceId = String(slotInstanceIds[slotId] || "").trim();
    const itemId = String(slots[slotId] || "").trim();
    if (instanceId === "" || !instances[instanceId] || String(instances[instanceId].itemId || "") !== itemId) {
      continue;
    }
    instances[instanceId] = {
      ...instances[instanceId],
      durability: durability[slotId],
      wearCounters: {
        ...cloneRecord(instances[instanceId].wearCounters),
        ...cloneRecord(counters[slotId]),
      },
    };
  }

  if (changed) {
    profile.equipmentDurability = durability;
    profile.equipmentWearCounters = counters;
    profile.equipmentInstances = instances;
  }
  return {
    ok: true,
    changed,
    usage: {
      weaponAttacks: nonNegativeInteger(usage.weaponAttacks, 0),
      armorHits: nonNegativeInteger(usage.armorHits, 0),
    },
    durabilityDrops,
    brokenLabels,
  };
}

module.exports = {
  ARMOR_SLOTS,
  DEFAULT_EQUIPMENT_PATH,
  DEFAULT_PLAYER_STATS,
  STAT_KEYS,
  WEAPON_SLOTS,
  applyEquipmentWearUsageToProfile,
  buildBattleEquipmentCatalog,
  equipmentSlotIsBroken,
  equipmentWearRulesFromDocument,
  enhancementStatsForSlot,
  itemMaxDurability,
  itemMeetsRequirements,
  loadBattleEquipmentCatalog,
  resolveEquipmentBattleStats,
};
