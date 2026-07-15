"use strict";

const {
  MARKET_MAX_LISTINGS,
  MARKET_MAX_LISTINGS_PER_SELLER,
} = require("./auth/market-listing-state");

const MYSQL_RESOURCE_ACQUISITION_ORDER_INVALID = "mysql_resource_acquisition_order_invalid";
const MARKET_CREATE_CAPACITY_GUARD_KEY = "market_create_capacity";
const MARKET_CREATE_CAPACITY_LOCK_SQL =
  "SELECT scope_key, revision FROM auth_store_revisions WHERE scope_key = ? FOR UPDATE";
const MARKET_CREATE_CAPACITY_CHECK_SQL = `SELECT COUNT(*) AS total_count,
  COALESCE(SUM(seller_account_id = ?), 0) AS seller_count
  FROM market_listings`;

const CONDITIONAL_PLAN_KINDS = new Set([
  "profile_conditional_v2",
  "market_create_conditional_v1",
  "market_cancel_conditional_v1",
  "market_buy_conditional_v1",
  "mail_claim_conditional_v1",
]);

const RESOURCE_RANK = new Map([
  ["profile_binding", 0],
  ["profile", 1],
  ["market_capacity", 2],
  ["market_listing", 3],
  ["mail_message", 4],
  ["consumed_equipment_envelope", 5],
  ["market_tax", 6],
  ["mutation_receipt", 7],
]);

const EXPLICIT_LOCK_RESOURCES = new Set([
  "profile_binding",
  "profile",
  "market_capacity",
  "market_listing",
  "mail_message",
]);

const WRITE_KINDS_BY_RESOURCE = new Map([
  ["profile_binding", new Set(["write"])],
  ["profile", new Set(["write"])],
  ["market_listing", new Set(["insert", "delete"])],
  ["mail_message", new Set(["insert", "update", "delete"])],
  ["consumed_equipment_envelope", new Set(["insert"])],
  ["market_tax", new Set(["update"])],
  ["mutation_receipt", new Set(["insert"])],
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
  if (resource === "mutation_receipt" && kind === "insert") {
    return {
      keyParamIndex: 0,
      paramsLength: 7,
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
  if (["market_capacity", "market_listing", "mail_message"].includes(resource) && lock.lockMode !== "exclusive") {
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
  if (write.expectedAffectedRows !== 1) {
    throw invalid("write_affected_rows_invalid", write.resource, key);
  }
  return {
    resource: write.resource,
    key,
    kind: write.kind,
  };
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
    || (write.resource === "mail_message" && write.kind !== "insert");
}

function certify(plan) {
  validateEnvelope(plan);
  const capacityCheck = validateCapacityCheck(plan);
  const trace = [];
  const acquired = new Set();
  const explicitLocks = new Map();
  let previous = null;

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
    const writeIdentity = identity(write.resource, write.key);
    const requiresPrelock = requiresExclusivePrelock(write);
    if (requiresPrelock) {
      const lock = explicitLocks.get(writeIdentity);
      if (!lock || lock.mode !== "exclusive") {
        throw invalid("exclusive_prelock_required", write.resource, write.key);
      }
      continue;
    }

    const acquisition = acquisitionForWrite(write);
    const acquisitionIdentity = identity(acquisition.resource, acquisition.key);
    if (acquired.has(acquisitionIdentity)) {
      throw invalid("duplicate_first_acquisition", acquisition.resource, acquisition.key);
    }
    if (previous !== null && compareAcquisitions(previous, acquisition) > 0) {
      throw invalid("first_acquisition_order_invalid", acquisition.resource, acquisition.key);
    }
    acquired.add(acquisitionIdentity);
    trace.push(Object.freeze(acquisition));
    previous = acquisition;
  }

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
  MARKET_CREATE_CAPACITY_CHECK_SQL,
  MARKET_CREATE_CAPACITY_GUARD_KEY,
  MARKET_CREATE_CAPACITY_LOCK_SQL,
  MARKET_MAX_LISTINGS,
  MARKET_MAX_LISTINGS_PER_SELLER,
  MYSQL_RESOURCE_ACQUISITION_ORDER_INVALID,
  buildMysqlResourceAcquisitionPlan,
  assertMysqlResourceAcquisitionOrder,
  mysqlResourceAcquisitionTrace,
};
