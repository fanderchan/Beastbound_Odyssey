"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
} = require("../test-support/auth-service-test-context");

function updateProfile(service, token, mutate) {
  const current = service.getProfile(token);
  assert.equal(current.ok, true);
  const profile = structuredClone(current.profile);
  mutate(profile);
  const saved = service.saveProfile(token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile,
  });
  assert.equal(saved.ok, true);
  const reloaded = service.getProfile(token);
  assert.equal(reloaded.ok, true);
  assert.equal(reloaded.profileSummary.profileRevision, saved.profileSummary.profileRevision);
  return reloaded;
}

function profileDocument(service, accountId) {
  const snapshot = service.snapshot();
  const binding = snapshot.profileBindings[accountId];
  assert.ok(binding);
  return snapshot.profiles[binding.playerId];
}

test("new profiles persist four balances while legacy profiles publicly gain zero bound balances without mutation", () => {
  const seed = createAuthService({store: createMemoryAuthStore()});
  const account = seed.register({username: "walletlegacy", password: "test1234"});
  assert.equal(account.ok, true);
  const current = seed.getProfile(account.session.token);
  assert.equal(current.profile.stoneCoins, 120);
  assert.equal(current.profile.boundStoneCoins, 0);
  assert.equal(current.profile.diamonds, 0);
  assert.equal(current.profile.boundDiamonds, 0);
  const storedNew = profileDocument(seed, account.account.accountId);
  assert.equal(Object.hasOwn(storedNew.profile, "boundStoneCoins"), true);
  assert.equal(Object.hasOwn(storedNew.profile, "boundDiamonds"), true);

  const legacySnapshot = seed.snapshot();
  const legacyBinding = legacySnapshot.profileBindings[account.account.accountId];
  delete legacySnapshot.profiles[legacyBinding.playerId].profile.boundStoneCoins;
  delete legacySnapshot.profiles[legacyBinding.playerId].profile.boundDiamonds;
  const beforeRevision = legacySnapshot.profileBindings[account.account.accountId].profileRevision;
  const restarted = createAuthService({store: createMemoryAuthStore(legacySnapshot)});
  const projected = restarted.getProfile(account.session.token);

  assert.equal(projected.ok, true);
  assert.equal(projected.profile.stoneCoins, 120);
  assert.equal(projected.profile.boundStoneCoins, 0);
  assert.equal(projected.profile.diamonds, 0);
  assert.equal(projected.profile.boundDiamonds, 0);
  const storedLegacy = profileDocument(restarted, account.account.accountId);
  assert.equal(Object.hasOwn(storedLegacy.profile, "boundStoneCoins"), false);
  assert.equal(Object.hasOwn(storedLegacy.profile, "boundDiamonds"), false);
  assert.equal(storedLegacy.profileRevision, beforeRevision);
});

test("bank, market, trade, and market-sale mail use only unbound balances", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const seller = service.register({username: "walletseller", password: "test1234", displayName: "钱包卖家"});
  const buyer = service.register({username: "walletbuyer", password: "test1234", displayName: "钱包买家"});
  assert.equal(seller.ok, true);
  assert.equal(buyer.ok, true);

  updateProfile(service, seller.session.token, (profile) => {
    profile.boundStoneCoins = 222;
    profile.boundDiamonds = 333;
    profile.backpackSlots = [
      {itemId: "item_meat_small", count: 2},
      ...Array.from({length: 14}, () => ({})),
    ];
  });
  updateProfile(service, buyer.session.token, (profile) => {
    profile.stoneCoins = 0;
    profile.boundStoneCoins = 1000;
    profile.diamonds = 0;
    profile.boundDiamonds = 2000;
  });

  const boundCurrencyListing = service.createMarketListing(seller.session.token, {
    itemId: "item_meat_small",
    count: 1,
    unitPrice: 10,
    currency: "boundDiamonds",
  });
  assert.equal(boundCurrencyListing.ok, false);
  assert.equal(boundCurrencyListing.code, "market_currency_bound");

  const stoneListing = service.createMarketListing(seller.session.token, {
    itemId: "item_meat_small",
    count: 1,
    unitPrice: 10,
    currency: "stoneCoins",
  });
  const diamondListing = service.createMarketListing(seller.session.token, {
    itemId: "item_meat_small",
    count: 1,
    unitPrice: 10,
    currency: "diamonds",
  });
  assert.equal(stoneListing.ok, true);
  assert.equal(diamondListing.ok, true);

  const bankBlocked = service.bankDeposit(buyer.session.token, {stoneCoins: 1});
  assert.equal(bankBlocked.ok, false);
  assert.equal(bankBlocked.code, "bank_stone_coins_not_enough");
  const stoneBlocked = service.buyMarketListing(buyer.session.token, {
    listingId: stoneListing.listing.listingId,
  });
  assert.equal(stoneBlocked.ok, false);
  assert.equal(stoneBlocked.code, "market_not_enough_currency");
  const diamondBlocked = service.buyMarketListing(buyer.session.token, {
    listingId: diamondListing.listing.listingId,
  });
  assert.equal(diamondBlocked.ok, false);
  assert.equal(diamondBlocked.code, "market_not_enough_currency");

  assert.equal(service.updatePlayerPosition(buyer.session.token, {
    mapId: "firebud_training_yard",
    cellX: 10,
    cellY: 10,
    facing: "east",
    moving: false,
  }).ok, true);
  assert.equal(service.updatePlayerPosition(seller.session.token, {
    mapId: "firebud_training_yard",
    cellX: 11,
    cellY: 10,
    facing: "west",
    moving: false,
  }).ok, true);
  const tradeBlocked = service.proposeTrade(buyer.session.token, {
    targetUsername: "walletseller",
    stoneCoins: 1,
  });
  assert.equal(tradeBlocked.ok, false);
  assert.equal(tradeBlocked.code, "trade_stone_coins_not_enough");

  const funded = updateProfile(service, buyer.session.token, (profile) => {
    profile.stoneCoins = 10;
  });
  assert.equal(funded.profile.boundStoneCoins, 1000);
  assert.equal(funded.profile.boundDiamonds, 2000);
  const bought = service.buyMarketListing(buyer.session.token, {
    listingId: stoneListing.listing.listingId,
  });
  assert.equal(bought.ok, true);
  assert.equal(bought.profile.stoneCoins, 0);
  assert.equal(bought.profile.boundStoneCoins, 1000);
  assert.equal(bought.profile.boundDiamonds, 2000);

  const inbox = service.listInbox(seller.session.token);
  assert.equal(inbox.ok, true);
  const saleMail = inbox.messages.find((mail) => mail.title === "拍卖行成交通知");
  assert.ok(saleMail);
  assert.equal(saleMail.currency.stoneCoins, 9);
  assert.equal(Object.hasOwn(saleMail.currency, "boundStoneCoins"), false);
  const claimed = service.claimMailAttachments(seller.session.token, saleMail.mailId);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.profile.stoneCoins, 129);
  assert.equal(claimed.profile.boundStoneCoins, 222);
  assert.equal(claimed.profile.boundDiamonds, 333);

  const buyerAfter = service.getProfile(buyer.session.token);
  assert.equal(buyerAfter.profile.diamonds, 0);
  assert.equal(buyerAfter.profile.boundDiamonds, 2000);
  assert.equal(service.marketListings(buyer.session.token).market.listings.some((listing) => (
    listing.listingId === diamondListing.listing.listingId
  )), true);
});
