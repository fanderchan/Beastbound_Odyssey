"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {isDeepStrictEqual} = require("node:util");

const {
  createAsyncWriteAuthStore,
  createMemoryAuthStore,
} = require("../src/auth-service");
const {cloneAuthorityRoot} = require("../src/auth/authority-root-clone");
const {
  applySharedAssetReadView,
  compareCanonicalIds,
} = require("../src/auth/shared-asset-read-model");
const {
  createAuthService,
} = require("../test-support/auth-service-test-context");

function canonicalMap(value) {
  return Object.fromEntries(
    Object.entries(value || {}).sort(([left], [right]) => compareCanonicalIds(left, right)),
  );
}

function replacement(keysValue, valuesValue) {
  const keys = Array.from(new Set(keysValue)).sort(compareCanonicalIds);
  const values = {};
  for (const key of keys) {
    if (Object.hasOwn(valuesValue || {}, key)) {
      values[key] = valuesValue[key];
    }
  }
  return {keys, values: canonicalMap(values)};
}

function accountsById(accountsValue) {
  const result = {};
  for (const account of Object.values(accountsValue || {})) {
    const accountId = String(account && account.accountId || "");
    if (accountId !== "") {
      result[accountId] = account;
    }
  }
  return result;
}

function sharedView(snapshot, request) {
  const accountIds = new Set([request.accountId]);
  let recipientAccountId = "";
  if (request.scope === "mail_send") {
    const recipient = snapshot.accounts[request.recipientUsername] || null;
    recipientAccountId = String(recipient && recipient.accountId || "");
    if (request.knownRecipientAccountId) {
      accountIds.add(request.knownRecipientAccountId);
    }
    if (recipientAccountId) {
      accountIds.add(recipientAccountId);
    }
  }
  const marketListings = request.scope.startsWith("market_")
    ? canonicalMap(snapshot.marketListings)
    : null;
  if (marketListings) {
    for (const listing of Object.values(marketListings)) {
      accountIds.add(listing.sellerAccountId);
    }
  }
  const profileAccountIds = new Set(
    request.scope === "mail_send" && request.includeActorProfile !== true
      ? []
      : [request.accountId],
  );
  if (request.scope === "market_mutation") {
    const listing = marketListings[request.listingId];
    if (listing) {
      profileAccountIds.add(listing.sellerAccountId);
    }
  }
  const playerIds = [];
  for (const accountId of profileAccountIds) {
    const binding = snapshot.profileBindings[accountId];
    if (binding) {
      playerIds.push(binding.playerId);
    }
  }
  const mailPartitions = ["mail_read", "mail_mutation"].includes(request.scope) ? [{
    recipientAccountId: request.accountId,
    messages: canonicalMap(Object.fromEntries(
      Object.entries(snapshot.mailMessages).filter(([, mail]) => (
        mail.recipientAccountId === request.accountId
      )),
    )),
  }] : [];
  return {
    schemaVersion: 1,
    scope: request.scope,
    accountId: request.accountId,
    recipientUsername: request.scope === "mail_send" ? request.recipientUsername : "",
    knownRecipientAccountId: request.scope === "mail_send"
      ? String(request.knownRecipientAccountId || "")
      : "",
    recipientAccountId: request.scope === "mail_send" ? recipientAccountId : "",
    includeActorProfile: request.scope === "mail_send" && request.includeActorProfile === true,
    accounts: replacement(Array.from(accountIds), accountsById(snapshot.accounts)),
    profileBindings: replacement(Array.from(profileAccountIds), snapshot.profileBindings),
    profiles: replacement(playerIds, snapshot.profiles),
    marketListings,
    marketConfig: marketListings ? snapshot.marketConfig : null,
    mailPartitions,
    consumedEquipmentEnvelopeIds: [],
  };
}

function mergeScopedCommit(backing, nextData, saveOptions) {
  const scope = saveOptions && saveOptions.consistencyScope;
  assert.ok(scope && typeof scope === "object", "cross-node fixture requires a certified row-local scope");
  const current = backing.load();
  const mergeActorProfile = () => {
    current.profileBindings[scope.accountId] = nextData.profileBindings[scope.accountId];
    current.profiles[scope.playerId] = nextData.profiles[scope.playerId];
  };
  if (scope.kind === "row_local_market_create_v1") {
    mergeActorProfile();
    current.marketListings[scope.listingId] = nextData.marketListings[scope.listingId];
  } else if (scope.kind === "row_local_market_buy_v1") {
    mergeActorProfile();
    delete current.marketListings[scope.listingId];
    current.mailMessages[scope.saleMailId] = nextData.mailMessages[scope.saleMailId];
    current.marketConfig = structuredClone(nextData.marketConfig);
  } else if (scope.kind === "row_local_market_cancel_v1") {
    mergeActorProfile();
    delete current.marketListings[scope.listingId];
  } else if (scope.kind === "row_local_mail_claim_v1") {
    mergeActorProfile();
    if (scope.mailDisposition === "delete") {
      delete current.mailMessages[scope.mailId];
    } else {
      current.mailMessages[scope.mailId] = nextData.mailMessages[scope.mailId];
    }
    for (const envelopeId of scope.claimedEnvelopeIds || []) {
      current.consumedEquipmentEnvelopes[envelopeId] = {
        schemaVersion: 1,
        envelopeId,
      };
    }
  } else if (scope.kind === "row_local_mail_send_v1") {
    if (scope.mode === "ordinary_items") {
      mergeActorProfile();
    } else {
      assert.equal(scope.mode, "text");
    }
    current.mailMessages[scope.mailId] = nextData.mailMessages[scope.mailId];
  } else {
    assert.fail(`unsupported cross-node fixture scope: ${String(scope.kind || "")}`);
  }
  current.mutationReceipts[scope.operationId] = structuredClone(
    nextData.mutationReceipts[scope.operationId],
  );
  backing.save(current);
}

function profileForAccount(snapshot, accountId) {
  const binding = snapshot.profileBindings[accountId];
  return snapshot.profiles[binding.playerId];
}

function backpackItemCount(profileDocument, itemId) {
  return (profileDocument.profile.backpackSlots || []).reduce(
    (total, slot) => total + (slot && slot.itemId === itemId ? Number(slot.count || 0) : 0),
    0,
  );
}

function seedBackpackEquipment(service, token) {
  const current = service.getProfile(token);
  assert.equal(current.ok, true);
  const profile = current.profile;
  profile.backpackSlots = [
    {itemId: "weapon_wooden_club", count: 1},
    ...Array.from({length: 14}, () => ({})),
  ];
  profile.equipmentInstances = {
    equip_shared_read_legacy_1: {
      schemaVersion: 1,
      instanceId: "equip_shared_read_legacy_1",
      itemId: "weapon_wooden_club",
      location: "backpack",
      slotId: "",
      durability: 17,
      enhancement: {itemId: "weapon_wooden_club", level: 2, history: []},
      wearCounters: {itemId: "weapon_wooden_club", attackCount: 3, hitCount: 0},
      expPillCharge: {},
      source: "shared_read_legacy_test",
    },
  };
  profile.equipmentSlotInstanceIds = {};
  profile.equipmentSlotsVersion = 5;
  profile.nextEquipmentInstanceSerial = 2;
  const saved = service.saveProfile(token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile,
  });
  assert.equal(saved.ok, true, JSON.stringify(saved));
}

function createReadThroughNode(backing, initialSnapshot, options = {}) {
  let nodeBaseline = cloneAuthorityRoot(initialSnapshot);
  let loadCalls = 0;
  let sharedReadCalls = 0;
  const underlying = {
    mode: "shared-read-test",
    load() {
      loadCalls += 1;
      if (loadCalls > 1) {
        nodeBaseline = cloneAuthorityRoot(backing.load());
      }
      return cloneAuthorityRoot(nodeBaseline);
    },
    async readSharedAssetView(request, readOptions = {}) {
      sharedReadCalls += 1;
      if (options.fullReloadBeforeFirstSharedRead === true && sharedReadCalls === 1) {
        const error = new Error("global revision changed");
        error.code = "mysql_shared_asset_full_reload_required";
        throw error;
      }
      if (typeof options.beforeSharedRead === "function") {
        await options.beforeSharedRead(request);
      }
      const view = sharedView(backing.load(), request);
      if (readOptions.adopt === true) {
        nodeBaseline = applySharedAssetReadView(nodeBaseline, view);
      }
      return view;
    },
    async readDurableMutationReceipt(operationId) {
      if (typeof options.onReceiptRead === "function") {
        options.onReceiptRead(operationId);
      }
      if (options.receiptReadError) {
        throw options.receiptReadError;
      }
      const backingSnapshot = backing.load();
      const receipt = backingSnapshot.mutationReceipts[operationId] || null;
      return {
        schemaVersion: 1,
        operationId,
        authorityCurrent: isDeepStrictEqual(nodeBaseline, backingSnapshot),
        receipt: receipt === null ? null : structuredClone(receipt),
      };
    },
    async saveAsyncOwned(nextData, saveOptions = {}) {
      if (typeof options.onSave === "function") {
        options.onSave(saveOptions);
      }
      if (options.saveError) {
        throw options.saveError;
      }
      if (!saveOptions.consistencyScope && options.allowLegacy === true) {
        backing.save(nextData);
      } else {
        mergeScopedCommit(backing, nextData, saveOptions);
      }
      if (typeof options.afterCommit === "function") {
        options.afterCommit(backing, nextData, saveOptions);
      }
      if (options.saveErrorAfterCommit) {
        throw options.saveErrorAfterCommit;
      }
      nodeBaseline = cloneAuthorityRoot(nextData);
    },
  };
  return createAuthService({
    store: createAsyncWriteAuthStore(underlying, {onError() {}}),
  });
}

function seedMarketScenario() {
  const service = createAuthService({store: createMemoryAuthStore()});
  const seller = service.register({
    username: "sharedreadseller",
    password: "test1234",
    displayName: "跨服卖家",
  });
  const buyer = service.register({
    username: "sharedreadbuyer",
    password: "test1234",
    displayName: "跨服买家",
  });
  assert.equal(seller.ok, true);
  assert.equal(buyer.ok, true);
  const sellerProfile = service.getProfile(seller.session.token);
  sellerProfile.profile.backpackSlots[0] = {itemId: "item_meat_small", count: 2};
  const saved = service.saveProfile(seller.session.token, {
    expectedRevision: sellerProfile.profileSummary.profileRevision,
    profile: sellerProfile.profile,
  });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const beforeListing = service.snapshot();
  const listing = service.createMarketListing(seller.session.token, {
    itemId: "item_meat_small",
    count: 1,
    unitPrice: 20,
    currency: "stoneCoins",
  });
  assert.equal(listing.ok, true, JSON.stringify(listing));
  const afterListing = service.snapshot();
  return {
    backing: createMemoryAuthStore(afterListing),
    afterListing,
    beforeListing,
    buyer,
    seller,
    listingId: listing.listing.listingId,
  };
}

function seedMarketCreateCapacityScenario({totalCount, sellerCount}) {
  assert.ok(Number.isSafeInteger(totalCount) && totalCount >= 0 && totalCount <= 120);
  assert.ok(Number.isSafeInteger(sellerCount) && sellerCount >= 0 && sellerCount <= totalCount);
  const service = createAuthService({store: createMemoryAuthStore()});
  const seller = service.register({
    username: `mcs${totalCount}_${sellerCount}`,
    password: "test1234",
    displayName: "挂单读穿卖家",
  });
  const other = service.register({
    username: `mco${totalCount}_${sellerCount}`,
    password: "test1234",
    displayName: "挂单读穿他人",
  });
  assert.equal(seller.ok, true, JSON.stringify(seller));
  assert.equal(other.ok, true, JSON.stringify(other));
  const current = service.getProfile(seller.session.token);
  current.profile.backpackSlots[0] = {itemId: "item_meat_small", count: 3};
  const saved = service.saveProfile(seller.session.token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile: current.profile,
  });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const staleSnapshot = service.snapshot();
  for (let index = 0; index < totalCount; index += 1) {
    const listingId = `market_capacity_${String(index).padStart(3, "0")}`;
    staleSnapshot.marketListings[listingId] = {
      listingId,
      sellerAccountId: index < sellerCount
        ? seller.account.accountId
        : other.account.accountId,
      itemId: "item_meat_small",
      count: 1,
      unitPrice: 10 + index,
      currency: "stoneCoins",
      createdAt: "2026-07-15T00:00:00.000Z",
      schemaVersion: 1,
    };
  }
  return {
    backing: createMemoryAuthStore(staleSnapshot),
    other,
    seller,
    staleSnapshot,
  };
}

test("text mail resolves a recipient created on another Node without scanning a mailbox", async () => {
  const backing = createMemoryAuthStore();
  const seed = createAuthService({store: backing});
  const sender = seed.register({
    username: "mailreadsender",
    password: "test1234",
    displayName: "邮件寄件人",
  });
  assert.equal(sender.ok, true);
  const staleSnapshot = backing.load();
  const remote = createAuthService({store: backing});
  const recipient = remote.register({
    username: "mailreadrecipient",
    password: "test1234",
    displayName: "远端收件人",
  });
  assert.equal(recipient.ok, true);
  let observedRequest = null;
  let receiptReads = 0;
  let savedScope = null;
  const node = createReadThroughNode(backing, staleSnapshot, {
    beforeSharedRead(request) {
      observedRequest = structuredClone(request);
    },
    onReceiptRead() {
      receiptReads += 1;
    },
    onSave(options) {
      savedScope = structuredClone(options.consistencyScope);
    },
  });
  const result = await node.invokeDurable(
    "sendMail",
    [sender.session.token, {
      recipientUsername: recipient.account.username,
      title: "跨节点新收件人",
      body: "首个请求就应找到刚注册的账号。",
    }],
    {
      operationId: "op_mail_send_remote_recipient_0001",
      requestHash: "1".repeat(64),
      actionId: "POST /mail/send",
    },
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(observedRequest, {
    schemaVersion: 1,
    scope: "mail_send",
    accountId: sender.account.accountId,
    recipientUsername: recipient.account.username,
    knownRecipientAccountId: "",
    includeActorProfile: false,
  });
  assert.equal(savedScope.kind, "row_local_mail_send_v1");
  assert.equal(savedScope.mode, "text");
  assert.equal(savedScope.recipientAccountId, recipient.account.accountId);
  assert.equal(receiptReads, 0);
  assert.equal(
    Object.values(backing.load().mailMessages).filter((mail) => (
      mail.recipientAccountId === recipient.account.accountId
    )).length,
    1,
  );
});

test("ordinary mail adopts the sender profile changed on another Node before deducting attachments", async () => {
  const backing = createMemoryAuthStore();
  const seed = createAuthService({store: backing});
  const sender = seed.register({
    username: "mailassetreadsend",
    password: "test1234",
    displayName: "附件寄件人",
  });
  const recipient = seed.register({
    username: "mailassetreadrecv",
    password: "test1234",
    displayName: "附件收件人",
  });
  assert.equal(sender.ok, true);
  assert.equal(recipient.ok, true);
  const staleSnapshot = backing.load();
  const remote = createAuthService({store: backing});
  const current = remote.getProfile(sender.session.token);
  current.profile.backpackSlots[0] = {itemId: "item_meat_small", count: 2};
  assert.equal(remote.saveProfile(sender.session.token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile: current.profile,
  }).ok, true);
  let observedRequest = null;
  let savedScope = null;
  const node = createReadThroughNode(backing, staleSnapshot, {
    beforeSharedRead(request) {
      observedRequest = structuredClone(request);
    },
    onSave(options) {
      savedScope = structuredClone(options.consistencyScope);
    },
  });
  const result = await node.invokeDurable(
    "sendMail",
    [sender.session.token, {
      recipientUsername: recipient.account.username,
      title: "远端补给",
      body: "必须基于刚更新的背包扣除。",
      items: [{itemId: "item_meat_small", count: 1}],
    }],
    {
      operationId: "op_mail_send_remote_asset_0001",
      requestHash: "2".repeat(64),
      actionId: "POST /mail/send",
    },
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(observedRequest.scope, "mail_send");
  assert.equal(observedRequest.includeActorProfile, true);
  assert.equal(observedRequest.knownRecipientAccountId, recipient.account.accountId);
  assert.equal(savedScope.kind, "row_local_mail_send_v1");
  assert.equal(savedScope.mode, "ordinary_items");
  assert.equal(
    backpackItemCount(profileForAccount(backing.load(), sender.account.accountId), "item_meat_small"),
    1,
  );
});

test("ordinary mail refuses a stale attachment already consumed on another Node", async () => {
  const backing = createMemoryAuthStore();
  const seed = createAuthService({store: backing});
  const sender = seed.register({username: "mailstalesend", password: "test1234", displayName: "陈旧寄件人"});
  const recipient = seed.register({username: "mailstalerecv", password: "test1234", displayName: "陈旧收件人"});
  const withItem = seed.getProfile(sender.session.token);
  withItem.profile.backpackSlots[0] = {itemId: "item_meat_small", count: 1};
  assert.equal(seed.saveProfile(sender.session.token, {
    expectedRevision: withItem.profileSummary.profileRevision,
    profile: withItem.profile,
  }).ok, true);
  const staleSnapshot = backing.load();
  const remote = createAuthService({store: backing});
  const consumed = remote.getProfile(sender.session.token);
  consumed.profile.backpackSlots[0] = {};
  assert.equal(remote.saveProfile(sender.session.token, {
    expectedRevision: consumed.profileSummary.profileRevision,
    profile: consumed.profile,
  }).ok, true);
  let saveCalls = 0;
  const node = createReadThroughNode(backing, staleSnapshot, {
    onSave() {
      saveCalls += 1;
    },
  });
  const result = await node.invokeDurable(
    "sendMail",
    [sender.session.token, {
      recipientUsername: recipient.account.username,
      title: "已消耗附件",
      body: "不能使用旧节点中的物品。",
      items: [{itemId: "item_meat_small", count: 1}],
    }],
    {
      operationId: "op_mail_send_stale_asset_0001",
      requestHash: "3".repeat(64),
      actionId: "POST /mail/send",
    },
  );

  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.code, "mail_attachment_not_enough");
  assert.equal(saveCalls, 0);
  assert.equal(Object.keys(backing.load().mailMessages).length, 0);
});

test("malformed mail attachments keep the domain error without pre-reading a profile", async () => {
  const initial = createMemoryAuthStore();
  const seed = createAuthService({store: initial});
  const sender = seed.register({username: "mailbadreadsend", password: "test1234", displayName: "畸形寄件人"});
  const recipient = seed.register({username: "mailbadreadrecv", password: "test1234", displayName: "畸形收件人"});
  assert.equal(sender.ok, true);
  assert.equal(recipient.ok, true);
  const remoteSnapshot = initial.load();
  const playerId = remoteSnapshot.profileBindings[sender.account.accountId].playerId;
  delete remoteSnapshot.profileBindings[sender.account.accountId];
  delete remoteSnapshot.profiles[playerId];
  const staleSnapshot = cloneAuthorityRoot(remoteSnapshot);
  const backing = createMemoryAuthStore(remoteSnapshot);
  let sharedReadCalled = false;
  const node = createReadThroughNode(backing, staleSnapshot, {
    beforeSharedRead() {
      sharedReadCalled = true;
    },
  });

  const result = await node.invokeDurable(
    "sendMail",
    [sender.session.token, {
      recipientUsername: recipient.account.username,
      title: "畸形附件",
      body: "应先按原邮件规则拒绝。",
      items: [{itemId: "item_meat_small", count: 1, unexpected: true}],
    }],
    {
      operationId: "op_mail_send_malformed_attachment_0001",
      requestHash: "4".repeat(64),
      actionId: "POST /mail/send",
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "mail_item_invalid");
  assert.equal(sharedReadCalled, false);
});

test("ordinary market create refreshes a stale global-cap snapshot before validating", async () => {
  const scenario = seedMarketCreateCapacityScenario({totalCount: 120, sellerCount: 5});
  const fresh = scenario.backing.load();
  delete fresh.marketListings.market_capacity_119;
  scenario.backing.save(fresh);
  let receiptReads = 0;
  let savedScope = null;
  const node = createReadThroughNode(scenario.backing, scenario.staleSnapshot, {
    beforeSharedRead(request) {
      assert.equal(request.scope, "market_read");
    },
    onReceiptRead() {
      receiptReads += 1;
    },
    onSave(options) {
      savedScope = options.consistencyScope;
    },
  });

  const created = await node.invokeDurable(
    "createMarketListing",
    [scenario.seller.session.token, {
      itemId: "item_meat_small",
      count: 1,
      unitPrice: 77,
      currency: "stoneCoins",
    }],
    {
      operationId: "op_market_create_global_cap_0001",
      requestHash: "c".repeat(64),
      actionId: "POST /market/list",
    },
  );
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.equal(receiptReads, 0);
  assert.equal(savedScope.kind, "row_local_market_create_v1");
  assert.equal(savedScope.observedTotalListingCount, 119);
  assert.equal(savedScope.observedSellerListingCount, 5);
  assert.equal(savedScope.maxTotalListings, 120);
  assert.equal(savedScope.maxSellerListings, 20);
  const finalSnapshot = scenario.backing.load();
  assert.equal(Object.keys(finalSnapshot.marketListings).length, 120);
  assert.equal(
    Object.values(finalSnapshot.marketListings).filter((listing) => (
      listing.sellerAccountId === scenario.seller.account.accountId
    )).length,
    6,
  );
  assert.equal(
    backpackItemCount(profileForAccount(finalSnapshot, scenario.seller.account.accountId), "item_meat_small"),
    2,
  );
});

test("ordinary market create refreshes a stale seller-cap snapshot before validating", async () => {
  const scenario = seedMarketCreateCapacityScenario({totalCount: 20, sellerCount: 20});
  const fresh = scenario.backing.load();
  delete fresh.marketListings.market_capacity_000;
  scenario.backing.save(fresh);
  let receiptReads = 0;
  let savedScope = null;
  const node = createReadThroughNode(scenario.backing, scenario.staleSnapshot, {
    onReceiptRead() {
      receiptReads += 1;
    },
    onSave(options) {
      savedScope = options.consistencyScope;
    },
  });

  const created = await node.invokeDurable(
    "createMarketListing",
    [scenario.seller.session.token, {
      itemId: "item_meat_small",
      count: 1,
      unitPrice: 88,
      currency: "stoneCoins",
    }],
    {
      operationId: "op_market_create_seller_cap_0001",
      requestHash: "d".repeat(64),
      actionId: "POST /market/list",
    },
  );
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.equal(receiptReads, 0);
  assert.equal(savedScope.kind, "row_local_market_create_v1");
  assert.equal(savedScope.observedTotalListingCount, 19);
  assert.equal(savedScope.observedSellerListingCount, 19);
  const finalSnapshot = scenario.backing.load();
  assert.equal(Object.keys(finalSnapshot.marketListings).length, 20);
  assert.equal(
    Object.values(finalSnapshot.marketListings).filter((listing) => (
      listing.sellerAccountId === scenario.seller.account.accountId
    )).length,
    20,
  );
});

test("healthy ordinary market create performs no exact durable-receipt read", async () => {
  const scenario = seedMarketCreateCapacityScenario({totalCount: 0, sellerCount: 0});
  let receiptReads = 0;
  let saveCalls = 0;
  const node = createReadThroughNode(scenario.backing, scenario.staleSnapshot, {
    onReceiptRead() {
      receiptReads += 1;
    },
    onSave(options) {
      saveCalls += 1;
      assert.equal(options.consistencyScope.kind, "row_local_market_create_v1");
    },
  });
  const created = await node.invokeDurable(
    "createMarketListing",
    [scenario.seller.session.token, {
      itemId: "item_meat_small",
      count: 1,
      unitPrice: 99,
      currency: "stoneCoins",
    }],
    {
      operationId: "op_market_create_zero_exact_read_0001",
      requestHash: "e".repeat(64),
      actionId: "POST /market/list",
    },
  );
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.equal(receiptReads, 0);
  assert.equal(saveCalls, 1);
});

test("scoped market-create recovery preserves an unrelated commit after an ambiguous save", async () => {
  const scenario = seedMarketCreateCapacityScenario({totalCount: 0, sellerCount: 0});
  const unrelatedPlayerId = scenario.staleSnapshot.profileBindings[scenario.other.account.accountId].playerId;
  const node = createReadThroughNode(scenario.backing, scenario.staleSnapshot, {
    afterCommit(backing) {
      const concurrent = backing.load();
      concurrent.profiles[unrelatedPlayerId].profile.stoneCoins += 1;
      backing.save(concurrent);
    },
    saveErrorAfterCommit: new Error("connection ended after commit"),
  });
  const created = await node.invokeDurable(
    "createMarketListing",
    [scenario.seller.session.token, {
      itemId: "item_meat_small",
      count: 1,
      unitPrice: 105,
      currency: "stoneCoins",
    }],
    {
      operationId: "op_market_create_scoped_recovery_0001",
      requestHash: "0".repeat(64),
      actionId: "POST /market/list",
    },
  );
  assert.equal(created.ok, true, JSON.stringify(created));
  const finalSnapshot = scenario.backing.load();
  assert.equal(Object.hasOwn(finalSnapshot.marketListings, created.listing.listingId), true);
  assert.equal(
    finalSnapshot.profiles[unrelatedPlayerId].profile.stoneCoins,
    scenario.staleSnapshot.profiles[unrelatedPlayerId].profile.stoneCoins + 1,
  );
  assert.equal(
    backpackItemCount(profileForAccount(finalSnapshot, scenario.seller.account.accountId), "item_meat_small"),
    2,
  );
});

test("market create full reload replays a newly imported local receipt without an exact read", async () => {
  const scenario = seedMarketCreateCapacityScenario({totalCount: 0, sellerCount: 0});
  const operation = {
    operationId: "op_market_create_reload_replay_0001",
    requestHash: "f".repeat(64),
    actionId: "POST /market/list",
  };
  const args = [scenario.seller.session.token, {
    itemId: "item_meat_small",
    count: 1,
    unitPrice: 111,
    currency: "stoneCoins",
  }];
  const firstNode = createReadThroughNode(scenario.backing, scenario.staleSnapshot);
  const first = await firstNode.invokeDurable("createMarketListing", args, operation);
  assert.equal(first.ok, true, JSON.stringify(first));
  let receiptReads = 0;
  let saveCalls = 0;
  const retryNode = createReadThroughNode(scenario.backing, scenario.staleSnapshot, {
    fullReloadBeforeFirstSharedRead: true,
    onReceiptRead() {
      receiptReads += 1;
    },
    onSave() {
      saveCalls += 1;
    },
  });

  const replay = await retryNode.invokeDurable("createMarketListing", args, operation);
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.listing.listingId, first.listing.listingId);
  assert.equal(receiptReads, 0);
  assert.equal(saveCalls, 0);
  const finalSnapshot = scenario.backing.load();
  assert.equal(Object.keys(finalSnapshot.marketListings).length, 1);
  assert.equal(
    backpackItemCount(profileForAccount(finalSnapshot, scenario.seller.account.accountId), "item_meat_small"),
    2,
  );
});

test("known MySQL market-create capacity rollbacks return product failures without publishing", async (t) => {
  for (const [code, message] of [
    ["market_listing_limit", "你的挂单太多，请先卖出或取消一些。"],
    ["market_full", "交易所挂单已满，请稍后再试。"],
  ]) {
    await t.test(code, async () => {
      const scenario = seedMarketCreateCapacityScenario({totalCount: 0, sellerCount: 0});
      const saveError = new Error(code);
      saveError.code = code;
      saveError.outcomeUnknown = false;
      let receiptReads = 0;
      const node = createReadThroughNode(scenario.backing, scenario.staleSnapshot, {
        saveError,
        onReceiptRead() {
          receiptReads += 1;
        },
      });
      const result = await node.invokeDurable(
        "createMarketListing",
        [scenario.seller.session.token, {
          itemId: "item_meat_small",
          count: 1,
          unitPrice: 122,
          currency: "stoneCoins",
        }],
        {
          operationId: `op_market_create_${code}_0001`,
          requestHash: code === "market_full" ? "1".repeat(64) : "2".repeat(64),
          actionId: "POST /market/list",
        },
      );
      assert.equal(result.ok, false, JSON.stringify(result));
      assert.equal(result.code, code);
      assert.equal(result.message, message);
      assert.equal(receiptReads, 1);
      const finalSnapshot = scenario.backing.load();
      assert.equal(Object.keys(finalSnapshot.marketListings).length, 0);
      assert.equal(Object.keys(finalSnapshot.mutationReceipts).length, 0);
      assert.equal(
        backpackItemCount(profileForAccount(finalSnapshot, scenario.seller.account.accountId), "item_meat_small"),
        3,
      );
    });
  }
});

test("a stale Node reads a remote listing, buys it, then the seller reads and claims the remote sale mail", async () => {
  const scenario = seedMarketScenario();
  const buyerNode = createReadThroughNode(scenario.backing, scenario.beforeListing);
  const sellerNode = createReadThroughNode(scenario.backing, scenario.beforeListing);

  assert.equal(buyerNode.marketListings(scenario.buyer.session.token).market.listings.length, 0);
  const freshMarket = await buyerNode._httpInvokeSharedAssetRead(
    "marketListings",
    [scenario.buyer.session.token, {}],
  );
  assert.equal(freshMarket.ok, true, JSON.stringify(freshMarket));
  assert.deepEqual(
    freshMarket.market.listings.map((listing) => listing.listingId),
    [scenario.listingId],
  );

  const bought = await buyerNode.invokeDurable(
    "buyMarketListing",
    [scenario.buyer.session.token, {listingId: scenario.listingId}],
    {
      operationId: "op_shared_read_buy_0001",
      requestHash: "a".repeat(64),
      actionId: "POST /market/buy",
    },
  );
  assert.equal(bought.ok, true, JSON.stringify(bought));
  assert.equal(Object.hasOwn(scenario.backing.load().marketListings, scenario.listingId), false);

  assert.equal(sellerNode.listInbox(scenario.seller.session.token).messages.length, 0);
  const freshInbox = await sellerNode._httpInvokeSharedAssetRead(
    "listInbox",
    [scenario.seller.session.token],
  );
  assert.equal(freshInbox.ok, true, JSON.stringify(freshInbox));
  const saleMail = freshInbox.messages.find((mail) => mail.title === "拍卖行成交通知");
  assert.ok(saleMail);
  assert.equal(saleMail.currency.stoneCoins, 19);

  const claimed = await sellerNode.invokeDurable(
    "claimMailAttachments",
    [scenario.seller.session.token, saleMail.mailId],
    {
      operationId: "op_shared_read_claim_0001",
      requestHash: "b".repeat(64),
      actionId: "POST /mail/claim",
    },
  );
  assert.equal(claimed.ok, true, JSON.stringify(claimed));
  assert.equal(claimed.claim.currency.stoneCoins, 19);
  assert.equal(Object.hasOwn(scenario.backing.load().mailMessages, saleMail.mailId), false);

  const finalSnapshot = scenario.backing.load();
  const initialBuyer = profileForAccount(scenario.afterListing, scenario.buyer.account.accountId);
  const finalBuyer = profileForAccount(finalSnapshot, scenario.buyer.account.accountId);
  const initialSeller = profileForAccount(scenario.afterListing, scenario.seller.account.accountId);
  const finalSeller = profileForAccount(finalSnapshot, scenario.seller.account.accountId);
  assert.equal(finalBuyer.profile.stoneCoins, initialBuyer.profile.stoneCoins - 20);
  assert.equal(
    backpackItemCount(finalBuyer, "item_meat_small"),
    backpackItemCount(initialBuyer, "item_meat_small") + 1,
  );
  assert.equal(finalSeller.profile.stoneCoins, initialSeller.profile.stoneCoins + 19);
  assert.equal(Object.hasOwn(finalSnapshot.mutationReceipts, "op_shared_read_buy_0001"), true);
  assert.equal(Object.hasOwn(finalSnapshot.mutationReceipts, "op_shared_read_claim_0001"), true);
  assert.equal(Object.hasOwn(finalSnapshot.marketListings, scenario.listingId), false);
  assert.equal(Object.hasOwn(finalSnapshot.mailMessages, saleMail.mailId), false);
});

test("a second live Node replays the first Node's committed market purchase by exact receipt", async () => {
  const scenario = seedMarketScenario();
  const operation = {
    operationId: "op_cross_node_market_replay_0001",
    requestHash: "1".repeat(64),
    actionId: "POST /market/buy",
  };
  let retryReceiptReads = 0;
  let retrySaves = 0;
  const firstNode = createReadThroughNode(scenario.backing, scenario.afterListing);
  const retryNode = createReadThroughNode(scenario.backing, scenario.afterListing, {
    onReceiptRead() {
      retryReceiptReads += 1;
    },
    onSave() {
      retrySaves += 1;
    },
  });

  const first = await firstNode.invokeDurable(
    "buyMarketListing",
    [scenario.buyer.session.token, {listingId: scenario.listingId}],
    operation,
  );
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.durableCommit.replayed, false);

  const replay = await retryNode.invokeDurable(
    "buyMarketListing",
    [scenario.buyer.session.token, {listingId: scenario.listingId}],
    operation,
  );
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(replay.durableCommit.replayed, true);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(retryReceiptReads, 1);
  assert.equal(retrySaves, 0);
  const cachedAfterReplay = retryNode.getProfile(scenario.buyer.session.token);
  assert.equal(cachedAfterReplay.ok, true, JSON.stringify(cachedAfterReplay));
  assert.equal(cachedAfterReplay.profile.stoneCoins, replay.profile.stoneCoins);
  assert.equal(
    backpackItemCount(cachedAfterReplay, "item_meat_small"),
    backpackItemCount(replay, "item_meat_small"),
  );

  const requestConflict = await retryNode.invokeDurable(
    "buyMarketListing",
    [scenario.buyer.session.token, {listingId: scenario.listingId}],
    {...operation, requestHash: "2".repeat(64)},
  );
  assert.equal(requestConflict.ok, false);
  assert.equal(requestConflict.code, "idempotency_key_conflict");
  const accountConflict = await retryNode.invokeDurable(
    "buyMarketListing",
    [scenario.seller.session.token, {listingId: scenario.listingId}],
    operation,
  );
  assert.equal(accountConflict.ok, false);
  assert.equal(accountConflict.code, "idempotency_key_conflict");
  assert.equal(retrySaves, 0);

  const finalSnapshot = scenario.backing.load();
  const initialBuyer = profileForAccount(scenario.afterListing, scenario.buyer.account.accountId);
  const finalBuyer = profileForAccount(finalSnapshot, scenario.buyer.account.accountId);
  assert.equal(finalBuyer.profile.stoneCoins, initialBuyer.profile.stoneCoins - 20);
  assert.equal(
    backpackItemCount(finalBuyer, "item_meat_small"),
    backpackItemCount(initialBuyer, "item_meat_small") + 1,
  );
  assert.equal(
    Object.values(finalSnapshot.mailMessages).filter((mail) => mail.title === "拍卖行成交通知").length,
    1,
  );
  assert.equal(Object.keys(finalSnapshot.mutationReceipts).filter((id) => id === operation.operationId).length, 1);
});

test("shared assets refresh before exact precheck closes the remote-commit timing window", async () => {
  const scenario = seedMarketScenario();
  const operation = {
    operationId: "op_cross_node_market_timing_0001",
    requestHash: "7".repeat(64),
    actionId: "POST /market/buy",
  };
  const args = [scenario.buyer.session.token, {listingId: scenario.listingId}];
  const winner = createReadThroughNode(scenario.backing, scenario.afterListing);
  let winnerCommitted = false;
  let receiptReads = 0;
  let retrySaves = 0;
  const retry = createReadThroughNode(scenario.backing, scenario.afterListing, {
    async beforeSharedRead() {
      if (winnerCommitted) {
        return;
      }
      const first = await winner.invokeDurable("buyMarketListing", args, operation);
      assert.equal(first.ok, true, JSON.stringify(first));
      winnerCommitted = true;
    },
    onReceiptRead() {
      assert.equal(winnerCommitted, true);
      receiptReads += 1;
    },
    onSave() {
      retrySaves += 1;
    },
  });

  const replay = await retry.invokeDurable("buyMarketListing", args, operation);
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(receiptReads, 1);
  assert.equal(retrySaves, 0);
});

test("malformed sessions are rejected before exact receipt pool work", async () => {
  const scenario = seedMarketScenario();
  let receiptReads = 0;
  const node = createReadThroughNode(scenario.backing, scenario.afterListing, {
    onReceiptRead() {
      receiptReads += 1;
    },
  });
  const result = await node.invokeDurable(
    "buyMarketListing",
    ["invalid-token", {listingId: scenario.listingId}],
    {
      operationId: "op_invalid_session_receipt_0001",
      requestHash: "8".repeat(64),
      actionId: "POST /market/buy",
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "session_missing");
  assert.equal(receiptReads, 0);
});

test("a missing market resource performs only one exact precheck on its failure path", async () => {
  const scenario = seedMarketScenario();
  const withoutListing = scenario.backing.load();
  delete withoutListing.marketListings[scenario.listingId];
  scenario.backing.save(withoutListing);
  let receiptReads = 0;
  let saveCalls = 0;
  const node = createReadThroughNode(scenario.backing, scenario.afterListing, {
    onReceiptRead() {
      receiptReads += 1;
    },
    onSave() {
      saveCalls += 1;
    },
  });
  const result = await node.invokeDurable(
    "buyMarketListing",
    [scenario.buyer.session.token, {listingId: scenario.listingId}],
    {
      operationId: "op_market_missing_single_read_0001",
      requestHash: "b".repeat(64),
      actionId: "POST /market/buy",
    },
  );
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.code, "market_listing_missing");
  assert.equal(receiptReads, 1);
  assert.equal(saveCalls, 0);
});

test("exact replay reload rejects a session revoked on another Node", async () => {
  const scenario = seedMarketScenario();
  const operation = {
    operationId: "op_revoked_session_receipt_0001",
    requestHash: "9".repeat(64),
    actionId: "POST /market/buy",
  };
  const firstNode = createReadThroughNode(scenario.backing, scenario.afterListing);
  const first = await firstNode.invokeDurable(
    "buyMarketListing",
    [scenario.buyer.session.token, {listingId: scenario.listingId}],
    operation,
  );
  assert.equal(first.ok, true, JSON.stringify(first));

  const revoked = scenario.backing.load();
  delete revoked.sessions[scenario.buyer.session.sessionId];
  scenario.backing.save(revoked);
  let retrySaves = 0;
  const retryNode = createReadThroughNode(scenario.backing, scenario.afterListing, {
    onSave() {
      retrySaves += 1;
    },
  });
  const replay = await retryNode.invokeDurable(
    "buyMarketListing",
    [scenario.buyer.session.token, {listingId: scenario.listingId}],
    operation,
  );
  assert.equal(replay.ok, false, JSON.stringify(replay));
  assert.equal(replay.code, "session_missing");
  assert.equal(retrySaves, 0);
});

test("a canonical token issued on another Node can recover its account receipt", async () => {
  const scenario = seedMarketScenario();
  const operation = {
    operationId: "op_rotated_session_receipt_0001",
    requestHash: "a".repeat(64),
    actionId: "POST /market/buy",
  };
  const firstNode = createReadThroughNode(scenario.backing, scenario.afterListing);
  const first = await firstNode.invokeDurable(
    "buyMarketListing",
    [scenario.buyer.session.token, {listingId: scenario.listingId}],
    operation,
  );
  assert.equal(first.ok, true, JSON.stringify(first));
  const authority = createAuthService({store: scenario.backing});
  const rotated = authority.login({username: "sharedreadbuyer", password: "test1234"});
  assert.equal(rotated.ok, true, JSON.stringify(rotated));

  const retryNode = createReadThroughNode(scenario.backing, scenario.afterListing);
  const replay = await retryNode.invokeDurable(
    "buyMarketListing",
    [rotated.session.token, {listingId: scenario.listingId}],
    operation,
  );
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(replay.durableCommit.replayed, true);
  assert.deepEqual(replay.receipt, first.receipt);
});

test("a second live Node replays a remote mail claim without awarding attachments twice", async () => {
  const scenario = seedMarketScenario();
  const seed = createAuthService({store: createMemoryAuthStore(scenario.afterListing)});
  const bought = seed.buyMarketListing(scenario.buyer.session.token, {
    listingId: scenario.listingId,
  });
  assert.equal(bought.ok, true, JSON.stringify(bought));
  const ready = seed.snapshot();
  const saleMail = Object.values(ready.mailMessages).find((mail) => (
    mail.recipientAccountId === scenario.seller.account.accountId
    && mail.title === "拍卖行成交通知"
  ));
  assert.ok(saleMail);
  const backing = createMemoryAuthStore(ready);
  const firstNode = createReadThroughNode(backing, ready);
  let retrySaves = 0;
  const retryNode = createReadThroughNode(backing, ready, {
    onSave() {
      retrySaves += 1;
    },
  });
  const operation = {
    operationId: "op_cross_node_mail_replay_0001",
    requestHash: "3".repeat(64),
    actionId: "POST /mail/claim",
  };

  const first = await firstNode.invokeDurable(
    "claimMailAttachments",
    [scenario.seller.session.token, saleMail.mailId],
    operation,
  );
  assert.equal(first.ok, true, JSON.stringify(first));
  const replay = await retryNode.invokeDurable(
    "claimMailAttachments",
    [scenario.seller.session.token, saleMail.mailId],
    operation,
  );
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(retrySaves, 0);

  const finalSnapshot = backing.load();
  const initialSeller = profileForAccount(ready, scenario.seller.account.accountId);
  const finalSeller = profileForAccount(finalSnapshot, scenario.seller.account.accountId);
  assert.equal(finalSeller.profile.stoneCoins, initialSeller.profile.stoneCoins + 19);
  assert.equal(Object.hasOwn(finalSnapshot.mailMessages, saleMail.mailId), false);
  assert.equal(Object.hasOwn(finalSnapshot.mutationReceipts, operation.operationId), true);
});

test("an exact receipt read failure stops market mutation before stale validation or save", async () => {
  const scenario = seedMarketScenario();
  let saveCalls = 0;
  const node = createReadThroughNode(scenario.backing, scenario.afterListing, {
    receiptReadError: new Error("receipt database unavailable"),
    onSave() {
      saveCalls += 1;
    },
  });
  await assert.rejects(
    node.invokeDurable(
      "buyMarketListing",
      [scenario.buyer.session.token, {listingId: scenario.listingId}],
      {
        operationId: "op_cross_node_receipt_failure_0001",
        requestHash: "4".repeat(64),
        actionId: "POST /market/buy",
      },
    ),
    (error) => error && error.code === "storage_read_failed",
  );
  assert.equal(saveCalls, 0);
  assert.equal(Object.hasOwn(scenario.backing.load().marketListings, scenario.listingId), true);
});

test("marking mail read cannot resurrect attachments claimed on another Node", async () => {
  const scenario = seedMarketScenario();
  const seed = createAuthService({store: createMemoryAuthStore(scenario.afterListing)});
  const bought = seed.buyMarketListing(scenario.buyer.session.token, {
    listingId: scenario.listingId,
  });
  assert.equal(bought.ok, true, JSON.stringify(bought));
  const staleSnapshot = seed.snapshot();
  const saleMail = Object.values(staleSnapshot.mailMessages).find((mail) => (
    mail.recipientAccountId === scenario.seller.account.accountId
    && mail.title === "拍卖行成交通知"
  ));
  assert.ok(saleMail);

  const backing = createMemoryAuthStore(staleSnapshot);
  const remote = createAuthService({store: backing});
  const claimed = remote.claimMailAttachments(
    scenario.seller.session.token,
    saleMail.mailId,
  );
  assert.equal(claimed.ok, true, JSON.stringify(claimed));
  const afterClaim = backing.load();
  const sellerCoinsAfterClaim = profileForAccount(
    afterClaim,
    scenario.seller.account.accountId,
  ).profile.stoneCoins;
  let saveCalls = 0;
  const staleNode = createReadThroughNode(backing, staleSnapshot, {
    allowLegacy: true,
    onSave() {
      saveCalls += 1;
    },
  });

  const marked = await staleNode.invokeDurable(
    "markMailRead",
    [scenario.seller.session.token, saleMail.mailId],
    {},
  );
  assert.equal(marked.ok, false, JSON.stringify(marked));
  assert.equal(marked.code, "mail_missing");
  assert.equal(saveCalls, 0);
  const finalSnapshot = backing.load();
  assert.equal(Object.hasOwn(finalSnapshot.mailMessages, saleMail.mailId), false);
  assert.equal(
    profileForAccount(finalSnapshot, scenario.seller.account.accountId).profile.stoneCoins,
    sellerCoinsAfterClaim,
  );
});

test("marking mail read preserves the latest partially claimed attachment state", async () => {
  const scenario = seedMarketScenario();
  const seed = createAuthService({store: createMemoryAuthStore(scenario.afterListing)});
  const bought = seed.buyMarketListing(scenario.buyer.session.token, {
    listingId: scenario.listingId,
  });
  assert.equal(bought.ok, true, JSON.stringify(bought));
  const staleSnapshot = seed.snapshot();
  const saleMail = Object.values(staleSnapshot.mailMessages).find((mail) => (
    mail.recipientAccountId === scenario.seller.account.accountId
    && mail.title === "拍卖行成交通知"
  ));
  assert.ok(saleMail);
  staleSnapshot.mailMessages[saleMail.mailId].items = [
    {itemId: "item_meat_small", count: 2},
  ];
  const freshSnapshot = cloneAuthorityRoot(staleSnapshot);
  freshSnapshot.mailMessages[saleMail.mailId].currency = {};
  freshSnapshot.mailMessages[saleMail.mailId].items = [
    {itemId: "item_meat_small", count: 1},
  ];
  const backing = createMemoryAuthStore(freshSnapshot);
  const staleNode = createReadThroughNode(backing, staleSnapshot, {allowLegacy: true});

  const marked = await staleNode.invokeDurable(
    "markMailRead",
    [scenario.seller.session.token, saleMail.mailId],
    {},
  );
  assert.equal(marked.ok, true, JSON.stringify(marked));
  const stored = backing.load().mailMessages[saleMail.mailId];
  assert.deepEqual(stored.currency, {});
  assert.deepEqual(stored.items, [{itemId: "item_meat_small", count: 1}]);
  assert.notEqual(stored.readAt, null);
});

test("read-through preserves no-receipt ordinary cancel on the certified legacy fallback", async () => {
  const scenario = seedMarketScenario();
  let savedOptions = null;
  const sellerNode = createReadThroughNode(
    scenario.backing,
    scenario.beforeListing,
    {
      allowLegacy: true,
      onSave(options) {
        savedOptions = options;
      },
    },
  );

  const cancelled = await sellerNode.invokeDurable(
    "cancelMarketListing",
    [scenario.seller.session.token, {listingId: scenario.listingId}],
    {},
  );
  assert.equal(cancelled.ok, true, JSON.stringify(cancelled));
  assert.equal(savedOptions && savedOptions.consistencyScope, undefined);
  assert.equal(Object.hasOwn(scenario.backing.load().marketListings, scenario.listingId), false);
});

test("read-through keeps equipment market cancel on the legacy asset path", async () => {
  const seed = createAuthService({store: createMemoryAuthStore()});
  const seller = seed.register({
    username: "sharedreadequipment",
    password: "test1234",
    displayName: "装备读穿卖家",
  });
  assert.equal(seller.ok, true);
  seedBackpackEquipment(seed, seller.session.token);
  const beforeListing = seed.snapshot();
  const created = seed.createMarketListing(seller.session.token, {
    itemId: "weapon_wooden_club",
    count: 1,
    instanceId: "equip_shared_read_legacy_1",
    sourceSlotIndex: 0,
    unitPrice: 30,
    currency: "diamonds",
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  const envelopeId = created.listing.equipmentEnvelope.envelopeId;
  const backing = createMemoryAuthStore(seed.snapshot());
  let savedOptions = null;
  const sellerNode = createReadThroughNode(backing, beforeListing, {
    allowLegacy: true,
    onSave(options) {
      savedOptions = options;
    },
  });

  const cancelled = await sellerNode.invokeDurable(
    "cancelMarketListing",
    [seller.session.token, {listingId: created.listing.listingId}],
    {
      operationId: "op_shared_read_equipment_cancel_0001",
      requestHash: "e".repeat(64),
      actionId: "POST /market/cancel",
    },
  );
  assert.equal(cancelled.ok, true, JSON.stringify(cancelled));
  assert.equal(savedOptions && savedOptions.consistencyScope, undefined);
  const finalSnapshot = backing.load();
  assert.equal(Object.hasOwn(finalSnapshot.marketListings, created.listing.listingId), false);
  assert.equal(Object.hasOwn(finalSnapshot.consumedEquipmentEnvelopes, envelopeId), true);
  assert.equal(
    backpackItemCount(profileForAccount(finalSnapshot, seller.account.accountId), "weapon_wooden_club"),
    1,
  );
});

test("read-through keeps the tutorial bot purchase on its legacy lesson path", async () => {
  const seed = createAuthService({store: createMemoryAuthStore()});
  const player = seed.register({
    username: "sharedreadtutorial",
    password: "test1234",
    displayName: "读穿交易学员",
  });
  assert.equal(player.ok, true);
  const current = seed.getProfile(player.session.token);
  const profile = current.profile;
  profile.stoneCoins = 10;
  profile.backpackSlots = [{itemId: "tutorial_worn_hide", count: 1}];
  profile.activeQuestId = "quest_market_sell_player";
  profile.questStates = {
    quest_market_sell_player: {
      questId: "quest_market_sell_player",
      status: "active",
      progress: 0,
    },
  };
  assert.equal(seed.saveProfile(player.session.token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile,
  }).ok, true);
  const sold = seed.createMarketListing(player.session.token, {
    itemId: "tutorial_worn_hide",
    count: 1,
    unitPrice: 7,
    currency: "stoneCoins",
  });
  assert.equal(sold.ok, true, JSON.stringify(sold));
  const inbox = seed.listInbox(player.session.token);
  const claimed = seed.claimMailAttachments(player.session.token, inbox.messages[0].mailId);
  assert.equal(claimed.ok, true, JSON.stringify(claimed));
  const botListing = seed.marketListings(player.session.token).market.listings[0];
  const readySnapshot = seed.snapshot();
  const backing = createMemoryAuthStore(readySnapshot);
  let savedOptions = null;
  const playerNode = createReadThroughNode(backing, readySnapshot, {
    allowLegacy: true,
    onSave(options) {
      savedOptions = options;
    },
  });

  const bought = await playerNode.invokeDurable(
    "buyMarketListing",
    [player.session.token, {listingId: botListing.listingId}],
    {
      operationId: "op_shared_read_tutorial_buy_0001",
      requestHash: "f".repeat(64),
      actionId: "POST /market/buy",
    },
  );
  assert.equal(bought.ok, true, JSON.stringify(bought));
  assert.equal(savedOptions && savedOptions.consistencyScope, undefined);
  assert.equal(bought.profile.activeQuestId, "quest_buy_spirit_armor");
  assert.equal(
    backpackItemCount(profileForAccount(backing.load(), player.account.accountId), "item_meat_small"),
    1,
  );
});

test("read-through failure closes with storage_read_failed and never falls back to stale data", async () => {
  const scenario = seedMarketScenario();
  const underlying = {
    mode: "shared-read-failure-test",
    load: () => cloneAuthorityRoot(scenario.beforeListing),
    async readSharedAssetView() {
      throw new Error("database unavailable");
    },
    async saveAsyncOwned() {
      assert.fail("read failure must not write");
    },
  };
  const service = createAuthService({
    store: createAsyncWriteAuthStore(underlying, {onError() {}}),
  });
  await assert.rejects(
    service._httpInvokeSharedAssetRead("marketListings", [scenario.buyer.session.token, {}]),
    (error) => error && error.code === "storage_read_failed",
  );
  assert.equal(service.marketListings(scenario.buyer.session.token).market.listings.length, 0);
});

test("global revision drift reloads the full authority before retrying the scoped read", async () => {
  const scenario = seedMarketScenario();
  const fresh = scenario.backing.load();
  let loadCalls = 0;
  let readCalls = 0;
  const underlying = {
    mode: "shared-read-revision-refresh-test",
    load() {
      loadCalls += 1;
      return cloneAuthorityRoot(loadCalls === 1 ? scenario.beforeListing : fresh);
    },
    async readSharedAssetView(request) {
      readCalls += 1;
      if (readCalls === 1) {
        const error = new Error("global revision changed");
        error.code = "mysql_shared_asset_full_reload_required";
        throw error;
      }
      return sharedView(fresh, request);
    },
    async saveAsyncOwned() {
      assert.fail("read-only revision refresh must not write");
    },
  };
  const service = createAuthService({
    store: createAsyncWriteAuthStore(underlying, {onError() {}}),
  });

  const result = await service._httpInvokeSharedAssetRead(
    "marketListings",
    [scenario.buyer.session.token, {}],
  );
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.market.listings.map((listing) => listing.listingId), [scenario.listingId]);
  assert.equal(loadCalls, 2);
  assert.equal(readCalls, 2);
});

test("global revision reload cannot keep using a remotely revoked session", async () => {
  const scenario = seedMarketScenario();
  const revoked = scenario.backing.load();
  delete revoked.sessions[scenario.buyer.session.sessionId];
  let loadCalls = 0;
  let readCalls = 0;
  const underlying = {
    mode: "shared-read-revoked-session-test",
    load() {
      loadCalls += 1;
      return cloneAuthorityRoot(loadCalls === 1 ? scenario.beforeListing : revoked);
    },
    async readSharedAssetView() {
      readCalls += 1;
      const error = new Error("global revision changed");
      error.code = "mysql_shared_asset_full_reload_required";
      throw error;
    },
    async saveAsyncOwned() {
      assert.fail("revoked session must not write");
    },
  };
  const service = createAuthService({
    store: createAsyncWriteAuthStore(underlying, {onError() {}}),
  });

  const result = await service._httpInvokeSharedAssetRead(
    "marketListings",
    [scenario.buyer.session.token, {}],
  );
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(loadCalls, 2);
  assert.equal(readCalls, 1);
});
