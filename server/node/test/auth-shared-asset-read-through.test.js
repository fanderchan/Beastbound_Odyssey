"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

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
  const marketListings = request.scope.startsWith("market_")
    ? canonicalMap(snapshot.marketListings)
    : null;
  if (marketListings) {
    for (const listing of Object.values(marketListings)) {
      accountIds.add(listing.sellerAccountId);
    }
  }
  const profileAccountIds = new Set([request.accountId]);
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
  const mailPartitions = request.scope.startsWith("mail_") ? [{
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
  if (scope.kind === "row_local_market_buy_v1") {
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
  const underlying = {
    mode: "shared-read-test",
    load() {
      return cloneAuthorityRoot(nodeBaseline);
    },
    async readSharedAssetView(request, options = {}) {
      const view = sharedView(backing.load(), request);
      if (options.adopt === true) {
        nodeBaseline = applySharedAssetReadView(nodeBaseline, view);
      }
      return view;
    },
    async saveAsyncOwned(nextData, saveOptions = {}) {
      if (typeof options.onSave === "function") {
        options.onSave(saveOptions);
      }
      if (!saveOptions.consistencyScope && options.allowLegacy === true) {
        backing.save(nextData);
      } else {
        mergeScopedCommit(backing, nextData, saveOptions);
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
