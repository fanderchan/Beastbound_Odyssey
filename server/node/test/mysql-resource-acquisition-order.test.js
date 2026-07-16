"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MAIL_ACTIVE_COUNTER_INCREMENT_SQL,
  MAIL_ACTIVE_COUNTER_SEED_SQL,
  MAIL_IDENTITY_INSERT_SQL,
  MAIL_IDENTITY_LOCK_SQL,
  MAIL_IDENTITY_UPDATE_SQL,
  MAIL_STORAGE_CONTROL_LOCK_SQL,
  MARKET_CREATE_CAPACITY_CHECK_SQL,
  MARKET_CREATE_CAPACITY_GUARD_KEY,
  MARKET_MAX_LISTINGS,
  MARKET_MAX_LISTINGS_PER_SELLER,
  MUTATION_RECEIPT_CAPACITY_GUARD_KEY,
  MUTATION_RECEIPT_CAPACITY_UPDATE_SQL,
  MUTATION_RECEIPT_DELETE_SQL,
  MYSQL_RESOURCE_ACQUISITION_ORDER_INVALID,
  buildMysqlResourceAcquisitionPlan,
  assertMysqlResourceAcquisitionOrder,
  mysqlResourceAcquisitionTrace,
  mysqlResourceWriteAffectedRowsAccepted,
} = require("../src/mysql-resource-acquisition-order");
const {
  __runMysqlPoolSavePlanForTest,
} = require("../src/mysql-store");

const MAIL_STORAGE_CONTROL_KEY = "mail_lifecycle";
const MAIL_CREATED_AT = "2026-07-16T00:00:00.000Z";
const MAIL_SETTLED_AT = "2026-07-16T01:00:00.000Z";
const MAIL_IDENTITY_DIGEST = "a".repeat(64);
const MAIL_PREVIOUS_DOCUMENT_DIGEST = "b".repeat(64);
const MAIL_NEXT_DOCUMENT_DIGEST = "c".repeat(64);

function lock(resource, key, lockMode = "exclusive") {
  const identityFieldByResource = {
    mail_storage_control: "scope_key",
    profile_binding: "account_id",
    profile: "player_id",
    market_capacity: "scope_key",
    market_listing: "listing_id",
    mail_identity: "mail_id",
    mail_message: "mail_id",
  };
  const suffix = lockMode === "shared" ? "FOR SHARE" : "FOR UPDATE";
  const sqlByResource = {
    mail_storage_control: MAIL_STORAGE_CONTROL_LOCK_SQL,
    profile_binding: `SELECT account_id, player_id, profile_revision FROM profile_bindings WHERE account_id = ? ${suffix}`,
    profile: `SELECT player_id, account_id, profile_revision FROM profiles WHERE player_id = ? ${suffix}`,
    market_capacity: "SELECT scope_key, revision FROM auth_store_revisions WHERE scope_key = ? FOR UPDATE",
    market_listing: `SELECT listing_id, seller_account_id, item_id, currency, unit_price,
      item_count, created_at, document_json
      FROM market_listings WHERE listing_id = ? ${suffix}`,
    mail_identity: MAIL_IDENTITY_LOCK_SQL,
    mail_message: `SELECT mail_id, sender_account_id, recipient_account_id, title,
      created_at, read_at, document_json
      FROM mail_messages WHERE mail_id = ? ${suffix}`,
  };
  const identityField = identityFieldByResource[resource];
  const expectedRow = {[identityField]: key};
  if (resource === "mail_storage_control") {
    Object.assign(expectedRow, {
      schema_generation: 1,
      data_generation: 1,
      lifecycle_state: "ready",
      archive_enabled: 0,
      vault_claim_enabled: 0,
      active_limit_enabled: 0,
    });
  }
  if (resource === "market_capacity") {
    expectedRow.revision = 0;
  }
  if (resource === "mail_identity") {
    Object.assign(expectedRow, {
      sender_account_id: "system",
      recipient_account_id: "recipient-1",
      location: "active",
      created_at: MAIL_CREATED_AT,
      settled_at: null,
      archived_at: null,
      identity_digest: MAIL_IDENTITY_DIGEST,
      document_digest: MAIL_PREVIOUS_DOCUMENT_DIGEST,
      reward_id: null,
      data_generation: 1,
    });
  }
  return {
    kind: "lock",
    resource,
    key,
    lockMode,
    sql: sqlByResource[resource],
    params: [key],
    expectedRow,
  };
}

function write(resource, key, kind) {
  let sql = "test sql";
  let params = [key];
  if (resource === "profile_binding" && kind === "write") {
    sql = `UPDATE profile_bindings
      SET player_id = ?, profile_revision = ?, updated_at = ?, document_json = CAST(? AS JSON)
      WHERE account_id = ? AND player_id = ? AND profile_revision = ?`;
    params = ["player-1", 1, "now", "{}", key, "player-1", 0];
  } else if (resource === "profile" && kind === "write") {
    sql = `UPDATE profiles
      SET account_id = ?, profile_revision = ?, updated_at = ?, profile_json = CAST(? AS JSON)
      WHERE player_id = ? AND account_id = ? AND profile_revision = ?`;
    params = ["account-1", 1, "now", "{}", key, "account-1", 0];
  } else if (resource === "market_listing" && kind === "delete") {
    sql = `DELETE FROM market_listings
      WHERE listing_id = ? AND seller_account_id = ? AND item_id = ?
        AND currency = ? AND unit_price = ? AND item_count = ? AND created_at = ?`;
    params = [key, "seller-1", "item-1", "stoneCoins", 1, 1, "now"];
  } else if (resource === "market_listing" && kind === "insert") {
    sql = `INSERT INTO market_listings
      (listing_id, seller_account_id, item_id, currency, unit_price, item_count, created_at, document_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`;
    params = [key, "seller-1", "item-1", "stoneCoins", 1, 1, "now", "{}"];
  } else if (resource === "mail_active_counter" && kind === "seed") {
    sql = MAIL_ACTIVE_COUNTER_SEED_SQL;
    params = [key];
  } else if (resource === "mail_active_counter" && kind === "increment") {
    sql = MAIL_ACTIVE_COUNTER_INCREMENT_SQL;
    params = [1, key, 1];
  } else if (resource === "mail_identity" && kind === "insert") {
    sql = MAIL_IDENTITY_INSERT_SQL;
    params = [
      key,
      "system",
      "recipient-1",
      MAIL_CREATED_AT,
      null,
      MAIL_IDENTITY_DIGEST,
      MAIL_PREVIOUS_DOCUMENT_DIGEST,
    ];
  } else if (resource === "mail_identity" && kind === "update") {
    sql = MAIL_IDENTITY_UPDATE_SQL;
    params = [
      null,
      MAIL_NEXT_DOCUMENT_DIGEST,
      key,
      "system",
      "recipient-1",
      MAIL_CREATED_AT,
      null,
      MAIL_IDENTITY_DIGEST,
      MAIL_PREVIOUS_DOCUMENT_DIGEST,
    ];
  } else if (resource === "mail_message" && kind === "insert") {
    sql = `INSERT INTO mail_messages
      (mail_id, sender_account_id, recipient_account_id, title, created_at, read_at, document_json)
      VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))`;
    params = [key, "system", "recipient-1", "title", "now", null, "{}"];
  } else if (resource === "mail_message" && kind === "update") {
    sql = `UPDATE mail_messages
      SET sender_account_id = ?, recipient_account_id = ?, title = ?, created_at = ?,
        read_at = ?, document_json = CAST(? AS JSON)
      WHERE mail_id = ? AND sender_account_id = ? AND recipient_account_id = ?
        AND title = ? AND created_at = ? AND read_at <=> ?`;
    params = ["system", "recipient-1", "title", "now", null, "{}", key, "system", "recipient-1", "title", "now", null];
  } else if (resource === "mail_message" && kind === "delete") {
    sql = `DELETE FROM mail_messages
      WHERE mail_id = ? AND sender_account_id = ? AND recipient_account_id = ?
        AND title = ? AND created_at = ? AND read_at <=> ?`;
    params = [key, "system", "recipient-1", "title", "now", null];
  } else if (resource === "consumed_equipment_envelope" && kind === "insert") {
    sql = "INSERT INTO consumed_equipment_envelopes (envelope_id) VALUES (?)";
  } else if (resource === "market_tax" && kind === "update") {
    const jsonPath = key === "stoneCoins"
      ? "$.marketConfig.taxCollected.stoneCoins"
      : "$.marketConfig.taxCollected.diamonds";
    sql = `UPDATE server_state
      SET document_json = JSON_SET(
        document_json,
        '${jsonPath}',
        CAST(JSON_UNQUOTE(JSON_EXTRACT(document_json, '${jsonPath}')) AS UNSIGNED) + ?
      )
      WHERE state_key = 'auth'
        AND JSON_TYPE(JSON_EXTRACT(document_json, '${jsonPath}')) IN ('INTEGER', 'UNSIGNED INTEGER')
        AND CAST(JSON_UNQUOTE(JSON_EXTRACT(document_json, '${jsonPath}')) AS UNSIGNED) <= ?`;
    params = [1, Number.MAX_SAFE_INTEGER - 1];
  } else if (resource === "mutation_receipt_capacity" && kind === "update") {
    sql = MUTATION_RECEIPT_CAPACITY_UPDATE_SQL;
    params = [1, 1];
  } else if (resource === "mutation_receipt" && ["delete", "insert"].includes(kind)) {
    const receipt = {
      schemaVersion: 1,
      operationId: key,
      requestHash: "a".repeat(64),
      actionId: "profile.save",
      accountId: "account-1",
      committedAt: kind === "delete"
        ? "2026-07-12T00:00:00.000Z"
        : "2026-07-16T00:00:00.000Z",
      expiresAt: kind === "delete"
        ? "2026-07-15T00:00:00.000Z"
        : "2026-07-19T00:00:00.000Z",
      response: {ok: true},
    };
    sql = kind === "delete"
      ? MUTATION_RECEIPT_DELETE_SQL
      : `INSERT INTO mutation_receipts
        (operation_id, request_hash, action_id, account_id, committed_at, expires_at, document_json)
        VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))`;
    params = [
      receipt.operationId,
      receipt.requestHash,
      receipt.actionId,
      receipt.accountId,
      receipt.committedAt,
      receipt.expiresAt,
      JSON.stringify(receipt),
    ];
  }
  return {
    kind,
    resource,
    key,
    sql,
    params,
    expectedAffectedRows: resource === "mail_active_counter" && kind === "seed"
      ? [0, 1, 2]
      : 1,
  };
}

function plan(overrides = {}) {
  const operationId = Object.prototype.hasOwnProperty.call(overrides, "operationId")
    ? overrides.operationId
    : "operation-1";
  const writes = Object.prototype.hasOwnProperty.call(overrides, "writes")
    ? overrides.writes
    : [
      write("mutation_receipt_capacity", MUTATION_RECEIPT_CAPACITY_GUARD_KEY, "update"),
      write("mutation_receipt", operationId, "insert"),
    ];
  return {
    kind: "market_buy_conditional_v1",
    globalRevisionFence: false,
    globalCompatibilityBarrier: "shared",
    operationId,
    locks: [],
    writes,
    ...overrides,
  };
}

function capacityCheck(accountId = "account-1", overrides = {}) {
  return {
    kind: "check",
    resource: "market_capacity",
    key: MARKET_CREATE_CAPACITY_GUARD_KEY,
    sql: MARKET_CREATE_CAPACITY_CHECK_SQL,
    params: [accountId],
    maxTotalListings: MARKET_MAX_LISTINGS,
    maxSellerListings: MARKET_MAX_LISTINGS_PER_SELLER,
    ...overrides,
  };
}

function marketCreatePlan(overrides = {}) {
  const accountId = String(overrides.accountId || "account-1");
  return plan({
    kind: "market_create_conditional_v1",
    accountId,
    observedTotalListingCount: 0,
    observedSellerListingCount: 0,
    maxTotalListings: MARKET_MAX_LISTINGS,
    maxSellerListings: MARKET_MAX_LISTINGS_PER_SELLER,
    capacityCheck: capacityCheck(accountId),
    locks: [lock("market_capacity", MARKET_CREATE_CAPACITY_GUARD_KEY)],
    ...overrides,
  });
}

function rejectsInvalid(action, reason) {
  assert.throws(action, (error) => {
    assert.equal(error.code, MYSQL_RESOURCE_ACQUISITION_ORDER_INVALID);
    if (reason) {
      assert.equal(error.reason, reason);
    }
    return true;
  });
}

function withDurableReceipt(writes, operationId = "operation-1") {
  return [
    ...writes,
    write("mutation_receipt_capacity", MUTATION_RECEIPT_CAPACITY_GUARD_KEY, "update"),
    write("mutation_receipt", operationId, "insert"),
  ];
}

test("builder sorts only explicit locks by resource then UTF-16 key and certifies the result", () => {
  const input = plan({
    locks: [
      lock("mail_identity", "mail-existing"),
      lock("market_listing", "listing-1"),
      lock("profile", "player-a", "shared"),
      lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared"),
      lock("profile_binding", "account-a", "shared"),
      lock("profile", "player-Z"),
      lock("profile_binding", "account-Z"),
    ],
    writes: [
      write("profile_binding", "account-Z", "write"),
      write("profile", "player-Z", "write"),
      write("market_listing", "listing-1", "delete"),
      write("mail_message", "mail-1", "insert"),
      write("market_tax", "stoneCoins", "update"),
      write("mutation_receipt_capacity", MUTATION_RECEIPT_CAPACITY_GUARD_KEY, "update"),
      write("mutation_receipt", "operation-1", "insert"),
    ],
  });
  const originalLocks = [...input.locks];
  const originalWrites = input.writes;

  const built = buildMysqlResourceAcquisitionPlan(input);

  assert.deepEqual(built.locks.map(({resource, key}) => [resource, key]), [
    ["mail_storage_control", MAIL_STORAGE_CONTROL_KEY],
    ["profile_binding", "account-Z"],
    ["profile_binding", "account-a"],
    ["profile", "player-Z"],
    ["profile", "player-a"],
    ["market_listing", "listing-1"],
    ["mail_identity", "mail-existing"],
  ]);
  assert.deepEqual(input.locks, originalLocks);
  assert.equal(built.writes, originalWrites);
  assert.equal(assertMysqlResourceAcquisitionOrder(built), true);
});

test("generation-zero and generation-one mail control fences are exact and fail closed", () => {
  const generationZero = lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared");
  generationZero.expectedRow.data_generation = 0;
  generationZero.expectedRow.lifecycle_state = "uninitialized";
  assert.equal(assertMysqlResourceAcquisitionOrder(plan({
    kind: "mail_send_conditional_v1",
    locks: [generationZero],
    writes: withDurableReceipt([write("mail_message", "mail-gen0", "insert")]),
  })), true);

  assert.equal(assertMysqlResourceAcquisitionOrder(plan({
    locks: [lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared")],
  })), true);

  for (const tamper of [
    (value) => { value.expectedRow.extra = true; },
    (value) => { value.expectedRow.schema_generation = 2; },
    (value) => { value.expectedRow.data_generation = 0; },
    (value) => { value.expectedRow.lifecycle_state = "building"; },
    (value) => { value.expectedRow.archive_enabled = 1; },
    (value) => { value.expectedRow.vault_claim_enabled = false; },
    (value) => { value.expectedRow.active_limit_enabled = 1; },
    (value) => { value.params[0] = "other-scope"; },
    (value) => { value.sql = value.sql.replace("FOR SHARE", "FOR UPDATE"); },
  ]) {
    const tampered = lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared");
    tamper(tampered);
    rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({locks: [tampered]})));
  }

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    locks: [lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "exclusive")],
  })), "lock_mode_invalid");
});

test("mail identity lock returns all twelve fields but expectedRow fixes exactly eleven derivable fields", () => {
  const certified = plan({
    locks: [
      lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared"),
      lock("mail_identity", "mail-1"),
    ],
  });
  assert.equal(assertMysqlResourceAcquisitionOrder(certified), true);
  assert.equal(MAIL_IDENTITY_LOCK_SQL, `SELECT mail_id, sender_account_id, recipient_account_id,
  location, created_at, settled_at, archived_at, identity_digest, document_digest,
  reward_id, data_generation, revision
  FROM mail_identity_registry WHERE mail_id = ? FOR UPDATE`);

  for (const tamper of [
    (value) => { value.expectedRow.revision = 0; },
    (value) => { value.expectedRow.location = "archive"; },
    (value) => { value.expectedRow.archived_at = MAIL_SETTLED_AT; },
    (value) => { value.expectedRow.reward_id = "reward-1"; },
    (value) => { value.expectedRow.data_generation = 0; },
    (value) => { value.expectedRow.identity_digest = "A".repeat(64); },
    (value) => { value.expectedRow.document_digest = "short"; },
    (value) => { value.expectedRow.settled_at = "not-a-date"; },
    (value) => { value.sql = value.sql.replace("reward_id", "archived_at AS reward_id"); },
  ]) {
    const tampered = lock("mail_identity", "mail-1");
    tamper(tampered);
    rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
      locks: [
        lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared"),
        tampered,
      ],
    })));
  }
});

test("generation-one send, read, and claim follow one certified resource order", () => {
  const send = plan({
    kind: "mail_send_conditional_v1",
    locks: [lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared")],
    writes: withDurableReceipt([
      write("mail_active_counter", "recipient-1", "seed"),
      (() => {
        const increment = write("mail_active_counter", "recipient-1", "increment");
        increment.params = [2, "recipient-1", 2];
        return increment;
      })(),
      write("mail_identity", "mail-1", "insert"),
      write("mail_message", "mail-1", "insert"),
    ]),
  });
  assert.deepEqual(mysqlResourceAcquisitionTrace(send), [
    {resource: "mail_storage_control", key: MAIL_STORAGE_CONTROL_KEY, mode: "shared", source: "locks", stage: "lock"},
    {resource: "mail_active_counter", key: "recipient-1", mode: "exclusive", source: "writes", stage: "seed"},
    {resource: "mail_identity", key: "mail-1", mode: "exclusive", source: "writes", stage: "insert"},
    {resource: "mail_message", key: "mail-1", mode: "exclusive", source: "writes", stage: "insert"},
    {resource: "mutation_receipt_capacity", key: MUTATION_RECEIPT_CAPACITY_GUARD_KEY, mode: "exclusive", source: "writes", stage: "update"},
    {resource: "mutation_receipt", key: "operation-1", mode: "exclusive", source: "writes", stage: "insert"},
  ]);

  const read = plan({
    kind: "mail_read_conditional_v1",
    locks: [
      lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared"),
      lock("mail_identity", "mail-1"),
      lock("mail_message", "mail-1"),
    ],
    writes: withDurableReceipt([
      write("mail_identity", "mail-1", "update"),
      write("mail_message", "mail-1", "update"),
    ]),
  });
  assert.deepEqual(mysqlResourceAcquisitionTrace(read).map(({resource, stage}) => [resource, stage]), [
    ["mail_storage_control", "lock"],
    ["mail_identity", "lock"],
    ["mail_message", "lock"],
    ["mutation_receipt_capacity", "update"],
    ["mutation_receipt", "insert"],
  ]);

  const settledIdentityUpdate = write("mail_identity", "mail-1", "update");
  settledIdentityUpdate.params[0] = MAIL_SETTLED_AT;
  const claim = plan({
    kind: "mail_claim_conditional_v1",
    locks: [
      lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared"),
      lock("profile_binding", "account-1"),
      lock("profile", "player-1"),
      lock("mail_identity", "mail-1"),
      lock("mail_message", "mail-1"),
    ],
    writes: withDurableReceipt([
      write("profile_binding", "account-1", "write"),
      write("profile", "player-1", "write"),
      settledIdentityUpdate,
      write("mail_message", "mail-1", "delete"),
      write("consumed_equipment_envelope", "envelope-1", "insert"),
    ]),
  });
  assert.deepEqual(mysqlResourceAcquisitionTrace(claim).map(({resource, stage}) => [resource, stage]), [
    ["mail_storage_control", "lock"],
    ["profile_binding", "lock"],
    ["profile", "lock"],
    ["mail_identity", "lock"],
    ["mail_message", "lock"],
    ["consumed_equipment_envelope", "insert"],
    ["mutation_receipt_capacity", "update"],
    ["mutation_receipt", "insert"],
  ]);
});

test("assert never repairs an unordered lock plan", () => {
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    locks: [lock("profile", "player-1"), lock("profile_binding", "account-1")],
  })), "explicit_lock_order_invalid");
});

test("explicit locks require matching lockMode SQL and reject duplicate keys", () => {
  const mismatched = lock("profile_binding", "account-1", "shared");
  mismatched.sql = "SELECT account_id FROM profile_bindings WHERE account_id = ? FOR UPDATE";
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({locks: [mismatched]})), "lock_mode_sql_mismatch");

  const missingMode = lock("profile_binding", "account-1");
  delete missingMode.lockMode;
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({locks: [missingMode]})), "lock_mode_invalid");

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    locks: [lock("market_listing", "listing-1", "shared")],
  })), "lock_mode_invalid");

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    locks: [lock("profile_binding", "account-1"), lock("profile_binding", "account-1")],
  })), "duplicate_explicit_lock");
});

test("explicit lock metadata is bound to its exact SQL, key param, and expected row", () => {
  const swappedKey = lock("profile_binding", "account-A");
  swappedKey.params[0] = "account-Z";
  swappedKey.expectedRow.account_id = "account-Z";
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({locks: [swappedKey]})), "lock_key_param_mismatch");

  const wrongTable = lock("profile_binding", "account-1");
  wrongTable.sql = wrongTable.sql.replace("FROM profile_bindings", "FROM profiles");
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({locks: [wrongTable]})), "lock_sql_contract_invalid");

  const missingExpectedRow = lock("profile", "player-1");
  delete missingExpectedRow.expectedRow;
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({locks: [missingExpectedRow]})), "lock_expected_row_key_mismatch");

  const wrongExpectedKey = lock("market_listing", "listing-1");
  wrongExpectedKey.expectedRow.listing_id = "listing-2";
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({locks: [wrongExpectedKey]})), "lock_expected_row_key_mismatch");

  const extraParam = lock("mail_message", "mail-1");
  extraParam.params.push("unmodeled");
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({locks: [extraParam]})), "lock_params_invalid");
});

test("updates and deletes require the same-key exclusive prelock", () => {
  for (const [resource, kind] of [
    ["profile_binding", "write"],
    ["profile", "write"],
    ["market_listing", "delete"],
    ["mail_identity", "update"],
    ["mail_message", "update"],
  ]) {
    rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
      locks: [lock(resource, "other-resource")],
      writes: [write(resource, "resource-1", kind)],
    })), "exclusive_prelock_required");
    rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
      writes: [write(resource, "resource-1", kind)],
    })), "exclusive_prelock_required");
  }

  for (const [resource, kind] of [
    ["profile_binding", "write"],
    ["profile", "write"],
  ]) {
    rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
      locks: [lock(resource, "resource-1", "shared")],
      writes: [write(resource, "resource-1", kind)],
    })), "exclusive_prelock_required");
  }
});

test("generation-one sidecars require the exact control fence and reject reverse acquisitions", () => {
  assert.equal(assertMysqlResourceAcquisitionOrder(plan({
    kind: "mail_send_conditional_v1",
    writes: withDurableReceipt([write("mail_message", "mail-1", "insert")]),
  })), true);

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    kind: "mail_send_conditional_v1",
    writes: withDurableReceipt([write("mail_identity", "mail-1", "insert")]),
  })), "mail_storage_control_lock_required");

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    kind: "mail_send_conditional_v1",
    writes: withDurableReceipt([
      write("mail_active_counter", "recipient-1", "seed"),
      write("mail_active_counter", "recipient-1", "increment"),
    ]),
  })), "mail_storage_control_lock_required");

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    kind: "mail_read_conditional_v1",
    locks: [lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared")],
    writes: withDurableReceipt([write("mail_identity", "mail-1", "update")]),
  })), "exclusive_prelock_required");

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    locks: [
      lock("mail_identity", "mail-1"),
      lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared"),
    ],
  })), "explicit_lock_order_invalid");

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    kind: "mail_send_conditional_v1",
    locks: [lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared")],
    writes: withDurableReceipt([
      write("mail_identity", "mail-1", "insert"),
      write("mail_active_counter", "recipient-1", "seed"),
    ]),
  })), "first_acquisition_order_invalid");

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    kind: "mail_send_conditional_v1",
    locks: [lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared")],
    writes: withDurableReceipt([
      write("mail_message", "mail-1", "insert"),
      write("mail_identity", "mail-1", "insert"),
    ]),
  })), "first_acquisition_order_invalid");
});

test("mail sidecar SQL and parameters are fixed to generation one and bounded CAS", () => {
  assert.equal(MAIL_STORAGE_CONTROL_LOCK_SQL, `SELECT scope_key, schema_generation, data_generation,
  lifecycle_state, archive_enabled, vault_claim_enabled, active_limit_enabled
  FROM mail_storage_control WHERE scope_key = ? FOR SHARE`);
  assert.equal(MAIL_ACTIVE_COUNTER_SEED_SQL, `INSERT INTO mail_active_counters
  (recipient_account_id, active_count, data_generation, revision)
  VALUES (?, 0, 1, 0)
  ON DUPLICATE KEY UPDATE recipient_account_id = VALUES(recipient_account_id)`);
  assert.equal(MAIL_ACTIVE_COUNTER_INCREMENT_SQL, `UPDATE mail_active_counters
  SET active_count = active_count + ?, revision = revision + 1
  WHERE recipient_account_id = ? AND data_generation = 1
    AND active_count <= 4294967295 - ?
    AND revision < 18446744073709551615`);
  assert.equal(MAIL_IDENTITY_INSERT_SQL, `INSERT INTO mail_identity_registry
  (mail_id, sender_account_id, recipient_account_id, location, created_at,
    settled_at, archived_at, identity_digest, document_digest, reward_id,
    data_generation, revision)
  VALUES (?, ?, ?, 'active', ?, ?, NULL, ?, ?, NULL, 1, 0)`);
  assert.equal(MAIL_IDENTITY_UPDATE_SQL, `UPDATE mail_identity_registry
  SET settled_at = ?, document_digest = ?, revision = revision + 1
  WHERE mail_id = ? AND sender_account_id = ? AND recipient_account_id = ?
    AND location = 'active' AND created_at = ? AND settled_at <=> ?
    AND archived_at IS NULL AND identity_digest = ? AND document_digest = ?
    AND reward_id IS NULL AND data_generation = 1
    AND revision < 18446744073709551615`);

  for (const tamper of [
    (value) => { value.sql = value.sql.replace("VALUES (?, 0, 1, 0)", "VALUES (?, 1, 1, 0)"); },
    (value) => { value.params[0] = "Recipient-1"; },
  ]) {
    const value = write("mail_active_counter", "recipient-1", "seed");
    tamper(value);
    rejectsInvalid(() => mysqlResourceWriteAffectedRowsAccepted(value, 1));
  }

  for (const tamper of [
    (value) => { value.sql = value.sql.replace("data_generation = 1", "data_generation = 0"); },
    (value) => { value.sql = value.sql.replace("revision < 18446744073709551615", "revision >= 0"); },
    (value) => { value.params = [0, "recipient-1", 0]; },
    (value) => { value.params = [2, "recipient-1", 1]; },
    (value) => { value.params = [4294967296, "recipient-1", 4294967296]; },
  ]) {
    const value = write("mail_active_counter", "recipient-1", "increment");
    tamper(value);
    rejectsInvalid(() => mysqlResourceWriteAffectedRowsAccepted(value, 1));
  }

  for (const tamper of [
    (value) => { value.sql = value.sql.replace("'active'", "'archive'"); },
    (value) => { value.sql = value.sql.replace("NULL, 1, 0", "NULL, 0, 0"); },
    (value) => { value.params[0] = "Mail-1"; },
    (value) => { value.params[3] = "now"; },
    (value) => { value.params[4] = "not-a-date"; },
    (value) => { value.params[5] = "A".repeat(64); },
  ]) {
    const value = write("mail_identity", "mail-1", "insert");
    tamper(value);
    rejectsInvalid(() => mysqlResourceWriteAffectedRowsAccepted(value, 1));
  }

  for (const tamper of [
    (value) => { value.sql = value.sql.replace("reward_id IS NULL", "reward_id IS NOT NULL"); },
    (value) => { value.sql = value.sql.replace("data_generation = 1", "data_generation = 2"); },
    (value) => { value.params[3] = "Other-Sender"; },
    (value) => { value.params[0] = "not-a-date"; },
    (value) => {
      value.params[6] = MAIL_SETTLED_AT;
      value.params[0] = null;
    },
    (value) => { value.params[1] = value.params[8]; },
  ]) {
    const value = write("mail_identity", "mail-1", "update");
    tamper(value);
    rejectsInvalid(() => mysqlResourceWriteAffectedRowsAccepted(value, 1));
  }
});

test("counter seed-to-increment is the only additional same-key write reuse", () => {
  const incrementByTwo = write("mail_active_counter", "recipient-1", "increment");
  incrementByTwo.params = [2, "recipient-1", 2];
  const certified = plan({
    kind: "mail_send_conditional_v1",
    locks: [lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared")],
    writes: withDurableReceipt([
      write("mail_active_counter", "recipient-1", "seed"),
      incrementByTwo,
    ]),
  });
  assert.deepEqual(mysqlResourceAcquisitionTrace(certified).map(({resource, key, stage}) => [resource, key, stage]), [
    ["mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "lock"],
    ["mail_active_counter", "recipient-1", "seed"],
    ["mutation_receipt_capacity", MUTATION_RECEIPT_CAPACITY_GUARD_KEY, "update"],
    ["mutation_receipt", "operation-1", "insert"],
  ]);

  for (const writes of [
    [
      write("mail_active_counter", "recipient-1", "seed"),
      write("mail_active_counter", "recipient-1", "seed"),
    ],
    [
      write("mail_active_counter", "recipient-1", "increment"),
      write("mail_active_counter", "recipient-1", "seed"),
    ],
    [
      write("mail_active_counter", "recipient-1", "increment"),
      write("mail_active_counter", "recipient-1", "increment"),
    ],
    [
      write("mail_identity", "mail-1", "insert"),
      write("mail_identity", "mail-1", "insert"),
    ],
  ]) {
    rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
      locks: [lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared")],
      writes: withDurableReceipt(writes),
    })), "duplicate_first_acquisition");
  }

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    kind: "mail_read_conditional_v1",
    locks: [
      lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared"),
      lock("mail_identity", "mail-1"),
    ],
    writes: withDurableReceipt([
      write("mail_identity", "mail-1", "update"),
      write("mail_identity", "mail-1", "update"),
    ]),
  })), "duplicate_first_acquisition");
});

test("executor-facing affected-row helper accepts only each certified write's exact set", () => {
  const seed = write("mail_active_counter", "recipient-1", "seed");
  assert.deepEqual([0, 1, 2, 3].map((count) => (
    mysqlResourceWriteAffectedRowsAccepted(seed, count)
  )), [true, true, true, false]);
  assert.equal(mysqlResourceWriteAffectedRowsAccepted(seed, -1), false);
  assert.equal(mysqlResourceWriteAffectedRowsAccepted(seed, 1.5), false);
  assert.equal(mysqlResourceWriteAffectedRowsAccepted(seed, Number.MAX_SAFE_INTEGER + 1), false);

  const increment = write("mail_active_counter", "recipient-1", "increment");
  increment.params = [2, "recipient-1", 2];
  assert.deepEqual([0, 1, 2].map((count) => (
    mysqlResourceWriteAffectedRowsAccepted(increment, count)
  )), [false, true, false]);
  assert.equal(mysqlResourceWriteAffectedRowsAccepted(
    write("mail_identity", "mail-1", "insert"),
    1,
  ), true);

  const badSeedMetadata = write("mail_active_counter", "recipient-1", "seed");
  badSeedMetadata.expectedAffectedRows = [0, 1];
  rejectsInvalid(
    () => mysqlResourceWriteAffectedRowsAccepted(badSeedMetadata, 1),
    "write_affected_rows_invalid",
  );
  const badIncrementMetadata = write("mail_active_counter", "recipient-1", "increment");
  badIncrementMetadata.expectedAffectedRows = [1];
  rejectsInvalid(
    () => mysqlResourceWriteAffectedRowsAccepted(badIncrementMetadata, 1),
    "write_affected_rows_invalid",
  );
});

test("write resource and kind pairs are fail-closed", () => {
  for (const invalidWrite of [
    write("profile", "player-1", "insert"),
    write("profile", "player-1", "update"),
    write("market_listing", "listing-1", "write"),
    write("mail_active_counter", "recipient-1", "insert"),
    write("mail_active_counter", "recipient-1", "update"),
    write("mail_identity", "mail-1", "seed"),
    write("mail_identity", "mail-1", "delete"),
    write("consumed_equipment_envelope", "envelope-1", "update"),
    write("market_tax", "stoneCoins", "insert"),
    write("mutation_receipt_capacity", MUTATION_RECEIPT_CAPACITY_GUARD_KEY, "insert"),
    write("mutation_receipt", "operation-1", "update"),
    write("unknown", "key-1", "insert"),
  ]) {
    rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({writes: [invalidWrite]})), "write_kind_invalid");
  }
});

test("write metadata is bound to exact SQL, physical key params, and one affected row", () => {
  const sellerWriteDisguisedAsBuyer = write("profile", "buyer-player", "write");
  sellerWriteDisguisedAsBuyer.params[4] = "seller-player";
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [sellerWriteDisguisedAsBuyer],
  })), "write_key_param_mismatch");

  for (const indexedIdentityMove of [
    (() => {
      const value = write("profile_binding", "account-1", "write");
      value.params[0] = "other-player";
      return value;
    })(),
    (() => {
      const value = write("profile", "player-1", "write");
      value.params[0] = "other-account";
      return value;
    })(),
    (() => {
      const value = write("mail_message", "mail-1", "update");
      value.params[1] = "other-recipient";
      return value;
    })(),
  ]) {
    rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
      writes: [indexedIdentityMove],
    })), "write_indexed_identity_change");
  }

  const mailInsert = write("mail_message", "mail-1", "insert");
  const receiptDisguisingMailSql = write("mutation_receipt", "operation-1", "insert");
  receiptDisguisingMailSql.sql = mailInsert.sql;
  receiptDisguisingMailSql.params = mailInsert.params;
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [receiptDisguisingMailSql],
  })), "write_sql_contract_invalid");

  for (const [resource, kind, key, keyParamIndex] of [
    ["market_listing", "insert", "listing-new", 0],
    ["market_listing", "delete", "listing-1", 0],
    ["mail_message", "update", "mail-1", 6],
    ["consumed_equipment_envelope", "insert", "envelope-1", 0],
    ["mutation_receipt", "insert", "operation-1", 0],
  ]) {
    const wrongKey = write(resource, key, kind);
    wrongKey.params[keyParamIndex] = `${key}-other`;
    rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
      writes: [wrongKey],
    })), "write_key_param_mismatch");
  }

  const wrongTaxPath = write("market_tax", "stoneCoins", "update");
  wrongTaxPath.sql = wrongTaxPath.sql.replaceAll("taxCollected.stoneCoins", "taxCollected.diamonds");
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({writes: [wrongTaxPath]})), "write_sql_contract_invalid");

  const wrongTaxRow = write("market_tax", "stoneCoins", "update");
  wrongTaxRow.sql = wrongTaxRow.sql.replace("state_key = 'auth'", "state_key = 'other'");
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({writes: [wrongTaxRow]})), "write_sql_contract_invalid");

  const wrongTaxParams = write("market_tax", "stoneCoins", "update");
  wrongTaxParams.params[1] -= 1;
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({writes: [wrongTaxParams]})), "write_params_invalid");

  const zeroAffectedRows = write("mail_message", "mail-1", "insert");
  zeroAffectedRows.expectedAffectedRows = 0;
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({writes: [zeroAffectedRows]})), "write_affected_rows_invalid");
});

test("receipt capacity update is exact, bounded, +1-only, and ranked immediately before receipts", () => {
  assert.equal(MUTATION_RECEIPT_CAPACITY_GUARD_KEY, "mutation_receipt_capacity");
  assert.equal(MUTATION_RECEIPT_CAPACITY_UPDATE_SQL, `UPDATE auth_store_revisions
  SET revision = revision + ?
  WHERE scope_key = 'mutation_receipt_capacity'
    AND revision + ? BETWEEN 0 AND 20000`);

  const trace = mysqlResourceAcquisitionTrace(plan());
  assert.deepEqual(trace.map(({resource, key, stage}) => [resource, key, stage]), [
    ["mutation_receipt_capacity", MUTATION_RECEIPT_CAPACITY_GUARD_KEY, "update"],
    ["mutation_receipt", "operation-1", "insert"],
  ]);

  const wrongKey = write("mutation_receipt_capacity", "other-capacity", "update");
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [wrongKey, write("mutation_receipt", "operation-1", "insert")],
  })), "write_key_contract_invalid");

  for (const params of [[2, 2], [1, 0], [-1, -1]]) {
    const wrongDelta = write(
      "mutation_receipt_capacity",
      MUTATION_RECEIPT_CAPACITY_GUARD_KEY,
      "update",
    );
    wrongDelta.params = params;
    rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
      writes: [wrongDelta, write("mutation_receipt", "operation-1", "insert")],
    })), "write_params_invalid");
  }

  const wrongSql = write(
    "mutation_receipt_capacity",
    MUTATION_RECEIPT_CAPACITY_GUARD_KEY,
    "update",
  );
  wrongSql.sql = wrongSql.sql.replace("BETWEEN 0 AND 20000", "<= 20000");
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [wrongSql, write("mutation_receipt", "operation-1", "insert")],
  })), "write_sql_contract_invalid");

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [
      write("mutation_receipt", "operation-1", "insert"),
      write("mutation_receipt_capacity", MUTATION_RECEIPT_CAPACITY_GUARD_KEY, "update"),
    ],
  })), "first_acquisition_order_invalid");
});

test("receipt insert and delete bind every indexed column to one typed JSON document", () => {
  assert.equal(MUTATION_RECEIPT_DELETE_SQL, `DELETE FROM mutation_receipts
  WHERE operation_id = ? AND request_hash = ? AND action_id = ?
    AND account_id <=> ? AND committed_at = ? AND expires_at = ?
    AND document_json = CAST(? AS JSON)`);

  assert.equal(assertMysqlResourceAcquisitionOrder(plan({
    writes: [
      write("mutation_receipt", "operation-1", "delete"),
      write("mutation_receipt", "operation-1", "insert"),
    ],
  })), true);

  const nullAccountDelete = write("mutation_receipt", "operation-1", "delete");
  const nullAccountInsert = write("mutation_receipt", "operation-1", "insert");
  for (const receiptWrite of [nullAccountDelete, nullAccountInsert]) {
    receiptWrite.params[3] = null;
    const document = JSON.parse(receiptWrite.params[6]);
    document.accountId = "";
    receiptWrite.params[6] = JSON.stringify(document);
  }
  assert.equal(assertMysqlResourceAcquisitionOrder(plan({
    writes: [nullAccountDelete, nullAccountInsert],
  })), true);

  for (const tamper of [
    (value) => { value.params[1] = "b".repeat(64); },
    (value) => { value.params[3] = 42; },
    (value) => { value.params[4] = "not-a-date"; },
    (value) => { value.params[6] = "{"; },
    (value) => {
      const document = JSON.parse(value.params[6]);
      document.operationId = "other-operation";
      value.params[6] = JSON.stringify(document);
    },
    (value) => {
      const document = JSON.parse(value.params[6]);
      document.response = [];
      value.params[6] = JSON.stringify(document);
    },
    (value) => {
      const document = JSON.parse(value.params[6]);
      document.unmodeled = true;
      value.params[6] = JSON.stringify(document);
    },
  ]) {
    const tampered = write("mutation_receipt", "operation-1", "delete");
    tamper(tampered);
    rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
      writes: [tampered, write("mutation_receipt", "operation-1", "insert")],
    })));
  }

  const deleteWithBroadPredicate = write("mutation_receipt", "operation-1", "delete");
  deleteWithBroadPredicate.sql = "DELETE FROM mutation_receipts WHERE operation_id = ?";
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [deleteWithBroadPredicate, write("mutation_receipt", "operation-1", "insert")],
  })), "write_sql_contract_invalid");

  const insertWithMismatchedDocument = write("mutation_receipt", "operation-1", "insert");
  const mismatchedDocument = JSON.parse(insertWithMismatchedDocument.params[6]);
  mismatchedDocument.requestHash = "b".repeat(64);
  insertWithMismatchedDocument.params[6] = JSON.stringify(mismatchedDocument);
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [
      write("mutation_receipt_capacity", MUTATION_RECEIPT_CAPACITY_GUARD_KEY, "update"),
      insertWithMismatchedDocument,
    ],
  })), "write_receipt_document_invalid");

  const activeDelete = write("mutation_receipt", "operation-1", "delete");
  activeDelete.params[5] = "2026-07-17T00:00:00.000Z";
  const activeDeleteDocument = JSON.parse(activeDelete.params[6]);
  activeDeleteDocument.expiresAt = activeDelete.params[5];
  activeDelete.params[6] = JSON.stringify(activeDeleteDocument);
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [activeDelete, write("mutation_receipt", "operation-1", "insert")],
  })), "receipt_delete_not_expired");
});

test("each conditional plan has one receipt insert and the exact net-count capacity write", () => {
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [write("mutation_receipt_capacity", MUTATION_RECEIPT_CAPACITY_GUARD_KEY, "update")],
  })), "receipt_insert_count_invalid");

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [
      write("mutation_receipt_capacity", MUTATION_RECEIPT_CAPACITY_GUARD_KEY, "update"),
      write("mutation_receipt", "operation-a", "insert"),
      write("mutation_receipt", "operation-b", "insert"),
    ],
    operationId: "operation-a",
  })), "receipt_insert_count_invalid");

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [write("mutation_receipt", "operation-1", "insert")],
  })), "receipt_capacity_increment_required");

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [
      write("mutation_receipt_capacity", MUTATION_RECEIPT_CAPACITY_GUARD_KEY, "update"),
      write("mutation_receipt", "operation-a", "delete"),
      write("mutation_receipt", "operation-b", "insert"),
    ],
    operationId: "operation-b",
  })), "receipt_capacity_increment_unexpected");

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [
      write("mutation_receipt", "operation-a", "delete"),
      write("mutation_receipt", "operation-b", "delete"),
      write("mutation_receipt", "operation-c", "insert"),
    ],
    operationId: "operation-c",
  })), "receipt_delete_count_invalid");

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    operationId: "operation-other",
    writes: [
      write("mutation_receipt_capacity", MUTATION_RECEIPT_CAPACITY_GUARD_KEY, "update"),
      write("mutation_receipt", "operation-1", "insert"),
    ],
  })), "receipt_operation_id_mismatch");
});

test("receipt keys are canonical while only same-key delete-to-insert reuses one acquisition", () => {
  const insertBeforeCrossKeyDelete = plan({
    operationId: "operation-a",
    writes: [
      write("mutation_receipt", "operation-a", "insert"),
      write("mutation_receipt", "operation-z", "delete"),
    ],
  });
  assert.deepEqual(mysqlResourceAcquisitionTrace(insertBeforeCrossKeyDelete), [
    {resource: "mutation_receipt", key: "operation-a", mode: "exclusive", source: "writes", stage: "insert"},
    {resource: "mutation_receipt", key: "operation-z", mode: "exclusive", source: "writes", stage: "delete"},
  ]);

  const sameKeyReuse = plan({
    writes: [
      write("mutation_receipt", "operation-1", "delete"),
      write("mutation_receipt", "operation-1", "insert"),
    ],
  });
  assert.deepEqual(mysqlResourceAcquisitionTrace(sameKeyReuse), [
    {resource: "mutation_receipt", key: "operation-1", mode: "exclusive", source: "writes", stage: "delete"},
  ]);

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    operationId: "operation-a",
    writes: [
      write("mutation_receipt", "operation-z", "delete"),
      write("mutation_receipt", "operation-a", "insert"),
    ],
  })), "first_acquisition_order_invalid");

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [
      write("mutation_receipt", "operation-1", "insert"),
      write("mutation_receipt", "operation-1", "delete"),
    ],
  })), "duplicate_first_acquisition");
});

test("mail inserts, envelope inserts, tax update and receipt insert enter the acquisition trace", () => {
  const certified = plan({
    kind: "mail_claim_conditional_v1",
    locks: [
      lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared"),
      lock("profile_binding", "account-1"),
      lock("profile", "player-1"),
      lock("mail_message", "mail-existing"),
    ],
    writes: [
      write("profile_binding", "account-1", "write"),
      write("profile", "player-1", "write"),
      write("mail_message", "mail-existing", "delete"),
      write("consumed_equipment_envelope", "envelope-A", "insert"),
      write("consumed_equipment_envelope", "envelope-a", "insert"),
      write("mutation_receipt_capacity", MUTATION_RECEIPT_CAPACITY_GUARD_KEY, "update"),
      write("mutation_receipt", "operation-1", "insert"),
    ],
  });

  const trace = mysqlResourceAcquisitionTrace(certified);
  assert.deepEqual(trace, [
    {resource: "mail_storage_control", key: MAIL_STORAGE_CONTROL_KEY, mode: "shared", source: "locks", stage: "lock"},
    {resource: "profile_binding", key: "account-1", mode: "exclusive", source: "locks", stage: "lock"},
    {resource: "profile", key: "player-1", mode: "exclusive", source: "locks", stage: "lock"},
    {resource: "mail_message", key: "mail-existing", mode: "exclusive", source: "locks", stage: "lock"},
    {resource: "consumed_equipment_envelope", key: "envelope-A", mode: "exclusive", source: "writes", stage: "insert"},
    {resource: "consumed_equipment_envelope", key: "envelope-a", mode: "exclusive", source: "writes", stage: "insert"},
    {resource: "mutation_receipt_capacity", key: MUTATION_RECEIPT_CAPACITY_GUARD_KEY, mode: "exclusive", source: "writes", stage: "update"},
    {resource: "mutation_receipt", key: "operation-1", mode: "exclusive", source: "writes", stage: "insert"},
  ]);
  assert.equal(Object.isFrozen(trace), true);
  assert.equal(Object.isFrozen(trace[0]), true);
  assert.deepEqual(Object.keys(trace[0]).sort(), ["key", "mode", "resource", "source", "stage"]);
});

test("first-write acquisitions validate total order and physical duplicates", () => {
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [
      write("consumed_equipment_envelope", "envelope-1", "insert"),
      write("mail_message", "mail-1", "insert"),
    ],
  })), "first_acquisition_order_invalid");

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [
      write("consumed_equipment_envelope", "envelope-b", "insert"),
      write("consumed_equipment_envelope", "envelope-a", "insert"),
    ],
  })), "first_acquisition_order_invalid");

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [
      write("mail_message", "mail-1", "insert"),
      write("mail_message", "mail-1", "insert"),
    ],
  })), "duplicate_first_acquisition");

  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({
    writes: [
      write("market_tax", "diamonds", "update"),
      write("market_tax", "stoneCoins", "update"),
    ],
  })), "duplicate_first_acquisition");
});

test("market tax traces the real server_state/auth acquisition", () => {
  const trace = mysqlResourceAcquisitionTrace(plan({
    locks: [lock("mail_storage_control", MAIL_STORAGE_CONTROL_KEY, "shared")],
    writes: [
      write("mail_message", "mail-1", "insert"),
      write("market_tax", "diamonds", "update"),
      write("mutation_receipt_capacity", MUTATION_RECEIPT_CAPACITY_GUARD_KEY, "update"),
      write("mutation_receipt", "operation-1", "insert"),
    ],
  }));
  assert.deepEqual(trace.map(({resource, key}) => [resource, key]), [
    ["mail_storage_control", MAIL_STORAGE_CONTROL_KEY],
    ["mail_message", "mail-1"],
    ["market_tax", "auth"],
    ["mutation_receipt_capacity", MUTATION_RECEIPT_CAPACITY_GUARD_KEY],
    ["mutation_receipt", "operation-1"],
  ]);
});

test("market create capacity guard precedes a plain listing insert and durable receipt", () => {
  const certified = marketCreatePlan({
    locks: [
      lock("profile_binding", "account-1"),
      lock("profile", "player-1"),
      lock("market_capacity", MARKET_CREATE_CAPACITY_GUARD_KEY),
    ],
    writes: [
      write("profile_binding", "account-1", "write"),
      write("profile", "player-1", "write"),
      write("market_listing", "listing-new", "insert"),
      write("mutation_receipt_capacity", MUTATION_RECEIPT_CAPACITY_GUARD_KEY, "update"),
      write("mutation_receipt", "operation-1", "insert"),
    ],
  });

  assert.deepEqual(mysqlResourceAcquisitionTrace(certified), [
    {resource: "profile_binding", key: "account-1", mode: "exclusive", source: "locks", stage: "lock"},
    {resource: "profile", key: "player-1", mode: "exclusive", source: "locks", stage: "lock"},
    {resource: "market_capacity", key: MARKET_CREATE_CAPACITY_GUARD_KEY, mode: "exclusive", source: "locks", stage: "lock"},
    {resource: "market_listing", key: "listing-new", mode: "exclusive", source: "writes", stage: "insert"},
    {resource: "mutation_receipt_capacity", key: MUTATION_RECEIPT_CAPACITY_GUARD_KEY, mode: "exclusive", source: "writes", stage: "update"},
    {resource: "mutation_receipt", key: "operation-1", mode: "exclusive", source: "writes", stage: "insert"},
  ]);
});

test("market create capacity SQL, params, constants, counts, and guard metadata are fail-closed", () => {
  for (const tamper of [
    (value) => { delete value.capacityCheck; },
    (value) => { value.capacityCheck.extra = true; },
    (value) => { value.capacityCheck.sql += " FOR UPDATE"; },
    (value) => { value.capacityCheck.params[0] = "account-other"; },
    (value) => { value.capacityCheck.maxTotalListings -= 1; },
    (value) => { value.capacityCheck.maxSellerListings -= 1; },
    (value) => { value.maxTotalListings -= 1; },
    (value) => { value.maxSellerListings -= 1; },
    (value) => { value.observedTotalListingCount = -1; },
    (value) => { value.observedSellerListingCount = 1; },
  ]) {
    const tampered = marketCreatePlan();
    tamper(tampered);
    rejectsInvalid(
      () => assertMysqlResourceAcquisitionOrder(tampered),
      "capacity_check_invalid",
    );
  }

  const missingGuard = marketCreatePlan({locks: []});
  rejectsInvalid(
    () => assertMysqlResourceAcquisitionOrder(missingGuard),
    "market_capacity_guard_required",
  );

  const badGuard = lock("market_capacity", MARKET_CREATE_CAPACITY_GUARD_KEY);
  badGuard.expectedRow.revision = 1;
  rejectsInvalid(
    () => assertMysqlResourceAcquisitionOrder(marketCreatePlan({locks: [badGuard]})),
    "market_capacity_guard_invalid",
  );
});

test("only the seven conditional plans behind the shared barrier are accepted", () => {
  for (const kind of [
    "profile_conditional_v2",
    "market_cancel_conditional_v1",
    "market_buy_conditional_v1",
    "mail_send_conditional_v1",
    "mail_read_conditional_v1",
    "mail_claim_conditional_v1",
  ]) {
    assert.equal(assertMysqlResourceAcquisitionOrder(plan({kind})), true);
  }
  assert.equal(assertMysqlResourceAcquisitionOrder(marketCreatePlan()), true);
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({kind: "snapshot_v1"})), "conditional_plan_kind_invalid");
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({globalCompatibilityBarrier: "exclusive"})), "global_shared_barrier_invalid");
  rejectsInvalid(() => assertMysqlResourceAcquisitionOrder(plan({globalRevisionFence: true})), "global_shared_barrier_invalid");
});

test("executor rejects a tampered lock order before acquiring a database connection", async () => {
  let connectionAcquisitions = 0;
  const pool = {
    async getConnection() {
      connectionAcquisitions += 1;
      throw new Error("executor reached database unexpectedly");
    },
  };
  await assert.rejects(
    __runMysqlPoolSavePlanForTest(pool, plan({
      locks: [
        lock("profile", "player-1"),
        lock("profile_binding", "account-1"),
      ],
    }), {expectedRevision: 1, revisionCasEnabled: true}),
    (error) => error
      && error.code === MYSQL_RESOURCE_ACQUISITION_ORDER_INVALID
      && error.reason === "explicit_lock_order_invalid",
  );
  assert.equal(connectionAcquisitions, 0);
});

test("executor rejects tampered SQL payload identity before acquiring a database connection", async () => {
  let connectionAcquisitions = 0;
  const pool = {
    async getConnection() {
      connectionAcquisitions += 1;
      throw new Error("executor reached database unexpectedly");
    },
  };
  const tampered = lock("profile_binding", "account-A");
  tampered.params[0] = "account-Z";
  tampered.expectedRow.account_id = "account-Z";
  await assert.rejects(
    __runMysqlPoolSavePlanForTest(pool, plan({locks: [tampered]}), {
      expectedRevision: 1,
      revisionCasEnabled: true,
    }),
    (error) => error
      && error.code === MYSQL_RESOURCE_ACQUISITION_ORDER_INVALID
      && error.reason === "lock_key_param_mismatch",
  );
  assert.equal(connectionAcquisitions, 0);
});
