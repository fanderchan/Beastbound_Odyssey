import assert from "node:assert/strict";
import test from "node:test";
import {
  parseArgs,
  QUICK_TARGET_CHECKS,
  RELEASE_LIVE_CHECKS,
  RELEASE_TARGET_CHECKS,
  validatedLocalQaBackendUrl,
  verifyLocalQaBackend,
} from "../run_local_ci.mjs";

function memoryLog() {
  let value = "";
  return {
    text: () => value,
    write(chunk) {
      value += String(chunk);
      return true;
    },
  };
}

test("release CI freezes separate target, live, and quick check profiles", () => {
  assert.equal(RELEASE_TARGET_CHECKS.length, 34);
  assert.equal(RELEASE_LIVE_CHECKS.length, 7);
  assert.equal(QUICK_TARGET_CHECKS.length, 2);
  assert.equal(new Set(RELEASE_TARGET_CHECKS).size, RELEASE_TARGET_CHECKS.length);
  assert.equal(new Set(RELEASE_LIVE_CHECKS).size, RELEASE_LIVE_CHECKS.length);
  assert.equal(RELEASE_TARGET_CHECKS.includes("--auto-map-visual-runtime-check"), false);
  assert.equal(RELEASE_TARGET_CHECKS.includes("--auto-map-panel-check"), false);
  assert.deepEqual(RELEASE_LIVE_CHECKS, [
    "--auto-auth-server-live-check",
    "--auto-startup-login-check",
    "--auto-character-entry-live-check",
    "--auto-server-movement-live-check",
    "--auto-server-battle-turn-live-check",
    "--auto-server-battle-return-check",
    "--auto-server-battle-leave-ui-live-check",
  ]);
});

test("local CI accepts one explicit auth server option", () => {
  const separated = parseArgs(["--auth-server-url", "http://127.0.0.1:18787"]);
  assert.equal(separated.authServerUrl, "http://127.0.0.1:18787");
  const joined = parseArgs(["--auth-server-url=http://127.0.0.1:28787"]);
  assert.equal(joined.authServerUrl, "http://127.0.0.1:28787");
});

test("QA backend URL accepts only a canonical loopback HTTP origin", () => {
  assert.equal(validatedLocalQaBackendUrl("http://127.0.0.1:8787"), "http://127.0.0.1:8787");
  assert.equal(validatedLocalQaBackendUrl("http://127.0.0.1:8787/"), "http://127.0.0.1:8787");
  for (const value of [
    "https://127.0.0.1:8787",
    "http://localhost:8787",
    "http://0.0.0.0:8787",
    "http://127.0.0.1",
    "http://user@127.0.0.1:8787",
    "http://127.0.0.1:8787/health",
    "http://127.0.0.1:8787?mode=json",
  ]) {
    assert.throws(() => validatedLocalQaBackendUrl(value), /QA backend URL/, value);
  }
});

test("live preflight requires a healthy Beastbound JSON store", async () => {
  const options = {authServerUrl: "http://127.0.0.1:8787", timeoutMs: 1000};
  const acceptedLog = memoryLog();
  const accepted = await verifyLocalQaBackend(options, acceptedLog, {
    fetch: async (url) => ({
      status: 200,
      json: async () => ({ok: true, service: "beastbound-auth", storage: {mode: "json"}}),
      url,
    }),
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.storageMode, "json");
  assert.match(acceptedLog.text(), /storage_mode=json/);

  for (const payload of [
    {ok: false, service: "beastbound-auth", storage: {mode: "json"}},
    {ok: true, service: "other", storage: {mode: "json"}},
    {ok: true, service: "beastbound-auth", storage: {mode: "mysql"}},
  ]) {
    const rejected = await verifyLocalQaBackend(options, memoryLog(), {
      fetch: async () => ({status: 200, json: async () => payload}),
    });
    assert.equal(rejected.ok, false, JSON.stringify(payload));
  }
});
