"use strict";

const {
  assert,
  crypto,
  fs,
  os,
  path,
  test,
  once,
  createAuthService,
  createMemoryAuthStore,
  createHttpServer,
  createDefaultStore,
  DEFAULT_COMMAND_CATALOG,
  CLIENT_PROTOCOL_HEADER,
  CLIENT_VERSION_HEADER,
  PROTOCOL_VERSION,
  SERVER_VERSION,
  createMysqlAuthStore,
  createCountingAuthStore,
  testPasswordHash,
  withEnv,
  battleProfile,
  profileItemCount,
  playerRebirthReadyProfile,
  battleProfileWithPets,
  fetchJson,
  eventStreamUrl,
  webSocketOpen,
  webSocketJsonReader,
} = require("../test-support/auth-service-test-context");
const {
  CURRENT_PROFILE_SCHEMA_VERSION,
  migrateProfile,
} = require("../src/auth/profile-migrations");

const TEST_GM_POLICY_ID = "test_explicit_gm_v1";
const TEST_GM_EXPIRES_AT = "2099-01-01T00:00:00.000Z";

test("register/login/session keeps players away from GM tools", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});

  const registered = service.register({
    "username": "Fander",
    "password": "test1234",
    "displayName": "测试玩家",
  });
  assert.equal(registered.ok, true);
  assert.equal(registered.account.username, "fander");
  assert.equal(registered.account.passwordHash, undefined);
  assert.equal(registered.session.effectiveRole, "player");
  assert.equal(Boolean(registered.session.token), true);
  assert.equal(registered.profileSummary.storageMode, "server_document");
  assert.equal(registered.profileSummary.profileRevision, 0);
  assert.match(registered.profileSummary.playerId, /^player_/);
  const initialProfile = service.getProfile(registered.session.token);
  assert.equal(initialProfile.ok, true);
  assert.equal(initialProfile.profile.schemaVersion, CURRENT_PROFILE_SCHEMA_VERSION);
  const initialProfileAudit = migrateProfile(initialProfile.profile);
  assert.equal(initialProfileAudit.ok, true);
  assert.equal(initialProfileAudit.changed, false);
  assert.deepEqual(
    (initialProfile.profile.backpackSlots || []).filter((slot) => slot && slot.itemId),
    [],
  );
  assert.deepEqual(initialProfile.profile.petInstances, []);
  assert.equal(initialProfile.profile.activePetInstanceId, "");
  assert.equal(initialProfile.profile.nextPetInstanceSerial, 1);
  assert.deepEqual(initialProfile.profile.captureTools, {
    capture_rope_basic: 0,
    capture_net: 0,
    capture_net_reinforced: 0,
    capture_poison_wuli_net: 0,
  });
  assert.equal(initialProfile.profile.diamonds, 0);

  const duplicate = service.register({"username": "fander", "password": "test1234"});
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "account_exists");

  const login = service.login({"username": "fander", "password": "test1234"});
  assert.equal(login.ok, true);
  const session = service.getSession(login.session.token);
  assert.equal(session.ok, true);
  assert.equal(session.session.effectiveRole, "player");

  const tools = service.listGmTools(login.session.token, DEFAULT_COMMAND_CATALOG);
  assert.equal(tools.ok, false);
  assert.equal(tools.code, "gm_denied");
});

test("saveProfile full-document writes are denied unless explicitly enabled", () => {
  const strictService = createAuthService({"store": createMemoryAuthStore(), "allowFullProfileSave": false});
  const player = strictService.register({"username": "savegatea", "password": "test1234", "displayName": "整档闸门"});
  assert.equal(player.ok, true);
  const denied = strictService.saveProfile(player.session.token, {
    "expectedRevision": 0,
    "profile": {"schemaVersion": 1, "stoneCoins": 999999},
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "profile_upload_denied");
  const untouched = strictService.getProfile(player.session.token);
  assert.equal(untouched.ok, true);
  assert.notEqual(Number(untouched.profile && untouched.profile.stoneCoins || 0), 999999);

  const opsService = createAuthService({"store": createMemoryAuthStore(), "allowFullProfileSave": true});
  const opsPlayer = opsService.register({"username": "savegateb", "password": "test1234", "displayName": "整档运维"});
  assert.equal(opsPlayer.ok, true);
  const saved = opsService.saveProfile(opsPlayer.session.token, {
    "expectedRevision": 0,
    "profile": {"schemaVersion": 1, "stoneCoins": 5},
  });
  assert.equal(saved.ok, true);
});

test("server auth enforces 8 character passwords for new accounts", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});

  const weak = service.register({"username": "weakpass", "password": "short"});
  assert.equal(weak.ok, false);
  assert.equal(weak.code, "weak_password");
  assert.match(weak.message, /8/);

  const strong = service.register({"username": "strongpass", "password": "test1234"});
  assert.equal(strong.ok, true);
  assert.equal(strong.session.passwordUpgradeRequired, undefined);
});

test("legacy password policy accounts can login and receive upgrade prompt", () => {
  const salt = "legacy_salt";
  const store = createMemoryAuthStore({
    "accounts": {
      "legacyuser": {
        "accountId": "acc_legacyuser",
        "username": "legacyuser",
        "displayName": "旧账号",
        "role": "player",
        "passwordSalt": salt,
        "passwordHash": testPasswordHash("old4", salt),
        "createdAt": "2026-06-01T00:00:00.000Z",
        "updatedAt": "2026-06-01T00:00:00.000Z",
        "schemaVersion": 1,
      },
    },
    "sessions": {},
    "profileBindings": {},
    "profiles": {},
  });
  const service = createAuthService({store});

  const login = service.login({"username": "legacyuser", "password": "old4"});
  assert.equal(login.ok, true);
  assert.equal(login.session.passwordUpgradeRequired, true);
  assert.match(login.session.passwordPolicyMessage, /至少8位/);
  assert.equal(Boolean(login.session.token), true);
});

test("server auth backs off repeated login failures by IP and account", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "limituser", "password": "test1234"});
  assert.equal(registered.ok, true);

  for (let index = 0; index < 5; index += 1) {
    const failed = service.login({
      "username": "limituser",
      "password": "wrong123",
      "ipAddress": "10.0.0.1",
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.code, "wrong_password");
  }

  const blocked = service.login({
    "username": "limituser",
    "password": "test1234",
    "ipAddress": "10.0.0.1",
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "auth_backoff");
  assert.equal(blocked.retryAfterMs > 0, true);

  const otherIp = service.login({
    "username": "limituser",
    "password": "test1234",
    "ipAddress": "10.0.0.2",
  });
  assert.equal(otherIp.ok, true);
});

test("expired sessions can refresh within grace window", () => {
  let currentMs = Date.parse("2026-07-01T00:00:00.000Z");
  let randomByteValue = 1;
  const service = createAuthService({
    "store": createMemoryAuthStore(),
    "now": () => currentMs,
    "randomBytes": (size) => Buffer.alloc(size, randomByteValue++),
  });
  const events = [];
  service.onEvent((event) => events.push(event));
  const registered = service.register({"username": "refreshuser", "password": "test1234"});
  assert.equal(registered.ok, true);
  const oldToken = registered.session.token;
  currentMs = Date.parse(registered.session.expiresAt) + 1000;

  const expired = service.getSession(oldToken);
  assert.equal(expired.ok, false);
  assert.equal(expired.code, "session_expired");

  const refreshed = service.refreshSession(oldToken);
  assert.equal(refreshed.ok, true);
  assert.notEqual(refreshed.session.token, oldToken);
  assert.equal(Boolean(refreshed.session.token), true);
  assert.equal(service.getSession(refreshed.session.token).ok, true);
  assert.equal(service.getSession(oldToken).code, "session_revoked");
  const replacementEvent = events.find((event) => event.type === "session.replaced");
  assert.ok(replacementEvent);
  assert.deepEqual(replacementEvent.targetSessionIds, [registered.session.sessionId]);
});

test("new login replaces older sessions for the same account", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const events = [];
  service.onEvent((event) => events.push(event));
  const registered = service.register({"username": "replaceuser", "password": "test1234", "displayName": "顶号测试"});
  assert.equal(registered.ok, true);
  const oldToken = registered.session.token;
  const oldSessionId = registered.session.sessionId;

  const login = service.login({"username": "replaceuser", "password": "test1234"});
  assert.equal(login.ok, true);
  assert.notEqual(login.session.token, oldToken);
  assert.equal(service.getSession(login.session.token).ok, true);

  const oldSession = service.getSession(oldToken);
  assert.equal(oldSession.ok, false);
  assert.equal(oldSession.code, "session_replaced");
  assert.match(oldSession.message, /其他地方登录/);

  const replacementEvent = events.find((event) => event.type === "session.replaced");
  assert.equal(Boolean(replacementEvent), true);
  assert.deepEqual(replacementEvent.targetSessionIds, [oldSessionId]);
  assert.deepEqual(replacementEvent.targetAccountIds, [registered.account.accountId]);
  assert.equal(replacementEvent.code, "session_replaced");
  assert.match(replacementEvent.message, /被踢出游戏/);

  const oldVisible = service.eventForSession(oldToken, replacementEvent);
  assert.equal(oldVisible.ok, true);
  assert.equal(oldVisible.visible, true);
  const newVisible = service.eventForSession(login.session.token, replacementEvent);
  assert.equal(newVisible.ok, true);
  assert.equal(newVisible.visible, false);
});

test("too old sessions cannot refresh silently", () => {
  let currentMs = Date.parse("2026-07-01T00:00:00.000Z");
  const service = createAuthService({
    "store": createMemoryAuthStore(),
    "now": () => currentMs,
  });
  const registered = service.register({"username": "staleuser", "password": "test1234"});
  assert.equal(registered.ok, true);
  currentMs = Date.parse(registered.session.expiresAt) + (8 * 24 * 60 * 60 * 1000);

  const refreshed = service.refreshSession(registered.session.token);
  assert.equal(refreshed.ok, false);
  assert.equal(refreshed.code, "session_refresh_expired");
});

test("GM grants are command-scoped and audited", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "gmtester", "password": "test1234"});
  const token = registered.session.token;

  const playerDenied = service.authorizeGmCommand({"token": token, "commandId": "gm_map"});
  assert.equal(playerDenied.ok, false);
  assert.equal(playerDenied.code, "gm_denied");

  const grant = service.grantGm({
    "username": "gmtester",
    "commandIds": ["gm_map"],
    "policyId": TEST_GM_POLICY_ID,
    "expiresAt": TEST_GM_EXPIRES_AT,
    "grantedBy": "unit_test",
  });
  assert.equal(grant.ok, true);
  assert.equal(grant.gmGrant.policyId, TEST_GM_POLICY_ID);
  assert.equal(grant.gmGrant.expiresAt, TEST_GM_EXPIRES_AT);
  assert.deepEqual(grant.commandGrants.map((row) => ({
    commandId: row.commandId,
    policyId: row.policyId,
    expiresAt: row.expiresAt,
  })), [{
    commandId: "gm_map",
    policyId: TEST_GM_POLICY_ID,
    expiresAt: TEST_GM_EXPIRES_AT,
  }]);

  const session = service.getSession(token);
  assert.equal(session.ok, true);
  assert.equal(session.session.effectiveRole, "gm");

  const tools = service.listGmTools(token, DEFAULT_COMMAND_CATALOG);
  assert.deepEqual(tools, {
    ok: true,
    effectiveRole: "gm",
    commandIds: ["gm_map"],
    policyId: TEST_GM_POLICY_ID,
    expiresAt: TEST_GM_EXPIRES_AT,
    schemaVersion: 2,
  });

  const allowed = service.authorizeGmCommand({"token": token, "commandId": "gm_map"});
  assert.equal(allowed.ok, true);

  const denied = service.authorizeGmCommand({"token": token, "commandId": "gm_level_pet"});
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "command_denied");

  const snapshot = service.snapshot();
  assert.equal(snapshot.gmCommandAudit.length, 3);
  assert.deepEqual(snapshot.gmCommandAudit.map((row) => row.ok), [false, true, false]);
});

test("new GM grants reject implicit, wildcard, malformed, and expired authority atomically", () => {
  const nowMs = Date.parse("2026-07-12T08:00:00.000Z");
  const service = createAuthService({
    store: createMemoryAuthStore(),
    now: () => nowMs,
  });
  const registered = service.register({username: "gmgrantstrict", password: "test1234"});
  assert.equal(registered.ok, true);
  const before = service.snapshot();
  const invalidPayloads = [
    {policyId: TEST_GM_POLICY_ID, expiresAt: "2026-07-12T09:00:00.000Z"},
    {commandIds: "gm_map", policyId: TEST_GM_POLICY_ID, expiresAt: "2026-07-12T09:00:00.000Z"},
    {commandIds: [], policyId: TEST_GM_POLICY_ID, expiresAt: "2026-07-12T09:00:00.000Z"},
    {commandIds: ["*"], policyId: TEST_GM_POLICY_ID, expiresAt: "2026-07-12T09:00:00.000Z"},
    {commandIds: ["gm_map", ""], policyId: TEST_GM_POLICY_ID, expiresAt: "2026-07-12T09:00:00.000Z"},
    {commandIds: ["gm_map"], policyId: "", expiresAt: "2026-07-12T09:00:00.000Z"},
    {commandIds: ["gm_map"], policyId: TEST_GM_POLICY_ID},
    {commandIds: ["gm_map"], policyId: TEST_GM_POLICY_ID, expiresAt: "not-a-time"},
    {commandIds: ["gm_map"], policyId: TEST_GM_POLICY_ID, expiresAt: "2026-07-12T09:00:00Z"},
    {commandIds: ["gm_map"], policyId: TEST_GM_POLICY_ID, expiresAt: "2026-07-12T08:00:00.000Z"},
  ];
  for (const payload of invalidPayloads) {
    const denied = service.grantGm({
      username: "gmgrantstrict",
      grantedBy: "strict_grant_test",
      ...payload,
    });
    assert.equal(denied.ok, false);
    assert.deepEqual(service.snapshot(), before);
  }

  const granted = service.grantGm({
    username: "gmgrantstrict",
    commandIds: [" GM_MAP ", "gm_map", "GM_LEVEL_PET"],
    policyId: " TEST_EXPLICIT_GM_V1 ",
    expiresAt: "2026-07-12T09:00:00.000Z",
    grantedBy: "strict_grant_test",
  });
  assert.equal(granted.ok, true);
  assert.equal(granted.gmGrant.policyId, TEST_GM_POLICY_ID);
  assert.equal(granted.gmGrant.expiresAt, "2026-07-12T09:00:00.000Z");
  assert.deepEqual(granted.commandGrants.map((row) => row.commandId), ["gm_map", "gm_level_pet"]);
  assert.equal(granted.commandGrants.every((row) => (
    row.policyId === TEST_GM_POLICY_ID
    && row.expiresAt === granted.gmGrant.expiresAt
    && row.schemaVersion === 2
  )), true);
});

test("GM authority fails closed on expiry and user or command binding drift", () => {
  let nowMs = Date.parse("2026-07-12T08:00:00.000Z");
  const store = createMemoryAuthStore();
  const service = createAuthService({store, now: () => nowMs});
  const registered = service.register({username: "gmbindingstrict", password: "test1234"});
  const token = registered.session.token;
  assert.equal(service.grantGm({
    username: "gmbindingstrict",
    commandIds: ["gm_map"],
    policyId: TEST_GM_POLICY_ID,
    expiresAt: "2026-07-12T09:00:00.000Z",
    grantedBy: "strict_binding_test",
  }).ok, true);
  assert.equal(service.authorizeGmCommand({token, commandId: "gm_map"}).ok, true);

  const authoritative = service.snapshot();
  const accountId = registered.account.accountId;
  const denialFrom = (mutate) => {
    const candidate = structuredClone(authoritative);
    mutate(candidate, accountId);
    const candidateService = createAuthService({
      store: createMemoryAuthStore(candidate),
      now: () => nowMs,
    });
    return {
      access: candidateService.authorizeGmCommand({token, commandId: "gm_map"}),
      tools: candidateService.listGmTools(token, DEFAULT_COMMAND_CATALOG),
    };
  };

  for (const mutate of [
    (candidate) => { candidate.accounts.gmbindingstrict.username = "GmBindingStrict"; },
    (candidate, id) => { candidate.gmUserGrants[id].accountId = "acc_wrong"; },
    (candidate, id) => { candidate.gmUserGrants[id].username = "wrong_user"; },
    (candidate, id) => { candidate.gmUserGrants[id].enabled = false; },
    (candidate, id) => { candidate.gmUserGrants[id].schemaVersion = 1; },
    (candidate, id) => { candidate.gmUserGrants[id].expiresAt = "not-a-time"; },
  ]) {
    const denied = denialFrom(mutate);
    assert.equal(denied.access.code, "gm_denied");
    assert.equal(denied.tools.code, "gm_denied");
  }

  for (const mutate of [
    (candidate, id) => { candidate.gmCommandGrants[id][0].accountId = "acc_wrong"; },
    (candidate, id) => { candidate.gmCommandGrants[id][0].enabled = false; },
    (candidate, id) => { candidate.gmCommandGrants[id][0].schemaVersion = 1; },
    (candidate, id) => { candidate.gmCommandGrants[id][0].expiresAt = "2026-07-12T08:30:00.000Z"; },
    (candidate, id) => { candidate.gmCommandGrants[id][0].policyId = "different_policy_v1"; },
    (candidate, id) => { candidate.gmCommandGrants[id].push({
      ...candidate.gmCommandGrants[id][0],
      commandId: "*",
    }); },
  ]) {
    const denied = denialFrom(mutate);
    assert.equal(denied.access.code, "command_denied");
    assert.deepEqual(denied.tools.commandIds, []);
  }

  nowMs = Date.parse("2026-07-12T09:00:00.000Z");
  assert.equal(service.authorizeGmCommand({token, commandId: "gm_map"}).code, "gm_denied");
  assert.equal(service.listGmTools(token, DEFAULT_COMMAND_CATALOG).code, "gm_denied");
  assert.equal(service.getSession(token).session.effectiveRole, "player");
});

test("legacy GM grants without policy or expiry stay readable but never authorize", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({username: "gmlegacyreadonly", password: "test1234"});
  const snapshot = service.snapshot();
  const accountId = registered.account.accountId;
  snapshot.accounts.gmlegacyreadonly.role = "gm";
  snapshot.gmUserGrants[accountId] = {
    accountId,
    username: "gmlegacyreadonly",
    enabled: true,
    expiresAt: null,
    schemaVersion: 1,
  };
  snapshot.gmCommandGrants[accountId] = [{
    accountId,
    commandId: "gm_map",
    enabled: true,
    schemaVersion: 1,
  }];
  const legacyStore = createMemoryAuthStore(snapshot);
  const restarted = createAuthService({store: legacyStore});
  const before = restarted.snapshot();
  assert.deepEqual(before.gmUserGrants[accountId], snapshot.gmUserGrants[accountId]);
  assert.deepEqual(before.gmCommandGrants[accountId], snapshot.gmCommandGrants[accountId]);
  assert.equal(restarted.getSession(registered.session.token).session.effectiveRole, "player");
  assert.equal(restarted.listGmTools(registered.session.token, DEFAULT_COMMAND_CATALOG).code, "gm_denied");
  assert.deepEqual(restarted.snapshot(), before);
});

test("server restart recovers sessions without stale online positions", () => {
  const store = createMemoryAuthStore();
  let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
  const service = createAuthService({
    "store": store,
    "now": () => nowMs,
  });
  const scout = service.register({"username": "recovera", "password": "test1234", "displayName": "恢复甲"});
  const ranger = service.register({"username": "recoverb", "password": "test1234", "displayName": "恢复乙"});
  assert.equal(scout.ok, true);
  assert.equal(ranger.ok, true);
  assert.equal(service.updatePlayerPosition(scout.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 10,
    "cellY": 10,
    "facing": "east",
    "moving": false,
  }).ok, true);
  assert.equal(service.updatePlayerPosition(ranger.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 11,
    "cellY": 10,
    "facing": "west",
    "moving": false,
  }).ok, true);
  const beforeRestart = service.listOnlinePlayers(scout.session.token);
  assert.equal(beforeRestart.ok, true);
  assert.equal(beforeRestart.players.length, 2);
  assert.equal(beforeRestart.players.find((player) => player.accountId === ranger.account.accountId).position.cellX, 11);

  nowMs += 1000;
  const restarted = createAuthService({
    "store": store,
    "now": () => nowMs,
  });
  const recoveredScout = restarted.getSession(scout.session.token);
  assert.equal(recoveredScout.ok, true);
  assert.equal(recoveredScout.session.recovered, true);
  assert.equal(recoveredScout.session.requiresPositionResync, true);
  assert.equal(recoveredScout.recovery.recovered, true);
  assert.equal(recoveredScout.recovery.hasRuntimePosition, false);
  const scoutOnline = restarted.listOnlinePlayers(scout.session.token);
  assert.equal(scoutOnline.ok, true);
  assert.equal(scoutOnline.players.length, 1);
  assert.equal(scoutOnline.players[0].accountId, scout.account.accountId);
  assert.equal(scoutOnline.players[0].position, null);

  const recoveredRanger = restarted.getSession(ranger.session.token);
  assert.equal(recoveredRanger.ok, true);
  assert.equal(recoveredRanger.session.recovered, true);
  const bothOnline = restarted.listOnlinePlayers(scout.session.token);
  assert.equal(bothOnline.ok, true);
  assert.equal(bothOnline.players.length, 2);
  assert.equal(bothOnline.players.find((player) => player.accountId === scout.account.accountId).position, null);
  assert.equal(bothOnline.players.find((player) => player.accountId === ranger.account.accountId).position, null);
});

test("server startup bounds legacy terminal session history before any account login", () => {
  const nowMs = Date.parse("2026-07-13T00:00:00.000Z");
  const seedService = createAuthService({
    store: createMemoryAuthStore(),
    now: () => nowMs,
  });
  const registered = seedService.register({
    username: "legacyhistory",
    password: "test1234",
    displayName: "历史会话玩家",
  });
  assert.equal(registered.ok, true);

  const legacyData = seedService.snapshot();
  const accountId = registered.account.accountId;
  for (let index = 0; index < 100; index += 1) {
    const sessionId = `legacy_revoked_${String(index).padStart(3, "0")}`;
    legacyData.sessions[sessionId] = {
      sessionId,
      accountId,
      tokenHash: `legacy_hash_${index}`,
      createdAt: new Date(Date.parse("2025-01-01T00:00:00.000Z") - index * 1000).toISOString(),
      expiresAt: "2025-01-08T00:00:00.000Z",
      revokedAt: "2025-01-02T00:00:00.000Z",
      schemaVersion: 1,
    };
  }
  legacyData.sessions.legacy_expired_unrevoked = {
    sessionId: "legacy_expired_unrevoked",
    accountId,
    tokenHash: "legacy_expired_hash",
    createdAt: "2024-01-01T00:00:00.000Z",
    expiresAt: "2024-01-08T00:00:00.000Z",
    revokedAt: null,
    schemaVersion: 1,
  };
  legacyData.sessions.legacy_refreshable_unrevoked = {
    sessionId: "legacy_refreshable_unrevoked",
    accountId,
    tokenHash: "legacy_refreshable_hash",
    createdAt: "2024-01-02T00:00:00.000Z",
    expiresAt: "2026-07-12T00:00:00.000Z",
    revokedAt: null,
    schemaVersion: 1,
  };

  const legacyStore = createMemoryAuthStore(legacyData);
  const restarted = createAuthService({
    store: legacyStore,
    now: () => nowMs,
  });
  const restartedSessions = restarted.snapshot().sessions;
  assert.equal(Object.keys(restartedSessions).length, 9);
  assert.equal(Boolean(restartedSessions[registered.session.sessionId]), true);
  assert.equal(Boolean(restartedSessions.legacy_expired_unrevoked), false);
  assert.equal(Boolean(restartedSessions.legacy_refreshable_unrevoked), true);
  assert.equal(restarted.getSession(registered.session.token).ok, true);

  const unrelatedWrite = restarted.register({
    username: "historywriter",
    password: "test1234",
    displayName: "无关写入玩家",
  });
  assert.equal(unrelatedWrite.ok, true);
  assert.equal(Object.keys(legacyStore.load().sessions).length, 10);
  assert.equal(Boolean(legacyStore.load().sessions.legacy_expired_unrevoked), false);
});

test("duel battle close writes back active hang session", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const challenger = service.register({"username": "duelhangwin", "password": "test1234", "displayName": "切磋甲"});
  const opponent = service.register({"username": "duelhanglow", "password": "test1234", "displayName": "切磋乙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  const challengerProfile = battleProfile("切磋甲", {"level": 20, "hp": 180, "maxHp": 180, "attack": 999, "defense": 20, "quick": 100, "comboRateOverride": 0});
  const opponentProfile = battleProfile("切磋乙", {"level": 5, "hp": 25, "maxHp": 120, "attack": 5, "defense": 1, "quick": 40, "comboRateOverride": 0});
  opponentProfile.hangSettings = {"lowHpStopPercent": 50, "lowHpAction": "town_heal", "resumeAfterHeal": true, "captureTargetCount": 0};
  opponentProfile.hangSession = {"enabled": true, "mode": "walk", "battleCount": 4, "captureSuccessCount": 0};
  assert.equal(service.saveProfile(challenger.session.token, {"expectedRevision": 0, "profile": challengerProfile}).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {"expectedRevision": 0, "profile": opponentProfile}).ok, true);
  service.updatePlayerPosition(challenger.session.token, {"mapId": "village", "cellX": 10, "cellY": 10, "facing": "east", "moving": false});
  service.updatePlayerPosition(opponent.session.token, {"mapId": "village", "cellX": 11, "cellY": 10, "facing": "west", "moving": false});

  const invite = service.inviteToBattle(challenger.session.token, {"username": "duelhanglow"});
  const accept = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  const resolved = service.leaveBattleRoom(challenger.session.token, accept.room.roomId);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.room.status, "closed");
  const writeback = service.getBattleState(opponent.session.token).room.battle.profileWriteback.profiles
    .find((entry) => entry.accountId === opponent.account.accountId);
  assert.equal(writeback.hang.enabled, false);
  assert.equal(writeback.hang.battleCount, 5);
  assert.equal(writeback.hang.lastStopReason, "low_hp");
  assert.equal(writeback.hang.pendingResume, true);

  const after = service.getProfile(opponent.session.token);
  assert.equal(after.ok, true);
  assert.equal(after.profile.hangSession.enabled, false);
  assert.equal(after.profile.hangSession.battleCount, 5);
  assert.equal(after.profile.hangSession.lastStopReason, "low_hp");
  assert.equal(after.profile.hangSession.pendingResume, true);
});

test("party pve victory advances auto-claim battle quest and hang session", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const solo = service.register({"username": "pvequestone", "password": "test1234", "displayName": "任务玩家"});
  assert.equal(solo.ok, true);
  const profile = battleProfile("任务玩家", {"level": 8, "hp": 140, "maxHp": 140, "attack": 999, "defense": 20, "quick": 200, "comboRateOverride": 0}, {
    "petId": "quest_pet",
    "name": "任务布伊",
    "level": 8,
    "hp": 100,
    "maxHp": 100,
    "attack": 1,
    "defense": 10,
    "quick": 80,
    "comboRateOverride": 0,
  });
  profile.stoneCoins = 11;
  profile.backpackSlots = [];
  profile.activeQuestId = "quest_first_victory";
  profile.questStates = {"quest_first_victory": {"questId": "quest_first_victory", "status": "active", "progress": 0}};
  profile.hangSettings = {"captureTargetCount": 0};
  profile.hangSession = {"enabled": true, "mode": "walk", "battleCount": 2, "captureSuccessCount": 0};
  assert.equal(service.saveProfile(solo.session.token, {"expectedRevision": 0, "profile": profile}).ok, true);

  const encounter = service.startPartyEncounter(solo.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "quest_grass",
      "name": "任务草丛",
      "encounterGroupId": "firebud_grass_01",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "任务乌力",
        "level": 1,
        "battleStats": {"maxHp": 1, "attack": 1, "defense": 1, "quick": 1},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const player = encounter.room.battle.actors.find((actor) => actor.accountId === solo.account.accountId && actor.kind === "player");
  const pet = encounter.room.battle.actors.find((actor) => actor.accountId === solo.account.accountId && actor.kind === "pet");
  const enemy = encounter.room.battle.actors.find((actor) => actor.side === "enemy");
  assert.equal(Boolean(player && pet && enemy), true);
  assert.equal(service.submitBattleCommand(solo.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": player.actorId,
    "actionId": "attack",
    "targetActorId": enemy.actorId,
  }).turn, null);
  const resolved = service.submitBattleCommand(solo.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": pet.actorId,
    "actionId": "pet_defend",
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.room.status, "closed");
  const writeback = resolved.room.battle.profileWriteback.profiles.find((entry) => entry.accountId === solo.account.accountId);
  assert.equal(Boolean(writeback && writeback.quests), true);
  assert.equal(writeback.quests.claimed.some((entry) => entry.questId === "quest_first_victory"), true);
  assert.equal(writeback.quests.activeQuestId, "quest_open_auto_settings");
  assert.equal(writeback.hang.battleCount, 3);

  const after = service.getProfile(solo.session.token);
  assert.equal(after.ok, true);
  assert.equal(after.profile.questStates.quest_first_victory.status, "claimed");
  assert.equal(after.profile.activeQuestId, "quest_open_auto_settings");
  assert.equal(after.profile.hangSession.battleCount, 3);
  assert.equal(after.profile.stoneCoins, 11 + writeback.rewards.stoneCoins + 30);
  const healCount = (after.profile.backpackSlots || []).reduce((sum, slot) => (
    sum + (slot && slot.itemId === "item_heal_single_5" ? Number(slot.count || 0) : 0)
  ), 0);
  assert.equal(healCount >= 1, true);
  const record = service.snapshot().battleRecords.find((entry) => entry.roomId === encounter.room.roomId);
  assert.equal(Boolean(record && record.profileWriteback.profiles[0].quests), true);
});

test("hang session endpoints start encounter stone and stop server-side", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const player = service.register({"username": "hangstoneone", "password": "test1234", "displayName": "遇敌石玩家"});
  assert.equal(player.ok, true);
  const profile = battleProfile("遇敌石玩家", {"level": 5, "hp": 120, "maxHp": 120});
  profile.backpackSlots = [{"itemId": "encounter_stone_low", "count": 1}];
  profile.hangSettings = {"captureTargetCount": 0};
  profile.hangSession = {"enabled": false, "mode": "", "battleCount": 4, "captureSuccessCount": 1};
  assert.equal(service.saveProfile(player.session.token, {"expectedRevision": 0, "profile": profile}).ok, true);

  const started = service.startHangSession(player.session.token, {
    "mode": "encounter_stone",
    "itemId": "encounter_stone_low",
    "mapId": "firebud_village_gate",
    "originCell": [11, 15],
    "settings": {"lowHpStopPercent": 30, "lowHpAction": "town_heal", "resumeAfterHeal": true, "captureTargetCount": 2},
  });
  assert.equal(started.ok, true);
  assert.equal(started.profile.hangSession.enabled, true);
  assert.equal(started.profile.hangSession.mode, "encounter_stone");
  assert.deepEqual(started.profile.hangSession.originCell, [11, 15]);
  assert.equal(started.profile.hangSession.battleCount, 4);
  assert.equal(started.profile.hangSession.captureSuccessCount, 1);
  assert.equal(started.profile.hangSettings.captureTargetCount, 2);
  assert.equal(profileItemCount(started.profile, "encounter_stone_low"), 0);

  const stopped = service.stopHangSession(player.session.token, {"reason": "manual"});
  assert.equal(stopped.ok, true);
  assert.equal(stopped.profile.hangSession.enabled, false);
  assert.equal(stopped.profile.hangSession.lastStopReason, "manual");

  const leader = service.register({"username": "hangstoneleader", "password": "test1234", "displayName": "遇敌石队长"});
  const member = service.register({"username": "hangstonemember", "password": "test1234", "displayName": "遇敌石队员"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  const memberProfile = battleProfile("遇敌石队员", {"level": 5, "hp": 120, "maxHp": 120});
  memberProfile.backpackSlots = [{"itemId": "encounter_stone_low", "count": 1}];
  memberProfile.hangSession = {"enabled": false, "mode": "", "battleCount": 0, "captureSuccessCount": 0};
  assert.equal(service.saveProfile(member.session.token, {"expectedRevision": 0, "profile": memberProfile}).ok, true);
  const invite = service.inviteToParty(leader.session.token, {"username": "hangstonemember"});
  assert.equal(invite.ok, true);
  assert.equal(service.acceptPartyInvite(member.session.token, invite.invite.inviteId).ok, true);

  const memberStarted = service.startHangSession(member.session.token, {
    "mode": "encounter_stone",
    "itemId": "encounter_stone_low",
    "mapId": "firebud_village_gate",
    "originCell": [11, 15],
  });
  assert.equal(memberStarted.ok, false);
  assert.equal(memberStarted.code, "hang_party_leader_required");
  const memberAfter = service.getProfile(member.session.token);
  assert.equal(memberAfter.ok, true);
  assert.equal(profileItemCount(memberAfter.profile, "encounter_stone_low"), 1);
  assert.equal(memberAfter.profile.hangSession.enabled, false);

  const memberWalkStarted = service.startHangSession(member.session.token, {
    "mode": "walk",
    "mapId": "firebud_village_gate",
    "originCell": [11, 15],
  });
  assert.equal(memberWalkStarted.ok, false);
  assert.equal(memberWalkStarted.code, "hang_party_leader_required");
  const memberWalkAfter = service.getProfile(member.session.token);
  assert.equal(memberWalkAfter.ok, true);
  assert.equal(profileItemCount(memberWalkAfter.profile, "encounter_stone_low"), 1);
  assert.equal(memberWalkAfter.profile.hangSession.enabled, false);
});
