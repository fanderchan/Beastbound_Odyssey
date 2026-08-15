"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createMysqlAuthStore,
  __runMysqlClusterLoginCredentialReadForTest,
  __runMysqlClusterSessionIdentityReadForTest,
} = require("../src/mysql-store");

const MYSQL_SESSION_POLICY_SQL =
  "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?";
const TOKEN_HASH = "d".repeat(64);

function account(overrides = {}) {
  return {
    accountId: "acc_mysql_cluster_owner",
    username: "clusterowner",
    displayName: "集群权威账号",
    role: "player",
    passwordSalt: "a".repeat(32),
    passwordHash: "b".repeat(64),
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:01:00.000Z",
    schemaVersion: 1,
    ...overrides,
  };
}

function session(overrides = {}) {
  return {
    sessionId: "sess_mysql_cluster_owner",
    accountId: "acc_mysql_cluster_owner",
    tokenHash: TOKEN_HASH,
    expiresAt: "2026-08-22T00:00:00.000Z",
    revokedAt: null,
    createdAt: "2026-08-15T00:02:00.000Z",
    schemaVersion: 1,
    ...overrides,
  };
}

function loginRow(document = account(), overrides = {}) {
  return {
    store_revision: 31,
    account_id: document.accountId,
    username: document.username,
    display_name: document.displayName,
    role: document.role,
    created_at: document.createdAt,
    updated_at: document.updatedAt,
    document_json: document,
    ...overrides,
  };
}

function missingLoginRow(overrides = {}) {
  return {
    store_revision: 31,
    account_id: null,
    username: null,
    display_name: null,
    role: null,
    created_at: null,
    updated_at: null,
    document_json: null,
    ...overrides,
  };
}

function sessionRow(sessionDocument = session(), accountDocument = account(), overrides = {}) {
  return {
    store_revision: 32,
    session_id: sessionDocument.sessionId,
    session_account_id: sessionDocument.accountId,
    token_hash: sessionDocument.tokenHash,
    expires_at: sessionDocument.expiresAt,
    revoked_at: sessionDocument.revokedAt,
    session_document_json: sessionDocument,
    account_id: accountDocument.accountId,
    username: accountDocument.username,
    display_name: accountDocument.displayName,
    role: accountDocument.role,
    created_at: accountDocument.createdAt,
    updated_at: accountDocument.updatedAt,
    account_document_json: accountDocument,
    ...overrides,
  };
}

function missingSessionRow(overrides = {}) {
  return {
    store_revision: 32,
    session_id: null,
    session_account_id: null,
    token_hash: null,
    expires_at: null,
    revoked_at: null,
    session_document_json: null,
    account_id: null,
    username: null,
    display_name: null,
    role: null,
    created_at: null,
    updated_at: null,
    account_document_json: null,
    ...overrides,
  };
}

function fakePool({loginRows = [loginRow()], sessionRows = [sessionRow()]} = {}) {
  const state = {
    begun: 0,
    committed: 0,
    events: [],
    queries: [],
    released: 0,
    rolledBack: 0,
  };
  const connection = {
    async beginTransaction() {
      state.begun += 1;
      state.events.push("begin");
    },
    async query(statement, params = []) {
      const rawSql = String(statement && statement.sql || statement).trim();
      const sql = rawSql.replace(/\s+/g, " ");
      if (rawSql === MYSQL_SESSION_POLICY_SQL) {
        assert.deepEqual(params, [3, 5]);
        state.events.push("session");
        return [{affectedRows: 0}, []];
      }
      assert.equal(/^SET\s+(?:GLOBAL|PERSIST|PERSIST_ONLY|SESSION)\b/i.test(sql), false, sql);
      state.events.push("query");
      state.queries.push({sql, params: structuredClone(params)});
      if (/LEFT JOIN sessions AS session/i.test(sql)) {
        return [structuredClone(sessionRows), []];
      }
      assert.match(sql, /LEFT JOIN accounts AS account/i);
      return [structuredClone(loginRows), []];
    },
    async commit() {
      state.committed += 1;
      state.events.push("commit");
    },
    async rollback() {
      state.rolledBack += 1;
      state.events.push("rollback");
    },
    release() {
      state.released += 1;
    },
    destroy() {},
  };
  return {
    pool: {async getConnection() { return connection; }},
    state,
  };
}

test("cluster login credential uses one parameterized username query behind session policy", async () => {
  const fake = fakePool();
  const view = await __runMysqlClusterLoginCredentialReadForTest(fake.pool, "ClusterOwner");
  assert.equal(view.storeRevision, 31);
  assert.equal(view.username, "clusterowner");
  assert.equal(view.account.accountId, "acc_mysql_cluster_owner");
  assert.equal(view.account.passwordHash, "b".repeat(64));
  assert.deepEqual(fake.state.events, ["session", "begin", "query", "commit"]);
  assert.equal(fake.state.queries.length, 1);
  assert.match(fake.state.queries[0].sql, /account\.username = \?/i);
  assert.match(fake.state.queries[0].sql, /revision_row\.scope_key = \?/i);
  assert.deepEqual(fake.state.queries[0].params, ["clusterowner", "auth"]);
  assert.equal(fake.state.released, 1);
  assert.equal(fake.state.rolledBack, 0);
});

test("cluster session identity uses one parameterized token hash query and joins its account", async () => {
  const fake = fakePool();
  const view = await __runMysqlClusterSessionIdentityReadForTest(fake.pool, TOKEN_HASH);
  assert.equal(view.storeRevision, 32);
  assert.equal(view.session.sessionId, "sess_mysql_cluster_owner");
  assert.equal(view.account.accountId, view.session.accountId);
  assert.deepEqual(fake.state.events, ["session", "begin", "query", "commit"]);
  assert.equal(fake.state.queries.length, 1);
  assert.match(fake.state.queries[0].sql, /session\.token_hash = \?/i);
  assert.match(fake.state.queries[0].sql, /account\.account_id = session\.account_id/i);
  assert.deepEqual(fake.state.queries[0].params, [TOKEN_HASH, "auth"]);
  assert.equal(fake.state.released, 1);
  assert.equal(fake.state.rolledBack, 0);
});

test("cluster exact readers return canonical missing views without inventing identity", async () => {
  const login = fakePool({loginRows: [missingLoginRow()]});
  const loginView = await __runMysqlClusterLoginCredentialReadForTest(
    login.pool,
    "missinguser",
  );
  assert.equal(loginView.account, null);
  assert.equal(loginView.storeRevision, 31);

  const identity = fakePool({sessionRows: [missingSessionRow()]});
  const sessionView = await __runMysqlClusterSessionIdentityReadForTest(
    identity.pool,
    TOKEN_HASH,
  );
  assert.equal(sessionView.session, null);
  assert.equal(sessionView.account, null);
  assert.equal(sessionView.storeRevision, 32);
});

test("cluster exact readers roll back SQL mirror drift and partial joins", async () => {
  for (const [kind, fake] of [
    ["login", fakePool({loginRows: [loginRow(account(), {display_name: "漂移名称"})]})],
    ["login", fakePool({loginRows: [missingLoginRow({username: "partial"})]})],
    ["session", fakePool({sessionRows: [sessionRow(session(), account(), {token_hash: "e".repeat(64)})]})],
    ["session", fakePool({sessionRows: [missingSessionRow({account_id: "acc_partial"})]})],
  ]) {
    await assert.rejects(
      kind === "login"
        ? __runMysqlClusterLoginCredentialReadForTest(fake.pool, "clusterowner")
        : __runMysqlClusterSessionIdentityReadForTest(fake.pool, TOKEN_HASH),
      (error) => error && error.code === "mysql_cluster_account_authority_integrity_invalid",
    );
    assert.equal(fake.state.committed, 0);
    assert.equal(fake.state.rolledBack, 1);
    assert.equal(fake.state.released, 1);
  }
});

test("cluster exact-read keys are rejected before pool checkout", async () => {
  let checkouts = 0;
  const pool = {
    async getConnection() {
      checkouts += 1;
      throw new Error("must not acquire");
    },
  };
  await assert.rejects(
    __runMysqlClusterLoginCredentialReadForTest(pool, "x"),
    (error) => error && error.code === "cluster_login_username_invalid",
  );
  await assert.rejects(
    __runMysqlClusterSessionIdentityReadForTest(pool, "not-a-token-hash"),
    (error) => error && error.code === "cluster_session_token_hash_invalid",
  );
  assert.equal(checkouts, 0);
});

test("live cluster authority reload uses the asynchronous MySQL client path", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-cluster-load-"));
  const fakeMysql = path.join(tempDir, "mysql");
  fs.writeFileSync(
    fakeMysql,
    "#!/bin/sh\nsleep 0.05\nprintf 'store_revision\\tauth\\t7\\nserver_state\\tauth\\t{\"storage\":\"mysql_entity_tables\",\"serviceEventSeq\":0}\\n'\n",
    {mode: 0o700},
  );
  t.after(() => fs.rmSync(tempDir, {recursive: true, force: true}));
  const store = createMysqlAuthStore({
    mysqlPath: fakeMysql,
    host: "127.0.0.1",
    port: 3306,
    user: "tester",
    password: "dummy",
    database: "beastbound_test",
    createDatabase: false,
    ensureSchema: false,
    readOnly: true,
    usePool: true,
  });
  t.after(() => store.close());

  let timerRan = false;
  const timer = setTimeout(() => { timerRan = true; }, 10);
  const snapshot = await store.readClusterAuthoritySnapshot();
  clearTimeout(timer);
  assert.equal(timerRan, true);
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.storeRevision, 7);
  assert.deepEqual(snapshot.data.accounts, {});
});
