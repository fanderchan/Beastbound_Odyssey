"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {isDeepStrictEqual} = require("node:util");
const {
  BINDING_IDS,
  CURRENCY_IDS,
} = require("./currency-wallet");

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const DEFAULT_POLICY_PATH = path.join(
  REPO_ROOT,
  "client/godot/data/balance/pet_paid_reset_policy.json",
);
const DEFAULT_TEMPLATE_PATH = path.join(REPO_ROOT, "client/godot/data/pet_templates.json");
const PET_PAID_RESET_POLICY_SCHEMA_VERSION = 1;
const PET_PAID_RESET_POLICY_ID = "pet_paid_reset_policy_v1";
const PET_PAID_RESET_CONFIG_SCHEMA_VERSION = 1;
const PET_PAID_RESET_MAX_PRICE = 10000000;
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;
const ACQUISITION_TIERS = Object.freeze([
  "common_wild",
  "rare_wild",
  "boss_reward",
  "floor_reward",
  "quest",
  "event",
  "commercial",
  "rebirth",
  "evolution",
  "fusion",
]);
const RESET_CONTRACT = Object.freeze({
  pricingMode: "fixed_per_operation",
  unlimited: true,
  resetLevel: 1,
  resetRebirthStage: 0,
  clearBindingOnSuccess: true,
  refundPolicy: "technical_transaction_rollback_only",
});

function createPetPaidResetPolicyCatalog(options = {}) {
  const policyPath = path.resolve(String(options.policyPath || DEFAULT_POLICY_PATH));
  const templatePath = path.resolve(String(options.templatePath || DEFAULT_TEMPLATE_PATH));
  const policyDocument = readJsonDocument(policyPath, "policy");
  const templateDocument = readJsonDocument(templatePath, "templates");
  return normalizePetPaidResetPolicyCatalog(policyDocument, templateDocument, {
    policyPath,
    templatePath,
  });
}

function normalizePetPaidResetPolicyCatalog(policyValue, templateValue, options = {}) {
  const policy = strictRecord(policyValue, "catalog");
  exactFields(
    policy,
    ["schemaVersion", "policyId", "resetContract", "walletPolicies", "priceTiers", "formPolicies"],
    "catalog",
  );
  if (policy.schemaVersion !== PET_PAID_RESET_POLICY_SCHEMA_VERSION) {
    throw catalogError("catalog.schemaVersion", "付费重置价格目录版本不受支持。");
  }
  if (policy.policyId !== PET_PAID_RESET_POLICY_ID) {
    throw catalogError("catalog.policyId", "付费重置价格目录标识不正确。");
  }
  const resetContract = normalizeResetContract(policy.resetContract);
  const walletPolicies = strictArray(policy.walletPolicies, "catalog.walletPolicies")
    .map((entry, index) => normalizeWalletPolicy(entry, index));
  const walletPoliciesById = uniqueRecord(
    walletPolicies,
    "walletPolicyId",
    "catalog.walletPolicies",
  );
  if (walletPolicies.length < 1) {
    throw catalogError("catalog.walletPolicies", "至少需要一种钱包扣款策略。");
  }
  const priceTiers = strictArray(policy.priceTiers, "catalog.priceTiers")
    .map((entry, index) => normalizePriceTier(entry, index, walletPoliciesById));
  const priceTiersById = uniqueRecord(priceTiers, "priceTierId", "catalog.priceTiers");
  if (priceTiers.length < 1) {
    throw catalogError("catalog.priceTiers", "至少需要一个价格档。");
  }
  const templateForms = normalizeTemplateForms(templateValue);
  const templateFormsById = uniqueRecord(templateForms, "formId", "templates.forms");
  const formPolicies = strictArray(policy.formPolicies, "catalog.formPolicies")
    .map((entry, index) => normalizeFormPolicy(entry, index, priceTiersById, templateFormsById));
  const formPoliciesById = uniqueRecord(formPolicies, "formId", "catalog.formPolicies");
  const templateFormIds = Object.keys(templateFormsById).sort();
  const policyFormIds = Object.keys(formPoliciesById).sort();
  if (!isDeepStrictEqual(policyFormIds, templateFormIds)) {
    const missing = templateFormIds.filter((formId) => !Object.hasOwn(formPoliciesById, formId));
    const unknown = policyFormIds.filter((formId) => !Object.hasOwn(templateFormsById, formId));
    throw catalogError(
      "catalog.formPolicies",
      `付费重置价格目录必须精确覆盖宠物形态；缺少=${missing.join(",") || "无"}；未知=${unknown.join(",") || "无"}。`,
    );
  }
  return deepFreeze({
    schemaVersion: PET_PAID_RESET_POLICY_SCHEMA_VERSION,
    policyId: PET_PAID_RESET_POLICY_ID,
    resetContract,
    walletPolicies,
    walletPoliciesById,
    priceTiers,
    priceTiersById,
    formPolicies,
    formPoliciesById,
    formNamesById: Object.freeze(Object.fromEntries(templateForms.map((form) => [form.formId, form.formName]))),
    policyPath: String(options.policyPath || ""),
    templatePath: String(options.templatePath || ""),
  });
}

function defaultPetPaidResetConfig() {
  return {
    schemaVersion: PET_PAID_RESET_CONFIG_SCHEMA_VERSION,
    revision: 0,
    tierOverrides: {},
    formOverrides: {},
    updatedAt: "",
    updatedBy: "",
  };
}

function readPetPaidResetConfig(value, catalog) {
  try {
    return {ok: true, config: normalizePetPaidResetConfig(value, catalog)};
  } catch (error) {
    return {
      ok: false,
      code: String(error && error.code || "pet_paid_reset_config_invalid"),
      message: String(error && error.message || "宠物重置价格配置无效。"),
    };
  }
}

function normalizePetPaidResetConfig(value, catalog) {
  requireCatalog(catalog);
  if (value === undefined || value === null || (isRecord(value) && Object.keys(value).length === 0)) {
    return defaultPetPaidResetConfig();
  }
  const config = strictConfigRecord(value, "config");
  exactConfigFields(
    config,
    ["schemaVersion", "revision", "tierOverrides", "formOverrides", "updatedAt", "updatedBy"],
    "config",
  );
  if (config.schemaVersion !== PET_PAID_RESET_CONFIG_SCHEMA_VERSION) {
    throw configError("config.schemaVersion", "宠物重置价格配置版本不受支持。");
  }
  const revision = strictNonNegativeInteger(config.revision, "config.revision", configError);
  const tierOverrides = normalizeOverrideMap(
    config.tierOverrides,
    catalog.priceTiersById,
    catalog.walletPoliciesById,
    "config.tierOverrides",
  );
  const formOverrides = normalizeOverrideMap(
    config.formOverrides,
    catalog.formPoliciesById,
    catalog.walletPoliciesById,
    "config.formOverrides",
  );
  const updatedAt = String(config.updatedAt || "");
  const updatedBy = String(config.updatedBy || "").trim();
  if (revision === 0) {
    if (Object.keys(tierOverrides).length > 0 || Object.keys(formOverrides).length > 0 || updatedAt !== "" || updatedBy !== "") {
      throw configError("config.revision", "初始价格配置不能携带覆盖项或更新人信息。");
    }
  } else {
    if (!canonicalIsoTimestamp(updatedAt)) {
      throw configError("config.updatedAt", "价格配置更新时间必须是规范UTC时间。");
    }
    if (updatedBy.length < 1 || updatedBy.length > 64) {
      throw configError("config.updatedBy", "价格配置更新人不能为空且不能超过64字符。");
    }
  }
  return {
    schemaVersion: PET_PAID_RESET_CONFIG_SCHEMA_VERSION,
    revision,
    tierOverrides,
    formOverrides,
    updatedAt,
    updatedBy,
  };
}

function buildUpdatedPetPaidResetConfig(currentValue, payloadValue, catalog, options = {}) {
  const currentRead = readPetPaidResetConfig(currentValue, catalog);
  if (!currentRead.ok) {
    return currentRead;
  }
  try {
    const payload = strictConfigRecord(payloadValue, "payload");
    exactConfigFields(payload, ["expectedRevision", "tierOverrides", "formOverrides"], "payload");
    const expectedRevision = strictNonNegativeInteger(
      payload.expectedRevision,
      "payload.expectedRevision",
      configError,
    );
    if (expectedRevision !== currentRead.config.revision) {
      return {
        ok: false,
        code: "pet_paid_reset_config_revision_conflict",
        message: "宠物重置价格配置已经变化，请刷新后重试。",
      };
    }
    const tierOverrides = normalizeOverrideMap(
      payload.tierOverrides,
      catalog.priceTiersById,
      catalog.walletPoliciesById,
      "payload.tierOverrides",
    );
    const formOverrides = normalizeOverrideMap(
      payload.formOverrides,
      catalog.formPoliciesById,
      catalog.walletPoliciesById,
      "payload.formOverrides",
    );
    if (
      isDeepStrictEqual(tierOverrides, currentRead.config.tierOverrides)
      && isDeepStrictEqual(formOverrides, currentRead.config.formOverrides)
    ) {
      return {ok: true, changed: false, config: currentRead.config};
    }
    const nowMs = Number(options.nowMs);
    const username = String(options.username || "").trim();
    if (!Number.isFinite(nowMs) || nowMs < 0 || username.length < 1 || username.length > 64) {
      throw configError("payload.metadata", "价格配置缺少有效更新人或服务器时间。");
    }
    const next = {
      schemaVersion: PET_PAID_RESET_CONFIG_SCHEMA_VERSION,
      revision: currentRead.config.revision + 1,
      tierOverrides,
      formOverrides,
      updatedAt: new Date(nowMs).toISOString(),
      updatedBy: username,
    };
    return {ok: true, changed: true, config: normalizePetPaidResetConfig(next, catalog)};
  } catch (error) {
    return {
      ok: false,
      code: String(error && error.code || "pet_paid_reset_config_invalid"),
      message: String(error && error.message || "宠物重置价格配置无效。"),
    };
  }
}

function resolvePetPaidResetQuote(catalog, configValue, formIdValue) {
  requireCatalog(catalog);
  const formId = String(formIdValue || "").trim();
  const formPolicy = catalog.formPoliciesById[formId];
  if (!formPolicy) {
    return {
      ok: false,
      code: "pet_paid_reset_form_unconfigured",
      message: "该宠物尚未配置重置价格，已安全阻止本次操作。",
    };
  }
  const configRead = readPetPaidResetConfig(configValue, catalog);
  if (!configRead.ok) {
    return configRead;
  }
  const config = configRead.config;
  const baseTier = catalog.priceTiersById[formPolicy.priceTierId];
  const tierOverride = config.tierOverrides[formPolicy.priceTierId] || null;
  const formOverride = config.formOverrides[formId] || null;
  const price = formOverride || tierOverride || baseTier;
  const walletPolicy = catalog.walletPoliciesById[price.walletPolicyId];
  if (!walletPolicy) {
    return {
      ok: false,
      code: "pet_paid_reset_config_invalid",
      message: "宠物重置钱包策略无效，已安全阻止本次操作。",
    };
  }
  return {
    ok: true,
    quote: {
      schemaVersion: PET_PAID_RESET_POLICY_SCHEMA_VERSION,
      policyId: catalog.policyId,
      configRevision: config.revision,
      formId,
      formName: catalog.formNamesById[formId] || formId,
      acquisitionTier: formPolicy.acquisitionTier,
      priceTierId: formPolicy.priceTierId,
      priceSource: formOverride ? "form_override" : tierOverride ? "tier_override" : "catalog_default",
      currencyId: price.currencyId,
      amount: price.amount,
      walletPolicy: cloneWalletPolicy(walletPolicy),
      resetContract: {...catalog.resetContract},
    },
  };
}

function publicPetPaidResetConfig(catalog, configValue) {
  const configRead = readPetPaidResetConfig(configValue, catalog);
  if (!configRead.ok) {
    return configRead;
  }
  const resolvedForms = [];
  for (const formPolicy of catalog.formPolicies) {
    const resolved = resolvePetPaidResetQuote(catalog, configRead.config, formPolicy.formId);
    if (!resolved.ok) {
      return resolved;
    }
    resolvedForms.push(resolved.quote);
  }
  return {
    ok: true,
    config: structuredClone(configRead.config),
    defaults: {
      schemaVersion: catalog.schemaVersion,
      policyId: catalog.policyId,
      resetContract: {...catalog.resetContract},
      walletPolicies: catalog.walletPolicies.map(cloneWalletPolicy),
      priceTiers: catalog.priceTiers.map((tier) => ({...tier})),
    },
    resolvedForms,
  };
}

function normalizeResetContract(value) {
  const contract = strictRecord(value, "catalog.resetContract");
  exactFields(contract, Object.keys(RESET_CONTRACT), "catalog.resetContract");
  for (const [field, expected] of Object.entries(RESET_CONTRACT)) {
    if (contract[field] !== expected) {
      throw catalogError(
        `catalog.resetContract.${field}`,
        "付费重置目录不能改变已确定的完整重置、不退款或不限次数规则。",
      );
    }
  }
  return {...RESET_CONTRACT};
}

function normalizeWalletPolicy(value, index) {
  const pathLabel = `catalog.walletPolicies[${index}]`;
  const policy = strictRecord(value, pathLabel);
  exactFields(policy, ["walletPolicyId", "allowedBindings", "debitOrder", "allowSplit"], pathLabel);
  const walletPolicyId = strictIdentifier(policy.walletPolicyId, `${pathLabel}.walletPolicyId`, catalogError);
  const allowedBindings = strictStringList(policy.allowedBindings, `${pathLabel}.allowedBindings`, BINDING_IDS);
  const debitOrder = strictStringList(policy.debitOrder, `${pathLabel}.debitOrder`, BINDING_IDS);
  if (allowedBindings.length < 1 || !isDeepStrictEqual([...allowedBindings].sort(), [...debitOrder].sort())) {
    throw catalogError(pathLabel, "钱包策略的允许绑定类型与扣款顺序必须一一对应。");
  }
  if (typeof policy.allowSplit !== "boolean" || policy.allowSplit !== (allowedBindings.length > 1)) {
    throw catalogError(`${pathLabel}.allowSplit`, "多钱包策略必须允许拆分，单钱包策略不能拆分。");
  }
  return {walletPolicyId, allowedBindings, debitOrder, allowSplit: policy.allowSplit};
}

function normalizePriceTier(value, index, walletPoliciesById) {
  const pathLabel = `catalog.priceTiers[${index}]`;
  const tier = strictRecord(value, pathLabel);
  exactFields(tier, ["priceTierId", "currencyId", "amount", "walletPolicyId"], pathLabel);
  const priceTierId = strictIdentifier(tier.priceTierId, `${pathLabel}.priceTierId`, catalogError);
  const currencyId = strictAllowedString(tier.currencyId, `${pathLabel}.currencyId`, CURRENCY_IDS, catalogError);
  const amount = strictPrice(tier.amount, `${pathLabel}.amount`, catalogError);
  const walletPolicyId = strictIdentifier(tier.walletPolicyId, `${pathLabel}.walletPolicyId`, catalogError);
  if (!Object.hasOwn(walletPoliciesById, walletPolicyId)) {
    throw catalogError(`${pathLabel}.walletPolicyId`, "价格档引用了不存在的钱包策略。");
  }
  return {priceTierId, currencyId, amount, walletPolicyId};
}

function normalizeFormPolicy(value, index, priceTiersById, templateFormsById) {
  const pathLabel = `catalog.formPolicies[${index}]`;
  const policy = strictRecord(value, pathLabel);
  exactFields(policy, ["formId", "acquisitionTier", "priceTierId"], pathLabel);
  const formId = strictIdentifier(policy.formId, `${pathLabel}.formId`, catalogError);
  const acquisitionTier = strictAllowedString(
    policy.acquisitionTier,
    `${pathLabel}.acquisitionTier`,
    ACQUISITION_TIERS,
    catalogError,
  );
  const priceTierId = strictIdentifier(policy.priceTierId, `${pathLabel}.priceTierId`, catalogError);
  if (!Object.hasOwn(templateFormsById, formId)) {
    throw catalogError(`${pathLabel}.formId`, "价格目录引用了不存在的宠物形态。");
  }
  if (!Object.hasOwn(priceTiersById, priceTierId)) {
    throw catalogError(`${pathLabel}.priceTierId`, "宠物形态引用了不存在的价格档。");
  }
  return {formId, acquisitionTier, priceTierId};
}

function normalizeTemplateForms(value) {
  const templates = strictRecord(value, "templates");
  const forms = strictArray(templates.forms, "templates.forms");
  if (forms.length < 1) {
    throw catalogError("templates.forms", "宠物模板没有任何形态。");
  }
  return forms.map((entry, index) => {
    const form = strictRecord(entry, `templates.forms[${index}]`);
    return {
      formId: strictIdentifier(form.formId, `templates.forms[${index}].formId`, catalogError),
      formName: String(form.formName || "").trim() || String(form.formId || "").trim(),
    };
  });
}

function normalizeOverrideMap(value, knownEntries, walletPoliciesById, pathLabel) {
  const source = strictConfigRecord(value, pathLabel);
  const result = {};
  for (const key of Object.keys(source).sort()) {
    if (!Object.hasOwn(knownEntries, key)) {
      throw configError(`${pathLabel}.${key}`, "价格覆盖引用了未知的价格档或宠物形态。");
    }
    const entryPath = `${pathLabel}.${key}`;
    const override = strictConfigRecord(source[key], entryPath);
    exactConfigFields(override, ["currencyId", "amount", "walletPolicyId"], entryPath);
    const currencyId = strictAllowedString(
      override.currencyId,
      `${entryPath}.currencyId`,
      CURRENCY_IDS,
      configError,
    );
    const amount = strictPrice(override.amount, `${entryPath}.amount`, configError);
    const walletPolicyId = strictIdentifier(
      override.walletPolicyId,
      `${entryPath}.walletPolicyId`,
      configError,
    );
    if (!Object.hasOwn(walletPoliciesById, walletPolicyId)) {
      throw configError(`${entryPath}.walletPolicyId`, "价格覆盖引用了不存在的钱包策略。");
    }
    result[key] = {currencyId, amount, walletPolicyId};
  }
  return result;
}

function readJsonDocument(filePath, role) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw catalogError(role, `无法读取宠物重置${role === "policy" ? "价格目录" : "模板目录"}：${error.message}`);
  }
}

function requireCatalog(value) {
  if (!isRecord(value) || value.policyId !== PET_PAID_RESET_POLICY_ID) {
    throw catalogError("catalog", "宠物重置价格目录尚未正确加载。");
  }
}

function uniqueRecord(entries, keyField, pathLabel) {
  const result = {};
  for (const entry of entries) {
    const key = String(entry[keyField] || "");
    if (Object.hasOwn(result, key)) {
      throw catalogError(pathLabel, `${keyField} 不允许重复：${key}`);
    }
    result[key] = entry;
  }
  return Object.freeze(result);
}

function strictStringList(value, pathLabel, allowed) {
  const entries = strictArray(value, pathLabel).map((entry) => String(entry || ""));
  if (new Set(entries).size !== entries.length || entries.some((entry) => !allowed.includes(entry))) {
    throw catalogError(pathLabel, "列表含重复项或未知值。");
  }
  return entries;
}

function strictAllowedString(value, pathLabel, allowed, errorFactory) {
  const normalized = String(value || "");
  if (!allowed.includes(normalized)) {
    throw errorFactory(pathLabel, "字段值不在允许范围内。");
  }
  return normalized;
}

function strictIdentifier(value, pathLabel, errorFactory) {
  const normalized = String(value || "");
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw errorFactory(pathLabel, "字段必须是规范的小写稳定标识。");
  }
  return normalized;
}

function strictPrice(value, pathLabel, errorFactory) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > PET_PAID_RESET_MAX_PRICE) {
    throw errorFactory(pathLabel, `价格必须是1-${PET_PAID_RESET_MAX_PRICE}之间的整数。`);
  }
  return value;
}

function strictNonNegativeInteger(value, pathLabel, errorFactory) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw errorFactory(pathLabel, "字段必须是非负安全整数。");
  }
  return value;
}

function exactFields(value, allowed, pathLabel) {
  const keys = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (!isDeepStrictEqual(keys, expected)) {
    throw catalogError(pathLabel, "字段不完整或包含未知字段。");
  }
}

function exactConfigFields(value, allowed, pathLabel) {
  const keys = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (!isDeepStrictEqual(keys, expected)) {
    throw configError(pathLabel, "字段不完整或包含未知字段。");
  }
}

function strictRecord(value, pathLabel) {
  if (!isRecord(value)) {
    throw catalogError(pathLabel, "必须是对象。");
  }
  return value;
}

function strictConfigRecord(value, pathLabel) {
  if (!isRecord(value)) {
    throw configError(pathLabel, "必须是对象。");
  }
  return value;
}

function strictArray(value, pathLabel) {
  if (!Array.isArray(value)) {
    throw catalogError(pathLabel, "必须是数组。");
  }
  return value;
}

function canonicalIsoTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function cloneWalletPolicy(value) {
  return {
    walletPolicyId: value.walletPolicyId,
    allowedBindings: [...value.allowedBindings],
    debitOrder: [...value.debitOrder],
    allowSplit: value.allowSplit,
  };
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function catalogError(pathLabel, message) {
  const error = new Error(`${message}（${pathLabel}）`);
  error.code = "pet_paid_reset_catalog_invalid";
  return error;
}

function configError(pathLabel, message) {
  const error = new Error(`${message}（${pathLabel}）`);
  error.code = "pet_paid_reset_config_invalid";
  return error;
}

module.exports = {
  ACQUISITION_TIERS,
  DEFAULT_POLICY_PATH,
  DEFAULT_TEMPLATE_PATH,
  PET_PAID_RESET_CONFIG_SCHEMA_VERSION,
  PET_PAID_RESET_MAX_PRICE,
  PET_PAID_RESET_POLICY_ID,
  PET_PAID_RESET_POLICY_SCHEMA_VERSION,
  RESET_CONTRACT,
  buildUpdatedPetPaidResetConfig,
  createPetPaidResetPolicyCatalog,
  defaultPetPaidResetConfig,
  normalizePetPaidResetConfig,
  normalizePetPaidResetPolicyCatalog,
  publicPetPaidResetConfig,
  readPetPaidResetConfig,
  resolvePetPaidResetQuote,
};
