"use strict";

const {
  assert,
  test,
  once,
  createAuthService,
  createMemoryAuthStore,
  createAsyncWriteAuthStore,
  createHttpServer,
  fetchJson,
  profileItemCount,
} = require("../test-support/auth-service-test-context");
const {
  QA_CORE_ITEMS,
} = require("../src/auth/gm-qa-profile");

const COMMAND_ID = "gm_prepare_qa_profile";
const MANIFEST_ID = "qa_core_v1";

function registerGm(service, username, commandIds = [COMMAND_ID]) {
  const registered = service.register({username, password: "test1234", displayName: username});
  assert.equal(registered.ok, true);
  assert.equal(service.grantGm({
    username,
    commandIds,
    policyId: "test_explicit_gm_v1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    grantedBy: "gm_qa_profile_test",
  }).ok, true);
  return registered;
}

function currentProfile(service, token) {
  const result = service.getProfile(token);
  assert.equal(result.ok, true);
  return result;
}

test("GM QA profile command enforces current-account grants and exact payloads", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const player = service.register({username: "qaprofileplayer", password: "test1234"});
  const before = currentProfile(service, player.session.token);

  const playerDenied = service.prepareGmQaProfile(player.session.token, {manifestId: MANIFEST_ID});
  assert.equal(playerDenied.ok, false);
  assert.equal(playerDenied.code, "gm_denied");
  const repeatedDenial = service.prepareGmQaProfile(player.session.token, {manifestId: MANIFEST_ID});
  assert.equal(repeatedDenial.code, "gm_denied");
  assert.equal(service.snapshot().gmCommandAudit.length, 1);

  assert.equal(service.grantGm({
    username: "qaprofileplayer",
    commandIds: ["gm_map"],
    policyId: "test_explicit_gm_v1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    grantedBy: "gm_qa_profile_test",
  }).ok, true);
  const commandDenied = service.prepareGmQaProfile(player.session.token, {manifestId: MANIFEST_ID});
  assert.equal(commandDenied.ok, false);
  assert.equal(commandDenied.code, "command_denied");
  assert.equal(service.snapshot().gmCommandAudit.length, 2);

  assert.equal(service.grantGm({
    username: "qaprofileplayer",
    commandIds: [COMMAND_ID],
    policyId: "test_explicit_gm_v1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    grantedBy: "gm_qa_profile_test",
  }).ok, true);
  const targetInjection = service.prepareGmQaProfile(player.session.token, {
    manifestId: MANIFEST_ID,
    targetUsername: "someone_else",
  });
  assert.equal(targetInjection.ok, false);
  assert.equal(targetInjection.code, "gm_qa_profile_payload_invalid");
  const wrongManifest = service.prepareGmQaProfile(player.session.token, {manifestId: "qa_core_v2"});
  assert.equal(wrongManifest.ok, false);
  assert.equal(wrongManifest.code, "gm_qa_profile_payload_invalid");

  const after = currentProfile(service, player.session.token);
  assert.equal(after.profileSummary.profileRevision, before.profileSummary.profileRevision);
  assert.deepEqual(after.profile, before.profile);
  assert.equal(service.prepareGmQaProfile("", {manifestId: MANIFEST_ID}).code, "session_missing");
  assert.equal(service.snapshot().gmCommandAudit.filter((row) => row.username === "").length, 0);

  const wildcardGm = service.register({username: "qaprofilewildcard", password: "test1234"});
  assert.equal(wildcardGm.ok, true);
  const wildcardGrant = service.grantGm({
    username: "qaprofilewildcard",
    commandIds: ["*"],
    policyId: "test_explicit_gm_v1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    grantedBy: "gm_qa_profile_test",
  });
  assert.equal(wildcardGrant.ok, false);
  assert.equal(wildcardGrant.code, "gm_grant_commands_invalid");
  assert.equal(
    service.prepareGmQaProfile(wildcardGm.session.token, {manifestId: MANIFEST_ID}).code,
    "gm_denied",
  );
});

test("GM QA core manifest tops up once and preserves values already above its targets", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(service, "qaprofileensure");
  const first = service.prepareGmQaProfile(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(first.ok, true);
  assert.deepEqual(first.result.summary, {
    manifestId: MANIFEST_ID,
    changed: true,
    alreadyCurrent: false,
    profileRevisionBefore: 0,
    profileRevisionAfter: 1,
    stoneCoins: 1000000,
    diamonds: 100000,
    backpackExtraSlots: 5,
    itemKinds: 15,
    itemQuantity: 330,
    schemaVersion: 1,
  });
  assert.equal(first.profile.backpackSlots.length, 20);
  for (const entry of QA_CORE_ITEMS) {
    assert.equal(profileItemCount(first.profile, entry.itemId), entry.count);
    const stacks = first.profile.backpackSlots.filter((slot) => slot && slot.itemId === entry.itemId);
    assert.equal(stacks.length, 1);
    assert.equal(stacks[0].count, entry.count);
  }
  assert.deepEqual(first.profile.captureTools, {
    capture_rope_basic: 20,
    capture_net: 20,
    capture_net_reinforced: 20,
    capture_poison_wuli_net: 20,
  });

  const second = service.prepareGmQaProfile(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(second.ok, true);
  assert.equal(second.result.summary.changed, false);
  assert.equal(second.result.summary.alreadyCurrent, true);
  assert.equal(second.result.summary.profileRevisionBefore, 1);
  assert.equal(second.result.summary.profileRevisionAfter, 1);
  assert.equal(second.result.delta.itemQuantityAdded, 0);

  const above = structuredClone(second.profile);
  above.stoneCoins = 2000000;
  above.diamonds = 200000;
  above.backpackSlots[0].count = 60;
  above.futureQaProfileCanary = {schemaVersion: 99, opaque: "keep"};
  const saved = service.saveProfile(gm.session.token, {
    expectedRevision: second.profileSummary.profileRevision,
    profile: above,
  });
  assert.equal(saved.ok, true);
  const preserved = service.prepareGmQaProfile(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(preserved.ok, true);
  assert.equal(preserved.result.summary.changed, false);
  assert.equal(preserved.result.summary.stoneCoins, 2000000);
  assert.equal(preserved.result.summary.diamonds, 200000);
  assert.equal(profileItemCount(preserved.profile, "item_meat_small"), 60);
  assert.equal(preserved.result.summary.profileRevisionBefore, saved.profileSummary.profileRevision);
  assert.equal(preserved.result.summary.profileRevisionAfter, saved.profileSummary.profileRevision);
  const audit = service.snapshot().gmCommandAudit.at(-1);
  assert.equal(audit.details.manifestId, MANIFEST_ID);
  assert.equal(audit.details.targetAccountId, gm.account.accountId);
  assert.equal(audit.details.changed, false);
  const snapshot = service.snapshot();
  const binding = snapshot.profileBindings[gm.account.accountId];
  assert.deepEqual(snapshot.profiles[binding.playerId].profile.futureQaProfileCanary, {
    schemaVersion: 99,
    opaque: "keep",
  });
});

test("GM QA profile preparation is atomic when the expanded backpack is full", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(service, "qaprofilefull");
  const current = currentProfile(service, gm.session.token);
  const fullProfile = structuredClone(current.profile);
  fullProfile.backpackExtraSlots = 5;
  fullProfile.backpackSlots = Array.from({length: 20}, () => ({itemId: "tutorial_worn_hide", count: 20}));
  const saved = service.saveProfile(gm.session.token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile: fullProfile,
  });
  assert.equal(saved.ok, true);
  const before = currentProfile(service, gm.session.token);

  const blocked = service.prepareGmQaProfile(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "gm_qa_profile_capacity_full");
  const after = currentProfile(service, gm.session.token);
  assert.equal(after.profileSummary.profileRevision, before.profileSummary.profileRevision);
  assert.deepEqual(after.profile, before.profile);
});

test("GM QA preparation fails closed without deleting unknown capture-tool state", () => {
  const seed = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(seed, "qaprofilefuturetool");
  const snapshot = seed.snapshot();
  const binding = snapshot.profileBindings[gm.account.accountId];
  snapshot.profiles[binding.playerId].profile.captureTools.future_capture_tool_v99 = 7;
  const beforeProfile = structuredClone(snapshot.profiles[binding.playerId].profile);
  const beforeRevision = snapshot.profileBindings[gm.account.accountId].profileRevision;
  const service = createAuthService({store: createMemoryAuthStore(snapshot)});

  const blocked = service.prepareGmQaProfile(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "backpack_item_unknown");
  const after = service.snapshot();
  assert.equal(after.profileBindings[gm.account.accountId].profileRevision, beforeRevision);
  assert.deepEqual(after.profiles[binding.playerId].profile, beforeProfile);
});

test("GM QA preparation does not recreate a missing or mismatched profile", () => {
  const seed = createAuthService({store: createMemoryAuthStore()});
  const missingGm = registerGm(seed, "qaprofilemissing");
  const mismatchedGm = registerGm(seed, "qaprofilemismatch");
  const brokenRevisionGm = registerGm(seed, "qaprofilebrokenrev");
  const negativeRevisionGm = registerGm(seed, "qaprofilenegrev");
  const snapshot = seed.snapshot();
  const missingBinding = snapshot.profileBindings[missingGm.account.accountId];
  const mismatchedBinding = snapshot.profileBindings[mismatchedGm.account.accountId];
  const brokenRevisionBinding = snapshot.profileBindings[brokenRevisionGm.account.accountId];
  const negativeRevisionBinding = snapshot.profileBindings[negativeRevisionGm.account.accountId];
  delete snapshot.profiles[missingBinding.playerId];
  snapshot.profiles[mismatchedBinding.playerId].accountId = missingGm.account.accountId;
  brokenRevisionBinding.profileRevision = "broken";
  snapshot.profiles[brokenRevisionBinding.playerId].profileRevision = "broken";
  negativeRevisionBinding.profileRevision = -1;
  snapshot.profiles[negativeRevisionBinding.playerId].profileRevision = -2;
  const beforeMissingBinding = structuredClone(snapshot.profileBindings[missingGm.account.accountId]);
  const beforeMismatch = structuredClone(snapshot.profiles[mismatchedBinding.playerId]);
  const beforeBrokenRevision = structuredClone(snapshot.profiles[brokenRevisionBinding.playerId]);
  const beforeNegativeRevision = structuredClone(snapshot.profiles[negativeRevisionBinding.playerId]);
  const service = createAuthService({store: createMemoryAuthStore(snapshot)});

  const missing = service.prepareGmQaProfile(missingGm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "profile_missing");
  const mismatched = service.prepareGmQaProfile(mismatchedGm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.code, "profile_binding_conflict");
  const brokenRevision = service.prepareGmQaProfile(brokenRevisionGm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(brokenRevision.ok, false);
  assert.equal(brokenRevision.code, "profile_binding_conflict");
  const negativeRevision = service.prepareGmQaProfile(negativeRevisionGm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(negativeRevision.ok, false);
  assert.equal(negativeRevision.code, "profile_binding_conflict");

  const after = service.snapshot();
  assert.deepEqual(after.profileBindings[missingGm.account.accountId], beforeMissingBinding);
  assert.equal(Object.hasOwn(after.profiles, missingBinding.playerId), false);
  assert.deepEqual(after.profiles[mismatchedBinding.playerId], beforeMismatch);
  assert.deepEqual(after.profiles[brokenRevisionBinding.playerId], beforeBrokenRevision);
  assert.deepEqual(after.profiles[negativeRevisionBinding.playerId], beforeNegativeRevision);
});

test("GM authorization denial audit is unauthenticated-safe, rate-limited, and bounded", () => {
  let nowMs = Date.parse("2026-07-12T00:00:00.000Z");
  const service = createAuthService({
    store: createMemoryAuthStore(),
    now: () => nowMs,
    gmDenialAuditWindowMs: 60000,
    gmDenialAuditMaxKeys: 2,
  });
  const alpha = service.register({username: "qadenialalpha", password: "test1234"});
  const beta = service.register({username: "qadenialbeta", password: "test1234"});
  const gamma = service.register({username: "qadenialgamma", password: "test1234"});

  assert.equal(service.prepareGmQaProfile("", {manifestId: MANIFEST_ID}).code, "session_missing");
  assert.equal(service.snapshot().gmCommandAudit.length, 0);
  assert.equal(service.prepareGmQaProfile(alpha.session.token, {manifestId: MANIFEST_ID}).code, "gm_denied");
  assert.equal(service.prepareGmQaProfile(alpha.session.token, {manifestId: MANIFEST_ID}).code, "gm_denied");
  assert.equal(service.snapshot().gmCommandAudit.length, 1);
  nowMs += 60000;
  assert.equal(service.prepareGmQaProfile(alpha.session.token, {manifestId: MANIFEST_ID}).code, "gm_denied");
  assert.equal(service.snapshot().gmCommandAudit.length, 2);

  assert.equal(service.prepareGmQaProfile(beta.session.token, {manifestId: MANIFEST_ID}).code, "gm_denied");
  assert.equal(service.prepareGmQaProfile(gamma.session.token, {manifestId: MANIFEST_ID}).code, "gm_denied");
  assert.equal(service.snapshot().gmCommandAudit.length, 4);
  assert.equal(service.prepareGmQaProfile(alpha.session.token, {manifestId: MANIFEST_ID}).code, "gm_denied");
  assert.equal(service.snapshot().gmCommandAudit.length, 5);
});

test("HTTP GM QA preparation requires a key, commits once, and converges across new keys", async (t) => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const gm = registerGm(seed, "httpqaprofile", [COMMAND_ID, "gm_market_tax"]);
  const otherGm = registerGm(seed, "httpqaprofileother", [COMMAND_ID]);
  const player = seed.register({username: "httpqaplayer", password: "test1234"});
  let saveCount = 0;
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      saveCount += 1;
      base.save(nextData);
    },
  }, {onError: () => {}});
  const service = createAuthService({store});
  const server = createHttpServer({service, store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await service.waitForDurableIdle();
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const endpoint = `${baseUrl}/gm/commands/${COMMAND_ID}`;
  const body = JSON.stringify({manifestId: MANIFEST_ID});

  const missingKey = await fetchJson(endpoint, {
    method: "POST",
    headers: {authorization: `Bearer ${gm.session.token}`},
    body,
  });
  assert.equal(missingKey.ok, false);
  assert.equal(missingKey.code, "idempotency_key_required");
  assert.equal(saveCount, 0);

  const invalidKey = await fetchJson(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${gm.session.token}`,
      "Idempotency-Key": "bad key",
    },
    body,
  });
  assert.equal(invalidKey.ok, false);
  assert.equal(invalidKey.code, "idempotency_key_invalid");
  assert.equal(saveCount, 0);

  const deniedHeaders = {
    authorization: `Bearer ${player.session.token}`,
    "Idempotency-Key": "bbo_gm_qa_denied_0001",
  };
  const denied = await fetchJson(endpoint, {method: "POST", headers: deniedHeaders, body});
  const deniedReplay = await fetchJson(endpoint, {method: "POST", headers: deniedHeaders, body});
  assert.equal(denied.code, "gm_denied");
  assert.equal(deniedReplay.code, "gm_denied");
  assert.equal(base.load().gmCommandAudit.filter((row) => row.username === "httpqaplayer").length, 1);

  const operationId = "bbo_gm_qa_prepare_0001";
  const headers = {
    authorization: `Bearer ${gm.session.token}`,
    "Idempotency-Key": operationId,
  };
  const first = await fetchJson(endpoint, {method: "POST", headers, body});
  assert.equal(first.ok, true);
  assert.equal(first.result.summary.changed, true);
  assert.equal(first.durableCommit.operationId, operationId);
  assert.equal(first.durableCommit.replayed, false);
  const savesAfterFirst = saveCount;
  const revisionAfterFirst = first.profileSummary.profileRevision;
  const firstAuditId = first.auditId;

  const replay = await fetchJson(endpoint, {method: "POST", headers, body});
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.auditId, firstAuditId);
  assert.equal(saveCount, savesAfterFirst);

  const changedIntent = await fetchJson(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({manifestId: "qa_core_v2"}),
  });
  assert.equal(changedIntent.ok, false);
  assert.equal(changedIntent.code, "idempotency_key_conflict");
  const crossAccount = await fetchJson(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${otherGm.session.token}`,
      "Idempotency-Key": operationId,
    },
    body,
  });
  assert.equal(crossAccount.ok, false);
  assert.equal(crossAccount.code, "idempotency_key_conflict");
  assert.equal(saveCount, savesAfterFirst);
  const otherSnapshot = base.load();
  const otherBinding = otherSnapshot.profileBindings[otherGm.account.accountId];
  assert.ok(otherSnapshot.profiles[otherBinding.playerId].profile.stoneCoins < 1000000);

  const next = await fetchJson(endpoint, {
    method: "POST",
    headers: {...headers, "Idempotency-Key": "bbo_gm_qa_prepare_0002"},
    body,
  });
  assert.equal(next.ok, true);
  assert.equal(next.result.summary.changed, false);
  assert.equal(next.result.summary.alreadyCurrent, true);
  assert.equal(next.profileSummary.profileRevision, revisionAfterFirst);
  assert.equal(profileItemCount(next.profile, "item_meat_small"), 50);
  assert.equal(base.load().mutationReceipts[operationId].accountId, gm.account.accountId);

  const marketReadOperationId = "bbo_gm_market_config_read_0001";
  const marketRead = await fetchJson(`${baseUrl}/gm/market/config`, {
    headers: {
      authorization: `Bearer ${gm.session.token}`,
      "Idempotency-Key": marketReadOperationId,
    },
  });
  assert.equal(marketRead.ok, true);
  assert.equal(typeof marketRead.marketConfig.defaultTaxBps, "number");
  assert.equal(Object.hasOwn(marketRead, "durableCommit"), false);
  assert.equal(Object.hasOwn(base.load().mutationReceipts, marketReadOperationId), false);
});

test("HTTP GM QA preparation publishes nothing before a failed commit and recovers with the same key", async (t) => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const gm = registerGm(seed, "httpqaprofilefailure");
  const binding = base.load().profileBindings[gm.account.accountId];
  const before = structuredClone(base.load().profiles[binding.playerId].profile);
  let failNextSave = true;
  let saveCount = 0;
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      saveCount += 1;
      if (failNextSave) {
        failNextSave = false;
        throw new Error("injected QA profile commit failure");
      }
      base.save(nextData);
    },
  }, {onError: () => {}});
  const service = createAuthService({store});
  const server = createHttpServer({service, store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await service.waitForDurableIdle();
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  });
  const endpoint = `http://127.0.0.1:${server.address().port}/gm/commands/${COMMAND_ID}`;
  const operationId = "bbo_gm_qa_commit_failure_0001";
  const request = {
    method: "POST",
    headers: {
      authorization: `Bearer ${gm.session.token}`,
      "Idempotency-Key": operationId,
    },
    body: JSON.stringify({manifestId: MANIFEST_ID}),
  };

  const failed = await fetchJson(endpoint, request);
  assert.equal(failed.ok, false);
  assert.equal(failed.code, "storage_write_failed");
  assert.deepEqual(base.load().profiles[binding.playerId].profile, before);
  assert.equal(Object.hasOwn(base.load().mutationReceipts, operationId), false);

  const recovered = await fetchJson(endpoint, request);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.result.summary.changed, true);
  assert.equal(recovered.durableCommit.operationId, operationId);
  assert.equal(recovered.durableCommit.replayed, false);
  assert.equal(recovered.profile.stoneCoins, 1000000);
  assert.equal(saveCount, 2);
});
