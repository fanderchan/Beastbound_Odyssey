"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {execFileSync} = require("node:child_process");

const repoRoot = path.resolve(__dirname, "../../..");
const envPath = path.resolve(repoRoot, "server/node/.local/mysql.env");

function main() {
  const rootPassword = String(process.env.BEASTBOUND_MYSQL_ROOT_PASSWORD || "");
  if (!rootPassword) {
    throw new Error("Set BEASTBOUND_MYSQL_ROOT_PASSWORD before running this setup.");
  }
  const config = {
    mysqlPath: process.env.BEASTBOUND_MYSQL_BIN || "mysql",
    rootHost: process.env.BEASTBOUND_MYSQL_ROOT_HOST || "127.0.0.1",
    port: Number(process.env.BEASTBOUND_MYSQL_PORT || 3306),
    database: checkedIdentifier(process.env.BEASTBOUND_MYSQL_DATABASE || "beastbound_odyssey"),
    appUser: checkedIdentifier(process.env.BEASTBOUND_MYSQL_USER || "beastbound_app"),
    appPassword: process.env.BEASTBOUND_MYSQL_APP_PASSWORD || existingEnvPassword() || crypto.randomBytes(24).toString("base64url"),
    authHost: process.env.BEASTBOUND_AUTH_HOST || "127.0.0.1",
    authPort: Number(process.env.BEASTBOUND_AUTH_PORT || 8787),
  };
  const grants = [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "CREATE",
    "ALTER",
    "INDEX",
    "REFERENCES",
  ].join(", ");
  runMysql(config, rootPassword, `
    CREATE DATABASE IF NOT EXISTS \`${config.database}\`
      CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
    CREATE USER IF NOT EXISTS ${sqlUser(config.appUser, "127.0.0.1")} IDENTIFIED BY ${sqlString(config.appPassword)};
    ALTER USER ${sqlUser(config.appUser, "127.0.0.1")} IDENTIFIED BY ${sqlString(config.appPassword)};
    CREATE USER IF NOT EXISTS ${sqlUser(config.appUser, "localhost")} IDENTIFIED BY ${sqlString(config.appPassword)};
    ALTER USER ${sqlUser(config.appUser, "localhost")} IDENTIFIED BY ${sqlString(config.appPassword)};
    GRANT ${grants} ON \`${config.database}\`.* TO ${sqlUser(config.appUser, "127.0.0.1")};
    GRANT ${grants} ON \`${config.database}\`.* TO ${sqlUser(config.appUser, "localhost")};
    FLUSH PRIVILEGES;
  `);
  writeEnv(config);
  console.log(JSON.stringify({
    ok: true,
    database: config.database,
    appUser: config.appUser,
    envPath,
    authHost: config.authHost,
    authPort: config.authPort,
  }, null, 2));
}

function runMysql(config, rootPassword, sql) {
  const env = {...process.env, MYSQL_PWD: rootPassword};
  execFileSync(config.mysqlPath, [
    "--protocol=tcp",
    "-h", config.rootHost,
    "-P", String(config.port),
    "-uroot",
    "-e", sql,
  ], {"stdio": "pipe", env});
}

function existingEnvPassword() {
  if (!fs.existsSync(envPath)) {
    return "";
  }
  const text = fs.readFileSync(envPath, "utf8");
  const match = text.match(/^export BEASTBOUND_MYSQL_PASSWORD=(.*)$/m);
  if (!match) {
    return "";
  }
  return unquoteShellValue(match[1].trim());
}

function writeEnv(config) {
  fs.mkdirSync(path.dirname(envPath), {"recursive": true});
  const lines = [
    "# Local Beastbound Odyssey MySQL runtime settings.",
    "# This file is intentionally under server/node/.local and must stay untracked.",
    "export BEASTBOUND_AUTH_STORE=mysql",
    `export BEASTBOUND_AUTH_HOST=${quoteShellValue(config.authHost)}`,
    `export BEASTBOUND_AUTH_PORT=${quoteShellValue(String(config.authPort))}`,
    "export BEASTBOUND_MYSQL_HOST=127.0.0.1",
    `export BEASTBOUND_MYSQL_PORT=${quoteShellValue(String(config.port))}`,
    `export BEASTBOUND_MYSQL_DATABASE=${quoteShellValue(config.database)}`,
    `export BEASTBOUND_MYSQL_USER=${quoteShellValue(config.appUser)}`,
    `export BEASTBOUND_MYSQL_PASSWORD=${quoteShellValue(config.appPassword)}`,
    "export BEASTBOUND_MYSQL_CREATE_DATABASE=0",
    "",
  ];
  fs.writeFileSync(envPath, lines.join("\n"));
  fs.chmodSync(envPath, 0o600);
}

function sqlUser(user, host) {
  return `${sqlString(user)}@${sqlString(host)}`;
}

function sqlString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function quoteShellValue(value) {
  return `'${String(value || "").replace(/'/g, "'\\''")}'`;
}

function unquoteShellValue(value) {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/'\\''/g, "'");
  }
  if (value.startsWith("\"") && value.endsWith("\"")) {
    return value.slice(1, -1).replace(/\\"/g, "\"");
  }
  return value;
}

function checkedIdentifier(value) {
  const identifier = String(value || "").trim();
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error("MySQL identifiers may only contain letters, numbers, and underscore.");
  }
  return identifier;
}

main();
