"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {createMysqlAuthStore} = require("../src/mysql-store");

const {
  MAIL_STORAGE_INITIAL_DATA_GENERATION,
  MAIL_STORAGE_INITIAL_STATE,
  MAIL_STORAGE_MAX_SUPPORTED_DATA_GENERATION,
  MAIL_STORAGE_SCHEMA_GENERATION,
  MAIL_STORAGE_SCOPE_KEY,
  MAIL_STORAGE_STATES,
  MAIL_STORAGE_TABLE_NAMES,
  assertMailStorageContractOutput,
  buildMailStorageCanonicalContractOutputForTest,
  buildMailStorageContractQuerySql,
  buildMailStorageControlQuerySql,
  buildMailStorageFoundationSql,
  parseMailStorageContractOutput,
  parseMailStorageControlOutput,
  validateMailStorageStartupState,
} = require("../src/mysql-mail-storage-schema");

function expectedContractOutput() {
  return buildMailStorageCanonicalContractOutputForTest();
}

function controlRow(overrides = {}) {
  return {
    scopeKey: MAIL_STORAGE_SCOPE_KEY,
    schemaGeneration: MAIL_STORAGE_SCHEMA_GENERATION,
    dataGeneration: MAIL_STORAGE_INITIAL_DATA_GENERATION,
    lifecycleState: MAIL_STORAGE_INITIAL_STATE,
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

function controlOutput(overrides = {}) {
  const row = controlRow(overrides);
  return [
    row.scopeKey,
    row.schemaGeneration,
    row.dataGeneration,
    row.lifecycleState,
    row.archiveEnabled ? 1 : 0,
    row.vaultClaimEnabled ? 1 : 0,
    row.activeLimitEnabled ? 1 : 0,
    row.bootstrapCursorMailId,
    row.bootstrapSourceCount,
    row.bootstrapIdentityCount,
    row.bootstrapRecipientCount,
    row.bootstrapActiveCount,
    row.sourceDigest,
    row.reconciledAt,
  ].join("\t") + "\n";
}

function withFakeMysqlSchema(callback) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mail-storage-schema-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const logPath = path.join(tempDir, "calls.jsonl");
  const environmentKeys = [
    "FAKE_MAIL_STORAGE_CONTRACT",
    "FAKE_MAIL_STORAGE_CONTROL",
    "FAKE_MAIL_STORAGE_LOG",
    "FAKE_MAIL_STORAGE_MODE",
  ];
  const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MAIL_STORAGE_LOG, JSON.stringify({stdin}) + "\\n");
  const foundation = stdin.includes("CREATE TABLE IF NOT EXISTS mail_storage_control");
  if (foundation && process.env.FAKE_MAIL_STORAGE_MODE === "lock_timeout") {
    process.stderr.write("ERROR 1205 (HY000): Lock wait timeout exceeded; try restarting transaction\\n");
    process.exitCode = 1;
    return;
  }
  if (foundation && process.env.FAKE_MAIL_STORAGE_MODE === "hang") {
    setTimeout(() => {}, 10000);
    return;
  }
  if (stdin.includes("FROM information_schema.columns AS history_column")) {
    process.stdout.write("1\\tbigint unsigned\\tNO\\tauto_increment\\t1\\n");
    return;
  }
  if (stdin.includes("idx_mail_recipient_created_id") && stdin.includes("FROM information_schema.statistics")) {
    process.stdout.write("3\\t1:recipient_account_id,2:created_at,3:mail_id\\t0\\t0\\tBTREE\\n");
    return;
  }
  if (stdin.includes("AS mail_storage_contract")) {
    process.stdout.write(process.env.FAKE_MAIL_STORAGE_CONTRACT || "");
    return;
  }
  if (stdin.includes("FROM mail_storage_control")) {
    process.stdout.write(process.env.FAKE_MAIL_STORAGE_CONTROL || "");
    return;
  }
  if (stdin.includes("SELECT 'server_state'")) {
    process.stdout.write("store_revision\\tauth\\t0\\n");
  }
});
`, {mode: 0o755});
  try {
    process.env.FAKE_MAIL_STORAGE_CONTRACT = expectedContractOutput();
    process.env.FAKE_MAIL_STORAGE_CONTROL = controlOutput();
    process.env.FAKE_MAIL_STORAGE_LOG = logPath;
    process.env.FAKE_MAIL_STORAGE_MODE = "ok";
    return callback({fakeMysqlPath, logPath});
  } finally {
    for (const key of environmentKeys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
}

function fakeSchemaStore(fakeMysqlPath, options = {}) {
  return createMysqlAuthStore({
    mysqlPath: fakeMysqlPath,
    host: "127.0.0.1",
    port: 3306,
    user: "test-only",
    password: "test-only",
    database: "beastbound_test",
    createDatabase: false,
    ensureSchema: options.ensureSchema !== false,
    usePool: options.usePool === undefined ? true : options.usePool,
    singleWriterMaintenance: options.singleWriterMaintenance === true,
    poolFactory: () => ({
      async getConnection() {
        throw new Error("schema load must not acquire a business connection");
      },
      async end() {},
    }),
    mailStorageSchemaTimeoutMs: options.timeoutMs || 1000,
  });
}

test("foundation SQL creates five inert tables and seeds generation zero in one bounded session", () => {
  const sql = buildMailStorageFoundationSql({metadataLockWaitTimeoutSeconds: 7});

  assert.match(sql, /^SET SESSION lock_wait_timeout = 7;/);
  for (const tableName of MAIL_STORAGE_TABLE_NAMES) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName} \\(`));
  }
  assert.match(sql, /mail_id VARCHAR\(96\) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci PRIMARY KEY/);
  assert.match(sql, /bootstrap_cursor_mail_id VARCHAR\(96\) NULL/);
  assert.match(sql, /bootstrap_(?:source|identity|recipient|active)_count BIGINT UNSIGNED NOT NULL DEFAULT 0/g);
  assert.match(sql, /revision BIGINT UNSIGNED NOT NULL DEFAULT 0/);
  assert.match(sql, /identity_digest CHAR\(64\) CHARACTER SET ascii COLLATE ascii_bin NOT NULL/);
  assert.match(sql, /document_digest CHAR\(64\) CHARACTER SET ascii COLLATE ascii_bin NOT NULL/);
  assert.match(sql, /UNIQUE KEY uq_mail_identity_reward_id \(reward_id\)/);
  assert.match(sql, /archive_generation BIGINT UNSIGNED NOT NULL/);
  assert.match(sql, /reward_id VARCHAR\(160\) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY/);
  assert.match(sql, /source_key VARCHAR\(191\) CHARACTER SET ascii COLLATE ascii_bin NOT NULL/);
  assert.match(sql, /source_kind VARCHAR\(64\) CHARACTER SET ascii COLLATE ascii_bin NOT NULL/);
  assert.match(sql, /source_digest CHAR\(64\) CHARACTER SET ascii COLLATE ascii_bin NOT NULL/);
  assert.match(sql, /delivered_at VARCHAR\(40\) NULL/);
  assert.match(sql, /delivered_mail_id VARCHAR\(96\) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL/);
  assert.match(sql, /data_generation BIGINT UNSIGNED NOT NULL/);
  assert.match(sql, /UNIQUE KEY uq_reward_vault_recipient_source \(recipient_account_id, source_kind, source_key\)/);
  assert.match(sql, /UNIQUE KEY uq_reward_vault_delivered_mail_id \(delivered_mail_id\)/);
  assert.match(sql, /active_count INT UNSIGNED NOT NULL/);
  assert.doesNotMatch(sql, /active_count[^\n]*(?:<=|200)/i);
  assert.match(sql, /'mail_lifecycle', 1,[\s\S]*0, 'uninitialized',[\s\S]*0, 0, 0, NULL, 0, 0, 0, 0, NULL, NULL/);
  assert.doesNotMatch(sql, /\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(sql, /\bSET\s+(?:GLOBAL|PERSIST|PERSIST_ONLY)\b/i);
  const dmlTargets = sql.split(";").flatMap((statement) => {
    const match = statement.trim().match(
      /^(?:INSERT(?:\s+IGNORE)?\s+INTO|REPLACE\s+INTO|UPDATE|DELETE\s+FROM)\s+([A-Za-z0-9_]+)/i,
    );
    return match ? [match[1]] : [];
  });
  assert.deepEqual(dmlTargets, ["mail_storage_control"]);
});

test("foundation SQL rejects unbounded or invalid metadata lock waits", () => {
  for (const value of [0, -1, 1.5, 61, "bad"]) {
    assert.throws(
      () => buildMailStorageFoundationSql({metadataLockWaitTimeoutSeconds: value}),
      (error) => error && error.code === "mail_storage_metadata_lock_timeout_invalid",
    );
  }
});

test("information schema query includes the active mail source engine and seven-field contract", () => {
  const sql = buildMailStorageContractQuerySql("beastbound_test");
  assert.match(sql, /information_schema\.tables/);
  assert.match(sql, /information_schema\.columns/);
  assert.match(sql, /information_schema\.statistics/);
  assert.match(sql, /table_schema = 'beastbound_test'/);
  for (const tableName of MAIL_STORAGE_TABLE_NAMES) {
    assert.match(sql, new RegExp(`'${tableName}'`));
  }
  assert.match(sql, /table_name = 'mail_messages'/);
  for (const columnName of [
    "mail_id",
    "sender_account_id",
    "recipient_account_id",
    "title",
    "created_at",
    "read_at",
    "document_json",
  ]) {
    assert.match(sql, new RegExp(`'${columnName}'`));
  }
  assert.throws(
    () => buildMailStorageContractQuerySql("beastbound; DROP DATABASE shared"),
    (error) => error && error.code === "mail_storage_database_invalid",
  );
});

test("exact contract parser accepts the canonical fake output and rejects missing or incompatible rows", () => {
  const output = expectedContractOutput();
  const valid = parseMailStorageContractOutput(output);
  assert.equal(valid.ok, true);
  assert.equal(valid.expectedRowCount, valid.actualRowCount);
  assert.deepEqual(valid.errors, []);
  assert.equal(assertMailStorageContractOutput(output).ok, true);

  const lines = output.trim().split("\n");
  const missing = parseMailStorageContractOutput(`${lines.slice(1).join("\n")}\n`);
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((entry) => entry.startsWith("missing:")));

  const incompatible = [...lines];
  incompatible[0] = incompatible[0].replace("INNODB", "MYISAM");
  assert.throws(
    () => assertMailStorageContractOutput(`${incompatible.join("\n")}\n`),
    (error) => error
      && error.code === "mysql_mail_storage_schema_contract_invalid"
      && error.contractErrors.some((entry) => entry.includes("MYISAM")),
  );

  const malformed = parseMailStorageContractOutput("table\ttoo_few\n");
  assert.equal(malformed.ok, false);
  assert.ok(malformed.errors.includes("row_1_field_count:2"));

  const referenceIndex = lines.findIndex((line) => line.startsWith("reference\tmail_messages\tmail_id\t"));
  assert.notEqual(referenceIndex, -1);
  const collationDrift = [...lines];
  collationDrift[referenceIndex] = collationDrift[referenceIndex].replace(
    "utf8mb4_0900_ai_ci",
    "utf8mb4_bin",
  );
  assert.throws(
    () => assertMailStorageContractOutput(`${collationDrift.join("\n")}\n`),
    (error) => error
      && error.code === "mysql_mail_storage_schema_contract_invalid"
      && error.contractErrors.some((entry) => entry.includes("utf8mb4_bin")),
  );

  const referenceTableIndex = lines.findIndex((line) => (
    line.startsWith("reference_table\tmail_messages\t\t0\t")
  ));
  assert.notEqual(referenceTableIndex, -1);
  const sourceEngineDrift = [...lines];
  sourceEngineDrift[referenceTableIndex] = sourceEngineDrift[referenceTableIndex].replace(
    "INNODB",
    "MYISAM",
  );
  assert.throws(
    () => assertMailStorageContractOutput(`${sourceEngineDrift.join("\n")}\n`),
    (error) => error
      && error.code === "mysql_mail_storage_schema_contract_invalid"
      && error.contractErrors.some((entry) => entry.includes("MYISAM")),
  );
});

test("control query and parser preserve the generation and three independent flags", () => {
  const query = buildMailStorageControlQuerySql();
  assert.match(query, /FROM mail_storage_control/);
  assert.match(query, /WHERE scope_key = 'mail_lifecycle'/);

  const parsed = parseMailStorageControlOutput(
    "mail_lifecycle\t1\t4\tready\t1\t0\t1\t"
      + `mail_bootstrap_cursor\t12\t12\t3\t12\t${"a".repeat(64)}\t2026-07-16T08:00:00.000Z\n`,
  );
  assert.deepEqual(parsed, controlRow({
    dataGeneration: 4,
    lifecycleState: "ready",
    archiveEnabled: true,
    activeLimitEnabled: true,
    bootstrapCursorMailId: "mail_bootstrap_cursor",
    bootstrapSourceCount: 12,
    bootstrapIdentityCount: 12,
    bootstrapRecipientCount: 3,
    bootstrapActiveCount: 12,
    sourceDigest: "a".repeat(64),
    reconciledAt: "2026-07-16T08:00:00.000Z",
  }));

  for (const output of [
    "",
    "mail_lifecycle\t1\n",
    "mail_lifecycle\t1\t0\tuninitialized\t0\t0\t0\t\t0\t0\t0\t0\t\t\nsecond\n",
  ]) {
    assert.throws(
      () => parseMailStorageControlOutput(output),
      (error) => error && error.code === "mysql_mail_storage_control_row_invalid",
    );
  }
  assert.throws(
    () => parseMailStorageControlOutput("mail_lifecycle\t1\t0\tuninitialized\t2\t0\t0\t\t0\t0\t0\t0\t\t\n"),
    (error) => error && error.code === "mysql_mail_storage_control_row_invalid",
  );
});

test("generation zero uninitialized state is compatible but keeps every feature disabled", () => {
  assert.deepEqual(MAIL_STORAGE_STATES, ["uninitialized", "building", "ready", "repair_required"]);
  const result = validateMailStorageStartupState(controlRow());
  assert.deepEqual(result, {
    compatible: true,
    ready: false,
    schemaGeneration: 1,
    dataGeneration: 0,
    lifecycleState: "uninitialized",
    flags: {archive: false, vaultClaim: false, activeLimit: false},
    bootstrap: {cursorMailId: "", sourceCount: 0, identityCount: 0, recipientCount: 0, activeCount: 0},
  });

  assert.throws(
    () => validateMailStorageStartupState(controlRow({archiveEnabled: true})),
    (error) => error && error.code === "mysql_mail_storage_feature_unsupported",
  );
  assert.throws(
    () => validateMailStorageStartupState(
      controlRow({archiveEnabled: true}),
      {supportedFeatures: ["archive"]},
    ),
    (error) => error && error.code === "mysql_mail_storage_uninitialized_state_incompatible",
  );
});

test("building, repair-required, future and malformed states fail closed", () => {
  const cases = [
    [controlRow({lifecycleState: "building"}), "mysql_mail_storage_bootstrap_in_progress"],
    [controlRow({lifecycleState: "repair_required"}), "mysql_mail_storage_repair_required"],
    [controlRow({schemaGeneration: 2}), "mysql_mail_storage_schema_generation_future"],
    [controlRow({schemaGeneration: 0}), "mysql_mail_storage_schema_generation_incompatible"],
    [controlRow({lifecycleState: "unknown"}), "mysql_mail_storage_lifecycle_state_incompatible"],
    [{...controlRow(), extra: true}, "mysql_mail_storage_control_row_invalid"],
  ];
  for (const [state, code] of cases) {
    assert.throws(
      () => validateMailStorageStartupState(state),
      (error) => error && error.code === code,
      code,
    );
  }
});

test("ready state is generation-fenced and enforces feature and reconciliation invariants", () => {
  const readyBase = controlRow({
    dataGeneration: 1,
    lifecycleState: "ready",
    sourceDigest: "b".repeat(64),
    reconciledAt: "2026-07-16T09:30:00.000Z",
  });
  assert.equal(MAIL_STORAGE_MAX_SUPPORTED_DATA_GENERATION, 1);
  const generationOneOptions = {maxSupportedDataGeneration: 1};
  const disabled = validateMailStorageStartupState(readyBase);
  assert.equal(disabled.ready, true);
  assert.deepEqual(disabled.flags, {archive: false, vaultClaim: false, activeLimit: false});
  assert.deepEqual(disabled.bootstrap, {
    cursorMailId: "",
    sourceCount: 0,
    identityCount: 0,
    recipientCount: 0,
    activeCount: 0,
  });

  assert.throws(
    () => validateMailStorageStartupState(
      {...readyBase, vaultClaimEnabled: true},
      generationOneOptions,
    ),
    (error) => error
      && error.code === "mysql_mail_storage_feature_unsupported"
      && error.unsupportedFeatures[0] === "vaultClaim",
  );
  const explicit = validateMailStorageStartupState(
    {...readyBase, vaultClaimEnabled: true},
    {maxSupportedDataGeneration: 1, supportedFeatures: ["vaultClaim"]},
  );
  assert.deepEqual(explicit.flags, {archive: false, vaultClaim: true, activeLimit: false});

  for (const supportedFeatures of ["vaultClaim", ["unknown"], ["archive", "archive"]]) {
    assert.throws(
      () => validateMailStorageStartupState(
        readyBase,
        {maxSupportedDataGeneration: 1, supportedFeatures},
      ),
      (error) => error && error.code === "mysql_mail_storage_supported_features_invalid",
    );
  }

  assert.throws(
    () => validateMailStorageStartupState(
      {...readyBase, activeLimitEnabled: true},
      {maxSupportedDataGeneration: 1, supportedFeatures: ["activeLimit"]},
    ),
    (error) => error && error.code === "mysql_mail_storage_feature_dependency_invalid",
  );
  const allDependentFeatures = validateMailStorageStartupState(
    {...readyBase, vaultClaimEnabled: true, activeLimitEnabled: true},
    {maxSupportedDataGeneration: 1, supportedFeatures: ["vaultClaim", "activeLimit"]},
  );
  assert.equal(allDependentFeatures.flags.activeLimit, true);

  for (const counts of [
    {bootstrapSourceCount: 2, bootstrapIdentityCount: 1, bootstrapActiveCount: 2, bootstrapRecipientCount: 1},
    {bootstrapSourceCount: 2, bootstrapIdentityCount: 2, bootstrapActiveCount: 1, bootstrapRecipientCount: 1},
    {bootstrapSourceCount: 1, bootstrapIdentityCount: 1, bootstrapActiveCount: 1, bootstrapRecipientCount: 0},
    {bootstrapSourceCount: 0, bootstrapIdentityCount: 0, bootstrapActiveCount: 0, bootstrapRecipientCount: 1},
  ]) {
    assert.throws(
      () => validateMailStorageStartupState(
        {...readyBase, ...counts},
        generationOneOptions,
      ),
      (error) => error && error.code === "mysql_mail_storage_ready_counts_incompatible",
    );
  }

  for (const maxSupportedDataGeneration of [-1, 1.5, "bad"]) {
    assert.throws(
      () => validateMailStorageStartupState(
        readyBase,
        {maxSupportedDataGeneration},
      ),
      (error) => error && error.code === "mysql_mail_storage_supported_data_generation_invalid",
    );
  }

  for (const state of [
    {...readyBase, dataGeneration: 0},
    {...readyBase, sourceDigest: "not-a-digest"},
    {...readyBase, reconciledAt: "2026-07-16"},
  ]) {
    assert.throws(
      () => validateMailStorageStartupState(state, generationOneOptions),
      (error) => error && error.code === "mysql_mail_storage_ready_state_incompatible",
    );
  }
});

test("online and stopped-maintenance writers audit the inert foundation before authority load", () => {
  withFakeMysqlSchema(({fakeMysqlPath, logPath}) => {
    assert.deepEqual(fakeSchemaStore(fakeMysqlPath).load(), {});
    assert.deepEqual(fakeSchemaStore(fakeMysqlPath).load(), {});
    assert.deepEqual(fakeSchemaStore(fakeMysqlPath, {
      usePool: false,
      singleWriterMaintenance: true,
    }).load(), {});
    assert.deepEqual(fakeSchemaStore(fakeMysqlPath, {
      ensureSchema: false,
      usePool: false,
      singleWriterMaintenance: true,
    }).load(), {});
    assert.deepEqual(fakeSchemaStore(fakeMysqlPath, {
      ensureSchema: false,
      usePool: true,
    }).load(), {});

    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map(JSON.parse);
    const foundations = calls.filter(({stdin}) => stdin.includes(
      "CREATE TABLE IF NOT EXISTS mail_storage_control",
    ));
    assert.equal(foundations.length, 3);
    for (const {stdin} of foundations) {
      assert.match(stdin, /^SET SESSION lock_wait_timeout = 5;/);
      assert.match(stdin, /INSERT IGNORE INTO mail_storage_control/);
      assert.doesNotMatch(stdin, /\bALTER\s+TABLE\b/i);
      assert.doesNotMatch(stdin, /\bSET\s+(?:GLOBAL|PERSIST|PERSIST_ONLY)\b/i);
      assert.doesNotMatch(stdin, /\b(?:UPDATE|DELETE)\s+(?:FROM\s+)?mail_(?:active|identity|archive)/i);
    }
    assert.equal(calls.filter(({stdin}) => stdin.includes("AS mail_storage_contract")).length, 5);
    assert.equal(calls.filter(({stdin}) => stdin.includes("FROM mail_storage_control")).length, 5);
  });
});

test("writable store rejects bad contracts, interrupted bootstrap, future generation and unsupported flags", () => {
  withFakeMysqlSchema(({fakeMysqlPath}) => {
    const cases = [
      {
        prepare() {
          process.env.FAKE_MAIL_STORAGE_CONTRACT = expectedContractOutput()
            .trim().split("\n").slice(1).join("\n") + "\n";
        },
        code: "mysql_mail_storage_schema_contract_invalid",
      },
      {
        prepare() {
          process.env.FAKE_MAIL_STORAGE_CONTRACT = expectedContractOutput();
          process.env.FAKE_MAIL_STORAGE_CONTROL = controlOutput({lifecycleState: "building"});
        },
        code: "mysql_mail_storage_bootstrap_in_progress",
      },
      {
        prepare() {
          process.env.FAKE_MAIL_STORAGE_CONTROL = controlOutput({schemaGeneration: 2});
        },
        code: "mysql_mail_storage_schema_generation_future",
      },
      {
        prepare() {
          process.env.FAKE_MAIL_STORAGE_CONTROL = controlOutput({
            dataGeneration: 2,
            lifecycleState: "ready",
            sourceDigest: "c".repeat(64),
            reconciledAt: "2026-07-16T10:30:00.000Z",
          });
        },
        code: "mysql_mail_storage_data_generation_future",
      },
      {
        prepare() {
          process.env.FAKE_MAIL_STORAGE_CONTROL = controlOutput({
            vaultClaimEnabled: true,
          });
        },
        code: "mysql_mail_storage_feature_unsupported",
      },
    ];
    for (const fixture of cases) {
      fixture.prepare();
      assert.throws(
        () => fakeSchemaStore(fakeMysqlPath).load(),
        (error) => error && error.code === fixture.code,
        fixture.code,
      );
      assert.throws(
        () => fakeSchemaStore(fakeMysqlPath, {
          ensureSchema: false,
          usePool: false,
          singleWriterMaintenance: true,
        }).load(),
        (error) => error && error.code === fixture.code,
        `maintenance:${fixture.code}`,
      );
    }
  });
});

test("foundation DDL classifies session metadata-lock and process deadline failures", () => {
  withFakeMysqlSchema(({fakeMysqlPath}) => {
    process.env.FAKE_MAIL_STORAGE_MODE = "lock_timeout";
    assert.throws(
      () => fakeSchemaStore(fakeMysqlPath).load(),
      (error) => error
        && error.code === "mysql_mail_storage_schema_lock_timeout"
        && error.timeoutSeconds === 5,
    );

    process.env.FAKE_MAIL_STORAGE_MODE = "hang";
    assert.throws(
      () => fakeSchemaStore(fakeMysqlPath, {timeoutMs: 50}).load(),
      (error) => error
        && error.code === "mysql_mail_storage_schema_timeout"
        && error.timeoutMs === 50,
    );
  });
});
