"use strict";

const assert = require("node:assert/strict");
const {execFileSync, spawnSync} = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "../../..");
const scriptPath = path.resolve(repoRoot, "server/node/scripts/seed-demo-data.js");

test("demo seed script creates a one-time authority-safe disposable json fixture", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-demo-seed-"));
  const storePath = path.join(tempDir, "auth-store.json");
  const firstReportPath = path.join(tempDir, "first-report.json");
  const secondReportPath = path.join(tempDir, "second-report.json");

  const first = runSeed([
    "--store", "json",
    "--output", storePath,
    "--reset-output",
    "--report", firstReportPath,
  ]);
  assert.equal(first.ok, true);
  assert.equal(first.counts.accounts, 4);
  assert.equal(first.counts.profiles, 4);
  assert.equal(first.counts.families, 2);
  assert.equal(first.counts.manors, 1);
  assert.equal(first.accounts.every((account) => account.action === "created"), true);
  assert.equal(first.families.find((family) => family.kind === "main").memberCount, 2);
  assert.equal(first.manor.status, "occupied");
  assert.equal(fs.existsSync(storePath), true);
  assert.equal(fs.existsSync(firstReportPath), true);

  const stored = JSON.parse(fs.readFileSync(storePath, "utf8"));
  const storedPets = Object.values(stored.profiles).map((profileDoc) => profileDoc.profile.petInstances[0]);
  assert.equal(storedPets.length, 4);
  assert.deepEqual(storedPets.map((pet) => pet.level).sort((left, right) => left - right), [4, 16, 25, 32]);
  for (const pet of storedPets) {
    assert.equal(pet.formId, "blue_man_dragon_water10");
    assert.equal(pet.growthModelVersion, "pet_growth_authority_v1");
    assert.equal(pet.petGrowth.modelVersion, "pet_growth_authority_v1");
    assert.match(pet.petGrowth.private.privateSeed, /^bps1_/);
    assert.deepEqual(pet.petGrowth.public.levelOneFourV, pet.initialStats);
  }

  const beforeRejectedReuse = fs.readFileSync(storePath, "utf8");
  const rejectedReuse = runSeedProcess([
    "--store", "json",
    "--output", storePath,
    "--report", secondReportPath,
  ]);
  assert.notEqual(rejectedReuse.status, 0);
  assert.match(rejectedReuse.stderr, /requires an empty disposable store/);
  assert.equal(fs.readFileSync(storePath, "utf8"), beforeRejectedReuse);
  assert.equal(fs.existsSync(secondReportPath), false);

  const reset = runSeed([
    "--store", "json",
    "--output", storePath,
    "--reset-output",
    "--report", secondReportPath,
  ]);
  assert.equal(reset.ok, true);
  assert.equal(reset.counts.accounts, 4);
  assert.equal(reset.counts.families, 2);
  assert.equal(reset.counts.manors, 1);
  assert.equal(reset.accounts.every((account) => account.action === "created"), true);
  assert.equal(reset.families.find((family) => family.kind === "main").action, "created");
  assert.equal(reset.manor.status, "occupied");
  assert.equal(fs.existsSync(secondReportPath), true);
});

test("demo seed script rejects MySQL before connecting to a runtime store", () => {
  const result = runSeedProcess(["--store", "mysql"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MySQL seeding is forbidden/);
  assert.equal(result.stdout, "");
});

test("memory fixture refuses to overwrite an existing output without explicit reset", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-demo-memory-seed-"));
  const outputPath = path.join(tempDir, "snapshot.json");
  fs.writeFileSync(outputPath, "keep-me");

  const rejected = runSeedProcess(["--store", "memory", "--output", outputPath, "--skip-manor"]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /memory fixture output already exists/);
  assert.equal(fs.readFileSync(outputPath, "utf8"), "keep-me");

  const reset = runSeed([
    "--store", "memory",
    "--output", outputPath,
    "--reset-output",
    "--skip-manor",
  ]);
  assert.equal(reset.ok, true);
  const snapshot = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(Object.keys(snapshot.accounts).length, 4);
});

function runSeed(args) {
  const output = execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(output);
}

function runSeedProcess(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
}
