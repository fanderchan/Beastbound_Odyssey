#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const {createMysqlAuthStore} = require("../src/mysql-store");
const {
  loadLocalQaGmPolicy,
  localQaLeaseExpiry,
  localQaPolicyUsername,
} = require("../src/auth/local-qa-gm-policy");
const {
  PRIVATE_FILE_MODE,
  applyLocalQaGmAccountChange,
  atomicWritePrivateJson,
  buildLocalQaGmAccountChange,
  inspectLocalQaGmAccountState,
  privateCredentialDocument,
  randomLocalQaPassword,
  readJsonIfExists,
  readPrivateFileSnapshot,
  restorePrivateFileSnapshot,
  rollbackLocalQaGmAccountChange,
} = require("../src/auth/local-qa-gm-account-ops");
const {writeBackupSnapshot} = require("./migrate-local-userdata-to-mysql");

const repoRoot = path.resolve(__dirname, "../../..");
const serverRoot = path.resolve(repoRoot, "server/node");
const localDir = path.resolve(serverRoot, ".local");
const envPath = path.resolve(localDir, "mysql.env");
const pidPath = path.resolve(localDir, "server.pid");

loadEnvFile(envPath);

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const nowMs = Date.now();
  const policy = loadLocalQaGmPolicy();
  const username = localQaPolicyUsername(policy, args.username);
  const userdataRoot = resolveUserdataRoot(args.userdataRoot);
  const pluginPath = path.resolve(userdataRoot, "gm_tools.gmplugin.json");
  const accountsPath = path.resolve(userdataRoot, "accounts.json");
  const credentialPath = path.resolve(
    String(args.credentialPath || path.resolve(localDir, `qa-gm-${username}.credentials.json`)),
  );
  assertPrivatePathInsideAllowedRoot(credentialPath, localDir, "credential");
  const runtime = backendRuntimeStatus();
  const mysql = mysqlSafetySummary();
  const readStore = createMysqlAuthStore({readOnly: true, ensureSchema: false});
  const source = readStore.load();
  if (typeof readStore.close === "function") {
    try { await readStore.close(); } catch {}
  }
  const current = statusReport({
    data: source,
    policy,
    username,
    pluginPath,
    accountsPath,
    credentialPath,
    runtime,
    mysql,
    nowMs,
  });

  if (args.operation === "status") {
    printJson({ok: true, mode: "status", applied: false, ...current});
    return;
  }

  const lease = args.operation === "revoke"
    ? {hours: 0, expiresAt: new Date(nowMs).toISOString()}
    : localQaLeaseExpiry(policy, args.hours, nowMs);
  const accountExists = current.account.exists;
  const needsPassword = (args.operation === "init" && !accountExists) || args.rotatePassword;
  const password = needsPassword ? randomLocalQaPassword() : "";
  const change = buildLocalQaGmAccountChange(source, {
    operation: args.operation,
    policy,
    username,
    expiresAt: lease.expiresAt,
    nowMs,
    password,
    rotatePassword: args.rotatePassword,
  });
  const plan = {
    ...change.report,
    leaseHours: lease.hours,
    credentialWillChange: Boolean(change.report.passwordChanged),
    requiresStoppedBackend: true,
    requiresLoopbackMysql: true,
  };

  if (!args.apply) {
    printJson({
      ok: true,
      mode: "dry-run",
      applied: false,
      operation: args.operation,
      plan,
      current,
      message: "仅生成本地GM授权预演；添加 --apply 且先停止后端才会写入。",
    });
    return;
  }

  assertLoopbackMysql();
  assertBackendStopped(runtime);

  const writeStore = createMysqlAuthStore({
    readOnly: false,
    ensureSchema: true,
    singleWriterMaintenance: true,
  });
  const writeSource = writeStore.load();
  const applyChange = buildLocalQaGmAccountChange(writeSource, {
    operation: args.operation,
    policy,
    username,
    expiresAt: lease.expiresAt,
    nowMs,
    password,
    rotatePassword: args.rotatePassword,
  });
  const backupPath = writeBackupSnapshot(writeSource, args.backupPath, new Date(nowMs).toISOString());
  const pluginBefore = readPrivateFileSnapshot(pluginPath);
  const accountsBeforeMode = fileMode(accountsPath);
  const credentialBefore = readPrivateFileSnapshot(credentialPath);
  const pendingCredentialPath = `${credentialPath}.pending-${process.pid}`;
  let databaseApplied = false;
  let credentialUpdated = false;
  try {
    if (applyChange.report.passwordChanged) {
      atomicWritePrivateJson(
        pendingCredentialPath,
        privateCredentialDocument(username, password, new Date(nowMs).toISOString()),
      );
    }
    assertBackendStopped(backendRuntimeStatus());
    applyLocalQaGmAccountChange(writeStore, writeSource, applyChange);
    databaseApplied = true;
    atomicWritePrivateJson(pluginPath, applyChange.pluginDocument);
    if (fs.existsSync(accountsPath)) {
      fs.chmodSync(accountsPath, PRIVATE_FILE_MODE);
    }
    if (applyChange.report.passwordChanged) {
      fs.renameSync(pendingCredentialPath, credentialPath);
      fs.chmodSync(credentialPath, PRIVATE_FILE_MODE);
      credentialUpdated = true;
    }
    const afterStore = createMysqlAuthStore({readOnly: true, ensureSchema: false});
    const afterData = afterStore.load();
    if (typeof afterStore.close === "function") {
      try { await afterStore.close(); } catch {}
    }
    const after = statusReport({
      data: afterData,
      policy,
      username,
      pluginPath,
      accountsPath,
      credentialPath,
      runtime: backendRuntimeStatus(),
      mysql: mysqlSafetySummary(),
      nowMs,
    });
    const expectedReady = args.operation !== "revoke";
    if (after.ready !== expectedReady) {
      throw commandError("local_qa_final_verification_failed", "数据库与本地插件的最终授权状态不一致。");
    }
    printJson({
      ok: true,
      mode: "apply",
      applied: true,
      operation: args.operation,
      backupPath,
      credentialUpdated,
      credentialPath: credentialUpdated ? credentialPath : "",
      plan: {...applyChange.report, leaseHours: lease.hours},
      status: after,
    });
  } catch (error) {
    if (databaseApplied) {
      const rollback = rollbackLocalQaGmAccountChange(writeStore, writeSource);
      if (!rollback.ok) {
        error.message = `${error.message}; databaseRollback=failed`;
      }
    }
    try { restorePrivateFileSnapshot(pluginBefore); } catch {}
    try {
      if (accountsBeforeMode !== null && fs.existsSync(accountsPath)) {
        fs.chmodSync(accountsPath, accountsBeforeMode);
      }
    } catch {}
    try { restorePrivateFileSnapshot(credentialBefore); } catch {}
    try { fs.rmSync(pendingCredentialPath, {force: true}); } catch {}
    throw error;
  } finally {
    if (!credentialUpdated) {
      try { fs.rmSync(pendingCredentialPath, {force: true}); } catch {}
    }
    if (typeof writeStore.close === "function") {
      try { await writeStore.close(); } catch {}
    }
  }
}

function statusReport(options) {
  const pluginFile = readJsonIfExists(options.pluginPath);
  const accountsFile = readJsonIfExists(options.accountsPath);
  const inspected = inspectLocalQaGmAccountState({
    data: options.data,
    policy: options.policy,
    username: options.username,
    plugin: pluginFile.value,
    pluginExists: pluginFile.exists && !pluginFile.invalid,
    pluginMode: pluginFile.mode,
    accountsMode: accountsFile.mode,
    nowMs: options.nowMs,
  });
  const credentialMode = fileMode(options.credentialPath);
  return {
    ...inspected,
    backend: options.runtime,
    mysql: options.mysql,
    credential: {
      exists: credentialMode !== null,
      privateMode: credentialMode === PRIVATE_FILE_MODE,
      fileMode: credentialMode === null ? "" : credentialMode.toString(8).padStart(3, "0"),
    },
  };
}

function parseArgs(argv) {
  const result = {
    operation: "status",
    apply: false,
    rotatePassword: false,
  };
  let operationSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("-") && !operationSeen) {
      result.operation = String(arg || "").trim().toLowerCase();
      operationSeen = true;
    } else if (arg === "--apply") {
      result.apply = true;
    } else if (arg === "--hours") {
      result.hours = requiredValue(argv, ++index, arg);
    } else if (arg === "--rotate-password") {
      result.rotatePassword = true;
    } else if (arg === "--username") {
      result.username = requiredValue(argv, ++index, arg);
    } else if (arg === "--userdata-root") {
      result.userdataRoot = requiredValue(argv, ++index, arg);
    } else if (arg === "--backup-path") {
      result.backupPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--credential-path") {
      result.credentialPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--password" || arg === "--password-stdin") {
      throw commandError("local_qa_password_argument_denied", "本工具不接受命令行密码；使用进程内随机密码轮换。");
    } else {
      throw commandError("local_qa_argument_invalid", `未知参数：${arg}`);
    }
  }
  if (!["status", "init", "renew", "revoke"].includes(result.operation)) {
    throw commandError("local_qa_operation_invalid", "命令必须是 status、init、renew 或 revoke。");
  }
  if (result.operation === "status" && (result.apply || result.rotatePassword || result.hours !== undefined)) {
    throw commandError("local_qa_status_argument_invalid", "status 是只读命令，不接受写入或租约参数。");
  }
  if (result.operation === "revoke" && (result.rotatePassword || result.hours !== undefined)) {
    throw commandError("local_qa_revoke_argument_invalid", "revoke 不接受密码轮换或租约时长。");
  }
  return result;
}

function resolveUserdataRoot(value) {
  const root = String(value || process.env.BEASTBOUND_GODOT_USERDATA || path.join(
    process.env.HOME || "",
    "Library/Application Support/Godot/app_userdata/Beastbound Odyssey - 万兽纪元",
  ));
  if (root.trim() === "") {
    throw commandError("local_qa_userdata_root_missing", "无法确定 Godot userdata 目录。");
  }
  return path.resolve(root);
}

function mysqlSafetySummary() {
  const host = String(process.env.BEASTBOUND_MYSQL_HOST || "127.0.0.1").trim().toLowerCase();
  const storeMode = String(process.env.BEASTBOUND_AUTH_STORE || process.env.BEASTBOUND_STORE || "mysql").trim().toLowerCase();
  return {
    loopback: ["127.0.0.1", "localhost", "::1"].includes(host),
    storeMode,
    databaseConfigured: String(process.env.BEASTBOUND_MYSQL_DATABASE || "").trim() !== "",
  };
}

function assertLoopbackMysql() {
  const summary = mysqlSafetySummary();
  if (!summary.loopback || summary.storeMode !== "mysql") {
    throw commandError("local_qa_mysql_not_loopback", "本地GM写操作只允许 loopback MySQL。");
  }
  if (!summary.databaseConfigured) {
    throw commandError("local_qa_mysql_database_missing", "未配置本地 MySQL 数据库名。");
  }
}

function backendRuntimeStatus() {
  const pid = readPid();
  const pidAlive = pid > 0 && processAlive(pid);
  const port = String(process.env.BEASTBOUND_AUTH_PORT || "8787").trim();
  const listenerCount = /^\d+$/.test(port) ? portListenerCount(port) : 0;
  return {
    stopped: !pidAlive && listenerCount === 0,
    pidFilePresent: fs.existsSync(pidPath),
    pidAlive,
    listenerCount,
  };
}

function assertBackendStopped(runtime) {
  if (!runtime.stopped) {
    throw commandError(
      "local_qa_backend_running",
      "后端仍在运行。请先执行 npm --prefix server/node run ops -- stop，再应用GM授权。",
    );
  }
}

function portListenerCount(port) {
  try {
    const output = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.split(/\s+/).filter(Boolean).length;
  } catch {
    return 0;
  }
}

function readPid() {
  if (!fs.existsSync(pidPath)) return 0;
  return Math.max(0, Math.trunc(Number(fs.readFileSync(pidPath, "utf8").trim() || 0)));
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function assertPrivatePathInsideAllowedRoot(filePath, allowedRoot, label) {
  const relative = path.relative(path.resolve(allowedRoot), path.resolve(filePath));
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw commandError("local_qa_private_path_invalid", `${label} 文件必须位于 server/node/.local 内。`);
  }
}

function fileMode(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.statSync(filePath).mode & 0o777;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
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

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (value === undefined || String(value).startsWith("--")) {
    throw commandError("local_qa_argument_missing", `${flag} 缺少参数。`);
  }
  return value;
}

function commandError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeErrorMessage(error) {
  let message = String(error && error.message || error || "本地GM运维失败。");
  for (const key of ["BEASTBOUND_MYSQL_PASSWORD", "BEASTBOUND_MIGRATE_PASSWORD"]) {
    const secret = String(process.env[key] || "");
    if (secret !== "") message = message.split(secret).join("<redacted>");
  }
  return message;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    printJson({
      ok: false,
      mode: process.argv.includes("--apply") ? "apply" : "read-only",
      applied: false,
      code: String(error && error.code || "local_qa_gm_ops_failed"),
      message: safeErrorMessage(error),
    });
    process.exitCode = 1;
  });
}

module.exports = {
  assertBackendStopped,
  assertLoopbackMysql,
  backendRuntimeStatus,
  main,
  mysqlSafetySummary,
  parseArgs,
  resolveUserdataRoot,
  statusReport,
};
