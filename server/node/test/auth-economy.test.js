"use strict";

const {
  assert,
  test,
  createAuthService,
  createCountingAuthStore,
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

function seedBackpackEquipment(service, token, itemId = "weapon_wooden_club", instanceOverrides = {}) {
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
      ...structuredClone(instanceOverrides),
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
  assert.match(publicEnvelope.envelopeId, /^eqx_bank_/);
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
  assert.deepEqual(service.snapshot().consumedEquipmentEnvelopes[publicEnvelope.envelopeId], {
    schemaVersion: 1,
    envelopeId: publicEnvelope.envelopeId,
  });
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

test("market sale mail id exhaustion cancels normal and tutorial settlement without changing any asset", () => {
  function collisionMail(mailId, recipient) {
    return {
      mailId,
      senderAccountId: "system_market",
      senderUsername: "auction_house",
      senderDisplayName: "拍卖行",
      recipientAccountId: recipient.account.accountId,
      recipientUsername: recipient.account.username,
      recipientDisplayName: recipient.account.displayName,
      title: "占用编号",
      body: "用于验证编号冲突不会覆盖已有邮件。",
      items: [],
      currency: {},
      createdAt: "2026-07-12T00:00:00.000Z",
      readAt: null,
      schemaVersion: 1,
    };
  }

  const saleSeedService = createAuthService({store: createMemoryAuthStore()});
  const seller = saleSeedService.register({username: "mailid_seller", password: "test1234", displayName: "编号卖家"});
  const buyer = saleSeedService.register({username: "mailid_buyer", password: "test1234", displayName: "编号买家"});
  seedBackpack(saleSeedService, seller.session.token, [{itemId: "item_meat_small", count: 1}]);
  const listed = saleSeedService.createMarketListing(seller.session.token, {
    itemId: "item_meat_small",
    count: 1,
    unitPrice: 20,
    currency: "stoneCoins",
  });
  assert.equal(listed.ok, true);
  const saleSeed = saleSeedService.snapshot();
  saleSeed.mailMessages.mail_market_collision = collisionMail("mail_market_collision", seller);
  const saleService = createAuthService({
    store: createMemoryAuthStore(saleSeed),
    randomId: () => "collision",
  });
  const saleBefore = saleService.snapshot();
  const bought = saleService.buyMarketListing(buyer.session.token, {listingId: listed.listing.listingId});
  assert.equal(bought.ok, false);
  assert.equal(bought.code, "market_sale_mail_id_unavailable");
  assert.deepEqual(saleService.snapshot(), saleBefore);

  const tutorialSeedService = createAuthService({store: createMemoryAuthStore()});
  const player = tutorialSeedService.register({username: "mailid_tutorial", password: "test1234", displayName: "编号学员"});
  const current = tutorialSeedService.getProfile(player.session.token);
  const profile = current.profile;
  profile.stoneCoins = 10;
  profile.backpackSlots = [{itemId: "tutorial_worn_hide", count: 1}];
  profile.activeQuestId = "quest_market_sell_player";
  profile.questStates = {
    quest_market_sell_player: {questId: "quest_market_sell_player", status: "active", progress: 0},
  };
  assert.equal(tutorialSeedService.saveProfile(player.session.token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile,
  }).ok, true);
  const tutorialSeed = tutorialSeedService.snapshot();
  tutorialSeed.mailMessages.mail_tutorial_market_collision = collisionMail(
    "mail_tutorial_market_collision",
    player,
  );
  const tutorialService = createAuthService({
    store: createMemoryAuthStore(tutorialSeed),
    randomId: () => "collision",
  });
  const tutorialBefore = tutorialService.snapshot();
  const tutorialSale = tutorialService.createMarketListing(player.session.token, {
    itemId: "tutorial_worn_hide",
    count: 1,
    unitPrice: 7,
    currency: "stoneCoins",
  });
  assert.equal(tutorialSale.ok, false);
  assert.equal(tutorialSale.code, "tutorial_market_sale_mail_id_unavailable");
  assert.deepEqual(tutorialService.snapshot(), tutorialBefore);
});

test("equipment market create and buy preserve private state, allocate a buyer-local id, and expose only public facts", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const seller = service.register({username: "marketequip_seller", password: "test1234", displayName: "装备卖家"});
  const buyer = service.register({username: "marketequip_buyer", password: "test1234", displayName: "装备买家"});
  seedBackpackEquipment(service, seller.session.token, "weapon_wooden_club", {
    durability: 17,
    enhancement: {itemId: "weapon_wooden_club", level: 4, history: [{level: 4, roll: 88}]},
    wearCounters: {itemId: "weapon_wooden_club", attackCount: 37, hitCount: 0},
    futureAffixes: [{id: "market_power", value: 7}],
  });
  const sellerBefore = service.getProfile(seller.session.token);
  const buyerBefore = service.getProfile(buyer.session.token);

  const created = service.createMarketListing(seller.session.token, {
    itemId: "weapon_wooden_club",
    count: 1,
    instanceId: "equip_transfer_guard_1",
    sourceSlotIndex: 0,
    unitPrice: 20,
    currency: "stoneCoins",
  });
  assert.equal(created.ok, true);
  assert.equal(created.listing.schemaVersion, 2);
  assert.equal(created.listing.count, 1);
  assert.match(created.listing.equipmentEnvelope.envelopeId, /^eqx_market_/);
  assert.equal(created.listing.equipmentEnvelope.instanceState.durability, 17);
  assert.equal(created.listing.equipmentEnvelope.instanceState.enhancement.level, 4);
  assert.deepEqual(created.listing.equipmentEnvelope.instanceState.futureAffixes, [{id: "market_power", value: 7}]);
  assert.equal(Object.hasOwn(created.listing.equipmentEnvelope, "provenance"), false);
  assert.equal(Object.hasOwn(created.listing.equipmentEnvelope.instanceState, "source"), false);
  assert.equal(Object.hasOwn(created.listing.equipmentEnvelope.instanceState, "transferProvenance"), false);
  assert.equal(profileItemCount(created.profile, "weapon_wooden_club"), 0);
  assert.equal(Object.hasOwn(created.profile.equipmentInstances, "equip_transfer_guard_1"), false);
  assert.equal(created.profileBinding.profileRevision, sellerBefore.profileSummary.profileRevision + 1);

  const storedListing = service.snapshot().marketListings[created.listing.listingId];
  assert.equal(storedListing.schemaVersion, 2);
  assert.equal(storedListing.equipmentEnvelope.provenance.sourceInstanceId, "equip_transfer_guard_1");
  assert.equal(storedListing.equipmentEnvelope.instanceState.source, "transfer_guard_test");
  assert.deepEqual(storedListing.equipmentEnvelope.instanceState.futureAffixes, [{id: "market_power", value: 7}]);
  const listed = service.marketListings(buyer.session.token).market.listings[0];
  assert.equal(Object.hasOwn(listed.equipmentEnvelope, "provenance"), false);
  assert.equal(Object.hasOwn(listed.equipmentEnvelope.instanceState, "source"), false);

  const bought = service.buyMarketListing(buyer.session.token, {listingId: created.listing.listingId});
  assert.equal(bought.ok, true);
  assert.equal(bought.profile.stoneCoins, buyerBefore.profile.stoneCoins - 20);
  assert.equal(profileItemCount(bought.profile, "weapon_wooden_club"), 1);
  assert.equal(service.snapshot().marketListings[created.listing.listingId], undefined);
  const buyerStored = snapshotProfileDocument(service.snapshot(), buyer.account.accountId).profile;
  const imported = Object.values(buyerStored.equipmentInstances).find((instance) => (
    instance.itemId === "weapon_wooden_club" && instance.location === "backpack"
  ));
  assert.ok(imported);
  assert.notEqual(imported.instanceId, "equip_transfer_guard_1");
  assert.equal(imported.durability, 17);
  assert.equal(imported.enhancement.level, 4);
  assert.equal(imported.wearCounters.attackCount, 37);
  assert.deepEqual(imported.futureAffixes, [{id: "market_power", value: 7}]);
  assert.equal(imported.transferProvenance.originEnvelopeId, storedListing.equipmentEnvelope.envelopeId);
  assert.equal(imported.transferProvenance.originStateFingerprint, storedListing.equipmentEnvelope.stateFingerprint);
  assert.deepEqual(service.snapshot().consumedEquipmentEnvelopes[storedListing.equipmentEnvelope.envelopeId], {
    schemaVersion: 1,
    envelopeId: storedListing.equipmentEnvelope.envelopeId,
  });
  const sellerStored = snapshotProfileDocument(service.snapshot(), seller.account.accountId).profile;
  assert.equal(profileItemCount(sellerStored, "weapon_wooden_club"), 0);
  assert.equal(Object.keys(sellerStored.equipmentInstances).length, 0);
  const saleMail = service.listInbox(seller.session.token).messages.find((mail) => mail.title === "拍卖行成交通知");
  assert.ok(saleMail);
  assert.equal(saleMail.currency.stoneCoins, 19);
  const replay = service.buyMarketListing(buyer.session.token, {listingId: created.listing.listingId});
  assert.equal(replay.ok, false);
  assert.equal(replay.code, "market_listing_missing");
});

test("equipment market cancel imports the escrow as a new local instance and legacy template-only listings remain blocked", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const seller = seedService.register({username: "marketequip_cancel", password: "test1234", displayName: "装备下架号"});
  const buyer = seedService.register({username: "mktequipoldbuyer", password: "test1234", displayName: "旧挂单买家"});
  seedBackpackEquipment(seedService, seller.session.token, "weapon_wooden_club", {
    durability: 11,
    enhancement: {itemId: "weapon_wooden_club", level: 3, history: [{level: 3, roll: 77}]},
  });
  const created = seedService.createMarketListing(seller.session.token, {
    itemId: "weapon_wooden_club",
    count: 1,
    instanceId: "equip_transfer_guard_1",
    sourceSlotIndex: 0,
    unitPrice: 30,
    currency: "diamonds",
  });
  assert.equal(created.ok, true);
  const envelopeId = created.listing.equipmentEnvelope.envelopeId;
  const cancelled = seedService.cancelMarketListing(seller.session.token, {listingId: created.listing.listingId});
  assert.equal(cancelled.ok, true);
  assert.equal(profileItemCount(cancelled.profile, "weapon_wooden_club"), 1);
  assert.equal(seedService.snapshot().marketListings[created.listing.listingId], undefined);
  const sellerAfterCancel = snapshotProfileDocument(seedService.snapshot(), seller.account.accountId).profile;
  const returned = Object.values(sellerAfterCancel.equipmentInstances).find((instance) => instance.itemId === "weapon_wooden_club");
  assert.ok(returned);
  assert.notEqual(returned.instanceId, "equip_transfer_guard_1");
  assert.equal(returned.durability, 11);
  assert.equal(returned.enhancement.level, 3);
  assert.equal(returned.transferProvenance.originEnvelopeId, envelopeId);
  assert.deepEqual(seedService.snapshot().consumedEquipmentEnvelopes[envelopeId], {
    schemaVersion: 1,
    envelopeId,
  });

  const seed = seedService.snapshot();
  const sellerDoc = snapshotProfileDocument(seed, seller.account.accountId);
  sellerDoc.profile.backpackSlots = Array.from({length: sellerDoc.profile.backpackSlots.length}, () => ({}));
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
  const cancel = service.cancelMarketListing(seller.session.token, {listingId: "legacy_equipment_listing"});
  assert.equal(cancel.ok, false);
  assert.equal(cancel.code, "market_equipment_transfer_unsupported");
  assert.equal(service.getProfile(buyer.session.token).profileSummary.profileRevision, buyerBefore.profileSummary.profileRevision);
  assert.equal(service.getProfile(seller.session.token).profileSummary.profileRevision, sellerBefore.profileSummary.profileRevision);
  assert.ok(service.snapshot().marketListings.legacy_equipment_listing);
});

test("equipment market create accepts only an exact instance intent and stale selection failures are atomic", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const seller = service.register({username: "marketequip_intent", password: "test1234", displayName: "装备意图号"});
  seedBackpackEquipment(service, seller.session.token);
  const before = service.getProfile(seller.session.token);
  const baseIntent = {
    itemId: "weapon_wooden_club",
    count: 1,
    instanceId: "equip_transfer_guard_1",
    sourceSlotIndex: 0,
    unitPrice: 20,
    currency: "stoneCoins",
  };
  const missingSelection = service.createMarketListing(seller.session.token, {
    itemId: "weapon_wooden_club",
    count: 1,
    unitPrice: 20,
    currency: "stoneCoins",
  });
  assert.equal(missingSelection.ok, false);
  assert.equal(missingSelection.code, "market_equipment_selection_required");
  const forgedEnvelope = service.createMarketListing(seller.session.token, {
    ...baseIntent,
    equipmentEnvelope: {schemaVersion: 1},
  });
  assert.equal(forgedEnvelope.ok, false);
  assert.equal(forgedEnvelope.code, "market_equipment_intent_invalid");
  const staleInstance = service.createMarketListing(seller.session.token, {
    ...baseIntent,
    instanceId: "equip_stale_missing",
  });
  assert.equal(staleInstance.ok, false);
  assert.equal(staleInstance.code, "equipment_instance_selection_invalid");
  const staleSlot = service.createMarketListing(seller.session.token, {
    ...baseIntent,
    sourceSlotIndex: 1,
  });
  assert.equal(staleSlot.ok, false);
  assert.equal(staleSlot.code, "equipment_transfer_source_slot_mismatch");
  const after = service.getProfile(seller.session.token);
  assert.equal(after.profileSummary.profileRevision, before.profileSummary.profileRevision);
  assert.deepEqual(after.profile, before.profile);
  assert.deepEqual(service.snapshot().marketListings, {});
});

test("equipment market buy and cancel keep wallet, revisions, listing, and private envelope unchanged when backpacks are full", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const seller = service.register({username: "mktequipfullsell", password: "test1234", displayName: "满包卖家"});
  const buyer = service.register({username: "mktequipfullbuy", password: "test1234", displayName: "满包买家"});
  seedBackpackEquipment(service, seller.session.token, "weapon_wooden_club", {
    durability: 13,
    futureAffixes: [{id: "full_guard", value: 9}],
  });
  const created = service.createMarketListing(seller.session.token, {
    itemId: "weapon_wooden_club",
    count: 1,
    instanceId: "equip_transfer_guard_1",
    sourceSlotIndex: 0,
    unitPrice: 20,
    currency: "stoneCoins",
  });
  assert.equal(created.ok, true);
  const listingId = created.listing.listingId;

  for (const account of [buyer, seller]) {
    const current = service.getProfile(account.session.token);
    const profile = current.profile;
    profile.backpackSlots = Array.from({length: profile.backpackSlots.length}, () => ({
      itemId: "item_meat_small",
      count: 99,
    }));
    const saved = service.saveProfile(account.session.token, {
      expectedRevision: current.profileSummary.profileRevision,
      profile,
    });
    assert.equal(saved.ok, true);
  }

  const beforeBuy = service.snapshot();
  const buyerBindingBefore = beforeBuy.profileBindings[buyer.account.accountId];
  const buyerProfileBefore = snapshotProfileDocument(beforeBuy, buyer.account.accountId).profile;
  const sellerBindingBefore = beforeBuy.profileBindings[seller.account.accountId];
  const sellerProfileBefore = snapshotProfileDocument(beforeBuy, seller.account.accountId).profile;
  const listingBefore = structuredClone(beforeBuy.marketListings[listingId]);
  const mailCountBefore = Object.keys(beforeBuy.mailMessages).length;
  const taxBefore = structuredClone(beforeBuy.marketConfig);
  const buy = service.buyMarketListing(buyer.session.token, {listingId});
  assert.equal(buy.ok, false);
  assert.equal(buy.code, "market_backpack_full");
  let after = service.snapshot();
  assert.equal(after.profileBindings[buyer.account.accountId].profileRevision, buyerBindingBefore.profileRevision);
  assert.equal(after.profileBindings[seller.account.accountId].profileRevision, sellerBindingBefore.profileRevision);
  assert.deepEqual(snapshotProfileDocument(after, buyer.account.accountId).profile, buyerProfileBefore);
  assert.deepEqual(snapshotProfileDocument(after, seller.account.accountId).profile, sellerProfileBefore);
  assert.deepEqual(after.marketListings[listingId], listingBefore);
  assert.equal(Object.keys(after.mailMessages).length, mailCountBefore);
  assert.deepEqual(after.marketConfig, taxBefore);

  const cancel = service.cancelMarketListing(seller.session.token, {listingId});
  assert.equal(cancel.ok, false);
  assert.equal(cancel.code, "market_backpack_full");
  after = service.snapshot();
  assert.equal(after.profileBindings[buyer.account.accountId].profileRevision, buyerBindingBefore.profileRevision);
  assert.equal(after.profileBindings[seller.account.accountId].profileRevision, sellerBindingBefore.profileRevision);
  assert.deepEqual(snapshotProfileDocument(after, buyer.account.accountId).profile, buyerProfileBefore);
  assert.deepEqual(snapshotProfileDocument(after, seller.account.accountId).profile, sellerProfileBefore);
  assert.deepEqual(after.marketListings[listingId], listingBefore);
  assert.equal(after.marketListings[listingId].equipmentEnvelope.instanceState.durability, 13);
  assert.deepEqual(after.marketListings[listingId].equipmentEnvelope.instanceState.futureAffixes, [{id: "full_guard", value: 9}]);
  assert.equal(Object.keys(after.mailMessages).length, mailCountBefore);
  assert.deepEqual(after.marketConfig, taxBefore);
});

test("duplicate or damaged equipment escrow makes market reads and mutations fail without hiding or consuming listings", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const seller = seedService.register({username: "mktequipdamage", password: "test1234", displayName: "托管保护卖家"});
  const buyer = seedService.register({username: "mktequipdamgbuy", password: "test1234", displayName: "托管保护买家"});
  seedBackpackEquipment(seedService, seller.session.token);
  const created = seedService.createMarketListing(seller.session.token, {
    itemId: "weapon_wooden_club",
    count: 1,
    instanceId: "equip_transfer_guard_1",
    sourceSlotIndex: 0,
    unitPrice: 20,
    currency: "stoneCoins",
  });
  assert.equal(created.ok, true);
  const listingId = created.listing.listingId;
  const baseSeed = seedService.snapshot();

  const duplicateSeed = structuredClone(baseSeed);
  const duplicateId = "market_duplicate_equipment";
  duplicateSeed.marketListings[duplicateId] = structuredClone(duplicateSeed.marketListings[listingId]);
  duplicateSeed.marketListings[duplicateId].listingId = duplicateId;
  const duplicateService = createAuthService({store: createMemoryAuthStore(duplicateSeed)});
  const duplicateBefore = duplicateService.snapshot();
  const readDuplicate = duplicateService.marketListings(buyer.session.token);
  assert.equal(readDuplicate.ok, false);
  assert.equal(readDuplicate.code, "market_equipment_envelope_duplicate");
  const buyDuplicate = duplicateService.buyMarketListing(buyer.session.token, {listingId});
  assert.equal(buyDuplicate.ok, false);
  assert.equal(buyDuplicate.code, "equipment_transfer_envelope_duplicate");
  const cancelDuplicate = duplicateService.cancelMarketListing(seller.session.token, {listingId});
  assert.equal(cancelDuplicate.ok, false);
  assert.equal(cancelDuplicate.code, "equipment_transfer_envelope_duplicate");
  assert.deepEqual(duplicateService.snapshot(), duplicateBefore);

  for (const scenario of [
    {
      code: "equipment_transfer_fingerprint_mismatch",
      mutate(listing) {
        listing.equipmentEnvelope.instanceState.durability -= 1;
      },
    },
    {
      code: "equipment_transfer_envelope_schema_future",
      mutate(listing) {
        listing.equipmentEnvelope.schemaVersion = 2;
      },
    },
    {
      code: "market_listing_schema_future",
      mutate(listing) {
        listing.schemaVersion = 3;
      },
    },
  ]) {
    const seed = structuredClone(baseSeed);
    scenario.mutate(seed.marketListings[listingId]);
    const service = createAuthService({store: createMemoryAuthStore(seed)});
    const before = service.snapshot();
    const read = service.marketListings(buyer.session.token);
    assert.equal(read.ok, false);
    assert.equal(read.code, scenario.code);
    const buy = service.buyMarketListing(buyer.session.token, {listingId});
    assert.equal(buy.ok, false);
    assert.equal(buy.code, scenario.code);
    const cancel = service.cancelMarketListing(seller.session.token, {listingId});
    assert.equal(cancel.ok, false);
    assert.equal(cancel.code, scenario.code);
    assert.deepEqual(service.snapshot(), before);
  }
});

test("bank withdraw and market buy or cancel reject one envelope owned by multiple persistent roots atomically", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const seller = seedService.register({username: "eqown_seller", password: "test1234", displayName: "归属卖家"});
  const buyer = seedService.register({username: "eqown_buyer", password: "test1234", displayName: "归属买家"});
  const bankOwner = seedService.register({username: "eqown_bank", password: "test1234", displayName: "归属银行号"});

  seedBackpackEquipment(seedService, seller.session.token);
  const listed = seedService.createMarketListing(seller.session.token, {
    itemId: "weapon_wooden_club",
    count: 1,
    instanceId: "equip_transfer_guard_1",
    sourceSlotIndex: 0,
    unitPrice: 20,
    currency: "stoneCoins",
  });
  assert.equal(listed.ok, true);

  seedBackpackEquipment(seedService, bankOwner.session.token);
  const deposited = seedService.bankDeposit(bankOwner.session.token, {
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      instanceId: "equip_transfer_guard_1",
      sourceSlotIndex: 0,
      bankSlotIndex: 0,
    }],
  });
  assert.equal(deposited.ok, true);

  const seed = seedService.snapshot();
  const listingId = listed.listing.listingId;
  const duplicateEnvelope = structuredClone(seed.marketListings[listingId].equipmentEnvelope);
  const bankProfile = snapshotProfileDocument(seed, bankOwner.account.accountId).profile;
  bankProfile.bank.slots[0].equipmentEnvelopes = [duplicateEnvelope];
  const service = createAuthService({store: createMemoryAuthStore(seed)});
  const before = service.snapshot();

  const withdraw = service.bankWithdraw(bankOwner.session.token, {
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      envelopeId: duplicateEnvelope.envelopeId,
      bankSlotIndex: 0,
    }],
  });
  assert.equal(withdraw.ok, false);
  assert.equal(withdraw.code, "equipment_transfer_envelope_duplicate");
  assert.deepEqual(service.snapshot(), before);

  const buy = service.buyMarketListing(buyer.session.token, {listingId});
  assert.equal(buy.ok, false);
  assert.equal(buy.code, "equipment_transfer_envelope_duplicate");
  assert.deepEqual(service.snapshot(), before);

  const cancel = service.cancelMarketListing(seller.session.token, {listingId});
  assert.equal(cancel.ok, false);
  assert.equal(cancel.code, "equipment_transfer_envelope_duplicate");
  assert.deepEqual(service.snapshot(), before);
});

test("bank, market, and mail exports cannot launder a duplicated materialized envelope origin", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const owner = seedService.register({username: "eqorigin_owner", password: "test1234", displayName: "来源持有人"});
  const recipient = seedService.register({username: "eqorigin_recv", password: "test1234", displayName: "来源收件人"});
  const escrowSeller = seedService.register({username: "eqorigin_escrow", password: "test1234", displayName: "来源托管号"});

  seedBackpackEquipment(seedService, owner.session.token);
  const deposited = seedService.bankDeposit(owner.session.token, {
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      instanceId: "equip_transfer_guard_1",
      sourceSlotIndex: 0,
      bankSlotIndex: 0,
    }],
  });
  assert.equal(deposited.ok, true);
  const originEnvelope = structuredClone(
    snapshotProfileDocument(seedService.snapshot(), owner.account.accountId).profile.bank.slots[0].equipmentEnvelopes[0],
  );
  const withdrawn = seedService.bankWithdraw(owner.session.token, {
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      envelopeId: originEnvelope.envelopeId,
      bankSlotIndex: 0,
    }],
  });
  assert.equal(withdrawn.ok, true);
  const ownerProfile = snapshotProfileDocument(seedService.snapshot(), owner.account.accountId).profile;
  const imported = Object.values(ownerProfile.equipmentInstances).find((instance) => (
    instance.transferProvenance
    && instance.transferProvenance.originEnvelopeId === originEnvelope.envelopeId
  ));
  assert.ok(imported);
  const sourceSlotIndex = ownerProfile.backpackSlots.findIndex((slot) => slot.itemId === imported.itemId);
  assert.notEqual(sourceSlotIndex, -1);

  seedBackpackEquipment(seedService, escrowSeller.session.token);
  const escrow = seedService.createMarketListing(escrowSeller.session.token, {
    itemId: "weapon_wooden_club",
    count: 1,
    instanceId: "equip_transfer_guard_1",
    sourceSlotIndex: 0,
    unitPrice: 1,
    currency: "stoneCoins",
  });
  assert.equal(escrow.ok, true);
  const baseSeed = seedService.snapshot();
  baseSeed.marketListings[escrow.listing.listingId].equipmentEnvelope = originEnvelope;

  const actions = [
    (service) => service.bankDeposit(owner.session.token, {
      items: [{
        itemId: imported.itemId,
        count: 1,
        instanceId: imported.instanceId,
        sourceSlotIndex,
        bankSlotIndex: 0,
      }],
    }),
    (service) => service.createMarketListing(owner.session.token, {
      itemId: imported.itemId,
      count: 1,
      instanceId: imported.instanceId,
      sourceSlotIndex,
      unitPrice: 1,
      currency: "stoneCoins",
    }),
    (service) => service.sendMail(owner.session.token, {
      recipientUsername: recipient.account.username,
      title: "禁止洗凭证",
      body: "重复来源不能再次托管。",
      items: [{
        itemId: imported.itemId,
        count: 1,
        instanceId: imported.instanceId,
        sourceSlotIndex,
      }],
    }),
  ];
  for (const action of actions) {
    const service = createAuthService({store: createMemoryAuthStore(structuredClone(baseSeed))});
    const before = service.snapshot();
    const result = action(service);
    assert.equal(result.ok, false);
    assert.equal(result.code, "equipment_transfer_envelope_duplicate");
    assert.deepEqual(service.snapshot(), before);
  }
});

test("consumed ledger blocks an E1 replay after E1 to E2 to E3 multi-hop transfer", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const owner = service.register({username: "eqmultihop", password: "test1234", displayName: "多跳持有人"});
  seedBackpackEquipment(service, owner.session.token);

  function currentImportedInstance(originEnvelopeId) {
    const profile = snapshotProfileDocument(service.snapshot(), owner.account.accountId).profile;
    const instance = Object.values(profile.equipmentInstances).find((entry) => (
      entry.transferProvenance
      && entry.transferProvenance.originEnvelopeId === originEnvelopeId
    ));
    assert.ok(instance);
    const sourceSlotIndex = profile.backpackSlots.findIndex((slot) => slot.itemId === instance.itemId);
    assert.notEqual(sourceSlotIndex, -1);
    return {instance, sourceSlotIndex};
  }

  const firstDeposit = service.bankDeposit(owner.session.token, {
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      instanceId: "equip_transfer_guard_1",
      sourceSlotIndex: 0,
      bankSlotIndex: 0,
    }],
  });
  assert.equal(firstDeposit.ok, true);
  const e1 = structuredClone(
    snapshotProfileDocument(service.snapshot(), owner.account.accountId).profile.bank.slots[0].equipmentEnvelopes[0],
  );
  assert.equal(service.bankWithdraw(owner.session.token, {
    items: [{itemId: e1.itemId, count: 1, envelopeId: e1.envelopeId, bankSlotIndex: 0}],
  }).ok, true);

  const importedE1 = currentImportedInstance(e1.envelopeId);
  const secondDeposit = service.bankDeposit(owner.session.token, {
    items: [{
      itemId: importedE1.instance.itemId,
      count: 1,
      instanceId: importedE1.instance.instanceId,
      sourceSlotIndex: importedE1.sourceSlotIndex,
      bankSlotIndex: 0,
    }],
  });
  assert.equal(secondDeposit.ok, true);
  const e2 = structuredClone(
    snapshotProfileDocument(service.snapshot(), owner.account.accountId).profile.bank.slots[0].equipmentEnvelopes[0],
  );
  assert.notEqual(e2.envelopeId, e1.envelopeId);
  assert.equal(service.bankWithdraw(owner.session.token, {
    items: [{itemId: e2.itemId, count: 1, envelopeId: e2.envelopeId, bankSlotIndex: 0}],
  }).ok, true);

  const importedE2 = currentImportedInstance(e2.envelopeId);
  const thirdDeposit = service.bankDeposit(owner.session.token, {
    items: [{
      itemId: importedE2.instance.itemId,
      count: 1,
      instanceId: importedE2.instance.instanceId,
      sourceSlotIndex: importedE2.sourceSlotIndex,
      bankSlotIndex: 0,
    }],
  });
  assert.equal(thirdDeposit.ok, true);
  const e3 = snapshotProfileDocument(service.snapshot(), owner.account.accountId)
    .profile.bank.slots[0].equipmentEnvelopes[0];
  assert.notEqual(e3.envelopeId, e2.envelopeId);
  const multiHopSnapshot = service.snapshot();
  assert.deepEqual(Object.keys(multiHopSnapshot.consumedEquipmentEnvelopes).sort(), [
    e1.envelopeId,
    e2.envelopeId,
  ].sort());

  multiHopSnapshot.mailMessages.mail_e1_stale_replay = {
    mailId: "mail_e1_stale_replay",
    senderAccountId: "system_replay_test",
    senderUsername: "system_replay_test",
    senderDisplayName: "回放测试",
    recipientAccountId: owner.account.accountId,
    recipientUsername: owner.account.username,
    recipientDisplayName: owner.account.displayName,
    title: "旧信封回放",
    body: "已消费的E1不能再次领取。",
    items: [{itemId: e1.itemId, count: 1}],
    equipmentEnvelopes: [e1],
    currency: {},
    createdAt: "2026-07-12T00:00:00.000Z",
    readAt: null,
    schemaVersion: 2,
  };
  const replayService = createAuthService({store: createMemoryAuthStore(multiHopSnapshot)});
  const beforeReplay = replayService.snapshot();
  const replay = replayService.claimMailAttachments(owner.session.token, "mail_e1_stale_replay");
  assert.equal(replay.ok, false);
  assert.equal(replay.code, "equipment_transfer_envelope_duplicate");
  assert.deepEqual(replayService.snapshot(), beforeReplay);
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
    {schemaVersion: 3, expectedCode: "market_listing_schema_future"},
    {schemaVersion: 2, expectedCode: "market_listing_schema_unsupported"},
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
    "policyId": "test_explicit_gm_v1",
    "expiresAt": "2099-01-01T00:00:00.000Z",
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
    "username": "tradeok_b",
    "offerStoneCoins": 30,
    "offerItems": [{"itemId": "item_meat_small", "count": 2}],
  });
  assert.equal(proposal.ok, true);
  assert.equal(proposal.trade.offerStoneCoins, 30);

  const betaState = service.tradeState(beta.session.token);
  assert.equal(betaState.ok, true);
  assert.equal(betaState.trades.received.length, 1);
  assert.equal(betaState.trades.received[0].tradeId, proposal.trade.tradeId);
  assert.equal(betaState.trades.received[0].fromUsername, "tradeok_a");

  const accepted = service.acceptTrade(beta.session.token, {
    "id": proposal.trade.tradeId,
    "counterStoneCoins": 10,
    "counterItems": [{"itemId": "capture_rope_basic", "count": 1}],
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

test("trade coin intents reject non-integers and aliases before any state change", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const alpha = service.register({username: "tradecoin_a", password: "test1234", displayName: "币值校验甲"});
  const beta = service.register({username: "tradecoin_b", password: "test1234", displayName: "币值校验乙"});
  seedBackpack(service, alpha.session.token, [{itemId: "item_meat_small", count: 2}]);
  assert.equal(service.updatePlayerPosition(alpha.session.token, {mapId: "firebud_training_yard", cellX: 10, cellY: 10, facing: "east", moving: false}).ok, true);
  assert.equal(service.updatePlayerPosition(beta.session.token, {mapId: "firebud_training_yard", cellX: 11, cellY: 10, facing: "west", moving: false}).ok, true);

  const invalidProposal = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradecoin_b",
    items: [{itemId: "item_meat_small", count: 1}],
    stoneCoins: "not-a-number",
  });
  assert.equal(invalidProposal.ok, false);
  assert.equal(invalidProposal.code, "trade_stone_coins_invalid");
  assert.deepEqual(service.snapshot().tradeOffers, {});
  for (const invalidAmount of [Number.NaN, 1.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
    const rejected = service.proposeTrade(alpha.session.token, {
      targetUsername: "tradecoin_b",
      items: [{itemId: "item_meat_small", count: 1}],
      stoneCoins: invalidAmount,
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, "trade_stone_coins_invalid");
    assert.deepEqual(service.snapshot().tradeOffers, {});
  }
  const duplicateItemAliases = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradecoin_b",
    items: [{itemId: "item_meat_small", count: 1}],
    offerItems: [{itemId: "item_meat_small", count: 1}],
  });
  assert.equal(duplicateItemAliases.ok, false);
  assert.equal(duplicateItemAliases.code, "trade_intent_alias_conflict");
  const injectedRoot = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradecoin_b",
    items: [{itemId: "item_meat_small", count: 1}],
    equipmentEnvelope: {schemaVersion: 1},
  });
  assert.equal(injectedRoot.ok, false);
  assert.equal(injectedRoot.code, "trade_intent_invalid");
  assert.deepEqual(service.snapshot().tradeOffers, {});

  const proposal = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradecoin_b",
    items: [{itemId: "item_meat_small", count: 1}],
  });
  assert.equal(proposal.ok, true);
  const beforeAlpha = service.getProfile(alpha.session.token);
  const beforeBeta = service.getProfile(beta.session.token);
  const ledgerBefore = structuredClone(service.snapshot().consumedEquipmentEnvelopes);
  const invalidAccept = service.acceptTrade(beta.session.token, {
    tradeId: proposal.trade.tradeId,
    stoneCoins: "not-a-number",
  });
  assert.equal(invalidAccept.ok, false);
  assert.equal(invalidAccept.code, "trade_stone_coins_invalid");
  assert.deepEqual(service.getProfile(alpha.session.token), beforeAlpha);
  assert.deepEqual(service.getProfile(beta.session.token), beforeBeta);
  assert.deepEqual(service.snapshot().consumedEquipmentEnvelopes, ledgerBefore);
  assert.ok(service.snapshot().tradeOffers[proposal.trade.tradeId]);

  const injectedAcceptRoot = service.acceptTrade(beta.session.token, {
    tradeId: proposal.trade.tradeId,
    equipmentEnvelope: {schemaVersion: 1},
  });
  assert.equal(injectedAcceptRoot.ok, false);
  assert.equal(injectedAcceptRoot.code, "trade_intent_invalid");
  assert.deepEqual(service.getProfile(alpha.session.token), beforeAlpha);
  assert.deepEqual(service.getProfile(beta.session.token), beforeBeta);
  assert.ok(service.snapshot().tradeOffers[proposal.trade.tradeId]);

  const conflictingAliases = service.acceptTrade(beta.session.token, {
    tradeId: proposal.trade.tradeId,
    stoneCoins: 1,
    counterStoneCoins: 2,
  });
  assert.equal(conflictingAliases.ok, false);
  assert.equal(conflictingAliases.code, "trade_stone_coins_invalid");
  assert.deepEqual(service.getProfile(alpha.session.token), beforeAlpha);
  assert.deepEqual(service.getProfile(beta.session.token), beforeBeta);
  assert.ok(service.snapshot().tradeOffers[proposal.trade.tradeId]);
});

test("equipment trades require exact instance selection and keep reservations private", () => {
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
  assert.equal(proposal.code, "trade_equipment_selection_required");
  const alphaAfterProposal = seedService.getProfile(alpha.session.token);
  assert.equal(alphaAfterProposal.profileSummary.profileRevision, alphaBeforeProposal.profileSummary.profileRevision);
  assert.equal(alphaAfterProposal.profile.stoneCoins, alphaBeforeProposal.profile.stoneCoins);
  assert.equal(profileItemCount(alphaAfterProposal.profile, "weapon_wooden_club"), 1);
  assert.deepEqual(alphaAfterProposal.profile.equipmentInstances, alphaBeforeProposal.profile.equipmentInstances);
  assert.deepEqual(seedService.snapshot().tradeOffers, {});

  const injectedEnvelope = seedService.proposeTrade(alpha.session.token, {
    targetUsername: "tradeequip_b",
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      instanceId: "equip_transfer_guard_1",
      sourceSlotIndex: 0,
      equipmentEnvelope: {schemaVersion: 1},
    }],
  });
  assert.equal(injectedEnvelope.ok, false);
  assert.equal(injectedEnvelope.code, "trade_equipment_selection_required");
  assert.deepEqual(seedService.snapshot().tradeOffers, {});

  const exactProposal = seedService.proposeTrade(alpha.session.token, {
    targetUsername: "tradeequip_b",
    stoneCoins: 10,
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      instanceId: "equip_transfer_guard_1",
      sourceSlotIndex: 0,
    }],
  });
  assert.equal(exactProposal.ok, true);
  assert.equal(exactProposal.trade.schemaVersion, 2);
  assert.deepEqual(exactProposal.trade.offerItems, [{itemId: "weapon_wooden_club", count: 1}]);
  assert.equal(Object.hasOwn(exactProposal.trade, "offerEquipmentReservations"), false);
  assert.equal(JSON.stringify(exactProposal).includes("equip_transfer_guard_1"), false);
  assert.equal(JSON.stringify(exactProposal).includes("stateFingerprint"), false);
  const privateOffer = seedService.snapshot().tradeOffers[exactProposal.trade.tradeId];
  assert.equal(privateOffer.offerEquipmentReservations.length, 1);
  assert.equal(privateOffer.offerEquipmentReservations[0].instanceId, "equip_transfer_guard_1");
  assert.match(privateOffer.offerEquipmentReservations[0].stateFingerprint, /^[a-f0-9]{64}$/);

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
  assert.equal(counterAccept.code, "trade_equipment_selection_required");
  const giverAfterCounter = counterSeedService.getProfile(giver.session.token);
  const accepterAfterCounter = counterSeedService.getProfile(accepter.session.token);
  assert.equal(giverAfterCounter.profileSummary.profileRevision, giverBeforeCounter.profileSummary.profileRevision);
  assert.equal(accepterAfterCounter.profileSummary.profileRevision, accepterBeforeCounter.profileSummary.profileRevision);
  assert.equal(profileItemCount(giverAfterCounter.profile, "item_meat_small"), 2);
  assert.equal(profileItemCount(accepterAfterCounter.profile, "weapon_wooden_club"), 1);
  assert.ok(counterSeedService.snapshot().tradeOffers[normalProposal.trade.tradeId]);
});

test("equipment trade accept atomically swaps exact states, ordinary items, and coins", () => {
  const store = createCountingAuthStore();
  const service = createAuthService({store});
  const alpha = service.register({username: "tradeequipmix_a", password: "test1234", displayName: "装备混合甲"});
  const beta = service.register({username: "tradeequipmix_b", password: "test1234", displayName: "装备混合乙"});
  seedBackpackEquipment(service, alpha.session.token, "weapon_wooden_club", {
    durability: 23,
    enhancement: {itemId: "weapon_wooden_club", level: 3, history: [{level: 3}]},
    futureAffixes: [{id: "alpha_affix", value: 7}],
  });
  seedBackpackEquipment(service, beta.session.token, "weapon_stone_dagger", {
    durability: 17,
    enhancement: {itemId: "weapon_stone_dagger", level: 1, history: [{level: 1}]},
    futureAffixes: [{id: "beta_affix", value: 4}],
  });
  for (const token of [alpha.session.token, beta.session.token]) {
    const current = service.getProfile(token);
    const profile = current.profile;
    profile.backpackSlots[1] = token === alpha.session.token
      ? {itemId: "item_meat_small", count: 3}
      : {itemId: "capture_rope_basic", count: 2};
    assert.equal(service.saveProfile(token, {
      expectedRevision: current.profileSummary.profileRevision,
      profile,
    }).ok, true);
  }
  assert.equal(service.updatePlayerPosition(alpha.session.token, {mapId: "firebud_training_yard", cellX: 30, cellY: 30, facing: "east", moving: false}).ok, true);
  assert.equal(service.updatePlayerPosition(beta.session.token, {mapId: "firebud_training_yard", cellX: 31, cellY: 30, facing: "west", moving: false}).ok, true);

  const beforeAlpha = service.getProfile(alpha.session.token);
  const beforeBeta = service.getProfile(beta.session.token);
  const proposal = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradeequipmix_b",
    stoneCoins: 30,
    items: [
      {itemId: "weapon_wooden_club", count: 1, instanceId: "equip_transfer_guard_1", sourceSlotIndex: 0},
      {itemId: "item_meat_small", count: 2},
    ],
  });
  assert.equal(proposal.ok, true);
  const writesBeforeAccept = store.counts.saves;

  const accepted = service.acceptTrade(beta.session.token, {
    tradeId: proposal.trade.tradeId,
    stoneCoins: 10,
    items: [
      {itemId: "weapon_stone_dagger", count: 1, instanceId: "equip_transfer_guard_1", sourceSlotIndex: 0},
      {itemId: "capture_rope_basic", count: 1},
    ],
  });
  assert.equal(accepted.ok, true);
  assert.equal(store.counts.saves, writesBeforeAccept + 1);
  assert.equal(accepted.trade.schemaVersion, 2);
  assert.equal(accepted.profileSummary.profileRevision, beforeBeta.profileSummary.profileRevision + 1);
  assert.equal(accepted.otherProfileSummary.profileRevision, beforeAlpha.profileSummary.profileRevision + 1);
  assert.equal(accepted.profile.stoneCoins, beforeBeta.profile.stoneCoins + 20);
  assert.equal(profileItemCount(accepted.profile, "item_meat_small"), 2);
  assert.equal(profileItemCount(accepted.profile, "capture_rope_basic"), 1);
  assert.equal(JSON.stringify(accepted).includes("offerEquipmentReservations"), false);
  assert.equal(JSON.stringify(accepted).includes("stateFingerprint"), false);
  assert.equal(JSON.stringify(accepted).includes("transferProvenance"), false);

  const snapshot = service.snapshot();
  assert.equal(Object.hasOwn(snapshot.tradeOffers, proposal.trade.tradeId), false);
  const alphaInternal = snapshotProfileDocument(snapshot, alpha.account.accountId).profile;
  const betaInternal = snapshotProfileDocument(snapshot, beta.account.accountId).profile;
  assert.equal(Object.hasOwn(alphaInternal.equipmentInstances, "equip_transfer_guard_1"), false);
  assert.equal(Object.hasOwn(betaInternal.equipmentInstances, "equip_transfer_guard_1"), false);
  const alphaReceived = Object.values(alphaInternal.equipmentInstances).find((entry) => entry.itemId === "weapon_stone_dagger");
  const betaReceived = Object.values(betaInternal.equipmentInstances).find((entry) => entry.itemId === "weapon_wooden_club");
  assert.ok(alphaReceived);
  assert.ok(betaReceived);
  assert.notEqual(alphaReceived.instanceId, "equip_transfer_guard_1");
  assert.notEqual(betaReceived.instanceId, "equip_transfer_guard_1");
  assert.equal(alphaReceived.durability, 17);
  assert.equal(alphaReceived.enhancement.level, 1);
  assert.deepEqual(alphaReceived.futureAffixes, [{id: "beta_affix", value: 4}]);
  assert.equal(betaReceived.durability, 23);
  assert.equal(betaReceived.enhancement.level, 3);
  assert.deepEqual(betaReceived.futureAffixes, [{id: "alpha_affix", value: 7}]);
  assert.match(alphaReceived.transferProvenance.originEnvelopeId, /^eqx_trade_/);
  assert.match(betaReceived.transferProvenance.originEnvelopeId, /^eqx_trade_/);
  assert.equal(Object.hasOwn(snapshot.consumedEquipmentEnvelopes, alphaReceived.transferProvenance.originEnvelopeId), true);
  assert.equal(Object.hasOwn(snapshot.consumedEquipmentEnvelopes, betaReceived.transferProvenance.originEnvelopeId), true);

  const duplicate = service.acceptTrade(beta.session.token, {tradeId: proposal.trade.tradeId});
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "trade_offer_missing");
});

test("equipment trade preserves a prior consumed origin and consumes the new transfer envelope", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const alpha = service.register({username: "tradeorigin_a", password: "test1234", displayName: "来源延续甲"});
  const beta = service.register({username: "tradeorigin_b", password: "test1234", displayName: "来源延续乙"});
  seedBackpackEquipment(service, alpha.session.token);
  const deposited = service.bankDeposit(alpha.session.token, {
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      instanceId: "equip_transfer_guard_1",
      sourceSlotIndex: 0,
      bankSlotIndex: 0,
    }],
  });
  assert.equal(deposited.ok, true);
  const priorEnvelopeId = deposited.bank.slots[0].equipmentEnvelopes[0].envelopeId;
  const withdrawn = service.bankWithdraw(alpha.session.token, {
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      envelopeId: priorEnvelopeId,
      bankSlotIndex: 0,
      targetSlotIndex: 0,
    }],
  });
  assert.equal(withdrawn.ok, true);
  const afterWithdraw = service.snapshot();
  const alphaProfile = snapshotProfileDocument(afterWithdraw, alpha.account.accountId).profile;
  const imported = Object.values(alphaProfile.equipmentInstances).find((entry) => (
    entry.transferProvenance && entry.transferProvenance.originEnvelopeId === priorEnvelopeId
  ));
  assert.ok(imported);
  assert.equal(Object.hasOwn(afterWithdraw.consumedEquipmentEnvelopes, priorEnvelopeId), true);
  assert.equal(service.updatePlayerPosition(alpha.session.token, {mapId: "firebud_training_yard", cellX: 10, cellY: 10, facing: "east", moving: false}).ok, true);
  assert.equal(service.updatePlayerPosition(beta.session.token, {mapId: "firebud_training_yard", cellX: 11, cellY: 10, facing: "west", moving: false}).ok, true);
  const proposal = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradeorigin_b",
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      instanceId: imported.instanceId,
      sourceSlotIndex: 0,
    }],
  });
  assert.equal(proposal.ok, true);
  assert.equal(service.acceptTrade(beta.session.token, {tradeId: proposal.trade.tradeId}).ok, true);

  const settled = service.snapshot();
  const betaProfile = snapshotProfileDocument(settled, beta.account.accountId).profile;
  const received = Object.values(betaProfile.equipmentInstances).find((entry) => entry.itemId === "weapon_wooden_club");
  assert.ok(received);
  const currentEnvelopeId = received.transferProvenance.originEnvelopeId;
  assert.notEqual(currentEnvelopeId, priorEnvelopeId);
  assert.deepEqual(Object.keys(settled.consumedEquipmentEnvelopes).sort(), [
    priorEnvelopeId,
    currentEnvelopeId,
  ].sort());
});

test("equipment trade reservation becomes stale without consuming or deleting the offer", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const alpha = service.register({username: "tradestale_a", password: "test1234", displayName: "预约变化甲"});
  const beta = service.register({username: "tradestale_b", password: "test1234", displayName: "预约变化乙"});
  seedBackpackEquipment(service, alpha.session.token);
  assert.equal(service.updatePlayerPosition(alpha.session.token, {mapId: "firebud_training_yard", cellX: 10, cellY: 10, facing: "east", moving: false}).ok, true);
  assert.equal(service.updatePlayerPosition(beta.session.token, {mapId: "firebud_training_yard", cellX: 11, cellY: 10, facing: "west", moving: false}).ok, true);
  const proposal = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradestale_b",
    items: [{itemId: "weapon_wooden_club", count: 1, instanceId: "equip_transfer_guard_1", sourceSlotIndex: 0}],
  });
  assert.equal(proposal.ok, true);
  const moved = service.bankDeposit(alpha.session.token, {
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      instanceId: "equip_transfer_guard_1",
      sourceSlotIndex: 0,
      bankSlotIndex: 0,
    }],
  });
  assert.equal(moved.ok, true);
  const beforeAlpha = service.getProfile(alpha.session.token);
  const beforeBeta = service.getProfile(beta.session.token);
  const ledgerBefore = structuredClone(service.snapshot().consumedEquipmentEnvelopes);

  const accepted = service.acceptTrade(beta.session.token, {tradeId: proposal.trade.tradeId});
  assert.equal(accepted.ok, false);
  assert.equal(accepted.code, "trade_equipment_reservation_changed");
  const afterAlpha = service.getProfile(alpha.session.token);
  const afterBeta = service.getProfile(beta.session.token);
  assert.deepEqual(afterAlpha.profile, beforeAlpha.profile);
  assert.deepEqual(afterBeta.profile, beforeBeta.profile);
  assert.deepEqual(service.snapshot().consumedEquipmentEnvelopes, ledgerBefore);
  assert.ok(service.snapshot().tradeOffers[proposal.trade.tradeId]);
});

test("equipment trade reservation fingerprint detects state changes", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const alpha = service.register({username: "tradefinger_a", password: "test1234", displayName: "指纹变化甲"});
  const beta = service.register({username: "tradefinger_b", password: "test1234", displayName: "指纹变化乙"});
  seedBackpackEquipment(service, alpha.session.token);
  assert.equal(service.updatePlayerPosition(alpha.session.token, {mapId: "firebud_training_yard", cellX: 10, cellY: 10, facing: "east", moving: false}).ok, true);
  assert.equal(service.updatePlayerPosition(beta.session.token, {mapId: "firebud_training_yard", cellX: 11, cellY: 10, facing: "west", moving: false}).ok, true);
  const proposal = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradefinger_b",
    items: [{itemId: "weapon_wooden_club", count: 1, instanceId: "equip_transfer_guard_1", sourceSlotIndex: 0}],
  });
  assert.equal(proposal.ok, true);
  const current = service.getProfile(alpha.session.token);
  const changedProfile = current.profile;
  changedProfile.equipmentInstances.equip_transfer_guard_1.durability = 29;
  assert.equal(service.saveProfile(alpha.session.token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile: changedProfile,
  }).ok, true);
  const alphaBeforeAccept = service.getProfile(alpha.session.token);
  const betaBeforeAccept = service.getProfile(beta.session.token);

  const accepted = service.acceptTrade(beta.session.token, {tradeId: proposal.trade.tradeId});
  assert.equal(accepted.ok, false);
  assert.equal(accepted.code, "trade_equipment_reservation_changed");
  assert.deepEqual(service.getProfile(alpha.session.token).profile, alphaBeforeAccept.profile);
  assert.deepEqual(service.getProfile(beta.session.token).profile, betaBeforeAccept.profile);
  assert.ok(service.snapshot().tradeOffers[proposal.trade.tradeId]);
});

test("one equipment instance cannot back two active trade offers", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const alpha = service.register({username: "tradereserve_a", password: "test1234", displayName: "单实例预约甲"});
  const beta = service.register({username: "tradereserve_b", password: "test1234", displayName: "单实例预约乙"});
  const gamma = service.register({username: "tradereserve_c", password: "test1234", displayName: "单实例预约丙"});
  seedBackpackEquipment(service, alpha.session.token);
  for (const [token, cellX] of [
    [alpha.session.token, 10],
    [beta.session.token, 11],
    [gamma.session.token, 9],
  ]) {
    assert.equal(service.updatePlayerPosition(token, {
      mapId: "firebud_training_yard", cellX, cellY: 10, facing: "east", moving: false,
    }).ok, true);
  }
  const selection = [{
    itemId: "weapon_wooden_club",
    count: 1,
    instanceId: "equip_transfer_guard_1",
    sourceSlotIndex: 0,
  }];
  const first = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradereserve_b",
    items: selection,
  });
  assert.equal(first.ok, true);
  const duplicate = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradereserve_c",
    items: selection,
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "trade_equipment_already_reserved");
  assert.equal(service.cancelTrade(alpha.session.token, {tradeId: first.trade.tradeId}).ok, true);
  const released = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradereserve_c",
    items: selection,
  });
  assert.equal(released.ok, true);
});

test("trade accept rechecks the initiator offline hang lock", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const alpha = service.register({username: "tradeoffline_a", password: "test1234", displayName: "离线锁甲"});
  const beta = service.register({username: "tradeoffline_b", password: "test1234", displayName: "离线锁乙"});
  seedBackpack(service, alpha.session.token, [{itemId: "item_meat_small", count: 2}]);
  assert.equal(service.updatePlayerPosition(alpha.session.token, {mapId: "firebud_training_yard", cellX: 10, cellY: 10, facing: "east", moving: false}).ok, true);
  assert.equal(service.updatePlayerPosition(beta.session.token, {mapId: "firebud_training_yard", cellX: 11, cellY: 10, facing: "west", moving: false}).ok, true);
  const proposal = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradeoffline_b",
    items: [{itemId: "item_meat_small", count: 1}],
  });
  assert.equal(proposal.ok, true);
  const current = service.getProfile(alpha.session.token);
  const activeProfile = current.profile;
  activeProfile.offlineHang = {
    session: {status: "active", schemaVersion: 1},
    ledger: [],
    schemaVersion: 1,
  };
  assert.equal(service.saveProfile(alpha.session.token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile: activeProfile,
  }).ok, true);

  const accepted = service.acceptTrade(beta.session.token, {tradeId: proposal.trade.tradeId});
  assert.equal(accepted.ok, false);
  assert.equal(accepted.code, "offline_hang_profile_mutation_locked");
  assert.ok(service.snapshot().tradeOffers[proposal.trade.tradeId]);
});

test("equipment trade target capacity failure rolls back both profiles and ledger", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const alpha = service.register({username: "tradefull_a", password: "test1234", displayName: "容量回滚甲"});
  const beta = service.register({username: "tradefull_b", password: "test1234", displayName: "容量回滚乙"});
  seedBackpackEquipment(service, alpha.session.token);
  seedBackpack(service, beta.session.token, Array.from({length: 15}, () => ({itemId: "item_meat_small", count: 99})));
  assert.equal(service.updatePlayerPosition(alpha.session.token, {mapId: "firebud_training_yard", cellX: 10, cellY: 10, facing: "east", moving: false}).ok, true);
  assert.equal(service.updatePlayerPosition(beta.session.token, {mapId: "firebud_training_yard", cellX: 11, cellY: 10, facing: "west", moving: false}).ok, true);
  const proposal = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradefull_b",
    items: [{itemId: "weapon_wooden_club", count: 1, instanceId: "equip_transfer_guard_1", sourceSlotIndex: 0}],
  });
  assert.equal(proposal.ok, true);
  const beforeAlpha = service.getProfile(alpha.session.token);
  const beforeBeta = service.getProfile(beta.session.token);
  const ledgerBefore = structuredClone(service.snapshot().consumedEquipmentEnvelopes);

  const accepted = service.acceptTrade(beta.session.token, {tradeId: proposal.trade.tradeId});
  assert.equal(accepted.ok, false);
  assert.equal(accepted.code, "trade_acceptor_backpack_full");
  assert.deepEqual(service.getProfile(alpha.session.token).profile, beforeAlpha.profile);
  assert.deepEqual(service.getProfile(beta.session.token).profile, beforeBeta.profile);
  assert.deepEqual(service.snapshot().consumedEquipmentEnvelopes, ledgerBefore);
  assert.ok(service.snapshot().tradeOffers[proposal.trade.tradeId]);
});

test("runtime trade proposal and cancellation do not create persistent writes", () => {
  const store = createCountingAuthStore();
  const service = createAuthService({store});
  const alpha = service.register({username: "tradewrite_a", password: "test1234", displayName: "运行时报价甲"});
  const beta = service.register({username: "tradewrite_b", password: "test1234", displayName: "运行时报价乙"});
  seedBackpack(service, alpha.session.token, [{itemId: "item_meat_small", count: 2}]);
  assert.equal(service.updatePlayerPosition(alpha.session.token, {mapId: "firebud_training_yard", cellX: 10, cellY: 10, facing: "east", moving: false}).ok, true);
  assert.equal(service.updatePlayerPosition(beta.session.token, {mapId: "firebud_training_yard", cellX: 11, cellY: 10, facing: "west", moving: false}).ok, true);
  const beforeProposalWrites = store.counts.saves;
  const proposal = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradewrite_b",
    items: [{itemId: "item_meat_small", count: 1}],
  });
  assert.equal(proposal.ok, true);
  assert.equal(store.counts.saves, beforeProposalWrites);
  const pairDuplicate = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradewrite_b",
    items: [{itemId: "item_meat_small", count: 1}],
  });
  assert.equal(pairDuplicate.ok, false);
  assert.equal(pairDuplicate.code, "trade_offer_pair_pending");
  assert.equal(store.counts.saves, beforeProposalWrites);
  const cancelled = service.cancelTrade(alpha.session.token, {tradeId: proposal.trade.tradeId});
  assert.equal(cancelled.ok, true);
  assert.equal(store.counts.saves, beforeProposalWrites);
});

test("synchronous trade save failure leaves cache, ledger, and pending offer retryable", () => {
  const durableStore = createMemoryAuthStore();
  let failSaves = false;
  const store = {
    load: () => durableStore.load(),
    save(nextData) {
      if (failSaves) {
        throw new Error("forced synchronous trade save failure");
      }
      durableStore.save(nextData);
    },
  };
  const service = createAuthService({store});
  const alpha = service.register({username: "tradefail_a", password: "test1234", displayName: "保存失败甲"});
  const beta = service.register({username: "tradefail_b", password: "test1234", displayName: "保存失败乙"});
  seedBackpackEquipment(service, alpha.session.token);
  assert.equal(service.updatePlayerPosition(alpha.session.token, {mapId: "firebud_training_yard", cellX: 10, cellY: 10, facing: "east", moving: false}).ok, true);
  assert.equal(service.updatePlayerPosition(beta.session.token, {mapId: "firebud_training_yard", cellX: 11, cellY: 10, facing: "west", moving: false}).ok, true);
  const proposal = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradefail_b",
    items: [{itemId: "weapon_wooden_club", count: 1, instanceId: "equip_transfer_guard_1", sourceSlotIndex: 0}],
  });
  assert.equal(proposal.ok, true);
  const alphaBefore = service.getProfile(alpha.session.token);
  const betaBefore = service.getProfile(beta.session.token);
  const ledgerBefore = structuredClone(service.snapshot().consumedEquipmentEnvelopes);
  const durableBefore = durableStore.load();

  failSaves = true;
  assert.throws(
    () => service.acceptTrade(beta.session.token, {tradeId: proposal.trade.tradeId}),
    /forced synchronous trade save failure/,
  );
  failSaves = false;
  assert.deepEqual(service.getProfile(alpha.session.token).profile, alphaBefore.profile);
  assert.deepEqual(service.getProfile(beta.session.token).profile, betaBefore.profile);
  assert.deepEqual(service.snapshot().consumedEquipmentEnvelopes, ledgerBefore);
  assert.ok(service.snapshot().tradeOffers[proposal.trade.tradeId]);
  assert.deepEqual(durableStore.load(), durableBefore);

  const retried = service.acceptTrade(beta.session.token, {tradeId: proposal.trade.tradeId});
  assert.equal(retried.ok, true);
  assert.equal(Object.hasOwn(service.snapshot().tradeOffers, proposal.trade.tradeId), false);
});

test("trade offer ids fail closed after bounded collision retries", () => {
  let collisionMode = false;
  let serial = 0;
  const service = createAuthService({
    store: createMemoryAuthStore(),
    randomId: () => (collisionMode ? "fixed" : `setup_${++serial}`),
  });
  const alpha = service.register({username: "tradeid_a", password: "test1234", displayName: "编号碰撞甲"});
  const beta = service.register({username: "tradeid_b", password: "test1234", displayName: "编号碰撞乙"});
  const gamma = service.register({username: "tradeid_c", password: "test1234", displayName: "编号碰撞丙"});
  seedBackpack(service, alpha.session.token, [{itemId: "item_meat_small", count: 2}]);
  for (const [token, cellX] of [[alpha.session.token, 10], [beta.session.token, 11], [gamma.session.token, 9]]) {
    assert.equal(service.updatePlayerPosition(token, {
      mapId: "firebud_training_yard", cellX, cellY: 10, facing: "east", moving: false,
    }).ok, true);
  }
  collisionMode = true;
  const first = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradeid_b",
    items: [{itemId: "item_meat_small", count: 1}],
  });
  assert.equal(first.ok, true);
  assert.equal(first.trade.tradeId, "trade_fixed");
  const before = service.getProfile(alpha.session.token);
  const collision = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradeid_c",
    items: [{itemId: "item_meat_small", count: 1}],
  });
  assert.equal(collision.ok, false);
  assert.equal(collision.code, "trade_offer_id_unavailable");
  assert.deepEqual(service.getProfile(alpha.session.token), before);
  assert.deepEqual(Object.keys(service.snapshot().tradeOffers), [first.trade.tradeId]);
});

test("consumed trade envelope ids fail closed after bounded collision retries", () => {
  let collisionMode = false;
  let serial = 0;
  const service = createAuthService({
    store: createMemoryAuthStore(),
    randomId: () => (collisionMode ? "fixed" : `setup_${++serial}`),
  });
  const alpha = service.register({username: "tradeeqx_a", password: "test1234", displayName: "信封碰撞甲"});
  const beta = service.register({username: "tradeeqx_b", password: "test1234", displayName: "信封碰撞乙"});
  const gamma = service.register({username: "tradeeqx_c", password: "test1234", displayName: "信封碰撞丙"});
  seedBackpackEquipment(service, alpha.session.token);
  for (const [token, cellX] of [[alpha.session.token, 10], [beta.session.token, 11], [gamma.session.token, 9]]) {
    assert.equal(service.updatePlayerPosition(token, {
      mapId: "firebud_training_yard", cellX, cellY: 10, facing: "east", moving: false,
    }).ok, true);
  }
  collisionMode = true;
  const first = service.proposeTrade(alpha.session.token, {
    targetUsername: "tradeeqx_b",
    items: [{itemId: "weapon_wooden_club", count: 1, instanceId: "equip_transfer_guard_1", sourceSlotIndex: 0}],
  });
  assert.equal(first.ok, true);
  assert.equal(service.acceptTrade(beta.session.token, {tradeId: first.trade.tradeId}).ok, true);
  const afterFirst = service.snapshot();
  assert.deepEqual(Object.keys(afterFirst.consumedEquipmentEnvelopes), ["eqx_trade_fixed"]);
  const betaProfile = snapshotProfileDocument(afterFirst, beta.account.accountId).profile;
  const betaInstance = Object.values(betaProfile.equipmentInstances).find((entry) => entry.itemId === "weapon_wooden_club");
  const betaSourceSlotIndex = betaProfile.backpackSlots.findIndex((slot) => slot.itemId === "weapon_wooden_club");
  assert.ok(betaInstance);
  assert.equal(betaSourceSlotIndex >= 0, true);
  const second = service.proposeTrade(beta.session.token, {
    targetUsername: "tradeeqx_c",
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      instanceId: betaInstance.instanceId,
      sourceSlotIndex: betaSourceSlotIndex,
    }],
  });
  assert.equal(second.ok, true);
  const betaBefore = service.getProfile(beta.session.token);
  const gammaBefore = service.getProfile(gamma.session.token);
  const ledgerBefore = structuredClone(service.snapshot().consumedEquipmentEnvelopes);
  const collision = service.acceptTrade(gamma.session.token, {tradeId: second.trade.tradeId});
  assert.equal(collision.ok, false);
  assert.equal(collision.code, "trade_equipment_envelope_id_unavailable");
  assert.deepEqual(service.getProfile(beta.session.token), betaBefore);
  assert.deepEqual(service.getProfile(gamma.session.token), gammaBefore);
  assert.deepEqual(service.snapshot().consumedEquipmentEnvelopes, ledgerBefore);
  assert.ok(service.snapshot().tradeOffers[second.trade.tradeId]);
});

test("trade sender capacity bounds runtime offers without persistent writes", () => {
  const store = createCountingAuthStore();
  const service = createAuthService({store});
  const sender = service.register({username: "tradecap_sender", password: "test1234", displayName: "报价上限号"});
  seedBackpack(service, sender.session.token, [{itemId: "item_meat_small", count: 1}]);
  assert.equal(service.updatePlayerPosition(sender.session.token, {
    mapId: "firebud_training_yard", cellX: 10, cellY: 10, facing: "east", moving: false,
  }).ok, true);
  const targets = [];
  for (let index = 0; index < 9; index += 1) {
    const target = service.register({
      username: `tradecap_target_${index}`,
      password: "test1234",
      displayName: `上限目标${index}`,
    });
    assert.equal(service.updatePlayerPosition(target.session.token, {
      mapId: "firebud_training_yard", cellX: 11, cellY: 10, facing: "west", moving: false,
    }).ok, true);
    targets.push(target);
  }
  const writesBeforeOffers = store.counts.saves;
  for (const target of targets.slice(0, 8)) {
    const proposal = service.proposeTrade(sender.session.token, {
      targetUsername: target.account.username,
      items: [{itemId: "item_meat_small", count: 1}],
    });
    assert.equal(proposal.ok, true);
  }
  const rejected = service.proposeTrade(sender.session.token, {
    targetUsername: targets[8].account.username,
    items: [{itemId: "item_meat_small", count: 1}],
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "trade_offer_sender_limit");
  assert.equal(Object.keys(service.snapshot().tradeOffers).length, 8);
  assert.equal(store.counts.saves, writesBeforeOffers);
});
