"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {createAsyncScryptQueue, createHttpAuthBoundary} = require("../src/http-auth-boundary");

test("async scrypt queue yields to the event loop and keeps active/queued work bounded", async () => {
  const queue = createAsyncScryptQueue({authWorkMaxActive: 2, authWorkMaxQueued: 16});
  let ticks = 0;
  const ticker = setInterval(() => { ticks += 1; }, 1);
  const hashes = await Promise.all(Array.from({length: 10}, (_entry, index) => (
    queue.derive(`password_${index}`, "0123456789abcdef0123456789abcdef")
  )));
  clearInterval(ticker);
  assert.equal(hashes.every((hash) => /^[a-f0-9]{64}$/.test(hash)), true);
  assert.equal(ticks > 0, true);
  assert.equal(queue.metrics().active, 0);
  assert.equal(queue.metrics().queued, 0);
  assert.equal(queue.metrics().peakActive, 2);
  assert.equal(queue.metrics().peakQueued <= 8, true);
});

test("async scrypt queue rejects excess work before it becomes unbounded", async () => {
  const queue = createAsyncScryptQueue({authWorkMaxActive: 1, authWorkMaxQueued: 1});
  const first = queue.derive("password_a", "0123456789abcdef0123456789abcdef");
  const second = queue.derive("password_b", "0123456789abcdef0123456789abcdef");
  await assert.rejects(
    queue.derive("password_c", "0123456789abcdef0123456789abcdef"),
    (error) => error.code === "auth_work_queue_full" && error.statusCode === 429,
  );
  await Promise.all([first, second]);
  assert.equal(queue.metrics().rejected, 1);
});

test("HTTP auth boundary never forwards plaintext passwords to durable methods", async () => {
  const calls = [];
  const credentialSource = {
    _httpValidateRegistration() {
      return {ok: true};
    },
    _httpPasswordVerificationRecord() {
      return {salt: "0123456789abcdef0123456789abcdef"};
    },
  };
  const durableService = {
    _httpRegisterPasswordDigest(payload, credential) {
      calls.push({type: "register", payload, credential});
      return {ok: true};
    },
    _httpLoginPasswordDigest(payload, passwordHash) {
      calls.push({type: "login", payload, passwordHash});
      return {ok: false, code: "invalid_credentials", message: "账号或密码不正确。"};
    },
  };
  const boundary = createHttpAuthBoundary(credentialSource, durableService);
  await boundary.register({username: "safeuser", password: "test1234", displayName: "安全"}, "127.0.0.1");
  await boundary.login({username: "safeuser", password: "wrong123"}, "127.0.0.1");
  assert.equal(Object.hasOwn(calls[0].payload, "password"), false);
  assert.equal(Object.hasOwn(calls[1].payload, "password"), false);
  assert.match(calls[0].credential.passwordHash, /^[a-f0-9]{64}$/);
  assert.match(calls[1].passwordHash, /^[a-f0-9]{64}$/);
});

test("cluster login admission runs only after credential verification and before durable mutation", async () => {
  const order = [];
  const salt = "0123456789abcdef0123456789abcdef";
  const acceptedHash = await createAsyncScryptQueue().derive("correct123", salt);
  const credentialSource = {
    _httpPasswordVerificationRecord() {
      return {salt};
    },
    _httpClusterLoginIdentity(username, passwordHash) {
      order.push(`verify:${username}`);
      return passwordHash === acceptedHash
        ? {ok: true, accountId: "acc_owner"}
        : {ok: false};
    },
  };
  const durableService = {
    _httpLoginPasswordDigest(_payload, passwordHash) {
      order.push("durable");
      return {ok: passwordHash === acceptedHash};
    },
  };
  const boundary = createHttpAuthBoundary(credentialSource, durableService, {
    async beforeLogin(identity) {
      order.push(`admit:${identity.accountId}`);
    },
  });

  assert.equal((await boundary.login({username: "owner", password: "wrong123"})).ok, false);
  assert.deepEqual(order, ["verify:owner", "durable"]);
  order.length = 0;
  assert.equal((await boundary.login({username: "owner", password: "correct123"})).ok, true);
  assert.deepEqual(order, ["verify:owner", "admit:acc_owner", "durable"]);
});

test("cluster login awaits the exact credential proof and preserves its identity", async () => {
  const order = [];
  const salt = "fedcba9876543210fedcba9876543210";
  const proof = Object.freeze({
    salt,
    accountId: "acc_exact_owner",
    username: "exactowner",
    passwordHash: await createAsyncScryptQueue().derive("exactpass123", salt),
    source: "store",
    storeRevision: 42,
  });
  const credentialSource = {
    _httpPasswordVerificationRecord() {
      throw new Error("local credential reader must not run");
    },
    async _httpClusterPasswordVerificationRecord(username) {
      order.push(`read:${username}`);
      await Promise.resolve();
      return proof;
    },
    _httpClusterLoginIdentity(username, passwordHash, receivedProof) {
      order.push(`verify:${username}`);
      assert.equal(receivedProof, proof);
      assert.equal(passwordHash, proof.passwordHash);
      return {ok: true, accountId: proof.accountId};
    },
  };
  const durableService = {
    _httpLoginPasswordDigest() {
      order.push("durable");
      return {ok: true};
    },
  };
  const boundary = createHttpAuthBoundary(credentialSource, durableService, {
    async beforeLogin(identity) {
      order.push(`admit:${identity.accountId}`);
    },
  });

  assert.equal((await boundary.login({
    username: "exactowner",
    password: "exactpass123",
  })).ok, true);
  assert.deepEqual(order, [
    "read:exactowner",
    "verify:exactowner",
    "admit:acc_exact_owner",
    "durable",
  ]);
});

test("cluster login admission rejection prevents durable login mutation", async () => {
  let durableCalls = 0;
  const credentialSource = {
    _httpPasswordVerificationRecord() {
      return {salt: "0123456789abcdef0123456789abcdef"};
    },
    _httpClusterLoginIdentity() {
      return {ok: true, accountId: "acc_conflict"};
    },
  };
  const durableService = {
    _httpLoginPasswordDigest() {
      durableCalls += 1;
      return {ok: true};
    },
  };
  const boundary = createHttpAuthBoundary(credentialSource, durableService, {
    beforeLogin() {
      const error = new Error("conflict");
      error.code = "cluster_account_owner_conflict";
      throw error;
    },
  });

  await assert.rejects(
    boundary.login({username: "owner", password: "correct123"}),
    (error) => error.code === "cluster_account_owner_conflict",
  );
  assert.equal(durableCalls, 0);
});
