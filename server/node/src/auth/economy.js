"use strict";

const {
  TUTORIAL_BUY_QUEST_ID,
  TUTORIAL_SELLER_ACCOUNT_ID,
  TUTORIAL_SELLER_KIND,
  isTutorialBuyListingForAccount,
  tutorialBuyListing,
  tutorialSaleIsEligible,
} = require("./tutorial-market");
const {
  addEquipmentEnvelopeToBank,
  addOrdinaryItemToBank,
  readBankProfileState,
  removeEquipmentEnvelopeFromBank,
  removeOrdinaryItemFromBank,
} = require("./bank-profile-state");
const {
  exportBackpackEquipmentEnvelope,
  importBackpackEquipmentEnvelope,
  previewBackpackEquipmentTransfer,
} = require("./equipment-transfer-envelope");
const {
  buildEquipmentTradeReservation,
  equipmentReservationSummaryConflict,
  readEquipmentTradeReservationBatch,
} = require("./equipment-trade-reservation");
const {
  OWNER_KIND_BANK,
  OWNER_KIND_MARKET,
  createEquipmentEnvelopeOwnershipRegistry,
} = require("./equipment-envelope-registry");
const {
  ensureConsumedEquipmentEnvelopeIds,
} = require("./equipment-envelope-consumed-ledger");
const {
  MARKET_MAX_LISTINGS,
  MARKET_MAX_LISTINGS_PER_SELLER,
  auditMarketListingBook,
  buildEquipmentMarketListing,
  publicMarketListingFacts,
} = require("./market-listing-state");
const {stageMailAuthorityUpsert} = require("./mail-authority-state");

const TRADE_OFFER_TTL_MS = 2 * 60 * 1000;
const TRADE_MAX_DISTANCE_CELLS = 2;
const TRADE_MAX_ITEM_LINES = 8;
const TRADE_MAX_ACTIVE_OFFERS = 256;
const TRADE_MAX_SENT_OFFERS_PER_ACCOUNT = 8;
const TRADE_MAX_RECEIVED_OFFERS_PER_ACCOUNT = 16;
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
    activeBattleRoomForAccount,
    activeQuestAutoClaim,
    addRewardItemsToBackpack,
    authorizeGmCommand,
    bagItemById,
    bagItemIsBound,
    bagItemLabel,
    bagItemStackLimit,
    backpackItemCount,
    battleEquipmentCatalog,
    captureToolBagFromProfile,
    clampInt,
    clone,
    cloneAuthorityRoot = clone,
    claimActiveQuestToProfile,
    consumeBackpackItem,
    currentProfileQuestId,
    fail,
    equipmentTransferOptions = {},
    isoNow,
    itemAmountText,
    isEquipmentItemId,
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
    rawBackpackAssetConflict,
    profileBindingForAccount,
    profileCurrencyAmount,
    profileStoneCoinLimit = 10000000,
    profileStoneCoins,
    profileSummaryForAccount,
    publicMail,
    publicAccount,
    publicPlayerPosition,
    randomId,
    recordQuestEventToProfile,
    resolveSession,
    save,
    setProfileCurrencyAmount,
    shopCurrencyLabel,
  } = ctx;

  const equipmentItemPredicate = typeof isEquipmentItemId === "function" ? isEquipmentItemId : null;

  function bankDeposit(token, payload = {}) {
    const prepared = prepareSingleProfileMutation(token);
    if (!prepared.ok) {
      return prepared;
    }
    const profile = clone(prepared.profile);
    const rawBankConflict = rawBankAssetConflict(profile.bank);
    if (rawBankConflict) {
      return fail(rawBankConflict.code, rawBankConflict.message, rawBankProfilePayload(prepared, profile));
    }
    const parsedItems = parseBankTransferItems(payload.items || payload.itemAmounts || [], "deposit");
    if (!parsedItems.ok) {
      return fail(parsedItems.code, parsedItems.message, profilePayload(prepared, profile));
    }
    const items = parsedItems.items;
    const stoneCoins = normalizeCoinAmount(payload.stoneCoins || payload.coins || 0);
    if (stoneCoins <= 0 && items.length <= 0) {
      return fail("bank_deposit_empty", "请选择要存入的石币或物品。", profilePayload(prepared, profile));
    }
    if (stoneCoins > profileStoneCoins(profile)) {
      return fail("bank_stone_coins_not_enough", "石币不足，无法存入。", profilePayload(prepared, profile));
    }
    const originalBank = normalizeBank(profile.bank);
    let bank = clone(originalBank);
    if (bank.stoneCoins + stoneCoins > bankStoneCoinLimit) {
      return fail("bank_stone_coin_limit", `银行石币最多存放${bankStoneCoinLimit}。`, profilePayload(prepared, profile, bank));
    }
    let nextProfile = clone(profile);
    const envelopeRegistry = createEquipmentEnvelopeOwnershipRegistry(prepared.data);
    let nextConsumedLedger = prepared.data.consumedEquipmentEnvelopes;
    const reservedEnvelopeIds = new Set();
    for (const item of items) {
      if (isBankEquipmentItem(item.itemId)) {
        const sourceOwnership = envelopeRegistry.requireMaterializedInstanceOrigin(
          prepared.binding.playerId,
          item.instanceId,
        );
        if (!sourceOwnership.ok) {
          return fail(sourceOwnership.code, sourceOwnership.message, profilePayload(prepared, profile, originalBank));
        }
        if (sourceOwnership.hasOrigin) {
          const consumed = ensureConsumedEquipmentEnvelopeIds(nextConsumedLedger, sourceOwnership.envelopeId);
          if (!consumed.ok) {
            return fail(consumed.code, consumed.message, profilePayload(prepared, profile, originalBank));
          }
          nextConsumedLedger = consumed.ledger;
        }
        const envelopeId = nextBankEquipmentEnvelopeId(envelopeRegistry, reservedEnvelopeIds);
        if (!envelopeId.ok) {
          return fail(envelopeId.code, envelopeId.message, profilePayload(prepared, profile, originalBank));
        }
        const exported = exportBackpackEquipmentEnvelope(
          nextProfile,
          battleEquipmentCatalog,
          item.itemId,
          item.instanceId,
          equipmentEnvelopeOptions(nextProfile, item.itemId, {
            envelopeId: envelopeId.envelopeId,
            sourceSlotIndex: item.sourceSlotIndex,
          }),
        );
        if (!exported.ok) {
          return fail(exported.code, exported.message, profilePayload(prepared, profile, originalBank));
        }
        const added = addEquipmentEnvelopeToBank(
          bank,
          exported.envelope,
          item.bankSlotIndex,
          battleEquipmentCatalog,
          bankProfileStateOptions(),
        );
        if (!added.ok) {
          return fail(added.code, added.message, profilePayload(prepared, profile, originalBank));
        }
        nextProfile = exported.profile;
        bank = added.bank;
        reservedEnvelopeIds.add(exported.envelope.envelopeId);
        item.envelopeId = exported.envelope.envelopeId;
        item.bankSlotIndex = added.bankSlotIndex;
        continue;
      }
      const nextSlots = profileBackpackSlots(nextProfile);
      const missing = bankTransferMissingBackpackItem(nextSlots, item);
      if (missing) {
        return fail("bank_item_not_enough", `${missing.label} 数量不够，无法存入。`, profilePayload(prepared, profile, originalBank));
      }
      const added = addOrdinaryItemToBank(
        bank,
        item.itemId,
        item.count,
        item.bankSlotIndex,
        battleEquipmentCatalog,
        bankProfileStateOptions(),
      );
      if (!added.ok) {
        return fail(added.code, added.message, profilePayload(prepared, profile, originalBank));
      }
      nextProfile.backpackSlots = consumeBankTransferBackpackItem(nextSlots, item);
      bank = added.bank;
    }
    nextProfile.captureTools = captureToolBagFromProfile(nextProfile);
    nextProfile.stoneCoins = profileStoneCoins(nextProfile) - stoneCoins;
    bank.stoneCoins += stoneCoins;
    nextProfile.bank = bank;
    prepared.data.consumedEquipmentEnvelopes = nextConsumedLedger;
    const persisted = persistProfileForAccount(prepared.data, prepared.account, prepared.binding, nextProfile, now);
    save(prepared.data);
    return ok({
      account: publicAccount(prepared.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(prepared.account, prepared.data),
      profile: clone(nextProfile),
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
    const rawBankConflict = rawBankAssetConflict(profile.bank);
    if (rawBankConflict) {
      return fail(rawBankConflict.code, rawBankConflict.message, rawBankProfilePayload(prepared, profile));
    }
    const parsedItems = parseBankTransferItems(payload.items || payload.itemAmounts || [], "withdraw");
    if (!parsedItems.ok) {
      return fail(parsedItems.code, parsedItems.message, profilePayload(prepared, profile));
    }
    const items = parsedItems.items;
    const stoneCoins = normalizeCoinAmount(payload.stoneCoins || payload.coins || 0);
    if (stoneCoins <= 0 && items.length <= 0) {
      return fail("bank_withdraw_empty", "请选择要取出的石币或物品。", profilePayload(prepared, profile));
    }
    const originalBank = normalizeBank(profile.bank);
    let bank = clone(originalBank);
    if (stoneCoins > bank.stoneCoins) {
      return fail("bank_stone_coins_not_enough", "银行石币不足，无法取出。", profilePayload(prepared, profile, bank));
    }
    if (profileStoneCoins(profile) + stoneCoins > profileStoneCoinLimit) {
      return fail("wallet_stone_coin_limit", `身上石币上限为${profileStoneCoinLimit}，请先存入银行。`, profilePayload(prepared, profile, bank));
    }
    let nextProfile = clone(profile);
    const envelopeRegistry = createEquipmentEnvelopeOwnershipRegistry(prepared.data);
    const consumedEnvelopeIds = [];
    const withdrawItems = [];
    for (const item of items) {
      if (isBankEquipmentItem(item.itemId)) {
        const removed = removeEquipmentEnvelopeFromBank(
          bank,
          item.envelopeId,
          item.bankSlotIndex,
          item.itemId,
          battleEquipmentCatalog,
          bankProfileStateOptions(),
        );
        if (!removed.ok) {
          return fail(removed.code, removed.message, profilePayload(prepared, profile, originalBank));
        }
        const ownership = envelopeRegistry.requireUnique(removed.envelope.envelopeId, {
          kind: OWNER_KIND_BANK,
          id: prepared.binding.playerId,
        });
        if (!ownership.ok) {
          return fail(ownership.code, ownership.message, profilePayload(prepared, profile, originalBank));
        }
        const beforeSlots = profileBackpackSlots(nextProfile);
        const imported = importBackpackEquipmentEnvelope(
          nextProfile,
          battleEquipmentCatalog,
          removed.envelope,
          equipmentEnvelopeOptions(nextProfile, item.itemId, {trustedServerEnvelope: true}),
        );
        if (!imported.ok) {
          return fail(imported.code, imported.message, profilePayload(prepared, profile, originalBank));
        }
        const targeted = moveImportedTemplateToRequestedSlot(
          beforeSlots,
          imported.profile,
          item.itemId,
          item.targetSlotIndex,
        );
        if (!targeted.ok) {
          return fail(targeted.code, targeted.message, profilePayload(prepared, profile, originalBank));
        }
        nextProfile = targeted.profile;
        bank = removed.bank;
        consumedEnvelopeIds.push(removed.envelope.envelopeId);
        item.instanceId = imported.instanceId;
        continue;
      }
      const removed = removeOrdinaryItemFromBank(
        bank,
        item.itemId,
        item.count,
        item.bankSlotIndex,
        battleEquipmentCatalog,
        bankProfileStateOptions(),
      );
      if (!removed.ok) {
        const label = itemAmountText([item]);
        return fail(removed.code, removed.code === "bank_item_not_enough" ? `${label} 数量不够，无法取出。` : removed.message, profilePayload(prepared, profile, originalBank));
      }
      bank = removed.bank;
      withdrawItems.push({itemId: item.itemId, count: item.count});
    }
    const addResult = addRewardItemsToBackpack(profileBackpackSlots(nextProfile), withdrawItems);
    if (normalizeMailItems(addResult.lostItems || []).length > 0) {
      return fail("bank_backpack_full", "背包空间不足，无法取出这些物品。", profilePayload(prepared, profile, originalBank));
    }
    nextProfile.backpackSlots = addResult.slots;
    nextProfile.captureTools = captureToolBagFromProfile(nextProfile);
    nextProfile.stoneCoins = profileStoneCoins(nextProfile) + stoneCoins;
    bank.stoneCoins -= stoneCoins;
    nextProfile.bank = bank;
    const consumed = ensureConsumedEquipmentEnvelopeIds(
      prepared.data.consumedEquipmentEnvelopes,
      consumedEnvelopeIds,
    );
    if (!consumed.ok) {
      return fail(consumed.code, consumed.message, profilePayload(prepared, profile, originalBank));
    }
    prepared.data.consumedEquipmentEnvelopes = consumed.ledger;
    const persisted = persistProfileForAccount(prepared.data, prepared.account, prepared.binding, nextProfile, now);
    save(prepared.data);
    return ok({
      account: publicAccount(prepared.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(prepared.account, prepared.data),
      profile: clone(nextProfile),
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
    const marketBook = auditMarketListingBook(
      objectMap(data.marketListings),
      battleEquipmentCatalog,
      marketListingStateOptions(),
    );
    if (!marketBook.ok) {
      return fail(marketBook.code, marketBook.message);
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
    const marketBook = auditMarketListingBook(
      objectMap(prepared.data.marketListings),
      battleEquipmentCatalog,
      marketListingStateOptions(),
    );
    if (!marketBook.ok) {
      return fail(marketBook.code, marketBook.message, profilePayload(prepared, prepared.profile));
    }
    const itemId = String(payload.itemId || payload.item || "").trim();
    const isEquipment = isMarketEquipmentItem(itemId);
    const equipmentIntent = isEquipment ? parseMarketEquipmentListingIntent(payload, itemId) : null;
    if (equipmentIntent && !equipmentIntent.ok) {
      return fail(equipmentIntent.code, equipmentIntent.message, profilePayload(prepared, prepared.profile));
    }
    const count = isEquipment ? 1 : normalizeListingCount(payload.count || payload.amount || 0);
    const unitPrice = isEquipment
      ? equipmentIntent.unitPrice
      : normalizeUnitPrice(payload.unitPrice || payload.price || 0);
    const currency = isEquipment
      ? equipmentIntent.currency
      : normalizeMarketCurrency(payload.currency || payload.priceCurrency || MARKET_CURRENCY_STONE_COINS);
    const items = normalizeLimitedItems([{itemId, count}]);
    if (items.length <= 0 || items[0].itemId !== itemId) {
      return fail("market_item_invalid", "请选择可以上架的物品。", profilePayload(prepared, prepared.profile));
    }
    if (bagItemIsBound(itemId)) {
      return fail("market_item_bound", `${bagItemLabel(itemId)} 已绑定，不能上架交易所。`, profilePayload(prepared, prepared.profile));
    }
    if (count <= 0) {
      return fail("market_count_invalid", "上架数量需要大于0。", profilePayload(prepared, prepared.profile));
    }
    if (unitPrice <= 0) {
      return fail("market_price_invalid", "单价需要大于0。", profilePayload(prepared, prepared.profile));
    }
    const activeListings = marketBook.listings;
    if (
      activeListings.filter((listing) => (
        listing.sellerAccountId === prepared.account.accountId
      )).length >= MARKET_MAX_LISTINGS_PER_SELLER
    ) {
      return fail("market_listing_limit", "你的挂单太多，请先卖出或取消一些。", profilePayload(prepared, prepared.profile));
    }
    if (activeListings.length >= MARKET_MAX_LISTINGS) {
      return fail("market_full", "交易所挂单已满，请稍后再试。", profilePayload(prepared, prepared.profile));
    }
    const listingIdentity = nextMarketListingId(prepared.data.marketListings);
    if (!listingIdentity.ok) {
      return fail(listingIdentity.code, listingIdentity.message, profilePayload(prepared, prepared.profile));
    }
    const listingId = listingIdentity.listingId;
    let profile = clone(prepared.profile);
    let listing;
    let nextConsumedLedger = prepared.data.consumedEquipmentEnvelopes;
    if (isEquipment) {
      const envelopeRegistry = createEquipmentEnvelopeOwnershipRegistry(prepared.data);
      const sourceOwnership = envelopeRegistry.requireMaterializedInstanceOrigin(
        prepared.binding.playerId,
        equipmentIntent.instanceId,
      );
      if (!sourceOwnership.ok) {
        return fail(sourceOwnership.code, sourceOwnership.message, profilePayload(prepared, prepared.profile));
      }
      if (sourceOwnership.hasOrigin) {
        const consumed = ensureConsumedEquipmentEnvelopeIds(nextConsumedLedger, sourceOwnership.envelopeId);
        if (!consumed.ok) {
          return fail(consumed.code, consumed.message, profilePayload(prepared, prepared.profile));
        }
        nextConsumedLedger = consumed.ledger;
      }
      const envelopeIdentity = nextMarketEquipmentEnvelopeId(envelopeRegistry);
      if (!envelopeIdentity.ok) {
        return fail(envelopeIdentity.code, envelopeIdentity.message, profilePayload(prepared, prepared.profile));
      }
      const exported = exportBackpackEquipmentEnvelope(
        profile,
        battleEquipmentCatalog,
        itemId,
        equipmentIntent.instanceId,
        equipmentEnvelopeOptions(profile, itemId, {
          sourceSlotIndex: equipmentIntent.sourceSlotIndex,
          envelopeId: envelopeIdentity.envelopeId,
        }),
      );
      if (!exported.ok) {
        return fail(exported.code, exported.message, profilePayload(prepared, prepared.profile));
      }
      const built = buildEquipmentMarketListing({
        listingId,
        sellerAccountId: prepared.account.accountId,
        itemId,
        count: 1,
        unitPrice,
        currency,
        createdAt: isoNow(now),
      }, exported.envelope, battleEquipmentCatalog, marketListingStateOptions());
      if (!built.ok) {
        return fail(built.code, built.message, profilePayload(prepared, prepared.profile));
      }
      profile = exported.profile;
      profile.captureTools = captureToolBagFromProfile(profile);
      listing = built.listing;
    } else {
      const slots = profileBackpackSlots(profile);
      const missing = firstMissingBackpackItem(slots, items);
      if (missing) {
        return fail("market_item_not_enough", `${missing.label} 数量不够，无法上架。`, profilePayload(prepared, profile));
      }
      profile.backpackSlots = consumeBackpackItem(slots, itemId, count);
      profile.captureTools = captureToolBagFromProfile(profile);
      listing = {
        listingId,
        sellerAccountId: prepared.account.accountId,
        itemId,
        count,
        unitPrice,
        currency,
        createdAt: isoNow(now),
        schemaVersion: 1,
      };
    }
    const tutorialSale = !isEquipment && tutorialSaleIsEligible(currentProfileQuestId(profile), listing);
    const tutorialSaleMailIdentity = tutorialSale
      ? nextEconomyMailId(
        prepared.data,
        "mail_tutorial_market_",
        "tutorial_market_sale_mail_id_unavailable",
        "教学成交邮件编号暂时不可用，本次上架已取消，请重试。",
      )
      : {ok: true, mailId: ""};
    if (!tutorialSaleMailIdentity.ok) {
      return fail(
        tutorialSaleMailIdentity.code,
        tutorialSaleMailIdentity.message,
        profilePayload(prepared, prepared.profile),
      );
    }
    const nextListings = {...objectMap(prepared.data.marketListings), [listingId]: listing};
    const nextMarketBook = auditMarketListingBook(
      nextListings,
      battleEquipmentCatalog,
      marketListingStateOptions(),
    );
    if (!nextMarketBook.ok) {
      return fail(nextMarketBook.code, nextMarketBook.message, profilePayload(prepared, prepared.profile));
    }
    prepared.data.consumedEquipmentEnvelopes = nextConsumedLedger;
    prepared.data.marketListings = nextListings;
    const questMessages = recordAndClaimQuest(profile, {
      type: "market_list",
      itemId,
      amount: count,
      unitPrice,
      currency,
      schemaVersion: 1,
    });
    let saleMail = null;
    if (tutorialSale && questMessages.length > 0) {
      const saleMailResult = createTutorialMarketSaleMail(
        prepared.data,
        prepared.account,
        listing,
        tutorialSaleMailIdentity.mailId,
      );
      if (!saleMailResult.ok) {
        return fail(
          saleMailResult.code,
          saleMailResult.message,
          profilePayload(prepared, prepared.profile),
        );
      }
      saleMail = saleMailResult.mail;
      delete prepared.data.marketListings[listingId];
    }
    const persisted = persistProfileForAccount(prepared.data, prepared.account, prepared.binding, profile, now);
    save(prepared.data);
    return ok({
      account: publicAccount(prepared.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(prepared.account, prepared.data),
      profile: clone(profile),
      listing: publicMarketListing(listing, prepared.data),
      saleMail: saleMail && publicMail ? publicMail(saleMail) : (saleMail ? clone(saleMail) : null),
      questMessages,
      ...marketStatePayload(prepared.data, prepared.account),
      message: saleMail ? `教学买家已买下${itemAmountText(items)}，请到邮箱领取货款。` : `已上架${itemAmountText(items)}。`,
    });
  }

  function buyMarketListing(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const listingId = String(payload.listingId || payload.id || "").trim();
    const marketBook = auditMarketListingBook(
      objectMap(data.marketListings),
      battleEquipmentCatalog,
      marketListingStateOptions(),
    );
    if (!marketBook.ok) {
      return fail(marketBook.code, marketBook.message);
    }
    if (isTutorialBuyListingForAccount(listingId, resolved.account.accountId)) {
      return buyTutorialMarketListing(data, resolved.account, listingId);
    }
    const rawListing = data.marketListings && data.marketListings[listingId];
    if (!rawListing) {
      return fail("market_listing_missing", "这条挂单已经不存在。");
    }
    const listing = marketBook.listingById[listingId];
    if (!listing) {
      return fail("market_listing_missing", "这条挂单已经不存在。");
    }
    if (bagItemIsBound(listing.itemId)) {
      return fail("market_item_bound", `${bagItemLabel(listing.itemId)} 已绑定，不能继续交易。`);
    }
    if (listing.sellerAccountId === resolved.account.accountId) {
      return fail("market_buy_self", "不能购买自己的挂单。");
    }
    if (listing.equipmentEnvelope) {
      const ownership = createEquipmentEnvelopeOwnershipRegistry(data).requireUnique(
        listing.equipmentEnvelope.envelopeId,
        {kind: OWNER_KIND_MARKET, id: listingId},
      );
      if (!ownership.ok) {
        return fail(ownership.code, ownership.message, {
          listing: publicMarketListing(listing, data),
          ...marketStatePayload(data, resolved.account),
        });
      }
    }
    const seller = accountById(data, listing.sellerAccountId);
    if (!seller) {
      return fail("market_seller_missing", "卖家账号档案异常，挂单会原样保留，请联系GM处理。");
    }
    const saleMailIdentity = nextEconomyMailId(
      data,
      "mail_market_",
      "market_sale_mail_id_unavailable",
      "成交邮件编号暂时不可用，本次购买已取消，请重试。",
    );
    if (!saleMailIdentity.ok) {
      return fail(saleMailIdentity.code, saleMailIdentity.message, {
        listing: publicMarketListing(listing, data),
        ...marketStatePayload(data, resolved.account),
      });
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
    let buyerProfile = clone(buyerPrepared.profile);
    let nextConsumedLedger = data.consumedEquipmentEnvelopes;
    if (profileCurrencyAmount(buyerProfile, listing.currency) < totalPrice) {
      return fail("market_not_enough_currency", `${shopCurrencyLabel(listing.currency)}不足，无法购买。`, {
        listing: publicMarketListing(listing, data),
        ...marketStatePayload(data, resolved.account),
      });
    }
    if (listing.equipmentEnvelope) {
      const imported = importBackpackEquipmentEnvelope(
        buyerProfile,
        battleEquipmentCatalog,
        listing.equipmentEnvelope,
        equipmentEnvelopeOptions(buyerProfile, listing.itemId, {trustedServerEnvelope: true}),
      );
      if (!imported.ok) {
        const code = imported.code === "equipment_transfer_backpack_full"
          ? "market_backpack_full"
          : imported.code;
        const message = code === "market_backpack_full" ? "背包空间不足，无法购买。" : imported.message;
        return fail(code, message, {
          listing: publicMarketListing(listing, data),
          ...marketStatePayload(data, resolved.account),
        });
      }
      buyerProfile = imported.profile;
      const consumed = ensureConsumedEquipmentEnvelopeIds(
        nextConsumedLedger,
        listing.equipmentEnvelope.envelopeId,
      );
      if (!consumed.ok) {
        return fail(consumed.code, consumed.message, {
          listing: publicMarketListing(listing, data),
          ...marketStatePayload(data, resolved.account),
        });
      }
      nextConsumedLedger = consumed.ledger;
    } else {
      const addResult = addRewardItemsToBackpack(
        profileBackpackSlots(buyerProfile),
        [{itemId: listing.itemId, count: listing.count}],
      );
      if (normalizeMailItems(addResult.lostItems || []).length > 0) {
        return fail("market_backpack_full", "背包空间不足，无法购买。", {
          listing: publicMarketListing(listing, data),
          ...marketStatePayload(data, resolved.account),
        });
      }
      buyerProfile.backpackSlots = addResult.slots;
    }
    const tax = marketTaxForListing(data, listing);
    const sellerReceives = Math.max(0, totalPrice - tax);
    buyerProfile.captureTools = captureToolBagFromProfile(buyerProfile);
    setProfileCurrencyAmount(buyerProfile, listing.currency, profileCurrencyAmount(buyerProfile, listing.currency) - totalPrice);
    const questMessages = recordAndClaimQuest(buyerProfile, {
      type: "market_buy",
      itemId: listing.itemId,
      amount: listing.count,
      unitPrice: listing.unitPrice,
      currency: listing.currency,
      sellerKind: "player",
      schemaVersion: 1,
    });
    const config = normalizeMarketConfig(data.marketConfig);
    config.taxCollected[listing.currency] = normalizeCoinAmount(config.taxCollected[listing.currency]) + tax;
    data.consumedEquipmentEnvelopes = nextConsumedLedger;
    data.marketConfig = config;
    const buyerPersisted = persistProfileForAccount(data, resolved.account, buyerPrepared.binding, buyerProfile, now);
    const saleMailResult = createMarketSaleMail(
      data,
      seller,
      listing,
      tax,
      sellerReceives,
      saleMailIdentity.mailId,
    );
    if (!saleMailResult.ok) {
      return fail(saleMailResult.code, saleMailResult.message, {
        listing: publicMarketListing(listing, data),
        ...marketStatePayload(data, resolved.account),
      });
    }
    const saleMail = saleMailResult.mail;
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
      questMessages,
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
    const rawListing = data.marketListings && data.marketListings[listingId];
    const rawSellerAccountId = rawListing && typeof rawListing === "object" && !Array.isArray(rawListing)
      ? String(rawListing.sellerAccountId || "").trim()
      : "";
    if (!rawListing || rawSellerAccountId !== resolved.account.accountId) {
      return fail("market_listing_missing", "这条挂单已经不存在。");
    }
    const marketBook = auditMarketListingBook(
      objectMap(data.marketListings),
      battleEquipmentCatalog,
      marketListingStateOptions(),
    );
    if (!marketBook.ok) {
      return fail(marketBook.code, marketBook.message);
    }
    const listing = marketBook.listingById[listingId];
    if (!listing) {
      return fail("market_listing_missing", "这条挂单已经不存在。");
    }
    if (listing.equipmentEnvelope) {
      const ownership = createEquipmentEnvelopeOwnershipRegistry(data).requireUnique(
        listing.equipmentEnvelope.envelopeId,
        {kind: OWNER_KIND_MARKET, id: listingId},
      );
      if (!ownership.ok) {
        return fail(ownership.code, ownership.message, {
          listing: publicMarketListing(listing, data),
          ...marketStatePayload(data, resolved.account),
        });
      }
    }
    const prepared = profileForAccount(data, resolved.account);
    if (!prepared.ok) {
      return prepared;
    }
    let profile = clone(prepared.profile);
    let nextConsumedLedger = data.consumedEquipmentEnvelopes;
    if (listing.equipmentEnvelope) {
      const imported = importBackpackEquipmentEnvelope(
        profile,
        battleEquipmentCatalog,
        listing.equipmentEnvelope,
        equipmentEnvelopeOptions(profile, listing.itemId, {trustedServerEnvelope: true}),
      );
      if (!imported.ok) {
        const code = imported.code === "equipment_transfer_backpack_full"
          ? "market_backpack_full"
          : imported.code;
        const message = code === "market_backpack_full" ? "背包空间不足，暂时不能下架。" : imported.message;
        return fail(code, message, {
          listing: publicMarketListing(listing, data),
          ...marketStatePayload(data, resolved.account),
        });
      }
      profile = imported.profile;
      const consumed = ensureConsumedEquipmentEnvelopeIds(
        nextConsumedLedger,
        listing.equipmentEnvelope.envelopeId,
      );
      if (!consumed.ok) {
        return fail(consumed.code, consumed.message, {
          listing: publicMarketListing(listing, data),
          ...marketStatePayload(data, resolved.account),
        });
      }
      nextConsumedLedger = consumed.ledger;
    } else {
      const addResult = addRewardItemsToBackpack(
        profileBackpackSlots(profile),
        [{itemId: listing.itemId, count: listing.count}],
      );
      if (normalizeMailItems(addResult.lostItems || []).length > 0) {
        return fail("market_backpack_full", "背包空间不足，暂时不能下架。", {
          listing: publicMarketListing(listing, data),
          ...marketStatePayload(data, resolved.account),
        });
      }
      profile.backpackSlots = addResult.slots;
    }
    profile.captureTools = captureToolBagFromProfile(profile);
    data.consumedEquipmentEnvelopes = nextConsumedLedger;
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

  function buyTutorialMarketListing(data, account, listingId) {
    const prepared = profileForAccount(data, account);
    if (!prepared.ok) {
      return prepared;
    }
    if (currentProfileQuestId(prepared.profile) !== TUTORIAL_BUY_QUEST_ID) {
      return fail("market_listing_missing", "这条挂单已经不存在。");
    }
    const listing = tutorialBuyListing(account, isoNow(now));
    if (!listing || listing.listingId !== listingId) {
      return fail("market_listing_missing", "这条挂单已经不存在。");
    }
    if (firstUnsupportedEquipmentTransfer([listing])) {
      return fail(
        "market_equipment_transfer_unsupported",
        `${bagItemLabel(listing.itemId)} 暂不能通过教学交易购买。`,
      );
    }
    const profile = clone(prepared.profile);
    const totalPrice = marketListingTotalPrice(listing);
    if (profileCurrencyAmount(profile, listing.currency) < totalPrice) {
      return fail("market_not_enough_currency", `${shopCurrencyLabel(listing.currency)}不足，无法购买。`, {
        listing: publicMarketListing(listing, data),
        ...marketStatePayload(data, account),
      });
    }
    const addResult = addRewardItemsToBackpack(profileBackpackSlots(profile), [{itemId: listing.itemId, count: listing.count}]);
    if (normalizeMailItems(addResult.lostItems || []).length > 0) {
      return fail("market_backpack_full", "背包空间不足，无法购买。", {
        listing: publicMarketListing(listing, data),
        ...marketStatePayload(data, account),
      });
    }
    profile.backpackSlots = addResult.slots;
    profile.captureTools = captureToolBagFromProfile(profile);
    setProfileCurrencyAmount(profile, listing.currency, profileCurrencyAmount(profile, listing.currency) - totalPrice);
    const questMessages = recordAndClaimQuest(profile, {
      type: "market_buy",
      itemId: listing.itemId,
      amount: listing.count,
      unitPrice: listing.unitPrice,
      currency: listing.currency,
      sellerKind: TUTORIAL_SELLER_KIND,
      schemaVersion: 1,
    });
    const persisted = persistProfileForAccount(data, account, prepared.binding, profile, now);
    save(data);
    return ok({
      account: publicAccount(account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(account, data),
      profile: clone(profile),
      listing: publicMarketListing(listing, data),
      receipt: publicMarketReceipt("buy", listing, 0, 0, data),
      questMessages,
      ...marketStatePayload(data, account),
      message: `已用${totalPrice}${shopCurrencyLabel(listing.currency)}买下教学卖家的${bagItemLabel(listing.itemId)}。`,
    });
  }

  function recordAndClaimQuest(profile, event) {
    const messages = [];
    const progress = recordQuestEventToProfile(profile, event);
    if (progress.changed && progress.message) {
      messages.push(progress.message);
    }
    if (progress.ready && activeQuestAutoClaim(profile)) {
      const claim = claimActiveQuestToProfile(profile);
      if (claim.ok && claim.message) {
        messages.push(claim.message);
      }
    }
    return messages;
  }

  function proposeTrade(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const intent = readTradeProposalIntent(payload);
    if (!intent.ok) {
      return fail(intent.code, intent.message);
    }
    const parsedItems = parseTradeTransferItems(intent.items);
    if (!parsedItems.ok) {
      return fail(parsedItems.code, parsedItems.message);
    }
    const targetUsername = normalizeUsername(intent.targetUsername);
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
    const offerItems = parsedItems.items;
    const offerStoneCoins = intent.stoneCoins;
    const boundOfferItem = offerItems.find((item) => bagItemIsBound(item.itemId));
    if (boundOfferItem) {
      return fail("trade_item_bound", `${bagItemLabel(boundOfferItem.itemId)} 已绑定，不能与其他玩家交易。`);
    }
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
    const reservedEquipment = prepareTradeEquipmentReservations(
      data,
      prepared.binding,
      profile,
      parsedItems.equipmentIntents,
    );
    if (!reservedEquipment.ok) {
      return fail(reservedEquipment.code, reservedEquipment.message, profilePayload(prepared, profile));
    }
    const missing = firstMissingBackpackItem(
      profileBackpackSlots(reservedEquipment.profile),
      parsedItems.ordinaryItems,
    );
    if (missing) {
      return fail("trade_item_not_enough", `${missing.label} 数量不够，无法发起交易。`, profilePayload(prepared, profile));
    }
    expireTradeOffers(data);
    const capacity = tradeOfferCapacityCheck(data, resolved.account.accountId, target.accountId);
    if (!capacity.ok) {
      return capacity;
    }
    const duplicateReservation = firstDuplicateActiveEquipmentReservation(
      data,
      resolved.account.accountId,
      reservedEquipment.reservations,
    );
    if (duplicateReservation) {
      return fail(
        "trade_equipment_already_reserved",
        `${bagItemLabel(duplicateReservation.itemId)} 已用于另一笔待确认交易，请先取消或等待过期。`,
      );
    }
    const tradeIdentity = nextTradeId(data.tradeOffers);
    if (!tradeIdentity.ok) {
      return fail(tradeIdentity.code, tradeIdentity.message);
    }
    const tradeId = tradeIdentity.tradeId;
    const schemaVersion = reservedEquipment.reservations.length > 0 ? 2 : 1;
    const offer = {
      tradeId,
      fromAccountId: resolved.account.accountId,
      toAccountId: target.accountId,
      offerItems,
      offerStoneCoins,
      ...(schemaVersion === 2 ? {offerEquipmentReservations: reservedEquipment.reservations} : {}),
      createdAt: isoNow(now),
      expiresAt: new Date(now() + TRADE_OFFER_TTL_MS).toISOString(),
      schemaVersion,
    };
    data.tradeOffers[tradeId] = offer;
    return ok({
      trade: publicTradeOffer(offer, data),
      message: "交易请求已发出。",
    });
  }

  function acceptTrade(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const intent = readTradeAcceptIntent(payload);
    if (!intent.ok) {
      return fail(intent.code, intent.message);
    }
    const tradeId = intent.tradeId;
    const rawOffer = data.tradeOffers[tradeId];
    if (!rawOffer || rawOffer.toAccountId !== resolved.account.accountId || tradeOfferIsExpired(rawOffer)) {
      return fail("trade_offer_missing", "交易请求不存在或已过期。");
    }
    const checkedOffer = readStoredTradeOffer(rawOffer, tradeId);
    if (!checkedOffer.ok) {
      return fail(checkedOffer.code, checkedOffer.message);
    }
    const offer = checkedOffer.offer;
    const parsedCounter = parseTradeTransferItems(intent.items);
    if (!parsedCounter.ok) {
      return fail(parsedCounter.code, parsedCounter.message);
    }
    const initiator = accountById(data, offer.fromAccountId);
    if (!initiator) {
      return fail("trade_target_missing", "交易发起人不存在。");
    }
    if (
      typeof activeBattleRoomForAccount === "function"
      && (
        activeBattleRoomForAccount(data, initiator.accountId)
        || activeBattleRoomForAccount(data, resolved.account.accountId)
      )
    ) {
      return fail(
        "battle_profile_mutation_locked",
        "任一方正在战斗时不能完成交易，请在战斗结束后重试。",
      );
    }
    const positionCheck = tradePositionCheck(data, initiator.accountId, resolved.account.accountId);
    if (!positionCheck.ok) {
      return positionCheck;
    }
    const counterItems = parsedCounter.items;
    const offerItems = offer.offerItems;
    const counterStoneCoins = intent.stoneCoins;
    const boundCounterItem = counterItems.find((item) => bagItemIsBound(item.itemId));
    if (boundCounterItem) {
      return fail("trade_item_bound", `${bagItemLabel(boundCounterItem.itemId)} 已绑定，不能与其他玩家交易。`);
    }
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
    if (tradeProfileOfflineHangActive(initiatorProfile) || tradeProfileOfflineHangActive(accepterProfile)) {
      return fail(
        "offline_hang_profile_mutation_locked",
        "任一方正在离线挂机时不能完成交易，请先结束离线挂机。",
      );
    }
    const offerStoneCoins = normalizeCoinAmount(offer.offerStoneCoins || 0);
    const boundOfferItem = offerItems.find((item) => bagItemIsBound(item.itemId));
    if (boundOfferItem) {
      return fail("trade_item_bound", `${bagItemLabel(boundOfferItem.itemId)} 已绑定，不能与其他玩家交易。`);
    }
    const initiatorCoinCheck = canPayProfile(initiatorProfile, [], offerStoneCoins, "trade_initiator");
    if (!initiatorCoinCheck.ok) {
      return initiatorCoinCheck;
    }
    const accepterCoinCheck = canPayProfile(accepterProfile, [], counterStoneCoins, "trade_acceptor");
    if (!accepterCoinCheck.ok) {
      return accepterCoinCheck;
    }
    const envelopeRegistry = createEquipmentEnvelopeOwnershipRegistry(data);
    if (envelopeRegistry.conflicts.length > 0) {
      return fail(
        "equipment_transfer_envelope_duplicate",
        "装备转运归属异常，本次交易已取消；双方资产会原样保留，请联系GM处理。",
      );
    }
    const allocatedEnvelopeIds = new Set();
    const initiatorEquipment = exportReservedTradeEquipment(
      initiatorProfile,
      initiatorPrepared.binding,
      offer.offerEquipmentReservations,
      envelopeRegistry,
      allocatedEnvelopeIds,
    );
    if (!initiatorEquipment.ok) {
      return fail(initiatorEquipment.code, initiatorEquipment.message);
    }
    const accepterEquipment = exportSelectedTradeEquipment(
      accepterProfile,
      accepterPrepared.binding,
      parsedCounter.equipmentIntents,
      envelopeRegistry,
      allocatedEnvelopeIds,
    );
    if (!accepterEquipment.ok) {
      return fail(accepterEquipment.code, accepterEquipment.message);
    }
    const offerOrdinaryItems = offerItems.filter((item) => !isBankEquipmentItem(item.itemId));
    const initiatorCheck = canPayProfile(
      initiatorEquipment.profile,
      offerOrdinaryItems,
      offerStoneCoins,
      "trade_initiator",
    );
    if (!initiatorCheck.ok) {
      return initiatorCheck;
    }
    const accepterCheck = canPayProfile(
      accepterEquipment.profile,
      parsedCounter.ordinaryItems,
      counterStoneCoins,
      "trade_acceptor",
    );
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
    const nextInitiator = applyTradePayment(
      initiatorEquipment.profile,
      offerOrdinaryItems,
      offerStoneCoins,
      parsedCounter.ordinaryItems,
      counterStoneCoins,
    );
    if (!nextInitiator.ok) {
      return fail("trade_initiator_backpack_full", "对方背包空间不足，交易无法完成。");
    }
    const nextAccepter = applyTradePayment(
      accepterEquipment.profile,
      parsedCounter.ordinaryItems,
      counterStoneCoins,
      offerOrdinaryItems,
      offerStoneCoins,
    );
    if (!nextAccepter.ok) {
      return fail("trade_acceptor_backpack_full", "你的背包空间不足，交易无法完成。");
    }
    const initiatorImported = importTradeEquipmentBatch(
      nextInitiator.profile,
      accepterEquipment.envelopes,
      "trade_initiator_backpack_full",
      "对方背包空间不足，交易无法完成。",
    );
    if (!initiatorImported.ok) {
      return fail(initiatorImported.code, initiatorImported.message);
    }
    const accepterImported = importTradeEquipmentBatch(
      nextAccepter.profile,
      initiatorEquipment.envelopes,
      "trade_acceptor_backpack_full",
      "你的背包空间不足，交易无法完成。",
    );
    if (!accepterImported.ok) {
      return fail(accepterImported.code, accepterImported.message);
    }
    initiatorImported.profile.captureTools = captureToolBagFromProfile(initiatorImported.profile);
    accepterImported.profile.captureTools = captureToolBagFromProfile(accepterImported.profile);
    const consumed = ensureConsumedEquipmentEnvelopeIds(
      data.consumedEquipmentEnvelopes,
      [
        ...initiatorEquipment.priorOriginEnvelopeIds,
        ...accepterEquipment.priorOriginEnvelopeIds,
        ...initiatorEquipment.envelopes.map((envelope) => envelope.envelopeId),
        ...accepterEquipment.envelopes.map((envelope) => envelope.envelopeId),
      ],
    );
    if (!consumed.ok) {
      return fail(consumed.code, consumed.message);
    }
    const candidateData = cloneAuthorityRoot(data);
    candidateData.consumedEquipmentEnvelopes = consumed.ledger;
    const candidateInitiator = accountById(candidateData, initiator.accountId);
    const candidateAccepter = accountById(candidateData, resolved.account.accountId);
    const initiatorPersisted = persistProfileForAccount(
      candidateData,
      candidateInitiator,
      clone(initiatorPrepared.binding),
      initiatorImported.profile,
      now,
    );
    const accepterPersisted = persistProfileForAccount(
      candidateData,
      candidateAccepter,
      clone(accepterPrepared.binding),
      accepterImported.profile,
      now,
    );
    delete candidateData.tradeOffers[tradeId];
    const candidateRegistry = createEquipmentEnvelopeOwnershipRegistry(candidateData);
    if (candidateRegistry.conflicts.length > 0) {
      return fail(
        "equipment_transfer_envelope_duplicate",
        "装备转运归属异常，本次交易已取消；双方资产会原样保留，请联系GM处理。",
      );
    }
    save(candidateData);
    const receiptSchemaVersion = initiatorEquipment.envelopes.length > 0 || accepterEquipment.envelopes.length > 0
      ? 2
      : 1;
    return ok({
      trade: {
        tradeId,
        fromAccountId: initiator.accountId,
        toAccountId: resolved.account.accountId,
        offerItems,
        offerStoneCoins,
        counterItems,
        counterStoneCoins,
        schemaVersion: receiptSchemaVersion,
      },
      account: publicAccount(candidateAccepter),
      profileBinding: accepterPersisted.binding,
      profileSummary: profileSummaryForAccount(candidateAccepter, candidateData),
      profile: clone(accepterImported.profile),
      otherProfileSummary: profileSummaryForAccount(candidateInitiator, candidateData),
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
    const backpackConflict = typeof rawBackpackAssetConflict === "function"
      ? rawBackpackAssetConflict(profileDoc.profile)
      : {ok: false, code: "backpack_asset_guard_missing", message: "背包安全校验暂不可用，本次操作已取消，请联系GM处理。"};
    if (backpackConflict) {
      return fail(backpackConflict.code, backpackConflict.message, {
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

  function isBankEquipmentItem(itemId) {
    const normalized = String(itemId || "").trim();
    if (normalized === "") {
      return false;
    }
    if (equipmentItemPredicate) {
      return equipmentItemPredicate(normalized);
    }
    // Missing catalog authority must fail closed rather than reopening template-only transfers.
    return !battleEquipmentCatalog
      || !(battleEquipmentCatalog.itemById instanceof Map)
      || battleEquipmentCatalog.itemById.has(normalized);
  }

  function bankProfileStateOptions() {
    return {
      tabCount: BANK_TAB_COUNT,
      slotsPerTab: BANK_SLOTS_PER_TAB,
      defaultUnlockedTabs: BANK_DEFAULT_UNLOCKED_TABS,
      stoneCoinLimit: bankStoneCoinLimit,
      itemById: (itemId) => bagItemById(itemId),
      isEquipmentItemId: (itemId) => isBankEquipmentItem(itemId),
      itemStackLimit: (itemId) => bankItemStackLimit(itemId),
      equipmentTransferOptions,
    };
  }

  function equipmentEnvelopeOptions(profile, itemId, overrides = {}) {
    const slots = profileBackpackSlots(profile);
    return {
      ...equipmentTransferOptions,
      backpackSlotLimit: Math.max(1, slots.length),
      stackLimit: Math.max(1, bankItemStackLimit(itemId)),
      ...overrides,
    };
  }

  function isMarketEquipmentItem(itemId) {
    return isBankEquipmentItem(itemId);
  }

  function marketListingStateOptions() {
    return {
      itemById: (itemId) => bagItemById(itemId),
      isEquipmentItemId: (itemId) => isMarketEquipmentItem(itemId),
      maxCount: MARKET_MAX_LISTING_COUNT,
      maxUnitPrice: MARKET_MAX_UNIT_PRICE,
      currencies: [MARKET_CURRENCY_STONE_COINS, MARKET_CURRENCY_DIAMONDS],
      equipmentTransferOptions,
    };
  }

  function parseMarketEquipmentListingIntent(payload, expectedItemId) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return {
        ok: false,
        code: "market_equipment_intent_invalid",
        message: "装备上架请求格式异常，请刷新后重新选择。",
      };
    }
    const allowedFields = new Set([
      "itemId",
      "count",
      "instanceId",
      "sourceSlotIndex",
      "unitPrice",
      "currency",
    ]);
    if (Object.keys(payload).some((key) => !allowedFields.has(key))) {
      return {
        ok: false,
        code: "market_equipment_intent_invalid",
        message: "装备上架请求含未授权或无效字段，请刷新后重新选择。",
      };
    }
    if (
      typeof payload.itemId !== "string"
      || payload.itemId !== expectedItemId
      || payload.itemId !== payload.itemId.trim()
      || payload.count !== 1
      || !Number.isSafeInteger(payload.unitPrice)
      || payload.unitPrice < 1
      || payload.unitPrice > MARKET_MAX_UNIT_PRICE
      || ![MARKET_CURRENCY_STONE_COINS, MARKET_CURRENCY_DIAMONDS].includes(payload.currency)
    ) {
      return {
        ok: false,
        code: "market_equipment_intent_invalid",
        message: "装备上架请求含未授权或无效字段，请刷新后重新选择。",
      };
    }
    const instanceId = typeof payload.instanceId === "string" ? payload.instanceId.trim() : "";
    const sourceSlotIndex = payload.sourceSlotIndex;
    if (
      !Object.hasOwn(payload, "instanceId")
      || !Object.hasOwn(payload, "sourceSlotIndex")
      || instanceId === ""
      || !Number.isSafeInteger(sourceSlotIndex)
      || sourceSlotIndex < 0
    ) {
      return {
        ok: false,
        code: "market_equipment_selection_required",
        message: "请选择背包中的具体装备实例和格子后再上架。",
      };
    }
    return {
      ok: true,
      itemId: expectedItemId,
      count: 1,
      instanceId,
      sourceSlotIndex,
      unitPrice: payload.unitPrice,
      currency: payload.currency,
    };
  }

  function nextMarketListingId(listingsValue) {
    const listings = objectMap(listingsValue);
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const randomPart = String(randomId() || "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
      const listingId = `market_${randomPart}`;
      if (randomPart !== "" && listingId.length <= 96 && !Object.hasOwn(listings, listingId)) {
        return {ok: true, listingId};
      }
    }
    return {
      ok: false,
      code: "market_listing_id_unavailable",
      message: "交易所挂单编号暂时不可用，本次操作已取消，请重试。",
    };
  }

  function nextMarketEquipmentEnvelopeId(envelopeRegistry) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const randomPart = String(randomId() || "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 145);
      const envelopeId = `eqx_market_${randomPart}`;
      if (
        /^eqx_[A-Za-z0-9_-]{8,156}$/.test(envelopeId)
        && envelopeId.length <= 160
        && envelopeRegistry.isAvailable(envelopeId)
      ) {
        return {ok: true, envelopeId};
      }
    }
    return {
      ok: false,
      code: "market_equipment_envelope_id_unavailable",
      message: "装备托管编号暂时不可用，本次操作已取消，请重试。",
    };
  }

  function nextBankEquipmentEnvelopeId(envelopeRegistry, reservedEnvelopeIds) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const randomPart = String(randomId() || "").trim().replace(/[^A-Za-z0-9_-]/g, "");
      const envelopeId = `eqx_bank_${randomPart}`;
      if (
        /^eqx_[A-Za-z0-9_-]{8,156}$/.test(envelopeId)
        && envelopeId.length <= 160
        && envelopeRegistry.isAvailable(envelopeId)
        && !reservedEnvelopeIds.has(envelopeId)
      ) {
        return {ok: true, envelopeId};
      }
    }
    return {
      ok: false,
      code: "bank_equipment_envelope_id_unavailable",
      message: "装备转运编号暂时不可用，本次操作已取消，请重试。",
    };
  }

  function moveImportedTemplateToRequestedSlot(beforeSlotsValue, importedProfileValue, itemId, targetSlotIndexValue) {
    const targetSlotIndex = Number(targetSlotIndexValue);
    if (targetSlotIndex === -1) {
      return {ok: true, profile: importedProfileValue};
    }
    const beforeSlots = normalizeBackpackSlots(beforeSlotsValue);
    const afterSlots = normalizeBackpackSlots(profileBackpackSlots(importedProfileValue));
    if (!Number.isSafeInteger(targetSlotIndex) || targetSlotIndex < 0 || targetSlotIndex >= afterSlots.length) {
      return {
        ok: false,
        code: "bank_backpack_target_stale",
        message: "背包目标格已经变化，请刷新后重新选择。",
      };
    }
    let addedIndex = -1;
    for (let index = 0; index < afterSlots.length; index += 1) {
      const before = beforeSlots[index] || {};
      const after = afterSlots[index] || {};
      const beforeCount = String(before.itemId || "") === itemId ? Number(before.count || 0) : 0;
      const afterCount = String(after.itemId || "") === itemId ? Number(after.count || 0) : 0;
      if (afterCount === beforeCount + 1) {
        addedIndex = index;
        break;
      }
    }
    if (addedIndex < 0) {
      return {
        ok: false,
        code: "bank_equipment_import_invariant_failed",
        message: "装备取出后的背包表示异常，本次操作已取消。",
      };
    }
    if (addedIndex === targetSlotIndex) {
      return {ok: true, profile: importedProfileValue};
    }
    const targetBefore = beforeSlots[targetSlotIndex] || {};
    const targetItemId = String(targetBefore.itemId || "");
    const targetCount = Number(targetBefore.count || 0);
    const stackLimit = Math.max(1, bankItemStackLimit(itemId));
    if ((targetItemId !== "" && targetItemId !== itemId) || targetCount >= stackLimit) {
      return {
        ok: false,
        code: "bank_backpack_target_stale",
        message: "背包目标格已经变化，请刷新后重新选择。",
      };
    }
    const profile = clone(importedProfileValue);
    const slots = normalizeBackpackSlots(profileBackpackSlots(profile));
    const sourceCount = Number(slots[addedIndex] && slots[addedIndex].count || 0);
    slots[addedIndex] = sourceCount > 1 ? {itemId, count: sourceCount - 1} : {};
    slots[targetSlotIndex] = {itemId, count: targetCount + 1};
    profile.backpackSlots = slots;
    return {ok: true, profile};
  }

  function normalizeBank(value) {
    const read = readBankProfileState(value, battleEquipmentCatalog, bankProfileStateOptions());
    if (read.ok) {
      return read.bank;
    }
    return {
      stoneCoins: 0,
      items: [],
      slots: Array.from({length: BANK_SLOT_LIMIT}, () => ({})),
      unlockedTabs: BANK_DEFAULT_UNLOCKED_TABS,
      schemaVersion: 2,
    };
  }

  function rawBankAssetConflict(value) {
    const read = readBankProfileState(value, battleEquipmentCatalog, bankProfileStateOptions());
    return read.ok ? null : read;
  }

  function rawBankEntryConflict(entries) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return rawBankRepresentationConflict();
      }
      const itemId = String(entry.itemId || "").trim();
      const count = Number(entry.count ?? 0);
      if (itemId === "") {
        if (
          !Number.isSafeInteger(count)
          || count !== 0
          || Object.keys(entry).some((key) => !["itemId", "count"].includes(key))
        ) {
          return rawBankRepresentationConflict();
        }
        continue;
      }
      if (!bagItemById(itemId)) {
        return {
          code: "bank_item_unknown",
          message: "银行内有当前版本无法识别的物品，本次操作已取消；全部资产会原样保留，请联系GM处理。",
        };
      }
      if (!equipmentItemPredicate || equipmentItemPredicate(itemId)) {
        return {
          code: "bank_equipment_transfer_unsupported",
          message: `${bagItemLabel(itemId)} 暂不能由银行操作整理；本次操作已取消，全部资产会原样保留，请联系GM处理。`,
        };
      }
      if (!Number.isSafeInteger(count) || count < 1) {
        return rawBankRepresentationConflict();
      }
      if (Object.keys(entry).some((key) => !["itemId", "count"].includes(key))) {
        return rawBankRepresentationConflict();
      }
    }
    return null;
  }

  function rawBankRepresentationStateConflict(raw) {
    const itemRepresentations = [];
    if (Array.isArray(raw.items)) {
      itemRepresentations.push(rawBankItemCounts(raw.items));
    }
    if (Array.isArray(raw.itemAmounts)) {
      itemRepresentations.push(rawBankItemCounts(raw.itemAmounts));
    }
    if (itemRepresentations.length > 1 && itemRepresentations.some((counts) => counts !== itemRepresentations[0])) {
      return rawBankRepresentationConflict();
    }
    if (Array.isArray(raw.slots) && raw.slots.length > 0 && itemRepresentations.length > 0) {
      const slotCounts = rawBankItemCounts(raw.slots);
      if (itemRepresentations.some((counts) => counts !== slotCounts)) {
        return rawBankRepresentationConflict();
      }
    }
    if (Array.isArray(raw.slots)) {
      for (const slot of raw.slots) {
        const itemId = String(slot && slot.itemId || "").trim();
        if (itemId !== "" && Number(slot.count) > bankItemStackLimit(itemId)) {
          return rawBankRepresentationConflict();
        }
      }
    }
    for (const entries of [raw.items, raw.itemAmounts].filter(Array.isArray)) {
      if (rawBankRequiredSlotCount(entries) > BANK_SLOT_LIMIT) {
        return rawBankRepresentationConflict();
      }
    }
    const coinConflict = rawAliasedIntegerConflict(raw, "stoneCoins", "coins", 0, bankStoneCoinLimit);
    const tabConflict = rawAliasedIntegerConflict(raw, "unlockedTabs", "tabs", BANK_DEFAULT_UNLOCKED_TABS, BANK_TAB_COUNT);
    if (coinConflict || tabConflict) {
      return rawBankRepresentationConflict();
    }
    const unlockedTabs = Number(raw.unlockedTabs ?? raw.tabs ?? BANK_DEFAULT_UNLOCKED_TABS);
    const unlockedSlots = unlockedTabs * BANK_SLOTS_PER_TAB;
    if (Array.isArray(raw.slots) && raw.slots.some((slot, index) => index >= unlockedSlots && String(slot && slot.itemId || "").trim() !== "")) {
      return rawBankRepresentationConflict();
    }
    if (!Array.isArray(raw.slots) || raw.slots.length === 0) {
      for (const entries of [raw.items, raw.itemAmounts].filter(Array.isArray)) {
        if (rawBankRequiredSlotCount(entries) > unlockedSlots) {
          return rawBankRepresentationConflict();
        }
      }
    }
    const allowedRootFields = new Set(["stoneCoins", "coins", "items", "itemAmounts", "slots", "unlockedTabs", "tabs", "schemaVersion"]);
    return Object.keys(raw).some((key) => !allowedRootFields.has(key)) ? rawBankRepresentationConflict() : null;
  }

  function rawBankItemCounts(entries) {
    const counts = new Map();
    for (const entry of entries) {
      const itemId = String(entry && entry.itemId || "").trim();
      if (itemId === "") {
        continue;
      }
      counts.set(itemId, Number(counts.get(itemId) || 0) + Number(entry.count));
    }
    return JSON.stringify(Array.from(counts.entries()).sort(([left], [right]) => left.localeCompare(right)));
  }

  function rawBankRequiredSlotCount(entries) {
    const counts = new Map();
    for (const entry of entries) {
      const itemId = String(entry && entry.itemId || "").trim();
      if (itemId === "") {
        continue;
      }
      counts.set(itemId, Number(counts.get(itemId) || 0) + Number(entry.count));
    }
    let required = 0;
    for (const [itemId, count] of counts) {
      required += Math.ceil(count / bankItemStackLimit(itemId));
    }
    return required;
  }

  function rawAliasedIntegerConflict(raw, primaryField, legacyField, minimum, maximum) {
    const fields = [primaryField, legacyField].filter((field) => Object.hasOwn(raw, field));
    for (const field of fields) {
      const value = Number(raw[field]);
      if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        return true;
      }
    }
    return fields.length > 1 && Number(raw[primaryField]) !== Number(raw[legacyField]);
  }

  function rawBankRepresentationConflict() {
    return {
      code: "bank_representation_conflict",
      message: "银行物品或石币的两份档案不一致，本次操作已取消；全部资产会原样保留，请联系GM处理。",
    };
  }

  function rawSchemaVersionStatus(container, currentVersion) {
    if (!container || !Object.hasOwn(container, "schemaVersion")) {
      return "legacy";
    }
    const version = Number(container.schemaVersion);
    if (!Number.isInteger(version) || version < 1) {
      return "invalid";
    }
    return version > currentVersion ? "future" : "current";
  }

  function normalizeLimitedItems(value) {
    return normalizeMailItems(value).slice(0, TRADE_MAX_ITEM_LINES);
  }

  function firstUnsupportedEquipmentTransfer(items) {
    for (const item of Array.isArray(items) ? items : []) {
      const itemId = String(item && item.itemId || "").trim();
      if (itemId === "") {
        continue;
      }
      // Missing catalog authority must not silently reopen template-only equipment transfers.
      if (!equipmentItemPredicate || equipmentItemPredicate(itemId)) {
        return {itemId};
      }
    }
    return null;
  }

  function parseTradeTransferItems(value) {
    if (!Array.isArray(value)) {
      return {
        ok: false,
        code: "trade_items_invalid",
        message: "交易物品选择格式异常，请刷新后重试。",
      };
    }
    if (value.length > TRADE_MAX_ITEM_LINES) {
      return {
        ok: false,
        code: "trade_item_line_limit",
        message: `一次最多交易${TRADE_MAX_ITEM_LINES}种物品。`,
      };
    }
    const summaryEntries = [];
    const equipmentIntents = [];
    const selectedInstanceIds = new Set();
    for (const rawItem of value) {
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
        return {
          ok: false,
          code: "trade_item_invalid",
          message: "交易物品选择格式异常，请刷新后重试。",
        };
      }
      const hasPrimaryItemId = Object.hasOwn(rawItem, "itemId");
      const hasLegacyItemId = Object.hasOwn(rawItem, "id");
      if (
        !hasPrimaryItemId && !hasLegacyItemId
        || (hasPrimaryItemId && hasLegacyItemId && rawItem.itemId !== rawItem.id)
      ) {
        return {
          ok: false,
          code: "trade_item_invalid",
          message: "交易物品编号冲突，请刷新后重试。",
        };
      }
      const rawItemId = hasPrimaryItemId ? rawItem.itemId : rawItem.id;
      const itemId = typeof rawItemId === "string" ? rawItemId.trim() : "";
      if (itemId === "" || rawItemId !== itemId || !bagItemById(itemId)) {
        return {
          ok: false,
          code: "trade_item_invalid",
          message: "选择的交易物品无法识别，请刷新后重试。",
        };
      }
      const hasPrimaryCount = Object.hasOwn(rawItem, "count");
      const hasLegacyCount = Object.hasOwn(rawItem, "amount");
      if (
        !hasPrimaryCount && !hasLegacyCount
        || (hasPrimaryCount && hasLegacyCount && rawItem.count !== rawItem.amount)
      ) {
        return {
          ok: false,
          code: "trade_item_invalid",
          message: "交易物品数量冲突，请刷新后重试。",
        };
      }
      const count = hasPrimaryCount ? rawItem.count : rawItem.amount;
      if (!Number.isSafeInteger(count) || count < 1 || count > 999999999) {
        return {
          ok: false,
          code: "trade_item_invalid",
          message: "交易物品数量异常，请刷新后重试。",
        };
      }
      if (isBankEquipmentItem(itemId)) {
        const allowedFields = new Set(["itemId", "count", "instanceId", "sourceSlotIndex"]);
        const instanceId = typeof rawItem.instanceId === "string" ? rawItem.instanceId.trim() : "";
        if (
          Object.keys(rawItem).some((key) => !allowedFields.has(key))
          || rawItem.itemId !== itemId
          || rawItem.count !== 1
          || instanceId === ""
          || rawItem.instanceId !== instanceId
          || !Number.isSafeInteger(rawItem.sourceSlotIndex)
          || rawItem.sourceSlotIndex < 0
        ) {
          return {
            ok: false,
            code: "trade_equipment_selection_required",
            message: "请选择背包中的具体装备实例和格子后再交易。",
          };
        }
        if (selectedInstanceIds.has(instanceId)) {
          return {
            ok: false,
            code: "trade_equipment_instance_duplicate",
            message: "同一装备实例不能在一笔交易中重复选择。",
          };
        }
        selectedInstanceIds.add(instanceId);
        equipmentIntents.push({
          itemId,
          count: 1,
          instanceId,
          sourceSlotIndex: rawItem.sourceSlotIndex,
        });
        summaryEntries.push({itemId, count: 1});
        continue;
      }
      const allowedFields = new Set(["itemId", "id", "count", "amount"]);
      if (Object.keys(rawItem).some((key) => !allowedFields.has(key))) {
        return {
          ok: false,
          code: "trade_item_intent_invalid",
          message: "交易物品请求含未授权字段，请刷新后重试。",
        };
      }
      summaryEntries.push({itemId, count});
    }
    const items = normalizeMailItems(summaryEntries);
    return {
      ok: true,
      items,
      ordinaryItems: items.filter((item) => !isBankEquipmentItem(item.itemId)),
      equipmentIntents,
    };
  }

  function parseTradeStoneCoinIntent(payloadValue, legacyField) {
    const payload = payloadValue && typeof payloadValue === "object" && !Array.isArray(payloadValue)
      ? payloadValue
      : {};
    const fields = ["stoneCoins", legacyField].filter((field) => Object.hasOwn(payload, field));
    if (fields.length === 0) {
      return {ok: true, amount: 0};
    }
    if (fields.length > 1 && payload.stoneCoins !== payload[legacyField]) {
      return {
        ok: false,
        code: "trade_stone_coins_invalid",
        message: "交易石币数量冲突，请刷新后重试。",
      };
    }
    const amount = payload[fields[0]];
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > profileStoneCoinLimit) {
      return {
        ok: false,
        code: "trade_stone_coins_invalid",
        message: "交易石币数量异常，请重新输入。",
      };
    }
    return {ok: true, amount};
  }

  function readTradeProposalIntent(payloadValue) {
    const checked = readTradeRootIntent(payloadValue, {
      allowedFields: [
        "targetUsername", "username", "toUsername", "items", "offerItems", "stoneCoins", "offerStoneCoins",
      ],
      stringAliases: ["targetUsername", "username", "toUsername"],
      itemAliases: ["items", "offerItems"],
      coinAlias: "offerStoneCoins",
    });
    if (!checked.ok) {
      return checked;
    }
    return {
      ok: true,
      targetUsername: String(checked.stringValue || ""),
      items: checked.items,
      stoneCoins: checked.stoneCoins,
    };
  }

  function readTradeAcceptIntent(payloadValue) {
    const checked = readTradeRootIntent(payloadValue, {
      allowedFields: ["tradeId", "id", "items", "counterItems", "stoneCoins", "counterStoneCoins"],
      stringAliases: ["tradeId", "id"],
      itemAliases: ["items", "counterItems"],
      coinAlias: "counterStoneCoins",
    });
    if (!checked.ok) {
      return checked;
    }
    const tradeId = typeof checked.stringValue === "string" ? checked.stringValue.trim() : "";
    if (tradeId === "" || checked.stringValue !== tradeId) {
      return {
        ok: false,
        code: "trade_offer_id_invalid",
        message: "交易请求编号异常，请刷新后重试。",
      };
    }
    return {ok: true, tradeId, items: checked.items, stoneCoins: checked.stoneCoins};
  }

  function readTradeRootIntent(payloadValue, options) {
    if (!payloadValue || typeof payloadValue !== "object" || Array.isArray(payloadValue)) {
      return {
        ok: false,
        code: "trade_intent_invalid",
        message: "交易请求格式异常，请刷新后重试。",
      };
    }
    const allowedFields = new Set(options.allowedFields);
    if (Object.keys(payloadValue).some((key) => !allowedFields.has(key))) {
      return {
        ok: false,
        code: "trade_intent_invalid",
        message: "交易请求含未授权字段，请刷新后重试。",
      };
    }
    const stringFields = options.stringAliases.filter((field) => Object.hasOwn(payloadValue, field));
    if (stringFields.length > 1) {
      return {
        ok: false,
        code: "trade_intent_alias_conflict",
        message: "交易身份字段重复，请刷新后重试。",
      };
    }
    if (stringFields.length === 1 && typeof payloadValue[stringFields[0]] !== "string") {
      return {
        ok: false,
        code: "trade_intent_invalid",
        message: "交易身份字段格式异常，请刷新后重试。",
      };
    }
    const itemFields = options.itemAliases.filter((field) => Object.hasOwn(payloadValue, field));
    if (itemFields.length > 1) {
      return {
        ok: false,
        code: "trade_intent_alias_conflict",
        message: "交易物品字段重复，请刷新后重试。",
      };
    }
    const coins = parseTradeStoneCoinIntent(payloadValue, options.coinAlias);
    if (!coins.ok) {
      return coins;
    }
    return {
      ok: true,
      stringValue: stringFields.length === 1 ? payloadValue[stringFields[0]] : "",
      items: itemFields.length === 1 ? payloadValue[itemFields[0]] : [],
      stoneCoins: coins.amount,
    };
  }

  function prepareTradeEquipmentReservations(data, binding, profileValue, equipmentIntents) {
    let profile = clone(profileValue);
    const reservations = [];
    const registry = createEquipmentEnvelopeOwnershipRegistry(data);
    if (registry.conflicts.length > 0) {
      return {
        ok: false,
        code: "equipment_transfer_envelope_duplicate",
        message: "装备转运归属异常，本次交易已取消；资产会原样保留，请联系GM处理。",
      };
    }
    for (const intent of equipmentIntents) {
      const ownership = registry.requireMaterializedInstanceOrigin(binding.playerId, intent.instanceId);
      if (!ownership.ok) {
        return ownership;
      }
      const preview = previewBackpackEquipmentTransfer(
        profile,
        battleEquipmentCatalog,
        intent.itemId,
        intent.instanceId,
        equipmentEnvelopeOptions(profile, intent.itemId, {sourceSlotIndex: intent.sourceSlotIndex}),
      );
      if (!preview.ok) {
        return preview;
      }
      const built = buildEquipmentTradeReservation(intent, preview);
      if (!built.ok) {
        return built;
      }
      profile = preview.profile;
      reservations.push(built.reservation);
    }
    return {ok: true, profile, reservations};
  }

  function readStoredTradeOffer(value, expectedTradeId) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {
        ok: false,
        code: "trade_offer_state_invalid",
        message: "交易请求状态异常，本次操作已取消。",
      };
    }
    const schemaVersion = value.schemaVersion;
    const expectedFields = new Set([
      "tradeId",
      "fromAccountId",
      "toAccountId",
      "offerItems",
      "offerStoneCoins",
      "createdAt",
      "expiresAt",
      "schemaVersion",
      ...(schemaVersion === 2 ? ["offerEquipmentReservations"] : []),
    ]);
    if (
      ![1, 2].includes(schemaVersion)
      || Object.keys(value).some((key) => !expectedFields.has(key))
      || value.tradeId !== expectedTradeId
      || typeof value.tradeId !== "string" || value.tradeId === "" || value.tradeId !== value.tradeId.trim()
      || typeof value.fromAccountId !== "string" || value.fromAccountId === "" || value.fromAccountId !== value.fromAccountId.trim()
      || typeof value.toAccountId !== "string" || value.toAccountId === "" || value.toAccountId !== value.toAccountId.trim()
      || !Number.isSafeInteger(value.offerStoneCoins) || value.offerStoneCoins < 0
      || !Number.isFinite(Date.parse(value.createdAt || ""))
      || !Number.isFinite(Date.parse(value.expiresAt || ""))
      || Date.parse(value.expiresAt) <= Date.parse(value.createdAt)
      || !Array.isArray(value.offerItems)
      || value.offerItems.length > TRADE_MAX_ITEM_LINES
    ) {
      return {
        ok: false,
        code: "trade_offer_state_invalid",
        message: "交易请求状态异常，本次操作已取消。",
      };
    }
    const offerItems = [];
    const itemIds = new Set();
    for (const item of value.offerItems) {
      if (
        !item || typeof item !== "object" || Array.isArray(item)
        || Object.keys(item).length !== 2
        || !Object.hasOwn(item, "itemId") || !Object.hasOwn(item, "count")
        || typeof item.itemId !== "string" || item.itemId === "" || item.itemId !== item.itemId.trim()
        || !bagItemById(item.itemId)
        || !Number.isSafeInteger(item.count) || item.count < 1
        || itemIds.has(item.itemId)
      ) {
        return {
          ok: false,
          code: "trade_offer_state_invalid",
          message: "交易请求中的物品摘要异常，本次操作已取消。",
        };
      }
      itemIds.add(item.itemId);
      offerItems.push({itemId: item.itemId, count: item.count});
    }
    let reservations = [];
    if (schemaVersion === 2) {
      const read = readEquipmentTradeReservationBatch(value.offerEquipmentReservations, {
        maxReservations: TRADE_MAX_ITEM_LINES,
      });
      if (!read.ok) {
        return read;
      }
      const summaryConflict = equipmentReservationSummaryConflict(
        offerItems,
        read.reservations,
        (itemId) => isBankEquipmentItem(itemId),
      );
      if (summaryConflict) {
        return {
          ok: false,
          code: "trade_equipment_reservation_summary_conflict",
          message: "交易请求中的装备数量与预约不一致，本次操作已取消。",
        };
      }
      reservations = read.reservations;
    } else if (offerItems.some((item) => isBankEquipmentItem(item.itemId))) {
      return {
        ok: false,
        code: "trade_equipment_transfer_unsupported",
        message: "历史交易请求没有具体装备预约，本次操作已取消。",
      };
    }
    return {
      ok: true,
      offer: {
        tradeId: value.tradeId,
        fromAccountId: value.fromAccountId,
        toAccountId: value.toAccountId,
        offerItems,
        offerStoneCoins: value.offerStoneCoins,
        offerEquipmentReservations: reservations,
        createdAt: value.createdAt,
        expiresAt: value.expiresAt,
        schemaVersion,
      },
    };
  }

  function tradeOfferCapacityCheck(data, fromAccountId, toAccountId) {
    const offers = Object.values(objectMap(data.tradeOffers)).filter((offer) => (
      offer && typeof offer === "object" && !Array.isArray(offer) && !tradeOfferIsExpired(offer)
    ));
    if (offers.length >= TRADE_MAX_ACTIVE_OFFERS) {
      return fail("trade_offer_capacity", "当前待确认交易过多，请稍后再试。");
    }
    if (offers.filter((offer) => offer.fromAccountId === fromAccountId).length >= TRADE_MAX_SENT_OFFERS_PER_ACCOUNT) {
      return fail("trade_offer_sender_limit", "你发出的待确认交易过多，请先取消或等待过期。");
    }
    if (offers.filter((offer) => offer.toAccountId === toAccountId).length >= TRADE_MAX_RECEIVED_OFFERS_PER_ACCOUNT) {
      return fail("trade_offer_recipient_limit", "对方当前收到的交易请求过多，请稍后再试。");
    }
    if (offers.some((offer) => offer.fromAccountId === fromAccountId && offer.toAccountId === toAccountId)) {
      return fail("trade_offer_pair_pending", "你已向对方发出一笔待确认交易，请先取消或等待过期。");
    }
    return ok();
  }

  function firstDuplicateActiveEquipmentReservation(data, fromAccountId, reservations) {
    const requestedIds = new Set(reservations.map((reservation) => reservation.instanceId));
    if (requestedIds.size === 0) {
      return null;
    }
    for (const offer of Object.values(objectMap(data.tradeOffers))) {
      if (!offer || typeof offer !== "object" || Array.isArray(offer) || offer.fromAccountId !== fromAccountId) {
        continue;
      }
      for (const reservation of Array.isArray(offer.offerEquipmentReservations) ? offer.offerEquipmentReservations : []) {
        const instanceId = String(reservation && reservation.instanceId || "").trim();
        if (requestedIds.has(instanceId)) {
          return reservations.find((entry) => entry.instanceId === instanceId) || null;
        }
      }
    }
    return null;
  }

  function nextTradeId(tradeOffersValue) {
    const offers = objectMap(tradeOffersValue);
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const randomPart = String(randomId() || "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 88);
      const tradeId = `trade_${randomPart}`;
      if (randomPart !== "" && tradeId.length <= 96 && !Object.hasOwn(offers, tradeId)) {
        return {ok: true, tradeId};
      }
    }
    return {
      ok: false,
      code: "trade_offer_id_unavailable",
      message: "交易请求编号暂时不可用，请稍后重试。",
    };
  }

  function nextTradeEquipmentEnvelopeId(registry, reservedEnvelopeIds) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const randomPart = String(randomId() || "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 144);
      const envelopeId = `eqx_trade_${randomPart}`;
      if (
        /^eqx_[A-Za-z0-9_-]{8,156}$/.test(envelopeId)
        && envelopeId.length <= 160
        && registry.isAvailable(envelopeId)
        && !reservedEnvelopeIds.has(envelopeId)
      ) {
        return {ok: true, envelopeId};
      }
    }
    return {
      ok: false,
      code: "trade_equipment_envelope_id_unavailable",
      message: "装备交易转运编号暂时不可用，本次操作已取消，请重试。",
    };
  }

  function exportReservedTradeEquipment(profileValue, binding, reservations, registry, allocatedEnvelopeIds) {
    let profile = clone(profileValue);
    const envelopes = [];
    const priorOriginEnvelopeIds = [];
    for (const reservation of reservations) {
      const ownership = registry.requireMaterializedInstanceOrigin(binding.playerId, reservation.instanceId);
      if (!ownership.ok) {
        return ownership;
      }
      const envelopeIdentity = nextTradeEquipmentEnvelopeId(registry, allocatedEnvelopeIds);
      if (!envelopeIdentity.ok) {
        return envelopeIdentity;
      }
      const exported = exportBackpackEquipmentEnvelope(
        profile,
        battleEquipmentCatalog,
        reservation.itemId,
        reservation.instanceId,
        equipmentEnvelopeOptions(profile, reservation.itemId, {
          envelopeId: envelopeIdentity.envelopeId,
          sourceSlotIndex: reservation.sourceSlotIndex,
        }),
      );
      if (!exported.ok || exported.stateFingerprint !== reservation.stateFingerprint) {
        return {
          ok: false,
          code: "trade_equipment_reservation_changed",
          message: `${bagItemLabel(reservation.itemId)} 的位置或状态已变化，请重新发起交易。`,
        };
      }
      if (ownership.hasOrigin) {
        priorOriginEnvelopeIds.push(ownership.envelopeId);
      }
      profile = exported.profile;
      envelopes.push(exported.envelope);
      allocatedEnvelopeIds.add(exported.envelope.envelopeId);
    }
    return {ok: true, profile, envelopes, priorOriginEnvelopeIds};
  }

  function exportSelectedTradeEquipment(profileValue, binding, equipmentIntents, registry, allocatedEnvelopeIds) {
    let profile = clone(profileValue);
    const envelopes = [];
    const priorOriginEnvelopeIds = [];
    for (const intent of equipmentIntents) {
      const ownership = registry.requireMaterializedInstanceOrigin(binding.playerId, intent.instanceId);
      if (!ownership.ok) {
        return ownership;
      }
      const envelopeIdentity = nextTradeEquipmentEnvelopeId(registry, allocatedEnvelopeIds);
      if (!envelopeIdentity.ok) {
        return envelopeIdentity;
      }
      const exported = exportBackpackEquipmentEnvelope(
        profile,
        battleEquipmentCatalog,
        intent.itemId,
        intent.instanceId,
        equipmentEnvelopeOptions(profile, intent.itemId, {
          envelopeId: envelopeIdentity.envelopeId,
          sourceSlotIndex: intent.sourceSlotIndex,
        }),
      );
      if (!exported.ok) {
        return exported;
      }
      if (ownership.hasOrigin) {
        priorOriginEnvelopeIds.push(ownership.envelopeId);
      }
      profile = exported.profile;
      envelopes.push(exported.envelope);
      allocatedEnvelopeIds.add(exported.envelope.envelopeId);
    }
    return {ok: true, profile, envelopes, priorOriginEnvelopeIds};
  }

  function importTradeEquipmentBatch(profileValue, envelopes, capacityCode, capacityMessage) {
    let profile = clone(profileValue);
    for (const envelope of envelopes) {
      const imported = importBackpackEquipmentEnvelope(
        profile,
        battleEquipmentCatalog,
        envelope,
        equipmentEnvelopeOptions(profile, envelope.itemId, {trustedServerEnvelope: true}),
      );
      if (!imported.ok) {
        return imported.code === "equipment_transfer_backpack_full"
          ? {ok: false, code: capacityCode, message: capacityMessage}
          : imported;
      }
      profile = imported.profile;
    }
    return {ok: true, profile};
  }

  function tradeProfileOfflineHangActive(profile) {
    return String(profile && profile.offlineHang && profile.offlineHang.session
      && profile.offlineHang.session.status || "") === "active";
  }

  function parseBankTransferItems(value, mode) {
    if (!Array.isArray(value)) {
      return {
        ok: false,
        code: "bank_transfer_items_invalid",
        message: "银行物品选择格式异常，请刷新后重试。",
      };
    }
    if (value.length > TRADE_MAX_ITEM_LINES) {
      return {
        ok: false,
        code: "bank_transfer_line_limit",
        message: `一次最多操作${TRADE_MAX_ITEM_LINES}种银行物品，请分批处理。`,
      };
    }
    const items = [];
    for (const rawItem of value) {
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
        return {
          ok: false,
          code: "bank_transfer_item_invalid",
          message: "银行物品选择格式异常，请刷新后重试。",
        };
      }
      const itemId = String(rawItem.itemId || rawItem.id || "").trim();
      if (itemId === "" || !bagItemById(itemId)) {
        return {
          ok: false,
          code: "bank_item_unknown",
          message: "选择的银行物品无法识别，请刷新后重试。",
        };
      }
      if (isBankEquipmentItem(itemId)) {
        const depositFields = new Set(["itemId", "count", "instanceId", "sourceSlotIndex", "bankSlotIndex"]);
        const withdrawFields = new Set(["itemId", "count", "envelopeId", "bankSlotIndex", "targetSlotIndex"]);
        const allowed = mode === "deposit" ? depositFields : withdrawFields;
        if (Object.keys(rawItem).some((key) => !allowed.has(key))) {
          return {
            ok: false,
            code: "bank_equipment_intent_invalid",
            message: "装备银行请求含未授权字段，请刷新后重新选择。",
          };
        }
        if (rawItem.itemId !== itemId || rawItem.count !== 1) {
          return {
            ok: false,
            code: "bank_equipment_intent_invalid",
            message: "装备每次只能按一个具体实例存取。",
          };
        }
        if (mode === "deposit") {
          const instanceId = typeof rawItem.instanceId === "string" ? rawItem.instanceId.trim() : "";
          const sourceSlotIndex = rawItem.sourceSlotIndex;
          const bankSlotIndex = Object.hasOwn(rawItem, "bankSlotIndex") ? rawItem.bankSlotIndex : -1;
          if (
            instanceId === ""
            || !Number.isSafeInteger(sourceSlotIndex) || sourceSlotIndex < 0
            || !Number.isSafeInteger(bankSlotIndex) || bankSlotIndex < -1
          ) {
            return {
              ok: false,
              code: "bank_equipment_selection_required",
              message: "请选择背包中的具体装备实例和格子后再存入。",
            };
          }
          items.push({itemId, count: 1, instanceId, sourceSlotIndex, bankSlotIndex});
        } else {
          const envelopeId = typeof rawItem.envelopeId === "string" ? rawItem.envelopeId.trim() : "";
          const bankSlotIndex = rawItem.bankSlotIndex;
          const targetSlotIndex = Object.hasOwn(rawItem, "targetSlotIndex") ? rawItem.targetSlotIndex : -1;
          if (
            envelopeId === ""
            || !Number.isSafeInteger(bankSlotIndex) || bankSlotIndex < 0
            || !Number.isSafeInteger(targetSlotIndex) || targetSlotIndex < -1
          ) {
            return {
              ok: false,
              code: "bank_equipment_selection_required",
              message: "请选择银行中的具体装备信封和格子后再取出。",
            };
          }
          items.push({itemId, count: 1, envelopeId, bankSlotIndex, targetSlotIndex});
        }
      } else {
        const count = normalizeCoinAmount(rawItem.count || rawItem.amount || 0);
        if (count <= 0) {
          return {
            ok: false,
            code: "bank_transfer_item_invalid",
            message: "银行物品数量异常，请刷新后重试。",
          };
        }
        items.push({
          itemId,
          count,
          sourceSlotIndex: normalizeOptionalIndex(rawItem.sourceSlotIndex ?? rawItem.slotIndex ?? rawItem.sourceIndex),
          targetSlotIndex: normalizeOptionalIndex(rawItem.targetSlotIndex ?? rawItem.targetIndex),
          bankSlotIndex: normalizeOptionalIndex(rawItem.bankSlotIndex ?? rawItem.targetBankSlotIndex ?? rawItem.sourceBankSlotIndex),
        });
      }
    }
    return {ok: true, items};
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

  function tradeOfferIsExpired(offer) {
    const expiresAtMs = Date.parse(offer && offer.expiresAt || "");
    return Number.isFinite(expiresAtMs) && expiresAtMs <= now();
  }

  function activeMarketListings(data) {
    const book = auditMarketListingBook(
      objectMap(data.marketListings),
      battleEquipmentCatalog,
      marketListingStateOptions(),
    );
    if (!book.ok) {
      return [];
    }
    return book.listings
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, MARKET_MAX_LISTINGS);
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
    if (String(listing && listing.sellerKind || "") === TUTORIAL_SELLER_KIND) {
      return 0;
    }
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
    const binding = accountId ? data.profileBindings && data.profileBindings[accountId] : null;
    const profileDoc = binding ? data.profiles && data.profiles[binding.playerId] : null;
    const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)
      ? profileDoc.profile
      : null;
    if (profile && currentProfileQuestId(profile) === TUTORIAL_BUY_QUEST_ID) {
      const tutorialListing = tutorialBuyListing(account, isoNow(now));
      if (tutorialListing) {
        listings.unshift(tutorialListing);
      }
    }
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
    const tutorialSeller = String(listing.sellerKind || "") === TUTORIAL_SELLER_KIND || listing.sellerAccountId === TUTORIAL_SELLER_ACCOUNT_ID;
    const totalPrice = marketListingTotalPrice(listing);
    const taxBps = marketTaxBpsForListing(data, listing);
    const tax = marketTaxForListing(data, listing);
    const equipmentFacts = listing.equipmentEnvelope
      ? publicMarketListingFacts(listing, battleEquipmentCatalog, marketListingStateOptions())
      : null;
    return {
      listingId: listing.listingId,
      sellerAccountId: listing.sellerAccountId,
      sellerUsername: seller ? seller.username : (tutorialSeller ? "tutorial_seller" : ""),
      sellerDisplayName: seller ? seller.displayName : (tutorialSeller ? "新手交易指导员" : ""),
      sellerKind: tutorialSeller ? TUTORIAL_SELLER_KIND : "player",
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
      ...(equipmentFacts && equipmentFacts.ok ? {equipmentEnvelope: equipmentFacts.equipmentEnvelope} : {}),
      schemaVersion: Number(listing.schemaVersion || 1),
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

  function nextEconomyMailId(data, prefix, code, message) {
    const mailMessages = objectMap(data && data.mailMessages);
    const maxRandomLength = Math.max(8, 96 - prefix.length);
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const randomPart = String(randomId() || "")
        .trim()
        .replace(/[^A-Za-z0-9_-]/g, "")
        .slice(0, maxRandomLength);
      const mailId = `${prefix}${randomPart}`;
      if (randomPart !== "" && mailId.length <= 96 && !Object.hasOwn(mailMessages, mailId)) {
        return {ok: true, mailId};
      }
    }
    return {ok: false, code, message};
  }

  function createMarketSaleMail(data, seller, listing, tax, sellerReceives, mailId) {
    const currencyLabel = shopCurrencyLabel(listing.currency);
    const itemText = itemAmountText([{itemId: listing.itemId, count: listing.count}]);
    const totalPrice = marketListingTotalPrice(listing);
    const mail = {
      mailId,
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
    const staged = stageMailAuthorityUpsert(data.mailMessages, mail);
    if (!staged.ok) {
      return staged;
    }
    data.mailMessages = staged.messages;
    return {ok: true, mail: staged.mail};
  }

  function createTutorialMarketSaleMail(data, seller, listing, mailId) {
    const sellerReceives = marketListingTotalPrice(listing);
    const mail = {
      mailId,
      mailKind: "tutorial_market_sale",
      senderAccountId: TUTORIAL_SELLER_ACCOUNT_ID,
      senderUsername: "tutorial_buyer",
      senderDisplayName: "新手交易指导员",
      recipientAccountId: seller.accountId,
      recipientUsername: seller.username,
      recipientDisplayName: seller.displayName,
      title: "教学交易成交通知",
      body: [
        `${itemAmountText([{itemId: listing.itemId, count: listing.count}])} 已被教学买家买下。`,
        `成交金额：${sellerReceives}${shopCurrencyLabel(listing.currency)}`,
        "货款已放入附件，请领取。以后真实玩家购买你的挂单时，收益也会通过邮箱送达。",
      ].join("\n"),
      currency: marketCurrencyAttachment(listing.currency, sellerReceives),
      items: [],
      createdAt: isoNow(now),
      readAt: null,
      schemaVersion: 1,
    };
    const staged = stageMailAuthorityUpsert(data.mailMessages, mail);
    if (!staged.ok) {
      return staged;
    }
    data.mailMessages = staged.messages;
    return {ok: true, mail: staged.mail};
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
      schemaVersion: offer && offer.schemaVersion === 2 ? 2 : 1,
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

  function rawBankProfilePayload(prepared, profile) {
    return {
      account: publicAccount(prepared.account),
      profileBinding: prepared.binding,
      profileSummary: profileSummaryForAccount(prepared.account, prepared.data),
      profile: clone(profile),
      bank: clone(profile.bank || {}),
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
