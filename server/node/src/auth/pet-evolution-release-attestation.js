"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {isDeepStrictEqual} = require("node:util");

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const DEFAULT_ATTESTATION_REPO_PATH = "client/godot/data/pet_evolution_release_attestation_v1.json";
const DEFAULT_ATTESTATION_PATH = path.join(REPO_ROOT, DEFAULT_ATTESTATION_REPO_PATH);
const ATTESTATION_TYPE = "beastbound_pet_evolution_runtime_release_attestation";
const ATTESTATION_ID = "pet_evolution_p1_3e_runtime_release_v1";
const OWNER_DECISION_TYPE = "beastbound_pet_evolution_runtime_release_owner_decision";
const OWNER_DECISION_ID = "pet_evolution_p1_3e_runtime_release_20260726";
const ROUTE_CATALOG_ID = "pet_evolution_routes_v2";
const ROUTE_IDS = Object.freeze([
  "wuli_crystal_evolution_v1",
  "driftfox_moon_gale_evolution_v1",
]);
const FORM_CONTRACTS = Object.freeze([
  Object.freeze({
    formId: "wuli_evolved_crystal_earth8_water2",
    petMetadataPath: "client/godot/assets/pets/wuli_evolved_crystal_earth8_water2/action-bundle-meta.json",
    mountedMetadataPath: "client/godot/assets/mounted/novice_hunter_v1/wuli_evolved_crystal_earth8_water2/action-bundle-meta.json",
  }),
  Object.freeze({
    formId: "driftfox_evolved_moon_gale_wind7_water3",
    petMetadataPath: "client/godot/assets/pets/driftfox_evolved_moon_gale_wind7_water3/action-bundle-meta.json",
    mountedMetadataPath: "client/godot/assets/mounted/novice_hunter_v1/driftfox_evolved_moon_gale_wind7_water3/action-bundle-meta.json",
  }),
]);
const VISUAL_SCOPES = Object.freeze([
  "standalone_pet_world_true8_visual_only",
  "standalone_pet_battle_visual_only",
  "evolution_visual_only",
  "integrated_mounted_world_true8_visual_only",
  "integrated_mounted_battle_visual_only",
]);
const VALIDATION_KINDS = Object.freeze([
  "two_reject_two_allow_authoritative_transaction",
  "full_512_source_and_runtime_derivation_closure",
  "all_remaining_visual_owner_approvals",
]);
const EXPECTED_LIFECYCLE = Object.freeze({
  artStatus: "approved",
  ownerReviewStatus: "approved",
  runtimeEnabled: true,
  petWorldRuntimeEnabled: true,
  petBattleRuntimeEnabled: true,
  evolutionVisualRuntimeEnabled: true,
  mountedWorldRuntimeEnabled: true,
  mountedBattleRuntimeEnabled: true,
});

class PetEvolutionReleaseAttestationError extends Error {
  constructor(errors) {
    const values = array(errors).map(String).filter(Boolean);
    super(`pet evolution release attestation invalid: ${values.join("; ")}`);
    this.name = "PetEvolutionReleaseAttestationError";
    this.code = "pet_evolution_release_attestation_invalid";
    this.errors = values;
  }
}

function loadPetEvolutionReleaseAttestation(options = {}) {
  const repoRoot = path.resolve(String(options.repoRoot || REPO_ROOT));
  const attestationPath = path.resolve(String(options.attestationPath || DEFAULT_ATTESTATION_PATH));
  const readFile = typeof options.readFile === "function" ? options.readFile : fs.readFileSync;
  const bytes = toBuffer(readFile(attestationPath));
  const sha256 = digest(bytes);
  const expectedSha256 = text(options.expectedSha256).toLowerCase();
  const errors = [];
  if (expectedSha256 && sha256 !== expectedSha256) {
    errors.push("release attestation SHA-256 does not match the route catalog reference");
  }
  let document = {};
  try {
    document = JSON.parse(bytes.toString("utf8"));
  } catch {
    errors.push("release attestation is not valid JSON");
  }
  const normalized = normalizePetEvolutionReleaseAttestation({
    document,
    repoRoot,
    attestationPath,
    attestationSha256: sha256,
    readFile,
    errors,
  });
  return normalized;
}

function normalizePetEvolutionReleaseAttestation(input = {}) {
  const errors = array(input.errors);
  const document = record(input.document);
  const repoRoot = path.resolve(String(input.repoRoot || REPO_ROOT));
  const attestationPath = path.resolve(String(input.attestationPath || DEFAULT_ATTESTATION_PATH));
  const attestationSha256 = text(input.attestationSha256).toLowerCase();
  const readFile = typeof input.readFile === "function" ? input.readFile : fs.readFileSync;
  const expectedAttestationPath = path.join(repoRoot, DEFAULT_ATTESTATION_REPO_PATH);

  exactKeys(document, [
    "schemaVersion",
    "attestationType",
    "attestationId",
    "status",
    "ownerReviewStatus",
    "releaseApproved",
    "runtimeEnabled",
    "approvedAtUtc",
    "ownerDecision",
    "routeCatalogId",
    "routeIds",
    "forms",
    "validationEvidence",
    "expectedBundleLifecycle",
  ], "attestation", errors);
  if (document.schemaVersion !== 1) errors.push("attestation.schemaVersion must equal 1");
  if (text(document.attestationType) !== ATTESTATION_TYPE) errors.push("attestation.attestationType is invalid");
  if (text(document.attestationId) !== ATTESTATION_ID) errors.push("attestation.attestationId is invalid");
  if (
    text(document.status) !== "approved"
    || text(document.ownerReviewStatus) !== "approved"
    || document.releaseApproved !== true
    || document.runtimeEnabled !== true
  ) {
    errors.push("attestation lifecycle must be fully owner-approved and runtime-enabled");
  }
  if (!isIsoUtc(document.approvedAtUtc)) errors.push("attestation.approvedAtUtc must be an ISO UTC timestamp");
  if (attestationPath !== expectedAttestationPath) errors.push("attestation must use the frozen v1 data path");
  if (!isSha256(attestationSha256)) errors.push("attestation SHA-256 is invalid");
  if (text(document.routeCatalogId) !== ROUTE_CATALOG_ID) errors.push("attestation.routeCatalogId is invalid");
  if (!isDeepStrictEqual(array(document.routeIds), ROUTE_IDS)) errors.push("attestation.routeIds must match both production routes");
  if (!isDeepStrictEqual(record(document.expectedBundleLifecycle), EXPECTED_LIFECYCLE)) {
    errors.push("attestation.expectedBundleLifecycle is incomplete");
  }

  const ownerDecisionReference = validateFrozenReference(
    document.ownerDecision,
    "ownerDecision",
    repoRoot,
    readFile,
    errors,
  );
  if (ownerDecisionReference.document) {
    validateOwnerDecision(ownerDecisionReference.document, errors);
  }

  const forms = [];
  const seenForms = new Set();
  for (const [index, rawValue] of array(document.forms).entries()) {
    const raw = record(rawValue);
    const label = `forms[${index}]`;
    exactKeys(raw, [
      "formId",
      "petMetadataPath",
      "mountedMetadataPath",
      "visualEvidence",
    ], label, errors);
    const contract = FORM_CONTRACTS[index];
    if (
      !contract
      || text(raw.formId) !== contract.formId
      || text(raw.petMetadataPath) !== contract.petMetadataPath
      || text(raw.mountedMetadataPath) !== contract.mountedMetadataPath
    ) {
      errors.push(`${label} does not match the frozen evolved-form bundle contract`);
      continue;
    }
    if (seenForms.has(contract.formId)) errors.push(`duplicate attested form ${contract.formId}`);
    seenForms.add(contract.formId);
    validateVisualEvidence(raw.visualEvidence, contract.formId, repoRoot, readFile, errors);
    validateBundleMetadata(
      contract,
      repoRoot,
      readFile,
      attestationSha256,
      errors,
    );
    forms.push({
      formId: contract.formId,
      petMetadataPath: contract.petMetadataPath,
      mountedMetadataPath: contract.mountedMetadataPath,
    });
  }
  if (forms.length !== FORM_CONTRACTS.length) errors.push("attestation must cover exactly two evolved forms");

  const validationKinds = [];
  for (const [index, rawValue] of array(document.validationEvidence).entries()) {
    const raw = record(rawValue);
    const label = `validationEvidence[${index}]`;
    exactKeys(raw, ["kind", "status", "path", "sha256"], label, errors);
    const expectedKind = VALIDATION_KINDS[index];
    if (text(raw.kind) !== expectedKind || text(raw.status) !== "passed") {
      errors.push(`${label} does not match the frozen P1.3e validation contract`);
    }
    validateFrozenReference({path: raw.path, sha256: raw.sha256}, label, repoRoot, readFile, errors, false);
    validationKinds.push(text(raw.kind));
  }
  if (!isDeepStrictEqual(validationKinds, VALIDATION_KINDS)) {
    errors.push("attestation.validationEvidence must cover the three frozen release gates");
  }

  if (errors.length > 0) throw new PetEvolutionReleaseAttestationError(errors);
  return deepFreeze({
    schemaVersion: 1,
    attestationType: ATTESTATION_TYPE,
    attestationId: ATTESTATION_ID,
    status: "approved",
    ownerReviewStatus: "approved",
    releaseApproved: true,
    runtimeEnabled: true,
    approvedAtUtc: text(document.approvedAtUtc),
    routeCatalogId: ROUTE_CATALOG_ID,
    routeIds: [...ROUTE_IDS],
    formIds: forms.map((entry) => entry.formId),
    forms,
    attestationPath,
    attestationRepoPath: DEFAULT_ATTESTATION_REPO_PATH,
    attestationSha256,
    ownerDecisionPath: ownerDecisionReference.path,
    ownerDecisionSha256: ownerDecisionReference.sha256,
  });
}

function validateOwnerDecision(document, errors) {
  const expectedRouteIds = [...ROUTE_IDS];
  const expectedFormIds = FORM_CONTRACTS.map((entry) => entry.formId);
  if (
    document.schemaVersion !== 1
    || text(document.decisionType) !== OWNER_DECISION_TYPE
    || text(document.decisionId) !== OWNER_DECISION_ID
    || text(document.decision) !== "approved"
    || text(document.ownerReviewStatus) !== "approved"
    || document.releaseApproved !== true
    || document.runtimeEnabled !== true
    || text(document.roadmapItem) !== "P1.3e"
    || text(document.routeCatalogId) !== ROUTE_CATALOG_ID
    || !isDeepStrictEqual(array(document.routeIds), expectedRouteIds)
    || !isDeepStrictEqual(array(document.targetFormIds), expectedFormIds)
    || !isIsoUtc(document.approvedAtUtc)
  ) {
    errors.push("owner runtime-release decision does not approve the exact P1.3e routes");
  }
  if (!array(document.excludedScope).includes("pet_fusion_runtime")) {
    errors.push("owner runtime-release decision must keep fusion outside P1.3e");
  }
}

function validateVisualEvidence(values, formId, repoRoot, readFile, errors) {
  const seenScopes = [];
  for (const [index, rawValue] of array(values).entries()) {
    const raw = record(rawValue);
    const label = `${formId}.visualEvidence[${index}]`;
    exactKeys(raw, ["scope", "path", "sha256"], label, errors);
    const scope = text(raw.scope);
    const expectedScope = VISUAL_SCOPES[index];
    if (scope !== expectedScope) errors.push(`${label} has an unexpected visual approval scope`);
    const frozen = validateFrozenReference(
      {path: raw.path, sha256: raw.sha256},
      label,
      repoRoot,
      readFile,
      errors,
    );
    const decision = record(frozen.document);
    const decisionFormId = text(decision.formId || decision.mountFormId);
    if (
      text(decision.scope) !== scope
      || text(decision.decision) !== "approved"
      || text(decision.ownerReviewStatus) !== "approved"
      || decisionFormId !== formId
    ) {
      errors.push(`${label} does not contain a matching owner visual approval`);
    }
    if (scope.startsWith("integrated_mounted_") && text(decision.characterId) !== "novice_hunter_v1") {
      errors.push(`${label} must approve the novice_hunter_v1 integrated bundle`);
    }
    if (scope === "evolution_visual_only") {
      if (decision.routeRuntimeEnabled !== false) errors.push(`${label} must remain a historical visual-only decision`);
    } else if (decision.runtimeEnabled !== false) {
      errors.push(`${label} must remain a historical visual-only decision`);
    }
    seenScopes.push(scope);
  }
  if (!isDeepStrictEqual(seenScopes, VISUAL_SCOPES)) {
    errors.push(`${formId} must bind all five owner-approved visual scopes`);
  }
}

function validateBundleMetadata(contract, repoRoot, readFile, attestationSha256, errors) {
  const pet = readJsonReference(contract.petMetadataPath, `${contract.formId}.petMetadata`, repoRoot, readFile, errors);
  const mounted = readJsonReference(contract.mountedMetadataPath, `${contract.formId}.mountedMetadata`, repoRoot, readFile, errors);
  const expectedReference = {
    path: DEFAULT_ATTESTATION_REPO_PATH,
    sha256: attestationSha256,
  };
  if (
    text(pet.formId) !== contract.formId
    || text(pet.artStatus) !== "approved"
    || text(pet.ownerReviewStatus) !== "approved"
    || pet.runtimeEnabled !== true
    || !isDeepStrictEqual(record(pet.releaseAttestation), expectedReference)
    || record(pet.worldVisual).runtimeEnabled !== true
    || record(pet.battleVisual).runtimeEnabled !== true
    || text(record(pet.evolutionVisual).status) !== "approved"
    || text(record(pet.evolutionVisual).ownerReview) !== "approved"
    || record(pet.evolutionVisual).runtimeEnabled !== true
  ) {
    errors.push(`${contract.formId} standalone pet bundle is not fully runtime-released`);
  }
  if (
    text(mounted.mountFormId) !== contract.formId
    || text(mounted.characterId) !== "novice_hunter_v1"
    || text(mounted.artStatus) !== "approved"
    || text(mounted.ownerReviewStatus) !== "approved"
    || mounted.runtimeEnabled !== true
    || !isDeepStrictEqual(record(mounted.releaseAttestation), expectedReference)
    || record(mounted.worldVisual).runtimeEnabled !== true
    || record(mounted.battleVisual).runtimeEnabled !== true
  ) {
    errors.push(`${contract.formId} mounted bundle is not fully runtime-released`);
  }
}

function validateFrozenReference(value, label, repoRoot, readFile, errors, parseJson = true) {
  const reference = record(value);
  exactKeys(reference, ["path", "sha256"], label, errors);
  const repoPath = text(reference.path);
  const expectedSha256 = text(reference.sha256).toLowerCase();
  const resolved = safeRepoPath(repoRoot, repoPath);
  let bytes = Buffer.alloc(0);
  if (!resolved) {
    errors.push(`${label}.path must be a safe repository-relative path`);
  } else {
    try {
      bytes = toBuffer(readFile(resolved));
    } catch {
      errors.push(`${label}.path does not exist`);
    }
  }
  if (!isSha256(expectedSha256) || (bytes.length > 0 && digest(bytes) !== expectedSha256)) {
    errors.push(`${label}.sha256 does not match the frozen evidence`);
  }
  let document = null;
  if (parseJson && bytes.length > 0) {
    try {
      document = JSON.parse(bytes.toString("utf8"));
    } catch {
      errors.push(`${label}.path is not valid JSON`);
    }
  }
  return {path: repoPath, sha256: expectedSha256, document};
}

function readJsonReference(repoPath, label, repoRoot, readFile, errors) {
  const resolved = safeRepoPath(repoRoot, repoPath);
  if (!resolved) {
    errors.push(`${label} path is unsafe`);
    return {};
  }
  try {
    return record(JSON.parse(toBuffer(readFile(resolved)).toString("utf8")));
  } catch {
    errors.push(`${label} is missing or invalid JSON`);
    return {};
  }
}

function safeRepoPath(repoRoot, repoPath) {
  const normalized = text(repoPath).replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) return "";
  const resolved = path.resolve(repoRoot, normalized);
  return resolved.startsWith(`${repoRoot}${path.sep}`) ? resolved : "";
}

function exactKeys(value, expected, label, errors) {
  if (!isDeepStrictEqual(Object.keys(record(value)).sort(), [...expected].sort())) {
    errors.push(`${label} fields are not exact`);
  }
}

function isIsoUtc(value) {
  const normalized = text(value);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(normalized)
    && Number.isFinite(Date.parse(normalized));
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(text(value).toLowerCase());
}

function digest(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function toBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function deepFreeze(value, visited = new WeakSet()) {
  if (!value || typeof value !== "object" || visited.has(value)) return value;
  visited.add(value);
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested, visited);
  return value;
}

module.exports = {
  ATTESTATION_ID,
  ATTESTATION_TYPE,
  DEFAULT_ATTESTATION_PATH,
  DEFAULT_ATTESTATION_REPO_PATH,
  FORM_CONTRACTS,
  PetEvolutionReleaseAttestationError,
  ROUTE_IDS,
  loadPetEvolutionReleaseAttestation,
  normalizePetEvolutionReleaseAttestation,
};
