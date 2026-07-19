"use strict";

const PROFILE_KEY = "petRidePermits";
const SCHEMA_VERSION = 1;

function defaultState() {
  return {schemaVersion: SCHEMA_VERSION, permitIds: []};
}

function permitIdForRiding(riding) {
  return String(riding && riding.permitId || "").trim();
}

function permitItemIdForRiding(riding) {
  return String(riding && riding.permitItemId || "").trim();
}

function readState(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return invalidState("骑乘资格资料异常。");
  }
  if (!Object.hasOwn(profile, PROFILE_KEY)) {
    return {ok: true, legacyMissing: true, state: defaultState(), permitIds: []};
  }
  const raw = profile[PROFILE_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return invalidState("骑乘资格资料异常。");
  }
  if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion !== SCHEMA_VERSION) {
    return invalidState("骑乘资格版本异常。");
  }
  if (!Array.isArray(raw.permitIds)) {
    return invalidState("骑乘资格列表异常。");
  }
  const permitIds = [];
  for (const rawPermitId of raw.permitIds) {
    if (typeof rawPermitId !== "string") {
      return invalidState("骑乘资格编号异常。");
    }
    const permitId = rawPermitId.trim();
    if (!permitId || permitIds.includes(permitId)) {
      return invalidState("骑乘资格编号异常。");
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

function hasRequiredPermit(profile, riding) {
  const permitId = permitIdForRiding(riding);
  if (!permitId) {
    return true;
  }
  const snapshot = readState(profile);
  if (!snapshot.ok) {
    return false;
  }
  if (snapshot.legacyMissing) {
    return Boolean(riding && riding.legacyProfilesGranted);
  }
  return snapshot.permitIds.includes(permitId);
}

function planUnlock(profile, riding, itemId) {
  const permitId = permitIdForRiding(riding);
  const expectedItemId = permitItemIdForRiding(riding);
  if (!permitId || !expectedItemId) {
    return {ok: false, code: "ride_permit_not_configured", message: "这只宠物没有配置驯宠证。"};
  }
  if (String(itemId || "").trim() !== expectedItemId) {
    return {ok: false, code: "ride_permit_item_mismatch", message: "驯宠证与宠物不匹配。"};
  }
  const snapshot = readState(profile);
  if (!snapshot.ok) {
    return {ok: false, code: "ride_permit_state_invalid", message: snapshot.message};
  }
  if (hasRequiredPermit(profile, riding)) {
    return {ok: false, code: "ride_permit_owned", message: "已经获得这项骑乘资格。"};
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
  permitIdForRiding,
  permitItemIdForRiding,
  planUnlock,
  readState,
};
