"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {loadBattleEquipmentCatalog} = require("../src/auth/battle-equipment-rules");
const {
  MAIL_ATTACHMENT_SCHEMA_VERSION,
  buildMailAttachmentState,
  readMailAttachmentState,
  updateMailAttachmentState,
} = require("../src/auth/mail-attachment-state");

const equipmentCatalog = loadBattleEquipmentCatalog();
const equipmentItemId = "weapon_wooden_club";
const ordinaryItemId = "item_meat_small";
const fixture = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, "../../../tools/fixtures/equipment_transfer_public_v1_vectors.json"),
  "utf8",
));
const baseEnvelope = fixture.vectors[0].internalEnvelope;
const options = {
  itemById(itemId) {
    return itemId === ordinaryItemId || equipmentCatalog.itemById.has(itemId) ? {id: itemId} : null;
  },
  isEquipmentItemId(itemId) {
    return equipmentCatalog.itemById.has(itemId);
  },
  equipmentTransferOptions: {
    weaponAttacksPerDurability: 100,
    armorHitsPerDurability: 10,
  },
};

function mailMetadata(overrides = {}) {
  return {
    mailId: "mail_attachment_rule_1",
    mailKind: "player",
    senderAccountId: "account_sender",
    senderUsername: "sender",
    senderDisplayName: "寄件人",
    recipientAccountId: "account_recipient",
    recipientUsername: "recipient",
    recipientDisplayName: "收件人",
    title: "附件规则测试",
    body: "附件必须无损并失败关闭。",
    createdAt: "2026-07-12T00:00:00.000Z",
    readAt: null,
    ...overrides,
  };
}

function equipmentEnvelope(id, sourceInstanceId) {
  const envelope = structuredClone(baseEnvelope);
  envelope.envelopeId = id;
  envelope.provenance.sourceInstanceId = sourceInstanceId;
  return envelope;
}

function mixedMail() {
  return buildMailAttachmentState({
    ...mailMetadata(),
    items: [
      {itemId: ordinaryItemId, count: 5},
      {itemId: equipmentItemId, count: 2},
    ],
    equipmentEnvelopes: [
      equipmentEnvelope("eqx_mail_rule_0001", "equip_sender_0001"),
      equipmentEnvelope("eqx_mail_rule_0002", "equip_sender_0002"),
    ],
    currency: {stoneCoins: 17, diamonds: 2},
  }, equipmentCatalog, options);
}

test("mail schema1 preserves ordinary attachments and upgrades only the canonical view", () => {
  const legacy = {
    ...mailMetadata(),
    items: [
      {itemId: ordinaryItemId, count: 2},
      {itemId: ordinaryItemId, count: 3},
    ],
    currency: {coins: 17, diamond: 2},
    currencies: {stoneCoins: 17, diamonds: 2},
    schemaVersion: 1,
  };
  const before = structuredClone(legacy);
  const result = readMailAttachmentState(legacy, equipmentCatalog, options);

  assert.equal(result.ok, true);
  assert.equal(result.sourceSchemaVersion, 1);
  assert.equal(result.changed, true);
  assert.equal(result.mail.schemaVersion, MAIL_ATTACHMENT_SCHEMA_VERSION);
  assert.deepEqual(result.items, [{itemId: ordinaryItemId, count: 5}]);
  assert.deepEqual(result.equipmentEnvelopes, []);
  assert.deepEqual(result.currency, {stoneCoins: 17, diamonds: 2});
  assert.equal(Object.hasOwn(result.mail, "currencies"), false);
  assert.deepEqual(legacy, before);
});

test("mail schema1 template-only equipment remains blocked even when the raw entry is malformed", () => {
  for (const items of [
    [{itemId: equipmentItemId, count: 1}],
    [{itemId: equipmentItemId, count: "bad", futureMeta: {keep: true}}],
  ]) {
    const legacy = {...mailMetadata(), items, currency: {stoneCoins: 9}, schemaVersion: 1};
    const before = structuredClone(legacy);
    const result = readMailAttachmentState(legacy, equipmentCatalog, options);
    assert.equal(result.ok, false);
    assert.equal(result.code, "mail_equipment_transfer_unsupported");
    assert.deepEqual(legacy, before);
  }
});

test("mail schema2 keeps a strict all-item summary and complete private equipment envelopes", () => {
  const built = mixedMail();
  assert.equal(built.ok, true);
  assert.equal(built.mail.schemaVersion, MAIL_ATTACHMENT_SCHEMA_VERSION);
  assert.deepEqual(built.items, [
    {itemId: ordinaryItemId, count: 5},
    {itemId: equipmentItemId, count: 2},
  ]);
  assert.deepEqual(built.ordinaryItems, [{itemId: ordinaryItemId, count: 5}]);
  assert.deepEqual(built.equipmentItems, [{itemId: equipmentItemId, count: 2}]);
  assert.equal(built.equipmentEnvelopes.length, 2);
  assert.deepEqual(built.equipmentEnvelopes[0].provenance, {
    schemaVersion: 1,
    sourceInstanceId: "equip_sender_0001",
  });
  assert.equal(built.equipmentEnvelopes[0].instanceState.source, "market_escrow");
  assert.deepEqual(built.equipmentEnvelopes[0].instanceState.futureVisual, {glow: "amber"});
  assert.deepEqual(built.equipmentEnvelopes[0].instanceState.transferProvenance, {
    schemaVersion: 1,
    originEnvelopeId: "eqx_private_previous_0001",
    sourceInstanceId: "equip_000017",
  });

  const reread = readMailAttachmentState(built.mail, equipmentCatalog, options);
  assert.equal(reread.ok, true);
  assert.equal(reread.changed, false);
  assert.deepEqual(reread.mail, built.mail);
});

test("mail schema2 rejects summary drift, duplicate or corrupt envelopes, and unknown or future data without mutation", () => {
  const valid = mixedMail();
  assert.equal(valid.ok, true);
  const scenarios = [
    {
      code: "mail_equipment_summary_mismatch",
      mutate(mail) { mail.items.find((item) => item.itemId === equipmentItemId).count = 1; },
    },
    {
      code: "mail_equipment_summary_mismatch",
      mutate(mail) { mail.equipmentEnvelopes.pop(); },
    },
    {
      code: "equipment_transfer_envelope_duplicate",
      mutate(mail) { mail.equipmentEnvelopes[1] = structuredClone(mail.equipmentEnvelopes[0]); },
    },
    {
      code: "equipment_transfer_fingerprint_mismatch",
      mutate(mail) { mail.equipmentEnvelopes[0].instanceState.durability = 17; },
    },
    {
      code: "equipment_transfer_envelope_schema_future",
      mutate(mail) { mail.equipmentEnvelopes[0].schemaVersion = 2; },
    },
    {
      code: "mail_item_unknown",
      mutate(mail) { mail.items.push({itemId: "future_mail_item_999", count: 1}); },
    },
    {
      code: "mail_schema_unsupported",
      mutate(mail) { mail.futureAssets = {keep: true}; },
    },
    {
      code: "mail_schema_future",
      mutate(mail) { mail.schemaVersion = MAIL_ATTACHMENT_SCHEMA_VERSION + 1; },
    },
    {
      code: "mail_schema_unsupported",
      mutate(mail) { delete mail.equipmentEnvelopes; },
    },
  ];

  for (const scenario of scenarios) {
    const mail = structuredClone(valid.mail);
    scenario.mutate(mail);
    const before = structuredClone(mail);
    const result = readMailAttachmentState(mail, equipmentCatalog, options);
    assert.equal(result.ok, false, scenario.code);
    assert.equal(result.code, scenario.code);
    assert.deepEqual(mail, before, scenario.code);
  }
});

test("partial claim update removes exactly the selected envelopes, ordinary counts, and currency", () => {
  const built = mixedMail();
  assert.equal(built.ok, true);
  const mailBefore = structuredClone(built.mail);
  const firstEnvelope = built.equipmentEnvelopes[0];
  const secondEnvelope = built.equipmentEnvelopes[1];
  const partial = updateMailAttachmentState(built.mail, {
    claimedOrdinaryItems: [{itemId: ordinaryItemId, count: 2}],
    claimedEnvelopeIds: [firstEnvelope.envelopeId],
    claimCurrency: true,
  }, equipmentCatalog, options);

  assert.equal(partial.ok, true);
  assert.equal(partial.changed, true);
  assert.equal(partial.empty, false);
  assert.deepEqual(partial.claimed.items, [
    {itemId: ordinaryItemId, count: 2},
    {itemId: equipmentItemId, count: 1},
  ]);
  assert.deepEqual(partial.claimed.ordinaryItems, [{itemId: ordinaryItemId, count: 2}]);
  assert.deepEqual(partial.claimed.equipmentEnvelopes, [firstEnvelope]);
  assert.deepEqual(partial.claimed.currency, {stoneCoins: 17, diamonds: 2});
  assert.deepEqual(partial.remaining.items, [
    {itemId: ordinaryItemId, count: 3},
    {itemId: equipmentItemId, count: 1},
  ]);
  assert.deepEqual(partial.remaining.equipmentEnvelopes, [secondEnvelope]);
  assert.deepEqual(partial.remaining.currency, {});
  assert.deepEqual(partial.mail.items, partial.remaining.items);
  assert.deepEqual(partial.mail.equipmentEnvelopes, [secondEnvelope]);
  assert.deepEqual(partial.mail.currency, {});
  assert.deepEqual(built.mail, mailBefore);

  const completed = updateMailAttachmentState(partial.mail, {
    claimedOrdinaryItems: [{itemId: ordinaryItemId, count: 3}],
    claimedEnvelopeIds: [secondEnvelope.envelopeId],
    claimCurrency: false,
  }, equipmentCatalog, options);
  assert.equal(completed.ok, true);
  assert.equal(completed.empty, true);
  assert.deepEqual(completed.mail.items, []);
  assert.deepEqual(completed.mail.equipmentEnvelopes, []);
  assert.deepEqual(completed.mail.currency, {});
});

test("claim update rejects stale, excessive, duplicate, or template-style equipment selections atomically", () => {
  const built = mixedMail();
  assert.equal(built.ok, true);
  const scenarios = [
    {
      code: "mail_claim_item_not_enough",
      claim: {claimedOrdinaryItems: [{itemId: ordinaryItemId, count: 6}]},
    },
    {
      code: "mail_claim_envelope_missing",
      claim: {claimedEnvelopeIds: ["eqx_mail_missing_0001"]},
    },
    {
      code: "mail_claim_invalid",
      claim: {claimedEnvelopeIds: [built.equipmentEnvelopes[0].envelopeId, built.equipmentEnvelopes[0].envelopeId]},
    },
    {
      code: "mail_claim_equipment_envelope_required",
      claim: {claimedOrdinaryItems: [{itemId: equipmentItemId, count: 1}]},
    },
    {
      code: "mail_claim_invalid",
      claim: {fullEnvelope: structuredClone(built.equipmentEnvelopes[0])},
    },
  ];

  for (const scenario of scenarios) {
    const before = structuredClone(built.mail);
    const result = updateMailAttachmentState(built.mail, scenario.claim, equipmentCatalog, options);
    assert.equal(result.ok, false, scenario.code);
    assert.equal(result.code, scenario.code);
    assert.deepEqual(built.mail, before, scenario.code);
  }
});
