"use strict";

const crypto = require("node:crypto");

const DEFAULT_KEY_PREFIX = "beastbound:cluster:battle-runtime:v1";
const DEFAULT_LEASE_MS = 15000;
const DEFAULT_SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MAX_OWNED_ROOMS = 2048;
const DEFAULT_MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const KEY_PREFIX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,191}$/;
const NODE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const CHECKPOINT_SCRIPT = [
  "-- beastbound_battle_runtime_checkpoint_v1",
  "local current = redis.call('GET', KEYS[1])",
  "if current then",
  "  if current ~= ARGV[1] then return {0, 0, redis.call('PTTL', KEYS[1])} end",
  "  local generation = redis.call('GET', KEYS[2]) or '0'",
  "  redis.call('PSETEX', KEYS[3], ARGV[3], ARGV[4])",
  "  redis.call('PEXPIRE', KEYS[1], ARGV[2])",
  "  redis.call('PEXPIRE', KEYS[2], ARGV[3])",
  "  return {2, generation, ARGV[2]}",
  "end",
  "if redis.call('EXISTS', KEYS[3]) == 1 then",
  "  return {-1, redis.call('GET', KEYS[2]) or '0', 0}",
  "end",
  "local generation = redis.call('INCR', KEYS[2])",
  "redis.call('PSETEX', KEYS[1], ARGV[2], ARGV[1])",
  "redis.call('PEXPIRE', KEYS[2], ARGV[3])",
  "redis.call('PSETEX', KEYS[3], ARGV[3], ARGV[4])",
  "return {1, generation, ARGV[2]}",
].join("\n");

const CLAIM_SCRIPT = [
  "-- beastbound_battle_runtime_claim_v1",
  "local current = redis.call('GET', KEYS[1])",
  "if current then",
  "  if current ~= ARGV[1] then",
  "    return {0, redis.call('GET', KEYS[2]) or '0', redis.call('PTTL', KEYS[1]), ''}",
  "  end",
  "  local snapshot = redis.call('GET', KEYS[3])",
  "  if not snapshot then return {-1, 0, 0, ''} end",
  "  redis.call('PEXPIRE', KEYS[1], ARGV[2])",
  "  redis.call('PEXPIRE', KEYS[2], ARGV[3])",
  "  redis.call('PEXPIRE', KEYS[3], ARGV[3])",
  "  return {2, redis.call('GET', KEYS[2]) or '0', ARGV[2], snapshot}",
  "end",
  "local snapshot = redis.call('GET', KEYS[3])",
  "if not snapshot then return {-1, 0, 0, ''} end",
  "local generation = redis.call('INCR', KEYS[2])",
  "redis.call('PSETEX', KEYS[1], ARGV[2], ARGV[1])",
  "redis.call('PEXPIRE', KEYS[2], ARGV[3])",
  "redis.call('PEXPIRE', KEYS[3], ARGV[3])",
  "return {1, generation, ARGV[2], snapshot}",
].join("\n");

const RENEW_SCRIPT = [
  "-- beastbound_battle_runtime_renew_v1",
  "if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end",
  "if redis.call('EXISTS', KEYS[3]) ~= 1 then return -1 end",
  "if redis.call('EXISTS', KEYS[2]) ~= 1 then return -2 end",
  "redis.call('PEXPIRE', KEYS[1], ARGV[2])",
  "redis.call('PEXPIRE', KEYS[2], ARGV[3])",
  "redis.call('PEXPIRE', KEYS[3], ARGV[3])",
  "return 1",
].join("\n");

const REMOVE_SCRIPT = [
  "-- beastbound_battle_runtime_remove_v1",
  "if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end",
  "redis.call('DEL', KEYS[1])",
  "redis.call('DEL', KEYS[2])",
  "redis.call('DEL', KEYS[3])",
  "return 1",
].join("\n");

const RELEASE_SCRIPT = [
  "-- beastbound_battle_runtime_release_v1",
  "if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end",
  "redis.call('DEL', KEYS[1])",
  "if redis.call('EXISTS', KEYS[2]) == 1 then redis.call('PEXPIRE', KEYS[2], ARGV[2]) end",
  "if redis.call('EXISTS', KEYS[3]) == 1 then redis.call('PEXPIRE', KEYS[3], ARGV[2]) end",
  "return 1",
].join("\n");

async function createValkeyBattleRuntimeStore(options = {}) {
  const nodeId = canonicalNodeId(options.nodeId);
  if (nodeId === "") {
    throw configurationError("cluster_battle_runtime_node_id_invalid", "Cluster battle runtime node id is invalid");
  }
  const keyPrefix = canonicalKeyPrefix(options.keyPrefix, DEFAULT_KEY_PREFIX);
  const leaseMs = boundedInteger(options.leaseMs, DEFAULT_LEASE_MS, 3000, 120000);
  const snapshotTtlMs = boundedInteger(
    options.snapshotTtlMs,
    DEFAULT_SNAPSHOT_TTL_MS,
    leaseMs * 2,
    24 * 60 * 60 * 1000,
  );
  const maxOwnedRooms = boundedInteger(
    options.maxOwnedRooms,
    DEFAULT_MAX_OWNED_ROOMS,
    1,
    100000,
  );
  const maxSnapshotBytes = boundedInteger(
    options.maxSnapshotBytes,
    DEFAULT_MAX_SNAPSHOT_BYTES,
    64 * 1024,
    16 * 1024 * 1024,
  );
  const now = typeof options.now === "function" ? options.now : Date.now;
  const randomBytes = typeof options.randomBytes === "function" ? options.randomBytes : crypto.randomBytes;
  const onError = typeof options.onError === "function" ? options.onError : () => {};
  const onFatal = typeof options.onFatal === "function" ? options.onFatal : () => {};
  const processToken = canonicalToken(
    options.processToken || Buffer.from(randomBytes(24)).toString("base64url"),
  );
  if (processToken === "") {
    throw configurationError("cluster_battle_runtime_token_invalid", "Cluster battle runtime token is invalid");
  }
  const ownerToken = `${nodeId}:${processToken}`;
  const client = await createControlClient(options, nodeId);
  if (!client || typeof client.customCommand !== "function") {
    closeClient(client);
    throw configurationError("cluster_battle_runtime_client_invalid", "Cluster battle runtime client is invalid");
  }
  try {
    const pong = await client.customCommand(["PING"]);
    if (textValue(pong).toUpperCase() !== "PONG") {
      throw new Error("invalid PING response");
    }
  } catch (error) {
    closeClient(client);
    throw configurationError(
      "cluster_battle_runtime_connect_failed",
      "Cluster battle runtime connection failed",
      error,
    );
  }

  const owned = new Map();
  let closed = false;
  let fatal = false;
  let fatalNotified = false;
  let runtimeHealthy = true;
  let renewalTimer = null;
  let renewalPromise = null;
  let closePromise = null;
  const totals = {
    checkpoints: 0,
    checkpointBytes: 0,
    created: 0,
    takeovers: 0,
    takeoverConflicts: 0,
    missingSnapshots: 0,
    renewals: 0,
    renewalFailures: 0,
    removals: 0,
    releases: 0,
  };
  scheduleRenewal();

  async function checkpoint(snapshotValue) {
    assertAvailable();
    const normalized = normalizeSnapshot(snapshotValue, maxSnapshotBytes);
    const roomId = normalized.roomId;
    const key = roomKey(roomId);
    const prior = owned.get(key) || null;
    if (!prior && owned.size >= maxOwnedRooms) {
      throw runtimeError("cluster_battle_runtime_capacity_full", "Cluster battle runtime capacity is full");
    }
    let row;
    try {
      row = numericArray(await client.customCommand([
        "EVAL",
        CHECKPOINT_SCRIPT,
        "3",
        ownerKey(key),
        generationKey(key),
        snapshotKey(key),
        ownerToken,
        String(leaseMs),
        String(snapshotTtlMs),
        normalized.serialized,
      ]));
      runtimeHealthy = true;
    } catch (error) {
      runtimeHealthy = false;
      maybeExpireOwned(prior, error);
      reportError(runtimeError("cluster_battle_runtime_checkpoint_failed", "Battle runtime checkpoint failed", error));
      throw runtimeError("cluster_battle_runtime_checkpoint_failed", "Battle runtime checkpoint failed", error);
    }
    const status = row[0] || 0;
    if (status === 0) {
      const failure = runtimeError("cluster_battle_runtime_lease_lost", "Battle runtime ownership lease was lost");
      failure.retryAfterMs = positiveTtl(row[2], leaseMs);
      markFatal(failure);
      throw failure;
    }
    if (status === -1) {
      const failure = runtimeError(
        prior ? "cluster_battle_runtime_lease_expired" : "cluster_battle_runtime_takeover_required",
        "Battle runtime snapshot requires explicit takeover",
      );
      if (prior) {
        markFatal(failure);
      }
      throw failure;
    }
    if (status !== 1 && status !== 2) {
      const failure = runtimeError("cluster_battle_runtime_result_invalid", "Battle runtime checkpoint result is invalid");
      markFatal(failure);
      throw failure;
    }
    let generation;
    try {
      generation = positiveGeneration(row[1]);
    } catch (error) {
      markFatal(error);
      throw error;
    }
    const record = {
      roomId,
      key,
      generation,
      lastConfirmedAtMs: finiteNow(now()),
    };
    owned.set(key, record);
    totals.checkpoints += 1;
    totals.checkpointBytes += normalized.bytes;
    if (status === 1) {
      totals.created += 1;
    }
    return Object.freeze({ok: true, created: status === 1, generation, leaseMs});
  }

  async function claim(roomIdValue) {
    assertAvailable();
    const roomId = canonicalRoomId(roomIdValue);
    if (roomId === "") {
      throw runtimeError("cluster_battle_runtime_room_invalid", "Battle runtime room id is invalid");
    }
    const key = roomKey(roomId);
    if (!owned.has(key) && owned.size >= maxOwnedRooms) {
      throw runtimeError("cluster_battle_runtime_capacity_full", "Cluster battle runtime capacity is full");
    }
    let result;
    try {
      result = await client.customCommand([
        "EVAL",
        CLAIM_SCRIPT,
        "3",
        ownerKey(key),
        generationKey(key),
        snapshotKey(key),
        ownerToken,
        String(leaseMs),
        String(snapshotTtlMs),
      ]);
      runtimeHealthy = true;
    } catch (error) {
      runtimeHealthy = false;
      reportError(runtimeError("cluster_battle_runtime_claim_failed", "Battle runtime takeover failed", error));
      throw runtimeError("cluster_battle_runtime_claim_failed", "Battle runtime takeover failed", error);
    }
    const row = Array.isArray(result) ? result : [];
    const status = numberValue(row[0]);
    if (status === 0) {
      totals.takeoverConflicts += 1;
      const conflict = runtimeError("cluster_battle_runtime_owner_conflict", "Battle runtime is owned by another node");
      conflict.retryAfterMs = positiveTtl(numberValue(row[2]), leaseMs);
      throw conflict;
    }
    if (status === -1) {
      totals.missingSnapshots += 1;
      return Object.freeze({ok: true, found: false, roomId});
    }
    if (status !== 1 && status !== 2) {
      const failure = runtimeError("cluster_battle_runtime_result_invalid", "Battle runtime takeover result is invalid");
      markFatal(failure);
      throw failure;
    }
    let generation;
    try {
      generation = positiveGeneration(numberValue(row[1]));
    } catch (error) {
      markFatal(error);
      throw error;
    }
    const serialized = textValue(row[3]);
    owned.set(key, {
      roomId,
      key,
      generation,
      lastConfirmedAtMs: finiteNow(now()),
    });
    if (Buffer.byteLength(serialized) > maxSnapshotBytes) {
      throw runtimeError("cluster_battle_runtime_snapshot_too_large", "Battle runtime snapshot exceeds its byte budget");
    }
    let snapshot;
    try {
      snapshot = JSON.parse(serialized);
    } catch (error) {
      throw runtimeError("cluster_battle_runtime_snapshot_invalid", "Battle runtime snapshot is invalid", error);
    }
    if (status === 1) {
      totals.takeovers += 1;
    }
    return Object.freeze({
      ok: true,
      found: true,
      acquired: status === 1,
      generation,
      roomId,
      snapshot,
    });
  }

  async function remove(roomIdValue) {
    const roomId = canonicalRoomId(roomIdValue);
    if (roomId === "") {
      return false;
    }
    const key = roomKey(roomId);
    const record = owned.get(key);
    if (!record) {
      return false;
    }
    try {
      const result = await client.customCommand([
        "EVAL",
        REMOVE_SCRIPT,
        "3",
        ownerKey(key),
        generationKey(key),
        snapshotKey(key),
        ownerToken,
      ]);
      runtimeHealthy = true;
      if (Number(result) !== 1) {
        const failure = runtimeError("cluster_battle_runtime_lease_lost", "Battle runtime ownership lease was lost");
        markFatal(failure);
        throw failure;
      }
      owned.delete(key);
      totals.removals += 1;
      return true;
    } catch (error) {
      if (String(error && error.code || "") !== "cluster_battle_runtime_lease_lost") {
        runtimeHealthy = false;
        reportError(runtimeError("cluster_battle_runtime_remove_failed", "Battle runtime removal failed", error));
      }
      throw error;
    }
  }

  function scheduleRenewal() {
    if (closed || fatal || renewalTimer !== null) {
      return;
    }
    renewalTimer = setTimeout(() => {
      renewalTimer = null;
      renewalPromise = renewOwned().finally(() => {
        renewalPromise = null;
        scheduleRenewal();
      });
    }, Math.max(1000, Math.floor(leaseMs / 3)));
    renewalTimer.unref?.();
  }

  async function renewOwned() {
    for (const record of Array.from(owned.values())) {
      if (closed || fatal) {
        return;
      }
      try {
        const result = Number(await client.customCommand([
          "EVAL",
          RENEW_SCRIPT,
          "3",
          ownerKey(record.key),
          generationKey(record.key),
          snapshotKey(record.key),
          ownerToken,
          String(leaseMs),
          String(snapshotTtlMs),
        ]));
        runtimeHealthy = true;
        if (result !== 1) {
          totals.renewalFailures += 1;
          const failure = runtimeError(
            result === -1
              ? "cluster_battle_runtime_snapshot_missing"
              : result === -2
                ? "cluster_battle_runtime_generation_missing"
                : "cluster_battle_runtime_lease_lost",
            "Battle runtime lease renewal failed",
          );
          markFatal(failure);
          return;
        }
        record.lastConfirmedAtMs = finiteNow(now());
        totals.renewals += 1;
      } catch (error) {
        runtimeHealthy = false;
        totals.renewalFailures += 1;
        reportError(runtimeError("cluster_battle_runtime_renew_failed", "Battle runtime lease renewal failed", error));
        maybeExpireOwned(record, error);
      }
    }
  }

  function close() {
    if (closePromise) {
      return closePromise;
    }
    closed = true;
    if (renewalTimer !== null) {
      clearTimeout(renewalTimer);
      renewalTimer = null;
    }
    closePromise = (async () => {
      if (renewalPromise) {
        await renewalPromise.catch(() => undefined);
      }
      for (const record of Array.from(owned.values())) {
        try {
          const released = await client.customCommand([
            "EVAL",
            RELEASE_SCRIPT,
            "3",
            ownerKey(record.key),
            generationKey(record.key),
            snapshotKey(record.key),
            ownerToken,
            String(snapshotTtlMs),
          ]);
          if (Number(released) === 1) {
            totals.releases += 1;
          }
        } catch (error) {
          reportError(runtimeError("cluster_battle_runtime_release_failed", "Battle runtime release failed", error));
        }
      }
      owned.clear();
      closeClient(client);
    })();
    return closePromise;
  }

  function health() {
    ensureLeasesFresh();
    return Object.freeze({
      ok: !closed && !fatal && runtimeHealthy,
      runtimeHealthy,
      closed,
      fatal,
      ownedRooms: owned.size,
    });
  }

  function metrics() {
    return Object.freeze({...health(), ...totals});
  }

  function ensureLeasesFresh() {
    if (fatal) {
      return;
    }
    const currentMs = finiteNow(now());
    for (const record of owned.values()) {
      if (currentMs - record.lastConfirmedAtMs >= leaseMs) {
        markFatal(runtimeError("cluster_battle_runtime_lease_expired", "Battle runtime ownership lease expired"));
        return;
      }
    }
  }

  function maybeExpireOwned(record, cause) {
    if (record && finiteNow(now()) - record.lastConfirmedAtMs >= leaseMs) {
      markFatal(runtimeError("cluster_battle_runtime_lease_expired", "Battle runtime ownership lease expired", cause));
    }
  }

  function assertAvailable() {
    ensureLeasesFresh();
    if (closed || fatal) {
      throw runtimeError("cluster_battle_runtime_unavailable", "Cluster battle runtime is unavailable");
    }
  }

  function markFatal(error) {
    if (fatal) {
      return;
    }
    fatal = true;
    reportError(error);
    if (!fatalNotified) {
      fatalNotified = true;
      try {
        onFatal(error);
      } catch {
        // Internal fatal state remains authoritative.
      }
    }
  }

  function reportError(error) {
    try {
      onError(error);
    } catch {
      // Health and metrics remain authoritative if an observer fails.
    }
  }

  function roomKey(roomId) {
    return crypto.createHash("sha256").update(roomId).digest("hex");
  }

  function ownerKey(key) {
    return `${keyPrefix}:owner:${key}`;
  }

  function generationKey(key) {
    return `${keyPrefix}:generation:${key}`;
  }

  function snapshotKey(key) {
    return `${keyPrefix}:snapshot:${key}`;
  }

  return Object.freeze({checkpoint, claim, remove, close, health, metrics});
}

function normalizeSnapshot(value, maxBytes) {
  if (!plainRecord(value)) {
    throw runtimeError("cluster_battle_runtime_snapshot_invalid", "Battle runtime snapshot is invalid");
  }
  const roomId = canonicalRoomId(value.roomId);
  if (roomId === "" || Number(value.schemaVersion) !== 1) {
    throw runtimeError("cluster_battle_runtime_snapshot_invalid", "Battle runtime snapshot is invalid");
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    throw runtimeError("cluster_battle_runtime_snapshot_invalid", "Battle runtime snapshot is invalid", error);
  }
  const bytes = Buffer.byteLength(serialized);
  if (bytes > maxBytes) {
    throw runtimeError("cluster_battle_runtime_snapshot_too_large", "Battle runtime snapshot exceeds its byte budget");
  }
  return {roomId, serialized, bytes};
}

async function createControlClient(options, nodeId) {
  if (options.client) {
    return options.client;
  }
  const connection = plainRecord(options.connection) ? options.connection : {};
  const host = String(connection.host || "").trim();
  if (host === "") {
    throw configurationError("cluster_battle_runtime_host_required", "Cluster battle runtime host is required");
  }
  const createClient = typeof options.createClient === "function"
    ? options.createClient
    : defaultGlideClientFactory;
  try {
    return await createClient({
      addresses: [{host, port: boundedInteger(connection.port, 6379, 1, 65535)}],
      useTLS: connection.useTLS === true,
      databaseId: boundedInteger(connection.databaseId, 0, 0, 15),
      requestTimeout: boundedInteger(connection.requestTimeoutMs, 2000, 250, 30000),
      clientName: `beastbound-${nodeId}-battle-runtime`,
      ...(connection.username || connection.password ? {
        credentials: {
          ...(connection.username ? {username: String(connection.username)} : {}),
          ...(connection.password ? {password: String(connection.password)} : {}),
        },
      } : {}),
    });
  } catch (error) {
    throw configurationError("cluster_battle_runtime_connect_failed", "Cluster battle runtime connection failed", error);
  }
}

async function defaultGlideClientFactory(configuration) {
  const {GlideClient} = require("@valkey/valkey-glide");
  return GlideClient.createClient(configuration);
}

function canonicalRoomId(value) {
  const text = String(value || "").trim();
  return text !== "" && Buffer.byteLength(text) <= 200 && !/[\u0000-\u001f\u007f]/.test(text) ? text : "";
}

function canonicalNodeId(value) {
  const text = String(value || "").trim();
  return NODE_ID_PATTERN.test(text) ? text : "";
}

function canonicalKeyPrefix(value, fallback) {
  const text = String(value || fallback).trim();
  if (!KEY_PREFIX_PATTERN.test(text)) {
    throw configurationError("cluster_battle_runtime_key_prefix_invalid", "Cluster battle runtime key prefix is invalid");
  }
  return text;
}

function canonicalToken(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_-]{16,128}$/.test(text) ? text : "";
}

function positiveGeneration(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw runtimeError("cluster_battle_runtime_generation_invalid", "Battle runtime generation is invalid");
  }
  return number;
}

function positiveTtl(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.ceil(number) : fallback;
}

function numericArray(value) {
  return Array.isArray(value) ? value.map(numberValue) : [];
}

function numberValue(value) {
  const number = Number(Buffer.isBuffer(value) ? value.toString("utf8") : value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function textValue(value) {
  return Buffer.isBuffer(value) ? value.toString("utf8") : String(value || "");
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function finiteNow(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : Date.now();
}

function plainRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function closeClient(client) {
  try {
    client?.close?.();
  } catch {
    // Process shutdown must not hide an earlier ownership error.
  }
}

function configurationError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function runtimeError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

module.exports = {
  DEFAULT_KEY_PREFIX,
  createValkeyBattleRuntimeStore,
};
