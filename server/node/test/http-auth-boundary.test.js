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
