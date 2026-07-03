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
      stdinLength: stdin.length,
      hasExecuteArg: process.argv.slice(2).includes("-e"),
      hasServerState: stdin.includes("INSERT INTO server_state"),
      hasBattleRecords: stdin.includes("INSERT INTO battle_records"),
      hasFamilies: stdin.includes("INSERT INTO families"),
      hasManors: stdin.includes("INSERT INTO manors"),
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
    assert.ok(calls.some((call) => call.hasManorBattles));
    assert.ok(calls.some((call) => call.stdinLength > 4096));
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {"recursive": true, "force": true});
  }
});

test("mysql store loads state documents larger than the Node default buffer", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-store-load-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdin += chunk;
});
process.stdin.on("end", () => {
  if (!stdin.includes("SELECT CAST(document_json AS CHAR) FROM server_state")) {
    return;
  }
  const largeNote = "x".repeat(2 * 1024 * 1024);
  process.stdout.write(JSON.stringify({
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
  }) + "\\n");
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
