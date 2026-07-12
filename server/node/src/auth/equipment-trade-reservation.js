"use strict";

const EQUIPMENT_TRADE_RESERVATION_SCHEMA_VERSION = 1;
const DEFAULT_MAX_RESERVATIONS = 8;
const RESERVATION_FIELDS = Object.freeze([
  "schemaVersion",
  "itemId",
  "instanceId",
  "sourceSlotIndex",
  "stateFingerprint",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function fail(code, message, details = {}) {
  return {ok: false, code, message, ...details};
}

function exactFields(value, expectedFields) {
  if (!isRecord(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = Array.from(expectedFields).sort();
  return actual.length === expected.length && actual.every((field, index) => field === expected[index]);
}

function canonicalIdentifier(value) {
  return typeof value === "string" && value !== "" && value === value.trim();
}

function validStateFingerprint(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function readEquipmentTradeReservation(value) {
  if (!exactFields(value, RESERVATION_FIELDS)) {
    return fail(
      "trade_equipment_reservation_invalid",
      "面对面交易的装备预约格式异常，本次操作已取消。",
      {reason: "shape"},
    );
  }
  if (value.schemaVersion !== EQUIPMENT_TRADE_RESERVATION_SCHEMA_VERSION) {
    return fail(
      "trade_equipment_reservation_version_unsupported",
      "面对面交易的装备预约版本不受支持，本次操作已取消。",
      {schemaVersion: value.schemaVersion},
    );
  }
  if (!canonicalIdentifier(value.itemId)) {
    return fail(
      "trade_equipment_reservation_invalid",
      "面对面交易的装备预约缺少有效物品编号。",
      {reason: "item_id"},
    );
  }
  if (!canonicalIdentifier(value.instanceId)) {
    return fail(
      "trade_equipment_reservation_invalid",
      "面对面交易的装备预约缺少有效实例编号。",
      {reason: "instance_id"},
    );
  }
  if (!Number.isSafeInteger(value.sourceSlotIndex) || value.sourceSlotIndex < 0) {
    return fail(
      "trade_equipment_reservation_invalid",
      "面对面交易的装备预约缺少有效背包格。",
      {reason: "source_slot_index"},
    );
  }
  if (!validStateFingerprint(value.stateFingerprint)) {
    return fail(
      "trade_equipment_reservation_invalid",
      "面对面交易的装备状态校验值异常。",
      {reason: "state_fingerprint"},
    );
  }
  return {
    ok: true,
    reservation: {
      schemaVersion: EQUIPMENT_TRADE_RESERVATION_SCHEMA_VERSION,
      itemId: value.itemId,
      instanceId: value.instanceId,
      sourceSlotIndex: value.sourceSlotIndex,
      stateFingerprint: value.stateFingerprint,
    },
  };
}

function buildEquipmentTradeReservation(intentValue, previewValue) {
  const intent = isRecord(intentValue) ? intentValue : {};
  const preview = isRecord(previewValue) ? previewValue : {};
  const candidate = {
    schemaVersion: EQUIPMENT_TRADE_RESERVATION_SCHEMA_VERSION,
    itemId: String(intent.itemId || ""),
    instanceId: String(intent.instanceId || ""),
    sourceSlotIndex: intent.sourceSlotIndex,
    stateFingerprint: String(preview.stateFingerprint || ""),
  };
  const read = readEquipmentTradeReservation(candidate);
  if (!read.ok) {
    return read;
  }
  if (
    preview.itemId !== candidate.itemId
    || preview.instanceId !== candidate.instanceId
  ) {
    return fail(
      "trade_equipment_reservation_envelope_mismatch",
      "面对面交易的装备预约与服务端转运事实不一致。",
    );
  }
  return read;
}

function readEquipmentTradeReservationBatch(value, options = {}) {
  if (!Array.isArray(value)) {
    return fail(
      "trade_equipment_reservations_invalid",
      "面对面交易的装备预约列表格式异常。",
      {reason: "not_array"},
    );
  }
  const maxReservations = Number.isSafeInteger(options.maxReservations)
    ? Math.max(0, options.maxReservations)
    : DEFAULT_MAX_RESERVATIONS;
  if (value.length > maxReservations) {
    return fail(
      "trade_equipment_reservation_limit",
      `一次最多预约${maxReservations}件装备。`,
      {count: value.length, maxReservations},
    );
  }
  const reservations = [];
  const instanceIds = new Set();
  for (const [index, raw] of value.entries()) {
    const read = readEquipmentTradeReservation(raw);
    if (!read.ok) {
      return {...read, index};
    }
    const reservation = read.reservation;
    if (instanceIds.has(reservation.instanceId)) {
      return fail(
        "trade_equipment_instance_duplicate",
        "同一装备实例不能在一笔交易中重复预约。",
        {index, instanceId: reservation.instanceId},
      );
    }
    instanceIds.add(reservation.instanceId);
    reservations.push(reservation);
  }
  return {ok: true, reservations};
}

function equipmentReservationSummaryConflict(itemsValue, reservationsValue, isEquipmentItemId) {
  const reservations = Array.isArray(reservationsValue) ? reservationsValue : [];
  const summaryCounts = new Map();
  for (const item of Array.isArray(itemsValue) ? itemsValue : []) {
    const itemId = String(item && item.itemId || "").trim();
    const count = Number(item && item.count || 0);
    if (
      itemId !== ""
      && Number.isSafeInteger(count)
      && count > 0
      && typeof isEquipmentItemId === "function"
      && isEquipmentItemId(itemId)
    ) {
      summaryCounts.set(itemId, Number(summaryCounts.get(itemId) || 0) + count);
    }
  }
  const reservationCounts = new Map();
  for (const reservation of reservations) {
    const itemId = String(reservation && reservation.itemId || "").trim();
    if (itemId !== "") {
      reservationCounts.set(itemId, Number(reservationCounts.get(itemId) || 0) + 1);
    }
  }
  const itemIds = new Set([...summaryCounts.keys(), ...reservationCounts.keys()]);
  for (const itemId of itemIds) {
    if (Number(summaryCounts.get(itemId) || 0) !== Number(reservationCounts.get(itemId) || 0)) {
      return {
        itemId,
        summaryCount: Number(summaryCounts.get(itemId) || 0),
        reservationCount: Number(reservationCounts.get(itemId) || 0),
      };
    }
  }
  return null;
}

function publicEquipmentTradeReservationCounts(reservationsValue) {
  const counts = new Map();
  for (const reservation of Array.isArray(reservationsValue) ? reservationsValue : []) {
    const itemId = String(reservation && reservation.itemId || "").trim();
    if (itemId !== "") {
      counts.set(itemId, Number(counts.get(itemId) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, count]) => ({itemId, count}));
}

module.exports = {
  EQUIPMENT_TRADE_RESERVATION_SCHEMA_VERSION,
  buildEquipmentTradeReservation,
  equipmentReservationSummaryConflict,
  publicEquipmentTradeReservationCounts,
  readEquipmentTradeReservation,
  readEquipmentTradeReservationBatch,
};
