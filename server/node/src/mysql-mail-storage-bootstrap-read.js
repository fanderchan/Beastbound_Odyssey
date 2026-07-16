"use strict";

const {
  MYSQL_TRANSACTION_ROLLED_BACK,
  checkoutMysqlConnection,
  createMysqlTransactionDeadlineController,
  destroyMysqlConnection,
  normalizeMysqlTransactionPolicy,
} = require("./mysql-transaction-guard");
const {
  assertMailStorageContractOutput,
  buildMailStorageContractQuerySql,
  buildMailStorageControlQuerySql,
  parseMailStorageControlOutput,
} = require("./mysql-mail-storage-schema");

const TRANSACTION_ISOLATION_SQL = "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ";
const START_READ_ONLY_SNAPSHOT_SQL =
  "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY";
const ROLLBACK_SQL = "ROLLBACK";

const SOURCE_SQL = `SELECT
  mail_id,
  sender_account_id,
  recipient_account_id,
  title,
  created_at,
  read_at,
  document_json
FROM mail_messages
ORDER BY mail_id`;

const IDENTITY_SQL = `SELECT
  mail_id,
  sender_account_id,
  recipient_account_id,
  location,
  created_at,
  settled_at,
  archived_at,
  identity_digest,
  document_digest,
  reward_id,
  data_generation,
  revision
FROM mail_identity_registry
ORDER BY mail_id`;

const COUNTER_SQL = `SELECT
  recipient_account_id,
  active_count,
  data_generation,
  revision
FROM mail_active_counters
ORDER BY recipient_account_id`;

const ARCHIVE_SQL = `SELECT
  mail_id
FROM mail_archive_messages
ORDER BY mail_id`;

const VAULT_SQL = `SELECT
  reward_id
FROM reward_vault_entries
ORDER BY reward_id`;

// Read-only bootstrap boundary. Every contract and data row is read from one
// repeatable-read snapshot; ROLLBACK is deliberate so this path can never be
// mistaken for a write executor even if a future query is accidentally added.
async function readMysqlMailStorageBootstrapSnapshot(pool, options = {}) {
  const policy = normalizeMysqlTransactionPolicy(options.transactionPolicy);
  const guardOptions = normalizeGuardOptions(options.transactionGuardOptions);
  const database = options.database;
  const connection = await checkoutMysqlConnection(pool, policy, guardOptions);
  let deadline;
  try {
    deadline = createMysqlTransactionDeadlineController(connection, policy, guardOptions);
  } catch (error) {
    releaseAfterKnownRollback(connection, error);
    throw error;
  }

  let snapshot;
  try {
    await trackedQuery(deadline, connection, TRANSACTION_ISOLATION_SQL);
    await trackedQuery(deadline, connection, START_READ_ONLY_SNAPSHOT_SQL);

    const contractRows = await trackedRows(
      deadline,
      connection,
      buildMailStorageContractQuerySql(database),
      10,
      "contract",
    );
    const schemaContract = assertMailStorageContractOutput(
      tabularOutput(contractRows, "contract"),
    );

    const controlRows = await trackedRows(
      deadline,
      connection,
      buildMailStorageControlQuerySql(),
      14,
      "control",
    );
    const control = parseMailStorageControlOutput(tabularOutput(controlRows, "control"));

    const sourceRows = (await trackedRows(
      deadline,
      connection,
      SOURCE_SQL,
      7,
      "source",
    )).map((row, index) => mapSourceRow(row, index));
    const identityRows = (await trackedRows(
      deadline,
      connection,
      IDENTITY_SQL,
      12,
      "identity",
    )).map((row, index) => mapIdentityRow(row, index));
    const counterRows = (await trackedRows(
      deadline,
      connection,
      COUNTER_SQL,
      4,
      "counter",
    )).map((row, index) => mapCounterRow(row, index));
    const archiveRows = (await trackedRows(
      deadline,
      connection,
      ARCHIVE_SQL,
      1,
      "archive",
    )).map((row, index) => mapArchiveRow(row, index));
    const vaultRows = (await trackedRows(
      deadline,
      connection,
      VAULT_SQL,
      1,
      "vault",
    )).map((row, index) => mapVaultRow(row, index));

    snapshot = deepFreeze({
      schemaContract: {
        ok: schemaContract.ok,
        expectedRowCount: schemaContract.expectedRowCount,
        actualRowCount: schemaContract.actualRowCount,
      },
      control,
      sourceRows,
      identityRows,
      counterRows,
      archiveRows,
      vaultRows,
    });
  } catch (error) {
    await rollbackAfterFailure(connection, deadline, error);
    throw error;
  }

  try {
    await deadline.track(connection.query(ROLLBACK_SQL), {classifyFailure: false});
  } catch (cause) {
    deadline.complete();
    const error = bootstrapReadError(
      "mysql_mail_storage_bootstrap_rollback_failed",
      "rollback",
      cause,
    );
    destroyMysqlConnection(connection, error);
    throw error;
  }
  deadline.complete();
  releaseAfterKnownRollback(connection);
  return snapshot;
}

async function trackedQuery(deadline, connection, sql) {
  return deadline.track(connection.query(sql));
}

async function trackedRows(deadline, connection, sql, fieldCount, kind) {
  const result = await deadline.track(connection.query({sql, rowsAsArray: true}));
  return mysqlArrayRows(result, fieldCount, kind);
}

function mysqlArrayRows(result, fieldCount, kind) {
  if (
    !Array.isArray(result)
    || result.length < 1
    || !Array.isArray(result[0])
  ) {
    throw bootstrapReadError("mysql_mail_storage_bootstrap_query_result_invalid", kind);
  }
  const rows = result[0];
  for (const [index, row] of rows.entries()) {
    if (!Array.isArray(row) || row.length !== fieldCount) {
      throw bootstrapReadError(
        "mysql_mail_storage_bootstrap_query_result_invalid",
        `${kind}[${index}]`,
      );
    }
  }
  return rows;
}

function tabularOutput(rows, kind) {
  if (rows.length === 0) {
    return "";
  }
  return `${rows.map((row, rowIndex) => row.map((value, fieldIndex) => (
    canonicalTabularScalar(value, `${kind}[${rowIndex}][${fieldIndex}]`)
  )).join("\t")).join("\n")}\n`;
}

function canonicalTabularScalar(value, path) {
  let text;
  if (Buffer.isBuffer(value)) {
    text = value.toString("utf8");
  } else if (["string", "number", "bigint"].includes(typeof value)) {
    text = String(value);
  } else {
    throw bootstrapReadError("mysql_mail_storage_bootstrap_scalar_invalid", path);
  }
  if (/[\t\r\n]/.test(text)) {
    throw bootstrapReadError("mysql_mail_storage_bootstrap_scalar_invalid", path);
  }
  return text;
}

function mapSourceRow(row, index) {
  const path = `source[${index}]`;
  return {
    mail_id: strictString(row[0], `${path}.mail_id`),
    sender_account_id: strictString(row[1], `${path}.sender_account_id`),
    recipient_account_id: strictString(row[2], `${path}.recipient_account_id`),
    title: strictString(row[3], `${path}.title`),
    created_at: strictString(row[4], `${path}.created_at`),
    read_at: nullableString(row[5], `${path}.read_at`),
    document_json: jsonObject(row[6], `${path}.document_json`),
  };
}

function mapIdentityRow(row, index) {
  const path = `identity[${index}]`;
  return {
    mailId: strictString(row[0], `${path}.mail_id`),
    senderAccountId: strictString(row[1], `${path}.sender_account_id`),
    recipientAccountId: strictString(row[2], `${path}.recipient_account_id`),
    location: strictString(row[3], `${path}.location`),
    createdAt: strictString(row[4], `${path}.created_at`),
    settledAt: nullableString(row[5], `${path}.settled_at`),
    archivedAt: nullableString(row[6], `${path}.archived_at`),
    identityDigest: strictString(row[7], `${path}.identity_digest`),
    documentDigest: strictString(row[8], `${path}.document_digest`),
    rewardId: nullableString(row[9], `${path}.reward_id`),
    dataGeneration: nonNegativeSafeInteger(row[10], `${path}.data_generation`),
    revision: nonNegativeSafeInteger(row[11], `${path}.revision`),
  };
}

function mapCounterRow(row, index) {
  const path = `counter[${index}]`;
  return {
    recipientAccountId: strictString(row[0], `${path}.recipient_account_id`),
    activeCount: nonNegativeSafeInteger(row[1], `${path}.active_count`),
    dataGeneration: nonNegativeSafeInteger(row[2], `${path}.data_generation`),
    revision: nonNegativeSafeInteger(row[3], `${path}.revision`),
  };
}

function mapArchiveRow(row, index) {
  const path = `archive[${index}]`;
  return {
    mailId: strictString(row[0], `${path}.mail_id`),
  };
}

function mapVaultRow(row, index) {
  const path = `vault[${index}]`;
  return {
    rewardId: strictString(row[0], `${path}.reward_id`),
  };
}

function strictString(value, path) {
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  if (typeof value !== "string") {
    throw bootstrapReadError("mysql_mail_storage_bootstrap_value_invalid", path);
  }
  return value;
}

function nullableString(value, path) {
  return value === null ? null : strictString(value, path);
}

function nonNegativeSafeInteger(value, path) {
  let number;
  if (typeof value === "number") {
    number = value;
  } else if (typeof value === "bigint") {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw bootstrapReadError("mysql_mail_storage_bootstrap_value_invalid", path);
    }
    number = Number(value);
  } else if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)) {
    number = Number(value);
  } else {
    throw bootstrapReadError("mysql_mail_storage_bootstrap_value_invalid", path);
  }
  if (!Number.isSafeInteger(number) || number < 0) {
    throw bootstrapReadError("mysql_mail_storage_bootstrap_value_invalid", path);
  }
  return number;
}

function jsonObject(value, path) {
  let document = value;
  if (Buffer.isBuffer(document)) {
    document = document.toString("utf8");
  }
  if (typeof document === "string") {
    try {
      document = JSON.parse(document);
    } catch (cause) {
      throw bootstrapReadError("mysql_mail_storage_bootstrap_json_invalid", path, cause);
    }
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw bootstrapReadError("mysql_mail_storage_bootstrap_json_invalid", path);
  }
  return structuredClone(document);
}

async function rollbackAfterFailure(connection, deadline, primaryError) {
  if (deadline.isFinished()) {
    // A hard deadline has already destroyed the connection. Returning it to
    // the pool, or issuing another command on it, would violate fail-closed.
    return;
  }
  try {
    await deadline.track(connection.query(ROLLBACK_SQL), {classifyFailure: false});
  } catch (rollbackCause) {
    deadline.complete();
    primaryError.rollbackCause = rollbackCause;
    destroyMysqlConnection(connection, primaryError);
    return;
  }
  deadline.complete();
  if (primaryError.code === MYSQL_TRANSACTION_ROLLED_BACK) {
    primaryError.rollbackConfirmed = true;
  }
  releaseAfterKnownRollback(connection, primaryError);
}

function releaseAfterKnownRollback(connection, primaryError = null) {
  try {
    connection.release();
  } catch (cause) {
    const error = primaryError || bootstrapReadError(
      "mysql_mail_storage_bootstrap_release_failed",
      "release",
      cause,
    );
    if (primaryError) {
      error.releaseCause = cause;
    }
    destroyMysqlConnection(connection, error);
    if (!primaryError) {
      throw error;
    }
  }
}

function normalizeGuardOptions(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function bootstrapReadError(code, path, cause = null) {
  const error = new Error("MySQL 邮箱 bootstrap 只读快照不符合安全合同。");
  error.code = code;
  error.path = String(path || "");
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

module.exports = {
  readMysqlMailStorageBootstrapSnapshot,
};
