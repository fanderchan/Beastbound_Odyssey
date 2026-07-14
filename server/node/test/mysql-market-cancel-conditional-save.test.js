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

const ACCOUNT_ID = "acc_market_cancel_conditional";
const PLAYER_ID = "player_market_cancel_conditional";
const LISTING_ID = "listing_market_cancel_conditional";
const OPERATION_ID = "op_market_cancel_conditional_0001";
const REQUEST_HASH = "a".repeat(64);
const UPDATED_AT_1 = "2026-07-14T03:00:00.000Z";
const UPDATED_AT_2 = "2026-07-14T03:01:00.000Z";

function ordinaryListing(overrides = {}) {
  return {
    listingId: LISTING_ID,
    sellerAccountId: ACCOUNT_ID,
    itemId: "item_meat_small",
    count: 2,
    unitPrice: 20,
    currency: "stoneCoins",
    createdAt: UPDATED_AT_1,
    schemaVersion: 1,
    ...overrides,
  };
}

function baselineAuthority() {
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
          displayName: "撤单猎人",
          backpackSlots: [],
        },
      },
    },
    mutationReceipts: {},
    mailMessages: {},
    marketListings: {
      [LISTING_ID]: ordinaryListing(),
    },
    consumedEquipmentEnvelopes: {},
    marketConfig: {},
    offlineHangConfig: {},
    serviceEventSeq: 0,
    serviceEvents: [],
  };
}

function cancelReceipt(overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: OPERATION_ID,
    requestHash: REQUEST_HASH,
    actionId: "POST /market/cancel",
    accountId: ACCOUNT_ID,
    committedAt: UPDATED_AT_2,
    expiresAt: "2026-07-17T03:01:00.000Z",
    response: {ok: true, operationId: OPERATION_ID},
    ...overrides,
  };
}

function cancelCandidate(before, overrides = {}) {
  const after = cloneAuthorityRoot(before);
  after.profileBindings[ACCOUNT_ID] = {
    ...before.profileBindings[ACCOUNT_ID],
    profileRevision: 2,
    updatedAt: UPDATED_AT_2,
  };
  after.profiles[PLAYER_ID] = {
    ...before.profiles[PLAYER_ID],
    profileRevision: 2,
    updatedAt: UPDATED_AT_2,
    profile: {
      ...before.profiles[PLAYER_ID].profile,
      backpackSlots: [{itemId: "item_meat_small", count: 2}],
    },
  };
  delete after.marketListings[LISTING_ID];
  after.mutationReceipts = stageDurableMutationReceipt(
    after.mutationReceipts,
    cancelReceipt(overrides.receipt || {}),
    {nowMs: Date.parse(UPDATED_AT_2)},
  );
  return after;
}

function cancelScope(overrides = {}) {
  return {
    kind: "row_local_market_cancel_v1",
    accountId: ACCOUNT_ID,
    playerId: PLAYER_ID,
    listingId: LISTING_ID,
    operationId: OPERATION_ID,
    requestHash: REQUEST_HASH,
    actionId: "POST /market/cancel",
    ...overrides,
  };
}

function buildPlan(after, before, scope = cancelScope()) {
  return __buildMysqlSavePlanFromPersistentDataForTest(after, before, {
    consistencyScope: scope,
  });
}

function operationResources(plan, field) {
  return (Array.isArray(plan && plan[field]) ? plan[field] : [])
    .map((operation) => String(operation && operation.resource || ""));
}

function seedOrdinaryMarketCancelScenario(username) {
  const base = createMemoryAuthStore();
  const service = createAuthService({store: base, allowFullProfileSave: true});
  const registered = service.register({
    username,
    password: "test1234",
    displayName: "撤单条件猎人",
  });
  assert.equal(registered.ok, true);
  const current = service.getProfile(registered.session.token);
  current.profile.backpackSlots = [{itemId: "item_meat_small", count: 2}];
  assert.equal(service.saveProfile(registered.session.token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile: current.profile,
  }).ok, true);
  const created = service.createMarketListing(registered.session.token, {
    itemId: "item_meat_small",
    count: 2,
    unitPrice: 20,
    currency: "stoneCoins",
  });
  assert.equal(created.ok, true);
  return {base, registered, created};
}

test("planner selects a shared conditional transaction only for one certified ordinary listing cancel", () => {
  const before = baselineAuthority();
  const plan = buildPlan(cancelCandidate(before), before);

  assert.equal(plan.kind, "market_cancel_conditional_v1");
  assert.equal(plan.globalRevisionFence, false);
  assert.equal(plan.globalCompatibilityBarrier, "shared");
  assert.equal(plan.accountId, ACCOUNT_ID);
  assert.equal(plan.playerId, PLAYER_ID);
  assert.equal(plan.listingId, LISTING_ID);
  assert.equal(plan.operationId, OPERATION_ID);
  assert.deepEqual(
    operationResources(plan, "locks"),
    ["profile_binding", "profile", "market_listing"],
  );
  assert.deepEqual(
    operationResources(plan, "writes"),
    ["profile_binding", "profile", "market_listing", "mutation_receipt"],
  );
  assert.equal(plan.writes.every((write) => write.expectedAffectedRows === 1), true);
  assert.match(plan.locks[2].sql, /FROM market_listings[\s\S]+FOR UPDATE/i);
  assert.match(plan.writes[2].sql, /^DELETE FROM market_listings\b/i);
  assert.equal(plan.writes.some((write) => /ON DUPLICATE KEY/i.test(write.sql)), false);
});

test("planner fails closed to legacy for equipment, missing receipt, and broader market changes", async (t) => {
  const cases = [
    {
      name: "equipment listing",
      mutate(before, after) {
        before.marketListings[LISTING_ID] = ordinaryListing({
          itemId: "weapon_wooden_club",
          count: 1,
          schemaVersion: 2,
          equipmentEnvelope: {envelopeId: "eqx_market_cancel_equipment_1"},
        });
        delete after.marketListings[LISTING_ID];
      },
    },
    {
      name: "missing receipt",
      mutate(_before, after) {
        after.mutationReceipts = {};
      },
    },
    {
      name: "ordinary listing has an unknown field",
      mutate(before) {
        before.marketListings[LISTING_ID] = ordinaryListing({futureEscrowRule: true});
      },
    },
    {
      name: "mail also changes",
      mutate(_before, after) {
        after.mailMessages.mail_extra = {
          mailId: "mail_extra",
          senderAccountId: "system",
          recipientAccountId: ACCOUNT_ID,
          title: "extra",
          body: "extra",
          attachments: {},
          createdAt: UPDATED_AT_2,
          readAt: null,
          schemaVersion: 1,
        };
      },
    },
    {
      name: "market config also changes",
      mutate(_before, after) {
        after.marketConfig = {defaultTaxBps: 100};
      },
    },
    {
      name: "scope listing differs",
      scope: cancelScope({listingId: "listing_other"}),
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const before = baselineAuthority();
      const after = cancelCandidate(before);
      if (fixture.mutate) {
        fixture.mutate(before, after);
      }
      const plan = buildPlan(after, before, fixture.scope || cancelScope());
      assert.equal(plan.kind, "legacy_global_cas");
      assert.equal(plan.globalRevisionFence, true);
    });
  }
});

test("real durable ordinary cancel signs the exact market consistency scope", async () => {
  const {base, registered, created} = seedOrdinaryMarketCancelScenario("mktcancelcond");
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
    operationId: "op_real_market_cancel_scope_0001",
    requestHash: "b".repeat(64),
    actionId: "POST /market/cancel",
  };
  const result = await service.invokeDurable("cancelMarketListing", [registered.session.token, {
    listingId: created.listing.listingId,
  }], operation);

  assert.equal(result.ok, true);
  assert.deepEqual(saveOptions.consistencyScope, {
    kind: "row_local_market_cancel_v1",
    accountId: registered.account.accountId,
    playerId: registered.profileBinding.playerId,
    listingId: created.listing.listingId,
    operationId: operation.operationId,
    requestHash: operation.requestHash,
    actionId: operation.actionId,
  });
  assert.equal(savedPlan.kind, "market_cancel_conditional_v1");
});

test("ambiguous ordinary cancel recovers only from exact receipt, profile, and listing absence", async () => {
  const {base, registered, created} = seedOrdinaryMarketCancelScenario("mktcancelrecover");
  const unrelatedSeed = createAuthService({store: base});
  const unrelated = unrelatedSeed.register({
    username: "mktrecoverother",
    password: "test1234",
    displayName: "无关提交猎人",
  });
  assert.equal(unrelated.ok, true);
  const unrelatedRecordPoint = {
    mapId: "firebud_training_yard",
    spawnName: "market_recovery_other",
    label: "无关账号的新记录点",
  };
  const operation = {
    operationId: "op_market_cancel_recovery_0001",
    requestHash: "c".repeat(64),
    actionId: "POST /market/cancel",
  };
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      base.save(nextData);
      const concurrent = createAuthService({store: base});
      const unrelatedChange = concurrent.profileAction(unrelated.session.token, {
        action: "record_point_save",
        payload: {recordPoint: unrelatedRecordPoint},
      });
      assert.equal(unrelatedChange.ok, true);
      throw new Error("connection lost after market cancel commit");
    },
  }, {onError() {}});
  const service = createAuthService({store});

  const result = await service.invokeDurable("cancelMarketListing", [registered.session.token, {
    listingId: created.listing.listingId,
  }], operation);

  assert.equal(result.ok, true);
  assert.equal(store.metrics().ambiguousCommitRecoveries, 1);
  assert.equal(Object.hasOwn(service.snapshot().marketListings, created.listing.listingId), false);
  assert.equal(
    service.snapshot().profiles[unrelated.profileBinding.playerId].profile.recordPoint.label,
    unrelatedRecordPoint.label,
  );
  assert.deepEqual(service.snapshot(), base.load());
});

for (const mismatch of ["receipt", "profile", "listing"]) {
  test(`ambiguous ordinary cancel rejects a mismatched ${mismatch}`, async () => {
    const {base, registered, created} = seedOrdinaryMarketCancelScenario(`mktcan${mismatch}`);
    const listingBefore = structuredClone(base.load().marketListings[created.listing.listingId]);
    const beforePublished = base.load();
    const operation = {
      operationId: `op_market_cancel_mismatch_${mismatch}`,
      requestHash: "d".repeat(64),
      actionId: "POST /market/cancel",
    };
    const store = createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData) {
        base.save(nextData);
        const changed = base.load();
        if (mismatch === "receipt") {
          delete changed.mutationReceipts[operation.operationId];
        } else if (mismatch === "listing") {
          changed.marketListings[created.listing.listingId] = listingBefore;
        } else {
          const accountId = registered.account.accountId;
          const playerId = registered.profileBinding.playerId;
          const revision = Number(changed.profileBindings[accountId].profileRevision) + 1;
          changed.profileBindings[accountId] = {
            ...changed.profileBindings[accountId],
            profileRevision: revision,
            updatedAt: "2026-07-14T03:02:00.000Z",
          };
          changed.profiles[playerId] = {
            ...changed.profiles[playerId],
            profileRevision: revision,
            updatedAt: "2026-07-14T03:02:00.000Z",
          };
        }
        base.save(changed);
        throw new Error(`connection lost after ${mismatch} mismatch`);
      },
    }, {onError() {}});
    const service = createAuthService({store});

    await assert.rejects(
      service.invokeDurable("cancelMarketListing", [registered.session.token, {
        listingId: created.listing.listingId,
      }], operation),
      (error) => error && error.code === "storage_write_failed",
    );
    assert.equal(store.metrics().ambiguousCommitRecoveries, 0);
    assert.deepEqual(service.snapshot(), beforePublished);
  });
}
