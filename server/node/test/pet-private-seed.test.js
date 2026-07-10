"use strict";

const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const test = require("node:test");

const PetPrivateSeed = require("../src/auth/pet-private-seed");

function fixedEntropy(fill) {
  return (requestedBytes) => {
    assert.equal(requestedBytes, PetPrivateSeed.ENTROPY_BYTES);
    return Buffer.alloc(requestedBytes, fill);
  };
}

test("test-only crypto mock makes derivation deterministic and opaque", (context) => {
  context.mock.method(crypto, "randomBytes", fixedEntropy(0x5a));
  const first = PetPrivateSeed.generatePetPrivateSeed("capture");
  const second = PetPrivateSeed.generatePetPrivateSeed("capture");

  assert.equal(first, second);
  assert.equal(first.length, PetPrivateSeed.SEED_LENGTH);
  assert.equal(first.startsWith(PetPrivateSeed.SEED_PREFIX), true);
  assert.equal(first.includes("capture"), false);
  assert.equal(PetPrivateSeed.isValidPetPrivateSeed(first), true);
  assert.equal(PetPrivateSeed.assertPetPrivateSeed(first), first);
});

test("default private seeds use fresh cryptographic entropy", () => {
  const first = PetPrivateSeed.generatePetPrivateSeed("capture");
  const second = PetPrivateSeed.generatePetPrivateSeed("capture");

  assert.notEqual(first, second);
  assert.equal(PetPrivateSeed.isValidPetPrivateSeed(first), true);
  assert.equal(PetPrivateSeed.isValidPetPrivateSeed(second), true);
});

test("purpose namespaces are domain-separated without becoming public seed fields", (context) => {
  context.mock.method(crypto, "randomBytes", fixedEntropy(0x31));
  const capture = PetPrivateSeed.generatePetPrivateSeed("capture");
  const rebirth = PetPrivateSeed.generatePetPrivateSeed("rebirth");

  assert.notEqual(capture, rebirth);
  assert.equal(capture.includes("capture"), false);
  assert.equal(rebirth.includes("rebirth"), false);
});

test("private seed generation rejects invalid purpose, extra arguments, and stored seeds", () => {
  for (const purpose of [undefined, null, "", "Capture", "capture room", "a".repeat(65)]) {
    assert.throws(
      () => PetPrivateSeed.generatePetPrivateSeed(purpose),
      /purpose/,
    );
  }

  assert.throws(
    () => PetPrivateSeed.generatePetPrivateSeed("capture", {"entropySource": fixedEntropy(0)}),
    /only accepts purpose/,
  );

  for (const seed of [
    undefined,
    null,
    "",
    `${PetPrivateSeed.SEED_PREFIX}${"a".repeat(42)}`,
    `${PetPrivateSeed.SEED_PREFIX}${"a".repeat(44)}`,
    `${PetPrivateSeed.SEED_PREFIX}${"!".repeat(43)}`,
    `wrong_${"a".repeat(43)}`,
  ]) {
    assert.equal(PetPrivateSeed.isValidPetPrivateSeed(seed), false);
    assert.throws(() => PetPrivateSeed.assertPetPrivateSeed(seed), /format or length/);
  }
});
