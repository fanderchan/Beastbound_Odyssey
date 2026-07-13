"use strict";

const DEFAULT_RECOVERY_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_RECOVERIES = 256;

function retireClosedBattleRooms(data, options = {}) {
  const root = objectRoot(data);
  const nowMs = finiteNow(options.now);
  const closedStatus = String(options.closedStatus || "closed");
  const toRecovery = typeof options.toRecovery === "function" ? options.toRecovery : defaultRecovery;
  const accountIdsForRoom = typeof options.accountIdsForRoom === "function"
    ? options.accountIdsForRoom
    : defaultAccountIds;
  const rooms = objectValue(root.battleRooms);
  const recoveries = objectValue(root.battleRoomRecoveries);
  let retired = 0;

  for (const [roomId, room] of Object.entries(rooms)) {
    if (!room || String(room.status || "") !== closedStatus) {
      continue;
    }
    const normalizedRoomId = String(room.roomId || roomId || "").trim();
    if (normalizedRoomId === "") {
      delete rooms[roomId];
      continue;
    }
    const accountIds = uniqueStrings(accountIdsForRoom(room));
    const recovery = toRecovery(room, accountIds);
    if (!recovery || typeof recovery !== "object" || Array.isArray(recovery)) {
      const error = new Error("closed battle room recovery projection is invalid");
      error.code = "battle_recovery_invalid";
      throw error;
    }
    const closedAt = finiteTimestamp(room.closedAt || room.updatedAt, nowMs);
    recoveries[normalizedRoomId] = {
      ...recovery,
      roomId: normalizedRoomId,
      status: closedStatus,
      closedAt: new Date(closedAt).toISOString(),
      updatedAt: String(recovery.updatedAt || room.updatedAt || new Date(closedAt).toISOString()),
      recoveryAccountIds: accountIds,
      recoveryExpiresAt: new Date(closedAt + positiveInteger(options.ttlMs, DEFAULT_RECOVERY_TTL_MS)).toISOString(),
      recoverySchemaVersion: 1,
    };
    delete rooms[roomId];
    retired += 1;
  }

  root.battleRooms = rooms;
  root.battleRoomRecoveries = recoveries;
  const pruned = pruneBattleRoomRecoveries(root, {
    now: () => nowMs,
    ttlMs: options.ttlMs,
    maxRecoveries: options.maxRecoveries,
  });
  return Object.freeze({
    retired,
    pruned: pruned.pruned,
    activeRooms: Object.keys(root.battleRooms).length,
    recoveries: pruned.recoveries,
  });
}

function pruneBattleRoomRecoveries(data, options = {}) {
  const root = objectRoot(data);
  const nowMs = finiteNow(options.now);
  const ttlMs = positiveInteger(options.ttlMs, DEFAULT_RECOVERY_TTL_MS);
  const maxRecoveries = positiveInteger(options.maxRecoveries, DEFAULT_MAX_RECOVERIES);
  const recoveries = objectValue(root.battleRoomRecoveries);
  let pruned = 0;

  for (const [roomId, recovery] of Object.entries(recoveries)) {
    const closedAt = finiteTimestamp(recovery && (recovery.closedAt || recovery.updatedAt), Number.NaN);
    const explicitExpiresAt = Date.parse(String(recovery && recovery.recoveryExpiresAt || ""));
    const expiresAt = Number.isFinite(explicitExpiresAt)
      ? explicitExpiresAt
      : (Number.isFinite(closedAt) ? closedAt + ttlMs : Number.NaN);
    if (!recovery || !Number.isFinite(expiresAt) || expiresAt <= nowMs) {
      delete recoveries[roomId];
      pruned += 1;
    }
  }

  let newestFirst = Object.values(recoveries).sort(compareRecoveryNewestFirst);
  const claimedAccountIds = new Set();
  for (const recovery of newestFirst) {
    const roomId = String(recovery && recovery.roomId || "");
    if (roomId === "" || !recoveries[roomId]) {
      continue;
    }
    const originalAccountIds = uniqueStrings(recovery.recoveryAccountIds);
    if (originalAccountIds.length <= 0) {
      // Some closed rooms are retained only as compact diagnostics and are not
      // eligible for player recovery. They consume the global cap but do not
      // participate in the per-account latest-room constraint.
      continue;
    }
    const retainedAccountIds = originalAccountIds
      .filter((accountId) => !claimedAccountIds.has(accountId));
    if (retainedAccountIds.length <= 0) {
      delete recoveries[roomId];
      pruned += 1;
      continue;
    }
    for (const accountId of retainedAccountIds) {
      claimedAccountIds.add(accountId);
    }
    if (
      retainedAccountIds.length !== originalAccountIds.length
      || retainedAccountIds.some((accountId, index) => accountId !== originalAccountIds[index])
    ) {
      // A shared old room may still be the newest recovery for another player.
      // Replace its immutable summary instead of mutating it, and remove only
      // the account links already claimed by a newer room.
      recoveries[roomId] = {...recovery, recoveryAccountIds: retainedAccountIds};
    }
  }

  newestFirst = Object.values(recoveries).sort(compareRecoveryNewestFirst);
  for (const recovery of newestFirst.slice(maxRecoveries)) {
    const roomId = String(recovery && recovery.roomId || "");
    if (roomId !== "" && recoveries[roomId]) {
      delete recoveries[roomId];
      pruned += 1;
    }
  }

  const byAccountId = {};
  for (const recovery of newestFirst.slice(0, maxRecoveries)) {
    const roomId = String(recovery && recovery.roomId || "");
    if (roomId === "" || !recoveries[roomId]) {
      continue;
    }
    for (const accountId of uniqueStrings(recovery.recoveryAccountIds)) {
      if (!byAccountId[accountId]) {
        byAccountId[accountId] = roomId;
      }
    }
  }
  root.battleRoomRecoveries = recoveries;
  root.battleRoomRecoveryByAccountId = byAccountId;
  return Object.freeze({pruned, recoveries: Object.keys(recoveries).length});
}

function compareRecoveryNewestFirst(left, right) {
  const timeDelta = finiteTimestamp(right && (right.closedAt || right.updatedAt), 0)
    - finiteTimestamp(left && (left.closedAt || left.updatedAt), 0);
  if (timeDelta !== 0) {
    return timeDelta;
  }
  return String(right && right.roomId || "").localeCompare(String(left && left.roomId || ""));
}

function latestBattleRoomRecoveryForAccount(data, accountId, options = {}) {
  const root = objectRoot(data);
  const normalizedAccountId = String(accountId || "").trim();
  const roomId = normalizedAccountId === ""
    ? ""
    : String(objectValue(root.battleRoomRecoveryByAccountId)[normalizedAccountId] || "");
  const recovery = roomId === "" ? null : objectValue(root.battleRoomRecoveries)[roomId] || null;
  if (!recovery) {
    if (normalizedAccountId !== "") {
      delete objectValue(root.battleRoomRecoveryByAccountId)[normalizedAccountId];
    }
    return null;
  }
  const nowMs = finiteNow(options.now);
  const ttlMs = positiveInteger(options.ttlMs, DEFAULT_RECOVERY_TTL_MS);
  const explicitExpiresAt = Date.parse(String(recovery.recoveryExpiresAt || ""));
  const closedAt = finiteTimestamp(recovery.closedAt || recovery.updatedAt, Number.NaN);
  const expiresAt = Number.isFinite(explicitExpiresAt)
    ? explicitExpiresAt
    : (Number.isFinite(closedAt) ? closedAt + ttlMs : Number.NaN);
  if (Number.isFinite(expiresAt) && expiresAt > nowMs) {
    return recovery;
  }
  delete objectValue(root.battleRoomRecoveryByAccountId)[normalizedAccountId];
  return null;
}

function battleRoomRecoveryMetrics(data) {
  const root = objectRoot(data);
  return Object.freeze({
    activeRooms: Object.keys(objectValue(root.battleRooms)).length,
    recoveries: Object.keys(objectValue(root.battleRoomRecoveries)).length,
    indexedAccounts: Object.keys(objectValue(root.battleRoomRecoveryByAccountId)).length,
  });
}

function defaultRecovery(room) {
  return {...room};
}

function defaultAccountIds(room) {
  return Array.isArray(room && room.participantAccountIds) ? room.participantAccountIds : [];
}

function objectRoot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("runtime battle recovery root must be an object");
  }
  return value;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)));
}

function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteNow(now) {
  const value = typeof now === "function" ? Number(now()) : Date.now();
  return Number.isFinite(value) ? value : Date.now();
}

function finiteTimestamp(value, fallback) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

module.exports = {
  DEFAULT_MAX_RECOVERIES,
  DEFAULT_RECOVERY_TTL_MS,
  battleRoomRecoveryMetrics,
  latestBattleRoomRecoveryForAccount,
  pruneBattleRoomRecoveries,
  retireClosedBattleRooms,
};
