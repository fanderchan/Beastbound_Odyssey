"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {cloneAuthorityRoot} = require("../src/auth/authority-root-clone");
const {
  canonicalDurableMutationReceipts,
  commitDurableMutationReceiptDelta,
  stageDurableMutationReceipt,
} = require("../src/auth/durable-mutation-state");
const {
  ensureConsumedEquipmentEnvelopeIds,
} = require("../src/auth/equipment-envelope-consumed-ledger");
const {
  MARKET_MAX_LISTINGS,
  MARKET_MAX_LISTINGS_PER_SELLER,
} = require("../src/auth/market-listing-state");
const {createMysqlAuthStore} = require("../src/mysql-store");
const {
  createSharedMysqlTransactionHarness,
} = require("../test-support/shared-mysql-transaction-harness");

const ACTORS = Object.freeze({
  a: Object.freeze({accountId: "acc_shared_mysql_a", playerId: "player_shared_mysql_a", name: "并行猎人甲"}),
  b: Object.freeze({accountId: "acc_shared_mysql_b", playerId: "player_shared_mysql_b", name: "并行猎人乙"}),
});
const UPDATED_AT_1 = "2026-07-14T02:00:00.000Z";
const UPDATED_AT_2 = "2026-07-14T02:01:00.000Z";
const UPDATED_AT_3 = "2026-07-14T02:02:00.000Z";
const UPDATED_AT_4 = "2026-07-14T02:03:00.000Z";
const MARKET_LISTING_IDS = Object.freeze({
  a: "listing_shared_mysql_a",
  a2: "listing_shared_mysql_a_2",
  b: "listing_shared_mysql_b",
});
const MAIL_IDS = Object.freeze({
  a: "mail_shared_mysql_a",
  b: "mail_shared_mysql_b",
  sale: "mail_shared_mysql_market_sale",
});
const MAIL_CLAIM_ACTION_ID = "POST /mail/claim";
const MARKET_BUY_ACTION_ID = "POST /market/buy";
const MARKET_CREATE_ACTION_ID = "POST /market/list";
const MARKET_CREATE_CAPACITY_GUARD_KEY = "market_create_capacity";
const MAIL_ENVELOPE_ID = "eqx_shared_mail_duplicate_0001";

function baselineAuthority() {
  const authority = {
    schemaVersion: 1,
    accounts: {},
    sessions: {},
    profileBindings: {},
    profiles: {},
    mutationReceipts: {},
    mailMessages: {},
    marketListings: {},
    consumedEquipmentEnvelopes: {},
    marketConfig: {taxRate: 0.05},
    serviceEventSeq: 0,
    serviceEvents: [],
  };
  for (const actor of Object.values(ACTORS)) {
    authority.profileBindings[actor.accountId] = {
      accountId: actor.accountId,
      playerId: actor.playerId,
      profileRevision: 1,
      updatedAt: UPDATED_AT_1,
    };
    authority.profiles[actor.playerId] = {
      playerId: actor.playerId,
      accountId: actor.accountId,
      profileRevision: 1,
      updatedAt: UPDATED_AT_1,
      profile: {
        displayName: actor.name,
        stoneCoins: actor === ACTORS.a ? 100 : 200,
      },
    };
  }
  return authority;
}

function nextProfileAuthority(before, actorKey, options = {}) {
  const actor = ACTORS[actorKey];
  const after = cloneAuthorityRoot(before);
  const nextRevision = Number(before.profileBindings[actor.accountId].profileRevision) + 1;
  const updatedAt = String(options.updatedAt || UPDATED_AT_2);
  after.profileBindings[actor.accountId] = {
    ...before.profileBindings[actor.accountId],
    profileRevision: nextRevision,
    updatedAt,
  };
  after.profiles[actor.playerId] = {
    ...before.profiles[actor.playerId],
    profileRevision: nextRevision,
    updatedAt,
    profile: {
      ...before.profiles[actor.playerId].profile,
      stoneCoins: Number(options.stoneCoins),
    },
  };
  if (options.operationId) {
    const operationId = String(options.operationId);
    after.mutationReceipts = stageDurableMutationReceipt(
      after.mutationReceipts,
      {
        schemaVersion: 1,
        operationId,
        requestHash: String(options.requestHash),
        actionId: "record_point_save",
        accountId: actor.accountId,
        committedAt: updatedAt,
        expiresAt: "2026-07-17T02:10:00.000Z",
        response: {ok: true, operationId},
      },
      {nowMs: Date.parse(updatedAt)},
    );
  }
  return after;
}

function profileSaveOptions(actorKey, operationId, requestHash) {
  const actor = ACTORS[actorKey];
  return {
    consistencyScope: {
      kind: "row_local_profile_v1",
      accountId: actor.accountId,
      playerId: actor.playerId,
      operationId,
      requestHash,
      actionId: "record_point_save",
    },
  };
}

function stagedProfileSave(store, before, actorKey, options) {
  const after = nextProfileAuthority(before, actorKey, options);
  const saveOptions = profileSaveOptions(actorKey, options.operationId, options.requestHash);
  return {after, promise: store.saveAsync(after, saveOptions)};
}

function ordinaryListing(actorKey, overrides = {}) {
  const actor = ACTORS[actorKey];
  return {
    listingId: MARKET_LISTING_IDS[actorKey],
    sellerAccountId: actor.accountId,
    itemId: "item_meat_small",
    count: 1,
    unitPrice: actorKey === "a" ? 20 : 30,
    currency: "stoneCoins",
    createdAt: UPDATED_AT_1,
    schemaVersion: 1,
    ...overrides,
  };
}

function marketCreateFillerListing(index) {
  const normalizedIndex = Number(index);
  return {
    listingId: `listing_shared_market_capacity_${String(normalizedIndex).padStart(3, "0")}`,
    sellerAccountId: `acc_shared_market_filler_${Math.floor(normalizedIndex / MARKET_MAX_LISTINGS_PER_SELLER)}`,
    itemId: "item_meat_small",
    count: 1,
    unitPrice: 10 + normalizedIndex,
    currency: "stoneCoins",
    createdAt: UPDATED_AT_1,
    schemaVersion: 1,
  };
}

function marketCreateAuthority(totalListingCount) {
  assert.ok(Number.isSafeInteger(totalListingCount));
  assert.ok(totalListingCount >= 0 && totalListingCount <= MARKET_MAX_LISTINGS);
  const authority = baselineAuthority();
  for (const actor of Object.values(ACTORS)) {
    authority.profiles[actor.playerId].profile.backpackSlots = [{
      itemId: "item_meat_small",
      count: 2,
    }];
  }
  authority.marketListings = {};
  for (let index = 0; index < totalListingCount; index += 1) {
    const listing = marketCreateFillerListing(index);
    authority.marketListings[listing.listingId] = listing;
  }
  return authority;
}

function nextMarketCreateAuthority(before, actorKey, options = {}) {
  const actor = ACTORS[actorKey];
  const listingId = String(options.listingId || `listing_shared_market_create_${actorKey}`);
  const after = cloneAuthorityRoot(before);
  const nextRevision = Number(before.profileBindings[actor.accountId].profileRevision) + 1;
  const updatedAt = String(options.updatedAt || UPDATED_AT_2);
  const beforeSlots = before.profiles[actor.playerId].profile.backpackSlots || [];
  const beforeSlot = beforeSlots.find((slot) => slot.itemId === "item_meat_small");
  assert.ok(beforeSlot && Number(beforeSlot.count) >= 1);
  const remainingCount = Number(beforeSlot.count) - 1;
  after.profileBindings[actor.accountId] = {
    ...before.profileBindings[actor.accountId],
    profileRevision: nextRevision,
    updatedAt,
  };
  after.profiles[actor.playerId] = {
    ...before.profiles[actor.playerId],
    profileRevision: nextRevision,
    updatedAt,
    profile: {
      ...before.profiles[actor.playerId].profile,
      backpackSlots: remainingCount > 0
        ? [{itemId: "item_meat_small", count: remainingCount}]
        : [],
    },
  };
  const listing = {
    listingId,
    sellerAccountId: actor.accountId,
    itemId: "item_meat_small",
    count: 1,
    unitPrice: actorKey === "a" ? 41 : 42,
    currency: "stoneCoins",
    createdAt: updatedAt,
    schemaVersion: 1,
  };
  after.marketListings[listingId] = listing;
  const operationId = String(options.operationId);
  after.mutationReceipts = stageDurableMutationReceipt(
    after.mutationReceipts,
    {
      schemaVersion: 1,
      operationId,
      requestHash: String(options.requestHash),
      actionId: MARKET_CREATE_ACTION_ID,
      accountId: actor.accountId,
      committedAt: updatedAt,
      expiresAt: "2026-07-18T02:10:00.000Z",
      response: {ok: true, listing, saleMail: null, operationId},
    },
    {nowMs: Date.parse(updatedAt)},
  );
  return after;
}

function marketCreateSaveOptions(before, actorKey, options = {}) {
  const actor = ACTORS[actorKey];
  const listings = Object.values(before.marketListings || {});
  return {
    consistencyScope: {
      kind: "row_local_market_create_v1",
      accountId: actor.accountId,
      playerId: actor.playerId,
      listingId: String(options.listingId || `listing_shared_market_create_${actorKey}`),
      observedTotalListingCount: listings.length,
      observedSellerListingCount: listings.filter((listing) => (
        listing.sellerAccountId === actor.accountId
      )).length,
      maxTotalListings: MARKET_MAX_LISTINGS,
      maxSellerListings: MARKET_MAX_LISTINGS_PER_SELLER,
      operationId: String(options.operationId),
      requestHash: String(options.requestHash),
      actionId: MARKET_CREATE_ACTION_ID,
    },
  };
}

function stagedMarketCreate(store, before, actorKey, options) {
  const after = nextMarketCreateAuthority(before, actorKey, options);
  return {
    after,
    promise: store.saveAsync(after, marketCreateSaveOptions(before, actorKey, options)),
  };
}

function stagedLegacyMarketCreate(store, before, actorKey, options) {
  const after = nextMarketCreateAuthority(before, actorKey, options);
  return {
    after,
    promise: store.saveAsync(after),
  };
}

function marketAuthority() {
  const authority = baselineAuthority();
  authority.marketListings = {
    [MARKET_LISTING_IDS.a]: ordinaryListing("a"),
    [MARKET_LISTING_IDS.a2]: ordinaryListing("a", {
      listingId: MARKET_LISTING_IDS.a2,
      count: 2,
      unitPrice: 25,
    }),
    [MARKET_LISTING_IDS.b]: ordinaryListing("b"),
  };
  return authority;
}

function marketClaimAuthority() {
  const authority = marketAuthority();
  authority.marketConfig = {
    defaultTaxBps: 0,
    itemTaxBps: {},
    taxCollected: {stoneCoins: 0, diamonds: 0},
    schemaVersion: 1,
  };
  authority.mailMessages[MAIL_IDS.b] = mailAttachment("b");
  return authority;
}

function marketSaleMail(listing, mailId = MAIL_IDS.sale) {
  const seller = ACTORS.b;
  const totalPrice = Number(listing.count) * Number(listing.unitPrice);
  return {
    mailId,
    senderAccountId: "system_market",
    senderUsername: "auction_house",
    senderDisplayName: "拍卖行",
    recipientAccountId: seller.accountId,
    recipientUsername: "shared_market_seller_b",
    recipientDisplayName: seller.name,
    title: "拍卖行成交通知",
    body: "共享事务卖家领取与购买交错测试。",
    currency: {stoneCoins: totalPrice},
    items: [],
    createdAt: UPDATED_AT_2,
    readAt: null,
    schemaVersion: 1,
  };
}

function nextMarketBuyAuthority(before, options = {}) {
  const buyer = ACTORS.a;
  const seller = ACTORS.b;
  const listingId = String(options.listingId || MARKET_LISTING_IDS.b);
  const saleMailId = String(options.saleMailId || MAIL_IDS.sale);
  const listing = before.marketListings[listingId];
  const after = cloneAuthorityRoot(before);
  const nextRevision = Number(before.profileBindings[buyer.accountId].profileRevision) + 1;
  const updatedAt = String(options.updatedAt || UPDATED_AT_2);
  const totalPrice = Number(listing.count) * Number(listing.unitPrice);
  after.profileBindings[buyer.accountId] = {
    ...before.profileBindings[buyer.accountId],
    profileRevision: nextRevision,
    updatedAt,
  };
  after.profiles[buyer.playerId] = {
    ...before.profiles[buyer.playerId],
    profileRevision: nextRevision,
    updatedAt,
    profile: {
      ...before.profiles[buyer.playerId].profile,
      stoneCoins: Number(before.profiles[buyer.playerId].profile.stoneCoins) - totalPrice,
      backpackSlots: [{itemId: listing.itemId, count: listing.count}],
    },
  };
  delete after.marketListings[listingId];
  after.mailMessages[saleMailId] = marketSaleMail(listing, saleMailId);
  const operationId = String(options.operationId);
  after.mutationReceipts = stageDurableMutationReceipt(
    after.mutationReceipts,
    {
      schemaVersion: 1,
      operationId,
      requestHash: String(options.requestHash),
      actionId: MARKET_BUY_ACTION_ID,
      accountId: buyer.accountId,
      committedAt: updatedAt,
      expiresAt: "2026-07-18T02:10:00.000Z",
      response: {ok: true, operationId, saleMailId},
    },
    {nowMs: Date.parse(updatedAt)},
  );
  return after;
}

function marketBuySaveOptions(operationId, requestHash, options = {}) {
  return {
    consistencyScope: {
      kind: "row_local_market_buy_v1",
      accountId: ACTORS.a.accountId,
      playerId: ACTORS.a.playerId,
      sellerAccountId: ACTORS.b.accountId,
      sellerPlayerId: ACTORS.b.playerId,
      listingId: String(options.listingId || MARKET_LISTING_IDS.b),
      saleMailId: String(options.saleMailId || MAIL_IDS.sale),
      currency: "stoneCoins",
      taxAmount: 0,
      operationId,
      requestHash,
      actionId: MARKET_BUY_ACTION_ID,
    },
  };
}

function stagedMarketBuy(store, before, options) {
  const after = nextMarketBuyAuthority(before, options);
  return {
    after,
    promise: store.saveAsync(after, marketBuySaveOptions(
      options.operationId,
      options.requestHash,
      options,
    )),
  };
}

function nextMarketCancelAuthority(before, actorKey, options = {}) {
  const actor = ACTORS[actorKey];
  const listingId = String(options.listingId || MARKET_LISTING_IDS[actorKey]);
  const listing = before.marketListings[listingId];
  const after = cloneAuthorityRoot(before);
  const nextRevision = Number(before.profileBindings[actor.accountId].profileRevision) + 1;
  const updatedAt = String(options.updatedAt || UPDATED_AT_2);
  after.profileBindings[actor.accountId] = {
    ...before.profileBindings[actor.accountId],
    profileRevision: nextRevision,
    updatedAt,
  };
  after.profiles[actor.playerId] = {
    ...before.profiles[actor.playerId],
    profileRevision: nextRevision,
    updatedAt,
    profile: {
      ...before.profiles[actor.playerId].profile,
      backpackSlots: [{itemId: listing.itemId, count: listing.count}],
    },
  };
  delete after.marketListings[listingId];
  const operationId = String(options.operationId);
  after.mutationReceipts = stageDurableMutationReceipt(
    after.mutationReceipts,
    {
      schemaVersion: 1,
      operationId,
      requestHash: String(options.requestHash),
      actionId: "POST /market/cancel",
      accountId: actor.accountId,
      committedAt: updatedAt,
      expiresAt: "2026-07-17T02:10:00.000Z",
      response: {ok: true, operationId},
    },
    {nowMs: Date.parse(updatedAt)},
  );
  return after;
}

function marketCancelSaveOptions(actorKey, operationId, requestHash, listingId = MARKET_LISTING_IDS[actorKey]) {
  const actor = ACTORS[actorKey];
  return {
    consistencyScope: {
      kind: "row_local_market_cancel_v1",
      accountId: actor.accountId,
      playerId: actor.playerId,
      listingId,
      operationId,
      requestHash,
      actionId: "POST /market/cancel",
    },
  };
}

function stagedMarketCancel(store, before, actorKey, options) {
  const after = nextMarketCancelAuthority(before, actorKey, options);
  const saveOptions = marketCancelSaveOptions(
    actorKey,
    options.operationId,
    options.requestHash,
    options.listingId,
  );
  return {after, promise: store.saveAsync(after, saveOptions)};
}

function legacyMarketAuthority(before) {
  const after = cloneAuthorityRoot(before);
  after.marketConfig = {...before.marketConfig, taxRate: 0.07};
  return after;
}

function mailAttachment(actorKey, overrides = {}) {
  const actor = ACTORS[actorKey];
  return {
    mailId: MAIL_IDS[actorKey],
    senderAccountId: "system_mail",
    senderUsername: "system_mail",
    senderDisplayName: "系统邮件",
    recipientAccountId: actor.accountId,
    recipientUsername: `shared_mail_${actorKey}`,
    recipientDisplayName: actor.name,
    title: `共享领取测试${actorKey}`,
    body: "附件领取必须与档案变更原子提交。",
    items: [{itemId: "item_meat_small", count: 1}],
    currency: {},
    createdAt: UPDATED_AT_1,
    readAt: null,
    schemaVersion: 1,
    ...overrides,
  };
}

function equipmentEnvelope(envelopeId = MAIL_ENVELOPE_ID) {
  return {
    schemaVersion: 1,
    envelopeId,
    itemId: "weapon_wooden_club",
    instanceState: {
      schemaVersion: 1,
      itemId: "weapon_wooden_club",
      durability: 20,
      enhancement: {itemId: "weapon_wooden_club", level: 0, history: []},
      wearCounters: {itemId: "weapon_wooden_club", attackCount: 0, hitCount: 0},
      expPillCharge: {},
      source: "shared_mysql_mail_claim_test",
    },
    stateFingerprint: "f".repeat(64),
    provenance: {
      sourceInstanceId: "equip_shared_mail_source",
      sourceAccountId: "acc_shared_mail_sender",
      exportedAt: UPDATED_AT_1,
    },
  };
}

function mailClaimAuthority(options = {}) {
  const authority = baselineAuthority();
  authority.mailMessages = {
    [MAIL_IDS.a]: mailAttachment("a"),
    [MAIL_IDS.b]: mailAttachment("b", {
      items: [{itemId: "item_meat_small", count: 2}],
    }),
  };
  if (options.equipmentActorKey) {
    const actorKey = String(options.equipmentActorKey);
    authority.mailMessages[MAIL_IDS[actorKey]] = mailAttachment(actorKey, {
      title: `共享装备领取测试${actorKey}`,
      items: [{itemId: "weapon_wooden_club", count: 1}],
      equipmentEnvelopes: [equipmentEnvelope()],
      schemaVersion: 2,
    });
  }
  return authority;
}

function nextMailClaimAuthority(before, actorKey, options = {}) {
  const actor = ACTORS[actorKey];
  const mailId = String(options.mailId || MAIL_IDS[actorKey]);
  const after = cloneAuthorityRoot(before);
  const nextRevision = Number(before.profileBindings[actor.accountId].profileRevision) + 1;
  const updatedAt = String(options.updatedAt || UPDATED_AT_2);
  after.profileBindings[actor.accountId] = {
    ...before.profileBindings[actor.accountId],
    profileRevision: nextRevision,
    updatedAt,
  };
  after.profiles[actor.playerId] = {
    ...before.profiles[actor.playerId],
    profileRevision: nextRevision,
    updatedAt,
    profile: {
      ...before.profiles[actor.playerId].profile,
      stoneCoins: Number(before.profiles[actor.playerId].profile.stoneCoins || 0) + 1,
      backpackSlots: [{itemId: options.itemId || "item_meat_small", count: 1}],
    },
  };
  if (Array.isArray(options.remainingItems)) {
    after.mailMessages[mailId] = {
      ...before.mailMessages[mailId],
      items: options.remainingItems,
      currency: {},
      equipmentEnvelopes: [],
      schemaVersion: 2,
    };
  } else {
    delete after.mailMessages[mailId];
  }
  const claimedEnvelopeIds = [...(options.claimedEnvelopeIds || [])].sort();
  if (claimedEnvelopeIds.length > 0) {
    const consumed = ensureConsumedEquipmentEnvelopeIds(
      after.consumedEquipmentEnvelopes,
      claimedEnvelopeIds,
    );
    assert.equal(consumed.ok, true, JSON.stringify(consumed));
    after.consumedEquipmentEnvelopes = consumed.ledger;
  }
  const operationId = String(options.operationId);
  after.mutationReceipts = stageDurableMutationReceipt(
    after.mutationReceipts,
    {
      schemaVersion: 1,
      operationId,
      requestHash: String(options.requestHash),
      actionId: MAIL_CLAIM_ACTION_ID,
      accountId: actor.accountId,
      committedAt: updatedAt,
      expiresAt: "2026-07-18T02:10:00.000Z",
      response: {
        ok: true,
        operationId,
        claim: {mailId},
      },
    },
    {nowMs: Date.parse(updatedAt)},
  );
  return after;
}

function mailClaimSaveOptions(actorKey, operationId, requestHash, options = {}) {
  const actor = ACTORS[actorKey];
  return {
    consistencyScope: {
      kind: "row_local_mail_claim_v1",
      accountId: actor.accountId,
      playerId: actor.playerId,
      mailId: String(options.mailId || MAIL_IDS[actorKey]),
      mailDisposition: Array.isArray(options.remainingItems) ? "update" : "delete",
      claimedEnvelopeIds: [...(options.claimedEnvelopeIds || [])].sort(),
      operationId,
      requestHash,
      actionId: MAIL_CLAIM_ACTION_ID,
    },
  };
}

function stagedMailClaim(store, before, actorKey, options) {
  const after = nextMailClaimAuthority(before, actorKey, options);
  const saveOptions = mailClaimSaveOptions(
    actorKey,
    options.operationId,
    options.requestHash,
    options,
  );
  return {after, promise: store.saveAsync(after, saveOptions)};
}

function marketCapacityCountKey(accountId, totalCount, sellerCount) {
  return `${accountId}:${Number(totalCount)}:${Number(sellerCount)}`;
}

function marketCapacityCountRows(entries = []) {
  return Object.fromEntries(entries.map((entry) => {
    const actor = ACTORS[String(entry.actorKey || "")];
    assert.ok(actor, `unknown market capacity actor: ${String(entry.actorKey || "")}`);
    const totalCount = Number(entry.totalCount);
    const sellerCount = Number(entry.sellerCount);
    const key = marketCapacityCountKey(actor.accountId, totalCount, sellerCount);
    return [key, {total_count: totalCount, seller_count: sellerCount}];
  }));
}

function sqlSeed(options = {}) {
  const authority = options.authority || baselineAuthority();
  const profileBindings = {};
  const profiles = {};
  for (const actor of Object.values(ACTORS)) {
    profileBindings[actor.accountId] = {
      account_id: actor.accountId,
      player_id: actor.playerId,
      profile_revision: 1,
      updated_at: UPDATED_AT_1,
      document_json: authority.profileBindings[actor.accountId],
    };
    profiles[actor.playerId] = {
      player_id: actor.playerId,
      account_id: actor.accountId,
      profile_revision: 1,
      updated_at: UPDATED_AT_1,
      profile_json: authority.profiles[actor.playerId].profile,
    };
  }
  return {
    auth_store_revisions: {
      auth: {scope_key: "auth", revision: 0},
      [MARKET_CREATE_CAPACITY_GUARD_KEY]: {
        scope_key: MARKET_CREATE_CAPACITY_GUARD_KEY,
        revision: 0,
      },
    },
    server_state: {
      auth: {
        scope_key: "auth",
        document_json: {
          schemaVersion: 2,
          storage: "mysql_entity_tables",
          serviceEventSeq: Number(authority.serviceEventSeq || 0),
          marketConfig: authority.marketConfig,
          offlineHangConfig: authority.offlineHangConfig || {},
        },
      },
    },
    profile_bindings: profileBindings,
    profiles,
    market_listings: Object.fromEntries(
      Object.entries(authority.marketListings || {}).map(([listingId, listing]) => [listingId, {
        listing_id: listingId,
        seller_account_id: listing.sellerAccountId,
        item_id: listing.itemId,
        currency: listing.currency,
        unit_price: listing.unitPrice,
        item_count: listing.count,
        created_at: listing.createdAt,
        document_json: listing,
      }]),
    ),
    mail_messages: Object.fromEntries(
      Object.entries(authority.mailMessages || {}).map(([mailId, mail]) => [mailId, {
        mail_id: mailId,
        sender_account_id: mail.senderAccountId,
        recipient_account_id: mail.recipientAccountId,
        title: mail.title,
        created_at: mail.createdAt,
        read_at: mail.readAt,
        document_json: mail,
      }]),
    ),
    consumed_equipment_envelopes: Object.fromEntries(
      Object.keys(authority.consumedEquipmentEnvelopes || {}).map((envelopeId) => [envelopeId, {
        envelope_id: envelopeId,
      }]),
    ),
    mutation_receipts: options.mutationReceipts || {},
    market_capacity_counts: marketCapacityCountRows(options.marketCapacityCounts),
  };
}

function normalizeSql(sql) {
  return String(sql || "").trim().replace(/\s+/g, " ");
}

function requiredParams(params, count, sql) {
  if (!Array.isArray(params) || params.length !== count) {
    const error = new Error(`unexpected parameter count for modeled SQL: ${normalizeSql(sql)}`);
    error.code = "shared_mysql_parameter_mismatch";
    throw error;
  }
  return params;
}

function jsonParameter(value, sql) {
  try {
    return JSON.parse(String(value));
  } catch {
    const error = new Error(`invalid JSON parameter for modeled SQL: ${normalizeSql(sql)}`);
    error.code = "shared_mysql_json_parameter_invalid";
    throw error;
  }
}

function createProductionSqlHandler(queryLog, options = {}) {
  return ({sql, params, writerId, operation}) => {
    const normalized = normalizeSql(sql);
    queryLog.push({writerId, sql: normalized, params: Array.isArray(params) ? params.slice() : params});

    if (/^SELECT revision AS storeRevision FROM auth_store_revisions WHERE scope_key = 'auth' FOR SHARE$/i.test(normalized)) {
      requiredParams(params, 0, sql);
      return operation.selectForShare("auth_store_revisions", "auth");
    }
    if (/^SELECT revision AS storeRevision FROM auth_store_revisions WHERE scope_key = 'auth' FOR UPDATE$/i.test(normalized)) {
      requiredParams(params, 0, sql);
      return operation.selectForUpdate("auth_store_revisions", "auth");
    }
    if (/^SELECT scope_key, revision FROM auth_store_revisions WHERE scope_key = \? FOR UPDATE$/i.test(normalized)) {
      const [scopeKey] = requiredParams(params, 1, sql);
      return operation.selectForUpdate("auth_store_revisions", String(scopeKey));
    }
    if (/^SELECT document_json FROM server_state WHERE state_key = 'auth' FOR UPDATE$/i.test(normalized)) {
      requiredParams(params, 0, sql);
      return operation.selectForUpdate("server_state", "auth");
    }

    const revisionUpdate = normalized.match(
      /^UPDATE auth_store_revisions SET revision = revision \+ 1 WHERE scope_key = 'auth' AND revision = (\d+)$/i,
    );
    if (revisionUpdate) {
      requiredParams(params, 0, sql);
      const expectedRevision = Number(revisionUpdate[1]);
      return operation.update("auth_store_revisions", "auth", {
        where: {scope_key: "auth", revision: expectedRevision},
        set: {revision: expectedRevision + 1},
      });
    }

    if (/^SELECT account_id, player_id, profile_revision FROM profile_bindings ORDER BY account_id FOR UPDATE$/i.test(normalized)) {
      requiredParams(params, 0, sql);
      return operation.selectAllForUpdate("profile_bindings");
    }
    if (/^SELECT player_id, account_id, profile_revision FROM profiles ORDER BY player_id FOR UPDATE$/i.test(normalized)) {
      requiredParams(params, 0, sql);
      return operation.selectAllForUpdate("profiles");
    }
    if (/^SELECT account_id, player_id, profile_revision FROM profile_bindings WHERE account_id = \? FOR (UPDATE|SHARE)$/i.test(normalized)) {
      const [accountId] = requiredParams(params, 1, sql);
      return /FOR SHARE$/i.test(normalized)
        ? operation.selectForShare("profile_bindings", String(accountId))
        : operation.selectForUpdate("profile_bindings", String(accountId));
    }
    if (/^SELECT player_id, account_id, profile_revision FROM profiles WHERE player_id = \? FOR (UPDATE|SHARE)$/i.test(normalized)) {
      const [playerId] = requiredParams(params, 1, sql);
      return /FOR SHARE$/i.test(normalized)
        ? operation.selectForShare("profiles", String(playerId))
        : operation.selectForUpdate("profiles", String(playerId));
    }
    if (/^SELECT listing_id, seller_account_id, item_id, currency, unit_price, item_count, created_at, document_json FROM market_listings WHERE listing_id = \? FOR UPDATE$/i.test(normalized)) {
      const [listingId] = requiredParams(params, 1, sql);
      return operation.selectForUpdate("market_listings", String(listingId));
    }
    if (/^SELECT mail_id, sender_account_id, recipient_account_id, title, created_at, read_at, document_json FROM mail_messages WHERE mail_id = \? FOR UPDATE$/i.test(normalized)) {
      const [mailId] = requiredParams(params, 1, sql);
      return operation.selectForUpdate("mail_messages", String(mailId));
    }
    if (/^SELECT COUNT\(\*\) AS total_count, COALESCE\(SUM\(seller_account_id = \?\), 0\) AS seller_count FROM market_listings$/i.test(normalized)) {
      const [accountIdValue] = requiredParams(params, 1, sql);
      assert.equal(typeof options.snapshotProvider, "function");
      const accountId = String(accountIdValue);
      const snapshot = options.snapshotProvider();
      const listings = Object.values(snapshot.market_listings || {});
      const totalCount = listings.length;
      const sellerCount = listings.filter((listing) => (
        String(listing.seller_account_id || "") === accountId
      )).length;
      return operation.read(
        "market_capacity_counts",
        marketCapacityCountKey(accountId, totalCount, sellerCount),
      );
    }

    if (/^UPDATE profile_bindings SET player_id = \?, profile_revision = \?, updated_at = \?, document_json = CAST\(\? AS JSON\) WHERE account_id = \? AND player_id = \? AND profile_revision = \?$/i.test(normalized)) {
      const [playerId, nextRevision, updatedAt, documentJson, accountId, expectedPlayerId, expectedRevision]
        = requiredParams(params, 7, sql);
      return operation.update("profile_bindings", String(accountId), {
        where: {
          account_id: String(accountId),
          player_id: String(expectedPlayerId),
          profile_revision: Number(expectedRevision),
        },
        set: {
          player_id: String(playerId),
          profile_revision: Number(nextRevision),
          updated_at: String(updatedAt),
          document_json: jsonParameter(documentJson, sql),
        },
      });
    }

    if (/^UPDATE profiles SET account_id = \?, profile_revision = \?, updated_at = \?, profile_json = CAST\(\? AS JSON\) WHERE player_id = \? AND account_id = \? AND profile_revision = \?$/i.test(normalized)) {
      const [accountId, nextRevision, updatedAt, profileJson, playerId, expectedAccountId, expectedRevision]
        = requiredParams(params, 7, sql);
      return operation.update("profiles", String(playerId), {
        where: {
          player_id: String(playerId),
          account_id: String(expectedAccountId),
          profile_revision: Number(expectedRevision),
        },
        set: {
          account_id: String(accountId),
          profile_revision: Number(nextRevision),
          updated_at: String(updatedAt),
          profile_json: jsonParameter(profileJson, sql),
        },
      });
    }

    if (/^INSERT INTO mutation_receipts \(operation_id, request_hash, action_id, account_id, committed_at, expires_at, document_json\) VALUES \(\?, \?, \?, \?, \?, \?, CAST\(\? AS JSON\)\)$/i.test(normalized)) {
      const [operationId, requestHash, actionId, accountId, committedAt, expiresAt, documentJson]
        = requiredParams(params, 7, sql);
      return operation.insert("mutation_receipts", String(operationId), {
        operation_id: String(operationId),
        request_hash: String(requestHash),
        action_id: String(actionId),
        account_id: accountId === null ? null : String(accountId),
        committed_at: String(committedAt),
        expires_at: String(expiresAt),
        document_json: jsonParameter(documentJson, sql),
      });
    }

    if (/^INSERT INTO market_listings \(listing_id, seller_account_id, item_id, currency, unit_price, item_count, created_at, document_json\) VALUES \(\?, \?, \?, \?, \?, \?, \?, CAST\(\? AS JSON\)\)$/i.test(normalized)) {
      const [listingId, sellerAccountId, itemId, currency, unitPrice, itemCount, createdAt, documentJson]
        = requiredParams(params, 8, sql);
      return operation.insert("market_listings", String(listingId), {
        listing_id: String(listingId),
        seller_account_id: String(sellerAccountId),
        item_id: String(itemId),
        currency: String(currency),
        unit_price: Number(unitPrice),
        item_count: Number(itemCount),
        created_at: String(createdAt),
        document_json: jsonParameter(documentJson, sql),
      });
    }

    if (/^INSERT INTO mail_messages \(mail_id, sender_account_id, recipient_account_id, title, created_at, read_at, document_json\) VALUES \(\?, \?, \?, \?, \?, \?, CAST\(\? AS JSON\)\)$/i.test(normalized)) {
      const [mailId, senderAccountId, recipientAccountId, title, createdAt, readAt, documentJson]
        = requiredParams(params, 7, sql);
      return operation.insert("mail_messages", String(mailId), {
        mail_id: String(mailId),
        sender_account_id: String(senderAccountId),
        recipient_account_id: String(recipientAccountId),
        title: String(title),
        created_at: String(createdAt),
        read_at: readAt === null ? null : String(readAt),
        document_json: jsonParameter(documentJson, sql),
      });
    }

    if (/^DELETE FROM market_listings WHERE listing_id = \? AND seller_account_id = \? AND item_id = \? AND currency = \? AND unit_price = \? AND item_count = \? AND created_at = \?$/i.test(normalized)) {
      const [listingId, sellerAccountId, itemId, currency, unitPrice, itemCount, createdAt]
        = requiredParams(params, 7, sql);
      return operation.delete("market_listings", String(listingId), {
        where: {
          listing_id: String(listingId),
          seller_account_id: String(sellerAccountId),
          item_id: String(itemId),
          currency: String(currency),
          unit_price: Number(unitPrice),
          item_count: Number(itemCount),
          created_at: String(createdAt),
        },
      });
    }

    if (/^UPDATE mail_messages SET sender_account_id = \?, recipient_account_id = \?, title = \?, created_at = \?, read_at = \?, document_json = CAST\(\? AS JSON\) WHERE mail_id = \? AND sender_account_id = \? AND recipient_account_id = \? AND title = \? AND created_at = \? AND read_at <=> \?$/i.test(normalized)) {
      const [
        senderAccountId,
        recipientAccountId,
        title,
        createdAt,
        readAt,
        documentJson,
        mailId,
        expectedSenderAccountId,
        expectedRecipientAccountId,
        expectedTitle,
        expectedCreatedAt,
        expectedReadAt,
      ] = requiredParams(params, 12, sql);
      return operation.update("mail_messages", String(mailId), {
        where: {
          mail_id: String(mailId),
          sender_account_id: String(expectedSenderAccountId),
          recipient_account_id: String(expectedRecipientAccountId),
          title: String(expectedTitle),
          created_at: String(expectedCreatedAt),
          read_at: expectedReadAt === null ? null : String(expectedReadAt),
        },
        set: {
          sender_account_id: String(senderAccountId),
          recipient_account_id: String(recipientAccountId),
          title: String(title),
          created_at: String(createdAt),
          read_at: readAt === null ? null : String(readAt),
          document_json: jsonParameter(documentJson, sql),
        },
      });
    }

    if (/^DELETE FROM mail_messages WHERE mail_id = \? AND sender_account_id = \? AND recipient_account_id = \? AND title = \? AND created_at = \? AND read_at <=> \?$/i.test(normalized)) {
      const [mailId, senderAccountId, recipientAccountId, title, createdAt, readAt]
        = requiredParams(params, 6, sql);
      return operation.delete("mail_messages", String(mailId), {
        where: {
          mail_id: String(mailId),
          sender_account_id: String(senderAccountId),
          recipient_account_id: String(recipientAccountId),
          title: String(title),
          created_at: String(createdAt),
          read_at: readAt === null ? null : String(readAt),
        },
      });
    }

    if (/^INSERT INTO consumed_equipment_envelopes \(envelope_id\) VALUES \(\?\)$/i.test(normalized)) {
      const [envelopeId] = requiredParams(params, 1, sql);
      return operation.insert("consumed_equipment_envelopes", String(envelopeId), {
        envelope_id: String(envelopeId),
      });
    }

    if (/^INSERT INTO server_state \(state_key, document_json\) VALUES \('auth', CAST\(.+ AS JSON\)\) ON DUPLICATE KEY UPDATE document_json = VALUES\(document_json\)$/i.test(normalized)) {
      requiredParams(params, 0, sql);
      return operation.update("server_state", "auth", {
        where: {scope_key: "auth"},
        set: {document_json: {
          schemaVersion: 2,
          storage: "mysql_entity_tables",
          serviceEventSeq: 0,
          marketConfig: {taxRate: 0.07},
          offlineHangConfig: {},
        }},
      });
    }

    return null;
  };
}

function loaderRowsFromSqlSnapshot(snapshot) {
  const serverState = snapshot.server_state && snapshot.server_state.auth
    ? snapshot.server_state.auth.document_json
    : {schemaVersion: 2, storage: "mysql_entity_tables"};
  const rows = [
    ["server_state", "auth", JSON.stringify(serverState)],
    ["store_revision", "auth", String(snapshot.auth_store_revisions.auth.revision)],
  ];
  for (const [accountId, binding] of Object.entries(snapshot.profile_bindings || {})) {
    rows.push(["profile_bindings", accountId, JSON.stringify(binding.document_json)]);
  }
  for (const [playerId, profile] of Object.entries(snapshot.profiles || {})) {
    rows.push(["profiles", playerId, JSON.stringify({
      playerId: profile.player_id,
      accountId: profile.account_id,
      profileRevision: profile.profile_revision,
      updatedAt: profile.updated_at,
      profile: profile.profile_json,
    })]);
  }
  for (const [operationId, receipt] of Object.entries(snapshot.mutation_receipts || {})) {
    rows.push(["mutation_receipts", operationId, JSON.stringify(receipt.document_json)]);
  }
  for (const [listingId, listing] of Object.entries(snapshot.market_listings || {})) {
    rows.push(["market_listings", listingId, JSON.stringify(listing.document_json)]);
  }
  for (const [mailId, mail] of Object.entries(snapshot.mail_messages || {})) {
    rows.push(["mail_messages", mailId, JSON.stringify(mail.document_json)]);
  }
  for (const envelopeId of Object.keys(snapshot.consumed_equipment_envelopes || {})) {
    rows.push(["consumed_equipment_envelopes", envelopeId, JSON.stringify({
      schemaVersion: 1,
      envelopeId,
    })]);
  }
  return rows;
}

function createSharedLoader(tempDir, initialSeed = sqlSeed()) {
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const statePath = path.join(tempDir, "loader-state.json");
  function writeSnapshot(snapshot) {
    const temporaryPath = `${statePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(loaderRowsFromSqlSnapshot(snapshot)));
    fs.renameSync(temporaryPath, statePath);
  }
  writeSnapshot(initialSeed);
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  if (stdin.includes("information_schema.tables")) {
    process.stdout.write("1\\n");
    return;
  }
  if (stdin.includes("SELECT 'server_state'")) {
    const rows = JSON.parse(fs.readFileSync(${JSON.stringify(statePath)}, "utf8"));
    process.stdout.write(rows.map((row) => row.join("\\t")).join("\\n") + "\\n");
  }
});
`, {mode: 0o755});
  return {fakeMysqlPath, writeSnapshot};
}

function createProductionStore(fakeMysqlPath, pool) {
  return createMysqlAuthStore({
    mysqlPath: fakeMysqlPath,
    host: "127.0.0.1",
    port: 3306,
    user: "tester",
    password: "dummy",
    database: "beastbound_shared_transaction_test",
    createDatabase: false,
    ensureSchema: false,
    usePool: true,
    poolFactory: () => pool,
  });
}

function isResourceConflict(error) {
  return Boolean(error && error.code === "mysql_resource_revision_conflict");
}

function isGlobalConflict(error) {
  return Boolean(error && error.code === "mysql_store_revision_conflict");
}

test("different profiles truly overlap, retain both winners, and keep Node-local baselines row-local", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-different-"));
  const queryLog = [];
  const loader = createSharedLoader(tempDir);
  const harness = createSharedMysqlTransactionHarness({
    seed: sqlSeed(),
    statementHandler: createProductionSqlHandler(queryLog),
    onCommittedSnapshot(snapshot) {
      loader.writeSnapshot(snapshot);
    },
  });
  const storeA = createProductionStore(loader.fakeMysqlPath, harness.poolFor("node_a"));
  const storeB = createProductionStore(loader.fakeMysqlPath, harness.poolFor("node_b"));
  const gateA = harness.blockNext({writerId: "node_a", phase: "before_commit_apply"});
  void gateA.entered.catch(() => {});
  let saveA = null;

  try {
    const loadedA = storeA.load();
    const loadedB = storeB.load();
    const stagedA = stagedProfileSave(storeA, loadedA, "a", {
      stoneCoins: 90,
      operationId: "op_parallel_a_1_x",
      requestHash: "a".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    saveA = stagedA.promise;
    await gateA.entered;

    const stagedB = stagedProfileSave(storeB, loadedB, "b", {
      stoneCoins: 190,
      operationId: "op_parallel_b_1_x",
      requestHash: "b".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await harness.waitForEvent({type: "commit_completed", writerId: "node_b"});
    await stagedB.promise;

    const whileABlocked = harness.snapshot();
    assert.equal(whileABlocked.profiles[ACTORS.a.playerId].profile_revision, 1);
    assert.equal(whileABlocked.profiles[ACTORS.b.playerId].profile_revision, 2);
    assert.equal(
      harness.events().some((event) => (
        event.type === "lock_wait"
        && event.writerId === "node_b"
        && event.table === "auth_store_revisions"
      )),
      false,
      "different profile writers must share the compatibility barrier",
    );

    gateA.release();
    await saveA;
    saveA = null;

    const committed = harness.snapshot();
    assert.equal(committed.auth_store_revisions.auth.revision, 0);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_revision, 2);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_json.stoneCoins, 90);
    assert.equal(committed.profiles[ACTORS.b.playerId].profile_revision, 2);
    assert.equal(committed.profiles[ACTORS.b.playerId].profile_json.stoneCoins, 190);
    assert.equal(committed.mutation_receipts.op_parallel_a_1_x.document_json.operationId, "op_parallel_a_1_x");
    assert.equal(committed.mutation_receipts.op_parallel_b_1_x.document_json.operationId, "op_parallel_b_1_x");

    const stagedA2 = stagedProfileSave(storeA, stagedA.after, "a", {
      stoneCoins: 80,
      operationId: "op_parallel_a_2_x",
      requestHash: "c".repeat(64),
      updatedAt: UPDATED_AT_3,
    });
    await stagedA2.promise;
    assert.equal(harness.snapshot().profiles[ACTORS.a.playerId].profile_revision, 3);

    const staleB = stagedProfileSave(storeA, stagedA2.after, "b", {
      stoneCoins: 180,
      operationId: "op_parallel_b_stale",
      requestHash: "d".repeat(64),
      updatedAt: UPDATED_AT_4,
    });
    await assert.rejects(staleB.promise, isResourceConflict);
    assert.equal(harness.snapshot().profiles[ACTORS.b.playerId].profile_json.stoneCoins, 190);

    const reloadedA = storeA.load();
    const retriedB = stagedProfileSave(storeA, reloadedA, "b", {
      stoneCoins: 180,
      operationId: "op_parallel_b_retry",
      requestHash: "e".repeat(64),
      updatedAt: UPDATED_AT_4,
    });
    await retriedB.promise;
    const retried = harness.snapshot();
    assert.equal(retried.profiles[ACTORS.a.playerId].profile_revision, 3);
    assert.equal(retried.profiles[ACTORS.b.playerId].profile_revision, 3);
    assert.equal(retried.profiles[ACTORS.b.playerId].profile_json.stoneCoins, 180);
  } finally {
    gateA.release();
    if (saveA !== null) {
      await Promise.allSettled([saveA]);
    }
    await Promise.allSettled([storeA.close(), storeB.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("same profile waits on its binding lock and exactly one conditional writer wins", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-same-"));
  const queryLog = [];
  const loader = createSharedLoader(tempDir);
  const harness = createSharedMysqlTransactionHarness({
    seed: sqlSeed(),
    statementHandler: createProductionSqlHandler(queryLog),
    onCommittedSnapshot(snapshot) {
      loader.writeSnapshot(snapshot);
    },
  });
  const storeA = createProductionStore(loader.fakeMysqlPath, harness.poolFor("same_a"));
  const storeB = createProductionStore(loader.fakeMysqlPath, harness.poolFor("same_b"));
  const gateA = harness.blockNext({writerId: "same_a", phase: "before_commit_apply"});
  void gateA.entered.catch(() => {});
  let settled = null;

  try {
    const loadedA = storeA.load();
    const loadedB = storeB.load();
    const first = stagedProfileSave(storeA, loadedA, "a", {
      stoneCoins: 91,
      operationId: "op_same_a_writer_x",
      requestHash: "1".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await gateA.entered;
    const second = stagedProfileSave(storeB, loadedB, "a", {
      stoneCoins: 92,
      operationId: "op_same_b_writer_x",
      requestHash: "2".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    settled = Promise.allSettled([first.promise, second.promise]);
    await harness.waitForEvent({
      type: "lock_wait",
      writerId: "same_b",
      table: "profile_bindings",
      key: ACTORS.a.accountId,
    });
    gateA.release();

    const [firstResult, secondResult] = await settled;
    assert.equal(firstResult.status, "fulfilled");
    assert.equal(secondResult.status, "rejected");
    assert.equal(isResourceConflict(secondResult.reason), true);
    const committed = harness.snapshot();
    assert.equal(committed.auth_store_revisions.auth.revision, 0);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_revision, 2);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_json.stoneCoins, 91);
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_same_a_writer_x"), true);
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_same_b_writer_x"), false);
  } finally {
    gateA.release();
    if (settled !== null) {
      await settled;
    }
    await Promise.allSettled([storeA.close(), storeB.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("legacy fallback validates the full profile read-set even when it writes only another profile", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-legacy-readset-"));
  const queryLog = [];
  const loader = createSharedLoader(tempDir);
  const harness = createSharedMysqlTransactionHarness({
    seed: sqlSeed(),
    statementHandler: createProductionSqlHandler(queryLog),
    onCommittedSnapshot(snapshot) {
      loader.writeSnapshot(snapshot);
    },
  });
  const profileStore = createProductionStore(loader.fakeMysqlPath, harness.poolFor("profile_b"));
  const legacyStore = createProductionStore(loader.fakeMysqlPath, harness.poolFor("legacy_a"));

  try {
    const loadedProfile = profileStore.load();
    const staleLegacy = legacyStore.load();
    const profileWrite = stagedProfileSave(profileStore, loadedProfile, "b", {
      stoneCoins: 175,
      operationId: "op_readset_b_writer",
      requestHash: "3".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await profileWrite.promise;

    const legacyCandidate = nextProfileAuthority(staleLegacy, "a", {
      stoneCoins: 75,
      operationId: "op_legacy_a_writer",
      requestHash: "4".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await assert.rejects(legacyStore.saveAsync(legacyCandidate), isResourceConflict);

    const committed = harness.snapshot();
    assert.equal(committed.auth_store_revisions.auth.revision, 0);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_revision, 1);
    assert.equal(committed.profiles[ACTORS.b.playerId].profile_revision, 2);
    const legacyQueries = queryLog.filter((entry) => entry.writerId === "legacy_a");
    assert.match(legacyQueries[0].sql, /FOR UPDATE$/i);
    assert.match(legacyQueries[1].sql, /profile_bindings ORDER BY account_id FOR UPDATE$/i);
    assert.equal(
      legacyQueries.some((entry) => /^INSERT INTO profile_bindings\b/i.test(entry.sql)),
      false,
      "all guards must pass before any legacy business SQL executes",
    );
  } finally {
    await Promise.allSettled([profileStore.close(), legacyStore.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("legacy exclusive commit makes a waiting profile writer fail at the global barrier before row locks", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-legacy-first-"));
  const queryLog = [];
  const loader = createSharedLoader(tempDir);
  const harness = createSharedMysqlTransactionHarness({
    seed: sqlSeed(),
    statementHandler: createProductionSqlHandler(queryLog),
    onCommittedSnapshot(snapshot) {
      loader.writeSnapshot(snapshot);
    },
  });
  const legacyStore = createProductionStore(loader.fakeMysqlPath, harness.poolFor("legacy_first"));
  const profileStore = createProductionStore(loader.fakeMysqlPath, harness.poolFor("profile_waiter"));
  const legacyGate = harness.blockNext({writerId: "legacy_first", phase: "before_commit_apply"});
  void legacyGate.entered.catch(() => {});
  let settled = null;

  try {
    const legacyLoaded = legacyStore.load();
    const profileLoaded = profileStore.load();
    const legacySave = legacyStore.saveAsync(legacyMarketAuthority(legacyLoaded));
    await legacyGate.entered;
    const profileWrite = stagedProfileSave(profileStore, profileLoaded, "a", {
      stoneCoins: 70,
      operationId: "op_waits_for_legacy",
      requestHash: "5".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    settled = Promise.allSettled([legacySave, profileWrite.promise]);
    await harness.waitForEvent({
      type: "lock_wait",
      writerId: "profile_waiter",
      table: "auth_store_revisions",
      key: "auth",
    });
    legacyGate.release();

    const [legacyResult, profileResult] = await settled;
    assert.equal(legacyResult.status, "fulfilled");
    assert.equal(profileResult.status, "rejected");
    assert.equal(isGlobalConflict(profileResult.reason), true);
    const committed = harness.snapshot();
    assert.equal(committed.auth_store_revisions.auth.revision, 1);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_revision, 1);
    const profileQueries = queryLog.filter((entry) => entry.writerId === "profile_waiter");
    assert.equal(profileQueries.length, 1);
    assert.match(profileQueries[0].sql, /FOR SHARE$/i);
  } finally {
    legacyGate.release();
    if (settled !== null) {
      await settled;
    }
    await Promise.allSettled([legacyStore.close(), profileStore.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("duplicate receipt rolls conditional binding and profile writes back without advancing global revision", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-duplicate-"));
  const operationId = "op_shared_duplicate";
  const duplicateReceipt = {
    schemaVersion: 1,
    operationId,
    requestHash: "6".repeat(64),
    actionId: "record_point_save",
    accountId: ACTORS.a.accountId,
    committedAt: UPDATED_AT_1,
    expiresAt: "2026-07-17T02:10:00.000Z",
    response: {ok: true, operationId},
  };
  const seed = sqlSeed({
    mutationReceipts: {
      [operationId]: {
        operation_id: operationId,
        request_hash: duplicateReceipt.requestHash,
        action_id: duplicateReceipt.actionId,
        account_id: duplicateReceipt.accountId,
        committed_at: duplicateReceipt.committedAt,
        expires_at: duplicateReceipt.expiresAt,
        document_json: duplicateReceipt,
      },
    },
  });
  const queryLog = [];
  const loader = createSharedLoader(tempDir);
  const harness = createSharedMysqlTransactionHarness({
    seed,
    statementHandler: createProductionSqlHandler(queryLog),
  });
  const store = createProductionStore(loader.fakeMysqlPath, harness.poolFor("duplicate_node"));

  try {
    const loaded = store.load();
    const staged = stagedProfileSave(store, loaded, "a", {
      stoneCoins: 65,
      operationId,
      requestHash: "7".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await assert.rejects(staged.promise, isResourceConflict);
    assert.deepEqual(harness.snapshot(), seed);
    assert.equal(
      harness.events().filter((event) => event.type === "write_staged" && event.writerId === "duplicate_node").length,
      2,
    );
    assert.equal(
      harness.events().some((event) => event.type === "rollback_applied" && event.writerId === "duplicate_node"),
      true,
    );
  } finally {
    await store.close();
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("market create capacity guard serializes different sellers at 118 and commits both up to 120", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-market-create-118-"));
  const authority = marketCreateAuthority(118);
  const seed = sqlSeed({
    authority,
    marketCapacityCounts: [
      {actorKey: "a", totalCount: 118, sellerCount: 0},
      {actorKey: "b", totalCount: 119, sellerCount: 0},
    ],
  });
  const queryLog = [];
  const loader = createSharedLoader(tempDir, seed);
  let harness = null;
  harness = createSharedMysqlTransactionHarness({
    seed,
    statementHandler: createProductionSqlHandler(queryLog, {
      snapshotProvider: () => harness.snapshot(),
    }),
    onCommittedSnapshot(snapshot) {
      loader.writeSnapshot(snapshot);
    },
  });
  const storeA = createProductionStore(loader.fakeMysqlPath, harness.poolFor("market_create_118_a"));
  const storeB = createProductionStore(loader.fakeMysqlPath, harness.poolFor("market_create_118_b"));
  const gateA = harness.blockNext({writerId: "market_create_118_a", phase: "before_commit_apply"});
  void gateA.entered.catch(() => {});
  let settled = null;

  try {
    const loadedA = storeA.load();
    const loadedB = storeB.load();
    const first = stagedMarketCreate(storeA, loadedA, "a", {
      operationId: "op_market_create_118_a",
      requestHash: "1".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await gateA.entered;
    const second = stagedMarketCreate(storeB, loadedB, "b", {
      operationId: "op_market_create_118_b",
      requestHash: "2".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    settled = Promise.allSettled([first.promise, second.promise]);
    await harness.waitForEvent({
      type: "lock_wait",
      writerId: "market_create_118_b",
      table: "auth_store_revisions",
      key: MARKET_CREATE_CAPACITY_GUARD_KEY,
    });
    gateA.release();

    const results = await settled;
    assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled"]);
    const committed = harness.snapshot();
    assert.equal(Object.keys(committed.market_listings).length, MARKET_MAX_LISTINGS);
    assert.equal(committed.auth_store_revisions.auth.revision, 0);
    assert.equal(committed.auth_store_revisions[MARKET_CREATE_CAPACITY_GUARD_KEY].revision, 0);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_revision, 2);
    assert.equal(committed.profiles[ACTORS.b.playerId].profile_revision, 2);
    assert.deepEqual(committed.profiles[ACTORS.a.playerId].profile_json.backpackSlots, [
      {itemId: "item_meat_small", count: 1},
    ]);
    assert.deepEqual(committed.profiles[ACTORS.b.playerId].profile_json.backpackSlots, [
      {itemId: "item_meat_small", count: 1},
    ]);
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_market_create_118_a"), true);
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_market_create_118_b"), true);
  } finally {
    gateA.release();
    if (settled !== null) {
      await settled;
    }
    await Promise.allSettled([storeA.close(), storeB.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("market create capacity guard lets exactly one 119 contender win and rolls the full loser back", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-market-create-119-"));
  const authority = marketCreateAuthority(119);
  const seed = sqlSeed({
    authority,
    marketCapacityCounts: [
      {actorKey: "a", totalCount: 119, sellerCount: 0},
      {actorKey: "b", totalCount: 120, sellerCount: 0},
    ],
  });
  const queryLog = [];
  const loader = createSharedLoader(tempDir, seed);
  let harness = null;
  harness = createSharedMysqlTransactionHarness({
    seed,
    statementHandler: createProductionSqlHandler(queryLog, {
      snapshotProvider: () => harness.snapshot(),
    }),
    onCommittedSnapshot(snapshot) {
      loader.writeSnapshot(snapshot);
    },
  });
  const storeA = createProductionStore(loader.fakeMysqlPath, harness.poolFor("market_create_119_a"));
  const storeB = createProductionStore(loader.fakeMysqlPath, harness.poolFor("market_create_119_b"));
  const gateA = harness.blockNext({writerId: "market_create_119_a", phase: "before_commit_apply"});
  void gateA.entered.catch(() => {});
  let settled = null;

  try {
    const loadedA = storeA.load();
    const loadedB = storeB.load();
    const first = stagedMarketCreate(storeA, loadedA, "a", {
      operationId: "op_market_create_119_a",
      requestHash: "3".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await gateA.entered;
    const second = stagedMarketCreate(storeB, loadedB, "b", {
      operationId: "op_market_create_119_b",
      requestHash: "4".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    settled = Promise.allSettled([first.promise, second.promise]);
    await harness.waitForEvent({
      type: "lock_wait",
      writerId: "market_create_119_b",
      table: "auth_store_revisions",
      key: MARKET_CREATE_CAPACITY_GUARD_KEY,
    });
    gateA.release();

    const [firstResult, secondResult] = await settled;
    assert.equal(firstResult.status, "fulfilled");
    assert.equal(secondResult.status, "rejected");
    assert.equal(secondResult.reason.code, "market_full");
    const committed = harness.snapshot();
    assert.equal(Object.keys(committed.market_listings).length, MARKET_MAX_LISTINGS);
    assert.equal(committed.auth_store_revisions.auth.revision, 0);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_revision, 2);
    assert.equal(committed.profiles[ACTORS.b.playerId].profile_revision, 1);
    assert.deepEqual(committed.profiles[ACTORS.b.playerId].profile_json.backpackSlots, [
      {itemId: "item_meat_small", count: 2},
    ]);
    assert.equal(Object.hasOwn(committed.market_listings, "listing_shared_market_create_a"), true);
    assert.equal(Object.hasOwn(committed.market_listings, "listing_shared_market_create_b"), false);
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_market_create_119_a"), true);
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_market_create_119_b"), false);
    assert.equal(
      harness.events().some((event) => (
        event.type === "write_staged" && event.writerId === "market_create_119_b"
      )),
      false,
    );
  } finally {
    gateA.release();
    if (settled !== null) {
      await settled;
    }
    await Promise.allSettled([storeA.close(), storeB.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("conditional create first makes a waiting legacy single-add fail live capacity before business SQL", async (t) => {
  const cases = [
    {
      name: "global 119 to 120 rejects the legacy addition as market_full",
      conditionalActorKey: "a",
      legacyActorKey: "b",
      expectedCode: "market_full",
      initialSellerCount: 0,
    },
    {
      name: "same seller 19 to 20 rejects the legacy addition as market_listing_limit",
      conditionalActorKey: "b",
      legacyActorKey: "b",
      expectedCode: "market_listing_limit",
      initialSellerCount: 19,
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-market-create-mixed-"));
      const conditionalDir = path.join(tempDir, "conditional");
      const legacyDir = path.join(tempDir, "legacy");
      fs.mkdirSync(conditionalDir);
      fs.mkdirSync(legacyDir);
      const authority = marketCreateAuthority(119);
      if (fixture.initialSellerCount > 0) {
        const sellerAccountId = ACTORS[fixture.legacyActorKey].accountId;
        for (const listing of Object.values(authority.marketListings).slice(0, fixture.initialSellerCount)) {
          listing.sellerAccountId = sellerAccountId;
        }
      }
      const conditionalOptions = {
        operationId: `op_market_create_mixed_conditional_${fixture.expectedCode}`,
        requestHash: fixture.expectedCode === "market_full" ? "a".repeat(64) : "b".repeat(64),
        updatedAt: UPDATED_AT_2,
      };
      const legacyOptions = {
        listingId: `listing_shared_market_create_legacy_${fixture.expectedCode}`,
        operationId: `op_market_create_mixed_legacy_${fixture.expectedCode}`,
        requestHash: fixture.expectedCode === "market_full" ? "c".repeat(64) : "d".repeat(64),
        updatedAt: UPDATED_AT_3,
      };
      const conditionalAfter = nextMarketCreateAuthority(
        authority,
        fixture.conditionalActorKey,
        conditionalOptions,
      );
      // The legacy writer intentionally has the winning profile revision but
      // a stale 119-listing book. This isolates the compatibility dimension:
      // profile snapshot validation can pass, so only the shared capacity
      // guard plus the post-wait aggregate may prevent the 121st listing.
      const legacyView = cloneAuthorityRoot(authority);
      const conditionalActor = ACTORS[fixture.conditionalActorKey];
      legacyView.profileBindings[conditionalActor.accountId] =
        conditionalAfter.profileBindings[conditionalActor.accountId];
      legacyView.profiles[conditionalActor.playerId] =
        conditionalAfter.profiles[conditionalActor.playerId];

      const capacityRows = [
        {
          actorKey: fixture.conditionalActorKey,
          totalCount: 119,
          sellerCount: fixture.initialSellerCount,
        },
        {
          actorKey: fixture.legacyActorKey,
          totalCount: 120,
          sellerCount: fixture.initialSellerCount
            + (fixture.conditionalActorKey === fixture.legacyActorKey ? 1 : 0),
        },
      ];
      const seed = sqlSeed({authority, marketCapacityCounts: capacityRows});
      const conditionalLoader = createSharedLoader(conditionalDir, seed);
      const legacyLoaderSeed = sqlSeed({authority: legacyView});
      const legacyProfile = legacyView.profiles[conditionalActor.playerId];
      legacyLoaderSeed.profiles[conditionalActor.playerId] = {
        ...legacyLoaderSeed.profiles[conditionalActor.playerId],
        profile_revision: legacyProfile.profileRevision,
        updated_at: legacyProfile.updatedAt,
        profile_json: legacyProfile.profile,
      };
      const legacyLoader = createSharedLoader(legacyDir, legacyLoaderSeed);
      const queryLog = [];
      let harness = null;
      harness = createSharedMysqlTransactionHarness({
        seed,
        statementHandler: createProductionSqlHandler(queryLog, {
          snapshotProvider: () => harness.snapshot(),
        }),
        onCommittedSnapshot(snapshot) {
          conditionalLoader.writeSnapshot(snapshot);
        },
      });
      const conditionalWriterId = `market_create_mixed_conditional_${fixture.expectedCode}`;
      const legacyWriterId = `market_create_mixed_legacy_${fixture.expectedCode}`;
      const conditionalStore = createProductionStore(
        conditionalLoader.fakeMysqlPath,
        harness.poolFor(conditionalWriterId),
      );
      const legacyStore = createProductionStore(
        legacyLoader.fakeMysqlPath,
        harness.poolFor(legacyWriterId),
      );
      const conditionalGate = harness.blockNext({
        writerId: conditionalWriterId,
        phase: "before_commit_apply",
      });
      void conditionalGate.entered.catch(() => {});
      let settled = null;

      try {
        const conditionalLoaded = conditionalStore.load();
        const legacyLoaded = legacyStore.load();
        const conditional = stagedMarketCreate(
          conditionalStore,
          conditionalLoaded,
          fixture.conditionalActorKey,
          conditionalOptions,
        );
        await conditionalGate.entered;
        const legacy = stagedLegacyMarketCreate(
          legacyStore,
          legacyLoaded,
          fixture.legacyActorKey,
          legacyOptions,
        );
        settled = Promise.allSettled([conditional.promise, legacy.promise]);
        await harness.waitForEvent({
          type: "lock_wait",
          writerId: legacyWriterId,
          table: "auth_store_revisions",
          key: "auth",
        });
        conditionalGate.release();

        const [conditionalResult, legacyResult] = await settled;
        assert.equal(conditionalResult.status, "fulfilled");
        assert.equal(legacyResult.status, "rejected");
        assert.equal(legacyResult.reason.code, fixture.expectedCode);
        assert.equal(legacyResult.reason.outcomeUnknown, false);
        assert.equal(legacyResult.reason.rollbackConfirmed, true);
        const committed = harness.snapshot();
        assert.equal(Object.keys(committed.market_listings).length, MARKET_MAX_LISTINGS);
        assert.equal(committed.auth_store_revisions.auth.revision, 0);
        assert.equal(committed.auth_store_revisions[MARKET_CREATE_CAPACITY_GUARD_KEY].revision, 0);
        assert.equal(
          Object.hasOwn(committed.market_listings, legacyOptions.listingId),
          false,
        );
        assert.equal(
          Object.hasOwn(committed.mutation_receipts, legacyOptions.operationId),
          false,
        );
        assert.deepEqual(
          committed.profiles[ACTORS[fixture.legacyActorKey].playerId].profile_json.backpackSlots,
          fixture.conditionalActorKey === fixture.legacyActorKey
            ? [{itemId: "item_meat_small", count: 1}]
            : [{itemId: "item_meat_small", count: 2}],
        );
        assert.equal(
          harness.events().some((event) => (
            event.type === "write_staged" && event.writerId === legacyWriterId
          )),
          false,
        );
        const legacyQueries = queryLog.filter((entry) => entry.writerId === legacyWriterId);
        assert.equal(
          legacyQueries.some((entry) => /^(?:INSERT|UPDATE|DELETE)\b/i.test(entry.sql)),
          false,
        );
        const legacyGuardIndex = legacyQueries.findIndex((entry) => (
          /scope_key = \? FOR UPDATE$/i.test(entry.sql)
        ));
        const legacyCapacityIndex = legacyQueries.findIndex((entry) => (
          /^SELECT COUNT\(\*\) AS total_count/i.test(entry.sql)
        ));
        assert.ok(legacyGuardIndex >= 0 && legacyGuardIndex < legacyCapacityIndex);
      } finally {
        conditionalGate.release();
        if (settled !== null) {
          await settled;
        }
        await Promise.allSettled([conditionalStore.close(), legacyStore.close()]);
        fs.rmSync(tempDir, {recursive: true, force: true});
      }

      assert.equal(harness.assertIdle(), true);
    });
  }
});

test("market create DB-only listing and receipt collisions roll all earlier asset writes back", async (t) => {
  await t.test("listing id collision", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-market-create-listing-duplicate-"));
    const authority = marketCreateAuthority(10);
    const loaderSeed = sqlSeed({authority});
    const databaseSeed = sqlSeed({
      authority,
      marketCapacityCounts: [{actorKey: "a", totalCount: 11, sellerCount: 1}],
    });
    const duplicate = nextMarketCreateAuthority(authority, "a", {
      operationId: "op_market_create_listing_duplicate_seed",
      requestHash: "5".repeat(64),
      updatedAt: UPDATED_AT_1,
    }).marketListings.listing_shared_market_create_a;
    databaseSeed.market_listings[duplicate.listingId] = {
      listing_id: duplicate.listingId,
      seller_account_id: duplicate.sellerAccountId,
      item_id: duplicate.itemId,
      currency: duplicate.currency,
      unit_price: duplicate.unitPrice,
      item_count: duplicate.count,
      created_at: duplicate.createdAt,
      document_json: duplicate,
    };
    const queryLog = [];
    const loader = createSharedLoader(tempDir, loaderSeed);
    let harness = null;
    harness = createSharedMysqlTransactionHarness({
      seed: databaseSeed,
      statementHandler: createProductionSqlHandler(queryLog, {
        snapshotProvider: () => harness.snapshot(),
      }),
    });
    const store = createProductionStore(loader.fakeMysqlPath, harness.poolFor("market_create_listing_duplicate"));
    try {
      const loaded = store.load();
      const staged = stagedMarketCreate(store, loaded, "a", {
        operationId: "op_market_create_listing_duplicate",
        requestHash: "6".repeat(64),
        updatedAt: UPDATED_AT_2,
      });
      await assert.rejects(staged.promise, isResourceConflict);
      assert.deepEqual(harness.snapshot(), databaseSeed);
      assert.deepEqual(
        harness.events()
          .filter((event) => event.type === "write_staged" && event.writerId === "market_create_listing_duplicate")
          .map((event) => event.table),
        ["profile_bindings", "profiles"],
      );
    } finally {
      await store.close();
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
    assert.equal(harness.assertIdle(), true);
  });

  await t.test("receipt collision after listing insert", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-market-create-receipt-duplicate-"));
    const authority = marketCreateAuthority(10);
    const operationId = "op_market_create_receipt_duplicate";
    const loaderSeed = sqlSeed({authority});
    const duplicateReceipt = {
      schemaVersion: 1,
      operationId,
      requestHash: "7".repeat(64),
      actionId: MARKET_CREATE_ACTION_ID,
      accountId: ACTORS.a.accountId,
      committedAt: UPDATED_AT_1,
      expiresAt: "2026-07-18T02:10:00.000Z",
      response: {ok: true, operationId},
    };
    const databaseSeed = sqlSeed({
      authority,
      marketCapacityCounts: [{actorKey: "a", totalCount: 10, sellerCount: 0}],
      mutationReceipts: {
        [operationId]: {
          operation_id: operationId,
          request_hash: duplicateReceipt.requestHash,
          action_id: duplicateReceipt.actionId,
          account_id: duplicateReceipt.accountId,
          committed_at: duplicateReceipt.committedAt,
          expires_at: duplicateReceipt.expiresAt,
          document_json: duplicateReceipt,
        },
      },
    });
    const queryLog = [];
    const loader = createSharedLoader(tempDir, loaderSeed);
    let harness = null;
    harness = createSharedMysqlTransactionHarness({
      seed: databaseSeed,
      statementHandler: createProductionSqlHandler(queryLog, {
        snapshotProvider: () => harness.snapshot(),
      }),
    });
    const store = createProductionStore(loader.fakeMysqlPath, harness.poolFor("market_create_receipt_duplicate"));
    try {
      const loaded = store.load();
      const staged = stagedMarketCreate(store, loaded, "a", {
        operationId,
        requestHash: "8".repeat(64),
        updatedAt: UPDATED_AT_2,
      });
      await assert.rejects(staged.promise, isResourceConflict);
      assert.deepEqual(harness.snapshot(), databaseSeed);
      assert.deepEqual(
        harness.events()
          .filter((event) => event.type === "write_staged" && event.writerId === "market_create_receipt_duplicate")
          .map((event) => event.table),
        ["profile_bindings", "profiles", "market_listings"],
      );
    } finally {
      await store.close();
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
    assert.equal(harness.assertIdle(), true);
  });
});

test("different ordinary market cancels overlap and preserve both profile and listing settlements", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-market-different-"));
  const authority = marketAuthority();
  const seed = sqlSeed({authority});
  const queryLog = [];
  const loader = createSharedLoader(tempDir, seed);
  const harness = createSharedMysqlTransactionHarness({
    seed,
    statementHandler: createProductionSqlHandler(queryLog),
    onCommittedSnapshot(snapshot) {
      loader.writeSnapshot(snapshot);
    },
  });
  const storeA = createProductionStore(loader.fakeMysqlPath, harness.poolFor("market_a"));
  const storeB = createProductionStore(loader.fakeMysqlPath, harness.poolFor("market_b"));
  const gateA = harness.blockNext({writerId: "market_a", phase: "before_commit_apply"});
  void gateA.entered.catch(() => {});
  let saveA = null;

  try {
    const loadedA = storeA.load();
    const loadedB = storeB.load();
    const first = stagedMarketCancel(storeA, loadedA, "a", {
      operationId: "op_market_parallel_a_x",
      requestHash: "8".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    saveA = first.promise;
    await gateA.entered;

    const second = stagedMarketCancel(storeB, loadedB, "b", {
      operationId: "op_market_parallel_b_x",
      requestHash: "9".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await harness.waitForEvent({type: "commit_completed", writerId: "market_b"});
    await second.promise;

    const whileABlocked = harness.snapshot();
    assert.equal(Object.hasOwn(whileABlocked.market_listings, MARKET_LISTING_IDS.a), true);
    assert.equal(Object.hasOwn(whileABlocked.market_listings, MARKET_LISTING_IDS.b), false);
    assert.equal(whileABlocked.profiles[ACTORS.b.playerId].profile_revision, 2);
    assert.equal(
      harness.events().some((event) => (
        event.type === "lock_wait"
        && event.writerId === "market_b"
        && event.table === "auth_store_revisions"
      )),
      false,
    );

    gateA.release();
    await saveA;
    saveA = null;

    const committed = harness.snapshot();
    assert.equal(committed.auth_store_revisions.auth.revision, 0);
    assert.equal(Object.hasOwn(committed.market_listings, MARKET_LISTING_IDS.a), false);
    assert.equal(Object.hasOwn(committed.market_listings, MARKET_LISTING_IDS.a2), true);
    assert.equal(Object.hasOwn(committed.market_listings, MARKET_LISTING_IDS.b), false);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_revision, 2);
    assert.equal(committed.profiles[ACTORS.b.playerId].profile_revision, 2);
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_market_parallel_a_x"), true);
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_market_parallel_b_x"), true);

    // Keep Store A on its row-local baseline: it still has the stale listing B
    // in memory. A second cancel must remain conditional without scanning the
    // canonical receipt ledger or resurrecting B's already committed delete.
    const firstCommitted = cloneAuthorityRoot(first.after);
    firstCommitted.mutationReceipts = commitDurableMutationReceiptDelta(
      canonicalDurableMutationReceipts(firstCommitted.mutationReceipts),
    );
    const followUp = stagedMarketCancel(storeA, firstCommitted, "a", {
      listingId: MARKET_LISTING_IDS.a2,
      operationId: "op_market_parallel_a_followup",
      requestHash: "7".repeat(64),
      updatedAt: UPDATED_AT_3,
    });
    await followUp.promise;
    const afterFollowUp = harness.snapshot();
    assert.equal(afterFollowUp.auth_store_revisions.auth.revision, 0);
    assert.equal(Object.hasOwn(afterFollowUp.market_listings, MARKET_LISTING_IDS.a2), false);
    assert.equal(Object.hasOwn(afterFollowUp.market_listings, MARKET_LISTING_IDS.b), false);
    assert.equal(afterFollowUp.profiles[ACTORS.a.playerId].profile_revision, 3);
    assert.equal(Object.hasOwn(afterFollowUp.mutation_receipts, "op_market_parallel_a_followup"), true);
    assert.equal(
      queryLog.filter((entry) => entry.writerId === "market_a")
        .filter((entry) => /auth_store_revisions.+FOR SHARE$/i.test(entry.sql)).length,
      2,
    );
    assert.equal(
      queryLog.filter((entry) => entry.writerId === "market_a")
        .some((entry) => /auth_store_revisions.+FOR UPDATE$/i.test(entry.sql)),
      false,
    );

    for (const writerId of ["market_a", "market_b"]) {
      const queries = queryLog.filter((entry) => entry.writerId === writerId);
      const bindingLock = queries.findIndex((entry) => /profile_bindings.+FOR UPDATE$/i.test(entry.sql));
      const profileLock = queries.findIndex((entry) => /FROM profiles.+FOR UPDATE$/i.test(entry.sql));
      const listingLock = queries.findIndex((entry) => /FROM market_listings.+FOR UPDATE$/i.test(entry.sql));
      const firstWrite = queries.findIndex((entry) => /^UPDATE profile_bindings\b/i.test(entry.sql));
      assert.ok(bindingLock >= 0 && bindingLock < profileLock);
      assert.ok(profileLock < listingLock && listingLock < firstWrite);
    }
  } finally {
    gateA.release();
    if (saveA !== null) {
      await Promise.allSettled([saveA]);
    }
    await Promise.allSettled([storeA.close(), storeB.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("the same ordinary market cancel has one winner and one fully rolled back loser", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-market-same-"));
  const authority = marketAuthority();
  const seed = sqlSeed({authority});
  const queryLog = [];
  const loader = createSharedLoader(tempDir, seed);
  const harness = createSharedMysqlTransactionHarness({
    seed,
    statementHandler: createProductionSqlHandler(queryLog),
    onCommittedSnapshot(snapshot) {
      loader.writeSnapshot(snapshot);
    },
  });
  const storeA = createProductionStore(loader.fakeMysqlPath, harness.poolFor("market_same_a"));
  const storeB = createProductionStore(loader.fakeMysqlPath, harness.poolFor("market_same_b"));
  const gateA = harness.blockNext({writerId: "market_same_a", phase: "before_commit_apply"});
  void gateA.entered.catch(() => {});
  let settled = null;

  try {
    const loadedA = storeA.load();
    const loadedB = storeB.load();
    const first = stagedMarketCancel(storeA, loadedA, "a", {
      operationId: "op_market_same_a_x",
      requestHash: "a".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await gateA.entered;
    const second = stagedMarketCancel(storeB, loadedB, "a", {
      operationId: "op_market_same_b_x",
      requestHash: "b".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    settled = Promise.allSettled([first.promise, second.promise]);
    await harness.waitForEvent({
      type: "lock_wait",
      writerId: "market_same_b",
      table: "profile_bindings",
      key: ACTORS.a.accountId,
    });
    gateA.release();

    const [winner, loser] = await settled;
    assert.equal(winner.status, "fulfilled");
    assert.equal(loser.status, "rejected");
    assert.equal(isResourceConflict(loser.reason), true);
    const committed = harness.snapshot();
    assert.equal(Object.hasOwn(committed.market_listings, MARKET_LISTING_IDS.a), false);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_revision, 2);
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_market_same_a_x"), true);
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_market_same_b_x"), false);
    assert.equal(
      queryLog.filter((entry) => entry.writerId === "market_same_b")
        .some((entry) => /^DELETE FROM market_listings\b/i.test(entry.sql)),
      false,
      "the stale loser must fail on the profile guard before deleting the listing",
    );
  } finally {
    gateA.release();
    if (settled !== null) {
      await settled;
    }
    await Promise.allSettled([storeA.close(), storeB.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("market listing JSON drift fails before writes and duplicate receipt rolls back the delete", async (t) => {
  await t.test("listing already absent", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-market-absent-"));
    const authority = marketAuthority();
    const loaderSeed = sqlSeed({authority});
    const databaseSeed = structuredClone(loaderSeed);
    delete databaseSeed.market_listings[MARKET_LISTING_IDS.a];
    const queryLog = [];
    const loader = createSharedLoader(tempDir, loaderSeed);
    const harness = createSharedMysqlTransactionHarness({
      seed: databaseSeed,
      statementHandler: createProductionSqlHandler(queryLog),
    });
    const store = createProductionStore(loader.fakeMysqlPath, harness.poolFor("market_absent"));
    try {
      const loaded = store.load();
      const staged = stagedMarketCancel(store, loaded, "a", {
        operationId: "op_market_absent_x",
        requestHash: "4".repeat(64),
        updatedAt: UPDATED_AT_2,
      });
      await assert.rejects(staged.promise, isResourceConflict);
      assert.deepEqual(harness.snapshot(), databaseSeed);
      assert.equal(
        queryLog.some((entry) => /^(?:UPDATE|DELETE|INSERT)\b/i.test(entry.sql)),
        false,
      );
    } finally {
      await store.close();
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
    assert.equal(harness.assertIdle(), true);
  });

  await t.test("locked listing document drift", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-market-drift-"));
    const authority = marketAuthority();
    const loaderSeed = sqlSeed({authority});
    const databaseSeed = structuredClone(loaderSeed);
    databaseSeed.market_listings[MARKET_LISTING_IDS.a].document_json = {
      ...databaseSeed.market_listings[MARKET_LISTING_IDS.a].document_json,
      unitPrice: 999,
    };
    const queryLog = [];
    const loader = createSharedLoader(tempDir, loaderSeed);
    const harness = createSharedMysqlTransactionHarness({
      seed: databaseSeed,
      statementHandler: createProductionSqlHandler(queryLog),
    });
    const store = createProductionStore(loader.fakeMysqlPath, harness.poolFor("market_drift"));
    try {
      const loaded = store.load();
      const staged = stagedMarketCancel(store, loaded, "a", {
        operationId: "op_market_drift_x",
        requestHash: "c".repeat(64),
        updatedAt: UPDATED_AT_2,
      });
      await assert.rejects(staged.promise, isResourceConflict);
      assert.deepEqual(harness.snapshot(), databaseSeed);
      assert.equal(
        queryLog.some((entry) => /^UPDATE profile_bindings\b/i.test(entry.sql)),
        false,
      );
    } finally {
      await store.close();
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
    assert.equal(harness.assertIdle(), true);
  });

  await t.test("duplicate receipt", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-market-duplicate-"));
    const authority = marketAuthority();
    const operationId = "op_market_duplicate_x";
    const loaderSeed = sqlSeed({authority});
    const duplicateReceipt = {
      schemaVersion: 1,
      operationId,
      requestHash: "d".repeat(64),
      actionId: "POST /market/cancel",
      accountId: ACTORS.a.accountId,
      committedAt: UPDATED_AT_1,
      expiresAt: "2026-07-17T02:10:00.000Z",
      response: {ok: true, operationId},
    };
    const databaseSeed = sqlSeed({
      authority,
      mutationReceipts: {
        [operationId]: {
          operation_id: operationId,
          request_hash: duplicateReceipt.requestHash,
          action_id: duplicateReceipt.actionId,
          account_id: duplicateReceipt.accountId,
          committed_at: duplicateReceipt.committedAt,
          expires_at: duplicateReceipt.expiresAt,
          document_json: duplicateReceipt,
        },
      },
    });
    const queryLog = [];
    const loader = createSharedLoader(tempDir, loaderSeed);
    const harness = createSharedMysqlTransactionHarness({
      seed: databaseSeed,
      statementHandler: createProductionSqlHandler(queryLog),
    });
    const store = createProductionStore(loader.fakeMysqlPath, harness.poolFor("market_duplicate"));
    try {
      const loaded = store.load();
      const staged = stagedMarketCancel(store, loaded, "a", {
        operationId,
        requestHash: "e".repeat(64),
        updatedAt: UPDATED_AT_2,
      });
      await assert.rejects(staged.promise, isResourceConflict);
      assert.deepEqual(harness.snapshot(), databaseSeed);
      assert.equal(
        harness.events().some((event) => (
          event.type === "write_staged"
          && event.writerId === "market_duplicate"
          && event.table === "market_listings"
        )),
        true,
      );
    } finally {
      await store.close();
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
    assert.equal(harness.assertIdle(), true);
  });
});

test("ordinary market cancel and legacy global writes reject stale snapshots in both orders", async (t) => {
  await t.test("market cancel first rejects stale legacy before business SQL", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-market-first-legacy-"));
    const authority = marketAuthority();
    const seed = sqlSeed({authority});
    const queryLog = [];
    const loader = createSharedLoader(tempDir, seed);
    const harness = createSharedMysqlTransactionHarness({
      seed,
      statementHandler: createProductionSqlHandler(queryLog),
      onCommittedSnapshot(snapshot) {
        loader.writeSnapshot(snapshot);
      },
    });
    const marketStore = createProductionStore(loader.fakeMysqlPath, harness.poolFor("market_first"));
    const legacyStore = createProductionStore(loader.fakeMysqlPath, harness.poolFor("legacy_after_market"));
    try {
      const marketLoaded = marketStore.load();
      const staleLegacy = legacyStore.load();
      await stagedMarketCancel(marketStore, marketLoaded, "a", {
        operationId: "op_market_before_legacy_x",
        requestHash: "f".repeat(64),
        updatedAt: UPDATED_AT_2,
      }).promise;
      await assert.rejects(
        legacyStore.saveAsync(legacyMarketAuthority(staleLegacy)),
        isResourceConflict,
      );
      const committed = harness.snapshot();
      assert.equal(Object.hasOwn(committed.market_listings, MARKET_LISTING_IDS.a), false);
      assert.equal(committed.server_state.auth.document_json.marketConfig.taxRate, 0.05);
      assert.equal(
        queryLog.filter((entry) => entry.writerId === "legacy_after_market")
          .some((entry) => /^INSERT INTO server_state\b/i.test(entry.sql)),
        false,
      );
    } finally {
      await Promise.allSettled([marketStore.close(), legacyStore.close()]);
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
    assert.equal(harness.assertIdle(), true);
  });

  await t.test("legacy first rejects waiting market cancel at the global barrier", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-legacy-first-market-"));
    const authority = marketAuthority();
    const seed = sqlSeed({authority});
    const queryLog = [];
    const loader = createSharedLoader(tempDir, seed);
    const harness = createSharedMysqlTransactionHarness({
      seed,
      statementHandler: createProductionSqlHandler(queryLog),
      onCommittedSnapshot(snapshot) {
        loader.writeSnapshot(snapshot);
      },
    });
    const legacyStore = createProductionStore(loader.fakeMysqlPath, harness.poolFor("legacy_first_market"));
    const marketStore = createProductionStore(loader.fakeMysqlPath, harness.poolFor("market_after_legacy"));
    const legacyGate = harness.blockNext({writerId: "legacy_first_market", phase: "before_commit_apply"});
    void legacyGate.entered.catch(() => {});
    let settled = null;
    try {
      const legacyLoaded = legacyStore.load();
      const marketLoaded = marketStore.load();
      const legacySave = legacyStore.saveAsync(legacyMarketAuthority(legacyLoaded));
      await legacyGate.entered;
      const marketSave = stagedMarketCancel(marketStore, marketLoaded, "a", {
        operationId: "op_market_after_legacy_x",
        requestHash: "0".repeat(64),
        updatedAt: UPDATED_AT_2,
      }).promise;
      settled = Promise.allSettled([legacySave, marketSave]);
      await harness.waitForEvent({
        type: "lock_wait",
        writerId: "market_after_legacy",
        table: "auth_store_revisions",
        key: "auth",
      });
      legacyGate.release();
      const [legacyResult, marketResult] = await settled;
      assert.equal(legacyResult.status, "fulfilled");
      assert.equal(marketResult.status, "rejected");
      assert.equal(isGlobalConflict(marketResult.reason), true);
      const committed = harness.snapshot();
      assert.equal(committed.auth_store_revisions.auth.revision, 1);
      assert.equal(Object.hasOwn(committed.market_listings, MARKET_LISTING_IDS.a), true);
      assert.equal(
        queryLog.filter((entry) => entry.writerId === "market_after_legacy").length,
        1,
      );
    } finally {
      legacyGate.release();
      if (settled !== null) {
        await settled;
      }
      await Promise.allSettled([legacyStore.close(), marketStore.close()]);
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
    assert.equal(harness.assertIdle(), true);
  });
});

test("market buy first lets the waiting seller claim commit after the shared seller lock", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-buy-before-claim-"));
  const authority = marketClaimAuthority();
  const seed = sqlSeed({authority});
  const queryLog = [];
  const loader = createSharedLoader(tempDir, seed);
  const harness = createSharedMysqlTransactionHarness({
    seed,
    statementHandler: createProductionSqlHandler(queryLog),
    onCommittedSnapshot(snapshot) {
      loader.writeSnapshot(snapshot);
    },
  });
  const buyStore = createProductionStore(loader.fakeMysqlPath, harness.poolFor("buy_before_claim"));
  const claimStore = createProductionStore(loader.fakeMysqlPath, harness.poolFor("seller_claim_after_buy"));
  const buyGate = harness.blockNext({writerId: "buy_before_claim", phase: "before_commit_apply"});
  void buyGate.entered.catch(() => {});
  let settled = null;

  try {
    const buyBefore = buyStore.load();
    const claimBefore = claimStore.load();
    const buy = stagedMarketBuy(buyStore, buyBefore, {
      operationId: "op_buy_before_seller_claim_0001",
      requestHash: "6".repeat(64),
    });
    await buyGate.entered;
    const claim = stagedMailClaim(claimStore, claimBefore, "b", {
      operationId: "op_seller_claim_after_buy_0001",
      requestHash: "7".repeat(64),
      updatedAt: UPDATED_AT_3,
    });
    settled = Promise.allSettled([buy.promise, claim.promise]);
    await harness.waitForEvent({
      type: "lock_wait",
      writerId: "seller_claim_after_buy",
      table: "profile_bindings",
      key: ACTORS.b.accountId,
    });
    buyGate.release();

    const [buyResult, claimResult] = await settled;
    assert.equal(buyResult.status, "fulfilled");
    assert.equal(claimResult.status, "fulfilled");
    const committed = harness.snapshot();
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_revision, 2);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_json.stoneCoins, 70);
    assert.equal(committed.profiles[ACTORS.b.playerId].profile_revision, 2);
    assert.equal(committed.profiles[ACTORS.b.playerId].profile_json.stoneCoins, 201);
    assert.equal(Object.hasOwn(committed.market_listings, MARKET_LISTING_IDS.b), false);
    assert.equal(Object.hasOwn(committed.mail_messages, MAIL_IDS.b), false);
    assert.deepEqual(committed.mail_messages[MAIL_IDS.sale].document_json.currency, {stoneCoins: 30});
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_buy_before_seller_claim_0001"), true);
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_seller_claim_after_buy_0001"), true);
  } finally {
    buyGate.release();
    if (settled !== null) {
      await settled;
    }
    await Promise.allSettled([buyStore.close(), claimStore.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("seller claim first rejects a stale buy before writes and the same operation retries after reload", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-claim-before-buy-"));
  const authority = marketClaimAuthority();
  const seed = sqlSeed({authority});
  const queryLog = [];
  const loader = createSharedLoader(tempDir, seed);
  const harness = createSharedMysqlTransactionHarness({
    seed,
    statementHandler: createProductionSqlHandler(queryLog),
    onCommittedSnapshot(snapshot) {
      loader.writeSnapshot(snapshot);
    },
  });
  const claimStore = createProductionStore(loader.fakeMysqlPath, harness.poolFor("claim_before_buy"));
  const buyStore = createProductionStore(loader.fakeMysqlPath, harness.poolFor("stale_buy_after_claim"));
  const claimGate = harness.blockNext({writerId: "claim_before_buy", phase: "before_commit_apply"});
  void claimGate.entered.catch(() => {});
  let settled = null;

  try {
    const claimBefore = claimStore.load();
    const buyBefore = buyStore.load();
    const claim = stagedMailClaim(claimStore, claimBefore, "b", {
      operationId: "op_claim_before_market_buy_0001",
      requestHash: "8".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await claimGate.entered;
    const staleBuy = stagedMarketBuy(buyStore, buyBefore, {
      operationId: "op_stale_buy_after_claim_0001",
      requestHash: "9".repeat(64),
      updatedAt: UPDATED_AT_3,
    });
    settled = Promise.allSettled([claim.promise, staleBuy.promise]);
    await harness.waitForEvent({
      type: "lock_wait",
      writerId: "stale_buy_after_claim",
      table: "profile_bindings",
      key: ACTORS.b.accountId,
    });
    claimGate.release();

    const [claimResult, staleBuyResult] = await settled;
    assert.equal(claimResult.status, "fulfilled");
    assert.equal(staleBuyResult.status, "rejected");
    assert.equal(isResourceConflict(staleBuyResult.reason), true);
    assert.equal(
      queryLog.filter((entry) => entry.writerId === "stale_buy_after_claim")
        .some((entry) => /^(UPDATE|DELETE|INSERT)\b/i.test(entry.sql)),
      false,
      "stale buy must fail while validating seller locks before any business write",
    );
    const afterClaim = harness.snapshot();
    assert.equal(afterClaim.profiles[ACTORS.a.playerId].profile_revision, 1);
    assert.equal(afterClaim.profiles[ACTORS.a.playerId].profile_json.stoneCoins, 100);
    assert.equal(afterClaim.profiles[ACTORS.b.playerId].profile_revision, 2);
    assert.equal(Object.hasOwn(afterClaim.market_listings, MARKET_LISTING_IDS.b), true);
    assert.equal(Object.hasOwn(afterClaim.mail_messages, MAIL_IDS.sale), false);
    assert.equal(Object.hasOwn(afterClaim.mutation_receipts, "op_stale_buy_after_claim_0001"), false);

    const reloaded = buyStore.load();
    const retry = stagedMarketBuy(buyStore, reloaded, {
      operationId: "op_stale_buy_after_claim_0001",
      requestHash: "9".repeat(64),
      updatedAt: UPDATED_AT_4,
    });
    await retry.promise;
    const committed = harness.snapshot();
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_revision, 2);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_json.stoneCoins, 70);
    assert.equal(Object.hasOwn(committed.market_listings, MARKET_LISTING_IDS.b), false);
    assert.deepEqual(committed.mail_messages[MAIL_IDS.sale].document_json.currency, {stoneCoins: 30});
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_stale_buy_after_claim_0001"), true);
  } finally {
    claimGate.release();
    if (settled !== null) {
      await settled;
    }
    await Promise.allSettled([claimStore.close(), buyStore.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("a DB-only sale mail id collision rolls preceding market writes back", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-sale-mail-duplicate-"));
  const authority = marketClaimAuthority();
  const loaderSeed = sqlSeed({authority});
  const databaseSeed = structuredClone(loaderSeed);
  const listing = authority.marketListings[MARKET_LISTING_IDS.b];
  const existingMail = marketSaleMail(listing);
  databaseSeed.mail_messages[MAIL_IDS.sale] = {
    mail_id: MAIL_IDS.sale,
    sender_account_id: existingMail.senderAccountId,
    recipient_account_id: existingMail.recipientAccountId,
    title: existingMail.title,
    created_at: existingMail.createdAt,
    read_at: existingMail.readAt,
    document_json: existingMail,
  };
  const queryLog = [];
  const loader = createSharedLoader(tempDir, loaderSeed);
  const harness = createSharedMysqlTransactionHarness({
    seed: databaseSeed,
    statementHandler: createProductionSqlHandler(queryLog),
  });
  const store = createProductionStore(loader.fakeMysqlPath, harness.poolFor("sale_mail_duplicate"));

  try {
    const loaded = store.load();
    const staged = stagedMarketBuy(store, loaded, {
      operationId: "op_sale_mail_duplicate_0001",
      requestHash: "a".repeat(64),
    });
    await assert.rejects(staged.promise, isResourceConflict);
    assert.deepEqual(harness.snapshot(), databaseSeed);
    const stagedWrites = harness.events()
      .filter((event) => event.type === "write_staged" && event.writerId === "sale_mail_duplicate")
      .map((event) => `${event.table}/${event.key}`);
    assert.deepEqual(stagedWrites, [
      `profile_bindings/${ACTORS.a.accountId}`,
      `profiles/${ACTORS.a.playerId}`,
      `market_listings/${MARKET_LISTING_IDS.b}`,
    ]);
    assert.equal(Object.hasOwn(harness.snapshot().mutation_receipts, "op_sale_mail_duplicate_0001"), false);
  } finally {
    await Promise.allSettled([store.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("different mail claims overlap and retain both profile and mail settlements", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-mail-different-"));
  const authority = mailClaimAuthority();
  const seed = sqlSeed({authority});
  const queryLog = [];
  const loader = createSharedLoader(tempDir, seed);
  const harness = createSharedMysqlTransactionHarness({
    seed,
    statementHandler: createProductionSqlHandler(queryLog),
    onCommittedSnapshot(snapshot) {
      loader.writeSnapshot(snapshot);
    },
  });
  const storeA = createProductionStore(loader.fakeMysqlPath, harness.poolFor("mail_a"));
  const storeB = createProductionStore(loader.fakeMysqlPath, harness.poolFor("mail_b"));
  const gateA = harness.blockNext({writerId: "mail_a", phase: "before_commit_apply"});
  void gateA.entered.catch(() => {});
  let saveA = null;

  try {
    const loadedA = storeA.load();
    const loadedB = storeB.load();
    const first = stagedMailClaim(storeA, loadedA, "a", {
      operationId: "op_mail_parallel_a_0001",
      requestHash: "1".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    saveA = first.promise;
    await gateA.entered;

    const second = stagedMailClaim(storeB, loadedB, "b", {
      remainingItems: [{itemId: "item_meat_small", count: 1}],
      operationId: "op_mail_parallel_b_0001",
      requestHash: "2".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await harness.waitForEvent({type: "commit_completed", writerId: "mail_b"});
    await second.promise;

    const whileABlocked = harness.snapshot();
    assert.equal(Object.hasOwn(whileABlocked.mail_messages, MAIL_IDS.a), true);
    assert.deepEqual(
      whileABlocked.mail_messages[MAIL_IDS.b].document_json.items,
      [{itemId: "item_meat_small", count: 1}],
    );
    assert.equal(whileABlocked.profiles[ACTORS.a.playerId].profile_revision, 1);
    assert.equal(whileABlocked.profiles[ACTORS.b.playerId].profile_revision, 2);
    assert.equal(
      harness.events().some((event) => (
        event.type === "lock_wait"
        && event.writerId === "mail_b"
      )),
      false,
      "different account and mail rows must not serialize behind each other",
    );

    gateA.release();
    await saveA;
    saveA = null;

    const committed = harness.snapshot();
    assert.equal(committed.auth_store_revisions.auth.revision, 0);
    assert.equal(Object.hasOwn(committed.mail_messages, MAIL_IDS.a), false);
    assert.deepEqual(
      committed.mail_messages[MAIL_IDS.b].document_json.items,
      [{itemId: "item_meat_small", count: 1}],
    );
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_revision, 2);
    assert.equal(committed.profiles[ACTORS.b.playerId].profile_revision, 2);
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_mail_parallel_a_0001"), true);
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_mail_parallel_b_0001"), true);

    for (const writerId of ["mail_a", "mail_b"]) {
      const queries = queryLog.filter((entry) => entry.writerId === writerId);
      const bindingLock = queries.findIndex((entry) => /profile_bindings.+FOR UPDATE$/i.test(entry.sql));
      const profileLock = queries.findIndex((entry) => /FROM profiles.+FOR UPDATE$/i.test(entry.sql));
      const mailLock = queries.findIndex((entry) => /FROM mail_messages.+FOR UPDATE$/i.test(entry.sql));
      const firstWrite = queries.findIndex((entry) => /^UPDATE profile_bindings\b/i.test(entry.sql));
      assert.ok(bindingLock >= 0 && bindingLock < profileLock);
      assert.ok(profileLock < mailLock && mailLock < firstWrite);
    }
  } finally {
    gateA.release();
    if (saveA !== null) {
      await Promise.allSettled([saveA]);
    }
    await Promise.allSettled([storeA.close(), storeB.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("the same mail can be claimed by exactly one conditional writer", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-mail-same-"));
  const authority = mailClaimAuthority();
  const seed = sqlSeed({authority});
  const queryLog = [];
  const loader = createSharedLoader(tempDir, seed);
  const harness = createSharedMysqlTransactionHarness({
    seed,
    statementHandler: createProductionSqlHandler(queryLog),
    onCommittedSnapshot(snapshot) {
      loader.writeSnapshot(snapshot);
    },
  });
  const storeA = createProductionStore(loader.fakeMysqlPath, harness.poolFor("mail_same_a"));
  const storeB = createProductionStore(loader.fakeMysqlPath, harness.poolFor("mail_same_b"));
  const gateA = harness.blockNext({writerId: "mail_same_a", phase: "before_commit_apply"});
  void gateA.entered.catch(() => {});
  let settled = null;

  try {
    const loadedA = storeA.load();
    const loadedB = storeB.load();
    const first = stagedMailClaim(storeA, loadedA, "a", {
      operationId: "op_mail_same_a_0001",
      requestHash: "3".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await gateA.entered;
    const second = stagedMailClaim(storeB, loadedB, "a", {
      operationId: "op_mail_same_b_0001",
      requestHash: "4".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    settled = Promise.allSettled([first.promise, second.promise]);
    await harness.waitForEvent({
      type: "lock_wait",
      writerId: "mail_same_b",
      table: "profile_bindings",
      key: ACTORS.a.accountId,
    });
    gateA.release();

    const [winner, loser] = await settled;
    assert.equal(winner.status, "fulfilled");
    assert.equal(loser.status, "rejected");
    assert.equal(isResourceConflict(loser.reason), true);
    const committed = harness.snapshot();
    assert.equal(Object.hasOwn(committed.mail_messages, MAIL_IDS.a), false);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_revision, 2);
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_mail_same_a_0001"), true);
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_mail_same_b_0001"), false);
    assert.equal(
      queryLog.filter((entry) => entry.writerId === "mail_same_b")
        .some((entry) => /^DELETE FROM mail_messages\b/i.test(entry.sql)),
      false,
      "the stale loser must fail before deleting or acknowledging the mail",
    );
  } finally {
    gateA.release();
    if (settled !== null) {
      await settled;
    }
    await Promise.allSettled([storeA.close(), storeB.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("a duplicate equipment tombstone rolls preceding profile and mail writes back", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-mail-tombstone-"));
  const authority = mailClaimAuthority({equipmentActorKey: "a"});
  const loaderSeed = sqlSeed({authority});
  const databaseSeed = structuredClone(loaderSeed);
  databaseSeed.consumed_equipment_envelopes[MAIL_ENVELOPE_ID] = {
    envelope_id: MAIL_ENVELOPE_ID,
  };
  const queryLog = [];
  const loader = createSharedLoader(tempDir, loaderSeed);
  const harness = createSharedMysqlTransactionHarness({
    seed: databaseSeed,
    statementHandler: createProductionSqlHandler(queryLog),
  });
  const store = createProductionStore(loader.fakeMysqlPath, harness.poolFor("mail_duplicate_envelope"));

  try {
    const loaded = store.load();
    const staged = stagedMailClaim(store, loaded, "a", {
      itemId: "weapon_wooden_club",
      claimedEnvelopeIds: [MAIL_ENVELOPE_ID],
      operationId: "op_mail_duplicate_envelope_0001",
      requestHash: "5".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await assert.rejects(staged.promise, isResourceConflict);
    assert.deepEqual(harness.snapshot(), databaseSeed);

    const stagedWrites = harness.events()
      .filter((event) => event.type === "write_staged" && event.writerId === "mail_duplicate_envelope")
      .map((event) => `${event.table}/${event.key}`);
    assert.deepEqual(stagedWrites, [
      `profile_bindings/${ACTORS.a.accountId}`,
      `profiles/${ACTORS.a.playerId}`,
      `mail_messages/${MAIL_IDS.a}`,
    ]);
    assert.equal(
      harness.events().some((event) => (
        event.type === "rollback_applied"
        && event.writerId === "mail_duplicate_envelope"
      )),
      true,
    );
    const tombstoneInsert = queryLog.find((entry) => (
      entry.writerId === "mail_duplicate_envelope"
      && /^INSERT INTO consumed_equipment_envelopes\b/i.test(entry.sql)
    ));
    assert.ok(tombstoneInsert);
    assert.doesNotMatch(tombstoneInsert.sql, /ON DUPLICATE KEY/i);
    assert.equal(
      queryLog.some((entry) => (
        entry.writerId === "mail_duplicate_envelope"
        && /^INSERT INTO mutation_receipts\b/i.test(entry.sql)
      )),
      false,
      "the duplicate tombstone must fail before a durable success receipt is inserted",
    );
  } finally {
    await store.close();
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});
