#!/bin/zsh
set -u

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  source "$NVM_DIR/nvm.sh"
  nvm use --silent 22 >/dev/null 2>&1 || nvm use --silent default >/dev/null 2>&1 || true
fi

SCRIPT_DIR="${0:A:h}"
SERVER_DIR="$SCRIPT_DIR/server/node"
AUTH_PORT="8787"

pause_before_close() {
  if [[ "${BEASTBOUND_NO_PAUSE:-0}" == "1" || ! -t 0 ]]; then
    return
  fi
  printf "\nPress any key to close this window."
  read -r -k 1 -s
  printf "\n"
}

fail() {
  printf "\nError: %s\n" "$1" >&2
  pause_before_close
  exit 1
}

[[ -d "$SERVER_DIR" ]] || fail "Cannot find server directory: $SERVER_DIR"

cd "$SERVER_DIR" || fail "Cannot enter server directory: $SERVER_DIR"

if [[ -f "$SERVER_DIR/.local/mysql.env" ]]; then
  env_port="$(sed -n -E "s/^export BEASTBOUND_AUTH_PORT=['\"]?([^'\"]+)['\"]?$/\1/p" "$SERVER_DIR/.local/mysql.env" | tail -n 1)"
  [[ -n "$env_port" ]] && AUTH_PORT="$env_port"
fi

command -v node >/dev/null 2>&1 || fail "Node.js was not found. Install Node.js 22+ or make it available in PATH."
command -v npm >/dev/null 2>&1 || fail "npm was not found. Install Node.js/npm or make them available in PATH."

node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' \
  || fail "Node.js 22+ is required. Current version: $(node -v)"

health_ready() {
  node - "$AUTH_PORT" <<'NODE'
const http = require("node:http");
const port = Number(process.argv[2] || 8787);
const req = http.request({"host": "127.0.0.1", port, "path": "/health", "method": "GET", "timeout": 1000}, (res) => {
  const chunks = [];
  res.on("data", (chunk) => chunks.push(chunk));
  res.on("end", () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      process.exit(body && body.ok ? 0 : 1);
    } catch (_error) {
      process.exit(1);
    }
  });
});
req.on("timeout", () => req.destroy(new Error("health timeout")));
req.on("error", () => process.exit(1));
req.end();
NODE
}

wait_for_health() {
  printf "\nWaiting for backend health"
  local attempt
  for attempt in {1..20}; do
    if health_ready; then
      printf " ready.\n"
      return 0
    fi
    printf "."
    sleep 0.5
  done
  printf " not ready yet.\n"
  return 1
}

printf "\nRestarting Beastbound Odyssey backend...\n\n"
npm run ops -- restart
start_status=$?

if (( start_status == 0 )); then
  wait_for_health || true
fi

printf "\nBackend status:\n\n"
npm run ops -- status || true

printf "\nLocal URL: http://127.0.0.1:%s\n" "$AUTH_PORT"
printf "Log file: %s\n" "$SERVER_DIR/.local/dev-server.log"

if (( start_status == 0 )); then
  printf "\nBackend has been restarted.\n"
else
  printf "\nBackend restart failed. Check the status output and log file above.\n"
fi

pause_before_close
exit "$start_status"
