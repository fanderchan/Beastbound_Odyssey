import assert from "node:assert/strict";
import test from "node:test";
import {
  godotCompileFailureDiagnostic,
  makeResult,
} from "../run_godot_auto_checks.mjs";

const check = Object.freeze({
  name: "godot-parse",
  flag: "",
  command: "godot",
  args: ["--headless", "--quit"],
});

test("Godot parse errors fail the runner even when the process exits zero", () => {
  const output = [
    "Godot Engine v4.7.stable",
    "SCRIPT ERROR: Parse Error: Cannot infer the type of a variable.",
    "ERROR: Failed to load script res://scripts/main.gd with error Compilation failed.",
  ].join("\n");
  const result = makeResult(check, 10, 0, "", output, false);
  assert.equal(result.ok, false);
  assert.equal(result.status, "compile_error");
  assert.match(result.compileDiagnostic, /Parse Error/);
});

test("dependent compile and failed script load diagnostics also fail an exit-zero run", () => {
  for (const diagnostic of [
    "SCRIPT ERROR: Compile Error: Failed to compile depended scripts.",
    "ERROR: Failed to load script res://scripts/main.gd with error Compilation failed.",
  ]) {
    const result = makeResult(check, 10, 0, "", `Godot Engine v4.7.stable\n${diagnostic}\n`, false);
    assert.equal(result.ok, false, diagnostic);
    assert.equal(result.status, "compile_error", diagnostic);
    assert.equal(result.compileDiagnostic, diagnostic);
  }
});

test("clean exit-zero parse output remains successful", () => {
  const output = "Godot Engine v4.7.stable\n";
  const result = makeResult(check, 10, 0, "", output, false);
  assert.equal(result.ok, true);
  assert.equal(result.status, "");
  assert.equal(godotCompileFailureDiagnostic(output), "");
});
