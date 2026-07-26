import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

import {verifyProductionPromotion} from "../pet_fusion_candidate_growth_audit.mjs";

const TEST_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(TEST_PATH), "../..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8"));
}

function productionDocuments() {
  return {
    candidateDocument: readJson("docs/data/p1_4b_fusion_candidate_growth_profiles.json"),
    growthDocument: readJson("client/godot/data/balance/pet_growth_species_profiles.json"),
    templateDocument: readJson("client/godot/data/pet_templates.json"),
    fusionDocument: readJson("client/godot/data/pet_fusion_recipes.json"),
  };
}

test("approved fusion profiles exactly match frozen candidate growth fields while recipes stay closed", () => {
  const {
    candidateDocument,
    growthDocument,
    templateDocument,
    fusionDocument,
  } = productionDocuments();
  const result = verifyProductionPromotion(candidateDocument, {
    growthDocument,
    templateDocument,
    fusionDocument,
  });

  assert.equal(result.productionProfilesMatchFrozenCandidates, true);
  assert.equal(result.promotedProfileCount, 2);
  assert.equal(result.approvedProfileCount, 2);
  assert.equal(result.fusionRuntimeEnabled, false);
  assert.equal(result.fusionRecipeCount, 0);
  assert.equal(result.fusionCatalogClosed, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.profileChecks.length, 2);
  assert.equal(result.profileChecks.every((check) => check.matchesFrozenCandidate), true);
});

test("production numeric, distribution, audit-band drift and an opened recipe fail with exact evidence", () => {
  const {
    candidateDocument,
    growthDocument,
    templateDocument,
    fusionDocument,
  } = productionDocuments();
  const driftedGrowthDocument = structuredClone(growthDocument);
  const targetProfile = driftedGrowthDocument.profiles.find(
    (profile) => profile.profileId === candidateDocument.profiles[0].profileId,
  );
  targetProfile.outputGrowth.attack += 0.01;
  targetProfile.individualRules.distribution = "uniform";
  targetProfile.targetAudit.lv140PowerBand[1] += 1;
  const openedFusionDocument = structuredClone(fusionDocument);
  openedFusionDocument.recipes.push({recipeId: "forbidden_test_recipe"});

  const result = verifyProductionPromotion(candidateDocument, {
    growthDocument: driftedGrowthDocument,
    templateDocument,
    fusionDocument: openedFusionDocument,
  });

  assert.equal(result.productionProfilesMatchFrozenCandidates, false);
  assert.equal(result.promotedProfileCount, 1);
  assert.equal(result.fusionCatalogClosed, false);
  assert.equal(
    result.errors.some((error) => (
      error.includes(candidateDocument.profiles[0].profileId)
      && error.includes("outputGrowth.attack")
    )),
    true,
  );
  assert.equal(
    result.errors.some((error) => error.includes("individualRules.distribution")),
    true,
  );
  assert.equal(
    result.errors.some((error) => error.includes("targetAudit.lv140PowerBand")),
    true,
  );
  assert.equal(
    result.errors.includes("production fusion catalog recipes must remain an empty array"),
    true,
  );
});
