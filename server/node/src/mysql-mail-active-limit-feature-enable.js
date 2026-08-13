"use strict";

const {
  MAIL_ACTIVE_LIMIT_CAPACITY,
} = require("./mysql-resource-acquisition-order");
const {
  certifyMailArchiveFeatureSnapshot,
} = require("./mysql-mail-archive-feature-enable");
const {
  certifyMysqlRewardVaultRow,
} = require("./mysql-reward-vault");
const {
  MYSQL_COMMIT_OUTCOME_AMBIGUOUS,
  MYSQL_TRANSACTION_ROLLED_BACK,
  checkoutMysqlConnection,
  classifyMysqlTransactionFailure,
  createMysqlTransactionDeadlineController,
  destroyMysqlConnection,
  normalizeMysqlTransactionPolicy,
} = require("./mysql-transaction-guard");

const MAIL_ACTIVE_LIMIT_FEATURE_ENABLE_KIND = "beastbound_mail_active_limit_feature_enable";
const MAIL_ACTIVE_LIMIT_FEATURE_ENABLE_SCHEMA_VERSION = 1;
const TRANSACTION_ISOLATION_SQL = "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ";
const CONTROL_READ_SQL = `SELECT scope_key, schema_generation, data_generation,
  lifecycle_state, archive_enabled, vault_claim_enabled, active_limit_enabled,
  COALESCE(bootstrap_cursor_mail_id, '') AS bootstrap_cursor_mail_id,
  bootstrap_source_count, bootstrap_identity_count, bootstrap_recipient_count,
  bootstrap_active_count, COALESCE(source_digest, '') AS source_digest,
  COALESCE(reconciled_at, '') AS reconciled_at
  FROM mail_storage_control WHERE scope_key = 'mail_lifecycle' FOR UPDATE`;
const CONTROL_ENABLE_SQL = `UPDATE mail_storage_control SET active_limit_enabled = 1
  WHERE scope_key = 'mail_lifecycle'
    AND schema_generation = 1 AND data_generation = 1 AND lifecycle_state = 'ready'
    AND archive_enabled = ? AND vault_claim_enabled = 1 AND active_limit_enabled = 0
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
const ARCHIVE_LOCK_SQL = `SELECT mail_id, sender_account_id, recipient_account_id,
  title, created_at, read_at, settled_at, archived_at, archive_generation, document_json
  FROM mail_archive_messages ORDER BY mail_id FOR UPDATE`;
const VAULT_LOCK_SQL = `SELECT reward_id, source_key, source_kind, source_digest,
  recipient_account_id, status, created_at, updated_at, delivered_at, claimed_at,
  delivered_mail_id, data_generation, revision, document_json
  FROM reward_vault_entries ORDER BY reward_id FOR UPDATE`;

async function runMysqlMailActiveLimitFeatureEnable(pool, options = {}) {
  if (options.maintenanceConfirmed !== true) {
    throw featureError("mail_active_limit_feature_maintenance_confirmation_required");
  }
  if (typeof options.certifyAttachment !== "function") {
    throw featureError("mail_active_limit_feature_attachment_certifier_missing");
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
        return {commit: false, value: report("mail_active_limit_feature_already_enabled", true, false)};
      }
      if (state !== "disabled_ready") {
        throw featureError("mail_active_limit_feature_control_not_ready");
      }
      const snapshot = {
        sourceRows: await queryRows(connection, SOURCE_LOCK_SQL),
        identityRows: await queryRows(connection, IDENTITY_LOCK_SQL),
        counterRows: await queryRows(connection, COUNTER_LOCK_SQL),
        archiveRows: await queryRows(connection, ARCHIVE_LOCK_SQL),
        vaultRows: await queryRows(connection, VAULT_LOCK_SQL),
      };
      try {
        certifyMailArchiveFeatureSnapshot(
          snapshot,
          before,
          options.certifyAttachment,
          {
            allowArchiveHistory: true,
            allowVaultHistory: true,
            certifyVaultRows: (vaultRows, identityRows) => certifyVaultHistory(
              vaultRows,
              identityRows,
              options.certifyAttachment,
            ),
          },
        );
        assertRecipientCountsWithinLimit(snapshot.counterRows);
      } catch (cause) {
        const error = featureError("mail_active_limit_feature_snapshot_certification_failed");
        error.cause = cause;
        throw error;
      }
      expected = before;
      await exactWrite(
        connection,
        CONTROL_ENABLE_SQL,
        [Number(before.archive_enabled)],
        "mail_active_limit_feature_enable_conflict",
      );
      const after = exactControl(await queryRows(connection, CONTROL_READ_SQL));
      if (!isExactEnabledTransition(before, after)) {
        throw featureError("mail_active_limit_feature_readback_invalid");
      }
      return {commit: true, value: report("mail_active_limit_feature_enable_ok", true, false)};
    });
  } catch (error) {
    if (!expected || String(error && error.code || "") !== MYSQL_COMMIT_OUTCOME_AMBIGUOUS) {
      throw error;
    }
    return recoverFeatureEnable(pool, {policy, guardOptions}, expected);
  }
}

function certifyVaultHistory(rows, identityRows, certifyAttachment) {
  const identityByMailId = new Map();
  for (const row of identityRows) {
    const mailId = String(row && row.mail_id || "");
    if (mailId === "" || identityByMailId.has(mailId)) {
      throw featureError("mail_active_limit_feature_identity_rows_invalid");
    }
    identityByMailId.set(mailId, row);
  }
  const rewardById = new Map();
  const sourceIdentities = new Set();
  for (const row of rows) {
    const rewardId = String(row && row.reward_id || "");
    const recipientAccountId = String(row && row.recipient_account_id || "");
    let entry;
    try {
      entry = certifyMysqlRewardVaultRow(row, recipientAccountId, rewardId, {
        certifyAttachment,
      });
    } catch (cause) {
      const error = featureError("mail_active_limit_feature_vault_rows_invalid");
      error.cause = cause;
      throw error;
    }
    const sourceIdentity = JSON.stringify([
      entry.recipientAccountId,
      entry.sourceKind,
      entry.sourceKey,
    ]);
    if (rewardById.has(entry.rewardId) || sourceIdentities.has(sourceIdentity)) {
      throw featureError("mail_active_limit_feature_vault_rows_invalid");
    }
    rewardById.set(entry.rewardId, entry);
    sourceIdentities.add(sourceIdentity);
    if (entry.deliveredMailId !== null) {
      const identity = identityByMailId.get(entry.deliveredMailId);
      if (
        !identity
        || String(identity.reward_id || "") !== entry.rewardId
        || String(identity.recipient_account_id || "") !== entry.recipientAccountId
        || !["active", "archive"].includes(String(identity.location || ""))
      ) {
        throw featureError("mail_active_limit_feature_vault_mail_link_invalid");
      }
    }
  }
  for (const identity of identityRows) {
    const rewardId = identity && identity.reward_id === null
      ? null
      : String(identity && identity.reward_id || "");
    if (rewardId === null) continue;
    const reward = rewardById.get(rewardId);
    if (!reward || reward.deliveredMailId !== String(identity.mail_id || "")) {
      throw featureError("mail_active_limit_feature_vault_mail_link_invalid");
    }
  }
}

function assertRecipientCountsWithinLimit(rows) {
  for (const row of rows) {
    const activeCount = Number(row && row.active_count);
    if (!Number.isSafeInteger(activeCount) || activeCount < 0 || activeCount > MAIL_ACTIVE_LIMIT_CAPACITY) {
      throw featureError("mail_active_limit_feature_recipient_over_capacity");
    }
  }
}

async function recoverFeatureEnable(pool, options, before) {
  try {
    const current = await runTransaction(pool, options, async (connection) => ({
      commit: false,
      value: exactControl(await queryRows(connection, CONTROL_READ_SQL)),
    }));
    if (isExactEnabledTransition(before, current)) {
      return report("mail_active_limit_feature_enable_commit_recovered", true, true);
    }
    if (sameControl(before, current)) {
      return report("mail_active_limit_feature_enable_not_committed", false, true, {
        ok: false,
        retryable: true,
      });
    }
  } catch {}
  return report("mail_active_limit_feature_enable_outcome_unknown", false, false, {
    ok: false,
    outcomeUnknown: true,
  });
}

function classifyControl(row) {
  if (!baseReadyControl(row)) return "invalid";
  return Number(row.active_limit_enabled) === 1 ? "enabled" : "disabled_ready";
}

function baseReadyControl(row) {
  return String(row && row.scope_key || "") === "mail_lifecycle"
    && Number(row.schema_generation) === 1
    && Number(row.data_generation) === 1
    && String(row.lifecycle_state || "") === "ready"
    && [0, 1].includes(Number(row.archive_enabled))
    && Number(row.vault_claim_enabled) === 1
    && [0, 1].includes(Number(row.active_limit_enabled))
    && nonNegativeInteger(row.bootstrap_source_count) !== null
    && Number(row.bootstrap_source_count) === Number(row.bootstrap_identity_count)
    && Number(row.bootstrap_identity_count) === Number(row.bootstrap_active_count)
    && Number(row.bootstrap_recipient_count) <= Number(row.bootstrap_active_count)
    && /^[a-f0-9]{64}$/.test(String(row.source_digest || ""))
    && canonicalIsoTimestamp(row.reconciled_at) !== "";
}

function isExactEnabledTransition(before, after) {
  return baseReadyControl(before)
    && Number(before.active_limit_enabled) === 0
    && baseReadyControl(after)
    && Number(after.active_limit_enabled) === 1
    && Object.keys(before).length === Object.keys(after).length
    && Object.keys(before).every((field) => (
      field === "active_limit_enabled"
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
  if (typeof left === "number" || typeof right === "number") return Number(left) === Number(right);
  return String(left ?? "") === String(right ?? "");
}

async function runTransaction(pool, options, execute) {
  const connection = await checkoutMysqlConnection(pool, options.policy, options.guardOptions);
  let deadline;
  try {
    deadline = createMysqlTransactionDeadlineController(connection, options.policy, options.guardOptions);
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
      throw featureError("mail_active_limit_feature_transaction_result_invalid");
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
  try { return Promise.resolve(connection[method](...args)); } catch (error) { return Promise.reject(error); }
}

async function queryRows(connection, sql) {
  const result = await connection.query(sql);
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  if (!Array.isArray(rows)) throw featureError("mail_active_limit_feature_query_result_invalid");
  return rows;
}

function exactControl(rows) {
  if (rows.length !== 1 || !rows[0] || typeof rows[0] !== "object") {
    throw featureError("mail_active_limit_feature_control_row_invalid");
  }
  return structuredClone(rows[0]);
}

async function exactWrite(connection, sql, params, code) {
  const result = await connection.query(sql, params);
  const header = Array.isArray(result) ? result[0] : result;
  if (Number(header && header.affectedRows) !== 1) throw featureError(code);
}

function report(code, enabled, recovered, overrides = {}) {
  return Object.freeze({
    kind: MAIL_ACTIVE_LIMIT_FEATURE_ENABLE_KIND,
    schemaVersion: MAIL_ACTIVE_LIMIT_FEATURE_ENABLE_SCHEMA_VERSION,
    ok: overrides.ok !== false,
    code,
    enabled: enabled === true,
    capacity: MAIL_ACTIVE_LIMIT_CAPACITY,
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
  return code.startsWith("mail_active_limit_feature_") || code === MYSQL_TRANSACTION_ROLLED_BACK;
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
  try { connection.release(); } catch (error) {
    destroyMysqlConnection(connection, error);
    if (primaryError) primaryError.releaseCause = error;
  }
}

function featureError(code) {
  const error = new Error("MySQL 活动邮箱容量开关未满足安全合同。");
  error.code = String(code || "mail_active_limit_feature_enable_failed");
  return error;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {
  __assertRecipientCountsWithinLimitForTest: assertRecipientCountsWithinLimit,
  MAIL_ACTIVE_LIMIT_FEATURE_ENABLE_KIND,
  MAIL_ACTIVE_LIMIT_FEATURE_ENABLE_SCHEMA_VERSION,
  runMysqlMailActiveLimitFeatureEnable,
};
