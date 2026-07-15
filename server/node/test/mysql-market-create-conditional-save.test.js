"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {cloneAuthorityRoot} = require("../src/auth/authority-root-clone");
const {
  stageDurableMutationReceipt,
} = require("../src/auth/durable-mutation-state");
const {
  MARKET_MAX_LISTINGS,
  MARKET_MAX_LISTINGS_PER_SELLER,
} = require("../src/auth/market-listing-state");
const {
  MARKET_CREATE_CAPACITY_CHECK_SQL,
  MARKET_CREATE_CAPACITY_GUARD_KEY,
  MARKET_CREATE_CAPACITY_LOCK_SQL,
  mysqlResourceAcquisitionTrace,
} = require("../src/mysql-resource-acquisition-order");
const {
  __assertLegacyMarketCreateCapacityPlanForTest,
  __buildMysqlSavePlanFromPersistentDataForTest,
  __mergeMysqlSaveBaselineAfterCommitForTest,
  __runMysqlPoolSavePlanForTest,
} = require("../src/mysql-store");

const MYSQL_SESSION_POLICY_SQL =
  "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?";
const ACCOUNT_ID = "acc_market_create_conditional";
const PLAYER_ID = "player_market_create_conditional";
const LISTING_ID = "listing_market_create_conditional";
const OPERATION_ID = "op_market_create_conditional_0001";
const REQUEST_HASH = "a".repeat(64);
const ACTION_ID = "create_market_listing";
const UPDATED_AT_1 = "2026-07-15T01:00:00.000Z";
const UPDATED_AT_2 = "2026-07-15T01:01:00.000Z";

function ordinaryListing(listingId, sellerAccountId, overrides = {}) {
  return {
    listingId,
    sellerAccountId,
    itemId: "item_pet_food_small",
    count: 2,
    unitPrice: 35,
    currency: "stoneCoins",
    createdAt: UPDATED_AT_2,
    schemaVersion: 1,
    ...overrides,
  };
}

function baselineState(options = {}) {
  const marketListings = {};
  for (const listing of options.listings || []) {
    marketListings[listing.listingId] = listing;
  }
  return {
    schemaVersion: 1,
    accounts: {},
    sessions: {},
    profileBindings: {
      [ACCOUNT_ID]: {
        accountId: ACCOUNT_ID,
        playerId: PLAYER_ID,
        profileRevision: 1,
        updatedAt: UPDATED_AT_1,
      },
    },
    profiles: {
      [PLAYER_ID]: {
        playerId: PLAYER_ID,
        accountId: ACCOUNT_ID,
        profileRevision: 1,
        updatedAt: UPDATED_AT_1,
        profile: {
          displayName: "条件挂单猎人",
          stoneCoins: 100,
          inventory: {item_pet_food_small: 10},
        },
      },
    },
    mutationReceipts: {},
    mailMessages: {},
    marketListings,
    consumedEquipmentEnvelopes: {},
    serviceEventSeq: 0,
    serviceEvents: [],
  };
}

function mutationReceipt(overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: OPERATION_ID,
    requestHash: REQUEST_HASH,
    actionId: ACTION_ID,
    accountId: ACCOUNT_ID,
    committedAt: UPDATED_AT_2,
    expiresAt: "2026-07-18T01:01:00.000Z",
    response: {ok: true, listingId: LISTING_ID},
    ...overrides,
  };
}

function candidateState(before, options = {}) {
  const after = cloneAuthorityRoot(before);
  after.profileBindings[ACCOUNT_ID] = {
    ...after.profileBindings[ACCOUNT_ID],
    profileRevision: 2,
    updatedAt: UPDATED_AT_2,
  };
  const previousProfile = after.profiles[PLAYER_ID];
  after.profiles[PLAYER_ID] = {
    ...previousProfile,
    profileRevision: 2,
    updatedAt: UPDATED_AT_2,
    profile: {
      ...previousProfile.profile,
      inventory: {
        ...previousProfile.profile.inventory,
        item_pet_food_small: 8,
      },
    },
  };
  after.marketListings[LISTING_ID] = ordinaryListing(LISTING_ID, ACCOUNT_ID);
  if (options.receipt !== false) {
    after.mutationReceipts = stageDurableMutationReceipt(
      after.mutationReceipts,
      mutationReceipt(options.receiptOverrides),
      {nowMs: Date.parse(UPDATED_AT_2)},
    );
  }
  return after;
}

function createScope(before, overrides = {}) {
  const listings = Object.values(before.marketListings || {});
  return {
    kind: "row_local_market_create_v1",
    accountId: ACCOUNT_ID,
    playerId: PLAYER_ID,
    listingId: LISTING_ID,
    operationId: OPERATION_ID,
    requestHash: REQUEST_HASH,
    actionId: ACTION_ID,
    observedTotalListingCount: listings.length,
    observedSellerListingCount: listings.filter(
      (listing) => listing.sellerAccountId === ACCOUNT_ID,
    ).length,
    maxTotalListings: MARKET_MAX_LISTINGS,
    maxSellerListings: MARKET_MAX_LISTINGS_PER_SELLER,
    ...overrides,
  };
}

function buildPlan(after, before, scope = createScope(before)) {
  return __buildMysqlSavePlanFromPersistentDataForTest(after, before, {
    consistencyScope: scope,
  });
}

function resourceNames(operations) {
  return operations.map((operation) => operation.resource || operation.resourceType);
}

test("planner certifies one exact ordinary listing with actor profile, capacity guard, and receipt", () => {
  const unrelated = ordinaryListing("listing_unrelated", "acc_unrelated");
  const before = baselineState({listings: [unrelated]});
  const plan = buildPlan(candidateState(before), before);

  assert.equal(plan.kind, "market_create_conditional_v1");
  assert.equal(plan.globalRevisionFence, false);
  assert.equal(plan.globalCompatibilityBarrier, "shared");
  assert.equal(plan.accountId, ACCOUNT_ID);
  assert.equal(plan.playerId, PLAYER_ID);
  assert.equal(plan.listingId, LISTING_ID);
  assert.equal(plan.expectedProfileRevision, 1);
  assert.equal(plan.nextProfileRevision, 2);
  assert.equal(plan.observedTotalListingCount, 1);
  assert.equal(plan.observedSellerListingCount, 0);
  assert.equal(plan.maxTotalListings, MARKET_MAX_LISTINGS);
  assert.equal(plan.maxSellerListings, MARKET_MAX_LISTINGS_PER_SELLER);
  assert.deepEqual(resourceNames(plan.locks), [
    "profile_binding",
    "profile",
    "market_capacity",
  ]);
  assert.deepEqual(resourceNames(plan.writes), [
    "profile_binding",
    "profile",
    "market_listing",
    "mutation_receipt",
  ]);
  assert.equal(plan.capacityCheck.sql, MARKET_CREATE_CAPACITY_CHECK_SQL);
  assert.deepEqual(plan.capacityCheck.params, [ACCOUNT_ID]);
  assert.equal(plan.capacityCheck.maxTotalListings, MARKET_MAX_LISTINGS);
  assert.equal(plan.capacityCheck.maxSellerListings, MARKET_MAX_LISTINGS_PER_SELLER);
  const listingWrite = plan.writes.find((write) => write.resource === "market_listing");
  assert.equal(listingWrite.kind, "insert");
  assert.match(listingWrite.sql, /^INSERT INTO market_listings\b/i);
  assert.doesNotMatch(listingWrite.sql, /INSERT\s+INTO[\s\S]+SELECT|ON\s+DUPLICATE\s+KEY/i);
  assert.deepEqual(
    mysqlResourceAcquisitionTrace(plan).map(({resource, stage}) => [resource, stage]),
    [
      ["profile_binding", "lock"],
      ["profile", "lock"],
      ["market_capacity", "lock"],
      ["market_listing", "insert"],
      ["mutation_receipt", "insert"],
    ],
  );
});

test("planner falls back unless scope, baseline, listing schema, and receipt are exact", async (t) => {
  const cases = [
    {name: "scope missing", scope: () => null},
    {name: "scope has an extra field", scope: (before) => createScope(before, {extra: true})},
    {name: "scope total count differs", scope: (before) => createScope(before, {observedTotalListingCount: 1})},
    {name: "scope seller count differs", scope: (before) => createScope(before, {observedSellerListingCount: 1})},
    {name: "scope count is numeric text", scope: (before) => createScope(before, {observedTotalListingCount: "0"})},
    {name: "scope total limit differs", scope: (before) => createScope(before, {maxTotalListings: MARKET_MAX_LISTINGS - 1})},
    {name: "scope seller limit differs", scope: (before) => createScope(before, {maxSellerListings: MARKET_MAX_LISTINGS_PER_SELLER - 1})},
    {
      name: "listing is equipment schema v2",
      mutate(after) {
        after.marketListings[LISTING_ID].schemaVersion = 2;
        after.marketListings[LISTING_ID].equipmentEnvelope = {};
      },
    },
    {
      name: "listing has an extra field",
      mutate(after) {
        after.marketListings[LISTING_ID].quality = "hidden";
      },
    },
    {
      name: "listing count is numeric text",
      mutate(after) {
        after.marketListings[LISTING_ID].count = "2";
      },
    },
    {
      name: "listing schema is numeric text",
      mutate(after) {
        after.marketListings[LISTING_ID].schemaVersion = "1";
      },
    },
    {
      name: "listing seller differs",
      mutate(after) {
        after.marketListings[LISTING_ID].sellerAccountId = "acc_other";
      },
    },
    {
      name: "a second listing is added",
      mutate(after) {
        after.marketListings.listing_second = ordinaryListing("listing_second", ACCOUNT_ID);
      },
    },
    {
      name: "an unrelated listing is modified",
      before: () => baselineState({
        listings: [ordinaryListing("listing_unrelated", "acc_unrelated")],
      }),
      mutate(after) {
        after.marketListings.listing_unrelated.unitPrice += 1;
      },
    },
    {
      name: "an unrelated mail is added",
      mutate(after) {
        after.mailMessages.mail_unrelated = {
          mailId: "mail_unrelated",
          senderAccountId: "system",
          recipientAccountId: ACCOUNT_ID,
          title: "unrelated",
          createdAt: UPDATED_AT_2,
          readAt: null,
        };
      },
    },
    {
      name: "receipt is absent",
      after: (before) => candidateState(before, {receipt: false}),
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const before = fixture.before ? fixture.before() : baselineState();
      const after = fixture.after ? fixture.after(before) : candidateState(before);
      fixture.mutate?.(after);
      const scope = fixture.scope ? fixture.scope(before) : createScope(before);
      assert.equal(buildPlan(after, before, scope).kind, "legacy_global_cas");
    });
  }
});

test("every legacy exact single-listing addition keeps global CAS and adds canonical capacity protection", () => {
  const before = baselineState();
  const equipmentAfter = candidateState(before);
  equipmentAfter.marketListings[LISTING_ID] = {
    ...equipmentAfter.marketListings[LISTING_ID],
    itemId: "weapon_wooden_club",
    count: 1,
    schemaVersion: 2,
    equipmentEnvelope: {},
  };
  const equipmentPlan = buildPlan(equipmentAfter, before);

  assert.equal(equipmentPlan.kind, "legacy_global_cas");
  assert.equal(equipmentPlan.globalRevisionFence, true);
  assert.equal(equipmentPlan.resourceLocks.at(-1).resource, "market_capacity");
  assert.equal(equipmentPlan.resourceLocks.at(-1).sql, MARKET_CREATE_CAPACITY_LOCK_SQL);
  assert.deepEqual(equipmentPlan.resourceLocks.at(-1).params, [MARKET_CREATE_CAPACITY_GUARD_KEY]);
  assert.equal(equipmentPlan.capacityCheck.sql, MARKET_CREATE_CAPACITY_CHECK_SQL);
  assert.deepEqual(equipmentPlan.capacityCheck.params, [ACCOUNT_ID]);
  assert.equal(equipmentPlan.marketCreateCapacitySellerAccountId, ACCOUNT_ID);

  const noScopePlan = buildPlan(candidateState(before), before, null);
  assert.equal(noScopePlan.kind, "legacy_global_cas");
  assert.equal(noScopePlan.resourceLocks.at(-1).resource, "market_capacity");
  assert.deepEqual(noScopePlan.capacityCheck.params, [ACCOUNT_ID]);

  const broaderAfter = candidateState(before);
  broaderAfter.mailMessages.mail_extra = {
    mailId: "mail_extra",
    senderAccountId: "system",
    recipientAccountId: ACCOUNT_ID,
    title: "extra",
    createdAt: UPDATED_AT_2,
    readAt: null,
  };
  const broaderPlan = buildPlan(broaderAfter, before);
  assert.equal(broaderPlan.kind, "legacy_global_cas");
  assert.equal(broaderPlan.resourceLocks.at(-1).resource, "market_capacity");
  assert.deepEqual(broaderPlan.capacityCheck.params, [ACCOUNT_ID]);
});

test("tutorial-style no-final-listing and multi-listing legacy writes do not take the single-create guard", () => {
  const before = baselineState();
  const noFinalListing = candidateState(before);
  delete noFinalListing.marketListings[LISTING_ID];
  const tutorialPlan = buildPlan(noFinalListing, before);
  assert.equal(tutorialPlan.kind, "legacy_global_cas");
  assert.equal(tutorialPlan.capacityCheck, undefined);
  assert.equal(tutorialPlan.resourceLocks.some((lock) => lock.resource === "market_capacity"), false);

  const multipleListings = candidateState(before);
  multipleListings.marketListings.listing_second = ordinaryListing("listing_second", ACCOUNT_ID);
  const multiPlan = buildPlan(multipleListings, before);
  assert.equal(multiPlan.kind, "legacy_global_cas");
  assert.equal(multiPlan.capacityCheck, undefined);
  assert.equal(multiPlan.resourceLocks.some((lock) => lock.resource === "market_capacity"), false);
});

test("legacy single-add rejects a missing or non-canonical seller and ignores future ODKU updates", () => {
  const before = baselineState();
  const invalidSeller = candidateState(before);
  invalidSeller.marketListings[LISTING_ID].sellerAccountId = " ";
  assert.throws(
    () => buildPlan(invalidSeller, before),
    (error) => error && error.code === "mysql_resource_precondition_invalid",
  );

  assert.equal(__assertLegacyMarketCreateCapacityPlanForTest({
    kind: "legacy_global_cas",
    resourceLocks: [],
    statements: [
      "START TRANSACTION",
      "INSERT INTO market_listings (listing_id) VALUES ('listing-update') ON DUPLICATE KEY UPDATE listing_id = VALUES(listing_id)",
      "COMMIT",
    ],
  }), null);
});

function createConditionalPool(options = {}) {
  const transaction = {
    begun: false,
    committed: false,
    rolledBack: false,
    released: false,
    destroyed: false,
    queries: [],
  };
  const pool = {
    async getConnection() {
      return {
        async beginTransaction() {
          transaction.begun = true;
        },
        async query(statement, params = []) {
          const sql = typeof statement === "string"
            ? statement
            : String(statement && statement.sql || "");
          if (sql.trim() === MYSQL_SESSION_POLICY_SQL) {
            assert.deepEqual(params, [3, 5]);
            return [{affectedRows: 0}, []];
          }
          transaction.queries.push({sql, params: Array.isArray(params) ? params.slice() : params});
          if (/SELECT\s+revision\s+AS\s+storeRevision[\s\S]+scope_key = 'auth'[\s\S]+FOR\s+(?:SHARE|UPDATE)/i.test(sql)) {
            return [[{storeRevision: 0}], []];
          }
          if (/FROM\s+profile_bindings\s+ORDER\s+BY\s+account_id\s+FOR\s+UPDATE/i.test(sql)) {
            assert.deepEqual(params, []);
            return [[{
              account_id: ACCOUNT_ID,
              player_id: PLAYER_ID,
              profile_revision: 1,
            }], []];
          }
          if (/FROM\s+profiles\s+ORDER\s+BY\s+player_id\s+FOR\s+UPDATE/i.test(sql)) {
            assert.deepEqual(params, []);
            return [[{
              player_id: PLAYER_ID,
              account_id: ACCOUNT_ID,
              profile_revision: 1,
            }], []];
          }
          if (/FROM\s+profile_bindings[\s\S]+FOR\s+UPDATE/i.test(sql)) {
            assert.deepEqual(params, [ACCOUNT_ID]);
            return [[{
              account_id: ACCOUNT_ID,
              player_id: PLAYER_ID,
              profile_revision: 1,
            }], []];
          }
          if (/FROM\s+profiles[\s\S]+FOR\s+UPDATE/i.test(sql)) {
            assert.deepEqual(params, [PLAYER_ID]);
            return [[{
              player_id: PLAYER_ID,
              account_id: ACCOUNT_ID,
              profile_revision: 1,
            }], []];
          }
          if (/FROM\s+auth_store_revisions[\s\S]+scope_key = \?[\s\S]+FOR\s+UPDATE/i.test(sql)) {
            assert.deepEqual(params, [MARKET_CREATE_CAPACITY_GUARD_KEY]);
            return [[{
              scope_key: MARKET_CREATE_CAPACITY_GUARD_KEY,
              revision: 0,
            }], []];
          }
          if (/SELECT\s+COUNT\(\*\)\s+AS\s+total_count[\s\S]+FROM\s+market_listings/i.test(sql)) {
            assert.equal(sql, MARKET_CREATE_CAPACITY_CHECK_SQL);
            assert.deepEqual(params, [ACCOUNT_ID]);
            return [[{
              total_count: String(options.totalCount ?? 119),
              seller_count: String(options.sellerCount ?? 19),
            }], []];
          }
          if (/^UPDATE\s+profile_bindings\b/i.test(sql.trim())) {
            return [{affectedRows: 1}, []];
          }
          if (/^UPDATE\s+profiles\b/i.test(sql.trim())) {
            return [{affectedRows: 1}, []];
          }
          if (/^INSERT\s+INTO\s+market_listings\b/i.test(sql.trim())) {
            if (options.listingDuplicate === true) {
              const error = new Error("Duplicate listing_id");
              error.code = "ER_DUP_ENTRY";
              throw error;
            }
            return [{affectedRows: 1}, []];
          }
          if (/^INSERT\s+INTO\s+mutation_receipts\b/i.test(sql.trim())) {
            if (options.receiptDuplicate === true) {
              const error = new Error("Duplicate operation_id");
              error.code = "ER_DUP_ENTRY";
              throw error;
            }
            return [{affectedRows: 1}, []];
          }
          const error = new Error(`unmodeled SQL: ${sql}`);
          error.code = "conditional_pool_unknown_sql";
          throw error;
        },
        async commit() {
          transaction.committed = true;
        },
        async rollback() {
          transaction.rolledBack = true;
        },
        release() {
          transaction.released = true;
        },
        destroy() {
          transaction.destroyed = true;
        },
      };
    },
  };
  return {pool, transaction};
}

function businessWrites(transaction) {
  return transaction.queries.filter(({sql}) => /^(?:INSERT|UPDATE|DELETE)\b/i.test(sql.trim()));
}

function executablePlan() {
  const before = baselineState();
  return buildPlan(candidateState(before), before);
}

function executableLegacySingleCreatePlan() {
  const before = baselineState();
  const after = candidateState(before);
  after.marketListings[LISTING_ID] = {
    ...after.marketListings[LISTING_ID],
    schemaVersion: 2,
    equipmentEnvelope: {},
  };
  return buildPlan(after, before);
}

test("executor accepts authoritative 119 total and 19 seller counts, then commits all four writes", async () => {
  const fixture = createConditionalPool({totalCount: 119, sellerCount: 19});
  const result = await __runMysqlPoolSavePlanForTest(fixture.pool, executablePlan(), {
    expectedRevision: 0,
  });

  assert.deepEqual(result, {revision: 0, globalRevisionAdvanced: false});
  assert.equal(fixture.transaction.begun, true);
  assert.equal(fixture.transaction.committed, true);
  assert.equal(fixture.transaction.rolledBack, false);
  assert.equal(fixture.transaction.released, true);
  assert.deepEqual(resourceNames(executablePlan().writes), [
    "profile_binding",
    "profile",
    "market_listing",
    "mutation_receipt",
  ]);
  assert.equal(businessWrites(fixture.transaction).length, 4);
});

test("legacy single-add checks live capacity after global and profile locks but before any business SQL", async () => {
  const fixture = createConditionalPool({totalCount: 120, sellerCount: 19});
  await assert.rejects(
    __runMysqlPoolSavePlanForTest(fixture.pool, executableLegacySingleCreatePlan(), {
      expectedRevision: 0,
      revisionCasEnabled: true,
    }),
    (error) => {
      assert.equal(error.code, "market_full");
      assert.equal(error.outcomeUnknown, false);
      assert.equal(error.noCommitGuaranteed, true);
      assert.equal(error.rollbackConfirmed, true);
      return true;
    },
  );
  const sql = fixture.transaction.queries.map((entry) => entry.sql);
  const globalLock = sql.findIndex((value) => /auth_store_revisions[\s\S]+FOR\s+UPDATE/i.test(value));
  const bindingSnapshot = sql.findIndex((value) => /profile_bindings\s+ORDER\s+BY/i.test(value));
  const profileSnapshot = sql.findIndex((value) => /profiles\s+ORDER\s+BY/i.test(value));
  const capacityGuard = sql.findIndex((value) => /scope_key = \?[\s\S]+FOR\s+UPDATE/i.test(value));
  const capacityCheck = sql.findIndex((value) => /COUNT\(\*\)\s+AS\s+total_count/i.test(value));
  assert.ok(globalLock >= 0 && globalLock < bindingSnapshot);
  assert.ok(bindingSnapshot < profileSnapshot);
  assert.ok(profileSnapshot < capacityGuard);
  assert.ok(capacityGuard < capacityCheck);
  assert.equal(businessWrites(fixture.transaction).length, 0);
  assert.equal(fixture.transaction.committed, false);
  assert.equal(fixture.transaction.rolledBack, true);
});

test("legacy exact single-add capacity contract is validated before acquiring a connection", async () => {
  const plan = executableLegacySingleCreatePlan();
  delete plan.capacityCheck;
  let acquired = 0;
  await assert.rejects(
    __runMysqlPoolSavePlanForTest({
      async getConnection() {
        acquired += 1;
        throw new Error("unexpected connection");
      },
    }, plan, {expectedRevision: 0, revisionCasEnabled: true}),
    (error) => error && error.code === "mysql_resource_precondition_invalid",
  );
  assert.equal(acquired, 0);
});

for (const boundary of [
  {name: "seller limit wins when both limits are full", totalCount: 120, sellerCount: 20, code: "market_listing_limit"},
  {name: "seller limit", totalCount: 119, sellerCount: 20, code: "market_listing_limit"},
  {name: "global market limit", totalCount: 120, sellerCount: 19, code: "market_full"},
]) {
  test(`executor rejects ${boundary.name} before any business write with a known rollback`, async () => {
    const fixture = createConditionalPool(boundary);
    await assert.rejects(
      __runMysqlPoolSavePlanForTest(fixture.pool, executablePlan(), {expectedRevision: 0}),
      (error) => {
        assert.equal(error.code, boundary.code);
        assert.equal(error.outcomeUnknown, false);
        assert.equal(error.noCommitGuaranteed, true);
        assert.equal(error.rollbackConfirmed, true);
        return true;
      },
    );
    assert.equal(businessWrites(fixture.transaction).length, 0);
    assert.equal(fixture.transaction.committed, false);
    assert.equal(fixture.transaction.rolledBack, true);
    assert.equal(fixture.transaction.released, true);
  });
}

for (const duplicate of [
  {name: "listing", options: {listingDuplicate: true}},
  {name: "receipt", options: {receiptDuplicate: true}},
]) {
  test(`duplicate ${duplicate.name} rolls the complete create transaction back as a resource conflict`, async () => {
    const fixture = createConditionalPool(duplicate.options);
    await assert.rejects(
      __runMysqlPoolSavePlanForTest(fixture.pool, executablePlan(), {expectedRevision: 0}),
      (error) => {
        assert.equal(error.code, "mysql_resource_revision_conflict");
        assert.equal(error.outcomeUnknown, false);
        assert.equal(error.noCommitGuaranteed, true);
        assert.equal(error.rollbackConfirmed, true);
        return true;
      },
    );
    assert.equal(fixture.transaction.committed, false);
    assert.equal(fixture.transaction.rolledBack, true);
    assert.equal(fixture.transaction.released, true);
    assert.equal(
      businessWrites(fixture.transaction).some(({sql}) => /^INSERT\s+INTO\s+market_listings\b/i.test(sql.trim())),
      true,
    );
  });
}

test("post-COMMIT baseline merge adds only the certified listing and preserves unrelated listings", () => {
  const unrelated = ordinaryListing("listing_unrelated", "acc_unrelated", {unitPrice: 80});
  const before = baselineState({listings: [unrelated]});
  const committed = candidateState(before);
  committed.marketListings.listing_unrelated = {
    ...committed.marketListings.listing_unrelated,
    unitPrice: 999999,
  };
  const plan = buildPlan(candidateState(before), before);

  const merged = __mergeMysqlSaveBaselineAfterCommitForTest(before, committed, plan);
  assert.deepEqual(merged.marketListings.listing_unrelated, unrelated);
  assert.deepEqual(merged.marketListings[LISTING_ID], committed.marketListings[LISTING_ID]);
  assert.deepEqual(Object.keys(merged.marketListings).sort(), [LISTING_ID, "listing_unrelated"].sort());
});
