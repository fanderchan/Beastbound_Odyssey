"use strict";

const {version: SERVER_VERSION} = require("../package.json");

const PROTOCOL_VERSION = 6;
const MIN_CLIENT_PROTOCOL_VERSION = 6;
const MAX_CLIENT_PROTOCOL_VERSION = 6;
const CLIENT_VERSION_HEADER = "x-beastbound-client-version";
const CLIENT_PROTOCOL_HEADER = "x-beastbound-protocol-version";

function protocolMetadata() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    minClientProtocolVersion: MIN_CLIENT_PROTOCOL_VERSION,
    maxClientProtocolVersion: MAX_CLIENT_PROTOCOL_VERSION,
    serverVersion: SERVER_VERSION,
    hotUpdate: {
      required: false,
      channel: "stable",
      manifestUrl: "",
      packageVersion: "",
    },
  };
}

function attachProtocolMetadata(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }
  return {
    ...body,
    ...protocolMetadata(),
  };
}

function requestProtocolInfo(req, url = null) {
  const parsedUrl = url || new URL(req.url || "/", "http://127.0.0.1");
  const query = parsedUrl.searchParams;
  const clientVersion = String(
    req.headers[CLIENT_VERSION_HEADER] ||
    query.get("clientVersion") ||
    ""
  ).trim();
  const protocolText = String(
    req.headers[CLIENT_PROTOCOL_HEADER] ||
    query.get("clientProtocolVersion") ||
    query.get("protocolVersion") ||
    ""
  ).trim();
  const clientProtocolVersion = Number(protocolText);
  return {
    clientVersion,
    clientProtocolVersion: Number.isInteger(clientProtocolVersion) ? clientProtocolVersion : 0,
    rawClientProtocolVersion: protocolText,
  };
}

function protocolCompatibility(req, url = null) {
  const info = requestProtocolInfo(req, url);
  if (info.clientVersion === "") {
    return {
      ok: false,
      code: "client_version_missing",
      message: "客户端版本信息缺失，请更新客户端后重试。",
      ...info,
    };
  }
  if (info.clientProtocolVersion < MIN_CLIENT_PROTOCOL_VERSION || info.clientProtocolVersion > MAX_CLIENT_PROTOCOL_VERSION) {
    return {
      ok: false,
      code: "protocol_version_mismatch",
      message: "客户端版本与服务器协议不兼容，请更新客户端后重试。",
      ...info,
    };
  }
  return {
    ok: true,
    ...info,
  };
}

function protocolMismatchResult(compatibility) {
  return {
    ok: false,
    code: compatibility.code || "protocol_version_mismatch",
    message: compatibility.message || "客户端版本与服务器协议不兼容，请更新客户端后重试。",
    clientVersion: compatibility.clientVersion || "",
    clientProtocolVersion: compatibility.clientProtocolVersion || 0,
    upgrade: {
      required: true,
      message: "请更新客户端后重试。",
      channel: "stable",
      manifestUrl: "",
      packageVersion: "",
    },
    ...protocolMetadata(),
  };
}

module.exports = {
  CLIENT_PROTOCOL_HEADER,
  CLIENT_VERSION_HEADER,
  MAX_CLIENT_PROTOCOL_VERSION,
  MIN_CLIENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  SERVER_VERSION,
  attachProtocolMetadata,
  protocolCompatibility,
  protocolMetadata,
  protocolMismatchResult,
};
