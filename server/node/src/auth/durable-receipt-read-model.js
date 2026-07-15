"use strict";

const {
  DURABLE_OPERATION_ID_PATTERN,
  canonicalDurableMutationReceipts,
} = require("./durable-mutation-state");

function durableReceiptReadOperationId(value) {
  const operationId = String(value || "").trim();
  if (!DURABLE_OPERATION_ID_PATTERN.test(operationId)) {
    const error = new Error("持久化操作回执读穿标识不正确。");
    error.code = "durable_receipt_read_operation_invalid";
    throw error;
  }
  return operationId;
}

function canonicalDurableReceiptReadView(value, expectedOperationIdValue = "") {
  const view = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const operationId = durableReceiptReadOperationId(view.operationId);
  const expectedOperationId = String(expectedOperationIdValue || "").trim();
  if (
    view.schemaVersion !== 1
    || (expectedOperationId !== "" && operationId !== durableReceiptReadOperationId(expectedOperationId))
    || (view.receipt !== null
      && (!view.receipt || typeof view.receipt !== "object" || Array.isArray(view.receipt)))
  ) {
    const error = new Error("持久化操作回执读穿结果不完整。");
    error.code = "durable_receipt_read_view_invalid";
    throw error;
  }
  let receipt = null;
  if (view.receipt !== null) {
    try {
      receipt = canonicalDurableMutationReceipts({
        [operationId]: view.receipt,
      })[operationId];
    } catch (cause) {
      const error = new Error("持久化操作回执读穿结果不完整。");
      error.code = "durable_receipt_read_view_invalid";
      error.cause = cause;
      throw error;
    }
  }
  const rawStoreRevision = view.storeRevision;
  const storeRevision = rawStoreRevision === undefined || rawStoreRevision === null
    ? null
    : Number(rawStoreRevision);
  if (
    storeRevision !== null
    && (!Number.isSafeInteger(storeRevision) || storeRevision < 0)
  ) {
    const error = new Error("持久化操作回执读穿版本不正确。");
    error.code = "durable_receipt_read_view_invalid";
    throw error;
  }
  return Object.freeze({
    schemaVersion: 1,
    operationId,
    storeRevision,
    authorityCurrent: view.authorityCurrent === true,
    receipt,
  });
}

module.exports = {
  canonicalDurableReceiptReadView,
  durableReceiptReadOperationId,
};
