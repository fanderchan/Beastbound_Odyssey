"use strict";

const REUSABLE_EVENT_PROJECTIONS = Symbol("beastbound.reusableEventProjections");

function createEventProjectionCache() {
  const cache = new Map();
  Object.defineProperty(cache, REUSABLE_EVENT_PROJECTIONS, {
    value: new WeakSet(),
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return cache;
}

function markReusableEventProjection(cache, event) {
  const projections = reusableEventProjections(cache);
  if (!projections || !event || typeof event !== "object") {
    return event;
  }
  projections.add(event);
  return event;
}

function isReusableEventProjection(cache, event) {
  const projections = reusableEventProjections(cache);
  return Boolean(projections && event && typeof event === "object" && projections.has(event));
}

function reusableEventProjections(cache) {
  if (!(cache instanceof Map)) {
    return null;
  }
  const value = cache[REUSABLE_EVENT_PROJECTIONS];
  return value instanceof WeakSet ? value : null;
}

module.exports = {
  createEventProjectionCache,
  isReusableEventProjection,
  markReusableEventProjection,
};
