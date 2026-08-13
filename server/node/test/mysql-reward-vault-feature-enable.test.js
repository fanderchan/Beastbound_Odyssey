"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  runMysqlRewardVaultFeatureEnable,
} = require("../src/mysql-reward-vault-feature-enable");
const {
  projectActiveMailIdentityRow,
} = require("../src/mysql-mail-storage-forward-maintenance");
const {
  parseArgs,
  runMain,
} = require("../scripts/enable-reward-vault");

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

function certifyAttachment(mail) {
  return {
    ok: true,
    items: structuredClone(mail && mail.items || []),
    equipmentEnvelopes: structuredClone(mail && mail.equipmentEnvelopes || []),
    currency: structuredClone(mail && mail.currency || {}),
  };
}

function settledMail() {
  return {
    mailId: "mail_reward_enable_history",
    mailKind: "system",
    senderAccountId: "account_sender",
    senderUsername: "system",
    senderDisplayName: "系统",
    recipientAccountId: "account_recipient",
    recipientUsername: "recipient",
    recipientDisplayName: "收件人",
    title: "历史归档",
    body: "已结算。",
    items: [],
    equipmentEnvelopes: [],
    currency: {},
    createdAt: "2026-05-01T00:00:00.000Z",
    readAt: "2026-05-02T00:00:00.000Z",
    settledAt: "2026-05-02T00:00:00.000Z",
    schemaVersion: 2,
  };
}

function archivedSnapshot() {
  const mail = settledMail();
  const archivedAt = "2026-06-02T00:00:00.000Z";
  const projected = projectActiveMailIdentityRow({
    mail,
    settledAt: mail.settledAt,
    dataGeneration: 1,
    revision: 3,
  });
  return {
    control: control({
      archive_enabled: 1,
      bootstrap_cursor_mail_id: mail.mailId,
      bootstrap_source_count: 1,
      bootstrap_identity_count: 1,
      bootstrap_recipient_count: 1,
      bootstrap_active_count: 1,
    }),
    sourceRows: [],
    identityRows: [{
      mail_id: projected.mailId,
      sender_account_id: projected.senderAccountId,
      recipient_account_id: projected.recipientAccountId,
      location: "archive",
      created_at: projected.createdAt,
      settled_at: projected.settledAt,
      archived_at: archivedAt,
      identity_digest: projected.identityDigest,
      document_digest: projected.documentDigest,
      reward_id: null,
      data_generation: projected.dataGeneration,
      revision: projected.revision,
    }],
    counterRows: [{
      recipient_account_id: mail.recipientAccountId,
      active_count: 0,
      data_generation: 1,
      revision: 4,
    }],
    archiveRows: [{
      mail_id: mail.mailId,
      sender_account_id: mail.senderAccountId,
      recipient_account_id: mail.recipientAccountId,
      title: mail.title,
      created_at: mail.createdAt,
      read_at: mail.readAt,
      settled_at: mail.settledAt,
      archived_at: archivedAt,
      archive_generation: 1,
      document_json: structuredClone(mail),
    }],
    vaultRows: [],
  };
}

function poolFixture(initial = control(), snapshot = {}, options = {}) {
  const state = {
    control: structuredClone(initial),
    sourceRows: structuredClone(snapshot.sourceRows || []),
    identityRows: structuredClone(snapshot.identityRows || []),
    counterRows: structuredClone(snapshot.counterRows || []),
    archiveRows: structuredClone(snapshot.archiveRows || []),
    vaultRows: structuredClone(snapshot.vaultRows || []),
    queries: [],
    acquisitions: 0,
    commits: 0,
    rollbacks: 0,
    releases: 0,
    destroys: 0,
  };
  return {
    state,
    pool: {
      async getConnection() {
        state.acquisitions += 1;
        const recovery = state.acquisitions > 1;
        return {
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
            if (/^UPDATE mail_storage_control SET vault_claim_enabled = 1/i.test(sql)) {
              assert.deepEqual(params, [Number(state.control.archive_enabled)]);
              if (state.control.vault_claim_enabled !== 0) return [{affectedRows: 0}, []];
              state.control.vault_claim_enabled = 1;
              return [{affectedRows: 1}, []];
            }
            throw new Error(`unexpected reward vault feature SQL: ${sql}`);
          },
          async beginTransaction() {},
          async commit() {
            state.commits += 1;
            if (!recovery && options.ambiguousCommit === true) {
              const error = new Error("lost commit acknowledgement");
              error.code = "PROTOCOL_CONNECTION_LOST";
              throw error;
            }
          },
          async rollback() { state.rollbacks += 1; },
          release() { state.releases += 1; },
          destroy() { state.destroys += 1; },
        };
      },
    },
  };
}

test("reward vault enable requires explicit maintenance confirmation before acquisition", async () => {
  let acquisitions = 0;
  await assert.rejects(
    runMysqlRewardVaultFeatureEnable({
      async getConnection() { acquisitions += 1; },
    }),
    (error) => error && error.code === "reward_vault_feature_maintenance_confirmation_required",
  );
  assert.equal(acquisitions, 0);
});

test("reward vault enable performs one exact monotonic transition", async () => {
  const fake = poolFixture();
  const report = await runMysqlRewardVaultFeatureEnable(fake.pool, {
    maintenanceConfirmed: true,
    certifyAttachment,
  });
  assert.equal(report.code, "reward_vault_feature_enable_ok");
  assert.equal(report.enabled, true);
  assert.equal(fake.state.control.vault_claim_enabled, 1);
  assert.equal(fake.state.commits, 1);
  assert.equal(fake.state.queries.some((sql) => /SET (?:GLOBAL|PERSIST)/i.test(sql)), false);
});

test("reward vault enable is idempotent and reports an already enabled control as enabled", async () => {
  const fake = poolFixture(control({vault_claim_enabled: 1}));
  const report = await runMysqlRewardVaultFeatureEnable(fake.pool, {
    maintenanceConfirmed: true,
    certifyAttachment,
  });
  assert.equal(report.ok, true);
  assert.equal(report.code, "reward_vault_feature_already_enabled");
  assert.equal(report.enabled, true);
  assert.equal(fake.state.commits, 0);
  assert.equal(fake.state.rollbacks, 1);
});

test("reward vault enable certifies and preserves existing archive history", async () => {
  const snapshot = archivedSnapshot();
  const fake = poolFixture(snapshot.control, snapshot);
  const report = await runMysqlRewardVaultFeatureEnable(fake.pool, {
    maintenanceConfirmed: true,
    certifyAttachment,
  });
  assert.equal(report.ok, true);
  assert.equal(fake.state.archiveRows.length, 1);
  assert.equal(fake.state.identityRows[0].location, "archive");
  assert.equal(fake.state.counterRows[0].active_count, 0);

  const drifted = archivedSnapshot();
  drifted.archiveRows[0].document_json.body = "tampered";
  const invalid = poolFixture(drifted.control, drifted);
  await assert.rejects(
    runMysqlRewardVaultFeatureEnable(invalid.pool, {
      maintenanceConfirmed: true,
      certifyAttachment,
    }),
    (error) => error
      && error.code === "reward_vault_feature_snapshot_certification_failed"
      && error.noCommitGuaranteed === true,
  );
  assert.equal(invalid.state.control.vault_claim_enabled, 0);
});

test("reward vault enable fails closed when vault is non-empty", async () => {
  const fake = poolFixture(control(), {vaultRows: [{reward_id: `reward_${"a".repeat(64)}`}]});
  await assert.rejects(
    runMysqlRewardVaultFeatureEnable(fake.pool, {
      maintenanceConfirmed: true,
      certifyAttachment,
    }),
    (error) => error
      && error.code === "reward_vault_feature_snapshot_certification_failed"
      && error.noCommitGuaranteed === true,
  );
  assert.equal(fake.state.commits, 0);
  assert.equal(fake.state.rollbacks, 1);
});

test("reward vault enable recovers an exact committed transition after lost acknowledgement", async () => {
  const fake = poolFixture(control(), {}, {ambiguousCommit: true});
  const report = await runMysqlRewardVaultFeatureEnable(fake.pool, {
    maintenanceConfirmed: true,
    certifyAttachment,
  });
  assert.equal(report.code, "reward_vault_feature_enable_commit_recovered");
  assert.equal(report.enabled, true);
  assert.equal(report.recovered, true);
  assert.equal(fake.state.acquisitions, 2);
  assert.equal(fake.state.destroys, 1);
});

test("reward vault CLI rejects missing confirmation and credential overrides before setup", async () => {
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

test("reward vault CLI creates only a dedicated fresh maintenance store", async () => {
  const creates = [];
  const report = await runMain(["--enable", "--maintenance-confirmed"], {
    loadEnvFile() {},
    createStore(options) {
      creates.push(structuredClone(options));
      return {
        async enableRewardVaultFeature(optionsValue) {
          assert.equal(optionsValue.maintenanceConfirmed, true);
          return {
            kind: "beastbound_reward_vault_feature_enable",
            schemaVersion: 1,
            ok: true,
            code: "reward_vault_feature_enable_ok",
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
    rewardVaultFeatureEnable: true,
    transactionTimeoutMs: 60000,
  }]);
});
