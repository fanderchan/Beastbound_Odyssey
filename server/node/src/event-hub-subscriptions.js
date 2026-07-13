"use strict";

const DEFAULT_BUCKET_SIZE = 16;
const DEFAULT_MAX_AOI_RADIUS = 48;

function createEventSubscriptionIndex(options = {}) {
  const bucketSize = positiveInteger(options.bucketSize, DEFAULT_BUCKET_SIZE);
  const maxAoiRadius = positiveInteger(options.maxAoiRadius, DEFAULT_MAX_AOI_RADIUS);
  const byAccountId = new Map();
  const bySessionId = new Map();
  const globalSubscribers = new Set();
  const mapSubscribers = new Map();
  const bucketSubscribers = new Map();
  const uninitialized = new Set();

  function register(client) {
    addIndexed(byAccountId, String(client && client.accountId || ""), client);
    addIndexed(bySessionId, String(client && client.sessionId || ""), client);
    uninitialized.add(client);
    client.presenceSubscription = null;
  }

  function unregister(client) {
    removeSubscription(client);
    uninitialized.delete(client);
    removeIndexed(byAccountId, String(client && client.accountId || ""), client);
    removeIndexed(bySessionId, String(client && client.sessionId || ""), client);
  }

  function update(client, aoi) {
    removeSubscription(client);
    uninitialized.delete(client);
    const subscription = normalizeSubscription(aoi, {maxAoiRadius});
    client.presenceSubscription = subscription;
    if (subscription.scope === "all") {
      globalSubscribers.add(client);
      return subscription;
    }
    if (subscription.scope === "none") {
      return subscription;
    }
    if (subscription.scope === "map") {
      addIndexed(mapSubscribers, subscription.mapId, client);
      return subscription;
    }
    addIndexed(bucketSubscribers, bucketKey(subscription.mapId, subscription.cellX, subscription.cellY), client);
    return subscription;
  }

  function candidates(event, allClients) {
    const targetSessionIds = arrayField(event, "targetSessionIds");
    if (targetSessionIds !== null) {
      return indexedCandidates(bySessionId, targetSessionIds);
    }
    const targetAccountIds = arrayField(event, "targetAccountIds");
    if (targetAccountIds !== null) {
      return indexedCandidates(byAccountId, targetAccountIds);
    }
    if (!isPositionEvent(event)) {
      return new Set(allClients);
    }

    const result = new Set(uninitialized);
    addSet(result, globalSubscribers);
    addSet(result, byAccountId.get(String(event && event.accountId || "")));
    const positions = [event && event.previousPosition, event && event.position]
      .map(normalizePosition)
      .filter(Boolean);
    if (positions.length <= 0) {
      return new Set(allClients);
    }
    const seenMaps = new Set();
    for (const position of positions) {
      if (!seenMaps.has(position.mapId)) {
        seenMaps.add(position.mapId);
        addSet(result, mapSubscribers.get(position.mapId));
      }
      if (!position.hasCell) {
        continue;
      }
      const bucketRadius = Math.ceil(maxAoiRadius / bucketSize);
      const centerBucketX = Math.floor(position.cellX / bucketSize);
      const centerBucketY = Math.floor(position.cellY / bucketSize);
      for (let dx = -bucketRadius; dx <= bucketRadius; dx += 1) {
        for (let dy = -bucketRadius; dy <= bucketRadius; dy += 1) {
          addSet(result, bucketSubscribers.get(`${position.mapId}|${centerBucketX + dx}|${centerBucketY + dy}`));
        }
      }
    }
    return result;
  }

  function positionEventMayBeVisible(client, event) {
    if (!isPositionEvent(event) || uninitialized.has(client)) {
      return true;
    }
    if (String(client && client.accountId || "") === String(event && event.accountId || "")) {
      return true;
    }
    const subscription = client && client.presenceSubscription;
    if (!subscription || subscription.scope === "all") {
      return true;
    }
    // This is the per-recipient hot path. Candidate construction already owns
    // its normalized temporary positions; visibility only needs two scalar
    // checks and must not allocate another array/object pair for every viewer.
    return rawPositionVisibleToSubscription(event && event.previousPosition, subscription)
      || rawPositionVisibleToSubscription(event && event.position, subscription);
  }

  function removeSubscription(client) {
    const subscription = client && client.presenceSubscription;
    if (!subscription) {
      return;
    }
    if (subscription.scope === "all") {
      globalSubscribers.delete(client);
    } else if (subscription.scope === "map") {
      removeIndexed(mapSubscribers, subscription.mapId, client);
    } else if (subscription.scope === "aoi") {
      removeIndexed(bucketSubscribers, bucketKey(subscription.mapId, subscription.cellX, subscription.cellY), client);
    }
    client.presenceSubscription = null;
  }

  return Object.freeze({
    register,
    unregister,
    update,
    candidates,
    positionEventMayBeVisible,
  });

  function bucketKey(mapId, cellX, cellY) {
    return `${mapId}|${Math.floor(cellX / bucketSize)}|${Math.floor(cellY / bucketSize)}`;
  }
}

function normalizeSubscription(value, options = {}) {
  const source = objectOrEmpty(value);
  const maxAoiRadius = positiveInteger(options.maxAoiRadius, DEFAULT_MAX_AOI_RADIUS);
  const mapId = String(source.mapId || "").trim();
  const scope = String(source.scope || "").trim().toLowerCase();
  if (scope === "none") {
    return Object.freeze({scope: "none", mapId: "", cellX: 0, cellY: 0, radius: 0});
  }
  if (!mapId || scope === "all") {
    return Object.freeze({scope: "all", mapId: "", cellX: 0, cellY: 0, radius: 0});
  }
  if (scope === "map" || !hasCell(source)) {
    return Object.freeze({scope: "map", mapId, cellX: 0, cellY: 0, radius: 0});
  }
  return Object.freeze({
    scope: "aoi",
    mapId,
    cellX: integer(source.cellX),
    cellY: integer(source.cellY),
    radius: Math.max(1, Math.min(maxAoiRadius, positiveInteger(source.radius, 18))),
  });
}

function normalizePosition(value) {
  const source = objectOrEmpty(value);
  const mapId = String(source.mapId || "").trim();
  if (!mapId) {
    return null;
  }
  return {
    mapId,
    cellX: integer(source.cellX),
    cellY: integer(source.cellY),
    hasCell: hasCell(source),
  };
}

function rawPositionVisibleToSubscription(position, subscription) {
  if (!position || typeof position !== "object" || Array.isArray(position)) {
    return false;
  }
  const mapId = String(position.mapId || "").trim();
  if (!mapId || mapId !== subscription.mapId) {
    return false;
  }
  if (subscription.scope === "map") {
    return true;
  }
  if (!hasCell(position)) {
    return false;
  }
  return (
    Math.abs(integer(position.cellX) - subscription.cellX) <= subscription.radius
    && Math.abs(integer(position.cellY) - subscription.cellY) <= subscription.radius
  );
}

function hasCell(value) {
  if (!value || value.hasCell === false || String(value.precision || "") === "map") {
    return false;
  }
  return Number.isFinite(Number(value.cellX)) && Number.isFinite(Number(value.cellY));
}

function isPositionEvent(event) {
  return Boolean(event && String(event.type || "") === "online.position");
}

function arrayField(value, field) {
  return value && Array.isArray(value[field]) ? value[field] : null;
}

function indexedCandidates(index, ids) {
  const result = new Set();
  for (const id of ids) {
    addSet(result, index.get(String(id || "")));
  }
  return result;
}

function addIndexed(index, key, value) {
  if (!key) {
    return;
  }
  let values = index.get(key);
  if (!values) {
    values = new Set();
    index.set(key, values);
  }
  values.add(value);
}

function removeIndexed(index, key, value) {
  if (!key) {
    return;
  }
  const values = index.get(key);
  if (!values) {
    return;
  }
  values.delete(value);
  if (values.size <= 0) {
    index.delete(key);
  }
}

function addSet(target, source) {
  if (!source) {
    return;
  }
  for (const value of source) {
    target.add(value);
  }
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function integer(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

module.exports = {
  createEventSubscriptionIndex,
  normalizeSubscription,
};
