import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import test from "node:test";
import {HANDBOOKS, OUTPUTS, brokenLocalLinks, checkGuide, parseStatus, renderIndexes, repositoryFiles} from "../repository_guide.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-guide-"));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  execFileSync("git", ["init", "--quiet", root]);
  const write = (name, value) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true});
    fs.writeFileSync(path.join(root, name), value);
  };
  return {root, write};
}

test("inventory includes new source but excludes ignored files, deleted files and symlinks", (t) => {
  const {root, write} = fixture(t);
  write(".gitignore", "ignored/\n.run/\n");
  write("tools/new.mjs", "export const value = 1;\n");
  write("ignored/secret.js", "DO NOT READ\n");
  write(".run/probe.mjs", "generated\n");
  write("tools/removed.mjs", "removed\n");
  execFileSync("git", ["-C", root, "add", "tools/removed.mjs"]);
  fs.unlinkSync(path.join(root, "tools/removed.mjs"));
  fs.symlinkSync(path.join(root, "ignored/secret.js"), path.join(root, "tools/link.mjs"));
  assert.deepEqual(repositoryFiles(root), [".gitignore", "tools/new.mjs"]);
});

test("indexes are deterministic, count current source and retain duplicate historical phase numbers", (t) => {
  const {root, write} = fixture(t);
  write("client/godot/scripts/ui/panel.gd", "extends Control\n");
  write("tools/test/small.test.mjs", "// test\n");
  write("client/godot/data/example.json", "{}\n");
  write("docs/phase_125_first.md", "# 第一个记录\n");
  write("docs/phase_125_second.md", "# 第二个记录\n");
  write("docs/bak/legacy_phase_notes/phase_01_start.md", "# 初始记录\n");
  const first = renderIndexes(root);
  assert.deepEqual(first, renderIndexes(root));
  assert.match(first.get(OUTPUTS[0]), /\*\*2\*\* 个代码\/测试文件、\*\*1\*\* 个共享 JSON/);
  assert.match(first.get(OUTPUTS[0]), /tools\/test\/small.test.mjs/);
  assert.match(first.get(OUTPUTS[1]), /第一个记录/);
  assert.match(first.get(OUTPUTS[1]), /第二个记录/);
  assert.match(first.get(OUTPUTS[1]), /早期归档/);
  for (const [name, content] of first) write(name, content);
  assert.deepEqual(brokenLocalLinks(root, [OUTPUTS[1]]).filter((error) => !error.includes("project-status") && !error.includes("README")), []);
});

test("link validation resolves encoded names and ignores URLs, fragments and fenced examples", (t) => {
  const {root, write} = fixture(t);
  write("docs/有 空格.md", "# 文档\n");
  write("docs/guide.md", [
    "[existing](%E6%9C%89%20%E7%A9%BA%E6%A0%BC.md#section)",
    "[web](https://example.invalid/missing)", "[anchor](#heading)",
    "`[inline](missing.md)`", "```md", "[sample](missing.md)", "```",
    "~~~md", "[sample](also-missing.md)", "~~~", "",
  ].join("\n"));
  assert.deepEqual(brokenLocalLinks(root, ["docs/guide.md"]), []);
});

test("link validation reports broken paths, malformed escapes and repository escapes", (t) => {
  const {root, write} = fixture(t);
  write("docs/guide.md", "[broken](missing.md)\n[escape](../../outside.md)\n[encoding](bad%XY.md)\n");
  const errors = brokenLocalLinks(root, ["docs/guide.md", "docs/absent.md"]);
  assert.equal(errors.length, 4);
  assert.match(errors.join("\n"), /missing link/);
  assert.match(errors.join("\n"), /leaves repository/);
  assert.match(errors.join("\n"), /invalid encoded link/);
  assert.match(errors.join("\n"), /missing document/);
});

test("check detects renamed and newly added source without rewriting the index", (t) => {
  const {root, write} = fixture(t);
  for (const name of HANDBOOKS) write(name, "# Handbook\n");
  write("tools/before.mjs", "// before\n");
  for (const [name, content] of renderIndexes(root)) write(name, content);
  assert.deepEqual(checkGuide(root), []);
  const before = fs.readFileSync(path.join(root, OUTPUTS[0]), "utf8");
  fs.renameSync(path.join(root, "tools/before.mjs"), path.join(root, "tools/after.mjs"));
  const errors = checkGuide(root);
  assert.ok(errors.some((error) => error.includes("stale or missing")));
  assert.ok(errors.some((error) => error.includes("before.mjs")));
  assert.equal(fs.readFileSync(path.join(root, OUTPUTS[0]), "utf8"), before);
  for (const [name, content] of renderIndexes(root)) write(name, content);
  assert.deepEqual(checkGuide(root), []);
});

test("porcelain status treats renames as one change and preserves whitespace in paths", () => {
  assert.deepEqual(parseStatus(" M file with spaces.md\0R  new\nname.js\0old.js\0?? new-file.md\0"), [
    {status: " M", path: "file with spaces.md"},
    {status: "R ", path: "new\nname.js"},
    {status: "??", path: "new-file.md"},
  ]);
});
