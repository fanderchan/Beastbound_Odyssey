"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {createMysqlAuthStore} = require("../src/mysql-store");
const {
  materializeAuthorityRootLargeCollections,
} = require("../src/auth/authority-root-materialization");
const {
  buildBatchProfileMigration,
  buildBatchProfileRollback,
  rehearseBatchProfileMigration,
  verifyBatchProfileMigration,
  verifyBatchProfileRollback,
} = require("../src/auth/profile-migration-batch-ops");
const {
  createBatchMigrationBackup,
  writeBatchMigrationBackup,
} = require("../src/auth/profile-migration-backup");

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const repoRoot = path.resolve(__dirname, "../../..");

loadEnvFile(path.resolve(repoRoot, "server/node/.local/mysql.env"));

function main() {
  let args = {};
  try {
    args = parseArgs(process.argv.slice(2));
    const result = runMysqlProfileMigration({args});
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      mode: args.apply === true ? "apply" : "dry-run",
      applied: false,
      code: String(error && error.code || "batch_profile_migration_failed"),
      message: safeErrorText(error, "批量档案迁移失败。"),
      ...(error && error.batchMigration ? clone(error.batchMigration) : {}),
    }, null, 2));
    process.exitCode = 1;
  }
}

function runMysqlProfileMigration(options = {}) {
  const args = clone(options.args || {});
  validateApplyGates(args);
  const nowIso = String(options.nowIso || new Date().toISOString());
  const createReadStore = typeof options.createReadStore === "function"
    ? options.createReadStore
    : () => createMysqlAuthStore({readOnly: true, ensureSchema: false, strictRowIdentity: true});
  const createWriteStore = typeof options.createWriteStore === "function"
    ? options.createWriteStore
    : () => createMysqlAuthStore({
      readOnly: false,
      ensureSchema: true,
      strictRowIdentity: true,
      singleWriterMaintenance: true,
    });
  const writeBackup = typeof options.writeBackup === "function"
    ? options.writeBackup
    : writeBatchMigrationBackup;

  const readStore = createReadStore();
  const sourceSnapshot = materializeAuthorityRootLargeCollections(readStore.load());
  const rehearsal = rehearseBatchProfileMigration(sourceSnapshot);
  const plan = rehearsal.plan || buildBatchProfileMigration(sourceSnapshot);
  const baseReport = {
    plan: clone(plan.publicReport),
    rehearsal: clone(rehearsal.publicReport),
  };
  if (!plan.applySafe || !rehearsal.ok) {
    throw migrationError(
      "batch_profile_migration_not_safe",
      "批量档案预演未通过；没有写入 MySQL。",
      baseReport,
    );
  }

  if (args.apply !== true) {
    return {
      ok: true,
      mode: "dry-run",
      applied: false,
      message: "预演与内存回滚演练均通过；没有执行 DDL 或写入 MySQL。",
      ...baseReport,
    };
  }

  assertExpectedDigest("source", args.expectSourceDigest, plan.sourceDigest, baseReport);
  assertExpectedDigest("plan", args.expectPlanDigest, plan.planDigest, baseReport);
  if (!plan.changed) {
    return {
      ok: true,
      mode: "apply",
      applied: false,
      noOp: true,
      backupPath: "",
      message: "所有档案已是当前版本；没有创建备份、DDL 或写入。",
      ...baseReport,
    };
  }

  const backupDocument = createBatchMigrationBackup(plan.sourceSnapshot, {
    sourceDigest: plan.sourceDigest,
    planDigest: plan.planDigest,
    createdAt: nowIso,
  });
  const backupPath = writeBackup(backupDocument, args.backupPath || "", {
    nowIso,
    repoRoot: String(options.repoRoot || repoRoot),
  });

  // Opening the writer may create missing schema objects, so it deliberately
  // happens only after the verified owner-only logical backup exists.
  let writeStore;
  let writePlan;
  let writeRehearsal;
  try {
    writeStore = createWriteStore();
    const writeSnapshot = clone(writeStore.load());
    writeRehearsal = rehearseBatchProfileMigration(writeSnapshot);
    writePlan = writeRehearsal.plan || buildBatchProfileMigration(writeSnapshot);
  } catch (error) {
    throw migrationError(
      "batch_profile_migration_writer_prepare_failed",
      `逻辑备份已完成，但 writer 初始化或写前重载失败；未执行档案保存。${safeErrorSuffix(error)}`,
      {backupPath},
    );
  }
  if (
    !writePlan.applySafe
    || !writeRehearsal.ok
    || writePlan.sourceDigest !== plan.sourceDigest
    || writePlan.planDigest !== plan.planDigest
  ) {
    throw migrationError(
      "batch_profile_migration_source_drifted",
      "备份后写前快照或计划已变化；未执行档案写入。",
      {
        ...baseReport,
        backupPath,
        writeSourceDigest: writePlan.sourceDigest,
        writePlanDigest: writePlan.planDigest,
      },
    );
  }

  const application = applyBatchProfileMigration(writeStore, writePlan, {backupPath});
  return {
    ok: true,
    mode: "apply",
    applied: true,
    backupPath,
    ambiguousCommitRecovered: application.ambiguousCommitRecovered,
    verification: clone(application.verification.publicReport),
    message: application.ambiguousCommitRecovered
      ? "MySQL 响应不明确，但重载证明完整候选已提交。"
      : "批量档案已提交并通过重载核验。",
    ...baseReport,
  };
}

function applyBatchProfileMigration(store, plan, options = {}) {
  const backupPath = String(options.backupPath || "");
  const preflight = verifyBatchProfileMigration(plan && plan.candidateSnapshot, plan);
  if (!preflight.ok) {
    throw migrationError(
      "batch_profile_migration_plan_invalid",
      "批量迁移计划或候选在写入前完整性校验失败；未执行保存。",
      {backupPath, verification: clone(preflight.publicReport)},
    );
  }
  let saveError = null;
  try {
    store.save(plan.candidateSnapshot);
  } catch (error) {
    saveError = error;
  }

  let currentSnapshot;
  try {
    currentSnapshot = materializeAuthorityRootLargeCollections(store.load());
  } catch (reloadError) {
    throw migrationError(
      "batch_profile_migration_reload_failed",
      `档案写入后无法重载，未冒险回滚；请使用备份人工检查。${safeErrorSuffix(reloadError)}`,
      {backupPath, rollback: {ok: false, attempted: false, reason: "reload_failed"}},
    );
  }
  const verification = verifyBatchProfileMigration(currentSnapshot, plan);
  if (verification.ok) {
    return {
      ok: true,
      verification,
      ambiguousCommitRecovered: Boolean(saveError),
    };
  }

  const rollback = buildBatchProfileRollback(currentSnapshot, plan);
  if (!rollback.applySafe) {
    throw migrationError(
      "batch_profile_migration_rollback_conflict",
      `写后核验失败，且当前档案不再是可识别的 source/candidate 状态；没有覆盖并发数据。${safeErrorSuffix(saveError)}`,
      {
        backupPath,
        verification: clone(verification.publicReport),
        rollback: clone(rollback.publicReport),
      },
    );
  }

  let rollbackSaveError = null;
  if (rollback.rollbackCandidateDigest !== rollback.rollbackBaselineDigest) {
    try {
      store.save(rollback.snapshot);
    } catch (error) {
      rollbackSaveError = error;
    }
  }

  let restoredSnapshot;
  try {
    restoredSnapshot = materializeAuthorityRootLargeCollections(store.load());
  } catch (reloadError) {
    throw migrationError(
      "batch_profile_migration_rollback_reload_failed",
      `批量迁移失败，回滚后无法重载核验；请使用备份人工检查。${safeErrorSuffix(reloadError)}`,
      {
        backupPath,
        verification: clone(verification.publicReport),
        rollback: {...clone(rollback.publicReport), verified: false},
      },
    );
  }
  const rollbackVerification = verifyBatchProfileRollback(restoredSnapshot, rollback);
  const rollbackOk = rollbackVerification.ok;
  const failureMessage = saveError
    ? safeErrorText(saveError, "MySQL save failed")
    : "写后快照与候选不一致";
  throw migrationError(
    rollbackOk
      ? "batch_profile_migration_apply_failed_rolled_back"
      : "batch_profile_migration_apply_failed_rollback_failed",
    `${failureMessage}；单调回滚${rollbackOk ? "已核验" : "未通过核验"}${rollbackSaveError ? safeErrorSuffix(rollbackSaveError) : ""}。`,
    {
      backupPath,
      verification: clone(verification.publicReport),
      rollback: {
        ...clone(rollback.publicReport),
        verified: rollbackOk,
        verificationErrors: clone(rollbackVerification.publicReport.errors),
      },
    },
  );
}

function validateApplyGates(args) {
  if (args.apply !== true) {
    return;
  }
  if (args.maintenanceConfirmed !== true) {
    throw migrationError(
      "batch_profile_migration_maintenance_required",
      "--apply 必须同时提供 --maintenance-confirmed，并确保游戏后端已停止。",
    );
  }
  if (!SHA256_PATTERN.test(String(args.expectSourceDigest || ""))) {
    throw migrationError(
      "batch_profile_migration_source_digest_required",
      "--apply 必须提供预演输出的 --expect-source-digest。",
    );
  }
  if (!SHA256_PATTERN.test(String(args.expectPlanDigest || ""))) {
    throw migrationError(
      "batch_profile_migration_plan_digest_required",
      "--apply 必须提供预演输出的 --expect-plan-digest。",
    );
  }
}

function assertExpectedDigest(kind, expected, actual, details) {
  if (expected === actual) {
    return;
  }
  throw migrationError(
    kind === "source"
      ? "batch_profile_migration_source_digest_mismatch"
      : "batch_profile_migration_plan_digest_mismatch",
    kind === "source"
      ? "当前档案源摘要与已评审预演不一致；未创建备份或写入。"
      : "当前迁移计划摘要与已评审预演不一致；未创建备份或写入。",
    details,
  );
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      result.apply = true;
    } else if (arg === "--maintenance-confirmed") {
      result.maintenanceConfirmed = true;
    } else if (arg === "--expect-source-digest") {
      result.expectSourceDigest = requiredArgumentValue(argv, ++index, arg);
    } else if (arg === "--expect-plan-digest") {
      result.expectPlanDigest = requiredArgumentValue(argv, ++index, arg);
    } else if (arg === "--backup-path") {
      result.backupPath = requiredArgumentValue(argv, ++index, arg);
    } else {
      throw migrationError("batch_profile_migration_argument_unknown", `Unknown argument: ${arg}`);
    }
  }
  return result;
}

function requiredArgumentValue(argv, index, flag) {
  const value = String(argv[index] || "");
  if (value === "" || value.startsWith("--")) {
    throw migrationError("batch_profile_migration_argument_missing", `Missing value for ${flag}`);
  }
  return value;
}

function migrationError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details && typeof details === "object") {
    error.batchMigration = clone(details);
  }
  return error;
}

function safeErrorSuffix(error) {
  const message = safeErrorText(error, "");
  return message === "" ? "" : `（${message}）`;
}

function safeErrorText(error, fallback) {
  let message = String(error && error.message || fallback || "").trim();
  for (const key of ["BEASTBOUND_MYSQL_PASSWORD", "BEASTBOUND_MIGRATE_PASSWORD"]) {
    const secret = String(process.env[key] || "");
    if (secret !== "") {
      message = message.split(secret).join("[REDACTED]");
    }
  }
  return message.slice(0, 240);
}

function clone(value) {
  return structuredClone(value);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) {
      continue;
    }
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

if (require.main === module) {
  main();
}

module.exports = {
  applyBatchProfileMigration,
  parseArgs,
  runMysqlProfileMigration,
  validateApplyGates,
};
