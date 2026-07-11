"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CLIENT_PROTOCOL_HEADER,
  CLIENT_VERSION_HEADER,
  MAX_CLIENT_PROTOCOL_VERSION,
  MIN_CLIENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  protocolCompatibility,
  protocolMetadata,
  protocolMismatchResult,
} = require("../src/protocol");

function requestForProtocol(protocolVersion) {
  return {
    url: "/auth/session",
    headers: {
      [CLIENT_VERSION_HEADER]: "0.1.0",
      [CLIENT_PROTOCOL_HEADER]: String(protocolVersion),
    },
  };
}

test("protocol 4 is the only supported client window", () => {
  assert.equal(PROTOCOL_VERSION, 4);
  assert.equal(MIN_CLIENT_PROTOCOL_VERSION, 4);
  assert.equal(MAX_CLIENT_PROTOCOL_VERSION, 4);
  assert.deepEqual(
    {
      protocolVersion: protocolMetadata().protocolVersion,
      minClientProtocolVersion: protocolMetadata().minClientProtocolVersion,
      maxClientProtocolVersion: protocolMetadata().maxClientProtocolVersion,
    },
    {
      protocolVersion: 4,
      minClientProtocolVersion: 4,
      maxClientProtocolVersion: 4,
    },
  );
  assert.equal(protocolCompatibility(requestForProtocol(4)).ok, true);
});

test("legacy protocol 3 receives an explicit incompatible-upgrade result", () => {
  const compatibility = protocolCompatibility(requestForProtocol(3));
  assert.equal(compatibility.ok, false);
  assert.equal(compatibility.code, "protocol_version_mismatch");
  assert.equal(compatibility.clientProtocolVersion, 3);

  const result = protocolMismatchResult(compatibility);
  assert.equal(result.ok, false);
  assert.equal(result.code, "protocol_version_mismatch");
  assert.equal(result.clientProtocolVersion, 3);
  assert.equal(result.protocolVersion, 4);
  assert.equal(result.minClientProtocolVersion, 4);
  assert.equal(result.maxClientProtocolVersion, 4);
  assert.equal(result.upgrade.required, true);
  assert.match(result.upgrade.message, /更新客户端/);
});

test("future protocols remain outside the exact protocol 4 window", () => {
  const compatibility = protocolCompatibility(requestForProtocol(5));
  assert.equal(compatibility.ok, false);
  assert.equal(compatibility.code, "protocol_version_mismatch");
  assert.equal(compatibility.clientProtocolVersion, 5);
});
