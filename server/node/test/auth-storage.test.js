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
      hasBattleRecords: stdin.includes("INSERT INTO battle_records"),
      hasFamilies: stdin.includes("INSERT INTO families"),
      hasManors: stdin.includes("INSERT INTO manors"),
      hasManorWars: stdin.includes("INSERT INTO manor_wars"),
      hasManorBattles: stdin.includes("INSERT INTO manor_battles"),
    }) + "\\n");
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
    assert.ok(calls.some((call) => call.hasBattleRecords));
    assert.ok(calls.some((call) => call.hasFamilies));
    assert.ok(calls.some((call) => call.hasManors));
    assert.ok(calls.some((call) => call.hasManorWars));
    assert.ok(calls.some((call) => call.hasManorBattles));
    assert.ok(calls.some((call) => call.stdinLength > 4096));
    const saveCall = calls.find((call) => String(call.stdin || "").includes("START TRANSACTION"));
    assert.ok(saveCall);
    assert.equal(/\bDELETE FROM accounts\b/.test(saveCall.stdin), false);
    assert.equal(/\bDELETE FROM sessions\b/.test(saveCall.stdin), false);
    assert.equal(saveCall.stdin.includes("INSERT INTO player_positions"), false);
    assert.equal(saveCall.stdin.includes("INSERT INTO battle_rooms"), false);
    assert.equal(saveCall.stdin.includes("INSERT INTO battle_invites"), false);
    assert.ok(saveCall.stdin.includes("mysql_entity_tables"));
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {"recursive": true, "force": true});
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
    ["server_state", "auth", {schemaVersion: 2, storage: "mysql_entity_tables"}],
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
      profile: {name: "实体档案", level: 12},
    }],
    ["mail_messages", "mail_entity", {
      mailId: "mail_entity",
      senderAccountId: "acc_entity",
      recipientAccountId: "acc_entity",
      title: "实体邮件",
      createdAt: "2026-07-04T00:02:00.000Z",
      readAt: null,
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
    assert.equal(loaded.mailMessages.mail_entity.title, "实体邮件");
    assert.equal(loaded.gmCommandGrants.acc_entity[0].commandId, "*");
    assert.equal(loaded.battleTrace[0].traceId, "trace_entity");
    assert.equal(loaded.serviceEventSeq, 7);
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
    store.save(firstState);
    store.save(secondState);
    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const saveCalls = calls.filter((call) => call.stdin.includes("START TRANSACTION"));
    assert.equal(saveCalls.length, 2);
    const secondSave = saveCalls[1].stdin;
    assert.ok(secondSave.includes("INSERT INTO server_state"));
    assert.ok(secondSave.includes("mysql_entity_tables"));
    assert.ok(secondSave.includes("INSERT INTO accounts"));
    assert.ok(secondSave.includes("ON DUPLICATE KEY UPDATE"));
    assert.ok(secondSave.includes("DELETE FROM mail_messages WHERE mail_id = 'mail_incremental'"));
    assert.equal(/\bDELETE FROM accounts\b/.test(secondSave), false);
    assert.equal(/\bDELETE FROM sessions\b/.test(secondSave), false);
    assert.equal(secondSave.includes("INSERT INTO families"), false);
    assert.equal(secondSave.includes(unchangedFamilyMarker), false);
    assert.equal(secondSave.includes("INSERT INTO player_positions"), false);
    assert.equal(secondSave.includes("INSERT INTO battle_rooms"), false);
    assert.equal(secondSave.includes("INSERT INTO battle_invites"), false);
    assert.equal(secondSave.includes("room_incremental"), false);
    assert.equal(secondSave.includes("invite_incremental"), false);
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {"recursive": true, "force": true});
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
});
`, {"mode": 0o755});
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
      const store = createDefaultStore();
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
    });
    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.ok(calls.some((call) => call.stdin.includes("CREATE TABLE IF NOT EXISTS server_state")));
    const saveCall = calls.find((call) => call.stdin.includes("INSERT INTO server_state"));
    assert.ok(saveCall);
    assert.equal(saveCall.argv.includes("-e"), false);
    assert.ok(saveCall.stdin.includes("INSERT INTO accounts"));
    assert.ok(saveCall.stdin.includes("INSERT INTO mail_messages"));
    assert.ok(saveCall.stdin.includes("INSERT INTO chat_messages"));
    assert.equal(saveCall.stdin.includes("INSERT INTO player_positions"), false);
    assert.equal(saveCall.stdin.includes("INSERT INTO battle_rooms"), false);
    assert.equal(saveCall.stdin.includes("INSERT INTO battle_invites"), false);
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
      });
    });
    const saved = JSON.parse(fs.readFileSync(storePath, "utf8"));
    assert.equal(saved.accounts.jsonuser.username, "jsonuser");
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

test("async store write failures bubble up as storage_write_failed and self-heal", async () => {
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

  const healthy = service.register({"username": "storagefaila", "password": "test1234", "displayName": "写失败A"});
  assert.equal(healthy.ok, true);
  await store.flush();

  failing = true;
  const doomed = service.register({"username": "storagefailb", "password": "test1234", "displayName": "写失败B"});
  assert.equal(doomed.ok, true);
  await assert.rejects(store.flush(), /disk full/);
  assert.equal(asyncErrors.length, 1);

  failing = false;
  assert.throws(
    () => service.register({"username": "storagefailc", "password": "test1234", "displayName": "写失败C"}),
    (error) => error.code === "storage_write_failed"
  );
  await store.flush();

  const recovered = service.register({"username": "storagefaild", "password": "test1234", "displayName": "写失败D"});
  assert.equal(recovered.ok, true);
  await store.flush();
  const persisted = base.load();
  assert.equal(Boolean(persisted.accounts.storagefaila), true);
  assert.equal(Boolean(persisted.accounts.storagefaild), true);
});

test("HTTP endpoints return 503 with a player-facing message after async write failure", async (t) => {
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
  const doomed = await fetchJson(`${base503}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "http503b", "password": "test1234", "displayName": "接口写失败B"}),
  });
  assert.equal(doomed.ok, true);
  await assert.rejects(store.flush(), /disk full/);
  failing = false;

  const rejectedResponse = await fetch(`${base503}/auth/register`, {
    "method": "POST",
    "headers": {
      "content-type": "application/json",
      [CLIENT_VERSION_HEADER]: SERVER_VERSION,
      [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
    },
    "body": JSON.stringify({"username": "http503c", "password": "test1234", "displayName": "接口写失败C"}),
  });
  assert.equal(rejectedResponse.status, 503);
  const rejected = await rejectedResponse.json();
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "storage_write_failed");
  assert.match(String(rejected.message || ""), /存档暂时不可用/);

  const recovered = await fetchJson(`${base503}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "http503d", "password": "test1234", "displayName": "接口写失败D"}),
  });
  assert.equal(recovered.ok, true);
});
