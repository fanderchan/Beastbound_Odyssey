"use strict";

const assert = require("node:assert/strict");
const {execFileSync} = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "../../..");
const scriptPath = path.resolve(repoRoot, "server/node/scripts/seed-demo-data.js");

test("demo seed script creates reusable json seed data", () => {
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

  const second = runSeed([
    "--store", "json",
    "--output", storePath,
    "--report", secondReportPath,
  ]);
  assert.equal(second.ok, true);
  assert.equal(second.counts.accounts, 4);
  assert.equal(second.counts.families, 2);
  assert.equal(second.counts.manors, 1);
  assert.equal(second.accounts.every((account) => account.action === "reused"), true);
  assert.equal(second.families.find((family) => family.kind === "main").action, "already_joined");
  assert.equal(second.manor.status, "already_owned");
  assert.equal(fs.existsSync(secondReportPath), true);
});

function runSeed(args) {
  const output = execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(output);
}
