"use strict";

const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createAuthService,
  createMemoryAuthStore,
} = require("../src/auth-service");
const {
  inspectLocalQaPlugin,
  loadLocalQaGmPolicy,
  normalizeLocalQaGmPolicy,
} = require("../src/auth/local-qa-gm-policy");
const {
  applyLocalQaGmAccountChange,
  atomicWritePrivateJson,
  buildLocalQaGmAccountChange,
  inspectLocalQaGmAccountState,
  randomLocalQaPassword,
  readPrivateFileSnapshot,
  restorePrivateFileSnapshot,
} = require("../src/auth/local-qa-gm-account-ops");
const {
  assertBackendStopped,
  parseArgs,
} = require("../scripts/local-qa-gm-account");

const NOW_MS = Date.parse("2026-07-12T08:00:00.000Z");
const EXPIRES_AT = "2026-07-12T16:00:00.000Z";
const policy = loadLocalQaGmPolicy();
const scriptPath = path.resolve(__dirname, "../scripts/local-qa-gm-account.js");

test("shared local QA policy is exact, explicit and fails closed on drift", () => {
  assert.equal(policy.policyId, "local_qa_full_v2");
  assert.deepEqual(policy.allowedUsernames, ["auth1373"]);
  assert.equal(policy.serverCommandIds.length, 11);
  assert.equal(policy.clientCommandIds.length, 30);
  assert.equal(policy.serverAuthoritativeClientCommandIds.length, 8);
  assert.equal(policy.serverCommandIds.includes("*"), false);
  assert.equal(policy.clientCommandIds.includes("*"), false);

  const raw = JSON.parse(fs.readFileSync(policy.policyPath, "utf8"));
  assert.throws(() => normalizeLocalQaGmPolicy({
    ...raw,
    serverCommandIds: [...raw.serverCommandIds, "*"],
  }), /通配|数量/);
  assert.throws(() => normalizeLocalQaGmPolicy({
    ...raw,
    clientCommandIds: raw.clientCommandIds.slice(1),
  }), /数量/);
  assert.throws(() => normalizeLocalQaGmPolicy({
    ...raw,
    maxLeaseHours: 25,
  }), /24小时/);
  assert.throws(() => normalizeLocalQaGmPolicy({
    ...raw,
    allowedUsernames: ["auth1373", "othergm"],
  }), /只能授权一个/);
});

test("legacy permanent and wildcard local authorization is reported inactive", () => {
  const fixture = existingAccountFixture();
  const state = inspectLocalQaGmAccountState({
    data: fixture.data,
    policy,
    username: "auth1373",
    plugin: {
      schemaVersion: 1,
      enabled: true,
      gmUsernames: ["auth1373"],
      gmCommands: ["*"],
    },
    pluginExists: true,
    pluginMode: 0o644,
    accountsMode: 0o644,
    nowMs: NOW_MS,
  });
  assert.equal(state.serverGrant.active, false);
  assert.equal(state.serverGrant.expiryConsistent, false);
  assert.equal(state.serverGrant.missingCommands.length, 7);
  assert.equal(state.plugin.active, false);
  assert.equal(state.plugin.wildcard, true);
  assert.equal(state.plugin.privateMode, false);
  assert.equal(state.ready, false);
});

test("init preserves profile and password while replacing grants and plugin with one lease", () => {
  const fixture = existingAccountFixture();
  const beforeProfile = structuredClone(fixture.data.profiles[fixture.playerId]);
  const beforePasswordHash = fixture.data.accounts.auth1373.passwordHash;
  const change = buildLocalQaGmAccountChange(fixture.data, {
    operation: "init",
    policy,
    username: "auth1373",
    expiresAt: EXPIRES_AT,
    nowMs: NOW_MS,
    randomId: sequence(["grant_audit"]),
  });
  const account = change.data.accounts.auth1373;
  const grants = change.data.gmCommandGrants[account.accountId];
  assert.equal(account.passwordHash, beforePasswordHash);
  assert.deepEqual(change.data.profiles[fixture.playerId], beforeProfile);
  assert.equal(change.report.passwordChanged, false);
  assert.equal(change.data.gmUserGrants[account.accountId].schemaVersion, 2);
  assert.equal(change.data.gmUserGrants[account.accountId].policyId, policy.policyId);
  assert.equal(change.data.gmUserGrants[account.accountId].expiresAt, EXPIRES_AT);
  assert.deepEqual(grants.map((grant) => grant.commandId), policy.serverCommandIds);
  assert.equal(grants.every((grant) => (
    grant.schemaVersion === 2
    && grant.policyId === policy.policyId
    && grant.expiresAt === EXPIRES_AT
    && grant.enabled === true
  )), true);
  assert.deepEqual(Object.keys(change.pluginDocument).sort(), [
    "enabled", "expiresAt", "gmCommands", "gmUsernames", "policyId", "schemaVersion",
  ].sort());
  assert.deepEqual(change.pluginDocument.gmCommands, policy.clientCommandIds);

  const state = inspectLocalQaGmAccountState({
    data: change.data,
    policy,
    username: "auth1373",
    plugin: change.pluginDocument,
    pluginExists: true,
    pluginMode: 0o600,
    accountsMode: 0o600,
    nowMs: NOW_MS,
  });
  assert.equal(state.ready, true);
  assert.equal(state.qaProfile.petSamples.ready, true);
  assert.equal(state.qaProfile.assets.ready, true);
  assert.equal(state.qaProfile.manifests.petSamplesPrepared, false);
  assert.equal(state.qaProfile.manifests.assetsPrepared, false);

  const badEnabledType = structuredClone(change.data);
  badEnabledType.gmUserGrants[account.accountId].enabled = 1;
  const badState = inspectLocalQaGmAccountState({
    data: badEnabledType,
    policy,
    username: "auth1373",
    plugin: {...change.pluginDocument, enabled: 1},
    pluginExists: true,
    pluginMode: 0o600,
    accountsMode: 0o600,
    nowMs: NOW_MS,
  });
  assert.equal(badState.serverGrant.active, false);
  assert.equal(badState.plugin.active, false);
  assert.equal(badState.ready, false);

  const restarted = createAuthService({
    store: createMemoryAuthStore(change.data),
    now: () => NOW_MS,
  });
  for (const commandId of policy.serverCommandIds) {
    assert.equal(restarted.authorizeGmCommand({token: fixture.token, commandId}).ok, true, commandId);
  }
  const expired = createAuthService({
    store: createMemoryAuthStore(change.data),
    now: () => Date.parse(EXPIRES_AT) + 1,
  });
  assert.equal(expired.getSession(fixture.token).session.effectiveRole, "player");
  assert.equal(expired.authorizeGmCommand({token: fixture.token, commandId: "gm_map"}).code, "gm_denied");
});

test("renew remains one durable store snapshot and revoke disables existing sessions immediately", () => {
  const fixture = existingAccountFixture();
  const init = buildLocalQaGmAccountChange(fixture.data, {
    operation: "init",
    policy,
    expiresAt: EXPIRES_AT,
    nowMs: NOW_MS,
  });
  const store = createMemoryAuthStore(fixture.data);
  assert.deepEqual(applyLocalQaGmAccountChange(store, fixture.data, init), {ok: true, reasons: []});
  const applied = store.load();
  const renewExpiry = "2026-07-13T08:00:00.000Z";
  const renewed = buildLocalQaGmAccountChange(applied, {
    operation: "renew",
    policy,
    expiresAt: renewExpiry,
    nowMs: NOW_MS,
  });
  applyLocalQaGmAccountChange(store, applied, renewed);
  assert.equal(store.load().gmUserGrants[fixture.accountId].expiresAt, renewExpiry);

  const beforeRevoke = store.load();
  const revoked = buildLocalQaGmAccountChange(beforeRevoke, {
    operation: "revoke",
    policy,
    nowMs: NOW_MS,
    randomId: sequence(["revoke_event"]),
  });
  applyLocalQaGmAccountChange(store, beforeRevoke, revoked);
  assert.equal(store.load().gmUserGrants[fixture.accountId].enabled, false);
  assert.equal(store.load().gmCommandGrants[fixture.accountId].every((grant) => !grant.enabled), true);
  const service = createAuthService({store, now: () => NOW_MS});
  assert.equal(service.getSession(fixture.token).session.effectiveRole, "player");
  assert.equal(service.authorizeGmCommand({token: fixture.token, commandId: "gm_map"}).code, "gm_denied");
});

test("failed durable verification rolls the store back to the exact source snapshot", () => {
  const fixture = existingAccountFixture();
  const change = buildLocalQaGmAccountChange(fixture.data, {
    operation: "init",
    policy,
    expiresAt: EXPIRES_AT,
    nowMs: NOW_MS,
  });
  let data = structuredClone(fixture.data);
  let saveCount = 0;
  const store = {
    save(value) {
      saveCount += 1;
      data = structuredClone(value);
      if (saveCount === 1) {
        data.gmCommandGrants[fixture.accountId].pop();
      }
    },
    load() {
      return structuredClone(data);
    },
  };
  assert.throws(
    () => applyLocalQaGmAccountChange(store, fixture.data, change),
    /授权复核失败.*rollback=ok/,
  );
  assert.deepEqual(data, fixture.data);
  assert.equal(saveCount, 2);
});

test("new account and password rotation keep the random password out of reports and revoke sessions", () => {
  const empty = createMemoryAuthStore().load();
  const generatedPassword = randomLocalQaPassword(() => Buffer.alloc(24, 5));
  assert.equal(generatedPassword.length >= 8, true);
  const created = buildLocalQaGmAccountChange(empty, {
    operation: "init",
    policy,
    expiresAt: EXPIRES_AT,
    nowMs: NOW_MS,
    password: generatedPassword,
    randomId: sequence(["account", "audit"]),
    randomBytes: (size) => Buffer.alloc(size, 6),
  });
  assert.equal(created.report.accountCreated, true);
  assert.equal(created.report.passwordChanged, true);
  assert.equal(JSON.stringify(created.report).includes(generatedPassword), false);
  assert.equal(Object.values(created.data.sessions).length, 0);
  assert.equal(created.data.accounts.auth1373.passwordPolicyVersion >= 2, true);

  const rotatedPassword = randomLocalQaPassword(() => Buffer.alloc(24, 9));
  const rotated = buildLocalQaGmAccountChange(created.data, {
    operation: "renew",
    policy,
    expiresAt: "2026-07-13T08:00:00.000Z",
    nowMs: NOW_MS,
    password: rotatedPassword,
    rotatePassword: true,
    randomBytes: () => Buffer.alloc(16, 3),
  });
  assert.equal(rotated.report.passwordChanged, true);
  assert.equal(JSON.stringify(rotated.report).includes(rotatedPassword), false);
  assert.notEqual(rotated.data.accounts.auth1373.passwordHash, created.data.accounts.auth1373.passwordHash);
  assert.equal(Object.values(rotated.data.sessions).length, 0);
});

test("private JSON writes are atomic 0600 and invalid before-images restore byte-for-byte", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-qa-gm-private-"));
  const pluginPath = path.join(tempDir, "gm_tools.gmplugin.json");
  try {
    atomicWritePrivateJson(pluginPath, {
      schemaVersion: 2,
      policyId: policy.policyId,
      enabled: true,
      expiresAt: EXPIRES_AT,
      gmUsernames: ["auth1373"],
      gmCommands: [...policy.clientCommandIds],
    });
    assert.equal(fs.statSync(pluginPath).mode & 0o777, 0o600);
    const validInspection = inspectLocalQaPlugin(
      JSON.parse(fs.readFileSync(pluginPath, "utf8")),
      policy,
      "auth1373",
      NOW_MS,
    );
    assert.equal(validInspection.active, true);

    fs.writeFileSync(pluginPath, Buffer.from([0, 255, 12, 88]), {mode: 0o640});
    fs.chmodSync(pluginPath, 0o640);
    const before = readPrivateFileSnapshot(pluginPath);
    atomicWritePrivateJson(pluginPath, {broken: false});
    restorePrivateFileSnapshot(before);
    assert.deepEqual(fs.readFileSync(pluginPath), Buffer.from([0, 255, 12, 88]));
    assert.equal(fs.statSync(pluginPath).mode & 0o777, 0o640);
    assert.equal(fs.readdirSync(tempDir).some((name) => name.includes(".tmp-")), false);
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("CLI parsing has read-only status default, explicit apply and no policy/password override", () => {
  assert.deepEqual(parseArgs([]), {operation: "status", apply: false, rotatePassword: false});
  assert.deepEqual(parseArgs(["init"]), {operation: "init", apply: false, rotatePassword: false});
  assert.deepEqual(parseArgs(["renew", "--hours", "8", "--apply", "--rotate-password"]), {
    operation: "renew",
    apply: true,
    rotatePassword: true,
    hours: "8",
  });
  assert.throws(() => parseArgs(["status", "--apply"]), /只读/);
  assert.throws(() => parseArgs(["init", "--password", "secret"]), /不接受命令行密码/);
  assert.throws(() => parseArgs(["init", "--policy-path", "/tmp/widen.json"]), /未知参数/);
  assert.throws(() => assertBackendStopped({stopped: false}), (error) => {
    assert.equal(error.code, "local_qa_backend_running");
    return true;
  });
});

test("real CLI init without --apply uses read-only MySQL and creates no local files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-qa-gm-cli-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const mysqlLogPath = path.join(tempDir, "mysql.jsonl");
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
  if (stdin.includes("information_schema.tables")) process.stdout.write("0\\n");
});
`, {mode: 0o755});
  try {
    const result = spawnSync(process.execPath, [scriptPath, "init"], {
      cwd: path.resolve(__dirname, "../../.."),
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_MYSQL_LOG: mysqlLogPath,
        BEASTBOUND_AUTH_STORE: "mysql",
        BEASTBOUND_GODOT_USERDATA: tempDir,
        BEASTBOUND_MYSQL_BIN: fakeMysqlPath,
        BEASTBOUND_MYSQL_HOST: "127.0.0.1",
        BEASTBOUND_MYSQL_PORT: "3306",
        BEASTBOUND_MYSQL_USER: "reader",
        BEASTBOUND_MYSQL_PASSWORD: "mysql-secret",
        BEASTBOUND_MYSQL_DATABASE: "beastbound_test",
        BEASTBOUND_MYSQL_CREATE_DATABASE: "0",
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.mode, "dry-run");
    assert.equal(output.applied, false);
    assert.equal(result.stdout.includes("mysql-secret"), false);
    assert.equal(fs.existsSync(path.join(tempDir, "gm_tools.gmplugin.json")), false);
    const calls = fs.readFileSync(mysqlLogPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(calls.length >= 2, true);
    for (const call of calls) {
      assert.doesNotMatch(call.stdin, /CREATE TABLE|CREATE DATABASE|START TRANSACTION|INSERT INTO|DELETE FROM|UPDATE /);
    }
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

function existingAccountFixture() {
  const store = createMemoryAuthStore();
  const service = createAuthService({store, now: () => NOW_MS});
  const registered = service.register({
    username: "auth1373",
    password: "existing-password",
    displayName: "本地QA",
  });
  const data = service.snapshot();
  const accountId = registered.account.accountId;
  const playerId = data.profileBindings[accountId].playerId;
  data.accounts.auth1373.role = "gm";
  data.gmUserGrants[accountId] = {
    accountId,
    username: "auth1373",
    enabled: true,
    expiresAt: null,
    schemaVersion: 1,
  };
  data.gmCommandGrants[accountId] = [
    "gm_map",
    "gm_grant_pet",
    "gm_level_pet",
    "gm_battle_speed_gear",
  ].map((commandId) => ({accountId, commandId, enabled: true, schemaVersion: 1}));
  const profile = data.profiles[playerId].profile;
  profile.petInstances = Array.from({length: 10}, (_, index) => ({
    instanceId: `pet_${index + 1}`,
    state: index < 5 ? "standby" : "storage",
  }));
  profile.backpackSlots = [
    ...Array.from({length: 16}, (_, index) => ({itemId: `fixture_${index}`, count: 1})),
    {}, {}, {}, {},
  ];
  profile.bank = {schemaVersion: 1, slots: []};
  return {
    data,
    accountId,
    playerId,
    token: registered.session.token,
  };
}

function sequence(values) {
  let index = 0;
  return () => values[index++] || `generated_${index}`;
}
