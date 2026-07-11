"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
  battleProfile,
} = require("../test-support/auth-service-test-context");

function deterministicBattleRandomAuthority(rollForContext = null) {
  const roomIds = new Set();
  return Object.freeze({
    openRoom(roomId) {
      const id = String(roomId || "");
      if (roomIds.has(id)) return false;
      roomIds.add(id);
      return true;
    },
    closeRoom(roomId) {
      return roomIds.delete(String(roomId || ""));
    },
    hasRoom(roomId) {
      return roomIds.has(String(roomId || ""));
    },
    roll(roomId, context = {}) {
      assert.equal(roomIds.has(String(roomId || "")), true);
      if (String(context.purpose || "") === "status.v1") return 0;
      if (typeof rollForContext === "function") return Number(rollForContext(context));
      return 0.9999;
    },
    index(roomId, context, size) {
      const count = Math.max(1, Math.trunc(Number(size || 1)));
      return Math.min(count - 1, Math.floor(this.roll(roomId, context) * count));
    },
  });
}

function profileWithRide(name, playerStats, ride = {}) {
  const profile = battleProfile(name, playerStats, null);
  const instanceId = String(ride.instanceId || "ride_pet");
  profile.ridePetInstanceId = instanceId;
  profile.petInstances.push({
    instanceId,
    petId: instanceId,
    formId: String(ride.formId || "novice_tiger_mount"),
    name: String(ride.name || "权威骑宠"),
    state: "riding",
    level: Number(ride.level || 20),
    hp: Number(ride.hp ?? 20),
    maxHp: Number(ride.maxHp ?? 20),
    attack: Number(ride.attack || 80),
    defense: Number(ride.defense || 60),
    quick: Number(ride.quick || 90),
  });
  return profile;
}

function placeForDuel(service, account, token, cellX) {
  const result = service.updatePlayerPosition(token, {
    mapId: "firebud_training_yard",
    cellX,
    cellY: 10,
    facing: cellX < 11 ? "east" : "west",
    moving: false,
  });
  assert.equal(result.ok, true, account.username);
}

function createRidingDuel({
  suffix,
  challengerProfile,
  opponentProfile,
  battleRandomAuthority = deterministicBattleRandomAuthority(),
  serviceOptions = {},
}) {
  const service = createAuthService({
    store: createMemoryAuthStore(),
    ...serviceOptions,
    battleRandomAuthority,
  });
  const challenger = service.register({username: `ride${suffix}a`, password: "test1234", displayName: `${suffix}甲`});
  const opponent = service.register({username: `ride${suffix}b`, password: "test1234", displayName: `${suffix}乙`});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  assert.equal(service.saveProfile(challenger.session.token, {expectedRevision: 0, profile: challengerProfile}).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {expectedRevision: 0, profile: opponentProfile}).ok, true);
  placeForDuel(service, challenger.account, challenger.session.token, 10);
  placeForDuel(service, opponent.account, opponent.session.token, 11);
  const invite = service.inviteToBattle(challenger.session.token, {username: opponent.account.username});
  assert.equal(invite.ok, true);
  const accepted = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accepted.ok, true);
  return {service, challenger, opponent, room: accepted.room};
}

test("online riding stats, direct split, knock fallback and profile writeback are authoritative", () => {
  const challengerProfile = battleProfile("分伤甲", {
    level: 20, hp: 400, maxHp: 400, attack: 40, defense: 20, quick: 200, comboRateOverride: 0,
  });
  const opponentProfile = profileWithRide("分伤乙", {
    level: 20, hp: 400, maxHp: 400, attack: 30, defense: 10, quick: 10, comboRateOverride: 0,
  }, {
    instanceId: "ride_split_pet",
    name: "分伤骑宠",
    hp: 1,
    maxHp: 20,
    attack: 80,
    defense: 60,
    quick: 90,
  });
  const {service, challenger, opponent, room} = createRidingDuel({
    suffix: "split",
    challengerProfile,
    opponentProfile,
  });
  const attacker = room.battle.actors.find((actor) => actor.accountId === challenger.account.accountId && actor.kind === "player");
  const rider = room.battle.actors.find((actor) => actor.accountId === opponent.account.accountId && actor.kind === "player");
  assert.deepEqual(
    {attack: rider.attack, defense: rider.defense, speed: rider.speed},
    {attack: 88, defense: 49, speed: 74},
  );

  assert.equal(service.submitBattleCommand(challenger.session.token, room.roomId, {
    round: 1, actorId: attacker.actorId, actionId: "attack", targetActorId: rider.actorId,
  }).turn, null);
  const firstRound = service.submitBattleCommand(opponent.session.token, room.roomId, {
    round: 1, actorId: rider.actorId, actionId: "defend",
  });
  assert.equal(firstRound.ok, true);
  const firstHit = firstRound.turn.events.find((event) => event.actorId === attacker.actorId && event.targetActorId === rider.actorId);
  assert.equal(Boolean(firstHit), true);
  assert.equal(firstHit.schemaVersion, 3);
  assert.equal(firstHit.actorDamage + firstHit.rideDamage, firstHit.damage);
  assert.equal(firstHit.rideDamage, 1);
  assert.equal(firstHit.rideHpBefore, 1);
  assert.equal(firstHit.rideHpAfter, 0);
  assert.equal(firstHit.ridePetKnocked, true);
  assert.equal(firstHit.rideActiveBefore, true);
  assert.equal(firstHit.rideActiveAfter, false);
  assert.equal(firstHit.ridePetBattleStateAfter, "rest");
  assert.deepEqual(
    {attack: firstHit.attackAfter, defense: firstHit.defenseAfter, speed: firstHit.speedAfter},
    {attack: 30, defense: 10, speed: 10},
  );
  assert.match(firstHit.message, /分伤骑宠承受1，人物承受/);
  assert.match(firstHit.message, /倒下并解除骑乘/);
  const afterFirst = firstRound.room.battle.actors.find((actor) => actor.actorId === rider.actorId);
  assert.equal(afterFirst.ridePetInstanceId, "ride_split_pet");
  assert.equal(afterFirst.ridePetHp, 0);
  assert.equal(afterFirst.ridePetBattleState, "rest");
  assert.equal(afterFirst.ridePetKnocked, true);
  assert.deepEqual(
    {attack: afterFirst.attack, defense: afterFirst.defense, speed: afterFirst.speed},
    {attack: 30, defense: 10, speed: 10},
  );

  assert.equal(service.submitBattleCommand(challenger.session.token, room.roomId, {
    round: 2, actorId: attacker.actorId, actionId: "attack", targetActorId: rider.actorId,
  }).turn, null);
  const secondRound = service.submitBattleCommand(opponent.session.token, room.roomId, {
    round: 2, actorId: rider.actorId, actionId: "defend",
  });
  assert.equal(secondRound.ok, true);
  const secondHit = secondRound.turn.events.find((event) => event.actorId === attacker.actorId && event.targetActorId === rider.actorId);
  assert.equal(secondHit.rideDamage, 0);
  assert.equal(secondHit.actorDamage, secondHit.damage);
  assert.equal(secondHit.rideHpBefore, 0);
  assert.equal(secondHit.rideHpAfter, 0);

  const leave = service.leaveBattleRoom(challenger.session.token, room.roomId);
  assert.equal(leave.ok, true);
  assert.equal(leave.room.status, "closed");
  assert.equal(leave.result.reason, "leave");
  const storedRoom = service.snapshot().battleRooms[room.roomId];
  const opponentWriteback = storedRoom.battle.profileWriteback.profiles.find((entry) => entry.accountId === opponent.account.accountId);
  assert.ok(opponentWriteback, JSON.stringify(storedRoom.battle.profileWriteback.profiles));
  assert.ok(opponentWriteback.ridePetHp, JSON.stringify(opponentWriteback));
  assert.equal(opponentWriteback.ridePetHp.petId, "ride_split_pet");
  assert.equal(opponentWriteback.ridePetHp.hp, 0);
  assert.equal(opponentWriteback.ridePetHp.state, "rest");
  assert.equal(opponentWriteback.ridePetHp.knocked, true);
  const stored = service.getProfile(opponent.session.token).profile;
  const storedRide = stored.petInstances.find((pet) => pet.instanceId === "ride_split_pet");
  assert.equal(storedRide.hp, 0);
  assert.equal(storedRide.state, "rest");
  assert.equal(stored.ridePetInstanceId, "");
});

test("lucky strikes and counters split their final server damage with mounted targets", () => {
  const criticalFixture = createRidingDuel({
    suffix: "ridecrit",
    challengerProfile: battleProfile("骑乘幸运甲", {
      level: 20, hp: 400, maxHp: 400, attack: 40, defense: 20, quick: 300, comboRateOverride: 0,
    }),
    opponentProfile: profileWithRide("骑乘幸运乙", {
      level: 20, hp: 400, maxHp: 400, attack: 30, defense: 10, quick: 10, comboRateOverride: 0,
    }, {
      instanceId: "ride_critical_target",
      hp: 100,
      maxHp: 100,
      attack: 20,
      defense: 20,
      quick: 10,
    }),
    battleRandomAuthority: deterministicBattleRandomAuthority((context) => (
      String(context.purpose || "") === "critical.v1" ? 0 : 0.9999
    )),
  });
  const criticalAttacker = criticalFixture.room.battle.actors.find((actor) => (
    actor.accountId === criticalFixture.challenger.account.accountId && actor.kind === "player"
  ));
  const criticalTarget = criticalFixture.room.battle.actors.find((actor) => (
    actor.accountId === criticalFixture.opponent.account.accountId && actor.kind === "player"
  ));
  assert.equal(criticalFixture.service.submitBattleCommand(
    criticalFixture.challenger.session.token,
    criticalFixture.room.roomId,
    {round: 1, actorId: criticalAttacker.actorId, actionId: "attack", targetActorId: criticalTarget.actorId},
  ).turn, null);
  const criticalResolved = criticalFixture.service.submitBattleCommand(
    criticalFixture.opponent.session.token,
    criticalFixture.room.roomId,
    {round: 1, actorId: criticalTarget.actorId, actionId: "defend"},
  );
  const criticalEvent = criticalResolved.turn.events.find((event) => (
    event.eventType === "basic_attack" && event.actorId === criticalAttacker.actorId
  ));
  assert.ok(criticalEvent);
  assert.equal(criticalEvent.critical, true);
  assert.equal(criticalEvent.dodged, false);
  assert.equal(criticalEvent.actorDamage + criticalEvent.rideDamage, criticalEvent.damage);
  assert.equal(criticalEvent.rideDamage > 0, true);
  assert.equal(criticalEvent.hpBefore - criticalEvent.hpAfter, criticalEvent.actorDamage);
  assert.equal(criticalEvent.damage > criticalEvent.actorDamage, true);

  let nowMs = Date.parse("2026-07-12T01:00:00.000Z");
  const counterFixture = createRidingDuel({
    suffix: "ridectr",
    challengerProfile: profileWithRide("骑乘反击甲", {
      level: 20, hp: 400, maxHp: 400, attack: 40, defense: 10, quick: 10, comboRateOverride: 0,
    }, {
      instanceId: "ride_counter_target_a",
      hp: 100,
      maxHp: 100,
      attack: 10,
      defense: 10,
      quick: 10,
    }),
    opponentProfile: profileWithRide("骑乘反击乙", {
      level: 20, hp: 400, maxHp: 400, attack: 40, defense: 10, quick: 300, comboRateOverride: 0,
    }, {
      instanceId: "ride_counter_target_b",
      hp: 100,
      maxHp: 100,
      attack: 10,
      defense: 10,
      quick: 300,
    }),
    battleRandomAuthority: deterministicBattleRandomAuthority((context) => (
      String(context.purpose || "") === "counter.v1" ? 0 : 0.9999
    )),
    serviceOptions: {now: () => nowMs},
  });
  const counterSource = counterFixture.room.battle.actors.find((actor) => (
    actor.accountId === counterFixture.challenger.account.accountId && actor.kind === "player"
  ));
  const counterActor = counterFixture.room.battle.actors.find((actor) => (
    actor.accountId === counterFixture.opponent.account.accountId && actor.kind === "player"
  ));
  assert.equal(counterFixture.service.submitBattleCommand(
    counterFixture.challenger.session.token,
    counterFixture.room.roomId,
    {round: 1, actorId: counterSource.actorId, actionId: "attack", targetActorId: counterActor.actorId},
  ).turn, null);
  const counterResolved = counterFixture.service.submitBattleCommand(
    counterFixture.opponent.session.token,
    counterFixture.room.roomId,
    {round: 1, actorId: counterActor.actorId, actionId: "defend"},
  );
  const sourceEvent = counterResolved.turn.events.find((event) => (
    event.eventType === "basic_attack" && event.actorId === counterSource.actorId
  ));
  const counterEvent = counterResolved.turn.events.find((event) => event.eventType === "counter_attack");
  assert.ok(sourceEvent);
  assert.ok(counterEvent);
  assert.equal(sourceEvent.counterTriggered, true);
  assert.equal(sourceEvent.targetActorId, counterActor.actorId);
  assert.equal(sourceEvent.actorDamage + sourceEvent.rideDamage, sourceEvent.damage);
  assert.equal(sourceEvent.hpBefore - sourceEvent.hpAfter, sourceEvent.actorDamage);
  assert.equal(counterEvent.actorId, counterActor.actorId);
  assert.equal(counterEvent.targetActorId, counterSource.actorId);
  assert.equal(counterEvent.actorDamage + counterEvent.rideDamage, counterEvent.damage);
  assert.equal(counterEvent.rideDamage > 0, true);
  assert.equal(counterEvent.hpBefore - counterEvent.hpAfter, counterEvent.actorDamage);

  assert.equal(counterFixture.service.markBattleConnection(counterFixture.opponent.session.token, false).ok, true);
  nowMs += 301 * 1000;
  const maintenance = counterFixture.service.runBattleMaintenance();
  assert.equal(maintenance.ok, true);
  const closedRoom = counterFixture.service.snapshot().battleRooms[counterFixture.room.roomId];
  assert.equal(closedRoom.status, "closed");
  assert.equal(closedRoom.battle.result.reason, "disconnect_timeout");
  const challengerAfter = counterFixture.service.getProfile(counterFixture.challenger.session.token).profile;
  const opponentAfter = counterFixture.service.getProfile(counterFixture.opponent.session.token).profile;
  assert.equal(
    challengerAfter.petInstances.find((pet) => pet.instanceId === "ride_counter_target_a").hp,
    counterEvent.rideHpAfter,
  );
  assert.equal(
    opponentAfter.petInstances.find((pet) => pet.instanceId === "ride_counter_target_b").hp,
    sourceEvent.rideHpAfter,
  );
});

test("combo attacks split once against a mounted target", () => {
  const challengerProfile = battleProfile("骑乘合击甲", {
    level: 20, hp: 400, maxHp: 400, attack: 40, defense: 10, quick: 300, comboRateOverride: 1,
  }, {
    petId: "ride_combo_pet",
    name: "骑乘合击战宠",
    level: 20,
    hp: 200,
    maxHp: 200,
    attack: 40,
    defense: 10,
    quick: 250,
    comboRateOverride: 1,
  });
  const opponentProfile = profileWithRide("骑乘合击乙", {
    level: 20, hp: 400, maxHp: 400, attack: 30, defense: 10, quick: 10, comboRateOverride: 0,
  }, {
    instanceId: "ride_combo_target",
    hp: 100,
    maxHp: 100,
    attack: 10,
    defense: 10,
    quick: 10,
  });
  const {service, challenger, opponent, room} = createRidingDuel({
    suffix: "ridecombo",
    challengerProfile,
    opponentProfile,
  });
  const player = room.battle.actors.find((actor) => actor.accountId === challenger.account.accountId && actor.kind === "player");
  const pet = room.battle.actors.find((actor) => actor.accountId === challenger.account.accountId && actor.kind === "pet");
  const target = room.battle.actors.find((actor) => actor.accountId === opponent.account.accountId && actor.kind === "player");
  assert.equal(service.submitBattleCommand(challenger.session.token, room.roomId, {
    round: 1, actorId: player.actorId, actionId: "attack", targetActorId: target.actorId,
  }).turn, null);
  assert.equal(service.submitBattleCommand(challenger.session.token, room.roomId, {
    round: 1, actorId: pet.actorId, actionId: "pet_attack", targetActorId: target.actorId,
  }).turn, null);
  const resolved = service.submitBattleCommand(opponent.session.token, room.roomId, {
    round: 1, actorId: target.actorId, actionId: "defend",
  });
  const combo = resolved.turn.events.find((event) => event.eventType === "combo_attack");
  assert.ok(combo);
  assert.deepEqual(combo.participantActorIds, [player.actorId, pet.actorId]);
  assert.equal(combo.targetActorId, target.actorId);
  assert.equal(combo.actorDamage + combo.rideDamage, combo.damage);
  assert.equal(combo.rideDamage > 0, true);
  assert.equal(combo.hpBefore - combo.hpAfter, combo.actorDamage);
  assert.equal(resolved.turn.events.some((event) => (
    ["basic_attack", "pet_skill"].includes(event.eventType) && event.targetActorId === target.actorId
  )), false);
});

test("PVE player launch threshold uses actor damage after mount sharing", () => {
  const service = createAuthService({
    store: createMemoryAuthStore(),
    battleRandomAuthority: deterministicBattleRandomAuthority(),
  });
  const player = service.register({username: "ridelaunch", password: "test1234", displayName: "骑乘击飞号"});
  assert.equal(player.ok, true);
  const profile = profileWithRide("骑乘击飞号", {
    level: 20, hp: 15, maxHp: 100, attack: 10, defense: 1, quick: 10, comboRateOverride: 0,
  }, {
    instanceId: "ride_launch_shield",
    hp: 100,
    maxHp: 100,
    attack: 1,
    defense: 1,
    quick: 1,
  });
  assert.equal(service.saveProfile(player.session.token, {expectedRevision: 0, profile}).ok, true);
  const encounter = service.startPartyEncounter(player.session.token, {
    enemyCount: 1,
    encounterZone: {
      id: "ride_launch_fixture",
      name: "骑乘击飞草丛",
      selectedWildPet: {
        formId: "wuli_normal_orange_fire10",
        name: "骑乘击飞乌力",
        level: 20,
        battleStats: {maxHp: 200, attack: 60, defense: 1, quick: 300},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const rider = encounter.room.battle.actors.find((actor) => actor.accountId === player.account.accountId && actor.kind === "player");
  const enemy = encounter.room.battle.actors.find((actor) => actor.side === "enemy");
  const resolved = service.submitBattleCommand(player.session.token, encounter.room.roomId, {
    round: 1, actorId: rider.actorId, actionId: "attack", targetActorId: enemy.actorId,
  });
  assert.equal(resolved.ok, true);
  const hit = resolved.turn.events.find((event) => event.actorId === enemy.actorId && event.targetActorId === rider.actorId);
  assert.ok(hit);
  const launchThreshold = Math.max(12, Math.round(rider.maxHp * 0.18));
  assert.equal(hit.actorDamage + hit.rideDamage, hit.damage);
  assert.equal(hit.hpAfter, 0);
  assert.equal(hit.damage - hit.hpBefore >= launchThreshold, true);
  assert.equal(hit.actorDamage - hit.hpBefore < launchThreshold, true);
  assert.equal(hit.launched, false);
  assert.notEqual(hit.animation.targetReaction, "launched");
});

test("poison immediate damage and poison ticks explicitly bypass an active mount", () => {
  const challengerProfile = battleProfile("毒伤甲", {
    level: 20, hp: 240, maxHp: 240, attack: 30, defense: 10, quick: 200, comboRateOverride: 0,
  });
  challengerProfile.backpackSlots = [{itemId: "item_poison_single_5", count: 1}];
  const opponentProfile = profileWithRide("毒伤乙", {
    level: 20, hp: 240, maxHp: 240, attack: 30, defense: 10, quick: 10, comboRateOverride: 0,
  }, {
    instanceId: "ride_poison_target",
    name: "毒伤骑宠",
    hp: 20,
    maxHp: 20,
  });
  const {service, challenger, opponent, room} = createRidingDuel({
    suffix: "poison",
    challengerProfile,
    opponentProfile,
  });
  const attacker = room.battle.actors.find((actor) => actor.accountId === challenger.account.accountId && actor.kind === "player");
  const rider = room.battle.actors.find((actor) => actor.accountId === opponent.account.accountId && actor.kind === "player");
  assert.equal(service.submitBattleCommand(challenger.session.token, room.roomId, {
    round: 1,
    actorId: attacker.actorId,
    actionId: "item_poison_single_5",
    itemId: "item_poison_single_5",
    targetActorId: rider.actorId,
  }).turn, null);
  const resolved = service.submitBattleCommand(opponent.session.token, room.roomId, {
    round: 1, actorId: rider.actorId, actionId: "defend",
  });
  assert.equal(resolved.ok, true);
  const poison = resolved.turn.events.find((event) => event.eventType === "item_poison");
  const tick = resolved.turn.events.find((event) => event.eventType === "status_tick" && event.targetActorId === rider.actorId);
  assert.equal(Boolean(poison && tick), true);
  assert.equal(poison.actorDamage, poison.damage);
  assert.equal(poison.rideDamage, 0);
  assert.equal(poison.rideHpBefore, 20);
  assert.equal(poison.rideHpAfter, 20);
  assert.equal(poison.targets[0].schemaVersion, 2);
  assert.equal(poison.targets[0].actorDamage, poison.targets[0].damage);
  assert.equal(poison.targets[0].rideDamage, 0);
  assert.equal(tick.actorDamage, tick.damage);
  assert.equal(tick.rideDamage, 0);
  assert.equal(tick.rideHpBefore, 20);
  assert.equal(tick.rideHpAfter, 20);
  const after = resolved.room.battle.actors.find((actor) => actor.actorId === rider.actorId);
  assert.equal(after.ridePetHp, 20);
  assert.equal(after.ridePetBattleState, "riding");
});

test("a mount knocked before its rider's PVE last hit receives no later kill experience", () => {
  const service = createAuthService({
    store: createMemoryAuthStore(),
    battleRandomAuthority: deterministicBattleRandomAuthority(),
  });
  const player = service.register({username: "ridepvpexp", password: "test1234", displayName: "倒骑经验号"});
  assert.equal(player.ok, true);
  const profile = profileWithRide("倒骑经验号", {
    level: 20, hp: 400, maxHp: 400, attack: 40, defense: 10, quick: 10, comboRateOverride: 0,
  }, {
    instanceId: "ride_exp_knocked",
    name: "倒骑经验宠",
    level: 20,
    hp: 1,
    maxHp: 20,
    attack: 1,
    defense: 1,
    quick: 1,
  });
  assert.equal(service.saveProfile(player.session.token, {expectedRevision: 0, profile}).ok, true);
  const encounter = service.startPartyEncounter(player.session.token, {
    enemyCount: 1,
    encounterZone: {
      id: "ride_exp_fixture",
      name: "倒骑经验草丛",
      selectedWildPet: {
        formId: "wuli_normal_orange_fire10",
        name: "倒骑经验乌力",
        level: 20,
        expReward: 200,
        battleStats: {maxHp: 1, attack: 40, defense: 1, quick: 300},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const rider = encounter.room.battle.actors.find((actor) => actor.accountId === player.account.accountId && actor.kind === "player");
  const enemy = encounter.room.battle.actors.find((actor) => actor.side === "enemy");
  const resolved = service.submitBattleCommand(player.session.token, encounter.room.roomId, {
    round: 1, actorId: rider.actorId, actionId: "attack", targetActorId: enemy.actorId,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.room.status, "closed");
  const enemyHit = resolved.turn.events.find((event) => event.actorId === enemy.actorId && event.targetActorId === rider.actorId);
  assert.equal(enemyHit.rideDamage, 1);
  assert.equal(enemyHit.ridePetKnocked, true);
  const storedRoom = service.snapshot().battleRooms[encounter.room.roomId];
  const killCredit = storedRoom.battle.expCredits.find((credit) => credit.targetActorId === enemy.actorId);
  assert.equal(Boolean(killCredit), true);
  assert.equal(killCredit.recipients.some((recipient) => recipient.type === "ride_pet"), false);
  const writeback = resolved.room.battle.profileWriteback.profiles.find((entry) => entry.accountId === player.account.accountId);
  assert.equal((writeback.exp.ridePets || []).every((entry) => Number(entry.amount || 0) === 0), true);
  const stored = service.getProfile(player.session.token).profile;
  const storedRide = stored.petInstances.find((pet) => pet.instanceId === "ride_exp_knocked");
  assert.equal(storedRide.hp, 0);
  assert.equal(storedRide.state, "rest");
  assert.equal(stored.ridePetInstanceId, "");
});

test("offline party removal preserves damaged ride facts for departed-profile writeback", () => {
  let nowMs = Date.parse("2026-07-12T00:00:00.000Z");
  let serial = 0;
  const service = createAuthService({
    store: createMemoryAuthStore(),
    now: () => nowMs,
    randomId: () => `ride_depart_${++serial}`,
    battleRandomAuthority: deterministicBattleRandomAuthority(),
  });
  const leader = service.register({username: "ridedeparta", password: "test1234", displayName: "离队队长"});
  const member = service.register({username: "ridedepartb", password: "test1234", displayName: "离队骑手"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(service.saveProfile(leader.session.token, {
    expectedRevision: 0,
    profile: battleProfile("离队队长", {
      level: 20, hp: 5000, maxHp: 5000, attack: 20, defense: 10, quick: 10, comboRateOverride: 0,
    }),
  }).ok, true);
  assert.equal(service.saveProfile(member.session.token, {
    expectedRevision: 0,
    profile: profileWithRide("离队骑手", {
      level: 20, hp: 400, maxHp: 400, attack: 20, defense: 10, quick: 10, comboRateOverride: 0,
    }, {
      instanceId: "ride_depart_pet",
      name: "离队骑宠",
      hp: 10,
      maxHp: 20,
      attack: 1,
      defense: 1,
      quick: 1,
    }),
  }).ok, true);
  placeForDuel(service, leader.account, leader.session.token, 10);
  placeForDuel(service, member.account, member.session.token, 10);
  const invite = service.inviteToParty(leader.session.token, {username: member.account.username});
  assert.equal(invite.ok, true);
  assert.equal(service.acceptPartyInvite(member.session.token, invite.invite.inviteId).ok, true);
  const encounter = service.startPartyEncounter(leader.session.token, {
    enemyCount: 1,
    encounterZone: {
      id: "ride_depart_fixture",
      name: "离队写回草丛",
      selectedWildPet: {
        formId: "wuli_normal_orange_fire10",
        name: "离队写回乌力",
        level: 20,
        battleStats: {maxHp: 5000, attack: 40, defense: 1, quick: 300},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const leaderActor = encounter.room.battle.actors.find((actor) => actor.accountId === leader.account.accountId && actor.kind === "player");
  const memberActor = encounter.room.battle.actors.find((actor) => actor.accountId === member.account.accountId && actor.kind === "player");
  let memberHit = null;
  for (let round = 1; round <= 30 && !memberHit; round += 1) {
    assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
      round, actorId: leaderActor.actorId, actionId: "defend",
    }).turn, null);
    const resolved = service.submitBattleCommand(member.session.token, encounter.room.roomId, {
      round, actorId: memberActor.actorId, actionId: "defend",
    });
    assert.equal(resolved.ok, true);
    memberHit = resolved.turn.events.find((event) => (
      event.targetActorId === memberActor.actorId && Number(event.rideDamage || 0) > 0
    )) || null;
  }
  assert.ok(memberHit, "enemy never selected the member rider within 30 deterministic rounds");
  assert.equal(memberHit.rideHpAfter, 0);
  assert.equal(memberHit.ridePetKnocked, true);

  assert.equal(service.markBattleConnection(member.session.token, false).ok, true);
  nowMs += 30 * 1000;
  const afterRemoval = service.getBattleState(leader.session.token);
  assert.equal(afterRemoval.ok, true);
  assert.deepEqual(afterRemoval.room.participantAccountIds, [leader.account.accountId]);
  assert.equal(afterRemoval.room.battle.actors.some((actor) => actor.accountId === member.account.accountId), false);
  const leave = service.leaveBattleRoom(leader.session.token, encounter.room.roomId);
  assert.equal(leave.ok, true);
  const stored = service.getProfile(member.session.token).profile;
  const storedRide = stored.petInstances.find((pet) => pet.instanceId === "ride_depart_pet");
  assert.equal(storedRide.hp, 0);
  assert.equal(storedRide.state, "rest");
  assert.equal(stored.ridePetInstanceId, "");
});
