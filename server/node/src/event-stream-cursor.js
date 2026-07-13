"use strict";

const crypto = require("node:crypto");

const EVENT_STREAM_EPOCH_BYTES = 16;
const EVENT_STREAM_EPOCH_PATTERN = /^[A-Za-z0-9_-]{22}$/;

function createEventStreamCursorAuthority(options = {}) {
  const eventStreamEpoch = canonicalEpoch(options.eventStreamEpoch)
    || randomEpoch(options.randomBytes || crypto.randomBytes);

  function classify(request = {}, window = {}) {
    const cursorPresent = request.cursorPresent === true;
    const requestedEpoch = String(request.eventStreamEpoch || "").trim();
    const cursor = normalizeSequence(request.lastEventSeq);
    const latestEventSeq = normalizeSequence(window.latestEventSeq);
    const earliestEventSeq = canonicalEarliest(window.earliestEventSeq, latestEventSeq);
    const base = {
      eventStreamEpoch,
      earliestEventSeq,
      latestEventSeq,
    };
    if (!cursorPresent) {
      return Object.freeze({
        ...base,
        ok: true,
        resetRequired: false,
        resetReason: "",
        replayMode: "fresh",
        afterSeq: latestEventSeq,
      });
    }
    if (!canonicalEpoch(requestedEpoch)) {
      return reset(base, "epoch_missing_or_invalid");
    }
    if (requestedEpoch !== eventStreamEpoch) {
      return reset(base, "epoch_mismatch");
    }
    if (!Number.isSafeInteger(Number(request.lastEventSeq)) || Number(request.lastEventSeq) < 0) {
      return reset(base, "cursor_invalid");
    }
    if (cursor > latestEventSeq) {
      return reset(base, "cursor_ahead");
    }
    if (cursor < Math.max(0, earliestEventSeq - 1)) {
      return reset(base, "cursor_evicted");
    }
    return Object.freeze({
      ...base,
      ok: true,
      resetRequired: false,
      resetReason: "",
      replayMode: "replay",
      afterSeq: cursor,
    });
  }

  return Object.freeze({
    eventStreamEpoch,
    classify,
  });
}

function eventWindowFromReplay(replay = {}) {
  const latestEventSeq = normalizeSequence(replay.latestEventSeq);
  return Object.freeze({
    earliestEventSeq: canonicalEarliest(replay.earliestEventSeq, latestEventSeq),
    latestEventSeq,
  });
}

function reset(base, reason) {
  return Object.freeze({
    ...base,
    ok: true,
    resetRequired: true,
    resetReason: reason,
    replayMode: "reset",
    afterSeq: base.latestEventSeq,
  });
}

function canonicalEarliest(value, latestEventSeq) {
  const normalized = normalizeSequence(value);
  if (normalized > 0) {
    return Math.min(normalized, latestEventSeq + 1);
  }
  return latestEventSeq + 1;
}

function normalizeSequence(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number));
}

function canonicalEpoch(value) {
  const epoch = String(value || "").trim();
  return EVENT_STREAM_EPOCH_PATTERN.test(epoch) ? epoch : "";
}

function randomEpoch(randomBytes) {
  const value = randomBytes(EVENT_STREAM_EPOCH_BYTES);
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    throw new Error("event stream epoch entropy must be bytes");
  }
  const bytes = Buffer.from(value);
  if (bytes.length !== EVENT_STREAM_EPOCH_BYTES) {
    throw new Error("event stream epoch entropy must contain 16 bytes");
  }
  return bytes.toString("base64url");
}

module.exports = {
  EVENT_STREAM_EPOCH_BYTES,
  EVENT_STREAM_EPOCH_PATTERN,
  createEventStreamCursorAuthority,
  eventWindowFromReplay,
};
