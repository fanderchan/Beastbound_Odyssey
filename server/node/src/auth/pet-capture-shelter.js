"use strict";

const crypto = require("node:crypto");
const {isDeepStrictEqual} = require("node:util");

// This profile-private envelope is deliberately broader than one UI feature:
// later automatic handling can reuse the same recovery boundary without
// inventing a second asset container.
const PROFILE_KEY = "petRecoveryShelter";
const SCHEMA_VERSION = 1;
const MAX_RECENT_COMPLETED_IDS = 100;
const MAX_COMPLETED_RECORDS = 256;
const COMPLETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const PARTY_LIMIT = 5;
const STORAGE_LIMIT = 20;
const TRUSTED_CAPTURE_SOURCE = "wild_capture";

const ROOT_KEYS = Object.freeze(["schemaVersion", "pending", "completed", "recentCompletedIds"]);
const PENDING_KEYS = Object.freeze([
  "schemaVersion",
  "recoveryId",
  "roomId",
  "actorId",
  "petInstanceId",
  "formId",
  "status",
  "pet",
  "createdAt",
]);
const COMPLETED_KEYS = Object.freeze([
  "schemaVersion",
  "recoveryId",
  "roomId",
  "actorId",
  "petInstanceId",
  "disposition",
  "completedAt",
]);

function isObjectRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasExactKeys(value, keys) {
  if (!isObjectRecord(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function stableId(value) {
  if (typeof value !== "string" || value === "" || value !== value.trim() || value.length > 256) {
    return "";
  }
  return value;
}

function stableTimestamp(value) {
  return typeof value === "string"
    && value !== ""
    && value === value.trim()
    && Number.isFinite(Date.parse(value))
    ? value
    : "";
}

function captureRecoveryId(roomId, actorId) {
  const normalizedRoomId = stableId(roomId);
  const normalizedActorId = stableId(actorId);
  if (normalizedRoomId === "" || normalizedActorId === "") {
    return "";
  }
  const digest = crypto.createHash("sha256")
    .update(JSON.stringify([normalizedRoomId, normalizedActorId]), "utf8")
    .digest("hex")
    .slice(0, 32);
  return `pet_capture_${digest}`;
}

function petIdentity(pet) {
  if (!isObjectRecord(pet)) {
    return {instanceId: "", formId: ""};
  }
  const instanceId = stableId(pet.instanceId);
  const petId = stableId(pet.petId);
  const formId = stableId(pet.formId);
  const templateId = stableId(pet.templateId);
  if (
    instanceId === ""
    || petId !== instanceId
    || formId === ""
    || templateId !== formId
  ) {
    return {instanceId: "", formId: ""};
  }
  return {instanceId, formId};
}

function validPendingRecord(record, expectedRecoveryId = "") {
  if (!hasExactKeys(record, PENDING_KEYS)) {
    return false;
  }
  const recoveryId = stableId(record.recoveryId);
  const roomId = stableId(record.roomId);
  const actorId = stableId(record.actorId);
  const identity = petIdentity(record.pet);
  return record.schemaVersion === SCHEMA_VERSION
    && recoveryId !== ""
    && (expectedRecoveryId === "" || recoveryId === expectedRecoveryId)
    && recoveryId === captureRecoveryId(roomId, actorId)
    && record.status === "pending"
    && identity.instanceId !== ""
    && record.petInstanceId === identity.instanceId
    && record.formId === identity.formId
    && record.pet.capturedBattleRoomId === roomId
    && record.pet.capturedBattleActorId === actorId
    && record.pet.source === TRUSTED_CAPTURE_SOURCE
    && ["standby", "storage"].includes(record.pet.state)
    && stableTimestamp(record.createdAt) !== ""
    && !hasOwn(record.pet, "captureSecret")
    && !hasOwn(record.pet, "integrityTag");
}

function validCompletedRecord(record) {
  return hasExactKeys(record, COMPLETED_KEYS)
    && record.schemaVersion === SCHEMA_VERSION
    && stableId(record.recoveryId) !== ""
    && record.recoveryId === captureRecoveryId(record.roomId, record.actorId)
    && stableId(record.petInstanceId) !== ""
    && ["party", "storage", "overflow_fallback"].includes(record.disposition)
    && stableTimestamp(record.completedAt) !== "";
}

function emptyShelter() {
  return {schemaVersion: SCHEMA_VERSION, pending: {}, completed: {}, recentCompletedIds: []};
}

function validatePendingShelter(profile) {
  if (!isObjectRecord(profile)) {
    return {ok: false, code: "pet_capture_shelter_profile_invalid"};
  }
  if (!hasOwn(profile, PROFILE_KEY)) {
    return {ok: true, shelter: emptyShelter()};
  }
  const shelter = profile[PROFILE_KEY];
  if (
    !hasExactKeys(shelter, ROOT_KEYS)
    || shelter.schemaVersion !== SCHEMA_VERSION
    || !isObjectRecord(shelter.pending)
    || !isObjectRecord(shelter.completed)
    || !Array.isArray(shelter.recentCompletedIds)
    || shelter.recentCompletedIds.length > MAX_RECENT_COMPLETED_IDS
    || Object.keys(shelter.completed).length > MAX_COMPLETED_RECORDS
  ) {
    return {ok: false, code: "pet_capture_shelter_invalid"};
  }
  const pendingRecoveryIds = Object.keys(shelter.pending);
  const pendingPetIds = new Set();
  for (const recoveryId of pendingRecoveryIds) {
    const record = shelter.pending[recoveryId];
    if (!validPendingRecord(record, recoveryId) || pendingPetIds.has(record.petInstanceId)) {
      return {ok: false, code: "pet_capture_shelter_invalid"};
    }
    pendingPetIds.add(record.petInstanceId);
  }
  return {ok: true, shelter};
}

function readShelter(profile) {
  const pendingRead = validatePendingShelter(profile);
  if (!pendingRead.ok) {
    return pendingRead;
  }
  const shelter = pendingRead.shelter;
  const completedRecoveryIds = new Set();
  for (const [recoveryId, record] of Object.entries(shelter.completed)) {
    if (
      !validCompletedRecord(record)
      || recoveryId !== record.recoveryId
      || completedRecoveryIds.has(record.recoveryId)
      || hasOwn(shelter.pending, record.recoveryId)
    ) {
      return {ok: false, code: "pet_capture_shelter_invalid"};
    }
    completedRecoveryIds.add(record.recoveryId);
  }
  if (
    shelter.recentCompletedIds.some((recoveryId) => (
      stableId(recoveryId) === ""
      || !completedRecoveryIds.has(recoveryId)
    ))
    || new Set(shelter.recentCompletedIds).size !== shelter.recentCompletedIds.length
  ) {
    return {ok: false, code: "pet_capture_shelter_invalid"};
  }
  return {ok: true, shelter: structuredClone(shelter)};
}

function pendingPetCaptures(profile) {
  // Capacity and filter hot paths only consume pending pets. Validate and
  // clone those records without cloning or walking every completed tombstone;
  // stage/recover still run the complete tombstone validation before writes.
  const read = validatePendingShelter(profile);
  if (!read.ok) {
    return read;
  }
  return {
    ok: true,
    records: Object.values(read.shelter.pending).map((record) => structuredClone(record)),
  };
}

function petCaptureRecoveryOpportunity(profile) {
  const pending = pendingPetCaptures(profile);
  if (!pending.ok) {
    return pending;
  }
  const instances = Array.isArray(profile && profile.petInstances)
    ? profile.petInstances
    : (Array.isArray(profile && profile.pets) ? profile.pets : []);
  const partyCount = instances.filter((pet) => pet && String(pet.state || "standby") !== "storage").length;
  const storageCount = instances.filter((pet) => pet && String(pet.state || "standby") === "storage").length;
  const available = Math.max(0, PARTY_LIMIT + STORAGE_LIMIT - partyCount - storageCount);
  return {
    ok: true,
    eligible: pending.records.length > 0 && available > 0,
    pendingCount: pending.records.length,
    partyCount,
    storageCount,
    available,
  };
}

function captureRecoveryOrder(record) {
  const capturedSerial = Number(record && record.pet && record.pet.capturedSerial);
  return Number.isSafeInteger(capturedSerial) && capturedSerial > 0
    ? capturedSerial
    : Number.MAX_SAFE_INTEGER;
}

function comparePendingCaptures(left, right) {
  return captureRecoveryOrder(left) - captureRecoveryOrder(right)
    || Date.parse(String(left && left.createdAt || "")) - Date.parse(String(right && right.createdAt || ""))
    || String(left && left.recoveryId || "").localeCompare(String(right && right.recoveryId || ""));
}

function reconcilePendingPetCaptures(profile, input) {
  if (
    !isObjectRecord(profile)
    || !isObjectRecord(input)
    || !hasExactKeys(input, ["completedAt"])
    || stableTimestamp(input.completedAt) === ""
  ) {
    return {ok: false, code: "pet_capture_shelter_reconcile_invalid"};
  }
  const pending = pendingPetCaptures(profile);
  if (!pending.ok) {
    return pending;
  }
  if (pending.records.length === 0) {
    return {
      ok: true,
      changed: false,
      recoveredCount: 0,
      remainingCount: 0,
      capacityFull: false,
      recoveries: [],
      profile,
    };
  }
  const candidate = structuredClone(profile);
  const recoveries = [];
  let capacityFull = false;
  for (const record of pending.records.sort(comparePendingCaptures)) {
    const recovered = recoverPetCapture(candidate, {
      recoveryId: record.recoveryId,
      completedAt: input.completedAt,
    });
    if (!recovered.ok) {
      if (recovered.code === "pet_capture_shelter_capacity_full") {
        capacityFull = true;
        break;
      }
      return {ok: false, code: recovered.code || "pet_capture_shelter_reconcile_failed"};
    }
    if (recovered.changed) {
      recoveries.push({
        recoveryId: String(recovered.recoveryId || ""),
        petInstanceId: String(recovered.petInstanceId || ""),
        formId: String(recovered.pet && (recovered.pet.formId || recovered.pet.templateId) || record.formId || ""),
        disposition: String(recovered.disposition || ""),
        replayed: Boolean(recovered.replayed),
      });
    }
  }
  const remaining = pendingPetCaptures(candidate);
  if (!remaining.ok) {
    return {ok: false, code: remaining.code || "pet_capture_shelter_reconcile_failed"};
  }
  return {
    ok: true,
    changed: recoveries.length > 0,
    recoveredCount: recoveries.length,
    remainingCount: remaining.records.length,
    capacityFull,
    recoveries,
    profile: candidate,
  };
}

function petMatchesCapture(pet, record) {
  const identity = petIdentity(pet);
  return identity.instanceId === record.petInstanceId
    && identity.formId === record.formId
    && pet.capturedBattleRoomId === record.roomId
    && pet.capturedBattleActorId === record.actorId;
}

function profilePetInstances(profile) {
  if (Array.isArray(profile.petInstances)) {
    return profile.petInstances;
  }
  if (Array.isArray(profile.pets)) {
    profile.petInstances = structuredClone(profile.pets);
    return profile.petInstances;
  }
  profile.petInstances = [];
  return profile.petInstances;
}

function completeRecord(record, disposition, completedAt) {
  return {
    schemaVersion: SCHEMA_VERSION,
    recoveryId: record.recoveryId,
    roomId: record.roomId,
    actorId: record.actorId,
    petInstanceId: record.petInstanceId,
    disposition,
    completedAt,
  };
}

function pruneCompleted(shelter, referenceAt) {
  const referenceMs = Date.parse(referenceAt);
  const cutoffMs = Number.isFinite(referenceMs)
    ? referenceMs - COMPLETED_RETENTION_MS
    : Number.NEGATIVE_INFINITY;
  const retained = Object.entries(shelter.completed)
    .filter(([, record]) => Date.parse(record.completedAt) >= cutoffMs)
    .sort((left, right) => (
      Date.parse(left[1].completedAt) - Date.parse(right[1].completedAt)
      || left[0].localeCompare(right[0])
    ))
    .slice(-MAX_COMPLETED_RECORDS);
  shelter.completed = Object.fromEntries(retained);
  const retainedIds = new Set(retained.map(([recoveryId]) => recoveryId));
  shelter.recentCompletedIds = shelter.recentCompletedIds
    .filter((recoveryId) => retainedIds.has(recoveryId))
    .slice(-MAX_RECENT_COMPLETED_IDS);
}

function appendCompleted(shelter, record) {
  shelter.completed[record.recoveryId] = record;
  shelter.recentCompletedIds = shelter.recentCompletedIds
    .filter((recoveryId) => recoveryId !== record.recoveryId)
    .concat([record.recoveryId])
    .slice(-MAX_RECENT_COMPLETED_IDS);
  pruneCompleted(shelter, record.completedAt);
}

function stagePetCapture(profile, input) {
  if (
    !isObjectRecord(input)
    || !hasExactKeys(input, ["roomId", "actorId", "pet", "createdAt"])
  ) {
    return {ok: false, code: "pet_capture_shelter_stage_invalid"};
  }
  const roomId = stableId(input.roomId);
  const actorId = stableId(input.actorId);
  const recoveryId = captureRecoveryId(roomId, actorId);
  const identity = petIdentity(input.pet);
  const createdAt = stableTimestamp(input.createdAt);
  const record = {
    schemaVersion: SCHEMA_VERSION,
    recoveryId,
    roomId,
    actorId,
    petInstanceId: identity.instanceId,
    formId: identity.formId,
    status: "pending",
    pet: isObjectRecord(input.pet) ? structuredClone(input.pet) : input.pet,
    createdAt,
  };
  if (recoveryId === "" || identity.instanceId === "" || createdAt === "" || !validPendingRecord(record, recoveryId)) {
    return {ok: false, code: "pet_capture_shelter_stage_invalid"};
  }
  const read = readShelter(profile);
  if (!read.ok) {
    return read;
  }
  const shelter = read.shelter;
  const completed = shelter.completed[recoveryId];
  if (completed) {
    return completed.petInstanceId === record.petInstanceId
      ? {ok: true, changed: false, replayed: true, recoveryId, petInstanceId: record.petInstanceId}
      : {ok: false, code: "pet_capture_shelter_identity_conflict"};
  }
  const existing = shelter.pending[recoveryId];
  if (existing) {
    return isDeepStrictEqual(existing, record)
      ? {ok: true, changed: false, replayed: true, recoveryId, petInstanceId: record.petInstanceId}
      : {ok: false, code: "pet_capture_shelter_identity_conflict"};
  }
  if (Object.values(shelter.pending).some((entry) => entry.petInstanceId === record.petInstanceId)) {
    return {ok: false, code: "pet_capture_shelter_identity_conflict"};
  }
  const instances = Array.isArray(profile.petInstances)
    ? profile.petInstances
    : (Array.isArray(profile.pets) ? profile.pets : []);
  const matchingPet = instances.find((pet) => petMatchesCapture(pet, record));
  if (matchingPet) {
    return {ok: true, changed: false, replayed: true, recoveryId, petInstanceId: record.petInstanceId};
  }
  if (instances.some((pet) => petIdentity(pet).instanceId === record.petInstanceId)) {
    return {ok: false, code: "pet_capture_shelter_identity_conflict"};
  }
  shelter.pending[recoveryId] = record;
  profile[PROFILE_KEY] = shelter;
  profile.nextPetInstanceSerial = Math.max(
    1,
    Math.trunc(Number(profile.nextPetInstanceSerial || 1)),
    Math.trunc(Number(record.pet.capturedSerial || 0)) + 1,
  );
  return {ok: true, changed: true, replayed: false, recoveryId, petInstanceId: record.petInstanceId};
}

function recoverPetCapture(profile, input) {
  if (
    !isObjectRecord(input)
    || !hasExactKeys(input, ["recoveryId", "completedAt"])
    || stableId(input.recoveryId) === ""
    || stableTimestamp(input.completedAt) === ""
  ) {
    return {ok: false, code: "pet_capture_shelter_recover_invalid"};
  }
  const read = readShelter(profile);
  if (!read.ok) {
    return read;
  }
  const shelter = read.shelter;
  const completed = shelter.completed[input.recoveryId];
  if (completed) {
    return {
      ok: true,
      changed: false,
      replayed: true,
      recoveryId: completed.recoveryId,
      petInstanceId: completed.petInstanceId,
      disposition: completed.disposition,
    };
  }
  const record = shelter.pending[input.recoveryId];
  if (!record) {
    return {ok: false, code: "pet_capture_shelter_pending_missing"};
  }
  const instances = profilePetInstances(profile);
  const matchingPet = instances.find((pet) => petMatchesCapture(pet, record));
  if (matchingPet) {
    delete shelter.pending[record.recoveryId];
    const disposition = matchingPet.state === "storage" ? "storage" : "party";
    appendCompleted(shelter, completeRecord(record, disposition, input.completedAt));
    profile[PROFILE_KEY] = shelter;
    return {
      ok: true,
      changed: true,
      replayed: true,
      recoveryId: record.recoveryId,
      petInstanceId: record.petInstanceId,
      disposition,
      pet: structuredClone(matchingPet),
    };
  }
  if (instances.some((pet) => petIdentity(pet).instanceId === record.petInstanceId)) {
    return {ok: false, code: "pet_capture_shelter_identity_conflict"};
  }
  const partyCount = instances.filter((pet) => pet && String(pet.state || "standby") !== "storage").length;
  const storageCount = instances.filter((pet) => pet && String(pet.state || "standby") === "storage").length;
  let state = "";
  let disposition = "";
  if (partyCount < PARTY_LIMIT) {
    state = "standby";
    disposition = "party";
  } else if (storageCount < STORAGE_LIMIT) {
    state = "storage";
    disposition = "storage";
  } else {
    return {
      ok: false,
      code: "pet_capture_shelter_capacity_full",
      recoveryId: record.recoveryId,
      petInstanceId: record.petInstanceId,
    };
  }
  const pet = structuredClone(record.pet);
  pet.state = state;
  delete pet.captureOverflowPending;
  instances.push(pet);
  delete shelter.pending[record.recoveryId];
  appendCompleted(shelter, completeRecord(record, disposition, input.completedAt));
  profile[PROFILE_KEY] = shelter;
  profile.nextPetInstanceSerial = Math.max(
    1,
    Math.trunc(Number(profile.nextPetInstanceSerial || 1)),
    Math.trunc(Number(pet.capturedSerial || 0)) + 1,
  );
  return {
    ok: true,
    changed: true,
    replayed: false,
    recoveryId: record.recoveryId,
    petInstanceId: record.petInstanceId,
    disposition,
    pet: structuredClone(pet),
  };
}

module.exports = Object.freeze({
  COMPLETED_RETENTION_MS,
  MAX_COMPLETED_RECORDS,
  MAX_RECENT_COMPLETED_IDS,
  PARTY_LIMIT,
  PROFILE_KEY,
  SCHEMA_VERSION,
  STORAGE_LIMIT,
  captureRecoveryId,
  pendingPetCaptures,
  petCaptureRecoveryOpportunity,
  readShelter,
  reconcilePendingPetCaptures,
  recoverPetCapture,
  stagePetCapture,
});
