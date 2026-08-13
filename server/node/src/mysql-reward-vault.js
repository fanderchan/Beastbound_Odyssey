"use strict";

const {
  canonicalRewardVaultPageResult,
  encodeRewardVaultCursor,
  normalizeRewardVaultPageOptions,
} = require("./auth/reward-vault-pagination");
const {
  MAX_REWARD_ID_LENGTH,
  canonicalRewardVaultEntry,
} = require("./auth/reward-vault-state");
const {
  checkoutMysqlConnection,
  classifyMysqlTransactionFailure,
  createMysqlTransactionDeadlineController,
  destroyMysqlConnection,
  normalizeMysqlTransactionPolicy,
} = require("./mysql-transaction-guard");

const MAIL_STORAGE_SCOPE_KEY = "mail_lifecycle";
const TRANSACTION_ISOLATION_SQL = "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ";
const CONTROL_LOCK_SQL = `SELECT scope_key, schema_generation, data_generation,
  lifecycle_state, archive_enabled, vault_claim_enabled, active_limit_enabled
  FROM mail_storage_control WHERE scope_key = ? FOR SHARE`;
const REWARD_COLUMNS_SQL = `reward_id, source_key, source_kind, source_digest,
  recipient_account_id, status, created_at, updated_at, delivered_at, claimed_at,
  delivered_mail_id, data_generation, revision, document_json`;

function normalizeMysqlRewardVaultPageRequest(accountIdValue, optionsValue) {
  const recipientAccountId = canonicalIdentity(accountIdValue, 80);
  if (recipientAccountId === "") {
    throw rewardVaultStoreError("mysql_reward_vault_page_request_invalid");
  }
  const options = normalizeRewardVaultPageOptions(optionsValue, {requireExplicitLimit: true});
  return {recipientAccountId, limit: options.limit, cursor: options.cursor};
}

function normalizeMysqlRewardVaultEntryRequest(accountIdValue, rewardIdValue) {
  const recipientAccountId = canonicalIdentity(accountIdValue, 80);
  const rewardId = canonicalIdentity(rewardIdValue, MAX_REWARD_ID_LENGTH);
  if (recipientAccountId === "" || rewardId === "") {
    throw rewardVaultStoreError("mysql_reward_vault_entry_request_invalid");
  }
  return {recipientAccountId, rewardId};
}

async function runMysqlRewardVaultPageRead(pool, accountIdValue, optionsValue, options = {}) {
  const request = normalizeMysqlRewardVaultPageRequest(accountIdValue, optionsValue);
  requireCertifier(options.certifyAttachment);
  return runReadTransaction(pool, options, async (connection) => {
    assertVaultControl(await exactControl(connection));
    const cursorSql = request.cursor === null
      ? ""
      : " AND (created_at < ? OR (created_at = ? AND reward_id < ?))";
    const params = request.cursor === null
      ? [request.recipientAccountId, request.limit + 1]
      : [
        request.recipientAccountId,
        request.cursor.createdAt,
        request.cursor.createdAt,
        request.cursor.rewardId,
        request.limit + 1,
      ];
    const rows = await queryRows(connection, `SELECT ${REWARD_COLUMNS_SQL}
      FROM reward_vault_entries
      WHERE recipient_account_id = ?${cursorSql}
      ORDER BY created_at DESC, reward_id DESC
      LIMIT ?`, params);
    if (rows.length > request.limit + 1) {
      throw rewardVaultStoreError("mysql_reward_vault_page_row_limit_invalid");
    }
    const entries = rows.map((row) => rewardVaultEntryFromRow(
      row,
      request.recipientAccountId,
      options.certifyAttachment,
    ));
    const hasMore = entries.length > request.limit;
    const rewardRows = hasMore ? entries.slice(0, request.limit) : entries;
    const last = rewardRows[rewardRows.length - 1] || null;
    const nextCursor = hasMore
      ? encodeRewardVaultCursor({createdAt: last.createdAt, rewardId: last.rewardId})
      : null;
    return canonicalRewardVaultPageResult({
      recipientAccountId: request.recipientAccountId,
      rewardRows,
      nextCursor,
      hasMore,
    }, request.recipientAccountId, {
      limit: request.limit,
      cursor: request.cursor,
    }, {
      trustStoreOrder: true,
      certifyAttachment: options.certifyAttachment,
    });
  });
}

async function runMysqlRewardVaultEntryRead(pool, accountIdValue, rewardIdValue, options = {}) {
  const request = normalizeMysqlRewardVaultEntryRequest(accountIdValue, rewardIdValue);
  requireCertifier(options.certifyAttachment);
  return runReadTransaction(pool, options, async (connection) => {
    assertVaultControl(await exactControl(connection));
    const rows = await queryRows(connection, `SELECT ${REWARD_COLUMNS_SQL}
      FROM reward_vault_entries
      WHERE recipient_account_id = ? AND reward_id = ?`, [
      request.recipientAccountId,
      request.rewardId,
    ]);
    if (rows.length === 0) return null;
    if (rows.length !== 1) {
      throw rewardVaultStoreError("mysql_reward_vault_entry_row_count_invalid");
    }
    return rewardVaultEntryFromRow(
      rows[0],
      request.recipientAccountId,
      options.certifyAttachment,
      request.rewardId,
    );
  });
}

function rewardVaultEntryFromRow(
  rowValue,
  expectedRecipientAccountId,
  certifyAttachment,
  expectedRewardId = "",
) {
  const row = recordOrEmpty(rowValue);
  const entry = canonicalRewardVaultEntry({
    rewardId: String(row.reward_id || ""),
    sourceKey: String(row.source_key || ""),
    sourceKind: String(row.source_kind || ""),
    sourceDigest: String(row.source_digest || ""),
    recipientAccountId: String(row.recipient_account_id || ""),
    status: String(row.status || ""),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    deliveredAt: nullableText(row.delivered_at),
    claimedAt: nullableText(row.claimed_at),
    deliveredMailId: nullableText(row.delivered_mail_id),
    dataGeneration: Number(row.data_generation),
    revision: Number(row.revision),
    document: parseJsonObject(row.document_json),
  }, expectedRewardId || String(row.reward_id || ""), {certifyAttachment});
  if (entry.recipientAccountId !== expectedRecipientAccountId) {
    throw rewardVaultStoreError("mysql_reward_vault_recipient_mismatch");
  }
  return entry;
}

function certifyMysqlRewardVaultRow(
  rowValue,
  expectedRecipientAccountId,
  expectedRewardId,
  options = {},
) {
  requireCertifier(options.certifyAttachment);
  return rewardVaultEntryFromRow(
    rowValue,
    expectedRecipientAccountId,
    options.certifyAttachment,
    expectedRewardId,
  );
}

async function exactControl(connection) {
  const rows = await queryRows(connection, CONTROL_LOCK_SQL, [MAIL_STORAGE_SCOPE_KEY]);
  if (rows.length !== 1) {
    throw rewardVaultStoreError("reward_vault_feature_disabled_or_drifted");
  }
  return rows[0];
}

function assertVaultControl(row) {
  if (
    String(row && row.scope_key || "") !== MAIL_STORAGE_SCOPE_KEY
    || Number(row && row.schema_generation) !== 1
    || Number(row && row.data_generation) !== 1
    || String(row && row.lifecycle_state || "") !== "ready"
    || ![0, 1].includes(Number(row && row.archive_enabled))
    || Number(row && row.vault_claim_enabled) !== 1
    || ![0, 1].includes(Number(row && row.active_limit_enabled))
  ) {
    throw rewardVaultStoreError("reward_vault_feature_disabled_or_drifted");
  }
}

async function runReadTransaction(pool, options, execute) {
  const policy = normalizeMysqlTransactionPolicy(options.transactionPolicy);
  const guardOptions = recordOrEmpty(options.transactionGuardOptions);
  const connection = await checkoutMysqlConnection(pool, policy, guardOptions);
  let deadline;
  try {
    deadline = createMysqlTransactionDeadlineController(connection, policy, guardOptions);
  } catch (error) {
    safeRelease(connection, error);
    throw error;
  }
  let started = false;
  let reusable = true;
  try {
    await deadline.track(connectionOperation(connection, "query", [TRANSACTION_ISOLATION_SQL]));
    await deadline.track(connectionOperation(connection, "beginTransaction"));
    started = true;
    const result = await execute(deadlineConnection(connection, deadline));
    await deadline.track(connectionOperation(connection, "rollback"), {classifyFailure: false});
    started = false;
    deadline.complete();
    return result;
  } catch (caught) {
    let error = caught;
    const terminated = deadline.isFinished();
    if (started && !(terminated && error && error.timeout === true)) {
      try {
        await deadline.track(connectionOperation(connection, "rollback"), {classifyFailure: false});
        error = deterministicRewardVaultError(error)
          ? decorateNoCommit(error, true)
          : classifyMysqlTransactionFailure(error, {rollbackCompleted: true});
      } catch (rollbackError) {
        error.rollbackCause = rollbackError;
        reusable = false;
        if (!deadline.isFinished()) destroyMysqlConnection(connection, rollbackError);
      }
    } else {
      reusable = false;
      if (!terminated) destroyMysqlConnection(connection, error);
      error = deterministicRewardVaultError(error)
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
      return deadline.track(Promise.resolve().then(() => connection.query(...args)), {
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

async function queryRows(connection, sql, params = []) {
  const result = await connection.query(sql, params);
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  if (!Array.isArray(rows)) {
    throw rewardVaultStoreError("mysql_reward_vault_query_result_invalid");
  }
  return rows;
}

function parseJsonObject(value) {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw rewardVaultStoreError("mysql_reward_vault_document_json_invalid");
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw rewardVaultStoreError("mysql_reward_vault_document_json_invalid");
  }
  return structuredClone(parsed);
}

function nullableText(value) {
  return value === null || value === undefined ? null : String(value);
}

function requireCertifier(value) {
  if (typeof value !== "function") {
    throw rewardVaultStoreError("mysql_reward_vault_attachment_certifier_missing");
  }
}

function canonicalIdentity(value, maxLength) {
  return typeof value === "string"
    && value !== ""
    && value === value.trim()
    && value.length <= maxLength
    && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : "";
}

function deterministicRewardVaultError(error) {
  const code = String(error && error.code || "");
  return code.startsWith("reward_vault_") || code.startsWith("mysql_reward_vault_");
}

function decorateNoCommit(error, rollbackCompleted) {
  error.transactionPhase = "rolled_back";
  error.outcomeUnknown = false;
  error.noCommitGuaranteed = true;
  error.rollbackConfirmed = rollbackCompleted === true;
  error.retryable = false;
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

function recordOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function rewardVaultStoreError(code) {
  const error = new Error("MySQL 奖励仓读取未满足安全合同。");
  error.code = String(code || "mysql_reward_vault_read_failed");
  return error;
}

module.exports = {
  certifyMysqlRewardVaultRow,
  normalizeMysqlRewardVaultEntryRequest,
  normalizeMysqlRewardVaultPageRequest,
  runMysqlRewardVaultEntryRead,
  runMysqlRewardVaultPageRead,
};
