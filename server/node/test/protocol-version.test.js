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

test("protocol 5 is the only supported client window", () => {
  assert.equal(PROTOCOL_VERSION, 5);
  assert.equal(MIN_CLIENT_PROTOCOL_VERSION, 5);
  assert.equal(MAX_CLIENT_PROTOCOL_VERSION, 5);
  assert.deepEqual(
    {
      protocolVersion: protocolMetadata().protocolVersion,
      minClientProtocolVersion: protocolMetadata().minClientProtocolVersion,
      maxClientProtocolVersion: protocolMetadata().maxClientProtocolVersion,
    },
    {
      protocolVersion: 5,
      minClientProtocolVersion: 5,
      maxClientProtocolVersion: 5,
    },
  );
  assert.equal(protocolCompatibility(requestForProtocol(5)).ok, true);
});

test("legacy protocol 4 receives an explicit incompatible-upgrade result", () => {
  const compatibility = protocolCompatibility(requestForProtocol(4));
  assert.equal(compatibility.ok, false);
  assert.equal(compatibility.code, "protocol_version_mismatch");
  assert.equal(compatibility.clientProtocolVersion, 4);

  const result = protocolMismatchResult(compatibility);
  assert.equal(result.ok, false);
  assert.equal(result.code, "protocol_version_mismatch");
  assert.equal(result.clientProtocolVersion, 4);
  assert.equal(result.protocolVersion, 5);
  assert.equal(result.minClientProtocolVersion, 5);
  assert.equal(result.maxClientProtocolVersion, 5);
  assert.equal(result.upgrade.required, true);
  assert.match(result.upgrade.message, /更新客户端/);
});

test("future protocols remain outside the exact protocol 5 window", () => {
  const compatibility = protocolCompatibility(requestForProtocol(6));
  assert.equal(compatibility.ok, false);
  assert.equal(compatibility.code, "protocol_version_mismatch");
  assert.equal(compatibility.clientProtocolVersion, 6);
});
