"use strict";

const {
  consumedEquipmentEnvelopeLedgerCanDescendFrom,
  isCanonicalConsumedEquipmentEnvelopeLedger,
} = require("./equipment-envelope-consumed-ledger");
const {
  durableMutationReceiptLedgerCanDescendFrom,
  isCanonicalDurableMutationReceipts,
} = require("./durable-mutation-state");

const CONSUMED_EQUIPMENT_ENVELOPES_KEY = "consumedEquipmentEnvelopes";
const MUTATION_RECEIPTS_KEY = "mutationReceipts";
const IMMUTABLE_JOURNAL_ARRAY_KEYS = Object.freeze([
  "battleRecords",
  "battleTrace",
  "chatMessages",
  "gmCommandAudit",
  "authEvents",
  "serviceEvents",
]);
const IMMUTABLE_RECORD_VALUE_KEYS = Object.freeze([
  "battleRooms",
  "battleRoomRecoveries",
  "playerPositions",
  "profiles",
]);
const IMMUTABLE_IDENTITY_RECORD_VALUE_KEYS = Object.freeze([
  "accounts",
  "sessions",
  "profileBindings",
]);
const IMMUTABLE_PRIMITIVE_MAP_KEYS = Object.freeze([
  "battleRoomRecoveryByAccountId",
]);
const TRUSTED_AUTHORITY_ROOTS = new WeakMap();
const DEEPLY_FROZEN_JSON_VALUES = new WeakSet();
const AUTHORITY_CERTIFICATION_COUNTERS = {
  cowRecordContainers: 0,
  deepFrozenTopLevelValues: 0,
  journalContainers: 0,
  transientCertifiedValues: 0,
  trustedRoots: 0,
};
const CERTIFIED_JOURNAL_CONTAINERS = new WeakSet();
const CERTIFIED_COW_RECORD_CONTAINERS = new WeakSet();
const PLAYER_POSITION_VALUE_MARKER = Symbol("beastbound.player_position_value");
const PLAYER_POSITION_CONTAINER_MARKER = Symbol("beastbound.player_position_container");
const PENDING_PLAYER_POSITION_ROOT_CERTIFICATIONS = new WeakSet();
const SCHEMA_CERTIFIED_IDENTITY_VALUES = Object.freeze({
  accounts: new WeakSet(),
  sessions: new WeakSet(),
  profileBindings: new WeakSet(),
});
const SCHEMA_CERTIFIED_IDENTITY_CONTAINERS = Object.freeze({
  accounts: new WeakSet(),
  sessions: new WeakSet(),
  profileBindings: new WeakSet(),
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

// The two large authority ledgers expose immutable MVCC views. Normalized
// bounded journals freeze both entries and containers; writers obtain a
// request-private container through authorityRootJournalForMutation(). Sharing
// those immutable containers between request-private candidates avoids copying
// and rescanning history on unrelated writes. Untrusted roots still take the
// full clone path and are audited by normalize.
function cloneAuthorityRoot(value) {
  if (!isRecord(value)) {
    return value === undefined ? undefined : cloneJson(value);
  }
  if (authorityRootTrustCompromised(value)) {
    const error = new Error("权威大型账本身份已被替换，拒绝继续使用旧可信索引。");
    error.code = "authority_root_large_collection_identity_replaced";
    throw error;
  }
  const ledger = value[CONSUMED_EQUIPMENT_ENVELOPES_KEY];
  const receipts = value[MUTATION_RECEIPTS_KEY];
  const shareLedger = isCanonicalConsumedEquipmentEnvelopeLedger(ledger);
  const shareReceipts = isCanonicalDurableMutationReceipts(receipts);
  const trustedRoot = isTrustedAuthorityRoot(value);
  const sharedJournalArrays = trustedRoot
    ? IMMUTABLE_JOURNAL_ARRAY_KEYS.filter((key) => immutableJournalCanShare(key, value[key], value))
    : [];
  const sharedRecordMaps = trustedRoot
    ? IMMUTABLE_RECORD_VALUE_KEYS.filter((key) => immutableRecordValuesCanShare(key, value[key], value))
    : [];
  const sharedIdentityRecordMaps = trustedRoot
    ? IMMUTABLE_IDENTITY_RECORD_VALUE_KEYS.filter((key) => identityRecordValuesCanShare(key, value[key]))
    : [];
  const sharedPrimitiveMaps = trustedRoot
    ? IMMUTABLE_PRIMITIVE_MAP_KEYS.filter((key) => primitiveMapCanShare(value[key]))
    : [];
  if (
    !shareLedger
    && !shareReceipts
    && sharedJournalArrays.length === 0
    && sharedRecordMaps.length === 0
    && sharedIdentityRecordMaps.length === 0
    && sharedPrimitiveMaps.length === 0
  ) {
    return cloneJson(value);
  }
  const withoutSharedLedgers = {...value};
  if (shareLedger) {
    delete withoutSharedLedgers[CONSUMED_EQUIPMENT_ENVELOPES_KEY];
  }
  if (shareReceipts) {
    delete withoutSharedLedgers[MUTATION_RECEIPTS_KEY];
  }
  for (const key of [
    ...sharedJournalArrays,
    ...sharedRecordMaps,
    ...sharedIdentityRecordMaps,
    ...sharedPrimitiveMaps,
  ]) {
    delete withoutSharedLedgers[key];
  }
  const cloned = cloneJson(withoutSharedLedgers);
  if (shareLedger) {
    cloned[CONSUMED_EQUIPMENT_ENVELOPES_KEY] = ledger;
  }
  if (shareReceipts) {
    cloned[MUTATION_RECEIPTS_KEY] = receipts;
  }
  for (const key of sharedJournalArrays) {
    cloned[key] = value[key];
  }
  for (const key of [...sharedRecordMaps, ...sharedIdentityRecordMaps, ...sharedPrimitiveMaps]) {
    cloned[key] = {...value[key]};
  }
  if (trustedRoot && shareLedger && shareReceipts) {
    markAuthorityRootTrusted(cloned);
  }
  return cloned;
}

// Published journal containers and entries are immutable. Domains append,
// evict or replace only after authorityRootJournalForMutation() creates a
// request-private shallow container.
function freezeAuthorityRootJournal(value) {
  const journal = Array.isArray(value) ? value : [];
  let certifiable = true;
  for (const entry of journal) {
    if (!deepFreezeJsonValue(entry)) {
      certifiable = false;
    }
  }
  Object.freeze(journal);
  if (certifiable) {
    if (!CERTIFIED_JOURNAL_CONTAINERS.has(journal)) {
      AUTHORITY_CERTIFICATION_COUNTERS.journalContainers += 1;
    }
    CERTIFIED_JOURNAL_CONTAINERS.add(journal);
  }
  return journal;
}

function authorityRootJournalForMutation(data, key) {
  if (!data || typeof data !== "object" || Array.isArray(data) || String(key || "") === "") {
    return [];
  }
  const current = Array.isArray(data[key]) ? data[key] : [];
  if (Object.isFrozen(current) || CERTIFIED_JOURNAL_CONTAINERS.has(current)) {
    const mutable = current.slice();
    data[key] = mutable;
    return mutable;
  }
  if (!Array.isArray(data[key])) {
    data[key] = current;
  }
  return current;
}

function freezeAuthorityRootRecordValues(value) {
  const records = isRecord(value) ? value : {};
  for (const entry of Object.values(records)) {
    deepFreezeJsonValue(entry);
  }
  return records;
}

function freezeAuthorityRootCowRecordValues(value) {
  const records = isRecord(value) ? value : {};
  let certifiable = true;
  for (const entry of Object.values(records)) {
    if (!deepFreezeJsonValue(entry)) {
      certifiable = false;
    }
  }
  Object.freeze(records);
  if (certifiable) {
    if (!CERTIFIED_COW_RECORD_CONTAINERS.has(records)) {
      AUTHORITY_CERTIFICATION_COUNTERS.cowRecordContainers += 1;
    }
    CERTIFIED_COW_RECORD_CONTAINERS.add(records);
  }
  return records;
}

// Player positions are flat, server-built JSON records replaced at movement
// frequency. Marking every short-lived value in the global deep-freeze WeakSet
// creates a periodic ephemeron-table pause. Private symbols let this one
// schema retain the same immutable/canonical proof without retaining every old
// position in a process-wide certification table; JSON persistence ignores the
// non-enumerable marker and revalidates after load.
function freezeAuthorityRootPlayerPositionValue(value) {
  if (!isRecord(value) || !jsonContainerCanCertify(value)) {
    return false;
  }
  const marker = Object.getOwnPropertyDescriptor(value, PLAYER_POSITION_VALUE_MARKER);
  if (
    marker
    && marker.value === true
    && marker.enumerable === false
    && marker.configurable === false
    && marker.writable === false
    && Object.isFrozen(value)
  ) {
    return playerPositionValueCanShare(value);
  }
  let certifiable = true;
  try {
    for (const key of Reflect.ownKeys(value)) {
      if (key === PLAYER_POSITION_VALUE_MARKER) {
        certifiable = false;
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        typeof key !== "string"
        || !descriptor
        || !descriptor.enumerable
        || !Object.hasOwn(descriptor, "value")
        || !jsonPrimitiveCanCertify(descriptor.value)
      ) {
        certifiable = false;
      }
    }
    if (certifiable) {
      Object.defineProperty(value, PLAYER_POSITION_VALUE_MARKER, {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false,
      });
    }
    Object.freeze(value);
  } catch {
    return false;
  }
  return certifiable && playerPositionValueCanShare(value);
}

function freezeAuthorityRootPlayerPositionValues(value) {
  const records = isRecord(value) ? value : {};
  if (playerPositionRecordValuesCanShare(records)) {
    PENDING_PLAYER_POSITION_ROOT_CERTIFICATIONS.add(records);
    return records;
  }
  let certifiable = jsonContainerCanCertify(records);
  try {
    for (const key of Reflect.ownKeys(records)) {
      if (key === PLAYER_POSITION_CONTAINER_MARKER) {
        certifiable = false;
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(records, key);
      if (
        typeof key !== "string"
        || !descriptor
        || !descriptor.enumerable
        || !Object.hasOwn(descriptor, "value")
        || !freezeAuthorityRootPlayerPositionValue(descriptor.value)
        || String(descriptor.value && descriptor.value.accountId || "") !== key
      ) {
        certifiable = false;
      }
    }
    if (certifiable && !Object.hasOwn(records, PLAYER_POSITION_CONTAINER_MARKER)) {
      Object.defineProperty(records, PLAYER_POSITION_CONTAINER_MARKER, {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false,
      });
    }
    Object.freeze(records);
    if (certifiable && playerPositionRecordValuesCanShare(records)) {
      PENDING_PLAYER_POSITION_ROOT_CERTIFICATIONS.add(records);
    }
  } catch {
    return records;
  }
  return records;
}

function authorityRootRecordForMutation(data, key) {
  if (!data || typeof data !== "object" || Array.isArray(data) || String(key || "") === "") {
    return {};
  }
  const current = isRecord(data[key]) ? data[key] : {};
  if (Object.isFrozen(current) || CERTIFIED_COW_RECORD_CONTAINERS.has(current)) {
    const mutable = {...current};
    data[key] = mutable;
    return mutable;
  }
  if (!isRecord(data[key])) {
    data[key] = current;
  }
  return current;
}

// Account, session and profile-binding documents are security identities, not
// generic JSON blobs. They may be shared only after both the complete deep
// freeze walk and the bucket-specific identity invariants have passed. This
// separate marker prevents a caller from making an arbitrary object shareable
// merely by passing it through freezeAuthorityRootRecordValues().
function freezeAuthorityRootIdentityRecordValues(bucketKey, value) {
  const records = isRecord(value) ? value : {};
  const certifiedValues = SCHEMA_CERTIFIED_IDENTITY_VALUES[bucketKey];
  const certifiedContainers = SCHEMA_CERTIFIED_IDENTITY_CONTAINERS[bucketKey];
  if (!certifiedValues || !certifiedContainers) {
    return records;
  }
  let certifiable = true;
  for (const [recordKey, entry] of Object.entries(records)) {
    const deeplyFrozen = deepFreezeJsonValue(entry);
    if (deeplyFrozen && identityRecordMatchesBucket(bucketKey, recordKey, entry)) {
      certifiedValues.add(entry);
    } else {
      certifiable = false;
    }
  }
  Object.freeze(records);
  if (certifiable) {
    certifiedContainers.add(records);
  }
  return records;
}

function immutableJournalCanShare(key, value, root = null) {
  if (!Array.isArray(value) || !Object.isFrozen(value)) {
    return false;
  }
  if (key === "serviceEvents") {
    const trusted = isRecord(root) ? TRUSTED_AUTHORITY_ROOTS.get(root) : null;
    return Boolean(trusted) && trusted.serviceEvents === value;
  }
  return (
    CERTIFIED_JOURNAL_CONTAINERS.has(value)
    || value.every(immutableEntryCanShare)
  );
}

function authorityRootServiceEventWindowCanShare(value) {
  if (!Array.isArray(value) || !Object.isFrozen(value)) {
    return false;
  }
  let previousSeq = 0;
  for (const event of value) {
    const eventSeq = Number(event && event.eventSeq);
    if (
      !isRecord(event)
      || !immutableEntryCanShare(event)
      || !Number.isSafeInteger(eventSeq)
      || eventSeq <= previousSeq
      || typeof event.type !== "string"
      || event.type.trim() === ""
    ) {
      return false;
    }
    previousSeq = eventSeq;
  }
  return true;
}

function immutableRecordValuesCanShare(key, value, root = null) {
  if (key === "playerPositions") {
    const trusted = isRecord(root) ? TRUSTED_AUTHORITY_ROOTS.get(root) : null;
    return Boolean(trusted) && trusted.playerPositions === value;
  }
  return isRecord(value) && (
    CERTIFIED_COW_RECORD_CONTAINERS.has(value)
    || Object.values(value).every(immutableEntryCanShare)
  );
}

function playerPositionValueCanShare(value) {
  if (!isRecord(value) || !jsonContainerCanCertify(value) || !Object.isFrozen(value)) {
    return false;
  }
  const marker = Object.getOwnPropertyDescriptor(value, PLAYER_POSITION_VALUE_MARKER);
  if (
    !marker
    || marker.value !== true
    || marker.enumerable !== false
    || marker.configurable !== false
    || marker.writable !== false
  ) {
    return false;
  }
  try {
    for (const key of Reflect.ownKeys(value)) {
      if (key === PLAYER_POSITION_VALUE_MARKER) {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        typeof key !== "string"
        || !descriptor
        || !descriptor.enumerable
        || !Object.hasOwn(descriptor, "value")
        || !jsonPrimitiveCanCertify(descriptor.value)
      ) {
        return false;
      }
    }
  } catch {
    return false;
  }
  return true;
}

function playerPositionRecordValuesCanShare(value) {
  if (!isRecord(value) || !jsonContainerCanCertify(value) || !Object.isFrozen(value)) {
    return false;
  }
  const marker = Object.getOwnPropertyDescriptor(value, PLAYER_POSITION_CONTAINER_MARKER);
  if (
    !marker
    || marker.value !== true
    || marker.enumerable !== false
    || marker.configurable !== false
    || marker.writable !== false
  ) {
    return false;
  }
  try {
    for (const key of Reflect.ownKeys(value)) {
      if (key === PLAYER_POSITION_CONTAINER_MARKER) {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        typeof key !== "string"
        || !descriptor
        || !descriptor.enumerable
        || !Object.hasOwn(descriptor, "value")
        || !playerPositionValueCanShare(descriptor.value)
        || String(descriptor.value && descriptor.value.accountId || "") !== key
      ) {
        return false;
      }
    }
  } catch {
    return false;
  }
  return true;
}

function identityRecordValuesCanShare(bucketKey, value) {
  const certifiedValues = SCHEMA_CERTIFIED_IDENTITY_VALUES[bucketKey];
  const certifiedContainers = SCHEMA_CERTIFIED_IDENTITY_CONTAINERS[bucketKey];
  if (certifiedContainers && certifiedContainers.has(value)) {
    return true;
  }
  return Boolean(certifiedValues)
    && isRecord(value)
    && Object.entries(value).every(([recordKey, entry]) => (
      immutableEntryCanShare(entry)
      && certifiedValues.has(entry)
      && identityRecordMatchesBucket(bucketKey, recordKey, entry)
    ));
}

function identityRecordMatchesBucket(bucketKey, recordKey, value) {
  if (!isRecord(value) || String(recordKey || "") === "") {
    return false;
  }
  if (bucketKey === "accounts") {
    return String(value.accountId || "") !== ""
      && String(value.username || "") === String(recordKey);
  }
  if (bucketKey === "sessions") {
    return String(value.sessionId || "") === String(recordKey)
      && String(value.accountId || "") !== ""
      && String(value.tokenHash || "") !== ""
      && String(value.expiresAt || "") !== "";
  }
  if (bucketKey === "profileBindings") {
    const revision = Number(value.profileRevision || 0);
    return String(value.accountId || "") === String(recordKey)
      && String(value.playerId || "") !== ""
      && Number.isSafeInteger(revision)
      && revision >= 0;
  }
  return false;
}

function primitiveMapCanShare(value) {
  return isRecord(value) && Object.values(value).every(jsonPrimitiveCanCertify);
}

function immutableEntryCanShare(value) {
  return jsonPrimitiveCanCertify(value)
    || isCertifiedAuthorityRootJsonValue(value);
}

// Normalizers use this only as a fast path for values that previously passed
// our complete JSON-container walk. Object.isFrozen() alone is insufficient:
// an external caller can shallow-freeze a record while leaving mutable nested
// children behind.
function isCertifiedAuthorityRootJsonValue(value) {
  return Boolean(value)
    && typeof value === "object"
    && DEEPLY_FROZEN_JSON_VALUES.has(value);
}

// Callers may use this only for request-private values whose ownership has
// already been transferred to the authority normalizer. Certifying in place
// avoids a JSON stringify/parse allocation for large canonical event payloads;
// false means the caller must retain its defensive canonicalization fallback.
function certifyOwnedAuthorityRootJsonValue(value) {
  return deepFreezeJsonValue(value);
}

// Replay events need the same complete JSON/freeze proof. The generic helper
// records only the certified top-level identity in a WeakSet; recursive child
// nodes are frozen but never registered. The authority root keeps the active
// 500-event window alive, while evicted event trees can be reclaimed at once.
function certifyOwnedAuthorityRootTransientJsonValue(value) {
  if (!value || typeof value !== "object") {
    return jsonPrimitiveCanCertify(value);
  }
  const alreadyCertified = isCertifiedAuthorityRootJsonValue(value);
  const certified = deepFreezeJsonValue(value);
  if (certified && !alreadyCertified) {
    AUTHORITY_CERTIFICATION_COUNTERS.transientCertifiedValues += 1;
  }
  return certified;
}

function deepFreezeJsonValue(value, visiting = new Set()) {
  const certified = deepFreezeJsonValueInternal(value, visiting);
  if (certified && value && typeof value === "object") {
    if (!DEEPLY_FROZEN_JSON_VALUES.has(value)) {
      AUTHORITY_CERTIFICATION_COUNTERS.deepFrozenTopLevelValues += 1;
    }
    DEEPLY_FROZEN_JSON_VALUES.add(value);
  }
  return certified;
}

function deepFreezeJsonValueInternal(value, visiting) {
  if (!value || typeof value !== "object") {
    return jsonPrimitiveCanCertify(value);
  }
  if (DEEPLY_FROZEN_JSON_VALUES.has(value)) {
    return true;
  }
  if (!jsonContainerCanCertify(value) || visiting.has(value)) {
    return false;
  }
  visiting.add(value);
  let certifiable = true;
  const arrayValue = Array.isArray(value);
  let arrayIndexCount = 0;
  try {
    for (const key of Reflect.ownKeys(value)) {
      if (arrayValue && key === "length") {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const canonicalIndex = arrayValue && typeof key === "string"
        ? canonicalArrayIndex(key, value.length)
        : false;
      if (canonicalIndex) {
        arrayIndexCount += 1;
      }
      if (
        typeof key !== "string"
        || !descriptor
        || !descriptor.enumerable
        || !Object.hasOwn(descriptor, "value")
        || (arrayValue && !canonicalIndex)
      ) {
        certifiable = false;
        continue;
      }
      if (!deepFreezeJsonValueInternal(descriptor.value, visiting)) {
        certifiable = false;
      }
    }
    // JSON has no representation for an array hole: stringify converts it to
    // null. Reject sparse arrays so an in-memory certified value cannot change
    // meaning after persistence or restart.
    if (arrayValue && arrayIndexCount !== value.length) {
      certifiable = false;
    }
  } catch {
    certifiable = false;
  } finally {
    visiting.delete(value);
  }
  try {
    Object.freeze(value);
  } catch {
    return false;
  }
  if (certifiable && Object.isFrozen(value)) {
    return true;
  }
  return false;
}

// Final-only capacity diagnostics prove that replay certification retains no
// enumerable strong generations. Scanning the active replay window is still
// reserved for explicit final diagnostics, never health or per-second metrics.
function authorityRootCertificationRetentionDiagnostics(activeServiceEvents = []) {
  const activeEvents = new Set(Array.isArray(activeServiceEvents) ? activeServiceEvents : []);
  const emptyStrongGeneration = Object.freeze({
    count: 0,
    jsonBytes: 0,
    activeIdentityOverlapCount: 0,
    byType: Object.freeze({}),
  });
  const activeWindowJsonBytes = Array.from(activeEvents).reduce(
    (total, value) => total + Math.max(0, diagnosticJsonByteLength(value)),
    0,
  );
  return Object.freeze({
    mode: "weak_top_level_identity",
    generationLimit: 0,
    current: emptyStrongGeneration,
    previous: emptyStrongGeneration,
    uniqueRetained: emptyStrongGeneration,
    activeWindowCount: activeEvents.size,
    activeWindowJsonBytes,
    activeWindowCertifiedCount: Array.from(activeEvents)
      .filter((value) => DEEPLY_FROZEN_JSON_VALUES.has(value)).length,
    counters: Object.freeze({...AUTHORITY_CERTIFICATION_COUNTERS}),
  });
}

function diagnosticJsonByteLength(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch {
    return -1;
  }
}

function jsonPrimitiveCanCertify(value) {
  return value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value));
}

function jsonContainerCanCertify(value) {
  try {
    const prototype = Object.getPrototypeOf(value);
    return Array.isArray(value)
      ? prototype === Array.prototype
      : (prototype === Object.prototype || prototype === null);
  } catch {
    return false;
  }
}

function canonicalArrayIndex(key, length) {
  if (!/^(0|[1-9][0-9]*)$/.test(key)) {
    return false;
  }
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}

function markAuthorityRootTrusted(value) {
  if (
    isRecord(value)
    && isCanonicalConsumedEquipmentEnvelopeLedger(value[CONSUMED_EQUIPMENT_ENVELOPES_KEY])
    && isCanonicalDurableMutationReceipts(value[MUTATION_RECEIPTS_KEY])
  ) {
    const playerPositions = value.playerPositions;
    const serviceEvents = value.serviceEvents;
    const playerPositionsCertified = PENDING_PLAYER_POSITION_ROOT_CERTIFICATIONS.has(playerPositions)
      || playerPositionRecordValuesCanShare(playerPositions);
    PENDING_PLAYER_POSITION_ROOT_CERTIFICATIONS.delete(playerPositions);
    TRUSTED_AUTHORITY_ROOTS.set(value, {
      consumedEquipmentEnvelopes: value[CONSUMED_EQUIPMENT_ENVELOPES_KEY],
      mutationReceipts: value[MUTATION_RECEIPTS_KEY],
      playerPositions: playerPositionsCertified ? playerPositions : null,
      serviceEvents: authorityRootServiceEventWindowCanShare(serviceEvents) ? serviceEvents : null,
    });
    AUTHORITY_CERTIFICATION_COUNTERS.trustedRoots += 1;
    return true;
  }
  return false;
}

function isTrustedAuthorityRoot(value) {
  if (!isRecord(value)) {
    return false;
  }
  const trusted = TRUSTED_AUTHORITY_ROOTS.get(value);
  if (!trusted) {
    return false;
  }
  const ledger = value[CONSUMED_EQUIPMENT_ENVELOPES_KEY];
  const receipts = value[MUTATION_RECEIPTS_KEY];
  return (
    isCanonicalConsumedEquipmentEnvelopeLedger(ledger)
    && isCanonicalDurableMutationReceipts(receipts)
    && consumedEquipmentEnvelopeLedgerCanDescendFrom(
      trusted.consumedEquipmentEnvelopes,
      ledger,
    )
    && durableMutationReceiptLedgerCanDescendFrom(
      trusted.mutationReceipts,
      receipts,
    )
  );
}

function authorityRootTrustCompromised(value) {
  return isRecord(value) && TRUSTED_AUTHORITY_ROOTS.has(value) && !isTrustedAuthorityRoot(value);
}

function authorityRootCloneDiagnostics(value) {
  if (!isRecord(value)) {
    return {trusted: false, shared: [], clonedFieldBytes: {}};
  }
  const shared = new Set();
  if (isCanonicalConsumedEquipmentEnvelopeLedger(value[CONSUMED_EQUIPMENT_ENVELOPES_KEY])) {
    shared.add(CONSUMED_EQUIPMENT_ENVELOPES_KEY);
  }
  if (isCanonicalDurableMutationReceipts(value[MUTATION_RECEIPTS_KEY])) {
    shared.add(MUTATION_RECEIPTS_KEY);
  }
  if (isTrustedAuthorityRoot(value)) {
    for (const key of IMMUTABLE_JOURNAL_ARRAY_KEYS) {
      if (immutableJournalCanShare(key, value[key], value)) {
        shared.add(key);
      }
    }
    for (const key of IMMUTABLE_RECORD_VALUE_KEYS) {
      if (immutableRecordValuesCanShare(key, value[key], value)) {
        shared.add(key);
      }
    }
    for (const key of IMMUTABLE_IDENTITY_RECORD_VALUE_KEYS) {
      if (identityRecordValuesCanShare(key, value[key])) {
        shared.add(key);
      }
    }
    for (const key of IMMUTABLE_PRIMITIVE_MAP_KEYS) {
      if (primitiveMapCanShare(value[key])) {
        shared.add(key);
      }
    }
  }
  const clonedFieldBytes = {};
  const sharedFieldBytes = {};
  const sharedFieldCounts = {};
  for (const key of Object.keys(value).sort()) {
    if (shared.has(key)) {
      if (key !== CONSUMED_EQUIPMENT_ENVELOPES_KEY && key !== MUTATION_RECEIPTS_KEY) {
        try {
          sharedFieldBytes[key] = Buffer.byteLength(JSON.stringify(value[key]));
        } catch {
          sharedFieldBytes[key] = -1;
        }
        sharedFieldCounts[key] = Array.isArray(value[key])
          ? value[key].length
          : (isRecord(value[key]) ? Object.keys(value[key]).length : 0);
      }
      continue;
    }
    try {
      clonedFieldBytes[key] = Buffer.byteLength(JSON.stringify(value[key]));
    } catch {
      clonedFieldBytes[key] = -1;
    }
  }
  return {
    trusted: isTrustedAuthorityRoot(value),
    shared: Array.from(shared).sort(),
    clonedFieldBytes,
    sharedFieldBytes,
    sharedFieldCounts,
  };
}

module.exports = {
  authorityRootCertificationRetentionDiagnostics,
  authorityRootCloneDiagnostics,
  certifyOwnedAuthorityRootJsonValue,
  certifyOwnedAuthorityRootTransientJsonValue,
  cloneAuthorityRoot,
  authorityRootTrustCompromised,
  authorityRootJournalForMutation,
  authorityRootRecordForMutation,
  freezeAuthorityRootCowRecordValues,
  freezeAuthorityRootPlayerPositionValue,
  freezeAuthorityRootPlayerPositionValues,
  freezeAuthorityRootJournal,
  freezeAuthorityRootIdentityRecordValues,
  freezeAuthorityRootRecordValues,
  isCertifiedAuthorityRootJsonValue,
  isTrustedAuthorityRoot,
  markAuthorityRootTrusted,
};
