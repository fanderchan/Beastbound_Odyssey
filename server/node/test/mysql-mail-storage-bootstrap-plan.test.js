"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {readMailAttachmentState} = require("../src/auth/mail-attachment-state");
const {stableDigest} = require("../src/auth/profile-migrations");
const {
  MAIL_STORAGE_BOOTSTRAP_VALIDATION_CONTRACT,
  buildMailStorageBootstrapPlan,
  publicMailStorageBootstrapPlanReport,
  reconcileMailStorageBootstrapPlan,
  verifyMailStorageBootstrapPlan,
} = require("../src/mysql-mail-storage-bootstrap-plan");

const CREATED_AT = "2026-07-16T04:00:00.000Z";
const SETTLED_AT = "2026-07-16T05:00:00.000Z";
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
  const mailId = overrides.mailId || "mail_bootstrap_1";
  const senderAccountId = overrides.senderAccountId || "account_sender";
  const recipientAccountId = overrides.recipientAccountId || "account_recipient";
  const title = Object.hasOwn(overrides, "title") ? overrides.title : "停服回填测试";
  const createdAt = Object.hasOwn(overrides, "createdAt") ? overrides.createdAt : CREATED_AT;
  const readAt = Object.hasOwn(overrides, "readAt") ? overrides.readAt : null;
  const document = {
    mailId,
    mailKind: "player",
    senderAccountId,
    senderUsername: "sender",
    senderDisplayName: "寄件人",
    recipientAccountId,
    recipientUsername: "recipient",
    recipientDisplayName: "收件人",
    title,
    body: "物理邮件必须原样认证。",
    items: [],
    equipmentEnvelopes: [],
    currency: {},
    createdAt,
    readAt,
    schemaVersion: 2,
    ...overrides,
  };
  return document;
}

function physicalRow(documentValue = mailDocument(), overrides = {}) {
  const document = structuredClone(documentValue);
  return {
    mail_id: document.mailId,
    sender_account_id: document.senderAccountId,
    recipient_account_id: document.recipientAccountId,
    title: document.title,
    created_at: document.createdAt,
    read_at: document.readAt ?? null,
    document_json: document,
    ...overrides,
  };
}

function build(sourceRows, options = {}) {
  return buildMailStorageBootstrapPlan({
    sourceRows,
    certifyAttachment: options.certifyAttachment || certifyAttachment,
  });
}

function verify(plan, attachmentCertifier = certifyAttachment) {
  return verifyMailStorageBootstrapPlan(plan, {
    certifyAttachment: attachmentCertifier,
  });
}

function reconcile(plan, target, attachmentCertifier = certifyAttachment) {
  return reconcileMailStorageBootstrapPlan(plan, target, {
    certifyAttachment: attachmentCertifier,
  });
}

function initialControl(overrides = {}) {
  return {
    scopeKey: "mail_lifecycle",
    schemaGeneration: 1,
    dataGeneration: 0,
    lifecycleState: "uninitialized",
    archiveEnabled: false,
    vaultClaimEnabled: false,
    activeLimitEnabled: false,
    bootstrapCursorMailId: "",
    bootstrapSourceCount: 0,
    bootstrapIdentityCount: 0,
    bootstrapRecipientCount: 0,
    bootstrapActiveCount: 0,
    sourceDigest: "",
    reconciledAt: "",
    ...overrides,
  };
}

function buildingControl(plan, overrides = {}) {
  return initialControl({
    dataGeneration: 1,
    lifecycleState: "building",
    bootstrapSourceCount: plan.counts.source,
    bootstrapIdentityCount: plan.counts.identity,
    bootstrapRecipientCount: plan.counts.recipient,
    bootstrapActiveCount: plan.counts.active,
    sourceDigest: plan.sourceDigest,
    ...overrides,
  });
}

function readyControl(plan, overrides = {}) {
  return buildingControl(plan, {
    lifecycleState: "ready",
    bootstrapCursorMailId: plan.lastMailId,
    reconciledAt: SETTLED_AT,
    ...overrides,
  });
}

function observed(control, identityRows = [], counterRows = [], overrides = {}) {
  return {
    control,
    identityRows,
    counterRows,
    archiveRows: [],
    vaultRows: [],
    ...overrides,
  };
}

function reverseObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(reverseObjectKeys);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value).reverse().map((key) => [key, reverseObjectKeys(value[key])]),
  );
}

function recomputePlanDigest(plan) {
  return stableDigest({
    kind: plan.kind,
    schemaVersion: plan.schemaVersion,
    validationContract: plan.validationContract,
    sourceDigest: plan.sourceDigest,
    identityRows: plan.identityRows,
    counterRows: plan.counterRows,
    archiveRows: [],
    vaultRows: [],
    counts: plan.counts,
    lastMailId: plan.lastMailId,
    target: plan.target,
  });
}

function recomputeSourceDigest(plan) {
  return stableDigest({
    kind: "beastbound_mail_storage_bootstrap_source",
    schemaVersion: 1,
    validationContract: MAIL_STORAGE_BOOTSTRAP_VALIDATION_CONTRACT,
    physicalFields: [
      "mail_id",
      "sender_account_id",
      "recipient_account_id",
      "title",
      "created_at",
      "read_at",
      "document_json",
    ],
    rows: plan.sourceRows,
  });
}

test("empty source produces a deterministic generation-one no-asset plan", () => {
  const first = build([]);
  const second = build([]);

  assert.equal(first.ok, true);
  assert.equal(first.sourceSafe, true);
  assert.equal(first.applySafe, false);
  assert.deepEqual(first.identityRows, []);
  assert.deepEqual(first.counterRows, []);
  assert.deepEqual(first.archiveRows, []);
  assert.deepEqual(first.vaultRows, []);
  assert.deepEqual(first.counts, {source: 0, identity: 0, recipient: 0, active: 0});
  assert.equal(first.lastMailId, "");
  assert.match(first.sourceDigest, /^[a-f0-9]{64}$/);
  assert.equal(first.sourceDigest, second.sourceDigest);
  assert.equal(first.planDigest, second.planDigest);
  assert.equal(verify(first).ok, true);
});

test("schema2 asset mail becomes one active permanent identity and one counter", () => {
  const document = mailDocument({
    items: [{itemId: ordinaryItemId, count: 3}],
  });
  const plan = build([physicalRow(document)]);

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.counts, {source: 1, identity: 1, recipient: 1, active: 1});
  assert.deepEqual(plan.counterRows, [{
    recipientAccountId: "account_recipient",
    activeCount: 1,
    dataGeneration: 1,
    revision: 0,
  }]);
  assert.deepEqual(plan.identityRows[0], {
    mailId: "mail_bootstrap_1",
    senderAccountId: "account_sender",
    recipientAccountId: "account_recipient",
    location: "active",
    createdAt: CREATED_AT,
    settledAt: null,
    archivedAt: null,
    identityDigest: plan.identityRows[0].identityDigest,
    documentDigest: plan.identityRows[0].documentDigest,
    rewardId: null,
    dataGeneration: 1,
    revision: 0,
  });
  assert.match(plan.identityRows[0].identityDigest, /^[a-f0-9]{64}$/);
  assert.match(plan.identityRows[0].documentDigest, /^[a-f0-9]{64}$/);
});

test("only an explicitly certified settlement timestamp is copied", () => {
  const settled = mailDocument({settledAt: SETTLED_AT});
  const plan = build([physicalRow(settled)]);

  assert.equal(plan.ok, true);
  assert.equal(plan.identityRows[0].settledAt, SETTLED_AT);
  assert.equal(plan.identityRows[0].archivedAt, null);
  assert.equal(plan.archiveRows.length, 0);

  const legacy = mailDocument();
  const forgedByCertifier = build([physicalRow(legacy)], {
    certifyAttachment(mail) {
      const attachment = certifyAttachment(mail);
      return {
        ...attachment,
        mail: {...attachment.mail, settledAt: SETTLED_AT},
      };
    },
  });
  assert.equal(forgedByCertifier.ok, true);
  assert.equal(forgedByCertifier.identityRows[0].settledAt, null);
});

test("supported schema1 and non-ISO legacy creation text are preserved without guessing settlement", () => {
  const document = mailDocument({
    createdAt: "legacy-created-0001",
    schemaVersion: 1,
  });
  delete document.equipmentEnvelopes;
  delete document.settledAt;
  const plan = build([physicalRow(document)]);

  assert.equal(plan.ok, true);
  assert.equal(plan.sourceRows[0].document.schemaVersion, 1);
  assert.equal(plan.identityRows[0].createdAt, "legacy-created-0001");
  assert.equal(plan.identityRows[0].settledAt, null);
});

test("physical activity counters deliberately allow more than 200 mails", () => {
  const rows = Array.from({length: 201}, (_, index) => {
    const suffix = String(index).padStart(3, "0");
    return physicalRow(mailDocument({mailId: `mail_capacity_${suffix}`}));
  });
  const plan = build(rows);

  assert.equal(plan.ok, true);
  assert.equal(plan.counts.active, 201);
  assert.equal(plan.counterRows[0].activeCount, 201);
  assert.equal(plan.errors.some((entry) => /limit|capacity|200/.test(entry.code)), false);
});

test("multiple recipients count exactly while system-looking mail never creates reward, archive, or vault state", () => {
  const rows = [
    physicalRow(mailDocument({mailId: "mail_system_reward_guess", mailKind: "qualification_reward"})),
    physicalRow(mailDocument({
      mailId: "mail_old_settled",
      recipientAccountId: "account_other",
      createdAt: "2025-01-01T00:00:00.000Z",
      settledAt: "2025-01-01T00:00:00.000Z",
    })),
  ];
  const plan = build(rows);

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.counterRows.map((row) => [row.recipientAccountId, row.activeCount]), [
    ["account_other", 1],
    ["account_recipient", 1],
  ]);
  assert.equal(plan.identityRows.every((row) => row.rewardId === null && row.location === "active"), true);
  assert.deepEqual(plan.archiveRows, []);
  assert.deepEqual(plan.vaultRows, []);
});

test("the explicit public report never exposes mail content, accounts, or assets", () => {
  const document = mailDocument({
    body: "sensitive_mail_body",
    items: [{itemId: ordinaryItemId, count: 3}],
  });
  const plan = build([physicalRow(document)]);
  const report = publicMailStorageBootstrapPlanReport(plan);
  const serialized = JSON.stringify(report);

  assert.equal(report.ok, true);
  assert.equal(report.applySafe, false);
  assert.deepEqual(report.counts, plan.counts);
  for (const secret of [
    "sensitive_mail_body",
    ordinaryItemId,
    document.senderAccountId,
    document.recipientAccountId,
    document.title,
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("source and plan digests ignore input and JSON key order but cover physical content", () => {
  const firstDocument = mailDocument({mailId: "mail_order_b"});
  const secondDocument = mailDocument({mailId: "mail_order_a", recipientAccountId: "account_other"});
  const first = build([physicalRow(firstDocument), physicalRow(secondDocument)]);
  const second = build([
    physicalRow(reverseObjectKeys(secondDocument), {document_json: JSON.stringify(reverseObjectKeys(secondDocument))}),
    physicalRow(reverseObjectKeys(firstDocument), {document_json: Buffer.from(JSON.stringify(reverseObjectKeys(firstDocument)))}),
  ]);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.sourceDigest, second.sourceDigest);
  assert.equal(first.planDigest, second.planDigest);
  assert.deepEqual(first.identityRows, second.identityRows);

  const changed = structuredClone(firstDocument);
  changed.body = "正文变化必须改变物理来源摘要。";
  const changedPlan = build([physicalRow(changed), physicalRow(secondDocument)]);
  assert.notEqual(changedPlan.sourceDigest, first.sourceDigest);
  assert.notEqual(changedPlan.identityRows.find((row) => row.mailId === firstDocument.mailId).documentDigest,
    first.identityRows.find((row) => row.mailId === firstDocument.mailId).documentDigest);
  assert.equal(changedPlan.identityRows.find((row) => row.mailId === firstDocument.mailId).identityDigest,
    first.identityRows.find((row) => row.mailId === firstDocument.mailId).identityDigest);
});

test("changing an immutable identity fact changes the identity digest", () => {
  const first = build([physicalRow(mailDocument())]);
  const moved = mailDocument({recipientAccountId: "account_other"});
  const second = build([physicalRow(moved)]);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.identityRows[0].identityDigest, second.identityRows[0].identityDigest);
});

test("every SQL mirror drift fails the whole plan without exposing documents", () => {
  const document = mailDocument({readAt: SETTLED_AT});
  const scenarios = [
    {mail_id: "mail_other"},
    {sender_account_id: "account_other"},
    {recipient_account_id: "account_other"},
    {title: "漂移标题"},
    {created_at: "legacy-other"},
    {read_at: null},
  ];
  for (const overrides of scenarios) {
    const plan = build([physicalRow(document, overrides)]);
    assert.equal(plan.ok, false, JSON.stringify(overrides));
    assert.equal(plan.applySafe, false);
    assert.deepEqual(plan.identityRows, []);
    assert.deepEqual(plan.counterRows, []);
    assert.equal(plan.errors.some((entry) => Object.hasOwn(entry, "document")), false);
  }
});

test("invalid, duplicate, and prototype-like physical identities are handled without object-key collapse", () => {
  const duplicate = physicalRow(mailDocument());
  const duplicatePlan = build([duplicate, structuredClone(duplicate)]);
  assert.equal(duplicatePlan.ok, false);
  assert.equal(duplicatePlan.errors.some((entry) => entry.code === "mail_storage_bootstrap_mail_duplicate"), true);

  const invalidPlan = build([physicalRow(mailDocument({mailId: " mail_bad"}))]);
  assert.equal(invalidPlan.ok, false);
  assert.equal(invalidPlan.errors.some((entry) => entry.code === "mail_storage_bootstrap_identity_invalid"), true);

  for (const document of [
    mailDocument({mailId: "mail_CASE_collision"}),
    mailDocument({recipientAccountId: "account_CASE_collision"}),
    mailDocument({senderAccountId: "系统发件人"}),
  ]) {
    const collationUnsafe = build([physicalRow(document)]);
    assert.equal(collationUnsafe.ok, false);
    assert.equal(
      collationUnsafe.errors.some((entry) => entry.code === "mail_storage_bootstrap_identity_invalid"),
      true,
    );
  }

  const special = build([physicalRow(mailDocument({mailId: "__proto__"}))]);
  assert.equal(special.ok, true);
  assert.equal(special.identityRows[0].mailId, "__proto__");
});

test("future, unknown-item, malformed physical, and attachment-certifier failures fail closed", () => {
  const scenarios = [
    mailDocument({schemaVersion: 3}),
    mailDocument({items: [{itemId: "future_item", count: 1}]}),
  ];
  for (const document of scenarios) {
    const plan = build([physicalRow(document)]);
    assert.equal(plan.ok, false);
    assert.equal(plan.errors.length > 0, true);
  }

  const malformed = physicalRow(mailDocument());
  delete malformed.title;
  assert.equal(build([malformed]).ok, false);

  const thrown = build([physicalRow(mailDocument())], {
    certifyAttachment() {
      throw new Error("private asset details must not escape");
    },
  });
  assert.equal(thrown.ok, false);
  assert.deepEqual(thrown.errors.map((entry) => entry.code), ["mail_storage_bootstrap_attachment_certifier_failed"]);
  assert.equal(JSON.stringify(thrown.errors).includes("private asset details"), false);
});

test("asset-settlement conflicts and malformed read timestamps fail lifecycle certification", () => {
  const scenarios = [
    mailDocument({items: [{itemId: ordinaryItemId, count: 1}], settledAt: SETTLED_AT}),
    mailDocument({readAt: "2026-07-16 05:00:00"}),
  ];
  for (const document of scenarios) {
    const plan = build([physicalRow(document)]);
    assert.equal(plan.ok, false);
    assert.equal(plan.errors.some((entry) => entry.code.startsWith("mail_lifecycle_")), true);
  }
});

test("plan verification detects source, target, and digest mutation", () => {
  const plan = build([physicalRow(mailDocument())]);
  assert.equal(verify(plan).ok, true);

  const sourceMutation = structuredClone(plan);
  sourceMutation.sourceRows[0].document.body = "mutated";
  assert.equal(verify(sourceMutation).ok, false);

  const targetMutation = structuredClone(plan);
  targetMutation.identityRows[0].rewardId = "reward_guessed";
  assert.equal(verify(targetMutation).ok, false);

  const rehashedProjectionMutation = structuredClone(plan);
  rehashedProjectionMutation.identityRows[0].rewardId = "reward_guessed";
  rehashedProjectionMutation.planDigest = recomputePlanDigest(rehashedProjectionMutation);
  assert.equal(
    verify(rehashedProjectionMutation).code,
    "mail_storage_bootstrap_plan_projection_mismatch",
  );

  const digestMutation = structuredClone(plan);
  digestMutation.planDigest = "0".repeat(64);
  assert.equal(verify(digestMutation).ok, false);

  assert.equal(
    verifyMailStorageBootstrapPlan(plan).code,
    "mail_storage_bootstrap_plan_certifier_missing",
  );
});

test("plan verification reruns current attachment and lifecycle certification", () => {
  const plan = structuredClone(build([physicalRow(mailDocument())]));
  plan.sourceRows[0].document.schemaVersion = 3;
  plan.sourceDigest = recomputeSourceDigest(plan);
  plan.identityRows[0].documentDigest = stableDigest({
    kind: "beastbound_mail_document",
    schemaVersion: 1,
    mailId: plan.sourceRows[0].mailId,
    document: plan.sourceRows[0].document,
  });
  plan.planDigest = recomputePlanDigest(plan);

  const result = verify(plan);
  assert.equal(result.ok, false);
  assert.equal(result.code, "mail_storage_bootstrap_plan_source_certification_failed");
  assert.equal(result.causeCode, "mail_schema_future");
});

test("uninitialized empty target reports only deterministic missing rows", () => {
  const plan = build([
    physicalRow(mailDocument({mailId: "mail_reconcile_a"})),
    physicalRow(mailDocument({mailId: "mail_reconcile_b", recipientAccountId: "account_other"})),
  ]);
  const result = reconcile(
    plan,
    observed(initialControl()),
  );

  assert.equal(result.ok, true);
  assert.equal(result.targetSafe, true);
  assert.equal(result.forwardFixSafe, true);
  assert.equal(result.applySafe, false);
  assert.equal(result.status, "missing");
  assert.equal(result.action, "start");
  assert.deepEqual(result.missingIdentityRows, plan.identityRows);
  assert.deepEqual(result.missingCounterRows, plan.counterRows);
  assert.deepEqual(result.conflicts, []);
});

test("building target retains exact rows and exposes only missing rows for forward-fix", () => {
  const plan = build([
    physicalRow(mailDocument({mailId: "mail_reconcile_a"})),
    physicalRow(mailDocument({mailId: "mail_reconcile_b", recipientAccountId: "account_other"})),
  ]);
  const result = reconcile(plan, observed(
    buildingControl(plan, {bootstrapCursorMailId: plan.identityRows[0].mailId}),
    [plan.identityRows[0]],
    [plan.counterRows[0]],
  ));

  assert.equal(result.ok, true);
  assert.equal(result.status, "missing");
  assert.equal(result.action, "repair_missing");
  assert.equal(result.exactIdentityCount, 1);
  assert.equal(result.exactCounterCount, 1);
  assert.deepEqual(result.missingIdentityRows, [plan.identityRows[1]]);
  assert.deepEqual(result.missingCounterRows, [plan.counterRows[1]]);

  const staleCursor = reconcile(plan, observed(
    buildingControl(plan, {bootstrapCursorMailId: plan.lastMailId}),
  ));
  assert.equal(staleCursor.ok, true);
  assert.equal(staleCursor.action, "repair_missing");
  assert.deepEqual(staleCursor.missingIdentityRows, plan.identityRows);
  assert.deepEqual(staleCursor.missingCounterRows, plan.counterRows);
});

test("identity and counter drift or unexpected rows are conflicts, never overwrite plans", () => {
  const plan = build([physicalRow(mailDocument())]);
  const identityDrift = structuredClone(plan.identityRows[0]);
  identityDrift.rewardId = "guessed_reward";
  const counterDrift = structuredClone(plan.counterRows[0]);
  counterDrift.activeCount = 0;
  const unexpectedIdentity = {...plan.identityRows[0], mailId: "mail_unexpected"};
  const result = reconcile(plan, observed(
    buildingControl(plan),
    [identityDrift, unexpectedIdentity],
    [counterDrift],
  ));

  assert.equal(result.ok, false);
  assert.equal(result.targetSafe, false);
  assert.equal(result.forwardFixSafe, false);
  assert.equal(result.applySafe, false);
  assert.equal(result.status, "conflict");
  assert.equal(result.action, "blocked");
  assert.deepEqual(result.missingIdentityRows, []);
  assert.deepEqual(result.missingCounterRows, []);
  assert.equal(result.conflicts.some((entry) => entry.code === "mail_storage_bootstrap_identity_conflict"), true);
  assert.equal(result.conflicts.some((entry) => entry.code === "mail_storage_bootstrap_identity_unexpected"), true);
  assert.equal(result.conflicts.some((entry) => entry.code === "mail_storage_bootstrap_counter_conflict"), true);

  const duplicate = reconcile(plan, observed(
    buildingControl(plan),
    [plan.identityRows[0], plan.identityRows[0]],
    [plan.counterRows[0], plan.counterRows[0]],
  ));
  assert.equal(duplicate.ok, false);
  assert.equal(
    duplicate.conflicts.some((entry) => entry.code === "mail_storage_bootstrap_identity_duplicate"),
    true,
  );
  assert.equal(
    duplicate.conflicts.some((entry) => entry.code === "mail_storage_bootstrap_counter_duplicate"),
    true,
  );
});

test("archive and vault rows always conflict with the initial bootstrap plan", () => {
  const plan = build([physicalRow(mailDocument())]);
  const result = reconcile(plan, observed(
    buildingControl(plan),
    [],
    [],
    {archiveRows: [{mailId: plan.lastMailId}], vaultRows: [{rewardId: "reward_1"}]},
  ));

  assert.equal(result.ok, false);
  assert.equal(result.conflicts.some((entry) => entry.code === "mail_storage_bootstrap_archive_unexpected"), true);
  assert.equal(result.conflicts.some((entry) => entry.code === "mail_storage_bootstrap_vault_unexpected"), true);
});

test("an exact ready target is a no-op while a missing ready row is corruption", () => {
  const plan = build([physicalRow(mailDocument())]);
  const exact = reconcile(plan, observed(
    readyControl(plan),
    plan.identityRows,
    plan.counterRows,
  ));
  assert.equal(exact.ok, true);
  assert.equal(exact.status, "exact");
  assert.equal(exact.action, "already_ready");

  const missing = reconcile(plan, observed(
    readyControl(plan),
    [],
    plan.counterRows,
  ));
  assert.equal(missing.ok, false);
  assert.equal(missing.status, "conflict");
  assert.equal(missing.conflicts.some((entry) => entry.code === "mail_storage_bootstrap_ready_incomplete"), true);
  assert.deepEqual(missing.missingIdentityRows, []);
});

test("control source drift, bad building cursor, and orphan rows under uninitialized are conflicts", () => {
  const plan = build([physicalRow(mailDocument())]);
  const sourceDrift = reconcile(plan, observed(
    buildingControl(plan, {sourceDigest: "f".repeat(64)}),
  ));
  assert.equal(sourceDrift.ok, false);
  assert.equal(sourceDrift.conflicts.some((entry) => entry.code === "mail_storage_bootstrap_control_conflict"), true);

  const cursorDrift = reconcile(plan, observed(
    buildingControl(plan, {bootstrapCursorMailId: "mail_not_in_source"}),
  ));
  assert.equal(cursorDrift.ok, false);

  const enabledFeature = reconcile(plan, observed(
    buildingControl(plan, {archiveEnabled: true}),
  ));
  assert.equal(enabledFeature.ok, false);
  assert.equal(
    enabledFeature.conflicts.some((entry) => entry.code === "mail_storage_bootstrap_control_conflict"),
    true,
  );

  const orphan = reconcile(plan, observed(
    initialControl(),
    [plan.identityRows[0]],
  ));
  assert.equal(orphan.ok, false);
  assert.equal(orphan.conflicts.some((entry) => entry.code === "mail_storage_bootstrap_uninitialized_not_empty"), true);
});
