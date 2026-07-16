"use strict";

const {stableDigest} = require("./auth/profile-migrations");
const {
  buildMailStorageBootstrapPlan,
  reconcileMailStorageBootstrapPlan,
  verifyMailStorageBootstrapPlan,
} = require("./mysql-mail-storage-bootstrap-plan");
const {
  redactMailStorageBootstrapFact,
} = require("./mysql-mail-storage-bootstrap-public-report");

const MAIL_STORAGE_BOOTSTRAP_DRY_RUN_KIND = "beastbound_mail_storage_bootstrap_dry_run";
const MAIL_STORAGE_BOOTSTRAP_DRY_RUN_SCHEMA_VERSION = 1;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PUBLIC_TARGET_STATUSES = new Set(["conflict", "exact", "missing"]);
const PUBLIC_TARGET_ACTIONS = new Set([
  "already_ready",
  "blocked",
  "finalize",
  "repair_missing",
  "start",
]);
const PUBLIC_CONTROL_MODES = new Set(["building", "invalid", "ready", "uninitialized"]);

// This boundary deliberately performs two complete reads. A matching pair is
// evidence that the dry-run observed a stable source and target; it is never
// permission to write. The future apply executor must repeat the validation in
// its own locked transaction immediately before issuing any DML.
async function runMailStorageBootstrapDryRun(options = {}) {
  const readSnapshot = options && options.readSnapshot;
  const certifyAttachment = options && options.certifyAttachment;
  if (typeof readSnapshot !== "function") {
    throw dryRunError("mail_storage_bootstrap_snapshot_reader_missing");
  }
  if (typeof certifyAttachment !== "function") {
    throw dryRunError("mail_storage_bootstrap_attachment_certifier_missing");
  }

  const first = inspectSnapshot(await readSnapshot(), certifyAttachment);
  const second = inspectSnapshot(await readSnapshot(), certifyAttachment);
  const firstInspectionSafe = inspectionSafe(first);
  const secondInspectionSafe = inspectionSafe(second);
  const stability = {
    firstInspectionSafe,
    secondInspectionSafe,
    inspectionStatusMatch: inspectionStatus(first) === inspectionStatus(second),
    sourceDigestMatch: validDigest(first.sourceDigest)
      && first.sourceDigest === second.sourceDigest,
    planDigestMatch: validDigest(first.planDigest)
      && first.planDigest === second.planDigest,
    targetDigestMatch: validDigest(first.targetDigest)
      && first.targetDigest === second.targetDigest,
  };
  const stable = stability.inspectionStatusMatch
    && stability.sourceDigestMatch
    && stability.planDigestMatch
    && stability.targetDigestMatch;
  const safe = firstInspectionSafe && secondInspectionSafe;
  const current = second;
  const code = dryRunResultCode(current, stable, stability);

  return deepFreeze({
    kind: MAIL_STORAGE_BOOTSTRAP_DRY_RUN_KIND,
    schemaVersion: MAIL_STORAGE_BOOTSTRAP_DRY_RUN_SCHEMA_VERSION,
    ok: stable && safe,
    code,
    mode: "dry-run",
    applied: false,
    applySafe: false,
    stable,
    observationCount: 2,
    stability,
    digests: {
      source: safeDigest(current.sourceDigest),
      plan: safeDigest(current.planDigest),
      target: safeDigest(current.targetDigest),
    },
    source: current.publicSource,
    target: current.publicTarget,
  });
}

function inspectSnapshot(snapshotValue, certifyAttachment) {
  const snapshot = isObject(snapshotValue) ? snapshotValue : {};
  const target = {
    control: snapshot.control,
    identityRows: snapshot.identityRows,
    counterRows: snapshot.counterRows,
    archiveRows: snapshot.archiveRows,
    vaultRows: snapshot.vaultRows,
  };
  const plan = buildMailStorageBootstrapPlan({
    sourceRows: snapshot.sourceRows,
    certifyAttachment,
  });
  const verification = verifyMailStorageBootstrapPlan(plan, {certifyAttachment});
  const reconciliation = reconcileMailStorageBootstrapPlan(plan, target, {certifyAttachment});
  const targetDigest = digestTargetSnapshot(target);
  return {
    planOk: plan.ok === true,
    verificationOk: verification.ok === true,
    reconciliationOk: reconciliation.ok === true,
    sourceDigest: String(plan.sourceDigest || ""),
    planDigest: String(plan.planDigest || ""),
    targetDigest,
    publicSource: publicSourceReport(plan, verification),
    publicTarget: publicTargetReport(reconciliation, target),
  };
}

function inspectionSafe(value) {
  return value.planOk === true
    && value.verificationOk === true
    && value.reconciliationOk === true;
}

function inspectionStatus(value) {
  return [value.planOk, value.verificationOk, value.reconciliationOk]
    .map((entry) => entry === true ? "1" : "0")
    .join("");
}

function digestTargetSnapshot(targetValue) {
  const target = isObject(targetValue) ? targetValue : {};
  return stableDigest({
    kind: "beastbound_mail_storage_bootstrap_target_snapshot",
    schemaVersion: 1,
    control: target.control,
    identityRows: normalizedFullRows(target.identityRows, "mailId"),
    counterRows: normalizedFullRows(target.counterRows, "recipientAccountId"),
    archiveKeys: normalizedKeys(target.archiveRows, "mailId"),
    vaultKeys: normalizedKeys(target.vaultRows, "rewardId"),
  });
}

function normalizedFullRows(rowsValue, keyField) {
  if (!Array.isArray(rowsValue)) {
    return {invalid: true, value: rowsValue};
  }
  return rowsValue.map((row, index) => ({
    row,
    index,
    key: isObject(row) ? row[keyField] : undefined,
    digest: stableDigest(row),
  })).sort(compareNormalizedEntries).map((entry) => entry.row);
}

function normalizedKeys(rowsValue, keyField) {
  if (!Array.isArray(rowsValue)) {
    return {invalid: true, value: rowsValue};
  }
  return rowsValue.map((row) => (
    isObject(row) && Object.hasOwn(row, keyField) ? row[keyField] : undefined
  )).sort(compareCanonicalValues);
}

function compareNormalizedEntries(left, right) {
  const keyOrder = compareCanonicalValues(left.key, right.key);
  if (keyOrder !== 0) return keyOrder;
  const digestOrder = compareCanonicalText(left.digest, right.digest);
  return digestOrder !== 0 ? digestOrder : left.index - right.index;
}

function compareCanonicalValues(left, right) {
  return compareCanonicalText(stableDigest(left), stableDigest(right));
}

function compareCanonicalText(left, right) {
  return left < right ? -1 : (left > right ? 1 : 0);
}

function publicSourceReport(planValue, verificationValue) {
  const plan = isObject(planValue) ? planValue : {};
  const verification = isObject(verificationValue) ? verificationValue : {};
  const counts = isObject(plan.counts) ? plan.counts : {};
  const errors = Array.isArray(plan.errors) ? plan.errors : [];
  return deepFreeze({
    ok: plan.ok === true,
    sourceSafe: plan.sourceSafe === true,
    verificationOk: verification.ok === true,
    verificationCode: verification.ok === true
      ? "mail_storage_bootstrap_plan_verified"
      : redactMailStorageBootstrapFact({code: verification.code, path: "plan"}).code,
    counts: {
      source: safeCount(counts.source),
      identity: safeCount(counts.identity),
      recipient: safeCount(counts.recipient),
      active: safeCount(counts.active),
    },
    errorCount: errors.length,
    errors: errors.map(redactMailStorageBootstrapFact),
  });
}

function publicTargetReport(reconciliationValue, targetValue) {
  const reconciliation = isObject(reconciliationValue) ? reconciliationValue : {};
  const target = isObject(targetValue) ? targetValue : {};
  const missingIdentityRows = Array.isArray(reconciliation.missingIdentityRows)
    ? reconciliation.missingIdentityRows
    : [];
  const missingCounterRows = Array.isArray(reconciliation.missingCounterRows)
    ? reconciliation.missingCounterRows
    : [];
  const conflicts = Array.isArray(reconciliation.conflicts) ? reconciliation.conflicts : [];
  return deepFreeze({
    status: safeToken(reconciliation.status, "invalid", PUBLIC_TARGET_STATUSES),
    action: safeToken(reconciliation.action, "blocked", PUBLIC_TARGET_ACTIONS),
    controlMode: safeToken(reconciliation.controlMode, "invalid", PUBLIC_CONTROL_MODES),
    observedCounts: {
      identity: arrayCount(target.identityRows),
      recipient: arrayCount(target.counterRows),
      archive: arrayCount(target.archiveRows),
      vault: arrayCount(target.vaultRows),
    },
    exactIdentityCount: safeCount(reconciliation.exactIdentityCount),
    exactCounterCount: safeCount(reconciliation.exactCounterCount),
    missingIdentityCount: missingIdentityRows.length,
    missingCounterCount: missingCounterRows.length,
    conflictCount: conflicts.length,
    conflicts: conflicts.map(redactMailStorageBootstrapFact),
  });
}

function dryRunResultCode(current, stable, stability) {
  if (stability.inspectionStatusMatch !== true) {
    return "mail_storage_bootstrap_snapshot_drift";
  }
  if (!current.planOk) return "mail_storage_bootstrap_source_unsafe";
  if (!current.verificationOk) return "mail_storage_bootstrap_plan_verification_failed";
  if (!stable) return "mail_storage_bootstrap_snapshot_drift";
  if (!current.reconciliationOk) return "mail_storage_bootstrap_target_conflict";
  return "mail_storage_bootstrap_dry_run_ok";
}

function safeDigest(value) {
  const digest = String(value || "");
  return validDigest(digest) ? digest : "";
}

function validDigest(value) {
  return SHA256_PATTERN.test(String(value || ""));
}

function safeToken(value, fallback, allowed) {
  const token = String(value || "");
  return allowed instanceof Set && allowed.has(token) ? token : fallback;
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function arrayCount(value) {
  return Array.isArray(value) ? value.length : 0;
}

function dryRunError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

module.exports = {
  MAIL_STORAGE_BOOTSTRAP_DRY_RUN_KIND,
  MAIL_STORAGE_BOOTSTRAP_DRY_RUN_SCHEMA_VERSION,
  digestTargetSnapshot,
  redactMailStorageBootstrapFact,
  runMailStorageBootstrapDryRun,
};
