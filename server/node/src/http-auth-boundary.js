"use strict";

const crypto = require("node:crypto");

class AuthWorkQueueError extends Error {
  constructor() {
    super("认证请求较多，请稍后重试。");
    this.name = "AuthWorkQueueError";
    this.statusCode = 429;
    this.code = "auth_work_queue_full";
    this.publicMessage = "认证请求较多，请稍后重试。";
    this.retryAfterMs = 1000;
  }
}

function createHttpAuthBoundary(credentialSource, durableService, options = {}) {
  const queue = options.queue || createAsyncScryptQueue(options);

  async function register(payload = {}, clientIp = "") {
    const validation = credentialSource._httpValidateRegistration(payload);
    if (!validation.ok) {
      return validation;
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = await queue.derive(String(payload.password || ""), salt);
    const intent = {...payload, clientIp};
    delete intent.password;
    return durableService._httpRegisterPasswordDigest(intent, {
      salt,
      passwordHash,
      passwordByteLength: Buffer.byteLength(String(payload.password || "")),
    });
  }

  async function login(payload = {}, clientIp = "") {
    const password = String(payload.password || "");
    if (Buffer.byteLength(password) > 128) {
      return {ok: false, code: "invalid_credentials", message: "账号或密码不正确。"};
    }
    const record = credentialSource._httpPasswordVerificationRecord(payload.username);
    const passwordHash = await queue.derive(password, record.salt);
    const intent = {username: payload.username, clientIp};
    return durableService._httpLoginPasswordDigest(intent, passwordHash);
  }

  return {
    register,
    login,
    metrics: () => queue.metrics(),
  };
}

function createAsyncScryptQueue(options = {}) {
  const maxActive = positiveInteger(options.authWorkMaxActive, 4);
  const maxQueued = positiveInteger(options.authWorkMaxQueued, 32);
  const work = [];
  let active = 0;
  let completed = 0;
  let rejected = 0;
  let peakActive = 0;
  let peakQueued = 0;

  function derive(password, salt) {
    return new Promise((resolve, reject) => {
      const job = {password: String(password), salt: String(salt), resolve, reject};
      if (active < maxActive) {
        run(job);
        return;
      }
      if (work.length >= maxQueued) {
        rejected += 1;
        reject(new AuthWorkQueueError());
        return;
      }
      work.push(job);
      peakQueued = Math.max(peakQueued, work.length);
    });
  }

  function run(job) {
    active += 1;
    peakActive = Math.max(peakActive, active);
    crypto.scrypt(job.password, job.salt, 32, (error, derivedKey) => {
      active = Math.max(0, active - 1);
      if (error) {
        job.reject(error);
      } else {
        completed += 1;
        job.resolve(derivedKey.toString("hex"));
      }
      const next = work.shift();
      if (next) {
        run(next);
      }
    });
  }

  function metrics() {
    return Object.freeze({active, queued: work.length, maxActive, maxQueued, completed, rejected, peakActive, peakQueued});
  }

  return {derive, metrics};
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

module.exports = {
  AuthWorkQueueError,
  createAsyncScryptQueue,
  createHttpAuthBoundary,
};
