#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  MAIL_STORAGE_BOOTSTRAP_DRY_RUN_KIND,
  MAIL_STORAGE_BOOTSTRAP_DRY_RUN_SCHEMA_VERSION,
  runMailStorageBootstrapDryRun,
} = require("../src/mysql-mail-storage-bootstrap-dry-run");

const repoRoot = path.resolve(__dirname, "../../..");
const envPath = path.resolve(repoRoot, "server/node/.local/mysql.env");
const SAFE_ARGUMENT_CODES = new Set([
  "mail_storage_bootstrap_apply_unavailable",
  "mail_storage_bootstrap_backup_argument_denied",
  "mail_storage_bootstrap_maintenance_argument_denied",
  "mail_storage_bootstrap_credential_argument_denied",
  "mail_storage_bootstrap_argument_invalid",
]);

function parseArgs(argvValue = []) {
  const argv = Array.isArray(argvValue) ? argvValue : [];
  if (argv.length === 0) return {dryRun: true};
  if (argv.length === 1 && argv[0] === "--dry-run") return {dryRun: true};

  for (const value of argv) {
    const argument = String(value || "");
    if (argument === "--apply" || argument.startsWith("--apply=")) {
      throw commandError("mail_storage_bootstrap_apply_unavailable");
    }
    if (argument === "--backup-path" || argument.startsWith("--backup-path=")) {
      throw commandError("mail_storage_bootstrap_backup_argument_denied");
    }
    if (
      argument === "--maintenance-confirmed"
      || argument.startsWith("--maintenance-confirmed=")
    ) {
      throw commandError("mail_storage_bootstrap_maintenance_argument_denied");
    }
    if (isCredentialArgument(argument)) {
      throw commandError("mail_storage_bootstrap_credential_argument_denied");
    }
  }
  throw commandError("mail_storage_bootstrap_argument_invalid");
}

async function runMain(argv = process.argv.slice(2), dependencies = {}) {
  try {
    // Argument rejection intentionally precedes env, catalog and store setup.
    parseArgs(argv);
  } catch (error) {
    return failureReport(safeArgumentCode(error));
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
    const executeDryRun = typeof dependencies.runDryRun === "function"
      ? dependencies.runDryRun
      : runMailStorageBootstrapDryRun;
    const certifyAttachment = createAttachmentCertifier();
    if (typeof certifyAttachment !== "function") {
      throw commandError("mail_storage_bootstrap_attachment_certifier_invalid");
    }
    store = createStore({readOnly: true, ensureSchema: false, usePool: true});
    if (!store || typeof store.readMailStorageBootstrapSnapshot !== "function") {
      throw commandError("mail_storage_bootstrap_snapshot_reader_invalid");
    }
    const report = await executeDryRun({
      readSnapshot: () => store.readMailStorageBootstrapSnapshot(),
      certifyAttachment,
    });
    await closeStore(store);
    store = null;
    return report;
  } catch {
    await closeStoreQuietly(store);
    return failureReport("mail_storage_bootstrap_dry_run_failed");
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

function failureReport(code) {
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
    printJson(failureReport("mail_storage_bootstrap_dry_run_failed"));
    process.exitCode = 1;
  });
}

module.exports = {
  loadEnvFile,
  parseArgs,
  runMain,
};
