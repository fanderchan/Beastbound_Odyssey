import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCandidatePath,
  parseNameStatusZ,
  scanTextForPrivateAbsolutePaths,
  scanTextForSecrets,
  sensitiveFilenameReason,
  transientPathReason,
} from "../audit_release_candidate.mjs";

test("candidate paths are assigned to explicit release categories", () => {
  const cases = new Map([
    ["AGENTS.md", "repository_policy"],
    [".agents/skills/design-beastbound-maps/SKILL.md", "repository_policy"],
    ["client/godot/assets/maps/firebud_region_visual_v2/evidence/performance-report.json", "immutable_asset_evidence"],
    ["client/godot/assets/pets/example/source/provenance.json", "asset_source_and_provenance"],
    ["client/godot/assets/pets/example/runtime/idle.png", "client_runtime_assets"],
    ["client/godot/data/battle_actions.json", "client_product_source"],
    ["client/godot/scripts/main.gd", "client_product_source"],
    ["docs/phase_509_example.md", "release_documentation"],
    ["production_release_loop_plan.md", "release_documentation"],
    ["server/node/src/http-server.js", "server_product_and_ops"],
    ["start-backend.command", "server_product_and_ops"],
    ["server/node/test/auth.test.js", "server_tests_and_fixtures"],
    ["tools/audit_release_candidate.mjs", "release_and_qa_tooling"],
    ["tools/test/audit_release_candidate.test.mjs", "tool_tests"],
    ["unexpected/release.bin", "unclassified"],
  ]);
  for (const [repoPath, expected] of cases) {
    assert.equal(classifyCandidatePath(repoPath), expected, repoPath);
  }
});

test("transient state and sensitive filenames fail closed without rejecting source assets", () => {
  assert.equal(transientPathReason(".run/report.json"), "segment:.run");
  assert.equal(transientPathReason("client/godot/.godot/editor/layout.cfg"), "segment:.godot");
  assert.equal(transientPathReason("server/node/.local/server.pid"), "segment:.local");
  assert.equal(transientPathReason("tmp/probe.out"), "segment:tmp");
  assert.equal(transientPathReason("evidence/result.log"), "runtime_log");
  assert.equal(transientPathReason("assets/source/raw/creature.png"), "");
  assert.equal(sensitiveFilenameReason("server/node/.env"), "environment_file");
  assert.equal(sensitiveFilenameReason("release/signing.p12"), "private_material_extension");
  assert.equal(sensitiveFilenameReason("docs/.env.example"), "");
  assert.equal(sensitiveFilenameReason("assets/source/provenance.json"), "");
});

test("name-status parser preserves normal, rename and copy records", () => {
  const parsed = parseNameStatusZ(Buffer.from([
    "M", "docs/a.md",
    "A", "tools/new.mjs",
    "R100", "docs/old.md", "docs/new.md",
    "C090", "a.txt", "b.txt",
    "",
  ].join("\0")));
  assert.deepEqual(parsed, [
    {status: "M", oldPath: "", path: "docs/a.md"},
    {status: "A", oldPath: "", path: "tools/new.mjs"},
    {status: "R100", oldPath: "docs/old.md", path: "docs/new.md"},
    {status: "C090", oldPath: "a.txt", path: "b.txt"},
  ]);
  assert.throws(() => parseNameStatusZ(Buffer.from("R100\0only-one-path\0")), /truncated R100/);
});

test("secret scanning never emits matched values and separates obvious fixtures", () => {
  const demoValue = ["demo", "password"].join("-");
  const productionValue = ["production", "value", "randomized"].join("-");
  const bearerValue = ["test", "access", "token"].join("-");
  const assignment = (identifier, value) => ["const ", identifier, ' = "', value, '";'].join("");
  const source = [
    assignment(["DEFAULT", "PASSWORD"].join("_"), demoValue),
    assignment(["API", "SECRET"].join("_"), productionValue),
    assignment("header", ["Bearer", bearerValue].join(" ")),
  ].join("\n");
  const result = scanTextForSecrets("server/node/test/example.test.js", source);
  assert.equal(result.syntheticFixtures.length, 2);
  assert.equal(result.violations.length, 1);
  for (const finding of [...result.syntheticFixtures, ...result.violations]) {
    assert.deepEqual(
      Object.keys(finding).sort(),
      ["identifier", "line", "matchLength", "matchSha256", "path", "ruleId"]
        .filter((key) => key !== "identifier" || Object.hasOwn(finding, key))
        .sort(),
    );
    assert.match(finding.matchSha256, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(finding).includes("demo-password"), false);
    assert.equal(JSON.stringify(finding).includes("production-value"), false);
    assert.equal(JSON.stringify(finding).includes("test-access-token"), false);
  }
});

test("high-confidence token formats fail even inside tests", () => {
  const token = ["gh", "p_", "abcdefghijklmnopqrstuvwxyz", "1234567890"].join("");
  const source = `const token = "${token}";`;
  const result = scanTextForSecrets("tools/test/example.test.mjs", source);
  assert.equal(result.syntheticFixtures.length, 0);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].ruleId, "github_token");
  assert.equal(JSON.stringify(result).includes("ghp_"), false);
});

test("private absolute paths are redacted while bounded synthetic fixtures remain classified", () => {
  const realHome = ["", "Users", "alice", "projects", "private-game", "worktree"].join("/");
  const real = scanTextForPrivateAbsolutePaths(
    "docs/phase.md",
    `candidate root is ${realHome}`,
  );
  assert.equal(real.violations.length, 1);
  assert.equal(real.syntheticFixtures.length, 0);
  assert.equal(JSON.stringify(real).includes("alice"), false);

  const qaHome = ["", "Users", "qa", "Library", "Application Support", "BeastboundOdysseyQA"].join("/");
  const playerHome = ["", "home", "player", "save"].join("/");
  const qa = scanTextForPrivateAbsolutePaths(
    "tools/test/example.test.mjs",
    `lane=${qaHome} and home=${playerHome}`,
  );
  assert.equal(qa.violations.length, 0);
  assert.equal(qa.syntheticFixtures.length, 2);

  const exampleHome = ["", "Users", "example", ".codex", "tools", "remove_chroma_key.py"].join("/");
  const example = scanTextForPrivateAbsolutePaths(
    ".agents/skills/design-beastbound-maps/references/example.md",
    `python3 ${exampleHome}`,
  );
  assert.equal(example.violations.length, 0);
  assert.equal(example.syntheticFixtures.length, 1);
});
