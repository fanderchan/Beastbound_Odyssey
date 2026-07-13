"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  expirePendingInvites,
  pendingInviteAdmission,
  pendingInviteMetrics,
  terminalInvite,
} = require("../src/auth/runtime-invite-boundary");

function invite(id, from, to, createdAt, extra = {}) {
  return {
    inviteId: id,
    fromAccountId: from,
    toAccountId: to,
    status: "pending",
    createdAt,
    updatedAt: createdAt,
    ...extra,
  };
}

test("pending invite admission is globally and per-account bounded", () => {
  const collection = {
    one: invite("one", "a", "b", "2026-07-13T00:00:00.000Z"),
    two: invite("two", "a", "c", "2026-07-13T00:00:01.000Z"),
  };
  assert.equal(pendingInviteAdmission(collection, {fromAccountId: "d", toAccountId: "e"}, {maxPending: 2}).code, "invite_capacity_full");
  assert.equal(pendingInviteAdmission(collection, {fromAccountId: "a", toAccountId: "e"}, {maxPending: 10, maxPerAccount: 2}).code, "invite_account_capacity_full");
  assert.equal(pendingInviteAdmission(collection, {fromAccountId: "d", toAccountId: "e"}, {maxPending: 10, maxPerAccount: 2}).ok, true);
});

test("expired and explicitly terminal invites are returned for response construction then deleted", () => {
  const nowMs = Date.parse("2026-07-13T00:05:00.000Z");
  const collection = {
    old: invite("old", "a", "b", "2026-07-13T00:00:00.000Z"),
    live: invite("live", "c", "d", "2026-07-13T00:04:30.000Z"),
  };
  const expired = expirePendingInvites(collection, {now: () => nowMs, ttlMs: 120_000});
  assert.deepEqual(expired.map((entry) => entry.inviteId), ["old"]);
  assert.equal(expired[0].status, "expired");
  assert.equal(collection.old, undefined);
  assert.ok(collection.live);

  const accepted = terminalInvite(collection, "live", "accepted", {now: () => nowMs});
  assert.equal(accepted.status, "accepted");
  assert.equal(collection.live, undefined);
  assert.deepEqual(pendingInviteMetrics(collection), {total: 0, pending: 0, terminal: 0});
});

test("explicit expiresAt wins over the default TTL", () => {
  const nowMs = Date.parse("2026-07-13T00:01:00.000Z");
  const collection = {
    soon: invite("soon", "a", "b", "2026-07-13T00:00:59.000Z", {
      expiresAt: "2026-07-13T00:00:59.500Z",
    }),
  };
  assert.equal(expirePendingInvites(collection, {now: () => nowMs, ttlMs: 999_999}).length, 1);
  assert.deepEqual(collection, {});
});
