"use strict";

const {execFileSync, spawn} = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {cloneAuthorityRoot} = require("./auth/authority-root-clone");
const {
  commitConsumedEquipmentEnvelopeLedger,
  consumedEquipmentEnvelopeLedgerCount,
  consumedEquipmentEnvelopeLedgerDeltaFrom,
  isCanonicalConsumedEquipmentEnvelopeLedger,
  readConsumedEquipmentEnvelopeLedgerIndex,
} = require("./auth/equipment-envelope-consumed-ledger");
const {
  canonicalDurableMutationReceipts,
  commitDurableMutationReceiptDelta,
  durableMutationReceiptCount,
  durableMutationReceiptDeltaFrom,
  isCanonicalDurableMutationReceipts,
} = require("./auth/durable-mutation-state");

const DEFAULT_DATABASE = "beastbound_odyssey";
// The normal CLI loader and the isolated capacity fixture must share one
// bounded ceiling. 192MiB leaves deliberate headroom above the current exact
// full-history fixture (105,876,464 bytes) without allowing unbounded child
// process output.
const DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES = 192 * 1024 * 1024;
const MYSQL_LOAD_OUTPUT_CHUNK_BYTES = 64 * 1024;
const MYSQL_LOAD_TEMP_PREFIX = "beastbound-mysql-load-";
const MYSQL_BATTLE_RECORD_WINDOW_MAX = 10000;
const MYSQL_BATTLE_TRACE_WINDOW_MAX = 1200;
const MYSQL_HISTORY_SEQUENCE_CONTRACTS = Object.freeze([
  Object.freeze({tableName: "battle_records", indexName: "uq_battle_records_history_seq"}),
  Object.freeze({tableName: "battle_trace", indexName: "uq_battle_trace_history_seq"}),
]);

function createMysqlAuthStore(options = {}) {
  const config = mysqlConfig(options);
  const readOnly = options.readOnly === true;
  const strictRowIdentity = options.strictRowIdentity === true;
  const ensureSchemaEnabled = options.ensureSchema !== false && !readOnly;
  let schemaReady = false;
  let lastPersistentData = null;
  let writePool = null;
  let closePromise = null;
  let closed = false;

  function persistentWritePool() {
    if (closed) {
      throw new Error("MySQL 持久连接池已关闭。");
    }
    if (writePool === null) {
      const candidate = config.poolFactory(mysqlPoolOptions(config));
      if (!candidate || typeof candidate.getConnection !== "function" || typeof candidate.end !== "function") {
        throw new Error("MySQL 持久连接池工厂返回了无效对象。");
      }
      writePool = candidate;
    }
    return writePool;
  }

  function ensureSchema() {
    if (schemaReady) {
      return;
    }
    if (!ensureSchemaEnabled) {
      clearLegacyRuntimeRows();
      schemaReady = true;
      return;
    }
    if (config.createDatabase) {
      const database = checkedIdentifier(config.database);
      runMysql(config, "", `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`);
    }
    runMysql(config, config.database, `
      CREATE TABLE IF NOT EXISTS server_state (
        state_key VARCHAR(64) PRIMARY KEY,
        document_json JSON NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS accounts (
        account_id VARCHAR(80) PRIMARY KEY,
        username VARCHAR(32) NOT NULL UNIQUE,
        display_name VARCHAR(80) NOT NULL,
        role VARCHAR(24) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        document_json JSON NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        session_id VARCHAR(80) PRIMARY KEY,
        account_id VARCHAR(80) NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at VARCHAR(40) NOT NULL,
        revoked_at VARCHAR(40) NULL,
        document_json JSON NOT NULL,
        INDEX idx_sessions_account_id (account_id),
        UNIQUE KEY uq_sessions_token_hash (token_hash)
      );
      CREATE TABLE IF NOT EXISTS profile_bindings (
        account_id VARCHAR(80) PRIMARY KEY,
        player_id VARCHAR(80) NOT NULL,
        profile_revision INT NOT NULL DEFAULT 0,
        updated_at VARCHAR(40) NOT NULL,
        document_json JSON NOT NULL,
        UNIQUE KEY uq_profile_bindings_player_id (player_id)
      );
      CREATE TABLE IF NOT EXISTS profiles (
        player_id VARCHAR(80) PRIMARY KEY,
        account_id VARCHAR(80) NOT NULL,
        profile_revision INT NOT NULL DEFAULT 0,
        updated_at VARCHAR(40) NOT NULL,
        profile_json JSON NOT NULL,
        INDEX idx_profiles_account_id (account_id)
      );
      CREATE TABLE IF NOT EXISTS mutation_receipts (
        operation_id VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        action_id VARCHAR(160) NOT NULL,
        account_id VARCHAR(80) NULL,
        committed_at VARCHAR(40) NOT NULL,
        expires_at VARCHAR(40) NOT NULL,
        document_json JSON NOT NULL,
        INDEX idx_mutation_receipts_account_expires (account_id, expires_at),
        INDEX idx_mutation_receipts_expires (expires_at)
      );
      CREATE TABLE IF NOT EXISTS mail_messages (
        mail_id VARCHAR(96) PRIMARY KEY,
        sender_account_id VARCHAR(80) NOT NULL,
        recipient_account_id VARCHAR(80) NOT NULL,
        title VARCHAR(80) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        read_at VARCHAR(40) NULL,
        document_json JSON NOT NULL,
        INDEX idx_mail_recipient_created (recipient_account_id, created_at)
      );
      CREATE TABLE IF NOT EXISTS market_listings (
        listing_id VARCHAR(96) PRIMARY KEY,
        seller_account_id VARCHAR(80) NOT NULL,
        item_id VARCHAR(96) NOT NULL,
        currency VARCHAR(24) NOT NULL,
        unit_price BIGINT NOT NULL DEFAULT 0,
        item_count INT NOT NULL DEFAULT 0,
        created_at VARCHAR(40) NOT NULL,
        document_json JSON NOT NULL,
        INDEX idx_market_item_currency_price (item_id, currency, unit_price),
        INDEX idx_market_seller_created (seller_account_id, created_at)
      );
      CREATE TABLE IF NOT EXISTS consumed_equipment_envelopes (
        envelope_id VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY
      );
      CREATE TABLE IF NOT EXISTS parties (
        party_id VARCHAR(96) PRIMARY KEY,
        leader_account_id VARCHAR(80) NOT NULL,
        member_count INT NOT NULL DEFAULT 0,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        document_json JSON NOT NULL,
        INDEX idx_parties_leader (leader_account_id)
      );
      CREATE TABLE IF NOT EXISTS party_invites (
        invite_id VARCHAR(96) PRIMARY KEY,
        party_id VARCHAR(96) NOT NULL,
        from_account_id VARCHAR(80) NOT NULL,
        to_account_id VARCHAR(80) NOT NULL,
        status VARCHAR(24) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        document_json JSON NOT NULL,
        INDEX idx_party_invites_to_status (to_account_id, status)
      );
      CREATE TABLE IF NOT EXISTS families (
        family_id VARCHAR(96) PRIMARY KEY,
        family_name VARCHAR(80) NOT NULL,
        leader_account_id VARCHAR(80) NOT NULL,
        member_count INT NOT NULL DEFAULT 0,
        fame INT NOT NULL DEFAULT 0,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        document_json JSON NOT NULL,
        INDEX idx_families_name (family_name),
        INDEX idx_families_leader (leader_account_id)
      );
      CREATE TABLE IF NOT EXISTS manors (
        manor_id VARCHAR(96) PRIMARY KEY,
        owner_family_id VARCHAR(96) NOT NULL DEFAULT '',
        owner_family_name VARCHAR(80) NOT NULL DEFAULT '',
        occupied_at VARCHAR(40) NOT NULL DEFAULT '',
        updated_at VARCHAR(40) NOT NULL DEFAULT '',
        document_json JSON NOT NULL,
        INDEX idx_manors_owner (owner_family_id)
      );
      CREATE TABLE IF NOT EXISTS manor_battles (
        battle_id VARCHAR(96) PRIMARY KEY,
        manor_id VARCHAR(96) NOT NULL,
        challenger_family_id VARCHAR(96) NOT NULL,
        defender_family_id VARCHAR(96) NOT NULL DEFAULT '',
        winner_family_id VARCHAR(96) NOT NULL DEFAULT '',
        result VARCHAR(40) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        document_json JSON NOT NULL,
        INDEX idx_manor_battles_manor_created (manor_id, created_at),
        INDEX idx_manor_battles_winner_created (winner_family_id, created_at)
      );
      CREATE TABLE IF NOT EXISTS manor_wars (
        war_id VARCHAR(96) PRIMARY KEY,
        manor_id VARCHAR(96) NOT NULL,
        status VARCHAR(32) NOT NULL,
        challenger_family_id VARCHAR(96) NOT NULL,
        defender_family_id VARCHAR(96) NOT NULL DEFAULT '',
        starts_at VARCHAR(40) NOT NULL DEFAULT '',
        resolved_at VARCHAR(40) NOT NULL DEFAULT '',
        document_json JSON NOT NULL,
        INDEX idx_manor_wars_manor_status (manor_id, status),
        INDEX idx_manor_wars_challenger_status (challenger_family_id, status)
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        message_id VARCHAR(96) PRIMARY KEY,
        channel VARCHAR(24) NOT NULL,
        party_id VARCHAR(96) NOT NULL DEFAULT '',
        sender_account_id VARCHAR(80) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        document_json JSON NOT NULL,
        INDEX idx_chat_channel_created (channel, created_at),
        INDEX idx_chat_party_created (party_id, created_at)
      );
      CREATE TABLE IF NOT EXISTS player_positions (
        account_id VARCHAR(80) PRIMARY KEY,
        username VARCHAR(32) NOT NULL,
        map_id VARCHAR(64) NOT NULL,
        cell_x INT NOT NULL DEFAULT 0,
        cell_y INT NOT NULL DEFAULT 0,
        facing VARCHAR(24) NOT NULL,
        moving TINYINT NOT NULL DEFAULT 0,
        updated_at VARCHAR(40) NOT NULL,
        document_json JSON NOT NULL,
        INDEX idx_player_positions_map_updated (map_id, updated_at)
      );
      CREATE TABLE IF NOT EXISTS battle_invites (
        invite_id VARCHAR(96) PRIMARY KEY,
        mode VARCHAR(24) NOT NULL,
        from_account_id VARCHAR(80) NOT NULL,
        to_account_id VARCHAR(80) NOT NULL,
        status VARCHAR(24) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        document_json JSON NOT NULL,
        INDEX idx_battle_invites_to_status (to_account_id, status)
      );
      CREATE TABLE IF NOT EXISTS battle_rooms (
        room_id VARCHAR(96) PRIMARY KEY,
        mode VARCHAR(24) NOT NULL,
        status VARCHAR(24) NOT NULL,
        seed VARCHAR(64) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        document_json JSON NOT NULL,
        INDEX idx_battle_rooms_status (status)
      );
      CREATE TABLE IF NOT EXISTS battle_records (
        history_seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        record_id VARCHAR(96) PRIMARY KEY,
        room_id VARCHAR(96) NOT NULL,
        mode VARCHAR(24) NOT NULL,
        reason VARCHAR(40) NOT NULL,
        winner_account_id VARCHAR(80) NOT NULL,
        closed_by_account_id VARCHAR(80) NOT NULL,
        ended_at VARCHAR(40) NOT NULL,
        participant_account_ids JSON NOT NULL,
        loser_account_ids JSON NOT NULL,
        document_json JSON NOT NULL,
        UNIQUE KEY uq_battle_records_history_seq (history_seq),
        INDEX idx_battle_records_room (room_id),
        INDEX idx_battle_records_winner_ended (winner_account_id, ended_at),
        INDEX idx_battle_records_reason_ended (reason, ended_at)
      );
      CREATE TABLE IF NOT EXISTS battle_trace (
        history_seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        trace_id VARCHAR(96) PRIMARY KEY,
        room_id VARCHAR(96) NOT NULL DEFAULT '',
        trace_type VARCHAR(64) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        document_json JSON NOT NULL,
        UNIQUE KEY uq_battle_trace_history_seq (history_seq),
        INDEX idx_battle_trace_room_created (room_id, created_at),
        INDEX idx_battle_trace_type_created (trace_type, created_at)
      );
      CREATE TABLE IF NOT EXISTS gm_user_grants (
        account_id VARCHAR(80) PRIMARY KEY,
        username VARCHAR(32) NOT NULL,
        enabled TINYINT NOT NULL DEFAULT 1,
        expires_at VARCHAR(40) NULL,
        document_json JSON NOT NULL,
        INDEX idx_gm_user_grants_username (username)
      );
      CREATE TABLE IF NOT EXISTS gm_command_grants (
        account_id VARCHAR(80) NOT NULL,
        command_id VARCHAR(80) NOT NULL,
        enabled TINYINT NOT NULL DEFAULT 1,
        document_json JSON NOT NULL,
        PRIMARY KEY (account_id, command_id)
      );
      CREATE TABLE IF NOT EXISTS gm_command_audit (
        audit_id VARCHAR(96) PRIMARY KEY,
        username VARCHAR(32) NOT NULL,
        command_id VARCHAR(80) NOT NULL,
        ok TINYINT NOT NULL DEFAULT 0,
        created_at VARCHAR(40) NOT NULL,
        document_json JSON NOT NULL,
        INDEX idx_gm_command_audit_username_created (username, created_at),
        INDEX idx_gm_command_audit_command_created (command_id, created_at)
      );
      CREATE TABLE IF NOT EXISTS auth_events (
        event_id VARCHAR(96) PRIMARY KEY,
        event_type VARCHAR(64) NOT NULL,
        username VARCHAR(32) NOT NULL,
        ok TINYINT NOT NULL DEFAULT 0,
        created_at VARCHAR(40) NOT NULL,
        document_json JSON NOT NULL,
        INDEX idx_auth_events_username_created (username, created_at),
        INDEX idx_auth_events_type_created (event_type, created_at)
      );
      CREATE TABLE IF NOT EXISTS service_events (
        event_seq BIGINT PRIMARY KEY,
        event_id VARCHAR(96) NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        document_json JSON NOT NULL,
        INDEX idx_service_events_type_seq (event_type, event_seq)
      );
    `);
    ensureAppendOnlyHistorySequenceSchema(config, config.database);
    clearLegacyRuntimeRows();
    schemaReady = true;
  }

  function clearLegacyRuntimeRows() {
    if (readOnly) {
      return;
    }
    // Party invitations became runtime-only in Phase255. The table stays in
    // the schema for rolling compatibility, but no stale invitation may be
    // restored or retained across a writable server restart.
    runMysql(config, config.database, "DELETE FROM party_invites;");
  }

  return {
    mode: "mysql",
    checkHealth() {
      if (closed) {
        throw new Error("MySQL 持久连接池已关闭。");
      }
      ensureSchema();
      runMysql(config, config.database, "SELECT 1");
      return {ok: true};
    },
    async checkHealthAsync() {
      if (closed) {
        throw new Error("MySQL 持久连接池已关闭。");
      }
      if (config.usePool) {
        await persistentWritePool().query({sql: "SELECT 1", timeout: config.healthProbeTimeoutMs});
      } else {
        await runMysqlAsync(config, config.database, "SELECT 1", {timeoutMs: config.healthProbeTimeoutMs});
      }
      return {ok: true};
    },
    load() {
      ensureSchema();
      const loaded = canonicalizeLoadedAuthorityCollections(loadPersistentData(config, config.database, {
        includeConsumedEquipmentEnvelopes: ensureSchemaEnabled,
        includeMutationReceipts: ensureSchemaEnabled,
        strictRowIdentity,
      }));
      lastPersistentData = mysqlPersistentData(loaded);
      return loaded;
    },
    save(nextData) {
      if (closed) {
        throw new Error("MySQL 持久连接池已关闭。");
      }
      if (readOnly) {
        throw new Error("Read-only MySQL auth store cannot save.");
      }
      const data = mysqlPersistentData(nextData);
      if (lastPersistentData === null) {
        ensureSchema();
        lastPersistentData = mysqlPersistentData(canonicalizeLoadedAuthorityCollections(loadPersistentData(config, config.database, {
          includeConsumedEquipmentEnvelopes: ensureSchemaEnabled,
          includeMutationReceipts: ensureSchemaEnabled,
          strictRowIdentity,
        })));
      }
      const statements = buildSaveStatementsFromPersistentData(data, lastPersistentData);
      if (statements.length > 0) {
        runMysqlSaveStatements(config, config.database, statements);
      }
      lastPersistentData = committedMysqlPersistentData(data, {owned: true});
    },
    async saveAsync(nextData) {
      if (closed) {
        throw new Error("MySQL 持久连接池已关闭。");
      }
      if (readOnly) {
        throw new Error("Read-only MySQL auth store cannot save.");
      }
      const data = mysqlPersistentData(nextData);
      if (lastPersistentData === null) {
        ensureSchema();
        lastPersistentData = mysqlPersistentData(canonicalizeLoadedAuthorityCollections(loadPersistentData(config, config.database, {
          includeConsumedEquipmentEnvelopes: ensureSchemaEnabled,
          includeMutationReceipts: ensureSchemaEnabled,
          strictRowIdentity,
        })));
      }
      const statements = buildSaveStatementsFromPersistentData(data, lastPersistentData);
      if (statements.length > 0) {
        if (config.usePool) {
          await runMysqlPoolSaveStatements(persistentWritePool(), statements);
        } else {
          await runMysqlSaveStatementsAsync(config, config.database, statements);
        }
      }
      lastPersistentData = committedMysqlPersistentData(data, {owned: true});
    },
    async saveAsyncOwned(nextData) {
      if (closed) {
        throw new Error("MySQL 持久连接池已关闭。");
      }
      if (readOnly) {
        throw new Error("Read-only MySQL auth store cannot save.");
      }
      // The durable coordinator transfers this isolated snapshot and does not
      // mutate nested values until settlement. Keep a separate root so its
      // post-COMMIT ledger replacement cannot alter this write.
      const data = mysqlPersistentData(nextData, {ownedRoot: true});
      if (lastPersistentData === null) {
        ensureSchema();
        lastPersistentData = mysqlPersistentData(canonicalizeLoadedAuthorityCollections(loadPersistentData(config, config.database, {
          includeConsumedEquipmentEnvelopes: ensureSchemaEnabled,
          includeMutationReceipts: ensureSchemaEnabled,
          strictRowIdentity,
        })));
      }
      const statements = buildSaveStatementsFromPersistentData(data, lastPersistentData);
      if (statements.length > 0) {
        if (config.usePool) {
          await runMysqlPoolSaveStatements(persistentWritePool(), statements);
        } else {
          await runMysqlSaveStatementsAsync(config, config.database, statements);
        }
      }
      lastPersistentData = committedMysqlPersistentData(data, {owned: true});
    },
    async close() {
      if (closePromise !== null) {
        return closePromise;
      }
      closed = true;
      if (writePool === null) {
        return undefined;
      }
      closePromise = Promise.resolve(writePool.end());
      return closePromise;
    },
  };
}

function buildSaveStatements(nextData, previousData = null) {
  const data = mysqlPersistentData(nextData);
  const previous = previousData ? mysqlPersistentData(previousData) : emptyPersistentData();
  return buildSaveStatementsFromPersistentData(data, previous);
}

function buildSaveStatementsFromPersistentData(data, previous) {
  const statements = [];
  const previousState = stateMetadataFromPersistentData(previous);
  const nextState = stateMetadataFromPersistentData(data);
  if (entityChanged(previousState, nextState)) {
    statements.push(upsertStateStatement(nextState));
  }
  appendObjectEntityDiff(statements, "accounts", "account_id", previous.accounts, data.accounts, accountEntityKey, insertAccountStatement);
  appendObjectEntityDiff(statements, "sessions", "session_id", previous.sessions, data.sessions, sessionEntityKey, insertSessionStatement);
  appendObjectEntityDiff(statements, "profile_bindings", "account_id", previous.profileBindings, data.profileBindings, profileBindingEntityKey, insertProfileBindingStatement);
  appendObjectEntityDiff(statements, "profiles", "player_id", previous.profiles, data.profiles, profileEntityKey, insertProfileStatement);
  appendMutationReceiptDeltaOrDiff(statements, previous.mutationReceipts, data.mutationReceipts);
  appendObjectEntityDiff(statements, "mail_messages", "mail_id", previous.mailMessages, data.mailMessages, mailEntityKey, insertMailStatement);
  appendObjectEntityDiff(statements, "market_listings", "listing_id", previous.marketListings, data.marketListings, marketListingEntityKey, insertMarketListingStatement);
  appendConsumedEquipmentEnvelopeDeltaOrDiff(
    statements,
    previous.consumedEquipmentEnvelopes,
    data.consumedEquipmentEnvelopes,
  );
  appendObjectEntityDiff(statements, "parties", "party_id", previous.parties, data.parties, partyEntityKey, insertPartyStatement);
  appendObjectEntityDiff(statements, "families", "family_id", previous.families, data.families, familyEntityKey, insertFamilyStatement);
  appendObjectEntityDiff(statements, "manors", "manor_id", previous.manors, data.manors, manorEntityKey, insertManorStatement);
  appendArrayEntityDiff(statements, "manor_battles", "battle_id", previous.manorBattles, data.manorBattles, manorBattleEntityKey, insertManorBattleStatement);
  appendArrayEntityDiff(statements, "manor_wars", "war_id", previous.manorWars, data.manorWars, manorWarEntityKey, insertManorWarStatement);
  appendArrayEntityDiff(statements, "chat_messages", "message_id", previous.chatMessages, data.chatMessages, chatMessageEntityKey, insertChatMessageStatement);
  appendImmutableHistoryInserts(statements, previous.battleRecords, data.battleRecords, battleRecordEntityKey, insertBattleRecordStatement);
  appendImmutableHistoryInserts(statements, previous.battleTrace, data.battleTrace, battleTraceEntityKey, insertBattleTraceStatement);
  appendObjectEntityDiff(statements, "gm_user_grants", "account_id", previous.gmUserGrants, data.gmUserGrants, gmUserGrantEntityKey, insertGmUserGrantStatement);
  appendGmCommandGrantDiff(statements, previous.gmCommandGrants, data.gmCommandGrants);
  appendArrayEntityDiff(statements, "gm_command_audit", "audit_id", previous.gmCommandAudit, data.gmCommandAudit, gmCommandAuditEntityKey, insertGmCommandAuditStatement);
  appendArrayEntityDiff(statements, "auth_events", "event_id", previous.authEvents, data.authEvents, authEventEntityKey, insertAuthEventStatement);
  appendArrayEntityDiff(statements, "service_events", "event_seq", previous.serviceEvents, data.serviceEvents, serviceEventEntityKey, insertServiceEventStatement);
  if (statements.length === 0) {
    return [];
  }
  return ["START TRANSACTION", ...statements, "COMMIT"];
}

function loadPersistentData(config, database, options = {}) {
  const includeConsumedEquipmentEnvelopes = options.includeConsumedEquipmentEnvelopes === true
    || mysqlTableExists(config, database, "consumed_equipment_envelopes");
  const includeMutationReceipts = options.includeMutationReceipts === true
    || mysqlTableExists(config, database, "mutation_receipts");
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), MYSQL_LOAD_TEMP_PREFIX));
  const outputPath = path.join(temporaryDirectory, "persistent-data.tsv");
  let outputFd = null;
  try {
    outputFd = fs.openSync(outputPath, "wx", 0o600);
    fs.fchmodSync(outputFd, 0o600);
    runMysql(
      config,
      database,
      loadPersistentDataSql({includeConsumedEquipmentEnvelopes, includeMutationReceipts}),
      {stdoutFd: outputFd},
    );
    fs.closeSync(outputFd);
    outputFd = null;
    const outputSize = fs.statSync(outputPath).size;
    if (!Number.isSafeInteger(outputSize) || outputSize > config.outputMaxBufferBytes) {
      const error = new Error("MySQL 持久化数据输出超过安全上限。");
      error.code = "mysql_output_limit_exceeded";
      throw error;
    }
    return parsePersistentDataLines(
      persistentDataFileLines(outputPath, config.outputMaxBufferBytes),
      options,
    );
  } finally {
    if (outputFd !== null) {
      try {
        fs.closeSync(outputFd);
      } catch {
        // The enclosing operation already failed; cleanup below remains safe.
      }
    }
    try {
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    } catch {
      const error = new Error("MySQL 持久化临时数据清理失败。");
      error.code = "mysql_output_cleanup_failed";
      throw error;
    }
  }
}

function mysqlTableExists(config, database, tableName) {
  const schema = String(database || "").trim();
  const table = String(tableName || "").trim();
  if (schema === "" || table === "") {
    return false;
  }
  const output = runMysql(
    config,
    "",
    `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = ${sqlString(schema)} AND table_name = ${sqlString(table)})`,
  );
  return Number(String(output || "").trim()) === 1;
}

function ensureAppendOnlyHistorySequenceSchema(config, database) {
  for (const contract of MYSQL_HISTORY_SEQUENCE_CONTRACTS) {
    const current = mysqlHistorySequenceContract(config, database, contract.tableName);
    if (current.exists) {
      if (!current.valid) {
        const error = new Error(
          `MySQL历史顺序列契约不兼容：${contract.tableName}.history_seq必须是BIGINT UNSIGNED NOT NULL AUTO_INCREMENT且具有唯一索引。`,
        );
        error.code = "mysql_history_sequence_contract_invalid";
        throw error;
      }
      continue;
    }
    // Single-node startup is the migration owner. MySQL atomic DDL either
    // installs the auto-increment column and unique index together or fails;
    // LOCK=SHARED keeps reads available during an existing-table rebuild.
    // Unsupported engines/versions fail here before the HTTP listener opens.
    runMysql(config, database, `
      ALTER TABLE ${contract.tableName}
        ADD COLUMN history_seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ADD UNIQUE KEY ${contract.indexName} (history_seq),
        ALGORITHM=INPLACE,
        LOCK=SHARED;
    `);
  }
}

function mysqlHistorySequenceContract(config, database, tableName) {
  const schema = String(database || "").trim();
  const table = String(tableName || "").trim();
  const output = runMysql(config, "", `
    SELECT
      COUNT(*),
      COALESCE(MAX(LOWER(column_type)), ''),
      COALESCE(MAX(UPPER(is_nullable)), ''),
      COALESCE(MAX(LOWER(extra)), ''),
      (SELECT COUNT(*)
         FROM (
           SELECT history_index.index_name
             FROM information_schema.statistics AS history_index
            WHERE history_index.table_schema = ${sqlString(schema)}
              AND history_index.table_name = ${sqlString(table)}
              AND history_index.non_unique = 0
            GROUP BY history_index.index_name
           HAVING COUNT(*) = 1
              AND MAX(history_index.column_name) = 'history_seq'
         ) AS single_column_history_indexes)
    FROM information_schema.columns AS history_column
    WHERE history_column.table_schema = ${sqlString(schema)}
      AND history_column.table_name = ${sqlString(table)}
      AND history_column.column_name = 'history_seq';
  `);
  const columns = String(output || "").trim().split("\t");
  const count = Number(columns[0] || 0);
  if (!Number.isFinite(count) || count < 1) {
    return {exists: false, valid: false};
  }
  const columnType = String(columns[1] || "").trim().toLowerCase();
  const isNullable = String(columns[2] || "").trim().toUpperCase();
  const extra = String(columns[3] || "").trim().toLowerCase();
  const uniqueIndexes = Number(columns[4] || 0);
  return {
    exists: true,
    valid: count === 1
      && columnType === "bigint unsigned"
      && isNullable === "NO"
      && extra.split(/\s+/).includes("auto_increment")
      && Number.isFinite(uniqueIndexes)
      && uniqueIndexes >= 1,
  };
}

function loadPersistentDataSql(options = {}) {
  const statements = [
    "SELECT 'server_state', state_key, CAST(document_json AS CHAR) FROM server_state WHERE state_key = 'auth'",
    "SELECT 'accounts', account_id, CAST(document_json AS CHAR) FROM accounts ORDER BY account_id",
    "SELECT 'sessions', session_id, CAST(document_json AS CHAR) FROM sessions ORDER BY session_id",
    "SELECT 'profile_bindings', account_id, CAST(document_json AS CHAR) FROM profile_bindings ORDER BY account_id",
    "SELECT 'profiles', player_id, CAST(JSON_OBJECT('playerId', player_id, 'accountId', account_id, 'profileRevision', profile_revision, 'updatedAt', updated_at, 'profile', profile_json) AS CHAR) FROM profiles ORDER BY player_id",
    "SELECT 'mail_messages', mail_id, CAST(document_json AS CHAR) FROM mail_messages ORDER BY mail_id",
    "SELECT 'market_listings', listing_id, CAST(document_json AS CHAR) FROM market_listings ORDER BY listing_id",
    "SELECT 'parties', party_id, CAST(document_json AS CHAR) FROM parties ORDER BY party_id",
    "SELECT 'families', family_id, CAST(document_json AS CHAR) FROM families ORDER BY family_id",
    "SELECT 'manors', manor_id, CAST(document_json AS CHAR) FROM manors ORDER BY manor_id",
    "SELECT 'manor_battles', battle_id, CAST(document_json AS CHAR) FROM manor_battles ORDER BY battle_id",
    "SELECT 'manor_wars', war_id, CAST(document_json AS CHAR) FROM manor_wars ORDER BY war_id",
    "SELECT 'chat_messages', message_id, CAST(document_json AS CHAR) FROM chat_messages ORDER BY message_id",
    `SELECT 'battle_records', record_id, CAST(document_json AS CHAR) FROM (SELECT history_seq, record_id, document_json FROM battle_records ORDER BY history_seq DESC LIMIT ${MYSQL_BATTLE_RECORD_WINDOW_MAX}) AS recent_battle_records ORDER BY history_seq`,
    `SELECT 'battle_trace', trace_id, CAST(document_json AS CHAR) FROM (SELECT history_seq, trace_id, document_json FROM battle_trace ORDER BY history_seq DESC LIMIT ${MYSQL_BATTLE_TRACE_WINDOW_MAX}) AS recent_battle_trace ORDER BY history_seq`,
    "SELECT 'gm_user_grants', account_id, CAST(document_json AS CHAR) FROM gm_user_grants ORDER BY account_id",
    "SELECT 'gm_command_grants', CONCAT(account_id, '/', command_id), CAST(document_json AS CHAR) FROM gm_command_grants ORDER BY account_id, command_id",
    "SELECT 'gm_command_audit', audit_id, CAST(document_json AS CHAR) FROM gm_command_audit ORDER BY audit_id",
    "SELECT 'auth_events', event_id, CAST(document_json AS CHAR) FROM auth_events ORDER BY event_id",
    "SELECT 'service_events', CAST(event_seq AS CHAR), CAST(document_json AS CHAR) FROM service_events ORDER BY event_seq",
  ];
  if (options.includeConsumedEquipmentEnvelopes === true) {
    statements.splice(7, 0,
      "SELECT 'consumed_equipment_envelopes', envelope_id, CAST(JSON_OBJECT('schemaVersion', 1, 'envelopeId', envelope_id) AS CHAR) FROM consumed_equipment_envelopes ORDER BY envelope_id",
    );
  }
  if (options.includeMutationReceipts === true) {
    statements.splice(7, 0,
      "SELECT 'mutation_receipts', operation_id, CAST(document_json AS CHAR) FROM mutation_receipts ORDER BY operation_id",
    );
  }
  return statements.join(";\n");
}

function parsePersistentDataRows(output, options = {}) {
  return parsePersistentDataLines(persistentDataOutputLines(output), options);
}

function parsePersistentDataLines(lines, options = {}) {
  const data = emptyPersistentData();
  let legacyDocument = null;
  let stateDocument = null;
  let entityRows = 0;
  for (const line of lines) {
    const columns = line.split("\t");
    if (columns.length < 3) {
      continue;
    }
    const bucket = columns[0];
    if (bucket === "party_invites") {
      continue;
    }
    const rowKey = columns[1];
    const document = parsePersistentRowJson(bucket, rowKey, columns.slice(2).join("\t"));
    if (bucket === "server_state") {
      stateDocument = document;
      if (document && document.storage !== "mysql_entity_tables") {
        legacyDocument = document;
      }
      continue;
    }
    entityRows += 1;
    appendLoadedEntity(data, bucket, rowKey, document, options);
  }
  const entityTableState = Boolean(stateDocument && stateDocument.storage === "mysql_entity_tables");
  if (entityRows > 0 || entityTableState) {
    if (stateDocument && stateDocument.marketConfig && typeof stateDocument.marketConfig === "object" && !Array.isArray(stateDocument.marketConfig)) {
      data.marketConfig = stateDocument.marketConfig;
    }
    if (stateDocument && stateDocument.offlineHangConfig && typeof stateDocument.offlineHangConfig === "object" && !Array.isArray(stateDocument.offlineHangConfig)) {
      data.offlineHangConfig = stateDocument.offlineHangConfig;
    }
    data.serviceEventSeq = Math.max(
      Number(data.serviceEventSeq || 0),
      ...data.serviceEvents.map((event) => Number(event && event.eventSeq || 0)).filter((value) => Number.isFinite(value))
    );
    return data;
  }
  return legacyDocument || {};
}

function* persistentDataFileLines(filePath, maxBytes) {
  const chunk = Buffer.allocUnsafe(MYSQL_LOAD_OUTPUT_CHUNK_BYTES);
  const lineParts = [];
  let lineBytes = 0;
  let totalBytes = 0;
  let fd = null;
  try {
    fd = fs.openSync(filePath, "r");
    while (true) {
      const bytesRead = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (bytesRead <= 0) {
        break;
      }
      totalBytes += bytesRead;
      if (totalBytes > maxBytes) {
        const error = new Error("MySQL 持久化数据输出超过安全上限。");
        error.code = "mysql_output_limit_exceeded";
        throw error;
      }
      let start = 0;
      while (start < bytesRead) {
        const newlineAt = chunk.indexOf(0x0a, start);
        if (newlineAt < 0 || newlineAt >= bytesRead) {
          const remainder = Buffer.from(chunk.subarray(start, bytesRead));
          lineParts.push(remainder);
          lineBytes += remainder.length;
          break;
        }
        const tail = chunk.subarray(start, newlineAt);
        const lineBuffer = lineParts.length > 0
          ? Buffer.concat([...lineParts, tail], lineBytes + tail.length)
          : tail;
        lineParts.length = 0;
        lineBytes = 0;
        const end = lineBuffer.length > 0 && lineBuffer[lineBuffer.length - 1] === 0x0d
          ? lineBuffer.length - 1
          : lineBuffer.length;
        if (end > 0) {
          const line = lineBuffer.toString("utf8", 0, end);
          if (line.trim() !== "") {
            yield line;
          }
        }
        start = newlineAt + 1;
      }
    }
    if (lineParts.length > 0) {
      const lineBuffer = Buffer.concat(lineParts, lineBytes);
      const end = lineBuffer.length > 0 && lineBuffer[lineBuffer.length - 1] === 0x0d
        ? lineBuffer.length - 1
        : lineBuffer.length;
      if (end > 0) {
        const line = lineBuffer.toString("utf8", 0, end);
        if (line.trim() !== "") {
          yield line;
        }
      }
    }
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
}

function* persistentDataOutputLines(output) {
  if (!Buffer.isBuffer(output)) {
    yield* String(output || "").split(/\r?\n/).filter((line) => line.trim() !== "");
    return;
  }
  let start = 0;
  while (start < output.length) {
    const newlineAt = output.indexOf(0x0a, start);
    let end = newlineAt >= 0 ? newlineAt : output.length;
    if (end > start && output[end - 1] === 0x0d) {
      end -= 1;
    }
    if (end > start) {
      yield output.toString("utf8", start, end);
    }
    if (newlineAt < 0) {
      break;
    }
    start = newlineAt + 1;
  }
}

function parsePersistentRowJson(bucket, rowKey, jsonText) {
  try {
    const parsed = JSON.parse(String(jsonText || "null"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    throw new Error(`MySQL持久化行解析失败：${bucket}/${rowKey}`);
  }
}

function appendLoadedEntity(data, bucket, rowKey, document, options = {}) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    if (options.strictRowIdentity === true) {
      throw new Error(`MySQL持久化行文档非法：${bucket}/${String(rowKey || "<empty>")}`);
    }
    return;
  }
  if (options.strictRowIdentity === true || bucket === "mutation_receipts") {
    assertPersistentRowIdentity(bucket, rowKey, persistentDocumentIdentity(bucket, document));
  }
  switch (bucket) {
    case "accounts":
      data.accounts[String(document.username || rowKey || "")] = document;
      break;
    case "sessions":
      data.sessions[String(document.sessionId || rowKey || "")] = document;
      break;
    case "profile_bindings":
      data.profileBindings[String(document.accountId || rowKey || "")] = document;
      break;
    case "profiles":
      data.profiles[String(document.playerId || rowKey || "")] = document;
      break;
    case "mutation_receipts":
      // Keep the SQL operation id authoritative so a malformed document
      // cannot collapse two durable retry records onto the same map entry.
      data.mutationReceipts[String(rowKey || "")] = document;
      break;
    case "mail_messages":
      // Keep the SQL primary key authoritative. A mismatched document identity
      // must survive loading so domain audits can fail closed instead of
      // deleting the wrong row and allowing its assets to reappear on restart.
      data.mailMessages[String(rowKey || "")] = document;
      break;
    case "market_listings":
      data.marketListings[String(rowKey || "")] = document;
      break;
    case "consumed_equipment_envelopes": {
      // The SQL primary key is the entire tombstone. There is deliberately no
      // mutable JSON payload that an idempotent retry could overwrite.
      const envelopeId = String(rowKey || "");
      data.consumedEquipmentEnvelopes[envelopeId] = {schemaVersion: 1, envelopeId};
      break;
    }
    case "parties":
      data.parties[String(document.partyId || rowKey || "")] = document;
      break;
    case "families":
      data.families[String(document.familyId || rowKey || "")] = document;
      break;
    case "manors":
      data.manors[String(document.manorId || rowKey || "")] = document;
      break;
    case "manor_battles":
      data.manorBattles.push(document);
      break;
    case "manor_wars":
      data.manorWars.push(document);
      break;
    case "chat_messages":
      data.chatMessages.push(document);
      break;
    case "battle_records":
      appendLoadedHistoryWindow(data.battleRecords, document, MYSQL_BATTLE_RECORD_WINDOW_MAX);
      break;
    case "battle_trace":
      appendLoadedHistoryWindow(data.battleTrace, document, MYSQL_BATTLE_TRACE_WINDOW_MAX);
      break;
    case "gm_user_grants":
      data.gmUserGrants[String(document.accountId || rowKey || "")] = document;
      break;
    case "gm_command_grants": {
      const accountId = String(document.accountId || "").trim();
      if (accountId !== "") {
        if (!Array.isArray(data.gmCommandGrants[accountId])) {
          data.gmCommandGrants[accountId] = [];
        }
        data.gmCommandGrants[accountId].push(document);
      }
      break;
    }
    case "gm_command_audit":
      data.gmCommandAudit.push(document);
      break;
    case "auth_events":
      data.authEvents.push(document);
      break;
    case "service_events":
      data.serviceEvents.push(document);
      break;
    default:
      break;
  }
}

function persistentDocumentIdentity(bucket, document) {
  const fieldByBucket = {
    accounts: "accountId",
    sessions: "sessionId",
    profile_bindings: "accountId",
    profiles: "playerId",
    mutation_receipts: "operationId",
    mail_messages: "mailId",
    market_listings: "listingId",
    consumed_equipment_envelopes: "envelopeId",
    parties: "partyId",
    families: "familyId",
    manors: "manorId",
    manor_battles: "battleId",
    manor_wars: "warId",
    chat_messages: "messageId",
    battle_records: "recordId",
    battle_trace: "traceId",
    gm_user_grants: "accountId",
    gm_command_audit: "auditId",
    auth_events: "eventId",
    service_events: "eventSeq",
  };
  if (bucket === "gm_command_grants") {
    return `${String(document.accountId || "")}/${String(document.commandId || "")}`;
  }
  const field = fieldByBucket[bucket];
  return field ? document[field] : "";
}

function assertPersistentRowIdentity(bucket, rowKey, documentIdentity) {
  const sqlIdentity = String(rowKey || "");
  const jsonIdentity = String(documentIdentity || "");
  if (sqlIdentity === "" || jsonIdentity === "" || sqlIdentity !== jsonIdentity) {
    throw new Error(`MySQL持久化行身份不一致：${bucket}/${sqlIdentity || "<empty>"}`);
  }
}

function mysqlPersistentData(nextData, options = {}) {
  const data = options.ownedRoot === true ? {...(nextData || {})} : cloneAuthorityRoot(nextData || {});
  data.playerPositions = {};
  data.partyInvites = {};
  data.battleInvites = {};
  data.battleRooms = {};
  data.battleRoomRecoveries = {};
  data.battleRoomRecoveryByAccountId = {};
  data.tradeOffers = {};
  if (Array.isArray(data.serviceEvents)) {
    data.serviceEvents = data.serviceEvents.filter((event) => {
      const type = String(event && event.type || "");
      return !type.startsWith("battle.");
    });
  }
  return data;
}

function committedMysqlPersistentData(nextData, options = {}) {
  // save()/saveAsync() own their mysqlPersistentData clone, so after COMMIT it
  // can become the next diff baseline in place. External callers retain the
  // defensive clone behavior.
  const data = options.owned === true ? nextData : mysqlPersistentData(nextData);
  data.mutationReceipts = commitDurableMutationReceiptDelta(
    canonicalDurableMutationReceipts(data.mutationReceipts),
  );
  const committedLedger = commitConsumedEquipmentEnvelopeLedger(
    data.consumedEquipmentEnvelopes,
  );
  if (!committedLedger.ok) {
    const error = new Error(committedLedger.message || "装备转运消费账本提交失败。");
    error.code = committedLedger.code || "equipment_consumed_ledger_commit_failed";
    throw error;
  }
  data.consumedEquipmentEnvelopes = committedLedger.ledger;
  return data;
}

function canonicalizeLoadedAuthorityCollections(data) {
  if (!data) {
    return data;
  }
  if (Object.hasOwn(data, "consumedEquipmentEnvelopes")) {
    const read = readConsumedEquipmentEnvelopeLedgerIndex(data.consumedEquipmentEnvelopes);
    if (!read.ok) {
      const error = new Error(read.message || "装备转运消费账本加载失败。");
      error.code = read.code || "equipment_consumed_ledger_invalid";
      throw error;
    }
    data.consumedEquipmentEnvelopes = read.ledger;
  }
  if (Object.hasOwn(data, "mutationReceipts")) {
    data.mutationReceipts = canonicalDurableMutationReceipts(data.mutationReceipts);
  }
  return data;
}

function emptyPersistentData() {
  return {
    schemaVersion: 1,
    accounts: {},
    sessions: {},
    profileBindings: {},
    profiles: {},
    mutationReceipts: {},
    mailMessages: {},
    marketListings: {},
    consumedEquipmentEnvelopes: {},
    marketConfig: {},
    offlineHangConfig: {},
    parties: {},
    partyInvites: {},
    families: {},
    manors: {},
    manorWars: [],
    manorBattles: [],
    chatMessages: [],
    playerPositions: {},
    battleInvites: {},
    battleRooms: {},
    battleRecords: [],
    battleTrace: [],
    gmUserGrants: {},
    gmCommandGrants: {},
    gmCommandAudit: [],
    authEvents: [],
    serviceEventSeq: 0,
    serviceEvents: [],
  };
}

function mysqlAuthStoreRootContract() {
  const runtimeOnlyFields = Object.freeze([
    "battleInvites",
    "battleRooms",
    "battleRoomRecoveries",
    "battleRoomRecoveryByAccountId",
    "partyInvites",
    "playerPositions",
    "tradeOffers",
  ]);
  const runtimeOnlyFieldSet = new Set(runtimeOnlyFields);
  const snapshotFields = Object.freeze([
    ...new Set([
      ...Object.keys(emptyPersistentData()),
      ...runtimeOnlyFields,
    ]),
  ].sort());
  const persistentFields = Object.freeze(snapshotFields.filter((field) => !runtimeOnlyFieldSet.has(field)));
  return Object.freeze({
    snapshotFields,
    persistentFields,
    runtimeOnlyFields,
    profileDocumentFields: Object.freeze([
      "playerId",
      "accountId",
      "profileRevision",
      "updatedAt",
      "profile",
    ]),
  });
}

function appendObjectEntityDiff(statements, tableName, primaryColumn, previousObject, nextObject, keyFn, insertFn) {
  appendEntityDiff(
    statements,
    tableName,
    primaryColumn,
    entityMapFromObject(previousObject, keyFn),
    entityMapFromObject(nextObject, keyFn),
    insertFn
  );
}

function appendArrayEntityDiff(statements, tableName, primaryColumn, previousArray, nextArray, keyFn, insertFn) {
  // Owned committed snapshots retain certified immutable journal identity.
  // When an unrelated mutation carries that exact journal forward, there is
  // no row delta to discover and walking every retained entry is pure cost.
  if (previousArray === nextArray) {
    return;
  }
  appendEntityDiff(
    statements,
    tableName,
    primaryColumn,
    entityMapFromArray(previousArray, keyFn),
    entityMapFromArray(nextArray, keyFn),
    insertFn
  );
}

function appendImmutableHistoryInserts(statements, previousArray, nextArray, keyFn, insertFn) {
  // The in-memory battle journals are bounded hot windows, while MySQL is the
  // append-only cold history. Missing entries therefore mean "not resident",
  // never "delete this database row". Existing IDs are immutable as well: a
  // loader normalization may intentionally drop fields unknown to this build,
  // and must not overwrite the original JSON document on an unrelated save.
  if (previousArray === nextArray) {
    return;
  }
  const previousIds = new Set();
  for (const entity of Array.isArray(previousArray) ? previousArray : []) {
    const key = entityKey(keyFn, entity);
    if (key !== "") {
      previousIds.add(key);
    }
  }
  const insertedIds = new Set();
  for (const entity of Array.isArray(nextArray) ? nextArray : []) {
    const key = entityKey(keyFn, entity);
    if (key === "" || previousIds.has(key) || insertedIds.has(key)) {
      continue;
    }
    // Deliberately omit ON DUPLICATE KEY UPDATE. If an ID belongs to an older
    // row outside the loaded window, the database conflict rolls back instead
    // of rewriting cold history.
    statements.push(insertFn(entity));
    insertedIds.add(key);
  }
}

function appendLoadedHistoryWindow(target, document, maxRows) {
  target.push(document);
  if (target.length > maxRows) {
    target.splice(0, target.length - maxRows);
  }
}

function appendMutationReceiptDiff(statements, previousValue, nextValue) {
  const previous = mutationReceiptMap(previousValue);
  const next = mutationReceiptMap(nextValue);
  for (const operationId of Object.keys(previous).sort()) {
    if (!Object.hasOwn(next, operationId)) {
      statements.push(deleteEntityStatement("mutation_receipts", "operation_id", operationId));
    }
  }
  for (const operationId of Object.keys(next).sort()) {
    if (Object.hasOwn(previous, operationId)) {
      if (entityChanged(previous[operationId], next[operationId])) {
        throw new Error("持久化操作回执只能按过期策略删除，不能改写既有结果。");
      }
      continue;
    }
    // Plain INSERT makes a database-side duplicate roll back the transaction
    // instead of overwriting the first committed outcome.
    statements.push(insertMutationReceiptStatement(next[operationId]));
  }
}

function appendMutationReceiptDeltaOrDiff(statements, previousValue, nextValue) {
  const delta = durableMutationReceiptDeltaFrom(previousValue, nextValue);
  if (!delta.ok) {
    appendMutationReceiptDiff(statements, previousValue, nextValue);
    return;
  }
  for (const deletion of delta.deletes) {
    statements.push(deleteEntityStatement(
      "mutation_receipts",
      "operation_id",
      deletion.operationId,
    ));
  }
  for (const receipt of delta.upserts) {
    // Keep plain INSERT: a duplicate operation ID rolls the whole transaction
    // back instead of overwriting the first committed outcome.
    statements.push(insertMutationReceiptStatement(receipt));
  }
}

function mutationReceiptMap(value) {
  if (value === undefined) {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("持久操作回执必须是对象。");
  }
  const result = {};
  for (const operationId of Object.keys(value).sort()) {
    const receipt = value[operationId];
    if (
      operationId === ""
      || !receipt
      || typeof receipt !== "object"
      || Array.isArray(receipt)
      || receipt.operationId !== operationId
    ) {
      throw new Error("持久操作回执身份不一致。");
    }
    result[operationId] = receipt;
  }
  return result;
}

function appendConsumedEquipmentEnvelopeDiff(statements, previousValue, nextValue) {
  const previous = consumedEquipmentEnvelopeMap(previousValue);
  const next = consumedEquipmentEnvelopeMap(nextValue);
  for (const envelopeId of Object.keys(previous).sort()) {
    if (!Object.hasOwn(next, envelopeId)) {
      throw new Error("装备转运消费账本只能追加，不能删除已有凭证。");
    }
  }
  for (const envelopeId of Object.keys(next).sort()) {
    if (!Object.hasOwn(previous, envelopeId)) {
      statements.push(insertConsumedEquipmentEnvelopeStatement(envelopeId));
    }
  }
}

function appendConsumedEquipmentEnvelopeDeltaOrDiff(statements, previousValue, nextValue) {
  const delta = consumedEquipmentEnvelopeLedgerDeltaFrom(previousValue, nextValue);
  if (!delta.ok) {
    appendConsumedEquipmentEnvelopeDiff(statements, previousValue, nextValue);
    return;
  }
  for (const envelopeId of delta.addedIds) {
    statements.push(insertConsumedEquipmentEnvelopeStatement(envelopeId));
  }
}

function consumedEquipmentEnvelopeMap(value) {
  if (value === undefined) {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("装备转运消费账本必须是对象。");
  }
  const result = {};
  for (const envelopeId of Object.keys(value).sort()) {
    const record = value[envelopeId];
    if (
      typeof envelopeId !== "string"
      || envelopeId === ""
      || envelopeId !== envelopeId.trim()
      || envelopeId.length > 160
      || !/^eqx_[A-Za-z0-9_-]{8,156}$/.test(envelopeId)
      || !record
      || typeof record !== "object"
      || Array.isArray(record)
      || Object.keys(record).length !== 2
      || record.schemaVersion !== 1
      || record.envelopeId !== envelopeId
    ) {
      throw new Error("装备转运消费账本含非规范记录。");
    }
    result[envelopeId] = record;
  }
  return result;
}

function appendEntityDiff(statements, tableName, primaryColumn, previousMap, nextMap, insertFn) {
  for (const key of Object.keys(previousMap).sort()) {
    if (!Object.prototype.hasOwnProperty.call(nextMap, key)) {
      statements.push(deleteEntityStatement(tableName, primaryColumn, key));
    }
  }
  for (const key of Object.keys(nextMap).sort()) {
    const nextEntity = nextMap[key];
    if (!Object.prototype.hasOwnProperty.call(previousMap, key) || entityChanged(previousMap[key], nextEntity)) {
      statements.push(upsertEntityStatement(insertFn(nextEntity), upsertColumnsForTable(tableName)));
    }
  }
}

function appendGmCommandGrantDiff(statements, previousObject, nextObject) {
  appendEntityDiff(
    statements,
    "gm_command_grants",
    "",
    entityMapFromGmCommandGrants(previousObject),
    entityMapFromGmCommandGrants(nextObject),
    insertGmCommandGrantStatement
  );
}

function entityMapFromObject(value, keyFn) {
  const result = {};
  for (const entity of Object.values(objectOrEmpty(value))) {
    const key = entityKey(keyFn, entity);
    if (key !== "") {
      result[key] = entity;
    }
  }
  return result;
}

function entityMapFromArray(value, keyFn) {
  const result = {};
  if (!Array.isArray(value)) {
    return result;
  }
  for (const entity of value) {
    const key = entityKey(keyFn, entity);
    if (key !== "") {
      result[key] = entity;
    }
  }
  return result;
}

function entityMapFromGmCommandGrants(value) {
  const result = {};
  for (const grants of Object.values(objectOrEmpty(value))) {
    if (!Array.isArray(grants)) {
      continue;
    }
    for (const grant of grants) {
      const accountId = String(grant && grant.accountId || "").trim();
      const commandId = String(grant && grant.commandId || "").trim();
      if (accountId !== "" && commandId !== "") {
        result[`${accountId}\u0000${commandId}`] = grant;
      }
    }
  }
  return result;
}

function entityKey(keyFn, entity) {
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
    return "";
  }
  return String(keyFn(entity) || "").trim();
}

function entityChanged(previousEntity, nextEntity) {
  // Trusted authority roots preserve object identity only for values that
  // already passed the immutable/COW certification boundary.  The MySQL
  // baseline owns its snapshot after COMMIT, so an identical reference means
  // this row cannot have changed and does not need another full JSON walk.
  // Untrusted or mutable rows still take the exact serialized comparison.
  if (previousEntity === nextEntity) {
    return false;
  }
  return JSON.stringify(previousEntity || {}) !== JSON.stringify(nextEntity || {});
}

function deleteEntityStatement(tableName, primaryColumn, key) {
  if (tableName === "gm_command_grants") {
    const [accountId, commandId] = String(key || "").split("\u0000");
    return `DELETE FROM gm_command_grants WHERE account_id = ${sqlString(accountId)} AND command_id = ${sqlString(commandId)}`;
  }
  return `DELETE FROM ${tableName} WHERE ${primaryColumn} = ${sqlString(key)}`;
}

function upsertEntityStatement(insertStatement, updateColumns) {
  const assignments = updateColumns.map((column) => `${column} = VALUES(${column})`).join(", ");
  return `${insertStatement} ON DUPLICATE KEY UPDATE ${assignments}`;
}

function upsertColumnsForTable(tableName) {
  switch (tableName) {
    case "accounts":
      return ["username", "display_name", "role", "created_at", "updated_at", "document_json"];
    case "sessions":
      return ["account_id", "token_hash", "expires_at", "revoked_at", "document_json"];
    case "profile_bindings":
      return ["player_id", "profile_revision", "updated_at", "document_json"];
    case "profiles":
      return ["account_id", "profile_revision", "updated_at", "profile_json"];
    case "mail_messages":
      return ["sender_account_id", "recipient_account_id", "title", "created_at", "read_at", "document_json"];
    case "market_listings":
      return ["seller_account_id", "item_id", "currency", "unit_price", "item_count", "created_at", "document_json"];
    case "parties":
      return ["leader_account_id", "member_count", "created_at", "updated_at", "document_json"];
    case "families":
      return ["family_name", "leader_account_id", "member_count", "fame", "created_at", "updated_at", "document_json"];
    case "manors":
      return ["owner_family_id", "owner_family_name", "occupied_at", "updated_at", "document_json"];
    case "manor_battles":
      return ["manor_id", "challenger_family_id", "defender_family_id", "winner_family_id", "result", "created_at", "document_json"];
    case "manor_wars":
      return ["manor_id", "status", "challenger_family_id", "defender_family_id", "starts_at", "resolved_at", "document_json"];
    case "chat_messages":
      return ["channel", "party_id", "sender_account_id", "created_at", "document_json"];
    case "battle_records":
      return ["room_id", "mode", "reason", "winner_account_id", "closed_by_account_id", "ended_at", "participant_account_ids", "loser_account_ids", "document_json"];
    case "battle_trace":
      return ["room_id", "trace_type", "created_at", "document_json"];
    case "gm_user_grants":
      return ["username", "enabled", "expires_at", "document_json"];
    case "gm_command_grants":
      return ["enabled", "document_json"];
    case "gm_command_audit":
      return ["username", "command_id", "ok", "created_at", "document_json"];
    case "auth_events":
      return ["event_type", "username", "ok", "created_at", "document_json"];
    case "service_events":
      return ["event_id", "event_type", "created_at", "document_json"];
    default:
      throw new Error(`未知MySQL持久化表：${tableName}`);
  }
}

function accountEntityKey(account) {
  return account.accountId;
}

function sessionEntityKey(session) {
  return session.sessionId;
}

function profileBindingEntityKey(binding) {
  return binding.accountId;
}

function profileEntityKey(profile) {
  return profile.playerId;
}

function mailEntityKey(mail) {
  return mail.mailId;
}

function marketListingEntityKey(listing) {
  return listing.listingId;
}

function partyEntityKey(party) {
  return party.partyId;
}

function familyEntityKey(family) {
  return family.familyId;
}

function manorEntityKey(manor) {
  return manor.manorId;
}

function manorBattleEntityKey(battle) {
  return battle.battleId;
}

function manorWarEntityKey(war) {
  return war.warId;
}

function chatMessageEntityKey(message) {
  return message.messageId;
}

function battleRecordEntityKey(record) {
  return record.recordId;
}

function battleTraceEntityKey(trace) {
  return trace.traceId;
}

function gmUserGrantEntityKey(grant) {
  return grant.accountId;
}

function gmCommandAuditEntityKey(audit) {
  return audit.auditId;
}

function authEventEntityKey(event) {
  return event.eventId;
}

function serviceEventEntityKey(event) {
  return event.eventSeq;
}

function mysqlConfig(options) {
  const mysqlPathExplicit = Object.prototype.hasOwnProperty.call(options, "mysqlPath")
    || String(process.env.BEASTBOUND_MYSQL_BIN || "").trim() !== "";
  return {
    mysqlPath: options.mysqlPath || process.env.BEASTBOUND_MYSQL_BIN || "mysql",
    host: options.host || process.env.BEASTBOUND_MYSQL_HOST || "127.0.0.1",
    port: Number(options.port || process.env.BEASTBOUND_MYSQL_PORT || 3306),
    user: options.user || process.env.BEASTBOUND_MYSQL_USER || "root",
    password: options.password || process.env.BEASTBOUND_MYSQL_PASSWORD || "",
    database: options.database || process.env.BEASTBOUND_MYSQL_DATABASE || DEFAULT_DATABASE,
    createDatabase: boolConfig(options.createDatabase, process.env.BEASTBOUND_MYSQL_CREATE_DATABASE),
    outputMaxBufferBytes: positiveIntegerConfig(
      options.outputMaxBufferBytes,
      process.env.BEASTBOUND_MYSQL_OUTPUT_MAX_BUFFER_BYTES,
      DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES,
    ),
    healthProbeTimeoutMs: positiveIntegerConfig(options.healthProbeTimeoutMs, undefined, 2000),
    usePool: mysqlPoolEnabled(options, mysqlPathExplicit),
    poolFactory: typeof options.poolFactory === "function" ? options.poolFactory : defaultMysqlPoolFactory,
    poolConnectionLimit: positiveIntegerConfig(
      options.poolConnectionLimit,
      process.env.BEASTBOUND_MYSQL_POOL_CONNECTION_LIMIT,
      2,
    ),
  };
}

function mysqlPoolEnabled(options, mysqlPathExplicit) {
  if (Object.prototype.hasOwnProperty.call(options, "usePool")) {
    return Boolean(options.usePool);
  }
  if (String(process.env.BEASTBOUND_MYSQL_USE_POOL || "").trim() !== "") {
    return boolConfig(undefined, process.env.BEASTBOUND_MYSQL_USE_POOL);
  }
  if (typeof options.poolFactory === "function") {
    return true;
  }
  // A caller that supplies a mysql executable is normally a migration tool or
  // a fake-CLI test. Keep that established path unless it explicitly opts in.
  return !mysqlPathExplicit;
}

function mysqlPoolOptions(config) {
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: config.poolConnectionLimit,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    multipleStatements: false,
  };
}

function defaultMysqlPoolFactory(options) {
  const mysql = require("mysql2/promise");
  return mysql.createPool(options);
}

function runMysql(config, database, sql, options = {}) {
  try {
    return execFileSync(config.mysqlPath, mysqlArgs(config, database), {
      "encoding": options.binaryOutput === true ? null : "utf8",
      "input": sql,
      "maxBuffer": config.outputMaxBufferBytes,
      "stdio": ["pipe", Number.isInteger(options.stdoutFd) ? options.stdoutFd : "pipe", "pipe"],
    });
  } catch (error) {
    if (options.silent) {
      return "";
    }
    const stderr = error && error.stderr ? String(error.stderr).trim() : "";
    throw new Error(stderr || "MySQL 命令执行失败。");
  }
}

function runMysqlAsync(config, database, sql, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.mysqlPath, mysqlArgs(config, database), {
      "stdio": ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let settled = false;
    let forceKillTimer = null;
    const timeoutMs = Math.max(0, Math.trunc(Number(options.timeoutMs || 0)));
    const timeoutTimer = timeoutMs > 0 ? setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      const error = new Error("MySQL 命令执行超时。");
      error.code = "mysql_command_timeout";
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, 250);
      forceKillTimer.unref?.();
      reject(error);
    }, timeoutMs) : null;
    timeoutTimer?.unref?.();

    function clearTimers() {
      clearTimeout(timeoutTimer);
      clearTimeout(forceKillTimer);
    }

    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > config.outputMaxBufferBytes) {
        settled = true;
        clearTimers();
        child.kill("SIGTERM");
        reject(new Error("MySQL 输出超过缓冲上限。"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimers();
        reject(error);
      }
    });
    child.on("close", (code) => {
      clearTimers();
      if (settled) {
        return;
      }
      settled = true;
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
        return;
      }
      if (options.silent) {
        resolve("");
        return;
      }
      const errorText = Buffer.concat(stderr).toString("utf8").trim();
      reject(new Error(errorText || "MySQL 命令执行失败。"));
    });
    child.stdin.end(sql);
  });
}

function mysqlArgs(config, database) {
  const args = [
    "--protocol=tcp",
    "-h", config.host,
    "-P", String(config.port),
    "-u", config.user,
    "--batch",
    "--raw",
    "--skip-column-names",
  ];
  if (config.password !== "") {
    args.push(`-p${config.password}`);
  }
  if (database) {
    args.push(database);
  }
  return args;
}

function runMysqlSaveStatements(config, database, statements) {
  if (!Array.isArray(statements) || statements.length === 0) {
    return "";
  }
  try {
    return runMysql(config, database, `${statements.join(";\n")};`);
  } catch (error) {
    const diagnosis = diagnoseMysqlSaveFailure(config, database, statements);
    if (diagnosis !== "") {
      throw new Error(`${error.message} (${diagnosis})`);
    }
    throw error;
  }
}

async function runMysqlSaveStatementsAsync(config, database, statements) {
  if (!Array.isArray(statements) || statements.length === 0) {
    return "";
  }
  try {
    return await runMysqlAsync(config, database, `${statements.join(";\n")};`);
  } catch (error) {
    // An async request path must never fall back to synchronous statement-by-
    // statement mysql spawns: that blocks the event loop and can replay an
    // ambiguous transaction. Keep the public failure bounded and retain the
    // original error only as a non-rendered cause for local diagnostics.
    const saveError = new Error("MySQL 异步存档失败。");
    saveError.cause = error;
    throw saveError;
  }
}

async function runMysqlPoolSaveStatements(pool, statements) {
  if (!Array.isArray(statements) || statements.length === 0) {
    return;
  }
  const transactionStatements = statements[0] === "START TRANSACTION"
    && statements[statements.length - 1] === "COMMIT"
    ? statements.slice(1, -1)
    : statements.slice();
  let connection = null;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    for (const statement of transactionStatements) {
      await connection.query(statement);
    }
    await connection.commit();
  } catch (error) {
    let rollbackError = null;
    if (connection !== null && transactionStarted) {
      try {
        await connection.rollback();
      } catch (caughtRollbackError) {
        rollbackError = caughtRollbackError;
      }
    }
    const saveError = new Error("MySQL 异步存档失败。");
    saveError.cause = error;
    if (rollbackError !== null) {
      saveError.rollbackCause = rollbackError;
    }
    throw saveError;
  } finally {
    if (connection !== null && typeof connection.release === "function") {
      connection.release();
    }
  }
}

function diagnoseMysqlSaveFailure(config, database, statements) {
  for (let index = 0; index < statements.length - 1; index += 1) {
    try {
      runMysql(config, database, `${statements.slice(0, index + 1).join(";\n")};`);
    } catch (error) {
      return `statement ${index + 1}/${statements.length}: ${summarizeStatement(statements[index])}: ${error.message}`;
    }
  }
  return "";
}

function summarizeStatement(statement) {
  const text = String(statement || "").trim().replace(/\s+/g, " ");
  const match = text.match(/^(INSERT INTO|DELETE FROM|UPDATE|START TRANSACTION)\s+`?([A-Za-z0-9_]+)?/i);
  if (match) {
    return [match[1].toUpperCase(), match[2] || ""].join(" ").trim();
  }
  return text.slice(0, 48);
}

function upsertStateStatement(state) {
  return `INSERT INTO server_state (state_key, document_json) VALUES ('auth', ${sqlJson(state)}) ON DUPLICATE KEY UPDATE document_json = VALUES(document_json)`;
}

function stateMetadataFromPersistentData(persistent) {
  return {
    schemaVersion: 2,
    storage: "mysql_entity_tables",
    counts: {
      accounts: Object.keys(objectOrEmpty(persistent.accounts)).length,
      sessions: Object.keys(objectOrEmpty(persistent.sessions)).length,
      profileBindings: Object.keys(objectOrEmpty(persistent.profileBindings)).length,
      profiles: Object.keys(objectOrEmpty(persistent.profiles)).length,
      mutationReceipts: isCanonicalDurableMutationReceipts(persistent.mutationReceipts)
        ? durableMutationReceiptCount(persistent.mutationReceipts)
        : Object.keys(objectOrEmpty(persistent.mutationReceipts)).length,
      mailMessages: Object.keys(objectOrEmpty(persistent.mailMessages)).length,
      marketListings: Object.keys(objectOrEmpty(persistent.marketListings)).length,
      consumedEquipmentEnvelopes: consumedEquipmentEnvelopeCount(persistent.consumedEquipmentEnvelopes),
      parties: Object.keys(objectOrEmpty(persistent.parties)).length,
      partyInvites: Object.keys(objectOrEmpty(persistent.partyInvites)).length,
      families: Object.keys(objectOrEmpty(persistent.families)).length,
      manors: Object.keys(objectOrEmpty(persistent.manors)).length,
      manorBattles: Array.isArray(persistent.manorBattles) ? persistent.manorBattles.length : 0,
      manorWars: Array.isArray(persistent.manorWars) ? persistent.manorWars.length : 0,
      chatMessages: Array.isArray(persistent.chatMessages) ? persistent.chatMessages.length : 0,
      battleRecords: Array.isArray(persistent.battleRecords) ? persistent.battleRecords.length : 0,
      battleTrace: Array.isArray(persistent.battleTrace) ? persistent.battleTrace.length : 0,
      gmUserGrants: Object.keys(objectOrEmpty(persistent.gmUserGrants)).length,
      gmCommandGrantAccounts: Object.keys(objectOrEmpty(persistent.gmCommandGrants)).length,
      gmCommandAudit: Array.isArray(persistent.gmCommandAudit) ? persistent.gmCommandAudit.length : 0,
      authEvents: Array.isArray(persistent.authEvents) ? persistent.authEvents.length : 0,
      serviceEvents: Array.isArray(persistent.serviceEvents) ? persistent.serviceEvents.length : 0,
    },
    serviceEventSeq: Number(persistent.serviceEventSeq || 0),
    marketConfig: objectOrEmpty(persistent.marketConfig),
    offlineHangConfig: objectOrEmpty(persistent.offlineHangConfig),
  };
}

function consumedEquipmentEnvelopeCount(value) {
  if (isCanonicalConsumedEquipmentEnvelopeLedger(value)) {
    return consumedEquipmentEnvelopeLedgerCount(value);
  }
  return Object.keys(objectOrEmpty(value)).length;
}

function insertAccountStatement(account) {
  return `INSERT INTO accounts (account_id, username, display_name, role, created_at, updated_at, document_json) VALUES (${sqlString(account.accountId)}, ${sqlString(account.username)}, ${sqlString(account.displayName)}, ${sqlString(account.role)}, ${sqlString(account.createdAt)}, ${sqlString(account.updatedAt)}, ${sqlJson(account)})`;
}

function insertSessionStatement(session) {
  return `INSERT INTO sessions (session_id, account_id, token_hash, expires_at, revoked_at, document_json) VALUES (${sqlString(session.sessionId)}, ${sqlString(session.accountId)}, ${sqlString(session.tokenHash)}, ${sqlString(session.expiresAt)}, ${sqlNullable(session.revokedAt)}, ${sqlJson(session)})`;
}

function insertProfileBindingStatement(binding) {
  return `INSERT INTO profile_bindings (account_id, player_id, profile_revision, updated_at, document_json) VALUES (${sqlString(binding.accountId)}, ${sqlString(binding.playerId)}, ${Number(binding.profileRevision || 0)}, ${sqlString(binding.updatedAt || binding.createdAt)}, ${sqlJson(binding)})`;
}

function insertProfileStatement(profile) {
  return `INSERT INTO profiles (player_id, account_id, profile_revision, updated_at, profile_json) VALUES (${sqlString(profile.playerId)}, ${sqlString(profile.accountId)}, ${Number(profile.profileRevision || 0)}, ${sqlString(profile.updatedAt)}, ${sqlJson(profile.profile || {})})`;
}

function insertMutationReceiptStatement(receipt) {
  return `INSERT INTO mutation_receipts (operation_id, request_hash, action_id, account_id, committed_at, expires_at, document_json) VALUES (${sqlString(receipt.operationId)}, ${sqlString(receipt.requestHash)}, ${sqlString(receipt.actionId)}, ${sqlNullable(receipt.accountId)}, ${sqlString(receipt.committedAt)}, ${sqlString(receipt.expiresAt)}, ${sqlJson(receipt)})`;
}

function insertMailStatement(mail) {
  return `INSERT INTO mail_messages (mail_id, sender_account_id, recipient_account_id, title, created_at, read_at, document_json) VALUES (${sqlString(mail.mailId)}, ${sqlString(mail.senderAccountId)}, ${sqlString(mail.recipientAccountId)}, ${sqlString(mail.title)}, ${sqlString(mail.createdAt)}, ${sqlNullable(mail.readAt)}, ${sqlJson(mail)})`;
}

function insertMarketListingStatement(listing) {
  return `INSERT INTO market_listings (listing_id, seller_account_id, item_id, currency, unit_price, item_count, created_at, document_json) VALUES (${sqlString(listing.listingId)}, ${sqlString(listing.sellerAccountId)}, ${sqlString(listing.itemId)}, ${sqlString(listing.currency)}, ${Number(listing.unitPrice || 0)}, ${Number(listing.count || 0)}, ${sqlString(listing.createdAt)}, ${sqlJson(listing)})`;
}

function insertConsumedEquipmentEnvelopeStatement(envelopeId) {
  return `INSERT INTO consumed_equipment_envelopes (envelope_id) VALUES (${sqlString(envelopeId)}) ON DUPLICATE KEY UPDATE envelope_id = VALUES(envelope_id)`;
}

function insertPartyStatement(party) {
  const memberCount = Array.isArray(party.memberAccountIds) ? party.memberAccountIds.length : 0;
  return `INSERT INTO parties (party_id, leader_account_id, member_count, created_at, updated_at, document_json) VALUES (${sqlString(party.partyId)}, ${sqlString(party.leaderAccountId)}, ${Number(memberCount)}, ${sqlString(party.createdAt)}, ${sqlString(party.updatedAt)}, ${sqlJson(party)})`;
}

function insertFamilyStatement(family) {
  const memberCount = Array.isArray(family.memberAccountIds) ? family.memberAccountIds.length : 0;
  return `INSERT INTO families (family_id, family_name, leader_account_id, member_count, fame, created_at, updated_at, document_json) VALUES (${sqlString(family.familyId)}, ${sqlString(family.name)}, ${sqlString(family.leaderAccountId)}, ${Number(memberCount)}, ${Number(family.fame || 0)}, ${sqlString(family.createdAt)}, ${sqlString(family.updatedAt)}, ${sqlJson(family)})`;
}

function insertManorStatement(manor) {
  return `INSERT INTO manors (manor_id, owner_family_id, owner_family_name, occupied_at, updated_at, document_json) VALUES (${sqlString(manor.manorId)}, ${sqlString(manor.ownerFamilyId)}, ${sqlString(manor.ownerFamilyName)}, ${sqlString(manor.occupiedAt)}, ${sqlString(manor.updatedAt)}, ${sqlJson(manor)})`;
}

function insertManorBattleStatement(battle) {
  return `INSERT INTO manor_battles (battle_id, manor_id, challenger_family_id, defender_family_id, winner_family_id, result, created_at, document_json) VALUES (${sqlString(battle.battleId)}, ${sqlString(battle.manorId)}, ${sqlString(battle.challengerFamilyId)}, ${sqlString(battle.defenderFamilyId)}, ${sqlString(battle.winnerFamilyId)}, ${sqlString(battle.result)}, ${sqlString(battle.createdAt)}, ${sqlJson(battle)})`;
}

function insertManorWarStatement(war) {
  return `INSERT INTO manor_wars (war_id, manor_id, status, challenger_family_id, defender_family_id, starts_at, resolved_at, document_json) VALUES (${sqlString(war.warId)}, ${sqlString(war.manorId)}, ${sqlString(war.status)}, ${sqlString(war.challengerFamilyId)}, ${sqlString(war.defenderFamilyId)}, ${sqlString(war.startsAt)}, ${sqlString(war.resolvedAt)}, ${sqlJson(war)})`;
}

function insertChatMessageStatement(message) {
  return `INSERT INTO chat_messages (message_id, channel, party_id, sender_account_id, created_at, document_json) VALUES (${sqlString(message.messageId)}, ${sqlString(message.channel)}, ${sqlString(message.partyId)}, ${sqlString(message.senderAccountId)}, ${sqlString(message.createdAt)}, ${sqlJson(message)})`;
}

function insertBattleRecordStatement(record) {
  return `INSERT INTO battle_records (record_id, room_id, mode, reason, winner_account_id, closed_by_account_id, ended_at, participant_account_ids, loser_account_ids, document_json) VALUES (${sqlString(record.recordId)}, ${sqlString(record.roomId)}, ${sqlString(record.mode)}, ${sqlString(record.reason)}, ${sqlString(record.winnerAccountId)}, ${sqlString(record.closedByAccountId)}, ${sqlString(record.endedAt)}, ${sqlJson(record.participantAccountIds || [])}, ${sqlJson(record.loserAccountIds || [])}, ${sqlJson(record)})`;
}

function insertBattleTraceStatement(trace) {
  return `INSERT INTO battle_trace (trace_id, room_id, trace_type, created_at, document_json) VALUES (${sqlString(trace.traceId)}, ${sqlString(trace.roomId)}, ${sqlString(trace.type)}, ${sqlString(trace.createdAt)}, ${sqlJson(trace)})`;
}

function insertGmUserGrantStatement(grant) {
  return `INSERT INTO gm_user_grants (account_id, username, enabled, expires_at, document_json) VALUES (${sqlString(grant.accountId)}, ${sqlString(grant.username)}, ${grant.enabled ? 1 : 0}, ${sqlNullable(grant.expiresAt)}, ${sqlJson(grant)})`;
}

function insertGmCommandGrantStatement(grant) {
  return `INSERT INTO gm_command_grants (account_id, command_id, enabled, document_json) VALUES (${sqlString(grant.accountId)}, ${sqlString(grant.commandId)}, ${grant.enabled ? 1 : 0}, ${sqlJson(grant)})`;
}

function insertGmCommandAuditStatement(audit) {
  return `INSERT INTO gm_command_audit (audit_id, username, command_id, ok, created_at, document_json) VALUES (${sqlString(audit.auditId)}, ${sqlString(audit.username)}, ${sqlString(audit.commandId)}, ${audit.ok ? 1 : 0}, ${sqlString(audit.createdAt)}, ${sqlJson(audit)})`;
}

function insertAuthEventStatement(event) {
  return `INSERT INTO auth_events (event_id, event_type, username, ok, created_at, document_json) VALUES (${sqlString(event.eventId)}, ${sqlString(event.type)}, ${sqlString(event.username)}, ${event.ok ? 1 : 0}, ${sqlString(event.createdAt)}, ${sqlJson(event)})`;
}

function insertServiceEventStatement(event) {
  return `INSERT INTO service_events (event_seq, event_id, event_type, created_at, document_json) VALUES (${Number(event.eventSeq || 0)}, ${sqlString(event.eventId)}, ${sqlString(event.type)}, ${sqlString(event.createdAt)}, ${sqlJson(event)})`;
}

function sqlJson(value) {
  return `CAST(${sqlString(JSON.stringify(value || {}))} AS JSON)`;
}

function sqlNullable(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return "NULL";
  }
  return sqlString(value);
}

function sqlString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function checkedIdentifier(value) {
  const identifier = String(value || "").trim();
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error("MySQL 数据库名只能包含字母、数字或下划线。");
  }
  return identifier;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function boolConfig(optionValue, envValue) {
  if (optionValue !== undefined) {
    return Boolean(optionValue);
  }
  const value = String(envValue || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function positiveIntegerConfig(optionValue, envValue, fallback) {
  const raw = optionValue !== undefined ? optionValue : envValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return fallback;
  }
  return value;
}

module.exports = {
  DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES,
  __buildSaveStatementsFromPersistentDataForTest: buildSaveStatementsFromPersistentData,
  __entityChangedForTest: entityChanged,
  createMysqlAuthStore,
  mysqlAuthStoreRootContract,
};
