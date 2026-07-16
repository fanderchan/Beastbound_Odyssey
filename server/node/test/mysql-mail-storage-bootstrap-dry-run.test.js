"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {readMailAttachmentState} = require("../src/auth/mail-attachment-state");
const {
  buildMailStorageBootstrapPlan,
} = require("../src/mysql-mail-storage-bootstrap-plan");
const {
  digestTargetSnapshot,
  redactMailStorageBootstrapFact,
  runMailStorageBootstrapDryRun,
} = require("../src/mysql-mail-storage-bootstrap-dry-run");
const {
  loadEnvFile,
  parseArgs,
  runMain,
} = require("../scripts/bootstrap-mail-storage");

const CREATED_AT = "2026-07-16T08:00:00.000Z";
const emptyEquipmentCatalog = {itemById: new Map()};

function certifyAttachment(mail) {
  return readMailAttachmentState(mail, emptyEquipmentCatalog, {
    itemById() {
      return null;
    },
    isEquipmentItemId() {
      return false;
    },
  });
}

function mailDocument(index = 1, overrides = {}) {
  const suffix = String(index).padStart(3, "0");
  return {
    mailId: `mail_dry_run_${suffix}`,
    mailKind: "player",
    senderAccountId: "account_sender",
    senderUsername: "sender",
    senderDisplayName: "寄件人",
    recipientAccountId: "account_recipient",
    recipientUsername: "recipient",
    recipientDisplayName: "收件人",
    title: "只读邮件回填预演",
    body: `private_body_${suffix}`,
    items: [],
    equipmentEnvelopes: [],
    currency: {},
    createdAt: CREATED_AT,
    readAt: null,
    schemaVersion: 2,
    ...overrides,
  };
}

function physicalRow(documentValue) {
  const document = structuredClone(documentValue);
  return {
    mail_id: document.mailId,
    sender_account_id: document.senderAccountId,
    recipient_account_id: document.recipientAccountId,
    title: document.title,
    created_at: document.createdAt,
    read_at: document.readAt ?? null,
    document_json: document,
  };
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

function snapshot(sourceRows, overrides = {}) {
  return {
    control: initialControl(),
    sourceRows,
    identityRows: [],
    counterRows: [],
    archiveRows: [],
    vaultRows: [],
    ...overrides,
  };
}

function clone(value) {
  return structuredClone(value);
}

test("stable dry-run reads two independent snapshots and reports 201 rows without authorizing apply", async () => {
  const sourceRows = Array.from({length: 201}, (_, index) => physicalRow(mailDocument(index + 1)));
  const current = snapshot(sourceRows);
  let reads = 0;
  const report = await runMailStorageBootstrapDryRun({
    async readSnapshot() {
      reads += 1;
      return clone(current);
    },
    certifyAttachment,
  });

  assert.equal(reads, 2);
  assert.equal(report.ok, true);
  assert.equal(report.stable, true);
  assert.equal(report.observationCount, 2);
  assert.equal(report.applied, false);
  assert.equal(report.applySafe, false);
  assert.equal(report.source.counts.source, 201);
  assert.equal(report.source.counts.active, 201);
  assert.equal(report.target.missingIdentityCount, 201);
  assert.equal(report.target.missingCounterCount, 1);
  assert.equal(report.target.action, "start");
  assert.match(report.digests.source, /^[a-f0-9]{64}$/);
  assert.match(report.digests.target, /^[a-f0-9]{64}$/);
});

test("same-count source body drift changes source and plan digests", async () => {
  const firstDocument = mailDocument(1, {body: "private_source_before"});
  const secondDocument = mailDocument(1, {body: "private_source_after"});
  const snapshots = [
    snapshot([physicalRow(firstDocument)]),
    snapshot([physicalRow(secondDocument)]),
  ];
  const report = await runMailStorageBootstrapDryRun({
    async readSnapshot() {
      return clone(snapshots.shift());
    },
    certifyAttachment,
  });

  assert.equal(report.ok, false);
  assert.equal(report.code, "mail_storage_bootstrap_snapshot_drift");
  assert.equal(report.stable, false);
  assert.equal(report.stability.sourceDigestMatch, false);
  assert.equal(report.stability.planDigestMatch, false);
  assert.equal(report.stability.targetDigestMatch, true);
  assert.equal(report.source.counts.source, 1);
  assert.equal(JSON.stringify(report).includes("private_source_before"), false);
  assert.equal(JSON.stringify(report).includes("private_source_after"), false);
});

test("matching digests cannot hide different inspection outcomes", async () => {
  const current = snapshot([physicalRow(mailDocument())]);
  let certificationCalls = 0;
  const statefulCertifier = (mail) => {
    certificationCalls += 1;
    if ([2, 3].includes(certificationCalls)) {
      return {ok: false, code: "mail_item_unknown"};
    }
    return certifyAttachment(mail);
  };
  const report = await runMailStorageBootstrapDryRun({
    async readSnapshot() {
      return clone(current);
    },
    certifyAttachment: statefulCertifier,
  });

  assert.equal(certificationCalls, 6);
  assert.equal(report.stability.sourceDigestMatch, true);
  assert.equal(report.stability.planDigestMatch, true);
  assert.equal(report.stability.targetDigestMatch, true);
  assert.equal(report.stability.firstInspectionSafe, false);
  assert.equal(report.stability.secondInspectionSafe, true);
  assert.equal(report.stability.inspectionStatusMatch, false);
  assert.equal(report.stable, false);
  assert.equal(report.ok, false);
  assert.equal(report.code, "mail_storage_bootstrap_snapshot_drift");
});

test("same-count target mutation changes the full normalized target digest", async () => {
  const sourceRows = [physicalRow(mailDocument())];
  const plan = buildMailStorageBootstrapPlan({sourceRows, certifyAttachment});
  const before = snapshot(sourceRows, {
    control: buildingControl(plan),
    identityRows: clone(plan.identityRows),
    counterRows: clone(plan.counterRows),
  });
  const after = clone(before);
  after.identityRows[0].revision = 7;
  const snapshots = [before, after];
  const report = await runMailStorageBootstrapDryRun({
    async readSnapshot() {
      return clone(snapshots.shift());
    },
    certifyAttachment,
  });

  assert.equal(report.ok, false);
  assert.equal(report.code, "mail_storage_bootstrap_snapshot_drift");
  assert.equal(report.stability.sourceDigestMatch, true);
  assert.equal(report.stability.planDigestMatch, true);
  assert.equal(report.stability.targetDigestMatch, false);
  assert.equal(report.target.observedCounts.identity, 1);
  assert.equal(report.target.conflictCount > 0, true);
});

test("different target conflicts are classified as drift, not one stable conflict", async () => {
  const sourceRows = [physicalRow(mailDocument())];
  const plan = buildMailStorageBootstrapPlan({sourceRows, certifyAttachment});
  const first = snapshot(sourceRows, {
    control: buildingControl(plan),
    identityRows: [{...clone(plan.identityRows[0]), revision: 7}],
    counterRows: clone(plan.counterRows),
  });
  const second = clone(first);
  second.identityRows[0].revision = 8;
  const snapshots = [first, second];

  const report = await runMailStorageBootstrapDryRun({
    async readSnapshot() {
      return clone(snapshots.shift());
    },
    certifyAttachment,
  });

  assert.equal(report.stability.inspectionStatusMatch, true);
  assert.equal(report.stability.targetDigestMatch, false);
  assert.equal(report.stable, false);
  assert.equal(report.ok, false);
  assert.equal(report.code, "mail_storage_bootstrap_snapshot_drift");
});

test("target digest normalizes row order but binds archive and vault keys", () => {
  const base = {
    control: initialControl(),
    identityRows: [{mailId: "mail_b", revision: 0}, {mailId: "mail_a", revision: 0}],
    counterRows: [
      {recipientAccountId: "account_b", activeCount: 1},
      {recipientAccountId: "account_a", activeCount: 1},
    ],
    archiveRows: [{mailId: "archive_b"}, {mailId: "archive_a"}],
    vaultRows: [{rewardId: "reward_b"}, {rewardId: "reward_a"}],
  };
  const reordered = {
    ...clone(base),
    identityRows: clone(base.identityRows).reverse(),
    counterRows: clone(base.counterRows).reverse(),
    archiveRows: clone(base.archiveRows).reverse(),
    vaultRows: clone(base.vaultRows).reverse(),
  };
  assert.equal(digestTargetSnapshot(base), digestTargetSnapshot(reordered));

  const changedKey = clone(reordered);
  changedKey.vaultRows[0].rewardId = "reward_changed";
  assert.notEqual(digestTargetSnapshot(base), digestTargetSnapshot(changedKey));

  const ignoredArchivePayload = clone(base);
  ignoredArchivePayload.archiveRows[0].document = "private_archive_payload";
  assert.equal(digestTargetSnapshot(base), digestTargetSnapshot(ignoredArchivePayload));
});

test("conflict report exposes only allowlisted counts, state and code/path facts", async () => {
  const unique = {
    mailId: "mail_private_never_print_729",
    senderAccountId: "account_sender_never_print_731",
    recipientAccountId: "account_recipient_never_print_733",
    title: "private_title_never_print_739",
    body: "private_body_never_print_743",
    rewardId: "reward_never_print_751",
  };
  const document = mailDocument(1, {
    mailId: unique.mailId,
    senderAccountId: unique.senderAccountId,
    recipientAccountId: unique.recipientAccountId,
    title: unique.title,
    body: unique.body,
  });
  const sourceRows = [physicalRow(document)];
  const plan = buildMailStorageBootstrapPlan({sourceRows, certifyAttachment});
  const driftedIdentity = clone(plan.identityRows[0]);
  driftedIdentity.rewardId = unique.rewardId;
  const current = snapshot(sourceRows, {
    control: buildingControl(plan),
    identityRows: [driftedIdentity],
    counterRows: clone(plan.counterRows),
  });
  const report = await runMailStorageBootstrapDryRun({
    async readSnapshot() {
      return clone(current);
    },
    certifyAttachment,
  });
  const serialized = JSON.stringify(report);

  assert.equal(report.ok, false);
  assert.equal(report.stable, true);
  assert.equal(report.code, "mail_storage_bootstrap_target_conflict");
  assert.deepEqual(Object.keys(report.target.conflicts[0]).sort(), ["code", "path"]);
  assert.equal(Object.hasOwn(report.target, "targetSafe"), false);
  assert.equal(Object.hasOwn(report.target, "forwardFixSafe"), false);
  assert.equal(Object.hasOwn(report.target, "applySafe"), false);
  assert.equal(Object.hasOwn(report.target, "missingIdentityRows"), false);
  assert.equal(Object.hasOwn(report.target, "missingCounterRows"), false);
  for (const secret of Object.values(unique)) {
    assert.equal(serialized.includes(secret), false, secret);
  }

  const maliciousCode = "mail_storage_bootstrap_private_code_never_print_757";
  const maliciousPath = "observed.private_path_never_print_758";
  const redacted = redactMailStorageBootstrapFact({
    code: maliciousCode,
    path: maliciousPath,
    key: "private_key_never_print_759",
  });
  assert.deepEqual(redacted, {code: "mail_storage_bootstrap_invalid", path: ""});
  const redactedSerialized = JSON.stringify(redacted);
  assert.equal(redactedSerialized.includes(maliciousCode), false);
  assert.equal(redactedSerialized.includes(maliciousPath), false);
  assert.equal(redactedSerialized.includes("private_key_never_print_759"), false);

  const unsafeCertifierReport = await runMailStorageBootstrapDryRun({
    async readSnapshot() {
      return clone(current);
    },
    certifyAttachment() {
      return {ok: false, code: maliciousCode, path: maliciousPath};
    },
  });
  const unsafeSerialized = JSON.stringify(unsafeCertifierReport);
  assert.equal(unsafeCertifierReport.source.errors[0].code, "mail_storage_bootstrap_invalid");
  assert.equal(unsafeSerialized.includes(maliciousCode), false);
  assert.equal(unsafeSerialized.includes(maliciousPath), false);
});

test("forbidden CLI arguments are rejected before env, catalog or store dependencies", async () => {
  const scenarios = [
    ["--apply", "mail_storage_bootstrap_apply_unavailable"],
    ["--backup-path", "mail_storage_bootstrap_backup_argument_denied"],
    ["--maintenance-confirmed", "mail_storage_bootstrap_maintenance_argument_denied"],
    ["--password=never_print_this", "mail_storage_bootstrap_credential_argument_denied"],
    ["--unknown", "mail_storage_bootstrap_argument_invalid"],
    ["--dry-run", "--dry-run", "mail_storage_bootstrap_argument_invalid"],
  ];
  for (const scenario of scenarios) {
    const expectedCode = scenario.pop();
    const calls = {env: 0, catalog: 0, store: 0, dryRun: 0};
    const report = await runMain(scenario, {
      loadEnvFile() { calls.env += 1; },
      createAttachmentCertifier() { calls.catalog += 1; return certifyAttachment; },
      createStore() { calls.store += 1; return {}; },
      async runDryRun() { calls.dryRun += 1; return {}; },
    });
    assert.equal(report.code, expectedCode);
    assert.equal(report.applied, false);
    assert.equal(report.applySafe, false);
    assert.deepEqual(calls, {env: 0, catalog: 0, store: 0, dryRun: 0});
    assert.equal(JSON.stringify(report).includes("never_print_this"), false);
  }
  assert.deepEqual(parseArgs([]), {dryRun: true});
  assert.deepEqual(parseArgs(["--dry-run"]), {dryRun: true});
});

test("CLI allowed path uses read-only store options, closes once and redacts runtime failures", async () => {
  const calls = [];
  const safeReport = Object.freeze({
    kind: "beastbound_mail_storage_bootstrap_dry_run",
    schemaVersion: 1,
    ok: true,
    code: "mail_storage_bootstrap_dry_run_ok",
    mode: "dry-run",
    applied: false,
    applySafe: false,
    stable: true,
  });
  const result = await runMain([], {
    loadEnvFile() { calls.push("env"); },
    createAttachmentCertifier() { calls.push("catalog"); return certifyAttachment; },
    createStore(options) {
      calls.push(["store", options]);
      return {
        async readMailStorageBootstrapSnapshot() {
          calls.push("read");
          return snapshot([]);
        },
        async close() { calls.push("close"); },
      };
    },
    async runDryRun({readSnapshot, certifyAttachment: receivedCertifier}) {
      calls.push("dry-run");
      assert.equal(receivedCertifier, certifyAttachment);
      await readSnapshot();
      await readSnapshot();
      return safeReport;
    },
  });

  assert.equal(result, safeReport);
  assert.deepEqual(calls, [
    "env",
    "catalog",
    ["store", {readOnly: true, ensureSchema: false, usePool: true}],
    "dry-run",
    "read",
    "read",
    "close",
  ]);

  const privateRuntimeError = "sql_password_and_query_never_print_761";
  const failed = await runMain([], {
    loadEnvFile() {},
    createAttachmentCertifier() { return certifyAttachment; },
    createStore() { throw new Error(privateRuntimeError); },
  });
  assert.equal(failed.code, "mail_storage_bootstrap_dry_run_failed");
  assert.equal(JSON.stringify(failed).includes(privateRuntimeError), false);
});

test("env loading preserves every pre-existing process value, including empty strings", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mail-env-"));
  const filePath = path.join(root, "mysql.env");
  const existingKey = "BEASTBOUND_DRY_RUN_EXISTING_TEST_VALUE";
  const newKey = "BEASTBOUND_DRY_RUN_NEW_TEST_VALUE";
  const previousExisting = process.env[existingKey];
  const hadExisting = Object.hasOwn(process.env, existingKey);
  const previousNew = process.env[newKey];
  const hadNew = Object.hasOwn(process.env, newKey);
  try {
    process.env[existingKey] = "";
    delete process.env[newKey];
    fs.writeFileSync(filePath, [
      `export ${existingKey}='must_not_replace'`,
      `export ${newKey}='loaded_after_parse'`,
      "",
    ].join("\n"));
    loadEnvFile(filePath);
    assert.equal(process.env[existingKey], "");
    assert.equal(process.env[newKey], "loaded_after_parse");
  } finally {
    if (hadExisting) process.env[existingKey] = previousExisting;
    else delete process.env[existingKey];
    if (hadNew) process.env[newKey] = previousNew;
    else delete process.env[newKey];
    fs.rmSync(root, {recursive: true, force: true});
  }
});
