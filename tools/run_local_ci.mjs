#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {spawn, spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, ".run/local_ci");
const DEFAULT_GODOT = process.env.GODOT_BIN || "godot";
const SCENE_PATH = "res://scenes/Main.tscn";
const DEFAULT_TIMEOUT_MS = Number(process.env.BEASTBOUND_LOCAL_CI_TIMEOUT_MS || 240000);

const PERF_LIMITS = {
  idleMedianProcessTotalMs: Number(process.env.BEASTBOUND_CI_IDLE_MEDIAN_PROCESS_TOTAL_MS || 5),
  idleP95ProcessTotalMs: Number(process.env.BEASTBOUND_CI_IDLE_P95_PROCESS_TOTAL_MS || 15),
  movingMedianProcessTotalMs: Number(process.env.BEASTBOUND_CI_MOVING_MEDIAN_PROCESS_TOTAL_MS || 10),
  movingP95ProcessTotalMs: Number(process.env.BEASTBOUND_CI_MOVING_P95_PROCESS_TOTAL_MS || 30),
  movementSpamMaxInputUs: Number(process.env.BEASTBOUND_CI_MOVEMENT_SPAM_MAX_INPUT_US || 5000),
};

function usage() {
  return [
    "Usage: node tools/run_local_ci.mjs [options]",
    "",
    "Options:",
    "  --skip-server          Skip npm test --prefix server/node.",
    "  --skip-godot-auto      Skip tools/run_godot_auto_checks.mjs.",
    "  --skip-perf            Skip performance baseline probes.",
    "  --quick                Run a short Godot auto-check subset instead of the full set.",
    "  --output-dir <dir>     Override summary/log output directory.",
    "  --godot <path>         Override Godot binary path.",
    "  --timeout-ms <ms>      Per-step process timeout.",
    "  --help                 Show this help.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    skipServer: false,
    skipGodotAuto: false,
    skipPerf: false,
    quick: false,
    outputDir: DEFAULT_OUTPUT_DIR,
    godot: DEFAULT_GODOT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--skip-server") {
      options.skipServer = true;
    } else if (arg === "--skip-godot-auto") {
      options.skipGodotAuto = true;
    } else if (arg === "--skip-perf") {
      options.skipPerf = true;
    } else if (arg === "--quick") {
      options.quick = true;
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

function runCommand(step, command, args, options, logStream, timeoutMs = options.timeoutMs) {
  return new Promise((resolve) => {
    const startMs = Date.now();
    console.log(`[ci] ${step} ...`);
    logStream.write(`\n===== ${step} =====\n`);
    logStream.write(`$ ${command} ${args.join(" ")}\n`);
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        GODOT_BIN: options.godot,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      process.stdout.write(chunk);
      logStream.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString("utf8");
      process.stderr.write(chunk);
      logStream.write(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      const elapsedMs = Date.now() - startMs;
      const result = {
        step,
        ok: false,
        exitCode: null,
        signalOrError: error.message,
        timedOut,
        elapsedMs,
        output,
      };
      console.log(`[ci] ${step} failed (${elapsedMs}ms) ${error.message}`);
      resolve(result);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const elapsedMs = Date.now() - startMs;
      const ok = !timedOut && code === 0;
      const result = {
        step,
        ok,
        exitCode: code,
        signalOrError: signal || "",
        timedOut,
        elapsedMs,
        output,
      };
      console.log(`[ci] ${step} ${ok ? "ok" : "failed"} (${elapsedMs}ms)`);
      resolve(result);
    });
  });
}

function godotSceneArgs(quitAfter, userArgs) {
  return [
    "--headless",
    "--path",
    "client/godot",
    "--scene",
    SCENE_PATH,
    "--quit-after",
    String(quitAfter),
    "--",
    ...userArgs,
  ];
}

function parseStatusLine(output) {
  return output
    .split(/\r?\n/)
    .filter((line) => line.includes("status="))
    .at(-1) || "";
}

function parseStatusValue(statusLine) {
  const match = statusLine.match(/\bstatus=([^\s]+)/);
  return match ? match[1] : "";
}

function parseMetric(line, key) {
  const match = line.match(new RegExp(`\\b${escapeRegExp(key)}=([-+0-9.]+)`));
  return match ? Number(match[1]) : Number.NaN;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function perfStats(output, key = "process_total") {
  const values = output
    .split(/\r?\n/)
    .filter((line) => line.startsWith("perf probe:"))
    .map((line) => parseMetric(line, key))
    .filter((value) => Number.isFinite(value));
  const stableValues = values.length >= 4 ? values.slice(Math.floor(values.length / 2)) : values;
  return {
    key,
    samples: values.length,
    stableSamples: stableValues.length,
    median: percentile(stableValues, 0.5),
    p95: percentile(stableValues, 0.95),
    max: stableValues.length > 0 ? Math.max(...stableValues) : 0,
  };
}

function percentile(values, ratio) {
  if (!values || values.length === 0) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function parseKeyValueBoolean(statusLine, key) {
  const match = statusLine.match(new RegExp(`\\b${escapeRegExp(key)}=(true|false)`));
  return match ? match[1] === "true" : false;
}

function parseKeyValueNumber(statusLine, key) {
  const match = statusLine.match(new RegExp(`\\b${escapeRegExp(key)}=([-+0-9.]+)`));
  return match ? Number(match[1]) : Number.NaN;
}

function evaluatePerfResult(result, kind) {
  const statusLine = parseStatusLine(result.output);
  const status = parseStatusValue(statusLine);
  const processTotal = perfStats(result.output, "process_total");
  const details = {
    statusLine,
    status,
    processTotal,
    checks: [],
  };
  let ok = result.ok && (status === "" || status === "ok");
  if (kind === "idle") {
    details.checks.push(`process_total_median<=${PERF_LIMITS.idleMedianProcessTotalMs}`);
    details.checks.push(`process_total_p95<=${PERF_LIMITS.idleP95ProcessTotalMs}`);
    ok = ok && processTotal.samples > 0;
    ok = ok && processTotal.median <= PERF_LIMITS.idleMedianProcessTotalMs;
    ok = ok && processTotal.p95 <= PERF_LIMITS.idleP95ProcessTotalMs;
  } else if (kind === "moving") {
    details.checks.push(`process_total_median<=${PERF_LIMITS.movingMedianProcessTotalMs}`);
    details.checks.push(`process_total_p95<=${PERF_LIMITS.movingP95ProcessTotalMs}`);
    ok = ok && status === "ok";
    ok = ok && processTotal.samples > 0;
    ok = ok && processTotal.median <= PERF_LIMITS.movingMedianProcessTotalMs;
    ok = ok && processTotal.p95 <= PERF_LIMITS.movingP95ProcessTotalMs;
  } else if (kind === "spam") {
    const coalesced = parseKeyValueBoolean(statusLine, "coalesced");
    const settled = parseKeyValueBoolean(statusLine, "settled");
    const maxInputUs = parseKeyValueNumber(statusLine, "max_input_us");
    details.coalesced = coalesced;
    details.settled = settled;
    details.maxInputUs = maxInputUs;
    details.checks.push(`max_input_us<=${PERF_LIMITS.movementSpamMaxInputUs}`);
    ok = ok && status === "ok" && coalesced && settled;
    ok = ok && Number.isFinite(maxInputUs) && maxInputUs <= PERF_LIMITS.movementSpamMaxInputUs;
  } else if (kind === "status") {
    ok = ok && status === "ok";
  }
  return {
    ...result,
    ok,
    status,
    statusLine,
    perf: details,
  };
}

async function runLocalCi(options) {
  fs.mkdirSync(options.outputDir, {recursive: true});
  const stamp = nowStamp();
  const logPath = path.join(options.outputDir, `${stamp}.log`);
  const summaryPath = path.join(options.outputDir, `${stamp}_summary.json`);
  const logStream = fs.createWriteStream(logPath, {encoding: "utf8"});
  const startedAt = new Date().toISOString();
  const results = [];
  let stopError = "";
  logStream.write("Beastbound local CI\n");
  logStream.write(`started_at=${startedAt}\n`);
  logStream.write(`git_sha=${gitSha()}\n`);
  try {
    await pushStep(results, runCommand("git-diff-check", "git", ["diff", "--check"], options, logStream));
    await pushStep(results, runCommand("script-syntax", "node", ["--check", "tools/run_godot_auto_checks.mjs"], options, logStream));
    await pushStep(results, runCommand("script-syntax-local-ci", "node", ["--check", "tools/run_local_ci.mjs"], options, logStream));
    if (!options.skipServer) {
      await pushStep(results, runCommand("server-tests", "npm", ["test", "--prefix", "server/node"], options, logStream));
    }
    if (!options.skipGodotAuto) {
      const autoArgs = ["tools/run_godot_auto_checks.mjs", "--output-dir", path.join(options.outputDir, `${stamp}_godot_auto`)];
      if (options.quick) {
        autoArgs.push("--only", "--auto-auth-check,--auto-server-profile-sync-check");
      }
      await pushStep(results, runCommand("godot-auto-checks", "node", autoArgs, options, logStream, options.quick ? 300000 : 1800000));
    }
    if (!options.skipPerf) {
      const idle = await runCommand("perf-idle", options.godot, godotSceneArgs(1600, ["--perf-probe"]), options, logStream);
      results.push(evaluatePerfResult(idle, "idle"));
      if (!results.at(-1).ok) {
        throw new Error("perf-idle failed baseline gates");
      }
      const moving = await runCommand("perf-moving", options.godot, godotSceneArgs(2600, ["--movement-perf-check", "--perf-probe"]), options, logStream);
      results.push(evaluatePerfResult(moving, "moving"));
      if (!results.at(-1).ok) {
        throw new Error("perf-moving failed baseline gates");
      }
      const spam = await runCommand("perf-movement-spam", options.godot, godotSceneArgs(2600, ["--movement-spam-click-check", "--perf-probe"]), options, logStream);
      results.push(evaluatePerfResult(spam, "spam"));
      if (!results.at(-1).ok) {
        throw new Error("perf-movement-spam failed baseline gates");
      }
      const shop = await runCommand("perf-shop-select", options.godot, godotSceneArgs(2600, ["--shop-select-perf-check"]), options, logStream);
      results.push(evaluatePerfResult(shop, "status"));
      if (!results.at(-1).ok) {
        throw new Error("perf-shop-select failed");
      }
      const stats = await runCommand("perf-player-stat-spam", options.godot, godotSceneArgs(2600, ["--auto-player-stat-spam-perf-check"]), options, logStream);
      results.push(evaluatePerfResult(stats, "status"));
      if (!results.at(-1).ok) {
        throw new Error("perf-player-stat-spam failed");
      }
    }
  } catch (error) {
    stopError = error.message || String(error);
    console.error(`[ci] stopped: ${stopError}`);
  } finally {
    await new Promise((resolve) => logStream.end(resolve));
  }
  const endedAt = new Date().toISOString();
  const summary = {
    startedAt,
    endedAt,
    gitSha: gitSha(),
    passedCount: results.filter((result) => result.ok).length,
    failedCount: results.filter((result) => !result.ok).length,
    failed: results.filter((result) => !result.ok).map((result) => result.step),
    stopError,
    logPath: path.relative(REPO_ROOT, logPath),
    results: results.map((result) => stripOutput(result)),
  };
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  printSummary(summary, summaryPath);
  return summary;
}

async function pushStep(results, promise) {
  const result = await promise;
  results.push(result);
  if (!result.ok) {
    throw new Error(`${result.step} failed`);
  }
}

function stripOutput(result) {
  const {output, ...rest} = result;
  return {
    ...rest,
    outputBytes: Buffer.byteLength(output || "", "utf8"),
  };
}

function printSummary(summary, summaryPath) {
  console.log("");
  console.log("Local CI summary");
  console.log(`passed=${summary.passedCount} failed=${summary.failedCount} total=${summary.results.length}`);
  if (summary.stopError) {
    console.log(`stop_error=${summary.stopError}`);
  }
  console.log(`summary=${path.relative(REPO_ROOT, summaryPath)}`);
  console.log(`log=${summary.logPath}`);
  for (const result of summary.results) {
    const mark = result.ok ? "ok" : "FAIL";
    console.log(`${mark.padEnd(4)} ${String(result.elapsedMs).padStart(7)}ms ${result.step}`);
    if (result.perf && result.perf.processTotal && result.perf.processTotal.samples > 0) {
      console.log(`     process_total median=${result.perf.processTotal.median.toFixed(3)}ms p95=${result.perf.processTotal.p95.toFixed(3)}ms samples=${result.perf.processTotal.samples}`);
    }
    if (result.perf && Number.isFinite(result.perf.maxInputUs)) {
      console.log(`     movement_spam max_input_us=${result.perf.maxInputUs} coalesced=${result.perf.coalesced} settled=${result.perf.settled}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = await runLocalCi(options);
  if (summary.failedCount > 0 || summary.stopError) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
