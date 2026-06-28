"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const PASSWORD_MIN_LENGTH = 4;
const ROLE_PLAYER = "player";
const ROLE_GM = "gm";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_AUDIT_ROWS = 500;

function createAuthService(options = {}) {
  const store = options.store || createMemoryAuthStore();
  const now = options.now || (() => Date.now());
  const randomId = options.randomId || (() => crypto.randomUUID());
  const randomBytes = options.randomBytes || ((size) => crypto.randomBytes(size));

  function load() {
    return normalizeData(store.load());
  }

  function save(data) {
    store.save(normalizeData(data));
  }

  function register(payload = {}) {
    const username = normalizeUsername(payload.username);
    const password = String(payload.password || "");
    const displayName = String(payload.displayName || "").trim() || username;
    if (!isValidUsername(username)) {
      return fail("invalid_username", "账号只能使用3-20位小写字母、数字或下划线。");
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      return fail("weak_password", "密码至少需要4位。");
    }
    const data = load();
    if (data.accounts[username]) {
      recordAuthEvent(data, "register_denied", username, false, "账号已存在。", now);
      save(data);
      return fail("account_exists", "账号已存在，请直接登录。");
    }
    const accountId = `acc_${randomId()}`;
    const salt = randomBytes(16).toString("hex");
    const account = {
      accountId,
      username,
      displayName,
      role: ROLE_PLAYER,
      passwordSalt: salt,
      passwordHash: hashPassword(password, salt),
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    data.accounts[username] = account;
    data.profileBindings[accountId] = {
      accountId,
      playerId: `player_${accountId.slice(4, 16)}`,
      profileRevision: 0,
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    recordAuthEvent(data, "register", username, true, "", now);
    const sessionResult = createSessionForAccount(data, account, now, randomBytes);
    save(data);
    return ok({
      account: publicAccount(account),
      session: publicSession(sessionResult.session, account, data, sessionResult.token),
      profileBinding: data.profileBindings[accountId],
    });
  }

  function login(payload = {}) {
    const username = normalizeUsername(payload.username);
    const password = String(payload.password || "");
    const data = load();
    const account = data.accounts[username];
    if (!account) {
      recordAuthEvent(data, "login_denied", username, false, "账号不存在。", now);
      save(data);
      return fail("account_missing", "账号不存在。");
    }
    if (hashPassword(password, account.passwordSalt) !== account.passwordHash) {
      recordAuthEvent(data, "login_denied", username, false, "密码不正确。", now);
      save(data);
      return fail("wrong_password", "密码不正确。");
    }
    const sessionResult = createSessionForAccount(data, account, now, randomBytes);
    recordAuthEvent(data, "login", username, true, "", now);
    save(data);
    return ok({
      account: publicAccount(account),
      session: publicSession(sessionResult.session, account, data, sessionResult.token),
      profileBinding: data.profileBindings[account.accountId] || null,
    });
  }

  function logout(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    resolved.session.revokedAt = isoNow(now);
    recordAuthEvent(data, "logout", resolved.account.username, true, "", now);
    save(data);
    return ok({"message": "已退出登录。"});
  }

  function getSession(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    return ok({
      account: publicAccount(resolved.account),
      session: publicSession(resolved.session, resolved.account, data),
      profileBinding: data.profileBindings[resolved.account.accountId] || null,
    });
  }

  function grantGm(payload = {}) {
    const username = normalizeUsername(payload.username);
    const data = load();
    const account = data.accounts[username];
    if (!account) {
      return fail("account_missing", "账号不存在。");
    }
    account.role = ROLE_GM;
    account.updatedAt = isoNow(now);
    const commandIds = normalizeCommandIds(payload.commandIds || ["*"]);
    data.gmUserGrants[account.accountId] = {
      accountId: account.accountId,
      username,
      enabled: true,
      grantedBy: String(payload.grantedBy || "system"),
      expiresAt: payload.expiresAt || null,
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    data.gmCommandGrants[account.accountId] = commandIds.map((commandId) => ({
      accountId: account.accountId,
      commandId,
      enabled: true,
      grantedBy: String(payload.grantedBy || "system"),
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    }));
    recordAuthEvent(data, "gm_grant", username, true, commandIds.join(","), now);
    save(data);
    return ok({
      account: publicAccount(account),
      gmGrant: data.gmUserGrants[account.accountId],
      commandGrants: data.gmCommandGrants[account.accountId],
    });
  }

  function listGmTools(token, commandCatalog = []) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    if (!effectiveRoleIsGm(data, resolved.account, now)) {
      return fail("gm_denied", "当前账号没有GM权限。");
    }
    const allowed = commandCatalog
      .map((entry) => String(entry.id || "").trim())
      .filter((commandId) => commandId && commandAllowed(data, resolved.account.accountId, commandId));
    return ok({
      account: publicAccount(resolved.account),
      effectiveRole: ROLE_GM,
      commandIds: allowed,
    });
  }

  function authorizeGmCommand(payload = {}) {
    const token = payload.token;
    const commandId = normalizeCommandId(payload.commandId);
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      const audit = recordGmAudit(data, "", commandId, false, resolved.message, now, randomId);
      save(data);
      return fail(resolved.code, resolved.message, {"auditId": audit.auditId});
    }
    if (!commandId) {
      const audit = recordGmAudit(data, resolved.account.username, commandId, false, "GM命令为空。", now, randomId);
      save(data);
      return fail("empty_command", "GM命令为空。", {"auditId": audit.auditId});
    }
    if (!effectiveRoleIsGm(data, resolved.account, now)) {
      const audit = recordGmAudit(data, resolved.account.username, commandId, false, "当前账号没有GM权限。", now, randomId);
      save(data);
      return fail("gm_denied", "当前账号没有GM权限。", {"auditId": audit.auditId});
    }
    if (!commandAllowed(data, resolved.account.accountId, commandId)) {
      const audit = recordGmAudit(data, resolved.account.username, commandId, false, "GM命令未授权。", now, randomId);
      save(data);
      return fail("command_denied", "GM命令未授权。", {"auditId": audit.auditId});
    }
    const audit = recordGmAudit(data, resolved.account.username, commandId, true, "", now, randomId);
    save(data);
    return ok({
      commandId,
      auditId: audit.auditId,
      message: "GM命令已授权。",
    });
  }

  function snapshot() {
    return load();
  }

  return {
    register,
    login,
    logout,
    getSession,
    grantGm,
    listGmTools,
    authorizeGmCommand,
    snapshot,
  };
}

function createMemoryAuthStore(initialData = null) {
  let data = normalizeData(initialData || {});
  return {
    load() {
      return clone(data);
    },
    save(nextData) {
      data = normalizeData(clone(nextData));
    },
  };
}

function createJsonAuthStore(filePath) {
  return {
    load() {
      if (!fs.existsSync(filePath)) {
        return {};
      }
      try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch {
        return {};
      }
    },
    save(nextData) {
      fs.mkdirSync(path.dirname(filePath), {"recursive": true});
      fs.writeFileSync(filePath, JSON.stringify(normalizeData(nextData), null, 2));
    },
  };
}

function normalizeData(raw) {
  const data = raw && typeof raw === "object" ? clone(raw) : {};
  return {
    schemaVersion: 1,
    accounts: objectOrEmpty(data.accounts),
    sessions: objectOrEmpty(data.sessions),
    profileBindings: objectOrEmpty(data.profileBindings),
    gmUserGrants: objectOrEmpty(data.gmUserGrants),
    gmCommandGrants: objectOrEmpty(data.gmCommandGrants),
    gmCommandAudit: Array.isArray(data.gmCommandAudit) ? data.gmCommandAudit : [],
    authEvents: Array.isArray(data.authEvents) ? data.authEvents : [],
  };
}

function createSessionForAccount(data, account, now, randomBytes) {
  const token = randomBytes(32).toString("base64url");
  const session = {
    sessionId: `sess_${crypto.randomUUID()}`,
    accountId: account.accountId,
    tokenHash: hashToken(token),
    createdAt: isoNow(now),
    expiresAt: new Date(now() + SESSION_TTL_MS).toISOString(),
    revokedAt: null,
    schemaVersion: 1,
  };
  data.sessions[session.sessionId] = session;
  return {session, token};
}

function resolveSession(data, token, now) {
  const tokenHash = hashToken(String(token || ""));
  const session = Object.values(data.sessions).find((value) => value && value.tokenHash === tokenHash);
  if (!session) {
    return {"ok": false, "code": "session_missing", "message": "登录会话不存在。"};
  }
  if (session.revokedAt) {
    return {"ok": false, "code": "session_revoked", "message": "登录会话已失效。"};
  }
  if (Date.parse(session.expiresAt) <= now()) {
    return {"ok": false, "code": "session_expired", "message": "登录会话已过期。"};
  }
  const account = Object.values(data.accounts).find((value) => value.accountId === session.accountId);
  if (!account) {
    return {"ok": false, "code": "account_missing", "message": "账号不存在。"};
  }
  return {"ok": true, session, account};
}

function publicAccount(account) {
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    createdAt: account.createdAt,
  };
}

function publicSession(session, account, data, token = "") {
  const result = {
    sessionId: session.sessionId,
    username: account.username,
    effectiveRole: effectiveRoleIsGm(data, account, () => Date.now()) ? ROLE_GM : ROLE_PLAYER,
    expiresAt: session.expiresAt,
  };
  if (token) {
    result.token = token;
  }
  return result;
}

function effectiveRoleIsGm(data, account, now) {
  if (!account || account.role !== ROLE_GM) {
    return false;
  }
  const grant = data.gmUserGrants[account.accountId];
  if (!grant || !grant.enabled) {
    return false;
  }
  if (grant.expiresAt && Date.parse(grant.expiresAt) <= now()) {
    return false;
  }
  return true;
}

function commandAllowed(data, accountId, commandId) {
  const grants = Array.isArray(data.gmCommandGrants[accountId]) ? data.gmCommandGrants[accountId] : [];
  return grants.some((grant) => grant.enabled && (grant.commandId === "*" || grant.commandId === commandId));
}

function recordGmAudit(data, username, commandId, okValue, message, now, randomId) {
  const audit = {
    auditId: `audit_${randomId()}`,
    username,
    commandId,
    ok: Boolean(okValue),
    message,
    createdAt: isoNow(now),
    schemaVersion: 1,
  };
  data.gmCommandAudit.push(audit);
  while (data.gmCommandAudit.length > MAX_AUDIT_ROWS) {
    data.gmCommandAudit.shift();
  }
  return audit;
}

function recordAuthEvent(data, type, username, okValue, message, now) {
  data.authEvents.push({
    eventId: `auth_${crypto.randomUUID()}`,
    type,
    username,
    ok: Boolean(okValue),
    message,
    createdAt: isoNow(now),
    schemaVersion: 1,
  });
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function normalizeCommandId(commandId) {
  return String(commandId || "").trim().toLowerCase();
}

function normalizeCommandIds(commandIds) {
  const result = [];
  for (const value of commandIds) {
    const commandId = normalizeCommandId(value);
    if (commandId && !result.includes(commandId)) {
      result.push(commandId);
    }
  }
  return result.length > 0 ? result : ["*"];
}

function isValidUsername(username) {
  return (
    username.length >= USERNAME_MIN_LENGTH &&
    username.length <= USERNAME_MAX_LENGTH &&
    /^[a-z0-9_]+$/.test(username)
  );
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), String(salt), 32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function isoNow(now) {
  return new Date(now()).toISOString();
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function ok(payload = {}) {
  return {"ok": true, ...payload};
}

function fail(code, message, extra = {}) {
  return {"ok": false, code, message, ...extra};
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  ROLE_PLAYER,
  ROLE_GM,
  createAuthService,
  createMemoryAuthStore,
  createJsonAuthStore,
  normalizeUsername,
  isValidUsername,
};
