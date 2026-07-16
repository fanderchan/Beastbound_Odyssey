"use strict";

const {canonicalMailDocument} = require("./auth/mail-authority-state");
const {
  canonicalMailLifecycleIsoTimestamp,
  readMailLifecycleState,
} = require("./auth/mail-lifecycle-state");
const {stableDigest} = require("./auth/profile-migrations");

const MAIL_STORAGE_FORWARD_MAINTENANCE_PLAN_KIND =
  "beastbound_mail_storage_forward_maintenance_plan";
const MAIL_STORAGE_FORWARD_MAINTENANCE_PLAN_SCHEMA_VERSION = 1;
const MAIL_STORAGE_FORWARD_DATA_GENERATION = 1;
const MAIL_STORAGE_SCHEMA_GENERATION = 1;
const STORAGE_IDENTIFIER_PATTERN = /^[a-z0-9_:-]+$/;

// The permanent mail identity and document digests have one formula shared by
// stop-the-world bootstrap and every generation-one forward write. Callers
// must supply a canonical authority document; this projector never repairs or
// rewrites mail content.
function projectActiveMailIdentityRow(options = {}) {
  const mail = options && options.mail;
  const settledAt = options && Object.hasOwn(options, "settledAt")
    ? options.settledAt
    : null;
  const dataGeneration = options && Object.hasOwn(options, "dataGeneration")
    ? options.dataGeneration
    : MAIL_STORAGE_FORWARD_DATA_GENERATION;
  const revision = options && Object.hasOwn(options, "revision")
    ? options.revision
    : 0;
  const authority = canonicalMailDocument(mail, mail && mail.mailId);
  if (
    !authority.ok
    || !canonicalStorageIdentity(authority.mail.mailId, 96)
    || !canonicalStorageIdentity(authority.mail.senderAccountId, 80)
    || !canonicalStorageIdentity(authority.mail.recipientAccountId, 80)
    || typeof authority.mail.createdAt !== "string"
    || authority.mail.createdAt === ""
    || authority.mail.createdAt.length > 40
    || (settledAt !== null && canonicalMailLifecycleIsoTimestamp(settledAt) === "")
    || !Number.isSafeInteger(dataGeneration)
    || dataGeneration < 0
    || !Number.isSafeInteger(revision)
    || revision < 0
  ) {
    throw codedTypeError(
      "mail_storage_forward_projection_invalid",
      "邮件永久身份投影输入无效。",
    );
  }
  const canonical = authority.mail;
  return deepFreeze({
    mailId: canonical.mailId,
    senderAccountId: canonical.senderAccountId,
    recipientAccountId: canonical.recipientAccountId,
    location: "active",
    createdAt: canonical.createdAt,
    settledAt,
    archivedAt: null,
    identityDigest: stableDigest({
      kind: "beastbound_mail_identity",
      schemaVersion: 1,
      mailId: canonical.mailId,
      senderAccountId: canonical.senderAccountId,
      recipientAccountId: canonical.recipientAccountId,
      createdAt: canonical.createdAt,
    }),
    documentDigest: stableDigest({
      kind: "beastbound_mail_document",
      schemaVersion: 1,
      mailId: canonical.mailId,
      document: canonical,
    }),
    rewardId: null,
    dataGeneration,
    revision,
  });
}

// Pure generation fence and row-local projection boundary. It performs no
// SQL, clocks or global scans. A caller must hold and certify the storage
// control fence before invoking this plan. Generation zero intentionally does
// not inspect mail deltas: the sidecars do not exist yet and legacy writes must
// continue unchanged until bootstrap reaches ready.
function buildMailStorageForwardMaintenancePlan(options = {}) {
  const storage = classifyStorageState(options && options.storageState);
  if (!storage.ok) {
    return finalizePlan(storage, [], [], [], [storage.error]);
  }
  if (!storage.sidecarEnabled) {
    return finalizePlan(storage, [], [], [], []);
  }

  const changesValue = options && options.changes;
  const certifyAttachment = options && options.certifyAttachment;
  const errors = [];
  if (!Array.isArray(changesValue)) {
    errors.push(planError("mail_storage_forward_changes_invalid", "changes"));
  }
  if (typeof certifyAttachment !== "function") {
    errors.push(planError(
      "mail_storage_forward_attachment_certifier_missing",
      "certifyAttachment",
    ));
  }
  if (errors.length > 0) {
    return finalizePlan(storage, [], [], [], errors);
  }

  const changes = normalizeChanges(changesValue, errors);
  if (errors.length > 0) {
    return finalizePlan(storage, [], [], [], errors);
  }

  const identityInserts = [];
  const identityUpdates = [];
  const incrementByRecipient = new Map();
  for (const change of changes) {
    if (change.disposition === "delete") {
      errors.push(planError(
        "mail_storage_forward_delete_forbidden",
        change.path,
        change.mailId,
      ));
      continue;
    }
    if (change.disposition === "insert") {
      const inserted = certifyForwardMail(
        change.after,
        certifyAttachment,
        `${change.path}.after`,
        {requireCanonicalCreatedAt: true},
      );
      if (!inserted.ok) {
        errors.push(inserted.error);
        continue;
      }
      if (inserted.mail.mailId !== change.mailId) {
        errors.push(planError(
          "mail_storage_forward_identity_drift",
          change.path,
          change.mailId,
        ));
        continue;
      }
      identityInserts.push(projectActiveMailIdentityRow({
        mail: inserted.mail,
        settledAt: inserted.lifecycle.settled === true
          ? inserted.lifecycle.settledAt
          : null,
        dataGeneration: MAIL_STORAGE_FORWARD_DATA_GENERATION,
        revision: 0,
      }));
      incrementByRecipient.set(
        inserted.mail.recipientAccountId,
        Number(incrementByRecipient.get(inserted.mail.recipientAccountId) || 0) + 1,
      );
      continue;
    }

    const before = certifyForwardMail(
      change.before,
      certifyAttachment,
      `${change.path}.before`,
    );
    const after = certifyForwardMail(
      change.after,
      certifyAttachment,
      `${change.path}.after`,
    );
    if (!before.ok) {
      errors.push(before.error);
      continue;
    }
    if (!after.ok) {
      errors.push(after.error);
      continue;
    }
    if (!samePermanentIdentity(change.mailId, before.mail, after.mail)) {
      errors.push(planError(
        "mail_storage_forward_identity_drift",
        change.path,
        change.mailId,
      ));
      continue;
    }
    const previousSettledAt = before.lifecycle.settled === true
      ? before.lifecycle.settledAt
      : null;
    const nextSettledAt = after.lifecycle.settled === true
      ? after.lifecycle.settledAt
      : null;
    if (previousSettledAt !== null && nextSettledAt !== previousSettledAt) {
      errors.push(planError(
        "mail_storage_forward_settlement_transition_invalid",
        `${change.path}.after.settledAt`,
        change.mailId,
      ));
      continue;
    }
    const previousIdentity = projectActiveMailIdentityRow({
      mail: before.mail,
      settledAt: previousSettledAt,
      dataGeneration: MAIL_STORAGE_FORWARD_DATA_GENERATION,
      revision: 0,
    });
    const nextIdentity = projectActiveMailIdentityRow({
      mail: after.mail,
      settledAt: nextSettledAt,
      dataGeneration: MAIL_STORAGE_FORWARD_DATA_GENERATION,
      revision: 0,
    });
    identityUpdates.push({
      mailId: nextIdentity.mailId,
      senderAccountId: nextIdentity.senderAccountId,
      recipientAccountId: nextIdentity.recipientAccountId,
      createdAt: nextIdentity.createdAt,
      identityDigest: nextIdentity.identityDigest,
      previousDocumentDigest: previousIdentity.documentDigest,
      nextDocumentDigest: nextIdentity.documentDigest,
      previousSettledAt,
      nextSettledAt,
      dataGeneration: MAIL_STORAGE_FORWARD_DATA_GENERATION,
    });
  }

  const counterIncrements = Array.from(incrementByRecipient.entries())
    .sort(([left], [right]) => compareCanonicalText(left, right))
    .map(([recipientAccountId, incrementBy]) => ({
      recipientAccountId,
      incrementBy,
      dataGeneration: MAIL_STORAGE_FORWARD_DATA_GENERATION,
    }));
  if (errors.length > 0) {
    return finalizePlan(storage, [], [], [], errors);
  }
  return finalizePlan(
    storage,
    identityInserts,
    identityUpdates,
    counterIncrements,
    [],
  );
}

function classifyStorageState(value) {
  if (!isObject(value) || value.controlFence !== true) {
    return failedStorageState("mail_storage_forward_control_fence_invalid", "storageState.controlFence");
  }
  if (
    Object.hasOwn(value, "schemaGeneration")
    && value.schemaGeneration !== MAIL_STORAGE_SCHEMA_GENERATION
  ) {
    return failedStorageState(
      "mail_storage_forward_storage_state_invalid",
      "storageState.schemaGeneration",
    );
  }
  if (value.dataGeneration === 0 && value.lifecycleState === "uninitialized") {
    return {
      ok: true,
      controlFence: true,
      dataGeneration: 0,
      sidecarEnabled: false,
    };
  }
  if (
    value.dataGeneration === MAIL_STORAGE_FORWARD_DATA_GENERATION
    && value.lifecycleState === "ready"
  ) {
    return {
      ok: true,
      controlFence: true,
      dataGeneration: MAIL_STORAGE_FORWARD_DATA_GENERATION,
      sidecarEnabled: true,
    };
  }
  return failedStorageState(
    "mail_storage_forward_storage_state_invalid",
    "storageState",
  );
}

function failedStorageState(code, path) {
  return {
    ok: false,
    controlFence: false,
    dataGeneration: null,
    sidecarEnabled: false,
    error: planError(code, path),
  };
}

function normalizeChanges(value, errors) {
  const changes = [];
  for (const [index, change] of value.entries()) {
    const path = `changes[${index}]`;
    if (!isObject(change)) {
      errors.push(planError("mail_storage_forward_change_invalid", path));
      continue;
    }
    const disposition = change.disposition;
    const mailId = change.mailId;
    if (
      !["insert", "update", "delete"].includes(disposition)
      || !canonicalStorageIdentity(mailId, 96)
      || (disposition === "insert" && !isObject(change.after))
      || (disposition === "update" && (!isObject(change.before) || !isObject(change.after)))
    ) {
      errors.push(planError(
        "mail_storage_forward_change_invalid",
        path,
        typeof mailId === "string" ? mailId : "",
      ));
      continue;
    }
    changes.push({
      disposition,
      mailId,
      before: change.before,
      after: change.after,
      path,
      sourceIndex: index,
    });
  }
  changes.sort((left, right) => (
    compareCanonicalText(left.mailId, right.mailId)
    || compareCanonicalText(left.disposition, right.disposition)
    || left.sourceIndex - right.sourceIndex
  ));
  for (let index = 1; index < changes.length; index += 1) {
    if (changes[index - 1].mailId === changes[index].mailId) {
      errors.push(planError(
        "mail_storage_forward_change_duplicate",
        changes[index].path,
        changes[index].mailId,
      ));
    }
  }
  return changes;
}

function certifyForwardMail(value, certifyAttachment, path, options = {}) {
  const authority = canonicalMailDocument(value);
  if (!authority.ok) {
    return failedCertification(authority.code, path, safeMailId(value));
  }
  const mail = authority.mail;
  if (
    !canonicalStorageIdentity(mail.mailId, 96)
    || !canonicalStorageIdentity(mail.senderAccountId, 80)
    || !canonicalStorageIdentity(mail.recipientAccountId, 80)
    || typeof mail.createdAt !== "string"
    || mail.createdAt === ""
    || mail.createdAt.length > 40
    || (options.requireCanonicalCreatedAt === true
      && canonicalMailLifecycleIsoTimestamp(mail.createdAt) === "")
  ) {
    return failedCertification(
      "mail_storage_forward_identity_invalid",
      path,
      safeMailId(mail),
    );
  }
  let attachment;
  try {
    attachment = certifyAttachment(mail);
  } catch {
    return failedCertification(
      "mail_storage_forward_attachment_certifier_failed",
      path,
      mail.mailId,
    );
  }
  if (!attachment || attachment.ok !== true) {
    return failedCertification(
      typeof (attachment && attachment.code) === "string" && attachment.code !== ""
        ? attachment.code
        : "mail_storage_forward_attachment_invalid",
      path,
      mail.mailId,
    );
  }
  const lifecycle = readMailLifecycleState(mail, attachment);
  if (!lifecycle.ok) {
    return failedCertification(lifecycle.code, path, mail.mailId);
  }
  return {ok: true, mail, lifecycle};
}

function samePermanentIdentity(mailId, before, after) {
  return before.mailId === mailId
    && after.mailId === mailId
    && before.senderAccountId === after.senderAccountId
    && before.recipientAccountId === after.recipientAccountId
    && before.createdAt === after.createdAt;
}

function finalizePlan(storage, identityInserts, identityUpdates, counterIncrements, errors) {
  const safeErrors = [...errors]
    .map((entry) => ({...entry}))
    .sort(comparePlanErrors);
  const ok = storage.ok === true && safeErrors.length === 0;
  const plan = {
    kind: MAIL_STORAGE_FORWARD_MAINTENANCE_PLAN_KIND,
    schemaVersion: MAIL_STORAGE_FORWARD_MAINTENANCE_PLAN_SCHEMA_VERSION,
    ok,
    controlFence: storage.controlFence === true,
    dataGeneration: storage.dataGeneration,
    sidecarEnabled: storage.sidecarEnabled === true,
    identityInserts: ok
      ? [...identityInserts].sort((left, right) => compareCanonicalText(left.mailId, right.mailId))
      : [],
    identityUpdates: ok
      ? [...identityUpdates].sort((left, right) => compareCanonicalText(left.mailId, right.mailId))
      : [],
    counterIncrements: ok ? [...counterIncrements] : [],
    errors: safeErrors,
    planDigest: "",
  };
  plan.planDigest = stableDigest({
    kind: plan.kind,
    schemaVersion: plan.schemaVersion,
    ok: plan.ok,
    controlFence: plan.controlFence,
    dataGeneration: plan.dataGeneration,
    sidecarEnabled: plan.sidecarEnabled,
    identityInserts: plan.identityInserts,
    identityUpdates: plan.identityUpdates,
    counterIncrements: plan.counterIncrements,
    errors: plan.errors,
  });
  return deepFreeze(plan);
}

function planError(code, path, key = "") {
  const error = {
    code: String(code || "mail_storage_forward_invalid"),
    path: String(path || ""),
  };
  if (key !== "") {
    error.key = String(key);
  }
  return error;
}

function failedCertification(code, path, key = "") {
  return {ok: false, error: planError(code, path, key)};
}

function comparePlanErrors(left, right) {
  return compareCanonicalText(left.code, right.code)
    || compareCanonicalText(left.path, right.path)
    || compareCanonicalText(String(left.key || ""), String(right.key || ""));
}

function safeMailId(value) {
  return isObject(value) && typeof value.mailId === "string" ? value.mailId : "";
}

function canonicalStorageIdentity(value, maxLength) {
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

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function codedTypeError(code, message) {
  const error = new TypeError(message);
  error.code = code;
  return error;
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
  MAIL_STORAGE_FORWARD_DATA_GENERATION,
  MAIL_STORAGE_FORWARD_MAINTENANCE_PLAN_KIND,
  MAIL_STORAGE_FORWARD_MAINTENANCE_PLAN_SCHEMA_VERSION,
  buildMailStorageForwardMaintenancePlan,
  projectActiveMailIdentityRow,
};
