"use strict";

const {isDeepStrictEqual} = require("node:util");

const AUTHORITY_RECORD_JOURNAL_MAX_DEPTH = 1024;
const TRACKED_AUTHORITY_RECORD_BUCKETS = Object.freeze([
  "accounts",
  "sessions",
  "profileBindings",
  "accountCharacterSlots",
  "profiles",
  "marketListings",
]);
const TRACKED_AUTHORITY_RECORD_BUCKET_SET = new Set(TRACKED_AUTHORITY_RECORD_BUCKETS);
const RECORD_STATE_BY_CONTAINER = new WeakMap();
const RECORD_METRICS_BY_CONTAINER = new WeakMap();
const RECORD_PROXY_TARGETS = new WeakMap();
const TRACKED_RECORD_PROXIES = new WeakSet();
const CERTIFIED_RECORD_CONTAINERS = new WeakSet();
const DESCENDS_FROM_CERTIFIED_CONTAINER = new WeakSet();
const DIAGNOSTICS = {
  certifiedContainers: 0,
  clonedContainers: 0,
  deltaFallbacks: 0,
  deltaHits: 0,
  journalCheckpoints: 0,
  plannerCheckpointFallbacks: 0,
  plannerFullDiffScans: 0,
  trackedMutations: 0,
};
const DIAGNOSTICS_BY_BUCKET = new Map();

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTrackedAuthorityRecordBucket(bucketValue) {
  return TRACKED_AUTHORITY_RECORD_BUCKET_SET.has(String(bucketValue || ""));
}

function isTrackedAuthorityRecordContainer(container, bucketValue) {
  const state = RECORD_STATE_BY_CONTAINER.get(container);
  return Boolean(state)
    && state.bucket === String(bucketValue || "")
    && TRACKED_RECORD_PROXIES.has(container);
}

function bucketDiagnostics(bucketValue) {
  const bucket = String(bucketValue || "");
  let diagnostics = DIAGNOSTICS_BY_BUCKET.get(bucket);
  if (!diagnostics) {
    diagnostics = {
      deltaFallbacks: 0,
      deltaHits: 0,
      journalCheckpoints: 0,
      plannerCheckpointFallbacks: 0,
      plannerFullDiffScans: 0,
      trackedMutations: 0,
    };
    DIAGNOSTICS_BY_BUCKET.set(bucket, diagnostics);
  }
  return diagnostics;
}

function baseRecordState(container, bucketValue) {
  const bucket = String(bucketValue || "");
  const existing = RECORD_STATE_BY_CONTAINER.get(container);
  if (existing && existing.bucket === bucket) {
    return existing;
  }
  const state = {
    bucket,
    change: null,
    depth: 0,
    parent: null,
    revision: 0,
    rootToken: {},
    segment: 0,
  };
  RECORD_STATE_BY_CONTAINER.set(container, state);
  return state;
}

function copyRecordMetrics(source, target) {
  const metrics = RECORD_METRICS_BY_CONTAINER.get(source);
  if (metrics) {
    RECORD_METRICS_BY_CONTAINER.set(target, metrics);
  }
}

function adoptAuthorityRecordClone(sourceValue, clonedValue, bucketValue) {
  const bucket = String(bucketValue || "");
  const source = isRecord(sourceValue) ? sourceValue : {};
  const cloned = isRecord(clonedValue) ? clonedValue : {};
  if (!isTrackedAuthorityRecordBucket(bucket)) {
    return cloned;
  }
  const inheritedState = baseRecordState(source, bucket);
  let proxy;
  const handler = {
    set(target, property, value) {
      if (typeof property !== "string") {
        return Reflect.set(target, property, value, target);
      }
      const beforeExists = Object.hasOwn(target, property);
      const before = beforeExists ? target[property] : undefined;
      const changed = Reflect.set(target, property, value, target);
      if (changed) {
        noteRecordMutation(proxy, bucket, property, beforeExists, before, true, value);
      }
      return changed;
    },
    deleteProperty(target, property) {
      if (typeof property !== "string") {
        return Reflect.deleteProperty(target, property);
      }
      const beforeExists = Object.hasOwn(target, property);
      const before = beforeExists ? target[property] : undefined;
      const changed = Reflect.deleteProperty(target, property);
      if (changed && beforeExists) {
        noteRecordMutation(proxy, bucket, property, true, before, false, undefined);
      }
      return changed;
    },
    defineProperty(target, property, descriptor) {
      if (typeof property !== "string") {
        return Reflect.defineProperty(target, property, descriptor);
      }
      const beforeExists = Object.hasOwn(target, property);
      const before = beforeExists ? target[property] : undefined;
      const changed = Reflect.defineProperty(target, property, descriptor);
      const afterExists = Object.hasOwn(target, property);
      const after = afterExists ? target[property] : undefined;
      if (
        changed
        && (beforeExists !== afterExists || !Object.is(before, after))
      ) {
        noteRecordMutation(proxy, bucket, property, beforeExists, before, afterExists, after);
      }
      return changed;
    },
  };
  proxy = new Proxy(cloned, handler);
  RECORD_PROXY_TARGETS.set(proxy, cloned);
  RECORD_STATE_BY_CONTAINER.set(proxy, inheritedState);
  TRACKED_RECORD_PROXIES.add(proxy);
  if (CERTIFIED_RECORD_CONTAINERS.has(source) || DESCENDS_FROM_CERTIFIED_CONTAINER.has(source)) {
    DESCENDS_FROM_CERTIFIED_CONTAINER.add(proxy);
  }
  copyRecordMetrics(source, proxy);
  DIAGNOSTICS.clonedContainers += 1;
  return proxy;
}

function materializeAuthorityRecordContainer(container, bucketValue) {
  const bucket = String(bucketValue || "");
  const target = RECORD_PROXY_TARGETS.get(container);
  if (!target || !isTrackedAuthorityRecordBucket(bucket)) {
    return container;
  }
  const state = RECORD_STATE_BY_CONTAINER.get(container);
  if (state && state.bucket === bucket) {
    RECORD_STATE_BY_CONTAINER.set(target, state);
  }
  copyRecordMetrics(container, target);
  if (CERTIFIED_RECORD_CONTAINERS.has(container)) {
    CERTIFIED_RECORD_CONTAINERS.add(target);
  }
  if (DESCENDS_FROM_CERTIFIED_CONTAINER.has(container)) {
    DESCENDS_FROM_CERTIFIED_CONTAINER.add(target);
  }
  return target;
}

function cloneAuthorityRecordContainer(sourceValue, bucketValue) {
  const source = isRecord(sourceValue) ? sourceValue : {};
  return adoptAuthorityRecordClone(source, {...source}, bucketValue);
}

function noteRecordMutation(
  container,
  bucketValue,
  recordIdValue,
  beforeExists,
  before,
  afterExists,
  after,
) {
  const bucket = String(bucketValue || "");
  const recordId = String(recordIdValue || "");
  if (!isTrackedAuthorityRecordBucket(bucket) || recordId === "") {
    return;
  }
  if (beforeExists === afterExists && Object.is(before, after)) {
    return;
  }
  const current = baseRecordState(container, bucket);
  let next;
  if (current.depth >= AUTHORITY_RECORD_JOURNAL_MAX_DEPTH) {
    next = {
      bucket,
      change: null,
      depth: 0,
      parent: null,
      revision: 0,
      rootToken: current.rootToken,
      segment: current.segment + 1,
    };
    DIAGNOSTICS.journalCheckpoints += 1;
    bucketDiagnostics(bucket).journalCheckpoints += 1;
  } else {
    next = {
      bucket,
      change: {
        after,
        afterExists,
        before,
        beforeExists,
        recordId,
      },
      depth: current.depth + 1,
      parent: current,
      revision: current.revision + 1,
      rootToken: current.rootToken,
      segment: current.segment,
    };
  }
  RECORD_STATE_BY_CONTAINER.set(container, next);
  updateRecordMetrics(container, bucket, beforeExists, before, afterExists, after);
  DIAGNOSTICS.trackedMutations += 1;
  bucketDiagnostics(bucket).trackedMutations += 1;
}

function updateRecordMetrics(container, bucket, beforeExists, before, afterExists, after) {
  const current = RECORD_METRICS_BY_CONTAINER.get(container);
  if (!current) {
    return;
  }
  const recordCount = current.recordCount + Number(afterExists) - Number(beforeExists);
  if (bucket !== "marketListings") {
    RECORD_METRICS_BY_CONTAINER.set(container, Object.freeze({bucket, recordCount}));
    return;
  }
  const sellerAccountCounts = new Map(current.sellerAccountCounts || []);
  if (beforeExists) {
    adjustGroupCount(sellerAccountCounts, String(before && before.sellerAccountId || ""), -1);
  }
  if (afterExists) {
    adjustGroupCount(sellerAccountCounts, String(after && after.sellerAccountId || ""), 1);
  }
  RECORD_METRICS_BY_CONTAINER.set(container, Object.freeze({
    bucket,
    recordCount,
    sellerAccountCounts,
  }));
}

function adjustGroupCount(counts, key, delta) {
  if (key === "") {
    return;
  }
  const next = Number(counts.get(key) || 0) + delta;
  if (next <= 0) {
    counts.delete(key);
  } else {
    counts.set(key, next);
  }
}

function certifyAuthorityRecordContainer(container, bucketValue, options = {}) {
  const bucket = String(bucketValue || "");
  if (!isTrackedAuthorityRecordBucket(bucket) || !isRecord(container)) {
    return false;
  }
  baseRecordState(container, bucket);
  if (!CERTIFIED_RECORD_CONTAINERS.has(container)) {
    DIAGNOSTICS.certifiedContainers += 1;
  }
  CERTIFIED_RECORD_CONTAINERS.add(container);
  const recordCount = Number(options.recordCount);
  if (Number.isSafeInteger(recordCount) && recordCount >= 0) {
    if (bucket === "marketListings") {
      const sourceCounts = options.sellerAccountCounts instanceof Map
        ? options.sellerAccountCounts
        : new Map();
      RECORD_METRICS_BY_CONTAINER.set(container, Object.freeze({
        bucket,
        recordCount,
        sellerAccountCounts: new Map(sourceCounts),
      }));
    } else {
      RECORD_METRICS_BY_CONTAINER.set(container, Object.freeze({bucket, recordCount}));
    }
  }
  return true;
}

function authorityRecordDeltaFrom(previousValue, nextValue, bucketValue) {
  const bucket = String(bucketValue || "");
  const previous = isRecord(previousValue) ? previousValue : null;
  const next = isRecord(nextValue) ? nextValue : null;
  if (!previous || !next || !isTrackedAuthorityRecordBucket(bucket)) {
    return recordDeltaFallback(bucket, "invalid_container");
  }
  if (previous === next) {
    DIAGNOSTICS.deltaHits += 1;
    bucketDiagnostics(bucket).deltaHits += 1;
    return {ok: true, changes: [], reason: "same_container"};
  }
  const previousState = RECORD_STATE_BY_CONTAINER.get(previous);
  const nextState = RECORD_STATE_BY_CONTAINER.get(next);
  if (
    !previousState
    || !nextState
    || previousState.bucket !== bucket
    || nextState.bucket !== bucket
    || !CERTIFIED_RECORD_CONTAINERS.has(previous)
    || (!TRACKED_RECORD_PROXIES.has(next) && !CERTIFIED_RECORD_CONTAINERS.has(next))
    || (
      !CERTIFIED_RECORD_CONTAINERS.has(next)
      && !DESCENDS_FROM_CERTIFIED_CONTAINER.has(next)
    )
  ) {
    return recordDeltaFallback(bucket, "uncertified_lineage");
  }
  if (previousState.rootToken !== nextState.rootToken) {
    return recordDeltaFallback(bucket, "lineage_mismatch");
  }
  if (previousState.segment !== nextState.segment) {
    DIAGNOSTICS.plannerCheckpointFallbacks += 1;
    bucketDiagnostics(bucket).plannerCheckpointFallbacks += 1;
    return recordDeltaFallback(bucket, "checkpoint");
  }
  const reversed = [];
  let cursor = nextState;
  while (cursor !== previousState && cursor !== null) {
    if (cursor.change !== null) {
      reversed.push(cursor.change);
    }
    cursor = cursor.parent;
  }
  if (cursor !== previousState) {
    return recordDeltaFallback(bucket, "branch_mismatch");
  }
  const chronological = reversed.reverse();
  const recordedById = new Map();
  for (const change of chronological) {
    const existing = recordedById.get(change.recordId);
    if (!existing) {
      recordedById.set(change.recordId, {...change});
      continue;
    }
    if (
      existing.afterExists !== change.beforeExists
      || (existing.afterExists && !isDeepStrictEqual(existing.after, change.before))
    ) {
      return recordDeltaFallback(bucket, "journal_discontinuity");
    }
    existing.afterExists = change.afterExists;
    existing.after = change.after;
  }
  const changes = [];
  for (const recordId of Array.from(recordedById.keys()).sort(compareCanonicalIds)) {
    const recorded = recordedById.get(recordId);
    const beforeExists = Object.hasOwn(previous, recordId);
    const afterExists = Object.hasOwn(next, recordId);
    const before = beforeExists ? previous[recordId] : undefined;
    const after = afterExists ? next[recordId] : undefined;
    if (
      beforeExists !== recorded.beforeExists
      || afterExists !== recorded.afterExists
      || (beforeExists && !isDeepStrictEqual(before, recorded.before))
      || (afterExists && !isDeepStrictEqual(after, recorded.after))
    ) {
      return recordDeltaFallback(bucket, "journal_value_mismatch");
    }
    if (beforeExists === afterExists && (!beforeExists || !entityChanged(before, after))) {
      continue;
    }
    changes.push({
      after: afterExists ? after : null,
      before: beforeExists ? before : null,
      disposition: !beforeExists ? "insert" : !afterExists ? "delete" : "update",
      recordId,
    });
  }
  DIAGNOSTICS.deltaHits += 1;
  bucketDiagnostics(bucket).deltaHits += 1;
  return {ok: true, changes, reason: "journal"};
}

function recordDeltaFallback(bucket, reason) {
  DIAGNOSTICS.deltaFallbacks += 1;
  bucketDiagnostics(bucket).deltaFallbacks += 1;
  return {ok: false, changes: [], reason};
}

function authorityRecordCollectionMetrics(container, bucketValue) {
  const bucket = String(bucketValue || "");
  const metrics = RECORD_METRICS_BY_CONTAINER.get(container);
  if (
    !metrics
    || metrics.bucket !== bucket
    || !isTrackedAuthorityRecordBucket(bucket)
  ) {
    return null;
  }
  return {
    recordCount: metrics.recordCount,
    sellerAccountCount(accountIdValue) {
      if (bucket !== "marketListings") {
        return 0;
      }
      return Number(metrics.sellerAccountCounts.get(String(accountIdValue || "")) || 0);
    },
  };
}

function noteAuthorityRecordPlannerFullDiff(bucketValue, reasonValue) {
  const bucket = String(bucketValue || "");
  const reason = String(reasonValue || "fallback");
  DIAGNOSTICS.plannerFullDiffScans += 1;
  bucketDiagnostics(bucket).plannerFullDiffScans += 1;
  if (reason === "checkpoint") {
    // checkpoint fallbacks are already counted when the journal relation is
    // inspected; this branch deliberately does not double count them.
  }
}

function authorityRecordStateDiagnostics() {
  const byBucket = {};
  for (const bucket of Array.from(DIAGNOSTICS_BY_BUCKET.keys()).sort(compareCanonicalIds)) {
    byBucket[bucket] = {...DIAGNOSTICS_BY_BUCKET.get(bucket)};
  }
  return {
    ...DIAGNOSTICS,
    byBucket,
    journalMaxDepth: AUTHORITY_RECORD_JOURNAL_MAX_DEPTH,
  };
}

function entityChanged(previous, next) {
  return previous !== next && !isDeepStrictEqual(previous, next);
}

function compareCanonicalIds(leftValue, rightValue) {
  const left = String(leftValue || "");
  const right = String(rightValue || "");
  return left < right ? -1 : left > right ? 1 : 0;
}

module.exports = {
  AUTHORITY_RECORD_JOURNAL_MAX_DEPTH,
  TRACKED_AUTHORITY_RECORD_BUCKETS,
  adoptAuthorityRecordClone,
  authorityRecordCollectionMetrics,
  authorityRecordDeltaFrom,
  authorityRecordStateDiagnostics,
  certifyAuthorityRecordContainer,
  cloneAuthorityRecordContainer,
  isTrackedAuthorityRecordBucket,
  isTrackedAuthorityRecordContainer,
  materializeAuthorityRecordContainer,
  noteAuthorityRecordPlannerFullDiff,
};
