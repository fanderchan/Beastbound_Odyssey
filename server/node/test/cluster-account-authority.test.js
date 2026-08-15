"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  canonicalClusterLoginCredentialView,
  canonicalClusterSessionIdentityView,
  resetClusterAccountRuntime,
} = require("../src/auth/cluster-account-authority");

const TOKEN_HASH = "a".repeat(64);

function account(overrides = {}) {
  return {
    accountId: "acc_cluster_owner",
    username: "clusterowner",
    displayName: "集群玩家",
    role: "player",
    passwordSalt: "b".repeat(32),
    passwordHash: "c".repeat(64),
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    schemaVersion: 1,
    ...overrides,
  };
}

function session(overrides = {}) {
  return {
    sessionId: "sess_cluster_owner",
    accountId: "acc_cluster_owner",
    tokenHash: TOKEN_HASH,
    expiresAt: "2026-08-22T00:00:00.000Z",
    createdAt: "2026-08-15T00:00:00.000Z",
    schemaVersion: 1,
    ...overrides,
  };
}

test("cluster authority views accept exact immutable account and session facts", () => {
  const sourceAccount = account();
  const login = canonicalClusterLoginCredentialView({
    schemaVersion: 1,
    username: "clusterowner",
    storeRevision: 17,
    authorityCurrent: true,
    account: sourceAccount,
  }, "clusterowner");
  assert.equal(login.storeRevision, 17);
  assert.equal(login.authorityCurrent, true);
  assert.equal(login.account.accountId, "acc_cluster_owner");
  assert.equal(Object.isFrozen(login), true);
  assert.equal(Object.isFrozen(login.account), true);
  sourceAccount.displayName = "篡改来源";
  assert.equal(login.account.displayName, "集群玩家");

  const identity = canonicalClusterSessionIdentityView({
    schemaVersion: 1,
    tokenHash: TOKEN_HASH,
    storeRevision: 18,
    authorityCurrent: true,
    session: session(),
    account: account(),
  }, TOKEN_HASH);
  assert.equal(identity.session.sessionId, "sess_cluster_owner");
  assert.equal(identity.authorityCurrent, true);
  assert.equal(identity.account.accountId, identity.session.accountId);
  assert.equal(Object.isFrozen(identity.session), true);

  const missing = canonicalClusterSessionIdentityView({
    schemaVersion: 1,
    tokenHash: TOKEN_HASH,
    storeRevision: 19,
    session: null,
    account: null,
  }, TOKEN_HASH);
  assert.equal(missing.session, null);
  assert.equal(missing.account, null);
});

test("cluster authority views reject partial, mismatched, and malformed facts", () => {
  for (const run of [
    () => canonicalClusterLoginCredentialView({
      schemaVersion: 1,
      username: "anotheruser",
      storeRevision: 1,
      account: account(),
    }, "clusterowner"),
    () => canonicalClusterSessionIdentityView({
      schemaVersion: 1,
      tokenHash: TOKEN_HASH,
      storeRevision: 1,
      session: session(),
      account: null,
    }, TOKEN_HASH),
    () => canonicalClusterSessionIdentityView({
      schemaVersion: 1,
      tokenHash: TOKEN_HASH,
      storeRevision: 1,
      session: session({accountId: "acc_another_owner"}),
      account: account(),
    }, TOKEN_HASH),
    () => canonicalClusterSessionIdentityView({
      schemaVersion: 1,
      tokenHash: TOKEN_HASH,
      storeRevision: -1,
      session: null,
      account: null,
    }, TOKEN_HASH),
  ]) {
    assert.throws(
      run,
      (error) => error && error.code === "cluster_account_authority_view_invalid",
    );
  }
});

test("takeover reset clears only target-owned runtime state and preserves durable party facts", () => {
  const durableParties = {
    party_durable: {
      partyId: "party_durable",
      leaderAccountId: "acc_target",
      memberAccountIds: ["acc_target", "acc_ally"],
    },
  };
  const data = {
    parties: durableParties,
    playerPositions: {
      acc_target: {mapId: "village", cellX: 1, cellY: 2},
      acc_peer: {mapId: "village", cellX: 3, cellY: 4},
    },
    partyInvites: {
      invite_target: {fromAccountId: "acc_target", toAccountId: "acc_ally"},
      invite_peer: {fromAccountId: "acc_peer", toAccountId: "acc_other"},
    },
    battleInvites: {
      battle_target: {fromAccountId: "acc_ally", toAccountId: "acc_target"},
      battle_peer: {fromAccountId: "acc_peer", toAccountId: "acc_other"},
    },
    battleRooms: {
      room_target: {participantAccountIds: ["acc_target", "acc_ally"]},
      room_peer: {participantAccountIds: ["acc_peer", "acc_other"]},
    },
    battleRoomRecoveries: {
      recovery_target: {recoveryAccountIds: ["acc_target", "acc_ally"]},
      recovery_peer: {recoveryAccountIds: ["acc_peer", "acc_other"]},
    },
    battleRoomRecoveryByAccountId: {
      acc_target: "recovery_target",
      acc_ally: "recovery_target",
      acc_peer: "recovery_peer",
    },
    tradeOffers: {
      trade_target: {fromAccountId: "acc_target", toAccountId: "acc_ally"},
      trade_peer: {fromAccountId: "acc_peer", toAccountId: "acc_other"},
    },
  };

  assert.deepEqual(resetClusterAccountRuntime(data, "acc_target"), {
    playerPositions: 1,
    partyInvites: 1,
    battleInvites: 1,
    battleRooms: 1,
    battleRoomRecoveries: 1,
    tradeOffers: 1,
  });
  assert.equal(data.parties, durableParties);
  assert.deepEqual(Object.keys(data.playerPositions), ["acc_peer"]);
  assert.deepEqual(Object.keys(data.partyInvites), ["invite_peer"]);
  assert.deepEqual(Object.keys(data.battleInvites), ["battle_peer"]);
  assert.deepEqual(Object.keys(data.battleRooms), ["room_peer"]);
  assert.deepEqual(Object.keys(data.battleRoomRecoveries), ["recovery_peer"]);
  assert.deepEqual(data.battleRoomRecoveryByAccountId, {acc_peer: "recovery_peer"});
  assert.deepEqual(Object.keys(data.tradeOffers), ["trade_peer"]);
});
