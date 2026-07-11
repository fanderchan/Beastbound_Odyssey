"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const TOOL_URL = new URL("../../../tools/pet_growth_legacy_save_audit.mjs", `file://${__filename}`);

function profileDocument() {
  return {
    petInstances: [
      {
        instanceId: "legacy_tiger",
        formId: "novice_tiger_mount",
        level: 131,
        maxHp: 1000,
        attack: 180,
        defense: 130,
        quick: 280,
      },
      {
        instanceId: "authority_dragon",
        formId: "blue_man_dragon_water10",
        growthSpeciesProfileId: "blue_man_dragon_v1",
        growthAuthority: {source: "server", modelVersion: "pet_growth_authority_v1"},
        level: 20,
        maxHp: 200,
        attack: 60,
        defense: 30,
        quick: 40,
      },
    ],
    trainingPartners: [{
      pet: {
        instanceId: "unknown_pet",
        formId: "removed_form",
        level: 1,
        maxHp: 1,
        attack: 1,
        defense: 1,
        quick: 1,
      },
    }],
  };
}

test("legacy save audit classifies without modifying input files", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-pet-growth-audit-"));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const inputPath = path.join(root, "player_profile.json");
  const outputPath = path.join(root, "report.json");
  fs.writeFileSync(inputPath, `${JSON.stringify(profileDocument(), null, 2)}\n`);
  const before = fs.readFileSync(inputPath);
  const {runAudit} = await import(TOOL_URL.href);

  const {report} = runAudit({inputs: [inputPath], outputPath});

  assert.equal(report.sourceCount, 1);
  assert.equal(report.petReferenceCount, 3);
  assert.equal(report.counts.legacy_existing_linked, 1);
  assert.equal(report.counts.authority_public_v1, 1);
  assert.equal(report.counts.unknown_form, 1);
  assert.equal(report.manualReviewCount, 1);
  assert.equal(report.inputFilesUnchanged, true);
  assert.deepEqual(fs.readFileSync(inputPath), before);
  assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
});

test("legacy save audit refuses to overwrite an input profile", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-pet-growth-audit-overwrite-"));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const inputPath = path.join(root, "player_profile.json");
  fs.writeFileSync(inputPath, `${JSON.stringify(profileDocument())}\n`);
  const {runAudit} = await import(TOOL_URL.href);

  assert.throws(
    () => runAudit({inputs: [inputPath], outputPath: inputPath}),
    /must not overwrite/,
  );
});
