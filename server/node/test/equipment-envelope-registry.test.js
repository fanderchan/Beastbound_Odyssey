"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  EQUIPMENT_OWNERSHIP_INDEX_CHECKPOINT_DEPTH,
  OWNER_KIND_BANK,
  OWNER_KIND_CONSUMED,
  OWNER_KIND_MAIL,
  OWNER_KIND_MARKET,
  createEquipmentEnvelopeOwnershipRegistry,
  equipmentEnvelopeOwnershipRegistryDiagnostics,
  inheritEquipmentEnvelopeOwnershipRegistry,
} = require("../src/auth/equipment-envelope-registry");
const {
  cloneAuthorityRoot,
  freezeAuthorityRootCowRecordValues,
  markAuthorityRootTrusted,
  setAuthorityRootRecord,
} = require("../src/auth/authority-root-clone");
const {
  canonicalDurableMutationReceipts,
} = require("../src/auth/durable-mutation-state");
const {
  commitConsumedEquipmentEnvelopeLedger,
  ensureConsumedEquipmentEnvelopeIds,
  readConsumedEquipmentEnvelopeLedger,
} = require("../src/auth/equipment-envelope-consumed-ledger");
const {
  commitMailAuthorityDelta,
  readMailAuthorityState,
  stageMailAuthorityUpsert,
} = require("../src/auth/mail-authority-state");

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

test("trusted roots update only touched profile, mail and market records", () => {
  const source = rootState();
  source.mailMessages.mail_alpha.recipientAccountId = "account_alpha";
  const mailRead = readMailAuthorityState(source.mailMessages);
  const ledgerRead = readConsumedEquipmentEnvelopeLedger(source.consumedEquipmentEnvelopes);
  assert.equal(mailRead.ok, true);
  assert.equal(ledgerRead.ok, true);
  const root = {
    ...source,
    profiles: freezeAuthorityRootCowRecordValues(source.profiles),
    marketListings: freezeAuthorityRootCowRecordValues(source.marketListings),
    mailMessages: mailRead.messages,
    consumedEquipmentEnvelopes: ledgerRead.ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
  };
  assert.equal(markAuthorityRootTrusted(root), true);
  const initial = createEquipmentEnvelopeOwnershipRegistry(root);
  assert.equal(initial.conflicts.length, 0);
  const baseline = equipmentEnvelopeOwnershipRegistryDiagnostics();

  const candidate = cloneAuthorityRoot(root);
  const profileDocument = structuredClone(candidate.profiles.player_alpha);
  profileDocument.profile.bank.slots[0].equipmentEnvelopes = [
    envelope("eqx_bank_registry_incremental_0002"),
  ];
  setAuthorityRootRecord(candidate, "profiles", "player_alpha", profileDocument);

  const stagedMail = stageMailAuthorityUpsert(candidate.mailMessages, {
    ...candidate.mailMessages.mail_alpha,
    equipmentEnvelopes: [envelope("eqx_mail_registry_incremental_0002")],
  });
  assert.equal(stagedMail.ok, true);
  candidate.mailMessages = stagedMail.messages;

  setAuthorityRootRecord(candidate, "marketListings", "market_alpha", {
    ...candidate.marketListings.market_alpha,
    equipmentEnvelope: envelope("eqx_market_registry_incremental_0002"),
  });
  const consumed = ensureConsumedEquipmentEnvelopeIds(
    candidate.consumedEquipmentEnvelopes,
    "eqx_unrelated_registry_incremental_0001",
  );
  assert.equal(consumed.ok, true);
  candidate.consumedEquipmentEnvelopes = consumed.ledger;

  const updated = createEquipmentEnvelopeOwnershipRegistry(candidate);
  assert.equal(updated.conflicts.length, 0);
  assert.equal(updated.ownershipsFor("eqx_bank_registry_0001").length, 0);
  assert.equal(updated.ownershipsFor("eqx_mail_registry_0001").length, 0);
  assert.equal(updated.ownershipsFor("eqx_market_registry_0001").length, 0);
  assert.equal(updated.requireUnique("eqx_bank_registry_incremental_0002", {
    kind: OWNER_KIND_BANK,
    id: "player_alpha",
  }).ok, true);
  assert.equal(updated.requireUnique("eqx_mail_registry_incremental_0002", {
    kind: OWNER_KIND_MAIL,
    id: "mail_alpha",
  }).ok, true);
  assert.equal(updated.requireUnique("eqx_market_registry_incremental_0002", {
    kind: OWNER_KIND_MARKET,
    id: "market_alpha",
  }).ok, true);

  candidate.mailMessages = commitMailAuthorityDelta(candidate.mailMessages);
  const committedLedger = commitConsumedEquipmentEnvelopeLedger(candidate.consumedEquipmentEnvelopes);
  assert.equal(committedLedger.ok, true);
  candidate.consumedEquipmentEnvelopes = committedLedger.ledger;
  assert.equal(createEquipmentEnvelopeOwnershipRegistry(candidate).conflicts.length, 0);

  const after = equipmentEnvelopeOwnershipRegistryDiagnostics();
  assert.equal(after.profileContainerScans - baseline.profileContainerScans, 0);
  assert.equal(after.marketContainerScans - baseline.marketContainerScans, 0);
  assert.equal(after.mailContainerScans - baseline.mailContainerScans, 0);
  assert.equal(after.profileRecordUpdates - baseline.profileRecordUpdates, 1);
  assert.equal(after.marketRecordUpdates - baseline.marketRecordUpdates, 1);
  assert.equal(after.mailRecordUpdates - baseline.mailRecordUpdates, 2);
  assert.equal(after.consumedTargetedRefreshes - baseline.consumedTargetedRefreshes, 1);
  assert.equal(after.consumedFallbackRefreshes - baseline.consumedFallbackRefreshes, 0);
  assert.equal(after.rootIncrementalAggregations > baseline.rootIncrementalAggregations, true);
});

test("a consumed-only append refreshes the exact active envelope without rescanning custody", () => {
  const source = rootState();
  source.mailMessages.mail_alpha.recipientAccountId = "account_alpha";
  const mailRead = readMailAuthorityState(source.mailMessages);
  const ledgerRead = readConsumedEquipmentEnvelopeLedger(source.consumedEquipmentEnvelopes);
  assert.equal(mailRead.ok, true);
  assert.equal(ledgerRead.ok, true);
  const root = {
    ...source,
    profiles: freezeAuthorityRootCowRecordValues(source.profiles),
    marketListings: freezeAuthorityRootCowRecordValues(source.marketListings),
    mailMessages: mailRead.messages,
    consumedEquipmentEnvelopes: ledgerRead.ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
  };
  assert.equal(markAuthorityRootTrusted(root), true);
  assert.equal(createEquipmentEnvelopeOwnershipRegistry(root).conflicts.length, 0);
  const baseline = equipmentEnvelopeOwnershipRegistryDiagnostics();

  const candidate = cloneAuthorityRoot(root);
  const consumed = ensureConsumedEquipmentEnvelopeIds(
    candidate.consumedEquipmentEnvelopes,
    "eqx_mail_registry_0001",
  );
  assert.equal(consumed.ok, true);
  candidate.consumedEquipmentEnvelopes = consumed.ledger;
  const registry = createEquipmentEnvelopeOwnershipRegistry(candidate);
  assert.equal(registry.duplicates.length, 1);
  assert.equal(registry.duplicates[0].envelopeId, "eqx_mail_registry_0001");
  assert.equal(registry.requireUnique("eqx_mail_registry_0001", {
    kind: OWNER_KIND_MAIL,
    id: "mail_alpha",
  }).code, "equipment_transfer_envelope_duplicate");

  const after = equipmentEnvelopeOwnershipRegistryDiagnostics();
  assert.equal(after.profileContainerScans - baseline.profileContainerScans, 0);
  assert.equal(after.marketContainerScans - baseline.marketContainerScans, 0);
  assert.equal(after.mailContainerScans - baseline.mailContainerScans, 0);
  assert.equal(after.consumedTargetedRefreshes - baseline.consumedTargetedRefreshes, 1);
  assert.equal(after.consumedFallbackRefreshes - baseline.consumedFallbackRefreshes, 0);
});

test("record-index checkpoints rebuild only derived slices after the bounded overlay depth", () => {
  const source = rootState();
  source.mailMessages.mail_alpha.recipientAccountId = "account_alpha";
  const mailRead = readMailAuthorityState(source.mailMessages);
  const ledgerRead = readConsumedEquipmentEnvelopeLedger(source.consumedEquipmentEnvelopes);
  assert.equal(mailRead.ok, true);
  assert.equal(ledgerRead.ok, true);
  let current = {
    ...source,
    profiles: freezeAuthorityRootCowRecordValues(source.profiles),
    marketListings: freezeAuthorityRootCowRecordValues(source.marketListings),
    mailMessages: mailRead.messages,
    consumedEquipmentEnvelopes: ledgerRead.ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
  };
  assert.equal(markAuthorityRootTrusted(current), true);
  assert.equal(createEquipmentEnvelopeOwnershipRegistry(current).conflicts.length, 0);
  const baseline = equipmentEnvelopeOwnershipRegistryDiagnostics();
  let latestEnvelopeId = "";

  for (let revision = 1; revision <= EQUIPMENT_OWNERSHIP_INDEX_CHECKPOINT_DEPTH + 1; revision += 1) {
    const candidate = cloneAuthorityRoot(current);
    const profileDocument = structuredClone(candidate.profiles.player_alpha);
    latestEnvelopeId = `eqx_profile_checkpoint_${String(revision).padStart(8, "0")}`;
    profileDocument.profile.bank.slots[0].equipmentEnvelopes = [envelope(latestEnvelopeId)];
    setAuthorityRootRecord(candidate, "profiles", "player_alpha", profileDocument);
    const registry = createEquipmentEnvelopeOwnershipRegistry(candidate);
    assert.equal(registry.requireUnique(latestEnvelopeId, {
      kind: OWNER_KIND_BANK,
      id: "player_alpha",
    }).ok, true);
    freezeAuthorityRootCowRecordValues(candidate.profiles);
    freezeAuthorityRootCowRecordValues(candidate.marketListings);
    assert.equal(markAuthorityRootTrusted(candidate), true);
    current = candidate;
  }

  const after = equipmentEnvelopeOwnershipRegistryDiagnostics();
  assert.equal(after.profileContainerScans - baseline.profileContainerScans, 0);
  assert.equal(after.marketContainerScans - baseline.marketContainerScans, 0);
  assert.equal(after.mailContainerScans - baseline.mailContainerScans, 0);
  assert.equal(after.profileIndexCheckpoints - baseline.profileIndexCheckpoints, 1);
  assert.equal(after.rootFullAggregations - baseline.rootFullAggregations, 1);
  assert.equal(current.profiles.player_alpha.profile.bank.slots[0].equipmentEnvelopes[0].envelopeId, latestEnvelopeId);
});

test("root-only churn reuses the unchanged aggregate without growing an overlay chain", () => {
  const source = rootState();
  source.mailMessages.mail_alpha.recipientAccountId = "account_alpha";
  const mailRead = readMailAuthorityState(source.mailMessages);
  const ledgerRead = readConsumedEquipmentEnvelopeLedger(source.consumedEquipmentEnvelopes);
  assert.equal(mailRead.ok, true);
  assert.equal(ledgerRead.ok, true);
  let current = {
    ...source,
    profiles: freezeAuthorityRootCowRecordValues(source.profiles),
    marketListings: freezeAuthorityRootCowRecordValues(source.marketListings),
    mailMessages: mailRead.messages,
    consumedEquipmentEnvelopes: ledgerRead.ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
  };
  assert.equal(markAuthorityRootTrusted(current), true);
  assert.equal(createEquipmentEnvelopeOwnershipRegistry(current).conflicts.length, 0);
  const baseline = equipmentEnvelopeOwnershipRegistryDiagnostics();

  for (let revision = 1; revision <= EQUIPMENT_OWNERSHIP_INDEX_CHECKPOINT_DEPTH + 1; revision += 1) {
    const candidate = {...current, runtimeRegistryGeneration: revision};
    assert.equal(inheritEquipmentEnvelopeOwnershipRegistry(current, candidate), true);
    assert.equal(markAuthorityRootTrusted(candidate), true);
    assert.equal(createEquipmentEnvelopeOwnershipRegistry(candidate).conflicts.length, 0);
    current = candidate;
  }

  const after = equipmentEnvelopeOwnershipRegistryDiagnostics();
  assert.equal(after.profileContainerScans - baseline.profileContainerScans, 0);
  assert.equal(after.marketContainerScans - baseline.marketContainerScans, 0);
  assert.equal(after.mailContainerScans - baseline.mailContainerScans, 0);
  assert.equal(after.aggregateCheckpoints - baseline.aggregateCheckpoints, 0);
  assert.equal(after.rootFullAggregations - baseline.rootFullAggregations, 0);
  assert.equal(
    after.rootIncrementalAggregations - baseline.rootIncrementalAggregations,
    EQUIPMENT_OWNERSHIP_INDEX_CHECKPOINT_DEPTH + 1,
  );
});
