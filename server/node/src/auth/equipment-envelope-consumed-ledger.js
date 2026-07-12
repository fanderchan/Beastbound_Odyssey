"use strict";

const CONSUMED_EQUIPMENT_ENVELOPE_SCHEMA_VERSION = 1;
const MAX_EQUIPMENT_ENVELOPE_ID_LENGTH = 160;
const LEDGER_RECORD_FIELDS = new Set(["schemaVersion", "envelopeId"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function fail(code, message, details = {}) {
  return {ok: false, code, message, ...details};
}

function validEnvelopeId(value) {
  return (
    typeof value === "string"
    && value !== ""
    && value === value.trim()
    && value.length <= MAX_EQUIPMENT_ENVELOPE_ID_LENGTH
    && /^eqx_[A-Za-z0-9_-]{8,156}$/.test(value)
  );
}

function exactLedgerRecord(value) {
  return (
    isRecord(value)
    && Object.keys(value).length === LEDGER_RECORD_FIELDS.size
    && Object.keys(value).every((key) => LEDGER_RECORD_FIELDS.has(key))
  );
}

function readConsumedEquipmentEnvelopeLedger(value) {
  if (value === undefined) {
    return {ok: true, ledger: {}};
  }
  if (!isRecord(value)) {
    return fail(
      "equipment_consumed_ledger_invalid",
      "装备转运消费账本容器异常，相关资产操作已暂停，请联系GM处理。",
      {path: "consumedEquipmentEnvelopes", reason: "not_object"},
    );
  }
  const ledger = {};
  for (const envelopeId of Object.keys(value).sort()) {
    const record = value[envelopeId];
    if (!validEnvelopeId(envelopeId)) {
      return fail(
        "equipment_consumed_ledger_identity_invalid",
        "装备转运消费账本含无效凭证编号，相关资产操作已暂停，请联系GM处理。",
        {path: `consumedEquipmentEnvelopes.${envelopeId}`, envelopeId},
      );
    }
    if (!exactLedgerRecord(record)) {
      return fail(
        "equipment_consumed_ledger_record_invalid",
        "装备转运消费账本记录异常，相关资产操作已暂停，请联系GM处理。",
        {path: `consumedEquipmentEnvelopes.${envelopeId}`, envelopeId},
      );
    }
    if (record.schemaVersion !== CONSUMED_EQUIPMENT_ENVELOPE_SCHEMA_VERSION) {
      const code = Number(record.schemaVersion) > CONSUMED_EQUIPMENT_ENVELOPE_SCHEMA_VERSION
        ? "equipment_consumed_ledger_schema_future"
        : "equipment_consumed_ledger_schema_invalid";
      return fail(
        code,
        "装备转运消费账本版本异常，相关资产操作已暂停，请联系GM处理。",
        {path: `consumedEquipmentEnvelopes.${envelopeId}`, envelopeId, schemaVersion: record.schemaVersion},
      );
    }
    if (record.envelopeId !== envelopeId || !validEnvelopeId(record.envelopeId)) {
      return fail(
        "equipment_consumed_ledger_identity_conflict",
        "装备转运消费账本索引与记录身份不一致，相关资产操作已暂停，请联系GM处理。",
        {
          path: `consumedEquipmentEnvelopes.${envelopeId}`,
          envelopeId,
          declaredEnvelopeId: record.envelopeId,
        },
      );
    }
    ledger[envelopeId] = clone(record);
  }
  return {ok: true, ledger};
}

function ensureConsumedEquipmentEnvelopeIds(ledgerValue, envelopeIdsValue) {
  const read = readConsumedEquipmentEnvelopeLedger(ledgerValue);
  if (!read.ok) {
    return read;
  }
  return ensureIdsOnCanonicalLedger(read.ledger, envelopeIdsValue);
}

function ensureIdsOnCanonicalLedger(canonicalLedger, envelopeIdsValue) {
  const ids = Array.isArray(envelopeIdsValue) ? envelopeIdsValue : [envelopeIdsValue];
  const normalizedIds = new Set();
  for (const rawId of ids) {
    if (!validEnvelopeId(rawId)) {
      return fail(
        "equipment_consumed_envelope_id_invalid",
        "要写入消费账本的装备转运凭证编号无效，本次操作已取消。",
        {envelopeId: rawId},
      );
    }
    normalizedIds.add(rawId);
  }
  const ledger = {...canonicalLedger};
  const addedIds = [];
  for (const envelopeId of Array.from(normalizedIds).sort()) {
    if (Object.hasOwn(ledger, envelopeId)) {
      continue;
    }
    ledger[envelopeId] = {
      schemaVersion: CONSUMED_EQUIPMENT_ENVELOPE_SCHEMA_VERSION,
      envelopeId,
    };
    addedIds.push(envelopeId);
  }
  return {ok: true, ledger, addedIds};
}

function originTrace(target, rawOriginEnvelopeId, path, details = {}, invalidReason = "") {
  target.push({
    originEnvelopeId: rawOriginEnvelopeId,
    path,
    ...details,
    ...(invalidReason === "" ? {} : {invalidReason}),
    schemaVersion: CONSUMED_EQUIPMENT_ENVELOPE_SCHEMA_VERSION,
  });
}

function appendEnvelopeOriginTrace(target, envelope, basePath, details = {}) {
  const state = isRecord(envelope) && isRecord(envelope.instanceState) ? envelope.instanceState : null;
  if (!state || !Object.hasOwn(state, "transferProvenance")) {
    return;
  }
  const path = `${basePath}.instanceState.transferProvenance.originEnvelopeId`;
  if (!isRecord(state.transferProvenance)) {
    originTrace(target, undefined, path, details, "transfer_provenance_not_object");
    return;
  }
  if (!Object.hasOwn(state.transferProvenance, "originEnvelopeId")) {
    originTrace(target, undefined, path, details, "origin_envelope_id_missing");
    return;
  }
  originTrace(target, state.transferProvenance.originEnvelopeId, path, details);
}

function collectMaterializedEquipmentEnvelopeTraces(rootValue) {
  const root = isRecord(rootValue) ? rootValue : {};
  const traces = [];
  for (const [profileKey, document] of Object.entries(isRecord(root.profiles) ? root.profiles : {})) {
    const profile = isRecord(document) && isRecord(document.profile) ? document.profile : null;
    if (!profile) {
      continue;
    }
    const playerId = String(document.playerId || profileKey || "").trim() || profileKey;
    for (const [instanceId, instance] of Object.entries(isRecord(profile.equipmentInstances)
      ? profile.equipmentInstances
      : {})) {
      if (isRecord(instance) && Object.hasOwn(instance, "transferProvenance")) {
        const path = `profiles.${profileKey}.profile.equipmentInstances.${instanceId}.transferProvenance.originEnvelopeId`;
        if (!isRecord(instance.transferProvenance)) {
          originTrace(
            traces,
            undefined,
            path,
            {ownerId: `${playerId}:${instanceId}`, playerId, instanceId, traceContainerKind: "profile"},
            "transfer_provenance_not_object",
          );
          continue;
        }
        if (!Object.hasOwn(instance.transferProvenance, "originEnvelopeId")) {
          originTrace(
            traces,
            undefined,
            path,
            {ownerId: `${playerId}:${instanceId}`, playerId, instanceId, traceContainerKind: "profile"},
            "origin_envelope_id_missing",
          );
          continue;
        }
        originTrace(
          traces,
          instance.transferProvenance.originEnvelopeId,
          path,
          {ownerId: `${playerId}:${instanceId}`, playerId, instanceId, traceContainerKind: "profile"},
        );
      }
    }
    const bank = isRecord(profile.bank) ? profile.bank : {};
    for (const [slotIndex, slot] of (Array.isArray(bank.slots) ? bank.slots : []).entries()) {
      for (const [envelopeIndex, envelope] of (Array.isArray(slot && slot.equipmentEnvelopes)
        ? slot.equipmentEnvelopes
        : []).entries()) {
        appendEnvelopeOriginTrace(
          traces,
          envelope,
          `profiles.${profileKey}.profile.bank.slots[${slotIndex}].equipmentEnvelopes[${envelopeIndex}]`,
          {
            ownerId: `bank:${playerId}:${slotIndex}:${envelopeIndex}`,
            playerId,
            slotIndex,
            envelopeIndex,
            traceContainerKind: "bank",
          },
        );
      }
    }
  }
  for (const [mailKey, mail] of Object.entries(isRecord(root.mailMessages) ? root.mailMessages : {})) {
    for (const [envelopeIndex, envelope] of (Array.isArray(mail && mail.equipmentEnvelopes)
      ? mail.equipmentEnvelopes
      : []).entries()) {
      appendEnvelopeOriginTrace(
        traces,
        envelope,
        `mailMessages.${mailKey}.equipmentEnvelopes[${envelopeIndex}]`,
        {ownerId: `mail:${mailKey}:${envelopeIndex}`, mailKey, envelopeIndex, traceContainerKind: "mail"},
      );
    }
  }
  for (const [listingKey, listing] of Object.entries(isRecord(root.marketListings) ? root.marketListings : {})) {
    appendEnvelopeOriginTrace(
      traces,
      listing && listing.equipmentEnvelope,
      `marketListings.${listingKey}.equipmentEnvelope`,
      {ownerId: `market:${listingKey}`, listingKey, traceContainerKind: "market"},
    );
  }
  return traces.sort((left, right) => left.path.localeCompare(right.path));
}

function backfillConsumedEquipmentEnvelopeLedger(rootValue, ledgerValue = undefined) {
  const root = isRecord(rootValue) ? rootValue : {};
  const read = readConsumedEquipmentEnvelopeLedger(
    ledgerValue === undefined ? root.consumedEquipmentEnvelopes : ledgerValue,
  );
  if (!read.ok) {
    return read;
  }
  const traces = collectMaterializedEquipmentEnvelopeTraces(root);
  for (const trace of traces) {
    if (trace.invalidReason || !validEnvelopeId(trace.originEnvelopeId)) {
      return fail(
        "equipment_materialized_origin_invalid",
        "装备实例含无效的历史转运凭证，相关资产操作已暂停，请联系GM处理。",
        {path: trace.path, originEnvelopeId: trace.originEnvelopeId, reason: trace.invalidReason || "invalid_id"},
      );
    }
  }
  const ensured = ensureIdsOnCanonicalLedger(
    read.ledger,
    traces.map((trace) => trace.originEnvelopeId),
  );
  return ensured.ok ? {...ensured, traces} : ensured;
}

module.exports = {
  CONSUMED_EQUIPMENT_ENVELOPE_SCHEMA_VERSION,
  MAX_EQUIPMENT_ENVELOPE_ID_LENGTH,
  backfillConsumedEquipmentEnvelopeLedger,
  collectMaterializedEquipmentEnvelopeTraces,
  ensureConsumedEquipmentEnvelopeIds,
  readConsumedEquipmentEnvelopeLedger,
  validEnvelopeId,
};
