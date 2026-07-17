"use strict";

const {mysqlAuthStoreRootContract} = require("../mysql-store");
const {
  migrateProfilesSnapshot,
  stableDigest,
} = require("./profile-migrations");
const {
  readConsumedEquipmentEnvelopeLedger,
} = require("./equipment-envelope-consumed-ledger");

const PERSISTENT_OBJECT_FIELDS = new Set([
  "accounts",
  "consumedEquipmentEnvelopes",
  "families",
  "gmCommandGrants",
  "gmUserGrants",
  "mailMessages",
  "manors",
  "marketConfig",
  "marketListings",
  "mutationReceipts",
  "offlineHangConfig",
  "petPaidResetConfig",
  "parties",
  "partyInvites",
  "profileBindings",
  "profiles",
  "sessions",
]);
const PERSISTENT_ARRAY_FIELDS = new Set([
  "authEvents",
  "battleRecords",
  "battleTrace",
  "chatMessages",
  "gmCommandAudit",
  "manorBattles",
  "manorWars",
  "serviceEvents",
]);
const PERSISTENT_SCALAR_FIELDS = new Set([
  "schemaVersion",
  "serviceEventSeq",
]);
const OBJECT_ENTITY_ID_FIELDS = Object.freeze({
  sessions: "sessionId",
  mailMessages: "mailId",
  marketListings: "listingId",
  mutationReceipts: "operationId",
  parties: "partyId",
  partyInvites: "inviteId",
  families: "familyId",
  manors: "manorId",
  gmUserGrants: "accountId",
});
const ARRAY_ENTITY_ID_FIELDS = Object.freeze({
  manorWars: "warId",
  manorBattles: "battleId",
  chatMessages: "messageId",
  battleRecords: "recordId",
  battleTrace: "traceId",
  gmCommandAudit: "auditId",
  authEvents: "eventId",
  serviceEvents: "eventSeq",
});
const RESERVED_ENTITY_IDS = new Set(["__proto__", "constructor", "prototype"]);

function isRecord(value) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.prototype.toString.call(value) === "[object Object]"
  );
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function clone(value) {
  return structuredClone(value);
}

function sortedUniqueStrings(value) {
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean))).sort();
}

function errorEntry(code, path, message) {
  return {
    code: String(code || "batch_migration_invalid"),
    path: String(path || ""),
    message: String(message || "batch profile migration is not safe"),
  };
}

function safeErrors(errorsValue) {
  return (Array.isArray(errorsValue) ? errorsValue : []).map((error) => ({
    code: String(error && error.code || "batch_migration_invalid"),
    path: String(error && error.path || ""),
    ...(String(error && error.playerId || "") === ""
      ? {}
      : {playerId: String(error.playerId)}),
  }));
}

function fieldType(field) {
  if (PERSISTENT_OBJECT_FIELDS.has(field)) {
    return "object";
  }
  if (PERSISTENT_ARRAY_FIELDS.has(field)) {
    return "array";
  }
  if (PERSISTENT_SCALAR_FIELDS.has(field)) {
    return "scalar";
  }
  return "";
}

function validateRootFieldType(root, field, expectedType, errors) {
  const value = root[field];
  if (expectedType === "object" && !isRecord(value)) {
    errors.push(errorEntry(
      "batch_root_field_type_invalid",
      field,
      `${field} must be an object`,
    ));
    return false;
  }
  if (expectedType === "array" && !Array.isArray(value)) {
    errors.push(errorEntry(
      "batch_root_field_type_invalid",
      field,
      `${field} must be an array`,
    ));
    return false;
  }
  if (field === "schemaVersion" && value !== 1) {
    errors.push(errorEntry(
      "batch_root_schema_unsupported",
      field,
      "server snapshot schemaVersion must be 1",
    ));
    return false;
  }
  if (field === "serviceEventSeq" && (!Number.isSafeInteger(value) || value < 0)) {
    errors.push(errorEntry(
      "batch_root_field_type_invalid",
      field,
      "serviceEventSeq must be a non-negative safe integer",
    ));
    return false;
  }
  return true;
}

function auditIdentityGraph(root, contract, errors) {
  if (!isRecord(root.accounts) || !isRecord(root.profileBindings) || !isRecord(root.profiles)) {
    return;
  }
  const accountIdToUsername = new Map();
  for (const username of Object.keys(root.accounts).sort()) {
    const account = root.accounts[username];
    const path = `accounts.${username}`;
    if (!isRecord(account)) {
      errors.push(errorEntry("batch_account_document_invalid", path, "account document must be an object"));
      continue;
    }
    const declaredUsername = String(account.username || "");
    const accountId = canonicalEntityId(account.accountId);
    if (declaredUsername !== username) {
      errors.push(errorEntry("batch_account_map_key_mismatch", path, "account map key must match document username"));
    }
    if (RESERVED_ENTITY_IDS.has(username)) {
      errors.push(errorEntry("batch_account_username_invalid", path, "account username cannot use a reserved object key"));
    }
    if (accountId === "") {
      errors.push(errorEntry("batch_account_id_missing", path, "accountId is required"));
      continue;
    }
    if (accountIdToUsername.has(accountId)) {
      errors.push(errorEntry("batch_account_id_duplicate", path, "accountId is used by more than one account"));
      continue;
    }
    accountIdToUsername.set(accountId, username);
  }

  const bindingByPlayerId = new Map();
  for (const accountIdKey of Object.keys(root.profileBindings).sort()) {
    const binding = root.profileBindings[accountIdKey];
    const path = `profileBindings.${accountIdKey}`;
    if (!isRecord(binding)) {
      errors.push(errorEntry("batch_profile_binding_invalid", path, "profile binding must be an object"));
      continue;
    }
    const accountId = canonicalEntityId(binding.accountId);
    const playerId = canonicalEntityId(binding.playerId);
    if (accountId !== accountIdKey) {
      errors.push(errorEntry("batch_profile_binding_map_key_mismatch", path, "binding map key must match accountId"));
    }
    if (accountId === "" || !accountIdToUsername.has(accountId)) {
      errors.push(errorEntry("batch_profile_binding_account_missing", path, "binding account does not exist"));
    }
    if (playerId === "") {
      errors.push(errorEntry("batch_profile_binding_player_missing", path, "binding playerId is required"));
    } else if (bindingByPlayerId.has(playerId)) {
      errors.push(errorEntry("batch_profile_binding_player_duplicate", path, "playerId is bound more than once"));
    } else {
      bindingByPlayerId.set(playerId, binding);
    }
    if (!Number.isSafeInteger(binding.profileRevision) || binding.profileRevision < 0) {
      errors.push(errorEntry("batch_profile_binding_revision_invalid", path, "binding revision must be non-negative"));
    }
  }

  const allowedDocumentFields = new Set(contract.profileDocumentFields);
  const requiredDocumentFields = contract.profileDocumentFields;
  const profileAccountIds = new Set();
  for (const playerIdKey of Object.keys(root.profiles).sort()) {
    const document = root.profiles[playerIdKey];
    const path = `profiles.${playerIdKey}`;
    if (!isRecord(document)) {
      errors.push(errorEntry("batch_profile_document_invalid", path, "profile document must be an object"));
      continue;
    }
    for (const field of Object.keys(document).sort()) {
      if (!allowedDocumentFields.has(field)) {
        errors.push(errorEntry(
          "batch_profile_document_field_unknown",
          `${path}.${field}`,
          "profile document contains a field that MySQL cannot round-trip",
        ));
      }
    }
    for (const field of requiredDocumentFields) {
      if (!hasOwn(document, field)) {
        errors.push(errorEntry(
          "batch_profile_document_field_missing",
          `${path}.${field}`,
          "profile document is missing a MySQL field",
        ));
      }
    }
    const playerId = canonicalEntityId(document.playerId);
    const accountId = canonicalEntityId(document.accountId);
    if (playerId !== playerIdKey) {
      errors.push(errorEntry("batch_profile_map_key_mismatch", path, "profile map key must match playerId"));
    }
    if (accountId === "" || !accountIdToUsername.has(accountId)) {
      errors.push(errorEntry("batch_profile_account_missing", path, "profile account does not exist"));
    }
    if (profileAccountIds.has(accountId)) {
      errors.push(errorEntry("batch_profile_account_duplicate", path, "account owns more than one profile"));
    } else if (accountId !== "") {
      profileAccountIds.add(accountId);
    }
    if (!Number.isSafeInteger(document.profileRevision) || document.profileRevision < 0) {
      errors.push(errorEntry("batch_profile_revision_invalid", path, "profile revision must be non-negative"));
    }
    if (typeof document.updatedAt !== "string") {
      errors.push(errorEntry("batch_profile_updated_at_invalid", path, "profile updatedAt must be a string"));
    }
    if (!isRecord(document.profile)) {
      errors.push(errorEntry("batch_profile_payload_invalid", `${path}.profile`, "profile payload must be an object"));
    }
    const binding = bindingByPlayerId.get(playerIdKey);
    if (!binding) {
      errors.push(errorEntry("batch_profile_binding_missing", path, "profile has no binding"));
      continue;
    }
    if (String(binding.accountId || "") !== accountId) {
      errors.push(errorEntry("batch_profile_owner_mismatch", path, "profile and binding account owners differ"));
    }
    if (binding.profileRevision !== document.profileRevision) {
      errors.push(errorEntry("batch_profile_revision_mismatch", path, "profile and binding revisions differ"));
    }
  }

  for (const [playerId, binding] of bindingByPlayerId.entries()) {
    if (!hasOwn(root.profiles, playerId)) {
      errors.push(errorEntry(
        "batch_profile_document_missing",
        `profileBindings.${String(binding.accountId || "")}`,
        "binding points to a missing profile document",
      ));
    }
  }
}

function canonicalEntityId(value, numeric = false) {
  if (numeric) {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : "";
  }
  if (
    typeof value !== "string"
    || value === ""
    || value !== value.trim()
    || RESERVED_ENTITY_IDS.has(value)
  ) {
    return "";
  }
  return value;
}

function auditPersistentEntityIdentities(root, errors) {
  const knownAccountIds = new Set(Object.values(isRecord(root.accounts) ? root.accounts : {})
    .map((account) => String(account && account.accountId || "").trim())
    .filter(Boolean));
  for (const [bucket, idField] of Object.entries(OBJECT_ENTITY_ID_FIELDS)) {
    if (!isRecord(root[bucket])) {
      continue;
    }
    const seenIds = new Set();
    for (const mapKey of Object.keys(root[bucket]).sort()) {
      const document = root[bucket][mapKey];
      const path = `${bucket}.${mapKey}`;
      if (!isRecord(document)) {
        errors.push(errorEntry("batch_entity_document_invalid", path, "persistent entity must be an object"));
        continue;
      }
      const entityId = canonicalEntityId(document[idField]);
      if (entityId === "") {
        errors.push(errorEntry("batch_entity_id_invalid", `${path}.${idField}`, "persistent entity id is invalid"));
        continue;
      }
      if (entityId !== mapKey) {
        errors.push(errorEntry("batch_entity_map_key_mismatch", path, "entity map key must match its internal id"));
      }
      if (seenIds.has(entityId)) {
        errors.push(errorEntry("batch_entity_id_duplicate", path, "persistent entity id is duplicated"));
      }
      seenIds.add(entityId);
      if (bucket === "mutationReceipts") {
        auditMutationReceipt(document, path, knownAccountIds, errors);
      }
    }
  }

  for (const [bucket, idField] of Object.entries(ARRAY_ENTITY_ID_FIELDS)) {
    if (!Array.isArray(root[bucket])) {
      continue;
    }
    const numeric = idField === "eventSeq";
    const seenIds = new Set();
    for (const [index, document] of root[bucket].entries()) {
      const path = `${bucket}[${index}]`;
      if (!isRecord(document)) {
        errors.push(errorEntry("batch_entity_document_invalid", path, "persistent entity must be an object"));
        continue;
      }
      const entityId = canonicalEntityId(document[idField], numeric);
      if (entityId === "") {
        errors.push(errorEntry("batch_entity_id_invalid", `${path}.${idField}`, "persistent entity id is invalid"));
        continue;
      }
      if (seenIds.has(entityId)) {
        errors.push(errorEntry("batch_entity_id_duplicate", `${path}.${idField}`, "persistent entity id is duplicated"));
      }
      seenIds.add(entityId);
    }
  }

  if (Array.isArray(root.serviceEvents) && Number.isSafeInteger(root.serviceEventSeq)) {
    const maxEventSeq = root.serviceEvents.reduce((maximum, event) => (
      Number.isSafeInteger(event && event.eventSeq) ? Math.max(maximum, event.eventSeq) : maximum
    ), 0);
    if (root.serviceEventSeq < maxEventSeq) {
      errors.push(errorEntry(
        "batch_service_event_seq_behind",
        "serviceEventSeq",
        "serviceEventSeq cannot be lower than a persisted event sequence",
      ));
    }
  }

  if (isRecord(root.gmCommandGrants)) {
    const seenCompoundIds = new Set();
    for (const accountId of Object.keys(root.gmCommandGrants).sort()) {
      const grants = root.gmCommandGrants[accountId];
      const path = `gmCommandGrants.${accountId}`;
      if (canonicalEntityId(accountId) === "" || !knownAccountIds.has(accountId)) {
        errors.push(errorEntry(
          "batch_gm_command_grant_owner_invalid",
          path,
          "GM command grant owner must be an existing account",
        ));
      }
      if (!Array.isArray(grants)) {
        errors.push(errorEntry("batch_gm_command_grants_invalid", path, "GM command grants must be an array"));
        continue;
      }
      if (grants.length === 0) {
        errors.push(errorEntry(
          "batch_gm_command_grants_empty",
          path,
          "empty GM command grant owners cannot round-trip through MySQL",
        ));
        continue;
      }
      for (const [index, grant] of grants.entries()) {
        const grantPath = `${path}[${index}]`;
        if (!isRecord(grant)) {
          errors.push(errorEntry("batch_entity_document_invalid", grantPath, "GM command grant must be an object"));
          continue;
        }
        const internalAccountId = canonicalEntityId(grant.accountId);
        const commandId = canonicalEntityId(grant.commandId);
        if (
          internalAccountId === ""
          || internalAccountId !== accountId
          || !knownAccountIds.has(internalAccountId)
          || commandId === ""
        ) {
          errors.push(errorEntry(
            "batch_gm_command_grant_identity_invalid",
            grantPath,
            "GM command grant identity does not match its owner",
          ));
          continue;
        }
        const compoundId = `${accountId}/${commandId}`;
        if (seenCompoundIds.has(compoundId)) {
          errors.push(errorEntry("batch_entity_id_duplicate", grantPath, "GM command grant is duplicated"));
        }
        seenCompoundIds.add(compoundId);
      }
    }
  }
}

function auditMutationReceipt(receipt, path, knownAccountIds, errors) {
  const committedAtMs = Date.parse(String(receipt.committedAt || ""));
  const expiresAtMs = Date.parse(String(receipt.expiresAt || ""));
  const accountId = String(receipt.accountId || "");
  if (
    receipt.schemaVersion !== 1
    || !/^[A-Za-z0-9._:-]{16,160}$/.test(String(receipt.operationId || ""))
    || !/^[a-f0-9]{64}$/.test(String(receipt.requestHash || ""))
    || String(receipt.actionId || "").trim() === ""
    || String(receipt.actionId || "").length > 160
    || !Number.isFinite(committedAtMs)
    || !Number.isFinite(expiresAtMs)
    || expiresAtMs <= committedAtMs
    || !isRecord(receipt.response)
    || (accountId !== "" && !knownAccountIds.has(accountId))
  ) {
    errors.push(errorEntry(
      "batch_mutation_receipt_invalid",
      path,
      "durable mutation receipt is malformed or references an unknown account",
    ));
  }
}

function auditBatchMigrationRootCoverage(snapshotValue) {
  const contract = mysqlAuthStoreRootContract();
  const errors = [];
  const root = snapshotValue;
  if (!isRecord(root)) {
    errors.push(errorEntry("batch_root_invalid", "", "server snapshot root must be an object"));
    return {
      ok: false,
      applySafe: false,
      errors,
      rootFieldCount: 0,
      persistentFieldCount: contract.persistentFields.length,
      runtimeFieldCount: contract.runtimeOnlyFields.length,
      rootDigest: stableDigest(root),
      persistentProjectionDigest: stableDigest(root),
    };
  }

  const snapshotFieldSet = new Set(contract.snapshotFields);
  for (const field of Object.keys(root).sort()) {
    if (!snapshotFieldSet.has(field)) {
      errors.push(errorEntry(
        "batch_root_field_unknown",
        field,
        "root field is not covered by the MySQL persistence contract",
      ));
    }
  }

  for (const field of contract.persistentFields) {
    const expectedType = fieldType(field);
    if (expectedType === "") {
      errors.push(errorEntry(
        "batch_root_contract_field_unclassified",
        field,
        "persistent root contract field has no batch-migration type classification",
      ));
      continue;
    }
    if (!hasOwn(root, field)) {
      errors.push(errorEntry(
        field === "profiles" ? "batch_profiles_missing" : "batch_root_field_missing",
        field,
        "required persistent root field is missing",
      ));
      continue;
    }
    validateRootFieldType(root, field, expectedType, errors);
  }

  for (const field of contract.runtimeOnlyFields) {
    if (!hasOwn(root, field)) {
      continue;
    }
    if (!isRecord(root[field])) {
      errors.push(errorEntry("batch_runtime_field_type_invalid", field, "runtime root field must be an object"));
    } else if (Object.keys(root[field]).length > 0) {
      errors.push(errorEntry(
        "batch_runtime_field_not_empty",
        field,
        "runtime-only state must be empty before a batch migration",
      ));
    }
  }

  if (Array.isArray(root.serviceEvents)) {
    for (const [index, event] of root.serviceEvents.entries()) {
      if (String(event && event.type || "").startsWith("battle.")) {
        errors.push(errorEntry(
          "batch_runtime_service_event_persisted",
          `serviceEvents[${index}]`,
          "battle runtime events must not enter a persistent migration snapshot",
        ));
      }
    }
  }

  if (isRecord(root.consumedEquipmentEnvelopes)) {
    const ledger = readConsumedEquipmentEnvelopeLedger(root.consumedEquipmentEnvelopes);
    if (!ledger.ok) {
      errors.push(errorEntry(
        ledger.code,
        ledger.path || "consumedEquipmentEnvelopes",
        ledger.message,
      ));
    }
  }

  auditIdentityGraph(root, contract, errors);
  auditPersistentEntityIdentities(root, errors);
  const persistentProjection = persistentSnapshotProjection(root, contract);
  return {
    ok: errors.length === 0,
    applySafe: errors.length === 0,
    errors,
    rootFieldCount: Object.keys(root).length,
    persistentFieldCount: contract.persistentFields.length,
    runtimeFieldCount: contract.runtimeOnlyFields.length,
    profileCount: isRecord(root.profiles) ? Object.keys(root.profiles).length : 0,
    rootDigest: stableDigest(root),
    persistentProjectionDigest: stableDigest(persistentProjection),
  };
}

function persistentSnapshotProjection(snapshotValue, contractValue = null) {
  const contract = contractValue || mysqlAuthStoreRootContract();
  const snapshot = isRecord(snapshotValue) ? snapshotValue : {};
  const result = {};
  for (const field of contract.persistentFields) {
    if (hasOwn(snapshot, field)) {
      result[field] = clone(snapshot[field]);
    }
  }
  return result;
}

function projectionWithoutChangedProfiles(snapshotValue, changedProfileIds, options = {}) {
  const projection = persistentSnapshotProjection(snapshotValue);
  if (isRecord(projection.profiles)) {
    for (const playerId of changedProfileIds) {
      delete projection.profiles[playerId];
    }
  }
  if (options.excludeLedger === true) {
    delete projection.consumedEquipmentEnvelopes;
  }
  return projection;
}

function appendOnlyLedgerDifference(sourceValue, candidateValue) {
  const sourceRead = readConsumedEquipmentEnvelopeLedger(sourceValue);
  const candidateRead = readConsumedEquipmentEnvelopeLedger(candidateValue);
  const errors = [];
  if (!sourceRead.ok) {
    errors.push(errorEntry(sourceRead.code, sourceRead.path, sourceRead.message));
  }
  if (!candidateRead.ok) {
    errors.push(errorEntry(candidateRead.code, candidateRead.path, candidateRead.message));
  }
  if (errors.length > 0) {
    return {ok: false, errors, addedIds: []};
  }
  for (const envelopeId of Object.keys(sourceRead.ledger).sort()) {
    if (!hasOwn(candidateRead.ledger, envelopeId)) {
      errors.push(errorEntry(
        "batch_consumed_ledger_entry_deleted",
        `consumedEquipmentEnvelopes.${envelopeId}`,
        "consumed equipment envelope records are append-only",
      ));
    } else if (stableDigest(candidateRead.ledger[envelopeId]) !== stableDigest(sourceRead.ledger[envelopeId])) {
      errors.push(errorEntry(
        "batch_consumed_ledger_entry_mutated",
        `consumedEquipmentEnvelopes.${envelopeId}`,
        "consumed equipment envelope records are immutable",
      ));
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    addedIds: Object.keys(candidateRead.ledger)
      .filter((envelopeId) => !hasOwn(sourceRead.ledger, envelopeId))
      .sort(),
  };
}

function allowedBatchMutationAudit(source, candidate) {
  const errors = [];
  const sourceRoot = clone(source);
  const candidateRoot = clone(candidate);
  const sourceProfiles = isRecord(sourceRoot.profiles) ? sourceRoot.profiles : {};
  const candidateProfiles = isRecord(candidateRoot.profiles) ? candidateRoot.profiles : {};
  if (stableDigest(Object.keys(sourceProfiles).sort()) !== stableDigest(Object.keys(candidateProfiles).sort())) {
    errors.push(errorEntry("batch_profile_keys_changed", "profiles", "batch migration changed profile keys"));
  }
  for (const playerId of Object.keys(sourceProfiles).sort()) {
    if (!hasOwn(candidateProfiles, playerId)) {
      continue;
    }
    const sourceDocument = clone(sourceProfiles[playerId]);
    const candidateDocument = clone(candidateProfiles[playerId]);
    delete sourceDocument.profile;
    delete candidateDocument.profile;
    if (stableDigest(sourceDocument) !== stableDigest(candidateDocument)) {
      errors.push(errorEntry(
        "batch_profile_document_metadata_changed",
        `profiles.${playerId}`,
        "batch migration changed profile document metadata",
      ));
    }
  }
  delete sourceRoot.profiles;
  delete candidateRoot.profiles;
  const sourceLedger = sourceRoot.consumedEquipmentEnvelopes;
  const candidateLedger = candidateRoot.consumedEquipmentEnvelopes;
  delete sourceRoot.consumedEquipmentEnvelopes;
  delete candidateRoot.consumedEquipmentEnvelopes;
  if (stableDigest(sourceRoot) !== stableDigest(candidateRoot)) {
    errors.push(errorEntry(
      "batch_non_profile_root_changed",
      "",
      "batch migration changed a root field outside profiles and consumedEquipmentEnvelopes",
    ));
  }
  const ledgerDifference = appendOnlyLedgerDifference(sourceLedger, candidateLedger);
  errors.push(...ledgerDifference.errors);
  return {
    ok: errors.length === 0,
    errors,
    addedLedgerIds: ledgerDifference.addedIds,
  };
}

function batchPlanDigestFacts(plan) {
  return {
    sourceDigest: plan.sourceDigest,
    candidateDigest: plan.candidateDigest,
    changedProfileIds: sortedUniqueStrings(plan.changedProfileIds),
    addedConsumedEquipmentEnvelopeIds: sortedUniqueStrings(plan.addedConsumedEquipmentEnvelopeIds),
    applySafe: plan.applySafe === true,
    errorFacts: safeErrors(plan.errors),
    rootContract: mysqlAuthStoreRootContract(),
  };
}

function buildBatchProfileMigration(snapshotValue) {
  const sourceSnapshot = clone(snapshotValue);
  const sourceDigest = stableDigest(sourceSnapshot);
  const rootCoverage = auditBatchMigrationRootCoverage(sourceSnapshot);
  let migration = null;
  let candidateSnapshot = clone(sourceSnapshot);
  let changedProfileIds = [];
  let addedConsumedEquipmentEnvelopeIds = [];
  const errors = [...rootCoverage.errors];

  if (rootCoverage.ok) {
    migration = migrateProfilesSnapshot(sourceSnapshot);
    if (!migration.ok) {
      errors.push(...migration.errors.map((error) => errorEntry(
        error.code,
        error.path || (error.playerId ? `profiles.${error.playerId}` : "profiles"),
        error.message,
      )));
    } else {
      candidateSnapshot = clone(migration.snapshot);
      const candidateCoverage = auditBatchMigrationRootCoverage(candidateSnapshot);
      errors.push(...candidateCoverage.errors);
      const mutationAudit = allowedBatchMutationAudit(sourceSnapshot, candidateSnapshot);
      errors.push(...mutationAudit.errors);
      addedConsumedEquipmentEnvelopeIds = mutationAudit.addedLedgerIds;
      changedProfileIds = Object.keys(sourceSnapshot.profiles).filter((playerId) => (
        stableDigest(sourceSnapshot.profiles[playerId].profile)
        !== stableDigest(candidateSnapshot.profiles[playerId].profile)
      )).sort();
    }
  }

  const applySafe = errors.length === 0 && Boolean(migration && migration.ok);
  if (!applySafe) {
    candidateSnapshot = clone(sourceSnapshot);
    changedProfileIds = [];
    addedConsumedEquipmentEnvelopeIds = [];
  }
  const candidateDigest = stableDigest(candidateSnapshot);
  const plan = {
    ok: applySafe,
    applySafe,
    changed: applySafe && candidateDigest !== sourceDigest,
    sourceSnapshot,
    candidateSnapshot,
    sourceDigest,
    candidateDigest,
    planDigest: "",
    changedProfileIds,
    addedConsumedEquipmentEnvelopeIds,
    errors,
    rootCoverage,
    migrationReport: migration ? {
      ok: migration.ok,
      counts: clone(migration.counts),
      currentProfileSchemaVersion: migration.currentProfileSchemaVersion,
      consumedEnvelopeBackfillCount: migration.consumedEnvelopeBackfillCount,
    } : null,
  };
  plan.planDigest = stableDigest(batchPlanDigestFacts(plan));
  plan.publicReport = {
    ok: applySafe,
    applySafe,
    changed: plan.changed,
    sourceDigest,
    candidateDigest,
    planDigest: plan.planDigest,
    profileCount: rootCoverage.profileCount || 0,
    changedProfileCount: changedProfileIds.length,
    addedConsumedEquipmentEnvelopeCount: addedConsumedEquipmentEnvelopeIds.length,
    changedProfileIds: clone(changedProfileIds),
    errors: safeErrors(errors),
  };
  return plan;
}

function validatePlanIntegrity(plan, errors) {
  if (!plan || plan.applySafe !== true || !isRecord(plan.sourceSnapshot) || !isRecord(plan.candidateSnapshot)) {
    errors.push(errorEntry("batch_plan_not_applicable", "", "batch migration plan is not applicable"));
    return false;
  }
  if (stableDigest(plan.sourceSnapshot) !== plan.sourceDigest) {
    errors.push(errorEntry("batch_plan_source_digest_mismatch", "", "batch plan source snapshot was modified"));
  }
  if (stableDigest(plan.candidateSnapshot) !== plan.candidateDigest) {
    errors.push(errorEntry("batch_plan_candidate_digest_mismatch", "", "batch plan candidate snapshot was modified"));
  }
  if (stableDigest(batchPlanDigestFacts(plan)) !== plan.planDigest) {
    errors.push(errorEntry("batch_plan_digest_mismatch", "", "batch plan facts were modified"));
  }
  return errors.length === 0;
}

function verifyBatchProfileMigration(snapshotValue, plan) {
  const currentSnapshot = clone(snapshotValue);
  const errors = [];
  validatePlanIntegrity(plan, errors);
  const rootCoverage = auditBatchMigrationRootCoverage(currentSnapshot);
  errors.push(...rootCoverage.errors);
  if (errors.length === 0) {
    for (const playerId of plan.changedProfileIds) {
      if (
        !hasOwn(currentSnapshot.profiles, playerId)
        || stableDigest(currentSnapshot.profiles[playerId]) !== stableDigest(plan.candidateSnapshot.profiles[playerId])
      ) {
        errors.push(errorEntry(
          "batch_apply_target_profile_mismatch",
          `profiles.${playerId}`,
          "applied profile does not match the migration candidate",
        ));
      }
    }
    const expectedNonTarget = projectionWithoutChangedProfiles(
      plan.candidateSnapshot,
      plan.changedProfileIds,
    );
    const currentNonTarget = projectionWithoutChangedProfiles(
      currentSnapshot,
      plan.changedProfileIds,
    );
    if (stableDigest(expectedNonTarget) !== stableDigest(currentNonTarget)) {
      errors.push(errorEntry(
        "batch_apply_non_target_projection_mismatch",
        "",
        "non-target persistent state changed during batch apply",
      ));
    }
  }
  return {
    ok: errors.length === 0,
    verified: errors.length === 0,
    errors,
    currentDigest: stableDigest(currentSnapshot),
    expectedCandidateDigest: plan && plan.candidateDigest || "",
    targetProfileCount: plan && Array.isArray(plan.changedProfileIds) ? plan.changedProfileIds.length : 0,
    publicReport: {
      ok: errors.length === 0,
      errors: safeErrors(errors),
    },
  };
}

function ledgerContainsBaseline(currentValue, baselineValue) {
  const currentRead = readConsumedEquipmentEnvelopeLedger(currentValue);
  const baselineRead = readConsumedEquipmentEnvelopeLedger(baselineValue);
  const errors = [];
  if (!currentRead.ok) {
    errors.push(errorEntry(currentRead.code, currentRead.path, currentRead.message));
  }
  if (!baselineRead.ok) {
    errors.push(errorEntry(baselineRead.code, baselineRead.path, baselineRead.message));
  }
  if (errors.length > 0) {
    return {ok: false, errors};
  }
  for (const envelopeId of Object.keys(baselineRead.ledger)) {
    if (
      !hasOwn(currentRead.ledger, envelopeId)
      || stableDigest(currentRead.ledger[envelopeId]) !== stableDigest(baselineRead.ledger[envelopeId])
    ) {
      errors.push(errorEntry(
        "batch_rollback_ledger_not_monotonic",
        `consumedEquipmentEnvelopes.${envelopeId}`,
        "rollback must not delete or mutate consumed envelope tombstones",
      ));
    }
  }
  return {ok: errors.length === 0, errors};
}

function buildBatchProfileRollback(snapshotValue, plan) {
  const rollbackBaselineSnapshot = clone(snapshotValue);
  const rollbackSnapshot = clone(rollbackBaselineSnapshot);
  const errors = [];
  validatePlanIntegrity(plan, errors);
  const rootCoverage = auditBatchMigrationRootCoverage(rollbackBaselineSnapshot);
  errors.push(...rootCoverage.errors);
  const restoredProfileIds = [];
  const alreadyRestoredProfileIds = [];
  const retainedConsumedEquipmentEnvelopeIds = [];
  const addedConsumedEquipmentEnvelopeIds = [];
  if (errors.length === 0) {
    const sourceLedger = plan.sourceSnapshot.consumedEquipmentEnvelopes;
    const ledgerAudit = ledgerContainsBaseline(
      rollbackBaselineSnapshot.consumedEquipmentEnvelopes,
      sourceLedger,
    );
    errors.push(...ledgerAudit.errors);
  }
  if (errors.length === 0) {
    const candidateLedger = readConsumedEquipmentEnvelopeLedger(
      plan.candidateSnapshot.consumedEquipmentEnvelopes,
    );
    if (!candidateLedger.ok) {
      errors.push(errorEntry(candidateLedger.code, candidateLedger.path, candidateLedger.message));
    } else {
      for (const envelopeId of Object.keys(candidateLedger.ledger).sort()) {
        if (hasOwn(rollbackSnapshot.consumedEquipmentEnvelopes, envelopeId)) {
          if (
            stableDigest(rollbackSnapshot.consumedEquipmentEnvelopes[envelopeId])
            !== stableDigest(candidateLedger.ledger[envelopeId])
          ) {
            errors.push(errorEntry(
              "batch_rollback_ledger_record_conflict",
              `consumedEquipmentEnvelopes.${envelopeId}`,
              "current tombstone conflicts with the migration candidate",
            ));
          } else {
            retainedConsumedEquipmentEnvelopeIds.push(envelopeId);
          }
        } else {
          rollbackSnapshot.consumedEquipmentEnvelopes[envelopeId] = clone(candidateLedger.ledger[envelopeId]);
          addedConsumedEquipmentEnvelopeIds.push(envelopeId);
        }
      }
    }
  }
  if (errors.length === 0) {
    for (const playerId of plan.changedProfileIds) {
      const currentDocument = rollbackBaselineSnapshot.profiles[playerId];
      const sourceDocument = plan.sourceSnapshot.profiles[playerId];
      const candidateDocument = plan.candidateSnapshot.profiles[playerId];
      const currentDigest = stableDigest(currentDocument);
      if (currentDigest === stableDigest(candidateDocument)) {
        rollbackSnapshot.profiles[playerId] = clone(sourceDocument);
        restoredProfileIds.push(playerId);
      } else if (currentDigest === stableDigest(sourceDocument)) {
        alreadyRestoredProfileIds.push(playerId);
      } else {
        errors.push(errorEntry(
          "batch_rollback_profile_conflict",
          `profiles.${playerId}`,
          "profile matches neither the migration source nor candidate",
        ));
      }
    }
  }
  const applySafe = errors.length === 0;
  const resultSnapshot = applySafe ? rollbackSnapshot : clone(rollbackBaselineSnapshot);
  const rollback = {
    ok: applySafe,
    applySafe,
    sourcePlanDigest: plan && plan.planDigest || "",
    sourcePlan: plan,
    rollbackBaselineSnapshot,
    snapshot: resultSnapshot,
    rollbackBaselineDigest: stableDigest(rollbackBaselineSnapshot),
    rollbackCandidateDigest: stableDigest(resultSnapshot),
    changedProfileIds: plan && Array.isArray(plan.changedProfileIds) ? clone(plan.changedProfileIds) : [],
    restoredProfileIds,
    alreadyRestoredProfileIds,
    retainedConsumedEquipmentEnvelopeIds,
    addedConsumedEquipmentEnvelopeIds,
    errors,
  };
  rollback.publicReport = {
    ok: applySafe,
    sourcePlanDigest: rollback.sourcePlanDigest,
    rollbackBaselineDigest: rollback.rollbackBaselineDigest,
    rollbackCandidateDigest: rollback.rollbackCandidateDigest,
    restoredProfileCount: restoredProfileIds.length,
    alreadyRestoredProfileCount: alreadyRestoredProfileIds.length,
    retainedConsumedEquipmentEnvelopeCount: retainedConsumedEquipmentEnvelopeIds.length,
    addedConsumedEquipmentEnvelopeCount: addedConsumedEquipmentEnvelopeIds.length,
    errors: safeErrors(errors),
  };
  return rollback;
}

function verifyBatchProfileRollback(snapshotValue, rollback) {
  const currentSnapshot = clone(snapshotValue);
  const errors = [];
  if (
    !rollback
    || rollback.applySafe !== true
    || !rollback.sourcePlan
    || !isRecord(rollback.rollbackBaselineSnapshot)
  ) {
    errors.push(errorEntry("batch_rollback_not_applicable", "", "rollback plan is not applicable"));
  } else {
    validatePlanIntegrity(rollback.sourcePlan, errors);
    if (stableDigest(rollback.rollbackBaselineSnapshot) !== rollback.rollbackBaselineDigest) {
      errors.push(errorEntry(
        "batch_rollback_baseline_digest_mismatch",
        "",
        "rollback baseline snapshot was modified",
      ));
    }
  }
  const rootCoverage = auditBatchMigrationRootCoverage(currentSnapshot);
  errors.push(...rootCoverage.errors);
  if (errors.length === 0) {
    const plan = rollback.sourcePlan;
    for (const playerId of plan.changedProfileIds) {
      if (
        !hasOwn(currentSnapshot.profiles, playerId)
        || stableDigest(currentSnapshot.profiles[playerId]) !== stableDigest(plan.sourceSnapshot.profiles[playerId])
      ) {
        errors.push(errorEntry(
          "batch_rollback_target_profile_mismatch",
          `profiles.${playerId}`,
          "rolled-back profile does not match the before image",
        ));
      }
    }
    const baselineNonTarget = projectionWithoutChangedProfiles(
      rollback.rollbackBaselineSnapshot,
      plan.changedProfileIds,
      {excludeLedger: true},
    );
    const currentNonTarget = projectionWithoutChangedProfiles(
      currentSnapshot,
      plan.changedProfileIds,
      {excludeLedger: true},
    );
    if (stableDigest(baselineNonTarget) !== stableDigest(currentNonTarget)) {
      errors.push(errorEntry(
        "batch_rollback_non_target_projection_mismatch",
        "",
        "rollback changed non-target persistent state",
      ));
    }
    const ledgerAudit = ledgerContainsBaseline(
      currentSnapshot.consumedEquipmentEnvelopes,
      rollback.rollbackBaselineSnapshot.consumedEquipmentEnvelopes,
    );
    errors.push(...ledgerAudit.errors);
    const candidateLedgerAudit = ledgerContainsBaseline(
      currentSnapshot.consumedEquipmentEnvelopes,
      plan.candidateSnapshot.consumedEquipmentEnvelopes,
    );
    errors.push(...candidateLedgerAudit.errors);
  }
  return {
    ok: errors.length === 0,
    verified: errors.length === 0,
    errors,
    currentDigest: stableDigest(currentSnapshot),
    publicReport: {
      ok: errors.length === 0,
      errors: safeErrors(errors),
    },
  };
}

function rehearseBatchProfileMigration(snapshotValue) {
  const plan = buildBatchProfileMigration(snapshotValue);
  if (!plan.applySafe) {
    return {
      ok: false,
      plan,
      applyVerification: null,
      rollback: null,
      rollbackVerification: null,
      publicReport: {
        ok: false,
        plan: clone(plan.publicReport),
      },
    };
  }
  const appliedSnapshot = clone(plan.candidateSnapshot);
  const applyVerification = verifyBatchProfileMigration(appliedSnapshot, plan);
  const rollback = applyVerification.ok
    ? buildBatchProfileRollback(appliedSnapshot, plan)
    : null;
  const rollbackVerification = rollback && rollback.ok
    ? verifyBatchProfileRollback(rollback.snapshot, rollback)
    : null;
  const ok = Boolean(
    applyVerification.ok
    && rollback
    && rollback.ok
    && rollbackVerification
    && rollbackVerification.ok
  );
  return {
    ok,
    plan,
    applyVerification,
    rollback,
    rollbackVerification,
    publicReport: {
      ok,
      plan: clone(plan.publicReport),
      applyVerified: applyVerification.ok,
      rollbackBuilt: Boolean(rollback && rollback.ok),
      rollbackVerified: Boolean(rollbackVerification && rollbackVerification.ok),
    },
  };
}

module.exports = {
  auditBatchMigrationRootCoverage,
  buildBatchProfileMigration,
  buildBatchProfileRollback,
  rehearseBatchProfileMigration,
  verifyBatchProfileMigration,
  verifyBatchProfileRollback,
};
