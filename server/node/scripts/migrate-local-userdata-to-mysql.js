"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {createMysqlAuthStore} = require("../src/mysql-store");

const repoRoot = path.resolve(__dirname, "../../..");
loadEnvFile(path.resolve(repoRoot, "server/node/.local/mysql.env"));

function main() {
  const args = parseArgs(process.argv.slice(2));
  const username = normalizeUsername(args.username || process.env.BEASTBOUND_MIGRATE_USERNAME || "auth1373");
  const password = String(args.password || process.env.BEASTBOUND_MIGRATE_PASSWORD || "");
  if (!username) {
    throw new Error("Missing --username.");
  }
  if (!password) {
    throw new Error("Missing --password or BEASTBOUND_MIGRATE_PASSWORD.");
  }
  const userdataRoot = args.userdataRoot || process.env.BEASTBOUND_GODOT_USERDATA || path.join(
    process.env.HOME || "",
    "Library/Application Support/Godot/app_userdata/Beastbound Odyssey - 万兽纪元"
  );
  const localAccounts = readJsonIfExists(path.join(userdataRoot, "accounts.json"));
  const localAccount = objectOrEmpty(objectOrEmpty(localAccounts.accounts)[username]);
  const role = normalizedRole(args.role || process.env.BEASTBOUND_MIGRATE_ROLE || localAccount.role || (username === "auth1373" ? "gm" : "player"));
  const profilePath = args.profilePath || bestProfilePath(userdataRoot, username);
  const profile = readJsonFile(profilePath);
  const nowIso = new Date().toISOString();
  const store = createMysqlAuthStore();
  const data = normalizedServerDocument(store.load());
  const account = objectOrEmpty(data.accounts[username]);
  const accountId = String(account.accountId || `acc_${crypto.randomUUID()}`);
  const salt = crypto.randomBytes(16).toString("hex");
  const displayName = String(localAccount.displayName || profile.playerName || objectOrEmpty(profile.player).name || username);

  data.accounts[username] = {
    ...account,
    accountId,
    username,
    displayName,
    role,
    passwordSalt: salt,
    passwordHash: crypto.scryptSync(password, salt, 32).toString("hex"),
    createdAt: isoFromLocalCreatedAt(localAccount.createdAt) || account.createdAt || nowIso,
    updatedAt: nowIso,
    schemaVersion: 1,
  };

  for (const [sessionId, session] of Object.entries(data.sessions)) {
    if (session && session.accountId === accountId) {
      delete data.sessions[sessionId];
    }
  }

  const existingBinding = objectOrEmpty(data.profileBindings[accountId]);
  const playerId = String(existingBinding.playerId || `player_${accountId.slice(4, 16)}`);
  const nextRevision = Math.max(Number(existingBinding.profileRevision || 0), Number(objectOrEmpty(data.profiles[playerId]).profileRevision || 0)) + 1;
  data.profileBindings[accountId] = {
    accountId,
    playerId,
    profileRevision: nextRevision,
    createdAt: existingBinding.createdAt || nowIso,
    updatedAt: nowIso,
    schemaVersion: 1,
  };
  data.profiles[playerId] = {
    playerId,
    accountId,
    profileRevision: nextRevision,
    profile,
    updatedAt: nowIso,
    schemaVersion: 1,
  };
  if (role === "gm") {
    data.gmUserGrants[accountId] = {
      accountId,
      username,
      enabled: true,
      grantedBy: "local_migration",
      expiresAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      schemaVersion: 1,
    };
    data.gmCommandGrants[accountId] = [{
      accountId,
      commandId: "*",
      enabled: true,
      grantedBy: "local_migration",
      createdAt: nowIso,
      updatedAt: nowIso,
      schemaVersion: 1,
    }];
  } else {
    delete data.gmUserGrants[accountId];
    delete data.gmCommandGrants[accountId];
  }
  data.authEvents.push({
    eventId: `auth_${crypto.randomUUID()}`,
    type: "local_userdata_migration",
    username,
    ok: true,
    message: profilePath,
    createdAt: nowIso,
    schemaVersion: 1,
  });

  store.save(data);
  console.log(JSON.stringify({
    ok: true,
    username,
    accountId,
    playerId,
    profileRevision: nextRevision,
    role,
    effectiveRole: role,
    profilePath,
    playerLevel: Number(objectOrEmpty(profile.player).level || 1),
    rebirthCount: Number(profile.rebirthCount || 0),
    petInstances: Array.isArray(profile.petInstances) ? profile.petInstances.length : 0,
    activePetInstanceId: String(profile.activePetInstanceId || ""),
    stoneCoins: Number(profile.stoneCoins || profile.coins || 0),
  }, null, 2));
}

function bestProfilePath(userdataRoot, username) {
  const accountCandidates = [
    path.join(userdataRoot, "server_accounts", username, "player_profile.json"),
    path.join(userdataRoot, "accounts", username, "player_profile.json"),
  ];
  const accountExisting = accountCandidates.filter((candidate) => fs.existsSync(candidate));
  if (accountExisting.length > 0) {
    accountExisting.sort((a, b) => profileScore(b) - profileScore(a));
    return accountExisting[0];
  }
  const existing = [path.join(userdataRoot, "player_profile.json")].filter((candidate) => fs.existsSync(candidate));
  if (existing.length === 0) {
    throw new Error(`No local profile found for ${username}.`);
  }
  return existing[0];
}

function profileScore(filePath) {
  const profile = readJsonIfExists(filePath);
  const player = objectOrEmpty(profile.player);
  const pets = Array.isArray(profile.petInstances) ? profile.petInstances.length : 0;
  return Number(profile.rebirthCount || 0) * 100000 + Number(player.level || 0) * 1000 + pets * 10 + Number(profile.coins || 0) / 1000000;
}

function normalizedServerDocument(data) {
  const source = objectOrEmpty(data);
  return {
    schemaVersion: 1,
    accounts: objectOrEmpty(source.accounts),
    sessions: objectOrEmpty(source.sessions),
    profileBindings: objectOrEmpty(source.profileBindings),
    profiles: objectOrEmpty(source.profiles),
    mailMessages: objectOrEmpty(source.mailMessages),
    parties: objectOrEmpty(source.parties),
    partyInvites: objectOrEmpty(source.partyInvites),
    chatMessages: Array.isArray(source.chatMessages) ? source.chatMessages : [],
    playerPositions: objectOrEmpty(source.playerPositions),
    battleInvites: objectOrEmpty(source.battleInvites),
    battleRooms: objectOrEmpty(source.battleRooms),
    gmUserGrants: objectOrEmpty(source.gmUserGrants),
    gmCommandGrants: objectOrEmpty(source.gmCommandGrants),
    gmCommandAudit: Array.isArray(source.gmCommandAudit) ? source.gmCommandAudit : [],
    authEvents: Array.isArray(source.authEvents) ? source.authEvents : [],
    serviceEventSeq: Number(source.serviceEventSeq || 0),
    serviceEvents: Array.isArray(source.serviceEvents) ? source.serviceEvents : [],
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--username") {
      result.username = argv[++index] || "";
    } else if (arg === "--password") {
      result.password = argv[++index] || "";
    } else if (arg === "--role") {
      result.role = argv[++index] || "";
    } else if (arg === "--profile-path") {
      result.profilePath = argv[++index] || "";
    } else if (arg === "--userdata-root") {
      result.userdataRoot = argv[++index] || "";
    }
  }
  return result;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) {
      continue;
    }
    process.env[match[1]] = unquoteShellValue(match[2].trim());
  }
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    return readJsonFile(filePath);
  } catch {
    return {};
  }
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function normalizedRole(role) {
  const value = String(role || "").trim().toLowerCase();
  return value === "gm" ? "gm" : "player";
}

function isoFromLocalCreatedAt(value) {
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }
  return new Date(seconds * 1000).toISOString();
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

main();
