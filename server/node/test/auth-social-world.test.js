"use strict";

const {
  assert,
  crypto,
  fs,
  os,
  path,
  test,
  once,
  createAuthService,
  createMemoryAuthStore,
  createHttpServer,
  createDefaultStore,
  DEFAULT_COMMAND_CATALOG,
  CLIENT_PROTOCOL_HEADER,
  CLIENT_VERSION_HEADER,
  PROTOCOL_VERSION,
  SERVER_VERSION,
  createMysqlAuthStore,
  createCountingAuthStore,
  testPasswordHash,
  withEnv,
  battleProfile,
  profileItemCount,
  playerRebirthReadyProfile,
  battleProfileWithPets,
  fetchJson,
  eventStreamUrl,
  webSocketOpen,
  webSocketJsonReader,
} = require("../test-support/auth-service-test-context");

function seedMailBackpackEquipment(service, token, itemId = "weapon_wooden_club") {
  const current = service.getProfile(token);
  assert.equal(current.ok, true);
  const profile = current.profile;
  profile.backpackSlots = [
    {itemId, count: 1},
    ...Array.from({length: 14}, () => ({})),
  ];
  profile.equipmentInstances = {
    equip_mail_guard_1: {
      schemaVersion: 1,
      instanceId: "equip_mail_guard_1",
      itemId,
      location: "backpack",
      slotId: "",
      durability: 30,
      enhancement: {itemId, level: 2, history: []},
      wearCounters: {itemId, attackCount: 3, hitCount: 0},
      expPillCharge: {},
      source: "mail_guard_test",
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

test("players can search and send text mail across accounts", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const sender = service.register({"username": "maila", "password": "test1234", "displayName": "甲"});
  const recipient = service.register({"username": "mailb", "password": "test1234", "displayName": "乙"});
  assert.equal(sender.ok, true);
  assert.equal(recipient.ok, true);

  const search = service.searchPlayers(sender.session.token, {"username": "mailb"});
  assert.equal(search.ok, true);
  assert.equal(search.players.length, 1);
  assert.equal(search.players[0].username, "mailb");

  const sent = service.sendMail(sender.session.token, {
    "recipientUsername": "mailb",
    "title": "组队吗",
    "body": "火芽村门口见。",
  });
  assert.equal(sent.ok, true);
  assert.equal(sent.mail.senderUsername, "maila");
  assert.equal(sent.mail.recipientUsername, "mailb");
  assert.equal(sent.mail.readAt, null);
  assert.equal(sent.mail.settledAt, sent.mail.createdAt);

  const senderInbox = service.listInbox(sender.session.token);
  assert.equal(senderInbox.ok, true);
  assert.equal(senderInbox.messages.length, 0);

  const recipientInbox = service.listInbox(recipient.session.token);
  assert.equal(recipientInbox.ok, true);
  assert.equal(recipientInbox.unreadCount, 1);
  assert.equal(recipientInbox.nextCursor, null);
  assert.equal(recipientInbox.hasMore, false);
  assert.equal(recipientInbox.messages[0].title, "组队吗");

  const read = service.markMailRead(recipient.session.token, recipientInbox.messages[0].mailId);
  assert.equal(read.ok, true);
  assert.notEqual(read.mail.readAt, null);

  const refreshed = service.listInbox(recipient.session.token);
  assert.equal(refreshed.unreadCount, 0);

  const blocked = service.markMailRead(sender.session.token, recipientInbox.messages[0].mailId);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "mail_missing");

  const senderProfile = battleProfile("甲", {"level": 1, "hp": 120, "maxHp": 120}, null);
  senderProfile.backpackSlots = [
    {"itemId": "item_meat_small", "count": 3},
    {"itemId": "novice_battle_pet_egg", "count": 1},
    ...Array.from({"length": 13}, () => ({})),
  ];
  const recipientProfile = battleProfile("乙", {"level": 1, "hp": 120, "maxHp": 120}, null);
  recipientProfile.backpackSlots = Array.from({"length": 15}, () => ({}));
  assert.equal(service.saveProfile(sender.session.token, {"expectedRevision": 0, "profile": senderProfile}).ok, true);
  assert.equal(service.saveProfile(recipient.session.token, {"expectedRevision": 0, "profile": recipientProfile}).ok, true);

  const boundAttachment = service.sendMail(sender.session.token, {
    "recipientUsername": "mailb",
    "title": "绑定蛋",
    "body": "这枚蛋不能转交。",
    "items": [{"itemId": "novice_battle_pet_egg", "count": 1}],
  });
  assert.equal(boundAttachment.ok, false);
  assert.equal(boundAttachment.code, "mail_attachment_bound");
  assert.equal(profileItemCount(service.getProfile(sender.session.token).profile, "novice_battle_pet_egg"), 1);

  const attached = service.sendMail(sender.session.token, {
    "recipientUsername": "mailb",
    "title": "补给",
    "body": "带上小肉。",
    "items": [{"itemId": "item_meat_small", "count": 2}],
  });
  assert.equal(attached.ok, true);
  assert.equal(attached.mail.items.length, 1);
  assert.equal(profileItemCount(attached.profile, "item_meat_small"), 1);
  const attachmentInbox = service.listInbox(recipient.session.token);
  assert.equal(attachmentInbox.messages[0].items[0].itemId, "item_meat_small");
  const claimed = service.claimMailAttachments(recipient.session.token, attachmentInbox.messages[0].mailId);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.claim.addedItems[0].count, 2);
  assert.equal(profileItemCount(claimed.profile, "item_meat_small"), 2);
  assert.equal(claimed.mail.mailId, attachmentInbox.messages[0].mailId);
  assert.deepEqual(claimed.mail.items, []);
  assert.deepEqual(claimed.mail.currency, {});
  assert.equal(typeof claimed.mail.settledAt, "string");
  assert.equal(claimed.mail.readAt, claimed.mail.settledAt);
  const afterClaimInbox = service.listInbox(recipient.session.token);
  assert.equal(afterClaimInbox.messages.some((mail) => (
    mail.mailId === attachmentInbox.messages[0].mailId
    && mail.settledAt === claimed.mail.settledAt
  )), true);
  const replayedClaim = service.claimMailAttachments(recipient.session.token, attachmentInbox.messages[0].mailId);
  assert.equal(replayedClaim.ok, false);
  assert.equal(replayedClaim.code, "mail_no_attachments");
});

test("mail public projection exposes settlement only for a strictly verified empty receipt", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const sender = seedService.register({username: "mail_life_send", password: "test1234", displayName: "生命周期寄件人"});
  const recipient = seedService.register({username: "mail_life_owner", password: "test1234", displayName: "生命周期收件人"});
  const seed = seedService.snapshot();
  const createdAt = "2026-07-16T08:00:00.000Z";
  const settledAt = "2026-07-16T09:00:00.000Z";
  const baseMail = {
    senderAccountId: sender.account.accountId,
    senderUsername: sender.account.username,
    senderDisplayName: sender.account.displayName,
    recipientAccountId: recipient.account.accountId,
    recipientUsername: recipient.account.username,
    recipientDisplayName: recipient.account.displayName,
    title: "生命周期投影",
    body: "损坏字段不能伪装成已结算回执。",
    items: [],
    equipmentEnvelopes: [],
    currency: {},
    createdAt,
    readAt: settledAt,
    schemaVersion: 2,
  };
  seed.mailMessages.mail_lifecycle_valid = {
    ...baseMail,
    mailId: "mail_lifecycle_valid",
    settledAt,
  };
  seed.mailMessages.mail_lifecycle_invalid_time = {
    ...baseMail,
    mailId: "mail_lifecycle_invalid_time",
    settledAt: "not-a-time",
  };
  seed.mailMessages.mail_lifecycle_asset_conflict = {
    ...baseMail,
    mailId: "mail_lifecycle_asset_conflict",
    items: [{itemId: "item_meat_small", count: 1}],
    settledAt,
  };
  seed.mailMessages.mail_lifecycle_future_schema = {
    ...baseMail,
    mailId: "mail_lifecycle_future_schema",
    settledAt,
    schemaVersion: 3,
  };

  const service = createAuthService({store: createMemoryAuthStore(seed)});
  const inbox = service.listInbox(recipient.session.token);
  assert.equal(inbox.ok, true, JSON.stringify(inbox));
  const byId = Object.fromEntries(inbox.messages.map((mail) => [mail.mailId, mail]));
  assert.equal(byId.mail_lifecycle_valid.settledAt, settledAt);
  assert.equal(byId.mail_lifecycle_invalid_time.settledAt, null);
  assert.equal(byId.mail_lifecycle_asset_conflict.settledAt, null);
  assert.deepEqual(byId.mail_lifecycle_asset_conflict.items, [{itemId: "item_meat_small", count: 1}]);
  assert.equal(byId.mail_lifecycle_future_schema.settledAt, null);
});

test("memory inbox pagination keeps legacy full reads and keyset pages isolated by account", () => {
  const seed = createAuthService({store: createMemoryAuthStore()});
  const owner = seed.register({username: "mail_page_owner", password: "test1234", displayName: "分页收件人"});
  const other = seed.register({username: "mail_page_other", password: "test1234", displayName: "其他收件人"});
  assert.equal(owner.ok, true);
  assert.equal(other.ok, true);
  const snapshot = seed.snapshot();
  const addMail = (mailId, recipient, createdAt) => {
    snapshot.mailMessages[mailId] = {
      mailId,
      senderAccountId: "acc_mail_page_sender",
      senderUsername: "mail_page_sender",
      senderDisplayName: "分页寄件人",
      recipientAccountId: recipient.account.accountId,
      recipientUsername: recipient.account.username,
      recipientDisplayName: recipient.account.displayName,
      title: mailId,
      body: "分页正文",
      items: [],
      currency: {},
      createdAt,
      readAt: null,
      schemaVersion: 1,
    };
  };
  addMail("mail_page_a", owner, "2026-07-16T12:00:00.000Z");
  addMail("mail_page_b", owner, "2026-07-16T12:00:00.000Z");
  addMail("mail_page_c", owner, "2026-07-16T12:00:00.000Z");
  addMail("mail_page_d", owner, "2026-07-15T12:00:00.000Z");
  addMail("mail_page_other", other, "2026-07-17T12:00:00.000Z");
  const service = createAuthService({store: createMemoryAuthStore(snapshot)});

  const legacy = service.listInbox(owner.session.token);
  assert.equal(legacy.ok, true);
  assert.deepEqual(legacy.messages.map(({mailId}) => mailId), [
    "mail_page_a",
    "mail_page_b",
    "mail_page_c",
    "mail_page_d",
  ]);
  assert.equal(legacy.nextCursor, null);
  assert.equal(legacy.hasMore, false);

  const first = service.listInbox(owner.session.token, {limit: 2});
  const second = service.listInbox(owner.session.token, {limit: 2, cursor: first.nextCursor});
  assert.deepEqual(first.messages.map(({mailId}) => mailId), ["mail_page_c", "mail_page_b"]);
  assert.deepEqual(second.messages.map(({mailId}) => mailId), ["mail_page_a", "mail_page_d"]);
  assert.equal(first.unreadCount, 4);
  assert.equal(second.unreadCount, 4);
  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, false);
  assert.deepEqual(
    [...first.messages, ...second.messages].map(({mailId}) => mailId),
    ["mail_page_c", "mail_page_b", "mail_page_a", "mail_page_d"],
  );

  const isolated = service.listInbox(other.session.token, {limit: 50});
  assert.deepEqual(isolated.messages.map(({mailId}) => mailId), ["mail_page_other"]);
  for (const options of [
    {limit: 0},
    {limit: 51},
    {limit: "01"},
    {cursor: first.nextCursor},
    {limit: 2, cursor: "not-a-canonical-cursor"},
  ]) {
    const invalid = service.listInbox(owner.session.token, options);
    assert.equal(invalid.ok, false);
    assert.equal(invalid.code, "mail_inbox_pagination_invalid");
  }
});

test("mail runtime identity rejects addressed key, inner id, and recipient drift without letting another mailbox cause a global denial", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const sender = seedService.register({username: "mid_sender", password: "test1234", displayName: "身份寄件人"});
  const recipient = seedService.register({username: "mid_recipient", password: "test1234", displayName: "身份收件人"});
  const sent = seedService.sendMail(sender.session.token, {
    recipientUsername: "mid_recipient",
    title: "身份保护",
    body: "键、内层编号与收件账号必须一致。",
  });
  assert.equal(sent.ok, true);
  const mailId = sent.mail.mailId;
  const baseSeed = seedService.snapshot();

  for (const mutate of [
    (seed) => { seed.mailMessages[mailId].mailId = `${mailId}_inner_drift`; },
    (seed) => { seed.mailMessages[mailId].mailId = ` ${mailId} `; },
    (seed) => { seed.mailMessages[mailId].recipientAccountId = ` ${recipient.account.accountId} `; },
  ]) {
    const seed = structuredClone(baseSeed);
    mutate(seed);
    const service = createAuthService({store: createMemoryAuthStore(seed)});
    const before = service.snapshot();
    for (const result of [
      service.listInbox(recipient.session.token),
      service.markMailRead(recipient.session.token, mailId),
      service.claimMailAttachments(recipient.session.token, mailId),
    ]) {
      assert.equal(result.ok, false);
      assert.equal(result.code, "mail_identity_invalid");
    }
    assert.deepEqual(service.snapshot(), before);
  }

  const whitespaceKeySeed = structuredClone(baseSeed);
  const whitespaceKey = ` ${mailId} `;
  whitespaceKeySeed.mailMessages[whitespaceKey] = whitespaceKeySeed.mailMessages[mailId];
  delete whitespaceKeySeed.mailMessages[mailId];
  const whitespaceKeyService = createAuthService({store: createMemoryAuthStore(whitespaceKeySeed)});
  const whitespaceKeyBefore = whitespaceKeyService.snapshot();
  const whitespaceKeyList = whitespaceKeyService.listInbox(recipient.session.token);
  assert.equal(whitespaceKeyList.ok, false);
  assert.equal(whitespaceKeyList.code, "mail_identity_invalid");
  for (const result of [
    whitespaceKeyService.markMailRead(recipient.session.token, mailId),
    whitespaceKeyService.claimMailAttachments(recipient.session.token, mailId),
  ]) {
    assert.equal(result.ok, false);
    assert.equal(result.code, "mail_missing");
  }
  assert.deepEqual(whitespaceKeyService.snapshot(), whitespaceKeyBefore);

  const isolatedSeed = structuredClone(baseSeed);
  const otherMailboxId = `${mailId}_other_mailbox`;
  const otherMailboxMail = structuredClone(isolatedSeed.mailMessages[mailId]);
  otherMailboxMail.mailId = `${otherMailboxId}_inner_drift`;
  otherMailboxMail.recipientAccountId = sender.account.accountId;
  isolatedSeed.mailMessages[otherMailboxId] = otherMailboxMail;
  const isolatedService = createAuthService({store: createMemoryAuthStore(isolatedSeed)});
  const recipientInbox = isolatedService.listInbox(recipient.session.token);
  assert.equal(recipientInbox.ok, true);
  assert.equal(recipientInbox.messages.length, 1);
  assert.equal(recipientInbox.messages[0].mailId, mailId);
  const senderInbox = isolatedService.listInbox(sender.session.token);
  assert.equal(senderInbox.ok, false);
  assert.equal(senderInbox.code, "mail_identity_invalid");
});

test("equipment mail selects one instance, preserves its state, and keeps historical template-only mail blocked", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const sender = seedService.register({username: "mailequip_sender", password: "test1234", displayName: "装备寄件人"});
  const recipient = seedService.register({username: "mailequip_recipient", password: "test1234", displayName: "装备收件人"});
  seedMailBackpackEquipment(seedService, sender.session.token);
  const senderBefore = seedService.getProfile(sender.session.token);

  const sent = seedService.sendMail(sender.session.token, {
    recipientUsername: "mailequip_recipient",
    title: "装备附件",
    body: "这件强化木棒必须保持原样。",
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      instanceId: "equip_mail_guard_1",
      sourceSlotIndex: 0,
    }],
  });
  assert.equal(sent.ok, true, JSON.stringify(sent));
  assert.equal(sent.mail.schemaVersion, 2);
  assert.equal(sent.mail.items[0].itemId, "weapon_wooden_club");
  assert.equal(sent.mail.equipmentEnvelopes.length, 1);
  assert.equal(Object.hasOwn(sent.mail.equipmentEnvelopes[0], "provenance"), false);
  assert.equal(Object.hasOwn(sent.mail.equipmentEnvelopes[0].instanceState, "source"), false);
  const senderAfter = seedService.getProfile(sender.session.token);
  assert.equal(senderAfter.profileSummary.profileRevision, senderBefore.profileSummary.profileRevision + 1);
  assert.equal(senderAfter.profile.stoneCoins, senderBefore.profile.stoneCoins);
  assert.equal(profileItemCount(senderAfter.profile, "weapon_wooden_club"), 0);
  assert.equal(senderAfter.profile.equipmentInstances.equip_mail_guard_1, undefined);
  const internalMail = seedService.snapshot().mailMessages[sent.mail.mailId];
  const internalEnvelope = internalMail.equipmentEnvelopes[0];
  assert.match(internalEnvelope.envelopeId, /^eqx_mail_/);
  assert.equal(internalEnvelope.instanceState.durability, 30);
  assert.equal(internalEnvelope.instanceState.enhancement.level, 2);
  assert.equal(internalEnvelope.instanceState.wearCounters.attackCount, 3);
  assert.equal(internalEnvelope.instanceState.source, "mail_guard_test");
  assert.equal(internalEnvelope.provenance.sourceInstanceId, "equip_mail_guard_1");

  const inboxBeforeClaim = seedService.listInbox(recipient.session.token);
  assert.equal(inboxBeforeClaim.messages.length, 1);
  assert.equal(inboxBeforeClaim.messages[0].equipmentEnvelopes[0].instanceState.enhancement.level, 2);
  const claimedModern = seedService.claimMailAttachments(recipient.session.token, sent.mail.mailId);
  assert.equal(claimedModern.ok, true, JSON.stringify(claimedModern));
  assert.equal(claimedModern.mail.mailId, sent.mail.mailId);
  assert.deepEqual(claimedModern.mail.items, []);
  assert.deepEqual(claimedModern.mail.equipmentEnvelopes, []);
  assert.equal(typeof claimedModern.mail.settledAt, "string");
  assert.equal(profileItemCount(claimedModern.profile, "weapon_wooden_club"), 1);
  assert.equal(claimedModern.claim.importedEquipmentInstanceIds.length, 1);
  const importedId = claimedModern.claim.importedEquipmentInstanceIds[0];
  const imported = claimedModern.profile.equipmentInstances[importedId];
  assert.ok(imported);
  assert.notEqual(imported.instanceId, "equip_mail_guard_1");
  assert.equal(imported.durability, 30);
  assert.equal(imported.enhancement.level, 2);
  assert.equal(imported.wearCounters.attackCount, 3);
  const afterModernClaim = seedService.snapshot();
  const recipientBinding = afterModernClaim.profileBindings[recipient.account.accountId];
  const privateImported = afterModernClaim.profiles[recipientBinding.playerId].profile.equipmentInstances[importedId];
  assert.equal(privateImported.transferProvenance.originEnvelopeId, internalEnvelope.envelopeId);
  assert.deepEqual(afterModernClaim.consumedEquipmentEnvelopes[internalEnvelope.envelopeId], {
    schemaVersion: 1,
    envelopeId: internalEnvelope.envelopeId,
  });
  assert.deepEqual(afterModernClaim.mailMessages[sent.mail.mailId], {
    ...internalMail,
    items: [],
    equipmentEnvelopes: [],
    currency: {},
    readAt: claimedModern.mail.readAt,
    settledAt: claimedModern.mail.settledAt,
  });

  const seed = seedService.snapshot();
  seed.mailMessages.legacy_equipment_mail = {
    mailId: "legacy_equipment_mail",
    senderAccountId: sender.account.accountId,
    senderUsername: sender.account.username,
    senderDisplayName: sender.account.displayName,
    recipientAccountId: recipient.account.accountId,
    recipientUsername: recipient.account.username,
    recipientDisplayName: recipient.account.displayName,
    title: "历史装备附件",
    body: "等待装备实例迁移。",
    items: [{itemId: "weapon_wooden_club", count: 1}],
    currency: {stoneCoins: 17},
    createdAt: "2026-07-12T00:00:00.000Z",
    readAt: null,
    schemaVersion: 1,
  };
  const service = createAuthService({store: createMemoryAuthStore(seed)});
  const recipientBefore = service.getProfile(recipient.session.token);
  const mailBefore = service.snapshot().mailMessages.legacy_equipment_mail;
  const claimed = service.claimMailAttachments(recipient.session.token, "legacy_equipment_mail");
  assert.equal(claimed.ok, false);
  assert.equal(claimed.code, "mail_equipment_transfer_unsupported");
  const recipientAfter = service.getProfile(recipient.session.token);
  assert.equal(recipientAfter.profileSummary.profileRevision, recipientBefore.profileSummary.profileRevision);
  assert.equal(recipientAfter.profile.stoneCoins, recipientBefore.profile.stoneCoins);
  assert.equal(profileItemCount(recipientAfter.profile, "weapon_wooden_club"), 1);
  assert.deepEqual(service.snapshot().mailMessages.legacy_equipment_mail, mailBefore);
  const inbox = service.listInbox(recipient.session.token);
  const historical = inbox.messages.find((mail) => mail.mailId === "legacy_equipment_mail");
  assert.ok(historical);
  assert.equal(historical.items[0].itemId, "weapon_wooden_club");
  assert.equal(historical.currency.stoneCoins, 17);
});

test("equipment mail rejects client envelopes and rolls back a mixed send when any selected instance is stale", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const sender = service.register({username: "mailintent_sender", password: "test1234", displayName: "意图寄件人"});
  service.register({username: "mailintent_recipient", password: "test1234", displayName: "意图收件人"});
  seedMailBackpackEquipment(service, sender.session.token);
  const current = service.getProfile(sender.session.token);
  const profile = current.profile;
  profile.backpackSlots[1] = {itemId: "item_meat_small", count: 2};
  assert.equal(service.saveProfile(sender.session.token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile,
  }).ok, true);

  const before = service.snapshot();
  const untrusted = service.sendMail(sender.session.token, {
    recipientUsername: "mailintent_recipient",
    title: "伪造信封",
    body: "客户端不能提交这个字段。",
    equipmentEnvelopes: [{envelopeId: "eqx_mail_client_forged"}],
  });
  assert.equal(untrusted.ok, false);
  assert.equal(untrusted.code, "mail_equipment_envelope_untrusted");
  assert.deepEqual(service.snapshot(), before);

  const stale = service.sendMail(sender.session.token, {
    recipientUsername: "mailintent_recipient",
    title: "混合附件",
    body: "任何一个实例过期都必须整封回滚。",
    items: [
      {itemId: "item_meat_small", count: 1},
      {itemId: "weapon_wooden_club", count: 1, instanceId: "equip_mail_guard_1", sourceSlotIndex: 0},
      {itemId: "weapon_wooden_club", count: 1, instanceId: "equip_mail_missing", sourceSlotIndex: 2},
    ],
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "equipment_instance_missing");
  assert.deepEqual(service.snapshot(), before);
});

test("equipment mail claim keeps capacity leftovers and rejects corrupt, future, duplicate, or cross-mail envelopes atomically", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const sender = seedService.register({username: "mailatomic_sender", password: "test1234", displayName: "原子寄件人"});
  const recipient = seedService.register({username: "mailatomic_recipient", password: "test1234", displayName: "原子收件人"});
  seedMailBackpackEquipment(seedService, sender.session.token);

  const senderCurrent = seedService.getProfile(sender.session.token);
  const senderProfile = senderCurrent.profile;
  senderProfile.backpackSlots[1] = {itemId: "weapon_wooden_club", count: 1};
  senderProfile.backpackSlots[2] = {itemId: "item_meat_small", count: 2};
  senderProfile.equipmentInstances.equip_mail_guard_2 = {
    schemaVersion: 1,
    instanceId: "equip_mail_guard_2",
    itemId: "weapon_wooden_club",
    location: "backpack",
    slotId: "",
    durability: 18,
    enhancement: {itemId: "weapon_wooden_club", level: 4, history: [{result: "success"}]},
    wearCounters: {itemId: "weapon_wooden_club", attackCount: 7, hitCount: 0},
    expPillCharge: {},
    source: "mail_capacity_test",
  };
  senderProfile.nextEquipmentInstanceSerial = 3;
  assert.equal(seedService.saveProfile(sender.session.token, {
    expectedRevision: senderCurrent.profileSummary.profileRevision,
    profile: senderProfile,
  }).ok, true);

  const recipientCurrent = seedService.getProfile(recipient.session.token);
  const recipientProfile = recipientCurrent.profile;
  recipientProfile.backpackSlots = [
    {itemId: "item_meat_small", count: 98},
    ...Array.from({length: 13}, () => ({itemId: "item_meat_small", count: 99})),
    {},
  ];
  assert.equal(seedService.saveProfile(recipient.session.token, {
    expectedRevision: recipientCurrent.profileSummary.profileRevision,
    profile: recipientProfile,
  }).ok, true);

  const sent = seedService.sendMail(sender.session.token, {
    recipientUsername: "mailatomic_recipient",
    title: "容量与坏档",
    body: "先领一件装备和部分普通附件。",
    items: [
      {itemId: "weapon_wooden_club", count: 1, instanceId: "equip_mail_guard_1", sourceSlotIndex: 0},
      {itemId: "weapon_wooden_club", count: 1, instanceId: "equip_mail_guard_2", sourceSlotIndex: 1},
      {itemId: "item_meat_small", count: 2},
    ],
  });
  assert.equal(sent.ok, true, JSON.stringify(sent));
  const seed = seedService.snapshot();
  seed.mailMessages[sent.mail.mailId].currency = {stoneCoins: 17};

  const corruptionScenarios = [
    {
      code: "equipment_transfer_fingerprint_mismatch",
      mutate(snapshot) { snapshot.mailMessages[sent.mail.mailId].equipmentEnvelopes[0].stateFingerprint = "0".repeat(64); },
    },
    {
      code: "equipment_transfer_envelope_schema_future",
      mutate(snapshot) { snapshot.mailMessages[sent.mail.mailId].equipmentEnvelopes[0].schemaVersion = 2; },
    },
    {
      code: "equipment_transfer_envelope_duplicate",
      mutate(snapshot) {
        snapshot.mailMessages[sent.mail.mailId].equipmentEnvelopes[1] = structuredClone(
          snapshot.mailMessages[sent.mail.mailId].equipmentEnvelopes[0],
        );
      },
    },
    {
      code: "equipment_transfer_envelope_duplicate",
      mutate(snapshot) {
        const duplicate = structuredClone(snapshot.mailMessages[sent.mail.mailId]);
        duplicate.mailId = "mail_cross_recipient_duplicate";
        duplicate.recipientAccountId = sender.account.accountId;
        duplicate.recipientUsername = sender.account.username;
        duplicate.recipientDisplayName = sender.account.displayName;
        snapshot.mailMessages[duplicate.mailId] = duplicate;
      },
    },
    {
      code: "equipment_transfer_envelope_duplicate",
      mutate(snapshot) {
        const envelope = structuredClone(snapshot.mailMessages[sent.mail.mailId].equipmentEnvelopes[0]);
        const binding = snapshot.profileBindings[recipient.account.accountId];
        snapshot.profiles[binding.playerId].profile.bank = {
          stoneCoins: 0,
          items: [{itemId: envelope.itemId, count: 1}],
          slots: [
            {itemId: envelope.itemId, count: 1, equipmentEnvelopes: [envelope]},
            ...Array.from({length: 89}, () => ({})),
          ],
          unlockedTabs: 1,
          schemaVersion: 2,
        };
      },
    },
    {
      code: "equipment_transfer_envelope_duplicate",
      mutate(snapshot) {
        const envelope = structuredClone(snapshot.mailMessages[sent.mail.mailId].equipmentEnvelopes[0]);
        snapshot.marketListings.market_cross_mail_duplicate = {
          listingId: "market_cross_mail_duplicate",
          sellerAccountId: sender.account.accountId,
          itemId: envelope.itemId,
          count: 1,
          unitPrice: 1,
          currency: "stoneCoins",
          createdAt: "2026-07-12T00:00:00.000Z",
          equipmentEnvelope: envelope,
          schemaVersion: 2,
        };
      },
    },
  ];
  for (const scenario of corruptionScenarios) {
    const corruptSeed = structuredClone(seed);
    scenario.mutate(corruptSeed);
    const service = createAuthService({store: createMemoryAuthStore(corruptSeed)});
    const before = service.snapshot();
    const profileBefore = service.getProfile(recipient.session.token);
    const claimed = service.claimMailAttachments(recipient.session.token, sent.mail.mailId);
    assert.equal(claimed.ok, false, scenario.code);
    assert.equal(claimed.code, scenario.code);
    const profileAfter = service.getProfile(recipient.session.token);
    assert.equal(profileAfter.profileSummary.profileRevision, profileBefore.profileSummary.profileRevision);
    assert.equal(profileAfter.profile.stoneCoins, profileBefore.profile.stoneCoins);
    assert.deepEqual(service.snapshot(), before, scenario.code);
  }

  const partialService = createAuthService({store: createMemoryAuthStore(seed)});
  const beforePartial = partialService.getProfile(recipient.session.token);
  const partial = partialService.claimMailAttachments(recipient.session.token, sent.mail.mailId);
  assert.equal(partial.ok, true, JSON.stringify(partial));
  assert.equal(partial.profile.stoneCoins, beforePartial.profile.stoneCoins + 17);
  assert.equal(profileItemCount(partial.profile, "weapon_wooden_club"), 1);
  assert.deepEqual(partial.claim.addedItems, [
    {itemId: "weapon_wooden_club", count: 1},
    {itemId: "item_meat_small", count: 1},
  ]);
  assert.deepEqual(partial.claim.remainingItems, [
    {itemId: "item_meat_small", count: 1},
    {itemId: "weapon_wooden_club", count: 1},
  ]);
  assert.ok(partial.mail);
  assert.deepEqual(partial.mail.currency, {});
  assert.equal(partial.mail.equipmentEnvelopes.length, 1);
  assert.equal(partial.mail.equipmentEnvelopes[0].instanceState.durability, 18);
  assert.equal(partial.mail.equipmentEnvelopes[0].instanceState.enhancement.level, 4);
  const storedRemaining = partialService.snapshot().mailMessages[sent.mail.mailId];
  const partialSnapshot = partialService.snapshot();
  const claimedEnvelopeId = seed.mailMessages[sent.mail.mailId].equipmentEnvelopes[0].envelopeId;
  const remainingEnvelopeId = storedRemaining.equipmentEnvelopes[0].envelopeId;
  assert.deepEqual(partialSnapshot.consumedEquipmentEnvelopes[claimedEnvelopeId], {
    schemaVersion: 1,
    envelopeId: claimedEnvelopeId,
  });
  assert.equal(partialSnapshot.consumedEquipmentEnvelopes[remainingEnvelopeId], undefined);
  assert.equal(storedRemaining.equipmentEnvelopes.length, 1);
  assert.equal(storedRemaining.equipmentEnvelopes[0].instanceState.source, "mail_capacity_test");
});

test("unknown mail attachments preserve the whole mail and currency atomically", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const sender = seedService.register({username: "mailunknownsender", password: "test1234", displayName: "未知寄件人"});
  const recipient = seedService.register({username: "mailunknownrecipient", password: "test1234", displayName: "未知收件人"});
  const seed = seedService.snapshot();
  seed.mailMessages.future_unknown_mail = {
    mailId: "future_unknown_mail",
    senderAccountId: sender.account.accountId,
    senderUsername: sender.account.username,
    senderDisplayName: sender.account.displayName,
    recipientAccountId: recipient.account.accountId,
    recipientUsername: recipient.account.username,
    recipientDisplayName: recipient.account.displayName,
    title: "未来附件",
    body: "旧服不能理解但绝不能删除。",
    items: [{itemId: "future_mail_relic_999", count: 1, futureEnvelope: {quality: 9}}],
    currency: {stoneCoins: 17},
    createdAt: "2026-07-12T00:00:00.000Z",
    readAt: null,
    schemaVersion: 1,
  };
  const mailBefore = structuredClone(seed.mailMessages.future_unknown_mail);
  const binding = seed.profileBindings[recipient.account.accountId];
  const recipientProfileBefore = structuredClone(seed.profiles[binding.playerId].profile);
  const revisionBefore = binding.profileRevision;
  const service = createAuthService({store: createMemoryAuthStore(seed)});

  const claimed = service.claimMailAttachments(recipient.session.token, "future_unknown_mail");
  assert.equal(claimed.ok, false);
  assert.equal(claimed.code, "mail_item_unknown");
  const after = service.snapshot();
  assert.deepEqual(after.mailMessages.future_unknown_mail, mailBefore);
  assert.equal(after.profileBindings[recipient.account.accountId].profileRevision, revisionBefore);
  assert.deepEqual(after.profiles[binding.playerId].profile, recipientProfileBefore);
});

test("malformed and alternate mail asset envelopes cannot claim currency or delete mail", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const sender = seedService.register({username: "mailrawsender", password: "test1234", displayName: "原档寄件人"});
  const recipient = seedService.register({username: "mailrawrecipient", password: "test1234", displayName: "原档收件人"});
  const baseSeed = seedService.snapshot();
  const baseMail = {
    mailId: "raw_guard_mail",
    senderAccountId: sender.account.accountId,
    senderUsername: sender.account.username,
    senderDisplayName: sender.account.displayName,
    recipientAccountId: recipient.account.accountId,
    recipientUsername: recipient.account.username,
    recipientDisplayName: recipient.account.displayName,
    title: "原始附件",
    body: "任何无法解释的附件都必须整体保留。",
    items: [],
    currency: {stoneCoins: 17},
    createdAt: "2026-07-12T00:00:00.000Z",
    readAt: null,
    schemaVersion: 1,
  };
  const scenarios = [
    {
      expectedCode: "mail_equipment_transfer_unsupported",
      patch: {items: [{itemId: "weapon_wooden_club", count: "bad", futureMeta: {keep: true}}]},
    },
    {
      expectedCode: "mail_representation_conflict",
      patch: {items: undefined, itemAmounts: [{itemId: "item_meat_small", count: 5}]},
    },
    {
      expectedCode: "mail_schema_invalid",
      patch: {items: [{itemId: "item_meat_small", count: 1}], schemaVersion: "not-a-version"},
    },
    {
      expectedCode: "mail_currency_invalid",
      patch: {currency: {stoneCoins: 17}, currencies: {stoneCoins: 18}},
    },
    {
      expectedCode: "mail_item_invalid",
      patch: {items: null},
    },
    {
      expectedCode: "mail_schema_unsupported",
      patch: {futureEnvelope: {assets: ["future_mail_asset"]}},
    },
  ];

  for (const scenario of scenarios) {
    const seed = structuredClone(baseSeed);
    const mail = {...structuredClone(baseMail), ...structuredClone(scenario.patch)};
    if (scenario.patch.items === undefined) {
      delete mail.items;
    }
    seed.mailMessages.raw_guard_mail = mail;
    const mailBefore = structuredClone(mail);
    const binding = seed.profileBindings[recipient.account.accountId];
    const profileBefore = structuredClone(seed.profiles[binding.playerId].profile);
    const revisionBefore = binding.profileRevision;
    const service = createAuthService({store: createMemoryAuthStore(seed)});

    const claimed = service.claimMailAttachments(recipient.session.token, "raw_guard_mail");
    assert.equal(claimed.ok, false);
    assert.equal(claimed.code, scenario.expectedCode);
    const after = service.snapshot();
    assert.deepEqual(after.mailMessages.raw_guard_mail, mailBefore);
    assert.equal(after.profileBindings[recipient.account.accountId].profileRevision, revisionBefore);
    assert.deepEqual(after.profiles[binding.playerId].profile, profileBefore);
  }
});

test("currency-only mail preserves an unsafe future backpack and the whole mail", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const sender = seedService.register({username: "mailfbags", password: "test1234", displayName: "未来背包寄件人"});
  const recipient = seedService.register({username: "mailfbagr", password: "test1234", displayName: "未来背包收件人"});
  assert.equal(sender.ok, true);
  assert.equal(recipient.ok, true);
  const seed = seedService.snapshot();
  const binding = seed.profileBindings[recipient.account.accountId];
  seed.profiles[binding.playerId].profile.backpackSlots[0] = {
    itemId: "future_backpack_relic_999",
    count: 1,
    futureEnvelope: {assetId: "future_asset_mail"},
  };
  seed.mailMessages.future_backpack_currency_mail = {
    mailId: "future_backpack_currency_mail",
    senderAccountId: sender.account.accountId,
    senderUsername: sender.account.username,
    senderDisplayName: sender.account.displayName,
    recipientAccountId: recipient.account.accountId,
    recipientUsername: recipient.account.username,
    recipientDisplayName: recipient.account.displayName,
    title: "石币附件",
    body: "背包坏档时也不能领币并改写背包。",
    items: [],
    currency: {stoneCoins: 17},
    createdAt: "2026-07-12T00:00:00.000Z",
    readAt: null,
    schemaVersion: 1,
  };
  const profileBefore = structuredClone(seed.profiles[binding.playerId].profile);
  const mailBefore = structuredClone(seed.mailMessages.future_backpack_currency_mail);
  const revisionBefore = binding.profileRevision;
  const service = createAuthService({store: createMemoryAuthStore(seed)});

  const claimed = service.claimMailAttachments(recipient.session.token, "future_backpack_currency_mail");
  assert.equal(claimed.ok, false);
  assert.equal(claimed.code, "backpack_item_unknown");
  const after = service.snapshot();
  assert.equal(after.profileBindings[recipient.account.accountId].profileRevision, revisionBefore);
  assert.deepEqual(after.profiles[binding.playerId].profile, profileBefore);
  assert.deepEqual(after.mailMessages.future_backpack_currency_mail, mailBefore);
});

test("claiming battle item mail is locked until the active battle ends", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const supplier = service.register({"username": "bmsupply", "password": "test1234", "displayName": "补给员"});
  const recipient = service.register({"username": "bmrecv", "password": "test1234", "displayName": "收件战士"});
  const opponent = service.register({"username": "bmopp", "password": "test1234", "displayName": "对练"});
  assert.equal(supplier.ok, true);
  assert.equal(recipient.ok, true);
  assert.equal(opponent.ok, true);

  const supplierProfile = battleProfile("补给员", {"level": 8, "hp": 130, "maxHp": 130}, null);
  supplierProfile.backpackSlots = [
    {"itemId": "item_heal_single_5", "count": 2},
    ...Array.from({"length": 14}, () => ({})),
  ];
  const recipientProfile = battleProfile("收件战士", {"level": 12, "hp": 150, "maxHp": 150, "attack": 20, "defense": 8, "quick": 90}, {
    "petId": "pet_battle_mail_recipient",
    "name": "收件布伊",
    "state": "battle",
    "hp": 50,
    "maxHp": 90,
  });
  recipientProfile.backpackSlots = Array.from({"length": 15}, () => ({}));
  const opponentProfile = battleProfile("对练", {"level": 12, "hp": 150, "maxHp": 150, "attack": 18, "defense": 8, "quick": 70}, {
    "petId": "pet_battle_mail_opponent",
    "name": "对练布伊",
    "state": "battle",
    "hp": 80,
    "maxHp": 90,
  });
  assert.equal(service.saveProfile(supplier.session.token, {"expectedRevision": 0, "profile": supplierProfile}).ok, true);
  assert.equal(service.saveProfile(recipient.session.token, {"expectedRevision": 0, "profile": recipientProfile}).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {"expectedRevision": 0, "profile": opponentProfile}).ok, true);
  service.updatePlayerPosition(recipient.session.token, {"mapId": "village", "cellX": 10, "cellY": 10, "facing": "east", "moving": false});
  service.updatePlayerPosition(opponent.session.token, {"mapId": "village", "cellX": 11, "cellY": 10, "facing": "west", "moving": false});

  const invite = service.inviteToBattle(recipient.session.token, {"username": "bmopp"});
  const accept = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  assert.equal(accept.room.participants[0].teamSnapshot.battleItemBag.item_heal_single_5, 0);

  const sent = service.sendMail(supplier.session.token, {
    "recipientUsername": "bmrecv",
    "title": "战斗补给",
    "body": "马上收。",
    "items": [{"itemId": "item_heal_single_5", "count": 2}],
  });
  assert.equal(sent.ok, true);
  const inbox = service.listInbox(recipient.session.token);
  const locked = service.claimMailAttachments(recipient.session.token, inbox.messages[0].mailId);
  assert.equal(locked.ok, false);
  assert.equal(locked.code, "battle_profile_mutation_locked");
  assert.equal(service.snapshot().battleRooms[accept.room.roomId].participants[0].teamSnapshot.battleItemBag.item_heal_single_5, 0);
  assert.equal(profileItemCount(service.getProfile(recipient.session.token).profile, "item_heal_single_5"), 0);

  const closed = service.leaveBattleRoom(recipient.session.token, accept.room.roomId);
  assert.equal(closed.ok, true);
  assert.equal(closed.room.status, "closed");
  const claimed = service.claimMailAttachments(recipient.session.token, inbox.messages[0].mailId);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.claim.addedItems[0].itemId, "item_heal_single_5");
  assert.equal(profileItemCount(claimed.profile, "item_heal_single_5"), 2);
  assert.equal(claimed.battleRoom, null);
});

test("players can invite, accept, and leave server parties", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const leader = service.register({"username": "partya", "password": "test1234", "displayName": "队长"});
  const member = service.register({"username": "partyb", "password": "test1234", "displayName": "队员"});
  const outsider = service.register({"username": "partyc", "password": "test1234", "displayName": "路人"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(outsider.ok, true);
  const leaderProfile = service.saveProfile(leader.session.token, {
    profile: battleProfile("队长", {level: 12, hp: 140, maxHp: 140, attack: 24, defense: 10, quick: 72}, {
      petId: "party_leader_pet",
      name: "队长布伊",
      level: 12,
      hp: 100,
      maxHp: 100,
    }),
  });
  const memberProfile = service.saveProfile(member.session.token, {
    profile: battleProfile("队员", {level: 9, hp: 130, maxHp: 130, attack: 21, defense: 8, quick: 66}, {
      petId: "party_member_pet",
      name: "队员布伊",
      level: 9,
      hp: 95,
      maxHp: 95,
    }),
  });
  assert.equal(leaderProfile.ok, true);
  assert.equal(memberProfile.ok, true);

  const online = service.listOnlinePlayers(leader.session.token);
  assert.equal(online.ok, true);
  assert.deepEqual(online.players.map((player) => player.username).sort(), ["partya", "partyb", "partyc"]);

  const invite = service.inviteToParty(leader.session.token, {"username": "partyb"});
  assert.equal(invite.ok, true);
  assert.equal(invite.party.memberCount, 1);
  assert.equal(invite.party.members[0].role, "leader");
  assert.equal(invite.invite.toUsername, "partyb");

  const memberState = service.getPartyState(member.session.token);
  assert.equal(memberState.ok, true);
  assert.equal(memberState.party, null);
  assert.equal(memberState.incomingInvites.length, 1);

  const outsiderAccept = service.acceptPartyInvite(outsider.session.token, memberState.incomingInvites[0].inviteId);
  assert.equal(outsiderAccept.ok, false);
  assert.equal(outsiderAccept.code, "party_invite_missing");

  const accept = service.acceptPartyInvite(member.session.token, memberState.incomingInvites[0].inviteId);
  assert.equal(accept.ok, true);
  assert.equal(accept.party.memberCount, 2);
  assert.deepEqual(accept.party.members.map((player) => player.username), ["partya", "partyb"]);
  const acceptedMember = accept.party.members.find((player) => player.username === "partyb");
  assert.equal(acceptedMember.teamSnapshot.player.name, "队员");
  assert.equal(acceptedMember.teamSnapshot.battlePets[0].petId, "party_member_pet");

  const busyInvite = service.inviteToParty(outsider.session.token, {"username": "partyb"});
  assert.equal(busyInvite.ok, false);
  assert.equal(busyInvite.code, "party_target_busy");

  const application = service.applyToParty(outsider.session.token, {"username": "partyb"});
  assert.equal(application.ok, true);
  assert.equal(application.invite.kind, "application");
  assert.equal(application.invite.fromUsername, "partyc");
  assert.equal(application.invite.toUsername, "partya");

  const applicationLeaderState = service.getPartyState(leader.session.token);
  assert.equal(applicationLeaderState.ok, true);
  assert.equal(applicationLeaderState.incomingInvites.length, 1);
  assert.equal(applicationLeaderState.incomingInvites[0].kind, "application");

  const acceptApplication = service.acceptPartyInvite(leader.session.token, applicationLeaderState.incomingInvites[0].inviteId);
  assert.equal(acceptApplication.ok, true);
  assert.equal(acceptApplication.party.memberCount, 3);
  assert.deepEqual(acceptApplication.party.members.map((player) => player.username), ["partya", "partyb", "partyc"]);

  const leaveOutsider = service.leaveParty(outsider.session.token);
  assert.equal(leaveOutsider.ok, true);

  const leaveMember = service.leaveParty(member.session.token);
  assert.equal(leaveMember.ok, true);
  const leaderState = service.getPartyState(leader.session.token);
  assert.equal(leaderState.ok, true);
  assert.equal(leaderState.party.memberCount, 1);
  assert.equal(leaderState.party.members[0].username, "partya");

  const leaveLeader = service.leaveParty(leader.session.token);
  assert.equal(leaveLeader.ok, true);
  const emptyState = service.getPartyState(leader.session.token);
  assert.equal(emptyState.ok, true);
  assert.equal(emptyState.party, null);
});

test("active logout leaves party and clears runtime online state", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const events = [];
  service.onEvent((event) => events.push(event));
  const leader = service.register({"username": "logoutpartya", "password": "test1234", "displayName": "登出队长"});
  const member = service.register({"username": "logoutpartyb", "password": "test1234", "displayName": "登出队员"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  const invite = service.inviteToParty(leader.session.token, {"username": "logoutpartyb"});
  assert.equal(invite.ok, true);
  const accept = service.acceptPartyInvite(member.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);

  const logout = service.logout(member.session.token);
  assert.equal(logout.ok, true);
  const leaderState = service.getPartyState(leader.session.token);
  assert.equal(leaderState.ok, true);
  assert.equal(leaderState.party.memberCount, 1);
  assert.deepEqual(leaderState.party.members.map((player) => player.username), ["logoutpartya"]);
  const memberSession = service.getSession(member.session.token);
  assert.equal(memberSession.ok, false);
  assert.equal(memberSession.code, "session_revoked");
  const online = service.listOnlinePlayers(leader.session.token);
  assert.equal(online.ok, true);
  assert.equal(online.players.some((player) => player.username === "logoutpartyb"), false);
  assert.equal(events.some((event) => event.type === "party.update" && Array.isArray(event.removedAccountIds) && event.removedAccountIds.includes(member.account.accountId)), true);
});

test("party presence marks idle members offline and restores them on activity", () => {
  const store = createMemoryAuthStore();
  let nowMs = Date.parse("2026-02-01T00:00:00.000Z");
  const service = createAuthService({"store": store, "now": () => nowMs});
  const events = [];
  service.onEvent((event) => events.push(event));
  const leader = service.register({"username": "presencea", "password": "test1234", "displayName": "在线队长"});
  const member = service.register({"username": "presenceb", "password": "test1234", "displayName": "离线队员"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  const invite = service.inviteToParty(leader.session.token, {"username": "presenceb"});
  assert.equal(invite.ok, true);
  const accept = service.acceptPartyInvite(member.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);

  nowMs += 30 * 1000;
  const offlineState = service.getPartyState(leader.session.token);
  assert.equal(offlineState.ok, true);
  assert.equal(offlineState.party.memberCount, 2);
  const offlineMember = offlineState.party.members.find((player) => player.username === "presenceb");
  assert.equal(offlineMember.online, false);
  assert.equal(offlineMember.connectionState, "offline");
  assert.equal(offlineMember.offlineSince, "2026-02-01T00:00:25.000Z");
  assert.equal(offlineMember.autoKickAt, "2026-02-01T00:10:25.000Z");

  const restoredState = service.getPartyState(member.session.token);
  assert.equal(restoredState.ok, true);
  const restoredMember = restoredState.party.members.find((player) => player.username === "presenceb");
  assert.equal(restoredMember.online, true);
  assert.equal(restoredMember.connectionState, "online");
  assert.equal(restoredMember.offlineSince, null);
  assert.equal(restoredMember.autoKickAt, null);
  assert.equal(events.some((event) => (
    event.type === "party.update" &&
    event.party &&
    Array.isArray(event.party.members) &&
    event.party.members.some((player) => player.username === "presenceb" && player.online === true)
  )), true);
});

test("party presence removes members after ten minutes offline", () => {
  let nowMs = Date.parse("2026-02-02T00:00:00.000Z");
  const service = createAuthService({"store": createMemoryAuthStore(), "now": () => nowMs});
  const leader = service.register({"username": "kicka", "password": "test1234", "displayName": "踢人队长"});
  const member = service.register({"username": "kickb", "password": "test1234", "displayName": "超时队员"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  const invite = service.inviteToParty(leader.session.token, {"username": "kickb"});
  assert.equal(invite.ok, true);
  const accept = service.acceptPartyInvite(member.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);

  nowMs += 30 * 1000;
  const offlineState = service.getPartyState(leader.session.token);
  assert.equal(offlineState.ok, true);
  assert.equal(offlineState.party.memberCount, 2);
  assert.equal(offlineState.party.members.find((player) => player.username === "kickb").online, false);

  nowMs += 10 * 60 * 1000 + 1;
  const kickedState = service.getPartyState(leader.session.token);
  assert.equal(kickedState.ok, true);
  assert.equal(kickedState.party.memberCount, 1);
  assert.deepEqual(kickedState.party.members.map((player) => player.username), ["kicka"]);
  const memberState = service.getPartyState(member.session.token);
  assert.equal(memberState.ok, true);
  assert.equal(memberState.party, null);
});

test("server movement steps are authoritative and bounded", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const events = [];
  service.onEvent((event) => events.push(event));
  const scout = service.register({"username": "movea", "password": "test1234", "displayName": "移动甲"});
  assert.equal(scout.ok, true);

  const missing = service.movePlayerStep(scout.session.token, {
    "mapId": "firebud_training_yard",
    "fromCellX": 10,
    "fromCellY": 10,
    "toCellX": 11,
    "toCellY": 10,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "movement_position_missing");

  const seed = service.updatePlayerPosition(scout.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 10,
    "cellY": 10,
    "facing": "east",
    "moving": false,
  });
  assert.equal(seed.ok, true);
  const step = service.movePlayerStep(scout.session.token, {
    "mapId": "firebud_training_yard",
    "fromCellX": 10,
    "fromCellY": 10,
    "toCellX": 11,
    "toCellY": 10,
    "moving": false,
  });
  assert.equal(step.ok, true);
  assert.equal(step.authority, "server_step");
  assert.equal(step.position.cellX, 11);
  assert.equal(step.position.movementSeq, 1);
  assert.equal(step.movement.stepAccepted, true);
  assert.equal(events.some((event) => event.type === "online.position" && event.authority === "server_step" && event.position.cellX === 11), true);
  const movementTiming = service.runtimeCapacityMetrics().movementStepTiming;
  assert.equal(movementTiming.successfulCount, 1);
  for (const field of [
    "totalMaxMs",
    "resolveGatesMaxMs",
    "positionPartyFollowMaxMs",
    "positionNormalizeMaxMs",
    "previousPositionMaxMs",
    "positionStoreMaxMs",
    "positionFreezeMaxMs",
    "positionContainerCowMaxMs",
    "positionAssignMaxMs",
    "partyFollowMaxMs",
    "permitMaxMs",
    "publishPositionUpdateMaxMs",
  ]) {
    assert.equal(Number.isFinite(movementTiming[field]), true, field);
    assert.ok(movementTiming[field] >= 0, field);
  }
  assert.equal(movementTiming.peak.successOrdinal, 1);
  assert.equal(movementTiming.peak.relatedPositionUpdates, 0);
  assert.equal(Object.isFrozen(movementTiming), true);
  assert.equal(Object.isFrozen(movementTiming.peak), true);

  const stopSnapshot = service.updatePlayerPosition(scout.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 11,
    "cellY": 10,
    "facing": "south",
    "moving": false,
  });
  assert.equal(stopSnapshot.ok, true);
  assert.equal(stopSnapshot.position.movementSeq, 1);
  assert.equal(service.snapshot().playerPositions[scout.account.accountId].movementSeq, 1);

  const snapshotStepBypass = service.updatePlayerPosition(scout.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 12,
    "cellY": 10,
    "facing": "east",
    "moving": true,
  });
  assert.equal(snapshotStepBypass.ok, false);
  assert.equal(snapshotStepBypass.code, "position_desync");
  assert.equal(snapshotStepBypass.position.cellX, 11);
  assert.equal(snapshotStepBypass.position.movementSeq, 1);

  const stale = service.movePlayerStep(scout.session.token, {
    "mapId": "firebud_training_yard",
    "fromCellX": 10,
    "fromCellY": 10,
    "toCellX": 11,
    "toCellY": 11,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "movement_origin_mismatch");

  const jump = service.movePlayerStep(scout.session.token, {
    "mapId": "firebud_training_yard",
    "fromCellX": 11,
    "fromCellY": 10,
    "toCellX": 14,
    "toCellY": 10,
  });
  assert.equal(jump.ok, false);
  assert.equal(jump.code, "movement_step_too_far");
});

test("server movement rejects diagonal corner cutting and rate-limits rapid valid step spam", () => {
  let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
  const service = createAuthService({store: createMemoryAuthStore(), now: () => nowMs});
  const events = [];
  service.onEvent((event) => events.push(event));
  const corner = service.register({username: "movecorner", password: "test1234", displayName: "夹角移动号"});
  assert.equal(service.updatePlayerPosition(corner.session.token, {
    mapId: "earth_vein_cave_f4", cellX: 9, cellY: 6, moving: false,
  }).ok, true);
  const cornerCut = service.movePlayerStep(corner.session.token, {
    mapId: "earth_vein_cave_f4",
    fromCellX: 9,
    fromCellY: 6,
    toCellX: 10,
    toCellY: 5,
    moving: true,
  });
  assert.equal(cornerCut.ok, false);
  assert.equal(cornerCut.code, "movement_corner_blocked");
  assert.equal(cornerCut.position.movementSeq, 0);
  assert.deepEqual([cornerCut.position.cellX, cornerCut.position.cellY], [9, 6]);

  const spammer = service.register({username: "movespammer", password: "test1234", displayName: "高速移动号"});
  assert.equal(service.updatePlayerPosition(spammer.session.token, {
    mapId: "firebud_training_yard", cellX: 10, cellY: 10, moving: false,
  }).ok, true);
  let fromCellX = 10;
  for (let index = 0; index < 4; index += 1) {
    const toCellX = fromCellX === 10 ? 11 : 10;
    const accepted = service.movePlayerStep(spammer.session.token, {
      mapId: "firebud_training_yard",
      fromCellX,
      fromCellY: 10,
      toCellX,
      toCellY: 10,
      moving: true,
    });
    assert.equal(accepted.ok, true);
    fromCellX = toCellX;
  }
  const positionEventsBeforeLimit = events.filter((event) => (
    event.type === "online.position" && event.accountId === spammer.account.accountId
  )).length;
  const limited = service.movePlayerStep(spammer.session.token, {
    mapId: "firebud_training_yard",
    fromCellX,
    fromCellY: 10,
    toCellX: fromCellX === 10 ? 11 : 10,
    toCellY: 10,
    moving: true,
  });
  assert.equal(limited.ok, false);
  assert.equal(limited.code, "movement_rate_limited");
  assert.equal(limited.movement.requiresSync, false);
  assert.equal(limited.position.movementSeq, 4);
  assert.equal(events.filter((event) => (
    event.type === "online.position" && event.accountId === spammer.account.accountId
  )).length, positionEventsBeforeLimit);

  nowMs += 100;
  const resumed = service.movePlayerStep(spammer.session.token, {
    mapId: "firebud_training_yard",
    fromCellX,
    fromCellY: 10,
    toCellX: fromCellX === 10 ? 11 : 10,
    toCellY: 10,
    moving: true,
  });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.position.movementSeq, 5);
});

test("party members follow the leader and cannot move independently", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const leader = service.register({"username": "followa", "password": "test1234", "displayName": "跟随甲"});
  const member = service.register({"username": "followb", "password": "test1234", "displayName": "跟随乙"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);

  const leaderSeed = service.updatePlayerPosition(leader.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 29,
    "cellY": 27,
    "facing": "east",
    "moving": false,
  });
  const memberSeed = service.updatePlayerPosition(member.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 29,
    "cellY": 26,
    "facing": "east",
    "moving": false,
  });
  assert.equal(leaderSeed.ok, true);
  assert.equal(memberSeed.ok, true);

  const invite = service.inviteToParty(leader.session.token, {"username": "followb"});
  const accept = service.acceptPartyInvite(member.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  assert.equal(accept.party.memberCount, 2);

  const memberMove = service.movePlayerStep(member.session.token, {
    "mapId": "firebud_training_yard",
    "fromCellX": 29,
    "fromCellY": 26,
    "toCellX": 28,
    "toCellY": 26,
  });
  assert.equal(memberMove.ok, false);
  assert.equal(memberMove.code, "movement_party_member_locked");
  assert.equal(memberMove.position.cellX, 29);

  const memberSnapshot = service.updatePlayerPosition(member.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 12,
    "cellY": 12,
    "facing": "south",
    "moving": false,
  });
  assert.equal(memberSnapshot.ok, true);
  assert.equal(memberSnapshot.position.cellX, 29);
  assert.equal(memberSnapshot.position.cellY, 26);
  assert.equal(memberSnapshot.position.authority, "party_follow");

  const leaderStep = service.movePlayerStep(leader.session.token, {
    "mapId": "firebud_training_yard",
    "fromCellX": 29,
    "fromCellY": 27,
    "toCellX": 30,
    "toCellY": 27,
    "moving": false,
  });
  assert.equal(leaderStep.ok, true);
  assert.equal(leaderStep.position.cellX, 30);
  const snapshot = service.snapshot();
  const followerPosition = snapshot.playerPositions[member.account.accountId];
  assert.equal(followerPosition.cellX, 29);
  assert.equal(followerPosition.cellY, 27);
  assert.equal(followerPosition.authority, "party_follow");
  assert.equal(Object.hasOwn(leaderStep, "players"), false);
  const leaderOnlineAfterStep = service.listOnlinePlayers(leader.session.token, {
    scope: "map",
    mapId: "firebud_training_yard",
  });
  const followerOnline = leaderOnlineAfterStep.players.find((player) => player.accountId === member.account.accountId);
  assert.equal(followerOnline.position.cellX, 29);
  assert.equal(followerOnline.position.authority, "party_follow");

  // 队长站在训练场返回村口的传送点旁（warp_to_village_gate 位于 [30, 28]），
  // 通过合法传送把全队带到火芽村入口出生点。
  const leaderMapSwitch = service.updatePlayerPosition(leader.session.token, {
    "mapId": "firebud_village_gate",
    "cellX": 3,
    "cellY": 15,
    "facing": "south",
    "moving": false,
  });
  assert.equal(leaderMapSwitch.ok, true);
  assert.equal(leaderMapSwitch.position.mapId, "firebud_village_gate");
  const switchedSnapshot = service.snapshot();
  const switchedFollowerPosition = switchedSnapshot.playerPositions[member.account.accountId];
  assert.equal(switchedFollowerPosition.mapId, "firebud_village_gate");
  assert.equal(switchedFollowerPosition.cellX, 3);
  assert.equal(switchedFollowerPosition.cellY, 15);
  assert.equal(switchedFollowerPosition.authority, "party_follow");
  assert.equal(Object.hasOwn(leaderMapSwitch, "players"), false);
  const leaderOnlineAfterSwitch = service.listOnlinePlayers(leader.session.token, {
    scope: "map",
    mapId: "firebud_village_gate",
  });
  const switchedFollowerOnline = leaderOnlineAfterSwitch.players.find((player) => player.accountId === member.account.accountId);
  assert.equal(switchedFollowerOnline.position.mapId, "firebud_village_gate");
  assert.equal(switchedFollowerOnline.position.cellX, 3);
  assert.equal(switchedFollowerOnline.position.authority, "party_follow");

  const leaderTeleport = service.updatePlayerPosition(leader.session.token, {
    "mapId": "earth_vein_cave",
    "cellX": 8,
    "cellY": 9,
    "facing": "south",
    "moving": false,
  });
  assert.equal(leaderTeleport.ok, false);
  assert.equal(leaderTeleport.code, "position_transition_invalid");
});

test("position snapshots reject teleports, blocked cells, and illegal map jumps", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const cheater = service.register({"username": "teleporta", "password": "test1234", "displayName": "瞬移甲"});
  assert.equal(cheater.ok, true);

  const outOfBounds = service.updatePlayerPosition(cheater.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 80,
    "cellY": 80,
    "facing": "east",
    "moving": false,
  });
  assert.equal(outOfBounds.ok, false);
  assert.equal(outOfBounds.code, "position_cell_blocked");

  const seed = service.updatePlayerPosition(cheater.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 10,
    "cellY": 10,
    "facing": "east",
    "moving": false,
  });
  assert.equal(seed.ok, true);

  const sameMapTeleport = service.updatePlayerPosition(cheater.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 25,
    "cellY": 25,
    "facing": "east",
    "moving": false,
  });
  assert.equal(sameMapTeleport.ok, false);
  assert.equal(sameMapTeleport.code, "position_desync");
  assert.equal(sameMapTeleport.position.cellX, 10);
  assert.equal(sameMapTeleport.movement.requiresSync, true);

  const crossMapTeleport = service.updatePlayerPosition(cheater.session.token, {
    "mapId": "earth_vein_cave",
    "cellX": 8,
    "cellY": 9,
    "facing": "south",
    "moving": false,
  });
  assert.equal(crossMapTeleport.ok, false);
  assert.equal(crossMapTeleport.code, "position_transition_invalid");
  assert.equal(service.snapshot().playerPositions[cheater.account.accountId].mapId, "firebud_training_yard");

  const walker = service.register({"username": "teleportb", "password": "test1234", "displayName": "瞬移乙"});
  assert.equal(walker.ok, true);
  assert.equal(service.updatePlayerPosition(walker.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 11,
    "cellY": 13,
    "facing": "south",
    "moving": false,
  }).ok, true);
  const blockedStep = service.movePlayerStep(walker.session.token, {
    "mapId": "firebud_training_yard",
    "fromCellX": 11,
    "fromCellY": 13,
    "toCellX": 11,
    "toCellY": 14,
  });
  assert.equal(blockedStep.ok, false);
  assert.equal(blockedStep.code, "movement_cell_blocked");

  // 记录点回城属于合法跨图：默认记录点在火芽村入口。
  const recordReturn = service.updatePlayerPosition(cheater.session.token, {
    "mapId": "firebud_village_gate",
    "cellX": 3,
    "cellY": 15,
    "facing": "south",
    "moving": false,
  });
  assert.equal(recordReturn.ok, true);
  assert.equal(recordReturn.position.mapId, "firebud_village_gate");

  // QA 逃生口：显式允许瞬移的服务不做位置校验。
  const permissive = createAuthService({"store": createMemoryAuthStore(), "allowPositionTeleport": true});
  const tester = permissive.register({"username": "teleportqa", "password": "test1234", "displayName": "瞬移QA"});
  assert.equal(tester.ok, true);
  assert.equal(permissive.updatePlayerPosition(tester.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 10,
    "cellY": 10,
  }).ok, true);
  assert.equal(permissive.updatePlayerPosition(tester.session.token, {
    "mapId": "earth_vein_cave",
    "cellX": 8,
    "cellY": 9,
  }).ok, true);
});

test("online positions are runtime-only and do not trigger store writes", () => {
  const store = createCountingAuthStore();
  const service = createAuthService({"store": store});
  const scout = service.register({"username": "movepersist", "password": "test1234", "displayName": "移动持久化"});
  assert.equal(scout.ok, true);
  const loadsAfterRegister = store.counts.loads;
  const savesAfterRegister = store.counts.saves;

  const seed = service.updatePlayerPosition(scout.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 10,
    "cellY": 10,
    "facing": "east",
    "moving": false,
  });
  assert.equal(seed.ok, true);
  const step = service.movePlayerStep(scout.session.token, {
    "mapId": "firebud_training_yard",
    "fromCellX": 10,
    "fromCellY": 10,
    "toCellX": 11,
    "toCellY": 10,
    "moving": false,
  });
  assert.equal(step.ok, true);
  assert.equal(step.position.cellX, 11);
  assert.equal(store.counts.loads, loadsAfterRegister);
  assert.equal(store.counts.saves, savesAfterRegister);

  const runtimePosition = service.snapshot().playerPositions[scout.account.accountId];
  assert.equal(runtimePosition.cellX, 11);
  assert.equal(runtimePosition.authority, "server_step");
  assert.equal(store.snapshot().playerPositions[scout.account.accountId], undefined);
});

test("online position events project one-account AOI deltas without rebuilding rosters", () => {
  const service = createAuthService({
    store: createMemoryAuthStore(),
    allowPositionTeleport: true,
  });
  const watcher = service.register({username: "deltaa", password: "test1234", displayName: "增量甲"});
  const actor = service.register({username: "deltab", password: "test1234", displayName: "增量乙"});
  const distant = service.register({username: "deltac", password: "test1234", displayName: "增量丙"});
  assert.equal(watcher.ok && actor.ok && distant.ok, true);
  service.updatePlayerPosition(watcher.session.token, {mapId: "firebud_training_yard", cellX: 10, cellY: 10});
  service.updatePlayerPosition(actor.session.token, {mapId: "firebud_training_yard", cellX: 11, cellY: 10});
  service.updatePlayerPosition(distant.session.token, {mapId: "firebud_training_yard", cellX: 50, cellY: 50});

  const events = [];
  service.onEvent((event) => {
    if (event.type === "online.position" && event.accountId === actor.account.accountId) {
      events.push(event);
    }
  });
  const moved = service.updatePlayerPosition(actor.session.token, {
    mapId: "firebud_training_yard",
    cellX: 12,
    cellY: 10,
    moving: true,
  });
  assert.equal(moved.ok, true);
  assert.equal(Object.hasOwn(moved, "players"), false);
  const baseEvent = events.at(-1);
  assert.equal(Object.hasOwn(baseEvent, "players"), false);
  assert.equal(baseEvent.player.accountId, actor.account.accountId);
  assert.equal(baseEvent.presenceRevision > 0, true);

  const watcherDelta = service.eventForConnection({
    accountId: watcher.account.accountId,
    sessionId: watcher.session.sessionId,
  }, baseEvent);
  assert.equal(watcherDelta.ok, true);
  assert.equal(watcherDelta.visible, true);
  assert.equal(watcherDelta.event.change, "upsert");
  assert.equal(watcherDelta.event.player.accountId, actor.account.accountId);
  assert.deepEqual(Object.keys(watcherDelta.event), [
    "type", "change", "accountId", "presenceRevision", "schemaVersion", "createdAt", "player",
  ]);
  assert.deepEqual(Object.keys(watcherDelta.event.player), [
    "accountId", "username", "displayName", "partyId", "partyRole", "position",
  ]);
  assert.deepEqual(Object.keys(watcherDelta.event.player.position), [
    "mapId", "cellX", "cellY", "facing", "moving", "hasCell",
  ]);

  const actorRebase = service.eventForConnection({
    accountId: actor.account.accountId,
    sessionId: actor.session.sessionId,
  }, baseEvent);
  assert.equal(actorRebase.ok, true);
  assert.equal(actorRebase.visible, true);
  assert.equal(actorRebase.event.change, "rebase");
  assert.deepEqual(actorRebase.event.presenceRebase.upserts, []);
  assert.deepEqual(actorRebase.event.presenceRebase.removedAccountIds, []);
  assert.equal(Object.hasOwn(actorRebase.event, "players"), false);

  const distantDelta = service.eventForConnection({
    accountId: distant.account.accountId,
    sessionId: distant.session.sessionId,
  }, baseEvent);
  assert.equal(distantDelta.ok, true);
  assert.equal(distantDelta.visible, false);

  const movedAway = service.updatePlayerPosition(actor.session.token, {
    mapId: "firebud_training_yard",
    cellX: 50,
    cellY: 50,
  });
  assert.equal(movedAway.ok, true);
  const removeEvent = events.at(-1);
  assert.equal(removeEvent.presenceRevision > baseEvent.presenceRevision, true);
  const watcherRemove = service.eventForConnection({
    accountId: watcher.account.accountId,
    sessionId: watcher.session.sessionId,
  }, removeEvent);
  assert.equal(watcherRemove.ok, true);
  assert.equal(watcherRemove.visible, true);
  assert.equal(watcherRemove.event.change, "remove");
  assert.equal(watcherRemove.event.accountId, actor.account.accountId);
  assert.deepEqual(Object.keys(watcherRemove.event), [
    "type", "change", "accountId", "presenceRevision", "schemaVersion", "createdAt",
  ]);
});

test("connection position projection cache is publish-local, AOI-exact, non-self, and post-auth", () => {
  const service = createAuthService({
    store: createMemoryAuthStore(),
    allowPositionTeleport: true,
  });
  const watcherA = service.register({username: "cachewatcha", password: "test1234"});
  const watcherB = service.register({username: "cachewatchb", password: "test1234"});
  const watcherOther = service.register({username: "cachewatchc", password: "test1234"});
  const actor = service.register({username: "cacheactor", password: "test1234"});
  const mapId = "firebud_training_yard";
  service.updatePlayerPosition(watcherA.session.token, {mapId, cellX: 10, cellY: 10});
  service.updatePlayerPosition(watcherB.session.token, {mapId, cellX: 10, cellY: 10});
  service.updatePlayerPosition(watcherOther.session.token, {mapId, cellX: 11, cellY: 10});
  service.updatePlayerPosition(actor.session.token, {mapId, cellX: 12, cellY: 10});

  const events = [];
  service.onEvent((event) => {
    if (event.type === "online.position" && event.accountId === actor.account.accountId) {
      events.push(event);
    }
  });
  service.updatePlayerPosition(actor.session.token, {
    mapId,
    cellX: 13,
    cellY: 10,
    moving: true,
  });
  const sourceEvent = events.at(-1);
  const sharedAoi = {scope: "aoi", mapId, cellX: 10, cellY: 10, radius: 18};
  const otherAoi = {...sharedAoi, cellX: 11};
  const connectionA = {
    accountId: watcherA.account.accountId,
    sessionId: watcherA.session.sessionId,
    aoi: sharedAoi,
  };
  const connectionB = {
    accountId: watcherB.account.accountId,
    sessionId: watcherB.session.sessionId,
    aoi: {...sharedAoi},
  };
  const uncached = service.eventForConnection(connectionA, sourceEvent);
  const publishCache = new Map();
  const cachedA = service.eventForConnection(connectionA, sourceEvent, publishCache);
  const cachedB = service.eventForConnection(connectionB, sourceEvent, publishCache);

  assert.equal(cachedA.ok, true);
  assert.equal(cachedA.visible, true);
  assert.strictEqual(cachedB, cachedA, "same normalized AOI reuses the prepared result");
  assert.strictEqual(cachedB.event, cachedA.event, "same normalized AOI reuses the event object");
  assert.deepEqual(
    Buffer.from(JSON.stringify(cachedA.event)),
    Buffer.from(JSON.stringify(uncached.event)),
    "projection reuse keeps the exact serialized event bytes",
  );

  const other = service.eventForConnection({
    accountId: watcherOther.account.accountId,
    sessionId: watcherOther.session.sessionId,
    aoi: otherAoi,
  }, sourceEvent, publishCache);
  assert.equal(other.visible, true);
  assert.notStrictEqual(other, cachedA, "different normalized AOI gets a distinct prepared result");
  assert.notStrictEqual(other.event, cachedA.event);
  assert.equal(Object.hasOwn(other.event, "aoi"), false, "remote v10 projection never leaks viewer AOI");
  assert.deepEqual(other.event, cachedA.event, "different visible AOIs share the same public wire DTO");

  const self = service.eventForConnection({
    accountId: actor.account.accountId,
    sessionId: actor.session.sessionId,
    aoi: sharedAoi,
  }, sourceEvent, publishCache);
  assert.equal(self.visible, true);
  assert.equal(self.event.change, "rebase");
  assert.notStrictEqual(self, cachedA, "self rebase never enters the remote projection cache");
  assert.notStrictEqual(self.event, cachedA.event);

  const rejected = service.eventForConnection({
    accountId: watcherB.account.accountId,
    sessionId: "missing_cached_session",
    aoi: sharedAoi,
  }, sourceEvent, publishCache);
  assert.equal(rejected.ok, false, "cache lookup cannot bypass per-connection session validation");
  assert.equal(rejected.code, "session_revoked");

  const nextPublish = service.eventForConnection(connectionA, sourceEvent, new Map());
  assert.notStrictEqual(nextPublish, cachedA, "a later publish cache never reuses prior objects");
  assert.notStrictEqual(nextPublish.event, cachedA.event);
  assert.deepEqual(nextPublish, cachedA, "a later publish still produces the same public payload");

  const hiddenAoi = {...sharedAoi, cellX: 100, cellY: 100, radius: 1};
  const hiddenUncached = service.eventForConnection({...connectionA, aoi: hiddenAoi}, sourceEvent);
  const hiddenCached = service.eventForConnection({...connectionA, aoi: hiddenAoi}, sourceEvent, new Map());
  assert.equal(hiddenCached.visible, false);
  assert.deepEqual(hiddenCached, hiddenUncached, "cache preserves invisible AOI semantics");
});

test("authoritative movement rebases the moving viewer across exact AOI boundaries", () => {
  const service = createAuthService({
    store: createMemoryAuthStore(),
    allowPositionTeleport: true,
  });
  const actor = service.register({username: "rebaseact", password: "test1234"});
  const leaving = service.register({username: "rebaseleft", password: "test1234"});
  const entering = service.register({username: "rebasenew", password: "test1234"});
  service.updatePlayerPosition(actor.session.token, {mapId: "firebud_training_yard", cellX: 10, cellY: 10});
  service.updatePlayerPosition(leaving.session.token, {mapId: "firebud_training_yard", cellX: -8, cellY: 10});
  service.updatePlayerPosition(entering.session.token, {mapId: "firebud_training_yard", cellX: 29, cellY: 10});

  const events = [];
  service.onEvent((event) => {
    if (event.type === "online.position" && event.accountId === actor.account.accountId) {
      events.push(event);
    }
  });
  const moved = service.movePlayerStep(actor.session.token, {
    mapId: "firebud_training_yard",
    fromCellX: 10,
    fromCellY: 10,
    toCellX: 11,
    toCellY: 10,
    facing: "east",
    moving: true,
    aoiRadius: 18,
  });
  assert.equal(moved.ok, true);
  const baseEvent = events.at(-1);
  assert.equal(baseEvent.aoi.scope, "aoi");
  assert.equal(baseEvent.aoi.cellX, 11);
  assert.equal(baseEvent.aoi.cellY, 10);

  const projected = service.eventForConnection({
    accountId: actor.account.accountId,
    sessionId: actor.session.sessionId,
  }, baseEvent);
  assert.equal(projected.ok, true);
  assert.equal(projected.event.change, "rebase");
  assert.deepEqual(projected.event.presenceRebase.removedAccountIds, [leaving.account.accountId]);
  assert.deepEqual(
    projected.event.presenceRebase.upserts.map((player) => player.accountId),
    [entering.account.accountId],
  );
  assert.equal(projected.event.presenceRebase.upserts[0].presenceRevision > 0, true);
});

test("self rebase ranks raw map-only accounts before the 64-player cap and excludes self afterward", () => {
  const service = createAuthService({
    store: createMemoryAuthStore(),
    allowPositionTeleport: true,
  });
  const actor = service.register({username: "aa_selfcap", password: "test1234"});
  const remotes = Array.from({length: 65}, (_, index) => service.register({
    username: `caprank${String(index).padStart(3, "0")}`,
    password: "test1234",
  }));
  for (const remote of remotes) {
    const positioned = service.updatePlayerPosition(remote.session.token, {
      mapId: "firebud_training_yard",
      scope: "map",
    });
    assert.equal(positioned.ok, true);
    assert.equal(positioned.position.hasCell, false);
  }
  const events = [];
  service.onEvent((event) => {
    if (event.type === "online.position" && event.accountId === actor.account.accountId) {
      events.push(event);
    }
  });
  const positioned = service.updatePlayerPosition(actor.session.token, {
    mapId: "firebud_training_yard",
    scope: "map",
  });
  assert.equal(positioned.ok, true);
  assert.equal(positioned.position.hasCell, false);
  const sourceEvent = events.at(-1);
  assert.equal(sourceEvent.aoi.scope, "map");

  const projected = service.eventForConnection({
    accountId: actor.account.accountId,
    sessionId: actor.session.sessionId,
  }, sourceEvent);
  assert.equal(projected.ok, true);
  assert.equal(projected.event.change, "rebase");
  // The old roster path capped [self + 63 remotes] before buildPresenceRebase
  // removed self. Map-only/no-cell rows all tie on distance, so username order
  // is the authoritative deterministic tie break.
  assert.equal(projected.event.presenceRebase.upserts.length, 63);
  assert.deepEqual(
    projected.event.presenceRebase.upserts.map((player) => player.username),
    remotes.slice(0, 63).map((remote) => remote.account.username),
  );
  assert.deepEqual(projected.event.presenceRebase.removedAccountIds, []);
  assert.equal(projected.event.presenceRebase.upserts.some((player) => (
    player.accountId === actor.account.accountId
  )), false);
});

test("self rebase invalidates its short cache when runtime sessions are replaced at equal size", () => {
  let nowMs = Date.parse("2026-07-13T08:00:00.000Z");
  const account = (username, accountId) => ({
    accountId,
    username,
    displayName: username,
    role: "player",
    passwordHash: "a".repeat(64),
    createdAt: new Date(nowMs - 60_000).toISOString(),
    schemaVersion: 1,
  });
  const session = (sessionId, accountId, token, expiresAt) => ({
    sessionId,
    accountId,
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    createdAt: new Date(nowMs - 60_000).toISOString(),
    expiresAt,
    revokedAt: null,
    schemaVersion: 1,
  });
  const position = (accountId, username, cellX) => ({
    accountId,
    username,
    displayName: username,
    mapId: "firebud_training_yard",
    cellX,
    cellY: 10,
    facing: "south",
    moving: false,
    updatedAt: new Date(nowMs).toISOString(),
    schemaVersion: 1,
  });
  const viewer = account("equalviewer", "acc_equal_viewer");
  const leaving = account("equalleaving", "acc_equal_leaving");
  const entering = account("equalentering", "acc_equal_entering");
  const viewerToken = "equal_viewer_token";
  const leavingToken = "equal_leaving_token";
  const enteringToken = "equal_entering_token";
  const service = createAuthService({
    now: () => nowMs,
    allowPositionTeleport: true,
    store: createMemoryAuthStore({
      accounts: {
        [viewer.username]: viewer,
        [leaving.username]: leaving,
        [entering.username]: entering,
      },
      sessions: {
        sess_equal_viewer: session("sess_equal_viewer", viewer.accountId, viewerToken, new Date(nowMs + 60_000).toISOString()),
        sess_equal_leaving: session("sess_equal_leaving", leaving.accountId, leavingToken, new Date(nowMs + 26_001).toISOString()),
        sess_equal_entering: session("sess_equal_entering", entering.accountId, enteringToken, new Date(nowMs + 60_000).toISOString()),
      },
    }),
  });
  const viewerConnection = {accountId: viewer.accountId, sessionId: "sess_equal_viewer"};
  const leavingConnection = {accountId: leaving.accountId, sessionId: "sess_equal_leaving"};
  const enteringConnection = {accountId: entering.accountId, sessionId: "sess_equal_entering"};
  assert.equal(service.updatePlayerPosition(viewerToken, position(viewer.accountId, viewer.username, 10)).ok, true);
  assert.equal(service.updatePlayerPosition(leavingToken, position(leaving.accountId, leaving.username, 11)).ok, true);
  assert.equal(service.updatePlayerPosition(enteringToken, position(entering.accountId, entering.username, 12)).ok, true);
  assert.equal(service.markEventConnection(viewerConnection, true).ok, true);
  assert.equal(service.markEventConnection(leavingConnection, true).ok, true);
  nowMs += 26_000;
  assert.equal(service.runPresenceMaintenance().expiredSessionCount, 1);
  const sourceEvent = {
    type: "online.position",
    accountId: viewer.accountId,
    aoi: {scope: "map", mapId: "firebud_training_yard"},
    position: position(viewer.accountId, viewer.username, 10),
    previousPosition: null,
    schemaVersion: 1,
  };
  const before = service.eventForConnection(viewerConnection, sourceEvent);
  assert.deepEqual(
    before.event.presenceRebase.upserts.map((entry) => entry.accountId),
    [leaving.accountId],
  );

  nowMs += 1;
  assert.equal(service.markEventConnection(leavingConnection, false).ok, true);
  assert.equal(service.markEventConnection(enteringConnection, true).ok, true);
  const after = service.eventForConnection(viewerConnection, sourceEvent);
  assert.deepEqual(
    after.event.presenceRebase.upserts.map((entry) => entry.accountId),
    [entering.accountId],
  );
});

test("self rebase invalidates its short cache when a retained idle session becomes active", () => {
  let nowMs = Date.parse("2026-07-13T09:00:00.000Z");
  const service = createAuthService({
    now: () => nowMs,
    allowPositionTeleport: true,
    store: createMemoryAuthStore(),
  });
  const viewer = service.register({username: "staleviewer", password: "test1234"});
  const idle = service.register({username: "staleidle", password: "test1234"});
  assert.equal(service.updatePlayerPosition(viewer.session.token, {
    mapId: "firebud_training_yard", cellX: 10, cellY: 10,
  }).ok, true);
  assert.equal(service.updatePlayerPosition(idle.session.token, {
    mapId: "firebud_training_yard", cellX: 11, cellY: 10,
  }).ok, true);
  const viewerConnection = {
    accountId: viewer.account.accountId,
    sessionId: viewer.session.sessionId,
  };
  assert.equal(service.markEventConnection(viewerConnection, true).ok, true);
  nowMs += 26_000;
  const sourceEvent = {
    type: "online.position",
    accountId: viewer.account.accountId,
    aoi: {scope: "map", mapId: "firebud_training_yard"},
    position: service.snapshot().playerPositions[viewer.account.accountId],
    previousPosition: null,
    schemaVersion: 1,
  };
  const before = service.eventForConnection(viewerConnection, sourceEvent);
  assert.deepEqual(before.event.presenceRebase.upserts, []);

  const refreshed = service.listOnlinePlayers(idle.session.token, {
    scope: "map",
    mapId: "firebud_training_yard",
  });
  assert.equal(refreshed.ok, true);
  const after = service.eventForConnection(viewerConnection, sourceEvent);
  assert.deepEqual(
    after.event.presenceRebase.upserts.map((entry) => entry.accountId),
    [idle.account.accountId],
  );
});

test("connection projection preserves the viewer's advertised AOI radius", () => {
  const service = createAuthService({
    store: createMemoryAuthStore(),
    allowPositionTeleport: true,
  });
  const watcher = service.register({username: "radiuswatch", password: "test1234"});
  const actor = service.register({username: "radiusactor", password: "test1234"});
  service.updatePlayerPosition(actor.session.token, {
    mapId: "firebud_training_yard",
    cellX: 41,
    cellY: 10,
  });
  const watcherPosition = service.updatePlayerPosition(watcher.session.token, {
    mapId: "firebud_training_yard",
    cellX: 10,
    cellY: 10,
    aoiRadius: 48,
  });
  assert.equal(watcherPosition.aoi.radius, 48);

  const events = [];
  service.onEvent((event) => {
    if (event.type === "online.position" && event.accountId === actor.account.accountId) {
      events.push(event);
    }
  });
  service.updatePlayerPosition(actor.session.token, {
    mapId: "firebud_training_yard",
    cellX: 41,
    cellY: 10,
    facing: "east",
  });
  const baseEvent = events.at(-1);
  const defaultRadius = service.eventForConnection({
    accountId: watcher.account.accountId,
    sessionId: watcher.session.sessionId,
  }, baseEvent);
  assert.equal(defaultRadius.visible, false);

  const advertisedRadius = service.eventForConnection({
    accountId: watcher.account.accountId,
    sessionId: watcher.session.sessionId,
    aoi: watcherPosition.aoi,
  }, baseEvent);
  assert.equal(advertisedRadius.ok, true);
  assert.equal(advertisedRadius.visible, true);
  assert.equal(advertisedRadius.event.change, "upsert");
  assert.equal(advertisedRadius.event.player.accountId, actor.account.accountId);
});

test("presence maintenance keeps connected sessions online and emits a bounded idle removal", () => {
  let nowMs = Date.parse("2026-07-12T10:00:00.000Z");
  const service = createAuthService({
    store: createMemoryAuthStore(),
    now: () => nowMs,
    allowPositionTeleport: true,
  });
  const watcher = service.register({username: "idlea", password: "test1234", displayName: "在线甲"});
  const actor = service.register({username: "idleb", password: "test1234", displayName: "离线乙"});
  service.updatePlayerPosition(watcher.session.token, {mapId: "firebud_training_yard", cellX: 10, cellY: 10});
  service.updatePlayerPosition(actor.session.token, {mapId: "firebud_training_yard", cellX: 11, cellY: 10});
  assert.equal(service.markEventConnection({
    accountId: watcher.account.accountId,
    sessionId: watcher.session.sessionId,
  }, true).ok, true);
  assert.equal(service.markEventConnection({
    accountId: actor.account.accountId,
    sessionId: actor.session.sessionId,
  }, true).ok, true);

  const events = [];
  service.onEvent((event) => events.push(event));
  nowMs += 30_000;
  const connectedSweep = service.runPresenceMaintenance();
  assert.equal(connectedSweep.expiredSessionCount, 0);

  assert.equal(service.markEventConnection({
    accountId: actor.account.accountId,
    sessionId: actor.session.sessionId,
  }, false).ok, true);
  nowMs += 26_000;
  const idleSweep = service.runPresenceMaintenance();
  assert.equal(idleSweep.expiredSessionCount, 1);
  assert.equal(idleSweep.removedAccountCount, 1);
  const removal = events.find((event) => (
    event.type === "online.position"
    && event.accountId === actor.account.accountId
    && event.position === null
  ));
  assert.notEqual(removal, undefined);
  assert.equal(removal.authority, "session_idle_timeout");
  const projected = service.eventForConnection({
    accountId: watcher.account.accountId,
    sessionId: watcher.session.sessionId,
  }, removal);
  assert.equal(projected.ok, true);
  assert.equal(projected.visible, true);
  assert.equal(projected.event.change, "remove");
});

test("connection event projection only refreshes idle activity before websocket connection", () => {
  let nowMs = Date.parse("2026-07-12T12:00:00.000Z");
  let nowCalls = 0;
  const service = createAuthService({
    store: createMemoryAuthStore(),
    now: () => {
      nowCalls += 1;
      return nowMs;
    },
  });
  const player = service.register({username: "eventidle", password: "test1234"});
  assert.equal(player.ok, true);
  const connection = {
    accountId: player.account.accountId,
    sessionId: player.session.sessionId,
  };
  const chatEvent = {type: "chat.message", message: {text: "热路径"}};

  nowMs += 10_000;
  nowCalls = 0;
  const beforeConnect = service.eventForConnection(connection, chatEvent);
  assert.equal(beforeConnect.ok, true);
  assert.equal(nowCalls, 2, "expiry validation and unconnected idle refresh each read the clock");

  nowMs += 20_000;
  const refreshedSweep = service.runPresenceMaintenance();
  assert.equal(refreshedSweep.expiredSessionCount, 0, "unconnected projection keeps the handshake race alive");
  assert.equal(service.markEventConnection(connection, true).ok, true);

  nowMs += 30_000;
  nowCalls = 0;
  const afterConnect = service.eventForConnection(connection, chatEvent);
  assert.equal(afterConnect.ok, true);
  assert.equal(nowCalls, 1, "connected projection only validates expiry and skips the redundant idle refresh");
  assert.equal(service.runPresenceMaintenance().expiredSessionCount, 0, "connected websocket remains authoritative past idle TTL");
});

test("connection events expose battle state only for battle and replaced-session events", () => {
  const service = createAuthService({
    store: createMemoryAuthStore(),
    allowPositionTeleport: true,
  });
  const events = [];
  service.onEvent((event) => events.push(event));
  const challenger = service.register({username: "eventbata", password: "test1234"});
  const opponent = service.register({username: "eventbatb", password: "test1234"});
  assert.equal(challenger.ok && opponent.ok, true);
  const challengerConnection = {
    accountId: challenger.account.accountId,
    sessionId: challenger.session.sessionId,
  };

  service.updatePlayerPosition(challenger.session.token, {
    mapId: "firebud_training_yard",
    cellX: 10,
    cellY: 10,
  });
  const positionEvent = events.find((event) => (
    event.type === "online.position"
    && event.accountId === challenger.account.accountId
  ));
  assert.ok(positionEvent);
  const positionProjection = service.eventForConnection(challengerConnection, positionEvent);
  assert.equal(positionProjection.ok, true);
  assert.equal(Object.hasOwn(positionProjection, "activeBattleRoom"), false);

  assert.equal(service.sendChatMessage(challenger.session.token, {
    channel: "nearby",
    text: "准备开战",
  }).ok, true);
  const chatEvent = events.find((event) => event.type === "chat.message");
  assert.ok(chatEvent);
  const chatProjection = service.eventForConnection(challengerConnection, chatEvent);
  assert.equal(chatProjection.ok, true);
  assert.equal(Object.hasOwn(chatProjection, "activeBattleRoom"), false);

  service.updatePlayerPosition(opponent.session.token, {
    mapId: "firebud_training_yard",
    cellX: 11,
    cellY: 10,
  });
  const invite = service.inviteToBattle(challenger.session.token, {username: opponent.account.username});
  assert.equal(invite.ok, true);
  const accepted = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accepted.ok, true);
  const roomReadyEvent = events.find((event) => (
    event.type === "battle.room_ready"
    && event.room
    && event.room.roomId === accepted.room.roomId
  ));
  assert.ok(roomReadyEvent);
  const roomReadyProjection = service.eventForConnection(challengerConnection, roomReadyEvent);
  assert.equal(roomReadyProjection.ok, true);
  assert.equal(Object.hasOwn(roomReadyProjection, "activeBattleRoom"), true);
  assert.equal(roomReadyProjection.activeBattleRoom, true);

  const replacementLogin = service.login({username: challenger.account.username, password: "test1234"});
  assert.equal(replacementLogin.ok, true);
  const replacementEvent = events.find((event) => (
    event.type === "session.replaced"
    && event.targetSessionIds.includes(challenger.session.sessionId)
  ));
  assert.ok(replacementEvent);
  const replacementProjection = service.eventForConnection(challengerConnection, replacementEvent);
  assert.equal(replacementProjection.ok, true);
  assert.equal(replacementProjection.visible, true);
  assert.equal(Object.hasOwn(replacementProjection, "activeBattleRoom"), true);
  assert.equal(replacementProjection.activeBattleRoom, true);

  assert.equal(service.leaveBattleRoom(opponent.session.token, accepted.room.roomId).ok, true);
  const roomClosedEvent = events.find((event) => (
    event.type === "battle.room_closed"
    && event.roomId === accepted.room.roomId
  ));
  assert.ok(roomClosedEvent);
  const roomClosedProjection = service.eventForConnection({
    accountId: challenger.account.accountId,
    sessionId: replacementLogin.session.sessionId,
  }, roomClosedEvent);
  assert.equal(roomClosedProjection.ok, true);
  assert.equal(Object.hasOwn(roomClosedProjection, "activeBattleRoom"), true);
  assert.equal(roomClosedProjection.activeBattleRoom, false);
});

test("presence maintenance removes an expired session even while its websocket was connected", () => {
  let nowMs = Date.parse("2026-07-01T00:00:00.000Z");
  const service = createAuthService({
    store: createMemoryAuthStore(),
    now: () => nowMs,
    allowPositionTeleport: true,
  });
  const actor = service.register({username: "expireda", password: "test1234"});
  nowMs += 6 * 24 * 60 * 60 * 1000;
  const watcher = service.register({username: "expiredw", password: "test1234"});
  service.updatePlayerPosition(actor.session.token, {mapId: "firebud_training_yard", cellX: 10, cellY: 10});
  service.updatePlayerPosition(watcher.session.token, {mapId: "firebud_training_yard", cellX: 11, cellY: 10});
  service.markEventConnection({
    accountId: actor.account.accountId,
    sessionId: actor.session.sessionId,
  }, true);
  service.markEventConnection({
    accountId: watcher.account.accountId,
    sessionId: watcher.session.sessionId,
  }, true);

  const events = [];
  service.onEvent((event) => events.push(event));
  nowMs += 2 * 24 * 60 * 60 * 1000;
  const sweep = service.runPresenceMaintenance();
  assert.equal(sweep.expiredSessionCount, 1);
  assert.equal(sweep.removedAccountCount, 1);
  const removal = events.find((event) => (
    event.type === "online.position"
    && event.accountId === actor.account.accountId
    && event.position === null
  ));
  assert.notEqual(removal, undefined);
  const roster = service.listOnlinePlayers(watcher.session.token, {scope: "map", mapId: "firebud_training_yard"});
  assert.equal(roster.players.some((player) => player.accountId === actor.account.accountId), false);
  const projected = service.eventForConnection({
    accountId: watcher.account.accountId,
    sessionId: watcher.session.sessionId,
  }, removal);
  assert.equal(projected.ok, true);
  assert.equal(projected.event.change, "remove");
});

test("players can publish map positions into the online roster", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const scout = service.register({"username": "posa", "password": "test1234", "displayName": "同步甲"});
  const watcher = service.register({"username": "posb", "password": "test1234", "displayName": "同步乙"});
  assert.equal(scout.ok, true);
  assert.equal(watcher.ok, true);

  const updated = service.updatePlayerPosition(scout.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 12,
    "cellY": 8,
    "facing": "east",
    "moving": true,
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.position.mapId, "firebud_training_yard");
  assert.equal(updated.position.cellX, 12);
  assert.equal(updated.position.facing, "east");
  assert.equal(updated.position.hasCell, true);
  assert.equal(updated.position.precision, "cell");

  const online = service.listOnlinePlayers(watcher.session.token);
  assert.equal(online.ok, true);
  const scoutRow = online.players.find((player) => player.username === "posa");
  assert.notEqual(scoutRow, undefined);
  assert.equal(scoutRow.position.mapId, "firebud_training_yard");
  assert.equal(scoutRow.position.cellY, 8);
});

test("map-only presence keeps other-player cells private while the owner retains exact movement authority", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const scout = service.register({"username": "mapa", "password": "test1234", "displayName": "地图甲"});
  const watcher = service.register({"username": "mapb", "password": "test1234", "displayName": "地图乙"});
  assert.equal(scout.ok, true);
  assert.equal(watcher.ok, true);

  const precise = service.updatePlayerPosition(scout.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 12,
    "cellY": 8,
    "facing": "east",
    "moving": false,
  });
  assert.equal(precise.ok, true);
  assert.equal(precise.position.hasCell, true);
  assert.equal(precise.position.precision, "cell");

  const mapOnly = service.updatePlayerPosition(scout.session.token, {
    "mapId": "firebud_training_yard",
    "scope": "map",
    "cellX": 12,
    "cellY": 8,
    "facing": "east",
  });
  assert.equal(mapOnly.ok, true);
  assert.equal(mapOnly.position.mapId, "firebud_training_yard");
  assert.equal(mapOnly.position.hasCell, true);
  assert.equal(mapOnly.position.precision, "cell");
  assert.equal(mapOnly.position.cellX, 12);
  assert.equal(mapOnly.position.cellY, 8);

  const stored = service.snapshot().playerPositions[scout.account.accountId];
  assert.equal(stored.mapId, "firebud_training_yard");
  assert.equal(stored.cellX, 12);
  assert.equal(stored.cellY, 8);
  assert.equal(stored.hasCell, true);
  assert.equal(stored.publicPrecision, "map");
  assert.equal(stored.movementSeq, precise.position.movementSeq);

  const sameMap = service.listOnlinePlayers(watcher.session.token, {"scope": "map", "mapId": "firebud_training_yard"});
  assert.equal(sameMap.ok, true);
  const sameMapScout = sameMap.players.find((player) => player.username === "mapa");
  assert.notEqual(sameMapScout, undefined);
  assert.equal(sameMapScout.position.mapId, "firebud_training_yard");
  assert.equal(sameMapScout.position.hasCell, false);
  assert.equal(sameMapScout.position.precision, "map");

  const relogged = service.login({"username": "mapa", "password": "test1234"});
  assert.equal(relogged.ok, true);
  assert.equal(relogged.runtimePosition.hasCell, true);
  assert.equal(relogged.runtimePosition.precision, "cell");
  assert.deepEqual([relogged.runtimePosition.cellX, relogged.runtimePosition.cellY], [12, 8]);
  const desynced = service.updatePlayerPosition(relogged.session.token, {
    "mapId": "firebud_training_yard",
    "scope": "map",
    "cellX": 13,
    "cellY": 8,
  });
  assert.equal(desynced.ok, false);
  assert.equal(desynced.code, "position_desync");
  assert.equal(desynced.position.hasCell, true);
  assert.equal(desynced.position.precision, "cell");
  assert.deepEqual([desynced.position.cellX, desynced.position.cellY], [12, 8]);

  const aoi = service.listOnlinePlayers(watcher.session.token, {
    "scope": "aoi",
    "mapId": "firebud_training_yard",
    "cellX": 12,
    "cellY": 8,
    "radius": 1,
  });
  assert.equal(aoi.ok, true);
  assert.equal(aoi.players.some((player) => player.username === "mapa"), false);
});

test("an explicit AOI snapshot without a position anchor fails closed instead of exposing every map", () => {
  const service = createAuthService({
    store: createMemoryAuthStore(),
    allowPositionTeleport: true,
  });
  const actor = service.register({username: "anchored", password: "test1234"});
  service.updatePlayerPosition(actor.session.token, {
    mapId: "secret_map",
    cellX: 123,
    cellY: 456,
  });
  const viewer = service.register({username: "unanchored", password: "test1234"});

  const bounded = service.listOnlinePlayers(viewer.session.token, {scope: "aoi"});
  assert.equal(bounded.ok, true);
  assert.equal(bounded.aoi.scope, "none");
  assert.equal(bounded.aoi.mapId, "");
  assert.equal(bounded.players.some((player) => player.accountId === actor.account.accountId), false);
  assert.equal(bounded.players.every((player) => player.accountId === viewer.account.accountId), true);

  const explicitNone = service.listOnlinePlayers(viewer.session.token, {scope: "none"});
  assert.equal(explicitNone.aoi.scope, "none");
  assert.equal(explicitNone.players.some((player) => player.accountId === actor.account.accountId), false);

  const explicitAll = service.listOnlinePlayers(viewer.session.token);
  assert.equal(explicitAll.players.some((player) => player.accountId === actor.account.accountId), true);
});

test("online roster can be filtered by map area of interest", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const watcher = service.register({"username": "aoia", "password": "test1234", "displayName": "观察甲"});
  const nearby = service.register({"username": "aoib", "password": "test1234", "displayName": "附近乙"});
  const distant = service.register({"username": "aoic", "password": "test1234", "displayName": "远处丙"});
  const otherMap = service.register({"username": "aoid", "password": "test1234", "displayName": "异图丁"});
  assert.equal(watcher.ok, true);
  assert.equal(nearby.ok, true);
  assert.equal(distant.ok, true);
  assert.equal(otherMap.ok, true);

  const watcherPosition = service.updatePlayerPosition(watcher.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 10,
    "cellY": 10,
    "facing": "south",
    "moving": false,
  });
  assert.equal(watcherPosition.ok, true);
  assert.equal(watcherPosition.aoi.scope, "aoi");
  service.updatePlayerPosition(nearby.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 12,
    "cellY": 11,
    "facing": "west",
    "moving": false,
  });
  service.updatePlayerPosition(distant.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 33,
    "cellY": 32,
    "facing": "west",
    "moving": false,
  });
  service.updatePlayerPosition(otherMap.session.token, {
    "mapId": "coral_coast",
    "cellX": 12,
    "cellY": 11,
    "facing": "west",
    "moving": false,
  });

  const all = service.listOnlinePlayers(watcher.session.token);
  assert.equal(all.ok, true);
  assert.deepEqual(all.players.map((player) => player.username).sort(), ["aoia", "aoib", "aoic", "aoid"]);

  const scoped = service.listOnlinePlayers(watcher.session.token, {"scope": "aoi", "radius": 4});
  assert.equal(scoped.ok, true);
  assert.equal(scoped.aoi.scope, "aoi");
  assert.deepEqual(scoped.players.map((player) => player.username).sort(), ["aoia", "aoib"]);

  const sameMap = service.listOnlinePlayers(watcher.session.token, {"scope": "map", "mapId": "firebud_training_yard"});
  assert.equal(sameMap.ok, true);
  assert.equal(sameMap.aoi.scope, "map");
  assert.deepEqual(sameMap.players.map((player) => player.username).sort(), ["aoia", "aoib", "aoic"]);

  const explicit = service.listOnlinePlayers(watcher.session.token, {
    "scope": "aoi",
    "mapId": "firebud_training_yard",
    "cellX": 33,
    "cellY": 32,
    "radius": 1,
  });
  assert.equal(explicit.ok, true);
  assert.deepEqual(explicit.players.map((player) => player.username).sort(), ["aoia", "aoic"]);
});

test("players can chat nearby and inside server parties", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const leader = service.register({"username": "chata", "password": "test1234", "displayName": "聊甲"});
  const member = service.register({"username": "chatb", "password": "test1234", "displayName": "聊乙"});
  const outsider = service.register({"username": "chatc", "password": "test1234", "displayName": "聊丙"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(outsider.ok, true);

  const nearby = service.sendChatMessage(leader.session.token, {"channel": "nearby", "text": "火芽村集合"});
  assert.equal(nearby.ok, true);
  assert.equal(nearby.message.senderUsername, "chata");
  const nearbyList = service.listChatMessages(member.session.token, {"channel": "nearby"});
  assert.equal(nearbyList.ok, true);
  assert.equal(nearbyList.messages.length, 1);
  assert.equal(nearbyList.messages[0].text, "火芽村集合");

  const blockedTeam = service.sendChatMessage(leader.session.token, {"channel": "team", "text": "队伍内见"});
  assert.equal(blockedTeam.ok, false);
  assert.equal(blockedTeam.code, "chat_team_missing");

  const invite = service.inviteToParty(leader.session.token, {"username": "chatb"});
  assert.equal(invite.ok, true);
  const memberState = service.getPartyState(member.session.token);
  const accept = service.acceptPartyInvite(member.session.token, memberState.incomingInvites[0].inviteId);
  assert.equal(accept.ok, true);

  const team = service.sendChatMessage(member.session.token, {"channel": "team", "text": "队伍频道已通"});
  assert.equal(team.ok, true);
  assert.equal(team.message.partyId, accept.party.partyId);
  const leaderTeam = service.listChatMessages(leader.session.token, {"channel": "team"});
  assert.equal(leaderTeam.ok, true);
  assert.equal(leaderTeam.messages.length, 1);
  assert.equal(leaderTeam.messages[0].text, "队伍频道已通");
  const outsiderTeam = service.listChatMessages(outsider.session.token, {"channel": "team"});
  assert.equal(outsiderTeam.ok, true);
  assert.equal(outsiderTeam.messages.length, 0);
});

test("sending a nearby message completes the chat tutorial with an authoritative profile", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const player = service.register({"username": "chat_tutorial", "password": "test1234", "displayName": "聊天学员"});
  const profile = battleProfile("聊天学员", {"level": 3, "hp": 120, "maxHp": 120}, null);
  profile.stoneCoins = 0;
  profile.activeQuestId = "quest_chat_greeting";
  profile.questStates = {"quest_chat_greeting": {"questId": "quest_chat_greeting", "status": "active", "progress": 0}};
  assert.equal(service.saveProfile(player.session.token, {"expectedRevision": 0, profile}).ok, true);

  const sent = service.sendChatMessage(player.session.token, {"channel": "nearby", "text": "大家好"});
  assert.equal(sent.ok, true);
  assert.equal(sent.profile.activeQuestId, "quest_training_partner_intro");
  assert.equal(sent.profile.stoneCoins, 5);
  assert.equal(sent.questMessages.length > 0, true);
});

test("chat stays available without mutating quests when profile assets are unsafe", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const player = seedService.register({username: "chat_unsafe_assets", password: "test1234", displayName: "聊天坏档号"});
  const profile = battleProfile("聊天坏档号", {level: 3, hp: 120, maxHp: 120}, null);
  profile.stoneCoins = 0;
  profile.activeQuestId = "quest_chat_greeting";
  profile.questStates = {quest_chat_greeting: {questId: "quest_chat_greeting", status: "active", progress: 0}};
  assert.equal(seedService.saveProfile(player.session.token, {expectedRevision: 0, profile}).ok, true);
  const seed = seedService.snapshot();
  const binding = seed.profileBindings[player.account.accountId];
  seed.profiles[binding.playerId].profile.backpackSlots = [{
    itemId: "future_chat_relic_999",
    count: 1,
    futureEnvelope: {schemaVersion: 99},
  }];
  const before = structuredClone(seed.profiles[binding.playerId].profile);
  const revisionBefore = binding.profileRevision;
  const service = createAuthService({store: createMemoryAuthStore(seed)});

  const sent = service.sendChatMessage(player.session.token, {channel: "nearby", text: "坏档也能聊天"});

  assert.equal(sent.ok, true);
  assert.equal(sent.profile, undefined);
  assert.deepEqual(sent.questMessages, []);
  assert.equal(service.listChatMessages(player.session.token, {channel: "nearby"}).messages[0].text, "坏档也能聊天");
  const after = service.snapshot();
  assert.equal(after.profileBindings[player.account.accountId].profileRevision, revisionBefore);
  assert.deepEqual(after.profiles[binding.playerId].profile, before);
});
