"use strict";

const {
  assert,
  test,
  once,
  createAuthService,
  createMemoryAuthStore,
  createAsyncWriteAuthStore,
  createHttpServer,
  fetchJson,
  internalProfileForAccount,
} = require("../test-support/auth-service-test-context");
const {
  GM_PREPARE_QA_ASSETS_COMMAND_ID,
  QA_ASSETS_MANIFEST_ID,
  QA_ASSET_EQUIPMENT_PLAN,
  QA_ASSET_MANIFESTS_PROFILE_KEY,
  QA_ASSET_ORDINARY_TARGETS,
  QA_ASSET_ORDINARY_TARGET_QUANTITY,
  QA_ASSET_SAMPLE_MARKER_KEY,
  QA_ASSET_SOURCE,
  initialEnvelopeId,
} = require("../src/auth/gm-qa-assets");
const {loadBattleEquipmentCatalog} = require("../src/auth/battle-equipment-rules");
const {MAX_EQUIPMENT_INSTANCE_SERIAL} = require("../src/auth/equipment-profile-state");
const {validateEquipmentTransferEnvelope} = require("../src/auth/equipment-transfer-envelope");
const {publicProfile} = require("../src/auth/profile-visibility");

const COMMAND_ID = GM_PREPARE_QA_ASSETS_COMMAND_ID;
const MANIFEST_ID = QA_ASSETS_MANIFEST_ID;
const SUMMARY_KEYS = [
  "manifestId",
  "changed",
  "alreadyPrepared",
  "catalogItemKinds",
  "ordinaryItemKinds",
  "equipmentItemKinds",
  "ordinaryTargetQuantity",
  "equipmentSampleCount",
  "ordinaryItemKindsPresent",
  "ordinaryItemKindsMissing",
  "bankEquipmentSamplesPresent",
  "bankEquipmentSamplesMissing",
  "bankUnlockedTabs",
  "bankSlotCapacity",
  "bankUsedSlots",
  "bankFreeSlots",
  "reservedBankSlots",
  "profileRevisionBefore",
  "profileRevisionAfter",
  "schemaVersion",
].sort();
const equipmentCatalog = loadBattleEquipmentCatalog();

function registerGm(service, username, commandIds = [COMMAND_ID]) {
  const registered = service.register({username, password: "test1234", displayName: username});
  assert.equal(registered.ok, true);
  assert.equal(service.grantGm({
    username,
    commandIds,
    policyId: "test_explicit_gm_v1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    grantedBy: "gm_qa_assets_test",
  }).ok, true);
  return registered;
}

function currentProfile(service, token) {
  const result = service.getProfile(token);
  assert.equal(result.ok, true);
  return result;
}

function accountProfile(snapshot, accountId) {
  const binding = snapshot.profileBindings[accountId];
  return snapshot.profiles[binding.playerId].profile;
}

function bankItemCount(bank, itemId) {
  return (Array.isArray(bank && bank.items) ? bank.items : []).reduce((sum, entry) => (
    String(entry && entry.itemId || "") === itemId ? sum + Number(entry.count || 0) : sum
  ), 0);
}

function backpackItemCount(profile, itemId) {
  return (Array.isArray(profile && profile.backpackSlots) ? profile.backpackSlots : []).reduce((sum, entry) => (
    String(entry && entry.itemId || "") === itemId ? sum + Number(entry.count || 0) : sum
  ), 0);
}

function bankUsedSlots(bank) {
  return bank.slots.filter((slot) => String(slot && slot.itemId || "") !== "").length;
}

function internalQaEnvelopes(profile) {
  return profile.bank.slots.flatMap((slot, bankSlotIndex) => (
    (Array.isArray(slot && slot.equipmentEnvelopes) ? slot.equipmentEnvelopes : [])
      .filter((envelope) => envelope.instanceState && envelope.instanceState[QA_ASSET_SAMPLE_MARKER_KEY])
      .map((envelope) => ({bankSlotIndex, envelope}))
  ));
}

function assertNoPrivateQaAssetFields(value) {
  const text = JSON.stringify(value);
  for (const forbidden of [QA_ASSET_MANIFESTS_PROFILE_KEY, QA_ASSET_SAMPLE_MARKER_KEY, QA_ASSET_SOURCE]) {
    assert.equal(text.includes(forbidden), false, `public response leaked ${forbidden}`);
  }
}

function emptyBank() {
  return {
    stoneCoins: 0,
    items: [],
    slots: Array.from({length: 90}, () => ({})),
    unlockedTabs: 1,
    schemaVersion: 2,
  };
}

function seedOccupiedBank(service, gm, occupiedSlots) {
  const current = currentProfile(service, gm.session.token);
  const profile = structuredClone(current.profile);
  profile.bank = emptyBank();
  for (let index = 0; index < occupiedSlots; index += 1) {
    profile.bank.slots[index] = {itemId: "tutorial_worn_hide", count: 1};
  }
  profile.bank.items = occupiedSlots > 0
    ? [{itemId: "tutorial_worn_hide", count: occupiedSlots}]
    : [];
  const saved = service.saveProfile(gm.session.token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile,
  });
  assert.equal(saved.ok, true);
  return saved;
}

test("GM QA asset command requires current-account authorization and exact fixed payload", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const player = service.register({username: "qaassetplayer", password: "test1234"});
  const before = currentProfile(service, player.session.token);

  assert.equal(service.prepareGmQaAssets(player.session.token, {manifestId: MANIFEST_ID}).code, "gm_denied");
  assert.equal(service.grantGm({
    username: "qaassetplayer",
    commandIds: ["gm_map"],
    policyId: "test_explicit_gm_v1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    grantedBy: "gm_qa_assets_test",
  }).ok, true);
  assert.equal(service.prepareGmQaAssets(player.session.token, {manifestId: MANIFEST_ID}).code, "command_denied");
  assert.equal(service.grantGm({
    username: "qaassetplayer",
    commandIds: [COMMAND_ID],
    policyId: "test_explicit_gm_v1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    grantedBy: "gm_qa_assets_test",
  }).ok, true);

  for (const payload of [
    {},
    {manifestId: "qa_assets_v2"},
    {manifestId: MANIFEST_ID, targetUsername: "other"},
    {manifestId: MANIFEST_ID, itemId: "weapon_shadow_group_bow"},
    {manifestId: MANIFEST_ID, quantity: 999},
    {manifestId: MANIFEST_ID, bankTabs: 99},
  ]) {
    const denied = service.prepareGmQaAssets(player.session.token, payload);
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "gm_qa_assets_payload_invalid");
  }
  assert.equal(service.prepareGmQaAssets("", {manifestId: MANIFEST_ID}).code, "session_missing");
  const after = currentProfile(service, player.session.token);
  assert.equal(after.profileSummary.profileRevision, before.profileSummary.profileRevision);
  assert.deepEqual(after.profile, before.profile);
});

test("fixed manifest uses all 76 catalog ids, formal equipment instances, and restores staging state", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(service, "qaassetmanifest", [COMMAND_ID, "gm_prepare_qa_profile"]);
  assert.equal(service.prepareGmQaProfile(gm.session.token, {manifestId: "qa_core_v1"}).ok, true);
  const bought = service.shopTransaction(gm.session.token, {
    mode: "buy",
    shopId: "firebud_equipment_shop",
    itemId: "weapon_wooden_club",
    amount: 1,
  });
  assert.equal(bought.ok, true);
  const equipped = service.equipmentEquip(gm.session.token, {itemId: "weapon_wooden_club"});
  assert.equal(equipped.ok, true);
  const boughtPill = service.shopTransaction(gm.session.token, {
    mode: "buy",
    shopId: "firebud_diamond_shop",
    itemId: "item_exp_pill_lv1",
    amount: 1,
  });
  assert.equal(boughtPill.ok, true);
  const before = structuredClone(internalProfileForAccount(service, gm.account.accountId));
  const beforeRevision = boughtPill.profileSummary.profileRevision;
  assert.equal(backpackItemCount(before, "item_heal_single_5"), 20);
  assert.equal(backpackItemCount(before, "item_exp_pill_lv1"), 1);

  const prepared = service.prepareGmQaAssets(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(prepared.ok, true);
  assert.deepEqual(Object.keys(prepared.result.summary).sort(), SUMMARY_KEYS);
  assert.deepEqual(prepared.result.summary, {
    manifestId: MANIFEST_ID,
    changed: true,
    alreadyPrepared: false,
    catalogItemKinds: 76,
    ordinaryItemKinds: 45,
    equipmentItemKinds: 31,
    ordinaryTargetQuantity: 83,
    equipmentSampleCount: 31,
    ordinaryItemKindsPresent: 45,
    ordinaryItemKindsMissing: 0,
    bankEquipmentSamplesPresent: 31,
    bankEquipmentSamplesMissing: 0,
    bankUnlockedTabs: 6,
    bankSlotCapacity: 90,
    bankUsedSlots: 76,
    bankFreeSlots: 14,
    reservedBankSlots: 1,
    profileRevisionBefore: beforeRevision,
    profileRevisionAfter: beforeRevision + 1,
    schemaVersion: 1,
  });
  assertNoPrivateQaAssetFields(prepared);
  assert.equal(Object.hasOwn(prepared.profile, QA_ASSET_MANIFESTS_PROFILE_KEY), false);

  const internal = internalProfileForAccount(service, gm.account.accountId);
  assert.equal(internal.bank.schemaVersion, 2);
  assert.equal(internal.bank.unlockedTabs, 6);
  assert.equal(internal.bank.slots.length, 90);
  assert.equal(bankUsedSlots(internal.bank), 76);
  assert.equal(internal.nextEquipmentInstanceSerial, before.nextEquipmentInstanceSerial + 31);
  assert.deepEqual(internal.backpackSlots, before.backpackSlots);
  assert.deepEqual(internal.captureTools, before.captureTools);
  assert.deepEqual(internal.equipmentInstances, before.equipmentInstances);
  assert.deepEqual(internal.equipmentSlotInstanceIds, before.equipmentSlotInstanceIds);
  assert.deepEqual(internal.equipmentSlots, before.equipmentSlots);
  assert.deepEqual(internal.equipmentDurability, before.equipmentDurability);
  assert.deepEqual(internal.equipmentEnhancement, before.equipmentEnhancement);
  assert.deepEqual(internal.player, before.player);
  assert.equal(internal.rebirthCount, before.rebirthCount);
  assert.ok(internal[QA_ASSET_MANIFESTS_PROFILE_KEY][MANIFEST_ID]);

  for (const target of QA_ASSET_ORDINARY_TARGETS) {
    assert.equal(bankItemCount(internal.bank, target.itemId), target.count, target.itemId);
  }
  assert.equal(bankItemCount(internal.bank, "item_heal_single_5"), 1);
  const envelopes = internalQaEnvelopes(internal);
  assert.equal(envelopes.length, 31);
  assert.equal(new Set(envelopes.map((entry) => entry.envelope.envelopeId)).size, 31);
  assert.equal(envelopes.every(({envelope}) => /^eqx_[a-f0-9]{40}$/.test(envelope.envelopeId)), true);
  assert.equal(envelopes.every(({envelope}) => !envelope.envelopeId.includes("qa")), true);
  assert.equal(new Set(envelopes.map((entry) => entry.envelope.instanceState[QA_ASSET_SAMPLE_MARKER_KEY].slotId)).size, 31);
  for (const {envelope} of envelopes) {
    const state = envelope.instanceState;
    const marker = state[QA_ASSET_SAMPLE_MARKER_KEY];
    assert.equal(state.source, QA_ASSET_SOURCE);
    assert.equal(marker.originalAccountId, gm.account.accountId);
    assert.equal(marker.originItemId, envelope.itemId);
    assert.equal(state.durability >= 0, true);
    assert.equal(state.enhancement && typeof state.enhancement === "object", true);
    assert.equal(state.wearCounters && typeof state.wearCounters === "object", true);
    assert.equal(state.expPillCharge && typeof state.expPillCharge === "object", true);
    assert.equal(validateEquipmentTransferEnvelope(envelope, equipmentCatalog).ok, true);
  }
  const catalogIds = new Set(require("../../../client/godot/data/bag_items.json").items.map((item) => item.id));
  assert.deepEqual(
    new Set([...QA_ASSET_ORDINARY_TARGETS.map((entry) => entry.itemId), ...QA_ASSET_EQUIPMENT_PLAN.map((entry) => entry.itemId)]),
    catalogIds,
  );
  assert.equal(QA_ASSET_ORDINARY_TARGET_QUANTITY, 83);
});

test("existing bank assets pass with one reserved slot and fail atomically when the reserve is exhausted", () => {
  const passService = createAuthService({store: createMemoryAuthStore()});
  const passGm = registerGm(passService, "qaassetreservepass");
  seedOccupiedBank(passService, passGm, 14);
  const passBefore = structuredClone(internalProfileForAccount(passService, passGm.account.accountId));
  const passed = passService.prepareGmQaAssets(passGm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(passed.ok, true);
  assert.equal(passed.result.summary.bankUsedSlots, 89);
  assert.equal(passed.result.summary.bankFreeSlots, 1);
  assert.deepEqual(
    internalProfileForAccount(passService, passGm.account.accountId).bank.slots.slice(0, 14),
    passBefore.bank.slots.slice(0, 14),
  );

  const blockedService = createAuthService({store: createMemoryAuthStore()});
  const blockedGm = registerGm(blockedService, "qaassetreservefull");
  seedOccupiedBank(blockedService, blockedGm, 15);
  const beforeProfile = structuredClone(internalProfileForAccount(blockedService, blockedGm.account.accountId));
  const beforeRevision = currentProfile(blockedService, blockedGm.session.token).profileSummary.profileRevision;
  const blocked = blockedService.prepareGmQaAssets(blockedGm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "gm_qa_assets_capacity_full");
  assert.equal(currentProfile(blockedService, blockedGm.session.token).profileSummary.profileRevision, beforeRevision);
  assert.deepEqual(internalProfileForAccount(blockedService, blockedGm.account.accountId), beforeProfile);
});

test("a full backpack blocks the single-slot staging path without changing bank or equipment", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(service, "qaassetfullbag");
  const current = currentProfile(service, gm.session.token);
  const profile = structuredClone(current.profile);
  profile.backpackExtraSlots = 5;
  profile.backpackSlots = Array.from({length: 20}, () => ({itemId: "tutorial_worn_hide", count: 20}));
  assert.equal(service.saveProfile(gm.session.token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile,
  }).ok, true);
  const before = structuredClone(internalProfileForAccount(service, gm.account.accountId));
  const revision = currentProfile(service, gm.session.token).profileSummary.profileRevision;

  const blocked = service.prepareGmQaAssets(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "gm_qa_assets_backpack_staging_full");
  assert.equal(currentProfile(service, gm.session.token).profileSummary.profileRevision, revision);
  assert.deepEqual(internalProfileForAccount(service, gm.account.accountId), before);
});

test("equipment serial exhaustion rejects the whole manifest without changing assets", () => {
  const seed = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(seed, "qaassetserial");
  const snapshot = seed.snapshot();
  const playerId = snapshot.profileBindings[gm.account.accountId].playerId;
  snapshot.profiles[playerId].profile.nextEquipmentInstanceSerial = MAX_EQUIPMENT_INSTANCE_SERIAL + 1;
  const beforeProfile = structuredClone(snapshot.profiles[playerId].profile);
  const beforeRevision = snapshot.profileBindings[gm.account.accountId].profileRevision;
  const service = createAuthService({store: createMemoryAuthStore(snapshot)});

  const blocked = service.prepareGmQaAssets(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "equipment_instance_serial_exhausted");
  assert.equal(service.snapshot().profileBindings[gm.account.accountId].profileRevision, beforeRevision);
  assert.deepEqual(service.snapshot().profiles[playerId].profile, beforeProfile);
});

test("permanent ledger reports current bank gaps and never reissues moved samples", () => {
  const base = createMemoryAuthStore();
  const service = createAuthService({store: base});
  const gm = registerGm(service, "qaassetledger");
  const first = service.prepareGmQaAssets(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(first.ok, true);
  const internal = internalProfileForAccount(service, gm.account.accountId);
  const equipmentEntry = internalQaEnvelopes(internal).find(({envelope}) => envelope.itemId === "weapon_wooden_club");
  const ordinarySlotIndex = internal.bank.slots.findIndex((slot) => slot.itemId === "ring_earth_trial");
  assert.ok(equipmentEntry);
  assert.ok(ordinarySlotIndex >= 0);
  const withdrawn = service.bankWithdraw(gm.session.token, {
    items: [
      {itemId: "ring_earth_trial", count: 1, bankSlotIndex: ordinarySlotIndex},
      {
        itemId: "weapon_wooden_club",
        count: 1,
        envelopeId: equipmentEntry.envelope.envelopeId,
        bankSlotIndex: equipmentEntry.bankSlotIndex,
      },
    ],
  });
  assert.equal(withdrawn.ok, true);
  assertNoPrivateQaAssetFields(withdrawn);
  const serialAfterWithdraw = internalProfileForAccount(service, gm.account.accountId).nextEquipmentInstanceSerial;

  const next = service.prepareGmQaAssets(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(next.ok, true);
  assert.equal(next.result.summary.changed, false);
  assert.equal(next.result.summary.alreadyPrepared, true);
  assert.equal(next.result.summary.ordinaryItemKindsPresent, 44);
  assert.equal(next.result.summary.ordinaryItemKindsMissing, 1);
  assert.equal(next.result.summary.bankEquipmentSamplesPresent, 30);
  assert.equal(next.result.summary.bankEquipmentSamplesMissing, 1);
  assert.equal(next.profileSummary.profileRevision, withdrawn.profileSummary.profileRevision);
  assert.equal(internalProfileForAccount(service, gm.account.accountId).nextEquipmentInstanceSerial, serialAfterWithdraw);

  const restarted = createAuthService({store: createMemoryAuthStore(service.snapshot())});
  const afterRestart = restarted.prepareGmQaAssets(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(afterRestart.ok, true);
  assert.equal(afterRestart.result.summary.changed, false);
  assert.equal(afterRestart.result.summary.ordinaryItemKindsMissing, 1);
  assert.equal(afterRestart.result.summary.bankEquipmentSamplesMissing, 1);
});

test("market and mail transfers keep QA identity private and never reissue samples across accounts", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(service, "qaassettransfer");
  const receiver = service.register({username: "qaassetreceiver", password: "test1234"});
  assert.equal(service.prepareGmQaAssets(gm.session.token, {manifestId: MANIFEST_ID}).ok, true);
  const gmInternal = internalProfileForAccount(service, gm.account.accountId);
  const selected = ["weapon_wooden_club", "weapon_training_spear"].map((itemId) => {
    const entry = internalQaEnvelopes(gmInternal).find(({envelope}) => envelope.itemId === itemId);
    assert.ok(entry, itemId);
    return {
      itemId,
      count: 1,
      envelopeId: entry.envelope.envelopeId,
      bankSlotIndex: entry.bankSlotIndex,
    };
  });
  const withdrawn = service.bankWithdraw(gm.session.token, {items: selected});
  assert.equal(withdrawn.ok, true);
  assertNoPrivateQaAssetFields(withdrawn);
  const club = Object.values(withdrawn.profile.equipmentInstances).find((entry) => (
    entry.itemId === "weapon_wooden_club" && entry.location === "backpack"
  ));
  const spear = Object.values(withdrawn.profile.equipmentInstances).find((entry) => (
    entry.itemId === "weapon_training_spear" && entry.location === "backpack"
  ));
  assert.ok(club);
  assert.ok(spear);
  const clubSlotIndex = withdrawn.profile.backpackSlots.findIndex((slot) => slot.itemId === club.itemId);
  const spearSlotIndex = withdrawn.profile.backpackSlots.findIndex((slot) => slot.itemId === spear.itemId);
  assert.ok(clubSlotIndex >= 0);
  assert.ok(spearSlotIndex >= 0);

  const sent = service.sendMail(gm.session.token, {
    recipientUsername: "qaassetreceiver",
    title: "QA装备转运",
    body: "验证邮件装备信封。",
    items: [{
      itemId: spear.itemId,
      count: 1,
      instanceId: spear.instanceId,
      sourceSlotIndex: spearSlotIndex,
    }],
  });
  assert.equal(sent.ok, true, JSON.stringify(sent));
  assertNoPrivateQaAssetFields(sent);
  const listed = service.createMarketListing(gm.session.token, {
    itemId: club.itemId,
    count: 1,
    instanceId: club.instanceId,
    sourceSlotIndex: clubSlotIndex,
    unitPrice: 1,
    currency: "stoneCoins",
  });
  assert.equal(listed.ok, true, JSON.stringify(listed));
  assertNoPrivateQaAssetFields(listed);
  assertNoPrivateQaAssetFields(service.marketListings(receiver.session.token));
  const bought = service.buyMarketListing(receiver.session.token, {listingId: listed.listing.listingId});
  assert.equal(bought.ok, true, JSON.stringify(bought));
  assertNoPrivateQaAssetFields(bought);
  const claimed = service.claimMailAttachments(receiver.session.token, sent.mail.mailId);
  assert.equal(claimed.ok, true, JSON.stringify(claimed));
  assertNoPrivateQaAssetFields(claimed);

  const receiverInternal = internalProfileForAccount(service, receiver.account.accountId);
  assert.equal(Object.values(receiverInternal.equipmentInstances).filter((entry) => (
    entry[QA_ASSET_SAMPLE_MARKER_KEY]
  )).length, 2);
  const retry = service.prepareGmQaAssets(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(retry.ok, true);
  assert.equal(retry.result.summary.changed, false);
  assert.equal(retry.result.summary.bankEquipmentSamplesPresent, 29);
  assert.equal(retry.result.summary.bankEquipmentSamplesMissing, 2);
  assertNoPrivateQaAssetFields(retry);
});

test("missing or damaged ledgers and duplicate private markers fail closed", () => {
  const seed = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(seed, "qaassetdamage");
  assert.equal(seed.prepareGmQaAssets(gm.session.token, {manifestId: MANIFEST_ID}).ok, true);
  const base = seed.snapshot();
  const playerId = base.profileBindings[gm.account.accountId].playerId;

  const cases = [
    {
      label: "missing ledger",
      code: "gm_qa_assets_provenance_conflict",
      mutate(profile) {
        delete profile[QA_ASSET_MANIFESTS_PROFILE_KEY];
      },
    },
    {
      label: "future ledger",
      code: "gm_qa_assets_ledger_invalid",
      mutate(profile) {
        profile[QA_ASSET_MANIFESTS_PROFILE_KEY][MANIFEST_ID].schemaVersion = 2;
      },
    },
    {
      label: "duplicate marker",
      code: "gm_qa_assets_provenance_conflict",
      mutate(profile) {
        const sourceSlot = profile.bank.slots.find((slot) => (
          Array.isArray(slot.equipmentEnvelopes) && slot.equipmentEnvelopes.length > 0
        ));
        const duplicate = structuredClone(sourceSlot.equipmentEnvelopes[0]);
        duplicate.envelopeId = "eqx_qa_assets_duplicate_marker_0001";
        sourceSlot.equipmentEnvelopes.push(duplicate);
        sourceSlot.count += 1;
        profile.bank.items.find((item) => item.itemId === sourceSlot.itemId).count += 1;
      },
    },
  ];

  for (const fixture of cases) {
    const snapshot = structuredClone(base);
    fixture.mutate(snapshot.profiles[playerId].profile);
    const beforeProfile = structuredClone(snapshot.profiles[playerId].profile);
    const beforeRevision = snapshot.profileBindings[gm.account.accountId].profileRevision;
    const service = createAuthService({store: createMemoryAuthStore(snapshot)});
    const blocked = service.prepareGmQaAssets(gm.session.token, {manifestId: MANIFEST_ID});
    assert.equal(blocked.ok, false, fixture.label);
    assert.equal(blocked.code, fixture.code, fixture.label);
    assert.equal(service.snapshot().profileBindings[gm.account.accountId].profileRevision, beforeRevision, fixture.label);
    assert.deepEqual(service.snapshot().profiles[playerId].profile, beforeProfile, fixture.label);
  }
});

test("a consumed deterministic sample identity blocks reconstruction without a ledger", () => {
  const seed = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(seed, "qaassetconsumed");
  const snapshot = seed.snapshot();
  const envelopeId = initialEnvelopeId(gm.account.accountId, QA_ASSET_EQUIPMENT_PLAN[0].slotId);
  snapshot.consumedEquipmentEnvelopes[envelopeId] = {
    schemaVersion: 1,
    envelopeId,
  };
  const playerId = snapshot.profileBindings[gm.account.accountId].playerId;
  const beforeProfile = structuredClone(snapshot.profiles[playerId].profile);
  const beforeRevision = snapshot.profileBindings[gm.account.accountId].profileRevision;
  const service = createAuthService({store: createMemoryAuthStore(snapshot)});

  const blocked = service.prepareGmQaAssets(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "gm_qa_assets_provenance_conflict");
  assert.equal(service.snapshot().profileBindings[gm.account.accountId].profileRevision, beforeRevision);
  assert.deepEqual(service.snapshot().profiles[playerId].profile, beforeProfile);
});

test("asset preparation is locked during battle and active offline hang", () => {
  const battleService = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(battleService, "qaassetbattle");
  const rival = battleService.register({username: "qaassetrival", password: "test1234"});
  battleService.updatePlayerPosition(gm.session.token, {mapId: "village", cellX: 10, cellY: 10, facing: "east", moving: false});
  battleService.updatePlayerPosition(rival.session.token, {mapId: "village", cellX: 11, cellY: 10, facing: "west", moving: false});
  const invite = battleService.inviteToBattle(gm.session.token, {username: "qaassetrival"});
  assert.equal(invite.ok, true);
  assert.equal(battleService.acceptBattleInvite(rival.session.token, invite.invite.inviteId).ok, true);
  assert.equal(
    battleService.prepareGmQaAssets(gm.session.token, {manifestId: MANIFEST_ID}).code,
    "battle_profile_mutation_locked",
  );

  const offlineSeed = createAuthService({store: createMemoryAuthStore()});
  const offlineGm = registerGm(offlineSeed, "qaassetoffline");
  const snapshot = offlineSeed.snapshot();
  accountProfile(snapshot, offlineGm.account.accountId).offlineHang.session.status = "active";
  const offlineService = createAuthService({store: createMemoryAuthStore(snapshot)});
  assert.equal(
    offlineService.prepareGmQaAssets(offlineGm.session.token, {manifestId: MANIFEST_ID}).code,
    "offline_hang_active",
  );
});

test("HTTP asset preparation requires a durable key, replays once, and converges by permanent ledger", async (t) => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const gm = registerGm(seed, "httpqaassets");
  const otherGm = registerGm(seed, "httpqaassetsother");
  let saveCount = 0;
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      saveCount += 1;
      base.save(nextData);
    },
  }, {onError: () => {}});
  const service = createAuthService({store});
  const server = createHttpServer({service, store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await service.waitForDurableIdle();
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  });
  const tools = await fetchJson(`http://127.0.0.1:${server.address().port}/gm/tools`, {
    headers: {authorization: `Bearer ${gm.session.token}`},
  });
  assert.equal(tools.ok, true);
  assert.deepEqual(tools.commandIds, [COMMAND_ID]);
  const endpoint = `http://127.0.0.1:${server.address().port}/gm/commands/${COMMAND_ID}`;
  const body = JSON.stringify({manifestId: MANIFEST_ID});
  const missingKey = await fetchJson(endpoint, {
    method: "POST",
    headers: {authorization: `Bearer ${gm.session.token}`},
    body,
  });
  assert.equal(missingKey.code, "idempotency_key_required");
  assert.equal(saveCount, 0);

  const operationId = "bbo_gm_qa_assets_0001";
  const headers = {authorization: `Bearer ${gm.session.token}`, "Idempotency-Key": operationId};
  const first = await fetchJson(endpoint, {method: "POST", headers, body});
  assert.equal(first.ok, true);
  assert.equal(first.result.summary.changed, true);
  assert.equal(first.durableCommit.operationId, operationId);
  assert.equal(first.durableCommit.replayed, false);
  assertNoPrivateQaAssetFields(first);
  const savesAfterFirst = saveCount;
  const firstAuditId = first.auditId;
  const firstRevision = first.profileSummary.profileRevision;

  const replay = await fetchJson(endpoint, {method: "POST", headers, body});
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.auditId, firstAuditId);
  assert.equal(saveCount, savesAfterFirst);
  const changedIntent = await fetchJson(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({manifestId: "qa_assets_v2"}),
  });
  assert.equal(changedIntent.code, "idempotency_key_conflict");
  const crossAccount = await fetchJson(endpoint, {
    method: "POST",
    headers: {authorization: `Bearer ${otherGm.session.token}`, "Idempotency-Key": operationId},
    body,
  });
  assert.equal(crossAccount.code, "idempotency_key_conflict");

  const next = await fetchJson(endpoint, {
    method: "POST",
    headers: {...headers, "Idempotency-Key": "bbo_gm_qa_assets_0002"},
    body,
  });
  assert.equal(next.ok, true);
  assert.equal(next.result.summary.changed, false);
  assert.equal(next.result.summary.alreadyPrepared, true);
  assert.equal(next.profileSummary.profileRevision, firstRevision);
  assert.equal(base.load().mutationReceipts[operationId].accountId, gm.account.accountId);
});

test("failed durable COMMIT publishes no assets and the same key recovers exactly one manifest", async (t) => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const gm = registerGm(seed, "httpqaassetsfailure");
  const binding = base.load().profileBindings[gm.account.accountId];
  const before = structuredClone(base.load().profiles[binding.playerId].profile);
  let failNextSave = true;
  let saveCount = 0;
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      saveCount += 1;
      if (failNextSave) {
        failNextSave = false;
        throw new Error("injected QA asset commit failure");
      }
      base.save(nextData);
    },
  }, {onError: () => {}});
  const service = createAuthService({store});
  const server = createHttpServer({service, store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await service.waitForDurableIdle();
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  });
  const operationId = "bbo_gm_qa_assets_failure_0001";
  const request = {
    method: "POST",
    headers: {authorization: `Bearer ${gm.session.token}`, "Idempotency-Key": operationId},
    body: JSON.stringify({manifestId: MANIFEST_ID}),
  };
  const endpoint = `http://127.0.0.1:${server.address().port}/gm/commands/${COMMAND_ID}`;

  const failed = await fetchJson(endpoint, request);
  assert.equal(failed.ok, false);
  assert.equal(failed.code, "storage_write_failed");
  assert.deepEqual(base.load().profiles[binding.playerId].profile, before);
  assert.equal(Object.hasOwn(base.load().mutationReceipts, operationId), false);

  const recovered = await fetchJson(endpoint, request);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.result.summary.changed, true);
  assert.equal(recovered.durableCommit.operationId, operationId);
  assert.equal(recovered.durableCommit.replayed, false);
  assert.equal(recovered.result.summary.bankEquipmentSamplesPresent, 31);
  assert.equal(internalQaEnvelopes(accountProfile(base.load(), gm.account.accountId)).length, 31);
  assert.equal(saveCount, 2);
});

test("public projection recursively strips ledger, marker, and QA source from bank and materialized instances", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(service, "qaassetvisibility");
  assert.equal(service.prepareGmQaAssets(gm.session.token, {manifestId: MANIFEST_ID}).ok, true);
  const internal = structuredClone(internalProfileForAccount(service, gm.account.accountId));
  const equipmentEntry = internalQaEnvelopes(internal)[0];
  const publicBank = publicProfile(internal, {equipmentCatalog});
  assertNoPrivateQaAssetFields(publicBank);
  assert.equal(publicBank.bank.slots[equipmentEntry.bankSlotIndex].equipmentEnvelopes[0].instanceState.source, undefined);

  const snapshot = service.snapshot();
  const profile = accountProfile(snapshot, gm.account.accountId);
  const envelope = equipmentEntry.envelope;
  const slotIndex = equipmentEntry.bankSlotIndex;
  const publicEnvelope = currentProfile(service, gm.session.token).profile.bank.slots[slotIndex].equipmentEnvelopes[0];
  const withdrawn = service.bankWithdraw(gm.session.token, {
    items: [{itemId: envelope.itemId, count: 1, envelopeId: publicEnvelope.envelopeId, bankSlotIndex: slotIndex}],
  });
  assert.equal(withdrawn.ok, true);
  assertNoPrivateQaAssetFields(withdrawn);
  const materialized = Object.values(internalProfileForAccount(service, gm.account.accountId).equipmentInstances)
    .find((instance) => instance[QA_ASSET_SAMPLE_MARKER_KEY]);
  assert.ok(materialized);
  const projected = publicProfile({
    gmQaAssetManifests: profile.gmQaAssetManifests,
    equipmentInstances: {[materialized.instanceId]: materialized},
    futureContainer: {equipmentEnvelope: envelope},
  }, {equipmentCatalog});
  assertNoPrivateQaAssetFields(projected);
  assert.equal(projected.equipmentInstances[materialized.instanceId].source, undefined);

  const sourceOnlyInstance = structuredClone(materialized);
  delete sourceOnlyInstance[QA_ASSET_SAMPLE_MARKER_KEY];
  const sourceOnlyProjection = publicProfile({
    equipmentInstances: {[sourceOnlyInstance.instanceId]: sourceOnlyInstance},
  }, {equipmentCatalog});
  assertNoPrivateQaAssetFields(sourceOnlyProjection);
  assert.equal(sourceOnlyProjection.equipmentInstances[sourceOnlyInstance.instanceId].source, undefined);
});
