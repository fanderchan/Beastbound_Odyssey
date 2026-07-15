"use strict";

const {
  assert,
  crypto,
  fs,
  os,
  path,
  test,
  once,
  createAuthService,
  createMemoryAuthStore,
  createJsonAuthStore,
  createAsyncWriteAuthStore,
  createHttpServer,
  createDefaultStore,
  DEFAULT_COMMAND_CATALOG,
  CLIENT_PROTOCOL_HEADER,
  CLIENT_VERSION_HEADER,
  PROTOCOL_VERSION,
  SERVER_VERSION,
  createMysqlAuthStore,
  createCountingAuthStore,
  testPasswordHash,
  withEnv,
  battleProfile,
  profileItemCount,
  playerRebirthReadyProfile,
  battleProfileWithPets,
  fetchJson,
  eventStreamUrl,
  webSocketOpen,
  webSocketJsonReader,
} = require("../test-support/auth-service-test-context");
const {
  DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES,
  __buildSaveStatementsFromPersistentDataForTest,
  __entityChangedForTest,
  __runMysqlPoolSavePlanForTest,
  mysqlAuthStoreRootContract,
} = require("../src/mysql-store");
const {createPreloadedAuthService} = require("../src/http-server");
const {cloneAuthorityRoot} = require("../src/auth/authority-root-clone");
const {
  ensureConsumedEquipmentEnvelopeIds,
} = require("../src/auth/equipment-envelope-consumed-ledger");
const {
  stageDurableMutationReceipt,
} = require("../src/auth/durable-mutation-state");

const MYSQL_SESSION_POLICY_SQL =
  "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?";

function isDefaultMysqlSessionPolicy(sql, params) {
  if (sql.trim() !== MYSQL_SESSION_POLICY_SQL) {
    return false;
  }
  assert.deepEqual(params, [3, 5]);
  return true;
}

function mysqlLoadTemporaryDirectoryNames() {
  try {
    return fs.readdirSync(os.tmpdir())
      .filter((name) => name.startsWith("beastbound-mysql-load-"))
      .sort();
  } catch {
    return [];
  }
}

function createMysqlCasPoolFixture(options = {}) {
  const state = {
    revision: Number.isSafeInteger(options.revision) ? options.revision : 0,
    profileBindingRows: structuredClone(options.profileBindingRows || []),
    profileRows: structuredClone(options.profileRows || []),
    acquireCount: 0,
    endCalls: 0,
    events: [],
    sessionPolicies: [],
    queriedStatements: [],
    transactions: [],
  };
  const pool = {
    async getConnection() {
      state.acquireCount += 1;
      state.events.push("acquire");
      const transaction = {
        begun: false,
        committed: false,
        rolledBack: false,
        released: false,
        destroyed: false,
        queries: [],
      };
      state.transactions.push(transaction);
      if (typeof options.beforeAcquire === "function") {
        await options.beforeAcquire({state, transaction});
      }
      let pendingRevision = null;
      return {
        async beginTransaction() {
          transaction.begun = true;
          state.events.push("begin");
        },
        async query(statement, params = []) {
          const sql = typeof statement === "string"
            ? statement
            : String(statement && statement.sql || "");
          if (isDefaultMysqlSessionPolicy(sql, params)) {
            state.sessionPolicies.push({
              rowLockWaitTimeoutSeconds: params[0],
              metadataLockWaitTimeoutSeconds: params[1],
            });
            state.events.push("session");
            return [{affectedRows: 0}, []];
          }
          if (/^SET\b/i.test(sql.trim())) {
            const error = new Error(`createMysqlCasPoolFixture 拒绝非默认会话策略：${sql.trim()}`);
            error.code = "mysql_cas_fixture_unsafe_session_sql";
            throw error;
          }
          transaction.queries.push(sql);
          state.queriedStatements.push(sql);
          state.events.push("query");
          if (typeof options.onQuery === "function") {
            const result = await options.onQuery({sql, params, state, transaction});
            if (result !== undefined) {
              return result;
            }
          }
          const normalizedSql = sql.trim();
          if (/^SELECT revision AS storeRevision FROM auth_store_revisions WHERE scope_key = 'auth' FOR (?:UPDATE|SHARE)$/i.test(normalizedSql)) {
            return [[{storeRevision: state.revision}], []];
          }
          if (/^SELECT account_id, player_id, profile_revision FROM profile_bindings ORDER BY account_id FOR UPDATE$/i.test(normalizedSql)) {
            return [structuredClone(state.profileBindingRows), []];
          }
          if (/^SELECT player_id, account_id, profile_revision FROM profiles ORDER BY player_id FOR UPDATE$/i.test(normalizedSql)) {
            return [structuredClone(state.profileRows), []];
          }
          if (/^SELECT account_id, player_id, profile_revision FROM profile_bindings WHERE account_id = \? FOR UPDATE$/i.test(normalizedSql)) {
            return [structuredClone(state.profileBindingRows.filter((row) => (
              String(row.account_id || "") === String(params[0] || "")
            ))), []];
          }
          if (/^SELECT player_id, account_id, profile_revision FROM profiles WHERE player_id = \? FOR UPDATE$/i.test(normalizedSql)) {
            return [structuredClone(state.profileRows.filter((row) => (
              String(row.player_id || "") === String(params[0] || "")
            ))), []];
          }
          if (/^UPDATE auth_store_revisions[\s\S]+scope_key = 'mutation_receipt_capacity'/i.test(normalizedSql)) {
            assert.deepEqual(params, [1, 1]);
            return [{affectedRows: 1}, []];
          }
          const revisionUpdateMatch = normalizedSql.match(
            /^UPDATE auth_store_revisions SET revision = revision \+ 1[\s\S]+AND revision = (\d+)$/i,
          );
          if (revisionUpdateMatch) {
            const expectedRevision = Number(revisionUpdateMatch[1]);
            if (expectedRevision !== state.revision) {
              return [{affectedRows: 0}, []];
            }
            pendingRevision = state.revision + 1;
            return [{affectedRows: 1}, []];
          }
          if (/^(?:INSERT INTO|UPDATE|DELETE FROM) (?:server_state|accounts|profile_bindings|profiles|mail_messages|chat_messages|battle_records|mutation_receipts)\b/i.test(normalizedSql)) {
            return [{affectedRows: 1}, []];
          }
          const error = new Error(`createMysqlCasPoolFixture 未建模 SQL：${normalizedSql}`);
          error.code = "mysql_cas_fixture_unknown_sql";
          throw error;
        },
        async commit() {
          if (typeof options.onCommit === "function") {
            await options.onCommit({state, transaction});
          }
          if (pendingRevision !== null) {
            state.revision = pendingRevision;
          }
          transaction.committed = true;
          state.events.push("commit");
        },
        async rollback() {
          pendingRevision = null;
          transaction.rolledBack = true;
          state.events.push("rollback");
        },
        release() {
          transaction.released = true;
          state.events.push("release");
        },
        destroy() {
          transaction.destroyed = true;
          state.events.push("destroy");
        },
      };
    },
    async end() {
      state.endCalls += 1;
    },
  };
  return {pool, state};
}

test("MySQL CLI loader default is one shared bounded full-history ceiling", () => {
  assert.equal(DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES, 192 * 1024 * 1024);
  assert.ok(DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES > 105_876_464);
});

test("MySQL CLI startup streams private UTF-8 output across file chunks and cleans it", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-stream-load-test-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const stdoutModePath = path.join(tempDir, "stdout-mode.txt");
  const previousModePath = process.env.FAKE_MYSQL_STDOUT_MODE_PATH;
  const beforeTemporaryDirectories = mysqlLoadTemporaryDirectoryNames();
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  if (stdin.includes("FROM information_schema.tables")) {
    process.stdout.write("0\\n");
    return;
  }
  if (!stdin.includes("SELECT 'server_state'")) {
    return;
  }
  fs.writeFileSync(process.env.FAKE_MYSQL_STDOUT_MODE_PATH, String(fs.fstatSync(1).mode & 0o777));
  const stateRow = ["server_state", "auth", JSON.stringify({schemaVersion: 2, storage: "mysql_entity_tables"})].join("\\t") + "\\n";
  const accountPrefix = "accounts\\tacc_stream_utf8\\t" +
    "{\\\"accountId\\\":\\\"acc_stream_utf8\\\",\\\"username\\\":\\\"stream_utf8\\\",\\\"displayName\\\":\\\"";
  const outputPrefix = stateRow + accountPrefix;
  const fillerLength = 65535 - Buffer.byteLength(outputPrefix);
  const accountSuffix = "石器\\\",\\\"role\\\":\\\"player\\\",\\\"createdAt\\\":\\\"2026-07-13T00:00:00.000Z\\\",\\\"updatedAt\\\":\\\"2026-07-13T00:00:00.000Z\\\",\\\"schemaVersion\\\":1}\\n";
  process.stdout.write(outputPrefix + "a".repeat(fillerLength) + accountSuffix);
});
`, {mode: 0o755});
  try {
    process.env.FAKE_MYSQL_STDOUT_MODE_PATH = stdoutModePath;
    const loaded = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
      database: "beastbound_stream_test",
      readOnly: true,
      ensureSchema: false,
      strictRowIdentity: true,
      outputMaxBufferBytes: 128 * 1024,
    }).load();
    assert.equal(loaded.accounts.stream_utf8.accountId, "acc_stream_utf8");
    assert.equal(loaded.accounts.stream_utf8.displayName.endsWith("石器"), true);
    assert.equal(Buffer.byteLength(loaded.accounts.stream_utf8.displayName, "utf8") > 63 * 1024, true);
    assert.equal(Number(fs.readFileSync(stdoutModePath, "utf8")), 0o600);
    assert.deepEqual(mysqlLoadTemporaryDirectoryNames(), beforeTemporaryDirectories);
  } finally {
    if (previousModePath === undefined) {
      delete process.env.FAKE_MYSQL_STDOUT_MODE_PATH;
    } else {
      process.env.FAKE_MYSQL_STDOUT_MODE_PATH = previousModePath;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("MySQL CLI startup rejects oversized file output without leaking or retaining it", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-stream-limit-test-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const beforeTemporaryDirectories = mysqlLoadTemporaryDirectoryNames();
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  if (stdin.includes("FROM information_schema.tables")) {
    process.stdout.write("0\\n");
    return;
  }
  if (stdin.includes("SELECT 'server_state'")) {
    process.stdout.write("never-expose-this-row:" + "x".repeat(2048));
  }
});
`, {mode: 0o755});
  try {
    assert.throws(
      () => createMysqlAuthStore({
        mysqlPath: fakeMysqlPath,
        database: "beastbound_stream_limit_test",
        readOnly: true,
        ensureSchema: false,
        outputMaxBufferBytes: 512,
      }).load(),
      (error) => {
        assert.equal(error.code, "mysql_output_limit_exceeded");
        assert.equal(error.message, "MySQL 持久化数据输出超过安全上限。");
        assert.doesNotMatch(error.message, /never-expose|beastbound_stream_limit_test|fake-mysql/);
        return true;
      },
    );
    assert.deepEqual(mysqlLoadTemporaryDirectoryNames(), beforeTemporaryDirectories);
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("server startup preloads and consumes one isolated store document exactly once", () => {
  let loadCalls = 0;
  const initialData = {
    schemaVersion: 1,
    accounts: {
      preloaduser: {
        accountId: "acc_preloaduser",
        username: "preloaduser",
        displayName: "启动预载",
        role: "player",
        createdAt: "2026-07-13T00:00:00.000Z",
        updatedAt: "2026-07-13T00:00:00.000Z",
      },
    },
    sessions: {},
  };
  const store = {
    mode: "preload-observer",
    load() {
      loadCalls += 1;
      if (loadCalls > 1) {
        throw new Error("startup must not issue a discarded second load");
      }
      return initialData;
    },
    save() {},
  };

  const service = createPreloadedAuthService(store);
  assert.equal(loadCalls, 1);
  initialData.accounts.preloaduser.displayName = "调用方随后篡改";
  assert.equal(service.snapshot().accounts.preloaduser.displayName, "启动预载");
  assert.equal(loadCalls, 1);
  assert.throws(
    () => createPreloadedAuthService({load() { throw new Error("injected preload failure"); }}),
    /injected preload failure/,
  );
});

test("writable MySQL startup installs and validates durable battle history order idempotently", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-history-sequence-schema-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const statePath = path.join(tempDir, "schema-state.json");
  const logPath = path.join(tempDir, "calls.jsonl");
  const previousStatePath = process.env.FAKE_MYSQL_SCHEMA_STATE;
  const previousLogPath = process.env.FAKE_MYSQL_LOG;
  fs.writeFileSync(statePath, JSON.stringify({tables: {}}));
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
  const state = JSON.parse(fs.readFileSync(process.env.FAKE_MYSQL_SCHEMA_STATE, "utf8"));
  if (stdin.includes("FROM information_schema.columns AS history_column")) {
    const match = stdin.match(/history_column\\.table_name = '([^']+)'/);
    const value = state.tables[match && match[1]];
    if (value === "invalid") {
      process.stdout.write("1\\tbigint\\tYES\\t\\t0\\n");
    } else if (value === true) {
      process.stdout.write("1\\tbigint unsigned\\tNO\\tauto_increment\\t1\\n");
    } else {
      process.stdout.write("0\\t\\t\\t\\t0\\n");
    }
    return;
  }
  const alter = stdin.match(/ALTER TABLE (battle_records|battle_trace)/);
  if (alter) {
    state.tables[alter[1]] = true;
    fs.writeFileSync(process.env.FAKE_MYSQL_SCHEMA_STATE, JSON.stringify(state));
    return;
  }
  if (stdin.includes("SELECT 'server_state'")) {
    process.stdout.write(["server_state", "auth", JSON.stringify({schemaVersion: 2, storage: "mysql_entity_tables"})].join("\\t") + "\\n");
  }
});
`, {mode: 0o755});
  try {
    process.env.FAKE_MYSQL_SCHEMA_STATE = statePath;
    process.env.FAKE_MYSQL_LOG = logPath;
    const options = {
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "writer",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
    };
    assert.equal(createMysqlAuthStore(options).load().schemaVersion, 1);
    assert.equal(createMysqlAuthStore(options).load().schemaVersion, 1);

    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const ddl = calls.filter((call) => call.stdin.includes("CREATE TABLE IF NOT EXISTS battle_records"));
    const contracts = calls.filter((call) => call.stdin.includes("FROM information_schema.columns AS history_column"));
    const alters = calls.filter((call) => /ALTER TABLE (battle_records|battle_trace)/.test(call.stdin));
    assert.equal(ddl.length, 2);
    assert.equal(contracts.length, 4);
    assert.equal(alters.length, 2, "only the first startup migrates each table");
    assert.match(ddl[0].stdin, /history_seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT/);
    assert.match(ddl[0].stdin, /UNIQUE KEY uq_battle_records_history_seq \(history_seq\)/);
    assert.match(ddl[0].stdin, /UNIQUE KEY uq_battle_trace_history_seq \(history_seq\)/);
    assert.ok(alters.every((call) => /ALGORITHM=INPLACE[\s\S]*LOCK=SHARED/.test(call.stdin)));

    fs.writeFileSync(statePath, JSON.stringify({tables: {battle_records: "invalid", battle_trace: true}}));
    assert.throws(
      () => createMysqlAuthStore(options).load(),
      (error) => error.code === "mysql_history_sequence_contract_invalid",
    );
  } finally {
    if (previousStatePath === undefined) {
      delete process.env.FAKE_MYSQL_SCHEMA_STATE;
    } else {
      process.env.FAKE_MYSQL_SCHEMA_STATE = previousStatePath;
    }
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("MySQL diff skips serialization only for an identical committed entity", () => {
  const identical = {
    accountId: "acc_identity_skip",
    nested: {value: 1},
    toJSON() {
      throw new Error("identical entity must not be serialized");
    },
  };
  assert.equal(__entityChangedForTest(identical, identical), false);
  assert.equal(
    __entityChangedForTest(
      {accountId: "acc_identity_fallback", nested: {value: 1}},
      {accountId: "acc_identity_fallback", nested: {value: 1}},
    ),
    false,
  );
  assert.equal(
    __entityChangedForTest(
      {accountId: "acc_identity_changed", nested: {value: 1}},
      {accountId: "acc_identity_changed", nested: {value: 2}},
    ),
    true,
  );
});

test("MySQL unrelated saves do not scan shared immutable history arrays", () => {
  const untouchedHistoryEntry = new Proxy({}, {
    get() {
      throw new Error("shared history entry must not be inspected");
    },
    ownKeys() {
      throw new Error("shared history entry must not be serialized");
    },
  });
  const battleRecords = Object.freeze([untouchedHistoryEntry]);
  const battleTrace = Object.freeze([untouchedHistoryEntry]);
  const serviceEvents = Object.freeze([untouchedHistoryEntry]);
  const previous = {
    schemaVersion: 1,
    accounts: {},
    battleRecords,
    battleTrace,
    serviceEvents,
    serviceEventSeq: 1,
  };
  const next = {
    ...previous,
    accounts: {
      identity_skip_user: {
        accountId: "acc_identity_skip_user",
        username: "identity_skip_user",
        displayName: "共享历史短路测试",
        role: "player",
        createdAt: "2026-07-13T00:00:00.000Z",
        updatedAt: "2026-07-13T00:00:00.000Z",
      },
    },
  };

  const statements = __buildSaveStatementsFromPersistentDataForTest(next, previous);
  assert.equal(statements.some((statement) => statement.includes("INSERT INTO accounts")), true);
  assert.equal(statements.some((statement) => /\b(battle_records|battle_trace|service_events)\b/.test(statement)), false);
});

test("MySQL battle history is append-only across normalization and hot-window eviction", () => {
  const previous = {
    schemaVersion: 1,
    battleRecords: [
      {recordId: "battle_record_evicted", futureServerField: {mustSurvive: true}},
      {recordId: "battle_record_existing", roomId: "room_existing", futureServerField: {mustSurvive: true}},
    ],
    battleTrace: [
      {traceId: "battle_trace_evicted", futureServerField: {mustSurvive: true}},
      {traceId: "battle_trace_existing", roomId: "room_existing", futureServerField: {mustSurvive: true}},
    ],
    serviceEventSeq: 0,
    serviceEvents: [],
  };
  const next = {
    ...previous,
    // The evicted rows are no longer resident, while normalization has rebuilt
    // the existing rows without fields unknown to this server build.
    battleRecords: [
      {recordId: "battle_record_existing", roomId: "room_existing", schemaVersion: 1},
      {recordId: "battle_record_new", roomId: "room_new", endedAt: "2026-07-13T08:00:00.000Z"},
    ],
    battleTrace: [
      {traceId: "battle_trace_existing", roomId: "room_existing", schemaVersion: 1},
      {traceId: "battle_trace_new", roomId: "room_new", type: "battle_room_closed", createdAt: "2026-07-13T08:00:00.000Z"},
    ],
  };

  const statements = __buildSaveStatementsFromPersistentDataForTest(next, previous);
  const historyStatements = statements.filter((statement) => /\b(battle_records|battle_trace)\b/.test(statement));
  assert.equal(historyStatements.length, 2);
  assert.match(historyStatements[0], /^INSERT INTO battle_records /);
  assert.match(historyStatements[0], /'battle_record_new'/);
  assert.match(historyStatements[1], /^INSERT INTO battle_trace /);
  assert.match(historyStatements[1], /'battle_trace_new'/);
  assert.equal(historyStatements.some((statement) => /\bDELETE\b|ON DUPLICATE KEY UPDATE/.test(statement)), false);
  assert.equal(historyStatements.some((statement) => /battle_(record|trace)_(?:existing|evicted)/.test(statement)), false);
  assert.equal(historyStatements.some((statement) => statement.includes("futureServerField")), false);
});

test("MySQL new mail, listing, and equipment tombstone IDs use strict inserts", () => {
  const previous = {
    schemaVersion: 1,
    mailMessages: {
      mail_known: {
        mailId: "mail_known",
        senderAccountId: "system",
        recipientAccountId: "acc_strict_insert",
        title: "旧邮件标题",
        createdAt: "2026-07-15T00:00:00.000Z",
        readAt: null,
      },
    },
    marketListings: {
      listing_known: {
        listingId: "listing_known",
        sellerAccountId: "acc_strict_insert",
        itemId: "item_known",
        currency: "stoneCoins",
        unitPrice: 10,
        count: 1,
        createdAt: "2026-07-15T00:00:00.000Z",
      },
    },
    consumedEquipmentEnvelopes: {},
  };
  const next = structuredClone(previous);
  next.mailMessages.mail_known.title = "已知邮件更新";
  next.mailMessages.mail_new = {
    mailId: "mail_new",
    senderAccountId: "system",
    recipientAccountId: "acc_strict_insert",
    title: "全新邮件",
    createdAt: "2026-07-15T00:01:00.000Z",
    readAt: null,
  };
  next.marketListings.listing_known.unitPrice = 11;
  next.marketListings.listing_new = {
    listingId: "listing_new",
    sellerAccountId: "acc_strict_insert",
    itemId: "item_new",
    currency: "stoneCoins",
    unitPrice: 20,
    count: 1,
    createdAt: "2026-07-15T00:01:00.000Z",
  };
  const envelopeId = "eqx_store_strict_insert_0001";
  next.consumedEquipmentEnvelopes[envelopeId] = {schemaVersion: 1, envelopeId};

  const statements = __buildSaveStatementsFromPersistentDataForTest(next, previous);
  const statementFor = (id) => statements.find((statement) => statement.includes(`'${id}'`));
  const newMail = statementFor("mail_new");
  const knownMail = statementFor("mail_known");
  const newListing = statementFor("listing_new");
  const knownListing = statementFor("listing_known");
  const newTombstone = statementFor(envelopeId);

  for (const statement of [newMail, knownMail, newListing, knownListing, newTombstone]) {
    assert.equal(typeof statement, "string");
    assert.match(statement, /^INSERT INTO /);
  }
  assert.doesNotMatch(newMail, /ON DUPLICATE KEY UPDATE/);
  assert.match(knownMail, /ON DUPLICATE KEY UPDATE/);
  assert.doesNotMatch(newListing, /ON DUPLICATE KEY UPDATE/);
  assert.match(knownListing, /ON DUPLICATE KEY UPDATE/);
  assert.doesNotMatch(newTombstone, /ON DUPLICATE KEY UPDATE/);
});

test("mysql auth store root contract classifies every snapshot field exactly once", () => {
  const contract = mysqlAuthStoreRootContract();
  const expectedPersistentFields = [
    "accounts",
    "authEvents",
    "battleRecords",
    "battleTrace",
    "chatMessages",
    "consumedEquipmentEnvelopes",
    "families",
    "gmCommandAudit",
    "gmCommandGrants",
    "gmUserGrants",
    "mailMessages",
    "manorBattles",
    "manorWars",
    "manors",
    "marketConfig",
    "marketListings",
    "mutationReceipts",
    "offlineHangConfig",
    "parties",
    "profileBindings",
    "profiles",
    "schemaVersion",
    "serviceEventSeq",
    "serviceEvents",
    "sessions",
  ];
  const expectedRuntimeOnlyFields = [
    "battleInvites",
    "battleRooms",
    "battleRoomRecoveries",
    "battleRoomRecoveryByAccountId",
    "partyInvites",
    "playerPositions",
    "tradeOffers",
  ];

  assert.deepEqual(contract.persistentFields, expectedPersistentFields);
  assert.deepEqual(contract.runtimeOnlyFields, expectedRuntimeOnlyFields);
  assert.deepEqual(contract.snapshotFields, [...expectedPersistentFields, ...expectedRuntimeOnlyFields].sort());
  assert.equal(contract.persistentFields.length, 25);
  assert.equal(new Set([...contract.persistentFields, ...contract.runtimeOnlyFields]).size, contract.snapshotFields.length);
  assert.deepEqual(contract.profileDocumentFields, [
    "playerId",
    "accountId",
    "profileRevision",
    "updatedAt",
    "profile",
  ]);
  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.snapshotFields), true);
  assert.equal(Object.isFrozen(contract.persistentFields), true);
  assert.equal(Object.isFrozen(contract.runtimeOnlyFields), true);
  assert.equal(Object.isFrozen(contract.profileDocumentFields), true);
});

test("mysql loader fails closed when protected SQL keys disagree with JSON identities", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-row-identity-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  if (stdin.includes("information_schema.tables")) {
    process.stdout.write("0\\n");
    return;
  }
  const bucket = process.env.FAKE_IDENTITY_BUCKET;
  const document = process.env.FAKE_IDENTITY_ARRAY === "1"
    ? []
    : bucket === "accounts"
      ? {accountId: "acc_document", username: "mismatch"}
      : bucket === "profile_bindings"
        ? {accountId: "acc_document", playerId: "player_mismatch", profileRevision: 1}
        : bucket === "mutation_receipts"
          ? {operationId: "operation_document", schemaVersion: 1}
          : {eventId: "event_document", type: "login", username: "mismatch"};
  const rows = [
    ["server_state", "auth", {schemaVersion: 2, storage: "mysql_entity_tables"}],
    [bucket, process.env.FAKE_IDENTITY_ROW_KEY, document],
  ];
  process.stdout.write(rows.map((row) => [row[0], row[1], JSON.stringify(row[2])].join("\\t")).join("\\n") + "\\n");
});
  `, {mode: 0o755});
  const previousBucket = process.env.FAKE_IDENTITY_BUCKET;
  const previousRowKey = process.env.FAKE_IDENTITY_ROW_KEY;
  const previousArray = process.env.FAKE_IDENTITY_ARRAY;
  try {
    for (const [bucket, rowKey, arrayDocument, strictRowIdentity] of [
      ["accounts", "acc_sql", false, true],
      ["profile_bindings", "acc_sql", false, true],
      // Durable receipts always validate their SQL/document identity, even on
      // the normal startup loader where the broader migration audit is off.
      ["mutation_receipts", "operation_sql", false, false],
      ["auth_events", "event_sql", false, true],
      ["auth_events", "event_array", true, true],
    ]) {
      process.env.FAKE_IDENTITY_BUCKET = bucket;
      process.env.FAKE_IDENTITY_ROW_KEY = rowKey;
      process.env.FAKE_IDENTITY_ARRAY = arrayDocument ? "1" : "0";
      const store = createMysqlAuthStore({
        mysqlPath: fakeMysqlPath,
        host: "127.0.0.1",
        port: 3306,
        user: "reader",
        password: "secret",
        database: "beastbound_test",
        createDatabase: false,
        readOnly: true,
        ensureSchema: false,
        strictRowIdentity,
      });
      assert.throws(
        () => store.load(),
        new RegExp(arrayDocument
          ? `MySQL持久化行文档非法：${bucket}/${rowKey}`
          : `MySQL持久化行身份不一致：${bucket}/${rowKey}`),
      );
    }
  } finally {
    if (previousBucket === undefined) {
      delete process.env.FAKE_IDENTITY_BUCKET;
    } else {
      process.env.FAKE_IDENTITY_BUCKET = previousBucket;
    }
    if (previousRowKey === undefined) {
      delete process.env.FAKE_IDENTITY_ROW_KEY;
    } else {
      process.env.FAKE_IDENTITY_ROW_KEY = previousRowKey;
    }
    if (previousArray === undefined) {
      delete process.env.FAKE_IDENTITY_ARRAY;
    } else {
      process.env.FAKE_IDENTITY_ARRAY = previousArray;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("mysql store sends generated SQL through stdin", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-store-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const logPath = path.join(tempDir, "calls.jsonl");
  const previousLogPath = process.env.FAKE_MYSQL_LOG;
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdin += chunk;
});
process.stdin.on("end", () => {
    fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({
      argv: process.argv.slice(2),
      stdin,
      stdinLength: stdin.length,
      hasExecuteArg: process.argv.slice(2).includes("-e"),
      hasServerState: stdin.includes("INSERT INTO server_state"),
      hasMutationReceipts: stdin.includes("INSERT INTO mutation_receipts"),
      hasBattleRecords: stdin.includes("INSERT INTO battle_records"),
      hasFamilies: stdin.includes("INSERT INTO families"),
      hasManors: stdin.includes("INSERT INTO manors"),
      hasManorWars: stdin.includes("INSERT INTO manor_wars"),
      hasManorBattles: stdin.includes("INSERT INTO manor_battles"),
    }) + "\\n");
    if (stdin.includes("SELECT 'server_state'")) {
      process.stdout.write("store_revision\\tauth\\t0\\n");
    }
});
`, {"mode": 0o755});
  try {
    process.env.FAKE_MYSQL_LOG = logPath;
    const store = createMysqlAuthStore({
      "mysqlPath": fakeMysqlPath,
      "host": "127.0.0.1",
      "port": 3306,
      "user": "tester",
      "password": "secret",
      "database": "beastbound_test",
      "createDatabase": false,
      "singleWriterMaintenance": true,
    });
    store.save({
      "accounts": {
        "mysqlprobe": {
          "accountId": "acc_mysqlprobe",
          "username": "mysqlprobe",
          "displayName": "MySQL探针",
          "role": "player",
          "createdAt": "2026-06-30T00:00:00.000Z",
          "updatedAt": "2026-06-30T00:00:00.000Z",
          "note": "x".repeat(4096),
        },
      },
      "sessions": {},
      "profileBindings": {},
      "profiles": {},
      "mutationReceipts": {
        "operation_mysqlprobe_0001": {
          "schemaVersion": 1,
          "operationId": "operation_mysqlprobe_0001",
          "requestHash": "a".repeat(64),
          "actionId": "profile.action",
          "accountId": "acc_mysqlprobe",
          "committedAt": "2026-06-30T00:00:00.000Z",
          "expiresAt": "2026-07-01T00:00:00.000Z",
          "response": {"ok": true},
        },
      },
      "battleRecords": [
        {
          "recordId": "battle_record_mysqlprobe",
          "roomId": "battle_room_mysqlprobe",
          "mode": "duel",
          "reason": "leave",
          "winnerAccountId": "acc_mysqlprobe",
          "loserAccountIds": ["acc_other"],
          "closedByAccountId": "acc_other",
          "participantAccountIds": ["acc_mysqlprobe", "acc_other"],
          "participants": [],
          "round": 1,
          "turnSeq": 1,
          "startedAt": "2026-06-30T00:00:00.000Z",
          "endedAt": "2026-06-30T00:01:00.000Z",
          "durationSeconds": 60,
          "schemaVersion": 1,
        },
      ],
      "families": {
        "family_mysqlprobe": {
          "familyId": "family_mysqlprobe",
          "name": "MySQL家族",
          "leaderAccountId": "acc_mysqlprobe",
          "memberAccountIds": ["acc_mysqlprobe"],
          "fame": 20,
          "manorIds": ["firebud_manor"],
          "createdAt": "2026-06-30T00:00:00.000Z",
          "updatedAt": "2026-06-30T00:00:00.000Z",
          "schemaVersion": 1,
        },
      },
      "manors": {
        "firebud_manor": {
          "manorId": "firebud_manor",
          "ownerFamilyId": "family_mysqlprobe",
          "ownerFamilyName": "MySQL家族",
          "occupiedAt": "2026-06-30T00:00:00.000Z",
          "updatedAt": "2026-06-30T00:00:00.000Z",
          "schemaVersion": 1,
        },
      },
      "manorBattles": [
        {
          "battleId": "manor_battle_mysqlprobe",
          "manorId": "firebud_manor",
          "challengerFamilyId": "family_mysqlprobe",
          "defenderFamilyId": "",
          "winnerFamilyId": "family_mysqlprobe",
          "result": "challenger_win",
          "createdAt": "2026-06-30T00:00:00.000Z",
          "schemaVersion": 1,
        },
      ],
      "manorWars": [
        {
          "warId": "manor_war_mysqlprobe",
          "manorId": "firebud_manor",
          "manorName": "火芽庄园",
          "challengerFamilyId": "family_mysqlprobe",
          "challengerFamilyName": "MySQL家族",
          "defenderFamilyId": "",
          "defenderFamilyName": "庄园守备队",
          "challengerPower": 500,
          "defenderPower": 260,
          "status": "resolved",
          "declaredAt": "2026-06-30T00:00:00.000Z",
          "startsAt": "2026-06-30T00:00:00.000Z",
          "endsAt": "2026-06-30T00:30:00.000Z",
          "resolvedAt": "2026-06-30T00:00:00.000Z",
          "battleId": "manor_battle_mysqlprobe",
          "winnerFamilyId": "family_mysqlprobe",
          "winnerFamilyName": "MySQL家族",
          "result": "challenger_win",
          "schemaVersion": 1,
        },
      ],
      "authEvents": [],
      "serviceEvents": [],
    });
    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.ok(calls.length >= 2);
    assert.ok(calls.every((call) => call.hasExecuteArg === false));
    assert.ok(calls.some((call) => call.hasServerState));
    assert.ok(calls.some((call) => call.hasMutationReceipts));
    assert.ok(calls.some((call) => call.hasBattleRecords));
    assert.ok(calls.some((call) => call.hasFamilies));
    assert.ok(calls.some((call) => call.hasManors));
    assert.ok(calls.some((call) => call.hasManorWars));
    assert.ok(calls.some((call) => call.hasManorBattles));
    assert.ok(calls.some((call) => /CREATE TABLE IF NOT EXISTS consumed_equipment_envelopes/.test(call.stdin)));
    assert.ok(calls.some((call) => /CREATE TABLE IF NOT EXISTS mutation_receipts/.test(call.stdin)));
    assert.ok(calls.some((call) => /CREATE TABLE IF NOT EXISTS party_invites/.test(call.stdin)));
    assert.ok(calls.some((call) => /operation_id VARCHAR\(160\) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY/.test(call.stdin)));
    assert.ok(calls.some((call) => /VARCHAR\(160\) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY/.test(call.stdin)));
    assert.ok(calls.some((call) => call.stdinLength > 4096));
    const saveCall = calls.find((call) => String(call.stdin || "").includes("START TRANSACTION"));
    assert.ok(saveCall);
    assert.equal(/\bDELETE FROM accounts\b/.test(saveCall.stdin), false);
    assert.equal(/\bDELETE FROM sessions\b/.test(saveCall.stdin), false);
    assert.equal(saveCall.stdin.includes("INSERT INTO player_positions"), false);
    assert.equal(saveCall.stdin.includes("INSERT INTO battle_rooms"), false);
    assert.equal(saveCall.stdin.includes("INSERT INTO battle_invites"), false);
    assert.ok(saveCall.stdin.includes("mysql_entity_tables"));
    assert.match(saveCall.stdin, /UPDATE auth_store_revisions SET revision = revision \+ 1 WHERE scope_key = 'auth'/);
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {"recursive": true, "force": true});
  }
});

test("writable mysql startup purges legacy party invites once without loading them", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-party-invite-cleanup-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const logPath = path.join(tempDir, "calls.jsonl");
  const previousLogPath = process.env.FAKE_MYSQL_LOG;
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
  if (!stdin.includes("SELECT 'server_state'")) {
    return;
  }
  const rows = [
    ["server_state", "auth", {schemaVersion: 2, storage: "mysql_entity_tables"}],
  ];
  if (stdin.includes("FROM party_invites")) {
    rows.push(["party_invites", "legacy_party_invite", {
      inviteId: "legacy_party_invite",
      partyId: "legacy_party",
      fromAccountId: "acc_legacy_a",
      toAccountId: "acc_legacy_b",
      status: "accepted",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:01.000Z",
      schemaVersion: 1,
    }]);
  }
  process.stdout.write(rows.map((row) => [row[0], row[1], JSON.stringify(row[2])].join("\\t")).join("\\n") + "\\n");
});
`, {mode: 0o755});
  try {
    process.env.FAKE_MYSQL_LOG = logPath;
    const store = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "writer",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
      ensureSchema: false,
    });

    assert.deepEqual(store.load().partyInvites, {});
    assert.deepEqual(store.load().partyInvites, {});

    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(calls.filter((call) => /^DELETE FROM party_invites\s*;?\s*$/i.test(call.stdin)).length, 1);
    assert.equal(calls.some((call) => /SELECT 'party_invites'/.test(call.stdin)), false);
    assert.equal(calls.some((call) => /INSERT INTO party_invites/.test(call.stdin)), false);
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("read-only mysql store loads without schema DDL and rejects every save", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-read-only-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const logPath = path.join(tempDir, "calls.jsonl");
  const previousLogPath = process.env.FAKE_MYSQL_LOG;
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
});
`, {mode: 0o755});
  try {
    process.env.FAKE_MYSQL_LOG = logPath;
    const store = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "reader",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
      readOnly: true,
      ensureSchema: false,
    });
    assert.deepEqual(store.load(), {});
    assert.throws(() => store.save({}), /Read-only MySQL auth store cannot save/);
    await assert.rejects(store.saveAsync({}), /Read-only MySQL auth store cannot save/);
    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(calls.length, 3);
    assert.match(calls[0].stdin, /information_schema\.tables/);
    assert.match(calls[1].stdin, /information_schema\.tables/);
    assert.match(calls[2].stdin, /SELECT 'server_state'/);
    assert.doesNotMatch(calls[2].stdin, /consumed_equipment_envelopes/);
    assert.doesNotMatch(calls[2].stdin, /mutation_receipts/);
    assert.doesNotMatch(calls[2].stdin, /SELECT 'party_invites'/);
    assert.equal(calls.some((call) => /CREATE TABLE|CREATE DATABASE|START TRANSACTION|DELETE FROM party_invites/.test(call.stdin)), false);
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("read-only mysql store loads consumed tombstones when the optional table exists", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-read-only-ledger-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const logPath = path.join(tempDir, "calls.jsonl");
  const previousLogPath = process.env.FAKE_MYSQL_LOG;
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
  if (stdin.includes("information_schema.tables")) {
    process.stdout.write("1\\n");
    return;
  }
  if (stdin.includes("SELECT 'server_state'")) {
    const rows = [
      ["server_state", "auth", {schemaVersion: 2, storage: "mysql_entity_tables"}],
      ["consumed_equipment_envelopes", "eqx_store_read_only_0001", {schemaVersion: 1, envelopeId: "eqx_store_read_only_0001"}],
    ];
    process.stdout.write(rows.map((row) => [row[0], row[1], JSON.stringify(row[2])].join("\\t")).join("\\n") + "\\n");
  }
});
`, {mode: 0o755});
  try {
    process.env.FAKE_MYSQL_LOG = logPath;
    const store = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "reader",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
      readOnly: true,
      ensureSchema: false,
    });
    const loaded = store.load();
    assert.deepEqual(loaded.consumedEquipmentEnvelopes.eqx_store_read_only_0001, {
      schemaVersion: 1,
      envelopeId: "eqx_store_read_only_0001",
    });
    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(calls.length, 3);
    assert.match(calls[0].stdin, /information_schema\.tables/);
    assert.match(calls[1].stdin, /information_schema\.tables/);
    assert.match(calls[2].stdin, /FROM consumed_equipment_envelopes ORDER BY envelope_id/);
    assert.match(calls[2].stdin, /FROM mutation_receipts ORDER BY operation_id/);
    assert.equal(calls.some((call) => /CREATE TABLE|START TRANSACTION/.test(call.stdin)), false);
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("mysql entity state preserves configs even when every entity table is empty", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-state-only-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  if (stdin.includes("SELECT 'server_state'")) {
    process.stdout.write(["server_state", "auth", JSON.stringify({
      storage: "mysql_entity_tables",
      schemaVersion: 2,
      marketConfig: {taxBps: 750},
      offlineHangConfig: {rewardRateBps: 5000},
    })].join("\\t") + "\\n");
  }
});
`, {mode: 0o755});
  try {
    const store = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "reader",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
      readOnly: true,
    });
    const loaded = store.load();
    assert.deepEqual(loaded.marketConfig, {taxBps: 750});
    assert.deepEqual(loaded.offlineHangConfig, {rewardRateBps: 5000});
    assert.deepEqual(loaded.accounts, {});
    assert.deepEqual(loaded.profiles, {});
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("mysql store loads legacy state documents larger than the Node default buffer", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-store-load-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdin += chunk;
});
process.stdin.on("end", () => {
  if (!stdin.includes("SELECT 'server_state'")) {
    return;
  }
  const largeNote = "x".repeat(2 * 1024 * 1024);
  process.stdout.write(["server_state", "auth", JSON.stringify({
    accounts: {
      biguser: {
        accountId: "acc_biguser",
        username: "biguser",
        displayName: "Big User",
        role: "player",
        createdAt: "2026-06-30T00:00:00.000Z",
        updatedAt: "2026-06-30T00:00:00.000Z",
        note: largeNote,
      },
    },
    sessions: {},
    profileBindings: {},
    profiles: {},
    authEvents: [],
    serviceEvents: [],
  })].join("\\t") + "\\n");
});
`, {"mode": 0o755});
  try {
    const store = createMysqlAuthStore({
      "mysqlPath": fakeMysqlPath,
      "host": "127.0.0.1",
      "port": 3306,
      "user": "tester",
      "password": "",
      "database": "beastbound_test",
      "createDatabase": false,
    });
    const loaded = store.load();
    assert.equal(Object.keys(loaded.accounts || {}).length, 1);
    assert.equal(loaded.accounts.biguser.note.length, 2 * 1024 * 1024);
  } finally {
    fs.rmSync(tempDir, {"recursive": true, "force": true});
  }
});

test("mysql loader reads only the newest bounded battle history windows", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-battle-history-window-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const logPath = path.join(tempDir, "calls.jsonl");
  const previousLogPath = process.env.FAKE_MYSQL_LOG;
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
  if (stdin.includes("information_schema.tables")) {
    process.stdout.write("0\\n");
    return;
  }
  if (!stdin.includes("SELECT 'server_state'")) {
    return;
  }
  const rows = [["server_state", "auth", {schemaVersion: 2, storage: "mysql_entity_tables"}]];
  for (let index = 0; index < 10005; index += 1) {
    const suffix = String(index).padStart(5, "0");
    rows.push(["battle_records", "battle_record_" + suffix, {
      recordId: "battle_record_" + suffix,
      endedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      futureServerField: {index},
    }]);
  }
  for (let index = 0; index < 1205; index += 1) {
    const suffix = String(index).padStart(5, "0");
    rows.push(["battle_trace", "battle_trace_" + suffix, {
      traceId: "battle_trace_" + suffix,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      futureServerField: {index},
    }]);
  }
  process.stdout.write(rows.map((row) => [row[0], row[1], JSON.stringify(row[2])].join("\\t")).join("\\n") + "\\n");
});
`, {mode: 0o755});
  try {
    process.env.FAKE_MYSQL_LOG = logPath;
    const store = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "reader",
      password: "secret",
      database: "beastbound_test",
      readOnly: true,
    });
    const loaded = store.load();
    assert.equal(loaded.battleRecords.length, 10000);
    assert.equal(loaded.battleRecords[0].recordId, "battle_record_00005");
    assert.equal(loaded.battleRecords.at(-1).recordId, "battle_record_10004");
    assert.equal(loaded.battleTrace.length, 1200);
    assert.equal(loaded.battleTrace[0].traceId, "battle_trace_00005");
    assert.equal(loaded.battleTrace.at(-1).traceId, "battle_trace_01204");

    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const loadSql = calls.find((call) => call.stdin.includes("SELECT 'server_state'")).stdin;
    assert.match(loadSql, /FROM \(SELECT history_seq, record_id, document_json FROM battle_records ORDER BY history_seq DESC LIMIT 10000\) AS recent_battle_records ORDER BY history_seq/);
    assert.match(loadSql, /FROM \(SELECT history_seq, trace_id, document_json FROM battle_trace ORDER BY history_seq DESC LIMIT 1200\) AS recent_battle_trace ORDER BY history_seq/);
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("full battle history windows preserve durable append order across equal and backdated timestamps", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-battle-history-sequence-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const statePath = path.join(tempDir, "history-state.json");
  const logPath = path.join(tempDir, "calls.jsonl");
  const previousStatePath = process.env.FAKE_MYSQL_HISTORY_STATE;
  const previousLogPath = process.env.FAKE_MYSQL_LOG;
  const sameTimestamp = "2026-07-13T09:00:00.000Z";
  const state = {
    revision: 0,
    nextRecordSeq: 10001,
    nextTraceSeq: 1201,
    records: Array.from({length: 10000}, (_, index) => ({
      seq: index + 1,
      document: {
        recordId: `battle_record_sequence_${String(index).padStart(5, "0")}`,
        roomId: `room_sequence_${String(index).padStart(5, "0")}`,
        mode: "duel",
        reason: "fixture",
        participantAccountIds: ["acc_sequence_a", "acc_sequence_b"],
        loserAccountIds: ["acc_sequence_b"],
        endedAt: sameTimestamp,
        futureServerField: {mustSurviveColdStorage: index === 0},
        schemaVersion: 1,
      },
    })),
    trace: Array.from({length: 1200}, (_, index) => ({
      seq: index + 1,
      document: {
        traceId: `battle_trace_sequence_${String(index).padStart(5, "0")}`,
        roomId: `room_sequence_${String(index).padStart(5, "0")}`,
        type: "fixture_trace",
        createdAt: sameTimestamp,
        schemaVersion: 1,
      },
    })),
  };
  fs.writeFileSync(statePath, JSON.stringify(state));
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
  if (stdin.includes("information_schema.tables")) {
    process.stdout.write(stdin.includes("auth_store_revisions") ? "1\\n" : "0\\n");
    return;
  }
  const state = JSON.parse(fs.readFileSync(process.env.FAKE_MYSQL_HISTORY_STATE, "utf8"));
  if (stdin.includes("SELECT 'server_state'")) {
    const rows = [
      ["store_revision", "auth", state.revision],
      ["server_state", "auth", {schemaVersion: 2, storage: "mysql_entity_tables"}],
    ];
    for (const entry of state.records.slice().sort((left, right) => left.seq - right.seq).slice(-10000)) {
      rows.push(["battle_records", entry.document.recordId, entry.document]);
    }
    for (const entry of state.trace.slice().sort((left, right) => left.seq - right.seq).slice(-1200)) {
      rows.push(["battle_trace", entry.document.traceId, entry.document]);
    }
    process.stdout.write(rows.map((row) => [row[0], row[1], JSON.stringify(row[2])].join("\\t")).join("\\n") + "\\n");
    return;
  }
  if (stdin.includes("START TRANSACTION")) {
    if (stdin.includes("UPDATE auth_store_revisions SET revision = revision + 1")) {
      state.revision += 1;
    }
    if (stdin.includes("'battle_record_sequence_backdated_new'")) {
      state.records.push({
        seq: state.nextRecordSeq++,
        document: {
          recordId: "battle_record_sequence_backdated_new",
          roomId: "room_sequence_backdated_new",
          mode: "duel",
          reason: "backdated_fixture",
          participantAccountIds: ["acc_sequence_a", "acc_sequence_b"],
          loserAccountIds: ["acc_sequence_b"],
          endedAt: "2020-01-01T00:00:00.000Z",
          schemaVersion: 1,
        },
      });
    }
    if (stdin.includes("'battle_trace_sequence_backdated_new'")) {
      state.trace.push({
        seq: state.nextTraceSeq++,
        document: {
          traceId: "battle_trace_sequence_backdated_new",
          roomId: "room_sequence_backdated_new",
          type: "backdated_fixture_trace",
          createdAt: "2020-01-01T00:00:00.000Z",
          schemaVersion: 1,
        },
      });
    }
    fs.writeFileSync(process.env.FAKE_MYSQL_HISTORY_STATE, JSON.stringify(state));
  }
});
`, {mode: 0o755});
  try {
    process.env.FAKE_MYSQL_HISTORY_STATE = statePath;
    process.env.FAKE_MYSQL_LOG = logPath;
    const options = {
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "writer",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
      ensureSchema: false,
      singleWriterMaintenance: true,
    };
    const store = createMysqlAuthStore(options);
    const loaded = store.load();
    assert.equal(loaded.battleRecords.length, 10000);
    assert.equal(loaded.battleTrace.length, 1200);
    assert.equal(loaded.battleRecords[0].recordId, "battle_record_sequence_00000");
    assert.equal(loaded.battleRecords.at(-1).recordId, "battle_record_sequence_09999");

    store.save({
      ...loaded,
      battleRecords: [
        ...loaded.battleRecords.slice(1),
        {
          recordId: "battle_record_sequence_backdated_new",
          roomId: "room_sequence_backdated_new",
          mode: "duel",
          reason: "backdated_fixture",
          participantAccountIds: ["acc_sequence_a", "acc_sequence_b"],
          loserAccountIds: ["acc_sequence_b"],
          endedAt: "2020-01-01T00:00:00.000Z",
          schemaVersion: 1,
        },
      ],
      battleTrace: [
        ...loaded.battleTrace.slice(1),
        {
          traceId: "battle_trace_sequence_backdated_new",
          roomId: "room_sequence_backdated_new",
          type: "backdated_fixture_trace",
          createdAt: "2020-01-01T00:00:00.000Z",
          schemaVersion: 1,
        },
      ],
    });

    const restartedStore = createMysqlAuthStore(options);
    const restartedData = restartedStore.load();
    assert.equal(restartedData.battleRecords.length, 10000);
    assert.equal(restartedData.battleTrace.length, 1200);
    assert.equal(restartedData.battleRecords[0].recordId, "battle_record_sequence_00001");
    assert.equal(restartedData.battleRecords.at(-1).recordId, "battle_record_sequence_backdated_new");
    assert.equal(restartedData.battleTrace[0].traceId, "battle_trace_sequence_00001");
    assert.equal(restartedData.battleTrace.at(-1).traceId, "battle_trace_sequence_backdated_new");

    const restartedService = createAuthService({store: restartedStore, initialData: restartedData});
    const normalized = restartedService.snapshot();
    assert.equal(normalized.battleRecords.at(-1).recordId, "battle_record_sequence_backdated_new");
    assert.equal(normalized.battleRecords.at(-1).endedAt, "2020-01-01T00:00:00.000Z");
    assert.equal(normalized.battleTrace.at(-1).traceId, "battle_trace_sequence_backdated_new");

    const persisted = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.equal(persisted.records.length, 10001, "eviction from the hot window never deletes cold history");
    assert.equal(persisted.trace.length, 1201);
    assert.equal(persisted.records[0].document.futureServerField.mustSurviveColdStorage, true);
    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const saveSql = calls.find((call) => call.stdin.includes("START TRANSACTION")).stdin;
    assert.match(saveSql, /INSERT INTO battle_records/);
    assert.match(saveSql, /INSERT INTO battle_trace/);
    assert.doesNotMatch(saveSql, /DELETE FROM (?:battle_records|battle_trace)/);
    assert.doesNotMatch(saveSql, /ON DUPLICATE KEY UPDATE[^;]*(?:battle_record|battle_trace)_sequence_backdated_new/);
    assert.match(saveSql, /UPDATE auth_store_revisions SET revision = revision \+ 1/);
    assert.equal(persisted.revision, 1);
  } finally {
    if (previousStatePath === undefined) {
      delete process.env.FAKE_MYSQL_HISTORY_STATE;
    } else {
      process.env.FAKE_MYSQL_HISTORY_STATE = previousStatePath;
    }
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("mysql normalization and an unrelated request never rewrite loaded battle history", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-battle-history-normalize-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const logPath = path.join(tempDir, "calls.jsonl");
  const previousLogPath = process.env.FAKE_MYSQL_LOG;
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
  if (stdin.includes("information_schema.tables")) {
    process.stdout.write(stdin.includes("auth_store_revisions") ? "1\\n" : "0\\n");
    return;
  }
  if (!stdin.includes("SELECT 'server_state'")) {
    return;
  }
  const rows = [
    ["store_revision", "auth", 0],
    ["server_state", "auth", {schemaVersion: 2, storage: "mysql_entity_tables"}],
    ["battle_records", "battle_record_legacy_future", {
      recordId: "battle_record_legacy_future",
      roomId: "room_legacy_future",
      mode: "duel",
      participantAccountIds: ["acc_legacy_a", "acc_legacy_b"],
      endedAt: "2026-07-12T00:00:00.000Z",
      futureServerField: {mustSurvive: "record_sentinel"},
    }],
    ["battle_trace", "battle_trace_legacy_future", {
      traceId: "battle_trace_legacy_future",
      roomId: "room_legacy_future",
      type: "battle_room_closed",
      createdAt: "2026-07-12T00:00:01.000Z",
      futureServerField: {mustSurvive: "trace_sentinel"},
    }],
  ];
  process.stdout.write(rows.map((row) => [row[0], row[1], JSON.stringify(row[2])].join("\\t")).join("\\n") + "\\n");
});
`, {mode: 0o755});
  try {
    process.env.FAKE_MYSQL_LOG = logPath;
    const store = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "writer",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
      ensureSchema: false,
      singleWriterMaintenance: true,
    });
    const service = createAuthService({store});
    const normalized = service.snapshot();
    assert.equal(normalized.battleRecords[0].futureServerField, undefined);
    assert.equal(normalized.battleTrace[0].futureServerField, undefined);

    const registration = service.register({
      username: "coldhistoryuser",
      password: "test1234",
      displayName: "冷历史用户",
    });
    assert.equal(registration.ok, true);

    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const saveSql = calls.filter((call) => call.stdin.includes("START TRANSACTION"));
    assert.equal(saveSql.length, 1);
    assert.match(saveSql[0].stdin, /INSERT INTO accounts/);
    assert.doesNotMatch(saveSql[0].stdin, /(?:DELETE FROM|INSERT INTO) battle_records/);
    assert.doesNotMatch(saveSql[0].stdin, /(?:DELETE FROM|INSERT INTO) battle_trace/);
    assert.doesNotMatch(saveSql[0].stdin, /record_sentinel|trace_sentinel|futureServerField/);
    assert.match(saveSql[0].stdin, /UPDATE auth_store_revisions SET revision = revision \+ 1/);
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("mysql store loads entity rows into the auth data shape", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-store-entity-load-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdin += chunk;
});
process.stdin.on("end", () => {
  if (!stdin.includes("SELECT 'accounts'")) {
    return;
  }
  const rows = [
    ["server_state", "auth", {
      schemaVersion: 2,
      storage: "mysql_entity_tables",
      offlineHangConfig: {rewardRateBps: 5000, maxMinutes: 480, battleIntervalSeconds: 30, revision: 2},
    }],
    ["accounts", "acc_entity", {
      accountId: "acc_entity",
      username: "entityuser",
      displayName: "实体用户",
      role: "player",
      createdAt: "2026-07-04T00:00:00.000Z",
      updatedAt: "2026-07-04T00:00:00.000Z",
    }],
    ["profiles", "player_entity", {
      playerId: "player_entity",
      accountId: "acc_entity",
      profileRevision: 3,
      updatedAt: "2026-07-04T00:01:00.000Z",
      profile: {
        name: "实体档案",
        level: 12,
        petInstances: [{
          instanceId: "pet_private_entity",
          individualSeed: "bps1_" + "A".repeat(43),
          initialStats: {maxHp: 81, attack: 29, defense: 24, quick: 36},
          growthSpeciesLevel1Stats: {maxHp: 81, attack: 29, defense: 24, quick: 36},
        }],
      },
    }],
    ["mutation_receipts", "operation_entity_0001", {
      schemaVersion: 1,
      operationId: "operation_entity_0001",
      requestHash: "b".repeat(64),
      actionId: "market.buy",
      accountId: "acc_entity",
      committedAt: "2026-07-04T00:01:30.000Z",
      expiresAt: "2026-07-05T00:01:30.000Z",
      response: {ok: true, listingId: "market_entity"},
    }],
    ["mail_messages", "mail_entity", {
      mailId: "mail_entity",
      senderAccountId: "acc_entity",
      recipientAccountId: "acc_entity",
      title: "实体邮件",
      items: [{itemId: "weapon_wooden_club", count: 1}],
      equipmentEnvelopes: [{
        envelopeId: "eqx_store_mail_0001",
        itemId: "weapon_wooden_club",
        instanceState: {durability: 17, enhancement: {level: 3}},
      }],
      currency: {},
      createdAt: "2026-07-04T00:02:00.000Z",
      readAt: null,
      schemaVersion: 2,
    }],
    ["market_listings", "market_entity", {
      listingId: "market_entity",
      sellerAccountId: "acc_entity",
      itemId: "weapon_wooden_club",
      currency: "stoneCoins",
      unitPrice: 88,
      count: 1,
      createdAt: "2026-07-04T00:02:30.000Z",
      equipmentEnvelope: {
        envelopeId: "eqx_store_market_0001",
        itemId: "weapon_wooden_club",
        instanceState: {durability: 11, enhancement: {level: 4}},
      },
      schemaVersion: 2,
    }],
    ["consumed_equipment_envelopes", "eqx_store_consumed_0001", {
      schemaVersion: 99,
      envelopeId: "ignored_inner_identity",
    }],
    ["mail_messages", "mail_row_a", {
      mailId: "mail_inner_shared",
      senderAccountId: "acc_entity",
      recipientAccountId: "acc_entity",
      title: "错位邮件甲",
      createdAt: "2026-07-04T00:02:40.000Z",
      readAt: null,
    }],
    ["mail_messages", "mail_row_b", {
      mailId: "mail_inner_shared",
      senderAccountId: "acc_entity",
      recipientAccountId: "acc_entity",
      title: "错位邮件乙",
      createdAt: "2026-07-04T00:02:41.000Z",
      readAt: null,
    }],
    ["market_listings", "market_row_a", {
      listingId: "market_inner_shared",
      sellerAccountId: "acc_entity",
      itemId: "item_meat_small",
      currency: "stoneCoins",
      unitPrice: 10,
      count: 1,
      createdAt: "2026-07-04T00:02:42.000Z",
      schemaVersion: 1,
    }],
    ["market_listings", "market_row_b", {
      listingId: "market_inner_shared",
      sellerAccountId: "acc_entity",
      itemId: "item_meat_small",
      currency: "stoneCoins",
      unitPrice: 11,
      count: 1,
      createdAt: "2026-07-04T00:02:43.000Z",
      schemaVersion: 1,
    }],
    ["gm_command_grants", "acc_entity/*", {
      accountId: "acc_entity",
      commandId: "*",
      enabled: true,
    }],
    ["battle_trace", "trace_entity", {
      traceId: "trace_entity",
      type: "battle_state_query",
      roomId: "room_entity",
      createdAt: "2026-07-04T00:03:00.000Z",
    }],
    ["service_events", "7", {
      eventSeq: 7,
      eventId: "event_entity",
      type: "system.notice",
      createdAt: "2026-07-04T00:04:00.000Z",
    }],
  ];
  process.stdout.write(rows.map((row) => [row[0], row[1], JSON.stringify(row[2])].join("\\t")).join("\\n") + "\\n");
});
`, {"mode": 0o755});
  try {
    const store = createMysqlAuthStore({
      "mysqlPath": fakeMysqlPath,
      "host": "127.0.0.1",
      "port": 3306,
      "user": "tester",
      "password": "",
      "database": "beastbound_test",
      "createDatabase": false,
    });
    const loaded = store.load();
    assert.equal(loaded.accounts.entityuser.accountId, "acc_entity");
    assert.equal(loaded.profiles.player_entity.profile.name, "实体档案");
    assert.equal(loaded.profiles.player_entity.profile.petInstances[0].individualSeed, `bps1_${"A".repeat(43)}`);
    assert.deepEqual(loaded.profiles.player_entity.profile.petInstances[0].growthSpeciesLevel1Stats, {
      maxHp: 81,
      attack: 29,
      defense: 24,
      quick: 36,
    });
    assert.deepEqual(loaded.mutationReceipts.operation_entity_0001.response, {
      ok: true,
      listingId: "market_entity",
    });
    assert.equal(loaded.mailMessages.mail_entity.title, "实体邮件");
    assert.equal(loaded.mailMessages.mail_entity.equipmentEnvelopes[0].instanceState.enhancement.level, 3);
    assert.equal(loaded.marketListings.market_entity.equipmentEnvelope.instanceState.durability, 11);
    assert.deepEqual(loaded.consumedEquipmentEnvelopes.eqx_store_consumed_0001, {
      schemaVersion: 1,
      envelopeId: "eqx_store_consumed_0001",
    });
    assert.equal(loaded.mailMessages.mail_row_a.title, "错位邮件甲");
    assert.equal(loaded.mailMessages.mail_row_b.title, "错位邮件乙");
    assert.equal(loaded.mailMessages.mail_inner_shared, undefined);
    assert.equal(loaded.marketListings.market_row_a.unitPrice, 10);
    assert.equal(loaded.marketListings.market_row_b.unitPrice, 11);
    assert.equal(loaded.marketListings.market_inner_shared, undefined);
    assert.equal(loaded.gmCommandGrants.acc_entity[0].commandId, "*");
    assert.equal(loaded.battleTrace[0].traceId, "trace_entity");
    assert.equal(loaded.serviceEventSeq, 7);
    assert.equal(loaded.offlineHangConfig.rewardRateBps, 5000);
    assert.equal(loaded.offlineHangConfig.maxMinutes, 480);
  } finally {
    fs.rmSync(tempDir, {"recursive": true, "force": true});
  }
});

test("mysql store incrementally writes changed entities without full table rewrites", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-store-incremental-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const logPath = path.join(tempDir, "calls.jsonl");
  const previousLogPath = process.env.FAKE_MYSQL_LOG;
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdin += chunk;
});
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({
    argv: process.argv.slice(2),
    stdin,
  }) + "\\n");
  if (stdin.includes("SELECT 'server_state'")) {
    process.stdout.write("store_revision\\tauth\\t0\\n");
  }
});
`, {"mode": 0o755});
  try {
    process.env.FAKE_MYSQL_LOG = logPath;
    const store = createMysqlAuthStore({
      "mysqlPath": fakeMysqlPath,
      "host": "127.0.0.1",
      "port": 3306,
      "user": "tester",
      "password": "secret",
      "database": "beastbound_test",
      "createDatabase": false,
      "singleWriterMaintenance": true,
    });
    const unchangedFamilyMarker = `UNCHANGED_FAMILY_MARKER_${"z".repeat(256)}`;
    const firstState = {
      "accounts": {
        "incuser": {
          "accountId": "acc_incremental",
          "username": "incuser",
          "displayName": "增量用户",
          "role": "player",
          "createdAt": "2026-07-04T00:00:00.000Z",
          "updatedAt": "2026-07-04T00:00:00.000Z",
        },
      },
      "sessions": {},
      "profileBindings": {},
      "profiles": {},
      "mutationReceipts": {
        "operation_incremental_keep_0001": {
          "schemaVersion": 1,
          "operationId": "operation_incremental_keep_0001",
          "requestHash": "c".repeat(64),
          "actionId": "market.buy",
          "accountId": "acc_incremental",
          "committedAt": "2026-07-04T00:00:00.000Z",
          "expiresAt": "2026-07-05T00:00:00.000Z",
          "response": {"ok": true, "kind": "keep"},
        },
        "operation_incremental_remove_0002": {
          "schemaVersion": 1,
          "operationId": "operation_incremental_remove_0002",
          "requestHash": "d".repeat(64),
          "actionId": "mail.claim",
          "accountId": "acc_incremental",
          "committedAt": "2026-07-04T00:00:00.000Z",
          "expiresAt": "2026-07-05T00:00:00.000Z",
          "response": {"ok": true, "kind": "remove"},
        },
      },
      "mailMessages": {
        "mail_incremental": {
          "mailId": "mail_incremental",
          "senderAccountId": "acc_incremental",
          "recipientAccountId": "acc_incremental",
          "title": "会被删除",
          "createdAt": "2026-07-04T00:00:00.000Z",
          "readAt": null,
        },
      },
      "consumedEquipmentEnvelopes": {
        "eqx_store_consumed_first_0001": {
          "schemaVersion": 1,
          "envelopeId": "eqx_store_consumed_first_0001",
        },
      },
      "families": {
        "family_incremental": {
          "familyId": "family_incremental",
          "name": "增量家族",
          "leaderAccountId": "acc_incremental",
          "memberAccountIds": ["acc_incremental"],
          "notice": unchangedFamilyMarker,
          "fame": 1,
          "createdAt": "2026-07-04T00:00:00.000Z",
          "updatedAt": "2026-07-04T00:00:00.000Z",
          "schemaVersion": 1,
        },
      },
      "playerPositions": {
        "acc_incremental": {"accountId": "acc_incremental", "username": "incuser", "mapId": "firebud"},
      },
      "battleRooms": {
        "room_incremental": {"roomId": "room_incremental", "mode": "duel", "status": "ready"},
      },
      "battleInvites": {
        "invite_incremental": {"inviteId": "invite_incremental", "mode": "duel", "status": "pending"},
      },
      "authEvents": [],
      "serviceEvents": [],
    };
    const secondState = JSON.parse(JSON.stringify(firstState));
    secondState.accounts.incuser.displayName = "增量用户改名";
    secondState.accounts.incuser.updatedAt = "2026-07-04T00:01:00.000Z";
    secondState.mailMessages = {};
    delete secondState.mutationReceipts.operation_incremental_remove_0002;
    secondState.mutationReceipts.operation_incremental_add_0003 = {
      schemaVersion: 1,
      operationId: "operation_incremental_add_0003",
      requestHash: "e".repeat(64),
      actionId: "bank.withdraw",
      accountId: "acc_incremental",
      committedAt: "2026-07-04T00:01:00.000Z",
      expiresAt: "2026-07-05T00:01:00.000Z",
      response: {ok: true, kind: "add"},
    };
    secondState.consumedEquipmentEnvelopes.eqx_store_consumed_second_0002 = {
      schemaVersion: 1,
      envelopeId: "eqx_store_consumed_second_0002",
    };
    store.save(firstState);
    store.save(secondState);
    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const saveCalls = calls.filter((call) => call.stdin.includes("START TRANSACTION"));
    assert.equal(saveCalls.length, 2);
    const firstSave = saveCalls[0].stdin;
    const secondSave = saveCalls[1].stdin;
    assert.match(firstSave, /INSERT INTO consumed_equipment_envelopes \(envelope_id\) VALUES \('eqx_store_consumed_first_0001'\)/);
    assert.doesNotMatch(firstSave, /ON DUPLICATE KEY UPDATE envelope_id = VALUES\(envelope_id\)/);
    assert.equal(secondSave.includes("INSERT INTO server_state"), false);
    assert.ok(secondSave.includes("INSERT INTO accounts"));
    assert.ok(secondSave.includes("ON DUPLICATE KEY UPDATE"));
    assert.ok(secondSave.includes("DELETE FROM mail_messages WHERE mail_id = 'mail_incremental'"));
    assert.match(secondSave, /DELETE FROM mutation_receipts\s+WHERE operation_id = 'operation_incremental_remove_0002' AND request_hash = '[a-f0-9]{64}'\s+AND action_id = '[^']+' AND account_id <=> '[^']+'\s+AND committed_at = '[^']+' AND expires_at = '[^']+'\s+AND document_json = CAST\('[\s\S]+' AS JSON\)/);
    assert.match(secondSave, /INSERT INTO mutation_receipts\s+\(operation_id, request_hash, action_id, account_id, committed_at, expires_at, document_json\)\s+VALUES \('operation_incremental_add_0003'/);
    assert.equal(secondSave.includes("operation_incremental_keep_0001"), false);
    assert.match(secondSave, /INSERT INTO consumed_equipment_envelopes \(envelope_id\) VALUES \('eqx_store_consumed_second_0002'\)/);
    assert.equal(secondSave.includes("eqx_store_consumed_first_0001"), false);
    assert.equal(/DELETE FROM consumed_equipment_envelopes/.test(secondSave), false);
    assert.equal(/\bDELETE FROM accounts\b/.test(secondSave), false);
    assert.equal(/\bDELETE FROM sessions\b/.test(secondSave), false);
    assert.equal(secondSave.includes("INSERT INTO families"), false);
    assert.equal(secondSave.includes(unchangedFamilyMarker), false);
    assert.equal(secondSave.includes("INSERT INTO player_positions"), false);
    assert.equal(secondSave.includes("INSERT INTO battle_rooms"), false);
    assert.equal(secondSave.includes("INSERT INTO battle_invites"), false);
    assert.equal(secondSave.includes("room_incremental"), false);
    assert.equal(secondSave.includes("invite_incremental"), false);
    assert.match(firstSave, /UPDATE auth_store_revisions SET revision = revision \+ 1/);
    assert.match(secondSave, /UPDATE auth_store_revisions SET revision = revision \+ 1/);

    const invalidReceiptState = structuredClone(secondState);
    invalidReceiptState.mutationReceipts.operation_wrong_key = {
      ...invalidReceiptState.mutationReceipts.operation_incremental_add_0003,
      operationId: "operation_different_document_id",
    };
    assert.throws(
      () => store.save(invalidReceiptState),
      /持久操作回执身份不一致/,
    );
    const rewrittenReceiptState = structuredClone(secondState);
    rewrittenReceiptState.mutationReceipts.operation_incremental_keep_0001.response = {
      ok: true,
      kind: "rewritten",
    };
    assert.throws(
      () => store.save(rewrittenReceiptState),
      /不能改写既有结果/,
    );
    const callsAfterInvalidReceipt = fs.readFileSync(logPath, "utf8").trim()
      .split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(
      callsAfterInvalidReceipt.filter((call) => call.stdin.includes("START TRANSACTION")).length,
      saveCalls.length,
    );
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {"recursive": true, "force": true});
  }
});

test("mysql store skips spawning mysql for synchronous and asynchronous no-op saves", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-store-noop-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const logPath = path.join(tempDir, "calls.jsonl");
  const previousLogPath = process.env.FAKE_MYSQL_LOG;
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
  if (stdin.includes("SELECT 'server_state'")) {
    process.stdout.write("store_revision\\tauth\\t0\\n");
  }
});
`, {mode: 0o755});
  try {
    process.env.FAKE_MYSQL_LOG = logPath;
    const store = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "tester",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
      singleWriterMaintenance: true,
    });
    const state = {
      schemaVersion: 1,
      accounts: {
        noop: {
          accountId: "acc_noop",
          username: "noop",
          displayName: "无变化",
          role: "player",
          createdAt: "2026-07-12T00:00:00.000Z",
          updatedAt: "2026-07-12T00:00:00.000Z",
        },
      },
      mutationReceipts: {},
      serviceEventSeq: 0,
      serviceEvents: [],
    };
    store.save(state);
    const initialCalls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const initialSave = initialCalls.find((call) => call.stdin.includes("START TRANSACTION"));
    assert.match(initialSave.stdin, /UPDATE auth_store_revisions SET revision = revision \+ 1/);
    const callsAfterInitialSave = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).length;

    store.save(structuredClone(state));
    const runtimeOnlyChange = structuredClone(state);
    runtimeOnlyChange.playerPositions = {
      acc_noop: {accountId: "acc_noop", mapId: "firebud_village_gate"},
    };
    runtimeOnlyChange.battleInvites = {
      invite_noop: {inviteId: "invite_noop", status: "pending"},
    };
    runtimeOnlyChange.tradeOffers = Object.fromEntries(Array.from({length: 1000}, (_, index) => [
      `trade_noop_${index}`,
      {offerId: `trade_noop_${index}`, status: "pending"},
    ]));
    for (let index = 0; index < 1000; index += 1) {
      await store.saveAsync(runtimeOnlyChange);
    }

    const callsAfterNoOps = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).length;
    assert.equal(callsAfterNoOps, callsAfterInitialSave);
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("mysql health probes preserve the canonical ledger baseline and append-only diff", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-ledger-health-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const logPath = path.join(tempDir, "calls.jsonl");
  const previousLogPath = process.env.FAKE_MYSQL_LOG;
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
  if (stdin.includes("information_schema.tables")) {
    process.stdout.write(stdin.includes("auth_store_revisions") ? "1\\n" : "0\\n");
  } else if (stdin.includes("SELECT 'server_state'")) {
    const rows = [
      ["store_revision", "auth", "0"],
      ["server_state", "auth", JSON.stringify({schemaVersion: 2, storage: "mysql_entity_tables"})],
      ["consumed_equipment_envelopes", "eqx_health_baseline_0001", "{}"],
      ["consumed_equipment_envelopes", "eqx_health_baseline_0002", "{}"],
    ];
    process.stdout.write(rows.map((row) => row.join("\\t")).join("\\n") + "\\n");
  } else if (stdin.includes("SELECT 1")) {
    process.stdout.write("1\\n");
  }
});
`, {mode: 0o755});
  try {
    process.env.FAKE_MYSQL_LOG = logPath;
    const store = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "tester",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
      ensureSchema: false,
      singleWriterMaintenance: true,
    });
    const loaded = store.load();
    const canonicalLedger = loaded.consumedEquipmentEnvelopes;
    assert.equal(Object.isFrozen(canonicalLedger), true);
    assert.equal(Object.isFrozen(canonicalLedger.eqx_health_baseline_0001), true);

    store.checkHealth();
    const ordinary = cloneAuthorityRoot(loaded);
    ordinary.marketConfig = {schemaVersion: 1, defaultTaxBps: 125};
    const originalObjectKeys = Object.keys;
    let canonicalLedgerScans = 0;
    Object.keys = function countedObjectKeys(value) {
      if (value === canonicalLedger) {
        canonicalLedgerScans += 1;
      }
      return originalObjectKeys(value);
    };
    try {
      store.save(ordinary);
    } finally {
      Object.keys = originalObjectKeys;
    }
    assert.equal(canonicalLedgerScans, 0);

    const appended = ensureConsumedEquipmentEnvelopeIds(
      canonicalLedger,
      "eqx_health_appended_0003",
    );
    assert.equal(appended.ok, true);
    const withAppend = cloneAuthorityRoot(ordinary);
    withAppend.consumedEquipmentEnvelopes = appended.ledger;
    store.save(withAppend);
    const calls = fs.readFileSync(logPath, "utf8").trim()
      .split(/\r?\n/).map((line) => JSON.parse(line));
    const transactionCalls = calls.filter((call) => call.stdin.includes("START TRANSACTION"));
    assert.equal(transactionCalls.length, 2);
    assert.equal(transactionCalls[0].stdin.includes("consumed_equipment_envelopes"), false);
    assert.equal(transactionCalls[1].stdin.includes("eqx_health_appended_0003"), true);
    assert.equal(transactionCalls[1].stdin.includes("eqx_health_baseline_0001"), false);
    assert.equal(transactionCalls[1].stdin.includes("eqx_health_baseline_0002"), false);
    assert.equal(transactionCalls.every((call) => call.stdin.includes("UPDATE auth_store_revisions SET revision = revision + 1")), true);

    // Canonical large-ledger views are immutable Proxy values; JSON is the
    // explicit full materialization boundary used by backup/migration paths.
    const deleted = JSON.parse(JSON.stringify(withAppend));
    delete deleted.consumedEquipmentEnvelopes.eqx_health_baseline_0001;
    assert.throws(() => store.save(deleted), /只能追加/);
    const mutated = JSON.parse(JSON.stringify(withAppend));
    mutated.consumedEquipmentEnvelopes.eqx_health_baseline_0001.schemaVersion = 2;
    assert.throws(() => store.save(mutated), /非规范记录/);
    const callsAfterInvalid = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).length;
    assert.equal(callsAfterInvalid, calls.length);
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("async mysql writes reuse a persistent pool transaction without spawning mysql", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-pool-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const cliLogPath = path.join(tempDir, "cli-calls.jsonl");
  const previousLogPath = process.env.FAKE_MYSQL_LOG;
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
  if (stdin.includes("SELECT 'server_state'")) {
    process.stdout.write("store_revision\\tauth\\t0\\n");
  } else if (stdin.includes("information_schema.tables")) {
    process.stdout.write(stdin.includes("auth_store_revisions") ? "1\\n" : "0\\n");
  }
});
`, {mode: 0o755});
  try {
    process.env.FAKE_MYSQL_LOG = cliLogPath;
    let failNextQuery = false;
    let poolFactoryCalls = 0;
    let poolOptions = null;
    const casFixture = createMysqlCasPoolFixture({
      onQuery() {
        if (failNextQuery) {
          failNextQuery = false;
          throw new Error("injected pool query failure");
        }
      },
    });
    const {pool} = casFixture;
    const events = casFixture.state.events;
    const queriedStatements = casFixture.state.queriedStatements;
    const store = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "tester",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
      ensureSchema: false,
      usePool: true,
      poolFactory(options) {
        poolFactoryCalls += 1;
        poolOptions = options;
        return pool;
      },
    });
    store.load();
    fs.writeFileSync(cliLogPath, "");
    const state = (displayName) => ({
      schemaVersion: 1,
      accounts: {
        pooluser: {
          accountId: "acc_pooluser",
          username: "pooluser",
          displayName,
          role: "player",
          createdAt: "2026-07-12T00:00:00.000Z",
          updatedAt: "2026-07-12T00:00:00.000Z",
        },
      },
      mutationReceipts: {},
      serviceEventSeq: 0,
      serviceEvents: [],
    });

    await store.saveAsync(state("连接池一"));
    await store.saveAsync(state("连接池二"));
    failNextQuery = true;
    await assert.rejects(
      store.saveAsync(state("事务回滚")),
      (error) => {
        assert.equal(error && error.message, "MySQL 异步存档失败。");
        assert.equal(error && error.code, "mysql_transaction_rolled_back");
        assert.equal(error && error.transactionPhase, "rolled_back");
        assert.equal(error && error.outcomeUnknown, false);
        assert.equal(error && error.noCommitGuaranteed, true);
        assert.equal(error && error.rollbackConfirmed, true);
        assert.equal(error && error.retryable, true);
        assert.equal(error && error.cause && error.cause.cause && error.cause.cause.message,
          "injected pool query failure");
        return true;
      },
    );
    await store.saveAsync(state("事务回滚"));
    await store.close();
    await store.close();
    await assert.rejects(store.saveAsync(state("关闭后禁止写入")), /持久连接池已关闭/);

    assert.equal(poolFactoryCalls, 1);
    assert.equal(poolOptions.connectionLimit, 2);
    assert.equal(poolOptions.multipleStatements, false);
    assert.equal(poolOptions.waitForConnections, true);
    assert.equal(casFixture.state.endCalls, 1);
    assert.equal(fs.readFileSync(cliLogPath, "utf8"), "");
    assert.equal(events.filter((event) => event === "acquire").length, 4);
    assert.equal(events.filter((event) => event === "session").length, 4);
    assert.deepEqual(casFixture.state.sessionPolicies, Array.from({length: 4}, () => ({
      rowLockWaitTimeoutSeconds: 3,
      metadataLockWaitTimeoutSeconds: 5,
    })));
    assert.equal(events.filter((event) => event === "begin").length, 4);
    assert.equal(events.filter((event) => event === "commit").length, 3);
    assert.equal(events.filter((event) => event === "rollback").length, 1);
    assert.equal(events.filter((event) => event === "release").length, 4);
    assert.ok(queriedStatements.some((statement) => statement.includes("INSERT INTO accounts")));
    assert.equal(queriedStatements.filter((statement) => (
      /auth_store_revisions[\s\S]+FOR UPDATE$/i.test(statement.trim())
    )).length, 4);
    assert.equal(queriedStatements.filter((statement) => (
      /FROM profile_bindings ORDER BY account_id FOR UPDATE$/i.test(statement.trim())
    )).length, 3);
    assert.equal(queriedStatements.filter((statement) => (
      /FROM profiles ORDER BY player_id FOR UPDATE$/i.test(statement.trim())
    )).length, 3);
    assert.equal(queriedStatements.filter((statement) => /FOR SHARE$/i.test(statement.trim())).length, 0);
    assert.equal(queriedStatements.filter((statement) => statement.startsWith("UPDATE auth_store_revisions")).length, 3);
    assert.equal(casFixture.state.revision, 3);
    assert.equal(queriedStatements.some((statement) => statement === "START TRANSACTION"), false);
    assert.equal(queriedStatements.some((statement) => statement === "COMMIT"), false);
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("scoped profile saves take a shared global barrier without advancing the global revision", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-scoped-barrier-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  if (stdin.includes("SELECT 'server_state'")) {
    process.stdout.write("store_revision\\tauth\\t0\\n");
  } else if (stdin.includes("information_schema.tables")) {
    process.stdout.write(stdin.includes("auth_store_revisions") ? "1\\n" : "0\\n");
  }
});
`, {mode: 0o755});
  const accountId = "acc_scoped_barrier";
  const playerId = "player_scoped_barrier";
  const initialUpdatedAt = "2026-07-14T03:00:00.000Z";
  const nextUpdatedAt = "2026-07-14T03:01:00.000Z";
  const operationId = "operation_scoped_barrier_0001";
  const requestHash = "e".repeat(64);
  const actionId = "POST /profile/action";
  const initial = {
    schemaVersion: 1,
    accounts: {
      scopedbarrier: {
        accountId,
        username: "scopedbarrier",
        displayName: "共享屏障猎人",
        role: "player",
        createdAt: initialUpdatedAt,
        updatedAt: initialUpdatedAt,
      },
    },
    profileBindings: {
      [accountId]: {
        accountId,
        playerId,
        profileRevision: 0,
        createdAt: initialUpdatedAt,
        updatedAt: initialUpdatedAt,
      },
    },
    profiles: {
      [playerId]: {
        playerId,
        accountId,
        profileRevision: 0,
        updatedAt: initialUpdatedAt,
        profile: {
          stoneCoins: 100,
          recordPoint: {mapId: "firebud_village_gate", spawnName: "doctor_record", label: "火芽村"},
        },
      },
    },
    mutationReceipts: {},
    serviceEventSeq: 0,
    serviceEvents: [],
  };
  const casFixture = createMysqlCasPoolFixture();
  try {
    const store = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "writer",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
      ensureSchema: false,
      usePool: true,
      poolFactory: () => casFixture.pool,
    });
    store.load();
    await store.saveAsync(initial);
    assert.equal(casFixture.state.revision, 1);

    casFixture.state.profileBindingRows = [{
      account_id: accountId,
      player_id: playerId,
      profile_revision: 0,
    }];
    casFixture.state.profileRows = [{
      player_id: playerId,
      account_id: accountId,
      profile_revision: 0,
    }];
    casFixture.state.queriedStatements.length = 0;
    const next = structuredClone(initial);
    next.profileBindings[accountId].profileRevision = 1;
    next.profileBindings[accountId].updatedAt = nextUpdatedAt;
    next.profiles[playerId].profileRevision = 1;
    next.profiles[playerId].updatedAt = nextUpdatedAt;
    next.profiles[playerId].profile.recordPoint = {
      mapId: "firebud_training_yard",
      spawnName: "yard",
      label: "训练场",
    };
    next.mutationReceipts = stageDurableMutationReceipt(
      next.mutationReceipts,
      {
        schemaVersion: 1,
        operationId,
        requestHash,
        actionId,
        accountId,
        committedAt: nextUpdatedAt,
        expiresAt: "2026-07-17T03:01:00.000Z",
        response: {ok: true, operationId},
      },
      {nowMs: Date.parse(nextUpdatedAt)},
    );

    await store.saveAsync(next, {
      consistencyScope: {
        kind: "row_local_profile_v1",
        accountId,
        playerId,
        operationId,
        requestHash,
        actionId,
      },
    });

    const scopedQueries = casFixture.state.queriedStatements;
    assert.match(scopedQueries[0], /auth_store_revisions[\s\S]+FOR SHARE$/);
    assert.match(scopedQueries[1], /FROM profile_bindings WHERE account_id = \? FOR UPDATE$/);
    assert.match(scopedQueries[2], /FROM profiles WHERE player_id = \? FOR UPDATE$/);
    assert.equal(scopedQueries.some((statement) => (
      /^UPDATE auth_store_revisions[\s\S]+mutation_receipt_capacity/i.test(statement)
    )), true);
    assert.equal(scopedQueries.some((statement) => (
      /^UPDATE auth_store_revisions[\s\S]+scope_key = 'auth'/i.test(statement)
    )), false);
    assert.equal(casFixture.state.revision, 1);
    await store.close();
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("mysql cold-history ID conflicts roll back instead of overwriting an unseen row", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-cold-history-conflict-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  if (stdin.includes("SELECT 'server_state'")) {
    const rows = [
      ["store_revision", "auth", "0"],
      ["server_state", "auth", JSON.stringify({schemaVersion: 2, storage: "mysql_entity_tables"})],
    ];
    process.stdout.write(rows.map((row) => row.join("\\t")).join("\\n") + "\\n");
  } else if (stdin.includes("information_schema.tables")) {
    process.stdout.write(stdin.includes("auth_store_revisions") ? "1\\n" : "0\\n");
  }
});
`, {mode: 0o755});
  const duplicate = new Error("Duplicate entry 'battle_record_cold_conflict' for key 'PRIMARY'");
  duplicate.code = "ER_DUP_ENTRY";
  const casFixture = createMysqlCasPoolFixture({
    onQuery({sql}) {
      if (/^INSERT INTO battle_records /.test(sql)) {
        assert.doesNotMatch(sql, /ON DUPLICATE KEY UPDATE/);
        throw duplicate;
      }
    },
  });
  const {pool} = casFixture;
  const queriedStatements = casFixture.state.queriedStatements;
  try {
    const store = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "writer",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
      ensureSchema: false,
      usePool: true,
      poolFactory: () => pool,
    });
    store.load();
    await assert.rejects(
      store.saveAsync({
        schemaVersion: 1,
        battleRecords: [{
          recordId: "battle_record_cold_conflict",
          roomId: "room_cold_conflict",
          endedAt: "2026-07-13T08:00:00.000Z",
        }],
        battleTrace: [],
        serviceEventSeq: 0,
        serviceEvents: [],
      }),
      (error) => {
        assert.equal(error && error.message, "MySQL 异步存档失败。");
        assert.equal(error && error.code, "mysql_transaction_rolled_back");
        assert.equal(error && error.transactionPhase, "rolled_back");
        assert.equal(error && error.noCommitGuaranteed, true);
        assert.equal(error && error.rollbackConfirmed, true);
        assert.equal(error && error.cause && error.cause.cause, duplicate);
        return true;
      },
    );
    assert.equal(queriedStatements.length, 4);
    assert.match(queriedStatements[0], /auth_store_revisions[\s\S]+FOR UPDATE/);
    assert.match(queriedStatements[1], /FROM profile_bindings ORDER BY account_id FOR UPDATE$/);
    assert.match(queriedStatements[2], /FROM profiles ORDER BY player_id FOR UPDATE$/);
    assert.match(queriedStatements[3], /^INSERT INTO battle_records /);
    assert.equal(casFixture.state.revision, 0);
    assert.equal(casFixture.state.transactions[0].begun, true);
    assert.equal(casFixture.state.transactions[0].rolledBack, true);
    assert.equal(casFixture.state.transactions[0].committed, false);
    assert.equal(casFixture.state.transactions[0].released, true);
    await store.close();
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("mysql strict new mail conflicts roll back the complete legacy transaction", async () => {
  const duplicate = new Error("Duplicate entry 'mail_strict_conflict' for key 'PRIMARY'");
  duplicate.code = "ER_DUP_ENTRY";
  const statements = __buildSaveStatementsFromPersistentDataForTest({
    schemaVersion: 1,
    accounts: {
      strictmail: {
        accountId: "acc_strict_mail_conflict",
        username: "strictmail",
        displayName: "严格邮件事务测试",
        role: "player",
        createdAt: "2026-07-15T01:00:00.000Z",
        updatedAt: "2026-07-15T01:00:00.000Z",
      },
    },
    mailMessages: {
      mail_strict_conflict: {
        mailId: "mail_strict_conflict",
        senderAccountId: "system",
        recipientAccountId: "acc_strict_mail_conflict",
        title: "严格插入冲突",
        createdAt: "2026-07-15T01:00:00.000Z",
        readAt: null,
      },
    },
  }, {schemaVersion: 1});
  const casFixture = createMysqlCasPoolFixture({
    onQuery({sql}) {
      if (/^INSERT INTO mail_messages /.test(sql)) {
        assert.doesNotMatch(sql, /ON DUPLICATE KEY UPDATE/);
        throw duplicate;
      }
    },
  });

  await assert.rejects(
    __runMysqlPoolSavePlanForTest(casFixture.pool, {
      kind: "legacy_global_cas",
      statements,
      resourceLocks: [],
    }, {
      revisionCasEnabled: true,
      expectedRevision: 0,
    }),
    (error) => {
      assert.equal(error && error.message, "MySQL 异步存档失败。");
      assert.equal(error && error.code, "mysql_transaction_rolled_back");
      assert.equal(error && error.mysqlCode, "ER_DUP_ENTRY");
      assert.equal(error && error.transactionPhase, "rolled_back");
      assert.equal(error && error.outcomeUnknown, false);
      assert.equal(error && error.noCommitGuaranteed, true);
      assert.equal(error && error.rollbackConfirmed, true);
      assert.equal(error && error.cause && error.cause.cause, duplicate);
      return true;
    },
  );

  assert.equal(casFixture.state.queriedStatements.length, 3);
  assert.match(casFixture.state.queriedStatements[0], /auth_store_revisions[\s\S]+FOR UPDATE/);
  assert.match(casFixture.state.queriedStatements[1], /^INSERT INTO accounts /);
  assert.match(casFixture.state.queriedStatements[2], /^INSERT INTO mail_messages /);
  assert.equal(casFixture.state.revision, 0);
  assert.equal(casFixture.state.transactions[0].begun, true);
  assert.equal(casFixture.state.transactions[0].rolledBack, true);
  assert.equal(casFixture.state.transactions[0].committed, false);
  assert.equal(casFixture.state.transactions[0].released, true);
});

test("mysql legacy JSON containing mutation_receipts is not misclassified as a receipt write", async () => {
  const statements = __buildSaveStatementsFromPersistentDataForTest({
    schemaVersion: 1,
    accounts: {
      receiptmarker: {
        accountId: "acc_receipt_marker_text",
        username: "receiptmarker",
        displayName: "玩家文本 mutation_receipts 不应改变 SQL 分类",
        role: "player",
        createdAt: "2026-07-16T09:00:00.000Z",
        updatedAt: "2026-07-16T09:00:00.000Z",
      },
    },
  }, {schemaVersion: 1});
  const casFixture = createMysqlCasPoolFixture();

  const result = await __runMysqlPoolSavePlanForTest(casFixture.pool, {
    kind: "legacy_global_cas",
    statements,
    resourceLocks: [],
  }, {
    revisionCasEnabled: true,
    expectedRevision: 0,
  });

  assert.equal(result.revision, 1);
  assert.equal(result.globalRevisionAdvanced, true);
  assert.equal(casFixture.state.transactions[0].committed, true);
  assert.equal(casFixture.state.transactions[0].rolledBack, false);
  assert.equal(casFixture.state.queriedStatements.some((sql) => (
    /^INSERT INTO accounts\b/i.test(sql) && sql.includes("mutation_receipts")
  )), true);
});

test("mysql saveAsync snapshots caller data before yielding and commits that owned baseline", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-save-owned-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const cliLogPath = path.join(tempDir, "cli-calls.jsonl");
  const previousLogPath = process.env.FAKE_MYSQL_LOG;
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
  if (stdin.includes("SELECT 'server_state'")) {
    process.stdout.write("store_revision\\tauth\\t0\\n");
  } else if (stdin.includes("information_schema.tables")) {
    process.stdout.write(stdin.includes("auth_store_revisions") ? "1\\n" : "0\\n");
  }
});
`, {mode: 0o755});
  try {
    process.env.FAKE_MYSQL_LOG = cliLogPath;
    let releaseFirstAcquire = null;
    const firstAcquireGate = new Promise((resolve) => {
      releaseFirstAcquire = resolve;
    });
    const casFixture = createMysqlCasPoolFixture({
      async beforeAcquire({state}) {
        if (state.acquireCount === 1) {
          await firstAcquireGate;
        }
      },
    });
    const {pool} = casFixture;
    const queriedStatements = casFixture.state.queriedStatements;
    const store = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "tester",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
      ensureSchema: false,
      usePool: true,
      poolFactory: () => pool,
    });
    store.load();
    fs.writeFileSync(cliLogPath, "");
    const state = (displayName) => ({
      schemaVersion: 1,
      accounts: {
        save_owned_user: {
          accountId: "acc_save_owned_user",
          username: "save_owned_user",
          displayName,
          role: "player",
          createdAt: "2026-07-13T00:00:00.000Z",
          updatedAt: "2026-07-13T00:00:00.000Z",
        },
      },
      mutationReceipts: {},
      serviceEventSeq: 0,
      serviceEvents: [],
    });

    const callerState = state("提交前名称");
    const firstSave = store.saveAsync(callerState);
    callerState.accounts.save_owned_user.displayName = "调用后篡改";
    callerState.accounts.injected_after_call = {
      accountId: "acc_injected_after_call",
      username: "injected_after_call",
      displayName: "不应写入",
      role: "player",
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z",
    };
    releaseFirstAcquire();
    await firstSave;

    const firstSql = queriedStatements.join("\n");
    assert.match(firstSql, /提交前名称/);
    assert.doesNotMatch(firstSql, /调用后篡改|injected_after_call|不应写入/);
    const firstQueryCount = queriedStatements.length;
    assert.equal(casFixture.state.acquireCount, 1);

    // Saving the original value again must be a true no-op. This proves the
    // committed diff baseline also owns the pre-yield snapshot instead of the
    // caller object that was mutated while COMMIT was pending.
    await store.saveAsync(state("提交前名称"));
    assert.equal(casFixture.state.acquireCount, 1);
    assert.equal(queriedStatements.length, firstQueryCount);

    await store.saveAsync(state("第二次真实变化"));
    assert.equal(casFixture.state.acquireCount, 2);
    assert.match(queriedStatements.slice(firstQueryCount).join("\n"), /第二次真实变化/);
    await store.saveAsyncOwned(state("受托权威快照"));
    assert.equal(casFixture.state.acquireCount, 3);
    assert.match(queriedStatements.join("\n"), /受托权威快照/);
    assert.equal(casFixture.state.revision, 3);
    await store.close();
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("async mysql CLI writes fail closed without spawning a transaction or diagnosis", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-store-async-failure-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const logPath = path.join(tempDir, "calls.jsonl");
  const previousLogPath = process.env.FAKE_MYSQL_LOG;
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
});
`, {mode: 0o755});
  try {
    process.env.FAKE_MYSQL_LOG = logPath;
    const store = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "tester",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
    });
    store.load();
    fs.writeFileSync(logPath, "");

    await assert.rejects(
      store.saveAsync({
        accounts: {
          async_failure: {
            accountId: "acc_async_failure",
            username: "async_failure",
            displayName: "异步失败",
            role: "player",
            createdAt: "2026-07-12T00:00:00.000Z",
            updatedAt: "2026-07-12T00:00:00.000Z",
          },
        },
      }),
      (error) => error.code === "mysql_async_revision_cas_required"
        && error.message === "在线异步 MySQL 写入必须使用带全局版本锁的连接池。",
    );

    assert.equal(fs.readFileSync(logPath, "utf8"), "");
    await store.close();
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("mysql consumed equipment ledger rejects deletion or mutation before opening a transaction", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-consumed-immutable-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const logPath = path.join(tempDir, "calls.jsonl");
  const previousLogPath = process.env.FAKE_MYSQL_LOG;
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
  if (stdin.includes("SELECT 'server_state'")) {
    process.stdout.write("store_revision\\tauth\\t0\\n");
  }
});
`, {mode: 0o755});
  try {
    process.env.FAKE_MYSQL_LOG = logPath;
    const store = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "tester",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
      singleWriterMaintenance: true,
    });
    const envelopeId = "eqx_store_immutable_0001";
    const state = {
      consumedEquipmentEnvelopes: {
        [envelopeId]: {schemaVersion: 1, envelopeId},
      },
    };
    store.save(state);
    const transactionCount = () => fs.readFileSync(logPath, "utf8")
      .trim().split(/\r?\n/)
      .filter((line) => JSON.parse(line).stdin.includes("START TRANSACTION")).length;
    const beforeFailures = transactionCount();
    const firstTransaction = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/)
      .map((line) => JSON.parse(line)).find((call) => call.stdin.includes("START TRANSACTION"));
    assert.match(firstTransaction.stdin, /UPDATE auth_store_revisions SET revision = revision \+ 1/);
    assert.throws(() => store.save({consumedEquipmentEnvelopes: {}}), /只能追加/);
    assert.throws(() => store.save({
      consumedEquipmentEnvelopes: {
        [envelopeId]: {schemaVersion: 2, envelopeId},
      },
    }), /非规范记录/);
    assert.equal(transactionCount(), beforeFailures);
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("mysql consumed equipment insert stays strict on an ambiguous maintenance response", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-consumed-retry-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const logPath = path.join(tempDir, "calls.jsonl");
  const failedOncePath = path.join(tempDir, "failed-once");
  const previousLogPath = process.env.FAKE_MYSQL_LOG;
  const previousFailedOncePath = process.env.FAKE_MYSQL_FAILED_ONCE;
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
  if (stdin.includes("SELECT 'server_state'")) {
    process.stdout.write("store_revision\\tauth\\t0\\n");
    return;
  }
  if (
    stdin.includes("START TRANSACTION")
    && stdin.includes("INSERT INTO consumed_equipment_envelopes")
    && stdin.includes("COMMIT")
    && !fs.existsSync(process.env.FAKE_MYSQL_FAILED_ONCE)
  ) {
    fs.writeFileSync(process.env.FAKE_MYSQL_FAILED_ONCE, "committed-but-response-lost");
    process.stderr.write("ambiguous commit response");
    process.exitCode = 1;
  }
});
`, {mode: 0o755});
  try {
    process.env.FAKE_MYSQL_LOG = logPath;
    process.env.FAKE_MYSQL_FAILED_ONCE = failedOncePath;
    const store = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "tester",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
      singleWriterMaintenance: true,
    });
    const envelopeId = "eqx_store_ambiguous_retry_0001";
    const state = {
      consumedEquipmentEnvelopes: {
        [envelopeId]: {schemaVersion: 1, envelopeId},
      },
    };
    assert.throws(() => store.save(state), /ambiguous commit response/);
    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const completeAttempts = calls.filter((call) => (
      call.stdin.includes("START TRANSACTION")
      && call.stdin.includes("INSERT INTO consumed_equipment_envelopes")
      && call.stdin.includes("COMMIT")
    ));
    assert.equal(completeAttempts.length, 1);
    for (const attempt of completeAttempts) {
      assert.doesNotMatch(attempt.stdin, /ON DUPLICATE KEY UPDATE envelope_id = VALUES\(envelope_id\)/);
      assert.match(attempt.stdin, /UPDATE auth_store_revisions SET revision = revision \+ 1/);
      assert.equal(/DELETE FROM consumed_equipment_envelopes/.test(attempt.stdin), false);
    }
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    if (previousFailedOncePath === undefined) {
      delete process.env.FAKE_MYSQL_FAILED_ONCE;
    } else {
      process.env.FAKE_MYSQL_FAILED_ONCE = previousFailedOncePath;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("default auth store is asynchronous MySQL and keeps runtime state out of persistence", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-default-mysql-store-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const logPath = path.join(tempDir, "calls.jsonl");
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdin += chunk;
});
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({
    argv: process.argv.slice(2),
    stdin,
  }) + "\\n");
  if (stdin.includes("SELECT 'server_state'")) {
    process.stdout.write("store_revision\\tauth\\t0\\n");
  }
});
`, {"mode": 0o755});
  const casFixture = createMysqlCasPoolFixture();
  try {
    await withEnv({
      "BEASTBOUND_AUTH_STORE": undefined,
      "BEASTBOUND_STORE": undefined,
      "BEASTBOUND_AUTH_STORE_PATH": undefined,
      "BEASTBOUND_MYSQL_BIN": fakeMysqlPath,
      "BEASTBOUND_MYSQL_HOST": "127.0.0.1",
      "BEASTBOUND_MYSQL_PORT": "3306",
      "BEASTBOUND_MYSQL_USER": "tester",
      "BEASTBOUND_MYSQL_PASSWORD": "secret",
      "BEASTBOUND_MYSQL_DATABASE": "beastbound_test",
      "BEASTBOUND_MYSQL_CREATE_DATABASE": "0",
      "FAKE_MYSQL_LOG": logPath,
    }, async () => {
      const store = createDefaultStore({
        mysqlStoreOptions: {
          poolFactory: () => casFixture.pool,
        },
      });
      assert.equal(typeof store.flush, "function");
      assert.deepEqual(store.load(), {});
      const savePromise = store.save({
        "accounts": {
          "defaultmysql": {
            "accountId": "acc_defaultmysql",
            "username": "defaultmysql",
            "displayName": "默认MySQL",
            "role": "player",
            "createdAt": "2026-07-03T00:00:00.000Z",
            "updatedAt": "2026-07-03T00:00:00.000Z",
          },
        },
        "sessions": {},
        "profileBindings": {},
        "profiles": {},
        "mailMessages": {
          "mail_default": {
            "mailId": "mail_default",
            "senderAccountId": "acc_defaultmysql",
            "recipientAccountId": "acc_defaultmysql",
            "title": "测试",
            "createdAt": "2026-07-03T00:00:00.000Z",
            "readAt": null,
          },
        },
        "chatMessages": [{
          "messageId": "chat_default",
          "channel": "nearby",
          "partyId": "",
          "senderAccountId": "acc_defaultmysql",
          "createdAt": "2026-07-03T00:00:00.000Z",
        }],
        "playerPositions": {
          "acc_defaultmysql": {"accountId": "acc_defaultmysql", "username": "defaultmysql"},
        },
        "battleRooms": {
          "room_default": {"roomId": "room_default", "mode": "duel", "status": "ready"},
        },
        "battleInvites": {
          "invite_default": {"inviteId": "invite_default", "mode": "duel", "status": "pending"},
        },
        "authEvents": [],
        "serviceEvents": [],
      });
      assert.equal(typeof savePromise.then, "function");
      await store.flush();
      await savePromise;
      await store.close();
    });
    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.ok(calls.some((call) => call.stdin.includes("CREATE TABLE IF NOT EXISTS server_state")));
    assert.equal(calls.some((call) => call.stdin.includes("START TRANSACTION") && call.stdin.includes("INSERT INTO server_state")), false);
    assert.equal(calls.every((call) => call.argv.includes("-e") === false), true);
    const saveSql = casFixture.state.queriedStatements.join("\n");
    assert.match(saveSql, /SELECT revision AS storeRevision[\s\S]+FOR UPDATE/);
    assert.match(saveSql, /INSERT INTO server_state/);
    assert.match(saveSql, /INSERT INTO accounts/);
    assert.match(saveSql, /INSERT INTO mail_messages/);
    assert.match(saveSql, /INSERT INTO chat_messages/);
    assert.doesNotMatch(saveSql, /INSERT INTO player_positions/);
    assert.doesNotMatch(saveSql, /INSERT INTO battle_rooms/);
    assert.doesNotMatch(saveSql, /INSERT INTO battle_invites/);
    assert.match(saveSql, /UPDATE auth_store_revisions SET revision = revision \+ 1[\s\S]+AND revision = 0/);
    assert.equal(casFixture.state.revision, 1);
    assert.equal(casFixture.state.endCalls, 1);
  } finally {
    fs.rmSync(tempDir, {"recursive": true, "force": true});
  }
});

test("JSON auth store is available only when explicitly selected", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-json-store-"));
  const storePath = path.join(tempDir, "auth-store.json");
  try {
    await withEnv({
      "BEASTBOUND_AUTH_STORE": "json",
      "BEASTBOUND_STORE": undefined,
      "BEASTBOUND_AUTH_STORE_PATH": storePath,
    }, async () => {
      const store = createDefaultStore();
      store.save({
        "accounts": {
          "jsonuser": {
            "accountId": "acc_jsonuser",
            "username": "jsonuser",
            "displayName": "JSON测试",
            "role": "player",
            "createdAt": "2026-07-03T00:00:00.000Z",
            "updatedAt": "2026-07-03T00:00:00.000Z",
          },
        },
        "profileBindings": {
          "acc_jsonuser": {"accountId": "acc_jsonuser", "playerId": "player_jsonuser"},
        },
        "profiles": {
          "player_jsonuser": {
            "playerId": "player_jsonuser",
            "accountId": "acc_jsonuser",
            "profile": {
              "petInstances": [{
                "instanceId": "pet_private_json",
                "individualSeed": `bps1_${"B".repeat(43)}`,
                "initialStats": {"maxHp": 72, "attack": 26, "defense": 22, "quick": 34},
                "growthSpeciesLevel1Stats": {"maxHp": 72, "attack": 26, "defense": 22, "quick": 34},
              }],
            },
          },
        },
      });
    });
    const saved = JSON.parse(fs.readFileSync(storePath, "utf8"));
    assert.equal(saved.accounts.jsonuser.username, "jsonuser");
    const reloaded = createJsonAuthStore(storePath).load();
    const privatePet = reloaded.profiles.player_jsonuser.profile.petInstances[0];
    assert.equal(privatePet.individualSeed, `bps1_${"B".repeat(43)}`);
    assert.deepEqual(privatePet.initialStats, {maxHp: 72, attack: 26, defense: 22, quick: 34});
  } finally {
    fs.rmSync(tempDir, {"recursive": true, "force": true});
  }
});

test("JSON auth store refuses to load corrupted files instead of silently resetting", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-json-corrupt-"));
  const storePath = path.join(tempDir, "auth-store.json");
  try {
    fs.writeFileSync(storePath, "{ this is not valid json");
    const store = createJsonAuthStore(storePath);
    assert.throws(() => store.load(), (error) => error.code === "storage_load_corrupted");
    // 损坏文件必须原样保留，等待人工修复，而不是被覆盖成空档。
    assert.equal(fs.readFileSync(storePath, "utf8"), "{ this is not valid json");
  } finally {
    fs.rmSync(tempDir, {"recursive": true, "force": true});
  }
});

test("async store keeps defensive saves isolated and routes durable ownership transfers without deep cloning", async () => {
  const calls = [];
  const underlying = {
    mode: "owned-routing-test",
    load: () => ({}),
    async saveAsync(value) {
      calls.push({kind: "defensive", value});
    },
    async saveAsyncOwned(value) {
      calls.push({kind: "owned", value});
    },
  };
  const store = createAsyncWriteAuthStore(underlying, {onError() {}});
  const ownedProfiles = {player_owned: {profile: {stoneCoins: 10}}};
  const ownedRoot = {schemaVersion: 1, profiles: ownedProfiles};
  await store.saveOwned(ownedRoot);
  assert.equal(calls[0].kind, "owned");
  assert.notStrictEqual(calls[0].value, ownedRoot);
  assert.strictEqual(calls[0].value.profiles, ownedProfiles);

  const defensiveRoot = {schemaVersion: 1, profiles: {player_safe: {profile: {stoneCoins: 20}}}};
  await store.save(defensiveRoot);
  assert.equal(calls[1].kind, "defensive");
  assert.notStrictEqual(calls[1].value, defensiveRoot);
  assert.notStrictEqual(calls[1].value.profiles, defensiveRoot.profiles);
});

test("async store rejects the owning durable request, rolls back cache, and self-heals", async () => {
  const base = createMemoryAuthStore();
  let failing = false;
  const flaky = {
    "mode": "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      if (failing) {
        throw new Error("disk full");
      }
      base.save(nextData);
    },
  };
  const asyncErrors = [];
  const store = createAsyncWriteAuthStore(flaky, {"onError": (error) => asyncErrors.push(error)});
  const service = createAuthService({store});

  const healthy = await service.invokeDurable("register", [{"username": "storagefaila", "password": "test1234", "displayName": "写失败A"}], {
    actionId: "test register",
  });
  assert.equal(healthy.ok, true);

  failing = true;
  await assert.rejects(
    service.invokeDurable("register", [{"username": "storagefailb", "password": "test1234", "displayName": "写失败B"}], {
      actionId: "test register",
    }),
    (error) => error.code === "storage_write_failed" && error.cause && /disk full/.test(error.cause.message),
  );
  await assert.rejects(store.flush(), /disk full/);
  assert.equal(asyncErrors.length, 1);
  assert.equal(Boolean(service.snapshot().accounts.storagefailb), false);
  assert.equal(Boolean(base.load().accounts.storagefailb), false);

  failing = false;
  const recovered = await service.invokeDurable("register", [{"username": "storagefaild", "password": "test1234", "displayName": "写失败D"}], {
    actionId: "test register",
  });
  assert.equal(recovered.ok, true);
  await store.flush();
  const persisted = base.load();
  assert.equal(Boolean(persisted.accounts.storagefaila), true);
  assert.equal(Boolean(persisted.accounts.storagefailb), false);
  assert.equal(Boolean(persisted.accounts.storagefaild), true);
});

test("HTTP endpoint waits for its own commit and returns 503 for that failed write", async (t) => {
  const base = createMemoryAuthStore();
  let failing = false;
  const flaky = {
    "mode": "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      if (failing) {
        throw new Error("disk full");
      }
      base.save(nextData);
    },
  };
  const store = createAsyncWriteAuthStore(flaky, {"onError": () => {}});
  const service = createAuthService({store});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base503 = `http://127.0.0.1:${port}`;

  const first = await fetchJson(`${base503}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "http503a", "password": "test1234", "displayName": "接口写失败A"}),
  });
  assert.equal(first.ok, true);
  failing = true;
  const doomedResponse = await fetch(`${base503}/auth/register`, {
    "method": "POST",
    "headers": {
      "content-type": "application/json",
      [CLIENT_VERSION_HEADER]: SERVER_VERSION,
      [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
    },
    "body": JSON.stringify({"username": "http503b", "password": "test1234", "displayName": "接口写失败B"}),
  });
  assert.equal(doomedResponse.status, 503);
  const doomed = await doomedResponse.json();
  assert.equal(doomed.ok, false);
  assert.equal(doomed.code, "storage_write_failed");
  await assert.rejects(store.flush(), /disk full/);
  assert.equal(Boolean(service.snapshot().accounts.http503b), false);
  assert.equal(Boolean(base.load().accounts.http503b), false);
  failing = false;

  const recovered = await fetchJson(`${base503}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "http503d", "password": "test1234", "displayName": "接口写失败D"}),
  });
  assert.equal(recovered.ok, true);
});
