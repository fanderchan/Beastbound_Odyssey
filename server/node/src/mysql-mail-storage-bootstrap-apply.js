"use strict";

const {
  buildMailStorageBootstrapPlan,
  reconcileMailStorageBootstrapPlan,
  verifyMailStorageBootstrapPlan,
} = require("./mysql-mail-storage-bootstrap-plan");
const {
  digestTargetSnapshot,
} = require("./mysql-mail-storage-bootstrap-dry-run");
const {
  readMysqlMailStorageBootstrapSnapshotFromConnection,
} = require("./mysql-mail-storage-bootstrap-read");
const {
  MYSQL_COMMIT_OUTCOME_AMBIGUOUS,
  MYSQL_TRANSACTION_ROLLED_BACK,
  checkoutMysqlConnection,
  classifyMysqlTransactionFailure,
  createMysqlTransactionDeadlineController,
  destroyMysqlConnection,
  normalizeMysqlTransactionPolicy,
} = require("./mysql-transaction-guard");

const MAIL_STORAGE_BOOTSTRAP_APPLY_KIND = "beastbound_mail_storage_bootstrap_apply";
const MAIL_STORAGE_BOOTSTRAP_APPLY_SCHEMA_VERSION = 1;
const BOOTSTRAP_INSERT_BATCH_SIZE = 128;
const TRANSACTION_ISOLATION_SQL = "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ";
const BUILDING_CONTROL_SQL = `UPDATE mail_storage_control
SET data_generation = 1,
    lifecycle_state = 'building',
    bootstrap_cursor_mail_id = NULL,
    bootstrap_source_count = ?,
    bootstrap_identity_count = ?,
    bootstrap_recipient_count = ?,
    bootstrap_active_count = ?,
    source_digest = ?,
    reconciled_at = NULL
WHERE scope_key = 'mail_lifecycle'
  AND schema_generation = 1
  AND data_generation = 0
  AND lifecycle_state = 'uninitialized'
  AND archive_enabled = 0
  AND vault_claim_enabled = 0
  AND active_limit_enabled = 0
  AND bootstrap_cursor_mail_id IS NULL
  AND bootstrap_source_count = 0
  AND bootstrap_identity_count = 0
  AND bootstrap_recipient_count = 0
  AND bootstrap_active_count = 0
  AND source_digest IS NULL
  AND reconciled_at IS NULL`;
const IDENTITY_INSERT_SQL_PREFIX = `INSERT INTO mail_identity_registry
  (mail_id, sender_account_id, recipient_account_id, location, created_at,
   settled_at, archived_at, identity_digest, document_digest, reward_id,
   data_generation, revision) VALUES`;
const IDENTITY_INSERT_ROW_SQL = "(?, ?, ?, 'active', ?, ?, NULL, ?, ?, NULL, 1, 0)";
const COUNTER_INSERT_SQL_PREFIX = `INSERT INTO mail_active_counters
  (recipient_account_id, active_count, data_generation, revision) VALUES`;
const COUNTER_INSERT_ROW_SQL = "(?, ?, 1, 0)";
const READY_CONTROL_SQL = `UPDATE mail_storage_control
SET lifecycle_state = 'ready',
    bootstrap_cursor_mail_id = ?,
    reconciled_at = ?
WHERE scope_key = 'mail_lifecycle'
  AND schema_generation = 1
  AND data_generation = 1
  AND lifecycle_state = 'building'
  AND archive_enabled = 0
  AND vault_claim_enabled = 0
  AND active_limit_enabled = 0
  AND COALESCE(bootstrap_cursor_mail_id, '') = ?
  AND bootstrap_source_count = ?
  AND bootstrap_identity_count = ?
  AND bootstrap_recipient_count = ?
  AND bootstrap_active_count = ?
  AND source_digest = ?
  AND reconciled_at IS NULL`;

async function runMysqlMailStorageBootstrapApply(pool, options = {}) {
  if (options.maintenanceConfirmed !== true) {
    throw applyError("mail_storage_bootstrap_maintenance_confirmation_required");
  }
  if (typeof options.certifyAttachment !== "function") {
    throw applyError("mail_storage_bootstrap_attachment_certifier_missing");
  }
  const database = canonicalDatabase(options.database);
  const policy = maintenanceTransactionPolicy(options.transactionPolicy);
  const guardOptions = objectOrEmpty(options.transactionGuardOptions);
  const reconciledAt = canonicalApplyTimestamp(
    typeof options.now === "function" ? options.now() : new Date(),
  );
  let expected = null;
  try {
    return await runApplyTransaction(pool, {policy, guardOptions}, async (connection) => {
      const initialSnapshot = await readMysqlMailStorageBootstrapSnapshotFromConnection(
        connection,
        {database, lockRows: true},
      );
      const initial = inspectSnapshot(initialSnapshot, options.certifyAttachment);
      assertInspectionSafe(initial);
      expected = Object.freeze({
        sourceDigest: initial.plan.sourceDigest,
        planDigest: initial.plan.planDigest,
        beforeTargetDigest: initial.targetDigest,
        initialAction: initial.reconciliation.action,
        counts: initial.plan.counts,
      });

      if (initial.reconciliation.action === "already_ready") {
        return {
          commit: false,
          report: successReport(initial, {
            code: "mail_storage_bootstrap_already_ready",
            action: "already_ready",
            applied: false,
            recovered: false,
          }),
        };
      }
      if (initial.reconciliation.action === "start") {
        await exactWrite(connection, BUILDING_CONTROL_SQL, [
          initial.plan.counts.source,
          initial.plan.counts.identity,
          initial.plan.counts.recipient,
          initial.plan.counts.active,
          initial.plan.sourceDigest,
        ], "mail_storage_bootstrap_building_control_conflict");
      }
      if (!["start", "repair_missing", "finalize"].includes(initial.reconciliation.action)) {
        throw applyError("mail_storage_bootstrap_action_invalid");
      }

      await exactBatchWrites(
        connection,
        IDENTITY_INSERT_SQL_PREFIX,
        IDENTITY_INSERT_ROW_SQL,
        initial.reconciliation.missingIdentityRows.map((row) => [
          row.mailId,
          row.senderAccountId,
          row.recipientAccountId,
          row.createdAt,
          row.settledAt,
          row.identityDigest,
          row.documentDigest,
        ]),
        "mail_storage_bootstrap_identity_insert_conflict",
      );
      await exactBatchWrites(
        connection,
        COUNTER_INSERT_SQL_PREFIX,
        COUNTER_INSERT_ROW_SQL,
        initial.reconciliation.missingCounterRows.map((row) => [
          row.recipientAccountId,
          row.activeCount,
        ]),
        "mail_storage_bootstrap_counter_insert_conflict",
      );

      const filledSnapshot = await readMysqlMailStorageBootstrapSnapshotFromConnection(
        connection,
        {database, lockRows: true},
      );
      const filled = inspectSnapshot(filledSnapshot, options.certifyAttachment);
      assertSamePlan(initial, filled);
      assertInspectionSafe(filled);
      if (filled.reconciliation.action !== "finalize") {
        throw applyError("mail_storage_bootstrap_fill_reconciliation_failed");
      }
      const previousCursor = filledSnapshot.control.bootstrapCursorMailId;
      const readyCursor = filled.plan.lastMailId || null;
      await exactWrite(connection, READY_CONTROL_SQL, [
        readyCursor,
        reconciledAt,
        previousCursor,
        filled.plan.counts.source,
        filled.plan.counts.identity,
        filled.plan.counts.recipient,
        filled.plan.counts.active,
        filled.plan.sourceDigest,
      ], "mail_storage_bootstrap_ready_control_conflict");

      const readySnapshot = await readMysqlMailStorageBootstrapSnapshotFromConnection(
        connection,
        {database, lockRows: true},
      );
      const ready = inspectSnapshot(readySnapshot, options.certifyAttachment);
      assertSamePlan(initial, ready);
      assertInspectionSafe(ready);
      if (ready.reconciliation.action !== "already_ready") {
        throw applyError("mail_storage_bootstrap_ready_reconciliation_failed");
      }
      expected = Object.freeze({
        ...expected,
        readyTargetDigest: ready.targetDigest,
      });
      return {
        commit: true,
        report: successReport(ready, {
          code: "mail_storage_bootstrap_apply_ok",
          action: initial.reconciliation.action,
          applied: true,
          recovered: false,
        }),
      };
    });
  } catch (error) {
    if (
      !expected
      || String(error && error.code || "") !== MYSQL_COMMIT_OUTCOME_AMBIGUOUS
    ) {
      throw error;
    }
    return recoverAmbiguousCommit(pool, {
      database,
      policy,
      guardOptions,
      certifyAttachment: options.certifyAttachment,
      expected,
    });
  }
}

async function recoverAmbiguousCommit(pool, options) {
  let snapshot;
  try {
    // This must be a locking current read, not another MVCC-only snapshot. The
    // control-row FOR UPDATE waits until the connection whose COMMIT response
    // was lost has actually committed or rolled back; otherwise a fast reader
    // could observe the old version and incorrectly authorize a blind retry.
    snapshot = await runApplyTransaction(
      pool,
      {policy: options.policy, guardOptions: options.guardOptions},
      async (connection) => ({
        commit: false,
        report: await readMysqlMailStorageBootstrapSnapshotFromConnection(
          connection,
          {database: options.database, lockRows: true},
        ),
      }),
    );
  } catch {
    return ambiguousReport(options.expected, "mail_storage_bootstrap_commit_outcome_unknown");
  }
  let inspection;
  try {
    inspection = inspectSnapshot(snapshot, options.certifyAttachment);
  } catch {
    return ambiguousReport(options.expected, "mail_storage_bootstrap_commit_outcome_unknown");
  }
  const samePlan = inspection.plan.ok === true
    && inspection.verification.ok === true
    && inspection.plan.sourceDigest === options.expected.sourceDigest
    && inspection.plan.planDigest === options.expected.planDigest;
  if (
    samePlan
    && inspection.reconciliation.ok === true
    && inspection.reconciliation.action === "already_ready"
    && inspection.targetDigest === options.expected.readyTargetDigest
  ) {
    return successReport(inspection, {
      code: "mail_storage_bootstrap_apply_recovered",
      action: options.expected.initialAction,
      applied: true,
      recovered: true,
    });
  }
  if (
    samePlan
    && inspection.reconciliation.ok === true
    && inspection.targetDigest === options.expected.beforeTargetDigest
  ) {
    return deepFreeze({
      kind: MAIL_STORAGE_BOOTSTRAP_APPLY_KIND,
      schemaVersion: MAIL_STORAGE_BOOTSTRAP_APPLY_SCHEMA_VERSION,
      ok: false,
      code: "mail_storage_bootstrap_commit_not_applied",
      mode: "apply",
      action: options.expected.initialAction,
      applied: false,
      recovered: true,
      outcomeUnknown: false,
      retryable: true,
      featureFlagsEnabled: false,
      counts: safeCounts(options.expected.counts),
      digests: safeDigests(options.expected),
    });
  }
  return ambiguousReport(options.expected, "mail_storage_bootstrap_commit_outcome_unknown");
}

async function runApplyTransaction(pool, options, execute) {
  const connection = await checkoutMysqlConnection(
    pool,
    options.policy,
    options.guardOptions,
  );
  let deadline;
  try {
    deadline = createMysqlTransactionDeadlineController(
      connection,
      options.policy,
      options.guardOptions,
    );
  } catch (error) {
    safeRelease(connection, error);
    throw error;
  }
  let transactionStarted = false;
  let explicitRollbackDispatched = false;
  let connectionReusable = true;
  try {
    await deadline.track(connectionOperation(connection, "query", [TRANSACTION_ISOLATION_SQL]));
    await deadline.track(connectionOperation(connection, "beginTransaction"));
    transactionStarted = true;
    const result = await execute(deadlineConnection(connection, deadline));
    if (result.commit !== true) {
      explicitRollbackDispatched = true;
      await deadline.track(connectionOperation(connection, "rollback"), {classifyFailure: false});
      transactionStarted = false;
      deadline.complete();
      return result.report;
    }
    deadline.markCommitDispatched();
    await deadline.track(connectionOperation(connection, "commit"));
    transactionStarted = false;
    deadline.complete();
    return result.report;
  } catch (caughtError) {
    let error = caughtError;
    const commitDispatched = deadline.isCommitDispatched();
    const deadlineTerminated = deadline.isFinished();
    if (commitDispatched) {
      connectionReusable = false;
      if (!deadlineTerminated) destroyMysqlConnection(connection, error);
      error = classifyMysqlTransactionFailure(error, {commitDispatched: true});
    } else if (explicitRollbackDispatched) {
      connectionReusable = false;
      if (!deadlineTerminated) destroyMysqlConnection(connection, error);
      error = deterministicApplyError(error)
        ? decorateNoCommit(error, false)
        : classifyMysqlTransactionFailure(error, {commitDispatched: false});
    } else if (transactionStarted) {
      let rollbackCompleted = false;
      if (deadlineTerminated && error && error.timeout === true) {
        connectionReusable = false;
      } else {
        try {
          await deadline.track(
            connectionOperation(connection, "rollback"),
            {classifyFailure: false},
          );
          rollbackCompleted = true;
        } catch (rollbackError) {
          error.rollbackCause = rollbackError;
          connectionReusable = false;
          if (!deadline.isFinished()) destroyMysqlConnection(connection, rollbackError);
        }
      }
      error = deterministicApplyError(error)
        ? decorateNoCommit(error, rollbackCompleted)
        : classifyMysqlTransactionFailure(error, {rollbackCompleted});
    } else {
      connectionReusable = false;
      if (!deadlineTerminated) destroyMysqlConnection(connection, error);
      error = deterministicApplyError(error)
        ? decorateNoCommit(error, false)
        : classifyMysqlTransactionFailure(error, {commitDispatched: false});
    }
    throw error;
  } finally {
    deadline.complete();
    if (connectionReusable) safeRelease(connection);
  }
}

function inspectSnapshot(snapshotValue, certifyAttachment) {
  const snapshot = objectOrEmpty(snapshotValue);
  const plan = buildMailStorageBootstrapPlan({
    sourceRows: snapshot.sourceRows,
    certifyAttachment,
  });
  const verification = verifyMailStorageBootstrapPlan(plan, {certifyAttachment});
  const reconciliation = reconcileMailStorageBootstrapPlan(plan, {
    control: snapshot.control,
    identityRows: snapshot.identityRows,
    counterRows: snapshot.counterRows,
    archiveRows: snapshot.archiveRows,
    vaultRows: snapshot.vaultRows,
  }, {certifyAttachment});
  return {
    plan,
    verification,
    reconciliation,
    targetDigest: digestTargetSnapshot(snapshot),
  };
}

function assertInspectionSafe(inspection) {
  if (inspection.plan.ok !== true || inspection.plan.sourceSafe !== true) {
    throw applyError("mail_storage_bootstrap_source_unsafe");
  }
  if (inspection.verification.ok !== true) {
    throw applyError("mail_storage_bootstrap_plan_verification_failed");
  }
  if (inspection.reconciliation.ok !== true) {
    throw applyError("mail_storage_bootstrap_target_conflict");
  }
}

function assertSamePlan(expected, actual) {
  if (
    actual.plan.sourceDigest !== expected.plan.sourceDigest
    || actual.plan.planDigest !== expected.plan.planDigest
  ) {
    throw applyError("mail_storage_bootstrap_locked_source_drift");
  }
}

async function exactWrite(connection, sql, params, conflictCode) {
  let result;
  try {
    result = await connection.query(sql, params);
  } catch (error) {
    if (error && error.code === "ER_DUP_ENTRY") {
      throw applyError(conflictCode);
    }
    throw error;
  }
  if (affectedRows(result) !== 1) {
    throw applyError(conflictCode);
  }
}

async function exactBatchWrites(connection, sqlPrefix, rowSql, paramRows, conflictCode) {
  for (let start = 0; start < paramRows.length; start += BOOTSTRAP_INSERT_BATCH_SIZE) {
    const batch = paramRows.slice(start, start + BOOTSTRAP_INSERT_BATCH_SIZE);
    const sql = `${sqlPrefix}\n${batch.map(() => rowSql).join(",\n")}`;
    let result;
    try {
      result = await connection.query(sql, batch.flat());
    } catch (error) {
      if (error && error.code === "ER_DUP_ENTRY") {
        throw applyError(conflictCode);
      }
      throw error;
    }
    if (affectedRows(result) !== batch.length) {
      throw applyError(conflictCode);
    }
  }
}

function deadlineConnection(connection, deadline) {
  return Object.freeze({
    query(...args) {
      return deadline.track(connectionOperation(connection, "query", args), {
        classifyFailure: false,
      });
    },
  });
}

function connectionOperation(connection, method, args = []) {
  try {
    return Promise.resolve(connection[method](...args));
  } catch (error) {
    return Promise.reject(error);
  }
}

function affectedRows(result) {
  const header = Array.isArray(result) ? result[0] : result;
  return Number(header && header.affectedRows);
}

function successReport(inspection, options) {
  return deepFreeze({
    kind: MAIL_STORAGE_BOOTSTRAP_APPLY_KIND,
    schemaVersion: MAIL_STORAGE_BOOTSTRAP_APPLY_SCHEMA_VERSION,
    ok: true,
    code: options.code,
    mode: "apply",
    action: options.action,
    applied: options.applied === true,
    recovered: options.recovered === true,
    outcomeUnknown: false,
    retryable: false,
    featureFlagsEnabled: false,
    counts: safeCounts(inspection.plan.counts),
    digests: {
      source: safeDigest(inspection.plan.sourceDigest),
      plan: safeDigest(inspection.plan.planDigest),
      target: safeDigest(inspection.targetDigest),
    },
  });
}

function ambiguousReport(expected, code) {
  return deepFreeze({
    kind: MAIL_STORAGE_BOOTSTRAP_APPLY_KIND,
    schemaVersion: MAIL_STORAGE_BOOTSTRAP_APPLY_SCHEMA_VERSION,
    ok: false,
    code,
    mode: "apply",
    action: expected.initialAction,
    applied: false,
    recovered: false,
    outcomeUnknown: true,
    retryable: false,
    featureFlagsEnabled: false,
    counts: safeCounts(expected.counts),
    digests: safeDigests(expected),
  });
}

function safeDigests(value) {
  return {
    source: safeDigest(value.sourceDigest),
    plan: safeDigest(value.planDigest),
    target: safeDigest(value.beforeTargetDigest),
  };
}

function safeDigest(value) {
  const text = String(value || "");
  return /^[a-f0-9]{64}$/.test(text) ? text : "";
}

function safeCounts(value) {
  const counts = objectOrEmpty(value);
  return {
    source: safeCount(counts.source),
    identity: safeCount(counts.identity),
    recipient: safeCount(counts.recipient),
    active: safeCount(counts.active),
  };
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function maintenanceTransactionPolicy(value) {
  const source = objectOrEmpty(value);
  return normalizeMysqlTransactionPolicy({
    ...source,
    transactionTimeoutMs: source.transactionTimeoutMs ?? 60000,
  });
}

function canonicalDatabase(value) {
  const database = String(value || "").trim();
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw applyError("mail_storage_bootstrap_database_invalid");
  }
  return database;
}

function canonicalApplyTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) {
    throw applyError("mail_storage_bootstrap_timestamp_invalid");
  }
  return date.toISOString();
}

function deterministicApplyError(error) {
  const code = String(error && error.code || "");
  return code.startsWith("mail_storage_bootstrap_")
    || code.startsWith("mysql_mail_storage_")
    || code === MYSQL_TRANSACTION_ROLLED_BACK;
}

function decorateNoCommit(error, rollbackCompleted) {
  error.transactionPhase = "rolled_back";
  error.outcomeUnknown = false;
  error.noCommitGuaranteed = true;
  error.rollbackConfirmed = rollbackCompleted === true;
  error.retryable = String(error && error.code || "") === MYSQL_TRANSACTION_ROLLED_BACK;
  return error;
}

function safeRelease(connection, primaryError = null) {
  try {
    connection.release();
  } catch (error) {
    destroyMysqlConnection(connection, error);
    if (primaryError) {
      primaryError.releaseCause = error;
    }
  }
}

function applyError(code) {
  const error = new Error("MySQL 邮箱 bootstrap apply 未满足安全合同。");
  error.code = String(code || "mail_storage_bootstrap_apply_failed");
  return error;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

module.exports = {
  MAIL_STORAGE_BOOTSTRAP_APPLY_KIND,
  MAIL_STORAGE_BOOTSTRAP_APPLY_SCHEMA_VERSION,
  runMysqlMailStorageBootstrapApply,
};
