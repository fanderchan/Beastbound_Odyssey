"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const {AsyncLocalStorage} = require("node:async_hooks");
const {
  createAuthService,
  createAsyncWriteAuthStore,
  createJsonAuthStore,
} = require("./auth-service");
const {
  createMysqlAuthStore,
} = require("./mysql-store");
const {
  createEventHub,
} = require("./event-hub");
const {
  attachProtocolMetadata,
  protocolCompatibility,
  protocolMismatchResult,
} = require("./protocol");

const DEFAULT_COMMAND_CATALOG = [
  {"id": "gm_map", "label": "进入GM测试场"},
  {"id": "gm_grant_pet", "label": "获取测试宠物"},
  {"id": "gm_level_pet", "label": "宠物升1级"},
  {"id": "gm_battle_speed_gear", "label": "变速齿轮"},
  {"id": "gm_market_tax", "label": "交易所税率配置"},
  {"id": "gm_offline_hang_config", "label": "离线挂机配置"},
  {"id": "gm_prepare_qa_profile", "label": "补齐GM核心测试档案"},
];

const DURABLE_HTTP_SERVICE_METHODS = new Set([
  "register",
  "login",
  "refreshSession",
  "logout",
  "getSession",
  "getProfile",
  "listOnlinePlayers",
  "updatePlayerPosition",
  "grantGmPet",
  "levelUpGmPet",
  "prepareGmQaProfile",
  "authorizeGmCommand",
  "getMarketConfig",
  "updateMarketConfig",
  "getOfflineHangConfig",
  "updateOfflineHangConfig",
  "offlineHangStatus",
  "startOfflineHang",
  "claimOfflineHang",
  "cancelOfflineHang",
  "profileAction",
  "shopTransaction",
  "bankDeposit",
  "bankWithdraw",
  "createMarketListing",
  "buyMarketListing",
  "cancelMarketListing",
  "acceptTrade",
  "equipmentEquip",
  "equipmentUnequip",
  "equipmentEnhance",
  "equipmentRepairAll",
  "equipmentSynthesize",
  "playerRebirth",
  "questRecord",
  "questClaim",
  "startHangSession",
  "stopHangSession",
  "sendMail",
  "markMailRead",
  "claimMailAttachments",
  "sendChatMessage",
  "createFamily",
  "joinFamily",
  "leaveFamily",
  "challengeManor",
  "startManorWarBattleRoom",
  "enterManorWar",
  "leaveManorWar",
  "resolveManorWar",
  "getBattleState",
  "inviteToBattle",
  "startPartyEncounter",
  "acceptBattleInvite",
  "declineBattleInvite",
  "cancelBattleInvite",
  "submitBattleCommand",
  "leaveBattleRoom",
  "getPartyState",
  "inviteToParty",
  "applyToParty",
  "acceptPartyInvite",
  "declinePartyInvite",
  "leaveParty",
]);

function createHttpServer(options = {}) {
  const baseService = options.service || createAuthService();
  const requestContexts = new AsyncLocalStorage();
  const service = createDurableHttpServiceProxy(baseService, requestContexts);
  const commandCatalog = options.commandCatalog || DEFAULT_COMMAND_CATALOG;
  const eventHub = options.eventHub || createEventHub(baseService);
  const store = options.store || null;
  const logger = createStructuredLogger(options.logger);
  const qaAdvanceClock = typeof options.qaAdvanceClock === "function" ? options.qaAdvanceClock : null;
  const unsubscribeServiceLogger = installServiceEventLogger(baseService, logger);

  const server = http.createServer((req, res) => requestContexts.run({req}, () => handleRequest(req, res)));

  async function handleRequest(req, res) {
    const startedAt = process.hrtime.bigint();
    const url = new URL(req.url || "/", "http://127.0.0.1");
    res.beastboundLogger = logger;
    res.beastboundRequestContext = {
      method: String(req.method || ""),
      path: url.pathname,
      startedAt,
    };
    res.on("finish", () => {
      logStructured(logger, {
        type: "http.request",
        method: String(req.method || ""),
        path: url.pathname,
        statusCode: res.statusCode,
        ok: res.statusCode < 400,
        durationMs: durationMsSince(startedAt),
      });
    });
    try {
      if (req.method === "GET" && url.pathname === "/health") {
        const health = healthPayload(store, eventHub, baseService);
        return sendJson(res, health.ok ? 200 : 503, health);
      }
      if (req.method === "POST" && url.pathname === "/__qa/clock/advance" && qaAdvanceClock) {
        return sendResult(res, qaAdvanceClock(await readJson(req)));
      }
      const protocol = protocolCompatibility(req, url);
      if (!protocol.ok) {
        return sendJson(res, 426, protocolMismatchResult(protocol));
      }
      if (req.method === "POST" && url.pathname === "/auth/register") {
        return sendResult(res, service.register(authPayload(req, await readJson(req))));
      }
      if (req.method === "POST" && url.pathname === "/auth/login") {
        return sendResult(res, service.login(authPayload(req, await readJson(req))));
      }
      if (req.method === "POST" && url.pathname === "/auth/refresh") {
        const payload = await readJson(req);
        return sendResult(res, service.refreshSession(bearerToken(req) || String(payload.token || "")));
      }
      if (req.method === "POST" && url.pathname === "/auth/logout") {
        return sendResult(res, service.logout(bearerToken(req)));
      }
      if (req.method === "GET" && url.pathname === "/auth/session") {
        return sendResult(res, service.getSession(bearerToken(req)));
      }
      if (req.method === "GET" && url.pathname === "/events/latest") {
        const session = await Promise.resolve(service.getSession(bearerToken(req)));
        if (!session.ok) {
          return sendResult(res, session);
        }
        return sendJson(res, 200, {"ok": true, "latestEventSeq": service.latestEventSeq()});
      }
      if (req.method === "GET" && url.pathname === "/players/search") {
        return sendResult(res, service.searchPlayers(bearerToken(req), {"username": url.searchParams.get("username") || ""}));
      }
      if (req.method === "GET" && url.pathname === "/players/online") {
        return sendResult(res, service.listOnlinePlayers(bearerToken(req), {
          "scope": url.searchParams.get("scope") || "",
          "mapId": url.searchParams.get("mapId") || "",
          "cellX": url.searchParams.get("cellX") || "",
          "cellY": url.searchParams.get("cellY") || "",
          "radius": url.searchParams.get("radius") || "",
        }));
      }
      if (req.method === "POST" && url.pathname === "/players/position") {
        return sendResult(res, service.updatePlayerPosition(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/movement/step") {
        return sendResult(res, service.movePlayerStep(bearerToken(req), await readJson(req)));
      }
      if (req.method === "GET" && url.pathname === "/gm/tools") {
        return sendResult(res, service.listGmTools(bearerToken(req), commandCatalog));
      }
      if (req.method === "POST" && url.pathname.startsWith("/gm/commands/")) {
        const commandId = decodeURIComponent(url.pathname.slice("/gm/commands/".length));
        if (commandId === "gm_grant_pet") {
          return sendResult(res, service.grantGmPet(bearerToken(req), await readJson(req)));
        }
        if (commandId === "gm_level_pet") {
          return sendResult(res, service.levelUpGmPet(bearerToken(req), await readJson(req)));
        }
        if (commandId === "gm_prepare_qa_profile") {
          const idempotencyFailure = requiredIdempotencyKeyFailure(req);
          if (idempotencyFailure) {
            return sendResult(res, idempotencyFailure);
          }
          return sendResult(res, service.prepareGmQaProfile(bearerToken(req), await readJson(req)));
        }
        return sendResult(res, service.authorizeGmCommand({"token": bearerToken(req), commandId}));
      }
      if (req.method === "GET" && url.pathname === "/gm/market/config") {
        return sendResult(res, service.getMarketConfig(bearerToken(req)));
      }
      if (req.method === "PUT" && url.pathname === "/gm/market/config") {
        return sendResult(res, service.updateMarketConfig(bearerToken(req), await readJson(req)));
      }
      if (req.method === "GET" && url.pathname === "/gm/hang/offline/config") {
        return sendResult(res, service.getOfflineHangConfig(bearerToken(req)));
      }
      if (req.method === "PUT" && url.pathname === "/gm/hang/offline/config") {
        return sendResult(res, service.updateOfflineHangConfig(bearerToken(req), await readJson(req)));
      }
      if (req.method === "GET" && url.pathname === "/hang/offline/status") {
        return sendResult(res, service.offlineHangStatus(bearerToken(req)));
      }
      if (req.method === "POST" && url.pathname === "/hang/offline/start") {
        return sendResult(res, service.startOfflineHang(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/hang/offline/claim") {
        return sendResult(res, service.claimOfflineHang(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/hang/offline/cancel") {
        await readJson(req);
        return sendResult(res, service.cancelOfflineHang(bearerToken(req)));
      }
      if (req.method === "GET" && url.pathname === "/profiles/me") {
        return sendResult(res, service.getProfile(bearerToken(req)));
      }
      if (req.method === "PUT" && url.pathname === "/profiles/me") {
        await readJson(req);
        return sendJson(res, 403, {
          ok: false,
          code: "profile_upload_denied",
          message: "角色档案由服务器专用接口写入，禁止客户端整档上传。",
        });
      }
      if (req.method === "POST" && url.pathname === "/profile/action") {
        return sendResult(res, service.profileAction(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/shops/transaction") {
        return sendResult(res, service.shopTransaction(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/bank/deposit") {
        return sendResult(res, service.bankDeposit(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/bank/withdraw") {
        return sendResult(res, service.bankWithdraw(bearerToken(req), await readJson(req)));
      }
      if (req.method === "GET" && url.pathname === "/market/listings") {
        return sendResult(res, service.marketListings(bearerToken(req), Object.fromEntries(url.searchParams.entries())));
      }
      if (req.method === "POST" && url.pathname === "/market/list") {
        return sendResult(res, service.createMarketListing(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/market/buy") {
        return sendResult(res, service.buyMarketListing(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/market/cancel") {
        return sendResult(res, service.cancelMarketListing(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/trade/propose") {
        return sendResult(res, service.proposeTrade(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/trade/accept") {
        return sendResult(res, service.acceptTrade(bearerToken(req), await readJson(req)));
      }
      if (req.method === "GET" && url.pathname === "/trade/state") {
        return sendResult(res, service.tradeState(bearerToken(req)));
      }
      if (req.method === "POST" && url.pathname === "/trade/cancel") {
        return sendResult(res, service.cancelTrade(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/equipment/equip") {
        return sendResult(res, service.equipmentEquip(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/equipment/unequip") {
        return sendResult(res, service.equipmentUnequip(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/equipment/enhance") {
        return sendResult(res, service.equipmentEnhance(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/equipment/repair-all") {
        return sendResult(res, service.equipmentRepairAll(bearerToken(req)));
      }
      if (req.method === "POST" && url.pathname === "/equipment/synthesize") {
        return sendResult(res, service.equipmentSynthesize(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/player/rebirth") {
        return sendResult(res, service.playerRebirth(bearerToken(req)));
      }
      if (req.method === "POST" && url.pathname === "/quests/record") {
        return sendResult(res, service.questRecord(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/quests/claim") {
        return sendResult(res, service.questClaim(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/hang/session/start") {
        return sendResult(res, service.startHangSession(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/hang/session/stop") {
        return sendResult(res, service.stopHangSession(bearerToken(req), await readJson(req)));
      }
      if (req.method === "GET" && url.pathname === "/mail/inbox") {
        return sendResult(res, service.listInbox(bearerToken(req)));
      }
      if (req.method === "POST" && url.pathname === "/mail/send") {
        return sendResult(res, service.sendMail(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname.startsWith("/mail/") && url.pathname.endsWith("/read")) {
        const mailId = decodeURIComponent(url.pathname.slice("/mail/".length, -"/read".length));
        return sendResult(res, service.markMailRead(bearerToken(req), mailId));
      }
      if (req.method === "POST" && url.pathname.startsWith("/mail/") && url.pathname.endsWith("/claim")) {
        const mailId = decodeURIComponent(url.pathname.slice("/mail/".length, -"/claim".length));
        return sendResult(res, service.claimMailAttachments(bearerToken(req), mailId));
      }
      if (req.method === "GET" && url.pathname === "/chat/messages") {
        return sendResult(res, service.listChatMessages(bearerToken(req), {
          "channel": url.searchParams.get("channel") || "",
          "limit": url.searchParams.get("limit") || "",
        }));
      }
      if (req.method === "POST" && url.pathname === "/chat/send") {
        return sendResult(res, service.sendChatMessage(bearerToken(req), await readJson(req)));
      }
      if (req.method === "GET" && url.pathname === "/families/state") {
        return sendResult(res, service.getFamilyState(bearerToken(req)));
      }
      if (req.method === "GET" && url.pathname === "/families") {
        return sendResult(res, service.listFamilies(bearerToken(req)));
      }
      if (req.method === "POST" && url.pathname === "/families/create") {
        return sendResult(res, service.createFamily(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/families/join") {
        return sendResult(res, service.joinFamily(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/families/leave") {
        return sendResult(res, service.leaveFamily(bearerToken(req)));
      }
      if (req.method === "GET" && url.pathname === "/manors") {
        return sendResult(res, service.listManors(bearerToken(req)));
      }
      if (req.method === "POST" && url.pathname === "/manors/challenge") {
        return sendResult(res, service.challengeManor(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/manors/battle-room") {
        return sendResult(res, service.startManorWarBattleRoom(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/manors/enter") {
        return sendResult(res, service.enterManorWar(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/manors/leave") {
        return sendResult(res, service.leaveManorWar(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/manors/resolve") {
        return sendResult(res, service.resolveManorWar(bearerToken(req), await readJson(req)));
      }
      if (req.method === "GET" && url.pathname === "/battle/state") {
        return sendResult(res, service.getBattleState(bearerToken(req)));
      }
      if (req.method === "GET" && url.pathname === "/battle/debug/trace") {
        return sendResult(res, service.getBattleTrace(bearerToken(req), {
          "roomId": url.searchParams.get("roomId") || "",
          "limit": url.searchParams.get("limit") || "",
        }));
      }
      if (req.method === "GET" && url.pathname === "/battle/records/summary") {
        return sendResult(res, service.getBattleRecordSummary(bearerToken(req), {
          "username": url.searchParams.get("username") || "",
        }));
      }
      if (req.method === "POST" && url.pathname === "/battle/invite") {
        return sendResult(res, service.inviteToBattle(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/battle/party-encounter") {
        return sendResult(res, service.startPartyEncounter(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname.startsWith("/battle/invites/") && url.pathname.endsWith("/accept")) {
        const inviteId = decodeURIComponent(url.pathname.slice("/battle/invites/".length, -"/accept".length));
        return sendResult(res, service.acceptBattleInvite(bearerToken(req), inviteId));
      }
      if (req.method === "POST" && url.pathname.startsWith("/battle/invites/") && url.pathname.endsWith("/decline")) {
        const inviteId = decodeURIComponent(url.pathname.slice("/battle/invites/".length, -"/decline".length));
        return sendResult(res, service.declineBattleInvite(bearerToken(req), inviteId));
      }
      if (req.method === "POST" && url.pathname.startsWith("/battle/invites/") && url.pathname.endsWith("/cancel")) {
        const inviteId = decodeURIComponent(url.pathname.slice("/battle/invites/".length, -"/cancel".length));
        return sendResult(res, service.cancelBattleInvite(bearerToken(req), inviteId));
      }
      if (req.method === "POST" && url.pathname.startsWith("/battle/rooms/") && url.pathname.endsWith("/commands")) {
        const roomId = decodeURIComponent(url.pathname.slice("/battle/rooms/".length, -"/commands".length));
        return sendResult(res, service.submitBattleCommand(bearerToken(req), roomId, await readJson(req)));
      }
      if (req.method === "POST" && url.pathname.startsWith("/battle/rooms/") && url.pathname.endsWith("/leave")) {
        const roomId = decodeURIComponent(url.pathname.slice("/battle/rooms/".length, -"/leave".length));
        return sendResult(res, service.leaveBattleRoom(bearerToken(req), roomId));
      }
      if (req.method === "GET" && url.pathname === "/party/state") {
        return sendResult(res, service.getPartyState(bearerToken(req)));
      }
      if (req.method === "POST" && url.pathname === "/party/invite") {
        return sendResult(res, service.inviteToParty(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/party/apply") {
        return sendResult(res, service.applyToParty(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname.startsWith("/party/invites/") && url.pathname.endsWith("/accept")) {
        const inviteId = decodeURIComponent(url.pathname.slice("/party/invites/".length, -"/accept".length));
        return sendResult(res, service.acceptPartyInvite(bearerToken(req), inviteId));
      }
      if (req.method === "POST" && url.pathname.startsWith("/party/invites/") && url.pathname.endsWith("/decline")) {
        const inviteId = decodeURIComponent(url.pathname.slice("/party/invites/".length, -"/decline".length));
        return sendResult(res, service.declinePartyInvite(bearerToken(req), inviteId));
      }
      if (req.method === "POST" && url.pathname === "/party/leave") {
        return sendResult(res, service.leaveParty(bearerToken(req)));
      }
      return sendJson(res, 404, {"ok": false, "code": "not_found", "message": "接口不存在。"});
    } catch (error) {
      return sendServiceError(res, error);
    }
  }
  server.on("close", unsubscribeServiceLogger);
  server.on("upgrade", (req, socket, head) => {
    Promise.resolve(eventHub.handleUpgrade(req, socket, head)).then((handled) => {
      if (!handled && !socket.destroyed) {
        socket.destroy();
      }
    }).catch((error) => {
      // 存储写失败等异常不允许击穿升级回调导致进程崩溃；直接断开该连接。
      console.error(`Beastbound websocket upgrade failed: ${error.message}`);
      if (!socket.destroyed) {
        socket.destroy();
      }
    });
  });
  server.eventHub = eventHub;
  server.authService = baseService;
  if (options.store) {
    server.authStore = options.store;
  }
  return server;
}

function createDurableHttpServiceProxy(service, requestContexts) {
  return new Proxy(service, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (
        typeof value !== "function"
        || !DURABLE_HTTP_SERVICE_METHODS.has(String(property))
        || typeof target.invokeDurable !== "function"
      ) {
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (...args) => {
        const context = requestContexts.getStore() || {};
        const req = context.req || null;
        const method = String(req && req.method || "").toUpperCase();
        const pathName = String(req && new URL(req.url || "/", "http://127.0.0.1").pathname || "");
        const actionId = `${method || "INTERNAL"} ${pathName || String(property)}`;
        const operationId = String(req && req.headers && req.headers["idempotency-key"] || "").trim();
        const authToken = req ? bearerToken(req) : "";
        return target.invokeDurable(String(property), args, {
          operationId,
          actionId,
          requestHash: durableRequestHash(method, pathName, property, args, authToken),
        });
      };
    },
  });
}

function durableRequestHash(method, pathName, serviceMethod, args, authToken = "") {
  return crypto.createHash("sha256").update(stableJson({
    method: String(method || ""),
    path: String(pathName || ""),
    serviceMethod: String(serviceMethod || ""),
    args: durableIntentArgs(args, authToken),
  })).digest("hex");
}

function durableIntentArgs(args, authToken) {
  const values = Array.isArray(args) ? args : [];
  const token = String(authToken || "");
  // Authenticated service methods receive bearerToken(req) as their first
  // argument. The token proves who may execute/replay the intent, but it is not
  // part of what the player asked to do and may rotate between safe retries.
  if (token !== "" && values[0] === token) {
    return values.slice(1);
  }
  if (
    token !== ""
    && values[0]
    && typeof values[0] === "object"
    && !Array.isArray(values[0])
    && values[0].token === token
  ) {
    const credentialPayload = {...values[0]};
    delete credentialPayload.token;
    return [credentialPayload, ...values.slice(1)];
  }
  return values;
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

async function sendResult(res, resultValue) {
  let result;
  try {
    result = await Promise.resolve(resultValue);
  } catch (error) {
    return sendServiceError(res, error);
  }
  let status = 200;
  if (result.ok) {
    logProfileWriteback(res.beastboundLogger, res.beastboundRequestContext, result, status);
    return sendJson(res, 200, result);
  }
  status = 400;
  if (result.code === "auth_rate_limited" || result.code === "auth_backoff") {
    status = 429;
  } else if (result.code && result.code.includes("denied")) {
    status = 403;
  } else if (result.code === "revision_conflict" || result.code === "idempotency_key_conflict") {
    status = 409;
  } else if (result.code === "protocol_version_mismatch" || result.code === "client_version_missing") {
    status = 426;
  }
  logProfileWriteback(res.beastboundLogger, res.beastboundRequestContext, result, status);
  return sendJson(res, status, result);
}

function sendServiceError(res, error) {
  const code = String(error && error.code || "");
  if ([
    "storage_write_failed",
    "storage_commit_timeout",
    "storage_queue_full",
    "storage_outcome_unknown",
    "storage_shutting_down",
    "durable_context_required",
  ].includes(code)) {
    const publicCode = code === "durable_context_required" ? "storage_write_failed" : code;
    const fallback = code === "storage_commit_timeout"
      ? "服务器正在确认存档，请使用同一操作重试。"
      : "服务器存档暂时不可用，请稍后使用同一操作重试。";
    return sendJson(res, 503, {ok: false, code: publicCode, message: String(error && error.message || fallback)});
  }
  return sendJson(res, 500, {ok: false, code: "server_error", message: "服务器暂时异常，请稍后重试。"});
}

function sendJson(res, status, body) {
  const text = JSON.stringify(attachProtocolMetadata(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) {
        return resolve({});
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(new Error("请求JSON格式不正确。"));
      }
    });
    req.on("error", reject);
  });
}

function bearerToken(req) {
  const header = String(req.headers.authorization || "");
  if (!header.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return header.slice("bearer ".length).trim();
}

function requiredIdempotencyKeyFailure(req) {
  const operationId = String(req && req.headers && req.headers["idempotency-key"] || "").trim();
  return operationId === "" ? {
    ok: false,
    code: "idempotency_key_required",
    message: "本操作需要有效的操作标识，请刷新后重试。",
  } : null;
}

function authPayload(req, payload) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  return {
    ...source,
    clientIp: requestClientIp(req),
  };
}

function requestClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (forwarded !== "") {
    return forwarded;
  }
  return String(req.socket && req.socket.remoteAddress || "");
}

function healthPayload(store, eventHub, service = null) {
  const storage = storageHealth(store);
  return {
    ok: storage.ok !== false,
    service: "beastbound-auth",
    storage,
    eventStream: {
      clients: eventHub && typeof eventHub.clientCount === "function" ? eventHub.clientCount() : 0,
    },
    durableMutations: service && typeof service.durableMutationMetrics === "function"
      ? service.durableMutationMetrics()
      : {checked: false},
  };
}

function storageHealth(store) {
  const mode = storeMode(store);
  if (!store || typeof store.load !== "function") {
    return {
      ok: null,
      checked: false,
      mode,
      message: "未提供存储实例，跳过存储连通性检查。",
    };
  }
  const startedAt = process.hrtime.bigint();
  try {
    store.load();
    return {
      ok: true,
      checked: true,
      mode,
      latencyMs: durationMsSince(startedAt),
    };
  } catch (error) {
    return {
      ok: false,
      checked: true,
      mode,
      latencyMs: durationMsSince(startedAt),
      message: error.message,
    };
  }
}

function storeMode(store) {
  if (!store) {
    return "unknown";
  }
  return String(store.mode || store.kind || store.storeMode || "custom");
}

function createStructuredLogger(logger) {
  if (logger === false) {
    return null;
  }
  if (typeof logger === "function") {
    return logger;
  }
  if (logger && typeof logger.log === "function") {
    return (entry) => logger.log(entry);
  }
  if (process.env.BEASTBOUND_STRUCTURED_LOGS === "1") {
    return (entry) => console.log(JSON.stringify(entry));
  }
  return null;
}

function logStructured(logger, entry) {
  if (typeof logger !== "function") {
    return;
  }
  try {
    logger({
      ...entry,
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Logging must not affect gameplay or auth responses.
  }
}

function logProfileWriteback(logger, context, result, statusCode) {
  if (!result || !result.ok || !result.profileSummary || !context || context.method === "GET") {
    return;
  }
  const summary = result.profileSummary && typeof result.profileSummary === "object" && !Array.isArray(result.profileSummary)
    ? result.profileSummary
    : {};
  logStructured(logger, {
    type: "profile.writeback",
    method: context.method,
    path: context.path,
    statusCode,
    playerId: String(summary.playerId || ""),
    profileRevision: Number(summary.profileRevision || 0),
    storageMode: String(summary.storageMode || ""),
    serverAuthority: String(summary.serverAuthority || ""),
  });
}

function installServiceEventLogger(service, logger) {
  if (!service || typeof service.onEvent !== "function" || typeof logger !== "function") {
    return () => {};
  }
  return service.onEvent((event) => {
    if (!event || event.type !== "battle.room_closed") {
      return;
    }
    const room = event.room && typeof event.room === "object" && !Array.isArray(event.room) ? event.room : {};
    const battle = room.battle && typeof room.battle === "object" && !Array.isArray(room.battle) ? room.battle : {};
    const writeback = battle.profileWriteback && typeof battle.profileWriteback === "object" && !Array.isArray(battle.profileWriteback)
      ? battle.profileWriteback
      : {};
    const result = event.result && typeof event.result === "object" && !Array.isArray(event.result) ? event.result : {};
    const skippedProfiles = Array.isArray(writeback.skippedProfiles) ? writeback.skippedProfiles : [];
    logStructured(logger, {
      type: "battle.settlement",
      roomId: String(event.roomId || room.roomId || ""),
      mode: String(room.mode || ""),
      reason: String(event.reason || result.reason || room.closeReason || ""),
      winnerAccountId: String(result.winnerAccountId || ""),
      battleRecordId: String(result.battleRecordId || ""),
      profileWritebackCount: Array.isArray(writeback.profiles) ? writeback.profiles.length : 0,
      skippedProfileCount: skippedProfiles.length,
      skippedProfiles,
    });
  });
}

function durationMsSince(startedAt) {
  return Number((Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(3));
}

if (require.main === module) {
  const port = Number(process.env.BEASTBOUND_AUTH_PORT || 8787);
  const host = process.env.BEASTBOUND_AUTH_HOST || "127.0.0.1";
  const store = createDefaultStore();
  store.load();
  const service = createAuthService({store});
  const server = createHttpServer({service, store});
  server.listen(port, host, () => {
    console.log(`Beastbound auth server listening on http://${host}:${port}`);
  });
  installShutdownFlush(server, store);
}

function createDefaultStore() {
  const storeMode = String(process.env.BEASTBOUND_AUTH_STORE || process.env.BEASTBOUND_STORE || "mysql").trim().toLowerCase();
  if (storeMode === "json") {
    const storePath = process.env.BEASTBOUND_AUTH_STORE_PATH || path.resolve(process.cwd(), ".local/auth-store.json");
    return createJsonAuthStore(storePath);
  }
  if (storeMode !== "mysql") {
    throw new Error(`未知认证存储模式：${storeMode}`);
  }
  return createAsyncWriteAuthStore(createMysqlAuthStore(), {
    onError(error) {
      console.error(`Beastbound MySQL auth store save failed: ${error.message}`);
    },
  });
}

function installShutdownFlush(server, store) {
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    drainServerForShutdown(server, store).then(() => undefined, (error) => {
      console.error(`Beastbound auth store flush failed during ${signal}: ${error.message}`);
      process.exitCode = 1;
    }).finally(async () => {
      try {
        if (store && typeof store.close === "function") {
          await store.close();
        }
      } catch (error) {
        console.error(`Beastbound auth store close failed during ${signal}: ${error.message}`);
        process.exitCode = 1;
      }
      process.exit();
    });
    // Default durable response timeout is 10s; graceful shutdown must leave a
    // wider window for the accepted transaction and store FIFO to settle.
    setTimeout(() => {
      process.exit(1);
    }, 15000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

async function drainServerForShutdown(server, store) {
  // server.close() must be called first to stop new TCP admission, but its
  // callback waits for upgraded WebSocket sockets. Invoke eventHub.close()
  // immediately (not from that callback), enqueue disconnect cleanup, then
  // atomically seal durable admission and wait for all three drains together.
  const serverClosed = shutdownStep(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const eventHubDrained = shutdownStep(() => (
    server.eventHub && typeof server.eventHub.close === "function"
      ? server.eventHub.close()
      : undefined
  ));
  const durableDrained = shutdownStep(() => {
    if (server.authService && typeof server.authService.stopDurableAdmissionsAndDrain === "function") {
      return server.authService.stopDurableAdmissionsAndDrain();
    }
    if (server.authService && typeof server.authService.waitForDurableIdle === "function") {
      return server.authService.waitForDurableIdle();
    }
    return undefined;
  });
  const drainResults = await Promise.allSettled([serverClosed, eventHubDrained, durableDrained]);
  let flushError = null;
  try {
    if (store && typeof store.flush === "function") {
      await store.flush();
    }
  } catch (error) {
    flushError = error;
  }
  const drainFailure = drainResults.find((result) => result.status === "rejected");
  if (drainFailure || flushError) {
    throw (drainFailure ? drainFailure.reason : flushError);
  }
}

function shutdownStep(run) {
  try {
    return Promise.resolve(run());
  } catch (error) {
    return Promise.reject(error);
  }
}

module.exports = {
  createHttpServer,
  DEFAULT_COMMAND_CATALOG,
  createDefaultStore,
  drainServerForShutdown,
};
