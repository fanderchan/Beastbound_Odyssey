"use strict";

const {isDeepStrictEqual} = require("node:util");

const {
  canonicalMailArchivePageResult,
  encodeMailArchiveCursor,
  normalizeMailArchivePageOptions,
} = require("./auth/mail-archive-pagination");
const {canonicalMailDocument} = require("./auth/mail-authority-state");
const {
  canonicalMailLifecycleIsoTimestamp,
  readMailLifecycleState,
} = require("./auth/mail-lifecycle-state");
const {
  projectActiveMailIdentityRow,
} = require("./mysql-mail-storage-forward-maintenance");
const {
  MYSQL_COMMIT_OUTCOME_AMBIGUOUS,
  MYSQL_TRANSACTION_ROLLED_BACK,
  checkoutMysqlConnection,
  classifyMysqlTransactionFailure,
  createMysqlTransactionDeadlineController,
  destroyMysqlConnection,
  normalizeMysqlTransactionPolicy,
} = require("./mysql-transaction-guard");

const MAIL_ARCHIVE_AFTER_DAYS = 30;
const MAIL_ARCHIVE_BATCH_DEFAULT = 64;
const MAIL_ARCHIVE_BATCH_MAX = 128;
const MAIL_ARCHIVE_KIND = "beastbound_mail_archive_batch";
const MAIL_ARCHIVE_SCHEMA_VERSION = 1;
const MAIL_STORAGE_SCOPE_KEY = "mail_lifecycle";
const MAIL_STORAGE_DATA_GENERATION = 1;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const TRANSACTION_ISOLATION_SQL = "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ";
const CONTROL_LOCK_SQL = `SELECT scope_key, schema_generation, data_generation,
  lifecycle_state, archive_enabled, vault_claim_enabled, active_limit_enabled
  FROM mail_storage_control WHERE scope_key = ? FOR SHARE`;
const CONTROL_CURRENT_SQL = `SELECT scope_key, schema_generation, data_generation,
  lifecycle_state, archive_enabled, vault_claim_enabled, active_limit_enabled
  FROM mail_storage_control WHERE scope_key = ? FOR UPDATE`;
const CANDIDATE_SQL = `SELECT mail_id, recipient_account_id
  FROM mail_identity_registry
  WHERE location = 'active' AND settled_at IS NOT NULL AND settled_at <= ?
  ORDER BY settled_at COLLATE utf8mb4_bin, mail_id COLLATE utf8mb4_bin
  LIMIT ?`;
const COUNTER_LOCK_SQL = `SELECT recipient_account_id, active_count, data_generation, revision
  FROM mail_active_counters WHERE recipient_account_id IN (%s)
  ORDER BY recipient_account_id FOR UPDATE`;
const IDENTITY_LOCK_SQL = `SELECT mail_id, sender_account_id, recipient_account_id,
  location, created_at, settled_at, archived_at, identity_digest, document_digest,
  reward_id, data_generation, revision
  FROM mail_identity_registry WHERE mail_id IN (%s)
  ORDER BY mail_id COLLATE utf8mb4_bin FOR UPDATE`;
const PAGE_IDENTITY_SQL = `SELECT mail_id, sender_account_id, recipient_account_id,
  location, created_at, settled_at, archived_at, identity_digest, document_digest,
  reward_id, data_generation, revision
  FROM mail_identity_registry WHERE mail_id IN (%s)
  ORDER BY mail_id`;
const MAIL_LOCK_SQL = `SELECT mail_id, sender_account_id, recipient_account_id, title,
  created_at, read_at, document_json
  FROM mail_messages WHERE mail_id IN (%s)
  ORDER BY mail_id COLLATE utf8mb4_bin FOR UPDATE`;
const ARCHIVE_INSERT_SQL = `INSERT INTO mail_archive_messages
  (mail_id, sender_account_id, recipient_account_id, title, created_at, read_at,
   settled_at, archived_at, archive_generation, document_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CAST(? AS JSON))`;
const IDENTITY_ARCHIVE_SQL = `UPDATE mail_identity_registry
  SET location = 'archive', archived_at = ?, revision = revision + 1
  WHERE mail_id = ? AND sender_account_id = ? AND recipient_account_id = ?
    AND location = 'active' AND created_at = ? AND settled_at = ?
    AND archived_at IS NULL AND identity_digest = ? AND document_digest = ?
    AND reward_id <=> ? AND data_generation = 1 AND revision = ?
    AND revision < 18446744073709551615`;
const ACTIVE_MAIL_DELETE_SQL = `DELETE FROM mail_messages
  WHERE mail_id = ? AND sender_account_id = ? AND recipient_account_id = ?
    AND title = ? AND created_at = ? AND read_at <=> ?
    AND document_json = CAST(? AS JSON)`;
const COUNTER_DECREMENT_SQL = `UPDATE mail_active_counters
  SET active_count = active_count - ?, revision = revision + 1
  WHERE recipient_account_id = ? AND data_generation = 1
    AND active_count = ? AND active_count >= ?
    AND revision = ? AND revision < 18446744073709551615`;
const RECOVERY_IDENTITY_SQL = `SELECT mail_id, sender_account_id, recipient_account_id,
  location, created_at, settled_at, archived_at, identity_digest, document_digest,
  reward_id, data_generation, revision
  FROM mail_identity_registry WHERE mail_id IN (%s)
  ORDER BY mail_id COLLATE utf8mb4_bin FOR UPDATE`;
const RECOVERY_ACTIVE_SQL = `SELECT mail_id, sender_account_id, recipient_account_id, title,
  created_at, read_at, document_json
  FROM mail_messages WHERE mail_id IN (%s)
  ORDER BY mail_id COLLATE utf8mb4_bin FOR UPDATE`;
const RECOVERY_ARCHIVE_SQL = `SELECT mail_id, sender_account_id, recipient_account_id, title,
  created_at, read_at, settled_at, archived_at, archive_generation, document_json
  FROM mail_archive_messages WHERE mail_id IN (%s)
  ORDER BY mail_id COLLATE utf8mb4_bin FOR UPDATE`;
const RECOVERY_COUNTER_SQL = `SELECT recipient_account_id, active_count, data_generation, revision
  FROM mail_active_counters WHERE recipient_account_id IN (%s)
  ORDER BY recipient_account_id FOR UPDATE`;

function canonicalMailArchiveCutoff(nowValue) {
  const now = canonicalTimestamp(nowValue, "mail_archive_now_invalid");
  return new Date(Date.parse(now) - MAIL_ARCHIVE_AFTER_DAYS * MILLISECONDS_PER_DAY).toISOString();
}

function certifyMailArchiveEligibility(options = {}) {
  if (typeof options.certifyAttachment !== "function") {
    throw archiveError("mail_archive_attachment_certifier_missing");
  }
  const archivedAt = canonicalTimestamp(options.archivedAt, "mail_archive_now_invalid");
  const cutoffAt = canonicalTimestamp(options.cutoffAt, "mail_archive_cutoff_invalid");
  return certifyArchiveFact({
    identity: options.identityRow,
    mailRow: options.mailRow,
    cutoffAt,
    archivedAt,
    certifyAttachment: options.certifyAttachment,
  });
}

function classifyMailArchiveRecoveryForTest(expectedValue, observedValue) {
  return classifyRecovery(expectedValue, observedValue);
}

function normalizeMysqlMailArchivePageRequest(accountIdValue, optionsValue) {
  const recipientAccountId = canonicalId(accountIdValue, 80);
  if (recipientAccountId === "") {
    throw archiveError("mysql_mail_archive_page_request_invalid");
  }
  const options = normalizeMailArchivePageOptions(optionsValue, {requireExplicitLimit: true});
  return {recipientAccountId, limit: options.limit, cursor: options.cursor};
}

async function runMysqlMailArchivePageRead(pool, accountIdValue, optionsValue, options = {}) {
  const request = normalizeMysqlMailArchivePageRequest(accountIdValue, optionsValue);
  if (typeof options.certifyAttachment !== "function") {
    throw archiveError("mail_archive_attachment_certifier_missing");
  }
  return runReadTransaction(pool, options, async (connection) => {
    const control = exactControlRow(await queryRows(connection, CONTROL_LOCK_SQL, [MAIL_STORAGE_SCOPE_KEY]));
    assertArchiveControl(control, {enabled: true});
    const cursorSql = request.cursor === null
      ? ""
      : " AND (created_at < ? OR (created_at = ? AND mail_id < ?))";
    const params = request.cursor === null
      ? [request.recipientAccountId, request.limit + 1]
      : [
        request.recipientAccountId,
        request.cursor.createdAt,
        request.cursor.createdAt,
        request.cursor.mailId,
        request.limit + 1,
      ];
    const rows = await queryRows(connection, `SELECT mail_id, sender_account_id,
      recipient_account_id, title, created_at, read_at, settled_at, archived_at,
      archive_generation, document_json
      FROM mail_archive_messages
      WHERE recipient_account_id = ?${cursorSql}
      ORDER BY created_at DESC, mail_id DESC
      LIMIT ?`, params);
    if (rows.length > request.limit + 1) {
      throw archiveError("mysql_mail_archive_page_row_limit_invalid");
    }
    const certified = rows.map((row) => archivePageEntryFromRow(
      row,
      request.recipientAccountId,
      options.certifyAttachment,
    ));
    if (certified.length > 0) {
      const mailIds = certified.map((entry) => entry.mail.mailId);
      const identityRows = await queryRows(
        connection,
        PAGE_IDENTITY_SQL.replace("%s", placeholders(mailIds.length)),
        mailIds,
      );
      const identityByMailId = strictRowMap(
        identityRows,
        "mail_id",
        mailIds,
        "mysql_mail_archive_page_identity_rows_invalid",
      );
      for (const entry of certified) {
        certifyArchivedPageIdentity(identityByMailId.get(entry.mail.mailId), entry);
      }
    }
    const hasMore = certified.length > request.limit;
    const archiveRows = hasMore ? certified.slice(0, request.limit) : certified;
    const last = archiveRows[archiveRows.length - 1] || null;
    const nextCursor = hasMore
      ? encodeMailArchiveCursor({createdAt: last.mail.createdAt, mailId: last.mail.mailId})
      : null;
    return canonicalMailArchivePageResult({
      recipientAccountId: request.recipientAccountId,
      archiveRows,
      nextCursor,
      hasMore,
    }, request.recipientAccountId, {
      limit: request.limit,
      cursor: request.cursor,
    }, {trustStoreOrder: true});
  });
}

async function runMysqlMailArchiveBatch(pool, options = {}) {
  if (typeof options.certifyAttachment !== "function") {
    throw archiveError("mail_archive_attachment_certifier_missing");
  }
  const batchLimit = boundedInteger(options.limit, MAIL_ARCHIVE_BATCH_DEFAULT, MAIL_ARCHIVE_BATCH_MAX);
  const archivedAt = canonicalTimestamp(
    typeof options.now === "function" ? options.now() : new Date(),
    "mail_archive_now_invalid",
  );
  const cutoffAt = canonicalMailArchiveCutoff(archivedAt);
  let expected = null;
  try {
    return await runTransaction(pool, options, async (connection) => {
      const control = exactControlRow(await queryRows(connection, CONTROL_LOCK_SQL, [MAIL_STORAGE_SCOPE_KEY]));
      assertArchiveControl(control, {enabled: true});
      const candidates = await queryRows(connection, CANDIDATE_SQL, [cutoffAt, batchLimit]);
      const candidateFacts = canonicalCandidateFacts(candidates);
      if (candidateFacts.length === 0) {
        return {
          commit: false,
          value: batchReport({
            code: "mail_archive_batch_empty",
            cutoffAt,
            archivedAt,
            archived: [],
          }),
        };
      }
      const recipientIds = sortedUnique(candidateFacts.map((entry) => entry.recipientAccountId));
      const counters = await queryRows(
        connection,
        COUNTER_LOCK_SQL.replace("%s", placeholders(recipientIds.length)),
        recipientIds,
      );
      const counterByRecipient = certifyCounters(counters, recipientIds);
      const mailIds = candidateFacts.map((entry) => entry.mailId);
      const identities = await queryRows(
        connection,
        IDENTITY_LOCK_SQL.replace("%s", placeholders(mailIds.length)),
        mailIds,
      );
      const identityByMailId = strictRowMap(identities, "mail_id", mailIds, "mail_archive_identity_rows_invalid");
      for (const candidate of candidateFacts) {
        const identity = identityFromRow(identityByMailId.get(candidate.mailId));
        if (identity.recipientAccountId !== candidate.recipientAccountId) {
          throw archiveError("mail_archive_candidate_identity_drift");
        }
      }
      // Candidate discovery is intentionally non-locking so the global lock
      // order remains control -> counter -> identity -> active mail. Another
      // Node may finish the same archive while this Node waits on a counter;
      // an exact archived identity is therefore a proven skip, not corruption.
      const activeMailIds = mailIds.filter((mailId) => {
        const identity = identityFromRow(identityByMailId.get(mailId));
        if (identity.location === "active") return true;
        if (settledArchivedIdentity(identity)) return false;
        throw archiveError("mail_archive_identity_drift");
      });
      const activeMailIdSet = new Set(activeMailIds);
      const concurrentArchivedMailIds = mailIds.filter((mailId) => !activeMailIdSet.has(mailId));
      const mailRows = await queryRows(
        connection,
        MAIL_LOCK_SQL.replace("%s", placeholders(mailIds.length)),
        mailIds,
      );
      const mailByMailId = rowMap(mailRows, "mail_id");
      if (
        mailByMailId.size !== activeMailIds.length
        || activeMailIds.some((mailId) => !mailByMailId.has(mailId))
        || concurrentArchivedMailIds.some((mailId) => mailByMailId.has(mailId))
      ) {
        throw archiveError("mail_archive_active_rows_invalid");
      }
      if (concurrentArchivedMailIds.length > 0) {
        const archiveRows = await queryRows(
          connection,
          RECOVERY_ARCHIVE_SQL.replace("%s", placeholders(concurrentArchivedMailIds.length)),
          concurrentArchivedMailIds,
        );
        certifyConcurrentArchivedFacts({
          mailIds: concurrentArchivedMailIds,
          identityByMailId,
          archiveRows,
          cutoffAt,
          certifyAttachment: options.certifyAttachment,
        });
      }
      if (activeMailIds.length === 0) {
        return {
          commit: false,
          value: batchReport({
            code: "mail_archive_batch_concurrent_noop",
            cutoffAt,
            archivedAt,
            archived: [],
            retiredMailIds: concurrentArchivedMailIds,
          }),
        };
      }
      const archiveFacts = activeMailIds.map((mailId) => certifyArchiveFact({
        identity: identityByMailId.get(mailId),
        mailRow: mailByMailId.get(mailId),
        cutoffAt,
        archivedAt,
        certifyAttachment: options.certifyAttachment,
      }));
      const decrementByRecipient = countBy(archiveFacts, (fact) => fact.recipientAccountId);
      for (const [recipientAccountId, decrementBy] of decrementByRecipient) {
        const counter = counterByRecipient.get(recipientAccountId);
        if (counter.activeCount < decrementBy) {
          throw archiveError("mail_archive_counter_underflow");
        }
      }
      expected = deepFreeze({
        cutoffAt,
        archivedAt,
        archiveFacts,
        concurrentArchivedMailIds,
        counters: Array.from(decrementByRecipient, ([recipientAccountId, decrementBy]) => {
          const before = counterByRecipient.get(recipientAccountId);
          return {
            recipientAccountId,
            decrementBy,
            before,
            after: {
              recipientAccountId,
              activeCount: before.activeCount - decrementBy,
              dataGeneration: MAIL_STORAGE_DATA_GENERATION,
              revision: before.revision + 1,
            },
          };
        }),
      });

      for (const fact of archiveFacts) {
        await exactWrite(connection, ARCHIVE_INSERT_SQL, [
          fact.mail.mailId,
          fact.mail.senderAccountId,
          fact.mail.recipientAccountId,
          fact.mail.title,
          fact.mail.createdAt,
          fact.mail.readAt ?? null,
          fact.settledAt,
          archivedAt,
          fact.documentJson,
        ], "mail_archive_insert_conflict");
        await exactWrite(connection, IDENTITY_ARCHIVE_SQL, [
          archivedAt,
          fact.mail.mailId,
          fact.mail.senderAccountId,
          fact.mail.recipientAccountId,
          fact.mail.createdAt,
          fact.settledAt,
          fact.identity.identityDigest,
          fact.identity.documentDigest,
          fact.identity.rewardId,
          fact.identity.revision,
        ], "mail_archive_identity_update_conflict");
        await exactWrite(connection, ACTIVE_MAIL_DELETE_SQL, [
          fact.mail.mailId,
          fact.mail.senderAccountId,
          fact.mail.recipientAccountId,
          fact.mail.title,
          fact.mail.createdAt,
          fact.mail.readAt ?? null,
          fact.documentJson,
        ], "mail_archive_active_delete_conflict");
      }
      for (const counter of expected.counters) {
        await exactWrite(connection, COUNTER_DECREMENT_SQL, [
          counter.decrementBy,
          counter.recipientAccountId,
          counter.before.activeCount,
          counter.decrementBy,
          counter.before.revision,
        ], "mail_archive_counter_update_conflict");
      }
      return {
        commit: true,
        value: batchReport({
          code: "mail_archive_batch_ok",
          cutoffAt,
          archivedAt,
          archived: archiveFacts,
          retiredMailIds: [...concurrentArchivedMailIds, ...activeMailIds],
        }),
      };
    });
  } catch (error) {
    if (!expected || String(error && error.code || "") !== MYSQL_COMMIT_OUTCOME_AMBIGUOUS) {
      throw error;
    }
    return recoverArchiveCommit(pool, options, expected);
  }
}

async function recoverArchiveCommit(pool, options, expected) {
  try {
    const outcome = await runTransaction(pool, options, async (connection) => {
      const control = exactControlRow(await queryRows(
        connection,
        CONTROL_CURRENT_SQL,
        [MAIL_STORAGE_SCOPE_KEY],
      ));
      assertArchiveControl(control, {enabled: true});
      const mailIds = expected.archiveFacts.map((fact) => fact.mail.mailId);
      const allMailIds = sortedUnique([...mailIds, ...expected.concurrentArchivedMailIds]);
      const recipients = expected.counters.map((counter) => counter.recipientAccountId);
      const counterRows = await queryRows(
        connection,
        RECOVERY_COUNTER_SQL.replace("%s", placeholders(recipients.length)),
        recipients,
      );
      const identityRows = await queryRows(
        connection,
        RECOVERY_IDENTITY_SQL.replace("%s", placeholders(allMailIds.length)),
        allMailIds,
      );
      const activeRows = await queryRows(
        connection,
        RECOVERY_ACTIVE_SQL.replace("%s", placeholders(allMailIds.length)),
        allMailIds,
      );
      const archiveRows = await queryRows(
        connection,
        RECOVERY_ARCHIVE_SQL.replace("%s", placeholders(allMailIds.length)),
        allMailIds,
      );
      const identityByMailId = strictRowMap(
        identityRows,
        "mail_id",
        allMailIds,
        "mail_archive_recovery_identity_invalid",
      );
      const activeByMailId = rowMap(activeRows, "mail_id");
      const archiveByMailId = rowMap(archiveRows, "mail_id");
      if (expected.concurrentArchivedMailIds.some((mailId) => activeByMailId.has(mailId))) {
        throw archiveError("mail_archive_recovery_concurrent_active_invalid");
      }
      if (expected.concurrentArchivedMailIds.length > 0) {
        certifyConcurrentArchivedFacts({
          mailIds: expected.concurrentArchivedMailIds,
          identityByMailId,
          archiveRows: expected.concurrentArchivedMailIds.map((mailId) => archiveByMailId.get(mailId)),
          cutoffAt: expected.cutoffAt,
          certifyAttachment: options.certifyAttachment,
        });
      }
      return {
        commit: false,
        value: classifyRecovery(expected, {
          identityRows: mailIds.map((mailId) => identityByMailId.get(mailId)),
          activeRows: activeRows.filter((row) => mailIds.includes(String(row && row.mail_id || ""))),
          archiveRows: archiveRows.filter((row) => mailIds.includes(String(row && row.mail_id || ""))),
          counterRows,
        }),
      };
    });
    if (outcome === "committed") {
      return batchReport({
        code: "mail_archive_batch_commit_recovered",
        cutoffAt: expected.cutoffAt,
        archivedAt: expected.archivedAt,
        archived: expected.archiveFacts,
        retiredMailIds: [
          ...expected.concurrentArchivedMailIds,
          ...expected.archiveFacts.map((fact) => fact.mail.mailId),
        ],
        recovered: true,
      });
    }
    if (outcome === "not_committed") {
      return batchReport({
        code: "mail_archive_batch_not_committed",
        cutoffAt: expected.cutoffAt,
        archivedAt: expected.archivedAt,
        archived: [],
        retiredMailIds: expected.concurrentArchivedMailIds,
        ok: false,
        recovered: true,
        retryable: true,
      });
    }
  } catch {
    // Fall through to the fixed unknown outcome below. Recovery must never
    // convert an uncertain current read into permission for a blind retry.
  }
  return batchReport({
    code: "mail_archive_batch_commit_outcome_unknown",
    cutoffAt: expected.cutoffAt,
    archivedAt: expected.archivedAt,
    archived: [],
    retiredMailIds: [],
    ok: false,
    outcomeUnknown: true,
  });
}

function classifyRecovery(expected, observed) {
  const mailIds = expected.archiveFacts.map((fact) => fact.mail.mailId);
  const identities = strictRowMap(
    observed.identityRows,
    "mail_id",
    mailIds,
    "mail_archive_recovery_identity_invalid",
  );
  const active = rowMap(observed.activeRows, "mail_id");
  const archive = rowMap(observed.archiveRows, "mail_id");
  const counters = rowMap(observed.counterRows, "recipient_account_id");
  const committed = expected.archiveFacts.every((fact) => (
    !active.has(fact.mail.mailId)
    && exactArchivedIdentity(identities.get(fact.mail.mailId), fact, expected.archivedAt)
    && exactArchiveRow(archive.get(fact.mail.mailId), fact, expected.archivedAt)
  )) && expected.counters.every((counter) => exactCounter(
    counters.get(counter.recipientAccountId),
    counter.after,
  ));
  if (committed) return "committed";
  const notCommitted = expected.archiveFacts.every((fact) => (
    !archive.has(fact.mail.mailId)
    && exactActiveIdentity(identities.get(fact.mail.mailId), fact)
    && exactActiveMailRow(active.get(fact.mail.mailId), fact)
  )) && expected.counters.every((counter) => exactCounter(
    counters.get(counter.recipientAccountId),
    counter.before,
  ));
  return notCommitted ? "not_committed" : "unknown";
}

function certifyArchiveFact({identity, mailRow, cutoffAt, archivedAt, certifyAttachment}) {
  const mailId = String(mailRow && mailRow.mail_id || identity && identity.mail_id || "");
  const mail = mailDocumentFromActiveRow(mailRow, mailId);
  let attachment;
  try {
    attachment = certifyAttachment(mail);
  } catch {
    throw archiveError("mail_archive_attachment_certifier_failed");
  }
  const lifecycle = readMailLifecycleState(mail, attachment);
  const settledAt = lifecycle && lifecycle.settled === true
    ? lifecycle.settledAt
    : null;
  if (
    !lifecycle.ok
    || lifecycle.hasAssets !== false
    || settledAt === null
    || settledAt > cutoffAt
    || Date.parse(archivedAt) < Date.parse(settledAt)
  ) {
    throw archiveError("mail_archive_mail_not_eligible");
  }
  const canonicalIdentity = identityFromRow(identity);
  const projected = projectActiveMailIdentityRow({
    mail,
    settledAt,
    rewardId: canonicalIdentity.rewardId,
    dataGeneration: MAIL_STORAGE_DATA_GENERATION,
    revision: 0,
  });
  if (
    canonicalIdentity.location !== "active"
    || canonicalIdentity.archivedAt !== null
    || canonicalIdentity.dataGeneration !== MAIL_STORAGE_DATA_GENERATION
    || !isDeepStrictEqual(
      {...projected, revision: canonicalIdentity.revision},
      canonicalIdentity,
    )
  ) {
    throw archiveError("mail_archive_identity_drift");
  }
  return deepFreeze({
    mail,
    settledAt,
    documentJson: JSON.stringify(mail),
    recipientAccountId: mail.recipientAccountId,
    identity: canonicalIdentity,
  });
}

function archivePageEntryFromRow(row, expectedRecipientAccountId, certifyAttachment) {
  const mailId = String(row && row.mail_id || "");
  const mail = mailDocumentFromArchiveRow(row, mailId);
  const archivedAt = canonicalMailLifecycleIsoTimestamp(row && row.archived_at);
  if (
    mail.recipientAccountId !== expectedRecipientAccountId
    || archivedAt === ""
    || Number(row && row.archive_generation) !== MAIL_STORAGE_DATA_GENERATION
  ) {
    throw archiveError("mysql_mail_archive_page_row_drift");
  }
  let attachment;
  try {
    attachment = certifyAttachment(mail);
  } catch {
    throw archiveError("mysql_mail_archive_page_attachment_certifier_failed");
  }
  const lifecycle = readMailLifecycleState(mail, attachment);
  if (
    !lifecycle.ok
    || lifecycle.hasAssets !== false
    || lifecycle.settled !== true
    || lifecycle.settledAt !== String(row && row.settled_at || "")
  ) {
    throw archiveError("mysql_mail_archive_page_lifecycle_drift");
  }
  return deepFreeze({mail, archivedAt});
}

function certifyArchivedPageIdentity(row, entry) {
  const identity = identityFromRow(row);
  const projected = projectActiveMailIdentityRow({
    mail: entry.mail,
    settledAt: entry.mail.settledAt,
    rewardId: identity.rewardId,
    dataGeneration: MAIL_STORAGE_DATA_GENERATION,
    revision: identity.revision,
  });
  const expected = {
    ...projected,
    location: "archive",
    archivedAt: entry.archivedAt,
  };
  if (identity.revision < 1 || !isDeepStrictEqual(identity, expected)) {
    throw archiveError("mysql_mail_archive_page_identity_drift");
  }
}

function certifyStoredMailArchiveRow(identityRow, archiveRow, certifyAttachment) {
  const identity = identityFromRow(identityRow);
  const entry = archivePageEntryFromRow(
    archiveRow,
    identity.recipientAccountId,
    certifyAttachment,
  );
  certifyArchivedPageIdentity(identityRow, entry);
  return deepFreeze({
    mailId: entry.mail.mailId,
    recipientAccountId: entry.mail.recipientAccountId,
    archivedAt: entry.archivedAt,
    rewardId: identity.rewardId,
  });
}

function mailDocumentFromActiveRow(row, expectedMailId) {
  const mail = parseJsonObject(row && row.document_json, "mail_archive_document_invalid");
  const canonical = canonicalMailDocument(mail, expectedMailId);
  if (!canonical.ok || !physicalMailMatchesRow(canonical.mail, row)) {
    throw archiveError("mail_archive_active_row_drift");
  }
  return canonical.mail;
}

function mailDocumentFromArchiveRow(row, expectedMailId) {
  const mail = parseJsonObject(row && row.document_json, "mail_archive_document_invalid");
  const canonical = canonicalMailDocument(mail, expectedMailId);
  const settledAt = canonicalMailLifecycleIsoTimestamp(row && row.settled_at);
  if (
    !canonical.ok
    || !physicalMailMatchesRow(canonical.mail, row)
    || settledAt === ""
    || canonical.mail.settledAt !== settledAt
  ) {
    throw archiveError("mail_archive_archive_row_drift");
  }
  return canonical.mail;
}

function physicalMailMatchesRow(mail, row) {
  const rowReadAt = row && row.read_at === null ? null : String(row && row.read_at || "");
  const documentReadAt = mail.readAt === null || mail.readAt === undefined
    ? null
    : String(mail.readAt || "");
  return String(row && row.mail_id || "") === mail.mailId
    && String(row && row.sender_account_id || "") === String(mail.senderAccountId || "")
    && String(row && row.recipient_account_id || "") === mail.recipientAccountId
    && String(row && row.title || "") === String(mail.title || "")
    && String(row && row.created_at || "") === String(mail.createdAt || "")
    && rowReadAt === documentReadAt;
}

function identityFromRow(row) {
  const identity = {
    mailId: canonicalId(row && row.mail_id, 96),
    senderAccountId: canonicalId(row && row.sender_account_id, 80),
    recipientAccountId: canonicalId(row && row.recipient_account_id, 80),
    location: String(row && row.location || ""),
    createdAt: String(row && row.created_at || ""),
    settledAt: row && row.settled_at === null ? null : String(row && row.settled_at || ""),
    archivedAt: row && row.archived_at === null ? null : String(row && row.archived_at || ""),
    identityDigest: String(row && row.identity_digest || ""),
    documentDigest: String(row && row.document_digest || ""),
    rewardId: row && row.reward_id === null ? null : String(row && row.reward_id || ""),
    dataGeneration: Number(row && row.data_generation),
    revision: Number(row && row.revision),
  };
  if (
    identity.mailId === ""
    || identity.senderAccountId === ""
    || identity.recipientAccountId === ""
    || identity.createdAt === ""
    || identity.settledAt === null
    || canonicalMailLifecycleIsoTimestamp(identity.settledAt) === ""
    || !/^[a-f0-9]{64}$/.test(identity.identityDigest)
    || !/^[a-f0-9]{64}$/.test(identity.documentDigest)
    || (identity.rewardId !== null && !/^reward_[a-f0-9]{64}$/.test(identity.rewardId))
    || !Number.isSafeInteger(identity.dataGeneration)
    || !Number.isSafeInteger(identity.revision)
    || identity.revision < 0
  ) {
    throw archiveError("mail_archive_identity_row_invalid");
  }
  return identity;
}

function settledArchivedIdentity(identity) {
  return identity.location === "archive"
    && identity.archivedAt !== null
    && canonicalMailLifecycleIsoTimestamp(identity.archivedAt) !== ""
    && Date.parse(identity.archivedAt) >= Date.parse(identity.settledAt)
    && (identity.rewardId === null || /^reward_[a-f0-9]{64}$/.test(identity.rewardId))
    && identity.dataGeneration === MAIL_STORAGE_DATA_GENERATION
    && identity.revision >= 1;
}

function certifyConcurrentArchivedFacts({
  mailIds,
  identityByMailId,
  archiveRows,
  cutoffAt,
  certifyAttachment,
}) {
  const archiveByMailId = strictRowMap(
    archiveRows,
    "mail_id",
    mailIds,
    "mail_archive_concurrent_archive_rows_invalid",
  );
  for (const mailId of mailIds) {
    const identityRow = identityByMailId.get(mailId);
    const identity = identityFromRow(identityRow);
    const entry = archivePageEntryFromRow(
      archiveByMailId.get(mailId),
      identity.recipientAccountId,
      certifyAttachment,
    );
    certifyArchivedPageIdentity(identityRow, entry);
    if (entry.mail.settledAt > cutoffAt) {
      throw archiveError("mail_archive_concurrent_mail_not_eligible");
    }
  }
}

function exactArchivedIdentity(row, fact, archivedAt) {
  try {
    return isDeepStrictEqual(identityFromRow(row), {
      ...fact.identity,
      location: "archive",
      archivedAt,
      revision: fact.identity.revision + 1,
    });
  } catch {
    return false;
  }
}

function exactActiveIdentity(row, fact) {
  try {
    return isDeepStrictEqual(identityFromRow(row), fact.identity);
  } catch {
    return false;
  }
}

function exactArchiveRow(row, fact, archivedAt) {
  if (!row) return false;
  try {
    const mail = mailDocumentFromArchiveRow(row, fact.mail.mailId);
    return isDeepStrictEqual(mail, fact.mail)
      && String(row.settled_at || "") === fact.settledAt
      && String(row.archived_at || "") === archivedAt
      && Number(row.archive_generation) === MAIL_STORAGE_DATA_GENERATION;
  } catch {
    return false;
  }
}

function exactActiveMailRow(row, fact) {
  if (!row) return false;
  try {
    return isDeepStrictEqual(mailDocumentFromActiveRow(row, fact.mail.mailId), fact.mail);
  } catch {
    return false;
  }
}

function exactCounter(row, expected) {
  return Boolean(row)
    && String(row.recipient_account_id || "") === expected.recipientAccountId
    && Number(row.active_count) === expected.activeCount
    && Number(row.data_generation) === expected.dataGeneration
    && Number(row.revision) === expected.revision;
}

function certifyCounters(rows, expectedRecipientIds) {
  const mapped = strictRowMap(
    rows,
    "recipient_account_id",
    expectedRecipientIds,
    "mail_archive_counter_rows_invalid",
  );
  const result = new Map();
  for (const recipientAccountId of expectedRecipientIds) {
    const row = mapped.get(recipientAccountId);
    const counter = {
      recipientAccountId,
      activeCount: Number(row && row.active_count),
      dataGeneration: Number(row && row.data_generation),
      revision: Number(row && row.revision),
    };
    if (
      !Number.isSafeInteger(counter.activeCount)
      || counter.activeCount < 0
      || counter.dataGeneration !== MAIL_STORAGE_DATA_GENERATION
      || !Number.isSafeInteger(counter.revision)
      || counter.revision < 0
    ) {
      throw archiveError("mail_archive_counter_row_invalid");
    }
    result.set(recipientAccountId, counter);
  }
  return result;
}

function canonicalCandidateFacts(rows) {
  const facts = rows.map((row) => ({
    mailId: canonicalId(row && row.mail_id, 96),
    recipientAccountId: canonicalId(row && row.recipient_account_id, 80),
  }));
  const seen = new Set();
  for (const fact of facts) {
    if (fact.mailId === "" || fact.recipientAccountId === "" || seen.has(fact.mailId)) {
      throw archiveError("mail_archive_candidate_rows_invalid");
    }
    seen.add(fact.mailId);
  }
  return facts;
}

function exactControlRow(rows) {
  if (rows.length !== 1) throw archiveError("mail_archive_control_row_invalid");
  return rows[0];
}

function assertArchiveControl(row, options = {}) {
  const enabled = options.enabled === true ? 1 : 0;
  if (
    String(row && row.scope_key || "") !== MAIL_STORAGE_SCOPE_KEY
    || Number(row && row.schema_generation) !== 1
    || Number(row && row.data_generation) !== 1
    || String(row && row.lifecycle_state || "") !== "ready"
    || Number(row && row.archive_enabled) !== enabled
    || ![0, 1].includes(Number(row && row.vault_claim_enabled))
    || ![0, 1].includes(Number(row && row.active_limit_enabled))
  ) {
    throw archiveError(enabled ? "mail_archive_feature_disabled_or_drifted" : "mail_archive_control_drifted");
  }
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
    await deadline.track(connectionOperation(connection, "query", [TRANSACTION_ISOLATION_SQL]));
    await deadline.track(connectionOperation(connection, "beginTransaction"));
    started = true;
    const outcome = await execute(deadlineConnection(connection, deadline));
    if (
      !outcome
      || typeof outcome !== "object"
      || typeof outcome.commit !== "boolean"
      || !Object.hasOwn(outcome, "value")
    ) {
      throw archiveError("mail_archive_transaction_result_invalid");
    }
    if (!outcome.commit) {
      await deadline.track(
        connectionOperation(connection, "rollback"),
        {classifyFailure: false},
      );
      started = false;
      deadline.complete();
      return outcome.value;
    }
    deadline.markCommitDispatched();
    await deadline.track(connectionOperation(connection, "commit"));
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
    } else if (started) {
      let rollbackCompleted = false;
      if (terminated && error && error.timeout === true) {
        reusable = false;
      } else {
        try {
          await deadline.track(
            connectionOperation(connection, "rollback"),
            {classifyFailure: false},
          );
          rollbackCompleted = true;
        } catch (rollbackError) {
          error.rollbackCause = rollbackError;
          reusable = false;
          if (!deadline.isFinished()) destroyMysqlConnection(connection, rollbackError);
        }
      }
      error = deterministicArchiveError(error)
        ? decorateNoCommit(error, rollbackCompleted)
        : classifyMysqlTransactionFailure(error, {rollbackCompleted});
    } else {
      reusable = false;
      if (!terminated) destroyMysqlConnection(connection, error);
      error = deterministicArchiveError(error)
        ? decorateNoCommit(error, false)
        : classifyMysqlTransactionFailure(error, {commitDispatched: false});
    }
    throw error;
  } finally {
    deadline.complete();
    if (reusable) safeRelease(connection);
  }
}

async function runReadTransaction(pool, options, execute) {
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
    await deadline.track(connectionOperation(connection, "query", [TRANSACTION_ISOLATION_SQL]));
    await deadline.track(connectionOperation(connection, "beginTransaction"));
    started = true;
    const result = await execute(deadlineConnection(connection, deadline));
    await deadline.track(
      connectionOperation(connection, "rollback"),
      {classifyFailure: false},
    );
    started = false;
    deadline.complete();
    return result;
  } catch (caught) {
    let error = caught;
    const terminated = deadline.isFinished();
    if (started && !(terminated && error && error.timeout === true)) {
      try {
        await deadline.track(
          connectionOperation(connection, "rollback"),
          {classifyFailure: false},
        );
        error = deterministicArchiveError(error)
          ? decorateNoCommit(error, true)
          : classifyMysqlTransactionFailure(error, {rollbackCompleted: true});
      } catch (rollbackError) {
        error.rollbackCause = rollbackError;
        reusable = false;
        if (!deadline.isFinished()) destroyMysqlConnection(connection, rollbackError);
      }
    } else {
      reusable = false;
      if (!terminated) destroyMysqlConnection(connection, error);
      error = deterministicArchiveError(error)
        ? decorateNoCommit(error, false)
        : classifyMysqlTransactionFailure(error, {commitDispatched: false});
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

function connectionOperation(connection, method, args = []) {
  try {
    return Promise.resolve(connection[method](...args));
  } catch (error) {
    return Promise.reject(error);
  }
}

async function queryRows(connection, sql, params = []) {
  const result = await connection.query(sql, params);
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  if (!Array.isArray(rows)) throw archiveError("mail_archive_query_result_invalid");
  return rows;
}

async function exactWrite(connection, sql, params, code) {
  let result;
  try {
    result = await connection.query(sql, params);
  } catch (error) {
    if (error && error.code === "ER_DUP_ENTRY") throw archiveError(code);
    throw error;
  }
  const header = Array.isArray(result) ? result[0] : result;
  if (Number(header && header.affectedRows) !== 1) throw archiveError(code);
}

function batchReport(options) {
  const archived = Array.isArray(options.archived) ? options.archived : [];
  const archivedMailIds = canonicalReportMailIds(
    archived.map((fact) => String(fact && fact.mail && fact.mail.mailId || "")),
  );
  const retiredMailIds = canonicalReportMailIds(
    options.retiredMailIds === undefined ? archivedMailIds : options.retiredMailIds,
  );
  return deepFreeze({
    kind: MAIL_ARCHIVE_KIND,
    schemaVersion: MAIL_ARCHIVE_SCHEMA_VERSION,
    ok: options.ok !== false,
    code: String(options.code || "mail_archive_batch_failed"),
    archivedCount: archived.length,
    archivedMailIds,
    retiredMailIds,
    cutoffAt: String(options.cutoffAt || ""),
    archivedAt: String(options.archivedAt || ""),
    recovered: options.recovered === true,
    outcomeUnknown: options.outcomeUnknown === true,
    retryable: options.retryable === true,
  });
}

function canonicalReportMailIds(value) {
  if (!Array.isArray(value) || value.length > MAIL_ARCHIVE_BATCH_MAX) {
    throw archiveError("mail_archive_report_mail_ids_invalid");
  }
  const result = value.map((mailId) => canonicalId(mailId, 96));
  if (result.some((mailId) => mailId === "") || new Set(result).size !== result.length) {
    throw archiveError("mail_archive_report_mail_ids_invalid");
  }
  return result.sort(compareText);
}

function strictRowMap(rows, field, expectedKeys, code) {
  const map = rowMap(rows, field);
  if (
    map.size !== expectedKeys.length
    || expectedKeys.some((key) => !map.has(key))
  ) {
    throw archiveError(code);
  }
  return map;
}

function rowMap(rows, field) {
  const result = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row && row[field] || "");
    if (key === "" || result.has(key)) throw archiveError("mail_archive_duplicate_row");
    result.set(key, row);
  }
  return result;
}

function countBy(values, selector) {
  const counts = new Map();
  for (const value of values) {
    const key = selector(value);
    counts.set(key, Number(counts.get(key) || 0) + 1);
  }
  return new Map(Array.from(counts.entries()).sort(([left], [right]) => compareText(left, right)));
}

function sortedUnique(values) {
  return Array.from(new Set(values)).sort(compareText);
}

function placeholders(count) {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAIL_ARCHIVE_BATCH_MAX) {
    throw archiveError("mail_archive_placeholder_count_invalid");
  }
  return Array.from({length: count}, () => "?").join(", ");
}

function parseJsonObject(value, code) {
  let result = value;
  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch {
      throw archiveError(code);
    }
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw archiveError(code);
  }
  return structuredClone(result);
}

function canonicalTimestamp(value, code) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw archiveError(code);
  return date.toISOString();
}

function boundedInteger(value, fallback, maximum) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw archiveError("mail_archive_batch_limit_invalid");
  }
  return number;
}

function canonicalId(value, maximumLength) {
  return typeof value === "string"
    && value !== ""
    && value === value.trim()
    && value.length <= maximumLength
    && /^[a-z0-9_:-]+$/.test(value)
    ? value
    : "";
}

function deterministicArchiveError(error) {
  const code = String(error && error.code || "");
  return code.startsWith("mail_archive_")
    || code.startsWith("mysql_mail_archive_")
    || code === MYSQL_TRANSACTION_ROLLED_BACK;
}

function decorateNoCommit(error, rollbackCompleted) {
  error.transactionPhase = "rolled_back";
  error.outcomeUnknown = false;
  error.noCommitGuaranteed = true;
  error.rollbackConfirmed = rollbackCompleted === true;
  error.retryable = codeIsRetryable(error.code);
  return error;
}

function codeIsRetryable(code) {
  return String(code || "") === MYSQL_TRANSACTION_ROLLED_BACK;
}

function safeRelease(connection, primaryError = null) {
  try {
    connection.release();
  } catch (error) {
    destroyMysqlConnection(connection, error);
    if (primaryError) primaryError.releaseCause = error;
  }
}

function archiveError(code) {
  const error = new Error("MySQL 邮件只读归档未满足安全合同。");
  error.code = String(code || "mail_archive_failed");
  return error;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function compareText(left, right) {
  return left < right ? -1 : (left > right ? 1 : 0);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

module.exports = {
  MAIL_ARCHIVE_AFTER_DAYS,
  MAIL_ARCHIVE_BATCH_MAX,
  canonicalMailArchiveCutoff,
  certifyMailArchiveEligibility,
  certifyStoredMailArchiveRow,
  classifyMailArchiveRecoveryForTest,
  normalizeMysqlMailArchivePageRequest,
  runMysqlMailArchiveBatch,
  runMysqlMailArchivePageRead,
};
