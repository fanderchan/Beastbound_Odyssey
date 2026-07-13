"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  EVENT_STREAM_EPOCH_BYTES,
  EVENT_STREAM_EPOCH_PATTERN,
  createEventStreamCursorAuthority,
  eventWindowFromReplay,
} = require("../src/event-stream-cursor");

const EPOCH = Buffer.alloc(EVENT_STREAM_EPOCH_BYTES, 0x2A).toString("base64url");

test("event stream epoch is random, opaque, and exactly 128 bits", () => {
  let requestedBytes = 0;
  const authority = createEventStreamCursorAuthority({
    randomBytes(bytes) {
      requestedBytes = bytes;
      return Buffer.alloc(bytes, 0x5A);
    },
  });
  assert.equal(requestedBytes, 16);
  assert.match(authority.eventStreamEpoch, EVENT_STREAM_EPOCH_PATTERN);
  assert.equal(authority.eventStreamEpoch.length, 22);
});

test("fresh connections start at latest and never replay an arbitrary old window", () => {
  const authority = createEventStreamCursorAuthority({eventStreamEpoch: EPOCH});
  assert.deepEqual(authority.classify({cursorPresent: false}, {
    earliestEventSeq: 501,
    latestEventSeq: 1000,
  }), {
    ok: true,
    eventStreamEpoch: EPOCH,
    earliestEventSeq: 501,
    latestEventSeq: 1000,
    resetRequired: false,
    resetReason: "",
    replayMode: "fresh",
    afterSeq: 1000,
  });
});

test("a matching cursor inside earliest-1 through latest replays", () => {
  const authority = createEventStreamCursorAuthority({eventStreamEpoch: EPOCH});
  for (const cursor of [500, 501, 999, 1000]) {
    const result = authority.classify({
      cursorPresent: true,
      eventStreamEpoch: EPOCH,
      lastEventSeq: cursor,
    }, {earliestEventSeq: 501, latestEventSeq: 1000});
    assert.equal(result.resetRequired, false, String(cursor));
    assert.equal(result.replayMode, "replay", String(cursor));
    assert.equal(result.afterSeq, cursor, String(cursor));
  }
});

test("missing, invalid, mismatched, future, and evicted cursors explicitly reset", () => {
  const authority = createEventStreamCursorAuthority({eventStreamEpoch: EPOCH});
  const cases = [
    [{cursorPresent: true, lastEventSeq: 900}, "epoch_missing_or_invalid"],
    [{cursorPresent: true, eventStreamEpoch: "bad", lastEventSeq: 900}, "epoch_missing_or_invalid"],
    [{cursorPresent: true, eventStreamEpoch: Buffer.alloc(16, 1).toString("base64url"), lastEventSeq: 900}, "epoch_mismatch"],
    [{cursorPresent: true, eventStreamEpoch: EPOCH, lastEventSeq: "not-a-number"}, "cursor_invalid"],
    [{cursorPresent: true, eventStreamEpoch: EPOCH, lastEventSeq: 1001}, "cursor_ahead"],
    [{cursorPresent: true, eventStreamEpoch: EPOCH, lastEventSeq: 499}, "cursor_evicted"],
  ];
  for (const [request, reason] of cases) {
    const result = authority.classify(request, {earliestEventSeq: 501, latestEventSeq: 1000});
    assert.equal(result.resetRequired, true, reason);
    assert.equal(result.resetReason, reason, reason);
    assert.equal(result.replayMode, "reset", reason);
    assert.equal(result.afterSeq, 1000, reason);
  }
});

test("an empty replay window accepts only the current latest cursor", () => {
  const authority = createEventStreamCursorAuthority({eventStreamEpoch: EPOCH});
  const window = eventWindowFromReplay({events: [], latestEventSeq: 17});
  assert.deepEqual(window, {earliestEventSeq: 18, latestEventSeq: 17});
  assert.equal(authority.classify({cursorPresent: true, eventStreamEpoch: EPOCH, lastEventSeq: 17}, window).resetRequired, false);
  assert.equal(authority.classify({cursorPresent: true, eventStreamEpoch: EPOCH, lastEventSeq: 16}, window).resetReason, "cursor_evicted");
});
