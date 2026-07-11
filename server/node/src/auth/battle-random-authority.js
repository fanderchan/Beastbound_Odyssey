"use strict";

const crypto = require("node:crypto");

const SECRET_BYTES = 32;
const PURPOSE_PATTERN = /^[a-z][a-z0-9_.-]{0,47}$/;
const CONTEXT_FIELDS = Object.freeze([
  "turnSeq",
  "round",
  "sequence",
  "actorId",
  "targetId",
  "actionId",
  "ordinal",
]);

function roomId(value) {
  const id = String(value || "").trim();
  if (id === "") {
    throw new TypeError("battle random room id is required");
  }
  return id;
}

function canonicalContext(room, value) {
  const context = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const purpose = String(context.purpose || "").trim();
  if (!PURPOSE_PATTERN.test(purpose)) {
    throw new TypeError("battle random purpose is invalid");
  }
  const parts = ["beastbound-battle-roll-v1", room, purpose];
  for (const field of CONTEXT_FIELDS) {
    const raw = context[field];
    if (["turnSeq", "round", "sequence", "ordinal"].includes(field)) {
      const number = Number(raw || 0);
      parts.push(`${field}=${Number.isFinite(number) ? Math.trunc(number) : 0}`);
    } else {
      parts.push(`${field}=${String(raw || "")}`);
    }
  }
  return parts.join("\u0000");
}

function createBattleRandomAuthority({randomBytes = crypto.randomBytes} = {}) {
  if (typeof randomBytes !== "function") {
    throw new TypeError("battle random authority requires randomBytes");
  }
  const secrets = new Map();

  function openRoom(value) {
    const id = roomId(value);
    if (secrets.has(id)) {
      return false;
    }
    const secret = randomBytes(SECRET_BYTES);
    if (!Buffer.isBuffer(secret) || secret.length !== SECRET_BYTES) {
      throw new TypeError(`battle random secret must contain ${SECRET_BYTES} bytes`);
    }
    secrets.set(id, Buffer.from(secret));
    return true;
  }

  function closeRoom(value) {
    return secrets.delete(roomId(value));
  }

  function hasRoom(value) {
    return secrets.has(String(value || "").trim());
  }

  function roll(value, context) {
    const id = roomId(value);
    const secret = secrets.get(id);
    if (!secret) {
      const error = new Error("battle random room is not open");
      error.code = "battle_random_room_missing";
      throw error;
    }
    const digest = crypto.createHmac("sha256", secret).update(canonicalContext(id, context)).digest();
    return (digest.readUInt32BE(0) % 10000) / 10000;
  }

  function index(value, context, size) {
    const count = Math.trunc(Number(size || 0));
    if (!Number.isFinite(count) || count <= 0) {
      throw new TypeError("battle random index size must be positive");
    }
    return Math.min(count - 1, Math.floor(roll(value, context) * count));
  }

  return Object.freeze({openRoom, closeRoom, hasRoom, roll, index});
}

module.exports = {createBattleRandomAuthority};
