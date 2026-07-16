"use strict";

const {
  MARKET_MAX_LISTINGS,
  MARKET_MAX_LISTINGS_PER_SELLER,
} = require("./auth/market-listing-state");
const {
  DURABLE_RECEIPT_MAX_COUNT,
} = require("./auth/durable-mutation-state");

const MYSQL_RESOURCE_ACQUISITION_ORDER_INVALID = "mysql_resource_acquisition_order_invalid";
const MARKET_CREATE_CAPACITY_GUARD_KEY = "market_create_capacity";
const MARKET_CREATE_CAPACITY_LOCK_SQL =
  "SELECT scope_key, revision FROM auth_store_revisions WHERE scope_key = ? FOR UPDATE";
const MARKET_CREATE_CAPACITY_CHECK_SQL = `SELECT COUNT(*) AS total_count,
  COALESCE(SUM(seller_account_id = ?), 0) AS seller_count
  FROM market_listings`;
const MUTATION_RECEIPT_CAPACITY_GUARD_KEY = "mutation_receipt_capacity";
const MUTATION_RECEIPT_CAPACITY_UPDATE_SQL = `UPDATE auth_store_revisions
  SET revision = revision + ?
  WHERE scope_key = 'mutation_receipt_capacity'
    AND revision + ? BETWEEN 0 AND ${DURABLE_RECEIPT_MAX_COUNT}`;
const MUTATION_RECEIPT_DELETE_SQL = `DELETE FROM mutation_receipts
  WHERE operation_id = ? AND request_hash = ? AND action_id = ?
    AND account_id <=> ? AND committed_at = ? AND expires_at = ?
    AND document_json = CAST(? AS JSON)`;
const MAIL_STORAGE_CONTROL_SCOPE_KEY = "mail_lifecycle";
const MAIL_STORAGE_CONTROL_LOCK_SQL = `SELECT scope_key, schema_generation, data_generation,
  lifecycle_state, archive_enabled, vault_claim_enabled, active_limit_enabled
  FROM mail_storage_control WHERE scope_key = ? FOR SHARE`;
const MAIL_ACTIVE_COUNTER_SEED_SQL = `INSERT INTO mail_active_counters
  (recipient_account_id, active_count, data_generation, revision)
  VALUES (?, 0, 1, 0)
  ON DUPLICATE KEY UPDATE recipient_account_id = VALUES(recipient_account_id)`;
const MAIL_ACTIVE_COUNTER_INCREMENT_SQL = `UPDATE mail_active_counters
  SET active_count = active_count + ?, revision = revision + 1
  WHERE recipient_account_id = ? AND data_generation = 1
    AND active_count <= 4294967295 - ?
    AND revision < 18446744073709551615`;
const MAIL_IDENTITY_LOCK_SQL = `SELECT mail_id, sender_account_id, recipient_account_id,
  location, created_at, settled_at, archived_at, identity_digest, document_digest,
  reward_id, data_generation, revision
  FROM mail_identity_registry WHERE mail_id = ? FOR UPDATE`;
const MAIL_IDENTITY_INSERT_SQL = `INSERT INTO mail_identity_registry
  (mail_id, sender_account_id, recipient_account_id, location, created_at,
    settled_at, archived_at, identity_digest, document_digest, reward_id,
    data_generation, revision)
  VALUES (?, ?, ?, 'active', ?, ?, NULL, ?, ?, NULL, 1, 0)`;
const MAIL_IDENTITY_UPDATE_SQL = `UPDATE mail_identity_registry
  SET settled_at = ?, document_digest = ?, revision = revision + 1
  WHERE mail_id = ? AND sender_account_id = ? AND recipient_account_id = ?
    AND location = 'active' AND created_at = ? AND settled_at <=> ?
    AND archived_at IS NULL AND identity_digest = ? AND document_digest = ?
    AND reward_id IS NULL AND data_generation = 1
    AND revision < 18446744073709551615`;

const MAIL_STORAGE_CONTROL_EXPECTED_FIELDS = Object.freeze([
  "scope_key",
  "schema_generation",
  "data_generation",
  "lifecycle_state",
  "archive_enabled",
  "vault_claim_enabled",
  "active_limit_enabled",
]);
const MAIL_IDENTITY_EXPECTED_FIELDS = Object.freeze([
  "mail_id",
  "sender_account_id",
  "recipient_account_id",
  "location",
  "created_at",
  "settled_at",
  "archived_at",
  "identity_digest",
  "document_digest",
  "reward_id",
  "data_generation",
]);
const STORAGE_IDENTIFIER_PATTERN = /^[a-z0-9_:-]+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAIL_ACTIVE_COUNT_MAX = 4294967295;
const MAIL_COUNTER_SEED_AFFECTED_ROWS = Object.freeze([0, 1, 2]);

const CONDITIONAL_PLAN_KINDS = new Set([
  "profile_conditional_v2",
  "market_create_conditional_v1",
  "market_cancel_conditional_v1",
  "market_buy_conditional_v1",
  "mail_send_conditional_v1",
  "mail_read_conditional_v1",
  "mail_claim_conditional_v1",
]);

const RESOURCE_RANK = new Map([
  ["mail_storage_control", 0],
  ["profile_binding", 1],
  ["profile", 2],
  ["market_capacity", 3],
  ["market_listing", 4],
  ["mail_active_counter", 5],
  ["mail_identity", 6],
  ["mail_message", 7],
  ["consumed_equipment_envelope", 8],
  ["market_tax", 9],
  ["mutation_receipt_capacity", 10],
  ["mutation_receipt", 11],
]);

const EXPLICIT_LOCK_RESOURCES = new Set([
  "mail_storage_control",
  "profile_binding",
  "profile",
  "market_capacity",
  "market_listing",
  "mail_identity",
  "mail_message",
]);

const WRITE_KINDS_BY_RESOURCE = new Map([
  ["profile_binding", new Set(["write"])],
  ["profile", new Set(["write"])],
  ["market_listing", new Set(["insert", "delete"])],
  ["mail_active_counter", new Set(["seed", "increment"])],
  ["mail_identity", new Set(["insert", "update"])],
  ["mail_message", new Set(["insert", "update", "delete"])],
  ["consumed_equipment_envelope", new Set(["insert"])],
  ["market_tax", new Set(["update"])],
  ["mutation_receipt_capacity", new Set(["update"])],
  ["mutation_receipt", new Set(["delete", "insert"])],
]);

const PRELOCKED_WRITES = new Set([
  "profile_binding",
  "profile",
]);

function invalid(reason, resource = "", key = "") {
  const error = new Error(`MySQL资源获取顺序认证失败：${reason}`);
  error.code = MYSQL_RESOURCE_ACQUISITION_ORDER_INVALID;
  error.reason = String(reason || "invalid");
  if (resource !== "") {
    error.resource = String(resource);
  }
  if (key !== "") {
    error.resourceKey = String(key);
  }
  return error;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeSql(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return "";
  }
  return value.trim().replace(/;\s*$/, "").replace(/\s+/g, " ");
}

function lockContract(resource, lockMode) {
  const suffix = lockMode === "shared" ? "FOR SHARE" : "FOR UPDATE";
  if (resource === "mail_storage_control") {
    return {
      identityField: "scope_key",
      sql: MAIL_STORAGE_CONTROL_LOCK_SQL,
    };
  }
  if (resource === "profile_binding") {
    return {
      identityField: "account_id",
      sql: `SELECT account_id, player_id, profile_revision FROM profile_bindings WHERE account_id = ? ${suffix}`,
    };
  }
  if (resource === "profile") {
    return {
      identityField: "player_id",
      sql: `SELECT player_id, account_id, profile_revision FROM profiles WHERE player_id = ? ${suffix}`,
    };
  }
  if (resource === "market_capacity") {
    return {
      identityField: "scope_key",
      sql: MARKET_CREATE_CAPACITY_LOCK_SQL,
    };
  }
  if (resource === "market_listing") {
    return {
      identityField: "listing_id",
      sql: `SELECT listing_id, seller_account_id, item_id, currency, unit_price,
        item_count, created_at, document_json
        FROM market_listings WHERE listing_id = ? FOR UPDATE`,
    };
  }
  if (resource === "mail_identity") {
    return {
      identityField: "mail_id",
      sql: MAIL_IDENTITY_LOCK_SQL,
    };
  }
  if (resource === "mail_message") {
    return {
      identityField: "mail_id",
      sql: `SELECT mail_id, sender_account_id, recipient_account_id, title,
        created_at, read_at, document_json
        FROM mail_messages WHERE mail_id = ? FOR UPDATE`,
    };
  }
  return null;
}

function writeContract(resource, kind, key) {
  if (resource === "profile_binding" && kind === "write") {
    return {
      keyParamIndex: 4,
      paramsLength: 7,
      stableParamPairs: [[0, 5]],
      sql: `UPDATE profile_bindings
        SET player_id = ?, profile_revision = ?, updated_at = ?, document_json = CAST(? AS JSON)
        WHERE account_id = ? AND player_id = ? AND profile_revision = ?`,
    };
  }
  if (resource === "profile" && kind === "write") {
    return {
      keyParamIndex: 4,
      paramsLength: 7,
      stableParamPairs: [[0, 5]],
      sql: `UPDATE profiles
        SET account_id = ?, profile_revision = ?, updated_at = ?, profile_json = CAST(? AS JSON)
        WHERE player_id = ? AND account_id = ? AND profile_revision = ?`,
    };
  }
  if (resource === "market_listing" && kind === "delete") {
    return {
      keyParamIndex: 0,
      paramsLength: 7,
      sql: `DELETE FROM market_listings
        WHERE listing_id = ? AND seller_account_id = ? AND item_id = ?
          AND currency = ? AND unit_price = ? AND item_count = ? AND created_at = ?`,
    };
  }
  if (resource === "market_listing" && kind === "insert") {
    return {
      keyParamIndex: 0,
      paramsLength: 8,
      sql: `INSERT INTO market_listings
        (listing_id, seller_account_id, item_id, currency, unit_price, item_count, created_at, document_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
    };
  }
  if (resource === "mail_active_counter" && kind === "seed") {
    return {
      keyParamIndex: 0,
      paramsLength: 1,
      allowedAffectedRows: MAIL_COUNTER_SEED_AFFECTED_ROWS,
      sql: MAIL_ACTIVE_COUNTER_SEED_SQL,
    };
  }
  if (resource === "mail_active_counter" && kind === "increment") {
    return {
      keyParamIndex: 1,
      paramsLength: 3,
      stableParamPairs: [[0, 2]],
      counterIncrementParams: true,
      sql: MAIL_ACTIVE_COUNTER_INCREMENT_SQL,
    };
  }
  if (resource === "mail_identity" && kind === "insert") {
    return {
      keyParamIndex: 0,
      paramsLength: 7,
      identityInsertParams: true,
      sql: MAIL_IDENTITY_INSERT_SQL,
    };
  }
  if (resource === "mail_identity" && kind === "update") {
    return {
      keyParamIndex: 2,
      paramsLength: 9,
      identityUpdateParams: true,
      sql: MAIL_IDENTITY_UPDATE_SQL,
    };
  }
  if (resource === "mail_message" && kind === "insert") {
    return {
      keyParamIndex: 0,
      paramsLength: 7,
      sql: `INSERT INTO mail_messages
        (mail_id, sender_account_id, recipient_account_id, title, created_at, read_at, document_json)
        VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
    };
  }
  if (resource === "mail_message" && kind === "update") {
    return {
      keyParamIndex: 6,
      paramsLength: 12,
      stableParamPairs: [[0, 7], [1, 8], [2, 9], [3, 10]],
      sql: `UPDATE mail_messages
        SET sender_account_id = ?, recipient_account_id = ?, title = ?, created_at = ?,
          read_at = ?, document_json = CAST(? AS JSON)
        WHERE mail_id = ? AND sender_account_id = ? AND recipient_account_id = ?
          AND title = ? AND created_at = ? AND read_at <=> ?`,
    };
  }
  if (resource === "mail_message" && kind === "delete") {
    return {
      keyParamIndex: 0,
      paramsLength: 6,
      sql: `DELETE FROM mail_messages
        WHERE mail_id = ? AND sender_account_id = ? AND recipient_account_id = ?
          AND title = ? AND created_at = ? AND read_at <=> ?`,
    };
  }
  if (resource === "consumed_equipment_envelope" && kind === "insert") {
    return {
      keyParamIndex: 0,
      paramsLength: 1,
      sql: "INSERT INTO consumed_equipment_envelopes (envelope_id) VALUES (?)",
    };
  }
  if (resource === "market_tax" && kind === "update") {
    const jsonPathByCurrency = {
      stoneCoins: "$.marketConfig.taxCollected.stoneCoins",
      diamonds: "$.marketConfig.taxCollected.diamonds",
    };
    const jsonPath = jsonPathByCurrency[key];
    if (!jsonPath) {
      return null;
    }
    return {
      keyParamIndex: null,
      paramsLength: 2,
      taxParams: true,
      sql: `UPDATE server_state
        SET document_json = JSON_SET(
          document_json,
          '${jsonPath}',
          CAST(JSON_UNQUOTE(JSON_EXTRACT(document_json, '${jsonPath}')) AS UNSIGNED) + ?
        )
        WHERE state_key = 'auth'
          AND JSON_TYPE(JSON_EXTRACT(document_json, '${jsonPath}')) IN ('INTEGER', 'UNSIGNED INTEGER')
          AND CAST(JSON_UNQUOTE(JSON_EXTRACT(document_json, '${jsonPath}')) AS UNSIGNED) <= ?`,
    };
  }
  if (resource === "mutation_receipt_capacity" && kind === "update") {
    if (key !== MUTATION_RECEIPT_CAPACITY_GUARD_KEY) {
      return null;
    }
    return {
      keyParamIndex: null,
      paramsLength: 2,
      receiptCapacityParams: true,
      sql: MUTATION_RECEIPT_CAPACITY_UPDATE_SQL,
    };
  }
  if (resource === "mutation_receipt" && kind === "delete") {
    return {
      keyParamIndex: 0,
      paramsLength: 7,
      receiptParams: true,
      sql: MUTATION_RECEIPT_DELETE_SQL,
    };
  }
  if (resource === "mutation_receipt" && kind === "insert") {
    return {
      keyParamIndex: 0,
      paramsLength: 7,
      receiptParams: true,
      sql: `INSERT INTO mutation_receipts
        (operation_id, request_hash, action_id, account_id, committed_at, expires_at, document_json)
        VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
    };
  }
  return null;
}

function canonicalKey(value, resource) {
  if (typeof value !== "string" || value === "" || value.trim() !== value) {
    throw invalid("resource_key_invalid", resource);
  }
  return value;
}

function hasExactFields(value, fields) {
  return isRecord(value)
    && Object.keys(value).length === fields.length
    && fields.every((field) => Object.prototype.hasOwnProperty.call(value, field));
}

function canonicalStorageIdentifier(value, maximumLength) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximumLength
    && STORAGE_IDENTIFIER_PATTERN.test(value);
}

function canonicalStoredTimestamp(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 40;
}

function canonicalIsoTimestamp(value) {
  if (!canonicalStoredTimestamp(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function nullableCanonicalIsoTimestamp(value) {
  return value === null || canonicalIsoTimestamp(value);
}

function validMailStorageControlExpectedRow(value) {
  return hasExactFields(value, MAIL_STORAGE_CONTROL_EXPECTED_FIELDS)
    && value.scope_key === MAIL_STORAGE_CONTROL_SCOPE_KEY
    && value.schema_generation === 1
    && (
      (value.data_generation === 0 && value.lifecycle_state === "uninitialized")
      || (value.data_generation === 1 && value.lifecycle_state === "ready")
    )
    && value.archive_enabled === 0
    && value.vault_claim_enabled === 0
    && value.active_limit_enabled === 0;
}

function validMailIdentityExpectedRow(value, key) {
  return hasExactFields(value, MAIL_IDENTITY_EXPECTED_FIELDS)
    && value.mail_id === key
    && canonicalStorageIdentifier(value.mail_id, 96)
    && canonicalStorageIdentifier(value.sender_account_id, 80)
    && canonicalStorageIdentifier(value.recipient_account_id, 80)
    && value.location === "active"
    && canonicalStoredTimestamp(value.created_at)
    && nullableCanonicalIsoTimestamp(value.settled_at)
    && value.archived_at === null
    && SHA256_PATTERN.test(value.identity_digest)
    && SHA256_PATTERN.test(value.document_digest)
    && value.reward_id === null
    && value.data_generation === 1;
}

function validMailIdentityInsertParams(params) {
  const [
    mailId,
    senderAccountId,
    recipientAccountId,
    createdAt,
    settledAt,
    identityDigest,
    documentDigest,
  ] = params;
  return canonicalStorageIdentifier(mailId, 96)
    && canonicalStorageIdentifier(senderAccountId, 80)
    && canonicalStorageIdentifier(recipientAccountId, 80)
    && canonicalIsoTimestamp(createdAt)
    && nullableCanonicalIsoTimestamp(settledAt)
    && SHA256_PATTERN.test(identityDigest)
    && SHA256_PATTERN.test(documentDigest);
}

function validMailIdentityUpdateParams(params) {
  const [
    nextSettledAt,
    nextDocumentDigest,
    mailId,
    senderAccountId,
    recipientAccountId,
    createdAt,
    previousSettledAt,
    identityDigest,
    previousDocumentDigest,
  ] = params;
  return nullableCanonicalIsoTimestamp(nextSettledAt)
    && SHA256_PATTERN.test(nextDocumentDigest)
    && canonicalStorageIdentifier(mailId, 96)
    && canonicalStorageIdentifier(senderAccountId, 80)
    && canonicalStorageIdentifier(recipientAccountId, 80)
    && canonicalStoredTimestamp(createdAt)
    && nullableCanonicalIsoTimestamp(previousSettledAt)
    && (previousSettledAt === null || nextSettledAt === previousSettledAt)
    && SHA256_PATTERN.test(identityDigest)
    && SHA256_PATTERN.test(previousDocumentDigest)
    && nextDocumentDigest !== previousDocumentDigest;
}

function hasExpectedAffectedRowsMetadata(write, allowedAffectedRows) {
  if (allowedAffectedRows === MAIL_COUNTER_SEED_AFFECTED_ROWS) {
    return Array.isArray(write.expectedAffectedRows)
      && write.expectedAffectedRows.length === MAIL_COUNTER_SEED_AFFECTED_ROWS.length
      && write.expectedAffectedRows.every((value, index) => (
        value === MAIL_COUNTER_SEED_AFFECTED_ROWS[index]
      ));
  }
  return write.expectedAffectedRows === 1;
}

// JavaScript relational string comparison is lexicographic by UTF-16 code units.
function compareCanonicalKeys(left, right) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function compareAcquisitions(left, right) {
  const rankDifference = RESOURCE_RANK.get(left.resource) - RESOURCE_RANK.get(right.resource);
  return rankDifference || compareCanonicalKeys(left.key, right.key);
}

function identity(resource, key) {
  return JSON.stringify([resource, key]);
}

function validateEnvelope(plan) {
  if (!isRecord(plan) || !CONDITIONAL_PLAN_KINDS.has(plan.kind)) {
    throw invalid("conditional_plan_kind_invalid");
  }
  if (plan.globalRevisionFence !== false || plan.globalCompatibilityBarrier !== "shared") {
    throw invalid("global_shared_barrier_invalid");
  }
  if (!Array.isArray(plan.locks) || !Array.isArray(plan.writes)) {
    throw invalid("plan_resources_invalid");
  }
}

function validateCapacityCheck(plan) {
  const check = plan.capacityCheck;
  if (plan.kind !== "market_create_conditional_v1") {
    if (check !== undefined) {
      throw invalid("capacity_check_unexpected");
    }
    return null;
  }
  const checkFields = new Set([
    "kind",
    "resource",
    "key",
    "sql",
    "params",
    "maxTotalListings",
    "maxSellerListings",
  ]);
  if (
    !isRecord(check)
    || Object.keys(check).length !== checkFields.size
    || Object.keys(check).some((field) => !checkFields.has(field))
    || check.kind !== "check"
    || check.resource !== "market_capacity"
    || check.key !== MARKET_CREATE_CAPACITY_GUARD_KEY
    || normalizeSql(check.sql) !== normalizeSql(MARKET_CREATE_CAPACITY_CHECK_SQL)
    || !Array.isArray(check.params)
    || check.params.length !== 1
    || typeof plan.accountId !== "string"
    || plan.accountId === ""
    || plan.accountId.trim() !== plan.accountId
    || check.params[0] !== plan.accountId
    || !Number.isSafeInteger(plan.observedTotalListingCount)
    || plan.observedTotalListingCount < 0
    || !Number.isSafeInteger(plan.observedSellerListingCount)
    || plan.observedSellerListingCount < 0
    || plan.observedSellerListingCount > plan.observedTotalListingCount
    || plan.maxTotalListings !== MARKET_MAX_LISTINGS
    || plan.maxSellerListings !== MARKET_MAX_LISTINGS_PER_SELLER
    || check.maxTotalListings !== MARKET_MAX_LISTINGS
    || check.maxSellerListings !== MARKET_MAX_LISTINGS_PER_SELLER
  ) {
    throw invalid("capacity_check_invalid", "market_capacity", MARKET_CREATE_CAPACITY_GUARD_KEY);
  }
  return check;
}

function validateLock(lock) {
  if (!isRecord(lock) || lock.kind !== "lock" || !EXPLICIT_LOCK_RESOURCES.has(lock.resource)) {
    throw invalid("explicit_lock_invalid");
  }
  const resource = lock.resource;
  const key = canonicalKey(lock.key, resource);
  if (lock.lockMode !== "shared" && lock.lockMode !== "exclusive") {
    throw invalid("lock_mode_invalid", resource, key);
  }
  if (resource === "mail_storage_control" && lock.lockMode !== "shared") {
    throw invalid("lock_mode_invalid", resource, key);
  }
  if (
    ["market_capacity", "market_listing", "mail_identity", "mail_message"].includes(resource)
    && lock.lockMode !== "exclusive"
  ) {
    throw invalid("lock_mode_invalid", resource, key);
  }
  if (typeof lock.sql !== "string" || lock.sql.trim() === "") {
    throw invalid("lock_sql_invalid", resource, key);
  }
  const sql = normalizeSql(lock.sql);
  const hasShare = /\bFOR\s+SHARE\b/i.test(sql);
  const hasUpdate = /\bFOR\s+UPDATE\b/i.test(sql);
  const endsShare = /\bFOR\s+SHARE\s*$/i.test(sql);
  const endsUpdate = /\bFOR\s+UPDATE\s*$/i.test(sql);
  if (
    (lock.lockMode === "shared" && (!endsShare || hasUpdate))
    || (lock.lockMode === "exclusive" && (!endsUpdate || hasShare))
  ) {
    throw invalid("lock_mode_sql_mismatch", resource, key);
  }
  const contract = lockContract(resource, lock.lockMode);
  if (contract === null || sql !== normalizeSql(contract.sql)) {
    throw invalid("lock_sql_contract_invalid", resource, key);
  }
  if (!Array.isArray(lock.params) || lock.params.length !== 1) {
    throw invalid("lock_params_invalid", resource, key);
  }
  if (lock.params[0] !== key) {
    throw invalid("lock_key_param_mismatch", resource, key);
  }
  if (
    !isRecord(lock.expectedRow)
    || !Object.prototype.hasOwnProperty.call(lock.expectedRow, contract.identityField)
    || lock.expectedRow[contract.identityField] !== key
  ) {
    throw invalid("lock_expected_row_key_mismatch", resource, key);
  }
  if (
    resource === "market_capacity"
    && (
      key !== MARKET_CREATE_CAPACITY_GUARD_KEY
      || !isRecord(lock.expectedRow)
      || Object.keys(lock.expectedRow).length !== 2
      || lock.expectedRow.scope_key !== MARKET_CREATE_CAPACITY_GUARD_KEY
      || lock.expectedRow.revision !== 0
    )
  ) {
    throw invalid("market_capacity_guard_invalid", resource, key);
  }
  if (
    resource === "mail_storage_control"
    && (
      key !== MAIL_STORAGE_CONTROL_SCOPE_KEY
      || !validMailStorageControlExpectedRow(lock.expectedRow)
    )
  ) {
    throw invalid("mail_storage_control_guard_invalid", resource, key);
  }
  if (
    resource === "mail_identity"
    && !validMailIdentityExpectedRow(lock.expectedRow, key)
  ) {
    throw invalid("mail_identity_expected_row_invalid", resource, key);
  }
  return {resource, key, mode: lock.lockMode, source: "locks", stage: "lock"};
}

function validateWrite(write) {
  if (!isRecord(write) || typeof write.resource !== "string" || typeof write.kind !== "string") {
    throw invalid("write_invalid");
  }
  const allowedKinds = WRITE_KINDS_BY_RESOURCE.get(write.resource);
  if (!allowedKinds || !allowedKinds.has(write.kind)) {
    throw invalid("write_kind_invalid", write.resource, typeof write.key === "string" ? write.key : "");
  }
  const key = canonicalKey(write.key, write.resource);
  const contract = writeContract(write.resource, write.kind, key);
  if (contract === null) {
    throw invalid("write_key_contract_invalid", write.resource, key);
  }
  if (normalizeSql(write.sql) !== normalizeSql(contract.sql)) {
    throw invalid("write_sql_contract_invalid", write.resource, key);
  }
  if (!Array.isArray(write.params) || write.params.length !== contract.paramsLength) {
    throw invalid("write_params_invalid", write.resource, key);
  }
  if (contract.keyParamIndex !== null && write.params[contract.keyParamIndex] !== key) {
    throw invalid("write_key_param_mismatch", write.resource, key);
  }
  if (
    Array.isArray(contract.stableParamPairs)
    && contract.stableParamPairs.some(([nextIndex, previousIndex]) => (
      write.params[nextIndex] !== write.params[previousIndex]
    ))
  ) {
    throw invalid("write_indexed_identity_change", write.resource, key);
  }
  if (contract.taxParams) {
    const taxAmount = write.params[0];
    if (
      !Number.isSafeInteger(taxAmount)
      || taxAmount <= 0
      || write.params[1] !== Number.MAX_SAFE_INTEGER - taxAmount
    ) {
      throw invalid("write_params_invalid", write.resource, key);
    }
  }
  if (
    contract.receiptCapacityParams
    && (write.params[0] !== 1 || write.params[1] !== 1)
  ) {
    throw invalid("write_params_invalid", write.resource, key);
  }
  if (
    write.resource === "mail_active_counter"
    && !canonicalStorageIdentifier(key, 80)
  ) {
    throw invalid("write_params_invalid", write.resource, key);
  }
  if (contract.counterIncrementParams) {
    const incrementBy = write.params[0];
    if (
      !Number.isSafeInteger(incrementBy)
      || incrementBy <= 0
      || incrementBy > MAIL_ACTIVE_COUNT_MAX
      || write.params[2] !== incrementBy
    ) {
      throw invalid("write_params_invalid", write.resource, key);
    }
  }
  if (contract.identityInsertParams && !validMailIdentityInsertParams(write.params)) {
    throw invalid("write_params_invalid", write.resource, key);
  }
  if (contract.identityUpdateParams && !validMailIdentityUpdateParams(write.params)) {
    throw invalid("write_params_invalid", write.resource, key);
  }
  const receiptTimes = contract.receiptParams
    ? validateMutationReceiptParams(write.params, write.resource, key)
    : null;
  const allowedAffectedRows = contract.allowedAffectedRows || Object.freeze([1]);
  if (!hasExpectedAffectedRowsMetadata(write, allowedAffectedRows)) {
    throw invalid("write_affected_rows_invalid", write.resource, key);
  }
  return {
    resource: write.resource,
    key,
    kind: write.kind,
    allowedAffectedRows,
    ...(receiptTimes === null ? {} : receiptTimes),
  };
}

function mysqlResourceWriteAffectedRowsAccepted(write, affectedRows) {
  const validated = validateWrite(write);
  return Number.isSafeInteger(affectedRows)
    && affectedRows >= 0
    && validated.allowedAffectedRows.includes(affectedRows);
}

function validateMutationReceiptParams(params, resource, key) {
  const [operationId, requestHash, actionId, accountId, committedAt, expiresAt, documentJson] = params;
  if (
    operationId !== key
    || typeof requestHash !== "string"
    || requestHash === ""
    || requestHash.trim() !== requestHash
    || typeof actionId !== "string"
    || actionId === ""
    || actionId.trim() !== actionId
    || (accountId !== null && (
      typeof accountId !== "string"
      || accountId === ""
      || accountId.trim() !== accountId
    ))
    || typeof committedAt !== "string"
    || typeof expiresAt !== "string"
    || typeof documentJson !== "string"
  ) {
    throw invalid("write_params_invalid", resource, key);
  }
  const committedAtMs = Date.parse(committedAt);
  const expiresAtMs = Date.parse(expiresAt);
  if (
    !Number.isFinite(committedAtMs)
    || !Number.isFinite(expiresAtMs)
    || new Date(committedAtMs).toISOString() !== committedAt
    || new Date(expiresAtMs).toISOString() !== expiresAt
    || expiresAtMs <= committedAtMs
  ) {
    throw invalid("write_params_invalid", resource, key);
  }
  let document;
  try {
    document = JSON.parse(documentJson);
  } catch {
    throw invalid("write_receipt_document_invalid", resource, key);
  }
  const expectedFields = new Set([
    "schemaVersion",
    "operationId",
    "requestHash",
    "actionId",
    "accountId",
    "committedAt",
    "expiresAt",
    "response",
  ]);
  if (
    !isRecord(document)
    || Object.keys(document).length !== expectedFields.size
    || Object.keys(document).some((field) => !expectedFields.has(field))
    || document.schemaVersion !== 1
    || document.operationId !== operationId
    || document.requestHash !== requestHash
    || document.actionId !== actionId
    || document.accountId !== (accountId === null ? "" : accountId)
    || document.committedAt !== committedAt
    || document.expiresAt !== expiresAt
    || !isRecord(document.response)
  ) {
    throw invalid("write_receipt_document_invalid", resource, key);
  }
  return {receiptCommittedAtMs: committedAtMs, receiptExpiresAtMs: expiresAtMs};
}

function assertMysqlMutationReceiptWriteContract(write) {
  const validated = validateWrite(write);
  if (
    validated.resource !== "mutation_receipt"
    || !["delete", "insert"].includes(validated.kind)
  ) {
    throw invalid("mutation_receipt_write_invalid", validated.resource, validated.key);
  }
  return true;
}

function validateMutationReceiptPlan(plan, writes) {
  const receiptWrites = writes.filter((write) => write.resource === "mutation_receipt");
  const receiptInserts = receiptWrites.filter((write) => write.kind === "insert");
  const receiptDeletes = receiptWrites.filter((write) => write.kind === "delete");
  const capacityWrites = writes.filter((write) => write.resource === "mutation_receipt_capacity");
  if (receiptInserts.length !== 1) {
    throw invalid("receipt_insert_count_invalid", "mutation_receipt");
  }
  if (receiptDeletes.length > 1) {
    throw invalid("receipt_delete_count_invalid", "mutation_receipt");
  }
  const receiptInsert = receiptInserts[0];
  if (
    typeof plan.operationId !== "string"
    || plan.operationId !== receiptInsert.key
  ) {
    throw invalid("receipt_operation_id_mismatch", "mutation_receipt", receiptInsert.key);
  }
  if (receiptDeletes.length === 0) {
    if (capacityWrites.length !== 1) {
      throw invalid(
        "receipt_capacity_increment_required",
        "mutation_receipt_capacity",
        MUTATION_RECEIPT_CAPACITY_GUARD_KEY,
      );
    }
    return;
  }
  if (capacityWrites.length !== 0) {
    throw invalid(
      "receipt_capacity_increment_unexpected",
      "mutation_receipt_capacity",
      MUTATION_RECEIPT_CAPACITY_GUARD_KEY,
    );
  }
  const receiptDelete = receiptDeletes[0];
  if (receiptDelete.receiptExpiresAtMs > receiptInsert.receiptCommittedAtMs) {
    throw invalid("receipt_delete_not_expired", "mutation_receipt", receiptDelete.key);
  }
  // Different keys follow the canonical key order for deadlock safety. Only a
  // reused physical key needs the stricter DELETE -> INSERT order.
  if (receiptDelete.key === receiptInsert.key) {
    const deleteIndex = writes.indexOf(receiptDelete);
    const insertIndex = writes.indexOf(receiptInsert);
    if (insertIndex !== deleteIndex + 1) {
      throw invalid("receipt_same_key_reuse_order_invalid", "mutation_receipt", receiptInsert.key);
    }
  }
}

function acquisitionForWrite(write) {
  if (requiresExclusivePrelock(write)) {
    return null;
  }
  return {
    resource: write.resource,
    key: write.resource === "market_tax" ? "auth" : write.key,
    mode: "exclusive",
    source: "writes",
    stage: write.kind,
  };
}

function requiresExclusivePrelock(write) {
  return PRELOCKED_WRITES.has(write.resource)
    || (write.resource === "market_listing" && write.kind === "delete")
    || (write.resource === "mail_identity" && write.kind === "update")
    || (write.resource === "mail_message" && write.kind !== "insert");
}

function allowsSameKeyWriteReuse(previousWrite, write) {
  if (previousWrite === null || previousWrite.key !== write.key) {
    return false;
  }
  return (
    previousWrite.resource === "mutation_receipt"
    && previousWrite.kind === "delete"
    && write.resource === "mutation_receipt"
    && write.kind === "insert"
  ) || (
    previousWrite.resource === "mail_active_counter"
    && previousWrite.kind === "seed"
    && write.resource === "mail_active_counter"
    && write.kind === "increment"
  );
}

function requiresMailStorageControlFence(writes) {
  return writes.some((write) => (
    write.resource === "mail_active_counter"
    || write.resource === "mail_identity"
  ));
}

function certify(plan) {
  validateEnvelope(plan);
  const capacityCheck = validateCapacityCheck(plan);
  const trace = [];
  const acquired = new Set();
  const explicitLocks = new Map();
  const seenWriteIdentities = new Set();
  const validatedWrites = [];
  let previous = null;
  let previousWrite = null;

  for (const lockValue of plan.locks) {
    const lock = validateLock(lockValue);
    const lockIdentity = identity(lock.resource, lock.key);
    if (acquired.has(lockIdentity)) {
      throw invalid("duplicate_explicit_lock", lock.resource, lock.key);
    }
    if (previous !== null && compareAcquisitions(previous, lock) > 0) {
      throw invalid("explicit_lock_order_invalid", lock.resource, lock.key);
    }
    acquired.add(lockIdentity);
    explicitLocks.set(lockIdentity, lock);
    trace.push(Object.freeze(lock));
    previous = lock;
  }

  if (capacityCheck !== null) {
    const guard = explicitLocks.get(identity("market_capacity", MARKET_CREATE_CAPACITY_GUARD_KEY));
    if (!guard || guard.mode !== "exclusive") {
      throw invalid(
        "market_capacity_guard_required",
        "market_capacity",
        MARKET_CREATE_CAPACITY_GUARD_KEY,
      );
    }
  } else if ([...explicitLocks.values()].some((lock) => lock.resource === "market_capacity")) {
    throw invalid("market_capacity_guard_unexpected", "market_capacity");
  }

  for (const writeValue of plan.writes) {
    const write = validateWrite(writeValue);
    validatedWrites.push(write);
    const writeIdentity = identity(write.resource, write.key);
    const sameKeyWriteReuse = allowsSameKeyWriteReuse(previousWrite, write);
    if (seenWriteIdentities.has(writeIdentity) && !sameKeyWriteReuse) {
      throw invalid("duplicate_first_acquisition", write.resource, write.key);
    }
    seenWriteIdentities.add(writeIdentity);
    const requiresPrelock = requiresExclusivePrelock(write);
    if (requiresPrelock) {
      const lock = explicitLocks.get(writeIdentity);
      if (!lock || lock.mode !== "exclusive") {
        throw invalid("exclusive_prelock_required", write.resource, write.key);
      }
      previousWrite = write;
      continue;
    }

    const acquisition = acquisitionForWrite(write);
    const acquisitionIdentity = identity(acquisition.resource, acquisition.key);
    if (acquired.has(acquisitionIdentity)) {
      if (!sameKeyWriteReuse) {
        throw invalid("duplicate_first_acquisition", acquisition.resource, acquisition.key);
      }
      previousWrite = write;
      continue;
    }
    if (previous !== null && compareAcquisitions(previous, acquisition) > 0) {
      throw invalid("first_acquisition_order_invalid", acquisition.resource, acquisition.key);
    }
    acquired.add(acquisitionIdentity);
    trace.push(Object.freeze(acquisition));
    previous = acquisition;
    previousWrite = write;
  }

  if (requiresMailStorageControlFence(validatedWrites)) {
    const controlLock = explicitLocks.get(identity(
      "mail_storage_control",
      MAIL_STORAGE_CONTROL_SCOPE_KEY,
    ));
    if (!controlLock || controlLock.mode !== "shared") {
      throw invalid(
        "mail_storage_control_lock_required",
        "mail_storage_control",
        MAIL_STORAGE_CONTROL_SCOPE_KEY,
      );
    }
  }

  validateMutationReceiptPlan(plan, validatedWrites);

  return Object.freeze(trace);
}

function buildMysqlResourceAcquisitionPlan(plan) {
  validateEnvelope(plan);
  for (const lock of plan.locks) {
    validateLock(lock);
  }
  const locks = [...plan.locks].sort((left, right) => compareAcquisitions(
    {resource: left.resource, key: left.key},
    {resource: right.resource, key: right.key},
  ));
  const built = {...plan, locks};
  certify(built);
  return built;
}

function assertMysqlResourceAcquisitionOrder(plan) {
  certify(plan);
  return true;
}

function mysqlResourceAcquisitionTrace(plan) {
  return certify(plan);
}

module.exports = {
  MAIL_ACTIVE_COUNTER_INCREMENT_SQL,
  MAIL_ACTIVE_COUNTER_SEED_SQL,
  MAIL_IDENTITY_INSERT_SQL,
  MAIL_IDENTITY_LOCK_SQL,
  MAIL_IDENTITY_UPDATE_SQL,
  MAIL_STORAGE_CONTROL_LOCK_SQL,
  MARKET_CREATE_CAPACITY_CHECK_SQL,
  MARKET_CREATE_CAPACITY_GUARD_KEY,
  MARKET_CREATE_CAPACITY_LOCK_SQL,
  MARKET_MAX_LISTINGS,
  MARKET_MAX_LISTINGS_PER_SELLER,
  MUTATION_RECEIPT_CAPACITY_GUARD_KEY,
  MUTATION_RECEIPT_CAPACITY_UPDATE_SQL,
  MUTATION_RECEIPT_DELETE_SQL,
  MYSQL_RESOURCE_ACQUISITION_ORDER_INVALID,
  assertMysqlMutationReceiptWriteContract,
  buildMysqlResourceAcquisitionPlan,
  assertMysqlResourceAcquisitionOrder,
  mysqlResourceAcquisitionTrace,
  mysqlResourceWriteAffectedRowsAccepted,
};
