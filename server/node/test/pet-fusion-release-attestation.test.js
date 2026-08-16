"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const test = require("node:test");

const {
  APPROVED_SCOPES,
  ATTESTATION_ID,
  ATTESTATION_TYPE,
  BATTLE_ACTIONS,
  BATTLE_VIEW_MAPPING,
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
} = require("../src/auth/pet-fusion-release-attestation");

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function buildFixture({
  runtimeReviewer = "project-owner:fander",
  portraitOwnerId = "project-owner:fander",
} = {}) {
  const repoRoot = path.resolve("/virtual/beastbound-odyssey");
  const files = new Map();
  function put(repoPath, value) {
    const bytes = Buffer.isBuffer(value)
      ? value
      : typeof value === "string"
        ? Buffer.from(value)
        : jsonBytes(value);
    files.set(path.join(repoRoot, repoPath), bytes);
    return {path: repoPath, sha256: sha256(bytes)};
  }

  const catalogDocument = {
    schemaVersion: 2,
    catalogId: "pet_fusion_recipes_v2",
    runtimeEnabled: true,
    recipes: RECIPE_IDS.map((recipeId, index) => ({
      recipeId,
      targetFormId: FORM_CONTRACTS[index].formId,
      result: {rideable: false},
      assetGate: {status: "formal"},
    })),
  };
  const catalogReference = put(DEFAULT_CATALOG_REPO_PATH, catalogDocument);

  const priorDecisionDocument = {
    schemaVersion: 1,
    decisionType: "beastbound_pet_fusion_full_nonrideable_visual_owner_decision",
    decisionId: "pet_fusion_p1_4e_full_nonrideable_visual_20260730",
    decision: "approved",
    approvedScopes: [
      "standalone_pet_identity_visual_only",
      "standalone_pet_world_true8_visual_only",
      "standalone_pet_battle_two_view_visual_only",
      "revive_sequence_visual_only",
    ],
    excludedScopes: [
      "dedicated_pet_portrait",
      "player_fusion_entry",
      "fusion_runtime_release",
      "mounted_pet_art",
    ],
    evidence: {
      forms: FORM_CONTRACTS.map((entry) => ({
        formId: entry.formId,
        battleBundleDigest: entry.battleBundleDigest,
      })),
    },
    releaseApproved: false,
    runtimeEnabled: false,
  };
  const priorDecisionReference = put(
    PRIOR_BODY_VISUAL_DECISION_REPO_PATH,
    priorDecisionDocument,
  );

  const mainReviewReference = put(
    "docs/release_evidence/pet_fusion_main_owner_review_v1.json",
    {status: "owner_approved", videoSha256: "a".repeat(64)},
  );
  const phaseRecordReference = put(
    "docs/phase_999_pet_fusion_runtime_release.md",
    "# synthetic P1.4 release fixture\n",
  );
  const ownerDecisionDocument = {
    schemaVersion: 1,
    decisionType: OWNER_DECISION_TYPE,
    decisionId: OWNER_DECISION_ID,
    roadmapItem: "P1.4",
    decision: "approved",
    reviewer: runtimeReviewer,
    recordedDecisionText: "批准首批融合正式开放。",
    ownerReviewStatus: "approved",
    releaseApproved: true,
    runtimeEnabled: true,
    playerEntryOpened: true,
    approvedAtUtc: "2026-08-12T08:00:00Z",
    catalogId: "pet_fusion_recipes_v2",
    recipeIds: [...RECIPE_IDS],
    targetFormIds: FORM_CONTRACTS.map((entry) => entry.formId),
    nonRideableTargetFormIds: FORM_CONTRACTS.map((entry) => entry.formId),
    approvedScopes: [...APPROVED_SCOPES],
    evidence: {
      mainOwnerReview: mainReviewReference,
      phaseRecord: phaseRecordReference,
    },
  };
  const ownerDecisionReference = put(
    "client/godot/data/pet_fusion_runtime_release_owner_decision_v1.json",
    ownerDecisionDocument,
  );

  const portraitReferences = [];
  for (const contract of FORM_CONTRACTS) {
    const runtimeReference = put(contract.portraitRuntimePath, `${contract.formId}:portrait`);
    const masterReference = put(contract.portraitMasterPath, `${contract.formId}:master`);
    const ownershipReference = put(
      contract.portraitOwnershipPath,
      `${contract.formId}:owner-reviewed-source-record`,
    );
    const eligibilityReference = put(
      contract.portraitRuntimePath.replace(
        "/portrait/default.png",
        "/source/portrait/headshot-chroma-eligibility-mask.png",
      ),
      `${contract.formId}:mask`,
    );
    const portraitEvidence = [mainReviewReference, phaseRecordReference];
    const portraitDecisionReference = put(contract.portraitDecisionPath, {
      schemaVersion: 2,
      decisionType: "beastbound_pet_portrait_owner_approval",
      ownerId: portraitOwnerId,
      decision: "approved",
      subject: {
        kind: "shared_dedicated_headshot_v1",
        formId: contract.formId,
        petRoot: contract.petRoot,
        master: masterReference,
        runtime: runtimeReference,
        ownership: ownershipReference,
      },
      acceptedEvidence: portraitEvidence,
      reviewedAt: "2026-08-12T08:00:00Z",
    });
    const portraitDocument = {
      schemaVersion: 1,
      formId: contract.formId,
      capability: "shared_dedicated_headshot_v1",
      independentlyAuthoredClaim: true,
      independentAuthorshipClaimTrust: "owner_verified",
      semanticIndependenceVerified: true,
      releaseGate: true,
      fullBodyCropAllowed: false,
      processing: {
        alphaMatte: {
          despill: {
            scope: "same_operation_exact_eligibility_mask_only",
            globalColorAdjustmentApplied: false,
            changedOutsideEligibilityPixels: 0,
            alphaPixelsChanged: 0,
          },
        },
      },
      assets: {
        runtime: runtimeReference,
        eligibilityMask: {...eligibilityReference, nonzeroPixels: 42},
      },
      ownerReview: {
        required: true,
        status: "approved",
        evidence: portraitEvidence,
        decision: portraitDecisionReference,
      },
    };
    portraitReferences.push(put(contract.portraitMetadataPath, portraitDocument));
  }

  const validationEvidence = VALIDATION_KINDS.map((kind) => ({
    kind,
    status: "passed",
    ...put(`docs/release_evidence/${kind}.json`, {kind, status: "passed"}),
  }));
  const attestationDocument = {
    schemaVersion: 1,
    attestationType: ATTESTATION_TYPE,
    attestationId: ATTESTATION_ID,
    status: "approved",
    ownerReviewStatus: "approved",
    releaseApproved: true,
    runtimeEnabled: true,
    playerEntryOpened: true,
    approvedAtUtc: "2026-08-12T08:00:00Z",
    ownerDecision: ownerDecisionReference,
    priorBodyVisualDecision: priorDecisionReference,
    catalog: catalogReference,
    recipeIds: [...RECIPE_IDS],
    targetFormIds: FORM_CONTRACTS.map((entry) => entry.formId),
    forms: FORM_CONTRACTS.map((entry, index) => ({
      formId: entry.formId,
      petMetadataPath: entry.petMetadataPath,
      portraitMetadata: portraitReferences[index],
      battleBundleDigest: entry.battleBundleDigest,
    })),
    validationEvidence,
    expectedLifecycle: {...EXPECTED_LIFECYCLE},
  };
  const attestationBytes = jsonBytes(attestationDocument);
  const attestationSha256 = sha256(attestationBytes);
  files.set(path.join(repoRoot, DEFAULT_ATTESTATION_REPO_PATH), attestationBytes);

  for (const contract of FORM_CONTRACTS) {
    const approvedActions = Object.fromEntries(
      BATTLE_ACTIONS.map((actionId) => [actionId, {status: "approved"}]),
    );
    put(contract.petMetadataPath, {
      formId: contract.formId,
      artStatus: "approved",
      productionScope: RELEASE_PRODUCTION_SCOPE,
      ownerReviewStatus: "approved",
      keyPoseReviewStatus: "approved",
      runtimeEnabled: true,
      rideableTarget: false,
      runtimeFrameSize: [256, 256],
      views: ["front_3quarter_sw", "back_3quarter_ne"],
      battleViewMapping: structuredClone(BATTLE_VIEW_MAPPING),
      identity: {status: "approved"},
      actions: approvedActions,
      notes: RELEASE_NOTES,
      releaseAttestation: {
        path: DEFAULT_ATTESTATION_REPO_PATH,
        sha256: attestationSha256,
      },
      riding: null,
      worldVisual: {
        status: "approved",
        runtimeEnabled: true,
        strategy: "independent_8",
        runtimeMirroring: false,
        runtimeMountedComposition: false,
        totalFrameCount: 40,
        directions: [
          "south",
          "southwest",
          "west",
          "northwest",
          "north",
          "northeast",
          "east",
          "southeast",
        ],
        actions: {
          idle: {frameCount: 1, fps: 4, status: "approved"},
          walk: {frameCount: 4, fps: 10, status: "approved"},
        },
      },
      battleVisual: {
        status: "approved",
        runtimeEnabled: true,
        kind: "pet",
        views: ["front_3quarter_sw", "back_3quarter_ne"],
        actions: [...BATTLE_ACTIONS],
        battleViewMapping: structuredClone(BATTLE_VIEW_MAPPING),
        totalFrameCount: 180,
        runtimeMirroring: false,
        integratedWholeFrame: false,
        runtimeLayeredComposition: false,
        bundleDigest: contract.battleBundleDigest,
        archiveMode: "full",
        sourceFramesTracked: true,
      },
    });
  }

  return {
    repoRoot,
    files,
    catalogDocument,
    ownerDecisionReference,
    attestationPath: path.join(repoRoot, DEFAULT_ATTESTATION_REPO_PATH),
    attestationSha256,
    readFile(filePath) {
      const bytes = files.get(String(filePath));
      if (!bytes) throw new Error(`missing fixture file ${filePath}`);
      return bytes;
    },
  };
}

test("P1.4 release attestation binds exact recipes, owner scope, portraits and non-rideable bundles", () => {
  const fixture = buildFixture();
  const attestation = loadPetFusionReleaseAttestation({
    repoRoot: fixture.repoRoot,
    attestationPath: fixture.attestationPath,
    expectedSha256: fixture.attestationSha256,
    expectedCatalogDocument: fixture.catalogDocument,
    expectedCatalogPath: path.join(fixture.repoRoot, DEFAULT_CATALOG_REPO_PATH),
    readFile: fixture.readFile,
  });

  assert.equal(attestation.releaseApproved, true);
  assert.equal(attestation.runtimeEnabled, true);
  assert.equal(attestation.playerEntryOpened, true);
  assert.deepEqual(attestation.recipeIds, RECIPE_IDS);
  assert.deepEqual(
    attestation.targetFormIds,
    FORM_CONTRACTS.map((entry) => entry.formId),
  );
  assert.deepEqual(attestation.validationKinds, VALIDATION_KINDS);
  assert.equal(attestation.attestationSha256, fixture.attestationSha256);
  assert.equal(isVerifiedPetFusionReleaseAttestation(attestation), true);
  assert.equal(
    isVerifiedPetFusionReleaseAttestation(structuredClone(attestation)),
    false,
  );
  assert.equal(Object.isFrozen(attestation), true);
  assert.equal(Object.isFrozen(attestation.forms[0]), true);
});

test("P1.4 release attestation fails closed on approval, portrait, catalog or lifecycle drift", async (t) => {
  await t.test("attestation hash", () => {
    const fixture = buildFixture();
    assert.throws(
      () => loadPetFusionReleaseAttestation({
        repoRoot: fixture.repoRoot,
        attestationPath: fixture.attestationPath,
        expectedSha256: "0".repeat(64),
        expectedCatalogDocument: fixture.catalogDocument,
        expectedCatalogPath: path.join(fixture.repoRoot, DEFAULT_CATALOG_REPO_PATH),
        readFile: fixture.readFile,
      }),
      (error) => (
        error instanceof PetFusionReleaseAttestationError
        && /SHA-256 does not match/.test(error.message)
      ),
    );
  });

  await t.test("exact runtime owner identity", () => {
    const fixture = buildFixture({runtimeReviewer: "project-owner:attacker"});
    assert.throws(
      () => loadPetFusionReleaseAttestation({
        repoRoot: fixture.repoRoot,
        attestationPath: fixture.attestationPath,
        expectedCatalogDocument: fixture.catalogDocument,
        expectedCatalogPath: path.join(fixture.repoRoot, DEFAULT_CATALOG_REPO_PATH),
        readFile: fixture.readFile,
      }),
      (error) => (
        error instanceof PetFusionReleaseAttestationError
        && /exact P1\.4 scope/.test(error.message)
      ),
    );
  });

  await t.test("exact portrait owner identity", () => {
    const fixture = buildFixture({portraitOwnerId: "project-owner:attacker"});
    assert.throws(
      () => loadPetFusionReleaseAttestation({
        repoRoot: fixture.repoRoot,
        attestationPath: fixture.attestationPath,
        expectedCatalogDocument: fixture.catalogDocument,
        expectedCatalogPath: path.join(fixture.repoRoot, DEFAULT_CATALOG_REPO_PATH),
        readFile: fixture.readFile,
      }),
      (error) => (
        error instanceof PetFusionReleaseAttestationError
        && /exact trusted approval/.test(error.message)
      ),
    );
  });

  await t.test("owner approval scope", () => {
    const fixture = buildFixture();
    assert.throws(
      () => loadPetFusionReleaseAttestation({
        repoRoot: fixture.repoRoot,
        attestationPath: fixture.attestationPath,
        expectedCatalogDocument: fixture.catalogDocument,
        expectedCatalogPath: path.join(fixture.repoRoot, DEFAULT_CATALOG_REPO_PATH),
        readFile(filePath) {
          const bytes = fixture.readFile(filePath);
          if (String(filePath).endsWith(fixture.ownerDecisionReference.path)) {
            const document = JSON.parse(bytes.toString("utf8"));
            document.approvedScopes.pop();
            return jsonBytes(document);
          }
          return bytes;
        },
      }),
      (error) => (
        error instanceof PetFusionReleaseAttestationError
        && /frozen evidence|exact P1\.4 scope/.test(error.message)
      ),
    );
  });

  await t.test("portrait exact-mask provenance", () => {
    const fixture = buildFixture();
    const portraitPath = FORM_CONTRACTS[0].portraitMetadataPath;
    assert.throws(
      () => loadPetFusionReleaseAttestation({
        repoRoot: fixture.repoRoot,
        attestationPath: fixture.attestationPath,
        expectedCatalogDocument: fixture.catalogDocument,
        expectedCatalogPath: path.join(fixture.repoRoot, DEFAULT_CATALOG_REPO_PATH),
        readFile(filePath) {
          const bytes = fixture.readFile(filePath);
          if (String(filePath).endsWith(portraitPath)) {
            const document = JSON.parse(bytes.toString("utf8"));
            document.processing.alphaMatte.despill.changedOutsideEligibilityPixels = 1;
            return jsonBytes(document);
          }
          return bytes;
        },
      }),
      (error) => (
        error instanceof PetFusionReleaseAttestationError
        && /frozen evidence|exact-mask despill/.test(error.message)
      ),
    );
  });

  await t.test("runtime catalog document", () => {
    const fixture = buildFixture();
    const driftedCatalog = structuredClone(fixture.catalogDocument);
    driftedCatalog.recipes.reverse();
    assert.throws(
      () => loadPetFusionReleaseAttestation({
        repoRoot: fixture.repoRoot,
        attestationPath: fixture.attestationPath,
        expectedCatalogDocument: driftedCatalog,
        expectedCatalogPath: path.join(fixture.repoRoot, DEFAULT_CATALOG_REPO_PATH),
        readFile: fixture.readFile,
      }),
      (error) => (
        error instanceof PetFusionReleaseAttestationError
        && /does not match the runtime catalog document/.test(error.message)
      ),
    );
  });

  await t.test("pet bundle lifecycle", () => {
    const fixture = buildFixture();
    const metadataPath = FORM_CONTRACTS[0].petMetadataPath;
    assert.throws(
      () => loadPetFusionReleaseAttestation({
        repoRoot: fixture.repoRoot,
        attestationPath: fixture.attestationPath,
        expectedCatalogDocument: fixture.catalogDocument,
        expectedCatalogPath: path.join(fixture.repoRoot, DEFAULT_CATALOG_REPO_PATH),
        readFile(filePath) {
          const bytes = fixture.readFile(filePath);
          if (String(filePath).endsWith(metadataPath)) {
            const document = JSON.parse(bytes.toString("utf8"));
            document.runtimeEnabled = false;
            return jsonBytes(document);
          }
          return bytes;
        },
      }),
      (error) => (
        error instanceof PetFusionReleaseAttestationError
        && /pet bundle is not fully runtime-released/.test(error.message)
      ),
    );
  });

  await t.test("battle facing mapping", () => {
    const fixture = buildFixture();
    const metadataPath = FORM_CONTRACTS[0].petMetadataPath;
    assert.throws(
      () => loadPetFusionReleaseAttestation({
        repoRoot: fixture.repoRoot,
        attestationPath: fixture.attestationPath,
        expectedCatalogDocument: fixture.catalogDocument,
        expectedCatalogPath: path.join(fixture.repoRoot, DEFAULT_CATALOG_REPO_PATH),
        readFile(filePath) {
          const bytes = fixture.readFile(filePath);
          if (String(filePath).endsWith(metadataPath)) {
            const document = JSON.parse(bytes.toString("utf8"));
            document.battleVisual.battleViewMapping.ally.facing = "southeast";
            return jsonBytes(document);
          }
          return bytes;
        },
      }),
      (error) => (
        error instanceof PetFusionReleaseAttestationError
        && /battle bundle is not fully source-closed/.test(error.message)
      ),
    );
  });
});
