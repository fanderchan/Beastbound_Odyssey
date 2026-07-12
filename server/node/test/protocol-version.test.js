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

test("protocol 8 is the only supported client window", () => {
  assert.equal(PROTOCOL_VERSION, 8);
  assert.equal(MIN_CLIENT_PROTOCOL_VERSION, 8);
  assert.equal(MAX_CLIENT_PROTOCOL_VERSION, 8);
  assert.deepEqual(
    {
      protocolVersion: protocolMetadata().protocolVersion,
      minClientProtocolVersion: protocolMetadata().minClientProtocolVersion,
      maxClientProtocolVersion: protocolMetadata().maxClientProtocolVersion,
    },
    {
      protocolVersion: 8,
      minClientProtocolVersion: 8,
      maxClientProtocolVersion: 8,
    },
  );
  assert.equal(protocolCompatibility(requestForProtocol(8)).ok, true);
});

test("legacy protocol 7 receives an explicit incompatible-upgrade result", () => {
  const compatibility = protocolCompatibility(requestForProtocol(7));
  assert.equal(compatibility.ok, false);
  assert.equal(compatibility.code, "protocol_version_mismatch");
  assert.equal(compatibility.clientProtocolVersion, 7);

  const result = protocolMismatchResult(compatibility);
  assert.equal(result.ok, false);
  assert.equal(result.code, "protocol_version_mismatch");
  assert.equal(result.clientProtocolVersion, 7);
  assert.equal(result.protocolVersion, 8);
  assert.equal(result.minClientProtocolVersion, 8);
  assert.equal(result.maxClientProtocolVersion, 8);
  assert.equal(result.upgrade.required, true);
  assert.match(result.upgrade.message, /更新客户端/);
});

test("future protocols remain outside the exact protocol 8 window", () => {
  const compatibility = protocolCompatibility(requestForProtocol(9));
  assert.equal(compatibility.ok, false);
  assert.equal(compatibility.code, "protocol_version_mismatch");
  assert.equal(compatibility.clientProtocolVersion, 9);
});
