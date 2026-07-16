"use strict";

const crypto = require("node:crypto");
const {isDeepStrictEqual} = require("node:util");

const MAIL_STATE_BY_VIEW = new WeakMap();
const MAX_MAIL_ID_LENGTH = 96;
const MAIL_AUTHORITY_CHECKPOINT_HISTORY_MAX = 2048;
const MAIL_AUTHORITY_CHECKPOINT_DEAD_KEY_MAX = 1024;
let NEXT_MAIL_LINEAGE_ID = 1;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(code, message, details = {}) {
  return {ok: false, code, message, ...details};
}

function canonicalIdentity(value, maxLength = MAX_MAIL_ID_LENGTH) {
  return typeof value === "string"
    && value !== ""
    && value === value.trim()
    && value.length <= maxLength
    ? value
    : "";
}

function assertJsonValue(value, seen = new Set()) {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }
  if (!value || typeof value !== "object" || seen.has(value)) {
    throw new TypeError("mail document must be acyclic JSON");
  }
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) {
      throw new TypeError("mail array prototype is invalid");
    }
  } else if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("mail object prototype is invalid");
  }
  seen.add(value);
  for (const key of Object.keys(value)) {
    if (typeof value[key] === "undefined" || typeof value[key] === "function" || typeof value[key] === "symbol") {
      throw new TypeError("mail document contains a non-JSON value");
    }
    assertJsonValue(value[key], seen);
  }
  seen.delete(value);
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

function canonicalMailDocument(value, expectedMailId = "") {
  if (!isRecord(value)) {
    return fail(
      "mail_authority_document_invalid",
      "邮件权威记录异常，相关邮件操作已暂停，请联系GM处理。",
    );
  }
  let mail;
  try {
    assertJsonValue(value);
    mail = structuredClone(value);
  } catch {
    return fail(
      "mail_authority_document_invalid",
      "邮件权威记录异常，相关邮件操作已暂停，请联系GM处理。",
    );
  }
  const mailId = canonicalIdentity(mail.mailId);
  const recipientAccountId = canonicalIdentity(mail.recipientAccountId, 80);
  if (
    mailId === ""
    || recipientAccountId === ""
    || (expectedMailId !== "" && mailId !== expectedMailId)
  ) {
    return fail(
      "mail_authority_identity_invalid",
      "邮件索引与记录身份不一致，相关邮件操作已暂停，请联系GM处理。",
      {mailId, expectedMailId, recipientAccountId},
    );
  }
  return {ok: true, mail: deepFreeze(mail)};
}

function readMailAuthorityState(value) {
  if (value === undefined) {
    value = {};
  }
  if (!isRecord(value)) {
    return fail(
      "mail_authority_container_invalid",
      "邮件权威容器异常，相关邮件操作已暂停，请联系GM处理。",
    );
  }
  const cached = MAIL_STATE_BY_VIEW.get(value);
  if (cached) {
    return {ok: true, messages: value};
  }
  const baseline = new Map();
  for (const mailId of Object.keys(value).sort()) {
    if (canonicalIdentity(mailId) !== mailId) {
      return fail(
        "mail_authority_identity_invalid",
        "邮件索引与记录身份不一致，相关邮件操作已暂停，请联系GM处理。",
        {mailId},
      );
    }
    const canonical = canonicalMailDocument(value[mailId], mailId);
    if (!canonical.ok) {
      return {...canonical, path: `mailMessages.${mailId}`};
    }
    baseline.set(mailId, canonical.mail);
  }
  const lineage = createMailLineage(baseline);
  return {
    ok: true,
    messages: createMailView(lineage, 0, new Map()),
  };
}

function createMailLineage(baseline, options = {}) {
  const lineage = {
    baseline,
    checkpointCount: Math.max(0, Math.trunc(Number(options.checkpointCount || 0))),
    checkpointLastScannedMailIds: Math.max(
      0,
      Math.trunc(Number(options.checkpointLastScannedMailIds || 0)),
    ),
    checkpointScannedMailIds: Math.max(
      0,
      Math.trunc(Number(options.checkpointScannedMailIds || 0)),
    ),
    countByRevision: [baseline.size],
    historyEntryCount: 0,
    histories: new Map(),
    ids: new Set(baseline.keys()),
    lineageId: NEXT_MAIL_LINEAGE_ID,
    ownKeyEnumerations: Math.max(
      0,
      Math.trunc(Number(options.ownKeyEnumerations || 0)),
    ),
    revision: 0,
  };
  NEXT_MAIL_LINEAGE_ID += 1;
  return lineage;
}

function isCanonicalMailAuthorityState(value) {
  return isRecord(value) && MAIL_STATE_BY_VIEW.has(value);
}

function mailAtRevision(lineage, mailId, revision) {
  const history = lineage.histories.get(mailId);
  if (!history || history.length === 0) {
    return lineage.baseline.get(mailId) || null;
  }
  let low = 0;
  let high = history.length - 1;
  let match = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (history[middle].revision <= revision) {
      match = history[middle];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return match ? match.mail : (lineage.baseline.get(mailId) || null);
}

function visibleMail(state, mailId) {
  const change = state.changes.get(mailId);
  return change ? change.after : mailAtRevision(state.lineage, mailId, state.baseRevision);
}

function visibleMailIds(state) {
  const ids = new Set(state.lineage.ids);
  for (const mailId of state.changes.keys()) {
    ids.add(mailId);
  }
  return Array.from(ids)
    .filter((mailId) => Boolean(visibleMail(state, mailId)))
    .sort();
}

function createMailView(lineage, baseRevision, changes) {
  const state = {baseRevision, changes, lineage, signature: null};
  const target = {};
  const view = new Proxy(target, {
    defineProperty() {
      return false;
    },
    deleteProperty() {
      return false;
    },
    get(targetValue, property, receiver) {
      if (typeof property === "string") {
        const mail = visibleMail(state, property);
        if (mail) {
          return mail;
        }
      }
      return Reflect.get(targetValue, property, receiver);
    },
    getOwnPropertyDescriptor(targetValue, property) {
      if (typeof property === "string") {
        const mail = visibleMail(state, property);
        if (mail) {
          return {configurable: true, enumerable: true, value: mail, writable: false};
        }
      }
      return Reflect.getOwnPropertyDescriptor(targetValue, property);
    },
    has(targetValue, property) {
      return (
        (typeof property === "string" && Boolean(visibleMail(state, property)))
        || Reflect.has(targetValue, property)
      );
    },
    ownKeys() {
      state.lineage.ownKeyEnumerations += 1;
      return visibleMailIds(state);
    },
    preventExtensions() {
      return false;
    },
    set() {
      return false;
    },
    setPrototypeOf() {
      return false;
    },
  });
  MAIL_STATE_BY_VIEW.set(view, state);
  return view;
}

function stageMailAuthorityUpsert(value, mailValue) {
  const read = readMailAuthorityState(value);
  if (!read.ok || !isCanonicalMailAuthorityState(read.messages)) {
    return read;
  }
  const canonical = canonicalMailDocument(mailValue);
  if (!canonical.ok) {
    return canonical;
  }
  const state = MAIL_STATE_BY_VIEW.get(read.messages);
  const mailId = canonical.mail.mailId;
  const current = visibleMail(state, mailId);
  if (current && isDeepStrictEqual(current, canonical.mail)) {
    return {ok: true, messages: read.messages, changed: false, mail: current};
  }
  const changes = new Map(state.changes);
  const existing = changes.get(mailId);
  const before = existing ? existing.before : mailAtRevision(state.lineage, mailId, state.baseRevision);
  if (before && isDeepStrictEqual(before, canonical.mail)) {
    changes.delete(mailId);
  } else {
    changes.set(mailId, Object.freeze({before, after: canonical.mail}));
  }
  return {
    ok: true,
    messages: createMailView(state.lineage, state.baseRevision, changes),
    changed: true,
    mail: canonical.mail,
  };
}

function stageMailAuthorityDelete(value, mailIdValue) {
  const read = readMailAuthorityState(value);
  if (!read.ok || !isCanonicalMailAuthorityState(read.messages)) {
    return read;
  }
  const mailId = canonicalIdentity(mailIdValue);
  if (mailId === "") {
    return fail(
      "mail_authority_identity_invalid",
      "邮件编号无效，相关邮件操作已暂停，请联系GM处理。",
    );
  }
  const state = MAIL_STATE_BY_VIEW.get(read.messages);
  const current = visibleMail(state, mailId);
  if (!current) {
    return {ok: true, messages: read.messages, changed: false, deletedMail: null};
  }
  const changes = new Map(state.changes);
  const existing = changes.get(mailId);
  const before = existing ? existing.before : mailAtRevision(state.lineage, mailId, state.baseRevision);
  if (!before) {
    changes.delete(mailId);
  } else {
    changes.set(mailId, Object.freeze({before, after: null}));
  }
  return {
    ok: true,
    messages: createMailView(state.lineage, state.baseRevision, changes),
    changed: true,
    deletedMail: current,
  };
}

function stageMailAuthorityChanges(value, changesValue) {
  const read = readMailAuthorityState(value);
  if (!read.ok || !isCanonicalMailAuthorityState(read.messages)) {
    return read;
  }
  if (!Array.isArray(changesValue)) {
    return fail(
      "mail_authority_changes_invalid",
      "邮件权威变更批次无效，相关邮件操作已暂停，请联系GM处理。",
    );
  }
  const state = MAIL_STATE_BY_VIEW.get(read.messages);
  const changes = new Map(state.changes);
  for (const entry of changesValue) {
    if (!isRecord(entry)) {
      return fail(
        "mail_authority_changes_invalid",
        "邮件权威变更批次无效，相关邮件操作已暂停，请联系GM处理。",
      );
    }
    const mailId = canonicalIdentity(entry.mailId);
    if (mailId === "" || !Object.hasOwn(entry, "after")) {
      return fail(
        "mail_authority_identity_invalid",
        "邮件编号无效，相关邮件操作已暂停，请联系GM处理。",
      );
    }
    let after = null;
    if (entry.after !== null) {
      const canonical = canonicalMailDocument(entry.after, mailId);
      if (!canonical.ok) {
        return canonical;
      }
      after = canonical.mail;
    }
    const pending = changes.get(mailId);
    const before = pending
      ? pending.before
      : mailAtRevision(state.lineage, mailId, state.baseRevision);
    const current = pending ? pending.after : before;
    if ((current === null && after === null) || (
      current !== null && after !== null && isDeepStrictEqual(current, after)
    )) {
      continue;
    }
    if ((before === null && after === null) || (
      before !== null && after !== null && isDeepStrictEqual(before, after)
    )) {
      changes.delete(mailId);
    } else {
      changes.set(mailId, Object.freeze({before, after}));
    }
  }
  if (mailChangeMapsEqual(state.changes, changes)) {
    return {ok: true, messages: read.messages, changed: false};
  }
  return {
    ok: true,
    messages: createMailView(state.lineage, state.baseRevision, changes),
    changed: true,
  };
}

function mailChangeMapsEqual(left, right) {
  if (left.size !== right.size) {
    return false;
  }
  for (const [mailId, leftChange] of left.entries()) {
    const rightChange = right.get(mailId);
    if (!rightChange
      || leftChange.before !== rightChange.before
      || !isDeepStrictEqual(leftChange.after, rightChange.after)) {
      return false;
    }
  }
  return true;
}

function mailAuthorityDelta(value) {
  if (!isCanonicalMailAuthorityState(value)) {
    return {ok: false, reason: "not_canonical", changes: []};
  }
  const state = MAIL_STATE_BY_VIEW.get(value);
  return {
    ok: true,
    baseRevision: state.baseRevision,
    lineageId: state.lineage.lineageId,
    changes: Array.from(state.changes.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([mailId, change]) => Object.freeze({
        mailId,
        before: change.before,
        after: change.after,
        disposition: change.before === null
          ? "insert"
          : (change.after === null ? "delete" : "update"),
      })),
  };
}

function mailAuthorityDeltaFrom(previousValue, nextValue) {
  if (!isCanonicalMailAuthorityState(previousValue) || !isCanonicalMailAuthorityState(nextValue)) {
    return {ok: false, reason: "not_canonical", changes: []};
  }
  const previous = MAIL_STATE_BY_VIEW.get(previousValue);
  const next = MAIL_STATE_BY_VIEW.get(nextValue);
  if (previous.lineage !== next.lineage) {
    return {ok: false, reason: "different_lineage", changes: []};
  }
  if (previous.changes.size > 0) {
    return {ok: false, reason: "previous_pending", changes: []};
  }
  if (
    previous.baseRevision !== next.baseRevision
    || previous.baseRevision !== previous.lineage.revision
  ) {
    return {ok: false, reason: "revision_mismatch", changes: []};
  }
  for (const [mailId, change] of next.changes.entries()) {
    if (mailAtRevision(previous.lineage, mailId, previous.baseRevision) !== change.before) {
      return {ok: false, reason: "expected_before_mismatch", changes: []};
    }
  }
  return mailAuthorityDelta(nextValue);
}

function commitMailAuthorityDelta(value) {
  if (!isCanonicalMailAuthorityState(value)) {
    const error = new Error("邮件权威视图无效，拒绝提交。");
    error.code = "mail_authority_state_invalid";
    throw error;
  }
  const state = MAIL_STATE_BY_VIEW.get(value);
  if (state.changes.size === 0) {
    return value;
  }
  for (const [mailId, change] of state.changes.entries()) {
    if (mailAtRevision(state.lineage, mailId, state.lineage.revision) !== change.before) {
      const error = new Error("邮件权威视图提交冲突。");
      error.code = "mail_authority_commit_conflict";
      throw error;
    }
  }
  const revision = state.lineage.revision + 1;
  let count = state.lineage.countByRevision[state.lineage.revision] || 0;
  for (const [mailId, change] of state.changes.entries()) {
    if (!change.before && change.after) {
      count += 1;
    } else if (change.before && !change.after) {
      count -= 1;
    }
    const history = state.lineage.histories.get(mailId) || [];
    history.push({mail: change.after, revision});
    state.lineage.histories.set(mailId, history);
    state.lineage.historyEntryCount += 1;
    state.lineage.ids.add(mailId);
  }
  state.lineage.countByRevision.push(count);
  state.lineage.revision = revision;
  state.baseRevision = revision;
  state.changes = new Map();
  state.signature = null;
  checkpointMailLineageIfNeeded(state);
  return value;
}

function checkpointMailLineageIfNeeded(state) {
  const lineage = state.lineage;
  const activeCount = lineage.countByRevision[lineage.revision] || 0;
  const deadKeyCount = Math.max(0, lineage.ids.size - activeCount);
  if (
    lineage.historyEntryCount < MAIL_AUTHORITY_CHECKPOINT_HISTORY_MAX
    && deadKeyCount < MAIL_AUTHORITY_CHECKPOINT_DEAD_KEY_MAX
  ) {
    return;
  }
  const baseline = new Map();
  for (const mailId of lineage.ids) {
    const mail = mailAtRevision(lineage, mailId, lineage.revision);
    if (mail) {
      baseline.set(mailId, mail);
    }
  }
  state.lineage = createMailLineage(baseline, {
    checkpointCount: lineage.checkpointCount + 1,
    checkpointLastScannedMailIds: lineage.ids.size,
    checkpointScannedMailIds: lineage.checkpointScannedMailIds + lineage.ids.size,
    ownKeyEnumerations: lineage.ownKeyEnumerations,
  });
  state.baseRevision = 0;
  state.signature = null;
}

function rebaseMailAuthorityState(value) {
  if (!isCanonicalMailAuthorityState(value)) {
    return fail(
      "mail_authority_state_invalid",
      "邮件权威视图无效，拒绝换基线。",
    );
  }
  const state = MAIL_STATE_BY_VIEW.get(value);
  const changes = new Map();
  for (const [mailId, change] of state.changes.entries()) {
    const current = mailAtRevision(state.lineage, mailId, state.lineage.revision);
    if (current !== change.before) {
      return fail(
        "mail_authority_rebase_conflict",
        "邮件权威视图换基线冲突。",
        {mailId},
      );
    }
    changes.set(mailId, change);
  }
  if (state.baseRevision === state.lineage.revision) {
    return {ok: true, messages: value};
  }
  return {
    ok: true,
    messages: createMailView(state.lineage, state.lineage.revision, changes),
  };
}

function materializeMailAuthorityState(value) {
  const read = readMailAuthorityState(value);
  if (!read.ok || !isCanonicalMailAuthorityState(read.messages)) {
    return read;
  }
  const state = MAIL_STATE_BY_VIEW.get(read.messages);
  const messages = {};
  for (const mailId of visibleMailIds(state)) {
    Object.defineProperty(messages, mailId, {
      configurable: true,
      enumerable: true,
      value: structuredClone(visibleMail(state, mailId)),
      writable: true,
    });
  }
  return {ok: true, messages};
}

function mailAuthoritySignature(value) {
  if (!isCanonicalMailAuthorityState(value)) {
    return "mail-authority:invalid";
  }
  const state = MAIL_STATE_BY_VIEW.get(value);
  if (state.signature === null) {
    const hash = crypto.createHash("sha256");
    for (const [mailId, change] of Array.from(state.changes.entries())
      .sort(([left], [right]) => left.localeCompare(right))) {
      // Only touched rows participate. JSON property-order drift can cause a
      // conservative extra save, while a distinct player-asset result cannot
      // collapse into the same ordinary durable comparison.
      hash.update(JSON.stringify([mailId, change.before, change.after]), "utf8");
      hash.update("\n", "utf8");
    }
    state.signature = `mail-authority:${state.lineage.lineageId}:${state.baseRevision}:${hash.digest("hex")}`;
  }
  return state.signature;
}

function mailAuthorityStatesShareLineage(leftValue, rightValue) {
  const left = MAIL_STATE_BY_VIEW.get(leftValue);
  const right = MAIL_STATE_BY_VIEW.get(rightValue);
  return Boolean(left && right && left.lineage === right.lineage);
}

function mailAuthorityDiagnostics(value) {
  const state = MAIL_STATE_BY_VIEW.get(value);
  if (!state) {
    return {canonical: false, ownKeyEnumerations: 0};
  }
  return {
    canonical: true,
    baseRevision: state.baseRevision,
    checkpointCount: state.lineage.checkpointCount,
    checkpointLastScannedMailIds: state.lineage.checkpointLastScannedMailIds,
    checkpointScannedMailIds: state.lineage.checkpointScannedMailIds,
    deadKeyCount: Math.max(
      0,
      state.lineage.ids.size - (state.lineage.countByRevision[state.lineage.revision] || 0),
    ),
    historyEntryCount: state.lineage.historyEntryCount,
    lineageId: state.lineage.lineageId,
    ownKeyEnumerations: state.lineage.ownKeyEnumerations,
    pendingChanges: state.changes.size,
    trackedMailIds: state.lineage.ids.size,
  };
}

function mailAuthorityStateCanDescendFrom(previousValue, nextValue) {
  const previous = MAIL_STATE_BY_VIEW.get(previousValue);
  const next = MAIL_STATE_BY_VIEW.get(nextValue);
  if (!previous || !next || previous.lineage !== next.lineage || next.baseRevision < previous.baseRevision) {
    return false;
  }
  for (const [mailId, change] of previous.changes.entries()) {
    if (!isDeepStrictEqual(visibleMail(next, mailId), change.after)) {
      return false;
    }
  }
  return true;
}

module.exports = {
  MAIL_AUTHORITY_CHECKPOINT_DEAD_KEY_MAX,
  MAIL_AUTHORITY_CHECKPOINT_HISTORY_MAX,
  MAX_MAIL_ID_LENGTH,
  canonicalMailDocument,
  commitMailAuthorityDelta,
  isCanonicalMailAuthorityState,
  mailAuthorityDelta,
  mailAuthorityDeltaFrom,
  mailAuthorityDiagnostics,
  mailAuthoritySignature,
  mailAuthorityStateCanDescendFrom,
  mailAuthorityStatesShareLineage,
  materializeMailAuthorityState,
  readMailAuthorityState,
  rebaseMailAuthorityState,
  stageMailAuthorityDelete,
  stageMailAuthorityChanges,
  stageMailAuthorityUpsert,
};
