#!/usr/bin/env node

import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import os from "node:os";
import {performance} from "node:perf_hooks";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_COUNT = 200;
const MARKET_COUNT = 120;
const MAIL_COUNT = 200;
const TOMBSTONE_COUNT = 100_000;
const WARMUPS = 5;
const SAMPLES = 20;

const {
  cloneAuthorityRoot,
  freezeAuthorityRootCowRecordValues,
  markAuthorityRootTrusted,
  setAuthorityRootRecord,
} = require("../server/node/src/auth/authority-root-clone");
const {
  OWNER_KIND_BANK,
  OWNER_KIND_MAIL,
  OWNER_KIND_MARKET,
  createEquipmentEnvelopeOwnershipRegistry,
  equipmentEnvelopeOwnershipRegistryDiagnostics,
} = require("../server/node/src/auth/equipment-envelope-registry");
const {
  ensureConsumedEquipmentEnvelopeIds,
  readConsumedEquipmentEnvelopeLedger,
} = require("../server/node/src/auth/equipment-envelope-consumed-ledger");
const {
  canonicalDurableMutationReceipts,
} = require("../server/node/src/auth/durable-mutation-state");
const {
  mailAuthorityDiagnostics,
  readMailAuthorityState,
  stageMailAuthorityUpsert,
} = require("../server/node/src/auth/mail-authority-state");

const root = capacityRoot();
const initial = createEquipmentEnvelopeOwnershipRegistry(root);
assert.equal(initial.ownerships.length, PROFILE_COUNT + MARKET_COUNT + MAIL_COUNT);
assert.equal(initial.consumedEnvelopeCount, TOMBSTONE_COUNT);
assert.deepEqual(initial.conflicts, []);

const baselineDiagnostics = equipmentEnvelopeOwnershipRegistryDiagnostics();
const baselineMailDiagnostics = mailAuthorityDiagnostics(root.mailMessages);
const durations = [];
let guardedContainerEnumerations = 0;

for (let index = 0; index < WARMUPS + SAMPLES; index += 1) {
  const candidate = cloneAuthorityRoot(root);
  const profileIndex = index % PROFILE_COUNT;
  const marketIndex = index % MARKET_COUNT;
  const mailIndex = index % MAIL_COUNT;
  const profileId = `player_registry_gate_${pad(profileIndex, 3)}`;
  const listingId = `listing_registry_gate_${pad(marketIndex, 3)}`;
  const mailId = `mail_registry_gate_${pad(mailIndex, 3)}`;
  const bankEnvelopeId = `eqx_registry_touch_bank_${pad(index, 8)}`;
  const marketEnvelopeId = `eqx_registry_touch_market_${pad(index, 8)}`;
  const mailEnvelopeId = `eqx_registry_touch_mail_${pad(index, 8)}`;
  const consumedEnvelopeId = `eqx_registry_touch_consumed_${pad(index, 8)}`;

  const profileDocument = structuredClone(candidate.profiles[profileId]);
  profileDocument.profile.bank.slots[0].equipmentEnvelopes = [{envelopeId: bankEnvelopeId}];
  setAuthorityRootRecord(candidate, "profiles", profileId, profileDocument);
  setAuthorityRootRecord(candidate, "marketListings", listingId, {
    ...candidate.marketListings[listingId],
    equipmentEnvelope: {envelopeId: marketEnvelopeId},
  });
  const stagedMail = stageMailAuthorityUpsert(candidate.mailMessages, {
    ...candidate.mailMessages[mailId],
    equipmentEnvelopes: [{envelopeId: mailEnvelopeId}],
  });
  assert.equal(stagedMail.ok, true);
  candidate.mailMessages = stagedMail.messages;
  const consumed = ensureConsumedEquipmentEnvelopeIds(
    candidate.consumedEquipmentEnvelopes,
    consumedEnvelopeId,
  );
  assert.equal(consumed.ok, true);
  candidate.consumedEquipmentEnvelopes = consumed.ledger;

  const guarded = new Set([
    candidate.profiles,
    candidate.marketListings,
    candidate.mailMessages,
    candidate.consumedEquipmentEnvelopes,
  ]);
  const restoreEnumerationGuards = installEnumerationGuards(guarded, () => {
    guardedContainerEnumerations += 1;
  });
  const startedAt = performance.now();
  let registry;
  try {
    registry = createEquipmentEnvelopeOwnershipRegistry(candidate);
  } finally {
    restoreEnumerationGuards();
  }
  const durationMs = performance.now() - startedAt;
  if (index >= WARMUPS) {
    durations.push(durationMs);
  }
  assert.equal(registry.conflicts.length, 0);
  assert.equal(registry.requireUnique(bankEnvelopeId, {
    kind: OWNER_KIND_BANK,
    id: profileId,
  }).ok, true);
  assert.equal(registry.requireUnique(marketEnvelopeId, {
    kind: OWNER_KIND_MARKET,
    id: listingId,
  }).ok, true);
  assert.equal(registry.requireUnique(mailEnvelopeId, {
    kind: OWNER_KIND_MAIL,
    id: mailId,
  }).ok, true);
  assert.equal(registry.isConsumed(consumedEnvelopeId), true);
  assert.equal(registry.ownerships.length, PROFILE_COUNT + MARKET_COUNT + MAIL_COUNT);
}

// A tombstone-only write must refresh the exact active envelope and surface a
// custody conflict without rescanning profiles, mail, market, or tombstones.
const consumedConflictCandidate = cloneAuthorityRoot(root);
const activeMailEnvelopeId = "eqx_registry_mail_00000000";
const conflictingConsumed = ensureConsumedEquipmentEnvelopeIds(
  consumedConflictCandidate.consumedEquipmentEnvelopes,
  activeMailEnvelopeId,
);
assert.equal(conflictingConsumed.ok, true);
consumedConflictCandidate.consumedEquipmentEnvelopes = conflictingConsumed.ledger;
const conflictRegistry = createEquipmentEnvelopeOwnershipRegistry(consumedConflictCandidate);
assert.equal(conflictRegistry.duplicates.length, 1);
assert.equal(conflictRegistry.duplicates[0].envelopeId, activeMailEnvelopeId);
assert.equal(conflictRegistry.requireUnique(activeMailEnvelopeId, {
  kind: OWNER_KIND_MAIL,
  id: "mail_registry_gate_000",
}).code, "equipment_transfer_envelope_duplicate");

const finalDiagnostics = equipmentEnvelopeOwnershipRegistryDiagnostics();
const finalMailDiagnostics = mailAuthorityDiagnostics(root.mailMessages);
const measuredMutationCount = WARMUPS + SAMPLES;
assert.equal(finalDiagnostics.profileContainerScans - baselineDiagnostics.profileContainerScans, 0);
assert.equal(finalDiagnostics.marketContainerScans - baselineDiagnostics.marketContainerScans, 0);
assert.equal(finalDiagnostics.mailContainerScans - baselineDiagnostics.mailContainerScans, 0);
assert.equal(finalDiagnostics.profileRecordUpdates - baselineDiagnostics.profileRecordUpdates, measuredMutationCount);
assert.equal(finalDiagnostics.marketRecordUpdates - baselineDiagnostics.marketRecordUpdates, measuredMutationCount);
assert.equal(finalDiagnostics.mailRecordUpdates - baselineDiagnostics.mailRecordUpdates, measuredMutationCount);
assert.equal(
  finalDiagnostics.consumedTargetedRefreshes - baselineDiagnostics.consumedTargetedRefreshes,
  measuredMutationCount + 1,
);
assert.equal(
  finalDiagnostics.consumedFallbackRefreshes - baselineDiagnostics.consumedFallbackRefreshes,
  0,
);
assert.ok(
  finalDiagnostics.rootIncrementalAggregations - baselineDiagnostics.rootIncrementalAggregations
    >= measuredMutationCount + 1,
);
assert.equal(finalMailDiagnostics.ownKeyEnumerations - baselineMailDiagnostics.ownKeyEnumerations, 0);
assert.equal(guardedContainerEnumerations, 0);

const p95Ms = percentile(durations, 0.95);
assert.ok(p95Ms <= 20, `registry p95 ${p95Ms.toFixed(3)}ms exceeded 20ms`);

process.stdout.write(`${JSON.stringify({
  status: "ok",
  head: gitHead(),
  node: process.version,
  cpu: os.cpus()[0]?.model || "unknown",
  capacities: {
    profiles: PROFILE_COUNT,
    marketListings: MARKET_COUNT,
    activeMail: MAIL_COUNT,
    consumedEquipmentEnvelopes: TOMBSTONE_COUNT,
  },
  warmups: WARMUPS,
  samples: SAMPLES,
  p95Ms: round(p95Ms),
  maxMs: round(Math.max(...durations)),
  guardedContainerEnumerations,
  diagnosticsDelta: diagnosticDelta(baselineDiagnostics, finalDiagnostics),
  mailOwnKeyEnumerationsDelta:
    finalMailDiagnostics.ownKeyEnumerations - baselineMailDiagnostics.ownKeyEnumerations,
  samplesMs: durations.map(round),
}, null, 2)}\n`);

function capacityRoot() {
  const profiles = {};
  for (let index = 0; index < PROFILE_COUNT; index += 1) {
    const playerId = `player_registry_gate_${pad(index, 3)}`;
    profiles[playerId] = {
      playerId,
      accountId: `account_registry_gate_${pad(index, 3)}`,
      profileRevision: 1,
      updatedAt: "2026-08-14T00:00:00.000Z",
      profile: {
        bank: {
          slots: [{
            equipmentEnvelopes: [{envelopeId: `eqx_registry_bank_${pad(index, 8)}`}],
          }],
        },
        equipmentInstances: {},
      },
      schemaVersion: 1,
    };
  }
  const marketListings = {};
  for (let index = 0; index < MARKET_COUNT; index += 1) {
    const listingId = `listing_registry_gate_${pad(index, 3)}`;
    marketListings[listingId] = {
      listingId,
      sellerAccountId: `account_registry_gate_${pad(index % PROFILE_COUNT, 3)}`,
      equipmentEnvelope: {envelopeId: `eqx_registry_market_${pad(index, 8)}`},
      schemaVersion: 2,
    };
  }
  const mailMessages = {};
  for (let index = 0; index < MAIL_COUNT; index += 1) {
    const mailId = `mail_registry_gate_${pad(index, 3)}`;
    mailMessages[mailId] = {
      mailId,
      senderAccountId: "system_registry_gate",
      recipientAccountId: "account_registry_gate_000",
      title: `容量邮件${index}`,
      body: "装备归属容量门槛",
      items: [],
      equipmentEnvelopes: [{envelopeId: `eqx_registry_mail_${pad(index, 8)}`}],
      createdAt: "2026-08-14T00:00:00.000Z",
      readAt: null,
      schemaVersion: 1,
    };
  }
  let tombstones = {};
  for (let index = 0; index < TOMBSTONE_COUNT; index += 1) {
    const envelopeId = `eqx_registry_tombstone_${pad(index, 12)}`;
    tombstones[envelopeId] = {schemaVersion: 1, envelopeId};
  }
  const mailRead = readMailAuthorityState(mailMessages);
  const ledgerRead = readConsumedEquipmentEnvelopeLedger(tombstones);
  tombstones = null;
  assert.equal(mailRead.ok, true);
  assert.equal(ledgerRead.ok, true);
  const value = {
    profiles: freezeAuthorityRootCowRecordValues(profiles),
    marketListings: freezeAuthorityRootCowRecordValues(marketListings),
    mailMessages: mailRead.messages,
    consumedEquipmentEnvelopes: ledgerRead.ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
  };
  assert.equal(markAuthorityRootTrusted(value), true);
  return value;
}

function installEnumerationGuards(guarded, onEnumeration) {
  const originalKeys = Object.keys;
  const originalEntries = Object.entries;
  const originalValues = Object.values;
  const originalOwnKeys = Reflect.ownKeys;
  Object.keys = function guardedKeys(value) {
    if (guarded.has(value)) onEnumeration();
    return originalKeys(value);
  };
  Object.entries = function guardedEntries(value) {
    if (guarded.has(value)) onEnumeration();
    return originalEntries(value);
  };
  Object.values = function guardedValues(value) {
    if (guarded.has(value)) onEnumeration();
    return originalValues(value);
  };
  Reflect.ownKeys = function guardedOwnKeys(value) {
    if (guarded.has(value)) onEnumeration();
    return originalOwnKeys(value);
  };
  return () => {
    Object.keys = originalKeys;
    Object.entries = originalEntries;
    Object.values = originalValues;
    Reflect.ownKeys = originalOwnKeys;
  };
}

function diagnosticDelta(before, after) {
  const result = {};
  for (const key of Object.keys(after).sort()) {
    result[key] = Number(after[key] || 0) - Number(before[key] || 0);
  }
  return result;
}

function percentile(values, ratio) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * ratio) - 1)] || 0;
}

function pad(value, width) {
  return String(value).padStart(width, "0");
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

function gitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
}
