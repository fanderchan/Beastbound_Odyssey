"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createAsyncWriteAuthStore,
  createAuthService,
  createMemoryAuthStore,
} = require("../src/auth-service");
const {createMysqlAuthStore: createMysqlAuthStoreImpl} = require("../src/mysql-store");
const {
  buildMailStorageCanonicalContractOutputForTest,
} = require("../src/mysql-mail-storage-schema");
const {
  wrapFakeMysqlWithMailStorageAudit,
} = require("../test-support/mysql-mail-storage-fixture");

function createMysqlAuthStore(options = {}) {
  return createMysqlAuthStoreImpl({
    ...options,
    mysqlPath: wrapFakeMysqlWithMailStorageAudit(options.mysqlPath),
  });
}

const MYSQL_SESSION_POLICY_SQL =
  "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?";

function isDefaultMysqlSessionPolicy(sql, params) {
  if (sql.trim() !== MYSQL_SESSION_POLICY_SQL) {
    return false;
  }
  assert.deepEqual(params, [3, 5]);
  return true;
}

function rejectOtherMysqlSetStatement(sql) {
  if (!/^SET\b/i.test(sql.trim())) {
    return;
  }
  const error = new Error(`test pool rejects non-default MySQL session SQL: ${sql.trim()}`);
  error.code = "mysql_test_pool_unsafe_session_sql";
  throw error;
}

function authorityState(displayName, stoneCoins, profileRevision = 2) {
  return {
    schemaVersion: 1,
    profileBindings: {
      acc_multi_store: {
        accountId: "acc_multi_store",
        playerId: "player_multi_store",
        profileRevision,
        updatedAt: "2026-07-13T16:00:00.000Z",
      },
    },
    profiles: {
      player_multi_store: {
        playerId: "player_multi_store",
        accountId: "acc_multi_store",
        profileRevision,
        updatedAt: "2026-07-13T16:00:00.000Z",
        profile: {
          displayName,
          stoneCoins,
        },
      },
    },
    mutationReceipts: {},
    // This suite validates the legacy whole-root CAS contract. Keep a
    // non-profile durable change so a profile-only v2 plan cannot be selected.
    marketConfig: {revisionCasFixture: displayName},
    serviceEventSeq: 0,
    serviceEvents: [],
  };
}

function createRevisionLoaderFixture(tempDir, options = {}) {
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const statePath = path.join(tempDir, "loader-state.json");
  const sqlLogPath = path.join(tempDir, "mysql-input.log");
  fs.writeFileSync(statePath, JSON.stringify({revision: options.revision ?? 0}));
  fs.writeFileSync(sqlLogPath, "");
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(${JSON.stringify(sqlLogPath)}, stdin + "\\n-- invocation --\\n");
  if (stdin.includes("AS mail_storage_contract")) {
    process.stdout.write(${JSON.stringify(buildMailStorageCanonicalContractOutputForTest())});
  } else if (stdin.includes("FROM mail_storage_control")) {
    process.stdout.write("mail_lifecycle\\t1\\t0\\tuninitialized\\t0\\t0\\t0\\t\\t0\\t0\\t0\\t0\\t\\t\\n");
  } else if (stdin.includes("SELECT 'server_state'")) {
    const state = JSON.parse(fs.readFileSync(${JSON.stringify(statePath)}, "utf8"));
    const rows = [
      ["server_state", "auth", JSON.stringify({schemaVersion: 2, storage: "mysql_entity_tables"})],
    ];
    if (stdin.includes("SELECT 'store_revision'")) {
      rows.push(["store_revision", "auth", String(state.revision)]);
    }
    process.stdout.write(rows.map((row) => row.join("\\t")).join("\\n") + "\\n");
  } else if (stdin.includes("information_schema.tables")) {
    process.stdout.write("1\\n");
  }
});
`, {mode: 0o755});
  return {fakeMysqlPath, sqlLogPath, statePath};
}

function createRetryableRevisionPool(options = {}) {
  const shared = {
    revision: 0,
    updateAttempts: 0,
    commitAttempts: 0,
    sessionPolicies: [],
    transactions: [],
  };
  const failRevisionUpdates = Math.max(0, Number(options.failRevisionUpdates || 0));
  const failCommits = Math.max(0, Number(options.failCommits || 0));
  const pool = {
    async getConnection() {
      const transaction = {
        begun: false,
        committed: false,
        rolledBack: false,
        released: false,
        destroyed: false,
        queries: [],
      };
      shared.transactions.push(transaction);
      let pendingRevision = null;
      return {
        async beginTransaction() {
          transaction.begun = true;
        },
        async query(statement, params = []) {
          const sql = typeof statement === "string" ? statement : String(statement && statement.sql || "");
          if (isDefaultMysqlSessionPolicy(sql, params)) {
            shared.sessionPolicies.push(params.slice());
            return [{affectedRows: 0}, []];
          }
          rejectOtherMysqlSetStatement(sql);
          transaction.queries.push(sql);
          if (/SELECT\s+revision\s+AS\s+storeRevision\s+FROM\s+auth_store_revisions[\s\S]+FOR\s+(?:SHARE|UPDATE)/i.test(sql)) {
            return [[{storeRevision: shared.revision}], []];
          }
          if (/FROM\s+profile_bindings\s+ORDER\s+BY\s+account_id\s+FOR\s+UPDATE/i.test(sql)) {
            return [[], []];
          }
          if (/FROM\s+profiles\s+ORDER\s+BY\s+player_id\s+FOR\s+UPDATE/i.test(sql)) {
            return [[], []];
          }
          if (/SELECT\s+document_json\s+FROM\s+server_state\s+WHERE\s+state_key\s*=\s*'auth'\s+FOR\s+UPDATE/i.test(sql)) {
            return [[{document_json: {
              schemaVersion: 2,
              storage: "mysql_entity_tables",
              serviceEventSeq: 0,
              marketConfig: {},
              offlineHangConfig: {},
            }}], []];
          }
          if (/UPDATE\s+auth_store_revisions\s+SET\s+revision\s*=\s*revision\s*\+\s*1/i.test(sql)) {
            shared.updateAttempts += 1;
            if (shared.updateAttempts <= failRevisionUpdates) {
              return [{affectedRows: 0}, []];
            }
            pendingRevision = shared.revision + 1;
            return [{affectedRows: 1}, []];
          }
          return [{affectedRows: 1}, []];
        },
        async commit() {
          shared.commitAttempts += 1;
          if (shared.commitAttempts <= failCommits) {
            throw new Error("injected commit failure before durability");
          }
          if (pendingRevision !== null) {
            shared.revision = pendingRevision;
          }
          transaction.committed = true;
        },
        async rollback() {
          pendingRevision = null;
          transaction.rolledBack = true;
        },
        release() {
          transaction.released = true;
        },
        destroy() {
          transaction.destroyed = true;
        },
      };
    },
    async end() {},
  };
  return {pool, shared};
}

function transactionBusinessSql(transaction) {
  return transaction.queries.filter((sql) => !/auth_store_revisions/i.test(sql));
}

function createRevisionTestStore(fakeMysqlPath, pool) {
  return createMysqlAuthStore({
    mysqlPath: fakeMysqlPath,
    host: "127.0.0.1",
    port: 3306,
    user: "tester",
    password: "dummy",
    database: "beastbound_test",
    createDatabase: false,
    ensureSchema: false,
    usePool: true,
    poolFactory: () => pool,
  });
}

function createSharedRevisionPool(shared, writerId, statePath) {
  return {
    async getConnection() {
      let pendingRevision = null;
      let transactionStarted = false;
      return {
        async beginTransaction() {
          transactionStarted = true;
          shared.events.push(`${writerId}:begin`);
        },
        async query(statement, params = []) {
          const sql = typeof statement === "string" ? statement : String(statement && statement.sql || "");
          if (isDefaultMysqlSessionPolicy(sql, params)) {
            shared.sessionPolicies.push({writerId, params: params.slice()});
            return [{affectedRows: 0}, []];
          }
          rejectOtherMysqlSetStatement(sql);
          shared.queries.push({writerId, sql, params: Array.isArray(params) ? params.slice() : params});
          if (/SELECT\s+revision\s+AS\s+storeRevision\s+FROM\s+auth_store_revisions[\s\S]+FOR\s+(?:SHARE|UPDATE)/i.test(sql)) {
            shared.events.push(`${writerId}:lock:${shared.storeRevision}`);
            return [[{storeRevision: shared.storeRevision}], []];
          }
          if (/FROM\s+profile_bindings\s+ORDER\s+BY\s+account_id\s+FOR\s+UPDATE/i.test(sql)) {
            assert.deepEqual(params, []);
            return [[{
              account_id: "acc_multi_store",
              player_id: "player_multi_store",
              profile_revision: shared.storeRevision + 1,
            }], []];
          }
          if (/FROM\s+profiles\s+ORDER\s+BY\s+player_id\s+FOR\s+UPDATE/i.test(sql)) {
            assert.deepEqual(params, []);
            return [[{
              player_id: "player_multi_store",
              account_id: "acc_multi_store",
              profile_revision: shared.storeRevision + 1,
            }], []];
          }
          if (/SELECT\s+document_json\s+FROM\s+server_state\s+WHERE\s+state_key\s*=\s*'auth'\s+FOR\s+UPDATE/i.test(sql)) {
            assert.deepEqual(params, []);
            return [[{document_json: {
              schemaVersion: 2,
              storage: "mysql_entity_tables",
              serviceEventSeq: 0,
              marketConfig: {},
              offlineHangConfig: {},
            }}], []];
          }
          if (/SELECT[\s\S]+FROM\s+profile_bindings[\s\S]+FOR\s+UPDATE/i.test(sql)) {
            assert.deepEqual(params, ["acc_multi_store"]);
            return [[{
              account_id: "acc_multi_store",
              player_id: "player_multi_store",
              profile_revision: shared.storeRevision + 1,
            }], []];
          }
          if (/SELECT[\s\S]+FROM\s+profiles[\s\S]+FOR\s+UPDATE/i.test(sql)) {
            assert.deepEqual(params, ["player_multi_store"]);
            return [[{
              player_id: "player_multi_store",
              account_id: "acc_multi_store",
              profile_revision: shared.storeRevision + 1,
            }], []];
          }
          if (/UPDATE\s+auth_store_revisions[\s\S]+revision/i.test(sql)) {
            pendingRevision = shared.storeRevision + 1;
            return [{affectedRows: 1}, []];
          }
          return [{affectedRows: 1}, []];
        },
        async commit() {
          assert.equal(transactionStarted, true);
          if (pendingRevision !== null) {
            shared.storeRevision = pendingRevision;
            fs.writeFileSync(statePath, JSON.stringify({
              storeRevision: shared.storeRevision,
              lastWriter: writerId,
            }));
          }
          shared.commits.push(writerId);
          shared.events.push(`${writerId}:commit`);
        },
        async rollback() {
          shared.rollbacks.push(writerId);
          shared.events.push(`${writerId}:rollback`);
        },
        release() {
          shared.events.push(`${writerId}:release`);
        },
        destroy() {
          shared.events.push(`${writerId}:destroy`);
        },
      };
    },
    async end() {},
  };
}

test("a stale second MySQL store cannot overwrite a revision committed by another node", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-multi-store-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const statePath = path.join(tempDir, "shared-state.json");
  const loadSqlPath = path.join(tempDir, "load.sql");
  const maintenanceSqlPath = path.join(tempDir, "maintenance.sql");
  fs.writeFileSync(statePath, JSON.stringify({storeRevision: 0, lastWriter: "initial"}));
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  if (stdin.includes("SELECT 'server_state'")) {
    fs.writeFileSync(${JSON.stringify(loadSqlPath)}, stdin);
    const state = JSON.parse(fs.readFileSync(${JSON.stringify(statePath)}, "utf8"));
    const profile = state.lastWriter === "node_a"
      ? {displayName: "节点A已扣款", stoneCoins: 90, profileRevision: 2}
      : state.lastWriter === "node_b"
        ? {displayName: "节点B基于新根", stoneCoins: 90, profileRevision: 3}
        : {displayName: "共享旧档", stoneCoins: 100, profileRevision: 1};
    const rows = [
      ["server_state", "auth", JSON.stringify({schemaVersion: 2, storage: "mysql_entity_tables"})],
      ["profile_bindings", "acc_multi_store", JSON.stringify({accountId: "acc_multi_store", playerId: "player_multi_store", profileRevision: profile.profileRevision, updatedAt: "2026-07-13T15:00:00.000Z"})],
      ["profiles", "player_multi_store", JSON.stringify({playerId: "player_multi_store", accountId: "acc_multi_store", profileRevision: profile.profileRevision, updatedAt: "2026-07-13T15:00:00.000Z", profile: {displayName: profile.displayName, stoneCoins: profile.stoneCoins}})],
    ];
    if (stdin.includes("SELECT 'store_revision'")) {
      rows.push(["store_revision", "auth", String(state.storeRevision)]);
    }
    process.stdout.write(rows.map((row) => row.join("\\t")).join("\\n") + "\\n");
  } else if (stdin.includes("information_schema.tables")) {
    process.stdout.write(stdin.includes("auth_store_revisions") ? "1\\n" : "0\\n");
  } else if (stdin.includes("UPDATE auth_store_revisions SET revision = revision + 1")) {
    const state = JSON.parse(fs.readFileSync(${JSON.stringify(statePath)}, "utf8"));
    state.storeRevision += 1;
    state.lastWriter = "maintenance";
    fs.writeFileSync(${JSON.stringify(statePath)}, JSON.stringify(state));
    fs.writeFileSync(${JSON.stringify(maintenanceSqlPath)}, stdin);
  }
});
`, {mode: 0o755});

  const shared = {
    storeRevision: 0,
    commits: [],
    rollbacks: [],
    events: [],
    queries: [],
    sessionPolicies: [],
  };
  const createStore = (writerId, extraOptions = {}) => createMysqlAuthStore({
    mysqlPath: fakeMysqlPath,
    host: "127.0.0.1",
    port: 3306,
    user: "tester",
    password: "dummy",
    database: "beastbound_test",
    createDatabase: false,
    ensureSchema: false,
    usePool: true,
    poolFactory: () => createSharedRevisionPool(shared, writerId, statePath),
    ...extraOptions,
  });
  const storeA = createStore("node_a");
  const storeB = createStore("node_b");
  const cliOnlineStore = createStore("cli_online", {usePool: false});
  let maintenanceStore = null;
  try {
    const loadedA = storeA.load();
    storeB.load();
    const loadSql = fs.readFileSync(loadSqlPath, "utf8");
    assert.match(loadSql, /SET TRANSACTION ISOLATION LEVEL REPEATABLE READ/);
    assert.match(loadSql, /SET autocommit = 0/);
    assert.ok(loadSql.indexOf("SELECT 'store_revision'") < loadSql.indexOf("SELECT 'profiles'"));
    assert.match(loadSql, /COMMIT\s*$/);

    await storeA.saveAsync(loadedA);
    assert.equal(shared.events.length, 0);
    assert.equal(shared.queries.length, 0);
    assert.equal(shared.storeRevision, 0);

    cliOnlineStore.load();
    await assert.rejects(
      cliOnlineStore.saveAsync(authorityState("CLI在线异步写应拒绝", 90)),
      (error) => error && error.code === "mysql_async_revision_cas_required",
    );
    assert.throws(
      () => cliOnlineStore.save(authorityState("CLI同步写应拒绝", 90)),
      (error) => error && error.code === "mysql_async_revision_cas_required",
    );

    await storeA.saveAsync(authorityState("节点A已扣款", 90));
    await assert.rejects(
      storeB.saveAsync(authorityState("节点B旧根覆盖", 100)),
      (error) => {
        const conflict = error && error.code === "mysql_store_revision_conflict"
          ? error
          : error && error.cause;
        assert.equal(conflict && conflict.code, "mysql_store_revision_conflict");
        assert.equal(conflict.expectedRevision, 0);
        assert.equal(conflict.actualRevision, 1);
        return true;
      },
    );

    assert.deepEqual(shared.commits, ["node_a"]);
    assert.deepEqual(shared.rollbacks, ["node_b"]);
    assert.equal(shared.storeRevision, 1);
    const staleAttemptQueries = shared.queries.filter((entry) => entry.writerId === "node_b");
    assert.equal(staleAttemptQueries.length, 1);
    assert.match(staleAttemptQueries[0].sql, /FOR UPDATE/);
    assert.doesNotMatch(staleAttemptQueries[0].sql, /INSERT INTO profiles|mutation_receipts/);

    const reloaded = storeB.load();
    assert.equal(reloaded.profiles.player_multi_store.profile.displayName, "节点A已扣款");
    assert.equal(reloaded.profiles.player_multi_store.profile.stoneCoins, 90);
    await storeB.saveAsync(authorityState("节点B基于新根", 90, 3));
    assert.deepEqual(shared.commits, ["node_a", "node_b"]);
    assert.equal(shared.storeRevision, 2);
    const retrySql = shared.queries
      .filter((entry) => entry.writerId === "node_b")
      .slice(1)
      .map((entry) => `${entry.sql}\n${JSON.stringify(entry.params || [])}`)
      .join("\n");
    assert.match(retrySql, /节点B基于新根/);
    const retryProfileWrite = shared.queries.find((entry) => (
      entry.writerId === "node_b"
      && /^INSERT\s+INTO\s+profiles\b/i.test(entry.sql.trim())
    ));
    assert.match(retryProfileWrite.sql, /"displayName":"节点B基于新根"/);
    assert.match(retryProfileWrite.sql, /"stoneCoins":90/);

    assert.throws(
      () => storeA.save(authorityState("同步写应拒绝", 90, 3)),
      (error) => error && error.code === "mysql_async_revision_cas_required",
    );
    maintenanceStore = createStore("maintenance", {singleWriterMaintenance: true});
    maintenanceStore.load();
    maintenanceStore.save(authorityState("停服维护", 90, 4));
    const maintenanceState = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.equal(maintenanceState.storeRevision, 3);
    const maintenanceSql = fs.readFileSync(maintenanceSqlPath, "utf8");
    assert.match(maintenanceSql, /START TRANSACTION/);
    assert.match(maintenanceSql, /UPDATE auth_store_revisions SET revision = revision \+ 1/);
    assert.match(maintenanceSql, /COMMIT/);
  } finally {
    if (maintenanceStore !== null) await maintenanceStore.close();
    await cliOnlineStore.close();
    await storeA.close();
    await storeB.close();
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("a zero-row revision CAS rolls back without advancing the local baseline and the same candidate can retry", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-zero-row-cas-"));
  const fixture = createRevisionLoaderFixture(tempDir);
  const {pool, shared} = createRetryableRevisionPool({failRevisionUpdates: 1});
  const store = createRevisionTestStore(fixture.fakeMysqlPath, pool);
  const candidate = authorityState("条件更新重试", 88, 2);
  try {
    store.load();
    await assert.rejects(
      store.saveAsync(candidate),
      (error) => {
        assert.equal(error && error.code, "mysql_store_revision_conflict");
        assert.equal(error && error.expectedRevision, 0);
        assert.equal(error && error.actualRevision, undefined);
        return true;
      },
    );

    assert.equal(shared.revision, 0);
    assert.equal(shared.transactions.length, 1);
    assert.equal(shared.transactions[0].begun, true);
    assert.equal(shared.transactions[0].committed, false);
    assert.equal(shared.transactions[0].rolledBack, true);
    assert.equal(shared.transactions[0].released, true);
    const firstBusinessSql = transactionBusinessSql(shared.transactions[0]);
    assert.ok(firstBusinessSql.length > 0);
    assert.match(firstBusinessSql.join("\n"), /条件更新重试/);

    await store.saveAsync(candidate);
    assert.equal(shared.revision, 1);
    assert.equal(shared.transactions.length, 2);
    assert.equal(shared.transactions[1].begun, true);
    assert.equal(shared.transactions[1].committed, true);
    assert.equal(shared.transactions[1].rolledBack, false);
    assert.equal(shared.transactions[1].released, true);
    assert.deepEqual(transactionBusinessSql(shared.transactions[1]), firstBusinessSql);
    assert.equal(shared.updateAttempts, 2);
    assert.equal(shared.commitAttempts, 1);
  } finally {
    await store.close();
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("a thrown COMMIT is ambiguous and destroys the connection without rollback or blind retry", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-commit-retry-"));
  const fixture = createRevisionLoaderFixture(tempDir);
  const {pool, shared} = createRetryableRevisionPool({failCommits: 1});
  const store = createRevisionTestStore(fixture.fakeMysqlPath, pool);
  const candidate = authorityState("提交失败重试", 77, 2);
  try {
    store.load();
    await assert.rejects(
      store.saveAsync(candidate),
      (error) => {
        assert.equal(error && error.code, "mysql_commit_outcome_ambiguous");
        assert.equal(error && error.message, "MySQL COMMIT 结果暂时无法确认。");
        assert.equal(error && error.commitDispatched, true);
        assert.equal(error && error.transactionPhase, "commit_ambiguous");
        assert.equal(error && error.outcomeUnknown, true);
        assert.equal(error && error.noCommitGuaranteed, false);
        assert.equal(error && error.rollbackConfirmed, false);
        assert.equal(error && error.retryable, false);
        assert.equal(error && error.cause && error.cause.cause && error.cause.cause.message,
          "injected commit failure before durability");
        return true;
      },
    );

    assert.equal(shared.revision, 0);
    assert.equal(shared.transactions.length, 1);
    assert.equal(shared.transactions[0].committed, false);
    assert.equal(shared.transactions[0].rolledBack, false);
    assert.equal(shared.transactions[0].released, false);
    assert.equal(shared.transactions[0].destroyed, true);
    const firstBusinessSql = transactionBusinessSql(shared.transactions[0]);
    assert.ok(firstBusinessSql.length > 0);
    assert.match(firstBusinessSql.join("\n"), /提交失败重试/);
    assert.equal(shared.updateAttempts, 1);
    assert.equal(shared.commitAttempts, 1);
  } finally {
    await store.close();
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("negative, non-numeric and unsafe MySQL store revisions fail closed during load", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-invalid-revision-"));
  const fixture = createRevisionLoaderFixture(tempDir);
  try {
    for (const revision of [-1, "not-a-number", "9007199254740992"]) {
      fs.writeFileSync(fixture.statePath, JSON.stringify({revision}));
      const store = createRevisionTestStore(fixture.fakeMysqlPath, {
        async getConnection() {
          throw new Error("invalid revision must fail before pool acquisition");
        },
        async end() {},
      });
      assert.throws(
        () => store.load(),
        (error) => error && error.code === "mysql_store_revision_missing",
        `revision ${revision} must fail closed`,
      );
    }
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("writable schema setup creates and seeds the global auth store revision", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-revision-schema-"));
  const fixture = createRevisionLoaderFixture(tempDir);
  const store = createMysqlAuthStore({
    mysqlPath: fixture.fakeMysqlPath,
    host: "127.0.0.1",
    port: 3306,
    user: "tester",
    password: "dummy",
    database: "beastbound_test",
    createDatabase: false,
    ensureSchema: true,
    usePool: true,
    poolFactory: () => ({async getConnection() {}, async end() {}}),
  });
  try {
    store.load();
    const sql = fs.readFileSync(fixture.sqlLogPath, "utf8");
    const createIndex = sql.indexOf("CREATE TABLE IF NOT EXISTS auth_store_revisions");
    const seedIndex = sql.indexOf("INSERT IGNORE INTO auth_store_revisions (scope_key, revision) VALUES ('auth', 0)");
    assert.ok(createIndex >= 0);
    assert.ok(seedIndex > createIndex);
    assert.match(sql, /scope_key VARCHAR\(64\) PRIMARY KEY[\s\S]+revision BIGINT UNSIGNED NOT NULL/);
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("the async store does not treat deterministic store or resource conflicts as ambiguous commits", async (t) => {
  for (const code of ["mysql_store_revision_conflict", "mysql_resource_revision_conflict"]) {
    await t.test(code, async () => {
      let reloadCalls = 0;
      const conflict = new Error("stale writer");
      conflict.code = code;
      const store = createAsyncWriteAuthStore({
        mode: "mysql-conflict-fixture",
        load() {
          reloadCalls += 1;
          throw new Error("deterministic conflict must not trigger ambiguous reload");
        },
        async saveAsync() {
          throw conflict;
        },
      }, {onError() {}});

      await assert.rejects(
        store.save({schemaVersion: 1, profiles: {}}),
        (error) => error === conflict,
      );
      assert.equal(reloadCalls, 0);
      assert.equal(store.metrics().revisionConflicts, 1);
      assert.equal(store.metrics().ambiguousCommitRecoveries, 0);
    });
  }
});

test("a writable pooled store with schema setup disabled still fails closed when revision metadata is absent", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-revision-missing-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  if (stdin.includes("information_schema.columns AS history_column")) {
    process.stdout.write("1\\tbigint unsigned\\tNO\\tauto_increment\\t1\\n");
  } else if (stdin.includes("SELECT 'server_state'")) {
    process.stdout.write(["server_state", "auth", JSON.stringify({schemaVersion: 2, storage: "mysql_entity_tables"})].join("\\t") + "\\n");
  } else if (stdin.includes("information_schema.tables")) {
    process.stdout.write("0\\n");
  }
});
`, {mode: 0o755});
  const store = createMysqlAuthStore({
    mysqlPath: fakeMysqlPath,
    host: "127.0.0.1",
    port: 3306,
    user: "tester",
    password: "dummy",
    database: "beastbound_test",
    createDatabase: false,
    ensureSchema: false,
    usePool: true,
    poolFactory: () => ({async getConnection() {}, async end() {}}),
  });
  try {
    assert.throws(
      () => store.load(),
      (error) => error && error.code === "mysql_store_revision_missing",
    );
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("a service reloads the winning root before retrying a conflicted durable intent", async () => {
  const winningStore = createMemoryAuthStore();
  const winningService = createAuthService({store: winningStore});
  const winner = await winningService.invokeDurable("register", [{
    username: "revisionwinner",
    password: "test1234",
    displayName: "其他节点赢家",
  }], {actionId: "test competing register"});
  assert.equal(winner.ok, true);
  const winningSnapshot = JSON.parse(JSON.stringify(winningStore.load()));

  let sharedSnapshot = {};
  let saveCalls = 0;
  let loadCalls = 0;
  const underlying = {
    mode: "mysql-service-conflict-fixture",
    load() {
      loadCalls += 1;
      return JSON.parse(JSON.stringify(sharedSnapshot));
    },
    async saveAsync(nextData) {
      saveCalls += 1;
      if (saveCalls === 1) {
        sharedSnapshot = winningSnapshot;
        const conflict = new Error("stale service root");
        conflict.code = "mysql_store_revision_conflict";
        throw conflict;
      }
      sharedSnapshot = JSON.parse(JSON.stringify(nextData));
    },
  };
  const asyncStore = createAsyncWriteAuthStore(underlying, {onError() {}});
  const service = createAuthService({store: asyncStore});

  await assert.rejects(
    service.invokeDurable("register", [{
      username: "revisionretry",
      password: "test1234",
      displayName: "冲突后重试",
    }], {actionId: "test conflicted register"}),
    (error) => error && error.code === "storage_write_failed",
  );
  assert.equal(loadCalls, 1);
  assert.equal(Boolean(service.snapshot().accounts.revisionretry), false);
  assert.equal(Boolean(service.snapshot().accounts.revisionwinner), false);

  const retried = await service.invokeDurable("register", [{
    username: "revisionretry",
    password: "test1234",
    displayName: "冲突后重试",
  }], {actionId: "test conflicted register"});
  assert.equal(retried.ok, true);
  assert.equal(loadCalls, 2);
  assert.equal(saveCalls, 2);
  assert.equal(Boolean(service.snapshot().accounts.revisionwinner), true);
  assert.equal(Boolean(service.snapshot().accounts.revisionretry), true);
  assert.equal(Boolean(sharedSnapshot.accounts.revisionwinner), true);
  assert.equal(Boolean(sharedSnapshot.accounts.revisionretry), true);
  assert.equal(asyncStore.metrics().revisionConflicts, 1);
});
