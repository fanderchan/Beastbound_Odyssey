#!/usr/bin/env node

import assert from "node:assert/strict";
import {execFileSync, spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {performance} from "node:perf_hooks";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLES = 20;
const WARMUPS = 5;
const RESPONSE_PAD = "x".repeat(2048);

const {cloneAuthorityRoot} = require("../server/node/src/auth/authority-root-clone");
const {
  createAsyncWriteAuthStore,
  createAuthService,
  createMemoryAuthStore,
} = require("../server/node/src/auth-service");
const {
  ensureConsumedEquipmentEnvelopeIds,
  readConsumedEquipmentEnvelopeLedgerIndex,
} = require("../server/node/src/auth/equipment-envelope-consumed-ledger");
const {
  activeDurableReceipt,
  canonicalDurableMutationReceipts,
  durableMutationReceiptDelta,
  stageDurableMutationReceipt,
} = require("../server/node/src/auth/durable-mutation-state");
const {createMysqlAuthStore} = require("../server/node/src/mysql-store");

const worker = process.argv[2] === "--worker" ? process.argv[3] : "";
if (worker !== "") {
  const count = Number(process.argv[4] || 0);
  const result = worker === "ledger"
    ? ledgerWorker(count)
    : worker === "tombstone-service"
      ? await tombstoneServiceWorker(count)
    : worker === "service"
      ? await serviceWorker(count)
      : worker === "mysql"
        ? await mysqlWorker()
        : null;
  if (!result) {
    throw new Error(`unknown worker: ${worker}`);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

const metadata = {
  head: git(["rev-parse", "HEAD"]),
  node: process.version,
  cpu: os.cpus()[0]?.model || "unknown",
  warmups: WARMUPS,
  samples: SAMPLES,
  dirty: git(["status", "--short"]).split(/\r?\n/).filter(Boolean),
};
const results = [];
for (const count of [0, 50000, 100000]) {
  results.push(runWorker("ledger", count));
  results.push(runWorker("tombstone-service", count));
}
for (const count of [0, 10000, 20000]) {
  results.push(runWorker("service", count));
}
results.push(runWorker("mysql", 0));

const ledgerRows = results.filter((entry) => entry.kind === "ledger");
const tombstoneServiceRows = results.filter((entry) => entry.kind === "tombstone-service");
const serviceRows = results.filter((entry) => entry.kind === "service");
const mysql = results.find((entry) => entry.kind === "mysql");
assert.ok(ledgerRows.every((entry) => entry.p95Ms <= 5), "ledger append p95 exceeded 5ms");
assert.ok(
  ledgerRows.at(-1).p95Ms - ledgerRows[0].p95Ms <= 2,
  "100k tombstone history added more than 2ms",
);
assert.ok(
  tombstoneServiceRows.every((entry) => entry.withdrawP95Ms <= 75),
  "equipment bank withdrawal p95 exceeded 75ms",
);
assert.ok(
  tombstoneServiceRows.at(-1).withdrawP95Ms - tombstoneServiceRows[0].withdrawP95Ms <= 20,
  "100k tombstone history added more than 20ms to bank withdrawal",
);
assert.ok(serviceRows.every((entry) => entry.writeP95Ms <= 100), "service write p95 exceeded 100ms");
assert.ok(
  serviceRows.at(-1).writeP95Ms - serviceRows[0].writeP95Ms <= 25,
  "20k receipt history added more than 25ms",
);
assert.ok(serviceRows.every((entry) => entry.replayP95Ms <= 30), "receipt replay p95 exceeded 30ms");
assert.ok(mysql.p95Ms <= 50, "MySQL planner/recording transaction p95 exceeded 50ms");
assert.ok(mysql.maxBusinessSqlRows <= 5, "MySQL touched-row transaction emitted unexpected business SQL");
assert.ok(mysql.maxSqlRows <= 9, "MySQL revision/profile snapshot guards emitted unexpected fixed SQL");
assert.ok(
  results.every((entry) => entry.heapDeltaMiB <= 32),
  "online measurement heap delta exceeded 32MiB",
);
assert.ok(
  results.every((entry) => entry.peakRssDeltaMiB <= 128),
  "online measurement peak RSS delta exceeded 128MiB",
);

process.stdout.write(`${JSON.stringify({metadata, results}, null, 2)}\n`);

function ledgerWorker(count) {
  const raw = {};
  for (let index = 0; index < count; index += 1) {
    const envelopeId = `eqx_gate_${String(index).padStart(12, "0")}`;
    raw[envelopeId] = {schemaVersion: 1, envelopeId};
  }
  const baseline = readConsumedEquipmentEnvelopeLedgerIndex(raw);
  assert.equal(baseline.ok, true);
  for (let index = 0; index < WARMUPS; index += 1) {
    assert.equal(ensureConsumedEquipmentEnvelopeIds(
      baseline.ledger,
      `eqx_gate_warmup_${String(index).padStart(12, "0")}`,
    ).ok, true);
  }
  const measurement = startMeasurement();
  const samples = [];
  for (let index = 0; index < SAMPLES; index += 1) {
    const startedAt = performance.now();
    const staged = ensureConsumedEquipmentEnvelopeIds(
      baseline.ledger,
      `eqx_gate_append_${String(index).padStart(12, "0")}`,
    );
    samples.push(performance.now() - startedAt);
    assert.equal(staged.ok, true);
    assert.equal(staged.addedIds.length, 1);
    assert.equal(Object.hasOwn(baseline.ledger, staged.addedIds[0]), false);
    assert.equal(Object.hasOwn(staged.ledger, staged.addedIds[0]), true);
  }
  const resources = finishMeasurement(measurement);
  return {
    kind: "ledger",
    count,
    p95Ms: round(p95(samples)),
    ...resources,
    samplesMs: samples.map(round),
  };
}

async function tombstoneServiceWorker(tombstoneCount) {
  const seedStore = createMemoryAuthStore();
  const seedService = createAuthService({store: seedStore, allowFullProfileSave: true});
  const registered = seedService.register({
    username: `tomb${tombstoneCount}`,
    password: "test1234",
    displayName: `墓碑${tombstoneCount}`,
  });
  const token = registered.session.token;
  seedBackpackEquipment(seedService, token);
  const firstDeposit = seedService.bankDeposit(token, {
    items: [{
      itemId: "weapon_wooden_club",
      count: 1,
      instanceId: "equip_gate_cycle_0001",
      sourceSlotIndex: 0,
      bankSlotIndex: 1,
    }],
  });
  assert.equal(firstDeposit.ok, true);
  let envelopeId = firstDeposit.bank.slots[1].equipmentEnvelopes[0].envelopeId;
  const raw = seedStore.load();
  for (let index = 0; index < tombstoneCount; index += 1) {
    const historyId = `eqx_tombstone_gate_${String(index).padStart(12, "0")}`;
    raw.consumedEquipmentEnvelopes[historyId] = {schemaVersion: 1, envelopeId: historyId};
  }
  for (let index = 1; index < 200; index += 1) {
    const playerId = `player_tombstone_${String(index).padStart(3, "0")}`;
    raw.profiles[playerId] = {
      playerId,
      accountId: `acc_tombstone_${String(index).padStart(3, "0")}`,
      profileRevision: 1,
      updatedAt: "2026-07-12T00:00:00.000Z",
      profile: {name: `墓碑档案${index}`, equipmentInstances: {}, backpackSlots: []},
    };
  }
  let saves = 0;
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "capacity-noop",
      load: () => raw,
      async saveAsync() {
        saves += 1;
      },
    }, {onError: () => {}}),
  });
  const initial = service.getProfile(token);
  assert.equal(initial.ok, true);
  const initialRevision = initial.profileSummary.profileRevision;
  const samples = [];
  async function runCycle(index, measured) {
    const withdrawOperation = {
      operationId: `operation_tombstone_withdraw_${String(index).padStart(4, "0")}`,
      requestHash: String(index + 1).padStart(64, "a").slice(-64),
      actionId: "bank.withdraw",
    };
    const startedAt = performance.now();
    const withdrawn = await service.invokeDurable("bankWithdraw", [token, {
      items: [{
        itemId: "weapon_wooden_club",
        count: 1,
        envelopeId,
        bankSlotIndex: 1,
        targetSlotIndex: 5,
      }],
    }], withdrawOperation);
    if (measured) {
      samples.push(performance.now() - startedAt);
    }
    assert.equal(withdrawn.ok, true);
    const importedInstanceId = Object.keys(withdrawn.profile.equipmentInstances)
      .find((instanceId) => withdrawn.profile.equipmentInstances[instanceId].itemId === "weapon_wooden_club");
    assert.ok(importedInstanceId);
    const deposited = await service.invokeDurable("bankDeposit", [token, {
      items: [{
        itemId: "weapon_wooden_club",
        count: 1,
        instanceId: importedInstanceId,
        sourceSlotIndex: 5,
        bankSlotIndex: 1,
      }],
    }], {
      operationId: `operation_tombstone_deposit_${String(index).padStart(4, "0")}`,
      requestHash: String(index + 101).padStart(64, "b").slice(-64),
      actionId: "bank.deposit",
    });
    assert.equal(deposited.ok, true);
    envelopeId = deposited.bank.slots[1].equipmentEnvelopes[0].envelopeId;
  }
  for (let index = 0; index < WARMUPS; index += 1) {
    await runCycle(index, false);
  }
  const measurement = startMeasurement();
  for (let index = 0; index < SAMPLES; index += 1) {
    await runCycle(WARMUPS + index, true);
  }
  const resources = finishMeasurement(measurement);
  const finalSnapshot = service.snapshot();
  assert.equal(
    Object.keys(finalSnapshot.consumedEquipmentEnvelopes).length,
    tombstoneCount + WARMUPS + SAMPLES,
  );
  const finalDocument = finalSnapshot.profiles[registered.profileBinding.playerId];
  assert.equal(finalDocument.profileRevision, initialRevision + (WARMUPS + SAMPLES) * 2);
  assert.equal(finalDocument.profile.bank.slots[1].equipmentEnvelopes.length, 1);
  assert.equal(Object.keys(finalDocument.profile.equipmentInstances).length, 0);
  assert.equal(saves, (WARMUPS + SAMPLES) * 2);
  return {
    kind: "tombstone-service",
    profiles: 200,
    tombstoneCount,
    withdrawP95Ms: round(p95(samples)),
    saves,
    ...resources,
    samplesMs: samples.map(round),
  };
}

async function serviceWorker(receiptCount) {
  const seedStore = createMemoryAuthStore();
  const seedService = createAuthService({store: seedStore, allowFullProfileSave: true});
  const registered = seedService.register({
    username: `gate${receiptCount}`,
    password: "test1234",
    displayName: `容量${receiptCount}`,
  });
  const raw = seedStore.load();
  for (let index = 1; index < 200; index += 1) {
    const playerId = `player_gate_${String(index).padStart(3, "0")}`;
    raw.profiles[playerId] = {
      playerId,
      accountId: `acc_gate_${String(index).padStart(3, "0")}`,
      profileRevision: 1,
      updatedAt: "2026-07-12T00:00:00.000Z",
      profile: {name: `容量档案${index}`, equipmentInstances: {}, backpackSlots: []},
    };
  }
  const nowMs = Date.now();
  raw.mutationReceipts = receiptFixture(receiptCount, nowMs, registered.account.accountId, "service");
  let saves = 0;
  const store = createAsyncWriteAuthStore({
    mode: "capacity-noop",
    load: () => raw,
    async saveAsync() {
      saves += 1;
    },
  }, {onError: () => {}});
  const service = createAuthService({store});
  // Startup normalization/audit is deliberately outside the online samples.
  const initial = service.getProfile(registered.session.token);
  assert.equal(initial.ok, true);
  const writeSamples = [];
  let lastOperation = null;
  async function runWrite(index, measured) {
    lastOperation = {
      operationId: `operation_gate_write_${receiptCount}_${String(index).padStart(4, "0")}`,
      requestHash: String(index + 1).padStart(64, "a").slice(-64),
      actionId: "bank.deposit",
    };
    const startedAt = performance.now();
    const result = await service.invokeDurable(
      "bankDeposit",
      [registered.session.token, {stoneCoins: 1}],
      lastOperation,
    );
    if (measured) {
      writeSamples.push(performance.now() - startedAt);
    }
    assert.equal(result.ok, true);
    assert.equal(result.durableCommit.replayed, false);
  }
  for (let index = 0; index < WARMUPS; index += 1) {
    await runWrite(index, false);
  }
  const measurement = startMeasurement();
  for (let index = 0; index < SAMPLES; index += 1) {
    await runWrite(WARMUPS + index, true);
  }
  const savesBeforeReplay = saves;
  const replaySamples = [];
  for (let index = 0; index < SAMPLES; index += 1) {
    const startedAt = performance.now();
    const result = await service.invokeDurable(
      "bankDeposit",
      [registered.session.token, {stoneCoins: 1}],
      lastOperation,
    );
    replaySamples.push(performance.now() - startedAt);
    assert.equal(result.ok, true);
    assert.equal(result.durableCommit.replayed, true);
  }
  assert.equal(saves, savesBeforeReplay);
  const resources = finishMeasurement(measurement);
  const finalSnapshot = service.snapshot();
  const finalDocument = finalSnapshot.profiles[registered.profileBinding.playerId];
  assert.equal(finalDocument.profileRevision, initial.profileSummary.profileRevision + WARMUPS + SAMPLES);
  assert.equal(finalDocument.profile.stoneCoins, initial.profile.stoneCoins - WARMUPS - SAMPLES);
  assert.equal(finalDocument.profile.bank.stoneCoins, WARMUPS + SAMPLES);
  assert.equal(
    Object.keys(finalSnapshot.mutationReceipts).length,
    Math.min(20000, receiptCount + WARMUPS + SAMPLES),
  );
  assert.equal(Object.hasOwn(finalSnapshot.mutationReceipts, lastOperation.operationId), true);
  if (receiptCount > WARMUPS + SAMPLES) {
    const untouchedId = `operation_service_${String(Math.floor(receiptCount / 2)).padStart(8, "0")}`;
    assert.equal(Object.hasOwn(finalSnapshot.mutationReceipts, untouchedId), true);
  }
  assert.equal(saves, WARMUPS + SAMPLES);
  return {
    kind: "service",
    profiles: 200,
    receiptCount,
    writeP95Ms: round(p95(writeSamples)),
    replayP95Ms: round(p95(replaySamples)),
    saves,
    ...resources,
    writeSamplesMs: writeSamples.map(round),
    replaySamplesMs: replaySamples.map(round),
  };
}

async function mysqlWorker() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-p06-journal-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  fs.writeFileSync(fakeMysqlPath, fakeMysqlProgram(), {mode: 0o755});
  const transactions = [];
  let activeQueries = null;
  let storeRevision = 0;
  let pendingStoreRevision = null;
  let current = null;
  const connection = {
    async beginTransaction() {
      activeQueries = [];
      transactions.push(activeQueries);
    },
    async query(statement) {
      activeQueries.push(statement);
      if (/^SELECT revision AS storeRevision FROM auth_store_revisions[\s\S]+FOR UPDATE$/i.test(String(statement).trim())) {
        return [[{storeRevision}], []];
      }
      if (/^SELECT account_id, player_id, profile_revision FROM profile_bindings ORDER BY account_id FOR UPDATE$/i.test(String(statement).trim())) {
        return [[...Object.values(current && current.profileBindings || {}).map((binding) => ({
          account_id: binding.accountId,
          player_id: binding.playerId,
          profile_revision: binding.profileRevision,
        }))], []];
      }
      if (/^SELECT player_id, account_id, profile_revision FROM profiles ORDER BY player_id FOR UPDATE$/i.test(String(statement).trim())) {
        return [[...Object.values(current && current.profiles || {}).map((profile) => ({
          player_id: profile.playerId,
          account_id: profile.accountId,
          profile_revision: profile.profileRevision,
        }))], []];
      }
      if (/^UPDATE auth_store_revisions SET revision = revision \+ 1[\s\S]+AND revision = \d+$/i.test(String(statement).trim())) {
        pendingStoreRevision = storeRevision + 1;
        return [{affectedRows: 1}, []];
      }
      return [{affectedRows: 1}, []];
    },
    async commit() {
      if (pendingStoreRevision !== null) storeRevision = pendingStoreRevision;
      pendingStoreRevision = null;
    },
    async rollback() {
      pendingStoreRevision = null;
    },
    release() {},
  };
  const pool = {
    async getConnection() {
      return connection;
    },
    async end() {},
  };
  try {
    const store = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
      host: "127.0.0.1",
      port: 3306,
      user: "capacity",
      password: "not-used-by-fake-cli",
      database: "beastbound_capacity",
      createDatabase: false,
      usePool: true,
      poolFactory: () => pool,
    });
    current = store.load();
    assert.equal(Object.keys(current.profiles).length, 200);
    assert.equal(Object.keys(current.mutationReceipts).length, 20000);
    assert.equal(Object.keys(current.consumedEquipmentEnvelopes).length, 100000);
    const samples = [];
    let historicalObjectKeyScans = 0;
    async function runSave(index, measured) {
      const next = cloneAuthorityRoot(current);
      next.profiles.player_gate_000.profileRevision += 1;
      next.profiles.player_gate_000.updatedAt = new Date(Date.now() + index).toISOString();
      const appended = ensureConsumedEquipmentEnvelopeIds(
        next.consumedEquipmentEnvelopes,
        `eqx_mysql_gate_append_${String(index).padStart(8, "0")}`,
      );
      assert.equal(appended.ok, true);
      next.consumedEquipmentEnvelopes = appended.ledger;
      next.mutationReceipts = stageDurableMutationReceipt(
        next.mutationReceipts,
        receiptRecord(
          `operation_mysql_gate_new_${String(index).padStart(4, "0")}`,
          Date.now() + index,
          "acc_gate_000",
        ),
        {nowMs: Date.now() + index},
      );
      const delta = durableMutationReceiptDelta(next.mutationReceipts);
      assert.equal(delta.ok, true);
      assert.equal(delta.deletes.length, 1);
      assert.equal(delta.upserts.length, 1);
      const startedAt = performance.now();
      const guardedLedgers = new Set([
        current.mutationReceipts,
        current.consumedEquipmentEnvelopes,
        next.mutationReceipts,
        next.consumedEquipmentEnvelopes,
      ]);
      const originalObjectKeys = Object.keys;
      Object.keys = function countedObjectKeys(value) {
        if (guardedLedgers.has(value)) {
          historicalObjectKeyScans += 1;
        }
        return originalObjectKeys(value);
      };
      try {
        await store.saveAsync(next);
      } finally {
        Object.keys = originalObjectKeys;
      }
      if (measured) {
        samples.push(performance.now() - startedAt);
      }
      current = next;
    }
    for (let index = 0; index < WARMUPS; index += 1) {
      await runSave(index, false);
    }
    const measurement = startMeasurement();
    for (let index = 0; index < SAMPLES; index += 1) {
      await runSave(WARMUPS + index, true);
    }
    const untouchedReceipt = "operation_mysql_gate_010000";
    const untouchedTombstone = "eqx_mysql_gate_000000050000";
    for (const statements of transactions) {
      const revisionLocks = statements.filter((statement) => statement.startsWith("SELECT revision AS storeRevision"));
      const revisionUpdates = statements.filter((statement) => statement.startsWith("UPDATE auth_store_revisions"));
      const businessStatements = statements.filter((statement) => (
        !statement.startsWith("SELECT revision AS storeRevision")
        && !statement.startsWith("UPDATE auth_store_revisions")
        && !statement.startsWith("SELECT account_id, player_id, profile_revision FROM profile_bindings ORDER BY")
        && !statement.startsWith("SELECT player_id, account_id, profile_revision FROM profiles ORDER BY")
      ));
      assert.equal(revisionLocks.length, 1);
      assert.equal(revisionUpdates.length, 1);
      assert.equal(statements.filter((statement) => statement.includes("profile_bindings ORDER BY account_id FOR UPDATE")).length, 1);
      assert.equal(statements.filter((statement) => statement.includes("profiles ORDER BY player_id FOR UPDATE")).length, 1);
      assert.ok(businessStatements.length <= 5);
      assert.equal(statements.some((statement) => statement.includes(untouchedReceipt)), false);
      assert.equal(statements.some((statement) => statement.includes(untouchedTombstone)), false);
      const receiptDelete = statements.findIndex((statement) => statement.startsWith("DELETE FROM mutation_receipts"));
      const receiptInsert = statements.findIndex((statement) => statement.startsWith("INSERT INTO mutation_receipts"));
      assert.ok(receiptDelete >= 0 && receiptInsert > receiptDelete);
    }
    const resources = finishMeasurement(measurement);
    await store.close();
    assert.equal(historicalObjectKeyScans, 0);
    return {
      kind: "mysql",
      profiles: 200,
      receiptCount: 20000,
      tombstoneCount: 100000,
      p95Ms: round(p95(samples)),
      maxSqlRows: Math.max(...transactions.map((entry) => entry.length)),
      maxBusinessSqlRows: Math.max(...transactions.map((entry) => entry.filter((statement) => (
        !statement.startsWith("SELECT revision AS storeRevision")
        && !statement.startsWith("UPDATE auth_store_revisions")
        && !statement.startsWith("SELECT account_id, player_id, profile_revision FROM profile_bindings ORDER BY")
        && !statement.startsWith("SELECT player_id, account_id, profile_revision FROM profiles ORDER BY")
      )).length)),
      historicalObjectKeyScans,
      ...resources,
      samplesMs: samples.map(round),
    };
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
}

function receiptFixture(count, nowMs, accountId, prefix) {
  const result = {};
  for (let index = 0; index < count; index += 1) {
    const operationId = `operation_${prefix}_${String(index).padStart(8, "0")}`;
    result[operationId] = receiptRecord(operationId, nowMs - count + index, accountId);
  }
  return result;
}

function seedBackpackEquipment(service, token) {
  const current = service.getProfile(token);
  assert.equal(current.ok, true);
  const profile = current.profile;
  profile.backpackSlots = [
    {itemId: "weapon_wooden_club", count: 1},
    ...Array.from({length: 14}, () => ({})),
  ];
  profile.equipmentInstances = {
    equip_gate_cycle_0001: {
      schemaVersion: 1,
      instanceId: "equip_gate_cycle_0001",
      itemId: "weapon_wooden_club",
      location: "backpack",
      slotId: "",
      durability: 30,
      enhancement: {itemId: "weapon_wooden_club", level: 2, history: []},
      wearCounters: {itemId: "weapon_wooden_club", attackCount: 3, hitCount: 0},
      expPillCharge: {},
      source: "p0_6_capacity_gate",
    },
  };
  profile.equipmentSlotInstanceIds = {};
  profile.equipmentSlotsVersion = 5;
  profile.nextEquipmentInstanceSerial = 2;
  const saved = service.saveProfile(token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile,
  });
  assert.equal(saved.ok, true, JSON.stringify(saved));
}

function receiptRecord(operationId, committedAtMs, accountId) {
  return {
    schemaVersion: 1,
    operationId,
    requestHash: "c".repeat(64),
    actionId: "bank.deposit",
    accountId,
    committedAt: new Date(committedAtMs).toISOString(),
    expiresAt: new Date(committedAtMs + 72 * 60 * 60 * 1000).toISOString(),
    response: {ok: true, pad: RESPONSE_PAD},
  };
}

function fakeMysqlProgram() {
  return `#!/usr/bin/env node
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  if (!stdin.includes("SELECT 'server_state'")) return;
  const rows = [
    ["server_state", "auth", JSON.stringify({schemaVersion: 2, storage: "mysql_entity_tables"})],
    ["store_revision", "auth", "0"],
  ];
  for (let index = 0; index < 200; index += 1) {
    const suffix = String(index).padStart(3, "0");
    const playerId = "player_gate_" + suffix;
    rows.push(["profiles", playerId, JSON.stringify({
      playerId,
      accountId: "acc_gate_" + suffix,
      profileRevision: 1,
      updatedAt: "2026-07-12T00:00:00.000Z",
      profile: {name: "容量档案" + suffix, equipmentInstances: {}, backpackSlots: []},
    })]);
  }
  const nowMs = Date.parse("2026-07-12T00:00:00.000Z");
  const pad = "x".repeat(2048);
  for (let index = 0; index < 20000; index += 1) {
    const operationId = "operation_mysql_gate_" + String(index).padStart(6, "0");
    const committedAtMs = nowMs - 20000 + index;
    rows.push(["mutation_receipts", operationId, JSON.stringify({
      schemaVersion: 1,
      operationId,
      requestHash: "c".repeat(64),
      actionId: "bank.deposit",
      accountId: "acc_gate_000",
      committedAt: new Date(committedAtMs).toISOString(),
      expiresAt: new Date(committedAtMs + 72 * 60 * 60 * 1000).toISOString(),
      response: {ok: true, pad},
    })]);
  }
  for (let index = 0; index < 100000; index += 1) {
    rows.push(["consumed_equipment_envelopes", "eqx_mysql_gate_" + String(index).padStart(12, "0"), "{}"]);
  }
  process.stdout.write(rows.map((row) => row.join("\\t")).join("\\n") + "\\n");
});
`;
}

function runWorker(name, count) {
  const result = spawnSync(process.execPath, ["--expose-gc", fileURLToPath(import.meta.url), "--worker", name, String(count)], {
    cwd: ROOT,
    encoding: "utf8",
    env: {...process.env},
    maxBuffer: 128 * 1024 * 1024,
    timeout: 120000,
  });
  if (result.status !== 0) {
    throw new Error(`${name}/${count} failed:\n${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
}

function p95(samples) {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] || 0;
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

function forceGc() {
  if (typeof global.gc === "function") {
    global.gc();
  }
}

function startMeasurement() {
  forceGc();
  return {
    cpu: process.cpuUsage(),
    heapUsed: process.memoryUsage().heapUsed,
    maxRssKiB: process.resourceUsage().maxRSS,
  };
}

function finishMeasurement(started) {
  forceGc();
  const cpu = process.cpuUsage(started.cpu);
  return {
    cpuMs: round((cpu.user + cpu.system) / 1000),
    heapDeltaMiB: round((process.memoryUsage().heapUsed - started.heapUsed) / 1048576),
    peakRssDeltaMiB: round(Math.max(0, process.resourceUsage().maxRSS - started.maxRssKiB) / 1024),
  };
}

function git(args) {
  return execFileSync("git", args, {cwd: ROOT, encoding: "utf8"}).trim();
}
