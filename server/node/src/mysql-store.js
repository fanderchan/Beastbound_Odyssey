"use strict";

const {execFileSync} = require("node:child_process");

const DEFAULT_DATABASE = "beastbound_odyssey";
const DEFAULT_OUTPUT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

function createMysqlAuthStore(options = {}) {
  const config = mysqlConfig(options);
  let schemaReady = false;

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
    load() {
      ensureSchema();
      const output = runMysql(config, config.database, "SELECT CAST(document_json AS CHAR) FROM server_state WHERE state_key = 'auth';");
      const text = output.trim();
      if (!text) {
        return {};
      }
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error(`MySQL 账号状态 JSON 解析失败：${error.message}`);
      }
    },
    save(nextData) {
      ensureSchema();
      const statements = [];
      statements.push("START TRANSACTION");
      statements.push(upsertStateStatement(nextData));
      statements.push("DELETE FROM accounts");
      statements.push("DELETE FROM sessions");
      statements.push("DELETE FROM profile_bindings");
      statements.push("DELETE FROM profiles");
      statements.push("DELETE FROM mail_messages");
      statements.push("DELETE FROM parties");
      statements.push("DELETE FROM party_invites");
      statements.push("DELETE FROM chat_messages");
      statements.push("DELETE FROM player_positions");
      statements.push("DELETE FROM battle_invites");
      statements.push("DELETE FROM battle_rooms");
      statements.push("DELETE FROM battle_records");
      statements.push("DELETE FROM gm_user_grants");
      statements.push("DELETE FROM gm_command_grants");
      statements.push("DELETE FROM gm_command_audit");
      statements.push("DELETE FROM auth_events");
      statements.push("DELETE FROM service_events");
      for (const account of Object.values(objectOrEmpty(nextData.accounts))) {
        statements.push(insertAccountStatement(account));
      }
      for (const session of Object.values(objectOrEmpty(nextData.sessions))) {
        statements.push(insertSessionStatement(session));
      }
      for (const binding of Object.values(objectOrEmpty(nextData.profileBindings))) {
        statements.push(insertProfileBindingStatement(binding));
      }
      for (const profile of Object.values(objectOrEmpty(nextData.profiles))) {
        statements.push(insertProfileStatement(profile));
      }
      for (const mail of Object.values(objectOrEmpty(nextData.mailMessages))) {
        statements.push(insertMailStatement(mail));
      }
      for (const party of Object.values(objectOrEmpty(nextData.parties))) {
        statements.push(insertPartyStatement(party));
      }
      for (const invite of Object.values(objectOrEmpty(nextData.partyInvites))) {
        statements.push(insertPartyInviteStatement(invite));
      }
      if (Array.isArray(nextData.chatMessages)) {
        for (const message of nextData.chatMessages) {
          statements.push(insertChatMessageStatement(message));
        }
      }
      for (const position of Object.values(objectOrEmpty(nextData.playerPositions))) {
        statements.push(insertPlayerPositionStatement(position));
      }
      for (const invite of Object.values(objectOrEmpty(nextData.battleInvites))) {
        statements.push(insertBattleInviteStatement(invite));
      }
      for (const room of Object.values(objectOrEmpty(nextData.battleRooms))) {
        statements.push(insertBattleRoomStatement(room));
      }
      if (Array.isArray(nextData.battleRecords)) {
        for (const record of nextData.battleRecords) {
          statements.push(insertBattleRecordStatement(record));
        }
      }
      for (const grant of Object.values(objectOrEmpty(nextData.gmUserGrants))) {
        statements.push(insertGmUserGrantStatement(grant));
      }
      for (const grants of Object.values(objectOrEmpty(nextData.gmCommandGrants))) {
        if (!Array.isArray(grants)) {
          continue;
        }
        for (const grant of grants) {
          statements.push(insertGmCommandGrantStatement(grant));
        }
      }
      if (Array.isArray(nextData.gmCommandAudit)) {
        for (const audit of nextData.gmCommandAudit) {
          statements.push(insertGmCommandAuditStatement(audit));
        }
      }
      if (Array.isArray(nextData.authEvents)) {
        for (const event of nextData.authEvents) {
          statements.push(insertAuthEventStatement(event));
        }
      }
      if (Array.isArray(nextData.serviceEvents)) {
        for (const event of nextData.serviceEvents) {
          statements.push(insertServiceEventStatement(event));
        }
      }
      statements.push("COMMIT");
      runMysqlSaveStatements(config, config.database, statements);
    },
  };
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
  try {
    return execFileSync(config.mysqlPath, args, {
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
  return `INSERT INTO server_state (state_key, document_json) VALUES ('auth', ${sqlJson(data)}) ON DUPLICATE KEY UPDATE document_json = VALUES(document_json)`;
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

function insertPartyStatement(party) {
  const memberCount = Array.isArray(party.memberAccountIds) ? party.memberAccountIds.length : 0;
  return `INSERT INTO parties (party_id, leader_account_id, member_count, created_at, updated_at, document_json) VALUES (${sqlString(party.partyId)}, ${sqlString(party.leaderAccountId)}, ${Number(memberCount)}, ${sqlString(party.createdAt)}, ${sqlString(party.updatedAt)}, ${sqlJson(party)})`;
}

function insertPartyInviteStatement(invite) {
  return `INSERT INTO party_invites (invite_id, party_id, from_account_id, to_account_id, status, created_at, updated_at, document_json) VALUES (${sqlString(invite.inviteId)}, ${sqlString(invite.partyId)}, ${sqlString(invite.fromAccountId)}, ${sqlString(invite.toAccountId)}, ${sqlString(invite.status)}, ${sqlString(invite.createdAt)}, ${sqlString(invite.updatedAt)}, ${sqlJson(invite)})`;
}

function insertChatMessageStatement(message) {
  return `INSERT INTO chat_messages (message_id, channel, party_id, sender_account_id, created_at, document_json) VALUES (${sqlString(message.messageId)}, ${sqlString(message.channel)}, ${sqlString(message.partyId)}, ${sqlString(message.senderAccountId)}, ${sqlString(message.createdAt)}, ${sqlJson(message)})`;
}

function insertPlayerPositionStatement(position) {
  return `INSERT INTO player_positions (account_id, username, map_id, cell_x, cell_y, facing, moving, updated_at, document_json) VALUES (${sqlString(position.accountId)}, ${sqlString(position.username)}, ${sqlString(position.mapId)}, ${Number(position.cellX || 0)}, ${Number(position.cellY || 0)}, ${sqlString(position.facing)}, ${position.moving ? 1 : 0}, ${sqlString(position.updatedAt)}, ${sqlJson(position)})`;
}

function insertBattleInviteStatement(invite) {
  return `INSERT INTO battle_invites (invite_id, mode, from_account_id, to_account_id, status, created_at, updated_at, document_json) VALUES (${sqlString(invite.inviteId)}, ${sqlString(invite.mode)}, ${sqlString(invite.fromAccountId)}, ${sqlString(invite.toAccountId)}, ${sqlString(invite.status)}, ${sqlString(invite.createdAt)}, ${sqlString(invite.updatedAt)}, ${sqlJson(invite)})`;
}

function insertBattleRoomStatement(room) {
  return `INSERT INTO battle_rooms (room_id, mode, status, seed, created_at, updated_at, document_json) VALUES (${sqlString(room.roomId)}, ${sqlString(room.mode)}, ${sqlString(room.status)}, ${sqlString(room.seed)}, ${sqlString(room.createdAt)}, ${sqlString(room.updatedAt)}, ${sqlJson(room)})`;
}

function insertBattleRecordStatement(record) {
  return `INSERT INTO battle_records (record_id, room_id, mode, reason, winner_account_id, closed_by_account_id, ended_at, participant_account_ids, loser_account_ids, document_json) VALUES (${sqlString(record.recordId)}, ${sqlString(record.roomId)}, ${sqlString(record.mode)}, ${sqlString(record.reason)}, ${sqlString(record.winnerAccountId)}, ${sqlString(record.closedByAccountId)}, ${sqlString(record.endedAt)}, ${sqlJson(record.participantAccountIds || [])}, ${sqlJson(record.loserAccountIds || [])}, ${sqlJson(record)})`;
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
