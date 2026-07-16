"use strict";

const AUTO_CAPTURE_SETTINGS_ACTION_ID = "auto_capture_settings_update";

const TARGET_MODES = new Set(["all", "codex"]);
const LEVEL_COMPARATORS = new Set(["<", "=", ">"]);
const NO_TARGET_ACTIONS = new Set(["battle", "escape"]);

const LIMITS = Object.freeze({
  hpPercent: Object.freeze({min: 1, max: 100, fallback: 100}),
  levelValue: Object.freeze({min: 1, max: 999, fallback: 1}),
  capturePetSkillSlot: Object.freeze({min: 1, max: 7, fallback: 2}),
  lowPowerThreshold: Object.freeze({min: 0, max: 9999, fallback: 31}),
  targetManualTextLength: 24,
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

function createAutoCaptureSettingsRules(options = {}) {
  const emptyHandToolId = String(options.emptyHandToolId || "empty_hand").trim().toLowerCase() || "empty_hand";
  const resolveForm = typeof options.resolveForm === "function" ? options.resolveForm : () => null;
  const normalizeCaptureToolId = typeof options.normalizeCaptureToolId === "function"
    ? options.normalizeCaptureToolId
    : () => emptyHandToolId;

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
    return {
      ok: true,
      settings: normalizeSettings(payload.settings, {forceAutoDiscardLowPowerDisabled: true}),
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
    const normalized = normalizePlayerUpdate(payload);
    if (!normalized.ok) {
      return normalized;
    }
    profile.autoCaptureSettings = normalized.settings;
    return {
      ok: true,
      settings: normalized.settings,
      message: "自动捕捉设置已保存。",
    };
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
  createAutoCaptureSettingsRules,
};
