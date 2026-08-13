"use strict";

const {isDeepStrictEqual} = require("node:util");

const {
  assert,
  battleProfile,
  createAsyncWriteAuthStore,
  createAuthService,
  createHttpServer,
  createMemoryAuthStore,
  fetchJson,
  once,
  profileItemCount,
  test,
} = require("../test-support/auth-service-test-context");
const {
  createRewardVaultEntry,
} = require("../src/auth/reward-vault-state");
const {
  compareRewardVaultEntries,
  encodeRewardVaultCursor,
} = require("../src/auth/reward-vault-pagination");

function certifyOrdinaryAttachment(value) {
  const items = structuredClone(value.items || []);
  return {
    ok: true,
    items,
    ordinaryItems: structuredClone(items),
    equipmentItems: [],
    equipmentEnvelopes: [],
    currency: structuredClone(value.currency || {}),
  };
}

function createVaultBackedStore(initialData, initialRewards = []) {
  const authority = createMemoryAuthStore(initialData);
  let rewards = new Map(initialRewards.map((entry) => [
    String(entry.rewardId),
    structuredClone(entry),
  ]));
  const saveOptions = [];
  const rawStore = {
    mode: "reward-vault-fixture",
    load: () => authority.load(),
    rewardVaultEnabled: () => true,
    async readRewardVaultEntry(accountId, rewardId) {
      const entry = rewards.get(String(rewardId || ""));
      return entry && entry.recipientAccountId === String(accountId || "")
        ? structuredClone(entry)
        : null;
    },
    async readRewardVaultPage(accountId, options = {}) {
      const recipientAccountId = String(accountId || "");
      const ordered = Array.from(rewards.values())
        .filter((entry) => entry.recipientAccountId === recipientAccountId)
        .sort(compareRewardVaultEntries)
        .filter((entry) => (
          options.cursor === null
          || options.cursor === undefined
          || compareRewardVaultEntries(entry, options.cursor) > 0
        ));
      const rewardRows = ordered.slice(0, options.limit);
      const hasMore = ordered.length > rewardRows.length;
      const nextCursor = hasMore && rewardRows.length > 0
        ? encodeRewardVaultCursor(rewardRows[rewardRows.length - 1])
        : null;
      return {
        recipientAccountId,
        rewardRows: structuredClone(rewardRows),
        nextCursor,
        hasMore,
      };
    },
    async saveAsyncOwned(nextData, options = {}) {
      const nextRewards = new Map(Array.from(rewards, ([rewardId, entry]) => [
        rewardId,
        structuredClone(entry),
      ]));
      for (const entry of options.rewardVaultIssues || []) {
        if (nextRewards.has(entry.rewardId)) {
          const error = new Error("duplicate reward vault identity");
          error.code = "ER_DUP_ENTRY";
          throw error;
        }
        nextRewards.set(entry.rewardId, structuredClone(entry));
      }
      if (options.rewardVaultClaim) {
        const {beforeEntry, nextEntry} = options.rewardVaultClaim;
        const current = nextRewards.get(String(beforeEntry && beforeEntry.rewardId || ""));
        if (!current || !isDeepStrictEqual(current, beforeEntry)) {
          const error = new Error("reward vault claim pre-image drifted");
          error.code = "mysql_reward_vault_claim_conflict";
          throw error;
        }
        nextRewards.set(nextEntry.rewardId, structuredClone(nextEntry));
      }
      authority.save(nextData);
      rewards = nextRewards;
      saveOptions.push(structuredClone(options));
      return {committed: true};
    },
  };
  const store = createAsyncWriteAuthStore(rawStore, {onError() {}});
  return {
    store,
    rewardRows() {
      return Array.from(rewards.values()).map((entry) => structuredClone(entry));
    },
    saveOptions,
  };
}

function operation(operationId, hashByte, actionId) {
  return {
    operationId,
    requestHash: String(hashByte).repeat(64),
    actionId,
  };
}

function seedProfile(service, token, mutate) {
  const current = service.getProfile(token);
  assert.equal(current.ok, true, JSON.stringify(current));
  const profile = structuredClone(current.profile);
  mutate(profile);
  const saved = service.saveProfile(token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile,
  });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  return saved.profile;
}

function oneHitEncounterPayload(groupId) {
  return {
    enemyCount: 1,
    encounterZone: {
      id: `${groupId}_zone`,
      name: "奖励仓测试区",
      encounterGroupId: groupId,
      selectedWildPet: {
        formId: "wuli_normal_orange_fire10",
        name: "奖励仓测试乌力",
        level: 1,
        catchable: false,
        battleStats: {maxHp: 1, attack: 1, defense: 1, quick: 1},
      },
    },
  };
}

async function winOneHitBattle(service, account, groupId, operationId, hashByte) {
  const encounter = await service.invokeDurable(
    "startPartyEncounter",
    [account.session.token, oneHitEncounterPayload(groupId)],
  );
  assert.equal(encounter.ok, true, JSON.stringify(encounter));
  const actor = encounter.room.battle.actors.find((entry) => (
    entry.accountId === account.account.accountId && entry.kind === "player"
  ));
  const enemy = encounter.room.battle.actors.find((entry) => entry.side === "enemy");
  assert.ok(actor);
  assert.ok(enemy);
  const result = await service.invokeDurable(
    "submitBattleCommand",
    [account.session.token, encounter.room.roomId, {
      round: 1,
      actorId: actor.actorId,
      actionId: "attack",
      targetActorId: enemy.actorId,
    }],
    operation(operationId, hashByte, "POST /battle/rooms/:roomId/commands"),
  );
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.room.status, "closed");
  return result;
}

test("vault-backed market sales settle atomically, replay claims once, and skip empty zero-proceeds rewards", async () => {
  const seed = createAuthService({store: createMemoryAuthStore()});
  const seller = seed.register({username: "vaultmarketseller", password: "test1234", displayName: "奖励仓卖家"});
  const buyer = seed.register({username: "vaultmarketbuyer", password: "test1234", displayName: "奖励仓买家"});
  seedProfile(seed, seller.session.token, (profile) => {
    profile.backpackSlots = [{itemId: "item_meat_small", count: 3}];
  });
  const listing = seed.createMarketListing(seller.session.token, {
    itemId: "item_meat_small",
    count: 2,
    unitPrice: 20,
    currency: "stoneCoins",
  });
  assert.equal(listing.ok, true, JSON.stringify(listing));

  const fixture = createVaultBackedStore(seed.snapshot());
  const service = createAuthService({store: fixture.store});
  const sellerBefore = service.getProfile(seller.session.token).profile.stoneCoins;
  const bought = await service.invokeDurable(
    "buyMarketListing",
    [buyer.session.token, {listingId: listing.listing.listingId}],
    operation("vault_market_buy_operation_0001", "a", "POST /market/buy"),
  );
  assert.equal(bought.ok, true, JSON.stringify(bought));
  assert.equal(bought.saleMail, null);
  assert.equal(bought.saleReward.sourceKind, "market_sale");
  assert.deepEqual(bought.saleReward.currency, {stoneCoins: 39});
  assert.equal(service.getProfile(seller.session.token).profile.stoneCoins, sellerBefore);
  assert.equal(fixture.rewardRows().length, 1);
  assert.equal(fixture.saveOptions.at(-1).rewardVaultIssues.length, 1);

  const claimed = await service.invokeDurable(
    "claimRewardVault",
    [seller.session.token, bought.saleReward.rewardId],
    operation("vault_market_claim_operation_0001", "b", "POST /rewards/vault/:rewardId/claim"),
  );
  assert.equal(claimed.ok, true, JSON.stringify(claimed));
  assert.equal(claimed.reward.status, "claimed");
  assert.equal(claimed.profile.stoneCoins, sellerBefore + 39);
  const replayed = await service.invokeDurable(
    "claimRewardVault",
    [seller.session.token, bought.saleReward.rewardId],
    operation("vault_market_claim_operation_0001", "b", "POST /rewards/vault/:rewardId/claim"),
  );
  assert.equal(replayed.ok, true, JSON.stringify(replayed));
  assert.equal(replayed.durableCommit.replayed, true);
  assert.equal(service.getProfile(seller.session.token).profile.stoneCoins, sellerBefore + 39);
  assert.equal(fixture.rewardRows()[0].status, "claimed");

  const zeroSeed = createAuthService({store: createMemoryAuthStore()});
  const zeroSeller = zeroSeed.register({username: "vaultzeroseller", password: "test1234", displayName: "零收益卖家"});
  const zeroBuyer = zeroSeed.register({username: "vaultzerobuyer", password: "test1234", displayName: "零收益买家"});
  seedProfile(zeroSeed, zeroSeller.session.token, (profile) => {
    profile.backpackSlots = [{itemId: "item_meat_small", count: 1}];
  });
  const zeroListing = zeroSeed.createMarketListing(zeroSeller.session.token, {
    itemId: "item_meat_small",
    count: 1,
    unitPrice: 1,
    currency: "stoneCoins",
  });
  assert.equal(zeroListing.listing.sellerReceives, 0);
  const zeroFixture = createVaultBackedStore(zeroSeed.snapshot());
  const zeroService = createAuthService({store: zeroFixture.store});
  const zeroResult = await zeroService.invokeDurable(
    "buyMarketListing",
    [zeroBuyer.session.token, {listingId: zeroListing.listing.listingId}],
    operation("vault_zero_buy_operation_0001", "c", "POST /market/buy"),
  );
  assert.equal(zeroResult.ok, true, JSON.stringify(zeroResult));
  assert.equal(zeroResult.receipt.tax, 1);
  assert.equal(zeroResult.receipt.sellerReceives, 0);
  assert.equal(zeroResult.saleMail, null);
  assert.equal(zeroResult.saleReward, null);
  assert.equal(zeroFixture.rewardRows().length, 0);
  assert.equal(Object.hasOwn(zeroFixture.saveOptions.at(-1), "rewardVaultIssues"), false);
});

test("tutorial sale reward claim preserves the original quest handoff and idempotent payout", async () => {
  const seed = createAuthService({store: createMemoryAuthStore()});
  const player = seed.register({username: "vaulttutorial", password: "test1234", displayName: "奖励仓学员"});
  seedProfile(seed, player.session.token, (profile) => {
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
  });
  const fixture = createVaultBackedStore(seed.snapshot());
  const service = createAuthService({store: fixture.store});
  const sold = await service.invokeDurable(
    "createMarketListing",
    [player.session.token, {
      itemId: "tutorial_worn_hide",
      count: 1,
      unitPrice: 7,
      currency: "stoneCoins",
    }],
    operation("vault_tutorial_sale_operation_0001", "d", "POST /market/list"),
  );
  assert.equal(sold.ok, true, JSON.stringify(sold));
  assert.equal(sold.saleMail, null);
  assert.equal(sold.saleReward.sourceKind, "tutorial_market_sale");
  assert.deepEqual(sold.saleReward.currency, {stoneCoins: 7});
  assert.equal(sold.profile.activeQuestId, "quest_claim_market_mail");
  assert.equal(fixture.rewardRows()[0].status, "available");

  const claimed = await service.invokeDurable(
    "claimRewardVault",
    [player.session.token, sold.saleReward.rewardId],
    operation("vault_tutorial_claim_operation_0001", "e", "POST /rewards/vault/:rewardId/claim"),
  );
  assert.equal(claimed.ok, true, JSON.stringify(claimed));
  assert.equal(claimed.profile.activeQuestId, "quest_market_buy_player");
  assert.equal(claimed.profile.stoneCoins, 27);
  assert.equal(claimed.questMessages.length >= 1, true);
  const replayed = await service.invokeDurable(
    "claimRewardVault",
    [player.session.token, sold.saleReward.rewardId],
    operation("vault_tutorial_claim_operation_0001", "e", "POST /rewards/vault/:rewardId/claim"),
  );
  assert.equal(replayed.ok, true);
  assert.equal(replayed.durableCommit.replayed, true);
  assert.equal(service.getProfile(player.session.token).profile.stoneCoins, 27);
  assert.equal(service.getProfile(player.session.token).profile.activeQuestId, "quest_market_buy_player");
});

test("ordinary overflow and qualification rewards use distinct vault sources without losing direct battle state", async () => {
  const overflowSeed = createAuthService({store: createMemoryAuthStore()});
  const overflowPlayer = overflowSeed.register({
    username: "vaultbattleoverflow",
    password: "test1234",
    displayName: "战斗溢出号",
  });
  seedProfile(overflowSeed, overflowPlayer.session.token, (profile) => {
    Object.assign(profile, battleProfile("战斗溢出号", {
      level: 80,
      hp: 520,
      maxHp: 520,
      attack: 999,
      defense: 45,
      quick: 120,
      comboRateOverride: 0,
    }, null));
    profile.stoneCoins = 11;
    profile.backpackSlots = Array.from({length: 15}, () => ({
      itemId: "item_meat_small",
      count: 99,
    }));
  });
  const overflowFixture = createVaultBackedStore(overflowSeed.snapshot());
  const overflowService = createAuthService({
    store: overflowFixture.store,
    battleVictoryRewardResolver: () => ({
      tableId: "vault_overflow_table",
      rewardRole: "repeatable_battle",
      repeatable: true,
      sourceZoneId: "vault_overflow_zone",
      sourceEncounterGroupId: "vault_overflow_group",
      stoneCoins: 77,
      items: [{itemId: "capture_rope_basic", count: 1}],
    }),
  });
  const overflowResult = await winOneHitBattle(
    overflowService,
    overflowPlayer,
    "vault_overflow_group",
    "vault_battle_overflow_operation_0001",
    "f",
  );
  const overflowWriteback = overflowResult.room.battle.profileWriteback.profiles.find((entry) => (
    entry.accountId === overflowPlayer.account.accountId
  ));
  assert.equal(overflowWriteback.rewards.vaultReward.sourceKind, "battle_overflow");
  assert.deepEqual(overflowWriteback.rewards.vaultedItems, [{itemId: "capture_rope_basic", count: 1}]);
  assert.equal(overflowService.getProfile(overflowPlayer.session.token).profile.stoneCoins, 88);
  assert.equal(profileItemCount(
    overflowService.getProfile(overflowPlayer.session.token).profile,
    "capture_rope_basic",
  ), 0);
  assert.deepEqual(overflowFixture.rewardRows()[0].document.currency, {});
  assert.deepEqual(overflowFixture.rewardRows()[0].document.items, [{itemId: "capture_rope_basic", count: 1}]);

  const fullClaim = await overflowService.invokeDurable(
    "claimRewardVault",
    [overflowPlayer.session.token, overflowFixture.rewardRows()[0].rewardId],
    operation("vault_full_bag_claim_operation_0001", "1", "POST /rewards/vault/:rewardId/claim"),
  );
  assert.equal(fullClaim.ok, false);
  assert.equal(fullClaim.code, "reward_vault_backpack_full");
  assert.equal(overflowFixture.rewardRows()[0].status, "available");

  const qualificationSeed = createAuthService({store: createMemoryAuthStore()});
  const qualificationPlayer = qualificationSeed.register({
    username: "vaultqualification",
    password: "test1234",
    displayName: "资格奖励号",
  });
  seedProfile(qualificationSeed, qualificationPlayer.session.token, (profile) => {
    Object.assign(profile, battleProfile("资格奖励号", {
      level: 80,
      hp: 520,
      maxHp: 520,
      attack: 999,
      defense: 45,
      quick: 120,
      comboRateOverride: 0,
    }, null));
    profile.stoneCoins = 13;
    profile.backpackSlots = Array.from({length: 15}, () => ({}));
  });
  const qualificationFixture = createVaultBackedStore(qualificationSeed.snapshot());
  const qualificationService = createAuthService({
    store: qualificationFixture.store,
    battleVictoryRewardResolver: () => ({
      tableId: "vault_qualification_table",
      rewardRole: "qualification_battle",
      repeatable: false,
      sourceZoneId: "vault_qualification_zone",
      sourceEncounterGroupId: "vault_qualification_group",
      stoneCoins: 200,
      items: [{itemId: "ring_earth_trial", count: 1}],
    }),
  });
  const qualificationResult = await winOneHitBattle(
    qualificationService,
    qualificationPlayer,
    "vault_qualification_group",
    "vault_qualification_operation_0001",
    "2",
  );
  const qualificationWriteback = qualificationResult.room.battle.profileWriteback.profiles.find((entry) => (
    entry.accountId === qualificationPlayer.account.accountId
  ));
  assert.equal(qualificationWriteback.rewards.vaultReward.sourceKind, "qualification_reward");
  assert.equal(qualificationWriteback.rewards.vaultedStoneCoins, 200);
  assert.deepEqual(qualificationWriteback.rewards.vaultedItems, [{itemId: "ring_earth_trial", count: 1}]);
  const qualificationProfile = qualificationService.getProfile(qualificationPlayer.session.token).profile;
  assert.equal(qualificationProfile.stoneCoins, 13);
  assert.equal(profileItemCount(qualificationProfile, "ring_earth_trial"), 0);
  assert.deepEqual(qualificationProfile.qualificationBattleClaims.vault_qualification_group, {
    rebirthCycle: 0,
    claimed: true,
    schemaVersion: 1,
  });
  assert.deepEqual(qualificationFixture.rewardRows()[0].document.currency, {stoneCoins: 200});
  assert.deepEqual(qualificationFixture.rewardRows()[0].document.items, [{itemId: "ring_earth_trial", count: 1}]);
});

test("reward vault HTTP list is account-scoped and claim requires one replayable idempotency key", async (t) => {
  const seed = createAuthService({store: createMemoryAuthStore()});
  const player = seed.register({username: "vaulthttpplayer", password: "test1234", displayName: "奖励仓接口号"});
  const other = seed.register({username: "vaulthttpother", password: "test1234", displayName: "奖励仓旁观号"});
  const createdAt = "2026-08-13T02:00:00.000Z";
  const entry = createRewardVaultEntry({
    sourceKind: "market_sale",
    sourceKey: "source_http_reward_0001",
    recipientAccountId: player.account.accountId,
    recipientUsername: player.account.username,
    recipientDisplayName: player.account.displayName,
    title: "接口测试奖励",
    body: "这份奖励只能由所属账号查看与领取。",
    items: [{itemId: "item_meat_small", count: 2}],
    currency: {stoneCoins: 5},
    createdAt,
  }, {certifyAttachment: certifyOrdinaryAttachment});
  const fixture = createVaultBackedStore(seed.snapshot(), [entry]);
  const service = createAuthService({store: fixture.store});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await service.waitForDurableIdle();
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    await fixture.store.close();
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const authorization = {authorization: `Bearer ${player.session.token}`};
  const otherAuthorization = {authorization: `Bearer ${other.session.token}`};
  const before = service.getProfile(player.session.token).profile;

  const missingLimit = await fetchJson(`${baseUrl}/rewards/vault`, {headers: authorization});
  assert.equal(missingLimit.ok, false);
  assert.equal(missingLimit.code, "reward_vault_pagination_invalid");
  const listed = await fetchJson(`${baseUrl}/rewards/vault?limit=10`, {headers: authorization});
  assert.equal(listed.ok, true, JSON.stringify(listed));
  assert.equal(listed.rewards.length, 1);
  assert.equal(listed.rewards[0].rewardId, entry.rewardId);
  for (const privateField of ["sourceKey", "sourceDigest", "recipientAccountId", "document"]) {
    assert.equal(Object.hasOwn(listed.rewards[0], privateField), false);
  }
  const otherList = await fetchJson(`${baseUrl}/rewards/vault?limit=10`, {headers: otherAuthorization});
  assert.equal(otherList.ok, true);
  assert.deepEqual(otherList.rewards, []);

  const claimUrl = `${baseUrl}/rewards/vault/${encodeURIComponent(entry.rewardId)}/claim`;
  const missingKey = await fetchJson(claimUrl, {method: "POST", headers: authorization});
  assert.equal(missingKey.ok, false);
  assert.equal(missingKey.code, "idempotency_key_required");
  const claimHeaders = {
    ...authorization,
    "idempotency-key": "reward_vault_http_claim_0001",
  };
  const claimed = await fetchJson(claimUrl, {method: "POST", headers: claimHeaders});
  assert.equal(claimed.ok, true, JSON.stringify(claimed));
  assert.equal(claimed.reward.status, "claimed");
  assert.equal(claimed.profile.stoneCoins, before.stoneCoins + 5);
  assert.equal(
    profileItemCount(claimed.profile, "item_meat_small"),
    profileItemCount(before, "item_meat_small") + 2,
  );
  const replayed = await fetchJson(claimUrl, {method: "POST", headers: claimHeaders});
  assert.equal(replayed.ok, true, JSON.stringify(replayed));
  assert.equal(replayed.durableCommit.replayed, true);
  const after = service.getProfile(player.session.token).profile;
  assert.equal(after.stoneCoins, before.stoneCoins + 5);
  assert.equal(
    profileItemCount(after, "item_meat_small"),
    profileItemCount(before, "item_meat_small") + 2,
  );
  assert.equal(fixture.rewardRows()[0].status, "claimed");
});
