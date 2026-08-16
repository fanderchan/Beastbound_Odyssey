"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {isDeepStrictEqual} = require("node:util");

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const DEFAULT_ATTESTATION_REPO_PATH =
  "client/godot/data/pet_fusion_runtime_release_attestation_v1.json";
const DEFAULT_ATTESTATION_PATH = path.join(REPO_ROOT, DEFAULT_ATTESTATION_REPO_PATH);
const DEFAULT_CATALOG_REPO_PATH = "client/godot/data/pet_fusion_recipes.json";
const PRIOR_BODY_VISUAL_DECISION_REPO_PATH =
  "client/godot/data/pet_fusion_visual_owner_decision_v1.json";
const ATTESTATION_TYPE = "beastbound_pet_fusion_runtime_release_attestation";
const ATTESTATION_ID = "pet_fusion_p1_4_runtime_release_v1";
const OWNER_DECISION_TYPE = "beastbound_pet_fusion_runtime_release_owner_decision";
const OWNER_DECISION_ID = "pet_fusion_p1_4_runtime_release_v1";
const PORTRAIT_OWNER_DECISION_TYPE = "beastbound_pet_portrait_owner_approval";
const TRUSTED_PROJECT_OWNER_ID = "project-owner:fander";
const CATALOG_ID = "pet_fusion_recipes_v2";
const RECIPE_IDS = Object.freeze([
  "emberhorn_solar_crown_fusion_v1",
  "emberhorn_moss_rampart_fusion_v1",
]);
const FORM_CONTRACTS = Object.freeze([
  Object.freeze({
    formId: "emberhorn_fusion_solar_crown_fire7_wind3",
    petRoot:
      "client/godot/assets/pets/emberhorn_fusion_solar_crown_fire7_wind3",
    petMetadataPath:
      "client/godot/assets/pets/emberhorn_fusion_solar_crown_fire7_wind3/action-bundle-meta.json",
    portraitMetadataPath:
      "client/godot/assets/pets/emberhorn_fusion_solar_crown_fire7_wind3/portrait/portrait-meta.json",
    portraitRuntimePath:
      "client/godot/assets/pets/emberhorn_fusion_solar_crown_fire7_wind3/portrait/default.png",
    portraitMasterPath:
      "client/godot/assets/pets/emberhorn_fusion_solar_crown_fire7_wind3/source/portrait/headshot-master-1024.png",
    portraitOwnershipPath:
      "client/godot/assets/pets/emberhorn_fusion_solar_crown_fire7_wind3/portrait/source-and-ownership.md",
    portraitDecisionPath:
      "client/godot/assets/pets/emberhorn_fusion_solar_crown_fire7_wind3/portrait/owner-decision.json",
    battleBundleDigest: "5a4896f64614b4eceaad220071fdd80fe85909bfa78d67ffb0637090a71da2fc",
  }),
  Object.freeze({
    formId: "emberhorn_fusion_moss_rampart_fire4_earth6",
    petRoot:
      "client/godot/assets/pets/emberhorn_fusion_moss_rampart_fire4_earth6",
    petMetadataPath:
      "client/godot/assets/pets/emberhorn_fusion_moss_rampart_fire4_earth6/action-bundle-meta.json",
    portraitMetadataPath:
      "client/godot/assets/pets/emberhorn_fusion_moss_rampart_fire4_earth6/portrait/portrait-meta.json",
    portraitRuntimePath:
      "client/godot/assets/pets/emberhorn_fusion_moss_rampart_fire4_earth6/portrait/default.png",
    portraitMasterPath:
      "client/godot/assets/pets/emberhorn_fusion_moss_rampart_fire4_earth6/source/portrait/headshot-master-1024.png",
    portraitOwnershipPath:
      "client/godot/assets/pets/emberhorn_fusion_moss_rampart_fire4_earth6/portrait/source-and-ownership.md",
    portraitDecisionPath:
      "client/godot/assets/pets/emberhorn_fusion_moss_rampart_fire4_earth6/portrait/owner-decision.json",
    battleBundleDigest: "27c3a0784ab6a2e55a3f3acc6624a722a8b4240bbb04bcd0ffbc53a52d524107",
  }),
]);
const APPROVED_SCOPES = Object.freeze([
  "dedicated_pet_portrait",
  "fusion_information_layout",
  "player_fusion_entry",
  "fusion_runtime_release",
]);
const VALIDATION_KINDS = Object.freeze([
  "closed_asset_replay",
  "authoritative_three_pet_atomic_transaction",
  "idempotency_disconnect_conflict_rollback",
  "real_main_entry_and_performance",
]);
const WORLD_DIRECTIONS = Object.freeze([
  "south",
  "southwest",
  "west",
  "northwest",
  "north",
  "northeast",
  "east",
  "southeast",
]);
const BATTLE_VIEWS = Object.freeze([
  "front_3quarter_sw",
  "back_3quarter_ne",
]);
const BATTLE_ACTIONS = Object.freeze([
  "idle",
  "walk",
  "attack",
  "skill",
  "hurt",
  "defend",
  "dodge",
  "counter",
  "stagger",
  "knockaway",
  "down",
  "revive",
]);
const BATTLE_VIEW_MAPPING = Object.freeze({
  enemy: Object.freeze({
    view: "front_3quarter_sw",
    flipH: true,
    facing: "southeast",
  }),
  ally: Object.freeze({
    view: "back_3quarter_ne",
    flipH: true,
    facing: "northwest",
  }),
});
const RELEASE_PRODUCTION_SCOPE = "formal_nonrideable_runtime_release";
const RELEASE_NOTES =
  "Identity, true-eight-direction world art, dedicated portrait, and the "
  + "complete two-view battle matrix are owner-approved for the first "
  + "non-rideable fusion runtime release.";
const EXPECTED_LIFECYCLE = Object.freeze({
  artStatus: "approved",
  ownerReviewStatus: "approved",
  releaseApproved: true,
  runtimeEnabled: true,
  playerEntryOpened: true,
  resultRideable: false,
  petWorldRuntimeEnabled: true,
  petBattleRuntimeEnabled: true,
  portraitSemanticIndependenceVerified: true,
  portraitReleaseGate: true,
});
const VERIFIED_ATTESTATIONS = new WeakSet();

class PetFusionReleaseAttestationError extends Error {
  constructor(errors) {
    const values = array(errors).map(String).filter(Boolean);
    super(`pet fusion release attestation invalid: ${values.join("; ")}`);
    this.name = "PetFusionReleaseAttestationError";
    this.code = "pet_fusion_release_attestation_invalid";
    this.errors = values;
  }
}

function loadPetFusionReleaseAttestation(options = {}) {
  const repoRoot = path.resolve(String(options.repoRoot || REPO_ROOT));
  const attestationPath = path.resolve(String(
    options.attestationPath || path.join(repoRoot, DEFAULT_ATTESTATION_REPO_PATH),
  ));
  const readFile = typeof options.readFile === "function" ? options.readFile : fs.readFileSync;
  const errors = [];
  let bytes = Buffer.alloc(0);
  try {
    bytes = toBuffer(readFile(attestationPath));
  } catch {
    errors.push("release attestation path does not exist");
  }
  const attestationSha256 = bytes.length > 0 ? digest(bytes) : "";
  const expectedSha256 = text(options.expectedSha256).toLowerCase();
  if (expectedSha256 && attestationSha256 !== expectedSha256) {
    errors.push("release attestation SHA-256 does not match the expected reference");
  }
  let document = {};
  if (bytes.length > 0) {
    try {
      document = JSON.parse(bytes.toString("utf8"));
    } catch {
      errors.push("release attestation is not valid JSON");
    }
  }
  return normalizePetFusionReleaseAttestation({
    document,
    repoRoot,
    attestationPath,
    attestationSha256,
    readFile,
    expectedCatalogDocument: options.expectedCatalogDocument,
    expectedCatalogPath: options.expectedCatalogPath,
    errors,
  });
}

function normalizePetFusionReleaseAttestation(input = {}) {
  const errors = array(input.errors);
  const document = record(input.document);
  const repoRoot = path.resolve(String(input.repoRoot || REPO_ROOT));
  const attestationPath = path.resolve(String(
    input.attestationPath || path.join(repoRoot, DEFAULT_ATTESTATION_REPO_PATH),
  ));
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
    "playerEntryOpened",
    "approvedAtUtc",
    "ownerDecision",
    "priorBodyVisualDecision",
    "catalog",
    "recipeIds",
    "targetFormIds",
    "forms",
    "validationEvidence",
    "expectedLifecycle",
  ], "attestation", errors);
  if (document.schemaVersion !== 1) errors.push("attestation.schemaVersion must equal 1");
  if (text(document.attestationType) !== ATTESTATION_TYPE) {
    errors.push("attestation.attestationType is invalid");
  }
  if (text(document.attestationId) !== ATTESTATION_ID) {
    errors.push("attestation.attestationId is invalid");
  }
  if (
    text(document.status) !== "approved"
    || text(document.ownerReviewStatus) !== "approved"
    || document.releaseApproved !== true
    || document.runtimeEnabled !== true
    || document.playerEntryOpened !== true
  ) {
    errors.push("attestation lifecycle must be owner-approved, player-open and runtime-enabled");
  }
  if (!isIsoUtc(document.approvedAtUtc)) {
    errors.push("attestation.approvedAtUtc must be an ISO UTC timestamp");
  }
  if (attestationPath !== expectedAttestationPath) {
    errors.push("attestation must use the frozen v1 data path");
  }
  if (!isSha256(attestationSha256)) errors.push("attestation SHA-256 is invalid");
  if (!isDeepStrictEqual(array(document.recipeIds), RECIPE_IDS)) {
    errors.push("attestation.recipeIds must match both production recipes");
  }
  const expectedFormIds = FORM_CONTRACTS.map((entry) => entry.formId);
  if (!isDeepStrictEqual(array(document.targetFormIds), expectedFormIds)) {
    errors.push("attestation.targetFormIds must match both non-rideable fusion forms");
  }
  if (!isDeepStrictEqual(record(document.expectedLifecycle), EXPECTED_LIFECYCLE)) {
    errors.push("attestation.expectedLifecycle is incomplete");
  }

  const catalogReference = validateFrozenReference(
    document.catalog,
    "catalog",
    repoRoot,
    readFile,
    errors,
  );
  if (catalogReference.path !== DEFAULT_CATALOG_REPO_PATH) {
    errors.push("catalog.path must use the production fusion catalog path");
  }
  const expectedCatalogPath = path.resolve(String(
    input.expectedCatalogPath || path.join(repoRoot, DEFAULT_CATALOG_REPO_PATH),
  ));
  if (expectedCatalogPath !== path.join(repoRoot, DEFAULT_CATALOG_REPO_PATH)) {
    errors.push("runtime fusion catalog must use the frozen production path");
  }
  validateCatalog(
    catalogReference.document,
    input.expectedCatalogDocument,
    errors,
  );

  const priorBodyVisualDecisionReference = validateFrozenReference(
    document.priorBodyVisualDecision,
    "priorBodyVisualDecision",
    repoRoot,
    readFile,
    errors,
  );
  if (priorBodyVisualDecisionReference.path !== PRIOR_BODY_VISUAL_DECISION_REPO_PATH) {
    errors.push("priorBodyVisualDecision.path is not the frozen Phase 372 decision");
  }
  validatePriorBodyVisualDecision(priorBodyVisualDecisionReference.document, errors);

  const ownerDecisionReference = validateFrozenReference(
    document.ownerDecision,
    "ownerDecision",
    repoRoot,
    readFile,
    errors,
  );
  validateOwnerDecision(ownerDecisionReference.document, repoRoot, readFile, errors);

  const forms = [];
  const seenForms = new Set();
  for (const [index, rawValue] of array(document.forms).entries()) {
    const raw = record(rawValue);
    const label = `forms[${index}]`;
    exactKeys(raw, [
      "formId",
      "petMetadataPath",
      "portraitMetadata",
      "battleBundleDigest",
    ], label, errors);
    const contract = FORM_CONTRACTS[index];
    if (
      !contract
      || text(raw.formId) !== contract.formId
      || text(raw.petMetadataPath) !== contract.petMetadataPath
      || text(raw.battleBundleDigest) !== contract.battleBundleDigest
    ) {
      errors.push(`${label} does not match the frozen fusion-form contract`);
      continue;
    }
    if (seenForms.has(contract.formId)) errors.push(`duplicate attested form ${contract.formId}`);
    seenForms.add(contract.formId);
    const portraitReference = validateFrozenReference(
      raw.portraitMetadata,
      `${contract.formId}.portraitMetadata`,
      repoRoot,
      readFile,
      errors,
    );
    if (portraitReference.path !== contract.portraitMetadataPath) {
      errors.push(`${contract.formId} portrait metadata path is not frozen`);
    }
    validatePortraitMetadata(
      contract,
      portraitReference.document,
      repoRoot,
      readFile,
      errors,
    );
    validatePetMetadata(
      contract,
      repoRoot,
      readFile,
      attestationSha256,
      errors,
    );
    forms.push({
      formId: contract.formId,
      petMetadataPath: contract.petMetadataPath,
      portraitMetadataPath: portraitReference.path,
      portraitMetadataSha256: portraitReference.sha256,
      battleBundleDigest: contract.battleBundleDigest,
    });
  }
  if (forms.length !== FORM_CONTRACTS.length) {
    errors.push("attestation must cover exactly two fusion forms");
  }

  const validationKinds = [];
  for (const [index, rawValue] of array(document.validationEvidence).entries()) {
    const raw = record(rawValue);
    const label = `validationEvidence[${index}]`;
    exactKeys(raw, ["kind", "status", "path", "sha256"], label, errors);
    const expectedKind = VALIDATION_KINDS[index];
    if (text(raw.kind) !== expectedKind || text(raw.status) !== "passed") {
      errors.push(`${label} does not match the frozen P1.4 validation contract`);
    }
    validateFrozenReference(
      {path: raw.path, sha256: raw.sha256},
      label,
      repoRoot,
      readFile,
      errors,
      false,
    );
    validationKinds.push(text(raw.kind));
  }
  if (!isDeepStrictEqual(validationKinds, VALIDATION_KINDS)) {
    errors.push("attestation.validationEvidence must cover all four release gates");
  }

  if (errors.length > 0) throw new PetFusionReleaseAttestationError(errors);
  const normalized = deepFreeze({
    schemaVersion: 1,
    attestationType: ATTESTATION_TYPE,
    attestationId: ATTESTATION_ID,
    status: "approved",
    ownerReviewStatus: "approved",
    releaseApproved: true,
    runtimeEnabled: true,
    playerEntryOpened: true,
    approvedAtUtc: text(document.approvedAtUtc),
    catalogId: CATALOG_ID,
    recipeIds: [...RECIPE_IDS],
    targetFormIds: expectedFormIds,
    forms,
    validationKinds: [...VALIDATION_KINDS],
    attestationPath,
    attestationRepoPath: DEFAULT_ATTESTATION_REPO_PATH,
    attestationSha256,
    ownerDecisionPath: ownerDecisionReference.path,
    ownerDecisionSha256: ownerDecisionReference.sha256,
    priorBodyVisualDecisionPath: priorBodyVisualDecisionReference.path,
    priorBodyVisualDecisionSha256: priorBodyVisualDecisionReference.sha256,
    catalogPath: catalogReference.path,
    catalogSha256: catalogReference.sha256,
  });
  VERIFIED_ATTESTATIONS.add(normalized);
  return normalized;
}

function isVerifiedPetFusionReleaseAttestation(value) {
  return Boolean(value && typeof value === "object" && VERIFIED_ATTESTATIONS.has(value));
}

function validateCatalog(documentValue, expectedCatalogDocument, errors) {
  const document = record(documentValue);
  const recipes = array(document.recipes);
  const actualRecipeIds = recipes.map((entry) => text(record(entry).recipeId));
  const actualTargetFormIds = recipes.map((entry) => text(record(entry).targetFormId));
  if (
    document.schemaVersion !== 2
    || text(document.catalogId) !== CATALOG_ID
    || document.runtimeEnabled !== true
    || !isDeepStrictEqual(actualRecipeIds, RECIPE_IDS)
    || !isDeepStrictEqual(actualTargetFormIds, FORM_CONTRACTS.map((entry) => entry.formId))
  ) {
    errors.push("catalog reference does not open the exact two production fusion recipes");
  }
  for (const [index, recipeValue] of recipes.entries()) {
    const recipe = record(recipeValue);
    if (
      text(record(recipe.assetGate).status) !== "formal"
      || record(recipe.result).rideable !== false
    ) {
      errors.push(`catalog recipe ${index} must use formal non-rideable assets`);
    }
  }
  if (
    expectedCatalogDocument !== undefined
    && !isDeepStrictEqual(document, record(expectedCatalogDocument))
  ) {
    errors.push("catalog reference does not match the runtime catalog document");
  }
}

function validatePriorBodyVisualDecision(documentValue, errors) {
  const document = record(documentValue);
  const expectedScopes = [
    "standalone_pet_identity_visual_only",
    "standalone_pet_world_true8_visual_only",
    "standalone_pet_battle_two_view_visual_only",
    "revive_sequence_visual_only",
  ];
  const excludedScopes = array(document.excludedScopes);
  const forms = array(record(document.evidence).forms);
  if (
    document.schemaVersion !== 1
    || text(document.decisionType)
      !== "beastbound_pet_fusion_full_nonrideable_visual_owner_decision"
    || text(document.decisionId) !== "pet_fusion_p1_4e_full_nonrideable_visual_20260730"
    || text(document.decision) !== "approved"
    || !isDeepStrictEqual(array(document.approvedScopes), expectedScopes)
    || document.releaseApproved !== false
    || document.runtimeEnabled !== false
  ) {
    errors.push("prior body visual decision is not the frozen visual-only approval");
  }
  for (const scope of [
    "dedicated_pet_portrait",
    "player_fusion_entry",
    "fusion_runtime_release",
    "mounted_pet_art",
  ]) {
    if (!excludedScopes.includes(scope)) {
      errors.push(`prior body visual decision must exclude ${scope}`);
    }
  }
  const expectedForms = FORM_CONTRACTS.map((entry) => ({
    formId: entry.formId,
    battleBundleDigest: entry.battleBundleDigest,
  }));
  const actualForms = forms.map((entryValue) => {
    const entry = record(entryValue);
    return {
      formId: text(entry.formId),
      battleBundleDigest: text(entry.battleBundleDigest),
    };
  });
  if (!isDeepStrictEqual(actualForms, expectedForms)) {
    errors.push("prior body visual decision does not cover both frozen battle bundles");
  }
}

function validateOwnerDecision(documentValue, repoRoot, readFile, errors) {
  const document = record(documentValue);
  exactKeys(document, [
    "schemaVersion",
    "decisionType",
    "decisionId",
    "roadmapItem",
    "decision",
    "reviewer",
    "recordedDecisionText",
    "ownerReviewStatus",
    "releaseApproved",
    "runtimeEnabled",
    "playerEntryOpened",
    "approvedAtUtc",
    "catalogId",
    "recipeIds",
    "targetFormIds",
    "nonRideableTargetFormIds",
    "approvedScopes",
    "evidence",
  ], "ownerDecision.document", errors);
  const expectedFormIds = FORM_CONTRACTS.map((entry) => entry.formId);
  if (
    document.schemaVersion !== 1
    || text(document.decisionType) !== OWNER_DECISION_TYPE
    || text(document.decisionId) !== OWNER_DECISION_ID
    || text(document.roadmapItem) !== "P1.4"
    || text(document.decision) !== "approved"
    || text(document.reviewer) !== TRUSTED_PROJECT_OWNER_ID
    || text(document.recordedDecisionText) === ""
    || text(document.ownerReviewStatus) !== "approved"
    || document.releaseApproved !== true
    || document.runtimeEnabled !== true
    || document.playerEntryOpened !== true
    || !isIsoUtc(document.approvedAtUtc)
    || text(document.catalogId) !== CATALOG_ID
    || !isDeepStrictEqual(array(document.recipeIds), RECIPE_IDS)
    || !isDeepStrictEqual(array(document.targetFormIds), expectedFormIds)
    || !isDeepStrictEqual(array(document.nonRideableTargetFormIds), expectedFormIds)
    || !isDeepStrictEqual(array(document.approvedScopes), APPROVED_SCOPES)
  ) {
    errors.push("owner runtime-release decision does not approve the exact P1.4 scope");
  }
  const evidence = record(document.evidence);
  exactKeys(evidence, ["mainOwnerReview", "phaseRecord"], "ownerDecision.evidence", errors);
  validateFrozenReference(
    evidence.mainOwnerReview,
    "ownerDecision.evidence.mainOwnerReview",
    repoRoot,
    readFile,
    errors,
    false,
  );
  validateFrozenReference(
    evidence.phaseRecord,
    "ownerDecision.evidence.phaseRecord",
    repoRoot,
    readFile,
    errors,
    false,
  );
}

function validatePetMetadata(contract, repoRoot, readFile, attestationSha256, errors) {
  const metadata = readJsonReference(
    contract.petMetadataPath,
    `${contract.formId}.petMetadata`,
    repoRoot,
    readFile,
    errors,
  );
  const world = record(metadata.worldVisual);
  const worldActions = record(world.actions);
  const battle = record(metadata.battleVisual);
  const identity = record(metadata.identity);
  const actions = record(metadata.actions);
  const expectedReference = {
    path: DEFAULT_ATTESTATION_REPO_PATH,
    sha256: attestationSha256,
  };
  if (
    text(metadata.formId) !== contract.formId
    || text(metadata.artStatus) !== "approved"
    || text(metadata.productionScope) !== RELEASE_PRODUCTION_SCOPE
    || text(metadata.ownerReviewStatus) !== "approved"
    || text(metadata.keyPoseReviewStatus) !== "approved"
    || metadata.runtimeEnabled !== true
    || !isDeepStrictEqual(record(metadata.releaseAttestation), expectedReference)
    || metadata.riding !== null
    || metadata.rideableTarget !== false
    || !isDeepStrictEqual(array(metadata.runtimeFrameSize), [256, 256])
    || !isDeepStrictEqual(array(metadata.views), BATTLE_VIEWS)
    || !isDeepStrictEqual(record(metadata.battleViewMapping), BATTLE_VIEW_MAPPING)
    || text(identity.status) !== "approved"
    || text(metadata.notes) !== RELEASE_NOTES
    || !isDeepStrictEqual(Object.keys(actions), BATTLE_ACTIONS)
    || BATTLE_ACTIONS.some((actionId) => text(record(actions[actionId]).status) !== "approved")
  ) {
    errors.push(`${contract.formId} pet bundle is not fully runtime-released and non-rideable`);
  }
  if (
    text(world.status) !== "approved"
    || world.runtimeEnabled !== true
    || text(world.strategy) !== "independent_8"
    || world.runtimeMirroring !== false
    || world.runtimeMountedComposition !== false
    || world.totalFrameCount !== 40
    || !isDeepStrictEqual(array(world.directions), WORLD_DIRECTIONS)
    || record(worldActions.idle).frameCount !== 1
    || text(record(worldActions.idle).status) !== "approved"
    || record(worldActions.walk).frameCount !== 4
    || record(worldActions.walk).fps !== 10
    || text(record(worldActions.walk).status) !== "approved"
  ) {
    errors.push(`${contract.formId} world bundle is not an approved runtime true-eight walk set`);
  }
  if (
    text(battle.status) !== "approved"
    || battle.runtimeEnabled !== true
    || text(battle.kind) !== "pet"
    || !isDeepStrictEqual(array(battle.views), BATTLE_VIEWS)
    || !isDeepStrictEqual(array(battle.actions), BATTLE_ACTIONS)
    || !isDeepStrictEqual(record(battle.battleViewMapping), BATTLE_VIEW_MAPPING)
    || battle.totalFrameCount !== 180
    || battle.runtimeMirroring !== false
    || battle.integratedWholeFrame !== false
    || battle.runtimeLayeredComposition !== false
    || text(battle.bundleDigest) !== contract.battleBundleDigest
    || text(battle.archiveMode) !== "full"
    || battle.sourceFramesTracked !== true
  ) {
    errors.push(`${contract.formId} battle bundle is not fully source-closed and runtime-released`);
  }
}

function validatePortraitMetadata(
  contract,
  documentValue,
  repoRoot,
  readFile,
  errors,
) {
  const document = record(documentValue);
  const ownerReview = record(document.ownerReview);
  const processing = record(document.processing);
  const alphaMatte = record(processing.alphaMatte);
  const despill = record(alphaMatte.despill);
  const assets = record(document.assets);
  const runtimeAsset = record(assets.runtime);
  const eligibilityMask = record(assets.eligibilityMask);
  exactKeys(
    ownerReview,
    ["required", "status", "evidence", "decision"],
    `${contract.formId}.portraitOwnerReview`,
    errors,
  );
  if (
    document.schemaVersion !== 1
    || text(document.formId) !== contract.formId
    || text(document.capability) !== "shared_dedicated_headshot_v1"
    || document.independentlyAuthoredClaim !== true
    || text(document.independentAuthorshipClaimTrust) !== "owner_verified"
    || document.semanticIndependenceVerified !== true
    || document.releaseGate !== true
    || document.fullBodyCropAllowed !== false
    || ownerReview.required !== true
    || text(ownerReview.status) !== "approved"
  ) {
    errors.push(`${contract.formId} portrait is not a dedicated owner-approved release asset`);
  }
  const acceptedEvidence = [];
  for (const [index, evidenceValue] of array(ownerReview.evidence).entries()) {
    const reference = validateFrozenReference(
      evidenceValue,
      `${contract.formId}.portraitOwnerEvidence[${index}]`,
      repoRoot,
      readFile,
      errors,
      false,
    );
    acceptedEvidence.push({path: reference.path, sha256: reference.sha256});
  }
  if (acceptedEvidence.length === 0) {
    errors.push(`${contract.formId} portrait owner approval must bind non-empty evidence`);
  }
  const portraitDecisionReference = validateFrozenReference(
    ownerReview.decision,
    `${contract.formId}.portraitOwnerDecision`,
    repoRoot,
    readFile,
    errors,
  );
  if (portraitDecisionReference.path !== contract.portraitDecisionPath) {
    errors.push(`${contract.formId} portrait owner decision path is not frozen`);
  }
  validatePortraitOwnerDecision(
    contract,
    portraitDecisionReference.document,
    acceptedEvidence,
    repoRoot,
    readFile,
    errors,
  );
  if (
    text(despill.scope) !== "same_operation_exact_eligibility_mask_only"
    || despill.globalColorAdjustmentApplied !== false
    || despill.changedOutsideEligibilityPixels !== 0
    || despill.alphaPixelsChanged !== 0
  ) {
    errors.push(`${contract.formId} portrait does not preserve the exact-mask despill boundary`);
  }
  if (
    text(runtimeAsset.path) !== contract.portraitRuntimePath
    || !isSha256(runtimeAsset.sha256)
  ) {
    errors.push(`${contract.formId} portrait runtime asset reference is invalid`);
  }
  validateFrozenReference(
    {path: runtimeAsset.path, sha256: runtimeAsset.sha256},
    `${contract.formId}.portraitRuntime`,
    repoRoot,
    readFile,
    errors,
    false,
  );
  if (
    text(eligibilityMask.path) === ""
    || !isSha256(eligibilityMask.sha256)
    || !(Number(eligibilityMask.nonzeroPixels) > 0)
  ) {
    errors.push(`${contract.formId} portrait eligibility mask reference is invalid`);
  }
  validateFrozenReference(
    {path: eligibilityMask.path, sha256: eligibilityMask.sha256},
    `${contract.formId}.portraitEligibilityMask`,
    repoRoot,
    readFile,
    errors,
    false,
  );
}

function validatePortraitOwnerDecision(
  contract,
  documentValue,
  acceptedEvidence,
  repoRoot,
  readFile,
  errors,
) {
  const document = record(documentValue);
  exactKeys(document, [
    "schemaVersion",
    "decisionType",
    "ownerId",
    "decision",
    "subject",
    "acceptedEvidence",
    "reviewedAt",
  ], `${contract.formId}.portraitOwnerDecision.document`, errors);
  if (
    document.schemaVersion !== 2
    || text(document.decisionType) !== PORTRAIT_OWNER_DECISION_TYPE
    || text(document.ownerId) !== TRUSTED_PROJECT_OWNER_ID
    || text(document.decision) !== "approved"
    || !isIsoUtc(document.reviewedAt)
    || !isDeepStrictEqual(array(document.acceptedEvidence), acceptedEvidence)
  ) {
    errors.push(`${contract.formId} portrait owner decision is not the exact trusted approval`);
  }
  const subject = record(document.subject);
  exactKeys(
    subject,
    ["kind", "formId", "petRoot", "master", "runtime", "ownership"],
    `${contract.formId}.portraitOwnerDecision.subject`,
    errors,
  );
  const masterReference = validateFrozenReference(
    subject.master,
    `${contract.formId}.portraitOwnerDecision.master`,
    repoRoot,
    readFile,
    errors,
    false,
  );
  const runtimeReference = validateFrozenReference(
    subject.runtime,
    `${contract.formId}.portraitOwnerDecision.runtime`,
    repoRoot,
    readFile,
    errors,
    false,
  );
  const ownershipReference = validateFrozenReference(
    subject.ownership,
    `${contract.formId}.portraitOwnerDecision.ownership`,
    repoRoot,
    readFile,
    errors,
    false,
  );
  if (
    text(subject.kind) !== "shared_dedicated_headshot_v1"
    || text(subject.formId) !== contract.formId
    || text(subject.petRoot) !== contract.petRoot
    || masterReference.path !== contract.portraitMasterPath
    || runtimeReference.path !== contract.portraitRuntimePath
    || ownershipReference.path !== contract.portraitOwnershipPath
  ) {
    errors.push(`${contract.formId} portrait owner decision subject drifted`);
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
  APPROVED_SCOPES,
  ATTESTATION_ID,
  ATTESTATION_TYPE,
  BATTLE_ACTIONS,
  BATTLE_VIEW_MAPPING,
  DEFAULT_ATTESTATION_PATH,
  DEFAULT_ATTESTATION_REPO_PATH,
  DEFAULT_CATALOG_REPO_PATH,
  EXPECTED_LIFECYCLE,
  FORM_CONTRACTS,
  OWNER_DECISION_ID,
  OWNER_DECISION_TYPE,
  PRIOR_BODY_VISUAL_DECISION_REPO_PATH,
  RELEASE_NOTES,
  RELEASE_PRODUCTION_SCOPE,
  PetFusionReleaseAttestationError,
  RECIPE_IDS,
  VALIDATION_KINDS,
  isVerifiedPetFusionReleaseAttestation,
  loadPetFusionReleaseAttestation,
  normalizePetFusionReleaseAttestation,
};
