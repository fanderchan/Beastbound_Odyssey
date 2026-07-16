"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MAIL_ACTIVE_COUNTER_INCREMENT_SQL,
  MAIL_ACTIVE_COUNTER_SEED_SQL,
  MAIL_IDENTITY_INSERT_SQL,
  MAIL_IDENTITY_LOCK_SQL,
  MAIL_IDENTITY_UPDATE_SQL,
  MAIL_STORAGE_CONTROL_LOCK_SQL,
  mysqlResourceWriteAffectedRowsAccepted,
} = require("../src/mysql-resource-acquisition-order");
const {
  buildMailStorageForwardMaintenancePlan,
} = require("../src/mysql-mail-storage-forward-maintenance");
const {
  CLI_EXACT_UPDATE_ASSERTION_SQL,
  LEGACY_MAIL_UPDATE_SQL,
  MAIL_STORAGE_BARE_DELETE_FORBIDDEN,
  MAIL_STORAGE_FORWARD_WRITES_INVALID,
  buildMailStorageForwardWriteSet,
} = require("../src/mysql-mail-storage-forward-writes");

const CREATED_AT = "2026-07-17T00:00:00.000Z";
const READ_AT = "2026-07-17T00:01:00.000Z";

function storageState(dataGeneration = 1, overrides = {}) {
  return {
    controlFence: true,
    schemaGeneration: 1,
    dataGeneration,
    lifecycleState: dataGeneration === 1 ? "ready" : "uninitialized",
    ...overrides,
  };
}

function mail(overrides = {}) {
  const mailId = overrides.mailId || "mail_forward_1";
  const senderAccountId = overrides.senderAccountId || "account_sender";
  const recipientAccountId = overrides.recipientAccountId || "account_recipient";
  return {
    mailId,
    mailKind: "player",
    senderAccountId,
    senderUsername: "sender",
    senderDisplayName: "寄件人",
    recipientAccountId,
    recipientUsername: "recipient",
    recipientDisplayName: "收件人",
    title: "generation forward",
    body: "邮件必须和 sidecar 同事务提交。",
    items: [],
    equipmentEnvelopes: [],
    currency: {},
    createdAt: CREATED_AT,
    readAt: null,
    settledAt: CREATED_AT,
    schemaVersion: 2,
    ...overrides,
  };
}

function certifyAttachment(value) {
  return {
    ok: true,
    items: structuredClone(value.items || []),
    equipmentEnvelopes: structuredClone(value.equipmentEnvelopes || []),
    currency: structuredClone(value.currency || {}),
  };
}

function insertChange(mailValue = mail()) {
  return {
    mailId: mailValue.mailId,
    disposition: "insert",
    before: null,
    after: mailValue,
  };
}

function updateChange(before = mail(), after = mail({readAt: READ_AT})) {
  return {
    mailId: before.mailId,
    disposition: "update",
    before,
    after,
  };
}

function forwardPlan(state, changes) {
  return buildMailStorageForwardMaintenancePlan({
    storageState: state,
    changes,
    certifyAttachment,
  });
}

function writeSet(state, changes, plan = forwardPlan(state, changes)) {
  return buildMailStorageForwardWriteSet({
    storageState: state,
    forwardPlan: plan,
    changes,
  });
}

function rejects(reason, action) {
  assert.throws(action, (error) => {
    assert.equal(error.code, MAIL_STORAGE_FORWARD_WRITES_INVALID);
    assert.equal(error.reason, reason);
    return true;
  });
}

test("generation zero emits only the exact uninitialized control fence", () => {
  const state = storageState(0);
  const plan = forwardPlan(state, [insertChange()]);
  const result = writeSet(state, [{mailId: "ignored", disposition: "delete"}], plan);

  assert.equal(result.controlLocks.length, 1);
  assert.deepEqual(result.controlLocks[0], {
    kind: "lock",
    resource: "mail_storage_control",
    key: "mail_lifecycle",
    lockMode: "shared",
    sql: MAIL_STORAGE_CONTROL_LOCK_SQL,
    params: ["mail_lifecycle"],
    expectedRow: {
      scope_key: "mail_lifecycle",
      schema_generation: 1,
      data_generation: 0,
      lifecycle_state: "uninitialized",
      archive_enabled: 0,
      vault_claim_enabled: 0,
      active_limit_enabled: 0,
    },
  });
  assert.deepEqual(result.identityLocks, []);
  assert.deepEqual(result.updateChanges, []);
  assert.deepEqual(result.sidecarWrites, []);
  assert.deepEqual(result.mailWrites, []);
  assert.deepEqual(result.legacyWriteStatements, []);
  assert.equal(result.legacyStatements.length, 2);
  assert.match(result.legacyStatements[0], /FROM mail_storage_control/);
  assert.match(result.legacyStatements[1], /NOT EXISTS/);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.controlLocks[0].expectedRow), true);
});

test("generation one insert seeds and increments the recipient before strict identity and mail inserts", () => {
  const state = storageState(1);
  const changes = [insertChange()];
  const result = writeSet(state, changes);

  assert.deepEqual(result.identityLocks, []);
  assert.deepEqual(result.updateChanges, []);
  assert.deepEqual(result.sidecarWrites.map(({resource, kind, key}) => [resource, kind, key]), [
    ["mail_active_counter", "seed", "account_recipient"],
    ["mail_active_counter", "increment", "account_recipient"],
    ["mail_identity", "insert", "mail_forward_1"],
  ]);
  assert.equal(result.sidecarWrites[0].sql, MAIL_ACTIVE_COUNTER_SEED_SQL);
  assert.equal(result.sidecarWrites[1].sql, MAIL_ACTIVE_COUNTER_INCREMENT_SQL);
  assert.equal(result.sidecarWrites[2].sql, MAIL_IDENTITY_INSERT_SQL);
  assert.equal(mysqlResourceWriteAffectedRowsAccepted(result.sidecarWrites[0], 0), true);
  assert.equal(mysqlResourceWriteAffectedRowsAccepted(result.sidecarWrites[0], 1), true);
  assert.equal(mysqlResourceWriteAffectedRowsAccepted(result.sidecarWrites[0], 2), true);
  assert.equal(mysqlResourceWriteAffectedRowsAccepted(result.sidecarWrites[0], 3), false);
  assert.equal(mysqlResourceWriteAffectedRowsAccepted(result.sidecarWrites[1], 1), true);
  assert.equal(mysqlResourceWriteAffectedRowsAccepted(result.sidecarWrites[2], 1), true);
  assert.deepEqual(result.mailWrites.map(({resource, kind, key}) => [resource, kind, key]), [
    ["mail_message", "insert", "mail_forward_1"],
  ]);
  assert.deepEqual(result.legacyWriteStatements.map(({write}) => [write.resource, write.kind]), [
    ["mail_active_counter", "seed"],
    ["mail_active_counter", "increment"],
    ["mail_identity", "insert"],
    ["mail_message", "insert"],
  ]);
  const incrementRawIndex = result.legacyStatements.indexOf(
    result.legacyWriteStatements[1].statement,
  );
  assert.equal(result.legacyStatements[incrementRawIndex + 1], CLI_EXACT_UPDATE_ASSERTION_SQL);
});

test("generation one update locks old identity and emits full old physical-row CAS", () => {
  const state = storageState(1);
  const changes = [updateChange()];
  const result = writeSet(state, changes);

  assert.equal(result.identityLocks.length, 1);
  assert.equal(result.identityLocks[0].sql, MAIL_IDENTITY_LOCK_SQL);
  assert.equal(result.identityLocks[0].lockMode, "exclusive");
  assert.equal(result.identityLocks[0].expectedRow.document_digest,
    result.sidecarWrites[0].params[8]);
  assert.deepEqual(result.sidecarWrites.map(({resource, kind}) => [resource, kind]), [
    ["mail_identity", "update"],
  ]);
  assert.equal(result.sidecarWrites[0].sql, MAIL_IDENTITY_UPDATE_SQL);
  assert.equal(result.mailWrites.length, 1);
  assert.equal(result.mailWrites[0].sql, LEGACY_MAIL_UPDATE_SQL);
  assert.equal(result.mailWrites[0].params.length, 13);
  assert.match(result.mailWrites[0].sql, /document_json = CAST\(\? AS JSON\)\s*$/);
  assert.equal(result.updateChanges.length, 1);
  assert.equal(Object.isFrozen(result.updateChanges[0].before), true);
  assert.notEqual(result.updateChanges[0].before, changes[0].before);

  assert.deepEqual(result.legacyWriteStatements.map(({write}) => [write.resource, write.kind]), [
    ["mail_identity", "update"],
    ["mail_message", "update"],
  ]);
  for (const entry of result.legacyWriteStatements) {
    const index = result.legacyStatements.indexOf(entry.statement);
    assert.equal(result.legacyStatements[index + 1], CLI_EXACT_UPDATE_ASSERTION_SQL);
  }
});

test("legacy non-ISO creation identity remains exactly CAS-updatable after bootstrap", () => {
  const state = storageState(1);
  const before = mail({createdAt: "legacy-created-text"});
  delete before.settledAt;
  const after = {...before, readAt: READ_AT};
  const result = writeSet(state, [updateChange(before, after)]);

  assert.equal(result.identityLocks[0].expectedRow.created_at, "legacy-created-text");
  assert.equal(result.identityLocks[0].expectedRow.settled_at, null);
  assert.equal(result.sidecarWrites[0].params[5], "legacy-created-text");
  assert.equal(mysqlResourceWriteAffectedRowsAccepted(result.sidecarWrites[0], 1), true);
  assert.equal(result.mailWrites[0].params[10], "legacy-created-text");
});

test("multiple recipients and mail identities use canonical independent ordering", () => {
  const state = storageState(1);
  const changes = [
    insertChange(mail({mailId: "mail_z", recipientAccountId: "account_a"})),
    insertChange(mail({mailId: "mail_a", recipientAccountId: "account_z"})),
  ];
  const result = writeSet(state, changes);

  assert.deepEqual(result.sidecarWrites.map(({resource, kind, key}) => [resource, kind, key]), [
    ["mail_active_counter", "seed", "account_a"],
    ["mail_active_counter", "increment", "account_a"],
    ["mail_active_counter", "seed", "account_z"],
    ["mail_active_counter", "increment", "account_z"],
    ["mail_identity", "insert", "mail_a"],
    ["mail_identity", "insert", "mail_z"],
  ]);
  assert.deepEqual(result.mailWrites.map(({key}) => key), ["mail_a", "mail_z"]);
  assert.deepEqual(result.legacyWriteStatements.map(({write}) => write.key), [
    "account_a",
    "account_a",
    "account_z",
    "account_z",
    "mail_a",
    "mail_z",
    "mail_a",
    "mail_z",
  ]);
});

test("mixed stop-service batch stays staged as counter then identity lock/write then mail", () => {
  const state = storageState(1);
  const before = mail({mailId: "mail_a"});
  const changes = [
    insertChange(mail({mailId: "mail_z", recipientAccountId: "account_z"})),
    updateChange(before, {...before, readAt: READ_AT}),
  ];
  const result = writeSet(state, changes);

  assert.deepEqual(result.sidecarWrites.map(({resource, kind, key}) => [resource, kind, key]), [
    ["mail_active_counter", "seed", "account_z"],
    ["mail_active_counter", "increment", "account_z"],
    ["mail_identity", "update", "mail_a"],
    ["mail_identity", "insert", "mail_z"],
  ]);
  assert.deepEqual(result.mailWrites.map(({kind, key}) => [kind, key]), [
    ["update", "mail_a"],
    ["insert", "mail_z"],
  ]);
  assert.deepEqual(result.legacyWriteStatements.map(({write}) => [write.resource, write.kind, write.key]), [
    ["mail_active_counter", "seed", "account_z"],
    ["mail_active_counter", "increment", "account_z"],
    ["mail_identity", "update", "mail_a"],
    ["mail_identity", "insert", "mail_z"],
    ["mail_message", "update", "mail_a"],
    ["mail_message", "insert", "mail_z"],
  ]);
  const identityLockIndex = result.legacyStatements.findIndex((statement) => (
    statement.includes("FROM mail_identity_registry")
  ));
  const counterIncrementIndex = result.legacyStatements.indexOf(
    result.legacyWriteStatements[1].statement,
  );
  const firstIdentityWriteIndex = result.legacyStatements.indexOf(
    result.legacyWriteStatements[2].statement,
  );
  assert.ok(counterIncrementIndex < identityLockIndex);
  assert.ok(identityLockIndex < firstIdentityWriteIndex);
});

test("legacy raw SQL hex-encodes hostile UTF-8 strings and leaves no parameters", () => {
  const state = storageState(1);
  const hostile = "' ; DROP TABLE mail_messages; -- ? \\ 中文\n";
  const changes = [insertChange(mail({title: hostile, body: hostile}))];
  const result = writeSet(state, changes);
  const rawMail = result.legacyWriteStatements.find(({write}) => write.resource === "mail_message");

  assert.ok(rawMail);
  assert.doesNotMatch(rawMail.statement, /DROP TABLE/);
  assert.doesNotMatch(rawMail.statement, /中文/);
  assert.doesNotMatch(rawMail.statement, /\?/);
  assert.match(rawMail.statement, /CONVERT\(X'[a-f0-9]+' USING utf8mb4\)/);
  assert.equal(rawMail.statement.endsWith(";"), false);
});

test("control assertion is adjacent and exact for ready generation one with all flags disabled", () => {
  const state = storageState(1, {
    compatible: true,
    ready: true,
    flags: {archive: false, vaultClaim: false, activeLimit: false},
  });
  const result = writeSet(state, [insertChange()]);

  assert.match(result.legacyStatements[0], /FOR SHARE\s*$/);
  assert.match(result.legacyStatements[1], /schema_generation = 1/);
  assert.match(result.legacyStatements[1], /data_generation = 1/);
  assert.match(result.legacyStatements[1], /archive_enabled = 0/);
  assert.match(result.legacyStatements[1], /vault_claim_enabled = 0/);
  assert.match(result.legacyStatements[1], /active_limit_enabled = 0/);

  const enabled = storageState(1, {archiveEnabled: true});
  rejects("feature_flag_enabled", () => writeSet(enabled, [insertChange()]));
});

test("generation one rejects bare delete before accepting a failed forward plan", () => {
  const state = storageState(1);
  const before = mail();
  const changes = [{
    mailId: before.mailId,
    disposition: "delete",
    before,
    after: null,
  }];
  const plan = forwardPlan(state, changes);
  assert.equal(plan.ok, false);

  assert.throws(
    () => writeSet(state, changes, plan),
    (error) => error.code === MAIL_STORAGE_BARE_DELETE_FORBIDDEN
      && error.reason === "bare_delete_forbidden",
  );
});

test("cross-check rejects altered identity digest and missing recipient increment", () => {
  const state = storageState(1);
  const changes = [insertChange()];
  const valid = forwardPlan(state, changes);

  const alteredDigest = structuredClone(valid);
  const original = alteredDigest.identityInserts[0].documentDigest;
  alteredDigest.identityInserts[0].documentDigest = `${original[0] === "0" ? "1" : "0"}${original.slice(1)}`;
  rejects("identity_insert_mismatch", () => writeSet(state, changes, alteredDigest));

  const missingCounter = structuredClone(valid);
  missingCounter.counterIncrements = [];
  rejects("counter_increment_mismatch", () => writeSet(state, changes, missingCounter));

  const alteredSettlement = structuredClone(valid);
  alteredSettlement.identityInserts[0].settledAt = READ_AT;
  rejects(
    "identity_insert_settlement_mismatch",
    () => writeSet(state, changes, alteredSettlement),
  );
});
