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
  AUTO_CAPTURE_SETTINGS_ACTION_ID,
  GROWTH_RULE_POLICY_KEY,
  createAutoCaptureSettingsRules,
  defaultFilterPolicy,
  defaultGrowthRulePolicy,
} = require("../src/auth/auto-capture-settings");

function testRules() {
  const formIds = new Set(["known_form"]);
  const lineIds = new Set(["known_line", "second_line"]);
  const toolIds = new Set(["empty_hand", "capture_net"]);
  return createAutoCaptureSettingsRules({
    emptyHandToolId: "empty_hand",
    resolveForm: (formId) => formIds.has(formId) ? {formId} : null,
    resolveLine: (lineId) => lineIds.has(lineId) ? {lineId} : null,
    normalizeCaptureToolId: (value) => {
      const toolId = String(value || "").trim().toLowerCase();
      return toolIds.has(toolId) ? toolId : "empty_hand";
    },
  });
}

test("auto-capture settings normalize dirty legacy values through injected catalogs", () => {
  const rules = testRules();
  assert.deepEqual(rules.defaultSettings(), {
    enabled: false,
    targetMode: "all",
    targetFormId: "",
    targetManualText: "",
    hpPercent: 100,
    levelComparator: "=",
    levelValue: 1,
    preferredToolId: "empty_hand",
    noTargetAction: "escape",
    capturePetSkillSlot: 2,
    autoDiscardLowPower: false,
    lowPowerThreshold: 31,
    filterPolicy: defaultFilterPolicy(),
    growthRulePolicy: defaultGrowthRulePolicy(),
  });
  assert.deepEqual(rules.normalizeSettings("legacy-corrupt"), rules.defaultSettings());

  const normalized = rules.normalizeSettings({
    enabled: "true",
    targetMode: " codex ",
    targetFormId: " known_form ",
    targetManualText: "  蓝龙\n  重点\t目标    测试  ",
    hpPercent: "0",
    levelComparator: "?",
    levelValue: 5000,
    preferredToolId: " CAPTURE_NET ",
    noTargetAction: " battle ",
    capturePetSkillSlot: -4,
    autoDiscardLowPower: 1,
    lowPowerThreshold: -8,
    obsoleteClientOnlyField: "must disappear",
  });
  assert.deepEqual(normalized, {
    enabled: true,
    targetMode: "codex",
    targetFormId: "known_form",
    targetManualText: "蓝龙 重点 目标 测试",
    hpPercent: 1,
    levelComparator: "=",
    levelValue: 999,
    preferredToolId: "capture_net",
    noTargetAction: "battle",
    capturePetSkillSlot: 1,
    autoDiscardLowPower: true,
    lowPowerThreshold: 0,
    filterPolicy: defaultFilterPolicy(),
    growthRulePolicy: defaultGrowthRulePolicy(),
  });

  assert.equal(rules.normalizeSettings({targetFormId: "future_unknown_form"}).targetFormId, "");
  assert.equal(rules.normalizeSettings({preferredToolId: "future_unknown_tool"}).preferredToolId, "empty_hand");
});

test("player auto-capture update accepts only a settings envelope and always disables discard", () => {
  const rules = testRules();
  for (const payload of [
    null,
    [],
    {},
    {settings: null},
    {settings: []},
    {settings: {}, profile: {stoneCoins: 999999}},
    {settings: {}, unexpected: true},
  ]) {
    const rejected = rules.normalizePlayerUpdate(payload);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, "auto_capture_settings_payload_invalid");
  }

  const accepted = rules.normalizePlayerUpdate({
    settings: {
      enabled: true,
      targetMode: "codex",
      targetFormId: "known_form",
      preferredToolId: "capture_net",
      autoDiscardLowPower: true,
      unknownFutureSetting: "ignored for client compatibility",
    },
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.settings.autoDiscardLowPower, false);
  assert.equal(accepted.settings.targetFormId, "known_form");
  assert.equal(accepted.settings.preferredToolId, "capture_net");
  assert.equal(Object.hasOwn(accepted.settings, "unknownFutureSetting"), false);
});

test("public capture filter policy rejects unsafe player widening and repairs legacy saves", () => {
  const rules = testRules();
  const validPolicy = {
    schemaVersion: 1,
    lineIds: [" known_line ", "known_line", "second_line"],
    element: {mode: "all", ids: [" WATER ", "earth", "water"], minPoints: 3},
    onlyNewCodexForm: true,
    maxOwnedSameForm: 8,
    levelOneFourV: {
      maxHp: {min: 60, max: 80},
      attack: {min: 14, max: 0},
      defense: {min: 0, max: 10},
      quick: {min: 6, max: 9},
    },
  };
  const accepted = rules.normalizePlayerUpdate({settings: {filterPolicy: validPolicy}});
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.settings.filterPolicy, {
    ...validPolicy,
    lineIds: ["known_line", "second_line"],
    element: {mode: "all", ids: ["water", "earth"], minPoints: 3},
  });

  const invalidPolicies = [
    {...validPolicy, schemaVersion: 2},
    {...validPolicy, lineIds: ["unknown_line"]},
    {...validPolicy, element: {...validPolicy.element, ids: ["light"]}},
    {...validPolicy, element: {...validPolicy.element, minPoints: 0}},
    {...validPolicy, maxOwnedSameForm: 1000},
    {
      ...validPolicy,
      levelOneFourV: {...validPolicy.levelOneFourV, attack: {min: 20, max: 10}},
    },
  ];
  for (const filterPolicy of invalidPolicies) {
    const rejected = rules.normalizePlayerUpdate({settings: {filterPolicy}});
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, "auto_capture_filter_policy_invalid");
  }

  const repaired = rules.normalizeSettings({
    filterPolicy: {
      schemaVersion: 999,
      lineIds: ["unknown", "known_line", "known_line"],
      element: {mode: "broken", ids: ["light", "WATER", "water"], minPoints: 99},
      onlyNewCodexForm: "yes",
      maxOwnedSameForm: -20,
      levelOneFourV: {
        maxHp: {min: 80, max: 60},
        attack: "corrupt",
      },
    },
  }).filterPolicy;
  assert.deepEqual(repaired, {
    schemaVersion: 1,
    lineIds: ["known_line"],
    element: {mode: "any", ids: ["water"], minPoints: 10},
    onlyNewCodexForm: true,
    maxOwnedSameForm: 0,
    levelOneFourV: {
      maxHp: {min: 60, max: 80},
      attack: {min: 0, max: 0},
      defense: {min: 0, max: 0},
      quick: {min: 0, max: 0},
    },
  });
});

test("legacy player update preserves the existing public filter policy", () => {
  const rules = testRules();
  const profile = {
    autoCaptureSettings: {
      enabled: true,
      filterPolicy: {
        schemaVersion: 1,
        lineIds: ["known_line"],
        element: {mode: "any", ids: ["water"], minPoints: 5},
        onlyNewCodexForm: true,
        maxOwnedSameForm: 3,
        levelOneFourV: {
          maxHp: {min: 60, max: 0},
          attack: {min: 14, max: 0},
          defense: {min: 0, max: 0},
          quick: {min: 0, max: 0},
        },
      },
    },
  };
  const beforePolicy = structuredClone(rules.normalizeSettings(profile.autoCaptureSettings).filterPolicy);
  const result = rules.applyPlayerUpdate(profile, {settings: {enabled: false, hpPercent: 20}});
  assert.equal(result.ok, true);
  assert.equal(profile.autoCaptureSettings.enabled, false);
  assert.equal(profile.autoCaptureSettings.hpPercent, 20);
  assert.deepEqual(profile.autoCaptureSettings.filterPolicy, beforePolicy);
});

test("growth retention preview policy is strict and legacy updates preserve it", () => {
  const rules = testRules();
  const growthRulePolicy = {
    schemaVersion: 1,
    overallMinimumPercentile: 91,
    statMinimumPercentiles: {maxHp: 90, attack: 90, defense: 0, quick: 40},
  };
  const accepted = rules.normalizePlayerUpdate({
    settings: {[GROWTH_RULE_POLICY_KEY]: growthRulePolicy},
  });
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.settings[GROWTH_RULE_POLICY_KEY], growthRulePolicy);

  for (const invalidPolicy of [
    {...growthRulePolicy, schemaVersion: 2},
    {...growthRulePolicy, overallMinimumPercentile: "91"},
    {...growthRulePolicy, overallMinimumPercentile: 101},
    {...growthRulePolicy, statMinimumPercentiles: {maxHp: 90, attack: 90, defense: 0}},
    {...growthRulePolicy, statMinimumPercentiles: {maxHp: 90, attack: 90, defense: 0, quick: 40.5}},
  ]) {
    const rejected = rules.normalizePlayerUpdate({
      settings: {[GROWTH_RULE_POLICY_KEY]: invalidPolicy},
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, "auto_capture_growth_rule_policy_invalid");
  }

  const profile = {
    autoCaptureSettings: {
      enabled: true,
      [GROWTH_RULE_POLICY_KEY]: growthRulePolicy,
    },
  };
  const result = rules.applyPlayerUpdate(profile, {settings: {enabled: false}});
  assert.equal(result.ok, true);
  assert.deepEqual(profile.autoCaptureSettings[GROWTH_RULE_POLICY_KEY], growthRulePolicy);
});

test("server-authoritative auto-capture action persists normalized settings and revision", () => {
  const store = createMemoryAuthStore();
  const service = createAuthService({store});
  const registered = service.register({
    username: "autocapturesettings",
    password: "test1234",
    displayName: "自动捕捉设置号",
  });
  assert.equal(registered.ok, true);

  const initial = service.getProfile(registered.session.token);
  assert.equal(initial.ok, true);
  assert.equal(initial.profileSummary.profileRevision, 0);
  assert.equal(initial.profile.autoCaptureSettings.autoDiscardLowPower, false);

  const updated = service.profileAction(registered.session.token, {
    action: AUTO_CAPTURE_SETTINGS_ACTION_ID,
    payload: {
      settings: {
        enabled: true,
        targetMode: "codex",
        targetFormId: " bui_normal_red_fire10 ",
        targetManualText: "  红布伊\n测试  ",
        hpPercent: 900,
        levelComparator: ">",
        levelValue: "20",
        preferredToolId: "CAPTURE_NET",
        noTargetAction: "battle",
        capturePetSkillSlot: 7,
        autoDiscardLowPower: true,
        lowPowerThreshold: 99999,
        growthRulePolicy: {
          schemaVersion: 1,
          overallMinimumPercentile: 91,
          statMinimumPercentiles: {maxHp: 90, attack: 90, defense: 0, quick: 40},
        },
        oldClientNoise: true,
      },
    },
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.profileSummary.profileRevision, 1);
  assert.deepEqual(updated.profile.autoCaptureSettings, {
    enabled: true,
    targetMode: "codex",
    targetFormId: "bui_normal_red_fire10",
    targetManualText: "红布伊测试",
    hpPercent: 100,
    levelComparator: ">",
    levelValue: 20,
    preferredToolId: "capture_net",
    noTargetAction: "battle",
    capturePetSkillSlot: 7,
    autoDiscardLowPower: false,
    lowPowerThreshold: 9999,
    filterPolicy: defaultFilterPolicy(),
    growthRulePolicy: {
      schemaVersion: 1,
      overallMinimumPercentile: 91,
      statMinimumPercentiles: {maxHp: 90, attack: 90, defense: 0, quick: 40},
    },
  });
  assert.equal(updated.result.growthRulePreview.dryRun, true);
  assert.equal(updated.result.growthRulePreview.retainPet, true);
  assert.equal(updated.result.growthRulePreview.mutationCount, 0);

  const restarted = createAuthService({store});
  const reloaded = restarted.getProfile(registered.session.token);
  assert.equal(reloaded.ok, true);
  assert.equal(reloaded.profileSummary.profileRevision, 1);
  assert.deepEqual(reloaded.profile.autoCaptureSettings, updated.profile.autoCaptureSettings);
});

test("invalid auto-capture payload cannot mutate the profile or upload a full document", () => {
  const service = createAuthService({store: createMemoryAuthStore(), allowFullProfileSave: false});
  const registered = service.register({
    username: "autocaptureinvalid",
    password: "test1234",
    displayName: "自动捕捉防护号",
  });
  const before = service.getProfile(registered.session.token);

  const rejected = service.profileAction(registered.session.token, {
    action: AUTO_CAPTURE_SETTINGS_ACTION_ID,
    payload: {
      settings: {enabled: true},
      profile: {stoneCoins: 99999999},
    },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "auto_capture_settings_payload_invalid");

  const paramsAliasRejected = service.profileAction(registered.session.token, {
    action: AUTO_CAPTURE_SETTINGS_ACTION_ID,
    params: {settings: {enabled: true}},
  });
  assert.equal(paramsAliasRejected.ok, false);
  assert.equal(paramsAliasRejected.code, "auto_capture_settings_payload_invalid");

  const after = service.getProfile(registered.session.token);
  assert.equal(after.profileSummary.profileRevision, before.profileSummary.profileRevision);
  assert.deepEqual(after.profile, before.profile);

  const fullUpload = service.saveProfile(registered.session.token, {
    expectedRevision: 0,
    profile: {...before.profile, stoneCoins: 99999999},
  });
  assert.equal(fullUpload.ok, false);
  assert.equal(fullUpload.code, "profile_upload_denied");
});

test("HTTP profile action exposes the authoritative auto-capture settings write path", async (t) => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const registered = await fetchJson(`${base}/auth/register`, {
    method: "POST",
    body: JSON.stringify({
      username: "httpautocapture",
      password: "test1234",
      displayName: "HTTP自动捕捉号",
    }),
  });
  assert.equal(registered.ok, true);

  const updated = await fetchJson(`${base}/profile/action`, {
    method: "POST",
    headers: {authorization: `Bearer ${registered.session.token}`},
    body: JSON.stringify({
      action: AUTO_CAPTURE_SETTINGS_ACTION_ID,
      payload: {settings: {enabled: true, autoDiscardLowPower: true}},
    }),
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.profileSummary.profileRevision, 1);
  assert.equal(updated.profile.autoCaptureSettings.enabled, true);
  assert.equal(updated.profile.autoCaptureSettings.autoDiscardLowPower, false);
  assert.equal(updated.result.growthRulePreview.dryRun, true);
  assert.equal(updated.result.growthRulePreview.mutationCount, 0);

  const denied = await fetchJson(`${base}/profiles/me`, {
    method: "PUT",
    headers: {authorization: `Bearer ${registered.session.token}`},
    body: JSON.stringify({profile: {...updated.profile, stoneCoins: 99999999}}),
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "profile_upload_denied");
});
