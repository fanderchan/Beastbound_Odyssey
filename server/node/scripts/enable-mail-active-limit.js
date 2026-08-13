#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  MAIL_ACTIVE_LIMIT_FEATURE_ENABLE_KIND,
  MAIL_ACTIVE_LIMIT_FEATURE_ENABLE_SCHEMA_VERSION,
} = require("../src/mysql-mail-active-limit-feature-enable");

const repoRoot = path.resolve(__dirname, "../../..");
const envPath = path.resolve(repoRoot, "server/node/.local/mysql.env");

function parseArgs(argvValue = []) {
  const argv = Array.isArray(argvValue) ? argvValue.map(String) : [];
  if (argv.some(isCredentialArgument)) {
    throw commandError("mail_active_limit_feature_credential_argument_denied");
  }
  if (argv.length === 1 && argv[0] === "--enable") {
    throw commandError("mail_active_limit_feature_maintenance_confirmation_required");
  }
  if (
    argv.length === 2
    && new Set(argv).size === 2
    && argv.includes("--enable")
    && argv.includes("--maintenance-confirmed")
  ) {
    return {maintenanceConfirmed: true};
  }
  throw commandError("mail_active_limit_feature_argument_invalid");
}

async function runMain(argv = process.argv.slice(2), dependencies = {}) {
  let command;
  try {
    command = parseArgs(argv);
  } catch (error) {
    return failureReport(String(error && error.code || "mail_active_limit_feature_argument_invalid"));
  }
  let store = null;
  try {
    (dependencies.loadEnvFile || loadEnvFile)(dependencies.envPath || envPath);
    const createStore = dependencies.createStore
      || require("../src/mysql-store").createMysqlAuthStore;
    store = createStore({
      readOnly: false,
      ensureSchema: false,
      usePool: true,
      singleWriterMaintenance: true,
      mailActiveLimitFeatureEnable: true,
      transactionTimeoutMs: 60000,
    });
    if (!store || typeof store.enableMailActiveLimitFeature !== "function") {
      throw commandError("mail_active_limit_feature_executor_invalid");
    }
    const report = await store.enableMailActiveLimitFeature({
      maintenanceConfirmed: command.maintenanceConfirmed,
    });
    await closeQuietly(store);
    store = null;
    return report;
  } catch (error) {
    await closeQuietly(store);
    return failureReport(
      safeFailureCode(error),
      error && error.outcomeUnknown === true,
      error && error.retryable === true,
    );
  }
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    process.env[match[1]] = unquoteShellValue(match[2].trim());
  }
}

function unquoteShellValue(value) {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/'\\''/g, "'");
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  return value;
}

function isCredentialArgument(value) {
  return new Set([
    "--password", "--password-stdin", "--mysql-password", "--host", "--port",
    "--user", "--username", "--database", "--socket", "--ssl", "--env", "--env-file",
  ]).has(String(value || "").split("=", 1)[0]);
}

function safeFailureCode(error) {
  const code = String(error && error.code || "");
  return /^(?:mail_active_limit_feature_|mysql_(?:mail_storage|pool|session|transaction|commit)_)/.test(code)
    ? code
    : "mail_active_limit_feature_enable_failed";
}

function failureReport(code, outcomeUnknown = false, retryable = false) {
  return Object.freeze({
    kind: MAIL_ACTIVE_LIMIT_FEATURE_ENABLE_KIND,
    schemaVersion: MAIL_ACTIVE_LIMIT_FEATURE_ENABLE_SCHEMA_VERSION,
    ok: false,
    code,
    enabled: false,
    capacity: 200,
    recovered: false,
    outcomeUnknown: outcomeUnknown === true,
    retryable: outcomeUnknown !== true && retryable === true,
  });
}

function commandError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function closeQuietly(store) {
  try {
    if (store && typeof store.close === "function") await store.close();
  } catch {}
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (require.main === module) {
  runMain().then((report) => {
    printJson(report);
    if (report.ok !== true) process.exitCode = 1;
  }).catch(() => {
    printJson(failureReport("mail_active_limit_feature_enable_failed"));
    process.exitCode = 1;
  });
}

module.exports = {parseArgs, runMain};
