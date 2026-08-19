#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {spawn, spawnSync} from "node:child_process";
import {createHash, randomBytes} from "node:crypto";
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
const DEFAULT_PYTHON = process.env.BEASTBOUND_PYTHON || process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "/usr/bin/python3");
const DEFAULT_AUTH_SERVER_URL = process.env.BEASTBOUND_AUTH_SERVER_URL || "http://127.0.0.1:8787";
const DEFAULT_CHECK_TIMEOUT_MS = Number(process.env.BEASTBOUND_GODOT_CHECK_TIMEOUT_MS || 180000);
const MAX_CHECK_OUTPUT_BYTES = 32 * 1024 * 1024;
const PROCESS_GROUP_CLOSE_TIMEOUT_MS = 10000;
const CONTAINMENT_SCOPE = "cooperative_inherited_pgid";
const SCENE_PATH = "res://scenes/Main.tscn";
const DEFAULT_QUIT_AFTER = 2600;
const PARSE_CHECK_NAME = "godot-parse";
const QA_LANE = "automation";
const QA_LANE_FEATURE = "beastbound_qa_automation";
const QA_LANE_CUSTOM_USER_DIR_NAME = "BeastboundOdysseyQA_Automation";
const QA_LANE_ARG = "--beastbound-qa-user-data-lane=automation";
const QA_ATTESTATION_PREFIX = "BEASTBOUND_QA_USER_DATA_ATTESTATION: ";
const QA_LANE_HELPER = path.join(REPO_ROOT, "tools/godot_qa_user_data_lane.py");
let activeGodotChild = null;
let activeGodotSettlementRequest = null;
let activePreparationAbortController = null;
let requestedShutdownSignal = "";

const QUIT_AFTER_OVERRIDES = new Map(Object.entries({
  "--auto-qa-panel-check": 900,
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

function safeErrorText(value) {
  try {
    if (value !== null && typeof value === "object") {
      const stack = value.stack;
      if (typeof stack === "string" && stack !== "") {
        return stack;
      }
      const message = value.message;
      if (typeof message === "string" && message !== "") {
        return message;
      }
    }
    return String(value);
  } catch (_error) {
    return "<unreadable thrown value>";
  }
}

function safeThrowableProperty(value, key, fallback = undefined) {
  try {
    if (
      value === null
      || (typeof value !== "object" && typeof value !== "function")
    ) {
      return fallback;
    }
    return value[key];
  } catch (_error) {
    return fallback;
  }
}

function createLanePreservationError(value, fallbackReason) {
  const diagnostic = safeErrorText(value);
  const wrapped = new Error(diagnostic === "" ? fallbackReason : diagnostic);
  try {
    Object.defineProperty(wrapped, "cause", {
      configurable: false,
      enumerable: false,
      value,
      writable: false,
    });
  } catch (_error) {
    // The fresh Error remains authoritative even if this runtime rejects cause metadata.
  }
  wrapped.preserveQaLane = true;
  const sourceReason = safeThrowableProperty(value, "lanePreservationReason", "");
  wrapped.lanePreservationReason = typeof sourceReason === "string" && sourceReason !== ""
    ? sourceReason
    : fallbackReason;
  const sourceClosed = safeThrowableProperty(value, "processGroupClosed", undefined);
  if (typeof sourceClosed === "boolean") {
    wrapped.processGroupClosed = sourceClosed;
  }
  const sourceEvidence = safeThrowableProperty(value, "probeEvidence", null);
  try {
    if (sourceEvidence !== null && typeof sourceEvidence === "object" && !Array.isArray(sourceEvidence)) {
      wrapped.probeEvidence = {...sourceEvidence};
    }
  } catch (_error) {
    wrapped.probeEvidence = {processGroupClosed: false};
  }
  return wrapped;
}

function runGodotPreflightProbe(godot, args, environment, label, dependencies = {}) {
  return new Promise((resolve, reject) => {
    const spawnProcess = dependencies.spawn || spawn;
    const closeProcessGroup = dependencies.ensureProcessGroupClosed || ensureProcessGroupClosed;
    const terminateGroup = dependencies.terminateProcessGroup || terminateProcessGroup;
    const timeoutMs = Number.isFinite(dependencies.timeoutMs) ? dependencies.timeoutMs : 10000;
    const settlementGraceMs = Number.isFinite(dependencies.settlementGraceMs) ? dependencies.settlementGraceMs : 1000;
    const forcedSettlementMs = Number.isFinite(dependencies.forcedSettlementMs) ? dependencies.forcedSettlementMs : 5000;
    const outputLimitBytes = Number.isSafeInteger(dependencies.maxOutputBytes)
      ? dependencies.maxOutputBytes
      : 4 * 1024 * 1024;
    let child;
    try {
      child = spawnProcess(godot, args, {
        cwd: REPO_ROOT,
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
        windowsHide: true,
      });
    } catch (error) {
      const spawnError = new Error(`Godot ${label} probe spawn failed: ${safeErrorText(error)}`);
      spawnError.probeEvidence = {
        exitCode: null,
        failureReason: "spawn_error",
        output: "",
        processGroupClosed: true,
        processGroupKillSent: false,
        processGroupResidualObserved: false,
        processGroupTermSent: false,
        signalOrError: safeErrorText(error),
        timedOut: false,
      };
      reject(spawnError);
      return;
    }
    activeGodotChild = child;
    let output = "";
    let outputBytes = 0;
    let timedOut = false;
    let settled = false;
    let failureReason = "";
    let killTimer = null;
    let forcedSettlementTimer = null;
    let timeoutTimer = null;
    let lifecycleTermSent = false;
    let lifecycleKillSent = false;
    let forcedPipeClose = false;
    let emergencyFinalized = false;
    let leaderExitClosure = null;
    let leaderExitClosureDiagnostic = "";
    let leaderExitClosurePromise = null;
    const groupCloseTimeoutMs = Number.isFinite(dependencies.groupCloseTimeoutMs)
      ? Math.max(1, dependencies.groupCloseTimeoutMs)
      : PROCESS_GROUP_CLOSE_TIMEOUT_MS;
    const closeGroupWithDeadline = async () => {
      let deadlineTimer = null;
      try {
        return await Promise.race([
          Promise.resolve().then(() => closeProcessGroup(child, Date.now() + groupCloseTimeoutMs)),
          new Promise((_, rejectClose) => {
            deadlineTimer = setTimeout(
              () => rejectClose(new Error(`Godot ${label} probe process-group close deadline exceeded`)),
              groupCloseTimeoutMs,
            );
          }),
        ]);
      } finally {
        if (deadlineTimer !== null) {
          clearTimeout(deadlineTimer);
        }
      }
    };
    const observeLeaderExitClosure = () => {
      if (leaderExitClosurePromise !== null) {
        return;
      }
      leaderExitClosurePromise = (async () => {
        try {
          leaderExitClosure = processGroupClosureEvidence(
            await closeGroupWithDeadline(),
          );
        } catch (error) {
          leaderExitClosureDiagnostic = safeErrorText(error);
          leaderExitClosure = {
            closed: false,
            killSent: false,
            residualObserved: false,
            termSent: false,
          };
        }
      })();
    };
    const clearTimers = () => {
      if (timeoutTimer !== null) {
        clearTimeout(timeoutTimer);
      }
      if (killTimer !== null) {
        clearTimeout(killTimer);
      }
      if (forcedSettlementTimer !== null) {
        clearTimeout(forcedSettlementTimer);
      }
    };
    const finalize = async (exitCode, signalOrError, internalFailureReason = "") => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      let closure = {
        closed: false,
        killSent: false,
        residualObserved: false,
        termSent: false,
      };
      let processGroupDiagnostic = "";
      if (leaderExitClosurePromise !== null) {
        await leaderExitClosurePromise;
      }
      try {
        closure = processGroupClosureEvidence(
          await closeGroupWithDeadline(),
        );
      } catch (error) {
        processGroupDiagnostic = safeErrorText(error);
      }
      if (leaderExitClosure !== null) {
        closure.closed = closure.closed && leaderExitClosure.closed;
        closure.residualObserved = closure.residualObserved || leaderExitClosure.residualObserved;
        closure.termSent = closure.termSent || leaderExitClosure.termSent;
        closure.killSent = closure.killSent || leaderExitClosure.killSent;
      }
      if (leaderExitClosureDiagnostic !== "") {
        closure.closed = false;
        processGroupDiagnostic = processGroupDiagnostic === ""
          ? leaderExitClosureDiagnostic
          : `${leaderExitClosureDiagnostic}; ${processGroupDiagnostic}`;
      }
      closure.termSent = closure.termSent || lifecycleTermSent;
      closure.killSent = closure.killSent || lifecycleKillSent;
      if (activeGodotChild === child) {
        activeGodotChild = null;
      }
      activeGodotSettlementRequest = null;
      if (internalFailureReason !== "" || forcedPipeClose) {
        try {
          child.stdout.destroy();
          child.stderr.destroy();
          child.unref();
        } catch (_error) {
          // The result remains containment-unknown and the owned lane is preserved.
        }
        const reason = internalFailureReason || `${label}_probe_containment_unknown`;
        const error = new Error(`Godot ${label} probe containment became unknown: ${reason}`);
        error.preserveQaLane = true;
        error.processGroupClosed = closure.closed;
        error.lanePreservationReason = reason;
        error.probeEvidence = {
          exitCode,
          failureReason: failureReason || reason,
          output,
          processGroupClosed: closure.closed,
          processGroupKillSent: closure.killSent,
          processGroupResidualObserved: closure.residualObserved,
          processGroupTermSent: closure.termSent,
          signalOrError,
          timedOut,
        };
        reject(error);
        return;
      }
      if (!closure.closed) {
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
        const error = new Error(`Godot ${label} probe process-group close failed${processGroupDiagnostic === "" ? "" : `: ${processGroupDiagnostic}`}`);
        error.preserveQaLane = true;
        error.processGroupClosed = false;
        error.probeEvidence = {
          exitCode,
          failureReason,
          output,
          processGroupClosed: false,
          processGroupKillSent: closure.killSent,
          processGroupResidualObserved: closure.residualObserved,
          processGroupTermSent: closure.termSent,
          signalOrError,
          timedOut,
        };
        reject(error);
        return;
      }
      if (closure.residualObserved) {
        const residualReason = `${label}_probe_process_group_residual_reaped`;
        const error = new Error(`Godot ${label} probe left a residual process group that the runner reaped`);
        error.preserveQaLane = true;
        error.processGroupClosed = true;
        error.probeEvidence = {
          exitCode,
          failureReason: failureReason || residualReason,
          output,
          processGroupClosed: true,
          processGroupKillSent: closure.killSent,
          processGroupResidualObserved: true,
          processGroupTermSent: closure.termSent,
          signalOrError,
          timedOut,
        };
        reject(error);
        return;
      }
      resolve({
        exitCode,
        failureReason,
        output,
        processGroupClosed: true,
        processGroupKillSent: closure.killSent,
        processGroupResidualObserved: closure.residualObserved,
        processGroupTermSent: closure.termSent,
        signalOrError,
        timedOut,
      });
    };
    const finalizeEmergency = async (sourceError, exitCode, signalOrError) => {
      if (emergencyFinalized) {
        return;
      }
      emergencyFinalized = true;
      clearTimers();
      let closure = {closed: false, killSent: false, residualObserved: false, termSent: false};
      let diagnostic = safeErrorText(sourceError);
      try {
        lifecycleTermSent = terminateGroup(
          child,
          "SIGTERM",
          PROCESS_GROUP_CLOSE_TIMEOUT_MS,
        ) || lifecycleTermSent;
      } catch (error) {
        diagnostic = `${diagnostic}; TERM failed: ${safeErrorText(error)}`;
      }
      try {
        closure = processGroupClosureEvidence(await closeGroupWithDeadline());
      } catch (error) {
        diagnostic = `${diagnostic}; close failed: ${safeErrorText(error)}`;
      }
      closure.termSent = closure.termSent || lifecycleTermSent;
      closure.killSent = closure.killSent || lifecycleKillSent;
      try {
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
      } catch (_error) {
        // Unknown cleanup evidence is represented below and forces lane preservation.
      }
      if (activeGodotChild === child) {
        activeGodotChild = null;
      }
      activeGodotSettlementRequest = null;
      const error = new Error(`Godot ${label} probe internal settlement failed: ${diagnostic}`);
      error.preserveQaLane = true;
      error.processGroupClosed = closure.closed;
      error.lanePreservationReason = `${label}_probe_internal_settlement_failed`;
      error.probeEvidence = {
        exitCode,
        failureReason: `${label}_probe_internal_settlement_failed`,
        output,
        processGroupClosed: closure.closed,
        processGroupKillSent: closure.killSent,
        processGroupResidualObserved: closure.residualObserved,
        processGroupTermSent: closure.termSent,
        signalOrError,
        timedOut,
      };
      reject(error);
    };
    const finalizeSafely = (exitCode, signalOrError, internalFailureReason = "") => {
      void finalize(exitCode, signalOrError, internalFailureReason).catch((error) => {
        void finalizeEmergency(error, exitCode, signalOrError);
      });
    };
    const requestSettlement = (reason, isTimeout = false, forceKill = false) => {
      if (settled) {
        return;
      }
      if (forceKill) {
        failureReason = failureReason || reason;
        try {
          lifecycleKillSent = terminateGroup(child, "SIGKILL", PROCESS_GROUP_CLOSE_TIMEOUT_MS) || lifecycleKillSent;
        } catch (error) {
          finalizeSafely(null, safeErrorText(error), `${label}_probe_signal_error`);
        }
        return;
      }
      if (forcedSettlementTimer !== null) {
        return;
      }
      failureReason = reason;
      timedOut = timedOut || isTimeout;
      try {
        lifecycleTermSent = terminateGroup(child, "SIGTERM", PROCESS_GROUP_CLOSE_TIMEOUT_MS) || lifecycleTermSent;
      } catch (error) {
        finalizeSafely(null, safeErrorText(error), `${label}_probe_signal_error`);
        return;
      }
      killTimer = setTimeout(
        () => {
          try {
            lifecycleKillSent = terminateGroup(child, "SIGKILL", PROCESS_GROUP_CLOSE_TIMEOUT_MS) || lifecycleKillSent;
          } catch (error) {
            finalizeSafely(null, safeErrorText(error), `${label}_probe_signal_error`);
          }
        },
        settlementGraceMs,
      );
      killTimer.unref();
      forcedSettlementTimer = setTimeout(() => {
        forcedPipeClose = true;
        try {
          lifecycleKillSent = terminateGroup(child, "SIGKILL", PROCESS_GROUP_CLOSE_TIMEOUT_MS) || lifecycleKillSent;
          child.stdout.destroy();
          child.stderr.destroy();
          finalizeSafely(null, reason, `${label}_probe_containment_unknown`);
        } catch (error) {
          finalizeSafely(null, safeErrorText(error), `${label}_probe_containment_unknown`);
        }
      }, forcedSettlementMs);
      forcedSettlementTimer.unref();
    };
    const captureChunk = (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = Math.max(0, outputLimitBytes - outputBytes);
      if (remaining > 0) {
        const accepted = buffer.subarray(0, remaining);
        output += accepted.toString("utf8");
        outputBytes += accepted.length;
      }
      if (buffer.length > remaining) {
        requestSettlement(`${label}_probe_output_limit`);
      }
    };
    try {
      activeGodotSettlementRequest = (reason, forceKill = false) => requestSettlement(reason, false, forceKill);
      timeoutTimer = setTimeout(() => requestSettlement(`${label}_probe_timeout`, true), timeoutMs);
      timeoutTimer.unref();
      child.stdout.on("data", captureChunk);
      child.stderr.on("data", captureChunk);
      child.stdout.on("error", () => requestSettlement(`${label}_probe_stdio_error`));
      child.stderr.on("error", () => requestSettlement(`${label}_probe_stdio_error`));
      child.on("error", (error) => finalizeSafely(null, safeErrorText(error)));
      child.on("exit", observeLeaderExitClosure);
      child.on("close", (code, signal) => finalizeSafely(code, signal || ""));
    } catch (error) {
      try {
        lifecycleTermSent = terminateGroup(child, "SIGTERM", PROCESS_GROUP_CLOSE_TIMEOUT_MS) || lifecycleTermSent;
      } catch (_signalError) {
        // finalizeSafely records containment as unknown and preserves the lane.
      }
      finalizeSafely(
        null,
        safeErrorText(error),
        `${label}_probe_post_spawn_setup_error`,
      );
    }
  });
}

function godotHelpHasOption(helpOutput, option) {
  const escapedOption = String(option).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^[ \\t]*(?:-[A-Za-z],[ \\t]*)?${escapedOption}(?:[ \\t]|$)`);
  const limitedSgr = /\u001b\[(?:0|[1-9][0-9]{0,2})(?:;(?:0|[1-9][0-9]{0,2})){0,7}m/g;
  const asciiHelpLine = /^[\u0009\u0020-\u007e]*$/;
  return String(helpOutput || "").split(/\r\n|\n/).some((rawLine) => {
    let sgrInsideToken = false;
    const line = rawLine.replace(limitedSgr, (sequence, offset) => {
      const before = offset > 0 ? rawLine[offset - 1] : "";
      const after = rawLine[offset + sequence.length] || "";
      if (/[A-Za-z0-9_-]/.test(before) && /[A-Za-z0-9_-]/.test(after)) {
        sgrInsideToken = true;
      }
      return "";
    });
    if (sgrInsideToken || !asciiHelpLine.test(line)) {
      return false;
    }
    return pattern.test(line);
  });
}

function assertPreflightProbeContained(probe, label) {
  if (
    probe === null
    || typeof probe !== "object"
    || safeThrowableProperty(probe, "processGroupClosed", false) !== true
    || safeThrowableProperty(probe, "processGroupResidualObserved", true) !== false
    || safeThrowableProperty(probe, "processGroupTermSent", true) !== false
    || safeThrowableProperty(probe, "processGroupKillSent", true) !== false
    || safeThrowableProperty(probe, "timedOut", true) !== false
    || safeThrowableProperty(probe, "signalOrError", "unknown") !== ""
    || safeThrowableProperty(probe, "failureReason", "unknown") !== ""
  ) {
    const error = new Error(`Godot ${label} probe did not prove a naturally closed process group`);
    error.preserveQaLane = true;
    error.processGroupClosed = safeThrowableProperty(probe, "processGroupClosed", false) === true;
    error.lanePreservationReason = `${label}_probe_process_group_containment_failed`;
    throw error;
  }
}

async function preflightGodotEditorBinary(godot, qaLane, dependencies = {}) {
  const runProbe = dependencies.runProbe || runGodotPreflightProbe;
  const verifyLane = dependencies.verifyQaLane || verifyQaLane;
  const preflight = {
    helpProbe: null,
    helpVerification: null,
    version: "",
    versionProbe: null,
    versionVerification: null,
  };
  qaLane.godotPreflight = preflight;

  try {
    preflight.versionProbe = await runProbe(godot, ["--version"], qaLane.environment, "version", dependencies);
  } catch (error) {
    const preserved = createLanePreservationError(error, "version_probe_failed");
    preflight.versionProbe = preserved.probeEvidence || {processGroupClosed: false};
    throw preserved;
  }
  assertPreflightProbeContained(preflight.versionProbe, "version");
  preflight.versionVerification = verifyQaLaneOrPreserve(
    qaLane,
    "post_version_lane_verification",
    {verifyQaLane: verifyLane},
  );
  const versionOutput = String(preflight.versionProbe.output || "").trim();
  const versionLines = versionOutput.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (
    preflight.versionProbe.exitCode !== 0
    || preflight.versionProbe.failureReason !== ""
    || versionLines.length !== 1
    || !/^4\.7(?:[.-][0-9A-Za-z][0-9A-Za-z._-]*)*$/.test(versionLines[0].trim())
  ) {
    throw new Error(`QA lanes require a verified Godot 4.7 editor binary: ${versionOutput || preflight.versionProbe.signalOrError || "version probe failed"}`);
  }
  preflight.version = versionOutput;

  try {
    preflight.helpProbe = await runProbe(godot, ["--help"], qaLane.environment, "help", dependencies);
  } catch (error) {
    const preserved = createLanePreservationError(error, "help_probe_failed");
    preflight.helpProbe = preserved.probeEvidence || {processGroupClosed: false};
    throw preserved;
  }
  assertPreflightProbeContained(preflight.helpProbe, "help");
  preflight.helpVerification = verifyQaLaneOrPreserve(
    qaLane,
    "post_help_lane_verification",
    {verifyQaLane: verifyLane},
  );
  const helpOutput = String(preflight.helpProbe.output || "");
  if (
    preflight.helpProbe.exitCode !== 0
    || preflight.helpProbe.failureReason !== ""
    || !godotHelpHasOption(helpOutput, "--editor")
    || !godotHelpHasOption(helpOutput, "--project-manager")
  ) {
    throw new Error("QA lanes require a tools-enabled Godot editor runtime");
  }
  return preflight;
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
      args: ["--headless", "--path", "client/godot", "--quit", "--", QA_LANE_ARG],
      requiresQaAttestation: true,
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
      QA_LANE_ARG,
      flag,
      ...extraUserArgsForFlag(flag, options),
    ],
    requiresQaAttestation: true,
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
  writeLogOrThrow(logStream, `startup_login_prepare username=${options.startupUsername} base_url=${options.authServerUrl}\n`);
  const controller = new AbortController();
  activePreparationAbortController = controller;
  const timer = setTimeout(() => controller.abort(new Error("startup login preparation timed out")), options.timeoutMs);
  try {
    await ensureStartupLoginAccount(
      options.authServerUrl,
      options.startupUsername,
      options.startupPassword,
      controller.signal,
    );
  } finally {
    clearTimeout(timer);
    if (activePreparationAbortController === controller) {
      activePreparationAbortController = null;
    }
  }
}

async function ensureStartupLoginAccount(baseUrl, username, password, signal) {
  const register = await postAuthJson(baseUrl, "/auth/register", {
    username,
    password,
    displayName: `启动登录${username.slice(-4)}`,
  }, signal);
  let authenticated = register;
  if (!register.ok && register.code !== "username_taken") {
    throw new Error(`startup login account register failed: code=${register.code || "unknown"} message=${register.message || ""}`);
  }
  if (!register.ok) {
    authenticated = await postAuthJson(baseUrl, "/auth/login", {username, password}, signal);
    if (!authenticated.ok) {
      throw new Error(`startup login account login failed: code=${authenticated.code || "unknown"} message=${authenticated.message || ""}`);
    }
  }
  const token = String(authenticated.session && authenticated.session.token || "").trim();
  if (token === "") {
    throw new Error("startup login account preparation returned no session token");
  }
  const roster = await authenticatedJson(baseUrl, "/characters", {
    method: "GET",
    token,
    signal,
  });
  if (!roster.ok || !Array.isArray(roster.characters)) {
    throw new Error(`startup login character roster failed: code=${roster.code || "unknown"} message=${roster.message || ""}`);
  }
  if (roster.characters.some((character) => character && character.occupied === true)) {
    return;
  }
  const idempotencyKey = `bbo_startup_character_${createHash("sha256").update(String(username)).digest("hex").slice(0, 32)}`;
  const created = await authenticatedJson(baseUrl, "/characters", {
    body: {
      appearanceId: "novice_hunter_v1",
      displayName: `启动猎人${String(username).slice(-4)}`,
      elements: {earth: 6, water: 4, fire: 0, wind: 0},
      slotIndex: 0,
    },
    idempotencyKey,
    method: "POST",
    token,
    signal,
  });
  if (!created.ok || !created.character || String(created.character.playerId || "").trim() === "") {
    throw new Error(`startup login character create failed: code=${created.code || "unknown"} message=${created.message || ""}`);
  }
}

async function authenticatedJson(baseUrl, routePath, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = {
    authorization: `Bearer ${String(options.token || "")}`,
    [CLIENT_VERSION_HEADER]: SERVER_VERSION,
    [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
  };
  if (method !== "GET") {
    headers["content-type"] = "application/json";
  }
  if (String(options.idempotencyKey || "") !== "") {
    headers["Idempotency-Key"] = String(options.idempotencyKey);
  }
  const response = await fetch(`${String(baseUrl).replace(/\/+$/, "")}${routePath}`, {
    method,
    headers,
    ...(method === "GET" ? {} : {body: JSON.stringify(options.body || {})}),
    signal: options.signal,
  });
  const payload = await response.json().catch(() => ({}));
  return {
    httpStatus: response.status,
    ...payload,
  };
}

async function postAuthJson(baseUrl, routePath, body, signal) {
  const response = await fetch(`${String(baseUrl).replace(/\/+$/, "")}${routePath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [CLIENT_VERSION_HEADER]: SERVER_VERSION,
      [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
    },
    body: JSON.stringify(body),
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  return {
    httpStatus: response.status,
    ...payload,
  };
}

function runCheck(check, options, logStream, dependencies = {}) {
  return new Promise((resolve) => {
    const startMs = Date.now();
    const prefix = `[${check.index}/${check.total}] ${check.name}`;
    const headerWritten = logStream.write(`\n===== ${prefix} =====\n`)
      && logStream.write(`$ ${check.command} ${check.args.join(" ")}\n`);
    if (!headerWritten || logStream.error !== null) {
      resolve({
        ...makeResult(check, Date.now() - startMs, null, "log_io_error", "", false, options.qaLane),
        ok: false,
        status: "log_io_error",
        processGroupClosed: true,
        processGroupKillSent: false,
        processGroupResidualObserved: false,
        processGroupTermSent: false,
      });
      return;
    }
    const spawnProcess = dependencies.spawn || spawn;
    const closeProcessGroup = dependencies.ensureProcessGroupClosed || ensureProcessGroupClosed;
    const terminateGroup = dependencies.terminateProcessGroup || terminateProcessGroup;
    const outputLimitBytes = Number.isSafeInteger(dependencies.maxOutputBytes)
      ? dependencies.maxOutputBytes
      : MAX_CHECK_OUTPUT_BYTES;
    const settlementGraceMs = Number.isFinite(dependencies.settlementGraceMs) ? dependencies.settlementGraceMs : 5000;
    const forcedSettlementMs = Number.isFinite(dependencies.forcedSettlementMs) ? dependencies.forcedSettlementMs : 10000;
    let child;
    try {
      child = spawnProcess(check.command, check.args, {
        cwd: REPO_ROOT,
        env: options.qaLane.environment,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        ...makeResult(
          check,
          Date.now() - startMs,
          null,
          safeErrorText(error),
          "",
          false,
          options.qaLane,
        ),
        ok: false,
        status: "spawn_error",
        processGroupClosed: true,
        processGroupKillSent: false,
        processGroupResidualObserved: false,
        processGroupTermSent: false,
      });
      return;
    }
    activeGodotChild = child;
    let output = "";
    let outputBytes = 0;
    let timedOut = false;
    let settled = false;
    let settlementReason = "";
    let killTimer = null;
    let forcedSettlementTimer = null;
    let timer = null;
    let lifecycleTermSent = false;
    let lifecycleKillSent = false;
    let forcedPipeClose = false;
    let emergencyFinalized = false;
    let leaderExitClosure = null;
    let leaderExitClosureDiagnostic = "";
    let leaderExitClosurePromise = null;
    const groupCloseTimeoutMs = Number.isFinite(dependencies.groupCloseTimeoutMs)
      ? Math.max(1, dependencies.groupCloseTimeoutMs)
      : PROCESS_GROUP_CLOSE_TIMEOUT_MS;
    const closeGroupWithDeadline = async () => {
      let deadlineTimer = null;
      try {
        return await Promise.race([
          Promise.resolve().then(() => closeProcessGroup(child, Date.now() + groupCloseTimeoutMs)),
          new Promise((_, rejectClose) => {
            deadlineTimer = setTimeout(
              () => rejectClose(new Error("Godot check process-group close deadline exceeded")),
              groupCloseTimeoutMs,
            );
          }),
        ]);
      } finally {
        if (deadlineTimer !== null) {
          clearTimeout(deadlineTimer);
        }
      }
    };
    const observeLeaderExitClosure = () => {
      if (leaderExitClosurePromise !== null) {
        return;
      }
      leaderExitClosurePromise = (async () => {
        try {
          leaderExitClosure = processGroupClosureEvidence(
            await closeGroupWithDeadline(),
          );
        } catch (error) {
          leaderExitClosureDiagnostic = safeErrorText(error);
          leaderExitClosure = {
            closed: false,
            killSent: false,
            residualObserved: false,
            termSent: false,
          };
        }
      })();
    };
    const clearTimers = () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      if (killTimer !== null) {
        clearTimeout(killTimer);
      }
      if (forcedSettlementTimer !== null) {
        clearTimeout(forcedSettlementTimer);
      }
    };
    const finalize = async (code, signalOrError, forcedReason = "", internalFailureReason = "") => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      let closure = {
        closed: false,
        killSent: false,
        residualObserved: false,
        termSent: false,
      };
      let groupCloseDiagnostic = "";
      if (leaderExitClosurePromise !== null) {
        await leaderExitClosurePromise;
      }
      try {
        closure = processGroupClosureEvidence(
          await closeGroupWithDeadline(),
        );
      } catch (error) {
        groupCloseDiagnostic = safeErrorText(error);
      }
      if (leaderExitClosure !== null) {
        closure.closed = closure.closed && leaderExitClosure.closed;
        closure.residualObserved = closure.residualObserved || leaderExitClosure.residualObserved;
        closure.termSent = closure.termSent || leaderExitClosure.termSent;
        closure.killSent = closure.killSent || leaderExitClosure.killSent;
      }
      if (leaderExitClosureDiagnostic !== "") {
        closure.closed = false;
        groupCloseDiagnostic = groupCloseDiagnostic === ""
          ? leaderExitClosureDiagnostic
          : `${leaderExitClosureDiagnostic}; ${groupCloseDiagnostic}`;
      }
      closure.termSent = closure.termSent || lifecycleTermSent;
      closure.killSent = closure.killSent || lifecycleKillSent;
      if (activeGodotChild === child) {
        activeGodotChild = null;
      }
      activeGodotSettlementRequest = null;
      if (!closure.closed) {
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
      }
      const elapsedMs = Date.now() - startMs;
      let result = {
        ...makeResult(check, elapsedMs, code, signalOrError, output, timedOut, options.qaLane),
        processGroupClosed: closure.closed,
        processGroupKillSent: closure.killSent,
        processGroupResidualObserved: closure.residualObserved,
        processGroupTermSent: closure.termSent,
      };
      if (internalFailureReason !== "" || forcedPipeClose) {
        result = {
          ...result,
          containmentBreached: true,
          lanePreservationReason: internalFailureReason || "containment_unknown",
          ok: false,
          status: internalFailureReason || "containment_unknown",
        };
      } else if (!closure.closed) {
        result = markProcessGroupResidual(result);
        if (groupCloseDiagnostic !== "") {
          result.processGroupDiagnostic = groupCloseDiagnostic;
        }
      } else if (closure.residualObserved) {
        result = {
          ...result,
          containmentBreached: true,
          ok: false,
          status: "process_group_residual_reaped",
        };
      } else if (forcedReason !== "" || settlementReason !== "") {
        result = {
          ...result,
          ok: false,
          status: forcedReason || settlementReason,
        };
      }
      const boundaryWritten = logStream.write(
        `\n===== ${prefix} settlement result_ok=${result.ok} exit_code=${result.exitCode ?? "null"} process_group_closed=${closure.closed} residual_observed=${closure.residualObserved} completion_status=${result.completionStatus || "none"} overall_status=${result.status || (result.ok ? "ok" : "failed")} =====\n`,
      );
      if ((!boundaryWritten || logStream.error !== null) && closure.closed) {
        result = {
          ...result,
          ok: false,
          status: "log_io_error",
        };
      } else if (!boundaryWritten || logStream.error !== null) {
        result.logIoDiagnostic = "settlement boundary write failed";
      }
      const suffix = result.ok ? "ok" : `failed code=${result.exitCode} status=${result.status || "unknown"}`;
      console.log(`${prefix} ${suffix} (${elapsedMs}ms)`);
      resolve(result);
    };
    const finalizeEmergency = async (sourceError, code, signalOrError) => {
      if (emergencyFinalized) {
        return;
      }
      emergencyFinalized = true;
      clearTimers();
      let closure = {closed: false, killSent: false, residualObserved: false, termSent: false};
      let diagnostic = safeErrorText(sourceError);
      try {
        lifecycleTermSent = terminateGroup(
          child,
          "SIGTERM",
          PROCESS_GROUP_CLOSE_TIMEOUT_MS,
        ) || lifecycleTermSent;
      } catch (error) {
        diagnostic = `${diagnostic}; TERM failed: ${safeErrorText(error)}`;
      }
      try {
        closure = processGroupClosureEvidence(await closeGroupWithDeadline());
      } catch (error) {
        diagnostic = `${diagnostic}; close failed: ${safeErrorText(error)}`;
      }
      closure.termSent = closure.termSent || lifecycleTermSent;
      closure.killSent = closure.killSent || lifecycleKillSent;
      try {
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
      } catch (_error) {
        // The structured result below preserves the lane on unknown containment.
      }
      if (activeGodotChild === child) {
        activeGodotChild = null;
      }
      activeGodotSettlementRequest = null;
      let result;
      try {
        result = makeResult(
          check,
          Date.now() - startMs,
          code,
          signalOrError,
          output,
          timedOut,
          options.qaLane,
        );
      } catch (_error) {
        result = {
          name: check.name,
          flag: check.flag,
          exitCode: code,
          timedOut,
        };
      }
      resolve({
        ...result,
        containmentBreached: true,
        lanePreservationReason: "runner_internal_settlement_failed",
        ok: false,
        processGroupClosed: closure.closed,
        processGroupDiagnostic: diagnostic,
        processGroupKillSent: closure.killSent,
        processGroupResidualObserved: closure.residualObserved,
        processGroupTermSent: closure.termSent,
        status: "runner_internal_settlement_failed",
      });
    };
    const finalizeSafely = (
      code,
      signalOrError,
      forcedReason = "",
      internalFailureReason = "",
    ) => {
      void finalize(code, signalOrError, forcedReason, internalFailureReason).catch((error) => {
        void finalizeEmergency(error, code, signalOrError);
      });
    };
    const requestSettlement = (reason, isTimeout = false, forceKill = false) => {
      if (settled) {
        return;
      }
      if (forceKill) {
        settlementReason = settlementReason || reason;
        try {
          lifecycleKillSent = terminateGroup(child, "SIGKILL", PROCESS_GROUP_CLOSE_TIMEOUT_MS) || lifecycleKillSent;
        } catch (error) {
          finalizeSafely(null, safeErrorText(error), "", "runner_signal_error");
        }
        return;
      }
      if (forcedSettlementTimer !== null) {
        return;
      }
      settlementReason = reason;
      timedOut = timedOut || isTimeout;
      try {
        lifecycleTermSent = terminateGroup(child, "SIGTERM", PROCESS_GROUP_CLOSE_TIMEOUT_MS) || lifecycleTermSent;
      } catch (error) {
        finalizeSafely(null, safeErrorText(error), "", "runner_signal_error");
        return;
      }
      killTimer = setTimeout(() => {
        try {
          lifecycleKillSent = terminateGroup(child, "SIGKILL", PROCESS_GROUP_CLOSE_TIMEOUT_MS) || lifecycleKillSent;
        } catch (error) {
          finalizeSafely(null, safeErrorText(error), "", "runner_signal_error");
        }
      }, settlementGraceMs);
      killTimer.unref();
      forcedSettlementTimer = setTimeout(() => {
        forcedPipeClose = true;
        try {
          lifecycleKillSent = terminateGroup(child, "SIGKILL", PROCESS_GROUP_CLOSE_TIMEOUT_MS) || lifecycleKillSent;
          child.stdout.destroy();
          child.stderr.destroy();
          finalizeSafely(null, reason, reason, "containment_unknown");
        } catch (error) {
          finalizeSafely(null, safeErrorText(error), reason, "containment_unknown");
        }
      }, forcedSettlementMs);
      forcedSettlementTimer.unref();
    };
    const captureChunk = (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = Math.max(0, outputLimitBytes - outputBytes);
      if (remaining > 0) {
        const accepted = buffer.subarray(0, remaining);
        output += accepted.toString("utf8");
        outputBytes += accepted.length;
        if (!logStream.write(accepted)) {
          requestSettlement("log_io_error");
          return;
        }
      }
      if (buffer.length > remaining) {
        requestSettlement("output_limit_exceeded");
      }
    };
    try {
      activeGodotSettlementRequest = (reason, forceKill = false) => requestSettlement(reason, false, forceKill);
      timer = setTimeout(() => requestSettlement("settlement_watchdog", true), options.timeoutMs);
      child.stdout.on("data", captureChunk);
      child.stderr.on("data", captureChunk);
      child.stdout.on("error", () => requestSettlement("stdio_error"));
      child.stderr.on("error", () => requestSettlement("stdio_error"));
      child.on("error", (error) => finalizeSafely(null, safeErrorText(error), "spawn_error"));
      child.on("exit", observeLeaderExitClosure);
      child.on("close", (code, signal) => finalizeSafely(code, signal || ""));
      console.log(`${prefix} ...`);
    } catch (error) {
      try {
        lifecycleTermSent = terminateGroup(child, "SIGTERM", PROCESS_GROUP_CLOSE_TIMEOUT_MS) || lifecycleTermSent;
      } catch (_signalError) {
        // finalizeSafely records containment as unknown and preserves the lane.
      }
      finalizeSafely(
        null,
        safeErrorText(error),
        "",
        "runner_post_spawn_setup_error",
      );
    }
  });
}

function terminateProcessGroup(child, signal, timeoutMs = PROCESS_GROUP_CLOSE_TIMEOUT_MS) {
  if (!child || !Number.isInteger(child.pid) || child.pid <= 0) {
    return false;
  }
  try {
    if (process.platform === "win32") {
      const terminated = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: Math.max(1, timeoutMs),
        windowsHide: true,
      });
      return terminated.status === 0;
    } else {
      process.kill(-child.pid, signal);
    }
    return true;
  } catch (error) {
    if (safeThrowableProperty(error, "code", "") !== "ESRCH") {
      console.error(`failed to terminate Godot process group pid=${child.pid}: ${safeErrorText(error)}`);
    }
    return false;
  }
}

function descendantProcessIds(records, rootPid) {
  const normalized = Array.isArray(records) ? records : [];
  const childrenByParent = new Map();
  const knownPids = new Set();
  for (const record of normalized) {
    const pid = Number(record.pid);
    const parentPid = Number(record.parentPid);
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(parentPid) || parentPid < 0) {
      continue;
    }
    knownPids.add(pid);
    const children = childrenByParent.get(parentPid) || [];
    children.push(pid);
    childrenByParent.set(parentPid, children);
  }
  const found = new Set();
  const depthByPid = new Map();
  const pending = [{depth: 0, pid: rootPid}];
  while (pending.length > 0) {
    const {depth, pid: parentPid} = pending.shift();
    if (knownPids.has(parentPid)) {
      found.add(parentPid);
      depthByPid.set(parentPid, Math.max(depthByPid.get(parentPid) || 0, depth));
    }
    for (const childPid of childrenByParent.get(parentPid) || []) {
      if (!found.has(childPid)) {
        found.add(childPid);
        depthByPid.set(childPid, depth + 1);
        pending.push({depth: depth + 1, pid: childPid});
      }
    }
  }
  return [...found].sort((left, right) => (
    (depthByPid.get(right) || 0) - (depthByPid.get(left) || 0)
    || right - left
  ));
}

function windowsProcessRecords(timeoutMs = PROCESS_GROUP_CLOSE_TIMEOUT_MS) {
  const script = [
    "$ErrorActionPreference='Stop'",
    "$items=@(Get-CimInstance Win32_Process | Select-Object @{Name='pid';Expression={[int]$_.ProcessId}},@{Name='parentPid';Expression={[int]$_.ParentProcessId}})",
    "ConvertTo-Json -Compress -InputObject $items",
  ].join("; ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: Math.max(1, timeoutMs),
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(String(result.stdout || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return null;
  }
}

function processGroupExists(pid) {
  if (process.platform === "win32" || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (safeThrowableProperty(error, "code", "") === "ESRCH") {
      return false;
    }
    return true;
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function terminateWindowsProcessIds(processIds, deadlineMs = Date.now() + PROCESS_GROUP_CLOSE_TIMEOUT_MS) {
  let attempted = false;
  for (const processId of processIds) {
    const remainingMs = Math.max(0, deadlineMs - Date.now());
    if (remainingMs <= 0) {
      break;
    }
    attempted = true;
    spawnSync("taskkill", ["/PID", String(processId), "/T", "/F"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: Math.max(1, remainingMs),
      windowsHide: true,
    });
  }
  return attempted;
}

async function ensureProcessGroupClosed(
  child,
  deadlineMs = Date.now() + PROCESS_GROUP_CLOSE_TIMEOUT_MS,
  dependencies = {},
) {
  const closure = {
    closed: true,
    residualObserved: false,
    termSent: false,
    killSent: false,
  };
  if (!child || !Number.isInteger(child.pid) || child.pid <= 0) {
    return closure;
  }
  const platform = dependencies.platform || process.platform;
  const readWindowsRecords = dependencies.windowsProcessRecords || windowsProcessRecords;
  const terminateWindowsPids = dependencies.terminateWindowsProcessIds || terminateWindowsProcessIds;
  const groupExists = dependencies.processGroupExists || processGroupExists;
  const wait = dependencies.delay || delay;
  const terminateGroup = dependencies.terminateProcessGroup || terminateProcessGroup;
  const remainingMs = () => Math.max(0, deadlineMs - Date.now());
  if (platform === "win32") {
    if (remainingMs() <= 0) {
      return {...closure, closed: false};
    }
    const before = readWindowsRecords(remainingMs());
    if (before === null) {
      return {...closure, closed: false};
    }
    const beforePids = descendantProcessIds(before, child.pid);
    if (beforePids.length === 0) {
      return closure;
    }
    closure.residualObserved = true;
    closure.killSent = terminateWindowsPids(beforePids, deadlineMs);
    while (remainingMs() > 0) {
      await wait(Math.min(50, remainingMs()));
      const after = readWindowsRecords(remainingMs());
      if (after === null) {
        return {...closure, closed: false};
      }
      if (descendantProcessIds(after, child.pid).length === 0) {
        return closure;
      }
    }
    return {...closure, closed: false};
  }
  if (!groupExists(child.pid)) {
    return closure;
  }
  closure.residualObserved = true;
  closure.termSent = terminateGroup(child, "SIGTERM", remainingMs());
  while (remainingMs() > PROCESS_GROUP_CLOSE_TIMEOUT_MS / 2) {
    if (!groupExists(child.pid)) {
      return closure;
    }
    await wait(Math.min(20, remainingMs()));
  }
  closure.killSent = terminateGroup(child, "SIGKILL", remainingMs());
  while (remainingMs() > 0) {
    if (!groupExists(child.pid)) {
      return closure;
    }
    await wait(Math.min(20, remainingMs()));
  }
  return {...closure, closed: !groupExists(child.pid)};
}

function processGroupClosureEvidence(value) {
  const expectedKeys = ["closed", "killSent", "residualObserved", "termSent"];
  try {
    const keys = value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value).sort()
      : [];
    const closed = value.closed;
    const killSent = value.killSent;
    const residualObserved = value.residualObserved;
    const termSent = value.termSent;
    if (
      JSON.stringify(keys) !== JSON.stringify(expectedKeys)
      || [closed, killSent, residualObserved, termSent].some((entry) => typeof entry !== "boolean")
    ) {
      throw new Error("invalid process-group closure evidence");
    }
    return {closed, killSent, residualObserved, termSent};
  } catch (_error) {
    throw new Error("process-group closure must provide exact boolean evidence");
  }
}

function markProcessGroupResidual(result) {
  return {
    ...result,
    ok: false,
    status: "process_group_residual",
    processGroupClosed: false,
    containmentBreached: true,
  };
}

function normalizeGodotPath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/\/+$/, "");
}

function parseQaLaneAttestation(output, expected) {
  const markerLines = String(output || "")
    .split(/\r?\n/)
    .filter((line) => line.includes(QA_ATTESTATION_PREFIX));
  if (markerLines.length !== 1 || !markerLines[0].startsWith(QA_ATTESTATION_PREFIX)) {
    throw new Error(`expected exactly one column-zero QA lane attestation, found ${markerLines.length}`);
  }
  const reportText = markerLines[0].slice(QA_ATTESTATION_PREFIX.length);
  const expectedFields = {
    customUserDirName: expected.customUserDirName,
    feature: expected.feature,
    lane: expected.lane,
    status: "passed",
    userDataRoot: normalizeGodotPath(expected.godotLaneRoot),
  };
  const expectedText = JSON.stringify(expectedFields);
  if (reportText !== expectedText) {
    throw new Error(`QA lane attestation is not the exact expected marker: expected=${expectedText} actual=${reportText}`);
  }
  let report;
  try {
    report = JSON.parse(reportText);
  } catch (error) {
    throw new Error(`invalid QA lane attestation JSON: ${safeErrorText(error)}`);
  }
  if (report === null || Array.isArray(report) || typeof report !== "object") {
    throw new Error("QA lane attestation must be an object");
  }
  return report;
}

const AUTO_CHECK_COMPLETION_PREFIX_OVERRIDES = Object.freeze({
  "--auto-audio-impact-review-model-check": "audio impact review model check:",
  "--auto-audio-music-review-model-check": "audio music review model check:",
  "--auto-audio-runtime-check": "audio main runtime check:",
  "--auto-battle-command-awakened-ui-check": "battle command awakened ui check:",
  "--auto-battle-settings-check": "battle auto settings check ready:",
  "--auto-capture-settings-check": "auto capture settings check ready:",
  "--auto-character-mount-art-check": "character mount art check ready:",
  "--auto-map-visual-review-showcase-profile-check": "map visual review showcase profile check:",
  "--auto-map-visual-runtime-check": "map visual runtime check:",
  "--auto-mounted-action-asset-check": "mounted action asset check ready:",
  "--auto-movement-check": "click movement check ready:",
  "--auto-npc-appearance-check": "npc appearance check:",
  "--auto-numeric-experiment-report-check": "numeric experiment report ready:",
  "--auto-pet-action-asset-check": "pet action asset check ready:",
  "--auto-pet-evolution-ui-check": "pet evolution UI check ready:",
  "--auto-pet-growth-authority-check": "pet growth authority ready:",
  "--auto-pet-growth-observation-check": "pet growth observation ready:",
  "--auto-pet-growth-rule-preview-check": "manual pet growth evaluation check ready:",
  "--auto-pet-growth-species-simulation-check": "pet growth species simulation ready:",
  "--auto-pet-growth-starter-profiles-check": "pet growth starter profiles ready:",
  "--auto-pet-growth-threshold-check": "pet growth threshold ready:",
  "--auto-pet-paid-reset-ui-check": "pet paid reset UI check ready:",
  "--auto-player-character-main-flow-check": "player character main flow check:",
  "--auto-quick-slot-check": "quick slot removal check ready:",
  "--auto-server-pet-growth-boundary-check": "server pet growth boundary ready:",
  "--auto-startup-login-check": "startup login args check ready:",
  "--auto-world-presentation-profile-check": "world presentation profile check:",
});

function expectedAutoCompletionPrefix(flag) {
  const normalized = String(flag || "");
  if (!/^--auto-[a-z0-9-]+-check$/.test(normalized)) {
    throw new Error(`invalid auto-check flag for completion binding: ${normalized}`);
  }
  if (Object.hasOwn(AUTO_CHECK_COMPLETION_PREFIX_OVERRIDES, normalized)) {
    return AUTO_CHECK_COMPLETION_PREFIX_OVERRIDES[normalized];
  }
  const label = normalized.slice("--auto-".length, -"-check".length).replaceAll("-", " ");
  return `${label} check ready:`;
}

const AUTO_CHECK_JSON_COMPLETION_FIELDS = Object.freeze({
  "--auto-audio-impact-review-model-check": ["result", "PASS"],
  "--auto-audio-music-review-model-check": ["result", "PASS"],
  "--auto-audio-runtime-check": ["result", "PASS"],
  "--auto-battle-command-awakened-ui-check": ["status", "ok"],
  "--auto-character-mount-art-check": ["ok", true],
  "--auto-map-visual-review-showcase-profile-check": ["result", "PASS"],
  "--auto-map-visual-runtime-check": ["result", "PASS"],
  "--auto-mounted-action-asset-check": ["ok", true],
  "--auto-npc-appearance-check": ["ok", true],
  "--auto-pet-action-asset-check": ["ok", true],
  "--auto-player-character-main-flow-check": ["result", "PASS"],
  "--auto-world-presentation-profile-check": ["result", "PASS"],
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function autoCheckCompletionContract(flag) {
  const prefix = expectedAutoCompletionPrefix(flag);
  if (Object.hasOwn(AUTO_CHECK_JSON_COMPLETION_FIELDS, flag)) {
    const [field, successValue] = AUTO_CHECK_JSON_COMPLETION_FIELDS[flag];
    return {field, kind: "json", prefix, successValue};
  }
  return {kind: "status", prefix};
}

function assertJsonKeysUnique(text, label) {
  let index = 0;
  const skipWhitespace = () => {
    while (/\s/.test(text[index] || "")) {
      index += 1;
    }
  };
  const parseString = () => {
    const start = index;
    index += 1;
    let escaped = false;
    while (index < text.length) {
      const value = text[index];
      index += 1;
      if (escaped) {
        escaped = false;
      } else if (value === "\\") {
        escaped = true;
      } else if (value === '"') {
        return JSON.parse(text.slice(start, index));
      }
    }
    throw new Error(`${label} contains an unterminated JSON string`);
  };
  const parseValue = () => {
    skipWhitespace();
    if (text[index] === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      while (index < text.length) {
        if (text[index] !== '"') {
          throw new Error(`${label} contains an invalid JSON object key`);
        }
        const key = parseString();
        if (keys.has(key)) {
          throw new Error(`${label} contains a duplicate JSON key: ${key}`);
        }
        keys.add(key);
        skipWhitespace();
        if (text[index] !== ":") {
          throw new Error(`${label} contains an invalid JSON object separator`);
        }
        index += 1;
        parseValue();
        skipWhitespace();
        if (text[index] === "}") {
          index += 1;
          return;
        }
        if (text[index] !== ",") {
          throw new Error(`${label} contains an invalid JSON object delimiter`);
        }
        index += 1;
        skipWhitespace();
      }
      throw new Error(`${label} contains an unterminated JSON object`);
    }
    if (text[index] === "[") {
      index += 1;
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      while (index < text.length) {
        parseValue();
        skipWhitespace();
        if (text[index] === "]") {
          index += 1;
          return;
        }
        if (text[index] !== ",") {
          throw new Error(`${label} contains an invalid JSON array delimiter`);
        }
        index += 1;
      }
      throw new Error(`${label} contains an unterminated JSON array`);
    }
    if (text[index] === '"') {
      parseString();
      return;
    }
    const start = index;
    while (index < text.length && !/[\s,}\]]/.test(text[index])) {
      index += 1;
    }
    if (index === start) {
      throw new Error(`${label} contains an invalid JSON value`);
    }
  };
  parseValue();
  skipWhitespace();
  if (index !== text.length) {
    throw new Error(`${label} contains trailing JSON data`);
  }
}

function parseTextAutoCompletionFields(sourceText, flag) {
  const source = String(sourceText || "");
  const fields = [];
  const stack = [];
  const closingDelimiter = new Map([
    ["]", "["],
    ["}", "{"],
    [")", "("],
  ]);
  let inQuote = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const codePoint = source.charCodeAt(index);
    if (
      (codePoint < 0x20 && character !== "\t")
      || (codePoint >= 0x7f && codePoint <= 0x9f)
    ) {
      throw new Error(`auto check completion contains a control character for ${flag}`);
    }
    if (inQuote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inQuote = false;
      }
      continue;
    }
    if (character === '"') {
      inQuote = true;
      continue;
    }
    if (character === "[" || character === "{" || character === "(") {
      stack.push(character);
      continue;
    }
    if (closingDelimiter.has(character)) {
      const expectedOpening = closingDelimiter.get(character);
      if (stack.length === 0 || stack.at(-1) !== expectedOpening) {
        throw new Error(`auto check completion contains mismatched delimiters for ${flag}`);
      }
      stack.pop();
      continue;
    }
    if (stack.length !== 0) {
      continue;
    }
    const atBoundary = index === 0 || source[index - 1] === " " || source[index - 1] === "\t";
    if (atBoundary && /[A-Za-z_]/.test(character)) {
      let cursor = index + 1;
      while (cursor < source.length && /[A-Za-z0-9_]/.test(source[cursor])) {
        cursor += 1;
      }
      if (source[cursor] === "=") {
        fields.push({
          key: source.slice(index, cursor),
          start: index,
          valueStart: cursor + 1,
        });
      }
    }
  }
  if (inQuote || escaped || stack.length !== 0) {
    throw new Error(`auto check completion contains an unterminated quoted or structured value for ${flag}`);
  }
  if (fields.length === 0 || fields[0].start !== 0 || fields[0].key !== "status") {
    throw new Error(`auto check completion first top-level field must be status for ${flag}`);
  }
  const evidence = new Map();
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (evidence.has(field.key)) {
      throw new Error(`auto check completion contains duplicate evidence field ${field.key} for ${flag}`);
    }
    const valueEnd = index + 1 < fields.length ? fields[index + 1].start : source.length;
    evidence.set(
      field.key,
      source.slice(field.valueStart, valueEnd).replace(/[ \t]+$/, ""),
    );
  }
  if (!["ok", "failed"].includes(evidence.get("status"))) {
    throw new Error(`auto check completion has an invalid top-level status for ${flag}`);
  }
  return evidence;
}

function parseAutoCheckCompletion(output, flag) {
  const contract = autoCheckCompletionContract(flag);
  const completionPrefix = contract.prefix;
  const completionLines = String(output || "")
    .split(/\r?\n/)
    .filter((line) => line.startsWith(completionPrefix));
  if (completionLines.length !== 1) {
    throw new Error(`auto check did not emit exactly one bound completion line prefix=${completionPrefix} count=${completionLines.length}`);
  }
  const statusLine = completionLines[0];
  if (contract.kind === "json") {
    const payloadText = statusLine.slice(completionPrefix.length).trimStart();
    let payload;
    try {
      payload = JSON.parse(payloadText);
    } catch (error) {
      throw new Error(`auto check completion JSON is invalid for ${flag}: ${safeErrorText(error)}`);
    }
    if (payload === null || Array.isArray(payload) || typeof payload !== "object") {
      throw new Error(`auto check completion JSON must be an object for ${flag}`);
    }
    assertJsonKeysUnique(payloadText, `auto check completion JSON for ${flag}`);
    const {field, successValue} = contract;
    let success = payload[field] === successValue;
    if (Object.hasOwn(payload, "errors")) {
      success = success && Array.isArray(payload.errors) && payload.errors.length === 0;
    }
    if (Object.hasOwn(payload, "failures")) {
      success = success && Array.isArray(payload.failures) && payload.failures.length === 0;
    }
    if (Object.hasOwn(payload, "partial")) {
      success = success && payload.partial === false;
    }
    if (Object.hasOwn(payload, "complete")) {
      success = success && payload.complete === true;
    }
    if (Object.hasOwn(payload, "failedCount")) {
      success = success && payload.failedCount === 0;
    }
    for (const failureField of ["error", "failure"]) {
      if (Object.hasOwn(payload, failureField)) {
        const failureValue = payload[failureField];
        success = success && (
          failureValue === null
          || failureValue === false
          || failureValue === ""
          || (Array.isArray(failureValue) && failureValue.length === 0)
        );
      }
    }
    for (const [commonField, commonValue] of [
      ["ok", true],
      ["passed", true],
      ["success", true],
      ["failed", false],
      ["result", "PASS"],
      ["status", "ok"],
    ]) {
      if (Object.hasOwn(payload, commonField)) {
        success = success && payload[commonField] === commonValue;
      }
    }
    return {
      status: success ? "ok" : "failed",
      statusLine,
    };
  }
  const payloadText = statusLine.slice(completionPrefix.length);
  if (
    payloadText.length < 2
    || ![" ", "\t"].includes(payloadText[0])
    || [" ", "\t"].includes(payloadText[1])
  ) {
    throw new Error(`auto check completion must have one exact separator before status for ${flag}`);
  }
  const evidence = parseTextAutoCompletionFields(payloadText.slice(1), flag);
  let success = evidence.get("status") === "ok";
  for (const [field, expected] of [
    ["ok", "true"],
    ["passed", "true"],
    ["success", "true"],
    ["failed", "false"],
    ["partial", "false"],
    ["complete", "true"],
    ["failedCount", "0"],
  ]) {
    if (evidence.has(field)) {
      success = success && evidence.get(field) === expected;
    }
  }
  for (const field of ["error", "errors", "failure", "failures"]) {
    if (evidence.has(field)) {
      success = success && ["", "[]", "false", "none", "null", "0"].includes(evidence.get(field));
    }
  }
  return {
    status: success ? "ok" : "failed",
    statusLine,
  };
}

function makeResult(check, elapsedMs, exitCode, signalOrError, output, timedOut, qaLane = null) {
  const outputLines = String(output || "").split(/\r?\n/);
  const compileDiagnostic = godotCompileFailureDiagnostic(output);
  const runtimeDiagnostic = outputLines.find((line) => (
    /^[\t ]*(?:ERROR|FATAL(?: ERROR)?):/.test(line)
  )) || "";
  let statusLine = "";
  let completionStatus = "";
  let completionDiagnostic = "";
  if (check.flag !== "") {
    try {
      const completion = parseAutoCheckCompletion(output, check.flag);
      statusLine = completion.statusLine;
      completionStatus = completion.status;
    } catch (error) {
      completionDiagnostic = safeErrorText(error);
    }
  } else {
    statusLine = outputLines.filter((line) => line.includes("status=")).at(-1) || "";
  }
  let qaLaneAttestation = null;
  let qaLaneDiagnostic = "";
  const requiresQaAttestation = check.requiresQaAttestation === true || check.flag !== "";
  if (requiresQaAttestation) {
    try {
      qaLaneAttestation = parseQaLaneAttestation(output, qaLane || {});
    } catch (error) {
      qaLaneDiagnostic = safeErrorText(error);
    }
  }
  const semanticStatus = compileDiagnostic !== ""
    ? "compile_error"
    : (runtimeDiagnostic !== ""
      ? "runtime_error"
      : (qaLaneDiagnostic !== ""
        ? "qa_lane_attestation_failed"
        : (completionDiagnostic !== "" ? "completion_marker_invalid" : completionStatus)));
  const ok = !timedOut
    && exitCode === 0
    && compileDiagnostic === ""
    && runtimeDiagnostic === ""
    && qaLaneDiagnostic === ""
    && completionDiagnostic === ""
    && (check.flag === "" || semanticStatus === "ok");
  const status = compileDiagnostic !== ""
    ? "compile_error"
    : (runtimeDiagnostic !== ""
      ? "runtime_error"
      : (qaLaneDiagnostic !== ""
        ? "qa_lane_attestation_failed"
        : (completionDiagnostic !== ""
          ? "completion_marker_invalid"
          : (exitCode !== 0
            ? (exitCode === null ? "signal_exit" : "exit_nonzero")
            : completionStatus))));
  return {
    name: check.name,
    flag: check.flag,
    command: [check.command, ...check.args].join(" "),
    quitAfter: check.quitAfter || 0,
    ok,
    status,
    completionStatus,
    statusLine,
    compileDiagnostic,
    runtimeDiagnostic,
    qaLaneAttestation,
    qaLaneDiagnostic,
    completionDiagnostic,
    exitCode,
    signalOrError,
    timedOut,
    elapsedMs,
  };
}

function godotCompileFailureDiagnostic(output) {
  const lines = String(output || "").split(/\r?\n/);
  return lines.find((line) => (
    /^[\t ]*SCRIPT ERROR:/.test(line)
    || /^[\t ]*ERROR: Failed to compile depended scripts/.test(line)
    || /^[\t ]*ERROR: Failed to load script .*Compilation failed/.test(line)
  )) || "";
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function isEqualOrDescendantPath(parentPath, candidatePath) {
  const parent = path.resolve(parentPath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function pathsIntersect(leftPath, rightPath) {
  return isEqualOrDescendantPath(leftPath, rightPath) || isEqualOrDescendantPath(rightPath, leftPath);
}

function assertExistingPathComponentsAreDirectoriesWithoutLinks(parentPath, candidatePath) {
  const parent = path.resolve(parentPath);
  const candidate = path.resolve(candidatePath);
  if (!isEqualOrDescendantPath(parent, candidate)) {
    throw new Error(`path escaped its fixed parent: ${candidate}`);
  }
  let current = parent;
  for (const component of path.relative(parent, candidate).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let item;
    try {
      item = fs.lstatSync(current);
    } catch (error) {
      if (safeThrowableProperty(error, "code", "") === "ENOENT") {
        break;
      }
      throw error;
    }
    if (item.isSymbolicLink() || !item.isDirectory()) {
      throw new Error(`output path component is not a non-link directory: ${current}`);
    }
  }
}

function validateQaOutputDirectory(requestedOutputDir, qaLane) {
  const outputDir = path.resolve(requestedOutputDir);
  if (!isEqualOrDescendantPath(DEFAULT_OUTPUT_DIR, outputDir)) {
    throw new Error(`QA output directory must stay under ${DEFAULT_OUTPUT_DIR}`);
  }
  if (pathsIntersect(outputDir, qaLane.laneRoot) || pathsIntersect(outputDir, qaLane.realRoot)) {
    throw new Error("QA output directory must not intersect lane or real Godot user data");
  }
  assertExistingPathComponentsAreDirectoriesWithoutLinks(REPO_ROOT, outputDir);
  return outputDir;
}

function createSynchronousLog(filePath) {
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  let closed = false;
  let failure = null;
  return {
    get error() {
      return failure;
    },
    write(chunk) {
      if (failure !== null || closed) {
        return false;
      }
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
      let offset = 0;
      try {
        while (offset < buffer.length) {
          const written = fs.writeSync(descriptor, buffer, offset, buffer.length - offset);
          if (written <= 0) {
            throw new Error("short write to Godot auto-check log");
          }
          offset += written;
        }
        return true;
      } catch (error) {
        failure = error;
        requestGracefulShutdown("LOG_IO_ERROR");
        return false;
      }
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      try {
        fs.closeSync(descriptor);
      } catch (error) {
        failure = failure || error;
      }
    },
  };
}

function writeExclusiveFile(filePath, content) {
  const writer = createSynchronousLog(filePath);
  try {
    if (!writer.write(content) || writer.error !== null) {
      throw writer.error || new Error(`exclusive write failed: ${filePath}`);
    }
  } finally {
    writer.close();
  }
  if (writer.error !== null) {
    throw writer.error;
  }
}

function writeProcessEvidence(content, descriptor = process.stderr.fd) {
  const payload = Buffer.from(String(content), "utf8");
  let offset = 0;
  while (offset < payload.length) {
    const written = fs.writeSync(descriptor, payload, offset, payload.length - offset);
    if (!Number.isInteger(written) || written <= 0) {
      throw new Error("failed to synchronously publish QA lane owner evidence");
    }
    offset += written;
  }
}

function writeLogOrThrow(logStream, content) {
  if (!logStream.write(content) || logStream.error !== null) {
    throw logStream.error || new Error("Godot auto-check evidence log write failed");
  }
}

function gitSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function parseLaneHelperOutput(result, command) {
  const stdout = String(result.stdout || "");
  const stderr = String(result.stderr || "");
  const match = stdout.match(/^([^\r\n]+)\r?\n?$/);
  if (match === null || stderr !== "") {
    throw new Error(`QA lane helper ${command} must emit exactly one JSON line on stdout and no stderr`);
  }
  let payload;
  try {
    assertJsonKeysUnique(match[1], `QA lane helper ${command} JSON`);
    payload = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`QA lane helper ${command} emitted invalid JSON: ${safeErrorText(error)}`);
  }
  if (payload === null || Array.isArray(payload) || typeof payload !== "object") {
    throw new Error(`QA lane helper ${command} payload must be an object`);
  }
  const canonicalPayload = Object.fromEntries(
    Object.keys(payload).sort().map((key) => [key, payload[key]]),
  );
  if (match[1] !== JSON.stringify(canonicalPayload)) {
    throw new Error(`QA lane helper ${command} JSON must be canonical and key-sorted`);
  }
  if (result.error || result.status !== 0) {
    const diagnostic = payload.error || (result.error ? safeErrorText(result.error) : `exit=${result.status}`);
    const error = new Error(`QA lane helper ${command} failed: ${diagnostic}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

function runQaLaneHelper(command, args = []) {
  const result = spawnSync(DEFAULT_PYTHON, ["-B", QA_LANE_HELPER, command, ...args], {
    cwd: REPO_ROOT,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30000,
    killSignal: "SIGKILL",
    windowsHide: true,
  });
  return parseLaneHelperOutput(result, command);
}

function validateQaLaneSourceContract(dependencies = {}) {
  const runHelper = dependencies.runQaLaneHelper || runQaLaneHelper;
  const result = runHelper("source-check", ["--repo-root", REPO_ROOT]);
  assertExactPayloadKeys(result, "source-check", ["status"]);
  if (result.status !== "source_contract_passed") {
    throw new Error("QA lane helper source contract did not pass exactly before prepare");
  }
  return result;
}

function assertExactPayloadKeys(payload, command, expectedKeys) {
  const actual = Object.keys(payload).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`QA lane helper ${command} keys are not exact: ${actual.join(",")}`);
  }
}

function assertNonNegativeInteger(payload, field, command) {
  if (!Number.isSafeInteger(payload[field]) || payload[field] < 0) {
    throw new Error(`QA lane helper ${command} field must be a non-negative integer: ${field}`);
  }
}

function assertHex(payload, field, length, command) {
  if (typeof payload[field] !== "string" || !new RegExp(`^[0-9a-f]{${length}}$`).test(payload[field])) {
    throw new Error(`QA lane helper ${command} field must be lowercase hex: ${field}`);
  }
}

function validateStaleLaneInspectionPayload(inspected) {
  const command = "inspect-stale";
  assertExactPayloadKeys(inspected, command, [
    "authorityState", "inspectionSha256", "lane", "laneAbsent", "laneEntryCount",
    "laneInventorySha256", "laneRoot", "laneRootState", "lockSchemaVersion",
    "lockedRealInventorySha256", "ownerCanaryState", "ownerSha256", "pendingLockState",
    "pendingOwnerState", "publishedLockState", "realEntryCount", "realInventorySha256",
    "realRoot", "runnerPid", "runnerStartIdentitySha256", "runnerState", "status",
  ]);
  for (const field of [
    "authorityState", "inspectionSha256", "lane", "laneInventorySha256", "laneRoot",
    "laneRootState", "lockedRealInventorySha256", "ownerCanaryState", "ownerSha256",
    "pendingLockState", "pendingOwnerState", "publishedLockState", "realInventorySha256",
    "realRoot", "runnerStartIdentitySha256", "runnerState", "status",
  ]) {
    if (typeof inspected[field] !== "string") {
      throw new Error(`QA lane helper ${command} field must be a string: ${field}`);
    }
  }
  if (
    inspected.lane !== QA_LANE
    || typeof inspected.laneAbsent !== "boolean"
    || !["absent", "active", "legacy", "stale", "unsafe"].includes(inspected.status)
    || pathsIntersect(inspected.laneRoot, inspected.realRoot)
  ) {
    throw new Error("QA lane helper stale inspection identity contract is invalid");
  }
  assertHex(inspected, "inspectionSha256", 64, command);
  assertHex(inspected, "realInventorySha256", 64, command);
  assertNonNegativeInteger(inspected, "realEntryCount", command);
  if (!Number.isSafeInteger(inspected.lockSchemaVersion) || ![0, 1, 2].includes(inspected.lockSchemaVersion)) {
    throw new Error("QA lane helper stale inspection schema is invalid");
  }
  if (!Number.isSafeInteger(inspected.runnerPid) || inspected.runnerPid < 0) {
    throw new Error("QA lane helper stale inspection runner PID is invalid");
  }
  if (inspected.status === "absent") {
    if (
      inspected.laneAbsent !== true
      || inspected.lockSchemaVersion !== 0
      || inspected.ownerSha256 !== ""
      || inspected.runnerPid !== 0
      || inspected.runnerStartIdentitySha256 !== ""
      || inspected.runnerState !== "absent"
      || inspected.authorityState !== "absent"
    ) {
      throw new Error("QA lane helper absent stale inspection contract is invalid");
    }
    return inspected;
  }
  if (inspected.laneAbsent !== false) {
    throw new Error("QA lane helper occupied stale inspection must not claim lane absence");
  }
  if (inspected.lockSchemaVersion === 0) {
    if (
      inspected.status !== "unsafe"
      || inspected.authorityState !== "absent"
      || inspected.ownerSha256 !== ""
      || inspected.lockedRealInventorySha256 !== ""
      || inspected.runnerPid !== 0
      || inspected.runnerStartIdentitySha256 !== ""
      || inspected.runnerState !== "absent"
    ) {
      throw new Error("QA lane helper lockless unsafe inspection contract is invalid");
    }
    return inspected;
  }
  assertHex(inspected, "ownerSha256", 64, command);
  assertHex(inspected, "lockedRealInventorySha256", 64, command);
  if (inspected.laneInventorySha256 !== "") {
    assertHex(inspected, "laneInventorySha256", 64, command);
  }
  if (inspected.lockSchemaVersion === 1) {
    if (
      inspected.runnerPid !== 0
      || inspected.runnerStartIdentitySha256 !== ""
      || inspected.runnerState !== "legacy_unverifiable"
      || !["legacy", "unsafe"].includes(inspected.status)
    ) {
      throw new Error("QA lane helper legacy stale inspection contract is invalid");
    }
  } else if (inspected.lockSchemaVersion === 2) {
    assertHex(inspected, "runnerStartIdentitySha256", 64, command);
    if (
      inspected.runnerPid <= 0
      || !["active", "stale"].includes(inspected.runnerState)
      || (inspected.status !== "unsafe" && inspected.status !== inspected.runnerState)
    ) {
      throw new Error("QA lane helper v2 stale inspection contract is invalid");
    }
  }
  return inspected;
}

function validateStaleLaneRecoveryPayload(recovered, inspected) {
  const command = "recover-stale";
  assertExactPayloadKeys(recovered, command, [
    "lane", "laneAbsent", "lockSchemaVersion", "ownerSha256", "priorStatus",
    "realInventorySha256", "realRoot", "realUnchanged", "runnerPid",
    "runnerStartIdentitySha256", "runnerState", "status",
  ]);
  if (
    recovered.status !== "recovered"
    || recovered.priorStatus !== "stale"
    || recovered.lane !== QA_LANE
    || recovered.laneAbsent !== true
    || recovered.realUnchanged !== true
    || recovered.lockSchemaVersion !== 2
    || recovered.ownerSha256 !== inspected.ownerSha256
    || recovered.runnerPid !== inspected.runnerPid
    || recovered.runnerStartIdentitySha256 !== inspected.runnerStartIdentitySha256
    || recovered.runnerState !== "stale"
    || recovered.realRoot !== inspected.realRoot
    || recovered.realInventorySha256 !== inspected.realInventorySha256
  ) {
    throw new Error("QA lane helper stale recovery identity contract is invalid");
  }
  assertHex(recovered, "ownerSha256", 64, command);
  assertHex(recovered, "runnerStartIdentitySha256", 64, command);
  assertHex(recovered, "realInventorySha256", 64, command);
  return recovered;
}

function reclaimStaleQaLane(dependencies = {}) {
  const runHelper = dependencies.runQaLaneHelper || runQaLaneHelper;
  const inspected = validateStaleLaneInspectionPayload(runHelper("inspect-stale", [
    "--lane",
    QA_LANE,
  ]));
  if (inspected.status === "absent") {
    return inspected;
  }
  if (inspected.status !== "stale") {
    throw new Error(`QA lane residue is ${inspected.status}; automatic reclamation refused`);
  }
  return validateStaleLaneRecoveryPayload(runHelper("recover-stale", [
    "--lane",
    QA_LANE,
    "--inspection-sha256",
    inspected.inspectionSha256,
  ]), inspected);
}

function validatePreparedLanePayload(prepared, expectedOwner = "") {
  const command = "prepare";
  assertExactPayloadKeys(prepared, command, [
    "customUserDirName", "editorCustomFeatures", "feature", "godotLaneRoot", "godotRealRoot",
    "lane", "laneEntryCount", "laneInventorySha256", "laneRoot", "owner", "realEntryCount",
    "realInventorySha256", "realRoot", "lockSchemaVersion", "runnerPid",
    "runnerStartIdentitySha256", "status",
  ]);
  for (const field of [
    "customUserDirName", "editorCustomFeatures", "feature", "godotLaneRoot", "godotRealRoot",
    "lane", "laneInventorySha256", "laneRoot", "owner", "realInventorySha256", "realRoot", "status",
    "runnerStartIdentitySha256",
  ]) {
    if (typeof prepared[field] !== "string") {
      throw new Error(`QA lane helper prepare field must be a string: ${field}`);
    }
  }
  if (
    prepared.status !== "prepared"
    || prepared.lane !== QA_LANE
    || prepared.feature !== QA_LANE_FEATURE
    || prepared.customUserDirName !== QA_LANE_CUSTOM_USER_DIR_NAME
    || normalizeGodotPath(prepared.laneRoot) !== normalizeGodotPath(prepared.godotLaneRoot)
    || normalizeGodotPath(prepared.realRoot) !== normalizeGodotPath(prepared.godotRealRoot)
    || pathsIntersect(prepared.laneRoot, prepared.realRoot)
    || (expectedOwner !== "" && prepared.owner !== expectedOwner)
  ) {
    throw new Error("QA lane helper returned an invalid prepare identity contract");
  }
  assertHex(prepared, "owner", 32, command);
  assertHex(prepared, "realInventorySha256", 64, command);
  assertHex(prepared, "laneInventorySha256", 64, command);
  assertNonNegativeInteger(prepared, "realEntryCount", command);
  assertNonNegativeInteger(prepared, "laneEntryCount", command);
  assertNonNegativeInteger(prepared, "runnerPid", command);
  if (
    ![1, 2].includes(prepared.lockSchemaVersion)
    || (prepared.lockSchemaVersion === 1 && (prepared.runnerPid !== 0 || prepared.runnerStartIdentitySha256 !== ""))
    || (prepared.lockSchemaVersion === 2 && prepared.runnerPid <= 0)
  ) {
    throw new Error("QA lane helper prepare runner identity contract is invalid");
  }
  if (prepared.lockSchemaVersion === 2) {
    assertHex(prepared, "runnerStartIdentitySha256", 64, command);
  }
  const featureTokens = prepared.editorCustomFeatures.split(",").map((value) => value.trim()).filter(Boolean);
  if (
    featureTokens.filter((value) => value === QA_LANE_FEATURE).length !== 1
    || featureTokens.some((value) => value !== QA_LANE_FEATURE && value.startsWith("beastbound_qa_"))
  ) {
    throw new Error("QA lane helper prepare feature contract is not exclusive");
  }
  return prepared;
}

function validateVerifiedLanePayload(verified, qaLane) {
  const command = "verify";
  assertExactPayloadKeys(verified, command, [
    "feature", "godotLaneRoot", "lane", "laneEntryCount", "laneInventorySha256", "laneRoot", "owner",
    "realEntryCount", "realInventorySha256", "realRoot", "realUnchanged", "status",
  ]);
  for (const field of [
    "feature", "godotLaneRoot", "lane", "laneInventorySha256", "laneRoot", "owner",
    "realInventorySha256", "realRoot", "status",
  ]) {
    if (typeof verified[field] !== "string") {
      throw new Error(`QA lane helper verify field must be a string: ${field}`);
    }
  }
  if (
    verified.status !== "verified"
    || verified.realUnchanged !== true
    || verified.lane !== qaLane.lane
    || verified.owner !== qaLane.owner
    || verified.feature !== qaLane.feature
    || verified.laneRoot !== qaLane.laneRoot
    || normalizeGodotPath(verified.godotLaneRoot) !== normalizeGodotPath(qaLane.godotLaneRoot)
    || verified.realRoot !== qaLane.realRoot
    || verified.realInventorySha256 !== qaLane.realInventorySha256
  ) {
    throw new Error("QA lane helper verify identity contract is invalid");
  }
  assertHex(verified, "realInventorySha256", 64, command);
  assertHex(verified, "laneInventorySha256", 64, command);
  assertNonNegativeInteger(verified, "realEntryCount", command);
  assertNonNegativeInteger(verified, "laneEntryCount", command);
  return verified;
}

function validateCleanedLanePayload(cleaned, qaLane) {
  const command = "cleanup";
  assertExactPayloadKeys(cleaned, command, [
    "feature", "lane", "laneAbsent", "laneRoot", "owner", "realInventorySha256", "realRoot",
    "realUnchanged", "removedLaneEntryCount", "removedLaneInventorySha256", "status",
  ]);
  for (const field of [
    "feature", "lane", "laneRoot", "owner", "realInventorySha256", "realRoot",
    "removedLaneInventorySha256", "status",
  ]) {
    if (typeof cleaned[field] !== "string") {
      throw new Error(`QA lane helper cleanup field must be a string: ${field}`);
    }
  }
  if (
    cleaned.status !== "cleaned"
    || cleaned.laneAbsent !== true
    || cleaned.realUnchanged !== true
    || cleaned.lane !== qaLane.lane
    || cleaned.owner !== qaLane.owner
    || cleaned.feature !== qaLane.feature
    || cleaned.laneRoot !== qaLane.laneRoot
    || cleaned.realRoot !== qaLane.realRoot
    || cleaned.realInventorySha256 !== qaLane.realInventorySha256
    || cleaned.removedLaneInventorySha256 !== qaLane.lastLaneInventorySha256
    || cleaned.removedLaneEntryCount !== qaLane.lastLaneEntryCount
  ) {
    throw new Error("QA lane helper cleanup identity contract is invalid");
  }
  assertHex(cleaned, "realInventorySha256", 64, command);
  assertHex(cleaned, "removedLaneInventorySha256", 64, command);
  assertNonNegativeInteger(cleaned, "removedLaneEntryCount", command);
  return cleaned;
}

function validateRecoveredLanePayload(recovered, owner) {
  if (recovered.status === "absent") {
    assertExactPayloadKeys(recovered, "recover", ["lane", "laneAbsent", "owner", "status"]);
    if (recovered.lane !== QA_LANE || recovered.owner !== owner || recovered.laneAbsent !== true) {
      throw new Error("QA lane helper absent recovery identity contract is invalid");
    }
    return recovered;
  }
  assertExactPayloadKeys(recovered, "recover", [
    "lane", "laneAbsent", "owner", "realInventorySha256", "realRoot", "realUnchanged", "status",
  ]);
  if (
    recovered.status !== "recovered"
    || recovered.lane !== QA_LANE
    || recovered.owner !== owner
    || recovered.laneAbsent !== true
    || recovered.realUnchanged !== true
    || typeof recovered.realRoot !== "string"
  ) {
    throw new Error("QA lane helper recovery identity contract is invalid");
  }
  assertHex(recovered, "realInventorySha256", 64, "recover");
  return recovered;
}

function buildGodotLaneEnvironment(baseEnvironment, prepared) {
  const environment = {
    ...baseEnvironment,
    GODOT_EDITOR_CUSTOM_FEATURES: prepared.editorCustomFeatures,
    BEASTBOUND_QA_USER_DATA_LANE: prepared.lane,
    BEASTBOUND_QA_EXPECTED_USER_DATA_ROOT: prepared.godotLaneRoot,
  };
  if (environment.HOME !== baseEnvironment.HOME) {
    throw new Error("QA lane environment must not replace HOME");
  }
  return environment;
}

function prepareQaLane(baseEnvironment = process.env, owner = "", runnerPid = process.pid) {
  if (!/^[0-9a-f]{32}$/.test(owner)) {
    throw new Error("runner must provide one explicit 32-hex QA lane owner token");
  }
  const prepared = validatePreparedLanePayload(runQaLaneHelper("prepare", [
    "--lane",
    QA_LANE,
    "--owner",
    owner,
    "--existing-features",
    String(baseEnvironment.GODOT_EDITOR_CUSTOM_FEATURES || ""),
    "--runner-pid",
    String(runnerPid),
  ]), owner);
  if (prepared.lockSchemaVersion !== 2 || prepared.runnerPid !== runnerPid) {
    throw new Error("runner prepare must bind the exact live runner PID in a schema-v2 lock");
  }
  return {
    ...prepared,
    lastLaneInventorySha256: prepared.laneInventorySha256,
    lastLaneEntryCount: prepared.laneEntryCount,
    environment: buildGodotLaneEnvironment(baseEnvironment, prepared),
  };
}

function verifyQaLane(qaLane) {
  const verified = runQaLaneHelper("verify", [
    "--lane",
    qaLane.lane,
    "--owner",
    qaLane.owner,
    "--expected-real-sha256",
    qaLane.realInventorySha256,
  ]);
  const validated = validateVerifiedLanePayload(verified, qaLane);
  qaLane.lastLaneInventorySha256 = validated.laneInventorySha256;
  qaLane.lastLaneEntryCount = validated.laneEntryCount;
  return validated;
}

function verifyQaLaneOrPreserve(qaLane, phase = "qa_lane_verification", dependencies = {}) {
  const verifyLane = dependencies.verifyQaLane || verifyQaLane;
  try {
    return verifyLane(qaLane);
  } catch (error) {
    throw createLanePreservationError(error, `${phase}_failed`);
  }
}

function cleanupQaLane(qaLane) {
  const cleaned = runQaLaneHelper("cleanup", [
    "--lane",
    qaLane.lane,
    "--owner",
    qaLane.owner,
    "--expected-real-sha256",
    qaLane.realInventorySha256,
  ]);
  return validateCleanedLanePayload(cleaned, qaLane);
}

function markLaneVerificationFailure(result, error) {
  return {
    ...result,
    ok: false,
    status: "qa_lane_verification_failed",
    qaLaneVerificationDiagnostic: safeErrorText(error),
    containmentBreached: true,
  };
}

function requestGracefulShutdown(signal) {
  const repeatedSignal = requestedShutdownSignal !== "";
  if (requestedShutdownSignal === "") {
    requestedShutdownSignal = signal;
  }
  if (activePreparationAbortController !== null) {
    activePreparationAbortController.abort(new Error(`interrupted by ${signal}`));
  }
  if (activeGodotSettlementRequest !== null) {
    activeGodotSettlementRequest(`interrupted_${signal.toLowerCase()}`, repeatedSignal);
  }
}

function buildQaLaneSummary(qaLane, lanePreservationReason = "") {
  if (qaLane === null) {
    return null;
  }
  const preflight = qaLane.godotPreflight || null;
  return {
    containmentScope: CONTAINMENT_SCOPE,
    lane: qaLane.lane,
    feature: qaLane.feature,
    customUserDirName: qaLane.customUserDirName,
    laneRoot: qaLane.godotLaneRoot,
    realRoot: qaLane.godotRealRoot,
    realBeforeSha256: qaLane.realInventorySha256,
    reclaimStatus: qaLane.reclaim?.status || null,
    reclaimPriorStatus: qaLane.reclaim?.priorStatus || null,
    reclaimSchemaVersion: qaLane.reclaim?.lockSchemaVersion ?? null,
    reclaimRunnerPid: qaLane.reclaim?.runnerPid ?? null,
    lanePreservationReason: lanePreservationReason || null,
    initialVerifiedRealSha256: qaLane.initialVerification?.realInventorySha256 || null,
    initialVerifiedLaneSha256: qaLane.initialVerification?.laneInventorySha256 || null,
    godotPreflightVersion: preflight?.version || null,
    versionProbeProcessGroupClosed: preflight?.versionProbe?.processGroupClosed ?? null,
    versionProbeProcessGroupKillSent: preflight?.versionProbe?.processGroupKillSent ?? null,
    versionProbeProcessGroupResidualObserved: preflight?.versionProbe?.processGroupResidualObserved ?? null,
    versionProbeProcessGroupTermSent: preflight?.versionProbe?.processGroupTermSent ?? null,
    versionVerifiedRealSha256: preflight?.versionVerification?.realInventorySha256 || null,
    versionVerifiedLaneSha256: preflight?.versionVerification?.laneInventorySha256 || null,
    helpProbeProcessGroupClosed: preflight?.helpProbe?.processGroupClosed ?? null,
    helpProbeProcessGroupKillSent: preflight?.helpProbe?.processGroupKillSent ?? null,
    helpProbeProcessGroupResidualObserved: preflight?.helpProbe?.processGroupResidualObserved ?? null,
    helpProbeProcessGroupTermSent: preflight?.helpProbe?.processGroupTermSent ?? null,
    helpVerifiedRealSha256: preflight?.helpVerification?.realInventorySha256 || null,
    helpVerifiedLaneSha256: preflight?.helpVerification?.laneInventorySha256 || null,
  };
}

function buildRunSummary({
  endedAt,
  fatalDiagnostic,
  logPath,
  names,
  qaLaneCleanup,
  qaLaneEvidence,
  results,
  startedAt,
}) {
  const completedNames = new Set(results.map((result) => result.name));
  const skipped = names.filter((name) => !completedNames.has(name));
  const failed = results.filter((result) => !result.ok);
  const preflightProcessGroupsClosed = qaLaneEvidence === null
    || (
      qaLaneEvidence.versionProbeProcessGroupClosed !== false
      && qaLaneEvidence.helpProbeProcessGroupClosed !== false
      && qaLaneEvidence.versionProbeProcessGroupResidualObserved !== true
      && qaLaneEvidence.helpProbeProcessGroupResidualObserved !== true
    );
  const processGroupsClosed = preflightProcessGroupsClosed
    && results.every((result) => (
      result.processGroupClosed === true
      && result.processGroupResidualObserved === false
      && result.containmentBreached !== true
    ));
  const complete = (
    results.length === names.length
    && skipped.length === 0
    && fatalDiagnostic === ""
    && processGroupsClosed
    && qaLaneCleanup !== null
  );
  const runnerStatus = fatalDiagnostic !== ""
    ? "fatal"
    : (!complete ? "incomplete" : (failed.length > 0 ? "failed" : "passed"));
  return {
    startedAt,
    endedAt,
    gitSha: gitSha(),
    containmentScope: CONTAINMENT_SCOPE,
    runnerStatus,
    complete,
    selectedCount: names.length,
    completedCount: results.length,
    skippedCount: skipped.length,
    skipped,
    passedCount: results.filter((result) => result.ok).length,
    failedCount: failed.length,
    failed: failed.map((result) => result.name),
    processGroupsClosed,
    fatalDiagnostic,
    qaLane: qaLaneEvidence,
    qaLaneCleanup,
    logPath: path.relative(REPO_ROOT, logPath),
    results,
  };
}

function printSummary(summary, logPath, summaryPath) {
  const results = summary.results;
  const passed = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);
  const elapsedMs = Date.parse(summary.endedAt) - Date.parse(summary.startedAt);
  console.log("");
  console.log("Godot auto-check summary");
  console.log(
    `runner_status=${summary.runnerStatus} complete=${summary.complete} completed=${summary.completedCount} selected=${summary.selectedCount} skipped=${summary.skippedCount} passed=${passed.length} failed=${failed.length} elapsed_ms=${elapsedMs}`,
  );
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
  if (!summary.complete || summary.fatalDiagnostic !== "") {
    console.log("");
    console.log(`incomplete_reason=${summary.fatalDiagnostic || `skipped=${summary.skipped.join(",")}`}`);
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
  if (names.length === 0) {
    console.log("No Godot checks selected.");
    return;
  }
  const startedAt = new Date().toISOString();
  const stamp = nowStamp();
  let logPath = "";
  let summaryPath = "";
  let logStream = null;
  const results = [];
  let qaLane = null;
  let qaLaneReclaim = null;
  let qaLaneCleanup = null;
  let fatalDiagnostic = "";
  let laneCleanupSafe = true;
  let lanePreservationReason = "";
  requestedShutdownSignal = "";
  const signalHandlers = new Map();
  const handledSignals = process.platform === "win32" ? ["SIGINT", "SIGTERM"] : ["SIGINT", "SIGTERM", "SIGHUP"];
  for (const signal of handledSignals) {
    const handler = () => requestGracefulShutdown(signal);
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (error) => {
      process.exitCode = 1;
      requestGracefulShutdown(
        safeThrowableProperty(error, "code", "") === "EPIPE"
          ? "OUTPUT_PIPE_CLOSED"
          : "OUTPUT_STREAM_ERROR",
      );
    });
  }
  try {
    const qaLaneOwner = randomBytes(16).toString("hex");
    const qaLaneOwnerSha256 = createHash("sha256").update(qaLaneOwner, "ascii").digest("hex");
    writeProcessEvidence(`qa_lane_prepare_owner_sha256=${qaLaneOwnerSha256}\n`);
    validateQaLaneSourceContract();
    qaLaneReclaim = reclaimStaleQaLane();
    qaLane = prepareQaLane(process.env, qaLaneOwner);
    qaLane.reclaim = qaLaneReclaim;
    options.qaLane = qaLane;
    options.outputDir = validateQaOutputDirectory(options.outputDir, qaLane);
    fs.mkdirSync(options.outputDir, {recursive: true});
    logPath = path.join(options.outputDir, `${stamp}.log`);
    summaryPath = path.join(options.outputDir, `${stamp}_summary.json`);
    logStream = createSynchronousLog(logPath);
    writeLogOrThrow(logStream, "Beastbound Godot auto checks\n");
    writeLogOrThrow(logStream, `started_at=${startedAt}\n`);
    writeLogOrThrow(logStream, `git_sha=${gitSha()}\n`);
    writeLogOrThrow(logStream, `count=${names.length}\n`);
    writeLogOrThrow(logStream, `qa_lane=${qaLane.lane}\n`);
    writeLogOrThrow(logStream, `qa_lane_root=${qaLane.godotLaneRoot}\n`);
    writeLogOrThrow(logStream, `qa_lane_feature=${qaLane.feature}\n`);
    writeLogOrThrow(logStream, `real_user_data_root=${qaLane.godotRealRoot}\n`);
    writeLogOrThrow(logStream, `real_user_data_before_sha256=${qaLane.realInventorySha256}\n`);
    writeLogOrThrow(
      logStream,
      `qa_lane_reclaim_status=${qaLaneReclaim.status} prior_status=${qaLaneReclaim.priorStatus || "absent"} schema=${qaLaneReclaim.lockSchemaVersion ?? 0}\n`,
    );
    qaLane.initialVerification = verifyQaLaneOrPreserve(qaLane, "initial_lane_verification");
    writeLogOrThrow(logStream, `qa_lane_initial_verified real_sha256=${qaLane.initialVerification.realInventorySha256} lane_sha256=${qaLane.initialVerification.laneInventorySha256}\n`);
    qaLane.godotPreflight = await preflightGodotEditorBinary(options.godot, qaLane);
    writeLogOrThrow(logStream, `godot_preflight_version=${qaLane.godotPreflight.version}\n`);
    writeLogOrThrow(logStream, `qa_lane_version_verified real_sha256=${qaLane.godotPreflight.versionVerification.realInventorySha256} lane_sha256=${qaLane.godotPreflight.versionVerification.laneInventorySha256}\n`);
    writeLogOrThrow(logStream, `qa_lane_help_verified real_sha256=${qaLane.godotPreflight.helpVerification.realInventorySha256} lane_sha256=${qaLane.godotPreflight.helpVerification.laneInventorySha256}\n`);
    for (let index = 0; index < names.length; index += 1) {
      if (requestedShutdownSignal !== "") {
        fatalDiagnostic = `interrupted by ${requestedShutdownSignal}`;
        break;
      }
      const check = buildCheck(names[index], index + 1, names.length, options);
      await prepareCheck(check, options, logStream);
      if (requestedShutdownSignal !== "") {
        fatalDiagnostic = `interrupted by ${requestedShutdownSignal}`;
        break;
      }
      let result = await runCheck(check, options, logStream);
      if (result.processGroupClosed === false || result.processGroupResidualObserved === true) {
        laneCleanupSafe = false;
        lanePreservationReason = result.processGroupClosed === false
          ? "process_group_residual"
          : "process_group_residual_reaped";
        fatalDiagnostic = `process group containment failed for ${check.name}; owned lane preserved`;
        results.push(result);
        break;
      }
      if (result.containmentBreached === true) {
        laneCleanupSafe = false;
        lanePreservationReason = result.lanePreservationReason || result.status || "containment_unknown";
        fatalDiagnostic = result.processGroupDiagnostic || `QA lane containment became unknown for ${check.name}`;
        results.push(result);
        break;
      }
      let verification = null;
      try {
        verification = verifyQaLaneOrPreserve(qaLane, `post_check_${check.name}`);
        result.qaLaneVerification = verification;
      } catch (error) {
        result = markLaneVerificationFailure(result, error);
        laneCleanupSafe = false;
        const preservedReason = safeThrowableProperty(error, "lanePreservationReason", "");
        lanePreservationReason = typeof preservedReason === "string" && preservedReason !== ""
          ? preservedReason
          : "qa_lane_verification_failed";
      }
      if (verification !== null) {
        try {
          writeLogOrThrow(logStream, `qa_lane_verified check=${check.name} real_sha256=${verification.realInventorySha256} lane_sha256=${verification.laneInventorySha256}\n`);
        } catch (error) {
          result = {
            ...result,
            containmentBreached: true,
            lanePreservationReason: "post_check_log_io_error",
            logIoDiagnostic: safeErrorText(error),
            ok: false,
            status: "log_io_error",
          };
          laneCleanupSafe = false;
          lanePreservationReason = "post_check_log_io_error";
        }
      }
      results.push(result);
      if (result.containmentBreached === true) {
        fatalDiagnostic = result.qaLaneVerificationDiagnostic
          || result.logIoDiagnostic
          || `QA lane containment failed for ${check.name}`;
        break;
      }
      if (requestedShutdownSignal !== "") {
        fatalDiagnostic = `interrupted by ${requestedShutdownSignal}`;
        break;
      }
      if (!result.ok && options.failFast) {
        break;
      }
    }
  } catch (error) {
    fatalDiagnostic = safeErrorText(error);
    if (safeThrowableProperty(error, "preserveQaLane", false) === true) {
      laneCleanupSafe = false;
      const preservedReason = safeThrowableProperty(error, "lanePreservationReason", "");
      lanePreservationReason = typeof preservedReason === "string" && preservedReason !== ""
        ? preservedReason
        : "process_group_residual";
    }
    if (logStream !== null) {
      logStream.write(`fatal=${fatalDiagnostic}\n`);
    }
  } finally {
    if (qaLane !== null && laneCleanupSafe) {
      try {
        qaLaneCleanup = cleanupQaLane(qaLane);
        if (logStream !== null) {
          logStream.write(`qa_lane_cleanup=passed lane_absent=true real_sha256=${qaLaneCleanup.realInventorySha256}\n`);
        }
      } catch (error) {
        const cleanupDiagnostic = safeErrorText(error);
        lanePreservationReason = "cleanup_failed";
        fatalDiagnostic = fatalDiagnostic === "" ? cleanupDiagnostic : `${fatalDiagnostic}\ncleanup: ${cleanupDiagnostic}`;
        if (logStream !== null) {
          logStream.write(`qa_lane_cleanup=failed error=${cleanupDiagnostic}\n`);
        }
      }
    } else if (qaLane !== null) {
      if (logStream !== null) {
        logStream.write(`qa_lane_cleanup=skipped reason=${lanePreservationReason || "containment_unknown"} lane_preserved=true\n`);
      }
    }
    if (requestedShutdownSignal !== "" && fatalDiagnostic === "") {
      fatalDiagnostic = `interrupted by ${requestedShutdownSignal}`;
    }
    for (const [signal, handler] of signalHandlers.entries()) {
      process.removeListener(signal, handler);
    }
    if (logStream !== null) {
      logStream.close();
      if (logStream.error !== null) {
        const logDiagnostic = safeErrorText(logStream.error);
        fatalDiagnostic = fatalDiagnostic === "" ? logDiagnostic : `${fatalDiagnostic}\nlog: ${logDiagnostic}`;
      }
    }
  }
  if (logStream === null) {
    console.error(fatalDiagnostic || "QA lane output initialization failed");
    process.exitCode = 1;
    return;
  }
  const endedAt = new Date().toISOString();
  const qaLaneEvidence = buildQaLaneSummary(qaLane, lanePreservationReason);
  const summary = buildRunSummary({
    startedAt,
    endedAt,
    names,
    results,
    fatalDiagnostic,
    qaLaneEvidence,
    qaLaneCleanup,
    logPath,
  });
  writeExclusiveFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  printSummary(summary, logPath, summaryPath);
  if (
    summary.runnerStatus !== "passed"
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(safeErrorText(error));
    process.exitCode = 1;
  });
}

export {
  autoCheckCompletionContract,
  buildCheck,
  buildGodotLaneEnvironment,
  buildQaLaneSummary,
  buildRunSummary,
  createLanePreservationError,
  createSynchronousLog,
  descendantProcessIds,
  discoverAutoCheckFlags,
  ensureStartupLoginAccount,
  ensureProcessGroupClosed,
  expectedAutoCompletionPrefix,
  godotCompileFailureDiagnostic,
  makeResult,
  parseAutoCheckCompletion,
  parseLaneHelperOutput,
  parseQaLaneAttestation,
  postAuthJson,
  preflightGodotEditorBinary,
  prepareCheck,
  processGroupClosureEvidence,
  requestGracefulShutdown,
  reclaimStaleQaLane,
  runCheck,
  runGodotPreflightProbe,
  safeErrorText,
  safeThrowableProperty,
  terminateWindowsProcessIds,
  validateCleanedLanePayload,
  validatePreparedLanePayload,
  validateQaOutputDirectory,
  validateRecoveredLanePayload,
  validateStaleLaneInspectionPayload,
  validateStaleLaneRecoveryPayload,
  validateQaLaneSourceContract,
  validateVerifiedLanePayload,
  verifyQaLaneOrPreserve,
  writeExclusiveFile,
  writeLogOrThrow,
  writeProcessEvidence,
};
