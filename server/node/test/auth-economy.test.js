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

function seedBackpackEquipment(service, token, itemId = "weapon_wooden_club") {
  const current = service.getProfile(token);
  assert.equal(current.ok, true);
  const profile = current.profile;
  profile.backpackSlots = [
    {itemId, count: 1},
    ...Array.from({length: 14}, () => ({})),
  ];
  profile.equipmentInstances = {
    equip_transfer_guard_1: {
      schemaVersion: 1,
      instanceId: "equip_transfer_guard_1",
      itemId,
      location: "backpack",
      slotId: "",
      durability: 30,
      enhancement: {itemId, level: 2, history: []},
      wearCounters: {itemId, attackCount: 3, hitCount: 0},
      expPillCharge: {},
      source: "transfer_guard_test",
    },
  };
  profile.equipmentSlotInstanceIds = {};
  profile.equipmentSlotsVersion = 5;
  profile.nextEquipmentInstanceSerial = 2;
  const saved = service.saveProfile(token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile,
  });
  assert.equal(saved.ok, true);
  return saved;
}

function snapshotProfileDocument(snapshot, accountId) {
  const binding = snapshot.profileBindings[accountId];
  assert.ok(binding);
  const profileDoc = snapshot.profiles[binding.playerId];
  assert.ok(profileDoc);
  return profileDoc;
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

test("equipment bank deposits and withdrawals preserve exact instance state through private schema2 envelopes", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const account = service.register({username: "bankequipguard", password: "test1234", displayName: "装备银行号"});
  const token = account.session.token;
  seedBackpackEquipment(service, token);
  const current = service.getProfile(token);
  const seededProfile = current.profile;
  seededProfile.backpackSlots[1] = {itemId: "item_meat_small", count: 2};
  assert.equal(service.saveProfile(token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile: seededProfile,
  }).ok, true);

  const deposit = service.bankDeposit(token, {
    stoneCoins: 10,
    items: [
      {itemId: "item_meat_small", count: 1, sourceSlotIndex: 1, bankSlotIndex: 0},
      {
        itemId: "weapon_wooden_club",
        count: 1,
        instanceId: "equip_transfer_guard_1",
        sourceSlotIndex: 0,
        bankSlotIndex: 1,
      },
    ],
  });
  assert.equal(deposit.ok, true);
  assert.equal(deposit.bank.schemaVersion, 2);
  assert.deepEqual(deposit.bank.slots[0], {itemId: "item_meat_small", count: 1});
  assert.equal(deposit.bank.slots[1].itemId, "weapon_wooden_club");
  assert.equal(deposit.bank.slots[1].count, 1);
  const publicEnvelope = deposit.bank.slots[1].equipmentEnvelopes[0];
  assert.match(publicEnvelope.envelopeId, /^eqx_/);
  assert.equal(Object.hasOwn(publicEnvelope, "provenance"), false);
  assert.equal(Object.hasOwn(publicEnvelope.instanceState, "source"), false);
  assert.equal(Object.hasOwn(publicEnvelope.instanceState, "transferProvenance"), false);
  assert.deepEqual(deposit.profile.bank.slots[1].equipmentEnvelopes[0], publicEnvelope);
  assert.equal(profileItemCount(deposit.profile, "weapon_wooden_club"), 0);
  assert.equal(Object.hasOwn(deposit.profile.equipmentInstances, "equip_transfer_guard_1"), false);

  const storedAfterDeposit = snapshotProfileDocument(service.snapshot(), account.account.accountId).profile;
  const privateEnvelope = storedAfterDeposit.bank.slots[1].equipmentEnvelopes[0];
  assert.equal(privateEnvelope.provenance.sourceInstanceId, "equip_transfer_guard_1");
  assert.equal(privateEnvelope.instanceState.source, "transfer_guard_test");
  assert.equal(privateEnvelope.instanceState.enhancement.level, 2);
  assert.equal(privateEnvelope.instanceState.durability, 30);

  const beforeMixedWithdraw = service.getProfile(token);
  const mixedWithdrawFailure = service.bankWithdraw(token, {
    items: [
      {itemId: "item_meat_small", count: 1, bankSlotIndex: 0},
      {
        itemId: "weapon_wooden_club",
        count: 1,
        envelopeId: "eqx_missing_runtime_0001",
        bankSlotIndex: 1,
      },
    ],
  });
  assert.equal(mixedWithdrawFailure.ok, false);
  assert.equal(mixedWithdrawFailure.code, "bank_equipment_selection_stale");
  assert.deepEqual(mixedWithdrawFailure.profile, beforeMixedWithdraw.profile);
  const afterMixedWithdraw = service.getProfile(token);
  assert.equal(afterMixedWithdraw.profileSummary.profileRevision, beforeMixedWithdraw.profileSummary.profileRevision);
  assert.deepEqual(afterMixedWithdraw.profile, beforeMixedWithdraw.profile);

  const withdraw = service.bankWithdraw(token, {
    stoneCoins: 5,
    items: [
      {itemId: "item_meat_small", count: 1, bankSlotIndex: 0},
      {
        itemId: "weapon_wooden_club",
        count: 1,
        envelopeId: publicEnvelope.envelopeId,
        bankSlotIndex: 1,
        targetSlotIndex: 5,
      },
    ],
  });
  assert.equal(withdraw.ok, true);
  assert.equal(withdraw.bank.schemaVersion, 2);
  assert.deepEqual(withdraw.bank.slots[0], {});
  assert.deepEqual(withdraw.bank.slots[1], {});
  assert.deepEqual(withdraw.profile.backpackSlots[5], {itemId: "weapon_wooden_club", count: 1});
  assert.equal(profileItemCount(withdraw.profile, "item_meat_small"), 2);
  const storedAfterWithdraw = snapshotProfileDocument(service.snapshot(), account.account.accountId).profile;
  const imported = Object.values(storedAfterWithdraw.equipmentInstances).find((instance) => (
    instance.itemId === "weapon_wooden_club"
  ));
  assert.ok(imported);
  assert.notEqual(imported.instanceId, "equip_transfer_guard_1");
  assert.equal(imported.enhancement.level, 2);
  assert.equal(imported.durability, 30);
  assert.equal(imported.transferProvenance.originEnvelopeId, publicEnvelope.envelopeId);
  assert.equal(Object.hasOwn(withdraw.profile.equipmentInstances[imported.instanceId], "transferProvenance"), false);

  const beforeReplay = service.getProfile(token);
  const replay = service.bankWithdraw(token, {
    stoneCoins: 1,
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      envelopeId: publicEnvelope.envelopeId,
      bankSlotIndex: 1,
    }],
  });
  assert.equal(replay.ok, false);
  assert.equal(replay.code, "bank_equipment_selection_stale");
  const afterReplay = service.getProfile(token);
  assert.equal(afterReplay.profileSummary.profileRevision, beforeReplay.profileSummary.profileRevision);
  assert.deepEqual(afterReplay.profile, beforeReplay.profile);
});

test("equipment bank intents require exact server selection fields and mixed failures are atomic", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const account = service.register({username: "bankequipintent", password: "test1234", displayName: "装备意图号"});
  const token = account.session.token;
  seedBackpackEquipment(service, token);
  const before = service.getProfile(token);
  const result = service.bankDeposit(token, {
    stoneCoins: 10,
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      instanceId: "equip_transfer_guard_1",
      sourceSlotIndex: 0,
      envelope: {schemaVersion: 1},
    }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "bank_equipment_intent_invalid");
  const after = service.getProfile(token);
  assert.equal(after.profileSummary.profileRevision, before.profileSummary.profileRevision);
  assert.deepEqual(after.profile, before.profile);

  const missingSelection = service.bankDeposit(token, {
    items: [{itemId: "weapon_wooden_club", count: 1}],
  });
  assert.equal(missingSelection.ok, false);
  assert.equal(missingSelection.code, "bank_equipment_selection_required");

  const stagedProfile = service.getProfile(token);
  stagedProfile.profile.backpackSlots[1] = {itemId: "item_meat_small", count: 2};
  assert.equal(service.saveProfile(token, {
    expectedRevision: stagedProfile.profileSummary.profileRevision,
    profile: stagedProfile.profile,
  }).ok, true);
  const beforeRuntimeFailure = service.getProfile(token);
  const runtimeFailure = service.bankDeposit(token, {
    items: [
      {itemId: "item_meat_small", count: 1, sourceSlotIndex: 1, bankSlotIndex: 0},
      {
        itemId: "weapon_wooden_club",
        count: 1,
        instanceId: "equip_missing_runtime",
        sourceSlotIndex: 0,
        bankSlotIndex: 1,
      },
    ],
  });
  assert.equal(runtimeFailure.ok, false);
  assert.deepEqual(runtimeFailure.profile, beforeRuntimeFailure.profile);
  const afterRuntimeFailure = service.getProfile(token);
  assert.equal(afterRuntimeFailure.profileSummary.profileRevision, beforeRuntimeFailure.profileSummary.profileRevision);
  assert.deepEqual(afterRuntimeFailure.profile, beforeRuntimeFailure.profile);
});

test("coin-only bank writes preserve valid private schema2 equipment envelopes byte-for-byte", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const account = service.register({username: "bankcoinv2", password: "test1234", displayName: "装备石币号"});
  const token = account.session.token;
  seedBackpackEquipment(service, token);
  const equipmentDeposit = service.bankDeposit(token, {
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      instanceId: "equip_transfer_guard_1",
      sourceSlotIndex: 0,
      bankSlotIndex: 0,
    }],
  });
  assert.equal(equipmentDeposit.ok, true);
  const bankBefore = structuredClone(
    snapshotProfileDocument(service.snapshot(), account.account.accountId).profile.bank,
  );

  assert.equal(service.bankDeposit(token, {stoneCoins: 3}).ok, true);
  const afterDeposit = snapshotProfileDocument(service.snapshot(), account.account.accountId).profile.bank;
  assert.equal(afterDeposit.stoneCoins, bankBefore.stoneCoins + 3);
  assert.deepEqual(afterDeposit.items, bankBefore.items);
  assert.deepEqual(afterDeposit.slots, bankBefore.slots);

  assert.equal(service.bankWithdraw(token, {stoneCoins: 2}).ok, true);
  const afterWithdraw = snapshotProfileDocument(service.snapshot(), account.account.accountId).profile.bank;
  assert.equal(afterWithdraw.stoneCoins, bankBefore.stoneCoins + 1);
  assert.deepEqual(afterWithdraw.items, bankBefore.items);
  assert.deepEqual(afterWithdraw.slots, bankBefore.slots);
});

test("bank requests above the line limit reject the entire deposit or withdrawal", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const account = service.register({username: "banklinelimit", password: "test1234", displayName: "银行行数号"});
  const token = account.session.token;
  seedBackpack(service, token, [{itemId: "item_meat_small", count: 9}]);
  const nineLines = Array.from({length: 9}, () => ({
    itemId: "item_meat_small",
    count: 1,
  }));

  const beforeDeposit = service.getProfile(token);
  const deposit = service.bankDeposit(token, {items: nineLines});
  assert.equal(deposit.ok, false);
  assert.equal(deposit.code, "bank_transfer_line_limit");
  const afterDeposit = service.getProfile(token);
  assert.equal(afterDeposit.profileSummary.profileRevision, beforeDeposit.profileSummary.profileRevision);
  assert.deepEqual(afterDeposit.profile, beforeDeposit.profile);

  assert.equal(service.bankDeposit(token, {
    items: [{itemId: "item_meat_small", count: 9}],
  }).ok, true);
  const beforeWithdraw = service.getProfile(token);
  const withdraw = service.bankWithdraw(token, {items: nineLines});
  assert.equal(withdraw.ok, false);
  assert.equal(withdraw.code, "bank_transfer_line_limit");
  const afterWithdraw = service.getProfile(token);
  assert.equal(afterWithdraw.profileSummary.profileRevision, beforeWithdraw.profileSummary.profileRevision);
  assert.deepEqual(afterWithdraw.profile, beforeWithdraw.profile);
});

test("coin-only bank writes preserve unsupported raw assets atomically", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const account = seedService.register({username: "bankrawguard", password: "test1234", displayName: "银行原档号"});
  const token = account.session.token;
  const baseSeed = seedService.snapshot();

  for (const scenario of [
    {itemId: "weapon_wooden_club", expectedCode: "bank_equipment_transfer_unsupported", action: "deposit"},
    {itemId: "future_bank_relic_999", expectedCode: "bank_item_unknown", action: "withdraw"},
  ]) {
    const seed = structuredClone(baseSeed);
    const profileDoc = snapshotProfileDocument(seed, account.account.accountId);
    profileDoc.profile.bank = {
      stoneCoins: 25,
      items: [{itemId: scenario.itemId, count: 1, futureEnvelope: {quality: 9}}],
      slots: [
        {itemId: scenario.itemId, count: 1, futureEnvelope: {quality: 9}},
        ...Array.from({length: 89}, () => ({})),
      ],
      unlockedTabs: 1,
      schemaVersion: 1,
      futureField: {keep: true},
    };
    const bankBefore = structuredClone(profileDoc.profile.bank);
    const stoneCoinsBefore = profileDoc.profile.stoneCoins;
    const revisionBefore = seed.profileBindings[account.account.accountId].profileRevision;
    const service = createAuthService({store: createMemoryAuthStore(seed)});
    const result = scenario.action === "deposit"
      ? service.bankDeposit(token, {stoneCoins: 1})
      : service.bankWithdraw(token, {stoneCoins: 1});
    assert.equal(result.ok, false);
    assert.equal(result.code, scenario.expectedCode);
    const after = service.snapshot();
    const afterDoc = snapshotProfileDocument(after, account.account.accountId);
    assert.equal(after.profileBindings[account.account.accountId].profileRevision, revisionBefore);
    assert.equal(afterDoc.profile.stoneCoins, stoneCoinsBefore);
    assert.deepEqual(afterDoc.profile.bank, bankBefore);
  }
});

test("coin-only bank writes reject conflicting, overflowing, and malformed raw banks", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const account = seedService.register({username: "bankrawshape", password: "test1234", displayName: "银行坏档号"});
  const token = account.session.token;
  const baseSeed = seedService.snapshot();
  const emptySlots = () => Array.from({length: 90}, () => ({}));
  const scenarios = [
    {
      expectedCode: "bank_representation_conflict",
      bank: {stoneCoins: 25, items: [{itemId: "item_meat_small", count: 5}], slots: emptySlots(), unlockedTabs: 1, schemaVersion: 1},
    },
    {
      expectedCode: "bank_representation_conflict",
      bank: {
        stoneCoins: 25,
        items: [{itemId: "item_meat_small", count: 10000}],
        slots: [{itemId: "item_meat_small", count: 10000}, ...Array.from({length: 89}, () => ({}))],
        unlockedTabs: 6,
        schemaVersion: 1,
      },
    },
    {
      expectedCode: "bank_schema_invalid",
      bank: {
        stoneCoins: 25,
        items: [{itemId: "item_meat_small", count: 5}],
        slots: [{itemId: "item_meat_small", count: 5}, ...Array.from({length: 89}, () => ({}))],
        unlockedTabs: 1,
        schemaVersion: "not-a-version",
      },
    },
    {
      expectedCode: "bank_representation_conflict",
      bank: {
        stoneCoins: 25,
        items: [],
        slots: [{futureEnvelope: {assetId: "future_empty_slot_asset"}}, ...Array.from({length: 89}, () => ({}))],
        unlockedTabs: 1,
        schemaVersion: 1,
      },
    },
  ];

  for (const scenario of scenarios) {
    const seed = structuredClone(baseSeed);
    const profileDoc = snapshotProfileDocument(seed, account.account.accountId);
    profileDoc.profile.bank = structuredClone(scenario.bank);
    const bankBefore = structuredClone(profileDoc.profile.bank);
    const playerCoinsBefore = profileDoc.profile.stoneCoins;
    const revisionBefore = seed.profileBindings[account.account.accountId].profileRevision;
    const service = createAuthService({store: createMemoryAuthStore(seed)});

    const result = service.bankWithdraw(token, {stoneCoins: 1});
    assert.equal(result.ok, false);
    assert.equal(result.code, scenario.expectedCode);
    const after = service.snapshot();
    const afterDoc = snapshotProfileDocument(after, account.account.accountId);
    assert.equal(after.profileBindings[account.account.accountId].profileRevision, revisionBefore);
    assert.equal(afterDoc.profile.stoneCoins, playerCoinsBefore);
    assert.deepEqual(afterDoc.profile.bank, bankBefore);
  }
});

test("bank and market writers preserve unsafe future backpack assets", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const seller = seedService.register({username: "econfbags", password: "test1234", displayName: "未来背包卖家"});
  const buyer = seedService.register({username: "econfbagb", password: "test1234", displayName: "未来背包买家"});
  assert.equal(seller.ok, true);
  assert.equal(buyer.ok, true);
  const seed = seedService.snapshot();
  for (const accountId of [seller.account.accountId, buyer.account.accountId]) {
    const profileDoc = snapshotProfileDocument(seed, accountId);
    profileDoc.profile.backpackSlots[0] = {
      itemId: "future_backpack_relic_999",
      count: 1,
      futureEnvelope: {assetId: `future_${accountId}`},
    };
  }
  const sellerDoc = snapshotProfileDocument(seed, seller.account.accountId);
  sellerDoc.profile.backpackSlots[1] = {itemId: "item_meat_small", count: 1};
  const buyerDoc = snapshotProfileDocument(seed, buyer.account.accountId);
  buyerDoc.profile.bank = {stoneCoins: 25, items: [], slots: Array.from({length: 90}, () => ({})), unlockedTabs: 1, schemaVersion: 1};
  seed.marketListings.future_backpack_listing = {
    listingId: "future_backpack_listing",
    sellerAccountId: seller.account.accountId,
    itemId: "item_meat_small",
    count: 1,
    unitPrice: 20,
    currency: "stoneCoins",
    createdAt: "2026-07-12T00:00:00.000Z",
    schemaVersion: 1,
  };
  const sellerBefore = structuredClone(sellerDoc.profile);
  const buyerBefore = structuredClone(buyerDoc.profile);
  const listingBefore = structuredClone(seed.marketListings.future_backpack_listing);
  const sellerRevision = seed.profileBindings[seller.account.accountId].profileRevision;
  const buyerRevision = seed.profileBindings[buyer.account.accountId].profileRevision;
  const service = createAuthService({store: createMemoryAuthStore(seed)});

  const bank = service.bankWithdraw(buyer.session.token, {stoneCoins: 1});
  assert.equal(bank.ok, false);
  assert.equal(bank.code, "backpack_item_unknown");
  const create = service.createMarketListing(seller.session.token, {itemId: "item_meat_small", count: 1, unitPrice: 10});
  assert.equal(create.ok, false);
  assert.equal(create.code, "backpack_item_unknown");
  const buy = service.buyMarketListing(buyer.session.token, {listingId: "future_backpack_listing"});
  assert.equal(buy.ok, false);
  assert.equal(buy.code, "backpack_item_unknown");
  const cancel = service.cancelMarketListing(seller.session.token, {listingId: "future_backpack_listing"});
  assert.equal(cancel.ok, false);
  assert.equal(cancel.code, "backpack_item_unknown");

  const after = service.snapshot();
  assert.equal(after.profileBindings[seller.account.accountId].profileRevision, sellerRevision);
  assert.equal(after.profileBindings[buyer.account.accountId].profileRevision, buyerRevision);
  assert.deepEqual(snapshotProfileDocument(after, seller.account.accountId).profile, sellerBefore);
  assert.deepEqual(snapshotProfileDocument(after, buyer.account.accountId).profile, buyerBefore);
  assert.deepEqual(after.marketListings.future_backpack_listing, listingBefore);
});

test("legacy and mirrored capture-tool envelopes fail closed before bank writes", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const account = seedService.register({username: "legacytoolguard", password: "test1234", displayName: "旧工具保护号"});
  const token = account.session.token;
  const baseSeed = seedService.snapshot();
  const scenarios = [
    {
      expectedCode: "backpack_item_unknown",
      prepare(profile) {
        delete profile.backpackSlots;
        profile.captureTools = {capture_rope_basic: 3, future_capture_tool_999: 7};
      },
    },
    {
      expectedCode: "backpack_asset_state_invalid",
      prepare(profile) {
        delete profile.backpackSlots;
        profile.captureTools = {capture_rope_basic: 10000};
      },
    },
    {
      expectedCode: "backpack_item_unknown",
      prepare(profile) {
        profile.backpackSlots = [{itemId: "capture_rope_basic", count: 3}, ...Array.from({length: 14}, () => ({}))];
        profile.captureTools = {capture_rope_basic: 3, future_capture_tool_999: 7};
      },
    },
  ];

  for (const scenario of scenarios) {
    const seed = structuredClone(baseSeed);
    const profileDoc = snapshotProfileDocument(seed, account.account.accountId);
    scenario.prepare(profileDoc.profile);
    profileDoc.profile.bank = {stoneCoins: 25, items: [], slots: Array.from({length: 90}, () => ({})), unlockedTabs: 1, schemaVersion: 1};
    const profileBefore = structuredClone(profileDoc.profile);
    const revisionBefore = seed.profileBindings[account.account.accountId].profileRevision;
    const service = createAuthService({store: createMemoryAuthStore(seed)});

    const result = service.bankWithdraw(token, {stoneCoins: 1});
    assert.equal(result.ok, false);
    assert.equal(result.code, scenario.expectedCode);
    const after = service.snapshot();
    assert.equal(after.profileBindings[account.account.accountId].profileRevision, revisionBefore);
    assert.deepEqual(snapshotProfileDocument(after, account.account.accountId).profile, profileBefore);
  }
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

test("equipment market create, buy, and cancel preserve all assets and historical listings", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const seller = seedService.register({username: "marketequip_seller", password: "test1234", displayName: "装备卖家"});
  const buyer = seedService.register({username: "marketequip_buyer", password: "test1234", displayName: "装备买家"});
  seedBackpackEquipment(seedService, seller.session.token);

  const sellerBeforeCreate = seedService.getProfile(seller.session.token);
  const create = seedService.createMarketListing(seller.session.token, {
    itemId: "weapon_wooden_club",
    count: 1,
    unitPrice: 20,
    currency: "stoneCoins",
  });
  assert.equal(create.ok, false);
  assert.equal(create.code, "market_equipment_transfer_unsupported");
  const sellerAfterCreate = seedService.getProfile(seller.session.token);
  assert.equal(sellerAfterCreate.profileSummary.profileRevision, sellerBeforeCreate.profileSummary.profileRevision);
  assert.equal(profileItemCount(sellerAfterCreate.profile, "weapon_wooden_club"), 1);
  assert.deepEqual(sellerAfterCreate.profile.equipmentInstances, sellerBeforeCreate.profile.equipmentInstances);
  assert.deepEqual(seedService.snapshot().marketListings, {});

  const seed = seedService.snapshot();
  const sellerDoc = snapshotProfileDocument(seed, seller.account.accountId);
  sellerDoc.profile.backpackSlots = Array.from({length: 15}, () => ({}));
  sellerDoc.profile.equipmentInstances = {};
  seed.marketListings.legacy_equipment_listing = {
    listingId: "legacy_equipment_listing",
    sellerAccountId: seller.account.accountId,
    itemId: "weapon_wooden_club",
    count: 1,
    unitPrice: 20,
    currency: "stoneCoins",
    createdAt: "2026-07-12T00:00:00.000Z",
    schemaVersion: 1,
  };
  const service = createAuthService({store: createMemoryAuthStore(seed)});
  const buyerBefore = service.getProfile(buyer.session.token);
  const sellerBefore = service.getProfile(seller.session.token);

  const buy = service.buyMarketListing(buyer.session.token, {listingId: "legacy_equipment_listing"});
  assert.equal(buy.ok, false);
  assert.equal(buy.code, "market_equipment_transfer_unsupported");
  const buyerAfter = service.getProfile(buyer.session.token);
  assert.equal(buyerAfter.profileSummary.profileRevision, buyerBefore.profileSummary.profileRevision);
  assert.equal(buyerAfter.profile.stoneCoins, buyerBefore.profile.stoneCoins);
  assert.equal(profileItemCount(buyerAfter.profile, "weapon_wooden_club"), 0);
  assert.ok(service.snapshot().marketListings.legacy_equipment_listing);

  const cancel = service.cancelMarketListing(seller.session.token, {listingId: "legacy_equipment_listing"});
  assert.equal(cancel.ok, false);
  assert.equal(cancel.code, "market_equipment_transfer_unsupported");
  const sellerAfter = service.getProfile(seller.session.token);
  assert.equal(sellerAfter.profileSummary.profileRevision, sellerBefore.profileSummary.profileRevision);
  assert.equal(profileItemCount(sellerAfter.profile, "weapon_wooden_club"), 0);
  assert.deepEqual(sellerAfter.profile.equipmentInstances, {});
  assert.ok(service.snapshot().marketListings.legacy_equipment_listing);
});

test("unknown market listings cannot charge buyers or disappear on buy and cancel", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const seller = seedService.register({username: "marketunknownseller", password: "test1234", displayName: "未知挂单卖家"});
  const buyer = seedService.register({username: "marketunknownbuyer", password: "test1234", displayName: "未知挂单买家"});
  const seed = seedService.snapshot();
  seed.marketListings.future_unknown_listing = {
    listingId: "future_unknown_listing",
    sellerAccountId: seller.account.accountId,
    itemId: "future_market_relic_999",
    count: 1,
    unitPrice: 20,
    currency: "stoneCoins",
    createdAt: "2026-07-12T00:00:00.000Z",
    schemaVersion: 1,
    futureEnvelope: {quality: 9},
  };
  const listingBefore = structuredClone(seed.marketListings.future_unknown_listing);
  const buyerBefore = snapshotProfileDocument(seed, buyer.account.accountId);
  const sellerBefore = snapshotProfileDocument(seed, seller.account.accountId);
  const buyerCoinsBefore = buyerBefore.profile.stoneCoins;
  const buyerRevisionBefore = seed.profileBindings[buyer.account.accountId].profileRevision;
  const sellerRevisionBefore = seed.profileBindings[seller.account.accountId].profileRevision;
  const service = createAuthService({store: createMemoryAuthStore(seed)});

  const buy = service.buyMarketListing(buyer.session.token, {listingId: "future_unknown_listing"});
  assert.equal(buy.ok, false);
  assert.equal(buy.code, "market_item_unknown");
  let after = service.snapshot();
  assert.deepEqual(after.marketListings.future_unknown_listing, listingBefore);
  assert.equal(snapshotProfileDocument(after, buyer.account.accountId).profile.stoneCoins, buyerCoinsBefore);
  assert.equal(after.profileBindings[buyer.account.accountId].profileRevision, buyerRevisionBefore);

  const cancel = service.cancelMarketListing(seller.session.token, {listingId: "future_unknown_listing"});
  assert.equal(cancel.ok, false);
  assert.equal(cancel.code, "market_item_unknown");
  after = service.snapshot();
  assert.deepEqual(after.marketListings.future_unknown_listing, listingBefore);
  assert.equal(after.profileBindings[seller.account.accountId].profileRevision, sellerRevisionBefore);
  assert.deepEqual(snapshotProfileDocument(after, seller.account.accountId).profile, sellerBefore.profile);
});

test("future and malformed market listing schemas preserve listings and wallets", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const seller = seedService.register({username: "marketschemaseller", password: "test1234", displayName: "版本挂单卖家"});
  const buyer = seedService.register({username: "marketschemabuyer", password: "test1234", displayName: "版本挂单买家"});
  const baseSeed = seedService.snapshot();

  for (const scenario of [
    {schemaVersion: 2, expectedCode: "market_listing_schema_future"},
    {schemaVersion: "not-a-version", expectedCode: "market_listing_schema_invalid"},
  ]) {
    const seed = structuredClone(baseSeed);
    seed.marketListings.schema_guard_listing = {
      listingId: "schema_guard_listing",
      sellerAccountId: seller.account.accountId,
      itemId: "item_meat_small",
      count: 1,
      unitPrice: 20,
      currency: "stoneCoins",
      createdAt: "2026-07-12T00:00:00.000Z",
      schemaVersion: scenario.schemaVersion,
    };
    const listingBefore = structuredClone(seed.marketListings.schema_guard_listing);
    const buyerBefore = structuredClone(snapshotProfileDocument(seed, buyer.account.accountId).profile);
    const buyerRevision = seed.profileBindings[buyer.account.accountId].profileRevision;
    const sellerRevision = seed.profileBindings[seller.account.accountId].profileRevision;
    const service = createAuthService({store: createMemoryAuthStore(seed)});

    const buy = service.buyMarketListing(buyer.session.token, {listingId: "schema_guard_listing"});
    assert.equal(buy.ok, false);
    assert.equal(buy.code, scenario.expectedCode);
    let after = service.snapshot();
    assert.deepEqual(after.marketListings.schema_guard_listing, listingBefore);
    assert.deepEqual(snapshotProfileDocument(after, buyer.account.accountId).profile, buyerBefore);
    assert.equal(after.profileBindings[buyer.account.accountId].profileRevision, buyerRevision);

    const cancel = service.cancelMarketListing(seller.session.token, {listingId: "schema_guard_listing"});
    assert.equal(cancel.ok, false);
    assert.equal(cancel.code, scenario.expectedCode);
    after = service.snapshot();
    assert.deepEqual(after.marketListings.schema_guard_listing, listingBefore);
    assert.equal(after.profileBindings[seller.account.accountId].profileRevision, sellerRevision);
  }
});

test("a missing market seller cannot make an escrowed listing disappear", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const buyer = seedService.register({username: "mktmissbuyer", password: "test1234", displayName: "失联卖家买家"});
  assert.equal(buyer.ok, true);
  const seed = seedService.snapshot();
  seed.marketListings.missing_seller_listing = {
    listingId: "missing_seller_listing",
    sellerAccountId: "acc_missing_seller",
    itemId: "item_meat_small",
    count: 1,
    unitPrice: 20,
    currency: "stoneCoins",
    createdAt: "2026-07-12T00:00:00.000Z",
    schemaVersion: 1,
  };
  const listingBefore = structuredClone(seed.marketListings.missing_seller_listing);
  const buyerBefore = structuredClone(snapshotProfileDocument(seed, buyer.account.accountId).profile);
  const revisionBefore = seed.profileBindings[buyer.account.accountId].profileRevision;
  const service = createAuthService({store: createMemoryAuthStore(seed)});

  const result = service.buyMarketListing(buyer.session.token, {listingId: "missing_seller_listing"});
  assert.equal(result.ok, false);
  assert.equal(result.code, "market_seller_missing");
  const after = service.snapshot();
  assert.deepEqual(after.marketListings.missing_seller_listing, listingBefore);
  assert.equal(after.profileBindings[buyer.account.accountId].profileRevision, revisionBefore);
  assert.deepEqual(snapshotProfileDocument(after, buyer.account.accountId).profile, buyerBefore);
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

test("equipment trade offers and counters fail before offer or profile mutation", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const alpha = seedService.register({username: "tradeequip_a", password: "test1234", displayName: "装备交易甲"});
  const beta = seedService.register({username: "tradeequip_b", password: "test1234", displayName: "装备交易乙"});
  seedBackpackEquipment(seedService, alpha.session.token);
  assert.equal(seedService.updatePlayerPosition(alpha.session.token, {mapId: "firebud_training_yard", cellX: 10, cellY: 10, facing: "east", moving: false}).ok, true);
  assert.equal(seedService.updatePlayerPosition(beta.session.token, {mapId: "firebud_training_yard", cellX: 11, cellY: 10, facing: "west", moving: false}).ok, true);
  const alphaBeforeProposal = seedService.getProfile(alpha.session.token);
  const proposal = seedService.proposeTrade(alpha.session.token, {
    targetUsername: "tradeequip_b",
    stoneCoins: 10,
    items: [{itemId: "weapon_wooden_club", count: 1}],
  });
  assert.equal(proposal.ok, false);
  assert.equal(proposal.code, "trade_equipment_transfer_unsupported");
  const alphaAfterProposal = seedService.getProfile(alpha.session.token);
  assert.equal(alphaAfterProposal.profileSummary.profileRevision, alphaBeforeProposal.profileSummary.profileRevision);
  assert.equal(alphaAfterProposal.profile.stoneCoins, alphaBeforeProposal.profile.stoneCoins);
  assert.equal(profileItemCount(alphaAfterProposal.profile, "weapon_wooden_club"), 1);
  assert.deepEqual(alphaAfterProposal.profile.equipmentInstances, alphaBeforeProposal.profile.equipmentInstances);
  assert.deepEqual(seedService.snapshot().tradeOffers, {});

  const counterSeedService = createAuthService({store: createMemoryAuthStore()});
  const giver = counterSeedService.register({username: "tradeequip_offer", password: "test1234", displayName: "普通报价方"});
  const accepter = counterSeedService.register({username: "tradeequip_counter", password: "test1234", displayName: "装备还价方"});
  seedBackpack(counterSeedService, giver.session.token, [{itemId: "item_meat_small", count: 2}]);
  seedBackpackEquipment(counterSeedService, accepter.session.token);
  assert.equal(counterSeedService.updatePlayerPosition(giver.session.token, {mapId: "firebud_training_yard", cellX: 20, cellY: 20, facing: "east", moving: false}).ok, true);
  assert.equal(counterSeedService.updatePlayerPosition(accepter.session.token, {mapId: "firebud_training_yard", cellX: 21, cellY: 20, facing: "west", moving: false}).ok, true);
  const normalProposal = counterSeedService.proposeTrade(giver.session.token, {
    targetUsername: "tradeequip_counter",
    items: [{itemId: "item_meat_small", count: 1}],
  });
  assert.equal(normalProposal.ok, true);
  const giverBeforeCounter = counterSeedService.getProfile(giver.session.token);
  const accepterBeforeCounter = counterSeedService.getProfile(accepter.session.token);
  const counterAccept = counterSeedService.acceptTrade(accepter.session.token, {
    tradeId: normalProposal.trade.tradeId,
    stoneCoins: 7,
    items: [{itemId: "weapon_wooden_club", count: 1}],
  });
  assert.equal(counterAccept.ok, false);
  assert.equal(counterAccept.code, "trade_equipment_transfer_unsupported");
  const giverAfterCounter = counterSeedService.getProfile(giver.session.token);
  const accepterAfterCounter = counterSeedService.getProfile(accepter.session.token);
  assert.equal(giverAfterCounter.profileSummary.profileRevision, giverBeforeCounter.profileSummary.profileRevision);
  assert.equal(accepterAfterCounter.profileSummary.profileRevision, accepterBeforeCounter.profileSummary.profileRevision);
  assert.equal(profileItemCount(giverAfterCounter.profile, "item_meat_small"), 2);
  assert.equal(profileItemCount(accepterAfterCounter.profile, "weapon_wooden_club"), 1);
  assert.ok(counterSeedService.snapshot().tradeOffers[normalProposal.trade.tradeId]);
});
