"use strict";

const assert = require("node:assert/strict");
const {getEventListeners} = require("node:events");
const test = require("node:test");

const {
  STORAGE_QUEUE_FULL,
  STORAGE_COMMIT_TIMEOUT,
  STORAGE_SHUTTING_DOWN,
  STORAGE_REQUEST_CANCELED,
  createDurableMutationCoordinator,
} = require("../src/auth/durable-mutation-coordinator");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("durable coordinator does not acknowledge before the operation settles", async () => {
  const coordinator = createDurableMutationCoordinator({responseTimeoutMs: 1000});
  const commit = deferred();
  let responseSettled = false;

  const response = coordinator.run(async () => {
    await commit.promise;
    return {ok: true, revision: 2};
  });
  response.finally(() => {
    responseSettled = true;
  });

  await nextTurn();
  assert.equal(responseSettled, false);
  assert.equal(coordinator.idle(), false);
  assert.deepEqual(coordinator.metrics(), {
    pending: 1,
    running: 1,
    accepted: 1,
    rejected: 0,
    timeouts: 0,
    completed: 0,
    succeeded: 0,
    failed: 0,
    queueFull: 0,
    shutdownRejected: 0,
    canceledBeforeStart: 0,
    admissionOpen: true,
    maxPending: 128,
    responseTimeoutMs: 1000,
  });

  commit.resolve();
  assert.deepEqual(await response, {ok: true, revision: 2});
  await coordinator.waitForIdle();
  assert.equal(coordinator.idle(), true);
  assert.equal(coordinator.metrics().completed, 1);
  assert.equal(coordinator.metrics().succeeded, 1);
});

test("durable coordinator assigns a failure to its original operation", async () => {
  const coordinator = createDurableMutationCoordinator({responseTimeoutMs: 1000});
  const firstCommit = deferred();
  const originalError = Object.assign(new Error("first commit failed"), {code: "storage_write_failed"});
  const executionOrder = [];

  const first = coordinator.run(async () => {
    executionOrder.push("first:start");
    await firstCommit.promise;
    executionOrder.push("first:end");
  });
  const second = coordinator.run(async () => {
    executionOrder.push("second");
    return "second-ok";
  });

  await nextTurn();
  firstCommit.reject(originalError);
  await assert.rejects(first, (error) => error === originalError);
  assert.equal(await second, "second-ok");
  assert.deepEqual(executionOrder, ["first:start", "second"]);
  assert.equal(coordinator.metrics().failed, 1);
  assert.equal(coordinator.metrics().succeeded, 1);
  assert.equal(coordinator.metrics().rejected, 1);
});

test("durable coordinator recovers its serial tail after sync and async failures", async () => {
  const coordinator = createDurableMutationCoordinator({responseTimeoutMs: 1000});
  const syncError = new Error("sync failure");
  const asyncError = new Error("async failure");

  const syncFailure = coordinator.run(() => {
    throw syncError;
  });
  const asyncFailure = coordinator.run(async () => {
    throw asyncError;
  });
  const recovered = coordinator.run(() => "recovered");

  await assert.rejects(syncFailure, (error) => error === syncError);
  await assert.rejects(asyncFailure, (error) => error === asyncError);
  assert.equal(await recovered, "recovered");
  await coordinator.waitForIdle();
  assert.equal(coordinator.idle(), true);
  assert.equal(coordinator.metrics().completed, 3);
  assert.equal(coordinator.metrics().failed, 2);
  assert.equal(coordinator.metrics().succeeded, 1);
});

test("queued durable operations yield one event-loop turn after each predecessor settles", async () => {
  const turnResolvers = [];
  const executionOrder = [];
  const coordinator = createDurableMutationCoordinator({
    responseTimeoutMs: 1000,
    yieldTurn: () => new Promise((resolve) => turnResolvers.push(resolve)),
  });

  const first = coordinator.run(() => {
    executionOrder.push("first");
    return "first-ok";
  });
  const second = coordinator.run(() => {
    executionOrder.push("second");
    return "second-ok";
  });
  const third = coordinator.run(() => {
    executionOrder.push("third");
    return "third-ok";
  });

  assert.equal(await first, "first-ok");
  await Promise.resolve();
  assert.deepEqual(executionOrder, ["first"]);
  assert.equal(turnResolvers.length, 1);
  turnResolvers.shift()();
  assert.equal(await second, "second-ok");
  await Promise.resolve();
  assert.deepEqual(executionOrder, ["first", "second"]);
  assert.equal(turnResolvers.length, 1);
  turnResolvers.shift()();
  assert.equal(await third, "third-ok");
  await coordinator.waitForIdle();
  assert.deepEqual(executionOrder, ["first", "second", "third"]);
});

test("response timeout does not cancel settlement or release the serial queue", async () => {
  const coordinator = createDurableMutationCoordinator({responseTimeoutMs: 15});
  const firstCommit = deferred();
  let secondStarted = false;

  const first = coordinator.run(async () => {
    await firstCommit.promise;
    return "committed-after-timeout";
  });
  const second = coordinator.run(() => {
    secondStarted = true;
    return "second-ok";
  }, {timeoutMs: 1000});

  await assert.rejects(first, (error) => {
    assert.equal(error.code, STORAGE_COMMIT_TIMEOUT);
    assert.equal(error.retryable, true);
    assert.equal(error.outcomeUnknown, true);
    assert.match(error.message, /原操作标识/);
    return true;
  });
  assert.equal(secondStarted, false);
  assert.equal(coordinator.metrics().pending, 2);
  assert.equal(coordinator.metrics().timeouts, 1);

  firstCommit.resolve();
  assert.equal(await second, "second-ok");
  await coordinator.waitForIdle();
  assert.equal(coordinator.metrics().completed, 2);
  assert.equal(coordinator.metrics().succeeded, 2);
  assert.equal(coordinator.metrics().rejected, 1);
});

test("queue capacity rejects before invoking the business operation", async () => {
  const coordinator = createDurableMutationCoordinator({
    maxPending: 2,
    responseTimeoutMs: 1000,
  });
  const firstCommit = deferred();
  let rejectedOperationInvocations = 0;

  const first = coordinator.run(() => firstCommit.promise);
  const second = coordinator.run(() => "second-ok");
  const rejectedRun = coordinator.run(() => {
    rejectedOperationInvocations += 1;
    return "must-not-run";
  });

  await assert.rejects(rejectedRun, (error) => {
    assert.equal(error.code, STORAGE_QUEUE_FULL);
    assert.equal(error.retryable, true);
    assert.equal(error.outcomeUnknown, false);
    return true;
  });
  assert.equal(rejectedOperationInvocations, 0);
  assert.equal(coordinator.metrics().pending, 2);
  assert.equal(coordinator.metrics().accepted, 2);
  assert.equal(coordinator.metrics().queueFull, 1);
  assert.equal(coordinator.metrics().rejected, 1);

  firstCommit.resolve("first-ok");
  assert.equal(await first, "first-ok");
  assert.equal(await second, "second-ok");
});

test("disconnect cancels a queued operation before its business function starts", async () => {
  const coordinator = createDurableMutationCoordinator({responseTimeoutMs: 1000});
  const firstCommit = deferred();
  const controller = new AbortController();
  let canceledOperationInvocations = 0;

  const first = coordinator.run(() => firstCommit.promise);
  const canceled = coordinator.run(() => {
    canceledOperationInvocations += 1;
    return "must-not-run";
  }, {signal: controller.signal});

  await nextTurn();
  assert.equal(getEventListeners(controller.signal, "abort").length, 1);
  controller.abort();
  await assert.rejects(canceled, (error) => {
    assert.equal(error.code, STORAGE_REQUEST_CANCELED);
    assert.equal(error.statusCode, 499);
    assert.equal(error.retryable, true);
    assert.equal(error.outcomeUnknown, false);
    return true;
  });
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  assert.equal(canceledOperationInvocations, 0);

  firstCommit.resolve("first-ok");
  assert.equal(await first, "first-ok");
  await coordinator.waitForIdle();
  assert.equal(canceledOperationInvocations, 0);
  assert.equal(coordinator.metrics().canceledBeforeStart, 1);
  assert.equal(coordinator.metrics().accepted, 2);
  assert.equal(coordinator.metrics().completed, 2);
  assert.equal(coordinator.metrics().failed, 1);
  assert.equal(coordinator.metrics().rejected, 1);
});

test("disconnect is ignored after the durable business function starts", async () => {
  const coordinator = createDurableMutationCoordinator({responseTimeoutMs: 1000});
  const controller = new AbortController();
  const commit = deferred();
  const started = deferred();
  let responseSettled = false;

  const response = coordinator.run(async () => {
    started.resolve();
    await commit.promise;
    return "committed";
  }, {signal: controller.signal});
  response.then(
    () => { responseSettled = true; },
    () => { responseSettled = true; },
  );

  await started.promise;
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  controller.abort();
  await nextTurn();
  assert.equal(responseSettled, false);
  assert.equal(coordinator.metrics().canceledBeforeStart, 0);

  commit.resolve();
  assert.equal(await response, "committed");
  await coordinator.waitForIdle();
  assert.equal(coordinator.metrics().succeeded, 1);
  assert.equal(coordinator.metrics().failed, 0);
});

test("already-aborted signal is rejected before admission", async () => {
  const coordinator = createDurableMutationCoordinator({responseTimeoutMs: 1000});
  const controller = new AbortController();
  let invocations = 0;
  controller.abort();

  await assert.rejects(coordinator.run(() => {
    invocations += 1;
  }, {signal: controller.signal}), (error) => {
    assert.equal(error.code, STORAGE_REQUEST_CANCELED);
    assert.equal(error.outcomeUnknown, false);
    return true;
  });
  assert.equal(invocations, 0);
  assert.equal(coordinator.metrics().accepted, 0);
  assert.equal(coordinator.metrics().pending, 0);
  assert.equal(coordinator.metrics().canceledBeforeStart, 1);
  assert.equal(coordinator.metrics().rejected, 1);
});

test("waiting for a durable operation does not block the Node event loop", async () => {
  const coordinator = createDurableMutationCoordinator({responseTimeoutMs: 1000});
  const commit = deferred();
  const response = coordinator.run(() => commit.promise);
  let timerObserved = false;

  await new Promise((resolve) => {
    setTimeout(() => {
      timerObserved = true;
      resolve();
    }, 0);
  });

  assert.equal(timerObserved, true);
  assert.equal(coordinator.metrics().pending, 1);
  commit.resolve("ok");
  assert.equal(await response, "ok");
});

test("shutdown atomically stops admission before draining the captured tail", async () => {
  const coordinator = createDurableMutationCoordinator({responseTimeoutMs: 1000});
  const commit = deferred();
  let lateOperationInvocations = 0;
  let drainSettled = false;

  const accepted = coordinator.run(() => commit.promise);
  await nextTurn();
  const drain = coordinator.stopAdmissionAndDrain().then(() => {
    drainSettled = true;
  });
  const late = coordinator.run(() => {
    lateOperationInvocations += 1;
  });

  await assert.rejects(late, (error) => {
    assert.equal(error.code, STORAGE_SHUTTING_DOWN);
    assert.equal(error.retryable, true);
    assert.equal(error.outcomeUnknown, false);
    return true;
  });
  assert.equal(lateOperationInvocations, 0);
  assert.equal(drainSettled, false);
  assert.equal(coordinator.metrics().admissionOpen, false);
  assert.equal(coordinator.metrics().shutdownRejected, 1);

  commit.resolve("committed");
  assert.equal(await accepted, "committed");
  await drain;
  assert.equal(drainSettled, true);
  assert.equal(coordinator.idle(), true);
});
