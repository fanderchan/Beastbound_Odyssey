"use strict";

const {
  collectMaterializedEquipmentEnvelopeTraces,
  readConsumedEquipmentEnvelopeLedger,
  validEnvelopeId,
} = require("./equipment-envelope-consumed-ledger");

const EQUIPMENT_ENVELOPE_REGISTRY_SCHEMA_VERSION = 1;

const OWNER_KIND_BANK = "bank";
const OWNER_KIND_MAIL = "mail";
const OWNER_KIND_MARKET = "market";
const OWNER_KIND_MATERIALIZED = "materialized";
const OWNER_KIND_CONSUMED = "consumed";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function objectEntries(value) {
  return Object.entries(isRecord(value) ? value : {});
}

function envelopeIdFrom(value) {
  return isRecord(value) && typeof value.envelopeId === "string"
    ? value.envelopeId.trim()
    : "";
}

function appendOwnership(target, envelopeId, kind, id, path, details = {}) {
  if (envelopeId === "") {
    return;
  }
  target.push({
    envelopeId,
    kind,
    id,
    path,
    ...details,
    schemaVersion: EQUIPMENT_ENVELOPE_REGISTRY_SCHEMA_VERSION,
  });
}

function scanProfileOwnerships(root, ownerships) {
  for (const [profileKey, document] of objectEntries(root.profiles)) {
    const profile = isRecord(document) && isRecord(document.profile) ? document.profile : null;
    if (!profile) {
      continue;
    }
    const playerId = String(document.playerId || profileKey || "").trim() || profileKey;
    const bank = isRecord(profile.bank) ? profile.bank : {};
    for (const [slotIndex, slot] of (Array.isArray(bank.slots) ? bank.slots : []).entries()) {
      for (const [envelopeIndex, envelope] of (Array.isArray(slot && slot.equipmentEnvelopes)
        ? slot.equipmentEnvelopes
        : []).entries()) {
        const ownerId = playerId;
        const envelopePath = `profiles.${profileKey}.profile.bank.slots[${slotIndex}].equipmentEnvelopes[${envelopeIndex}]`;
        appendOwnership(
          ownerships,
          envelopeIdFrom(envelope),
          OWNER_KIND_BANK,
          ownerId,
          envelopePath,
          {profileKey, playerId, slotIndex, envelopeIndex},
        );
      }
    }
  }
}

function scanMailOwnerships(root, ownerships) {
  for (const [mailKey, mail] of objectEntries(root.mailMessages)) {
    if (!isRecord(mail)) {
      continue;
    }
    const declaredMailId = String(mail.mailId || "").trim();
    for (const [envelopeIndex, envelope] of (Array.isArray(mail.equipmentEnvelopes)
      ? mail.equipmentEnvelopes
      : []).entries()) {
      const envelopePath = `mailMessages.${mailKey}.equipmentEnvelopes[${envelopeIndex}]`;
      appendOwnership(
        ownerships,
        envelopeIdFrom(envelope),
        OWNER_KIND_MAIL,
        mailKey,
        envelopePath,
        {mailKey, declaredMailId, envelopeIndex},
      );
    }
  }
}

function scanMarketOwnerships(root, ownerships) {
  for (const [listingKey, listing] of objectEntries(root.marketListings)) {
    if (!isRecord(listing)) {
      continue;
    }
    const listingId = String(listing.listingId || listingKey || "").trim() || listingKey;
    const envelopePath = `marketListings.${listingKey}.equipmentEnvelope`;
    appendOwnership(
      ownerships,
      envelopeIdFrom(listing.equipmentEnvelope),
      OWNER_KIND_MARKET,
      listingId,
      envelopePath,
      {listingKey, listingId},
    );
  }
}

function scanConsumedEnvelopeIds(root, conflicts) {
  const read = readConsumedEquipmentEnvelopeLedger(root.consumedEquipmentEnvelopes);
  if (!read.ok) {
    conflicts.push(clone(read));
    return new Set();
  }
  return new Set(Object.keys(read.ledger));
}

function ownershipFailure(code, message, details = {}) {
  return {ok: false, code, message, ...details};
}

function normalizeExpectedOwner(expectedOwner) {
  if (!isRecord(expectedOwner)) {
    return null;
  }
  const kind = typeof expectedOwner.kind === "string" ? expectedOwner.kind.trim() : "";
  const id = typeof expectedOwner.id === "string" ? expectedOwner.id.trim() : "";
  return kind !== "" && id !== "" ? {kind, id} : null;
}

function createEquipmentEnvelopeOwnershipRegistry(rootValue) {
  const root = isRecord(rootValue) ? rootValue : {};
  const ownerships = [];
  const conflicts = [];
  scanProfileOwnerships(root, ownerships);
  scanMailOwnerships(root, ownerships);
  scanMarketOwnerships(root, ownerships);
  const consumedEnvelopeIds = scanConsumedEnvelopeIds(root, conflicts);
  const materializedTraces = collectMaterializedEquipmentEnvelopeTraces(root);
  for (const trace of materializedTraces) {
    if (trace.invalidReason || !validEnvelopeId(trace.originEnvelopeId)) {
      conflicts.push(ownershipFailure(
        "equipment_materialized_origin_invalid",
        "装备实例含无效的历史转运凭证，相关资产操作已暂停，请联系GM处理。",
        {
          path: trace.path,
          originEnvelopeId: trace.originEnvelopeId,
          reason: trace.invalidReason || "invalid_id",
        },
      ));
    }
  }
  const validTracesByOrigin = new Map();
  for (const trace of materializedTraces.filter((entry) => (
    !entry.invalidReason && validEnvelopeId(entry.originEnvelopeId)
  ))) {
    const entries = validTracesByOrigin.get(trace.originEnvelopeId) || [];
    entries.push(trace);
    validTracesByOrigin.set(trace.originEnvelopeId, entries);
  }
  for (const [originEnvelopeId, traces] of validTracesByOrigin.entries()) {
    if (traces.length > 1) {
      conflicts.push(ownershipFailure(
        "equipment_materialized_origin_duplicate",
        "同一历史转运凭证被多个装备状态引用，相关资产操作已暂停，请联系GM处理。",
        {originEnvelopeId, traces: clone(traces)},
      ));
    }
  }
  ownerships.sort((left, right) => (
    left.envelopeId.localeCompare(right.envelopeId)
    || left.path.localeCompare(right.path)
  ));
  const ownershipsById = new Map();
  for (const ownership of ownerships) {
    const entries = ownershipsById.get(ownership.envelopeId) || [];
    entries.push(ownership);
    ownershipsById.set(ownership.envelopeId, entries);
  }
  for (const [originEnvelopeId, traces] of validTracesByOrigin.entries()) {
    const activeEntries = ownershipsById.get(originEnvelopeId) || [];
    if (activeEntries.length > 0) {
      conflicts.push(ownershipFailure(
        "equipment_materialized_origin_active",
        "已实例化装备的历史转运凭证仍出现在托管容器中，相关资产操作已暂停，请联系GM处理。",
        {originEnvelopeId, traces: clone(traces), ownerships: clone(activeEntries)},
      ));
    }
  }
  const duplicates = Array.from(ownershipsById.entries())
    .filter(([, entries]) => entries.length > 1)
    .map(([envelopeId, entries]) => ({
      envelopeId,
      ownerships: clone(entries),
      schemaVersion: EQUIPMENT_ENVELOPE_REGISTRY_SCHEMA_VERSION,
    }));
  const duplicateById = new Map(duplicates.map((entry) => [entry.envelopeId, entry]));
  for (const [envelopeId, activeEntries] of ownershipsById.entries()) {
    if (!consumedEnvelopeIds.has(envelopeId)) {
      continue;
    }
    const consumedOwnership = {
      envelopeId,
      kind: OWNER_KIND_CONSUMED,
      id: envelopeId,
      path: `consumedEquipmentEnvelopes.${envelopeId}`,
      schemaVersion: EQUIPMENT_ENVELOPE_REGISTRY_SCHEMA_VERSION,
    };
    const existingDuplicate = duplicateById.get(envelopeId);
    if (existingDuplicate) {
      existingDuplicate.ownerships.unshift(consumedOwnership);
    } else {
      const duplicate = {
        envelopeId,
        ownerships: [consumedOwnership, ...clone(activeEntries)],
        schemaVersion: EQUIPMENT_ENVELOPE_REGISTRY_SCHEMA_VERSION,
      };
      duplicates.push(duplicate);
      duplicateById.set(envelopeId, duplicate);
    }
  }
  duplicates.sort((left, right) => left.envelopeId.localeCompare(right.envelopeId));
  for (const duplicate of duplicates) {
    conflicts.push(ownershipFailure(
      "equipment_transfer_envelope_duplicate",
      "同一装备转运凭证存在多个权威归属，相关资产操作已暂停，请联系GM处理。",
      clone(duplicate),
    ));
  }

  function ownershipsFor(envelopeIdValue) {
    const envelopeId = String(envelopeIdValue || "").trim();
    return clone(ownershipsById.get(envelopeId) || []);
  }

  function isAvailable(envelopeIdValue) {
    const envelopeId = String(envelopeIdValue || "").trim();
    return (
      envelopeId !== ""
      && !ownershipsById.has(envelopeId)
      && !consumedEnvelopeIds.has(envelopeId)
      && !validTracesByOrigin.has(envelopeId)
    );
  }

  function isConsumed(envelopeIdValue) {
    return consumedEnvelopeIds.has(String(envelopeIdValue || "").trim());
  }

  function requireUnique(envelopeIdValue, expectedOwnerValue) {
    const envelopeId = String(envelopeIdValue || "").trim();
    const expectedOwner = normalizeExpectedOwner(expectedOwnerValue);
    if (envelopeId === "" || !expectedOwner) {
      return ownershipFailure(
        "equipment_transfer_envelope_ownership_invalid",
        "装备转运凭证的权威归属请求无效。",
      );
    }
    const entries = ownershipsById.get(envelopeId) || [];
    if (consumedEnvelopeIds.has(envelopeId)) {
      return ownershipFailure(
        "equipment_transfer_envelope_duplicate",
        "这个装备转运凭证已经消费，却再次出现在托管容器中，本次操作已取消，请联系GM处理。",
        {envelopeId, ownerships: clone(entries)},
      );
    }
    if (entries.length === 0) {
      return ownershipFailure(
        "equipment_transfer_envelope_ownership_missing",
        "装备转运凭证已不存在，请刷新后重试。",
        {envelopeId},
      );
    }
    if (entries.length > 1) {
      return ownershipFailure(
        "equipment_transfer_envelope_duplicate",
        "同一装备转运凭证存在多个权威归属，本次操作已取消，请联系GM处理。",
        {envelopeId, ownerships: clone(entries)},
      );
    }
    const ownership = entries[0];
    if (ownership.kind !== expectedOwner.kind || ownership.id !== expectedOwner.id) {
      return ownershipFailure(
        "equipment_transfer_envelope_ownership_mismatch",
        "装备转运凭证的权威归属已经变化，请刷新后重试。",
        {envelopeId, ownership: clone(ownership), expectedOwner},
      );
    }
    return {ok: true, envelopeId, ownership: clone(ownership)};
  }

  function requireMaterializedInstanceOrigin(playerIdValue, instanceIdValue) {
    const playerId = String(playerIdValue || "").trim();
    const instanceId = String(instanceIdValue || "").trim();
    if (playerId === "" || instanceId === "") {
      return {ok: true, hasOrigin: false};
    }
    const ownerId = `${playerId}:${instanceId}`;
    const materialized = materializedTraces.filter((entry) => (
      entry.ownerId === ownerId
    ));
    if (materialized.length === 0) {
      return {ok: true, hasOrigin: false};
    }
    if (materialized.length > 1) {
      return ownershipFailure(
        "equipment_transfer_envelope_duplicate",
        "同一装备实例记录了多个来源凭证，本次操作已取消，请联系GM处理。",
        {ownerId, ownerships: clone(materialized)},
      );
    }
    const originEnvelopeId = materialized[0].originEnvelopeId;
    if (!validEnvelopeId(originEnvelopeId)) {
      return ownershipFailure(
        "equipment_materialized_origin_invalid",
        "装备实例含无效的历史转运凭证，本次操作已取消，请联系GM处理。",
        {ownerId, path: materialized[0].path, originEnvelopeId},
      );
    }
    const sameOriginTraces = validTracesByOrigin.get(originEnvelopeId) || [];
    if (sameOriginTraces.length > 1) {
      return ownershipFailure(
        "equipment_materialized_origin_duplicate",
        "同一历史转运凭证被多个装备状态引用，本次操作已取消，请联系GM处理。",
        {originEnvelopeId, traces: clone(sameOriginTraces)},
      );
    }
    const activeEntries = ownershipsById.get(originEnvelopeId) || [];
    if (activeEntries.length > 0) {
      return ownershipFailure(
        "equipment_transfer_envelope_duplicate",
        "装备实例的历史转运凭证再次出现在托管容器中，本次操作已取消，请联系GM处理。",
        {ownerId, envelopeId: originEnvelopeId, ownerships: clone(activeEntries)},
      );
    }
    return {
      ok: true,
      hasOrigin: true,
      envelopeId: originEnvelopeId,
      consumed: consumedEnvelopeIds.has(originEnvelopeId),
      needsLedgerBackfill: !consumedEnvelopeIds.has(originEnvelopeId),
    };
  }

  return Object.freeze({
    schemaVersion: EQUIPMENT_ENVELOPE_REGISTRY_SCHEMA_VERSION,
    ownerships: clone(ownerships),
    duplicates: clone(duplicates),
    conflicts: clone(conflicts),
    materializedTraces: clone(materializedTraces),
    consumedEnvelopeCount: consumedEnvelopeIds.size,
    ownershipsFor,
    isAvailable,
    isConsumed,
    requireUnique,
    requireMaterializedInstanceOrigin,
  });
}

module.exports = {
  EQUIPMENT_ENVELOPE_REGISTRY_SCHEMA_VERSION,
  OWNER_KIND_BANK,
  OWNER_KIND_MAIL,
  OWNER_KIND_MARKET,
  OWNER_KIND_MATERIALIZED,
  OWNER_KIND_CONSUMED,
  createEquipmentEnvelopeOwnershipRegistry,
};
