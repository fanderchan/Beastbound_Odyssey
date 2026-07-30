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

test("approved fusion profiles and two frozen formal recipes stay registered but runtime-closed", () => {
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
  assert.equal(result.fusionRecipeCount, 2);
  assert.equal(result.fusionCatalogClosed, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.profileChecks.length, 2);
  assert.equal(result.profileChecks.every((check) => check.matchesFrozenCandidate), true);
  assert.equal(result.fusionRecipeChecks.length, 2);
  assert.equal(result.fusionRecipeChecks.every((check) => check.matchesFrozenRecipe), true);
});

test("production numeric, distribution, audit-band drift and runtime enablement fail with exact evidence", () => {
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
  openedFusionDocument.runtimeEnabled = true;

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
    result.errors.includes("production fusion catalog runtimeEnabled must remain false"),
    true,
  );
});

test("malformed, missing, extra and duplicate fusion recipes fail closed", async (t) => {
  const {
    candidateDocument,
    growthDocument,
    templateDocument,
    fusionDocument,
  } = productionDocuments();
  const cases = [
    {
      name: "malformed recipe",
      mutate(document) {
        document.recipes[0] = null;
      },
      evidence: "recipes[0] must be an object",
    },
    {
      name: "missing recipe",
      mutate(document) {
        document.recipes.pop();
      },
      evidence: "occurrence count expected=1 actual=0",
    },
    {
      name: "extra recipe",
      mutate(document) {
        document.recipes.push({
          recipeId: "unreviewed_extra_recipe",
          targetFormId: "unreviewed_extra_form",
          targetGrowthProfileId: "unreviewed_extra_profile",
          assetGate: {status: "formal"},
        });
      },
      evidence: "recipeId is not a frozen formal recipe",
    },
    {
      name: "duplicate recipe",
      mutate(document) {
        document.recipes[1] = structuredClone(document.recipes[0]);
      },
      evidence: "occurrence count expected=1 actual=2",
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, () => {
      const changedFusionDocument = structuredClone(fusionDocument);
      testCase.mutate(changedFusionDocument);
      const result = verifyProductionPromotion(candidateDocument, {
        growthDocument,
        templateDocument,
        fusionDocument: changedFusionDocument,
      });

      assert.equal(result.fusionCatalogClosed, false);
      assert.equal(result.errors.some((error) => error.includes(testCase.evidence)), true);
    });
  }
});

test("fusion target, growth profile and formal asset status drift fail with field evidence", () => {
  const {
    candidateDocument,
    growthDocument,
    templateDocument,
    fusionDocument,
  } = productionDocuments();
  const driftedFusionDocument = structuredClone(fusionDocument);
  driftedFusionDocument.recipes[0].targetFormId = "drifted_target_form";
  driftedFusionDocument.recipes[0].targetGrowthProfileId = "drifted_growth_profile";
  driftedFusionDocument.recipes[0].assetGate.status = "candidate";

  const result = verifyProductionPromotion(candidateDocument, {
    growthDocument,
    templateDocument,
    fusionDocument: driftedFusionDocument,
  });

  assert.equal(result.fusionCatalogClosed, false);
  assert.equal(result.fusionRecipeChecks[0].matchesFrozenRecipe, false);
  assert.equal(result.errors.some((error) => error.includes("targetFormId expected=")), true);
  assert.equal(
    result.errors.some((error) => error.includes("targetGrowthProfileId expected=")),
    true,
  );
  assert.equal(
    result.errors.some((error) => error.includes("assetGate.status expected=\"formal\"")),
    true,
  );
});
