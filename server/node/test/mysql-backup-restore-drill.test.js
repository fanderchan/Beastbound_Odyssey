"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const test = require("node:test");

const TOOL_URL = pathToFileURL(path.resolve(__dirname, "../../../tools/run_mysql_backup_restore_drill.mjs")).href;

test("restore drill CLI accepts one explicit artifact source and rejects ambiguous arguments", async () => {
  const {parseRestoreDrillArgs, restoreMysqlClientSafetyArguments} = await import(TOOL_URL);
  const explicit = parseRestoreDrillArgs(["--backup", "backup.sql"]);
  assert.equal(explicit.backupPath, path.resolve("backup.sql"));
  assert.throws(
    () => parseRestoreDrillArgs(["--backup", "backup.sql", "--backup-dir", "backups"]),
    (error) => error.code === "restore_drill_argument_conflict",
  );
  assert.throws(
    () => parseRestoreDrillArgs(["--unknown"]),
    (error) => error.code === "restore_drill_argument_invalid",
  );
  assert.deepEqual(restoreMysqlClientSafetyArguments(), [
    "--commands=FALSE",
    "--disable-named-commands",
    "--system-command=FALSE",
    "--binary-mode",
  ]);
});

test("restore drill summary exposes only bounded counts", async () => {
  const {authoritySnapshotSummary} = await import(TOOL_URL);
  const summary = authoritySnapshotSummary({
    accounts: {alice: {}, bob: {}},
    sessions: {session_a: {}},
    profiles: {player_a: {}},
    accountCharacterSlots: {account_a: [{playerId: "player_a"}, null, {playerId: "player_b"}, null]},
    mutationReceipts: {receipt_a: {}},
    mailMessages: {mail_a: {}, mail_b: {}},
    marketListings: {},
    consumedEquipmentEnvelopes: {envelope_a: {}},
    parties: {party_a: {}},
    families: {},
    battleRecords: [{recordId: "record_a"}],
    serviceEvents: [{eventId: "event_a"}],
    storeRevision: 17,
  });
  assert.deepEqual(summary, {
    accounts: 2,
    sessions: 1,
    profiles: 1,
    characterSlots: 2,
    mutationReceipts: 1,
    activeMail: 2,
    marketListings: 0,
    consumedEquipmentEnvelopes: 1,
    parties: 1,
    families: 0,
    battleRecords: 1,
    serviceEvents: 1,
    storeRevision: 17,
  });
  assert.equal(JSON.stringify(summary).includes("alice"), false);
});

test("restore drill persistent digest ignores runtime-only rows but catches authority changes", async () => {
  const {persistentProjectionDigest} = await import(TOOL_URL);
  const baseline = {
    schemaVersion: 1,
    accounts: {alice: {accountId: "account_a", username: "alice"}},
    profiles: {},
    battleRooms: {runtime_room: {roomId: "runtime_room"}},
    playerPositions: {account_a: {mapId: "firebud_village_gate"}},
    storeRevision: 4,
  };
  const runtimeChanged = {
    ...baseline,
    battleRooms: {other_room: {roomId: "other_room"}},
    playerPositions: {},
  };
  const authorityChanged = {
    ...baseline,
    accounts: {alice: {accountId: "account_a", username: "alice", role: "gm"}},
  };
  assert.equal(persistentProjectionDigest(baseline), persistentProjectionDigest(runtimeChanged));
  assert.notEqual(persistentProjectionDigest(baseline), persistentProjectionDigest(authorityChanged));
});
