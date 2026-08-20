#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {spawn, spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, ".run/local_ci");
const GODOT_AUTO_OUTPUT_DIR = path.join(REPO_ROOT, ".run/godot_auto_checks");
const DEFAULT_GODOT = process.env.GODOT_BIN || "godot";
const DEFAULT_AUTH_SERVER_URL = process.env.BEASTBOUND_AUTH_SERVER_URL || "http://127.0.0.1:8787";
const DEFAULT_TIMEOUT_MS = Number(process.env.BEASTBOUND_LOCAL_CI_TIMEOUT_MS || 240000);
const RELEASE_TARGET_CHECKS = Object.freeze([
  "--auto-world-presentation-profile-check",
  "--auto-map-visual-review-showcase-profile-check",
  "--auto-firebud-village-service-layout-check",
  "--auto-movement-check",
  "--auto-mouse-click-check",
  "--auto-pathfinding-check",
  "--auto-npc-interaction-check",
  "--auto-npc-collision-check",
  "--auto-facility-dialog-options-check",
  "--auto-map-transfer-check",
  "--auto-encounter-check",
  "--auto-facility-marker-check",
  "--auto-map-region-contract-check",
  "--auto-audio-runtime-check",
  "--auto-audio-impact-review-model-check",
  "--auto-audio-music-review-model-check",
  "--auto-pet-portrait-art-catalog-check",
  "--auto-pet-shared-portrait-consumer-check",
  "--auto-pet-fusion-skill-policy-check",
  "--auto-pet-template-catalog-check",
  "--auto-pet-management-check",
  "--auto-pet-management-safety-check",
  "--auto-pet-action-asset-check",
  "--auto-pet-growth-authority-check",
  "--auto-battle-check",
  "--auto-battle-auto-10v10-check",
  "--auto-battle-feedback-check",
  "--auto-battle-action-catalog-check",
  "--auto-battle-action-system-check",
  "--auto-battle-visual-timing-check",
  "--auto-battle-reaction-check",
  "--auto-pet-battle-review-lab-check",
  "--auto-auth-check",
  "--auto-qa-panel-check",
]);
const RELEASE_LIVE_CHECKS = Object.freeze([
  "--auto-auth-server-live-check",
  "--auto-startup-login-check",
  "--auto-character-entry-live-check",
  "--auto-server-movement-live-check",
  "--auto-server-battle-turn-live-check",
  "--auto-server-battle-return-check",
  "--auto-server-battle-leave-ui-live-check",
]);
const QUICK_TARGET_CHECKS = Object.freeze([
  "--auto-auth-check",
  "--auto-server-profile-sync-check",
]);

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
    "  --auth-server-url <url> Override the loopback JSON QA backend URL.",
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
    authServerUrl: DEFAULT_AUTH_SERVER_URL,
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
        BEASTBOUND_AUTH_SERVER_URL: options.authServerUrl,
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

function validatedLocalQaBackendUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    throw new Error("QA backend URL must be one canonical loopback HTTP origin");
  }
  if (
    parsed.protocol !== "http:"
    || parsed.hostname !== "127.0.0.1"
    || parsed.port === ""
    || parsed.username !== ""
    || parsed.password !== ""
    || !["", "/"].includes(parsed.pathname)
    || parsed.search !== ""
    || parsed.hash !== ""
    || parsed.origin !== String(value || "").replace(/\/$/, "")
  ) {
    throw new Error("QA backend URL must be one canonical 127.0.0.1 HTTP origin with an explicit port");
  }
  return parsed.origin;
}

async function verifyLocalQaBackend(options, logStream, dependencies = {}) {
  const startedAt = Date.now();
  const step = "qa-backend-preflight";
  const fetchImpl = dependencies.fetch || globalThis.fetch;
  const baseUrl = validatedLocalQaBackendUrl(options.authServerUrl);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("QA backend health preflight timed out")),
    Math.min(options.timeoutMs, 10000),
  );
  console.log(`[ci] ${step} ...`);
  logStream.write(`\n===== ${step} =====\n`);
  logStream.write(`$ GET ${baseUrl}/health\n`);
  try {
    const response = await fetchImpl(`${baseUrl}/health`, {signal: controller.signal});
    const payload = await response.json().catch(() => ({}));
    const storageMode = String(payload && payload.storage && payload.storage.mode || "");
    const ok = response.status === 200
      && payload.ok === true
      && payload.service === "beastbound-auth"
      && storageMode === "json";
    const elapsedMs = Date.now() - startedAt;
    logStream.write(`status=${response.status} ok=${ok} storage_mode=${storageMode || "missing"}\n`);
    console.log(`[ci] ${step} ${ok ? "ok" : "failed"} (${elapsedMs}ms)`);
    return {
      step,
      ok,
      exitCode: ok ? 0 : 1,
      signalOrError: ok ? "" : "loopback backend is not a healthy isolated JSON QA store",
      timedOut: false,
      elapsedMs,
      storageMode,
      output: "",
    };
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const signalOrError = error && error.message || String(error);
    logStream.write(`failed=${signalOrError}\n`);
    console.log(`[ci] ${step} failed (${elapsedMs}ms) ${signalOrError}`);
    return {
      step,
      ok: false,
      exitCode: null,
      signalOrError,
      timedOut: controller.signal.aborted,
      elapsedMs,
      storageMode: "",
      output: "",
    };
  } finally {
    clearTimeout(timeout);
  }
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
      const targetChecks = options.quick ? QUICK_TARGET_CHECKS : RELEASE_TARGET_CHECKS;
      const autoArgs = [
        "tools/run_godot_auto_checks.mjs",
        "--output-dir",
        path.join(GODOT_AUTO_OUTPUT_DIR, `${stamp}_local_ci_target`),
        "--godot",
        options.godot,
        "--timeout-ms",
        String(options.timeoutMs),
        "--only",
        targetChecks.join(","),
        "--fail-fast",
      ];
      await pushStep(
        results,
        runCommand("godot-target-checks", "node", autoArgs, options, logStream, options.quick ? 300000 : 1800000),
      );
      if (!options.quick) {
        await pushStep(results, verifyLocalQaBackend(options, logStream));
        const liveArgs = [
          "tools/run_godot_auto_checks.mjs",
          "--output-dir",
          path.join(GODOT_AUTO_OUTPUT_DIR, `${stamp}_local_ci_live`),
          "--godot",
          options.godot,
          "--auth-server-url",
          options.authServerUrl,
          "--timeout-ms",
          String(options.timeoutMs),
          "--only",
          RELEASE_LIVE_CHECKS.join(","),
          "--fail-fast",
        ];
        await pushStep(
          results,
          runCommand("godot-live-checks", "node", liveArgs, options, logStream, 1800000),
        );
      }
    }
    if (!options.skipPerf) {
      const performanceArgs = [
        "tools/run_godot_auto_checks.mjs",
        "--performance-suite",
        "--fail-fast",
        "--output-dir",
        path.join(GODOT_AUTO_OUTPUT_DIR, `${stamp}_local_ci_perf`),
        "--godot",
        options.godot,
        "--timeout-ms",
        String(options.timeoutMs),
      ];
      await pushStep(
        results,
        runCommand("godot-performance-checks", "node", performanceArgs, options, logStream, 1800000),
      );
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

export {
  parseArgs,
  QUICK_TARGET_CHECKS,
  RELEASE_LIVE_CHECKS,
  RELEASE_TARGET_CHECKS,
  runLocalCi,
  validatedLocalQaBackendUrl,
  verifyLocalQaBackend,
};
