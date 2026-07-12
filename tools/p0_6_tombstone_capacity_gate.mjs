#!/usr/bin/env node

import {execFileSync, spawnSync} from "node:child_process";
import {createRequire} from "node:module";
import os from "node:os";
import {performance} from "node:perf_hooks";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const {
  createAsyncWriteAuthStore,
  createAuthService,
  createMemoryAuthStore,
} = require("../server/node/src/auth-service");

const PROFILE_COUNT = 200;
const TOMBSTONE_COUNTS = Object.freeze([0, 50_000, 100_000]);
const WARMUP_COUNT = 5;
const SAMPLE_COUNT = 20;
const REQUEST_P95_LIMIT_MS = Object.freeze({bankDeposit: 75, battleInvite: 50});
const HISTORICAL_DELTA_LIMIT_MS = 30;
const HISTORICAL_RATIO_LIMIT = 4;
const HISTORICAL_JITTER_FLOOR_MS = 10;
const HEAP_GROWTH_LIMIT_MIB = 32;
const SCRIPT_PATH = fileURLToPath(import.meta.url);

function seedFixture() {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({
    username: "capacitygate",
    password: "test1234",
    displayName: "容量门槛",
  });
  if (!registered.ok) {
    throw new Error(`capacity fixture registration failed: ${registered.code || "unknown"}`);
  }
  return {root: service.snapshot(), token: registered.session.token};
}

function expandedRoot(rootValue, tombstoneCount) {
  const root = structuredClone(rootValue);
  for (let index = 1; index < PROFILE_COUNT; index += 1) {
    const playerId = `player_capacity_${String(index).padStart(3, "0")}`;
    root.profiles[playerId] = {
      schemaVersion: 1,
      playerId,
      accountId: `account_capacity_${index}`,
      profileRevision: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      profile: {
        equipmentInstances: {},
        bank: {schemaVersion: 1, stoneCoins: 0, items: []},
      },
    };
  }
  root.consumedEquipmentEnvelopes = {};
  for (let index = 0; index < tombstoneCount; index += 1) {
    const envelopeId = `eqx_capacity_${String(index).padStart(12, "0")}`;
    root.consumedEquipmentEnvelopes[envelopeId] = {schemaVersion: 1, envelopeId};
  }
  if (Object.keys(root.profiles).length !== PROFILE_COUNT) {
    throw new Error("capacity fixture profile count drifted");
  }
  if (Object.keys(root.consumedEquipmentEnvelopes).length !== tombstoneCount) {
    throw new Error("capacity fixture tombstone count drifted");
  }
  return root;
}

function percentile(samples, ratio) {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function roundedSamples(samples) {
  return samples.map((value) => Number(value.toFixed(2)));
}

function summary(samples) {
  return {
    medianMs: Number(percentile(samples, 0.5).toFixed(2)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(2)),
    maxMs: Number(Math.max(...samples).toFixed(2)),
    samplesMs: roundedSamples(samples),
  };
}

async function measure(tombstoneCount) {
  const fixture = seedFixture();
  const root = expandedRoot(fixture.root, tombstoneCount);
  let saveCount = 0;
  const store = createAsyncWriteAuthStore({
    mode: "capacity-noop",
    load() {
      return structuredClone(root);
    },
    async saveAsync() {
      saveCount += 1;
      return {committed: true};
    },
  }, {onError(error) { throw error; }});
  const service = createAuthService({store});
  const warmedProfile = service.getProfile(fixture.token);
  if (!warmedProfile.ok) {
    throw new Error(`capacity fixture profile warmup failed: ${warmedProfile.code || "unknown"}`);
  }

  let expectedBankStoneCoins = Number(warmedProfile.profile.bank && warmedProfile.profile.bank.stoneCoins || 0);
  let previousRevision = Number(warmedProfile.profileSummary.profileRevision || 0);
  async function runPair(index, measured) {
    let startedAt = performance.now();
    const deposit = await service.invokeDurable("bankDeposit", [fixture.token, {
      stoneCoins: 1,
      items: [],
    }], {
      operationId: `bbo_capacity_bank_${String(tombstoneCount).padStart(6, "0")}_${measured ? "m" : "w"}_${index}`,
      requestHash: "a".repeat(64),
      actionId: "capacity.bankDeposit",
    });
    const bankElapsedMs = performance.now() - startedAt;
    if (!deposit.ok) {
      throw new Error(`capacity bank deposit failed: ${deposit.code || "unknown"}`);
    }
    expectedBankStoneCoins += 1;
    const revision = Number(deposit.profileSummary && deposit.profileSummary.profileRevision || 0);
    if (Number(deposit.bank && deposit.bank.stoneCoins) !== expectedBankStoneCoins || revision <= previousRevision) {
      throw new Error("capacity bank result did not apply exactly once");
    }
    previousRevision = revision;

    const savesBeforeBattle = saveCount;
    startedAt = performance.now();
    const invite = await service.invokeDurable("inviteToBattle", [fixture.token, {
      username: "capacity_missing_target",
    }], {
      requestHash: "b".repeat(64),
      actionId: "capacity.inviteToBattle",
    });
    const battleElapsedMs = performance.now() - startedAt;
    if (invite.ok || invite.code !== "battle_target_missing" || saveCount !== savesBeforeBattle) {
      throw new Error(`capacity battle fixture drifted: ${invite.code || "unexpected_success"}`);
    }
    return {bankElapsedMs, battleElapsedMs};
  }

  for (let index = 0; index < WARMUP_COUNT; index += 1) {
    await runPair(index, false);
  }
  globalThis.gc?.();
  const heapBeforeMiB = process.memoryUsage().heapUsed / 1_048_576;
  const bankDepositMs = [];
  const battleInviteMs = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const pair = await runPair(index, true);
    bankDepositMs.push(pair.bankElapsedMs);
    battleInviteMs.push(pair.battleElapsedMs);
  }
  await store.flush();
  globalThis.gc?.();
  const heapAfterMiB = process.memoryUsage().heapUsed / 1_048_576;
  if (saveCount !== WARMUP_COUNT + SAMPLE_COUNT) {
    throw new Error(`capacity save count drifted: ${saveCount}`);
  }
  const snapshot = service.snapshot();
  if (
    Object.keys(snapshot.profiles).length !== PROFILE_COUNT
    || Object.keys(snapshot.consumedEquipmentEnvelopes).length !== tombstoneCount
  ) {
    throw new Error("capacity authoritative root changed its fixture cardinality");
  }
  return {
    tombstoneCount,
    profileCount: Object.keys(snapshot.profiles).length,
    tombstoneCountAfter: Object.keys(snapshot.consumedEquipmentEnvelopes).length,
    saveCount,
    bankDeposit: summary(bankDepositMs),
    battleInvite: summary(battleInviteMs),
    heapGrowthMiB: Number((heapAfterMiB - heapBeforeMiB).toFixed(1)),
    rssMiB: Number((process.memoryUsage().rss / 1_048_576).toFixed(1)),
  };
}

function workerResult(tombstoneCount) {
  const child = spawnSync(process.execPath, ["--expose-gc", SCRIPT_PATH, `--worker=${tombstoneCount}`], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (child.status !== 0) {
    throw new Error(`capacity worker ${tombstoneCount} failed: ${String(child.stderr || child.stdout).trim()}`);
  }
  return JSON.parse(child.stdout);
}

function gateFailures(results) {
  const failures = [];
  for (const result of results) {
    for (const [name, measurement] of Object.entries({
      bankDeposit: result.bankDeposit,
      battleInvite: result.battleInvite,
    })) {
      const limit = REQUEST_P95_LIMIT_MS[name];
      if (measurement.p95Ms > limit) {
        failures.push(`${result.tombstoneCount}/${name} p95 ${measurement.p95Ms}ms > ${limit}ms`);
      }
    }
    if (result.heapGrowthMiB > HEAP_GROWTH_LIMIT_MIB) {
      failures.push(`${result.tombstoneCount}/heap growth ${result.heapGrowthMiB}MiB > ${HEAP_GROWTH_LIMIT_MIB}MiB`);
    }
  }
  const zero = results.find((entry) => entry.tombstoneCount === 0);
  const maximum = results.find((entry) => entry.tombstoneCount === 100_000);
  for (const name of ["bankDeposit", "battleInvite"]) {
    const delta = maximum[name].p95Ms - zero[name].p95Ms;
    if (delta > HISTORICAL_DELTA_LIMIT_MS) {
      failures.push(`100000/${name} historical delta ${delta.toFixed(2)}ms > ${HISTORICAL_DELTA_LIMIT_MS}ms`);
    }
    const relativeLimit = Math.max(
      zero[name].p95Ms * HISTORICAL_RATIO_LIMIT,
      zero[name].p95Ms + HISTORICAL_JITTER_FLOOR_MS,
    );
    if (maximum[name].p95Ms > relativeLimit) {
      failures.push(`100000/${name} p95 ${maximum[name].p95Ms}ms > relative limit ${relativeLimit.toFixed(2)}ms`);
    }
  }
  return failures;
}

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {encoding: "utf8"}).trim();
  } catch {
    return "unknown";
  }
}

function gitDirty() {
  try {
    return execFileSync("git", ["status", "--porcelain"], {encoding: "utf8"}).trim() !== "";
  } catch {
    return null;
  }
}

const workerArg = process.argv.find((arg) => arg.startsWith("--worker="));
if (workerArg) {
  const tombstoneCount = Number(workerArg.slice("--worker=".length));
  if (!TOMBSTONE_COUNTS.includes(tombstoneCount)) {
    throw new Error(`unsupported tombstone worker count: ${tombstoneCount}`);
  }
  process.stdout.write(`${JSON.stringify(await measure(tombstoneCount))}\n`);
} else {
  const results = TOMBSTONE_COUNTS.map(workerResult).sort((left, right) => (
    left.tombstoneCount - right.tombstoneCount
  ));
  const failures = gateFailures(results);
  process.stdout.write(`${JSON.stringify({
    ok: failures.length === 0,
    schemaVersion: 2,
    gitHead: gitHead(),
    gitDirty: gitDirty(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: String(os.cpus()[0] && os.cpus()[0].model || "unknown"),
    },
    profileCount: PROFILE_COUNT,
    warmupCount: WARMUP_COUNT,
    sampleCount: SAMPLE_COUNT,
    limits: {
      requestP95Ms: REQUEST_P95_LIMIT_MS,
      historicalDeltaMs: HISTORICAL_DELTA_LIMIT_MS,
      historicalRatio: HISTORICAL_RATIO_LIMIT,
      historicalJitterFloorMs: HISTORICAL_JITTER_FLOOR_MS,
      heapGrowthMiB: HEAP_GROWTH_LIMIT_MIB,
    },
    results,
    failures,
  }, null, 2)}\n`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}
