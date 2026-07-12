"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  OWNER_KIND_BANK,
  OWNER_KIND_CONSUMED,
  OWNER_KIND_MAIL,
  OWNER_KIND_MARKET,
  createEquipmentEnvelopeOwnershipRegistry,
} = require("../src/auth/equipment-envelope-registry");

function envelope(envelopeId) {
  return {envelopeId};
}

function rootState(ids = {}) {
  return {
    profiles: {
      player_alpha: {
        playerId: "player_alpha",
        profile: {
          bank: {
            slots: [
              {equipmentEnvelopes: [envelope(ids.bank || "eqx_bank_registry_0001")]},
            ],
          },
          equipmentInstances: {
            equip_000001: {
              transferProvenance: {
                originEnvelopeId: ids.materialized || "eqx_materialized_registry_0001",
              },
            },
          },
        },
      },
    },
    mailMessages: {
      mail_alpha: {
        mailId: "mail_alpha",
        equipmentEnvelopes: [envelope(ids.mail || "eqx_mail_registry_0001")],
      },
    },
    marketListings: {
      market_alpha: {
        listingId: "market_alpha",
        equipmentEnvelope: envelope(ids.market || "eqx_market_registry_0001"),
      },
    },
    consumedEquipmentEnvelopes: {
      [ids.materialized || "eqx_materialized_registry_0001"]: {
        schemaVersion: 1,
        envelopeId: ids.materialized || "eqx_materialized_registry_0001",
      },
    },
  };
}

test("registry deterministically scans bank, mail, market, and materialized ownership without mutation", () => {
  const root = rootState();
  const before = structuredClone(root);
  const registry = createEquipmentEnvelopeOwnershipRegistry(root);

  assert.equal(registry.ownerships.length, 3);
  assert.deepEqual(registry.ownerships.map((entry) => [entry.envelopeId, entry.kind, entry.id]), [
    ["eqx_bank_registry_0001", OWNER_KIND_BANK, "player_alpha"],
    ["eqx_mail_registry_0001", OWNER_KIND_MAIL, "mail_alpha"],
    ["eqx_market_registry_0001", OWNER_KIND_MARKET, "market_alpha"],
  ]);
  assert.equal(registry.consumedEnvelopeCount, 1);
  assert.equal(registry.isConsumed("eqx_materialized_registry_0001"), true);
  assert.equal(registry.duplicates.length, 0);
  assert.equal(registry.isAvailable("eqx_new_registry_0001"), true);
  assert.equal(registry.isAvailable("eqx_mail_registry_0001"), false);
  assert.equal(registry.isAvailable("eqx_materialized_registry_0001"), false);
  assert.deepEqual(root, before);

  const legacyRoot = rootState();
  delete legacyRoot.consumedEquipmentEnvelopes;
  const legacyRegistry = createEquipmentEnvelopeOwnershipRegistry(legacyRoot);
  assert.equal(legacyRegistry.isAvailable("eqx_materialized_registry_0001"), false);
});

test("registry requires one exact owner and reports missing or mismatched custody", () => {
  const registry = createEquipmentEnvelopeOwnershipRegistry(rootState());
  const exact = registry.requireUnique("eqx_mail_registry_0001", {kind: OWNER_KIND_MAIL, id: "mail_alpha"});
  assert.equal(exact.ok, true);
  assert.equal(exact.ownership.path, "mailMessages.mail_alpha.equipmentEnvelopes[0]");
  const materialized = registry.requireMaterializedInstanceOrigin("player_alpha", "equip_000001");
  assert.equal(materialized.ok, true);
  assert.equal(materialized.hasOrigin, true);
  assert.equal(materialized.envelopeId, "eqx_materialized_registry_0001");
  assert.deepEqual(
    registry.requireMaterializedInstanceOrigin("player_alpha", "equip_without_origin"),
    {ok: true, hasOrigin: false},
  );

  const missing = registry.requireUnique("eqx_missing_registry_0001", {kind: OWNER_KIND_MAIL, id: "mail_alpha"});
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "equipment_transfer_envelope_ownership_missing");

  const mismatch = registry.requireUnique("eqx_mail_registry_0001", {kind: OWNER_KIND_MARKET, id: "market_alpha"});
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, "equipment_transfer_envelope_ownership_mismatch");
});

test("registry makes cross-container and materialized duplicates fail for every claimed owner", () => {
  const duplicateId = "eqx_cross_registry_0001";
  const root = rootState({
    bank: duplicateId,
    mail: duplicateId,
    market: duplicateId,
    materialized: duplicateId,
  });
  const before = structuredClone(root);
  const registry = createEquipmentEnvelopeOwnershipRegistry(root);

  assert.equal(registry.ownershipsFor(duplicateId).length, 3);
  assert.equal(registry.duplicates.length, 1);
  for (const expectedOwner of [
    {kind: OWNER_KIND_BANK, id: "player_alpha"},
    {kind: OWNER_KIND_MAIL, id: "mail_alpha"},
    {kind: OWNER_KIND_MARKET, id: "market_alpha"},
    {kind: OWNER_KIND_CONSUMED, id: duplicateId},
  ]) {
    const result = registry.requireUnique(duplicateId, expectedOwner);
    assert.equal(result.ok, false);
    assert.equal(result.code, "equipment_transfer_envelope_duplicate");
  }
  const materialized = registry.requireMaterializedInstanceOrigin("player_alpha", "equip_000001");
  assert.equal(materialized.ok, false);
  assert.equal(materialized.code, "equipment_transfer_envelope_duplicate");
  assert.deepEqual(root, before);
});

test("registry keeps prior envelope origins consumed after equipment is re-exported into another escrow", () => {
  const priorEnvelopeId = "eqx_mail_prior_origin_0001";
  const root = rootState();
  root.profiles.player_alpha.profile.bank.slots[0].equipmentEnvelopes[0].instanceState = {
    transferProvenance: {originEnvelopeId: priorEnvelopeId},
  };
  root.mailMessages.mail_stale = {
    mailId: "mail_stale",
    equipmentEnvelopes: [envelope(priorEnvelopeId)],
  };
  root.consumedEquipmentEnvelopes[priorEnvelopeId] = {
    schemaVersion: 1,
    envelopeId: priorEnvelopeId,
  };
  const registry = createEquipmentEnvelopeOwnershipRegistry(root);

  const ownerships = registry.ownershipsFor(priorEnvelopeId);
  assert.equal(ownerships.length, 1);
  assert.equal(registry.isConsumed(priorEnvelopeId), true);
  assert.equal(ownerships.some((entry) => entry.kind === OWNER_KIND_MAIL && entry.id === "mail_stale"), true);
  assert.equal(registry.materializedTraces.some((entry) => (
    entry.originEnvelopeId === priorEnvelopeId && entry.traceContainerKind === OWNER_KIND_BANK
  )), true);
  const claim = registry.requireUnique(priorEnvelopeId, {kind: OWNER_KIND_MAIL, id: "mail_stale"});
  assert.equal(claim.ok, false);
  assert.equal(claim.code, "equipment_transfer_envelope_duplicate");
});

test("registry freezes one consumed origin referenced by two materialized equipment states", () => {
  const originEnvelopeId = "eqx_mail_double_materialized_0001";
  const root = rootState({materialized: originEnvelopeId});
  root.profiles.player_beta = {
    playerId: "player_beta",
    profile: {
      equipmentInstances: {
        equip_000002: {
          transferProvenance: {originEnvelopeId},
        },
      },
    },
  };
  const registry = createEquipmentEnvelopeOwnershipRegistry(root);
  assert.equal(registry.duplicates.length, 0);
  assert.equal(registry.conflicts.some((entry) => (
    entry.code === "equipment_materialized_origin_duplicate"
    && entry.originEnvelopeId === originEnvelopeId
  )), true);
  const source = registry.requireMaterializedInstanceOrigin("player_alpha", "equip_000001");
  assert.equal(source.ok, false);
  assert.equal(source.code, "equipment_materialized_origin_duplicate");
});

test("registry ignores malformed buckets and blank identities rather than inventing ownership", () => {
  const registry = createEquipmentEnvelopeOwnershipRegistry({
    profiles: {bad: {profile: {bank: {slots: [{equipmentEnvelopes: [{envelopeId: ""}, null]}]}}}},
    mailMessages: [],
    marketListings: {bad: {equipmentEnvelope: {envelopeId: 17}}},
  });
  assert.deepEqual(registry.ownerships, []);
  assert.equal(registry.isAvailable(""), false);
});
