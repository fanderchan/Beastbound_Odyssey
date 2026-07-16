"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {cloneAuthorityRoot} = require("../src/auth/authority-root-clone");
const {
  canonicalDurableMutationReceipts,
  commitDurableMutationReceiptDelta,
  stageDurableMutationReceipt,
} = require("../src/auth/durable-mutation-state");
const {
  commitMailAuthorityDelta,
  mailAuthorityDiagnostics,
  readMailAuthorityState,
  stageMailAuthorityUpsert,
} = require("../src/auth/mail-authority-state");
const {
  mysqlResourceAcquisitionTrace,
} = require("../src/mysql-resource-acquisition-order");
const {
  __buildMysqlSavePlanFromPersistentDataForTest: buildMysqlSavePlan,
  __mergeMysqlSaveBaselineAfterCommitForTest: mergeMysqlSaveBaselineAfterCommit,
} = require("../src/mysql-store");

const ACCOUNT_ID = "acc_mail_read_owner";
const MAIL_ID = "mail_read_conditional_0001";
const OPERATION_ID = "op_mail_read_conditional_0001";
const REQUEST_HASH = "7".repeat(64);
const ACTION_ID = "POST /mail/:id/read";
const CREATED_AT = "2026-07-16T08:00:00.000Z";
const READ_AT = "2026-07-16T08:30:00.000Z";

function mail(overrides = {}) {
  return {
    mailId: MAIL_ID,
    senderAccountId: "acc_mail_read_sender",
    recipientAccountId: ACCOUNT_ID,
    title: "精确标记已读",
    body: "只能更新 readAt。",
    items: [],
    currency: {},
    createdAt: CREATED_AT,
    readAt: null,
    schemaVersion: 1,
    ...overrides,
  };
}

function receipt(overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: OPERATION_ID,
    requestHash: REQUEST_HASH,
    actionId: ACTION_ID,
    accountId: ACCOUNT_ID,
    committedAt: READ_AT,
    expiresAt: "2026-07-19T08:30:00.000Z",
    response: {
      ok: true,
      mail: {mailId: MAIL_ID, readAt: READ_AT},
      message: "邮件已读。",
    },
    ...overrides,
  };
}

function baselineState(historyCount = 1) {
  const rawMail = {[MAIL_ID]: mail()};
  for (let index = 0; index < historyCount; index += 1) {
    const mailId = `mail_read_history_${String(index).padStart(5, "0")}`;
    rawMail[mailId] = mail({mailId, title: "未触碰历史邮件"});
  }
  const canonical = readMailAuthorityState(rawMail);
  assert.equal(canonical.ok, true);
  return {
    schemaVersion: 1,
    accounts: {},
    sessions: {},
    profileBindings: {},
    profiles: {},
    mutationReceipts: canonicalDurableMutationReceipts({}),
    mailMessages: canonical.messages,
    marketListings: {},
    consumedEquipmentEnvelopes: {},
    marketConfig: {},
    offlineHangConfig: {},
    parties: {},
    partyInvites: {},
    families: {},
    manors: {},
    manorWars: [],
    manorBattles: [],
    chatMessages: [],
    playerPositions: {},
    battleInvites: {},
    battleRooms: {},
    battleRecords: [],
    battleTrace: [],
    gmUserGrants: {},
    gmCommandGrants: {},
    gmCommandAudit: [],
    authEvents: [],
    serviceEventSeq: 0,
    serviceEvents: [],
  };
}

function candidateState(before) {
  const after = cloneAuthorityRoot(before);
  const stagedMail = stageMailAuthorityUpsert(after.mailMessages, {
    ...after.mailMessages[MAIL_ID],
    readAt: READ_AT,
  });
  assert.equal(stagedMail.ok, true);
  after.mailMessages = stagedMail.messages;
  after.mutationReceipts = stageDurableMutationReceipt(
    after.mutationReceipts,
    receipt(),
    {nowMs: Date.parse(READ_AT)},
  );
  return after;
}

function scope(overrides = {}) {
  return {
    kind: "row_local_mail_read_v1",
    mailDisposition: "update",
    accountId: ACCOUNT_ID,
    mailId: MAIL_ID,
    operationId: OPERATION_ID,
    requestHash: REQUEST_HASH,
    actionId: ACTION_ID,
    ...overrides,
  };
}

function plan(after, before, scopeValue = scope()) {
  return buildMysqlSavePlan(after, before, {consistencyScope: scopeValue});
}

test("mail read plan locks and updates only one unread row before its durable receipt", () => {
  const before = baselineState();
  const built = plan(candidateState(before), before);

  assert.equal(built.kind, "mail_read_conditional_v1");
  assert.equal(built.globalRevisionFence, false);
  assert.equal(built.globalCompatibilityBarrier, "shared");
  assert.deepEqual(built.locks.map(({resource, key}) => [resource, key]), [
    ["mail_message", MAIL_ID],
  ]);
  assert.deepEqual(built.writes.map(({resource, kind}) => [resource, kind]), [
    ["mail_message", "update"],
    ["mutation_receipt_capacity", "update"],
    ["mutation_receipt", "insert"],
  ]);
  assert.match(built.writes[0].sql, /^UPDATE mail_messages\b/i);
  assert.match(built.writes[0].sql, /read_at <=> \?/i);
  assert.deepEqual(
    mysqlResourceAcquisitionTrace(built).map(({resource, stage}) => [resource, stage]),
    [
      ["mail_message", "lock"],
      ["mutation_receipt_capacity", "update"],
      ["mutation_receipt", "insert"],
    ],
  );
});

test("mail read planner does not enumerate 2000 untouched mailbox rows", () => {
  const before = baselineState(2000);
  const after = candidateState(before);
  const beforeOwnKeys = mailAuthorityDiagnostics(before.mailMessages).ownKeyEnumerations;
  const afterOwnKeys = mailAuthorityDiagnostics(after.mailMessages).ownKeyEnumerations;

  const built = plan(after, before);

  assert.equal(built.kind, "mail_read_conditional_v1");
  assert.equal(mailAuthorityDiagnostics(before.mailMessages).ownKeyEnumerations, beforeOwnKeys);
  assert.equal(mailAuthorityDiagnostics(after.mailMessages).ownKeyEnumerations, afterOwnKeys);
});

test("a second mail or profile change forces the complete legacy CAS path", () => {
  const before = baselineState();

  const secondMail = candidateState(before);
  const stagedSecond = stageMailAuthorityUpsert(secondMail.mailMessages, {
    ...secondMail.mailMessages.mail_read_history_00000,
    title: "夹带的第二封邮件变化",
  });
  assert.equal(stagedSecond.ok, true);
  secondMail.mailMessages = stagedSecond.messages;
  assert.equal(plan(secondMail, before).kind, "legacy_global_cas");

  const profileDrift = candidateState(before);
  profileDrift.profiles.player_hidden = {
    playerId: "player_hidden",
    accountId: ACCOUNT_ID,
    profileRevision: 1,
    updatedAt: READ_AT,
    profile: {displayName: "不允许夹带"},
  };
  assert.equal(plan(profileDrift, before).kind, "legacy_global_cas");
});

test("post-COMMIT merge publishes only the target mail and receipt", () => {
  const before = baselineState();
  // The store baseline and request candidate are independent authority
  // lineages in production (database cache versus service snapshot).
  const after = candidateState(baselineState());
  const built = plan(after, before);
  const unrelatedId = "mail_read_history_00000";
  const unrelatedDrift = stageMailAuthorityUpsert(after.mailMessages, {
    ...after.mailMessages[unrelatedId],
    title: "候选根中的无关漂移",
  });
  assert.equal(unrelatedDrift.ok, true);
  const committed = {
    ...after,
    mutationReceipts: commitDurableMutationReceiptDelta(after.mutationReceipts),
    mailMessages: commitMailAuthorityDelta(unrelatedDrift.messages),
  };

  const merged = mergeMysqlSaveBaselineAfterCommit(before, committed, built);

  assert.equal(merged.mailMessages[MAIL_ID].readAt, READ_AT);
  assert.deepEqual(merged.mailMessages[unrelatedId], before.mailMessages[unrelatedId]);
  assert.ok(merged.mutationReceipts[OPERATION_ID]);
});
