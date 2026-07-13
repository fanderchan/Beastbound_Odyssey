"use strict";

const {TextDecoder} = require("node:util");

const WS_CLOSE_PROTOCOL_ERROR = 1002;
const WS_CLOSE_UNSUPPORTED_DATA = 1003;
const WS_CLOSE_MESSAGE_TOO_BIG = 1009;
const DEFAULT_MAX_FRAME_PAYLOAD_BYTES = 16 * 1024;
const DEFAULT_MAX_BUFFERED_BYTES = 32 * 1024;
const DEFAULT_MAX_FRAMES_PER_TURN = 32;
const CONTROL_FRAME_MAX_PAYLOAD_BYTES = 125;
const MAX_FRAME_HEADER_BYTES = 14;

const DEFAULT_WEBSOCKET_FRAME_PARSER_LIMITS = Object.freeze({
  maxFramePayloadBytes: DEFAULT_MAX_FRAME_PAYLOAD_BYTES,
  maxBufferedBytes: DEFAULT_MAX_BUFFERED_BYTES,
  maxFramesPerTurn: DEFAULT_MAX_FRAMES_PER_TURN,
});

const CONTROL_FRAME_TYPES = Object.freeze({
  0x8: "close",
  0x9: "ping",
  0xA: "pong",
});

const UNSUPPORTED_DATA_OPCODES = new Set([0x0, 0x1, 0x2]);
const CLOSE_REASON_DECODER = new TextDecoder("utf-8", {fatal: true});

function createWebSocketFrameParser(options = {}) {
  const maxFramePayloadBytes = positiveInteger(
    options.maxFramePayloadBytes,
    DEFAULT_MAX_FRAME_PAYLOAD_BYTES,
  );
  const maxBufferedBytes = positiveInteger(
    options.maxBufferedBytes,
    DEFAULT_MAX_BUFFERED_BYTES,
  );
  const maxFramesPerTurn = positiveInteger(
    options.maxFramesPerTurn,
    DEFAULT_MAX_FRAMES_PER_TURN,
  );
  let storage = null;
  let readOffset = 0;
  let writeOffset = 0;
  let bufferedBytes = 0;
  let failedClose = null;
  let closed = false;

  function push(chunk = Buffer.alloc(0)) {
    if (failedClose !== null) {
      return failureResult([], failedClose, bufferedBytes);
    }
    if (closed) {
      return successResult([], bufferedBytes, false, false, true);
    }
    const input = asBuffer(chunk);
    if (input.length > 0) {
      if (input.length > maxBufferedBytes - bufferedBytes) {
        return fail([], closeFailure(
          WS_CLOSE_MESSAGE_TOO_BIG,
          "inbound_buffer_exceeded",
          "message too big",
        ));
      }
      ensureStorage();
      if (writeOffset + input.length > maxBufferedBytes) {
        storage.copy(storage, 0, readOffset, writeOffset);
        readOffset = 0;
        writeOffset = bufferedBytes;
      }
      input.copy(storage, writeOffset);
      writeOffset += input.length;
      bufferedBytes += input.length;
    }
    return parseTurn();
  }

  function drain() {
    return push(Buffer.alloc(0));
  }

  function parseTurn() {
    const frames = [];
    while (frames.length < maxFramesPerTurn && bufferedBytes > 0) {
      const inspected = inspectNextFrame();
      if (inspected.state === "incomplete") {
        return successResult(frames, bufferedBytes, false, true, false);
      }
      if (inspected.state === "failure") {
        return fail(frames, inspected.close);
      }
      const frameBytes = readBytes(inspected.frameBytes);
      const payloadStart = inspected.headerBytes;
      const payload = Buffer.from(frameBytes.subarray(payloadStart));
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= inspected.mask[index % 4];
      }
      if (inspected.type === "close") {
        const parsedClose = parseClosePayload(payload);
        if (!parsedClose.ok) {
          return fail(frames, parsedClose.close);
        }
        frames.push(Object.freeze({
          type: "close",
          opcode: 0x8,
          payload,
          closeCode: parsedClose.closeCode,
          closeReason: parsedClose.closeReason,
        }));
        closed = true;
        clearBuffer();
        return successResult(frames, bufferedBytes, false, false, true);
      }
      frames.push(Object.freeze({
        type: inspected.type,
        opcode: inspected.opcode,
        payload,
      }));
    }
    const limitReached = frames.length >= maxFramesPerTurn && bufferedBytes > 0;
    return successResult(frames, bufferedBytes, limitReached, false, false);
  }

  function inspectNextFrame() {
    if (bufferedBytes < 2) {
      return {state: "incomplete"};
    }
    const first = peekBytes(2);
    const fin = (first[0] & 0x80) !== 0;
    const reservedBits = first[0] & 0x70;
    const opcode = first[0] & 0x0F;
    const masked = (first[1] & 0x80) !== 0;
    const shortLength = first[1] & 0x7F;

    if (reservedBits !== 0) {
      return protocolFailure("reserved_bits_set");
    }
    if (!fin) {
      return protocolFailure("fragmented_frame_unsupported");
    }
    if (!masked) {
      return protocolFailure("client_frame_unmasked");
    }
    const type = CONTROL_FRAME_TYPES[opcode] || "";
    if (type === "" && !UNSUPPORTED_DATA_OPCODES.has(opcode)) {
      return protocolFailure("invalid_opcode");
    }

    const extendedBytes = shortLength === 126 ? 2 : shortLength === 127 ? 8 : 0;
    const lengthHeaderBytes = 2 + extendedBytes;
    if (bufferedBytes < lengthHeaderBytes) {
      return {state: "incomplete"};
    }
    const lengthHeader = peekBytes(lengthHeaderBytes);
    const decodedLength = decodePayloadLength(lengthHeader, shortLength);
    if (!decodedLength.ok) {
      return {state: "failure", close: decodedLength.close};
    }
    if (decodedLength.payloadLength > maxFramePayloadBytes) {
      return {
        state: "failure",
        close: closeFailure(
          WS_CLOSE_MESSAGE_TOO_BIG,
          "frame_payload_exceeded",
          "message too big",
        ),
      };
    }
    if (type !== "" && decodedLength.payloadLength > CONTROL_FRAME_MAX_PAYLOAD_BYTES) {
      return protocolFailure("control_payload_exceeded");
    }
    if (type === "") {
      return {
        state: "failure",
        close: closeFailure(
          WS_CLOSE_UNSUPPORTED_DATA,
          "application_data_unsupported",
          "data frames unsupported",
        ),
      };
    }

    const headerBytes = lengthHeaderBytes + 4;
    if (bufferedBytes < headerBytes) {
      return {state: "incomplete"};
    }
    const frameBytes = headerBytes + decodedLength.payloadLength;
    if (frameBytes > maxBufferedBytes || frameBytes > MAX_FRAME_HEADER_BYTES + maxFramePayloadBytes) {
      return {
        state: "failure",
        close: closeFailure(
          WS_CLOSE_MESSAGE_TOO_BIG,
          "frame_buffer_exceeded",
          "message too big",
        ),
      };
    }
    if (bufferedBytes < frameBytes) {
      return {state: "incomplete"};
    }
    const header = peekBytes(headerBytes);
    return {
      state: "frame",
      type,
      opcode,
      headerBytes,
      frameBytes,
      mask: Buffer.from(header.subarray(lengthHeaderBytes, headerBytes)),
    };
  }

  function protocolFailure(reasonCode) {
    return {
      state: "failure",
      close: closeFailure(WS_CLOSE_PROTOCOL_ERROR, reasonCode, "protocol error"),
    };
  }

  function fail(frames, close) {
    failedClose = close;
    clearBuffer();
    return failureResult(frames, close, bufferedBytes);
  }

  function peekBytes(length) {
    if (length <= 0) {
      return Buffer.alloc(0);
    }
    return storage.subarray(readOffset, readOffset + length);
  }

  function readBytes(length) {
    const output = Buffer.from(storage.subarray(readOffset, readOffset + length));
    readOffset += length;
    bufferedBytes -= length;
    if (bufferedBytes === 0) {
      readOffset = 0;
      writeOffset = 0;
    }
    return output;
  }

  function clearBuffer() {
    bufferedBytes = 0;
    readOffset = 0;
    writeOffset = 0;
  }

  function ensureStorage() {
    if (storage === null) {
      storage = Buffer.allocUnsafe(maxBufferedBytes);
    }
  }

  function reset() {
    clearBuffer();
    failedClose = null;
    closed = false;
  }

  function metrics() {
    return Object.freeze({
      bufferedBytes,
      failed: failedClose !== null,
      closed,
      maxFramePayloadBytes,
      maxBufferedBytes,
      maxFramesPerTurn,
    });
  }

  return Object.freeze({
    push,
    drain,
    reset,
    metrics,
  });
}

function decodePayloadLength(header, shortLength) {
  if (shortLength < 126) {
    return {ok: true, payloadLength: shortLength};
  }
  if (shortLength === 126) {
    const payloadLength = header.readUInt16BE(2);
    if (payloadLength < 126) {
      return {
        ok: false,
        close: closeFailure(
          WS_CLOSE_PROTOCOL_ERROR,
          "noncanonical_payload_length",
          "protocol error",
        ),
      };
    }
    return {ok: true, payloadLength};
  }
  if ((header[2] & 0x80) !== 0) {
    return {
      ok: false,
      close: closeFailure(
        WS_CLOSE_PROTOCOL_ERROR,
        "invalid_64bit_payload_length",
        "protocol error",
      ),
    };
  }
  const bigLength = header.readBigUInt64BE(2);
  if (bigLength < 65536n) {
    return {
      ok: false,
      close: closeFailure(
        WS_CLOSE_PROTOCOL_ERROR,
        "noncanonical_payload_length",
        "protocol error",
      ),
    };
  }
  if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
    return {
      ok: false,
      close: closeFailure(
        WS_CLOSE_MESSAGE_TOO_BIG,
        "frame_payload_exceeded",
        "message too big",
      ),
    };
  }
  return {ok: true, payloadLength: Number(bigLength)};
}

function parseClosePayload(payload) {
  if (payload.length === 0) {
    return {ok: true, closeCode: null, closeReason: ""};
  }
  if (payload.length === 1) {
    return invalidClose("close_payload_length_invalid");
  }
  const closeCode = payload.readUInt16BE(0);
  if (!validCloseCode(closeCode)) {
    return invalidClose("close_code_invalid");
  }
  try {
    return {
      ok: true,
      closeCode,
      closeReason: CLOSE_REASON_DECODER.decode(payload.subarray(2)),
    };
  } catch {
    return invalidClose("close_reason_utf8_invalid");
  }
}

function invalidClose(reasonCode) {
  return {
    ok: false,
    close: closeFailure(WS_CLOSE_PROTOCOL_ERROR, reasonCode, "protocol error"),
  };
}

function validCloseCode(code) {
  return (
    (code >= 1000 && code <= 1014 && ![1004, 1005, 1006].includes(code))
    || (code >= 3000 && code <= 4999)
  );
}

function closeFailure(code, reasonCode, reason) {
  return Object.freeze({
    code,
    reasonCode,
    reason,
  });
}

function successResult(frames, bufferedBytes, limitReached, needMore, closed) {
  return Object.freeze({
    ok: true,
    frames: Object.freeze(frames),
    bufferedBytes,
    limitReached,
    needMore,
    closed,
    close: null,
  });
}

function failureResult(frames, close, bufferedBytes) {
  return Object.freeze({
    ok: false,
    frames: Object.freeze(frames),
    bufferedBytes,
    limitReached: false,
    needMore: false,
    closed: false,
    close,
  });
}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("websocket frame chunk must be a Buffer or Uint8Array");
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

module.exports = {
  CONTROL_FRAME_MAX_PAYLOAD_BYTES,
  DEFAULT_WEBSOCKET_FRAME_PARSER_LIMITS,
  WS_CLOSE_MESSAGE_TOO_BIG,
  WS_CLOSE_PROTOCOL_ERROR,
  WS_CLOSE_UNSUPPORTED_DATA,
  createWebSocketFrameParser,
};
