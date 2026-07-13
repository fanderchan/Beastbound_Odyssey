"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  createAuthService,
  createMemoryAuthStore,
} = require("../auth-service");
const {
  canonicalFutureExpiry,
  inspectLocalQaPlugin,
  localQaPolicyUsername,
  pluginDocumentForLocalQaLease,
} = require("./local-qa-gm-policy");
const {QA_CORE_ITEMS} = require("./gm-qa-profile");

const QA_ASSET_WORST_CASE_BANK_SLOTS = 76;
const QA_ASSET_BANK_CAPACITY = 90;
const QA_PET_SAMPLE_COUNT = 13;
const QA_PET_TOTAL_CAPACITY = 25;
const QA_PET_RESERVED_CAPTURE_SLOTS = 1;
const PRIVATE_FILE_MODE = 0o600;

function buildLocalQaGmAccountChange(sourceValue, options = {}) {
  const policy = options.policy;
  if (!policy || typeof policy !== "object") {
    throw opsError("local_qa_policy_missing", "缺少本地QA授权策略。");
  }
  const operation = normalizedOperation(options.operation);
  const username = localQaPolicyUsername(policy, options.username);
  const nowMs = Number(options.nowMs ?? Date.now());
  if (!Number.isFinite(nowMs)) {
    throw opsError("local_qa_clock_invalid", "本机时间不可用。");
  }
  const nowIso = new Date(nowMs).toISOString();
  const expiresAt = String(options.expiresAt || "");
  if (operation !== "revoke" && canonicalFutureExpiry(expiresAt, nowMs) === null) {
    throw opsError("local_qa_expiry_invalid", "GM授权必须使用规范且尚未到期的UTC时间。");
  }
  const source = clone(sourceValue || {});
  const memoryStore = createMemoryAuthStore(source);
  const service = createAuthService({
    store: memoryStore,
    now: () => nowMs,
    randomId: options.randomId,
    randomBytes: options.randomBytes,
  });
  let data = service.snapshot();
  let account = objectOrEmpty(data.accounts[username]);
  const accountExisted = Object.keys(account).length > 0;
  const password = String(options.password || "");
  const rotatePassword = Boolean(options.rotatePassword);

  if (operation === "renew" && !accountExisted) {
    throw opsError("local_qa_account_missing", "续期要求本地QA账号已经存在，请先执行 init。");
  }
  if (operation === "revoke" && !accountExisted) {
    return unchangedMissingAccountResult(source, policy, username, operation, nowMs);
  }

  if (!accountExisted) {
    if (operation !== "init") {
      throw opsError("local_qa_account_missing", "本地QA账号不存在。");
    }
    if (password.length < 8) {
      throw opsError("local_qa_password_required", "创建本地QA账号需要至少8位的进程内密码。");
    }
    const registered = service.register({
      username,
      password,
      displayName: "本地QA GM",
      clientIp: "local_qa_ops",
    });
    if (!registered || registered.ok !== true) {
      throw opsError(
        String(registered && registered.code || "local_qa_account_create_failed"),
        String(registered && registered.message || "本地QA账号创建失败。"),
      );
    }
    data = service.snapshot();
    account = objectOrEmpty(data.accounts[username]);
  }

  if (operation === "revoke") {
    data = revokedCandidate(data, policy, account, username, nowIso, options.randomId);
  } else {
    const granted = service.grantGm({
      username,
      commandIds: [...policy.serverCommandIds],
      expiresAt,
      policyId: policy.policyId,
      grantedBy: "local_qa_ops",
    });
    if (!granted || granted.ok !== true) {
      throw opsError(
        String(granted && granted.code || "local_qa_grant_failed"),
        String(granted && granted.message || "本地QA授权失败。"),
      );
    }
    data = service.snapshot();
    account = objectOrEmpty(data.accounts[username]);
    // Keep the ops candidate strict even when inspecting an older service build.
    data.gmUserGrants[account.accountId] = strictUserGrant(
      data.gmUserGrants[account.accountId],
      policy,
      account,
      username,
      expiresAt,
      nowIso,
    );
    data.gmCommandGrants[account.accountId] = policy.serverCommandIds.map((commandId) => strictCommandGrant(
      commandId,
      policy,
      account.accountId,
      expiresAt,
      nowIso,
    ));
  }

  account = objectOrEmpty(data.accounts[username]);
  let passwordChanged = !accountExisted;
  let sessionsRevoked = 0;
  if (accountExisted && rotatePassword) {
    if (password.length < 8) {
      throw opsError("local_qa_password_required", "轮换本地QA密码需要至少8位的进程内密码。");
    }
    const randomBytes = typeof options.randomBytes === "function" ? options.randomBytes : crypto.randomBytes;
    const salt = randomBytes(16).toString("hex");
    account = {
      ...account,
      passwordSalt: salt,
      passwordHash: crypto.scryptSync(password, salt, 32).toString("hex"),
      passwordPolicyVersion: Math.max(2, Math.trunc(Number(account.passwordPolicyVersion || 2))),
      passwordUpdatedAt: nowIso,
      updatedAt: nowIso,
    };
    data.accounts[username] = account;
    passwordChanged = true;
  }
  if (!accountExisted || rotatePassword) {
    for (const [sessionId, session] of Object.entries(objectOrEmpty(data.sessions))) {
      if (String(session && session.accountId || "") === String(account.accountId || "")) {
        delete data.sessions[sessionId];
        sessionsRevoked += 1;
      }
    }
  }

  const inspection = inspectLocalQaGmAccountState({
    data,
    policy,
    username,
    plugin: operation === "revoke"
      ? pluginDocumentForLocalQaLease(policy, username, nowIso, false, nowMs)
      : pluginDocumentForLocalQaLease(policy, username, expiresAt, true, nowMs),
    pluginExists: true,
    pluginMode: PRIVATE_FILE_MODE,
    accountsMode: PRIVATE_FILE_MODE,
    nowMs,
  });
  const expectedActive = operation !== "revoke";
  if (inspection.serverGrant.active !== expectedActive) {
    throw opsError("local_qa_candidate_invalid", "本地QA授权候选未通过严格校验。");
  }
  return {
    data,
    policy,
    pluginDocument: operation === "revoke"
      ? pluginDocumentForLocalQaLease(policy, username, nowIso, false, nowMs)
      : pluginDocumentForLocalQaLease(policy, username, expiresAt, true, nowMs),
    verification: {
      username,
      operation,
      expectedActive,
      policyId: policy.policyId,
      expiresAt: operation === "revoke" ? nowIso : expiresAt,
    },
    report: {
      username,
      operation,
      changed: true,
      accountCreated: !accountExisted,
      passwordChanged,
      sessionsRevoked,
      expiresAt: operation === "revoke" ? "" : expiresAt,
      serverCommandCount: policy.serverCommandIds.length,
      clientCommandCount: policy.clientCommandIds.length,
      policyId: policy.policyId,
    },
  };
}

function inspectLocalQaGmAccountState(options = {}) {
  const data = objectOrEmpty(options.data);
  const policy = options.policy;
  const username = localQaPolicyUsername(policy, options.username);
  const nowMs = Number(options.nowMs ?? Date.now());
  const account = objectOrEmpty(objectOrEmpty(data.accounts)[username]);
  const accountExists = Object.keys(account).length > 0;
  const accountId = String(account.accountId || "");
  const rawUserGrant = objectOrEmpty(objectOrEmpty(data.gmUserGrants)[accountId]);
  const rawCommandGrants = Array.isArray(objectOrEmpty(data.gmCommandGrants)[accountId])
    ? data.gmCommandGrants[accountId]
    : [];
  const serverGrant = inspectServerGrant(
    account,
    rawUserGrant,
    rawCommandGrants,
    policy,
    username,
    nowMs,
  );
  const pluginInspection = inspectLocalQaPlugin(options.plugin, policy, username, nowMs);
  const pluginMode = numericMode(options.pluginMode);
  const accountsMode = numericMode(options.accountsMode);
  const plugin = {
    exists: Boolean(options.pluginExists),
    ...pluginInspection,
    privateMode: pluginMode === PRIVATE_FILE_MODE,
    fileMode: octalMode(pluginMode),
  };
  const profile = profileReadiness(data, account);
  return {
    schemaVersion: 1,
    username,
    policy: {
      policyId: policy.policyId,
      defaultLeaseHours: policy.defaultLeaseHours,
      maxLeaseHours: policy.maxLeaseHours,
      serverCommandCount: policy.serverCommandIds.length,
      clientCommandCount: policy.clientCommandIds.length,
    },
    account: {
      exists: accountExists,
      role: String(account.role || ""),
      effectiveRole: serverGrant.active ? "gm" : "player",
      accountsPrivateMode: accountsMode === PRIVATE_FILE_MODE,
      accountsFileMode: octalMode(accountsMode),
    },
    serverGrant,
    plugin,
    ready: serverGrant.active
      && plugin.active
      && plugin.privateMode
      && accountsMode === PRIVATE_FILE_MODE,
    qaProfile: profile,
  };
}

function inspectServerGrant(account, userGrant, commandGrants, policy, username, nowMs) {
  const accountId = String(account.accountId || "");
  const commandIds = commandGrants.map((grant) => String(grant && grant.commandId || ""));
  const missingCommands = policy.serverCommandIds.filter((commandId) => !commandIds.includes(commandId));
  const unexpectedCommands = commandIds.filter((commandId) => !policy.serverCommandIds.includes(commandId));
  const wildcard = commandIds.includes("*");
  const duplicateCommands = commandIds.length !== new Set(commandIds).size;
  const userExpiry = canonicalFutureExpiry(userGrant.expiresAt, nowMs);
  const commandExpiryValues = commandGrants.map((grant) => String(grant && grant.expiresAt || ""));
  const expiryConsistent = userExpiry !== null
    && commandExpiryValues.length === policy.serverCommandIds.length
    && commandExpiryValues.every((value) => value === userGrant.expiresAt);
  const ownerMatches = accountId !== ""
    && String(userGrant.accountId || "") === accountId
    && String(userGrant.username || "") === username
    && commandGrants.every((grant) => String(grant && grant.accountId || "") === accountId);
  const policyMatches = userGrant.policyId === policy.policyId
    && commandGrants.every((grant) => grant && grant.policyId === policy.policyId);
  const allEnabled = userGrant.enabled === true
    && commandGrants.every((grant) => grant && grant.enabled === true);
  const schemaMatches = userGrant.schemaVersion === 2
    && commandGrants.every((grant) => grant && grant.schemaVersion === 2);
  const catalogMatches = missingCommands.length === 0
    && unexpectedCommands.length === 0
    && commandIds.length === policy.serverCommandIds.length
    && !duplicateCommands
    && !wildcard;
  const active = String(account.role || "") === "gm"
    && allEnabled
    && ownerMatches
    && policyMatches
    && schemaMatches
    && catalogMatches
    && expiryConsistent;
  return {
    active,
    enabled: userGrant.enabled === true,
    schemaMatches,
    policyMatches,
    ownerMatches,
    expiryConsistent,
    wildcard,
    duplicateCommands,
    commandCount: commandIds.length,
    missingCommands,
    unexpectedCommands,
    expiresAt: typeof userGrant.expiresAt === "string" ? userGrant.expiresAt : "",
    remainingSeconds: userExpiry ? Math.max(0, Math.floor((userExpiry.timestamp - nowMs) / 1000)) : 0,
  };
}

function applyLocalQaGmAccountChange(store, sourceValue, change) {
  if (!store || typeof store.save !== "function" || typeof store.load !== "function") {
    throw opsError("local_qa_store_invalid", "本地QA运维需要可持久化且可复核的存储。");
  }
  const source = clone(sourceValue || {});
  try {
    store.save(change.data);
    const reloaded = store.load();
    const verification = verifyLocalQaGmAccountChange(reloaded, change);
    if (!verification.ok) {
      throw opsError("local_qa_apply_verification_failed", `授权复核失败：${verification.reasons.join(",")}`);
    }
    return verification;
  } catch (error) {
    const rollback = rollbackLocalQaGmAccountChange(store, source);
    error.message = `${error.message}; rollback=${rollback.ok ? "ok" : "failed"}`;
    if (!rollback.ok && rollback.error) {
      error.message += `; rollbackError=${rollback.error}`;
    }
    throw error;
  }
}

function verifyLocalQaGmAccountChange(value, change) {
  const data = objectOrEmpty(value);
  const context = change.verification;
  const policy = change.policy || null;
  const account = objectOrEmpty(objectOrEmpty(data.accounts)[context.username]);
  const accountId = String(account.accountId || "");
  const userGrant = objectOrEmpty(objectOrEmpty(data.gmUserGrants)[accountId]);
  const commandGrants = Array.isArray(objectOrEmpty(data.gmCommandGrants)[accountId])
    ? data.gmCommandGrants[accountId]
    : [];
  const reasons = [];
  const accountMissing = String(account.username || "") !== context.username;
  if (accountMissing && !context.allowMissingAccount) {
    reasons.push("account_missing");
  }
  if (context.expectedActive) {
    if (String(account.role || "") !== "gm") reasons.push("role_not_gm");
    if (userGrant.enabled !== true) reasons.push("user_grant_disabled");
    if (
      userGrant.schemaVersion !== 2
      || String(userGrant.accountId || "") !== accountId
      || String(userGrant.username || "") !== context.username
    ) reasons.push("user_grant_identity_mismatch");
    if (userGrant.expiresAt !== context.expiresAt) reasons.push("user_expiry_mismatch");
    if (userGrant.policyId !== context.policyId) reasons.push("user_policy_mismatch");
    const expectedIds = policy ? policy.serverCommandIds : change.data.gmCommandGrants[accountId].map((row) => row.commandId);
    if (!sameStringSet(commandGrants.map((row) => row && row.commandId), expectedIds)) reasons.push("command_catalog_mismatch");
    if (commandGrants.some((row) => (
      !row
      || row.enabled !== true
      || row.schemaVersion !== 2
      || String(row.accountId || "") !== accountId
      || row.expiresAt !== context.expiresAt
      || row.policyId !== context.policyId
    ))) {
      reasons.push("command_grant_mismatch");
    }
  } else if (!accountMissing) {
    if (
      userGrant.enabled !== false
      || userGrant.schemaVersion !== 2
      || String(userGrant.accountId || "") !== accountId
      || String(userGrant.username || "") !== context.username
      || userGrant.policyId !== context.policyId
      || userGrant.expiresAt !== context.expiresAt
    ) reasons.push("user_grant_not_revoked");
    const expectedIds = policy ? policy.serverCommandIds : [];
    if (!sameStringSet(commandGrants.map((row) => row && row.commandId), expectedIds)) {
      reasons.push("revoked_command_catalog_mismatch");
    }
    if (commandGrants.some((row) => (
      !row
      || row.enabled !== false
      || row.schemaVersion !== 2
      || String(row.accountId || "") !== accountId
      || row.policyId !== context.policyId
      || row.expiresAt !== context.expiresAt
    ))) reasons.push("command_grant_not_revoked");
  }
  return {ok: reasons.length === 0, reasons};
}

function rollbackLocalQaGmAccountChange(store, sourceValue) {
  try {
    store.save(sourceValue);
    return {ok: true};
  } catch (error) {
    return {ok: false, error: String(error && error.message || error)};
  }
}

function atomicWritePrivateJson(filePathValue, document, options = {}) {
  return atomicWritePrivateBytes(
    filePathValue,
    Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8"),
    PRIVATE_FILE_MODE,
    options,
  );
}

function atomicWritePrivateBytes(filePathValue, bytesValue, modeValue = PRIVATE_FILE_MODE, options = {}) {
  const fsModule = options.fsModule || fs;
  const filePath = path.resolve(String(filePathValue || ""));
  const mode = Number.isInteger(modeValue) ? modeValue & 0o777 : PRIVATE_FILE_MODE;
  const bytes = Buffer.isBuffer(bytesValue) ? bytesValue : Buffer.from(bytesValue || "");
  if (filePath === path.parse(filePath).root) {
    throw opsError("local_qa_private_path_invalid", "私有文件路径无效。");
  }
  fsModule.mkdirSync(path.dirname(filePath), {recursive: true});
  const tempPath = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  let fd = null;
  try {
    fd = fsModule.openSync(tempPath, "wx", mode);
    fsModule.writeFileSync(fd, bytes);
    fsModule.fchmodSync(fd, mode);
    fsModule.fsyncSync(fd);
    fsModule.closeSync(fd);
    fd = null;
    fsModule.renameSync(tempPath, filePath);
    fsModule.chmodSync(filePath, mode);
  } catch (error) {
    if (fd !== null) {
      try { fsModule.closeSync(fd); } catch {}
    }
    try { fsModule.rmSync(tempPath, {force: true}); } catch {}
    throw error;
  }
  return filePath;
}

function readPrivateFileSnapshot(filePathValue) {
  const filePath = path.resolve(String(filePathValue || ""));
  if (!fs.existsSync(filePath)) {
    return {exists: false, filePath, bytes: null, mode: null};
  }
  const stat = fs.statSync(filePath);
  return {
    exists: true,
    filePath,
    bytes: fs.readFileSync(filePath),
    mode: stat.mode & 0o777,
  };
}

function restorePrivateFileSnapshot(snapshot) {
  if (!snapshot || !snapshot.filePath) {
    return;
  }
  if (!snapshot.exists) {
    fs.rmSync(snapshot.filePath, {force: true});
    return;
  }
  atomicWritePrivateBytes(
    snapshot.filePath,
    snapshot.bytes,
    snapshot.mode ?? PRIVATE_FILE_MODE,
  );
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return {exists: false, value: {}, mode: null};
  }
  const stat = fs.statSync(filePath);
  try {
    return {
      exists: true,
      value: JSON.parse(fs.readFileSync(filePath, "utf8")),
      mode: stat.mode & 0o777,
    };
  } catch {
    return {exists: true, value: {}, mode: stat.mode & 0o777, invalid: true};
  }
}

function privateCredentialDocument(username, password, createdAt) {
  if (String(password || "").length < 8) {
    throw opsError("local_qa_password_required", "私有凭据密码长度不足。");
  }
  return {
    schemaVersion: 1,
    username: String(username || ""),
    password: String(password),
    createdAt: String(createdAt || new Date().toISOString()),
  };
}

function randomLocalQaPassword(randomBytes = crypto.randomBytes) {
  return randomBytes(24).toString("base64url");
}

function revokedCandidate(dataValue, policy, account, username, nowIso, randomId) {
  const data = clone(dataValue);
  const accountId = String(account.accountId || "");
  data.gmUserGrants[accountId] = strictUserGrant(
    data.gmUserGrants[accountId],
    policy,
    account,
    username,
    nowIso,
    nowIso,
    false,
  );
  data.gmCommandGrants[accountId] = policy.serverCommandIds.map((commandId) => ({
    ...strictCommandGrant(commandId, policy, accountId, nowIso, nowIso),
    enabled: false,
  }));
  data.authEvents = Array.isArray(data.authEvents) ? data.authEvents : [];
  const id = typeof randomId === "function" ? randomId() : crypto.randomUUID();
  data.authEvents.push({
    eventId: `auth_${id}`,
    type: "local_qa_gm_revoke",
    username,
    ok: true,
    message: policy.policyId,
    createdAt: nowIso,
    schemaVersion: 1,
  });
  return data;
}

function strictUserGrant(previousValue, policy, account, username, expiresAt, nowIso, enabled = true) {
  const previous = objectOrEmpty(previousValue);
  return {
    accountId: String(account.accountId || ""),
    username,
    enabled: Boolean(enabled),
    grantedBy: "local_qa_ops",
    expiresAt,
    policyId: policy.policyId,
    createdAt: String(previous.createdAt || nowIso),
    updatedAt: nowIso,
    schemaVersion: 2,
  };
}

function strictCommandGrant(commandId, policy, accountId, expiresAt, nowIso) {
  return {
    accountId,
    commandId,
    enabled: true,
    grantedBy: "local_qa_ops",
    expiresAt,
    policyId: policy.policyId,
    createdAt: nowIso,
    updatedAt: nowIso,
    schemaVersion: 2,
  };
}

function unchangedMissingAccountResult(source, policy, username, operation, nowMs) {
  const nowIso = new Date(nowMs).toISOString();
  return {
    data: source,
    policy,
    pluginDocument: pluginDocumentForLocalQaLease(policy, username, nowIso, false, nowMs),
    verification: {
      username,
      operation,
      expectedActive: false,
      allowMissingAccount: true,
      policyId: policy.policyId,
      expiresAt: nowIso,
    },
    report: {
      username,
      operation,
      changed: false,
      accountCreated: false,
      passwordChanged: false,
      sessionsRevoked: 0,
      expiresAt: "",
      serverCommandCount: policy.serverCommandIds.length,
      clientCommandCount: policy.clientCommandIds.length,
      policyId: policy.policyId,
    },
  };
}

function profileReadiness(data, account) {
  const accountId = String(account.accountId || "");
  const binding = objectOrEmpty(objectOrEmpty(data.profileBindings)[accountId]);
  const profileDoc = objectOrEmpty(objectOrEmpty(data.profiles)[String(binding.playerId || "")]);
  const profile = objectOrEmpty(profileDoc.profile);
  const pets = Array.isArray(profile.petInstances) ? profile.petInstances : [];
  const storagePets = pets.filter((pet) => String(pet && pet.state || "standby") === "storage").length;
  const backpack = Array.isArray(profile.backpackSlots) ? profile.backpackSlots : [];
  const emptyBackpackSlots = backpack.filter((slot) => (
    isPlainRecord(slot) && Object.keys(slot).length === 0
  )).length;
  const bank = objectOrEmpty(profile.bank);
  const bankSlots = Array.isArray(bank.slots) ? bank.slots : [];
  const bankUsedSlots = bankSlots.filter((slot) => String(slot && slot.itemId || "") !== "").length;
  const backpackCounts = new Map();
  for (const slot of backpack) {
    const itemId = String(slot && slot.itemId || "");
    if (itemId !== "") {
      const count = Math.max(0, Math.trunc(Number(slot && slot.count || 0)));
      backpackCounts.set(itemId, (backpackCounts.get(itemId) || 0) + count);
    }
  }
  const coreTargetsSatisfied = Math.max(0, Math.trunc(Number(profile.stoneCoins || 0))) >= 1000000
    && Math.max(0, Math.trunc(Number(profile.diamonds || 0))) >= 100000
    && Math.max(0, Math.trunc(Number(profile.backpackExtraSlots || 0))) >= 5
    && QA_CORE_ITEMS.every((entry) => (backpackCounts.get(entry.itemId) || 0) >= entry.count);
  return {
    exists: Object.keys(profile).length > 0,
    profileRevision: Math.max(0, Math.trunc(Number(binding.profileRevision || profileDoc.profileRevision || 0))),
    manifests: {
      coreTargetsSatisfied,
      petSamplesPrepared: Boolean(objectOrEmpty(profile.gmQaPetSampleManifests).qa_pet_samples_v1),
      assetsPrepared: Boolean(objectOrEmpty(profile.gmQaAssetManifests).qa_assets_v1),
    },
    petSamples: {
      currentPets: pets.length,
      partyPets: pets.length - storagePets,
      storagePets,
      ready: pets.length + QA_PET_SAMPLE_COUNT <= QA_PET_TOTAL_CAPACITY - QA_PET_RESERVED_CAPTURE_SLOTS,
    },
    assets: {
      backpackEmptySlots: emptyBackpackSlots,
      bankSchemaVersion: Math.max(0, Math.trunc(Number(bank.schemaVersion || 0))),
      bankUsedSlots,
      worstCaseBankFreeSlots: Math.max(0, QA_ASSET_BANK_CAPACITY - bankUsedSlots - QA_ASSET_WORST_CASE_BANK_SLOTS),
      ready: emptyBackpackSlots >= 1
        && QA_ASSET_BANK_CAPACITY - bankUsedSlots - QA_ASSET_WORST_CASE_BANK_SLOTS >= 1,
    },
  };
}

function normalizedOperation(value) {
  const operation = String(value || "status").trim().toLowerCase();
  if (!["init", "renew", "revoke"].includes(operation)) {
    throw opsError("local_qa_operation_invalid", "本地QA写操作必须是 init、renew 或 revoke。");
  }
  return operation;
}

function numericMode(value) {
  return Number.isInteger(value) && value >= 0 ? value & 0o777 : null;
}

function octalMode(value) {
  return value === null ? "" : value.toString(8).padStart(3, "0");
}

function sameStringSet(leftValue, rightValue) {
  const left = Array.isArray(leftValue) ? leftValue.map((value) => String(value || "")).sort() : [];
  const right = Array.isArray(rightValue) ? rightValue.map((value) => String(value || "")).sort() : [];
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function opsError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

module.exports = {
  PRIVATE_FILE_MODE,
  applyLocalQaGmAccountChange,
  atomicWritePrivateBytes,
  atomicWritePrivateJson,
  buildLocalQaGmAccountChange,
  inspectLocalQaGmAccountState,
  privateCredentialDocument,
  randomLocalQaPassword,
  readJsonIfExists,
  readPrivateFileSnapshot,
  restorePrivateFileSnapshot,
  rollbackLocalQaGmAccountChange,
  verifyLocalQaGmAccountChange,
};
