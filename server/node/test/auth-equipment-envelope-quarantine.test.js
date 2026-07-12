"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
} = require("../test-support/auth-service-test-context");

const DUPLICATE_CODE = "equipment_transfer_envelope_duplicate";

function seedEquipmentMail() {
  const service = createAuthService({store: createMemoryAuthStore()});
  const sender = service.register({
    username: "escrow_q_sender",
    password: "test1234",
    displayName: "托管隔离寄件人",
  });
  const recipient = service.register({
    username: "escrow_q_recipient",
    password: "test1234",
    displayName: "托管隔离收件人",
  });
  const current = service.getProfile(sender.session.token);
  const profile = current.profile;
  profile.backpackSlots = [
    {itemId: "weapon_wooden_club", count: 1},
    ...Array.from({length: 14}, () => ({})),
  ];
  profile.equipmentInstances = {
    equip_quarantine_source: {
      schemaVersion: 1,
      instanceId: "equip_quarantine_source",
      itemId: "weapon_wooden_club",
      location: "backpack",
      slotId: "",
      durability: 30,
      enhancement: {itemId: "weapon_wooden_club", level: 3, history: []},
      wearCounters: {itemId: "weapon_wooden_club", attackCount: 0, hitCount: 0},
      expPillCharge: {},
      source: "equipment_envelope_quarantine_test",
    },
  };
  profile.equipmentSlotInstanceIds = {};
  profile.equipmentSlotsVersion = 5;
  profile.nextEquipmentInstanceSerial = 1;
  assert.equal(service.saveProfile(sender.session.token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile,
  }).ok, true);
  const sent = service.sendMail(sender.session.token, {
    recipientUsername: recipient.account.username,
    title: "托管隔离测试",
    body: "这封邮件提供一份有效的服务器装备信封。",
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      instanceId: "equip_quarantine_source",
      sourceSlotIndex: 0,
    }],
  });
  assert.equal(sent.ok, true, JSON.stringify(sent));
  const snapshot = service.snapshot();
  const envelope = snapshot.mailMessages[sent.mail.mailId].equipmentEnvelopes[0];
  assert.ok(envelope && envelope.envelopeId);
  return {service, sender, recipient, envelope};
}

function addMaterializedReplay(profile, envelope, instanceId = "equip_quarantine_replay") {
  const candidate = structuredClone(profile);
  const slots = Array.isArray(candidate.backpackSlots) ? candidate.backpackSlots : [];
  while (slots.length < 15) {
    slots.push({});
  }
  const slotIndex = slots.findIndex((slot) => String(slot && slot.itemId || "") === "");
  assert.notEqual(slotIndex, -1);
  slots[slotIndex] = {itemId: envelope.itemId, count: 1};
  candidate.backpackSlots = slots;
  candidate.equipmentInstances = {
    ...(candidate.equipmentInstances || {}),
    [instanceId]: {
      ...structuredClone(envelope.instanceState),
      instanceId,
      location: "backpack",
      slotId: "",
      transferProvenance: {
        schemaVersion: 1,
        originEnvelopeId: envelope.envelopeId,
      },
    },
  };
  candidate.equipmentSlotInstanceIds = candidate.equipmentSlotInstanceIds || {};
  candidate.equipmentSlotsVersion = 5;
  return candidate;
}

test("full profile save audits the candidate snapshot before committing a duplicate envelope owner", () => {
  const {service, sender, envelope} = seedEquipmentMail();
  const before = service.snapshot();
  const current = service.getProfile(sender.session.token);
  const candidate = addMaterializedReplay(current.profile, envelope);

  const saved = service.saveProfile(sender.session.token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile: candidate,
  });

  assert.deepEqual(saved, {
    ok: false,
    code: DUPLICATE_CODE,
    message: "装备托管档案存在重复归属，相关资产操作已暂停，请联系GM处理。",
  });
  assert.deepEqual(service.snapshot(), before);
});

test("duplicate envelope quarantine leaves reads available and blocks unrelated asset destruction atomically", () => {
  const seeded = seedEquipmentMail();
  const corrupted = seeded.service.snapshot();
  const senderBinding = corrupted.profileBindings[seeded.sender.account.accountId];
  const senderDoc = corrupted.profiles[senderBinding.playerId];
  senderDoc.profile = addMaterializedReplay(senderDoc.profile, seeded.envelope);
  const service = createAuthService({store: createMemoryAuthStore(corrupted)});

  assert.equal(service.getProfile(seeded.sender.session.token).ok, true);
  const inbox = service.listInbox(seeded.recipient.session.token);
  assert.equal(inbox.ok, true, JSON.stringify(inbox));
  assert.equal(inbox.messages.length, 1);
  const before = service.snapshot();

  for (const result of [
    service.shopTransaction(seeded.sender.session.token, {
      mode: "sell",
      shopId: "firebud_equipment_shop",
      itemId: "weapon_wooden_club",
      amount: 1,
    }),
    service.profileAction(seeded.sender.session.token, {
      action: "backpack_discard_item",
      payload: {sourceSlotIndex: 0, quantity: 1},
    }),
  ]) {
    assert.deepEqual(result, {
      ok: false,
      code: DUPLICATE_CODE,
      message: "装备托管档案存在重复归属，相关资产操作已暂停，请联系GM处理。",
    });
    assert.equal(JSON.stringify(result).includes(seeded.envelope.envelopeId), false);
    assert.equal(Object.hasOwn(result, "ownerships"), false);
    assert.deepEqual(service.snapshot(), before);
  }
});

test("two accounts materializing one consumed origin freeze equipment re-export atomically", () => {
  const seeded = seedEquipmentMail();
  const claimed = seeded.service.claimMailAttachments(
    seeded.recipient.session.token,
    Object.keys(seeded.service.snapshot().mailMessages)[0],
  );
  assert.equal(claimed.ok, true, JSON.stringify(claimed));
  const corrupted = seeded.service.snapshot();
  const recipientBinding = corrupted.profileBindings[seeded.recipient.account.accountId];
  const recipientProfile = corrupted.profiles[recipientBinding.playerId].profile;
  const originalInstance = Object.values(recipientProfile.equipmentInstances).find((entry) => (
    entry.transferProvenance
    && entry.transferProvenance.originEnvelopeId === seeded.envelope.envelopeId
  ));
  assert.ok(originalInstance);
  const senderBinding = corrupted.profileBindings[seeded.sender.account.accountId];
  const senderProfile = corrupted.profiles[senderBinding.playerId].profile;
  const duplicateInstanceId = "equip_quarantine_other_account";
  senderProfile.equipmentInstances[duplicateInstanceId] = {
    ...structuredClone(originalInstance),
    instanceId: duplicateInstanceId,
  };
  const senderSlotIndex = senderProfile.backpackSlots.findIndex((slot) => String(slot && slot.itemId || "") === "");
  assert.notEqual(senderSlotIndex, -1);
  senderProfile.backpackSlots[senderSlotIndex] = {itemId: originalInstance.itemId, count: 1};

  const service = createAuthService({store: createMemoryAuthStore(corrupted)});
  const before = service.snapshot();
  const recipientSlotIndex = recipientProfile.backpackSlots.findIndex((slot) => slot.itemId === originalInstance.itemId);
  const exported = service.bankDeposit(seeded.recipient.session.token, {
    items: [{
      itemId: originalInstance.itemId,
      count: 1,
      instanceId: originalInstance.instanceId,
      sourceSlotIndex: recipientSlotIndex,
      bankSlotIndex: 0,
    }],
  });
  assert.deepEqual(exported, {
    ok: false,
    code: DUPLICATE_CODE,
    message: "装备托管档案存在重复归属，相关资产操作已暂停，请联系GM处理。",
  });
  assert.deepEqual(service.snapshot(), before);
});

test("malformed consumed ledger is quarantined behind the same non-leaking player error", () => {
  const seeded = seedEquipmentMail();
  const corrupted = seeded.service.snapshot();
  corrupted.consumedEquipmentEnvelopes = null;
  const service = createAuthService({store: createMemoryAuthStore(corrupted)});
  const before = service.snapshot();
  const result = service.shopTransaction(seeded.sender.session.token, {
    mode: "sell",
    shopId: "firebud_equipment_shop",
    itemId: "weapon_wooden_club",
    amount: 1,
  });
  assert.deepEqual(result, {
    ok: false,
    code: DUPLICATE_CODE,
    message: "装备托管档案存在重复归属，相关资产操作已暂停，请联系GM处理。",
  });
  assert.deepEqual(service.snapshot(), before);
});
