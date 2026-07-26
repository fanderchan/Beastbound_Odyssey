"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
  battleProfileWithPets,
} = require("../test-support/auth-service-test-context");

function saveBattleProfile(service, account, profile) {
  const saved = service.saveProfile(account.session.token, {
    expectedRevision: 0,
    profile,
  });
  assert.equal(saved.ok, true);
}

function placeForDuel(service, account, cellX, facing) {
  const positioned = service.updatePlayerPosition(account.session.token, {
    mapId: "village",
    cellX,
    cellY: 10,
    facing,
    moving: false,
  });
  assert.equal(positioned.ok, true);
}

function actorFor(room, accountId, kind) {
  return room.battle.actors.find((actor) => (
    actor.accountId === accountId
    && actor.kind === kind
  ));
}

function assertFusionInstancePassiveOnly(actor, expectedPetId) {
  assert.equal(actor.petId, expectedPetId);
  assert.deepEqual(actor.passiveSkillIds, ["poison_resistance"]);
  assert.deepEqual(actor.statusResist, {poison: 0.35});
  assert.deepEqual(actor.statusImmune, {});
  assert.equal(Object.hasOwn(actor, "fusionLineage"), false);
  assert.equal(Object.hasOwn(actor, "fusionPrivate"), false);
}

test("duel snapshots and switch-pet recognize terminal fusion aliases without lineage or template passive stacking", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const challenger = service.register({
    username: "fusionbattlea",
    password: "test1234",
    displayName: "融合切宠甲",
  });
  const opponent = service.register({
    username: "fusionbattleb",
    password: "test1234",
    displayName: "融合切宠乙",
  });
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);

  const challengerProfile = battleProfileWithPets(
    "融合切宠甲",
    {level: 12, hp: 150, maxHp: 150, attack: 20, defense: 8, quick: 50},
    [
      {
        petId: "fusion_active_bui",
        formId: "emberhorn_fusion_solar_crown_fire7_wind3",
        name: "融合首发布伊",
        state: "battle",
        hp: 90,
        maxHp: 90,
        attack: 17,
        defense: 7,
        quick: 42,
      },
      {
        petId: "fusion_standby_wuli",
        formId: "wuli_normal_tough_earth10",
        name: "融合候补乌力",
        state: "standby",
        hp: 92,
        maxHp: 92,
        attack: 24,
        defense: 9,
        quick: 70,
      },
    ],
  );
  Object.assign(challengerProfile.petInstances[0], {
    passiveSkillIds: ["poison_resistance"],
    fusionPrivate: {privateRootSeed: "private_active_battle_seed"},
  });
  Object.assign(challengerProfile.petInstances[1], {
    templateId: "emberhorn_fusion_moss_rampart_fire4_earth6",
    speciesId: "wuli_normal_tough_earth10",
    passiveSkillIds: ["poison_resistance"],
    // 形态别名冲突也必须失败关闭为融合身份，不能回退叠加乌力模板硬壳。
    fusionPrivate: {privateRootSeed: "private_standby_battle_seed"},
  });
  saveBattleProfile(service, challenger, challengerProfile);
  saveBattleProfile(
    service,
    opponent,
    battleProfileWithPets(
      "融合切宠乙",
      {level: 12, hp: 150, maxHp: 150, attack: 20, defense: 8, quick: 60},
      [{
        petId: "ordinary_opponent_bui",
        formId: "bui_normal_red_fire10",
        name: "普通对手布伊",
        state: "battle",
        hp: 90,
        maxHp: 90,
        attack: 16,
        defense: 7,
        quick: 45,
      }],
    ),
  );
  placeForDuel(service, challenger, 10, "east");
  placeForDuel(service, opponent, 11, "west");

  const invite = service.inviteToBattle(challenger.session.token, {
    username: opponent.account.username,
  });
  assert.equal(invite.ok, true);
  const accepted = service.acceptBattleInvite(
    opponent.session.token,
    invite.invite.inviteId,
  );
  assert.equal(accepted.ok, true);

  const challengerPlayer = actorFor(
    accepted.room,
    challenger.account.accountId,
    "player",
  );
  const challengerPet = actorFor(
    accepted.room,
    challenger.account.accountId,
    "pet",
  );
  const opponentPlayer = actorFor(
    accepted.room,
    opponent.account.accountId,
    "player",
  );
  const opponentPet = actorFor(
    accepted.room,
    opponent.account.accountId,
    "pet",
  );
  assertFusionInstancePassiveOnly(challengerPet, "fusion_active_bui");

  const acceptedJson = JSON.stringify(accepted.room);
  assert.equal(acceptedJson.includes("fusionLineage"), false);
  assert.equal(acceptedJson.includes("fusionPrivate"), false);
  assert.equal(acceptedJson.includes("private_active_battle_seed"), false);
  assert.equal(acceptedJson.includes("private_standby_battle_seed"), false);

  const internalRoom = service.snapshot().battleRooms[accepted.room.roomId];
  const internalParticipant = internalRoom.participants.find(
    (entry) => entry.accountId === challenger.account.accountId,
  );
  const internalActiveSnapshot = internalParticipant.teamSnapshot.battlePets.find(
    (pet) => pet.petId === "fusion_active_bui",
  );
  const internalStandbySnapshot = internalParticipant.teamSnapshot.battlePets.find(
    (pet) => pet.petId === "fusion_standby_wuli",
  );
  assert.deepEqual(internalActiveSnapshot.fusionLineage, {mode: "fusion"});
  assert.deepEqual(internalStandbySnapshot.fusionLineage, {mode: "fusion"});
  assert.deepEqual(internalActiveSnapshot.passiveSkillIds, ["poison_resistance"]);
  assert.deepEqual(internalStandbySnapshot.passiveSkillIds, ["poison_resistance"]);
  assert.equal(Object.hasOwn(internalActiveSnapshot, "fusionPrivate"), false);
  assert.equal(Object.hasOwn(internalStandbySnapshot, "fusionPrivate"), false);
  const internalActiveActor = internalRoom.battle.actors.find(
    (actor) => actor.petId === "fusion_active_bui",
  );
  assert.deepEqual(internalActiveActor.fusionLineage, {mode: "fusion"});

  assert.equal(service.submitBattleCommand(challenger.session.token, accepted.room.roomId, {
    round: 1,
    actorId: challengerPlayer.actorId,
    actionId: "defend",
  }).turn, null);
  assert.equal(service.submitBattleCommand(challenger.session.token, accepted.room.roomId, {
    round: 1,
    actorId: challengerPet.actorId,
    actionId: "pet_defend",
  }).turn, null);
  assert.equal(service.submitBattleCommand(opponent.session.token, accepted.room.roomId, {
    round: 1,
    actorId: opponentPlayer.actorId,
    actionId: "defend",
  }).turn, null);
  const firstRound = service.submitBattleCommand(opponent.session.token, accepted.room.roomId, {
    round: 1,
    actorId: opponentPet.actorId,
    actionId: "pet_defend",
  });
  assert.equal(firstRound.ok, true);
  assert.ok(firstRound.turn);

  const switchCommand = service.submitBattleCommand(
    challenger.session.token,
    accepted.room.roomId,
    {
      round: 2,
      actorId: challengerPlayer.actorId,
      actionId: "switch_pet",
      petId: "fusion_standby_wuli",
    },
  );
  assert.equal(switchCommand.ok, true);
  assert.equal(switchCommand.turn, null);
  assert.equal(service.submitBattleCommand(opponent.session.token, accepted.room.roomId, {
    round: 2,
    actorId: opponentPlayer.actorId,
    actionId: "defend",
  }).turn, null);
  const switched = service.submitBattleCommand(
    opponent.session.token,
    accepted.room.roomId,
    {
      round: 2,
      actorId: opponentPet.actorId,
      actionId: "pet_defend",
    },
  );
  assert.equal(switched.ok, true);
  assert.ok(switched.turn);

  const switchEvent = switched.turn.events.find(
    (event) => event.eventType === "switch_pet",
  );
  assert.ok(switchEvent);
  assertFusionInstancePassiveOnly(switchEvent.nextPet, "fusion_standby_wuli");
  const switchedPet = actorFor(
    switched.room,
    challenger.account.accountId,
    "pet",
  );
  assertFusionInstancePassiveOnly(switchedPet, "fusion_standby_wuli");
  assert.equal(switchedPet.statusResist.stone, undefined);
  assert.equal(switchedPet.statusImmune.stone, undefined);

  const switchedJson = JSON.stringify(switched);
  assert.equal(switchedJson.includes("fusionLineage"), false);
  assert.equal(switchedJson.includes("fusionPrivate"), false);
  assert.equal(switchedJson.includes("private_active_battle_seed"), false);
  assert.equal(switchedJson.includes("private_standby_battle_seed"), false);

  const internalSwitchedRoom = service.snapshot().battleRooms[accepted.room.roomId];
  const internalSwitchedActor = internalSwitchedRoom.battle.actors.find(
    (actor) => actor.petId === "fusion_standby_wuli",
  );
  assert.deepEqual(internalSwitchedActor.fusionLineage, {mode: "fusion"});
  assert.deepEqual(internalSwitchedActor.passiveSkillIds, ["poison_resistance"]);
  assert.deepEqual(internalSwitchedActor.statusResist, {poison: 0.35});
  assert.deepEqual(internalSwitchedActor.statusImmune, {});
});
