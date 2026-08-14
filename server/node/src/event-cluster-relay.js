"use strict";

const crypto = require("node:crypto");

const CLUSTER_EVENT_ENVELOPE_SCHEMA_VERSION = 1;
const DEFAULT_MAX_CLUSTER_EVENT_BYTES = 1024 * 1024;
const DEFAULT_MAX_DEDUP_ENTRIES = 32 * 1024;
const DEFAULT_PUBLISH_TIMEOUT_MS = 2000;
const NODE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ORIGIN_EPOCH_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const EVENT_TYPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const REQUIRED_CLUSTER_EVENT_CAPABILITIES = Object.freeze({
  schemaVersion: 1,
  delivery: "at_least_once",
  replay: "bounded",
  ordering: "per_origin",
  sessionRouting: "account_sticky",
});

function createEventClusterRelay(options = {}) {
  const bridge = options.bridge || null;
  const required = options.required === true;
  if (!bridge) {
    if (required) {
      throw clusterConfigurationError(
        "cluster_event_bridge_required",
        "cluster event bridge is required",
      );
    }
    return disabledRelay();
  }
  assertClusterBridge(bridge);
  const capabilities = normalizeCapabilities(bridge.capabilities);
  assertRequiredCapabilities(capabilities);
  const nodeId = normalizeNodeId(options.nodeId);
  if (nodeId === "") {
    throw clusterConfigurationError(
      "cluster_node_id_required",
      "cluster node id is required",
    );
  }
  const randomBytes = typeof options.randomBytes === "function"
    ? options.randomBytes
    : crypto.randomBytes;
  const originEpoch = normalizeOriginEpoch(
    options.originEpoch || Buffer.from(randomBytes(18)).toString("base64url"),
  );
  if (originEpoch === "") {
    throw clusterConfigurationError(
      "cluster_origin_epoch_invalid",
      "cluster origin epoch is invalid",
    );
  }
  const now = typeof options.now === "function" ? options.now : Date.now;
  const onRemoteEvent = typeof options.onRemoteEvent === "function"
    ? options.onRemoteEvent
    : () => {};
  const onError = typeof options.onError === "function" ? options.onError : () => {};
  const maxEventBytes = positiveInteger(
    options.maxEventBytes,
    DEFAULT_MAX_CLUSTER_EVENT_BYTES,
  );
  const maxDedupEntries = positiveInteger(
    options.maxDedupEntries,
    DEFAULT_MAX_DEDUP_ENTRIES,
  );
  const publishTimeoutMs = positiveInteger(
    options.publishTimeoutMs,
    DEFAULT_PUBLISH_TIMEOUT_MS,
  );
  const seenEventIds = new Map();
  const pendingPublishes = new Set();
  const totals = {
    localAccepted: 0,
    localRejected: 0,
    publishAcknowledged: 0,
    publishFailures: 0,
    remoteReceived: 0,
    remoteDelivered: 0,
    remoteDuplicates: 0,
    remoteInvalid: 0,
    remoteSelfIgnored: 0,
  };
  let sequence = 0;
  let closed = false;
  let closePromise = null;
  let unsubscribe = null;

  try {
    unsubscribe = bridge.subscribe((envelope) => receive(envelope));
  } catch (error) {
    throw clusterConfigurationError(
      "cluster_event_subscribe_failed",
      "cluster event bridge subscription failed",
      error,
    );
  }
  if (typeof unsubscribe !== "function") {
    throw clusterConfigurationError(
      "cluster_event_unsubscribe_missing",
      "cluster event bridge must return an unsubscribe function",
    );
  }

  function publishLocal(event) {
    if (closed) {
      totals.localRejected += 1;
      return false;
    }
    const snapshot = snapshotEvent(event, maxEventBytes);
    if (!snapshot.ok) {
      totals.localRejected += 1;
      reportError(snapshot.error);
      return false;
    }
    sequence += 1;
    if (!Number.isSafeInteger(sequence) || sequence <= 0) {
      totals.localRejected += 1;
      reportError(clusterRuntimeError(
        "cluster_event_sequence_exhausted",
        "cluster event sequence exhausted",
      ));
      return false;
    }
    const envelope = Object.freeze({
      schemaVersion: CLUSTER_EVENT_ENVELOPE_SCHEMA_VERSION,
      originNodeId: nodeId,
      originEpoch,
      originSequence: sequence,
      eventId: clusterEventId(nodeId, originEpoch, sequence),
      publishedAtMs: finiteTimestamp(now()),
      event: snapshot.event,
    });
    totals.localAccepted += 1;
    try {
      trackPublish(bridge.publish(envelope));
      return true;
    } catch (error) {
      recordPublishFailure(error);
      return false;
    }
  }

  function trackPublish(result) {
    const pending = promiseWithTimeout(
      Promise.resolve(result),
      publishTimeoutMs,
      () => clusterRuntimeError(
        "cluster_event_publish_timeout",
        "cluster event publish timed out",
      ),
    ).then(
      () => {
        totals.publishAcknowledged += 1;
      },
      (error) => {
        recordPublishFailure(error);
      },
    );
    pendingPublishes.add(pending);
    pending.finally(() => pendingPublishes.delete(pending));
  }

  function recordPublishFailure(error) {
    totals.publishFailures += 1;
    reportError(clusterRuntimeError(
      String(error && error.code || "cluster_event_publish_failed"),
      "cluster event publish failed",
      error,
    ));
  }

  function receive(envelope) {
    if (closed) {
      return false;
    }
    totals.remoteReceived += 1;
    const validated = validateEnvelope(envelope, maxEventBytes);
    if (!validated.ok) {
      totals.remoteInvalid += 1;
      reportError(validated.error);
      return false;
    }
    if (
      validated.envelope.originNodeId === nodeId
      && validated.envelope.originEpoch === originEpoch
    ) {
      totals.remoteSelfIgnored += 1;
      return true;
    }
    const eventId = validated.envelope.eventId;
    if (seenEventIds.has(eventId)) {
      totals.remoteDuplicates += 1;
      return true;
    }
    rememberEventId(seenEventIds, eventId, maxDedupEntries);
    try {
      onRemoteEvent(validated.envelope.event, Object.freeze({
        eventId,
        originNodeId: validated.envelope.originNodeId,
        originEpoch: validated.envelope.originEpoch,
        originSequence: validated.envelope.originSequence,
        publishedAtMs: validated.envelope.publishedAtMs,
      }));
      totals.remoteDelivered += 1;
      return true;
    } catch (error) {
      seenEventIds.delete(eventId);
      reportError(clusterRuntimeError(
        "cluster_event_delivery_failed",
        "cluster event local delivery failed",
        error,
      ));
      return false;
    }
  }

  function reportError(error) {
    try {
      onError(error);
    } catch {
      // Metrics retain the failure; an observer must not crash the relay.
    }
  }

  function close() {
    if (closePromise !== null) {
      return closePromise;
    }
    closed = true;
    try {
      unsubscribe();
    } catch (error) {
      reportError(clusterRuntimeError(
        "cluster_event_unsubscribe_failed",
        "cluster event bridge unsubscribe failed",
        error,
      ));
    }
    unsubscribe = () => {};
    closePromise = Promise.allSettled(Array.from(pendingPublishes)).then(async () => {
      if (typeof bridge.close === "function") {
        await bridge.close();
      }
    }).then(() => undefined);
    return closePromise;
  }

  function metrics() {
    const bridgeHealth = safeBridgeHealth(bridge);
    return Object.freeze({
      enabled: true,
      required,
      closed,
      capabilitiesAccepted: true,
      runtimeHealthy: !closed && bridgeHealth.ok,
      bridgeHealthChecked: bridgeHealth.checked,
      bridgeLeaseHeld: bridgeHealth.leaseHeld,
      bridgeReaderRunning: bridgeHealth.readerRunning,
      bridgeReaderHealthy: bridgeHealth.readerHealthy,
      pendingPublishes: pendingPublishes.size,
      dedupEntries: seenEventIds.size,
      ...totals,
    });
  }

  return Object.freeze({
    enabled: true,
    publishLocal,
    receive,
    close,
    metrics,
  });
}

function safeBridgeHealth(bridge) {
  if (!bridge || typeof bridge.health !== "function") {
    return {
      checked: false,
      ok: true,
      leaseHeld: false,
      readerRunning: false,
      readerHealthy: false,
    };
  }
  try {
    const value = bridge.health();
    const source = plainRecord(value) ? value : {};
    return {
      checked: true,
      ok: source.ok === true,
      leaseHeld: source.leaseHeld === true,
      readerRunning: source.readerRunning === true,
      readerHealthy: source.readerHealthy === true,
    };
  } catch {
    return {
      checked: true,
      ok: false,
      leaseHeld: false,
      readerRunning: false,
      readerHealthy: false,
    };
  }
}

function disabledRelay() {
  const snapshot = Object.freeze({
    enabled: false,
    required: false,
    closed: false,
    capabilitiesAccepted: false,
  });
  return Object.freeze({
    enabled: false,
    publishLocal() { return false; },
    receive() { return false; },
    close() { return Promise.resolve(); },
    metrics() { return snapshot; },
  });
}

function assertClusterBridge(bridge) {
  if (
    !bridge
    || typeof bridge !== "object"
    || typeof bridge.publish !== "function"
    || typeof bridge.subscribe !== "function"
  ) {
    throw clusterConfigurationError(
      "cluster_event_bridge_invalid",
      "cluster event bridge must provide publish and subscribe",
    );
  }
}

function normalizeCapabilities(value) {
  const source = plainRecord(value) ? value : {};
  return {
    schemaVersion: Number(source.schemaVersion || 0),
    delivery: String(source.delivery || ""),
    replay: String(source.replay || ""),
    ordering: String(source.ordering || ""),
    sessionRouting: String(source.sessionRouting || ""),
  };
}

function assertRequiredCapabilities(actual) {
  for (const [key, expected] of Object.entries(REQUIRED_CLUSTER_EVENT_CAPABILITIES)) {
    if (actual[key] !== expected) {
      throw clusterConfigurationError(
        "cluster_event_capability_missing",
        `cluster event capability ${key}=${expected} is required`,
      );
    }
  }
}

function snapshotEvent(value, maxEventBytes) {
  if (!plainRecord(value) || !EVENT_TYPE_PATTERN.test(String(value.type || ""))) {
    return {
      ok: false,
      error: clusterRuntimeError("cluster_event_invalid", "cluster event is invalid"),
    };
  }
  if (!strictJsonData(value)) {
    return {
      ok: false,
      error: clusterRuntimeError("cluster_event_not_json", "cluster event must be JSON data"),
    };
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    return {
      ok: false,
      error: clusterRuntimeError("cluster_event_not_json", "cluster event must be JSON data", error),
    };
  }
  if (
    typeof serialized !== "string"
    || Buffer.byteLength(serialized) > maxEventBytes
  ) {
    return {
      ok: false,
      error: clusterRuntimeError("cluster_event_too_large", "cluster event exceeds byte budget"),
    };
  }
  try {
    return {ok: true, event: JSON.parse(serialized)};
  } catch (error) {
    return {
      ok: false,
      error: clusterRuntimeError("cluster_event_not_json", "cluster event must be JSON data", error),
    };
  }
}

function validateEnvelope(value, maxEventBytes) {
  if (!plainRecord(value)) {
    return invalidEnvelope("cluster_event_envelope_invalid");
  }
  const originNodeId = normalizeNodeId(value.originNodeId);
  const originEpoch = normalizeOriginEpoch(value.originEpoch);
  const originSequence = Number(value.originSequence || 0);
  const eventId = String(value.eventId || "");
  const publishedAtMs = finiteTimestamp(value.publishedAtMs);
  if (
    Number(value.schemaVersion) !== CLUSTER_EVENT_ENVELOPE_SCHEMA_VERSION
    || originNodeId === ""
    || originEpoch === ""
    || !Number.isSafeInteger(originSequence)
    || originSequence <= 0
    || eventId !== clusterEventId(originNodeId, originEpoch, originSequence)
    || publishedAtMs <= 0
  ) {
    return invalidEnvelope("cluster_event_envelope_invalid");
  }
  const snapshot = snapshotEvent(value.event, maxEventBytes);
  if (!snapshot.ok) {
    return {ok: false, error: snapshot.error};
  }
  return {
    ok: true,
    envelope: Object.freeze({
      schemaVersion: CLUSTER_EVENT_ENVELOPE_SCHEMA_VERSION,
      originNodeId,
      originEpoch,
      originSequence,
      eventId,
      publishedAtMs,
      event: snapshot.event,
    }),
  };
}

function validateClusterEventEnvelope(value, maxEventBytes = DEFAULT_MAX_CLUSTER_EVENT_BYTES) {
  return validateEnvelope(
    value,
    positiveInteger(maxEventBytes, DEFAULT_MAX_CLUSTER_EVENT_BYTES),
  );
}

function invalidEnvelope(code) {
  return {
    ok: false,
    error: clusterRuntimeError(code, "cluster event envelope is invalid"),
  };
}

function rememberEventId(index, eventId, limit) {
  index.set(eventId, true);
  while (index.size > limit) {
    const oldest = index.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    index.delete(oldest);
  }
}

function clusterEventId(nodeId, originEpoch, sequence) {
  return `${nodeId}:${originEpoch}:${sequence}`;
}

function normalizeNodeId(value) {
  const text = String(value || "").trim();
  return NODE_ID_PATTERN.test(text) ? text : "";
}

function normalizeOriginEpoch(value) {
  const text = String(value || "").trim();
  return ORIGIN_EPOCH_PATTERN.test(text) ? text : "";
}

function finiteTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number))
    : 0;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function plainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function strictJsonData(value, stack = new Set(), depth = 0) {
  if (value === null) {
    return true;
  }
  const type = typeof value;
  if (type === "number") {
    return Number.isFinite(value);
  }
  if (type === "string" || type === "boolean") {
    return true;
  }
  if (type !== "object" || depth > 64 || stack.has(value)) {
    return false;
  }
  if (
    Array.isArray(value)
      ? Object.getPrototypeOf(value) !== Array.prototype
      : !plainRecord(value)
  ) {
    return false;
  }
  if (Object.hasOwn(value, "toJSON")) {
    return false;
  }
  stack.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const descriptor of Object.values(descriptors)) {
      if (!descriptor.enumerable) {
        continue;
      }
      if (
        descriptor.get
        || descriptor.set
        || !strictJsonData(descriptor.value, stack, depth + 1)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  } finally {
    stack.delete(value);
  }
}

function promiseWithTimeout(promise, timeoutMs, timeoutError) {
  let timer = null;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(timeoutError()), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  });
}

function clusterConfigurationError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function clusterRuntimeError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

module.exports = {
  CLUSTER_EVENT_ENVELOPE_SCHEMA_VERSION,
  DEFAULT_MAX_CLUSTER_EVENT_BYTES,
  DEFAULT_MAX_DEDUP_ENTRIES,
  REQUIRED_CLUSTER_EVENT_CAPABILITIES,
  createEventClusterRelay,
  validateClusterEventEnvelope,
};
