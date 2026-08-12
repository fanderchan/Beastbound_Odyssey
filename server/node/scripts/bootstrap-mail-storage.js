#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  MAIL_STORAGE_BOOTSTRAP_DRY_RUN_KIND,
  MAIL_STORAGE_BOOTSTRAP_DRY_RUN_SCHEMA_VERSION,
  runMailStorageBootstrapDryRun,
} = require("../src/mysql-mail-storage-bootstrap-dry-run");
const {
  MAIL_STORAGE_BOOTSTRAP_APPLY_KIND,
  MAIL_STORAGE_BOOTSTRAP_APPLY_SCHEMA_VERSION,
} = require("../src/mysql-mail-storage-bootstrap-apply");

const repoRoot = path.resolve(__dirname, "../../..");
const envPath = path.resolve(repoRoot, "server/node/.local/mysql.env");
const SAFE_ARGUMENT_CODES = new Set([
  "mail_storage_bootstrap_maintenance_confirmation_required",
  "mail_storage_bootstrap_backup_argument_denied",
  "mail_storage_bootstrap_maintenance_argument_denied",
  "mail_storage_bootstrap_credential_argument_denied",
  "mail_storage_bootstrap_argument_invalid",
]);
const SAFE_APPLY_FAILURE_CODES = new Set([
  "mail_storage_bootstrap_action_invalid",
  "mail_storage_bootstrap_building_control_conflict",
  "mail_storage_bootstrap_counter_insert_conflict",
  "mail_storage_bootstrap_database_invalid",
  "mail_storage_bootstrap_fill_reconciliation_failed",
  "mail_storage_bootstrap_identity_insert_conflict",
  "mail_storage_bootstrap_locked_source_drift",
  "mail_storage_bootstrap_maintenance_confirmation_required",
  "mail_storage_bootstrap_plan_verification_failed",
  "mail_storage_bootstrap_ready_control_conflict",
  "mail_storage_bootstrap_ready_reconciliation_failed",
  "mail_storage_bootstrap_source_unsafe",
  "mail_storage_bootstrap_target_conflict",
  "mail_storage_bootstrap_timestamp_invalid",
  "mysql_commit_outcome_ambiguous",
  "mysql_pool_acquire_failed",
  "mysql_pool_acquire_timeout",
  "mysql_session_policy_failed",
  "mysql_session_policy_timeout",
  "mysql_transaction_rolled_back",
]);

function parseArgs(argvValue = []) {
  const argv = Array.isArray(argvValue) ? argvValue : [];
  if (argv.length === 0) return {mode: "dry-run", maintenanceConfirmed: false};
  if (argv.length === 1 && argv[0] === "--dry-run") {
    return {mode: "dry-run", maintenanceConfirmed: false};
  }

  for (const value of argv) {
    const argument = String(value || "");
    if (argument === "--backup-path" || argument.startsWith("--backup-path=")) {
      throw commandError("mail_storage_bootstrap_backup_argument_denied");
    }
    if (isCredentialArgument(argument)) {
      throw commandError("mail_storage_bootstrap_credential_argument_denied");
    }
  }
  if (argv.length === 1 && argv[0] === "--apply") {
    throw commandError("mail_storage_bootstrap_maintenance_confirmation_required");
  }
  if (argv.length === 1 && argv[0] === "--maintenance-confirmed") {
    throw commandError("mail_storage_bootstrap_maintenance_argument_denied");
  }
  if (
    argv.length === 2
    && new Set(argv).size === 2
    && argv.includes("--apply")
    && argv.includes("--maintenance-confirmed")
  ) {
    return {mode: "apply", maintenanceConfirmed: true};
  }
  throw commandError("mail_storage_bootstrap_argument_invalid");
}

async function runMain(argv = process.argv.slice(2), dependencies = {}) {
  const requestedMode = Array.isArray(argv) && argv.some((value) => (
    String(value || "") === "--apply"
    || String(value || "").startsWith("--apply=")
  )) ? "apply" : "dry-run";
  let command;
  try {
    // Argument rejection intentionally precedes env, catalog and store setup.
    command = parseArgs(argv);
  } catch (error) {
    return failureReport(safeArgumentCode(error), requestedMode);
  }

  let store = null;
  try {
    const loadEnvironment = typeof dependencies.loadEnvFile === "function"
      ? dependencies.loadEnvFile
      : loadEnvFile;
    loadEnvironment(dependencies.envPath || envPath);

    const createAttachmentCertifier = typeof dependencies.createAttachmentCertifier === "function"
      ? dependencies.createAttachmentCertifier
      : require("../src/mysql-mail-storage-bootstrap-catalog")
        .createMailStorageBootstrapAttachmentCertifier;
    const createStore = typeof dependencies.createStore === "function"
      ? dependencies.createStore
      : require("../src/mysql-store").createMysqlAuthStore;
    const certifyAttachment = createAttachmentCertifier();
    if (typeof certifyAttachment !== "function") {
      throw commandError("mail_storage_bootstrap_attachment_certifier_invalid");
    }
    let report;
    if (command.mode === "apply") {
      store = createStore({
        readOnly: false,
        ensureSchema: false,
        usePool: true,
        singleWriterMaintenance: true,
        mailStorageBootstrapApply: true,
        transactionTimeoutMs: 60000,
      });
      if (!store || typeof store.applyMailStorageBootstrap !== "function") {
        throw commandError("mail_storage_bootstrap_apply_executor_invalid");
      }
      report = await store.applyMailStorageBootstrap({
        maintenanceConfirmed: command.maintenanceConfirmed,
        certifyAttachment,
      });
    } else {
      const executeDryRun = typeof dependencies.runDryRun === "function"
        ? dependencies.runDryRun
        : runMailStorageBootstrapDryRun;
      store = createStore({readOnly: true, ensureSchema: false, usePool: true});
      if (!store || typeof store.readMailStorageBootstrapSnapshot !== "function") {
        throw commandError("mail_storage_bootstrap_snapshot_reader_invalid");
      }
      report = await executeDryRun({
        readSnapshot: () => store.readMailStorageBootstrapSnapshot(),
        certifyAttachment,
      });
    }
    // Once apply has returned, its transaction outcome is already known or
    // explicitly reported unknown. A later pool-close failure must not rewrite
    // that durable outcome into a generic failure.
    if (command.mode === "apply") await closeStoreQuietly(store);
    else await closeStore(store);
    store = null;
    return report;
  } catch (error) {
    await closeStoreQuietly(store);
    return command.mode === "apply"
      ? applyFailureReport(error)
      : failureReport("mail_storage_bootstrap_dry_run_failed", "dry-run");
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

function isCredentialArgument(argument) {
  const name = argument.split("=", 1)[0];
  return new Set([
    "--password",
    "--password-stdin",
    "--mysql-password",
    "--host",
    "--port",
    "--user",
    "--username",
    "--database",
    "--socket",
    "--ssl",
    "--env",
    "--env-file",
  ]).has(name);
}

function commandError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function safeArgumentCode(error) {
  const code = String(error && error.code || "");
  return SAFE_ARGUMENT_CODES.has(code) ? code : "mail_storage_bootstrap_argument_invalid";
}

function failureReport(code, mode = "dry-run") {
  if (mode === "apply") {
    return Object.freeze({
      kind: MAIL_STORAGE_BOOTSTRAP_APPLY_KIND,
      schemaVersion: MAIL_STORAGE_BOOTSTRAP_APPLY_SCHEMA_VERSION,
      ok: false,
      code,
      mode: "apply",
      applied: false,
      recovered: false,
      outcomeUnknown: false,
      retryable: false,
      featureFlagsEnabled: false,
    });
  }
  return Object.freeze({
    kind: MAIL_STORAGE_BOOTSTRAP_DRY_RUN_KIND,
    schemaVersion: MAIL_STORAGE_BOOTSTRAP_DRY_RUN_SCHEMA_VERSION,
    ok: false,
    code,
    mode: "dry-run",
    applied: false,
    applySafe: false,
    stable: false,
  });
}

function applyFailureReport(error) {
  const codeValue = String(error && error.code || "");
  const safeCode = SAFE_APPLY_FAILURE_CODES.has(codeValue)
    ? codeValue
    : "mail_storage_bootstrap_apply_failed";
  return Object.freeze({
    kind: MAIL_STORAGE_BOOTSTRAP_APPLY_KIND,
    schemaVersion: MAIL_STORAGE_BOOTSTRAP_APPLY_SCHEMA_VERSION,
    ok: false,
    code: safeCode,
    mode: "apply",
    applied: false,
    recovered: false,
    outcomeUnknown: error && error.outcomeUnknown === true,
    retryable: error && error.outcomeUnknown !== true && error.retryable === true,
    featureFlagsEnabled: false,
  });
}

async function closeStore(store) {
  if (store && typeof store.close === "function") await store.close();
}

async function closeStoreQuietly(store) {
  try {
    await closeStore(store);
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
    const mode = process.argv.slice(2).includes("--apply") ? "apply" : "dry-run";
    printJson(failureReport(
      mode === "apply"
        ? "mail_storage_bootstrap_apply_failed"
        : "mail_storage_bootstrap_dry_run_failed",
      mode,
    ));
    process.exitCode = 1;
  });
}

module.exports = {
  loadEnvFile,
  parseArgs,
  runMain,
};
