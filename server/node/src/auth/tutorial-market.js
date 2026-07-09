"use strict";

const TUTORIAL_SELL_QUEST_ID = "quest_market_sell_player";
const TUTORIAL_MAIL_QUEST_ID = "quest_claim_market_mail";
const TUTORIAL_BUY_QUEST_ID = "quest_market_buy_player";
const TUTORIAL_SELL_ITEM_ID = "tutorial_worn_hide";
const TUTORIAL_BUY_ITEM_ID = "item_meat_small";
const TUTORIAL_SELL_MAX_UNIT_PRICE = 20;
const TUTORIAL_BUY_UNIT_PRICE = 1;
const TUTORIAL_CURRENCY = "stoneCoins";
const TUTORIAL_SELLER_ACCOUNT_ID = "system_tutorial_market";
const TUTORIAL_SELLER_KIND = "tutorial_bot";

function tutorialBuyListingId(accountId) {
  return `tutorial_market_buy_${String(accountId || "").replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

function tutorialBuyListing(account, createdAt) {
  const accountId = String(account && account.accountId || "").trim();
  if (!accountId) {
    return null;
  }
  return {
    listingId: tutorialBuyListingId(accountId),
    sellerAccountId: TUTORIAL_SELLER_ACCOUNT_ID,
    sellerKind: TUTORIAL_SELLER_KIND,
    tutorialBuyerAccountId: accountId,
    itemId: TUTORIAL_BUY_ITEM_ID,
    count: 1,
    unitPrice: TUTORIAL_BUY_UNIT_PRICE,
    currency: TUTORIAL_CURRENCY,
    createdAt: String(createdAt || ""),
    schemaVersion: 1,
  };
}

function isTutorialBuyListingForAccount(listingId, accountId) {
  return String(listingId || "") === tutorialBuyListingId(accountId);
}

function tutorialSaleIsEligible(activeQuestId, listing) {
  return (
    String(activeQuestId || "") === TUTORIAL_SELL_QUEST_ID &&
    String(listing && listing.itemId || "") === TUTORIAL_SELL_ITEM_ID &&
    String(listing && listing.currency || "") === TUTORIAL_CURRENCY &&
    Math.trunc(Number(listing && listing.count || 0)) === 1 &&
    Math.trunc(Number(listing && listing.unitPrice || 0)) > 0 &&
    Math.trunc(Number(listing && listing.unitPrice || 0)) <= TUTORIAL_SELL_MAX_UNIT_PRICE
  );
}

module.exports = {
  TUTORIAL_BUY_ITEM_ID,
  TUTORIAL_BUY_QUEST_ID,
  TUTORIAL_BUY_UNIT_PRICE,
  TUTORIAL_CURRENCY,
  TUTORIAL_MAIL_QUEST_ID,
  TUTORIAL_SELLER_ACCOUNT_ID,
  TUTORIAL_SELLER_KIND,
  TUTORIAL_SELL_ITEM_ID,
  TUTORIAL_SELL_QUEST_ID,
  isTutorialBuyListingForAccount,
  tutorialBuyListing,
  tutorialSaleIsEligible,
};
