"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {migrateProfile} = require("../src/auth/profile-migrations");
const {
  auditBatchMigrationRootCoverage,
  buildBatchProfileMigration,
  buildBatchProfileRollback,
  rehearseBatchProfileMigration,
  verifyBatchProfileMigration,
  verifyBatchProfileRollback,
} = require("../src/auth/profile-migration-batch-ops");

function legacyProfile() {
  return {
    schemaVersion: 1,
    player: {name: "批量迁移测试员", level: 20},
    stoneCoins: 1234,
  };
}

function completeSnapshot() {
  return {
    schemaVersion: 1,
    accounts: {
      batchuser: {
        accountId: "acc_batch",
        username: "batchuser",
        displayName: "批量用户",
        passwordHash: "must_not_appear_in_public_report",
      },
      peer: {
        accountId: "acc_peer",
        username: "peer",
        displayName: "保留用户",
      },
    },
    sessions: {},
    profileBindings: {
      acc_batch: {
        accountId: "acc_batch",
        playerId: "player_batch",
        profileRevision: 7,
        updatedAt: "2026-07-12T08:00:00.000Z",
      },
      acc_peer: {
        accountId: "acc_peer",
        playerId: "player_peer",
        profileRevision: 3,
        updatedAt: "2026-07-12T08:00:00.000Z",
      },
    },
    profiles: {
      player_batch: {
        playerId: "player_batch",
        accountId: "acc_batch",
        profileRevision: 7,
        updatedAt: "2026-07-12T08:00:00.000Z",
        profile: legacyProfile(),
      },
      player_peer: {
        playerId: "player_peer",
        accountId: "acc_peer",
        profileRevision: 3,
        updatedAt: "2026-07-12T08:00:00.000Z",
        profile: legacyProfile(),
      },
    },
    mailMessages: {},
    marketListings: {},
    consumedEquipmentEnvelopes: {},
    marketConfig: {taxBps: 500},
    offlineHangConfig: {rewardRateBps: 5000},
    parties: {},
    partyInvites: {},
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
    playerPositions: {},
    battleInvites: {},
    battleRooms: {},
    tradeOffers: {},
  };
}

function errorCodes(result) {
  return new Set(result.errors.map((entry) => entry.code));
}

test("batch plan changes only profile payloads and exposes a deterministic safe report", () => {
  const source = completeSnapshot();
  const before = structuredClone(source);
  const first = buildBatchProfileMigration(source);
  const second = buildBatchProfileMigration(structuredClone(source));

  assert.equal(first.ok, true);
  assert.equal(first.applySafe, true);
  assert.equal(first.changed, true);
  assert.deepEqual(first.changedProfileIds, ["player_batch", "player_peer"]);
  assert.deepEqual(first.addedConsumedEquipmentEnvelopeIds, []);
  assert.equal(first.candidateSnapshot.profiles.player_batch.profile.schemaVersion, 3);
  assert.deepEqual(
    {...first.candidateSnapshot.profiles.player_batch, profile: undefined},
    {...source.profiles.player_batch, profile: undefined},
  );
  assert.deepEqual(first.candidateSnapshot.marketConfig, source.marketConfig);
  assert.equal(first.planDigest, second.planDigest);
  assert.equal(first.sourceDigest, second.sourceDigest);
  assert.equal(first.candidateDigest, second.candidateDigest);
  assert.equal(JSON.stringify(first.publicReport).includes("must_not_appear_in_public_report"), false);
  assert.deepEqual(source, before);
});

test("root coverage fails closed for persistence gaps, runtime state, battle events, and wrapper metadata", () => {
  const scenarios = [
    {
      patch(root) { root.unknownFutureBucket = {keep: true}; },
      code: "batch_root_field_unknown",
    },
    {
      patch(root) { delete root.marketConfig; },
      code: "batch_root_field_missing",
    },
    {
      patch(root) { root.marketListings = []; },
      code: "batch_root_field_type_invalid",
    },
    {
      patch(root) { root.tradeOffers.offer_1 = {offerId: "offer_1"}; },
      code: "batch_runtime_field_not_empty",
    },
    {
      patch(root) { root.serviceEvents.push({eventSeq: 1, type: "battle.updated"}); },
      code: "batch_runtime_service_event_persisted",
    },
    {
      patch(root) { root.serviceEvents.push({eventSeq: 1, type: "party.updated"}); },
      code: "batch_service_event_seq_behind",
    },
    {
      patch(root) { root.profiles.player_batch.schemaVersion = 1; },
      code: "batch_profile_document_field_unknown",
    },
    {
      patch(root) { delete root.profiles; },
      code: "batch_profiles_missing",
    },
    {
      patch(root) { root.authEvents.push({type: "legacy_event_without_id"}); },
      code: "batch_entity_id_invalid",
    },
    {
      patch(root) { root.sessions.wrong_key = {sessionId: "session_real", accountId: "acc_batch"}; },
      code: "batch_entity_map_key_mismatch",
    },
    {
      patch(root) {
        root.manorWars.push({warId: "war_duplicate"}, {warId: "war_duplicate"});
      },
      code: "batch_entity_id_duplicate",
    },
    {
      patch(root) {
        root.gmCommandGrants.acc_batch = [{accountId: "acc_other", commandId: "*"}];
      },
      code: "batch_gm_command_grant_identity_invalid",
    },
    {
      patch(root) { root.gmCommandGrants.acc_batch = []; },
      code: "batch_gm_command_grants_empty",
    },
  ];
  for (const scenario of scenarios) {
    const root = completeSnapshot();
    scenario.patch(root);
    const audit = auditBatchMigrationRootCoverage(root);
    assert.equal(audit.ok, false, scenario.code);
    assert.equal(errorCodes(audit).has(scenario.code), true, scenario.code);
    const plan = buildBatchProfileMigration(root);
    assert.equal(plan.applySafe, false, scenario.code);
    assert.deepEqual(plan.candidateSnapshot, root, scenario.code);
  }
});

test("account, binding, profile ownership, map keys, and revisions are audited as one graph", () => {
  const scenarios = [
    {
      patch(root) { root.accounts.batchuser.username = "other"; },
      code: "batch_account_map_key_mismatch",
    },
    {
      patch(root) { root.profileBindings.acc_batch.accountId = "acc_other"; },
      code: "batch_profile_binding_map_key_mismatch",
    },
    {
      patch(root) { root.profiles.player_batch.playerId = "player_other"; },
      code: "batch_profile_map_key_mismatch",
    },
    {
      patch(root) { root.profiles.player_batch.accountId = "acc_peer"; },
      code: "batch_profile_owner_mismatch",
    },
    {
      patch(root) { root.profiles.player_batch.profileRevision += 1; },
      code: "batch_profile_revision_mismatch",
    },
  ];
  for (const scenario of scenarios) {
    const root = completeSnapshot();
    scenario.patch(root);
    const audit = auditBatchMigrationRootCoverage(root);
    assert.equal(audit.ok, false, scenario.code);
    assert.equal(errorCodes(audit).has(scenario.code), true, scenario.code);
  }
});

test("apply verification covers both changed targets and the non-target persistent projection", () => {
  const plan = buildBatchProfileMigration(completeSnapshot());
  assert.equal(verifyBatchProfileMigration(plan.candidateSnapshot, plan).ok, true);

  const targetDrift = structuredClone(plan.candidateSnapshot);
  targetDrift.profiles.player_batch.profile.stoneCoins += 1;
  const targetVerification = verifyBatchProfileMigration(targetDrift, plan);
  assert.equal(targetVerification.ok, false);
  assert.equal(errorCodes(targetVerification).has("batch_apply_target_profile_mismatch"), true);

  const nonTargetDrift = structuredClone(plan.candidateSnapshot);
  nonTargetDrift.marketConfig.taxBps = 999;
  const nonTargetVerification = verifyBatchProfileMigration(nonTargetDrift, plan);
  assert.equal(nonTargetVerification.ok, false);
  assert.equal(errorCodes(nonTargetVerification).has("batch_apply_non_target_projection_mismatch"), true);
});

test("rollback restores only candidate profiles and preserves concurrent non-target state", () => {
  const plan = buildBatchProfileMigration(completeSnapshot());
  const current = structuredClone(plan.candidateSnapshot);
  current.marketConfig.concurrentNote = "must survive rollback";
  current.families.family_concurrent = {familyId: "family_concurrent", name: "并发家族"};
  current.consumedEquipmentEnvelopes.eqx_concurrent_ledger_0001 = {
    schemaVersion: 1,
    envelopeId: "eqx_concurrent_ledger_0001",
  };

  const rollback = buildBatchProfileRollback(current, plan);
  assert.equal(rollback.ok, true);
  assert.deepEqual(rollback.restoredProfileIds, ["player_batch", "player_peer"]);
  assert.deepEqual(rollback.snapshot.profiles, plan.sourceSnapshot.profiles);
  assert.equal(rollback.snapshot.marketConfig.concurrentNote, "must survive rollback");
  assert.equal(rollback.snapshot.families.family_concurrent.name, "并发家族");
  assert.equal(hasOwn(rollback.snapshot.consumedEquipmentEnvelopes, "eqx_concurrent_ledger_0001"), true);
  assert.equal(verifyBatchProfileRollback(rollback.snapshot, rollback).ok, true);

  const afterRollbackDrift = structuredClone(rollback.snapshot);
  delete afterRollbackDrift.families.family_concurrent;
  const verification = verifyBatchProfileRollback(afterRollbackDrift, rollback);
  assert.equal(verification.ok, false);
  assert.equal(errorCodes(verification).has("batch_rollback_non_target_projection_mismatch"), true);
});

test("rollback accepts an already-restored before image but rejects a third profile state atomically", () => {
  const plan = buildBatchProfileMigration(completeSnapshot());
  const beforeRollback = buildBatchProfileRollback(plan.sourceSnapshot, plan);
  assert.equal(beforeRollback.ok, true);
  assert.deepEqual(beforeRollback.restoredProfileIds, []);
  assert.deepEqual(beforeRollback.alreadyRestoredProfileIds, ["player_batch", "player_peer"]);

  const conflictState = structuredClone(plan.candidateSnapshot);
  conflictState.profiles.player_batch.profile.stoneCoins = 999999;
  const before = structuredClone(conflictState);
  const conflictRollback = buildBatchProfileRollback(conflictState, plan);
  assert.equal(conflictRollback.ok, false);
  assert.equal(errorCodes(conflictRollback).has("batch_rollback_profile_conflict"), true);
  assert.deepEqual(conflictRollback.snapshot, before);
});

test("rollback never deletes ledger entries appended by the migration", () => {
  const source = completeSnapshot();
  const v2 = {
    schemaVersion: 2,
    backpackSlots: [{itemId: "weapon_wooden_club", count: 1}],
    equipmentSlots: {},
    equipmentInstances: {},
    equipmentSlotInstanceIds: {},
    nextEquipmentInstanceSerial: 1,
    equipmentDurability: {},
    equipmentEnhancement: {},
    equipmentWearCounters: {},
    equipmentExpPillCharge: {},
    equipmentSlotsVersion: 5,
  };
  const current = migrateProfile(v2);
  assert.equal(current.ok, true);
  const originEnvelopeId = "eqx_batch_origin_0001";
  current.profile.equipmentInstances.equip_000001.transferProvenance = {
    schemaVersion: 1,
    originEnvelopeId,
    originStateFingerprint: "a".repeat(64),
    sourceInstanceId: "equip_source_0001",
  };
  source.profiles.player_batch.profile = current.profile;

  const plan = buildBatchProfileMigration(source);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.addedConsumedEquipmentEnvelopeIds, [originEnvelopeId]);
  assert.equal(hasOwn(plan.candidateSnapshot.consumedEquipmentEnvelopes, originEnvelopeId), true);

  const rollback = buildBatchProfileRollback(plan.candidateSnapshot, plan);
  assert.equal(rollback.ok, true);
  assert.equal(hasOwn(rollback.snapshot.consumedEquipmentEnvelopes, originEnvelopeId), true);
  assert.equal(rollback.publicReport.retainedConsumedEquipmentEnvelopeCount, 1);
  assert.equal(rollback.publicReport.addedConsumedEquipmentEnvelopeCount, 0);
  assert.equal(verifyBatchProfileRollback(rollback.snapshot, rollback).ok, true);

  const missingLedgerRollback = buildBatchProfileRollback(plan.sourceSnapshot, plan);
  assert.equal(missingLedgerRollback.ok, true);
  assert.equal(hasOwn(missingLedgerRollback.snapshot.consumedEquipmentEnvelopes, originEnvelopeId), true);
  assert.equal(missingLedgerRollback.publicReport.retainedConsumedEquipmentEnvelopeCount, 0);
  assert.equal(missingLedgerRollback.publicReport.addedConsumedEquipmentEnvelopeCount, 1);
  assert.equal(verifyBatchProfileRollback(missingLedgerRollback.snapshot, missingLedgerRollback).ok, true);
});

test("in-memory rehearsal applies, verifies, rolls back, and verifies the before image", () => {
  const rehearsal = rehearseBatchProfileMigration(completeSnapshot());
  assert.equal(rehearsal.ok, true);
  assert.equal(rehearsal.applyVerification.ok, true);
  assert.equal(rehearsal.rollback.ok, true);
  assert.equal(rehearsal.rollbackVerification.ok, true);
  assert.deepEqual(rehearsal.rollback.snapshot.profiles, rehearsal.plan.sourceSnapshot.profiles);

  const idempotent = rehearseBatchProfileMigration(rehearsal.plan.candidateSnapshot);
  assert.equal(idempotent.ok, true);
  assert.equal(idempotent.plan.changed, false);
  assert.deepEqual(idempotent.plan.changedProfileIds, []);
});

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}
