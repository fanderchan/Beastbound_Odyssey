"use strict";

const {createAuthService, createMemoryAuthStore} = require("../src/auth-service");
const {createHttpServer} = require("../src/http-server");

let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
const port = Math.max(1, Math.trunc(Number(process.env.BEASTBOUND_QA_PORT || 8787)));
const store = createMemoryAuthStore();
const service = createAuthService({
  store,
  now: () => nowMs,
  allowPositionTeleport: true,
});
const server = createHttpServer({
  service,
  store,
  logger: {info() {}, error() {}},
  qaAdvanceClock(payload = {}) {
    const seconds = Math.trunc(Number(payload.seconds || 0));
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 24 * 60 * 60) {
      return {ok: false, code: "qa_clock_invalid", message: "隔离测试时钟参数不正确。"};
    }
    nowMs += seconds * 1000;
    return {ok: true, now: new Date(nowMs).toISOString(), advancedSeconds: seconds};
  },
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`offline hang live server ready: http://127.0.0.1:${port}\n`);
});

function stop() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
