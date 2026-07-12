"use strict";

const crypto = require("node:crypto");
const {
  EQUIPMENT_INSTANCE_SCHEMA_VERSION,
  EQUIPMENT_SLOTS_VERSION,
  MAX_EQUIPMENT_INSTANCE_SERIAL,
  auditEquipmentProfileState,
  equipmentInstanceIdForSerial,
  readEquipmentInstanceState,
  selectBackpackEquipmentInstances,
} = require("./equipment-profile-state");

const EQUIPMENT_TRANSFER_ENVELOPE_SCHEMA_VERSION = 1;
const MAX_ENVELOPE_ID_LENGTH = 160;
const ENVELOPE_FIELDS = new Set([
  "schemaVersion",
  "envelopeId",
  "itemId",
  "instanceState",
  "stateFingerprint",
  "provenance",
]);
const PUBLIC_ENVELOPE_FIELDS = new Set([
  "schemaVersion",
  "envelopeId",
  "itemId",
  "instanceState",
  "stateFingerprint",
]);
const PROVENANCE_FIELDS = new Set(["schemaVersion", "sourceInstanceId"]);
const DETACHED_IDENTITY_FIELDS = new Set(["instanceId", "location", "slotId"]);
const REQUIRED_INSTANCE_STATE_FIELDS = [
  "schemaVersion",
  "itemId",
  "durability",
  "enhancement",
  "wearCounters",
  "expPillCharge",
  "source",
];
const REQUIRED_PUBLIC_INSTANCE_STATE_FIELDS = REQUIRED_INSTANCE_STATE_FIELDS.filter((field) => field !== "source");
const UNSAFE_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function fail(code, message, details = {}) {
  return {ok: false, code, message, ...details};
}

function hasExactFields(value, fields) {
  if (!isRecord(value) || Object.keys(value).length !== fields.size) {
    return false;
  }
  return Object.keys(value).every((key) => fields.has(key));
}

function jsonSafeConflict(value, pathValue = "$", ancestors = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && !Object.is(value, -0)
      ? null
      : {path: pathValue, reason: "number_not_json_safe"};
  }
  if (typeof value !== "object") {
    return {path: pathValue, reason: `unsupported_${typeof value}`};
  }
  if (ancestors.has(value)) {
    return {path: pathValue, reason: "cyclic_reference"};
  }
  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return {path: pathValue, reason: "non_plain_object"};
    }
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    const expectedIndexKeys = new Set(Array.from({length: value.length}, (_, index) => String(index)));
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        ancestors.delete(value);
        return {path: pathValue, reason: "symbol_object_key"};
      }
      if (key !== "length" && !expectedIndexKeys.has(key)) {
        ancestors.delete(value);
        return {path: `${pathValue}.${key}`, reason: "non_json_array_key"};
      }
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, "value")) {
        ancestors.delete(value);
        return {path: `${pathValue}[${index}]`, reason: "non_json_property_descriptor"};
      }
      const conflict = jsonSafeConflict(descriptor.value, `${pathValue}[${index}]`, ancestors);
      if (conflict) {
        ancestors.delete(value);
        return conflict;
      }
    }
  } else {
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) {
      ancestors.delete(value);
      return {path: pathValue, reason: "symbol_object_key"};
    }
    for (const key of ownKeys.sort()) {
      if (UNSAFE_JSON_KEYS.has(key)) {
        ancestors.delete(value);
        return {path: `${pathValue}.${key}`, reason: "dangerous_object_key"};
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, "value")) {
        ancestors.delete(value);
        return {path: `${pathValue}.${key}`, reason: "non_json_property_descriptor"};
      }
      const conflict = jsonSafeConflict(descriptor.value, `${pathValue}.${key}`, ancestors);
      if (conflict) {
        ancestors.delete(value);
        return conflict;
      }
    }
  }
  ancestors.delete(value);
  return null;
}

function jsonUnsafeFailure(conflict) {
  return fail("equipment_transfer_json_unsafe", "装备转运状态含不能安全持久化的值。", conflict || {});
}

function integer(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : Math.trunc(Number(fallback || 0));
}

function positiveInteger(value, fallback = 1) {
  return Math.max(1, integer(value, fallback));
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? JSON.stringify(String(value)) : encoded;
}

function equipmentTransferStateFingerprint(value) {
  const state = isRecord(value) && isRecord(value.instanceState) ? value.instanceState : value;
  const conflict = jsonSafeConflict(state, "instanceState");
  if (conflict) {
    const error = new TypeError("equipment transfer fingerprints require strict JSON-safe state");
    error.code = "equipment_transfer_json_unsafe";
    error.details = conflict;
    throw error;
  }
  return crypto.createHash("sha256").update(stableStringify(state)).digest("hex");
}

function hasValidPublicInstanceStateShape(state, itemId) {
  if (
    !isRecord(state)
    || state.schemaVersion !== EQUIPMENT_INSTANCE_SCHEMA_VERSION
    || state.itemId !== itemId
    || REQUIRED_PUBLIC_INSTANCE_STATE_FIELDS.some((field) => !Object.hasOwn(state, field))
    || !Number.isSafeInteger(state.durability)
    || state.durability < 0
    || !isRecord(state.enhancement)
    || !isRecord(state.wearCounters)
    || !isRecord(state.expPillCharge)
  ) {
    return false;
  }
  if (Object.keys(state.enhancement).length > 0 && (
    state.enhancement.itemId !== itemId
    || !Number.isSafeInteger(state.enhancement.level)
    || state.enhancement.level < 0
    || !Array.isArray(state.enhancement.history)
    || state.enhancement.history.some((entry) => !isRecord(entry))
  )) {
    return false;
  }
  if (Object.keys(state.wearCounters).length > 0 && (
    state.wearCounters.itemId !== itemId
    || !Number.isSafeInteger(state.wearCounters.attackCount)
    || state.wearCounters.attackCount < 0
    || !Number.isSafeInteger(state.wearCounters.hitCount)
    || state.wearCounters.hitCount < 0
  )) {
    return false;
  }
  if (Object.keys(state.expPillCharge).length > 0 && (
    state.expPillCharge.itemId !== itemId
    || !Number.isSafeInteger(state.expPillCharge.level)
    || state.expPillCharge.level < 1
    || !Number.isSafeInteger(state.expPillCharge.exp)
    || state.expPillCharge.exp < 0
    || !Number.isSafeInteger(state.expPillCharge.nextExp)
    || state.expPillCharge.nextExp < 1
  )) {
    return false;
  }
  return true;
}

function catalogItem(catalog, itemId) {
  return catalog && catalog.itemById instanceof Map
    ? catalog.itemById.get(String(itemId || "").trim()) || null
    : null;
}

function itemMaxDurability(item) {
  return item && item.usesDurability === false ? 0 : positiveInteger(item && item.durabilityMax, 30);
}

function itemMaxEnhancement(item) {
  return item && item.expPill === true ? 0 : Math.max(0, integer(item && item.enhanceMax, 5));
}

function canonicalDetachedInstanceState(stateValue, item, itemId, options = {}) {
  const jsonConflict = jsonSafeConflict(stateValue, "instanceState");
  if (jsonConflict) {
    return jsonUnsafeFailure(jsonConflict);
  }
  if (!isRecord(stateValue)) {
    return fail("equipment_transfer_instance_state_invalid", "装备转运状态必须是对象。");
  }
  const state = stateValue;
  const reservedField = Object.keys(state).sort().find((key) => DETACHED_IDENTITY_FIELDS.has(key));
  if (reservedField) {
    return fail(
      "equipment_transfer_identity_embedded",
      "装备转运信封不能携带源档案的位置或本地实例身份。",
      {field: reservedField},
    );
  }
  const missingField = REQUIRED_INSTANCE_STATE_FIELDS.find((field) => !Object.hasOwn(state, field));
  if (missingField) {
    return fail(
      "equipment_transfer_instance_state_invalid",
      "装备转运状态缺少当前版本必需字段。",
      {field: missingField},
    );
  }
  const schemaVersion = state.schemaVersion;
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return fail("equipment_transfer_instance_schema_invalid", "装备转运实例版本异常。", {schemaVersion});
  }
  if (schemaVersion > EQUIPMENT_INSTANCE_SCHEMA_VERSION) {
    return fail("equipment_transfer_instance_schema_future", "装备转运实例来自更高版本，当前服务器拒绝改写。", {schemaVersion});
  }
  if (schemaVersion !== EQUIPMENT_INSTANCE_SCHEMA_VERSION || state.itemId !== itemId) {
    return fail("equipment_transfer_instance_identity_conflict", "装备转运实例与信封物品身份不一致。", {
      itemId,
      stateItemId: state.itemId,
    });
  }
  if (typeof state.source !== "string") {
    return fail("equipment_transfer_instance_state_invalid", "装备转运来源字段异常。", {field: "source"});
  }

  const maxDurability = itemMaxDurability(item);
  if (!Number.isSafeInteger(state.durability) || state.durability < 0 || state.durability > maxDurability) {
    return fail("equipment_transfer_instance_state_invalid", "装备转运耐久状态异常。", {field: "durability"});
  }

  const enhancement = state.enhancement;
  const maxEnhancement = itemMaxEnhancement(item);
  if (!isRecord(enhancement)) {
    return fail("equipment_transfer_instance_state_invalid", "装备转运强化状态异常。", {field: "enhancement"});
  }
  if (maxEnhancement > 0) {
    if (
      enhancement.itemId !== itemId
      || !Number.isSafeInteger(enhancement.level)
      || enhancement.level < 0
      || enhancement.level > maxEnhancement
      || !Array.isArray(enhancement.history)
      || enhancement.history.some((entry) => !isRecord(entry))
    ) {
      return fail("equipment_transfer_instance_state_invalid", "装备转运强化状态异常。", {field: "enhancement"});
    }
  } else if (Object.keys(enhancement).length > 0) {
    return fail("equipment_transfer_instance_state_invalid", "不可强化装备携带了强化状态。", {field: "enhancement"});
  }

  const wearCounters = state.wearCounters;
  if (!isRecord(wearCounters)) {
    return fail("equipment_transfer_instance_state_invalid", "装备转运磨损状态异常。", {field: "wearCounters"});
  }
  if (maxDurability > 0) {
    if (
      wearCounters.itemId !== itemId
      || !Number.isSafeInteger(wearCounters.attackCount)
      || wearCounters.attackCount < 0
      || !Number.isSafeInteger(wearCounters.hitCount)
      || wearCounters.hitCount < 0
    ) {
      return fail("equipment_transfer_instance_state_invalid", "装备转运磨损状态异常。", {field: "wearCounters"});
    }
    const weaponSlots = new Set(Array.isArray(options.weaponSlotIds)
      ? options.weaponSlotIds.map(String)
      : ["right_hand_weapon", "left_hand_weapon"]);
    const isWeapon = weaponSlots.has(String(item.slot || ""));
    const attackLimit = positiveInteger(options.weaponAttacksPerDurability, 100);
    const hitLimit = positiveInteger(options.armorHitsPerDurability, 10);
    if (
      (isWeapon && (wearCounters.attackCount >= attackLimit || wearCounters.hitCount !== 0))
      || (!isWeapon && (wearCounters.hitCount >= hitLimit || wearCounters.attackCount !== 0))
    ) {
      return fail("equipment_transfer_instance_state_invalid", "装备转运磨损余数不是当前版本规范值。", {
        field: "wearCounters",
      });
    }
  } else if (state.durability !== 0 || Object.keys(wearCounters).length > 0) {
    return fail("equipment_transfer_instance_state_invalid", "无耐久装备携带了磨损状态。", {field: "wearCounters"});
  }

  const expPillCharge = state.expPillCharge;
  if (!isRecord(expPillCharge)) {
    return fail("equipment_transfer_instance_state_invalid", "装备转运充能状态异常。", {field: "expPillCharge"});
  }
  if (item.expPill === true) {
    const level = expPillCharge.level;
    const exp = expPillCharge.exp;
    const nextExp = expPillCharge.nextExp;
    const baseLevel = positiveInteger(item.expPillLevel, 1);
    const maxLevel = positiveInteger(options.maxPlayerLevel, 140);
    if (
      expPillCharge.itemId !== itemId
      || !Number.isSafeInteger(level) || level < baseLevel || level > maxLevel
      || !Number.isSafeInteger(exp) || exp < 0
      || !Number.isSafeInteger(nextExp) || nextExp < 1
      || (level < maxLevel && exp >= nextExp)
      || (level >= maxLevel && exp !== 0)
    ) {
      return fail("equipment_transfer_instance_state_invalid", "装备转运经验丹充能异常。", {field: "expPillCharge"});
    }
    if (typeof options.expToNextLevel === "function") {
      const expectedNextExp = positiveInteger(options.expToNextLevel(level), 1);
      if (nextExp !== expectedNextExp) {
        return fail("equipment_transfer_instance_state_invalid", "装备转运经验丹曲线不一致。", {
          field: "expPillCharge.nextExp",
          expectedNextExp,
          actualNextExp: nextExp,
        });
      }
    }
  } else if (Object.keys(expPillCharge).length > 0) {
    return fail("equipment_transfer_instance_state_invalid", "普通装备携带了经验丹充能。", {field: "expPillCharge"});
  }
  return {ok: true, state: clone(state)};
}

function validateEquipmentTransferEnvelope(envelopeValue, catalog, options = {}) {
  const jsonConflict = jsonSafeConflict(envelopeValue, "envelope");
  if (jsonConflict) {
    return jsonUnsafeFailure(jsonConflict);
  }
  if (!isRecord(envelopeValue)) {
    return fail("equipment_transfer_envelope_invalid", "装备转运信封必须是对象。");
  }
  const envelope = envelopeValue;
  const schemaVersion = envelope.schemaVersion;
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return fail("equipment_transfer_envelope_schema_invalid", "装备转运信封版本异常。", {schemaVersion});
  }
  if (schemaVersion > EQUIPMENT_TRANSFER_ENVELOPE_SCHEMA_VERSION) {
    return fail("equipment_transfer_envelope_schema_future", "装备转运信封来自更高版本，当前服务器拒绝改写。", {schemaVersion});
  }
  const unknownField = Object.keys(envelope).sort().find((key) => !ENVELOPE_FIELDS.has(key));
  if (unknownField) {
    return fail("equipment_transfer_envelope_field_unknown", "装备转运信封含当前版本无法识别的字段。", {field: unknownField});
  }
  const envelopeId = typeof envelope.envelopeId === "string" ? envelope.envelopeId : "";
  if (
    envelopeId === ""
    || envelopeId !== envelopeId.trim()
    || envelopeId.length > MAX_ENVELOPE_ID_LENGTH
    || !/^eqx_[A-Za-z0-9_-]{8,156}$/.test(envelopeId)
  ) {
    return fail("equipment_transfer_envelope_id_invalid", "装备转运信封身份异常。");
  }
  const itemId = typeof envelope.itemId === "string" ? envelope.itemId : "";
  const item = catalogItem(catalog, itemId);
  if (itemId === "" || itemId !== itemId.trim() || !item) {
    return fail("equipment_transfer_item_invalid", "装备转运信封引用了未知装备。", {itemId});
  }
  if (!isRecord(envelope.provenance)) {
    return fail("equipment_transfer_provenance_invalid", "装备转运来源证明异常。");
  }
  const unknownProvenanceField = Object.keys(envelope.provenance).sort().find((key) => !PROVENANCE_FIELDS.has(key));
  const sourceInstanceId = typeof envelope.provenance.sourceInstanceId === "string"
    ? envelope.provenance.sourceInstanceId
    : "";
  if (
    unknownProvenanceField
    || envelope.provenance.schemaVersion !== 1
    || sourceInstanceId === ""
    || sourceInstanceId !== sourceInstanceId.trim()
  ) {
    return fail("equipment_transfer_provenance_invalid", "装备转运来源证明异常。", {
      ...(unknownProvenanceField ? {field: unknownProvenanceField} : {}),
    });
  }
  const state = canonicalDetachedInstanceState(envelope.instanceState, item, itemId, options);
  if (!state.ok) {
    return state;
  }
  const stateFingerprint = equipmentTransferStateFingerprint(state.state);
  if (
    typeof envelope.stateFingerprint !== "string"
    || !/^[a-f0-9]{64}$/.test(envelope.stateFingerprint)
    || envelope.stateFingerprint !== stateFingerprint
  ) {
    return fail("equipment_transfer_fingerprint_mismatch", "装备转运状态指纹不一致，当前服务器拒绝接收。", {
      envelopeId,
    });
  }
  return {
    ok: true,
    envelope: clone(envelope),
    instanceState: state.state,
    stateFingerprint,
  };
}

function validateEquipmentTransferEnvelopeBatch(envelopesValue, catalog, options = {}) {
  const jsonConflict = jsonSafeConflict(envelopesValue, "envelopes");
  if (jsonConflict) {
    return jsonUnsafeFailure(jsonConflict);
  }
  if (!Array.isArray(envelopesValue)) {
    return fail("equipment_transfer_envelope_batch_invalid", "装备转运信封批次必须是数组。");
  }
  const envelopes = [];
  const firstIndexById = new Map();
  for (const [index, value] of envelopesValue.entries()) {
    const validated = validateEquipmentTransferEnvelope(value, catalog, options);
    if (!validated.ok) {
      return {...validated, index};
    }
    const envelopeId = validated.envelope.envelopeId;
    if (firstIndexById.has(envelopeId)) {
      return fail("equipment_transfer_envelope_duplicate", "同一容器不能重复持有同一个装备转运信封。", {
        envelopeId,
        firstIndex: firstIndexById.get(envelopeId),
        index,
      });
    }
    firstIndexById.set(envelopeId, index);
    envelopes.push(validated.envelope);
  }
  return {
    ok: true,
    envelopes,
    stateFingerprints: envelopes.map((entry) => entry.stateFingerprint),
  };
}

function validateBackpackSlots(profile, itemId, options = {}) {
  const slots = profile && profile.backpackSlots;
  if (!Array.isArray(slots)) {
    return fail("equipment_transfer_backpack_invalid", "背包装备容器异常。", {reason: "not_array"});
  }
  const slotLimit = Number(options.backpackSlotLimit);
  const stackLimit = Number(options.stackLimit);
  if (!Number.isSafeInteger(slotLimit) || slotLimit < 1 || slots.length > slotLimit) {
    return fail("equipment_transfer_capacity_config_invalid", "装备转运缺少安全的背包容量配置。", {
      slotLimit,
      slotCount: slots.length,
    });
  }
  if (!Number.isSafeInteger(stackLimit) || stackLimit < 1) {
    return fail("equipment_transfer_capacity_config_invalid", "装备转运缺少安全的堆叠上限配置。", {stackLimit});
  }
  for (const [index, slot] of slots.entries()) {
    if (!isRecord(slot)) {
      return fail("equipment_transfer_backpack_invalid", "背包格子异常。", {index});
    }
    if (Object.keys(slot).some((key) => !["itemId", "count"].includes(key))) {
      return fail("equipment_transfer_backpack_invalid", "背包格子含当前版本无法识别的字段。", {index});
    }
    const slotItemId = String(slot.itemId || "");
    const count = Number(slot.count ?? 0);
    if (slotItemId !== slotItemId.trim()) {
      return fail("equipment_transfer_backpack_invalid", "背包物品身份异常。", {index});
    }
    if (slotItemId === "") {
      if (!Number.isSafeInteger(count) || count !== 0) {
        return fail("equipment_transfer_backpack_invalid", "背包空格数量异常。", {index});
      }
      continue;
    }
    if (!Number.isSafeInteger(count) || count < 1 || (slotItemId === itemId && count > stackLimit)) {
      return fail("equipment_transfer_backpack_invalid", "背包物品数量异常。", {index, itemId: slotItemId, count});
    }
  }
  return {ok: true, slots: clone(slots), slotLimit, stackLimit};
}

function removeOneTemplate(slotsValue, itemId, sourceSlotIndex = -1) {
  const slots = clone(slotsValue);
  const requestedIndex = Number(sourceSlotIndex);
  if (requestedIndex !== -1 && (!Number.isSafeInteger(requestedIndex) || requestedIndex < 0)) {
    return fail("equipment_transfer_source_slot_invalid", "选择的背包格无效。", {sourceSlotIndex});
  }
  const index = requestedIndex >= 0
    ? requestedIndex
    : slots.findIndex((slot) => String(slot && slot.itemId || "") === itemId && Number(slot.count || 0) > 0);
  if (index < 0) {
    return fail("equipment_transfer_template_missing", "背包中没有与实例对应的装备模板。", {itemId});
  }
  if (
    index >= slots.length
    || String(slots[index] && slots[index].itemId || "") !== itemId
    || !Number.isSafeInteger(Number(slots[index] && slots[index].count))
    || Number(slots[index].count) < 1
  ) {
    return fail("equipment_transfer_source_slot_mismatch", "选择的背包格与装备实例不一致。", {
      itemId,
      sourceSlotIndex: index,
    });
  }
  const count = Number(slots[index].count);
  slots[index] = count > 1 ? {itemId, count: count - 1} : {};
  return {ok: true, slots};
}

function addOneTemplate(slotsValue, itemId, slotLimit, stackLimit) {
  const slots = clone(slotsValue);
  const stackIndex = slots.findIndex((slot) => (
    String(slot && slot.itemId || "") === itemId && Number(slot.count || 0) < stackLimit
  ));
  if (stackIndex >= 0) {
    slots[stackIndex] = {itemId, count: Number(slots[stackIndex].count) + 1};
    return {ok: true, slots};
  }
  const emptyIndex = slots.findIndex((slot) => String(slot && slot.itemId || "") === "");
  if (emptyIndex >= 0) {
    slots[emptyIndex] = {itemId, count: 1};
    return {ok: true, slots};
  }
  if (slots.length < slotLimit) {
    slots.push({itemId, count: 1});
    return {ok: true, slots};
  }
  return fail("equipment_transfer_backpack_full", "背包空间不足，无法接收装备实例。", {itemId});
}

function inspectBackpackEquipmentExport(profileValue, catalog, itemIdValue, instanceIdValue, options = {}) {
  const profileJsonConflict = jsonSafeConflict(profileValue, "profile");
  if (profileJsonConflict) {
    return jsonUnsafeFailure(profileJsonConflict);
  }
  const source = clone(profileValue);
  const itemId = String(itemIdValue || "").trim();
  const instanceId = String(instanceIdValue || "").trim();
  if (itemId === "" || !catalogItem(catalog, itemId)) {
    return fail("equipment_transfer_item_invalid", "请选择有效装备后再转运。", {itemId});
  }
  if (instanceId === "") {
    return fail("equipment_transfer_instance_selection_required", "请选择具体装备实例后再转运。", {itemId});
  }
  const backpack = validateBackpackSlots(source, itemId, options);
  if (!backpack.ok) {
    return backpack;
  }
  const audit = auditEquipmentProfileState(source, catalog);
  if (!audit.ok) {
    return fail(audit.code || "equipment_transfer_source_conflict", audit.message || "源装备档案异常。", {
      conflicts: clone(audit.conflicts || []),
    });
  }
  const selection = selectBackpackEquipmentInstances(source, catalog, itemId, 1, {instanceId});
  if (!selection.ok) {
    return selection;
  }
  const instance = selection.selected[0];
  if (!instance || instance.itemId !== itemId || instance.location !== "backpack" || instance.slotId !== "") {
    return fail("equipment_transfer_instance_selection_invalid", "选择的装备实例不在背包中。", {itemId, instanceId});
  }
  const state = clone(instance);
  for (const field of DETACHED_IDENTITY_FIELDS) {
    delete state[field];
  }
  const canonical = canonicalDetachedInstanceState(state, catalogItem(catalog, itemId), itemId, options);
  if (!canonical.ok) {
    return canonical;
  }
  return {
    ok: true,
    source,
    itemId,
    instanceId,
    backpack,
    selection,
    instanceState: canonical.state,
    stateFingerprint: equipmentTransferStateFingerprint(canonical.state),
  };
}

function finalizeBackpackEquipmentExport(inspected, catalog, options = {}) {
  const sourceSlotIndex = Object.hasOwn(options, "sourceSlotIndex") ? options.sourceSlotIndex : -1;
  const removedTemplate = removeOneTemplate(
    inspected.backpack.slots,
    inspected.itemId,
    sourceSlotIndex,
  );
  if (!removedTemplate.ok) {
    return removedTemplate;
  }
  const candidate = clone(inspected.source);
  const instances = clone(inspected.selection.state.instances);
  delete instances[inspected.instanceId];
  candidate.backpackSlots = removedTemplate.slots;
  candidate.equipmentInstances = instances;
  candidate.equipmentSlotsVersion = EQUIPMENT_SLOTS_VERSION;
  const candidateAudit = auditEquipmentProfileState(candidate, catalog);
  if (!candidateAudit.ok) {
    return fail("equipment_transfer_export_invariant_failed", "装备导出后的档案校验失败，操作已取消。", {
      conflicts: clone(candidateAudit.conflicts || []),
    });
  }
  return {ok: true, profile: candidate};
}

function previewBackpackEquipmentTransfer(profileValue, catalog, itemIdValue, instanceIdValue, options = {}) {
  const inspected = inspectBackpackEquipmentExport(
    profileValue,
    catalog,
    itemIdValue,
    instanceIdValue,
    options,
  );
  if (!inspected.ok) {
    return inspected;
  }
  const finalized = finalizeBackpackEquipmentExport(inspected, catalog, options);
  if (!finalized.ok) {
    return finalized;
  }
  return {
    ok: true,
    profile: finalized.profile,
    itemId: inspected.itemId,
    instanceId: inspected.instanceId,
    stateFingerprint: inspected.stateFingerprint,
  };
}

function exportBackpackEquipmentEnvelope(profileValue, catalog, itemIdValue, instanceIdValue, options = {}) {
  const inspected = inspectBackpackEquipmentExport(
    profileValue,
    catalog,
    itemIdValue,
    instanceIdValue,
    options,
  );
  if (!inspected.ok) {
    return inspected;
  }
  const envelopeId = typeof options.envelopeId === "string" ? options.envelopeId : "";
  const envelope = {
    schemaVersion: EQUIPMENT_TRANSFER_ENVELOPE_SCHEMA_VERSION,
    envelopeId,
    itemId: inspected.itemId,
    instanceState: inspected.instanceState,
    stateFingerprint: inspected.stateFingerprint,
    provenance: {
      schemaVersion: 1,
      sourceInstanceId: inspected.instanceId,
    },
  };
  const validatedEnvelope = validateEquipmentTransferEnvelope(envelope, catalog, options);
  if (!validatedEnvelope.ok) {
    return validatedEnvelope;
  }
  const finalized = finalizeBackpackEquipmentExport(inspected, catalog, options);
  if (!finalized.ok) {
    return finalized;
  }
  return {
    ok: true,
    profile: finalized.profile,
    envelope: validatedEnvelope.envelope,
    stateFingerprint: validatedEnvelope.stateFingerprint,
    publicSummary: publicEquipmentTransferSummary(validatedEnvelope.envelope, catalog, options),
  };
}

function nextLocalInstanceId(profile, state, forbiddenInstanceIds = []) {
  let serial = state.nextSerial;
  const instances = state.instances;
  const forbidden = new Set((Array.isArray(forbiddenInstanceIds) ? forbiddenInstanceIds : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean));
  while (serial <= MAX_EQUIPMENT_INSTANCE_SERIAL) {
    const instanceId = equipmentInstanceIdForSerial(serial);
    if (!Object.hasOwn(instances, instanceId) && !forbidden.has(instanceId)) {
      return {ok: true, instanceId, nextSerial: serial + 1};
    }
    serial += 1;
  }
  return fail("equipment_instance_serial_exhausted", "装备实例编号已用尽，请联系GM处理。");
}

function importBackpackEquipmentEnvelope(profileValue, catalog, envelopeValue, options = {}) {
  const profileJsonConflict = jsonSafeConflict(profileValue, "profile");
  if (profileJsonConflict) {
    return jsonUnsafeFailure(profileJsonConflict);
  }
  const source = clone(profileValue);
  const envelope = validateEquipmentTransferEnvelope(envelopeValue, catalog, options);
  if (!envelope.ok) {
    return envelope;
  }
  // A fingerprint detects state corruption; it is not a signature or client authority.
  // Only server-created or server-persisted envelopes may cross this materialization boundary.
  if (options.trustedServerEnvelope !== true) {
    return fail("equipment_transfer_envelope_untrusted", "客户端不能提交完整装备信封，请只提交服务器签发的实例选择意图。");
  }
  const backpack = validateBackpackSlots(source, envelope.envelope.itemId, options);
  if (!backpack.ok) {
    return backpack;
  }
  const audit = auditEquipmentProfileState(source, catalog);
  if (!audit.ok) {
    return fail(audit.code || "equipment_transfer_target_conflict", audit.message || "目标装备档案异常。", {
      conflicts: clone(audit.conflicts || []),
    });
  }
  const state = readEquipmentInstanceState(source, catalog);
  if (!state.ok) {
    return state;
  }
  const replayedInstance = Object.values(state.instances).find((instance) => (
    isRecord(instance.transferProvenance)
    && String(instance.transferProvenance.originEnvelopeId || "") === envelope.envelope.envelopeId
  ));
  if (replayedInstance) {
    return fail("equipment_transfer_envelope_replay", "这个装备信封已经导入目标档案，本次操作已取消。", {
      envelopeId: envelope.envelope.envelopeId,
      instanceId: String(replayedInstance.instanceId || ""),
    });
  }
  const allocated = nextLocalInstanceId(source, state, [envelope.envelope.provenance.sourceInstanceId]);
  if (!allocated.ok) {
    return allocated;
  }
  const addedTemplate = addOneTemplate(
    backpack.slots,
    envelope.envelope.itemId,
    backpack.slotLimit,
    backpack.stackLimit,
  );
  if (!addedTemplate.ok) {
    return addedTemplate;
  }
  const candidate = clone(source);
  const instances = clone(state.instances);
  const importedInstance = {
    ...clone(envelope.instanceState),
    instanceId: allocated.instanceId,
    itemId: envelope.envelope.itemId,
    location: "backpack",
    slotId: "",
  };
  importedInstance.transferProvenance = {
    schemaVersion: 1,
    originEnvelopeId: envelope.envelope.envelopeId,
    originStateFingerprint: envelope.stateFingerprint,
    sourceInstanceId: envelope.envelope.provenance.sourceInstanceId,
  };
  instances[allocated.instanceId] = importedInstance;
  candidate.backpackSlots = addedTemplate.slots;
  candidate.equipmentInstances = instances;
  candidate.nextEquipmentInstanceSerial = allocated.nextSerial;
  candidate.equipmentSlotsVersion = EQUIPMENT_SLOTS_VERSION;
  const candidateAudit = auditEquipmentProfileState(candidate, catalog);
  if (!candidateAudit.ok) {
    return fail("equipment_transfer_import_invariant_failed", "装备导入后的档案校验失败，操作已取消。", {
      conflicts: clone(candidateAudit.conflicts || []),
    });
  }
  return {
    ok: true,
    profile: candidate,
    instanceId: allocated.instanceId,
    instance: clone(importedInstance),
    envelopeId: envelope.envelope.envelopeId,
    stateFingerprint: envelope.stateFingerprint,
    publicSummary: publicEquipmentTransferSummary(envelope.envelope, catalog, options),
  };
}

function publicEquipmentTransferSummary(envelopeValue, catalog = null, options = {}) {
  if (!isRecord(envelopeValue) || jsonSafeConflict(envelopeValue, "envelope")) {
    return {};
  }
  const isInternalEnvelope = hasExactFields(envelopeValue, ENVELOPE_FIELDS);
  const isPublicEnvelope = hasExactFields(envelopeValue, PUBLIC_ENVELOPE_FIELDS);
  if (!isInternalEnvelope && !isPublicEnvelope) {
    return {};
  }
  if (envelopeValue.schemaVersion !== EQUIPMENT_TRANSFER_ENVELOPE_SCHEMA_VERSION) {
    return {};
  }
  const envelopeId = typeof envelopeValue.envelopeId === "string" ? envelopeValue.envelopeId : "";
  const itemId = typeof envelopeValue.itemId === "string" ? envelopeValue.itemId : "";
  const stateFingerprint = typeof envelopeValue.stateFingerprint === "string"
    ? envelopeValue.stateFingerprint
    : "";
  if (
    envelopeId === ""
    || envelopeId !== envelopeId.trim()
    || envelopeId.length > MAX_ENVELOPE_ID_LENGTH
    || !/^eqx_[A-Za-z0-9_-]{8,156}$/.test(envelopeId)
    || itemId === ""
    || itemId !== itemId.trim()
    || !/^[a-f0-9]{64}$/.test(stateFingerprint)
    || !isRecord(envelopeValue.instanceState)
  ) {
    return {};
  }
  const state = envelopeValue.instanceState;
  if (!hasValidPublicInstanceStateShape(state, itemId)) {
    return {};
  }
  if (isInternalEnvelope) {
    if (!catalogItem(catalog, itemId)) {
      return {};
    }
    const canonicalEnvelope = validateEquipmentTransferEnvelope(envelopeValue, catalog, options);
    if (!canonicalEnvelope.ok) {
      return {};
    }
    if (
      !hasExactFields(envelopeValue.provenance, PROVENANCE_FIELDS)
      || envelopeValue.provenance.schemaVersion !== 1
      || typeof envelopeValue.provenance.sourceInstanceId !== "string"
      || envelopeValue.provenance.sourceInstanceId === ""
      || envelopeValue.provenance.sourceInstanceId !== envelopeValue.provenance.sourceInstanceId.trim()
      || typeof state.source !== "string"
      || stateFingerprint !== equipmentTransferStateFingerprint(state)
    ) {
      return {};
    }
  } else if (Object.hasOwn(state, "source") || Object.hasOwn(state, "transferProvenance")) {
    return {};
  } else if (catalogItem(catalog, itemId)) {
    const publicState = clone(state);
    publicState.source = "public_projection";
    const canonicalState = canonicalDetachedInstanceState(
      publicState,
      catalogItem(catalog, itemId),
      itemId,
      options,
    );
    if (!canonicalState.ok) {
      return {};
    }
  }
  const publicState = {};
  for (const [key, value] of Object.entries(state)) {
    if (
      key === "source"
      || key === "transferProvenance"
      || key === "qaAssetSample"
      || UNSAFE_JSON_KEYS.has(key)
    ) {
      continue;
    }
    publicState[key] = clone(value);
  }
  return {
    schemaVersion: EQUIPMENT_TRANSFER_ENVELOPE_SCHEMA_VERSION,
    envelopeId,
    itemId,
    instanceState: publicState,
    stateFingerprint,
  };
}

module.exports = {
  EQUIPMENT_TRANSFER_ENVELOPE_SCHEMA_VERSION,
  equipmentTransferStateFingerprint,
  exportBackpackEquipmentEnvelope,
  importBackpackEquipmentEnvelope,
  previewBackpackEquipmentTransfer,
  publicEquipmentTransferSummary,
  validateEquipmentTransferEnvelope,
  validateEquipmentTransferEnvelopeBatch,
};
