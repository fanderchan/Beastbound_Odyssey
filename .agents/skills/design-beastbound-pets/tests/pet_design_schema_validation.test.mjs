import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {fileURLToPath} from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(testDir, "..");
const repoRoot = path.resolve(skillRoot, "../../..");
const validatorPath = path.join(skillRoot, "scripts/validate_pet_design_spec.mjs");
const examplePath = path.join(skillRoot, "references/pet-design-spec.example.json");
const example = JSON.parse(fs.readFileSync(examplePath, "utf8"));

function validateSpec(mutate = () => {}) {
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-pet-schema-"));
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

test("checked-in example satisfies the executable JSON Schema and domain rules", () => {
  const checked = validateSpec();
  assert.equal(checked.status, 0);
  assert.equal(checked.result.ok, true);
  assert.deepEqual(checked.result.errors, []);
});

test("numeric strings are not coerced into schema numbers or integers", () => {
  const cases = [
    ["schemaVersion", (spec) => { spec.schemaVersion = "1"; }],
    ["elements.fire", (spec) => { spec.elements.fire = "6"; }],
    ["acquisition.placements[0].weight", (spec) => {
      spec.acquisition.placements[0].weight = "1";
    }],
    ["growth.outputBase.attack", (spec) => { spec.growth.outputBase.attack = "90"; }],
    ["validation.growthSampleCount", (spec) => { spec.validation.growthSampleCount = "10000"; }],
  ];

  for (const [field, mutate] of cases) {
    const checked = validateSpec(mutate);
    assert.equal(checked.status, 1, field);
    assert.equal(checked.result.ok, false, field);
    assert.ok(
      checked.result.errors.some(
        (message) => message.startsWith("schema:") && message.includes(field),
      ),
      `${field}: ${checked.result.errors.join("\n")}`,
    );
  }
});

test("numbers and objects are not coerced into strings or string-array members", () => {
  const cases = [
    ["designId", (spec) => { spec.designId = 123; }],
    ["taxonomy.formName", (spec) => { spec.taxonomy.formName = {zh: "错误对象"}; }],
    ["playerPromise.roles[0]", (spec) => { spec.playerPromise.roles[0] = 123; }],
    ["presentation.artProduction.portrait.source.ownershipRecordPath", (spec) => {
      spec.presentation.artProduction.portrait.source.ownershipRecordPath = {
        path: "source-and-ownership.md",
      };
    }],
  ];

  for (const [field, mutate] of cases) {
    const checked = validateSpec(mutate);
    assert.equal(checked.status, 1, field);
    assert.equal(checked.result.ok, false, field);
    assert.ok(
      checked.result.errors.some(
        (message) => message.startsWith("schema:") && message.includes(field),
      ),
      `${field}: ${checked.result.errors.join("\n")}`,
    );
  }
});

test("enum fields require their exact declared value and type", () => {
  const checked = validateSpec((spec) => {
    spec.acquisition.sourceType = 0;
  });
  assert.equal(checked.status, 1);
  assert.equal(checked.result.ok, false);
  assert.ok(
    checked.result.errors.some(
      (message) => message.startsWith("schema:")
        && message.includes("acquisition.sourceType")
        && message.includes("枚举值"),
    ),
  );
});
