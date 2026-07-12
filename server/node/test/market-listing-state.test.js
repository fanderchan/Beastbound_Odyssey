"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {loadBattleEquipmentCatalog} = require("../src/auth/battle-equipment-rules");
const {exportBackpackEquipmentEnvelope} = require("../src/auth/equipment-transfer-envelope");
const {
  MARKET_LISTING_SCHEMA_VERSION,
  auditMarketListingBook,
  buildEquipmentMarketListing,
  publicMarketListingFacts,
  readMarketListing,
} = require("../src/auth/market-listing-state");

const equipmentCatalog = loadBattleEquipmentCatalog();
const equipmentItemId = "weapon_wooden_club";
const otherEquipmentItemId = "weapon_stone_dagger";
const ordinaryItemId = "item_meat_small";
const options = {
  itemById(itemId) {
    return itemId === ordinaryItemId || equipmentCatalog.itemById.has(itemId) ? {id: itemId} : null;
  },
  isEquipmentItemId(itemId) {
    return equipmentCatalog.itemById.has(itemId);
  },
  equipmentTransferOptions: {
    weaponAttacksPerDurability: 100,
    armorHitsPerDurability: 10,
  },
};

function equipmentProfile(itemId = equipmentItemId, instanceId = "equip_market_1") {
  const item = equipmentCatalog.itemById.get(itemId);
  return {
    backpackSlots: [{itemId, count: 1}, ...Array.from({length: 14}, () => ({}))],
    equipmentInstances: {
      [instanceId]: {
        schemaVersion: 1,
        instanceId,
        itemId,
        location: "backpack",
        slotId: "",
        durability: Number(item.durabilityMax || 30) - 4,
        enhancement: {itemId, level: 3, history: [{level: 3, roll: 88}]},
        wearCounters: {itemId, attackCount: 27, hitCount: 0},
        expPillCharge: {},
        source: "market_listing_state_test",
        futureAffixes: [{id: "future_power", value: 7}],
      },
    },
    equipmentSlotInstanceIds: {},
    equipmentSlotsVersion: 5,
    nextEquipmentInstanceSerial: 2,
  };
}

function equipmentEnvelope(
  envelopeId = "eqx_market_listing_0001",
  itemId = equipmentItemId,
  instanceId = "equip_market_1",
) {
  const result = exportBackpackEquipmentEnvelope(
    equipmentProfile(itemId, instanceId),
    equipmentCatalog,
    itemId,
    instanceId,
    {
      ...options.equipmentTransferOptions,
      backpackSlotLimit: 15,
      stackLimit: 1,
      sourceSlotIndex: 0,
      envelopeId,
    },
  );
  assert.equal(result.ok, true);
  return result.envelope;
}

function listingBase(overrides = {}) {
  return {
    listingId: "market_listing_1",
    sellerAccountId: "acc_market_seller",
    itemId: equipmentItemId,
    count: 1,
    unitPrice: 200,
    currency: "stoneCoins",
    createdAt: "2026-07-12T12:00:00.000Z",
    ...overrides,
  };
}

test("v1 keeps exact ordinary listings compatible but rejects template-only equipment", () => {
  const ordinary = {...listingBase({itemId: ordinaryItemId, count: 4}), schemaVersion: 1};
  const ordinaryBefore = structuredClone(ordinary);
  const current = readMarketListing(ordinary, equipmentCatalog, options);
  assert.equal(current.ok, true);
  assert.equal(current.kind, "ordinary");
  assert.equal(current.changed, false);
  assert.deepEqual(current.listing, ordinary);
  assert.deepEqual(ordinary, ordinaryBefore);

  const legacy = structuredClone(ordinary);
  delete legacy.schemaVersion;
  const upgraded = readMarketListing(legacy, equipmentCatalog, options);
  assert.equal(upgraded.ok, true);
  assert.equal(upgraded.legacy, true);
  assert.equal(upgraded.changed, true);
  assert.equal(upgraded.listing.schemaVersion, 1);
  const expectedLegacy = structuredClone(ordinaryBefore);
  delete expectedLegacy.schemaVersion;
  assert.deepEqual(legacy, expectedLegacy);

  const oldEquipment = {...listingBase(), schemaVersion: 1};
  const rejected = readMarketListing(oldEquipment, equipmentCatalog, options);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "market_equipment_transfer_unsupported");
});

test("v2 builds one exact private equipment escrow and exposes only its public summary", () => {
  const envelope = equipmentEnvelope();
  const envelopeBefore = structuredClone(envelope);
  const built = buildEquipmentMarketListing(listingBase(), envelope, equipmentCatalog, options);
  assert.equal(built.ok, true);
  assert.equal(built.listing.schemaVersion, MARKET_LISTING_SCHEMA_VERSION);
  assert.equal(built.kind, "equipment");
  assert.equal(built.listing.count, 1);
  assert.deepEqual(built.listing.equipmentEnvelope, envelope);
  assert.equal(built.listing.equipmentEnvelope.instanceState.source, "market_listing_state_test");
  assert.deepEqual(built.listing.equipmentEnvelope.instanceState.futureAffixes, [{id: "future_power", value: 7}]);
  assert.deepEqual(envelope, envelopeBefore);

  const reread = readMarketListing(built.listing, equipmentCatalog, options);
  assert.equal(reread.ok, true);
  assert.deepEqual(reread.listing, built.listing);

  const publicFacts = publicMarketListingFacts(built.listing, equipmentCatalog, options);
  assert.equal(publicFacts.ok, true);
  assert.equal(publicFacts.isEquipment, true);
  assert.equal(publicFacts.equipmentEnvelope.envelopeId, envelope.envelopeId);
  assert.equal(Object.hasOwn(publicFacts.equipmentEnvelope, "provenance"), false);
  assert.equal(Object.hasOwn(publicFacts.equipmentEnvelope.instanceState, "source"), false);
  assert.equal(Object.hasOwn(publicFacts.equipmentEnvelope.instanceState, "transferProvenance"), false);
  assert.deepEqual(publicFacts.equipmentEnvelope.instanceState.futureAffixes, [{id: "future_power", value: 7}]);

  const ordinaryFacts = publicMarketListingFacts(
    {...listingBase({itemId: ordinaryItemId, count: 2}), schemaVersion: 1},
    equipmentCatalog,
    options,
  );
  assert.equal(ordinaryFacts.ok, true);
  assert.equal(ordinaryFacts.isEquipment, false);
  assert.equal(ordinaryFacts.equipmentEnvelope, null);
});

test("v2 rejects count, item, fingerprint, future version, and unknown root conflicts without mutation", () => {
  const valid = buildEquipmentMarketListing(listingBase(), equipmentEnvelope(), equipmentCatalog, options).listing;
  const scenarios = [];

  const countMismatch = structuredClone(valid);
  countMismatch.count = 2;
  scenarios.push([countMismatch, "market_equipment_count_invalid"]);

  const itemMismatch = structuredClone(valid);
  itemMismatch.itemId = otherEquipmentItemId;
  scenarios.push([itemMismatch, "market_equipment_envelope_item_mismatch"]);

  const fingerprintMismatch = structuredClone(valid);
  fingerprintMismatch.equipmentEnvelope.instanceState.durability -= 1;
  scenarios.push([fingerprintMismatch, "equipment_transfer_fingerprint_mismatch"]);

  const futureEnvelope = structuredClone(valid);
  futureEnvelope.equipmentEnvelope.schemaVersion = 2;
  scenarios.push([futureEnvelope, "equipment_transfer_envelope_schema_future"]);

  const unknownEnvelopeField = structuredClone(valid);
  unknownEnvelopeField.equipmentEnvelope.futureRoot = {keep: true};
  scenarios.push([unknownEnvelopeField, "equipment_transfer_envelope_field_unknown"]);

  const futureListing = structuredClone(valid);
  futureListing.schemaVersion = 3;
  scenarios.push([futureListing, "market_listing_schema_future"]);

  const unknownRoot = structuredClone(valid);
  unknownRoot.futureEscrow = {keep: true};
  scenarios.push([unknownRoot, "market_listing_schema_unsupported"]);

  const missingEnvelope = structuredClone(valid);
  delete missingEnvelope.equipmentEnvelope;
  scenarios.push([missingEnvelope, "market_listing_schema_unsupported"]);

  const ordinaryWithEnvelope = structuredClone(valid);
  ordinaryWithEnvelope.itemId = ordinaryItemId;
  scenarios.push([ordinaryWithEnvelope, "market_equipment_envelope_unexpected"]);

  for (const [listing, code] of scenarios) {
    const before = structuredClone(listing);
    const result = readMarketListing(listing, equipmentCatalog, options);
    assert.equal(result.ok, false, code);
    assert.equal(result.code, code);
    assert.deepEqual(listing, before);
  }
});

test("market book audit requires key identity and globally unique equipment envelope ids", () => {
  const first = buildEquipmentMarketListing(
    listingBase({listingId: "market_equipment_1"}),
    equipmentEnvelope("eqx_market_book_shared", equipmentItemId, "equip_market_1"),
    equipmentCatalog,
    options,
  ).listing;
  const second = buildEquipmentMarketListing(
    listingBase({listingId: "market_equipment_2", itemId: otherEquipmentItemId}),
    equipmentEnvelope("eqx_market_book_second", otherEquipmentItemId, "equip_market_2"),
    equipmentCatalog,
    options,
  ).listing;
  const ordinary = {
    ...listingBase({listingId: "market_ordinary", itemId: ordinaryItemId, count: 5}),
    schemaVersion: 1,
  };
  const validBook = {
    market_equipment_1: first,
    market_equipment_2: second,
    market_ordinary: ordinary,
  };
  const audited = auditMarketListingBook(validBook, equipmentCatalog, options);
  assert.equal(audited.ok, true);
  assert.deepEqual(audited.equipmentEnvelopeIds, ["eqx_market_book_second", "eqx_market_book_shared"]);
  assert.equal(audited.listings.length, 3);

  const wrongKey = {market_wrong_key: structuredClone(first)};
  const wrongIdentity = auditMarketListingBook(wrongKey, equipmentCatalog, options);
  assert.equal(wrongIdentity.ok, false);
  assert.equal(wrongIdentity.code, "market_listing_identity_conflict");

  const duplicate = structuredClone(validBook);
  duplicate.market_equipment_2.equipmentEnvelope = structuredClone(first.equipmentEnvelope);
  duplicate.market_equipment_2.itemId = first.itemId;
  const duplicateBefore = structuredClone(duplicate);
  const duplicateResult = auditMarketListingBook(duplicate, equipmentCatalog, options);
  assert.equal(duplicateResult.ok, false);
  assert.equal(duplicateResult.code, "market_equipment_envelope_duplicate");
  assert.equal(duplicateResult.envelopeId, "eqx_market_book_shared");
  assert.deepEqual(duplicate, duplicateBefore);
});
