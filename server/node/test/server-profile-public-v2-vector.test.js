"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");

const {publicProfile} = require("../src/auth/profile-visibility");

const VECTOR_PATH = path.resolve(
  __dirname,
  "../../../tools/fixtures/server_pet_profile_public_v2_vectors.json",
);
const PRIVATE_FIELD_KEYS = new Set([
  "continuousStats",
  "futurePrivateGrowthState",
  "individualSeed",
  "individualVariance",
  "private",
  "privateRoll",
  "privateSeed",
  "qualityRoll",
]);

function readVectors() {
  return JSON.parse(fs.readFileSync(VECTOR_PATH, "utf8"));
}

function privateFieldPaths(value, prefix = "") {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => privateFieldPaths(entry, `${prefix}[${index}]`));
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  const paths = [];
  for (const [key, nested] of Object.entries(value)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    if (PRIVATE_FIELD_KEYS.has(key)) {
      paths.push(fieldPath);
      continue;
    }
    paths.push(...privateFieldPaths(nested, fieldPath));
  }
  return paths;
}

test("shared public-profile v2 vectors match exactly, remain idempotent, and expose no private canary", () => {
  const vectors = readVectors();

  assert.equal(vectors.schemaVersion, 2);
  assert.equal(vectors.contractId, "server_pet_profile_public_v2");
  assert.equal(Array.isArray(vectors.cases), true);
  assert.equal(vectors.cases.length > 0, true);

  for (const vector of vectors.cases) {
    const label = String(vector.caseId || "unnamed public-profile vector");
    const internalBefore = structuredClone(vector.internalProfile);
    const actual = publicProfile(vector.internalProfile);

    assert.deepEqual(actual, vector.expectedPublicProfile, `${label}: exact public DTO drifted`);
    assert.deepEqual(vector.internalProfile, internalBefore, `${label}: projection mutated its input`);
    assert.deepEqual(publicProfile(actual), actual, `${label}: public DTO is not idempotent`);
    assert.deepEqual(privateFieldPaths(actual), [], `${label}: private field names reached the DTO`);

    const serialized = JSON.stringify(actual);
    assert.equal(serialized.includes("PRIVATE_CANARY"), false, `${label}: generic canary leaked`);
    for (const canary of vector.privateCanaries || []) {
      assert.equal(serialized.includes(String(canary)), false, `${label}: private canary leaked`);
    }

    assert.equal(
      vector.internalProfile.petInstances.some((pet) => pet && pet.petGrowth),
      true,
      `${label}: authority-v1 coverage is missing`,
    );
    assert.equal(
      vector.internalProfile.petInstances.some((pet) => pet && pet.individualSeed),
      true,
      `${label}: legacy pet coverage is missing`,
    );
    assert.equal(
      Boolean(vector.internalProfile.groundPetDrops?.[0]?.pet),
      true,
      `${label}: ground-pet-drop coverage is missing`,
    );
    assert.equal(
      Boolean(vector.internalProfile.trainingPartners?.[0]?.pet),
      true,
      `${label}: training-partner pet coverage is missing`,
    );
  }
});
