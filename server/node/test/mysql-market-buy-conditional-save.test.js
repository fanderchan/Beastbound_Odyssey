"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {cloneAuthorityRoot} = require("../src/auth/authority-root-clone");
const {
  canonicalDurableMutationReceipts,
  commitDurableMutationReceiptDelta,
  stageDurableMutationReceipt,
} = require("../src/auth/durable-mutation-state");
const {
  createAsyncWriteAuthStore,
  createAuthService,
  createMemoryAuthStore,
} = require("../src/auth-service");
const {
  __buildMysqlSavePlanFromPersistentDataForTest,
} = require("../src/mysql-store");

// Deliberately make account and player ordering disagree with actor roles. This
// catches a buyer-first lock order that would deadlock when two accounts buy
// from each other.
const BUYER_ACCOUNT_ID = "acc_z_market_buyer";
const BUYER_PLAYER_ID = "player_a_market_buyer";
const SELLER_ACCOUNT_ID = "acc_a_market_seller";
const SELLER_PLAYER_ID = "player_z_market_seller";
const LISTING_ID = "listing_market_buy_conditional";
const SALE_MAIL_ID = "mail_market_buy_conditional";
const OPERATION_ID = "op_market_buy_conditional_0001";
const REQUEST_HASH = "a".repeat(64);
const UPDATED_AT_1 = "2026-07-14T05:00:00.000Z";
const UPDATED_AT_2 = "2026-07-14T05:01:00.000Z";

function account(accountId, username, displayName) {
  return {
    accountId,
    username,
    displayName,
    role: "player",
    createdAt: UPDATED_AT_1,
    updatedAt: UPDATED_AT_1,
    schemaVersion: 1,
  };
}

function profileBinding(accountId, playerId, profileRevision) {
  return {
    accountId,
    playerId,
    profileRevision,
    updatedAt: UPDATED_AT_1,
  };
}

function profileDocument(accountId, playerId, profileRevision, profile) {
  return {
    playerId,
    accountId,
    profileRevision,
    updatedAt: UPDATED_AT_1,
    profile,
    schemaVersion: 1,
  };
}

function ordinaryListing(overrides = {}) {
  return {
    listingId: LISTING_ID,
    sellerAccountId: SELLER_ACCOUNT_ID,
    itemId: "item_meat_small",
    count: 2,
    unitPrice: 20,
    currency: "stoneCoins",
    createdAt: UPDATED_AT_1,
    schemaVersion: 1,
    ...overrides,
  };
}

function normalizedMarketConfig(overrides = {}) {
  return {
    defaultTaxBps: 100,
    itemTaxBps: {},
    taxCollected: {
      stoneCoins: 4,
      diamonds: 2,
    },
    schemaVersion: 1,
    ...overrides,
  };
}

function baselineAuthority() {
  return {
    schemaVersion: 1,
    accounts: {
      [BUYER_ACCOUNT_ID]: account(BUYER_ACCOUNT_ID, "conditional_buyer", "条件买家"),
      [SELLER_ACCOUNT_ID]: account(SELLER_ACCOUNT_ID, "conditional_seller", "条件卖家"),
    },
    sessions: {},
    profileBindings: {
      [BUYER_ACCOUNT_ID]: profileBinding(BUYER_ACCOUNT_ID, BUYER_PLAYER_ID, 3),
      [SELLER_ACCOUNT_ID]: profileBinding(SELLER_ACCOUNT_ID, SELLER_PLAYER_ID, 7),
    },
    profiles: {
      [BUYER_PLAYER_ID]: profileDocument(BUYER_ACCOUNT_ID, BUYER_PLAYER_ID, 3, {
        displayName: "条件买家",
        stoneCoins: 100,
        diamonds: 10,
        backpackSlots: [],
        captureTools: {},
      }),
      [SELLER_PLAYER_ID]: profileDocument(SELLER_ACCOUNT_ID, SELLER_PLAYER_ID, 7, {
        displayName: "条件卖家",
        stoneCoins: 20,
        diamonds: 0,
        backpackSlots: [],
      }),
    },
    mutationReceipts: {},
    mailMessages: {},
    marketListings: {
      [LISTING_ID]: ordinaryListing(),
    },
    consumedEquipmentEnvelopes: {},
    marketConfig: normalizedMarketConfig(),
    offlineHangConfig: {},
    serviceEventSeq: 0,
    serviceEvents: [],
  };
}

function saleMail({
  mailId = SALE_MAIL_ID,
  taxAmount = 1,
  recipientAccountId = SELLER_ACCOUNT_ID,
  currency = "stoneCoins",
} = {}) {
  const totalPrice = 40;
  const sellerReceives = totalPrice - taxAmount;
  const currencyLabel = currency === "diamonds" ? "钻石" : "石币";
  return {
    mailId,
    senderAccountId: "system_market",
    senderUsername: "auction_house",
    senderDisplayName: "拍卖行",
    recipientAccountId,
    recipientUsername: "conditional_seller",
    recipientDisplayName: "条件卖家",
    title: "拍卖行成交通知",
    body: [
      "肉×2 已售出。",
      `单价：20${currencyLabel}`,
      `成交金额：${totalPrice}${currencyLabel}`,
      `交易税：${taxAmount}${currencyLabel}`,
      `实收：${sellerReceives}${currencyLabel}`,
      "收益已放入本邮件附件，请领取。",
    ].join("\n"),
    currency: sellerReceives > 0 ? {[currency]: sellerReceives} : {},
    items: [],
    createdAt: UPDATED_AT_2,
    readAt: null,
    schemaVersion: 1,
  };
}

function buyReceipt(overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: OPERATION_ID,
    requestHash: REQUEST_HASH,
    actionId: "POST /market/buy",
    accountId: BUYER_ACCOUNT_ID,
    committedAt: UPDATED_AT_2,
    expiresAt: "2026-07-17T05:01:00.000Z",
    response: {
      ok: true,
      operationId: OPERATION_ID,
      listingId: LISTING_ID,
      saleMailId: SALE_MAIL_ID,
    },
    ...overrides,
  };
}

function buyCandidate(before, options = {}) {
  const taxAmount = Number(options.taxAmount ?? 1);
  const currency = String(options.currency || "stoneCoins");
  const mailId = String(options.saleMailId || SALE_MAIL_ID);
  const after = cloneAuthorityRoot(before);
  after.profileBindings[BUYER_ACCOUNT_ID] = {
    ...before.profileBindings[BUYER_ACCOUNT_ID],
    profileRevision: 4,
    updatedAt: UPDATED_AT_2,
  };
  after.profiles[BUYER_PLAYER_ID] = {
    ...before.profiles[BUYER_PLAYER_ID],
    profileRevision: 4,
    updatedAt: UPDATED_AT_2,
    profile: {
      ...before.profiles[BUYER_PLAYER_ID].profile,
      stoneCoins: currency === "stoneCoins" ? 60 : before.profiles[BUYER_PLAYER_ID].profile.stoneCoins,
      diamonds: currency === "diamonds" ? 0 : before.profiles[BUYER_PLAYER_ID].profile.diamonds,
      backpackSlots: [{itemId: "item_meat_small", count: 2}],
    },
  };
  delete after.marketListings[LISTING_ID];
  after.mailMessages[mailId] = saleMail({mailId, taxAmount, currency});
  if (taxAmount > 0) {
    after.marketConfig = {
      ...before.marketConfig,
      taxCollected: {
        ...before.marketConfig.taxCollected,
        [currency]: Number(before.marketConfig.taxCollected[currency] || 0) + taxAmount,
      },
    };
  }
  after.mutationReceipts = stageDurableMutationReceipt(
    after.mutationReceipts,
    buyReceipt(options.receipt || {}),
    {nowMs: Date.parse(UPDATED_AT_2)},
  );
  return after;
}

function buyScope(overrides = {}) {
  return {
    kind: "row_local_market_buy_v1",
    accountId: BUYER_ACCOUNT_ID,
    playerId: BUYER_PLAYER_ID,
    sellerAccountId: SELLER_ACCOUNT_ID,
    sellerPlayerId: SELLER_PLAYER_ID,
    listingId: LISTING_ID,
    saleMailId: SALE_MAIL_ID,
    currency: "stoneCoins",
    taxAmount: 1,
    operationId: OPERATION_ID,
    requestHash: REQUEST_HASH,
    actionId: "POST /market/buy",
    ...overrides,
  };
}

function buildPlan(after, before, scope = buyScope()) {
  return __buildMysqlSavePlanFromPersistentDataForTest(after, before, {
    consistencyScope: scope,
  });
}

function operationResources(plan, field) {
  return (Array.isArray(plan && plan[field]) ? plan[field] : [])
    .map((operation) => String(operation && operation.resource || ""));
}

function operationKeys(plan, field) {
  return (Array.isArray(plan && plan[field]) ? plan[field] : [])
    .map((operation) => String(operation && operation.key || ""));
}

function seedBackpack(service, token, slots) {
  const current = service.getProfile(token);
  assert.equal(current.ok, true);
  current.profile.backpackSlots = slots;
  assert.equal(service.saveProfile(token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile: current.profile,
  }).ok, true);
}

function seedOrdinaryMarketBuyScenario(suffix) {
  const base = createMemoryAuthStore();
  const service = createAuthService({store: base, allowFullProfileSave: true});
  const seller = service.register({
    username: `mktbuyseller${suffix}`,
    password: "test1234",
    displayName: "条件成交卖家",
  });
  const buyer = service.register({
    username: `mktbuybuyer${suffix}`,
    password: "test1234",
    displayName: "条件成交买家",
  });
  assert.equal(seller.ok, true);
  assert.equal(buyer.ok, true);
  seedBackpack(service, seller.session.token, [{itemId: "item_meat_small", count: 2}]);
  const created = service.createMarketListing(seller.session.token, {
    itemId: "item_meat_small",
    count: 2,
    unitPrice: 20,
    currency: "stoneCoins",
  });
  assert.equal(created.ok, true);
  // The first legacy purchase or a GM tax configuration write migrates older
  // empty config documents to this canonical shape. The conditional path must
  // fail closed before that migration, so seed the already-canonical state
  // explicitly for tests that exercise the row-local purchase path itself.
  const seeded = base.load();
  seeded.marketConfig = normalizedMarketConfig({
    taxCollected: {stoneCoins: 0, diamonds: 0},
  });
  base.save(seeded);
  return {base, seller, buyer, created};
}

test("planner selects one cross-account conditional transaction for a certified ordinary purchase", () => {
  const before = baselineAuthority();
  const plan = buildPlan(buyCandidate(before), before);

  assert.equal(plan.kind, "market_buy_conditional_v1");
  assert.equal(plan.globalRevisionFence, false);
  assert.equal(plan.globalCompatibilityBarrier, "shared");
  assert.equal(plan.accountId, BUYER_ACCOUNT_ID);
  assert.equal(plan.playerId, BUYER_PLAYER_ID);
  assert.equal(plan.sellerAccountId, SELLER_ACCOUNT_ID);
  assert.equal(plan.sellerPlayerId, SELLER_PLAYER_ID);
  assert.equal(plan.listingId, LISTING_ID);
  assert.equal(plan.saleMailId, SALE_MAIL_ID);
  assert.equal(plan.currency, "stoneCoins");
  assert.equal(plan.taxAmount, 1);

  assert.deepEqual(
    operationResources(plan, "locks"),
    ["profile_binding", "profile_binding", "profile", "profile", "market_listing"],
  );
  assert.deepEqual(
    operationKeys(plan, "locks"),
    [SELLER_ACCOUNT_ID, BUYER_ACCOUNT_ID, BUYER_PLAYER_ID, SELLER_PLAYER_ID, LISTING_ID],
  );
  assert.match(plan.locks[0].sql, /FOR SHARE\b/i);
  assert.match(plan.locks[1].sql, /FOR UPDATE\b/i);
  assert.match(plan.locks[2].sql, /FOR UPDATE\b/i);
  assert.match(plan.locks[3].sql, /FOR SHARE\b/i);
  assert.match(plan.locks[4].sql, /FROM market_listings[\s\S]+FOR UPDATE\b/i);

  assert.deepEqual(
    operationResources(plan, "writes"),
    ["profile_binding", "profile", "market_listing", "mail_message", "market_tax", "mutation_receipt"],
  );
  assert.equal(plan.writes.every((write) => write.expectedAffectedRows === 1), true);
  assert.match(plan.writes[2].sql, /^DELETE FROM market_listings\b/i);
  assert.match(plan.writes[3].sql, /^INSERT INTO mail_messages\b/i);
  assert.match(plan.writes[4].sql, /^UPDATE server_state\b/i);
  assert.match(plan.writes[4].sql, /JSON_SET\s*\(/i);
  assert.match(plan.writes[4].sql, /JSON_EXTRACT\s*\(/i);
  assert.match(plan.writes[4].sql, /\$\.marketConfig\.taxCollected\.stoneCoins/);
  assert.equal(plan.writes[4].key, "stoneCoins");
  assert.equal(plan.writes[4].params.includes(1), true);
  assert.equal(plan.writes.some((write) => /^INSERT INTO server_state\b/i.test(write.sql)), false);
  assert.equal(plan.writes.some((write) => /ON DUPLICATE KEY/i.test(write.sql)), false);
});

test("planner fails closed when an ordinary purchase carries a broader or uncertified write set", async (t) => {
  const cases = [
    {
      name: "equipment listing",
      mutate(before, after) {
        before.marketListings[LISTING_ID] = ordinaryListing({
          itemId: "weapon_wooden_club",
          count: 1,
          schemaVersion: 2,
          equipmentEnvelope: {envelopeId: "eqx_market_buy_equipment_1"},
        });
        after.marketListings = {};
      },
    },
    {
      name: "ordinary listing has an unknown field",
      mutate(before) {
        before.marketListings[LISTING_ID] = ordinaryListing({futureEscrowRule: true});
      },
    },
    {
      name: "missing receipt",
      mutate(_before, after) {
        after.mutationReceipts = {};
      },
    },
    {
      name: "another mail is inserted",
      mutate(_before, after) {
        after.mailMessages.mail_unrelated = {
          ...saleMail({mailId: "mail_unrelated"}),
          mailId: "mail_unrelated",
        };
      },
    },
    {
      name: "tax rules change with the tax counter",
      mutate(_before, after) {
        after.marketConfig.defaultTaxBps = 250;
      },
    },
    {
      name: "another currency counter changes",
      mutate(_before, after) {
        after.marketConfig.taxCollected.diamonds += 1;
      },
    },
    {
      name: "offline hang config changes with the tax counter",
      mutate(_before, after) {
        after.offlineHangConfig = {rewardRateBps: 5000};
      },
    },
    {
      name: "service event sequence changes with the tax counter",
      mutate(_before, after) {
        after.serviceEventSeq = 1;
      },
    },
    {
      name: "seller profile also changes",
      mutate(before, after) {
        after.profileBindings[SELLER_ACCOUNT_ID] = {
          ...before.profileBindings[SELLER_ACCOUNT_ID],
          profileRevision: 8,
          updatedAt: UPDATED_AT_2,
        };
        after.profiles[SELLER_PLAYER_ID] = {
          ...before.profiles[SELLER_PLAYER_ID],
          profileRevision: 8,
          updatedAt: UPDATED_AT_2,
          profile: {
            ...before.profiles[SELLER_PLAYER_ID].profile,
            stoneCoins: 59,
          },
        };
      },
    },
    {
      name: "sale mail recipient differs",
      mutate(_before, after) {
        after.mailMessages[SALE_MAIL_ID] = saleMail({recipientAccountId: BUYER_ACCOUNT_ID});
      },
    },
    {
      name: "sale mail proceeds differ",
      mutate(_before, after) {
        after.mailMessages[SALE_MAIL_ID] = {
          ...after.mailMessages[SALE_MAIL_ID],
          currency: {stoneCoins: 40},
        };
      },
    },
    {
      name: "scope seller differs",
      scope: buyScope({sellerAccountId: "acc_wrong_seller"}),
    },
    {
      name: "scope sale mail differs",
      scope: buyScope({saleMailId: "mail_wrong_sale"}),
    },
    {
      name: "scope tax differs",
      scope: buyScope({taxAmount: 2}),
    },
    {
      name: "scope kind differs",
      scope: buyScope({kind: "row_local_market_cancel_v1"}),
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const before = baselineAuthority();
      const after = buyCandidate(before);
      if (fixture.mutate) {
        fixture.mutate(before, after);
      }
      const plan = buildPlan(after, before, fixture.scope || buyScope());
      assert.equal(plan.kind, "legacy_global_cas");
      assert.equal(plan.globalRevisionFence, true);
    });
  }
});

test("legacy writes that replace server state lock and compare the full document first", () => {
  const before = baselineAuthority();
  const after = cloneAuthorityRoot(before);
  after.offlineHangConfig = {rewardRateBps: 5000};
  const plan = buildPlan(after, before, null);

  assert.equal(plan.kind, "legacy_global_cas");
  assert.equal(plan.resourceLocks[0].resource, "server_state");
  assert.equal(plan.resourceLocks[0].key, "auth");
  assert.match(plan.resourceLocks[0].sql, /FROM server_state.+FOR UPDATE$/i);
  assert.deepEqual(
    plan.resourceLocks[0].expectedRow.document_json.marketConfig.taxCollected,
    before.marketConfig.taxCollected,
  );
});

test("first server-state marker creation keeps the global fence without requiring a missing row lock", () => {
  const before = baselineAuthority();
  const after = cloneAuthorityRoot(before);
  after.offlineHangConfig = {rewardRateBps: 5000};
  const plan = __buildMysqlSavePlanFromPersistentDataForTest(after, before, {
    forceServerState: true,
  });

  assert.equal(plan.kind, "legacy_global_cas");
  assert.equal(plan.globalRevisionFence, true);
  assert.equal(plan.resourceLocks.some((lock) => lock.resource === "server_state"), false);
});

test("zero-tax ordinary purchase omits the server-state write but keeps strict asset writes", () => {
  const before = baselineAuthority();
  before.marketConfig = normalizedMarketConfig({defaultTaxBps: 0});
  const after = buyCandidate(before, {taxAmount: 0});
  const plan = buildPlan(after, before, buyScope({taxAmount: 0}));

  assert.equal(plan.kind, "market_buy_conditional_v1");
  assert.equal(plan.taxAmount, 0);
  assert.deepEqual(
    operationResources(plan, "writes"),
    ["profile_binding", "profile", "market_listing", "mail_message", "mutation_receipt"],
  );
  assert.equal(plan.writes.some((write) => write.resource === "market_tax"), false);
  assert.equal(plan.writes.some((write) => /\bserver_state\b/i.test(write.sql)), false);
  assert.equal(plan.writes.some((write) => /ON DUPLICATE KEY/i.test(write.sql)), false);
});

test("real durable ordinary buy signs the exact cross-account consistency scope", async () => {
  const {base, seller, buyer, created} = seedOrdinaryMarketBuyScenario("scope");
  let committed = base.load();
  let saveOptions = null;
  let savedPlan = null;
  const service = createAuthService({
    store: {
      load: () => cloneAuthorityRoot(committed),
      save(nextData, options = {}) {
        saveOptions = cloneAuthorityRoot(options);
        savedPlan = buildPlan(nextData, committed, options.consistencyScope);
        committed = cloneAuthorityRoot(nextData);
        committed.mutationReceipts = commitDurableMutationReceiptDelta(
          canonicalDurableMutationReceipts(committed.mutationReceipts),
        );
      },
    },
  });
  const operation = {
    operationId: "op_real_market_buy_scope_0001",
    requestHash: "b".repeat(64),
    actionId: "POST /market/buy",
  };
  const result = await service.invokeDurable("buyMarketListing", [buyer.session.token, {
    listingId: created.listing.listingId,
  }], operation);

  assert.equal(result.ok, true);
  assert.deepEqual(saveOptions.consistencyScope, {
    kind: "row_local_market_buy_v1",
    accountId: buyer.account.accountId,
    playerId: buyer.profileBinding.playerId,
    sellerAccountId: seller.account.accountId,
    sellerPlayerId: seller.profileBinding.playerId,
    listingId: created.listing.listingId,
    saleMailId: result.saleMail.mailId,
    currency: "stoneCoins",
    taxAmount: 1,
    operationId: operation.operationId,
    requestHash: operation.requestHash,
    actionId: operation.actionId,
  });
  assert.equal(savedPlan.kind, "market_buy_conditional_v1");
});

test("ambiguous ordinary buy recovers with exact receipt, buyer assets, listing and sale mail", async () => {
  const {base, seller, buyer, created} = seedOrdinaryMarketBuyScenario("recover");
  const laterSellerRecordPoint = {
    mapId: "firebud_training_yard",
    spawnName: "market_buy_recovery_seller",
    label: "成交后卖家新记录点",
  };
  const operation = {
    operationId: "op_market_buy_recovery_0001",
    requestHash: "c".repeat(64),
    actionId: "POST /market/buy",
  };
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      base.save(nextData);
      const concurrent = createAuthService({store: base});
      const sellerChange = concurrent.profileAction(seller.session.token, {
        action: "record_point_save",
        payload: {recordPoint: laterSellerRecordPoint},
      });
      assert.equal(sellerChange.ok, true);
      const later = base.load();
      later.marketConfig.taxCollected.stoneCoins += 7;
      base.save(later);
      throw new Error("connection lost after market buy commit");
    },
  }, {onError() {}});
  const service = createAuthService({store});

  const result = await service.invokeDurable("buyMarketListing", [buyer.session.token, {
    listingId: created.listing.listingId,
  }], operation);

  assert.equal(result.ok, true);
  assert.equal(store.metrics().ambiguousCommitRecoveries, 1);
  const snapshot = service.snapshot();
  assert.equal(Object.hasOwn(snapshot.marketListings, created.listing.listingId), false);
  assert.equal(snapshot.marketConfig.taxCollected.stoneCoins, 8);
  assert.equal(
    snapshot.profiles[seller.profileBinding.playerId].profile.recordPoint.label,
    laterSellerRecordPoint.label,
  );
  const saleMail = Object.values(snapshot.mailMessages).find((mail) => (
    mail.recipientAccountId === seller.account.accountId
    && mail.title === "拍卖行成交通知"
  ));
  assert.ok(saleMail);
  assert.equal(saleMail.currency.stoneCoins, 39);
  assert.deepEqual(snapshot, base.load());
});

test("ambiguous ordinary buy rejects a missing sale mail proof", async () => {
  const {base, buyer, created} = seedOrdinaryMarketBuyScenario("mm");
  const beforePublished = base.load();
  const operation = {
    operationId: "op_market_buy_mail_mismatch_0001",
    requestHash: "d".repeat(64),
    actionId: "POST /market/buy",
  };
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      base.save(nextData);
      const changed = base.load();
      for (const [mailId, mail] of Object.entries(changed.mailMessages)) {
        if (mail.title === "拍卖行成交通知") {
          delete changed.mailMessages[mailId];
        }
      }
      base.save(changed);
      throw new Error("connection lost after sale mail mismatch");
    },
  }, {onError() {}});
  const service = createAuthService({store});

  await assert.rejects(
    service.invokeDurable("buyMarketListing", [buyer.session.token, {
      listingId: created.listing.listingId,
    }], operation),
    (error) => error && error.code === "storage_write_failed",
  );
  assert.equal(store.metrics().ambiguousCommitRecoveries, 0);
  assert.deepEqual(service.snapshot(), beforePublished);
});
