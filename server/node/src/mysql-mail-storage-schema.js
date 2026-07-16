"use strict";

const MAIL_STORAGE_SCOPE_KEY = "mail_lifecycle";
const MAIL_STORAGE_SCHEMA_GENERATION = 1;
const MAIL_STORAGE_INITIAL_DATA_GENERATION = 0;
// Generation one is declared supported only because every online, legacy and
// stopped-maintenance mail writer now maintains the registry/counter sidecars
// in the same transaction. Later feature generations remain fail-closed.
const MAIL_STORAGE_MAX_SUPPORTED_DATA_GENERATION = 1;
const MAIL_STORAGE_INITIAL_STATE = "uninitialized";
const MAIL_STORAGE_STATES = Object.freeze([
  "uninitialized",
  "building",
  "ready",
  "repair_required",
]);
const MAIL_STORAGE_TABLE_NAMES = Object.freeze([
  "mail_storage_control",
  "mail_active_counters",
  "mail_identity_registry",
  "mail_archive_messages",
  "reward_vault_entries",
]);
const MAIL_STORAGE_SOURCE_TABLE_NAME = "mail_messages";
const MAIL_STORAGE_SOURCE_COLUMNS = Object.freeze([
  column("mail_id", 1, "varchar(96)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
  column("sender_account_id", 2, "varchar(80)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
  column("recipient_account_id", 3, "varchar(80)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
  column("title", 4, "varchar(80)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
  column("created_at", 5, "varchar(40)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
  column("read_at", 6, "varchar(40)", "YES", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
  column("document_json", 7, "json", "NO", "<NULL>"),
]);
const MYSQL_IDENTIFIER_PATTERN = /^[A-Za-z0-9_]+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const TABLE_CONTRACTS = Object.freeze([
  tableContract("mail_storage_control", [
    column("scope_key", 1, "varchar(64)", "NO", "<NULL>", "ascii", "ascii_bin"),
    column("schema_generation", 2, "int unsigned", "NO", "<NULL>"),
    column("data_generation", 3, "bigint unsigned", "NO", "0"),
    column("lifecycle_state", 4, "varchar(32)", "NO", "<NULL>", "ascii", "ascii_bin"),
    column("archive_enabled", 5, "tinyint unsigned", "NO", "0"),
    column("vault_claim_enabled", 6, "tinyint unsigned", "NO", "0"),
    column("active_limit_enabled", 7, "tinyint unsigned", "NO", "0"),
    column("bootstrap_cursor_mail_id", 8, "varchar(96)", "YES", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("bootstrap_source_count", 9, "bigint unsigned", "NO", "0"),
    column("bootstrap_identity_count", 10, "bigint unsigned", "NO", "0"),
    column("bootstrap_recipient_count", 11, "bigint unsigned", "NO", "0"),
    column("bootstrap_active_count", 12, "bigint unsigned", "NO", "0"),
    column("source_digest", 13, "char(64)", "YES", "<NULL>", "ascii", "ascii_bin"),
    column("reconciled_at", 14, "varchar(40)", "YES", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("updated_at", 15, "timestamp", "NO", "CURRENT_TIMESTAMP", "<NULL>", "<NULL>", "0|1|1"),
  ], [
    index("PRIMARY", 1, "scope_key", "0"),
  ]),
  tableContract("mail_active_counters", [
    column("recipient_account_id", 1, "varchar(80)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("active_count", 2, "int unsigned", "NO", "<NULL>"),
    column("data_generation", 3, "bigint unsigned", "NO", "<NULL>"),
    column("revision", 4, "bigint unsigned", "NO", "0"),
    column("updated_at", 5, "timestamp", "NO", "CURRENT_TIMESTAMP", "<NULL>", "<NULL>", "0|1|1"),
  ], [
    index("PRIMARY", 1, "recipient_account_id", "0"),
  ]),
  tableContract("mail_identity_registry", [
    column("mail_id", 1, "varchar(96)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("sender_account_id", 2, "varchar(80)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("recipient_account_id", 3, "varchar(80)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("location", 4, "varchar(16)", "NO", "<NULL>", "ascii", "ascii_bin"),
    column("created_at", 5, "varchar(40)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("settled_at", 6, "varchar(40)", "YES", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("archived_at", 7, "varchar(40)", "YES", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("identity_digest", 8, "char(64)", "NO", "<NULL>", "ascii", "ascii_bin"),
    column("document_digest", 9, "char(64)", "NO", "<NULL>", "ascii", "ascii_bin"),
    column("reward_id", 10, "varchar(160)", "YES", "<NULL>", "ascii", "ascii_bin"),
    column("data_generation", 11, "bigint unsigned", "NO", "<NULL>"),
    column("revision", 12, "bigint unsigned", "NO", "0"),
  ], [
    index("PRIMARY", 1, "mail_id", "0"),
    index("idx_mail_identity_location_settled", 1, "location", "1"),
    index("idx_mail_identity_location_settled", 2, "settled_at", "1"),
    index("idx_mail_identity_location_settled", 3, "mail_id", "1"),
    index("idx_mail_identity_recipient_location_created", 1, "recipient_account_id", "1"),
    index("idx_mail_identity_recipient_location_created", 2, "location", "1"),
    index("idx_mail_identity_recipient_location_created", 3, "created_at", "1"),
    index("idx_mail_identity_recipient_location_created", 4, "mail_id", "1"),
    index("uq_mail_identity_reward_id", 1, "reward_id", "0"),
  ]),
  tableContract("mail_archive_messages", [
    column("mail_id", 1, "varchar(96)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("sender_account_id", 2, "varchar(80)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("recipient_account_id", 3, "varchar(80)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("title", 4, "varchar(80)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("created_at", 5, "varchar(40)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("read_at", 6, "varchar(40)", "YES", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("settled_at", 7, "varchar(40)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("archived_at", 8, "varchar(40)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("archive_generation", 9, "bigint unsigned", "NO", "<NULL>"),
    column("document_json", 10, "json", "NO", "<NULL>"),
  ], [
    index("PRIMARY", 1, "mail_id", "0"),
    index("idx_mail_archive_recipient_created_id", 1, "recipient_account_id", "1"),
    index("idx_mail_archive_recipient_created_id", 2, "created_at", "1"),
    index("idx_mail_archive_recipient_created_id", 3, "mail_id", "1"),
  ]),
  tableContract("reward_vault_entries", [
    column("reward_id", 1, "varchar(160)", "NO", "<NULL>", "ascii", "ascii_bin"),
    column("source_key", 2, "varchar(191)", "NO", "<NULL>", "ascii", "ascii_bin"),
    column("source_kind", 3, "varchar(64)", "NO", "<NULL>", "ascii", "ascii_bin"),
    column("source_digest", 4, "char(64)", "NO", "<NULL>", "ascii", "ascii_bin"),
    column("recipient_account_id", 5, "varchar(80)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("status", 6, "varchar(24)", "NO", "<NULL>", "ascii", "ascii_bin"),
    column("created_at", 7, "varchar(40)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("updated_at", 8, "varchar(40)", "NO", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("delivered_at", 9, "varchar(40)", "YES", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("claimed_at", 10, "varchar(40)", "YES", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("delivered_mail_id", 11, "varchar(96)", "YES", "<NULL>", "utf8mb4", "utf8mb4_0900_ai_ci"),
    column("data_generation", 12, "bigint unsigned", "NO", "<NULL>"),
    column("revision", 13, "bigint unsigned", "NO", "0"),
    column("document_json", 14, "json", "NO", "<NULL>"),
  ], [
    index("PRIMARY", 1, "reward_id", "0"),
    index("idx_reward_vault_recipient_status_created", 1, "recipient_account_id", "1"),
    index("idx_reward_vault_recipient_status_created", 2, "status", "1"),
    index("idx_reward_vault_recipient_status_created", 3, "created_at", "1"),
    index("idx_reward_vault_recipient_status_created", 4, "reward_id", "1"),
    index("uq_reward_vault_delivered_mail_id", 1, "delivered_mail_id", "0"),
    index("uq_reward_vault_recipient_source", 1, "recipient_account_id", "0"),
    index("uq_reward_vault_recipient_source", 2, "source_kind", "0"),
    index("uq_reward_vault_recipient_source", 3, "source_key", "0"),
  ]),
]);

const EXPECTED_CONTRACT_ROWS = Object.freeze([
  ...TABLE_CONTRACTS.flatMap((contract) => [
    contractRow("table", contract.tableName, "", 0, "INNODB", "", "", "", "utf8mb4_0900_ai_ci", ""),
    ...contract.columns.map((entry) => contractRow(
      "column",
      contract.tableName,
      entry.name,
      entry.ordinal,
      entry.columnType,
      entry.nullable,
      entry.defaultValue,
      entry.characterSet,
      entry.collation,
      entry.extraFlags,
    )),
    ...contract.indexes.map((entry) => contractRow(
      "index",
      contract.tableName,
      entry.name,
      entry.ordinal,
      entry.columnName,
      entry.nonUnique,
      "BTREE",
      "<NULL>",
      "YES",
      "A",
    )),
  ]),
  // The bootstrap source participates in the same repeatable-read snapshot as
  // the lifecycle sidecars. Certify its transactional engine and all seven
  // physical source fields instead of assuming a historical table still uses
  // the current InnoDB contract.
  contractRow(
    "reference_table",
    MAIL_STORAGE_SOURCE_TABLE_NAME,
    "",
    0,
    "INNODB",
    "",
    "",
    "",
    "utf8mb4_0900_ai_ci",
    "",
  ),
  ...MAIL_STORAGE_SOURCE_COLUMNS.map((entry) => contractRow(
    "reference",
    MAIL_STORAGE_SOURCE_TABLE_NAME,
    entry.name,
    entry.ordinal,
    entry.columnType,
    entry.nullable,
    entry.defaultValue,
    entry.characterSet,
    entry.collation,
    entry.extraFlags,
  )),
]);

function buildMailStorageFoundationSql(options = {}) {
  const lockWaitTimeoutSeconds = boundedPositiveInteger(
    options.metadataLockWaitTimeoutSeconds,
    5,
    60,
    "mail_storage_metadata_lock_timeout_invalid",
  );
  return `SET SESSION lock_wait_timeout = ${lockWaitTimeoutSeconds};
CREATE TABLE IF NOT EXISTS mail_storage_control (
  scope_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  schema_generation INT UNSIGNED NOT NULL,
  data_generation BIGINT UNSIGNED NOT NULL DEFAULT 0,
  lifecycle_state VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  archive_enabled TINYINT UNSIGNED NOT NULL DEFAULT 0,
  vault_claim_enabled TINYINT UNSIGNED NOT NULL DEFAULT 0,
  active_limit_enabled TINYINT UNSIGNED NOT NULL DEFAULT 0,
  bootstrap_cursor_mail_id VARCHAR(96) NULL,
  bootstrap_source_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  bootstrap_identity_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  bootstrap_recipient_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  bootstrap_active_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  source_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  reconciled_at VARCHAR(40) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS mail_active_counters (
  recipient_account_id VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci PRIMARY KEY,
  active_count INT UNSIGNED NOT NULL,
  data_generation BIGINT UNSIGNED NOT NULL,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS mail_identity_registry (
  mail_id VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci PRIMARY KEY,
  sender_account_id VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  recipient_account_id VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  location VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  settled_at VARCHAR(40) NULL,
  archived_at VARCHAR(40) NULL,
  identity_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  document_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reward_id VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NULL,
  data_generation BIGINT UNSIGNED NOT NULL,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  INDEX idx_mail_identity_recipient_location_created
    (recipient_account_id, location, created_at, mail_id),
  INDEX idx_mail_identity_location_settled (location, settled_at, mail_id),
  UNIQUE KEY uq_mail_identity_reward_id (reward_id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS mail_archive_messages (
  mail_id VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci PRIMARY KEY,
  sender_account_id VARCHAR(80) NOT NULL,
  recipient_account_id VARCHAR(80) NOT NULL,
  title VARCHAR(80) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  read_at VARCHAR(40) NULL,
  settled_at VARCHAR(40) NOT NULL,
  archived_at VARCHAR(40) NOT NULL,
  archive_generation BIGINT UNSIGNED NOT NULL,
  document_json JSON NOT NULL,
  INDEX idx_mail_archive_recipient_created_id (recipient_account_id, created_at, mail_id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS reward_vault_entries (
  reward_id VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  source_key VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_kind VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  recipient_account_id VARCHAR(80) NOT NULL,
  status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  delivered_at VARCHAR(40) NULL,
  claimed_at VARCHAR(40) NULL,
  delivered_mail_id VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  data_generation BIGINT UNSIGNED NOT NULL,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  document_json JSON NOT NULL,
  UNIQUE KEY uq_reward_vault_recipient_source (recipient_account_id, source_kind, source_key),
  UNIQUE KEY uq_reward_vault_delivered_mail_id (delivered_mail_id),
  INDEX idx_reward_vault_recipient_status_created
    (recipient_account_id, status, created_at, reward_id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
INSERT IGNORE INTO mail_storage_control
  (scope_key, schema_generation, data_generation, lifecycle_state,
   archive_enabled, vault_claim_enabled, active_limit_enabled,
   bootstrap_cursor_mail_id, bootstrap_source_count, bootstrap_identity_count,
   bootstrap_recipient_count, bootstrap_active_count,
   source_digest, reconciled_at)
VALUES
  ('${MAIL_STORAGE_SCOPE_KEY}', ${MAIL_STORAGE_SCHEMA_GENERATION},
   ${MAIL_STORAGE_INITIAL_DATA_GENERATION}, '${MAIL_STORAGE_INITIAL_STATE}',
   0, 0, 0, NULL, 0, 0, 0, 0, NULL, NULL);`;
}

function buildMailStorageContractQuerySql(databaseName) {
  const database = checkedIdentifier(databaseName, "mail_storage_database_invalid");
  const tables = MAIL_STORAGE_TABLE_NAMES.map(sqlString).join(", ");
  return `SELECT
  contract_kind,
  table_name,
  object_name,
  ordinal_position,
  type_or_column,
  nullable_or_non_unique,
  default_or_index_type,
  charset_or_sub_part,
  collation_or_visible,
  extra_or_index_collation
FROM (
  SELECT
    'table' AS contract_kind,
    table_name,
    '' AS object_name,
    0 AS ordinal_position,
    UPPER(engine) AS type_or_column,
    '' AS nullable_or_non_unique,
    '' AS default_or_index_type,
    '' AS charset_or_sub_part,
    LOWER(table_collation) AS collation_or_visible,
    '' AS extra_or_index_collation
  FROM information_schema.tables
  WHERE table_schema = ${sqlString(database)}
    AND table_name IN (${tables})
    AND table_type = 'BASE TABLE'
  UNION ALL
  SELECT
    'column',
    table_name,
    column_name,
    ordinal_position,
    LOWER(column_type),
    UPPER(is_nullable),
    COALESCE(UPPER(CAST(column_default AS CHAR)), '<NULL>'),
    COALESCE(LOWER(character_set_name), '<NULL>'),
    COALESCE(LOWER(collation_name), '<NULL>'),
    CONCAT(
      IF(LOCATE('auto_increment', LOWER(extra)) > 0, '1', '0'), '|',
      IF(LOCATE('on update current_timestamp', LOWER(extra)) > 0, '1', '0'), '|',
      IF(LOCATE('default_generated', LOWER(extra)) > 0, '1', '0')
    )
  FROM information_schema.columns
  WHERE table_schema = ${sqlString(database)}
    AND table_name IN (${tables})
  UNION ALL
  SELECT
    'reference',
    table_name,
    column_name,
    ordinal_position,
    LOWER(column_type),
    UPPER(is_nullable),
    COALESCE(UPPER(CAST(column_default AS CHAR)), '<NULL>'),
    COALESCE(LOWER(character_set_name), '<NULL>'),
    COALESCE(LOWER(collation_name), '<NULL>'),
    CONCAT(
      IF(LOCATE('auto_increment', LOWER(extra)) > 0, '1', '0'), '|',
      IF(LOCATE('on update current_timestamp', LOWER(extra)) > 0, '1', '0'), '|',
      IF(LOCATE('default_generated', LOWER(extra)) > 0, '1', '0')
    )
  FROM information_schema.columns
  WHERE table_schema = ${sqlString(database)}
    AND table_name = '${MAIL_STORAGE_SOURCE_TABLE_NAME}'
    AND column_name IN (${MAIL_STORAGE_SOURCE_COLUMNS.map((entry) => sqlString(entry.name)).join(", ")})
  UNION ALL
  SELECT
    'reference_table',
    table_name,
    '',
    0,
    UPPER(engine),
    '',
    '',
    '',
    LOWER(table_collation),
    ''
  FROM information_schema.tables
  WHERE table_schema = ${sqlString(database)}
    AND table_name = '${MAIL_STORAGE_SOURCE_TABLE_NAME}'
    AND table_type = 'BASE TABLE'
  UNION ALL
  SELECT
    'index',
    table_name,
    index_name,
    seq_in_index,
    LOWER(column_name),
    CAST(non_unique AS CHAR),
    UPPER(index_type),
    COALESCE(CAST(sub_part AS CHAR), '<NULL>'),
    COALESCE(UPPER(is_visible), 'YES'),
    COALESCE(UPPER(collation), '')
  FROM information_schema.statistics
  WHERE table_schema = ${sqlString(database)}
    AND table_name IN (${tables})
) AS mail_storage_contract
ORDER BY FIELD(contract_kind, 'table', 'column', 'reference_table', 'reference', 'index'),
  table_name, ordinal_position, object_name;`;
}

function parseMailStorageContractOutput(output) {
  const parsed = parseContractRows(output);
  const actual = new Map();
  const errors = [...parsed.errors];
  for (const row of parsed.rows) {
    const signature = row.join("\t");
    if (actual.has(signature)) {
      errors.push(`duplicate:${signature}`);
    }
    actual.set(signature, row);
  }
  const expected = new Map(EXPECTED_CONTRACT_ROWS.map((row) => [row.join("\t"), row]));
  for (const signature of expected.keys()) {
    if (!actual.has(signature)) {
      errors.push(`missing:${signature}`);
    }
  }
  for (const signature of actual.keys()) {
    if (!expected.has(signature)) {
      errors.push(`unexpected:${signature}`);
    }
  }
  return Object.freeze({
    ok: errors.length === 0,
    expectedRowCount: EXPECTED_CONTRACT_ROWS.length,
    actualRowCount: parsed.rows.length,
    errors: Object.freeze(errors),
  });
}

function buildMailStorageCanonicalContractOutputForTest() {
  return `${EXPECTED_CONTRACT_ROWS.map((row) => row.join("\t")).join("\n")}\n`;
}

function assertMailStorageContractOutput(output) {
  const result = parseMailStorageContractOutput(output);
  if (result.ok) {
    return result;
  }
  throw mailStorageError(
    "mysql_mail_storage_schema_contract_invalid",
    "MySQL 邮箱生命周期表结构与当前服务合同不兼容。",
    {contractErrors: [...result.errors]},
  );
}

function buildMailStorageControlQuerySql() {
  return `SELECT
  scope_key,
  schema_generation,
  data_generation,
  lifecycle_state,
  archive_enabled,
  vault_claim_enabled,
  active_limit_enabled,
  COALESCE(bootstrap_cursor_mail_id, ''),
  bootstrap_source_count,
  bootstrap_identity_count,
  bootstrap_recipient_count,
  bootstrap_active_count,
  COALESCE(source_digest, ''),
  COALESCE(reconciled_at, '')
FROM mail_storage_control
WHERE scope_key = '${MAIL_STORAGE_SCOPE_KEY}';`;
}

function parseMailStorageControlOutput(output) {
  const lines = nonEmptyLines(output);
  if (lines.length !== 1) {
    throw mailStorageError(
      "mysql_mail_storage_control_row_invalid",
      "MySQL 邮箱生命周期控制行必须恰好存在一条。",
      {rowCount: lines.length},
    );
  }
  const fields = lines[0].split("\t");
  if (fields.length !== 14) {
    throw mailStorageError(
      "mysql_mail_storage_control_row_invalid",
      "MySQL 邮箱生命周期控制行字段数量异常。",
      {fieldCount: fields.length},
    );
  }
  return Object.freeze({
    scopeKey: fields[0],
    schemaGeneration: strictNonNegativeInteger(fields[1]),
    dataGeneration: strictNonNegativeInteger(fields[2]),
    lifecycleState: fields[3],
    archiveEnabled: strictMysqlBoolean(fields[4]),
    vaultClaimEnabled: strictMysqlBoolean(fields[5]),
    activeLimitEnabled: strictMysqlBoolean(fields[6]),
    bootstrapCursorMailId: fields[7],
    bootstrapSourceCount: strictNonNegativeInteger(fields[8]),
    bootstrapIdentityCount: strictNonNegativeInteger(fields[9]),
    bootstrapRecipientCount: strictNonNegativeInteger(fields[10]),
    bootstrapActiveCount: strictNonNegativeInteger(fields[11]),
    sourceDigest: fields[12],
    reconciledAt: fields[13],
  });
}

function validateMailStorageStartupState(value, options = {}) {
  const state = strictControlState(value);
  const maxSupportedDataGeneration = nonNegativeIntegerOption(
    options.maxSupportedDataGeneration,
    MAIL_STORAGE_MAX_SUPPORTED_DATA_GENERATION,
    "mysql_mail_storage_supported_data_generation_invalid",
  );
  if (state.schemaGeneration > MAIL_STORAGE_SCHEMA_GENERATION) {
    throw mailStorageError(
      "mysql_mail_storage_schema_generation_future",
      "MySQL 邮箱生命周期结构来自更高版本，当前服务拒绝启动。",
      {schemaGeneration: state.schemaGeneration},
    );
  }
  if (state.schemaGeneration !== MAIL_STORAGE_SCHEMA_GENERATION) {
    throw mailStorageError(
      "mysql_mail_storage_schema_generation_incompatible",
      "MySQL 邮箱生命周期结构版本不兼容，当前服务拒绝启动。",
      {schemaGeneration: state.schemaGeneration},
    );
  }
  if (!MAIL_STORAGE_STATES.includes(state.lifecycleState)) {
    throw mailStorageError(
      "mysql_mail_storage_lifecycle_state_incompatible",
      "MySQL 邮箱生命周期状态不受当前服务支持。",
      {lifecycleState: state.lifecycleState},
    );
  }
  if (state.lifecycleState === "building") {
    throw mailStorageError(
      "mysql_mail_storage_bootstrap_in_progress",
      "邮箱生命周期停服 bootstrap 尚未完成，当前服务拒绝启动。",
    );
  }
  if (state.lifecycleState === "repair_required") {
    throw mailStorageError(
      "mysql_mail_storage_repair_required",
      "邮箱生命周期持久化需要先完成修复，当前服务拒绝启动。",
    );
  }
  if (state.dataGeneration > maxSupportedDataGeneration) {
    throw mailStorageError(
      "mysql_mail_storage_data_generation_future",
      "MySQL 邮箱数据代次高于当前二进制可维护范围，当前服务拒绝启动。",
      {dataGeneration: state.dataGeneration, maxSupportedDataGeneration},
    );
  }
  const flags = Object.freeze({
    archive: state.archiveEnabled,
    vaultClaim: state.vaultClaimEnabled,
    activeLimit: state.activeLimitEnabled,
  });
  if (flags.activeLimit && !flags.vaultClaim) {
    throw mailStorageError(
      "mysql_mail_storage_feature_dependency_invalid",
      "活动邮箱容量上限不能先于奖励仓领取能力启用。",
    );
  }
  const supportedFeatures = normalizeSupportedFeatures(options.supportedFeatures);
  const unsupportedFeatures = Object.keys(flags).filter((feature) => (
    flags[feature] && !supportedFeatures.has(feature)
  ));
  if (unsupportedFeatures.length > 0) {
    throw mailStorageError(
      "mysql_mail_storage_feature_unsupported",
      "MySQL 邮箱生命周期启用了当前二进制尚未实现的能力。",
      {unsupportedFeatures},
    );
  }
  const bootstrap = Object.freeze({
    cursorMailId: state.bootstrapCursorMailId,
    sourceCount: state.bootstrapSourceCount,
    identityCount: state.bootstrapIdentityCount,
    recipientCount: state.bootstrapRecipientCount,
    activeCount: state.bootstrapActiveCount,
  });
  if (state.lifecycleState === "uninitialized") {
    if (
      state.dataGeneration !== MAIL_STORAGE_INITIAL_DATA_GENERATION
      || state.bootstrapCursorMailId !== ""
      || state.bootstrapSourceCount !== 0
      || state.bootstrapIdentityCount !== 0
      || state.bootstrapRecipientCount !== 0
      || state.bootstrapActiveCount !== 0
      || state.sourceDigest !== ""
      || state.reconciledAt !== ""
      || Object.values(flags).some(Boolean)
    ) {
      throw mailStorageError(
        "mysql_mail_storage_uninitialized_state_incompatible",
        "未初始化邮箱生命周期控制行包含已启用能力或回填数据。",
      );
    }
    return Object.freeze({
      compatible: true,
      ready: false,
      schemaGeneration: state.schemaGeneration,
      dataGeneration: state.dataGeneration,
      lifecycleState: state.lifecycleState,
      flags,
      bootstrap,
    });
  }
  if (
    state.dataGeneration <= MAIL_STORAGE_INITIAL_DATA_GENERATION
    || !SHA256_PATTERN.test(state.sourceDigest)
    || !isCanonicalIsoTimestamp(state.reconciledAt)
  ) {
    throw mailStorageError(
      "mysql_mail_storage_ready_state_incompatible",
      "已就绪邮箱生命周期控制行缺少可认证的回填代次、摘要或时间。",
    );
  }
  if (
    state.bootstrapSourceCount !== state.bootstrapIdentityCount
    || state.bootstrapIdentityCount !== state.bootstrapActiveCount
    || state.bootstrapRecipientCount > state.bootstrapActiveCount
    || ((state.bootstrapRecipientCount === 0) !== (state.bootstrapActiveCount === 0))
  ) {
    throw mailStorageError(
      "mysql_mail_storage_ready_counts_incompatible",
      "已就绪邮箱生命周期控制行的 bootstrap 对账计数互相矛盾。",
    );
  }
  // Readiness and feature enablement are independent. Never infer a feature
  // flag merely because bootstrap reconciliation completed.
  return Object.freeze({
    compatible: true,
    ready: true,
    schemaGeneration: state.schemaGeneration,
    dataGeneration: state.dataGeneration,
    lifecycleState: state.lifecycleState,
    flags,
    bootstrap,
  });
}

function strictControlState(value) {
  const fields = [
    "scopeKey",
    "schemaGeneration",
    "dataGeneration",
    "lifecycleState",
    "archiveEnabled",
    "vaultClaimEnabled",
    "activeLimitEnabled",
    "bootstrapCursorMailId",
    "bootstrapSourceCount",
    "bootstrapIdentityCount",
    "bootstrapRecipientCount",
    "bootstrapActiveCount",
    "sourceDigest",
    "reconciledAt",
  ];
  if (!isRecord(value) || !sameStringSet(Object.keys(value), fields)) {
    throw mailStorageError(
      "mysql_mail_storage_control_row_invalid",
      "MySQL 邮箱生命周期控制行结构异常。",
    );
  }
  if (
    value.scopeKey !== MAIL_STORAGE_SCOPE_KEY
    || !Number.isSafeInteger(value.schemaGeneration)
    || value.schemaGeneration < 0
    || !Number.isSafeInteger(value.dataGeneration)
    || value.dataGeneration < 0
    || typeof value.lifecycleState !== "string"
    || typeof value.archiveEnabled !== "boolean"
    || typeof value.vaultClaimEnabled !== "boolean"
    || typeof value.activeLimitEnabled !== "boolean"
    || typeof value.bootstrapCursorMailId !== "string"
    || !Number.isSafeInteger(value.bootstrapSourceCount)
    || value.bootstrapSourceCount < 0
    || !Number.isSafeInteger(value.bootstrapIdentityCount)
    || value.bootstrapIdentityCount < 0
    || !Number.isSafeInteger(value.bootstrapRecipientCount)
    || value.bootstrapRecipientCount < 0
    || !Number.isSafeInteger(value.bootstrapActiveCount)
    || value.bootstrapActiveCount < 0
    || typeof value.sourceDigest !== "string"
    || typeof value.reconciledAt !== "string"
  ) {
    throw mailStorageError(
      "mysql_mail_storage_control_row_invalid",
      "MySQL 邮箱生命周期控制行内容异常。",
    );
  }
  return value;
}

function normalizeSupportedFeatures(value) {
  if (value === undefined) {
    return new Set();
  }
  if (!Array.isArray(value)) {
    throw mailStorageError(
      "mysql_mail_storage_supported_features_invalid",
      "邮箱生命周期 supportedFeatures 必须是显式能力名称数组。",
    );
  }
  const allowed = new Set(["archive", "vaultClaim", "activeLimit"]);
  const result = new Set();
  for (const feature of value) {
    if (typeof feature !== "string" || !allowed.has(feature) || result.has(feature)) {
      throw mailStorageError(
        "mysql_mail_storage_supported_features_invalid",
        "邮箱生命周期 supportedFeatures 包含未知或重复能力。",
      );
    }
    result.add(feature);
  }
  return result;
}

function parseContractRows(output) {
  const rows = [];
  const errors = [];
  for (const [index, line] of nonEmptyLines(output).entries()) {
    const fields = line.split("\t");
    if (fields.length !== 10) {
      errors.push(`row_${index + 1}_field_count:${fields.length}`);
      continue;
    }
    rows.push(Object.freeze(fields));
  }
  return {rows, errors};
}

function tableContract(tableName, columns, indexes) {
  return Object.freeze({
    tableName,
    columns: Object.freeze(columns),
    indexes: Object.freeze(indexes),
  });
}

function column(
  name,
  ordinal,
  columnType,
  nullable,
  defaultValue,
  characterSet = "<NULL>",
  collation = "<NULL>",
  extraFlags = "0|0|0",
) {
  return Object.freeze({
    name,
    ordinal,
    columnType,
    nullable,
    defaultValue,
    characterSet,
    collation,
    extraFlags,
  });
}

function index(name, ordinal, columnName, nonUnique) {
  return Object.freeze({name, ordinal, columnName, nonUnique});
}

function contractRow(...fields) {
  return Object.freeze(fields.map(String));
}

function nonEmptyLines(value) {
  return String(value || "").split(/\r?\n/).filter((line) => line !== "");
}

function strictNonNegativeInteger(value) {
  if (!/^(?:0|[1-9][0-9]*)$/.test(String(value || ""))) {
    throw mailStorageError(
      "mysql_mail_storage_control_row_invalid",
      "MySQL 邮箱生命周期代次不是规范非负整数。",
    );
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw mailStorageError(
      "mysql_mail_storage_control_row_invalid",
      "MySQL 邮箱生命周期代次超过安全整数范围。",
    );
  }
  return number;
}

function strictMysqlBoolean(value) {
  if (value === "0") {
    return false;
  }
  if (value === "1") {
    return true;
  }
  throw mailStorageError(
    "mysql_mail_storage_control_row_invalid",
    "MySQL 邮箱生命周期能力开关不是规范布尔值。",
  );
}

function isCanonicalIsoTimestamp(value) {
  const text = String(value || "");
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === text;
}

function boundedPositiveInteger(value, fallback, maximum, code) {
  const candidate = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(candidate) || candidate <= 0 || candidate > maximum) {
    throw mailStorageError(code, "MySQL 邮箱生命周期 metadata lock 等待时间无效。");
  }
  return candidate;
}

function nonNegativeIntegerOption(value, fallback, code) {
  const candidate = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 0) {
    throw mailStorageError(code, "MySQL 邮箱生命周期支持的数据代次无效。");
  }
  return candidate;
}

function checkedIdentifier(value, code) {
  const identifier = String(value || "").trim();
  if (!MYSQL_IDENTIFIER_PATTERN.test(identifier)) {
    throw mailStorageError(code, "MySQL 数据库名只能包含字母、数字或下划线。");
  }
  return identifier;
}

function sqlString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function sameStringSet(left, right) {
  return left.length === right.length
    && left.slice().sort().every((entry, index) => entry === right.slice().sort()[index]);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mailStorageError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details && typeof details === "object") {
    Object.assign(error, details);
  }
  return error;
}

module.exports = {
  MAIL_STORAGE_INITIAL_DATA_GENERATION,
  MAIL_STORAGE_INITIAL_STATE,
  MAIL_STORAGE_MAX_SUPPORTED_DATA_GENERATION,
  MAIL_STORAGE_SCHEMA_GENERATION,
  MAIL_STORAGE_SCOPE_KEY,
  MAIL_STORAGE_STATES,
  MAIL_STORAGE_TABLE_NAMES,
  __mailStorageExpectedContractRowsForTest: () => EXPECTED_CONTRACT_ROWS.map((row) => [...row]),
  assertMailStorageContractOutput,
  buildMailStorageCanonicalContractOutputForTest,
  buildMailStorageContractQuerySql,
  buildMailStorageControlQuerySql,
  buildMailStorageFoundationSql,
  parseMailStorageContractOutput,
  parseMailStorageControlOutput,
  validateMailStorageStartupState,
};
