"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  findLatestMysqlBackupArtifact,
  verifyMysqlBackupArtifact,
} = require("./mysql-backup-artifact");

const MYSQL_RESTORE_RECEIPT_KIND = "beastbound_mysql_backup_restore_receipt";
const MYSQL_RESTORE_RECEIPT_SCHEMA_VERSION = 1;
const MYSQL_RESTORE_RECEIPT_DIRECTORY = "restore-receipts";
const MYSQL_RESTORE_RECEIPT_MAX_FILES = 10_000;
const MAX_POLICY_HOURS = 24 * 365 * 10;

function parseMysqlBackupHealthArgs(argv = []) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index] || "");
    if (!["--max-backup-age-hours", "--max-restore-age-hours"].includes(argument)) {
      throw backupHealthError("mysql_backup_health_argument_invalid", "备份健康检查参数无效。");
    }
    if (values.has(argument)) {
      throw backupHealthError("mysql_backup_health_argument_duplicate", "备份健康检查参数不能重复。");
    }
    const raw = String(argv[++index] || "").trim();
    if (raw === "" || raw.startsWith("--")) {
      throw backupHealthError("mysql_backup_health_argument_value_missing", `${argument} 缺少参数。`);
    }
    values.set(argument, checkedPolicyHours(raw, argument));
  }
  if (!values.has("--max-backup-age-hours") || !values.has("--max-restore-age-hours")) {
    throw backupHealthError(
      "mysql_backup_health_policy_missing",
      "必须显式提供 --max-backup-age-hours 与 --max-restore-age-hours。",
    );
  }
  return Object.freeze({
    maxBackupAgeHours: values.get("--max-backup-age-hours"),
    maxRestoreAgeHours: values.get("--max-restore-age-hours"),
  });
}

function mysqlRestoreReceiptDirectory(backupPath) {
  return path.join(path.dirname(path.resolve(String(backupPath || ""))), MYSQL_RESTORE_RECEIPT_DIRECTORY);
}

function createMysqlRestoreReceipt(report, artifact, options = {}) {
  const verifiedArtifact = verifiedArtifactReference(artifact);
  const normalizedReport = certifyRestoreDrillReport(report, verifiedArtifact);
  const completedAt = canonicalIsoTimestamp(options.completedAt || new Date().toISOString(), "恢复回执时间");
  if (Date.parse(completedAt) < Date.parse(verifiedArtifact.manifest.createdAt)) {
    throw backupHealthError("mysql_restore_receipt_time_invalid", "恢复回执时间早于备份创建时间。");
  }
  return Object.freeze({
    kind: MYSQL_RESTORE_RECEIPT_KIND,
    schemaVersion: MYSQL_RESTORE_RECEIPT_SCHEMA_VERSION,
    completedAt,
    backup: Object.freeze({
      createdAt: verifiedArtifact.manifest.createdAt,
      database: verifiedArtifact.manifest.database,
      dumpFile: verifiedArtifact.manifest.dumpFile,
      bytes: verifiedArtifact.manifest.bytes,
      sha256: verifiedArtifact.manifest.sha256,
      consistency: verifiedArtifact.manifest.consistency.contract,
    }),
    restore: normalizedReport.restore,
    application: normalizedReport.application,
    claims: normalizedReport.claims,
    cleanup: normalizedReport.cleanup,
  });
}

function writeMysqlRestoreReceipt(report, artifact, options = {}) {
  const receipt = createMysqlRestoreReceipt(report, artifact, options);
  const verifiedArtifact = verifiedArtifactReference(artifact);
  const receiptDirectory = ensurePrivateDirectory(
    options.receiptDirectory || mysqlRestoreReceiptDirectory(verifiedArtifact.backupPath),
    {create: true},
  );
  const stamp = receipt.completedAt.replace(/[-:.]/g, "");
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  const receiptDigest = sha256Text(serialized);
  const receiptFile = `${receipt.backup.dumpFile}.restore-${stamp}-${process.pid}-${receipt.backup.sha256.slice(0, 12)}-${receiptDigest}.json`;
  const receiptPath = path.join(receiptDirectory, receiptFile);
  const temporaryPath = `${receiptPath}.partial-${process.pid}-${Date.now()}`;
  let fd = null;
  try {
    fd = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(fd, serialized, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    // Re-hash the dump at the publication boundary. A file that changed after
    // the restore finished must never acquire a green receipt.
    assertReceiptMatchesArtifact(receipt, verifyMysqlBackupArtifact(verifiedArtifact.backupPath));
    fs.linkSync(temporaryPath, receiptPath);
    fs.unlinkSync(temporaryPath);
    fs.chmodSync(receiptPath, 0o600);
    return Object.freeze({receiptPath, receipt});
  } catch (error) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    fs.rmSync(temporaryPath, {force: true});
    throw error;
  }
}

function verifyMysqlRestoreReceipt(receiptPath, artifact) {
  const verifiedArtifact = verifiedArtifactReference(artifact);
  const resolvedReceiptPath = validatedPrivateRegularFile(receiptPath, "MySQL 恢复回执");
  const digestMatch = path.basename(resolvedReceiptPath).match(/-([a-f0-9]{64})\.json$/);
  if (!digestMatch || sha256File(resolvedReceiptPath) !== digestMatch[1]) {
    throw backupHealthError("mysql_restore_receipt_digest_mismatch", "MySQL 恢复回执摘要不一致。");
  }
  let document;
  try {
    document = JSON.parse(fs.readFileSync(resolvedReceiptPath, "utf8"));
  } catch (error) {
    throw backupHealthError("mysql_restore_receipt_parse_failed", "MySQL 恢复回执无法解析。", error);
  }
  const receipt = certifyMysqlRestoreReceipt(document);
  assertReceiptMatchesArtifact(receipt, verifiedArtifact);
  return Object.freeze({receiptPath: resolvedReceiptPath, receipt});
}

function findLatestMysqlRestoreReceipt(artifact, options = {}) {
  const verifiedArtifact = verifiedArtifactReference(artifact);
  const receiptDirectory = ensurePrivateDirectory(
    options.receiptDirectory || mysqlRestoreReceiptDirectory(verifiedArtifact.backupPath),
    {create: false},
  );
  let entries;
  try {
    entries = fs.readdirSync(receiptDirectory, {withFileTypes: true});
  } catch (error) {
    throw backupHealthError("mysql_restore_receipt_directory_unreadable", "MySQL 恢复回执目录不可读。", error);
  }
  if (entries.length > MYSQL_RESTORE_RECEIPT_MAX_FILES) {
    throw backupHealthError("mysql_restore_receipt_directory_too_large", "MySQL 恢复回执目录超过安全上限。");
  }
  const prefix = `${verifiedArtifact.manifest.dumpFile}.restore-`;
  const candidates = entries
    .filter((entry) => entry.name.startsWith(prefix) && entry.name.endsWith(".json"))
    .map((entry) => {
      const receiptPath = path.join(receiptDirectory, entry.name);
      const stat = fs.lstatSync(receiptPath);
      return {receiptPath, modifiedAtMs: stat.mtimeMs, name: entry.name};
    })
    .sort((left, right) => (
      right.modifiedAtMs - left.modifiedAtMs
      || right.name.localeCompare(left.name, "en")
    ));
  if (candidates.length === 0) {
    throw backupHealthError("mysql_restore_receipt_missing", "最新 MySQL 备份没有成功恢复回执。");
  }
  // The newest candidate is authoritative. Never hide a corrupted or
  // mismatched recent receipt by silently falling back to an older green one.
  return verifyMysqlRestoreReceipt(candidates[0].receiptPath, verifiedArtifact);
}

function inspectMysqlBackupHealth(options = {}) {
  const checkedAt = canonicalIsoTimestamp(options.checkedAt || new Date().toISOString(), "备份检查时间");
  const maxBackupAgeHours = checkedPolicyHours(options.maxBackupAgeHours, "maxBackupAgeHours");
  const maxRestoreAgeHours = checkedPolicyHours(options.maxRestoreAgeHours, "maxRestoreAgeHours");
  const failures = [];
  let artifact = null;
  try {
    artifact = findLatestMysqlBackupArtifact(options.backupDirectory);
  } catch (error) {
    failures.push(failureFromError(error, "mysql_backup_invalid"));
  }

  let backup = null;
  let restore = null;
  if (artifact !== null) {
    const backupAgeSeconds = ageSeconds(checkedAt, artifact.manifest.createdAt);
    const backupFresh = backupAgeSeconds >= 0 && backupAgeSeconds <= maxBackupAgeHours * 3600;
    if (backupAgeSeconds < 0) {
      failures.push(Object.freeze({code: "mysql_backup_timestamp_in_future"}));
    } else if (!backupFresh) {
      failures.push(Object.freeze({code: "mysql_backup_stale"}));
    }
    backup = Object.freeze({
      dumpFile: artifact.manifest.dumpFile,
      createdAt: artifact.manifest.createdAt,
      ageSeconds: backupAgeSeconds,
      bytes: artifact.manifest.bytes,
      sha256: artifact.manifest.sha256,
      consistency: artifact.manifest.consistency.contract,
      fresh: backupFresh,
    });
    try {
      const verifiedReceipt = findLatestMysqlRestoreReceipt(artifact, {
        receiptDirectory: options.receiptDirectory,
      });
      const restoreAgeSeconds = ageSeconds(checkedAt, verifiedReceipt.receipt.completedAt);
      const restoreFresh = restoreAgeSeconds >= 0 && restoreAgeSeconds <= maxRestoreAgeHours * 3600;
      if (restoreAgeSeconds < 0) {
        failures.push(Object.freeze({code: "mysql_restore_receipt_timestamp_in_future"}));
      } else if (!restoreFresh) {
        failures.push(Object.freeze({code: "mysql_restore_receipt_stale"}));
      }
      restore = Object.freeze({
        receiptFile: path.basename(verifiedReceipt.receiptPath),
        completedAt: verifiedReceipt.receipt.completedAt,
        ageSeconds: restoreAgeSeconds,
        backupSha256: verifiedReceipt.receipt.backup.sha256,
        mysqlVersion: verifiedReceipt.receipt.restore.mysqlVersion,
        schemaDigest: verifiedReceipt.receipt.restore.schemaDigest,
        persistentAuthorityDigest: verifiedReceipt.receipt.restore.persistentAuthorityDigest,
        fresh: restoreFresh,
      });
    } catch (error) {
      failures.push(failureFromError(error, "mysql_restore_receipt_invalid"));
    }
  }

  return Object.freeze({
    ok: failures.length === 0,
    kind: "beastbound_mysql_backup_health",
    schemaVersion: 1,
    checkedAt,
    policy: Object.freeze({maxBackupAgeHours, maxRestoreAgeHours}),
    backup,
    restore,
    failures: Object.freeze(failures),
    claims: Object.freeze({
      latestArtifactDigestVerified: artifact !== null,
      latestArtifactHasMatchingRestoreReceipt: restore !== null,
      offHostCopyProven: false,
      retentionPolicyProven: false,
      pointInTimeRecoveryProven: false,
      productionRpoRtoProven: false,
    }),
  });
}

function certifyRestoreDrillReport(value, artifact) {
  requireExactFields(value, ["application", "backup", "claims", "cleanup", "kind", "restore", "schemaVersion", "status"], "恢复演练报告");
  if (value.status !== "PASS" || value.kind !== "beastbound_mysql_backup_restore_drill" || value.schemaVersion !== 1) {
    throw backupHealthError("mysql_restore_report_status_invalid", "恢复演练报告不是受支持的成功结果。");
  }
  requireExactFields(value.backup, ["bytes", "consistency", "database", "dumpFile", "sha256"], "恢复演练备份摘要");
  if (
    value.backup.database !== artifact.manifest.database
    || value.backup.dumpFile !== artifact.manifest.dumpFile
    || value.backup.bytes !== artifact.manifest.bytes
    || value.backup.sha256 !== artifact.manifest.sha256
    || value.backup.consistency !== artifact.manifest.consistency.contract
  ) {
    throw backupHealthError("mysql_restore_report_artifact_mismatch", "恢复演练报告与 MySQL 备份不一致。");
  }
  requireExactFields(value.restore, [
    "authorityCounts",
    "checkedTableCount",
    "engine",
    "importElapsedMs",
    "mysqlVersion",
    "nonDefaultLoopbackPort",
    "persistentAuthorityDigest",
    "schemaDigest",
    "tableCount",
    "totalElapsedMs",
  ], "恢复演练引擎摘要");
  if (value.restore.engine !== "isolated_mysql_logical_restore_and_real_service_smoke" || value.restore.nonDefaultLoopbackPort !== true) {
    throw backupHealthError("mysql_restore_report_engine_invalid", "恢复演练没有使用受支持的隔离引擎。");
  }
  const tableCount = checkedInteger(value.restore.tableCount, "恢复表数量", {minimum: 1});
  const checkedTableCount = checkedInteger(value.restore.checkedTableCount, "检查表数量", {minimum: 1});
  if (checkedTableCount !== tableCount) {
    throw backupHealthError("mysql_restore_report_table_check_incomplete", "恢复演练没有检查全部表。");
  }
  const authorityCounts = checkedAuthorityCounts(value.restore.authorityCounts);
  const restore = Object.freeze({
    engine: value.restore.engine,
    mysqlVersion: checkedBoundedText(value.restore.mysqlVersion, "MySQL 版本"),
    nonDefaultLoopbackPort: true,
    tableCount,
    checkedTableCount,
    schemaDigest: checkedSha256(value.restore.schemaDigest, "schema 摘要"),
    persistentAuthorityDigest: checkedSha256(value.restore.persistentAuthorityDigest, "持久权威摘要"),
    authorityCounts,
    importElapsedMs: checkedInteger(value.restore.importElapsedMs, "导入耗时", {minimum: 0, maximum: 86_400_000}),
    totalElapsedMs: checkedInteger(value.restore.totalElapsedMs, "演练耗时", {minimum: 0, maximum: 86_400_000}),
  });
  if (restore.totalElapsedMs < restore.importElapsedMs) {
    throw backupHealthError("mysql_restore_report_duration_invalid", "恢复演练总耗时小于导入耗时。");
  }
  const application = exactBooleanContract(value.application, [
    "persistentAuthorityUnchangedAfterStartup",
    "realHttpServerReadyPassed",
    "schemaUnchangedAfterStartup",
    "strictStoreLoadPassed",
  ], true, "恢复应用验证");
  requireExactFields(value.claims, [
    "backupRestorableInIsolatedMysql",
    "productionRpoRtoProven",
    "restoreDrillConnectedToSourceDatabase",
    "sourceDatabaseWritten",
  ], "恢复声明");
  if (
    value.claims.backupRestorableInIsolatedMysql !== true
    || value.claims.restoreDrillConnectedToSourceDatabase !== false
    || value.claims.sourceDatabaseWritten !== false
    || value.claims.productionRpoRtoProven !== false
  ) {
    throw backupHealthError("mysql_restore_report_claims_invalid", "恢复演练声明无效。");
  }
  const claims = Object.freeze({...value.claims});
  const cleanup = exactBooleanContract(value.cleanup, [
    "restoredServerStopped",
    "temporaryMysqlStopped",
    "temporaryPortClosed",
    "temporaryStateRemoved",
  ], true, "恢复清理验证");
  return Object.freeze({restore, application, claims, cleanup});
}

function certifyMysqlRestoreReceipt(value) {
  requireExactFields(value, ["application", "backup", "claims", "cleanup", "completedAt", "kind", "restore", "schemaVersion"], "MySQL 恢复回执");
  if (value.kind !== MYSQL_RESTORE_RECEIPT_KIND || value.schemaVersion !== MYSQL_RESTORE_RECEIPT_SCHEMA_VERSION) {
    throw backupHealthError("mysql_restore_receipt_version_invalid", "MySQL 恢复回执版本不受支持。");
  }
  const completedAt = canonicalIsoTimestamp(value.completedAt, "恢复回执时间");
  requireExactFields(value.backup, ["bytes", "consistency", "createdAt", "database", "dumpFile", "sha256"], "恢复回执备份摘要");
  const backup = Object.freeze({
    createdAt: canonicalIsoTimestamp(value.backup.createdAt, "备份创建时间"),
    database: checkedDatabaseName(value.backup.database),
    dumpFile: checkedDumpFile(value.backup.dumpFile),
    bytes: checkedInteger(value.backup.bytes, "备份字节数", {minimum: 1}),
    sha256: checkedSha256(value.backup.sha256, "备份摘要"),
    consistency: checkedBoundedText(value.backup.consistency, "备份一致性合同"),
  });
  if (Date.parse(completedAt) < Date.parse(backup.createdAt)) {
    throw backupHealthError("mysql_restore_receipt_time_invalid", "恢复回执时间早于备份创建时间。");
  }
  const normalized = certifyRestoreDrillReport({
    status: "PASS",
    kind: "beastbound_mysql_backup_restore_drill",
    schemaVersion: 1,
    backup: {
      database: backup.database,
      dumpFile: backup.dumpFile,
      bytes: backup.bytes,
      sha256: backup.sha256,
      consistency: backup.consistency,
    },
    restore: value.restore,
    application: value.application,
    claims: value.claims,
    cleanup: value.cleanup,
  }, {manifest: {...backup, consistency: {contract: backup.consistency}}});
  return Object.freeze({
    kind: MYSQL_RESTORE_RECEIPT_KIND,
    schemaVersion: MYSQL_RESTORE_RECEIPT_SCHEMA_VERSION,
    completedAt,
    backup,
    restore: normalized.restore,
    application: normalized.application,
    claims: normalized.claims,
    cleanup: normalized.cleanup,
  });
}

function assertReceiptMatchesArtifact(receipt, artifact) {
  if (
    receipt.backup.createdAt !== artifact.manifest.createdAt
    || receipt.backup.database !== artifact.manifest.database
    || receipt.backup.dumpFile !== artifact.manifest.dumpFile
    || receipt.backup.bytes !== artifact.manifest.bytes
    || receipt.backup.sha256 !== artifact.manifest.sha256
    || receipt.backup.consistency !== artifact.manifest.consistency.contract
  ) {
    throw backupHealthError("mysql_restore_receipt_artifact_mismatch", "MySQL 恢复回执与备份产物不一致。");
  }
}

function verifiedArtifactReference(artifact) {
  if (!isRecord(artifact) || typeof artifact.backupPath !== "string") {
    throw backupHealthError("mysql_restore_receipt_artifact_invalid", "MySQL 恢复回执缺少备份产物。");
  }
  return verifyMysqlBackupArtifact(artifact.backupPath);
}

function checkedAuthorityCounts(value) {
  requireExactFields(value, [
    "accounts",
    "activeMail",
    "battleRecords",
    "characterSlots",
    "consumedEquipmentEnvelopes",
    "families",
    "marketListings",
    "mutationReceipts",
    "parties",
    "profiles",
    "serviceEvents",
    "sessions",
    "storeRevision",
  ], "权威计数摘要");
  const result = {};
  for (const [key, count] of Object.entries(value)) {
    result[key] = checkedInteger(count, `权威计数 ${key}`, {minimum: 0});
  }
  return Object.freeze(result);
}

function exactBooleanContract(value, fields, expected, label) {
  requireExactFields(value, fields, label);
  const result = {};
  for (const field of fields) {
    if (value[field] !== expected) {
      throw backupHealthError("mysql_restore_report_boolean_contract_invalid", `${label}未通过。`);
    }
    result[field] = expected;
  }
  return Object.freeze(result);
}

function requireExactFields(value, expectedFields, label) {
  if (!isRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expectedFields].sort())) {
    throw backupHealthError("mysql_backup_health_fields_invalid", `${label}字段不完整。`);
  }
}

function checkedInteger(value, label, options = {}) {
  const number = Number(value);
  const minimum = Number(options.minimum ?? Number.MIN_SAFE_INTEGER);
  const maximum = Number(options.maximum ?? Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw backupHealthError("mysql_backup_health_integer_invalid", `${label}无效。`);
  }
  return number;
}

function checkedPolicyHours(value, label) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_POLICY_HOURS) {
    throw backupHealthError("mysql_backup_health_policy_invalid", `${label} 必须是有效的正数小时。`);
  }
  return hours;
}

function checkedSha256(value, label) {
  const digest = String(value || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw backupHealthError("mysql_backup_health_digest_invalid", `${label}无效。`);
  }
  return digest;
}

function checkedBoundedText(value, label) {
  const text = String(value || "");
  if (text.length < 1 || text.length > 128 || /[\u0000-\u001f\u007f]/.test(text)) {
    throw backupHealthError("mysql_backup_health_text_invalid", `${label}无效。`);
  }
  return text;
}

function checkedDatabaseName(value) {
  const database = String(value || "");
  if (!/^[A-Za-z0-9_]{1,64}$/.test(database)) {
    throw backupHealthError("mysql_restore_receipt_database_invalid", "恢复回执数据库名无效。");
  }
  return database;
}

function checkedDumpFile(value) {
  const dumpFile = String(value || "");
  if (path.basename(dumpFile) !== dumpFile || !/^[A-Za-z0-9_.-]+\.sql$/.test(dumpFile)) {
    throw backupHealthError("mysql_restore_receipt_filename_invalid", "恢复回执备份文件名无效。");
  }
  return dumpFile;
}

function canonicalIsoTimestamp(value, label) {
  const text = String(value || "");
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== text) {
    throw backupHealthError("mysql_backup_health_timestamp_invalid", `${label}无效。`);
  }
  return text;
}

function ageSeconds(checkedAt, earlierAt) {
  return Math.floor((Date.parse(checkedAt) - Date.parse(earlierAt)) / 1000);
}

function ensurePrivateDirectory(directoryPath, options = {}) {
  const resolved = path.resolve(String(directoryPath || ""));
  if (!fs.existsSync(resolved)) {
    if (options.create !== true) {
      throw backupHealthError("mysql_restore_receipt_missing", "最新 MySQL 备份没有成功恢复回执。");
    }
    try {
      fs.mkdirSync(resolved, {recursive: false, mode: 0o700});
    } catch (error) {
      throw backupHealthError("mysql_restore_receipt_directory_create_failed", "无法创建 MySQL 恢复回执目录。", error);
    }
  }
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw backupHealthError("mysql_restore_receipt_directory_type_invalid", "MySQL 恢复回执目录不能是符号链接且必须是目录。");
  }
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    throw backupHealthError("mysql_restore_receipt_directory_permissions_invalid", "MySQL 恢复回执目录权限必须为仅所有者可访问。");
  }
  return resolved;
}

function validatedPrivateRegularFile(filePath, label) {
  const resolved = path.resolve(String(filePath || ""));
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    throw backupHealthError("mysql_restore_receipt_missing", `${label}不存在。`, error);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw backupHealthError("mysql_restore_receipt_file_type_invalid", `${label}必须是普通文件且不能是符号链接。`);
  }
  if (stat.size <= 0 || stat.size > 1024 * 1024) {
    throw backupHealthError("mysql_restore_receipt_size_invalid", `${label}大小无效。`);
  }
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    throw backupHealthError("mysql_restore_receipt_file_permissions_invalid", `${label}权限必须为仅所有者可读写。`);
  }
  return resolved;
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function failureFromError(error, fallbackCode) {
  const code = String(error && error.code || fallbackCode);
  return Object.freeze({code: /^[a-z0-9_]{1,96}$/.test(code) ? code : fallbackCode});
}

function backupHealthError(code, message, cause = undefined) {
  const error = new Error(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  MYSQL_RESTORE_RECEIPT_KIND,
  MYSQL_RESTORE_RECEIPT_SCHEMA_VERSION,
  certifyMysqlRestoreReceipt,
  createMysqlRestoreReceipt,
  findLatestMysqlRestoreReceipt,
  inspectMysqlBackupHealth,
  mysqlRestoreReceiptDirectory,
  parseMysqlBackupHealthArgs,
  verifyMysqlRestoreReceipt,
  writeMysqlRestoreReceipt,
};
