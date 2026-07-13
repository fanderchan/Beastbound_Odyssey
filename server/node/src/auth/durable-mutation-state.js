"use strict";

const {isDeepStrictEqual} = require("node:util");

const RUNTIME_ROOT_FIELDS = Object.freeze([
  "playerPositions",
  "partyInvites",
  "battleInvites",
  "battleRooms",
  "battleRoomRecoveries",
  "battleRoomRecoveryByAccountId",
  "tradeOffers",
]);
const DURABLE_RECEIPT_TTL_MS = 72 * 60 * 60 * 1000;
const DURABLE_RECEIPT_MAX_COUNT = 20000;
const DURABLE_OPERATION_ID_PATTERN = /^[A-Za-z0-9._:-]{16,160}$/;
const DURABLE_REQUEST_HASH_PATTERN = /^[a-f0-9]{64}$/;
const DURABLE_RECEIPT_EXCLUDED_METHODS = new Set([
  "register",
  "login",
  "_httpRegisterPasswordDigest",
  "_httpLoginPasswordDigest",
  "refreshSession",
  "getMarketConfig",
]);
const DURABLE_RECEIPT_PRUNE_BATCH = 256;
const DURABLE_RECEIPT_CHECKPOINT_HISTORY_MAX = 2048;
const DURABLE_RECEIPT_CHECKPOINT_DEAD_KEY_MAX = 1024;
const DURABLE_RECEIPT_CHECKPOINT_HEAP_OVERHEAD_MAX = 2048;
const RECEIPT_LEDGER_STATE = new WeakMap();
const RECEIPT_RESPONSE_JSON = new WeakMap();
let NEXT_RECEIPT_LINEAGE_ID = 1;

function durableBusinessChanged(beforeValue, candidateValue, options) {
  const before = durableBusinessProjection(beforeValue, options);
  const candidate = durableBusinessProjection(candidateValue, options);
  if (serviceEventsOnlyEvictedFromFront(before.serviceEvents, candidate.serviceEvents)) {
    // The live replay window mixes durable chat/party events with runtime-only
    // battle traffic. Once that bounded window is full, a battle event can
    // evict an old durable event even though no player asset or durable event
    // was created. Defer that retention-only DELETE until the next genuine
    // durable mutation instead of turning ordinary battle commands into MySQL
    // writes. A new or modified durable event still fails the suffix check and
    // therefore remains part of the owning COMMIT.
    candidate.serviceEvents = before.serviceEvents;
    candidate.serviceEventSeq = before.serviceEventSeq;
  }
  return !isDeepStrictEqual(before, candidate);
}

function serviceEventsOnlyEvictedFromFront(beforeValue, candidateValue) {
  const before = Array.isArray(beforeValue) ? beforeValue : [];
  const candidate = Array.isArray(candidateValue) ? candidateValue : [];
  if (candidate.length > before.length) {
    return false;
  }
  const offset = before.length - candidate.length;
  for (let index = 0; index < candidate.length; index += 1) {
    if (!isDeepStrictEqual(before[offset + index], candidate[index])) {
      return false;
    }
  }
  return true;
}

function durableBusinessProjection(data, options) {
  const projection = options.persistentDataForStore(data);
  // Per-command traces and battle-only replay sequence movement are diagnostic
  // runtime churn, not player assets. They remain in memory and are folded into
  // the next real durable settlement, so ordinary turns do not pay a DB RTT.
  projection.battleTrace = [];
  const latestPersistentEvent = projection.serviceEvents.length > 0
    ? projection.serviceEvents[projection.serviceEvents.length - 1]
    : null;
  projection.serviceEventSeq = Math.max(
    0,
    options.normalizeEventSeq(latestPersistentEvent && latestPersistentEvent.eventSeq),
  );
  if (typeof options.consumedEquipmentEnvelopeLedgerSignature === "function") {
    projection.consumedEquipmentEnvelopes = options.consumedEquipmentEnvelopeLedgerSignature(
      projection.consumedEquipmentEnvelopes,
    );
  }
  projection.mutationReceipts = durableMutationReceiptSignature(projection.mutationReceipts);
  return projection;
}

function restorePublishedPersistentData(currentValue, persistentValue, options) {
  const current = options.normalizeData(currentValue);
  const persistent = options.normalizeData(persistentValue || {});
  for (const field of RUNTIME_ROOT_FIELDS) {
    persistent[field] = clone(current[field]);
  }
  return persistent;
}

function mergeRuntimeObject(beforeValue, candidateValue, currentValue) {
  const before = objectOrEmpty(beforeValue);
  const candidate = objectOrEmpty(candidateValue);
  const merged = clone(objectOrEmpty(currentValue));
  const keys = new Set([...Object.keys(before), ...Object.keys(candidate)]);
  for (const key of keys) {
    const beforeHas = Object.hasOwn(before, key);
    const candidateHas = Object.hasOwn(candidate, key);
    if (beforeHas === candidateHas && isDeepStrictEqual(before[key], candidate[key])) {
      continue;
    }
    if (!candidateHas) {
      delete merged[key];
    } else {
      merged[key] = clone(candidate[key]);
    }
  }
  return merged;
}

// Capture the request-private runtime changes before the first durable await.
// This is the same conflict policy as mergeRuntimeObject(): a candidate change
// wins for that key, while an untouched key is left to the latest live runtime
// root. Keeping only the delta means the COMMIT continuation no longer needs a
// deep baseline snapshot of every active battle room and player position.
function captureRuntimeRootDelta(beforeValue, candidateValue) {
  const delta = {};
  for (const field of RUNTIME_ROOT_FIELDS) {
    delta[field] = captureRuntimeObjectDelta(
      beforeValue && beforeValue[field],
      candidateValue && candidateValue[field],
    );
  }
  return Object.freeze(delta);
}

function captureRuntimeObjectDelta(beforeValue, candidateValue) {
  if (beforeValue === candidateValue) {
    return Object.freeze([]);
  }
  const before = objectOrEmpty(beforeValue);
  const candidate = objectOrEmpty(candidateValue);
  const changes = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(candidate)]);
  for (const key of keys) {
    const beforeHas = Object.hasOwn(before, key);
    const candidateHas = Object.hasOwn(candidate, key);
    if (beforeHas === candidateHas && isDeepStrictEqual(before[key], candidate[key])) {
      continue;
    }
    changes.push(Object.freeze({
      key,
      present: candidateHas,
      value: candidateHas ? candidate[key] : undefined,
    }));
  }
  return Object.freeze(changes);
}

function mergeRuntimeObjectDelta(deltaValue, currentValue) {
  const current = objectOrEmpty(currentValue);
  const changes = Array.isArray(deltaValue) ? deltaValue : [];
  if (changes.length === 0) {
    // cachedData is the sole owner of runtime roots. Once it is replaced after
    // COMMIT, an untouched bucket can transfer directly to the next authority
    // root; public responses/events never expose this internal container.
    return current;
  }
  const merged = {...current};
  for (const change of changes) {
    if (!change || typeof change.key !== "string") {
      continue;
    }
    const key = change.key;
    if (change.present !== true) {
      delete merged[key];
      continue;
    }
    // defineProperty preserves an own "__proto__" data key without invoking
    // Object.prototype's legacy setter on malformed legacy input.
    Object.defineProperty(merged, key, {
      configurable: true,
      enumerable: true,
      value: change.value,
      writable: true,
    });
  }
  return merged;
}

function normalizeDurableMutationReceipts(value) {
  return canonicalDurableMutationReceipts(value);
}

function canonicalDurableMutationReceipts(value) {
  if (isCanonicalDurableMutationReceipts(value)) {
    return value;
  }
  if (value === undefined) {
    value = {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw receiptError("持久化操作回执账本格式不正确。", "mutation_receipt_ledger_invalid");
  }
  const baseline = {};
  const keys = Object.keys(value).sort();
  for (const operationId of keys) {
    baseline[operationId] = normalizeReceiptRecord(operationId, value[operationId]);
  }
  Object.freeze(baseline);
  const lineage = createReceiptLineage(baseline, keys);
  return createReceiptLedgerView(lineage, 0, new Map(), new Map());
}

function createReceiptLineage(baseline, keys = Object.keys(baseline).sort(), options = {}) {
  const lineage = {
    baseline,
    checkpointCount: Math.max(0, Math.trunc(Number(options.checkpointCount || 0))),
    countByRevision: [keys.length],
    expiryHeap: keys.map((operationId) => receiptHeapNode(baseline[operationId])),
    historyEntryCount: 0,
    histories: new Map(),
    keys: new Set(keys),
    lineageId: NEXT_RECEIPT_LINEAGE_ID,
    oldestHeap: keys.map((operationId) => receiptHeapNode(baseline[operationId])),
    revision: 0,
  };
  NEXT_RECEIPT_LINEAGE_ID += 1;
  heapify(lineage.expiryHeap, compareExpiryNode);
  heapify(lineage.oldestHeap, compareOldestNode);
  return lineage;
}

function normalizeReceiptRecord(operationId, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw receiptError(`持久化操作回执不完整：${operationId || "<empty>"}`);
  }
  const normalizedOperationId = String(raw.operationId || operationId || "").trim();
  const rawRequestHash = String(raw.requestHash || "");
  const requestHash = rawRequestHash.trim().toLowerCase();
  const rawActionId = String(raw.actionId || "");
  const actionId = rawActionId.trim();
  const committedAtMs = Date.parse(String(raw.committedAt || ""));
  const expiresAtMs = Date.parse(String(raw.expiresAt || ""));
  const rawResponse = raw.response;
  if (
    raw.schemaVersion !== 1
    || operationId !== normalizedOperationId
    || !DURABLE_OPERATION_ID_PATTERN.test(normalizedOperationId)
    || rawRequestHash !== requestHash
    || !DURABLE_REQUEST_HASH_PATTERN.test(requestHash)
    || rawActionId !== actionId
    || actionId === ""
    || actionId.length > 160
    || !Number.isFinite(committedAtMs)
    || !Number.isFinite(expiresAtMs)
    || expiresAtMs <= committedAtMs
    || !rawResponse
    || typeof rawResponse !== "object"
    || Array.isArray(rawResponse)
  ) {
    throw receiptError(`持久化操作回执不完整：${operationId || "<empty>"}`);
  }
  const responseJson = canonicalReceiptResponseJson(rawResponse, normalizedOperationId);
  const receipt = {
    schemaVersion: 1,
    operationId: normalizedOperationId,
    requestHash,
    actionId,
    accountId: String(raw.accountId || ""),
    committedAt: new Date(committedAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
  Object.defineProperty(receipt, "response", {
    configurable: false,
    enumerable: true,
    get: durableReceiptResponseGetter,
  });
  RECEIPT_RESPONSE_JSON.set(receipt, responseJson);
  return Object.freeze(receipt);
}

// A receipt may live for 72 hours and the ledger holds up to 20,000 entries.
// Retaining each exact replay result as a nested JavaScript object makes a
// bounded ledger consume progressively more heap as compact fixture entries
// are replaced by real profile/bank responses. Keep one canonical JSON string
// instead. The public/persistence shape remains schemaVersion 1 with an
// enumerable `response` property, while replay or serialization materializes
// a short-lived, deeply frozen tree on demand.
function durableReceiptResponseGetter() {
  const responseJson = RECEIPT_RESPONSE_JSON.get(this);
  if (typeof responseJson !== "string") {
    throw receiptError("持久化操作回执响应缺失。", "mutation_receipt_response_missing");
  }
  return deepFreeze(JSON.parse(responseJson));
}

function canonicalReceiptResponseJson(response, operationId) {
  let responseJson;
  let parsed;
  try {
    responseJson = JSON.stringify(response);
    parsed = JSON.parse(responseJson);
  } catch {
    throw receiptError(`持久化操作回执响应无法序列化：${operationId || "<empty>"}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw receiptError(`持久化操作回执响应格式不正确：${operationId || "<empty>"}`);
  }
  return responseJson;
}

function receiptResponseJson(receipt) {
  const stored = RECEIPT_RESPONSE_JSON.get(receipt);
  if (typeof stored === "string") {
    return stored;
  }
  return canonicalReceiptResponseJson(
    receipt && receipt.response,
    String(receipt && receipt.operationId || ""),
  );
}

function materializeReceiptRecord(receipt) {
  return {
    schemaVersion: 1,
    operationId: receipt.operationId,
    requestHash: receipt.requestHash,
    actionId: receipt.actionId,
    accountId: receipt.accountId,
    committedAt: receipt.committedAt,
    expiresAt: receipt.expiresAt,
    response: JSON.parse(receiptResponseJson(receipt)),
  };
}

function isCanonicalDurableMutationReceipts(value) {
  return Boolean(value) && typeof value === "object" && RECEIPT_LEDGER_STATE.has(value);
}

function durableMutationReceiptLedgersShareLineage(leftValue, rightValue) {
  const left = RECEIPT_LEDGER_STATE.get(leftValue);
  const right = RECEIPT_LEDGER_STATE.get(rightValue);
  return Boolean(left && right && left.lineage === right.lineage);
}

function durableMutationReceiptLedgerCanDescendFrom(previousValue, nextValue) {
  const previous = RECEIPT_LEDGER_STATE.get(previousValue);
  const next = RECEIPT_LEDGER_STATE.get(nextValue);
  if (!previous || !next || previous.lineage !== next.lineage || next.baseRevision < previous.baseRevision) {
    return false;
  }
  for (const [operationId, deletion] of previous.deletes.entries()) {
    if (next.baseRevision === previous.baseRevision) {
      const nextDeletion = next.deletes.get(operationId);
      if (
        !nextDeletion
        || nextDeletion.expectedReceipt !== deletion.expectedReceipt
        || nextDeletion.reason !== deletion.reason
      ) {
        return false;
      }
    } else if (!previous.upserts.has(operationId) && receiptVisibleToState(next, operationId)) {
      return false;
    }
  }
  for (const [operationId, receipt] of previous.upserts.entries()) {
    if (receiptVisibleToState(next, operationId) !== receipt) {
      return false;
    }
  }
  return true;
}

function createReceiptLedgerView(lineage, baseRevision, deletes, upserts) {
  const state = {baseRevision, deletes, lineage, upserts};
  const target = {};
  const ledger = new Proxy(target, {
    defineProperty() {
      return false;
    },
    deleteProperty() {
      return false;
    },
    get(targetValue, property, receiver) {
      if (typeof property === "string") {
        const receipt = receiptVisibleToState(state, property);
        if (receipt) {
          return receipt;
        }
      }
      return Reflect.get(targetValue, property, receiver);
    },
    getOwnPropertyDescriptor(targetValue, property) {
      if (typeof property === "string") {
        const receipt = receiptVisibleToState(state, property);
        if (receipt) {
          return {configurable: true, enumerable: true, value: receipt, writable: false};
        }
      }
      return Reflect.getOwnPropertyDescriptor(targetValue, property);
    },
    has(targetValue, property) {
      return (
        (typeof property === "string" && Boolean(receiptVisibleToState(state, property)))
        || Reflect.has(targetValue, property)
      );
    },
    ownKeys() {
      return visibleReceiptOperationIds(state);
    },
    preventExtensions() {
      return false;
    },
    set() {
      return false;
    },
    setPrototypeOf() {
      return false;
    },
  });
  RECEIPT_LEDGER_STATE.set(ledger, state);
  return ledger;
}

function receiptAtRevision(lineage, operationId, revision) {
  const history = lineage.histories.get(operationId);
  if (!history || history.length === 0) {
    return lineage.baseline[operationId] || null;
  }
  let low = 0;
  let high = history.length - 1;
  let match = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (history[middle].revision <= revision) {
      match = history[middle];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return match ? match.receipt : (lineage.baseline[operationId] || null);
}

function receiptVisibleToState(state, operationId) {
  if (state.upserts.has(operationId)) {
    return state.upserts.get(operationId);
  }
  if (state.deletes.has(operationId)) {
    return null;
  }
  return receiptAtRevision(state.lineage, operationId, state.baseRevision);
}

function visibleReceiptOperationIds(state) {
  const ids = new Set(state.lineage.keys);
  for (const operationId of state.upserts.keys()) {
    ids.add(operationId);
  }
  return Array.from(ids).filter((operationId) => receiptVisibleToState(state, operationId)).sort();
}

function durableMutationReceiptCount(value) {
  const ledger = canonicalDurableMutationReceipts(value);
  return receiptStateCount(RECEIPT_LEDGER_STATE.get(ledger));
}

function receiptStateCount(state) {
  let count = state.lineage.countByRevision[state.baseRevision] || 0;
  const touched = new Set([...state.deletes.keys(), ...state.upserts.keys()]);
  for (const operationId of touched) {
    const before = receiptAtRevision(state.lineage, operationId, state.baseRevision);
    const after = receiptVisibleToState(state, operationId);
    if (!before && after) {
      count += 1;
    } else if (before && !after) {
      count -= 1;
    }
  }
  return count;
}

function durableMutationReceiptSignature(value) {
  const ledger = canonicalDurableMutationReceipts(value);
  const state = RECEIPT_LEDGER_STATE.get(ledger);
  const deletes = Array.from(state.deletes.keys()).sort().join(",");
  const upserts = Array.from(state.upserts.keys()).sort().join(",");
  return `mutation-receipts:${state.lineage.lineageId}:${state.baseRevision}:d=${deletes}:u=${upserts}`;
}

function durableMutationReceiptLedgerStats(value) {
  const ledger = canonicalDurableMutationReceipts(value);
  const state = RECEIPT_LEDGER_STATE.get(ledger);
  return Object.freeze({
    activeCount: receiptStateCount(state),
    baseRevision: state.baseRevision,
    checkpointCount: state.lineage.checkpointCount,
    expiryHeapSize: state.lineage.expiryHeap.length,
    historicalKeyCount: state.lineage.keys.size,
    historyEntryCount: state.lineage.historyEntryCount,
    oldestHeapSize: state.lineage.oldestHeap.length,
    pendingDeleteCount: state.deletes.size,
    pendingUpsertCount: state.upserts.size,
  });
}

// This intentionally scans the canonical ledger and is therefore reserved for
// explicit capacity/retention diagnostics. The normal health and per-second
// metric paths must continue to use durableMutationReceiptLedgerStats(), whose
// counters are O(1). Only aggregate sizes and shapes leave this boundary; no
// player response payload is exposed in diagnostics.
function durableMutationReceiptPayloadStats(value) {
  const ledger = canonicalDurableMutationReceipts(value);
  const state = RECEIPT_LEDGER_STATE.get(ledger);
  const responseSizes = [];
  const responseShape = emptyJsonShape();
  const byAction = new Map();
  let receiptJsonBytes = 0;
  let responseJsonBytes = 0;
  for (const operationId of visibleReceiptOperationIds(state)) {
    const receipt = receiptVisibleToState(state, operationId);
    if (!receipt) {
      continue;
    }
    const responseJson = receiptResponseJson(receipt);
    const responseBytes = Buffer.byteLength(responseJson);
    const receiptBytes = receiptJsonByteLength(receipt, responseBytes);
    receiptJsonBytes += receiptBytes;
    responseJsonBytes += responseBytes;
    responseSizes.push(responseBytes);
    addJsonShape(responseShape, JSON.parse(responseJson));
    const actionId = String(receipt.actionId || "unknown").slice(0, 160) || "unknown";
    const action = byAction.get(actionId) || {count: 0, responseJsonBytes: 0, responseSizes: []};
    action.count += 1;
    action.responseJsonBytes += responseBytes;
    action.responseSizes.push(responseBytes);
    byAction.set(actionId, action);
  }
  responseSizes.sort((left, right) => left - right);
  const actions = Object.fromEntries(Array.from(byAction.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([actionId, action]) => {
      action.responseSizes.sort((left, right) => left - right);
      return [actionId, Object.freeze({
        count: action.count,
        responseJsonBytes: action.responseJsonBytes,
        responseAverageBytes: action.count > 0 ? Math.round(action.responseJsonBytes / action.count) : 0,
        responseP50Bytes: percentileSorted(action.responseSizes, 0.5),
        responseP95Bytes: percentileSorted(action.responseSizes, 0.95),
        responseMaxBytes: action.responseSizes.at(-1) || 0,
      })];
    }));
  return Object.freeze({
    activeCount: responseSizes.length,
    receiptJsonBytes,
    responseJsonBytes,
    responseAverageBytes: responseSizes.length > 0 ? Math.round(responseJsonBytes / responseSizes.length) : 0,
    responseP50Bytes: percentileSorted(responseSizes, 0.5),
    responseP95Bytes: percentileSorted(responseSizes, 0.95),
    responseP99Bytes: percentileSorted(responseSizes, 0.99),
    responseMaxBytes: responseSizes.at(-1) || 0,
    responseShape: Object.freeze({...responseShape}),
    byAction: Object.freeze(actions),
  });
}

function receiptJsonByteLength(receipt, responseBytes) {
  const metadataJson = JSON.stringify({
    schemaVersion: receipt.schemaVersion,
    operationId: receipt.operationId,
    requestHash: receipt.requestHash,
    actionId: receipt.actionId,
    accountId: receipt.accountId,
    committedAt: receipt.committedAt,
    expiresAt: receipt.expiresAt,
  });
  return Buffer.byteLength(metadataJson) - 1
    + Buffer.byteLength(',"response":')
    + responseBytes
    + 1;
}

function emptyJsonShape() {
  return {arrays: 0, objects: 0, primitives: 0, strings: 0, stringCodeUnits: 0};
}

function addJsonShape(shape, value) {
  if (Array.isArray(value)) {
    shape.arrays += 1;
    for (const child of value) {
      addJsonShape(shape, child);
    }
    return;
  }
  if (value && typeof value === "object") {
    shape.objects += 1;
    for (const child of Object.values(value)) {
      addJsonShape(shape, child);
    }
    return;
  }
  shape.primitives += 1;
  if (typeof value === "string") {
    shape.strings += 1;
    shape.stringCodeUnits += value.length;
  }
}

function percentileSorted(values, ratio) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  return values[Math.max(0, Math.ceil(values.length * ratio) - 1)];
}

function activeDurableReceipt(data, operationId, nowMs) {
  const ledger = data && data.mutationReceipts;
  const receipt = isCanonicalDurableMutationReceipts(ledger)
    ? receiptVisibleToState(RECEIPT_LEDGER_STATE.get(ledger), operationId)
    : ledger && ledger[operationId];
  if (!receipt) {
    return null;
  }
  const expiresAtMs = Date.parse(String(receipt.expiresAt || ""));
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs ? receipt : null;
}

function stageDurableMutationReceiptPrune(value, nowMs, options = {}) {
  const ledger = canonicalDurableMutationReceipts(value);
  const source = RECEIPT_LEDGER_STATE.get(ledger);
  if (source.baseRevision !== source.lineage.revision) {
    throw receiptError("持久化操作回执基线已过期，请稍后重试。", "mutation_receipt_revision_stale");
  }
  const state = {
    baseRevision: source.baseRevision,
    deletes: new Map(source.deletes),
    lineage: source.lineage,
    upserts: new Map(source.upserts),
  };
  const maxExpired = positiveInteger(options.maxExpired, DURABLE_RECEIPT_PRUNE_BATCH);
  const reserveCount = Math.max(0, Math.trunc(Number(options.reserveCount ?? 1)));
  let deleteCount = state.deletes.size;
  for (const receipt of heapEffectiveReceipts(
    state.lineage.expiryHeap,
    state,
    compareExpiryNode,
    maxExpired,
    (entry) => entry.expiresAtMs <= nowMs,
  )) {
    if (!state.deletes.has(receipt.operationId)) {
      state.deletes.set(receipt.operationId, {
        expectedReceipt: receipt,
        reason: "expired",
      });
      deleteCount += 1;
    }
  }
  while (receiptStateCount(state) > DURABLE_RECEIPT_MAX_COUNT - reserveCount) {
    if (deleteCount >= maxExpired) {
      throw receiptError("持久化操作回执待清理数量过多，请稍后重试。", "mutation_receipt_prune_limit");
    }
    const oldest = heapEffectiveReceipts(
      state.lineage.oldestHeap,
      state,
      compareOldestNode,
      1,
      () => true,
    )[0];
    if (!oldest) {
      throw receiptError("持久化操作回执容量索引异常。", "mutation_receipt_capacity_index_invalid");
    }
    state.deletes.set(oldest.operationId, {
      expectedReceipt: oldest,
      reason: "capacity",
    });
    deleteCount += 1;
  }
  return createReceiptLedgerView(state.lineage, state.baseRevision, state.deletes, state.upserts);
}

function stageDurableMutationReceipt(value, rawReceipt, options = {}) {
  const nowMs = Number(options.nowMs);
  if (!Number.isFinite(nowMs)) {
    throw receiptError("持久化操作回执缺少权威时间。", "mutation_receipt_time_invalid");
  }
  const normalizedOperationId = String(rawReceipt && rawReceipt.operationId || "").trim();
  const receipt = normalizeReceiptRecord(normalizedOperationId, rawReceipt);
  let ledger = stageDurableMutationReceiptPrune(value, nowMs, options);
  const source = RECEIPT_LEDGER_STATE.get(ledger);
  const deletes = new Map(source.deletes);
  const upserts = new Map(source.upserts);
  const existing = receiptVisibleToState(source, receipt.operationId);
  if (existing) {
    const expiresAtMs = Date.parse(existing.expiresAt);
    if (expiresAtMs > nowMs) {
      throw receiptError("持久化操作回执已经存在，不能改写既有结果。", "mutation_receipt_operation_conflict");
    }
    deletes.set(receipt.operationId, {
      expectedReceipt: existing,
      reason: "expired_same_operation_id",
    });
  }
  upserts.set(receipt.operationId, receipt);
  ledger = createReceiptLedgerView(source.lineage, source.baseRevision, deletes, upserts);
  if (durableMutationReceiptCount(ledger) > DURABLE_RECEIPT_MAX_COUNT) {
    throw receiptError("持久化操作回执容量已满。", "mutation_receipt_capacity_exceeded");
  }
  return ledger;
}

function durableMutationReceiptDelta(value) {
  if (!isCanonicalDurableMutationReceipts(value)) {
    return {ok: false, reason: "not_canonical"};
  }
  const state = RECEIPT_LEDGER_STATE.get(value);
  return {
    ok: true,
    baseRevision: state.baseRevision,
    deletes: Array.from(state.deletes.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([operationId, entry]) => Object.freeze({operationId, ...entry})),
    upserts: Array.from(state.upserts.values())
      .sort((left, right) => left.operationId.localeCompare(right.operationId)),
  };
}

function durableMutationReceiptDeltaFrom(previousValue, nextValue) {
  if (!isCanonicalDurableMutationReceipts(previousValue) || !isCanonicalDurableMutationReceipts(nextValue)) {
    return {ok: false, reason: "not_canonical"};
  }
  const previous = RECEIPT_LEDGER_STATE.get(previousValue);
  const next = RECEIPT_LEDGER_STATE.get(nextValue);
  if (previous.lineage !== next.lineage) {
    return {ok: false, reason: "different_lineage"};
  }
  if (previous.deletes.size > 0 || previous.upserts.size > 0) {
    return {ok: false, reason: "previous_pending"};
  }
  if (
    previous.baseRevision !== next.baseRevision
    || previous.baseRevision !== previous.lineage.revision
  ) {
    return {ok: false, reason: "revision_mismatch"};
  }
  for (const [operationId, deletion] of next.deletes.entries()) {
    if (receiptAtRevision(previous.lineage, operationId, previous.baseRevision) !== deletion.expectedReceipt) {
      return {ok: false, reason: "delete_expected_mismatch"};
    }
  }
  for (const [operationId] of next.upserts.entries()) {
    if (
      receiptAtRevision(previous.lineage, operationId, previous.baseRevision)
      && !next.deletes.has(operationId)
    ) {
      return {ok: false, reason: "immutable_rewrite"};
    }
  }
  return durableMutationReceiptDelta(nextValue);
}

function commitDurableMutationReceiptDelta(value) {
  if (!isCanonicalDurableMutationReceipts(value)) {
    throw receiptError("持久化操作回执不是权威视图。", "mutation_receipt_ledger_invalid");
  }
  const state = RECEIPT_LEDGER_STATE.get(value);
  if (state.deletes.size === 0 && state.upserts.size === 0) {
    return value;
  }
  const touched = new Set([...state.deletes.keys(), ...state.upserts.keys()]);
  for (const [operationId, deletion] of state.deletes.entries()) {
    if (receiptAtRevision(state.lineage, operationId, state.lineage.revision) !== deletion.expectedReceipt) {
      throw receiptError("持久化操作回执提交冲突。", "mutation_receipt_commit_conflict");
    }
  }
  for (const operationId of state.upserts.keys()) {
    const current = receiptAtRevision(state.lineage, operationId, state.lineage.revision);
    if (current && !state.deletes.has(operationId)) {
      throw receiptError("持久化操作回执不能改写既有结果。", "mutation_receipt_commit_conflict");
    }
  }
  const revision = state.lineage.revision + 1;
  let count = state.lineage.countByRevision[state.lineage.revision] || 0;
  for (const operationId of touched) {
    const before = receiptAtRevision(state.lineage, operationId, state.lineage.revision);
    const after = state.upserts.get(operationId) || (state.deletes.has(operationId) ? null : before);
    if (!before && after) {
      count += 1;
    } else if (before && !after) {
      count -= 1;
    }
    const history = state.lineage.histories.get(operationId) || [];
    history.push({receipt: after, revision});
    state.lineage.histories.set(operationId, history);
    state.lineage.historyEntryCount += 1;
    state.lineage.keys.add(operationId);
    if (after) {
      const node = receiptHeapNode(after);
      heapPush(state.lineage.expiryHeap, node, compareExpiryNode);
      heapPush(state.lineage.oldestHeap, node, compareOldestNode);
    }
  }
  state.lineage.countByRevision.push(count);
  state.lineage.revision = revision;
  state.baseRevision = revision;
  state.deletes.clear();
  state.upserts.clear();
  pruneStaleHeapRoot(state.lineage.expiryHeap, state.lineage, compareExpiryNode);
  pruneStaleHeapRoot(state.lineage.oldestHeap, state.lineage, compareOldestNode);
  checkpointReceiptLineageIfNeeded(state);
  return value;
}

function checkpointReceiptLineageIfNeeded(state) {
  const lineage = state.lineage;
  const activeCount = lineage.countByRevision[lineage.revision] || 0;
  const deadKeyCount = Math.max(0, lineage.keys.size - activeCount);
  if (
    lineage.historyEntryCount < DURABLE_RECEIPT_CHECKPOINT_HISTORY_MAX
    && deadKeyCount < DURABLE_RECEIPT_CHECKPOINT_DEAD_KEY_MAX
    && lineage.expiryHeap.length <= activeCount + DURABLE_RECEIPT_CHECKPOINT_HEAP_OVERHEAD_MAX
    && lineage.oldestHeap.length <= activeCount + DURABLE_RECEIPT_CHECKPOINT_HEAP_OVERHEAD_MAX
  ) {
    return;
  }
  const baseline = {};
  for (const operationId of lineage.keys) {
    const receipt = receiptAtRevision(lineage, operationId, lineage.revision);
    if (receipt) {
      baseline[operationId] = receipt;
    }
  }
  const keys = Object.keys(baseline).sort();
  Object.freeze(baseline);
  state.lineage = createReceiptLineage(baseline, keys, {
    checkpointCount: lineage.checkpointCount + 1,
  });
  state.baseRevision = 0;
}

function discardDurableMutationReceiptDelta(value) {
  const ledger = canonicalDurableMutationReceipts(value);
  const state = RECEIPT_LEDGER_STATE.get(ledger);
  return createReceiptLedgerView(state.lineage, state.baseRevision, new Map(), new Map());
}

function rebaseDurableMutationReceipts(value) {
  const ledger = canonicalDurableMutationReceipts(value);
  const state = RECEIPT_LEDGER_STATE.get(ledger);
  if (state.deletes.size > 0 || state.upserts.size > 0) {
    throw receiptError("未提交回执不能静默重置基线。", "mutation_receipt_rebase_pending");
  }
  return createReceiptLedgerView(state.lineage, state.lineage.revision, new Map(), new Map());
}

function materializeDurableMutationReceipts(value) {
  const ledger = canonicalDurableMutationReceipts(value);
  const state = RECEIPT_LEDGER_STATE.get(ledger);
  const result = {};
  for (const operationId of visibleReceiptOperationIds(state)) {
    result[operationId] = materializeReceiptRecord(receiptVisibleToState(state, operationId));
  }
  return result;
}

function pruneDurableMutationReceipts(value, nowMs) {
  return materializeDurableMutationReceipts(stageDurableMutationReceiptPrune(value, nowMs));
}

function receiptHeapNode(receipt) {
  return Object.freeze({
    committedAtMs: Date.parse(receipt.committedAt),
    expiresAtMs: Date.parse(receipt.expiresAt),
    operationId: receipt.operationId,
    receipt,
  });
}

function compareExpiryNode(left, right) {
  return left.expiresAtMs - right.expiresAtMs
    || left.committedAtMs - right.committedAtMs
    || left.operationId.localeCompare(right.operationId);
}

function compareOldestNode(left, right) {
  return left.committedAtMs - right.committedAtMs
    || left.expiresAtMs - right.expiresAtMs
    || left.operationId.localeCompare(right.operationId);
}

function heapify(heap, compare) {
  for (let index = Math.floor(heap.length / 2) - 1; index >= 0; index -= 1) {
    heapSiftDown(heap, index, compare);
  }
}

function heapPush(heap, value, compare) {
  heap.push(value);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (compare(heap[parent], heap[index]) <= 0) {
      break;
    }
    [heap[parent], heap[index]] = [heap[index], heap[parent]];
    index = parent;
  }
}

function heapPop(heap, compare) {
  if (heap.length === 0) {
    return null;
  }
  const first = heap[0];
  const last = heap.pop();
  if (heap.length > 0) {
    heap[0] = last;
    heapSiftDown(heap, 0, compare);
  }
  return first;
}

function heapSiftDown(heap, start, compare) {
  let index = start;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    let smallest = index;
    if (left < heap.length && compare(heap[left], heap[smallest]) < 0) {
      smallest = left;
    }
    if (right < heap.length && compare(heap[right], heap[smallest]) < 0) {
      smallest = right;
    }
    if (smallest === index) {
      return;
    }
    [heap[index], heap[smallest]] = [heap[smallest], heap[index]];
    index = smallest;
  }
}

function heapEffectiveReceipts(heap, state, compare, limit, predicate) {
  if (heap.length === 0 || limit <= 0) {
    return [];
  }
  const frontier = [{index: 0, node: heap[0]}];
  const result = [];
  while (frontier.length > 0 && result.length < limit) {
    frontier.sort((left, right) => compare(left.node, right.node));
    const current = frontier.shift();
    const left = current.index * 2 + 1;
    const right = left + 1;
    if (left < heap.length) {
      frontier.push({index: left, node: heap[left]});
    }
    if (right < heap.length) {
      frontier.push({index: right, node: heap[right]});
    }
    const receipt = receiptVisibleToState(state, current.node.operationId);
    if (receipt !== current.node.receipt) {
      continue;
    }
    if (!predicate(current.node)) {
      break;
    }
    result.push(receipt);
  }
  return result;
}

function pruneStaleHeapRoot(heap, lineage, compare) {
  while (heap.length > 0) {
    const node = heap[0];
    if (receiptAtRevision(lineage, node.operationId, lineage.revision) === node.receipt) {
      return;
    }
    heapPop(heap, compare);
  }
}

function durableCommitResult(result, metadata) {
  return {
    ...result,
    durableCommit: {
      schemaVersion: 1,
      operationId: String(metadata.operationId || ""),
      actionId: String(metadata.actionId || ""),
      committedAt: String(metadata.committedAt || ""),
      replayed: Boolean(metadata.replayed),
    },
  };
}

function durableReceiptReplayResult(receipt) {
  const response = JSON.parse(receiptResponseJson(receipt));
  response.durableCommit = {
    ...objectOrEmpty(response.durableCommit),
    schemaVersion: 1,
    operationId: receipt.operationId,
    actionId: receipt.actionId,
    committedAt: receipt.committedAt,
    replayed: true,
  };
  return response;
}

function durableMutationAccountId(data, args, hashToken) {
  const token = durableMutationToken(args);
  if (token === "") {
    return "";
  }
  const tokenHash = hashToken(token);
  const session = Object.values(objectOrEmpty(data && data.sessions))
    .find((entry) => entry && entry.tokenHash === tokenHash);
  return String(session && session.accountId || "");
}

function durableMutationToken(args) {
  const credential = Array.isArray(args) ? args[0] : null;
  if (typeof credential === "string") {
    return credential;
  }
  if (credential && typeof credential === "object" && !Array.isArray(credential)) {
    return String(credential.token || "");
  }
  return "";
}

function receiptError(message, code = "mutation_receipt_invalid") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function positiveInteger(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  RUNTIME_ROOT_FIELDS,
  DURABLE_RECEIPT_TTL_MS,
  DURABLE_RECEIPT_MAX_COUNT,
  DURABLE_RECEIPT_PRUNE_BATCH,
  DURABLE_RECEIPT_CHECKPOINT_HISTORY_MAX,
  DURABLE_OPERATION_ID_PATTERN,
  DURABLE_REQUEST_HASH_PATTERN,
  DURABLE_RECEIPT_EXCLUDED_METHODS,
  durableBusinessChanged,
  restorePublishedPersistentData,
  mergeRuntimeObject,
  captureRuntimeRootDelta,
  mergeRuntimeObjectDelta,
  normalizeDurableMutationReceipts,
  canonicalDurableMutationReceipts,
  isCanonicalDurableMutationReceipts,
  durableMutationReceiptLedgerCanDescendFrom,
  durableMutationReceiptLedgersShareLineage,
  activeDurableReceipt,
  pruneDurableMutationReceipts,
  stageDurableMutationReceiptPrune,
  stageDurableMutationReceipt,
  materializeDurableMutationReceipts,
  durableMutationReceiptCount,
  durableMutationReceiptLedgerStats,
  durableMutationReceiptPayloadStats,
  durableMutationReceiptSignature,
  durableMutationReceiptDelta,
  durableMutationReceiptDeltaFrom,
  commitDurableMutationReceiptDelta,
  discardDurableMutationReceiptDelta,
  rebaseDurableMutationReceipts,
  durableCommitResult,
  durableReceiptReplayResult,
  durableMutationAccountId,
  durableMutationToken,
};
