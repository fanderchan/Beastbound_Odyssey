"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const {
  createAsyncWriteAuthStore,
  createAuthService,
  createMemoryAuthStore,
} = require("../src/auth-service");
const {
  createPresenceRevisionTracker,
} = require("../src/auth/online-presence");

const DAY_MS = 24 * 60 * 60 * 1000;

test("cluster ingress identity is read-only and refresh grace is explicit", () => {
  let nowMs = Date.UTC(2026, 7, 15, 0, 0, 0);
  const presenceRevisions = createPresenceRevisionTracker();
  const service = createAuthService({
    store: createMemoryAuthStore(),
    now: () => nowMs,
    presenceRevisionTracker: presenceRevisions,
  });
  const registered = service.register({
    username: "clusteruser",
    password: "cluster123",
    displayName: "集群玩家",
  });
  assert.equal(registered.ok, true);
  const token = registered.session.token;
  const accountId = registered.account.accountId;

  const before = JSON.stringify(service.snapshot());
  assert.deepEqual(service._clusterIngressIdentity(token), {
    ok: true,
    accountId,
    sessionId: registered.session.sessionId,
    playerId: "",
    selectionEpoch: 0,
  });
  assert.equal(JSON.stringify(service.snapshot()), before);
  assert.equal(service._clusterIngressIdentity("invalid").ok, false);

  nowMs += 7 * DAY_MS + 1;
  assert.equal(service._clusterIngressIdentity(token).code, "session_expired");
  assert.equal(service._clusterIngressIdentity(token, {allowRefreshGrace: true}).ok, true);
  nowMs += 7 * DAY_MS;
  assert.equal(
    service._clusterIngressIdentity(token, {allowRefreshGrace: true}).code,
    "session_refresh_expired",
  );

  assert.equal(
    service._adoptClusterPresenceRevisionFloor(
      accountId,
      2_000_000_000,
      2_999_999_999,
    ),
    2_000_000_000,
  );
  assert.equal(presenceRevisions.current(accountId), 2_000_000_000);
  assert.equal(presenceRevisions.next(accountId), 2_000_000_001);
});

test("cluster login identity is returned only after the derived credential matches", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({
    username: "loginowner",
    password: "ownerpass123",
    displayName: "归属玩家",
  });
  assert.equal(registered.ok, true);
  const verification = service._httpPasswordVerificationRecord("loginowner");
  const correctHash = crypto.scryptSync(
    "ownerpass123",
    verification.salt,
    32,
  ).toString("hex");
  const wrongHash = crypto.scryptSync(
    "wrongpass123",
    verification.salt,
    32,
  ).toString("hex");

  assert.deepEqual(service._httpClusterLoginIdentity("loginowner", correctHash), {
    ok: true,
    accountId: registered.account.accountId,
  });
  assert.deepEqual(service._httpClusterLoginIdentity("loginowner", wrongHash), {ok: false});
  assert.deepEqual(service._httpClusterLoginIdentity("missing", correctHash), {ok: false});
});

test("a stale node exact-reads a new session and reloads authority before first ownership", async () => {
  const nowMs = Date.UTC(2026, 7, 15, 1, 0, 0);
  const backing = createMemoryAuthStore();
  const stale = backing.load();
  const staleNode = createAuthService({
    store: createAsyncWriteAuthStore(backing),
    initialData: stale,
    now: () => nowMs,
  });
  const writer = createAuthService({store: backing, now: () => nowMs});
  const registered = writer.register({
    username: "latecluster",
    password: "latepass123",
    displayName: "迟到账号",
  });
  assert.equal(registered.ok, true);
  assert.equal(staleNode.snapshot().accounts.latecluster, undefined);

  const identity = await staleNode._clusterIngressIdentity(registered.session.token);
  assert.deepEqual(identity, {
    ok: true,
    accountId: registered.account.accountId,
    sessionId: registered.session.sessionId,
    playerId: "",
    selectionEpoch: 0,
  });
  assert.equal(staleNode.getSession(registered.session.token).ok, false);
  assert.equal(staleNode._clusterAccountRecoveryMetrics().pendingAuthorityReloads, 1);

  const adopted = await staleNode._adoptClusterAccountOwner(
    registered.account.accountId,
    1_000_000_000,
    1_999_999_999,
    {acquired: true, generation: 1},
  );
  assert.equal(adopted, 1_000_000_000);
  assert.equal(staleNode.getSession(registered.session.token).ok, true);
  assert.deepEqual(staleNode._clusterAccountRecoveryMetrics(), {
    authorityReloads: 1,
    pendingAuthorityReloads: 0,
    runtimeResets: 0,
  });
});

test("store-backed login proof admits only the matching digest and reloads the account", async () => {
  const nowMs = Date.UTC(2026, 7, 15, 2, 0, 0);
  const backing = createMemoryAuthStore();
  const staleNode = createAuthService({
    store: createAsyncWriteAuthStore(backing),
    initialData: backing.load(),
    now: () => nowMs,
  });
  const writer = createAuthService({store: backing, now: () => nowMs});
  const registered = writer.register({
    username: "latelogin",
    password: "loginpass123",
    displayName: "迟到登录",
  });
  const proof = await staleNode._httpClusterPasswordVerificationRecord("latelogin");
  const correctHash = crypto.scryptSync("loginpass123", proof.salt, 32).toString("hex");
  const wrongHash = crypto.scryptSync("wrongpass123", proof.salt, 32).toString("hex");
  assert.deepEqual(staleNode._httpClusterLoginIdentity("latelogin", wrongHash, proof), {ok: false});
  assert.equal(staleNode._clusterAccountRecoveryMetrics().pendingAuthorityReloads, 0);
  assert.deepEqual(staleNode._httpClusterLoginIdentity("latelogin", correctHash, proof), {
    ok: true,
    accountId: registered.account.accountId,
  });
  assert.equal(staleNode._clusterAccountRecoveryMetrics().pendingAuthorityReloads, 1);
  await staleNode._adoptClusterAccountOwner(
    registered.account.accountId,
    1_000_000_000,
    1_999_999_999,
    {acquired: true, generation: 1},
  );
  assert.equal(staleNode.snapshot().accounts.latelogin.accountId, registered.account.accountId);
});

test("exact credential proof supersedes a stale local password document", async () => {
  const nowMs = Date.UTC(2026, 7, 15, 2, 30, 0);
  const backing = createMemoryAuthStore();
  const writer = createAuthService({store: backing, now: () => nowMs});
  const registered = writer.register({
    username: "changedlogin",
    password: "oldpass123",
    displayName: "改密账号",
  });
  const staleNode = createAuthService({
    store: createAsyncWriteAuthStore(backing),
    initialData: backing.load(),
    now: () => nowMs,
  });
  const staleRecord = staleNode._httpPasswordVerificationRecord("changedlogin");
  const latest = backing.load();
  const newSalt = "e".repeat(32);
  latest.accounts.changedlogin.passwordSalt = newSalt;
  latest.accounts.changedlogin.passwordHash = crypto
    .scryptSync("newpass123", newSalt, 32)
    .toString("hex");
  backing.save(latest);

  const proof = await staleNode._httpClusterPasswordVerificationRecord("changedlogin");
  assert.equal(proof.source, "store");
  assert.equal(proof.salt, newSalt);
  const staleHash = crypto.scryptSync("oldpass123", staleRecord.salt, 32).toString("hex");
  const currentHash = crypto.scryptSync("newpass123", proof.salt, 32).toString("hex");
  assert.deepEqual(
    staleNode._httpClusterLoginIdentity("changedlogin", staleHash, proof),
    {ok: false},
  );
  assert.deepEqual(
    staleNode._httpClusterLoginIdentity("changedlogin", currentHash, proof),
    {ok: true, accountId: registered.account.accountId},
  );
  assert.equal(staleNode._clusterAccountRecoveryMetrics().pendingAuthorityReloads, 1);
});

test("a current exact proof skips generation-one reload but takeover generation still forces it", async () => {
  const nowMs = Date.UTC(2026, 7, 15, 2, 45, 0);
  const backing = createMemoryAuthStore();
  const writer = createAuthService({store: backing, now: () => nowMs});
  const registered = writer.register({
    username: "currentproof",
    password: "currentpass123",
    displayName: "当前基线",
  });
  const currentStore = {
    ...backing,
    readClusterLoginCredential(username) {
      return {...backing.readClusterLoginCredential(username), authorityCurrent: true};
    },
    readClusterSessionIdentity(tokenHash) {
      return {...backing.readClusterSessionIdentity(tokenHash), authorityCurrent: true};
    },
  };
  const service = createAuthService({
    store: currentStore,
    initialData: backing.load(),
    now: () => nowMs,
  });
  const proof = await service._httpClusterPasswordVerificationRecord("currentproof");
  const passwordHash = crypto.scryptSync("currentpass123", proof.salt, 32).toString("hex");
  assert.equal(proof.authorityCurrent, true);
  assert.deepEqual(service._httpClusterLoginIdentity("currentproof", passwordHash, proof), {
    ok: true,
    accountId: registered.account.accountId,
  });
  assert.equal(service._clusterAccountRecoveryMetrics().pendingAuthorityReloads, 0);
  await service._adoptClusterAccountOwner(
    registered.account.accountId,
    1_000_000_000,
    1_999_999_999,
    {acquired: true, generation: 1},
  );
  assert.equal(service._clusterAccountRecoveryMetrics().authorityReloads, 0);
  await service._adoptClusterAccountOwner(
    registered.account.accountId,
    2_000_000_000,
    2_999_999_999,
    {acquired: true, generation: 2},
  );
  assert.equal(service._clusterAccountRecoveryMetrics().authorityReloads, 1);
});

test("generation takeover reloads persistent party and profile facts before admission", async () => {
  const nowMs = Date.UTC(2026, 7, 15, 3, 0, 0);
  const backing = createMemoryAuthStore();
  const writer = createAuthService({
    autoCreateInitialCharacterForTests: true,
    store: backing,
    now: () => nowMs,
  });
  const registered = writer.register({
    username: "takeoverfacts",
    password: "takeover123",
    displayName: "接管事实",
  });
  const staleNode = createAuthService({
    store: createAsyncWriteAuthStore(backing),
    initialData: backing.load(),
    now: () => nowMs,
  });
  const latest = backing.load();
  const binding = latest.profileBindings[registered.account.accountId];
  latest.profiles[binding.playerId].profile.player.name = "接管后的名字";
  latest.profiles[binding.playerId].profileRevision += 1;
  latest.profileBindings[registered.account.accountId].profileRevision += 1;
  latest.parties.party_takeover_facts = {
    partyId: "party_takeover_facts",
    leaderAccountId: registered.account.accountId,
    memberAccountIds: [registered.account.accountId],
    createdAt: new Date(nowMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
    schemaVersion: 1,
  };
  backing.save(latest);

  assert.equal(staleNode.snapshot().profiles[binding.playerId].profile.player.name, "接管事实");
  await staleNode._adoptClusterAccountOwner(
    registered.account.accountId,
    2_000_000_000,
    2_999_999_999,
    {acquired: true, generation: 2},
  );
  const adopted = staleNode.snapshot();
  assert.equal(adopted.profiles[binding.playerId].profile.player.name, "接管后的名字");
  assert.equal(
    adopted.parties.party_takeover_facts.leaderAccountId,
    registered.account.accountId,
  );
  assert.equal(staleNode._clusterAccountRecoveryMetrics().authorityReloads, 1);
});
