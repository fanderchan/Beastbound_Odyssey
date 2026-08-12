"use strict";

const {isDeepStrictEqual} = require("node:util");

const {
  buildMailStorageBootstrapPlan,
  verifyMailStorageBootstrapPlan,
} = require("./mysql-mail-storage-bootstrap-plan");
const {
  MYSQL_COMMIT_OUTCOME_AMBIGUOUS,
  MYSQL_TRANSACTION_ROLLED_BACK,
  checkoutMysqlConnection,
  classifyMysqlTransactionFailure,
  createMysqlTransactionDeadlineController,
  destroyMysqlConnection,
  normalizeMysqlTransactionPolicy,
} = require("./mysql-transaction-guard");

const MAIL_ARCHIVE_FEATURE_ENABLE_KIND = "beastbound_mail_archive_feature_enable";
const MAIL_ARCHIVE_FEATURE_ENABLE_SCHEMA_VERSION = 1;
const TRANSACTION_ISOLATION_SQL = "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ";
const CONTROL_READ_SQL = `SELECT scope_key, schema_generation, data_generation,
  lifecycle_state, archive_enabled, vault_claim_enabled, active_limit_enabled,
  COALESCE(bootstrap_cursor_mail_id, '') AS bootstrap_cursor_mail_id,
  bootstrap_source_count, bootstrap_identity_count, bootstrap_recipient_count,
  bootstrap_active_count, COALESCE(source_digest, '') AS source_digest,
  COALESCE(reconciled_at, '') AS reconciled_at
  FROM mail_storage_control WHERE scope_key = 'mail_lifecycle' FOR UPDATE`;
const CONTROL_ENABLE_SQL = `UPDATE mail_storage_control SET archive_enabled = 1
  WHERE scope_key = 'mail_lifecycle'
    AND schema_generation = 1 AND data_generation = 1 AND lifecycle_state = 'ready'
    AND archive_enabled = 0 AND vault_claim_enabled = 0 AND active_limit_enabled = 0
    AND bootstrap_source_count = bootstrap_identity_count
    AND bootstrap_identity_count = bootstrap_active_count
    AND bootstrap_recipient_count <= bootstrap_active_count
    AND source_digest IS NOT NULL AND reconciled_at IS NOT NULL`;
const SOURCE_LOCK_SQL = `SELECT mail_id, sender_account_id, recipient_account_id,
  title, created_at, read_at, document_json
  FROM mail_messages ORDER BY mail_id FOR UPDATE`;
const IDENTITY_LOCK_SQL = `SELECT mail_id, sender_account_id, recipient_account_id,
  location, created_at, settled_at, archived_at, identity_digest, document_digest,
  reward_id, data_generation, revision
  FROM mail_identity_registry ORDER BY mail_id FOR UPDATE`;
const COUNTER_LOCK_SQL = `SELECT recipient_account_id, active_count,
  data_generation, revision
  FROM mail_active_counters ORDER BY recipient_account_id FOR UPDATE`;
const ARCHIVE_LOCK_SQL = `SELECT mail_id
  FROM mail_archive_messages ORDER BY mail_id FOR UPDATE`;
const VAULT_LOCK_SQL = `SELECT reward_id
  FROM reward_vault_entries ORDER BY reward_id FOR UPDATE`;

async function runMysqlMailArchiveFeatureEnable(pool, options = {}) {
  if (options.maintenanceConfirmed !== true) {
    throw featureError("mail_archive_feature_maintenance_confirmation_required");
  }
  if (typeof options.certifyAttachment !== "function") {
    throw featureError("mail_archive_feature_attachment_certifier_missing");
  }
  const policy = normalizeMysqlTransactionPolicy({
    ...objectOrEmpty(options.transactionPolicy),
    transactionTimeoutMs: objectOrEmpty(options.transactionPolicy).transactionTimeoutMs ?? 60000,
  });
  const guardOptions = objectOrEmpty(options.transactionGuardOptions);
  let expected = null;
  try {
    return await runTransaction(pool, {policy, guardOptions}, async (connection) => {
      const before = exactControl(await queryRows(connection, CONTROL_READ_SQL));
      const state = classifyControl(before);
      if (state === "enabled") {
        return {
          commit: false,
          value: report("mail_archive_feature_already_enabled", false, false),
        };
      }
      if (state !== "disabled_ready") {
        throw featureError("mail_archive_feature_control_not_ready");
      }
      certifyPreEnableSnapshot({
        sourceRows: await queryRows(connection, SOURCE_LOCK_SQL),
        identityRows: await queryRows(connection, IDENTITY_LOCK_SQL),
        counterRows: await queryRows(connection, COUNTER_LOCK_SQL),
        archiveRows: await queryRows(connection, ARCHIVE_LOCK_SQL),
        vaultRows: await queryRows(connection, VAULT_LOCK_SQL),
      }, before, options.certifyAttachment);
      expected = before;
      await exactWrite(connection, CONTROL_ENABLE_SQL, "mail_archive_feature_enable_conflict");
      const after = exactControl(await queryRows(connection, CONTROL_READ_SQL));
      if (!isExactEnabledTransition(before, after)) {
        throw featureError("mail_archive_feature_readback_invalid");
      }
      return {
        commit: true,
        value: report("mail_archive_feature_enable_ok", true, false),
      };
    });
  } catch (error) {
    if (!expected || String(error && error.code || "") !== MYSQL_COMMIT_OUTCOME_AMBIGUOUS) {
      throw error;
    }
    return recoverFeatureEnable(pool, {policy, guardOptions}, expected);
  }
}

function certifyPreEnableSnapshot(snapshot, control, certifyAttachment) {
  const sourceRows = Array.isArray(snapshot && snapshot.sourceRows) ? snapshot.sourceRows : null;
  const identityRows = Array.isArray(snapshot && snapshot.identityRows) ? snapshot.identityRows : null;
  const counterRows = Array.isArray(snapshot && snapshot.counterRows) ? snapshot.counterRows : null;
  const archiveRows = Array.isArray(snapshot && snapshot.archiveRows) ? snapshot.archiveRows : null;
  const vaultRows = Array.isArray(snapshot && snapshot.vaultRows) ? snapshot.vaultRows : null;
  if (!sourceRows || !identityRows || !counterRows || !archiveRows || !vaultRows) {
    throw featureError("mail_archive_feature_snapshot_invalid");
  }
  if (archiveRows.length !== 0 || vaultRows.length !== 0) {
    throw featureError("mail_archive_feature_pre_enable_sidecars_not_empty");
  }
  const plan = buildMailStorageBootstrapPlan({sourceRows, certifyAttachment});
  const verification = verifyMailStorageBootstrapPlan(plan, {certifyAttachment});
  if (plan.ok !== true || verification.ok !== true) {
    throw featureError("mail_archive_feature_source_certification_failed");
  }
  if (
    Number(control.bootstrap_source_count) > plan.counts.source
    || Number(control.bootstrap_identity_count) > plan.counts.identity
    || Number(control.bootstrap_active_count) > plan.counts.active
    || Number(control.bootstrap_recipient_count) > plan.counts.recipient
    || (Number(control.bootstrap_source_count) === 0
      ? String(control.bootstrap_cursor_mail_id || "") !== ""
      : !plan.sourceRows.some((row) => row.mailId === control.bootstrap_cursor_mail_id))
  ) {
    throw featureError("mail_archive_feature_bootstrap_history_drift");
  }

  const expectedIdentityByMailId = new Map(plan.identityRows.map((row) => [row.mailId, row]));
  const observedIdentityByMailId = strictRows(
    identityRows,
    (row) => String(row && row.mail_id || ""),
    "mail_archive_feature_identity_rows_invalid",
  );
  if (observedIdentityByMailId.size !== expectedIdentityByMailId.size) {
    throw featureError("mail_archive_feature_identity_rows_invalid");
  }
  for (const [mailId, expected] of expectedIdentityByMailId) {
    const observed = activationIdentity(observedIdentityByMailId.get(mailId));
    if (!observed || !isDeepStrictEqual(observed, {
      ...expected,
      revision: observed.revision,
    })) {
      throw featureError("mail_archive_feature_identity_rows_invalid");
    }
  }

  const expectedCounterByRecipient = new Map(
    plan.counterRows.map((row) => [row.recipientAccountId, row]),
  );
  const observedCounterByRecipient = strictRows(
    counterRows,
    (row) => String(row && row.recipient_account_id || ""),
    "mail_archive_feature_counter_rows_invalid",
  );
  if (observedCounterByRecipient.size !== expectedCounterByRecipient.size) {
    throw featureError("mail_archive_feature_counter_rows_invalid");
  }
  for (const [recipientAccountId, expected] of expectedCounterByRecipient) {
    const observed = activationCounter(observedCounterByRecipient.get(recipientAccountId));
    if (!observed || !isDeepStrictEqual(observed, {
      ...expected,
      revision: observed.revision,
    })) {
      throw featureError("mail_archive_feature_counter_rows_invalid");
    }
  }
  return Object.freeze({
    activeCount: plan.counts.active,
    recipientCount: plan.counts.recipient,
    sourceDigest: plan.sourceDigest,
  });
}

function activationIdentity(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const revision = nonNegativeInteger(row.revision);
  if (revision === null || !exactFieldSet(row, [
    "mail_id",
    "sender_account_id",
    "recipient_account_id",
    "location",
    "created_at",
    "settled_at",
    "archived_at",
    "identity_digest",
    "document_digest",
    "reward_id",
    "data_generation",
    "revision",
  ])) return null;
  return {
    mailId: String(row.mail_id || ""),
    senderAccountId: String(row.sender_account_id || ""),
    recipientAccountId: String(row.recipient_account_id || ""),
    location: String(row.location || ""),
    createdAt: String(row.created_at || ""),
    settledAt: row.settled_at === null ? null : String(row.settled_at || ""),
    archivedAt: row.archived_at === null ? null : String(row.archived_at || ""),
    identityDigest: String(row.identity_digest || ""),
    documentDigest: String(row.document_digest || ""),
    rewardId: row.reward_id === null ? null : String(row.reward_id || ""),
    dataGeneration: Number(row.data_generation),
    revision,
  };
}

function activationCounter(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const activeCount = nonNegativeInteger(row.active_count);
  const revision = nonNegativeInteger(row.revision);
  if (activeCount === null || revision === null || !exactFieldSet(row, [
    "recipient_account_id",
    "active_count",
    "data_generation",
    "revision",
  ])) return null;
  return {
    recipientAccountId: String(row.recipient_account_id || ""),
    activeCount,
    dataGeneration: Number(row.data_generation),
    revision,
  };
}

function exactFieldSet(value, fields) {
  const expected = new Set(fields);
  return Object.keys(value).length === expected.size
    && Object.keys(value).every((field) => expected.has(field));
}

function strictRows(rows, keyFor, code) {
  const result = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    if (key === "" || result.has(key)) throw featureError(code);
    result.set(key, row);
  }
  return result;
}

async function recoverFeatureEnable(pool, options, before) {
  try {
    const current = await runTransaction(pool, options, async (connection) => ({
      commit: false,
      value: exactControl(await queryRows(connection, CONTROL_READ_SQL)),
    }));
    if (isExactEnabledTransition(before, current)) {
      return report("mail_archive_feature_enable_commit_recovered", true, true);
    }
    if (sameControl(before, current)) {
      return report("mail_archive_feature_enable_not_committed", false, true, {
        ok: false,
        retryable: true,
      });
    }
  } catch {
    // Fixed unknown result below. Never authorize a blind retry on drift.
  }
  return report("mail_archive_feature_enable_outcome_unknown", false, false, {
    ok: false,
    outcomeUnknown: true,
  });
}

function classifyControl(row) {
  if (!baseReadyControl(row)) return "invalid";
  if (Number(row.archive_enabled) === 0) return "disabled_ready";
  if (Number(row.archive_enabled) === 1) return "enabled";
  return "invalid";
}

function baseReadyControl(row) {
  return String(row && row.scope_key || "") === "mail_lifecycle"
    && Number(row.schema_generation) === 1
    && Number(row.data_generation) === 1
    && String(row.lifecycle_state || "") === "ready"
    && [0, 1].includes(Number(row.archive_enabled))
    && Number(row.vault_claim_enabled) === 0
    && Number(row.active_limit_enabled) === 0
    && nonNegativeInteger(row.bootstrap_source_count) !== null
    && Number(row.bootstrap_source_count) === Number(row.bootstrap_identity_count)
    && Number(row.bootstrap_identity_count) === Number(row.bootstrap_active_count)
    && Number(row.bootstrap_recipient_count) <= Number(row.bootstrap_active_count)
    && /^[a-f0-9]{64}$/.test(String(row.source_digest || ""))
    && canonicalIsoTimestamp(row.reconciled_at) !== "";
}

function isExactEnabledTransition(before, after) {
  return baseReadyControl(before)
    && Number(before.archive_enabled) === 0
    && baseReadyControl(after)
    && Number(after.archive_enabled) === 1
    && Object.keys(before).length === Object.keys(after).length
    && Object.keys(before).every((field) => (
      field === "archive_enabled"
      || field === "updated_at"
      || scalarEquals(before[field], after[field])
    ));
}

function sameControl(left, right) {
  return left && right
    && Object.keys(left).length === Object.keys(right).length
    && Object.keys(left).every((field) => scalarEquals(left[field], right[field]));
}

function scalarEquals(left, right) {
  if (typeof left === "number" || typeof right === "number") {
    return Number(left) === Number(right);
  }
  return String(left ?? "") === String(right ?? "");
}

async function runTransaction(pool, options, execute) {
  const connection = await checkoutMysqlConnection(pool, options.policy, options.guardOptions);
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
  let started = false;
  let reusable = true;
  try {
    await deadline.track(operation(connection, "query", [TRANSACTION_ISOLATION_SQL]));
    await deadline.track(operation(connection, "beginTransaction"));
    started = true;
    const outcome = await execute(deadlineConnection(connection, deadline));
    if (!outcome || typeof outcome.commit !== "boolean" || !Object.hasOwn(outcome, "value")) {
      throw featureError("mail_archive_feature_transaction_result_invalid");
    }
    if (!outcome.commit) {
      await deadline.track(operation(connection, "rollback"), {classifyFailure: false});
      started = false;
      deadline.complete();
      return outcome.value;
    }
    deadline.markCommitDispatched();
    await deadline.track(operation(connection, "commit"));
    started = false;
    deadline.complete();
    return outcome.value;
  } catch (caught) {
    let error = caught;
    const commitDispatched = deadline.isCommitDispatched();
    const terminated = deadline.isFinished();
    if (commitDispatched) {
      reusable = false;
      if (!terminated) destroyMysqlConnection(connection, error);
      error = classifyMysqlTransactionFailure(error, {commitDispatched: true});
    } else if (started) {
      let rollbackCompleted = false;
      if (terminated && error && error.timeout === true) {
        reusable = false;
      } else {
        try {
          await deadline.track(operation(connection, "rollback"), {classifyFailure: false});
          rollbackCompleted = true;
        } catch (rollbackError) {
          error.rollbackCause = rollbackError;
          reusable = false;
          if (!deadline.isFinished()) destroyMysqlConnection(connection, rollbackError);
        }
      }
      error = deterministicFeatureError(error)
        ? decorateNoCommit(error, rollbackCompleted)
        : classifyMysqlTransactionFailure(error, {rollbackCompleted});
    } else {
      reusable = false;
      if (!terminated) destroyMysqlConnection(connection, error);
      error = deterministicFeatureError(error)
        ? decorateNoCommit(error, false)
        : classifyMysqlTransactionFailure(error, {commitDispatched: false});
    }
    throw error;
  } finally {
    deadline.complete();
    if (reusable) safeRelease(connection);
  }
}

function deadlineConnection(connection, deadline) {
  return Object.freeze({
    query(...args) {
      return deadline.track(operation(connection, "query", args), {classifyFailure: false});
    },
  });
}

function operation(connection, method, args = []) {
  try {
    return Promise.resolve(connection[method](...args));
  } catch (error) {
    return Promise.reject(error);
  }
}

async function queryRows(connection, sql) {
  const result = await connection.query(sql);
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  if (!Array.isArray(rows)) throw featureError("mail_archive_feature_query_result_invalid");
  return rows;
}

function exactControl(rows) {
  if (rows.length !== 1 || !rows[0] || typeof rows[0] !== "object") {
    throw featureError("mail_archive_feature_control_row_invalid");
  }
  return structuredClone(rows[0]);
}

async function exactWrite(connection, sql, code) {
  const result = await connection.query(sql);
  const header = Array.isArray(result) ? result[0] : result;
  if (Number(header && header.affectedRows) !== 1) throw featureError(code);
}

function report(code, enabled, recovered, overrides = {}) {
  return Object.freeze({
    kind: MAIL_ARCHIVE_FEATURE_ENABLE_KIND,
    schemaVersion: MAIL_ARCHIVE_FEATURE_ENABLE_SCHEMA_VERSION,
    ok: overrides.ok !== false,
    code,
    enabled: enabled === true,
    recovered: recovered === true,
    outcomeUnknown: overrides.outcomeUnknown === true,
    retryable: overrides.retryable === true,
  });
}

function canonicalIsoTimestamp(value) {
  if (typeof value !== "string" || value === "" || value !== value.trim()) return "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? value : "";
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function deterministicFeatureError(error) {
  const code = String(error && error.code || "");
  return code.startsWith("mail_archive_feature_") || code === MYSQL_TRANSACTION_ROLLED_BACK;
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
    if (primaryError) primaryError.releaseCause = error;
  }
}

function featureError(code) {
  const error = new Error("MySQL 邮件只读归档开关未满足安全合同。");
  error.code = String(code || "mail_archive_feature_enable_failed");
  return error;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {
  MAIL_ARCHIVE_FEATURE_ENABLE_KIND,
  MAIL_ARCHIVE_FEATURE_ENABLE_SCHEMA_VERSION,
  runMysqlMailArchiveFeatureEnable,
};
