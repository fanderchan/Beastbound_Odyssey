#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(scriptDir, "../references/skill-design-spec.schema.json");
const inputPath = process.argv[2];

if (!inputPath) {
  console.error("用法: validate_skill_design_spec.mjs <skill-design-spec.json|->");
  process.exit(2);
}

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const readStdin = async () => {
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    raw += chunk;
  }
  return raw;
};
let schema;
let input;
try {
  schema = readJson(schemaPath);
  input = inputPath === "-"
    ? JSON.parse(await readStdin())
    : readJson(path.resolve(inputPath));
} catch (error) {
  console.error(`技能设计合同读取失败: ${error.message}`);
  process.exit(2);
}

const errors = [];
const pointerPart = (value) => String(value).replaceAll("~", "~0").replaceAll("/", "~1");
const childPointer = (pointer, key) => `${pointer}/${pointerPart(key)}`;
const valueSummary = (value) => {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return String(value);
};
const sameJsonValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const typeMatches = (type, value) => {
  switch (type) {
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "null":
      return value === null;
    default:
      return false;
  }
};

function validateSchemaNode(schemaNode, value, pointer) {
  if (!schemaNode || typeof schemaNode !== "object" || Array.isArray(schemaNode)) {
    errors.push(`${pointer || "/"} schema 节点无效`);
    return;
  }

  if (Object.hasOwn(schemaNode, "const") && !sameJsonValue(value, schemaNode.const)) {
    errors.push(`${pointer || "/"} 必须等于 ${valueSummary(schemaNode.const)}`);
  }
  if (Array.isArray(schemaNode.enum) && !schemaNode.enum.some((entry) => sameJsonValue(entry, value))) {
    errors.push(`${pointer || "/"} 必须是 ${schemaNode.enum.map(valueSummary).join("、")} 之一`);
  }

  if (typeof schemaNode.type === "string" && !typeMatches(schemaNode.type, value)) {
    errors.push(`${pointer || "/"} 必须是 ${schemaNode.type}`);
    return;
  }

  if (typeof value === "string") {
    if (Number.isInteger(schemaNode.minLength) && value.length < schemaNode.minLength) {
      errors.push(`${pointer || "/"} 长度必须至少为 ${schemaNode.minLength}`);
    }
    if (typeof schemaNode.pattern === "string") {
      let pattern;
      try {
        pattern = new RegExp(schemaNode.pattern, "u");
      } catch (error) {
        errors.push(`${pointer || "/"} schema pattern 无效: ${error.message}`);
        return;
      }
      if (!pattern.test(value)) {
        errors.push(`${pointer || "/"} 不符合格式 ${schemaNode.pattern}`);
      }
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (typeof schemaNode.minimum === "number" && value < schemaNode.minimum) {
      errors.push(`${pointer || "/"} 必须大于或等于 ${schemaNode.minimum}`);
    }
    if (typeof schemaNode.maximum === "number" && value > schemaNode.maximum) {
      errors.push(`${pointer || "/"} 必须小于或等于 ${schemaNode.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (Number.isInteger(schemaNode.minItems) && value.length < schemaNode.minItems) {
      errors.push(`${pointer || "/"} 至少需要 ${schemaNode.minItems} 项`);
    }
    if (schemaNode.uniqueItems === true) {
      const seen = new Set();
      value.forEach((entry, index) => {
        const key = JSON.stringify(entry);
        if (seen.has(key)) {
          errors.push(`${childPointer(pointer, index)} 与同数组中的其他项重复`);
        }
        seen.add(key);
      });
    }
    if (schemaNode.items && typeof schemaNode.items === "object") {
      value.forEach((entry, index) => validateSchemaNode(
        schemaNode.items,
        entry,
        childPointer(pointer, index),
      ));
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = schemaNode.properties && typeof schemaNode.properties === "object"
      ? schemaNode.properties
      : {};
    if (Array.isArray(schemaNode.required)) {
      for (const key of schemaNode.required) {
        if (!Object.hasOwn(value, key)) {
          errors.push(`${childPointer(pointer, key)} 是必填字段`);
        }
      }
    }
    for (const [key, entry] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        validateSchemaNode(properties[key], entry, childPointer(pointer, key));
      } else if (schemaNode.additionalProperties === false) {
        errors.push(`${childPointer(pointer, key)} 不允许出现`);
      } else if (
        schemaNode.additionalProperties
        && typeof schemaNode.additionalProperties === "object"
        && !Array.isArray(schemaNode.additionalProperties)
      ) {
        validateSchemaNode(schemaNode.additionalProperties, entry, childPointer(pointer, key));
      }
    }
  }
}

const placeholderText = (value) => {
  const normalized = String(value).trim();
  const lowered = normalized.toLowerCase();
  return (
    normalized === ""
    || /^(?:tbd|todo)(?:$|[\s:：_-])/u.test(lowered)
    || normalized === "无"
    || /^[-—–]+$/u.test(normalized)
    || ["待定", "待补", "未定"].includes(normalized)
  );
};

function rejectPlaceholders(value, pointer = "") {
  if (typeof value === "string") {
    if (placeholderText(value)) {
      errors.push(`${pointer || "/"} 不能使用空白、TBD、无、横线或待定占位`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectPlaceholders(entry, childPointer(pointer, index)));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      rejectPlaceholders(entry, childPointer(pointer, key));
    }
  }
}

function validateSemanticRules(spec) {
  const deliveryStatus = String(spec.deliveryStatus || "");
  const blockers = Array.isArray(spec.blockers) ? spec.blockers : [];
  if (deliveryStatus === "blocked" && blockers.length === 0) {
    errors.push("/blockers deliveryStatus=blocked 时必须至少写明一个真实 blocker");
  }
  if (deliveryStatus !== "blocked" && blockers.length > 0) {
    errors.push("/blockers 只有 deliveryStatus=blocked 时才能保留 blocker");
  }

  const authority = spec.authority && typeof spec.authority === "object" ? spec.authority : {};
  const implementedStatuses = new Set(["implemented", "owner_review_pending", "approved"]);
  if (implementedStatuses.has(deliveryStatus) && authority.effectSupportVerified !== true) {
    errors.push("/authority/effectSupportVerified 已实现或更高状态必须为 true");
  }
  if (
    authority.effectSupportVerified === true
    && (!Array.isArray(authority.effectSupportEvidence) || authority.effectSupportEvidence.length === 0)
  ) {
    errors.push("/authority/effectSupportEvidence effectSupportVerified=true 时必须提供运行时证据");
  }

  const validation = spec.validation && typeof spec.validation === "object" ? spec.validation : {};
  if (!Number.isInteger(validation.simulationBattles) || validation.simulationBattles < 1000) {
    errors.push("/validation/simulationBattles 每个正式对局至少需要 1000 场");
  }
  if (validation.sideSwap !== true) {
    errors.push("/validation/sideSwap 正式模拟必须左右换边");
  }
  const formations = Array.isArray(validation.formations) ? validation.formations : [];
  for (const requiredFormation of ["1v1", "5v5", "10v10"]) {
    if (!formations.includes(requiredFormation)) {
      errors.push(`/validation/formations 缺少 ${requiredFormation}`);
    }
  }

  const evidence = validation.evidence && typeof validation.evidence === "object"
    ? validation.evidence
    : {};
  if (implementedStatuses.has(deliveryStatus)) {
    if (!Array.isArray(evidence.testResults) || evidence.testResults.length === 0) {
      errors.push("/validation/evidence/testResults 已实现或更高状态必须提供测试结果");
    }
    if (!Array.isArray(evidence.performance) || evidence.performance.length === 0) {
      errors.push("/validation/evidence/performance 已实现或更高状态必须提供性能证据");
    }
  }
  if (deliveryStatus === "owner_review_pending" || deliveryStatus === "approved") {
    if (!Array.isArray(evidence.screenshots) || evidence.screenshots.length === 0) {
      errors.push("/validation/evidence/screenshots owner 审核阶段必须提供截图");
    }
    if (!Array.isArray(evidence.videos) || evidence.videos.length === 0) {
      errors.push("/validation/evidence/videos owner 审核阶段必须提供 1× 录像");
    }
  }
  if (
    deliveryStatus === "owner_review_pending"
    && validation.ownerReviewStatus !== "owner_review_pending"
  ) {
    errors.push("/validation/ownerReviewStatus deliveryStatus=owner_review_pending 时必须同步为 owner_review_pending");
  }
  if (deliveryStatus === "approved" && validation.ownerReviewStatus !== "approved") {
    errors.push("/validation/ownerReviewStatus deliveryStatus=approved 时必须同步为 approved");
  }
  if (validation.ownerReviewStatus === "approved" && deliveryStatus !== "approved") {
    errors.push("/deliveryStatus ownerReviewStatus=approved 时必须同步为 approved");
  }

  const skill = spec.skill && typeof spec.skill === "object" ? spec.skill : {};
  const presentation = spec.presentation && typeof spec.presentation === "object" ? spec.presentation : {};
  const icon = presentation.icon && typeof presentation.icon === "object" ? presentation.icon : {};
  const skillId = String(skill.id || "");
  const expectedIconSuffix = skillId === "" ? "" : `/${skillId}.png`;
  if (expectedIconSuffix && !String(icon.runtimePath || "").endsWith(expectedIconSuffix)) {
    errors.push(`/presentation/icon/runtimePath 必须以精确技能 ID 文件名 ${skillId}.png 结尾`);
  }
  const expectedIconKind = skill.kind === "passive" ? "/passive/" : "/active/";
  if (String(icon.runtimePath || "") && !String(icon.runtimePath).includes(expectedIconKind)) {
    errors.push(`/presentation/icon/runtimePath ${skill.kind || "active"} 技能必须放在 ${expectedIconKind} 目录`);
  }

  const ai = spec.ai && typeof spec.ai === "object" ? spec.ai : {};
  const runtimeContexts = Array.isArray(ai.runtimeContexts) ? ai.runtimeContexts : [];
  const productionContexts = ["node_production_ai", "player_auto_battle", "human_command"];
  if (
    skill.kind === "active"
    && deliveryStatus !== "blocked"
    && !runtimeContexts.some((context) => productionContexts.includes(context))
  ) {
    errors.push("/ai/runtimeContexts 正式主动技能不能只声明 isolated_spectator_lab");
  }
}

validateSchemaNode(schema, input, "");
rejectPlaceholders(input);
validateSemanticRules(input);

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log(
  `技能设计合同通过: ${input.skill.id} / ${input.skill.label}`
  + ` schema=${input.schemaVersion} status=${input.deliveryStatus}`,
);
