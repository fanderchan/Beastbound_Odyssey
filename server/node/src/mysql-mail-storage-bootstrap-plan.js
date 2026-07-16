"use strict";

const {isDeepStrictEqual} = require("node:util");

const {canonicalMailDocument} = require("./auth/mail-authority-state");
const {readMailLifecycleState} = require("./auth/mail-lifecycle-state");
const {stableDigest} = require("./auth/profile-migrations");
const {
  redactMailStorageBootstrapFact,
} = require("./mysql-mail-storage-bootstrap-public-report");

const MAIL_STORAGE_BOOTSTRAP_PLAN_KIND = "beastbound_mail_storage_bootstrap_plan";
const MAIL_STORAGE_BOOTSTRAP_SOURCE_KIND = "beastbound_mail_storage_bootstrap_source";
const MAIL_STORAGE_BOOTSTRAP_PLAN_SCHEMA_VERSION = 1;
const MAIL_STORAGE_BOOTSTRAP_TARGET_DATA_GENERATION = 1;
const MAIL_STORAGE_BOOTSTRAP_VALIDATION_CONTRACT = "physical_mail_v1+authority_v1+attachment_v2+lifecycle_v1";
const MAIL_STORAGE_SCOPE_KEY = "mail_lifecycle";
const MAIL_STORAGE_SCHEMA_GENERATION = 1;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
// mail_messages and the lifecycle sidecars share utf8mb4_0900_ai_ci keys.
// Production-generated durable IDs are lowercase ASCII; fail closed outside
// that domain instead of guessing MySQL collation equivalence in JavaScript.
const STORAGE_IDENTIFIER_PATTERN = /^[a-z0-9_:-]+$/;
const PHYSICAL_ROW_FIELDS = Object.freeze([
  "mail_id",
  "sender_account_id",
  "recipient_account_id",
  "title",
  "created_at",
  "read_at",
  "document_json",
]);
const NORMALIZED_SOURCE_ROW_FIELDS = Object.freeze([
  "mailId",
  "senderAccountId",
  "recipientAccountId",
  "title",
  "createdAt",
  "readAt",
  "document",
]);
const CONTROL_FIELDS = Object.freeze([
  "scopeKey",
  "schemaGeneration",
  "dataGeneration",
  "lifecycleState",
  "archiveEnabled",
  "vaultClaimEnabled",
  "activeLimitEnabled",
  "bootstrapCursorMailId",
  "bootstrapSourceCount",
  "bootstrapIdentityCount",
  "bootstrapRecipientCount",
  "bootstrapActiveCount",
  "sourceDigest",
  "reconciledAt",
]);

// Pure planning boundary. The caller supplies the current product attachment
// certifier (normally readMailAttachmentState with the production catalogs),
// while this module owns physical SQL/JSON mirror, authority identity and
// lifecycle certification. No clock, filesystem, database or SQL is used.
function buildMailStorageBootstrapPlan(options = {}) {
  const sourceRowsValue = options && options.sourceRows;
  const certifyAttachment = options && options.certifyAttachment;
  const errors = [];
  if (!Array.isArray(sourceRowsValue)) {
    errors.push(planError("mail_storage_bootstrap_source_invalid", "sourceRows"));
    return invalidPlan(errors);
  }
  if (typeof certifyAttachment !== "function") {
    errors.push(planError("mail_storage_bootstrap_attachment_certifier_missing", "certifyAttachment"));
    return invalidPlan(errors);
  }

  const sourceRows = [];
  const lifecycleByMailId = new Map();
  const seenMailIds = new Set();
  for (const [index, row] of sourceRowsValue.entries()) {
    const parsed = certifyPhysicalMailRow(row, certifyAttachment, index);
    if (!parsed.ok) {
      errors.push(parsed.error);
      continue;
    }
    if (seenMailIds.has(parsed.row.mailId)) {
      errors.push(planError(
        "mail_storage_bootstrap_mail_duplicate",
        `sourceRows[${index}].mail_id`,
        parsed.row.mailId,
      ));
      continue;
    }
    seenMailIds.add(parsed.row.mailId);
    sourceRows.push(parsed.row);
    lifecycleByMailId.set(parsed.row.mailId, parsed.lifecycle);
  }
  if (errors.length > 0) {
    return invalidPlan(errors);
  }

  sourceRows.sort((left, right) => compareCanonicalText(left.mailId, right.mailId));
  const sourceDigest = digestSourceRows(sourceRows);
  const identityRows = sourceRows.map((row) => {
    const lifecycle = lifecycleByMailId.get(row.mailId);
    return projectIdentityRow(
      row,
      lifecycle && lifecycle.settled === true ? lifecycle.settledAt : null,
    );
  });
  const counterRows = projectCounterRows(sourceRows);
  const counts = {
    source: sourceRows.length,
    identity: identityRows.length,
    recipient: counterRows.length,
    active: sourceRows.length,
  };
  const plan = {
    kind: MAIL_STORAGE_BOOTSTRAP_PLAN_KIND,
    schemaVersion: MAIL_STORAGE_BOOTSTRAP_PLAN_SCHEMA_VERSION,
    validationContract: MAIL_STORAGE_BOOTSTRAP_VALIDATION_CONTRACT,
    ok: true,
    sourceSafe: true,
    // A certified source is still not writable until the current auxiliary
    // tables and control row pass reconcileMailStorageBootstrapPlan().
    applySafe: false,
    sourceRows,
    sourceDigest,
    identityRows,
    counterRows,
    archiveRows: [],
    vaultRows: [],
    counts,
    lastMailId: sourceRows.length > 0 ? sourceRows[sourceRows.length - 1].mailId : "",
    target: targetState(),
    errors: [],
    planDigest: "",
  };
  plan.planDigest = stableDigest(planDigestFacts(plan));
  return deepFreeze(plan);
}

function certifyPhysicalMailRow(rowValue, certifyAttachment, index) {
  const path = `sourceRows[${index}]`;
  if (!isObject(rowValue) || !sameKeys(rowValue, PHYSICAL_ROW_FIELDS)) {
    return failedCertification("mail_storage_bootstrap_physical_row_invalid", path);
  }
  const mailId = rowValue.mail_id;
  const senderAccountId = rowValue.sender_account_id;
  const recipientAccountId = rowValue.recipient_account_id;
  if (
    !canonicalIdentity(mailId, 96)
    || !canonicalIdentity(senderAccountId, 80)
    || !canonicalIdentity(recipientAccountId, 80)
  ) {
    return failedCertification(
      "mail_storage_bootstrap_identity_invalid",
      `${path}.mail_id`,
      typeof mailId === "string" ? mailId : "",
    );
  }
  if (typeof rowValue.title !== "string" || rowValue.title.length > 80) {
    return failedCertification("mail_storage_bootstrap_physical_row_invalid", `${path}.title`, mailId);
  }
  if (
    typeof rowValue.created_at !== "string"
    || rowValue.created_at === ""
    || rowValue.created_at.length > 40
  ) {
    return failedCertification("mail_storage_bootstrap_physical_row_invalid", `${path}.created_at`, mailId);
  }
  if (
    rowValue.read_at !== null
    && (
      typeof rowValue.read_at !== "string"
      || rowValue.read_at === ""
      || rowValue.read_at.length > 40
    )
  ) {
    return failedCertification("mail_storage_bootstrap_physical_row_invalid", `${path}.read_at`, mailId);
  }

  const documentResult = parsePhysicalDocument(rowValue.document_json, path, mailId);
  if (!documentResult.ok) {
    return documentResult;
  }
  const authority = canonicalMailDocument(documentResult.document, mailId);
  if (!authority.ok) {
    return failedCertification(authority.code, `${path}.document_json`, mailId);
  }
  const mail = authority.mail;
  const documentReadAt = mail.readAt === null || mail.readAt === undefined
    ? null
    : mail.readAt;
  if (
    mail.mailId !== mailId
    || mail.senderAccountId !== senderAccountId
    || mail.recipientAccountId !== recipientAccountId
    || mail.title !== rowValue.title
    || mail.createdAt !== rowValue.created_at
    || documentReadAt !== rowValue.read_at
  ) {
    return failedCertification("mail_storage_bootstrap_row_mirror_invalid", path, mailId);
  }

  let attachment;
  try {
    attachment = certifyAttachment(mail);
  } catch {
    return failedCertification(
      "mail_storage_bootstrap_attachment_certifier_failed",
      `${path}.document_json`,
      mailId,
    );
  }
  if (!attachment || attachment.ok !== true) {
    return failedCertification(
      typeof (attachment && attachment.code) === "string" && attachment.code !== ""
        ? attachment.code
        : "mail_storage_bootstrap_attachment_invalid",
      `${path}.document_json`,
      mailId,
    );
  }
  // Attachment canonicalization may upgrade schema1 representations, but the
  // physical document remains the only authority for lifecycle timestamps.
  const lifecycle = readMailLifecycleState(mail, attachment);
  if (!lifecycle.ok) {
    return failedCertification(lifecycle.code, `${path}.document_json`, mailId);
  }
  return {
    ok: true,
    lifecycle,
    row: {
      mailId,
      senderAccountId,
      recipientAccountId,
      title: rowValue.title,
      createdAt: rowValue.created_at,
      readAt: rowValue.read_at,
      document: structuredClone(mail),
    },
  };
}

function parsePhysicalDocument(value, path, mailId) {
  let document = value;
  if (Buffer.isBuffer(document)) {
    document = document.toString("utf8");
  }
  if (typeof document === "string") {
    try {
      document = JSON.parse(document);
    } catch {
      return failedCertification(
        "mail_storage_bootstrap_document_json_invalid",
        `${path}.document_json`,
        mailId,
      );
    }
  }
  if (!isObject(document)) {
    return failedCertification(
      "mail_storage_bootstrap_document_json_invalid",
      `${path}.document_json`,
      mailId,
    );
  }
  return {ok: true, document};
}

function verifyMailStorageBootstrapPlan(plan, options = {}) {
  if (
    !isObject(plan)
    || plan.kind !== MAIL_STORAGE_BOOTSTRAP_PLAN_KIND
    || plan.schemaVersion !== MAIL_STORAGE_BOOTSTRAP_PLAN_SCHEMA_VERSION
    || plan.validationContract !== MAIL_STORAGE_BOOTSTRAP_VALIDATION_CONTRACT
    || plan.ok !== true
    || plan.sourceSafe !== true
    || plan.applySafe !== false
    || !Array.isArray(plan.sourceRows)
    || !Array.isArray(plan.identityRows)
    || !Array.isArray(plan.counterRows)
    || !Array.isArray(plan.archiveRows)
    || plan.archiveRows.length !== 0
    || !Array.isArray(plan.vaultRows)
    || plan.vaultRows.length !== 0
    || !isObject(plan.counts)
    || !isDeepStrictEqual(plan.target, targetState())
    || !Array.isArray(plan.errors)
    || plan.errors.length !== 0
    || !SHA256_PATTERN.test(String(plan.sourceDigest || ""))
    || !SHA256_PATTERN.test(String(plan.planDigest || ""))
  ) {
    return verificationFailure("mail_storage_bootstrap_plan_invalid");
  }
  const certifyAttachment = options && options.certifyAttachment;
  if (typeof certifyAttachment !== "function") {
    return verificationFailure("mail_storage_bootstrap_plan_certifier_missing");
  }
  if (digestSourceRows(plan.sourceRows) !== plan.sourceDigest) {
    return verificationFailure("mail_storage_bootstrap_plan_source_digest_mismatch");
  }
  const sourceVerification = verifyNormalizedSourceRows(plan.sourceRows);
  if (!sourceVerification.ok) {
    return sourceVerification;
  }
  const certification = recertifyNormalizedSourceRows(plan.sourceRows, certifyAttachment);
  if (!certification.ok) {
    return verificationFailure(
      "mail_storage_bootstrap_plan_source_certification_failed",
      certification.code,
    );
  }
  const expectedIdentityRows = plan.sourceRows.map((row) => projectIdentityRow(
    row,
    certification.lifecycleByMailId.get(row.mailId).settled === true
      ? certification.lifecycleByMailId.get(row.mailId).settledAt
      : null,
  ));
  const expectedCounterRows = projectCounterRows(plan.sourceRows);
  const expectedCounts = {
    source: plan.sourceRows.length,
    identity: expectedIdentityRows.length,
    recipient: expectedCounterRows.length,
    active: plan.sourceRows.length,
  };
  if (
    !isDeepStrictEqual(plan.identityRows, expectedIdentityRows)
    || !isDeepStrictEqual(plan.counterRows, expectedCounterRows)
  ) {
    return verificationFailure("mail_storage_bootstrap_plan_projection_mismatch");
  }
  if (
    !isDeepStrictEqual(plan.counts, expectedCounts)
    || plan.lastMailId !== (plan.sourceRows.length > 0
      ? plan.sourceRows[plan.sourceRows.length - 1].mailId
      : "")
  ) {
    return verificationFailure("mail_storage_bootstrap_plan_counts_invalid");
  }
  if (stableDigest(planDigestFacts(plan)) !== plan.planDigest) {
    return verificationFailure("mail_storage_bootstrap_plan_digest_mismatch");
  }
  return {ok: true, sourceDigest: plan.sourceDigest, planDigest: plan.planDigest};
}

// Observed identity/counter rows must already be projected into the exact
// camelCase shapes emitted by the plan. Only absent expected rows are returned
// as safe forward-fixes; any drift or target-extra row suppresses every write.
function reconcileMailStorageBootstrapPlan(plan, observedValue = {}, options = {}) {
  const verification = verifyMailStorageBootstrapPlan(plan, options);
  if (!verification.ok) {
    return blockedReconciliation([
      planError(verification.code, "plan"),
    ]);
  }
  if (!isObject(observedValue)) {
    return blockedReconciliation([
      planError("mail_storage_bootstrap_observed_invalid", "observed"),
    ]);
  }
  const arrays = ["identityRows", "counterRows", "archiveRows", "vaultRows"];
  const invalidArray = arrays.find((field) => !Array.isArray(observedValue[field]));
  if (invalidArray) {
    return blockedReconciliation([
      planError("mail_storage_bootstrap_observed_invalid", `observed.${invalidArray}`),
    ]);
  }

  const conflicts = [];
  const control = classifyControl(plan, observedValue.control);
  if (!control.ok) {
    conflicts.push(planError("mail_storage_bootstrap_control_conflict", "observed.control"));
  }
  const identity = reconcileRows(
    plan.identityRows,
    observedValue.identityRows,
    "mailId",
    "mail_storage_bootstrap_identity",
  );
  const counters = reconcileRows(
    plan.counterRows,
    observedValue.counterRows,
    "recipientAccountId",
    "mail_storage_bootstrap_counter",
  );
  conflicts.push(...identity.conflicts, ...counters.conflicts);

  if (observedValue.archiveRows.length > 0) {
    conflicts.push(planError("mail_storage_bootstrap_archive_unexpected", "observed.archiveRows"));
  }
  if (observedValue.vaultRows.length > 0) {
    conflicts.push(planError("mail_storage_bootstrap_vault_unexpected", "observed.vaultRows"));
  }
  if (
    control.ok
    && control.mode === "uninitialized"
    && (
      observedValue.identityRows.length > 0
      || observedValue.counterRows.length > 0
      || observedValue.archiveRows.length > 0
      || observedValue.vaultRows.length > 0
    )
  ) {
    conflicts.push(planError(
      "mail_storage_bootstrap_uninitialized_not_empty",
      "observed",
    ));
  }
  const missingCount = identity.missing.length + counters.missing.length;
  if (control.ok && control.mode === "ready" && missingCount > 0) {
    conflicts.push(planError("mail_storage_bootstrap_ready_incomplete", "observed"));
  }
  if (conflicts.length > 0) {
    return blockedReconciliation(conflicts, {
      exactIdentityCount: identity.exactCount,
      exactCounterCount: counters.exactCount,
    });
  }

  let status = "missing";
  let action = "start";
  if (control.mode === "building") {
    status = missingCount > 0 ? "missing" : "exact";
    action = missingCount > 0 ? "repair_missing" : "finalize";
  } else if (control.mode === "ready") {
    status = "exact";
    action = "already_ready";
  }
  return deepFreeze({
    ok: true,
    targetSafe: true,
    forwardFixSafe: control.mode !== "ready",
    // This pure snapshot comparison does not own a locked live transaction or
    // a write-before source reread. The future executor is the only layer that
    // may issue an apply authorization.
    applySafe: false,
    status,
    action,
    controlMode: control.mode,
    exactIdentityCount: identity.exactCount,
    exactCounterCount: counters.exactCount,
    missingIdentityRows: identity.missing,
    missingCounterRows: counters.missing,
    conflicts: [],
    canFinalize: control.mode === "building" && missingCount === 0,
  });
}

function reconcileRows(expectedRows, actualRows, keyField, codePrefix) {
  const expected = new Map(expectedRows.map((row) => [row[keyField], row]));
  const actual = new Map();
  const conflicts = [];
  for (const row of actualRows) {
    const key = isObject(row) && typeof row[keyField] === "string" ? row[keyField] : "";
    if (key === "" || actual.has(key)) {
      conflicts.push(planError(`${codePrefix}_duplicate`, `observed.${keyField}`, key));
      continue;
    }
    actual.set(key, row);
  }
  const missing = [];
  let exactCount = 0;
  for (const [key, expectedRow] of expected.entries()) {
    if (!actual.has(key)) {
      missing.push(expectedRow);
      continue;
    }
    if (isDeepStrictEqual(actual.get(key), expectedRow)) {
      exactCount += 1;
    } else {
      conflicts.push(planError(`${codePrefix}_conflict`, `observed.${keyField}`, key));
    }
  }
  for (const key of actual.keys()) {
    if (!expected.has(key)) {
      conflicts.push(planError(`${codePrefix}_unexpected`, `observed.${keyField}`, key));
    }
  }
  return {conflicts, exactCount, missing};
}

function classifyControl(plan, control) {
  if (!isObject(control) || !sameKeys(control, CONTROL_FIELDS)) {
    return {ok: false, mode: "invalid"};
  }
  const flagsOff = control.archiveEnabled === false
    && control.vaultClaimEnabled === false
    && control.activeLimitEnabled === false;
  if (
    control.scopeKey !== MAIL_STORAGE_SCOPE_KEY
    || control.schemaGeneration !== MAIL_STORAGE_SCHEMA_GENERATION
    || !flagsOff
  ) {
    return {ok: false, mode: "invalid"};
  }
  if (control.lifecycleState === "uninitialized") {
    return {
      ok: control.dataGeneration === 0
        && control.bootstrapCursorMailId === ""
        && control.bootstrapSourceCount === 0
        && control.bootstrapIdentityCount === 0
        && control.bootstrapRecipientCount === 0
        && control.bootstrapActiveCount === 0
        && control.sourceDigest === ""
        && control.reconciledAt === "",
      mode: "uninitialized",
    };
  }
  if (!["building", "ready"].includes(control.lifecycleState)) {
    return {ok: false, mode: "invalid"};
  }
  const countsMatch = control.bootstrapSourceCount === plan.counts.source
    && control.bootstrapIdentityCount === plan.counts.identity
    && control.bootstrapRecipientCount === plan.counts.recipient
    && control.bootstrapActiveCount === plan.counts.active;
  const commonMatch = control.dataGeneration === MAIL_STORAGE_BOOTSTRAP_TARGET_DATA_GENERATION
    && control.sourceDigest === plan.sourceDigest
    && countsMatch;
  if (control.lifecycleState === "building") {
    const validCursors = new Set(["", ...plan.sourceRows.map((row) => row.mailId)]);
    return {
      ok: commonMatch
        && control.reconciledAt === ""
        && validCursors.has(control.bootstrapCursorMailId),
      mode: "building",
    };
  }
  return {
    ok: commonMatch
      && control.bootstrapCursorMailId === plan.lastMailId
      && isCanonicalIsoTimestamp(control.reconciledAt),
    mode: "ready",
  };
}

function digestSourceRows(rows) {
  return stableDigest({
    kind: MAIL_STORAGE_BOOTSTRAP_SOURCE_KIND,
    schemaVersion: MAIL_STORAGE_BOOTSTRAP_PLAN_SCHEMA_VERSION,
    validationContract: MAIL_STORAGE_BOOTSTRAP_VALIDATION_CONTRACT,
    physicalFields: [...PHYSICAL_ROW_FIELDS],
    rows,
  });
}

function projectIdentityRow(row, settledAt) {
  return {
    mailId: row.mailId,
    senderAccountId: row.senderAccountId,
    recipientAccountId: row.recipientAccountId,
    location: "active",
    createdAt: row.createdAt,
    settledAt,
    archivedAt: null,
    identityDigest: stableDigest({
      kind: "beastbound_mail_identity",
      schemaVersion: 1,
      mailId: row.mailId,
      senderAccountId: row.senderAccountId,
      recipientAccountId: row.recipientAccountId,
      createdAt: row.createdAt,
    }),
    documentDigest: stableDigest({
      kind: "beastbound_mail_document",
      schemaVersion: 1,
      mailId: row.mailId,
      document: row.document,
    }),
    rewardId: null,
    dataGeneration: MAIL_STORAGE_BOOTSTRAP_TARGET_DATA_GENERATION,
    revision: 0,
  };
}

function projectCounterRows(sourceRows) {
  const countByRecipient = new Map();
  for (const row of sourceRows) {
    countByRecipient.set(
      row.recipientAccountId,
      Number(countByRecipient.get(row.recipientAccountId) || 0) + 1,
    );
  }
  return Array.from(countByRecipient.entries())
    .sort(([left], [right]) => compareCanonicalText(left, right))
    .map(([recipientAccountId, activeCount]) => ({
      recipientAccountId,
      activeCount,
      dataGeneration: MAIL_STORAGE_BOOTSTRAP_TARGET_DATA_GENERATION,
      revision: 0,
    }));
}

function verifyNormalizedSourceRows(sourceRows) {
  let previousMailId = "";
  for (const [index, row] of sourceRows.entries()) {
    if (!isObject(row) || !sameKeys(row, NORMALIZED_SOURCE_ROW_FIELDS)) {
      return verificationFailure("mail_storage_bootstrap_plan_source_invalid");
    }
    if (
      !canonicalIdentity(row.mailId, 96)
      || !canonicalIdentity(row.senderAccountId, 80)
      || !canonicalIdentity(row.recipientAccountId, 80)
      || typeof row.title !== "string"
      || row.title.length > 80
      || typeof row.createdAt !== "string"
      || row.createdAt === ""
      || row.createdAt.length > 40
      || (
        row.readAt !== null
        && (
          typeof row.readAt !== "string"
          || row.readAt === ""
          || row.readAt.length > 40
        )
      )
      || (index > 0 && compareCanonicalText(previousMailId, row.mailId) >= 0)
    ) {
      return verificationFailure("mail_storage_bootstrap_plan_source_invalid");
    }
    const authority = canonicalMailDocument(row.document, row.mailId);
    const documentReadAt = authority.ok
      && authority.mail.readAt !== null
      && authority.mail.readAt !== undefined
      ? authority.mail.readAt
      : null;
    if (
      !authority.ok
      || authority.mail.senderAccountId !== row.senderAccountId
      || authority.mail.recipientAccountId !== row.recipientAccountId
      || authority.mail.title !== row.title
      || authority.mail.createdAt !== row.createdAt
      || documentReadAt !== row.readAt
    ) {
      return verificationFailure("mail_storage_bootstrap_plan_source_invalid");
    }
    const settledAt = Object.hasOwn(row.document, "settledAt") ? row.document.settledAt : null;
    if (settledAt !== null && !isCanonicalIsoTimestamp(settledAt)) {
      return verificationFailure("mail_storage_bootstrap_plan_source_invalid");
    }
    previousMailId = row.mailId;
  }
  return {ok: true};
}

function recertifyNormalizedSourceRows(sourceRows, certifyAttachment) {
  const lifecycleByMailId = new Map();
  for (const [index, row] of sourceRows.entries()) {
    const result = certifyPhysicalMailRow({
      mail_id: row.mailId,
      sender_account_id: row.senderAccountId,
      recipient_account_id: row.recipientAccountId,
      title: row.title,
      created_at: row.createdAt,
      read_at: row.readAt,
      document_json: row.document,
    }, certifyAttachment, index);
    if (!result.ok) {
      return {ok: false, code: result.error.code};
    }
    if (!isDeepStrictEqual(result.row, row)) {
      return {ok: false, code: "mail_storage_bootstrap_plan_source_changed"};
    }
    lifecycleByMailId.set(row.mailId, result.lifecycle);
  }
  return {ok: true, lifecycleByMailId};
}

function planDigestFacts(plan) {
  return {
    kind: MAIL_STORAGE_BOOTSTRAP_PLAN_KIND,
    schemaVersion: MAIL_STORAGE_BOOTSTRAP_PLAN_SCHEMA_VERSION,
    validationContract: MAIL_STORAGE_BOOTSTRAP_VALIDATION_CONTRACT,
    sourceDigest: plan.sourceDigest,
    identityRows: plan.identityRows,
    counterRows: plan.counterRows,
    archiveRows: [],
    vaultRows: [],
    counts: plan.counts,
    lastMailId: plan.lastMailId,
    target: plan.target,
  };
}

function targetState() {
  return {
    schemaGeneration: MAIL_STORAGE_SCHEMA_GENERATION,
    dataGeneration: MAIL_STORAGE_BOOTSTRAP_TARGET_DATA_GENERATION,
    lifecycleState: "ready",
    archiveEnabled: false,
    vaultClaimEnabled: false,
    activeLimitEnabled: false,
  };
}

function invalidPlan(errors) {
  const safeErrors = errors.map((entry) => ({...entry}));
  const plan = {
    kind: MAIL_STORAGE_BOOTSTRAP_PLAN_KIND,
    schemaVersion: MAIL_STORAGE_BOOTSTRAP_PLAN_SCHEMA_VERSION,
    validationContract: MAIL_STORAGE_BOOTSTRAP_VALIDATION_CONTRACT,
    ok: false,
    sourceSafe: false,
    applySafe: false,
    sourceRows: [],
    sourceDigest: "",
    identityRows: [],
    counterRows: [],
    archiveRows: [],
    vaultRows: [],
    counts: {source: 0, identity: 0, recipient: 0, active: 0},
    lastMailId: "",
    target: targetState(),
    errors: safeErrors,
    planDigest: stableDigest({
      kind: `${MAIL_STORAGE_BOOTSTRAP_PLAN_KIND}_invalid`,
      schemaVersion: MAIL_STORAGE_BOOTSTRAP_PLAN_SCHEMA_VERSION,
      validationContract: MAIL_STORAGE_BOOTSTRAP_VALIDATION_CONTRACT,
      errors: safeErrors,
    }),
  };
  return deepFreeze(plan);
}

function blockedReconciliation(conflicts, counts = {}) {
  return deepFreeze({
    ok: false,
    targetSafe: false,
    forwardFixSafe: false,
    applySafe: false,
    status: "conflict",
    action: "blocked",
    controlMode: "invalid",
    exactIdentityCount: Number(counts.exactIdentityCount || 0),
    exactCounterCount: Number(counts.exactCounterCount || 0),
    missingIdentityRows: [],
    missingCounterRows: [],
    conflicts,
    canFinalize: false,
  });
}

function publicMailStorageBootstrapPlanReport(planValue) {
  const plan = isObject(planValue) ? planValue : {};
  const counts = isObject(plan.counts) ? plan.counts : {};
  const errors = Array.isArray(plan.errors) ? plan.errors : [];
  return deepFreeze({
    kind: MAIL_STORAGE_BOOTSTRAP_PLAN_KIND,
    schemaVersion: MAIL_STORAGE_BOOTSTRAP_PLAN_SCHEMA_VERSION,
    ok: plan.ok === true,
    sourceSafe: plan.sourceSafe === true,
    applySafe: false,
    sourceDigest: SHA256_PATTERN.test(String(plan.sourceDigest || "")) ? plan.sourceDigest : "",
    planDigest: SHA256_PATTERN.test(String(plan.planDigest || "")) ? plan.planDigest : "",
    counts: {
      source: safeReportCount(counts.source),
      identity: safeReportCount(counts.identity),
      recipient: safeReportCount(counts.recipient),
      active: safeReportCount(counts.active),
    },
    errorCount: errors.length,
    errors: errors.map(redactMailStorageBootstrapFact),
  });
}

function safeReportCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function planError(code, path, key = "") {
  const error = {code: String(code || "mail_storage_bootstrap_invalid"), path: String(path || "")};
  if (key !== "") {
    error.key = String(key);
  }
  return error;
}

function failedCertification(code, path, key = "") {
  return {ok: false, error: planError(code, path, key)};
}

function verificationFailure(code, causeCode = "") {
  const failure = {ok: false, code};
  if (causeCode !== "") {
    failure.causeCode = causeCode;
  }
  return failure;
}

function canonicalIdentity(value, maxLength) {
  return typeof value === "string"
    && value !== ""
    && value === value.trim()
    && value.length <= maxLength
    && STORAGE_IDENTIFIER_PATTERN.test(value)
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function compareCanonicalText(left, right) {
  return left < right ? -1 : (left > right ? 1 : 0);
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== "string" || value === "") {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sameKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
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
  MAIL_STORAGE_BOOTSTRAP_PLAN_KIND,
  MAIL_STORAGE_BOOTSTRAP_PLAN_SCHEMA_VERSION,
  MAIL_STORAGE_BOOTSTRAP_TARGET_DATA_GENERATION,
  MAIL_STORAGE_BOOTSTRAP_VALIDATION_CONTRACT,
  buildMailStorageBootstrapPlan,
  publicMailStorageBootstrapPlanReport,
  reconcileMailStorageBootstrapPlan,
  verifyMailStorageBootstrapPlan,
};
