"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {isValidPetPrivateSeed} = require("../src/auth/pet-private-seed");
const {
  PET_FUSION_ROOT_ENTROPY_BYTES,
  PetFusionRandomAuthorityError,
  createPetFusionRandomAuthority,
  createPetFusionRandomContext,
} = require("../src/auth/pet-fusion-random-authority");

function fixedRootSeed(byte) {
  return `bpfr1_${Buffer.alloc(PET_FUSION_ROOT_ENTROPY_BYTES, byte).toString("base64url")}`;
}

test("fixed fusion roots reproduce every labeled roll and the derived growth seed", () => {
  const first = createPetFusionRandomContext(fixedRootSeed(0x31));
  const replay = createPetFusionRandomContext(fixedRootSeed(0x31));
  const other = createPetFusionRandomContext(fixedRootSeed(0x32));
  const labels = [
    "inherit.active.core",
    "inherit.active.resonance_one",
    "inherit.active.resonance_two",
    "inherit.passive.source",
  ];

  assert.equal(first.privateRootSeed, replay.privateRootSeed);
  assert.equal(first.seedCommitment, replay.seedCommitment);
  assert.equal(first.growthPrivateSeed, replay.growthPrivateSeed);
  assert.equal(isValidPetPrivateSeed(first.growthPrivateSeed), true);
  assert.deepEqual(labels.map(first.roll), labels.map(replay.roll));
  for (const value of labels.map(first.roll)) {
    assert.equal(Number.isFinite(value), true);
    assert.equal(value >= 0 && value < 1, true);
  }
  assert.notEqual(first.seedCommitment, other.seedCommitment);
  assert.notEqual(first.growthPrivateSeed, other.growthPrivateSeed);
  assert.notDeepEqual(labels.map(first.roll), labels.map(other.roll));
});

test("production authority consumes exactly one 32-byte entropy block", () => {
  const calls = [];
  const authority = createPetFusionRandomAuthority({
    randomBytes(size) {
      calls.push(size);
      return Buffer.alloc(size, 0x44);
    },
  });
  const context = authority.open();

  assert.deepEqual(calls, [PET_FUSION_ROOT_ENTROPY_BYTES]);
  assert.equal(context.privateRootSeed, fixedRootSeedDigest(0x44));
  assert.equal(isValidPetPrivateSeed(context.growthPrivateSeed), true);
});

test("random authority rejects malformed configuration, entropy, roots, and labels", () => {
  assert.throws(
    () => createPetFusionRandomAuthority({unexpected: true}),
    (error) => error instanceof PetFusionRandomAuthorityError
      && error.code === "pet_fusion_random_configuration_invalid",
  );
  assert.throws(
    () => createPetFusionRandomAuthority({randomBytes: () => Buffer.alloc(8)}).open(),
    (error) => error instanceof PetFusionRandomAuthorityError
      && error.code === "pet_fusion_random_entropy_failed",
  );
  assert.throws(
    () => createPetFusionRandomAuthority({randomBytes: () => "x".repeat(32)}).open(),
    (error) => error instanceof PetFusionRandomAuthorityError
      && error.code === "pet_fusion_random_entropy_failed",
  );
  assert.throws(
    () => createPetFusionRandomContext("client-chosen-seed"),
    (error) => error instanceof PetFusionRandomAuthorityError
      && error.code === "pet_fusion_root_seed_invalid",
  );
  const context = createPetFusionRandomContext(fixedRootSeed(0x61));
  assert.throws(
    () => context.roll("Bad Label"),
    (error) => error instanceof PetFusionRandomAuthorityError
      && error.code === "pet_fusion_random_label_invalid",
  );
});

function fixedRootSeedDigest(byte) {
  const crypto = require("node:crypto");
  const rootDomain = Buffer.from("beastbound-odyssey/pet-fusion/root/v1", "utf8");
  const digest = crypto.createHash("sha256")
    .update(rootDomain)
    .update(Buffer.from([0]))
    .update(Buffer.alloc(PET_FUSION_ROOT_ENTROPY_BYTES, byte))
    .digest("base64url");
  return `bpfr1_${digest}`;
}
