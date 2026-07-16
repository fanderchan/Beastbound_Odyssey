"use strict";

const {execFileSync, spawn} = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {isDeepStrictEqual} = require("node:util");
const {cloneAuthorityRoot} = require("./auth/authority-root-clone");
const {
  applySharedAssetReadView,
  compareCanonicalIds,
  sharedAssetReadReferencedEnvelopeIds,
} = require("./auth/shared-asset-read-model");
const {
  canonicalDurableReceiptReadView,
  durableReceiptReadOperationId,
} = require("./auth/durable-receipt-read-model");
const {
  canonicalMailClaimEnvelopeIds,
  mailClaimReceiptResponseMatches,
  mailEquipmentEnvelopeMap,
  removedMailEquipmentEnvelopeIds,
} = require("./auth/mail-claim-consistency");
const {
  MAIL_SEND_MODE_ORDINARY_ITEMS,
  MAIL_SEND_MODE_TEXT,
  canonicalMailSendConsistencyScope,
  mailSendReceiptResponseMatches,
} = require("./auth/mail-send-consistency");
const {
  canonicalMailReadConsistencyScope,
} = require("./auth/mail-read-consistency");
const {
  canonicalMailInboxPageResult,
  encodeMailInboxCursor,
  normalizeMailInboxPageOptions,
} = require("./auth/mail-inbox-pagination");
const {
  commitConsumedEquipmentEnvelopeLedger,
  consumedEquipmentEnvelopeLedgerDeltaFrom,
  readConsumedEquipmentEnvelopeLedgerIndex,
} = require("./auth/equipment-envelope-consumed-ledger");
const {
  DURABLE_RECEIPT_MAX_COUNT,
  canonicalDurableMutationReceipts,
  commitDurableMutationReceiptDelta,
  durableMutationReceiptDelta,
  durableMutationReceiptDeltaFrom,
} = require("./auth/durable-mutation-state");
const {
  MARKET_MAX_LISTINGS,
  MARKET_MAX_LISTINGS_PER_SELLER,
} = require("./auth/market-listing-state");
const {
  commitMailAuthorityDelta,
  isCanonicalMailAuthorityState,
  mailAuthorityDelta,
  mailAuthorityDeltaFrom,
  readMailAuthorityState,
  stageMailAuthorityDelete,
  stageMailAuthorityUpsert,
} = require("./auth/mail-authority-state");
const {
  MARKET_CREATE_CAPACITY_CHECK_SQL,
  MARKET_CREATE_CAPACITY_GUARD_KEY,
  MARKET_CREATE_CAPACITY_LOCK_SQL,
  MUTATION_RECEIPT_CAPACITY_GUARD_KEY,
  MUTATION_RECEIPT_CAPACITY_UPDATE_SQL,
  MUTATION_RECEIPT_DELETE_SQL,
  assertMysqlMutationReceiptWriteContract,
  assertMysqlResourceAcquisitionOrder,
  buildMysqlResourceAcquisitionPlan,
} = require("./mysql-resource-acquisition-order");
const {
  MYSQL_COMMIT_OUTCOME_AMBIGUOUS,
  MYSQL_TRANSACTION_ROLLED_BACK,
  checkoutMysqlConnection,
  classifyMysqlTransactionFailure,
  createMysqlTransactionDeadlineController,
  destroyMysqlConnection,
  normalizeMysqlTransactionPolicy,
} = require("./mysql-transaction-guard");

const DEFAULT_DATABASE = "beastbound_odyssey";
// The normal CLI loader and the isolated capacity fixture must share one
// bounded ceiling. 192MiB leaves deliberate headroom above the current exact
// full-history fixture (105,876,464 bytes) without allowing unbounded child
// process output.
const DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES = 192 * 1024 * 1024;
const DEFAULT_MYSQL_AUTHORITY_LOAD_TIMEOUT_MS = 3000;
const MAX_MYSQL_AUTHORITY_LOAD_TIMEOUT_MS = 4000;
const DEFAULT_MYSQL_MAIL_INBOX_INDEX_MIGRATION_TIMEOUT_MS = 300000;
const MAX_MYSQL_MAIL_INBOX_INDEX_MIGRATION_TIMEOUT_MS = 900000;
const MYSQL_LOAD_OUTPUT_CHUNK_BYTES = 64 * 1024;
const MYSQL_LOAD_TEMP_PREFIX = "beastbound-mysql-load-";
const MYSQL_BATTLE_RECORD_WINDOW_MAX = 10000;
const MYSQL_BATTLE_TRACE_WINDOW_MAX = 1200;
const MYSQL_STORE_REVISION_SCOPE = "auth";
const MYSQL_MARKET_LISTING_LIMIT = "market_listing_limit";
const MYSQL_MARKET_FULL = "market_full";
const MYSQL_STORE_REVISION_CONFLICT = "mysql_store_revision_conflict";
const MYSQL_STORE_REVISION_MISSING = "mysql_store_revision_missing";
const MYSQL_RESOURCE_REVISION_CONFLICT = "mysql_resource_revision_conflict";
const MYSQL_SHARED_ASSET_FULL_RELOAD_REQUIRED = "mysql_shared_asset_full_reload_required";
const MYSQL_ENTITY_STATE_PRESENT = Symbol("beastbound.mysqlEntityStatePresent");
const MYSQL_STORE_REVISION = Symbol("beastbound.mysqlStoreRevision");
const MYSQL_STORE_REVISION_PRESENT = Symbol("beastbound.mysqlStoreRevisionPresent");
const MYSQL_HISTORY_SEQUENCE_CONTRACTS = Object.freeze([
  Object.freeze({tableName: "battle_records", indexName: "uq_battle_records_history_seq"}),
  Object.freeze({tableName: "battle_trace", indexName: "uq_battle_trace_history_seq"}),
]);
const MYSQL_MAIL_INBOX_PAGE_INDEX = Object.freeze({
  tableName: "mail_messages",
  indexName: "idx_mail_recipient_created_id",
  columns: Object.freeze(["recipient_account_id", "created_at", "mail_id"]),
});

function createMysqlAuthStore(options = {}) {
  const config = mysqlConfig(options);
  const readOnly = options.readOnly === true;
  const strictRowIdentity = options.strictRowIdentity === true;
  const ensureSchemaEnabled = options.ensureSchema !== false && !readOnly;
  let schemaReady = false;
  let lastPersistentData = null;
  let lastPersistentRevision = null;
  let revisionCasEnabled = false;
  // The marker distinguishes entity-table state from a legacy full-root row.
  // It is written once through the normal revision-fenced transaction.
  let serverStateReady = false;
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
      CREATE TABLE IF NOT EXISTS auth_store_revisions (
        scope_key VARCHAR(64) PRIMARY KEY,
        revision BIGINT UNSIGNED NOT NULL
      );
      INSERT IGNORE INTO auth_store_revisions (scope_key, revision) VALUES ('auth', 0);
      INSERT IGNORE INTO auth_store_revisions (scope_key, revision) VALUES ('market_create_capacity', 0);
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
      INSERT IGNORE INTO auth_store_revisions (scope_key, revision)
        SELECT 'mutation_receipt_capacity', COUNT(*) FROM mutation_receipts;
      CREATE TABLE IF NOT EXISTS mail_messages (
        mail_id VARCHAR(96) PRIMARY KEY,
        sender_account_id VARCHAR(80) NOT NULL,
        recipient_account_id VARCHAR(80) NOT NULL,
        title VARCHAR(80) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        read_at VARCHAR(40) NULL,
        document_json JSON NOT NULL,
        INDEX idx_mail_recipient_created_id (recipient_account_id, created_at, mail_id)
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
    ensureMailInboxPageIndexSchema(config, config.database);
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

  function loadAuthoritySnapshot() {
    ensureSchema();
    const loaded = canonicalizeLoadedAuthorityCollections(loadPersistentData(config, config.database, {
      includeConsumedEquipmentEnvelopes: ensureSchemaEnabled,
      includeMutationReceipts: ensureSchemaEnabled,
      includeStoreRevision: ensureSchemaEnabled,
      detectStoreRevision: !readOnly && (config.usePool || config.singleWriterMaintenance),
      strictRowIdentity,
    }));
    const revisionPresent = mysqlStoreRevisionPresent(loaded);
    if (!readOnly && (config.usePool || config.singleWriterMaintenance) && !revisionPresent) {
      const error = new Error("MySQL全局存档版本行缺失，拒绝启动可写服务。");
      error.code = MYSQL_STORE_REVISION_MISSING;
      throw error;
    }
    lastPersistentRevision = mysqlStoreRevision(loaded);
    revisionCasEnabled = !readOnly && revisionPresent;
    serverStateReady = mysqlEntityStatePresent(loaded);
    // Keep the store-owned baseline on its own immutable mail lineage. The
    // loaded object returned to the service is normalized separately, so a
    // request COMMIT cannot advance the store baseline before the exact
    // post-COMMIT merge runs.
    lastPersistentData = canonicalizeMysqlMailAuthorityBaseline(
      mysqlPersistentData(loaded),
    );
    return loaded;
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
      return loadAuthoritySnapshot();
    },
    async readDurableMutationReceipt(operationIdValue) {
      const operationId = durableReceiptReadOperationId(operationIdValue);
      if (closed) {
        throw new Error("MySQL 持久连接池已关闭。");
      }
      if (!config.usePool) {
        const error = new Error("持久化操作回执读穿必须使用 MySQL 连接池。");
        error.code = "mysql_durable_receipt_pool_required";
        throw error;
      }
      const view = await runMysqlDurableReceiptRead(
        persistentWritePool(),
        operationId,
        {transactionPolicy: config.transactionPolicy},
      );
      const baselineReceipt = lastPersistentData
        && lastPersistentData.mutationReceipts
        ? lastPersistentData.mutationReceipts[operationId] || null
        : null;
      return canonicalDurableReceiptReadView({
        ...view,
        authorityCurrent: lastPersistentRevision !== null
          && view.storeRevision === lastPersistentRevision
          && isDeepStrictEqual(baselineReceipt, view.receipt),
      }, operationId);
    },
    async readMailInboxPage(accountId, pageOptions = {}) {
      if (closed) {
        throw new Error("MySQL 持久连接池已关闭。");
      }
      if (!config.usePool) {
        const error = new Error("邮箱分页读取必须使用 MySQL 连接池。");
        error.code = "mysql_mail_inbox_page_pool_required";
        throw error;
      }
      // Validate before touching schema or acquiring a connection. A malformed
      // cursor must be a local fail-closed error, never a database query.
      const request = normalizeMysqlMailInboxPageRequest(accountId, pageOptions);
      ensureSchema();
      return runMysqlMailInboxPageRead(
        persistentWritePool(),
        request.recipientAccountId,
        {limit: request.limit, cursor: request.cursor},
        {transactionPolicy: config.transactionPolicy},
      );
    },
    async readSharedAssetView(request, readOptions = {}) {
      if (closed) {
        throw new Error("MySQL 持久连接池已关闭。");
      }
      if (!config.usePool) {
        const error = new Error("共享资产读穿必须使用 MySQL 连接池。");
        error.code = "mysql_shared_asset_pool_required";
        throw error;
      }
      if (lastPersistentData === null) {
        loadAuthoritySnapshot();
      }
      const result = await runMysqlSharedAssetRead(
        persistentWritePool(),
        request,
        lastPersistentData,
        {transactionPolicy: config.transactionPolicy},
      );
      assertMysqlSharedAssetRevision(lastPersistentRevision, result.storeRevision);
      if (readOptions.adopt === true) {
        const adopted = committedMysqlPersistentData(
          applySharedAssetReadView(lastPersistentData, result.view),
          {owned: true},
        );
        lastPersistentData = adopted;
      }
      return result.view;
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
        loadAuthoritySnapshot();
      }
      const statements = buildSaveStatementsFromPersistentData(data, lastPersistentData, {
        forceServerState: !serverStateReady,
      });
      if (statements.length > 0) {
        if (!config.singleWriterMaintenance) {
          const error = new Error("同步 MySQL 写入只允许显式停服维护模式。");
          error.code = "mysql_async_revision_cas_required";
          throw error;
        }
        if (!revisionCasEnabled) {
          const error = new Error("MySQL全局存档版本行缺失，拒绝停服维护写入。");
          error.code = MYSQL_STORE_REVISION_MISSING;
          throw error;
        }
        const writeStatements = singleWriterMaintenanceStatements(statements);
        runMysqlSaveStatements(config, config.database, writeStatements);
        lastPersistentRevision += 1;
        serverStateReady = true;
      }
      lastPersistentData = committedMysqlPersistentData(data, {owned: true});
    },
    async saveAsync(nextData, saveOptions = {}) {
      if (closed) {
        throw new Error("MySQL 持久连接池已关闭。");
      }
      if (readOnly) {
        throw new Error("Read-only MySQL auth store cannot save.");
      }
      const data = mysqlPersistentData(nextData);
      if (lastPersistentData === null) {
        loadAuthoritySnapshot();
      }
      const plan = buildMysqlSavePlanFromPersistentData(data, lastPersistentData, {
        forceServerState: !serverStateReady,
        consistencyScope: saveOptions.consistencyScope,
      });
      if (plan.kind !== "noop") {
        if (!config.usePool) {
          const error = new Error("在线异步 MySQL 写入必须使用带全局版本锁的连接池。");
          error.code = "mysql_async_revision_cas_required";
          throw error;
        }
        if (!revisionCasEnabled) {
          const error = new Error("MySQL全局存档版本行缺失，拒绝异步写入。");
          error.code = MYSQL_STORE_REVISION_MISSING;
          throw error;
        }
        const committed = await runMysqlPoolSavePlan(persistentWritePool(), plan, {
          expectedRevision: lastPersistentRevision,
          revisionCasEnabled: true,
          transactionPolicy: config.transactionPolicy,
        });
        if (committed.globalRevisionAdvanced === true) {
          lastPersistentRevision = committed.revision;
        }
        serverStateReady = true;
      }
      const committedData = committedMysqlPersistentData(data, {owned: true});
      lastPersistentData = mergeMysqlSaveBaselineAfterCommit(lastPersistentData, committedData, plan);
    },
    async saveAsyncOwned(nextData, saveOptions = {}) {
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
        loadAuthoritySnapshot();
      }
      const plan = buildMysqlSavePlanFromPersistentData(data, lastPersistentData, {
        forceServerState: !serverStateReady,
        consistencyScope: saveOptions.consistencyScope,
      });
      if (plan.kind !== "noop") {
        if (!config.usePool) {
          const error = new Error("在线异步 MySQL 写入必须使用带全局版本锁的连接池。");
          error.code = "mysql_async_revision_cas_required";
          throw error;
        }
        if (!revisionCasEnabled) {
          const error = new Error("MySQL全局存档版本行缺失，拒绝异步写入。");
          error.code = MYSQL_STORE_REVISION_MISSING;
          throw error;
        }
        const committed = await runMysqlPoolSavePlan(persistentWritePool(), plan, {
          expectedRevision: lastPersistentRevision,
          revisionCasEnabled: true,
          transactionPolicy: config.transactionPolicy,
        });
        if (committed.globalRevisionAdvanced === true) {
          lastPersistentRevision = committed.revision;
        }
        serverStateReady = true;
      }
      const committedData = committedMysqlPersistentData(data, {owned: true});
      lastPersistentData = mergeMysqlSaveBaselineAfterCommit(lastPersistentData, committedData, plan);
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

async function runMysqlDurableReceiptRead(pool, operationIdValue, options = {}) {
  const operationId = durableReceiptReadOperationId(operationIdValue);
  return runMysqlGuardedPoolTransaction(pool, options, async (connection) => {
    const rows = mysqlQueryRows(await connection.query(
      `SELECT revision_row.revision AS store_revision,
        receipt.operation_id, receipt.request_hash, receipt.action_id,
        receipt.account_id, receipt.committed_at, receipt.expires_at,
        receipt.document_json
        FROM auth_store_revisions AS revision_row
        LEFT JOIN mutation_receipts AS receipt ON receipt.operation_id = ?
        WHERE revision_row.scope_key = ?`,
      [operationId, MYSQL_STORE_REVISION_SCOPE],
    ));
    if (rows.length !== 1) {
      throw mysqlDurableReceiptIntegrityError("revision_row_count", operationId);
    }
    const row = rows[0] || {};
    const storeRevision = Number(row.store_revision);
    if (!Number.isSafeInteger(storeRevision) || storeRevision < 0) {
      throw mysqlDurableReceiptIntegrityError("store_revision", operationId);
    }
    if (row.operation_id === null || row.operation_id === undefined) {
      if ([
        row.request_hash,
        row.action_id,
        row.account_id,
        row.committed_at,
        row.expires_at,
        row.document_json,
      ].some((value) => value !== null && value !== undefined)) {
        throw mysqlDurableReceiptIntegrityError("missing_row_partial", operationId);
      }
      return canonicalDurableReceiptReadView({
        schemaVersion: 1,
        operationId,
        storeRevision,
        receipt: null,
      }, operationId);
    }
    let view;
    try {
      view = canonicalDurableReceiptReadView({
        schemaVersion: 1,
        operationId,
        storeRevision,
        receipt: mysqlSharedJsonDocument(row.document_json, "mutation_receipt_json"),
      }, operationId);
    } catch (cause) {
      const error = mysqlDurableReceiptIntegrityError("document_invalid", operationId);
      error.cause = cause;
      throw error;
    }
    const receipt = view.receipt;
    if (
      String(row.operation_id || "") !== operationId
      || String(row.request_hash || "") !== receipt.requestHash
      || String(row.action_id || "") !== receipt.actionId
      || String(row.account_id || "") !== receipt.accountId
      || String(row.committed_at || "") !== receipt.committedAt
      || String(row.expires_at || "") !== receipt.expiresAt
    ) {
      throw mysqlDurableReceiptIntegrityError("row_document_drift", operationId);
    }
    return view;
  });
}

function mysqlDurableReceiptIntegrityError(reason, operationId) {
  const error = new Error("MySQL 持久化操作回执行与文档不一致。");
  error.code = "mysql_durable_receipt_integrity_invalid";
  error.reason = String(reason || "unknown");
  error.resourceKey = String(operationId || "");
  return error;
}

function assertMysqlSharedAssetRevision(expectedValue, actualValue) {
  const expectedRevision = Number(expectedValue);
  const actualRevision = Number(actualValue);
  if (
    !Number.isSafeInteger(expectedRevision)
    || expectedRevision < 0
    || !Number.isSafeInteger(actualRevision)
    || actualRevision < 0
    || actualRevision !== expectedRevision
  ) {
    const error = new Error("MySQL 全局存档版本已变化，范围读穿前必须刷新完整权威根。");
    error.code = MYSQL_SHARED_ASSET_FULL_RELOAD_REQUIRED;
    error.expectedRevision = Number.isSafeInteger(expectedRevision) ? expectedRevision : null;
    error.actualRevision = Number.isSafeInteger(actualRevision) ? actualRevision : null;
    throw error;
  }
}

function normalizeMysqlMailInboxPageRequest(accountIdValue, optionsValue) {
  const recipientAccountId = typeof accountIdValue === "string" ? accountIdValue : "";
  if (!mysqlSharedAssetIdentity(recipientAccountId, 80)) {
    const error = new Error("MySQL邮箱分页请求缺少规范收件人身份。");
    error.code = "mysql_mail_inbox_page_request_invalid";
    throw error;
  }
  const options = normalizeMailInboxPageOptions(optionsValue, {requireExplicitLimit: true});
  return {recipientAccountId, limit: options.limit, cursor: options.cursor};
}

async function runMysqlMailInboxPageRead(pool, accountIdValue, optionsValue, transactionOptions = {}) {
  const request = normalizeMysqlMailInboxPageRequest(accountIdValue, optionsValue);
  return runMysqlGuardedPoolTransaction(pool, transactionOptions, async (connection) => {
    const cursorSql = request.cursor === null
      ? ""
      : " AND (created_at < ? OR (created_at = ? AND mail_id < ?))";
    const pageParams = request.cursor === null
      ? [request.recipientAccountId, request.limit + 1]
      : [
        request.recipientAccountId,
        request.cursor.createdAt,
        request.cursor.createdAt,
        request.cursor.mailId,
        request.limit + 1,
      ];
    const pageRows = mysqlQueryRows(await connection.query(
      `SELECT mail_id, sender_account_id, recipient_account_id, title,
        created_at, read_at, document_json
        FROM mail_messages
        WHERE recipient_account_id = ?${cursorSql}
        ORDER BY created_at DESC, mail_id DESC
        LIMIT ?`,
      pageParams,
    ));
    if (pageRows.length > request.limit + 1) {
      throw mysqlMailInboxPageIntegrityError("page_row_limit", request.recipientAccountId);
    }

    const unreadRows = mysqlQueryRows(await connection.query(
      `SELECT COUNT(*) AS unread_count
        FROM mail_messages
        WHERE recipient_account_id = ? AND read_at IS NULL`,
      [request.recipientAccountId],
    ));
    const unreadCount = unreadRows.length === 1
      ? Number(unreadRows[0] && unreadRows[0].unread_count)
      : Number.NaN;
    if (!Number.isSafeInteger(unreadCount) || unreadCount < 0) {
      throw mysqlMailInboxPageIntegrityError("unread_count", request.recipientAccountId);
    }

    const seenMailIds = new Set();
    const certifiedRows = pageRows.map((row) => {
      const mailId = String(row && row.mail_id || "");
      if (seenMailIds.has(mailId)) {
        throw mysqlMailInboxPageIntegrityError("duplicate_mail_id", mailId);
      }
      seenMailIds.add(mailId);
      return mysqlSharedMailDocument(row, mailId, request.recipientAccountId);
    });
    const hasMore = certifiedRows.length > request.limit;
    const mailRows = hasMore ? certifiedRows.slice(0, request.limit) : certifiedRows;
    const lastRow = mailRows[mailRows.length - 1] || null;
    const nextCursor = hasMore
      ? encodeMailInboxCursor({
        createdAt: String(lastRow && lastRow.createdAt || ""),
        mailId: String(lastRow && lastRow.mailId || ""),
      })
      : null;
    return canonicalMailInboxPageResult({
      recipientAccountId: request.recipientAccountId,
      mailRows,
      unreadCount,
      nextCursor,
      hasMore,
    }, request.recipientAccountId, {
      limit: request.limit,
      cursor: request.cursor,
    }, {
      // ORDER BY and the keyset WHERE predicate run under the same MySQL
      // collation. Re-applying JavaScript text ordering here would reject a
      // valid database page for values whose case/accent order differs.
      trustStoreOrder: true,
    });
  }, {
    beforeBegin: (connection) => connection.query(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ",
    ),
  });
}

function mysqlMailInboxPageIntegrityError(reason, key) {
  const error = new Error("MySQL邮箱分页结果不完整或身份不一致。");
  error.code = "mysql_mail_inbox_page_integrity_invalid";
  error.reason = String(reason || "invalid");
  error.resourceKey = String(key || "");
  return error;
}

async function runMysqlSharedAssetRead(pool, requestValue, baselineValue, options = {}) {
  const request = normalizeMysqlSharedAssetReadRequest(requestValue);
  const baseline = mysqlPersistentData(baselineValue);
  return runMysqlGuardedPoolTransaction(pool, options, async (connection) => {
    const revisionRows = mysqlQueryRows(await connection.query(
      "SELECT revision AS storeRevision FROM auth_store_revisions WHERE scope_key = 'auth'",
    ));
    const storeRevision = mysqlStoreRevisionFromQueryResult(revisionRows);
    if (storeRevision === null) {
      const error = new Error("MySQL 全局存档版本行缺失，拒绝共享资产读穿。");
      error.code = MYSQL_STORE_REVISION_MISSING;
      throw error;
    }

    const marketListings = (
      request.scope.startsWith("market_")
      || request.scope === "equipment_ownership"
    )
      ? await readMysqlSharedMarketListings(connection)
      : null;
    const resolvedMailRecipient = request.scope === "mail_send"
      ? await readMysqlSharedAccountByUsername(connection, request.recipientUsername)
      : null;
    const recipientAccountId = String(resolvedMailRecipient && resolvedMailRecipient.accountId || "");
    const mailRows = request.scope === "mail_mark_read"
      ? await readMysqlSharedExactMailRow(
        connection,
        request.targetMailId,
        request.accountId,
      )
      : null;

    const accountIds = new Set([request.accountId]);
    if (request.scope === "mail_send") {
      if (request.knownRecipientAccountId !== "") {
        accountIds.add(request.knownRecipientAccountId);
      }
      if (recipientAccountId !== "") {
        accountIds.add(recipientAccountId);
      }
    }
    if (marketListings !== null) {
      for (const listing of Object.values(marketListings)) {
        accountIds.add(String(listing.sellerAccountId || ""));
      }
    }
    const accounts = await readMysqlSharedAccounts(connection, Array.from(accountIds));
    if (!Object.hasOwn(accounts, request.accountId)) {
      throw mysqlSharedAssetIntegrityError("actor_account_missing", request.accountId);
    }
    if (request.scope === "mail_send" && recipientAccountId !== "") {
      const recipient = accounts[recipientAccountId];
      if (!recipient || String(recipient.username || "") !== request.recipientUsername) {
        throw mysqlSharedAssetIntegrityError("mail_recipient_mismatch", request.recipientUsername);
      }
    }
    if (marketListings !== null) {
      for (const listing of Object.values(marketListings)) {
        if (!Object.hasOwn(accounts, String(listing.sellerAccountId || ""))) {
          throw mysqlSharedAssetIntegrityError("listing_seller_missing", listing.listingId);
        }
      }
    }

    const profileAccountIds = new Set(
      request.scope === "mail_mark_read"
        || (request.scope === "mail_send" && request.includeActorProfile !== true)
        ? []
        : [request.accountId],
    );
    if (request.scope === "market_mutation" && request.listingId !== "") {
      const listing = marketListings && marketListings[request.listingId];
      if (listing) {
        profileAccountIds.add(String(listing.sellerAccountId || ""));
      }
    }
    const profileBindings = await readMysqlSharedProfileBindings(
      connection,
      Array.from(profileAccountIds),
    );
    for (const profileAccountId of profileAccountIds) {
      if (!Object.hasOwn(profileBindings, profileAccountId)) {
        throw mysqlSharedAssetIntegrityError("profile_binding_missing", profileAccountId);
      }
    }
    const playerIds = Object.values(profileBindings)
      .map((binding) => String(binding.playerId || ""))
      .filter(Boolean);
    const profiles = await readMysqlSharedProfiles(connection, playerIds);
    for (const [bindingAccountId, binding] of Object.entries(profileBindings)) {
      const playerId = String(binding.playerId || "");
      const profile = profiles[playerId];
      if (!profile || String(profile.accountId || "") !== bindingAccountId) {
        throw mysqlSharedAssetIntegrityError("binding_profile_mismatch", playerId);
      }
      if (Number(profile.profileRevision) !== Number(binding.profileRevision)) {
        throw mysqlSharedAssetIntegrityError("binding_profile_revision_mismatch", playerId);
      }
    }

    const includeProfileMailPartitions = request.includeProfileMailPartitions;
    const mailPartitionAccountIds = includeProfileMailPartitions
      ? Array.from(profileAccountIds).sort(compareCanonicalIds)
      : [];
    const mailPartitions = [];
    for (const profileAccountId of mailPartitionAccountIds) {
      // Equipment ownership spans profile/bank, mailbox and market containers.
      // Keep every replaced profile paired with its authoritative mailbox in
      // the same RR view so another Node's claim cannot create a mixed root.
      mailPartitions.push(await readMysqlSharedMailPartition(connection, profileAccountId));
    }

    const marketConfig = marketListings === null
      ? null
      : await readMysqlSharedMarketConfig(connection);
    let envelopeIds;
    try {
      envelopeIds = sharedAssetReadReferencedEnvelopeIds({
        marketListings,
        mailPartitions,
        profiles,
      });
    } catch {
      throw mysqlSharedAssetIntegrityError("equipment_envelope_reference_invalid", request.accountId);
    }
    const consumedRows = await readMysqlSharedConsumedEnvelopes(connection, envelopeIds);

    const view = {
      schemaVersion: 1,
      scope: request.scope,
      accountId: request.accountId,
      recipientUsername: request.scope === "mail_send" ? request.recipientUsername : "",
      knownRecipientAccountId: request.scope === "mail_send"
        ? request.knownRecipientAccountId
        : "",
      recipientAccountId: request.scope === "mail_send" ? recipientAccountId : "",
      includeActorProfile: request.scope === "mail_send" && request.includeActorProfile,
      includeProfileMailPartitions,
      ...(request.scope === "mail_mark_read" ? {
        targetMailId: request.targetMailId,
        mailRows,
      } : {}),
      accounts: entityReplacement(accountIds, accounts),
      profileBindings: entityReplacement(profileAccountIds, profileBindings),
      profiles: entityReplacement(playerIds, profiles),
      marketListings,
      marketConfig,
      mailPartitions,
      consumedEquipmentEnvelopeIds: Object.keys(consumedRows).sort(compareCanonicalIds),
    };
    // Reuse the same certifier that applies the view. This rejects malformed
    // or non-canonical database projections before either service/store cache
    // can adopt them.
    applySharedAssetReadView(baseline, view);
    return {storeRevision, view};
  }, {
    beforeBegin: (connection) => connection.query(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ",
    ),
  });
}

function normalizeMysqlSharedAssetReadRequest(value) {
  const request = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const scope = String(request.scope || "");
  const accountId = String(request.accountId || "");
  const listingId = String(request.listingId || "");
  const mailId = String(request.mailId || "");
  const targetMailId = scope === "mail_mark_read" ? mailId : "";
  const recipientUsername = String(request.recipientUsername || "");
  const knownRecipientAccountId = String(request.knownRecipientAccountId || "");
  const includeActorProfile = request.includeActorProfile === true;
  const includeProfileMailPartitions = request.includeProfileMailPartitions === true;
  if (
    ![
      "market_read",
      "market_mutation",
      "mail_read",
      "mail_mutation",
      "mail_mark_read",
      "mail_send",
      "equipment_ownership",
    ].includes(scope)
    || !mysqlSharedAssetIdentity(accountId, 80)
    || (listingId !== "" && !mysqlSharedAssetIdentity(listingId, 96))
    || (mailId !== "" && !mysqlSharedAssetIdentity(mailId, 96))
    || (scope === "market_mutation" && listingId === "")
    || (scope === "mail_mutation" && mailId === "")
    || (scope === "mail_mark_read" && !mysqlSharedAssetIdentity(mailId, 96))
    || (scope === "mail_send" && (
      !mysqlSharedAssetIdentity(recipientUsername, 20)
      || (knownRecipientAccountId !== ""
        && !mysqlSharedAssetIdentity(knownRecipientAccountId, 80))
      || typeof request.includeActorProfile !== "boolean"
      || (includeProfileMailPartitions && !includeActorProfile)
    ))
    || typeof request.includeProfileMailPartitions !== "boolean"
    || (["mail_read", "mail_mutation"].includes(scope)
      && !includeProfileMailPartitions)
    || (scope === "equipment_ownership" && !includeProfileMailPartitions)
    || (scope === "mail_mark_read" && includeProfileMailPartitions)
    || (scope !== "mail_send" && (
      recipientUsername !== ""
      || knownRecipientAccountId !== ""
      || request.includeActorProfile !== undefined
    ))
  ) {
    const error = new Error("共享资产读穿请求不完整。");
    error.code = "mysql_shared_asset_read_request_invalid";
    throw error;
  }
  return {
    scope,
    accountId,
    listingId,
    mailId,
    targetMailId,
    recipientUsername,
    knownRecipientAccountId,
    includeActorProfile,
    includeProfileMailPartitions,
  };
}

async function readMysqlSharedMarketListings(connection) {
  const rows = mysqlQueryRows(await connection.query(
    `SELECT listing_id, seller_account_id, item_id, currency, unit_price,
      item_count, created_at, document_json
      FROM market_listings ORDER BY listing_id LIMIT ${MARKET_MAX_LISTINGS + 1}`,
  ));
  if (rows.length > MARKET_MAX_LISTINGS) {
    throw mysqlSharedAssetIntegrityError("market_listing_limit", String(rows.length));
  }
  const listings = {};
  for (const row of rows) {
    const listing = mysqlSharedJsonDocument(row && row.document_json, "market_listing_json");
    const listingId = String(row && row.listing_id || "");
    if (
      !mysqlSharedAssetIdentity(listingId, 96)
      || Object.hasOwn(listings, listingId)
      || String(listing.listingId || "") !== listingId
      || String(listing.sellerAccountId || "") !== String(row.seller_account_id || "")
      || String(listing.itemId || "") !== String(row.item_id || "")
      || String(listing.currency || "") !== String(row.currency || "")
      || Number(listing.unitPrice) !== Number(row.unit_price)
      || Number(listing.count) !== Number(row.item_count)
      || String(listing.createdAt || "") !== String(row.created_at || "")
    ) {
      throw mysqlSharedAssetIntegrityError("market_listing_row_drift", listingId);
    }
    listings[listingId] = listing;
  }
  return canonicalEntityMap(listings);
}

async function readMysqlSharedMailPartition(connection, recipientAccountId) {
  const rows = mysqlQueryRows(await connection.query(
    `SELECT mail_id, sender_account_id, recipient_account_id, title,
      created_at, read_at, document_json
      FROM mail_messages WHERE recipient_account_id = ? ORDER BY mail_id`,
    [recipientAccountId],
  ));
  const messages = {};
  for (const row of rows) {
    const mailId = String(row && row.mail_id || "");
    if (Object.hasOwn(messages, mailId)) {
      throw mysqlSharedAssetIntegrityError("mail_message_row_drift", mailId);
    }
    messages[mailId] = mysqlSharedMailDocument(row, mailId, recipientAccountId);
  }
  return {recipientAccountId, messages: canonicalEntityMap(messages)};
}

async function readMysqlSharedExactMailRow(connection, mailId, recipientAccountId) {
  const rows = mysqlQueryRows(await connection.query(
    `SELECT mail_id, sender_account_id, recipient_account_id, title,
      created_at, read_at, document_json
      FROM mail_messages WHERE mail_id = ? AND recipient_account_id = ?`,
    [mailId, recipientAccountId],
  ));
  if (rows.length > 1) {
    throw mysqlSharedAssetIntegrityError("mail_message_row_count", mailId);
  }
  const values = {};
  if (rows.length === 1) {
    values[mailId] = mysqlSharedMailDocument(rows[0], mailId, recipientAccountId);
  }
  return entityReplacement([mailId], values);
}

function mysqlSharedMailDocument(row, expectedMailId, expectedRecipientAccountId) {
  const mail = mysqlSharedJsonDocument(row && row.document_json, "mail_message_json");
  const mailId = String(row && row.mail_id || "");
  const recipientAccountId = String(row && row.recipient_account_id || "");
  const rowReadAt = row && row.read_at === null ? null : String(row && row.read_at || "");
  const documentReadAt = mail.readAt === null || mail.readAt === undefined
    ? null
    : String(mail.readAt || "");
  if (
    !mysqlSharedAssetIdentity(mailId, 96)
    || mailId !== expectedMailId
    || String(mail.mailId || "") !== mailId
    || String(mail.senderAccountId || "") !== String(row && row.sender_account_id || "")
    || recipientAccountId !== expectedRecipientAccountId
    || String(mail.recipientAccountId || "") !== recipientAccountId
    || String(mail.title || "") !== String(row && row.title || "")
    || String(mail.createdAt || "") !== String(row && row.created_at || "")
    || documentReadAt !== rowReadAt
  ) {
    throw mysqlSharedAssetIntegrityError("mail_message_row_drift", mailId || expectedMailId);
  }
  return mail;
}

async function readMysqlSharedAccountByUsername(connection, usernameValue) {
  const username = String(usernameValue || "");
  if (!mysqlSharedAssetIdentity(username, 20)) {
    throw mysqlSharedAssetIntegrityError("mail_recipient_username_invalid", username);
  }
  const rows = mysqlQueryRows(await connection.query(
    `SELECT account_id, username, display_name, role, created_at, updated_at, document_json
      FROM accounts WHERE username = ?`,
    [username],
  ));
  if (rows.length === 0) {
    return null;
  }
  if (rows.length !== 1) {
    throw mysqlSharedAssetIntegrityError("mail_recipient_username_duplicate", username);
  }
  const row = rows[0] || {};
  const account = mysqlSharedJsonDocument(row.document_json, "account_json");
  const accountId = String(row.account_id || "");
  if (
    !mysqlSharedAssetIdentity(accountId, 80)
    || String(row.username || "") !== username
    || String(account.accountId || "") !== accountId
    || String(account.username || "") !== username
    || String(account.displayName || "") !== String(row.display_name || "")
    || String(account.role || "") !== String(row.role || "")
    || String(account.createdAt || "") !== String(row.created_at || "")
    || String(account.updatedAt || "") !== String(row.updated_at || "")
  ) {
    throw mysqlSharedAssetIntegrityError("mail_recipient_account_row_drift", username);
  }
  return account;
}

async function readMysqlSharedAccounts(connection, accountIdsValue) {
  const accountIds = canonicalIdentities(accountIdsValue, 80);
  if (accountIds.length === 0) {
    return {};
  }
  const rows = mysqlQueryRows(await connection.query(
    `SELECT account_id, username, display_name, role, created_at, updated_at, document_json
      FROM accounts WHERE account_id IN (${mysqlPlaceholders(accountIds.length)}) ORDER BY account_id`,
    accountIds,
  ));
  const accounts = {};
  for (const row of rows) {
    const account = mysqlSharedJsonDocument(row && row.document_json, "account_json");
    const accountId = String(row && row.account_id || "");
    if (
      !accountIds.includes(accountId)
      || Object.hasOwn(accounts, accountId)
      || String(account.accountId || "") !== accountId
      || String(account.username || "") !== String(row.username || "")
      || String(account.displayName || "") !== String(row.display_name || "")
      || String(account.role || "") !== String(row.role || "")
      || String(account.createdAt || "") !== String(row.created_at || "")
      || String(account.updatedAt || "") !== String(row.updated_at || "")
    ) {
      throw mysqlSharedAssetIntegrityError("account_row_drift", accountId);
    }
    accounts[accountId] = account;
  }
  return canonicalEntityMap(accounts);
}

async function readMysqlSharedProfileBindings(connection, accountIdsValue) {
  const accountIds = canonicalIdentities(accountIdsValue, 80);
  if (accountIds.length === 0) {
    return {};
  }
  const rows = mysqlQueryRows(await connection.query(
    `SELECT account_id, player_id, profile_revision, updated_at, document_json
      FROM profile_bindings WHERE account_id IN (${mysqlPlaceholders(accountIds.length)}) ORDER BY account_id`,
    accountIds,
  ));
  const bindings = {};
  for (const row of rows) {
    const binding = mysqlSharedJsonDocument(row && row.document_json, "profile_binding_json");
    const accountId = String(row && row.account_id || "");
    const rowRevision = Number(row && row.profile_revision);
    const documentRevision = Number(binding.profileRevision);
    if (
      !accountIds.includes(accountId)
      || Object.hasOwn(bindings, accountId)
      || String(binding.accountId || "") !== accountId
      || String(binding.playerId || "") !== String(row.player_id || "")
      || String(binding.updatedAt || "") !== String(row.updated_at || "")
    ) {
      throw mysqlSharedAssetIntegrityError("profile_binding_row_drift", accountId);
    }
    if (
      !Number.isSafeInteger(rowRevision)
      || rowRevision < 0
      || !Number.isSafeInteger(documentRevision)
      || documentRevision < 0
      || documentRevision !== rowRevision
    ) {
      throw mysqlSharedAssetIntegrityError("profile_revision_invalid", accountId);
    }
    bindings[accountId] = binding;
  }
  return canonicalEntityMap(bindings);
}

async function readMysqlSharedProfiles(connection, playerIdsValue) {
  const playerIds = canonicalIdentities(playerIdsValue, 80);
  if (playerIds.length === 0) {
    return {};
  }
  const rows = mysqlQueryRows(await connection.query(
    `SELECT player_id, account_id, profile_revision, updated_at, profile_json
      FROM profiles WHERE player_id IN (${mysqlPlaceholders(playerIds.length)}) ORDER BY player_id`,
    playerIds,
  ));
  const profiles = {};
  for (const row of rows) {
    const playerId = String(row && row.player_id || "");
    const profile = mysqlSharedJsonDocument(row && row.profile_json, "profile_json");
    const profileRevision = Number(row && row.profile_revision);
    if (!playerIds.includes(playerId) || Object.hasOwn(profiles, playerId)) {
      throw mysqlSharedAssetIntegrityError("profile_row_drift", playerId);
    }
    if (!Number.isSafeInteger(profileRevision) || profileRevision < 0) {
      throw mysqlSharedAssetIntegrityError("profile_revision_invalid", playerId);
    }
    profiles[playerId] = {
      playerId,
      accountId: String(row.account_id || ""),
      profileRevision,
      updatedAt: String(row.updated_at || ""),
      profile,
    };
  }
  return canonicalEntityMap(profiles);
}

async function readMysqlSharedMarketConfig(connection) {
  const rows = mysqlQueryRows(await connection.query(
    "SELECT document_json FROM server_state WHERE state_key = 'auth'",
  ));
  if (rows.length !== 1) {
    throw mysqlSharedAssetIntegrityError("server_state_missing", "auth");
  }
  const state = mysqlSharedJsonDocument(rows[0].document_json, "server_state_json");
  const marketConfig = state.marketConfig;
  if (!marketConfig || typeof marketConfig !== "object" || Array.isArray(marketConfig)) {
    throw mysqlSharedAssetIntegrityError("market_config_missing", "auth");
  }
  return marketConfig;
}

async function readMysqlSharedConsumedEnvelopes(connection, envelopeIdsValue) {
  const envelopeIds = canonicalIdentities(envelopeIdsValue, 160);
  if (envelopeIds.length === 0) {
    return {};
  }
  const rows = mysqlQueryRows(await connection.query(
    `SELECT envelope_id FROM consumed_equipment_envelopes
      WHERE envelope_id IN (${mysqlPlaceholders(envelopeIds.length)}) ORDER BY envelope_id`,
    envelopeIds,
  ));
  const consumed = {};
  for (const row of rows) {
    const envelopeId = String(row && row.envelope_id || "");
    if (!envelopeIds.includes(envelopeId) || Object.hasOwn(consumed, envelopeId)) {
      throw mysqlSharedAssetIntegrityError("consumed_envelope_row_drift", envelopeId);
    }
    consumed[envelopeId] = {schemaVersion: 1, envelopeId};
  }
  return canonicalEntityMap(consumed);
}

function entityReplacement(keysValue, values) {
  const keys = Array.from(new Set(Array.from(keysValue || []).map(String)))
    .filter(Boolean)
    .sort(compareCanonicalIds);
  return {keys, values: canonicalEntityMap(values)};
}

function canonicalEntityMap(value) {
  return Object.fromEntries(
    Object.entries(value || {}).sort(([left], [right]) => compareCanonicalIds(left, right)),
  );
}

function canonicalIdentities(values, maxLength) {
  const result = Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || ""))))
    .filter((value) => mysqlSharedAssetIdentity(value, maxLength))
    .sort(compareCanonicalIds);
  return result;
}

function mysqlSharedAssetIdentity(value, maxLength) {
  return typeof value === "string"
    && value !== ""
    && value === value.trim()
    && value.length <= maxLength
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function mysqlPlaceholders(count) {
  return Array.from({length: count}, () => "?").join(", ");
}

function mysqlQueryRows(result) {
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  if (!Array.isArray(rows)) {
    throw mysqlSharedAssetIntegrityError("query_result_invalid", "");
  }
  return rows;
}

function mysqlSharedJsonDocument(value, reason) {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw mysqlSharedAssetIntegrityError(reason, "json_parse");
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw mysqlSharedAssetIntegrityError(reason, "not_object");
  }
  return structuredClone(parsed);
}

function mysqlSharedAssetIntegrityError(reason, key) {
  const error = new Error("MySQL 共享资产读穿发现行身份或文档不一致。");
  error.code = "mysql_shared_asset_integrity_invalid";
  error.reason = String(reason || "invalid");
  error.resourceKey = String(key || "");
  return error;
}

function buildSaveStatements(nextData, previousData = null) {
  const data = mysqlPersistentData(nextData);
  const previous = previousData ? mysqlPersistentData(previousData) : emptyPersistentData();
  return buildSaveStatementsFromPersistentData(data, previous);
}

function buildSaveStatementsFromPersistentData(data, previous, options = {}) {
  const groups = buildSaveStatementGroupsFromPersistentData(data, previous, options);
  const statements = mysqlSaveStatementsFromGroups(groups);
  if (statements.length === 0) {
    return [];
  }
  return ["START TRANSACTION", ...statements, "COMMIT"];
}

function buildSaveStatementGroupsFromPersistentData(data, previous, options = {}) {
  const groups = {
    serverState: [],
    accounts: [],
    sessions: [],
    profileBindings: [],
    profiles: [],
    mutationReceipts: [],
    mailMessages: [],
    marketListings: [],
    consumedEquipmentEnvelopes: [],
    parties: [],
    families: [],
    manors: [],
    manorBattles: [],
    manorWars: [],
    chatMessages: [],
    battleRecords: [],
    battleTrace: [],
    gmUserGrants: [],
    gmCommandGrants: [],
    gmCommandAudit: [],
    authEvents: [],
    serviceEvents: [],
  };
  Object.defineProperty(groups, "mutationReceiptWrites", {
    configurable: false,
    enumerable: false,
    value: [],
    writable: false,
  });
  Object.defineProperty(groups, "mailAuthorityChanges", {
    configurable: false,
    enumerable: false,
    value: [],
    writable: false,
  });
  const previousState = persistentServerStateDocument(previous);
  const nextState = persistentServerStateDocument(data);
  if (options.forceServerState === true || entityChanged(previousState, nextState)) {
    groups.serverState.push(upsertStateStatement(nextState));
  }
  appendObjectEntityDiff(groups.accounts, "accounts", "account_id", previous.accounts, data.accounts, accountEntityKey, insertAccountStatement);
  appendObjectEntityDiff(groups.sessions, "sessions", "session_id", previous.sessions, data.sessions, sessionEntityKey, insertSessionStatement);
  appendObjectEntityDiff(groups.profileBindings, "profile_bindings", "account_id", previous.profileBindings, data.profileBindings, profileBindingEntityKey, insertProfileBindingStatement);
  appendObjectEntityDiff(groups.profiles, "profiles", "player_id", previous.profiles, data.profiles, profileEntityKey, insertProfileStatement);
  appendMutationReceiptDeltaOrDiff(
    groups.mutationReceipts,
    previous.mutationReceipts,
    data.mutationReceipts,
    {
      typedWrites: groups.mutationReceiptWrites,
      requireCertifiedDeletes: options.requireCertifiedReceiptDeletes === true,
    },
  );
  appendMailAuthorityDeltaOrDiff(
    groups.mailMessages,
    previous.mailMessages,
    data.mailMessages,
    {
      allowCertifiedDelta: options.allowCertifiedMailDelta === true,
      typedChanges: groups.mailAuthorityChanges,
    },
  );
  appendObjectEntityDiff(groups.marketListings, "market_listings", "listing_id", previous.marketListings, data.marketListings, marketListingEntityKey, insertMarketListingStatement, {strictInsertNew: true});
  appendConsumedEquipmentEnvelopeDeltaOrDiff(
    groups.consumedEquipmentEnvelopes,
    previous.consumedEquipmentEnvelopes,
    data.consumedEquipmentEnvelopes,
  );
  appendObjectEntityDiff(groups.parties, "parties", "party_id", previous.parties, data.parties, partyEntityKey, insertPartyStatement);
  appendObjectEntityDiff(groups.families, "families", "family_id", previous.families, data.families, familyEntityKey, insertFamilyStatement);
  appendObjectEntityDiff(groups.manors, "manors", "manor_id", previous.manors, data.manors, manorEntityKey, insertManorStatement);
  appendArrayEntityDiff(groups.manorBattles, "manor_battles", "battle_id", previous.manorBattles, data.manorBattles, manorBattleEntityKey, insertManorBattleStatement);
  appendArrayEntityDiff(groups.manorWars, "manor_wars", "war_id", previous.manorWars, data.manorWars, manorWarEntityKey, insertManorWarStatement);
  appendArrayEntityDiff(groups.chatMessages, "chat_messages", "message_id", previous.chatMessages, data.chatMessages, chatMessageEntityKey, insertChatMessageStatement);
  appendImmutableHistoryInserts(groups.battleRecords, previous.battleRecords, data.battleRecords, battleRecordEntityKey, insertBattleRecordStatement);
  appendImmutableHistoryInserts(groups.battleTrace, previous.battleTrace, data.battleTrace, battleTraceEntityKey, insertBattleTraceStatement);
  appendObjectEntityDiff(groups.gmUserGrants, "gm_user_grants", "account_id", previous.gmUserGrants, data.gmUserGrants, gmUserGrantEntityKey, insertGmUserGrantStatement);
  appendGmCommandGrantDiff(groups.gmCommandGrants, previous.gmCommandGrants, data.gmCommandGrants);
  appendArrayEntityDiff(groups.gmCommandAudit, "gm_command_audit", "audit_id", previous.gmCommandAudit, data.gmCommandAudit, gmCommandAuditEntityKey, insertGmCommandAuditStatement);
  appendArrayEntityDiff(groups.authEvents, "auth_events", "event_id", previous.authEvents, data.authEvents, authEventEntityKey, insertAuthEventStatement);
  appendArrayEntityDiff(groups.serviceEvents, "service_events", "event_seq", previous.serviceEvents, data.serviceEvents, serviceEventEntityKey, insertServiceEventStatement);
  return groups;
}

function mysqlSaveStatementsFromGroups(groups) {
  return [
    groups.serverState,
    groups.accounts,
    groups.sessions,
    groups.profileBindings,
    groups.profiles,
    groups.mutationReceipts,
    groups.mailMessages,
    groups.marketListings,
    groups.consumedEquipmentEnvelopes,
    groups.parties,
    groups.families,
    groups.manors,
    groups.manorBattles,
    groups.manorWars,
    groups.chatMessages,
    groups.battleRecords,
    groups.battleTrace,
    groups.gmUserGrants,
    groups.gmCommandGrants,
    groups.gmCommandAudit,
    groups.authEvents,
    groups.serviceEvents,
  ].flat();
}

function buildMysqlSavePlanFromPersistentData(data, previous, options = {}) {
  const allowCertifiedMailDelta = Boolean(
    options.consistencyScope
    && typeof options.consistencyScope === "object"
    && !Array.isArray(options.consistencyScope),
  );
  let groups = buildSaveStatementGroupsFromPersistentData(data, previous, {
    ...options,
    allowCertifiedMailDelta,
    requireCertifiedReceiptDeletes: true,
  });
  let statements = mysqlSaveStatementsFromGroups(groups);
  if (statements.length === 0) {
    return {kind: "noop"};
  }
  const conditionalPlan = buildConditionalMysqlSavePlan(
    data,
    previous,
    groups,
    options.consistencyScope,
  );
  if (conditionalPlan !== null) {
    return conditionalPlan;
  }
  if (allowCertifiedMailDelta) {
    // A certified touched-mail delta is safe only after a row-local planner
    // accepts the complete write set. Legacy global CAS must rediscover the
    // full diff so an unsupported caller cannot hide unrelated changes.
    groups = buildSaveStatementGroupsFromPersistentData(data, previous, {
      ...options,
      allowCertifiedMailDelta: false,
      requireCertifiedReceiptDeletes: true,
    });
    statements = mysqlSaveStatementsFromGroups(groups);
    if (statements.length === 0) {
      return {kind: "noop"};
    }
  }
  const legacyMarketCreateCapacity = legacyMarketCreateCapacityProtection(previous, data);
  const legacyReceiptWrites = groups.mutationReceiptWrites;
  const legacyReceiptCapacityWrite = legacyMutationReceiptCapacityWrite(legacyReceiptWrites);
  return {
    kind: "legacy_global_cas",
    globalRevisionFence: true,
    resourceLocks: [
      ...(groups.serverState.length > 0 && options.forceServerState !== true
        ? [serverStateResourceLock(persistentServerStateDocument(previous))]
        : []),
      ...buildLegacyProfileResourceLocks(previous),
      ...(legacyMarketCreateCapacity === null ? [] : [legacyMarketCreateCapacity.lock]),
    ],
    ...(legacyMarketCreateCapacity === null
      ? {}
      : {
        capacityCheck: legacyMarketCreateCapacity.capacityCheck,
        marketCreateCapacitySellerAccountId: legacyMarketCreateCapacity.sellerAccountId,
      }),
    ...(legacyReceiptCapacityWrite === null
      ? {}
      : {receiptCapacityWrite: legacyReceiptCapacityWrite}),
    ...(legacyReceiptWrites.length === 0
      ? {}
      : {receiptWrites: legacyReceiptWrites}),
    statements: ["START TRANSACTION", ...statements, "COMMIT"],
  };
}

function buildConditionalMysqlSavePlan(data, previous, groups, consistencyScope) {
  for (const build of [
    buildConditionalProfileSavePlan,
    buildConditionalMarketCreateSavePlan,
    buildConditionalMarketCancelSavePlan,
    buildConditionalMarketBuySavePlan,
    buildConditionalMailSendSavePlan,
    buildConditionalMailReadSavePlan,
    buildConditionalMailClaimSavePlan,
  ]) {
    const plan = build(data, previous, groups, consistencyScope);
    if (plan !== null) {
      return plan;
    }
  }
  return null;
}

function legacyMutationReceiptCapacityWrite(writes) {
  let delta = 0;
  for (const write of Array.isArray(writes) ? writes : []) {
    if (write && write.resource === "mutation_receipt" && write.kind === "insert") {
      delta += 1;
    } else if (write && write.resource === "mutation_receipt" && write.kind === "delete") {
      delta -= 1;
    } else {
      const error = new Error("MySQL legacy 回执容量变化包含未知语句。");
      error.code = "mysql_resource_precondition_invalid";
      throw error;
    }
  }
  if (delta === 0) {
    return null;
  }
  if (!Number.isSafeInteger(delta) || Math.abs(delta) > DURABLE_RECEIPT_MAX_COUNT) {
    const error = new Error("MySQL legacy 回执容量变化越界。");
    error.code = "mysql_resource_precondition_invalid";
    throw error;
  }
  return mutationReceiptCapacityAdjustment(delta);
}

function legacyMarketCreateCapacityProtection(previous, data) {
  const listingAddition = singleNewObjectEntityAddition(
    previous.marketListings,
    data.marketListings,
    marketListingEntityKey,
  );
  if (listingAddition === null) {
    return null;
  }
  const sellerAccountId = listingAddition.next && listingAddition.next.sellerAccountId;
  if (
    typeof sellerAccountId !== "string"
    || sellerAccountId === ""
    || sellerAccountId.trim() !== sellerAccountId
  ) {
    throw mysqlLegacyMarketCreateCapacityPlanInvalid();
  }
  return {
    sellerAccountId,
    lock: marketCreateCapacityResourceLock(),
    capacityCheck: marketCreateCapacityCheck(sellerAccountId),
  };
}

function buildConditionalMarketCreateSavePlan(data, previous, groups, consistencyScopeValue) {
  const consistencyScope = rowLocalMarketCreateConsistencyScope(consistencyScopeValue);
  if (consistencyScope === null
    || Number(data.schemaVersion || 0) !== Number(previous.schemaVersion || 0)) {
    return null;
  }
  const allowedGroups = new Set([
    "profileBindings",
    "profiles",
    "mutationReceipts",
    "marketListings",
  ]);
  for (const [groupName, statements] of Object.entries(groups)) {
    if (!allowedGroups.has(groupName) && statements.length > 0) {
      return null;
    }
  }
  if (
    groups.profileBindings.length !== 1
    || groups.profiles.length !== 1
    || groups.marketListings.length !== 1
  ) {
    return null;
  }

  const profileRevisionChange = certifiedSingleProfileRevisionChange(previous, data);
  const listingAddition = singleNewObjectEntityAddition(
    previous.marketListings,
    data.marketListings,
    marketListingEntityKey,
  );
  const previousListings = canonicalObjectEntityMap(previous.marketListings, marketListingEntityKey);
  if (profileRevisionChange === null || listingAddition === null || previousListings === null) {
    return null;
  }
  const {
    accountId,
    playerId,
    expectedRevision,
    beforeBinding,
    nextBinding,
    beforeProfile,
    nextProfile,
  } = profileRevisionChange;
  const listing = listingAddition.next;
  const listingId = listingAddition.key;
  const ordinaryListingFields = new Set([
    "listingId",
    "sellerAccountId",
    "itemId",
    "count",
    "unitPrice",
    "currency",
    "createdAt",
    "schemaVersion",
  ]);
  const observedTotalListingCount = previousListings.size;
  let observedSellerListingCount = 0;
  for (const previousListing of previousListings.values()) {
    if (String(previousListing && previousListing.sellerAccountId || "") === accountId) {
      observedSellerListingCount += 1;
    }
  }
  if (
    consistencyScope.accountId !== accountId
    || consistencyScope.playerId !== playerId
    || consistencyScope.listingId !== listingId
    || consistencyScope.observedTotalListingCount !== observedTotalListingCount
    || consistencyScope.observedSellerListingCount !== observedSellerListingCount
    || consistencyScope.maxTotalListings !== MARKET_MAX_LISTINGS
    || consistencyScope.maxSellerListings !== MARKET_MAX_LISTINGS_PER_SELLER
    || observedTotalListingCount >= MARKET_MAX_LISTINGS
    || observedSellerListingCount >= MARKET_MAX_LISTINGS_PER_SELLER
    || typeof listing.listingId !== "string"
    || listing.listingId !== listingId
    || typeof listing.sellerAccountId !== "string"
    || listing.sellerAccountId !== accountId
    || typeof listing.itemId !== "string"
    || listing.itemId === ""
    || listing.itemId.trim() !== listing.itemId
    || !["stoneCoins", "diamonds"].includes(listing.currency)
    || !Number.isSafeInteger(listing.count)
    || listing.count <= 0
    || !Number.isSafeInteger(listing.unitPrice)
    || listing.unitPrice <= 0
    || typeof listing.createdAt !== "string"
    || listing.createdAt === ""
    || listing.createdAt.trim() !== listing.createdAt
    || listing.schemaVersion !== 1
    || Object.keys(listing).length !== ordinaryListingFields.size
    || Object.keys(listing).some((field) => !ordinaryListingFields.has(field))
  ) {
    return null;
  }

  const receiptWriteSet = conditionalMutationReceiptWriteSet(
    previous.mutationReceipts,
    data.mutationReceipts,
    groups.mutationReceipts,
  );
  if (receiptWriteSet === null) {
    return null;
  }
  const receipt = receiptWriteSet.receipt;
  if (
    receipt === null
    || String(receipt.operationId || "") !== consistencyScope.operationId
    || String(receipt.requestHash || "") !== consistencyScope.requestHash
    || String(receipt.actionId || "") !== consistencyScope.actionId
    || String(receipt.accountId || "") !== accountId
  ) {
    return null;
  }

  return buildMysqlResourceAcquisitionPlan({
    kind: "market_create_conditional_v1",
    globalRevisionFence: false,
    globalCompatibilityBarrier: "shared",
    accountId,
    playerId,
    listingId,
    operationId: consistencyScope.operationId,
    observedTotalListingCount,
    observedSellerListingCount,
    maxTotalListings: MARKET_MAX_LISTINGS,
    maxSellerListings: MARKET_MAX_LISTINGS_PER_SELLER,
    expectedProfileRevision: expectedRevision,
    nextProfileRevision: expectedRevision + 1,
    capacityCheck: marketCreateCapacityCheck(accountId),
    locks: [
      profileBindingResourceLock(beforeBinding),
      profileResourceLock(beforeProfile),
      marketCreateCapacityResourceLock(),
    ],
    writes: [
      conditionalProfileBindingUpdate(nextBinding, expectedRevision),
      conditionalProfileUpdate(nextProfile, expectedRevision),
      conditionalMarketListingInsert(listing),
      ...receiptWriteSet.writes,
    ],
  });
}

function buildConditionalProfileSavePlan(data, previous, groups, consistencyScopeValue) {
  const consistencyScope = rowLocalProfileConsistencyScope(consistencyScopeValue);
  if (consistencyScope === null) {
    return null;
  }
  if (Number(data.schemaVersion || 0) !== Number(previous.schemaVersion || 0)) {
    return null;
  }
  const allowedGroups = new Set(["profileBindings", "profiles", "mutationReceipts"]);
  for (const [groupName, statements] of Object.entries(groups)) {
    if (!allowedGroups.has(groupName) && statements.length > 0) {
      return null;
    }
  }
  if (groups.profileBindings.length !== 1 || groups.profiles.length !== 1) {
    return null;
  }

  const profileRevisionChange = certifiedSingleProfileRevisionChange(previous, data);
  if (profileRevisionChange === null) {
    return null;
  }
  const {
    accountId,
    playerId,
    expectedRevision,
    beforeBinding,
    nextBinding,
    beforeProfile,
    nextProfile,
  } = profileRevisionChange;

  const receiptWriteSet = conditionalMutationReceiptWriteSet(
    previous.mutationReceipts,
    data.mutationReceipts,
    groups.mutationReceipts,
  );
  if (receiptWriteSet === null) {
    return null;
  }
  const receipt = receiptWriteSet.receipt;
  if (
    consistencyScope.accountId !== accountId
    || consistencyScope.playerId !== playerId
    || receipt === null
    || String(receipt.operationId || "") !== consistencyScope.operationId
    || String(receipt.requestHash || "") !== consistencyScope.requestHash
    || String(receipt.actionId || "") !== consistencyScope.actionId
    || String(receipt.accountId || "") !== accountId
  ) {
    return null;
  }

  const locks = [
    profileBindingResourceLock(beforeBinding),
    profileResourceLock(beforeProfile),
  ];
  const writes = [
    conditionalProfileBindingUpdate(nextBinding, expectedRevision),
    conditionalProfileUpdate(nextProfile, expectedRevision),
    ...receiptWriteSet.writes,
  ];
  return buildMysqlResourceAcquisitionPlan({
    kind: "profile_conditional_v2",
    globalRevisionFence: false,
    globalCompatibilityBarrier: "shared",
    accountId,
    playerId,
    operationId: consistencyScope.operationId,
    expectedProfileRevision: expectedRevision,
    nextProfileRevision: expectedRevision + 1,
    locks,
    writes,
  });
}

function buildConditionalMarketCancelSavePlan(data, previous, groups, consistencyScopeValue) {
  const consistencyScope = rowLocalMarketCancelConsistencyScope(consistencyScopeValue);
  if (consistencyScope === null
    || Number(data.schemaVersion || 0) !== Number(previous.schemaVersion || 0)) {
    return null;
  }
  const allowedGroups = new Set([
    "profileBindings",
    "profiles",
    "mutationReceipts",
    "marketListings",
  ]);
  for (const [groupName, statements] of Object.entries(groups)) {
    if (!allowedGroups.has(groupName) && statements.length > 0) {
      return null;
    }
  }
  if (
    groups.profileBindings.length !== 1
    || groups.profiles.length !== 1
    || groups.marketListings.length !== 1
  ) {
    return null;
  }

  const profileRevisionChange = certifiedSingleProfileRevisionChange(previous, data);
  const listingDelete = singleExistingObjectEntityDeletion(
    previous.marketListings,
    data.marketListings,
    marketListingEntityKey,
  );
  if (profileRevisionChange === null || listingDelete === null) {
    return null;
  }
  const {
    accountId,
    playerId,
    expectedRevision,
    beforeBinding,
    nextBinding,
    beforeProfile,
    nextProfile,
  } = profileRevisionChange;
  const listing = listingDelete.previous;
  const listingId = listingDelete.key;
  const ordinaryListingFields = new Set([
    "listingId",
    "sellerAccountId",
    "itemId",
    "count",
    "unitPrice",
    "currency",
    "createdAt",
    "schemaVersion",
  ]);
  if (
    consistencyScope.accountId !== accountId
    || consistencyScope.playerId !== playerId
    || consistencyScope.listingId !== listingId
    || String(listing.listingId || "") !== listingId
    || String(listing.sellerAccountId || "") !== accountId
    || Number(listing.schemaVersion) !== 1
    || Object.hasOwn(listing, "equipmentEnvelope")
    || Object.keys(listing).length !== ordinaryListingFields.size
    || Object.keys(listing).some((field) => !ordinaryListingFields.has(field))
  ) {
    return null;
  }

  const receiptWriteSet = conditionalMutationReceiptWriteSet(
    previous.mutationReceipts,
    data.mutationReceipts,
    groups.mutationReceipts,
  );
  if (receiptWriteSet === null) {
    return null;
  }
  const receipt = receiptWriteSet.receipt;
  if (
    receipt === null
    || String(receipt.operationId || "") !== consistencyScope.operationId
    || String(receipt.requestHash || "") !== consistencyScope.requestHash
    || String(receipt.actionId || "") !== consistencyScope.actionId
    || String(receipt.accountId || "") !== accountId
  ) {
    return null;
  }

  return buildMysqlResourceAcquisitionPlan({
    kind: "market_cancel_conditional_v1",
    globalRevisionFence: false,
    globalCompatibilityBarrier: "shared",
    accountId,
    playerId,
    listingId,
    operationId: consistencyScope.operationId,
    expectedProfileRevision: expectedRevision,
    nextProfileRevision: expectedRevision + 1,
    locks: [
      profileBindingResourceLock(beforeBinding),
      profileResourceLock(beforeProfile),
      marketListingResourceLock(listing),
    ],
    writes: [
      conditionalProfileBindingUpdate(nextBinding, expectedRevision),
      conditionalProfileUpdate(nextProfile, expectedRevision),
      conditionalMarketListingDelete(listing),
      ...receiptWriteSet.writes,
    ],
  });
}

function buildConditionalMarketBuySavePlan(data, previous, groups, consistencyScopeValue) {
  const consistencyScope = rowLocalMarketBuyConsistencyScope(consistencyScopeValue);
  if (consistencyScope === null
    || Number(data.schemaVersion || 0) !== Number(previous.schemaVersion || 0)) {
    return null;
  }
  const allowedGroups = new Set([
    "serverState",
    "profileBindings",
    "profiles",
    "mutationReceipts",
    "mailMessages",
    "marketListings",
  ]);
  for (const [groupName, statements] of Object.entries(groups)) {
    if (!allowedGroups.has(groupName) && statements.length > 0) {
      return null;
    }
  }
  if (
    groups.profileBindings.length !== 1
    || groups.profiles.length !== 1
    || groups.mailMessages.length !== 1
    || groups.marketListings.length !== 1
  ) {
    return null;
  }

  const profileRevisionChange = certifiedSingleProfileRevisionChange(previous, data);
  const listingDelete = singleExistingObjectEntityDeletion(
    previous.marketListings,
    data.marketListings,
    marketListingEntityKey,
  );
  const mailInsert = singleMailAuthorityEntityChange(
    previous.mailMessages,
    data.mailMessages,
    groups.mailAuthorityChanges,
    "insert",
  );
  if (profileRevisionChange === null || listingDelete === null || mailInsert === null) {
    return null;
  }
  const {
    accountId,
    playerId,
    expectedRevision,
    beforeBinding,
    nextBinding,
    beforeProfile,
    nextProfile,
  } = profileRevisionChange;
  const listing = listingDelete.previous;
  const listingId = listingDelete.key;
  const saleMail = mailInsert.next;
  const saleMailId = mailInsert.key;
  const sellerAccountId = String(listing.sellerAccountId || "");
  const sellerBinding = previous.profileBindings && previous.profileBindings[sellerAccountId];
  const sellerPlayerId = String(sellerBinding && sellerBinding.playerId || "");
  const sellerProfile = previous.profiles && previous.profiles[sellerPlayerId];
  const ordinaryListingFields = new Set([
    "listingId",
    "sellerAccountId",
    "itemId",
    "count",
    "unitPrice",
    "currency",
    "createdAt",
    "schemaVersion",
  ]);
  if (
    consistencyScope.accountId !== accountId
    || consistencyScope.playerId !== playerId
    || consistencyScope.sellerAccountId !== sellerAccountId
    || consistencyScope.sellerPlayerId !== sellerPlayerId
    || consistencyScope.listingId !== listingId
    || consistencyScope.saleMailId !== saleMailId
    || sellerAccountId === ""
    || sellerAccountId === accountId
    || !sellerBinding
    || !sellerProfile
    || String(sellerBinding.accountId || "") !== sellerAccountId
    || String(sellerBinding.playerId || "") !== sellerPlayerId
    || String(sellerProfile.accountId || "") !== sellerAccountId
    || String(sellerProfile.playerId || "") !== sellerPlayerId
    || !isDeepStrictEqual(data.profileBindings && data.profileBindings[sellerAccountId], sellerBinding)
    || !isDeepStrictEqual(data.profiles && data.profiles[sellerPlayerId], sellerProfile)
    || String(listing.listingId || "") !== listingId
    || Number(listing.schemaVersion) !== 1
    || Object.hasOwn(listing, "equipmentEnvelope")
    || Object.keys(listing).length !== ordinaryListingFields.size
    || Object.keys(listing).some((field) => !ordinaryListingFields.has(field))
  ) {
    return null;
  }

  const taxChange = certifiedOrdinaryMarketBuyTaxChange(
    previous.marketConfig,
    data.marketConfig,
    listing,
  );
  if (
    taxChange === null
    || consistencyScope.currency !== taxChange.currency
    || consistencyScope.taxAmount !== taxChange.taxAmount
    || groups.serverState.length !== (taxChange.taxAmount > 0 ? 1 : 0)
    || !marketBuyServerStateChangesOnlyTax(previous, data, taxChange)
    || !certifiedOrdinaryMarketSaleMail(saleMail, listing, taxChange.taxAmount, sellerAccountId)
  ) {
    return null;
  }

  const receiptWriteSet = conditionalMutationReceiptWriteSet(
    previous.mutationReceipts,
    data.mutationReceipts,
    groups.mutationReceipts,
  );
  if (receiptWriteSet === null) {
    return null;
  }
  const receipt = receiptWriteSet.receipt;
  if (
    receipt === null
    || String(receipt.operationId || "") !== consistencyScope.operationId
    || String(receipt.requestHash || "") !== consistencyScope.requestHash
    || String(receipt.actionId || "") !== consistencyScope.actionId
    || String(receipt.accountId || "") !== accountId
  ) {
    return null;
  }

  const bindingLocks = [
    {binding: beforeBinding, shared: false},
    {binding: sellerBinding, shared: true},
  ];
  const profileLocks = [
    {profile: beforeProfile, shared: false},
    {profile: sellerProfile, shared: true},
  ];
  const writes = [
    conditionalProfileBindingUpdate(nextBinding, expectedRevision),
    conditionalProfileUpdate(nextProfile, expectedRevision),
    conditionalMarketListingDelete(listing),
    conditionalMailMessageInsert(saleMail),
  ];
  if (taxChange.taxAmount > 0) {
    writes.push(conditionalMarketTaxIncrement(taxChange.currency, taxChange.taxAmount));
  }
  writes.push(...receiptWriteSet.writes);
  return buildMysqlResourceAcquisitionPlan({
    kind: "market_buy_conditional_v1",
    globalRevisionFence: false,
    globalCompatibilityBarrier: "shared",
    accountId,
    playerId,
    sellerAccountId,
    sellerPlayerId,
    listingId,
    saleMailId,
    operationId: consistencyScope.operationId,
    currency: taxChange.currency,
    taxAmount: taxChange.taxAmount,
    expectedProfileRevision: expectedRevision,
    nextProfileRevision: expectedRevision + 1,
    locks: [
      ...bindingLocks.map(({binding, shared}) => profileBindingResourceLock(binding, {shared})),
      ...profileLocks.map(({profile, shared}) => profileResourceLock(profile, {shared})),
      marketListingResourceLock(listing),
    ],
    writes,
  });
}

function buildConditionalMailSendSavePlan(data, previous, groups, consistencyScopeValue) {
  const consistencyScope = canonicalMailSendConsistencyScope(consistencyScopeValue);
  if (consistencyScope === null
    || Number(data.schemaVersion || 0) !== Number(previous.schemaVersion || 0)) {
    return null;
  }
  const profileExpected = consistencyScope.mode === MAIL_SEND_MODE_ORDINARY_ITEMS;
  const allowedGroups = new Set([
    "profileBindings",
    "profiles",
    "mutationReceipts",
    "mailMessages",
  ]);
  for (const [groupName, statements] of Object.entries(groups)) {
    if (!allowedGroups.has(groupName) && statements.length > 0) {
      return null;
    }
  }
  if (
    groups.mailMessages.length !== 1
    || groups.profileBindings.length !== (profileExpected ? 1 : 0)
    || groups.profiles.length !== (profileExpected ? 1 : 0)
  ) {
    return null;
  }

  const mailAddition = singleMailAuthorityEntityChange(
    previous.mailMessages,
    data.mailMessages,
    groups.mailAuthorityChanges,
    "insert",
  );
  if (
    mailAddition === null
    || !certifiedOrdinaryPlayerMailSend(mailAddition.next, previous, consistencyScope)
  ) {
    return null;
  }

  let expectedRevision = null;
  let beforeBinding = null;
  let nextBinding = null;
  let beforeProfile = null;
  let nextProfile = null;
  if (profileExpected) {
    const change = certifiedSingleProfileRevisionChange(previous, data);
    if (
      change === null
      || change.accountId !== consistencyScope.accountId
      || change.playerId !== consistencyScope.playerId
    ) {
      return null;
    }
    ({
      expectedRevision,
      beforeBinding,
      nextBinding,
      beforeProfile,
      nextProfile,
    } = change);
  } else if (consistencyScope.playerId !== "") {
    return null;
  }

  const receiptWriteSet = conditionalMutationReceiptWriteSet(
    previous.mutationReceipts,
    data.mutationReceipts,
    groups.mutationReceipts,
  );
  if (receiptWriteSet === null) {
    return null;
  }
  const receipt = receiptWriteSet.receipt;
  if (
    receipt === null
    || String(receipt.operationId || "") !== consistencyScope.operationId
    || String(receipt.requestHash || "") !== consistencyScope.requestHash
    || String(receipt.actionId || "") !== consistencyScope.actionId
    || String(receipt.accountId || "") !== consistencyScope.accountId
    || !mailSendReceiptResponseMatches({
      receipt,
      mail: mailAddition.next,
      sender: previous.accounts && previous.accounts[mailAddition.next.senderUsername],
      mode: consistencyScope.mode,
      nextBinding,
      nextProfile,
    })
  ) {
    return null;
  }

  const locks = [];
  const writes = [];
  if (profileExpected) {
    locks.push(
      profileBindingResourceLock(beforeBinding),
      profileResourceLock(beforeProfile),
    );
    writes.push(
      conditionalProfileBindingUpdate(nextBinding, expectedRevision),
      conditionalProfileUpdate(nextProfile, expectedRevision),
    );
  }
  writes.push(conditionalMailMessageInsert(mailAddition.next), ...receiptWriteSet.writes);
  return buildMysqlResourceAcquisitionPlan({
    kind: "mail_send_conditional_v1",
    globalRevisionFence: false,
    globalCompatibilityBarrier: "shared",
    mode: consistencyScope.mode,
    accountId: consistencyScope.accountId,
    playerId: consistencyScope.playerId,
    recipientAccountId: consistencyScope.recipientAccountId,
    recipientUsername: consistencyScope.recipientUsername,
    mailId: consistencyScope.mailId,
    operationId: consistencyScope.operationId,
    ...(profileExpected ? {
      expectedProfileRevision: expectedRevision,
      nextProfileRevision: expectedRevision + 1,
    } : {}),
    locks,
    writes,
  });
}

function certifiedOrdinaryPlayerMailSend(mailValue, previous, scope) {
  const mail = objectOrEmpty(mailValue);
  const fields = new Set([
    "mailId",
    "senderAccountId",
    "senderUsername",
    "senderDisplayName",
    "recipientAccountId",
    "recipientUsername",
    "recipientDisplayName",
    "title",
    "body",
    "items",
    "equipmentEnvelopes",
    "currency",
    "createdAt",
    "readAt",
    "schemaVersion",
  ]);
  if (scope.mode === MAIL_SEND_MODE_TEXT) {
    fields.add("settledAt");
  }
  const sender = objectOrEmpty(previous.accounts && previous.accounts[mail.senderUsername]);
  const recipient = objectOrEmpty(previous.accounts && previous.accounts[mail.recipientUsername]);
  const items = Array.isArray(mail.items) ? mail.items : null;
  const itemIds = items === null ? [] : items.map((item) => String(item && item.itemId || ""));
  if (
    Object.keys(mail).length !== fields.size
    || Object.keys(mail).some((field) => !fields.has(field))
    || mail.mailId !== scope.mailId
    || mail.senderAccountId !== scope.accountId
    || mail.recipientAccountId !== scope.recipientAccountId
    || mail.recipientUsername !== scope.recipientUsername
    || mail.senderAccountId === mail.recipientAccountId
    || sender.accountId !== mail.senderAccountId
    || sender.username !== mail.senderUsername
    || sender.displayName !== mail.senderDisplayName
    || recipient.accountId !== mail.recipientAccountId
    || recipient.username !== mail.recipientUsername
    || recipient.displayName !== mail.recipientDisplayName
    || typeof mail.title !== "string"
    || mail.title === ""
    || mail.title !== mail.title.trim()
    || typeof mail.body !== "string"
    || mail.body === ""
    || mail.body !== mail.body.trim()
    || typeof mail.createdAt !== "string"
    || mail.createdAt === ""
    || mail.createdAt !== mail.createdAt.trim()
    || !canonicalMysqlIsoTimestamp(mail.createdAt)
    || mail.readAt !== null
    || mail.schemaVersion !== 2
    || !Array.isArray(mail.equipmentEnvelopes)
    || mail.equipmentEnvelopes.length !== 0
    || !isRecord(mail.currency)
    || Object.keys(mail.currency).length !== 0
    || items === null
    || items.some((item) => (
      !isRecord(item)
      || Object.keys(item).length !== 2
      || !Object.hasOwn(item, "itemId")
      || !Object.hasOwn(item, "count")
      || typeof item.itemId !== "string"
      || item.itemId === ""
      || item.itemId !== item.itemId.trim()
      || !Number.isSafeInteger(item.count)
      || item.count <= 0
    ))
    || new Set(itemIds).size !== itemIds.length
    || (scope.mode === MAIL_SEND_MODE_TEXT && items.length !== 0)
    || (scope.mode === MAIL_SEND_MODE_ORDINARY_ITEMS && items.length === 0)
    || (scope.mode === MAIL_SEND_MODE_TEXT && mail.settledAt !== mail.createdAt)
    || (scope.mode === MAIL_SEND_MODE_ORDINARY_ITEMS && Object.hasOwn(mail, "settledAt"))
  ) {
    return false;
  }
  return true;
}

function buildConditionalMailReadSavePlan(data, previous, groups, consistencyScopeValue) {
  const consistencyScope = canonicalMailReadConsistencyScope(consistencyScopeValue);
  if (consistencyScope === null
    || Number(data.schemaVersion || 0) !== Number(previous.schemaVersion || 0)) {
    return null;
  }
  const allowedGroups = new Set(["mutationReceipts", "mailMessages"]);
  for (const [groupName, statements] of Object.entries(groups)) {
    if (!allowedGroups.has(groupName) && statements.length > 0) {
      return null;
    }
  }
  if (groups.mailMessages.length !== 1) {
    return null;
  }

  const mailUpdate = singleMailAuthorityEntityChange(
    previous.mailMessages,
    data.mailMessages,
    groups.mailAuthorityChanges,
    "update",
  );
  if (mailUpdate === null) {
    return null;
  }
  const beforeMail = objectOrEmpty(mailUpdate.previous);
  const nextMail = objectOrEmpty(mailUpdate.next);
  const expectedNextMail = {...beforeMail, readAt: nextMail.readAt};
  if (
    consistencyScope.mailDisposition !== "update"
    || mailUpdate.key !== consistencyScope.mailId
    || String(beforeMail.mailId || "") !== consistencyScope.mailId
    || String(nextMail.mailId || "") !== consistencyScope.mailId
    || String(beforeMail.recipientAccountId || "") !== consistencyScope.accountId
    || String(nextMail.recipientAccountId || "") !== consistencyScope.accountId
    || beforeMail.readAt !== null
    || !canonicalMysqlIsoTimestamp(nextMail.readAt)
    || !isDeepStrictEqual(nextMail, expectedNextMail)
  ) {
    return null;
  }

  const receiptWriteSet = conditionalMutationReceiptWriteSet(
    previous.mutationReceipts,
    data.mutationReceipts,
    groups.mutationReceipts,
  );
  if (receiptWriteSet === null) {
    return null;
  }
  const receipt = receiptWriteSet.receipt;
  const receiptResponse = objectOrEmpty(receipt && receipt.response);
  const responseMail = objectOrEmpty(receiptResponse.mail);
  if (
    receipt === null
    || String(receipt.operationId || "") !== consistencyScope.operationId
    || String(receipt.requestHash || "") !== consistencyScope.requestHash
    || String(receipt.actionId || "") !== consistencyScope.actionId
    || String(receipt.accountId || "") !== consistencyScope.accountId
    || receiptResponse.ok !== true
    || String(responseMail.mailId || "") !== consistencyScope.mailId
    || String(responseMail.readAt || "") !== nextMail.readAt
  ) {
    return null;
  }

  return buildMysqlResourceAcquisitionPlan({
    kind: "mail_read_conditional_v1",
    globalRevisionFence: false,
    globalCompatibilityBarrier: "shared",
    accountId: consistencyScope.accountId,
    mailId: consistencyScope.mailId,
    mailDisposition: consistencyScope.mailDisposition,
    operationId: consistencyScope.operationId,
    locks: [mailMessageResourceLock(beforeMail)],
    writes: [
      conditionalMailMessageUpdate(nextMail, beforeMail),
      ...receiptWriteSet.writes,
    ],
  });
}

function canonicalMysqlIsoTimestamp(value) {
  if (typeof value !== "string" || value === "" || value !== value.trim()) {
    return false;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  try {
    return new Date(timestamp).toISOString() === value;
  } catch {
    return false;
  }
}

function buildConditionalMailClaimSavePlan(data, previous, groups, consistencyScopeValue) {
  const consistencyScope = rowLocalMailClaimConsistencyScope(consistencyScopeValue);
  if (consistencyScope === null
    || Number(data.schemaVersion || 0) !== Number(previous.schemaVersion || 0)) {
    return null;
  }
  const allowedGroups = new Set([
    "profileBindings",
    "profiles",
    "mutationReceipts",
    "mailMessages",
    "consumedEquipmentEnvelopes",
  ]);
  for (const [groupName, statements] of Object.entries(groups)) {
    if (!allowedGroups.has(groupName) && statements.length > 0) {
      return null;
    }
  }
  if (
    groups.profileBindings.length !== 1
    || groups.profiles.length !== 1
    || groups.mailMessages.length !== 1
  ) {
    return null;
  }

  const profileRevisionChange = certifiedSingleProfileRevisionChange(previous, data);
  const mailClaim = certifiedSingleMailClaimChange(
    previous.mailMessages,
    data.mailMessages,
    groups.mailAuthorityChanges,
  );
  if (profileRevisionChange === null || mailClaim === null) {
    return null;
  }
  const {
    accountId,
    playerId,
    expectedRevision,
    beforeBinding,
    nextBinding,
    beforeProfile,
    nextProfile,
  } = profileRevisionChange;
  if (
    consistencyScope.accountId !== accountId
    || consistencyScope.playerId !== playerId
    || consistencyScope.mailId !== mailClaim.mailId
    || consistencyScope.mailDisposition !== mailClaim.disposition
    || String(mailClaim.beforeMail.recipientAccountId || "") !== accountId
    || !isDeepStrictEqual(consistencyScope.claimedEnvelopeIds, mailClaim.removedEnvelopeIds)
  ) {
    return null;
  }

  const consumedDelta = consumedEquipmentEnvelopeLedgerDeltaFrom(
    previous.consumedEquipmentEnvelopes,
    data.consumedEquipmentEnvelopes,
  );
  if (
    !consumedDelta.ok
    || !isDeepStrictEqual([...consumedDelta.addedIds].sort(), mailClaim.removedEnvelopeIds)
    || groups.consumedEquipmentEnvelopes.length !== mailClaim.removedEnvelopeIds.length
  ) {
    return null;
  }

  const receiptWriteSet = conditionalMutationReceiptWriteSet(
    previous.mutationReceipts,
    data.mutationReceipts,
    groups.mutationReceipts,
  );
  if (receiptWriteSet === null) {
    return null;
  }
  const receipt = receiptWriteSet.receipt;
  const receiptMail = objectOrEmpty(objectOrEmpty(receipt && receipt.response).mail);
  if (
    receipt === null
    || String(receipt.operationId || "") !== consistencyScope.operationId
    || String(receipt.requestHash || "") !== consistencyScope.requestHash
    || String(receipt.actionId || "") !== consistencyScope.actionId
    || String(receipt.accountId || "") !== accountId
    || !mailClaimReceiptResponseMatches(mailClaim.nextMail, receiptMail)
  ) {
    return null;
  }

  return buildMysqlResourceAcquisitionPlan({
    kind: "mail_claim_conditional_v1",
    globalRevisionFence: false,
    globalCompatibilityBarrier: "shared",
    accountId,
    playerId,
    mailId: mailClaim.mailId,
    mailDisposition: mailClaim.disposition,
    claimedEnvelopeIds: mailClaim.removedEnvelopeIds,
    operationId: consistencyScope.operationId,
    expectedProfileRevision: expectedRevision,
    nextProfileRevision: expectedRevision + 1,
    locks: [
      profileBindingResourceLock(beforeBinding),
      profileResourceLock(beforeProfile),
      mailMessageResourceLock(mailClaim.beforeMail),
    ],
    writes: [
      conditionalProfileBindingUpdate(nextBinding, expectedRevision),
      conditionalProfileUpdate(nextProfile, expectedRevision),
      conditionalMailMessageUpdate(mailClaim.nextMail, mailClaim.beforeMail),
      ...mailClaim.removedEnvelopeIds.map(conditionalConsumedEquipmentEnvelopeInsert),
      ...receiptWriteSet.writes,
    ],
  });
}

function rowLocalProfileConsistencyScope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const kind = String(value.kind || "");
  const accountId = String(value.accountId || "");
  const playerId = String(value.playerId || "");
  const operationId = String(value.operationId || "");
  const requestHash = String(value.requestHash || "");
  const actionId = String(value.actionId || "");
  if (
    kind !== "row_local_profile_v1"
    || accountId === ""
    || playerId === ""
    || operationId === ""
    || requestHash === ""
    || actionId === ""
  ) {
    return null;
  }
  return {kind, accountId, playerId, operationId, requestHash, actionId};
}

function rowLocalMarketCreateConsistencyScope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const fields = new Set([
    "kind",
    "accountId",
    "playerId",
    "listingId",
    "operationId",
    "requestHash",
    "actionId",
    "observedTotalListingCount",
    "observedSellerListingCount",
    "maxTotalListings",
    "maxSellerListings",
  ]);
  const kind = value.kind;
  const accountId = value.accountId;
  const playerId = value.playerId;
  const listingId = value.listingId;
  const observedTotalListingCount = value.observedTotalListingCount;
  const observedSellerListingCount = value.observedSellerListingCount;
  const maxTotalListings = value.maxTotalListings;
  const maxSellerListings = value.maxSellerListings;
  const operationId = value.operationId;
  const requestHash = value.requestHash;
  const actionId = value.actionId;
  if (
    kind !== "row_local_market_create_v1"
    || Object.keys(value).length !== fields.size
    || Object.keys(value).some((field) => !fields.has(field))
    || typeof accountId !== "string"
    || accountId === ""
    || accountId.trim() !== accountId
    || typeof playerId !== "string"
    || playerId === ""
    || playerId.trim() !== playerId
    || typeof listingId !== "string"
    || listingId === ""
    || listingId.trim() !== listingId
    || !Number.isSafeInteger(observedTotalListingCount)
    || observedTotalListingCount < 0
    || !Number.isSafeInteger(observedSellerListingCount)
    || observedSellerListingCount < 0
    || observedSellerListingCount > observedTotalListingCount
    || maxTotalListings !== MARKET_MAX_LISTINGS
    || maxSellerListings !== MARKET_MAX_LISTINGS_PER_SELLER
    || typeof operationId !== "string"
    || operationId === ""
    || operationId.trim() !== operationId
    || typeof requestHash !== "string"
    || requestHash === ""
    || requestHash.trim() !== requestHash
    || typeof actionId !== "string"
    || actionId === ""
    || actionId.trim() !== actionId
  ) {
    return null;
  }
  return {
    kind,
    accountId,
    playerId,
    listingId,
    observedTotalListingCount,
    observedSellerListingCount,
    maxTotalListings,
    maxSellerListings,
    operationId,
    requestHash,
    actionId,
  };
}

function rowLocalMarketCancelConsistencyScope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const kind = String(value.kind || "");
  const accountId = String(value.accountId || "");
  const playerId = String(value.playerId || "");
  const listingId = String(value.listingId || "");
  const operationId = String(value.operationId || "");
  const requestHash = String(value.requestHash || "");
  const actionId = String(value.actionId || "");
  if (
    kind !== "row_local_market_cancel_v1"
    || accountId === ""
    || playerId === ""
    || listingId === ""
    || operationId === ""
    || requestHash === ""
    || actionId === ""
  ) {
    return null;
  }
  return {kind, accountId, playerId, listingId, operationId, requestHash, actionId};
}

function rowLocalMarketBuyConsistencyScope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const kind = String(value.kind || "");
  const accountId = String(value.accountId || "");
  const playerId = String(value.playerId || "");
  const sellerAccountId = String(value.sellerAccountId || "");
  const sellerPlayerId = String(value.sellerPlayerId || "");
  const listingId = String(value.listingId || "");
  const saleMailId = String(value.saleMailId || "");
  const currency = String(value.currency || "");
  const taxAmount = Number(value.taxAmount);
  const operationId = String(value.operationId || "");
  const requestHash = String(value.requestHash || "");
  const actionId = String(value.actionId || "");
  if (
    kind !== "row_local_market_buy_v1"
    || accountId === ""
    || playerId === ""
    || sellerAccountId === ""
    || sellerPlayerId === ""
    || listingId === ""
    || saleMailId === ""
    || !["stoneCoins", "diamonds"].includes(currency)
    || !Number.isSafeInteger(taxAmount)
    || taxAmount < 0
    || operationId === ""
    || requestHash === ""
    || actionId === ""
  ) {
    return null;
  }
  return {
    kind,
    accountId,
    playerId,
    sellerAccountId,
    sellerPlayerId,
    listingId,
    saleMailId,
    currency,
    taxAmount,
    operationId,
    requestHash,
    actionId,
  };
}

function rowLocalMailClaimConsistencyScope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const kind = String(value.kind || "");
  const accountId = String(value.accountId || "");
  const playerId = String(value.playerId || "");
  const mailId = String(value.mailId || "");
  const mailDisposition = String(value.mailDisposition || "");
  const claimedEnvelopeIds = canonicalMailClaimEnvelopeIds(value.claimedEnvelopeIds);
  const operationId = String(value.operationId || "");
  const requestHash = String(value.requestHash || "");
  const actionId = String(value.actionId || "");
  if (
    kind !== "row_local_mail_claim_v1"
    || accountId === ""
    || playerId === ""
    || mailId === ""
    || mailDisposition !== "update"
    || claimedEnvelopeIds === null
    || operationId === ""
    || requestHash === ""
    || actionId === ""
  ) {
    return null;
  }
  return {
    kind,
    accountId,
    playerId,
    mailId,
    mailDisposition,
    claimedEnvelopeIds,
    operationId,
    requestHash,
    actionId,
  };
}

function certifiedSingleProfileRevisionChange(previous, data) {
  const bindingChange = singleExistingObjectEntityChange(
    previous.profileBindings,
    data.profileBindings,
    profileBindingEntityKey,
  );
  const profileChange = singleExistingObjectEntityChange(
    previous.profiles,
    data.profiles,
    profileEntityKey,
  );
  if (bindingChange === null || profileChange === null) {
    return null;
  }
  const beforeBinding = bindingChange.previous;
  const nextBinding = bindingChange.next;
  const beforeProfile = profileChange.previous;
  const nextProfile = profileChange.next;
  const accountId = bindingChange.key;
  const playerId = profileChange.key;
  const expectedRevision = Number(beforeBinding.profileRevision);
  const beforeProfileRevision = Number(beforeProfile.profileRevision);
  const nextBindingRevision = Number(nextBinding.profileRevision);
  const nextProfileRevision = Number(nextProfile.profileRevision);
  const updatedAt = String(nextBinding.updatedAt || "");
  if (
    accountId === ""
    || playerId === ""
    || String(beforeBinding.accountId || "") !== accountId
    || String(nextBinding.accountId || "") !== accountId
    || String(beforeBinding.playerId || "") !== playerId
    || String(nextBinding.playerId || "") !== playerId
    || String(beforeProfile.playerId || "") !== playerId
    || String(nextProfile.playerId || "") !== playerId
    || String(beforeProfile.accountId || "") !== accountId
    || String(nextProfile.accountId || "") !== accountId
    || String(beforeBinding.createdAt || "") !== String(nextBinding.createdAt || "")
    || String(beforeProfile.createdAt || "") !== String(nextProfile.createdAt || "")
    || !Number.isSafeInteger(expectedRevision)
    || expectedRevision < 0
    || beforeProfileRevision !== expectedRevision
    || nextBindingRevision !== expectedRevision + 1
    || nextProfileRevision !== expectedRevision + 1
    || updatedAt === ""
    || String(nextProfile.updatedAt || "") !== updatedAt
  ) {
    return null;
  }
  return {
    accountId,
    playerId,
    expectedRevision,
    beforeBinding,
    nextBinding,
    beforeProfile,
    nextProfile,
  };
}

function serverStateResourceLock(stateDocument) {
  return {
    kind: "lock",
    resource: "server_state",
    key: "auth",
    sql: "SELECT document_json FROM server_state WHERE state_key = 'auth' FOR UPDATE",
    params: [],
    expectedRow: {
      document_json: stateDocument,
    },
  };
}

function buildLegacyProfileResourceLocks(previous) {
  const bindings = canonicalObjectEntityMap(previous.profileBindings, profileBindingEntityKey);
  const profiles = canonicalObjectEntityMap(previous.profiles, profileEntityKey);
  if (bindings === null || profiles === null) {
    const error = new Error("MySQL legacy 档案读集无法从非规范实体建立。");
    error.code = "mysql_resource_precondition_invalid";
    throw error;
  }
  // A legacy mutation has no certified read-set yet. Once it owns the global
  // exclusive compatibility barrier, validate the complete profile snapshot
  // in two canonical locking reads. This catches every current row-local
  // profile-revision commit that does not advance the global revision, even
  // when the legacy write-set omits the profile it previously read.
  return [
    {
      kind: "snapshot_lock",
      resource: "profile_binding_snapshot",
      key: "*",
      keyField: "account_id",
      sql: "SELECT account_id, player_id, profile_revision FROM profile_bindings ORDER BY account_id FOR UPDATE",
      params: [],
      expectedRows: [...bindings.values()].map((binding) => ({
        account_id: String(binding.accountId || ""),
        player_id: String(binding.playerId || ""),
        profile_revision: Number(binding.profileRevision),
      })),
    },
    {
      kind: "snapshot_lock",
      resource: "profile_snapshot",
      key: "*",
      keyField: "player_id",
      sql: "SELECT player_id, account_id, profile_revision FROM profiles ORDER BY player_id FOR UPDATE",
      params: [],
      expectedRows: [...profiles.values()].map((profile) => ({
        player_id: String(profile.playerId || ""),
        account_id: String(profile.accountId || ""),
        profile_revision: Number(profile.profileRevision),
      })),
    },
  ];
}

function profileBindingResourceLock(binding, options = {}) {
  const accountId = String(binding && binding.accountId || "");
  const playerId = String(binding && binding.playerId || "");
  const revision = Number(binding && binding.profileRevision);
  if (accountId === "" || playerId === "" || !Number.isSafeInteger(revision) || revision < 0) {
    const error = new Error("MySQL profile binding 条件锁缺少规范身份或 revision。");
    error.code = "mysql_resource_precondition_invalid";
    throw error;
  }
  return {
    kind: "lock",
    resource: "profile_binding",
    key: accountId,
    lockMode: options.shared === true ? "shared" : "exclusive",
    sql: `SELECT account_id, player_id, profile_revision FROM profile_bindings WHERE account_id = ? ${options.shared === true ? "FOR SHARE" : "FOR UPDATE"}`,
    params: [accountId],
    expectedRow: {
      account_id: accountId,
      player_id: playerId,
      profile_revision: revision,
    },
  };
}

function profileResourceLock(profile, options = {}) {
  const playerId = String(profile && profile.playerId || "");
  const accountId = String(profile && profile.accountId || "");
  const revision = Number(profile && profile.profileRevision);
  if (playerId === "" || accountId === "" || !Number.isSafeInteger(revision) || revision < 0) {
    const error = new Error("MySQL profile 条件锁缺少规范身份或 revision。");
    error.code = "mysql_resource_precondition_invalid";
    throw error;
  }
  return {
    kind: "lock",
    resource: "profile",
    key: playerId,
    lockMode: options.shared === true ? "shared" : "exclusive",
    sql: `SELECT player_id, account_id, profile_revision FROM profiles WHERE player_id = ? ${options.shared === true ? "FOR SHARE" : "FOR UPDATE"}`,
    params: [playerId],
    expectedRow: {
      player_id: playerId,
      account_id: accountId,
      profile_revision: revision,
    },
  };
}

function marketCreateCapacityResourceLock() {
  return {
    kind: "lock",
    resource: "market_capacity",
    key: MARKET_CREATE_CAPACITY_GUARD_KEY,
    lockMode: "exclusive",
    sql: MARKET_CREATE_CAPACITY_LOCK_SQL,
    params: [MARKET_CREATE_CAPACITY_GUARD_KEY],
    expectedRow: {
      scope_key: MARKET_CREATE_CAPACITY_GUARD_KEY,
      revision: 0,
    },
  };
}

function marketCreateCapacityCheck(accountId) {
  return {
    kind: "check",
    resource: "market_capacity",
    key: MARKET_CREATE_CAPACITY_GUARD_KEY,
    sql: MARKET_CREATE_CAPACITY_CHECK_SQL,
    params: [String(accountId || "")],
    maxTotalListings: MARKET_MAX_LISTINGS,
    maxSellerListings: MARKET_MAX_LISTINGS_PER_SELLER,
  };
}

function marketListingResourceLock(listing) {
  const listingId = String(listing && listing.listingId || "");
  const sellerAccountId = String(listing && listing.sellerAccountId || "");
  const itemId = String(listing && listing.itemId || "");
  const currency = String(listing && listing.currency || "");
  const unitPrice = Number(listing && listing.unitPrice);
  const itemCount = Number(listing && listing.count);
  const createdAt = String(listing && listing.createdAt || "");
  if (
    listingId === ""
    || sellerAccountId === ""
    || itemId === ""
    || currency === ""
    || !Number.isSafeInteger(unitPrice)
    || unitPrice <= 0
    || !Number.isSafeInteger(itemCount)
    || itemCount <= 0
    || createdAt === ""
  ) {
    const error = new Error("MySQL market listing 条件锁缺少规范资源身份。");
    error.code = "mysql_resource_precondition_invalid";
    throw error;
  }
  return {
    kind: "lock",
    resource: "market_listing",
    key: listingId,
    lockMode: "exclusive",
    sql: `SELECT listing_id, seller_account_id, item_id, currency, unit_price,
      item_count, created_at, document_json
      FROM market_listings WHERE listing_id = ? FOR UPDATE`,
    params: [listingId],
    expectedRow: {
      listing_id: listingId,
      seller_account_id: sellerAccountId,
      item_id: itemId,
      currency,
      unit_price: unitPrice,
      item_count: itemCount,
      created_at: createdAt,
      document_json: listing,
    },
  };
}

function mailMessageResourceLock(mail) {
  const mailId = String(mail && mail.mailId || "");
  const senderAccountId = String(mail && mail.senderAccountId || "");
  const recipientAccountId = String(mail && mail.recipientAccountId || "");
  const title = String(mail && mail.title || "");
  const createdAt = String(mail && mail.createdAt || "");
  const readAt = nullableMailReadAt(mail && mail.readAt);
  if (
    mailId === ""
    || senderAccountId === ""
    || recipientAccountId === ""
    || title === ""
    || createdAt === ""
  ) {
    const error = new Error("MySQL mail message 条件锁缺少规范资源身份。");
    error.code = "mysql_resource_precondition_invalid";
    throw error;
  }
  return {
    kind: "lock",
    resource: "mail_message",
    key: mailId,
    lockMode: "exclusive",
    sql: `SELECT mail_id, sender_account_id, recipient_account_id, title,
      created_at, read_at, document_json
      FROM mail_messages WHERE mail_id = ? FOR UPDATE`,
    params: [mailId],
    expectedRow: {
      mail_id: mailId,
      sender_account_id: senderAccountId,
      recipient_account_id: recipientAccountId,
      title,
      created_at: createdAt,
      read_at: readAt,
      document_json: mail,
    },
  };
}

function singleExistingObjectEntityChange(previousValue, nextValue, keyFn) {
  const previous = canonicalObjectEntityMap(previousValue, keyFn);
  const next = canonicalObjectEntityMap(nextValue, keyFn);
  if (previous === null || next === null || previous.size !== next.size) {
    return null;
  }
  let change = null;
  for (const [key, previousEntity] of previous.entries()) {
    if (!next.has(key)) {
      return null;
    }
    const nextEntity = next.get(key);
    if (!entityChanged(previousEntity, nextEntity)) {
      continue;
    }
    if (change !== null) {
      return null;
    }
    change = {key, previous: previousEntity, next: nextEntity};
  }
  return change;
}

function singleExistingObjectEntityDeletion(previousValue, nextValue, keyFn) {
  const previous = canonicalObjectEntityMap(previousValue, keyFn);
  const next = canonicalObjectEntityMap(nextValue, keyFn);
  if (previous === null || next === null || previous.size !== next.size + 1) {
    return null;
  }
  let deletion = null;
  for (const [key, previousEntity] of previous.entries()) {
    if (!next.has(key)) {
      if (deletion !== null) {
        return null;
      }
      deletion = {key, previous: previousEntity};
      continue;
    }
    if (entityChanged(previousEntity, next.get(key))) {
      return null;
    }
  }
  return deletion;
}

function singleNewObjectEntityAddition(previousValue, nextValue, keyFn) {
  const previous = canonicalObjectEntityMap(previousValue, keyFn);
  const next = canonicalObjectEntityMap(nextValue, keyFn);
  if (previous === null || next === null || next.size !== previous.size + 1) {
    return null;
  }
  let addition = null;
  for (const [key, nextEntity] of next.entries()) {
    if (!previous.has(key)) {
      if (addition !== null) {
        return null;
      }
      addition = {key, next: nextEntity};
      continue;
    }
    if (entityChanged(previous.get(key), nextEntity)) {
      return null;
    }
  }
  return addition;
}

function singleMailAuthorityEntityChange(previousValue, nextValue, typedChanges, disposition) {
  if (Array.isArray(typedChanges) && typedChanges.length > 0) {
    if (typedChanges.length !== 1 || typedChanges[0].disposition !== disposition) {
      return null;
    }
    const change = typedChanges[0];
    return disposition === "insert"
      ? {key: change.mailId, next: change.after}
      : disposition === "delete"
        ? {key: change.mailId, previous: change.before}
        : {key: change.mailId, previous: change.before, next: change.after};
  }
  if (disposition === "insert") {
    return singleNewObjectEntityAddition(previousValue, nextValue, mailEntityKey);
  }
  if (disposition === "delete") {
    return singleExistingObjectEntityDeletion(previousValue, nextValue, mailEntityKey);
  }
  return singleExistingObjectEntityChange(previousValue, nextValue, mailEntityKey);
}

const MAIL_CLAIM_ASSET_FIELDS = new Set([
  "items",
  "currency",
  "currencies",
  "equipmentEnvelopes",
  "schemaVersion",
]);

function certifiedSingleMailClaimChange(previousValue, nextValue, typedChanges = []) {
  const update = singleMailAuthorityEntityChange(
    previousValue,
    nextValue,
    typedChanges,
    "update",
  );
  const deletion = singleMailAuthorityEntityChange(
    previousValue,
    nextValue,
    typedChanges,
    "delete",
  );
  if ((update === null) === (deletion === null)) {
    return null;
  }
  const mailId = update ? update.key : deletion.key;
  const beforeMail = update ? update.previous : deletion.previous;
  const nextMail = update ? update.next : null;
  if (
    mailId === ""
    || String(beforeMail && beforeMail.mailId || "") !== mailId
    || String(beforeMail && beforeMail.senderAccountId || "") === ""
    || String(beforeMail && beforeMail.recipientAccountId || "") === ""
    || String(beforeMail && beforeMail.title || "") === ""
    || String(beforeMail && beforeMail.createdAt || "") === ""
    || (nextMail !== null && (
      String(nextMail.mailId || "") !== mailId
      || String(nextMail.recipientAccountId || "") !== String(beforeMail.recipientAccountId || "")
      || Number(nextMail.schemaVersion) !== 2
      || !mailClaimMetadataPreserved(beforeMail, nextMail)
    ))
  ) {
    return null;
  }
  const removedEnvelopeIds = removedMailEquipmentEnvelopeIds(beforeMail, nextMail);
  if (removedEnvelopeIds === null) {
    return null;
  }
  if (nextMail === null) {
    if (!mailClaimHasAssets(beforeMail)) {
      return null;
    }
  } else if (!mailClaimAssetsStrictlyDescend(beforeMail, nextMail)) {
    return null;
  }
  return {
    mailId,
    disposition: nextMail === null ? "delete" : "update",
    beforeMail,
    nextMail,
    removedEnvelopeIds,
  };
}

function mailClaimMetadataPreserved(beforeMail, nextMail) {
  const metadata = (mail) => Object.fromEntries(
    Object.entries(mail || {}).filter(([field]) => !MAIL_CLAIM_ASSET_FIELDS.has(field)),
  );
  const beforeMetadata = metadata(beforeMail);
  const nextMetadata = metadata(nextMail);
  const beforeHasAssets = mailClaimHasAssets(beforeMail);
  const nextHasAssets = mailClaimHasAssets(nextMail);
  if (
    beforeHasAssets !== true
    || nextHasAssets === null
    || Object.hasOwn(beforeMetadata, "settledAt")
  ) {
    return false;
  }
  if (nextHasAssets) {
    return isDeepStrictEqual(beforeMetadata, nextMetadata);
  }
  if (
    !Object.hasOwn(nextMetadata, "settledAt")
  ) {
    return false;
  }
  const settledAt = canonicalMysqlIsoTimestamp(nextMetadata.settledAt)
    ? nextMetadata.settledAt
    : "";
  const createdAt = canonicalMysqlIsoTimestamp(beforeMetadata.createdAt)
    ? beforeMetadata.createdAt
    : "";
  if (
    settledAt === ""
    || (createdAt !== "" && Date.parse(settledAt) < Date.parse(createdAt))
  ) {
    return false;
  }
  const expectedMetadata = {
    ...beforeMetadata,
    settledAt,
  };
  if (
    beforeMetadata.readAt === null
    || beforeMetadata.readAt === undefined
    || String(beforeMetadata.readAt).trim() === ""
  ) {
    expectedMetadata.readAt = settledAt;
  } else if (!canonicalMysqlIsoTimestamp(beforeMetadata.readAt)) {
    return false;
  }
  return isDeepStrictEqual(nextMetadata, expectedMetadata);
}

function mailClaimAssetsStrictlyDescend(beforeMail, nextMail) {
  const beforeItems = canonicalMailClaimItemCounts(beforeMail);
  const nextItems = canonicalMailClaimItemCounts(nextMail);
  const beforeCurrency = canonicalMailClaimCurrency(beforeMail);
  const nextCurrency = canonicalMailClaimCurrency(nextMail);
  const beforeEnvelopes = mailEquipmentEnvelopeMap(beforeMail);
  const nextEnvelopes = mailEquipmentEnvelopeMap(nextMail);
  if (
    beforeItems === null
    || nextItems === null
    || beforeCurrency === null
    || nextCurrency === null
    || beforeEnvelopes === null
    || nextEnvelopes === null
  ) {
    return false;
  }
  let decreased = false;
  for (const [itemId, nextCount] of nextItems.entries()) {
    const beforeCount = beforeItems.get(itemId);
    if (beforeCount === undefined || nextCount > beforeCount) {
      return false;
    }
  }
  for (const [itemId, beforeCount] of beforeItems.entries()) {
    const nextCount = Number(nextItems.get(itemId) || 0);
    if (nextCount < beforeCount) {
      decreased = true;
    }
  }
  for (const currency of ["stoneCoins", "diamonds"]) {
    const beforeAmount = Number(beforeCurrency[currency] || 0);
    const nextAmount = Number(nextCurrency[currency] || 0);
    if (nextAmount > beforeAmount) {
      return false;
    }
    if (nextAmount < beforeAmount) {
      decreased = true;
    }
  }
  for (const [envelopeId, envelope] of nextEnvelopes.entries()) {
    if (!beforeEnvelopes.has(envelopeId)
      || !isDeepStrictEqual(beforeEnvelopes.get(envelopeId), envelope)) {
      return false;
    }
  }
  if (nextEnvelopes.size < beforeEnvelopes.size) {
    decreased = true;
  }
  return decreased;
}

function mailClaimHasAssets(mail) {
  const items = canonicalMailClaimItemCounts(mail);
  const currency = canonicalMailClaimCurrency(mail);
  const envelopes = mailEquipmentEnvelopeMap(mail);
  return items !== null
    && currency !== null
    && envelopes !== null
    && (items.size > 0
      || envelopes.size > 0
      || Number(currency.stoneCoins || 0) > 0
      || Number(currency.diamonds || 0) > 0);
}

function canonicalMailClaimItemCounts(mail) {
  const rawItems = mail && Object.hasOwn(mail, "items") ? mail.items : [];
  if (!Array.isArray(rawItems)) {
    return null;
  }
  const counts = new Map();
  for (const item of rawItems) {
    const itemId = String(item && item.itemId || "");
    const count = Number(item && item.count);
    const prior = Number(counts.get(itemId) || 0);
    if (
      !item
      || typeof item !== "object"
      || Array.isArray(item)
      || itemId === ""
      || itemId !== itemId.trim()
      || !Number.isSafeInteger(count)
      || count <= 0
      || !Number.isSafeInteger(prior + count)
    ) {
      return null;
    }
    counts.set(itemId, prior + count);
  }
  return counts;
}

function canonicalMailClaimCurrency(mail) {
  const representations = [];
  for (const field of ["currency", "currencies"]) {
    if (!mail || !Object.hasOwn(mail, field)) {
      continue;
    }
    const value = mail[field];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    if (Object.keys(value).some((key) => !["stoneCoins", "coins", "diamonds", "diamond"].includes(key))) {
      return null;
    }
    const normalized = {};
    for (const [canonicalId, aliases] of [
      ["stoneCoins", ["stoneCoins", "coins"]],
      ["diamonds", ["diamonds", "diamond"]],
    ]) {
      const present = aliases.filter((alias) => Object.hasOwn(value, alias));
      if (present.length > 1 && present.some((alias) => Number(value[alias]) !== Number(value[present[0]]))) {
        return null;
      }
      const amount = present.length > 0 ? Number(value[present[0]]) : 0;
      if (!Number.isSafeInteger(amount) || amount < 0) {
        return null;
      }
      if (amount > 0) {
        normalized[canonicalId] = amount;
      }
    }
    representations.push(normalized);
  }
  if (representations.length > 1
    && representations.some((value) => !isDeepStrictEqual(value, representations[0]))) {
    return null;
  }
  return representations[0] || {};
}

function certifiedOrdinaryMarketBuyTaxChange(previousValue, nextValue, listing) {
  const previous = canonicalOrdinaryMarketConfig(previousValue);
  const next = canonicalOrdinaryMarketConfig(nextValue);
  if (previous === null || next === null) {
    return null;
  }
  const currency = String(listing && listing.currency || "");
  const itemId = String(listing && listing.itemId || "");
  const count = Number(listing && listing.count);
  const unitPrice = Number(listing && listing.unitPrice);
  if (
    !["stoneCoins", "diamonds"].includes(currency)
    || itemId === ""
    || !Number.isSafeInteger(count)
    || count <= 0
    || !Number.isSafeInteger(unitPrice)
    || unitPrice <= 0
    || previous.defaultTaxBps !== next.defaultTaxBps
    || !isDeepStrictEqual(previous.itemTaxBps, next.itemTaxBps)
  ) {
    return null;
  }
  const otherCurrency = currency === "stoneCoins" ? "diamonds" : "stoneCoins";
  if (previous.taxCollected[otherCurrency] !== next.taxCollected[otherCurrency]) {
    return null;
  }
  const totalPriceBigInt = BigInt(count) * BigInt(unitPrice);
  if (totalPriceBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  const taxBps = Object.hasOwn(previous.itemTaxBps, itemId)
    ? previous.itemTaxBps[itemId]
    : previous.defaultTaxBps;
  const taxAmountBigInt = taxBps <= 0
    ? 0n
    : (totalPriceBigInt * BigInt(taxBps) + 9999n) / 10000n;
  const cappedTaxBigInt = taxAmountBigInt > totalPriceBigInt ? totalPriceBigInt : taxAmountBigInt;
  const taxAmount = Number(cappedTaxBigInt);
  const previousTotal = previous.taxCollected[currency];
  if (
    !Number.isSafeInteger(taxAmount)
    || !Number.isSafeInteger(previousTotal + taxAmount)
    || next.taxCollected[currency] !== previousTotal + taxAmount
  ) {
    return null;
  }
  return {currency, taxAmount};
}

function marketBuyServerStateChangesOnlyTax(previous, data, taxChange) {
  const previousState = persistentServerStateDocument(previous);
  const nextState = persistentServerStateDocument(data);
  const normalizedNextState = cloneJson(nextState);
  if (
    !normalizedNextState.marketConfig
    || !normalizedNextState.marketConfig.taxCollected
    || !previousState.marketConfig
    || !previousState.marketConfig.taxCollected
  ) {
    return false;
  }
  normalizedNextState.marketConfig.taxCollected[taxChange.currency]
    = previousState.marketConfig.taxCollected[taxChange.currency];
  return isDeepStrictEqual(previousState, normalizedNextState);
}

function canonicalOrdinaryMarketConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const fields = ["defaultTaxBps", "itemTaxBps", "schemaVersion", "taxCollected"].sort();
  if (!isDeepStrictEqual(Object.keys(value).sort(), fields) || value.schemaVersion !== 1) {
    return null;
  }
  const defaultTaxBps = value.defaultTaxBps;
  const itemTaxBps = value.itemTaxBps;
  const taxCollected = value.taxCollected;
  if (
    !Number.isSafeInteger(defaultTaxBps)
    || defaultTaxBps < 0
    || defaultTaxBps > 10000
    || !itemTaxBps
    || typeof itemTaxBps !== "object"
    || Array.isArray(itemTaxBps)
    || !taxCollected
    || typeof taxCollected !== "object"
    || Array.isArray(taxCollected)
    || !isDeepStrictEqual(Object.keys(taxCollected).sort(), ["diamonds", "stoneCoins"])
  ) {
    return null;
  }
  for (const [itemId, taxBps] of Object.entries(itemTaxBps)) {
    if (
      String(itemId || "").trim() === ""
      || !Number.isSafeInteger(taxBps)
      || taxBps < 0
      || taxBps > 10000
    ) {
      return null;
    }
  }
  for (const currency of ["stoneCoins", "diamonds"]) {
    if (!Number.isSafeInteger(taxCollected[currency]) || taxCollected[currency] < 0) {
      return null;
    }
  }
  return {
    defaultTaxBps,
    itemTaxBps,
    taxCollected,
  };
}

function certifiedOrdinaryMarketSaleMail(mail, listing, taxAmount, sellerAccountId) {
  if (!mail || typeof mail !== "object" || Array.isArray(mail)) {
    return false;
  }
  const fields = [
    "mailId",
    "senderAccountId",
    "senderUsername",
    "senderDisplayName",
    "recipientAccountId",
    "recipientUsername",
    "recipientDisplayName",
    "title",
    "body",
    "currency",
    "items",
    "createdAt",
    "readAt",
    "schemaVersion",
  ].sort();
  const count = Number(listing && listing.count);
  const unitPrice = Number(listing && listing.unitPrice);
  const totalPrice = count * unitPrice;
  const sellerReceives = totalPrice - taxAmount;
  const currency = String(listing && listing.currency || "");
  const expectedCurrency = sellerReceives > 0 ? {[currency]: sellerReceives} : {};
  return isDeepStrictEqual(Object.keys(mail).sort(), fields)
    && String(mail.mailId || "") !== ""
    && String(mail.senderAccountId || "") === "system_market"
    && String(mail.senderUsername || "") === "auction_house"
    && String(mail.senderDisplayName || "") === "拍卖行"
    && String(mail.recipientAccountId || "") === sellerAccountId
    && String(mail.recipientUsername || "") !== ""
    && String(mail.recipientDisplayName || "") !== ""
    && String(mail.title || "") === "拍卖行成交通知"
    && String(mail.body || "") !== ""
    && String(mail.createdAt || "") !== ""
    && mail.readAt === null
    && mail.schemaVersion === 1
    && Array.isArray(mail.items)
    && mail.items.length === 0
    && Number.isSafeInteger(totalPrice)
    && Number.isSafeInteger(sellerReceives)
    && sellerReceives >= 0
    && isDeepStrictEqual(mail.currency, expectedCurrency);
}

function canonicalObjectEntityMap(value, keyFn) {
  if (value === undefined) {
    return new Map();
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const result = new Map();
  for (const objectKey of Object.keys(value).sort()) {
    const entity = value[objectKey];
    const key = entityKey(keyFn, entity);
    if (key === "" || key !== objectKey || result.has(key)) {
      return null;
    }
    result.set(key, entity);
  }
  return result;
}

function conditionalProfileReceiptDelta(previousValue, nextValue, receiptStatements) {
  const delta = durableMutationReceiptDeltaFrom(previousValue, nextValue);
  if (delta.ok) {
    if (delta.deletes.length + delta.upserts.length !== receiptStatements.length) {
      return {ok: false, deletes: [], upserts: []};
    }
    return delta;
  }
  const previousEmpty = previousValue && typeof previousValue === "object"
    && !Array.isArray(previousValue)
    && Object.keys(previousValue).length === 0;
  const nextEmpty = nextValue && typeof nextValue === "object"
    && !Array.isArray(nextValue)
    && Object.keys(nextValue).length === 0;
  if (previousEmpty) {
    const stagedFromEmpty = durableMutationReceiptDelta(nextValue);
    if (stagedFromEmpty.ok
      && stagedFromEmpty.deletes.length === 0
      && stagedFromEmpty.upserts.length === receiptStatements.length) {
      return stagedFromEmpty;
    }
  }
  if (previousEmpty && nextEmpty && receiptStatements.length === 0) {
    return {ok: true, deletes: [], upserts: []};
  }
  return {ok: false, deletes: [], upserts: []};
}

function conditionalMutationReceiptWriteSet(previousValue, nextValue, receiptStatements) {
  const delta = conditionalProfileReceiptDelta(previousValue, nextValue, receiptStatements);
  if (
    !delta.ok
    || delta.upserts.length !== 1
    || !certifiedMutationReceiptDeletes(delta)
  ) {
    return null;
  }
  const receipt = delta.upserts[0] || null;
  const receiptWrites = [
    ...delta.deletes.map(conditionalMutationReceiptDelete),
    conditionalMutationReceiptInsert(receipt),
  ].sort((left, right) => {
    const keyOrder = compareCanonicalIds(left.key, right.key);
    if (keyOrder !== 0) {
      return keyOrder;
    }
    return left.kind === right.kind ? 0 : left.kind === "delete" ? -1 : 1;
  });
  return {
    receipt,
    writes: [
      ...(delta.deletes.length === 0 ? [mutationReceiptCapacityAdjustment(1)] : []),
      ...receiptWrites,
    ],
  };
}

function certifiedMutationReceiptDeletes(delta) {
  if (!delta || !Array.isArray(delta.deletes) || !Array.isArray(delta.upserts)) {
    return false;
  }
  if (delta.deletes.length === 0) {
    return true;
  }
  if (delta.deletes.length > 1 || delta.upserts.length !== 1) {
    return false;
  }
  const receipt = delta.upserts[0] || null;
  const cutoffMs = Date.parse(String(receipt && receipt.committedAt || ""));
  if (receipt === null || !Number.isFinite(cutoffMs)) {
    return false;
  }
  return delta.deletes.every((deletion) => {
    const expectedReceipt = deletion && deletion.expectedReceipt;
    const operationId = String(deletion && deletion.operationId || "");
    const expiresAtMs = Date.parse(String(expectedReceipt && expectedReceipt.expiresAt || ""));
    const sameOperationId = operationId === String(receipt.operationId || "");
    return Boolean(expectedReceipt)
      && String(expectedReceipt.operationId || "") === operationId
      && Number.isFinite(expiresAtMs)
      && expiresAtMs <= cutoffMs
      && (
        (deletion.reason === "expired_same_operation_id" && sameOperationId)
        || (deletion.reason === "expired" && !sameOperationId)
      );
  });
}

function loadPersistentData(config, database, options = {}) {
  const includeConsumedEquipmentEnvelopes = options.includeConsumedEquipmentEnvelopes === true
    || mysqlTableExists(config, database, "consumed_equipment_envelopes");
  const includeMutationReceipts = options.includeMutationReceipts === true
    || mysqlTableExists(config, database, "mutation_receipts");
  const includeStoreRevision = options.includeStoreRevision === true
    || (options.detectStoreRevision === true
      && mysqlTableExists(config, database, "auth_store_revisions"));
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), MYSQL_LOAD_TEMP_PREFIX));
  const outputPath = path.join(temporaryDirectory, "persistent-data.tsv");
  let outputFd = null;
  try {
    outputFd = fs.openSync(outputPath, "wx", 0o600);
    fs.fchmodSync(outputFd, 0o600);
    runMysql(
      config,
      database,
      loadPersistentDataSql({
        includeConsumedEquipmentEnvelopes,
        includeMutationReceipts,
        includeStoreRevision,
      }),
      {stdoutFd: outputFd, timeoutMs: config.authorityLoadTimeoutMs},
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

function ensureMailInboxPageIndexSchema(config, database) {
  const contract = mysqlMailInboxPageIndexContract(config, database);
  if (contract.exists) {
    if (!contract.valid) {
      const error = new Error(
        "MySQL邮箱分页索引契约不兼容：mail_messages必须按recipient_account_id、created_at、mail_id建立完整索引。",
      );
      error.code = "mysql_mail_inbox_page_index_contract_invalid";
      throw error;
    }
    return;
  }
  // This is startup-owned online DDL for an existing Beastbound table. It is
  // deliberately local to this schema and never changes shared MySQL globals.
  // A later startup revalidates the exact named-column contract.
  const metadataLockWaitTimeoutSeconds = config.transactionPolicy
    .metadataLockWaitTimeoutSeconds;
  const commandTimeoutMs = config.mailInboxIndexMigrationTimeoutMs;
  try {
    runMysql(config, database, `
      SET SESSION lock_wait_timeout = ${metadataLockWaitTimeoutSeconds};
      ALTER TABLE ${MYSQL_MAIL_INBOX_PAGE_INDEX.tableName}
        ADD INDEX ${MYSQL_MAIL_INBOX_PAGE_INDEX.indexName}
          (${MYSQL_MAIL_INBOX_PAGE_INDEX.columns.join(", ")}),
        ALGORITHM=INPLACE,
        LOCK=NONE;
    `, {timeoutMs: commandTimeoutMs});
  } catch (cause) {
    if (cause && cause.code === "mysql_command_timeout") {
      const error = new Error("MySQL邮箱分页索引迁移超过进程期限，服务拒绝启动。");
      error.code = "mysql_mail_inbox_page_index_migration_timeout";
      error.timeoutMs = commandTimeoutMs;
      error.cause = cause;
      throw error;
    }
    if (/\b(?:ERROR\s+1205|Lock wait timeout exceeded|metadata lock)\b/i.test(
      String(cause && cause.message || ""),
    )) {
      const error = new Error("MySQL邮箱分页索引迁移等待 metadata lock 超时，服务拒绝启动。");
      error.code = "mysql_mail_inbox_page_index_migration_lock_timeout";
      error.timeoutSeconds = metadataLockWaitTimeoutSeconds;
      error.cause = cause;
      throw error;
    }
    const error = new Error("MySQL邮箱分页索引迁移失败，服务拒绝启动。");
    error.code = "mysql_mail_inbox_page_index_migration_failed";
    error.cause = cause;
    throw error;
  }
}

function mysqlMailInboxPageIndexContract(config, database) {
  const schema = String(database || "").trim();
  const output = runMysql(config, "", `
    SELECT
      COUNT(*),
      COALESCE(GROUP_CONCAT(
        CONCAT(seq_in_index, ':', LOWER(column_name))
        ORDER BY seq_in_index SEPARATOR ','
      ), ''),
      COALESCE(SUM(sub_part IS NOT NULL), 0),
      COALESCE(SUM(UPPER(is_visible) <> 'YES'), 0),
      COALESCE(GROUP_CONCAT(DISTINCT UPPER(index_type) ORDER BY index_type), '')
    FROM information_schema.statistics
    WHERE table_schema = ${sqlString(schema)}
      AND table_name = ${sqlString(MYSQL_MAIL_INBOX_PAGE_INDEX.tableName)}
      AND index_name = ${sqlString(MYSQL_MAIL_INBOX_PAGE_INDEX.indexName)};
  `);
  const columns = String(output || "").trim().split("\t");
  const count = Number(columns[0] || 0);
  if (!Number.isFinite(count) || count < 1) {
    return {exists: false, valid: false};
  }
  const indexedColumns = String(columns[1] || "").trim().toLowerCase();
  const prefixColumns = Number(columns[2] || 0);
  const invisibleColumns = Number(columns[3] || 0);
  const indexTypes = String(columns[4] || "").trim().toUpperCase();
  const expectedColumns = MYSQL_MAIL_INBOX_PAGE_INDEX.columns
    .map((columnName, index) => `${index + 1}:${columnName}`)
    .join(",");
  return {
    exists: true,
    valid: count === MYSQL_MAIL_INBOX_PAGE_INDEX.columns.length
      && indexedColumns === expectedColumns
      && prefixColumns === 0
      && invisibleColumns === 0
      && indexTypes === "BTREE",
  };
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
    "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ",
    "SET autocommit = 0",
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
  if (options.includeStoreRevision === true) {
    statements.splice(2, 0,
      "SELECT 'store_revision', scope_key, CAST(revision AS CHAR) FROM auth_store_revisions WHERE scope_key = 'auth'",
    );
  }
  statements.push("COMMIT");
  return statements.join(";\n");
}

function parsePersistentDataRows(output, options = {}) {
  return parsePersistentDataLines(persistentDataOutputLines(output), options);
}

function parsePersistentDataLines(lines, options = {}) {
  const data = emptyPersistentData();
  let legacyDocument = null;
  let stateDocument = null;
  let storeRevision = 0;
  let storeRevisionPresent = false;
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
    if (bucket === "store_revision") {
      const parsedRevision = Number(columns.slice(2).join("\t"));
      if (rowKey !== MYSQL_STORE_REVISION_SCOPE
        || !Number.isSafeInteger(parsedRevision)
        || parsedRevision < 0) {
        const error = new Error("MySQL全局存档版本非法，拒绝加载。");
        error.code = MYSQL_STORE_REVISION_MISSING;
        throw error;
      }
      storeRevision = parsedRevision;
      storeRevisionPresent = true;
      continue;
    }
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
    return attachMysqlStoreRevision(data, storeRevision, storeRevisionPresent, entityTableState);
  }
  return attachMysqlStoreRevision(legacyDocument || {}, storeRevision, storeRevisionPresent, false);
}

function attachMysqlStoreRevision(data, revision, present, entityStatePresent) {
  const target = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  Object.defineProperties(target, {
    [MYSQL_ENTITY_STATE_PRESENT]: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: entityStatePresent === true,
    },
    [MYSQL_STORE_REVISION]: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: revision,
    },
    [MYSQL_STORE_REVISION_PRESENT]: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: present === true,
    },
  });
  return target;
}

function mysqlEntityStatePresent(data) {
  return Boolean(data && data[MYSQL_ENTITY_STATE_PRESENT] === true);
}

function mysqlStoreRevision(data) {
  const revision = Number(data && data[MYSQL_STORE_REVISION]);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function mysqlStoreRevisionPresent(data) {
  return Boolean(data && data[MYSQL_STORE_REVISION_PRESENT] === true);
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
      // defineProperty also keeps a malformed "__proto__" primary key as an
      // inspectable own row instead of invoking Object.prototype's setter.
      Object.defineProperty(data.mailMessages, String(rowKey || ""), {
        configurable: true,
        enumerable: true,
        value: document,
        writable: true,
      });
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
  if (isCanonicalMailAuthorityState(data.mailMessages)) {
    data.mailMessages = commitMailAuthorityDelta(data.mailMessages);
  }
  return data;
}

function mergeMysqlSaveBaselineAfterCommit(previous, committed, plan) {
  if (!plan || ![
    "profile_conditional_v2",
    "market_create_conditional_v1",
    "market_cancel_conditional_v1",
    "market_buy_conditional_v1",
    "mail_send_conditional_v1",
    "mail_read_conditional_v1",
    "mail_claim_conditional_v1",
  ].includes(plan.kind)) {
    return committed;
  }
  if (plan.kind === "mail_send_conditional_v1") {
    const mode = String(plan.mode || "");
    const accountId = String(plan.accountId || "");
    const playerId = String(plan.playerId || "");
    const recipientAccountId = String(plan.recipientAccountId || "");
    const mailId = String(plan.mailId || "");
    const operationId = String(plan.operationId || "");
    const mail = committed.mailMessages && committed.mailMessages[mailId];
    const receipt = committed.mutationReceipts && committed.mutationReceipts[operationId];
    if (
      !previous
      || ![MAIL_SEND_MODE_TEXT, MAIL_SEND_MODE_ORDINARY_ITEMS].includes(mode)
      || accountId === ""
      || recipientAccountId === ""
      || recipientAccountId === accountId
      || mailId === ""
      || operationId === ""
      || !mail
      || !receipt
      || String(mail.mailId || "") !== mailId
      || String(mail.senderAccountId || "") !== accountId
      || String(mail.recipientAccountId || "") !== recipientAccountId
      || (previous.mailMessages && Object.hasOwn(previous.mailMessages, mailId))
    ) {
      const error = new Error("MySQL mail send 条件提交缺少已证明的新增资源结果。");
      error.code = "mysql_resource_precondition_invalid";
      throw error;
    }
    const merged = {
      ...previous,
      mutationReceipts: committed.mutationReceipts,
      mailMessages: mergeCommittedMailAuthorityChange(
        previous.mailMessages,
        {mailId, disposition: "insert", mail},
      ),
    };
    if (mode === MAIL_SEND_MODE_TEXT) {
      if (playerId !== "") {
        const error = new Error("MySQL text mail send 不应提交档案资源。");
        error.code = "mysql_resource_precondition_invalid";
        throw error;
      }
      return merged;
    }
    const binding = committed.profileBindings && committed.profileBindings[accountId];
    const profile = committed.profiles && committed.profiles[playerId];
    if (playerId === "" || !binding || !profile) {
      const error = new Error("MySQL ordinary mail send 条件提交缺少发件人档案结果。");
      error.code = "mysql_resource_precondition_invalid";
      throw error;
    }
    return {
      ...merged,
      profileBindings: {
        ...(previous.profileBindings || {}),
        [accountId]: binding,
      },
      profiles: {
        ...(previous.profiles || {}),
        [playerId]: profile,
      },
    };
  }
  if (plan.kind === "mail_read_conditional_v1") {
    const accountId = String(plan.accountId || "");
    const mailId = String(plan.mailId || "");
    const operationId = String(plan.operationId || "");
    const mailDisposition = String(plan.mailDisposition || "");
    const previousMail = previous && previous.mailMessages && previous.mailMessages[mailId];
    const committedMail = committed.mailMessages && committed.mailMessages[mailId];
    const receipt = committed.mutationReceipts && committed.mutationReceipts[operationId];
    const expectedCommittedMail = previousMail && committedMail
      ? {...previousMail, readAt: committedMail.readAt}
      : null;
    if (
      !previous
      || accountId === ""
      || mailId === ""
      || operationId === ""
      || mailDisposition !== "update"
      || !previousMail
      || !committedMail
      || !receipt
      || String(previousMail.mailId || "") !== mailId
      || String(previousMail.recipientAccountId || "") !== accountId
      || previousMail.readAt !== null
      || String(committedMail.mailId || "") !== mailId
      || String(committedMail.recipientAccountId || "") !== accountId
      || !canonicalMysqlIsoTimestamp(committedMail.readAt)
      || !isDeepStrictEqual(committedMail, expectedCommittedMail)
      || String(receipt.operationId || "") !== operationId
      || String(receipt.accountId || "") !== accountId
    ) {
      const error = new Error("MySQL mail read 条件提交缺少已证明的已读资源结果。");
      error.code = "mysql_resource_precondition_invalid";
      throw error;
    }
    return {
      ...previous,
      mutationReceipts: committed.mutationReceipts,
      mailMessages: mergeCommittedMailAuthorityChange(
        previous.mailMessages,
        {mailId, disposition: "update", mail: committedMail},
      ),
    };
  }
  const accountId = String(plan.accountId || "");
  const playerId = String(plan.playerId || "");
  const binding = committed.profileBindings && committed.profileBindings[accountId];
  const profile = committed.profiles && committed.profiles[playerId];
  if (!previous || !binding || !profile) {
    const error = new Error("MySQL 条件提交缺少 Node-local 档案资源基线。");
    error.code = "mysql_resource_precondition_invalid";
    throw error;
  }
  // A profile-v2 COMMIT proves only its certified row-local resources. Keep
  // every unrelated resource at this writer's last known baseline instead of
  // relabelling the request candidate as a fresh database-wide snapshot.
  const merged = {
    ...previous,
    profileBindings: {
      ...(previous.profileBindings || {}),
      [accountId]: binding,
    },
    profiles: {
      ...(previous.profiles || {}),
      [playerId]: profile,
    },
    mutationReceipts: committed.mutationReceipts,
  };
  if (plan.kind === "profile_conditional_v2") {
    return merged;
  }

  if (plan.kind === "market_create_conditional_v1") {
    const listingId = String(plan.listingId || "");
    const operationId = String(plan.operationId || "");
    const receipt = committed.mutationReceipts && committed.mutationReceipts[operationId];
    const listing = committed.marketListings && committed.marketListings[listingId];
    if (
      listingId === ""
      || operationId === ""
      || !receipt
      || !listing
      || String(listing.listingId || "") !== listingId
      || (previous.marketListings && Object.hasOwn(previous.marketListings, listingId))
    ) {
      const error = new Error("MySQL market create 条件提交缺少已证明的新增资源结果。");
      error.code = "mysql_resource_precondition_invalid";
      throw error;
    }
    return {
      ...merged,
      marketListings: {
        ...(previous.marketListings || {}),
        [listingId]: listing,
      },
    };
  }

  if (plan.kind === "mail_claim_conditional_v1") {
    const mailId = String(plan.mailId || "");
    const operationId = String(plan.operationId || "");
    const mailDisposition = String(plan.mailDisposition || "");
    const claimedEnvelopeIds = canonicalMailClaimEnvelopeIds(plan.claimedEnvelopeIds);
    const receipt = committed.mutationReceipts && committed.mutationReceipts[operationId];
    const committedMail = committed.mailMessages && committed.mailMessages[mailId];
    const committedLedger = committed.consumedEquipmentEnvelopes;
    if (
      mailId === ""
      || operationId === ""
      || mailDisposition !== "update"
      || claimedEnvelopeIds === null
      || !receipt
      || !committedMail
      || claimedEnvelopeIds.some((envelopeId) => !(
        committedLedger && committedLedger[envelopeId]
      ))
    ) {
      const error = new Error("MySQL mail claim 条件提交缺少已证明的资源结果。");
      error.code = "mysql_resource_precondition_invalid";
      throw error;
    }
    const mailMessages = mergeCommittedMailAuthorityChange(
      previous.mailMessages,
      {mailId, disposition: "update", mail: committedMail},
    );
    return {
      ...merged,
      mailMessages,
      consumedEquipmentEnvelopes: committedLedger,
    };
  }

  const listingId = String(plan.listingId || "");
  const operationId = String(plan.operationId || "");
  const receipt = committed.mutationReceipts && committed.mutationReceipts[operationId];
  if (
    listingId === ""
    || operationId === ""
    || !receipt
    || (committed.marketListings && Object.hasOwn(committed.marketListings, listingId))
  ) {
    const error = new Error("MySQL market cancel 条件提交缺少已证明的资源结果。");
    error.code = "mysql_resource_precondition_invalid";
    throw error;
  }
  const marketListings = {...(previous.marketListings || {})};
  delete marketListings[listingId];
  const marketMerged = {
    ...merged,
    marketListings,
  };
  if (plan.kind === "market_cancel_conditional_v1") {
    return marketMerged;
  }

  const saleMailId = String(plan.saleMailId || "");
  const saleMail = committed.mailMessages && committed.mailMessages[saleMailId];
  const currency = String(plan.currency || "");
  const taxAmount = Number(plan.taxAmount);
  const previousMarketConfig = canonicalOrdinaryMarketConfig(previous.marketConfig);
  if (
    saleMailId === ""
    || !saleMail
    || !["stoneCoins", "diamonds"].includes(currency)
    || !Number.isSafeInteger(taxAmount)
    || taxAmount < 0
    || previousMarketConfig === null
    || !Number.isSafeInteger(previousMarketConfig.taxCollected[currency] + taxAmount)
  ) {
    const error = new Error("MySQL market buy 条件提交缺少已证明的成交资源结果。");
    error.code = "mysql_resource_precondition_invalid";
    throw error;
  }
  return {
    ...marketMerged,
    mailMessages: mergeCommittedMailAuthorityChange(
      previous.mailMessages,
      {mailId: saleMailId, disposition: "insert", mail: saleMail},
    ),
    marketConfig: {
      ...previous.marketConfig,
      taxCollected: {
        ...previousMarketConfig.taxCollected,
        [currency]: previousMarketConfig.taxCollected[currency] + taxAmount,
      },
    },
  };
}

function mergeCommittedMailAuthorityChange(previousValue, change) {
  const staged = change.disposition === "delete"
    ? stageMailAuthorityDelete(previousValue, change.mailId)
    : stageMailAuthorityUpsert(previousValue, change.mail);
  if (!staged.ok || !isCanonicalMailAuthorityState(staged.messages)) {
    const error = new Error("MySQL 条件提交无法合并邮件权威基线。");
    error.code = "mysql_resource_precondition_invalid";
    throw error;
  }
  return commitMailAuthorityDelta(staged.messages);
}

function canonicalizeMysqlMailAuthorityBaseline(data) {
  if (!data || isCanonicalMailAuthorityState(data.mailMessages)) {
    return data;
  }
  const read = readMailAuthorityState(data.mailMessages);
  if (read.ok) {
    data.mailMessages = read.messages;
  }
  // Malformed legacy rows stay intact. The existing domain quarantine then
  // fails only the owning mail operation closed instead of dropping assets at
  // startup or silently adopting a partial baseline.
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

function appendObjectEntityDiff(statements, tableName, primaryColumn, previousObject, nextObject, keyFn, insertFn, options = {}) {
  appendEntityDiff(
    statements,
    tableName,
    primaryColumn,
    entityMapFromObject(previousObject, keyFn),
    entityMapFromObject(nextObject, keyFn),
    insertFn,
    options,
  );
}

function appendMailAuthorityDeltaOrDiff(statements, previousValue, nextValue, options = {}) {
  const delta = options.allowCertifiedDelta === true
    ? certifiedMailDeltaAgainstBaseline(previousValue, nextValue)
    : null;
  if (delta !== null) {
    for (const change of delta.changes) {
      if (Array.isArray(options.typedChanges)) {
        options.typedChanges.push(change);
      }
      if (change.disposition === "delete") {
        statements.push(deleteEntityStatement("mail_messages", "mail_id", change.mailId));
      } else if (change.disposition === "insert") {
        statements.push(insertMailStatement(change.after));
      } else {
        statements.push(upsertEntityStatement(
          insertMailStatement(change.after),
          upsertColumnsForTable("mail_messages"),
        ));
      }
    }
    return;
  }
  appendObjectEntityDiff(
    statements,
    "mail_messages",
    "mail_id",
    previousValue,
    nextValue,
    mailEntityKey,
    insertMailStatement,
    {strictInsertNew: true},
  );
}

function certifiedMailDeltaAgainstBaseline(previousValue, nextValue) {
  let delta = mailAuthorityDeltaFrom(previousValue, nextValue);
  if (!delta.ok) {
    delta = mailAuthorityDelta(nextValue);
  }
  if (!delta.ok) {
    return null;
  }
  for (const change of delta.changes) {
    const mailId = String(change && change.mailId || "");
    const previousMail = previousValue && previousValue[mailId];
    const expectedBefore = change.before || null;
    if (
      mailId === ""
      || (change.after !== null && mailEntityKey(change.after) !== mailId)
      || (expectedBefore !== null && mailEntityKey(expectedBefore) !== mailId)
      || (expectedBefore === null
        ? Boolean(previousMail)
        : !isDeepStrictEqual(previousMail, expectedBefore))
    ) {
      return null;
    }
  }
  return delta;
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

function fallbackMutationReceiptWrites(previousValue, nextValue, options = {}) {
  const previous = mutationReceiptMap(previousValue);
  const next = mutationReceiptMap(nextValue);
  const writes = [];
  for (const operationId of Object.keys(previous).sort()) {
    if (!Object.hasOwn(next, operationId)) {
      if (options.requireCertifiedDeletes === true) {
        const error = new Error("在线 MySQL 回执删除缺少规范过期凭证。");
        error.code = "mysql_resource_precondition_invalid";
        throw error;
      }
      writes.push(conditionalMutationReceiptDelete({
        operationId,
        expectedReceipt: previous[operationId],
        reason: "maintenance_snapshot_diff",
      }));
    }
  }
  for (const operationId of Object.keys(next).sort()) {
    if (Object.hasOwn(previous, operationId)) {
      if (entityChanged(previous[operationId], next[operationId])) {
        throw new Error("持久化操作回执只能按过期策略删除，不能改写既有结果。");
      }
      continue;
    }
    writes.push(conditionalMutationReceiptInsert(next[operationId]));
  }
  return writes;
}

function mutationReceiptWrites(previousValue, nextValue, options = {}) {
  const delta = durableMutationReceiptDeltaFrom(previousValue, nextValue);
  if (!delta.ok) {
    return fallbackMutationReceiptWrites(previousValue, nextValue, options);
  }
  if (
    options.requireCertifiedDeletes === true
    && !certifiedMutationReceiptDeletes(delta)
  ) {
    const error = new Error("在线 MySQL 回执删除缺少规范过期凭证。");
    error.code = "mysql_resource_precondition_invalid";
    throw error;
  }
  const writes = [];
  for (const deletion of delta.deletes) {
    if (
      options.requireCertifiedDeletes === true
      && !["expired", "expired_same_operation_id"].includes(deletion.reason)
    ) {
      const error = new Error("在线 MySQL 回执删除不是规范过期清理。");
      error.code = "mysql_resource_precondition_invalid";
      throw error;
    }
    writes.push(conditionalMutationReceiptDelete(deletion));
  }
  for (const receipt of delta.upserts) {
    writes.push(conditionalMutationReceiptInsert(receipt));
  }
  return writes;
}

function appendMutationReceiptDeltaOrDiff(statements, previousValue, nextValue, options = {}) {
  const writes = mutationReceiptWrites(previousValue, nextValue, options);
  for (const write of writes) {
    statements.push(legacyMutationReceiptRawStatement(write));
  }
  if (Array.isArray(options.typedWrites)) {
    options.typedWrites.push(...writes);
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

function appendEntityDiff(statements, tableName, primaryColumn, previousMap, nextMap, insertFn, options = {}) {
  for (const key of Object.keys(previousMap).sort()) {
    if (!Object.prototype.hasOwnProperty.call(nextMap, key)) {
      statements.push(deleteEntityStatement(tableName, primaryColumn, key));
    }
  }
  for (const key of Object.keys(nextMap).sort()) {
    const nextEntity = nextMap[key];
    if (!Object.prototype.hasOwnProperty.call(previousMap, key)) {
      statements.push(options.strictInsertNew === true
        ? insertFn(nextEntity)
        : upsertEntityStatement(insertFn(nextEntity), upsertColumnsForTable(tableName)));
    } else if (entityChanged(previousMap[key], nextEntity)) {
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
  const transactionPolicyOptions = options.transactionPolicy
    && typeof options.transactionPolicy === "object"
    && !Array.isArray(options.transactionPolicy)
    ? options.transactionPolicy
    : {};
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
    authorityLoadTimeoutMs: Math.min(positiveIntegerConfig(
      options.authorityLoadTimeoutMs,
      process.env.BEASTBOUND_MYSQL_AUTHORITY_LOAD_TIMEOUT_MS,
      DEFAULT_MYSQL_AUTHORITY_LOAD_TIMEOUT_MS,
    ), MAX_MYSQL_AUTHORITY_LOAD_TIMEOUT_MS),
    mailInboxIndexMigrationTimeoutMs: Math.min(positiveIntegerConfig(
      options.mailInboxIndexMigrationTimeoutMs,
      process.env.BEASTBOUND_MYSQL_MAIL_INBOX_INDEX_MIGRATION_TIMEOUT_MS,
      DEFAULT_MYSQL_MAIL_INBOX_INDEX_MIGRATION_TIMEOUT_MS,
    ), MAX_MYSQL_MAIL_INBOX_INDEX_MIGRATION_TIMEOUT_MS),
    healthProbeTimeoutMs: positiveIntegerConfig(options.healthProbeTimeoutMs, undefined, 2000),
    usePool: mysqlPoolEnabled(options, mysqlPathExplicit),
    poolFactory: typeof options.poolFactory === "function" ? options.poolFactory : defaultMysqlPoolFactory,
    poolConnectionLimit: positiveIntegerConfig(
      options.poolConnectionLimit,
      process.env.BEASTBOUND_MYSQL_POOL_CONNECTION_LIMIT,
      2,
    ),
    poolConnectTimeoutMs: Math.min(positiveIntegerConfig(
      options.poolConnectTimeoutMs,
      process.env.BEASTBOUND_MYSQL_CONNECT_TIMEOUT_MS,
      2000,
    ), 30000),
    poolQueueLimit: Math.min(positiveIntegerConfig(
      options.poolQueueLimit,
      process.env.BEASTBOUND_MYSQL_POOL_QUEUE_LIMIT,
      64,
    ), 1024),
    transactionPolicy: normalizeMysqlTransactionPolicy({
      poolAcquireTimeoutMs: transactionPolicyOptions.poolAcquireTimeoutMs
        ?? options.poolAcquireTimeoutMs
        ?? process.env.BEASTBOUND_MYSQL_POOL_ACQUIRE_TIMEOUT_MS,
      sessionSetupTimeoutMs: transactionPolicyOptions.sessionSetupTimeoutMs
        ?? options.sessionSetupTimeoutMs
        ?? process.env.BEASTBOUND_MYSQL_SESSION_SETUP_TIMEOUT_MS,
      transactionTimeoutMs: transactionPolicyOptions.transactionTimeoutMs
        ?? options.transactionTimeoutMs
        ?? process.env.BEASTBOUND_MYSQL_TRANSACTION_TIMEOUT_MS,
      rowLockWaitTimeoutSeconds: transactionPolicyOptions.rowLockWaitTimeoutSeconds
        ?? options.rowLockWaitTimeoutSeconds
        ?? process.env.BEASTBOUND_MYSQL_ROW_LOCK_WAIT_TIMEOUT_SECONDS,
      metadataLockWaitTimeoutSeconds: transactionPolicyOptions.metadataLockWaitTimeoutSeconds
        ?? options.metadataLockWaitTimeoutSeconds
        ?? process.env.BEASTBOUND_MYSQL_METADATA_LOCK_WAIT_TIMEOUT_SECONDS,
    }),
    singleWriterMaintenance: boolConfig(
      options.singleWriterMaintenance,
      process.env.BEASTBOUND_MYSQL_SINGLE_WRITER_MAINTENANCE,
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
    connectTimeout: config.poolConnectTimeoutMs,
    waitForConnections: true,
    connectionLimit: config.poolConnectionLimit,
    queueLimit: config.poolQueueLimit,
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
    const timeoutMs = Math.max(0, Math.trunc(Number(options.timeoutMs || 0)));
    return execFileSync(config.mysqlPath, mysqlArgs(config, database), {
      "encoding": options.binaryOutput === true ? null : "utf8",
      "input": sql,
      "maxBuffer": config.outputMaxBufferBytes,
      "stdio": ["pipe", Number.isInteger(options.stdoutFd) ? options.stdoutFd : "pipe", "pipe"],
      ...(timeoutMs > 0 ? {timeout: timeoutMs, killSignal: "SIGKILL"} : {}),
    });
  } catch (error) {
    if (options.silent) {
      return "";
    }
    if (error && (error.code === "ETIMEDOUT" || error.signal === "SIGKILL")) {
      const timeoutError = new Error("MySQL 权威存档读取超过 Beastbound 进程期限。");
      timeoutError.code = "mysql_command_timeout";
      timeoutError.cause = error;
      throw timeoutError;
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

function singleWriterMaintenanceStatements(statements) {
  if (!Array.isArray(statements)
    || statements[0] !== "START TRANSACTION"
    || statements[statements.length - 1] !== "COMMIT") {
    throw new Error("停服维护写入缺少完整 MySQL 事务边界。");
  }
  return [
    ...statements.slice(0, -1),
    `UPDATE auth_store_revisions
      SET revision = (SELECT COUNT(*) FROM mutation_receipts)
      WHERE scope_key = '${MUTATION_RECEIPT_CAPACITY_GUARD_KEY}'`,
    "UPDATE auth_store_revisions SET revision = revision + 1 WHERE scope_key = 'auth'",
    "COMMIT",
  ];
}

async function runMysqlPoolSavePlan(pool, plan, options = {}) {
  if (!plan || plan.kind === "noop") {
    return {revision: null, globalRevisionAdvanced: false};
  }
  if (plan.kind === "legacy_global_cas") {
    const capacityCheck = assertLegacyMarketCreateCapacityPlan(plan);
    const receiptWrites = assertLegacyMutationReceiptWrites(plan);
    const receiptCapacityWrite = assertLegacyMutationReceiptCapacityWrite(plan, receiptWrites);
    return runMysqlPoolSaveStatements(pool, plan.statements, {
      ...options,
      resourceLocks: plan.resourceLocks,
      capacityCheck,
      receiptCapacityWrite,
      receiptWrites,
    });
  }
  if (
    ![
      "profile_conditional_v2",
      "market_create_conditional_v1",
      "market_cancel_conditional_v1",
      "market_buy_conditional_v1",
      "mail_send_conditional_v1",
      "mail_read_conditional_v1",
      "mail_claim_conditional_v1",
    ].includes(plan.kind)
    || plan.globalRevisionFence !== false
    || plan.globalCompatibilityBarrier !== "shared"
  ) {
    throw new Error("未知或缺少兼容屏障的 MySQL 存档计划。");
  }
  assertMysqlResourceAcquisitionOrder(plan);
  return runMysqlPoolSaveTransaction(pool, {
    ...options,
    revisionCasEnabled: false,
    globalRevisionBarrier: "shared_expected",
  }, async (connection) => {
    await assertMysqlResourceLocks(connection, plan.locks);
    if (plan.kind === "market_create_conditional_v1") {
      await assertMysqlMarketCreateCapacity(connection, plan.capacityCheck);
    }
    for (const write of plan.writes) {
      let result;
      try {
        result = await connection.query(write.sql, write.params);
      } catch (error) {
        if (["market_listing", "mail_message", "consumed_equipment_envelope", "mutation_receipt"].includes(write.resource)
          && error && error.code === "ER_DUP_ENTRY") {
          throw mysqlResourceRevisionConflict(write.resource, write.key);
        }
        throw error;
      }
      if (mysqlAffectedRows(result) !== write.expectedAffectedRows) {
        throw mysqlResourceRevisionConflict(write.resource, write.key);
      }
    }
  });
}

function assertLegacyMarketCreateCapacityPlan(plan) {
  const statements = Array.isArray(plan && plan.statements) ? plan.statements : [];
  const marketInserts = statements.filter(isPlainLegacyMarketListingInsertStatement);
  const marketDeletes = statements.filter((statement) => (
    /^DELETE FROM market_listings\b/i.test(String(statement || "").trim())
  ));
  const required = marketInserts.length === 1 && marketDeletes.length === 0;
  const locks = Array.isArray(plan && plan.resourceLocks) ? plan.resourceLocks : [];
  const capacityLocks = locks.filter((lock) => lock && lock.resource === "market_capacity");
  if (!required) {
    if (
      plan.capacityCheck !== undefined
      || plan.marketCreateCapacitySellerAccountId !== undefined
      || capacityLocks.length !== 0
    ) {
      throw mysqlLegacyMarketCreateCapacityPlanInvalid();
    }
    return null;
  }
  const check = plan.capacityCheck;
  const sellerAccountId = plan.marketCreateCapacitySellerAccountId;
  const checkFields = new Set([
    "kind",
    "resource",
    "key",
    "sql",
    "params",
    "maxTotalListings",
    "maxSellerListings",
  ]);
  const lock = capacityLocks.length === 1 ? capacityLocks[0] : null;
  if (
    !check
    || typeof check !== "object"
    || Array.isArray(check)
    || Object.keys(check).length !== checkFields.size
    || Object.keys(check).some((field) => !checkFields.has(field))
    || check.kind !== "check"
    || check.resource !== "market_capacity"
    || check.key !== MARKET_CREATE_CAPACITY_GUARD_KEY
    || check.sql !== MARKET_CREATE_CAPACITY_CHECK_SQL
    || !Array.isArray(check.params)
    || check.params.length !== 1
    || typeof sellerAccountId !== "string"
    || sellerAccountId === ""
    || sellerAccountId.trim() !== sellerAccountId
    || check.params[0] !== sellerAccountId
    || check.maxTotalListings !== MARKET_MAX_LISTINGS
    || check.maxSellerListings !== MARKET_MAX_LISTINGS_PER_SELLER
    || lock === null
    || locks[locks.length - 1] !== lock
    || lock.kind !== "lock"
    || lock.key !== MARKET_CREATE_CAPACITY_GUARD_KEY
    || lock.lockMode !== "exclusive"
    || lock.sql !== MARKET_CREATE_CAPACITY_LOCK_SQL
    || !Array.isArray(lock.params)
    || lock.params.length !== 1
    || lock.params[0] !== MARKET_CREATE_CAPACITY_GUARD_KEY
    || !lock.expectedRow
    || Object.keys(lock.expectedRow).length !== 2
    || lock.expectedRow.scope_key !== MARKET_CREATE_CAPACITY_GUARD_KEY
    || lock.expectedRow.revision !== 0
  ) {
    throw mysqlLegacyMarketCreateCapacityPlanInvalid();
  }
  return check;
}

function isLegacyMutationReceiptRawStatement(statement) {
  const sql = String(statement || "").trim();
  return /^(?:INSERT INTO|DELETE FROM) mutation_receipts\b/i.test(sql);
}

function assertLegacyMutationReceiptWrites(plan) {
  const receiptStatements = (Array.isArray(plan && plan.statements) ? plan.statements : [])
    .filter(isLegacyMutationReceiptRawStatement);
  const actual = plan && plan.receiptWrites;
  if (receiptStatements.length === 0) {
    if (actual !== undefined) {
      const error = new Error("MySQL legacy 回执写入元数据与 SQL 不一致。");
      error.code = "mysql_resource_precondition_invalid";
      throw error;
    }
    return [];
  }
  if (!Array.isArray(actual) || actual.length !== receiptStatements.length) {
    const error = new Error("MySQL legacy 回执写入缺少规范参数化合同。");
    error.code = "mysql_resource_precondition_invalid";
    throw error;
  }
  for (let index = 0; index < actual.length; index += 1) {
    const write = actual[index];
    assertMysqlMutationReceiptWriteContract(write);
    if (String(receiptStatements[index]).trim() !== legacyMutationReceiptRawStatement(write).trim()) {
      const error = new Error("MySQL legacy 回执写入 SQL 与参数化合同不一致。");
      error.code = "mysql_resource_precondition_invalid";
      throw error;
    }
  }
  return actual;
}

function assertLegacyMutationReceiptCapacityWrite(plan, receiptWrites) {
  const expected = legacyMutationReceiptCapacityWrite(receiptWrites);
  const actual = plan && plan.receiptCapacityWrite;
  if (
    (expected === null && actual !== undefined)
    || (expected !== null && !isDeepStrictEqual(actual, expected))
  ) {
    const error = new Error("MySQL legacy 回执数量变化缺少规范容量写入。");
    error.code = "mysql_resource_precondition_invalid";
    throw error;
  }
  return expected;
}

function isPlainLegacyMarketListingInsertStatement(statement) {
  const sql = String(statement || "").trim();
  return /^INSERT INTO market_listings\b/i.test(sql)
    && !/\bON DUPLICATE KEY UPDATE\b/i.test(sql);
}

function mysqlLegacyMarketCreateCapacityPlanInvalid() {
  const error = new Error("MySQL legacy 单挂单新增缺少规范容量保护。");
  error.code = "mysql_resource_precondition_invalid";
  return error;
}

async function assertMysqlMarketCreateCapacity(connection, check) {
  const result = await connection.query(check.sql, check.params);
  const rows = mysqlQueryRows(result);
  const row = rows.length === 1 ? rows[0] || {} : null;
  const totalCount = Number(row && row.total_count);
  const sellerCount = Number(row && row.seller_count);
  if (
    row === null
    || !Number.isSafeInteger(totalCount)
    || totalCount < 0
    || !Number.isSafeInteger(sellerCount)
    || sellerCount < 0
    || sellerCount > totalCount
  ) {
    throw mysqlResourceRevisionConflict("market_capacity", MARKET_CREATE_CAPACITY_GUARD_KEY);
  }
  // Keep the player-facing precedence established by createMarketListing():
  // the seller-specific limit wins when both boundaries are already full.
  if (sellerCount >= check.maxSellerListings) {
    const error = new Error("你的挂单太多，请先卖出或取消一些。");
    error.code = MYSQL_MARKET_LISTING_LIMIT;
    throw error;
  }
  if (totalCount >= check.maxTotalListings) {
    const error = new Error("交易所挂单已满，请稍后再试。");
    error.code = MYSQL_MARKET_FULL;
    throw error;
  }
}

async function runMysqlPoolSaveStatements(pool, statements, options = {}) {
  if (!Array.isArray(statements) || statements.length === 0) {
    return {revision: null, globalRevisionAdvanced: false};
  }
  const transactionStatements = statements[0] === "START TRANSACTION"
    && statements[statements.length - 1] === "COMMIT"
    ? statements.slice(1, -1)
    : statements.slice();
  const receiptWrites = Array.isArray(options.receiptWrites) ? options.receiptWrites : [];
  return runMysqlPoolSaveTransaction(pool, options, async (connection) => {
    await assertMysqlResourceLocks(connection, options.resourceLocks);
    if (options.capacityCheck) {
      await assertMysqlMarketCreateCapacity(connection, options.capacityCheck);
    }
    if (options.receiptCapacityWrite) {
      const write = options.receiptCapacityWrite;
      const result = await connection.query(write.sql, write.params);
      if (mysqlAffectedRows(result) !== write.expectedAffectedRows) {
        throw mysqlResourceRevisionConflict(write.resource, write.key);
      }
    }
    let receiptWriteIndex = 0;
    for (const statement of transactionStatements) {
      if (!isLegacyMutationReceiptRawStatement(statement)) {
        await connection.query(statement);
        continue;
      }
      const write = receiptWrites[receiptWriteIndex];
      if (
        !write
        || String(statement).trim() !== legacyMutationReceiptRawStatement(write).trim()
      ) {
        const error = new Error("MySQL legacy 回执执行序列与认证计划不一致。");
        error.code = "mysql_resource_precondition_invalid";
        throw error;
      }
      let result;
      try {
        result = await connection.query(write.sql, write.params);
      } catch (error) {
        if (write.kind === "insert" && error && error.code === "ER_DUP_ENTRY") {
          throw mysqlResourceRevisionConflict(write.resource, write.key);
        }
        throw error;
      }
      if (mysqlAffectedRows(result) !== write.expectedAffectedRows) {
        throw mysqlResourceRevisionConflict(write.resource, write.key);
      }
      receiptWriteIndex += 1;
    }
    if (receiptWriteIndex !== receiptWrites.length) {
      const error = new Error("MySQL legacy 回执执行数量与认证计划不一致。");
      error.code = "mysql_resource_precondition_invalid";
      throw error;
    }
  });
}

async function runMysqlPoolSaveTransaction(pool, options, executeBusinessWrites) {
  const revisionCasEnabled = options.revisionCasEnabled === true;
  const globalRevisionBarrier = String(
    options.globalRevisionBarrier || (revisionCasEnabled ? "exclusive_cas" : "none"),
  );
  const expectedRevision = Number(options.expectedRevision);
  if (
    !["exclusive_cas", "shared_expected", "none"].includes(globalRevisionBarrier)
    || (globalRevisionBarrier !== "none"
      && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0))
  ) {
    const error = new Error("MySQL本地存档版本缺失，拒绝提交。");
    error.code = MYSQL_STORE_REVISION_MISSING;
    throw error;
  }
  try {
    return await runMysqlGuardedPoolTransaction(pool, options, async (connection) => {
      if (globalRevisionBarrier !== "none") {
        const lockResult = await connection.query(
          globalRevisionBarrier === "shared_expected"
            ? "SELECT revision AS storeRevision FROM auth_store_revisions WHERE scope_key = 'auth' FOR SHARE"
            : "SELECT revision AS storeRevision FROM auth_store_revisions WHERE scope_key = 'auth' FOR UPDATE",
        );
        const actualRevision = mysqlStoreRevisionFromQueryResult(lockResult);
        if (actualRevision === null) {
          const error = new Error("MySQL全局存档版本行缺失，拒绝提交。");
          error.code = MYSQL_STORE_REVISION_MISSING;
          throw error;
        }
        if (actualRevision !== expectedRevision) {
          throw mysqlStoreRevisionConflict(expectedRevision, actualRevision);
        }
      }
      await executeBusinessWrites(connection);
      if (globalRevisionBarrier === "exclusive_cas") {
        const updateResult = await connection.query(
          `UPDATE auth_store_revisions SET revision = revision + 1 WHERE scope_key = 'auth' AND revision = ${expectedRevision}`,
        );
        if (mysqlAffectedRows(updateResult) !== 1) {
          throw mysqlStoreRevisionConflict(expectedRevision, null);
        }
      }
      return {
        revision: globalRevisionBarrier === "exclusive_cas" ? expectedRevision + 1 : expectedRevision,
        globalRevisionAdvanced: globalRevisionBarrier === "exclusive_cas",
      };
    });
  } catch (error) {
    const saveError = new Error(error && error.code === MYSQL_STORE_REVISION_CONFLICT
      ? "MySQL存档版本已变化，旧快照未写入。"
      : error && error.code === MYSQL_RESOURCE_REVISION_CONFLICT
        ? "MySQL资源版本已变化，条件存档未写入。"
        : error && error.code === MYSQL_COMMIT_OUTCOME_AMBIGUOUS
          ? "MySQL COMMIT 结果暂时无法确认。"
        : "MySQL 异步存档失败。");
    if (error && typeof error.code === "string" && error.code !== "") {
      saveError.code = error.code;
    }
    if (error && Number.isSafeInteger(error.expectedRevision)) {
      saveError.expectedRevision = error.expectedRevision;
    }
    if (error && Number.isSafeInteger(error.actualRevision)) {
      saveError.actualRevision = error.actualRevision;
    }
    if (error && typeof error.resource === "string" && error.resource !== "") {
      saveError.resource = error.resource;
    }
    if (error && typeof error.resourceKey === "string" && error.resourceKey !== "") {
      saveError.resourceKey = error.resourceKey;
    }
    for (const field of [
      "commitDispatched",
      "mysqlCode",
      "noCommitGuaranteed",
      "outcomeUnknown",
      "retryable",
      "rollbackConfirmed",
      "timeout",
      "transactionPhase",
    ]) {
      if (error && error[field] !== undefined) {
        saveError[field] = error[field];
      }
    }
    saveError.cause = error;
    if (error && error.rollbackCause) {
      saveError.rollbackCause = error.rollbackCause;
    }
    throw saveError;
  }
}

async function runMysqlGuardedPoolTransaction(pool, options, executeBusiness, lifecycle = {}) {
  const policy = normalizeMysqlTransactionPolicy(options && options.transactionPolicy);
  const guardOptions = options && options.transactionGuardOptions
    && typeof options.transactionGuardOptions === "object"
    ? options.transactionGuardOptions
    : {};
  let connection = null;
  let deadline = null;
  let transactionStarted = false;
  let connectionReusable = true;
  try {
    connection = await checkoutMysqlConnection(pool, policy, guardOptions);
    deadline = createMysqlTransactionDeadlineController(connection, policy, guardOptions);
    const guardedConnection = mysqlDeadlineConnection(connection, deadline);
    if (typeof lifecycle.beforeBegin === "function") {
      await deadline.track(
        mysqlCallbackOperation(() => lifecycle.beforeBegin(guardedConnection)),
        {classifyFailure: false},
      );
    }
    await deadline.track(mysqlConnectionOperation(connection, "beginTransaction"));
    transactionStarted = true;
    const result = await deadline.track(
      mysqlCallbackOperation(() => executeBusiness(guardedConnection)),
      {classifyFailure: false},
    );
    deadline.markCommitDispatched();
    await deadline.track(mysqlConnectionOperation(connection, "commit"));
    transactionStarted = false;
    deadline.complete();
    return result;
  } catch (caughtError) {
    let error = caughtError;
    const commitDispatched = deadline !== null && deadline.isCommitDispatched();
    const deadlineTerminated = deadline !== null && deadline.isFinished();
    let rollbackCompleted = false;
    let rollbackError = null;

    if (connection !== null && commitDispatched) {
      connectionReusable = false;
      if (!deadlineTerminated) {
        destroyMysqlConnection(connection, error);
      }
      error = classifyMysqlTransactionFailure(error, {commitDispatched: true});
    } else if (connection !== null && transactionStarted) {
      if (deadlineTerminated && error && error.timeout === true) {
        connectionReusable = false;
      } else {
        try {
          await deadline.track(mysqlConnectionOperation(connection, "rollback"));
          rollbackCompleted = true;
        } catch (caughtRollbackError) {
          rollbackError = caughtRollbackError;
          connectionReusable = false;
          if (!deadline.isFinished()) {
            destroyMysqlConnection(connection, caughtRollbackError);
          }
        }
      }
      error = mysqlDeterministicTransactionError(error)
        ? decorateMysqlNoCommitError(error, rollbackCompleted)
        : classifyMysqlTransactionFailure(error, {rollbackCompleted});
    } else if (connection !== null && deadline !== null) {
      if (deadlineTerminated && error && error.timeout === true) {
        connectionReusable = false;
      } else {
        // Isolation/BEGIN failures have no possible COMMIT, but the driver's
        // connection state is not safe to return to the pool.
        connectionReusable = false;
        destroyMysqlConnection(connection, error);
      }
      error = mysqlDeterministicTransactionError(error)
        ? decorateMysqlNoCommitError(error, false)
        : classifyMysqlTransactionFailure(error, {commitDispatched: false});
    }
    if (rollbackError !== null) {
      error.rollbackCause = rollbackError;
    }
    throw error;
  } finally {
    if (deadline !== null) {
      deadline.complete();
    }
    if (connection !== null && connectionReusable && typeof connection.release === "function") {
      connection.release();
    }
  }
}

function mysqlDeadlineConnection(connection, deadline) {
  return Object.freeze({
    query(...args) {
      // Keep driver codes visible to the business executor long enough for
      // exact duplicate-key/resource conflict mapping. The transaction
      // boundary performs the final outcome classification after rollback.
      return deadline.track(
        mysqlConnectionOperation(connection, "query", args),
        {classifyFailure: false},
      );
    },
  });
}

function mysqlConnectionOperation(connection, methodName, args = []) {
  try {
    return connection[methodName](...args);
  } catch (error) {
    return Promise.reject(error);
  }
}

function mysqlCallbackOperation(callback) {
  try {
    return callback();
  } catch (error) {
    return Promise.reject(error);
  }
}

function mysqlDeterministicTransactionError(error) {
  const code = String(error && error.code || "");
  if ([
    MYSQL_COMMIT_OUTCOME_AMBIGUOUS,
    MYSQL_TRANSACTION_ROLLED_BACK,
  ].includes(code)) {
    return false;
  }
  if ([
    MYSQL_STORE_REVISION_CONFLICT,
    MYSQL_STORE_REVISION_MISSING,
    MYSQL_RESOURCE_REVISION_CONFLICT,
  ].includes(code)) {
    return true;
  }
  // Service/domain validation codes are already stable public or recovery
  // contracts. Only driver/transport failures are collapsed into the MySQL
  // transaction outcome categories.
  return code !== "" && !/^(?:ER_|CR_|PROTOCOL_|ECONN|EPIPE$|ETIMEDOUT$|ENET|EHOST)/.test(code);
}

function decorateMysqlNoCommitError(error, rollbackCompleted) {
  error.transactionPhase = "rolled_back";
  error.outcomeUnknown = false;
  error.noCommitGuaranteed = true;
  error.rollbackConfirmed = rollbackCompleted === true;
  error.retryable = true;
  return error;
}

async function assertMysqlResourceLocks(connection, locks) {
  for (const lock of Array.isArray(locks) ? locks : []) {
    const result = await connection.query(lock.sql, lock.params);
    if (Array.isArray(lock.expectedRows)) {
      assertMysqlResourceLockRows(result, lock);
    } else {
      assertMysqlResourceLockRow(result, lock);
    }
  }
}

function assertMysqlResourceLockRows(result, lock) {
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  const expectedRows = Array.isArray(lock.expectedRows) ? lock.expectedRows : [];
  const keyField = String(lock.keyField || "");
  if (!Array.isArray(rows) || rows.length !== expectedRows.length || keyField === "") {
    throw mysqlResourceRevisionConflict(lock.resource, lock.key);
  }
  const rowsByKey = new Map();
  for (const row of rows) {
    const key = String((row && row[keyField]) ?? "");
    if (key === "" || rowsByKey.has(key)) {
      throw mysqlResourceRevisionConflict(lock.resource, lock.key);
    }
    rowsByKey.set(key, row);
  }
  for (const expectedRow of expectedRows) {
    const expectedKey = String((expectedRow && expectedRow[keyField]) ?? "");
    if (expectedKey === "" || !rowsByKey.has(expectedKey)) {
      throw mysqlResourceRevisionConflict(lock.resource, lock.key);
    }
    assertMysqlResourceLockRow([rowsByKey.get(expectedKey)], {
      ...lock,
      expectedRow,
    });
  }
}

function assertMysqlResourceLockRow(result, lock) {
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw mysqlResourceRevisionConflict(lock.resource, lock.key);
  }
  const row = rows[0] || {};
  for (const [field, expectedValue] of Object.entries(lock.expectedRow || {})) {
    let actualValue = row[field];
    let matches;
    if (expectedValue === null) {
      matches = actualValue === null;
    } else if (expectedValue && typeof expectedValue === "object") {
      if (typeof actualValue === "string") {
        try {
          actualValue = JSON.parse(actualValue);
        } catch {
          throw mysqlResourceRevisionConflict(lock.resource, lock.key);
        }
      }
      matches = isDeepStrictEqual(actualValue, expectedValue);
    } else {
      matches = typeof expectedValue === "number"
        ? Number(actualValue) === expectedValue
        : String(actualValue ?? "") === String(expectedValue);
    }
    if (!matches) {
      throw mysqlResourceRevisionConflict(lock.resource, lock.key);
    }
  }
}

function mysqlStoreRevisionFromQueryResult(result) {
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  if (!Array.isArray(rows) || rows.length !== 1) {
    return null;
  }
  const row = rows[0] || {};
  const revision = Number(row.storeRevision ?? row.store_revision ?? row.revision);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

function mysqlAffectedRows(result) {
  const header = Array.isArray(result) ? result[0] : result;
  const affectedRows = Number(header && header.affectedRows);
  return Number.isSafeInteger(affectedRows) && affectedRows >= 0 ? affectedRows : 0;
}

function mysqlStoreRevisionConflict(expectedRevision, actualRevision) {
  const error = new Error("MySQL存档版本冲突，拒绝旧快照覆盖新提交。");
  error.code = MYSQL_STORE_REVISION_CONFLICT;
  error.expectedRevision = expectedRevision;
  if (Number.isSafeInteger(actualRevision)) {
    error.actualRevision = actualRevision;
  }
  return error;
}

function mysqlResourceRevisionConflict(resource, key) {
  const error = new Error("MySQL资源条件不匹配，拒绝覆盖已变化的行。");
  error.code = MYSQL_RESOURCE_REVISION_CONFLICT;
  error.resource = String(resource || "");
  error.resourceKey = String(key || "");
  return error;
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

function persistentServerStateDocument(persistent) {
  // Entity counts are diagnostics, not authority. Persisting them made every
  // otherwise independent receipt/entity write contend on server_state/auth.
  // Ops reads exact table counts directly; keep only the operational document.
  return {
    schemaVersion: 2,
    storage: "mysql_entity_tables",
    serviceEventSeq: Number(persistent.serviceEventSeq || 0),
    marketConfig: objectOrEmpty(persistent.marketConfig),
    offlineHangConfig: objectOrEmpty(persistent.offlineHangConfig),
  };
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

function conditionalProfileBindingUpdate(binding, expectedRevision) {
  return {
    kind: "write",
    resource: "profile_binding",
    key: String(binding.accountId || ""),
    sql: `UPDATE profile_bindings
      SET player_id = ?, profile_revision = ?, updated_at = ?, document_json = CAST(? AS JSON)
      WHERE account_id = ? AND player_id = ? AND profile_revision = ?`,
    params: [
      String(binding.playerId || ""),
      Number(binding.profileRevision),
      String(binding.updatedAt || ""),
      JSON.stringify(binding),
      String(binding.accountId || ""),
      String(binding.playerId || ""),
      Number(expectedRevision),
    ],
    expectedAffectedRows: 1,
  };
}

function conditionalProfileUpdate(profile, expectedRevision) {
  return {
    kind: "write",
    resource: "profile",
    key: String(profile.playerId || ""),
    sql: `UPDATE profiles
      SET account_id = ?, profile_revision = ?, updated_at = ?, profile_json = CAST(? AS JSON)
      WHERE player_id = ? AND account_id = ? AND profile_revision = ?`,
    params: [
      String(profile.accountId || ""),
      Number(profile.profileRevision),
      String(profile.updatedAt || ""),
      JSON.stringify(profile.profile || {}),
      String(profile.playerId || ""),
      String(profile.accountId || ""),
      Number(expectedRevision),
    ],
    expectedAffectedRows: 1,
  };
}

function conditionalMarketListingInsert(listing) {
  return {
    kind: "insert",
    resource: "market_listing",
    key: String(listing.listingId || ""),
    sql: `INSERT INTO market_listings
      (listing_id, seller_account_id, item_id, currency, unit_price, item_count, created_at, document_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
    params: [
      String(listing.listingId || ""),
      String(listing.sellerAccountId || ""),
      String(listing.itemId || ""),
      String(listing.currency || ""),
      Number(listing.unitPrice),
      Number(listing.count),
      String(listing.createdAt || ""),
      JSON.stringify(listing),
    ],
    expectedAffectedRows: 1,
  };
}

function conditionalMarketListingDelete(listing) {
  return {
    kind: "delete",
    resource: "market_listing",
    key: String(listing.listingId || ""),
    sql: `DELETE FROM market_listings
      WHERE listing_id = ? AND seller_account_id = ? AND item_id = ?
        AND currency = ? AND unit_price = ? AND item_count = ? AND created_at = ?`,
    params: [
      String(listing.listingId || ""),
      String(listing.sellerAccountId || ""),
      String(listing.itemId || ""),
      String(listing.currency || ""),
      Number(listing.unitPrice),
      Number(listing.count),
      String(listing.createdAt || ""),
    ],
    expectedAffectedRows: 1,
  };
}

function conditionalMailMessageInsert(mail) {
  return {
    kind: "insert",
    resource: "mail_message",
    key: String(mail.mailId || ""),
    sql: `INSERT INTO mail_messages
      (mail_id, sender_account_id, recipient_account_id, title, created_at, read_at, document_json)
      VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
    params: [
      String(mail.mailId || ""),
      String(mail.senderAccountId || ""),
      String(mail.recipientAccountId || ""),
      String(mail.title || ""),
      String(mail.createdAt || ""),
      mail.readAt === null ? null : String(mail.readAt || ""),
      JSON.stringify(mail),
    ],
    expectedAffectedRows: 1,
  };
}

function conditionalMailMessageUpdate(mail, previousMail) {
  return {
    kind: "update",
    resource: "mail_message",
    key: String(mail.mailId || ""),
    sql: `UPDATE mail_messages
      SET sender_account_id = ?, recipient_account_id = ?, title = ?, created_at = ?,
        read_at = ?, document_json = CAST(? AS JSON)
      WHERE mail_id = ? AND sender_account_id = ? AND recipient_account_id = ?
        AND title = ? AND created_at = ? AND read_at <=> ?`,
    params: [
      String(mail.senderAccountId || ""),
      String(mail.recipientAccountId || ""),
      String(mail.title || ""),
      String(mail.createdAt || ""),
      nullableMailReadAt(mail.readAt),
      JSON.stringify(mail),
      String(previousMail.mailId || ""),
      String(previousMail.senderAccountId || ""),
      String(previousMail.recipientAccountId || ""),
      String(previousMail.title || ""),
      String(previousMail.createdAt || ""),
      nullableMailReadAt(previousMail.readAt),
    ],
    expectedAffectedRows: 1,
  };
}

function conditionalMailMessageDelete(mail) {
  return {
    kind: "delete",
    resource: "mail_message",
    key: String(mail.mailId || ""),
    sql: `DELETE FROM mail_messages
      WHERE mail_id = ? AND sender_account_id = ? AND recipient_account_id = ?
        AND title = ? AND created_at = ? AND read_at <=> ?`,
    params: [
      String(mail.mailId || ""),
      String(mail.senderAccountId || ""),
      String(mail.recipientAccountId || ""),
      String(mail.title || ""),
      String(mail.createdAt || ""),
      nullableMailReadAt(mail.readAt),
    ],
    expectedAffectedRows: 1,
  };
}

function conditionalConsumedEquipmentEnvelopeInsert(envelopeId) {
  return {
    kind: "insert",
    resource: "consumed_equipment_envelope",
    key: String(envelopeId || ""),
    sql: "INSERT INTO consumed_equipment_envelopes (envelope_id) VALUES (?)",
    params: [String(envelopeId || "")],
    expectedAffectedRows: 1,
  };
}

function nullableMailReadAt(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  return String(value);
}

function conditionalMarketTaxIncrement(currency, taxAmount) {
  const jsonPathByCurrency = {
    stoneCoins: "$.marketConfig.taxCollected.stoneCoins",
    diamonds: "$.marketConfig.taxCollected.diamonds",
  };
  const jsonPath = jsonPathByCurrency[currency];
  if (
    !jsonPath
    || !Number.isSafeInteger(taxAmount)
    || taxAmount <= 0
  ) {
    const error = new Error("MySQL market tax 条件增量缺少规范币种或金额。");
    error.code = "mysql_resource_precondition_invalid";
    throw error;
  }
  return {
    kind: "update",
    resource: "market_tax",
    key: currency,
    sql: `UPDATE server_state
      SET document_json = JSON_SET(
        document_json,
        '${jsonPath}',
        CAST(JSON_UNQUOTE(JSON_EXTRACT(document_json, '${jsonPath}')) AS UNSIGNED) + ?
      )
      WHERE state_key = 'auth'
        AND JSON_TYPE(JSON_EXTRACT(document_json, '${jsonPath}')) IN ('INTEGER', 'UNSIGNED INTEGER')
        AND CAST(JSON_UNQUOTE(JSON_EXTRACT(document_json, '${jsonPath}')) AS UNSIGNED) <= ?`,
    params: [taxAmount, Number.MAX_SAFE_INTEGER - taxAmount],
    expectedAffectedRows: 1,
  };
}

function conditionalMutationReceiptInsert(receipt) {
  return {
    kind: "insert",
    resource: "mutation_receipt",
    key: String(receipt.operationId || ""),
    sql: `INSERT INTO mutation_receipts
      (operation_id, request_hash, action_id, account_id, committed_at, expires_at, document_json)
      VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
    params: [
      String(receipt.operationId || ""),
      String(receipt.requestHash || ""),
      String(receipt.actionId || ""),
      String(receipt.accountId || "") || null,
      String(receipt.committedAt || ""),
      String(receipt.expiresAt || ""),
      JSON.stringify(receipt),
    ],
    expectedAffectedRows: 1,
  };
}

function conditionalMutationReceiptDelete(deletion) {
  const receipt = deletion && deletion.expectedReceipt || {};
  return {
    kind: "delete",
    resource: "mutation_receipt",
    key: String(deletion && deletion.operationId || ""),
    sql: MUTATION_RECEIPT_DELETE_SQL,
    params: [
      String(deletion && deletion.operationId || ""),
      String(receipt.requestHash || ""),
      String(receipt.actionId || ""),
      String(receipt.accountId || "") || null,
      String(receipt.committedAt || ""),
      String(receipt.expiresAt || ""),
      JSON.stringify(receipt),
    ],
    expectedAffectedRows: 1,
  };
}

function mutationReceiptCapacityAdjustment(delta = 1) {
  return {
    kind: "update",
    resource: "mutation_receipt_capacity",
    key: MUTATION_RECEIPT_CAPACITY_GUARD_KEY,
    sql: MUTATION_RECEIPT_CAPACITY_UPDATE_SQL,
    params: [delta, delta],
    expectedAffectedRows: 1,
  };
}

function legacyMutationReceiptRawStatement(write) {
  assertMysqlMutationReceiptWriteContract(write);
  const [operationId, requestHash, actionId, accountId, committedAt, expiresAt, documentJson] = write.params;
  if (write.kind === "delete") {
    return `DELETE FROM mutation_receipts
      WHERE operation_id = ${sqlString(operationId)} AND request_hash = ${sqlString(requestHash)}
        AND action_id = ${sqlString(actionId)} AND account_id <=> ${sqlNullable(accountId)}
        AND committed_at = ${sqlString(committedAt)} AND expires_at = ${sqlString(expiresAt)}
        AND document_json = CAST(${sqlString(documentJson)} AS JSON)`;
  }
  return `INSERT INTO mutation_receipts
    (operation_id, request_hash, action_id, account_id, committed_at, expires_at, document_json)
    VALUES (${sqlString(operationId)}, ${sqlString(requestHash)}, ${sqlString(actionId)}, ${sqlNullable(accountId)}, ${sqlString(committedAt)}, ${sqlString(expiresAt)}, CAST(${sqlString(documentJson)} AS JSON))`;
}

function insertMailStatement(mail) {
  return `INSERT INTO mail_messages (mail_id, sender_account_id, recipient_account_id, title, created_at, read_at, document_json) VALUES (${sqlString(mail.mailId)}, ${sqlString(mail.senderAccountId)}, ${sqlString(mail.recipientAccountId)}, ${sqlString(mail.title)}, ${sqlString(mail.createdAt)}, ${sqlNullable(mail.readAt)}, ${sqlJson(mail)})`;
}

function insertMarketListingStatement(listing) {
  return `INSERT INTO market_listings (listing_id, seller_account_id, item_id, currency, unit_price, item_count, created_at, document_json) VALUES (${sqlString(listing.listingId)}, ${sqlString(listing.sellerAccountId)}, ${sqlString(listing.itemId)}, ${sqlString(listing.currency)}, ${Number(listing.unitPrice || 0)}, ${Number(listing.count || 0)}, ${sqlString(listing.createdAt)}, ${sqlJson(listing)})`;
}

function insertConsumedEquipmentEnvelopeStatement(envelopeId) {
  return `INSERT INTO consumed_equipment_envelopes (envelope_id) VALUES (${sqlString(envelopeId)})`;
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

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  __assertMysqlSharedAssetRevisionForTest: assertMysqlSharedAssetRevision,
  __assertLegacyMarketCreateCapacityPlanForTest: assertLegacyMarketCreateCapacityPlan,
  DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES,
  __buildMysqlSavePlanFromPersistentDataForTest: buildMysqlSavePlanFromPersistentData,
  __buildSaveStatementsFromPersistentDataForTest: buildSaveStatementsFromPersistentData,
  __canonicalizeMysqlMailAuthorityBaselineForTest: canonicalizeMysqlMailAuthorityBaseline,
  __entityChangedForTest: entityChanged,
  __mergeMysqlSaveBaselineAfterCommitForTest: mergeMysqlSaveBaselineAfterCommit,
  __runMysqlDurableReceiptReadForTest: runMysqlDurableReceiptRead,
  __runMysqlGuardedPoolTransactionForTest: runMysqlGuardedPoolTransaction,
  __runMysqlMailInboxPageReadForTest: runMysqlMailInboxPageRead,
  __runMysqlForTest: runMysql,
  __runMysqlPoolSavePlanForTest: runMysqlPoolSavePlan,
  __runMysqlSharedAssetReadForTest: runMysqlSharedAssetRead,
  createMysqlAuthStore,
  mysqlAuthStoreRootContract,
};
