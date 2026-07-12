"use strict";

const {isDeepStrictEqual} = require("node:util");

const RUNTIME_ROOT_FIELDS = Object.freeze([
  "playerPositions",
  "battleInvites",
  "battleRooms",
  "tradeOffers",
]);
const DURABLE_RECEIPT_TTL_MS = 72 * 60 * 60 * 1000;
const DURABLE_RECEIPT_MAX_COUNT = 20000;
const DURABLE_OPERATION_ID_PATTERN = /^[A-Za-z0-9._:-]{16,160}$/;
const DURABLE_REQUEST_HASH_PATTERN = /^[a-f0-9]{64}$/;
const DURABLE_RECEIPT_EXCLUDED_METHODS = new Set([
  "register",
  "login",
  "refreshSession",
  "getMarketConfig",
]);

function durableBusinessChanged(beforeValue, candidateValue, options) {
  return !isDeepStrictEqual(
    durableBusinessProjection(beforeValue, options),
    durableBusinessProjection(candidateValue, options),
  );
}

function durableBusinessProjection(data, options) {
  const projection = options.persistentDataForStore(data);
  // Per-command traces and battle-only replay sequence movement are diagnostic
  // runtime churn, not player assets. They remain in memory and are folded into
  // the next real durable settlement, so ordinary turns do not pay a DB RTT.
  projection.battleTrace = [];
  projection.serviceEventSeq = Math.max(
    0,
    ...projection.serviceEvents.map((event) => options.normalizeEventSeq(event && event.eventSeq)),
  );
  return projection;
}

function restorePublishedPersistentData(currentValue, persistentValue, options) {
  const current = options.normalizeData(currentValue);
  const persistent = options.normalizeData(persistentValue || {});
  for (const field of RUNTIME_ROOT_FIELDS) {
    persistent[field] = clone(current[field]);
  }
  return persistent;
}

function mergeRuntimeObject(beforeValue, candidateValue, currentValue) {
  const before = objectOrEmpty(beforeValue);
  const candidate = objectOrEmpty(candidateValue);
  const merged = clone(objectOrEmpty(currentValue));
  const keys = new Set([...Object.keys(before), ...Object.keys(candidate)]);
  for (const key of keys) {
    const beforeHas = Object.hasOwn(before, key);
    const candidateHas = Object.hasOwn(candidate, key);
    if (beforeHas === candidateHas && isDeepStrictEqual(before[key], candidate[key])) {
      continue;
    }
    if (!candidateHas) {
      delete merged[key];
    } else {
      merged[key] = clone(candidate[key]);
    }
  }
  return merged;
}

function normalizeDurableMutationReceipts(value) {
  if (value === undefined) {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw receiptError("持久化操作回执账本格式不正确。", "mutation_receipt_ledger_invalid");
  }
  const result = {};
  for (const [operationId, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw receiptError(`持久化操作回执不完整：${operationId || "<empty>"}`);
    }
    const normalizedOperationId = String(raw.operationId || operationId || "").trim();
    const rawRequestHash = String(raw.requestHash || "");
    const requestHash = rawRequestHash.trim().toLowerCase();
    const rawActionId = String(raw.actionId || "");
    const actionId = rawActionId.trim();
    const committedAtMs = Date.parse(String(raw.committedAt || ""));
    const expiresAtMs = Date.parse(String(raw.expiresAt || ""));
    if (
      raw.schemaVersion !== 1
      || operationId !== normalizedOperationId
      || !DURABLE_OPERATION_ID_PATTERN.test(normalizedOperationId)
      || rawRequestHash !== requestHash
      || !DURABLE_REQUEST_HASH_PATTERN.test(requestHash)
      || rawActionId !== actionId
      || actionId === ""
      || actionId.length > 160
      || !Number.isFinite(committedAtMs)
      || !Number.isFinite(expiresAtMs)
      || expiresAtMs <= committedAtMs
      || !raw.response
      || typeof raw.response !== "object"
      || Array.isArray(raw.response)
    ) {
      throw receiptError(`持久化操作回执不完整：${operationId || "<empty>"}`);
    }
    result[normalizedOperationId] = {
      schemaVersion: 1,
      operationId: normalizedOperationId,
      requestHash,
      actionId,
      accountId: String(raw.accountId || ""),
      committedAt: new Date(committedAtMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      response: clone(raw.response),
    };
  }
  return result;
}

function activeDurableReceipt(data, operationId, nowMs) {
  const receipt = data && data.mutationReceipts && data.mutationReceipts[operationId];
  if (!receipt) {
    return null;
  }
  const expiresAtMs = Date.parse(String(receipt.expiresAt || ""));
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs ? receipt : null;
}

function pruneDurableMutationReceipts(value, nowMs) {
  const entries = Object.values(normalizeDurableMutationReceipts(value))
    .filter((receipt) => Date.parse(receipt.expiresAt) > nowMs)
    .sort((a, b) => Date.parse(a.committedAt) - Date.parse(b.committedAt));
  const kept = entries.slice(Math.max(0, entries.length - DURABLE_RECEIPT_MAX_COUNT + 1));
  return Object.fromEntries(kept.map((receipt) => [receipt.operationId, receipt]));
}

function durableCommitResult(result, metadata) {
  return {
    ...result,
    durableCommit: {
      schemaVersion: 1,
      operationId: String(metadata.operationId || ""),
      actionId: String(metadata.actionId || ""),
      committedAt: String(metadata.committedAt || ""),
      replayed: Boolean(metadata.replayed),
    },
  };
}

function durableReceiptReplayResult(receipt) {
  const response = clone(receipt.response);
  response.durableCommit = {
    ...objectOrEmpty(response.durableCommit),
    schemaVersion: 1,
    operationId: receipt.operationId,
    actionId: receipt.actionId,
    committedAt: receipt.committedAt,
    replayed: true,
  };
  return response;
}

function durableMutationAccountId(data, args, hashToken) {
  const token = durableMutationToken(args);
  if (token === "") {
    return "";
  }
  const tokenHash = hashToken(token);
  const session = Object.values(objectOrEmpty(data && data.sessions))
    .find((entry) => entry && entry.tokenHash === tokenHash);
  return String(session && session.accountId || "");
}

function durableMutationToken(args) {
  const credential = Array.isArray(args) ? args[0] : null;
  if (typeof credential === "string") {
    return credential;
  }
  if (credential && typeof credential === "object" && !Array.isArray(credential)) {
    return String(credential.token || "");
  }
  return "";
}

function receiptError(message, code = "mutation_receipt_invalid") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  RUNTIME_ROOT_FIELDS,
  DURABLE_RECEIPT_TTL_MS,
  DURABLE_OPERATION_ID_PATTERN,
  DURABLE_REQUEST_HASH_PATTERN,
  DURABLE_RECEIPT_EXCLUDED_METHODS,
  durableBusinessChanged,
  restorePublishedPersistentData,
  mergeRuntimeObject,
  normalizeDurableMutationReceipts,
  activeDurableReceipt,
  pruneDurableMutationReceipts,
  durableCommitResult,
  durableReceiptReplayResult,
  durableMutationAccountId,
  durableMutationToken,
};
