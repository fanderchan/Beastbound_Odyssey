-- Beastbound Odyssey Phase158 account / GM auth skeleton.
-- MySQL 9.7 target schema. The Node prototype uses an in-memory or JSON store
-- first; this schema is the migration target, not a required local dependency.

CREATE TABLE IF NOT EXISTS accounts (
  account_id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(20) NOT NULL UNIQUE,
  display_name VARCHAR(64) NOT NULL,
  role ENUM('player', 'gm') NOT NULL DEFAULT 'player',
  password_salt VARCHAR(128) NOT NULL,
  password_hash VARCHAR(256) NOT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS account_sessions (
  session_id VARCHAR(64) PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP(3) NOT NULL,
  revoked_at TIMESTAMP(3) NULL,
  schema_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_account_sessions_account
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_profile_bindings (
  account_id VARCHAR(64) PRIMARY KEY,
  player_id VARCHAR(64) NOT NULL UNIQUE,
  profile_revision BIGINT NOT NULL DEFAULT 0,
  schema_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_profile_bindings_account
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gm_user_grants (
  account_id VARCHAR(64) PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP(3) NULL,
  schema_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_gm_user_grants_account
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gm_command_grants (
  account_id VARCHAR(64) NOT NULL,
  command_id VARCHAR(80) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by VARCHAR(64) NOT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (account_id, command_id),
  CONSTRAINT fk_gm_command_grants_account
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gm_command_audit (
  audit_id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(20) NOT NULL,
  command_id VARCHAR(80) NOT NULL,
  ok BOOLEAN NOT NULL,
  message VARCHAR(255) NOT NULL DEFAULT '',
  schema_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_gm_command_audit_username_created (username, created_at),
  INDEX idx_gm_command_audit_command_created (command_id, created_at)
);

CREATE TABLE IF NOT EXISTS auth_events (
  event_id VARCHAR(64) PRIMARY KEY,
  event_type VARCHAR(40) NOT NULL,
  username VARCHAR(20) NOT NULL,
  ok BOOLEAN NOT NULL,
  message VARCHAR(255) NOT NULL DEFAULT '',
  schema_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_auth_events_username_created (username, created_at),
  INDEX idx_auth_events_type_created (event_type, created_at)
);
