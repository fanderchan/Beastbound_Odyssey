"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {loadBattleEquipmentCatalog} = require("../src/auth/battle-equipment-rules");
const {
  addEquipmentEnvelopeToBank,
  addOrdinaryItemToBank,
  readBankProfileState,
  removeEquipmentEnvelopeFromBank,
  removeOrdinaryItemFromBank,
} = require("../src/auth/bank-profile-state");
const {exportBackpackEquipmentEnvelope} = require("../src/auth/equipment-transfer-envelope");

const equipmentCatalog = loadBattleEquipmentCatalog();
const equipmentItemId = "weapon_wooden_club";
const ordinaryItemId = "item_meat_small";
const equipmentTransferOptions = {
  weaponAttacksPerDurability: 100,
  armorHitsPerDurability: 10,
};
const bankOptions = {
  itemById(itemId) {
    return itemId === ordinaryItemId || equipmentCatalog.itemById.has(itemId) ? {id: itemId} : null;
  },
  isEquipmentItemId(itemId) {
    return equipmentCatalog.itemById.has(itemId);
  },
  itemStackLimit(itemId) {
    return equipmentCatalog.itemById.has(itemId) ? 1 : 99;
  },
  equipmentTransferOptions,
};

function emptySlots() {
  return Array.from({length: 90}, () => ({}));
}

function sourceEquipmentProfile() {
  return {
    backpackSlots: [{itemId: equipmentItemId, count: 1}, ...Array.from({length: 14}, () => ({}) )],
    equipmentInstances: {
      equip_source_1: {
        schemaVersion: 1,
        instanceId: "equip_source_1",
        itemId: equipmentItemId,
        location: "backpack",
        slotId: "",
        durability: 18,
        enhancement: {itemId: equipmentItemId, level: 3, history: [{success: true}]},
        wearCounters: {itemId: equipmentItemId, attackCount: 42, hitCount: 0},
        expPillCharge: {},
        source: "bank_rule_test",
        futureAffixes: [{id: "rare_attack", value: 7}],
      },
    },
    equipmentSlotInstanceIds: {},
    equipmentSlotsVersion: 5,
    nextEquipmentInstanceSerial: 2,
  };
}

function exportedEnvelope() {
  const result = exportBackpackEquipmentEnvelope(
    sourceEquipmentProfile(),
    equipmentCatalog,
    equipmentItemId,
    "equip_source_1",
    {
      ...equipmentTransferOptions,
      backpackSlotLimit: 15,
      stackLimit: 1,
      sourceSlotIndex: 0,
      envelopeId: "eqx_bankrule0001",
    },
  );
  assert.equal(result.ok, true);
  return result.envelope;
}

test("bank schema1 upgrades only clean non-equipment state to canonical schema2", () => {
  const slots = emptySlots();
  slots[0] = {itemId: ordinaryItemId, count: 5};
  const legacy = {
    stoneCoins: 25,
    items: [{itemId: ordinaryItemId, count: 5}],
    slots,
    unlockedTabs: 1,
    schemaVersion: 1,
  };
  const before = structuredClone(legacy);
  const upgraded = readBankProfileState(legacy, equipmentCatalog, bankOptions);
  assert.equal(upgraded.ok, true);
  assert.equal(upgraded.changed, true);
  assert.equal(upgraded.bank.schemaVersion, 2);
  assert.deepEqual(upgraded.bank.slots[0], {itemId: ordinaryItemId, count: 5});
  assert.deepEqual(legacy, before);

  const legacyEquipment = structuredClone(legacy);
  legacyEquipment.items = [{itemId: equipmentItemId, count: 1}];
  legacyEquipment.slots[0] = {itemId: equipmentItemId, count: 1};
  const rejected = readBankProfileState(legacyEquipment, equipmentCatalog, bankOptions);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "bank_equipment_transfer_unsupported");
});

test("schema2 stores complete equipment envelopes and ordinary stacks without losing either", () => {
  const initial = readBankProfileState({stoneCoins: 0, items: [], slots: emptySlots(), unlockedTabs: 1, schemaVersion: 1}, equipmentCatalog, bankOptions);
  assert.equal(initial.ok, true);
  const withOrdinary = addOrdinaryItemToBank(initial.bank, ordinaryItemId, 7, 0, equipmentCatalog, bankOptions);
  assert.equal(withOrdinary.ok, true);
  const envelope = exportedEnvelope();
  const withEquipment = addEquipmentEnvelopeToBank(withOrdinary.bank, envelope, 1, equipmentCatalog, bankOptions);
  assert.equal(withEquipment.ok, true);
  assert.equal(withEquipment.bank.schemaVersion, 2);
  assert.deepEqual(withEquipment.bank.slots[0], {itemId: ordinaryItemId, count: 7});
  assert.equal(withEquipment.bank.slots[1].count, 1);
  assert.deepEqual(withEquipment.bank.slots[1].equipmentEnvelopes, [envelope]);
  assert.equal(withEquipment.bank.slots[1].equipmentEnvelopes[0].instanceState.source, "bank_rule_test");
  assert.deepEqual(withEquipment.bank.slots[1].equipmentEnvelopes[0].instanceState.futureAffixes, [{id: "rare_attack", value: 7}]);
  assert.equal(readBankProfileState(withEquipment.bank, equipmentCatalog, bankOptions).changed, false);

  const duplicateSummaries = structuredClone(withEquipment.bank);
  duplicateSummaries.items = [
    {itemId: ordinaryItemId, count: 3},
    {itemId: ordinaryItemId, count: 4},
    {itemId: equipmentItemId, count: 1},
  ];
  const canonicalized = readBankProfileState(duplicateSummaries, equipmentCatalog, bankOptions);
  assert.equal(canonicalized.ok, true);
  assert.equal(canonicalized.changed, true);
  assert.deepEqual(canonicalized.bank.items, [
    {itemId: ordinaryItemId, count: 7},
    {itemId: equipmentItemId, count: 1},
  ]);

  const lessOrdinary = removeOrdinaryItemFromBank(withEquipment.bank, ordinaryItemId, 2, 0, equipmentCatalog, bankOptions);
  assert.equal(lessOrdinary.ok, true);
  assert.equal(lessOrdinary.bank.slots[0].count, 5);
  assert.deepEqual(lessOrdinary.bank.slots[1].equipmentEnvelopes, [envelope]);

  const removed = removeEquipmentEnvelopeFromBank(
    lessOrdinary.bank,
    envelope.envelopeId,
    1,
    equipmentItemId,
    equipmentCatalog,
    bankOptions,
  );
  assert.equal(removed.ok, true);
  assert.deepEqual(removed.envelope, envelope);
  assert.deepEqual(removed.bank.slots[1], {});
  assert.equal(removed.bank.items.some((item) => item.itemId === equipmentItemId), false);
});

test("bad, future, duplicate, mismatched, and stale equipment envelopes fail without mutation", () => {
  const initial = readBankProfileState({}, equipmentCatalog, bankOptions);
  const envelope = exportedEnvelope();
  const added = addEquipmentEnvelopeToBank(initial.bank, envelope, 0, equipmentCatalog, bankOptions);
  assert.equal(added.ok, true);

  const scenarios = [];
  const countMismatch = structuredClone(added.bank);
  countMismatch.slots[0].count = 2;
  countMismatch.items[0].count = 2;
  scenarios.push(countMismatch);

  const future = structuredClone(added.bank);
  future.slots[0].equipmentEnvelopes[0].schemaVersion = 2;
  scenarios.push(future);

  const tampered = structuredClone(added.bank);
  tampered.slots[0].equipmentEnvelopes[0].instanceState.durability = 17;
  scenarios.push(tampered);

  const duplicate = structuredClone(added.bank);
  duplicate.slots[1] = structuredClone(duplicate.slots[0]);
  duplicate.items[0].count = 2;
  scenarios.push(duplicate);

  const wrongItem = structuredClone(added.bank);
  wrongItem.slots[0].itemId = ordinaryItemId;
  wrongItem.items = [{itemId: ordinaryItemId, count: 1}];
  scenarios.push(wrongItem);

  for (const bank of scenarios) {
    const before = structuredClone(bank);
    const result = readBankProfileState(bank, equipmentCatalog, bankOptions);
    assert.equal(result.ok, false);
    assert.deepEqual(bank, before);
  }

  const beforeStale = structuredClone(added.bank);
  const stale = removeEquipmentEnvelopeFromBank(
    added.bank,
    "eqx_missing0001",
    0,
    equipmentItemId,
    equipmentCatalog,
    bankOptions,
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "bank_equipment_selection_stale");
  assert.deepEqual(added.bank, beforeStale);

  const fullSlots = emptySlots();
  for (let index = 0; index < 15; index += 1) {
    fullSlots[index] = {itemId: ordinaryItemId, count: 99};
  }
  const fullBank = {
    stoneCoins: 0,
    items: [{itemId: ordinaryItemId, count: 1485}],
    slots: fullSlots,
    unlockedTabs: 1,
    schemaVersion: 2,
  };
  const fullBefore = structuredClone(fullBank);
  const capacity = addEquipmentEnvelopeToBank(fullBank, envelope, -1, equipmentCatalog, bankOptions);
  assert.equal(capacity.ok, false);
  assert.equal(capacity.code, "bank_storage_full");
  assert.deepEqual(fullBank, fullBefore);

  const futureBank = structuredClone(added.bank);
  futureBank.schemaVersion = 3;
  const futureBefore = structuredClone(futureBank);
  const futureResult = readBankProfileState(futureBank, equipmentCatalog, bankOptions);
  assert.equal(futureResult.ok, false);
  assert.equal(futureResult.code, "bank_schema_future");
  assert.deepEqual(futureBank, futureBefore);
});
