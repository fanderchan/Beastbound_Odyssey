"use strict";

const net = require("node:net");
const {
  createValkeyStreamEventBridge,
} = require("./valkey-stream-event-bridge");

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
  const onError = typeof options.onError === "function" ? options.onError : () => {};
  const onFatal = typeof options.onFatal === "function" ? options.onFatal : () => {};
  const bridge = await bridgeFactory({
    nodeId,
    streamKey: optionalText(source.BEASTBOUND_CLUSTER_VALKEY_STREAM_KEY),
    maxStreamLength,
    leaseMs,
    readBlockMs,
    onError,
    onFatal,
    connection: {
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
    },
  });
  let closed = false;
  return Object.freeze({
    mode,
    enabled: true,
    bridge,
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
      if (bridge && typeof bridge.close === "function") {
        await bridge.close();
      }
    },
  });
}

function disabledRuntime() {
  return Object.freeze({
    mode: CLUSTER_MODE_SINGLE,
    enabled: false,
    bridge: null,
    eventHubOptions: Object.freeze({}),
    close() { return Promise.resolve(); },
  });
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
