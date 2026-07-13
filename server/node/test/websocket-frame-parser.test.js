"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  CONTROL_FRAME_MAX_PAYLOAD_BYTES,
  DEFAULT_WEBSOCKET_FRAME_PARSER_LIMITS,
  WS_CLOSE_MESSAGE_TOO_BIG,
  WS_CLOSE_PROTOCOL_ERROR,
  WS_CLOSE_UNSUPPORTED_DATA,
  createWebSocketFrameParser,
} = require("../src/websocket-frame-parser");

test("websocket ingress defaults bound frames, buffering, and per-turn work", () => {
  assert.deepEqual(DEFAULT_WEBSOCKET_FRAME_PARSER_LIMITS, {
    maxFramePayloadBytes: 16 * 1024,
    maxBufferedBytes: 32 * 1024,
    maxFramesPerTurn: 32,
  });
  assert.equal(CONTROL_FRAME_MAX_PAYLOAD_BYTES, 125);
  assert.deepEqual(createWebSocketFrameParser().metrics(), {
    bufferedBytes: 0,
    failed: false,
    closed: false,
    ...DEFAULT_WEBSOCKET_FRAME_PARSER_LIMITS,
  });
});

test("masked ping and pong frames parse incrementally and preserve payload bytes", () => {
  const parser = createWebSocketFrameParser();
  const ping = clientFrame(0x9, Buffer.from("stone"));
  const first = parser.push(ping.subarray(0, 3));
  assert.equal(first.ok, true);
  assert.equal(first.needMore, true);
  assert.equal(first.bufferedBytes, 3);
  assert.deepEqual(first.frames, []);

  const second = parser.push(ping.subarray(3));
  assert.equal(second.ok, true);
  assert.equal(second.needMore, false);
  assert.equal(second.bufferedBytes, 0);
  assert.equal(second.frames.length, 1);
  assert.equal(second.frames[0].type, "ping");
  assert.equal(second.frames[0].opcode, 0x9);
  assert.equal(second.frames[0].payload.toString("utf8"), "stone");

  const pong = parser.push(clientFrame(0xA, Buffer.from([0, 1, 127, 255])));
  assert.equal(pong.ok, true);
  assert.equal(pong.frames[0].type, "pong");
  assert.deepEqual(pong.frames[0].payload, Buffer.from([0, 1, 127, 255]));
});

test("one turn consumes at most 32 coalesced frames and drain resumes in order", () => {
  const parser = createWebSocketFrameParser();
  const input = Buffer.concat(Array.from({length: 40}, (_, index) => (
    clientFrame(0x9, Buffer.from([index]))
  )));
  const first = parser.push(input);
  assert.equal(first.ok, true);
  assert.equal(first.frames.length, 32);
  assert.equal(first.limitReached, true);
  assert.equal(first.needMore, false);
  assert.deepEqual(first.frames.map((frame) => frame.payload[0]), Array.from({length: 32}, (_, index) => index));
  assert.equal(first.bufferedBytes > 0, true);

  const second = parser.drain();
  assert.equal(second.ok, true);
  assert.equal(second.frames.length, 8);
  assert.deepEqual(second.frames.map((frame) => frame.payload[0]), [32, 33, 34, 35, 36, 37, 38, 39]);
  assert.equal(second.limitReached, false);
  assert.equal(second.bufferedBytes, 0);
});

test("an upgrade head can contain control frames and close stops trailing input", () => {
  const parser = createWebSocketFrameParser();
  const head = Buffer.concat([
    clientFrame(0x9, Buffer.from("head")),
    clientFrame(0x8, closePayload(1000, "bye")),
    clientFrame(0x9, Buffer.from("ignored")),
  ]);
  const result = parser.push(head);
  assert.equal(result.ok, true);
  assert.equal(result.closed, true);
  assert.deepEqual(result.frames.map((frame) => frame.type), ["ping", "close"]);
  assert.equal(result.frames[1].closeCode, 1000);
  assert.equal(result.frames[1].closeReason, "bye");
  assert.equal(result.bufferedBytes, 0);
  assert.deepEqual(parser.push(clientFrame(0x9)).frames, []);
});

test("close frames expose the complete valid code and UTF-8 reason contract", () => {
  const empty = createWebSocketFrameParser().push(clientFrame(0x8));
  assert.equal(empty.ok, true);
  assert.equal(empty.frames[0].closeCode, null);
  assert.equal(empty.frames[0].closeReason, "");

  for (const [code, reason] of [[1000, "正常"], [1014, "gateway"], [3000, "app"]]) {
    const result = createWebSocketFrameParser().push(clientFrame(0x8, closePayload(code, reason)));
    assert.equal(result.ok, true, String(code));
    assert.equal(result.frames[0].closeCode, code);
    assert.equal(result.frames[0].closeReason, reason);
  }
  const longest = "x".repeat(123);
  const longestResult = createWebSocketFrameParser().push(clientFrame(0x8, closePayload(1000, longest)));
  assert.equal(longestResult.ok, true);
  assert.equal(longestResult.frames[0].closeReason, longest);
});

test("unmasked, fragmented, and reserved-bit client frames fail closed with 1002", () => {
  assertFailure(
    createWebSocketFrameParser().push(clientFrame(0x9, Buffer.alloc(0), {masked: false})),
    WS_CLOSE_PROTOCOL_ERROR,
    "client_frame_unmasked",
  );
  assertFailure(
    createWebSocketFrameParser().push(clientFrame(0x9, Buffer.alloc(0), {fin: false})),
    WS_CLOSE_PROTOCOL_ERROR,
    "fragmented_frame_unsupported",
  );
  assertFailure(
    createWebSocketFrameParser().push(clientFrame(0x9, Buffer.alloc(0), {reservedBits: 0x40})),
    WS_CLOSE_PROTOCOL_ERROR,
    "reserved_bits_set",
  );
});

test("text, binary, and continuation application data are explicitly unsupported with 1003", () => {
  for (const opcode of [0x0, 0x1, 0x2]) {
    assertFailure(
      createWebSocketFrameParser().push(clientFrame(opcode, Buffer.from("x"))),
      WS_CLOSE_UNSUPPORTED_DATA,
      "application_data_unsupported",
    );
  }
  assertFailure(
    createWebSocketFrameParser().push(clientFrame(0xB)),
    WS_CLOSE_PROTOCOL_ERROR,
    "invalid_opcode",
  );
});

test("noncanonical lengths, oversized control frames, and invalid 64-bit lengths fail with 1002", () => {
  assertFailure(
    createWebSocketFrameParser().push(Buffer.from([0x89, 0xFE, 0x00, 0x01])),
    WS_CLOSE_PROTOCOL_ERROR,
    "noncanonical_payload_length",
  );

  const noncanonical64 = Buffer.alloc(10);
  noncanonical64[0] = 0x89;
  noncanonical64[1] = 0xFF;
  noncanonical64.writeBigUInt64BE(65535n, 2);
  assertFailure(
    createWebSocketFrameParser().push(noncanonical64),
    WS_CLOSE_PROTOCOL_ERROR,
    "noncanonical_payload_length",
  );

  const highBitLength = Buffer.alloc(10);
  highBitLength[0] = 0x89;
  highBitLength[1] = 0xFF;
  highBitLength[2] = 0x80;
  assertFailure(
    createWebSocketFrameParser().push(highBitLength),
    WS_CLOSE_PROTOCOL_ERROR,
    "invalid_64bit_payload_length",
  );

  const oversizedControl = Buffer.alloc(4);
  oversizedControl[0] = 0x89;
  oversizedControl[1] = 0xFE;
  oversizedControl.writeUInt16BE(126, 2);
  assertFailure(
    createWebSocketFrameParser().push(oversizedControl),
    WS_CLOSE_PROTOCOL_ERROR,
    "control_payload_exceeded",
  );
});

test("declared frame length is rejected before its body is buffered", () => {
  const atLimit = declaredFrame(0x1, 16 * 1024);
  assertFailure(
    createWebSocketFrameParser().push(atLimit),
    WS_CLOSE_UNSUPPORTED_DATA,
    "application_data_unsupported",
  );

  const huge = declaredFrame(0x1, 64 * 1024 * 1024);
  const parser = createWebSocketFrameParser();
  const result = parser.push(huge);
  assertFailure(result, WS_CLOSE_MESSAGE_TOO_BIG, "frame_payload_exceeded");
  assert.equal(result.bufferedBytes, 0);
  assert.equal(parser.metrics().bufferedBytes, 0);
});

test("the 32 KiB aggregate cap rejects a large chunk without retaining it", () => {
  const parser = createWebSocketFrameParser();
  const result = parser.push(Buffer.alloc((32 * 1024) + 1, 0));
  assertFailure(result, WS_CLOSE_MESSAGE_TOO_BIG, "inbound_buffer_exceeded");
  assert.equal(parser.metrics().bufferedBytes, 0);
});

test("malformed close payloads fail closed with 1002", () => {
  const cases = [
    [Buffer.from([1]), "close_payload_length_invalid"],
    [closePayload(1005, "reserved"), "close_code_invalid"],
    [Buffer.from([0x03, 0xE8, 0xC3, 0x28]), "close_reason_utf8_invalid"],
  ];
  for (const [payload, reasonCode] of cases) {
    assertFailure(
      createWebSocketFrameParser().push(clientFrame(0x8, payload)),
      WS_CLOSE_PROTOCOL_ERROR,
      reasonCode,
    );
  }
});

test("bounded storage parsing handles one-byte delivery without concatenation semantics", () => {
  const parser = createWebSocketFrameParser();
  const frame = clientFrame(0x9, Buffer.alloc(125, 0xA5));
  let final = null;
  for (const byte of frame) {
    final = parser.push(Buffer.from([byte]));
    assert.equal(final.ok, true);
    assert.equal(final.bufferedBytes <= 32 * 1024, true);
  }
  assert.equal(final.frames.length, 1);
  assert.equal(final.frames[0].payload.length, 125);
  assert.equal(final.frames[0].payload.every((value) => value === 0xA5), true);
});

test("failure is sticky until reset and reset does not retain attacker bytes", () => {
  const parser = createWebSocketFrameParser();
  const failed = parser.push(clientFrame(0x9, Buffer.alloc(0), {masked: false}));
  assert.equal(failed.ok, false);
  const repeated = parser.push(clientFrame(0x9));
  assert.equal(repeated.ok, false);
  assert.deepEqual(repeated.close, failed.close);
  assert.equal(repeated.bufferedBytes, 0);

  parser.reset();
  const recovered = parser.push(clientFrame(0x9, Buffer.from("ok")));
  assert.equal(recovered.ok, true);
  assert.equal(recovered.frames[0].payload.toString("utf8"), "ok");
});

test("deterministic random frame fuzz never throws or exceeds parser bounds", () => {
  let randomState = 0x6D2B79F5;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState;
  };
  for (let sample = 0; sample < 2500; sample += 1) {
    const parser = createWebSocketFrameParser();
    const length = random() % 513;
    const input = Buffer.alloc(length);
    for (let index = 0; index < input.length; index += 1) {
      input[index] = random() & 0xFF;
    }
    let offset = 0;
    let turns = 0;
    while (offset < input.length && turns < 600) {
      const chunkLength = Math.min(input.length - offset, 1 + (random() % 23));
      const result = parser.push(input.subarray(offset, offset + chunkLength));
      assert.equal(result.frames.length <= 32, true);
      assert.equal(result.bufferedBytes <= 32 * 1024, true);
      offset += chunkLength;
      turns += 1;
      if (!result.ok || result.closed) {
        break;
      }
      let drained = result;
      while (drained.limitReached && turns < 600) {
        drained = parser.drain();
        assert.equal(drained.frames.length <= 32, true);
        assert.equal(drained.bufferedBytes <= 32 * 1024, true);
        turns += 1;
      }
    }
  }
});

test("parser rejects non-byte chunks as an internal programming error", () => {
  const parser = createWebSocketFrameParser();
  assert.throws(() => parser.push("not bytes"), /Buffer or Uint8Array/);
});

function clientFrame(opcode, payload = Buffer.alloc(0), options = {}) {
  const data = Buffer.from(payload);
  const fin = options.fin !== false;
  const reservedBits = Number(options.reservedBits || 0) & 0x70;
  const masked = options.masked !== false;
  const first = (fin ? 0x80 : 0) | reservedBits | (opcode & 0x0F);
  let header;
  if (data.length < 126) {
    header = Buffer.from([first, (masked ? 0x80 : 0) | data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = first;
    header[1] = (masked ? 0x80 : 0) | 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = first;
    header[1] = (masked ? 0x80 : 0) | 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  if (!masked) {
    return Buffer.concat([header, data]);
  }
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const encoded = Buffer.alloc(data.length);
  for (let index = 0; index < data.length; index += 1) {
    encoded[index] = data[index] ^ mask[index % 4];
  }
  return Buffer.concat([header, mask, encoded]);
}

function declaredFrame(opcode, payloadLength) {
  const extendedBytes = payloadLength < 65536 ? 2 : 8;
  const header = Buffer.alloc(2 + extendedBytes);
  header[0] = 0x80 | (opcode & 0x0F);
  header[1] = 0x80 | (extendedBytes === 2 ? 126 : 127);
  if (extendedBytes === 2) {
    header.writeUInt16BE(payloadLength, 2);
  } else {
    header.writeBigUInt64BE(BigInt(payloadLength), 2);
  }
  return header;
}

function closePayload(code, reason = "") {
  const reasonBytes = Buffer.from(reason, "utf8");
  const payload = Buffer.alloc(2 + reasonBytes.length);
  payload.writeUInt16BE(code, 0);
  reasonBytes.copy(payload, 2);
  return payload;
}

function assertFailure(result, closeCode, reasonCode) {
  assert.equal(result.ok, false);
  assert.equal(result.close.code, closeCode);
  assert.equal(result.close.reasonCode, reasonCode);
  assert.equal(typeof result.close.reason, "string");
  assert.equal(Buffer.byteLength(result.close.reason, "utf8") <= 123, true);
}
