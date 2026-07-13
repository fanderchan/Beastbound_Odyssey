"use strict";

const crypto = require("node:crypto");
const {TextDecoder} = require("node:util");

const DEFAULT_MAX_REQUEST_TARGET_BYTES = 2 * 1024;
const DEFAULT_JSON_BODY_BYTES = 64 * 1024;
const AUTH_CHAT_JSON_BODY_BYTES = 4 * 1024;
const DEFAULT_BODY_TIMEOUT_MS = 10 * 1000;
const UTF8_DECODER = new TextDecoder("utf-8", {fatal: true});

class HttpBoundaryError extends Error {
  constructor(statusCode, code, publicMessage, options = {}) {
    super(publicMessage);
    this.name = "HttpBoundaryError";
    this.statusCode = statusCode;
    this.code = code;
    this.publicMessage = publicMessage;
    this.closeConnection = options.closeConnection !== false;
  }
}

function parseOriginFormTarget(req, options = {}) {
  const rawTarget = String(req && req.url || "");
  const maxBytes = positiveInteger(options.maxBytes, DEFAULT_MAX_REQUEST_TARGET_BYTES);
  if (
    rawTarget === ""
    || Buffer.byteLength(rawTarget) > maxBytes
    || !rawTarget.startsWith("/")
    || rawTarget.startsWith("//")
    || rawTarget.includes("#")
  ) {
    throw badRequest("request_target_invalid", "请求地址格式不正确。");
  }
  try {
    // URL accepts malformed percent escapes by preserving them. Decode once as
    // a strict validation pass, while routing continues to use the URL object.
    decodeURIComponent(rawTarget);
    return new URL(rawTarget, "http://beastbound.invalid");
  } catch {
    throw badRequest("request_target_invalid", "请求地址格式不正确。");
  }
}

function jsonBodyLimitForPath(pathname, options = {}) {
  const path = String(pathname || "");
  if (path.startsWith("/auth/") || path.startsWith("/chat/")) {
    return positiveInteger(options.authChatMaxBytes, AUTH_CHAT_JSON_BODY_BYTES);
  }
  return positiveInteger(options.defaultMaxBytes, DEFAULT_JSON_BODY_BYTES);
}

function readBoundedJson(req, options = {}) {
  validateJsonContentType(req);
  validateContentEncoding(req);
  return readBoundedBody(req, options).then((buffer) => {
    if (buffer.length === 0) {
      return {};
    }
    try {
      const text = UTF8_DECODER.decode(buffer);
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("JSON root must be an object");
      }
      return parsed;
    } catch {
      throw badRequest("request_json_invalid", "请求JSON格式不正确。");
    }
  });
}

function readBoundedBody(req, options = {}) {
  const maxBytes = positiveInteger(options.maxBytes, DEFAULT_JSON_BODY_BYTES);
  const timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_BODY_TIMEOUT_MS);
  const declaredLength = contentLength(req);
  if (declaredLength > maxBytes) {
    throw payloadTooLarge();
  }
  if (req.beastboundBodyPromise) {
    return req.beastboundBodyPromise;
  }
  const bodyPromise = new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      finish(reject, new HttpBoundaryError(408, "request_body_timeout", "请求内容接收超时，请重试。"));
    }, timeoutMs);
    timer.unref?.();

    function cleanup() {
      clearTimeout(timer);
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.off("aborted", onAborted);
    }

    function finish(callback, value) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback(value);
    }

    function onData(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      req.beastboundBodyBytes = bytes;
      if (bytes > maxBytes) {
        req.pause();
        finish(reject, payloadTooLarge());
        return;
      }
      chunks.push(buffer);
    }

    function onEnd() {
      if (declaredLength >= 0 && bytes !== declaredLength) {
        finish(reject, badRequest("request_body_length_mismatch", "请求内容长度不正确。"));
        return;
      }
      if (bytes === 0) {
        const empty = Buffer.alloc(0);
        req.beastboundBodyBuffer = empty;
        finish(resolve, empty);
        return;
      }
      const buffer = Buffer.concat(chunks, bytes);
      req.beastboundBodyBuffer = buffer;
      finish(resolve, buffer);
    }

    function onError(error) {
      finish(reject, error);
    }

    function onAborted() {
      finish(reject, badRequest("request_body_aborted", "请求内容未完整发送。"));
    }

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("aborted", onAborted);
  });
  req.beastboundBodyPromise = bodyPromise;
  return bodyPromise;
}

function validateDeclaredBodyLimit(req, maxBytes = DEFAULT_JSON_BODY_BYTES) {
  const declaredLength = contentLength(req);
  if (declaredLength > positiveInteger(maxBytes, DEFAULT_JSON_BODY_BYTES)) {
    throw payloadTooLarge();
  }
  return declaredLength;
}

function validateJsonContentType(req) {
  const value = String(req && req.headers && req.headers["content-type"] || "").trim().toLowerCase();
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/.test(value)) {
    throw new HttpBoundaryError(415, "content_type_unsupported", "请求内容必须使用 application/json。");
  }
}

function validateContentEncoding(req) {
  const value = String(req && req.headers && req.headers["content-encoding"] || "").trim().toLowerCase();
  if (value !== "" && value !== "identity") {
    throw new HttpBoundaryError(415, "content_encoding_unsupported", "暂不支持压缩请求内容。");
  }
}

function contentLength(req) {
  const value = req && req.headers ? req.headers["content-length"] : undefined;
  if (value === undefined || value === "") {
    return -1;
  }
  const text = String(value).trim();
  if (!/^(0|[1-9][0-9]*)$/.test(text)) {
    throw badRequest("request_content_length_invalid", "请求内容长度不正确。");
  }
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw badRequest("request_content_length_invalid", "请求内容长度不正确。");
  }
  return number;
}

function secureJsonHeaders(requestId, contentLengthBytes, options = {}) {
  const headers = {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": contentLengthBytes,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-request-id": String(requestId || createRequestId()),
  };
  if (options.closeConnection) {
    headers.connection = "close";
  }
  if (Number(options.retryAfterSeconds || 0) > 0) {
    headers["retry-after"] = String(Math.ceil(Number(options.retryAfterSeconds)));
  }
  return headers;
}

function applyHttpServerLimits(server, options = {}) {
  server.headersTimeout = positiveInteger(options.headersTimeoutMs, 5 * 1000);
  server.requestTimeout = positiveInteger(options.requestTimeoutMs, 15 * 1000);
  server.timeout = positiveInteger(options.socketIdleTimeoutMs, 30 * 1000);
  server.keepAliveTimeout = positiveInteger(options.keepAliveTimeoutMs, 5 * 1000);
  server.maxRequestsPerSocket = positiveInteger(options.maxRequestsPerSocket, 100);
  server.maxHeadersCount = positiveInteger(options.maxHeadersCount, 64);
  server.maxConnections = positiveInteger(options.maxConnections, 2048);
  return server;
}

function createRequestId() {
  return crypto.randomBytes(12).toString("base64url");
}

function badRequest(code, message) {
  return new HttpBoundaryError(400, code, message);
}

function payloadTooLarge() {
  return new HttpBoundaryError(413, "request_body_too_large", "请求内容过大。", {closeConnection: true});
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

module.exports = {
  AUTH_CHAT_JSON_BODY_BYTES,
  DEFAULT_BODY_TIMEOUT_MS,
  DEFAULT_JSON_BODY_BYTES,
  DEFAULT_MAX_REQUEST_TARGET_BYTES,
  HttpBoundaryError,
  applyHttpServerLimits,
  createRequestId,
  jsonBodyLimitForPath,
  parseOriginFormTarget,
  readBoundedBody,
  readBoundedJson,
  secureJsonHeaders,
  validateDeclaredBodyLimit,
};
