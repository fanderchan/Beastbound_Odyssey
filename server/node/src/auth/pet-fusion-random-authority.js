"use strict";

const crypto = require("node:crypto");

const {isValidPetPrivateSeed} = require("./pet-private-seed");

const PET_FUSION_RANDOM_SCHEMA_VERSION = 1;
const PET_FUSION_ROOT_SEED_PREFIX = "bpfr1_";
const PET_FUSION_ROOT_ENTROPY_BYTES = 32;
const PET_FUSION_ROOT_PAYLOAD_LENGTH = 43;
const PET_FUSION_ROOT_SEED_PATTERN = new RegExp(
  `^${PET_FUSION_ROOT_SEED_PREFIX}[A-Za-z0-9_-]{${PET_FUSION_ROOT_PAYLOAD_LENGTH}}$`,
);
const RANDOM_LABEL_PATTERN = /^[a-z][a-z0-9._-]{0,95}$/;
const ROOT_DOMAIN = Buffer.from("beastbound-odyssey/pet-fusion/root/v1", "utf8");
const ROLL_DOMAIN = Buffer.from("beastbound-odyssey/pet-fusion/roll/v1", "utf8");
const GROWTH_DOMAIN = Buffer.from("beastbound-odyssey/pet-fusion/growth/v1", "utf8");
const COMMITMENT_DOMAIN = Buffer.from(
  "beastbound-odyssey/pet-fusion/commitment/v1",
  "utf8",
);

class PetFusionRandomAuthorityError extends Error {
  constructor(code, message) {
    super(String(message || "pet fusion random authority failed"));
    this.name = "PetFusionRandomAuthorityError";
    this.code = String(code || "pet_fusion_random_invalid");
  }
}

function createPetFusionRandomAuthority(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new PetFusionRandomAuthorityError(
      "pet_fusion_random_configuration_invalid",
      "pet fusion random authority options must be an object",
    );
  }
  const keys = Object.keys(options);
  if (keys.some((key) => key !== "randomBytes")) {
    throw new PetFusionRandomAuthorityError(
      "pet_fusion_random_configuration_invalid",
      "pet fusion random authority options contain unknown fields",
    );
  }
  const randomBytes = options.randomBytes === undefined
    ? crypto.randomBytes
    : options.randomBytes;
  if (typeof randomBytes !== "function") {
    throw new PetFusionRandomAuthorityError(
      "pet_fusion_random_configuration_invalid",
      "pet fusion random authority requires randomBytes",
    );
  }

  function open() {
    let entropy;
    try {
      const generated = randomBytes(PET_FUSION_ROOT_ENTROPY_BYTES);
      if (!Buffer.isBuffer(generated) && !(generated instanceof Uint8Array)) {
        throw new TypeError("pet fusion random authority requires bytes");
      }
      entropy = Buffer.from(generated);
    } catch (_error) {
      throw new PetFusionRandomAuthorityError(
        "pet_fusion_random_entropy_failed",
        "pet fusion random entropy could not be generated",
      );
    }
    if (entropy.length !== PET_FUSION_ROOT_ENTROPY_BYTES) {
      throw new PetFusionRandomAuthorityError(
        "pet_fusion_random_entropy_failed",
        "pet fusion random entropy has an invalid length",
      );
    }
    const rootDigest = crypto.createHash("sha256")
      .update(ROOT_DOMAIN)
      .update(Buffer.from([0]))
      .update(entropy)
      .digest();
    return createPetFusionRandomContext(
      `${PET_FUSION_ROOT_SEED_PREFIX}${rootDigest.toString("base64url")}`,
    );
  }

  return Object.freeze({open});
}

function createPetFusionRandomContext(rootSeedValue) {
  const privateRootSeed = assertPetFusionRootSeed(rootSeedValue);
  const rootBytes = decodePetFusionRootSeed(privateRootSeed);
  const growthPrivateSeed = `bps1_${deriveDigest(rootBytes, GROWTH_DOMAIN, "growth").toString("base64url")}`;
  if (!isValidPetPrivateSeed(growthPrivateSeed)) {
    throw new PetFusionRandomAuthorityError(
      "pet_fusion_growth_seed_invalid",
      "pet fusion growth seed derivation failed",
    );
  }
  const seedCommitment = crypto.createHash("sha256")
    .update(COMMITMENT_DOMAIN)
    .update(Buffer.from([0]))
    .update(rootBytes)
    .digest("hex");

  function roll(labelValue) {
    const label = String(labelValue || "");
    if (!RANDOM_LABEL_PATTERN.test(label)) {
      throw new PetFusionRandomAuthorityError(
        "pet_fusion_random_label_invalid",
        "pet fusion random label must be a stable lowercase namespace",
      );
    }
    const digest = deriveDigest(rootBytes, ROLL_DOMAIN, label);
    const high = digest.readUInt32BE(0) >>> 5;
    const low = digest.readUInt32BE(4) >>> 6;
    return (high * 0x4000000 + low) / 0x20000000000000;
  }

  return Object.freeze({
    schemaVersion: PET_FUSION_RANDOM_SCHEMA_VERSION,
    privateRootSeed,
    seedCommitment,
    growthPrivateSeed,
    roll,
  });
}

function deriveDigest(rootBytes, domain, label) {
  return crypto.createHmac("sha256", rootBytes)
    .update(domain)
    .update(Buffer.from([0]))
    .update(String(label), "utf8")
    .digest();
}

function assertPetFusionRootSeed(value) {
  const seed = String(value || "");
  if (!PET_FUSION_ROOT_SEED_PATTERN.test(seed)) {
    throw new PetFusionRandomAuthorityError(
      "pet_fusion_root_seed_invalid",
      "pet fusion root seed has an invalid format",
    );
  }
  const decoded = decodePetFusionRootSeed(seed);
  if (decoded.length !== PET_FUSION_ROOT_ENTROPY_BYTES) {
    throw new PetFusionRandomAuthorityError(
      "pet_fusion_root_seed_invalid",
      "pet fusion root seed has an invalid payload",
    );
  }
  return seed;
}

function decodePetFusionRootSeed(seed) {
  try {
    return Buffer.from(seed.slice(PET_FUSION_ROOT_SEED_PREFIX.length), "base64url");
  } catch (_error) {
    throw new PetFusionRandomAuthorityError(
      "pet_fusion_root_seed_invalid",
      "pet fusion root seed could not be decoded",
    );
  }
}

module.exports = {
  PET_FUSION_RANDOM_SCHEMA_VERSION,
  PET_FUSION_ROOT_ENTROPY_BYTES,
  PET_FUSION_ROOT_SEED_PREFIX,
  PetFusionRandomAuthorityError,
  assertPetFusionRootSeed,
  createPetFusionRandomAuthority,
  createPetFusionRandomContext,
};
