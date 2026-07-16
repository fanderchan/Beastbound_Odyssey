"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {cloneAuthorityRoot} = require("../src/auth/authority-root-clone");
const {
  canonicalDurableMutationReceipts,
  stageDurableMutationReceipt,
} = require("../src/auth/durable-mutation-state");
const {
  mailAuthorityDiagnostics,
  readMailAuthorityState,
  stageMailAuthorityUpsert,
} = require("../src/auth/mail-authority-state");
const {
  __certifiedOrdinaryAttachmentProfileChangeForTest: certifiedOrdinaryAttachmentProfileChange,
  __singleNewMailAdditionForTest: singleNewMailAddition,
  MAIL_SEND_MODE_ORDINARY_ITEMS,
  MAIL_SEND_MODE_TEXT,
} = require("../src/auth/mail-send-consistency");
const {
  MUTATION_RECEIPT_CAPACITY_UPDATE_SQL,
  mysqlResourceAcquisitionTrace,
} = require("../src/mysql-resource-acquisition-order");
const {
  __buildMysqlSavePlanFromPersistentDataForTest: buildMysqlSavePlan,
  __canonicalizeMysqlMailAuthorityBaselineForTest: canonicalizeMysqlMailAuthorityBaseline,
  __mergeMysqlSaveBaselineAfterCommitForTest: mergeMysqlSaveBaselineAfterCommit,
  __runMysqlPoolSavePlanForTest: runMysqlPoolSavePlan,
} = require("../src/mysql-store");
const {
  createAuthService,
  createAsyncWriteAuthStore,
  createMemoryAuthStore,
} = require("../test-support/auth-service-test-context");

const SENDER_ACCOUNT_ID = "acc_mail_send_sender";
const SENDER_PLAYER_ID = "player_mail_send_sender";
const RECIPIENT_ACCOUNT_ID = "acc_mail_send_recipient";
const MAIL_ID = "mail_send_conditional_0001";
const OPERATION_ID = "op_mail_send_conditional_0001";
const REQUEST_HASH = "9".repeat(64);
const ACTION_ID = "POST /mail/send";
const CREATED_AT = "2026-07-15T08:00:00.000Z";
const UPDATED_AT = "2026-07-15T08:01:00.000Z";
const MYSQL_SESSION_POLICY_SQL =
  "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?";

function account(accountId, username, displayName) {
  return {
    accountId,
    username,
    displayName,
    role: "player",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function baselineState() {
  return {
    schemaVersion: 1,
    accounts: {
      mail_send_sender: account(SENDER_ACCOUNT_ID, "mail_send_sender", "寄件人"),
      mail_send_recipient: account(RECIPIENT_ACCOUNT_ID, "mail_send_recipient", "收件人"),
    },
    sessions: {},
    profileBindings: {
      [SENDER_ACCOUNT_ID]: {
        accountId: SENDER_ACCOUNT_ID,
        playerId: SENDER_PLAYER_ID,
        profileRevision: 1,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
    },
    profiles: {
      [SENDER_PLAYER_ID]: {
        playerId: SENDER_PLAYER_ID,
        accountId: SENDER_ACCOUNT_ID,
        profileRevision: 1,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        profile: {
          backpackSlots: [{itemId: "item_meat_small", count: 3}, {}, {}],
          captureTools: {},
          displayName: "寄件人",
        },
      },
    },
    mutationReceipts: {},
    mailMessages: {
      mail_unrelated: playerMail({
        mailId: "mail_unrelated",
        senderAccountId: RECIPIENT_ACCOUNT_ID,
        senderUsername: "mail_send_recipient",
        senderDisplayName: "收件人",
        recipientAccountId: SENDER_ACCOUNT_ID,
        recipientUsername: "mail_send_sender",
        recipientDisplayName: "寄件人",
        title: "既有邮件",
        body: "必须保持不变。",
      }),
    },
    marketListings: {},
    consumedEquipmentEnvelopes: {},
    serviceEventSeq: 0,
    serviceEvents: [],
  };
}

function playerMail(overrides = {}) {
  const mail = {
    mailId: MAIL_ID,
    senderAccountId: SENDER_ACCOUNT_ID,
    senderUsername: "mail_send_sender",
    senderDisplayName: "寄件人",
    recipientAccountId: RECIPIENT_ACCOUNT_ID,
    recipientUsername: "mail_send_recipient",
    recipientDisplayName: "收件人",
    title: "条件邮件",
    body: "这封邮件必须原子提交。",
    items: [],
    equipmentEnvelopes: [],
    currency: {},
    createdAt: UPDATED_AT,
    readAt: null,
    schemaVersion: 2,
    ...overrides,
  };
  if (Array.isArray(mail.items) && mail.items.length === 0) {
    mail.settledAt = mail.createdAt;
  } else {
    delete mail.settledAt;
  }
  return mail;
}

function receipt(overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: OPERATION_ID,
    requestHash: REQUEST_HASH,
    actionId: ACTION_ID,
    accountId: SENDER_ACCOUNT_ID,
    committedAt: UPDATED_AT,
    expiresAt: "2026-07-18T08:01:00.000Z",
    ...overrides,
  };
}

function publicPlayerMail(mail) {
  return {
    mailId: mail.mailId,
    mailKind: "",
    senderUsername: mail.senderUsername,
    senderDisplayName: mail.senderDisplayName,
    recipientUsername: mail.recipientUsername,
    recipientDisplayName: mail.recipientDisplayName,
    title: mail.title,
    body: mail.body,
    items: mail.items,
    currency: {},
    createdAt: mail.createdAt,
    readAt: null,
    settledAt: mail.settledAt || null,
    schemaVersion: 2,
    equipmentEnvelopes: [],
  };
}

function mailSendReceiptResponse(after, mode, mail) {
  const response = {
    ok: true,
    mail: publicPlayerMail(mail),
    message: "邮件已发送。",
    durableCommit: {
      schemaVersion: 1,
      operationId: OPERATION_ID,
      actionId: ACTION_ID,
      committedAt: UPDATED_AT,
      replayed: false,
    },
  };
  if (mode === MAIL_SEND_MODE_ORDINARY_ITEMS) {
    const sender = after.accounts.mail_send_sender;
    const binding = after.profileBindings[SENDER_ACCOUNT_ID];
    const profile = after.profiles[SENDER_PLAYER_ID];
    response.profileSummary = {
      accountId: sender.accountId,
      username: sender.username,
      displayName: sender.displayName,
      playerId: binding.playerId,
      profileRevision: binding.profileRevision,
      storageMode: "server_document",
      serverAuthority: "profile_document",
      hasProfile: true,
      updatedAt: binding.updatedAt,
      schemaVersion: 1,
    };
    response.profile = profile.profile;
  }
  return response;
}

function candidateState(before, mode = MAIL_SEND_MODE_TEXT) {
  const after = cloneAuthorityRoot(before);
  const items = mode === MAIL_SEND_MODE_ORDINARY_ITEMS
    ? [{itemId: "item_meat_small", count: 2}]
    : [];
  const sentMail = playerMail({items});
  after.mailMessages[MAIL_ID] = sentMail;
  if (mode === MAIL_SEND_MODE_ORDINARY_ITEMS) {
    after.profileBindings[SENDER_ACCOUNT_ID] = {
      ...after.profileBindings[SENDER_ACCOUNT_ID],
      profileRevision: 2,
      updatedAt: UPDATED_AT,
    };
    const previousProfile = after.profiles[SENDER_PLAYER_ID];
    after.profiles[SENDER_PLAYER_ID] = {
      ...previousProfile,
      profileRevision: 2,
      updatedAt: UPDATED_AT,
      profile: {
        ...previousProfile.profile,
        backpackSlots: [{itemId: "item_meat_small", count: 1}, {}, {}],
      },
    };
  }
  after.mutationReceipts = stageDurableMutationReceipt(
    after.mutationReceipts,
    receipt({
      response: mailSendReceiptResponse(after, mode, sentMail),
    }),
    {nowMs: Date.parse(UPDATED_AT)},
  );
  return after;
}

function scope(mode = MAIL_SEND_MODE_TEXT, overrides = {}) {
  return {
    kind: "row_local_mail_send_v1",
    mode,
    accountId: SENDER_ACCOUNT_ID,
    playerId: mode === MAIL_SEND_MODE_ORDINARY_ITEMS ? SENDER_PLAYER_ID : "",
    recipientAccountId: RECIPIENT_ACCOUNT_ID,
    recipientUsername: "mail_send_recipient",
    mailId: MAIL_ID,
    operationId: OPERATION_ID,
    requestHash: REQUEST_HASH,
    actionId: ACTION_ID,
    ...overrides,
  };
}

function plan(after, before, mode = MAIL_SEND_MODE_TEXT, scopeValue = scope(mode)) {
  return buildMysqlSavePlan(after, before, {consistencyScope: scopeValue});
}

function resources(values) {
  return values.map((value) => value.resource);
}

test("text mail plan writes only the strict mail and receipt behind a shared global barrier", () => {
  const before = baselineState();
  const built = plan(candidateState(before), before);

  assert.equal(built.kind, "mail_send_conditional_v1");
  assert.equal(built.mode, MAIL_SEND_MODE_TEXT);
  assert.equal(built.globalRevisionFence, false);
  assert.equal(built.globalCompatibilityBarrier, "shared");
  assert.equal(built.playerId, "");
  assert.deepEqual(resources(built.locks), []);
  assert.deepEqual(
    resources(built.writes),
    ["mail_message", "mutation_receipt_capacity", "mutation_receipt"],
  );
  assert.match(built.writes[0].sql, /^INSERT INTO mail_messages\b/i);
  assert.doesNotMatch(built.writes[0].sql, /ON DUPLICATE KEY/i);
  assert.deepEqual(
    mysqlResourceAcquisitionTrace(built).map(({resource, stage}) => [resource, stage]),
    [
      ["mail_message", "insert"],
      ["mutation_receipt_capacity", "update"],
      ["mutation_receipt", "insert"],
    ],
  );
});

test("text mail planner consumes one certified mail delta without enumerating mailbox history", () => {
  const before = baselineState();
  const mailbox = {};
  for (let index = 0; index < 2000; index += 1) {
    const mailId = `mail_send_history_${String(index).padStart(5, "0")}`;
    mailbox[mailId] = playerMail({
      mailId,
      senderAccountId: RECIPIENT_ACCOUNT_ID,
      senderUsername: "mail_send_recipient",
      senderDisplayName: "收件人",
      recipientAccountId: SENDER_ACCOUNT_ID,
      recipientUsername: "mail_send_sender",
      recipientDisplayName: "寄件人",
      title: "历史邮件",
    });
  }
  const canonical = readMailAuthorityState(mailbox);
  assert.equal(canonical.ok, true);
  before.mailMessages = canonical.messages;
  const after = cloneAuthorityRoot(before);
  const sentMail = playerMail();
  const staged = stageMailAuthorityUpsert(after.mailMessages, sentMail);
  assert.equal(staged.ok, true);
  after.mailMessages = staged.messages;
  after.mutationReceipts = stageDurableMutationReceipt(
    after.mutationReceipts,
    receipt({response: mailSendReceiptResponse(after, MAIL_SEND_MODE_TEXT, sentMail)}),
    {nowMs: Date.parse(UPDATED_AT)},
  );
  const beforeEnumerations = mailAuthorityDiagnostics(before.mailMessages).ownKeyEnumerations;

  const built = plan(after, before);

  assert.equal(built.kind, "mail_send_conditional_v1");
  assert.equal(
    mailAuthorityDiagnostics(before.mailMessages).ownKeyEnumerations,
    beforeEnumerations,
  );
});

test("production-style separate mail lineages still plan and merge one touched row", () => {
  const storeBefore = canonicalizeMysqlMailAuthorityBaseline(baselineState());
  const candidate = baselineState();
  candidate.mailMessages = readMailAuthorityState(candidate.mailMessages).messages;
  const sentMail = playerMail();
  candidate.mailMessages = stageMailAuthorityUpsert(candidate.mailMessages, sentMail).messages;
  candidate.mutationReceipts = stageDurableMutationReceipt(
    candidate.mutationReceipts,
    receipt({response: mailSendReceiptResponse(candidate, MAIL_SEND_MODE_TEXT, sentMail)}),
    {nowMs: Date.parse(UPDATED_AT)},
  );
  const storeEnumerations = mailAuthorityDiagnostics(storeBefore.mailMessages).ownKeyEnumerations;
  const candidateEnumerations = mailAuthorityDiagnostics(candidate.mailMessages).ownKeyEnumerations;

  const built = plan(candidate, storeBefore);
  const merged = mergeMysqlSaveBaselineAfterCommit(storeBefore, candidate, built);

  assert.equal(built.kind, "mail_send_conditional_v1");
  assert.deepEqual(merged.mailMessages[MAIL_ID], sentMail);
  assert.deepEqual(merged.mailMessages.mail_unrelated, storeBefore.mailMessages.mail_unrelated);
  assert.equal(
    mailAuthorityDiagnostics(storeBefore.mailMessages).ownKeyEnumerations,
    storeEnumerations,
  );
  assert.equal(
    mailAuthorityDiagnostics(candidate.mailMessages).ownKeyEnumerations,
    candidateEnumerations,
  );
});

test("mail-send scope certification rejects hidden changes from another mail lineage", () => {
  const before = readMailAuthorityState(baselineState().mailMessages).messages;
  const hiddenBaseline = baselineState().mailMessages;
  hiddenBaseline.mail_unrelated = {
    ...hiddenBaseline.mail_unrelated,
    body: "不允许藏在另一个 lineage 里",
  };
  let candidate = readMailAuthorityState(hiddenBaseline).messages;
  candidate = stageMailAuthorityUpsert(candidate, playerMail()).messages;

  assert.equal(singleNewMailAddition(before, candidate), null);
});

test("rejected row-local scope rebuilds a complete legacy mail diff", () => {
  const before = baselineState();
  before.mailMessages = readMailAuthorityState(before.mailMessages).messages;
  const after = cloneAuthorityRoot(before);
  after.mailMessages = stageMailAuthorityUpsert(after.mailMessages, {
    ...after.mailMessages.mail_unrelated,
    body: "这项额外更新必须进入 legacy SQL",
  }).messages;
  const sentMail = playerMail();
  after.mailMessages = stageMailAuthorityUpsert(after.mailMessages, sentMail).messages;
  after.mutationReceipts = stageDurableMutationReceipt(
    after.mutationReceipts,
    receipt({response: mailSendReceiptResponse(after, MAIL_SEND_MODE_TEXT, sentMail)}),
    {nowMs: Date.parse(UPDATED_AT)},
  );

  const built = plan(after, before);
  const mailStatements = built.statements.filter((statement) => (
    /\bmail_messages\b/i.test(statement)
  ));

  assert.equal(built.kind, "legacy_global_cas");
  assert.equal(mailStatements.length, 2);
  assert.equal(mailStatements.some((statement) => statement.includes(MAIL_ID)), true);
  assert.equal(mailStatements.some((statement) => statement.includes("mail_unrelated")), true);
});

test("ordinary attachment mail locks and updates only the sender profile before mail and receipt", () => {
  const before = baselineState();
  const built = plan(
    candidateState(before, MAIL_SEND_MODE_ORDINARY_ITEMS),
    before,
    MAIL_SEND_MODE_ORDINARY_ITEMS,
  );

  assert.equal(built.kind, "mail_send_conditional_v1");
  assert.equal(built.mode, MAIL_SEND_MODE_ORDINARY_ITEMS);
  assert.equal(built.playerId, SENDER_PLAYER_ID);
  assert.deepEqual(resources(built.locks), ["profile_binding", "profile"]);
  assert.deepEqual(resources(built.writes), [
    "profile_binding",
    "profile",
    "mail_message",
    "mutation_receipt_capacity",
    "mutation_receipt",
  ]);
  assert.deepEqual(
    mysqlResourceAcquisitionTrace(built).map(({resource, stage}) => [resource, stage]),
    [
      ["profile_binding", "lock"],
      ["profile", "lock"],
      ["mail_message", "insert"],
      ["mutation_receipt_capacity", "update"],
      ["mutation_receipt", "insert"],
    ],
  );
});

test("planner keeps text mail conditional when one expired same-operation receipt is replaced", () => {
  const before = baselineState();
  before.mutationReceipts = canonicalDurableMutationReceipts({
    [OPERATION_ID]: receipt({
      requestHash: "8".repeat(64),
      committedAt: "2026-07-14T08:00:00.000Z",
      expiresAt: "2026-07-15T08:00:00.000Z",
      response: {ok: true, generation: "expired"},
    }),
  });
  const built = plan(candidateState(before), before);

  assert.equal(built.kind, "mail_send_conditional_v1");
  assert.equal(
    built.writes.some((write) => write.resource === "mutation_receipt_capacity"),
    false,
  );
  assert.deepEqual(
    built.writes.slice(-2).map(({resource, kind, key}) => [resource, kind, key]),
    [
      ["mutation_receipt", "delete", OPERATION_ID],
      ["mutation_receipt", "insert", OPERATION_ID],
    ],
  );
});

test("mail send planner rejects widened, equipment, currency, identity, and receipt scopes", async (t) => {
  const cases = [
    {name: "missing scope", scope: () => null},
    {name: "scope extra field", scope: (mode) => scope(mode, {extra: true})},
    {name: "recipient drift", scope: (mode) => scope(mode, {recipientAccountId: "acc_other"})},
    {name: "text scope claims a player", scope: () => scope(MAIL_SEND_MODE_TEXT, {playerId: SENDER_PLAYER_ID})},
    {name: "receipt hash drift", scope: (mode) => scope(mode, {requestHash: "8".repeat(64)})},
    {name: "mail schema drift", mutate(after) { after.mailMessages[MAIL_ID].schemaVersion = 1; }},
    {name: "mail currency", mutate(after) { after.mailMessages[MAIL_ID].currency = {stoneCoins: 1}; }},
    {name: "mail equipment envelope", mutate(after) { after.mailMessages[MAIL_ID].equipmentEnvelopes = [{}]; }},
    {name: "mail kind", mutate(after) { after.mailMessages[MAIL_ID].mailKind = "system"; }},
    {name: "second new mail", mutate(after) { after.mailMessages.mail_second = playerMail({mailId: "mail_second"}); }},
    {name: "existing mail update", mutate(after) { after.mailMessages.mail_unrelated.body = "changed"; }},
    {name: "consumed ledger change", mutate(after) { after.consumedEquipmentEnvelopes.eqx_mail_send_guard_0001 = {schemaVersion: 1, envelopeId: "eqx_mail_send_guard_0001"}; }},
    {name: "text profile change", mutate(after) { after.profiles[SENDER_PLAYER_ID].profile.displayName = "changed"; }},
    {name: "receipt response mail drift", mutate(after) {
      const changedReceipt = structuredClone(after.mutationReceipts[OPERATION_ID]);
      changedReceipt.response.mail.title = "changed";
      after.mutationReceipts = {[OPERATION_ID]: changedReceipt};
    }},
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const before = baselineState();
      const after = candidateState(before);
      fixture.mutate?.(after);
      const scopeValue = fixture.scope ? fixture.scope(MAIL_SEND_MODE_TEXT) : scope();
      assert.equal(plan(after, before, MAIL_SEND_MODE_TEXT, scopeValue).kind, "legacy_global_cas");
    });
  }
});

function normalizeFixtureBackpackSlots(value) {
  return (Array.isArray(value) ? value : []).map((slot) => (
    slot && typeof slot === "object" && !Array.isArray(slot) && slot.itemId
      ? {itemId: String(slot.itemId).trim(), count: Math.max(0, Math.trunc(Number(slot.count || 0)))}
      : {}
  ));
}

function fixtureBackpackItemCount(slots, itemId) {
  return normalizeFixtureBackpackSlots(slots).reduce((total, slot) => (
    slot.itemId === itemId ? total + slot.count : total
  ), 0);
}

function consumeFixtureBackpackItem(slots, itemId, count) {
  let remaining = count;
  return normalizeFixtureBackpackSlots(slots).map((slot) => {
    if (remaining <= 0 || slot.itemId !== itemId) {
      return slot;
    }
    const consumed = Math.min(slot.count, remaining);
    remaining -= consumed;
    return slot.count > consumed ? {itemId, count: slot.count - consumed} : {};
  });
}

function certifyFixtureOrdinaryProfileChange(before, after) {
  return certifiedOrdinaryAttachmentProfileChange({
    before,
    candidate: after,
    accountId: SENDER_ACCOUNT_ID,
    items: [{itemId: "item_meat_small", count: 2}],
    normalizeBackpackSlots: normalizeFixtureBackpackSlots,
    profileBackpackSlots: (profile) => profile.backpackSlots,
    backpackItemCount: fixtureBackpackItemCount,
    consumeBackpackItem: consumeFixtureBackpackItem,
    captureToolBagFromProfile: (profile) => profile.captureTools,
  });
}

test("ordinary scope independently rejects a best-effort deduction from insufficient inventory", () => {
  const healthyBefore = baselineState();
  const healthyAfter = candidateState(healthyBefore, MAIL_SEND_MODE_ORDINARY_ITEMS);
  assert.equal(
    certifyFixtureOrdinaryProfileChange(healthyBefore, healthyAfter).playerId,
    SENDER_PLAYER_ID,
  );

  const shortBefore = baselineState();
  shortBefore.profiles[SENDER_PLAYER_ID].profile.backpackSlots = [
    {itemId: "item_meat_small", count: 1},
    {},
    {},
  ];
  const shortAfter = candidateState(shortBefore, MAIL_SEND_MODE_ORDINARY_ITEMS);
  shortAfter.profiles[SENDER_PLAYER_ID].profile.backpackSlots = [{}, {}, {}];

  assert.equal(certifyFixtureOrdinaryProfileChange(shortBefore, shortAfter), null);
});

test("real durable text and ordinary sends sign row-local scopes while equipment and mixed stay legacy", async () => {
  for (const mode of [MAIL_SEND_MODE_TEXT, MAIL_SEND_MODE_ORDINARY_ITEMS, "equipment", "mixed"]) {
    const base = createMemoryAuthStore();
    const seed = createAuthService({store: base});
    const sender = seed.register({username: `mss_${mode}`.slice(0, 20), password: "test1234", displayName: "寄件"});
    const recipient = seed.register({username: `msr_${mode}`.slice(0, 20), password: "test1234", displayName: "收件"});
    if (mode !== MAIL_SEND_MODE_TEXT) {
      const current = seed.getProfile(sender.session.token);
      if (mode === MAIL_SEND_MODE_ORDINARY_ITEMS) {
        current.profile.backpackSlots[0] = {itemId: "item_meat_small", count: 2};
      } else {
        current.profile.backpackSlots[0] = {itemId: "weapon_wooden_club", count: 1};
        if (mode === "mixed") {
          current.profile.backpackSlots[1] = {itemId: "item_meat_small", count: 2};
        }
        current.profile.equipmentInstances = {
          equip_mail_send_scope_0001: {
            schemaVersion: 1,
            instanceId: "equip_mail_send_scope_0001",
            itemId: "weapon_wooden_club",
            location: "backpack",
            slotId: "",
            durability: 30,
            enhancement: {itemId: "weapon_wooden_club", level: 0, history: []},
            wearCounters: {itemId: "weapon_wooden_club", attackCount: 0, hitCount: 0},
            expPillCharge: {},
            source: "mail_send_scope_test",
          },
        };
        current.profile.equipmentSlotInstanceIds = {};
        current.profile.equipmentSlotsVersion = 5;
        current.profile.nextEquipmentInstanceSerial = 2;
      }
      assert.equal(seed.saveProfile(sender.session.token, {
        expectedRevision: current.profileSummary.profileRevision,
        profile: current.profile,
      }).ok, true);
    }
    let committed = cloneAuthorityRoot(base.load());
    let saveOptions = null;
    let savedPlan = null;
    const service = createAuthService({store: {
      load: () => cloneAuthorityRoot(committed),
      save(next, options = {}) {
        saveOptions = cloneAuthorityRoot(options);
        savedPlan = buildMysqlSavePlan(next, committed, options);
        committed = cloneAuthorityRoot(next);
      },
    }});
    const payload = {
      recipientUsername: recipient.account.username,
      title: "真实 scope",
      body: "按附件类型选择事务边界。",
    };
    if (mode === MAIL_SEND_MODE_ORDINARY_ITEMS) {
      payload.items = [{itemId: "item_meat_small", count: 1}];
    } else if (["equipment", "mixed"].includes(mode)) {
      payload.items = [{
        itemId: "weapon_wooden_club",
        count: 1,
        instanceId: "equip_mail_send_scope_0001",
        sourceSlotIndex: 0,
      }];
      if (mode === "mixed") {
        payload.items.push({itemId: "item_meat_small", count: 1});
      }
    }
    const operation = {
      operationId: `op_real_mail_send_${mode}_0001`,
      requestHash: (
        mode === MAIL_SEND_MODE_TEXT
          ? "a"
          : mode === MAIL_SEND_MODE_ORDINARY_ITEMS
            ? "b"
            : mode === "equipment" ? "c" : "d"
      ).repeat(64),
      actionId: ACTION_ID,
    };
    const result = await service.invokeDurable("sendMail", [sender.session.token, payload], operation);
    assert.equal(result.ok, true, `${mode}: ${JSON.stringify(result)}`);
    if (["equipment", "mixed"].includes(mode)) {
      assert.equal(saveOptions.consistencyScope, undefined);
      assert.equal(savedPlan.kind, "legacy_global_cas");
    } else {
      assert.equal(saveOptions.consistencyScope.kind, "row_local_mail_send_v1");
      assert.equal(saveOptions.consistencyScope.mode, mode);
      assert.equal(savedPlan.kind, "mail_send_conditional_v1");
    }
  }
});

test("ambiguous text and ordinary sends recover only their exact committed resources", async (t) => {
  for (const mode of [MAIL_SEND_MODE_TEXT, MAIL_SEND_MODE_ORDINARY_ITEMS]) {
    await t.test(mode, async () => {
      const base = createMemoryAuthStore();
      const seed = createAuthService({store: base});
      const prefix = mode === MAIL_SEND_MODE_TEXT ? "amst" : "amso";
      const sender = seed.register({
        username: `${prefix}_sender`,
        password: "test1234",
        displayName: "模糊寄件人",
      });
      const recipient = seed.register({
        username: `${prefix}_recipient`,
        password: "test1234",
        displayName: "模糊收件人",
      });
      const unrelated = seed.register({
        username: `${prefix}_other`,
        password: "test1234",
        displayName: "无关玩家",
      });
      if (mode === MAIL_SEND_MODE_ORDINARY_ITEMS) {
        const current = seed.getProfile(sender.session.token);
        current.profile.backpackSlots[0] = {itemId: "item_meat_small", count: 2};
        assert.equal(seed.saveProfile(sender.session.token, {
          expectedRevision: current.profileSummary.profileRevision,
          profile: current.profile,
        }).ok, true);
      }
      const unrelatedRecordPoint = {
        mapId: "firebud_training_yard",
        spawnName: `${prefix}_mail_recovery_other`,
        label: "邮件提交后的无关记录点",
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
          throw new Error("connection lost after mail send commit");
        },
      }, {onError() {}});
      const service = createAuthService({store});
      const operation = {
        operationId: `op_mail_send_ambiguous_${mode}_0001`,
        requestHash: (mode === MAIL_SEND_MODE_TEXT ? "d" : "e").repeat(64),
        actionId: ACTION_ID,
      };
      const payload = {
        recipientUsername: recipient.account.username,
        title: "模糊提交恢复",
        body: "只能按本次邮件资源确认提交结果。",
      };
      if (mode === MAIL_SEND_MODE_ORDINARY_ITEMS) {
        payload.items = [{itemId: "item_meat_small", count: 1}];
      }

      const result = await service.invokeDurable(
        "sendMail",
        [sender.session.token, payload],
        operation,
      );

      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(store.metrics().ambiguousCommitRecoveries, 1);
      const snapshot = service.snapshot();
      assert.deepEqual(snapshot.mailMessages[result.mail.mailId].items, payload.items || []);
      assert.equal(
        snapshot.profiles[unrelated.profileBinding.playerId].profile.recordPoint.label,
        unrelatedRecordPoint.label,
      );
      assert.deepEqual(snapshot, base.load());
    });
  }
});

function conditionalPool(options = {}) {
  const transaction = {
    queries: [],
    begun: false,
    committed: false,
    rolledBack: false,
    released: false,
  };
  return {
    transaction,
    pool: {
      async getConnection() {
        return {
          async beginTransaction() { transaction.begun = true; },
          async query(statement, params = []) {
            const sql = typeof statement === "string" ? statement : String(statement && statement.sql || "");
            if (sql.trim() === MYSQL_SESSION_POLICY_SQL) {
              assert.deepEqual(params, [3, 5]);
              return [{affectedRows: 0}, []];
            }
            transaction.queries.push({sql, params});
            if (/auth_store_revisions[\s\S]+scope_key = 'auth'[\s\S]+FOR SHARE/i.test(sql)) {
              return [[{storeRevision: 0}], []];
            }
            if (/FROM profile_bindings[\s\S]+FOR UPDATE/i.test(sql)) {
              return [[{account_id: SENDER_ACCOUNT_ID, player_id: SENDER_PLAYER_ID, profile_revision: 1}], []];
            }
            if (/FROM profiles[\s\S]+FOR UPDATE/i.test(sql)) {
              return [[{player_id: SENDER_PLAYER_ID, account_id: SENDER_ACCOUNT_ID, profile_revision: 1}], []];
            }
            if (/^UPDATE (?:profile_bindings|profiles)\b/i.test(sql.trim())) {
              return [{affectedRows: 1}, []];
            }
            if (/^INSERT INTO mail_messages\b/i.test(sql.trim())) {
              if (options.duplicateMail) {
                const error = new Error("duplicate mail");
                error.code = "ER_DUP_ENTRY";
                throw error;
              }
              return [{affectedRows: 1}, []];
            }
            if (sql === MUTATION_RECEIPT_CAPACITY_UPDATE_SQL) {
              assert.deepEqual(params, [1, 1]);
              return [{affectedRows: 1}, []];
            }
            if (/^INSERT INTO mutation_receipts\b/i.test(sql.trim())) {
              if (options.duplicateReceipt) {
                const error = new Error("duplicate receipt");
                error.code = "ER_DUP_ENTRY";
                throw error;
              }
              return [{affectedRows: 1}, []];
            }
            throw new Error(`unmodeled SQL: ${sql}`);
          },
          async commit() { transaction.committed = true; },
          async rollback() { transaction.rolledBack = true; },
          release() { transaction.released = true; },
          destroy() {},
        };
      },
    },
  };
}

test("conditional executor commits without advancing the global revision", async () => {
  const before = baselineState();
  const fixture = conditionalPool();
  const result = await runMysqlPoolSavePlan(
    fixture.pool,
    plan(candidateState(before), before),
    {expectedRevision: 0},
  );
  assert.deepEqual(result, {revision: 0, globalRevisionAdvanced: false});
  assert.equal(fixture.transaction.committed, true);
  assert.equal(fixture.transaction.rolledBack, false);
});

for (const duplicate of ["duplicateMail", "duplicateReceipt"]) {
  test(`${duplicate} rolls every prior profile, mail, and receipt write back`, async () => {
    const before = baselineState();
    const fixture = conditionalPool({[duplicate]: true});
    await assert.rejects(
      runMysqlPoolSavePlan(
        fixture.pool,
        plan(
          candidateState(before, MAIL_SEND_MODE_ORDINARY_ITEMS),
          before,
          MAIL_SEND_MODE_ORDINARY_ITEMS,
        ),
        {expectedRevision: 0},
      ),
      (error) => error
        && error.code === "mysql_resource_revision_conflict"
        && error.outcomeUnknown === false
        && error.rollbackConfirmed === true,
    );
    assert.equal(fixture.transaction.committed, false);
    assert.equal(fixture.transaction.rolledBack, true);
    assert.equal(fixture.transaction.released, true);
    if (duplicate === "duplicateReceipt") {
      assert.equal(
        fixture.transaction.queries.some(({sql}) => /^INSERT INTO mutation_receipts\b/i.test(sql.trim())),
        true,
      );
    }
  });
}

test("post-COMMIT merge publishes only the exact mail, receipt, and optional sender profile", () => {
  for (const mode of [MAIL_SEND_MODE_TEXT, MAIL_SEND_MODE_ORDINARY_ITEMS]) {
    const before = baselineState();
    const expected = candidateState(before, mode);
    const committed = cloneAuthorityRoot(expected);
    committed.mailMessages.mail_unrelated.body = "candidate must not replace this";
    committed.profiles[SENDER_PLAYER_ID].profile.displayName = mode === MAIL_SEND_MODE_TEXT
      ? "candidate text drift"
      : committed.profiles[SENDER_PLAYER_ID].profile.displayName;
    const built = plan(expected, before, mode);
    const merged = mergeMysqlSaveBaselineAfterCommit(before, committed, built);

    assert.deepEqual(merged.mailMessages.mail_unrelated, before.mailMessages.mail_unrelated);
    assert.deepEqual(merged.mailMessages[MAIL_ID], committed.mailMessages[MAIL_ID]);
    assert.ok(merged.mutationReceipts[OPERATION_ID]);
    if (mode === MAIL_SEND_MODE_TEXT) {
      assert.deepEqual(merged.profiles[SENDER_PLAYER_ID], before.profiles[SENDER_PLAYER_ID]);
    } else {
      assert.deepEqual(merged.profiles[SENDER_PLAYER_ID], committed.profiles[SENDER_PLAYER_ID]);
    }
  }
});
