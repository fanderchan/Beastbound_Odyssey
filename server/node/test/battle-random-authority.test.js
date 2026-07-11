"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {createBattleRandomAuthority} = require("../src/auth/battle-random-authority");

function deterministicAuthority(byte = 0x41) {
  return createBattleRandomAuthority({
    randomBytes(size) {
      return Buffer.alloc(size, byte);
    },
  });
}

test("private battle rolls are deterministic, purpose-separated and never expose their secret", () => {
  const authority = deterministicAuthority();
  const context = {
    purpose: "dodge.v1",
    turnSeq: 3,
    round: 2,
    sequence: 7,
    actorId: "ally_pet",
    targetId: "enemy_pet",
    actionId: "pet_attack",
    ordinal: 0,
  };

  assert.equal(authority.openRoom("room_a"), true);
  assert.equal(authority.openRoom("room_a"), false);
  const first = authority.roll("room_a", context);
  assert.equal(first, authority.roll("room_a", context));
  assert.notEqual(first, authority.roll("room_a", {...context, purpose: "critical.v1"}));
  assert.equal(first >= 0 && first < 1, true);
  assert.deepEqual(Object.keys(authority).sort(), ["closeRoom", "hasRoom", "index", "openRoom", "roll"]);
});

test("missing or closed rooms fail closed instead of falling back to a public seed", () => {
  const authority = deterministicAuthority();
  const context = {purpose: "counter.v1"};

  assert.throws(() => authority.roll("missing", context), {code: "battle_random_room_missing"});
  authority.openRoom("room_b");
  assert.equal(authority.hasRoom("room_b"), true);
  assert.equal(authority.closeRoom("room_b"), true);
  assert.equal(authority.hasRoom("room_b"), false);
  assert.throws(() => authority.roll("room_b", context), {code: "battle_random_room_missing"});
});

test("authority validates secret size, purpose and bounded indexes", () => {
  assert.throws(
    () => createBattleRandomAuthority({randomBytes: () => Buffer.alloc(8)}).openRoom("bad"),
    /32 bytes/,
  );
  const authority = deterministicAuthority(0x22);
  authority.openRoom("room_c");
  assert.throws(() => authority.roll("room_c", {purpose: ""}), /purpose/);
  const index = authority.index("room_c", {purpose: "damage_variance.v1"}, 7);
  assert.equal(index >= 0 && index < 7, true);
});
