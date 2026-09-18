"use strict";

// Translate URL query parameters at the transport boundary. Domain normalizers
// remain authoritative for limits and opaque cursors. The legacy inbox route
// intentionally allows an omitted page and ignores unrelated query fields;
// archive and reward-vault routes require an explicit, strict page request.
const {
  normalizeMailInboxPageOptions,
} = require("./auth/mail-inbox-pagination");
const {
  normalizeMailArchivePageOptions,
} = require("./auth/mail-archive-pagination");
const {
  normalizeRewardVaultPageOptions,
} = require("./auth/reward-vault-pagination");

function rewardVaultOptionsFromSearchParams(searchParams) {
  const allowedFields = new Set(["limit", "cursor"]);
  const limitValues = searchParams.getAll("limit");
  const cursorValues = searchParams.getAll("cursor");
  if (
    Array.from(searchParams.keys()).some((field) => !allowedFields.has(field))
    || limitValues.length !== 1
    || cursorValues.length > 1
  ) {
    return {
      ok: false,
      code: "reward_vault_pagination_invalid",
      message: "奖励仓分页参数无效，请刷新后重试。",
    };
  }
  const rawOptions = {limit: limitValues[0]};
  if (cursorValues.length === 1) rawOptions.cursor = cursorValues[0];
  try {
    return {
      ok: true,
      options: normalizeRewardVaultPageOptions(rawOptions, {requireExplicitLimit: true}),
    };
  } catch (error) {
    return {
      ok: false,
      code: String(error && error.code || "reward_vault_pagination_invalid"),
      message: String(error && error.message || "奖励仓分页参数无效，请刷新后重试。"),
    };
  }
}

function mailInboxOptionsFromSearchParams(searchParams) {
  const limitValues = searchParams.getAll("limit");
  const cursorValues = searchParams.getAll("cursor");
  if (limitValues.length === 0 && cursorValues.length === 0) {
    return {ok: true, options: {}};
  }
  if (limitValues.length !== 1 || cursorValues.length > 1) {
    return {
      ok: false,
      code: "mail_inbox_pagination_invalid",
      message: "邮箱分页参数无效，请刷新后重试。",
    };
  }
  const rawOptions = {limit: limitValues[0]};
  if (cursorValues.length === 1) {
    rawOptions.cursor = cursorValues[0];
  }
  try {
    return {
      ok: true,
      options: normalizeMailInboxPageOptions(rawOptions, {requireExplicitLimit: true}),
    };
  } catch (error) {
    return {
      ok: false,
      code: String(error && error.code || "mail_inbox_pagination_invalid"),
      message: String(error && error.message || "邮箱分页参数无效，请刷新后重试。"),
    };
  }
}

function mailArchiveOptionsFromSearchParams(searchParams) {
  const allowedFields = new Set(["limit", "cursor"]);
  const limitValues = searchParams.getAll("limit");
  const cursorValues = searchParams.getAll("cursor");
  if (
    Array.from(searchParams.keys()).some((field) => !allowedFields.has(field))
    || limitValues.length !== 1
    || cursorValues.length > 1
  ) {
    return {
      ok: false,
      code: "mail_archive_pagination_invalid",
      message: "邮件归档分页参数无效，请刷新后重试。",
    };
  }
  const rawOptions = {limit: limitValues[0]};
  if (cursorValues.length === 1) {
    rawOptions.cursor = cursorValues[0];
  }
  try {
    return {
      ok: true,
      options: normalizeMailArchivePageOptions(rawOptions, {requireExplicitLimit: true}),
    };
  } catch (error) {
    return {
      ok: false,
      code: String(error && error.code || "mail_archive_pagination_invalid"),
      message: String(error && error.message || "邮件归档分页参数无效，请刷新后重试。"),
    };
  }
}

module.exports = {
  mailArchiveOptionsFromSearchParams,
  mailInboxOptionsFromSearchParams,
  rewardVaultOptionsFromSearchParams,
};
