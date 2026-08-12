"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {readMailAttachmentState} = require("../src/auth/mail-attachment-state");
const {
  runMysqlMailStorageBootstrapApply,
} = require("../src/mysql-mail-storage-bootstrap-apply");
const {
  buildMailStorageBootstrapPlan,
} = require("../src/mysql-mail-storage-bootstrap-plan");
const {
  buildMailStorageCanonicalContractOutputForTest,
} = require("../src/mysql-mail-storage-schema");
const {createMysqlAuthStore} = require("../src/mysql-store");

const CREATED_AT = "2026-07-16T08:00:00.000Z";
const RECONCILED_AT = "2026-08-13T04:05:06.789Z";
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
    mailId: `mail_apply_${suffix}`,
    mailKind: "player",
    senderAccountId: "account_sender",
    senderUsername: "sender",
    senderDisplayName: "寄件人",
    recipientAccountId: "account_recipient",
    recipientUsername: "recipient",
    recipientDisplayName: "收件人",
    title: "停服邮箱迁移",
    body: `private_apply_body_${suffix}`,
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

function planFor(sourceRows) {
  const plan = buildMailStorageBootstrapPlan({sourceRows, certifyAttachment});
  assert.equal(plan.ok, true);
  return plan;
}

function databaseState(documents = [mailDocument()], overrides = {}) {
  return {
    control: initialControl(),
    sourceRows: documents.map(physicalRow),
    identityRows: [],
    counterRows: [],
    archiveRows: [],
    vaultRows: [],
    ...structuredClone(overrides),
  };
}

function buildingState(documents = [mailDocument()], overrides = {}) {
  const state = databaseState(documents);
  const plan = planFor(state.sourceRows);
  state.control = initialControl({
    dataGeneration: 1,
    lifecycleState: "building",
    bootstrapSourceCount: plan.counts.source,
    bootstrapIdentityCount: plan.counts.identity,
    bootstrapRecipientCount: plan.counts.recipient,
    bootstrapActiveCount: plan.counts.active,
    sourceDigest: plan.sourceDigest,
  });
  state.identityRows = structuredClone(plan.identityRows);
  state.counterRows = structuredClone(plan.counterRows);
  Object.assign(state, structuredClone(overrides));
  return state;
}

function readyState(documents = [mailDocument()], overrides = {}) {
  const state = buildingState(documents);
  const plan = planFor(state.sourceRows);
  state.control = {
    ...state.control,
    lifecycleState: "ready",
    bootstrapCursorMailId: plan.lastMailId,
    reconciledAt: RECONCILED_AT,
  };
  Object.assign(state, structuredClone(overrides));
  return state;
}

function applyOptions(overrides = {}) {
  return {
    database: "beastbound_odyssey",
    maintenanceConfirmed: true,
    certifyAttachment,
    now: () => new Date(RECONCILED_AT),
    ...overrides,
  };
}

test("stopped-maintenance apply locks, rebuilds, reconciles and commits ready/data1 once", async () => {
  const privateMailId = "mail_apply_private_901";
  const privateBody = "private_apply_body_never_print_903";
  const fake = fakeTransactionalMysql(databaseState([
    mailDocument(1, {mailId: privateMailId, body: privateBody}),
    mailDocument(2),
  ]));

  const report = await runMysqlMailStorageBootstrapApply(fake.pool, applyOptions());

  assert.equal(report.ok, true);
  assert.equal(report.code, "mail_storage_bootstrap_apply_ok");
  assert.equal(report.action, "start");
  assert.equal(report.applied, true);
  assert.equal(report.recovered, false);
  assert.equal(report.featureFlagsEnabled, false);
  assert.deepEqual(report.counts, {source: 2, identity: 2, recipient: 1, active: 2});
  assert.equal(Object.isFrozen(report), true);
  assert.match(report.digests.source, /^[a-f0-9]{64}$/);
  assert.match(report.digests.plan, /^[a-f0-9]{64}$/);
  assert.match(report.digests.target, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(report).includes(privateMailId), false);
  assert.equal(JSON.stringify(report).includes(privateBody), false);

  assert.equal(fake.state.committed.control.dataGeneration, 1);
  assert.equal(fake.state.committed.control.lifecycleState, "ready");
  assert.equal(fake.state.committed.control.archiveEnabled, false);
  assert.equal(fake.state.committed.control.vaultClaimEnabled, false);
  assert.equal(fake.state.committed.control.activeLimitEnabled, false);
  assert.equal(fake.state.committed.control.reconciledAt, RECONCILED_AT);
  assert.equal(fake.state.committed.identityRows.length, 2);
  assert.equal(fake.state.committed.counterRows.length, 1);
  assert.deepEqual(fake.state.writeKinds, ["building", "identity", "counter", "ready"]);
  assert.equal(fake.state.commits, 1);
  assert.equal(fake.state.rollbacks, 0);
  assert.equal(fake.state.releases, 1);
  assert.equal(fake.state.destroys, 0);

  const rowReads = fake.state.queries.filter((entry) => (
    /FROM (?:mail_storage_control|mail_messages\b|mail_identity_registry|mail_active_counters|mail_archive_messages|reward_vault_entries)/.test(entry.sql)
  ));
  assert.equal(rowReads.length, 18);
  assert.equal(rowReads.every((entry) => /FOR UPDATE\s*$/.test(entry.sql)), true);
  for (const {sql} of fake.state.queries) {
    assert.doesNotMatch(sql, /\b(?:SET GLOBAL|SET PERSIST|SET PERSIST_ONLY|DELETE|ALTER|DROP|TRUNCATE)\b/i);
  }
});

test("empty source reaches ready with a NULL physical cursor and exact zero counts", async () => {
  const fake = fakeTransactionalMysql(databaseState([]));

  const report = await runMysqlMailStorageBootstrapApply(fake.pool, applyOptions());

  assert.equal(report.ok, true);
  assert.deepEqual(report.counts, {source: 0, identity: 0, recipient: 0, active: 0});
  assert.deepEqual(fake.state.writeKinds, ["building", "ready"]);
  assert.equal(fake.state.committed.control.bootstrapCursorMailId, "");
  assert.equal(fake.state.committed.control.lifecycleState, "ready");
});

test("201 physical mails use bounded identity batches while preserving the real count", async () => {
  const documents = Array.from({length: 201}, (_, index) => mailDocument(index + 1));
  const fake = fakeTransactionalMysql(databaseState(documents));

  const report = await runMysqlMailStorageBootstrapApply(fake.pool, applyOptions());

  assert.equal(report.ok, true);
  assert.deepEqual(report.counts, {source: 201, identity: 201, recipient: 1, active: 201});
  assert.deepEqual(fake.state.writeKinds, [
    "building",
    "identity",
    "identity",
    "counter",
    "ready",
  ]);
  const identityWrites = fake.state.queries.filter((entry) => (
    /^INSERT INTO mail_identity_registry/.test(entry.sql)
  ));
  assert.deepEqual(identityWrites.map((entry) => entry.params.length / 7), [128, 73]);
  assert.equal(fake.state.committed.identityRows.length, 201);
  assert.equal(fake.state.committed.counterRows[0].activeCount, 201);
});

test("building state resumes by inserting only missing exact sidecars before finalization", async () => {
  const documents = [mailDocument(1), mailDocument(2)];
  const current = buildingState(documents);
  current.identityRows.pop();
  const fake = fakeTransactionalMysql(current);

  const report = await runMysqlMailStorageBootstrapApply(fake.pool, applyOptions());

  assert.equal(report.ok, true);
  assert.equal(report.action, "repair_missing");
  assert.deepEqual(fake.state.writeKinds, ["identity", "ready"]);
  assert.equal(fake.state.committed.identityRows.length, 2);
  assert.equal(fake.state.committed.counterRows.length, 1);
});

test("already-ready state is a locked no-op that rolls back instead of issuing COMMIT", async () => {
  const fake = fakeTransactionalMysql(readyState());

  const report = await runMysqlMailStorageBootstrapApply(fake.pool, applyOptions());

  assert.equal(report.ok, true);
  assert.equal(report.code, "mail_storage_bootstrap_already_ready");
  assert.equal(report.action, "already_ready");
  assert.equal(report.applied, false);
  assert.deepEqual(fake.state.writeKinds, []);
  assert.equal(fake.state.commits, 0);
  assert.equal(fake.state.rollbacks, 1);
  assert.equal(fake.state.releases, 1);
});

test("target conflict, duplicate insert and locked source drift all roll back without publishing", async (t) => {
  await t.test("target conflict", async () => {
    const current = buildingState();
    current.identityRows[0].revision = 1;
    const before = structuredClone(current);
    const fake = fakeTransactionalMysql(current);

    await assert.rejects(
      runMysqlMailStorageBootstrapApply(fake.pool, applyOptions()),
      (error) => error.code === "mail_storage_bootstrap_target_conflict"
        && error.noCommitGuaranteed === true
        && error.rollbackConfirmed === true
        && error.retryable === false,
    );
    assert.deepEqual(fake.state.committed, before);
    assert.deepEqual(fake.state.writeKinds, []);
    assert.equal(fake.state.commits, 0);
    assert.equal(fake.state.rollbacks, 1);
  });

  await t.test("duplicate identity insert", async () => {
    const current = databaseState();
    const before = structuredClone(current);
    const fake = fakeTransactionalMysql(current, {failIdentityInsert: true});

    await assert.rejects(
      runMysqlMailStorageBootstrapApply(fake.pool, applyOptions()),
      (error) => error.code === "mail_storage_bootstrap_identity_insert_conflict"
        && error.noCommitGuaranteed === true
        && error.rollbackConfirmed === true,
    );
    assert.deepEqual(fake.state.committed, before);
    assert.deepEqual(fake.state.writeKinds, ["building", "identity"]);
    assert.equal(fake.state.commits, 0);
    assert.equal(fake.state.rollbacks, 1);
  });

  await t.test("source changes between locked inspections", async () => {
    const current = databaseState();
    const before = structuredClone(current);
    const fake = fakeTransactionalMysql(current, {
      afterWrite(kind, transaction) {
        if (kind === "building") {
          transaction.sourceRows[0].document_json.body = "simulated_locked_source_drift";
        }
      },
    });

    await assert.rejects(
      runMysqlMailStorageBootstrapApply(fake.pool, applyOptions()),
      (error) => error.code === "mail_storage_bootstrap_locked_source_drift"
        && error.rollbackConfirmed === true,
    );
    assert.deepEqual(fake.state.committed, before);
    assert.equal(fake.state.commits, 0);
    assert.equal(fake.state.rollbacks, 1);
  });
});

test("ambiguous COMMIT is resolved only by an independent locking reread", async (t) => {
  await t.test("exact ready state proves the lost acknowledgement committed", async () => {
    const fake = fakeTransactionalMysql(databaseState(), {commitMode: "applied"});

    const report = await runMysqlMailStorageBootstrapApply(fake.pool, applyOptions());

    assert.equal(report.ok, true);
    assert.equal(report.code, "mail_storage_bootstrap_apply_recovered");
    assert.equal(report.applied, true);
    assert.equal(report.recovered, true);
    assert.equal(report.outcomeUnknown, false);
    assert.equal(report.retryable, false);
    assert.equal(fake.state.acquires, 2);
    assert.equal(fake.state.destroys, 1);
    assert.equal(fake.state.releases, 1);
    assert.equal(fake.state.rollbacks, 1);
    const recoveryReads = fake.state.queries.filter((entry) => entry.connectionId === 2);
    assert.equal(recoveryReads.some((entry) => /FROM mail_storage_control[\s\S]*FOR UPDATE\s*$/.test(entry.sql)), true);
    assert.equal(fake.state.committed.control.lifecycleState, "ready");
  });

  await t.test("exact unchanged target proves no commit and permits an operator retry", async () => {
    const initial = databaseState();
    const fake = fakeTransactionalMysql(initial, {commitMode: "not_applied"});

    const report = await runMysqlMailStorageBootstrapApply(fake.pool, applyOptions());

    assert.equal(report.ok, false);
    assert.equal(report.code, "mail_storage_bootstrap_commit_not_applied");
    assert.equal(report.applied, false);
    assert.equal(report.recovered, true);
    assert.equal(report.outcomeUnknown, false);
    assert.equal(report.retryable, true);
    assert.deepEqual(fake.state.committed, initial);
    assert.equal(fake.state.acquires, 2);
  });

  await t.test("any third state stays outcome-unknown and cannot be retried", async () => {
    const fake = fakeTransactionalMysql(databaseState(), {commitMode: "unknown"});

    const report = await runMysqlMailStorageBootstrapApply(fake.pool, applyOptions());

    assert.equal(report.ok, false);
    assert.equal(report.code, "mail_storage_bootstrap_commit_outcome_unknown");
    assert.equal(report.applied, false);
    assert.equal(report.recovered, false);
    assert.equal(report.outcomeUnknown, true);
    assert.equal(report.retryable, false);
    assert.equal(fake.state.committed.control.lifecycleState, "ready");
    assert.equal(fake.state.committed.identityRows.length, 2);
  });

  await t.test("a different exact-ready timestamp is not proof of this transaction", async () => {
    const fake = fakeTransactionalMysql(databaseState(), {
      commitMode: "applied",
      afterAmbiguousCommit(committed) {
        committed.control.reconciledAt = "2026-08-13T04:05:07.000Z";
      },
    });

    const report = await runMysqlMailStorageBootstrapApply(fake.pool, applyOptions());

    assert.equal(report.ok, false);
    assert.equal(report.code, "mail_storage_bootstrap_commit_outcome_unknown");
    assert.equal(report.outcomeUnknown, true);
    assert.equal(report.retryable, false);
    assert.equal(fake.state.committed.control.lifecycleState, "ready");
  });
});

test("maintenance confirmation and the dedicated fresh-store capability gate precede pool use", async () => {
  let acquires = 0;
  await assert.rejects(
    runMysqlMailStorageBootstrapApply({
      async getConnection() {
        acquires += 1;
        throw new Error("must not acquire");
      },
    }, applyOptions({maintenanceConfirmed: false})),
    (error) => error.code === "mail_storage_bootstrap_maintenance_confirmation_required",
  );
  assert.equal(acquires, 0);

  let poolFactoryCalls = 0;
  const ordinaryStore = createMysqlAuthStore({
    readOnly: false,
    ensureSchema: false,
    usePool: true,
    singleWriterMaintenance: true,
    poolFactory() {
      poolFactoryCalls += 1;
      throw new Error("must not create pool");
    },
  });
  await assert.rejects(
    ordinaryStore.applyMailStorageBootstrap(applyOptions()),
    (error) => error.code === "mail_storage_bootstrap_dedicated_store_required",
  );
  assert.equal(poolFactoryCalls, 0);
  await ordinaryStore.close();

  const fake = fakeTransactionalMysql(databaseState());
  const dedicatedStore = createMysqlAuthStore({
    readOnly: false,
    ensureSchema: false,
    usePool: true,
    singleWriterMaintenance: true,
    mailStorageBootstrapApply: true,
    database: "beastbound_odyssey",
    poolFactory: () => fake.pool,
    transactionTimeoutMs: 60000,
  });
  const report = await dedicatedStore.applyMailStorageBootstrap(applyOptions());
  assert.equal(report.ok, true);
  await dedicatedStore.close();
  assert.equal(fake.state.ends, 1);
});

function fakeTransactionalMysql(initialValue, options = {}) {
  let committed = structuredClone(initialValue);
  const state = {
    acquires: 0,
    releases: 0,
    destroys: 0,
    ends: 0,
    commits: 0,
    rollbacks: 0,
    queries: [],
    writeKinds: [],
  };
  Object.defineProperty(state, "committed", {
    enumerable: true,
    get() {
      return structuredClone(committed);
    },
  });

  function connection(connectionId) {
    let transaction = null;
    let inTransaction = false;
    return {
      query(sqlValue, params = []) {
        const sql = typeof sqlValue === "object" ? sqlValue.sql : String(sqlValue || "");
        state.queries.push({
          connectionId,
          sql,
          params: structuredClone(params),
          rowsAsArray: Boolean(sqlValue && typeof sqlValue === "object" && sqlValue.rowsAsArray),
        });
        const current = inTransaction ? transaction : committed;
        if (/FROM information_schema\.tables/.test(sql)) {
          return Promise.resolve([canonicalContractRows(), []]);
        }
        if (/^SELECT[\s\S]*FROM mail_storage_control/.test(sql)) {
          return Promise.resolve([[controlArray(current.control)], []]);
        }
        if (/^SELECT[\s\S]*FROM mail_messages\b/.test(sql)) {
          return Promise.resolve([sourceArrays(current.sourceRows), []]);
        }
        if (/^SELECT[\s\S]*FROM mail_identity_registry/.test(sql)) {
          return Promise.resolve([identityArrays(current.identityRows), []]);
        }
        if (/^SELECT[\s\S]*FROM mail_active_counters/.test(sql)) {
          return Promise.resolve([counterArrays(current.counterRows), []]);
        }
        if (/^SELECT[\s\S]*FROM mail_archive_messages/.test(sql)) {
          return Promise.resolve([current.archiveRows.map((row) => [row.mailId]), []]);
        }
        if (/^SELECT[\s\S]*FROM reward_vault_entries/.test(sql)) {
          return Promise.resolve([current.vaultRows.map((row) => [row.rewardId]), []]);
        }
        if (/^UPDATE mail_storage_control\s+SET data_generation = 1,/.test(sql)) {
          state.writeKinds.push("building");
          const affectedRows = applyBuildingControl(current, params);
          options.afterWrite?.("building", current);
          return Promise.resolve([{affectedRows}, []]);
        }
        if (/^INSERT INTO mail_identity_registry/.test(sql)) {
          state.writeKinds.push("identity");
          if (options.failIdentityInsert === true) {
            return Promise.reject(Object.assign(new Error("duplicate identity"), {code: "ER_DUP_ENTRY"}));
          }
          let affectedRows = 0;
          for (let offset = 0; offset < params.length; offset += 7) {
            affectedRows += insertIdentity(current, params.slice(offset, offset + 7));
          }
          options.afterWrite?.("identity", current);
          return Promise.resolve([{affectedRows}, []]);
        }
        if (/^INSERT INTO mail_active_counters/.test(sql)) {
          state.writeKinds.push("counter");
          let affectedRows = 0;
          for (let offset = 0; offset < params.length; offset += 2) {
            affectedRows += insertCounter(current, params.slice(offset, offset + 2));
          }
          options.afterWrite?.("counter", current);
          return Promise.resolve([{affectedRows}, []]);
        }
        if (/^UPDATE mail_storage_control\s+SET lifecycle_state = 'ready',/.test(sql)) {
          state.writeKinds.push("ready");
          const affectedRows = applyReadyControl(current, params);
          options.afterWrite?.("ready", current);
          return Promise.resolve([{affectedRows}, []]);
        }
        return Promise.resolve([[], []]);
      },
      beginTransaction() {
        assert.equal(inTransaction, false);
        transaction = structuredClone(committed);
        inTransaction = true;
        return Promise.resolve();
      },
      commit() {
        assert.equal(inTransaction, true);
        state.commits += 1;
        const mode = state.commits === 1 ? (options.commitMode || "success") : "success";
        if (mode === "success" || mode === "applied") {
          committed = structuredClone(transaction);
        } else if (mode === "unknown") {
          committed = structuredClone(transaction);
          committed.identityRows.push(rogueIdentityRow(committed.identityRows[0]));
        }
        if (["applied", "not_applied", "unknown"].includes(mode)) {
          options.afterAmbiguousCommit?.(committed);
        }
        transaction = null;
        inTransaction = false;
        if (["applied", "not_applied", "unknown"].includes(mode)) {
          return Promise.reject(Object.assign(new Error("lost COMMIT acknowledgement"), {
            code: "ECONNRESET",
          }));
        }
        return Promise.resolve();
      },
      rollback() {
        assert.equal(inTransaction, true);
        state.rollbacks += 1;
        transaction = null;
        inTransaction = false;
        return Promise.resolve();
      },
      release() {
        state.releases += 1;
      },
      destroy() {
        state.destroys += 1;
      },
    };
  }

  return {
    state,
    pool: {
      getConnection() {
        state.acquires += 1;
        return Promise.resolve(connection(state.acquires));
      },
      end() {
        state.ends += 1;
        return Promise.resolve();
      },
    },
  };
}

function applyBuildingControl(state, params) {
  const control = state.control;
  if (
    control.scopeKey !== "mail_lifecycle"
    || control.schemaGeneration !== 1
    || control.dataGeneration !== 0
    || control.lifecycleState !== "uninitialized"
    || control.archiveEnabled
    || control.vaultClaimEnabled
    || control.activeLimitEnabled
    || control.bootstrapCursorMailId !== ""
    || control.bootstrapSourceCount !== 0
    || control.bootstrapIdentityCount !== 0
    || control.bootstrapRecipientCount !== 0
    || control.bootstrapActiveCount !== 0
    || control.sourceDigest !== ""
    || control.reconciledAt !== ""
  ) {
    return 0;
  }
  [
    control.bootstrapSourceCount,
    control.bootstrapIdentityCount,
    control.bootstrapRecipientCount,
    control.bootstrapActiveCount,
    control.sourceDigest,
  ] = params;
  control.dataGeneration = 1;
  control.lifecycleState = "building";
  return 1;
}

function insertIdentity(state, params) {
  if (state.identityRows.some((row) => row.mailId === params[0])) return 0;
  state.identityRows.push({
    mailId: params[0],
    senderAccountId: params[1],
    recipientAccountId: params[2],
    location: "active",
    createdAt: params[3],
    settledAt: params[4],
    archivedAt: null,
    identityDigest: params[5],
    documentDigest: params[6],
    rewardId: null,
    dataGeneration: 1,
    revision: 0,
  });
  state.identityRows.sort((left, right) => left.mailId.localeCompare(right.mailId));
  return 1;
}

function insertCounter(state, params) {
  if (state.counterRows.some((row) => row.recipientAccountId === params[0])) return 0;
  state.counterRows.push({
    recipientAccountId: params[0],
    activeCount: params[1],
    dataGeneration: 1,
    revision: 0,
  });
  state.counterRows.sort((left, right) => (
    left.recipientAccountId.localeCompare(right.recipientAccountId)
  ));
  return 1;
}

function applyReadyControl(state, params) {
  const control = state.control;
  if (
    control.lifecycleState !== "building"
    || control.dataGeneration !== 1
    || control.archiveEnabled
    || control.vaultClaimEnabled
    || control.activeLimitEnabled
    || control.bootstrapCursorMailId !== params[2]
    || control.bootstrapSourceCount !== params[3]
    || control.bootstrapIdentityCount !== params[4]
    || control.bootstrapRecipientCount !== params[5]
    || control.bootstrapActiveCount !== params[6]
    || control.sourceDigest !== params[7]
    || control.reconciledAt !== ""
  ) {
    return 0;
  }
  control.lifecycleState = "ready";
  control.bootstrapCursorMailId = params[0] ?? "";
  control.reconciledAt = params[1];
  return 1;
}

function rogueIdentityRow(template) {
  return {
    ...structuredClone(template),
    mailId: "mail_apply_rogue",
    identityDigest: "a".repeat(64),
    documentDigest: "b".repeat(64),
  };
}

function canonicalContractRows() {
  return buildMailStorageCanonicalContractOutputForTest()
    .trimEnd()
    .split("\n")
    .map((line) => line.split("\t"));
}

function controlArray(control) {
  return [
    control.scopeKey,
    String(control.schemaGeneration),
    String(control.dataGeneration),
    control.lifecycleState,
    control.archiveEnabled ? "1" : "0",
    control.vaultClaimEnabled ? "1" : "0",
    control.activeLimitEnabled ? "1" : "0",
    control.bootstrapCursorMailId || "",
    String(control.bootstrapSourceCount),
    String(control.bootstrapIdentityCount),
    String(control.bootstrapRecipientCount),
    String(control.bootstrapActiveCount),
    control.sourceDigest || "",
    control.reconciledAt || "",
  ];
}

function sourceArrays(rows) {
  return rows.map((row) => [
    row.mail_id,
    row.sender_account_id,
    row.recipient_account_id,
    row.title,
    row.created_at,
    row.read_at,
    structuredClone(row.document_json),
  ]);
}

function identityArrays(rows) {
  return rows.map((row) => [
    row.mailId,
    row.senderAccountId,
    row.recipientAccountId,
    row.location,
    row.createdAt,
    row.settledAt,
    row.archivedAt,
    row.identityDigest,
    row.documentDigest,
    row.rewardId,
    String(row.dataGeneration),
    String(row.revision),
  ]);
}

function counterArrays(rows) {
  return rows.map((row) => [
    row.recipientAccountId,
    String(row.activeCount),
    String(row.dataGeneration),
    String(row.revision),
  ]);
}
