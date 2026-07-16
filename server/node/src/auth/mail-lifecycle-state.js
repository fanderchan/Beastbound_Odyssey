"use strict";

const MAIL_SETTLEMENT_SCHEMA_VERSION = 1;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(code, message, details = {}) {
  return {ok: false, code, message, ...details};
}

function canonicalIsoTimestamp(value) {
  if (typeof value !== "string" || value === "" || value !== value.trim()) {
    return "";
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  try {
    return new Date(timestamp).toISOString() === value ? value : "";
  } catch {
    return "";
  }
}

function attachmentStateHasAssets(attachmentState) {
  if (!attachmentState || attachmentState.ok !== true) {
    return null;
  }
  const items = Array.isArray(attachmentState.items) ? attachmentState.items : null;
  const equipmentEnvelopes = Array.isArray(attachmentState.equipmentEnvelopes)
    ? attachmentState.equipmentEnvelopes
    : null;
  const currency = isRecord(attachmentState.currency) ? attachmentState.currency : null;
  if (items === null || equipmentEnvelopes === null || currency === null) {
    return null;
  }
  const currencyTotal = Object.values(currency).reduce((total, value) => {
    const amount = Number(value);
    return total + (Number.isSafeInteger(amount) && amount > 0 ? amount : 0);
  }, 0);
  return items.length > 0 || equipmentEnvelopes.length > 0 || currencyTotal > 0;
}

function readMailLifecycleState(mailValue, attachmentState) {
  if (!isRecord(mailValue)) {
    return fail(
      "mail_lifecycle_invalid",
      "邮件生命周期记录异常，相关操作已暂停，请联系GM处理。",
    );
  }
  const hasAssets = attachmentStateHasAssets(attachmentState);
  if (hasAssets === null) {
    return fail(
      "mail_lifecycle_assets_unverified",
      "邮件附件状态无法认证，相关操作已暂停；附件会原样保留，请联系GM处理。",
    );
  }
  const hasSettledAt = Object.hasOwn(mailValue, "settledAt");
  const settledAt = hasSettledAt ? canonicalIsoTimestamp(mailValue.settledAt) : "";
  if (hasSettledAt && settledAt === "") {
    return fail(
      "mail_lifecycle_invalid",
      "邮件结算时间异常，相关操作已暂停；附件会原样保留，请联系GM处理。",
    );
  }
  const hasReadAt = mailValue.readAt !== null
    && mailValue.readAt !== undefined
    && String(mailValue.readAt).trim() !== "";
  if (hasReadAt && canonicalIsoTimestamp(mailValue.readAt) === "") {
    return fail(
      "mail_lifecycle_read_at_invalid",
      "邮件已读时间异常，相关操作已暂停；附件会原样保留，请联系GM处理。",
    );
  }
  if (hasAssets && hasSettledAt) {
    return fail(
      "mail_lifecycle_asset_conflict",
      "邮件仍有待领取附件但已被标记为结算，相关操作已暂停；附件会原样保留，请联系GM处理。",
    );
  }
  const createdAt = canonicalIsoTimestamp(mailValue.createdAt);
  if (settledAt !== "" && createdAt !== "" && Date.parse(settledAt) < Date.parse(createdAt)) {
    return fail(
      "mail_lifecycle_invalid",
      "邮件结算时间早于创建时间，相关操作已暂停；附件会原样保留，请联系GM处理。",
    );
  }
  return {
    ok: true,
    hasAssets,
    settled: !hasAssets && settledAt !== "",
    settledAt: settledAt || null,
    legacyUnsettled: !hasAssets && !hasSettledAt,
    schemaVersion: MAIL_SETTLEMENT_SCHEMA_VERSION,
  };
}

function initializeMailLifecycle(mailValue, attachmentState) {
  const current = readMailLifecycleState(mailValue, attachmentState);
  if (!current.ok || current.hasAssets || current.settled) {
    return current.ok ? {ok: true, mail: structuredClone(mailValue), state: current} : current;
  }
  const createdAt = canonicalIsoTimestamp(mailValue.createdAt);
  if (createdAt === "") {
    return fail(
      "mail_lifecycle_created_at_invalid",
      "邮件创建时间异常，邮件未发送，请重试。",
    );
  }
  const mail = structuredClone(mailValue);
  mail.settledAt = createdAt;
  return {
    ok: true,
    mail,
    state: {
      ok: true,
      hasAssets: false,
      settled: true,
      settledAt: createdAt,
      legacyUnsettled: false,
      schemaVersion: MAIL_SETTLEMENT_SCHEMA_VERSION,
    },
  };
}

function settleMailLifecycle(mailValue, attachmentState, settledAtValue) {
  const current = readMailLifecycleState(mailValue, attachmentState);
  if (!current.ok) {
    return current;
  }
  if (current.hasAssets) {
    return fail(
      "mail_lifecycle_assets_remaining",
      "邮件仍有待领取附件，不能完成结算；剩余附件会继续保留在邮箱。",
    );
  }
  if (current.settled) {
    return {ok: true, mail: structuredClone(mailValue), state: current, changed: false};
  }
  const settledAt = canonicalIsoTimestamp(settledAtValue);
  if (settledAt === "") {
    return fail(
      "mail_lifecycle_settled_at_invalid",
      "邮件结算时间异常，本次领取已取消，请重试。",
    );
  }
  const createdAt = canonicalIsoTimestamp(mailValue.createdAt);
  if (createdAt !== "" && Date.parse(settledAt) < Date.parse(createdAt)) {
    return fail(
      "mail_lifecycle_settled_at_invalid",
      "邮件结算时间异常，本次领取已取消，请重试。",
    );
  }
  const mail = structuredClone(mailValue);
  mail.settledAt = settledAt;
  if (mail.readAt === null || mail.readAt === undefined || String(mail.readAt).trim() === "") {
    mail.readAt = settledAt;
  } else if (canonicalIsoTimestamp(mail.readAt) === "") {
    return fail(
      "mail_lifecycle_read_at_invalid",
      "邮件已读时间异常，本次领取已取消；附件会原样保留，请联系GM处理。",
    );
  }
  return {
    ok: true,
    mail,
    state: {
      ok: true,
      hasAssets: false,
      settled: true,
      settledAt,
      legacyUnsettled: false,
      schemaVersion: MAIL_SETTLEMENT_SCHEMA_VERSION,
    },
    changed: true,
  };
}

module.exports = {
  MAIL_SETTLEMENT_SCHEMA_VERSION,
  canonicalMailLifecycleIsoTimestamp: canonicalIsoTimestamp,
  initializeMailLifecycle,
  readMailLifecycleState,
  settleMailLifecycle,
};
