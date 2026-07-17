"use strict";

const {
  assert,
  test,
  once,
  createAuthService,
  createMemoryAuthStore,
  createHttpServer,
  fetchJson,
} = require("../test-support/auth-service-test-context");
const {
  PET_GROWTH_EVALUATION_SETTINGS_ACTION_ID,
  createPetGrowthEvaluationSettingsRules,
} = require("../src/auth/pet-growth-evaluation-settings");

function policy(overrides = {}) {
  return {
    schemaVersion: 1,
    overallMinimumPercentile: 91,
    statMinimumPercentiles: {maxHp: 90, attack: 90, defense: 0, quick: 40},
    ...overrides,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("manual growth evaluation settings are strict and never handle pets", () => {
  const rules = createPetGrowthEvaluationSettingsRules({
    normalizeAutoCaptureSettings(value) {
      return value && typeof value === "object" && !Array.isArray(value) ? clone(value) : {};
    },
  });
  const profile = {
    autoCaptureSettings: {
      enabled: true,
      targetMode: "codex",
      filterPolicy: {schemaVersion: 2, lineIds: ["man_dragon"]},
    },
    petInstances: [{instanceId: "pet_must_remain_unchanged", attack: 63}],
  };
  const before = clone(profile);

  for (const payload of [
    null,
    [],
    {},
    {policy: null},
    {policy: policy(), unexpected: true},
    {policy: policy({schemaVersion: 2})},
    {policy: policy({overallMinimumPercentile: "91"})},
    {policy: policy({statMinimumPercentiles: {maxHp: 90, attack: 90, defense: 0}})},
  ]) {
    const snapshot = clone(profile);
    const rejected = rules.applyPlayerUpdate(profile, payload);
    assert.equal(rejected.ok, false);
    assert.deepEqual(profile, snapshot);
  }

  const result = rules.applyPlayerUpdate(profile, {policy: policy()});
  assert.equal(result.ok, true);
  assert.deepEqual(result.growthEvaluationPolicy, policy());
  assert.equal(result.retainPet, true);
  assert.equal(result.mutationCount, 0);
  assert.deepEqual(profile.petInstances, before.petInstances);
  assert.equal(profile.autoCaptureSettings.enabled, true);
  assert.equal(profile.autoCaptureSettings.targetMode, "codex");
  assert.deepEqual(profile.autoCaptureSettings.filterPolicy, before.autoCaptureSettings.filterPolicy);
  assert.deepEqual(profile.autoCaptureSettings.growthRulePolicy, policy());
  assert.deepEqual(rules.normalizeProfilePolicy(profile), policy());
});

test("authoritative growth evaluation action persists the legacy-compatible policy only", () => {
  const store = createMemoryAuthStore();
  const service = createAuthService({store});
  const registered = service.register({
    username: "growthreferences",
    password: "test1234",
    displayName: "成长参考线号",
  });
  assert.equal(registered.ok, true);

  const before = service.getProfile(registered.session.token);
  assert.equal(before.ok, true);
  const petsBefore = clone(before.profile.petInstances);
  const captureBefore = clone(before.profile.autoCaptureSettings);

  const updated = service.profileAction(registered.session.token, {
    action: PET_GROWTH_EVALUATION_SETTINGS_ACTION_ID,
    payload: {policy: policy()},
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.profileSummary.profileRevision, 1);
  assert.deepEqual(updated.result.growthEvaluationPolicy, policy());
  assert.equal(Object.hasOwn(updated.result, "retainPet"), false);
  assert.equal(Object.hasOwn(updated.result, "mutationCount"), false);
  assert.deepEqual(updated.profile.petInstances, petsBefore);
  assert.deepEqual(
    {...updated.profile.autoCaptureSettings, growthRulePolicy: captureBefore.growthRulePolicy},
    captureBefore,
  );
  assert.deepEqual(updated.profile.autoCaptureSettings.growthRulePolicy, policy());

  const rejected = service.profileAction(registered.session.token, {
    action: PET_GROWTH_EVALUATION_SETTINGS_ACTION_ID,
    payload: {policy: policy({overallMinimumPercentile: 101})},
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "pet_growth_evaluation_policy_invalid");

  const restarted = createAuthService({store});
  const reloaded = restarted.getProfile(registered.session.token);
  assert.equal(reloaded.ok, true);
  assert.equal(reloaded.profileSummary.profileRevision, 1);
  assert.deepEqual(reloaded.profile.petInstances, petsBefore);
  assert.deepEqual(reloaded.profile.autoCaptureSettings.growthRulePolicy, policy());
});

test("HTTP profile action exposes the manual growth evaluation write path", async (t) => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const registered = await fetchJson(`${base}/auth/register`, {
    method: "POST",
    body: JSON.stringify({
      username: "httpgrowthrefs",
      password: "test1234",
      displayName: "HTTP成长参考线号",
    }),
  });
  assert.equal(registered.ok, true);

  const updated = await fetchJson(`${base}/profile/action`, {
    method: "POST",
    headers: {authorization: `Bearer ${registered.session.token}`},
    body: JSON.stringify({
      action: PET_GROWTH_EVALUATION_SETTINGS_ACTION_ID,
      payload: {policy: policy()},
    }),
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.profileSummary.profileRevision, 1);
  assert.deepEqual(updated.result.growthEvaluationPolicy, policy());
  assert.equal(Object.hasOwn(updated.result, "mutationCount"), false);

  const unauthenticated = await fetchJson(`${base}/profile/action`, {
    method: "POST",
    body: JSON.stringify({
      action: PET_GROWTH_EVALUATION_SETTINGS_ACTION_ID,
      payload: {policy: policy()},
    }),
  });
  assert.equal(unauthenticated.ok, false);
  assert.equal(unauthenticated.code, "session_missing");
});
