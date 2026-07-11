"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  freezeStatusSourceCredit,
  publicBattleStatuses,
  resolveStatusHit,
  statusSourceActor,
} = require("../src/auth/battle-status-rules");

test("status source credit freezes the real actor and public statuses omit internal attribution", () => {
  const source = {
    actorId: "pet_source",
    accountId: "acc_owner",
    kind: "pet",
    petId: "pet_instance_source",
    displayName: "施毒宠",
    level: 28,
    ridePetInstanceId: "must_not_matter_for_pet",
    ridePetMaxHp: 80,
  };
  const sourceCredit = freezeStatusSourceCredit(source);
  source.petId = "changed_after_apply";
  const statuses = {
    poison: {
      id: "poison",
      label: "中毒",
      turns: 3,
      potency: 6,
      sourceId: "pet_source",
      sourceCredit,
    },
  };

  assert.equal(statusSourceActor(statuses.poison).petId, "pet_instance_source");
  assert.deepEqual(publicBattleStatuses(statuses), {
    poison: {id: "poison", label: "中毒", turns: 3, potency: 6, sourceId: "pet_source"},
  });
  assert.equal(JSON.stringify(publicBattleStatuses(statuses)).includes("sourceCredit"), false);
  assert.equal(JSON.stringify(publicBattleStatuses(statuses)).includes("acc_owner"), false);
});

test("private status rolls use status.v1 and return only final hit facts", () => {
  const contexts = [];
  const authority = {
    roll(roomId, context) {
      contexts.push({roomId, ...context});
      return 0.24;
    },
  };
  const applied = resolveStatusHit({
    randomAuthority: authority,
    roomId: "room_status",
    turnSeq: 4,
    round: 3,
    sequence: 7,
    actorId: "source",
    targetId: "target",
    actionId: "pet_sleep_powder",
    statusId: "sleep",
    baseRate: 0.82,
    resistance: 0.1,
  });
  assert.deepEqual(applied, {
    hit: true,
    result: "applied",
    chance: 0.72,
    resistance: 0.1,
    immune: false,
  });
  assert.deepEqual(contexts, [{
    roomId: "room_status",
    purpose: "status.v1",
    turnSeq: 4,
    round: 3,
    sequence: 7,
    actorId: "source",
    targetId: "target",
    actionId: "pet_sleep_powder",
    statusId: "sleep",
    ordinal: 0,
  }]);
  assert.equal(Object.prototype.hasOwnProperty.call(applied, "roll"), false);

  const immune = resolveStatusHit({
    randomAuthority: authority,
    roomId: "room_status",
    targetId: "immune_target",
    statusId: "stone",
    baseRate: 1,
    resistance: 1,
    immune: true,
  });
  assert.deepEqual(immune, {hit: false, result: "immune", chance: 0, resistance: 1, immune: true});
  assert.equal(contexts.length, 1);
});
