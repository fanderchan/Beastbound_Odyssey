"use strict";

const net = require("node:net");
const {
  createValkeyStreamEventBridge,
} = require("./valkey-stream-event-bridge");
const {
  createValkeyAccountOwner,
} = require("./valkey-account-owner");
const {
  createValkeyBattleRuntimeStore,
} = require("./valkey-battle-runtime-store");

const CLUSTER_MODE_SINGLE = "single";
const CLUSTER_MODE_VALKEY = "valkey";

async function createConfiguredClusterEventRuntime(env = process.env, options = {}) {
  const source = env && typeof env === "object" ? env : {};
  const mode = String(source.BEASTBOUND_CLUSTER_MODE || CLUSTER_MODE_SINGLE).trim().toLowerCase();
  if (mode === CLUSTER_MODE_SINGLE) {
    return disabledRuntime();
  }
  if (mode !== CLUSTER_MODE_VALKEY) {
    throw configurationError(
      "cluster_mode_invalid",
      "BEASTBOUND_CLUSTER_MODE must be single or valkey",
    );
  }
  const nodeId = requiredText(
    source.BEASTBOUND_CLUSTER_NODE_ID,
    "cluster_node_id_required",
    "BEASTBOUND_CLUSTER_NODE_ID is required in Valkey cluster mode",
  );
  const host = requiredText(
    source.BEASTBOUND_CLUSTER_VALKEY_HOST,
    "cluster_valkey_host_required",
    "BEASTBOUND_CLUSTER_VALKEY_HOST is required in Valkey cluster mode",
  );
  const port = strictInteger(
    source.BEASTBOUND_CLUSTER_VALKEY_PORT,
    6379,
    1,
    65535,
    "cluster_valkey_port_invalid",
  );
  const useTLS = strictBoolean(
    source.BEASTBOUND_CLUSTER_VALKEY_TLS,
    !isLoopbackHost(host),
    "cluster_valkey_tls_invalid",
  );
  if (!useTLS && !isLoopbackHost(host)) {
    throw configurationError(
      "cluster_valkey_plaintext_remote_forbidden",
      "Remote Valkey cluster connections must use TLS",
    );
  }
  const accountSticky = strictBoolean(
    source.BEASTBOUND_CLUSTER_ACCOUNT_STICKY,
    false,
    "cluster_account_sticky_invalid",
  );
  if (!accountSticky) {
    throw configurationError(
      "cluster_account_sticky_required",
      "Valkey cluster mode requires explicit account-sticky ingress routing",
    );
  }
  const maxStreamLength = strictInteger(
    source.BEASTBOUND_CLUSTER_VALKEY_STREAM_MAXLEN,
    262144,
    1024,
    10 * 1000 * 1000,
    "cluster_valkey_stream_maxlen_invalid",
  );
  const leaseMs = strictInteger(
    source.BEASTBOUND_CLUSTER_NODE_LEASE_MS,
    15000,
    3000,
    120000,
    "cluster_valkey_lease_ms_invalid",
  );
  const accountLeaseMs = strictInteger(
    source.BEASTBOUND_CLUSTER_ACCOUNT_LEASE_MS,
    15000,
    3000,
    120000,
    "cluster_account_lease_ms_invalid",
  );
  const maxOwnedAccounts = strictInteger(
    source.BEASTBOUND_CLUSTER_ACCOUNT_OWNER_MAX,
    4096,
    1,
    100000,
    "cluster_account_owner_max_invalid",
  );
  const maxPendingAdmissions = strictInteger(
    source.BEASTBOUND_CLUSTER_ACCOUNT_ADMISSION_MAX_PENDING,
    1024,
    1,
    10000,
    "cluster_account_admission_max_pending_invalid",
  );
  const battleRuntimeLeaseMs = strictInteger(
    source.BEASTBOUND_CLUSTER_BATTLE_RUNTIME_LEASE_MS,
    accountLeaseMs,
    3000,
    120000,
    "cluster_battle_runtime_lease_ms_invalid",
  );
  const battleRuntimeSnapshotTtlMs = strictInteger(
    source.BEASTBOUND_CLUSTER_BATTLE_RUNTIME_SNAPSHOT_TTL_MS,
    6 * 60 * 60 * 1000,
    battleRuntimeLeaseMs * 2,
    24 * 60 * 60 * 1000,
    "cluster_battle_runtime_snapshot_ttl_invalid",
  );
  const battleRuntimeMaxOwnedRooms = strictInteger(
    source.BEASTBOUND_CLUSTER_BATTLE_RUNTIME_MAX_OWNED,
    2048,
    1,
    100000,
    "cluster_battle_runtime_max_owned_invalid",
  );
  const battleRuntimeMaxSnapshotBytes = strictInteger(
    source.BEASTBOUND_CLUSTER_BATTLE_RUNTIME_MAX_SNAPSHOT_BYTES,
    8 * 1024 * 1024,
    64 * 1024,
    16 * 1024 * 1024,
    "cluster_battle_runtime_max_snapshot_bytes_invalid",
  );
  const readBlockMs = strictInteger(
    source.BEASTBOUND_CLUSTER_VALKEY_READ_BLOCK_MS,
    250,
    10,
    5000,
    "cluster_valkey_read_block_invalid",
  );
  const requestTimeoutMs = strictInteger(
    source.BEASTBOUND_CLUSTER_VALKEY_REQUEST_TIMEOUT_MS,
    Math.max(2000, readBlockMs + 500),
    readBlockMs + 100,
    30000,
    "cluster_valkey_request_timeout_invalid",
  );
  const bridgeFactory = typeof options.bridgeFactory === "function"
    ? options.bridgeFactory
    : createValkeyStreamEventBridge;
  const accountOwnerFactory = typeof options.accountOwnerFactory === "function"
    ? options.accountOwnerFactory
    : createValkeyAccountOwner;
  const battleRuntimeFactory = typeof options.battleRuntimeFactory === "function"
    ? options.battleRuntimeFactory
    : createValkeyBattleRuntimeStore;
  const onError = typeof options.onError === "function" ? options.onError : () => {};
  const onFatal = typeof options.onFatal === "function" ? options.onFatal : () => {};
  const connection = {
    host,
    port,
    useTLS,
    databaseId: strictInteger(
      source.BEASTBOUND_CLUSTER_VALKEY_DATABASE,
      0,
      0,
      15,
      "cluster_valkey_database_invalid",
    ),
    requestTimeoutMs,
    username: optionalText(source.BEASTBOUND_CLUSTER_VALKEY_USERNAME),
    password: optionalText(source.BEASTBOUND_CLUSTER_VALKEY_PASSWORD),
  };
  let bridge = null;
  let accountAdmission = null;
  let battleRuntime = null;
  try {
    bridge = await bridgeFactory({
      nodeId,
      streamKey: optionalText(source.BEASTBOUND_CLUSTER_VALKEY_STREAM_KEY),
      maxStreamLength,
      leaseMs,
      readBlockMs,
      onError,
      onFatal,
      connection,
    });
    accountAdmission = await accountOwnerFactory({
      nodeId,
      keyPrefix: optionalText(source.BEASTBOUND_CLUSTER_ACCOUNT_OWNER_KEY_PREFIX),
      leaseMs: accountLeaseMs,
      maxOwnedAccounts,
      maxPendingAdmissions,
      onError,
      onFatal,
      connection,
    });
    battleRuntime = await battleRuntimeFactory({
      nodeId,
      keyPrefix: optionalText(source.BEASTBOUND_CLUSTER_BATTLE_RUNTIME_KEY_PREFIX),
      leaseMs: battleRuntimeLeaseMs,
      snapshotTtlMs: battleRuntimeSnapshotTtlMs,
      maxOwnedRooms: battleRuntimeMaxOwnedRooms,
      maxSnapshotBytes: battleRuntimeMaxSnapshotBytes,
      onError,
      onFatal,
      connection,
    });
  } catch (error) {
    try {
      await closeRuntimeParts(battleRuntime, accountAdmission, bridge);
    } catch (cleanupError) {
      try {
        onError(cleanupError);
      } catch {
        // Preserve the initialization failure as the primary startup error.
      }
    }
    throw error;
  }
  let closed = false;
  return Object.freeze({
    mode,
    enabled: true,
    bridge,
    accountAdmission,
    battleRuntime,
    eventHubOptions: Object.freeze({
      clusterEventBridge: bridge,
      clusterRequired: true,
      clusterNodeId: nodeId,
      onClusterEventError: onError,
    }),
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      await closeRuntimeParts(battleRuntime, accountAdmission, bridge);
    },
  });
}

function disabledRuntime() {
  return Object.freeze({
    mode: CLUSTER_MODE_SINGLE,
    enabled: false,
    bridge: null,
    accountAdmission: null,
    battleRuntime: null,
    eventHubOptions: Object.freeze({}),
    close() { return Promise.resolve(); },
  });
}

async function closeRuntimeParts(battleRuntime, accountAdmission, bridge) {
  const results = await Promise.allSettled([
    closeRuntimePart(battleRuntime),
    closeRuntimePart(accountAdmission),
    closeRuntimePart(bridge),
  ]);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) {
    throw failure.reason;
  }
}

function closeRuntimePart(part) {
  if (!part || typeof part.close !== "function") {
    return Promise.resolve();
  }
  try {
    return Promise.resolve(part.close());
  } catch (error) {
    return Promise.reject(error);
  }
}

function isLoopbackHost(host) {
  const value = String(host || "").trim().toLowerCase();
  if (value === "localhost" || value === "::1") {
    return true;
  }
  return net.isIP(value) === 4 && value.startsWith("127.");
}

function strictBoolean(value, fallback, code) {
  const text = String(value === undefined ? "" : value).trim().toLowerCase();
  if (text === "") {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(text)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(text)) {
    return false;
  }
  throw configurationError(code, "Cluster boolean configuration is invalid");
}

function strictInteger(value, fallback, minimum, maximum, code) {
  const text = String(value === undefined ? "" : value).trim();
  if (text === "") {
    return fallback;
  }
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw configurationError(code, "Cluster integer configuration is invalid");
  }
  return number;
}

function requiredText(value, code, message) {
  const text = optionalText(value);
  if (text === "") {
    throw configurationError(code, message);
  }
  return text;
}

function optionalText(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function configurationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  CLUSTER_MODE_SINGLE,
  CLUSTER_MODE_VALKEY,
  createConfiguredClusterEventRuntime,
  isLoopbackHost,
};
