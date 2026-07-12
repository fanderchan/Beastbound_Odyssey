#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import {fork, execFileSync} from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {performance} from "node:perf_hooks";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(FILE), "..");

const ACCOUNT_COUNT = 200;
const WARMUP_COUNT = 5;
const SAMPLE_COUNT = 20;
const POSITION_BATCH_SIZE = 20;
const SAME_AOI_MAP_ID = "firebud_training_yard";
const INITIAL_CELL_X = 10;
const INITIAL_CELL_Y = 10;
const CONNECT_TIMEOUT_MS = 10000;
const FANOUT_TIMEOUT_MS = 10000;
const HTTP_TIMEOUT_MS = 10000;
const HEALTH_POLL_MS = 25;
const SLOW_CONSUMER_TIMEOUT_MS = 5000;
const SLOW_CONSUMER_MAX_MOVES = 4096;
const SLOW_BURST_BATCH_SIZE = 32;
const MAX_DELTA_BYTES = 2 * 1024;
const MAX_FANOUT_APPLICATION_BYTES = 400 * 1024;
const MAX_FANOUT_WIRE_BYTES = 512 * 1024;
const MAX_HEAP_GROWTH_BYTES = 32 * 1024 * 1024;
const MAX_PEAK_RSS_GROWTH_BYTES = 128 * 1024 * 1024;

const {PROTOCOL_VERSION, SERVER_VERSION} = require("../server/node/src/protocol");

async function runGate() {
  const reportOnly = process.argv.includes("--report-only");
  const skipSlowConsumer = process.argv.includes("--skip-slow-consumer");
  const metadata = {
    head: git(["rev-parse", "HEAD"]),
    node: process.version,
    cpu: os.cpus()[0]?.model || "unknown",
    protocolVersion: PROTOCOL_VERSION,
    serverVersion: SERVER_VERSION,
    accountCount: ACCOUNT_COUNT,
    warmups: WARMUP_COUNT,
    samples: SAMPLE_COUNT,
    dirty: git(["status", "--short"]).split(/\r?\n/).filter(Boolean),
  };

  const failures = [];
  let normal = null;
  let slowConsumer = null;
  try {
    normal = await runNormalCapacityScenario(failures);
    if (!skipSlowConsumer) {
      slowConsumer = await runSlowConsumerScenario(failures);
    }
  } catch (error) {
    failures.push(`gate execution failed: ${error && error.stack ? error.stack : error}`);
  }

  const report = {
    ok: failures.length === 0,
    metadata,
    thresholds: {
      connectTotalMs: CONNECT_TIMEOUT_MS,
      httpAckP95Ms: 75,
      lastWsP95Ms: 150,
      fanoutSpreadP95Ms: 100,
      deltaP95Bytes: MAX_DELTA_BYTES,
      fanoutApplicationBytes: MAX_FANOUT_APPLICATION_BYTES,
      fanoutWireBytes: MAX_FANOUT_WIRE_BYTES,
      heapGrowthMiB: bytesToMiB(MAX_HEAP_GROWTH_BYTES),
      peakRssGrowthMiB: bytesToMiB(MAX_PEAK_RSS_GROWTH_BYTES),
      slowConsumerIsolationMs: SLOW_CONSUMER_TIMEOUT_MS,
    },
    normal,
    slowConsumer,
    failures,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (!reportOnly) {
    assert.equal(failures.length, 0, failures.join("\n"));
  }
}

async function runNormalCapacityScenario(failureRows) {
  const worker = await ServerWorker.start();
  const clients = [];
  const observer = new FanoutObserver(ACCOUNT_COUNT);
  const contract = {
    httpRosterViolations: 0,
    deltaRosterViolations: 0,
    invalidDeltaCount: 0,
    unexpectedDeltaCount: 0,
  };
  try {
    const base = `http://127.0.0.1:${worker.port}`;
    const wsBase = `ws://127.0.0.1:${worker.port}`;
    const accounts = worker.accounts;
    assertUniqueFixtureAccounts(accounts);
    const beforePresence = await worker.rpc("metrics", {gc: true});

    await initializePositions(base, accounts, contract);
    await readOnlineRosters(base, accounts);

    const connectStartedAt = performance.now();
    for (let index = 0; index < ACCOUNT_COUNT; index += 1) {
      clients.push(new GateWebSocket(index, eventStreamUrl(wsBase, accounts[index].token), {
        expectedAccount: accounts[index],
        onMessage: (clientIndex, event, byteLength, receivedAt) => {
          if (event && event.type === "online.position") {
            observer.record(clientIndex, event, byteLength, receivedAt, contract);
          }
        },
      }));
    }
    await withTimeout(
      Promise.all(clients.map((client) => client.connect())),
      CONNECT_TIMEOUT_MS,
      "200 websocket ready/snapshot timeout",
    );
    const connectTotalMs = performance.now() - connectStartedAt;
    const connectLatencies = clients.map((client) => client.snapshotAt - client.startedAt);

    const connectedHealth = await waitForEventStreamClients(base, ACCOUNT_COUNT, CONNECT_TIMEOUT_MS);
    const connectedMetrics = eventStreamMetrics(connectedHealth, failureRows, "connected health");
    check(
      failureRows,
      new Set(clients.map((client) => client.readyAccountId)).size === ACCOUNT_COUNT,
      "events.ready did not expose 200 unique expected account ids",
    );

    const movementRows = [];
    for (let index = 0; index < WARMUP_COUNT; index += 1) {
      await worker.rpc("advanceClock", {milliseconds: 100});
      await runMovementFanout({
        base,
        actor: accounts[index],
        observer,
        contract,
        failureRows,
        measureWire: false,
      });
    }

    await delay(25);
    const measurementHealthBefore = await fetchHealth(base);
    const measurementEventBefore = eventStreamMetrics(
      measurementHealthBefore,
      failureRows,
      "measurement start health",
    );
    const memoryBefore = await worker.rpc("metrics", {gc: true, resetPeakRss: true});

    for (let index = WARMUP_COUNT; index < WARMUP_COUNT + SAMPLE_COUNT; index += 1) {
      await worker.rpc("advanceClock", {milliseconds: 100});
      movementRows.push(await runMovementFanout({
        base,
        actor: accounts[index],
        observer,
        contract,
        failureRows,
        measureWire: true,
      }));
    }

    await delay(50);
    contract.unexpectedDeltaCount += observer.unexpectedCount;
    const measurementHealthAfter = await fetchHealth(base);
    const measurementEventAfter = eventStreamMetrics(
      measurementHealthAfter,
      failureRows,
      "measurement end health",
    );
    const memoryAfter = await worker.rpc("metrics", {gc: true});
    const afterPresence = memoryAfter;

    const allDeltaSizes = movementRows.flatMap((row) => row.deltaBytes);
    const httpAckP95Ms = p95(movementRows.map((row) => row.httpAckMs));
    const firstWsP95Ms = p95(movementRows.map((row) => row.firstWsMs));
    const lastWsP95Ms = p95(movementRows.map((row) => row.lastWsMs));
    const fanoutSpreadP95Ms = p95(movementRows.map((row) => row.fanoutSpreadMs));
    const deltaP95Bytes = p95(allDeltaSizes);
    const maxApplicationBytes = Math.max(...movementRows.map((row) => row.applicationBytes));
    const maxWireBytes = Math.max(...movementRows.map((row) => row.wireBytes));
    const heapGrowthBytes = memoryAfter.memory.heapUsed - memoryBefore.memory.heapUsed;
    const sampledPeakRssGrowthBytes = memoryAfter.peakRss - memoryBefore.memory.rss;
    const resourceMaxRssGrowthBytes = (
      Number(memoryAfter.resourceUsage && memoryAfter.resourceUsage.maxRSS || 0)
      - Number(memoryBefore.resourceUsage && memoryBefore.resourceUsage.maxRSS || 0)
    ) * 1024;
    const durableAcceptedDelta = metricDelta(
      beforePresence.durableMutations,
      afterPresence.durableMutations,
      "accepted",
    );
    const storeSaveDelta = Number(afterPresence.store.saves || 0) - Number(beforePresence.store.saves || 0);
    const sentFramesDelta = metricDelta(measurementEventBefore, measurementEventAfter, "sentFrames");
    const sentBytesDelta = metricDelta(measurementEventBefore, measurementEventAfter, "sentBytes");
    const slowDisconnectDelta = metricDelta(
      measurementEventBefore,
      measurementEventAfter,
      "slowConsumerDisconnects",
    );

    check(failureRows, connectTotalMs <= CONNECT_TIMEOUT_MS, `200 websocket bootstrap ${round(connectTotalMs)}ms > ${CONNECT_TIMEOUT_MS}ms`);
    check(failureRows, connectedMetrics.clients === ACCOUNT_COUNT, `event stream clients ${connectedMetrics.clients} != ${ACCOUNT_COUNT}`);
    check(failureRows, httpAckP95Ms <= 75, `movement HTTP ack p95 ${round(httpAckP95Ms)}ms > 75ms`);
    check(failureRows, lastWsP95Ms <= 150, `last websocket delta p95 ${round(lastWsP95Ms)}ms > 150ms`);
    check(failureRows, fanoutSpreadP95Ms <= 100, `fanout spread p95 ${round(fanoutSpreadP95Ms)}ms > 100ms`);
    check(failureRows, movementRows.every((row) => row.eventCount === ACCOUNT_COUNT), "one or more movement samples did not deliver exactly 200 deltas");
    check(failureRows, movementRows.every((row) => row.duplicateCount === 0), "duplicate presence deltas were observed");
    check(failureRows, movementRows.every((row) => row.missingCount === 0), "missing presence deltas were observed");
    check(failureRows, deltaP95Bytes <= MAX_DELTA_BYTES, `delta p95 ${deltaP95Bytes} bytes > ${MAX_DELTA_BYTES}`);
    check(failureRows, maxApplicationBytes <= MAX_FANOUT_APPLICATION_BYTES, `fanout application bytes ${maxApplicationBytes} > ${MAX_FANOUT_APPLICATION_BYTES}`);
    check(failureRows, maxWireBytes <= MAX_FANOUT_WIRE_BYTES, `single movement wire bytes ${maxWireBytes} > ${MAX_FANOUT_WIRE_BYTES}`);
    check(failureRows, contract.httpRosterViolations === 0, `HTTP presence responses carried players roster ${contract.httpRosterViolations} time(s)`);
    check(failureRows, contract.deltaRosterViolations === 0, `presence deltas carried players roster ${contract.deltaRosterViolations} time(s)`);
    check(failureRows, contract.invalidDeltaCount === 0, `invalid presence delta contract ${contract.invalidDeltaCount} time(s)`);
    check(failureRows, contract.unexpectedDeltaCount === 0, `unexpected presence deltas ${contract.unexpectedDeltaCount}`);
    check(failureRows, storeSaveDelta === 0, `presence stage store saves ${storeSaveDelta} != 0`);
    check(failureRows, durableAcceptedDelta === 0, `presence stage durable accepted ${durableAcceptedDelta} != 0`);
    check(failureRows, slowDisconnectDelta === 0, `normal consumers triggered ${slowDisconnectDelta} slow disconnect(s)`);
    check(failureRows, measurementEventAfter.clients === ACCOUNT_COUNT, `normal scenario retained ${measurementEventAfter.clients} / ${ACCOUNT_COUNT} websocket clients`);
    check(failureRows, clients.every((client) => client.unexpectedCloseCount === 0), "one or more normal websocket clients closed unexpectedly");
    check(failureRows, measurementEventAfter.backpressuredClients === 0, `normal scenario left ${measurementEventAfter.backpressuredClients} backpressured client(s)`);
    check(failureRows, measurementEventAfter.queuedFrames === 0, `normal scenario left ${measurementEventAfter.queuedFrames} queued frame(s)`);
    check(failureRows, measurementEventAfter.queuedBytes === 0, `normal scenario left ${measurementEventAfter.queuedBytes} queued byte(s)`);
    check(failureRows, heapGrowthBytes <= MAX_HEAP_GROWTH_BYTES, `server heap growth ${round(bytesToMiB(heapGrowthBytes))}MiB > ${bytesToMiB(MAX_HEAP_GROWTH_BYTES)}MiB`);
    check(failureRows, sampledPeakRssGrowthBytes <= MAX_PEAK_RSS_GROWTH_BYTES, `server sampled peak RSS growth ${round(bytesToMiB(sampledPeakRssGrowthBytes))}MiB > ${bytesToMiB(MAX_PEAK_RSS_GROWTH_BYTES)}MiB`);
    check(failureRows, resourceMaxRssGrowthBytes <= MAX_PEAK_RSS_GROWTH_BYTES, `server resourceUsage maxRSS growth ${round(bytesToMiB(resourceMaxRssGrowthBytes))}MiB > ${bytesToMiB(MAX_PEAK_RSS_GROWTH_BYTES)}MiB`);
    if (sentFramesDelta !== null) {
      check(failureRows, sentFramesDelta === ACCOUNT_COUNT * SAMPLE_COUNT, `event hub sent frame delta ${sentFramesDelta} != ${ACCOUNT_COUNT * SAMPLE_COUNT}`);
    }
    if (sentBytesDelta !== null) {
      check(failureRows, sentBytesDelta <= MAX_FANOUT_WIRE_BYTES * SAMPLE_COUNT, `event hub sent bytes ${sentBytesDelta} > ${MAX_FANOUT_WIRE_BYTES * SAMPLE_COUNT}`);
    }

    const result = {
      accounts: ACCOUNT_COUNT,
      connections: clients.length,
      connectTotalMs: round(connectTotalMs),
      connectP95Ms: round(p95(connectLatencies)),
      warmups: WARMUP_COUNT,
      samples: SAMPLE_COUNT,
      httpAckP95Ms: round(httpAckP95Ms),
      firstWsP95Ms: round(firstWsP95Ms),
      lastWsP95Ms: round(lastWsP95Ms),
      fanoutSpreadP95Ms: round(fanoutSpreadP95Ms),
      deltaP95Bytes,
      maxApplicationBytes,
      maxWireBytes,
      sentFramesDelta,
      sentBytesDelta,
      storeSaveDelta,
      durableAcceptedDelta,
      heapGrowthMiB: round(bytesToMiB(heapGrowthBytes)),
      sampledPeakRssGrowthMiB: round(bytesToMiB(sampledPeakRssGrowthBytes)),
      resourceMaxRssGrowthMiB: round(bytesToMiB(resourceMaxRssGrowthBytes)),
      eventStreamBefore: measurementEventBefore,
      eventStreamAfter: measurementEventAfter,
      contract,
      samplesRaw: movementRows.map((row) => ({
        accountId: row.accountId,
        httpAckMs: round(row.httpAckMs),
        firstWsMs: round(row.firstWsMs),
        lastWsMs: round(row.lastWsMs),
        fanoutSpreadMs: round(row.fanoutSpreadMs),
        eventCount: row.eventCount,
        duplicateCount: row.duplicateCount,
        missingCount: row.missingCount,
        applicationBytes: row.applicationBytes,
        wireFrames: row.wireFrames,
        wireBytes: row.wireBytes,
        deltaP95Bytes: p95(row.deltaBytes),
      })),
    };

    for (const client of clients) {
      client.expectClose();
      client.close();
    }
    await waitForEventStreamClients(base, 0, 3000).catch(() => null);
    return result;
  } finally {
    for (const client of clients) {
      client.terminate();
    }
    observer.cancel();
    await worker.stop();
  }
}

async function runSlowConsumerScenario(failureRows) {
  const worker = await ServerWorker.start();
  let normalClient = null;
  let rawSlowConnection = null;
  try {
    const base = `http://127.0.0.1:${worker.port}`;
    const wsBase = `ws://127.0.0.1:${worker.port}`;
    const accounts = worker.accounts;
    assertUniqueFixtureAccounts(accounts);
    const contract = {httpRosterViolations: 0};
    await initializePositions(base, accounts, contract);
    await readOnlineRosters(base, accounts);

    normalClient = new GateWebSocket(0, eventStreamUrl(wsBase, accounts[0].token), {
      expectedAccount: accounts[0],
      onMessage: () => {},
    });
    await normalClient.connect();
    rawSlowConnection = await openPausedRawWebSocket(worker.port, accounts[1]);
    const connectedHealth = await waitForEventStreamClients(base, 2, 3000);
    const before = eventStreamMetrics(connectedHealth, failureRows, "slow consumer start health");

    const actorStates = accounts.map(() => ({cellX: INITIAL_CELL_X, cellY: INITIAL_CELL_Y, movementSeq: 0}));
    const startedAt = performance.now();
    const deadlineAt = startedAt + SLOW_CONSUMER_TIMEOUT_MS;
    let attemptedMoves = 0;
    let acceptedMoves = 0;
    let isolated = false;
    let isolatedAtMs = null;
    let rawClosedAtMs = null;
    let latestHealth = connectedHealth;
    let cursor = 2;
    while (
      attemptedMoves < SLOW_CONSUMER_MAX_MOVES
      && performance.now() < deadlineAt
      && !isolated
    ) {
      await worker.rpc("advanceClock", {milliseconds: 100});
      const batch = [];
      for (let index = 0; index < SLOW_BURST_BATCH_SIZE && attemptedMoves < SLOW_CONSUMER_MAX_MOVES; index += 1) {
        const actorIndex = cursor;
        cursor += 1;
        if (cursor >= accounts.length) {
          cursor = 2;
        }
        const state = actorStates[actorIndex];
        const toCellX = state.cellX === INITIAL_CELL_X ? INITIAL_CELL_X + 1 : INITIAL_CELL_X;
        attemptedMoves += 1;
        batch.push(moveStep(base, accounts[actorIndex], state.cellX, toCellX).then((result) => {
          if (result.ok) {
            state.cellX = toCellX;
            state.movementSeq = Math.max(
              state.movementSeq + 1,
              Math.trunc(Number(result.position && result.position.movementSeq || 0)),
            );
            acceptedMoves += 1;
          }
          return result;
        }));
      }
      await Promise.all(batch);
      latestHealth = await fetchHealth(base);
      const metrics = eventStreamMetrics(latestHealth, failureRows, "slow consumer polling health", false);
      isolated = metrics.slowConsumerDisconnects > before.slowConsumerDisconnects && metrics.clients === 1;
      if (isolated) {
        isolatedAtMs = performance.now() - startedAt;
      }
    }

    if (!isolated) {
      const remainingMs = Math.max(0, deadlineAt - performance.now());
      latestHealth = remainingMs > 0
        ? await waitForSlowConsumerIsolation(base, before.slowConsumerDisconnects, 1, remainingMs).catch(() => latestHealth)
        : latestHealth;
      const metrics = eventStreamMetrics(latestHealth, failureRows, "slow consumer final health", false);
      isolated = metrics.slowConsumerDisconnects > before.slowConsumerDisconnects && metrics.clients === 1;
      if (isolated) {
        isolatedAtMs = performance.now() - startedAt;
      }
    }

    if (isolated && rawSlowConnection) {
      rawSlowConnection.socket.resume();
      const remainingMs = Math.max(0, deadlineAt - performance.now());
      if (remainingMs > 0) {
        try {
          await withTimeout(rawSlowConnection.closed, remainingMs, "raw slow websocket TCP close timeout");
          rawClosedAtMs = performance.now() - startedAt;
        } catch (error) {
          failureRows.push(error.message);
        }
      } else {
        failureRows.push("raw slow websocket did not close before the absolute 5s deadline");
      }
    }

    latestHealth = await fetchHealth(base);
    const after = eventStreamMetrics(latestHealth, failureRows, "slow consumer end health");
    check(failureRows, isolated, `real paused websocket was not isolated within ${SLOW_CONSUMER_TIMEOUT_MS}ms/${SLOW_CONSUMER_MAX_MOVES} moves`);
    check(failureRows, isolatedAtMs !== null && isolatedAtMs <= SLOW_CONSUMER_TIMEOUT_MS, `slow consumer isolation ${round(isolatedAtMs)}ms exceeded absolute 5s deadline`);
    check(failureRows, rawClosedAtMs !== null && rawClosedAtMs <= SLOW_CONSUMER_TIMEOUT_MS, `raw TCP close ${round(rawClosedAtMs)}ms exceeded absolute 5s deadline`);
    check(failureRows, acceptedMoves === attemptedMoves, `slow consumer burst accepted ${acceptedMoves} / ${attemptedMoves} legal movements`);
    check(failureRows, after.clients === 1, `slow consumer scenario clients ${after.clients} != 1 after isolation`);
    check(failureRows, after.slowConsumerDisconnects - before.slowConsumerDisconnects === 1, `slow consumer disconnect delta ${after.slowConsumerDisconnects - before.slowConsumerDisconnects} != 1`);
    check(failureRows, after.queuedBytes <= 256 * 1024, `slow consumer queued bytes ${after.queuedBytes} > 256KiB`);
    check(failureRows, after.queuedFrames <= 128, `slow consumer queued frames ${after.queuedFrames} > 128`);
    check(failureRows, after.maxClientQueuedFrames <= 128, `slow consumer per-client peak queued frames ${after.maxClientQueuedFrames} > 128`);
    check(failureRows, after.maxClientQueuedBytes <= 256 * 1024, `slow consumer per-client peak queued bytes ${after.maxClientQueuedBytes} > 256KiB`);
    check(failureRows, normalClient.unexpectedCloseCount === 0, "normal websocket closed while isolating slow consumer");

    let sentinelMs = null;
    if (isolated) {
      await worker.rpc("advanceClock", {milliseconds: 100});
      const state = actorStates[2];
      const toCellX = state.cellX === INITIAL_CELL_X ? INITIAL_CELL_X + 1 : INITIAL_CELL_X;
      const expectedMovementSeq = state.movementSeq + 1;
      const sentinelWait = normalClient.waitFor((event) => (
        event
        && event.type === "online.position"
        && event.accountId === accounts[2].accountId
        && event.change === "upsert"
        && Number(event.player && event.player.position && event.player.position.movementSeq || 0) === expectedMovementSeq
      ), 1000);
      const sentinelStartedAt = performance.now();
      const sentinelResult = await moveStep(base, accounts[2], state.cellX, toCellX);
      assert.equal(sentinelResult.ok, true, `sentinel movement failed: ${JSON.stringify(sentinelResult)}`);
      state.cellX = toCellX;
      state.movementSeq = Math.max(
        expectedMovementSeq,
        Math.trunc(Number(sentinelResult.position && sentinelResult.position.movementSeq || 0)),
      );
      await sentinelWait;
      sentinelMs = performance.now() - sentinelStartedAt;
      check(failureRows, sentinelMs <= 250, `normal websocket sentinel ${round(sentinelMs)}ms > 250ms`);
    }

    return {
      attemptedMoves,
      acceptedMoves,
      isolated,
      isolatedAtMs: round(isolatedAtMs),
      rawClosedAtMs: rawClosedAtMs === null ? null : round(rawClosedAtMs),
      sentinelMs: sentinelMs === null ? null : round(sentinelMs),
      metricsBefore: before,
      metricsAfter: after,
    };
  } finally {
    if (normalClient) {
      normalClient.expectClose();
      normalClient.terminate();
    }
    if (rawSlowConnection) {
      rawSlowConnection.socket.destroy();
    }
    await worker.stop();
  }
}

async function initializePositions(base, accounts, contract) {
  await mapInBatches(accounts, POSITION_BATCH_SIZE, async (account) => {
    const result = await fetchJson(`${base}/players/position`, {
      method: "POST",
      token: account.token,
      body: {
        mapId: SAME_AOI_MAP_ID,
        cellX: INITIAL_CELL_X,
        cellY: INITIAL_CELL_Y,
        facing: "south",
        moving: false,
      },
    });
    assert.equal(result.ok, true, `initial position failed for ${account.accountId}: ${JSON.stringify(result)}`);
    if (Object.hasOwn(result, "players")) {
      contract.httpRosterViolations += 1;
    }
  });
}

async function readOnlineRosters(base, accounts) {
  const results = await Promise.all(accounts.map((account) => fetchJson(`${base}/players/online?scope=aoi`, {
    token: account.token,
  })));
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    assert.equal(result.ok, true, `online roster failed for ${accounts[index].accountId}: ${JSON.stringify(result)}`);
    assertOnlineSnapshotPlayers(result.players, `HTTP online roster ${accounts[index].accountId}`);
  }
}

async function runMovementFanout({base, actor, observer, contract, failureRows, measureWire}) {
  const wireBefore = measureWire
    ? eventStreamMetrics(await fetchHealth(base), failureRows, `movement ${actor.accountId} start health`)
    : null;
  const startedAt = performance.now();
  const fanoutPromise = observer.begin(actor.accountId, actor.index, startedAt);
  let httpAcknowledgedAt = Number.NaN;
  const responsePromise = moveStep(base, actor, INITIAL_CELL_X, INITIAL_CELL_X + 1).then((response) => {
    httpAcknowledgedAt = performance.now();
    return response;
  });
  const [fanout, response] = await Promise.all([fanoutPromise, responsePromise]);
  const httpAckMs = httpAcknowledgedAt - startedAt;
  assert.equal(response.ok, true, `movement failed for ${actor.accountId}: ${JSON.stringify(response)}`);
  if (Object.hasOwn(response, "players")) {
    contract.httpRosterViolations += 1;
  }
  observer.finish();
  const wireAfter = measureWire
    ? eventStreamMetrics(await fetchHealth(base), failureRows, `movement ${actor.accountId} end health`)
    : null;
  const wireFrames = measureWire ? metricDelta(wireBefore, wireAfter, "sentFrames") : 0;
  const wireBytes = measureWire ? metricDelta(wireBefore, wireAfter, "sentBytes") : 0;
  if (measureWire) {
    check(failureRows, wireFrames === ACCOUNT_COUNT, `movement ${actor.accountId} wire frames ${wireFrames} != ${ACCOUNT_COUNT}`);
    check(failureRows, wireBytes !== null && wireBytes <= MAX_FANOUT_WIRE_BYTES, `movement ${actor.accountId} wire bytes ${wireBytes} > ${MAX_FANOUT_WIRE_BYTES}`);
  }
  return {
    accountId: actor.accountId,
    httpAckMs,
    firstWsMs: fanout.firstReceivedAt - startedAt,
    lastWsMs: fanout.lastReceivedAt - startedAt,
    fanoutSpreadMs: fanout.lastReceivedAt - fanout.firstReceivedAt,
    eventCount: fanout.seenClients.size,
    duplicateCount: fanout.duplicateCount,
    missingCount: ACCOUNT_COUNT - fanout.seenClients.size,
    applicationBytes: fanout.deltaBytes.reduce((sum, value) => sum + value, 0),
    wireFrames,
    wireBytes,
    deltaBytes: fanout.deltaBytes,
  };
}

async function moveStep(base, account, fromCellX, toCellX) {
  return fetchJson(`${base}/movement/step`, {
    method: "POST",
    token: account.token,
    body: {
      mapId: SAME_AOI_MAP_ID,
      fromCellX,
      fromCellY: INITIAL_CELL_Y,
      toCellX,
      toCellY: INITIAL_CELL_Y,
      facing: toCellX > fromCellX ? "east" : "west",
      moving: true,
    },
  });
}

class FanoutObserver {
  constructor(expectedClients) {
    this.expectedClients = expectedClients;
    this.active = null;
    this.unexpectedCount = 0;
  }

  begin(accountId, actorClientIndex, startedAt) {
    assert.equal(this.active, null, "fanout sample already active");
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const timer = setTimeout(() => {
      if (!this.active) {
        return;
      }
      const pending = this.expectedClients - this.active.seenClients.size;
      rejectPromise(new Error(`fanout timeout for ${accountId}: ${pending} client(s) missing`));
    }, FANOUT_TIMEOUT_MS);
    this.active = {
      accountId,
      actorClientIndex,
      startedAt,
      seenClients: new Set(),
      deltaBytes: [],
      duplicateCount: 0,
      firstReceivedAt: Number.POSITIVE_INFINITY,
      lastReceivedAt: 0,
      resolve: resolvePromise,
      reject: rejectPromise,
      timer,
    };
    return promise;
  }

  record(clientIndex, event, byteLength, receivedAt, contract) {
    if (!this.active || event.accountId !== this.active.accountId) {
      this.unexpectedCount += 1;
      return;
    }
    if (this.active.seenClients.has(clientIndex)) {
      this.active.duplicateCount += 1;
      return;
    }
    this.active.seenClients.add(clientIndex);
    this.active.deltaBytes.push(byteLength);
    this.active.firstReceivedAt = Math.min(this.active.firstReceivedAt, receivedAt);
    this.active.lastReceivedAt = Math.max(this.active.lastReceivedAt, receivedAt);
    if (Object.hasOwn(event, "players")) {
      contract.deltaRosterViolations += 1;
    }
    const isSelfRebase = clientIndex === this.active.actorClientIndex;
    const player = event.player && typeof event.player === "object" && !Array.isArray(event.player)
      ? event.player
      : null;
    const presenceRebase = event.presenceRebase && typeof event.presenceRebase === "object" && !Array.isArray(event.presenceRebase)
      ? event.presenceRebase
      : null;
    const validChange = isSelfRebase
      ? (
        event.change === "rebase"
        && presenceRebase
        && Array.isArray(presenceRebase.upserts)
        && Array.isArray(presenceRebase.removedAccountIds)
      )
      : (
        (event.change === "upsert" && player && String(player.accountId || "") === String(event.accountId || ""))
        || (event.change === "remove" && !player)
      );
    if (
      !validChange
      || !Number.isSafeInteger(event.presenceRevision)
      || event.presenceRevision <= 0
    ) {
      contract.invalidDeltaCount += 1;
    }
    if (this.active.seenClients.size === this.expectedClients) {
      clearTimeout(this.active.timer);
      this.active.resolve(this.active);
    }
  }

  finish() {
    if (this.active) {
      clearTimeout(this.active.timer);
    }
    this.active = null;
  }

  cancel() {
    if (this.active) {
      clearTimeout(this.active.timer);
      this.active.reject(new Error("fanout observer cancelled"));
      this.active = null;
    }
  }
}

class GateWebSocket {
  constructor(index, url, options = {}) {
    this.index = index;
    this.url = url;
    this.expectedAccount = options.expectedAccount || null;
    this.onMessage = typeof options.onMessage === "function" ? options.onMessage : () => {};
    this.socket = null;
    this.startedAt = 0;
    this.snapshotAt = 0;
    this.readySeen = false;
    this.snapshotSeen = false;
    this.expectedClose = false;
    this.unexpectedCloseCount = 0;
    this.waiters = [];
    this.messageTail = Promise.resolve();
  }

  connect() {
    assert.equal(typeof WebSocket, "function", "Node global WebSocket is unavailable");
    this.startedAt = performance.now();
    this.socket = new WebSocket(this.url);
    this.socket.binaryType = "arraybuffer";
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`websocket ${this.index} snapshot timeout`)), CONNECT_TIMEOUT_MS);
      const fail = (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error || "websocket error")));
      };
      this.socket.addEventListener("error", (event) => fail(new Error(`websocket ${this.index} error: ${event.message || "unknown"}`)), {once: true});
      this.socket.addEventListener("close", () => {
        if (!this.expectedClose) {
          this.unexpectedCloseCount += 1;
        }
      });
      this.socket.addEventListener("message", (message) => {
        this.messageTail = this.messageTail.then(async () => {
          const text = await webSocketDataText(message.data);
          const byteLength = Buffer.byteLength(text);
          const event = JSON.parse(text);
          const receivedAt = performance.now();
          if (event.type === "events.ready") {
            const accountId = String(event.account && event.account.accountId || "");
            if (!this.expectedAccount || accountId !== this.expectedAccount.accountId) {
              throw new Error(`websocket ${this.index} ready account mismatch: ${accountId}`);
            }
            if (Object.hasOwn(event, "token") || Object.hasOwn(event.account || {}, "token")) {
              throw new Error(`websocket ${this.index} ready leaked session token`);
            }
            this.readyAccountId = accountId;
            this.readySeen = true;
          }
          if (event.type === "online.snapshot") {
            assertOnlineSnapshotPlayers(event.players, `websocket ${this.index} online.snapshot`);
            this.snapshotSeen = true;
            this.snapshotAt = receivedAt;
          }
          this.onMessage(this.index, event, byteLength, receivedAt);
          this.resolveWaiters(event, byteLength, receivedAt);
          if (this.readySeen && this.snapshotSeen) {
            clearTimeout(timer);
            resolve(this);
          }
        }).catch(fail);
      });
    });
  }

  waitFor(predicate, timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timer: null,
      };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) {
          this.waiters.splice(index, 1);
        }
        reject(new Error(`websocket ${this.index} message waiter timeout`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  resolveWaiters(event, byteLength, receivedAt) {
    for (let index = 0; index < this.waiters.length; index += 1) {
      const waiter = this.waiters[index];
      if (!waiter.predicate(event)) {
        continue;
      }
      this.waiters.splice(index, 1);
      index -= 1;
      clearTimeout(waiter.timer);
      waiter.resolve({event, byteLength, receivedAt});
    }
  }

  expectClose() {
    this.expectedClose = true;
  }

  close() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.close();
      } catch {
        // Server worker shutdown below owns the final transport cleanup.
      }
    }
  }

  terminate() {
    this.expectedClose = true;
    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.addEventListener("open", () => {
        try {
          this.socket.close();
        } catch {
          // Server worker shutdown below owns the final transport cleanup.
        }
      }, {once: true});
    } else if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      try {
        this.socket.close();
      } catch {
        // Server worker shutdown below owns the final transport cleanup.
      }
    }
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("websocket terminated"));
    }
  }
}

class ServerWorker {
  static async start() {
    const child = fork(FILE, ["--server-worker"], {
      cwd: ROOT,
      execArgv: ["--expose-gc"],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    const instance = new ServerWorker(child);
    try {
      await instance.ready();
      return instance;
    } catch (error) {
      await instance.stop(false);
      throw error;
    }
  }

  constructor(child) {
    this.child = child;
    this.port = 0;
    this.accounts = [];
    this.nextId = 1;
    this.pending = new Map();
    this.stdoutTail = "";
    this.stderrTail = "";
    this.readySettled = false;
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    child.stdout.on("data", (chunk) => {
      this.stdoutTail = boundedTail(this.stdoutTail + chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk) => {
      this.stderrTail = boundedTail(this.stderrTail + chunk.toString("utf8"));
    });
    child.on("message", (message) => this.onMessage(message));
    child.on("error", (error) => this.failAll(error));
    child.on("exit", (code, signal) => {
      if (!this.readySettled || this.pending.size > 0) {
        this.failAll(new Error(`server worker exited code=${code} signal=${signal}\n${this.stderrTail}`));
      }
    });
  }

  ready() {
    return withTimeout(this.readyPromise, 10000, "server worker ready timeout");
  }

  onMessage(message) {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "ready") {
      this.port = Number(message.port || 0);
      this.accounts = Array.isArray(message.accounts) ? message.accounts : [];
      this.readySettled = true;
      this.resolveReady(this);
      return;
    }
    if (message.type === "fatal") {
      this.failAll(new Error(String(message.error || "server worker fatal error")));
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(String(message.error || "worker request failed")));
    }
  }

  rpc(command, payload = {}) {
    if (!this.child.connected || !childIsRunning(this.child)) {
      return Promise.reject(new Error("server worker IPC is closed"));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`server worker ${command} timeout`));
      }, 10000);
      this.pending.set(id, {resolve, reject, timer});
      this.child.send({id, command, payload});
    });
  }

  failAll(error) {
    this.rejectReady(error);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async stop(graceful = true) {
    if (!this.child || !childIsRunning(this.child)) {
      return;
    }
    if (graceful && this.readySettled) {
      try {
        await this.rpc("shutdown");
      } catch {
        // Fall through to process termination below.
      }
    }
    if (childIsRunning(this.child)) {
      await Promise.race([
        new Promise((resolve) => this.child.once("exit", resolve)),
        delay(500),
      ]);
    }
    if (childIsRunning(this.child)) {
      this.child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => this.child.once("exit", resolve)),
        delay(500),
      ]);
    }
    if (childIsRunning(this.child)) {
      this.child.kill("SIGKILL");
      await Promise.race([
        new Promise((resolve) => this.child.once("exit", resolve)),
        delay(1000),
      ]);
    }
    if (childIsRunning(this.child)) {
      throw new Error(`server worker ${this.child.pid} did not exit`);
    }
  }
}

function childIsRunning(child) {
  return Boolean(child && child.exitCode === null && child.signalCode === null);
}

async function runServerWorker() {
  const {
    createAuthService,
    createMemoryAuthStore,
  } = require("../server/node/src/auth-service");
  const {
    createHttpServer,
    drainServerForShutdown,
  } = require("../server/node/src/http-server");

  let nowMs = Date.now();
  const fixture = presenceSeed(ACCOUNT_COUNT, nowMs);
  const baseStore = createMemoryAuthStore(fixture.data);
  const storeCounts = {loads: 0, saves: 0};
  const store = {
    mode: "presence-gate-memory",
    load() {
      storeCounts.loads += 1;
      return baseStore.load();
    },
    save(value) {
      storeCounts.saves += 1;
      return baseStore.save(value);
    },
    checkHealth() {
      return {ok: true};
    },
  };
  const service = createAuthService({
    store,
    now: () => nowMs,
    allowPositionTeleport: false,
    allowInitialPositionSeedForTests: true,
  });
  const server = createHttpServer({service, store});
  let peakRss = process.memoryUsage().rss;
  const memoryTimer = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 10);
  memoryTimer.unref();

  const send = (message) => {
    if (typeof process.send === "function" && process.connected) {
      process.send(message);
    }
  };
  let fatalExiting = false;
  const fatal = (error) => {
    send({type: "fatal", error: error && error.stack ? error.stack : String(error)});
    if (!fatalExiting) {
      fatalExiting = true;
      setImmediate(() => process.exit(1));
    }
  };
  process.on("uncaughtException", fatal);
  process.on("unhandledRejection", fatal);

  server.listen(0, "127.0.0.1", () => {
    send({
      type: "ready",
      port: server.address().port,
      accounts: fixture.accounts,
    });
  });

  process.on("message", async (message) => {
    if (!message || typeof message !== "object" || !message.id) {
      return;
    }
    const {id, command, payload = {}} = message;
    try {
      if (command === "advanceClock") {
        nowMs += Math.max(0, Math.trunc(Number(payload.milliseconds || 0)));
        send({id, ok: true, result: {nowMs}});
        return;
      }
      if (command === "metrics") {
        if (payload.gc && typeof global.gc === "function") {
          global.gc();
        }
        const memory = process.memoryUsage();
        if (payload.resetPeakRss) {
          peakRss = memory.rss;
        } else {
          peakRss = Math.max(peakRss, memory.rss);
        }
        send({
          id,
          ok: true,
          result: {
            memory,
            peakRss,
            cpuUsage: process.cpuUsage(),
            resourceUsage: process.resourceUsage(),
            store: {...storeCounts},
            durableMutations: typeof service.durableMutationMetrics === "function"
              ? service.durableMutationMetrics()
              : null,
          },
        });
        return;
      }
      if (command === "shutdown") {
        clearInterval(memoryTimer);
        await drainServerForShutdown(server, store);
        send({id, ok: true, result: {closed: true}});
        setImmediate(() => process.exit(0));
        return;
      }
      throw new Error(`unknown server worker command: ${command}`);
    } catch (error) {
      send({id, ok: false, error: error && error.stack ? error.stack : String(error)});
    }
  });
}

function presenceSeed(count, nowMs) {
  const data = {
    accounts: {},
    sessions: {},
    profileBindings: {},
    profiles: {},
  };
  const accounts = [];
  for (let index = 0; index < count; index += 1) {
    const suffix = String(index).padStart(3, "0");
    const accountId = `acc_presence_gate_${suffix}`;
    const username = `presence${suffix}`;
    const sessionId = `sess_presence_gate_${suffix}`;
    const token = `presence_gate_token_${suffix}_${"x".repeat(32)}`;
    const createdAt = new Date(nowMs).toISOString();
    data.accounts[username] = {
      accountId,
      username,
      displayName: `容量玩家${suffix}`,
      role: "player",
      createdAt,
      updatedAt: createdAt,
      schemaVersion: 1,
    };
    data.sessions[sessionId] = {
      sessionId,
      accountId,
      tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      createdAt,
      expiresAt: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
      revokedAt: null,
      schemaVersion: 1,
    };
    const playerId = `player_presence_gate_${suffix}`;
    data.profileBindings[accountId] = {
      accountId,
      playerId,
      profileRevision: 0,
      createdAt,
      updatedAt: createdAt,
      schemaVersion: 1,
    };
    data.profiles[playerId] = {
      playerId,
      accountId,
      profileRevision: 0,
      updatedAt: createdAt,
      schemaVersion: 1,
      profile: {
        name: `容量玩家${suffix}`,
        backpackSlots: [],
        equipmentInstances: {},
        petInstances: [],
      },
    };
    accounts.push({index, accountId, username, sessionId, token});
  }
  return {data, accounts};
}

async function fetchJson(url, options = {}) {
  const headers = {
    "content-type": "application/json",
    "x-beastbound-client-version": SERVER_VERSION,
    "x-beastbound-protocol-version": String(PROTOCOL_VERSION),
    ...(options.headers || {}),
  };
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs || HTTP_TIMEOUT_MS),
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid JSON from ${url}: status=${response.status} body=${text.slice(0, 500)}`, {cause: error});
  }
}

function fetchHealth(base) {
  return fetchJson(`${base}/health`);
}

function eventStreamUrl(wsBase, token) {
  const query = new URLSearchParams({
    clientVersion: SERVER_VERSION,
    clientProtocolVersion: String(PROTOCOL_VERSION),
    token,
  });
  return `${wsBase}/events?${query.toString()}`;
}

async function openPausedRawWebSocket(port, account) {
  const key = crypto.randomBytes(16).toString("base64");
  const expectedAccept = crypto.createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  const requestPath = new URL(eventStreamUrl(`ws://127.0.0.1:${port}`, account.token));
  const socket = net.createConnection({host: "127.0.0.1", port});
  const closed = new Promise((resolve) => socket.once("close", resolve));
  let transportBuffer = Buffer.alloc(0);
  let frameBuffer = Buffer.alloc(0);
  let upgraded = false;
  let readySeen = false;
  let snapshotSeen = false;
  let settled = false;
  const handshake = new Promise((resolve, reject) => {
    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    socket.once("connect", () => {
      socket.write([
        `GET ${requestPath.pathname}${requestPath.search} HTTP/1.1`,
        `Host: 127.0.0.1:${port}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`,
        "Sec-WebSocket-Version: 13",
        "",
        "",
      ].join("\r\n"));
    });
    socket.on("error", fail);
    socket.once("close", () => {
      if (!settled) {
        fail(new Error("raw websocket closed before ready/snapshot"));
      }
    });
    socket.on("data", function onData(chunk) {
      try {
        if (!upgraded) {
          transportBuffer = Buffer.concat([transportBuffer, chunk]);
          const headerEnd = transportBuffer.indexOf("\r\n\r\n");
          if (headerEnd < 0) {
            return;
          }
          const header = transportBuffer.subarray(0, headerEnd).toString("utf8");
          const headerLines = header.split("\r\n");
          const headers = new Map(headerLines.slice(1).map((line) => {
            const separator = line.indexOf(":");
            return separator < 0
              ? [line.toLowerCase(), ""]
              : [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()];
          }));
          if (!headerLines[0].startsWith("HTTP/1.1 101")) {
            fail(new Error(`raw websocket upgrade failed: ${header.slice(0, 500)}`));
            return;
          }
          if (headers.get("sec-websocket-accept") !== expectedAccept) {
            fail(new Error("raw websocket Sec-WebSocket-Accept mismatch"));
            return;
          }
          upgraded = true;
          frameBuffer = transportBuffer.subarray(headerEnd + 4);
          transportBuffer = Buffer.alloc(0);
        } else {
          frameBuffer = Buffer.concat([frameBuffer, chunk]);
        }

        while (true) {
          const parsed = readServerWebSocketFrame(frameBuffer);
          if (!parsed) {
            break;
          }
          frameBuffer = frameBuffer.subarray(parsed.bytesRead);
          if (parsed.opcode === 0x8) {
            fail(new Error("raw websocket closed before ready/snapshot"));
            return;
          }
          if (parsed.opcode !== 0x1) {
            continue;
          }
          const event = JSON.parse(parsed.payload.toString("utf8"));
          if (event.type === "events.ready") {
            assert.equal(String(event.account && event.account.accountId || ""), account.accountId, "raw websocket ready account mismatch");
            assert.equal(Object.hasOwn(event, "token") || Object.hasOwn(event.account || {}, "token"), false, "raw websocket ready leaked token");
            readySeen = true;
          }
          if (event.type === "online.snapshot") {
            assertOnlineSnapshotPlayers(event.players, "raw websocket online.snapshot");
            snapshotSeen = true;
          }
          if (readySeen && snapshotSeen) {
            settled = true;
            socket.off("data", onData);
            socket.pause();
            resolve();
            return;
          }
        }
      } catch (error) {
        fail(error);
      }
    });
  });
  try {
    await withTimeout(handshake, 3000, "raw websocket ready/snapshot timeout");
  } catch (error) {
    socket.destroy();
    await closed.catch(() => undefined);
    throw error;
  }
  return {socket, closed};
}

function readServerWebSocketFrame(buffer) {
  if (buffer.length < 2) {
    return null;
  }
  const opcode = buffer[0] & 0x0F;
  const masked = (buffer[1] & 0x80) !== 0;
  if (masked) {
    throw new Error("server websocket frame must not be masked");
  }
  let length = buffer[1] & 0x7F;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) {
      return null;
    }
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) {
      return null;
    }
    const largeLength = buffer.readBigUInt64BE(2);
    if (largeLength > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("server websocket frame is too large");
    }
    length = Number(largeLength);
    offset = 10;
  }
  if (buffer.length < offset + length) {
    return null;
  }
  return {
    opcode,
    payload: Buffer.from(buffer.subarray(offset, offset + length)),
    bytesRead: offset + length,
  };
}

async function waitForEventStreamClients(base, expected, timeoutMs) {
  const deadline = performance.now() + timeoutMs;
  let last = null;
  while (performance.now() < deadline) {
    last = await fetchHealth(base);
    const metrics = eventStreamMetrics(last, [], "event stream client wait", false);
    if (metrics.clients === expected) {
      return last;
    }
    await delay(HEALTH_POLL_MS);
  }
  throw new Error(`event stream clients did not reach ${expected}: ${JSON.stringify(last && last.eventStream)}`);
}

async function waitForSlowConsumerIsolation(base, priorSlowDisconnects, expectedClients, timeoutMs) {
  const deadline = performance.now() + timeoutMs;
  let last = null;
  while (performance.now() < deadline) {
    last = await fetchHealth(base);
    const metrics = eventStreamMetrics(last, [], "slow consumer wait", false);
    if (metrics.clients === expectedClients && metrics.slowConsumerDisconnects > priorSlowDisconnects) {
      return last;
    }
    await delay(HEALTH_POLL_MS);
  }
  throw new Error(`slow consumer was not isolated: ${JSON.stringify(last && last.eventStream)}`);
}

function eventStreamMetrics(health, failureRows, label, required = true) {
  const source = health && health.eventStream && typeof health.eventStream === "object"
    ? health.eventStream
    : {};
  const definitions = {
    clients: ["clients", "connections", "clientCount"],
    backpressuredClients: ["backpressuredClients", "backpressureConnections", "backpressureClients"],
    queuedFrames: ["queuedFrames", "queuedEvents", "pendingFrames"],
    peakQueuedFrames: ["peakQueuedFrames", "maxQueuedFrames"],
    maxClientQueuedFrames: ["maxClientQueuedFrames"],
    queuedBytes: ["queuedBytes", "pendingBytes"],
    peakQueuedBytes: ["peakQueuedBytes", "maxQueuedBytes"],
    maxClientQueuedBytes: ["maxClientQueuedBytes"],
    sentFrames: ["sentFrames", "sentEvents", "framesSent"],
    sentBytes: ["sentBytes", "bytesSent"],
    coalescedEvents: ["coalescedEvents", "coalescedFrames", "presenceCoalesced"],
    slowConsumerDisconnects: ["slowConsumerDisconnects", "slowDisconnects"],
  };
  const result = {};
  for (const [name, aliases] of Object.entries(definitions)) {
    const presentAliases = aliases.filter((alias) => Object.hasOwn(source, alias));
    if (presentAliases.length === 0) {
      result[name] = null;
      if (required) {
        failureRows.push(`${label} missing eventStream metric: ${name}`);
      }
      continue;
    }
    const values = presentAliases.map((alias) => source[alias]);
    const valid = values.every((value) => Number.isSafeInteger(value) && value >= 0);
    if (!valid) {
      result[name] = null;
      if (required) {
        failureRows.push(`${label} eventStream metric ${name} must be an own non-negative safe integer`);
      }
      continue;
    }
    if (new Set(values).size !== 1 && required) {
      failureRows.push(`${label} eventStream aliases disagree for ${name}: ${presentAliases.map((alias, index) => `${alias}=${values[index]}`).join(", ")}`);
    }
    result[name] = values[0];
  }
  return result;
}

function metricDelta(before, after, name) {
  const first = before && Number(before[name]);
  const second = after && Number(after[name]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return null;
  }
  return second - first;
}

async function mapInBatches(values, batchSize, fn) {
  for (let offset = 0; offset < values.length; offset += batchSize) {
    await Promise.all(values.slice(offset, offset + batchSize).map(fn));
  }
}

function assertUniqueFixtureAccounts(accounts) {
  assert.equal(accounts.length, ACCOUNT_COUNT, `fixture account count ${accounts.length} != ${ACCOUNT_COUNT}`);
  assert.equal(new Set(accounts.map((account) => account.accountId)).size, ACCOUNT_COUNT, "fixture account ids are not unique");
  assert.equal(new Set(accounts.map((account) => account.token)).size, ACCOUNT_COUNT, "fixture session tokens are not unique");
}

function assertOnlineSnapshotPlayers(players, label) {
  assert.equal(Array.isArray(players), true, `${label} is missing players array`);
  assert.ok(players.length <= 64, `${label} has ${players.length} rows > 64`);
  const accountIds = new Set();
  for (const player of players) {
    assert.ok(player && typeof player === "object" && !Array.isArray(player), `${label} contains a non-object player`);
    const accountId = String(player.accountId || "");
    assert.notEqual(accountId, "", `${label} contains an empty account id`);
    assert.equal(accountIds.has(accountId), false, `${label} contains duplicate account ${accountId}`);
    accountIds.add(accountId);
    assert.equal(
      Number.isSafeInteger(player.presenceRevision) && player.presenceRevision > 0,
      true,
      `${label} account ${accountId} has invalid presenceRevision`,
    );
  }
}

async function webSocketDataText(data) {
  if (typeof data === "string") {
    return data;
  }
  if (data && typeof data.arrayBuffer === "function") {
    return Buffer.from(await data.arrayBuffer()).toString("utf8");
  }
  return Buffer.from(data).toString("utf8");
}

function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function check(failureRows, condition, message) {
  if (!condition) {
    failureRows.push(message);
  }
}

function p95(values) {
  const numbers = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (numbers.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return numbers[Math.max(0, Math.ceil(numbers.length * 0.95) - 1)];
}

function bytesToMiB(value) {
  return Number(value || 0) / (1024 * 1024);
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function boundedTail(value, maxLength = 16000) {
  return value.length <= maxLength ? value : value.slice(-maxLength);
}

function git(args) {
  try {
    return execFileSync("git", args, {cwd: ROOT, encoding: "utf8"}).trim();
  } catch {
    return "unknown";
  }
}

if (process.argv.includes("--server-worker")) {
  await runServerWorker();
} else {
  await runGate();
}
