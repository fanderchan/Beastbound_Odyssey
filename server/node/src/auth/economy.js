"use strict";

const TRADE_OFFER_TTL_MS = 2 * 60 * 1000;
const TRADE_MAX_DISTANCE_CELLS = 2;
const TRADE_MAX_ITEM_LINES = 8;
const MARKET_MAX_LISTINGS = 120;
const MARKET_MAX_LISTING_COUNT = 999;
const MARKET_MAX_UNIT_PRICE = 999999999;
const MARKET_DEFAULT_TAX_BPS = 100;
const MARKET_CURRENCY_STONE_COINS = "stoneCoins";
const MARKET_CURRENCY_DIAMONDS = "diamonds";
const MARKET_GM_COMMAND_ID = "gm_market_tax";
const BANK_TAB_COUNT = 6;
const BANK_SLOTS_PER_TAB = 15;
const BANK_SLOT_LIMIT = BANK_TAB_COUNT * BANK_SLOTS_PER_TAB;
const BANK_DEFAULT_UNLOCKED_TABS = 1;

function createEconomyDomain(ctx) {
  const {
    accountById,
    addRewardItemsToBackpack,
    authorizeGmCommand,
    bagItemById,
    bagItemLabel,
    bagItemStackLimit,
    backpackItemCount,
    captureToolBagFromProfile,
    clampInt,
    clone,
    consumeBackpackItem,
    fail,
    isoNow,
    itemAmountText,
    load,
    normalizeBackpackSlots,
    normalizeMailItems,
    normalizeUsername,
    now,
    ok,
    persistProfileForAccount,
    playerPositionHasCell,
    bankStoneCoinLimit = 100000000,
    profileBackpackSlots,
    profileBindingForAccount,
    profileCurrencyAmount,
    profileStoneCoinLimit = 10000000,
    profileStoneCoins,
    profileSummaryForAccount,
    publicMail,
    publicAccount,
    publicPlayerPosition,
    randomId,
    resolveSession,
    save,
    setProfileCurrencyAmount,
    shopCurrencyLabel,
  } = ctx;

  function bankDeposit(token, payload = {}) {
    const prepared = prepareSingleProfileMutation(token);
    if (!prepared.ok) {
      return prepared;
    }
    const profile = clone(prepared.profile);
    const items = normalizeBankTransferItems(payload.items || payload.itemAmounts || []);
    const stoneCoins = normalizeCoinAmount(payload.stoneCoins || payload.coins || 0);
    if (stoneCoins <= 0 && items.length <= 0) {
      return fail("bank_deposit_empty", "请选择要存入的石币或物品。", profilePayload(prepared, profile));
    }
    if (stoneCoins > profileStoneCoins(profile)) {
      return fail("bank_stone_coins_not_enough", "石币不足，无法存入。", profilePayload(prepared, profile));
    }
    const bank = normalizeBank(profile.bank);
    if (bank.stoneCoins + stoneCoins > bankStoneCoinLimit) {
      return fail("bank_stone_coin_limit", `银行石币最多存放${bankStoneCoinLimit}。`, profilePayload(prepared, profile, bank));
    }
    let nextSlots = profileBackpackSlots(profile);
    let nextBankSlots = normalizeBankSlots(bank.slots);
    const unlockedBankSlots = bankUnlockedSlotCount(bank);
    for (const item of items) {
      const missing = bankTransferMissingBackpackItem(nextSlots, item);
      if (missing) {
        return fail("bank_item_not_enough", `${missing.label} 数量不够，无法存入。`, profilePayload(prepared, profile, bank));
      }
      const addResult = addItemToBankSlots(nextBankSlots, item.itemId, item.count, unlockedBankSlots, item.bankSlotIndex);
      if (addResult.lostCount > 0) {
        return fail("bank_storage_full", "银行格子不足，请先整理或解锁更多银行页。", profilePayload(prepared, profile, bank));
      }
      nextSlots = consumeBankTransferBackpackItem(nextSlots, item);
      nextBankSlots = addResult.slots;
    }
    profile.backpackSlots = nextSlots;
    profile.captureTools = captureToolBagFromProfile(profile);
    profile.stoneCoins = profileStoneCoins(profile) - stoneCoins;
    bank.stoneCoins += stoneCoins;
    bank.slots = nextBankSlots;
    bank.items = bankItemsFromSlots(nextBankSlots);
    profile.bank = bank;
    const persisted = persistProfileForAccount(prepared.data, prepared.account, prepared.binding, profile, now);
    save(prepared.data);
    return ok({
      account: publicAccount(prepared.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(prepared.account, prepared.data),
      profile: clone(profile),
      bank: clone(bank),
      transaction: publicBankTransaction("deposit", stoneCoins, items),
      message: bankTransactionMessage("存入", stoneCoins, items),
    });
  }

  function bankWithdraw(token, payload = {}) {
    const prepared = prepareSingleProfileMutation(token);
    if (!prepared.ok) {
      return prepared;
    }
    const profile = clone(prepared.profile);
    const items = normalizeBankTransferItems(payload.items || payload.itemAmounts || []);
    const stoneCoins = normalizeCoinAmount(payload.stoneCoins || payload.coins || 0);
    if (stoneCoins <= 0 && items.length <= 0) {
      return fail("bank_withdraw_empty", "请选择要取出的石币或物品。", profilePayload(prepared, profile));
    }
    const bank = normalizeBank(profile.bank);
    if (stoneCoins > bank.stoneCoins) {
      return fail("bank_stone_coins_not_enough", "银行石币不足，无法取出。", profilePayload(prepared, profile, bank));
    }
    if (profileStoneCoins(profile) + stoneCoins > profileStoneCoinLimit) {
      return fail("wallet_stone_coin_limit", `身上石币上限为${profileStoneCoinLimit}，请先存入银行。`, profilePayload(prepared, profile, bank));
    }
    let nextBankSlots = normalizeBankSlots(bank.slots);
    const withdrawItems = [];
    for (const item of items) {
      const missing = bankTransferMissingBankItem(nextBankSlots, item);
      if (missing) {
        return fail("bank_item_not_enough", `${missing.label} 数量不够，无法取出。`, profilePayload(prepared, profile, bank));
      }
      const consumeResult = consumeBankTransferBankItem(nextBankSlots, item);
      nextBankSlots = consumeResult.slots;
      withdrawItems.push({itemId: item.itemId, count: item.count});
    }
    const addResult = addRewardItemsToBackpack(profileBackpackSlots(profile), withdrawItems);
    if (normalizeMailItems(addResult.lostItems || []).length > 0) {
      return fail("bank_backpack_full", "背包空间不足，无法取出这些物品。", profilePayload(prepared, profile, bank));
    }
    profile.backpackSlots = addResult.slots;
    profile.captureTools = captureToolBagFromProfile(profile);
    profile.stoneCoins = profileStoneCoins(profile) + stoneCoins;
    bank.stoneCoins -= stoneCoins;
    bank.slots = nextBankSlots;
    bank.items = bankItemsFromSlots(nextBankSlots);
    profile.bank = bank;
    const persisted = persistProfileForAccount(prepared.data, prepared.account, prepared.binding, profile, now);
    save(prepared.data);
    return ok({
      account: publicAccount(prepared.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(prepared.account, prepared.data),
      profile: clone(profile),
      bank: clone(bank),
      transaction: publicBankTransaction("withdraw", stoneCoins, items),
      message: bankTransactionMessage("取出", stoneCoins, items),
    });
  }

  function marketListings(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    return ok({
      ...marketStatePayload(data, resolved.account, payload),
      message: "交易所已刷新。",
    });
  }

  function getMarketConfig(token) {
    const authorization = authorizeMarketConfigGm(token);
    if (!authorization.ok) {
      return authorization;
    }
    const data = load();
    return ok({
      marketConfig: publicMarketConfig(data),
      message: "交易所税率配置已读取。",
    });
  }

  function updateMarketConfig(token, payload = {}) {
    const authorization = authorizeMarketConfigGm(token);
    if (!authorization.ok) {
      return authorization;
    }
    const data = load();
    const current = normalizeMarketConfig(data.marketConfig);
    const next = {
      defaultTaxBps: Object.prototype.hasOwnProperty.call(payload, "defaultTaxBps")
        ? normalizeTaxBps(payload.defaultTaxBps, current.defaultTaxBps)
        : current.defaultTaxBps,
      itemTaxBps: normalizeMarketItemTaxBps(
        Object.prototype.hasOwnProperty.call(payload, "itemTaxBps") ? payload.itemTaxBps : current.itemTaxBps
      ),
      taxCollected: current.taxCollected,
      schemaVersion: 1,
    };
    data.marketConfig = next;
    save(data);
    return ok({
      marketConfig: publicMarketConfig(data),
      message: "交易所税率配置已更新。",
    });
  }

  function createMarketListing(token, payload = {}) {
    const prepared = prepareSingleProfileMutation(token);
    if (!prepared.ok) {
      return prepared;
    }
    const itemId = String(payload.itemId || payload.item || "").trim();
    const count = normalizeListingCount(payload.count || payload.amount || 0);
    const unitPrice = normalizeUnitPrice(payload.unitPrice || payload.price || 0);
    const currency = normalizeMarketCurrency(payload.currency || payload.priceCurrency || MARKET_CURRENCY_STONE_COINS);
    const items = normalizeLimitedItems([{itemId, count}]);
    if (items.length <= 0 || items[0].itemId !== itemId) {
      return fail("market_item_invalid", "请选择可以上架的物品。", profilePayload(prepared, prepared.profile));
    }
    if (count <= 0) {
      return fail("market_count_invalid", "上架数量需要大于0。", profilePayload(prepared, prepared.profile));
    }
    if (unitPrice <= 0) {
      return fail("market_price_invalid", "单价需要大于0。", profilePayload(prepared, prepared.profile));
    }
    const activeListings = activeMarketListings(prepared.data);
    if (activeListings.filter((listing) => listing.sellerAccountId === prepared.account.accountId).length >= 20) {
      return fail("market_listing_limit", "你的挂单太多，请先卖出或取消一些。", profilePayload(prepared, prepared.profile));
    }
    if (activeListings.length >= MARKET_MAX_LISTINGS) {
      return fail("market_full", "交易所挂单已满，请稍后再试。", profilePayload(prepared, prepared.profile));
    }
    const profile = clone(prepared.profile);
    const slots = profileBackpackSlots(profile);
    const missing = firstMissingBackpackItem(slots, items);
    if (missing) {
      return fail("market_item_not_enough", `${missing.label} 数量不够，无法上架。`, profilePayload(prepared, profile));
    }
    profile.backpackSlots = consumeBackpackItem(slots, itemId, count);
    profile.captureTools = captureToolBagFromProfile(profile);
    const listingId = `market_${randomId()}`;
    const listing = {
      listingId,
      sellerAccountId: prepared.account.accountId,
      itemId,
      count,
      unitPrice,
      currency,
      createdAt: isoNow(now),
      schemaVersion: 1,
    };
    prepared.data.marketListings = objectMap(prepared.data.marketListings);
    prepared.data.marketListings[listingId] = listing;
    const persisted = persistProfileForAccount(prepared.data, prepared.account, prepared.binding, profile, now);
    save(prepared.data);
    return ok({
      account: publicAccount(prepared.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(prepared.account, prepared.data),
      profile: clone(profile),
      listing: publicMarketListing(listing, prepared.data),
      ...marketStatePayload(prepared.data, prepared.account),
      message: `已上架${itemAmountText(items)}。`,
    });
  }

  function buyMarketListing(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const listingId = String(payload.listingId || payload.id || "").trim();
    const listing = normalizeMarketListing(data.marketListings && data.marketListings[listingId]);
    if (!listing || !listing.listingId) {
      return fail("market_listing_missing", "这条挂单已经不存在。");
    }
    if (listing.sellerAccountId === resolved.account.accountId) {
      return fail("market_buy_self", "不能购买自己的挂单。");
    }
    const seller = accountById(data, listing.sellerAccountId);
    if (!seller) {
      delete data.marketListings[listingId];
      save(data);
      return fail("market_seller_missing", "卖家账号不存在，挂单已下架。");
    }
    const buyerPrepared = profileForAccount(data, resolved.account);
    if (!buyerPrepared.ok) {
      return buyerPrepared;
    }
    const sellerPrepared = profileForAccount(data, seller);
    if (!sellerPrepared.ok) {
      return sellerPrepared;
    }
    const totalPrice = marketListingTotalPrice(listing);
    const buyerProfile = clone(buyerPrepared.profile);
    if (profileCurrencyAmount(buyerProfile, listing.currency) < totalPrice) {
      return fail("market_not_enough_currency", `${shopCurrencyLabel(listing.currency)}不足，无法购买。`, {
        listing: publicMarketListing(listing, data),
        ...marketStatePayload(data, resolved.account),
      });
    }
    const addResult = addRewardItemsToBackpack(profileBackpackSlots(buyerProfile), [{itemId: listing.itemId, count: listing.count}]);
    if (normalizeMailItems(addResult.lostItems || []).length > 0) {
      return fail("market_backpack_full", "背包空间不足，无法购买。", {
        listing: publicMarketListing(listing, data),
        ...marketStatePayload(data, resolved.account),
      });
    }
    const tax = marketTaxForListing(data, listing);
    const sellerReceives = Math.max(0, totalPrice - tax);
    buyerProfile.backpackSlots = addResult.slots;
    buyerProfile.captureTools = captureToolBagFromProfile(buyerProfile);
    setProfileCurrencyAmount(buyerProfile, listing.currency, profileCurrencyAmount(buyerProfile, listing.currency) - totalPrice);
    const config = normalizeMarketConfig(data.marketConfig);
    config.taxCollected[listing.currency] = normalizeCoinAmount(config.taxCollected[listing.currency]) + tax;
    data.marketConfig = config;
    const buyerPersisted = persistProfileForAccount(data, resolved.account, buyerPrepared.binding, buyerProfile, now);
    const saleMail = createMarketSaleMail(data, seller, listing, tax, sellerReceives);
    delete data.marketListings[listingId];
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: buyerPersisted.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(buyerProfile),
      otherProfileSummary: profileSummaryForAccount(seller, data),
      otherProfileBinding: sellerPrepared.binding,
      listing: publicMarketListing(listing, data),
      receipt: publicMarketReceipt("buy", listing, tax, sellerReceives, data),
      saleMail: publicMail ? publicMail(saleMail) : clone(saleMail),
      ...marketStatePayload(data, resolved.account),
      message: `已购买${itemAmountText([{itemId: listing.itemId, count: listing.count}])}。`,
    });
  }

  function cancelMarketListing(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const listingId = String(payload.listingId || payload.id || "").trim();
    const listing = normalizeMarketListing(data.marketListings && data.marketListings[listingId]);
    if (!listing || listing.sellerAccountId !== resolved.account.accountId) {
      return fail("market_listing_missing", "这条挂单已经不存在。");
    }
    const prepared = profileForAccount(data, resolved.account);
    if (!prepared.ok) {
      return prepared;
    }
    const profile = clone(prepared.profile);
    const addResult = addRewardItemsToBackpack(profileBackpackSlots(profile), [{itemId: listing.itemId, count: listing.count}]);
    if (normalizeMailItems(addResult.lostItems || []).length > 0) {
      return fail("market_backpack_full", "背包空间不足，暂时不能下架。", {
        listing: publicMarketListing(listing, data),
        ...marketStatePayload(data, resolved.account),
      });
    }
    profile.backpackSlots = addResult.slots;
    profile.captureTools = captureToolBagFromProfile(profile);
    const persisted = persistProfileForAccount(data, resolved.account, prepared.binding, profile, now);
    delete data.marketListings[listingId];
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      listing: publicMarketListing(listing, data),
      ...marketStatePayload(data, resolved.account),
      message: "挂单已下架，物品已回到背包。",
    });
  }

  function proposeTrade(token, payload = {}) {
    const data = load();
    expireTradeOffers(data);
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const targetUsername = normalizeUsername(payload.targetUsername || payload.username || payload.toUsername || "");
    const target = data.accounts[targetUsername];
    if (!target) {
      return fail("trade_target_missing", "交易对象不存在。");
    }
    if (target.accountId === resolved.account.accountId) {
      return fail("trade_target_self", "不能和自己交易。");
    }
    const positionCheck = tradePositionCheck(data, resolved.account.accountId, target.accountId);
    if (!positionCheck.ok) {
      return positionCheck;
    }
    const offerItems = normalizeLimitedItems(payload.items || payload.offerItems || []);
    const offerStoneCoins = normalizeCoinAmount(payload.stoneCoins || payload.offerStoneCoins || 0);
    if (offerItems.length <= 0 && offerStoneCoins <= 0) {
      return fail("trade_offer_empty", "请选择要交易的石币或物品。");
    }
    const prepared = profileForAccount(data, resolved.account);
    if (!prepared.ok) {
      return prepared;
    }
    const profile = prepared.profile;
    if (offerStoneCoins > profileStoneCoins(profile)) {
      return fail("trade_stone_coins_not_enough", "石币不足，无法发起交易。", profilePayload(prepared, profile));
    }
    const missing = firstMissingBackpackItem(profileBackpackSlots(profile), offerItems);
    if (missing) {
      return fail("trade_item_not_enough", `${missing.label} 数量不够，无法发起交易。`, profilePayload(prepared, profile));
    }
    const tradeId = `trade_${randomId()}`;
    const offer = {
      tradeId,
      fromAccountId: resolved.account.accountId,
      toAccountId: target.accountId,
      offerItems,
      offerStoneCoins,
      createdAt: isoNow(now),
      expiresAt: new Date(now() + TRADE_OFFER_TTL_MS).toISOString(),
      schemaVersion: 1,
    };
    data.tradeOffers[tradeId] = offer;
    save(data);
    return ok({
      trade: publicTradeOffer(offer, data),
      message: "交易请求已发出。",
    });
  }

  function acceptTrade(token, payload = {}) {
    const data = load();
    expireTradeOffers(data);
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const tradeId = String(payload.tradeId || payload.id || "").trim();
    const offer = data.tradeOffers[tradeId];
    if (!offer || offer.toAccountId !== resolved.account.accountId) {
      return fail("trade_offer_missing", "交易请求不存在或已过期。");
    }
    const initiator = accountById(data, offer.fromAccountId);
    if (!initiator) {
      delete data.tradeOffers[tradeId];
      save(data);
      return fail("trade_target_missing", "交易发起人不存在。");
    }
    const positionCheck = tradePositionCheck(data, initiator.accountId, resolved.account.accountId);
    if (!positionCheck.ok) {
      return positionCheck;
    }
    const counterItems = normalizeLimitedItems(payload.items || payload.counterItems || []);
    const counterStoneCoins = normalizeCoinAmount(payload.stoneCoins || payload.counterStoneCoins || 0);
    const initiatorPrepared = profileForAccount(data, initiator);
    if (!initiatorPrepared.ok) {
      return initiatorPrepared;
    }
    const accepterPrepared = profileForAccount(data, resolved.account);
    if (!accepterPrepared.ok) {
      return accepterPrepared;
    }
    const initiatorProfile = clone(initiatorPrepared.profile);
    const accepterProfile = clone(accepterPrepared.profile);
    const offerItems = normalizeLimitedItems(offer.offerItems || []);
    const offerStoneCoins = normalizeCoinAmount(offer.offerStoneCoins || 0);
    const initiatorCheck = canPayProfile(initiatorProfile, offerItems, offerStoneCoins, "trade_initiator");
    if (!initiatorCheck.ok) {
      return initiatorCheck;
    }
    const accepterCheck = canPayProfile(accepterProfile, counterItems, counterStoneCoins, "trade_acceptor");
    if (!accepterCheck.ok) {
      return accepterCheck;
    }
    const initiatorReceiveCheck = canReceiveStoneCoins(initiatorProfile, counterStoneCoins, "trade_initiator");
    if (!initiatorReceiveCheck.ok) {
      return initiatorReceiveCheck;
    }
    const accepterReceiveCheck = canReceiveStoneCoins(accepterProfile, offerStoneCoins, "trade_acceptor");
    if (!accepterReceiveCheck.ok) {
      return accepterReceiveCheck;
    }
    const nextInitiator = applyTradePayment(initiatorProfile, offerItems, offerStoneCoins, counterItems, counterStoneCoins);
    if (!nextInitiator.ok) {
      return fail("trade_initiator_backpack_full", "对方背包空间不足，交易无法完成。");
    }
    const nextAccepter = applyTradePayment(accepterProfile, counterItems, counterStoneCoins, offerItems, offerStoneCoins);
    if (!nextAccepter.ok) {
      return fail("trade_acceptor_backpack_full", "你的背包空间不足，交易无法完成。");
    }
    const initiatorPersisted = persistProfileForAccount(data, initiator, initiatorPrepared.binding, nextInitiator.profile, now);
    const accepterPersisted = persistProfileForAccount(data, resolved.account, accepterPrepared.binding, nextAccepter.profile, now);
    delete data.tradeOffers[tradeId];
    save(data);
    return ok({
      trade: {
        tradeId,
        fromAccountId: initiator.accountId,
        toAccountId: resolved.account.accountId,
        offerItems,
        offerStoneCoins,
        counterItems,
        counterStoneCoins,
        schemaVersion: 1,
      },
      account: publicAccount(resolved.account),
      profileBinding: accepterPersisted.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(nextAccepter.profile),
      otherProfileSummary: profileSummaryForAccount(initiator, data),
      otherProfileBinding: initiatorPersisted.binding,
      message: "交易已完成。",
    });
  }

  function tradeState(token) {
    const data = load();
    expireTradeOffers(data);
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const accountId = resolved.account.accountId;
    const sent = [];
    const received = [];
    for (const offer of Object.values(data.tradeOffers || {})) {
      if (!offer || typeof offer !== "object" || Array.isArray(offer)) {
        continue;
      }
      if (offer.fromAccountId === accountId) {
        sent.push(publicTradeOffer(offer, data));
      } else if (offer.toAccountId === accountId) {
        received.push(publicTradeOffer(offer, data));
      }
    }
    return ok({
      trades: {
        sent,
        received,
        schemaVersion: 1,
      },
      message: "交易状态已刷新。",
    });
  }

  function cancelTrade(token, payload = {}) {
    const data = load();
    expireTradeOffers(data);
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const tradeId = String(payload.tradeId || payload.id || "").trim();
    const offer = data.tradeOffers[tradeId];
    if (!offer || (offer.fromAccountId !== resolved.account.accountId && offer.toAccountId !== resolved.account.accountId)) {
      return fail("trade_offer_missing", "交易请求不存在或已过期。");
    }
    delete data.tradeOffers[tradeId];
    save(data);
    return ok({
      tradeId,
      message: "交易已取消。",
    });
  }

  function prepareSingleProfileMutation(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    return profileForAccount(data, resolved.account);
  }

  function profileForAccount(data, account) {
    const binding = profileBindingForAccount(data, account, now);
    const profileDoc = data.profiles[binding.playerId] || null;
    if (!profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(account, data),
      });
    }
    return {
      ok: true,
      data,
      account,
      binding,
      profileDoc,
      profile: profileDoc.profile,
    };
  }

  function normalizeBank(value) {
    const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const rawItems = normalizeMailItems(raw.items || raw.itemAmounts || []);
    const hasRawSlots = Array.isArray(raw.slots) && raw.slots.length > 0;
    const slots = hasRawSlots ? normalizeBankSlots(raw.slots) : bankSlotsFromItems(rawItems);
    const requiredTabs = Math.max(BANK_DEFAULT_UNLOCKED_TABS, Math.ceil((lastFilledBankSlotIndex(slots) + 1) / BANK_SLOTS_PER_TAB));
    const rawUnlockedTabs = Math.trunc(Number(raw.unlockedTabs || raw.tabs || BANK_DEFAULT_UNLOCKED_TABS));
    return {
      stoneCoins: Math.min(bankStoneCoinLimit, normalizeCoinAmount(raw.stoneCoins || raw.coins || 0)),
      items: bankItemsFromSlots(slots),
      slots,
      unlockedTabs: clampInt(Math.max(rawUnlockedTabs, requiredTabs), BANK_DEFAULT_UNLOCKED_TABS, BANK_TAB_COUNT),
      schemaVersion: 1,
    };
  }

  function normalizeLimitedItems(value) {
    return normalizeMailItems(value).slice(0, TRADE_MAX_ITEM_LINES);
  }

  function normalizeBankTransferItems(value) {
    const result = [];
    for (const rawItem of Array.isArray(value) ? value : []) {
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
        continue;
      }
      const itemId = String(rawItem.itemId || rawItem.id || "").trim();
      const count = normalizeCoinAmount(rawItem.count || rawItem.amount || 0);
      if (itemId === "" || count <= 0 || !bagItemById(itemId)) {
        continue;
      }
      result.push({
        itemId,
        count,
        sourceSlotIndex: normalizeOptionalIndex(rawItem.sourceSlotIndex ?? rawItem.slotIndex ?? rawItem.sourceIndex),
        targetSlotIndex: normalizeOptionalIndex(rawItem.targetSlotIndex ?? rawItem.targetIndex),
        bankSlotIndex: normalizeOptionalIndex(rawItem.bankSlotIndex ?? rawItem.targetBankSlotIndex ?? rawItem.sourceBankSlotIndex),
      });
      if (result.length >= TRADE_MAX_ITEM_LINES) {
        break;
      }
    }
    return result;
  }

  function normalizeOptionalIndex(value) {
    if (value === undefined || value === null || value === "") {
      return -1;
    }
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) ? numeric : -1;
  }

  function normalizeBankSlots(value) {
    const result = [];
    if (Array.isArray(value)) {
      for (const rawSlot of value) {
        if (result.length >= BANK_SLOT_LIMIT) {
          break;
        }
        const slot = rawSlot && typeof rawSlot === "object" && !Array.isArray(rawSlot) ? rawSlot : {};
        const itemId = String(slot.itemId || "").trim();
        if (!bagItemById(itemId)) {
          result.push({});
          continue;
        }
        let remaining = normalizeCoinAmount(slot.count || 0);
        if (remaining <= 0) {
          result.push({});
          continue;
        }
        const stackLimit = bankItemStackLimit(itemId);
        while (remaining > 0 && result.length < BANK_SLOT_LIMIT) {
          const stackCount = Math.min(remaining, stackLimit);
          result.push({itemId, count: stackCount});
          remaining -= stackCount;
        }
      }
    }
    while (result.length < BANK_SLOT_LIMIT) {
      result.push({});
    }
    return result;
  }

  function bankSlotsFromItems(items) {
    const result = [];
    for (const item of normalizeMailItems(items)) {
      const itemId = String(item.itemId || "").trim();
      if (!bagItemById(itemId)) {
        continue;
      }
      let remaining = normalizeCoinAmount(item.count || 0);
      const stackLimit = bankItemStackLimit(itemId);
      while (remaining > 0 && result.length < BANK_SLOT_LIMIT) {
        const stackCount = Math.min(remaining, stackLimit);
        result.push({itemId, count: stackCount});
        remaining -= stackCount;
      }
    }
    while (result.length < BANK_SLOT_LIMIT) {
      result.push({});
    }
    return result;
  }

  function bankItemsFromSlots(slots) {
    const counts = {};
    for (const slot of normalizeBankSlots(slots)) {
      const itemId = String(slot.itemId || "").trim();
      const count = normalizeCoinAmount(slot.count || 0);
      if (itemId === "" || count <= 0) {
        continue;
      }
      counts[itemId] = normalizeCoinAmount(counts[itemId]) + count;
    }
    return normalizeMailItems(Object.entries(counts).map(([itemId, count]) => ({itemId, count})));
  }

  function bankItemStackLimit(itemId) {
    return Math.max(1, Math.trunc(Number(bagItemStackLimit ? bagItemStackLimit(itemId) : 1)));
  }

  function lastFilledBankSlotIndex(slots) {
    const normalized = normalizeBankSlots(slots);
    for (let index = normalized.length - 1; index >= 0; index -= 1) {
      const slot = normalized[index] || {};
      if (String(slot.itemId || "").trim() !== "" && normalizeCoinAmount(slot.count || 0) > 0) {
        return index;
      }
    }
    return -1;
  }

  function bankUnlockedSlotCount(bank) {
    const unlockedTabs = clampInt(Math.trunc(Number(bank && bank.unlockedTabs || BANK_DEFAULT_UNLOCKED_TABS)), BANK_DEFAULT_UNLOCKED_TABS, BANK_TAB_COUNT);
    return unlockedTabs * BANK_SLOTS_PER_TAB;
  }

  function addItemToBankSlots(slots, itemId, count, unlockedSlotCount, preferredIndex = -1) {
    const nextSlots = normalizeBankSlots(slots);
    let remaining = normalizeCoinAmount(count || 0);
    const limit = clampInt(unlockedSlotCount, BANK_SLOTS_PER_TAB, BANK_SLOT_LIMIT);
    const stackLimit = bankItemStackLimit(itemId);
    const targetIndex = Math.trunc(Number(preferredIndex));
    if (targetIndex >= 0) {
      if (targetIndex >= limit) {
        return {slots: nextSlots, addedCount: 0, lostCount: remaining};
      }
      const target = nextSlots[targetIndex] && typeof nextSlots[targetIndex] === "object" && !Array.isArray(nextSlots[targetIndex]) ? nextSlots[targetIndex] : {};
      const targetItemId = String(target.itemId || "").trim();
      const targetCount = normalizeCoinAmount(target.count || 0);
      if (targetItemId !== "" && targetItemId !== itemId) {
        return {slots: nextSlots, addedCount: 0, lostCount: remaining};
      }
      const room = targetItemId === itemId ? Math.max(0, stackLimit - targetCount) : stackLimit;
      const moveCount = Math.min(room, remaining);
      if (moveCount > 0) {
        nextSlots[targetIndex] = {itemId, count: targetCount + moveCount};
        remaining -= moveCount;
      }
    }
    for (let index = 0; index < limit && remaining > 0; index += 1) {
      const slot = nextSlots[index] && typeof nextSlots[index] === "object" && !Array.isArray(nextSlots[index]) ? nextSlots[index] : {};
      if (String(slot.itemId || "").trim() !== itemId) {
        continue;
      }
      const currentCount = normalizeCoinAmount(slot.count || 0);
      const room = Math.max(0, stackLimit - currentCount);
      const moveCount = Math.min(room, remaining);
      if (moveCount > 0) {
        nextSlots[index] = {itemId, count: currentCount + moveCount};
        remaining -= moveCount;
      }
    }
    for (let index = 0; index < limit && remaining > 0; index += 1) {
      const slot = nextSlots[index] && typeof nextSlots[index] === "object" && !Array.isArray(nextSlots[index]) ? nextSlots[index] : {};
      if (String(slot.itemId || "").trim() !== "") {
        continue;
      }
      const moveCount = Math.min(stackLimit, remaining);
      nextSlots[index] = {itemId, count: moveCount};
      remaining -= moveCount;
    }
    return {
      slots: normalizeBankSlots(nextSlots),
      addedCount: normalizeCoinAmount(count || 0) - remaining,
      lostCount: remaining,
    };
  }

  function bankTransferMissingBackpackItem(slots, item) {
    const sourceSlotIndex = Math.trunc(Number(item.sourceSlotIndex ?? -1));
    if (sourceSlotIndex >= 0) {
      const normalized = normalizeBackpackSlots(slots);
      if (sourceSlotIndex >= normalized.length) {
        return {itemId: item.itemId, count: item.count, label: itemAmountText([item])};
      }
      const slot = normalized[sourceSlotIndex] || {};
      if (String(slot.itemId || "") !== item.itemId || normalizeCoinAmount(slot.count || 0) < item.count) {
        return {itemId: item.itemId, count: item.count, label: itemAmountText([item])};
      }
      return null;
    }
    return backpackItemCount(slots, item.itemId) < item.count
      ? {itemId: item.itemId, count: item.count, label: itemAmountText([item])}
      : null;
  }

  function consumeBankTransferBackpackItem(slots, item) {
    const sourceSlotIndex = Math.trunc(Number(item.sourceSlotIndex ?? -1));
    if (sourceSlotIndex < 0) {
      return consumeBackpackItem(slots, item.itemId, item.count);
    }
    const nextSlots = normalizeBackpackSlots(slots);
    const slot = nextSlots[sourceSlotIndex] || {};
    const remaining = normalizeCoinAmount(slot.count || 0) - item.count;
    nextSlots[sourceSlotIndex] = remaining > 0 ? {itemId: item.itemId, count: remaining} : {};
    return nextSlots;
  }

  function bankTransferMissingBankItem(slots, item) {
    const bankSlotIndex = Math.trunc(Number(item.bankSlotIndex ?? -1));
    if (bankSlotIndex >= 0) {
      const normalized = normalizeBankSlots(slots);
      if (bankSlotIndex >= normalized.length) {
        return {itemId: item.itemId, count: item.count, label: itemAmountText([item])};
      }
      const slot = normalized[bankSlotIndex] || {};
      if (String(slot.itemId || "") !== item.itemId || normalizeCoinAmount(slot.count || 0) < item.count) {
        return {itemId: item.itemId, count: item.count, label: itemAmountText([item])};
      }
      return null;
    }
    return itemAmountCount(bankItemsFromSlots(slots), item.itemId) < item.count
      ? {itemId: item.itemId, count: item.count, label: itemAmountText([item])}
      : null;
  }

  function consumeBankTransferBankItem(slots, item) {
    const bankSlotIndex = Math.trunc(Number(item.bankSlotIndex ?? -1));
    if (bankSlotIndex < 0) {
      return {slots: subtractItemAmountsFromBankSlots(slots, [item])};
    }
    const nextSlots = normalizeBankSlots(slots);
    const slot = nextSlots[bankSlotIndex] || {};
    const remaining = normalizeCoinAmount(slot.count || 0) - item.count;
    nextSlots[bankSlotIndex] = remaining > 0 ? {itemId: item.itemId, count: remaining} : {};
    return {slots: normalizeBankSlots(nextSlots)};
  }

  function subtractItemAmountsFromBankSlots(slots, removeItems) {
    let nextSlots = normalizeBankSlots(slots);
    for (const item of normalizeMailItems(removeItems)) {
      let remaining = normalizeCoinAmount(item.count || 0);
      for (let index = 0; index < nextSlots.length && remaining > 0; index += 1) {
        const slot = nextSlots[index] || {};
        if (String(slot.itemId || "") !== item.itemId) {
          continue;
        }
        const currentCount = normalizeCoinAmount(slot.count || 0);
        const consumeCount = Math.min(currentCount, remaining);
        remaining -= consumeCount;
        const nextCount = currentCount - consumeCount;
        nextSlots[index] = nextCount > 0 ? {itemId: item.itemId, count: nextCount} : {};
      }
    }
    return normalizeBankSlots(nextSlots);
  }

  function normalizeListingCount(value) {
    return Math.max(0, Math.min(MARKET_MAX_LISTING_COUNT, Math.trunc(Number(value || 0))));
  }

  function normalizeUnitPrice(value) {
    return Math.max(0, Math.min(MARKET_MAX_UNIT_PRICE, Math.trunc(Number(value || 0))));
  }

  function normalizeCoinAmount(value) {
    return Math.max(0, Math.trunc(Number(value || 0)));
  }

  function normalizeMarketCurrency(value) {
    const currency = String(value || "").trim();
    return currency === MARKET_CURRENCY_DIAMONDS || currency === "diamond"
      ? MARKET_CURRENCY_DIAMONDS
      : MARKET_CURRENCY_STONE_COINS;
  }

  function normalizeTaxBps(value, fallback = MARKET_DEFAULT_TAX_BPS) {
    const numeric = Math.trunc(Number(value));
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.max(0, Math.min(10000, numeric));
  }

  function objectMap(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function firstMissingBackpackItem(slots, items) {
    for (const item of items) {
      if (backpackItemCount(slots, item.itemId) < item.count) {
        return {itemId: item.itemId, count: item.count, label: itemAmountText([item])};
      }
    }
    return null;
  }

  function firstMissingBankItem(bank, items) {
    for (const item of items) {
      if (itemAmountCount(bank.items, item.itemId) < item.count) {
        return {itemId: item.itemId, count: item.count, label: itemAmountText([item])};
      }
    }
    return null;
  }

  function itemAmountCount(items, itemId) {
    return normalizeMailItems(items).reduce((total, item) => (
      String(item.itemId || "") === itemId ? total + normalizeCoinAmount(item.count) : total
    ), 0);
  }

  function subtractItemAmounts(sourceItems, removeItems) {
    const counts = {};
    for (const item of normalizeMailItems(sourceItems)) {
      counts[item.itemId] = normalizeCoinAmount(counts[item.itemId]) + item.count;
    }
    for (const item of normalizeMailItems(removeItems)) {
      counts[item.itemId] = Math.max(0, normalizeCoinAmount(counts[item.itemId]) - item.count);
    }
    return normalizeMailItems(Object.entries(counts).map(([itemId, count]) => ({itemId, count})));
  }

  function canPayProfile(profile, items, stoneCoins, prefix) {
    if (stoneCoins > profileStoneCoins(profile)) {
      return fail(`${prefix}_stone_coins_not_enough`, "石币不足，交易无法完成。");
    }
    const missing = firstMissingBackpackItem(profileBackpackSlots(profile), items);
    if (missing) {
      return fail(`${prefix}_item_not_enough`, `${missing.label} 数量不够，交易无法完成。`);
    }
    return ok();
  }

  function canReceiveStoneCoins(profile, stoneCoins, prefix) {
    if (stoneCoins > 0 && profileStoneCoins(profile) + stoneCoins > profileStoneCoinLimit) {
      return fail(`${prefix}_wallet_stone_coin_limit`, "身上石币已达上限，请先存入银行。");
    }
    return ok();
  }

  function applyTradePayment(profile, payItems, payStoneCoins, receiveItems, receiveStoneCoins) {
    const nextProfile = clone(profile);
    let slots = profileBackpackSlots(nextProfile);
    for (const item of payItems) {
      slots = consumeBackpackItem(slots, item.itemId, item.count);
    }
    const addResult = addRewardItemsToBackpack(slots, receiveItems);
    if (normalizeMailItems(addResult.lostItems || []).length > 0) {
      return {ok: false, profile: nextProfile};
    }
    nextProfile.backpackSlots = addResult.slots;
    nextProfile.captureTools = captureToolBagFromProfile(nextProfile);
    nextProfile.stoneCoins = Math.min(
      profileStoneCoinLimit,
      Math.max(0, profileStoneCoins(nextProfile) - payStoneCoins) + receiveStoneCoins
    );
    return {ok: true, profile: nextProfile};
  }

  function tradePositionCheck(data, fromAccountId, toAccountId) {
    const fromPosition = data.playerPositions[fromAccountId] || null;
    const toPosition = data.playerPositions[toAccountId] || null;
    if (!fromPosition || !toPosition || !fromPosition.mapId || !toPosition.mapId) {
      return fail("trade_position_missing", "交易前需要双方同步当前位置。");
    }
    if (!playerPositionHasCell(fromPosition) || !playerPositionHasCell(toPosition)) {
      return fail("trade_position_missing", "交易前需要双方同步当前位置。");
    }
    if (String(fromPosition.mapId) !== String(toPosition.mapId)) {
      return fail("trade_map_mismatch", "双方不在同一张地图，无法交易。");
    }
    if (fromPosition.moving || toPosition.moving) {
      return fail("trade_player_moving", "双方需要停稳后才能交易。");
    }
    const dx = Math.abs(Number(fromPosition.cellX || 0) - Number(toPosition.cellX || 0));
    const dy = Math.abs(Number(fromPosition.cellY || 0) - Number(toPosition.cellY || 0));
    const distanceCells = Math.max(dx, dy);
    if (distanceCells > TRADE_MAX_DISTANCE_CELLS) {
      return fail("trade_distance_too_far", "距离太远，无法交易。", {
        distanceCells,
        maxDistanceCells: TRADE_MAX_DISTANCE_CELLS,
      });
    }
    return ok({
      position: {
        mapId: String(fromPosition.mapId),
        distanceCells,
        maxDistanceCells: TRADE_MAX_DISTANCE_CELLS,
        fromPosition: publicPlayerPosition(fromPosition),
        toPosition: publicPlayerPosition(toPosition),
        schemaVersion: 1,
      },
    });
  }

  function expireTradeOffers(data) {
    const nowMs = now();
    for (const [tradeId, offer] of Object.entries(data.tradeOffers || {})) {
      if (!offer || Date.parse(offer.expiresAt || "") <= nowMs) {
        delete data.tradeOffers[tradeId];
      }
    }
  }

  function activeMarketListings(data) {
    return Object.values(objectMap(data.marketListings))
      .map(normalizeMarketListing)
      .filter((listing) => listing && listing.listingId)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, MARKET_MAX_LISTINGS);
  }

  function normalizeMarketListing(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const listingId = String(value.listingId || "").trim();
    const sellerAccountId = String(value.sellerAccountId || "").trim();
    const itemId = String(value.itemId || "").trim();
    const count = normalizeListingCount(value.count || 0);
    const unitPrice = normalizeUnitPrice(value.unitPrice || 0);
    if (!listingId || !sellerAccountId || !itemId || count <= 0 || unitPrice <= 0) {
      return null;
    }
    return {
      listingId,
      sellerAccountId,
      itemId,
      count,
      unitPrice,
      currency: normalizeMarketCurrency(value.currency),
      createdAt: String(value.createdAt || ""),
      schemaVersion: 1,
    };
  }

  function normalizeMarketConfig(value) {
    const raw = objectMap(value);
    const rawTaxCollected = objectMap(raw.taxCollected);
    return {
      defaultTaxBps: normalizeTaxBps(raw.defaultTaxBps ?? raw.taxBps, MARKET_DEFAULT_TAX_BPS),
      itemTaxBps: normalizeMarketItemTaxBps(raw.itemTaxBps || raw.itemTaxes),
      taxCollected: {
        [MARKET_CURRENCY_STONE_COINS]: normalizeCoinAmount(rawTaxCollected[MARKET_CURRENCY_STONE_COINS]),
        [MARKET_CURRENCY_DIAMONDS]: normalizeCoinAmount(rawTaxCollected[MARKET_CURRENCY_DIAMONDS]),
      },
      schemaVersion: 1,
    };
  }

  function normalizeMarketItemTaxBps(value) {
    const itemTaxBps = {};
    for (const [itemId, bps] of Object.entries(objectMap(value))) {
      const normalizedItemId = String(itemId || "").trim();
      if (normalizedItemId) {
        itemTaxBps[normalizedItemId] = normalizeTaxBps(bps);
      }
    }
    return itemTaxBps;
  }

  function authorizeMarketConfigGm(token) {
    if (typeof authorizeGmCommand !== "function") {
      return fail("gm_denied", "当前账号没有GM权限。");
    }
    return authorizeGmCommand({token, "commandId": MARKET_GM_COMMAND_ID});
  }

  function marketTaxBpsForListing(data, listing) {
    const config = normalizeMarketConfig(data.marketConfig);
    if (Object.prototype.hasOwnProperty.call(config.itemTaxBps, listing.itemId)) {
      return normalizeTaxBps(config.itemTaxBps[listing.itemId], config.defaultTaxBps);
    }
    return config.defaultTaxBps;
  }

  function marketListingTotalPrice(listing) {
    return normalizeCoinAmount(listing.count) * normalizeCoinAmount(listing.unitPrice);
  }

  function marketTaxForListing(data, listing) {
    const totalPrice = marketListingTotalPrice(listing);
    const bps = marketTaxBpsForListing(data, listing);
    if (totalPrice <= 0 || bps <= 0) {
      return 0;
    }
    return Math.min(totalPrice, Math.ceil(totalPrice * bps / 10000));
  }

  function marketStatePayload(data, account, payload = {}) {
    const filters = objectMap(payload);
    const itemFilter = String(filters.itemId || "").trim();
    const currencyFilter = String(filters.currency || "").trim();
    const accountId = account ? account.accountId : "";
    let listings = activeMarketListings(data);
    if (itemFilter) {
      listings = listings.filter((listing) => listing.itemId === itemFilter);
    }
    if (currencyFilter) {
      const currency = normalizeMarketCurrency(currencyFilter);
      listings = listings.filter((listing) => listing.currency === currency);
    }
    const publicListings = listings.map((listing) => publicMarketListing(listing, data));
    const mine = publicListings.filter((listing) => listing.sellerAccountId === accountId);
    return {
      market: {
        listings: publicListings,
        mine,
        config: publicMarketConfig(data),
        schemaVersion: 1,
      },
    };
  }

  function publicMarketConfig(data) {
    const config = normalizeMarketConfig(data.marketConfig);
    return {
      defaultTaxBps: config.defaultTaxBps,
      itemTaxBps: {...config.itemTaxBps},
      taxCollected: {...config.taxCollected},
      schemaVersion: 1,
    };
  }

  function publicMarketListing(listing, data) {
    const seller = accountById(data, listing.sellerAccountId);
    const totalPrice = marketListingTotalPrice(listing);
    const taxBps = marketTaxBpsForListing(data, listing);
    const tax = marketTaxForListing(data, listing);
    return {
      listingId: listing.listingId,
      sellerAccountId: listing.sellerAccountId,
      sellerUsername: seller ? seller.username : "",
      sellerDisplayName: seller ? seller.displayName : "",
      itemId: listing.itemId,
      itemLabel: bagItemLabel(listing.itemId),
      count: listing.count,
      unitPrice: listing.unitPrice,
      totalPrice,
      currency: listing.currency,
      currencyLabel: shopCurrencyLabel(listing.currency),
      taxBps,
      estimatedTax: tax,
      sellerReceives: Math.max(0, totalPrice - tax),
      createdAt: listing.createdAt,
      schemaVersion: 1,
    };
  }

  function publicMarketReceipt(mode, listing, tax, sellerReceives, data) {
    return {
      mode,
      listingId: listing.listingId,
      itemId: listing.itemId,
      count: listing.count,
      unitPrice: listing.unitPrice,
      totalPrice: marketListingTotalPrice(listing),
      currency: listing.currency,
      currencyLabel: shopCurrencyLabel(listing.currency),
      tax,
      sellerReceives,
      taxBps: marketTaxBpsForListing(data, listing),
      schemaVersion: 1,
    };
  }

  function createMarketSaleMail(data, seller, listing, tax, sellerReceives) {
    data.mailMessages = objectMap(data.mailMessages);
    const currencyLabel = shopCurrencyLabel(listing.currency);
    const itemText = itemAmountText([{itemId: listing.itemId, count: listing.count}]);
    const totalPrice = marketListingTotalPrice(listing);
    const mail = {
      mailId: `mail_market_${randomId()}`,
      senderAccountId: "system_market",
      senderUsername: "auction_house",
      senderDisplayName: "拍卖行",
      recipientAccountId: seller.accountId,
      recipientUsername: seller.username,
      recipientDisplayName: seller.displayName,
      title: "拍卖行成交通知",
      body: [
        `${itemText} 已售出。`,
        `单价：${listing.unitPrice}${currencyLabel}`,
        `成交金额：${totalPrice}${currencyLabel}`,
        `交易税：${tax}${currencyLabel}`,
        `实收：${sellerReceives}${currencyLabel}`,
        "收益已放入本邮件附件，请领取。",
      ].join("\n"),
      currency: marketCurrencyAttachment(listing.currency, sellerReceives),
      items: [],
      createdAt: isoNow(now),
      readAt: null,
      schemaVersion: 1,
    };
    data.mailMessages[mail.mailId] = mail;
    return mail;
  }

  function marketCurrencyAttachment(currency, amount) {
    const normalizedAmount = normalizeCoinAmount(amount);
    if (normalizedAmount <= 0) {
      return {};
    }
    return {[normalizeMarketCurrency(currency)]: normalizedAmount};
  }

  function publicTradeOffer(offer, data) {
    const from = accountById(data, offer.fromAccountId);
    const to = accountById(data, offer.toAccountId);
    return {
      tradeId: String(offer.tradeId || ""),
      fromAccountId: String(offer.fromAccountId || ""),
      fromUsername: from ? from.username : "",
      fromDisplayName: from ? from.displayName : "",
      toAccountId: String(offer.toAccountId || ""),
      toUsername: to ? to.username : "",
      toDisplayName: to ? to.displayName : "",
      offerItems: normalizeLimitedItems(offer.offerItems || []),
      offerStoneCoins: normalizeCoinAmount(offer.offerStoneCoins || 0),
      createdAt: String(offer.createdAt || ""),
      expiresAt: String(offer.expiresAt || ""),
      schemaVersion: 1,
    };
  }

  function publicBankTransaction(mode, stoneCoins, items) {
    return {
      mode,
      stoneCoins,
      items: normalizeMailItems(items),
      schemaVersion: 1,
    };
  }

  function bankTransactionMessage(verb, stoneCoins, items) {
    const parts = [];
    if (stoneCoins > 0) {
      parts.push(`${stoneCoins}石币`);
    }
    const itemText = itemAmountText(items);
    if (itemText) {
      parts.push(itemText);
    }
    return `${verb}银行：${parts.join("、")}。`;
  }

  function profilePayload(prepared, profile, bank = null) {
    return {
      account: publicAccount(prepared.account),
      profileBinding: prepared.binding,
      profileSummary: profileSummaryForAccount(prepared.account, prepared.data),
      profile: clone(profile),
      bank: clone(bank || normalizeBank(profile.bank)),
    };
  }

  return {
    bankDeposit,
    bankWithdraw,
    marketListings,
    getMarketConfig,
    updateMarketConfig,
    createMarketListing,
    buyMarketListing,
    cancelMarketListing,
    proposeTrade,
    acceptTrade,
    tradeState,
    cancelTrade,
  };
}

module.exports = {
  createEconomyDomain,
};
