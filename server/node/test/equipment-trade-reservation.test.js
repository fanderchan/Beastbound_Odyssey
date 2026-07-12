"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildEquipmentTradeReservation,
  equipmentReservationSummaryConflict,
  publicEquipmentTradeReservationCounts,
  readEquipmentTradeReservation,
  readEquipmentTradeReservationBatch,
} = require("../src/auth/equipment-trade-reservation");

function reservation(overrides = {}) {
  return {
    schemaVersion: 1,
    itemId: "weapon_wooden_club",
    instanceId: "equip_000001",
    sourceSlotIndex: 0,
    stateFingerprint: "a".repeat(64),
    ...structuredClone(overrides),
  };
}

test("equipment trade reservations require exact immutable identity fields", () => {
  assert.equal(readEquipmentTradeReservation(reservation()).ok, true);
  assert.equal(readEquipmentTradeReservation({...reservation(), provenance: {}}).ok, false);
  assert.equal(readEquipmentTradeReservation(reservation({schemaVersion: 2})).ok, false);
  assert.equal(readEquipmentTradeReservation(reservation({sourceSlotIndex: -1})).ok, false);
  assert.equal(readEquipmentTradeReservation(reservation({stateFingerprint: "A".repeat(64)})).ok, false);
});

test("equipment trade reservation batches reject duplicate instances", () => {
  const valid = readEquipmentTradeReservationBatch([
    reservation(),
    reservation({instanceId: "equip_000002"}),
  ]);
  assert.equal(valid.ok, true);
  assert.equal(valid.reservations.length, 2);

  const duplicateInstance = readEquipmentTradeReservationBatch([
    reservation(),
    reservation(),
  ]);
  assert.equal(duplicateInstance.ok, false);
  assert.equal(duplicateInstance.code, "trade_equipment_instance_duplicate");

});

test("reservation builder binds the selected instance to a server-only state preview", () => {
  const built = buildEquipmentTradeReservation(
    {itemId: "weapon_wooden_club", instanceId: "equip_000001", sourceSlotIndex: 0},
    {
      itemId: "weapon_wooden_club",
      instanceId: "equip_000001",
      stateFingerprint: "a".repeat(64),
    },
  );
  assert.equal(built.ok, true);
  assert.equal(built.reservation.instanceId, "equip_000001");

  const mismatched = buildEquipmentTradeReservation(
    {itemId: "weapon_wooden_club", instanceId: "equip_000001", sourceSlotIndex: 0},
    {
      itemId: "weapon_wooden_club",
      instanceId: "equip_other",
      stateFingerprint: "a".repeat(64),
    },
  );
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.code, "trade_equipment_reservation_envelope_mismatch");
});

test("equipment reservation summaries must match the public item counts", () => {
  const reservations = [
    reservation(),
    reservation({instanceId: "equip_000002"}),
  ];
  const predicate = (itemId) => itemId.startsWith("weapon_");
  assert.equal(equipmentReservationSummaryConflict([
    {itemId: "weapon_wooden_club", count: 2},
    {itemId: "item_meat_small", count: 1},
  ], reservations, predicate), null);
  assert.deepEqual(equipmentReservationSummaryConflict([
    {itemId: "weapon_wooden_club", count: 1},
  ], reservations, predicate), {
    itemId: "weapon_wooden_club",
    summaryCount: 1,
    reservationCount: 2,
  });
  assert.deepEqual(publicEquipmentTradeReservationCounts(reservations), [
    {itemId: "weapon_wooden_club", count: 2},
  ]);
});
