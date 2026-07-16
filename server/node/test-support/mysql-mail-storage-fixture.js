"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  buildMailStorageCanonicalContractOutputForTest,
} = require("../src/mysql-mail-storage-schema");

const MAIL_STORAGE_CONTROL_GENERATION_ZERO_OUTPUT =
  "mail_lifecycle\t1\t0\tuninitialized\t0\t0\t0\t\t0\t0\t0\t0\t\t\n";

function wrapFakeMysqlWithMailStorageAudit(delegatePathValue) {
  const delegatePath = path.resolve(String(delegatePathValue || ""));
  const wrapperPath = `${delegatePath}.mail-storage-audit.js`;
  if (fs.existsSync(wrapperPath)) {
    return wrapperPath;
  }
  fs.writeFileSync(wrapperPath, `#!/usr/bin/env node
"use strict";
const {spawnSync} = require("node:child_process");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  if (stdin.includes("AS mail_storage_contract")) {
    process.stdout.write(${JSON.stringify(buildMailStorageCanonicalContractOutputForTest())});
    return;
  }
  if (stdin.includes("FROM mail_storage_control")) {
    process.stdout.write(${JSON.stringify(MAIL_STORAGE_CONTROL_GENERATION_ZERO_OUTPUT)});
    return;
  }
  const result = spawnSync(${JSON.stringify(delegatePath)}, process.argv.slice(2), {
    cwd: process.cwd(),
    env: process.env,
    input: Buffer.from(stdin, "utf8"),
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.stdout && result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr && result.stderr.length > 0) process.stderr.write(result.stderr);
  if (result.error) {
    process.stderr.write(String(result.error.message || result.error) + "\\n");
    process.exitCode = 1;
    return;
  }
  process.exitCode = Number.isInteger(result.status) ? result.status : 1;
});
`, {mode: 0o755});
  return wrapperPath;
}

module.exports = {
  MAIL_STORAGE_CONTROL_GENERATION_ZERO_OUTPUT,
  wrapFakeMysqlWithMailStorageAudit,
};
