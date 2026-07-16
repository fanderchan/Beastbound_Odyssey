"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {readMailAttachmentState} = require("../src/auth/mail-attachment-state");
const {
  buildMailStorageBootstrapPlan,
} = require("../src/mysql-mail-storage-bootstrap-plan");
const {
  buildMailStorageForwardMaintenancePlan,
  projectActiveMailIdentityRow,
} = require("../src/mysql-mail-storage-forward-maintenance");

const CREATED_AT = "2026-07-16T04:00:00.000Z";
const READ_AT = "2026-07-16T04:30:00.000Z";
const SETTLED_AT = "2026-07-16T05:00:00.000Z";
const REWRITTEN_SETTLED_AT = "2026-07-16T06:00:00.000Z";
const ordinaryItemId = "item_meat_small";
const emptyEquipmentCatalog = {itemById: new Map()};

function certifyAttachment(mail) {
  return readMailAttachmentState(mail, emptyEquipmentCatalog, {
    itemById(itemId) {
      return itemId === ordinaryItemId ? {id: itemId} : null;
    },
    isEquipmentItemId() {
      return false;
    },
  });
}

function mailDocument(overrides = {}) {
  return {
    mailId: "mail_forward_1",
    mailKind: "player",
    senderAccountId: "account_sender",
    senderUsername: "sender",
    senderDisplayName: "寄件人",
    recipientAccountId: "account_recipient",
    recipientUsername: "recipient",
    recipientDisplayName: "收件人",
    title: "前向维护测试",
    body: "邮件正文只进入文档摘要。",
    items: [{itemId: ordinaryItemId, count: 2}],
    equipmentEnvelopes: [],
    currency: {},
    createdAt: CREATED_AT,
    readAt: null,
    schemaVersion: 2,
    ...overrides,
  };
}

function physicalRow(mail) {
  return {
    mail_id: mail.mailId,
    sender_account_id: mail.senderAccountId,
    recipient_account_id: mail.recipientAccountId,
    title: mail.title,
    created_at: mail.createdAt,
    read_at: mail.readAt ?? null,
    document_json: structuredClone(mail),
  };
}

function storageState(dataGeneration = 1) {
  return dataGeneration === 0
    ? {
      controlFence: true,
      schemaGeneration: 1,
      dataGeneration: 0,
      lifecycleState: "uninitialized",
    }
    : {
      controlFence: true,
      schemaGeneration: 1,
      dataGeneration: 1,
      lifecycleState: "ready",
    };
}

function build(changes, options = {}) {
  return buildMailStorageForwardMaintenancePlan({
    storageState: options.storageState || storageState(1),
    changes,
    certifyAttachment: options.certifyAttachment || certifyAttachment,
  });
}

function insertChange(after) {
  return {
    mailId: after.mailId,
    before: null,
    after,
    disposition: "insert",
  };
}

function updateChange(before, after, mailId = before.mailId) {
  return {mailId, before, after, disposition: "update"};
}

test("generation zero only requires the control fence and leaves sidecars disabled", () => {
  const plan = buildMailStorageForwardMaintenancePlan({
    storageState: storageState(0),
    changes: "legacy writer is deliberately opaque",
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.controlFence, true);
  assert.equal(plan.dataGeneration, 0);
  assert.equal(plan.sidecarEnabled, false);
  assert.deepEqual(plan.identityInserts, []);
  assert.deepEqual(plan.identityUpdates, []);
  assert.deepEqual(plan.counterIncrements, []);
  assert.deepEqual(plan.errors, []);
  assert.match(plan.planDigest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.identityInserts), true);
});

test("invalid or unfenced storage state fails closed before reading deltas", () => {
  for (const state of [
    {dataGeneration: 0, lifecycleState: "uninitialized"},
    {controlFence: true, dataGeneration: 1, lifecycleState: "building"},
    {controlFence: true, schemaGeneration: 2, dataGeneration: 1, lifecycleState: "ready"},
  ]) {
    const plan = buildMailStorageForwardMaintenancePlan({storageState: state});
    assert.equal(plan.ok, false);
    assert.equal(plan.sidecarEnabled, false);
    assert.deepEqual(plan.identityInserts, []);
    assert.deepEqual(plan.identityUpdates, []);
    assert.deepEqual(plan.counterIncrements, []);
    assert.equal(plan.errors.length, 1);
  }
});

test("bootstrap and forward insert use byte-identical permanent identity projections", () => {
  const mail = mailDocument();
  const bootstrap = buildMailStorageBootstrapPlan({
    sourceRows: [physicalRow(mail)],
    certifyAttachment,
  });
  const forward = build([insertChange(mail)]);

  assert.equal(bootstrap.ok, true);
  assert.equal(forward.ok, true);
  assert.deepEqual(forward.identityInserts[0], bootstrap.identityRows[0]);
  assert.equal(
    forward.identityInserts[0].identityDigest,
    bootstrap.identityRows[0].identityDigest,
  );
  assert.equal(
    forward.identityInserts[0].documentDigest,
    bootstrap.identityRows[0].documentDigest,
  );
  assert.deepEqual(
    projectActiveMailIdentityRow({mail, settledAt: null}),
    bootstrap.identityRows[0],
  );
});

test("generation one insert and read update project synchronized document digests", () => {
  const insertedMail = mailDocument();
  const insertPlan = build([insertChange(insertedMail)]);
  assert.equal(insertPlan.ok, true);
  assert.deepEqual(insertPlan.counterIncrements, [{
    recipientAccountId: "account_recipient",
    incrementBy: 1,
    dataGeneration: 1,
  }]);

  const readMail = mailDocument({readAt: READ_AT});
  const updatePlan = build([updateChange(insertedMail, readMail)]);
  assert.equal(updatePlan.ok, true);
  assert.equal(updatePlan.identityUpdates.length, 1);
  assert.equal(updatePlan.identityUpdates[0].previousSettledAt, null);
  assert.equal(updatePlan.identityUpdates[0].nextSettledAt, null);
  assert.notEqual(
    updatePlan.identityUpdates[0].previousDocumentDigest,
    updatePlan.identityUpdates[0].nextDocumentDigest,
  );
  assert.equal(
    updatePlan.identityUpdates[0].previousDocumentDigest,
    projectActiveMailIdentityRow({mail: insertedMail}).documentDigest,
  );
  assert.equal(
    updatePlan.identityUpdates[0].nextDocumentDigest,
    projectActiveMailIdentityRow({mail: readMail}).documentDigest,
  );
  assert.deepEqual(updatePlan.counterIncrements, []);
});

test("legacy non-ISO creation text remains updatable but generation-one inserts require ISO", () => {
  const legacyCreatedAt = "2026-07-16 04:00:00";
  const before = mailDocument({createdAt: legacyCreatedAt});
  const after = mailDocument({createdAt: legacyCreatedAt, readAt: READ_AT});

  const update = build([updateChange(before, after)]);
  assert.equal(update.ok, true);
  assert.equal(update.identityUpdates.length, 1);
  assert.equal(update.identityUpdates[0].createdAt, legacyCreatedAt);
  assert.notEqual(
    update.identityUpdates[0].previousDocumentDigest,
    update.identityUpdates[0].nextDocumentDigest,
  );

  const insert = build([insertChange(before)]);
  assert.equal(insert.ok, false);
  assert.equal(insert.errors[0].code, "mail_storage_forward_identity_invalid");
  assert.deepEqual(insert.identityInserts, []);
  assert.deepEqual(insert.counterIncrements, []);
});

test("partial claim stays unsettled and full claim records one canonical settlement", () => {
  const beforePartial = mailDocument();
  const afterPartial = mailDocument({
    items: [{itemId: ordinaryItemId, count: 1}],
  });
  const partial = build([updateChange(beforePartial, afterPartial)]);
  assert.equal(partial.ok, true);
  assert.equal(partial.identityUpdates[0].previousSettledAt, null);
  assert.equal(partial.identityUpdates[0].nextSettledAt, null);
  assert.notEqual(
    partial.identityUpdates[0].previousDocumentDigest,
    partial.identityUpdates[0].nextDocumentDigest,
  );

  const afterFull = mailDocument({
    items: [],
    readAt: SETTLED_AT,
    settledAt: SETTLED_AT,
  });
  const full = build([updateChange(afterPartial, afterFull)]);
  assert.equal(full.ok, true);
  assert.equal(full.identityUpdates[0].previousSettledAt, null);
  assert.equal(full.identityUpdates[0].nextSettledAt, SETTLED_AT);
  assert.equal(
    full.identityUpdates[0].nextDocumentDigest,
    projectActiveMailIdentityRow({mail: afterFull, settledAt: SETTLED_AT}).documentDigest,
  );
});

test("mail id, sender, recipient and creation time are permanent on update", () => {
  const before = mailDocument();
  const cases = [
    mailDocument({mailId: "mail_forward_other"}),
    mailDocument({senderAccountId: "account_other_sender"}),
    mailDocument({recipientAccountId: "account_other_recipient"}),
    mailDocument({createdAt: "2026-07-16T04:00:01.000Z"}),
  ];
  for (const after of cases) {
    const plan = build([updateChange(before, after)]);
    assert.equal(plan.ok, false);
    assert.equal(plan.errors[0].code, "mail_storage_forward_identity_drift");
    assert.deepEqual(plan.identityUpdates, []);
  }
});

test("an explicit settlement cannot be rolled back or rewritten", () => {
  const settled = mailDocument({
    items: [],
    readAt: SETTLED_AT,
    settledAt: SETTLED_AT,
  });
  const rollback = mailDocument({items: [], readAt: SETTLED_AT});
  const rewrite = mailDocument({
    items: [],
    readAt: SETTLED_AT,
    settledAt: REWRITTEN_SETTLED_AT,
  });

  for (const after of [rollback, rewrite]) {
    const plan = build([updateChange(settled, after)]);
    assert.equal(plan.ok, false);
    assert.equal(
      plan.errors[0].code,
      "mail_storage_forward_settlement_transition_invalid",
    );
    assert.deepEqual(plan.identityUpdates, []);
  }
});

test("active mail delete is always rejected in generation one", () => {
  const before = mailDocument();
  const plan = build([{
    mailId: before.mailId,
    before,
    after: null,
    disposition: "delete",
  }]);

  assert.equal(plan.ok, false);
  assert.equal(plan.errors[0].code, "mail_storage_forward_delete_forbidden");
  assert.deepEqual(plan.identityInserts, []);
  assert.deepEqual(plan.identityUpdates, []);
  assert.deepEqual(plan.counterIncrements, []);
});

test("unknown attachments and future mail schemas fail closed with stable cause codes", () => {
  const unknown = mailDocument({items: [{itemId: "item_unknown", count: 1}]});
  const future = mailDocument({schemaVersion: 3});

  const unknownPlan = build([insertChange(unknown)]);
  assert.equal(unknownPlan.ok, false);
  assert.equal(unknownPlan.errors[0].code, "mail_item_unknown");

  const futurePlan = build([insertChange(future)]);
  assert.equal(futurePlan.ok, false);
  assert.equal(futurePlan.errors[0].code, "mail_schema_future");
  assert.deepEqual(futurePlan.identityInserts, []);
  assert.deepEqual(futurePlan.counterIncrements, []);
});

test("multiple inserts are sorted and aggregate one recipient counter increment", () => {
  const mailA = mailDocument({mailId: "mail_forward_a"});
  const mailB = mailDocument({mailId: "mail_forward_b"});
  const mailC = mailDocument({
    mailId: "mail_forward_c",
    recipientAccountId: "account_another_recipient",
    recipientUsername: "another",
    recipientDisplayName: "另一位收件人",
  });
  const first = build([insertChange(mailB), insertChange(mailC), insertChange(mailA)]);
  const second = build([insertChange(mailA), insertChange(mailB), insertChange(mailC)]);

  assert.equal(first.ok, true);
  assert.deepEqual(first.identityInserts.map((row) => row.mailId), [
    "mail_forward_a",
    "mail_forward_b",
    "mail_forward_c",
  ]);
  assert.deepEqual(first.counterIncrements, [
    {
      recipientAccountId: "account_another_recipient",
      incrementBy: 1,
      dataGeneration: 1,
    },
    {
      recipientAccountId: "account_recipient",
      incrementBy: 2,
      dataGeneration: 1,
    },
  ]);
  assert.deepEqual(first, second);
  assert.equal(first.planDigest, second.planDigest);
});

test("duplicate mail changes and missing generation-one certifier are rejected", () => {
  const mail = mailDocument();
  const duplicate = build([insertChange(mail), insertChange(mail)]);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.errors[0].code, "mail_storage_forward_change_duplicate");

  const missing = buildMailStorageForwardMaintenancePlan({
    storageState: storageState(1),
    changes: [],
  });
  assert.equal(missing.ok, false);
  assert.equal(
    missing.errors[0].code,
    "mail_storage_forward_attachment_certifier_missing",
  );
});
