"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {stableDigest} = require("./profile-migrations");

const BATCH_MIGRATION_BACKUP_KIND = "beastbound_profile_migration_backup";
const BATCH_MIGRATION_BACKUP_SCHEMA_VERSION = 1;
const BACKUP_KEYS = Object.freeze([
  "backupDigest",
  "createdAt",
  "kind",
  "planDigest",
  "schemaVersion",
  "snapshot",
  "sourceDigest",
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function createBatchMigrationBackup(snapshotValue, options = {}) {
  const snapshot = cloneJsonSnapshot(snapshotValue);
  const sourceDigest = String(options.sourceDigest || "");
  const planDigest = String(options.planDigest || "");
  const createdAt = String(options.createdAt || "");
  const snapshotDigest = stableDigest(snapshot);

  if (!SHA256_PATTERN.test(sourceDigest) || sourceDigest !== snapshotDigest) {
    throw backupError(
      "profile_migration_backup_source_digest_invalid",
      "Batch migration backup source digest does not match its snapshot."
    );
  }
  if (!SHA256_PATTERN.test(planDigest)) {
    throw backupError(
      "profile_migration_backup_plan_digest_invalid",
      "Batch migration backup plan digest must be a SHA-256 digest."
    );
  }
  if (!isCanonicalIsoTimestamp(createdAt)) {
    throw backupError(
      "profile_migration_backup_created_at_invalid",
      "Batch migration backup createdAt must be a canonical ISO timestamp."
    );
  }

  const payload = {
    kind: BATCH_MIGRATION_BACKUP_KIND,
    schemaVersion: BATCH_MIGRATION_BACKUP_SCHEMA_VERSION,
    createdAt,
    sourceDigest,
    planDigest,
    snapshot,
  };
  const document = {
    ...payload,
    backupDigest: stableDigest(payload),
  };
  const verification = verifyBatchMigrationBackup(document);
  if (!verification.ok) {
    throw backupError(verification.code, verification.message);
  }
  return document;
}

function verifyBatchMigrationBackup(document) {
  if (!isRecord(document)) {
    return backupFailure(
      "profile_migration_backup_document_invalid",
      "Batch migration backup document must be an object."
    );
  }
  if (!sameKeys(document, BACKUP_KEYS)) {
    return backupFailure(
      "profile_migration_backup_fields_invalid",
      "Batch migration backup document fields do not match schema version 1."
    );
  }
  if (document.kind !== BATCH_MIGRATION_BACKUP_KIND) {
    return backupFailure(
      "profile_migration_backup_kind_invalid",
      "Batch migration backup kind is not supported."
    );
  }
  if (document.schemaVersion !== BATCH_MIGRATION_BACKUP_SCHEMA_VERSION) {
    return backupFailure(
      "profile_migration_backup_schema_version_invalid",
      "Batch migration backup schema version is not supported."
    );
  }
  if (!isCanonicalIsoTimestamp(document.createdAt)) {
    return backupFailure(
      "profile_migration_backup_created_at_invalid",
      "Batch migration backup createdAt must be a canonical ISO timestamp."
    );
  }
  if (!isRecord(document.snapshot)) {
    return backupFailure(
      "profile_migration_backup_snapshot_invalid",
      "Batch migration backup snapshot must be an object."
    );
  }
  if (!SHA256_PATTERN.test(document.sourceDigest)) {
    return backupFailure(
      "profile_migration_backup_source_digest_invalid",
      "Batch migration backup source digest must be a SHA-256 digest."
    );
  }
  if (!SHA256_PATTERN.test(document.planDigest)) {
    return backupFailure(
      "profile_migration_backup_plan_digest_invalid",
      "Batch migration backup plan digest must be a SHA-256 digest."
    );
  }
  if (!SHA256_PATTERN.test(document.backupDigest)) {
    return backupFailure(
      "profile_migration_backup_digest_invalid",
      "Batch migration backup digest must be a SHA-256 digest."
    );
  }
  if (stableDigest(document.snapshot) !== document.sourceDigest) {
    return backupFailure(
      "profile_migration_backup_source_digest_mismatch",
      "Batch migration backup snapshot no longer matches its source digest."
    );
  }

  const payload = backupDigestPayload(document);
  if (stableDigest(payload) !== document.backupDigest) {
    return backupFailure(
      "profile_migration_backup_digest_mismatch",
      "Batch migration backup document failed its integrity check."
    );
  }
  return {
    ok: true,
    kind: document.kind,
    schemaVersion: document.schemaVersion,
    createdAt: document.createdAt,
    sourceDigest: document.sourceDigest,
    planDigest: document.planDigest,
    backupDigest: document.backupDigest,
  };
}

function writeBatchMigrationBackup(document, requestedPath = "", options = {}) {
  const verification = verifyBatchMigrationBackup(document);
  if (!verification.ok) {
    throw backupError(verification.code, verification.message);
  }

  const nowIso = String(options.nowIso || new Date().toISOString());
  if (!isCanonicalIsoTimestamp(nowIso)) {
    throw backupError(
      "profile_migration_backup_write_time_invalid",
      "Batch migration backup write time must be a canonical ISO timestamp."
    );
  }
  const root = path.resolve(String(options.repoRoot || path.resolve(__dirname, "../../../..")));
  const stamp = nowIso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const nonce = crypto.randomBytes(4).toString("hex");
  const backupPath = requestedPath
    ? path.resolve(String(requestedPath))
    : path.resolve(root, "server/node/.local/backups", `profile-migration-batch-${stamp}-${nonce}.json`);

  fs.mkdirSync(path.dirname(backupPath), {recursive: true});
  fs.writeFileSync(backupPath, `${JSON.stringify(document, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  fs.chmodSync(backupPath, 0o600);

  let writtenDocument;
  try {
    writtenDocument = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  } catch {
    throw backupError(
      "profile_migration_backup_readback_invalid",
      "Written batch migration backup could not be read back as JSON."
    );
  }
  const writtenVerification = verifyBatchMigrationBackup(writtenDocument);
  if (!writtenVerification.ok || stableDigest(writtenDocument) !== stableDigest(document)) {
    throw backupError(
      writtenVerification.ok ? "profile_migration_backup_readback_mismatch" : writtenVerification.code,
      writtenVerification.ok
        ? "Written batch migration backup does not match the verified document."
        : writtenVerification.message
    );
  }
  return backupPath;
}

function backupDigestPayload(document) {
  return {
    kind: document.kind,
    schemaVersion: document.schemaVersion,
    createdAt: document.createdAt,
    sourceDigest: document.sourceDigest,
    planDigest: document.planDigest,
    snapshot: document.snapshot,
  };
}

function cloneJsonSnapshot(value) {
  if (!isRecord(value)) {
    throw backupError(
      "profile_migration_backup_snapshot_invalid",
      "Batch migration backup snapshot must be an object."
    );
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw backupError(
      "profile_migration_backup_snapshot_not_json",
      "Batch migration backup snapshot must be JSON serializable."
    );
  }
  if (typeof serialized !== "string") {
    throw backupError(
      "profile_migration_backup_snapshot_not_json",
      "Batch migration backup snapshot must be JSON serializable."
    );
  }
  return JSON.parse(serialized);
}

function sameKeys(value, expectedKeys) {
  const actual = Object.keys(value).sort();
  return actual.length === expectedKeys.length
    && actual.every((key, index) => key === expectedKeys[index]);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== "string" || value === "") {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function backupFailure(code, message) {
  return {ok: false, code, message};
}

function backupError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  BATCH_MIGRATION_BACKUP_KIND,
  BATCH_MIGRATION_BACKUP_SCHEMA_VERSION,
  createBatchMigrationBackup,
  verifyBatchMigrationBackup,
  writeBatchMigrationBackup,
};
