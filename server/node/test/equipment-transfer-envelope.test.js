"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {buildBattleEquipmentCatalog, loadBattleEquipmentCatalog} = require("../src/auth/battle-equipment-rules");
const {
  equipmentTransferStateFingerprint,
  exportBackpackEquipmentEnvelope,
  importBackpackEquipmentEnvelope,
  previewBackpackEquipmentTransfer,
  publicEquipmentTransferSummary,
  validateEquipmentTransferEnvelope,
  validateEquipmentTransferEnvelopeBatch,
} = require("../src/auth/equipment-transfer-envelope");

const catalog = buildBattleEquipmentCatalog({
  schemaVersion: 1,
  slots: [{id: "right_hand_weapon"}, {id: "armor"}, {id: "exp_pill"}],
  items: [
    {id: "weapon_club", slot: "right_hand_weapon", durabilityMax: 30, enhanceMax: 5, stats: {attack: 3}},
    {id: "armor_hide", slot: "armor", durabilityMax: 40, enhanceMax: 5, stats: {defense: 4}},
    {id: "exp_pill_131", slot: "exp_pill", usesDurability: false, expPill: true, expPillLevel: 131, stats: {}},
  ],
});
const productionCatalog = loadBattleEquipmentCatalog();

function slots(...entries) {
  return [...entries, ...Array.from({length: Math.max(0, 4 - entries.length)}, () => ({}))];
}

function instance(instanceId, itemId, overrides = {}) {
  const item = catalog.itemById.get(itemId);
  const durable = item.usesDurability !== false;
  return {
    schemaVersion: 1,
    instanceId,
    itemId,
    location: "backpack",
    slotId: "",
    durability: durable ? Number(item.durabilityMax || 30) : 0,
    enhancement: item.expPill ? {} : {itemId, level: 0, history: []},
    wearCounters: durable ? {itemId, attackCount: 0, hitCount: 0} : {},
    expPillCharge: item.expPill ? {itemId, level: 131, exp: 0, nextExp: 1000} : {},
    source: "test",
    ...overrides,
  };
}

function profile(backpackSlots, equipmentInstances, nextEquipmentInstanceSerial = 1) {
  return {
    schemaVersion: 3,
    backpackSlots,
    equipmentSlots: {},
    equipmentInstances,
    equipmentSlotInstanceIds: {},
    nextEquipmentInstanceSerial,
    equipmentSlotsVersion: 5,
  };
}

const capacity = {backpackSlotLimit: 4, stackLimit: 1};
const trustedCapacity = {...capacity, trustedServerEnvelope: true};

function exportRareClub() {
  const source = profile(
    slots({itemId: "weapon_club", count: 1}, {itemId: "weapon_club", count: 1}),
    {
      equip_000001: instance("equip_000001", "weapon_club"),
      equip_000009: instance("equip_000009", "weapon_club", {
        durability: 17,
        enhancement: {itemId: "weapon_club", level: 4, history: [{level: 4, roll: 88}]},
        wearCounters: {itemId: "weapon_club", attackCount: 37, hitCount: 0},
        quality: "rare",
        affixes: [{id: "future_power", value: 7}],
        futureState: {nested: {keep: true}},
      }),
    },
    10,
  );
  const result = exportBackpackEquipmentEnvelope(
    source,
    catalog,
    "weapon_club",
    "equip_000009",
    {
      ...capacity,
      sourceSlotIndex: 1,
      envelopeId: "eqx_transfer_rare_0001",
    },
  );
  return {source, result};
}

test("export selects one canonical backpack instance, exact slot, and preserves every state field", () => {
  const {source, result} = exportRareClub();
  const before = structuredClone(source);

  assert.equal(result.ok, true);
  assert.deepEqual(source, before);
  assert.deepEqual(result.profile.backpackSlots[0], {itemId: "weapon_club", count: 1});
  assert.deepEqual(result.profile.backpackSlots[1], {});
  assert.ok(result.profile.equipmentInstances.equip_000001);
  assert.equal(result.profile.equipmentInstances.equip_000009, undefined);
  assert.equal(result.envelope.schemaVersion, 1);
  assert.equal(result.envelope.envelopeId, "eqx_transfer_rare_0001");
  assert.deepEqual(result.envelope.provenance, {schemaVersion: 1, sourceInstanceId: "equip_000009"});
  assert.equal(Object.hasOwn(result.envelope.instanceState, "instanceId"), false);
  assert.equal(Object.hasOwn(result.envelope.instanceState, "location"), false);
  assert.equal(Object.hasOwn(result.envelope.instanceState, "slotId"), false);
  assert.equal(result.envelope.instanceState.durability, 17);
  assert.equal(result.envelope.instanceState.enhancement.level, 4);
  assert.equal(result.envelope.instanceState.wearCounters.attackCount, 37);
  assert.equal(result.envelope.instanceState.quality, "rare");
  assert.deepEqual(result.envelope.instanceState.affixes, [{id: "future_power", value: 7}]);
  assert.deepEqual(result.envelope.instanceState.futureState, {nested: {keep: true}});
  assert.equal(result.envelope.stateFingerprint, equipmentTransferStateFingerprint(result.envelope));
  assert.equal(result.publicSummary.stateFingerprint, result.envelope.stateFingerprint);
  assert.equal(Object.hasOwn(result.publicSummary, "provenance"), false);
});

test("trade reservation preview validates and removes only on a candidate copy", () => {
  const {source, result: exported} = exportRareClub();
  const before = structuredClone(source);
  const preview = previewBackpackEquipmentTransfer(
    source,
    catalog,
    "weapon_club",
    "equip_000009",
    {...capacity, sourceSlotIndex: 1},
  );
  assert.equal(preview.ok, true);
  assert.deepEqual(source, before);
  assert.deepEqual(preview.profile, exported.profile);
  assert.equal(preview.itemId, "weapon_club");
  assert.equal(preview.instanceId, "equip_000009");
  assert.equal(preview.stateFingerprint, exported.stateFingerprint);
  assert.equal(Object.hasOwn(preview, "envelope"), false);
  assert.equal(Object.hasOwn(preview, "instanceState"), false);
});

test("import allocates a target-local id, adds one template, and records private provenance", () => {
  const {result: exported} = exportRareClub();
  assert.equal(exported.ok, true);
  const target = profile(
    slots({itemId: "armor_hide", count: 1}),
    {equip_000001: instance("equip_000001", "armor_hide")},
    1,
  );
  const targetBefore = structuredClone(target);
  const envelopeBefore = structuredClone(exported.envelope);

  const imported = importBackpackEquipmentEnvelope(target, catalog, exported.envelope, trustedCapacity);

  assert.equal(imported.ok, true);
  assert.deepEqual(target, targetBefore);
  assert.deepEqual(exported.envelope, envelopeBefore);
  assert.equal(imported.instanceId, "equip_000002");
  assert.notEqual(imported.instanceId, exported.envelope.provenance.sourceInstanceId);
  assert.equal(imported.profile.nextEquipmentInstanceSerial, 3);
  assert.equal(imported.profile.backpackSlots[1].itemId, "weapon_club");
  assert.equal(imported.instance.location, "backpack");
  assert.equal(imported.instance.slotId, "");
  assert.equal(imported.instance.durability, 17);
  assert.equal(imported.instance.enhancement.level, 4);
  assert.deepEqual(imported.instance.affixes, [{id: "future_power", value: 7}]);
  assert.deepEqual(imported.instance.futureState, {nested: {keep: true}});
  assert.deepEqual(imported.instance.transferProvenance, {
    schemaVersion: 1,
    originEnvelopeId: exported.envelope.envelopeId,
    originStateFingerprint: exported.envelope.stateFingerprint,
    sourceInstanceId: "equip_000009",
  });
  assert.equal(Object.hasOwn(imported.publicSummary, "provenance"), false);

  const emptyTarget = profile(slots(), {}, 1);
  const emptyImported = importBackpackEquipmentEnvelope(emptyTarget, catalog, exported.envelope, trustedCapacity);
  assert.equal(emptyImported.ok, true);
  assert.equal(exported.envelope.provenance.sourceInstanceId, "equip_000009");
  assert.equal(emptyImported.instanceId, "equip_000001");
  assert.notEqual(emptyImported.instanceId, exported.envelope.provenance.sourceInstanceId);

  const firstSerialSource = profile(
    slots({itemId: "weapon_club", count: 1}),
    {equip_000001: instance("equip_000001", "weapon_club")},
    2,
  );
  const firstSerialExport = exportBackpackEquipmentEnvelope(
    firstSerialSource,
    catalog,
    "weapon_club",
    "equip_000001",
    {...capacity, envelopeId: "eqx_first_serial_0001"},
  );
  assert.equal(firstSerialExport.ok, true);
  const skippedSourceId = importBackpackEquipmentEnvelope(emptyTarget, catalog, firstSerialExport.envelope, trustedCapacity);
  assert.equal(skippedSourceId.ok, true);
  assert.equal(skippedSourceId.instanceId, "equip_000002");
  assert.notEqual(skippedSourceId.instanceId, firstSerialExport.envelope.provenance.sourceInstanceId);
});

test("exp-pill charge and stack capacity survive an export/import round trip", () => {
  const curve = {expToNextLevel: () => 1000, maxPlayerLevel: 140};
  const source = profile(
    slots({itemId: "exp_pill_131", count: 2}),
    {
      equip_000003: instance("equip_000003", "exp_pill_131"),
      equip_000004: instance("equip_000004", "exp_pill_131", {
        expPillCharge: {itemId: "exp_pill_131", level: 132, exp: 456, nextExp: 1000},
        chargeFx: {color: "future_blue"},
      }),
    },
    5,
  );
  const exported = exportBackpackEquipmentEnvelope(
    source,
    catalog,
    "exp_pill_131",
    "equip_000004",
    {...curve, backpackSlotLimit: 4, stackLimit: 20, envelopeId: "eqx_exp_pill_00000001"},
  );
  assert.equal(exported.ok, true);
  assert.equal(exported.profile.backpackSlots[0].count, 1);
  assert.equal(exported.envelope.instanceState.expPillCharge.exp, 456);

  const target = profile(slots({itemId: "exp_pill_131", count: 1}), {
    equip_000020: instance("equip_000020", "exp_pill_131"),
  }, 21);
  const imported = importBackpackEquipmentEnvelope(
    target,
    catalog,
    exported.envelope,
    {...curve, backpackSlotLimit: 4, stackLimit: 20, trustedServerEnvelope: true},
  );
  assert.equal(imported.ok, true);
  assert.equal(imported.profile.backpackSlots[0].count, 2);
  assert.equal(imported.instance.expPillCharge.level, 132);
  assert.equal(imported.instance.expPillCharge.exp, 456);
  assert.deepEqual(imported.instance.chargeFx, {color: "future_blue"});

  const exhaustedCharge = structuredClone(exported.envelope);
  exhaustedCharge.instanceState.expPillCharge.exp = 1000;
  exhaustedCharge.stateFingerprint = equipmentTransferStateFingerprint(exhaustedCharge);
  assert.equal(validateEquipmentTransferEnvelope(exhaustedCharge, catalog, curve).ok, false);
  assert.deepEqual(publicEquipmentTransferSummary(exhaustedCharge, catalog, curve), {});

  const wrongCurve = structuredClone(exported.envelope);
  wrongCurve.instanceState.expPillCharge.nextExp = 999;
  wrongCurve.stateFingerprint = equipmentTransferStateFingerprint(wrongCurve);
  assert.equal(validateEquipmentTransferEnvelope(wrongCurve, catalog, curve).ok, false);
  assert.deepEqual(publicEquipmentTransferSummary(wrongCurve, catalog, curve), {});
});

test("tampered, future, identity-bearing, and unknown envelope schemas fail closed", () => {
  const {result: exported} = exportRareClub();
  assert.equal(exported.ok, true);
  const cases = [];

  const tampered = structuredClone(exported.envelope);
  tampered.instanceState.durability -= 1;
  cases.push([tampered, "equipment_transfer_fingerprint_mismatch"]);

  const futureEnvelope = structuredClone(exported.envelope);
  futureEnvelope.schemaVersion = 2;
  cases.push([futureEnvelope, "equipment_transfer_envelope_schema_future"]);

  const stringEnvelopeSchema = structuredClone(exported.envelope);
  stringEnvelopeSchema.schemaVersion = "1";
  cases.push([stringEnvelopeSchema, "equipment_transfer_envelope_schema_invalid"]);

  const futureInstance = structuredClone(exported.envelope);
  futureInstance.instanceState.schemaVersion = 2;
  futureInstance.stateFingerprint = equipmentTransferStateFingerprint(futureInstance);
  cases.push([futureInstance, "equipment_transfer_instance_schema_future"]);

  const stringInstanceSchema = structuredClone(exported.envelope);
  stringInstanceSchema.instanceState.schemaVersion = "1";
  stringInstanceSchema.stateFingerprint = equipmentTransferStateFingerprint(stringInstanceSchema);
  cases.push([stringInstanceSchema, "equipment_transfer_instance_schema_invalid"]);

  const embeddedIdentity = structuredClone(exported.envelope);
  embeddedIdentity.instanceState.instanceId = "equip_attack";
  embeddedIdentity.stateFingerprint = equipmentTransferStateFingerprint(embeddedIdentity);
  cases.push([embeddedIdentity, "equipment_transfer_identity_embedded"]);

  const unknownRoot = structuredClone(exported.envelope);
  unknownRoot.futureRoot = {keep: true};
  cases.push([unknownRoot, "equipment_transfer_envelope_field_unknown"]);

  const badId = structuredClone(exported.envelope);
  badId.envelopeId = "unsafe id";
  cases.push([badId, "equipment_transfer_envelope_id_invalid"]);

  const target = profile(slots(), {}, 1);
  const targetBefore = structuredClone(target);
  for (const [envelope, expectedCode] of cases) {
    const envelopeBefore = structuredClone(envelope);
    const validated = validateEquipmentTransferEnvelope(envelope, catalog);
    assert.equal(validated.ok, false);
    assert.equal(validated.code, expectedCode);
    assert.deepEqual(envelope, envelopeBefore);

    const imported = importBackpackEquipmentEnvelope(target, catalog, envelope, trustedCapacity);
    assert.equal(imported.ok, false);
    assert.equal(imported.code, expectedCode);
    assert.deepEqual(target, targetBefore);
  }
});

test("wrong source slot, equipped selection, noncanonical wear, and full target never mutate inputs", () => {
  const {source, result: exported} = exportRareClub();
  assert.equal(exported.ok, true);

  const sourceBefore = structuredClone(source);
  const wrongSlot = exportBackpackEquipmentEnvelope(
    source,
    catalog,
    "weapon_club",
    "equip_000009",
    {...capacity, sourceSlotIndex: 3, envelopeId: "eqx_wrong_slot_0001"},
  );
  assert.equal(wrongSlot.ok, false);
  assert.equal(wrongSlot.code, "equipment_transfer_source_slot_mismatch");
  assert.deepEqual(source, sourceBefore);

  const equipped = profile(slots(), {
    equip_000050: instance("equip_000050", "weapon_club", {location: "equipped", slotId: "right_hand_weapon"}),
  }, 51);
  equipped.equipmentSlots = {right_hand_weapon: "weapon_club"};
  equipped.equipmentSlotInstanceIds = {right_hand_weapon: "equip_000050"};
  const equippedBefore = structuredClone(equipped);
  const equippedExport = exportBackpackEquipmentEnvelope(
    equipped,
    catalog,
    "weapon_club",
    "equip_000050",
    {...capacity, envelopeId: "eqx_equipped_0000001"},
  );
  assert.equal(equippedExport.ok, false);
  assert.equal(equippedExport.code, "equipment_instance_missing");
  assert.deepEqual(equipped, equippedBefore);

  const badWear = structuredClone(exported.envelope);
  badWear.instanceState.wearCounters.attackCount = 100;
  badWear.stateFingerprint = equipmentTransferStateFingerprint(badWear);
  const badWearResult = validateEquipmentTransferEnvelope(badWear, catalog);
  assert.equal(badWearResult.ok, false);
  assert.equal(badWearResult.code, "equipment_transfer_instance_state_invalid");

  const fullTarget = profile(
    slots(
      {itemId: "armor_hide", count: 1},
      {itemId: "armor_hide", count: 1},
      {itemId: "armor_hide", count: 1},
      {itemId: "armor_hide", count: 1},
    ),
    {
      equip_000101: instance("equip_000101", "armor_hide"),
      equip_000102: instance("equip_000102", "armor_hide"),
      equip_000103: instance("equip_000103", "armor_hide"),
      equip_000104: instance("equip_000104", "armor_hide"),
    },
    105,
  );
  const fullBefore = structuredClone(fullTarget);
  const envelopeBefore = structuredClone(exported.envelope);
  const full = importBackpackEquipmentEnvelope(fullTarget, catalog, exported.envelope, trustedCapacity);
  assert.equal(full.ok, false);
  assert.equal(full.code, "equipment_transfer_backpack_full");
  assert.deepEqual(fullTarget, fullBefore);
  assert.deepEqual(exported.envelope, envelopeBefore);
});

test("fingerprint and public summary are stable across object key order and hide provenance", () => {
  const {result: exported} = exportRareClub();
  assert.equal(exported.ok, true);
  const state = exported.envelope.instanceState;
  const reorderedState = Object.fromEntries(Object.entries(state).reverse());
  assert.equal(equipmentTransferStateFingerprint(state), equipmentTransferStateFingerprint(reorderedState));

  const summary = publicEquipmentTransferSummary(exported.envelope, catalog);
  assert.equal(summary.envelopeId, exported.envelope.envelopeId);
  assert.equal(summary.instanceState.durability, 17);
  assert.equal(summary.instanceState.enhancement.level, 4);
  assert.deepEqual(summary.instanceState.affixes, [{id: "future_power", value: 7}]);
  assert.equal(Object.hasOwn(summary.instanceState, "source"), false);
  assert.equal(Object.hasOwn(summary.instanceState, "transferProvenance"), false);
  assert.equal(Object.hasOwn(summary, "provenance"), false);
  assert.equal(JSON.stringify(summary).includes("equip_000009"), false);

  const invalidEnvelopes = [];
  const future = structuredClone(exported.envelope);
  future.schemaVersion = 2;
  invalidEnvelopes.push(future);
  const missingFingerprint = structuredClone(exported.envelope);
  delete missingFingerprint.stateFingerprint;
  invalidEnvelopes.push(missingFingerprint);
  const unknownRoot = structuredClone(exported.envelope);
  unknownRoot.futureRoot = {mustNotBeProjected: true};
  invalidEnvelopes.push(unknownRoot);
  const malformedState = structuredClone(exported.envelope);
  malformedState.instanceState = "private-state";
  invalidEnvelopes.push(malformedState);
  const invalidFingerprint = structuredClone(exported.envelope);
  invalidFingerprint.stateFingerprint = "a".repeat(64);
  invalidEnvelopes.push(invalidFingerprint);
  const malformedHistory = structuredClone(exported.envelope);
  malformedHistory.instanceState.enhancement.history = [42];
  malformedHistory.stateFingerprint = equipmentTransferStateFingerprint(malformedHistory);
  assert.equal(validateEquipmentTransferEnvelope(malformedHistory, catalog).ok, false);
  invalidEnvelopes.push(malformedHistory);
  const exhaustedWear = structuredClone(exported.envelope);
  exhaustedWear.instanceState.wearCounters.attackCount = 100;
  exhaustedWear.stateFingerprint = equipmentTransferStateFingerprint(exhaustedWear);
  assert.equal(validateEquipmentTransferEnvelope(exhaustedWear, catalog).ok, false);
  invalidEnvelopes.push(exhaustedWear);
  for (const invalidEnvelope of invalidEnvelopes) {
    const before = structuredClone(invalidEnvelope);
    assert.deepEqual(publicEquipmentTransferSummary(invalidEnvelope, catalog), {});
    assert.deepEqual(invalidEnvelope, before);
  }
});

test("a server envelope rejects untrusted input and replay while the imported instance is live", () => {
  const {result: exported} = exportRareClub();
  assert.equal(exported.ok, true);
  const target = profile(slots(), {}, 1);
  const targetBefore = structuredClone(target);

  const untrusted = importBackpackEquipmentEnvelope(target, catalog, exported.envelope, capacity);
  assert.equal(untrusted.ok, false);
  assert.equal(untrusted.code, "equipment_transfer_envelope_untrusted");
  assert.deepEqual(target, targetBefore);

  const first = importBackpackEquipmentEnvelope(target, catalog, exported.envelope, trustedCapacity);
  assert.equal(first.ok, true);
  const firstBeforeReplay = structuredClone(first.profile);
  const envelopeBeforeReplay = structuredClone(exported.envelope);
  const replay = importBackpackEquipmentEnvelope(first.profile, catalog, exported.envelope, trustedCapacity);
  assert.equal(replay.ok, false);
  assert.equal(replay.code, "equipment_transfer_envelope_replay");
  assert.deepEqual(first.profile, firstBeforeReplay);
  assert.deepEqual(exported.envelope, envelopeBeforeReplay);

  const serverEnvelopeWithOldProvenance = structuredClone(exported.envelope);
  serverEnvelopeWithOldProvenance.envelopeId = "eqx_transfer_rare_0002";
  serverEnvelopeWithOldProvenance.instanceState.transferProvenance = {
    schemaVersion: 99,
    originEnvelopeId: "spoofed_old_origin",
    unknownFutureAudit: {keepInEnvelopeState: true},
  };
  serverEnvelopeWithOldProvenance.stateFingerprint = equipmentTransferStateFingerprint(serverEnvelopeWithOldProvenance);
  const secondTarget = profile(slots(), {}, 1);
  const imported = importBackpackEquipmentEnvelope(
    secondTarget,
    catalog,
    serverEnvelopeWithOldProvenance,
    trustedCapacity,
  );
  assert.equal(imported.ok, true);
  assert.deepEqual(imported.instance.transferProvenance, {
    schemaVersion: 1,
    originEnvelopeId: "eqx_transfer_rare_0002",
    originStateFingerprint: serverEnvelopeWithOldProvenance.stateFingerprint,
    sourceInstanceId: "equip_000009",
  });
});

test("batch validation rejects duplicate envelope identities without changing the container", () => {
  const {result: first} = exportRareClub();
  assert.equal(first.ok, true);
  const second = structuredClone(first.envelope);
  second.envelopeId = "eqx_transfer_rare_0002";
  const validBatch = [first.envelope, second];
  const validBefore = structuredClone(validBatch);
  const accepted = validateEquipmentTransferEnvelopeBatch(validBatch, catalog);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.envelopes.length, 2);
  assert.deepEqual(validBatch, validBefore);

  const duplicateBatch = [first.envelope, structuredClone(first.envelope)];
  const duplicateBefore = structuredClone(duplicateBatch);
  const duplicate = validateEquipmentTransferEnvelopeBatch(duplicateBatch, catalog);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "equipment_transfer_envelope_duplicate");
  assert.equal(duplicate.firstIndex, 0);
  assert.equal(duplicate.index, 1);
  assert.deepEqual(duplicateBatch, duplicateBefore);
});

test("unknown instance state must be strict JSON-safe and cannot collide in fingerprints", () => {
  const {result: exported} = exportRareClub();
  assert.equal(exported.ok, true);
  const cases = [
    ["undefined", (state) => { state.futureUnsafe = undefined; }],
    ["function", (state) => { state.futureUnsafe = () => true; }],
    ["bigint", (state) => { state.futureUnsafe = 1n; }],
    ["date", (state) => { state.futureUnsafe = new Date("2026-07-12T00:00:00.000Z"); }],
    ["non_enumerable", (state) => {
      Object.defineProperty(state, "futureUnsafe", {enumerable: false, value: 1});
    }],
    ["accessor", (state) => {
      Object.defineProperty(state, "futureUnsafe", {enumerable: true, get: () => 1});
    }],
    ["symbol_key", (state) => { state[Symbol("futureUnsafe")] = 1; }],
    ["sparse_array", (state) => { state.futureUnsafe = new Array(1); }],
    ["array_extra_key", (state) => {
      state.futureUnsafe = [];
      state.futureUnsafe.extra = 1;
    }],
    ["dangerous_key", (state) => {
      Object.defineProperty(state, "__proto__", {
        configurable: true,
        enumerable: true,
        value: {polluted: true},
        writable: true,
      });
    }],
    ["cycle", (state) => { state.futureUnsafe = state; }],
  ];

  for (const [label, mutate] of cases) {
    const envelope = structuredClone(exported.envelope);
    mutate(envelope.instanceState);
    const stateReference = envelope.instanceState;
    const result = validateEquipmentTransferEnvelope(envelope, catalog);
    assert.equal(result.ok, false, label);
    assert.equal(result.code, "equipment_transfer_json_unsafe", label);
    assert.equal(envelope.instanceState, stateReference, label);
    assert.throws(
      () => equipmentTransferStateFingerprint(envelope),
      (error) => error && error.code === "equipment_transfer_json_unsafe",
      label,
    );
  }

  const source = exportRareClub().source;
  source.equipmentInstances.equip_000009.futureUnsafe = undefined;
  const unsafeExport = exportBackpackEquipmentEnvelope(
    source,
    catalog,
    "weapon_club",
    "equip_000009",
    {...capacity, envelopeId: "eqx_json_unsafe_0001"},
  );
  assert.equal(unsafeExport.ok, false);
  assert.equal(unsafeExport.code, "equipment_transfer_json_unsafe");
  assert.equal(Object.hasOwn(source.equipmentInstances.equip_000009, "futureUnsafe"), true);
});

test("shared public v1 vectors match the Node projector", () => {
  const fixturePath = path.resolve(__dirname, "../../../tools/fixtures/equipment_transfer_public_v1_vectors.json");
  const document = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  assert.equal(document.schemaVersion, 1);
  assert.ok(Array.isArray(document.vectors));
  assert.ok(document.vectors.length > 0);
  for (const vector of document.vectors) {
    assert.deepEqual(
      publicEquipmentTransferSummary(vector.internalEnvelope, productionCatalog),
      vector.expectedPublic,
      String(vector.id || "equipment transfer public vector"),
    );
    assert.deepEqual(
      publicEquipmentTransferSummary(vector.expectedPublic),
      vector.expectedPublic,
      `${String(vector.id || "vector")}: public projection is not idempotent`,
    );
  }
});
