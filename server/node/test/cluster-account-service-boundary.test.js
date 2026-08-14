"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const {
  createAuthService,
  createMemoryAuthStore,
} = require("../src/auth-service");
const {
  createPresenceRevisionTracker,
} = require("../src/auth/online-presence");

const DAY_MS = 24 * 60 * 60 * 1000;

test("cluster ingress identity is read-only and refresh grace is explicit", () => {
  let nowMs = Date.UTC(2026, 7, 15, 0, 0, 0);
  const presenceRevisions = createPresenceRevisionTracker();
  const service = createAuthService({
    store: createMemoryAuthStore(),
    now: () => nowMs,
    presenceRevisionTracker: presenceRevisions,
  });
  const registered = service.register({
    username: "clusteruser",
    password: "cluster123",
    displayName: "集群玩家",
  });
  assert.equal(registered.ok, true);
  const token = registered.session.token;
  const accountId = registered.account.accountId;

  const before = JSON.stringify(service.snapshot());
  assert.deepEqual(service._clusterIngressIdentity(token), {
    ok: true,
    accountId,
    sessionId: registered.session.sessionId,
  });
  assert.equal(JSON.stringify(service.snapshot()), before);
  assert.equal(service._clusterIngressIdentity("invalid").ok, false);

  nowMs += 7 * DAY_MS + 1;
  assert.equal(service._clusterIngressIdentity(token).code, "session_expired");
  assert.equal(service._clusterIngressIdentity(token, {allowRefreshGrace: true}).ok, true);
  nowMs += 7 * DAY_MS;
  assert.equal(
    service._clusterIngressIdentity(token, {allowRefreshGrace: true}).code,
    "session_refresh_expired",
  );

  assert.equal(
    service._adoptClusterPresenceRevisionFloor(
      accountId,
      2_000_000_000,
      2_999_999_999,
    ),
    2_000_000_000,
  );
  assert.equal(presenceRevisions.current(accountId), 2_000_000_000);
  assert.equal(presenceRevisions.next(accountId), 2_000_000_001);
});

test("cluster login identity is returned only after the derived credential matches", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({
    username: "loginowner",
    password: "ownerpass123",
    displayName: "归属玩家",
  });
  assert.equal(registered.ok, true);
  const verification = service._httpPasswordVerificationRecord("loginowner");
  const correctHash = crypto.scryptSync(
    "ownerpass123",
    verification.salt,
    32,
  ).toString("hex");
  const wrongHash = crypto.scryptSync(
    "wrongpass123",
    verification.salt,
    32,
  ).toString("hex");

  assert.deepEqual(service._httpClusterLoginIdentity("loginowner", correctHash), {
    ok: true,
    accountId: registered.account.accountId,
  });
  assert.deepEqual(service._httpClusterLoginIdentity("loginowner", wrongHash), {ok: false});
  assert.deepEqual(service._httpClusterLoginIdentity("missing", correctHash), {ok: false});
});
