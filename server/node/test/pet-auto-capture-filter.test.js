"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {createPetAutoCaptureFilter} = require("../src/auth/pet-auto-capture-filter");

const templates = new Map([
  ["blue_man_dragon_water10", {
    formId: "blue_man_dragon_water10",
    formName: "蓝人龙",
    lineId: "man_dragon",
    subtypeName: "蓝人龙",
    elements: {fire: 0, water: 10, earth: 0, wind: 0},
  }],
  ["red_bui_fire10", {
    formId: "red_bui_fire10",
    formName: "红布伊",
    lineId: "bui",
    subtypeName: "普通布伊",
    elements: {fire: 10, water: 0, earth: 0, wind: 0},
  }],
]);

const lines = new Map([
  ["man_dragon", {lineId: "man_dragon", lineName: "人龙系"}],
  ["bui", {lineId: "bui", lineName: "布伊系"}],
]);

function filter() {
  return createPetAutoCaptureFilter({
    resolveTemplate: (formId) => templates.get(formId) || null,
    resolveLine: (lineId) => lines.get(lineId) || null,
  });
}

function settings(overrides = {}) {
  return {
    enabled: true,
    targetMode: "all",
    targetFormId: "",
    targetManualText: "",
    hpPercent: 50,
    levelComparator: "=",
    levelValue: 1,
    filterPolicy: {
      schemaVersion: 1,
      lineIds: ["man_dragon"],
      element: {mode: "any", ids: ["water"], minPoints: 10},
      onlyNewCodexForm: true,
      maxOwnedSameForm: 2,
      levelOneFourV: {
        maxHp: {min: 60, max: 0},
        attack: {min: 14, max: 16},
        defense: {min: 0, max: 0},
        quick: {min: 6, max: 0},
      },
    },
    ...overrides,
  };
}

function actor(overrides = {}) {
  return {
    formId: "blue_man_dragon_water10",
    displayName: "野生蓝人龙1",
    hp: 20,
    maxHp: 100,
    level: 1,
    catchable: true,
    ...overrides,
  };
}

function context(overrides = {}) {
  return {
    codexCapturedFormIds: [],
    ownedSameFormCount: 1,
    pendingSameFormCount: 0,
    ...overrides,
  };
}

function pet(stats = {maxHp: 60, attack: 14, defense: 8, quick: 6}) {
  return {
    initialStats: {...stats},
    growthSpeciesLevel1Stats: {...stats},
  };
}

function reasonCodes(evaluation) {
  return evaluation.reasons.map((entry) => entry.code);
}

test("pre-capture evaluation matches only server-resolved public battle and catalog facts", () => {
  const captureFilter = filter();
  const inputSettings = settings();
  const inputActor = actor();
  const inputContext = context();
  const before = structuredClone({inputSettings, inputActor, inputContext});

  const result = captureFilter.evaluatePreCapture({
    settings: inputSettings,
    actor: inputActor,
    context: inputContext,
  });

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.stage, "pre_capture");
  assert.equal(result.status, "matched");
  assert.equal(result.matched, true);
  assert.equal(result.retainPet, true);
  assert.deepEqual(result.deferredChecks, ["level_one_four_v"]);
  assert.deepEqual(reasonCodes(result), ["pre_capture_public_rules_matched"]);
  assert.deepEqual(result.facts, {
    formId: "blue_man_dragon_water10",
    formName: "蓝人龙",
    lineId: "man_dragon",
    lineName: "人龙系",
    elements: {fire: 0, water: 10, earth: 0, wind: 0},
    level: 1,
    hp: 20,
    maxHp: 100,
    hpPercent: 20,
    isNewCodexForm: true,
    ownedSameFormCount: 1,
    pendingSameFormCount: 0,
    levelOneFourV: null,
  });
  assert.deepEqual({inputSettings, inputActor, inputContext}, before);
});

test("pre-capture public conditions fail closed without consuming hidden candidate facts", () => {
  const captureFilter = filter();
  const cases = [
    {
      actor: actor({hp: 60}),
      context: context(),
      codes: ["hp_percent_not_matched"],
    },
    {
      actor: actor(),
      context: context({codexCapturedFormIds: ["blue_man_dragon_water10"]}),
      codes: ["codex_form_already_captured"],
    },
    {
      actor: actor(),
      context: context({ownedSameFormCount: 0, pendingSameFormCount: 1}),
      codes: ["codex_form_already_captured"],
    },
    {
      actor: actor(),
      context: context({ownedSameFormCount: 1, pendingSameFormCount: 1}),
      codes: ["codex_form_already_captured", "owned_same_form_limit_reached"],
    },
    {
      actor: actor({formId: "red_bui_fire10"}),
      context: context(),
      codes: ["pet_line_not_matched", "pet_element_not_matched"],
    },
  ];

  for (const testCase of cases) {
    const result = captureFilter.evaluatePreCapture({
      settings: settings(),
      actor: testCase.actor,
      context: testCase.context,
    });
    assert.equal(result.status, "not_matched");
    assert.equal(result.matched, false);
    assert.equal(result.retainPet, true);
    assert.deepEqual(reasonCodes(result), testCase.codes);
  }

  const unavailableCodex = captureFilter.evaluatePreCapture({
    settings: settings(),
    actor: actor(),
    context: context({codexCapturedFormIds: null}),
  });
  assert.equal(unavailableCodex.status, "unavailable");
  assert.deepEqual(reasonCodes(unavailableCodex), ["codex_history_unavailable"]);

  const disabled = captureFilter.evaluatePreCapture({settings: settings({enabled: false})});
  assert.equal(disabled.status, "disabled");
  assert.equal(disabled.retainPet, true);
});

test("pre-capture actor proxy proves no rolled pet or candidate property is read", () => {
  const allowed = new Set(["formId", "displayName", "hp", "maxHp", "level", "catchable"]);
  const source = actor();
  const guardedActor = new Proxy(source, {
    get(target, property, receiver) {
      if (typeof property === "string" && !allowed.has(property)) {
        throw new Error(`forbidden actor read: ${property}`);
      }
      return Reflect.get(target, property, receiver);
    },
  });

  const result = filter().evaluatePreCapture({
    settings: settings(),
    actor: guardedActor,
    context: context(),
  });
  assert.equal(result.matched, true);
});

test("manual target text uses the same authoritative public display identity", () => {
  const captureFilter = filter();
  const displayResult = captureFilter.evaluatePreCapture({
    settings: settings({
      targetMode: "codex",
      targetFormId: "",
      targetManualText: "野生蓝人龙",
    }),
    actor: actor(),
    context: context(),
  });
  const lineResult = captureFilter.evaluatePreCapture({
    settings: settings({
      targetMode: "codex",
      targetFormId: "",
      targetManualText: "人龙系",
    }),
    actor: actor(),
    context: context(),
  });
  assert.equal(displayResult.status, "matched");
  assert.equal(displayResult.matched, true);
  assert.equal(lineResult.status, "matched");
  assert.equal(lineResult.matched, true);
});

test("post-capture evaluation reads two equal public Lv1 maps and always retains the pet", () => {
  const captureFilter = filter();
  const inputSettings = settings();
  const preEvaluation = captureFilter.evaluatePreCapture({
    settings: inputSettings,
    actor: actor(),
    context: context(),
  });
  const capturedPet = pet();
  const before = structuredClone({inputSettings, preEvaluation, capturedPet});
  const matched = captureFilter.evaluatePostCapture({
    settings: inputSettings,
    pet: capturedPet,
    preEvaluation,
  });
  assert.equal(matched.stage, "post_capture");
  assert.equal(matched.status, "matched");
  assert.equal(matched.matched, true);
  assert.equal(matched.retainPet, true);
  assert.deepEqual(matched.deferredChecks, []);
  assert.deepEqual(matched.facts.levelOneFourV, {maxHp: 60, attack: 14, defense: 8, quick: 6});
  assert.deepEqual(reasonCodes(matched), ["post_capture_public_rules_matched"]);
  assert.deepEqual({inputSettings, preEvaluation, capturedPet}, before);

  const missed = captureFilter.evaluatePostCapture({
    settings: inputSettings,
    pet: pet({maxHp: 59, attack: 17, defense: 8, quick: 5}),
    preEvaluation,
  });
  assert.equal(missed.status, "not_matched");
  assert.equal(missed.matched, false);
  assert.equal(missed.retainPet, true);
  assert.deepEqual(reasonCodes(missed), [
    "level_one_maxHp_below_min",
    "level_one_attack_above_max",
    "level_one_quick_below_min",
    "post_capture_public_rules_not_matched",
  ]);
  assert.match(missed.reasons.at(-1).message, /不会自动处理/);
});

test("post-capture fails closed on missing or inconsistent public Lv1 facts and still retains", () => {
  const captureFilter = filter();
  const preEvaluation = captureFilter.evaluatePreCapture({
    settings: settings(),
    actor: actor(),
    context: context(),
  });
  const missing = captureFilter.evaluatePostCapture({
    settings: settings(),
    pet: {initialStats: {maxHp: 60}, growthSpeciesLevel1Stats: {maxHp: 60}},
    preEvaluation,
  });
  assert.equal(missing.status, "unavailable");
  assert.equal(missing.retainPet, true);
  assert.deepEqual(reasonCodes(missing), ["level_one_four_v_unavailable"]);

  const inconsistentPet = pet();
  inconsistentPet.growthSpeciesLevel1Stats.attack = 15;
  const inconsistent = captureFilter.evaluatePostCapture({
    settings: settings(),
    pet: inconsistentPet,
    preEvaluation,
  });
  assert.equal(inconsistent.status, "unavailable");
  assert.equal(inconsistent.retainPet, true);
  assert.deepEqual(reasonCodes(inconsistent), ["level_one_four_v_inconsistent"]);
});

test("post-capture guarded proxy proves hidden growth has zero reads", () => {
  const captureFilter = filter();
  const preEvaluation = captureFilter.evaluatePreCapture({
    settings: settings(),
    actor: actor(),
    context: context(),
  });
  const allowedPetKeys = new Set(["initialStats", "growthSpeciesLevel1Stats"]);
  const allowedStatKeys = new Set(["maxHp", "attack", "defense", "quick"]);
  const guardedStats = (stats) => new Proxy(stats, {
    get(target, property, receiver) {
      if (typeof property === "string" && !allowedStatKeys.has(property)) {
        throw new Error(`forbidden stat read: ${property}`);
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const guardedPet = new Proxy({
    initialStats: guardedStats({maxHp: 60, attack: 14, defense: 8, quick: 6}),
    growthSpeciesLevel1Stats: guardedStats({maxHp: 60, attack: 14, defense: 8, quick: 6}),
    individualQualityScore: 999,
    privateSeed: "must-not-read",
    petGrowth: {private: {privateRoll: {innateGrowthBonus: {attack: 999}}}},
  }, {
    get(target, property, receiver) {
      if (typeof property === "string" && !allowedPetKeys.has(property)) {
        throw new Error(`forbidden pet read: ${property}`);
      }
      return Reflect.get(target, property, receiver);
    },
  });

  const result = captureFilter.evaluatePostCapture({
    settings: settings(),
    pet: guardedPet,
    preEvaluation,
  });
  assert.equal(result.status, "matched");
  assert.equal(result.retainPet, true);
});
