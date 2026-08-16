"use strict";

const CLUSTER_AUTH_VIEW_SCHEMA_VERSION = 1;
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PASSWORD_SALT_PATTERN = /^[a-f0-9]{32}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function canonicalClusterLoginCredentialView(value, expectedUsernameValue) {
  const expectedUsername = String(expectedUsernameValue || "").trim().toLowerCase();
  if (!USERNAME_PATTERN.test(expectedUsername)) {
    throw clusterAuthorityError("login_username_invalid", expectedUsername);
  }
  const view = record(value);
  const storeRevision = canonicalStoreRevision(view.storeRevision, expectedUsername);
  const account = view.account === null || view.account === undefined
    ? null
    : canonicalAccount(view.account, expectedUsername);
  if (
    Number(view.schemaVersion) !== CLUSTER_AUTH_VIEW_SCHEMA_VERSION
    || String(view.username || "") !== expectedUsername
  ) {
    throw clusterAuthorityError("login_view_invalid", expectedUsername);
  }
  return Object.freeze({
    schemaVersion: CLUSTER_AUTH_VIEW_SCHEMA_VERSION,
    username: expectedUsername,
    storeRevision,
    authorityCurrent: view.authorityCurrent === true,
    account,
  });
}

function canonicalClusterSessionIdentityView(value, expectedTokenHashValue) {
  const expectedTokenHash = String(expectedTokenHashValue || "").trim().toLowerCase();
  if (!SHA256_PATTERN.test(expectedTokenHash)) {
    throw clusterAuthorityError("session_token_hash_invalid", "");
  }
  const view = record(value);
  const storeRevision = canonicalStoreRevision(view.storeRevision, expectedTokenHash);
  const sessionMissing = view.session === null || view.session === undefined;
  const accountMissing = view.account === null || view.account === undefined;
  if (
    Number(view.schemaVersion) !== CLUSTER_AUTH_VIEW_SCHEMA_VERSION
    || String(view.tokenHash || "") !== expectedTokenHash
    || sessionMissing !== accountMissing
  ) {
    throw clusterAuthorityError("session_view_invalid", expectedTokenHash);
  }
  if (sessionMissing) {
    return Object.freeze({
      schemaVersion: CLUSTER_AUTH_VIEW_SCHEMA_VERSION,
      tokenHash: expectedTokenHash,
      storeRevision,
      authorityCurrent: view.authorityCurrent === true,
      session: null,
      account: null,
    });
  }
  const session = canonicalSession(view.session, expectedTokenHash);
  const account = canonicalAccount(view.account, String(view.account.username || ""));
  if (String(session.accountId || "") !== String(account.accountId || "")) {
    throw clusterAuthorityError("session_account_mismatch", session.sessionId);
  }
  return Object.freeze({
    schemaVersion: CLUSTER_AUTH_VIEW_SCHEMA_VERSION,
    tokenHash: expectedTokenHash,
    storeRevision,
    authorityCurrent: view.authorityCurrent === true,
    session,
    account,
  });
}

function resetClusterAccountRuntime(dataValue, accountIdValue, options = {}) {
  const data = record(dataValue);
  const accountId = String(accountIdValue || "").trim();
  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    throw clusterAuthorityError("runtime_account_invalid", accountId);
  }
  const summary = {
    playerPositions: 0,
    partyInvites: 0,
    battleInvites: 0,
    battleRooms: 0,
    battleRoomRecoveries: 0,
    tradeOffers: 0,
  };
  data.playerPositions = withoutExactKey(data.playerPositions, accountId, summary, "playerPositions");
  data.partyInvites = withoutAccountRecords(data.partyInvites, accountId, summary, "partyInvites");
  data.battleInvites = withoutAccountRecords(data.battleInvites, accountId, summary, "battleInvites");
  const preserveBattleAuthority = options.preserveBattleAuthority === true;
  if (!preserveBattleAuthority) {
    data.battleRooms = withoutAccountRecords(data.battleRooms, accountId, summary, "battleRooms");
    data.battleRoomRecoveries = withoutAccountRecords(
      data.battleRoomRecoveries,
      accountId,
      summary,
      "battleRoomRecoveries",
    );
  }
  data.tradeOffers = withoutAccountRecords(data.tradeOffers, accountId, summary, "tradeOffers");
  if (!preserveBattleAuthority) {
    const recoveryIds = new Set(Object.keys(record(data.battleRoomRecoveries)));
    data.battleRoomRecoveryByAccountId = Object.fromEntries(
      Object.entries(record(data.battleRoomRecoveryByAccountId)).filter(([indexedAccountId, roomId]) => (
        indexedAccountId !== accountId && recoveryIds.has(String(roomId || ""))
      )),
    );
  }
  return Object.freeze({...summary});
}

function withoutExactKey(value, key, summary, fieldName) {
  const next = {...record(value)};
  if (Object.hasOwn(next, key)) {
    delete next[key];
    summary[fieldName] += 1;
  }
  return next;
}

function withoutAccountRecords(value, accountId, summary, fieldName) {
  const next = {};
  for (const [key, entry] of Object.entries(record(value))) {
    if (recordReferencesAccount(entry, accountId)) {
      summary[fieldName] += 1;
      continue;
    }
    next[key] = entry;
  }
  return next;
}

function recordReferencesAccount(value, accountId) {
  const entry = record(value);
  for (const field of [
    "accountId",
    "fromAccountId",
    "toAccountId",
    "leaderAccountId",
    "challengerAccountId",
    "opponentAccountId",
  ]) {
    if (String(entry[field] || "") === accountId) {
      return true;
    }
  }
  for (const field of [
    "memberAccountIds",
    "participantAccountIds",
    "recoveryAccountIds",
    "targetAccountIds",
  ]) {
    if (Array.isArray(entry[field]) && entry[field].some((value) => String(value || "") === accountId)) {
      return true;
    }
  }
  return false;
}

function canonicalAccount(value, expectedUsernameValue) {
  const account = cloneRecord(value, "account_document_invalid");
  const expectedUsername = String(expectedUsernameValue || "").trim().toLowerCase();
  const accountId = String(account.accountId || "");
  const username = String(account.username || "");
  if (
    !ACCOUNT_ID_PATTERN.test(accountId)
    || !USERNAME_PATTERN.test(username)
    || username !== expectedUsername
    || !PASSWORD_SALT_PATTERN.test(String(account.passwordSalt || ""))
    || !SHA256_PATTERN.test(String(account.passwordHash || ""))
  ) {
    throw clusterAuthorityError("account_document_invalid", accountId || expectedUsername);
  }
  return Object.freeze(account);
}

function canonicalSession(value, expectedTokenHash) {
  const session = cloneRecord(value, "session_document_invalid");
  const sessionId = String(session.sessionId || "");
  if (
    !SESSION_ID_PATTERN.test(sessionId)
    || !ACCOUNT_ID_PATTERN.test(String(session.accountId || ""))
    || String(session.tokenHash || "") !== expectedTokenHash
    || !Number.isFinite(Date.parse(String(session.expiresAt || "")))
  ) {
    throw clusterAuthorityError("session_document_invalid", sessionId);
  }
  return Object.freeze(session);
}

function canonicalStoreRevision(value, key) {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw clusterAuthorityError("store_revision_invalid", key);
  }
  return revision;
}

function cloneRecord(value, reason) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw clusterAuthorityError(reason, "");
  }
  try {
    return structuredClone(value);
  } catch {
    throw clusterAuthorityError(reason, "");
  }
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clusterAuthorityError(reason, key) {
  const error = new Error("集群账号权威读取结果不符合认证合同。");
  error.code = "cluster_account_authority_view_invalid";
  error.reason = String(reason || "invalid");
  error.resourceKey = String(key || "");
  return error;
}

module.exports = {
  CLUSTER_AUTH_VIEW_SCHEMA_VERSION,
  canonicalClusterLoginCredentialView,
  canonicalClusterSessionIdentityView,
  resetClusterAccountRuntime,
};
