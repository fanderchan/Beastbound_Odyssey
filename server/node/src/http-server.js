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
const {
  HttpBoundaryError,
  applyHttpServerLimits,
  createRequestId,
  jsonBodyLimitForPath,
  parseOriginFormTarget,
  readBoundedBody,
  readBoundedJson,
  secureJsonHeaders,
  validateDeclaredBodyLimit,
} = require("./http-security-boundary");
const {
  NetworkAdmissionError,
  createNetworkAdmission,
} = require("./network-admission");
const {
  AuthWorkQueueError,
  createHttpAuthBoundary,
} = require("./http-auth-boundary");
const {createHealthMonitor} = require("./health-monitor");
const {
  DURABLE_OPERATION_ID_PATTERN,
} = require("./auth/durable-mutation-state");
const {
  normalizeMailInboxPageOptions,
} = require("./auth/mail-inbox-pagination");

const DEFAULT_COMMAND_CATALOG = [
  {"id": "gm_map", "label": "进入GM测试场"},
  {"id": "gm_grant_pet", "label": "获取测试宠物"},
  {"id": "gm_level_pet", "label": "宠物升1级"},
  {"id": "gm_battle_speed_gear", "label": "变速齿轮"},
  {"id": "gm_market_tax", "label": "交易所税率配置"},
  {"id": "gm_offline_hang_config", "label": "离线挂机配置"},
  {"id": "gm_prepare_qa_profile", "label": "补齐GM核心测试档案"},
  {"id": "gm_prepare_qa_pet_samples", "label": "准备GM宠物样本档"},
  {"id": "gm_prepare_qa_assets", "label": "准备GM装备与银行档"},
  {"id": "gm_pet_capture_recovery", "label": "审计并恢复异常捕捉宠物"},
];

const DURABLE_HTTP_SERVICE_METHODS = new Set([
  "register",
  "login",
  "_httpRegisterPasswordDigest",
  "_httpLoginPasswordDigest",
  "refreshSession",
  "logout",
  "getSession",
  "getProfile",
  "listPetRecoveries",
  "grantGmPet",
  "levelUpGmPet",
  "gmPetCaptureRecovery",
  "prepareGmQaProfile",
  "prepareGmQaPetSamples",
  "prepareGmQaAssets",
  "authorizeGmCommand",
  "getMarketConfig",
  "updateMarketConfig",
  "getOfflineHangConfig",
  "updateOfflineHangConfig",
  "offlineHangStatus",
  "startOfflineHang",
  "claimOfflineHang",
  "cancelOfflineHang",
  "claimPetRecovery",
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
const PURE_HTTP_READ_SERVICE_METHODS = new Set([
  "getProfile",
  "listPetRecoveries",
  "getPartyState",
]);
const SHARED_ASSET_HTTP_READ_SERVICE_METHODS = new Set([
  "marketListings",
  "listInbox",
]);
const IDEMPOTENCY_REQUIRED_ASSET_HTTP_PATHS = new Set([
  "/bank/deposit",
  "/bank/withdraw",
  "/market/list",
  "/market/buy",
  "/market/cancel",
  "/mail/send",
]);
const IDEMPOTENCY_REQUIRED_MAIL_HTTP_PATH_PATTERN = /^\/mail\/[^/]+\/(?:read|claim)$/;
const IDEMPOTENCY_REQUIRED_PET_RECOVERY_HTTP_PATH_PATTERN = /^\/pets\/recovery\/[^/]+\/claim$/;
const IDEMPOTENCY_REQUIRED_BATTLE_COMMAND_HTTP_PATH_PATTERN = /^\/battle\/rooms\/[^/]+\/commands$/;

function createHttpServer(options = {}) {
  const baseService = options.service || createAuthService();
  const requestContexts = new AsyncLocalStorage();
  const service = createDurableHttpServiceProxy(baseService, requestContexts);
  const commandCatalog = options.commandCatalog || DEFAULT_COMMAND_CATALOG;
  const store = options.store || null;
  const logger = createStructuredLogger(options.logger);
  const networkAdmission = options.networkAdmission || createNetworkAdmission({
    ...(options.networkAdmissionOptions || {}),
    trustedProxies: options.trustedProxies === undefined
      ? configuredTrustedProxies(process.env.BEASTBOUND_TRUSTED_PROXIES)
      : options.trustedProxies,
  });
  const eventHubOptions = {...(options.eventHubOptions || {})};
  if (!Object.hasOwn(eventHubOptions, "allowedOrigins")) {
    eventHubOptions.allowedOrigins = configuredList(process.env.BEASTBOUND_WS_ALLOWED_ORIGINS);
  }
  const eventHub = options.eventHub || createEventHub(baseService, {
    ...eventHubOptions,
    networkIdentity: (req) => networkAdmission.networkIdentity(req),
  });
  const httpAuth = hasHttpCredentialBoundary(baseService)
    ? createHttpAuthBoundary(baseService, service, options.httpAuthOptions || {})
    : createLegacyHttpAuthBoundary(service);
  const healthMonitor = options.healthMonitor || createHealthMonitor(store, {
    ...(options.healthMonitorOptions || {}),
    onProbeError(error) {
      logStructured(logger, {
        type: "health.probe_failed",
        errorCode: String(error && error.code || "health_probe_failed"),
      });
    },
  });
  const qaAdvanceClock = typeof options.qaAdvanceClock === "function" ? options.qaAdvanceClock : null;
  const unsubscribeServiceLogger = installServiceEventLogger(baseService, logger);
  healthMonitor.start();

  const server = applyHttpServerLimits(http.createServer(dispatchRequest), options.httpServerLimits || {});
  server.on("checkContinue", (req, res) => {
    res.beastboundNetworkAdmission = networkAdmission;
    let preAdmission = null;
    try {
      preAdmission = networkAdmission.beginHttp(req);
      req.beastboundPreAdmissionContext = preAdmission;
      const url = parseOriginFormTarget(req, options.httpRequestTarget || {});
      validateDeclaredBodyLimit(req, jsonBodyLimitForPath(url.pathname, options.httpBodyLimits || {}));
      res.writeContinue();
      dispatchRequest(req, res);
    } catch (error) {
      if (preAdmission) {
        let released = false;
        const release = () => {
          if (!released) {
            released = true;
            preAdmission.release();
          }
        };
        res.once("finish", release);
        res.once("close", release);
      }
      const requestId = createRequestId();
      res.beastboundLogger = logger;
      res.beastboundRequestContext = {method: String(req.method || ""), path: "", requestId};
      sendServiceError(res, error);
    }
  });

  function dispatchRequest(req, res) {
    res.beastboundNetworkAdmission = networkAdmission;
    requestContexts.run({req, res}, () => {
      Promise.resolve(handleRequest(req, res)).catch((error) => {
        if (!res.headersSent && !res.writableEnded) {
          sendServiceError(res, error);
        } else if (!res.destroyed) {
          res.destroy();
        }
      });
    });
  }

  async function handleRequest(req, res) {
    const startedAt = process.hrtime.bigint();
    const requestId = createRequestId();
    req.beastboundDisconnectSignal = bindRequestDisconnectSignal(req, res);
    let networkContext = null;
    let requestPath = "";
    let logged = false;
    res.beastboundLogger = logger;
    res.beastboundRequestContext = {
      method: String(req.method || ""),
      path: "",
      requestId,
      startedAt,
    };
    const finishRequest = (aborted = false) => {
      if (logged) {
        return;
      }
      logged = true;
      if (networkContext) {
        networkContext.release();
      }
      logStructured(logger, {
        type: "http.request",
        requestId,
        method: String(req.method || ""),
        path: requestPath,
        statusCode: res.statusCode,
        ok: !aborted && res.statusCode < 400,
        aborted,
        clientIpHash: String(networkContext && networkContext.clientIpHash || ""),
        requestBytes: safeContentLength(req),
        responseBytes: Math.max(0, Number(res.beastboundResponseBytes || 0)),
        durationMs: durationMsSince(startedAt),
      });
    };
    res.once("finish", () => finishRequest(false));
    res.once("close", () => finishRequest(!res.writableFinished));
    try {
      networkContext = req.beastboundPreAdmissionContext || networkAdmission.beginHttp(req);
      delete req.beastboundPreAdmissionContext;
      req.beastboundNetworkContext = networkContext;
      const url = parseOriginFormTarget(req, options.httpRequestTarget || {});
      requestPath = url.pathname;
      req.beastboundPath = requestPath;
      res.beastboundRequestContext.path = requestPath;
      req.beastboundBodyLimit = jsonBodyLimitForPath(requestPath, options.httpBodyLimits || {});
      validateDeclaredBodyLimit(req, req.beastboundBodyLimit);
      // Every route, including health and nominally bodyless GET/POST routes,
      // owns admission until the bounded request body has fully arrived.
      // JSON routes parse the cached bytes later through readBoundedJson().
      await readBoundedBody(req, {maxBytes: req.beastboundBodyLimit});
      res.beastboundRequestContext.bodyReadyAt = process.hrtime.bigint();
      if (req.method === "GET" && url.pathname === "/health/live") {
        return sendJson(res, 200, healthMonitor.liveSnapshot());
      }
      if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/health/ready")) {
        const health = healthPayload(healthMonitor, eventHub, baseService, networkAdmission, httpAuth);
        return sendJson(res, health.ok ? 200 : 503, health);
      }
      if (req.method === "POST" && url.pathname === "/__qa/clock/advance" && qaAdvanceClock) {
        return sendResult(res, qaAdvanceClock(await readJson(req)));
      }
      const protocol = protocolCompatibility(req, url);
      if (!protocol.ok) {
        return sendJson(res, 426, protocolMismatchResult(protocol));
      }
      const assetIdempotencyFailure = requiredAssetMutationIdempotencyKeyFailure(
        req,
        url.pathname,
      );
      if (assetIdempotencyFailure) {
        return sendResult(res, assetIdempotencyFailure);
      }
      const requestToken = bearerToken(req);
      if (requestToken !== "") {
        networkAdmission.admitAuthenticated(networkContext, requestToken);
      }
      if (req.method === "POST" && url.pathname === "/auth/register") {
        networkAdmission.admitAuthIp(networkContext, "register");
        const payload = await readJson(req);
        networkAdmission.admitAuthAccount(networkContext, "register", payload.username);
        return sendResult(res, httpAuth.register(payload, networkContext.clientIp));
      }
      if (req.method === "POST" && url.pathname === "/auth/login") {
        networkAdmission.admitAuthIp(networkContext, "login");
        const payload = await readJson(req);
        networkAdmission.admitAuthAccount(networkContext, "login", payload.username);
        return sendResult(res, httpAuth.login(payload, networkContext.clientIp));
      }
      if (req.method === "POST" && url.pathname === "/auth/refresh") {
        return sendResult(res, service.refreshSession(requestToken));
      }
      if (req.method === "POST" && url.pathname === "/auth/logout") {
        return sendResult(res, service.logout(bearerToken(req)));
      }
      if (req.method === "GET" && url.pathname === "/auth/session") {
        return sendResult(res, service.getSession(bearerToken(req)));
      }
      if (req.method === "GET" && url.pathname === "/events/latest") {
        const session = await Promise.resolve(
          typeof baseService.getEventSession === "function"
            ? baseService.getEventSession(bearerToken(req))
            : service.getSession(bearerToken(req)),
        );
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
        if (commandId === "gm_prepare_qa_pet_samples") {
          const idempotencyFailure = requiredIdempotencyKeyFailure(req);
          if (idempotencyFailure) {
            return sendResult(res, idempotencyFailure);
          }
          return sendResult(res, service.prepareGmQaPetSamples(bearerToken(req), await readJson(req)));
        }
        if (commandId === "gm_prepare_qa_assets") {
          const idempotencyFailure = requiredIdempotencyKeyFailure(req);
          if (idempotencyFailure) {
            return sendResult(res, idempotencyFailure);
          }
          return sendResult(res, service.prepareGmQaAssets(bearerToken(req), await readJson(req)));
        }
        if (commandId === "gm_pet_capture_recovery") {
          const idempotencyFailure = requiredIdempotencyKeyFailure(req);
          if (idempotencyFailure) {
            return sendResult(res, idempotencyFailure);
          }
          return sendResult(res, service.gmPetCaptureRecovery(bearerToken(req), await readJson(req)));
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
      if (req.method === "GET" && url.pathname === "/pets/recovery") {
        return sendResult(res, service.listPetRecoveries(bearerToken(req)));
      }
      if (
        req.method === "POST"
        && IDEMPOTENCY_REQUIRED_PET_RECOVERY_HTTP_PATH_PATTERN.test(url.pathname)
      ) {
        // Recovery ids are server-issued ASCII identifiers. Keeping the raw
        // path segment avoids turning malformed percent escapes into a 500.
        const recoveryId = url.pathname.slice("/pets/recovery/".length, -"/claim".length);
        return sendResult(res, service.claimPetRecovery(bearerToken(req), {recoveryId}));
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
        const inboxOptions = mailInboxOptionsFromSearchParams(url.searchParams);
        if (!inboxOptions.ok) {
          return sendResult(res, inboxOptions);
        }
        return sendResult(res, service.listInbox(bearerToken(req), inboxOptions.options));
      }
      if (req.method === "POST" && url.pathname === "/mail/send") {
        return sendResult(res, service.sendMail(bearerToken(req), await readJson(req)));
      }
      if (
        req.method === "POST"
        && IDEMPOTENCY_REQUIRED_MAIL_HTTP_PATH_PATTERN.test(url.pathname)
        && url.pathname.endsWith("/read")
      ) {
        const mailId = decodeURIComponent(url.pathname.slice("/mail/".length, -"/read".length));
        return sendResult(res, service.markMailRead(bearerToken(req), mailId));
      }
      if (
        req.method === "POST"
        && IDEMPOTENCY_REQUIRED_MAIL_HTTP_PATH_PATTERN.test(url.pathname)
        && url.pathname.endsWith("/claim")
      ) {
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
  server.on("close", () => {
    unsubscribeServiceLogger();
    healthMonitor.close();
  });
  server.on("upgrade", (req, socket, head) => {
    socket.setTimeout?.(0);
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
  server.networkAdmission = networkAdmission;
  server.healthMonitor = healthMonitor;
  if (options.store) {
    server.authStore = options.store;
  }
  return server;
}

function createDurableHttpServiceProxy(service, requestContexts) {
  return new Proxy(service, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") {
        return value;
      }
      if (
        SHARED_ASSET_HTTP_READ_SERVICE_METHODS.has(String(property))
        && typeof target._httpInvokeSharedAssetRead === "function"
      ) {
        return (...args) => observeHttpServiceSync(
          requestContexts,
          property,
          () => target._httpInvokeSharedAssetRead(String(property), args),
        );
      }
      if (!DURABLE_HTTP_SERVICE_METHODS.has(String(property)) || typeof target.invokeDurable !== "function") {
        return (...args) => observeHttpServiceSync(requestContexts, property, () => Reflect.apply(value, target, args));
      }
      return (...args) => observeHttpServiceSync(requestContexts, property, () => {
        if (
          PURE_HTTP_READ_SERVICE_METHODS.has(String(property))
          && typeof target._httpTryPureRead === "function"
        ) {
          try {
            const read = target._httpTryPureRead(String(property), args);
            if (read && typeof read.then !== "function" && read.handled === true) {
              return read.result;
            }
          } catch {
            // Any uncertain read classification stays behind the durable gate.
          }
        }
        const context = requestContexts.getStore() || {};
        const req = context.req || null;
        const method = String(req && req.method || "").toUpperCase();
        const pathName = String(req && req.beastboundPath || "");
        const actionId = `${method || "INTERNAL"} ${pathName || String(property)}`;
        const operationId = String(req && req.headers && req.headers["idempotency-key"] || "").trim();
        const authToken = req ? bearerToken(req) : "";
        return target.invokeDurable(String(property), args, {
          operationId,
          actionId,
          requestHash: durableRequestHash(method, pathName, property, args, authToken),
          signal: req && req.beastboundDisconnectSignal,
        });
      });
    },
  });
}

function bindRequestDisconnectSignal(req, res) {
  const controller = new AbortController();
  let listening = true;
  const cleanup = () => {
    if (!listening) {
      return;
    }
    listening = false;
    req.removeListener("aborted", abortDisconnectedRequest);
    res.removeListener("close", abortDisconnectedRequest);
    res.removeListener("finish", finishRequest);
  };
  const abortDisconnectedRequest = () => {
    if (!res.writableFinished && !controller.signal.aborted) {
      controller.abort();
    }
    cleanup();
  };
  const finishRequest = () => {
    cleanup();
  };
  req.once("aborted", abortDisconnectedRequest);
  res.once("close", abortDisconnectedRequest);
  res.once("finish", finishRequest);
  if (req.aborted || (res.destroyed && !res.writableFinished)) {
    abortDisconnectedRequest();
  }
  return controller.signal;
}

function observeHttpServiceSync(requestContexts, property, invoke) {
  const context = requestContexts.getStore() || {};
  const observer = context.res && context.res.beastboundNetworkAdmission;
  if (!observer || typeof observer.observeHttpServiceCall !== "function") {
    return invoke();
  }
  const startedAt = process.hrtime.bigint();
  try {
    return invoke();
  } finally {
    observer.observeHttpServiceCall({
      serviceMethod: String(property),
      route: diagnosticHttpRoute(context.req && context.req.beastboundPath, 200),
      durationMs: durationMsBetween(startedAt, process.hrtime.bigint()),
    });
  }
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
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return sendServiceError(res, new Error("service returned an invalid result"));
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
  return sendJson(res, status, result, {
    retryAfterSeconds: status === 429 ? Math.max(0, Number(result.retryAfterMs || 0)) / 1000 : 0,
  });
}

function sendServiceError(res, error) {
  const code = String(error && error.code || "");
  if (
    error instanceof HttpBoundaryError
    || error instanceof NetworkAdmissionError
    || error instanceof AuthWorkQueueError
    || (Number.isInteger(error && error.statusCode) && error.statusCode >= 400 && error.statusCode <= 599)
  ) {
    const statusCode = Math.max(400, Math.min(599, Number(error.statusCode || 500)));
    const retryAfterMs = Math.max(0, Number(error.retryAfterMs || 0));
    return sendJson(res, statusCode, {
      ok: false,
      code: code || "request_rejected",
      message: String(error.publicMessage || "请求未被接受，请稍后重试。"),
      ...(retryAfterMs > 0 ? {retryAfterMs} : {}),
    }, {
      closeConnection: Boolean(error.closeConnection),
      retryAfterSeconds: retryAfterMs / 1000,
    });
  }
  if ([
    "storage_write_failed",
    "storage_commit_timeout",
    "storage_queue_full",
    "storage_outcome_unknown",
    "storage_shutting_down",
    "storage_request_canceled",
    "storage_read_failed",
    "durable_context_required",
  ].includes(code)) {
    const publicCode = code === "durable_context_required" ? "storage_write_failed" : code;
    const fallback = code === "storage_commit_timeout"
      ? "服务器正在确认存档，请使用同一操作重试。"
      : "服务器存档暂时不可用，请稍后使用同一操作重试。";
    return sendJson(res, 503, {ok: false, code: publicCode, message: fallback});
  }
  logStructured(res && res.beastboundLogger, {
    type: "http.internal_error",
    requestId: String(res && res.beastboundRequestContext && res.beastboundRequestContext.requestId || ""),
    errorCode: code || "server_error",
    errorName: String(error && error.name || "Error"),
  });
  return sendJson(res, 500, {ok: false, code: "server_error", message: "服务器暂时异常，请稍后重试。"});
}

function sendJson(res, status, body, options = {}) {
  if (!res || res.headersSent || res.writableEnded || res.destroyed) {
    return;
  }
  const sendStartedAt = process.hrtime.bigint();
  const responseBody = attachProtocolMetadata(body);
  const metadataReadyAt = process.hrtime.bigint();
  const text = JSON.stringify(responseBody);
  const serializedAt = process.hrtime.bigint();
  const bytes = Buffer.byteLength(text);
  const bytesReadyAt = process.hrtime.bigint();
  res.beastboundResponseBytes = bytes;
  res.writeHead(status, secureJsonHeaders(
    res.beastboundRequestContext && res.beastboundRequestContext.requestId,
    bytes,
    options,
  ));
  const headersWrittenAt = process.hrtime.bigint();
  res.end(text);
  const endedAt = process.hrtime.bigint();
  const observer = res.beastboundNetworkAdmission;
  if (observer && typeof observer.observeHttpResponse === "function") {
    const context = res.beastboundRequestContext || {};
    observer.observeHttpResponse({
      method: context.method,
      route: diagnosticHttpRoute(context.path, status),
      statusCode: status,
      responseBytes: bytes,
      preSendMs: durationMsBetween(context.bodyReadyAt || context.startedAt, sendStartedAt),
      metadataMs: durationMsBetween(sendStartedAt, metadataReadyAt),
      serializeMs: durationMsBetween(metadataReadyAt, serializedAt),
      byteLengthMs: durationMsBetween(serializedAt, bytesReadyAt),
      writeHeadMs: durationMsBetween(bytesReadyAt, headersWrittenAt),
      endMs: durationMsBetween(headersWrittenAt, endedAt),
      sendTotalMs: durationMsBetween(sendStartedAt, endedAt),
    });
  }
}

function diagnosticHttpRoute(pathValue, statusCode) {
  const path = String(pathValue || "");
  if (Number(statusCode) === 404 || path === "") {
    return "/:unmatched";
  }
  for (const [pattern, replacement] of [
    [/^\/gm\/commands\/[^/]+$/, "/gm/commands/:command"],
    [/^\/mail\/[^/]+\/(read|claim)$/, "/mail/:id/$1"],
    [/^\/pets\/recovery\/[^/]+\/claim$/, "/pets/recovery/:id/claim"],
    [/^\/battle\/invites\/[^/]+\/(accept|decline|cancel)$/, "/battle/invites/:id/$1"],
    [/^\/battle\/rooms\/[^/]+\/(commands|leave)$/, "/battle/rooms/:id/$1"],
  ]) {
    if (pattern.test(path)) {
      return path.replace(pattern, replacement);
    }
  }
  if (path.length > 128 || !/^\/[A-Za-z0-9_./-]+$/.test(path)) {
    return "/:redacted";
  }
  return path;
}

function durationMsBetween(startedAt, endedAt) {
  if (typeof startedAt !== "bigint" || typeof endedAt !== "bigint" || endedAt < startedAt) {
    return 0;
  }
  return Number(endedAt - startedAt) / 1e6;
}

function readJson(req) {
  return readBoundedJson(req, {
    maxBytes: Number(req && req.beastboundBodyLimit || jsonBodyLimitForPath(req && req.beastboundPath)),
  });
}

function bearerToken(req) {
  const header = String(req.headers.authorization || "");
  if (!header.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  const token = header.slice("bearer ".length).trim();
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : "";
}

function requiredIdempotencyKeyFailure(req) {
  const operationId = String(req && req.headers && req.headers["idempotency-key"] || "").trim();
  if (operationId === "") {
    return {
      ok: false,
      code: "idempotency_key_required",
      message: "本操作需要有效的操作标识，请刷新后重试。",
    };
  }
  if (!DURABLE_OPERATION_ID_PATTERN.test(operationId)) {
    return {
      ok: false,
      code: "idempotency_key_invalid",
      message: "操作标识格式不正确，请重新发起操作。",
    };
  }
  return null;
}

function requiredAssetMutationIdempotencyKeyFailure(req, pathNameValue) {
  if (String(req && req.method || "").toUpperCase() !== "POST") {
    return null;
  }
  const pathName = String(pathNameValue || "");
  const mailMutation = IDEMPOTENCY_REQUIRED_MAIL_HTTP_PATH_PATTERN.test(pathName);
  const petRecoveryMutation = IDEMPOTENCY_REQUIRED_PET_RECOVERY_HTTP_PATH_PATTERN.test(pathName);
  const battleCommandMutation = IDEMPOTENCY_REQUIRED_BATTLE_COMMAND_HTTP_PATH_PATTERN.test(pathName);
  if (
    !IDEMPOTENCY_REQUIRED_ASSET_HTTP_PATHS.has(pathName)
    && !mailMutation
    && !petRecoveryMutation
    && !battleCommandMutation
  ) {
    return null;
  }
  return requiredIdempotencyKeyFailure(req);
}

function mailInboxOptionsFromSearchParams(searchParams) {
  const limitValues = searchParams.getAll("limit");
  const cursorValues = searchParams.getAll("cursor");
  if (limitValues.length === 0 && cursorValues.length === 0) {
    return {ok: true, options: {}};
  }
  if (limitValues.length !== 1 || cursorValues.length > 1) {
    return {
      ok: false,
      code: "mail_inbox_pagination_invalid",
      message: "邮箱分页参数无效，请刷新后重试。",
    };
  }
  const rawOptions = {limit: limitValues[0]};
  if (cursorValues.length === 1) {
    rawOptions.cursor = cursorValues[0];
  }
  try {
    return {
      ok: true,
      options: normalizeMailInboxPageOptions(rawOptions, {requireExplicitLimit: true}),
    };
  } catch (error) {
    return {
      ok: false,
      code: String(error && error.code || "mail_inbox_pagination_invalid"),
      message: String(error && error.message || "邮箱分页参数无效，请刷新后重试。"),
    };
  }
}

function healthPayload(healthMonitor, eventHub, service = null, networkAdmission = null, httpAuth = null) {
  const storage = healthMonitor.snapshot();
  const eventStreamMetrics = eventHub && typeof eventHub.metrics === "function"
    ? eventHub.metrics()
    : {};
  return {
    // A configured store is not ready until its first background probe has
    // positively completed. Store-less isolated servers report ok=true from
    // the monitor even though no probe is required.
    ok: storage.ok === true,
    service: "beastbound-auth",
    storage,
    eventStream: {
      clients: eventHub && typeof eventHub.clientCount === "function" ? eventHub.clientCount() : 0,
      ...eventStreamMetrics,
    },
    durableMutations: service && typeof service.durableMutationMetrics === "function"
      ? service.durableMutationMetrics()
      : {checked: false},
    transport: networkAdmission && typeof networkAdmission.metrics === "function"
      ? networkAdmission.metrics()
      : {checked: false},
    authWork: httpAuth && typeof httpAuth.metrics === "function"
      ? httpAuth.metrics()
      : {checked: false},
    authSecurity: service && typeof service.authSecurityMetrics === "function"
      ? service.authSecurityMetrics()
      : {checked: false},
    healthProbe: healthMonitor.metrics(),
  };
}

function configuredTrustedProxies(value) {
  return configuredList(value);
}

function configuredList(value) {
  return String(value || "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function hasHttpCredentialBoundary(service) {
  return Boolean(
    service
    && typeof service._httpValidateRegistration === "function"
    && typeof service._httpPasswordVerificationRecord === "function"
    && typeof service._httpRegisterPasswordDigest === "function"
    && typeof service._httpLoginPasswordDigest === "function"
  );
}

function createLegacyHttpAuthBoundary(service) {
  return {
    register(payload, clientIp) {
      return service.register({...payload, clientIp});
    },
    login(payload, clientIp) {
      return service.login({...payload, clientIp});
    },
    metrics() {
      return {checked: false};
    },
  };
}

function safeContentLength(req) {
  const observed = Number(req && req.beastboundBodyBytes);
  if (Number.isSafeInteger(observed) && observed >= 0) {
    return observed;
  }
  const value = Number(req && req.headers && req.headers["content-length"] || 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
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
  const service = createPreloadedAuthService(store);
  const server = createHttpServer({service, store});
  server.listen(port, host, () => {
    console.log(`Beastbound auth server listening on http://${host}:${port}`);
  });
  installShutdownFlush(server, store);
}

function createPreloadedAuthService(store, options = {}) {
  if (!store || typeof store.load !== "function") {
    throw new Error("认证服务启动需要可预加载的持久化存储。");
  }
  // Load synchronously before opening the listener so storage/schema errors
  // fail the process closed. createAuthService consumes this exact document
  // immediately and never performs a discarded second startup read.
  const initialData = store.load();
  return createAuthService({...options, store, initialData});
}

function createDefaultStore(options = {}) {
  const storeMode = String(process.env.BEASTBOUND_AUTH_STORE || process.env.BEASTBOUND_STORE || "mysql").trim().toLowerCase();
  if (storeMode === "json") {
    const storePath = process.env.BEASTBOUND_AUTH_STORE_PATH || path.resolve(process.cwd(), ".local/auth-store.json");
    return createJsonAuthStore(storePath);
  }
  if (storeMode !== "mysql") {
    throw new Error(`未知认证存储模式：${storeMode}`);
  }
  const mysqlStoreOptions = options.mysqlStoreOptions && typeof options.mysqlStoreOptions === "object"
    ? options.mysqlStoreOptions
    : {};
  return createAsyncWriteAuthStore(createMysqlAuthStore({...mysqlStoreOptions, usePool: true}), {
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
  createPreloadedAuthService,
  DEFAULT_COMMAND_CATALOG,
  createDefaultStore,
  drainServerForShutdown,
};
