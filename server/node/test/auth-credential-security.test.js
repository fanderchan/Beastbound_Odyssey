"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const {promisify} = require("node:util");
const {createAuthService, createMemoryAuthStore} = require("../src/auth-service");

test("registration bounds password bytes and display-name graphemes without breaking direct login", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const exact = service.register({
    username: "boundaryexact",
    password: "p".repeat(128),
    displayName: "😀".repeat(24),
  });
  assert.equal(exact.ok, true);
  assert.equal(service.login({username: "boundaryexact", password: "p".repeat(128)}).ok, true);

  const longPassword = service.register({
    username: "boundarypass",
    password: "p".repeat(129),
  });
  assert.equal(longPassword.ok, false);
  assert.equal(longPassword.code, "password_too_long");

  const longName = service.register({
    username: "boundaryname",
    password: "test1234",
    displayName: "名".repeat(25),
  });
  assert.equal(longName.ok, false);
  assert.equal(longName.code, "invalid_display_name");
});

test("HTTP digest login gives unknown and wrong accounts the same public result", async () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  assert.equal(service.register({username: "digestuser", password: "test1234"}).ok, true);
  const scrypt = promisify(crypto.scrypt);
  const knownRecord = service._httpPasswordVerificationRecord("digestuser");
  const wrongHash = (await scrypt("wrong123", knownRecord.salt, 32)).toString("hex");
  const unknownRecord = service._httpPasswordVerificationRecord("missinguser");
  const unknownHash = (await scrypt("wrong123", unknownRecord.salt, 32)).toString("hex");
  const wrong = service._httpLoginPasswordDigest({username: "digestuser", clientIp: "127.0.0.1"}, wrongHash);
  const unknown = service._httpLoginPasswordDigest({username: "missinguser", clientIp: "127.0.0.1"}, unknownHash);
  assert.deepEqual(
    {ok: wrong.ok, code: wrong.code, message: wrong.message},
    {ok: unknown.ok, code: unknown.code, message: unknown.message},
  );
  assert.equal(wrong.code, "invalid_credentials");
});

test("auth attempt state has a hard key cap and expires idle keys", () => {
  let nowMs = 1000;
  const service = createAuthService({
    store: createMemoryAuthStore(),
    now: () => nowMs,
    authAttemptStateMaxKeys: 2,
    authAttemptStateTtlMs: 100,
  });
  for (const clientIp of ["198.51.100.1", "198.51.100.2"]) {
    assert.equal(service.register({username: "x", password: "test1234", clientIp}).code, "invalid_username");
  }
  assert.equal(service.authSecurityMetrics().attemptKeys, 2);
  assert.equal(
    service.register({username: "x", password: "test1234", clientIp: "198.51.100.3"}).code,
    "auth_rate_limited",
  );
  assert.equal(service.authSecurityMetrics().attemptKeys, 2);
  nowMs += 101;
  assert.equal(service.register({username: "x", password: "test1234", clientIp: "198.51.100.3"}).code, "invalid_username");
  assert.equal(service.authSecurityMetrics().attemptKeys, 1);
});

test("legacy oversized auth event history is bounded to the newest 500 rows", () => {
  const authEvents = Array.from({length: 750}, (_entry, index) => ({
    eventId: `auth_${index}`,
    type: "login_denied",
    username: "bounded",
    ok: false,
    message: "denied",
    createdAt: new Date(1000 + index).toISOString(),
    schemaVersion: 1,
  }));
  const service = createAuthService({store: createMemoryAuthStore({authEvents})});
  const snapshot = service.snapshot();
  assert.equal(snapshot.authEvents.length, 500);
  assert.equal(snapshot.authEvents[0].eventId, "auth_250");
  assert.equal(snapshot.authEvents[499].eventId, "auth_749");
});
