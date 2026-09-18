#!/usr/bin/env node
// Repository navigation only: never starts the game, contacts a remote, or changes Git.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const OUTPUTS = ["docs/reference/code-index.md", "docs/reference/phase-index.md"];
export const HANDBOOKS = [
  "README.md", "AGENTS.md", "docs/README.md", "docs/project-status.md",
  "docs/architecture.md", "docs/development.md", "docs/testing.md",
  "docs/maintenance.md", "tools/README.md", "client/godot/README.md",
  "server/node/README.md", "client/godot/AGENTS.md", "server/node/AGENTS.md",
  "tasks.md", "release_plan.md", "quality_cleanup_plan.md",
  "design-qa.md", "docs/phase_543_repository_navigation_and_http_boundaries.md",
];

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 30000,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function regularFile(root, name) {
  try { return fs.lstatSync(path.join(root, name)).isFile(); }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

export function repositoryFiles(root) {
  return [...new Set(git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    .split("\0").filter(Boolean))].filter((name) => regularFile(root, name)).sort();
}

function isCode(name) {
  return /^(client\/godot\/scripts\/|server\/node\/(src|scripts|test|test-support)\/|tools\/)/.test(name)
    && /\.(gd|js|mjs|py)$/.test(name);
}

function lines(text) {
  return text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function cell(text) { return String(text).replaceAll("|", "\\|").replaceAll("\n", " "); }
function link(from, name, label = name) {
  const relative = path.posix.relative(path.posix.dirname(from), name);
  return `[${cell(label)}](${relative.split("/").map(encodeURIComponent).join("/")})`;
}

function groupFor(name) {
  if (name.startsWith("client/godot/scripts/")) return path.posix.dirname(name);
  if (name.startsWith("server/node/src/auth/")) return "server/node/src/auth";
  if (name.startsWith("server/node/")) return name.split("/").slice(0, 3).join("/");
  return /(^|\/)(test|tests)\//.test(name) || /\/test[_-]/.test(name) ? "tools/tests" : "tools";
}

export function renderIndexes(root, files = repositoryFiles(root)) {
  const code = files.filter(isCode).map((name) => ({name, lines: lines(fs.readFileSync(path.join(root, name), "utf8"))}));
  const data = files.filter((name) => /^client\/godot\/data\/.+\.json$/.test(name));
  const phases = files.filter((name) => /^docs\/(?:bak\/legacy_phase_notes\/)?phase_\d+_.+\.md$/.test(name))
    .map((name) => {
      const title = fs.readFileSync(path.join(root, name), "utf8").split("\n").find((line) => /^# /.test(line));
      return {name, number: Number(path.posix.basename(name).match(/^phase_(\d+)/)[1]), title: title?.slice(2).trim() || path.posix.basename(name)};
    }).sort((a, b) => a.number - b.number || a.name.localeCompare(b.name, "en"));
  const codePath = OUTPUTS[0];
  const codeLines = [
    "# 代码、数据与工具索引", "",
    "> 自动生成：`node tools/repository_guide.mjs refresh`。请修改源文件，不手改此页。", "",
    "只统计当前工作区 Git 可见的代码与共享 JSON（含未提交文件），排除忽略文件、缓存和美术制作档案。存在不代表已提交、已测试或已发布。", "",
    `共 **${code.length}** 个代码/测试文件、**${data.length}** 个共享 JSON。职责与修改路线见 [架构说明](../architecture.md)，阶段背景见 [阶段索引](phase-index.md)。`, "",
    "## 大文件定位", "",
    "行数用于定位阅读成本，不是质量评分。拆分候选与验证要求见 [维护清单](../maintenance.md)。", "",
    "| 行数 | 文件 |", "| ---: | --- |",
    ...[...code].sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name, "en")).slice(0, 15)
      .map((item) => `| ${item.lines} | ${link(codePath, item.name)} |`), "",
  ];
  const groups = Map.groupBy(code, (item) => groupFor(item.name));
  for (const [group, items] of [...groups].sort(([a], [b]) => a.localeCompare(b, "en"))) {
    codeLines.push(`## ${group}`, "", `<details><summary>${items.length} 个文件</summary>`, "",
      "| 文件 | 行数 |", "| --- | ---: |",
      ...items.map((item) => `| ${link(codePath, item.name, item.name.startsWith(`${group}/`) ? item.name.slice(group.length + 1) : item.name)} | ${item.lines} |`),
      "", "</details>", "");
  }
  codeLines.push("## 共享数据", "", "数值、地图和目录的 JSON 由双端消费；改变字段或 ID 前须查客户端与服务端读取方。", "",
    "<details><summary>全部共享 JSON</summary>", "", ...data.map((name) => `- ${link(codePath, name, name.slice("client/godot/data/".length))}`), "", "</details>", "");
  const phasePath = OUTPUTS[1];
  const phaseLines = [
    "# 阶段记录索引", "",
    "> 自动生成：`node tools/repository_guide.mjs refresh`。原始文件和历史路径保持不变。", "",
    `当前工作区可见 **${phases.length}** 份阶段记录。阶段编号表示历史顺序，不代表当前版本或发布状态；同号文件分别保留。`, "",
    "先看 [项目现状](../project-status.md) 和 [文档导航](../README.md)。这里按每 50 个编号分组；文件标题可用于页面搜索。", "",
  ];
  const phaseGroups = Map.groupBy(phases, (item) => Math.floor(item.number / 50));
  for (const [group, items] of [...phaseGroups].sort(([a], [b]) => b - a)) {
    phaseLines.push(`## Phase ${group * 50}–${group * 50 + 49}`, "",
      "| 编号 | 记录 | 位置 |", "| ---: | --- | --- |",
      ...[...items].reverse().map((item) => `| ${item.number} | ${link(phasePath, item.name, item.title)} | ${item.name.includes("/bak/") ? "早期归档" : "阶段记录"} |`), "");
  }
  return new Map([[codePath, codeLines.join("\n")], [phasePath, phaseLines.join("\n")]]);
}

// The handbooks use inline Markdown links. Check local file/directory targets;
// historical prose, external URLs, anchor semantics, and code blocks are out of scope.
export function brokenLocalLinks(root, documents) {
  const errors = [];
  for (const name of documents) {
    if (!regularFile(root, name)) { errors.push(`${name}: missing document`); continue; }
    const text = fs.readFileSync(path.join(root, name), "utf8")
      .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "").replace(/`[^`\n]*`/g, "");
    for (const match of text.matchAll(/\[[^\]\n]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g)) {
      const target = match[1] || match[2];
      if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
      let relative;
      try { relative = decodeURIComponent(target.split(/[?#]/)[0]); }
      catch { errors.push(`${name}: invalid encoded link ${target}`); continue; }
      if (!relative) continue;
      const resolved = path.resolve(root, path.dirname(name), relative);
      if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`) && resolved !== path.resolve(root)) {
        errors.push(`${name}: link leaves repository: ${target}`);
      } else if (!fs.existsSync(resolved)) errors.push(`${name}: missing link ${target}`);
    }
  }
  return errors;
}

export function checkGuide(root) {
  const errors = [];
  for (const [name, expected] of renderIndexes(root)) {
    if (!regularFile(root, name) || fs.readFileSync(path.join(root, name), "utf8") !== expected) {
      errors.push(`${name}: stale or missing; run node tools/repository_guide.mjs refresh`);
    }
  }
  return [...errors, ...brokenLocalLinks(root, [...HANDBOOKS, ...OUTPUTS])];
}

export function parseStatus(raw) {
  const records = raw.split("\0");
  const entries = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    entries.push({status: record.slice(0, 2), path: record.slice(3)});
    if (/[RC]/.test(record.slice(0, 2))) index += 1; // Rename/copy source follows its destination in -z output.
  }
  return entries;
}

export function worktreeStatus(root) {
  const records = git(root, ["worktree", "list", "--porcelain", "-z"]).split("\0");
  const directories = records.filter((record) => record.startsWith("worktree ")).map((record) => record.slice(9));
  return directories.map((directory) => {
    try {
      const changes = parseStatus(git(directory, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
      const planPath = path.join(directory, "production_release_loop_plan.md");
      const plan = fs.existsSync(planPath) ? fs.readFileSync(planPath, "utf8") : "";
      const runnerPath = path.join(directory, "tools/run_godot_auto_checks.mjs");
      const runner = fs.existsSync(runnerPath) ? fs.readFileSync(runnerPath, "utf8") : "";
      let upstream = null;
      try {
        const ref = git(directory, ["rev-parse", "--abbrev-ref", "@{upstream}"]).trim();
        const [ahead, behind] = git(directory, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]).trim().split(/\s+/).map(Number);
        upstream = {ref, ahead, behind};
      } catch { /* An unpublished worktree may have no upstream. */ }
      return {
        directory, branch: git(directory, ["branch", "--show-current"]).trim() || "(detached)",
        head: git(directory, ["rev-parse", "--short=10", "HEAD"]).trim(), upstream,
        changedTracked: changes.filter((item) => item.status !== "??").length,
        untracked: changes.filter((item) => item.status === "??").length,
        releaseCursor: plan.match(/^> 当前游标：(.+)$/m)?.[1] || null,
        isolatedParseOnly: /arg\s*===?\s*["']--parse-only["']/.test(runner),
      };
    } catch (error) { return {directory, error: error.code || "worktree_unavailable"}; }
  });
}

export function main(argv = process.argv.slice(2), root = ROOT) {
  const command = argv[0] || "help";
  if (command === "help" || command === "--help" || command === "-h") {
    console.log("Repository guide (Node.js 22+, no dependencies)\n\n  status   Read all local worktrees, plan cursors and runner capabilities\n  refresh  Regenerate code and phase indexes for this checkout\n  check    Check index freshness and handbook local links\n\nNo Git mutation, network access, game/server start or database access.");
  } else if (argv.length !== 1) {
    throw new Error("Pass exactly one command: status, refresh, check, or help.");
  } else if (command === "status") {
    const status = worktreeStatus(root);
    console.log(JSON.stringify({note: "Local references only; no fetch. Dirty files and plan cursors do not imply release approval.", worktrees: status}, null, 2));
    if (status.some((item) => item.error)) return 1;
  } else if (command === "refresh") {
    for (const [name, content] of renderIndexes(root)) {
      fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true});
      fs.writeFileSync(path.join(root, name), content);
      console.log(`Updated ${name}`);
    }
  } else if (command === "check") {
    const errors = checkGuide(root);
    if (errors.length) { errors.forEach((error) => console.error(error)); return 1; }
    console.log("PASS: repository indexes are current; handbook local link targets exist.");
  } else throw new Error(`Unknown command: ${command}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
