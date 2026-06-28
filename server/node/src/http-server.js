"use strict";

const http = require("node:http");
const path = require("node:path");
const {
  createAuthService,
  createJsonAuthStore,
} = require("./auth-service");

const DEFAULT_COMMAND_CATALOG = [
  {"id": "gm_map", "label": "进入GM测试场"},
  {"id": "gm_grant_pet", "label": "获取测试宠物"},
  {"id": "gm_level_pet", "label": "宠物升1级"},
  {"id": "gm_battle_speed_gear", "label": "变速齿轮"},
];

function createHttpServer(options = {}) {
  const service = options.service || createAuthService();
  const commandCatalog = options.commandCatalog || DEFAULT_COMMAND_CATALOG;

  return http.createServer(async (req, res) => {
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
      if (req.method === "GET" && url.pathname === "/gm/tools") {
        return sendResult(res, service.listGmTools(bearerToken(req), commandCatalog));
      }
      if (req.method === "POST" && url.pathname.startsWith("/gm/commands/")) {
        const commandId = decodeURIComponent(url.pathname.slice("/gm/commands/".length));
        return sendResult(res, service.authorizeGmCommand({"token": bearerToken(req), commandId}));
      }
      if (req.method === "GET" && url.pathname === "/profiles/me") {
        const result = service.getSession(bearerToken(req));
        if (!result.ok) {
          return sendResult(res, result);
        }
        return sendJson(res, 200, {
          "ok": true,
          "profileBinding": result.profileBinding,
          "profileSummary": result.profileSummary,
          "profile": null,
          "message": "服务器已确认角色档案绑定，完整档案同步尚未接管。"
        });
      }
      return sendJson(res, 404, {"ok": false, "code": "not_found", "message": "接口不存在。"});
    } catch (error) {
      return sendJson(res, 500, {"ok": false, "code": "server_error", "message": error.message});
    }
  });
}

function sendResult(res, result) {
  if (result.ok) {
    return sendJson(res, 200, result);
  }
  const status = result.code && result.code.includes("denied") ? 403 : 400;
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
  const storePath = process.env.BEASTBOUND_AUTH_STORE_PATH || path.resolve(process.cwd(), ".local/auth-store.json");
  const service = createAuthService({"store": createJsonAuthStore(storePath)});
  const server = createHttpServer({service});
  server.listen(port, "127.0.0.1", () => {
    console.log(`Beastbound auth server listening on http://127.0.0.1:${port}`);
  });
}

module.exports = {
  createHttpServer,
  DEFAULT_COMMAND_CATALOG,
};
