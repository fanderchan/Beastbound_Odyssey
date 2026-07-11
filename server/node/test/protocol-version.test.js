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

test("protocol 7 is the only supported client window", () => {
  assert.equal(PROTOCOL_VERSION, 7);
  assert.equal(MIN_CLIENT_PROTOCOL_VERSION, 7);
  assert.equal(MAX_CLIENT_PROTOCOL_VERSION, 7);
  assert.deepEqual(
    {
      protocolVersion: protocolMetadata().protocolVersion,
      minClientProtocolVersion: protocolMetadata().minClientProtocolVersion,
      maxClientProtocolVersion: protocolMetadata().maxClientProtocolVersion,
    },
    {
      protocolVersion: 7,
      minClientProtocolVersion: 7,
      maxClientProtocolVersion: 7,
    },
  );
  assert.equal(protocolCompatibility(requestForProtocol(7)).ok, true);
});

test("legacy protocol 6 receives an explicit incompatible-upgrade result", () => {
  const compatibility = protocolCompatibility(requestForProtocol(6));
  assert.equal(compatibility.ok, false);
  assert.equal(compatibility.code, "protocol_version_mismatch");
  assert.equal(compatibility.clientProtocolVersion, 6);

  const result = protocolMismatchResult(compatibility);
  assert.equal(result.ok, false);
  assert.equal(result.code, "protocol_version_mismatch");
  assert.equal(result.clientProtocolVersion, 6);
  assert.equal(result.protocolVersion, 7);
  assert.equal(result.minClientProtocolVersion, 7);
  assert.equal(result.maxClientProtocolVersion, 7);
  assert.equal(result.upgrade.required, true);
  assert.match(result.upgrade.message, /更新客户端/);
});

test("future protocols remain outside the exact protocol 7 window", () => {
  const compatibility = protocolCompatibility(requestForProtocol(8));
  assert.equal(compatibility.ok, false);
  assert.equal(compatibility.code, "protocol_version_mismatch");
  assert.equal(compatibility.clientProtocolVersion, 8);
});
