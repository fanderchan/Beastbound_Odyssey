"use strict";

const crypto = require("node:crypto");

const CLUSTER_BATTLE_RUNTIME_SCHEMA_VERSION = 1;
const DEFAULT_MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const DEFAULT_RECONNECT_GRACE_MS = 15 * 1000;
const DEFAULT_COMMAND_TIMEOUT_MS = 99 * 1000;

function createClusterBattleRuntimeDomain(ctx) {
  const {
    BATTLE_PHASE_COMMAND,
    BATTLE_ROOM_CLOSED,
    activeBattleRoomForAccount,
    applyAfterDurableCommit,
    battleFailureTicketStateForAccount,
    battleRandomAuthority,
    clone,
    emitServiceEvent,
    fail,
    load,
    now,
    ok,
    publicBattleRoom,
    resolveClusterBattleRuntimeCredential,
    save,
  } = ctx;
  const maxSnapshotBytes = positiveInteger(
    ctx.clusterBattleRuntimeMaxSnapshotBytes,
    DEFAULT_MAX_SNAPSHOT_BYTES,
  );
  const reconnectGraceMs = positiveInteger(
    ctx.battleReconnectCommandGraceMs,
    DEFAULT_RECONNECT_GRACE_MS,
  );
  const commandTimeoutMs = positiveInteger(
    ctx.battleCommandTimeoutMs,
    DEFAULT_COMMAND_TIMEOUT_MS,
  );

  function exportBattleRuntime(credential, roomIdValue) {
    if (!resolveClusterBattleRuntimeCredential(credential)) {
      return fail("cluster_battle_runtime_identity_invalid", "战斗运行态身份校验失败。");
    }
    const roomId = canonicalRoomId(roomIdValue);
    if (roomId === "") {
      return fail("cluster_battle_runtime_room_invalid", "战斗运行态房间无效。");
    }
    const data = load();
    const room = data.battleRooms && data.battleRooms[roomId] || null;
    if (!room || String(room.status || "") === BATTLE_ROOM_CLOSED) {
      return ok({active: false, roomId});
    }
    if (!battleRandomAuthority || typeof battleRandomAuthority.exportRoomSecret !== "function") {
      return fail("cluster_battle_runtime_random_missing", "战斗随机权威状态缺失。");
    }
    const randomSecret = battleRandomAuthority.exportRoomSecret(roomId);
    if (randomSecret === "") {
      return fail("cluster_battle_runtime_random_missing", "战斗随机权威状态缺失。");
    }
    const checkpointedAtMs = finiteNow(now());
    const commandDeadlineAtMs = Date.parse(String(room.battle && room.battle.commandDeadlineAt || ""));
    const commandDeadlineRemainingMs = Number.isFinite(commandDeadlineAtMs)
      ? Math.max(0, Math.min(commandTimeoutMs, commandDeadlineAtMs - checkpointedAtMs))
      : reconnectGraceMs;
    const body = {
      schemaVersion: CLUSTER_BATTLE_RUNTIME_SCHEMA_VERSION,
      roomId,
      checkpointedAt: new Date(checkpointedAtMs).toISOString(),
      commandDeadlineRemainingMs,
      room: clone(room),
      randomSecret,
    };
    const snapshot = {
      ...body,
      checksum: snapshotChecksum(body),
    };
    if (jsonBytes(snapshot) > maxSnapshotBytes) {
      return fail("cluster_battle_runtime_snapshot_too_large", "战斗运行态超过安全上限。");
    }
    return ok({active: true, roomId, snapshot});
  }

  function hydrateBattleRuntime(credential, snapshotValue) {
    if (!resolveClusterBattleRuntimeCredential(credential)) {
      return fail("cluster_battle_runtime_identity_invalid", "战斗运行态身份校验失败。");
    }
    const normalized = normalizeSnapshot(snapshotValue, maxSnapshotBytes, commandTimeoutMs);
    if (!normalized.ok) {
      return fail(normalized.code, normalized.message);
    }
    const snapshot = normalized.snapshot;
    const room = clone(snapshot.room);
    const roomId = snapshot.roomId;
    const participantAccountIds = uniqueStrings(room.participantAccountIds);
    if (
      participantAccountIds.length === 0
      || participantAccountIds.length !== (Array.isArray(room.participantAccountIds)
        ? room.participantAccountIds.length
        : 0)
    ) {
      return fail("cluster_battle_runtime_participants_invalid", "战斗参与者状态不完整。");
    }

    const data = load();
    const existing = data.battleRooms && data.battleRooms[roomId] || null;
    if (existing && String(existing.status || "") !== BATTLE_ROOM_CLOSED) {
      return ok({
        hydrated: false,
        alreadyPresent: true,
        room: publicBattleRoom(existing),
      });
    }
    for (const accountId of participantAccountIds) {
      const ticketState = battleFailureTicketStateForAccount(data, accountId);
      if (
        !ticketState
        || ticketState.ok !== true
        || !ticketState.ticket
        || String(ticketState.ticket.roomId || "") !== roomId
      ) {
        return fail("cluster_battle_runtime_ticket_stale", "战斗接管票据已经失效。");
      }
      const active = activeBattleRoomForAccount(data, accountId);
      if (active && String(active.roomId || "") !== roomId) {
        return fail("cluster_battle_runtime_account_busy", "参战角色已经进入其他战斗。");
      }
    }

    const currentMs = finiteNow(now());
    if (room.battle && typeof room.battle === "object" && !Array.isArray(room.battle)) {
      if (String(room.battle.phase || "") === BATTLE_PHASE_COMMAND) {
        const remainingMs = Math.max(
          reconnectGraceMs,
          Math.min(commandTimeoutMs, Number(snapshot.commandDeadlineRemainingMs || 0)),
        );
        room.battle.commandDeadlineAt = new Date(currentMs + remainingMs).toISOString();
      }
      room.battle.updatedAt = new Date(currentMs).toISOString();
    }
    const connectionState = room.connectionState && typeof room.connectionState === "object"
      && !Array.isArray(room.connectionState)
      ? room.connectionState
      : {};
    for (const accountId of participantAccountIds) {
      connectionState[accountId] = {
        ...(connectionState[accountId] || {}),
        connected: true,
        lastSeenAt: new Date(currentMs).toISOString(),
        disconnectedAt: "",
        schemaVersion: 1,
      };
    }
    room.connectionState = connectionState;
    room.updatedAt = new Date(currentMs).toISOString();

    if (
      !battleRandomAuthority
      || typeof battleRandomAuthority.canRestoreRoomSecret !== "function"
      || typeof battleRandomAuthority.restoreRoomSecret !== "function"
    ) {
      return fail("cluster_battle_runtime_random_missing", "战斗随机权威状态缺失。");
    }
    try {
      if (battleRandomAuthority.canRestoreRoomSecret(roomId, snapshot.randomSecret) !== true) {
        return fail("cluster_battle_runtime_random_conflict", "战斗随机权威状态发生冲突。");
      }
    } catch (error) {
      return fail("cluster_battle_runtime_snapshot_invalid", "战斗随机权威快照无效。");
    }
    data.battleRooms[roomId] = room;
    save(data);
    applyAfterDurableCommit(() => {
      if (battleRandomAuthority.restoreRoomSecret(roomId, snapshot.randomSecret) !== true) {
        const error = new Error("battle random authority changed before runtime hydration committed");
        error.code = "cluster_battle_runtime_random_conflict";
        throw error;
      }
    });
    emitServiceEvent({
      type: "battle.room_updated",
      targetAccountIds: participantAccountIds,
      roomId,
      reason: "cluster_runtime_hydrated",
      room: publicBattleRoom(room),
    });
    return ok({
      hydrated: true,
      alreadyPresent: false,
      room: publicBattleRoom(room),
    });
  }

  return Object.freeze({exportBattleRuntime, hydrateBattleRuntime});
}

function normalizeSnapshot(value, maxSnapshotBytes, commandTimeoutMs) {
  const snapshot = plainRecord(value) ? cloneJson(value) : null;
  if (!snapshot || jsonBytes(snapshot) > maxSnapshotBytes) {
    return invalidSnapshot("cluster_battle_runtime_snapshot_invalid", "战斗运行态快照无效。");
  }
  const roomId = canonicalRoomId(snapshot.roomId);
  const room = plainRecord(snapshot.room) ? snapshot.room : null;
  const randomSecret = String(snapshot.randomSecret || "").trim();
  const body = {
    schemaVersion: Number(snapshot.schemaVersion),
    roomId,
    checkpointedAt: String(snapshot.checkpointedAt || ""),
    commandDeadlineRemainingMs: Number(snapshot.commandDeadlineRemainingMs),
    room,
    randomSecret,
  };
  if (
    body.schemaVersion !== CLUSTER_BATTLE_RUNTIME_SCHEMA_VERSION
    || roomId === ""
    || !room
    || canonicalRoomId(room.roomId) !== roomId
    || String(room.status || "") === "closed"
    || !Number.isFinite(Date.parse(body.checkpointedAt))
    || !Number.isFinite(body.commandDeadlineRemainingMs)
    || body.commandDeadlineRemainingMs < 0
    || body.commandDeadlineRemainingMs > commandTimeoutMs
    || !/^[A-Za-z0-9_-]{43}$/.test(randomSecret)
    || String(snapshot.checksum || "") !== snapshotChecksum(body)
  ) {
    return invalidSnapshot("cluster_battle_runtime_snapshot_invalid", "战斗运行态快照校验失败。");
  }
  return {ok: true, snapshot: {...body, checksum: snapshot.checksum}};
}

function invalidSnapshot(code, message) {
  return {ok: false, code, message};
}

function snapshotChecksum(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (plainRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function jsonBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function canonicalRoomId(value) {
  const text = String(value || "").trim();
  return text !== "" && Buffer.byteLength(text) <= 200 && !/[\u0000-\u001f\u007f]/.test(text)
    ? text
    : "";
}

function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)));
}

function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function finiteNow(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : Date.now();
}

function plainRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

module.exports = {
  CLUSTER_BATTLE_RUNTIME_SCHEMA_VERSION,
  createClusterBattleRuntimeDomain,
};
