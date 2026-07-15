"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MARKET_CREATE_CAPACITY_CHECK_SQL,
  MARKET_CREATE_CAPACITY_GUARD_KEY,
  MARKET_MAX_LISTINGS,
  MARKET_MAX_LISTINGS_PER_SELLER,
  MYSQL_RESOURCE_ACQUISITION_ORDER_INVALID,
  buildMysqlResourceAcquisitionPlan,
  assertMysqlResourceAcquisitionOrder,
  mysqlResourceAcquisitionTrace,
} = require("../src/mysql-resource-acquisition-order");
const {
  __runMysqlPoolSavePlanForTest,
} = require("../src/mysql-store");

function lock(resource, key, lockMode = "exclusive") {
  const identityFieldByResource = {
    profile_binding: "account_id",
    profile: "player_id",
    market_capacity: "scope_key",
    market_listing: "listing_id",
    mail_message: "mail_id",
  };
  const suffix = lockMode === "shared" ? "FOR SHARE" : "FOR UPDATE";
  const sqlByResource = {
    profile_binding: `SELECT account_id, player_id, profile_revision FROM profile_bindings WHERE account_id = ? ${suffix}`,
    profile: `SELECT player_id, account_id, profile_revision FROM profiles WHERE player_id = ? ${suffix}`,
    market_capacity: "SELECT scope_key, revision FROM auth_store_revisions WHERE scope_key = ? FOR UPDATE",
    market_listing: `SELECT listing_id, seller_account_id, item_id, currency, unit_price,
      item_count, created_at, document_json
      FROM market_listings WHERE listing_id = ? ${suffix}`,
    mail_message: `SELECT mail_id, sender_account_id, recipient_account_id, title,
      created_at, read_at, document_json
      FROM mail_messages WHERE mail_id = ? ${suffix}`,
  };
  const identityField = identityFieldByResource[resource];
  const expectedRow = {[identityField]: key};
  if (resource === "market_capacity") {
    expectedRow.revision = 0;
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
  } else if (resource === "mutation_receipt" && kind === "insert") {
    sql = `INSERT INTO mutation_receipts
      (operation_id, request_hash, action_id, account_id, committed_at, expires_at, document_json)
      VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))`;
    params = [key, "hash", "action", "account-1", "now", "later", "{}"];
  }
  return {kind, resource, key, sql, params, expectedAffectedRows: 1};
}

function plan(overrides = {}) {
  return {
    kind: "market_buy_conditional_v1",
    globalRevisionFence: false,
    globalCompatibilityBarrier: "shared",
    locks: [],
    writes: [],
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

test("builder sorts only explicit locks by resource then UTF-16 key and certifies the result", () => {
  const input = plan({
    locks: [
      lock("market_listing", "listing-1"),
      lock("profile", "player-a", "shared"),
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
      write("mutation_receipt", "operation-1", "insert"),
    ],
  });
  const originalLocks = [...input.locks];
  const originalWrites = input.writes;

  const built = buildMysqlResourceAcquisitionPlan(input);

  assert.deepEqual(built.locks.map(({resource, key}) => [resource, key]), [
    ["profile_binding", "account-Z"],
    ["profile_binding", "account-a"],
    ["profile", "player-Z"],
    ["profile", "player-a"],
    ["market_listing", "listing-1"],
  ]);
  assert.deepEqual(input.locks, originalLocks);
  assert.equal(built.writes, originalWrites);
  assert.equal(assertMysqlResourceAcquisitionOrder(built), true);
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

test("write resource and kind pairs are fail-closed", () => {
  for (const invalidWrite of [
    write("profile", "player-1", "insert"),
    write("profile", "player-1", "update"),
    write("market_listing", "listing-1", "write"),
    write("consumed_equipment_envelope", "envelope-1", "update"),
    write("market_tax", "stoneCoins", "insert"),
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

test("mail inserts, envelope inserts, tax update and receipt insert enter the acquisition trace", () => {
  const certified = plan({
    kind: "mail_claim_conditional_v1",
    locks: [
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
      write("mutation_receipt", "operation-1", "insert"),
    ],
  });

  const trace = mysqlResourceAcquisitionTrace(certified);
  assert.deepEqual(trace, [
    {resource: "profile_binding", key: "account-1", mode: "exclusive", source: "locks", stage: "lock"},
    {resource: "profile", key: "player-1", mode: "exclusive", source: "locks", stage: "lock"},
    {resource: "mail_message", key: "mail-existing", mode: "exclusive", source: "locks", stage: "lock"},
    {resource: "consumed_equipment_envelope", key: "envelope-A", mode: "exclusive", source: "writes", stage: "insert"},
    {resource: "consumed_equipment_envelope", key: "envelope-a", mode: "exclusive", source: "writes", stage: "insert"},
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
    writes: [
      write("mail_message", "mail-1", "insert"),
      write("market_tax", "diamonds", "update"),
      write("mutation_receipt", "operation-1", "insert"),
    ],
  }));
  assert.deepEqual(trace.map(({resource, key}) => [resource, key]), [
    ["mail_message", "mail-1"],
    ["market_tax", "auth"],
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
      write("mutation_receipt", "operation-1", "insert"),
    ],
  });

  assert.deepEqual(mysqlResourceAcquisitionTrace(certified), [
    {resource: "profile_binding", key: "account-1", mode: "exclusive", source: "locks", stage: "lock"},
    {resource: "profile", key: "player-1", mode: "exclusive", source: "locks", stage: "lock"},
    {resource: "market_capacity", key: MARKET_CREATE_CAPACITY_GUARD_KEY, mode: "exclusive", source: "locks", stage: "lock"},
    {resource: "market_listing", key: "listing-new", mode: "exclusive", source: "writes", stage: "insert"},
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

test("only the five conditional plans behind the shared barrier are accepted", () => {
  for (const kind of [
    "profile_conditional_v2",
    "market_cancel_conditional_v1",
    "market_buy_conditional_v1",
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
