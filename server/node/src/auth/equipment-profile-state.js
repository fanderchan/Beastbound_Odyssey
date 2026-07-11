"use strict";

const EQUIPMENT_INSTANCE_SCHEMA_VERSION = 1;
const EQUIPMENT_SLOTS_VERSION = 5;
const MAX_EQUIPMENT_GRANT_COUNT = 1000;
const MAX_EQUIPMENT_INSTANCE_SERIAL = 999999999;

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : Math.max(0, Math.trunc(Number(fallback || 0)));
}

function positiveInteger(value, fallback = 1) {
  return Math.max(1, nonNegativeInteger(value, fallback));
}

function fail(code, message, details = {}) {
  return {ok: false, code, message, ...details};
}

function catalogItem(catalog, itemId) {
  if (!catalog || !(catalog.itemById instanceof Map)) {
    return null;
  }
  return catalog.itemById.get(String(itemId || "").trim()) || null;
}

function isEquipmentItemId(catalog, itemId) {
  return Boolean(catalogItem(catalog, itemId));
}

function invalidCompatibilityField(field, slotId = "") {
  return fail("equipment_profile_field_invalid", "装备兼容档案异常，请联系GM处理。", {
    field,
    ...(slotId ? {slotId} : {}),
  });
}

function validateEquipmentCompatibilityState(profile, catalog) {
  const rawProfile = record(profile);
  const slots = record(rawProfile.equipmentSlots);
  for (const [slotId, itemIdValue] of Object.entries(slots)) {
    if (typeof itemIdValue !== "string" || itemIdValue === "" || itemIdValue !== itemIdValue.trim()) {
      return invalidCompatibilityField("equipmentSlots", slotId);
    }
    const item = catalogItem(catalog, itemIdValue);
    if (!item || String(item.slot || "") !== slotId) {
      return invalidCompatibilityField("equipmentSlots", slotId);
    }
  }
  for (const [slotId, instanceId] of Object.entries(record(rawProfile.equipmentSlotInstanceIds))) {
    if (typeof instanceId !== "string" || instanceId === "" || instanceId !== instanceId.trim()) {
      return invalidCompatibilityField("equipmentSlotInstanceIds", slotId);
    }
  }
  for (const [slotId, durability] of Object.entries(record(rawProfile.equipmentDurability))) {
    const item = catalogItem(catalog, slots[slotId]);
    const maxDurability = item && item.usesDurability !== false ? positiveInteger(item.durabilityMax, 30) : 0;
    if (!item || maxDurability <= 0 || !Number.isSafeInteger(durability) || durability < 0 || durability > maxDurability) {
      return invalidCompatibilityField("equipmentDurability", slotId);
    }
  }
  for (const [slotId, enhancement] of Object.entries(record(rawProfile.equipmentEnhancement))) {
    const item = catalogItem(catalog, slots[slotId]);
    const maxEnhancement = item && item.expPill !== true ? nonNegativeInteger(item.enhanceMax, 5) : 0;
    if (
      !item
      || maxEnhancement <= 0
      || !isPlainRecord(enhancement)
      || Object.keys(enhancement).some((key) => !["itemId", "level", "history"].includes(key))
      || (Object.hasOwn(enhancement, "itemId") && enhancement.itemId !== slots[slotId])
      || (Object.hasOwn(enhancement, "level") && (
        !Number.isSafeInteger(enhancement.level)
        || enhancement.level < 0
        || enhancement.level > maxEnhancement
      ))
      || (Object.hasOwn(enhancement, "history") && (
        !Array.isArray(enhancement.history)
        || enhancement.history.some((entry) => !isPlainRecord(entry))
      ))
    ) {
      return invalidCompatibilityField("equipmentEnhancement", slotId);
    }
  }
  for (const [slotId, wearCounters] of Object.entries(record(rawProfile.equipmentWearCounters))) {
    const item = catalogItem(catalog, slots[slotId]);
    const maxDurability = item && item.usesDurability !== false ? positiveInteger(item.durabilityMax, 30) : 0;
    if (
      !item
      || maxDurability <= 0
      || !isPlainRecord(wearCounters)
      || Object.keys(wearCounters).some((key) => !["itemId", "attackCount", "hitCount"].includes(key))
      || (Object.hasOwn(wearCounters, "itemId") && wearCounters.itemId !== slots[slotId])
      || ["attackCount", "hitCount"].some((field) => (
        Object.hasOwn(wearCounters, field)
        && (!Number.isSafeInteger(wearCounters[field]) || wearCounters[field] < 0)
      ))
    ) {
      return invalidCompatibilityField("equipmentWearCounters", slotId);
    }
  }
  const expPillCharge = record(rawProfile.equipmentExpPillCharge);
  if (Object.keys(expPillCharge).length > 0) {
    const itemId = slots.exp_pill;
    const item = catalogItem(catalog, itemId);
    if (
      !item
      || item.expPill !== true
      || Object.keys(expPillCharge).some((key) => !["itemId", "level", "exp", "nextExp"].includes(key))
      || (Object.hasOwn(expPillCharge, "itemId") && expPillCharge.itemId !== itemId)
      || (Object.hasOwn(expPillCharge, "level") && (!Number.isSafeInteger(expPillCharge.level) || expPillCharge.level < 1))
      || (Object.hasOwn(expPillCharge, "exp") && (!Number.isSafeInteger(expPillCharge.exp) || expPillCharge.exp < 0))
      || (Object.hasOwn(expPillCharge, "nextExp") && (!Number.isSafeInteger(expPillCharge.nextExp) || expPillCharge.nextExp < 1))
    ) {
      return invalidCompatibilityField("equipmentExpPillCharge", "exp_pill");
    }
  }
  return {ok: true};
}

function equipmentTransferEntries(catalog, entries) {
  return normalizeEntries(entries).filter((entry) => isEquipmentItemId(catalog, entry.itemId));
}

function firstEquipmentTransferEntry(catalog, entries) {
  return equipmentTransferEntries(catalog, entries)[0] || null;
}

function containsEquipmentTransfer(catalog, entries) {
  return Boolean(firstEquipmentTransferEntry(catalog, entries));
}

function normalizeEntries(entries) {
  const source = Array.isArray(entries) ? entries : [entries];
  const counts = new Map();
  for (const entry of source) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const itemId = String(entry.itemId || entry.id || "").trim();
    const count = nonNegativeInteger(entry.count ?? entry.amount ?? entry.quantity, 0);
    if (itemId === "" || count <= 0) {
      continue;
    }
    counts.set(itemId, nonNegativeInteger(counts.get(itemId), 0) + count);
  }
  return Array.from(counts, ([itemId, count]) => ({itemId, count}));
}

function backpackItemCount(profile, itemId) {
  const normalizedItemId = String(itemId || "").trim();
  return (Array.isArray(profile && profile.backpackSlots) ? profile.backpackSlots : []).reduce((total, slot) => {
    const value = record(slot);
    return String(value.itemId || "").trim() === normalizedItemId
      ? total + nonNegativeInteger(value.count, 0)
      : total;
  }, 0);
}

function readEquipmentInstanceState(profile, catalog) {
  const rawProfile = record(profile);
  for (const field of [
    "equipmentSlots",
    "equipmentSlotInstanceIds",
    "equipmentDurability",
    "equipmentEnhancement",
    "equipmentWearCounters",
    "equipmentExpPillCharge",
  ]) {
    if (Object.hasOwn(rawProfile, field) && !isPlainRecord(rawProfile[field])) {
      return fail("equipment_profile_container_invalid", "装备档案容器异常，请联系GM处理。", {field});
    }
  }
  const knownSlotIds = new Set(Array.isArray(catalog && catalog.slotIds) ? catalog.slotIds : []);
  for (const field of [
    "equipmentSlots",
    "equipmentSlotInstanceIds",
    "equipmentDurability",
    "equipmentEnhancement",
    "equipmentWearCounters",
  ]) {
    const container = record(rawProfile[field]);
    const unknownSlotId = Object.keys(container).find((slotId) => !knownSlotIds.has(slotId));
    if (unknownSlotId) {
      return fail("equipment_profile_slot_unknown", "装备档案含当前版本无法识别的槽位，请联系GM处理。", {
        field,
        slotId: unknownSlotId,
      });
    }
  }
  if (Object.hasOwn(rawProfile, "equipmentSlotsVersion")) {
    const slotsVersion = Number(rawProfile.equipmentSlotsVersion);
    if (!Number.isInteger(slotsVersion) || slotsVersion < 1) {
      return fail("equipment_slots_schema_invalid", "装备槽位版本异常，请联系GM处理。", {slotsVersion});
    }
    if (slotsVersion > EQUIPMENT_SLOTS_VERSION) {
      return fail("equipment_slots_schema_future", "装备槽位档案来自更新版本，当前服务器拒绝改写。", {slotsVersion});
    }
  }
  const compatibilityState = validateEquipmentCompatibilityState(rawProfile, catalog);
  if (!compatibilityState.ok) {
    return compatibilityState;
  }
  const rawInstances = profile && profile.equipmentInstances;
  if (rawInstances !== undefined && (rawInstances === null || typeof rawInstances !== "object" || Array.isArray(rawInstances))) {
    return fail("equipment_instance_state_invalid", "装备实例档案异常，请联系GM处理。", {reason: "instances_not_object"});
  }
  const instances = Object.create(null);
  for (const [key, value] of Object.entries(record(rawInstances))) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return fail("equipment_instance_state_invalid", "装备实例档案异常，请联系GM处理。", {reason: "instance_not_object", instanceId: key});
    }
    const instanceId = String(value.instanceId || "").trim();
    if (instanceId === "" || instanceId !== key) {
      return fail("equipment_instance_state_invalid", "装备实例身份异常，请联系GM处理。", {reason: "instance_id_mismatch", instanceId: key});
    }
    const schemaVersion = Number(value.schemaVersion ?? EQUIPMENT_INSTANCE_SCHEMA_VERSION);
    if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
      return fail("equipment_instance_schema_invalid", "装备实例版本异常，请联系GM处理。", {instanceId, schemaVersion});
    }
    if (schemaVersion > EQUIPMENT_INSTANCE_SCHEMA_VERSION) {
      return fail("equipment_instance_schema_future", "装备实例来自更新版本，当前服务器拒绝改写。", {instanceId, schemaVersion});
    }
    const itemId = String(value.itemId || "").trim();
    const item = catalogItem(catalog, itemId);
    if (!item) {
      return fail("equipment_instance_item_invalid", "装备实例引用了未知装备，请联系GM处理。", {instanceId, itemId});
    }
    if (Object.hasOwn(value, "durability")) {
      const durability = value.durability;
      const maxDurability = item.usesDurability === false ? 0 : positiveInteger(item.durabilityMax, 30);
      if (!Number.isSafeInteger(durability) || durability < 0 || durability > maxDurability) {
        return fail("equipment_instance_field_invalid", "装备实例内部档案异常，请联系GM处理。", {
          instanceId,
          itemId,
          field: "durability",
        });
      }
    }
    for (const field of ["enhancement", "wearCounters", "expPillCharge"]) {
      if (Object.hasOwn(value, field) && !isPlainRecord(value[field])) {
        return fail("equipment_instance_field_invalid", "装备实例内部档案异常，请联系GM处理。", {
          instanceId,
          itemId,
          field,
        });
      }
      const nestedItemId = String(record(value[field]).itemId || "").trim();
      if (nestedItemId !== "" && nestedItemId !== itemId) {
        return fail("equipment_instance_item_conflict", "装备实例内部物品身份不一致，请联系GM处理。", {
          instanceId,
          itemId,
          field,
          nestedItemId,
        });
      }
    }
    const enhancement = record(value.enhancement);
    const maxEnhancement = item.expPill === true ? 0 : nonNegativeInteger(item.enhanceMax, 5);
    if (
      (Object.hasOwn(enhancement, "level") && (
        !Number.isSafeInteger(enhancement.level)
        || enhancement.level < 0
        || enhancement.level > maxEnhancement
      ))
      || (Object.hasOwn(enhancement, "history") && (
        !Array.isArray(enhancement.history)
        || enhancement.history.some((entry) => !isPlainRecord(entry))
      ))
    ) {
      return fail("equipment_instance_field_invalid", "装备实例内部档案异常，请联系GM处理。", {
        instanceId,
        itemId,
        field: "enhancement",
      });
    }
    const wearCounters = record(value.wearCounters);
    if (["attackCount", "hitCount"].some((field) => (
      Object.hasOwn(wearCounters, field)
      && (!Number.isSafeInteger(wearCounters[field]) || wearCounters[field] < 0)
    ))) {
      return fail("equipment_instance_field_invalid", "装备实例内部档案异常，请联系GM处理。", {
        instanceId,
        itemId,
        field: "wearCounters",
      });
    }
    const expPillCharge = record(value.expPillCharge);
    if (
      (Object.hasOwn(expPillCharge, "level") && (!Number.isSafeInteger(expPillCharge.level) || expPillCharge.level < 1))
      || (Object.hasOwn(expPillCharge, "exp") && (!Number.isSafeInteger(expPillCharge.exp) || expPillCharge.exp < 0))
      || (Object.hasOwn(expPillCharge, "nextExp") && (!Number.isSafeInteger(expPillCharge.nextExp) || expPillCharge.nextExp < 1))
    ) {
      return fail("equipment_instance_field_invalid", "装备实例内部档案异常，请联系GM处理。", {
        instanceId,
        itemId,
        field: "expPillCharge",
      });
    }
    const location = String(value.location || "").trim();
    const slotId = String(value.slotId || "").trim();
    if (!new Set(["backpack", "equipped"]).has(location)) {
      return fail("equipment_instance_location_invalid", "装备实例位置异常，请联系GM处理。", {instanceId, location});
    }
    if (location === "backpack" && slotId !== "") {
      return fail("equipment_instance_slot_invalid", "背包装备实例仍占用装备槽，请联系GM处理。", {instanceId, slotId});
    }
    if (location === "equipped" && String(item.slot || "") !== slotId) {
      return fail("equipment_instance_slot_invalid", "已穿戴装备实例的槽位异常，请联系GM处理。", {instanceId, slotId, itemId});
    }
    instances[instanceId] = clone({...value, schemaVersion, instanceId, itemId, location, slotId});
  }
  const serialState = nextEquipmentInstanceSerial(profile, instances);
  if (!serialState.ok) {
    return serialState;
  }
  return {ok: true, instances, nextSerial: serialState.serial};
}

function nextEquipmentInstanceSerial(profile, instances) {
  const rawSerial = Number((profile && profile.nextEquipmentInstanceSerial) ?? 1);
  if (!Number.isSafeInteger(rawSerial) || rawSerial < 1 || rawSerial > MAX_EQUIPMENT_INSTANCE_SERIAL + 1) {
    return fail("equipment_instance_serial_invalid", "装备实例序号异常，请联系GM处理。", {serial: rawSerial});
  }
  let serial = rawSerial;
  for (const instanceId of Object.keys(record(instances))) {
    const match = String(instanceId).match(/^equip_(\d+)$/);
    if (match) {
      const numericId = Number(match[1]);
      if (!Number.isSafeInteger(numericId) || numericId < 1 || numericId > MAX_EQUIPMENT_INSTANCE_SERIAL) {
        return fail("equipment_instance_serial_invalid", "装备实例编号超出安全范围，请联系GM处理。", {instanceId});
      }
      serial = Math.max(serial, numericId + 1);
    }
  }
  if (serial > MAX_EQUIPMENT_INSTANCE_SERIAL + 1) {
    return fail("equipment_instance_serial_exhausted", "装备实例编号已用尽，请联系GM处理。");
  }
  return {ok: true, serial};
}

function instanceIdForSerial(serial) {
  return `equip_${String(positiveInteger(serial, 1)).padStart(6, "0")}`;
}

function createFreshInstance(item, itemId, instanceId, source, options = {}) {
  const maxDurability = item.usesDurability === false
    ? 0
    : positiveInteger(item.durabilityMax, 30);
  const maxEnhancement = item.expPill === true
    ? 0
    : nonNegativeInteger(item.enhanceMax, 5);
  const expPillLevel = positiveInteger(item.expPillLevel, 1);
  const expToNextLevel = typeof options.expToNextLevel === "function" ? options.expToNextLevel : () => 1;
  return {
    schemaVersion: EQUIPMENT_INSTANCE_SCHEMA_VERSION,
    instanceId,
    itemId,
    location: "backpack",
    slotId: "",
    durability: maxDurability,
    enhancement: maxEnhancement > 0 ? {itemId, level: 0, history: []} : {},
    wearCounters: maxDurability > 0 ? {itemId, attackCount: 0, hitCount: 0} : {},
    expPillCharge: item.expPill === true ? {
      itemId,
      level: expPillLevel,
      exp: 0,
      nextExp: positiveInteger(expToNextLevel(expPillLevel), 1),
    } : {},
    source: String(source || ""),
  };
}

function instancesForItem(instances, itemId, location = "") {
  const normalizedItemId = String(itemId || "").trim();
  const normalizedLocation = String(location || "").trim();
  return Object.values(record(instances))
    .filter((entry) => (
      String(entry.itemId || "") === normalizedItemId
      && (normalizedLocation === "" || String(entry.location || "") === normalizedLocation)
    ))
    .sort((left, right) => String(left.instanceId || "").localeCompare(String(right.instanceId || "")));
}

function grantFreshBackpackEquipmentInstances(profile, catalog, entries, source = "", options = {}) {
  const equipmentEntries = equipmentTransferEntries(catalog, entries);
  if (equipmentEntries.length === 0) {
    return {ok: true, instanceIds: [], created: []};
  }
  const state = readEquipmentInstanceState(profile, catalog);
  if (!state.ok) {
    return state;
  }
  for (const entry of equipmentEntries) {
    if (!Number.isSafeInteger(entry.count) || entry.count < 1 || entry.count > MAX_EQUIPMENT_GRANT_COUNT) {
      return fail("equipment_grant_count_invalid", "单次装备发放数量异常，请联系GM处理。", {
        itemId: entry.itemId,
        count: entry.count,
      });
    }
    const item = catalogItem(catalog, entry.itemId);
    if (item && item.expPill === true && typeof options.expToNextLevel !== "function") {
      return fail("equipment_exp_pill_curve_missing", "经验丹等级曲线未配置，拒绝创建非规范实例。", {itemId: entry.itemId});
    }
    const templateCount = backpackItemCount(profile, entry.itemId);
    const instanceCount = instancesForItem(state.instances, entry.itemId, "backpack").length;
    const deficit = templateCount - instanceCount;
    if (deficit !== entry.count) {
      return fail("equipment_grant_state_conflict", "装备数量与实例档案不一致，本次发放已取消，请联系GM处理。", {
        itemId: entry.itemId,
        templateCount,
        instanceCount,
        expectedDeficit: entry.count,
      });
    }
  }
  const instances = clone(state.instances);
  const created = [];
  let nextSerial = state.nextSerial;
  for (const entry of equipmentEntries) {
    const item = catalogItem(catalog, entry.itemId);
    for (let index = 0; index < entry.count; index += 1) {
      if (nextSerial > MAX_EQUIPMENT_INSTANCE_SERIAL) {
        return fail("equipment_instance_serial_exhausted", "装备实例编号已用尽，请联系GM处理。");
      }
      let instanceId = instanceIdForSerial(nextSerial);
      let collisionCount = 0;
      while (Object.hasOwn(instances, instanceId)) {
        nextSerial += 1;
        collisionCount += 1;
        if (nextSerial > MAX_EQUIPMENT_INSTANCE_SERIAL || collisionCount > Object.keys(instances).length + 1) {
          return fail("equipment_instance_serial_exhausted", "装备实例编号已用尽，请联系GM处理。");
        }
        instanceId = instanceIdForSerial(nextSerial);
      }
      const instance = createFreshInstance(item, entry.itemId, instanceId, source, options);
      instances[instanceId] = instance;
      created.push(clone(instance));
      nextSerial += 1;
    }
  }
  profile.equipmentInstances = instances;
  profile.nextEquipmentInstanceSerial = positiveInteger(nextSerial, 1);
  profile.equipmentSlotsVersion = EQUIPMENT_SLOTS_VERSION;
  return {ok: true, instanceIds: created.map((entry) => entry.instanceId), created};
}

function instanceStateFingerprint(instance) {
  const value = clone(record(instance));
  delete value.instanceId;
  delete value.location;
  delete value.slotId;
  delete value.source;
  return stableStringify(value);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function selectBackpackEquipmentInstances(profile, catalog, itemId, count, options = {}) {
  const normalizedItemId = String(itemId || "").trim();
  const required = positiveInteger(count, 1);
  if (!isEquipmentItemId(catalog, normalizedItemId)) {
    return fail("equipment_item_invalid", "物品不是有效装备。", {itemId: normalizedItemId});
  }
  const state = readEquipmentInstanceState(profile, catalog);
  if (!state.ok) {
    return state;
  }
  const templateCount = backpackItemCount(profile, normalizedItemId);
  const candidates = instancesForItem(state.instances, normalizedItemId, "backpack");
  if (templateCount !== candidates.length) {
    return fail("equipment_backpack_state_conflict", "背包装备数量与实例档案不一致，请联系GM处理。", {
      itemId: normalizedItemId,
      templateCount,
      instanceCount: candidates.length,
    });
  }
  if (templateCount < required) {
    return fail("equipment_instance_missing", "背包中没有足够的装备实例。", {itemId: normalizedItemId, required, available: templateCount});
  }
  const requestedIds = Array.isArray(options.instanceIds)
    ? Array.from(new Set(options.instanceIds.map((value) => String(value || "").trim()).filter(Boolean)))
    : (String(options.instanceId || "").trim() ? [String(options.instanceId).trim()] : []);
  let selected = [];
  if (requestedIds.length > 0) {
    if (requestedIds.length !== required) {
      return fail("equipment_instance_selection_invalid", "请选择正确数量的装备实例。", {itemId: normalizedItemId, required});
    }
    const byId = new Map(candidates.map((entry) => [entry.instanceId, entry]));
    selected = requestedIds.map((instanceId) => byId.get(instanceId)).filter(Boolean);
    if (selected.length !== required) {
      return fail("equipment_instance_selection_invalid", "选择的装备实例不在背包中。", {itemId: normalizedItemId});
    }
  } else if (required === candidates.length) {
    selected = candidates;
  } else {
    const fingerprints = new Set(candidates.map(instanceStateFingerprint));
    if (fingerprints.size > 1) {
      return fail("equipment_instance_selection_ambiguous", "同名装备状态不同，请选择具体装备后再操作。", {
        itemId: normalizedItemId,
        available: candidates.length,
      });
    }
    selected = candidates.slice(0, required);
  }
  return {ok: true, state, selected: selected.map(clone)};
}

function consumeBackpackEquipmentInstances(profile, catalog, itemId, count, options = {}) {
  const selection = selectBackpackEquipmentInstances(profile, catalog, itemId, count, options);
  if (!selection.ok) {
    return selection;
  }
  const instances = clone(selection.state.instances);
  const selectedIds = selection.selected.map((entry) => entry.instanceId);
  const mappings = record(profile && profile.equipmentSlotInstanceIds);
  for (const instanceId of selectedIds) {
    if (Object.values(mappings).some((value) => String(value || "") === instanceId)) {
      return fail("equipment_instance_mapping_conflict", "背包装备仍被装备槽引用，请联系GM处理。", {instanceId});
    }
    delete instances[instanceId];
  }
  profile.equipmentInstances = instances;
  profile.equipmentSlotsVersion = EQUIPMENT_SLOTS_VERSION;
  return {ok: true, instanceIds: selectedIds, consumed: selection.selected};
}

function requireEquippedEquipmentInstance(profile, catalog, slotId) {
  const normalizedSlotId = String(slotId || "").trim();
  if (!catalog || !Array.isArray(catalog.slotIds) || !catalog.slotIds.includes(normalizedSlotId)) {
    return fail("equipment_slot_invalid", "装备槽无效。", {slotId: normalizedSlotId});
  }
  const slots = record(profile && profile.equipmentSlots);
  const itemId = String(slots[normalizedSlotId] || "").trim();
  const item = catalogItem(catalog, itemId);
  if (!item || String(item.slot || "") !== normalizedSlotId) {
    return fail("equipment_slot_state_invalid", "装备槽档案异常，请联系GM处理。", {slotId: normalizedSlotId, itemId});
  }
  const state = readEquipmentInstanceState(profile, catalog);
  if (!state.ok) {
    return state;
  }
  const mappings = record(profile && profile.equipmentSlotInstanceIds);
  const instanceId = String(mappings[normalizedSlotId] || "").trim();
  const instance = state.instances[instanceId] || null;
  const instancesInSlot = Object.values(state.instances).filter((entry) => (
    String(entry.location || "") === "equipped" && String(entry.slotId || "") === normalizedSlotId
  ));
  if (
    !instance
    || String(instance.itemId || "") !== itemId
    || String(instance.location || "") !== "equipped"
    || String(instance.slotId || "") !== normalizedSlotId
    || instancesInSlot.length !== 1
    || instancesInSlot[0].instanceId !== instanceId
  ) {
    return fail("equipment_slot_instance_conflict", "装备槽与实例档案不一致，请联系GM处理。", {
      slotId: normalizedSlotId,
      itemId,
      instanceId,
    });
  }
  const duplicateSlots = Object.entries(mappings)
    .filter(([, value]) => String(value || "") === instanceId)
    .map(([key]) => key);
  if (duplicateSlots.length !== 1 || duplicateSlots[0] !== normalizedSlotId) {
    return fail("equipment_slot_instance_conflict", "同一装备实例被多个槽位引用，请联系GM处理。", {instanceId, duplicateSlots});
  }
  return {ok: true, state, instanceId, instance: clone(instance), itemId, slotId: normalizedSlotId};
}

function moveBackpackEquipmentInstanceToSlot(profile, catalog, itemId, slotId, options = {}) {
  const normalizedSlotId = String(slotId || "").trim();
  const normalizedItemId = String(itemId || "").trim();
  const item = catalogItem(catalog, normalizedItemId);
  if (!item || String(item.slot || "") !== normalizedSlotId) {
    return fail("equipment_slot_invalid", "装备与槽位不匹配。", {itemId: normalizedItemId, slotId: normalizedSlotId});
  }
  const selection = selectBackpackEquipmentInstances(profile, catalog, normalizedItemId, 1, options);
  if (!selection.ok) {
    return selection;
  }
  const slots = record(profile && profile.equipmentSlots);
  const previousItemId = String(slots[normalizedSlotId] || "").trim();
  const existingEquippedInSlot = Object.values(selection.state.instances).filter((entry) => (
    String(entry.location || "") === "equipped" && String(entry.slotId || "") === normalizedSlotId
  ));
  let previous = null;
  if (previousItemId !== "") {
    previous = requireEquippedEquipmentInstance(profile, catalog, normalizedSlotId);
    if (!previous.ok) {
      return previous;
    }
  } else if (
    String(record(profile && profile.equipmentSlotInstanceIds)[normalizedSlotId] || "").trim() !== ""
    || existingEquippedInSlot.length > 0
  ) {
    return fail("equipment_slot_instance_conflict", "空装备槽仍引用实例，请联系GM处理。", {slotId: normalizedSlotId});
  }
  const target = selection.selected[0];
  const existingMappings = record(profile && profile.equipmentSlotInstanceIds);
  const targetMappedSlots = Object.entries(existingMappings)
    .filter(([, value]) => String(value || "") === target.instanceId)
    .map(([key]) => key);
  if (targetMappedSlots.length > 0) {
    return fail("equipment_instance_mapping_conflict", "背包装备仍被装备槽引用，请联系GM处理。", {
      instanceId: target.instanceId,
      mappedSlots: targetMappedSlots,
    });
  }
  if (previous && previous.instanceId === target.instanceId) {
    return fail("equipment_slot_instance_conflict", "装备实例位置冲突，请联系GM处理。", {instanceId: target.instanceId});
  }
  const instances = clone(selection.state.instances);
  const mappings = clone(existingMappings);
  if (previous) {
    instances[previous.instanceId] = {...instances[previous.instanceId], location: "backpack", slotId: ""};
  }
  instances[target.instanceId] = {...instances[target.instanceId], location: "equipped", slotId: normalizedSlotId};
  mappings[normalizedSlotId] = target.instanceId;
  profile.equipmentInstances = instances;
  profile.equipmentSlotInstanceIds = mappings;
  profile.equipmentSlotsVersion = EQUIPMENT_SLOTS_VERSION;
  return {
    ok: true,
    instanceId: target.instanceId,
    instance: clone(instances[target.instanceId]),
    previousInstanceId: previous ? previous.instanceId : "",
    previousInstance: previous ? clone(instances[previous.instanceId]) : null,
  };
}

function moveEquippedEquipmentInstanceToBackpack(profile, catalog, slotId) {
  const equipped = requireEquippedEquipmentInstance(profile, catalog, slotId);
  if (!equipped.ok) {
    return equipped;
  }
  const instances = clone(equipped.state.instances);
  const mappings = clone(record(profile && profile.equipmentSlotInstanceIds));
  instances[equipped.instanceId] = {...instances[equipped.instanceId], location: "backpack", slotId: ""};
  delete mappings[equipped.slotId];
  profile.equipmentInstances = instances;
  profile.equipmentSlotInstanceIds = mappings;
  profile.equipmentSlotsVersion = EQUIPMENT_SLOTS_VERSION;
  return {ok: true, instanceId: equipped.instanceId, instance: clone(instances[equipped.instanceId])};
}

function auditEquipmentProfileState(profile, catalog) {
  const state = readEquipmentInstanceState(profile, catalog);
  if (!state.ok) {
    return {...state, conflicts: [{code: state.code, ...state}]};
  }
  const conflicts = [];
  const slots = record(profile && profile.equipmentSlots);
  const mappings = record(profile && profile.equipmentSlotInstanceIds);
  const referenced = new Map();
  for (const slotId of Object.keys(slots)) {
    if (!Array.isArray(catalog && catalog.slotIds) || !catalog.slotIds.includes(slotId)) {
      conflicts.push({code: "unknown_equipment_slot", slotId, itemId: String(slots[slotId] || "")});
    }
  }
  for (const slotId of Array.isArray(catalog && catalog.slotIds) ? catalog.slotIds : []) {
    const itemId = String(slots[slotId] || "").trim();
    const instanceId = String(mappings[slotId] || "").trim();
    if (itemId === "" && instanceId === "") {
      continue;
    }
    const item = catalogItem(catalog, itemId);
    const instance = state.instances[instanceId] || null;
    if (!item || String(item.slot || "") !== slotId) {
      conflicts.push({code: "slot_item_invalid", slotId, itemId});
      continue;
    }
    if (!instance || instance.itemId !== itemId || instance.location !== "equipped" || instance.slotId !== slotId) {
      conflicts.push({code: "slot_instance_mismatch", slotId, itemId, instanceId});
      continue;
    }
    if (referenced.has(instanceId)) {
      conflicts.push({code: "duplicate_slot_mapping", slotId, instanceId, otherSlotId: referenced.get(instanceId)});
    }
    referenced.set(instanceId, slotId);
  }
  for (const [slotId, instanceIdValue] of Object.entries(mappings)) {
    if (!Array.isArray(catalog && catalog.slotIds) || !catalog.slotIds.includes(slotId)) {
      conflicts.push({code: "unknown_slot_mapping", slotId, instanceId: String(instanceIdValue || "")});
    }
  }
  for (const instance of Object.values(state.instances)) {
    if (instance.location === "equipped" && !referenced.has(instance.instanceId)) {
      conflicts.push({code: "orphan_equipped_instance", instanceId: instance.instanceId, itemId: instance.itemId});
    }
    if (instance.location === "backpack" && referenced.has(instance.instanceId)) {
      conflicts.push({code: "backpack_instance_mapped", instanceId: instance.instanceId, itemId: instance.itemId});
    }
  }
  for (const itemId of catalog && catalog.itemById instanceof Map ? catalog.itemById.keys() : []) {
    const templateCount = backpackItemCount(profile, itemId);
    const instanceCount = instancesForItem(state.instances, itemId, "backpack").length;
    if (templateCount !== instanceCount) {
      conflicts.push({code: "backpack_count_mismatch", itemId, templateCount, instanceCount});
    }
  }
  if (Number(profile && profile.equipmentSlotsVersion || 0) !== EQUIPMENT_SLOTS_VERSION) {
    conflicts.push({
      code: "equipment_slots_version_mismatch",
      expected: EQUIPMENT_SLOTS_VERSION,
      actual: Number(profile && profile.equipmentSlotsVersion || 0),
    });
  }
  return {
    ok: conflicts.length === 0,
    code: conflicts.length === 0 ? "" : "equipment_profile_state_conflict",
    message: conflicts.length === 0 ? "装备实例档案一致。" : "装备数量、实例或槽位映射不一致。",
    conflicts,
    summary: {
      instanceCount: Object.keys(state.instances).length,
      backpackInstanceCount: Object.values(state.instances).filter((entry) => entry.location === "backpack").length,
      equippedInstanceCount: Object.values(state.instances).filter((entry) => entry.location === "equipped").length,
      mappedSlotCount: referenced.size,
      schemaVersion: 1,
    },
  };
}

module.exports = {
  EQUIPMENT_INSTANCE_SCHEMA_VERSION,
  EQUIPMENT_SLOTS_VERSION,
  auditEquipmentProfileState,
  containsEquipmentTransfer,
  consumeBackpackEquipmentInstances,
  equipmentTransferEntries,
  firstEquipmentTransferEntry,
  grantFreshBackpackEquipmentInstances,
  isEquipmentItemId,
  moveBackpackEquipmentInstanceToSlot,
  moveEquippedEquipmentInstanceToBackpack,
  readEquipmentInstanceState,
  requireEquippedEquipmentInstance,
  selectBackpackEquipmentInstances,
};
