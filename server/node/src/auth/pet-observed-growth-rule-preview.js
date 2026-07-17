"use strict";

const {STAT_KEYS} = require("./pet-growth-authority");

const GROWTH_RULE_POLICY_SCHEMA_VERSION = 1;
const GROWTH_RULE_PREVIEW_SCHEMA_VERSION = 1;
const MAX_PREVIEW_PETS = 25;
const STAT_LABELS = Object.freeze({
  maxHp: "生命",
  attack: "攻击",
  defense: "防御",
  quick: "敏捷",
});
const POLICY_KEYS = Object.freeze([
  "schemaVersion",
  "overallMinimumPercentile",
  "statMinimumPercentiles",
]);

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function exactKeys(value, keys) {
  return isObjectRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => hasOwn(value, key));
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

function defaultGrowthRulePolicy() {
  return {
    schemaVersion: GROWTH_RULE_POLICY_SCHEMA_VERSION,
    overallMinimumPercentile: 0,
    statMinimumPercentiles: Object.fromEntries(STAT_KEYS.map((key) => [key, 0])),
  };
}

function normalizedPercentile(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.trunc(parsed)));
}

function normalizeGrowthRulePolicy(value) {
  if (!isObjectRecord(value) || value.schemaVersion !== GROWTH_RULE_POLICY_SCHEMA_VERSION) {
    return defaultGrowthRulePolicy();
  }
  const stats = isObjectRecord(value.statMinimumPercentiles)
    ? value.statMinimumPercentiles
    : {};
  return {
    schemaVersion: GROWTH_RULE_POLICY_SCHEMA_VERSION,
    overallMinimumPercentile: normalizedPercentile(value.overallMinimumPercentile),
    statMinimumPercentiles: Object.fromEntries(STAT_KEYS.map((key) => [
      key,
      normalizedPercentile(stats[key]),
    ])),
  };
}

function invalidGrowthRulePolicy() {
  return {
    ok: false,
    code: "auto_capture_growth_rule_policy_invalid",
    message: "成长筛选门槛不正确，请使用 0 至 100 的整数分位。",
  };
}

function strictPlayerGrowthRulePolicy(value) {
  if (
    !exactKeys(value, POLICY_KEYS)
    || value.schemaVersion !== GROWTH_RULE_POLICY_SCHEMA_VERSION
    || !Number.isInteger(value.overallMinimumPercentile)
    || value.overallMinimumPercentile < 0
    || value.overallMinimumPercentile > 100
    || !exactKeys(value.statMinimumPercentiles, STAT_KEYS)
  ) {
    return invalidGrowthRulePolicy();
  }
  for (const key of STAT_KEYS) {
    const threshold = value.statMinimumPercentiles[key];
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) {
      return invalidGrowthRulePolicy();
    }
  }
  return {ok: true, policy: clone(value)};
}

function growthRulePolicyConfigured(value) {
  const policy = normalizeGrowthRulePolicy(value);
  return policy.overallMinimumPercentile > 0
    || STAT_KEYS.some((key) => policy.statMinimumPercentiles[key] > 0);
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function publicPetIdentity(pet) {
  try {
    if (!isObjectRecord(pet)) {
      return {instanceId: "", formId: "", name: "宠物", level: 0, state: ""};
    }
    return {
      instanceId: cleanText(pet.instanceId) || cleanText(pet.petId),
      formId: cleanText(pet.formId) || cleanText(pet.templateId),
      name: cleanText(pet.name) || cleanText(pet.displayName) || "宠物",
      level: Number.isSafeInteger(pet.level) ? pet.level : 0,
      state: cleanText(pet.state),
    };
  } catch (_error) {
    return {instanceId: "", formId: "", name: "宠物", level: 0, state: ""};
  }
}

function publicGrowthFacts(screening) {
  const observation = isObjectRecord(screening && screening.observation)
    ? screening.observation
    : {};
  const statPercentiles = isObjectRecord(observation.statPercentiles)
    ? Object.fromEntries(STAT_KEYS.map((key) => [key, observation.statPercentiles[key]]))
    : {};
  return {
    status: cleanText(screening && screening.status),
    level: Number.isSafeInteger(screening && screening.level) ? screening.level : 0,
    observedLevels: Number.isSafeInteger(screening && screening.observedLevels)
      ? screening.observedLevels
      : 0,
    minimumLevel: Number.isSafeInteger(screening && screening.minimumLevel)
      ? screening.minimumLevel
      : 20,
    overallGrade: cleanText(observation.overallGrade),
    powerPercentile: observation.powerPercentile,
    statPercentiles,
  };
}

function percentileText(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
}

function ruleCheck(field, label, actualValue, minimumValue) {
  const actual = typeof actualValue === "number" && Number.isFinite(actualValue)
    ? actualValue
    : null;
  if (actual === null) {
    return null;
  }
  const passed = actual >= minimumValue;
  return {
    code: passed ? `growth_${field}_minimum_met` : `growth_${field}_below_minimum`,
    field,
    label,
    actualPercentile: actual,
    minimumPercentile: minimumValue,
    passed,
    message: passed
      ? `${label}成长分位 ${percentileText(actual)}%，达到保留门槛 ${minimumValue}%。`
      : `${label}成长分位 ${percentileText(actual)}%，低于保留门槛 ${minimumValue}%。`,
  };
}

function basePreview(pet, policy, screening) {
  return {
    schemaVersion: GROWTH_RULE_PREVIEW_SCHEMA_VERSION,
    dryRun: true,
    configured: growthRulePolicyConfigured(policy),
    status: "unavailable",
    meetsRetentionRules: false,
    wouldHandle: false,
    previewAction: "keep",
    retainPet: true,
    mutationPerformed: false,
    reasonCode: "growth_preview_unavailable",
    reasonMessage: "成长资料暂时不可用；本次只保留宠物。",
    pet: publicPetIdentity(pet),
    policy: clone(policy),
    growth: publicGrowthFacts(screening),
    checks: [],
  };
}

function createPetObservedGrowthRulePreview(options = {}) {
  const screening = options.screening;
  if (!screening || typeof screening.evaluatePet !== "function") {
    throw new TypeError("pet observed growth rule preview requires a screening evaluator");
  }
  const maxPets = Number.isSafeInteger(options.maxPets)
    ? Math.max(1, Math.min(MAX_PREVIEW_PETS, options.maxPets))
    : MAX_PREVIEW_PETS;

  function evaluatePet(pet, policyValue) {
    const policy = normalizeGrowthRulePolicy(policyValue);
    let screeningResult;
    try {
      screeningResult = screening.evaluatePet(pet);
    } catch (_error) {
      screeningResult = {};
    }
    const preview = basePreview(pet, policy, screeningResult);
    if (!preview.configured) {
      preview.status = "not_configured";
      preview.meetsRetentionRules = true;
      preview.reasonCode = "growth_rule_not_configured";
      preview.reasonMessage = "尚未设置成长保留门槛；当前只保留宠物。";
      return deepFreeze(preview);
    }
    if (screeningResult.status === "unobserved" || screeningResult.status === "observing") {
      preview.status = "observing";
      preview.reasonCode = "growth_observation_not_mature";
      preview.reasonMessage = `成长仍在观察中；达到 Lv${screeningResult.minimumLevel || 20} 后才会预览处理结果。`;
      return deepFreeze(preview);
    }
    if (screeningResult.status !== "mature" || screeningResult.growthRuleEligible !== true) {
      return deepFreeze(preview);
    }

    const observation = screeningResult.observation;
    const checks = [];
    if (policy.overallMinimumPercentile > 0) {
      checks.push(ruleCheck(
        "overall",
        "综合",
        observation && observation.powerPercentile,
        policy.overallMinimumPercentile,
      ));
    }
    for (const key of STAT_KEYS) {
      const minimum = policy.statMinimumPercentiles[key];
      if (minimum <= 0) {
        continue;
      }
      checks.push(ruleCheck(
        key,
        STAT_LABELS[key],
        observation && observation.statPercentiles && observation.statPercentiles[key],
        minimum,
      ));
    }
    if (checks.some((entry) => entry === null)) {
      return deepFreeze(preview);
    }
    preview.checks = checks;
    preview.meetsRetentionRules = checks.every((entry) => entry.passed);
    preview.wouldHandle = !preview.meetsRetentionRules;
    preview.previewAction = preview.wouldHandle ? "review" : "keep";
    preview.status = preview.wouldHandle ? "would_handle" : "would_keep";
    preview.reasonCode = preview.wouldHandle
      ? "growth_preview_would_handle"
      : "growth_preview_would_keep";
    preview.reasonMessage = preview.wouldHandle
      ? "若未来开启安全处置，这只宠物会进入待处理；当前仍完整保留。"
      : "这只宠物达到全部已启用的成长保留门槛。";
    return deepFreeze(preview);
  }

  function evaluateProfile(profile) {
    const source = isObjectRecord(profile) ? profile : {};
    const settings = isObjectRecord(source.autoCaptureSettings) ? source.autoCaptureSettings : {};
    const policy = normalizeGrowthRulePolicy(settings.growthRulePolicy);
    const rawPets = Array.isArray(source.petInstances)
      ? source.petInstances
      : (Array.isArray(source.pets) ? source.pets : []);
    const pets = rawPets.filter(isObjectRecord);
    const items = pets.slice(0, maxPets).map((pet) => evaluatePet(pet, policy));
    const summary = {
      total: items.length,
      wouldKeep: items.filter((entry) => entry.status === "would_keep").length,
      wouldHandle: items.filter((entry) => entry.status === "would_handle").length,
      observing: items.filter((entry) => entry.status === "observing").length,
      unavailable: items.filter((entry) => entry.status === "unavailable").length,
      notConfigured: items.filter((entry) => entry.status === "not_configured").length,
    };
    return deepFreeze({
      schemaVersion: GROWTH_RULE_PREVIEW_SCHEMA_VERSION,
      dryRun: true,
      retainPet: true,
      mutationCount: 0,
      configured: growthRulePolicyConfigured(policy),
      policy,
      summary,
      items,
      totalPetCount: pets.length,
      truncated: pets.length > items.length,
    });
  }

  return Object.freeze({evaluatePet, evaluateProfile});
}

module.exports = Object.freeze({
  GROWTH_RULE_POLICY_SCHEMA_VERSION,
  GROWTH_RULE_PREVIEW_SCHEMA_VERSION,
  MAX_PREVIEW_PETS,
  createPetObservedGrowthRulePreview,
  defaultGrowthRulePolicy,
  growthRulePolicyConfigured,
  normalizeGrowthRulePolicy,
  strictPlayerGrowthRulePolicy,
});
