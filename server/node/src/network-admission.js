"use strict";

const crypto = require("node:crypto");
const net = require("node:net");

const DEFAULT_LIMITER_TTL_MS = 15 * 60 * 1000;
const DEFAULT_LIMITER_MAX_KEYS = 50_000;
const HTTP_RESPONSE_DIAGNOSTIC_PHASES = Object.freeze([
  "preSend",
  "metadata",
  "serialize",
  "byteLength",
  "writeHead",
  "end",
  "sendTotal",
]);

class NetworkAdmissionError extends Error {
  constructor(statusCode, code, publicMessage, options = {}) {
    super(publicMessage);
    this.name = "NetworkAdmissionError";
    this.statusCode = statusCode;
    this.code = code;
    this.publicMessage = publicMessage;
    this.retryAfterMs = Math.max(0, Math.ceil(Number(options.retryAfterMs || 0)));
    this.closeConnection = Boolean(options.closeConnection);
  }
}

class BoundedTokenBucketLimiter {
  constructor(options = {}) {
    this.now = typeof options.now === "function" ? options.now : Date.now;
    this.ttlMs = positiveInteger(options.ttlMs, DEFAULT_LIMITER_TTL_MS);
    this.maxKeys = positiveInteger(options.maxKeys, DEFAULT_LIMITER_MAX_KEYS);
    this.entries = new Map();
    this.rejected = 0;
    this.capacityRejected = 0;
  }

  consume(keyValue, policy = {}) {
    const key = String(keyValue || "");
    const capacity = positiveInteger(policy.capacity, 1);
    const windowMs = positiveInteger(policy.windowMs, 1000);
    const cost = positiveNumber(policy.cost, 1);
    const nowMs = this.now();
    this.pruneExpired(nowMs, 1024);
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= this.maxKeys) {
        this.capacityRejected += 1;
        this.rejected += 1;
        return {ok: false, retryAfterMs: this.ttlMs, capacityLimited: true};
      }
      entry = {tokens: capacity, updatedAt: nowMs, lastSeenAt: nowMs};
    } else {
      const elapsed = Math.max(0, nowMs - entry.updatedAt);
      entry.tokens = Math.min(capacity, entry.tokens + (elapsed * capacity / windowMs));
      entry.updatedAt = nowMs;
      entry.lastSeenAt = nowMs;
      this.entries.delete(key);
    }
    if (entry.tokens + Number.EPSILON < cost) {
      const missing = cost - entry.tokens;
      const retryAfterMs = Math.max(1, Math.ceil(missing * windowMs / capacity));
      this.entries.set(key, entry);
      this.rejected += 1;
      return {ok: false, retryAfterMs, capacityLimited: false};
    }
    entry.tokens -= cost;
    this.entries.set(key, entry);
    return {ok: true, retryAfterMs: 0, capacityLimited: false};
  }

  pruneExpired(nowMs = this.now(), maxDeletes = 1024) {
    let deleted = 0;
    for (const [key, entry] of this.entries) {
      if (nowMs - Number(entry.lastSeenAt || 0) < this.ttlMs) {
        break;
      }
      this.entries.delete(key);
      deleted += 1;
      if (deleted >= maxDeletes) {
        break;
      }
    }
    return deleted;
  }

  metrics() {
    return Object.freeze({
      keys: this.entries.size,
      maxKeys: this.maxKeys,
      rejected: this.rejected,
      capacityRejected: this.capacityRejected,
    });
  }
}

function createNetworkAdmission(options = {}) {
  const now = typeof options.now === "function" ? options.now : Date.now;
  const limiter = options.limiter || new BoundedTokenBucketLimiter({
    now,
    ttlMs: options.limiterTtlMs,
    maxKeys: options.limiterMaxKeys,
  });
  const trustedProxy = createTrustedProxyMatcher(options.trustedProxies || []);
  const processSalt = options.processSalt || crypto.randomBytes(32);
  const maxActiveHttp = positiveInteger(options.maxActiveHttp, 512);
  const policies = {
    gross: {capacity: positiveInteger(options.grossCapacity, 6000), windowMs: positiveInteger(options.grossWindowMs, 10_000)},
    authenticated: {capacity: positiveInteger(options.authenticatedCapacity, 300), windowMs: positiveInteger(options.authenticatedWindowMs, 10_000)},
    authIp: {capacity: positiveInteger(options.authIpCapacity, 300), windowMs: positiveInteger(options.authIpWindowMs, 60_000)},
    authAccount: {capacity: positiveInteger(options.authAccountCapacity, 10), windowMs: positiveInteger(options.authAccountWindowMs, 10 * 60_000)},
  };
  let activeHttp = 0;
  let peakActiveHttp = 0;
  let rejectedHttp = 0;
  let httpResponseCount = 0;
  let httpResponseBytes = 0;
  let httpResponseMaxBytes = null;
  let httpServiceCalls = 0;
  let httpServiceSyncMax = null;
  const httpResponsePhaseMax = Object.fromEntries(
    HTTP_RESPONSE_DIAGNOSTIC_PHASES.map((phase) => [phase, null]),
  );

  function networkIdentity(req) {
    return requestNetworkIdentity(req, {
      trustedProxy,
      maxForwardedBytes: options.maxForwardedBytes,
      maxForwardedHops: options.maxForwardedHops,
    });
  }

  function beginHttp(req) {
    if (activeHttp >= maxActiveHttp) {
      rejectedHttp += 1;
      throw new NetworkAdmissionError(503, "http_capacity_full", "服务器请求较多，请稍后重试。", {
        retryAfterMs: 1000,
        closeConnection: true,
      });
    }
    const identity = networkIdentity(req);
    enforce(limiter.consume(`gross:${identity.clientIp}`, policies.gross));
    activeHttp += 1;
    peakActiveHttp = Math.max(peakActiveHttp, activeHttp);
    let released = false;
    return {
      ...identity,
      clientIpHash: identityHash(identity.clientIp, processSalt),
      release() {
        if (released) {
          return;
        }
        released = true;
        activeHttp = Math.max(0, activeHttp - 1);
      },
    };
  }

  function admitAuthenticated(context, token) {
    const tokenKey = identityHash(String(token || ""), processSalt);
    enforce(limiter.consume(`session:${tokenKey}`, policies.authenticated));
    return context;
  }

  function admitAuthIp(context, action) {
    enforce(limiter.consume(`auth-ip:${String(action || "auth")}:${context.clientIp}`, policies.authIp));
    return context;
  }

  function admitAuthAccount(_context, action, username) {
    const account = String(username || "_").trim().toLowerCase() || "_";
    enforce(limiter.consume(
      `auth-account:${String(action || "auth")}:${identityHash(account, processSalt)}`,
      policies.authAccount,
    ));
  }

  function enforce(result) {
    if (result.ok) {
      return;
    }
    rejectedHttp += 1;
    throw new NetworkAdmissionError(429, "request_rate_limited", "请求太频繁，请稍后重试。", {
      retryAfterMs: result.retryAfterMs,
    });
  }

  function observeHttpResponse(sample = {}) {
    const responseBytes = nonNegativeInteger(sample.responseBytes);
    const base = Object.freeze({
      method: diagnosticMethod(sample.method),
      route: diagnosticRoute(sample.route),
      statusCode: diagnosticStatusCode(sample.statusCode),
      responseBytes,
    });
    httpResponseCount = saturatingAdd(httpResponseCount, 1);
    httpResponseBytes = saturatingAdd(httpResponseBytes, responseBytes);
    if (!httpResponseMaxBytes || responseBytes > httpResponseMaxBytes.responseBytes) {
      httpResponseMaxBytes = base;
    }
    for (const phase of HTTP_RESPONSE_DIAGNOSTIC_PHASES) {
      const durationMs = nonNegativeNumber(sample[`${phase}Ms`]);
      const current = httpResponsePhaseMax[phase];
      if (!current || durationMs > current.durationMs) {
        httpResponsePhaseMax[phase] = Object.freeze({...base, durationMs});
      }
    }
  }

  function observeHttpServiceCall(sample = {}) {
    const durationMs = nonNegativeNumber(sample.durationMs);
    httpServiceCalls = saturatingAdd(httpServiceCalls, 1);
    if (!httpServiceSyncMax || durationMs > httpServiceSyncMax.durationMs) {
      httpServiceSyncMax = Object.freeze({
        serviceMethod: diagnosticServiceMethod(sample.serviceMethod),
        route: diagnosticRoute(sample.route),
        durationMs,
      });
    }
  }

  function metrics() {
    const rate = limiter.metrics();
    return Object.freeze({
      activeHttp,
      peakActiveHttp,
      maxActiveHttp,
      rejectedHttp,
      rateLimitKeys: rate.keys,
      rateLimitMaxKeys: rate.maxKeys,
      rateLimitRejected: rate.rejected,
      rateLimitCapacityRejected: rate.capacityRejected,
      httpResponses: Object.freeze({
        count: httpResponseCount,
        bytes: httpResponseBytes,
        maxBytes: diagnosticSampleSnapshot(httpResponseMaxBytes),
        serviceCalls: httpServiceCalls,
        serviceSyncMax: diagnosticSampleSnapshot(httpServiceSyncMax),
        phaseMax: Object.freeze(Object.fromEntries(
          HTTP_RESPONSE_DIAGNOSTIC_PHASES.map((phase) => [
            phase,
            diagnosticSampleSnapshot(httpResponsePhaseMax[phase]),
          ]),
        )),
      }),
    });
  }

  return {
    networkIdentity,
    beginHttp,
    admitAuthenticated,
    admitAuthIp,
    admitAuthAccount,
    observeHttpResponse,
    observeHttpServiceCall,
    metrics,
  };
}

function diagnosticSampleSnapshot(sample) {
  if (!sample) {
    return null;
  }
  return Object.freeze({
    ...sample,
    ...(Object.hasOwn(sample, "durationMs")
      ? {durationMs: Number(sample.durationMs.toFixed(3))}
      : {}),
  });
}

function diagnosticMethod(value) {
  const method = String(value || "").trim().toUpperCase();
  return /^[A-Z]{1,12}$/.test(method) ? method : "UNKNOWN";
}

function diagnosticRoute(value) {
  const route = String(value || "").trim();
  if (route === "" || route.length > 128 || !/^\/[A-Za-z0-9_:/.-]+$/.test(route)) {
    return "/:redacted";
  }
  return route;
}

function diagnosticServiceMethod(value) {
  const method = String(value || "").trim();
  return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(method) ? method : "unknown";
}

function diagnosticStatusCode(value) {
  const statusCode = Number(value);
  return Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599 ? statusCode : 0;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function saturatingAdd(left, right) {
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Number(left || 0)) + Math.max(0, Number(right || 0)));
}

function requestNetworkIdentity(req, options = {}) {
  const peerIp = normalizeIp(req && req.socket && req.socket.remoteAddress, {strict: false}) || "unknown";
  const trustedProxy = options.trustedProxy || createTrustedProxyMatcher([]);
  if (!trustedProxy.matches(peerIp)) {
    return {peerIp, clientIp: peerIp, forwarded: false};
  }
  const header = req && req.headers ? req.headers["x-forwarded-for"] : undefined;
  if (header === undefined || String(header).trim() === "") {
    return {peerIp, clientIp: peerIp, forwarded: false};
  }
  if (Array.isArray(header) || Buffer.byteLength(String(header)) > positiveInteger(options.maxForwardedBytes, 256)) {
    throw new NetworkAdmissionError(400, "forwarded_for_invalid", "代理来源信息不正确。", {closeConnection: true});
  }
  const hops = String(header).split(",").map((value) => normalizeIp(value, {strict: true}));
  if (hops.length < 1 || hops.length > positiveInteger(options.maxForwardedHops, 3) || hops.some((value) => !value)) {
    throw new NetworkAdmissionError(400, "forwarded_for_invalid", "代理来源信息不正确。", {closeConnection: true});
  }
  for (let index = hops.length - 1; index >= 0; index -= 1) {
    if (!trustedProxy.matches(hops[index])) {
      return {peerIp, clientIp: hops[index], forwarded: true};
    }
  }
  throw new NetworkAdmissionError(400, "forwarded_for_invalid", "代理来源信息不正确。", {closeConnection: true});
}

function createTrustedProxyMatcher(values) {
  const blockList = new net.BlockList();
  let count = 0;
  for (const rawValue of Array.isArray(values) ? values : String(values || "").split(",")) {
    const value = String(rawValue || "").trim();
    if (!value) {
      continue;
    }
    const [addressText, prefixText, extra] = value.split("/");
    if (extra !== undefined) {
      throw new Error(`Invalid trusted proxy CIDR: ${value}`);
    }
    const address = normalizeIp(addressText, {strict: true});
    const familyNumber = net.isIP(address);
    if (!address || familyNumber === 0) {
      throw new Error(`Invalid trusted proxy address: ${value}`);
    }
    const family = familyNumber === 4 ? "ipv4" : "ipv6";
    if (prefixText === undefined) {
      blockList.addAddress(address, family);
    } else {
      const prefix = Number(prefixText);
      const maxPrefix = familyNumber === 4 ? 32 : 128;
      if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
        throw new Error(`Invalid trusted proxy CIDR: ${value}`);
      }
      blockList.addSubnet(address, prefix, family);
    }
    count += 1;
  }
  return Object.freeze({
    matches(value) {
      if (count === 0) {
        return false;
      }
      const address = normalizeIp(value, {strict: false});
      const familyNumber = net.isIP(address);
      return familyNumber > 0 && blockList.check(address, familyNumber === 4 ? "ipv4" : "ipv6");
    },
    count,
  });
}

function normalizeIp(value, options = {}) {
  let address = String(value || "").trim();
  if (address.startsWith("::ffff:") && net.isIP(address.slice(7)) === 4) {
    address = address.slice(7);
  }
  const family = net.isIP(address);
  if (family === 4) {
    return address.split(".").map((part) => String(Number(part))).join(".");
  }
  if (family === 6) {
    try {
      const hostname = new URL(`http://[${address}]/`).hostname;
      return hostname.slice(1, -1).toLowerCase();
    } catch {
      return "";
    }
  }
  return options.strict ? "" : address || "unknown";
}

function identityHash(value, salt) {
  return crypto.createHmac("sha256", salt).update(String(value || "")).digest("hex").slice(0, 16);
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

module.exports = {
  BoundedTokenBucketLimiter,
  DEFAULT_LIMITER_MAX_KEYS,
  DEFAULT_LIMITER_TTL_MS,
  NetworkAdmissionError,
  createNetworkAdmission,
  createTrustedProxyMatcher,
  normalizeIp,
  requestNetworkIdentity,
};
