"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MYSQL_BACKUP_MANIFEST_KIND = "beastbound_mysql_logical_backup";
const MYSQL_BACKUP_MANIFEST_SCHEMA_VERSION = 1;
const MYSQL_BACKUP_CONSISTENCY_CONTRACT = "mysql_innodb_single_transaction_v1";
const MYSQL_BACKUP_MAX_BYTES = 8 * 1024 * 1024 * 1024;
const HASH_BUFFER_BYTES = 1024 * 1024;

function mysqlBackupManifestPath(backupPath) {
  return `${path.resolve(String(backupPath || ""))}.manifest.json`;
}

function createMysqlBackupManifest(backupPath, options = {}) {
  const resolvedBackupPath = validatedPrivateRegularFile(backupPath, {
    label: "MySQL 备份",
    requireOwnerOnly: options.requireOwnerOnly !== false,
  });
  const database = checkedDatabaseName(options.database);
  const createdAt = canonicalIsoTimestamp(options.createdAt || new Date().toISOString());
  const stat = fs.statSync(resolvedBackupPath);
  if (stat.size <= 0 || stat.size > MYSQL_BACKUP_MAX_BYTES) {
    throw backupArtifactError("mysql_backup_size_invalid", "MySQL 备份大小不在安全范围内。");
  }
  return Object.freeze({
    kind: MYSQL_BACKUP_MANIFEST_KIND,
    schemaVersion: MYSQL_BACKUP_MANIFEST_SCHEMA_VERSION,
    createdAt,
    database,
    dumpFile: path.basename(resolvedBackupPath),
    bytes: stat.size,
    sha256: sha256File(resolvedBackupPath),
    consistency: Object.freeze({
      contract: MYSQL_BACKUP_CONSISTENCY_CONTRACT,
      singleTransaction: true,
      lockTables: false,
      gtidPurged: false,
    }),
  });
}

function writeMysqlBackupManifest(manifest, backupPath) {
  const normalized = certifyMysqlBackupManifest(manifest);
  const resolvedBackupPath = validatedPrivateRegularFile(backupPath, {
    label: "MySQL 备份",
    requireOwnerOnly: true,
  });
  if (normalized.dumpFile !== path.basename(resolvedBackupPath)) {
    throw backupArtifactError("mysql_backup_manifest_file_mismatch", "MySQL 备份清单与 SQL 文件名不一致。");
  }
  const backupStat = fs.statSync(resolvedBackupPath);
  if (backupStat.size !== normalized.bytes || sha256File(resolvedBackupPath) !== normalized.sha256) {
    throw backupArtifactError("mysql_backup_manifest_digest_mismatch", "MySQL 备份在清单发布前发生变化。");
  }
  const manifestPath = mysqlBackupManifestPath(resolvedBackupPath);
  const parent = path.dirname(manifestPath);
  fs.mkdirSync(parent, {recursive: true});
  const temporaryPath = `${manifestPath}.partial-${process.pid}-${Date.now()}`;
  let fd = null;
  try {
    fd = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    // Publish create-once: a restore drill must never observe a partially
    // written manifest, and a later command must not overwrite the manifest
    // that cryptographically binds an existing dump.
    fs.linkSync(temporaryPath, manifestPath);
    fs.unlinkSync(temporaryPath);
    fs.chmodSync(manifestPath, 0o600);
    return manifestPath;
  } catch (error) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    fs.rmSync(temporaryPath, {force: true});
    throw error;
  }
}

function verifyMysqlBackupArtifact(backupPath, options = {}) {
  const resolvedBackupPath = validatedPrivateRegularFile(backupPath, {
    label: "MySQL 备份",
    requireOwnerOnly: options.requireOwnerOnly !== false,
  });
  const manifestPath = validatedPrivateRegularFile(mysqlBackupManifestPath(resolvedBackupPath), {
    label: "MySQL 备份清单",
    requireOwnerOnly: options.requireOwnerOnly !== false,
  });
  let document;
  try {
    document = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw backupArtifactError("mysql_backup_manifest_parse_failed", "MySQL 备份清单无法解析。", error);
  }
  const manifest = certifyMysqlBackupManifest(document);
  if (manifest.dumpFile !== path.basename(resolvedBackupPath)) {
    throw backupArtifactError("mysql_backup_manifest_file_mismatch", "MySQL 备份清单与 SQL 文件名不一致。");
  }
  const stat = fs.statSync(resolvedBackupPath);
  if (stat.size !== manifest.bytes || stat.size <= 0 || stat.size > MYSQL_BACKUP_MAX_BYTES) {
    throw backupArtifactError("mysql_backup_manifest_size_mismatch", "MySQL 备份大小与清单不一致。");
  }
  const observedSha256 = sha256File(resolvedBackupPath);
  if (observedSha256 !== manifest.sha256) {
    throw backupArtifactError("mysql_backup_manifest_digest_mismatch", "MySQL 备份摘要与清单不一致。");
  }
  return Object.freeze({
    backupPath: resolvedBackupPath,
    manifestPath,
    manifest,
  });
}

function findLatestMysqlBackupArtifact(backupDirectory, options = {}) {
  const resolvedDirectory = path.resolve(String(backupDirectory || ""));
  let entries;
  try {
    entries = fs.readdirSync(resolvedDirectory, {withFileTypes: true});
  } catch (error) {
    throw backupArtifactError("mysql_backup_directory_unreadable", "MySQL 备份目录不可读。", error);
  }
  const backups = entries
    .filter((entry) => entry.name.endsWith(".sql"))
    .map((entry) => {
      const name = entry.name;
      const stat = fs.lstatSync(path.join(resolvedDirectory, name));
      return {name, modifiedAtMs: stat.mtimeMs};
    })
    .sort((left, right) => (
      right.modifiedAtMs - left.modifiedAtMs
      || right.name.localeCompare(left.name, "en")
    ));
  if (backups.length === 0) {
    throw backupArtifactError("mysql_backup_file_missing", "没有找到 MySQL 备份。");
  }
  const backupPath = path.join(resolvedDirectory, backups[0].name);
  if (!fs.existsSync(mysqlBackupManifestPath(backupPath))) {
    throw backupArtifactError("mysql_backup_manifest_missing", "最新 MySQL 备份缺少完整清单，拒绝回退旧产物。");
  }
  return verifyMysqlBackupArtifact(backupPath, options);
}

function certifyMysqlBackupManifest(value) {
  if (!isRecord(value)) {
    throw backupArtifactError("mysql_backup_manifest_invalid", "MySQL 备份清单格式无效。");
  }
  const fields = Object.keys(value).sort();
  const expectedFields = [
    "bytes",
    "consistency",
    "createdAt",
    "database",
    "dumpFile",
    "kind",
    "schemaVersion",
    "sha256",
  ].sort();
  if (JSON.stringify(fields) !== JSON.stringify(expectedFields)) {
    throw backupArtifactError("mysql_backup_manifest_fields_invalid", "MySQL 备份清单字段不完整。");
  }
  if (
    value.kind !== MYSQL_BACKUP_MANIFEST_KIND
    || value.schemaVersion !== MYSQL_BACKUP_MANIFEST_SCHEMA_VERSION
  ) {
    throw backupArtifactError("mysql_backup_manifest_version_invalid", "MySQL 备份清单版本不受支持。");
  }
  const consistency = value.consistency;
  if (
    !isRecord(consistency)
    || JSON.stringify(Object.keys(consistency).sort())
      !== JSON.stringify(["contract", "gtidPurged", "lockTables", "singleTransaction"].sort())
    || consistency.contract !== MYSQL_BACKUP_CONSISTENCY_CONTRACT
    || consistency.singleTransaction !== true
    || consistency.lockTables !== false
    || consistency.gtidPurged !== false
  ) {
    throw backupArtifactError("mysql_backup_manifest_consistency_invalid", "MySQL 备份不是受支持的单事务一致性产物。");
  }
  const bytes = Number(value.bytes);
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MYSQL_BACKUP_MAX_BYTES) {
    throw backupArtifactError("mysql_backup_manifest_bytes_invalid", "MySQL 备份清单大小无效。");
  }
  const dumpFile = String(value.dumpFile || "");
  if (
    path.basename(dumpFile) !== dumpFile
    || !/^[A-Za-z0-9_.-]+\.sql$/.test(dumpFile)
  ) {
    throw backupArtifactError("mysql_backup_manifest_filename_invalid", "MySQL 备份清单文件名无效。");
  }
  const sha256 = String(value.sha256 || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw backupArtifactError("mysql_backup_manifest_digest_invalid", "MySQL 备份清单摘要无效。");
  }
  return Object.freeze({
    kind: MYSQL_BACKUP_MANIFEST_KIND,
    schemaVersion: MYSQL_BACKUP_MANIFEST_SCHEMA_VERSION,
    createdAt: canonicalIsoTimestamp(value.createdAt),
    database: checkedDatabaseName(value.database),
    dumpFile,
    bytes,
    sha256,
    consistency: Object.freeze({
      contract: MYSQL_BACKUP_CONSISTENCY_CONTRACT,
      singleTransaction: true,
      lockTables: false,
      gtidPurged: false,
    }),
  });
}

function validatedPrivateRegularFile(filePath, options = {}) {
  const resolved = path.resolve(String(filePath || ""));
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    throw backupArtifactError("mysql_backup_file_missing", `${options.label || "文件"}不存在。`, error);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw backupArtifactError("mysql_backup_file_type_invalid", `${options.label || "文件"}必须是普通文件且不能是符号链接。`);
  }
  if (options.requireOwnerOnly !== false && process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    throw backupArtifactError("mysql_backup_file_permissions_invalid", `${options.label || "文件"}权限必须为仅所有者可读写。`);
  }
  return resolved;
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(HASH_BUFFER_BYTES);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        hash.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function canonicalIsoTimestamp(value) {
  const text = String(value || "");
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== text) {
    throw backupArtifactError("mysql_backup_manifest_timestamp_invalid", "MySQL 备份清单时间无效。");
  }
  return text;
}

function checkedDatabaseName(value) {
  const database = String(value || "").trim();
  if (!/^[A-Za-z0-9_]{1,64}$/.test(database)) {
    throw backupArtifactError("mysql_backup_manifest_database_invalid", "MySQL 备份数据库名无效。");
  }
  return database;
}

function backupArtifactError(code, message, cause = undefined) {
  const error = new Error(message);
  error.code = code;
  if (cause !== undefined) {
    error.cause = cause;
  }
  return error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  MYSQL_BACKUP_CONSISTENCY_CONTRACT,
  MYSQL_BACKUP_MANIFEST_KIND,
  MYSQL_BACKUP_MANIFEST_SCHEMA_VERSION,
  createMysqlBackupManifest,
  findLatestMysqlBackupArtifact,
  mysqlBackupManifestPath,
  verifyMysqlBackupArtifact,
  writeMysqlBackupManifest,
};
