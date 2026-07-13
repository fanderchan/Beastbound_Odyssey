"use strict";

const DEFAULT_PENDING_INVITE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_MAX_PENDING_INVITES = 1024;
const DEFAULT_MAX_PENDING_PER_ACCOUNT = 16;

function pendingInviteAdmission(collection, invite, options = {}) {
  const pendingStatus = String(options.pendingStatus || "pending");
  const maxPending = positiveInteger(options.maxPending, DEFAULT_MAX_PENDING_INVITES);
  const maxPerAccount = positiveInteger(options.maxPerAccount, DEFAULT_MAX_PENDING_PER_ACCOUNT);
  const source = objectValue(collection);
  const fromAccountId = String(invite && invite.fromAccountId || "").trim();
  const toAccountId = String(invite && invite.toAccountId || "").trim();
  let pending = 0;
  let fromPending = 0;
  let toPending = 0;
  for (const current of Object.values(source)) {
    if (!current || String(current.status || "") !== pendingStatus) {
      continue;
    }
    pending += 1;
    if (fromAccountId !== "" && (
      String(current.fromAccountId || "") === fromAccountId
      || String(current.toAccountId || "") === fromAccountId
    )) {
      fromPending += 1;
    }
    if (toAccountId !== "" && toAccountId !== fromAccountId && (
      String(current.fromAccountId || "") === toAccountId
      || String(current.toAccountId || "") === toAccountId
    )) {
      toPending += 1;
    }
  }
  if (pending >= maxPending) {
    return Object.freeze({ok: false, code: "invite_capacity_full", pending, maxPending});
  }
  if (fromPending >= maxPerAccount || toPending >= maxPerAccount) {
    return Object.freeze({ok: false, code: "invite_account_capacity_full", pending, maxPending, maxPerAccount});
  }
  return Object.freeze({ok: true, pending, maxPending, maxPerAccount});
}

function expirePendingInvites(collection, options = {}) {
  const source = objectValue(collection);
  const nowMs = finiteNow(options.now);
  const ttlMs = positiveInteger(options.ttlMs, DEFAULT_PENDING_INVITE_TTL_MS);
  const pendingStatus = String(options.pendingStatus || "pending");
  const expiredStatus = String(options.expiredStatus || "expired");
  const expired = [];
  for (const [inviteId, invite] of Object.entries(source)) {
    if (!invite || String(invite.status || "") !== pendingStatus) {
      continue;
    }
    const createdAt = Date.parse(String(invite.createdAt || ""));
    const explicitExpiresAt = Date.parse(String(invite.expiresAt || ""));
    const expiresAt = Number.isFinite(explicitExpiresAt)
      ? explicitExpiresAt
      : (Number.isFinite(createdAt) ? createdAt + ttlMs : nowMs);
    if (expiresAt > nowMs) {
      continue;
    }
    expired.push(terminalInvite(source, inviteId, expiredStatus, {
      now: () => nowMs,
      updatedAt: new Date(nowMs).toISOString(),
    }));
  }
  return expired.filter(Boolean);
}

function terminalInvite(collection, inviteId, status, options = {}) {
  const source = objectValue(collection);
  const normalizedInviteId = String(inviteId || "").trim();
  const invite = normalizedInviteId === "" ? null : source[normalizedInviteId];
  if (!invite) {
    return null;
  }
  const terminal = {
    ...invite,
    status: String(status || "expired"),
    updatedAt: String(options.updatedAt || new Date(finiteNow(options.now)).toISOString()),
  };
  delete source[normalizedInviteId];
  return terminal;
}

function pendingInviteMetrics(collection, options = {}) {
  const pendingStatus = String(options.pendingStatus || "pending");
  const values = Object.values(objectValue(collection));
  return Object.freeze({
    total: values.length,
    pending: values.filter((invite) => invite && String(invite.status || "") === pendingStatus).length,
    terminal: values.filter((invite) => invite && String(invite.status || "") !== pendingStatus).length,
  });
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finiteNow(now) {
  const value = typeof now === "function" ? Number(now()) : Date.now();
  return Number.isFinite(value) ? value : Date.now();
}

function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

module.exports = {
  DEFAULT_MAX_PENDING_INVITES,
  DEFAULT_MAX_PENDING_PER_ACCOUNT,
  DEFAULT_PENDING_INVITE_TTL_MS,
  expirePendingInvites,
  pendingInviteAdmission,
  pendingInviteMetrics,
  terminalInvite,
};
