"use strict";

const crypto = require("node:crypto");
const {
  DEFAULT_MAX_CLUSTER_EVENT_BYTES,
  REQUIRED_CLUSTER_EVENT_CAPABILITIES,
  validateClusterEventEnvelope,
} = require("./event-cluster-relay");

const DEFAULT_STREAM_KEY = "beastbound:cluster:events:v1";
const DEFAULT_GROUP_PREFIX = "beastbound:cluster:node:v1";
const DEFAULT_LEASE_PREFIX = "beastbound:cluster:lease:v1";
const DEFAULT_MAX_STREAM_LENGTH = 262144;
const DEFAULT_MAX_QUEUED_PUBLISHES = 1024;
const DEFAULT_READ_BATCH_SIZE = 128;
const DEFAULT_READ_BLOCK_MS = 250;
const DEFAULT_RETRY_DELAY_MS = 50;
const DEFAULT_LEASE_MS = 15000;
const DEFAULT_REQUEST_TIMEOUT_MS = 2000;
const DEFAULT_MAX_ENVELOPE_BYTES = 1024 * 1024 + 16 * 1024;
const NODE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const KEY_COMPONENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,191}$/;
const STREAM_ID_PATTERN = /^\d+-\d+$/;

const RENEW_LEASE_SCRIPT = [
  "if redis.call('GET', KEYS[1]) == ARGV[1] then",
  "  return redis.call('PEXPIRE', KEYS[1], ARGV[2])",
  "end",
  "return 0",
].join("\n");

const RELEASE_LEASE_SCRIPT = [
  "if redis.call('GET', KEYS[1]) == ARGV[1] then",
  "  return redis.call('DEL', KEYS[1])",
  "end",
  "return 0",
].join("\n");

async function createValkeyStreamEventBridge(options = {}) {
  const nodeId = canonicalNodeId(options.nodeId);
  if (nodeId === "") {
    throw configurationError(
      "cluster_valkey_node_id_invalid",
      "Valkey cluster node id is invalid",
    );
  }
  const streamKey = canonicalKey(options.streamKey, DEFAULT_STREAM_KEY);
  const groupPrefix = canonicalKey(options.groupPrefix, DEFAULT_GROUP_PREFIX);
  const leasePrefix = canonicalKey(options.leasePrefix, DEFAULT_LEASE_PREFIX);
  const groupName = `${groupPrefix}:${nodeId}`;
  const consumerName = nodeId;
  const leaseKey = `${leasePrefix}:${nodeId}`;
  const maxStreamLength = boundedInteger(
    options.maxStreamLength,
    DEFAULT_MAX_STREAM_LENGTH,
    1024,
    10 * 1000 * 1000,
  );
  const maxQueuedPublishes = boundedInteger(
    options.maxQueuedPublishes,
    DEFAULT_MAX_QUEUED_PUBLISHES,
    1,
    65536,
  );
  const readBatchSize = boundedInteger(
    options.readBatchSize,
    DEFAULT_READ_BATCH_SIZE,
    1,
    1024,
  );
  const readBlockMs = boundedInteger(
    options.readBlockMs,
    DEFAULT_READ_BLOCK_MS,
    10,
    5000,
  );
  const retryDelayMs = boundedInteger(
    options.retryDelayMs,
    DEFAULT_RETRY_DELAY_MS,
    1,
    5000,
  );
  const leaseMs = boundedInteger(
    options.leaseMs,
    DEFAULT_LEASE_MS,
    3000,
    120000,
  );
  const maxEnvelopeBytes = boundedInteger(
    options.maxEnvelopeBytes,
    DEFAULT_MAX_ENVELOPE_BYTES,
    1024,
    2 * 1024 * 1024,
  );
  const maxEventBytes = boundedInteger(
    options.maxEventBytes,
    DEFAULT_MAX_CLUSTER_EVENT_BYTES,
    1024,
    DEFAULT_MAX_CLUSTER_EVENT_BYTES,
  );
  const now = typeof options.now === "function" ? options.now : Date.now;
  const randomBytes = typeof options.randomBytes === "function"
    ? options.randomBytes
    : crypto.randomBytes;
  const onError = typeof options.onError === "function" ? options.onError : () => {};
  const onFatal = typeof options.onFatal === "function" ? options.onFatal : () => {};
  const sleep = typeof options.sleep === "function" ? options.sleep : delay;
  const leaseToken = canonicalLeaseToken(
    options.leaseToken || Buffer.from(randomBytes(24)).toString("base64url"),
  );
  if (leaseToken === "") {
    throw configurationError(
      "cluster_valkey_lease_token_invalid",
      "Valkey cluster lease token is invalid",
    );
  }

  const clients = await createClientSet(options, nodeId);
  assertClientSet(clients);
  let closed = false;
  let closePromise = null;
  let listener = null;
  let readLoopPromise = null;
  let readerRunning = false;
  let readerHealthy = false;
  let fatal = false;
  let fatalNotified = false;
  let leaseHeld = false;
  let lastLeaseConfirmedAtMs = 0;
  let leaseTimer = null;
  let leaseRenewing = false;
  let queuedPublishes = 0;
  let publishTail = Promise.resolve();
  const totals = {
    published: 0,
    publishFailures: 0,
    publishRejected: 0,
    received: 0,
    acknowledged: 0,
    deliveryRetries: 0,
    invalidDropped: 0,
    readFailures: 0,
    leaseRenewals: 0,
    leaseFailures: 0,
  };

  try {
    await acquireLease();
    await ensureConsumerGroup();
    await assertReplayWindowIntact();
  } catch (error) {
    await releaseLease().catch(() => undefined);
    closeClientSet(clients);
    throw normalizeConfigurationFailure(error);
  }
  scheduleLeaseRenewal();

  function subscribe(nextListener) {
    if (closed || fatal) {
      throw runtimeError(
        "cluster_valkey_bridge_unavailable",
        "Valkey cluster bridge is unavailable",
      );
    }
    if (typeof nextListener !== "function") {
      throw configurationError(
        "cluster_valkey_listener_invalid",
        "Valkey cluster bridge listener is invalid",
      );
    }
    if (listener !== null) {
      throw configurationError(
        "cluster_valkey_listener_duplicate",
        "Valkey cluster bridge accepts one relay subscriber",
      );
    }
    listener = nextListener;
    if (readLoopPromise === null) {
      readLoopPromise = runReadLoop();
    }
    let subscribed = true;
    return () => {
      if (!subscribed) {
        return;
      }
      subscribed = false;
      listener = null;
      readerHealthy = false;
    };
  }

  function publish(envelope) {
    if (!publishReady()) {
      totals.publishRejected += 1;
      return Promise.reject(runtimeError(
        "cluster_valkey_publish_unavailable",
        "Valkey cluster publish is unavailable",
      ));
    }
    if (queuedPublishes >= maxQueuedPublishes) {
      totals.publishRejected += 1;
      return Promise.reject(runtimeError(
        "cluster_valkey_publish_queue_full",
        "Valkey cluster publish queue is full",
      ));
    }
    const validated = validateClusterEventEnvelope(envelope, maxEventBytes);
    if (!validated.ok) {
      totals.publishRejected += 1;
      return Promise.reject(validated.error);
    }
    const serialized = serializeEnvelope(validated.envelope, maxEnvelopeBytes);
    if (!serialized.ok) {
      totals.publishRejected += 1;
      return Promise.reject(serialized.error);
    }
    queuedPublishes += 1;
    const operation = publishTail.then(async () => {
      if (!publishReady()) {
        throw runtimeError(
          "cluster_valkey_publish_unavailable",
          "Valkey cluster publish is unavailable",
        );
      }
      const entryId = await clients.writer.xadd(
        streamKey,
        [["envelope", serialized.value]],
        {
          trim: {
            method: "maxlen",
            threshold: maxStreamLength,
            exact: false,
          },
        },
      );
      if (!STREAM_ID_PATTERN.test(textValue(entryId))) {
        throw runtimeError(
          "cluster_valkey_publish_result_invalid",
          "Valkey cluster publish returned an invalid stream id",
        );
      }
      totals.published += 1;
    });
    publishTail = operation.catch(() => undefined);
    return operation.catch((error) => {
      totals.publishFailures += 1;
      reportError(error);
      throw error;
    }).finally(() => {
      queuedPublishes = Math.max(0, queuedPublishes - 1);
    });
  }

  async function runReadLoop() {
    readerRunning = true;
    readerHealthy = true;
    let readPending = true;
    try {
      while (!closed && !fatal && listener !== null) {
        try {
          const result = await clients.reader.xreadgroup(
            groupName,
            consumerName,
            {[streamKey]: readPending ? "0-0" : ">"},
            {
              count: readBatchSize,
              ...(readPending ? {} : {block: readBlockMs}),
            },
          );
          if (closed || fatal || listener === null) {
            break;
          }
          readerHealthy = true;
          const entries = streamEntries(result, streamKey);
          if (entries.length === 0) {
            if (readPending) {
              readPending = false;
            }
            continue;
          }
          let retryPending = false;
          for (const entry of entries) {
            if (closed || fatal || listener === null) {
              retryPending = true;
              break;
            }
            const delivered = await deliverEntry(entry);
            if (!delivered) {
              retryPending = true;
              break;
            }
          }
          if (retryPending) {
            readPending = true;
            totals.deliveryRetries += 1;
            await sleep(retryDelayMs);
          }
        } catch (error) {
          if (closed || fatal || listener === null) {
            break;
          }
          readerHealthy = false;
          totals.readFailures += 1;
          reportError(runtimeError(
            String(error && error.code || "cluster_valkey_read_failed"),
            "Valkey cluster stream read failed",
            error,
          ));
          await sleep(retryDelayMs);
        }
      }
    } finally {
      readerRunning = false;
      readerHealthy = false;
    }
  }

  async function deliverEntry(entry) {
    if (!entry || !STREAM_ID_PATTERN.test(entry.id)) {
      markFatal(runtimeError(
        "cluster_valkey_stream_id_invalid",
        "Valkey cluster stream id is invalid",
      ));
      return false;
    }
    if (entry.fields === null) {
      markFatal(runtimeError(
        "cluster_valkey_replay_window_exhausted",
        "Valkey cluster replay entry was trimmed before acknowledgement",
      ));
      return false;
    }
    const payload = envelopeField(entry.fields, maxEnvelopeBytes);
    if (!payload.ok) {
      totals.invalidDropped += 1;
      reportError(payload.error);
      await acknowledge(entry.id);
      return true;
    }
    let envelope;
    try {
      envelope = JSON.parse(payload.value);
    } catch (error) {
      totals.invalidDropped += 1;
      reportError(runtimeError(
        "cluster_valkey_envelope_json_invalid",
        "Valkey cluster envelope JSON is invalid",
        error,
      ));
      await acknowledge(entry.id);
      return true;
    }
    if (!plainRecord(envelope)) {
      totals.invalidDropped += 1;
      reportError(runtimeError(
        "cluster_valkey_envelope_invalid",
        "Valkey cluster envelope is invalid",
      ));
      await acknowledge(entry.id);
      return true;
    }
    const validated = validateClusterEventEnvelope(envelope, maxEventBytes);
    if (!validated.ok) {
      totals.invalidDropped += 1;
      reportError(validated.error);
      await acknowledge(entry.id);
      return true;
    }
    totals.received += 1;
    let accepted;
    try {
      accepted = await Promise.resolve(listener(validated.envelope));
    } catch (error) {
      reportError(runtimeError(
        "cluster_valkey_delivery_failed",
        "Valkey cluster envelope delivery failed",
        error,
      ));
      return false;
    }
    if (accepted === false) {
      return false;
    }
    await acknowledge(entry.id);
    return true;
  }

  async function acknowledge(entryId) {
    const count = Number(await clients.reader.xack(streamKey, groupName, [entryId]));
    if (count !== 1) {
      throw runtimeError(
        "cluster_valkey_ack_failed",
        "Valkey cluster envelope acknowledgement failed",
      );
    }
    totals.acknowledged += 1;
  }

  async function acquireLease() {
    const result = await clients.control.customCommand([
      "SET",
      leaseKey,
      leaseToken,
      "NX",
      "PX",
      String(leaseMs),
    ]);
    if (textValue(result).toUpperCase() !== "OK") {
      throw configurationError(
        "cluster_valkey_node_lease_conflict",
        "Valkey cluster node id is already leased",
      );
    }
    leaseHeld = true;
    lastLeaseConfirmedAtMs = finiteNow(now());
  }

  async function ensureConsumerGroup() {
    try {
      await clients.reader.xgroupCreate(streamKey, groupName, "$", {mkStream: true});
    } catch (error) {
      if (!isBusyGroupError(error)) {
        throw error;
      }
    }
  }

  async function assertReplayWindowIntact() {
    const groups = await clients.reader.xinfoGroups(streamKey);
    const group = Array.isArray(groups)
      ? groups.find((entry) => plainRecord(entry) && textValue(entry.name) === groupName)
      : null;
    if (!group) {
      throw configurationError(
        "cluster_valkey_consumer_group_missing",
        "Valkey cluster consumer group is missing",
      );
    }
    if (Object.hasOwn(group, "lag") && group.lag === null) {
      throw configurationError(
        "cluster_valkey_replay_gap_detected",
        "Valkey cluster replay window contains a trimmed delivery gap",
      );
    }
  }

  async function releaseLease() {
    if (!leaseHeld) {
      return;
    }
    try {
      await clients.control.customCommand([
        "EVAL",
        RELEASE_LEASE_SCRIPT,
        "1",
        leaseKey,
        leaseToken,
      ]);
    } finally {
      leaseHeld = false;
    }
  }

  function scheduleLeaseRenewal() {
    if (closed || fatal) {
      return;
    }
    const intervalMs = Math.max(1000, Math.floor(leaseMs / 3));
    leaseTimer = setTimeout(() => {
      leaseTimer = null;
      void renewLease().finally(() => scheduleLeaseRenewal());
    }, intervalMs);
    if (leaseTimer && typeof leaseTimer.unref === "function") {
      leaseTimer.unref();
    }
  }

  async function renewLease() {
    if (closed || fatal || leaseRenewing) {
      return;
    }
    leaseRenewing = true;
    try {
      const result = await clients.control.customCommand([
        "EVAL",
        RENEW_LEASE_SCRIPT,
        "1",
        leaseKey,
        leaseToken,
        String(leaseMs),
      ]);
      if (Number(result) !== 1) {
        leaseHeld = false;
        totals.leaseFailures += 1;
        markFatal(runtimeError(
          "cluster_valkey_node_lease_lost",
          "Valkey cluster node lease was lost",
        ));
        return;
      }
      leaseHeld = true;
      lastLeaseConfirmedAtMs = finiteNow(now());
      totals.leaseRenewals += 1;
    } catch (error) {
      totals.leaseFailures += 1;
      reportError(runtimeError(
        String(error && error.code || "cluster_valkey_lease_renew_failed"),
        "Valkey cluster node lease renewal failed",
        error,
      ));
      if (finiteNow(now()) - lastLeaseConfirmedAtMs >= leaseMs) {
        leaseHeld = false;
        markFatal(runtimeError(
          "cluster_valkey_node_lease_expired",
          "Valkey cluster node lease expired",
          error,
        ));
      }
    } finally {
      leaseRenewing = false;
    }
  }

  function publishReady() {
    if (closed || fatal || !leaseHeld) {
      return false;
    }
    if (finiteNow(now()) - lastLeaseConfirmedAtMs >= leaseMs) {
      leaseHeld = false;
      markFatal(runtimeError(
        "cluster_valkey_node_lease_expired",
        "Valkey cluster node lease expired",
      ));
      return false;
    }
    return true;
  }

  function markFatal(error) {
    if (fatal) {
      return;
    }
    fatal = true;
    readerHealthy = false;
    reportError(error);
    if (!fatalNotified) {
      fatalNotified = true;
      try {
        onFatal(error);
      } catch {
        // A fatal observer must not hide the bridge state transition.
      }
    }
  }

  function reportError(error) {
    try {
      onError(error);
    } catch {
      // Metrics and readiness remain authoritative if an observer fails.
    }
  }

  function close() {
    if (closePromise !== null) {
      return closePromise;
    }
    closed = true;
    listener = null;
    readerHealthy = false;
    if (leaseTimer !== null) {
      clearTimeout(leaseTimer);
      leaseTimer = null;
    }
    closePromise = (async () => {
      await publishTail.catch(() => undefined);
      if (leaseHeld) {
        try {
          await releaseLease();
        } catch (error) {
          reportError(runtimeError(
            "cluster_valkey_lease_release_failed",
            "Valkey cluster node lease release failed",
            error,
          ));
        }
      }
      closeClientSet(clients);
      if (readLoopPromise !== null) {
        await readLoopPromise.catch(() => undefined);
      }
    })();
    return closePromise;
  }

  function health() {
    const leaseFresh = leaseHeld
      && finiteNow(now()) - lastLeaseConfirmedAtMs < leaseMs;
    return Object.freeze({
      ok: !closed && !fatal && leaseFresh && readerHealthy,
      closed,
      fatal,
      leaseHeld: leaseFresh,
      readerRunning,
      readerHealthy,
      queuedPublishes,
    });
  }

  async function nodeLeaseState(nodeIdValue) {
    const targetNodeId = canonicalNodeId(nodeIdValue);
    if (targetNodeId === "") {
      throw runtimeError(
        "cluster_valkey_node_lease_target_invalid",
        "Valkey cluster node lease target is invalid",
      );
    }
    if (targetNodeId === nodeId) {
      const current = health();
      return Object.freeze({
        known: true,
        alive: current.leaseHeld === true,
        ttlMs: current.leaseHeld === true
          ? Math.max(0, leaseMs - (finiteNow(now()) - lastLeaseConfirmedAtMs))
          : 0,
      });
    }
    if (closed || fatal) {
      throw runtimeError(
        "cluster_valkey_node_lease_unavailable",
        "Valkey cluster node lease lookup is unavailable",
      );
    }
    try {
      const ttlMs = Number(await clients.control.customCommand([
        "PTTL",
        `${leasePrefix}:${targetNodeId}`,
      ]));
      if (ttlMs === -2) {
        return Object.freeze({known: true, alive: false, ttlMs: 0});
      }
      if (Number.isFinite(ttlMs) && ttlMs > 0) {
        return Object.freeze({known: true, alive: true, ttlMs: Math.floor(ttlMs)});
      }
      throw runtimeError(
        "cluster_valkey_node_lease_invalid",
        "Valkey cluster node lease has no bounded expiry",
      );
    } catch (error) {
      const failure = String(error && error.code || "") === "cluster_valkey_node_lease_invalid"
        ? error
        : runtimeError(
          "cluster_valkey_node_lease_lookup_failed",
          "Valkey cluster node lease lookup failed",
          error,
        );
      reportError(failure);
      throw failure;
    }
  }

  function metrics() {
    return Object.freeze({
      ...health(),
      ...totals,
    });
  }

  return Object.freeze({
    capabilities: REQUIRED_CLUSTER_EVENT_CAPABILITIES,
    publish,
    subscribe,
    close,
    health,
    nodeLeaseState,
    metrics,
  });
}

async function createClientSet(options, nodeId) {
  if (options.clients) {
    return options.clients;
  }
  const connection = plainRecord(options.connection) ? options.connection : {};
  const host = String(connection.host || "").trim();
  const port = boundedInteger(connection.port, 6379, 1, 65535);
  if (host === "") {
    throw configurationError(
      "cluster_valkey_host_required",
      "Valkey cluster host is required",
    );
  }
  const requestTimeout = boundedInteger(
    connection.requestTimeoutMs,
    DEFAULT_REQUEST_TIMEOUT_MS,
    250,
    30000,
  );
  const createClient = typeof options.createClient === "function"
    ? options.createClient
    : defaultGlideClientFactory;
  const base = {
    addresses: [{host, port}],
    useTLS: connection.useTLS === true,
    databaseId: boundedInteger(connection.databaseId, 0, 0, 15),
    requestTimeout,
    ...(connection.username || connection.password ? {
      credentials: {
        ...(connection.username ? {username: String(connection.username)} : {}),
        ...(connection.password ? {password: String(connection.password)} : {}),
      },
    } : {}),
  };
  const created = [];
  try {
    const writer = await createClient({...base, clientName: `beastbound-${nodeId}-event-writer`});
    created.push(writer);
    const reader = await createClient({...base, clientName: `beastbound-${nodeId}-event-reader`});
    created.push(reader);
    const control = await createClient({...base, clientName: `beastbound-${nodeId}-event-control`});
    created.push(control);
    return {writer, reader, control};
  } catch (error) {
    for (const client of created) {
      closeClient(client);
    }
    throw configurationError(
      "cluster_valkey_connect_failed",
      "Valkey cluster connection failed",
      error,
    );
  }
}

async function defaultGlideClientFactory(configuration) {
  const {GlideClient} = require("@valkey/valkey-glide");
  return GlideClient.createClient(configuration);
}

function assertClientSet(clients) {
  if (
    !clients
    || !clients.writer
    || typeof clients.writer.xadd !== "function"
    || !clients.reader
    || typeof clients.reader.xgroupCreate !== "function"
    || typeof clients.reader.xinfoGroups !== "function"
    || typeof clients.reader.xreadgroup !== "function"
    || typeof clients.reader.xack !== "function"
    || !clients.control
    || typeof clients.control.customCommand !== "function"
  ) {
    throw configurationError(
      "cluster_valkey_clients_invalid",
      "Valkey cluster clients are invalid",
    );
  }
}

function closeClientSet(clients) {
  const unique = new Set([clients && clients.reader, clients && clients.writer, clients && clients.control]);
  for (const client of unique) {
    closeClient(client);
  }
}

function closeClient(client) {
  try {
    if (client && typeof client.close === "function") {
      client.close();
    }
  } catch {
    // Closing the remaining clients is more important than one close error.
  }
}

function streamEntries(result, streamKey) {
  const stream = glideRecordEntries(result).find(([key]) => textValue(key) === streamKey);
  if (!stream) {
    return [];
  }
  return glideRecordEntries(stream[1]).map(([id, fields]) => ({
    id: textValue(id),
    fields: fields === null ? null : fields,
  }));
}

function glideRecordEntries(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => (
      plainRecord(entry) && Object.hasOwn(entry, "key") && Object.hasOwn(entry, "value")
        ? [[entry.key, entry.value]]
        : []
    ));
  }
  return plainRecord(value) ? Object.entries(value) : [];
}

function envelopeField(fields, maxEnvelopeBytes) {
  if (!Array.isArray(fields)) {
    return {
      ok: false,
      error: runtimeError(
        "cluster_valkey_fields_invalid",
        "Valkey cluster stream fields are invalid",
      ),
    };
  }
  const matches = fields.filter((pair) => (
    Array.isArray(pair) && pair.length === 2 && textValue(pair[0]) === "envelope"
  ));
  if (matches.length !== 1) {
    return {
      ok: false,
      error: runtimeError(
        "cluster_valkey_envelope_field_invalid",
        "Valkey cluster envelope field is invalid",
      ),
    };
  }
  const value = textValue(matches[0][1]);
  if (value === "" || Buffer.byteLength(value) > maxEnvelopeBytes) {
    return {
      ok: false,
      error: runtimeError(
        "cluster_valkey_envelope_field_invalid",
        "Valkey cluster envelope field is invalid",
      ),
    };
  }
  return {ok: true, value};
}

function serializeEnvelope(value, maxBytes) {
  if (!plainRecord(value)) {
    return {
      ok: false,
      error: runtimeError(
        "cluster_valkey_envelope_invalid",
        "Valkey cluster envelope is invalid",
      ),
    };
  }
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string" || Buffer.byteLength(serialized) > maxBytes) {
      return {
        ok: false,
        error: runtimeError(
          "cluster_valkey_envelope_too_large",
          "Valkey cluster envelope exceeds byte budget",
        ),
      };
    }
    return {ok: true, value: serialized};
  } catch (error) {
    return {
      ok: false,
      error: runtimeError(
        "cluster_valkey_envelope_invalid",
        "Valkey cluster envelope is invalid",
        error,
      ),
    };
  }
}

function isBusyGroupError(error) {
  const text = `${String(error && error.code || "")} ${String(error && error.message || "")}`;
  return text.includes("BUSYGROUP");
}

function normalizeConfigurationFailure(error) {
  if (error && String(error.code || "").startsWith("cluster_valkey_")) {
    return error;
  }
  return configurationError(
    "cluster_valkey_initialize_failed",
    "Valkey cluster bridge initialization failed",
    error,
  );
}

function canonicalNodeId(value) {
  const text = String(value || "").trim();
  return NODE_ID_PATTERN.test(text) ? text : "";
}

function canonicalLeaseToken(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_-]{16,128}$/.test(text) ? text : "";
}

function canonicalKey(value, fallback) {
  const text = String(value || fallback).trim();
  if (!KEY_COMPONENT_PATTERN.test(text)) {
    throw configurationError(
      "cluster_valkey_key_invalid",
      "Valkey cluster key is invalid",
    );
  }
  return text;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, number));
}

function textValue(value) {
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  return value === null || value === undefined ? "" : String(value);
}

function finiteNow(value) {
  value = Number(value);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : Date.now();
}

function plainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  DEFAULT_STREAM_KEY,
  createValkeyStreamEventBridge,
};
