"use strict";

const {
  defaultGrowthRulePolicy,
  normalizeGrowthRulePolicy,
  strictPlayerGrowthRulePolicy,
} = require("./pet-observed-growth-rule-preview");

const AUTO_CAPTURE_SETTINGS_ACTION_ID = "auto_capture_settings_update";
const GROWTH_RULE_POLICY_KEY = "growthRulePolicy";

const TARGET_MODES = new Set(["all", "codex"]);
const LEVEL_COMPARATORS = new Set(["<", "=", ">"]);
const NO_TARGET_ACTIONS = new Set(["battle", "escape"]);
const FILTER_POLICY_LEGACY_SCHEMA_VERSION = 1;
const FILTER_POLICY_SCHEMA_VERSION = 2;
const FILTER_ELEMENT_MODES = new Set(["any", "all"]);
const FILTER_ELEMENT_IDS = Object.freeze(["fire", "water", "earth", "wind"]);
const FILTER_ELEMENT_ID_SET = new Set(FILTER_ELEMENT_IDS);
const FILTER_LEVEL_ONE_STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);

const LIMITS = Object.freeze({
  hpPercent: Object.freeze({min: 1, max: 100, fallback: 100}),
  levelValue: Object.freeze({min: 1, max: 999, fallback: 1}),
  capturePetSkillSlot: Object.freeze({min: 1, max: 7, fallback: 2}),
  lowPowerThreshold: Object.freeze({min: 0, max: 9999, fallback: 31}),
  targetManualTextLength: 24,
  filterLineIds: Object.freeze({maxCount: 32}),
  filterElementIds: Object.freeze({maxCount: 4}),
  filterElementMinPoints: Object.freeze({min: 1, max: 10, fallback: 1}),
  filterMaxOwnedSameForm: Object.freeze({min: 0, max: 999, fallback: 0}),
  filterLevelOneStat: Object.freeze({min: 0, max: 999999, fallback: 0}),
  filterLevelOnePercentile: Object.freeze({min: 0, max: 100, fallback: 0}),
});

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }
  return Boolean(fallback);
}

function normalizeInteger(value, limits) {
  const parsed = Number(value);
  const integer = Number.isFinite(parsed) ? Math.trunc(parsed) : limits.fallback;
  return Math.max(limits.min, Math.min(limits.max, integer));
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function cleanManualText(value) {
  const normalized = String(value ?? "")
    .replace(/[\r\n]/g, "")
    .replace(/\t/g, " ")
    .trim()
    .replace(/ {2,}/g, " ");
  return Array.from(normalized).slice(0, LIMITS.targetManualTextLength).join("");
}

function resolvedFormExists(resolved) {
  if (resolved === true) {
    return true;
  }
  return isObjectRecord(resolved) && Object.keys(resolved).length > 0;
}

function resolvedLineExists(resolved) {
  return resolvedFormExists(resolved);
}

function defaultFilterPolicy() {
  return {
    schemaVersion: FILTER_POLICY_SCHEMA_VERSION,
    lineIds: [],
    element: {
      mode: "any",
      ids: [],
      minPoints: 1,
    },
    onlyNewCodexForm: false,
    maxOwnedSameForm: 0,
    levelOneMinimumPercentiles: Object.fromEntries(FILTER_LEVEL_ONE_STAT_KEYS.map((key) => [key, 0])),
  };
}

function createAutoCaptureSettingsRules(options = {}) {
  const emptyHandToolId = String(options.emptyHandToolId || "empty_hand").trim().toLowerCase() || "empty_hand";
  const resolveForm = typeof options.resolveForm === "function" ? options.resolveForm : () => null;
  const resolveLine = typeof options.resolveLine === "function" ? options.resolveLine : () => null;
  const normalizeCaptureToolId = typeof options.normalizeCaptureToolId === "function"
    ? options.normalizeCaptureToolId
    : () => emptyHandToolId;
  const previewGrowthRules = typeof options.previewGrowthRules === "function"
    ? options.previewGrowthRules
    : null;

  function normalizeFormId(value) {
    const formId = String(value ?? "").trim();
    if (formId === "") {
      return "";
    }
    try {
      return resolvedFormExists(resolveForm(formId)) ? formId : "";
    } catch (_error) {
      return "";
    }
  }

  function normalizeToolId(value) {
    try {
      const normalized = String(normalizeCaptureToolId(value) || "").trim().toLowerCase();
      return normalized || emptyHandToolId;
    } catch (_error) {
      return emptyHandToolId;
    }
  }

  function lineExists(lineId) {
    try {
      return resolvedLineExists(resolveLine(lineId));
    } catch (_error) {
      return false;
    }
  }

  function normalizeLegacyLineIds(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    const result = [];
    for (const entry of value) {
      const lineId = String(entry ?? "").trim();
      if (
        lineId === ""
        || result.includes(lineId)
        || !lineExists(lineId)
        || result.length >= LIMITS.filterLineIds.maxCount
      ) {
        continue;
      }
      result.push(lineId);
    }
    return result;
  }

  function normalizeLegacyElementIds(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    const result = [];
    for (const entry of value) {
      const elementId = String(entry ?? "").trim().toLowerCase();
      if (
        !FILTER_ELEMENT_ID_SET.has(elementId)
        || result.includes(elementId)
        || result.length >= LIMITS.filterElementIds.maxCount
      ) {
        continue;
      }
      result.push(elementId);
    }
    return result;
  }

  function normalizeFilterPolicy(value) {
    const source = isObjectRecord(value) ? value : {};
    const elementSource = isObjectRecord(source.element) ? source.element : {};
    const percentileSource = (
      source.schemaVersion === FILTER_POLICY_SCHEMA_VERSION
      && isObjectRecord(source.levelOneMinimumPercentiles)
    ) ? source.levelOneMinimumPercentiles : {};
    return {
      schemaVersion: FILTER_POLICY_SCHEMA_VERSION,
      lineIds: normalizeLegacyLineIds(source.lineIds),
      element: {
        mode: normalizeEnum(elementSource.mode, FILTER_ELEMENT_MODES, "any"),
        ids: normalizeLegacyElementIds(elementSource.ids),
        minPoints: normalizeInteger(elementSource.minPoints, LIMITS.filterElementMinPoints),
      },
      onlyNewCodexForm: normalizeBoolean(source.onlyNewCodexForm, false),
      maxOwnedSameForm: normalizeInteger(source.maxOwnedSameForm, LIMITS.filterMaxOwnedSameForm),
      levelOneMinimumPercentiles: Object.fromEntries(FILTER_LEVEL_ONE_STAT_KEYS.map((key) => [
        key,
        normalizeInteger(percentileSource[key], LIMITS.filterLevelOnePercentile),
      ])),
    };
  }

  function invalidFilterPolicy() {
    return {
      ok: false,
      code: "auto_capture_filter_policy_invalid",
      message: "捕后公开筛选条件不正确，请检查系别、属性和 Lv1 四维分位。",
    };
  }

  function strictInteger(value, limits) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < limits.min || parsed > limits.max) {
      return null;
    }
    return parsed;
  }

  function normalizePlayerFilterPolicy(value) {
    if (
      !isObjectRecord(value)
      || ![FILTER_POLICY_LEGACY_SCHEMA_VERSION, FILTER_POLICY_SCHEMA_VERSION].includes(value.schemaVersion)
    ) {
      return invalidFilterPolicy();
    }
    if (!Array.isArray(value.lineIds) || value.lineIds.length > LIMITS.filterLineIds.maxCount) {
      return invalidFilterPolicy();
    }
    const lineIds = [];
    for (const entry of value.lineIds) {
      if (typeof entry !== "string") {
        return invalidFilterPolicy();
      }
      const lineId = entry.trim();
      if (lineId === "" || !lineExists(lineId)) {
        return invalidFilterPolicy();
      }
      if (!lineIds.includes(lineId)) {
        lineIds.push(lineId);
      }
    }

    if (!isObjectRecord(value.element)) {
      return invalidFilterPolicy();
    }
    const elementMode = String(value.element.mode ?? "").trim().toLowerCase();
    if (!FILTER_ELEMENT_MODES.has(elementMode)) {
      return invalidFilterPolicy();
    }
    if (!Array.isArray(value.element.ids) || value.element.ids.length > LIMITS.filterElementIds.maxCount) {
      return invalidFilterPolicy();
    }
    const elementIds = [];
    for (const entry of value.element.ids) {
      if (typeof entry !== "string") {
        return invalidFilterPolicy();
      }
      const elementId = entry.trim().toLowerCase();
      if (!FILTER_ELEMENT_ID_SET.has(elementId)) {
        return invalidFilterPolicy();
      }
      if (!elementIds.includes(elementId)) {
        elementIds.push(elementId);
      }
    }
    const minPoints = strictInteger(value.element.minPoints, LIMITS.filterElementMinPoints);
    const maxOwnedSameForm = strictInteger(value.maxOwnedSameForm, LIMITS.filterMaxOwnedSameForm);
    if (minPoints === null || maxOwnedSameForm === null || typeof value.onlyNewCodexForm !== "boolean") {
      return invalidFilterPolicy();
    }

    const levelOneMinimumPercentiles = Object.fromEntries(FILTER_LEVEL_ONE_STAT_KEYS.map((key) => [key, 0]));
    if (value.schemaVersion === FILTER_POLICY_LEGACY_SCHEMA_VERSION) {
      if (
        !isObjectRecord(value.levelOneFourV)
        || Object.keys(value.levelOneFourV).length !== FILTER_LEVEL_ONE_STAT_KEYS.length
      ) {
        return invalidFilterPolicy();
      }
      for (const key of FILTER_LEVEL_ONE_STAT_KEYS) {
        const range = value.levelOneFourV[key];
        if (!isObjectRecord(range)) {
          return invalidFilterPolicy();
        }
        const min = strictInteger(range.min, LIMITS.filterLevelOneStat);
        const max = strictInteger(range.max, LIMITS.filterLevelOneStat);
        if (min === null || max === null || (min > 0 && max > 0 && min > max)) {
          return invalidFilterPolicy();
        }
      }
    } else {
      if (
        !isObjectRecord(value.levelOneMinimumPercentiles)
        || Object.keys(value.levelOneMinimumPercentiles).length !== FILTER_LEVEL_ONE_STAT_KEYS.length
      ) {
        return invalidFilterPolicy();
      }
      for (const key of FILTER_LEVEL_ONE_STAT_KEYS) {
        const percentile = strictInteger(
          value.levelOneMinimumPercentiles[key],
          LIMITS.filterLevelOnePercentile,
        );
        if (percentile === null) {
          return invalidFilterPolicy();
        }
        levelOneMinimumPercentiles[key] = percentile;
      }
    }

    return {
      ok: true,
      policy: {
        schemaVersion: FILTER_POLICY_SCHEMA_VERSION,
        lineIds,
        element: {mode: elementMode, ids: elementIds, minPoints},
        onlyNewCodexForm: value.onlyNewCodexForm,
        maxOwnedSameForm,
        levelOneMinimumPercentiles,
      },
    };
  }

  function normalizeSettings(value, policy = {}) {
    const source = isObjectRecord(value) ? value : {};
    const autoDiscardLowPower = policy.forceAutoDiscardLowPowerDisabled === true
      ? false
      : normalizeBoolean(source.autoDiscardLowPower, false);
    return {
      enabled: normalizeBoolean(source.enabled, false),
      targetMode: normalizeEnum(source.targetMode, TARGET_MODES, "all"),
      targetFormId: normalizeFormId(source.targetFormId),
      targetManualText: cleanManualText(source.targetManualText),
      hpPercent: normalizeInteger(source.hpPercent, LIMITS.hpPercent),
      levelComparator: normalizeEnum(source.levelComparator, LEVEL_COMPARATORS, "="),
      levelValue: normalizeInteger(source.levelValue, LIMITS.levelValue),
      preferredToolId: normalizeToolId(source.preferredToolId ?? emptyHandToolId),
      noTargetAction: normalizeEnum(source.noTargetAction, NO_TARGET_ACTIONS, "escape"),
      capturePetSkillSlot: normalizeInteger(source.capturePetSkillSlot, LIMITS.capturePetSkillSlot),
      autoDiscardLowPower,
      lowPowerThreshold: normalizeInteger(source.lowPowerThreshold, LIMITS.lowPowerThreshold),
      filterPolicy: normalizeFilterPolicy(source.filterPolicy),
      [GROWTH_RULE_POLICY_KEY]: normalizeGrowthRulePolicy(source[GROWTH_RULE_POLICY_KEY]),
    };
  }

  function defaultSettings() {
    return normalizeSettings({});
  }

  function normalizePlayerUpdate(payload) {
    if (
      !isObjectRecord(payload)
      || Object.keys(payload).length !== 1
      || !Object.hasOwn(payload, "settings")
      || !isObjectRecord(payload.settings)
    ) {
      return {
        ok: false,
        code: "auto_capture_settings_payload_invalid",
        message: "自动捕捉设置请求不正确。",
      };
    }
    const hasFilterPolicy = Object.hasOwn(payload.settings, "filterPolicy");
    const normalizedFilterPolicy = hasFilterPolicy
      ? normalizePlayerFilterPolicy(payload.settings.filterPolicy)
      : null;
    if (normalizedFilterPolicy && !normalizedFilterPolicy.ok) {
      return normalizedFilterPolicy;
    }
    const hasGrowthRulePolicy = Object.hasOwn(payload.settings, GROWTH_RULE_POLICY_KEY);
    const normalizedGrowthRulePolicy = hasGrowthRulePolicy
      ? strictPlayerGrowthRulePolicy(payload.settings[GROWTH_RULE_POLICY_KEY])
      : null;
    if (normalizedGrowthRulePolicy && !normalizedGrowthRulePolicy.ok) {
      return normalizedGrowthRulePolicy;
    }
    const settings = normalizeSettings(payload.settings, {forceAutoDiscardLowPowerDisabled: true});
    if (normalizedFilterPolicy) {
      settings.filterPolicy = normalizedFilterPolicy.policy;
    }
    if (normalizedGrowthRulePolicy) {
      settings[GROWTH_RULE_POLICY_KEY] = normalizedGrowthRulePolicy.policy;
    }
    return {
      ok: true,
      settings,
    };
  }

  function applyPlayerUpdate(profile, payload) {
    if (!isObjectRecord(profile)) {
      return {
        ok: false,
        code: "profile_missing",
        message: "请先创建角色档案。",
      };
    }
    const existingFilterPolicy = normalizeSettings(profile.autoCaptureSettings).filterPolicy;
    const existingGrowthRulePolicy = normalizeSettings(profile.autoCaptureSettings)[GROWTH_RULE_POLICY_KEY];
    const normalized = normalizePlayerUpdate(payload);
    if (!normalized.ok) {
      return normalized;
    }
    if (!Object.hasOwn(payload.settings, "filterPolicy")) {
      normalized.settings.filterPolicy = existingFilterPolicy;
    }
    if (!Object.hasOwn(payload.settings, GROWTH_RULE_POLICY_KEY)) {
      normalized.settings[GROWTH_RULE_POLICY_KEY] = existingGrowthRulePolicy;
    }
    profile.autoCaptureSettings = normalized.settings;
    const result = {
      ok: true,
      settings: normalized.settings,
      message: "自动捕捉设置已保存。",
    };
    if (previewGrowthRules) {
      try {
        const preview = previewGrowthRules(profile);
        if (isObjectRecord(preview)) {
          result.growthRulePreview = preview;
        }
      } catch (_error) {
        // Preview is read-only guidance. A temporary preview failure must not
        // turn a validated settings save into a second, ambiguous mutation.
      }
    }
    return result;
  }

  return Object.freeze({
    defaultSettings,
    normalizeSettings,
    normalizePlayerUpdate,
    applyPlayerUpdate,
  });
}

module.exports = {
  AUTO_CAPTURE_SETTINGS_ACTION_ID,
  FILTER_ELEMENT_IDS,
  FILTER_LEVEL_ONE_STAT_KEYS,
  FILTER_POLICY_LEGACY_SCHEMA_VERSION,
  FILTER_POLICY_SCHEMA_VERSION,
  GROWTH_RULE_POLICY_KEY,
  createAutoCaptureSettingsRules,
  defaultGrowthRulePolicy,
  defaultFilterPolicy,
};
