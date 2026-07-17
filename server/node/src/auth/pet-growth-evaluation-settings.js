"use strict";

const {
  normalizeGrowthRulePolicy,
  strictPlayerGrowthRulePolicy,
} = require("./pet-observed-growth-rule-preview");

const PET_GROWTH_EVALUATION_SETTINGS_ACTION_ID = "pet_growth_evaluation_settings_update";
const LEGACY_AUTO_CAPTURE_SETTINGS_KEY = "growthRulePolicy";

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createPetGrowthEvaluationSettingsRules(options = {}) {
  const normalizeAutoCaptureSettings = typeof options.normalizeAutoCaptureSettings === "function"
    ? options.normalizeAutoCaptureSettings
    : (value) => (isObjectRecord(value) ? clone(value) : {});

  function normalizeProfilePolicy(profile) {
    const settings = normalizeAutoCaptureSettings(
      isObjectRecord(profile) ? profile.autoCaptureSettings : {},
    );
    return normalizeGrowthRulePolicy(settings[LEGACY_AUTO_CAPTURE_SETTINGS_KEY]);
  }

  function applyPlayerUpdate(profile, payload) {
    if (!isObjectRecord(profile)) {
      return {ok: false, code: "profile_missing", message: "请先创建角色档案。"};
    }
    if (
      !isObjectRecord(payload)
      || Object.keys(payload).length !== 1
      || !Object.hasOwn(payload, "policy")
    ) {
      return {
        ok: false,
        code: "pet_growth_evaluation_settings_payload_invalid",
        message: "成长评估设置请求不正确。",
      };
    }
    const normalized = strictPlayerGrowthRulePolicy(payload.policy);
    if (!normalized.ok) {
      return {
        ok: false,
        code: "pet_growth_evaluation_policy_invalid",
        message: "成长评估参考线不正确，请检查后再保存。",
      };
    }
    const settings = normalizeAutoCaptureSettings(profile.autoCaptureSettings);
    settings[LEGACY_AUTO_CAPTURE_SETTINGS_KEY] = normalized.policy;
    profile.autoCaptureSettings = settings;
    return {
      ok: true,
      message: "人工成长评估参考线已保存。",
      growthEvaluationPolicy: clone(normalized.policy),
      retainPet: true,
      mutationCount: 0,
    };
  }

  return Object.freeze({
    applyPlayerUpdate,
    normalizeProfilePolicy,
  });
}

module.exports = Object.freeze({
  LEGACY_AUTO_CAPTURE_SETTINGS_KEY,
  PET_GROWTH_EVALUATION_SETTINGS_ACTION_ID,
  createPetGrowthEvaluationSettingsRules,
});
