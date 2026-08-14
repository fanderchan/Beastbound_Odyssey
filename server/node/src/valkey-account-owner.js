"use strict";

const crypto = require("node:crypto");

const DEFAULT_KEY_PREFIX = "beastbound:cluster:account-owner:v1";
const DEFAULT_LEASE_MS = 15000;
const DEFAULT_MAX_OWNED_ACCOUNTS = 4096;
const DEFAULT_MAX_PENDING_ADMISSIONS = 1024;
const DEFAULT_RENEWAL_BATCH_SIZE = 64;
const PRESENCE_REVISION_STRIDE = 1000000000;
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const KEY_PREFIX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,191}$/;

const ACQUIRE_SCRIPT = [
  "local current = redis.call('GET', KEYS[1])",
  "if current then",
  "  if current == ARGV[1] then",
  "    redis.call('PEXPIRE', KEYS[1], ARGV[2])",
  "    local generation = redis.call('GET', KEYS[2]) or '0'",
  "    return {2, generation, ARGV[2]}",
  "  end",
  "  local ttl = redis.call('PTTL', KEYS[1])",
  "  return {0, 0, ttl}",
  "end",
  "local generation = redis.call('INCR', KEYS[2])",
  "redis.call('PSETEX', KEYS[1], ARGV[2], ARGV[1])",
  "return {1, generation, ARGV[2]}",
].join("\n");

const RENEW_SCRIPT = [
  "if redis.call('GET', KEYS[1]) == ARGV[1] then",
  "  return redis.call('PEXPIRE', KEYS[1], ARGV[2])",
  "end",
  "return 0",
].join("\n");

const RELEASE_SCRIPT = [
  "if redis.call('GET', KEYS[1]) == ARGV[1] then",
  "  return redis.call('DEL', KEYS[1])",
  "end",
  "return 0",
].join("\n");

async function createValkeyAccountOwner(options = {}) {
  const nodeId = canonicalNodeId(options.nodeId);
  if (nodeId === "") {
    throw configurationError(
      "cluster_account_owner_node_id_invalid",
      "Cluster account owner node id is invalid",
    );
  }
  const keyPrefix = canonicalKeyPrefix(options.keyPrefix, DEFAULT_KEY_PREFIX);
  const leaseMs = boundedInteger(options.leaseMs, DEFAULT_LEASE_MS, 3000, 120000);
  const maxOwnedAccounts = boundedInteger(
    options.maxOwnedAccounts,
    DEFAULT_MAX_OWNED_ACCOUNTS,
    1,
    100000,
  );
  const maxPendingAdmissions = boundedInteger(
    options.maxPendingAdmissions,
    DEFAULT_MAX_PENDING_ADMISSIONS,
    1,
    10000,
  );
  const renewalBatchSize = boundedInteger(
    options.renewalBatchSize,
    DEFAULT_RENEWAL_BATCH_SIZE,
    1,
    256,
  );
  const now = typeof options.now === "function" ? options.now : Date.now;
  const randomBytes = typeof options.randomBytes === "function"
    ? options.randomBytes
    : crypto.randomBytes;
  const onError = typeof options.onError === "function" ? options.onError : () => {};
  const onFatal = typeof options.onFatal === "function" ? options.onFatal : () => {};
  const processToken = canonicalToken(
    options.processToken || Buffer.from(randomBytes(24)).toString("base64url"),
  );
  if (processToken === "") {
    throw configurationError(
      "cluster_account_owner_token_invalid",
      "Cluster account owner token is invalid",
    );
  }

  const client = await createControlClient(options, nodeId);
  if (!client || typeof client.customCommand !== "function") {
    closeClient(client);
    throw configurationError(
      "cluster_account_owner_client_invalid",
      "Cluster account owner client is invalid",
    );
  }
  try {
    const pong = await client.customCommand(["PING"]);
    if (textValue(pong).toUpperCase() !== "PONG") {
      throw new Error("invalid PING response");
    }
  } catch (error) {
    closeClient(client);
    throw configurationError(
      "cluster_account_owner_connect_failed",
      "Cluster account owner connection failed",
      error,
    );
  }

  const owned = new Map();
  const pending = new Map();
  let presenceRevisionObserver = typeof options.onPresenceRevisionFloor === "function"
    ? options.onPresenceRevisionFloor
    : null;
  let closed = false;
  let fatal = false;
  let runtimeHealthy = true;
  let fatalNotified = false;
  let closePromise = null;
  let renewalTimer = null;
  let renewalRunning = false;
  let renewalPromise = null;
  const totals = {
    acquired: 0,
    reused: 0,
    conflicts: 0,
    capacityRejected: 0,
    invalidRejected: 0,
    renewals: 0,
    renewalFailures: 0,
    releases: 0,
    releaseFailures: 0,
  };

  scheduleRenewal();

  function setPresenceRevisionObserver(observer) {
    if (closed || fatal || typeof observer !== "function") {
      throw configurationError(
        "cluster_account_presence_observer_invalid",
        "Cluster account presence observer is invalid",
      );
    }
    if (presenceRevisionObserver && presenceRevisionObserver !== observer) {
      throw configurationError(
        "cluster_account_presence_observer_duplicate",
        "Cluster account presence observer is already configured",
      );
    }
    presenceRevisionObserver = observer;
  }

  function admit(accountIdValue) {
    const accountId = canonicalAccountId(accountIdValue);
    if (accountId === "") {
      totals.invalidRejected += 1;
      return Promise.reject(runtimeError(
        "cluster_account_id_invalid",
        "Cluster account identity is invalid",
      ));
    }
    if (closed || fatal) {
      return Promise.reject(runtimeError(
        "cluster_account_owner_unavailable",
        "Cluster account ownership is unavailable",
      ));
    }
    ensureOwnedLeasesFresh();
    if (fatal) {
      return Promise.reject(runtimeError(
        "cluster_account_owner_unavailable",
        "Cluster account ownership is unavailable",
      ));
    }
    if (typeof presenceRevisionObserver !== "function") {
      return Promise.reject(configurationError(
        "cluster_account_presence_observer_missing",
        "Cluster account presence observer is required before admission",
      ));
    }
    const key = accountKey(accountId);
    const held = owned.get(key);
    const currentMs = finiteNow(now());
    if (held && currentMs - held.lastConfirmedAtMs < Math.floor(leaseMs / 2)) {
      totals.reused += 1;
      return Promise.resolve(publicAdmission(held, false, leaseMs));
    }
    if (pending.has(key)) {
      return pending.get(key);
    }
    if (!held && owned.size + pending.size >= maxOwnedAccounts) {
      totals.capacityRejected += 1;
      return Promise.reject(runtimeError(
        "cluster_account_owner_capacity_full",
        "Cluster account ownership capacity is full",
      ));
    }
    if (pending.size >= maxPendingAdmissions) {
      totals.capacityRejected += 1;
      return Promise.reject(runtimeError(
        "cluster_account_owner_admission_full",
        "Cluster account ownership admission queue is full",
      ));
    }
    const operation = acquire(accountId, key, held).finally(() => pending.delete(key));
    pending.set(key, operation);
    return operation;
  }

  async function acquire(accountId, key, prior) {
    let result;
    try {
      result = await client.customCommand([
        "EVAL",
        ACQUIRE_SCRIPT,
        "2",
        ownerKey(key),
        generationKey(key),
        processToken,
        String(leaseMs),
      ]);
      runtimeHealthy = true;
    } catch (error) {
      runtimeHealthy = false;
      reportError(runtimeError(
        String(error && error.code || "cluster_account_owner_acquire_failed"),
        "Cluster account ownership acquisition failed",
        error,
      ));
      throw runtimeError(
        "cluster_account_owner_acquire_failed",
        "Cluster account ownership acquisition failed",
        error,
      );
    }
    const row = numericArray(result);
    const status = row[0] || 0;
    if (status === 0) {
      totals.conflicts += 1;
      const conflict = runtimeError(
        "cluster_account_owner_conflict",
        "The account is currently owned by another game node",
      );
      conflict.retryAfterMs = Math.max(250, Math.min(leaseMs, row[2] || leaseMs));
      if (prior) {
        markFatal(runtimeError(
          "cluster_account_owner_lease_lost",
          "A locally owned account lease was lost",
        ));
      }
      throw conflict;
    }
    if (status !== 1 && status !== 2) {
      const invalidResult = runtimeError(
        "cluster_account_owner_result_invalid",
        "Cluster account ownership result is invalid",
      );
      markFatal(invalidResult);
      throw invalidResult;
    }
    if (prior && status === 1) {
      await releaseLeaseKey(key).catch(() => undefined);
      const continuityLost = runtimeError(
        "cluster_account_owner_lease_expired",
        "A locally owned account lease expired before renewal",
      );
      markFatal(continuityLost);
      throw continuityLost;
    }
    let generation;
    let presenceRevisionFloor;
    let presenceRevisionCeiling;
    try {
      generation = positiveGeneration(row[1]);
      presenceRevisionFloor = revisionFloorForGeneration(generation);
      presenceRevisionCeiling = revisionCeilingForGeneration(generation);
    } catch (error) {
      if (status === 1 || !prior) {
        await releaseLeaseKey(key).catch(() => undefined);
      }
      markFatal(error);
      throw error;
    }
    const acquired = status === 1;
    const record = {
      accountId,
      key,
      generation,
      presenceRevisionFloor,
      lastConfirmedAtMs: finiteNow(now()),
    };
    try {
      const observed = await Promise.resolve(
        presenceRevisionObserver(
          accountId,
          presenceRevisionFloor,
          presenceRevisionCeiling,
        ),
      );
      if (Number(observed) < presenceRevisionFloor) {
        throw new Error("presence revision floor was not adopted");
      }
    } catch (error) {
      if (status === 1 || !prior) {
        await releaseLeaseKey(key).catch(() => undefined);
      }
      const observerFailure = runtimeError(
        "cluster_account_presence_floor_rejected",
        "Cluster account presence revision floor was rejected",
        error,
      );
      markFatal(observerFailure);
      throw observerFailure;
    }
    owned.set(key, record);
    if (acquired) {
      totals.acquired += 1;
    } else {
      totals.reused += 1;
    }
    return publicAdmission(record, acquired, leaseMs);
  }

  async function release(accountIdValue, options = {}) {
    const accountId = canonicalAccountId(accountIdValue);
    if (accountId === "") {
      return false;
    }
    const key = accountKey(accountId);
    const record = owned.get(key);
    if (!record) {
      return false;
    }
    if (
      options.generation !== undefined
      && Number(options.generation) !== record.generation
    ) {
      return false;
    }
    try {
      const released = await releaseLeaseKey(key);
      owned.delete(key);
      if (released) {
        totals.releases += 1;
      } else {
        totals.releaseFailures += 1;
        markFatal(runtimeError(
          "cluster_account_owner_lease_lost",
          "A locally owned account lease was lost before release",
        ));
      }
      return released;
    } catch (error) {
      totals.releaseFailures += 1;
      reportError(runtimeError(
        "cluster_account_owner_release_failed",
        "Cluster account ownership release failed",
        error,
      ));
      return false;
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
    if (closed || fatal || renewalRunning || owned.size === 0) {
      return;
    }
    renewalRunning = true;
    try {
      const records = Array.from(owned.values());
      for (let index = 0; index < records.length; index += renewalBatchSize) {
        if (closed || fatal) {
          return;
        }
        await Promise.all(records
          .slice(index, index + renewalBatchSize)
          .map((record) => renewRecord(record)));
      }
    } finally {
      renewalRunning = false;
    }
  }

  async function renewRecord(record) {
    if (closed || fatal) {
      return;
    }
    try {
      const result = await client.customCommand([
        "EVAL",
        RENEW_SCRIPT,
        "1",
        ownerKey(record.key),
        processToken,
        String(leaseMs),
      ]);
      runtimeHealthy = true;
      if (Number(result) !== 1) {
        totals.renewalFailures += 1;
        markFatal(runtimeError(
          "cluster_account_owner_lease_lost",
          "A locally owned account lease was lost",
        ));
        return;
      }
      record.lastConfirmedAtMs = finiteNow(now());
      totals.renewals += 1;
    } catch (error) {
      runtimeHealthy = false;
      totals.renewalFailures += 1;
      reportError(runtimeError(
        String(error && error.code || "cluster_account_owner_renew_failed"),
        "Cluster account ownership renewal failed",
        error,
      ));
      if (finiteNow(now()) - record.lastConfirmedAtMs >= leaseMs) {
        markFatal(runtimeError(
          "cluster_account_owner_lease_expired",
          "A locally owned account lease expired",
          error,
        ));
      }
    }
  }

  function ensureOwnedLeasesFresh() {
    if (fatal || owned.size === 0) {
      return;
    }
    const currentMs = finiteNow(now());
    for (const record of owned.values()) {
      if (currentMs - record.lastConfirmedAtMs >= leaseMs) {
        markFatal(runtimeError(
          "cluster_account_owner_lease_expired",
          "A locally owned account lease expired",
        ));
        return;
      }
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
        // The internal fatal state remains authoritative.
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
      await Promise.allSettled(Array.from(pending.values()));
      for (const record of Array.from(owned.values())) {
        try {
          const released = await releaseLeaseKey(record.key);
          if (released) {
            totals.releases += 1;
          } else {
            totals.releaseFailures += 1;
          }
        } catch (error) {
          totals.releaseFailures += 1;
          reportError(runtimeError(
            "cluster_account_owner_release_failed",
            "Cluster account ownership release failed",
            error,
          ));
        }
      }
      owned.clear();
      closeClient(client);
    })();
    return closePromise;
  }

  function health() {
    ensureOwnedLeasesFresh();
    return Object.freeze({
      ok: !closed && !fatal && runtimeHealthy,
      runtimeHealthy,
      closed,
      fatal,
      ownedAccounts: owned.size,
      pendingAdmissions: pending.size,
    });
  }

  function metrics() {
    return Object.freeze({...health(), ...totals});
  }

  async function releaseLeaseKey(key) {
    try {
      const result = await client.customCommand([
        "EVAL",
        RELEASE_SCRIPT,
        "1",
        ownerKey(key),
        processToken,
      ]);
      runtimeHealthy = true;
      return Number(result) === 1;
    } catch (error) {
      runtimeHealthy = false;
      throw error;
    }
  }

  function reportError(error) {
    try {
      onError(error);
    } catch {
      // Health and counters remain authoritative if an observer fails.
    }
  }

  function accountKey(accountId) {
    return crypto.createHash("sha256").update(accountId).digest("hex");
  }

  function ownerKey(key) {
    return `${keyPrefix}:owner:${key}`;
  }

  function generationKey(key) {
    return `${keyPrefix}:generation:${key}`;
  }

  return Object.freeze({
    admit,
    release,
    close,
    health,
    metrics,
    setPresenceRevisionObserver,
  });
}

async function createControlClient(options, nodeId) {
  if (options.client) {
    return options.client;
  }
  const connection = plainRecord(options.connection) ? options.connection : {};
  const host = String(connection.host || "").trim();
  if (host === "") {
    throw configurationError(
      "cluster_account_owner_host_required",
      "Cluster account owner host is required",
    );
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
      clientName: `beastbound-${nodeId}-account-owner`,
      ...(connection.username || connection.password ? {
        credentials: {
          ...(connection.username ? {username: String(connection.username)} : {}),
          ...(connection.password ? {password: String(connection.password)} : {}),
        },
      } : {}),
    });
  } catch (error) {
    throw configurationError(
      "cluster_account_owner_connect_failed",
      "Cluster account owner connection failed",
      error,
    );
  }
}

async function defaultGlideClientFactory(configuration) {
  const {GlideClient} = require("@valkey/valkey-glide");
  return GlideClient.createClient(configuration);
}

function publicAdmission(record, acquired, leaseMs) {
  return Object.freeze({
    ok: true,
    acquired: Boolean(acquired),
    generation: record.generation,
    presenceRevisionFloor: record.presenceRevisionFloor,
    leaseMs,
  });
}

function revisionFloorForGeneration(generation) {
  const floor = generation * PRESENCE_REVISION_STRIDE;
  if (
    !Number.isSafeInteger(floor)
    || floor <= 0
    || !Number.isSafeInteger(floor + PRESENCE_REVISION_STRIDE - 1)
    || floor + PRESENCE_REVISION_STRIDE - 1 >= Number.MAX_SAFE_INTEGER
  ) {
    throw runtimeError(
      "cluster_account_owner_generation_exhausted",
      "Cluster account ownership generation is exhausted",
    );
  }
  return floor;
}

function revisionCeilingForGeneration(generation) {
  return revisionFloorForGeneration(generation) + PRESENCE_REVISION_STRIDE - 1;
}

function positiveGeneration(value) {
  const generation = Number(value);
  if (!Number.isSafeInteger(generation) || generation <= 0) {
    throw runtimeError(
      "cluster_account_owner_generation_invalid",
      "Cluster account ownership generation is invalid",
    );
  }
  revisionFloorForGeneration(generation);
  return generation;
}

function numericArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    const number = Number(Buffer.isBuffer(entry) ? entry.toString("utf8") : entry);
    return Number.isFinite(number) ? Math.trunc(number) : 0;
  });
}

function textValue(value) {
  return Buffer.isBuffer(value) ? value.toString("utf8") : String(value || "");
}

function canonicalAccountId(value) {
  const text = String(value || "").trim();
  return ACCOUNT_ID_PATTERN.test(text) ? text : "";
}

function canonicalNodeId(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(text) ? text : "";
}

function canonicalKeyPrefix(value, fallback) {
  const text = String(value || fallback).trim();
  if (!KEY_PREFIX_PATTERN.test(text)) {
    throw configurationError(
      "cluster_account_owner_key_prefix_invalid",
      "Cluster account owner key prefix is invalid",
    );
  }
  return text;
}

function canonicalToken(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_-]{16,128}$/.test(text) ? text : "";
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, number));
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
    // The process is already closing; do not hide earlier ownership errors.
  }
}

function configurationError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function runtimeError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

module.exports = {
  DEFAULT_KEY_PREFIX,
  PRESENCE_REVISION_STRIDE,
  createValkeyAccountOwner,
};
