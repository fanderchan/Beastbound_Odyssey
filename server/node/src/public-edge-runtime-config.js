"use strict";

const net = require("node:net");
const {
  createTrustedProxyMatcher,
} = require("./network-admission");

const EDGE_MODE_DIRECT = "direct";
const EDGE_MODE_TRUSTED_TLS_PROXY = "trusted_tls_proxy";

function createPublicEdgeRuntimeConfig(env = process.env, options = {}) {
  const source = env && typeof env === "object" ? env : {};
  const mode = String(source.BEASTBOUND_EDGE_MODE || EDGE_MODE_DIRECT).trim().toLowerCase();
  if (![EDGE_MODE_DIRECT, EDGE_MODE_TRUSTED_TLS_PROXY].includes(mode)) {
    throw configurationError(
      "public_edge_mode_invalid",
      "BEASTBOUND_EDGE_MODE must be direct or trusted_tls_proxy",
    );
  }
  const trustedProxies = configuredList(source.BEASTBOUND_TRUSTED_PROXIES);
  validateTrustedProxies(trustedProxies, mode);
  const allowedOrigins = configuredList(source.BEASTBOUND_WS_ALLOWED_ORIGINS);
  if (mode === EDGE_MODE_TRUSTED_TLS_PROXY) {
    validatePrivateBackendHost(options.backendHost);
    validateSecureOrigins(allowedOrigins);
  }
  const trustedProxyCount = trustedProxies.length;
  const trustedTlsProxy = mode === EDGE_MODE_TRUSTED_TLS_PROXY;
  return Object.freeze({
    mode,
    trustedProxies: Object.freeze([...trustedProxies]),
    allowedOrigins: Object.freeze([...allowedOrigins]),
    networkAdmissionOptions: Object.freeze({
      edgeMode: mode,
      requireTrustedTlsProxy: trustedTlsProxy,
      allowDirectHealthPaths: true,
    }),
    summary: Object.freeze({
      mode,
      tlsTerminatedAtTrustedProxy: trustedTlsProxy,
      backendPrivateBindRequired: trustedTlsProxy,
      trustedProxyCount,
      webSocketOriginCount: allowedOrigins.length,
    }),
  });
}

function validateTrustedProxies(values, mode) {
  try {
    createTrustedProxyMatcher(values);
  } catch (error) {
    throw configurationError(
      "public_edge_trusted_proxy_invalid",
      "BEASTBOUND_TRUSTED_PROXIES contains an invalid address or CIDR",
      error,
    );
  }
  if (mode !== EDGE_MODE_TRUSTED_TLS_PROXY) {
    return;
  }
  if (values.length === 0) {
    throw configurationError(
      "public_edge_trusted_proxy_required",
      "trusted_tls_proxy mode requires BEASTBOUND_TRUSTED_PROXIES",
    );
  }
  if (values.some((value) => value.includes("/") && Number(value.split("/")[1]) === 0)) {
    throw configurationError(
      "public_edge_trust_all_forbidden",
      "trusted_tls_proxy mode forbids a trust-all proxy range",
    );
  }
}

function validatePrivateBackendHost(value) {
  const host = normalizedHost(value);
  if (!isPrivateOrLoopbackHost(host)) {
    throw configurationError(
      "public_edge_backend_bind_unsafe",
      "trusted_tls_proxy mode requires a loopback or private IP backend bind",
    );
  }
}

function validateSecureOrigins(values) {
  for (const value of values) {
    let url;
    try {
      url = new URL(value);
    } catch (error) {
      throw configurationError(
        "public_edge_ws_origin_invalid",
        "trusted_tls_proxy mode requires canonical HTTPS WebSocket origins",
        error,
      );
    }
    if (
      url.protocol !== "https:"
      || url.origin !== value
      || url.username !== ""
      || url.password !== ""
    ) {
      throw configurationError(
        "public_edge_ws_origin_invalid",
        "trusted_tls_proxy mode requires canonical HTTPS WebSocket origins",
      );
    }
  }
}

function normalizedHost(value) {
  const text = String(value || "127.0.0.1").trim().toLowerCase();
  if (text.startsWith("[") && text.endsWith("]")) {
    return text.slice(1, -1);
  }
  return text;
}

function isPrivateOrLoopbackHost(host) {
  if (host === "localhost") {
    return true;
  }
  const family = net.isIP(host);
  if (family === 4) {
    const parts = host.split(".").map(Number);
    return (
      parts[0] === 10
      || parts[0] === 127
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
    );
  }
  if (family === 6) {
    return host === "::1" || /^f[cd][0-9a-f]*:/i.test(host) || /^fe[89ab][0-9a-f]*:/i.test(host);
  }
  return false;
}

function configuredList(value) {
  return String(value || "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function configurationError(code, message, cause = undefined) {
  const error = new Error(message, cause === undefined ? undefined : {cause});
  error.code = code;
  return error;
}

module.exports = {
  EDGE_MODE_DIRECT,
  EDGE_MODE_TRUSTED_TLS_PROXY,
  createPublicEdgeRuntimeConfig,
  isPrivateOrLoopbackHost,
};
