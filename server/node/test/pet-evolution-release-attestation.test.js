"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const test = require("node:test");

const {
  DEFAULT_ATTESTATION_PATH,
  FORM_CONTRACTS,
  PetEvolutionReleaseAttestationError,
  ROUTE_IDS,
  loadPetEvolutionReleaseAttestation,
} = require("../src/auth/pet-evolution-release-attestation");

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

test("P1.3e release attestation freezes owner approval, both routes and both complete art bundles", () => {
  const bytes = fs.readFileSync(DEFAULT_ATTESTATION_PATH);
  const attestation = loadPetEvolutionReleaseAttestation({
    expectedSha256: sha256(bytes),
  });
  assert.equal(attestation.releaseApproved, true);
  assert.equal(attestation.runtimeEnabled, true);
  assert.equal(attestation.ownerReviewStatus, "approved");
  assert.deepEqual(attestation.routeIds, ROUTE_IDS);
  assert.deepEqual(
    attestation.formIds,
    FORM_CONTRACTS.map((entry) => entry.formId),
  );
});

test("P1.3e release attestation fails closed on reference, visual evidence or bundle lifecycle drift", () => {
  assert.throws(
    () => loadPetEvolutionReleaseAttestation({expectedSha256: "0".repeat(64)}),
    (error) => (
      error instanceof PetEvolutionReleaseAttestationError
      && /SHA-256 does not match/.test(error.message)
    ),
  );

  assert.throws(
    () => loadPetEvolutionReleaseAttestation({
      readFile(filePath) {
        const bytes = fs.readFileSync(filePath);
        if (String(filePath).endsWith("/qa/world/owner-decision.json")) {
          const decision = JSON.parse(bytes.toString("utf8"));
          decision.decision = "rejected";
          return Buffer.from(`${JSON.stringify(decision, null, 2)}\n`);
        }
        return bytes;
      },
    }),
    (error) => (
      error instanceof PetEvolutionReleaseAttestationError
      && /frozen evidence|matching owner visual approval/.test(error.message)
    ),
  );

  const targetMetadataPath = FORM_CONTRACTS[0].petMetadataPath;
  assert.throws(
    () => loadPetEvolutionReleaseAttestation({
      readFile(filePath) {
        const bytes = fs.readFileSync(filePath);
        if (String(filePath).endsWith(targetMetadataPath)) {
          const metadata = JSON.parse(bytes.toString("utf8"));
          metadata.runtimeEnabled = false;
          return Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`);
        }
        return bytes;
      },
    }),
    (error) => (
      error instanceof PetEvolutionReleaseAttestationError
      && /standalone pet bundle is not fully runtime-released/.test(error.message)
    ),
  );
});
