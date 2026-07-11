#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {loadPetGrowthCatalog} = require("../server/node/src/auth/pet-growth-catalog.js");

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT = path.join(REPOSITORY_ROOT, ".run/godot/pet_growth_legacy_save_audit.json");
const PROFILE_FILE_NAME = "player_profile.json";
const LAST_GOOD_SUFFIX = ".last_good.json";
const AUTHORITY_MODEL = "pet_growth_authority_v1";

function parseArgs(argv) {
  const options = {inputs: [], outputPath: DEFAULT_OUTPUT, includeLastGood: false};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      const value = String(argv[++index] || "").trim();
      if (value === "") throw new TypeError("--input requires a file or directory");
      options.inputs.push(path.resolve(value));
    } else if (arg === "--output") {
      const value = String(argv[++index] || "").trim();
      if (value === "") throw new TypeError("--output requires a file path");
      options.outputPath = path.resolve(value);
    } else if (arg === "--include-last-good") {
      options.includeLastGood = true;
    } else {
      throw new TypeError(`unknown argument: ${arg}`);
    }
  }
  if (options.inputs.length < 1) throw new TypeError("at least one --input is required");
  return options;
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sourceIdFor(filePath) {
  return sha256Buffer(Buffer.from(path.resolve(filePath), "utf8")).slice(0, 16);
}

function isAcceptedProfileName(fileName, includeLastGood) {
  return fileName === PROFILE_FILE_NAME || (includeLastGood && fileName.endsWith(LAST_GOOD_SUFFIX));
}

function collectFiles(inputs, includeLastGood = false) {
  const files = new Set();
  const visit = (candidate) => {
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink()) return;
    if (stat.isFile()) {
      files.add(path.resolve(candidate));
      return;
    }
    if (!stat.isDirectory()) return;
    for (const name of fs.readdirSync(candidate).sort()) {
      const nested = path.join(candidate, name);
      const nestedStat = fs.lstatSync(nested);
      if (nestedStat.isSymbolicLink()) continue;
      if (nestedStat.isDirectory()) {
        visit(nested);
      } else if (nestedStat.isFile() && isAcceptedProfileName(name, includeLastGood)) {
        files.add(path.resolve(nested));
      }
    }
  };
  for (const input of inputs) visit(input);
  return Array.from(files).sort();
}

function petEntries(profile) {
  const entries = [];
  const pushArray = (value, prefix) => {
    if (!Array.isArray(value)) return;
    value.forEach((pet, index) => {
      if (pet && typeof pet === "object" && !Array.isArray(pet)) {
        entries.push({path: `${prefix}[${index}]`, pet});
      }
    });
  };
  pushArray(profile.petInstances, "petInstances");
  pushArray(profile.pets, "pets");
  if (Array.isArray(profile.groundPetDrops)) {
    profile.groundPetDrops.forEach((drop, index) => {
      if (drop?.pet && typeof drop.pet === "object" && !Array.isArray(drop.pet)) {
        entries.push({path: `groundPetDrops[${index}].pet`, pet: drop.pet});
      }
    });
  }
  if (Array.isArray(profile.trainingPartners)) {
    profile.trainingPartners.forEach((partner, index) => {
      if (partner?.pet && typeof partner.pet === "object" && !Array.isArray(partner.pet)) {
        entries.push({path: `trainingPartners[${index}].pet`, pet: partner.pet});
      }
    });
  }
  return entries;
}

function structuralWarnings(pet) {
  const warnings = [];
  if (String(pet.instanceId || pet.petId || "").trim() === "") warnings.push("missing_instance_id");
  if (!Number.isFinite(Number(pet.level)) || Number(pet.level) < 1) warnings.push("invalid_level");
  for (const key of ["maxHp", "attack", "defense", "quick"]) {
    if (!Number.isFinite(Number(pet[key])) || Number(pet[key]) < 0) warnings.push(`invalid_${key}`);
  }
  return warnings;
}

function classifyPet(pet, catalog) {
  const formId = String(pet.formId || pet.templateId || "").trim();
  const declaredProfileId = String(pet.growthSpeciesProfileId || "").trim();
  const template = formId === "" ? null : catalog.templateByFormId(formId);
  const activeProfileId = template ? String(catalog.profileIdForFormId(formId) || "") : "";
  const marker = pet.growthAuthority && typeof pet.growthAuthority === "object" && !Array.isArray(pet.growthAuthority)
    ? pet.growthAuthority
    : null;
  const privateEnvelope = pet.petGrowth && typeof pet.petGrowth === "object" && !Array.isArray(pet.petGrowth)
    ? pet.petGrowth
    : null;
  const modelVersion = String(
    privateEnvelope?.modelVersion || pet.growthModelVersion || marker?.modelVersion || "",
  ).trim();
  let classification = "legacy_existing_linked";
  let recommendedAction = "preserve_existing_without_reroll";
  const warnings = structuralWarnings(pet);
  if (!template) {
    classification = "unknown_form";
    recommendedAction = "manual_review";
  } else if (modelVersion === AUTHORITY_MODEL && privateEnvelope) {
    const envelopeProfileId = String(privateEnvelope.profileId || declaredProfileId).trim();
    if (activeProfileId !== "" && envelopeProfileId === activeProfileId) {
      classification = "authority_private_v1";
      recommendedAction = "preserve_authority_identity";
    } else {
      classification = "invalid_declared_authority";
      recommendedAction = "manual_review_no_mutation";
    }
  } else if (modelVersion === AUTHORITY_MODEL && marker?.source === "server") {
    if (activeProfileId !== "" && (declaredProfileId === "" || declaredProfileId === activeProfileId)) {
      classification = "authority_public_v1";
      recommendedAction = "preserve_authority_identity";
    } else {
      classification = "invalid_declared_authority";
      recommendedAction = "manual_review_no_mutation";
    }
  } else if (modelVersion !== "") {
    classification = modelVersion.startsWith("legacy_") ? "legacy_existing_linked" : "invalid_declared_authority";
    recommendedAction = classification === "legacy_existing_linked"
      ? "preserve_existing_without_reroll"
      : "manual_review_no_mutation";
  } else if (activeProfileId === "") {
    classification = "legacy_unlinked";
    recommendedAction = "preserve_existing_without_reroll";
  }
  if (template && declaredProfileId !== "" && catalog.profileById(declaredProfileId) === null) {
    warnings.push("declared_profile_missing_from_catalog");
  } else if (
    template
    && declaredProfileId !== ""
    && catalog.profileById(declaredProfileId)?.formId !== formId
  ) {
    warnings.push("declared_profile_form_mismatch");
  }
  return {
    classification,
    recommendedAction,
    formId,
    level: Number.isFinite(Number(pet.level)) ? Number(pet.level) : null,
    declaredProfileId,
    activeProfileId,
    instanceFingerprint: sha256Buffer(Buffer.from(String(pet.instanceId || pet.petId || ""), "utf8")).slice(0, 16),
    warnings,
  };
}

export function auditFiles(filePaths, options = {}) {
  const catalog = options.catalog || loadPetGrowthCatalog();
  const results = [];
  const errors = [];
  const beforeHashes = new Map();
  for (const filePath of filePaths) {
    const raw = fs.readFileSync(filePath);
    beforeHashes.set(filePath, sha256Buffer(raw));
    let profile;
    try {
      profile = JSON.parse(raw.toString("utf8"));
    } catch {
      errors.push({sourceId: sourceIdFor(filePath), code: "invalid_json"});
      continue;
    }
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      errors.push({sourceId: sourceIdFor(filePath), code: "invalid_profile_root"});
      continue;
    }
    for (const entry of petEntries(profile)) {
      results.push({
        sourceId: sourceIdFor(filePath),
        path: entry.path,
        ...classifyPet(entry.pet, catalog),
      });
    }
  }
  const unchanged = filePaths.every((filePath) => (
    beforeHashes.get(filePath) === sha256Buffer(fs.readFileSync(filePath))
  ));
  const counts = {};
  for (const result of results) counts[result.classification] = (counts[result.classification] || 0) + 1;
  return {
    schemaVersion: 1,
    mode: "pet_growth_legacy_save_read_only_audit",
    catalog: {
      formCount: catalog.formCount,
      profileCount: catalog.profileCount,
      profiledFormCount: catalog.profiledFormCount,
    },
    sourceCount: filePaths.length,
    petReferenceCount: results.length,
    counts,
    manualReviewCount: results.filter((result) => result.recommendedAction.includes("manual_review")).length,
    warningCount: results.reduce((sum, result) => sum + result.warnings.length, 0),
    inputFilesUnchanged: unchanged,
    results,
    errors,
  };
}

export function runAudit({inputs, outputPath = DEFAULT_OUTPUT, includeLastGood = false}) {
  const files = collectFiles(inputs, includeLastGood);
  if (files.length < 1) throw new Error("no profile files found");
  const resolvedOutput = path.resolve(outputPath);
  if (files.includes(resolvedOutput)) throw new Error("output path must not overwrite an input profile");
  const report = auditFiles(files);
  fs.mkdirSync(path.dirname(resolvedOutput), {recursive: true});
  fs.writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
  return {report, outputPath: resolvedOutput};
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const {report, outputPath} = runAudit(options);
  process.stdout.write(
    `pet growth legacy audit: sources=${report.sourceCount} pets=${report.petReferenceCount}`
    + ` manual=${report.manualReviewCount} warnings=${report.warningCount}`
    + ` unchanged=${report.inputFilesUnchanged} errors=${report.errors.length}\n`,
  );
  process.stdout.write(`counts=${JSON.stringify(report.counts)}\nreport=${outputPath}\n`);
  process.exitCode = report.errors.length === 0 && report.inputFilesUnchanged ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
