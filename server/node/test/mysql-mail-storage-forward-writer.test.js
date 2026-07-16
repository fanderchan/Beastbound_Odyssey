"use strict";

const assert = require("node:assert/strict");
const {isDeepStrictEqual} = require("node:util");
const test = require("node:test");

const {cloneAuthorityRoot} = require("../src/auth/authority-root-clone");
const {
  canonicalDurableMutationReceipts,
  stageDurableMutationReceipt,
} = require("../src/auth/durable-mutation-state");
const {
  readMailAuthorityState,
  stageMailAuthorityUpsert,
} = require("../src/auth/mail-authority-state");
const {
  CLI_EXACT_UPDATE_ASSERTION_SQL,
} = require("../src/mysql-mail-storage-forward-writes");
const {
  mysqlResourceAcquisitionTrace,
} = require("../src/mysql-resource-acquisition-order");
const {
  __buildMysqlSavePlanFromPersistentDataForTest: buildMysqlSavePlan,
  __buildSaveStatementsFromPersistentDataForTest: buildStoppedSaveStatements,
  __runMysqlPoolSavePlanForTest: runMysqlPoolSavePlan,
} = require("../src/mysql-store");
const {MYSQL_SESSION_POLICY_SQL} = require("../src/mysql-transaction-guard");

const CREATED_AT = "2026-07-17T02:00:00.000Z";
const READ_AT = "2026-07-17T02:30:00.000Z";
const ACCOUNT_ID = "account_forward_recipient";
const MAIL_ID = "mail_forward_writer_1";
const OPERATION_ID = "op_forward_writer_read_1";
const REQUEST_HASH = "8".repeat(64);
const ACTION_ID = "POST /mail/:id/read";

function storageState(dataGeneration) {
  return {
    controlFence: true,
    compatible: true,
    ready: dataGeneration === 1,
    schemaGeneration: 1,
    dataGeneration,
    lifecycleState: dataGeneration === 1 ? "ready" : "uninitialized",
    flags: {archive: false, vaultClaim: false, activeLimit: false},
  };
}

function mail(overrides = {}) {
  return {
    mailId: MAIL_ID,
    mailKind: "player",
    senderAccountId: "account_forward_sender",
    senderUsername: "forward_sender",
    senderDisplayName: "寄件人",
    recipientAccountId: ACCOUNT_ID,
    recipientUsername: "forward_recipient",
    recipientDisplayName: "收件人",
    title: "generation one writer",
    body: "永久身份和邮件正文必须原子提交。",
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

function persistentState(mailMessages = {}, mutationReceipts = {}) {
  return {
    schemaVersion: 1,
    accounts: {},
    sessions: {},
    profileBindings: {},
    profiles: {},
    mutationReceipts,
    mailMessages,
    marketListings: {},
    consumedEquipmentEnvelopes: {},
    marketConfig: {},
    offlineHangConfig: {},
    parties: {},
    partyInvites: {},
    families: {},
    manors: {},
    manorWars: [],
    manorBattles: [],
    chatMessages: [],
    playerPositions: {},
    battleInvites: {},
    battleRooms: {},
    battleRecords: [],
    battleTrace: [],
    gmUserGrants: {},
    gmCommandGrants: {},
    gmCommandAudit: [],
    authEvents: [],
    serviceEventSeq: 0,
    serviceEvents: [],
  };
}

function planningOptions(dataGeneration, overrides = {}) {
  return {
    mailStorageState: storageState(dataGeneration),
    mailStorageCertifyAttachment: certifyAttachment,
    ...overrides,
  };
}

function planFor(after, before, dataGeneration = 1, overrides = {}) {
  return buildMysqlSavePlan(
    after,
    before,
    planningOptions(dataGeneration, overrides),
  );
}

function legacyInsertStates(mailValue = mail()) {
  return {
    before: persistentState(),
    after: persistentState({[mailValue.mailId]: mailValue}),
  };
}

function legacyUpdateStates(mailId = MAIL_ID) {
  const beforeMail = mail({mailId});
  const afterMail = {...beforeMail, readAt: READ_AT};
  return {
    before: persistentState({[mailId]: beforeMail}),
    after: persistentState({[mailId]: afterMail}),
  };
}

function legacyMixedStates() {
  const updateMail = mail({mailId: "mail_forward_a"});
  const insertedMail = mail({
    mailId: "mail_forward_z",
    recipientAccountId: "account_forward_z",
    recipientUsername: "forward_z",
    recipientDisplayName: "Z收件人",
  });
  return {
    before: persistentState({[updateMail.mailId]: updateMail}),
    after: persistentState({
      [updateMail.mailId]: {...updateMail, readAt: READ_AT},
      [insertedMail.mailId]: insertedMail,
    }),
  };
}

function conditionalReadStates() {
  const authority = readMailAuthorityState({[MAIL_ID]: mail()});
  assert.equal(authority.ok, true);
  const before = persistentState(
    authority.messages,
    canonicalDurableMutationReceipts({}),
  );
  const after = cloneAuthorityRoot(before);
  const stagedMail = stageMailAuthorityUpsert(after.mailMessages, {
    ...after.mailMessages[MAIL_ID],
    readAt: READ_AT,
  });
  assert.equal(stagedMail.ok, true);
  after.mailMessages = stagedMail.messages;
  after.mutationReceipts = stageDurableMutationReceipt(after.mutationReceipts, {
    schemaVersion: 1,
    operationId: OPERATION_ID,
    requestHash: REQUEST_HASH,
    actionId: ACTION_ID,
    accountId: ACCOUNT_ID,
    committedAt: READ_AT,
    expiresAt: "2026-07-20T02:30:00.000Z",
    response: {
      ok: true,
      mail: {mailId: MAIL_ID, readAt: READ_AT},
      message: "邮件已读。",
    },
  }, {nowMs: Date.parse(READ_AT)});
  return {before, after};
}

function conditionalReadScope() {
  return {
    kind: "row_local_mail_read_v1",
    mailDisposition: "update",
    accountId: ACCOUNT_ID,
    mailId: MAIL_ID,
    operationId: OPERATION_ID,
    requestHash: REQUEST_HASH,
    actionId: ACTION_ID,
  };
}

function forwardWriteSet(plan) {
  assert.ok(plan.mailForwardWriteSet, "expected generation-aware forward write set");
  return plan.mailForwardWriteSet;
}

test("generation zero legacy planning carries one exact uninitialized control fence", () => {
  const {before, after} = legacyInsertStates();
  const plan = planFor(after, before, 0);
  const writeSet = forwardWriteSet(plan);

  assert.equal(plan.kind, "legacy_global_cas");
  assert.deepEqual(plan.resourceLocks[0] && [
    plan.resourceLocks[0].resource,
    plan.resourceLocks[0].key,
  ], ["mail_storage_control", "mail_lifecycle"]);
  assert.equal(
    plan.resourceLocks.filter(({resource}) => resource === "mail_storage_control").length,
    1,
  );
  assert.deepEqual(writeSet.controlLocks[0].expectedRow, {
    scope_key: "mail_lifecycle",
    schema_generation: 1,
    data_generation: 0,
    lifecycle_state: "uninitialized",
    archive_enabled: 0,
    vault_claim_enabled: 0,
    active_limit_enabled: 0,
  });
  assert.deepEqual(writeSet.identityLocks, []);
  assert.deepEqual(writeSet.sidecarWrites, []);
  assert.deepEqual(writeSet.mailWrites, []);
  assert.equal(
    plan.statements.some((statement) => /^INSERT INTO mail_messages\b/i.test(statement)),
    true,
  );
});

test("generation one legacy insert, update, and mixed batches all carry sidecars before mail", () => {
  const insertStates = legacyInsertStates();
  const insert = planFor(insertStates.after, insertStates.before);
  assert.equal(insert.kind, "legacy_global_cas");
  assert.deepEqual(
    forwardWriteSet(insert).legacyWriteStatements.map(({write}) => [write.resource, write.kind]),
    [
      ["mail_active_counter", "seed"],
      ["mail_active_counter", "increment"],
      ["mail_identity", "insert"],
      ["mail_message", "insert"],
    ],
  );

  const updateStates = legacyUpdateStates();
  const update = planFor(updateStates.after, updateStates.before);
  assert.deepEqual(
    forwardWriteSet(update).legacyWriteStatements.map(({write}) => [write.resource, write.kind]),
    [
      ["mail_identity", "update"],
      ["mail_message", "update"],
    ],
  );
  assert.deepEqual(
    forwardWriteSet(update).identityLocks.map(({resource, key}) => [resource, key]),
    [["mail_identity", MAIL_ID]],
  );

  const mixedStates = legacyMixedStates();
  const mixed = planFor(mixedStates.after, mixedStates.before);
  assert.deepEqual(
    forwardWriteSet(mixed).legacyWriteStatements.map(({write}) => (
      [write.resource, write.kind, write.key]
    )),
    [
      ["mail_active_counter", "seed", "account_forward_z"],
      ["mail_active_counter", "increment", "account_forward_z"],
      ["mail_identity", "update", "mail_forward_a"],
      ["mail_identity", "insert", "mail_forward_z"],
      ["mail_message", "update", "mail_forward_a"],
      ["mail_message", "insert", "mail_forward_z"],
    ],
  );
});

test("generation one legacy planning rejects active-mail deletion before execution", () => {
  const beforeMail = mail();
  const before = persistentState({[beforeMail.mailId]: beforeMail});
  const after = persistentState();

  assert.throws(
    () => planFor(after, before),
    (error) => error
      && error.code === "mail_storage_forward_delete_forbidden"
      && error.resourceKey === MAIL_ID,
  );
});

test("generation one rejects an untyped malformed legacy fallback while generation zero preserves it", () => {
  const legacyMail = mail({mailId: "mail_forward_malformed"});
  const before = persistentState({legacy_object_key: legacyMail});
  const after = persistentState({
    legacy_object_key: {...legacyMail, readAt: READ_AT},
  });

  const generationZero = planFor(after, before, 0);
  assert.equal(generationZero.kind, "legacy_global_cas");
  assert.equal(
    generationZero.statements.some((statement) => (
      /^INSERT INTO mail_messages\b[\s\S]+ON DUPLICATE KEY UPDATE/i.test(statement)
    )),
    true,
  );
  assert.deepEqual(forwardWriteSet(generationZero).sidecarWrites, []);

  assert.throws(
    () => planFor(after, before),
    (error) => error
      && error.code === "mysql_mail_storage_forward_typed_coverage_invalid",
  );
});

test("conditional mail read is ordered control then identity then physical mail", () => {
  const {before, after} = conditionalReadStates();
  const plan = planFor(after, before, 1, {
    consistencyScope: conditionalReadScope(),
  });

  assert.equal(plan.kind, "mail_read_conditional_v1");
  assert.deepEqual(plan.locks.map(({resource, key}) => [resource, key]), [
    ["mail_storage_control", "mail_lifecycle"],
    ["mail_identity", MAIL_ID],
    ["mail_message", MAIL_ID],
  ]);
  assert.deepEqual(plan.writes.map(({resource, kind}) => [resource, kind]), [
    ["mail_identity", "update"],
    ["mail_message", "update"],
    ["mutation_receipt_capacity", "update"],
    ["mutation_receipt", "insert"],
  ]);
  assert.deepEqual(
    mysqlResourceAcquisitionTrace(plan).map(({resource, stage}) => [resource, stage]),
    [
      ["mail_storage_control", "lock"],
      ["mail_identity", "lock"],
      ["mail_message", "lock"],
      ["mutation_receipt_capacity", "update"],
      ["mutation_receipt", "insert"],
    ],
  );
});

function fakePoolForPlan(plan, options = {}) {
  const state = {
    begun: 0,
    committed: 0,
    rolledBack: 0,
    released: 0,
    events: [],
    queries: [],
  };
  const writeSet = plan.mailForwardWriteSet || null;
  const locks = [
    ...(Array.isArray(plan.locks) ? plan.locks : []),
    ...(Array.isArray(plan.resourceLocks) ? plan.resourceLocks : []),
    ...(writeSet && Array.isArray(writeSet.identityLocks) ? writeSet.identityLocks : []),
  ];
  const writes = plan.kind === "legacy_global_cas"
    ? [
      ...(writeSet ? writeSet.sidecarWrites : []),
      ...(writeSet ? writeSet.mailWrites : []),
    ]
    : (Array.isArray(plan.writes) ? plan.writes : []);
  const pool = {
    async getConnection() {
      state.events.push("acquire");
      return {
        async query(statement, params = []) {
          const sql = typeof statement === "string"
            ? statement
            : String(statement && statement.sql || "");
          if (sql.trim() === MYSQL_SESSION_POLICY_SQL) {
            state.events.push("session_policy");
            return [{affectedRows: 0}, []];
          }
          state.queries.push({sql, params: structuredClone(params)});
          if (/SELECT revision AS storeRevision[\s\S]+scope_key = 'auth'[\s\S]+FOR (?:UPDATE|SHARE)/i.test(sql)) {
            state.events.push("global_revision_lock");
            return [[{storeRevision: 0}], []];
          }
          const lock = locks.find((entry) => (
            entry.sql === sql && isDeepStrictEqual(entry.params, params)
          ));
          if (lock) {
            state.events.push(`lock:${lock.resource}:${lock.key}`);
            if (Array.isArray(lock.expectedRows)) {
              return [structuredClone(lock.expectedRows), []];
            }
            const row = structuredClone(lock.expectedRow);
            if (options.controlMismatch && lock.resource === "mail_storage_control") {
              row.data_generation = Number(row.data_generation) + 1;
            }
            return [[row], []];
          }
          const write = writes.find((entry) => (
            entry.sql === sql && isDeepStrictEqual(entry.params, params)
          ));
          if (write) {
            state.events.push(`write:${write.resource}:${write.kind}:${write.key}`);
            if (
              options.duplicateResource === write.resource
              && write.kind === "insert"
            ) {
              const error = new Error(`duplicate ${write.resource}`);
              error.code = "ER_DUP_ENTRY";
              throw error;
            }
            if (
              options.staleIdentityUpdate
              && write.resource === "mail_identity"
              && write.kind === "update"
            ) {
              return [{affectedRows: 0}, []];
            }
            return [{affectedRows: 1}, []];
          }
          if (/^UPDATE auth_store_revisions SET revision = revision \+ 1[\s\S]+scope_key = 'auth'/i.test(sql.trim())) {
            state.events.push("global_revision_update");
            return [{affectedRows: 1}, []];
          }
          throw new Error(`unmodeled fake-pool SQL: ${sql}`);
        },
        async beginTransaction() {
          state.begun += 1;
          state.events.push("begin");
        },
        async commit() {
          state.committed += 1;
          state.events.push("commit");
        },
        async rollback() {
          state.rolledBack += 1;
          state.events.push("rollback");
        },
        release() {
          state.released += 1;
          state.events.push("release");
        },
        destroy() {
          state.events.push("destroy");
        },
      };
    },
  };
  return {pool, state};
}

function assertRolledBackWithoutCommit(state) {
  assert.equal(state.begun, 1);
  assert.equal(state.rolledBack, 1);
  assert.equal(state.committed, 0);
  assert.equal(state.released, 1);
}

test("fake pool treats control mismatch as non-retryable and commits no sidecar or mail", async () => {
  const {before, after} = legacyInsertStates();
  const plan = planFor(after, before);
  const fixture = fakePoolForPlan(plan, {controlMismatch: true});

  await assert.rejects(
    runMysqlPoolSavePlan(fixture.pool, plan, {expectedRevision: 0}),
    (error) => error
      && error.code === "mysql_mail_storage_runtime_state_changed"
      && error.resource === "mail_storage_control"
      && error.retryable === false
      && error.noCommitGuaranteed === true
      && error.rollbackConfirmed === true,
  );
  assertRolledBackWithoutCommit(fixture.state);
  assert.equal(fixture.state.events.some((event) => event.startsWith("write:")), false);
});

for (const duplicateResource of ["mail_identity", "mail_message"]) {
  test(`fake pool duplicate ${duplicateResource} rolls the complete insert back`, async () => {
    const {before, after} = legacyInsertStates();
    const plan = planFor(after, before);
    const fixture = fakePoolForPlan(plan, {duplicateResource});

    await assert.rejects(
      runMysqlPoolSavePlan(fixture.pool, plan, {expectedRevision: 0}),
      (error) => error
        && error.code === "mysql_resource_revision_conflict"
        && error.resource === duplicateResource
        && error.retryable === true
        && error.noCommitGuaranteed === true
        && error.rollbackConfirmed === true,
    );
    assertRolledBackWithoutCommit(fixture.state);
    assert.equal(
      fixture.state.events.includes("write:mail_active_counter:increment:account_forward_recipient"),
      true,
    );
    if (duplicateResource === "mail_message") {
      assert.equal(
        fixture.state.events.includes("write:mail_identity:insert:mail_forward_writer_1"),
        true,
      );
    }
  });
}

test("fake pool stale identity update rolls back before the physical mail update", async () => {
  const {before, after} = legacyUpdateStates();
  const plan = planFor(after, before);
  const fixture = fakePoolForPlan(plan, {staleIdentityUpdate: true});

  await assert.rejects(
    runMysqlPoolSavePlan(fixture.pool, plan, {expectedRevision: 0}),
    (error) => error
      && error.code === "mysql_resource_revision_conflict"
      && error.resource === "mail_identity"
      && error.resourceKey === MAIL_ID
      && error.noCommitGuaranteed === true
      && error.rollbackConfirmed === true,
  );
  assertRolledBackWithoutCommit(fixture.state);
  assert.equal(
    fixture.state.events.includes("write:mail_message:update:mail_forward_writer_1"),
    false,
  );
});

test("stopped CLI keeps raw control and every exact ROW_COUNT guard in fail-closed order", () => {
  const {before, after} = legacyMixedStates();
  const statements = buildStoppedSaveStatements(
    after,
    before,
    planningOptions(1),
  );
  const index = (pattern) => statements.findIndex((statement) => pattern.test(statement));
  const controlLock = index(/^SELECT scope_key, schema_generation[\s\S]+FROM mail_storage_control[\s\S]+FOR SHARE$/i);
  const controlAssertion = index(/^INSERT INTO auth_store_revisions[\s\S]+NOT EXISTS[\s\S]+FROM mail_storage_control/i);
  const counterIncrement = index(/^UPDATE mail_active_counters\b/i);
  const identityLock = index(/^SELECT mail_id, sender_account_id[\s\S]+FROM mail_identity_registry[\s\S]+FOR UPDATE$/i);
  const identityUpdate = index(/^UPDATE mail_identity_registry\b/i);
  const mailUpdate = index(/^UPDATE mail_messages\b/i);

  assert.equal(statements[0], "START TRANSACTION");
  assert.ok(controlLock > 0);
  assert.equal(controlAssertion, controlLock + 1);
  assert.ok(controlAssertion < counterIncrement);
  assert.equal(statements[counterIncrement + 1], CLI_EXACT_UPDATE_ASSERTION_SQL);
  assert.ok(counterIncrement < identityLock);
  assert.ok(identityLock < identityUpdate);
  assert.equal(statements[identityUpdate + 1], CLI_EXACT_UPDATE_ASSERTION_SQL);
  assert.ok(identityUpdate < mailUpdate);
  assert.equal(statements[mailUpdate + 1], CLI_EXACT_UPDATE_ASSERTION_SQL);
  assert.equal(statements.at(-1), "COMMIT");
});
