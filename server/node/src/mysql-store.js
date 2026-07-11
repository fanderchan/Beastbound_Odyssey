"use strict";

const {execFileSync, spawn} = require("node:child_process");

const DEFAULT_DATABASE = "beastbound_odyssey";
const DEFAULT_OUTPUT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

function createMysqlAuthStore(options = {}) {
  const config = mysqlConfig(options);
  let schemaReady = false;
  let lastPersistentData = null;

  function ensureSchema() {
    if (schemaReady) {
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
        INDEX idx_battle_records_room (room_id),
        INDEX idx_battle_records_winner_ended (winner_account_id, ended_at),
        INDEX idx_battle_records_reason_ended (reason, ended_at)
      );
      CREATE TABLE IF NOT EXISTS battle_trace (
        trace_id VARCHAR(96) PRIMARY KEY,
        room_id VARCHAR(96) NOT NULL DEFAULT '',
        trace_type VARCHAR(64) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        document_json JSON NOT NULL,
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
    schemaReady = true;
  }

  return {
    mode: "mysql",
    load() {
      ensureSchema();
      const loaded = loadPersistentData(config, config.database);
      lastPersistentData = mysqlPersistentData(loaded);
      return loaded;
    },
    save(nextData) {
      ensureSchema();
      const data = mysqlPersistentData(nextData);
      if (lastPersistentData === null) {
        lastPersistentData = mysqlPersistentData(loadPersistentData(config, config.database));
      }
      runMysqlSaveStatements(config, config.database, buildSaveStatements(data, lastPersistentData));
      lastPersistentData = data;
    },
    async saveAsync(nextData) {
      ensureSchema();
      const data = mysqlPersistentData(nextData);
      if (lastPersistentData === null) {
        lastPersistentData = mysqlPersistentData(loadPersistentData(config, config.database));
      }
      await runMysqlSaveStatementsAsync(config, config.database, buildSaveStatements(data, lastPersistentData));
      lastPersistentData = data;
    },
  };
}

function buildSaveStatements(nextData, previousData = null) {
  const data = mysqlPersistentData(nextData);
  const previous = previousData ? mysqlPersistentData(previousData) : emptyPersistentData();
  const statements = [];
  statements.push("START TRANSACTION");
  statements.push(upsertStateStatement(data));
  appendObjectEntityDiff(statements, "accounts", "account_id", previous.accounts, data.accounts, accountEntityKey, insertAccountStatement);
  appendObjectEntityDiff(statements, "sessions", "session_id", previous.sessions, data.sessions, sessionEntityKey, insertSessionStatement);
  appendObjectEntityDiff(statements, "profile_bindings", "account_id", previous.profileBindings, data.profileBindings, profileBindingEntityKey, insertProfileBindingStatement);
  appendObjectEntityDiff(statements, "profiles", "player_id", previous.profiles, data.profiles, profileEntityKey, insertProfileStatement);
  appendObjectEntityDiff(statements, "mail_messages", "mail_id", previous.mailMessages, data.mailMessages, mailEntityKey, insertMailStatement);
  appendObjectEntityDiff(statements, "market_listings", "listing_id", previous.marketListings, data.marketListings, marketListingEntityKey, insertMarketListingStatement);
  appendObjectEntityDiff(statements, "parties", "party_id", previous.parties, data.parties, partyEntityKey, insertPartyStatement);
  appendObjectEntityDiff(statements, "party_invites", "invite_id", previous.partyInvites, data.partyInvites, partyInviteEntityKey, insertPartyInviteStatement);
  appendObjectEntityDiff(statements, "families", "family_id", previous.families, data.families, familyEntityKey, insertFamilyStatement);
  appendObjectEntityDiff(statements, "manors", "manor_id", previous.manors, data.manors, manorEntityKey, insertManorStatement);
  appendArrayEntityDiff(statements, "manor_battles", "battle_id", previous.manorBattles, data.manorBattles, manorBattleEntityKey, insertManorBattleStatement);
  appendArrayEntityDiff(statements, "manor_wars", "war_id", previous.manorWars, data.manorWars, manorWarEntityKey, insertManorWarStatement);
  appendArrayEntityDiff(statements, "chat_messages", "message_id", previous.chatMessages, data.chatMessages, chatMessageEntityKey, insertChatMessageStatement);
  appendArrayEntityDiff(statements, "battle_records", "record_id", previous.battleRecords, data.battleRecords, battleRecordEntityKey, insertBattleRecordStatement);
  appendArrayEntityDiff(statements, "battle_trace", "trace_id", previous.battleTrace, data.battleTrace, battleTraceEntityKey, insertBattleTraceStatement);
  appendObjectEntityDiff(statements, "gm_user_grants", "account_id", previous.gmUserGrants, data.gmUserGrants, gmUserGrantEntityKey, insertGmUserGrantStatement);
  appendGmCommandGrantDiff(statements, previous.gmCommandGrants, data.gmCommandGrants);
  appendArrayEntityDiff(statements, "gm_command_audit", "audit_id", previous.gmCommandAudit, data.gmCommandAudit, gmCommandAuditEntityKey, insertGmCommandAuditStatement);
  appendArrayEntityDiff(statements, "auth_events", "event_id", previous.authEvents, data.authEvents, authEventEntityKey, insertAuthEventStatement);
  appendArrayEntityDiff(statements, "service_events", "event_seq", previous.serviceEvents, data.serviceEvents, serviceEventEntityKey, insertServiceEventStatement);
  statements.push("COMMIT");
  return statements;
}

function loadPersistentData(config, database) {
  const output = runMysql(config, database, loadPersistentDataSql());
  return parsePersistentDataRows(output);
}

function loadPersistentDataSql() {
  return [
    "SELECT 'server_state', state_key, CAST(document_json AS CHAR) FROM server_state WHERE state_key = 'auth'",
    "SELECT 'accounts', account_id, CAST(document_json AS CHAR) FROM accounts ORDER BY account_id",
    "SELECT 'sessions', session_id, CAST(document_json AS CHAR) FROM sessions ORDER BY session_id",
    "SELECT 'profile_bindings', account_id, CAST(document_json AS CHAR) FROM profile_bindings ORDER BY account_id",
    "SELECT 'profiles', player_id, CAST(JSON_OBJECT('playerId', player_id, 'accountId', account_id, 'profileRevision', profile_revision, 'updatedAt', updated_at, 'profile', profile_json) AS CHAR) FROM profiles ORDER BY player_id",
    "SELECT 'mail_messages', mail_id, CAST(document_json AS CHAR) FROM mail_messages ORDER BY mail_id",
    "SELECT 'market_listings', listing_id, CAST(document_json AS CHAR) FROM market_listings ORDER BY listing_id",
    "SELECT 'parties', party_id, CAST(document_json AS CHAR) FROM parties ORDER BY party_id",
    "SELECT 'party_invites', invite_id, CAST(document_json AS CHAR) FROM party_invites ORDER BY invite_id",
    "SELECT 'families', family_id, CAST(document_json AS CHAR) FROM families ORDER BY family_id",
    "SELECT 'manors', manor_id, CAST(document_json AS CHAR) FROM manors ORDER BY manor_id",
    "SELECT 'manor_battles', battle_id, CAST(document_json AS CHAR) FROM manor_battles ORDER BY battle_id",
    "SELECT 'manor_wars', war_id, CAST(document_json AS CHAR) FROM manor_wars ORDER BY war_id",
    "SELECT 'chat_messages', message_id, CAST(document_json AS CHAR) FROM chat_messages ORDER BY message_id",
    "SELECT 'battle_records', record_id, CAST(document_json AS CHAR) FROM battle_records ORDER BY record_id",
    "SELECT 'battle_trace', trace_id, CAST(document_json AS CHAR) FROM battle_trace ORDER BY created_at, trace_id",
    "SELECT 'gm_user_grants', account_id, CAST(document_json AS CHAR) FROM gm_user_grants ORDER BY account_id",
    "SELECT 'gm_command_grants', CONCAT(account_id, '/', command_id), CAST(document_json AS CHAR) FROM gm_command_grants ORDER BY account_id, command_id",
    "SELECT 'gm_command_audit', audit_id, CAST(document_json AS CHAR) FROM gm_command_audit ORDER BY audit_id",
    "SELECT 'auth_events', event_id, CAST(document_json AS CHAR) FROM auth_events ORDER BY event_id",
    "SELECT 'service_events', CAST(event_seq AS CHAR), CAST(document_json AS CHAR) FROM service_events ORDER BY event_seq",
  ].join(";\n");
}

function parsePersistentDataRows(output) {
  const data = emptyPersistentData();
  let legacyDocument = null;
  let stateDocument = null;
  let entityRows = 0;
  const lines = String(output || "").split(/\r?\n/).filter((line) => line.trim() !== "");
  for (const line of lines) {
    const columns = line.split("\t");
    if (columns.length < 3) {
      continue;
    }
    const bucket = columns[0];
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
    appendLoadedEntity(data, bucket, rowKey, document);
  }
  if (entityRows > 0) {
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

function parsePersistentRowJson(bucket, rowKey, jsonText) {
  try {
    const parsed = JSON.parse(String(jsonText || "null"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    throw new Error(`MySQL持久化行解析失败：${bucket}/${rowKey}`);
  }
}

function appendLoadedEntity(data, bucket, rowKey, document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return;
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
    case "mail_messages":
      data.mailMessages[String(document.mailId || rowKey || "")] = document;
      break;
    case "market_listings":
      data.marketListings[String(document.listingId || rowKey || "")] = document;
      break;
    case "parties":
      data.parties[String(document.partyId || rowKey || "")] = document;
      break;
    case "party_invites":
      data.partyInvites[String(document.inviteId || rowKey || "")] = document;
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
      data.battleRecords.push(document);
      break;
    case "battle_trace":
      data.battleTrace.push(document);
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

function mysqlPersistentData(nextData) {
  const data = cloneJson(nextData || {});
  data.playerPositions = {};
  data.battleInvites = {};
  data.battleRooms = {};
  if (Array.isArray(data.serviceEvents)) {
    data.serviceEvents = data.serviceEvents.filter((event) => {
      const type = String(event && event.type || "");
      return !type.startsWith("battle.");
    });
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
    mailMessages: {},
    marketListings: {},
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
  appendEntityDiff(
    statements,
    tableName,
    primaryColumn,
    entityMapFromArray(previousArray, keyFn),
    entityMapFromArray(nextArray, keyFn),
    insertFn
  );
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
    case "party_invites":
      return ["party_id", "from_account_id", "to_account_id", "status", "created_at", "updated_at", "document_json"];
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

function partyInviteEntityKey(invite) {
  return invite.inviteId;
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
  return {
    mysqlPath: options.mysqlPath || process.env.BEASTBOUND_MYSQL_BIN || "mysql",
    host: options.host || process.env.BEASTBOUND_MYSQL_HOST || "127.0.0.1",
    port: Number(options.port || process.env.BEASTBOUND_MYSQL_PORT || 3306),
    user: options.user || process.env.BEASTBOUND_MYSQL_USER || "root",
    password: options.password || process.env.BEASTBOUND_MYSQL_PASSWORD || "",
    database: options.database || process.env.BEASTBOUND_MYSQL_DATABASE || DEFAULT_DATABASE,
    createDatabase: boolConfig(options.createDatabase, process.env.BEASTBOUND_MYSQL_CREATE_DATABASE),
    outputMaxBufferBytes: Number(options.outputMaxBufferBytes || process.env.BEASTBOUND_MYSQL_OUTPUT_MAX_BUFFER_BYTES || DEFAULT_OUTPUT_MAX_BUFFER_BYTES),
  };
}

function runMysql(config, database, sql, options = {}) {
  try {
    return execFileSync(config.mysqlPath, mysqlArgs(config, database), {
      "encoding": "utf8",
      "input": sql,
      "maxBuffer": config.outputMaxBufferBytes,
      "stdio": ["pipe", "pipe", "pipe"],
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
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > config.outputMaxBufferBytes) {
        settled = true;
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
        reject(error);
      }
    });
    child.on("close", (code) => {
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
  try {
    return await runMysqlAsync(config, database, `${statements.join(";\n")};`);
  } catch (error) {
    const diagnosis = diagnoseMysqlSaveFailure(config, database, statements);
    if (diagnosis !== "") {
      throw new Error(`${error.message} (${diagnosis})`);
    }
    throw error;
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

function upsertStateStatement(data) {
  return `INSERT INTO server_state (state_key, document_json) VALUES ('auth', ${sqlJson(stateMetadata(data))}) ON DUPLICATE KEY UPDATE document_json = VALUES(document_json)`;
}

function stateMetadata(data) {
  const persistent = mysqlPersistentData(data);
  return {
    schemaVersion: 2,
    storage: "mysql_entity_tables",
    counts: {
      accounts: Object.keys(objectOrEmpty(persistent.accounts)).length,
      sessions: Object.keys(objectOrEmpty(persistent.sessions)).length,
      profileBindings: Object.keys(objectOrEmpty(persistent.profileBindings)).length,
      profiles: Object.keys(objectOrEmpty(persistent.profiles)).length,
      mailMessages: Object.keys(objectOrEmpty(persistent.mailMessages)).length,
      marketListings: Object.keys(objectOrEmpty(persistent.marketListings)).length,
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

function insertMailStatement(mail) {
  return `INSERT INTO mail_messages (mail_id, sender_account_id, recipient_account_id, title, created_at, read_at, document_json) VALUES (${sqlString(mail.mailId)}, ${sqlString(mail.senderAccountId)}, ${sqlString(mail.recipientAccountId)}, ${sqlString(mail.title)}, ${sqlString(mail.createdAt)}, ${sqlNullable(mail.readAt)}, ${sqlJson(mail)})`;
}

function insertMarketListingStatement(listing) {
  return `INSERT INTO market_listings (listing_id, seller_account_id, item_id, currency, unit_price, item_count, created_at, document_json) VALUES (${sqlString(listing.listingId)}, ${sqlString(listing.sellerAccountId)}, ${sqlString(listing.itemId)}, ${sqlString(listing.currency)}, ${Number(listing.unitPrice || 0)}, ${Number(listing.count || 0)}, ${sqlString(listing.createdAt)}, ${sqlJson(listing)})`;
}

function insertPartyStatement(party) {
  const memberCount = Array.isArray(party.memberAccountIds) ? party.memberAccountIds.length : 0;
  return `INSERT INTO parties (party_id, leader_account_id, member_count, created_at, updated_at, document_json) VALUES (${sqlString(party.partyId)}, ${sqlString(party.leaderAccountId)}, ${Number(memberCount)}, ${sqlString(party.createdAt)}, ${sqlString(party.updatedAt)}, ${sqlJson(party)})`;
}

function insertPartyInviteStatement(invite) {
  return `INSERT INTO party_invites (invite_id, party_id, from_account_id, to_account_id, status, created_at, updated_at, document_json) VALUES (${sqlString(invite.inviteId)}, ${sqlString(invite.partyId)}, ${sqlString(invite.fromAccountId)}, ${sqlString(invite.toAccountId)}, ${sqlString(invite.status)}, ${sqlString(invite.createdAt)}, ${sqlString(invite.updatedAt)}, ${sqlJson(invite)})`;
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

module.exports = {
  createMysqlAuthStore,
};
