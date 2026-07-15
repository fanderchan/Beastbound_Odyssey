#!/bin/zsh
set -u

umask 077
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  source "$NVM_DIR/nvm.sh"
  nvm use --silent 22 >/dev/null 2>&1 || nvm use --silent default >/dev/null 2>&1 || true
fi

SCRIPT_PATH="${0:A}"
SCRIPT_DIR="${SCRIPT_PATH:h}"
SERVER_DIR="$SCRIPT_DIR/server/node"
LOCAL_DIR="$SERVER_DIR/.local"
STATE_FILE="$LOCAL_DIR/backend-console.state"
LOCK_DIR="$LOCAL_DIR/backend-console.lock"
LOCK_OWNER_FILE="$LOCK_DIR/owner"
LOG_FILE="$LOCAL_DIR/dev-server.log"
PID_FILE="$LOCAL_DIR/server.pid"
AUTH_PORT="8787"
CONTROLLER_MODE=0
CONTROLLER_TOKEN="$$-$(date +%s)-$RANDOM"
TERMINAL_WINDOW_TTY=""
TAIL_PID=""
BACKEND_PID=""
BACKEND_FINGERPRINT=""
LOCK_OWNED=0
STATE_WRITTEN=0
SHUTTING_DOWN=0

if [[ "${BEASTBOUND_NO_PAUSE:-0}" != "1" && -t 0 ]]; then
  CONTROLLER_MODE=1
fi

trim_field() {
  sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

terminal_window_tty_for_pid() {
  local current_pid="$1"
  local parent_pid
  local process_tty
  local parent_command

  while [[ "$current_pid" == <-> ]] && (( current_pid > 1 )); do
    parent_pid="$(ps -p "$current_pid" -o ppid= 2>/dev/null | tr -d '[:space:]')"
    process_tty="$(ps -p "$current_pid" -o tty= 2>/dev/null | tr -d '[:space:]')"
    [[ "$parent_pid" == <-> ]] || break
    parent_command="$(ps -ww -p "$parent_pid" -o command= 2>/dev/null)"

    if [[ "$parent_command" == *"/Terminal.app/Contents/MacOS/Terminal"* ]]; then
      if [[ -n "$process_tty" && "$process_tty" != "??" ]]; then
        printf "/dev/%s\n" "$process_tty"
        return 0
      fi
      break
    fi
    current_pid="$parent_pid"
  done

  return 1
}

set_terminal_title() {
  local title="$1"
  (( CONTROLLER_MODE == 1 )) || return 0

  printf '\033]0;%s\007' "$title"
  [[ -n "$TERMINAL_WINDOW_TTY" ]] || return 0

  osascript - "$TERMINAL_WINDOW_TTY" "$title" >/dev/null 2>&1 <<'APPLESCRIPT' || true
on run argv
  set targetTty to item 1 of argv
  set targetTitle to item 2 of argv
  tell application "Terminal"
    repeat with terminalWindow in windows
      repeat with terminalTab in tabs of terminalWindow
        if (tty of terminalTab as text) is targetTty then
          set custom title of terminalTab to targetTitle
          return true
        end if
      end repeat
    end repeat
  end tell
  return false
end run
APPLESCRIPT
}

close_terminal_tab() {
  local target_tty="$1"
  [[ -n "$target_tty" && "$target_tty" != "$TERMINAL_WINDOW_TTY" ]] || return 0

  osascript - "$target_tty" >/dev/null 2>&1 <<'APPLESCRIPT' || true
on run argv
  set targetTty to item 1 of argv
  tell application "Terminal"
    repeat with windowIndex from (count of windows) to 1 by -1
      set terminalWindow to window windowIndex
      repeat with tabIndex from (count of tabs of terminalWindow) to 1 by -1
        set terminalTab to tab tabIndex of terminalWindow
        if (tty of terminalTab as text) is targetTty then
          if (count of tabs of terminalWindow) is 1 then
            close terminalWindow
          else
            close terminalTab
          end if
          return true
        end if
      end repeat
    end repeat
  end tell
  return false
end run
APPLESCRIPT
}

pause_before_close() {
  if [[ "${BEASTBOUND_NO_PAUSE:-0}" == "1" || ! -t 0 ]]; then
    return 0
  fi
  printf "\n按任意键关闭此窗口。"
  read -r -k 1 -s
  printf "\n"
}

launcher_pid_matches() {
  local pid="$1"
  local process_command
  [[ "$pid" == <-> && "$pid" != "$$" ]] || return 1
  process_command="$(ps -ww -p "$pid" -o command= 2>/dev/null | trim_field)"
  case "$process_command" in
    "/bin/zsh $SCRIPT_PATH"|"zsh $SCRIPT_PATH"|\
    "/bin/zsh -l $SCRIPT_PATH"|"zsh -l $SCRIPT_PATH")
      return 0
      ;;
  esac
  return 1
}

backend_process_fingerprint() {
  local pid="$1"
  ps -p "$pid" -o lstart= 2>/dev/null | trim_field
}

backend_process_cwd() {
  local pid="$1"
  lsof -a -p "$pid" -d cwd -Fn 2>/dev/null \
    | sed -n 's/^n//p' \
    | head -n 1
}

backend_process_matches() {
  local pid="$1"
  local expected_fingerprint="$2"
  local current_fingerprint
  local process_command
  local process_cwd
  [[ "$pid" == <-> && -n "$expected_fingerprint" ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  current_fingerprint="$(backend_process_fingerprint "$pid")"
  [[ -n "$current_fingerprint" && "$current_fingerprint" == "$expected_fingerprint" ]] || return 1
  process_command="$(ps -ww -p "$pid" -o command= 2>/dev/null | trim_field)"
  process_cwd="$(backend_process_cwd "$pid")"
  [[ "$process_command" == *"node"*"src/http-server.js"* && "$process_cwd" == "$SERVER_DIR" ]]
}

pid_file_value() {
  local pid=""
  [[ -f "$PID_FILE" ]] || return 1
  IFS= read -r pid < "$PID_FILE" || return 1
  [[ "$pid" == <-> ]] || return 1
  printf '%s\n' "$pid"
}

remove_owned_pid_file() {
  local pid="$1"
  local current_pid=""
  current_pid="$(pid_file_value 2>/dev/null || true)"
  if [[ "$current_pid" == "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$PID_FILE"
  fi
}

stop_exact_backend() {
  local pid="$1"
  local fingerprint="$2"
  local attempt

  if ! backend_process_matches "$pid" "$fingerprint"; then
    remove_owned_pid_file "$pid"
    return 0
  fi

  kill -TERM "$pid" 2>/dev/null || true
  # http-server.js reserves 15 seconds for accepted durable work to drain.
  # Never force-kill before that deadline has elapsed.
  for attempt in {1..100}; do
    if ! backend_process_matches "$pid" "$fingerprint"; then
      remove_owned_pid_file "$pid"
      return 0
    fi
    sleep 0.2
  done

  if backend_process_matches "$pid" "$fingerprint"; then
    kill -KILL "$pid" 2>/dev/null || true
  fi
  for attempt in {1..25}; do
    if ! backend_process_matches "$pid" "$fingerprint"; then
      remove_owned_pid_file "$pid"
      return 0
    fi
    sleep 0.2
  done
  return 1
}

read_controller_state() {
  STATE_PID=""
  STATE_TTY=""
  STATE_TOKEN=""
  STATE_BACKEND_PID=""
  STATE_BACKEND_FINGERPRINT=""
  [[ -f "$STATE_FILE" ]] || return 1
  IFS='|' read -r STATE_PID STATE_TTY STATE_TOKEN STATE_BACKEND_PID STATE_BACKEND_FINGERPRINT \
    < "$STATE_FILE" || return 1
  [[ "$STATE_PID" == <-> && "$STATE_BACKEND_PID" == <-> && -n "$STATE_TOKEN" \
    && -n "$STATE_BACKEND_FINGERPRINT" ]]
}

owns_controller_state() {
  read_controller_state || return 1
  [[ "$STATE_PID" == "$$" && "$STATE_TOKEN" == "$CONTROLLER_TOKEN" ]]
}

write_controller_state() {
  local temp_state="$STATE_FILE.$$"
  [[ "$BACKEND_PID" == <-> && -n "$BACKEND_FINGERPRINT" ]] || return 1
  [[ "$TERMINAL_WINDOW_TTY" != *'|'* && "$BACKEND_FINGERPRINT" != *'|'* ]] || return 1
  printf '%s|%s|%s|%s|%s\n' \
    "$$" "$TERMINAL_WINDOW_TTY" "$CONTROLLER_TOKEN" \
    "$BACKEND_PID" "$BACKEND_FINGERPRINT" > "$temp_state" || return 1
  chmod 600 "$temp_state" || return 1
  mv -f "$temp_state" "$STATE_FILE" || return 1
  STATE_WRITTEN=1
}

lock_owner_matches() {
  local owner_pid=""
  local owner_token=""
  [[ -f "$LOCK_OWNER_FILE" ]] || return 1
  IFS='|' read -r owner_pid owner_token < "$LOCK_OWNER_FILE" || return 1
  [[ "$owner_pid" == "$$" && "$owner_token" == "$CONTROLLER_TOKEN" ]]
}

release_startup_lock() {
  (( LOCK_OWNED == 1 )) || return 0
  if lock_owner_matches; then
    rm -f "$LOCK_OWNER_FILE"
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
  LOCK_OWNED=0
}

acquire_startup_lock() {
  local attempt
  local missing_owner_attempts=0
  local owner_pid=""
  local owner_token=""

  for attempt in {1..240}; do
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      if ! printf '%s|%s\n' "$$" "$CONTROLLER_TOKEN" > "$LOCK_OWNER_FILE" \
        || ! chmod 600 "$LOCK_OWNER_FILE"; then
        rm -f "$LOCK_OWNER_FILE"
        rmdir "$LOCK_DIR" 2>/dev/null || true
        return 1
      fi
      LOCK_OWNED=1
      return 0
    fi

    owner_pid=""
    owner_token=""
    if [[ -f "$LOCK_OWNER_FILE" ]]; then
      IFS='|' read -r owner_pid owner_token < "$LOCK_OWNER_FILE" || true
    fi
    if [[ "$owner_pid" == <-> ]] && launcher_pid_matches "$owner_pid"; then
      missing_owner_attempts=0
      sleep 0.1
      continue
    fi

    (( missing_owner_attempts += 1 ))
    if (( missing_owner_attempts >= 5 )); then
      rm -f "$LOCK_OWNER_FILE"
      rmdir "$LOCK_DIR" 2>/dev/null || true
      missing_owner_attempts=0
    fi
    sleep 0.1
  done
  return 1
}

cleanup_owned_resources() {
  local may_stop_backend=0

  if [[ -n "$TAIL_PID" ]]; then
    kill "$TAIL_PID" 2>/dev/null || true
    wait "$TAIL_PID" 2>/dev/null || true
    TAIL_PID=""
  fi

  if (( STATE_WRITTEN == 0 )); then
    may_stop_backend=1
    if [[ -z "$BACKEND_PID" ]]; then
      # A HUP can arrive while `ops restart` is between spawning the detached
      # server and returning control to this shell. Recover only a process that
      # passes the exact Beastbound cwd/command identity check.
      capture_backend_identity >/dev/null 2>&1 || true
    fi
  elif owns_controller_state; then
    may_stop_backend=1
  fi

  if (( may_stop_backend == 1 )) && [[ "$BACKEND_PID" == <-> && -n "$BACKEND_FINGERPRINT" ]]; then
    set_terminal_title "🟡 万兽纪元后端｜正在安全停止服务..."
    printf "\n\n正在等待万兽纪元后端安全停止...\n"
    if stop_exact_backend "$BACKEND_PID" "$BACKEND_FINGERPRINT"; then
      printf "\n后端服务已停止。\n"
    else
      printf "\n错误：后端未能在安全期限内停止，请检查进程 %s。\n" "$BACKEND_PID" >&2
    fi
  fi

  if owns_controller_state; then
    rm -f "$STATE_FILE"
  fi
  release_startup_lock
  BACKEND_PID=""
  BACKEND_FINGERPRINT=""
  STATE_WRITTEN=0
}

shutdown_controller() {
  local exit_status="${1:-0}"
  (( SHUTTING_DOWN == 0 )) || return 0
  SHUTTING_DOWN=1
  trap - HUP INT TERM EXIT
  cleanup_owned_resources
  set_terminal_title "⚫ 万兽纪元后端｜服务已停止"
  exit "$exit_status"
}

fail() {
  local message="$1"
  printf "\n错误：%s\n" "$message" >&2
  if (( CONTROLLER_MODE == 1 )); then
    cleanup_owned_resources
    SHUTTING_DOWN=1
    trap - HUP INT TERM EXIT
  fi
  set_terminal_title "🔴 万兽纪元后端｜启动失败"
  pause_before_close
  exit 1
}

state_tty_for_launcher_pid() {
  local launcher_pid="$1"
  local raw=""
  [[ -f "$STATE_FILE" ]] || return 1
  IFS= read -r raw < "$STATE_FILE" || return 1
  if [[ "$raw" == *'|'* ]]; then
    local state_pid=""
    local state_tty=""
    IFS='|' read -r state_pid state_tty _ <<< "$raw"
    [[ "$state_pid" == "$launcher_pid" ]] || return 1
    printf '%s\n' "$state_tty"
    return 0
  fi
  return 1
}

stop_previous_launchers() {
  local -a old_pids
  local -a old_terminal_ttys
  local pid
  local old_tty
  local attempt
  local alive

  while IFS= read -r pid; do
    [[ "$pid" == <-> ]] || continue
    launcher_pid_matches "$pid" || continue
    old_pids+=("$pid")
    old_tty="$(state_tty_for_launcher_pid "$pid" 2>/dev/null || true)"
    if [[ -z "$old_tty" ]]; then
      old_tty="$(terminal_window_tty_for_pid "$pid" 2>/dev/null || true)"
    fi
    [[ -n "$old_tty" ]] && old_terminal_ttys+=("$old_tty")
  done < <(pgrep -f "$SCRIPT_PATH" 2>/dev/null || true)

  if (( ${#old_pids[@]} == 0 )); then
    if read_controller_state && ! launcher_pid_matches "$STATE_PID"; then
      rm -f "$STATE_FILE"
    fi
    return 0
  fi

  printf "\n检测到旧的后端控制台，正在等待它安全停止...\n"
  for pid in "${old_pids[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done

  # The old controller itself waits through the backend's 15-second durable
  # drain. Never start a replacement while that controller is still alive.
  for attempt in {1..120}; do
    alive=0
    for pid in "${old_pids[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        alive=1
        break
      fi
    done
    (( alive == 0 )) && break
    sleep 0.2
  done
  if (( alive != 0 )); then
    return 1
  fi

  for old_tty in "${old_terminal_ttys[@]}"; do
    close_terminal_tab "$old_tty"
  done
  return 0
}

health_ready() {
  node - "$AUTH_PORT" <<'NODE'
const http = require("node:http");
const port = Number(process.argv[2] || 8787);
const req = http.request({host: "127.0.0.1", port, path: "/health", method: "GET", timeout: 1000}, (res) => {
  const chunks = [];
  res.on("data", (chunk) => chunks.push(chunk));
  res.on("end", () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      process.exit(body && body.ok === true
        && body.service === "beastbound-auth"
        && body.storage && body.storage.ok === true ? 0 : 1);
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
  printf "\n等待后端健康检查"
  local attempt
  for attempt in {1..30}; do
    if health_ready; then
      printf "，已就绪。\n"
      return 0
    fi
    printf "."
    sleep 0.5
  done
  printf "，仍未就绪。\n"
  return 1
}

capture_backend_identity() {
  local attempt
  local pid=""
  local fingerprint=""
  for attempt in {1..30}; do
    pid="$(pid_file_value 2>/dev/null || true)"
    if [[ "$pid" == <-> ]]; then
      fingerprint="$(backend_process_fingerprint "$pid")"
      if backend_process_matches "$pid" "$fingerprint"; then
        BACKEND_PID="$pid"
        BACKEND_FINGERPRINT="$fingerprint"
        return 0
      fi
    fi
    sleep 0.1
  done
  return 1
}

[[ -d "$SERVER_DIR" ]] || fail "找不到服务端目录：$SERVER_DIR"
mkdir -p "$LOCAL_DIR" || fail "无法创建本地运行目录：$LOCAL_DIR"
chmod 700 "$LOCAL_DIR" 2>/dev/null || true
[[ ! -e "$LOG_FILE" ]] || chmod 600 "$LOG_FILE" 2>/dev/null || true

if [[ -f "$SERVER_DIR/.local/mysql.env" ]]; then
  env_port="$(sed -n -E "s/^export BEASTBOUND_AUTH_PORT=['\"]?([^'\"]+)['\"]?$/\1/p" "$SERVER_DIR/.local/mysql.env" | tail -n 1)"
  [[ -n "$env_port" ]] && AUTH_PORT="$env_port"
fi

command -v node >/dev/null 2>&1 || fail "未找到 Node.js，请安装 Node.js 22+ 或把它加入 PATH。"
command -v npm >/dev/null 2>&1 || fail "未找到 npm，请安装 Node.js/npm 或把它加入 PATH。"
command -v lsof >/dev/null 2>&1 || fail "未找到 lsof，无法安全识别后端进程。"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' \
  || fail "需要 Node.js 22+，当前版本：$(node -v)"

if (( CONTROLLER_MODE == 1 )); then
  TERMINAL_WINDOW_TTY="$(terminal_window_tty_for_pid "$$" 2>/dev/null || true)"
  set_terminal_title "🟡 万兽纪元后端｜正在启动..."
  trap 'shutdown_controller 129' HUP
  trap 'shutdown_controller 130' INT
  trap 'shutdown_controller 143' TERM
  trap 'shutdown_controller $?' EXIT
  acquire_startup_lock || fail "另一个启动器长时间未完成，请稍后重试。"
  stop_previous_launchers || fail "旧后端控制台未能安全退出，已取消本次重启。"
  printf '\033[2J\033[H'
fi

cd "$SERVER_DIR" || fail "无法进入服务端目录：$SERVER_DIR"
printf "\n正在安全重启万兽纪元后端...\n\n"
npm run ops -- restart
start_status=$?

if (( start_status == 0 )) && (( CONTROLLER_MODE == 1 )); then
  capture_backend_identity || fail "后端已启动，但无法认证其进程身份。"
fi

health_status=1
if (( start_status == 0 )); then
  wait_for_health
  health_status=$?
fi

if (( start_status != 0 || health_status != 0 )); then
  printf "\n后端状态：\n\n"
  npm run ops -- status || true
  if (( CONTROLLER_MODE == 0 && start_status == 0 )); then
    npm run ops -- stop || true
  fi
  fail "后端启动失败，请检查上面的状态和日志：$LOG_FILE"
fi

if (( CONTROLLER_MODE == 0 )); then
  printf "\n后端状态：\n\n"
  npm run ops -- status || true
  printf "\n本机地址：http://127.0.0.1:%s\n" "$AUTH_PORT"
  printf "日志文件：%s\n" "$LOG_FILE"
  printf "\n后端已成功重启。\n"
  exit 0
fi

write_controller_state || fail "无法写入后端控制台所有权状态。"
release_startup_lock
set_terminal_title "🟢 万兽纪元后端｜运行中｜关闭此窗口将安全停服"
printf '\033[2J\033[H'
printf "============================================================\n"
printf "                 万兽纪元 · 后端服务控制台                 \n"
printf "============================================================\n\n"
printf "状态：🟢 正在运行\n"
printf "本机地址：http://127.0.0.1:%s\n" "$AUTH_PORT"
printf "日志文件：%s\n\n" "$LOG_FILE"
printf "⚠️  请勿关闭此窗口：关闭窗口会先等待在途存档安全完成，再停止后端。\n"
printf "⚠️  再次双击 start-backend.command 会等待本窗口安全退出，\n"
printf "    然后在唯一的新窗口中启动替代后端。\n\n"
printf "------------------------- 实时日志 -------------------------\n"

touch "$LOG_FILE" || fail "无法打开后端日志：$LOG_FILE"
chmod 600 "$LOG_FILE" 2>/dev/null || true
tail -n 40 -F "$LOG_FILE" &
TAIL_PID=$!

while backend_process_matches "$BACKEND_PID" "$BACKEND_FINGERPRINT"; do
  kill -0 "$TAIL_PID" 2>/dev/null || fail "实时日志进程意外退出。"
  sleep 1
done

fail "后端进程已退出或被外部操作替换，本窗口不会误杀新的进程。"
