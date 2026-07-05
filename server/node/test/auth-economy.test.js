"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
  profileItemCount,
} = require("../test-support/auth-service-test-context");

test("bank deposit and withdraw move server-owned coins and items", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const account = service.register({"username": "bankuser", "password": "test1234", "displayName": "仓库号"});

  const deposit = service.bankDeposit(account.session.token, {
    "stoneCoins": 40,
    "items": [{"itemId": "item_meat_small", "count": 2}],
  });
  assert.equal(deposit.ok, true);
  assert.equal(deposit.profile.stoneCoins, 80);
  assert.equal(deposit.bank.stoneCoins, 40);
  assert.equal(profileItemCount(deposit.profile, "item_meat_small"), 4);
  assert.equal(deposit.bank.items.find((item) => item.itemId === "item_meat_small").count, 2);

  const withdraw = service.bankWithdraw(account.session.token, {
    "stoneCoins": 15,
    "items": [{"itemId": "item_meat_small", "count": 1}],
  });
  assert.equal(withdraw.ok, true);
  assert.equal(withdraw.profile.stoneCoins, 95);
  assert.equal(withdraw.bank.stoneCoins, 25);
  assert.equal(profileItemCount(withdraw.profile, "item_meat_small"), 5);
  assert.equal(withdraw.bank.items.find((item) => item.itemId === "item_meat_small").count, 1);

  const overdraft = service.bankWithdraw(account.session.token, {"stoneCoins": 99});
  assert.equal(overdraft.ok, false);
  assert.equal(overdraft.code, "bank_stone_coins_not_enough");
});

test("market listings sell through with default tax", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const seller = service.register({"username": "market_seller", "password": "test1234", "displayName": "卖家"});
  const buyer = service.register({"username": "market_buyer", "password": "test1234", "displayName": "买家"});

  const listing = service.createMarketListing(seller.session.token, {
    "itemId": "item_meat_small",
    "count": 2,
    "unitPrice": 20,
    "currency": "stoneCoins",
  });
  assert.equal(listing.ok, true);
  assert.equal(listing.listing.totalPrice, 40);
  assert.equal(listing.listing.estimatedTax, 1);
  assert.equal(listing.listing.sellerReceives, 39);
  assert.equal(profileItemCount(listing.profile, "item_meat_small"), 4);

  const state = service.marketListings(buyer.session.token);
  assert.equal(state.ok, true);
  assert.equal(state.market.listings.length, 1);
  assert.equal(state.market.config.defaultTaxBps, 100);

  const bought = service.buyMarketListing(buyer.session.token, {"listingId": listing.listing.listingId});
  assert.equal(bought.ok, true);
  assert.equal(bought.receipt.tax, 1);
  assert.equal(bought.profile.stoneCoins, 80);
  assert.equal(profileItemCount(bought.profile, "item_meat_small"), 8);

  const sellerAfter = service.getProfile(seller.session.token);
  assert.equal(sellerAfter.ok, true);
  assert.equal(sellerAfter.profile.stoneCoins, 120);
  assert.equal(profileItemCount(sellerAfter.profile, "item_meat_small"), 4);
  assert.equal(service.marketListings(buyer.session.token).market.listings.length, 0);
  assert.equal(service.snapshot().marketConfig.taxCollected.stoneCoins, 1);

  const sellerInbox = service.listInbox(seller.session.token);
  assert.equal(sellerInbox.ok, true);
  const saleMail = sellerInbox.messages.find((mail) => mail.title === "拍卖行成交通知");
  assert.ok(saleMail);
  assert.equal(saleMail.senderDisplayName, "拍卖行");
  assert.equal(saleMail.currency.stoneCoins, 39);
  assert.equal(saleMail.body.includes("成交金额：40石币"), true);
  assert.equal(saleMail.body.includes("交易税：1石币"), true);
  assert.equal(saleMail.body.includes("实收：39石币"), true);
  assert.equal(saleMail.body.includes("market_buyer"), false);
  assert.equal(saleMail.body.includes("买家"), false);

  const claimed = service.claimMailAttachments(seller.session.token, saleMail.mailId);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.claim.currency.stoneCoins, 39);
  assert.equal(claimed.profile.stoneCoins, 159);
  assert.equal(claimed.mail, null);
});

test("market listings support item tax overrides and cancellation", () => {
  const seedService = createAuthService({"store": createMemoryAuthStore()});
  const seller = seedService.register({"username": "market_tax_seller", "password": "test1234", "displayName": "税率卖家"});
  const buyer = seedService.register({"username": "market_tax_buyer", "password": "test1234", "displayName": "税率买家"});
  const seed = seedService.snapshot();
  seed.marketConfig = {
    "defaultTaxBps": 100,
    "itemTaxBps": {"capture_rope_basic": 500},
    "taxCollected": {},
  };
  const service = createAuthService({"store": createMemoryAuthStore(seed)});

  const listing = service.createMarketListing(seller.session.token, {
    "itemId": "capture_rope_basic",
    "count": 1,
    "unitPrice": 20,
    "currency": "diamonds",
  });
  assert.equal(listing.ok, true);
  assert.equal(listing.listing.taxBps, 500);
  assert.equal(listing.listing.estimatedTax, 1);

  const cancelled = service.cancelMarketListing(seller.session.token, {"listingId": listing.listing.listingId});
  assert.equal(cancelled.ok, true);
  assert.equal(profileItemCount(cancelled.profile, "capture_rope_basic"), 5);

  const relisted = service.createMarketListing(seller.session.token, {
    "itemId": "capture_rope_basic",
    "count": 1,
    "unitPrice": 20,
    "currency": "diamonds",
  });
  assert.equal(relisted.ok, true);
  const bought = service.buyMarketListing(buyer.session.token, {"listingId": relisted.listing.listingId});
  assert.equal(bought.ok, true);
  assert.equal(bought.receipt.currency, "diamonds");
  assert.equal(bought.receipt.tax, 1);
  assert.equal(service.snapshot().marketConfig.taxCollected.diamonds, 1);
});

test("market tax config requires GM command grant", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const gm = service.register({"username": "market_gm", "password": "test1234", "displayName": "税务员"});

  const playerDenied = service.updateMarketConfig(gm.session.token, {
    "defaultTaxBps": 250,
  });
  assert.equal(playerDenied.ok, false);
  assert.equal(playerDenied.code, "gm_denied");

  const grant = service.grantGm({
    "username": "market_gm",
    "commandIds": ["gm_market_tax"],
    "grantedBy": "unit_test",
  });
  assert.equal(grant.ok, true);

  const updated = service.updateMarketConfig(gm.session.token, {
    "defaultTaxBps": 250,
    "itemTaxBps": {
      "item_meat_small": 750,
      "capture_rope_basic": -10,
    },
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.marketConfig.defaultTaxBps, 250);
  assert.equal(updated.marketConfig.itemTaxBps.item_meat_small, 750);
  assert.equal(updated.marketConfig.itemTaxBps.capture_rope_basic, 0);

  const read = service.getMarketConfig(gm.session.token);
  assert.equal(read.ok, true);
  assert.equal(read.marketConfig.defaultTaxBps, 250);
  assert.equal(read.marketConfig.itemTaxBps.item_meat_small, 750);
});

test("trade requires nearby settled server positions", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const alpha = service.register({"username": "tradefar_a", "password": "test1234", "displayName": "远甲"});
  const beta = service.register({"username": "tradefar_b", "password": "test1234", "displayName": "远乙"});

  assert.equal(service.updatePlayerPosition(alpha.session.token, {"mapId": "firebud_training_yard", "cellX": 2, "cellY": 2, "facing": "east", "moving": false}).ok, true);
  assert.equal(service.updatePlayerPosition(beta.session.token, {"mapId": "firebud_training_yard", "cellX": 8, "cellY": 8, "facing": "west", "moving": false}).ok, true);

  const proposal = service.proposeTrade(alpha.session.token, {
    "targetUsername": "tradefar_b",
    "items": [{"itemId": "item_meat_small", "count": 1}],
  });
  assert.equal(proposal.ok, false);
  assert.equal(proposal.code, "trade_distance_too_far");
});

test("trade accept atomically exchanges both player offers", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const alpha = service.register({"username": "tradeok_a", "password": "test1234", "displayName": "交易甲"});
  const beta = service.register({"username": "tradeok_b", "password": "test1234", "displayName": "交易乙"});

  assert.equal(service.updatePlayerPosition(alpha.session.token, {"mapId": "firebud_training_yard", "cellX": 10, "cellY": 10, "facing": "east", "moving": false}).ok, true);
  assert.equal(service.updatePlayerPosition(beta.session.token, {"mapId": "firebud_training_yard", "cellX": 11, "cellY": 10, "facing": "west", "moving": false}).ok, true);

  const proposal = service.proposeTrade(alpha.session.token, {
    "targetUsername": "tradeok_b",
    "stoneCoins": 30,
    "items": [{"itemId": "item_meat_small", "count": 2}],
  });
  assert.equal(proposal.ok, true);
  assert.equal(proposal.trade.offerStoneCoins, 30);

  const betaState = service.tradeState(beta.session.token);
  assert.equal(betaState.ok, true);
  assert.equal(betaState.trades.received.length, 1);
  assert.equal(betaState.trades.received[0].tradeId, proposal.trade.tradeId);
  assert.equal(betaState.trades.received[0].fromUsername, "tradeok_a");

  const accepted = service.acceptTrade(beta.session.token, {
    "tradeId": proposal.trade.tradeId,
    "stoneCoins": 10,
    "items": [{"itemId": "capture_rope_basic", "count": 1}],
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.profile.stoneCoins, 140);
  assert.equal(profileItemCount(accepted.profile, "item_meat_small"), 8);
  assert.equal(profileItemCount(accepted.profile, "capture_rope_basic"), 4);

  const alphaAfter = service.getProfile(alpha.session.token);
  assert.equal(alphaAfter.ok, true);
  assert.equal(alphaAfter.profile.stoneCoins, 100);
  assert.equal(profileItemCount(alphaAfter.profile, "item_meat_small"), 4);
  assert.equal(profileItemCount(alphaAfter.profile, "capture_rope_basic"), 6);

  const duplicate = service.acceptTrade(beta.session.token, {"tradeId": proposal.trade.tradeId});
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "trade_offer_missing");
});
