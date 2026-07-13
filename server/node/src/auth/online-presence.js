"use strict";

const PRESENCE_CHANGE_UPSERT = "upsert";
const PRESENCE_CHANGE_REMOVE = "remove";

function createPresenceRevisionTracker() {
  const revisionByAccountId = new Map();

  return {
    next(accountIdValue) {
      const accountId = String(accountIdValue || "");
      if (accountId === "") {
        return 0;
      }
      const revision = Math.min(
        Number.MAX_SAFE_INTEGER,
        normalizePresenceRevision(revisionByAccountId.get(accountId)) + 1,
      );
      revisionByAccountId.set(accountId, revision);
      return revision;
    },
    current(accountIdValue) {
      return normalizePresenceRevision(revisionByAccountId.get(String(accountIdValue || "")));
    },
    ensure(accountIdValue) {
      const accountId = String(accountIdValue || "");
      if (accountId === "") {
        return 0;
      }
      const current = normalizePresenceRevision(revisionByAccountId.get(accountId));
      if (current > 0) {
        return current;
      }
      revisionByAccountId.set(accountId, 1);
      return 1;
    },
    clear(accountIdValue) {
      revisionByAccountId.delete(String(accountIdValue || ""));
    },
  };
}

function projectOnlinePositionDelta({
  event,
  viewerAccountId,
  currentVisible,
  previousVisible,
}) {
  const source = event && typeof event === "object" && !Array.isArray(event) ? event : {};
  const accountId = String(source.accountId || "");
  const isSelf = accountId !== "" && accountId === String(viewerAccountId || "");
  const visibleNow = isSelf || Boolean(currentVisible);
  const visibleBefore = Boolean(previousVisible);
  if (!visibleNow && !visibleBefore) {
    return {visible: false, event: source};
  }
  const projected = presenceEventCommonFields(source, {
    change: visibleNow ? PRESENCE_CHANGE_UPSERT : PRESENCE_CHANGE_REMOVE,
    accountId,
    presenceRevision: normalizePresenceRevision(source.presenceRevision),
  });
  if (visibleNow) {
    projected.player = projectPresenceWirePlayer(source.player);
  }
  return {visible: true, event: projected};
}

function projectOnlinePositionRebase({event, aoi, presenceRebase}) {
  const source = objectOrEmpty(event);
  const rebase = objectOrEmpty(presenceRebase);
  return presenceEventCommonFields(source, {
    change: "rebase",
    accountId: String(source.accountId || ""),
    presenceRevision: normalizePresenceRevision(source.presenceRevision),
    aoi: projectPresenceWireAoi(aoi),
    presenceRebase: {
      upserts: projectPresenceWirePlayers(rebase.upserts, {includeRevision: true}),
      removedAccountIds: uniqueAccountIds(rebase.removedAccountIds),
    },
  });
}

function projectPresenceWirePlayers(value, options = {}) {
  return (Array.isArray(value) ? value : []).map((player) => (
    projectPresenceWirePlayer(player, options)
  ));
}

function projectPresenceWirePlayer(value, options = {}) {
  const source = objectOrEmpty(value);
  const player = {
    accountId: String(source.accountId || ""),
    username: String(source.username || ""),
    displayName: String(source.displayName || source.username || ""),
    partyId: String(source.partyId || ""),
    partyRole: normalizePartyRole(source.partyRole),
    position: projectPresenceWirePosition(source.position),
  };
  if (options.includeRevision === true) {
    player.presenceRevision = normalizePresenceRevision(source.presenceRevision);
  }
  return player;
}

function projectPresenceWirePosition(value) {
  const source = objectOrEmpty(value);
  return {
    mapId: String(source.mapId || ""),
    cellX: finiteInteger(source.cellX),
    cellY: finiteInteger(source.cellY),
    facing: String(source.facing || "south"),
    moving: Boolean(source.moving),
    hasCell: source.hasCell !== false && String(source.precision || "") !== "map",
  };
}

function projectPresenceWireAoi(value) {
  const source = objectOrEmpty(value);
  return {
    scope: String(source.scope || "all"),
    mapId: String(source.mapId || ""),
    cellX: finiteInteger(source.cellX),
    cellY: finiteInteger(source.cellY),
    radius: Math.max(0, finiteInteger(source.radius)),
    schemaVersion: 1,
  };
}

function presenceEventCommonFields(sourceValue, fields) {
  const source = objectOrEmpty(sourceValue);
  return {
    type: "online.position",
    ...fields,
    schemaVersion: Math.max(1, finiteInteger(source.schemaVersion) || 1),
    createdAt: String(source.createdAt || ""),
  };
}

function uniqueAccountIds(value) {
  const result = [];
  const seen = new Set();
  for (const item of Array.isArray(value) ? value : []) {
    const accountId = String(item || "");
    if (accountId === "" || seen.has(accountId)) {
      continue;
    }
    seen.add(accountId);
    result.push(accountId);
  }
  return result;
}

function normalizePartyRole(value) {
  const role = String(value || "");
  return role === "leader" || role === "member" ? role : "";
}

function finiteInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function buildPresenceRebase(currentPlayersValue, previousPlayersValue, selfAccountIdValue = "") {
  const selfAccountId = String(selfAccountIdValue || "");
  const current = playersByAccountId(currentPlayersValue, selfAccountId);
  const previous = playersByAccountId(previousPlayersValue, selfAccountId);
  const upserts = [];
  const removedAccountIds = [];
  for (const [accountId, player] of current.entries()) {
    if (!previous.has(accountId)) {
      upserts.push(player);
    }
  }
  for (const accountId of previous.keys()) {
    if (!current.has(accountId)) {
      removedAccountIds.push(accountId);
    }
  }
  // currentPlayers is already in the authoritative distance/username order.
  // Preserve it so a capped client cache keeps the nearest rows after a map or
  // AOI rebase instead of an arbitrary account-id subset.
  removedAccountIds.sort((left, right) => left.localeCompare(right));
  return {
    upserts,
    removedAccountIds,
    schemaVersion: 1,
  };
}

function playersByAccountId(value, selfAccountId) {
  const result = new Map();
  for (const player of Array.isArray(value) ? value : []) {
    if (!player || typeof player !== "object" || Array.isArray(player)) {
      continue;
    }
    const accountId = String(player.accountId || "");
    if (accountId === "" || accountId === selfAccountId) {
      continue;
    }
    result.set(accountId, player);
  }
  return result;
}

function normalizePresenceRevision(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number));
}

module.exports = {
  PRESENCE_CHANGE_REMOVE,
  PRESENCE_CHANGE_UPSERT,
  buildPresenceRebase,
  createPresenceRevisionTracker,
  normalizePresenceRevision,
  projectOnlinePositionDelta,
  projectOnlinePositionRebase,
  projectPresenceWirePlayer,
  projectPresenceWirePlayers,
};
