#!/usr/bin/env node

import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import os from "node:os";
import path from "node:path";
import {performance} from "node:perf_hooks";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WARMUPS = 5;
const SAMPLES = 20;
const NOW_BASE_MS = Date.parse("2040-01-01T00:00:00.000Z");
const ACTOR_ACCOUNT_ID = "acc_planner_000";
const ACTOR_PLAYER_ID = "player_planner_000";
const REQUEST_HASH = "a".repeat(64);

const {
  authorityRecordStateDiagnostics,
  cloneAuthorityRoot,
  freezeAuthorityRootCowRecordValues,
  freezeAuthorityRootIdentityRecordValues,
} = require("../server/node/src/auth/authority-root-clone");
const {
  DURABLE_RECEIPT_TTL_MS,
  canonicalDurableMutationReceipts,
  commitDurableMutationReceiptDelta,
  durableMutationReceiptCount,
  stageDurableMutationReceipt,
} = require("../server/node/src/auth/durable-mutation-state");
const {
  readConsumedEquipmentEnvelopeLedgerIndex,
} = require("../server/node/src/auth/equipment-envelope-consumed-ledger");
const {
  mailAuthorityDiagnostics,
  readMailAuthorityState,
} = require("../server/node/src/auth/mail-authority-state");
const {
  MARKET_MAX_LISTINGS,
  MARKET_MAX_LISTINGS_PER_SELLER,
} = require("../server/node/src/auth/market-listing-state");
const {
  __buildMysqlSavePlanFromPersistentDataForTest: buildPlan,
} = require("../server/node/src/mysql-store");

let current = capacityState();
let actorListingId = "listing_planner_000";
const samplesMs = [];
let guardedContainerEnumerations = 0;
let maximumWrites = 0;
let maximumLocks = 0;
const beforeDiagnostics = authorityRecordStateDiagnostics();
const beforeMailOwnKeys = mailAuthorityDiagnostics(current.mailMessages).ownKeyEnumerations;

for (let index = 0; index < WARMUPS + SAMPLES; index += 1) {
  const measured = index >= WARMUPS;
  const nowMs = NOW_BASE_MS + index;
  const candidate = cloneAuthorityRoot(current);
  const beforeBinding = current.profileBindings[ACTOR_ACCOUNT_ID];
  const beforeProfile = current.profiles[ACTOR_PLAYER_ID];
  const nextRevision = Number(beforeBinding.profileRevision) + 1;
  const updatedAt = new Date(nowMs).toISOString();
  candidate.profileBindings[ACTOR_ACCOUNT_ID] = {
    ...beforeBinding,
    profileRevision: nextRevision,
    updatedAt,
  };
  candidate.profiles[ACTOR_PLAYER_ID] = {
    ...beforeProfile,
    profileRevision: nextRevision,
    updatedAt,
    profile: {
      ...beforeProfile.profile,
      stoneCoins: Number(beforeProfile.profile.stoneCoins) + (index % 2 === 0 ? 10 : -10),
    },
  };
  const operationId = `operation_planner_gate_${String(index).padStart(4, "0")}`;
  const actionId = index % 2 === 0 ? "cancel_market_listing" : "create_market_listing";
  candidate.mutationReceipts = stageDurableMutationReceipt(
    candidate.mutationReceipts,
    receipt(operationId, actionId, nowMs),
    {nowMs},
  );
  let scope;
  let expectedPlanKind;
  if (index % 2 === 0) {
    delete candidate.marketListings[actorListingId];
    scope = {
      kind: "row_local_market_cancel_v1",
      accountId: ACTOR_ACCOUNT_ID,
      playerId: ACTOR_PLAYER_ID,
      listingId: actorListingId,
      operationId,
      requestHash: REQUEST_HASH,
      actionId,
    };
    expectedPlanKind = "market_cancel_conditional_v1";
  } else {
    actorListingId = `listing_planner_actor_${String(index).padStart(4, "0")}`;
    candidate.marketListings[actorListingId] = listing(actorListingId, ACTOR_ACCOUNT_ID, updatedAt);
    scope = {
      kind: "row_local_market_create_v1",
      accountId: ACTOR_ACCOUNT_ID,
      playerId: ACTOR_PLAYER_ID,
      listingId: actorListingId,
      operationId,
      requestHash: REQUEST_HASH,
      actionId,
      observedTotalListingCount: 119,
      observedSellerListingCount: 0,
      maxTotalListings: MARKET_MAX_LISTINGS,
      maxSellerListings: MARKET_MAX_LISTINGS_PER_SELLER,
    };
    expectedPlanKind = "market_create_conditional_v1";
  }

  const guarded = new Set([
    current.accounts,
    current.sessions,
    current.profileBindings,
    current.accountCharacterSlots,
    current.profiles,
    current.marketListings,
    current.mailMessages,
    current.mutationReceipts,
    current.consumedEquipmentEnvelopes,
    candidate.accounts,
    candidate.sessions,
    candidate.profileBindings,
    candidate.accountCharacterSlots,
    candidate.profiles,
    candidate.marketListings,
    candidate.mailMessages,
    candidate.mutationReceipts,
    candidate.consumedEquipmentEnvelopes,
  ]);
  const startedAt = performance.now();
  const guardedResult = withEnumerationGuard(guarded, () => buildPlan(
    candidate,
    current,
    {consistencyScope: scope},
  ));
  const elapsedMs = performance.now() - startedAt;
  guardedContainerEnumerations += guardedResult.enumerations;
  if (measured) samplesMs.push(elapsedMs);
  const plan = guardedResult.value;
  assert.equal(plan.kind, expectedPlanKind);
  assert.equal(guardedResult.enumerations, 0);
  assert.equal(durableMutationReceiptCount(candidate.mutationReceipts), 20000);
  assert.equal(Object.keys(candidate.marketListings).length, index % 2 === 0 ? 119 : 120);
  maximumWrites = Math.max(maximumWrites, plan.writes.length);
  maximumLocks = Math.max(maximumLocks, plan.locks.length);
  assert.equal(plan.writes.some((write) => String(write.sql || "").includes("operation_planner_010000")), false);
  assert.equal(plan.writes.some((write) => String(write.sql || "").includes("eqx_planner_000000050000")), false);

  candidate.mutationReceipts = commitDurableMutationReceiptDelta(candidate.mutationReceipts);
  candidate.accounts = freezeAuthorityRootIdentityRecordValues("accounts", candidate.accounts);
  candidate.sessions = freezeAuthorityRootIdentityRecordValues("sessions", candidate.sessions);
  candidate.profileBindings = freezeAuthorityRootIdentityRecordValues(
    "profileBindings",
    candidate.profileBindings,
  );
  candidate.accountCharacterSlots = freezeAuthorityRootCowRecordValues(
    candidate.accountCharacterSlots,
    "accountCharacterSlots",
  );
  candidate.profiles = freezeAuthorityRootCowRecordValues(candidate.profiles, "profiles");
  candidate.marketListings = freezeAuthorityRootCowRecordValues(
    candidate.marketListings,
    "marketListings",
  );
  current = candidate;
}

const checkpoint = checkpointFallbackEvidence();
const afterDiagnostics = authorityRecordStateDiagnostics();
const afterMailOwnKeys = mailAuthorityDiagnostics(current.mailMessages).ownKeyEnumerations;
const p95Ms = percentile(samplesMs, 0.95);
const maxMs = Math.max(...samplesMs);

assert.equal(guardedContainerEnumerations, 0);
assert.equal(afterMailOwnKeys - beforeMailOwnKeys, 0);
assert.equal(
  afterDiagnostics.plannerFullDiffScans - beforeDiagnostics.plannerFullDiffScans,
  checkpoint.plannerFullDiffScans,
);
assert.equal(checkpoint.journalCheckpoints, 1);
assert.ok(checkpoint.plannerCheckpointFallbacks >= 1);
assert.ok(checkpoint.plannerFullDiffScans >= 1);
assert.ok(p95Ms <= 5, `planner p95 exceeded 5ms: ${p95Ms}`);
assert.ok(maxMs <= 10, `planner max exceeded 10ms: ${maxMs}`);

process.stdout.write(`${JSON.stringify({
  status: "ok",
  head: git(["rev-parse", "HEAD"]),
  node: process.version,
  cpu: os.cpus()[0]?.model || "unknown",
  capacities: {
    profiles: 200,
    accountCharacterRosters: 200,
    marketListings: 120,
    activeMail: 200,
    mutationReceipts: 20000,
    consumedEquipmentEnvelopes: 100000,
  },
  warmups: WARMUPS,
  samples: SAMPLES,
  p95Ms: round(p95Ms),
  maxMs: round(maxMs),
  guardedContainerEnumerations,
  mailOwnKeyEnumerationsDelta: afterMailOwnKeys - beforeMailOwnKeys,
  maximumLocks,
  maximumWrites,
  steadyStateDiagnosticsDelta: diagnosticDelta(beforeDiagnostics, afterDiagnostics, checkpoint),
  checkpoint,
  samplesMs: samplesMs.map(round),
}, null, 2)}\n`);

function capacityState() {
  const accounts = {};
  const sessions = {};
  const profileBindings = {};
  const accountCharacterSlots = {};
  const profiles = {};
  for (let index = 0; index < 200; index += 1) {
    const suffix = String(index).padStart(3, "0");
    const accountId = `acc_planner_${suffix}`;
    const playerId = `player_planner_${suffix}`;
    const username = `planner_${suffix}`;
    const sessionId = `session_planner_${suffix}`;
    accounts[username] = {
      accountId,
      username,
      displayName: `容量账号${suffix}`,
      role: "player",
      createdAt: "2039-12-01T00:00:00.000Z",
      updatedAt: "2039-12-01T00:00:00.000Z",
    };
    sessions[sessionId] = {
      sessionId,
      accountId,
      tokenHash: index.toString(16).padStart(64, "0"),
      expiresAt: "2041-01-01T00:00:00.000Z",
      revokedAt: null,
    };
    profileBindings[accountId] = {
      accountId,
      playerId,
      profileRevision: 1,
      updatedAt: "2039-12-01T00:00:00.000Z",
    };
    accountCharacterSlots[accountId] = [
      {
        schemaVersion: 1,
        accountId,
        slotIndex: 0,
        playerId,
        createdAt: "2039-12-01T00:00:00.000Z",
        updatedAt: "2039-12-01T00:00:00.000Z",
        lastSelectedAt: "2039-12-01T00:00:00.000Z",
      },
      null,
      null,
      null,
    ];
    profiles[playerId] = {
      playerId,
      accountId,
      profileRevision: 1,
      updatedAt: "2039-12-01T00:00:00.000Z",
      profile: {displayName: `容量猎人${suffix}`, stoneCoins: 1000},
    };
  }
  const marketListings = {};
  for (let index = 0; index < 120; index += 1) {
    const listingId = `listing_planner_${String(index).padStart(3, "0")}`;
    marketListings[listingId] = listing(
      listingId,
      index === 0 ? ACTOR_ACCOUNT_ID : `acc_market_${index}`,
      "2039-12-01T00:00:00.000Z",
    );
  }
  const mailMessages = {};
  for (let index = 0; index < 200; index += 1) {
    const mailId = `mail_planner_${String(index).padStart(3, "0")}`;
    mailMessages[mailId] = {
      mailId,
      senderAccountId: "system_capacity",
      recipientAccountId: ACTOR_ACCOUNT_ID,
      title: "容量邮件",
      body: "组合门槛未触碰邮件。",
      items: [],
      createdAt: "2039-12-01T00:00:00.000Z",
      readAt: null,
      schemaVersion: 1,
    };
  }
  const canonicalMail = readMailAuthorityState(mailMessages);
  assert.equal(canonicalMail.ok, true);
  const receipts = {};
  for (let index = 0; index < 20000; index += 1) {
    const operationId = `operation_planner_${String(index).padStart(6, "0")}`;
    const committedAtMs = NOW_BASE_MS - DURABLE_RECEIPT_TTL_MS + index;
    receipts[operationId] = receipt(operationId, "historical", committedAtMs);
  }
  const tombstones = {};
  for (let index = 0; index < 100000; index += 1) {
    const envelopeId = `eqx_planner_${String(index).padStart(12, "0")}`;
    tombstones[envelopeId] = {schemaVersion: 1, envelopeId};
  }
  const consumed = readConsumedEquipmentEnvelopeLedgerIndex(tombstones);
  assert.equal(consumed.ok, true);
  return {
    schemaVersion: 1,
    accounts: freezeAuthorityRootIdentityRecordValues("accounts", accounts),
    sessions: freezeAuthorityRootIdentityRecordValues("sessions", sessions),
    profileBindings: freezeAuthorityRootIdentityRecordValues("profileBindings", profileBindings),
    accountCharacterSlots: freezeAuthorityRootCowRecordValues(
      accountCharacterSlots,
      "accountCharacterSlots",
    ),
    profiles: freezeAuthorityRootCowRecordValues(profiles, "profiles"),
    mutationReceipts: canonicalDurableMutationReceipts(receipts),
    mailMessages: canonicalMail.messages,
    marketListings: freezeAuthorityRootCowRecordValues(marketListings, "marketListings"),
    consumedEquipmentEnvelopes: consumed.ledger,
    marketConfig: {},
    offlineHangConfig: {},
    petPaidResetConfig: {},
    parties: {},
    families: {},
    manors: {},
    manorWars: [],
    manorBattles: [],
    chatMessages: [],
    battleRecords: [],
    battleTrace: [],
    gmUserGrants: {},
    gmCommandGrants: {},
    gmCommandAudit: [],
    authEvents: [],
    serviceEventSeq: 0,
    serviceEvents: [],
  };
}

function checkpointFallbackEvidence() {
  const checkpointStarted = authorityRecordStateDiagnostics();
  const before = {
    ...capacityState(),
    accounts: freezeAuthorityRootIdentityRecordValues("accounts", {}),
    sessions: freezeAuthorityRootIdentityRecordValues("sessions", {}),
    profileBindings: freezeAuthorityRootIdentityRecordValues("profileBindings", {
      [ACTOR_ACCOUNT_ID]: {
        accountId: ACTOR_ACCOUNT_ID,
        playerId: ACTOR_PLAYER_ID,
        profileRevision: 1,
        updatedAt: "2039-12-01T00:00:00.000Z",
      },
    }),
    profiles: freezeAuthorityRootCowRecordValues({
      [ACTOR_PLAYER_ID]: {
        playerId: ACTOR_PLAYER_ID,
        accountId: ACTOR_ACCOUNT_ID,
        profileRevision: 1,
        updatedAt: "2039-12-01T00:00:00.000Z",
        profile: {displayName: "checkpoint", stoneCoins: 1},
      },
    }, "profiles"),
    marketListings: freezeAuthorityRootCowRecordValues({}, "marketListings"),
    mutationReceipts: canonicalDurableMutationReceipts({}),
    mailMessages: readMailAuthorityState({}).messages,
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedgerIndex({}).ledger,
  };
  const candidate = cloneAuthorityRoot(before);
  for (let index = 0; index < 1025; index += 1) {
    const final = index === 1024;
    candidate.profiles[ACTOR_PLAYER_ID] = {
      ...before.profiles[ACTOR_PLAYER_ID],
      profileRevision: final ? 2 : 1,
      updatedAt: final ? "2040-01-01T00:00:00.000Z" : "2039-12-01T00:00:00.000Z",
      profile: {
        ...before.profiles[ACTOR_PLAYER_ID].profile,
        stoneCoins: final ? 2 : (index % 2 === 0 ? 3 : 4),
      },
    };
  }
  candidate.profileBindings[ACTOR_ACCOUNT_ID] = {
    ...before.profileBindings[ACTOR_ACCOUNT_ID],
    profileRevision: 2,
    updatedAt: "2040-01-01T00:00:00.000Z",
  };
  const operationId = "operation_checkpoint_fallback";
  candidate.mutationReceipts = stageDurableMutationReceipt(
    candidate.mutationReceipts,
    receipt(operationId, "profile_action", NOW_BASE_MS),
    {nowMs: NOW_BASE_MS},
  );
  const beforeDiagnostics = authorityRecordStateDiagnostics();
  const plan = buildPlan(candidate, before, {
    consistencyScope: {
      kind: "row_local_profile_v1",
      accountId: ACTOR_ACCOUNT_ID,
      playerId: ACTOR_PLAYER_ID,
      operationId,
      requestHash: REQUEST_HASH,
      actionId: "profile_action",
    },
  });
  const afterDiagnostics = authorityRecordStateDiagnostics();
  assert.equal(plan.kind, "profile_conditional_v2");
  return {
    deltaFallbacks:
      afterDiagnostics.deltaFallbacks - beforeDiagnostics.deltaFallbacks,
    journalCheckpoints:
      afterDiagnostics.journalCheckpoints - checkpointStarted.journalCheckpoints,
    plannerCheckpointFallbacks:
      afterDiagnostics.plannerCheckpointFallbacks - beforeDiagnostics.plannerCheckpointFallbacks,
    plannerFullDiffScans:
      afterDiagnostics.plannerFullDiffScans - beforeDiagnostics.plannerFullDiffScans,
    trackedMutations:
      afterDiagnostics.trackedMutations - checkpointStarted.trackedMutations,
  };
}

function listing(listingId, sellerAccountId, createdAt) {
  return {
    listingId,
    sellerAccountId,
    itemId: "item_pet_food_small",
    count: 1,
    unitPrice: 10,
    currency: "stoneCoins",
    createdAt,
    schemaVersion: 1,
  };
}

function receipt(operationId, actionId, committedAtMs) {
  return {
    schemaVersion: 1,
    operationId,
    requestHash: REQUEST_HASH,
    actionId,
    accountId: ACTOR_ACCOUNT_ID,
    committedAt: new Date(committedAtMs).toISOString(),
    expiresAt: new Date(committedAtMs + DURABLE_RECEIPT_TTL_MS).toISOString(),
    response: {ok: true, operationId},
  };
}

function withEnumerationGuard(guarded, callback) {
  let enumerations = 0;
  const originalKeys = Object.keys;
  const originalValues = Object.values;
  const originalEntries = Object.entries;
  const originalOwnKeys = Reflect.ownKeys;
  Object.keys = function countedKeys(value) {
    if (guarded.has(value)) enumerations += 1;
    return originalKeys(value);
  };
  Object.values = function countedValues(value) {
    if (guarded.has(value)) enumerations += 1;
    return originalValues(value);
  };
  Object.entries = function countedEntries(value) {
    if (guarded.has(value)) enumerations += 1;
    return originalEntries(value);
  };
  Reflect.ownKeys = function countedOwnKeys(value) {
    if (guarded.has(value)) enumerations += 1;
    return originalOwnKeys(value);
  };
  try {
    return {value: callback(), enumerations};
  } finally {
    Object.keys = originalKeys;
    Object.values = originalValues;
    Object.entries = originalEntries;
    Reflect.ownKeys = originalOwnKeys;
  }
}

function diagnosticDelta(before, after, checkpoint) {
  return {
    deltaFallbacks: after.deltaFallbacks - before.deltaFallbacks - checkpoint.deltaFallbacks,
    deltaHits: after.deltaHits - before.deltaHits,
    journalCheckpoints: after.journalCheckpoints - before.journalCheckpoints - checkpoint.journalCheckpoints,
    plannerCheckpointFallbacks:
      after.plannerCheckpointFallbacks - before.plannerCheckpointFallbacks - checkpoint.plannerCheckpointFallbacks,
    plannerFullDiffScans:
      after.plannerFullDiffScans - before.plannerFullDiffScans - checkpoint.plannerFullDiffScans,
    trackedMutations: after.trackedMutations - before.trackedMutations - checkpoint.trackedMutations,
  };
}

function percentile(samples, percentileValue) {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * percentileValue) - 1)] || 0;
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

function git(args) {
  return execFileSync("git", args, {cwd: ROOT, encoding: "utf8"}).trim();
}
