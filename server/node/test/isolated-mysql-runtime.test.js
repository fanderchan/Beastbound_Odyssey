"use strict";

const assert = require("node:assert/strict");
const {spawn} = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const test = require("node:test");

const RUNTIME_URL = pathToFileURL(path.resolve(__dirname, "../../../tools/lib/isolated-mysql-runtime.mjs")).href;

test("isolated MySQL cleanup cancels its fallback timer after a confirmed exit", {timeout: 10_000}, async (t) => {
  const {stopIsolatedMysql} = await import(RUNTIME_URL);
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-isolated-runtime-test-"));
  const readyPath = path.join(runtimeDir, "ready");
  const childScript = path.join(runtimeDir, "fake-mysqld.js");
  fs.writeFileSync(childScript, [
    '"use strict";',
    'const fs = require("node:fs");',
    `fs.writeFileSync(${JSON.stringify(readyPath)}, "ready");`,
    'process.on("SIGTERM", () => process.exit(0));',
    'setInterval(() => undefined, 1000);',
    "",
  ].join("\n"), "utf8");
  const child = spawn(process.execPath, [childScript], {stdio: "ignore"});
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    fs.rmSync(runtimeDir, {recursive: true, force: true});
  });
  await waitForFile(readyPath);

  const mysqladminPath = path.join(runtimeDir, "fake-mysqladmin.js");
  fs.writeFileSync(mysqladminPath, [
    "#!/usr/bin/env node",
    '"use strict";',
    `process.kill(${child.pid}, "SIGTERM");`,
    "",
  ].join("\n"), {encoding: "utf8", mode: 0o700});
  fs.chmodSync(mysqladminPath, 0o700);
  const exited = new Promise((resolve, reject) => {
    child.once("exit", (code, signal) => resolve({code, signal}));
    child.once("error", reject);
  });
  const runtime = {
    processHandle: child,
    exited,
    mysqladminPath,
    port: 33060,
    runtimeDir,
  };

  const startedAt = Date.now();
  await stopIsolatedMysql(runtime, {stopTimeoutMs: 3000});
  const elapsedMs = Date.now() - startedAt;

  assert.ok(elapsedMs < 1000, `cleanup retained a settled ${elapsedMs}ms fallback timer`);
  assert.equal(child.exitCode, 0);
  assert.equal(fs.existsSync(runtimeDir), false);
});

async function waitForFile(filePath) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("fake mysqld did not become ready");
}
