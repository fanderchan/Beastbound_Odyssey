"use strict";

const {isDeepStrictEqual} = require("node:util");

const {
  MAIL_ACTIVE_COUNTER_INCREMENT_SQL,
  MAIL_ACTIVE_COUNTER_SEED_SQL,
  MAIL_IDENTITY_INSERT_SQL,
  MAIL_IDENTITY_LOCK_SQL,
  MAIL_IDENTITY_UPDATE_SQL,
  MAIL_STORAGE_CONTROL_LOCK_SQL,
  mysqlResourceWriteAffectedRowsAccepted,
} = require("./mysql-resource-acquisition-order");
const {
  MAIL_STORAGE_FORWARD_MAINTENANCE_PLAN_KIND,
  MAIL_STORAGE_FORWARD_MAINTENANCE_PLAN_SCHEMA_VERSION,
  projectActiveMailIdentityRow,
} = require("./mysql-mail-storage-forward-maintenance");

const MAIL_STORAGE_FORWARD_WRITES_INVALID = "mysql_mail_storage_forward_writes_invalid";
const MAIL_STORAGE_BARE_DELETE_FORBIDDEN = "mysql_mail_storage_bare_delete_forbidden";
const MAIL_STORAGE_SCOPE_KEY = "mail_lifecycle";
const MAIL_STORAGE_SCHEMA_GENERATION = 1;
const MAIL_STORAGE_DATA_GENERATION = 1;
const MAIL_STORAGE_ID_PATTERN = /^[a-z0-9_:-]+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const LEGACY_MAIL_INSERT_SQL = `INSERT INTO mail_messages
  (mail_id, sender_account_id, recipient_account_id, title, created_at, read_at, document_json)
  VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))`;
const LEGACY_MAIL_UPDATE_SQL = `UPDATE mail_messages
  SET sender_account_id = ?, recipient_account_id = ?, title = ?, created_at = ?,
    read_at = ?, document_json = CAST(? AS JSON)
  WHERE mail_id = ? AND sender_account_id = ? AND recipient_account_id = ?
    AND title = ? AND created_at = ? AND read_at <=> ?
    AND document_json = CAST(? AS JSON)`;

// The mysql CLI cannot inspect mysql2 affectedRows. Immediately after each
// exact UPDATE, this statement attempts to duplicate the guaranteed auth
// revision row when ROW_COUNT() is not one. The duplicate-key error aborts the
// transaction instead of allowing a stale sidecar or mail CAS to commit.
const CLI_EXACT_UPDATE_ASSERTION_SQL = `INSERT INTO auth_store_revisions (scope_key, revision)
  SELECT scope_key, revision
  FROM auth_store_revisions
  WHERE scope_key = 'auth' AND ROW_COUNT() <> 1`;

function buildMailStorageForwardWriteSet(options = {}) {
  const storage = validateStorageState(options.storageState);
  const controlLocks = [mailStorageControlLock(storage)];

  if (storage.dataGeneration === 0) {
    validateForwardPlan(options.forwardPlan, storage);
    const legacyStatements = [
      renderParameterizedSql(controlLocks[0].sql, controlLocks[0].params),
      cliControlFenceAssertion(storage),
    ];
    return deepFreeze({
      controlLocks,
      identityLocks: [],
      updateChanges: [],
      sidecarWrites: [],
      mailWrites: [],
      legacyStatements,
      legacyWriteStatements: [],
    });
  }

  const changes = validateGenerationOneChanges(options.changes);
  const plan = validateForwardPlan(options.forwardPlan, storage);
  const facts = validatePlanFacts(plan, changes);
  const identityLocks = facts.identityUpdates.map(mailIdentityLock);
  const identityWrites = [
    ...facts.identityInserts.map(mailIdentityInsert),
    ...facts.identityUpdates.map(mailIdentityUpdate),
  ].sort((left, right) => compareText(left.key, right.key));
  const sidecarWrites = [
    ...facts.counterIncrements.flatMap((increment) => [
      mailActiveCounterSeed(increment),
      mailActiveCounterIncrement(increment),
    ]),
    ...identityWrites,
  ];
  const mailWrites = changes.map((change) => (
    change.disposition === "insert"
      ? legacyMailInsert(change.after)
      : legacyMailUpdate(change.after, change.before)
  ));
  const updateChanges = changes
    .filter((change) => change.disposition === "update")
    .map((change) => structuredClone({
      mailId: change.mailId,
      disposition: change.disposition,
      before: change.before,
      after: change.after,
    }));

  const legacyStatements = [
    renderParameterizedSql(controlLocks[0].sql, controlLocks[0].params),
    cliControlFenceAssertion(storage),
  ];
  const legacyWriteStatements = [];
  const counterWrites = sidecarWrites.filter((write) => write.resource === "mail_active_counter");
  for (const write of counterWrites) {
    appendLegacyWrite(legacyStatements, legacyWriteStatements, write);
  }
  legacyStatements.push(
    ...identityLocks.map((lock) => renderParameterizedSql(lock.sql, lock.params)),
  );
  for (const write of [...identityWrites, ...mailWrites]) {
    appendLegacyWrite(legacyStatements, legacyWriteStatements, write);
  }

  return deepFreeze({
    controlLocks,
    identityLocks,
    updateChanges,
    sidecarWrites,
    mailWrites,
    legacyStatements,
    legacyWriteStatements,
  });
}

function appendLegacyWrite(legacyStatements, legacyWriteStatements, write) {
  const statement = renderParameterizedSql(write.sql, write.params);
  legacyStatements.push(statement);
  legacyWriteStatements.push({statement, write});
  if (writeNeedsExactUpdateAssertion(write)) {
    legacyStatements.push(CLI_EXACT_UPDATE_ASSERTION_SQL);
  }
}

function validateStorageState(value) {
  if (!isRecord(value) || value.controlFence !== true) {
    throw invalid("control_fence_invalid");
  }
  if (Object.hasOwn(value, "compatible") && value.compatible !== true) {
    throw invalid("storage_state_invalid");
  }
  if (
    Object.hasOwn(value, "schemaGeneration")
    && value.schemaGeneration !== MAIL_STORAGE_SCHEMA_GENERATION
  ) {
    throw invalid("schema_generation_invalid");
  }
  if (hasEnabledFeatureFlag(value)) {
    throw invalid("feature_flag_enabled");
  }
  if (value.dataGeneration === 0 && value.lifecycleState === "uninitialized") {
    if (Object.hasOwn(value, "ready") && value.ready !== false) {
      throw invalid("storage_state_invalid");
    }
    return Object.freeze({
      schemaGeneration: MAIL_STORAGE_SCHEMA_GENERATION,
      dataGeneration: 0,
      lifecycleState: "uninitialized",
    });
  }
  if (value.dataGeneration === 1 && value.lifecycleState === "ready") {
    if (Object.hasOwn(value, "ready") && value.ready !== true) {
      throw invalid("storage_state_invalid");
    }
    return Object.freeze({
      schemaGeneration: MAIL_STORAGE_SCHEMA_GENERATION,
      dataGeneration: 1,
      lifecycleState: "ready",
    });
  }
  throw invalid("storage_state_invalid");
}

function hasEnabledFeatureFlag(value) {
  const directFlags = ["archiveEnabled", "vaultClaimEnabled", "activeLimitEnabled"];
  if (directFlags.some((field) => Object.hasOwn(value, field) && value[field] !== false)) {
    return true;
  }
  if (!Object.hasOwn(value, "flags")) {
    return false;
  }
  return !isRecord(value.flags)
    || value.flags.archive !== false
    || value.flags.vaultClaim !== false
    || value.flags.activeLimit !== false;
}

function validateForwardPlan(value, storage) {
  if (
    !isRecord(value)
    || value.kind !== MAIL_STORAGE_FORWARD_MAINTENANCE_PLAN_KIND
    || value.schemaVersion !== MAIL_STORAGE_FORWARD_MAINTENANCE_PLAN_SCHEMA_VERSION
    || value.ok !== true
    || value.controlFence !== true
    || value.dataGeneration !== storage.dataGeneration
    || value.sidecarEnabled !== (storage.dataGeneration === MAIL_STORAGE_DATA_GENERATION)
    || !Array.isArray(value.identityInserts)
    || !Array.isArray(value.identityUpdates)
    || !Array.isArray(value.counterIncrements)
    || !Array.isArray(value.errors)
    || value.errors.length !== 0
    || !SHA256_PATTERN.test(String(value.planDigest || ""))
  ) {
    throw invalid("forward_plan_invalid");
  }
  if (
    storage.dataGeneration === 0
    && (
      value.identityInserts.length !== 0
      || value.identityUpdates.length !== 0
      || value.counterIncrements.length !== 0
    )
  ) {
    throw invalid("generation_zero_sidecar_invalid");
  }
  return value;
}

function validateGenerationOneChanges(value) {
  if (!Array.isArray(value)) {
    throw invalid("changes_invalid");
  }
  const changes = [];
  const seen = new Set();
  for (const changeValue of value) {
    if (!isRecord(changeValue)) {
      throw invalid("change_invalid");
    }
    const mailId = canonicalId(changeValue.mailId, 96);
    const disposition = String(changeValue.disposition || "");
    if (disposition === "delete") {
      const error = invalid("bare_delete_forbidden", mailId);
      error.code = MAIL_STORAGE_BARE_DELETE_FORBIDDEN;
      throw error;
    }
    if (
      mailId === ""
      || !["insert", "update"].includes(disposition)
      || seen.has(mailId)
      || !isRecord(changeValue.after)
      || (disposition === "insert" && changeValue.before !== null)
      || (disposition === "update" && !isRecord(changeValue.before))
    ) {
      throw invalid(seen.has(mailId) ? "duplicate_change" : "change_invalid", mailId);
    }
    seen.add(mailId);
    changes.push({
      mailId,
      disposition,
      before: changeValue.before,
      after: changeValue.after,
    });
  }
  changes.sort((left, right) => compareText(left.mailId, right.mailId));
  return changes;
}

function validatePlanFacts(plan, changes) {
  const insertsByMailId = strictSortedFacts(plan.identityInserts, "identity_insert", "mailId");
  const updatesByMailId = strictSortedFacts(plan.identityUpdates, "identity_update", "mailId");
  const expectedInserts = [];
  const expectedUpdates = [];
  const counterByRecipient = new Map();

  for (const change of changes) {
    if (change.disposition === "insert") {
      const supplied = insertsByMailId.get(change.mailId);
      if (!supplied) {
        throw invalid("identity_insert_missing", change.mailId);
      }
      if (supplied.settledAt !== documentSettledAt(change.after)) {
        throw invalid("identity_insert_settlement_mismatch", change.mailId);
      }
      let expected;
      try {
        expected = projectActiveMailIdentityRow({
          mail: change.after,
          settledAt: supplied.settledAt,
          dataGeneration: MAIL_STORAGE_DATA_GENERATION,
          revision: 0,
        });
      } catch {
        throw invalid("identity_insert_projection_invalid", change.mailId);
      }
      if (!isDeepStrictEqual(supplied, expected)) {
        throw invalid("identity_insert_mismatch", change.mailId);
      }
      validatePhysicalMail(change.after, change.mailId);
      expectedInserts.push(supplied);
      counterByRecipient.set(
        supplied.recipientAccountId,
        Number(counterByRecipient.get(supplied.recipientAccountId) || 0) + 1,
      );
      continue;
    }

    const supplied = updatesByMailId.get(change.mailId);
    if (!supplied) {
      throw invalid("identity_update_missing", change.mailId);
    }
    if (
      supplied.previousSettledAt !== documentSettledAt(change.before)
      || supplied.nextSettledAt !== documentSettledAt(change.after)
    ) {
      throw invalid("identity_update_settlement_mismatch", change.mailId);
    }
    let previousIdentity;
    let nextIdentity;
    try {
      previousIdentity = projectActiveMailIdentityRow({
        mail: change.before,
        settledAt: supplied.previousSettledAt,
        dataGeneration: MAIL_STORAGE_DATA_GENERATION,
        revision: 0,
      });
      nextIdentity = projectActiveMailIdentityRow({
        mail: change.after,
        settledAt: supplied.nextSettledAt,
        dataGeneration: MAIL_STORAGE_DATA_GENERATION,
        revision: 0,
      });
    } catch {
      throw invalid("identity_update_projection_invalid", change.mailId);
    }
    const expected = {
      mailId: nextIdentity.mailId,
      senderAccountId: nextIdentity.senderAccountId,
      recipientAccountId: nextIdentity.recipientAccountId,
      createdAt: nextIdentity.createdAt,
      identityDigest: nextIdentity.identityDigest,
      previousDocumentDigest: previousIdentity.documentDigest,
      nextDocumentDigest: nextIdentity.documentDigest,
      previousSettledAt: supplied.previousSettledAt,
      nextSettledAt: supplied.nextSettledAt,
      dataGeneration: MAIL_STORAGE_DATA_GENERATION,
    };
    if (!isDeepStrictEqual(supplied, expected)) {
      throw invalid("identity_update_mismatch", change.mailId);
    }
    validatePhysicalMail(change.before, change.mailId);
    validatePhysicalMail(change.after, change.mailId);
    expectedUpdates.push(supplied);
  }

  if (
    expectedInserts.length !== plan.identityInserts.length
    || expectedUpdates.length !== plan.identityUpdates.length
  ) {
    throw invalid("identity_fact_count_mismatch");
  }
  const expectedCounters = Array.from(counterByRecipient.entries())
    .sort(([left], [right]) => compareText(left, right))
    .map(([recipientAccountId, incrementBy]) => ({
      recipientAccountId,
      incrementBy,
      dataGeneration: MAIL_STORAGE_DATA_GENERATION,
    }));
  strictSortedFacts(plan.counterIncrements, "counter_increment", "recipientAccountId");
  if (!isDeepStrictEqual(plan.counterIncrements, expectedCounters)) {
    throw invalid("counter_increment_mismatch");
  }
  return {
    identityInserts: expectedInserts,
    identityUpdates: expectedUpdates,
    counterIncrements: expectedCounters,
  };
}

function strictSortedFacts(value, reason, keyField) {
  const result = new Map();
  let previous = "";
  for (const fact of value) {
    if (!isRecord(fact)) {
      throw invalid(`${reason}_invalid`);
    }
    const key = canonicalId(fact[keyField], keyField === "mailId" ? 96 : 80);
    if (
      key === ""
      || result.has(key)
      || (previous !== "" && compareText(previous, key) >= 0)
    ) {
      throw invalid(`${reason}_order_invalid`, key);
    }
    result.set(key, fact);
    previous = key;
  }
  return result;
}

function mailStorageControlLock(storage) {
  return {
    kind: "lock",
    resource: "mail_storage_control",
    key: MAIL_STORAGE_SCOPE_KEY,
    lockMode: "shared",
    sql: MAIL_STORAGE_CONTROL_LOCK_SQL,
    params: [MAIL_STORAGE_SCOPE_KEY],
    expectedRow: {
      scope_key: MAIL_STORAGE_SCOPE_KEY,
      schema_generation: storage.schemaGeneration,
      data_generation: storage.dataGeneration,
      lifecycle_state: storage.lifecycleState,
      archive_enabled: 0,
      vault_claim_enabled: 0,
      active_limit_enabled: 0,
    },
  };
}

function mailIdentityLock(update) {
  return {
    kind: "lock",
    resource: "mail_identity",
    key: update.mailId,
    lockMode: "exclusive",
    sql: MAIL_IDENTITY_LOCK_SQL,
    params: [update.mailId],
    expectedRow: {
      mail_id: update.mailId,
      sender_account_id: update.senderAccountId,
      recipient_account_id: update.recipientAccountId,
      location: "active",
      created_at: update.createdAt,
      settled_at: update.previousSettledAt,
      archived_at: null,
      identity_digest: update.identityDigest,
      document_digest: update.previousDocumentDigest,
      reward_id: null,
      data_generation: update.dataGeneration,
    },
  };
}

function mailActiveCounterSeed(increment) {
  return {
    kind: "seed",
    resource: "mail_active_counter",
    key: increment.recipientAccountId,
    sql: MAIL_ACTIVE_COUNTER_SEED_SQL,
    params: [increment.recipientAccountId],
    expectedAffectedRows: [0, 1, 2],
  };
}

function mailActiveCounterIncrement(increment) {
  return {
    kind: "increment",
    resource: "mail_active_counter",
    key: increment.recipientAccountId,
    sql: MAIL_ACTIVE_COUNTER_INCREMENT_SQL,
    params: [
      increment.incrementBy,
      increment.recipientAccountId,
      increment.incrementBy,
    ],
    expectedAffectedRows: 1,
  };
}

function mailIdentityInsert(identity) {
  return {
    kind: "insert",
    resource: "mail_identity",
    key: identity.mailId,
    sql: MAIL_IDENTITY_INSERT_SQL,
    params: [
      identity.mailId,
      identity.senderAccountId,
      identity.recipientAccountId,
      identity.createdAt,
      identity.settledAt,
      identity.identityDigest,
      identity.documentDigest,
    ],
    expectedAffectedRows: 1,
  };
}

function mailIdentityUpdate(update) {
  return {
    kind: "update",
    resource: "mail_identity",
    key: update.mailId,
    sql: MAIL_IDENTITY_UPDATE_SQL,
    params: [
      update.nextSettledAt,
      update.nextDocumentDigest,
      update.mailId,
      update.senderAccountId,
      update.recipientAccountId,
      update.createdAt,
      update.previousSettledAt,
      update.identityDigest,
      update.previousDocumentDigest,
    ],
    expectedAffectedRows: 1,
  };
}

function legacyMailInsert(mail) {
  const physical = validatePhysicalMail(mail, mail && mail.mailId);
  return {
    kind: "insert",
    resource: "mail_message",
    key: physical.mailId,
    sql: LEGACY_MAIL_INSERT_SQL,
    params: [
      physical.mailId,
      physical.senderAccountId,
      physical.recipientAccountId,
      physical.title,
      physical.createdAt,
      physical.readAt,
      physical.documentJson,
    ],
    expectedAffectedRows: 1,
  };
}

function legacyMailUpdate(mail, previousMail) {
  const next = validatePhysicalMail(mail, mail && mail.mailId);
  const previous = validatePhysicalMail(previousMail, next.mailId);
  if (
    next.mailId !== previous.mailId
    || next.senderAccountId !== previous.senderAccountId
    || next.recipientAccountId !== previous.recipientAccountId
    || next.createdAt !== previous.createdAt
  ) {
    throw invalid("mail_identity_drift", next.mailId);
  }
  return {
    kind: "update",
    resource: "mail_message",
    key: next.mailId,
    sql: LEGACY_MAIL_UPDATE_SQL,
    params: [
      next.senderAccountId,
      next.recipientAccountId,
      next.title,
      next.createdAt,
      next.readAt,
      next.documentJson,
      previous.mailId,
      previous.senderAccountId,
      previous.recipientAccountId,
      previous.title,
      previous.createdAt,
      previous.readAt,
      previous.documentJson,
    ],
    expectedAffectedRows: 1,
  };
}

function validatePhysicalMail(value, expectedMailId) {
  if (!isRecord(value)) {
    throw invalid("mail_document_invalid", String(expectedMailId || ""));
  }
  const mailId = canonicalId(value.mailId, 96);
  const senderAccountId = canonicalId(value.senderAccountId, 80);
  const recipientAccountId = canonicalId(value.recipientAccountId, 80);
  const title = typeof value.title === "string" ? value.title : null;
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : null;
  const readAt = value.readAt === null || value.readAt === undefined
    ? null
    : (typeof value.readAt === "string" ? value.readAt : undefined);
  let documentJson;
  try {
    documentJson = JSON.stringify(value);
  } catch {
    documentJson = undefined;
  }
  if (
    mailId === ""
    || mailId !== String(expectedMailId || "")
    || senderAccountId === ""
    || recipientAccountId === ""
    || title === null
    || title.length > 80
    || createdAt === null
    || createdAt === ""
    || createdAt.length > 40
    || readAt === undefined
    || (readAt !== null && (readAt === "" || readAt.length > 40))
    || typeof documentJson !== "string"
  ) {
    throw invalid("mail_document_invalid", mailId);
  }
  return {
    mailId,
    senderAccountId,
    recipientAccountId,
    title,
    createdAt,
    readAt,
    documentJson,
  };
}

function documentSettledAt(mail) {
  return isRecord(mail) && Object.hasOwn(mail, "settledAt") ? mail.settledAt : null;
}

function cliControlFenceAssertion(storage) {
  return `INSERT INTO auth_store_revisions (scope_key, revision)
  SELECT scope_key, revision
  FROM auth_store_revisions
  WHERE scope_key = 'auth'
    AND NOT EXISTS (
      SELECT 1 FROM mail_storage_control
      WHERE scope_key = ${mysqlRawLiteral(MAIL_STORAGE_SCOPE_KEY)}
        AND schema_generation = ${storage.schemaGeneration}
        AND data_generation = ${storage.dataGeneration}
        AND lifecycle_state = ${mysqlRawLiteral(storage.lifecycleState)}
        AND archive_enabled = 0
        AND vault_claim_enabled = 0
        AND active_limit_enabled = 0
    )`;
}

function writeNeedsExactUpdateAssertion(write) {
  if (write.resource === "mail_message" && write.kind === "update") {
    return write.expectedAffectedRows === 1;
  }
  return ["update", "increment"].includes(write.kind)
    && mysqlResourceWriteAffectedRowsAccepted(write, 1) === true
    && mysqlResourceWriteAffectedRowsAccepted(write, 0) === false;
}

function renderParameterizedSql(sqlValue, paramsValue) {
  const sql = String(sqlValue || "");
  const params = Array.isArray(paramsValue) ? paramsValue : [];
  let result = "";
  let paramIndex = 0;
  let quote = "";
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (quote !== "") {
      result += character;
      if (character === "\\" && index + 1 < sql.length) {
        result += sql[index + 1];
        index += 1;
      } else if (character === quote) {
        if (sql[index + 1] === quote) {
          result += sql[index + 1];
          index += 1;
        } else {
          quote = "";
        }
      }
      continue;
    }
    if (["'", "\"", "`"].includes(character)) {
      quote = character;
      result += character;
      continue;
    }
    if (character !== "?") {
      result += character;
      continue;
    }
    if (paramIndex >= params.length) {
      throw invalid("raw_sql_parameter_count_invalid");
    }
    result += mysqlRawLiteral(params[paramIndex]);
    paramIndex += 1;
  }
  if (quote !== "" || paramIndex !== params.length) {
    throw invalid("raw_sql_parameter_count_invalid");
  }
  return result;
}

function mysqlRawLiteral(value) {
  if (value === null) {
    return "NULL";
  }
  if (typeof value === "string") {
    return `CONVERT(X'${Buffer.from(value, "utf8").toString("hex")}' USING utf8mb4)`;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return String(value);
  }
  throw invalid("raw_sql_parameter_invalid");
}

function canonicalId(value, maximumLength) {
  return typeof value === "string"
    && value !== ""
    && value === value.trim()
    && value.length <= maximumLength
    && MAIL_STORAGE_ID_PATTERN.test(value)
    ? value
    : "";
}

function invalid(reason, key = "") {
  const error = new TypeError(`MySQL 邮箱 generation forward SQL 计划无效：${reason}`);
  error.code = MAIL_STORAGE_FORWARD_WRITES_INVALID;
  error.reason = String(reason || "invalid");
  if (key !== "") {
    error.resourceKey = String(key);
  }
  return error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compareText(left, right) {
  return left < right ? -1 : (left > right ? 1 : 0);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

module.exports = {
  CLI_EXACT_UPDATE_ASSERTION_SQL,
  LEGACY_MAIL_INSERT_SQL,
  LEGACY_MAIL_UPDATE_SQL,
  MAIL_STORAGE_BARE_DELETE_FORBIDDEN,
  MAIL_STORAGE_FORWARD_WRITES_INVALID,
  buildMailStorageForwardWriteSet,
};
