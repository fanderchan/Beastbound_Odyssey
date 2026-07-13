"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {createAuthService, createMemoryAuthStore} = require("../src/auth-service");
const {createMysqlAuthStore} = require("../src/mysql-store");

const repoRoot = path.resolve(__dirname, "../../..");
loadEnvFile(path.resolve(repoRoot, "server/node/.local/mysql.env"));

function main() {
  const args = parseArgs(process.argv.slice(2));
  const username = String(args.username || process.env.BEASTBOUND_SMOKE_USERNAME || "auth1373").trim().toLowerCase();
  const password = String(args.password || process.env.BEASTBOUND_SMOKE_PASSWORD || "");
  const expectedRole = String(args.expectRole || process.env.BEASTBOUND_SMOKE_EXPECT_ROLE || "").trim().toLowerCase();
  if (!password) {
    throw new Error("Missing --password or BEASTBOUND_SMOKE_PASSWORD.");
  }
  const mysqlStore = createMysqlAuthStore({readOnly: true, ensureSchema: false});
  const service = createAuthService({store: createMemoryAuthStore(mysqlStore.load())});
  const login = service.login({username, password});
  if (!login.ok) {
    throw new Error(`login failed: ${login.code || ""} ${login.message || ""}`.trim());
  }
  const profile = service.getProfile(login.session.token);
  if (!profile.ok) {
    throw new Error(`profile failed: ${profile.code || ""} ${profile.message || ""}`.trim());
  }
  const gmTools = service.listGmTools(login.session.token, [{"id": "gm_map"}, {"id": "gm_grant_pet"}]);
  if (expectedRole && login.session.effectiveRole !== expectedRole) {
    throw new Error(`role mismatch: expected ${expectedRole}, got ${login.session.effectiveRole}`);
  }
  const player = profile.profile && profile.profile.player ? profile.profile.player : {};
  console.log(JSON.stringify({
    ok: true,
    username,
    effectiveRole: login.session.effectiveRole,
    profileRevision: profile.profileSummary.profileRevision,
    hasProfile: profile.profileSummary.hasProfile,
    playerLevel: Number(player.level || 1),
    rebirthCount: Number(profile.profile && profile.profile.rebirthCount || 0),
    petInstances: Array.isArray(profile.profile && profile.profile.petInstances) ? profile.profile.petInstances.length : 0,
    activePetInstanceId: String(profile.profile && profile.profile.activePetInstanceId || ""),
    gmToolsOk: Boolean(gmTools.ok),
    gmCommandIds: Array.isArray(gmTools.commandIds) ? gmTools.commandIds : [],
  }, null, 2));
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--username") {
      result.username = argv[++index] || "";
    } else if (arg === "--password") {
      result.password = argv[++index] || "";
    } else if (arg === "--expect-role") {
      result.expectRole = argv[++index] || "";
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
