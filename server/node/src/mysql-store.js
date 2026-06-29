"use strict";

const {execFileSync} = require("node:child_process");

const DEFAULT_DATABASE = "beastbound_odyssey";

function createMysqlAuthStore(options = {}) {
  const config = mysqlConfig(options);
  let schemaReady = false;

  function ensureSchema() {
    if (schemaReady) {
      return;
    }
    const database = checkedIdentifier(config.database);
    runMysql(config, "", `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`);
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
        expires_at VARCHAR(40) NOT NULL,
        revoked_at VARCHAR(40) NULL,
        document_json JSON NOT NULL,
        INDEX idx_sessions_account_id (account_id)
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
    `);
    schemaReady = true;
  }

  return {
    load() {
      ensureSchema();
      const output = runMysql(config, config.database, "SELECT JSON_UNQUOTE(JSON_EXTRACT(document_json, '$')) FROM server_state WHERE state_key = 'auth';", {"silent": true});
      const text = output.trim();
      if (!text) {
        return {};
      }
      try {
        return JSON.parse(text);
      } catch {
        return {};
      }
    },
    save(nextData) {
      ensureSchema();
      const statements = [];
      statements.push("START TRANSACTION");
      statements.push(upsertStateStatement(nextData));
      statements.push("DELETE FROM accounts");
      statements.push("DELETE FROM sessions");
      statements.push("DELETE FROM profiles");
      statements.push("DELETE FROM mail_messages");
      statements.push("DELETE FROM parties");
      statements.push("DELETE FROM party_invites");
      for (const account of Object.values(objectOrEmpty(nextData.accounts))) {
        statements.push(insertAccountStatement(account));
      }
      for (const session of Object.values(objectOrEmpty(nextData.sessions))) {
        statements.push(insertSessionStatement(session));
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
      statements.push("COMMIT");
      runMysql(config, config.database, `${statements.join(";\n")};`);
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
  args.push("-e", sql);
  try {
    return execFileSync(config.mysqlPath, args, {"encoding": "utf8", "stdio": ["ignore", "pipe", "pipe"]});
  } catch (error) {
    if (options.silent) {
      return "";
    }
    const stderr = error && error.stderr ? String(error.stderr).trim() : "";
    throw new Error(stderr || "MySQL 命令执行失败。");
  }
}

function upsertStateStatement(data) {
  return `INSERT INTO server_state (state_key, document_json) VALUES ('auth', ${sqlJson(data)}) ON DUPLICATE KEY UPDATE document_json = VALUES(document_json)`;
}

function insertAccountStatement(account) {
  return `INSERT INTO accounts (account_id, username, display_name, role, created_at, updated_at, document_json) VALUES (${sqlString(account.accountId)}, ${sqlString(account.username)}, ${sqlString(account.displayName)}, ${sqlString(account.role)}, ${sqlString(account.createdAt)}, ${sqlString(account.updatedAt)}, ${sqlJson(account)})`;
}

function insertSessionStatement(session) {
  return `INSERT INTO sessions (session_id, account_id, expires_at, revoked_at, document_json) VALUES (${sqlString(session.sessionId)}, ${sqlString(session.accountId)}, ${sqlString(session.expiresAt)}, ${sqlNullable(session.revokedAt)}, ${sqlJson(session)})`;
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

module.exports = {
  createMysqlAuthStore,
};
