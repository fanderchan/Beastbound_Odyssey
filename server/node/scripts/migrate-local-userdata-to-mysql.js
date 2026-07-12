"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {createMysqlAuthStore} = require("../src/mysql-store");
const {migrateProfile} = require("../src/auth/profile-migrations");
const {snapshotExternalEquipmentConflicts} = require("../src/auth/equipment-profile-migration");
const {
  backfillConsumedEquipmentEnvelopeLedger,
} = require("../src/auth/equipment-envelope-consumed-ledger");

const repoRoot = path.resolve(__dirname, "../../..");
loadEnvFile(path.resolve(repoRoot, "server/node/.local/mysql.env"));

function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === true;
  const username = normalizeUsername(args.username || process.env.BEASTBOUND_MIGRATE_USERNAME || "auth1373");
  const password = args.passwordStdin === true ? readPasswordFromStdin() : "";
  if (!username) {
    throw new Error("Missing --username.");
  }
  const userdataRoot = args.userdataRoot || process.env.BEASTBOUND_GODOT_USERDATA || path.join(
    process.env.HOME || "",
    "Library/Application Support/Godot/app_userdata/Beastbound Odyssey - 万兽纪元"
  );
  const localAccounts = readJsonIfExists(path.join(userdataRoot, "accounts.json"));
  const localAccount = objectOrEmpty(objectOrEmpty(localAccounts.accounts)[username]);
  const requestedRole = String(args.role || process.env.BEASTBOUND_MIGRATE_ROLE || "");
  const profilePath = args.profilePath || bestProfilePath(userdataRoot, username);
  const profile = readJsonFile(profilePath);
  requireSafeProfileMigration(profile);
  const nowIso = new Date().toISOString();
  const store = createMysqlAuthStore({readOnly: !apply, ensureSchema: apply});
  const sourceData = cloneJson(store.load());
  const migration = buildLocalUserdataMigration({
    sourceData,
    username,
    password,
    requestedRole,
    profile,
    profilePath,
    localAccount,
    nowIso,
  });

  if (!apply) {
    console.log(JSON.stringify({
      ...migration.report,
      ok: true,
      mode: "dry-run",
      applied: false,
      message: "仅生成迁移预演；未写 MySQL。使用 --apply 才会先备份再写入。",
    }, null, 2));
    return;
  }

  const backupPath = writeBackupSnapshot(sourceData, args.backupPath, nowIso);
  const verification = applyLocalUserdataMigration(store, sourceData, migration, backupPath);

  console.log(JSON.stringify({
    ...migration.report,
    ok: true,
    mode: "apply",
    applied: true,
    backupPath,
    verification,
  }, null, 2));
}

function buildLocalUserdataMigration(options = {}) {
  const originalSourceData = ensureServerDocumentCollections(cloneJson(options.sourceData || {}));
  const sourceLedger = backfillConsumedEquipmentEnvelopeLedger(
    originalSourceData,
    originalSourceData.consumedEquipmentEnvelopes,
  );
  if (!sourceLedger.ok) {
    const error = new Error(sourceLedger.message || "Existing consumed equipment envelope ledger backfill is unsafe.");
    error.code = sourceLedger.code || "equipment_consumed_ledger_backfill_unsafe";
    error.externalEquipmentConflicts = [cloneJson(sourceLedger)];
    throw error;
  }
  const sourceData = cloneJson(originalSourceData);
  sourceData.consumedEquipmentEnvelopes = sourceLedger.ledger;
  const data = ensureServerDocumentCollections(cloneJson(sourceData));
  const username = normalizeUsername(options.username);
  const password = String(options.password || "");
  const sourceProfile = cloneJson(options.profile || {});
  const externalEquipmentConflicts = snapshotExternalEquipmentConflicts(sourceData);
  if (externalEquipmentConflicts.length > 0) {
    const error = new Error("Persistent snapshot contains equipment outside player profiles; instance envelopes are required first.");
    error.code = "snapshot_external_equipment_unsafe";
    error.externalEquipmentConflicts = cloneJson(externalEquipmentConflicts);
    throw error;
  }
  const profileMigration = requireSafeProfileMigration(sourceProfile);
  const profile = profileMigration.profile;
  const profilePath = String(options.profilePath || "");
  const localAccount = objectOrEmpty(options.localAccount);
  const nowIso = String(options.nowIso || new Date().toISOString());
  const randomUuid = typeof options.randomUuid === "function" ? options.randomUuid : () => crypto.randomUUID();
  const randomBytes = typeof options.randomBytes === "function" ? options.randomBytes : (size) => crypto.randomBytes(size);
  if (!username) {
    throw new Error("Missing username for local userdata migration.");
  }

  const account = objectOrEmpty(data.accounts[username]);
  const accountId = String(account.accountId || `acc_${randomUuid()}`);
  const existingBinding = objectOrEmpty(data.profileBindings[accountId]);
  const playerId = String(existingBinding.playerId || `player_${accountId.slice(4, 16)}`);
  validateTargetIdentityGraph(data, {username, accountId, playerId});
  const role = resolveMigrationRole({
    requestedRole: options.requestedRole,
    existingRole: account.role,
    localRole: localAccount.role,
    username,
  });
  const hasExistingCredential = String(account.passwordSalt || "") !== "" && String(account.passwordHash || "") !== "";
  if (!password && !hasExistingCredential) {
    throw new Error("A password is required when importing a new account.");
  }
  const salt = password ? randomBytes(16).toString("hex") : String(account.passwordSalt || "");
  const passwordHash = password
    ? crypto.scryptSync(password, salt, 32).toString("hex")
    : String(account.passwordHash || "");
  const displayName = String(localAccount.displayName || profile.playerName || objectOrEmpty(profile.player).name || username);

  data.accounts[username] = {
    ...account,
    accountId,
    username,
    displayName,
    role,
    passwordSalt: salt,
    passwordHash,
    passwordPolicyVersion: Math.max(2, Math.trunc(Number(account.passwordPolicyVersion || 2))),
    passwordUpdatedAt: password ? nowIso : String(account.passwordUpdatedAt || nowIso),
    createdAt: isoFromLocalCreatedAt(localAccount.createdAt) || account.createdAt || nowIso,
    updatedAt: nowIso,
    schemaVersion: 1,
  };

  for (const [sessionId, session] of Object.entries(data.sessions)) {
    if (session && session.accountId === accountId) {
      delete data.sessions[sessionId];
    }
  }

  const nextRevision = Math.max(Number(existingBinding.profileRevision || 0), Number(objectOrEmpty(data.profiles[playerId]).profileRevision || 0)) + 1;
  data.profileBindings[accountId] = {
    accountId,
    playerId,
    profileRevision: nextRevision,
    createdAt: existingBinding.createdAt || nowIso,
    updatedAt: nowIso,
    schemaVersion: 1,
  };
  data.profiles[playerId] = {
    playerId,
    accountId,
    profileRevision: nextRevision,
    profile,
    updatedAt: nowIso,
    schemaVersion: 1,
  };
  const consumedLedger = backfillConsumedEquipmentEnvelopeLedger(
    data,
    data.consumedEquipmentEnvelopes,
  );
  if (!consumedLedger.ok) {
    const error = new Error(consumedLedger.message || "Consumed equipment envelope ledger backfill is unsafe.");
    error.code = consumedLedger.code || "equipment_consumed_ledger_backfill_unsafe";
    error.externalEquipmentConflicts = [cloneJson(consumedLedger)];
    throw error;
  }
  data.consumedEquipmentEnvelopes = consumedLedger.ledger;
  const candidateEquipmentConflicts = snapshotExternalEquipmentConflicts(data);
  if (candidateEquipmentConflicts.length > 0) {
    const error = new Error("Migration candidate contains conflicting equipment envelope custody.");
    error.code = "snapshot_external_equipment_unsafe";
    error.externalEquipmentConflicts = cloneJson(candidateEquipmentConflicts);
    throw error;
  }
  // Profile migration never creates, widens, deletes, or renews GM authority.
  // Local QA access is a separate short-lived lease managed by `npm run qa:gm`.
  const eventId = `auth_${randomUuid()}`;
  data.authEvents.push({
    eventId,
    type: "local_userdata_migration",
    username,
    ok: true,
    message: profilePath,
    createdAt: nowIso,
    schemaVersion: 1,
  });

  const consumedEnvelopeIdsAdded = Array.from(new Set([
    ...sourceLedger.addedIds,
    ...consumedLedger.addedIds,
  ])).sort();
  const verificationContext = {
    username,
    accountId,
    playerId,
    eventId,
    consumedEnvelopeIdsAdded,
  };
  const integrityBefore = migrationUnrelatedDigest(originalSourceData, verificationContext);
  const integrityAfter = migrationUnrelatedDigest(data, verificationContext);
  if (integrityBefore !== integrityAfter) {
    throw new Error("Local userdata migration changed unrelated persistent state.");
  }
  return {
    data,
    report: {
      username,
      accountId,
      playerId,
      profileRevision: nextRevision,
      role,
      effectiveRole: role === "gm" ? "server_grant_required" : "player",
      gmAuthorizationChanged: false,
      profilePath,
      playerLevel: Number(objectOrEmpty(profile.player).level || 1),
      rebirthCount: Number(profile.rebirthCount || 0),
      petInstances: Array.isArray(profile.petInstances) ? profile.petInstances.length : 0,
      activePetInstanceId: String(profile.activePetInstanceId || ""),
      stoneCoins: Number(profile.stoneCoins || profile.coins || 0),
      passwordChanged: Boolean(password),
      beforeCounts: persistentBucketCounts(originalSourceData),
      afterCounts: persistentBucketCounts(data),
      targetAssetsBefore: profileAssetSummary(objectOrEmpty(objectOrEmpty(originalSourceData.profiles)[playerId]).profile),
      targetAssetsAfter: profileAssetSummary(profile),
      profileMigration: publicProfileMigrationReport(profileMigration),
      consumedEnvelopeBackfillCount: consumedEnvelopeIdsAdded.length,
      unrelatedDigest: integrityBefore,
      unrelatedStatePreserved: true,
    },
    targetProfileDigest: stableDigest(profile),
    verificationContext,
  };
}

function requireSafeProfileMigration(profile) {
  const migration = migrateProfile(cloneJson(profile || {}));
  if (!migration.ok) {
    const codes = migration.errors.map((error) => error.code).join(", ");
    const error = new Error(`Local profile schema migration is not safe: ${codes}`);
    error.code = "local_profile_migration_unsafe";
    error.profileMigration = publicProfileMigrationReport(migration);
    throw error;
  }
  return migration;
}

function publicProfileMigrationReport(migration) {
  const beforeAssets = objectOrEmpty(migration && migration.beforeAssets);
  const afterAssets = objectOrEmpty(migration && migration.afterAssets);
  return {
    applySafe: Boolean(migration && migration.ok),
    fromVersion: migration && migration.fromVersion,
    toVersion: migration && migration.toVersion,
    changed: Boolean(migration && migration.changed),
    wouldChange: Boolean(migration && migration.wouldChange),
    assetsUnchanged: Boolean(migration && migration.assetsUnchanged),
    contentUnchanged: Boolean(migration && migration.contentUnchanged),
    planDigest: String(migration && migration.planDigest || ""),
    beforeLogicalDigest: String(beforeAssets.digest || ""),
    afterLogicalDigest: String(afterAssets.digest || ""),
    beforeRepresentationDigest: String(beforeAssets.representationDigest || ""),
    afterRepresentationDigest: String(afterAssets.representationDigest || ""),
    steps: Array.isArray(migration && migration.steps)
      ? migration.steps.map((step) => String(step && step.id || "")).filter(Boolean)
      : [],
    stepReports: Array.isArray(migration && migration.steps)
      ? migration.steps.map((step) => ({
        id: String(step && step.id || ""),
        fromVersion: step && step.fromVersion,
        toVersion: step && step.toVersion,
        ok: step && step.ok !== false,
        assetsUnchanged: step && step.assetsUnchanged,
        contentUnchanged: step && step.contentUnchanged,
        equipment: step && step.equipment ? cloneJson(step.equipment) : undefined,
      }))
      : [],
    errors: Array.isArray(migration && migration.errors)
      ? migration.errors.map((error) => cloneJson(error))
      : [],
  };
}

function applyLocalUserdataMigration(store, sourceDataValue, migration, backupPath = "") {
  const sourceData = ensureServerDocumentCollections(cloneJson(sourceDataValue || {}));
  try {
    store.save(migration.data);
    const verification = verifyAppliedMigration(store.load(), migration);
    if (!verification.ok) {
      throw new Error(`Migration verification failed: ${verification.reasons.join(", ")}`);
    }
    return verification;
  } catch (error) {
    const rollback = rollbackTargetScope(store, sourceData, migration.verificationContext);
    const details = rollback.error ? `; rollbackError=${rollback.error}` : "";
    error.message = `${error.message}; targetRollback=${rollback.ok ? "ok" : "failed"}${details}; backup=${backupPath}`;
    throw error;
  }
}

function rollbackTargetScope(store, sourceData, context) {
  try {
    const currentData = ensureServerDocumentCollections(cloneJson(store.load()));
    const rollbackData = restoreTargetScope(currentData, sourceData, context);
    store.save(rollbackData);
    const restored = ensureServerDocumentCollections(cloneJson(store.load()));
    const ok = targetScopeDigest(restored, context) === targetScopeDigest(sourceData, context);
    return {ok, error: ok ? "" : "target_scope_verification_failed"};
  } catch (error) {
    return {ok: false, error: String(error && error.message || error)};
  }
}

function restoreTargetScope(currentValue, beforeValue, context) {
  const current = ensureServerDocumentCollections(cloneJson(currentValue || {}));
  const before = ensureServerDocumentCollections(cloneJson(beforeValue || {}));
  restoreObjectEntry(current.accounts, before.accounts, context.username);
  restoreObjectEntry(current.profileBindings, before.profileBindings, context.accountId);
  restoreObjectEntry(current.profiles, before.profiles, context.playerId);
  restoreObjectEntry(current.gmUserGrants, before.gmUserGrants, context.accountId);
  restoreObjectEntry(current.gmCommandGrants, before.gmCommandGrants, context.accountId);
  for (const [sessionId, session] of Object.entries(current.sessions)) {
    if (String(session && session.accountId || "") === context.accountId) {
      delete current.sessions[sessionId];
    }
  }
  for (const [sessionId, session] of Object.entries(before.sessions)) {
    if (String(session && session.accountId || "") === context.accountId) {
      current.sessions[sessionId] = cloneJson(session);
    }
  }
  current.authEvents = current.authEvents.filter((event) => String(event && event.eventId || "") !== context.eventId);
  return current;
}

function restoreObjectEntry(target, source, key) {
  if (Object.prototype.hasOwnProperty.call(source, key)) {
    target[key] = cloneJson(source[key]);
  } else {
    delete target[key];
  }
}

function targetScopeDigest(value, context) {
  const data = ensureServerDocumentCollections(cloneJson(value || {}));
  const sessions = Object.fromEntries(Object.entries(data.sessions)
    .filter(([, session]) => String(session && session.accountId || "") === context.accountId));
  return stableDigest({
    account: Object.prototype.hasOwnProperty.call(data.accounts, context.username) ? data.accounts[context.username] : null,
    binding: Object.prototype.hasOwnProperty.call(data.profileBindings, context.accountId) ? data.profileBindings[context.accountId] : null,
    profile: Object.prototype.hasOwnProperty.call(data.profiles, context.playerId) ? data.profiles[context.playerId] : null,
    gmUserGrant: Object.prototype.hasOwnProperty.call(data.gmUserGrants, context.accountId) ? data.gmUserGrants[context.accountId] : null,
    gmCommandGrants: Object.prototype.hasOwnProperty.call(data.gmCommandGrants, context.accountId) ? data.gmCommandGrants[context.accountId] : null,
    sessions,
    migrationEvent: data.authEvents.find((event) => String(event && event.eventId || "") === context.eventId) || null,
  });
}

function validateTargetIdentityGraph(data, context) {
  const conflicts = [];
  const hasTargetAccount = Object.prototype.hasOwnProperty.call(data.accounts, context.username);
  const targetAccount = objectOrEmpty(data.accounts[context.username]);
  if (hasTargetAccount && String(targetAccount.accountId || "") === "") {
    conflicts.push("target_account_id_missing");
  }
  if (targetAccount.username && normalizeUsername(targetAccount.username) !== context.username) {
    conflicts.push("target_account_username_mismatch");
  }
  for (const [username, account] of Object.entries(data.accounts)) {
    if (normalizeUsername(username) !== context.username) {
      if (String(account && account.accountId || "") === context.accountId) {
        conflicts.push("account_id_reused_by_username");
      }
      if (normalizeUsername(account && account.username) === context.username) {
        conflicts.push("username_reused_by_account_entry");
      }
    }
  }
  const hasTargetBinding = Object.prototype.hasOwnProperty.call(data.profileBindings, context.accountId);
  const targetBinding = objectOrEmpty(data.profileBindings[context.accountId]);
  if (hasTargetBinding && String(targetBinding.playerId || "") === "") {
    conflicts.push("target_binding_player_missing");
  }
  if (targetBinding.accountId && String(targetBinding.accountId) !== context.accountId) {
    conflicts.push("target_binding_account_mismatch");
  }
  if (targetBinding.playerId && String(targetBinding.playerId) !== context.playerId) {
    conflicts.push("target_binding_player_mismatch");
  }
  for (const [accountId, binding] of Object.entries(data.profileBindings)) {
    if (String(accountId) !== context.accountId) {
      if (String(binding && binding.playerId || "") === context.playerId) {
        conflicts.push("player_id_reused_by_binding");
      }
      if (String(binding && binding.accountId || "") === context.accountId) {
        conflicts.push("account_id_reused_by_binding_entry");
      }
    }
  }
  const hasTargetDocument = Object.prototype.hasOwnProperty.call(data.profiles, context.playerId);
  const targetDocument = objectOrEmpty(data.profiles[context.playerId]);
  if (hasTargetDocument && (!targetDocument.profile || typeof targetDocument.profile !== "object" || Array.isArray(targetDocument.profile))) {
    conflicts.push("target_profile_payload_invalid");
  }
  if (targetDocument.playerId && String(targetDocument.playerId) !== context.playerId) {
    conflicts.push("target_profile_player_mismatch");
  }
  if (targetDocument.accountId && String(targetDocument.accountId) !== context.accountId) {
    conflicts.push("target_profile_account_mismatch");
  }
  for (const [playerId, document] of Object.entries(data.profiles)) {
    if (String(playerId) !== context.playerId) {
      if (String(document && document.accountId || "") === context.accountId) {
        conflicts.push("account_id_reused_by_profile");
      }
      if (String(document && document.playerId || "") === context.playerId) {
        conflicts.push("player_id_reused_by_profile_entry");
      }
    }
  }
  const hasTargetGmGrant = Object.prototype.hasOwnProperty.call(data.gmUserGrants, context.accountId);
  const rawTargetGmGrant = data.gmUserGrants[context.accountId];
  if (hasTargetGmGrant && (!rawTargetGmGrant || typeof rawTargetGmGrant !== "object" || Array.isArray(rawTargetGmGrant))) {
    conflicts.push("target_gm_grant_invalid");
  }
  const targetGmGrant = objectOrEmpty(rawTargetGmGrant);
  if (targetGmGrant.username && normalizeUsername(targetGmGrant.username) !== context.username) {
    conflicts.push("target_gm_grant_username_mismatch");
  }
  if (Object.prototype.hasOwnProperty.call(data.gmCommandGrants, context.accountId)) {
    const commandGrants = data.gmCommandGrants[context.accountId];
    if (!Array.isArray(commandGrants)) {
      conflicts.push("target_gm_command_grants_invalid");
    } else if (commandGrants.some((grant) => String(grant && grant.accountId || "") !== context.accountId)) {
      conflicts.push("target_gm_command_grant_account_mismatch");
    }
  }
  if (conflicts.length > 0) {
    throw new Error(`Target identity graph is inconsistent: ${Array.from(new Set(conflicts)).join(", ")}`);
  }
}

function resolveMigrationRole(options = {}) {
  const requested = String(options.requestedRole || "").trim();
  if (requested !== "") {
    const role = normalizedRole(requested);
    if (role === "gm") {
      throw new Error("Local userdata migration cannot grant GM; migrate as player, then use npm run qa:gm.");
    }
    return role;
  }
  const existing = String(options.existingRole || "").trim();
  if (existing !== "") {
    return normalizedRole(existing);
  }
  return "player";
}

function bestProfilePath(userdataRoot, username) {
  const accountCandidates = [
    path.join(userdataRoot, "server_accounts", username, "player_profile.json"),
    path.join(userdataRoot, "accounts", username, "player_profile.json"),
  ];
  const accountExisting = accountCandidates.filter((candidate) => fs.existsSync(candidate));
  if (accountExisting.length > 0) {
    accountExisting.sort((a, b) => profileScore(b) - profileScore(a));
    return accountExisting[0];
  }
  const existing = [path.join(userdataRoot, "player_profile.json")].filter((candidate) => fs.existsSync(candidate));
  if (existing.length === 0) {
    throw new Error(`No local profile found for ${username}.`);
  }
  return existing[0];
}

function profileScore(filePath) {
  const profile = readJsonIfExists(filePath);
  const player = objectOrEmpty(profile.player);
  const pets = Array.isArray(profile.petInstances) ? profile.petInstances.length : 0;
  return Number(profile.rebirthCount || 0) * 100000 + Number(player.level || 0) * 1000 + pets * 10 + Number(profile.coins || 0) / 1000000;
}

const OBJECT_BUCKETS = Object.freeze([
  "accounts",
  "sessions",
  "profileBindings",
  "profiles",
  "mailMessages",
  "marketListings",
  "consumedEquipmentEnvelopes",
  "marketConfig",
  "offlineHangConfig",
  "tradeOffers",
  "parties",
  "partyInvites",
  "families",
  "manors",
  "playerPositions",
  "battleInvites",
  "battleRooms",
  "gmUserGrants",
  "gmCommandGrants",
]);
const ARRAY_BUCKETS = Object.freeze([
  "manorWars",
  "manorBattles",
  "chatMessages",
  "battleRecords",
  "battleTrace",
  "gmCommandAudit",
  "authEvents",
  "serviceEvents",
]);

function ensureServerDocumentCollections(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Server document root must be an object.");
  }
  const data = value;
  if (!Object.prototype.hasOwnProperty.call(data, "schemaVersion")) {
    data.schemaVersion = 1;
  } else if (!Number.isInteger(data.schemaVersion) || data.schemaVersion < 1) {
    throw new Error("Server document schemaVersion must be a positive integer.");
  }
  for (const key of OBJECT_BUCKETS) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      data[key] = {};
    } else if (!data[key] || typeof data[key] !== "object" || Array.isArray(data[key])) {
      throw new Error(`Server document bucket ${key} must be an object.`);
    }
  }
  for (const key of ARRAY_BUCKETS) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      data[key] = [];
    } else if (!Array.isArray(data[key])) {
      throw new Error(`Server document bucket ${key} must be an array.`);
    }
  }
  if (!Object.prototype.hasOwnProperty.call(data, "serviceEventSeq")) {
    data.serviceEventSeq = 0;
  } else if (!Number.isInteger(data.serviceEventSeq) || data.serviceEventSeq < 0) {
    throw new Error("Server document serviceEventSeq must be a non-negative integer.");
  }
  return data;
}

function migrationUnrelatedDigest(value, context) {
  const data = ensureServerDocumentCollections(cloneJson(value || {}));
  const username = String(context.username || "");
  const accountId = String(context.accountId || "");
  const playerId = String(context.playerId || "");
  const eventId = String(context.eventId || "");
  delete data.accounts[username];
  delete data.profileBindings[accountId];
  delete data.profiles[playerId];
  delete data.gmUserGrants[accountId];
  delete data.gmCommandGrants[accountId];
  for (const [sessionId, session] of Object.entries(data.sessions)) {
    if (String(session && session.accountId || "") === accountId) {
      delete data.sessions[sessionId];
    }
  }
  data.authEvents = data.authEvents.filter((event) => String(event && event.eventId || "") !== eventId);
  for (const envelopeId of Array.isArray(context.consumedEnvelopeIdsAdded)
    ? context.consumedEnvelopeIdsAdded
    : []) {
    delete data.consumedEquipmentEnvelopes[envelopeId];
  }
  return stableDigest(data);
}

function verifyAppliedMigration(value, migration) {
  const data = ensureServerDocumentCollections(cloneJson(value || {}));
  const context = migration.verificationContext;
  const reasons = [];
  if (migrationUnrelatedDigest(data, context) !== migration.report.unrelatedDigest) {
    reasons.push("unrelated_state_changed");
  }
  if (stableDigest(appliedTargetFacts(data, context)) !== stableDigest(appliedTargetFacts(migration.data, context))) {
    reasons.push("target_scope_mismatch");
  }
  const account = objectOrEmpty(data.accounts[context.username]);
  if (String(account.accountId || "") !== context.accountId || String(account.role || "") !== migration.report.role) {
    reasons.push("target_account_mismatch");
  }
  const binding = objectOrEmpty(data.profileBindings[context.accountId]);
  if (String(binding.playerId || "") !== context.playerId || Number(binding.profileRevision || 0) !== migration.report.profileRevision) {
    reasons.push("target_binding_mismatch");
  }
  const profile = objectOrEmpty(objectOrEmpty(data.profiles[context.playerId]).profile);
  if (stableDigest(profile) !== migration.targetProfileDigest) {
    reasons.push("target_profile_mismatch");
  }
  if (!data.authEvents.some((event) => String(event && event.eventId || "") === context.eventId)) {
    reasons.push("migration_audit_missing");
  }
  return {
    ok: reasons.length === 0,
    reasons,
    counts: persistentBucketCounts(data),
    targetAssets: profileAssetSummary(profile),
  };
}

function appliedTargetFacts(value, context) {
  const data = ensureServerDocumentCollections(cloneJson(value || {}));
  const document = objectOrEmpty(data.profiles[context.playerId]);
  const sessions = Object.fromEntries(Object.entries(data.sessions)
    .filter(([, session]) => String(session && session.accountId || "") === context.accountId));
  return {
    account: Object.prototype.hasOwnProperty.call(data.accounts, context.username) ? data.accounts[context.username] : null,
    binding: Object.prototype.hasOwnProperty.call(data.profileBindings, context.accountId) ? data.profileBindings[context.accountId] : null,
    profileDocument: Object.keys(document).length > 0 ? {
      playerId: String(document.playerId || ""),
      accountId: String(document.accountId || ""),
      profileRevision: Number(document.profileRevision || 0),
      updatedAt: String(document.updatedAt || ""),
      profile: document.profile,
    } : null,
    gmUserGrant: Object.prototype.hasOwnProperty.call(data.gmUserGrants, context.accountId) ? data.gmUserGrants[context.accountId] : null,
    gmCommandGrants: Object.prototype.hasOwnProperty.call(data.gmCommandGrants, context.accountId) ? data.gmCommandGrants[context.accountId] : null,
    sessions,
    migrationEvent: data.authEvents.find((event) => String(event && event.eventId || "") === context.eventId) || null,
    consumedEquipmentEnvelopes: Object.fromEntries(
      (Array.isArray(context.consumedEnvelopeIdsAdded) ? context.consumedEnvelopeIdsAdded : [])
        .filter((envelopeId) => Object.hasOwn(data.consumedEquipmentEnvelopes, envelopeId))
        .sort()
        .map((envelopeId) => [envelopeId, data.consumedEquipmentEnvelopes[envelopeId]]),
    ),
  };
}

function writeBackupSnapshot(value, requestedPath, nowIso) {
  const stamp = String(nowIso || new Date().toISOString()).replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const nonce = crypto.randomBytes(4).toString("hex");
  const backupPath = requestedPath
    ? path.resolve(String(requestedPath))
    : path.resolve(repoRoot, "server/node/.local/backups", `userdata-migration-${stamp}-${nonce}.json`);
  fs.mkdirSync(path.dirname(backupPath), {recursive: true});
  fs.writeFileSync(backupPath, `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", mode: 0o600, flag: "wx"});
  fs.chmodSync(backupPath, 0o600);
  return backupPath;
}

function persistentBucketCounts(value) {
  const data = ensureServerDocumentCollections(cloneJson(value || {}));
  const counts = {};
  for (const key of OBJECT_BUCKETS) {
    counts[key] = Object.keys(data[key]).length;
  }
  for (const key of ARRAY_BUCKETS) {
    counts[key] = data[key].length;
  }
  return counts;
}

function profileAssetSummary(value) {
  const profile = objectOrEmpty(value);
  const bank = objectOrEmpty(profile.bank);
  const backpackSlots = Array.isArray(profile.backpackSlots) ? profile.backpackSlots : [];
  const bankSlots = Array.isArray(bank.slots) ? bank.slots : [];
  return {
    stoneCoins: Math.max(0, Math.trunc(Number(profile.stoneCoins || profile.coins || 0))),
    diamonds: Math.max(0, Math.trunc(Number(profile.diamonds || 0))),
    bankStoneCoins: Math.max(0, Math.trunc(Number(bank.stoneCoins || 0))),
    backpackStacks: backpackSlots.filter((slot) => String(slot && slot.itemId || "") !== "").length,
    backpackItems: slotItemCount(backpackSlots),
    bankStacks: bankSlots.filter((slot) => String(slot && slot.itemId || "") !== "").length,
    bankItems: slotItemCount(bankSlots),
    pets: Array.isArray(profile.petInstances) ? profile.petInstances.length : 0,
    equipmentInstances: Object.keys(objectOrEmpty(profile.equipmentInstances)).length,
    equippedSlots: Object.values(objectOrEmpty(profile.equipmentSlots)).filter((itemId) => String(itemId || "") !== "").length,
  };
}

function slotItemCount(slots) {
  return slots.reduce((sum, slot) => sum + Math.max(0, Math.trunc(Number(slot && slot.count || 0))), 0);
}

function stableDigest(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--username") {
      result.username = argv[++index] || "";
    } else if (arg === "--password") {
      throw new Error("Do not place passwords in process arguments; use --password-stdin.");
    } else if (arg === "--password-stdin") {
      result.passwordStdin = true;
    } else if (arg === "--role") {
      result.role = argv[++index] || "";
    } else if (arg === "--profile-path") {
      result.profilePath = argv[++index] || "";
    } else if (arg === "--userdata-root") {
      result.userdataRoot = argv[++index] || "";
    } else if (arg === "--backup-path") {
      result.backupPath = argv[++index] || "";
    } else if (arg === "--apply") {
      result.apply = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return result;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) {
      continue;
    }
    process.env[match[1]] = unquoteShellValue(match[2].trim());
  }
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readPasswordFromStdin() {
  const input = fs.readFileSync(0, "utf8");
  const lines = input.split(/\r?\n/);
  const password = String(lines.shift() || "");
  if (lines.some((line) => line !== "")) {
    throw new Error("Password stdin must contain exactly one line.");
  }
  if (password.length < 8) {
    throw new Error("A password of at least 8 characters is required for a new account.");
  }
  return password;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    return readJsonFile(filePath);
  } catch {
    return {};
  }
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function normalizedRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (value !== "gm" && value !== "player") {
    throw new Error(`Migration role must be gm or player, received: ${value || "<empty>"}`);
  }
  return value;
}

function isoFromLocalCreatedAt(value) {
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }
  return new Date(seconds * 1000).toISOString();
}

function unquoteShellValue(value) {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/'\\''/g, "'");
  }
  if (value.startsWith("\"") && value.endsWith("\"")) {
    return value.slice(1, -1).replace(/\\"/g, "\"");
  }
  return value;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    if (error && (error.profileMigration || error.externalEquipmentConflicts)) {
      console.log(JSON.stringify({
        ok: false,
        mode: process.argv.includes("--apply") ? "apply" : "dry-run",
        applied: false,
        code: String(error.code || "local_profile_migration_unsafe"),
        message: String(error.message || "Local profile migration is not safe."),
        profileMigration: error.profileMigration,
        externalEquipmentConflicts: error.externalEquipmentConflicts,
      }, null, 2));
    } else {
      console.error(error && error.stack ? error.stack : String(error));
    }
    process.exitCode = 1;
  }
}

module.exports = {
  ARRAY_BUCKETS,
  OBJECT_BUCKETS,
  applyLocalUserdataMigration,
  buildLocalUserdataMigration,
  ensureServerDocumentCollections,
  migrationUnrelatedDigest,
  parseArgs,
  persistentBucketCounts,
  profileAssetSummary,
  publicProfileMigrationReport,
  requireSafeProfileMigration,
  resolveMigrationRole,
  restoreTargetScope,
  stableDigest,
  targetScopeDigest,
  validateTargetIdentityGraph,
  verifyAppliedMigration,
  writeBackupSnapshot,
};
