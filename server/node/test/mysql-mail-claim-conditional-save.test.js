"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {cloneAuthorityRoot} = require("../src/auth/authority-root-clone");
const {
  commitConsumedEquipmentEnvelopeLedger,
  ensureConsumedEquipmentEnvelopeIds,
  readConsumedEquipmentEnvelopeLedgerIndex,
} = require("../src/auth/equipment-envelope-consumed-ledger");
const {
  canonicalDurableMutationReceipts,
  commitDurableMutationReceiptDelta,
  stageDurableMutationReceipt,
} = require("../src/auth/durable-mutation-state");
const {
  createAsyncWriteAuthStore,
  createAuthService,
  createMemoryAuthStore,
} = require("../src/auth-service");
const {
  __buildMysqlSavePlanFromPersistentDataForTest,
} = require("../src/mysql-store");
const {
  mysqlResourceAcquisitionTrace,
} = require("../src/mysql-resource-acquisition-order");

const ACCOUNT_ID = "acc_mail_claim_conditional";
const PLAYER_ID = "player_mail_claim_conditional";
const MAIL_ID = "mail_claim_conditional";
const OPERATION_ID = "op_mail_claim_conditional_0001";
const REQUEST_HASH = "a".repeat(64);
const ACTION_ID = "POST /mail/claim";
const ENVELOPE_ID_A = "eqx_mail_claim_conditional_a0001";
const ENVELOPE_ID_Z = "eqx_mail_claim_conditional_z0001";
const UPDATED_AT_1 = "2026-07-15T01:00:00.000Z";
const UPDATED_AT_2 = "2026-07-15T01:01:00.000Z";

function canonicalConsumedLedger(value = {}) {
  const read = readConsumedEquipmentEnvelopeLedgerIndex(value);
  assert.equal(read.ok, true, JSON.stringify(read));
  return read.ledger;
}

function profileBinding(profileRevision = 4) {
  return {
    accountId: ACCOUNT_ID,
    playerId: PLAYER_ID,
    profileRevision,
    createdAt: UPDATED_AT_1,
    updatedAt: UPDATED_AT_1,
  };
}

function profileDocument(profileRevision = 4) {
  return {
    playerId: PLAYER_ID,
    accountId: ACCOUNT_ID,
    profileRevision,
    createdAt: UPDATED_AT_1,
    updatedAt: UPDATED_AT_1,
    profile: {
      displayName: "邮件领取猎人",
      stoneCoins: 10,
      backpackSlots: [],
      captureTools: {},
    },
    schemaVersion: 1,
  };
}

function ordinaryMail(overrides = {}) {
  return {
    mailId: MAIL_ID,
    senderAccountId: "system_mail",
    senderUsername: "system_mail",
    senderDisplayName: "系统邮件",
    recipientAccountId: ACCOUNT_ID,
    recipientUsername: "mailclaimrecipient",
    recipientDisplayName: "邮件领取猎人",
    title: "普通附件",
    body: "领取后必须与档案一起提交。",
    items: [{itemId: "item_meat_small", count: 2}],
    currency: {stoneCoins: 7},
    createdAt: UPDATED_AT_1,
    readAt: null,
    schemaVersion: 1,
    ...overrides,
  };
}

function equipmentEnvelope(envelopeId, sourceInstanceId) {
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
      source: "mail_claim_conditional_test",
    },
    stateFingerprint: "b".repeat(64),
    provenance: {
      sourceInstanceId,
      sourceAccountId: "acc_mail_claim_sender",
      exportedAt: UPDATED_AT_1,
    },
  };
}

function equipmentMail(overrides = {}) {
  return ordinaryMail({
    title: "装备附件",
    items: [{itemId: "weapon_wooden_club", count: 2}],
    currency: {},
    equipmentEnvelopes: [
      equipmentEnvelope(ENVELOPE_ID_Z, "equip_source_z"),
      equipmentEnvelope(ENVELOPE_ID_A, "equip_source_a"),
    ],
    schemaVersion: 2,
    ...overrides,
  });
}

function baselineAuthority(mail = ordinaryMail()) {
  return {
    schemaVersion: 1,
    accounts: {},
    sessions: {},
    profileBindings: {[ACCOUNT_ID]: profileBinding()},
    profiles: {[PLAYER_ID]: profileDocument()},
    mutationReceipts: canonicalDurableMutationReceipts({}),
    mailMessages: {[MAIL_ID]: mail},
    marketListings: {},
    consumedEquipmentEnvelopes: canonicalConsumedLedger(),
    marketConfig: {},
    offlineHangConfig: {},
    serviceEventSeq: 0,
    serviceEvents: [],
  };
}

function claimReceipt(overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: OPERATION_ID,
    requestHash: REQUEST_HASH,
    actionId: ACTION_ID,
    accountId: ACCOUNT_ID,
    committedAt: UPDATED_AT_2,
    expiresAt: "2026-07-18T01:01:00.000Z",
    response: {
      ok: true,
      operationId: OPERATION_ID,
      claim: {mailId: MAIL_ID},
    },
    ...overrides,
  };
}

function applyProfileClaim(after, before, addedItems = [{itemId: "item_meat_small", count: 1}]) {
  after.profileBindings[ACCOUNT_ID] = {
    ...before.profileBindings[ACCOUNT_ID],
    profileRevision: 5,
    updatedAt: UPDATED_AT_2,
  };
  after.profiles[PLAYER_ID] = {
    ...before.profiles[PLAYER_ID],
    profileRevision: 5,
    updatedAt: UPDATED_AT_2,
    profile: {
      ...before.profiles[PLAYER_ID].profile,
      stoneCoins: 17,
      backpackSlots: addedItems,
    },
  };
}

function stageReceipt(after, overrides = {}) {
  after.mutationReceipts = stageDurableMutationReceipt(
    after.mutationReceipts,
    claimReceipt(overrides),
    {nowMs: Date.parse(UPDATED_AT_2)},
  );
}

function ordinaryPartialCandidate(before) {
  const after = cloneAuthorityRoot(before);
  applyProfileClaim(after, before);
  after.mailMessages[MAIL_ID] = ordinaryMail({
    items: [{itemId: "item_meat_small", count: 1}],
    currency: {},
    equipmentEnvelopes: [],
    schemaVersion: 2,
  });
  stageReceipt(after);
  return after;
}

function ordinaryFullCandidate(before) {
  const after = cloneAuthorityRoot(before);
  applyProfileClaim(after, before, [{itemId: "item_meat_small", count: 2}]);
  delete after.mailMessages[MAIL_ID];
  stageReceipt(after);
  return after;
}

function equipmentPartialCandidate(before) {
  const after = cloneAuthorityRoot(before);
  applyProfileClaim(after, before, [{itemId: "weapon_wooden_club", count: 1}]);
  after.mailMessages[MAIL_ID] = equipmentMail({
    items: [{itemId: "weapon_wooden_club", count: 1}],
    equipmentEnvelopes: [equipmentEnvelope(ENVELOPE_ID_Z, "equip_source_z")],
  });
  const consumed = ensureConsumedEquipmentEnvelopeIds(
    after.consumedEquipmentEnvelopes,
    [ENVELOPE_ID_A],
  );
  assert.equal(consumed.ok, true, JSON.stringify(consumed));
  after.consumedEquipmentEnvelopes = consumed.ledger;
  stageReceipt(after);
  return after;
}

function equipmentFullCandidate(before) {
  const after = cloneAuthorityRoot(before);
  applyProfileClaim(after, before, [{itemId: "weapon_wooden_club", count: 2}]);
  delete after.mailMessages[MAIL_ID];
  const consumed = ensureConsumedEquipmentEnvelopeIds(
    after.consumedEquipmentEnvelopes,
    [ENVELOPE_ID_Z, ENVELOPE_ID_A],
  );
  assert.equal(consumed.ok, true, JSON.stringify(consumed));
  after.consumedEquipmentEnvelopes = consumed.ledger;
  stageReceipt(after);
  return after;
}

function claimScope(overrides = {}) {
  return {
    kind: "row_local_mail_claim_v1",
    accountId: ACCOUNT_ID,
    playerId: PLAYER_ID,
    mailId: MAIL_ID,
    mailDisposition: "update",
    claimedEnvelopeIds: [],
    operationId: OPERATION_ID,
    requestHash: REQUEST_HASH,
    actionId: ACTION_ID,
    ...overrides,
  };
}

function buildPlan(after, before, scope = claimScope()) {
  return __buildMysqlSavePlanFromPersistentDataForTest(after, before, {
    consistencyScope: scope,
  });
}

function operationResources(plan, field) {
  return (Array.isArray(plan && plan[field]) ? plan[field] : [])
    .map((operation) => String(operation && operation.resource || ""));
}

function operationKeys(plan, field) {
  return (Array.isArray(plan && plan[field]) ? plan[field] : [])
    .map((operation) => String(operation && operation.key || ""));
}

test("planner certifies an ordinary partial mail claim as one exact row-local update", () => {
  const before = baselineAuthority();
  const plan = buildPlan(ordinaryPartialCandidate(before), before);

  assert.equal(plan.kind, "mail_claim_conditional_v1");
  assert.equal(plan.globalRevisionFence, false);
  assert.equal(plan.globalCompatibilityBarrier, "shared");
  assert.equal(plan.accountId, ACCOUNT_ID);
  assert.equal(plan.playerId, PLAYER_ID);
  assert.equal(plan.mailId, MAIL_ID);
  assert.equal(plan.mailDisposition, "update");
  assert.deepEqual(plan.claimedEnvelopeIds, []);
  assert.deepEqual(
    operationResources(plan, "locks"),
    ["profile_binding", "profile", "mail_message"],
  );
  assert.deepEqual(
    operationResources(plan, "writes"),
    [
      "profile_binding",
      "profile",
      "mail_message",
      "mutation_receipt_capacity",
      "mutation_receipt",
    ],
  );
  assert.match(plan.locks[2].sql, /FROM mail_messages[\s\S]+FOR UPDATE\b/i);
  assert.match(plan.writes[2].sql, /^UPDATE mail_messages\b/i);
  assert.equal(plan.writes.every((write) => write.expectedAffectedRows === 1), true);
  assert.equal(plan.writes.some((write) => /ON DUPLICATE KEY/i.test(write.sql)), false);
});

test("planner keeps mail claim conditional when one expired same-operation receipt is replaced", () => {
  const before = baselineAuthority();
  before.mutationReceipts = canonicalDurableMutationReceipts({
    [OPERATION_ID]: claimReceipt({
      requestHash: "b".repeat(64),
      committedAt: "2026-07-14T01:00:00.000Z",
      expiresAt: "2026-07-15T01:00:00.000Z",
      response: {ok: true, generation: "expired"},
    }),
  });
  const plan = buildPlan(ordinaryPartialCandidate(before), before);

  assert.equal(plan.kind, "mail_claim_conditional_v1");
  assert.equal(
    plan.writes.some((write) => write.resource === "mutation_receipt_capacity"),
    false,
  );
  assert.deepEqual(
    plan.writes.slice(-2).map(({resource, kind, key}) => [resource, kind, key]),
    [
      ["mutation_receipt", "delete", OPERATION_ID],
      ["mutation_receipt", "insert", OPERATION_ID],
    ],
  );
});

test("planner certifies an ordinary full mail claim as one exact delete", () => {
  const before = baselineAuthority();
  const plan = buildPlan(
    ordinaryFullCandidate(before),
    before,
    claimScope({mailDisposition: "delete"}),
  );

  assert.equal(plan.kind, "mail_claim_conditional_v1");
  assert.equal(plan.mailDisposition, "delete");
  assert.deepEqual(operationResources(plan, "locks"), ["profile_binding", "profile", "mail_message"]);
  assert.deepEqual(
    operationResources(plan, "writes"),
    [
      "profile_binding",
      "profile",
      "mail_message",
      "mutation_receipt_capacity",
      "mutation_receipt",
    ],
  );
  assert.match(plan.writes[2].sql, /^DELETE FROM mail_messages\b/i);
  assert.equal(plan.writes.some((write) => /ON DUPLICATE KEY/i.test(write.sql)), false);
});

test("planner writes consumed equipment tombstones in canonical order with strict inserts", () => {
  const before = baselineAuthority(equipmentMail());
  const plan = buildPlan(
    equipmentFullCandidate(before),
    before,
    claimScope({
      mailDisposition: "delete",
      claimedEnvelopeIds: [ENVELOPE_ID_A, ENVELOPE_ID_Z],
    }),
  );

  assert.equal(plan.kind, "mail_claim_conditional_v1");
  assert.deepEqual(plan.claimedEnvelopeIds, [ENVELOPE_ID_A, ENVELOPE_ID_Z]);
  assert.deepEqual(
    operationResources(plan, "writes"),
    [
      "profile_binding",
      "profile",
      "mail_message",
      "consumed_equipment_envelope",
      "consumed_equipment_envelope",
      "mutation_receipt_capacity",
      "mutation_receipt",
    ],
  );
  assert.deepEqual(
    operationKeys(plan, "writes").slice(3, 5),
    [ENVELOPE_ID_A, ENVELOPE_ID_Z],
  );
  for (const write of plan.writes.slice(3, 5)) {
    assert.match(write.sql, /^INSERT INTO consumed_equipment_envelopes\b/i);
    assert.equal(write.expectedAffectedRows, 1);
    assert.doesNotMatch(write.sql, /ON DUPLICATE KEY/i);
  }
  assert.equal(plan.writes.some((write) => /ON DUPLICATE KEY/i.test(write.sql)), false);
  assert.deepEqual(
    mysqlResourceAcquisitionTrace(plan)
      .filter(({resource}) => resource === "consumed_equipment_envelope")
      .map(({key}) => key),
    [ENVELOPE_ID_A, ENVELOPE_ID_Z],
  );
});

test("planner certifies a partial equipment claim only for the removed envelope tombstone", () => {
  const before = baselineAuthority(equipmentMail());
  const plan = buildPlan(
    equipmentPartialCandidate(before),
    before,
    claimScope({claimedEnvelopeIds: [ENVELOPE_ID_A]}),
  );

  assert.equal(plan.kind, "mail_claim_conditional_v1");
  assert.equal(plan.mailDisposition, "update");
  assert.deepEqual(plan.claimedEnvelopeIds, [ENVELOPE_ID_A]);
  assert.deepEqual(operationKeys(plan, "writes").filter((key) => key.startsWith("eqx_")), [ENVELOPE_ID_A]);
  assert.match(plan.writes[2].sql, /^UPDATE mail_messages\b/i);
});

test("planner fails closed for broader writes, wrong scope, mail drift, or ledger mismatch", async (t) => {
  const cases = [
    {
      name: "another persistent bucket changes",
      setup() {
        const before = baselineAuthority();
        const after = ordinaryPartialCandidate(before);
        after.offlineHangConfig = {rewardRateBps: 5000};
        return {before, after, scope: claimScope()};
      },
    },
    {
      name: "another mail changes",
      setup() {
        const before = baselineAuthority();
        const after = ordinaryPartialCandidate(before);
        after.mailMessages.mail_unrelated = ordinaryMail({mailId: "mail_unrelated"});
        return {before, after, scope: claimScope()};
      },
    },
    {
      name: "receipt is missing",
      setup() {
        const before = baselineAuthority();
        const after = ordinaryPartialCandidate(before);
        after.mutationReceipts = before.mutationReceipts;
        return {before, after, scope: claimScope()};
      },
    },
    {
      name: "scope kind differs",
      setup() {
        const before = baselineAuthority();
        return {before, after: ordinaryPartialCandidate(before), scope: claimScope({kind: "row_local_profile_v1"})};
      },
    },
    {
      name: "scope mail differs",
      setup() {
        const before = baselineAuthority();
        return {before, after: ordinaryPartialCandidate(before), scope: claimScope({mailId: "mail_other"})};
      },
    },
    {
      name: "scope disposition differs",
      setup() {
        const before = baselineAuthority();
        return {before, after: ordinaryPartialCandidate(before), scope: claimScope({mailDisposition: "delete"})};
      },
    },
    {
      name: "scope envelope ids are not canonical",
      setup() {
        const before = baselineAuthority(equipmentMail());
        return {
          before,
          after: equipmentFullCandidate(before),
          scope: claimScope({
            mailDisposition: "delete",
            claimedEnvelopeIds: [ENVELOPE_ID_Z, ENVELOPE_ID_A],
          }),
        };
      },
    },
    {
      name: "updated mail recipient drifts",
      setup() {
        const before = baselineAuthority();
        const after = ordinaryPartialCandidate(before);
        after.mailMessages[MAIL_ID].recipientAccountId = "acc_other_recipient";
        return {before, after, scope: claimScope()};
      },
    },
    {
      name: "removed equipment envelope has no consumed tombstone",
      setup() {
        const before = baselineAuthority(equipmentMail());
        const after = equipmentPartialCandidate(before);
        after.consumedEquipmentEnvelopes = before.consumedEquipmentEnvelopes;
        return {before, after, scope: claimScope({claimedEnvelopeIds: [ENVELOPE_ID_A]})};
      },
    },
    {
      name: "consumed ledger adds an envelope that the mail retained",
      setup() {
        const before = baselineAuthority(equipmentMail());
        const after = equipmentPartialCandidate(before);
        const extra = ensureConsumedEquipmentEnvelopeIds(after.consumedEquipmentEnvelopes, ENVELOPE_ID_Z);
        assert.equal(extra.ok, true, JSON.stringify(extra));
        after.consumedEquipmentEnvelopes = extra.ledger;
        return {before, after, scope: claimScope({claimedEnvelopeIds: [ENVELOPE_ID_A]})};
      },
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const {before, after, scope} = fixture.setup();
      const plan = buildPlan(after, before, scope);
      assert.equal(plan.kind, "legacy_global_cas");
      assert.equal(plan.globalRevisionFence, true);
    });
  }
});

function seedOrdinaryMailClaimScenario(suffix) {
  const base = createMemoryAuthStore();
  const service = createAuthService({store: base, allowFullProfileSave: true});
  const recipient = service.register({
    username: `mailclaim${suffix}`,
    password: "test1234",
    displayName: "条件领取猎人",
  });
  const unrelated = service.register({
    username: `mailother${suffix}`,
    password: "test1234",
    displayName: "无关档案猎人",
  });
  assert.equal(recipient.ok, true);
  assert.equal(unrelated.ok, true);
  const seed = base.load();
  const mailId = `mail_claim_${suffix}`;
  seed.mailMessages[mailId] = {
    ...ordinaryMail({
      mailId,
      recipientAccountId: recipient.account.accountId,
      recipientUsername: recipient.account.username,
      recipientDisplayName: recipient.account.displayName,
      items: [{itemId: "item_meat_small", count: 1}],
      currency: {},
    }),
  };
  base.save(seed);
  return {base, recipient, unrelated, mailId};
}

function seedEquipmentMailClaimScenario(suffix) {
  const base = createMemoryAuthStore();
  const service = createAuthService({store: base, allowFullProfileSave: true});
  const sender = service.register({
    username: `eqmailsender${suffix}`,
    password: "test1234",
    displayName: "装备寄件猎人",
  });
  const recipient = service.register({
    username: `eqmailrecipient${suffix}`,
    password: "test1234",
    displayName: "装备收件猎人",
  });
  assert.equal(sender.ok, true);
  assert.equal(recipient.ok, true);

  const current = service.getProfile(sender.session.token);
  assert.equal(current.ok, true);
  current.profile.backpackSlots = [
    {itemId: "weapon_wooden_club", count: 1},
    ...Array.from({length: 14}, () => ({})),
  ];
  current.profile.equipmentInstances = {
    equip_mail_claim_scope_1: {
      schemaVersion: 1,
      instanceId: "equip_mail_claim_scope_1",
      itemId: "weapon_wooden_club",
      location: "backpack",
      slotId: "",
      durability: 27,
      enhancement: {itemId: "weapon_wooden_club", level: 1, history: []},
      wearCounters: {itemId: "weapon_wooden_club", attackCount: 2, hitCount: 0},
      expPillCharge: {},
      source: "mail_claim_scope_test",
    },
  };
  current.profile.equipmentSlotInstanceIds = {};
  current.profile.equipmentSlotsVersion = 5;
  current.profile.nextEquipmentInstanceSerial = 2;
  const saved = service.saveProfile(sender.session.token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile: current.profile,
  });
  assert.equal(saved.ok, true, JSON.stringify(saved));

  const sent = service.sendMail(sender.session.token, {
    recipientUsername: recipient.account.username,
    title: "条件事务装备附件",
    body: "这件装备必须连同消费墓碑一起提交。",
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      instanceId: "equip_mail_claim_scope_1",
      sourceSlotIndex: 0,
    }],
  });
  assert.equal(sent.ok, true, JSON.stringify(sent));
  const storedMail = base.load().mailMessages[sent.mail.mailId];
  assert.equal(storedMail.equipmentEnvelopes.length, 1);
  const envelopeId = storedMail.equipmentEnvelopes[0].envelopeId;
  assert.match(envelopeId, /^eqx_[A-Za-z0-9_-]{8,156}$/);
  return {base, recipient, mailId: sent.mail.mailId, envelopeId};
}

test("real durable mail claim signs its exact profile, mail disposition, and tombstone scope", async () => {
  const {base, recipient, mailId} = seedOrdinaryMailClaimScenario("scope");
  let committed = base.load();
  committed.consumedEquipmentEnvelopes = canonicalConsumedLedger(
    committed.consumedEquipmentEnvelopes,
  );
  let saveOptions = null;
  let savedPlan = null;
  const service = createAuthService({
    store: {
      load: () => cloneAuthorityRoot(committed),
      save(nextData, options = {}) {
        saveOptions = cloneAuthorityRoot(options);
        savedPlan = buildPlan(nextData, committed, options.consistencyScope);
        committed = cloneAuthorityRoot(nextData);
        committed.mutationReceipts = commitDurableMutationReceiptDelta(
          canonicalDurableMutationReceipts(committed.mutationReceipts),
        );
        const committedLedger = commitConsumedEquipmentEnvelopeLedger(
          committed.consumedEquipmentEnvelopes,
        );
        assert.equal(committedLedger.ok, true, JSON.stringify(committedLedger));
        committed.consumedEquipmentEnvelopes = committedLedger.ledger;
      },
    },
  });
  const operation = {
    operationId: "op_real_mail_claim_scope_0001",
    requestHash: "c".repeat(64),
    actionId: ACTION_ID,
  };
  const result = await service.invokeDurable(
    "claimMailAttachments",
    [recipient.session.token, mailId],
    operation,
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(saveOptions.consistencyScope, {
    kind: "row_local_mail_claim_v1",
    accountId: recipient.account.accountId,
    playerId: recipient.profileBinding.playerId,
    mailId,
    mailDisposition: "delete",
    claimedEnvelopeIds: [],
    operationId: operation.operationId,
    requestHash: operation.requestHash,
    actionId: operation.actionId,
  });
  assert.equal(savedPlan.kind, "mail_claim_conditional_v1");
});

test("real durable equipment mail claim signs and strictly inserts its exact envelope tombstone", async () => {
  const {base, recipient, mailId, envelopeId} = seedEquipmentMailClaimScenario("scope");
  let committed = base.load();
  committed.consumedEquipmentEnvelopes = canonicalConsumedLedger(
    committed.consumedEquipmentEnvelopes,
  );
  let saveOptions = null;
  let savedPlan = null;
  const service = createAuthService({
    store: {
      load: () => cloneAuthorityRoot(committed),
      save(nextData, options = {}) {
        saveOptions = cloneAuthorityRoot(options);
        savedPlan = buildPlan(nextData, committed, options.consistencyScope);
        committed = cloneAuthorityRoot(nextData);
        committed.mutationReceipts = commitDurableMutationReceiptDelta(
          canonicalDurableMutationReceipts(committed.mutationReceipts),
        );
        const committedLedger = commitConsumedEquipmentEnvelopeLedger(
          committed.consumedEquipmentEnvelopes,
        );
        assert.equal(committedLedger.ok, true, JSON.stringify(committedLedger));
        committed.consumedEquipmentEnvelopes = committedLedger.ledger;
      },
    },
  });
  const operation = {
    operationId: "op_real_equipment_mail_claim_scope_0001",
    requestHash: "f".repeat(64),
    actionId: ACTION_ID,
  };
  const result = await service.invokeDurable(
    "claimMailAttachments",
    [recipient.session.token, mailId],
    operation,
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.claim.importedEquipmentInstanceIds.length, 1);
  assert.deepEqual(saveOptions.consistencyScope, {
    kind: "row_local_mail_claim_v1",
    accountId: recipient.account.accountId,
    playerId: recipient.profileBinding.playerId,
    mailId,
    mailDisposition: "delete",
    claimedEnvelopeIds: [envelopeId],
    operationId: operation.operationId,
    requestHash: operation.requestHash,
    actionId: operation.actionId,
  });
  assert.equal(savedPlan.kind, "mail_claim_conditional_v1");
  assert.deepEqual(savedPlan.claimedEnvelopeIds, [envelopeId]);
  const tombstoneWrites = savedPlan.writes.filter((write) => (
    write.resource === "consumed_equipment_envelope"
  ));
  assert.equal(tombstoneWrites.length, 1);
  assert.equal(tombstoneWrites[0].key, envelopeId);
  assert.equal(tombstoneWrites[0].expectedAffectedRows, 1);
  assert.match(tombstoneWrites[0].sql, /^INSERT INTO consumed_equipment_envelopes\b/i);
  assert.doesNotMatch(tombstoneWrites[0].sql, /ON DUPLICATE KEY/i);
});

test("ambiguous ordinary mail claim recovers only after exact claim resources committed", async () => {
  const {base, recipient, unrelated, mailId} = seedOrdinaryMailClaimScenario("recover");
  const operation = {
    operationId: "op_mail_claim_recovery_0001",
    requestHash: "d".repeat(64),
    actionId: ACTION_ID,
  };
  const unrelatedRecordPoint = {
    mapId: "firebud_training_yard",
    spawnName: "mail_claim_recovery_other",
    label: "领取后无关账号记录点",
  };
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      base.save(nextData);
      const concurrent = createAuthService({store: base});
      const unrelatedChange = concurrent.profileAction(unrelated.session.token, {
        action: "record_point_save",
        payload: {recordPoint: unrelatedRecordPoint},
      });
      assert.equal(unrelatedChange.ok, true);
      throw new Error("connection lost after mail claim commit");
    },
  }, {onError() {}});
  const service = createAuthService({store});

  const result = await service.invokeDurable(
    "claimMailAttachments",
    [recipient.session.token, mailId],
    operation,
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(store.metrics().ambiguousCommitRecoveries, 1);
  const snapshot = service.snapshot();
  assert.equal(Object.hasOwn(snapshot.mailMessages, mailId), false);
  assert.equal(
    snapshot.profiles[unrelated.profileBinding.playerId].profile.recordPoint.label,
    unrelatedRecordPoint.label,
  );
  assert.deepEqual(snapshot, base.load());
});

test("ambiguous ordinary mail claim rejects a mismatched mail disposition proof", async () => {
  const {base, recipient, mailId} = seedOrdinaryMailClaimScenario("mismatch");
  const beforePublished = base.load();
  const mailBefore = structuredClone(beforePublished.mailMessages[mailId]);
  const operation = {
    operationId: "op_mail_claim_mismatch_0001",
    requestHash: "e".repeat(64),
    actionId: ACTION_ID,
  };
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      base.save(nextData);
      const changed = base.load();
      changed.mailMessages[mailId] = mailBefore;
      base.save(changed);
      throw new Error("connection lost after mail disposition mismatch");
    },
  }, {onError() {}});
  const service = createAuthService({store});

  await assert.rejects(
    service.invokeDurable(
      "claimMailAttachments",
      [recipient.session.token, mailId],
      operation,
    ),
    (error) => error && error.code === "storage_write_failed",
  );
  assert.equal(store.metrics().ambiguousCommitRecoveries, 0);
  assert.deepEqual(service.snapshot(), beforePublished);
});
