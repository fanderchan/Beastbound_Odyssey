"use strict";

const {readState: readPetRidePermitState} = require("./pet-ride-permit");

const PROFILE_KEY = "petTamePermits";
const SCHEMA_VERSION = 1;

function defaultState() {
  return {schemaVersion: SCHEMA_VERSION, permitIds: []};
}

function permitIdForTaming(taming) {
  return String(taming && taming.permitId || "").trim();
}

function permitItemIdForTaming(taming) {
  return String(taming && taming.permitItemId || "").trim();
}

function readState(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return invalidState("驯宠资格资料异常。");
  }
  if (!Object.hasOwn(profile, PROFILE_KEY)) {
    return {ok: true, legacyMissing: true, state: defaultState(), permitIds: []};
  }
  const raw = profile[PROFILE_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return invalidState("驯宠资格资料异常。");
  }
  if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion !== SCHEMA_VERSION) {
    return invalidState("驯宠资格版本异常。");
  }
  if (!Array.isArray(raw.permitIds)) {
    return invalidState("驯宠资格列表异常。");
  }
  const permitIds = [];
  for (const rawPermitId of raw.permitIds) {
    if (typeof rawPermitId !== "string") {
      return invalidState("驯宠资格编号异常。");
    }
    const permitId = rawPermitId.trim();
    if (!permitId || permitIds.includes(permitId)) {
      return invalidState("驯宠资格编号异常。");
    }
    permitIds.push(permitId);
  }
  return {
    ok: true,
    legacyMissing: false,
    state: {schemaVersion: SCHEMA_VERSION, permitIds: [...permitIds]},
    permitIds,
  };
}

function hasRequiredPermit(profile, taming) {
  const permitId = permitIdForTaming(taming);
  if (!permitId) {
    return true;
  }
  const snapshot = readState(profile);
  if (!snapshot.ok) {
    return false;
  }
  if (snapshot.legacyMissing) {
    const legacyRidePermitId = String(taming && taming.legacyRidePermitId || "").trim();
    if (!legacyRidePermitId) {
      return false;
    }
    const rideSnapshot = readPetRidePermitState(profile);
    return Boolean(
      rideSnapshot.ok &&
      !rideSnapshot.legacyMissing &&
      rideSnapshot.permitIds.includes(legacyRidePermitId)
    );
  }
  return snapshot.permitIds.includes(permitId);
}

function planUnlock(profile, taming, itemId) {
  const permitId = permitIdForTaming(taming);
  const expectedItemId = permitItemIdForTaming(taming);
  if (!permitId || !expectedItemId) {
    return {ok: false, code: "tame_permit_not_configured", message: "这只宠物没有配置驯宠证。"};
  }
  if (String(itemId || "").trim() !== expectedItemId) {
    return {ok: false, code: "tame_permit_item_mismatch", message: "驯宠证与宠物不匹配。"};
  }
  const snapshot = readState(profile);
  if (!snapshot.ok) {
    return {ok: false, code: "tame_permit_state_invalid", message: snapshot.message};
  }
  if (hasRequiredPermit(profile, taming)) {
    return {ok: false, code: "tame_permit_owned", message: "已经获得这项驯宠资格。"};
  }
  return {
    ok: true,
    permitId,
    state: {
      schemaVersion: SCHEMA_VERSION,
      permitIds: [...snapshot.permitIds, permitId],
    },
  };
}

function invalidState(message) {
  return {ok: false, legacyMissing: false, state: null, permitIds: [], message};
}

module.exports = {
  PROFILE_KEY,
  SCHEMA_VERSION,
  defaultState,
  hasRequiredPermit,
  permitIdForTaming,
  permitItemIdForTaming,
  planUnlock,
  readState,
};
