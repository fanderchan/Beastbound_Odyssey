"use strict";

const crypto = require("node:crypto");

const SEED_VERSION = 1;
const SEED_PREFIX = `bps${SEED_VERSION}_`;
const ENTROPY_BYTES = 32;
const SEED_PAYLOAD_LENGTH = 43;
const SEED_LENGTH = SEED_PREFIX.length + SEED_PAYLOAD_LENGTH;
const PURPOSE_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const SEED_PATTERN = new RegExp(`^${SEED_PREFIX}[A-Za-z0-9_-]{${SEED_PAYLOAD_LENGTH}}$`);
const HASH_DOMAIN = Buffer.from(
  `beastbound-odyssey/pet-private-seed/v${SEED_VERSION}`,
  "utf8",
);

function assertPurpose(purpose) {
  if (typeof purpose !== "string" || !PURPOSE_PATTERN.test(purpose)) {
    throw new TypeError(
      "pet private seed purpose must be a lowercase namespace of 1 to 64 characters",
    );
  }
  return purpose;
}

function cryptographicEntropy() {
  const generated = crypto.randomBytes(ENTROPY_BYTES);
  if (!Buffer.isBuffer(generated) && !(generated instanceof Uint8Array)) {
    throw new TypeError("pet private seed CSPRNG must return bytes");
  }
  const entropy = Buffer.from(generated);
  if (entropy.length !== ENTROPY_BYTES) {
    throw new RangeError(`pet private seed entropy must contain exactly ${ENTROPY_BYTES} bytes`);
  }
  return entropy;
}

function generatePetPrivateSeed(purpose) {
  if (arguments.length !== 1) {
    throw new TypeError("pet private seed generation only accepts purpose");
  }
  const namespace = assertPurpose(purpose);
  const entropy = cryptographicEntropy();
  const digest = crypto.createHash("sha256")
    .update(HASH_DOMAIN)
    .update(Buffer.from([0]))
    .update(namespace, "utf8")
    .update(Buffer.from([0]))
    .update(entropy)
    .digest("base64url");
  return `${SEED_PREFIX}${digest}`;
}

function isValidPetPrivateSeed(seed) {
  return typeof seed === "string"
    && seed.length === SEED_LENGTH
    && SEED_PATTERN.test(seed);
}

function assertPetPrivateSeed(seed) {
  if (!isValidPetPrivateSeed(seed)) {
    throw new TypeError("pet private seed has an invalid format or length");
  }
  return seed;
}

module.exports = {
  ENTROPY_BYTES,
  SEED_LENGTH,
  SEED_PREFIX,
  SEED_VERSION,
  assertPetPrivateSeed,
  generatePetPrivateSeed,
  isValidPetPrivateSeed,
};
