"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const {
  resolvePetFusion,
} = require("../src/auth/pet-fusion");
const {
  createPetFusionRandomContext,
} = require("../src/auth/pet-fusion-random-authority");
const {
  PET_FUSION_ROLE_IDS,
} = require("../src/auth/pet-fusion-recipe-catalog");
const {
  RECIPE_ID,
  createFusionMaterials,
  createTestFusionCatalog,
} = require("../test-support/pet-fusion-fixture");

const SAMPLE_COUNT = 12000;

test("fixed fusion sample keeps three independent 50% actives and one 40/30/30 passive", () => {
  const catalog = createTestFusionCatalog();
  const materials = createFusionMaterials({catalog});
  const activeSuccesses = Object.fromEntries(
    PET_FUSION_ROLE_IDS.map((roleId) => [roleId, 0]),
  );
  const passiveSelections = Object.fromEntries(
    PET_FUSION_ROLE_IDS.map((roleId) => [roleId, 0]),
  );
  let allThreeActiveSuccesses = 0;

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const digest = crypto.createHash("sha256")
      .update(`beastbound/pet-fusion/distribution/${index}`, "utf8")
      .digest("base64url");
    const result = resolvePetFusion(materials, {
      catalog,
      recipeId: RECIPE_ID,
      randomContext: createPetFusionRandomContext(`bpfr1_${digest}`),
    });
    assert.equal(result.ok, true);

    const inheritedRoles = new Set(
      result.blueprint.fusionLineage.activeInheritance
        .filter((entry) => entry.inherited === true)
        .map((entry) => entry.roleId),
    );
    for (const roleId of inheritedRoles) {
      activeSuccesses[roleId] += 1;
    }
    if (inheritedRoles.size === PET_FUSION_ROLE_IDS.length) {
      allThreeActiveSuccesses += 1;
    }
    passiveSelections[result.publicResult.passiveSourceRoleId] += 1;
    assert.equal(result.blueprint.passiveSkillIds.length, 1);
  }

  for (const roleId of PET_FUSION_ROLE_IDS) {
    assertWithin(
      activeSuccesses[roleId] / SAMPLE_COUNT,
      0.5,
      0.02,
      `${roleId} special active inheritance`,
    );
  }
  assertWithin(
    allThreeActiveSuccesses / SAMPLE_COUNT,
    0.125,
    0.015,
    "all three special active inheritance",
  );
  assertWithin(
    passiveSelections.core / SAMPLE_COUNT,
    0.4,
    0.02,
    "core passive source",
  );
  assertWithin(
    passiveSelections.resonance_one / SAMPLE_COUNT,
    0.3,
    0.02,
    "resonance one passive source",
  );
  assertWithin(
    passiveSelections.resonance_two / SAMPLE_COUNT,
    0.3,
    0.02,
    "resonance two passive source",
  );
});

function assertWithin(actual, expected, tolerance, label) {
  assert.equal(
    Math.abs(actual - expected) <= tolerance,
    true,
    `${label} expected ${expected} +/- ${tolerance}, got ${actual}`,
  );
}
