"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  __assertRecipientCountsWithinLimitForTest: assertRecipientCountsWithinLimit,
  runMysqlMailActiveLimitFeatureEnable,
} = require("../src/mysql-mail-active-limit-feature-enable");
const {
  parseArgs,
  runMain,
} = require("../scripts/enable-mail-active-limit");

const MYSQL_SESSION_POLICY_SQL =
  "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?";

function control(overrides = {}) {
  return {
    scope_key: "mail_lifecycle",
    schema_generation: 1,
    data_generation: 1,
    lifecycle_state: "ready",
    archive_enabled: 0,
    vault_claim_enabled: 1,
    active_limit_enabled: 0,
    bootstrap_cursor_mail_id: "",
    bootstrap_source_count: 0,
    bootstrap_identity_count: 0,
    bootstrap_recipient_count: 0,
    bootstrap_active_count: 0,
    source_digest: "a".repeat(64),
    reconciled_at: "2026-08-14T00:00:00.000Z",
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

function poolFixture(initial = control(), snapshot = {}, options = {}) {
  const state = {
    control: structuredClone(initial),
    sourceRows: structuredClone(snapshot.sourceRows || []),
    identityRows: structuredClone(snapshot.identityRows || []),
    counterRows: structuredClone(snapshot.counterRows || []),
    archiveRows: structuredClone(snapshot.archiveRows || []),
    vaultRows: structuredClone(snapshot.vaultRows || []),
    acquisitions: 0,
    commits: 0,
    rollbacks: 0,
    releases: 0,
    destroys: 0,
    queries: [],
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
            if (/^UPDATE mail_storage_control SET active_limit_enabled = 1/i.test(sql)) {
              assert.deepEqual(params, [Number(state.control.archive_enabled)]);
              if (
                state.control.vault_claim_enabled !== 1
                || state.control.active_limit_enabled !== 0
              ) {
                return [{affectedRows: 0}, []];
              }
              state.control.active_limit_enabled = 1;
              return [{affectedRows: 1}, []];
            }
            throw new Error(`unexpected mail active limit SQL: ${sql}`);
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

test("active mailbox limit requires maintenance confirmation before acquisition", async () => {
  let acquisitions = 0;
  await assert.rejects(
    runMysqlMailActiveLimitFeatureEnable({
      async getConnection() { acquisitions += 1; },
    }),
    (error) => error && error.code === "mail_active_limit_feature_maintenance_confirmation_required",
  );
  assert.equal(acquisitions, 0);
});

test("active mailbox limit performs one exact 200-capacity transition", async () => {
  const fake = poolFixture();
  const report = await runMysqlMailActiveLimitFeatureEnable(fake.pool, {
    maintenanceConfirmed: true,
    certifyAttachment,
  });
  assert.equal(report.ok, true);
  assert.equal(report.code, "mail_active_limit_feature_enable_ok");
  assert.equal(report.enabled, true);
  assert.equal(report.capacity, 200);
  assert.equal(fake.state.control.active_limit_enabled, 1);
  assert.equal(fake.state.commits, 1);
  assert.equal(fake.state.queries.some((sql) => /SET (?:GLOBAL|PERSIST)/i.test(sql)), false);
});

test("active mailbox limit is idempotent after activation", async () => {
  const fake = poolFixture(control({active_limit_enabled: 1}));
  const report = await runMysqlMailActiveLimitFeatureEnable(fake.pool, {
    maintenanceConfirmed: true,
    certifyAttachment,
  });
  assert.equal(report.code, "mail_active_limit_feature_already_enabled");
  assert.equal(report.enabled, true);
  assert.equal(fake.state.commits, 0);
  assert.equal(fake.state.rollbacks, 1);
});

test("active mailbox limit rejects a pre-existing 201st active message", async () => {
  assert.throws(
    () => assertRecipientCountsWithinLimit([{
      recipient_account_id: "acc_full_mailbox",
      active_count: 201,
      data_generation: 1,
      revision: 1,
    }]),
    (error) => error && error.code === "mail_active_limit_feature_recipient_over_capacity",
  );

  const fake = poolFixture(control(), {
    counterRows: [{
      recipient_account_id: "acc_broken_counter",
      active_count: -1,
      data_generation: 1,
      revision: 1,
    }],
  });
  await assert.rejects(
    runMysqlMailActiveLimitFeatureEnable(fake.pool, {
      maintenanceConfirmed: true,
      certifyAttachment,
    }),
    (error) => error
      && error.code === "mail_active_limit_feature_snapshot_certification_failed"
      && error.noCommitGuaranteed === true,
  );
  assert.equal(fake.state.commits, 0);
  assert.equal(fake.state.rollbacks, 1);
  assert.equal(fake.state.control.active_limit_enabled, 0);
});

test("active mailbox limit recovers the exact transition after lost COMMIT acknowledgement", async () => {
  const fake = poolFixture(control(), {}, {ambiguousCommit: true});
  const report = await runMysqlMailActiveLimitFeatureEnable(fake.pool, {
    maintenanceConfirmed: true,
    certifyAttachment,
  });
  assert.equal(report.code, "mail_active_limit_feature_enable_commit_recovered");
  assert.equal(report.recovered, true);
  assert.equal(report.enabled, true);
  assert.equal(fake.state.acquisitions, 2);
  assert.equal(fake.state.destroys, 1);
});

test("active mailbox limit CLI rejects unsafe arguments before setup", async () => {
  assert.deepEqual(parseArgs(["--maintenance-confirmed", "--enable"]), {
    maintenanceConfirmed: true,
  });
  for (const argv of [
    ["--enable"],
    ["--maintenance-confirmed"],
    ["--enable", "--maintenance-confirmed", "--password=test"],
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

test("active mailbox limit CLI creates only a fresh dedicated maintenance store", async () => {
  const creates = [];
  const report = await runMain(["--enable", "--maintenance-confirmed"], {
    loadEnvFile() {},
    createStore(options) {
      creates.push(structuredClone(options));
      return {
        async enableMailActiveLimitFeature(enableOptions) {
          assert.equal(enableOptions.maintenanceConfirmed, true);
          return {
            kind: "beastbound_mail_active_limit_feature_enable",
            schemaVersion: 1,
            ok: true,
            code: "mail_active_limit_feature_enable_ok",
            enabled: true,
            capacity: 200,
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
    mailActiveLimitFeatureEnable: true,
    transactionTimeoutMs: 60000,
  }]);
});
