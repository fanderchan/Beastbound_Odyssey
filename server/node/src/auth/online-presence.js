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
  const projected = {
    ...source,
    change: visibleNow ? PRESENCE_CHANGE_UPSERT : PRESENCE_CHANGE_REMOVE,
    accountId,
    presenceRevision: normalizePresenceRevision(source.presenceRevision),
  };
  delete projected.players;
  // Old/new coordinates are needed only for the server's candidate lookup.
  // A viewer receives the current visible row on upsert, or only a tombstone
  // on remove; otherwise entering/leaving AOI would reveal the actor's exact
  // position outside that viewer's visibility boundary.
  delete projected.position;
  delete projected.previousPosition;
  if (visibleNow) {
    projected.player = source.player && typeof source.player === "object" && !Array.isArray(source.player)
      ? source.player
      : null;
  } else {
    delete projected.player;
  }
  return {visible: true, event: projected};
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
};
