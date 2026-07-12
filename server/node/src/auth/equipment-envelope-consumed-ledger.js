"use strict";

const CONSUMED_EQUIPMENT_ENVELOPE_SCHEMA_VERSION = 1;
const MAX_EQUIPMENT_ENVELOPE_ID_LENGTH = 160;
const LEDGER_RECORD_FIELDS = new Set(["schemaVersion", "envelopeId"]);
const LEDGER_INDEX_BY_CANONICAL_VALUE = new WeakMap();
let NEXT_LEDGER_LINEAGE_ID = 1;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function fail(code, message, details = {}) {
  return {ok: false, code, message, ...details};
}

function validEnvelopeId(value) {
  return (
    typeof value === "string"
    && value !== ""
    && value === value.trim()
    && value.length <= MAX_EQUIPMENT_ENVELOPE_ID_LENGTH
    && /^eqx_[A-Za-z0-9_-]{8,156}$/.test(value)
  );
}

function exactLedgerRecord(value) {
  return (
    isRecord(value)
    && Object.keys(value).length === LEDGER_RECORD_FIELDS.size
    && Object.keys(value).every((key) => LEDGER_RECORD_FIELDS.has(key))
  );
}

function readConsumedEquipmentEnvelopeLedgerIndex(value) {
  if (value === undefined) {
    value = {};
  }
  if (!isRecord(value)) {
    return fail(
      "equipment_consumed_ledger_invalid",
      "装备转运消费账本容器异常，相关资产操作已暂停，请联系GM处理。",
      {path: "consumedEquipmentEnvelopes", reason: "not_object"},
    );
  }
  const cached = LEDGER_INDEX_BY_CANONICAL_VALUE.get(value);
  if (cached) {
    return {ok: true, ledger: value, index: cached.publicIndex};
  }
  const ledger = {};
  const envelopeIds = new Set();
  for (const envelopeId of Object.keys(value).sort()) {
    const record = value[envelopeId];
    if (!validEnvelopeId(envelopeId)) {
      return fail(
        "equipment_consumed_ledger_identity_invalid",
        "装备转运消费账本含无效凭证编号，相关资产操作已暂停，请联系GM处理。",
        {path: `consumedEquipmentEnvelopes.${envelopeId}`, envelopeId},
      );
    }
    if (!exactLedgerRecord(record)) {
      return fail(
        "equipment_consumed_ledger_record_invalid",
        "装备转运消费账本记录异常，相关资产操作已暂停，请联系GM处理。",
        {path: `consumedEquipmentEnvelopes.${envelopeId}`, envelopeId},
      );
    }
    if (record.schemaVersion !== CONSUMED_EQUIPMENT_ENVELOPE_SCHEMA_VERSION) {
      const code = Number(record.schemaVersion) > CONSUMED_EQUIPMENT_ENVELOPE_SCHEMA_VERSION
        ? "equipment_consumed_ledger_schema_future"
        : "equipment_consumed_ledger_schema_invalid";
      return fail(
        code,
        "装备转运消费账本版本异常，相关资产操作已暂停，请联系GM处理。",
        {path: `consumedEquipmentEnvelopes.${envelopeId}`, envelopeId, schemaVersion: record.schemaVersion},
      );
    }
    if (record.envelopeId !== envelopeId || !validEnvelopeId(record.envelopeId)) {
      return fail(
        "equipment_consumed_ledger_identity_conflict",
        "装备转运消费账本索引与记录身份不一致，相关资产操作已暂停，请联系GM处理。",
        {
          path: `consumedEquipmentEnvelopes.${envelopeId}`,
          envelopeId,
          declaredEnvelopeId: record.envelopeId,
        },
      );
    }
    ledger[envelopeId] = Object.freeze(clone(record));
    envelopeIds.add(envelopeId);
  }
  return canonicalLedgerResult(ledger, envelopeIds);
}

function readConsumedEquipmentEnvelopeLedger(value) {
  const read = readConsumedEquipmentEnvelopeLedgerIndex(value);
  return read.ok ? {ok: true, ledger: read.ledger} : read;
}

function canonicalLedgerResult(ledger, envelopeIds) {
  Object.freeze(ledger);
  const shared = {
    baselineIds: envelopeIds,
    baselineIdsSorted: Object.freeze(Array.from(envelopeIds).sort()),
    baselineLedger: ledger,
    committedAdditions: new Map(),
    committedCountByRevision: [0],
    lineageId: NEXT_LEDGER_LINEAGE_ID,
    revision: 0,
  };
  NEXT_LEDGER_LINEAGE_ID += 1;
  const state = {
    baseRevision: 0,
    pendingAdditions: new Map(),
    shared,
  };
  registerCanonicalLedgerValue(ledger, state);
  const publicIndex = LEDGER_INDEX_BY_CANONICAL_VALUE.get(ledger).publicIndex;
  return {ok: true, ledger, index: publicIndex};
}

function recordForEnvelopeId(envelopeId) {
  return Object.freeze({
    schemaVersion: CONSUMED_EQUIPMENT_ENVELOPE_SCHEMA_VERSION,
    envelopeId,
  });
}

function committedAdditionVisible(state, envelopeId) {
  const committed = state.shared.committedAdditions.get(envelopeId);
  return committed && committed.revision <= state.baseRevision ? committed.record : undefined;
}

function recordVisibleToState(state, envelopeId) {
  return (
    state.pendingAdditions.get(envelopeId)
    || state.shared.baselineLedger[envelopeId]
    || committedAdditionVisible(state, envelopeId)
  );
}

function stateHasEnvelopeId(state, envelopeId) {
  return Boolean(recordVisibleToState(state, envelopeId));
}

function stateCount(state) {
  const committedCount = state.shared.committedCountByRevision[state.baseRevision] || 0;
  return state.shared.baselineIds.size + committedCount + state.pendingAdditions.size;
}

function visibleEnvelopeIds(state) {
  const ids = state.shared.baselineIdsSorted.slice();
  for (const [envelopeId, committed] of state.shared.committedAdditions.entries()) {
    if (committed.revision <= state.baseRevision) {
      ids.push(envelopeId);
    }
  }
  for (const envelopeId of state.pendingAdditions.keys()) {
    if (!state.shared.baselineIds.has(envelopeId)) {
      const committed = state.shared.committedAdditions.get(envelopeId);
      if (!committed || committed.revision > state.baseRevision) {
        ids.push(envelopeId);
      }
    }
  }
  return ids.sort();
}

function registerCanonicalLedgerValue(ledger, state) {
  const publicIndex = Object.freeze({
    get count() {
      return stateCount(state);
    },
    has(envelopeIdValue) {
      return stateHasEnvelopeId(state, String(envelopeIdValue || "").trim());
    },
  });
  LEDGER_INDEX_BY_CANONICAL_VALUE.set(ledger, {publicIndex, state});
  return ledger;
}

function createLedgerView(shared, baseRevision, pendingAdditions) {
  const state = {baseRevision, pendingAdditions, shared};
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
        const record = recordVisibleToState(state, property);
        if (record) {
          return record;
        }
      }
      return Reflect.get(targetValue, property, receiver);
    },
    getOwnPropertyDescriptor(targetValue, property) {
      if (typeof property === "string") {
        const record = recordVisibleToState(state, property);
        if (record) {
          return {configurable: true, enumerable: true, value: record, writable: false};
        }
      }
      return Reflect.getOwnPropertyDescriptor(targetValue, property);
    },
    has(targetValue, property) {
      return (
        (typeof property === "string" && stateHasEnvelopeId(state, property))
        || Reflect.has(targetValue, property)
      );
    },
    ownKeys() {
      return visibleEnvelopeIds(state);
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
  return registerCanonicalLedgerValue(ledger, state);
}

function canonicalLedgerState(value) {
  return LEDGER_INDEX_BY_CANONICAL_VALUE.get(value)?.state || null;
}

function isCanonicalConsumedEquipmentEnvelopeLedger(value) {
  return isRecord(value) && LEDGER_INDEX_BY_CANONICAL_VALUE.has(value);
}

function consumedEquipmentEnvelopeLedgersShareLineage(leftValue, rightValue) {
  const left = canonicalLedgerState(leftValue);
  const right = canonicalLedgerState(rightValue);
  return Boolean(left && right && left.shared === right.shared);
}

function consumedEquipmentEnvelopeLedgerCanDescendFrom(previousValue, nextValue) {
  const previous = canonicalLedgerState(previousValue);
  const next = canonicalLedgerState(nextValue);
  if (!previous || !next || previous.shared !== next.shared || next.baseRevision < previous.baseRevision) {
    return false;
  }
  for (const [envelopeId, record] of previous.pendingAdditions.entries()) {
    if (recordVisibleToState(next, envelopeId) !== record) {
      return false;
    }
  }
  return true;
}

function ensureConsumedEquipmentEnvelopeIds(ledgerValue, envelopeIdsValue) {
  const read = readConsumedEquipmentEnvelopeLedgerIndex(ledgerValue);
  if (!read.ok) {
    return read;
  }
  return ensureIdsOnCanonicalLedger(read, envelopeIdsValue);
}

function ensureIdsOnCanonicalLedger(canonicalRead, envelopeIdsValue) {
  const ids = Array.isArray(envelopeIdsValue) ? envelopeIdsValue : [envelopeIdsValue];
  const normalizedIds = new Set();
  for (const rawId of ids) {
    if (!validEnvelopeId(rawId)) {
      return fail(
        "equipment_consumed_envelope_id_invalid",
        "要写入消费账本的装备转运凭证编号无效，本次操作已取消。",
        {envelopeId: rawId},
      );
    }
    normalizedIds.add(rawId);
  }
  const addedIds = [];
  for (const envelopeId of Array.from(normalizedIds).sort()) {
    if (canonicalRead.index.has(envelopeId)) {
      continue;
    }
    addedIds.push(envelopeId);
  }
  if (addedIds.length === 0) {
    return {ok: true, ledger: canonicalRead.ledger, addedIds};
  }
  const currentState = canonicalLedgerState(canonicalRead.ledger);
  if (!currentState) {
    return fail(
      "equipment_consumed_ledger_state_missing",
      "装备转运消费账本状态异常，相关资产操作已暂停，请联系GM处理。",
    );
  }
  // A request-private view carries only its touched tombstones. The validated
  // and frozen baseline remains shared and unchanged until the caller commits
  // after durable storage succeeds.
  const pendingAdditions = new Map(currentState.pendingAdditions);
  for (const envelopeId of addedIds) {
    pendingAdditions.set(envelopeId, recordForEnvelopeId(envelopeId));
  }
  const ledger = createLedgerView(
    currentState.shared,
    currentState.baseRevision,
    pendingAdditions,
  );
  return {ok: true, ledger, addedIds};
}

function consumedEquipmentEnvelopeLedgerCount(value) {
  const cached = LEDGER_INDEX_BY_CANONICAL_VALUE.get(value);
  if (cached) {
    return cached.publicIndex.count;
  }
  const read = readConsumedEquipmentEnvelopeLedgerIndex(value);
  return read.ok ? read.index.count : 0;
}

function consumedEquipmentEnvelopeLedgerSignature(value) {
  const read = readConsumedEquipmentEnvelopeLedgerIndex(value);
  if (!read.ok) {
    return "invalid";
  }
  const state = canonicalLedgerState(read.ledger);
  const pendingIds = Array.from(state.pendingAdditions.keys()).sort();
  return `equipment-consumed:${state.shared.lineageId}:${state.baseRevision}:${pendingIds.join(",")}`;
}

function consumedEquipmentEnvelopeLedgerDelta(value) {
  const read = readConsumedEquipmentEnvelopeLedgerIndex(value);
  if (!read.ok) {
    return read;
  }
  const state = canonicalLedgerState(read.ledger);
  const addedIds = Array.from(state.pendingAdditions.keys()).sort();
  const records = {};
  for (const envelopeId of addedIds) {
    records[envelopeId] = state.pendingAdditions.get(envelopeId);
  }
  return {
    ok: true,
    addedIds: Object.freeze(addedIds),
    baseRevision: state.baseRevision,
    lineageId: state.shared.lineageId,
    records: Object.freeze(records),
  };
}

function consumedEquipmentEnvelopeLedgerDeltaFrom(previousValue, nextValue) {
  const previousRead = readConsumedEquipmentEnvelopeLedgerIndex(previousValue);
  if (!previousRead.ok) {
    return {...previousRead, deltaReason: "previous_invalid"};
  }
  const nextRead = readConsumedEquipmentEnvelopeLedgerIndex(nextValue);
  if (!nextRead.ok) {
    return {...nextRead, deltaReason: "next_invalid"};
  }
  const previousState = canonicalLedgerState(previousRead.ledger);
  const nextState = canonicalLedgerState(nextRead.ledger);
  if (previousState.shared !== nextState.shared) {
    return fail(
      "equipment_consumed_ledger_delta_lineage_mismatch",
      "装备转运消费账本不是同一权威版本，需回退完整校验。",
      {deltaReason: "lineage_mismatch"},
    );
  }
  if (previousState.pendingAdditions.size !== 0) {
    return fail(
      "equipment_consumed_ledger_delta_previous_pending",
      "装备转运消费账本基线仍含未提交记录，需回退完整校验。",
      {deltaReason: "previous_pending"},
    );
  }
  if (
    previousState.baseRevision !== nextState.baseRevision
    || previousState.baseRevision !== previousState.shared.revision
  ) {
    return fail(
      "equipment_consumed_ledger_delta_stale_baseline",
      "装备转运消费账本基线已过期，需回退完整校验。",
      {
        deltaReason: "stale_baseline",
        nextBaseRevision: nextState.baseRevision,
        previousBaseRevision: previousState.baseRevision,
        sharedRevision: previousState.shared.revision,
      },
    );
  }
  return consumedEquipmentEnvelopeLedgerDelta(nextRead.ledger);
}

function commitConsumedEquipmentEnvelopeLedger(value) {
  const read = readConsumedEquipmentEnvelopeLedgerIndex(value);
  if (!read.ok) {
    return read;
  }
  const state = canonicalLedgerState(read.ledger);
  if (state.pendingAdditions.size === 0) {
    return {ok: true, ledger: read.ledger, addedIds: Object.freeze([])};
  }
  const addedIds = [];
  const candidates = Array.from(state.pendingAdditions.keys()).sort();
  for (const envelopeId of candidates) {
    if (
      state.shared.baselineIds.has(envelopeId)
      || state.shared.committedAdditions.has(envelopeId)
    ) {
      continue;
    }
    addedIds.push(envelopeId);
  }
  if (addedIds.length > 0) {
    const revision = state.shared.revision + 1;
    for (const envelopeId of addedIds) {
      state.shared.committedAdditions.set(envelopeId, {
        record: state.pendingAdditions.get(envelopeId),
        revision,
      });
    }
    const priorCount = state.shared.committedCountByRevision[state.shared.revision] || 0;
    state.shared.committedCountByRevision.push(priorCount + addedIds.length);
    state.shared.revision = revision;
  }
  state.baseRevision = state.shared.revision;
  state.pendingAdditions.clear();
  return {ok: true, ledger: read.ledger, addedIds: Object.freeze(addedIds)};
}

function rebaseConsumedEquipmentEnvelopeLedger(value) {
  const read = readConsumedEquipmentEnvelopeLedgerIndex(value);
  if (!read.ok) {
    return read;
  }
  const state = canonicalLedgerState(read.ledger);
  const pendingAdditions = new Map();
  for (const [envelopeId, record] of state.pendingAdditions.entries()) {
    if (
      !state.shared.baselineIds.has(envelopeId)
      && !state.shared.committedAdditions.has(envelopeId)
    ) {
      pendingAdditions.set(envelopeId, record);
    }
  }
  if (
    state.baseRevision === state.shared.revision
    && pendingAdditions.size === state.pendingAdditions.size
  ) {
    return {ok: true, ledger: read.ledger};
  }
  return {
    ok: true,
    ledger: createLedgerView(state.shared, state.shared.revision, pendingAdditions),
  };
}

function materializeConsumedEquipmentEnvelopeLedger(value) {
  const read = readConsumedEquipmentEnvelopeLedgerIndex(value);
  if (!read.ok) {
    return read;
  }
  const state = canonicalLedgerState(read.ledger);
  if (
    state.baseRevision === 0
    && state.shared.revision === 0
    && state.pendingAdditions.size === 0
  ) {
    return {ok: true, ledger: state.shared.baselineLedger};
  }
  const ledger = {};
  const envelopeIds = new Set();
  for (const envelopeId of visibleEnvelopeIds(state)) {
    ledger[envelopeId] = recordVisibleToState(state, envelopeId);
    envelopeIds.add(envelopeId);
  }
  return canonicalLedgerResult(ledger, envelopeIds);
}

function originTrace(target, rawOriginEnvelopeId, path, details = {}, invalidReason = "") {
  target.push({
    originEnvelopeId: rawOriginEnvelopeId,
    path,
    ...details,
    ...(invalidReason === "" ? {} : {invalidReason}),
    schemaVersion: CONSUMED_EQUIPMENT_ENVELOPE_SCHEMA_VERSION,
  });
}

function appendEnvelopeOriginTrace(target, envelope, basePath, details = {}) {
  const state = isRecord(envelope) && isRecord(envelope.instanceState) ? envelope.instanceState : null;
  if (!state || !Object.hasOwn(state, "transferProvenance")) {
    return;
  }
  const path = `${basePath}.instanceState.transferProvenance.originEnvelopeId`;
  if (!isRecord(state.transferProvenance)) {
    originTrace(target, undefined, path, details, "transfer_provenance_not_object");
    return;
  }
  if (!Object.hasOwn(state.transferProvenance, "originEnvelopeId")) {
    originTrace(target, undefined, path, details, "origin_envelope_id_missing");
    return;
  }
  originTrace(target, state.transferProvenance.originEnvelopeId, path, details);
}

function collectMaterializedEquipmentEnvelopeTraces(rootValue) {
  const root = isRecord(rootValue) ? rootValue : {};
  const traces = [];
  for (const [profileKey, document] of Object.entries(isRecord(root.profiles) ? root.profiles : {})) {
    const profile = isRecord(document) && isRecord(document.profile) ? document.profile : null;
    if (!profile) {
      continue;
    }
    const playerId = String(document.playerId || profileKey || "").trim() || profileKey;
    for (const [instanceId, instance] of Object.entries(isRecord(profile.equipmentInstances)
      ? profile.equipmentInstances
      : {})) {
      if (isRecord(instance) && Object.hasOwn(instance, "transferProvenance")) {
        const path = `profiles.${profileKey}.profile.equipmentInstances.${instanceId}.transferProvenance.originEnvelopeId`;
        if (!isRecord(instance.transferProvenance)) {
          originTrace(
            traces,
            undefined,
            path,
            {ownerId: `${playerId}:${instanceId}`, playerId, instanceId, traceContainerKind: "profile"},
            "transfer_provenance_not_object",
          );
          continue;
        }
        if (!Object.hasOwn(instance.transferProvenance, "originEnvelopeId")) {
          originTrace(
            traces,
            undefined,
            path,
            {ownerId: `${playerId}:${instanceId}`, playerId, instanceId, traceContainerKind: "profile"},
            "origin_envelope_id_missing",
          );
          continue;
        }
        originTrace(
          traces,
          instance.transferProvenance.originEnvelopeId,
          path,
          {ownerId: `${playerId}:${instanceId}`, playerId, instanceId, traceContainerKind: "profile"},
        );
      }
    }
    const bank = isRecord(profile.bank) ? profile.bank : {};
    for (const [slotIndex, slot] of (Array.isArray(bank.slots) ? bank.slots : []).entries()) {
      for (const [envelopeIndex, envelope] of (Array.isArray(slot && slot.equipmentEnvelopes)
        ? slot.equipmentEnvelopes
        : []).entries()) {
        appendEnvelopeOriginTrace(
          traces,
          envelope,
          `profiles.${profileKey}.profile.bank.slots[${slotIndex}].equipmentEnvelopes[${envelopeIndex}]`,
          {
            ownerId: `bank:${playerId}:${slotIndex}:${envelopeIndex}`,
            playerId,
            slotIndex,
            envelopeIndex,
            traceContainerKind: "bank",
          },
        );
      }
    }
  }
  for (const [mailKey, mail] of Object.entries(isRecord(root.mailMessages) ? root.mailMessages : {})) {
    for (const [envelopeIndex, envelope] of (Array.isArray(mail && mail.equipmentEnvelopes)
      ? mail.equipmentEnvelopes
      : []).entries()) {
      appendEnvelopeOriginTrace(
        traces,
        envelope,
        `mailMessages.${mailKey}.equipmentEnvelopes[${envelopeIndex}]`,
        {ownerId: `mail:${mailKey}:${envelopeIndex}`, mailKey, envelopeIndex, traceContainerKind: "mail"},
      );
    }
  }
  for (const [listingKey, listing] of Object.entries(isRecord(root.marketListings) ? root.marketListings : {})) {
    appendEnvelopeOriginTrace(
      traces,
      listing && listing.equipmentEnvelope,
      `marketListings.${listingKey}.equipmentEnvelope`,
      {ownerId: `market:${listingKey}`, listingKey, traceContainerKind: "market"},
    );
  }
  return traces.sort((left, right) => left.path.localeCompare(right.path));
}

function backfillConsumedEquipmentEnvelopeLedger(rootValue, ledgerValue = undefined) {
  const root = isRecord(rootValue) ? rootValue : {};
  const read = readConsumedEquipmentEnvelopeLedgerIndex(
    ledgerValue === undefined ? root.consumedEquipmentEnvelopes : ledgerValue,
  );
  if (!read.ok) {
    return read;
  }
  const traces = collectMaterializedEquipmentEnvelopeTraces(root);
  for (const trace of traces) {
    if (trace.invalidReason || !validEnvelopeId(trace.originEnvelopeId)) {
      return fail(
        "equipment_materialized_origin_invalid",
        "装备实例含无效的历史转运凭证，相关资产操作已暂停，请联系GM处理。",
        {path: trace.path, originEnvelopeId: trace.originEnvelopeId, reason: trace.invalidReason || "invalid_id"},
      );
    }
  }
  const ensured = ensureIdsOnCanonicalLedger(
    read,
    traces.map((trace) => trace.originEnvelopeId),
  );
  if (!ensured.ok) {
    return ensured;
  }
  // Backfill is an explicit migration/audit boundary. Return an ordinary
  // frozen object when it actually created historical rows so offline tools
  // can continue to use structuredClone. Runtime appends are already present
  // before this audit and therefore keep their request-private delta view.
  if (ensured.addedIds.length > 0) {
    const materialized = materializeConsumedEquipmentEnvelopeLedger(ensured.ledger);
    if (!materialized.ok) {
      return materialized;
    }
    return {...ensured, ledger: materialized.ledger, traces};
  }
  return {...ensured, traces};
}

module.exports = {
  CONSUMED_EQUIPMENT_ENVELOPE_SCHEMA_VERSION,
  MAX_EQUIPMENT_ENVELOPE_ID_LENGTH,
  backfillConsumedEquipmentEnvelopeLedger,
  collectMaterializedEquipmentEnvelopeTraces,
  commitConsumedEquipmentEnvelopeLedger,
  consumedEquipmentEnvelopeLedgerCount,
  consumedEquipmentEnvelopeLedgerCanDescendFrom,
  consumedEquipmentEnvelopeLedgerDelta,
  consumedEquipmentEnvelopeLedgerDeltaFrom,
  consumedEquipmentEnvelopeLedgerSignature,
  consumedEquipmentEnvelopeLedgersShareLineage,
  ensureConsumedEquipmentEnvelopeIds,
  isCanonicalConsumedEquipmentEnvelopeLedger,
  materializeConsumedEquipmentEnvelopeLedger,
  readConsumedEquipmentEnvelopeLedger,
  readConsumedEquipmentEnvelopeLedgerIndex,
  rebaseConsumedEquipmentEnvelopeLedger,
  validEnvelopeId,
};
