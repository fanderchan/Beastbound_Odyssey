"use strict";

const http = require("node:http");
const path = require("node:path");
const {
  createAuthService,
  createJsonAuthStore,
} = require("./auth-service");
const {
  createMysqlAuthStore,
} = require("./mysql-store");
const {
  createEventHub,
} = require("./event-hub");

const DEFAULT_COMMAND_CATALOG = [
  {"id": "gm_map", "label": "进入GM测试场"},
  {"id": "gm_grant_pet", "label": "获取测试宠物"},
  {"id": "gm_level_pet", "label": "宠物升1级"},
  {"id": "gm_battle_speed_gear", "label": "变速齿轮"},
];

function createHttpServer(options = {}) {
  const service = options.service || createAuthService();
  const commandCatalog = options.commandCatalog || DEFAULT_COMMAND_CATALOG;
  const eventHub = options.eventHub || createEventHub(service);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/health") {
        return sendJson(res, 200, {"ok": true, "service": "beastbound-auth"});
      }
      if (req.method === "POST" && url.pathname === "/auth/register") {
        return sendResult(res, service.register(await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/auth/login") {
        return sendResult(res, service.login(await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/auth/logout") {
        return sendResult(res, service.logout(bearerToken(req)));
      }
      if (req.method === "GET" && url.pathname === "/auth/session") {
        return sendResult(res, service.getSession(bearerToken(req)));
      }
      if (req.method === "GET" && url.pathname === "/events/latest") {
        const session = service.getSession(bearerToken(req));
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
        return sendResult(res, service.authorizeGmCommand({"token": bearerToken(req), commandId}));
      }
      if (req.method === "GET" && url.pathname === "/profiles/me") {
        return sendResult(res, service.getProfile(bearerToken(req)));
      }
      if (req.method === "PUT" && url.pathname === "/profiles/me") {
        return sendResult(res, service.saveProfile(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/shops/transaction") {
        return sendResult(res, service.shopTransaction(bearerToken(req), await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/equipment/equip") {
        return sendResult(res, service.equipmentEquip(bearerToken(req), await readJson(req)));
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
      if (req.method === "GET" && url.pathname === "/chat/messages") {
        return sendResult(res, service.listChatMessages(bearerToken(req), {
          "channel": url.searchParams.get("channel") || "",
          "limit": url.searchParams.get("limit") || "",
        }));
      }
      if (req.method === "POST" && url.pathname === "/chat/send") {
        return sendResult(res, service.sendChatMessage(bearerToken(req), await readJson(req)));
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
      return sendJson(res, 500, {"ok": false, "code": "server_error", "message": error.message});
    }
  });
  server.on("upgrade", (req, socket, head) => {
    const handled = eventHub.handleUpgrade(req, socket, head);
    if (!handled && !socket.destroyed) {
      socket.destroy();
    }
  });
  server.eventHub = eventHub;
  return server;
}

function sendResult(res, result) {
  if (result.ok) {
    return sendJson(res, 200, result);
  }
  let status = 400;
  if (result.code && result.code.includes("denied")) {
    status = 403;
  } else if (result.code === "revision_conflict") {
    status = 409;
  }
  return sendJson(res, status, result);
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
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

if (require.main === module) {
  const port = Number(process.env.BEASTBOUND_AUTH_PORT || 8787);
  const host = process.env.BEASTBOUND_AUTH_HOST || "127.0.0.1";
  const store = createDefaultStore();
  store.load();
  const service = createAuthService({store});
  const server = createHttpServer({service});
  server.listen(port, host, () => {
    console.log(`Beastbound auth server listening on http://${host}:${port}`);
  });
}

function createDefaultStore() {
  const storeMode = String(process.env.BEASTBOUND_AUTH_STORE || process.env.BEASTBOUND_STORE || "json").trim().toLowerCase();
  if (storeMode === "mysql") {
    return createMysqlAuthStore();
  }
  const storePath = process.env.BEASTBOUND_AUTH_STORE_PATH || path.resolve(process.cwd(), ".local/auth-store.json");
  return createJsonAuthStore(storePath);
}

module.exports = {
  createHttpServer,
  DEFAULT_COMMAND_CATALOG,
  createDefaultStore,
};
