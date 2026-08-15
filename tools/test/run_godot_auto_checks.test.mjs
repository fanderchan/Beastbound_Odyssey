import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import fs from "node:fs";
import path from "node:path";
import {PassThrough} from "node:stream";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {
  autoCheckCompletionContract,
  buildCheck,
  buildGodotLaneEnvironment,
  buildQaLaneSummary,
  buildRunSummary,
  createLanePreservationError,
  createSynchronousLog,
  descendantProcessIds,
  discoverAutoCheckFlags,
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
  runCheck,
  runGodotPreflightProbe,
  safeErrorText,
  safeThrowableProperty,
  validateCleanedLanePayload,
  validatePreparedLanePayload,
  validateQaOutputDirectory,
  validateRecoveredLanePayload,
  validateQaLaneSourceContract,
  validateVerifiedLanePayload,
  verifyQaLaneOrPreserve,
  writeExclusiveFile,
  writeLogOrThrow,
  writeProcessEvidence,
} from "../run_godot_auto_checks.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function scriptSourceTree(root) {
  const chunks = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".gd")) {
        chunks.push(fs.readFileSync(fullPath, "utf8"));
      }
    }
  };
  visit(root);
  return chunks.join("\n");
}

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

test("exit-zero completion cannot mask column-zero or indented Godot runtime failures", () => {
  for (const diagnostic of [
    "ERROR: Failed loading resource: res://missing.tres.",
    "  ERROR: injected fatal runtime failure",
    "\tFATAL: injected fatal runtime failure",
    " FATAL ERROR: injected fatal runtime failure",
  ]) {
    const result = makeResult(
      runtimeCheck(),
      10,
      0,
      "",
      `${passingRuntimeOutput()}${diagnostic}\n`,
      false,
      preparedLane,
    );
    assert.equal(result.ok, false, diagnostic);
    assert.equal(result.status, "runtime_error", diagnostic);
    assert.equal(result.runtimeDiagnostic, diagnostic, diagnostic);
    assert.equal(result.completionStatus, "ok", diagnostic);
    assert.equal(result.qaLaneDiagnostic, "", diagnostic);
  }
});

test("non-diagnostic ERROR text and narrated compile words remain accepted", () => {
  for (const benign of [
    "completion evidence error=none",
    '{"ERROR":"structured field","items":["two words"]}',
    "narrative mentions ERROR: without claiming a Godot diagnostic",
    "ERROR_COUNT=0",
    "WARNING: optional warning text",
    "error: lowercase application text",
    "fatal: lowercase application text",
    "documentation mentions SCRIPT ERROR: as prose",
    "documentation mentions ERROR: Failed to load script res://x.gd with error Compilation failed.",
  ]) {
    const output = `${passingRuntimeOutput()}${benign}\n`;
    const result = makeResult(
      runtimeCheck(),
      10,
      0,
      "",
      output,
      false,
      preparedLane,
    );
    assert.equal(godotCompileFailureDiagnostic(output), "", benign);
    assert.equal(result.runtimeDiagnostic, "", benign);
    assert.equal(result.ok, true, benign);
    assert.equal(result.status, "ok", benign);
  }
});

test("raw thrown values and frozen closure evidence are normalized without mutation", () => {
  const throwingValue = {};
  Object.defineProperties(throwingValue, {
    message: {get() { throw new Error("message getter must not escape"); }},
    stack: {get() { throw new Error("stack getter must not escape"); }},
  });
  assert.equal(safeErrorText(null), "null");
  assert.equal(safeErrorText(undefined), "undefined");
  assert.equal(safeErrorText("raw string"), "raw string");
  assert.equal(safeErrorText(Object.freeze({message: "frozen message"})), "frozen message");
  assert.equal(safeErrorText(throwingValue), "<unreadable thrown value>");
  assert.equal(safeThrowableProperty(throwingValue, "message", "fallback"), "fallback");

  const frozenClosure = Object.freeze({
    closed: true,
    killSent: false,
    residualObserved: false,
    termSent: false,
  });
  const normalizedClosure = processGroupClosureEvidence(frozenClosure);
  assert.notEqual(normalizedClosure, frozenClosure);
  assert.deepEqual(normalizedClosure, frozenClosure);
  normalizedClosure.termSent = true;
  assert.equal(frozenClosure.termSent, false);
  for (const invalidEvidence of [
    null,
    {closed: true, killSent: false, residualObserved: false, termSent: "false"},
    {...frozenClosure, extra: false},
    Object.defineProperty({}, "closed", {get() { throw new Error("closure getter"); }}),
  ]) {
    assert.throws(
      () => processGroupClosureEvidence(invalidEvidence),
      /process-group closure must provide exact boolean evidence/,
    );
  }

  const wrapped = createLanePreservationError(
    Object.freeze({message: "frozen verification", lanePreservationReason: "source_reason"}),
    "fallback_reason",
  );
  assert.equal(Object.isExtensible(wrapped), true);
  assert.equal(wrapped.preserveQaLane, true);
  assert.equal(wrapped.lanePreservationReason, "source_reason");
  assert.match(wrapped.message, /frozen verification/);
});

const preparedLane = Object.freeze({
  lane: "automation",
  feature: "beastbound_qa_automation",
  customUserDirName: "BeastboundOdysseyQA_Automation",
  godotLaneRoot: "/Users/qa/Library/Application Support/BeastboundOdysseyQA_Automation",
  editorCustomFeatures: "existing_feature,beastbound_qa_automation",
});

function qaAttestationMarker() {
  return `BEASTBOUND_QA_USER_DATA_ATTESTATION: ${JSON.stringify({
    customUserDirName: preparedLane.customUserDirName,
    feature: preparedLane.feature,
    lane: preparedLane.lane,
    status: "passed",
    userDataRoot: preparedLane.godotLaneRoot,
  })}`;
}

function cleanProbeClosure() {
  return {
    processGroupClosed: true,
    processGroupKillSent: false,
    processGroupResidualObserved: false,
    processGroupTermSent: false,
  };
}

test("main checks carry the expected fixed lane marker after the Godot separator", () => {
  const built = buildCheck("--auto-map-panel-check", 1, 1, {godot: "godot"});
  const separator = built.args.indexOf("--");
  assert.ok(separator >= 0);
  assert.deepEqual(
    built.args.slice(separator + 1, separator + 3),
    ["--beastbound-qa-user-data-lane=automation", "--auto-map-panel-check"],
  );
  const parse = buildCheck("godot-parse", 1, 1, {godot: "godot"});
  assert.deepEqual(parse.args.slice(-2), ["--", "--beastbound-qa-user-data-lane=automation"]);
  assert.equal(parse.requiresQaAttestation, true);
});

test("lane environment preserves HOME and existing features while adding fixed attestation markers", () => {
  const base = {
    HOME: "/Users/qa",
    PATH: "/usr/bin",
    GODOT_EDITOR_CUSTOM_FEATURES: "existing_feature",
  };
  const environment = buildGodotLaneEnvironment(base, preparedLane);
  assert.equal(environment.HOME, base.HOME);
  assert.equal(environment.PATH, base.PATH);
  assert.equal(environment.GODOT_EDITOR_CUSTOM_FEATURES, preparedLane.editorCustomFeatures);
  assert.equal(environment.BEASTBOUND_QA_USER_DATA_LANE, "automation");
  assert.equal(environment.BEASTBOUND_QA_EXPECTED_USER_DATA_ROOT, preparedLane.godotLaneRoot);
  assert.deepEqual(base, {
    HOME: "/Users/qa",
    PATH: "/usr/bin",
    GODOT_EDITOR_CUSTOM_FEATURES: "existing_feature",
  });
});

test("QA output directory stays under the fixed report root and never intersects user data", (t) => {
  const fixedRoot = path.join(repoRoot, ".run/godot_auto_checks");
  const requested = path.join(fixedRoot, "unit-safe");
  const qaLane = {laneRoot: "/tmp/qa-lane", realRoot: "/tmp/player-root"};
  assert.equal(validateQaOutputDirectory(requested, qaLane), requested);
  assert.throws(() => validateQaOutputDirectory(path.join(repoRoot, "outside"), qaLane));
  assert.throws(() => validateQaOutputDirectory(requested, {...qaLane, realRoot: fixedRoot}));
  assert.throws(() => validateQaOutputDirectory(requested, {...qaLane, laneRoot: requested}));

  fs.mkdirSync(fixedRoot, {recursive: true});
  const target = fs.mkdtempSync(path.join(repoRoot, ".run/qa-output-target-"));
  const link = path.join(fixedRoot, `symlink-${process.pid}`);
  let linked = false;
  try {
    fs.symlinkSync(target, link, "dir");
    linked = true;
    assert.throws(() => validateQaOutputDirectory(path.join(link, "child"), qaLane));
  } catch (error) {
    if (error && ["EACCES", "EPERM", "UNKNOWN"].includes(error.code)) {
      t.diagnostic(`symlink privilege unavailable: ${error.message}`);
    } else {
      throw error;
    }
  } finally {
    if (linked) {
      fs.unlinkSync(link);
    }
    fs.rmSync(target, {recursive: true, force: true});
  }
});

test("log and summary writers are exclusive, symlink-safe, and complete short writes", (t) => {
  fs.mkdirSync(path.join(repoRoot, ".run"), {recursive: true});
  const directory = fs.mkdtempSync(path.join(repoRoot, ".run/qa-exclusive-writer-"));
  const file = path.join(directory, "result.json");
  const link = path.join(directory, "result-link.json");
  const originalWriteSync = fs.writeSync;
  try {
    let partialWrites = 0;
    fs.writeSync = (descriptor, buffer, offset, length) => {
      partialWrites += 1;
      return originalWriteSync(descriptor, buffer, offset, Math.min(2, length));
    };
    writeExclusiveFile(file, "abcdef");
    fs.writeSync = originalWriteSync;
    assert.equal(fs.readFileSync(file, "utf8"), "abcdef");
    assert.ok(partialWrites >= 3);
    assert.throws(() => writeExclusiveFile(file, "overwrite"), /EEXIST/);
    try {
      fs.symlinkSync(file, link);
      assert.throws(() => createSynchronousLog(link), /EEXIST/);
    } catch (error) {
      if (error && ["EACCES", "EPERM", "UNKNOWN"].includes(error.code)) {
        t.diagnostic(`symlink privilege unavailable: ${error.message}`);
      } else {
        throw error;
      }
    }
  } finally {
    fs.writeSync = originalWriteSync;
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test("lane owner evidence is synchronously complete before prepare can run", () => {
  fs.mkdirSync(path.join(repoRoot, ".run"), {recursive: true});
  const directory = fs.mkdtempSync(path.join(repoRoot, ".run/qa-owner-evidence-"));
  const evidencePath = path.join(directory, "owner.log");
  const descriptor = fs.openSync(evidencePath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  const originalWriteSync = fs.writeSync;
  let writeCount = 0;
  try {
    fs.writeSync = (fd, buffer, offset, length) => {
      writeCount += 1;
      return originalWriteSync(fd, buffer, offset, Math.min(3, length));
    };
    writeProcessEvidence("qa_lane_prepare_owner=0123456789abcdef0123456789abcdef\n", descriptor);
  } finally {
    fs.writeSync = originalWriteSync;
    fs.closeSync(descriptor);
  }
  assert.ok(writeCount > 1);
  assert.equal(
    fs.readFileSync(evidencePath, "utf8"),
    "qa_lane_prepare_owner=0123456789abcdef0123456789abcdef\n",
  );
  const runnerSource = fs.readFileSync(path.join(repoRoot, "tools/run_godot_auto_checks.mjs"), "utf8");
  const mainStart = runnerSource.indexOf("async function main() {");
  const ownerIndex = runnerSource.indexOf('const qaLaneOwner = randomBytes(16).toString("hex");', mainStart);
  const evidenceIndex = runnerSource.indexOf("writeProcessEvidence(`qa_lane_prepare_owner=${qaLaneOwner}\\n`);", ownerIndex);
  const sourceCheckIndex = runnerSource.indexOf("validateQaLaneSourceContract();", evidenceIndex);
  const prepareIndex = runnerSource.indexOf("qaLane = prepareQaLane(process.env, qaLaneOwner);", sourceCheckIndex);
  assert.ok(
    mainStart >= 0
    && ownerIndex > mainStart
    && evidenceIndex > ownerIndex
    && sourceCheckIndex > evidenceIndex
    && prepareIndex > sourceCheckIndex,
  );
  fs.rmSync(directory, {recursive: true, force: true});
});

test("lane source-check is exact and runs before any prepare mutation", () => {
  const calls = [];
  const result = validateQaLaneSourceContract({
    runQaLaneHelper: (command, args) => {
      calls.push([command, args]);
      return {status: "source_contract_passed"};
    },
  });
  assert.equal(result.status, "source_contract_passed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "source-check");
  assert.deepEqual(calls[0][1].slice(0, 1), ["--repo-root"]);
  for (const payload of [
    {status: "failed"},
    {extra: true, status: "source_contract_passed"},
  ]) {
    assert.throws(() => validateQaLaneSourceContract({runQaLaneHelper: () => payload}));
  }
});

test("Godot lane preflight verifies the lane immediately after version and help probes", async () => {
  const qaLane = {
    environment: {HOME: "/Users/qa", GODOT_EDITOR_CUSTOM_FEATURES: "beastbound_qa_automation"},
  };
  const calls = [];
  const runProbe = async (_command, args) => {
    calls.push(`probe:${args[0]}`);
    return {
      exitCode: 0,
      failureReason: "",
      output: args[0] === "--version"
        ? "4.7.stable.official\n"
        : "\x1b[92m-e, --editor                     \x1b[1;91mE\x1b[0m Start the editor.\r\n"
          + "\x1b[92m-p, --project-manager            \x1b[0m Start the project manager.\r\n",
      ...cleanProbeClosure(),
      signalOrError: "",
      timedOut: false,
    };
  };
  const verifyQaLane = () => {
    calls.push("verify");
    return {laneInventorySha256: "a".repeat(64), realInventorySha256: "b".repeat(64)};
  };
  const preflight = await preflightGodotEditorBinary("godot", qaLane, {runProbe, verifyQaLane});
  assert.match(preflight.version, /^4\.7/);
  assert.deepEqual(calls, ["probe:--version", "verify", "probe:--help", "verify"]);

  calls.length = 0;
  await assert.rejects(
    preflightGodotEditorBinary("godot", qaLane, {
      runProbe: async () => ({
        exitCode: 0,
        failureReason: "",
        output: "4.6.stable\n",
        ...cleanProbeClosure(),
        signalOrError: "",
        timedOut: false,
      }),
      verifyQaLane,
    }),
    /verified Godot 4\.7/,
  );
  assert.deepEqual(calls, ["verify"]);

  await assert.rejects(
    preflightGodotEditorBinary("godot", qaLane, {
      runProbe: async (_command, args) => ({
        exitCode: 0,
        failureReason: "",
        output: args[0] === "--version"
          ? "4.7.stable.official\n"
          : "--editorial\n--editor-pseudolocalization\n--project-manager-disabled\n"
            + "Some other option. Implies --editor.\n",
        ...cleanProbeClosure(),
        signalOrError: "",
        timedOut: false,
      }),
      verifyQaLane,
    }),
    /tools-enabled/,
  );

  for (const forgedHelp of [
    "\x1b[92mGodot editor description: use --editor\x1b[0m\n"
      + "\x1b[92mProject manager description: use --project-manager\x1b[0m\n",
    "\x1b[92-e, --editor\n\x1b[92-p, --project-manager\n",
    "\x1b]0;editor\x07-e, --editor\n\x1b]0;project-manager\x07-p, --project-manager\n",
    "\x1b[92m-e, --ed\x1b[0mitor\n\x1b[92m-p, --project-\x1b[0mmanager\n",
    "\r-e, --editor\n\r-p, --project-manager\n",
    "--editor\rdescription\n--project-manager\rdescription\n",
    "\u000b-e, --editor\n\u000c-p, --project-manager\n",
    "\u009b92m-e, --editor\n\u009dproject-manager\u009c-p, --project-manager\n",
    "\u00a0-e, --editor\n\u2028-p, --project-manager\n",
    "-e, --editor\u2029description\n-p, --project-manager\ufeffdescription\n",
    "\u202e-e, --editor\n\u2066-p, --project-manager\n",
  ]) {
    await assert.rejects(
      preflightGodotEditorBinary("godot", qaLane, {
        runProbe: async (_command, args) => ({
          exitCode: 0,
          failureReason: "",
          output: args[0] === "--version" ? "4.7.stable.official\n" : forgedHelp,
          ...cleanProbeClosure(),
          signalOrError: "",
          timedOut: false,
        }),
        verifyQaLane,
      }),
      /tools-enabled/,
    );
  }

  for (const failingVerificationCall of [1, 2]) {
    let verificationCalls = 0;
    await assert.rejects(
      preflightGodotEditorBinary("godot", qaLane, {
        runProbe,
        verifyQaLane: () => {
          verificationCalls += 1;
          if (verificationCalls === failingVerificationCall) {
            throw new Error(`verification drift ${failingVerificationCall}`);
          }
          return {laneInventorySha256: "a".repeat(64), realInventorySha256: "b".repeat(64)};
        },
      }),
      (error) => (
        error.preserveQaLane === true
        && /post_(version|help)_lane_verification_failed/.test(error.lanePreservationReason)
      ),
    );
  }

  const throwingVerification = {};
  Object.defineProperties(throwingVerification, {
    message: {get() { throw new Error("message getter must not escape"); }},
    stack: {get() { throw new Error("stack getter must not escape"); }},
  });
  for (const [failingVerificationCall, expectedPhase] of [
    [1, "post_version_lane_verification_failed"],
    [2, "post_help_lane_verification_failed"],
  ]) {
    for (const raw of [
      null,
      undefined,
      "raw preflight verification failure",
      Object.freeze(new Error("frozen preflight verification")),
      throwingVerification,
    ]) {
      let verificationCalls = 0;
      await assert.rejects(
        preflightGodotEditorBinary("godot", qaLane, {
          runProbe,
          verifyQaLane: () => {
            verificationCalls += 1;
            if (verificationCalls === failingVerificationCall) {
              throw raw;
            }
            return {laneInventorySha256: "a".repeat(64), realInventorySha256: "b".repeat(64)};
          },
        }),
        (error) => (
          error instanceof Error
          && Object.isExtensible(error)
          && error.cause === raw
          && error.preserveQaLane === true
          && error.lanePreservationReason === expectedPhase
        ),
      );
    }
  }

  await assert.rejects(
    preflightGodotEditorBinary("godot", qaLane, {
      runProbe: async (_command, args) => ({
        exitCode: 0,
        failureReason: "",
        output: args[0] === "--version" ? "4.7.stable.official\n" : "--editor\n--project-manager\n",
        ...cleanProbeClosure(),
        processGroupResidualObserved: true,
        processGroupTermSent: true,
        signalOrError: "",
        timedOut: false,
      }),
      verifyQaLane,
    }),
    (error) => error.preserveQaLane === true && /version_probe_process_group_containment_failed/.test(error.lanePreservationReason),
  );
  for (const invalidEvidence of [
    {timedOut: true},
    {signalOrError: "SIGTERM"},
    {failureReason: "version_probe_output_limit"},
    {processGroupTermSent: true},
    {processGroupKillSent: true},
  ]) {
    let verificationCalled = false;
    await assert.rejects(
      preflightGodotEditorBinary("godot", qaLane, {
        runProbe: async () => ({
          exitCode: 0,
          failureReason: "",
          output: "4.7.stable.official\n",
          ...cleanProbeClosure(),
          signalOrError: "",
          timedOut: false,
          ...invalidEvidence,
        }),
        verifyQaLane: () => {
          verificationCalled = true;
          return {};
        },
      }),
      /did not prove a naturally closed process group/,
    );
    assert.equal(verificationCalled, false);
  }
});

test("each Godot preflight probe closes its process group before returning", async () => {
  const child = fakeChild(4101);
  let preflightSpawnOptions = null;
  const resultPromise = runGodotPreflightProbe("godot", ["--version"], {}, "version", {
    spawn: (_command, _args, options) => {
      preflightSpawnOptions = options;
      queueMicrotask(() => {
        child.stdout.write("4.7.stable.official\n");
        child.emit("close", 0, null);
      });
      return child;
    },
    ensureProcessGroupClosed: async () => closedProcessGroup(),
  });
  const result = await resultPromise;
  assert.equal(result.processGroupClosed, true);
  assert.equal(result.exitCode, 0);
  assert.match(result.output, /^4\.7/);
  assert.equal(preflightSpawnOptions.detached, true);
  assert.deepEqual(preflightSpawnOptions.stdio, ["ignore", "pipe", "pipe"]);

  const residualChild = fakeChild(4102);
  await assert.rejects(
    runGodotPreflightProbe("godot", ["--help"], {}, "help", {
      spawn: () => {
        queueMicrotask(() => residualChild.emit("close", 0, null));
        return residualChild;
      },
      ensureProcessGroupClosed: async () => openProcessGroup(),
    }),
    (error) => error.preserveQaLane === true && error.processGroupClosed === false,
  );

  const rejectedCloseChild = fakeChild(4103);
  await assert.rejects(
    runGodotPreflightProbe("godot", ["--help"], {}, "help", {
      spawn: () => {
        queueMicrotask(() => rejectedCloseChild.emit("close", 0, null));
        return rejectedCloseChild;
      },
      ensureProcessGroupClosed: async () => { throw new Error("close probe failed"); },
    }),
    (error) => error.preserveQaLane === true && /close probe failed/.test(error.message),
  );
});

test("Godot preflight probes fail closed on timeout, output cap, and spawn errors", async () => {
  const timeoutChild = fakeChild(4110);
  await assert.rejects(
    runGodotPreflightProbe("godot", ["--version"], {}, "version", {
      spawn: () => timeoutChild,
      terminateProcessGroup: () => true,
      ensureProcessGroupClosed: async () => closedProcessGroup(),
      timeoutMs: 1,
      settlementGraceMs: 1,
      forcedSettlementMs: 2,
    }),
    (error) => (
      error.preserveQaLane === true
      && error.probeEvidence?.timedOut === true
      && error.probeEvidence?.failureReason === "version_probe_timeout"
      && error.probeEvidence?.processGroupTermSent === true
      && error.probeEvidence?.processGroupKillSent === true
    ),
  );

  const outputChild = fakeChild(4111);
  const outputPromise = runGodotPreflightProbe("godot", ["--help"], {}, "help", {
    spawn: () => {
      queueMicrotask(() => {
        outputChild.stdout.write("too much output");
        outputChild.emit("close", 0, null);
      });
      return outputChild;
    },
    terminateProcessGroup: () => true,
    ensureProcessGroupClosed: async () => closedProcessGroup(),
    maxOutputBytes: 4,
  });
  const output = await outputPromise;
  assert.equal(output.failureReason, "help_probe_output_limit");

  const errorChild = fakeChild(4112);
  const spawnErrorPromise = runGodotPreflightProbe("godot", ["--version"], {}, "version", {
    spawn: () => {
      queueMicrotask(() => errorChild.emit("error", new Error("preflight spawn failed")));
      return errorChild;
    },
    ensureProcessGroupClosed: async () => closedProcessGroup(),
  });
  const spawnError = await spawnErrorPromise;
  assert.equal(spawnError.exitCode, null);
  assert.match(spawnError.signalOrError, /preflight spawn failed/);

  await assert.rejects(
    runGodotPreflightProbe("godot", ["--version"], {}, "version", {
      spawn: () => { throw new Error("synchronous preflight spawn failed"); },
    }),
    (error) => (
      error.probeEvidence?.processGroupClosed === true
      && error.probeEvidence?.failureReason === "spawn_error"
      && /synchronous preflight spawn failed/.test(error.message)
    ),
  );
});

test("post-spawn preflight listener setup errors settle the group and preserve the lane", async () => {
  for (const [index, raw] of [new Error("listener setup BaseException"), null].entries()) {
    const child = fakeChild(4120 + index);
    let closeCalls = 0;
    let termCalls = 0;
    child.stdout.on = () => { throw raw; };
    await assert.rejects(
      runGodotPreflightProbe("godot", ["--version"], {}, "version", {
        spawn: () => child,
        terminateProcessGroup: () => { termCalls += 1; return true; },
        ensureProcessGroupClosed: async () => { closeCalls += 1; return closedProcessGroup(); },
        groupCloseTimeoutMs: 20,
      }),
      (error) => (
        error.preserveQaLane === true
        && error.lanePreservationReason === "version_probe_post_spawn_setup_error"
        && error.probeEvidence?.processGroupTermSent === true
      ),
    );
    assert.ok(termCalls >= 1);
    assert.ok(closeCalls >= 1);
  }
});

test("a real preflight leader exit with a live same-group descendant is reaped and preserved", async () => {
  const script = [
    'const {spawn} = require("node:child_process");',
    'const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {stdio: "inherit"});',
    "descendant.unref();",
    'process.stdout.write("4.7.stable.official\\n");',
  ].join("\n");
  await assert.rejects(
    runGodotPreflightProbe(process.execPath, ["-e", script], process.env, "version", {
      timeoutMs: 5000,
    }),
    (error) => (
      error.preserveQaLane === true
      && error.processGroupClosed === true
      && error.probeEvidence?.processGroupResidualObserved === true
      && error.probeEvidence?.failureReason === "version_probe_process_group_residual_reaped"
    ),
  );
});

test("lane verification drift always requests preservation before cleanup", () => {
  const drift = new Error("real root drift");
  assert.throws(
    () => verifyQaLaneOrPreserve({}, "post_check_map", {
      verifyQaLane: () => { throw drift; },
    }),
    (error) => (
      error !== drift
      && error.cause === drift
      && error.preserveQaLane === true
      && error.lanePreservationReason === "post_check_map_failed"
    ),
  );
  const throwingValue = {};
  Object.defineProperties(throwingValue, {
    message: {get() { throw new Error("message getter must not escape"); }},
    stack: {get() { throw new Error("stack getter must not escape"); }},
  });
  const rawThrowables = [
    null,
    undefined,
    "raw verification failure",
    Object.freeze(new Error("frozen error")),
    throwingValue,
  ];
  for (const phase of ["initial_lane_verification", "post_check_map"]) {
    for (const raw of rawThrowables) {
      assert.throws(
        () => verifyQaLaneOrPreserve({}, phase, {
          verifyQaLane: () => { throw raw; },
        }),
        (error) => (
          error instanceof Error
          && Object.isExtensible(error)
          && error.cause === raw
          && error.preserveQaLane === true
          && error.lanePreservationReason === `${phase}_failed`
        ),
      );
    }
  }
  const summary = buildQaLaneSummary({
    ...preparedLane,
    godotRealRoot: "/tmp/player",
    realInventorySha256: "a".repeat(64),
  }, "qa_lane_verification_failed");
  assert.equal(summary.lanePreservationReason, "qa_lane_verification_failed");
});

test("partial QA lane phases remain serializable after a preflight failure", () => {
  const summary = buildQaLaneSummary({
    ...preparedLane,
    godotRealRoot: "/tmp/player",
    realInventorySha256: "a".repeat(64),
    godotPreflight: {
      version: "",
      versionProbe: cleanProbeClosure(),
      versionVerification: null,
      helpProbe: null,
      helpVerification: null,
    },
  });
  assert.equal(summary.initialVerifiedRealSha256, null);
  assert.equal(summary.godotPreflightVersion, null);
  assert.equal(summary.versionProbeProcessGroupClosed, true);
  assert.equal(summary.helpProbeProcessGroupClosed, null);
});

test("run summary distinguishes fatal and fail-fast incompleteness from a complete run", () => {
  const names = ["godot-parse", "--auto-map-panel-check"];
  const base = {
    endedAt: "2026-08-09T00:00:01.000Z",
    fatalDiagnostic: "",
    logPath: path.join(repoRoot, ".run/godot_auto_checks/unit.log"),
    names,
    qaLaneCleanup: {status: "cleaned"},
    qaLaneEvidence: null,
    startedAt: "2026-08-09T00:00:00.000Z",
  };
  const completeResults = names.map((name) => ({
    name,
    ok: true,
    processGroupClosed: true,
    processGroupResidualObserved: false,
  }));
  const complete = buildRunSummary({...base, results: completeResults});
  assert.equal(complete.runnerStatus, "passed");
  assert.equal(complete.complete, true);
  assert.equal(complete.skippedCount, 0);
  assert.equal(complete.containmentScope, "cooperative_inherited_pgid");

  const incomplete = buildRunSummary({...base, results: completeResults.slice(0, 1)});
  assert.equal(incomplete.runnerStatus, "incomplete");
  assert.equal(incomplete.complete, false);
  assert.deepEqual(incomplete.skipped, ["--auto-map-panel-check"]);

  const fatal = buildRunSummary({...base, fatalDiagnostic: "preflight failed", results: []});
  assert.equal(fatal.runnerStatus, "fatal");
  assert.equal(fatal.failedCount, 0);
  assert.equal(fatal.completedCount, 0);
});

test("Main QA lane attestation is unique, column-zero, and exact", () => {
  const marker = qaAttestationMarker();
  assert.equal(parseQaLaneAttestation(marker, preparedLane).status, "passed");
  for (const invalid of [
    "",
    `noise ${marker}`,
    `${marker}\n${marker}`,
    marker.replace('"status":"passed"', '"status":"failed"'),
    marker.replace("BeastboundOdysseyQA_Automation", "BeastboundOdysseyQA_Client1"),
    marker.replace('"status":"passed"', '"extra":"value","status":"passed"'),
    marker.replace('"status":"passed"', '"status":"failed","st\\u0061tus":"passed"'),
    marker.replace(
      '{"customUserDirName":"BeastboundOdysseyQA_Automation","feature":"beastbound_qa_automation"',
      '{"feature":"beastbound_qa_automation","customUserDirName":"BeastboundOdysseyQA_Automation"',
    ),
  ]) {
    assert.throws(() => parseQaLaneAttestation(invalid, preparedLane));
  }
});

test("a main check cannot pass without its exact user-data attestation", () => {
  const mainCheck = Object.freeze({
    name: "--auto-map-panel-check",
    flag: "--auto-map-panel-check",
    command: "godot",
    args: ["--headless"],
  });
  const missing = makeResult(mainCheck, 10, 0, "", "status=ok\n", false, preparedLane);
  assert.equal(missing.ok, false);
  assert.equal(missing.status, "qa_lane_attestation_failed");
  assert.match(missing.qaLaneDiagnostic, /exactly one/);

  const output = [qaAttestationMarker(), "map panel check ready: status=ok"].join("\n");
  const passed = makeResult(mainCheck, 10, 0, "", output, false, preparedLane);
  assert.equal(passed.ok, true);
  assert.equal(passed.qaLaneAttestation.lane, "automation");
});

test("attestation or unrelated status text cannot replace an auto completion marker", () => {
  const mainCheck = Object.freeze({
    name: "--auto-map-panel-check",
    flag: "--auto-map-panel-check",
    command: "godot",
    args: ["--headless"],
  });
  const attestation = qaAttestationMarker();
  for (const output of [
    attestation,
    `${attestation}\nscreenshot state status=ok`,
    `${attestation}\ngame audio manager check ready: status=ok`,
  ]) {
    const result = makeResult(mainCheck, 10, 0, "", output, false, preparedLane);
    assert.equal(result.ok, false);
    assert.equal(result.status, "completion_marker_invalid");
  }
});

test("auto completion parsing rejects empty, misplaced, duplicated, and trailing status text", () => {
  for (const line of [
    "map panel check ready: this-is-not-a-result",
    "map panel check ready: garbage status=ok",
    "map panel check ready: status=ok trailing-junk",
    "map panel check ready: status=ok status=failed",
  ]) {
    assert.throws(() => parseAutoCheckCompletion(line, "--auto-map-panel-check"), line);
  }
  assert.equal(
    parseAutoCheckCompletion(
      "map panel check ready: status=ok prepared=true details=two words",
      "--auto-map-panel-check",
    ).status,
    "ok",
  );
});

test("text auto completion binds only balanced top-level evidence fields", () => {
  const taskTrackerLine = [
    "task tracker route check ready:",
    "status=ok loaded=true button=true route=true disabled_after=true reenabled=true",
    "bank_loaded=true bank_cross_map=true bank_continue=true multi_hop_contract=true",
    "planner_cache=true multi_hop_start=true multi_hop_complete=true hop_pending=true",
    "hop_continuation=true final_encounter_move=true",
    'arrivals=["shadow_oath_cavern", "shadow_oath_cavern_f2", "shadow_oath_cavern_f3", "shadow_oath_cavern_f4", "shadow_oath_cavern_f5"]',
    'trace=["before1:firebud_village_gate->shadow_oath_cavern pending=shadow_oath_cavern", "after1:shadow_oath_cavern pending=shadow_oath_cavern_f2 target=true", "before2:shadow_oath_cavern->shadow_oath_cavern_f2 pending=shadow_oath_cavern_f2", "after2:shadow_oath_cavern_f2 pending=shadow_oath_cavern_f3 target=true", "before3:shadow_oath_cavern_f2->shadow_oath_cavern_f3 pending=shadow_oath_cavern_f3", "after3:shadow_oath_cavern_f3 pending=shadow_oath_cavern_f4 target=true", "before4:shadow_oath_cavern_f3->shadow_oath_cavern_f4 pending=shadow_oath_cavern_f4", "after4:shadow_oath_cavern_f4 pending=shadow_oath_cavern_f5 target=true", "before5:shadow_oath_cavern_f4->shadow_oath_cavern_f5 pending=shadow_oath_cavern_f5", "after5:shadow_oath_cavern_f5 pending= target=true"]',
    "unreachable_cleanup=true interrupted_cleanup=true hang_load_fail_cleanup=true",
    "normal_load_fail_message=true tutorial_routes=true pending= log=地图切换失败，请重试。",
  ].join(" ");
  assert.equal(
    parseAutoCheckCompletion(taskTrackerLine, "--auto-task-tracker-route-check").status,
    "ok",
  );

  const nestedAuthorityText = [
    "map panel check ready:",
    "status=ok",
    'trace=["pending=inner status=failed success=false", {"pending":"escaped \\\"status=failed\\\""}]',
    "pending=",
    "details=two words",
    "target=(296, 190)",
  ].join(" ");
  assert.equal(
    parseAutoCheckCompletion(nestedAuthorityText, "--auto-map-panel-check").status,
    "ok",
  );
  assert.equal(
    parseAutoCheckCompletion(
      "map panel check ready:\tstatus=ok\tdetails=two words\ttarget=(296, 190)",
      "--auto-map-panel-check",
    ).status,
    "ok",
  );

  for (const invalid of [
    "map panel check ready: status=ok pending=one pending=two",
    "map panel check ready: status=ok status=failed",
    "map panel check ready: details=two words status=ok",
    'map panel check ready: status=ok trace=["pending=inner"',
    "map panel check ready: status=ok target=(296, 190]",
    'map panel check ready: status=ok trace=["unterminated]',
    "map panel check ready: status=ok\r success=true",
  ]) {
    assert.throws(
      () => parseAutoCheckCompletion(invalid, "--auto-map-panel-check"),
      invalid,
    );
  }
});

test("JSON auto completion parsing binds the authoritative success field", () => {
  for (const [flag, prefix, failed, passed] of [
    ["--auto-npc-appearance-check", "npc appearance check:", {ok: false}, {ok: true}],
    ["--auto-map-visual-runtime-check", "map visual runtime check:", {result: "FAIL"}, {result: "PASS"}],
    ["--auto-battle-command-awakened-ui-check", "battle command awakened ui check:", {status: "failed"}, {status: "ok"}],
  ]) {
    assert.equal(parseAutoCheckCompletion(`${prefix} ${JSON.stringify(failed)}`, flag).status, "failed");
    assert.equal(parseAutoCheckCompletion(`${prefix} ${JSON.stringify(passed)}`, flag).status, "ok");
  }
  assert.equal(parseAutoCheckCompletion(
    'npc appearance check: {"errors":["failure"],"ok":true}',
    "--auto-npc-appearance-check",
  ).status, "failed");
  assert.throws(() => parseAutoCheckCompletion(
    'npc appearance check: {"ok":false,"ok":true}',
    "--auto-npc-appearance-check",
  ));
  for (const payload of [
    {failures: ["failure"], ok: true},
    {ok: true, partial: true},
    {complete: false, ok: true},
    {failedCount: 1, ok: true},
    {error: "boom", ok: true},
    {failure: "boom", result: "PASS"},
    {ok: true, success: false},
    {failed: true, ok: true},
  ]) {
    assert.equal(
      parseAutoCheckCompletion(`npc appearance check: ${JSON.stringify(payload)}`, "--auto-npc-appearance-check").status,
      "failed",
    );
  }
});

test("text auto completion rejects contradictory success evidence", () => {
  for (const evidence of [
    "passed=false",
    "success=false",
    "failed=true",
    "partial=true",
    "complete=false",
    "failedCount=1",
    "error=boom",
    "errors=boom",
    "failure=boom",
    "failures=boom",
  ]) {
    assert.equal(
      parseAutoCheckCompletion(
        `map panel check ready: status=ok ${evidence}`,
        "--auto-map-panel-check",
      ).status,
      "failed",
      evidence,
    );
  }
});

test("auth server client success evidence does not reuse a reserved failure field", () => {
  const coordinatorSource = fs.readFileSync(
    path.join(repoRoot, "client/godot/scripts/qa/auto_check_coordinator.gd"),
    "utf8",
  );
  const completionFormat = coordinatorSource
    .split(/\r?\n/)
    .find((line) => line.includes('print("auth server client check ready:')) || "";
  assert.match(completionFormat, / error_contract=%s /);
  assert.doesNotMatch(completionFormat, / error=%s /);
  assert.equal(
    parseAutoCheckCompletion(
      "auth server client check ready: status=ok reconnect_ui=true error_contract=true ui_server=true",
      "--auto-auth-server-client-check",
    ).status,
    "ok",
  );
  assert.equal(
    parseAutoCheckCompletion(
      "auth server client check ready: status=ok reconnect_ui=true error=true ui_server=true",
      "--auto-auth-server-client-check",
    ).status,
    "failed",
  );
});

test("every discovered auto flag has one unique source-backed completion contract", () => {
  const source = scriptSourceTree(path.join(repoRoot, "client/godot/scripts"));
  const flags = discoverAutoCheckFlags();
  assert.equal(flags.length, 222);
  const prefixes = new Set();
  for (const flag of flags) {
    const contract = autoCheckCompletionContract(flag);
    assert.equal(prefixes.has(contract.prefix), false, `${flag} duplicate prefix=${contract.prefix}`);
    prefixes.add(contract.prefix);
    if (contract.kind === "json") {
      assert.ok(source.includes(`${contract.prefix} %s`), `${flag} missing JSON print source`);
    } else {
      assert.ok(source.includes(`${contract.prefix} status=`), `${flag} missing status print source`);
    }
  }
});

test("auth completion producer uses the strict failed status token", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "client/godot/scripts/qa/auto_check_coordinator.gd"),
    "utf8",
  );
  const printIndex = source.indexOf('print("auth check ready: status=%s');
  assert.ok(printIndex > 0);
  const prefix = source.slice(Math.max(0, printIndex - 3000), printIndex);
  const statusLines = prefix.split(/\r?\n/).filter((line) => line.startsWith('\tvar status = "ok" if '));
  assert.equal(statusLines.length, 1);
  assert.match(statusLines[0], / else "failed"$/);
  assert.doesNotMatch(statusLines[0], / else "fail"$/);
});

test("lane helper output is one JSON line with exact phase contracts", () => {
  const owner = "a".repeat(32);
  const sha = "b".repeat(64);
  const laneRoot = "/tmp/BeastboundOdysseyQA_Automation";
  const realRoot = "/tmp/Godot/app_userdata/Beastbound Odyssey - 万兽纪元";
  const prepared = {
    customUserDirName: "BeastboundOdysseyQA_Automation",
    editorCustomFeatures: "existing,beastbound_qa_automation",
    feature: "beastbound_qa_automation",
    godotLaneRoot: laneRoot,
    godotRealRoot: realRoot,
    lane: "automation",
    laneEntryCount: 2,
    laneInventorySha256: sha,
    laneRoot,
    owner,
    realEntryCount: 0,
    realInventorySha256: sha,
    realRoot,
    status: "prepared",
  };
  assert.equal(validatePreparedLanePayload(prepared).owner, owner);
  assert.throws(() => validatePreparedLanePayload(prepared, "c".repeat(32)), /identity/);
  const helperResult = {stdout: `${JSON.stringify(prepared)}\n`, stderr: "", status: 0, error: null};
  assert.equal(parseLaneHelperOutput(helperResult, "prepare").lane, "automation");
  for (const invalid of [
    {...helperResult, stdout: `noise\n${helperResult.stdout}`},
    {...helperResult, stderr: "warning\n"},
    {...helperResult, stdout: "[]\n"},
    {...helperResult, stdout: '{"status":"failed","st\\u0061tus":"prepared"}\n'},
    {...helperResult, stdout: `${JSON.stringify({status: prepared.status, ...prepared})}\n`},
    {...helperResult, stdout: `${JSON.stringify(prepared).replace(",", ", ")}\n`},
  ]) {
    assert.throws(() => parseLaneHelperOutput(invalid, "prepare"));
  }
  const qaLane = {
    ...prepared,
    lastLaneInventorySha256: sha,
    lastLaneEntryCount: 3,
  };
  const verified = {
    feature: prepared.feature,
    godotLaneRoot: laneRoot,
    lane: prepared.lane,
    laneEntryCount: 3,
    laneInventorySha256: sha,
    laneRoot,
    owner,
    realEntryCount: 0,
    realInventorySha256: sha,
    realRoot,
    realUnchanged: true,
    status: "verified",
  };
  assert.equal(validateVerifiedLanePayload(verified, qaLane).status, "verified");
  const cleaned = {
    feature: prepared.feature,
    lane: prepared.lane,
    laneAbsent: true,
    laneRoot,
    owner,
    realInventorySha256: sha,
    realRoot,
    realUnchanged: true,
    removedLaneEntryCount: 3,
    removedLaneInventorySha256: sha,
    status: "cleaned",
  };
  assert.equal(validateCleanedLanePayload(cleaned, qaLane).status, "cleaned");
  const absentRecovery = {lane: "automation", laneAbsent: true, owner, status: "absent"};
  assert.equal(validateRecoveredLanePayload(absentRecovery, owner).status, "absent");
  const recovered = {
    lane: "automation",
    laneAbsent: true,
    owner,
    realInventorySha256: sha,
    realRoot,
    realUnchanged: true,
    status: "recovered",
  };
  assert.equal(validateRecoveredLanePayload(recovered, owner).status, "recovered");
  assert.throws(() => validateVerifiedLanePayload({...verified, owner: "c".repeat(32)}, qaLane));
  assert.throws(() => validateCleanedLanePayload({...cleaned, extra: true}, qaLane));
  assert.throws(() => validateRecoveredLanePayload({...absentRecovery, owner: "c".repeat(32)}, owner));
  assert.throws(() => validateRecoveredLanePayload({...recovered, extra: true}, owner));
});

test("completion prefixes are bound to their exact auto-check flag", () => {
  assert.equal(expectedAutoCompletionPrefix("--auto-map-panel-check"), "map panel check ready:");
  assert.equal(
    expectedAutoCompletionPrefix("--auto-startup-login-check"),
    "startup login args check ready:",
  );
  assert.throws(() => expectedAutoCompletionPrefix("--map-panel-check"), /invalid auto-check flag/);
});

test("clean parse requires the same exact Main lane attestation", () => {
  const parse = buildCheck("godot-parse", 1, 1, {godot: "godot"});
  const missing = makeResult(parse, 10, 0, "", "Godot Engine v4.7.stable\n", false, preparedLane);
  assert.equal(missing.ok, false);
  assert.equal(missing.status, "qa_lane_attestation_failed");
});

test("Windows descendant inventory follows parent links even after the root exits", () => {
  const records = [
    {pid: 20, parentPid: 10},
    {pid: 30, parentPid: 20},
    {pid: 40, parentPid: 999},
  ];
  assert.deepEqual(descendantProcessIds(records, 10), [30, 20]);
  assert.deepEqual(descendantProcessIds(records, 999), [40]);
});

test("Windows closure kills the frozen descendant tree leaf-first and reports observation", async () => {
  const inventories = [
    [
      {pid: 20, parentPid: 10},
      {pid: 30, parentPid: 20},
    ],
    [],
  ];
  const terminated = [];
  const closure = await ensureProcessGroupClosed({pid: 10}, Date.now() + 1000, {
    platform: "win32",
    windowsProcessRecords: () => inventories.shift() || [],
    terminateWindowsProcessIds: (processIds) => {
      terminated.push(...processIds);
      return true;
    },
    delay: async () => {},
  });
  assert.deepEqual(terminated, [30, 20]);
  assert.deepEqual(closure, closedProcessGroup({killSent: true, residualObserved: true}));
});

test("startup account preparation fetch honors its abort signal", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), {once: true});
  });
  const controller = new AbortController();
  const request = postAuthJson("http://127.0.0.1:9", "/auth/register", {}, controller.signal);
  controller.abort(new Error("bounded abort"));
  try {
    await assert.rejects(request, /bounded abort/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("startup account preparation stops before HTTP when evidence logging fails", async () => {
  let fetched = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetched = true;
    throw new Error("fetch must not run");
  };
  try {
    await assert.rejects(
      prepareCheck(
        {flag: "--auto-startup-login-check"},
        {
          authServerUrl: "http://127.0.0.1:9",
          startupPassword: "test1234",
          startupUsername: "startup-test",
          timeoutMs: 1000,
        },
        memoryLog(1),
      ),
      /log failed/,
    );
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function fakeChild(pid = 4242) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.unref = () => {};
  return child;
}

function closedProcessGroup(overrides = {}) {
  return {
    closed: true,
    killSent: false,
    residualObserved: false,
    termSent: false,
    ...overrides,
  };
}

function openProcessGroup(overrides = {}) {
  return closedProcessGroup({closed: false, residualObserved: true, ...overrides});
}

function memoryLog(failAtWrite = 0) {
  let writes = 0;
  const chunks = [];
  return {
    chunks,
    error: null,
    text() {
      return Buffer.concat(chunks.map((chunk) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))).toString("utf8");
    },
    write(chunk) {
      writes += 1;
      if (failAtWrite !== 0 && writes >= failAtWrite) {
        this.error = new Error("log failed");
        return false;
      }
      chunks.push(chunk);
      return true;
    },
  };
}

function runtimeCheck() {
  return {
    index: 1,
    total: 1,
    name: "--auto-map-panel-check",
    flag: "--auto-map-panel-check",
    command: "godot",
    args: ["--headless"],
    requiresQaAttestation: true,
  };
}

function passingRuntimeOutput() {
  return `${qaAttestationMarker()}\nmap panel check ready: status=ok\n`;
}

test("runCheck closes the process group on exit zero and nonzero", async () => {
  for (const exitCode of [0, 7]) {
    const child = fakeChild(4300 + exitCode);
    let spawnOptions = null;
    const resultPromise = runCheck(
      runtimeCheck(),
      {qaLane: {...preparedLane, environment: {}}, timeoutMs: 1000},
      memoryLog(),
      {
        spawn: (_command, _args, options) => {
          spawnOptions = options;
          queueMicrotask(() => {
            child.stdout.write(passingRuntimeOutput());
            child.emit("close", exitCode, null);
          });
          return child;
        },
        ensureProcessGroupClosed: async () => closedProcessGroup(),
      },
    );
    const result = await resultPromise;
    assert.equal(result.processGroupClosed, true);
    assert.equal(result.ok, exitCode === 0);
    assert.equal(result.status, exitCode === 0 ? "ok" : "exit_nonzero");
    assert.equal(result.completionStatus, "ok");
    assert.equal(spawnOptions.detached, true);
    assert.deepEqual(spawnOptions.stdio, ["ignore", "pipe", "pipe"]);
  }
});

test("runCheck writes a settlement boundary after output without a trailing newline", async () => {
  const child = fakeChild(4350);
  const log = memoryLog();
  const resultPromise = runCheck(
    runtimeCheck(),
    {qaLane: {...preparedLane, environment: {}}, timeoutMs: 1000},
    log,
    {
      spawn: () => {
        queueMicrotask(() => {
          child.stdout.write(passingRuntimeOutput().replace(/\n$/, ""));
          child.emit("close", 0, null);
        });
        return child;
      },
      ensureProcessGroupClosed: async () => closedProcessGroup(),
    },
  );
  const result = await resultPromise;
  assert.equal(result.ok, true);
  assert.match(
    log.text(),
    /map panel check ready: status=ok\n===== \[1\/1\] --auto-map-panel-check settlement result_ok=true exit_code=0 process_group_closed=true residual_observed=false completion_status=ok overall_status=ok =====\n$/,
  );
});

test("a valid real check with a reaped same-group descendant still fails containment", async () => {
  const script = [
    'const {spawn} = require("node:child_process");',
    'const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {stdio: "inherit"});',
    "descendant.unref();",
    `process.stdout.write(${JSON.stringify(passingRuntimeOutput())});`,
  ].join("\n");
  const result = await runCheck(
    {...runtimeCheck(), command: process.execPath, args: ["-e", script]},
    {qaLane: {...preparedLane, environment: process.env}, timeoutMs: 5000},
    memoryLog(),
  );
  assert.equal(result.processGroupClosed, true);
  assert.equal(result.processGroupResidualObserved, true);
  assert.equal(result.ok, false);
  assert.equal(result.status, "process_group_residual_reaped");
  assert.equal(result.containmentBreached, true);
});

test("runCheck fail-closes timeout, spawn error, residual group, and log failure", async () => {
  const timeoutChild = fakeChild(4401);
  const timeout = await runCheck(
    runtimeCheck(),
    {qaLane: {...preparedLane, environment: {}}, timeoutMs: 2},
    memoryLog(),
    {
      spawn: () => timeoutChild,
      terminateProcessGroup: () => true,
      ensureProcessGroupClosed: async () => closedProcessGroup(),
      settlementGraceMs: 1,
      forcedSettlementMs: 2,
    },
  );
  assert.equal(timeout.ok, false);
  assert.equal(timeout.timedOut, true);
  assert.equal(timeout.processGroupClosed, true);
  assert.equal(timeout.processGroupTermSent, true);
  assert.equal(timeout.processGroupKillSent, true);
  assert.equal(timeout.status, "containment_unknown");
  assert.equal(timeout.containmentBreached, true);

  const errorChild = fakeChild(4402);
  const spawnErrorPromise = runCheck(
    runtimeCheck(),
    {qaLane: {...preparedLane, environment: {}}, timeoutMs: 1000},
    memoryLog(),
    {
      spawn: () => {
        queueMicrotask(() => errorChild.emit("error", new Error("spawn failed")));
        return errorChild;
      },
      ensureProcessGroupClosed: async () => closedProcessGroup(),
    },
  );
  const spawnError = await spawnErrorPromise;
  assert.equal(spawnError.ok, false);
  assert.equal(spawnError.processGroupClosed, true);

  const residualChild = fakeChild(4403);
  const residualPromise = runCheck(
    runtimeCheck(),
    {qaLane: {...preparedLane, environment: {}}, timeoutMs: 1000},
    memoryLog(),
    {
      spawn: () => {
        queueMicrotask(() => {
          residualChild.stdout.write(passingRuntimeOutput());
          residualChild.emit("close", 0, null);
        });
        return residualChild;
      },
      ensureProcessGroupClosed: async () => openProcessGroup(),
    },
  );
  const residual = await residualPromise;
  assert.equal(residual.processGroupClosed, false);
  assert.equal(residual.containmentBreached, true);
  assert.equal(residual.ok, false);
  assert.equal(residual.status, "process_group_residual");

  const synchronousSpawnError = await runCheck(
    runtimeCheck(),
    {qaLane: {...preparedLane, environment: {}}, timeoutMs: 1000},
    memoryLog(),
    {spawn: () => { throw new Error("synchronous spawn failed"); }},
  );
  assert.equal(synchronousSpawnError.ok, false);
  assert.equal(synchronousSpawnError.status, "spawn_error");
  assert.equal(synchronousSpawnError.processGroupClosed, true);

  const stdioChild = fakeChild(4409);
  const stdioResultPromise = runCheck(
    runtimeCheck(),
    {qaLane: {...preparedLane, environment: {}}, timeoutMs: 1000},
    memoryLog(),
    {
      spawn: () => {
        queueMicrotask(() => stdioChild.stdout.emit("error", new Error("pipe closed")));
        return stdioChild;
      },
      terminateProcessGroup: () => true,
      ensureProcessGroupClosed: async () => closedProcessGroup(),
      settlementGraceMs: 1,
      forcedSettlementMs: 2,
    },
  );
  const stdioResult = await stdioResultPromise;
  assert.equal(stdioResult.ok, false);
  assert.equal(stdioResult.status, "containment_unknown");
  assert.equal(stdioResult.containmentBreached, true);
  assert.equal(stdioResult.processGroupClosed, true);

  const rejectedCloseChild = fakeChild(4407);
  const rejectedClosePromise = runCheck(
    runtimeCheck(),
    {qaLane: {...preparedLane, environment: {}}, timeoutMs: 1000},
    memoryLog(),
    {
      spawn: () => {
        queueMicrotask(() => rejectedCloseChild.emit("close", 0, null));
        return rejectedCloseChild;
      },
      ensureProcessGroupClosed: async () => { throw new Error("group close rejected"); },
    },
  );
  const rejectedClose = await rejectedClosePromise;
  assert.equal(rejectedClose.processGroupClosed, false);
  assert.equal(rejectedClose.containmentBreached, true);
  assert.match(rejectedClose.processGroupDiagnostic, /group close rejected/);

  let spawned = false;
  const logFailure = await runCheck(
    runtimeCheck(),
    {qaLane: {...preparedLane, environment: {}}, timeoutMs: 1000},
    memoryLog(1),
    {spawn: () => { spawned = true; return fakeChild(4404); }},
  );
  assert.equal(spawned, false);
  assert.equal(logFailure.status, "log_io_error");
  assert.equal(logFailure.processGroupClosed, true);

  for (const [reason, log, maxOutputBytes] of [
    ["log_io_error", memoryLog(3), 1024],
    ["output_limit_exceeded", memoryLog(), 16],
  ]) {
    const child = fakeChild(reason === "log_io_error" ? 4405 : 4406);
    const resultPromise = runCheck(
      runtimeCheck(),
      {qaLane: {...preparedLane, environment: {}}, timeoutMs: 1000},
      log,
      {
        spawn: () => {
          queueMicrotask(() => child.stdout.write(Buffer.alloc(17, 65)));
          return child;
        },
        terminateProcessGroup: () => true,
        ensureProcessGroupClosed: async () => closedProcessGroup(),
        maxOutputBytes,
        settlementGraceMs: 1,
        forcedSettlementMs: 2,
      },
    );
    const result = await resultPromise;
    assert.equal(result.ok, false);
    assert.equal(result.status, reason === "output_limit_exceeded" ? "containment_unknown" : reason);
    assert.equal(result.processGroupClosed, true);
  }

  const completedBeforeLimitChild = fakeChild(4408);
  const completedBeforeLimitPromise = runCheck(
    runtimeCheck(),
    {qaLane: {...preparedLane, environment: {}}, timeoutMs: 1000},
    memoryLog(),
    {
      spawn: () => {
        queueMicrotask(() => {
          completedBeforeLimitChild.stdout.write(`${passingRuntimeOutput()}${"x".repeat(64)}`);
          completedBeforeLimitChild.emit("close", 0, null);
        });
        return completedBeforeLimitChild;
      },
      terminateProcessGroup: () => true,
      ensureProcessGroupClosed: async () => closedProcessGroup(),
      maxOutputBytes: Buffer.byteLength(passingRuntimeOutput()) + 1,
    },
  );
  const completedBeforeLimit = await completedBeforeLimitPromise;
  assert.equal(completedBeforeLimit.ok, false);
  assert.equal(completedBeforeLimit.status, "output_limit_exceeded");
});

test("post-spawn check setup and asynchronous finalize errors total-settle and preserve", async () => {
  for (const [index, raw] of [new Error("listener setup BaseException"), null].entries()) {
    const setupChild = fakeChild(4450 + index);
    let setupCloseCalls = 0;
    let setupTermCalls = 0;
    setupChild.stdout.on = () => { throw raw; };
    const setupResult = await runCheck(
      runtimeCheck(),
      {qaLane: {...preparedLane, environment: {}}, timeoutMs: 1000},
      memoryLog(),
      {
        spawn: () => setupChild,
        terminateProcessGroup: () => { setupTermCalls += 1; return true; },
        ensureProcessGroupClosed: async () => { setupCloseCalls += 1; return closedProcessGroup(); },
        groupCloseTimeoutMs: 20,
      },
    );
    assert.equal(setupResult.ok, false);
    assert.equal(setupResult.containmentBreached, true);
    assert.equal(setupResult.status, "runner_post_spawn_setup_error");
    assert.equal(setupResult.lanePreservationReason, "runner_post_spawn_setup_error");
    assert.ok(setupTermCalls >= 1);
    assert.ok(setupCloseCalls >= 1);
  }

  const finalizeChild = fakeChild(4455);
  const throwingLog = memoryLog();
  const originalWrite = throwingLog.write.bind(throwingLog);
  let writeCount = 0;
  throwingLog.write = (chunk) => {
    writeCount += 1;
    if (writeCount === 4) {
      throw new Error("settlement boundary BaseException");
    }
    return originalWrite(chunk);
  };
  let finalizeCloseCalls = 0;
  const finalizeResultPromise = runCheck(
    runtimeCheck(),
    {qaLane: {...preparedLane, environment: {}}, timeoutMs: 1000},
    throwingLog,
    {
      spawn: () => {
        queueMicrotask(() => {
          finalizeChild.stdout.write(passingRuntimeOutput());
          finalizeChild.emit("close", 0, null);
        });
        return finalizeChild;
      },
      terminateProcessGroup: () => true,
      ensureProcessGroupClosed: async () => { finalizeCloseCalls += 1; return closedProcessGroup(); },
      groupCloseTimeoutMs: 20,
    },
  );
  const finalizeResult = await finalizeResultPromise;
  assert.equal(finalizeResult.ok, false);
  assert.equal(finalizeResult.containmentBreached, true);
  assert.equal(finalizeResult.status, "runner_internal_settlement_failed");
  assert.equal(finalizeResult.lanePreservationReason, "runner_internal_settlement_failed");
  assert.ok(finalizeCloseCalls >= 2);
});

test("leader exit followed by forced pipe closure is containment-unknown", async () => {
  const child = fakeChild(4452);
  const resultPromise = runCheck(
    runtimeCheck(),
    {qaLane: {...preparedLane, environment: {}}, timeoutMs: 1},
    memoryLog(),
    {
      spawn: () => {
        queueMicrotask(() => child.emit("exit", 0, null));
        return child;
      },
      terminateProcessGroup: () => true,
      ensureProcessGroupClosed: async () => closedProcessGroup(),
      settlementGraceMs: 1,
      forcedSettlementMs: 2,
    },
  );
  const result = await resultPromise;
  assert.equal(result.ok, false);
  assert.equal(result.status, "containment_unknown");
  assert.equal(result.containmentBreached, true);
  assert.equal(result.lanePreservationReason, "containment_unknown");
});

test("graceful and repeated shutdown signals retain whole-lifecycle TERM and KILL evidence", async () => {
  const child = fakeChild(4510);
  const observedSignals = [];
  const resultPromise = runCheck(
    runtimeCheck(),
    {qaLane: {...preparedLane, environment: {}}, timeoutMs: 1000},
    memoryLog(),
    {
      spawn: () => child,
      terminateProcessGroup: (_child, signal) => {
        observedSignals.push(signal);
        return true;
      },
      ensureProcessGroupClosed: async () => closedProcessGroup(),
    },
  );
  requestGracefulShutdown("SIGINT");
  requestGracefulShutdown("SIGINT");
  child.emit("close", 0, null);
  const result = await resultPromise;
  assert.deepEqual(observedSignals, ["SIGTERM", "SIGKILL"]);
  assert.equal(result.ok, false);
  assert.equal(result.status, "interrupted_sigint");
  assert.equal(result.processGroupTermSent, true);
  assert.equal(result.processGroupKillSent, true);
});
