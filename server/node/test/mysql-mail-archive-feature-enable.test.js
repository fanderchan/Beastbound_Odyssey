"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  runMysqlMailArchiveFeatureEnable,
} = require("../src/mysql-mail-archive-feature-enable");
const {
  projectActiveMailIdentityRow,
} = require("../src/mysql-mail-storage-forward-maintenance");
const {
  parseArgs,
  runMain,
} = require("../scripts/enable-mail-archive");

const MYSQL_SESSION_POLICY_SQL =
  "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?";

function control(overrides = {}) {
  return {
    scope_key: "mail_lifecycle",
    schema_generation: 1,
    data_generation: 1,
    lifecycle_state: "ready",
    archive_enabled: 0,
    vault_claim_enabled: 0,
    active_limit_enabled: 0,
    bootstrap_cursor_mail_id: "",
    bootstrap_source_count: 0,
    bootstrap_identity_count: 0,
    bootstrap_recipient_count: 0,
    bootstrap_active_count: 0,
    source_digest: "a".repeat(64),
    reconciled_at: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

function poolFixture(initial = control(), snapshot = {}) {
  const state = {
    control: structuredClone(initial),
    sourceRows: structuredClone(snapshot.sourceRows || []),
    identityRows: structuredClone(snapshot.identityRows || []),
    counterRows: structuredClone(snapshot.counterRows || []),
    archiveRows: structuredClone(snapshot.archiveRows || []),
    vaultRows: structuredClone(snapshot.vaultRows || []),
    queries: [],
    begun: 0,
    committed: 0,
    rolledBack: 0,
    released: 0,
  };
  const connection = {
    async query(statement, params = []) {
      const sql = String(statement).trim().replace(/\s+/g, " ");
      if (sql === MYSQL_SESSION_POLICY_SQL) {
        assert.deepEqual(params, [3, 5]);
        return [{affectedRows: 0}, []];
      }
      state.queries.push(sql);
      if (/^SET TRANSACTION ISOLATION LEVEL REPEATABLE READ$/i.test(sql)) {
        return [{affectedRows: 0}, []];
      }
      if (/^SELECT scope_key/i.test(sql)) return [[structuredClone(state.control)], []];
      if (/FROM mail_messages ORDER BY mail_id FOR UPDATE$/i.test(sql)) {
        return [structuredClone(state.sourceRows), []];
      }
      if (/FROM mail_identity_registry ORDER BY mail_id FOR UPDATE$/i.test(sql)) {
        return [structuredClone(state.identityRows), []];
      }
      if (/FROM mail_active_counters ORDER BY recipient_account_id FOR UPDATE$/i.test(sql)) {
        return [structuredClone(state.counterRows), []];
      }
      if (/FROM mail_archive_messages ORDER BY mail_id FOR UPDATE$/i.test(sql)) {
        return [structuredClone(state.archiveRows), []];
      }
      if (/FROM reward_vault_entries ORDER BY reward_id FOR UPDATE$/i.test(sql)) {
        return [structuredClone(state.vaultRows), []];
      }
      if (/^UPDATE mail_storage_control SET archive_enabled = 1/i.test(sql)) {
        if (state.control.archive_enabled !== 0) return [{affectedRows: 0}, []];
        state.control.archive_enabled = 1;
        return [{affectedRows: 1}, []];
      }
      throw new Error(`unexpected enable SQL: ${sql}`);
    },
    async beginTransaction() { state.begun += 1; },
    async commit() { state.committed += 1; },
    async rollback() { state.rolledBack += 1; },
    release() { state.released += 1; },
    destroy() {},
  };
  return {
    state,
    pool: {async getConnection() { return connection; }},
  };
}

function certifyAttachment(mail) {
  return {
    ok: true,
    items: structuredClone(mail && mail.items || []),
    equipmentEnvelopes: structuredClone(mail && mail.equipmentEnvelopes || []),
    currency: structuredClone(mail && mail.currency || {}),
  };
}

function physicalMailFixture() {
  const document = {
    mailId: "mail_enable_1",
    mailKind: "system",
    senderAccountId: "account_sender",
    senderUsername: "system",
    senderDisplayName: "系统",
    recipientAccountId: "account_recipient",
    recipientUsername: "recipient",
    recipientDisplayName: "收件人",
    title: "启用审计",
    body: "ready",
    items: [],
    equipmentEnvelopes: [],
    currency: {},
    createdAt: "2026-08-13T00:00:00.000Z",
    readAt: null,
    settledAt: "2026-08-13T00:00:00.000Z",
    schemaVersion: 2,
  };
  const projected = projectActiveMailIdentityRow({
    mail: document,
    settledAt: document.settledAt,
    revision: 7,
  });
  return {
    control: control({
      bootstrap_cursor_mail_id: document.mailId,
      bootstrap_source_count: 1,
      bootstrap_identity_count: 1,
      bootstrap_recipient_count: 1,
      bootstrap_active_count: 1,
    }),
    sourceRows: [{
      mail_id: document.mailId,
      sender_account_id: document.senderAccountId,
      recipient_account_id: document.recipientAccountId,
      title: document.title,
      created_at: document.createdAt,
      read_at: document.readAt,
      document_json: structuredClone(document),
    }],
    identityRows: [{
      mail_id: projected.mailId,
      sender_account_id: projected.senderAccountId,
      recipient_account_id: projected.recipientAccountId,
      location: projected.location,
      created_at: projected.createdAt,
      settled_at: projected.settledAt,
      archived_at: projected.archivedAt,
      identity_digest: projected.identityDigest,
      document_digest: projected.documentDigest,
      reward_id: projected.rewardId,
      data_generation: projected.dataGeneration,
      revision: projected.revision,
    }],
    counterRows: [{
      recipient_account_id: document.recipientAccountId,
      active_count: 1,
      data_generation: 1,
      revision: 4,
    }],
  };
}

test("feature enable requires maintenance confirmation before pool acquisition", async () => {
  let acquisitions = 0;
  await assert.rejects(
    runMysqlMailArchiveFeatureEnable({
      async getConnection() { acquisitions += 1; },
    }),
    (error) => error && error.code === "mail_archive_feature_maintenance_confirmation_required",
  );
  assert.equal(acquisitions, 0);
});

test("feature enable performs one exact monotonic flag transition and readback", async () => {
  const fake = poolFixture();
  const report = await runMysqlMailArchiveFeatureEnable(fake.pool, {
    maintenanceConfirmed: true,
    certifyAttachment,
  });
  assert.equal(report.ok, true);
  assert.equal(report.enabled, true);
  assert.equal(fake.state.control.archive_enabled, 1);
  assert.equal(fake.state.committed, 1);
  assert.equal(fake.state.rolledBack, 0);
  assert.equal(fake.state.queries.filter((sql) => /^SELECT scope_key/i.test(sql)).length, 2);
  assert.equal(fake.state.queries.filter((sql) => /^UPDATE mail_storage_control/i.test(sql)).length, 1);
  assert.equal(fake.state.queries.some((sql) => /SET (?:GLOBAL|PERSIST)/i.test(sql)), false);
});

test("feature enable certifies a non-empty source, identity, and counter snapshot", async () => {
  const snapshot = physicalMailFixture();
  const fake = poolFixture(snapshot.control, snapshot);
  const report = await runMysqlMailArchiveFeatureEnable(fake.pool, {
    maintenanceConfirmed: true,
    certifyAttachment,
  });
  assert.equal(report.ok, true);
  assert.equal(fake.state.control.archive_enabled, 1);

  const drifted = physicalMailFixture();
  drifted.identityRows[0].document_digest = "f".repeat(64);
  const invalid = poolFixture(drifted.control, drifted);
  await assert.rejects(
    runMysqlMailArchiveFeatureEnable(invalid.pool, {
      maintenanceConfirmed: true,
      certifyAttachment,
    }),
    (error) => error
      && error.code === "mail_archive_feature_identity_rows_invalid"
      && error.noCommitGuaranteed === true,
  );
  assert.equal(invalid.state.control.archive_enabled, 0);
});

test("already-enabled control is a read-only no-op and inconsistent controls fail closed", async () => {
	for (const flags of [
		{archive_enabled: 1},
		{archive_enabled: 1, vault_claim_enabled: 1},
		{archive_enabled: 1, vault_claim_enabled: 1, active_limit_enabled: 1},
	]) {
		const enabled = poolFixture(control(flags));
		const report = await runMysqlMailArchiveFeatureEnable(enabled.pool, {
			maintenanceConfirmed: true,
			certifyAttachment,
		});
		assert.equal(report.code, "mail_archive_feature_already_enabled");
		assert.equal(report.enabled, false);
		assert.equal(enabled.state.committed, 0);
		assert.equal(enabled.state.rolledBack, 1);
	}

  const invalid = poolFixture(control({bootstrap_identity_count: 3}));
  await assert.rejects(
    runMysqlMailArchiveFeatureEnable(invalid.pool, {maintenanceConfirmed: true, certifyAttachment}),
    (error) => error
      && error.code === "mail_archive_feature_control_not_ready"
      && error.noCommitGuaranteed === true,
  );
  assert.equal(invalid.state.committed, 0);
  assert.equal(invalid.state.rolledBack, 1);
});

test("feature enable rejects missing attachment certification before pool acquisition", async () => {
  let acquisitions = 0;
  await assert.rejects(
    runMysqlMailArchiveFeatureEnable({
      async getConnection() { acquisitions += 1; },
    }, {maintenanceConfirmed: true}),
    (error) => error && error.code === "mail_archive_feature_attachment_certifier_missing",
  );
  assert.equal(acquisitions, 0);
});

test("feature enable refuses pre-existing archive or vault sidecars", async () => {
  for (const snapshot of [
    {archiveRows: [{mail_id: "mail_unexpected"}]},
    {vaultRows: [{reward_id: "reward_unexpected"}]},
  ]) {
    const fake = poolFixture(control(), snapshot);
    await assert.rejects(
      runMysqlMailArchiveFeatureEnable(fake.pool, {maintenanceConfirmed: true, certifyAttachment}),
      (error) => error
        && error.code === "mail_archive_feature_pre_enable_sidecars_not_empty"
        && error.noCommitGuaranteed === true,
    );
    assert.equal(fake.state.control.archive_enabled, 0);
    assert.equal(fake.state.committed, 0);
    assert.equal(fake.state.rolledBack, 1);
  }
});

test("CLI rejects missing confirmation and credential overrides before env or store setup", async () => {
  assert.deepEqual(parseArgs(["--maintenance-confirmed", "--enable"]), {
    maintenanceConfirmed: true,
  });
  for (const argv of [
    ["--enable"],
    ["--maintenance-confirmed"],
    ["--enable", "--maintenance-confirmed", "--host=127.0.0.1"],
  ]) {
    let envLoads = 0;
    let stores = 0;
    const report = await runMain(argv, {
      loadEnvFile() { envLoads += 1; },
      createStore() { stores += 1; },
    });
    assert.equal(report.ok, false);
    assert.equal(envLoads, 0);
    assert.equal(stores, 0);
  }
});

test("CLI creates only a dedicated fresh maintenance store", async () => {
  const creates = [];
  const report = await runMain(["--enable", "--maintenance-confirmed"], {
    loadEnvFile() {},
    createStore(options) {
      creates.push(structuredClone(options));
      return {
        async enableMailArchiveFeature(optionsValue) {
          assert.equal(optionsValue.maintenanceConfirmed, true);
          return {
            kind: "beastbound_mail_archive_feature_enable",
            schemaVersion: 1,
            ok: true,
            code: "mail_archive_feature_enable_ok",
            enabled: true,
            recovered: false,
            outcomeUnknown: false,
            retryable: false,
          };
        },
        async close() {},
      };
    },
  });
  assert.equal(report.ok, true);
  assert.deepEqual(creates, [{
    readOnly: false,
    ensureSchema: false,
    usePool: true,
    singleWriterMaintenance: true,
    mailArchiveFeatureEnable: true,
    transactionTimeoutMs: 60000,
  }]);
});
