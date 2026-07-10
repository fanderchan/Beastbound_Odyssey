"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
  profileItemCount,
} = require("../test-support/auth-service-test-context");

function seedBackpack(service, token, slots) {
  const current = service.getProfile(token);
  assert.equal(current.ok, true);
  const profile = current.profile;
  profile.backpackSlots = slots;
  const saved = service.saveProfile(token, {
    "expectedRevision": current.profileSummary.profileRevision,
    profile,
  });
  assert.equal(saved.ok, true);
}

function seedDiamonds(service, token, diamonds) {
  const current = service.getProfile(token);
  assert.equal(current.ok, true);
  const profile = current.profile;
  profile.diamonds = Math.max(0, Math.trunc(Number(diamonds || 0)));
  const saved = service.saveProfile(token, {
    "expectedRevision": current.profileSummary.profileRevision,
    profile,
  });
  assert.equal(saved.ok, true);
}

test("bank deposit and withdraw move server-owned coins and items", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const account = service.register({"username": "bankuser", "password": "test1234", "displayName": "银行号"});
  seedBackpack(service, account.session.token, [{"itemId": "item_meat_small", "count": 6}]);

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

test("bank item slots preserve stacks and enforce unlocked pages", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const account = service.register({"username": "bankslotuser", "password": "test1234", "displayName": "银行格子号"});
  const token = account.session.token;
  const current = service.getProfile(token);
  assert.equal(current.ok, true);
  const profile = current.profile;
  profile.backpackSlots = [
    {"itemId": "item_meat_small", "count": 20},
    {"itemId": "item_meat_small", "count": 7},
    ...Array.from({"length": 13}, () => ({})),
  ];
  profile.bank = {
    "stoneCoins": 0,
    "items": [],
    "slots": Array.from({"length": 90}, () => ({})),
    "unlockedTabs": 1,
    "schemaVersion": 1,
  };
  assert.equal(service.saveProfile(token, {"expectedRevision": current.profileSummary.profileRevision, profile}).ok, true);

  const firstDeposit = service.bankDeposit(token, {
    "items": [{"itemId": "item_meat_small", "count": 7, "sourceSlotIndex": 1, "bankSlotIndex": 0}],
  });
  assert.equal(firstDeposit.ok, true);
  assert.deepEqual(firstDeposit.profile.backpackSlots[1], {});
  assert.deepEqual(firstDeposit.bank.slots[0], {"itemId": "item_meat_small", "count": 7});

  const mergeDeposit = service.bankDeposit(token, {
    "items": [{"itemId": "item_meat_small", "count": 20, "sourceSlotIndex": 0, "bankSlotIndex": 0}],
  });
  assert.equal(mergeDeposit.ok, true);
  assert.deepEqual(mergeDeposit.profile.backpackSlots[0], {});
  assert.deepEqual(mergeDeposit.bank.slots[0], {"itemId": "item_meat_small", "count": 27});

  const withdraw = service.bankWithdraw(token, {
    "items": [{"itemId": "item_meat_small", "count": 5, "bankSlotIndex": 0}],
  });
  assert.equal(withdraw.ok, true);
  assert.deepEqual(withdraw.bank.slots[0], {"itemId": "item_meat_small", "count": 22});
  assert.equal(profileItemCount(withdraw.profile, "item_meat_small"), 5);

  const refill = service.bankDeposit(token, {
    "items": [{"itemId": "item_meat_small", "count": 1, "sourceSlotIndex": 0, "bankSlotIndex": 20}],
  });
  assert.equal(refill.ok, false);
  assert.equal(refill.code, "bank_storage_full");
});

test("bound items stay usable in account storage but cannot enter player markets or trades", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const owner = service.register({"username": "bound_owner", "password": "test1234", "displayName": "绑定甲"});
  const other = service.register({"username": "bound_other", "password": "test1234", "displayName": "绑定乙"});
  seedBackpack(service, owner.session.token, [{"itemId": "novice_battle_pet_egg", "count": 1}]);

  const deposit = service.bankDeposit(owner.session.token, {
    "items": [{"itemId": "novice_battle_pet_egg", "count": 1}],
  });
  assert.equal(deposit.ok, true);
  assert.equal(profileItemCount(deposit.profile, "novice_battle_pet_egg"), 0);

  const withdraw = service.bankWithdraw(owner.session.token, {
    "items": [{"itemId": "novice_battle_pet_egg", "count": 1}],
  });
  assert.equal(withdraw.ok, true);
  assert.equal(profileItemCount(withdraw.profile, "novice_battle_pet_egg"), 1);

  const listing = service.createMarketListing(owner.session.token, {
    "itemId": "novice_battle_pet_egg",
    "count": 1,
    "unitPrice": 1,
    "currency": "stoneCoins",
  });
  assert.equal(listing.ok, false);
  assert.equal(listing.code, "market_item_bound");

  assert.equal(service.updatePlayerPosition(owner.session.token, {"mapId": "firebud_training_yard", "cellX": 10, "cellY": 10, "facing": "east", "moving": false}).ok, true);
  assert.equal(service.updatePlayerPosition(other.session.token, {"mapId": "firebud_training_yard", "cellX": 11, "cellY": 10, "facing": "west", "moving": false}).ok, true);
  const trade = service.proposeTrade(owner.session.token, {
    "targetUsername": "bound_other",
    "items": [{"itemId": "novice_battle_pet_egg", "count": 1}],
  });
  assert.equal(trade.ok, false);
  assert.equal(trade.code, "trade_item_bound");
  assert.equal(profileItemCount(service.getProfile(owner.session.token).profile, "novice_battle_pet_egg"), 1);
});

test("bank enforces wallet and bank stone coin caps", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const account = service.register({"username": "bankcapuser", "password": "test1234", "displayName": "银行上限号"});
  const token = account.session.token;

  const current = service.getProfile(token);
  assert.equal(current.ok, true);
  const profile = current.profile;
  profile.stoneCoins = 10000000;
  profile.bank = {"stoneCoins": 100000000, "items": [], "schemaVersion": 1};
  const saved = service.saveProfile(token, {"expectedRevision": current.profileSummary.profileRevision, profile});
  assert.equal(saved.ok, true);

  const bankFull = service.bankDeposit(token, {"stoneCoins": 1});
  assert.equal(bankFull.ok, false);
  assert.equal(bankFull.code, "bank_stone_coin_limit");

  const afterFull = service.getProfile(token);
  afterFull.profile.stoneCoins = 9999999;
  afterFull.profile.bank = {"stoneCoins": 10, "items": [], "schemaVersion": 1};
  const savedWithdrawCase = service.saveProfile(token, {
    "expectedRevision": afterFull.profileSummary.profileRevision,
    "profile": afterFull.profile,
  });
  assert.equal(savedWithdrawCase.ok, true);

  const walletFull = service.bankWithdraw(token, {"stoneCoins": 2});
  assert.equal(walletFull.ok, false);
  assert.equal(walletFull.code, "wallet_stone_coin_limit");
});

test("market listings sell through with default tax", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const seller = service.register({"username": "market_seller", "password": "test1234", "displayName": "卖家"});
  const buyer = service.register({"username": "market_buyer", "password": "test1234", "displayName": "买家"});
  seedBackpack(service, seller.session.token, [{"itemId": "item_meat_small", "count": 6}]);

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
  assert.equal(profileItemCount(bought.profile, "item_meat_small"), 2);

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
  seedBackpack(seedService, seller.session.token, [{"itemId": "capture_rope_basic", "count": 5}]);
  seedDiamonds(seedService, buyer.session.token, 100);
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

test("tutorial sell, mailbox claim, and private bot purchase form one safe market lesson", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const player = service.register({"username": "market_tutorial", "password": "test1234", "displayName": "交易学员"});
  const current = service.getProfile(player.session.token);
  const profile = current.profile;
  profile.stoneCoins = 10;
  profile.backpackSlots = [{"itemId": "tutorial_worn_hide", "count": 1}];
  profile.activeQuestId = "quest_market_sell_player";
  profile.questStates = {"quest_market_sell_player": {"questId": "quest_market_sell_player", "status": "active", "progress": 0}};
  assert.equal(service.saveProfile(player.session.token, {"expectedRevision": current.profileSummary.profileRevision, profile}).ok, true);

  const sold = service.createMarketListing(player.session.token, {
    "itemId": "tutorial_worn_hide",
    "count": 1,
    "unitPrice": 7,
    "currency": "stoneCoins",
  });
  assert.equal(sold.ok, true);
  assert.equal(sold.saleMail.mailKind, "tutorial_market_sale");
  assert.equal(sold.profile.activeQuestId, "quest_claim_market_mail");
  assert.equal(sold.market.listings.length, 0);
  assert.equal(service.snapshot().marketListings[sold.listing.listingId], undefined);

  const inbox = service.listInbox(player.session.token);
  assert.equal(inbox.messages.length, 1);
  assert.equal(inbox.messages[0].mailKind, "tutorial_market_sale");
  assert.equal(inbox.messages[0].currency.stoneCoins, 7);
  const claimed = service.claimMailAttachments(player.session.token, inbox.messages[0].mailId);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.profile.activeQuestId, "quest_market_buy_player");
  assert.equal(claimed.profile.stoneCoins, 27);

  const state = service.marketListings(player.session.token);
  assert.equal(state.market.listings.length, 1);
  const botListing = state.market.listings[0];
  assert.equal(botListing.sellerKind, "tutorial_bot");
  assert.equal(botListing.sellerDisplayName, "新手交易指导员");
  assert.equal(botListing.totalPrice, 1);
  const bought = service.buyMarketListing(player.session.token, {"listingId": botListing.listingId});
  assert.equal(bought.ok, true);
  assert.equal(bought.profile.activeQuestId, "quest_buy_spirit_armor");
  assert.equal(bought.profile.stoneCoins, 36);
  assert.equal(profileItemCount(bought.profile, "item_meat_small"), 1);
  assert.equal(service.marketListings(player.session.token).market.listings.length, 0);
  const replay = service.buyMarketListing(player.session.token, {"listingId": botListing.listingId});
  assert.equal(replay.ok, false);
  assert.equal(replay.code, "market_listing_missing");
});

test("tutorial buyer ignores oversized or overpriced listings", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const player = service.register({"username": "markettutorialguard", "password": "test1234", "displayName": "交易防线"});
  const current = service.getProfile(player.session.token);
  const profile = current.profile;
  profile.backpackSlots = [{"itemId": "tutorial_worn_hide", "count": 2}];
  profile.activeQuestId = "quest_market_sell_player";
  profile.questStates = {"quest_market_sell_player": {"questId": "quest_market_sell_player", "status": "active", "progress": 0}};
  assert.equal(service.saveProfile(player.session.token, {"expectedRevision": current.profileSummary.profileRevision, profile}).ok, true);

  const oversized = service.createMarketListing(player.session.token, {
    "itemId": "tutorial_worn_hide",
    "count": 2,
    "unitPrice": 20,
    "currency": "stoneCoins",
  });
  assert.equal(oversized.ok, true);
  assert.equal(oversized.saleMail, null);
  assert.equal(oversized.profile.activeQuestId, "quest_market_sell_player");
  assert.equal(oversized.market.mine.length, 1);
  assert.equal(service.listInbox(player.session.token).messages.length, 0);
});

test("selling tutorial junk to the shop teaches the direct-sale path", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const player = service.register({"username": "shop_sell_tutorial", "password": "test1234", "displayName": "商店学员"});
  const current = service.getProfile(player.session.token);
  const profile = current.profile;
  profile.stoneCoins = 0;
  profile.backpackSlots = [{"itemId": "tutorial_worn_hide", "count": 2}];
  profile.activeQuestId = "quest_sell_to_shop";
  profile.questStates = {"quest_sell_to_shop": {"questId": "quest_sell_to_shop", "status": "active", "progress": 0}};
  assert.equal(service.saveProfile(player.session.token, {"expectedRevision": current.profileSummary.profileRevision, profile}).ok, true);

  const sold = service.shopTransaction(player.session.token, {
    "mode": "sell",
    "shopId": "firebud_item_shop",
    "itemId": "tutorial_worn_hide",
    "amount": 1,
  });
  assert.equal(sold.ok, true);
  assert.equal(sold.profile.activeQuestId, "quest_buy_weapon");
  assert.equal(profileItemCount(sold.profile, "tutorial_worn_hide"), 1);
  assert.equal(sold.profile.stoneCoins, 8);
  assert.equal(sold.questMessages.length > 0, true);
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
  seedBackpack(service, alpha.session.token, [{"itemId": "item_meat_small", "count": 1}]);

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
  seedBackpack(service, alpha.session.token, [
    {"itemId": "item_meat_small", "count": 6},
    {"itemId": "capture_rope_basic", "count": 5},
  ]);
  seedBackpack(service, beta.session.token, [
    {"itemId": "item_meat_small", "count": 6},
    {"itemId": "capture_rope_basic", "count": 5},
  ]);

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
