"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  decodeMailInboxCursor,
} = require("../src/auth/mail-inbox-pagination");
const {
  __runMysqlMailInboxPageReadForTest: runMysqlMailInboxPageRead,
  createMysqlAuthStore,
} = require("../src/mysql-store");

const ACCOUNT_ID = "acc_mail_page_owner";
const OTHER_ACCOUNT_ID = "acc_mail_page_other";
// Legacy rows predate the ISO-only convention. Pagination treats the stored
// VARCHAR as an opaque stable sort key and must never reinterpret it as time.
const CREATED_AT = "2026/07/16 10:00:00";
const OLDER_AT = "2026/07/16 09:00:00";
const MYSQL_SESSION_POLICY_SQL =
  "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?";

function mail(mailId, createdAt, overrides = {}) {
  return {
    mailId,
    senderAccountId: "acc_mail_page_sender",
    recipientAccountId: ACCOUNT_ID,
    title: `分页邮件 ${mailId}`,
    body: "内部邮件文档由 auth-service 再做 public 投影。",
    items: [],
    currency: {},
    createdAt,
    readAt: null,
    schemaVersion: 1,
    ...overrides,
  };
}

function row(document) {
  return {
    mail_id: document.mailId,
    sender_account_id: document.senderAccountId,
    recipient_account_id: document.recipientAccountId,
    title: document.title,
    created_at: document.createdAt,
    read_at: document.readAt,
    document_json: document,
  };
}

function recordingPool(pageRowsByCall, unreadCount = 4) {
  const state = {
    acquisitions: 0,
    pageCall: 0,
    queries: [],
    begun: 0,
    committed: 0,
    rolledBack: 0,
    released: 0,
  };
  const connection = {
    async beginTransaction() { state.begun += 1; },
    async query(statement, params = []) {
      const rawSql = String(statement && statement.sql || statement).trim();
      const sql = rawSql.replace(/\s+/g, " ");
      if (rawSql === MYSQL_SESSION_POLICY_SQL) {
        assert.deepEqual(params, [3, 5]);
        return [{affectedRows: 0}, []];
      }
      state.queries.push({sql, params: structuredClone(params)});
      if (/^SET TRANSACTION ISOLATION LEVEL REPEATABLE READ$/i.test(sql)) {
        return [{affectedRows: 0}, []];
      }
      if (/^SELECT mail_id, sender_account_id/i.test(sql)) {
        const rows = pageRowsByCall[Math.min(state.pageCall, pageRowsByCall.length - 1)] || [];
        state.pageCall += 1;
        return [rows, []];
      }
      if (/^SELECT COUNT\(\*\) AS unread_count/i.test(sql)) {
        return [[{unread_count: String(unreadCount)}], []];
      }
      throw new Error(`unexpected inbox page SQL: ${sql}`);
    },
    async commit() { state.committed += 1; },
    async rollback() { state.rolledBack += 1; },
    release() { state.released += 1; },
    destroy() {},
  };
  return {
    state,
    pool: {
      async getConnection() {
        state.acquisitions += 1;
        return connection;
      },
      async end() {},
    },
  };
}

test("first and next inbox pages use recipient-only keyset SQL, limit+1, tie-break and COUNT", async () => {
  const firstRows = [
    row(mail("mail_page_z", CREATED_AT)),
    row(mail("mail_page_y", CREATED_AT)),
    row(mail("mail_page_x", OLDER_AT)),
  ];
  const nextRows = [
    row(mail("mail_page_x", OLDER_AT)),
    row(mail("mail_page_w", "2026/07/16 08:00:00")),
  ];
  const fake = recordingPool([firstRows, nextRows]);

  const first = await runMysqlMailInboxPageRead(fake.pool, ACCOUNT_ID, {
    limit: 2,
    cursor: null,
  });
  assert.deepEqual(first.mailRows.map(({mailId}) => mailId), ["mail_page_z", "mail_page_y"]);
  assert.equal(first.unreadCount, 4);
  assert.equal(first.hasMore, true);
  assert.deepEqual(decodeMailInboxCursor(first.nextCursor), {
    createdAt: CREATED_AT,
    mailId: "mail_page_y",
  });

  const second = await runMysqlMailInboxPageRead(fake.pool, ACCOUNT_ID, {
    limit: 2,
    cursor: first.nextCursor,
  });
  assert.deepEqual(second.mailRows.map(({mailId}) => mailId), ["mail_page_x", "mail_page_w"]);
  assert.equal(second.hasMore, false);
  assert.equal(second.nextCursor, null);

  const pageQueries = fake.state.queries.filter(({sql}) => /^SELECT mail_id/i.test(sql));
  const countQueries = fake.state.queries.filter(({sql}) => /^SELECT COUNT\(\*\)/i.test(sql));
  assert.equal(pageQueries.length, 2);
  assert.equal(countQueries.length, 2);
  assert.match(pageQueries[0].sql, /WHERE recipient_account_id = \?/i);
  assert.match(pageQueries[0].sql, /ORDER BY created_at DESC, mail_id DESC LIMIT \?/i);
  assert.doesNotMatch(pageQueries[0].sql, /\bOFFSET\b/i);
  assert.deepEqual(pageQueries[0].params, [ACCOUNT_ID, 3]);
  assert.match(
    pageQueries[1].sql,
    /created_at < \? OR \(created_at = \? AND mail_id < \?\)/i,
  );
  assert.doesNotMatch(pageQueries[1].sql, /\bOFFSET\b/i);
  assert.deepEqual(pageQueries[1].params, [
    ACCOUNT_ID,
    CREATED_AT,
    CREATED_AT,
    "mail_page_y",
    3,
  ]);
  assert.ok(countQueries.every(({sql, params}) => (
    /WHERE recipient_account_id = \? AND read_at IS NULL/i.test(sql)
    && params.length === 1
    && params[0] === ACCOUNT_ID
  )));
  assert.equal(fake.state.committed, 2);
  assert.equal(fake.state.rolledBack, 0);
});

test("MySQL collation owns mixed-case opaque key ordering across the page cursor", async () => {
  // utf8mb4_0900_ai_ci orders these keys differently from JavaScript code-point
  // comparison. The same SQL collation owns both ORDER BY and the keyset WHERE,
  // while every returned row (including the limit+1 sentinel) is still certified.
  const mysqlOrderedRows = [
    row(mail("mail_page_upper", "B")),
    row(mail("mail_page_lower", "a")),
  ];
  const fake = recordingPool([mysqlOrderedRows, [mysqlOrderedRows[1]]], 2);

  const first = await runMysqlMailInboxPageRead(fake.pool, ACCOUNT_ID, {
    limit: 1,
    cursor: null,
  });
  assert.deepEqual(first.mailRows.map(({mailId}) => mailId), ["mail_page_upper"]);
  assert.equal(first.hasMore, true);

  const second = await runMysqlMailInboxPageRead(fake.pool, ACCOUNT_ID, {
    limit: 1,
    cursor: first.nextCursor,
  });
  assert.deepEqual(second.mailRows.map(({mailId}) => mailId), ["mail_page_lower"]);
  assert.equal(second.hasMore, false);

  const pageQueries = fake.state.queries.filter(({sql}) => /^SELECT mail_id/i.test(sql));
  assert.equal(pageQueries.length, 2);
  assert.ok(pageQueries.every(({sql}) => (
    /ORDER BY created_at DESC, mail_id DESC LIMIT \?/i.test(sql)
  )));
  assert.match(
    pageQueries[1].sql,
    /created_at < \? OR \(created_at = \? AND mail_id < \?\)/i,
  );
  assert.deepEqual(pageQueries[1].params, [
    ACCOUNT_ID,
    "B",
    "B",
    "mail_page_upper",
    2,
  ]);
});

test("invalid cursor fails before connection acquisition and partial pages expose no adopt contract", async () => {
  const fake = recordingPool([[]], 0);
  await assert.rejects(
    runMysqlMailInboxPageRead(fake.pool, ACCOUNT_ID, {limit: 2, cursor: "not-a-cursor"}),
    (error) => error && error.code === "mail_inbox_pagination_invalid",
  );
  assert.equal(fake.state.acquisitions, 0);
  assert.deepEqual(fake.state.queries, []);

  const one = recordingPool([[row(mail("mail_page_only", CREATED_AT))]], 1);
  const page = await runMysqlMailInboxPageRead(one.pool, ACCOUNT_ID, {limit: 2, cursor: null});
  assert.deepEqual(Object.keys(page).sort(), [
    "hasMore",
    "mailRows",
    "nextCursor",
    "recipientAccountId",
    "unreadCount",
  ]);
  assert.equal(Object.hasOwn(page, "mailPartitions"), false);
  assert.equal(Object.hasOwn(page, "adopt"), false);
});

test("recipient identity is present in every page/count predicate and cross-recipient rows fail closed", async () => {
  const leaked = mail("mail_page_leaked", CREATED_AT, {recipientAccountId: OTHER_ACCOUNT_ID});
  const fake = recordingPool([[row(leaked)]], 0);
  await assert.rejects(
    runMysqlMailInboxPageRead(fake.pool, ACCOUNT_ID, {limit: 2, cursor: null}),
    (error) => error
      && error.code === "mysql_shared_asset_integrity_invalid"
      && error.reason === "mail_message_row_drift",
  );
  const dataQueries = fake.state.queries.filter(({sql}) => !/^SET /i.test(sql));
  assert.ok(dataQueries.every(({params}) => params[0] === ACCOUNT_ID));
  assert.equal(dataQueries.some(({params}) => params.includes(OTHER_ACCOUNT_ID)), false);
});

test("store exposes the read-only page method without adopting a mailbox replacement", async () => {
  const fake = recordingPool([[row(mail("mail_page_store", CREATED_AT))]], 1);
  const store = createMysqlAuthStore({
    readOnly: true,
    ensureSchema: false,
    usePool: true,
    poolFactory: () => fake.pool,
    host: "127.0.0.1",
    port: 3306,
    user: "reader",
    password: "test-only",
    database: "beastbound_test",
  });
  const result = await store.readMailInboxPage(ACCOUNT_ID, {limit: 2, cursor: null});
  assert.deepEqual(result.mailRows.map(({mailId}) => mailId), ["mail_page_store"]);
  assert.equal(result.recipientAccountId, ACCOUNT_ID);
  await store.close();
});

test("writable startup installs and then validates the exact three-column inbox index", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mail-page-index-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const statePath = path.join(tempDir, "state.json");
  const logPath = path.join(tempDir, "calls.jsonl");
  const previousStatePath = process.env.FAKE_MAIL_PAGE_INDEX_STATE;
  const previousLogPath = process.env.FAKE_MAIL_PAGE_INDEX_LOG;
  fs.writeFileSync(statePath, JSON.stringify({mailIndex: false}));
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MAIL_PAGE_INDEX_LOG, JSON.stringify({stdin}) + "\\n");
  const state = JSON.parse(fs.readFileSync(process.env.FAKE_MAIL_PAGE_INDEX_STATE, "utf8"));
  if (stdin.includes("FROM information_schema.columns AS history_column")) {
    process.stdout.write("1\\tbigint unsigned\\tNO\\tauto_increment\\t1\\n");
    return;
  }
  if (stdin.includes("idx_mail_recipient_created_id") && stdin.includes("FROM information_schema.statistics")) {
    if (state.mailIndex === "invalid") {
      process.stdout.write("2\\t1:recipient_account_id,2:created_at\\t0\\t0\\tBTREE\\n");
    } else if (state.mailIndex === "invisible") {
      process.stdout.write("3\\t1:recipient_account_id,2:created_at,3:mail_id\\t0\\t1\\tBTREE\\n");
    } else if (state.mailIndex === "hash") {
      process.stdout.write("3\\t1:recipient_account_id,2:created_at,3:mail_id\\t0\\t0\\tHASH\\n");
    } else if (state.mailIndex === true) {
      process.stdout.write("3\\t1:recipient_account_id,2:created_at,3:mail_id\\t0\\t0\\tBTREE\\n");
    } else {
      process.stdout.write("0\\t\\t0\\t0\\t\\n");
    }
    return;
  }
  if (/ALTER TABLE mail_messages[\\s\\S]+ADD INDEX idx_mail_recipient_created_id/.test(stdin)) {
    if (state.alterFailure === "lock_timeout") {
      process.stderr.write("ERROR 1205 (HY000): Lock wait timeout exceeded; try restarting transaction\\n");
      process.exitCode = 1;
      return;
    }
    if (state.alterFailure === "hang") {
      setTimeout(() => {}, 10000);
      return;
    }
    state.mailIndex = true;
    fs.writeFileSync(process.env.FAKE_MAIL_PAGE_INDEX_STATE, JSON.stringify(state));
    return;
  }
  if (stdin.includes("SELECT 'server_state'")) {
    process.stdout.write(["server_state", "auth", JSON.stringify({schemaVersion: 2, storage: "mysql_entity_tables"})].join("\\t") + "\\n");
  }
});
`, {mode: 0o755});
  try {
    process.env.FAKE_MAIL_PAGE_INDEX_STATE = statePath;
    process.env.FAKE_MAIL_PAGE_INDEX_LOG = logPath;
    const options = {
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "writer",
      password: "test-only",
      database: "beastbound_test",
      createDatabase: false,
      // Online DDL has its own bounded window. It must not inherit the normal
      // transaction deadline (whose default remains 6000ms).
      mailInboxIndexMigrationTimeoutMs: 100,
      transactionPolicy: {
        metadataLockWaitTimeoutSeconds: 2,
      },
    };
    createMysqlAuthStore(options).load();
    createMysqlAuthStore(options).load();

    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map(JSON.parse);
    const ddl = calls.find(({stdin}) => stdin.includes("CREATE TABLE IF NOT EXISTS mail_messages"));
    const alters = calls.filter(({stdin}) => /ALTER TABLE mail_messages/.test(stdin));
    assert.ok(ddl);
    assert.match(
      ddl.stdin,
      /INDEX idx_mail_recipient_created_id \(recipient_account_id, created_at, mail_id\)/,
    );
    assert.equal(alters.length, 1, "existing table is migrated only on the first startup");
    assert.match(alters[0].stdin, /SET SESSION lock_wait_timeout = 2;/);
    assert.match(alters[0].stdin, /ALGORITHM=INPLACE[\s\S]*LOCK=NONE/);
    assert.ok(calls.every(({stdin}) => !/SET\s+(?:GLOBAL|PERSIST|PERSIST_ONLY)\b/i.test(stdin)));
    assert.ok(calls.filter(({stdin}) => (
      !/ALTER TABLE mail_messages/.test(stdin)
      && !/CREATE TABLE IF NOT EXISTS mail_storage_control/.test(stdin)
    )).every(
      ({stdin}) => !/SET SESSION lock_wait_timeout/i.test(stdin),
    ));

    for (const mailIndex of ["invalid", "invisible", "hash"]) {
      fs.writeFileSync(statePath, JSON.stringify({mailIndex}));
      assert.throws(
        () => createMysqlAuthStore(options).load(),
        (error) => error && error.code === "mysql_mail_inbox_page_index_contract_invalid",
        mailIndex,
      );
    }

    fs.writeFileSync(statePath, JSON.stringify({mailIndex: false, alterFailure: "lock_timeout"}));
    assert.throws(
      () => createMysqlAuthStore(options).load(),
      (error) => error
        && error.code === "mysql_mail_inbox_page_index_migration_lock_timeout"
        && error.timeoutSeconds === 2,
    );

    fs.writeFileSync(statePath, JSON.stringify({mailIndex: false, alterFailure: "hang"}));
    assert.throws(
      () => createMysqlAuthStore(options).load(),
      (error) => error
        && error.code === "mysql_mail_inbox_page_index_migration_timeout"
        && error.timeoutMs === 100,
    );
  } finally {
    if (previousStatePath === undefined) {
      delete process.env.FAKE_MAIL_PAGE_INDEX_STATE;
    } else {
      process.env.FAKE_MAIL_PAGE_INDEX_STATE = previousStatePath;
    }
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MAIL_PAGE_INDEX_LOG;
    } else {
      process.env.FAKE_MAIL_PAGE_INDEX_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});
