"use strict";

const {isDeepStrictEqual} = require("node:util");

const {canonicalMailDocument} = require("./auth/mail-authority-state");
const {
  canonicalRewardVaultEntry,
  deliverRewardVaultEntry,
} = require("./auth/reward-vault-state");
const {projectActiveMailIdentityRow} = require("./mysql-mail-storage-forward-maintenance");
const {
  MYSQL_COMMIT_OUTCOME_AMBIGUOUS,
  checkoutMysqlConnection,
  classifyMysqlTransactionFailure,
  createMysqlTransactionDeadlineController,
  destroyMysqlConnection,
  normalizeMysqlTransactionPolicy,
} = require("./mysql-transaction-guard");

const REWARD_VAULT_DELIVERY_KIND = "beastbound_reward_vault_delivery_batch";
const REWARD_VAULT_DELIVERY_SCHEMA_VERSION = 1;
const REWARD_VAULT_DELIVERY_BATCH_DEFAULT = 32;
const REWARD_VAULT_DELIVERY_BATCH_MAX = 64;
const REWARD_VAULT_NOTIFICATION_ACTIVE_LIMIT = 200;
const MAIL_STORAGE_SCOPE_KEY = "mail_lifecycle";
const TRANSACTION_ISOLATION_SQL = "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ";
const CONTROL_LOCK_SQL = `SELECT scope_key, schema_generation, data_generation,
  lifecycle_state, archive_enabled, vault_claim_enabled, active_limit_enabled
  FROM mail_storage_control WHERE scope_key = ? FOR SHARE`;
const CANDIDATE_SQL = `SELECT reward.reward_id, reward.recipient_account_id
  FROM reward_vault_entries AS reward
  LEFT JOIN mail_active_counters AS counter
    ON counter.recipient_account_id = reward.recipient_account_id
    AND counter.data_generation = 1
  WHERE reward.status = 'available'
  ORDER BY (COALESCE(counter.active_count, 0) >= ${REWARD_VAULT_NOTIFICATION_ACTIVE_LIMIT}) ASC,
    reward.created_at COLLATE utf8mb4_bin, reward.reward_id COLLATE ascii_bin
  LIMIT ?`;
const COUNTER_SEED_SQL = `INSERT INTO mail_active_counters
  (recipient_account_id, active_count, data_generation, revision)
  VALUES (?, 0, 1, 0)
  ON DUPLICATE KEY UPDATE recipient_account_id = VALUES(recipient_account_id)`;
const COUNTER_LOCK_SQL = `SELECT recipient_account_id, active_count, data_generation, revision
  FROM mail_active_counters WHERE recipient_account_id IN (%s)
  ORDER BY recipient_account_id FOR UPDATE`;
const REWARD_LOCK_SQL = `SELECT reward_id, source_key, source_kind, source_digest,
  recipient_account_id, status, created_at, updated_at, delivered_at, claimed_at,
  delivered_mail_id, data_generation, revision, document_json
  FROM reward_vault_entries WHERE reward_id IN (%s)
  ORDER BY reward_id COLLATE ascii_bin FOR UPDATE`;
const IDENTITY_LOCK_SQL = `SELECT mail_id, sender_account_id, recipient_account_id,
  location, created_at, settled_at, archived_at, identity_digest, document_digest,
  reward_id, data_generation, revision
  FROM mail_identity_registry WHERE mail_id IN (%s)
  ORDER BY mail_id COLLATE utf8mb4_bin FOR UPDATE`;
const MAIL_LOCK_SQL = `SELECT mail_id, sender_account_id, recipient_account_id, title,
  created_at, read_at, document_json
  FROM mail_messages WHERE mail_id IN (%s)
  ORDER BY mail_id COLLATE utf8mb4_bin FOR UPDATE`;
const REWARD_DELIVER_SQL = `UPDATE reward_vault_entries
  SET status = 'mail_delivered', updated_at = ?, delivered_at = ?, delivered_mail_id = ?,
    revision = revision + 1
  WHERE reward_id = ? AND source_key = ? AND source_kind = ? AND source_digest = ?
    AND recipient_account_id = ? AND status = 'available' AND created_at = ?
    AND updated_at = ? AND delivered_at IS NULL AND claimed_at IS NULL
    AND delivered_mail_id IS NULL AND data_generation = 1 AND revision = ?
    AND document_json = CAST(? AS JSON) AND revision < 18446744073709551615`;
const IDENTITY_INSERT_SQL = `INSERT INTO mail_identity_registry
  (mail_id, sender_account_id, recipient_account_id, location, created_at,
    settled_at, archived_at, identity_digest, document_digest, reward_id,
    data_generation, revision)
  VALUES (?, ?, ?, 'active', ?, ?, NULL, ?, ?, ?, 1, 0)`;
const MAIL_INSERT_SQL = `INSERT INTO mail_messages
  (mail_id, sender_account_id, recipient_account_id, title, created_at, read_at, document_json)
  VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))`;
const COUNTER_INCREMENT_SQL = `UPDATE mail_active_counters
  SET active_count = active_count + ?, revision = revision + 1
  WHERE recipient_account_id = ? AND data_generation = 1
    AND active_count = ? AND active_count + ? <= ${REWARD_VAULT_NOTIFICATION_ACTIVE_LIMIT}
    AND revision = ? AND revision < 18446744073709551615`;

async function runMysqlRewardVaultDeliveryBatch(pool, options = {}) {
  if (typeof options.certifyAttachment !== "function") {
    throw deliveryError("reward_vault_delivery_attachment_certifier_missing");
  }
  const limit = boundedInteger(
    options.limit,
    REWARD_VAULT_DELIVERY_BATCH_DEFAULT,
    REWARD_VAULT_DELIVERY_BATCH_MAX,
  );
  const deliveredAt = canonicalTimestamp(
    typeof options.now === "function" ? options.now() : new Date(),
  );
  let expected = null;
  try {
    return await runTransaction(pool, options, async (connection) => {
      assertControl(exactRow(await queryRows(connection, CONTROL_LOCK_SQL, [MAIL_STORAGE_SCOPE_KEY])));
      const candidates = canonicalCandidates(await queryRows(connection, CANDIDATE_SQL, [limit]));
      if (candidates.length === 0) {
        return {commit: false, value: report("reward_vault_delivery_batch_empty", [], [], deliveredAt)};
      }
      const recipientIds = sortedUnique(candidates.map((candidate) => candidate.recipientAccountId));
      for (const recipientAccountId of recipientIds) {
        await acceptedWrite(connection, COUNTER_SEED_SQL, [recipientAccountId], [0, 1, 2],
          "reward_vault_delivery_counter_seed_failed");
      }
      const counters = counterMap(await queryRows(
        connection,
        COUNTER_LOCK_SQL.replace("%s", placeholders(recipientIds.length)),
        recipientIds,
      ), recipientIds);
      const rewardIds = candidates.map((candidate) => candidate.rewardId).sort(compareText);
      const rewards = rewardMap(await queryRows(
        connection,
        REWARD_LOCK_SQL.replace("%s", placeholders(rewardIds.length)),
        rewardIds,
      ), options.certifyAttachment);
      const remainingByRecipient = new Map(recipientIds.map((recipientAccountId) => {
        const counter = counters.get(recipientAccountId);
        return [recipientAccountId, Math.max(0, REWARD_VAULT_NOTIFICATION_ACTIVE_LIMIT - counter.activeCount)];
      }));
      const skippedRecipientIds = new Set();
      const facts = [];
      for (const candidate of candidates) {
        const reward = rewards.get(candidate.rewardId);
        if (!reward || reward.status !== "available") continue;
        const remaining = Number(remainingByRecipient.get(candidate.recipientAccountId) || 0);
        if (remaining <= 0) {
          skippedRecipientIds.add(candidate.recipientAccountId);
          continue;
        }
        const mail = rewardNotificationMail(reward, deliveredAt);
        const canonical = canonicalMailDocument(mail, mail.mailId);
        if (!canonical.ok) throw deliveryError("reward_vault_delivery_mail_invalid");
        const attachment = options.certifyAttachment(canonical.mail);
        if (!attachment || attachment.ok !== true) {
          throw deliveryError("reward_vault_delivery_mail_attachment_invalid");
        }
        const identity = projectActiveMailIdentityRow({
          mail: canonical.mail,
          settledAt: deliveredAt,
          rewardId: reward.rewardId,
          revision: 0,
        });
        facts.push({
          reward,
          nextReward: deliverRewardVaultEntry(reward, mail.mailId, deliveredAt, {
            certifyAttachment: options.certifyAttachment,
          }),
          mail: canonical.mail,
          identity,
        });
        remainingByRecipient.set(candidate.recipientAccountId, remaining - 1);
      }
      if (facts.length === 0) {
        return {
          commit: false,
          value: report(
            "reward_vault_delivery_batch_capacity_full",
            [],
            Array.from(skippedRecipientIds),
            deliveredAt,
          ),
        };
      }
      const mailIds = facts.map((fact) => fact.mail.mailId).sort(compareText);
      if ((await queryRows(
        connection,
        IDENTITY_LOCK_SQL.replace("%s", placeholders(mailIds.length)),
        mailIds,
      )).length !== 0 || (await queryRows(
        connection,
        MAIL_LOCK_SQL.replace("%s", placeholders(mailIds.length)),
        mailIds,
      )).length !== 0) {
        throw deliveryError("reward_vault_delivery_mail_identity_conflict");
      }
      const increments = countBy(facts, (fact) => fact.reward.recipientAccountId);
      expected = Object.freeze({facts, counters, increments, deliveredAt});
      for (const fact of facts.sort((left, right) => compareText(left.reward.rewardId, right.reward.rewardId))) {
        await exactWrite(connection, REWARD_DELIVER_SQL, [
          deliveredAt,
          deliveredAt,
          fact.mail.mailId,
          fact.reward.rewardId,
          fact.reward.sourceKey,
          fact.reward.sourceKind,
          fact.reward.sourceDigest,
          fact.reward.recipientAccountId,
          fact.reward.createdAt,
          fact.reward.updatedAt,
          fact.reward.revision,
          JSON.stringify(fact.reward.document),
        ], "reward_vault_delivery_reward_conflict");
      }
      for (const fact of facts.sort((left, right) => compareText(left.mail.mailId, right.mail.mailId))) {
        await exactWrite(connection, IDENTITY_INSERT_SQL, [
          fact.identity.mailId,
          fact.identity.senderAccountId,
          fact.identity.recipientAccountId,
          fact.identity.createdAt,
          fact.identity.settledAt,
          fact.identity.identityDigest,
          fact.identity.documentDigest,
          fact.identity.rewardId,
        ], "reward_vault_delivery_identity_conflict");
        await exactWrite(connection, MAIL_INSERT_SQL, [
          fact.mail.mailId,
          fact.mail.senderAccountId,
          fact.mail.recipientAccountId,
          fact.mail.title,
          fact.mail.createdAt,
          fact.mail.readAt,
          JSON.stringify(fact.mail),
        ], "reward_vault_delivery_mail_conflict");
      }
      for (const [recipientAccountId, incrementBy] of increments) {
        const before = counters.get(recipientAccountId);
        await exactWrite(connection, COUNTER_INCREMENT_SQL, [
          incrementBy,
          recipientAccountId,
          before.activeCount,
          incrementBy,
          before.revision,
        ], "reward_vault_delivery_counter_conflict");
      }
      return {
        commit: true,
        value: report(
          "reward_vault_delivery_batch_ok",
          facts,
          Array.from(skippedRecipientIds),
          deliveredAt,
        ),
      };
    });
  } catch (error) {
    if (!expected || String(error && error.code || "") !== MYSQL_COMMIT_OUTCOME_AMBIGUOUS) throw error;
    return recoverCommit(pool, options, expected);
  }
}

async function recoverCommit(pool, options, expected) {
  try {
    const outcome = await runTransaction(pool, options, async (connection) => {
      assertControl(exactRow(await queryRows(connection, CONTROL_LOCK_SQL, [MAIL_STORAGE_SCOPE_KEY])));
      const rewardIds = expected.facts.map((fact) => fact.reward.rewardId).sort(compareText);
      const mailIds = expected.facts.map((fact) => fact.mail.mailId).sort(compareText);
      const recipientIds = sortedUnique(expected.facts.map((fact) => fact.reward.recipientAccountId));
      const rewards = rewardMap(await queryRows(
        connection,
        REWARD_LOCK_SQL.replace("%s", placeholders(rewardIds.length)),
        rewardIds,
      ), options.certifyAttachment);
      const identities = rowMap(await queryRows(
        connection,
        IDENTITY_LOCK_SQL.replace("%s", placeholders(mailIds.length)),
        mailIds,
      ), "mail_id");
      const mails = rowMap(await queryRows(
        connection,
        MAIL_LOCK_SQL.replace("%s", placeholders(mailIds.length)),
        mailIds,
      ), "mail_id");
      const counters = counterMap(await queryRows(
        connection,
        COUNTER_LOCK_SQL.replace("%s", placeholders(recipientIds.length)),
        recipientIds,
      ), recipientIds);
      const committed = expected.facts.every((fact) => (
        isDeepStrictEqual(rewards.get(fact.reward.rewardId), fact.nextReward)
        && exactIdentityRow(identities.get(fact.mail.mailId), fact.identity)
        && exactMailRow(mails.get(fact.mail.mailId), fact.mail)
      )) && Array.from(expected.increments).every(([recipientAccountId, incrementBy]) => {
        const before = expected.counters.get(recipientAccountId);
        const after = counters.get(recipientAccountId);
        return after.activeCount === before.activeCount + incrementBy
          && after.revision === before.revision + 1;
      });
      const notCommitted = expected.facts.every((fact) => (
        isDeepStrictEqual(rewards.get(fact.reward.rewardId), fact.reward)
        && !identities.has(fact.mail.mailId)
        && !mails.has(fact.mail.mailId)
      )) && Array.from(expected.counters).every(([recipientAccountId, before]) => (
        isDeepStrictEqual(counters.get(recipientAccountId), before)
      ));
      return {commit: false, value: committed ? "committed" : notCommitted ? "not_committed" : "unknown"};
    });
    if (outcome === "committed") {
      return report("reward_vault_delivery_batch_commit_recovered", expected.facts, [], expected.deliveredAt, {
        recovered: true,
      });
    }
    if (outcome === "not_committed") {
      return report("reward_vault_delivery_batch_not_committed", [], [], expected.deliveredAt, {
        ok: false,
        recovered: true,
        retryable: true,
      });
    }
  } catch {}
  return report("reward_vault_delivery_batch_outcome_unknown", [], [], expected.deliveredAt, {
    ok: false,
    outcomeUnknown: true,
  });
}

function rewardNotificationMail(entry, deliveredAt) {
  const digest = entry.rewardId.slice("reward_".length);
  return Object.freeze({
    mailId: `mail_reward_${digest}`,
    mailKind: "reward_vault_notice",
    rewardVaultId: entry.rewardId,
    senderAccountId: "system_reward_vault",
    senderUsername: "reward_vault",
    senderDisplayName: "奖励仓",
    recipientAccountId: entry.recipientAccountId,
    recipientUsername: entry.document.recipientUsername,
    recipientDisplayName: entry.document.recipientDisplayName,
    title: "奖励已存入奖励仓",
    body: `${entry.document.title}\n奖励资产已安全保存在奖励仓中，请前往奖励仓查看并领取。`,
    items: [],
    equipmentEnvelopes: [],
    currency: {},
    createdAt: deliveredAt,
    readAt: null,
    settledAt: deliveredAt,
    schemaVersion: 2,
  });
}

function report(code, facts, skippedRecipientIds, deliveredAt, options = {}) {
  const delivered = (Array.isArray(facts) ? [...facts] : [])
    .sort((left, right) => compareText(left.reward.rewardId, right.reward.rewardId));
  return Object.freeze({
    kind: REWARD_VAULT_DELIVERY_KIND,
    schemaVersion: REWARD_VAULT_DELIVERY_SCHEMA_VERSION,
    ok: options.ok !== false,
    code,
    deliveredCount: delivered.length,
    deliveredRewardIds: delivered.map((fact) => fact.reward.rewardId),
    deliveredMailIds: delivered.map((fact) => fact.mail.mailId),
    deliveredMails: delivered.map((fact) => structuredClone(fact.mail)),
    skippedRecipientCount: sortedUnique(skippedRecipientIds).length,
    deliveredAt,
    recovered: options.recovered === true,
    outcomeUnknown: options.outcomeUnknown === true,
    retryable: options.retryable === true,
  });
}

function canonicalCandidates(rows) {
  const result = [];
  const seen = new Set();
  for (const row of rows) {
    const rewardId = String(row && row.reward_id || "");
    const recipientAccountId = String(row && row.recipient_account_id || "");
    if (!/^reward_[a-f0-9]{64}$/.test(rewardId) || !canonicalId(recipientAccountId, 80) || seen.has(rewardId)) {
      throw deliveryError("reward_vault_delivery_candidate_rows_invalid");
    }
    seen.add(rewardId);
    result.push({rewardId, recipientAccountId});
  }
  return result;
}

function rewardMap(rows, certifyAttachment) {
  const result = new Map();
  for (const row of rows) {
    const entry = canonicalRewardVaultEntry({
      rewardId: String(row && row.reward_id || ""),
      sourceKey: String(row && row.source_key || ""),
      sourceKind: String(row && row.source_kind || ""),
      sourceDigest: String(row && row.source_digest || ""),
      recipientAccountId: String(row && row.recipient_account_id || ""),
      status: String(row && row.status || ""),
      createdAt: String(row && row.created_at || ""),
      updatedAt: String(row && row.updated_at || ""),
      deliveredAt: nullableText(row && row.delivered_at),
      claimedAt: nullableText(row && row.claimed_at),
      deliveredMailId: nullableText(row && row.delivered_mail_id),
      dataGeneration: Number(row && row.data_generation),
      revision: Number(row && row.revision),
      document: parseJson(row && row.document_json),
    }, String(row && row.reward_id || ""), {certifyAttachment});
    if (result.has(entry.rewardId)) throw deliveryError("reward_vault_delivery_reward_rows_invalid");
    result.set(entry.rewardId, entry);
  }
  return result;
}

function counterMap(rows, expectedIds) {
  const result = new Map();
  for (const row of rows) {
    const recipientAccountId = String(row && row.recipient_account_id || "");
    const value = {
      recipientAccountId,
      activeCount: Number(row && row.active_count),
      dataGeneration: Number(row && row.data_generation),
      revision: Number(row && row.revision),
    };
    if (!canonicalId(recipientAccountId, 80)
      || !Number.isSafeInteger(value.activeCount) || value.activeCount < 0
      || value.dataGeneration !== 1
      || !Number.isSafeInteger(value.revision) || value.revision < 0
      || result.has(recipientAccountId)) {
      throw deliveryError("reward_vault_delivery_counter_rows_invalid");
    }
    result.set(recipientAccountId, value);
  }
  if (expectedIds.some((id) => !result.has(id)) || result.size !== expectedIds.length) {
    throw deliveryError("reward_vault_delivery_counter_rows_invalid");
  }
  return result;
}

function assertControl(row) {
  if (String(row && row.scope_key || "") !== MAIL_STORAGE_SCOPE_KEY
    || Number(row && row.schema_generation) !== 1
    || Number(row && row.data_generation) !== 1
    || String(row && row.lifecycle_state || "") !== "ready"
    || ![0, 1].includes(Number(row && row.archive_enabled))
    || Number(row && row.vault_claim_enabled) !== 1
    || ![0, 1].includes(Number(row && row.active_limit_enabled))) {
    throw deliveryError("reward_vault_delivery_feature_disabled_or_drifted");
  }
}

function exactIdentityRow(row, identity) {
  return Boolean(row) && isDeepStrictEqual({
    mailId: String(row.mail_id || ""),
    senderAccountId: String(row.sender_account_id || ""),
    recipientAccountId: String(row.recipient_account_id || ""),
    location: String(row.location || ""),
    createdAt: String(row.created_at || ""),
    settledAt: nullableText(row.settled_at),
    archivedAt: nullableText(row.archived_at),
    identityDigest: String(row.identity_digest || ""),
    documentDigest: String(row.document_digest || ""),
    rewardId: nullableText(row.reward_id),
    dataGeneration: Number(row.data_generation),
    revision: Number(row.revision),
  }, identity);
}

function exactMailRow(row, mail) {
  return Boolean(row)
    && String(row.mail_id || "") === mail.mailId
    && String(row.sender_account_id || "") === mail.senderAccountId
    && String(row.recipient_account_id || "") === mail.recipientAccountId
    && String(row.title || "") === mail.title
    && String(row.created_at || "") === mail.createdAt
    && nullableText(row.read_at) === mail.readAt
    && isDeepStrictEqual(parseJson(row.document_json), mail);
}

async function runTransaction(pool, options, execute) {
  const policy = normalizeMysqlTransactionPolicy(options.transactionPolicy);
  const guardOptions = objectOrEmpty(options.transactionGuardOptions);
  const connection = await checkoutMysqlConnection(pool, policy, guardOptions);
  let deadline;
  try {
    deadline = createMysqlTransactionDeadlineController(connection, policy, guardOptions);
  } catch (error) {
    safeRelease(connection, error);
    throw error;
  }
  let started = false;
  let reusable = true;
  try {
    await deadline.track(operation(connection, "query", [TRANSACTION_ISOLATION_SQL]));
    await deadline.track(operation(connection, "beginTransaction"));
    started = true;
    const outcome = await execute(deadlineConnection(connection, deadline));
    if (!outcome || typeof outcome.commit !== "boolean" || !Object.hasOwn(outcome, "value")) {
      throw deliveryError("reward_vault_delivery_transaction_result_invalid");
    }
    if (!outcome.commit) {
      await deadline.track(operation(connection, "rollback"), {classifyFailure: false});
      started = false;
      deadline.complete();
      return outcome.value;
    }
    deadline.markCommitDispatched();
    await deadline.track(operation(connection, "commit"));
    started = false;
    deadline.complete();
    return outcome.value;
  } catch (caught) {
    let error = caught;
    const commitDispatched = deadline.isCommitDispatched();
    const terminated = deadline.isFinished();
    if (commitDispatched) {
      reusable = false;
      if (!terminated) destroyMysqlConnection(connection, error);
      error = classifyMysqlTransactionFailure(error, {commitDispatched: true});
    } else if (started && !(terminated && error && error.timeout === true)) {
      try {
        await deadline.track(operation(connection, "rollback"), {classifyFailure: false});
        error = classifyMysqlTransactionFailure(error, {rollbackCompleted: true});
      } catch (rollbackError) {
        error.rollbackCause = rollbackError;
        reusable = false;
        if (!deadline.isFinished()) destroyMysqlConnection(connection, rollbackError);
      }
    } else {
      reusable = false;
      if (!terminated) destroyMysqlConnection(connection, error);
      error = classifyMysqlTransactionFailure(error, {commitDispatched: false});
    }
    throw error;
  } finally {
    deadline.complete();
    if (reusable) safeRelease(connection);
  }
}

function deadlineConnection(connection, deadline) {
  return Object.freeze({
    query(...args) {
      return deadline.track(Promise.resolve().then(() => connection.query(...args)), {
        classifyFailure: false,
      });
    },
  });
}

function operation(connection, method, args = []) {
  try { return Promise.resolve(connection[method](...args)); } catch (error) { return Promise.reject(error); }
}

async function queryRows(connection, sql, params = []) {
  const result = await connection.query(sql, params);
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  if (!Array.isArray(rows)) throw deliveryError("reward_vault_delivery_query_result_invalid");
  return rows;
}

async function exactWrite(connection, sql, params, code) {
  return acceptedWrite(connection, sql, params, [1], code);
}

async function acceptedWrite(connection, sql, params, accepted, code) {
  let result;
  try { result = await connection.query(sql, params); } catch (error) {
    if (error && error.code === "ER_DUP_ENTRY") throw deliveryError(code);
    throw error;
  }
  const header = Array.isArray(result) ? result[0] : result;
  if (!accepted.includes(Number(header && header.affectedRows))) throw deliveryError(code);
}

function rowMap(rows, field) {
  const result = new Map();
  for (const row of rows) {
    const key = String(row && row[field] || "");
    if (key === "" || result.has(key)) throw deliveryError("reward_vault_delivery_rows_invalid");
    result.set(key, row);
  }
  return result;
}

function countBy(values, keyFor) {
  const result = new Map();
  for (const value of values) {
    const key = keyFor(value);
    result.set(key, Number(result.get(key) || 0) + 1);
  }
  return new Map(Array.from(result).sort(([left], [right]) => compareText(left, right)));
}

function exactRow(rows) {
  if (rows.length !== 1) throw deliveryError("reward_vault_delivery_control_row_invalid");
  return rows[0];
}

function parseJson(value) {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { throw deliveryError("reward_vault_delivery_json_invalid"); }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw deliveryError("reward_vault_delivery_json_invalid");
  }
  return structuredClone(parsed);
}

function canonicalTimestamp(value) {
  const candidate = value instanceof Date ? value.toISOString() : String(value || "");
  const time = Date.parse(candidate);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== candidate) {
    throw deliveryError("reward_vault_delivery_time_invalid");
  }
  return candidate;
}

function boundedInteger(value, fallback, maximum) {
  const candidate = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > maximum) {
    throw deliveryError("reward_vault_delivery_limit_invalid");
  }
  return candidate;
}

function canonicalId(value, maxLength) {
  return typeof value === "string" && value !== "" && value === value.trim()
    && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value);
}

function placeholders(count) {
  if (!Number.isSafeInteger(count) || count < 1 || count > REWARD_VAULT_DELIVERY_BATCH_MAX) {
    throw deliveryError("reward_vault_delivery_placeholder_count_invalid");
  }
  return Array(count).fill("?").join(", ");
}

function sortedUnique(values) {
  return Array.from(new Set(values.map(String))).sort(compareText);
}

function nullableText(value) {
  return value === null || value === undefined ? null : String(value);
}

function compareText(left, right) {
  return left === right ? 0 : left < right ? -1 : 1;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeRelease(connection, primaryError = null) {
  try { connection.release(); } catch (error) {
    destroyMysqlConnection(connection, error);
    if (primaryError) primaryError.releaseCause = error;
  }
}

function deliveryError(code) {
  const error = new Error("奖励仓通知投递未满足安全合同，奖励资产仍保留在奖励仓中。");
  error.code = String(code || "reward_vault_delivery_failed");
  return error;
}

module.exports = {
  REWARD_VAULT_DELIVERY_BATCH_MAX,
  REWARD_VAULT_DELIVERY_KIND,
  REWARD_VAULT_DELIVERY_SCHEMA_VERSION,
  REWARD_VAULT_NOTIFICATION_ACTIVE_LIMIT,
  rewardNotificationMail,
  runMysqlRewardVaultDeliveryBatch,
};
