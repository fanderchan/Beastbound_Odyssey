import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {fileURLToPath} from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(testDir, "..");
const repoRoot = path.resolve(skillRoot, "../../../..");
const validatorPath = path.join(skillRoot, "scripts/validate_pet_design_spec.mjs");
const inspectorPath = path.join(skillRoot, "scripts/inspect_pet_design.mjs");
const examplePath = path.join(skillRoot, "references/pet-design-spec.example.json");
const schemaPath = path.join(skillRoot, "references/pet-design-spec.schema.json");
const example = JSON.parse(fs.readFileSync(examplePath, "utf8"));

function validateSpec(mutate = () => {}) {
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-pet-design-"));
  try {
    const spec = structuredClone(example);
    mutate(spec);
    const specPath = path.join(temporaryDir, "spec.json");
    fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
    const result = spawnSync(
      process.execPath,
      [validatorPath, specPath, "--json"],
      {cwd: repoRoot, encoding: "utf8"},
    );
    assert.equal(result.signal, null, result.stderr);
    return {
      status: result.status,
      result: JSON.parse(result.stdout),
    };
  } finally {
    fs.rmSync(temporaryDir, {recursive: true, force: true});
  }
}

test("schema exposes separate allowed and ineligible paid-reset policy branches", () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  assert.deepEqual(
    schema.properties.progression.properties.paidResetPolicy.oneOf,
    [
      {$ref: "#/$defs/paidResetAllowedPolicy"},
      {$ref: "#/$defs/paidResetIneligiblePolicy"},
    ],
  );
  assert.equal(schema.$defs.paidResetAllowedPolicy.properties.allowed.const, true);
  assert.equal(schema.$defs.paidResetAllowedPolicy.additionalProperties, false);
  assert.equal(schema.$defs.paidResetIneligiblePolicy.properties.allowed.const, false);
  assert.equal(schema.$defs.paidResetIneligiblePolicy.additionalProperties, false);
  assert.match(JSON.stringify(schema.allOf), /terminal_evolution/);
});

test("ordinary form policy validates and only describes the stage-one quote window", () => {
  const checked = validateSpec();
  assert.equal(checked.status, 0);
  assert.equal(checked.result.ok, true);
  assert.equal(example.progression.paidResetPolicy.allowed, true);
  assert.match(example.progression.rebirth, /普通1转且尚未选择终局/);
  assert.match(example.progression.rebirth, /普通2转终局且不可再重置/);
  assert.equal(
    example.progression.terminalPowerPolicy.normalSecondRebirth.preserveStageOneIndividualQuality,
    true,
  );
  assert.equal(
    example.progression.terminalPowerPolicy.evolution.targetHiddenGrowth,
    "fresh_target_species_roll_v1",
  );
  assert.equal(
    example.progression.terminalPowerPolicy.fusion.materialNumericInfluence,
    "none",
  );
  assert.equal(
    example.progression.terminalPowerPolicy.fusion.materialEligibility,
    "ordinary_authority_v1_exactly_one_rebirth_pre_terminal",
  );
});

test("terminal power policy rejects material-weighted fusion growth", () => {
  const checked = validateSpec((spec) => {
    spec.progression.terminalPowerPolicy.fusion.materialNumericInfluence = "weighted_material_quality";
  });
  assert.equal(checked.status, 1);
  assert.equal(checked.result.ok, false);
  assert.ok(checked.result.errors.some((message) => message.includes("融合最终数值不能读取")));
});

test("fusion rejects materials outside ordinary authority-v1 stage-one preterminal pets", () => {
  const checked = validateSpec((spec) => {
    spec.progression.terminalPowerPolicy.fusion.materialEligibility = "any_rebirth_stage";
  });
  assert.equal(checked.status, 1);
  assert.equal(checked.result.ok, false);
  assert.ok(checked.result.errors.some((message) => message.includes("融合材料只能是三只普通authority-v1")));
});

test("evolution target accepts only false plus terminal_evolution", () => {
  const checked = validateSpec((spec) => {
    spec.acquisition.sourceType = "evolution";
    spec.progression.paidResetPolicy = {
      allowed: false,
      ineligibleReason: "terminal_evolution",
    };
  });
  assert.equal(checked.status, 0);
  assert.equal(checked.result.ok, true);
});

test("evolution target rejects an allowed price policy", () => {
  const checked = validateSpec((spec) => {
    spec.acquisition.sourceType = "evolution";
  });
  assert.equal(checked.status, 1);
  assert.equal(checked.result.ok, false);
  assert.ok(checked.result.errors.some((message) => message.includes("进化终局") && message.includes("allowed")));
});

test("ineligible evolution policy rejects price and wallet fields", () => {
  const checked = validateSpec((spec) => {
    spec.acquisition.sourceType = "evolution";
    spec.progression.paidResetPolicy.allowed = false;
    spec.progression.paidResetPolicy.ineligibleReason = "terminal_evolution";
  });
  assert.equal(checked.status, 1);
  assert.equal(checked.result.ok, false);
  assert.ok(checked.result.errors.some((message) => message.includes("allowed=false 不允许字段 priceTierId")));
  assert.ok(checked.result.errors.some((message) => message.includes("allowed=false 不允许字段 walletPolicyId")));
});

test("ordinary form cannot replace its stage-one quote policy with an ineligible policy", () => {
  const checked = validateSpec((spec) => {
    spec.progression.paidResetPolicy = {
      allowed: false,
      ineligibleReason: "terminal_rebirth",
    };
  });
  assert.equal(checked.status, 1);
  assert.equal(checked.result.ok, false);
  assert.ok(checked.result.errors.some((message) => message.includes("普通形态") && message.includes("allowed")));
});

test("fusion target is terminal and chooses a fusion-specific ineligibility reason", () => {
  const allowed = validateSpec((spec) => {
    spec.acquisition.sourceType = "fusion";
  });
  assert.equal(allowed.status, 1);
  assert.ok(allowed.result.errors.some((message) => message.includes("融合终局") && message.includes("allowed")));

  const wrongReason = validateSpec((spec) => {
    spec.acquisition.sourceType = "fusion";
    spec.progression.paidResetPolicy = {
      allowed: false,
      ineligibleReason: "terminal_evolution",
    };
  });
  assert.equal(wrongReason.status, 1);
  assert.ok(wrongReason.result.errors.some((message) => message.includes("不能借用 terminal_evolution")));

  const explicitFusionContract = validateSpec((spec) => {
    spec.acquisition.sourceType = "fusion";
    spec.progression.paidResetPolicy = {
      allowed: false,
      ineligibleReason: "terminal_fusion",
    };
  });
  assert.equal(explicitFusionContract.status, 0);
  assert.equal(explicitFusionContract.result.ok, true);
});

test("repository inspector verifies terminal evolution policies and the stage-one runtime gate", () => {
  const checked = spawnSync(
    process.execPath,
    [inspectorPath, "--check", "--json"],
    {cwd: repoRoot, encoding: "utf8"},
  );
  assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`);
  const result = JSON.parse(checked.stdout);
  assert.equal(result.issues.errors.length, 0);
  assert.equal(result.serverAuthority.publicProfileBoundaryWired, true);
  assert.equal(result.serverAuthority.paidResetStageOneOnlyWired, true);
  assert.equal(result.serverAuthority.normalSecondRebirthSourceQualityWired, true);
  assert.equal(result.serverAuthority.evolutionSourceBonusTargetRerollWired, true);
  assert.equal(result.terminalPowerContract.fusion.materialNumericInfluence, "none");
  assert.equal(
    result.terminalPowerContract.fusion.materialEligibility,
    "ordinary_authority_v1_exactly_one_rebirth_pre_terminal",
  );
  assert.equal(result.terminalPowerContract.fusion.skillInheritance, "contract_allowlist_only");
  assert.equal(result.counts.evolutionTargetForms, 2);
  assert.equal(result.counts.paidResetTerminalFormPolicies, 2);
  assert.equal(
    result.counts.paidResetStageOneQuoteForms + result.counts.paidResetTerminalFormPolicies,
    result.counts.forms,
  );
});

test("inspector labels evolution as terminal instead of showing a price", () => {
  const checked = spawnSync(
    process.execPath,
    [inspectorPath, "--form", "wuli_evolved_crystal_earth8_water2"],
    {cwd: repoRoot, encoding: "utf8"},
  );
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /付费重置: 进化终局，不可付费重置/);
  assert.doesNotMatch(checked.stdout, /付费重置: tier=/);
});
