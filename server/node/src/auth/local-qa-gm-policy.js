"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const DEFAULT_POLICY_PATH = path.resolve(REPO_ROOT, "client/godot/data/gm_qa_access_policy.json");
const LOCAL_QA_POLICY_SCHEMA_VERSION = 1;
const LOCAL_QA_PLUGIN_SCHEMA_VERSION = 2;
const EXPECTED_POLICY_ID = "local_qa_full_v1";
const EXPECTED_USERNAME = "auth1373";
const COMMAND_ID_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;
const SERVER_COMMAND_ID_PATTERN = /^gm_[a-z0-9_]{1,76}$/;
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

function loadLocalQaGmPolicy(options = {}) {
  const policyPath = path.resolve(String(options.policyPath || DEFAULT_POLICY_PATH));
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(policyPath, "utf8"));
  } catch (error) {
    throw policyError("local_qa_policy_unreadable", `无法读取本地QA授权策略：${error.message}`);
  }
  const policy = normalizeLocalQaGmPolicy(parsed);
  return Object.freeze({...policy, policyPath});
}

function normalizeLocalQaGmPolicy(value) {
  if (!isPlainRecord(value)) {
    throw policyError("local_qa_policy_invalid", "本地QA授权策略必须是对象。");
  }
  const expectedKeys = [
    "allowedUsernames",
    "clientCommandIds",
    "defaultLeaseHours",
    "maxLeaseHours",
    "policyId",
    "schemaVersion",
    "serverAuthoritativeClientCommandIds",
    "serverCommandIds",
  ].sort();
  if (!sameStrings(Object.keys(value).sort(), expectedKeys)) {
    throw policyError("local_qa_policy_fields_invalid", "本地QA授权策略字段不完整或包含未知字段。");
  }
  if (value.schemaVersion !== LOCAL_QA_POLICY_SCHEMA_VERSION) {
    throw policyError("local_qa_policy_schema_invalid", "本地QA授权策略版本不受支持。");
  }
  const policyId = strictIdentifier(value.policyId, "policyId");
  const allowedUsernames = strictStringArray(value.allowedUsernames, "allowedUsernames", USERNAME_PATTERN);
  const serverCommandIds = strictStringArray(value.serverCommandIds, "serverCommandIds", SERVER_COMMAND_ID_PATTERN);
  const clientCommandIds = strictStringArray(value.clientCommandIds, "clientCommandIds", COMMAND_ID_PATTERN);
  const authoritativeClientIds = strictStringArray(
    value.serverAuthoritativeClientCommandIds,
    "serverAuthoritativeClientCommandIds",
    COMMAND_ID_PATTERN,
  );
  if (policyId !== EXPECTED_POLICY_ID) {
    throw policyError("local_qa_policy_id_invalid", "本地QA策略标识与冻结版本不一致。");
  }
  if (allowedUsernames.length !== 1 || allowedUsernames[0] !== EXPECTED_USERNAME) {
    throw policyError("local_qa_policy_username_scope_invalid", "本地QA策略必须且只能授权一个明确账号。");
  }
  if (serverCommandIds.length !== 9 || clientCommandIds.length !== 28 || authoritativeClientIds.length !== 6) {
    throw policyError("local_qa_policy_catalog_size_invalid", "本地QA策略目录数量与冻结合同不一致。");
  }
  if (authoritativeClientIds.some((commandId) => (
    !serverCommandIds.includes(commandId) || !clientCommandIds.includes(commandId)
  ))) {
    throw policyError("local_qa_policy_authority_subset_invalid", "服务端权威客户端命令必须同时属于两个显式目录。");
  }
  const defaultLeaseHours = strictPositiveInteger(value.defaultLeaseHours, "defaultLeaseHours");
  const maxLeaseHours = strictPositiveInteger(value.maxLeaseHours, "maxLeaseHours");
  if (defaultLeaseHours > maxLeaseHours || maxLeaseHours > 24) {
    throw policyError("local_qa_policy_lease_invalid", "本地QA授权时长必须满足默认值不大于上限，且上限不超过24小时。");
  }
  return Object.freeze({
    schemaVersion: LOCAL_QA_POLICY_SCHEMA_VERSION,
    policyId,
    allowedUsernames: Object.freeze(allowedUsernames),
    defaultLeaseHours,
    maxLeaseHours,
    serverCommandIds: Object.freeze(serverCommandIds),
    clientCommandIds: Object.freeze(clientCommandIds),
    serverAuthoritativeClientCommandIds: Object.freeze(authoritativeClientIds),
  });
}

function localQaPolicyUsername(policy, requestedUsername = "") {
  const allowed = Array.isArray(policy && policy.allowedUsernames) ? policy.allowedUsernames : [];
  const username = String(requestedUsername || allowed[0] || "").trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username) || !allowed.includes(username)) {
    throw policyError("local_qa_username_denied", "账号不在本地QA授权策略中。");
  }
  return username;
}

function localQaLeaseExpiry(policy, hoursValue, nowMs = Date.now()) {
  const hours = hoursValue === undefined || hoursValue === null || hoursValue === ""
    ? Number(policy.defaultLeaseHours)
    : Number(hoursValue);
  if (!Number.isInteger(hours) || hours < 1 || hours > Number(policy.maxLeaseHours || 0)) {
    throw policyError(
      "local_qa_lease_hours_invalid",
      `授权时长必须是1-${Number(policy.maxLeaseHours || 0)}之间的整数小时。`,
    );
  }
  if (!Number.isFinite(nowMs)) {
    throw policyError("local_qa_clock_invalid", "本机时间不可用，拒绝生成授权。");
  }
  return {
    hours,
    expiresAt: new Date(nowMs + hours * 60 * 60 * 1000).toISOString(),
  };
}

function canonicalFutureExpiry(value, nowMs = Date.now()) {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp)
    || new Date(timestamp).toISOString() !== value
    || timestamp <= nowMs
  ) {
    return null;
  }
  return {expiresAt: value, timestamp};
}

function pluginDocumentForLocalQaLease(policy, username, expiresAt, enabled = true, nowMs = Date.now()) {
  const normalizedUsername = localQaPolicyUsername(policy, username);
  if (enabled && canonicalFutureExpiry(expiresAt, nowMs) === null) {
    throw policyError("local_qa_plugin_expiry_invalid", "本地GM插件必须使用规范且尚未到期的UTC时间。");
  }
  return {
    schemaVersion: LOCAL_QA_PLUGIN_SCHEMA_VERSION,
    policyId: policy.policyId,
    enabled: Boolean(enabled),
    expiresAt: String(expiresAt || ""),
    gmUsernames: [normalizedUsername],
    gmCommands: [...policy.clientCommandIds],
  };
}

function inspectLocalQaPlugin(value, policy, username, nowMs = Date.now()) {
  const source = isPlainRecord(value) ? value : {};
  const usernames = stringArray(source.gmUsernames);
  const commands = stringArray(source.gmCommands);
  const missingCommands = policy.clientCommandIds.filter((commandId) => !commands.includes(commandId));
  const unexpectedCommands = commands.filter((commandId) => !policy.clientCommandIds.includes(commandId));
  const expiry = canonicalFutureExpiry(source.expiresAt, nowMs);
  const exactFields = sameStrings(Object.keys(source).sort(), [
    "enabled",
    "expiresAt",
    "gmCommands",
    "gmUsernames",
    "policyId",
    "schemaVersion",
  ].sort());
  const duplicateCommands = commands.length !== new Set(commands).size;
  const duplicateUsernames = usernames.length !== new Set(usernames).size;
  const wildcard = usernames.includes("*") || commands.includes("*");
  const usernameMatches = usernames.length === 1 && usernames[0] === username;
  const policyMatches = source.policyId === policy.policyId;
  const schemaMatches = source.schemaVersion === LOCAL_QA_PLUGIN_SCHEMA_VERSION;
  const catalogMatches = missingCommands.length === 0
    && unexpectedCommands.length === 0
    && commands.length === policy.clientCommandIds.length
    && !duplicateCommands;
  const enabled = source.enabled === true;
  const active = enabled
    && exactFields
    && schemaMatches
    && policyMatches
    && usernameMatches
    && !duplicateUsernames
    && !wildcard
    && catalogMatches
    && expiry !== null;
  return {
    active,
    schemaVersion: Number.isInteger(source.schemaVersion) ? source.schemaVersion : 0,
    enabled,
    policyMatches,
    usernameMatches,
    exactFields,
    wildcard,
    duplicateCommands,
    commandCount: commands.length,
    missingCommands,
    unexpectedCommands,
    expiresAt: typeof source.expiresAt === "string" ? source.expiresAt : "",
    remainingSeconds: expiry ? Math.max(0, Math.floor((expiry.timestamp - nowMs) / 1000)) : 0,
  };
}

function strictStringArray(value, field, pattern) {
  if (!Array.isArray(value) || value.length === 0) {
    throw policyError("local_qa_policy_list_invalid", `${field} 必须是非空数组。`);
  }
  const result = value.map((entry) => String(entry || ""));
  if (result.some((entry) => entry === "*" || !pattern.test(entry) || entry !== entry.trim().toLowerCase())) {
    throw policyError("local_qa_policy_list_invalid", `${field} 含有通配、空值或非法标识。`);
  }
  if (new Set(result).size !== result.length) {
    throw policyError("local_qa_policy_list_duplicate", `${field} 不允许重复项。`);
  }
  return result;
}

function strictIdentifier(value, field) {
  const result = String(value || "");
  if (!COMMAND_ID_PATTERN.test(result) || result !== result.trim().toLowerCase()) {
    throw policyError("local_qa_policy_identifier_invalid", `${field} 不是合法标识。`);
  }
  return result;
}

function strictPositiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw policyError("local_qa_policy_integer_invalid", `${field} 必须是正整数。`);
  }
  return value;
}

function policyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function stringArray(value) {
  return Array.isArray(value) ? value.map((entry) => String(entry || "")) : [];
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

module.exports = {
  DEFAULT_POLICY_PATH,
  LOCAL_QA_PLUGIN_SCHEMA_VERSION,
  LOCAL_QA_POLICY_SCHEMA_VERSION,
  canonicalFutureExpiry,
  inspectLocalQaPlugin,
  loadLocalQaGmPolicy,
  localQaLeaseExpiry,
  localQaPolicyUsername,
  normalizeLocalQaGmPolicy,
  pluginDocumentForLocalQaLease,
};
