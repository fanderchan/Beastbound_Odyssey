#!/usr/bin/env node

import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {isDeepStrictEqual} from "node:util";
import {fileURLToPath} from "node:url";

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const repoRootOptionIndex = args.indexOf("--repo-root");
if (
  repoRootOptionIndex >= 0
  && (
    !args[repoRootOptionIndex + 1]
    || args[repoRootOptionIndex + 1].startsWith("--")
  )
) {
  console.error("--repo-root 必须提供目录");
  process.exit(2);
}
const consumedIndexes = new Set(
  repoRootOptionIndex >= 0
    ? [repoRootOptionIndex, repoRootOptionIndex + 1]
    : [],
);
const filename = args.find(
  (arg, index) => !consumedIndexes.has(index) && !arg.startsWith("--"),
);
if (!filename) {
  console.error(
    "用法: node validate_pet_design_spec.mjs <pet-design.json> "
      + "[--json] [--repo-root <path>]",
  );
  process.exit(2);
}

let spec;
try {
  spec = JSON.parse(fs.readFileSync(path.resolve(filename), "utf8"));
} catch (error) {
  console.error(`无法读取设计合同: ${error.message}`);
  process.exit(2);
}

let petDesignSchema;
try {
  petDesignSchema = JSON.parse(
    fs.readFileSync(new URL("../references/pet-design-spec.schema.json", import.meta.url), "utf8"),
  );
} catch (error) {
  console.error(`无法读取设计合同 schema: ${error.message}`);
  process.exit(2);
}

const errors = [];
const warnings = [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => typeof value === "string" ? value.trim() : "";
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRepoRoot = path.resolve(scriptDirectory, "../../../..");
const repoRoot = path.resolve(
  repoRootOptionIndex >= 0
    ? args[repoRootOptionIndex + 1]
    : projectRepoRoot,
);
let realRepoRoot;
try {
  realRepoRoot = fs.realpathSync(repoRoot);
} catch (error) {
  console.error(`repo-root 不存在或不可读: ${error.message}`);
  process.exit(2);
}
const portraitAuditPath = path.join(
  projectRepoRoot,
  "tools/audit_pet_portrait_catalog.py",
);

function jsonSchemaTypeMatches(value, expectedType) {
  switch (expectedType) {
    case "array":
      return Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "null":
      return value === null;
    case "number":
      return finite(value);
    case "object":
      return object(value);
    case "string":
      return typeof value === "string";
    default:
      return false;
  }
}

function resolveLocalSchemaReference(reference) {
  if (typeof reference !== "string" || !reference.startsWith("#/")) return null;
  let current = petDesignSchema;
  for (const rawToken of reference.slice(2).split("/")) {
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!object(current) || !Object.hasOwn(current, token)) return null;
    current = current[token];
  }
  return current;
}

function jsonSchemaErrors(value, schema, key = "$") {
  if (!object(schema)) return [`${key} 的 schema 必须是对象`];
  const found = [];

  if (Object.hasOwn(schema, "$ref")) {
    const referenced = resolveLocalSchemaReference(schema.$ref);
    if (!referenced) {
      found.push(`${key} 引用了无法解析的 schema ${schema.$ref}`);
    } else {
      found.push(...jsonSchemaErrors(value, referenced, key));
    }
  }

  if (Object.hasOwn(schema, "type")) {
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expectedTypes.some((expectedType) => jsonSchemaTypeMatches(value, expectedType))) {
      found.push(`${key} 必须是 ${expectedTypes.join(" 或 ")}`);
      return found;
    }
  }

  if (Object.hasOwn(schema, "const") && !isDeepStrictEqual(value, schema.const)) {
    found.push(`${key} 必须等于 ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => isDeepStrictEqual(value, candidate))) {
    found.push(`${key} 必须是枚举值 ${schema.enum.map((candidate) => JSON.stringify(candidate)).join(", ")}`);
  }

  if (Array.isArray(schema.allOf)) {
    for (const child of schema.allOf) found.push(...jsonSchemaErrors(value, child, key));
  }
  if (Array.isArray(schema.oneOf)) {
    const matchingBranches = schema.oneOf.filter(
      (child) => jsonSchemaErrors(value, child, key).length === 0,
    ).length;
    if (matchingBranches !== 1) found.push(`${key} 必须且只能匹配一个 oneOf 分支`);
  }
  if (object(schema.if) && jsonSchemaErrors(value, schema.if, key).length === 0 && object(schema.then)) {
    found.push(...jsonSchemaErrors(value, schema.then, key));
  }
  if (object(schema.not) && jsonSchemaErrors(value, schema.not, key).length === 0) {
    found.push(`${key} 命中了 schema 禁止的组合`);
  }

  if (object(value)) {
    if (Array.isArray(schema.required)) {
      for (const requiredKey of schema.required) {
        if (!Object.hasOwn(value, requiredKey)) found.push(`${key}.${requiredKey} 是必填字段`);
      }
    }
    const properties = object(schema.properties) ? schema.properties : {};
    for (const [propertyKey, child] of Object.entries(properties)) {
      if (Object.hasOwn(value, propertyKey)) {
        found.push(...jsonSchemaErrors(value[propertyKey], child, `${key}.${propertyKey}`));
      }
    }
    for (const propertyKey of Object.keys(value)) {
      if (Object.hasOwn(properties, propertyKey)) continue;
      if (schema.additionalProperties === false) {
        found.push(`${key}.${propertyKey} 是不允许的字段`);
      } else if (object(schema.additionalProperties)) {
        found.push(...jsonSchemaErrors(value[propertyKey], schema.additionalProperties, `${key}.${propertyKey}`));
      }
    }
  }

  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      found.push(`${key} 至少需要 ${schema.minItems} 项`);
    }
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
      found.push(`${key} 最多允许 ${schema.maxItems} 项`);
    }
    if (schema.uniqueItems === true) {
      for (let index = 0; index < value.length; index += 1) {
        if (value.slice(0, index).some((candidate) => isDeepStrictEqual(candidate, value[index]))) {
          found.push(`${key} 不能包含重复项`);
          break;
        }
      }
    }
    const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
    for (let index = 0; index < Math.min(prefixItems.length, value.length); index += 1) {
      found.push(...jsonSchemaErrors(value[index], prefixItems[index], `${key}[${index}]`));
    }
    if (object(schema.items)) {
      const start = prefixItems.length;
      for (let index = start; index < value.length; index += 1) {
        found.push(...jsonSchemaErrors(value[index], schema.items, `${key}[${index}]`));
      }
    }
    if (object(schema.contains)) {
      const containsMatch = value.some(
        (candidate) => jsonSchemaErrors(candidate, schema.contains, key).length === 0,
      );
      if (!containsMatch) found.push(`${key} 缺少 contains 要求的成员`);
    }
  }

  if (typeof value === "string") {
    if (Number.isInteger(schema.minLength) && Array.from(value).length < schema.minLength) {
      found.push(`${key} 长度不能少于 ${schema.minLength}`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) {
      found.push(`${key} 不符合格式 ${schema.pattern}`);
    }
  }

  if (finite(value)) {
    if (finite(schema.minimum) && value < schema.minimum) {
      found.push(`${key} 不能小于 ${schema.minimum}`);
    }
    if (finite(schema.maximum) && value > schema.maximum) {
      found.push(`${key} 不能大于 ${schema.maximum}`);
    }
  }

  return found;
}

function requireObject(value, key) {
  if (!object(value)) {
    errors.push(`${key} 必须是对象`);
    return {};
  }
  return value;
}

function requireExactObject(value, key, expectedKeys) {
  const record = requireObject(value, key);
  const expected = new Set(expectedKeys);
  for (const actualKey of Object.keys(record)) {
    if (!expected.has(actualKey)) errors.push(`${key} 不允许字段 ${actualKey}`);
  }
  return record;
}

function requireText(value, key) {
  if (typeof value !== "string") errors.push(`${key} 必须是字符串`);
  else if (!value.trim()) errors.push(`${key} 不能为空`);
}

function requireStringArray(value, key, minimum = 0) {
  if (!Array.isArray(value)) {
    errors.push(`${key} 必须是数组`);
    return [];
  }
  const normalized = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !item.trim()) {
      errors.push(`${key}[${index}] 必须是非空字符串`);
    } else {
      normalized.push(item.trim());
    }
  }
  if (normalized.length < minimum) errors.push(`${key} 至少需要 ${minimum} 项`);
  if (new Set(normalized).size !== normalized.length) errors.push(`${key} 不能包含重复项`);
  return normalized;
}

function sameStringMembers(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value) => right.includes(value));
}

function requireSha256(value, key) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    errors.push(`${key} 必须是 64 位小写 sha256`);
    return "";
  }
  return value;
}

function resolveTrustedRepoFile(value, expectedSha256, key) {
  requireText(value, key);
  const expectedHash = requireSha256(expectedSha256, `${key}Sha256`);
  if (typeof value !== "string" || !value.trim() || !expectedHash) return null;
  if (path.isAbsolute(value) || value.includes("\\") || path.posix.normalize(value) !== value) {
    errors.push(`${key} 必须是 repo-root 下的规范相对路径`);
    return null;
  }
  const resolved = path.resolve(repoRoot, value);
  const relative = path.relative(repoRoot, resolved);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    errors.push(`${key} 必须解析在 repo-root 内且不能指向仓库根目录`);
    return null;
  }
  let fileStats;
  let realPath;
  try {
    fileStats = fs.lstatSync(resolved);
    realPath = fs.realpathSync(resolved);
  } catch {
    errors.push(`${key} 指向的文件不存在: ${value}`);
    return null;
  }
  const realRelative = path.relative(realRepoRoot, realPath);
  if (realRelative.startsWith(`..${path.sep}`) || realRelative === ".." || path.isAbsolute(realRelative)) {
    errors.push(`${key} 解析后逃逸 repo-root: ${value}`);
    return null;
  }
  if (fileStats.isSymbolicLink() || !fileStats.isFile()) {
    errors.push(`${key} 必须指向 repo-root 内的普通文件，不能是目录或符号链接`);
    return null;
  }
  const bytes = fs.readFileSync(resolved);
  const actualHash = crypto.createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== expectedHash) {
    errors.push(`${key} sha256 不匹配，声明=${expectedHash} 实际=${actualHash}`);
    return null;
  }
  return {bytes, path: resolved, repoPath: value, sha256: actualHash};
}

function readTrustedRepoJson(value, expectedSha256, key) {
  const trustedFile = resolveTrustedRepoFile(value, expectedSha256, key);
  if (!trustedFile) return null;
  try {
    const parsed = JSON.parse(trustedFile.bytes.toString("utf8"));
    if (!object(parsed)) {
      errors.push(`${key} 必须包含 JSON 对象`);
      return null;
    }
    return parsed;
  } catch (error) {
    errors.push(`${key} 不是合法 JSON: ${error.message}`);
    return null;
  }
}

function runActualPortraitBundleAudit(metadata, petRootPath, formId) {
  if (!fs.existsSync(portraitAuditPath)) {
    errors.push(`真实大头照 auditor 不存在: ${portraitAuditPath}`);
    return null;
  }
  const catalogBinding = object(metadata.catalogBinding)
    ? metadata.catalogBinding
    : {};
  let auditSource = "";
  if (catalogBinding.mode === "pet_art_catalog_explicit") {
    auditSource = "catalog";
  } else if (catalogBinding.mode === "isolated_explicit") {
    auditSource = "isolated";
  } else {
    errors.push("portrait-meta.catalogBinding.mode 必须由真实 builder 声明为 catalog 或 isolated");
    return null;
  }
  const catalogPath = typeof catalogBinding.catalogPath === "string"
    && catalogBinding.catalogPath.trim()
    ? catalogBinding.catalogPath
    : "client/godot/data/pet_art_catalog.json";
  const result = spawnSync(
    "python3",
    [
      portraitAuditPath,
      "--repo-root",
      repoRoot,
      "--catalog",
      catalogPath,
      "--single-target",
      `${formId}=${petRootPath}`,
      "--single-source",
      auditSource,
    ],
    {
      cwd: projectRepoRoot,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 120_000,
    },
  );
  if (result.error) {
    errors.push(`真实大头照 single-target auditor 无法执行: ${result.error.message}`);
    return null;
  }
  let audit;
  try {
    audit = JSON.parse(result.stdout);
  } catch (error) {
    errors.push(
      "真实大头照 single-target auditor 未返回合法 JSON: "
        + `${error.message}; stderr=${text(result.stderr)}`,
    );
    return null;
  }
  if (
    audit.mode !== "single-target"
    || audit.releaseGate !== false
    || audit.semanticIndependenceVerified !== false
  ) {
    errors.push("真实大头照 auditor 未返回受支持的 single-target 非发布门禁合同");
  }
  if (result.status !== 0 || audit.status !== "ok") {
    const auditErrors = Array.isArray(audit.errors) && audit.errors.length
      ? audit.errors
      : [text(result.stderr) || `auditor exit=${result.status}`];
    for (const auditError of auditErrors) {
      errors.push(`真实大头照 single-target audit 失败: ${auditError}`);
    }
  }
  return audit;
}

function validateAvailablePortraitEvidence(source, portrait, formId) {
  for (const key of [
    "portraitMetadataPath",
    "portraitMetadataSha256",
    "generationAttestationPath",
    "generationAttestationSha256",
  ]) {
    requireText(source[key], `presentation.artProduction.portrait.source.${key}`);
  }
  const metadataKey = "presentation.artProduction.portrait.source.portraitMetadataPath";
  const metadata = readTrustedRepoJson(
    source.portraitMetadataPath,
    source.portraitMetadataSha256,
    metadataKey,
  );
  const attestation = readTrustedRepoJson(
    source.generationAttestationPath,
    source.generationAttestationSha256,
    "presentation.artProduction.portrait.source.generationAttestationPath",
  );
  if (!metadata || !attestation) return null;

  const metadataSuffix = "/portrait/portrait-meta.json";
  if (
    typeof source.portraitMetadataPath !== "string"
    || !source.portraitMetadataPath.endsWith(metadataSuffix)
  ) {
    errors.push("portraitMetadataPath 必须指向真实 builder 固定输出 portrait/portrait-meta.json");
    return null;
  }
  const petRootPath = source.portraitMetadataPath.slice(
    0,
    -metadataSuffix.length,
  );
  if (!petRootPath) {
    errors.push("portraitMetadataPath 无法解析出宠物资源根目录");
    return null;
  }
  const expectedAttestationPath = `${petRootPath}/source/portrait/generation-attestation.json`;
  if (source.generationAttestationPath !== expectedAttestationPath) {
    errors.push(
      "generationAttestationPath 必须指向与 portrait-meta 同 bundle 的"
        + " source/portrait/generation-attestation.json",
    );
  }
  if (
    !Number.isInteger(metadata.schemaVersion)
    || metadata.tool !== "build_pet_portrait.py"
  ) {
    errors.push("portrait-meta 必须声明真实 builder 的 schemaVersion/tool");
  }
  if (metadata.formId !== formId) {
    errors.push(`portrait-meta.formId 必须绑定 taxonomy.formId=${formId}`);
  }
  for (const [key, expected] of [
    ["capability", portrait.capability],
    ["fullBodyCropAllowed", portrait.fullBodyCropAllowed],
  ]) {
    if (metadata[key] !== expected) {
      errors.push(`portrait-meta.${key} 与 pet design spec 不一致`);
    }
  }
  if (
    portrait.independentlyAuthored !== true
    || metadata.independentlyAuthoredClaim !== true
    || metadata.independentAuthorshipClaimTrust !== "untrusted_claim"
    || metadata.semanticIndependenceVerified !== false
  ) {
    errors.push(
      "portrait-meta 必须诚实记录 independently-authored 仅为未受信声明；"
        + "自动门禁不能把它升级为语义独立已验证",
    );
  }
  if (!sameStringMembers(metadata.sharedUses, portrait.sharedUses)) {
    errors.push("portrait-meta.sharedUses 与 pet design spec 不一致");
  }

  const metadataSource = object(metadata.source) ? metadata.source : {};
  const metadataAttestation = object(metadataSource.generationAttestation)
    ? metadataSource.generationAttestation
    : {};
  if (
    metadataAttestation.path !== source.generationAttestationPath
    || metadataAttestation.sha256 !== source.generationAttestationSha256
  ) {
    errors.push("portrait-meta.source.generationAttestation 未绑定合同声明的真实 attestation");
  }
  if (
    metadataAttestation.schemaVersion !== attestation.schemaVersion
    || metadataAttestation.generationId !== attestation.generationId
  ) {
    errors.push("portrait-meta 与 generation-attestation 的 schema/generationId 绑定不一致");
  }
  if (source.method !== "original_generated_from_identity_board") {
    errors.push(
      "source.status=available 当前必须使用真实 builder 支持的"
        + " original_generated_from_identity_board 来源",
    );
  }
  if (
    metadataSource.method !== "built_in_imagegen_chroma_headshot_v1"
    || metadataSource.generator !== "built_in_imagegen"
  ) {
    errors.push("portrait-meta.source 必须声明真实 built-in ImageGen 大头照生产合同");
  }

  const identityRecord = object(metadata.identityReference)
    ? metadata.identityReference
    : {};
  if (
    !Array.isArray(source.identityReferencePaths)
    || source.identityReferencePaths.length !== 1
    || source.identityReferencePaths[0] !== identityRecord.path
  ) {
    errors.push("identityReferencePaths 必须精确绑定 portrait-meta.identityReference.path");
  }
  const ownershipRecord = object(metadata.ownership) ? metadata.ownership : {};
  if (source.ownershipRecordPath !== ownershipRecord.path) {
    errors.push("ownershipRecordPath 必须精确绑定 portrait-meta.ownership.path");
  }

  const assets = object(metadata.assets) ? metadata.assets : {};
  const durableSourceRecords = [
    assets.originalGeneratedPng,
    assets.rawLossless,
    assets.master,
  ].filter(object);
  const durableSourcePaths = durableSourceRecords
    .map((record) => record.path)
    .filter((value) => typeof value === "string" && value);
  const declaredSourcePaths = Array.isArray(source.sourceAssetPaths)
    ? source.sourceAssetPaths
    : [];
  for (const requiredRecord of [assets.originalGeneratedPng, assets.master]) {
    if (!object(requiredRecord) || !declaredSourcePaths.includes(requiredRecord.path)) {
      errors.push(
        "sourceAssetPaths 必须至少绑定 portrait-meta.assets."
          + `${requiredRecord === assets.master ? "master" : "originalGeneratedPng"}.path`,
      );
    }
  }
  for (const sourcePath of declaredSourcePaths) {
    if (!durableSourcePaths.includes(sourcePath)) {
      errors.push(`sourceAssetPaths 包含未由真实 builder metadata 证明的路径: ${sourcePath}`);
    }
  }

  const ownerReview = object(metadata.ownerReview) ? metadata.ownerReview : {};
  const expectedOwnerStatus = {
    pending: "owner_review_pending",
    approved: "approved",
  }[portrait.ownerReviewStatus];
  if (!expectedOwnerStatus || ownerReview.status !== expectedOwnerStatus) {
    errors.push(
      "portrait-meta.ownerReview.status 与 pet design spec ownerReviewStatus 不一致",
    );
  }
  const audit = runActualPortraitBundleAudit(metadata, petRootPath, formId);
  return {metadata, audit};
}

function validateApprovedPortraitDecision(portrait, availableEvidence) {
  requireText(
    portrait.ownerDecisionPath,
    "presentation.artProduction.portrait.ownerDecisionPath",
  );
  readTrustedRepoJson(
    portrait.ownerDecisionPath,
    portrait.ownerDecisionSha256,
    "presentation.artProduction.portrait.ownerDecisionPath",
  );
  const metadataDecision = object(availableEvidence?.metadata?.ownerReview?.decision)
    ? availableEvidence.metadata.ownerReview.decision
    : {};
  if (
    metadataDecision.path !== portrait.ownerDecisionPath
    || metadataDecision.sha256 !== portrait.ownerDecisionSha256
  ) {
    errors.push(
      "ownerDecisionPath/sha256 必须精确绑定 portrait-meta.ownerReview.decision；"
        + "本地自造 decision 不能建立 owner 批准",
    );
  }
  if (availableEvidence?.audit?.status !== "ok") {
    errors.push(
      "大头照 approved 必须通过真实 auditor 的 owner trust registry；"
        + "当前本地文件不能自行授予 owner 权限",
    );
  }
}

function validateRange(value, key) {
  if (!Array.isArray(value) || value.length !== 2 || !finite(value[0]) || !finite(value[1])) {
    errors.push(`${key} 必须是两个数字组成的范围`);
    return;
  }
  if (value[0] > value[1]) errors.push(`${key} 下限不能大于上限`);
}

function validateFourStats(value, key, ranges = false) {
  const record = requireObject(value, key);
  for (const stat of ["maxHp", "attack", "defense", "quick"]) {
    if (ranges) validateRange(record[stat], `${key}.${stat}`);
    else if (!finite(record[stat])) errors.push(`${key}.${stat} 必须是数字`);
  }
}

errors.push(...jsonSchemaErrors(spec, petDesignSchema).map((message) => `schema: ${message}`));

if (spec.schemaVersion !== 1) errors.push("schemaVersion 当前必须是数字 1");
requireText(spec.designId, "designId");
if (text(spec.designId) && !/^[a-z0-9][a-z0-9_-]*$/.test(text(spec.designId))) {
  errors.push("designId 只能使用小写字母、数字、下划线或连字符");
}

const promise = requireObject(spec.playerPromise, "playerPromise");
requireText(promise.fantasy, "playerPromise.fantasy");
const tiers = new Set(["common_wild", "rare_wild", "boss_reward", "floor_reward", "event", "commercial", "rebirth", "evolution", "fusion"]);
if (!tiers.has(text(promise.acquisitionTier))) errors.push("playerPromise.acquisitionTier 不在允许范围");
requireStringArray(promise.roles, "playerPromise.roles", 1);
const strengths = requireStringArray(promise.strengths, "playerPromise.strengths", 1);
requireStringArray(promise.weaknesses, "playerPromise.weaknesses", 1);
requireStringArray(promise.counters, "playerPromise.counters", 1);
if (strengths.length < 2) warnings.push("建议明确两项核心强项，便于定义角色预算");

const taxonomy = requireObject(spec.taxonomy, "taxonomy");
for (const key of ["lineId", "lineName", "subtypeId", "subtypeName", "formId", "formName"]) {
  requireText(taxonomy[key], `taxonomy.${key}`);
}

const elements = requireObject(spec.elements, "elements");
let elementTotal = 0;
for (const key of ["fire", "water", "earth", "wind"]) {
  const value = elements[key];
  if (!Number.isInteger(value) || value < 0 || value > 10) errors.push(`elements.${key} 必须是 0..10 的整数`);
  else elementTotal += value;
}
if (elementTotal !== 10) errors.push(`elements 四系合计必须为 10，当前为 ${elementTotal}`);

const acquisition = requireObject(spec.acquisition, "acquisition");
const sourceTypes = new Set(["wild", "boss_reward", "floor_reward", "quest", "event", "commercial", "rebirth", "evolution", "fusion"]);
if (!sourceTypes.has(text(acquisition.sourceType))) errors.push("acquisition.sourceType 不在允许范围");
if (typeof acquisition.catchable !== "boolean") errors.push("acquisition.catchable 必须是布尔值");
const captureDifficulty = acquisition.captureDifficulty;
if (acquisition.catchable && (!Number.isInteger(captureDifficulty) || captureDifficulty < 1 || captureDifficulty > 100)) {
  errors.push("acquisition.captureDifficulty 必须是 1..100 的整数");
} else if (!acquisition.catchable && acquisition.captureDifficulty != null) {
  warnings.push("不可捕捉宠物通常应把 captureDifficulty 设为 null，避免误导");
}
const placements = array(acquisition.placements);
if (!Array.isArray(acquisition.placements)) errors.push("acquisition.placements 必须是数组");
if (acquisition.catchable && placements.length === 0) warnings.push("可捕捉宠物没有配置显式世界遇敌位置");
for (const [index, value] of placements.entries()) {
  const placement = requireObject(value, `acquisition.placements[${index}]`);
  for (const key of ["mapId", "encounterZoneId", "encounterGroupId"]) requireText(placement[key], `acquisition.placements[${index}].${key}`);
  if (!finite(placement.weight) || placement.weight < 0) errors.push(`acquisition.placements[${index}].weight 必须 >= 0`);
  const min = placement.levelMin;
  const max = placement.levelMax;
  if (!Number.isInteger(min) || min < 1 || min > 140) errors.push(`acquisition.placements[${index}].levelMin 必须是 1..140`);
  if (!Number.isInteger(max) || max < min || max > 140) errors.push(`acquisition.placements[${index}].levelMax 必须在 levelMin..140`);
  if (min <= 1 && max >= 1 && !finite(placement.targetLv1PerEnemyRate)) {
    warnings.push(`acquisition.placements[${index}] 包含 Lv1，但未记录目标单敌 Lv1 率`);
  }
}
if (text(promise.acquisitionTier) === "rare_wild" && !placements.some((placement) => placement.levelMin <= 1)) {
  warnings.push("rare_wild 没有任何包含 Lv1 的遇敌配置");
}

const world = requireObject(spec.worldIntegration, "worldIntegration");
const progressionBand = requireObject(world.progressionBand, "worldIntegration.progressionBand");
const bandMin = progressionBand.levelMin;
const bandMax = progressionBand.levelMax;
if (!Number.isInteger(bandMin) || bandMin < 1 || bandMin > 140) errors.push("worldIntegration.progressionBand.levelMin 必须是 1..140");
if (!Number.isInteger(bandMax) || bandMax < bandMin || bandMax > 140) errors.push("worldIntegration.progressionBand.levelMax 必须在 levelMin..140");
requireText(progressionBand.purpose, "worldIntegration.progressionBand.purpose");
for (const key of ["battleRewardGroupId", "rewardEconomyGroupId", "overflowCapturePolicy"]) requireText(world[key], `worldIntegration.${key}`);
requireStringArray(world.questIds, "worldIntegration.questIds", 0);
if (!["implemented", "blocked", "not_applicable"].includes(text(world.serverEncounterAuthority))) errors.push("worldIntegration.serverEncounterAuthority 不受支持");
if (acquisition.sourceType === "wild" && world.serverEncounterAuthority !== "implemented") warnings.push("野生投放的服务端遇敌权威尚未完成，不能声明可正式发布");

const growth = requireObject(spec.growth, "growth");
requireText(growth.profileId, "growth.profileId");
requireText(growth.familyRole, "growth.familyRole");
requireText(growth.lv1FourVInterpretation, "growth.lv1FourVInterpretation");
validateFourStats(growth.outputBase, "growth.outputBase");
validateFourStats(growth.outputGrowth, "growth.outputGrowth");
validateFourStats(growth.initialOutputSpread, "growth.initialOutputSpread", true);
validateFourStats(growth.growthOutputSpread, "growth.growthOutputSpread", true);
if (!["weighted_center", "uniform", "rare_spike"].includes(text(growth.distribution))) errors.push("growth.distribution 不受支持");
const targetAudit = requireObject(growth.targetAudit, "growth.targetAudit");
for (const key of ["lv140PowerBand", "threeStatGrowthBand", "hpGrowthBand"]) validateRange(targetAudit[key], `growth.targetAudit.${key}`);
if (!text(targetAudit.lv20DecisionIntent)) warnings.push("建议明确 Lv20 时玩家应能判断到什么程度");

const skills = requireObject(spec.skills, "skills");
const activeSkillIds = requireStringArray(skills.activeSkillIds, "skills.activeSkillIds", 2);
if (activeSkillIds.length > 7) errors.push("skills.activeSkillIds 最多 7 个");
for (const required of ["pet_attack", "pet_defend"]) {
  if (!activeSkillIds.includes(required)) errors.push(`skills.activeSkillIds 必须包含 ${required}`);
}
requireText(skills.passiveSkillId, "skills.passiveSkillId");
if (!object(skills.inheritancePolicy)) errors.push("skills.inheritancePolicy 必须是对象");
if (!object(skills.autoBattlePolicy)) errors.push("skills.autoBattlePolicy 必须是对象");
for (const [index, action] of array(skills.newActiveSkills).entries()) {
  if (!object(action)) {
    errors.push(`skills.newActiveSkills[${index}] 必须是对象`);
    continue;
  }
  for (const key of ["id", "purpose", "target", "effect", "counterplay", "serverSupport"]) requireText(action[key], `skills.newActiveSkills[${index}].${key}`);
}
if (object(skills.newPassiveSkill)) {
  for (const key of ["id", "familyFantasy", "trigger", "effect", "counterplay", "serverSupport", "inheritanceConflictGroup"]) {
    requireText(skills.newPassiveSkill[key], `skills.newPassiveSkill.${key}`);
  }
}

const progression = requireObject(spec.progression, "progression");
for (const key of ["rebirth", "evolution", "fusion", "tradePolicy", "commercialPolicy"]) requireText(progression[key], `progression.${key}`);
const terminalPowerPolicy = requireExactObject(
  progression.terminalPowerPolicy,
  "progression.terminalPowerPolicy",
  ["normalSecondRebirth", "evolution", "fusion"],
);
const normalSecondRebirthPower = requireExactObject(
  terminalPowerPolicy.normalSecondRebirth,
  "progression.terminalPowerPolicy.normalSecondRebirth",
  ["preserveStageOneIndividualQuality", "preserveCumulativeCultivationBonus"],
);
if (normalSecondRebirthPower.preserveStageOneIndividualQuality !== true) {
  errors.push("普通2转必须保留一转胚子的个体品质关系");
}
if (normalSecondRebirthPower.preserveCumulativeCultivationBonus !== true) {
  errors.push("普通2转必须保留累计培养/转生加成");
}
const evolutionPower = requireExactObject(
  terminalPowerPolicy.evolution,
  "progression.terminalPowerPolicy.evolution",
  ["preserveStageOneCultivationBonus", "targetLv1FourV", "targetHiddenGrowth", "sourceBaseQualityTransfer"],
);
if (evolutionPower.preserveStageOneCultivationBonus !== true) {
  errors.push("进化必须保留当前一转培养/转生加成");
}
if (evolutionPower.targetLv1FourV !== "fresh_target_species_roll_v1") {
  errors.push("进化目标Lv1 4V必须按目标物种重新生成");
}
if (evolutionPower.targetHiddenGrowth !== "fresh_target_species_roll_v1") {
  errors.push("进化目标隐藏成长必须按目标物种重新生成");
}
if (evolutionPower.sourceBaseQualityTransfer !== false) {
  errors.push("进化不能直接复制源形态基础4V或隐藏成长");
}
const fusionPower = requireExactObject(
  terminalPowerPolicy.fusion,
  "progression.terminalPowerPolicy.fusion",
  ["materialCount", "materialEligibility", "materialNumericInfluence", "resultNumericSource", "skillInheritance", "consumesMaterials", "economyIntent"],
);
if (fusionPower.materialCount !== 3) errors.push("融合数值合同必须明确消耗三个材料宠");
if (fusionPower.materialEligibility !== "ordinary_authority_v1_exactly_one_rebirth_pre_terminal") {
  errors.push("融合材料只能是三只普通authority-v1、恰好1转且尚未选择2转/进化/融合终局的宠物");
}
if (fusionPower.materialNumericInfluence !== "none") {
  errors.push("融合最终数值不能读取三个材料胚子的4V、成长、培养强弱或配点");
}
if (fusionPower.resultNumericSource !== "fusion_rules_only") {
  errors.push("融合最终数值必须只由融合产物自身规则生成");
}
if (fusionPower.skillInheritance !== "contract_allowlist_only") {
  errors.push("融合只能按合同白名单遗传技能");
}
if (fusionPower.consumesMaterials !== true || fusionPower.economyIntent !== "low_value_rebirth_pet_sink") {
  errors.push("融合必须保留普通1转坏胚材料消耗出口的经济意图");
}
const paidResetPolicy = requireObject(progression.paidResetPolicy, "progression.paidResetPolicy");
const paidResetAllowedKeys = new Set([
  "allowed",
  "priceTierId",
  "walletPolicyId",
  "fixedPerOperation",
  "unlimited",
  "clearBindingOnSuccess",
  "refundPolicy",
]);
const paidResetIneligibleKeys = new Set(["allowed", "ineligibleReason"]);
if (typeof paidResetPolicy.allowed !== "boolean") {
  errors.push("progression.paidResetPolicy.allowed 必须是布尔值");
} else if (paidResetPolicy.allowed) {
  for (const key of Object.keys(paidResetPolicy)) {
    if (!paidResetAllowedKeys.has(key)) errors.push(`progression.paidResetPolicy.allowed=true 不允许字段 ${key}`);
  }
  requireText(paidResetPolicy.priceTierId, "progression.paidResetPolicy.priceTierId");
  if (text(paidResetPolicy.priceTierId) && !/^[a-z][a-z0-9_]{1,79}$/.test(text(paidResetPolicy.priceTierId))) {
    errors.push("progression.paidResetPolicy.priceTierId 只能使用稳定的小写标识");
  }
  if (!["bound_first_split", "unbound_only"].includes(text(paidResetPolicy.walletPolicyId))) {
    errors.push("progression.paidResetPolicy.walletPolicyId 不受支持");
  }
  for (const key of ["fixedPerOperation", "unlimited", "clearBindingOnSuccess"]) {
    if (paidResetPolicy[key] !== true) errors.push(`progression.paidResetPolicy.${key} 必须为 true`);
  }
  if (paidResetPolicy.refundPolicy !== "technical_transaction_rollback_only") {
    errors.push("progression.paidResetPolicy.refundPolicy 必须为 technical_transaction_rollback_only");
  }
} else {
  for (const key of Object.keys(paidResetPolicy)) {
    if (!paidResetIneligibleKeys.has(key)) errors.push(`progression.paidResetPolicy.allowed=false 不允许字段 ${key}`);
  }
  requireText(paidResetPolicy.ineligibleReason, "progression.paidResetPolicy.ineligibleReason");
  if (text(paidResetPolicy.ineligibleReason) && !/^[a-z][a-z0-9_]{1,79}$/.test(text(paidResetPolicy.ineligibleReason))) {
    errors.push("progression.paidResetPolicy.ineligibleReason 只能使用稳定的小写标识");
  }
}
const acquisitionSourceType = text(acquisition.sourceType);
if (acquisitionSourceType === "evolution") {
  if (paidResetPolicy.allowed !== false) {
    errors.push("进化终局 progression.paidResetPolicy.allowed 必须为 false");
  }
  if (paidResetPolicy.ineligibleReason !== "terminal_evolution") {
    errors.push("进化终局 progression.paidResetPolicy.ineligibleReason 必须为 terminal_evolution");
  }
} else if (acquisitionSourceType === "fusion") {
  if (paidResetPolicy.allowed !== false) {
    errors.push("融合终局 progression.paidResetPolicy.allowed 必须为 false");
  }
  if (paidResetPolicy.ineligibleReason !== "terminal_fusion") {
    errors.push("融合终局 progression.paidResetPolicy.ineligibleReason 必须为 terminal_fusion");
  }
} else if (paidResetPolicy.allowed !== true) {
  errors.push(`${acquisitionSourceType || "当前来源"} 普通形态 progression.paidResetPolicy.allowed 必须为 true；该字段仅允许其普通1转、未选终局实例报价`);
}
const protections = requireStringArray(progression.autoDiscardProtection, "progression.autoDiscardProtection", 0);
if (!protections.length) warnings.push("尚未声明自动丢弃保护条件");
if (text(promise.acquisitionTier) === "commercial" && text(progression.commercialPolicy).length < 12) {
  warnings.push("商业宠需要更明确的保值、重置与非付费对抗说明");
}

const presentation = requireObject(spec.presentation, "presentation");
for (const key of ["codexText", "captureText", "growthVisibility", "futureArtBrief"]) requireText(presentation[key], `presentation.${key}`);
const artStatuses = new Set(["deferred", "planned", "in_production", "owner_review_pending", "approved"]);
const artStatus = text(presentation.artStatus);
if (!artStatuses.has(artStatus)) errors.push("presentation.artStatus 不受支持");
if (artStatus !== "deferred") {
  const art = requireObject(presentation.artProduction, "presentation.artProduction");
  if (art.deliveryScope !== "full_release") errors.push("presentation.artProduction.deliveryScope 必须为 full_release");
  if (art.identityLockRequired !== true) errors.push("presentation.artProduction.identityLockRequired 必须为 true");
  if (typeof art.rideable !== "boolean") {
    errors.push("presentation.artProduction.rideable 必须是布尔值");
  } else if (acquisitionSourceType === "fusion" && art.rideable !== false) {
    errors.push("首版融合宠 presentation.artProduction.rideable 必须为 false");
  } else if (acquisitionSourceType !== "fusion" && art.rideable !== true) {
    errors.push("非融合宠 presentation.artProduction.rideable 必须为 true");
  }
  const subjectSets = requireStringArray(
    art.worldSubjectSets,
    "presentation.artProduction.worldSubjectSets",
    art.rideable === false ? 1 : 3,
  );
  if (art.rideable === false) {
    if (subjectSets.length !== 1 || subjectSets[0] !== "pet") {
      errors.push("不可骑融合宠 presentation.artProduction.worldSubjectSets 必须精确等于 pet");
    }
    if (Object.hasOwn(art, "mounted")) {
      errors.push("不可骑融合宠 presentation.artProduction 不允许 mounted 字段");
    }
  } else {
    if (subjectSets.length !== 3) {
      errors.push("可骑宠 presentation.artProduction.worldSubjectSets 必须精确包含三类主体");
    }
    for (const subject of ["character", "pet", "mounted_character_pet"]) {
      if (!subjectSets.includes(subject)) errors.push(`presentation.artProduction.worldSubjectSets 必须包含 ${subject}`);
    }
  }
  const expectedDirections = ["south", "southwest", "west", "northwest", "north", "northeast", "east", "southeast"];
  const directions = requireStringArray(art.worldDirections, "presentation.artProduction.worldDirections", 8);
  if (directions.length !== expectedDirections.length || expectedDirections.some((value) => !directions.includes(value))) {
    errors.push("presentation.artProduction.worldDirections 必须使用 Godot 运行时 canonical 名称覆盖真八方向：south/southwest/west/northwest/north/northeast/east/southeast");
  }
  const worldActions = requireStringArray(art.worldActions, "presentation.artProduction.worldActions", 2);
  for (const action of ["idle", "walk"]) {
    if (!worldActions.includes(action)) errors.push(`presentation.artProduction.worldActions 必须包含 ${action}`);
  }
  if (art.runtimeMirroring !== false) errors.push("presentation.artProduction.runtimeMirroring 必须为 false");
  const battleViews = requireStringArray(art.battleViews, "presentation.artProduction.battleViews", 2);
  for (const view of ["front_3quarter_sw", "back_3quarter_ne"]) {
    if (!battleViews.includes(view)) errors.push(`presentation.artProduction.battleViews 必须包含 ${view}`);
  }
  const requiredBattleScenarios = ["idle", "walk", "attack", "skill", "defend", "defend_hit", "hurt", "dodge", "dodge_counter", "counter", "stagger_return", "knockaway", "down", "revive", "combo"];
  const battleScenarios = requireStringArray(art.battleScenarios, "presentation.artProduction.battleScenarios", requiredBattleScenarios.length);
  for (const scenario of requiredBattleScenarios) {
    if (!battleScenarios.includes(scenario)) errors.push(`presentation.artProduction.battleScenarios 必须包含 ${scenario}`);
  }
  const portrait = requireExactObject(
    art.portrait,
    "presentation.artProduction.portrait",
    [
      "capability",
      "independentlyAuthored",
      "fullBodyCropAllowed",
      "sharedUses",
      "source",
      "ownerReviewRequired",
      "ownerReviewStatus",
      "evidencePaths",
      "ownerDecisionPath",
      "ownerDecisionSha256",
    ],
  );
  if (portrait.capability !== "shared_dedicated_headshot_v1") {
    errors.push("presentation.artProduction.portrait.capability 必须为 shared_dedicated_headshot_v1");
  }
  if (portrait.independentlyAuthored !== true) {
    errors.push("宠物大头照必须独立绘制，presentation.artProduction.portrait.independentlyAuthored 必须为 true");
  }
  if (portrait.fullBodyCropAllowed !== false) {
    errors.push("宠物大头照禁止裁切全身/世界/战斗/骑乘图冒充，presentation.artProduction.portrait.fullBodyCropAllowed 必须为 false");
  }
  const portraitSharedUses = requireStringArray(
    portrait.sharedUses,
    "presentation.artProduction.portrait.sharedUses",
    4,
  );
  for (const use of ["pet_roster_bar", "pet_codex", "ride_permit", "pet_egg"]) {
    if (!portraitSharedUses.includes(use)) {
      errors.push(`presentation.artProduction.portrait.sharedUses 必须包含 ${use}`);
    }
  }
  const portraitSource = requireExactObject(
    portrait.source,
    "presentation.artProduction.portrait.source",
    [
      "status",
      "method",
      "identityReferencePaths",
      "sourceAssetPaths",
      "ownershipRecordPath",
      "portraitMetadataPath",
      "portraitMetadataSha256",
      "generationAttestationPath",
      "generationAttestationSha256",
    ],
  );
  const portraitSourceStatus = text(portraitSource.status);
  if (!["planned", "available"].includes(portraitSourceStatus)) {
    errors.push("presentation.artProduction.portrait.source.status 不受支持");
  }
  if (![
    "original_generated_from_identity_board",
    "original_hand_authored_from_identity_board",
    "licensed_original_commission",
  ].includes(text(portraitSource.method))) {
    errors.push("presentation.artProduction.portrait.source.method 必须声明受支持的独立原创来源");
  }
  requireStringArray(
    portraitSource.identityReferencePaths,
    "presentation.artProduction.portrait.source.identityReferencePaths",
    1,
  );
  requireStringArray(
    portraitSource.sourceAssetPaths,
    "presentation.artProduction.portrait.source.sourceAssetPaths",
    1,
  );
  requireText(
    portraitSource.ownershipRecordPath,
    "presentation.artProduction.portrait.source.ownershipRecordPath",
  );
  if (portrait.ownerReviewRequired !== true) {
    errors.push("presentation.artProduction.portrait.ownerReviewRequired 必须为 true");
  }
  const portraitOwnerReviewStatus = text(portrait.ownerReviewStatus);
  if (!["not_started", "pending", "approved", "rejected"].includes(portraitOwnerReviewStatus)) {
    errors.push("presentation.artProduction.portrait.ownerReviewStatus 不受支持");
  }
  if (portraitSourceStatus === "planned" && portraitOwnerReviewStatus === "approved") {
    errors.push("大头照 source.status=planned 时 ownerReviewStatus 不能为 approved");
  }
  const availablePortraitEvidence = portraitSourceStatus === "available"
    ? validateAvailablePortraitEvidence(
      portraitSource,
      portrait,
      text(taxonomy.formId),
    )
    : null;
  if (portraitOwnerReviewStatus === "approved") {
    validateApprovedPortraitDecision(portrait, availablePortraitEvidence);
  }
  const portraitEvidencePaths = requireStringArray(
    portrait.evidencePaths,
    "presentation.artProduction.portrait.evidencePaths",
    0,
  );
  if (["pending", "approved", "rejected"].includes(portraitOwnerReviewStatus) && !portraitEvidencePaths.length) {
    errors.push("大头照进入 owner review 后必须记录 presentation.artProduction.portrait.evidencePaths");
  }
  if (["owner_review_pending", "approved"].includes(artStatus) && portraitSourceStatus !== "available") {
    errors.push(`artStatus=${artStatus} 时大头照 source.status 必须为 available`);
  }
  if (artStatus === "owner_review_pending" && !["pending", "approved"].includes(portraitOwnerReviewStatus)) {
    errors.push("artStatus=owner_review_pending 时大头照 ownerReviewStatus 必须为 pending 或 approved");
  }
  if (artStatus === "approved") {
    if (portraitOwnerReviewStatus !== "approved") {
      errors.push("artStatus=approved 时大头照 ownerReviewStatus 必须为 approved");
    }
    if (!portraitEvidencePaths.length) {
      errors.push("artStatus=approved 时大头照必须记录原图、缩略图和实际界面 evidencePaths");
    }
  }
  if (art.rideable !== false) {
    const mounted = requireObject(art.mounted, "presentation.artProduction.mounted");
    if (mounted.composition !== "ai_integrated_whole_frame") errors.push("presentation.artProduction.mounted.composition 必须为 ai_integrated_whole_frame");
    if (mounted.runtimeLayeredComposition !== false) errors.push("presentation.artProduction.mounted.runtimeLayeredComposition 必须为 false");
    if (mounted.runtimeMirroring !== false) errors.push("presentation.artProduction.mounted.runtimeMirroring 必须为 false");
    requireStringArray(mounted.supportedCharacterIds, "presentation.artProduction.mounted.supportedCharacterIds", 1);
  }
  const requiredReviewScenes = ["true8_world", "formation_10v10", "attack", "skill_attack", "defend_hit", "hurt_recovery", "dodge", "dodge_counter", "counter", "counter_ko_return_down", "counter_knockaway", "combo", "down_revive"];
  const reviewScenes = requireStringArray(art.reviewScenes, "presentation.artProduction.reviewScenes", requiredReviewScenes.length);
  for (const scene of requiredReviewScenes) {
    if (!reviewScenes.includes(scene)) errors.push(`presentation.artProduction.reviewScenes 必须包含 ${scene}`);
  }
  if (art.ownerReviewRequired !== true) errors.push("presentation.artProduction.ownerReviewRequired 必须为 true");
  const ownerReviewStatus = text(art.ownerReviewStatus);
  if (!["not_started", "pending", "approved", "rejected"].includes(ownerReviewStatus)) {
    errors.push("presentation.artProduction.ownerReviewStatus 不受支持");
  }
  const evidencePaths = requireStringArray(art.evidencePaths, "presentation.artProduction.evidencePaths", 0);
  if (artStatus === "owner_review_pending" && ownerReviewStatus !== "pending") {
    errors.push("artStatus=owner_review_pending 时 ownerReviewStatus 必须为 pending");
  }
  if (artStatus === "approved") {
    if (ownerReviewStatus !== "approved") errors.push("artStatus=approved 时 ownerReviewStatus 必须为 approved");
    if (!evidencePaths.length) errors.push("artStatus=approved 时必须记录截图或录像 evidencePaths");
  } else if (ownerReviewStatus === "approved") {
    errors.push("ownerReviewStatus=approved 时 presentation.artStatus 也必须为 approved");
  }
} else if (Object.hasOwn(presentation, "artProduction")) {
  errors.push("presentation.artStatus=deferred 时禁止携带 artProduction；未来计划只能写入 futureArtBrief");
}

const validation = requireObject(spec.validation, "validation");
const sampleCount = validation.growthSampleCount;
if (!Number.isInteger(sampleCount) || sampleCount < 100) errors.push("validation.growthSampleCount 至少为 100");
else if (sampleCount < 10000) warnings.push("最终物种成长档建议至少使用 10,000 个样本");
requireStringArray(validation.fixedSeedCases, "validation.fixedSeedCases", 1);
requireStringArray(validation.requiredChecks, "validation.requiredChecks", 1);
requireStringArray(validation.serverAuthorityChecks, "validation.serverAuthorityChecks", 1);
requireStringArray(validation.manualAcceptance, "validation.manualAcceptance", 1);

const result = {
  ok: errors.length === 0,
  path: path.resolve(filename),
  designId: text(spec.designId),
  formId: text(taxonomy.formId),
  errors,
  warnings,
};

if (jsonOutput) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`pet design spec: ${result.ok ? "ok" : "failed"} design=${result.designId || "?"} form=${result.formId || "?"}`);
  for (const error of errors) console.log(`ERROR ${error}`);
  for (const warning of warnings) console.log(`WARN  ${warning}`);
}

if (!result.ok) process.exitCode = 1;
