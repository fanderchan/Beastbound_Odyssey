#!/usr/bin/env node

import {createHash} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn, spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const DEFAULT_BASE_REF = "origin/main";
const DEFAULT_BRANCH = "codex/production-release-candidate";
const DEFAULT_REMOTE_URL = "git@github-fanderchan:fanderchan/Beastbound_Odyssey.git";
const DEFAULT_AUTHOR_NAME = "fanderchan";
const DEFAULT_AUTHOR_EMAIL = "cjc44020@126.com";
const DEFAULT_UPSTREAM_REF = `origin/${DEFAULT_BRANCH}`;
const DEFAULT_OUTPUT = ".run/release_candidate/r0_08/candidate-audit.json";
const FIREBUD_BUNDLE_ROOT = "client/godot/assets/maps/firebud_region_visual_v2";
const FIREBUD_MANIFEST = `${FIREBUD_BUNDLE_ROOT}/map-visual-bundle.json`;
const SYNTHETIC_EXAMPLE_HOME_PREFIX = ["", "Users", "example", ""].join("/");

const TEXT_EXTENSIONS = new Set([
  ".cfg",
  ".command",
  ".csv",
  ".gd",
  ".ini",
  ".js",
  ".json",
  ".jsonl",
  ".log",
  ".md",
  ".mjs",
  ".py",
  ".sh",
  ".sql",
  ".toml",
  ".ts",
  ".tsv",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const HIGH_CONFIDENCE_SECRET_RULES = Object.freeze([
  ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ["aws_access_key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["github_token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g],
  ["gitlab_token", /\bglpat-[A-Za-z0-9_-]{20,}\b/g],
  ["slack_token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ["stripe_live_key", /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g],
  ["google_api_key", /\bAIza[0-9A-Za-z_-]{30,}\b/g],
  ["credentialed_url", /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/gi],
]);

const ASSIGNMENT_SECRET_RULE = /(?:^|[^A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)[A-Za-z0-9_]*)\s*[:=]\s*["']([^"'\r\n]{8,})["']/gim;
const BEARER_SECRET_RULE = /\bBearer\s+([A-Za-z0-9._~+\/-]{8,}={0,2})\b/gi;
const SYNTHETIC_VALUE_MARKER = /(?:test|fixture|example|demo|dummy|fake|placeholder|qa|startup|password|token|session|(?:^|[-_])secret(?:[-_]|$))/i;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRepoPath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function isTestOrFixturePath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  return (
    /(^|\/)(?:test|tests|test-support)(\/|$)/.test(normalized)
    || /\.test\.[^.]+$/.test(normalized)
    || normalized.startsWith("tools/test/")
  );
}

function isQaFixturePath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  return isTestOrFixturePath(normalized) || normalized.includes("/scripts/qa/");
}

export function classifyCandidatePath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  if (normalized === "AGENTS.md" || normalized.startsWith(".agents/")) {
    return "repository_policy";
  }
  if (normalized.startsWith(`${FIREBUD_BUNDLE_ROOT}/evidence/`)) {
    return "immutable_asset_evidence";
  }
  if (normalized.startsWith("client/godot/assets/")) {
    if (normalized.includes("/source/")) return "asset_source_and_provenance";
    return "client_runtime_assets";
  }
  if (normalized.startsWith("client/godot/data/") || normalized.startsWith("client/godot/scripts/")) {
    return "client_product_source";
  }
  if (
    normalized.startsWith("docs/")
    || normalized === "production_release_loop_plan.md"
    || normalized === "stoneage_gap_plan.md"
  ) {
    return "release_documentation";
  }
  if (normalized.startsWith("server/node/test/") || normalized.startsWith("server/node/test-support/")) {
    return "server_tests_and_fixtures";
  }
  if (normalized.startsWith("server/node/src/") || normalized.startsWith("server/node/scripts/")) {
    return "server_product_and_ops";
  }
  if (normalized === "start-backend.command") {
    return "server_product_and_ops";
  }
  if (normalized.startsWith("tools/test/")) {
    return "tool_tests";
  }
  if (normalized.startsWith("tools/")) {
    return "release_and_qa_tooling";
  }
  return "unclassified";
}

export function transientPathReason(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  const lower = normalized.toLowerCase();
  const segments = lower.split("/");
  const transientSegments = new Set([
    ".cache",
    ".godot",
    ".local",
    ".run",
    "__pycache__",
    "coverage",
    "dist",
    "node_modules",
    "tmp",
  ]);
  const matchedSegment = segments.find((segment) => transientSegments.has(segment));
  if (matchedSegment) return `segment:${matchedSegment}`;
  if (segments.includes("screenshots") || segments.includes("reports")) {
    return "unbound_capture_directory";
  }
  if (lower.endsWith("/.ds_store") || lower === ".ds_store") return "macos_metadata";
  const transientSuffix = [
    ".bak",
    ".coverage",
    ".import",
    ".out",
    ".pid",
    ".pyc",
    ".pyo",
    ".sock",
    ".swo",
    ".swp",
    ".tap",
    ".tmp",
    ".trace",
    ".uid",
  ].find((suffix) => lower.endsWith(suffix));
  if (transientSuffix) return `suffix:${transientSuffix}`;
  if (lower.endsWith(".log")) return "runtime_log";
  if (/(?:^|\/)[^/]*report\.json$/.test(lower)) return "runtime_report";
  return "";
}

export function sensitiveFilenameReason(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  const lower = normalized.toLowerCase();
  const basename = path.posix.basename(lower);
  if (/^\.env(?:\..+)?$/.test(basename) && !/\.(?:example|sample|template)$/.test(basename)) {
    return "environment_file";
  }
  if (/(?:^|\/)(?:credentials?|secrets?)(?:[._-]|\/|$)/.test(lower)) {
    return "credential_filename";
  }
  if (/^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:\..+)?$/.test(basename)) {
    return "ssh_private_key_filename";
  }
  if (/\.(?:jks|key|keystore|mobileprovision|p12|pfx|pem)$/.test(basename)) {
    return "private_material_extension";
  }
  return "";
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function redactedFinding(ruleId, repoPath, text, index, matchedValue) {
  return {
    ruleId,
    path: normalizeRepoPath(repoPath),
    line: lineNumberAt(text, index),
    matchLength: Buffer.byteLength(matchedValue),
    matchSha256: sha256(matchedValue),
  };
}

function clearlySyntheticSecretValue(value) {
  const normalized = String(value || "");
  return (
    normalized.length <= 96
    && SYNTHETIC_VALUE_MARKER.test(normalized)
    && !/(?:^|[^A-Za-z0-9])prod(?:uction)?(?:[^A-Za-z0-9]|$)/i.test(normalized)
  );
}

export function scanTextForSecrets(repoPath, text) {
  const violations = [];
  const syntheticFixtures = [];
  for (const [ruleId, sourceRule] of HIGH_CONFIDENCE_SECRET_RULES) {
    const rule = new RegExp(sourceRule.source, sourceRule.flags);
    for (const match of text.matchAll(rule)) {
      violations.push(redactedFinding(ruleId, repoPath, text, match.index, match[0]));
    }
  }

  for (const match of text.matchAll(new RegExp(ASSIGNMENT_SECRET_RULE.source, ASSIGNMENT_SECRET_RULE.flags))) {
    const finding = redactedFinding("credential_assignment", repoPath, text, match.index, match[0]);
    finding.identifier = match[1];
    if (
      clearlySyntheticSecretValue(match[2])
      && (
        isTestOrFixturePath(repoPath)
        || normalizeRepoPath(repoPath) === "server/node/scripts/seed-demo-data.js"
        || normalizeRepoPath(repoPath) === "tools/run_godot_auto_checks.mjs"
      )
    ) {
      syntheticFixtures.push(finding);
    } else {
      violations.push(finding);
    }
  }

  for (const match of text.matchAll(new RegExp(BEARER_SECRET_RULE.source, BEARER_SECRET_RULE.flags))) {
    const finding = redactedFinding("bearer_credential", repoPath, text, match.index, match[0]);
    if (isQaFixturePath(repoPath) && clearlySyntheticSecretValue(match[1])) {
      syntheticFixtures.push(finding);
    } else {
      violations.push(finding);
    }
  }
  return {syntheticFixtures, violations};
}

function syntheticAbsolutePath(repoPath, matchText) {
  const normalizedPath = normalizeRepoPath(repoPath);
  const normalizedMatch = matchText.replaceAll("\\", "/");
  if (
    normalizedPath.startsWith(".agents/")
    && normalizedPath.includes("/references/")
    && normalizedMatch.startsWith(SYNTHETIC_EXAMPLE_HOME_PREFIX)
  ) {
    return true;
  }
  if (!isTestOrFixturePath(normalizedPath)) return false;
  return (
    /^\/(?:Users|home)\/(?:qa|player|test|runner|example)(?:\/|$)/i.test(normalizedMatch)
    || /^[A-Z]:\/Users\/(?:qa|player|test|runner|example)(?:\/|$)/i.test(normalizedMatch)
  );
}

export function scanTextForPrivateAbsolutePaths(repoPath, text) {
  const rules = [
    ["posix_user_home", /\/(?:Users|home)\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._ ()\u4e00-\u9fff-]+)+/g],
    ["windows_user_home", /[A-Z]:\\Users\\[A-Za-z0-9._-]+(?:\\[A-Za-z0-9._ ()\u4e00-\u9fff-]+)+/gi],
    ["macos_private_temp", /\/(?:private\/)?var\/folders\/[A-Za-z0-9._\/-]+/g],
  ];
  const violations = [];
  const syntheticFixtures = [];
  for (const [ruleId, sourceRule] of rules) {
    const rule = new RegExp(sourceRule.source, sourceRule.flags);
    for (const match of text.matchAll(rule)) {
      const finding = redactedFinding(ruleId, repoPath, text, match.index, match[0]);
      if (syntheticAbsolutePath(repoPath, match[0])) {
        syntheticFixtures.push(finding);
      } else {
        violations.push(finding);
      }
    }
  }
  return {syntheticFixtures, violations};
}

export function parseNameStatusZ(buffer) {
  const fields = buffer.toString("utf8").split("\0");
  if (fields.at(-1) === "") fields.pop();
  const records = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index];
    index += 1;
    if (!status) throw new Error("empty candidate diff status");
    if (/^[RC]/.test(status)) {
      if (index + 1 >= fields.length) throw new Error(`truncated ${status} candidate diff record`);
      records.push({status, oldPath: normalizeRepoPath(fields[index]), path: normalizeRepoPath(fields[index + 1])});
      index += 2;
    } else {
      if (index >= fields.length) throw new Error(`truncated ${status} candidate diff record`);
      records.push({status, oldPath: "", path: normalizeRepoPath(fields[index])});
      index += 1;
    }
  }
  return records;
}

function command(root, args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd: root,
    encoding: options.encoding === null ? null : "utf8",
    env: options.env || process.env,
    maxBuffer: options.maxBuffer || 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : String(result.stderr || "");
    throw new Error(`${args[0]} failed (${result.status}): ${stderr.trim().slice(0, 1000)}`);
  }
  return result.stdout;
}

function git(root, args, options = {}) {
  return command(root, ["git", ...args], options);
}

function gitText(root, args, options = {}) {
  return String(git(root, args, options)).trim();
}

function isTextPath(repoPath) {
  const basename = path.posix.basename(repoPath);
  return basename === "AGENTS.md" || TEXT_EXTENSIONS.has(path.posix.extname(basename).toLowerCase());
}

function parseLsTree(buffer) {
  const records = new Map();
  for (const raw of buffer.toString("utf8").split("\0")) {
    if (!raw) continue;
    const separator = raw.indexOf("\t");
    if (separator < 0) throw new Error("invalid git ls-tree record");
    const [mode, type, object] = raw.slice(0, separator).split(" ");
    const repoPath = normalizeRepoPath(raw.slice(separator + 1));
    records.set(repoPath, {mode, object, path: repoPath, type});
  }
  return records;
}

function collectCommitSet(root, baseCommit, headCommit) {
  const shas = gitText(root, ["rev-list", "--reverse", "--topo-order", `${baseCommit}..${headCommit}`])
    .split("\n")
    .filter(Boolean);
  const commits = shas.map((sha, index) => {
    const fields = git(root, [
      "show",
      "-s",
      "--format=%H%x00%P%x00%T%x00%an%x00%ae%x00%aI%x00%s",
      sha,
    ]).toString("utf8").replace(/\n$/, "").split("\0");
    if (fields.length !== 7) throw new Error(`unable to parse candidate commit ${index + 1}`);
    const [commitSha, parentsText, treeSha, authorName, authorEmail, authoredAt, subject] = fields;
    return {
      ordinal: index + 1,
      sha: commitSha,
      parentShas: parentsText.split(" ").filter(Boolean),
      treeSha,
      authorName,
      authorEmail,
      authoredAt,
      subject,
    };
  });
  return commits;
}

function collectHashedPathReferences(value, found = [], keyPath = []) {
  if (Array.isArray(value)) {
    for (const child of value) collectHashedPathReferences(child, found, keyPath);
    return found;
  }
  if (!value || typeof value !== "object") return found;
  if (typeof value.path === "string" && /^[0-9a-f]{64}$/i.test(String(value.sha256 || ""))) {
    found.push({
      path: normalizeRepoPath(value.path),
      sha256: String(value.sha256).toLowerCase(),
      referenceRole: keyPath.some((key) => /^superseded/i.test(key)) ? "historical_superseded" : "current",
    });
  }
  for (const [key, child] of Object.entries(value)) collectHashedPathReferences(child, found, [...keyPath, key]);
  return found;
}

function parseStructuredEvidence(repoPath, content) {
  const extension = path.posix.extname(repoPath).toLowerCase();
  if (extension === ".json") return [JSON.parse(content.toString("utf8"))];
  if (extension === ".jsonl") {
    return content.toString("utf8").split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
  }
  return [];
}

function verifyFirebudEvidenceClosure(readBlob) {
  const failures = [];
  const verified = new Map();
  const currentExpected = new Map();
  const historicalReferences = [];
  const visitedStructured = new Set();
  const queue = [{path: FIREBUD_MANIFEST, inheritedRole: "current"}];
  while (queue.length > 0) {
    const queued = queue.shift();
    const current = queued.path;
    const visitKey = `${current}:${queued.inheritedRole}`;
    if (visitedStructured.has(visitKey)) continue;
    visitedStructured.add(visitKey);
    let content;
    try {
      content = readBlob(current);
    } catch {
      failures.push({ruleId: "missing_evidence_document", path: current});
      continue;
    }
    let documents;
    try {
      documents = parseStructuredEvidence(current, content);
    } catch {
      failures.push({ruleId: "invalid_evidence_document", path: current});
      continue;
    }
    for (const document of documents) {
      for (const reference of collectHashedPathReferences(document)) {
        if (!reference.path.startsWith("evidence/")) continue;
        const resolved = path.posix.normalize(`${FIREBUD_BUNDLE_ROOT}/${reference.path}`);
        if (!resolved.startsWith(`${FIREBUD_BUNDLE_ROOT}/evidence/`)) {
          failures.push({ruleId: "evidence_path_escape", path: resolved});
          continue;
        }
        const role = (
          queued.inheritedRole === "historical_superseded"
          || reference.referenceRole === "historical_superseded"
        ) ? "historical_superseded" : "current";
        const prior = currentExpected.get(resolved);
        if (role === "current" && prior && prior !== reference.sha256) {
          failures.push({ruleId: "conflicting_evidence_digest", path: resolved});
          continue;
        }
        if (role === "current") currentExpected.set(resolved, reference.sha256);
        let referencedContent;
        try {
          referencedContent = readBlob(resolved);
        } catch {
          if (role === "current") failures.push({ruleId: "missing_evidence_file", path: resolved});
          else historicalReferences.push({path: resolved, sha256: reference.sha256, currentTreeMatch: false});
          continue;
        }
        const actualDigest = sha256(referencedContent);
        const currentTreeMatch = actualDigest === reference.sha256;
        if (role === "historical_superseded") {
          historicalReferences.push({path: resolved, sha256: reference.sha256, currentTreeMatch});
        }
        if (!currentTreeMatch) {
          if (role === "current") failures.push({ruleId: "evidence_digest_mismatch", path: resolved});
          continue;
        }
        verified.set(resolved, actualDigest);
        if ([".json", ".jsonl"].includes(path.posix.extname(resolved).toLowerCase())) {
          queue.push({path: resolved, inheritedRole: role});
        }
      }
    }
  }
  return {
    failures,
    historicalReferences: historicalReferences.sort((left, right) => (
      left.path.localeCompare(right.path) || left.sha256.localeCompare(right.sha256)
    )),
    referencedPaths: [...verified].sort(([left], [right]) => left.localeCompare(right)).map(([repoPath, digest]) => ({
      path: repoPath,
      sha256: digest,
    })),
  };
}

function summarizeCategories(records) {
  const buckets = new Map();
  for (const record of records) {
    const category = classifyCandidatePath(record.path || record.oldPath);
    const bucket = buckets.get(category) || [];
    bucket.push(record.path || record.oldPath);
    buckets.set(category, bucket);
  }
  return [...buckets]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, paths]) => ({category, count: paths.length, paths: paths.sort()}));
}

function streamSha256(child, label) {
  return new Promise((resolve, reject) => {
    const digest = createHash("sha256");
    let byteCount = 0;
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      byteCount += chunk.length;
      digest.update(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 16000) stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${label} failed (${code}): ${stderr.trim().slice(0, 1000)}`));
      } else {
        resolve({byteCount, sha256: digest.digest("hex")});
      }
    });
  });
}

async function archiveDigest(root, headCommit) {
  const child = spawn("git", ["archive", "--format=tar", headCommit], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return streamSha256(child, "git archive");
}

function waitForChild(child, label) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 16000) stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) reject(new Error(`${label} failed (${code}): ${stderr.trim().slice(0, 1000)}`));
      else resolve();
    });
  });
}

async function verifyReversePatchTree(root, baseCommit, headCommit) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-r0-08-index-"));
  const temporaryIndex = path.join(temporaryRoot, "candidate.index");
  const indexEnvironment = {...process.env, GIT_INDEX_FILE: temporaryIndex};
  try {
    git(root, ["read-tree", headCommit], {env: indexEnvironment});
    const diff = spawn("git", ["diff", "--binary", "--full-index", baseCommit, headCommit], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const apply = spawn("git", ["apply", "--cached", "--reverse", "--whitespace=nowarn", "-"], {
      cwd: root,
      env: indexEnvironment,
      stdio: ["pipe", "ignore", "pipe"],
    });
    diff.stdout.pipe(apply.stdin);
    await Promise.all([waitForChild(diff, "git diff rollback stream"), waitForChild(apply, "git apply rollback proof")]);
    const reconstructedTree = gitText(root, ["write-tree"], {env: indexEnvironment});
    const expectedTree = gitText(root, ["rev-parse", `${baseCommit}^{tree}`]);
    return {expectedTree, reconstructedTree, matches: reconstructedTree === expectedTree};
  } finally {
    fs.rmSync(temporaryRoot, {force: true, recursive: true});
  }
}

function parseProcessTable(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) return [];
    return [{pid: Number(match[1]), parentPid: Number(match[2]), command: match[3]}];
  });
}

function ancestorPids(processes, initialPid) {
  const parentByPid = new Map(processes.map((entry) => [entry.pid, entry.parentPid]));
  const ancestors = new Set([initialPid]);
  let cursor = initialPid;
  while (parentByPid.has(cursor)) {
    const parent = parentByPid.get(cursor);
    if (!parent || ancestors.has(parent)) break;
    ancestors.add(parent);
    cursor = parent;
  }
  return ancestors;
}

function executableKind(commandLine) {
  const first = String(commandLine || "").trim().split(/\s+/, 1)[0] || "";
  const basename = path.basename(first).toLowerCase();
  if (/^(?:node|npm|npx)(?:\.exe)?$/.test(basename)) return "node";
  if (/^(?:godot|godot4)(?:\.exe)?$/.test(basename)) return "godot";
  if (/^python(?:3(?:\.\d+)?)?(?:\.exe)?$/.test(basename)) return "python";
  return "";
}

function processCwd(pid) {
  if (process.platform === "linux") {
    try {
      return fs.realpathSync(`/proc/${pid}/cwd`);
    } catch {
      return "";
    }
  }
  if (process.platform === "darwin") {
    const result = spawnSync("/usr/sbin/lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    if (result.status !== 0) return "";
    const line = result.stdout.split(/\r?\n/).find((entry) => entry.startsWith("n"));
    return line ? line.slice(1) : "";
  }
  return "";
}

function inspectCandidateProcesses(root) {
  if (!['darwin', 'linux'].includes(process.platform)) {
    return {supported: false, orphanProcesses: []};
  }
  const output = command(root, ["ps", "-axo", "pid=,ppid=,command="]);
  const processes = parseProcessTable(output);
  const excluded = ancestorPids(processes, process.pid);
  const orphanProcesses = [];
  for (const entry of processes) {
    if (excluded.has(entry.pid)) continue;
    const kind = executableKind(entry.command);
    const commandReferencesRoot = entry.command.includes(root);
    if (!kind && !commandReferencesRoot) continue;
    const cwd = kind ? processCwd(entry.pid) : "";
    const cwdInRepository = cwd === root || cwd.startsWith(`${root}${path.sep}`);
    if (!commandReferencesRoot && !cwdInRepository) continue;
    orphanProcesses.push({
      pid: entry.pid,
      kind: kind || "repository_path_process",
      commandSha256: sha256(entry.command),
      cwdScope: cwdInRepository ? "candidate_repository" : "external_cwd_with_candidate_argument",
    });
  }
  return {supported: true, orphanProcesses};
}

function inspectQaLane(root, lane) {
  const helper = path.join(root, "tools/godot_qa_user_data_lane.py");
  const result = spawnSync("python3", [helper, "inspect-stale", "--lane", lane], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return {lane, inspectionOk: false, status: "inspection_failed"};
  }
  try {
    const parsed = JSON.parse(result.stdout);
    return {
      lane,
      inspectionOk: true,
      inspectionSha256: String(parsed.inspectionSha256 || ""),
      laneAbsent: parsed.laneAbsent === true,
      laneEntryCount: Number(parsed.laneEntryCount || 0),
      laneRootState: String(parsed.laneRootState || ""),
      runnerPid: Number(parsed.runnerPid || 0),
      runnerState: String(parsed.runnerState || ""),
      status: String(parsed.status || ""),
    };
  } catch {
    return {lane, inspectionOk: false, status: "invalid_inspection_output"};
  }
}

function inspectBackendPid(root) {
  const pidPath = path.join(root, "server/node/.local/server.pid");
  if (!fs.existsSync(pidPath)) return {pidFilePresent: false, pid: 0, pidAlive: false};
  let pid = 0;
  try {
    pid = Number(fs.readFileSync(pidPath, "utf8").trim());
  } catch {
    return {pidFilePresent: true, pid: 0, pidAlive: false, malformed: true};
  }
  let pidAlive = false;
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid, 0);
      pidAlive = true;
    } catch {
      pidAlive = false;
    }
  }
  return {pidFilePresent: true, pid: Number.isInteger(pid) ? pid : 0, pidAlive};
}

function parseArguments(argv) {
  const options = {
    allowUnpushed: false,
    authorEmail: DEFAULT_AUTHOR_EMAIL,
    authorName: DEFAULT_AUTHOR_NAME,
    baseRef: DEFAULT_BASE_REF,
    branch: DEFAULT_BRANCH,
    output: DEFAULT_OUTPUT,
    remoteUrl: DEFAULT_REMOTE_URL,
    upstreamRef: DEFAULT_UPSTREAM_REF,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--allow-unpushed") {
      options.allowUnpushed = true;
      continue;
    }
    const key = {
      "--author-email": "authorEmail",
      "--author-name": "authorName",
      "--base": "baseRef",
      "--branch": "branch",
      "--output": "output",
      "--remote-url": "remoteUrl",
      "--upstream": "upstreamRef",
    }[argument];
    if (!key) throw new Error(`unknown argument: ${argument}`);
    index += 1;
    if (index >= argv.length || argv[index].startsWith("--")) throw new Error(`${argument} requires a value`);
    options[key] = argv[index];
  }
  return options;
}

function writeReport(root, relativeOutput, report) {
  const normalizedOutput = normalizeRepoPath(relativeOutput);
  if (!(normalizedOutput === ".run" || normalizedOutput.startsWith(".run/"))) {
    throw new Error("audit output must remain under the ignored .run directory");
  }
  const outputPath = path.resolve(root, normalizedOutput);
  const expectedPrefix = `${path.resolve(root, ".run")}${path.sep}`;
  if (outputPath !== path.resolve(root, ".run") && !outputPath.startsWith(expectedPrefix)) {
    throw new Error("audit output escapes the ignored .run directory");
  }
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {mode: 0o600});
  fs.renameSync(temporaryPath, outputPath);
  return outputPath;
}

function reproductionCommands(report) {
  const {baseCommit, headCommit} = report.repository;
  return [
    "git fetch --prune origin",
    "node tools/audit_release_candidate.mjs --base origin/main --output .run/release_candidate/r0_08/candidate-audit.json",
    `git worktree add --detach <fresh-worktree> ${headCommit}`,
    `git -C <fresh-worktree> diff --check ${baseCommit}...${headCommit}`,
    "(cd <fresh-worktree> && node --test tools/test/audit_release_candidate.test.mjs tools/test/run_godot_auto_checks.test.mjs)",
    "(cd <fresh-worktree> && python3 tools/godot_qa_user_data_lane.py source-check)",
    "(cd <fresh-worktree> && node tools/run_godot_auto_checks.mjs --parse-only --output-dir .run/godot_auto_checks/r0_08_parse)",
  ];
}

function rollbackCommands(report) {
  const {baseCommit, headCommit} = report.repository;
  return [
    `git switch -c codex/revert-${headCommit.slice(0, 12)} ${headCommit}`,
    `git diff --binary --full-index ${baseCommit} ${headCommit} > .run/release_candidate/r0_08/reverse.patch`,
    "git apply --reverse --index .run/release_candidate/r0_08/reverse.patch",
    `git diff --cached --check ${baseCommit}`,
    `test \"$(git write-tree)\" = \"$(git rev-parse ${baseCommit}^{tree})\"`,
    `git commit -m \"revert(release): return candidate ${headCommit.slice(0, 12)} to baseline ${baseCommit.slice(0, 12)}\"`,
  ];
}

export async function auditReleaseCandidate(options) {
  const root = gitText(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const errors = [];
  const headCommit = gitText(root, ["rev-parse", "HEAD"]);
  const baseCommit = gitText(root, ["rev-parse", options.baseRef]);
  const branch = gitText(root, ["branch", "--show-current"]);
  const upstreamRef = gitText(root, ["rev-parse", "--abbrev-ref", "@{upstream}"]);
  const upstreamCommit = gitText(root, ["rev-parse", "@{upstream}"]);
  const originUrl = gitText(root, ["remote", "get-url", "origin"]);
  const authorName = gitText(root, ["config", "user.name"]);
  const authorEmail = gitText(root, ["config", "user.email"]);
  const worktreeStatus = gitText(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const [baseOnly, candidateOnly] = gitText(root, ["rev-list", "--left-right", "--count", `${baseCommit}...${headCommit}`])
    .split(/\s+/)
    .map(Number);
  const [upstreamOnly, localOnly] = gitText(root, ["rev-list", "--left-right", "--count", `${upstreamCommit}...${headCommit}`])
    .split(/\s+/)
    .map(Number);
  const mergeBase = gitText(root, ["merge-base", baseCommit, headCommit]);

  if (branch !== options.branch) errors.push(`branch_mismatch:${branch || "detached"}`);
  if (upstreamRef !== options.upstreamRef) errors.push(`upstream_mismatch:${upstreamRef}`);
  if (originUrl !== options.remoteUrl) errors.push("origin_url_mismatch");
  if (authorName !== options.authorName || authorEmail !== options.authorEmail) errors.push("git_identity_mismatch");
  if (worktreeStatus) errors.push("worktree_not_clean");
  if (baseOnly !== 0 || mergeBase !== baseCommit) errors.push("candidate_not_based_on_current_base");
  if (upstreamOnly !== 0) errors.push("candidate_diverged_from_upstream");
  if (!options.allowUnpushed && localOnly !== 0) errors.push("candidate_not_pushed");

  const commits = collectCommitSet(root, baseCommit, headCommit);
  let expectedParent = baseCommit;
  for (const commit of commits) {
    if (commit.parentShas.length !== 1 || commit.parentShas[0] !== expectedParent) {
      errors.push(`non_linear_commit:${commit.sha}`);
    }
    if (commit.authorName !== options.authorName || commit.authorEmail !== options.authorEmail) {
      errors.push(`candidate_commit_identity_mismatch:${commit.sha}`);
    }
    expectedParent = commit.sha;
  }
  if (commits.length !== candidateOnly) errors.push("candidate_commit_count_mismatch");

  const diffRecords = parseNameStatusZ(git(root, ["diff", "--name-status", "-z", `${baseCommit}...${headCommit}`], {encoding: null}));
  const tree = parseLsTree(git(root, ["ls-tree", "-r", "-z", headCommit], {encoding: null}));
  const readBlob = (repoPath) => git(root, ["show", `${headCommit}:${repoPath}`], {encoding: null, maxBuffer: 512 * 1024 * 1024});
  const evidenceClosure = verifyFirebudEvidenceClosure(readBlob);
  errors.push(...evidenceClosure.failures.map((failure) => `${failure.ruleId}:${failure.path}`));
  const evidencePaths = new Set(evidenceClosure.referencedPaths.map((entry) => entry.path));

  const unclassifiedPaths = [];
  const modeViolations = [];
  const transientViolations = [];
  const sensitiveFilenameViolations = [];
  const secretViolations = [];
  const syntheticSecretFixtures = [];
  const privatePathViolations = [];
  const syntheticAbsolutePathFixtures = [];
  let scannedTextPathCount = 0;
  let skippedNonTextPathCount = 0;

  for (const record of diffRecords) {
    const repoPath = record.path || record.oldPath;
    const category = classifyCandidatePath(repoPath);
    if (category === "unclassified") unclassifiedPaths.push(repoPath);
    const treeEntry = tree.get(repoPath);
    if (!record.status.startsWith("D")) {
      if (!treeEntry) {
        modeViolations.push({path: repoPath, reason: "missing_final_tree_entry"});
      } else if (treeEntry.type !== "blob" || !["100644", "100755"].includes(treeEntry.mode)) {
        modeViolations.push({path: repoPath, reason: `unsupported_${treeEntry.mode}_${treeEntry.type}`});
      }
    }
    const transientReason = transientPathReason(repoPath);
    if (transientReason && !(category === "immutable_asset_evidence" && evidencePaths.has(repoPath))) {
      transientViolations.push({path: repoPath, reason: transientReason});
    }
    if (category === "immutable_asset_evidence" && !evidencePaths.has(repoPath)) {
      transientViolations.push({path: repoPath, reason: "unbound_asset_evidence"});
    }
    const sensitiveReason = sensitiveFilenameReason(repoPath);
    if (sensitiveReason) sensitiveFilenameViolations.push({path: repoPath, reason: sensitiveReason});
    if (record.status.startsWith("D") || !isTextPath(repoPath)) {
      skippedNonTextPathCount += 1;
      continue;
    }
    scannedTextPathCount += 1;
    const text = readBlob(repoPath).toString("utf8");
    const secretScan = scanTextForSecrets(repoPath, text);
    secretViolations.push(...secretScan.violations);
    syntheticSecretFixtures.push(...secretScan.syntheticFixtures);
    const privatePathScan = scanTextForPrivateAbsolutePaths(repoPath, text);
    privatePathViolations.push(...privatePathScan.violations);
    syntheticAbsolutePathFixtures.push(...privatePathScan.syntheticFixtures);
  }

  if (unclassifiedPaths.length > 0) errors.push("unclassified_candidate_paths");
  if (modeViolations.length > 0) errors.push("candidate_mode_violations");
  if (transientViolations.length > 0) errors.push("transient_candidate_paths");
  if (sensitiveFilenameViolations.length > 0) errors.push("sensitive_candidate_filenames");
  if (secretViolations.length > 0) errors.push("candidate_secret_findings");
  if (privatePathViolations.length > 0) errors.push("candidate_private_absolute_paths");

  const archiveFirst = await archiveDigest(root, headCommit);
  const archiveSecond = await archiveDigest(root, headCommit);
  const archiveDeterministic = (
    archiveFirst.sha256 === archiveSecond.sha256
    && archiveFirst.byteCount === archiveSecond.byteCount
  );
  if (!archiveDeterministic) errors.push("source_archive_not_deterministic");

  const rollbackProof = await verifyReversePatchTree(root, baseCommit, headCommit);
  if (!rollbackProof.matches) errors.push("reverse_patch_tree_mismatch");

  const qaLanes = ["automation", "client2"].map((lane) => inspectQaLane(root, lane));
  if (qaLanes.some((lane) => !lane.inspectionOk || !lane.laneAbsent || lane.runnerPid !== 0 || lane.status !== "absent")) {
    errors.push("qa_lane_not_closed");
  }
  const backendPid = inspectBackendPid(root);
  if (backendPid.pidFilePresent) errors.push("candidate_backend_pid_file_present");
  const processInspection = inspectCandidateProcesses(root);
  if (!processInspection.supported) errors.push("candidate_process_inspection_unsupported");
  if (processInspection.orphanProcesses.length > 0) errors.push("candidate_orphan_processes");

  const report = {
    schemaVersion: 1,
    taskId: "R0.08",
    status: errors.length === 0 ? "passed" : "failed",
    generatedAtUtc: new Date().toISOString(),
    repository: {
      rootScope: "current_git_worktree",
      branch,
      expectedBranch: options.branch,
      baseRef: options.baseRef,
      baseCommit,
      headCommit,
      mergeBase,
      behindBase: baseOnly,
      aheadBase: candidateOnly,
      upstreamRef,
      expectedUpstreamRef: options.upstreamRef,
      upstreamCommit,
      upstreamBehind: upstreamOnly,
      unpushedCommits: localOnly,
      allowUnpushed: options.allowUnpushed,
      originTransport: originUrl === options.remoteUrl ? "expected_ssh" : "unexpected",
      configuredIdentity: {name: authorName, email: authorEmail},
      worktreeClean: worktreeStatus === "",
      headTree: gitText(root, ["rev-parse", `${headCommit}^{tree}`]),
    },
    candidate: {
      commitCount: commits.length,
      commits,
      changedPathCount: diffRecords.length,
      changedPaths: diffRecords,
      categories: summarizeCategories(diffRecords),
      unclassifiedPaths,
      modeViolations,
    },
    hygiene: {
      transientState: {status: transientViolations.length === 0 ? "passed" : "failed", violations: transientViolations},
      sensitiveFilenames: {status: sensitiveFilenameViolations.length === 0 ? "passed" : "failed", violations: sensitiveFilenameViolations},
      secretScan: {
        status: secretViolations.length === 0 ? "passed" : "failed",
        scannedTextPathCount,
        skippedNonTextPathCount,
        syntheticFixtureFindingCount: syntheticSecretFixtures.length,
        syntheticFixtures: syntheticSecretFixtures,
        violations: secretViolations,
        disclosurePolicy: "rule, path, line, length and SHA-256 only; matched values are never emitted",
      },
      privateAbsolutePathScan: {
        status: privatePathViolations.length === 0 ? "passed" : "failed",
        syntheticFixtureFindingCount: syntheticAbsolutePathFixtures.length,
        syntheticFixtures: syntheticAbsolutePathFixtures,
        violations: privatePathViolations,
        disclosurePolicy: "rule, path, line, length and SHA-256 only; matched paths are never emitted",
      },
      immutableAssetEvidence: {
        status: evidenceClosure.failures.length === 0 ? "passed" : "failed",
        manifest: FIREBUD_MANIFEST,
        historicalSupersededReferenceCount: evidenceClosure.historicalReferences.length,
        historicalSupersededReferences: evidenceClosure.historicalReferences,
        referencedPathCount: evidenceClosure.referencedPaths.length,
        referencedPaths: evidenceClosure.referencedPaths,
        failures: evidenceClosure.failures,
      },
      runtimeClosure: {
        status: (
          qaLanes.every((lane) => lane.inspectionOk && lane.laneAbsent && lane.runnerPid === 0 && lane.status === "absent")
          && !backendPid.pidFilePresent
          && processInspection.supported
          && processInspection.orphanProcesses.length === 0
        ) ? "passed" : "failed",
        qaLanes,
        backendPid,
        processInspection,
      },
    },
    reproducibility: {
      status: archiveDeterministic ? "passed" : "failed",
      archiveFormat: "git archive --format=tar",
      archiveRuns: [archiveFirst, archiveSecond],
      deterministic: archiveDeterministic,
      commands: [],
    },
    rollback: {
      status: rollbackProof.matches ? "passed" : "failed",
      method: "isolated temporary index plus reverse full-index binary patch",
      ...rollbackProof,
      commands: [],
    },
    errors,
  };
  report.reproducibility.commands = reproductionCommands(report);
  report.rollback.commands = rollbackCommands(report);
  return {report, root};
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
    const {report, root} = await auditReleaseCandidate(options);
    const outputPath = writeReport(root, options.output, report);
    console.log(JSON.stringify({
      taskId: report.taskId,
      status: report.status,
      head: report.repository.headCommit,
      commits: report.candidate.commitCount,
      changedPaths: report.candidate.changedPathCount,
      archiveSha256: report.reproducibility.archiveRuns[0].sha256,
      rollbackTreeMatches: report.rollback.matches,
      errors: report.errors,
      output: normalizeRepoPath(path.relative(root, outputPath)),
    }, null, 2));
    process.exitCode = report.status === "passed" ? 0 : 1;
  } catch (error) {
    console.error(`R0.08 candidate audit failed closed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

const modulePath = fs.realpathSync(fileURLToPath(import.meta.url));
const invokedArgument = process.argv[1] ? path.resolve(process.argv[1]) : "";
const invokedPath = invokedArgument && fs.existsSync(invokedArgument) ? fs.realpathSync(invokedArgument) : "";
if (modulePath === invokedPath) {
  await main();
}
