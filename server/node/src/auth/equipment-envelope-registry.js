"use strict";

const {
  consumedEquipmentEnvelopeLedgerDelta,
  consumedEquipmentEnvelopeLedgerSignature,
  readConsumedEquipmentEnvelopeLedgerIndex,
  validEnvelopeId,
} = require("./equipment-envelope-consumed-ledger");
const {
  isCanonicalMailAuthorityState,
  mailAuthorityIncrementalJournal,
} = require("./mail-authority-state");

const EQUIPMENT_ENVELOPE_REGISTRY_SCHEMA_VERSION = 1;
const EQUIPMENT_OWNERSHIP_INDEX_CHECKPOINT_DEPTH = 1024;

const OWNER_KIND_BANK = "bank";
const OWNER_KIND_MAIL = "mail";
const OWNER_KIND_MARKET = "market";
const OWNER_KIND_MATERIALIZED = "materialized";
const OWNER_KIND_CONSUMED = "consumed";

const PROFILE_BUCKET = "profiles";
const MARKET_BUCKET = "marketListings";

const PROFILE_INDEX_BY_CONTAINER = new WeakMap();
const MARKET_INDEX_BY_CONTAINER = new WeakMap();
const MAIL_INDEX_BY_VIEW = new WeakMap();
const TRACKED_PROFILE_CONTAINERS = new WeakSet();
const TRACKED_MARKET_CONTAINERS = new WeakSet();
const ROOT_REGISTRY_CACHE = new WeakMap();
const ROOT_REGISTRY_INHERITANCE = new WeakMap();
const LAYERED_MAP_DELETED = Symbol("equipment_ownership_layered_map_deleted");

const REGISTRY_DIAGNOSTICS = {
  profileContainerScans: 0,
  marketContainerScans: 0,
  mailContainerScans: 0,
  profileRecordScans: 0,
  marketRecordScans: 0,
  mailRecordScans: 0,
  profileRecordUpdates: 0,
  marketRecordUpdates: 0,
  mailRecordUpdates: 0,
  inheritedRecordIndexes: 0,
  rootFullAggregations: 0,
  rootIncrementalAggregations: 0,
  rootCacheHits: 0,
  mailJournalFallbacks: 0,
  consumedTargetedRefreshes: 0,
  consumedFallbackRefreshes: 0,
  profileIndexCheckpoints: 0,
  marketIndexCheckpoints: 0,
  mailIndexCheckpoints: 0,
  aggregateCheckpoints: 0,
};

const EMPTY_SLICE = Object.freeze({
  ownerships: Object.freeze([]),
  traces: Object.freeze([]),
});

// Request candidates must not copy an index containing every untouched
// profile, mail, listing, or envelope merely to replace one record. This
// private overlay supports point reads/writes in the normal path. Explicit
// iteration materializes a snapshot and is reserved for startup/fallback,
// diagnostics, or the separately counted periodic checkpoint.
class LayeredMap {
  constructor(base) {
    let compactBase = base;
    while (compactBase instanceof LayeredMap && compactBase.changes.size === 0) {
      compactBase = compactBase.base;
    }
    this.base = compactBase;
    this.changes = new Map();
    this.depth = compactBase instanceof LayeredMap ? compactBase.depth + 1 : 1;
  }

  get(key) {
    if (this.changes.has(key)) {
      const value = this.changes.get(key);
      return value === LAYERED_MAP_DELETED ? undefined : value;
    }
    return this.base.get(key);
  }

  has(key) {
    if (this.changes.has(key)) {
      return this.changes.get(key) !== LAYERED_MAP_DELETED;
    }
    return this.base.has(key);
  }

  set(key, value) {
    this.changes.set(key, value);
    return this;
  }

  delete(key) {
    const existed = this.has(key);
    if (existed) {
      this.changes.set(key, LAYERED_MAP_DELETED);
    }
    return existed;
  }

  entries() {
    return materializeLayeredMap(this).entries();
  }

  keys() {
    return materializeLayeredMap(this).keys();
  }

  values() {
    return materializeLayeredMap(this).values();
  }

  [Symbol.iterator]() {
    return this.entries();
  }
}

function materializeLayeredMap(value) {
  if (!(value instanceof LayeredMap)) {
    return new Map(value);
  }
  const layers = [];
  let cursor = value;
  while (cursor instanceof LayeredMap) {
    layers.push(cursor.changes);
    cursor = cursor.base;
  }
  const materialized = new Map(cursor);
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    for (const [key, entry] of layers[index].entries()) {
      if (entry === LAYERED_MAP_DELETED) {
        materialized.delete(key);
      } else {
        materialized.set(key, entry);
      }
    }
  }
  return materialized;
}

function layeredMapForMutation(value, checkpoint) {
  return checkpoint ? materializeLayeredMap(value) : new LayeredMap(value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function objectEntries(value) {
  return Object.entries(isRecord(value) ? value : {});
}

function envelopeIdFrom(value) {
  return isRecord(value) && typeof value.envelopeId === "string"
    ? value.envelopeId.trim()
    : "";
}

function frozenEntry(value) {
  return Object.freeze(value);
}

function frozenSlice(ownerships, traces) {
  if (ownerships.length === 0 && traces.length === 0) {
    return EMPTY_SLICE;
  }
  ownerships.sort((left, right) => (
    left.envelopeId.localeCompare(right.envelopeId)
    || left.path.localeCompare(right.path)
  ));
  traces.sort((left, right) => left.path.localeCompare(right.path));
  return Object.freeze({
    ownerships: Object.freeze(ownerships),
    traces: Object.freeze(traces),
  });
}

function appendOwnership(target, envelopeId, kind, id, path, details = {}) {
  if (envelopeId === "") {
    return;
  }
  target.push(frozenEntry({
    envelopeId,
    kind,
    id,
    path,
    ...details,
    schemaVersion: EQUIPMENT_ENVELOPE_REGISTRY_SCHEMA_VERSION,
  }));
}

function appendOriginTrace(target, rawOriginEnvelopeId, path, details = {}, invalidReason = "") {
  target.push(frozenEntry({
    originEnvelopeId: rawOriginEnvelopeId,
    path,
    ...details,
    ...(invalidReason === "" ? {} : {invalidReason}),
    schemaVersion: EQUIPMENT_ENVELOPE_REGISTRY_SCHEMA_VERSION,
  }));
}

function appendEnvelopeOriginTrace(target, envelope, basePath, details = {}) {
  const state = isRecord(envelope) && isRecord(envelope.instanceState)
    ? envelope.instanceState
    : null;
  if (!state || !Object.hasOwn(state, "transferProvenance")) {
    return;
  }
  const path = `${basePath}.instanceState.transferProvenance.originEnvelopeId`;
  if (!isRecord(state.transferProvenance)) {
    appendOriginTrace(target, undefined, path, details, "transfer_provenance_not_object");
    return;
  }
  if (!Object.hasOwn(state.transferProvenance, "originEnvelopeId")) {
    appendOriginTrace(target, undefined, path, details, "origin_envelope_id_missing");
    return;
  }
  appendOriginTrace(target, state.transferProvenance.originEnvelopeId, path, details);
}

function scanProfileRecord(profileKeyValue, document) {
  REGISTRY_DIAGNOSTICS.profileRecordScans += 1;
  const profileKey = String(profileKeyValue || "");
  const profile = isRecord(document) && isRecord(document.profile) ? document.profile : null;
  if (!profile) {
    return EMPTY_SLICE;
  }
  const ownerships = [];
  const traces = [];
  const playerId = String(document.playerId || profileKey || "").trim() || profileKey;
  for (const [instanceId, instance] of objectEntries(profile.equipmentInstances)) {
    if (!isRecord(instance) || !Object.hasOwn(instance, "transferProvenance")) {
      continue;
    }
    const path = `profiles.${profileKey}.profile.equipmentInstances.${instanceId}.transferProvenance.originEnvelopeId`;
    const details = {
      ownerId: `${playerId}:${instanceId}`,
      playerId,
      instanceId,
      traceContainerKind: "profile",
    };
    if (!isRecord(instance.transferProvenance)) {
      appendOriginTrace(traces, undefined, path, details, "transfer_provenance_not_object");
    } else if (!Object.hasOwn(instance.transferProvenance, "originEnvelopeId")) {
      appendOriginTrace(traces, undefined, path, details, "origin_envelope_id_missing");
    } else {
      appendOriginTrace(traces, instance.transferProvenance.originEnvelopeId, path, details);
    }
  }
  const bank = isRecord(profile.bank) ? profile.bank : {};
  for (const [slotIndex, slot] of (Array.isArray(bank.slots) ? bank.slots : []).entries()) {
    for (const [envelopeIndex, envelope] of (Array.isArray(slot && slot.equipmentEnvelopes)
      ? slot.equipmentEnvelopes
      : []).entries()) {
      const envelopePath = `profiles.${profileKey}.profile.bank.slots[${slotIndex}].equipmentEnvelopes[${envelopeIndex}]`;
      appendOwnership(
        ownerships,
        envelopeIdFrom(envelope),
        OWNER_KIND_BANK,
        playerId,
        envelopePath,
        {profileKey, playerId, slotIndex, envelopeIndex},
      );
      appendEnvelopeOriginTrace(traces, envelope, envelopePath, {
        ownerId: `bank:${playerId}:${slotIndex}:${envelopeIndex}`,
        playerId,
        slotIndex,
        envelopeIndex,
        traceContainerKind: OWNER_KIND_BANK,
      });
    }
  }
  return frozenSlice(ownerships, traces);
}

function scanMailRecord(mailKeyValue, mail) {
  REGISTRY_DIAGNOSTICS.mailRecordScans += 1;
  const mailKey = String(mailKeyValue || "");
  if (!isRecord(mail)) {
    return EMPTY_SLICE;
  }
  const ownerships = [];
  const traces = [];
  const declaredMailId = String(mail.mailId || "").trim();
  for (const [envelopeIndex, envelope] of (Array.isArray(mail.equipmentEnvelopes)
    ? mail.equipmentEnvelopes
    : []).entries()) {
    const envelopePath = `mailMessages.${mailKey}.equipmentEnvelopes[${envelopeIndex}]`;
    appendOwnership(
      ownerships,
      envelopeIdFrom(envelope),
      OWNER_KIND_MAIL,
      mailKey,
      envelopePath,
      {mailKey, declaredMailId, envelopeIndex},
    );
    appendEnvelopeOriginTrace(traces, envelope, envelopePath, {
      ownerId: `mail:${mailKey}:${envelopeIndex}`,
      mailKey,
      envelopeIndex,
      traceContainerKind: OWNER_KIND_MAIL,
    });
  }
  return frozenSlice(ownerships, traces);
}

function scanMarketRecord(listingKeyValue, listing) {
  REGISTRY_DIAGNOSTICS.marketRecordScans += 1;
  const listingKey = String(listingKeyValue || "");
  if (!isRecord(listing)) {
    return EMPTY_SLICE;
  }
  const ownerships = [];
  const traces = [];
  const listingId = String(listing.listingId || listingKey || "").trim() || listingKey;
  const envelopePath = `marketListings.${listingKey}.equipmentEnvelope`;
  appendOwnership(
    ownerships,
    envelopeIdFrom(listing.equipmentEnvelope),
    OWNER_KIND_MARKET,
    listingId,
    envelopePath,
    {listingKey, listingId},
  );
  appendEnvelopeOriginTrace(traces, listing.equipmentEnvelope, envelopePath, {
    ownerId: `market:${listingKey}`,
    listingKey,
    traceContainerKind: OWNER_KIND_MARKET,
  });
  return frozenSlice(ownerships, traces);
}

function cacheForBucket(bucketKey) {
  if (bucketKey === PROFILE_BUCKET) {
    return PROFILE_INDEX_BY_CONTAINER;
  }
  if (bucketKey === MARKET_BUCKET) {
    return MARKET_INDEX_BY_CONTAINER;
  }
  return null;
}

function trackedSetForBucket(bucketKey) {
  return bucketKey === PROFILE_BUCKET
    ? TRACKED_PROFILE_CONTAINERS
    : (bucketKey === MARKET_BUCKET ? TRACKED_MARKET_CONTAINERS : null);
}

function scanRecordForBucket(bucketKey, recordId, value) {
  return bucketKey === PROFILE_BUCKET
    ? scanProfileRecord(recordId, value)
    : scanMarketRecord(recordId, value);
}

function newRecordContainerIndex(bucketKey, records, options = {}) {
  const parent = options.parent || null;
  return Object.freeze({
    bucketKey,
    records,
    parent,
    delta: parent ? options.delta || null : null,
    depth: parent ? parent.depth + 1 : 0,
    versionToken: Object.freeze({}),
    cacheable: options.cacheable === true,
  });
}

function fullRecordContainerIndex(containerValue, bucketKey) {
  const container = isRecord(containerValue) ? containerValue : {};
  if (bucketKey === PROFILE_BUCKET) {
    REGISTRY_DIAGNOSTICS.profileContainerScans += 1;
  } else {
    REGISTRY_DIAGNOSTICS.marketContainerScans += 1;
  }
  const records = new Map();
  for (const [recordId, value] of Object.entries(container)) {
    const slice = scanRecordForBucket(bucketKey, recordId, value);
    if (slice !== EMPTY_SLICE) {
      records.set(recordId, slice);
    }
  }
  const trackedSet = trackedSetForBucket(bucketKey);
  const cacheable = Object.isFrozen(container) || Boolean(trackedSet && trackedSet.has(container));
  const index = newRecordContainerIndex(bucketKey, records, {cacheable});
  const cache = cacheForBucket(bucketKey);
  if (cacheable && cache && isRecord(container)) {
    cache.set(container, index);
  }
  return index;
}

function recordContainerIndex(containerValue, bucketKey) {
  const container = isRecord(containerValue) ? containerValue : {};
  const cache = cacheForBucket(bucketKey);
  const cached = cache && isRecord(container) ? cache.get(container) : null;
  return cached || fullRecordContainerIndex(container, bucketKey);
}

function inheritEquipmentEnvelopeOwnershipRecordIndex(sourceValue, targetValue, bucketKey) {
  const cache = cacheForBucket(bucketKey);
  const trackedSet = trackedSetForBucket(bucketKey);
  if (!cache || !trackedSet || !isRecord(sourceValue) || !isRecord(targetValue)) {
    return false;
  }
  const sourceIndex = cache.get(sourceValue);
  if (!sourceIndex) {
    return false;
  }
  cache.set(targetValue, sourceIndex);
  trackedSet.add(targetValue);
  REGISTRY_DIAGNOSTICS.inheritedRecordIndexes += 1;
  return true;
}

function noteEquipmentEnvelopeOwnershipRecordMutation(containerValue, bucketKey, recordIdValue, value) {
  const cache = cacheForBucket(bucketKey);
  if (!cache || !isRecord(containerValue)) {
    return false;
  }
  const current = cache.get(containerValue);
  if (!current) {
    return false;
  }
  const recordId = String(recordIdValue || "");
  if (recordId === "") {
    return false;
  }
  const beforeSlice = current.records.get(recordId) || EMPTY_SLICE;
  const afterSlice = value === undefined
    ? EMPTY_SLICE
    : scanRecordForBucket(bucketKey, recordId, value);
  const checkpoint = current.depth + 1 > EQUIPMENT_OWNERSHIP_INDEX_CHECKPOINT_DEPTH;
  const records = layeredMapForMutation(current.records, checkpoint);
  if (afterSlice === EMPTY_SLICE) {
    records.delete(recordId);
  } else {
    records.set(recordId, afterSlice);
  }
  const next = newRecordContainerIndex(bucketKey, records, {
    parent: checkpoint ? null : current,
    delta: checkpoint ? null : Object.freeze({recordId, beforeSlice, afterSlice}),
    cacheable: true,
  });
  cache.set(containerValue, next);
  trackedSetForBucket(bucketKey).add(containerValue);
  if (bucketKey === PROFILE_BUCKET) {
    REGISTRY_DIAGNOSTICS.profileRecordUpdates += 1;
    if (checkpoint) REGISTRY_DIAGNOSTICS.profileIndexCheckpoints += 1;
  } else {
    REGISTRY_DIAGNOSTICS.marketRecordUpdates += 1;
    if (checkpoint) REGISTRY_DIAGNOSTICS.marketIndexCheckpoints += 1;
  }
  return true;
}

function newMailIndex(records, options = {}) {
  const parent = options.parent || null;
  return Object.freeze({
    records,
    parent,
    delta: parent ? options.delta || Object.freeze([]) : null,
    depth: parent ? parent.depth + 1 : 0,
    cursor: options.cursor || null,
    viewToken: options.viewToken || null,
    versionToken: Object.freeze({}),
    cacheable: options.cacheable === true,
  });
}

function fullMailIndex(messages, journal) {
  REGISTRY_DIAGNOSTICS.mailContainerScans += 1;
  const records = new Map();
  for (const [mailId, mail] of Object.entries(isRecord(messages) ? messages : {})) {
    const slice = scanMailRecord(mailId, mail);
    if (slice !== EMPTY_SLICE) {
      records.set(mailId, slice);
    }
  }
  return newMailIndex(records, {
    cursor: journal && journal.cursor || null,
    viewToken: journal && journal.viewToken || null,
    cacheable: isCanonicalMailAuthorityState(messages),
  });
}

function mailContainerIndex(messagesValue, previousIndex = null) {
  const messages = isRecord(messagesValue) ? messagesValue : {};
  if (!isCanonicalMailAuthorityState(messages)) {
    return fullMailIndex(messages, null);
  }
  const exact = MAIL_INDEX_BY_VIEW.get(messages) || null;
  const base = exact || previousIndex;
  const journal = mailAuthorityIncrementalJournal(messages, base && base.cursor);
  if (base && journal.ok && base.viewToken === journal.viewToken) {
    if (!exact) {
      MAIL_INDEX_BY_VIEW.set(messages, base);
    }
    return base;
  }
  if (base && journal.ok && journal.incremental) {
    const checkpoint = base.depth + 1 > EQUIPMENT_OWNERSHIP_INDEX_CHECKPOINT_DEPTH;
    const records = layeredMapForMutation(base.records, checkpoint);
    const deltas = [];
    for (const change of journal.changes) {
      const mailId = String(change && change.mailId || "");
      if (mailId === "") {
        continue;
      }
      const beforeSlice = records.get(mailId) || EMPTY_SLICE;
      const afterSlice = change.after === null || change.after === undefined
        ? EMPTY_SLICE
        : scanMailRecord(mailId, change.after);
      if (afterSlice === EMPTY_SLICE) {
        records.delete(mailId);
      } else {
        records.set(mailId, afterSlice);
      }
      deltas.push(Object.freeze({recordId: mailId, beforeSlice, afterSlice}));
      REGISTRY_DIAGNOSTICS.mailRecordUpdates += 1;
    }
    const next = newMailIndex(records, {
      parent: checkpoint ? null : base,
      delta: checkpoint ? null : Object.freeze(deltas),
      cursor: journal.cursor,
      viewToken: journal.viewToken,
      cacheable: true,
    });
    if (checkpoint) REGISTRY_DIAGNOSTICS.mailIndexCheckpoints += 1;
    MAIL_INDEX_BY_VIEW.set(messages, next);
    return next;
  }
  if (base) {
    REGISTRY_DIAGNOSTICS.mailJournalFallbacks += 1;
  }
  const initialJournal = mailAuthorityIncrementalJournal(messages);
  const full = fullMailIndex(messages, initialJournal.ok ? initialJournal : null);
  MAIL_INDEX_BY_VIEW.set(messages, full);
  return full;
}

function emptyAggregate() {
  return {
    ownershipsById: new Map(),
    tracesByOrigin: new Map(),
    tracesByOwnerId: new Map(),
    invalidTracesByPath: new Map(),
    invalidConflictByPath: new Map(),
    materializedDuplicateByOrigin: new Map(),
    materializedActiveByOrigin: new Map(),
    duplicateByEnvelopeId: new Map(),
  };
}

function cloneAggregate(value) {
  const checkpoint = (
    value.ownershipsById instanceof LayeredMap
    && value.ownershipsById.depth + 1 > EQUIPMENT_OWNERSHIP_INDEX_CHECKPOINT_DEPTH
  );
  if (checkpoint) {
    REGISTRY_DIAGNOSTICS.aggregateCheckpoints += 1;
  }
  return {
    ownershipsById: layeredMapForMutation(value.ownershipsById, checkpoint),
    tracesByOrigin: layeredMapForMutation(value.tracesByOrigin, checkpoint),
    tracesByOwnerId: layeredMapForMutation(value.tracesByOwnerId, checkpoint),
    invalidTracesByPath: layeredMapForMutation(value.invalidTracesByPath, checkpoint),
    invalidConflictByPath: layeredMapForMutation(value.invalidConflictByPath, checkpoint),
    materializedDuplicateByOrigin: layeredMapForMutation(
      value.materializedDuplicateByOrigin,
      checkpoint,
    ),
    materializedActiveByOrigin: layeredMapForMutation(value.materializedActiveByOrigin, checkpoint),
    duplicateByEnvelopeId: layeredMapForMutation(value.duplicateByEnvelopeId, checkpoint),
  };
}

function appendIndexedEntry(index, key, entry, compare) {
  const entries = [...(index.get(key) || []), entry].sort(compare);
  index.set(key, Object.freeze(entries));
}

function removeIndexedEntry(index, key, path) {
  const entries = (index.get(key) || []).filter((entry) => entry.path !== path);
  if (entries.length === 0) {
    index.delete(key);
  } else {
    index.set(key, Object.freeze(entries));
  }
}

function validTrace(trace) {
  return !trace.invalidReason && validEnvelopeId(trace.originEnvelopeId);
}

function applySliceToAggregate(aggregate, beforeSlice, afterSlice, touchedEnvelopeIds, touchedPaths) {
  for (const ownership of beforeSlice.ownerships) {
    removeIndexedEntry(aggregate.ownershipsById, ownership.envelopeId, ownership.path);
    touchedEnvelopeIds.add(ownership.envelopeId);
  }
  for (const trace of beforeSlice.traces) {
    if (validTrace(trace)) {
      removeIndexedEntry(aggregate.tracesByOrigin, trace.originEnvelopeId, trace.path);
    }
    if (String(trace.ownerId || "") !== "") {
      removeIndexedEntry(aggregate.tracesByOwnerId, trace.ownerId, trace.path);
    }
    aggregate.invalidTracesByPath.delete(trace.path);
    touchedPaths.add(trace.path);
    if (validEnvelopeId(trace.originEnvelopeId)) {
      touchedEnvelopeIds.add(trace.originEnvelopeId);
    }
  }
  for (const ownership of afterSlice.ownerships) {
    appendIndexedEntry(
      aggregate.ownershipsById,
      ownership.envelopeId,
      ownership,
      (left, right) => left.path.localeCompare(right.path),
    );
    touchedEnvelopeIds.add(ownership.envelopeId);
  }
  for (const trace of afterSlice.traces) {
    if (validTrace(trace)) {
      appendIndexedEntry(
        aggregate.tracesByOrigin,
        trace.originEnvelopeId,
        trace,
        (left, right) => left.path.localeCompare(right.path),
      );
    } else {
      aggregate.invalidTracesByPath.set(trace.path, trace);
    }
    if (String(trace.ownerId || "") !== "") {
      appendIndexedEntry(
        aggregate.tracesByOwnerId,
        trace.ownerId,
        trace,
        (left, right) => left.path.localeCompare(right.path),
      );
    }
    touchedPaths.add(trace.path);
    if (validEnvelopeId(trace.originEnvelopeId)) {
      touchedEnvelopeIds.add(trace.originEnvelopeId);
    }
  }
}

function ownershipFailure(code, message, details = {}) {
  return {ok: false, code, message, ...details};
}

function invalidTraceFailure(trace) {
  return ownershipFailure(
    "equipment_materialized_origin_invalid",
    "装备实例含无效的历史转运凭证，相关资产操作已暂停，请联系GM处理。",
    {
      path: trace.path,
      originEnvelopeId: trace.originEnvelopeId,
      reason: trace.invalidReason || "invalid_id",
    },
  );
}

function refreshAggregateConflicts(aggregate, consumedIndex, touchedEnvelopeIds, touchedPaths) {
  for (const path of touchedPaths) {
    const trace = aggregate.invalidTracesByPath.get(path);
    if (trace) {
      aggregate.invalidConflictByPath.set(path, invalidTraceFailure(trace));
    } else {
      aggregate.invalidConflictByPath.delete(path);
    }
  }
  for (const envelopeId of touchedEnvelopeIds) {
    const traces = aggregate.tracesByOrigin.get(envelopeId) || [];
    const ownerships = aggregate.ownershipsById.get(envelopeId) || [];
    if (traces.length > 1) {
      aggregate.materializedDuplicateByOrigin.set(envelopeId, ownershipFailure(
        "equipment_materialized_origin_duplicate",
        "同一历史转运凭证被多个装备状态引用，相关资产操作已暂停，请联系GM处理。",
        {originEnvelopeId: envelopeId, traces: clone(traces)},
      ));
    } else {
      aggregate.materializedDuplicateByOrigin.delete(envelopeId);
    }
    if (traces.length > 0 && ownerships.length > 0) {
      aggregate.materializedActiveByOrigin.set(envelopeId, ownershipFailure(
        "equipment_materialized_origin_active",
        "已实例化装备的历史转运凭证仍出现在托管容器中，相关资产操作已暂停，请联系GM处理。",
        {originEnvelopeId: envelopeId, traces: clone(traces), ownerships: clone(ownerships)},
      ));
    } else {
      aggregate.materializedActiveByOrigin.delete(envelopeId);
    }
    const consumed = consumedIndex.has(envelopeId);
    if (ownerships.length > 1 || (consumed && ownerships.length > 0)) {
      const duplicateOwnerships = consumed
        ? [{
          envelopeId,
          kind: OWNER_KIND_CONSUMED,
          id: envelopeId,
          path: `consumedEquipmentEnvelopes.${envelopeId}`,
          schemaVersion: EQUIPMENT_ENVELOPE_REGISTRY_SCHEMA_VERSION,
        }, ...clone(ownerships)]
        : clone(ownerships);
      aggregate.duplicateByEnvelopeId.set(envelopeId, {
        envelopeId,
        ownerships: duplicateOwnerships,
        schemaVersion: EQUIPMENT_ENVELOPE_REGISTRY_SCHEMA_VERSION,
      });
    } else {
      aggregate.duplicateByEnvelopeId.delete(envelopeId);
    }
  }
}

function appendIndexSlices(aggregate, index, touchedEnvelopeIds, touchedPaths) {
  for (const slice of index.records.values()) {
    applySliceToAggregate(aggregate, EMPTY_SLICE, slice, touchedEnvelopeIds, touchedPaths);
  }
}

function fullAggregate(indexes, consumedIndex) {
  REGISTRY_DIAGNOSTICS.rootFullAggregations += 1;
  const aggregate = emptyAggregate();
  const touchedEnvelopeIds = new Set();
  const touchedPaths = new Set();
  appendIndexSlices(aggregate, indexes.profileIndex, touchedEnvelopeIds, touchedPaths);
  appendIndexSlices(aggregate, indexes.mailIndex, touchedEnvelopeIds, touchedPaths);
  appendIndexSlices(aggregate, indexes.marketIndex, touchedEnvelopeIds, touchedPaths);
  refreshAggregateConflicts(aggregate, consumedIndex, touchedEnvelopeIds, touchedPaths);
  return aggregate;
}

function indexDeltasFrom(previous, next) {
  if (previous === next) {
    return {ok: true, deltas: []};
  }
  const reversed = [];
  let cursor = next;
  while (cursor && cursor !== previous) {
    if (cursor.delta === null || cursor.delta === undefined) {
      return {ok: false, deltas: []};
    }
    if (Array.isArray(cursor.delta)) {
      reversed.push(...cursor.delta.slice().reverse());
    } else {
      reversed.push(cursor.delta);
    }
    cursor = cursor.parent;
  }
  if (cursor !== previous) {
    return {ok: false, deltas: []};
  }
  return {ok: true, deltas: reversed.reverse()};
}

function consumedLedgerRead(value) {
  const read = readConsumedEquipmentEnvelopeLedgerIndex(value);
  if (read.ok) {
    const delta = consumedEquipmentEnvelopeLedgerDelta(read.ledger);
    return {
      ledger: read.ledger,
      index: read.index,
      signature: consumedEquipmentEnvelopeLedgerSignature(read.ledger),
      pendingAddedIds: delta.ok ? delta.addedIds : Object.freeze([]),
      conflict: null,
    };
  }
  return {
    ledger: null,
    index: Object.freeze({count: 0, has: () => false}),
    signature: `invalid:${String(read.code || "unknown")}:${String(read.message || "")}`,
    pendingAddedIds: Object.freeze([]),
    conflict: clone(read),
  };
}

function aggregateStateFrom(baseState, indexes, consumed) {
  const profileDeltas = baseState
    ? indexDeltasFrom(baseState.profileIndex, indexes.profileIndex)
    : {ok: false, deltas: []};
  const mailDeltas = baseState
    ? indexDeltasFrom(baseState.mailIndex, indexes.mailIndex)
    : {ok: false, deltas: []};
  const marketDeltas = baseState
    ? indexDeltasFrom(baseState.marketIndex, indexes.marketIndex)
    : {ok: false, deltas: []};
  const canDerive = Boolean(baseState && profileDeltas.ok && mailDeltas.ok && marketDeltas.ok);
  let aggregate;
  if (canDerive) {
    REGISTRY_DIAGNOSTICS.rootIncrementalAggregations += 1;
    const hasDerivedChanges = (
      profileDeltas.deltas.length > 0
      || mailDeltas.deltas.length > 0
      || marketDeltas.deltas.length > 0
      || (
        baseState.consumedSignature !== consumed.signature
        && baseState.consumedLedger !== consumed.ledger
      )
    );
    aggregate = hasDerivedChanges ? cloneAggregate(baseState.aggregate) : baseState.aggregate;
    const touchedEnvelopeIds = new Set();
    const touchedPaths = new Set();
    for (const delta of [...profileDeltas.deltas, ...mailDeltas.deltas, ...marketDeltas.deltas]) {
      applySliceToAggregate(
        aggregate,
        delta.beforeSlice || EMPTY_SLICE,
        delta.afterSlice || EMPTY_SLICE,
        touchedEnvelopeIds,
        touchedPaths,
      );
    }
    if (
      baseState.consumedSignature !== consumed.signature
      && baseState.consumedLedger !== consumed.ledger
      && consumed.pendingAddedIds.length > 0
    ) {
      REGISTRY_DIAGNOSTICS.consumedTargetedRefreshes += 1;
      for (const envelopeId of consumed.pendingAddedIds) {
        touchedEnvelopeIds.add(envelopeId);
      }
    } else if (
      baseState.consumedSignature !== consumed.signature
      && baseState.consumedLedger !== consumed.ledger
    ) {
      // A same-process staged append exposes its exact pending IDs above. A
      // rebased or externally loaded lineage cannot prove that narrow delta,
      // so fail safe by rechecking active owners without enumerating the
      // append-only tombstone history.
      REGISTRY_DIAGNOSTICS.consumedFallbackRefreshes += 1;
      for (const envelopeId of aggregate.ownershipsById.keys()) {
        touchedEnvelopeIds.add(envelopeId);
      }
    }
    refreshAggregateConflicts(aggregate, consumed.index, touchedEnvelopeIds, touchedPaths);
  } else {
    aggregate = fullAggregate(indexes, consumed.index);
  }
  return Object.freeze({
    ...indexes,
    aggregate,
    consumedLedger: consumed.ledger,
    consumedIndex: consumed.index,
    consumedSignature: consumed.signature,
    consumedConflict: consumed.conflict,
  });
}

function normalizeExpectedOwner(expectedOwner) {
  if (!isRecord(expectedOwner)) {
    return null;
  }
  const kind = typeof expectedOwner.kind === "string" ? expectedOwner.kind.trim() : "";
  const id = typeof expectedOwner.id === "string" ? expectedOwner.id.trim() : "";
  return kind !== "" && id !== "" ? {kind, id} : null;
}

function frozenClonedArray(values) {
  return Object.freeze(clone(values).map((entry) => Object.freeze(entry)));
}

function createRegistryFacade(state) {
  const aggregate = state.aggregate;
  let ownerships = null;
  let duplicates = null;
  let conflicts = null;
  let materializedTraces = null;

  function ownershipsFor(envelopeIdValue) {
    const envelopeId = String(envelopeIdValue || "").trim();
    return clone(aggregate.ownershipsById.get(envelopeId) || []);
  }

  function isAvailable(envelopeIdValue) {
    const envelopeId = String(envelopeIdValue || "").trim();
    return (
      envelopeId !== ""
      && !aggregate.ownershipsById.has(envelopeId)
      && !state.consumedIndex.has(envelopeId)
      && !aggregate.tracesByOrigin.has(envelopeId)
    );
  }

  function isConsumed(envelopeIdValue) {
    return state.consumedIndex.has(String(envelopeIdValue || "").trim());
  }

  function requireUnique(envelopeIdValue, expectedOwnerValue) {
    const envelopeId = String(envelopeIdValue || "").trim();
    const expectedOwner = normalizeExpectedOwner(expectedOwnerValue);
    if (envelopeId === "" || !expectedOwner) {
      return ownershipFailure(
        "equipment_transfer_envelope_ownership_invalid",
        "装备转运凭证的权威归属请求无效。",
      );
    }
    const entries = aggregate.ownershipsById.get(envelopeId) || [];
    if (state.consumedIndex.has(envelopeId)) {
      return ownershipFailure(
        "equipment_transfer_envelope_duplicate",
        "这个装备转运凭证已经消费，却再次出现在托管容器中，本次操作已取消，请联系GM处理。",
        {envelopeId, ownerships: clone(entries)},
      );
    }
    if (entries.length === 0) {
      return ownershipFailure(
        "equipment_transfer_envelope_ownership_missing",
        "装备转运凭证已不存在，请刷新后重试。",
        {envelopeId},
      );
    }
    if (entries.length > 1) {
      return ownershipFailure(
        "equipment_transfer_envelope_duplicate",
        "同一装备转运凭证存在多个权威归属，本次操作已取消，请联系GM处理。",
        {envelopeId, ownerships: clone(entries)},
      );
    }
    const ownership = entries[0];
    if (ownership.kind !== expectedOwner.kind || ownership.id !== expectedOwner.id) {
      return ownershipFailure(
        "equipment_transfer_envelope_ownership_mismatch",
        "装备转运凭证的权威归属已经变化，请刷新后重试。",
        {envelopeId, ownership: clone(ownership), expectedOwner},
      );
    }
    return {ok: true, envelopeId, ownership: clone(ownership)};
  }

  function requireMaterializedInstanceOrigin(playerIdValue, instanceIdValue) {
    const playerId = String(playerIdValue || "").trim();
    const instanceId = String(instanceIdValue || "").trim();
    if (playerId === "" || instanceId === "") {
      return {ok: true, hasOrigin: false};
    }
    const ownerId = `${playerId}:${instanceId}`;
    const materialized = aggregate.tracesByOwnerId.get(ownerId) || [];
    if (materialized.length === 0) {
      return {ok: true, hasOrigin: false};
    }
    if (materialized.length > 1) {
      return ownershipFailure(
        "equipment_transfer_envelope_duplicate",
        "同一装备实例记录了多个来源凭证，本次操作已取消，请联系GM处理。",
        {ownerId, ownerships: clone(materialized)},
      );
    }
    const originEnvelopeId = materialized[0].originEnvelopeId;
    if (!validEnvelopeId(originEnvelopeId)) {
      return ownershipFailure(
        "equipment_materialized_origin_invalid",
        "装备实例含无效的历史转运凭证，本次操作已取消，请联系GM处理。",
        {ownerId, path: materialized[0].path, originEnvelopeId},
      );
    }
    const sameOriginTraces = aggregate.tracesByOrigin.get(originEnvelopeId) || [];
    if (sameOriginTraces.length > 1) {
      return ownershipFailure(
        "equipment_materialized_origin_duplicate",
        "同一历史转运凭证被多个装备状态引用，本次操作已取消，请联系GM处理。",
        {originEnvelopeId, traces: clone(sameOriginTraces)},
      );
    }
    const activeEntries = aggregate.ownershipsById.get(originEnvelopeId) || [];
    if (activeEntries.length > 0) {
      return ownershipFailure(
        "equipment_transfer_envelope_duplicate",
        "装备实例的历史转运凭证再次出现在托管容器中，本次操作已取消，请联系GM处理。",
        {ownerId, envelopeId: originEnvelopeId, ownerships: clone(activeEntries)},
      );
    }
    return {
      ok: true,
      hasOrigin: true,
      envelopeId: originEnvelopeId,
      consumed: state.consumedIndex.has(originEnvelopeId),
      needsLedgerBackfill: !state.consumedIndex.has(originEnvelopeId),
    };
  }

  const facade = {
    schemaVersion: EQUIPMENT_ENVELOPE_REGISTRY_SCHEMA_VERSION,
    get ownerships() {
      if (ownerships === null) {
        ownerships = frozenClonedArray(Array.from(aggregate.ownershipsById.values())
          .flat()
          .sort((left, right) => (
            left.envelopeId.localeCompare(right.envelopeId)
            || left.path.localeCompare(right.path)
          )));
      }
      return ownerships;
    },
    get duplicates() {
      if (duplicates === null) {
        duplicates = frozenClonedArray(Array.from(aggregate.duplicateByEnvelopeId.values())
          .sort((left, right) => left.envelopeId.localeCompare(right.envelopeId)));
      }
      return duplicates;
    },
    get conflicts() {
      if (conflicts === null) {
        const ordered = [
          ...(state.consumedConflict ? [state.consumedConflict] : []),
          ...Array.from(aggregate.invalidConflictByPath.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([, entry]) => entry),
          ...Array.from(aggregate.materializedDuplicateByOrigin.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([, entry]) => entry),
          ...Array.from(aggregate.materializedActiveByOrigin.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([, entry]) => entry),
          ...Array.from(aggregate.duplicateByEnvelopeId.values())
            .sort((left, right) => left.envelopeId.localeCompare(right.envelopeId))
            .map((duplicate) => ownershipFailure(
              "equipment_transfer_envelope_duplicate",
              "同一装备转运凭证存在多个权威归属，相关资产操作已暂停，请联系GM处理。",
              clone(duplicate),
            )),
        ];
        conflicts = frozenClonedArray(ordered);
      }
      return conflicts;
    },
    get materializedTraces() {
      if (materializedTraces === null) {
        materializedTraces = frozenClonedArray(Array.from(aggregate.tracesByOwnerId.values())
          .flat()
          .filter((entry, index, all) => all.findIndex((candidate) => candidate.path === entry.path) === index)
          .sort((left, right) => left.path.localeCompare(right.path)));
      }
      return materializedTraces;
    },
    consumedEnvelopeCount: state.consumedIndex.count,
    ownershipsFor,
    isAvailable,
    isConsumed,
    requireUnique,
    requireMaterializedInstanceOrigin,
  };
  return Object.freeze(facade);
}

function createEquipmentEnvelopeOwnershipRegistry(rootValue) {
  const root = isRecord(rootValue) ? rootValue : {};
  const exact = ROOT_REGISTRY_CACHE.get(root) || null;
  const inherited = exact || ROOT_REGISTRY_INHERITANCE.get(root) || null;
  const profileIndex = recordContainerIndex(root.profiles, PROFILE_BUCKET);
  const marketIndex = recordContainerIndex(root.marketListings, MARKET_BUCKET);
  const mailIndex = mailContainerIndex(root.mailMessages, inherited && inherited.state.mailIndex);
  const consumed = consumedLedgerRead(root.consumedEquipmentEnvelopes);
  if (
    exact
    && exact.state.profileIndex === profileIndex
    && exact.state.marketIndex === marketIndex
    && exact.state.mailIndex === mailIndex
    && exact.state.consumedSignature === consumed.signature
  ) {
    REGISTRY_DIAGNOSTICS.rootCacheHits += 1;
    return exact.facade;
  }
  const indexes = {profileIndex, mailIndex, marketIndex};
  const state = aggregateStateFrom(inherited && inherited.state, indexes, consumed);
  const facade = createRegistryFacade(state);
  const cacheable = profileIndex.cacheable && marketIndex.cacheable && mailIndex.cacheable;
  if (cacheable) {
    ROOT_REGISTRY_CACHE.set(root, {state, facade});
  }
  ROOT_REGISTRY_INHERITANCE.delete(root);
  return facade;
}

function inheritEquipmentEnvelopeOwnershipRegistry(sourceValue, targetValue) {
  if (!isRecord(sourceValue) || !isRecord(targetValue)) {
    return false;
  }
  const source = ROOT_REGISTRY_CACHE.get(sourceValue) || ROOT_REGISTRY_INHERITANCE.get(sourceValue);
  if (!source) {
    return false;
  }
  ROOT_REGISTRY_INHERITANCE.set(targetValue, source);
  return true;
}

function equipmentEnvelopeOwnershipRegistryDiagnostics() {
  return Object.freeze({...REGISTRY_DIAGNOSTICS});
}

module.exports = {
  EQUIPMENT_ENVELOPE_REGISTRY_SCHEMA_VERSION,
  EQUIPMENT_OWNERSHIP_INDEX_CHECKPOINT_DEPTH,
  OWNER_KIND_BANK,
  OWNER_KIND_MAIL,
  OWNER_KIND_MARKET,
  OWNER_KIND_MATERIALIZED,
  OWNER_KIND_CONSUMED,
  createEquipmentEnvelopeOwnershipRegistry,
  equipmentEnvelopeOwnershipRegistryDiagnostics,
  inheritEquipmentEnvelopeOwnershipRegistry,
  inheritEquipmentEnvelopeOwnershipRecordIndex,
  noteEquipmentEnvelopeOwnershipRecordMutation,
};
