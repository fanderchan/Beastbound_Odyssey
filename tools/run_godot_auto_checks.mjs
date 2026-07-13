#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {spawn, spawnSync} from "node:child_process";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const {
  CLIENT_PROTOCOL_HEADER,
  CLIENT_VERSION_HEADER,
  PROTOCOL_VERSION,
  SERVER_VERSION,
} = require("../server/node/src/protocol.js");
const MAIN_GD = path.join(REPO_ROOT, "client/godot/scripts/main.gd");
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, ".run/godot_auto_checks");
const DEFAULT_GODOT = process.env.GODOT_BIN || "godot";
const DEFAULT_AUTH_SERVER_URL = process.env.BEASTBOUND_AUTH_SERVER_URL || "http://127.0.0.1:8787";
const DEFAULT_CHECK_TIMEOUT_MS = Number(process.env.BEASTBOUND_GODOT_CHECK_TIMEOUT_MS || 180000);
const SCENE_PATH = "res://scenes/Main.tscn";
const DEFAULT_QUIT_AFTER = 2600;
const PARSE_CHECK_NAME = "godot-parse";

const QUIT_AFTER_OVERRIDES = new Map(Object.entries({
  "--auto-auth-server-client-check": 9000,
  "--auto-auth-server-live-check": 9000,
  "--auto-server-profile-sync-check": 12000,
  "--auto-server-auth-contract-check": 5000,
  "--auto-server-profile-contract-check": 5000,
  "--auto-server-mail-live-check": 9000,
  "--auto-server-battle-return-check": 5000,
  "--auto-server-battle-leave-ui-live-check": 15000,
  "--auto-server-battle-pet-command-live-check": 15000,
  "--auto-server-party-pve-sync-live-check": 15000,
  "--auto-battle-item-check": 5000,
  "--auto-battle-item-count-check": 5000,
  "--auto-battle-settings-check": 5000,
  "--auto-training-partner-check": 5000,
}));

function usage() {
  return [
    "Usage: node tools/run_godot_auto_checks.mjs [options]",
    "",
    "Options:",
    "  --list                 Print discovered --auto-*-check flags and exit.",
    "  --only <flags>         Run a comma-separated flag list.",
    "  --exclude <flags>      Skip a comma-separated flag list.",
    "  --from <flag>          Start from a discovered flag.",
    "  --max <count>          Run at most count checks after filters.",
    "  --fail-fast           Stop after the first failed check.",
    "  --no-parse            Skip the base godot --headless --quit parse check.",
    "  --output-dir <dir>     Override summary/log output directory.",
    "  --godot <path>         Override Godot binary path.",
    "  --auth-server-url <url> Override local auth server URL for startup login.",
    "  --timeout-ms <ms>      Per-check process timeout.",
    "  --help                 Show this help.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    list: false,
    only: [],
    exclude: new Set(),
    from: "",
    max: 0,
    failFast: false,
    includeParse: true,
    outputDir: DEFAULT_OUTPUT_DIR,
    godot: DEFAULT_GODOT,
    authServerUrl: DEFAULT_AUTH_SERVER_URL,
    startupUsername: `startup${Date.now() % 100000000}`,
    startupPassword: "test1234",
    timeoutMs: DEFAULT_CHECK_TIMEOUT_MS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--list") {
      options.list = true;
    } else if (arg === "--only") {
      options.only = splitFlags(argv[index + 1] || "");
      index += 1;
    } else if (arg.startsWith("--only=")) {
      options.only = splitFlags(arg.slice("--only=".length));
    } else if (arg === "--exclude") {
      options.exclude = new Set(splitFlags(argv[index + 1] || ""));
      index += 1;
    } else if (arg.startsWith("--exclude=")) {
      options.exclude = new Set(splitFlags(arg.slice("--exclude=".length)));
    } else if (arg === "--from") {
      options.from = String(argv[index + 1] || "");
      index += 1;
    } else if (arg.startsWith("--from=")) {
      options.from = arg.slice("--from=".length);
    } else if (arg === "--max") {
      options.max = Math.max(0, Number.parseInt(argv[index + 1] || "0", 10));
      index += 1;
    } else if (arg.startsWith("--max=")) {
      options.max = Math.max(0, Number.parseInt(arg.slice("--max=".length), 10));
    } else if (arg === "--fail-fast") {
      options.failFast = true;
    } else if (arg === "--no-parse") {
      options.includeParse = false;
    } else if (arg === "--output-dir") {
      options.outputDir = path.resolve(REPO_ROOT, argv[index + 1] || "");
      index += 1;
    } else if (arg.startsWith("--output-dir=")) {
      options.outputDir = path.resolve(REPO_ROOT, arg.slice("--output-dir=".length));
    } else if (arg === "--godot") {
      options.godot = argv[index + 1] || DEFAULT_GODOT;
      index += 1;
    } else if (arg.startsWith("--godot=")) {
      options.godot = arg.slice("--godot=".length);
    } else if (arg === "--auth-server-url") {
      options.authServerUrl = argv[index + 1] || DEFAULT_AUTH_SERVER_URL;
      index += 1;
    } else if (arg.startsWith("--auth-server-url=")) {
      options.authServerUrl = arg.slice("--auth-server-url=".length);
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Math.max(1000, Number.parseInt(argv[index + 1] || "0", 10));
      index += 1;
    } else if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Math.max(1000, Number.parseInt(arg.slice("--timeout-ms=".length), 10));
    } else {
      throw new Error(`Unknown option: ${arg}\n${usage()}`);
    }
  }
  return options;
}

function splitFlags(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function discoverAutoCheckFlags() {
  const source = fs.readFileSync(MAIN_GD, "utf8");
  const flags = [];
  const seen = new Set();
  const pattern = /arg == "(--auto-[^"]+-check)"/g;
  for (const match of source.matchAll(pattern)) {
    const flag = match[1];
    if (!seen.has(flag)) {
      seen.add(flag);
      flags.push(flag);
    }
  }
  if (flags.length === 0) {
    throw new Error(`No --auto-*-check flags discovered in ${MAIN_GD}`);
  }
  return flags;
}

function filterFlags(allFlags, options) {
  let flags = options.only.length > 0 ? options.only.slice() : allFlags.slice();
  const known = new Set(allFlags);
  const unknown = flags.filter((flag) => !known.has(flag));
  if (unknown.length > 0) {
    throw new Error(`Unknown --only flag(s): ${unknown.join(", ")}`);
  }
  if (options.from) {
    const fromIndex = flags.indexOf(options.from);
    if (fromIndex < 0) {
      throw new Error(`--from flag is not in the selected list: ${options.from}`);
    }
    flags = flags.slice(fromIndex);
  }
  if (options.exclude.size > 0) {
    for (const flag of options.exclude) {
      if (!known.has(flag)) {
        throw new Error(`Unknown --exclude flag: ${flag}`);
      }
    }
    flags = flags.filter((flag) => !options.exclude.has(flag));
  }
  if (options.max > 0) {
    flags = flags.slice(0, options.max);
  }
  return flags;
}

function inferQuitAfter(flag) {
  if (QUIT_AFTER_OVERRIDES.has(flag)) {
    return QUIT_AFTER_OVERRIDES.get(flag);
  }
  if (flag.includes("live-check")) {
    return 12000;
  }
  if (flag.includes("server-battle") || flag.includes("server-event") || flag.includes("server-click") || flag.includes("server-movement")) {
    return 9000;
  }
  if (flag.includes("battle-") || flag.includes("pet-") || flag.includes("equipment-")) {
    return 3600;
  }
  return DEFAULT_QUIT_AFTER;
}

function buildCheck(flag, index, total, options) {
  if (flag === PARSE_CHECK_NAME) {
    return {
      index,
      total,
      name: PARSE_CHECK_NAME,
      flag: "",
      command: options.godot,
      args: ["--headless", "--path", "client/godot", "--quit"],
    };
  }
  const quitAfter = inferQuitAfter(flag);
  return {
    index,
    total,
    name: flag,
    flag,
    quitAfter,
    command: options.godot,
    args: [
      "--headless",
      "--path",
      "client/godot",
      "--scene",
      SCENE_PATH,
      "--quit-after",
      String(quitAfter),
      "--",
      flag,
      ...extraUserArgsForFlag(flag, options),
    ],
  };
}

function extraUserArgsForFlag(flag, options) {
  if (flag !== "--auto-startup-login-check") {
    return [];
  }
  return [
    "--login-username",
    options.startupUsername,
    "--login-password",
    options.startupPassword,
    "--server-url",
    options.authServerUrl,
  ];
}

async function prepareCheck(check, options, logStream) {
  if (check.flag !== "--auto-startup-login-check") {
    return;
  }
  logStream.write(`startup_login_prepare username=${options.startupUsername} base_url=${options.authServerUrl}\n`);
  await ensureStartupLoginAccount(options.authServerUrl, options.startupUsername, options.startupPassword);
}

async function ensureStartupLoginAccount(baseUrl, username, password) {
  const register = await postAuthJson(baseUrl, "/auth/register", {
    username,
    password,
    displayName: `启动登录${username.slice(-4)}`,
  });
  if (register.ok) {
    return;
  }
  if (register.code !== "username_taken") {
    throw new Error(`startup login account register failed: code=${register.code || "unknown"} message=${register.message || ""}`);
  }
  const login = await postAuthJson(baseUrl, "/auth/login", {username, password});
  if (!login.ok) {
    throw new Error(`startup login account login failed: code=${login.code || "unknown"} message=${login.message || ""}`);
  }
}

async function postAuthJson(baseUrl, routePath, body) {
  const response = await fetch(`${String(baseUrl).replace(/\/+$/, "")}${routePath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [CLIENT_VERSION_HEADER]: SERVER_VERSION,
      [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return {
    httpStatus: response.status,
    ...payload,
  };
}

function runCheck(check, options, logStream) {
  return new Promise((resolve) => {
    const startMs = Date.now();
    const prefix = `[${check.index}/${check.total}] ${check.name}`;
    console.log(`${prefix} ...`);
    logStream.write(`\n===== ${prefix} =====\n`);
    logStream.write(`$ ${check.command} ${check.args.join(" ")}\n`);
    const child = spawn(check.command, check.args, {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, options.timeoutMs);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      logStream.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString("utf8");
      logStream.write(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      const elapsedMs = Date.now() - startMs;
      const result = makeResult(check, elapsedMs, null, error.message, output, timedOut);
      console.log(`${prefix} failed (${elapsedMs}ms) ${error.message}`);
      resolve(result);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const elapsedMs = Date.now() - startMs;
      const result = makeResult(check, elapsedMs, code, signal || "", output, timedOut);
      const suffix = result.ok ? "ok" : `failed code=${result.exitCode} status=${result.status || "unknown"}`;
      console.log(`${prefix} ${suffix} (${elapsedMs}ms)`);
      resolve(result);
    });
  });
}

function makeResult(check, elapsedMs, exitCode, signalOrError, output, timedOut) {
  const compileDiagnostic = godotCompileFailureDiagnostic(output);
  const statusLine = output
    .split(/\r?\n/)
    .filter((line) => line.includes("status="))
    .at(-1) || "";
  const statusMatch = statusLine.match(/\bstatus=([^\s]+)/);
  const status = compileDiagnostic !== "" ? "compile_error" : (statusMatch ? statusMatch[1] : "");
  const ok = !timedOut
    && exitCode === 0
    && compileDiagnostic === ""
    && (status === "" || status === "ok");
  return {
    name: check.name,
    flag: check.flag,
    command: [check.command, ...check.args].join(" "),
    quitAfter: check.quitAfter || 0,
    ok,
    status,
    statusLine,
    compileDiagnostic,
    exitCode,
    signalOrError,
    timedOut,
    elapsedMs,
  };
}

function godotCompileFailureDiagnostic(output) {
  const lines = String(output || "").split(/\r?\n/);
  return lines.find((line) => (
    /SCRIPT ERROR:\s*(Parse Error|Compile Error):/i.test(line)
    || /Failed to compile depended scripts/i.test(line)
    || /Failed to load script .*Compilation failed/i.test(line)
  )) || "";
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function gitSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function printSummary(results, logPath, summaryPath, startedAt, endedAt) {
  const passed = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);
  const elapsedMs = Date.parse(endedAt) - Date.parse(startedAt);
  console.log("");
  console.log("Godot auto-check summary");
  console.log(`passed=${passed.length} failed=${failed.length} total=${results.length} elapsed_ms=${elapsedMs}`);
  console.log(`log=${path.relative(REPO_ROOT, logPath)}`);
  console.log(`summary=${path.relative(REPO_ROOT, summaryPath)}`);
  console.log("");
  const rows = results.map((result) => {
    const mark = result.ok ? "ok" : "FAIL";
    const status = result.status || (result.ok ? "exit0" : "unknown");
    return `${mark.padEnd(4)} ${String(result.elapsedMs).padStart(7)}ms ${result.name} ${status}`;
  });
  console.log(rows.join("\n"));
  if (failed.length > 0) {
    console.log("");
    console.log("Failed checks:");
    for (const result of failed) {
      console.log(`- ${result.name}: exit=${result.exitCode} status=${result.status || "unknown"} line=${result.statusLine || "(no status line)"}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const allFlags = discoverAutoCheckFlags();
  if (options.list) {
    for (const flag of allFlags) {
      console.log(`${flag} quit_after=${inferQuitAfter(flag)}`);
    }
    return;
  }
  const selectedFlags = filterFlags(allFlags, options);
  const names = options.includeParse ? [PARSE_CHECK_NAME, ...selectedFlags] : selectedFlags;
  fs.mkdirSync(options.outputDir, {recursive: true});
  const stamp = nowStamp();
  const logPath = path.join(options.outputDir, `${stamp}.log`);
  const summaryPath = path.join(options.outputDir, `${stamp}_summary.json`);
  const startedAt = new Date().toISOString();
  const logStream = fs.createWriteStream(logPath, {encoding: "utf8"});
  logStream.write(`Beastbound Godot auto checks\n`);
  logStream.write(`started_at=${startedAt}\n`);
  logStream.write(`git_sha=${gitSha()}\n`);
  logStream.write(`count=${names.length}\n`);
  const results = [];
  try {
    for (let index = 0; index < names.length; index += 1) {
      const check = buildCheck(names[index], index + 1, names.length, options);
      await prepareCheck(check, options, logStream);
      const result = await runCheck(check, options, logStream);
      results.push(result);
      if (!result.ok && options.failFast) {
        break;
      }
    }
  } finally {
    await new Promise((resolve) => logStream.end(resolve));
  }
  const endedAt = new Date().toISOString();
  const summary = {
    startedAt,
    endedAt,
    gitSha: gitSha(),
    selectedCount: names.length,
    passedCount: results.filter((result) => result.ok).length,
    failedCount: results.filter((result) => !result.ok).length,
    failed: results.filter((result) => !result.ok).map((result) => result.name),
    logPath: path.relative(REPO_ROOT, logPath),
    results,
  };
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  printSummary(results, logPath, summaryPath, startedAt, endedAt);
  if (summary.failedCount > 0 || results.length !== names.length) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

export {
  godotCompileFailureDiagnostic,
  makeResult,
};
