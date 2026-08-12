"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
  battleProfileWithPets,
} = require("../test-support/auth-service-test-context");

function bossEncounterAuthority({enabled = true, bossHp = 5000} = {}) {
  const wildPets = [{
    formId: "wuli_normal_tough_earth10",
    name: "岩脉护卫",
    level: 80,
    catchable: false,
    battleStats: {maxHp: 900, attack: 40, defense: 60, agility: 70},
  }, {
    formId: "wuli_normal_tough_earth10",
    name: "岩脉护卫",
    level: 80,
    catchable: false,
    battleStats: {maxHp: 900, attack: 40, defense: 60, agility: 72},
  }, {
    formId: "bui_normal_thick_earth10",
    battleAppearanceFormId: "wuli_evolved_crystal_earth8_water2",
    battleDisplayName: "岩脉守护兽",
    name: "岩脉守护兽",
    level: 112,
    catchable: false,
    battleStats: {maxHp: bossHp, attack: 192, defense: 138, agility: 92},
    activeSkillIds: ["pet_attack", "pet_defend", "pet_bui_charge", "pet_stone_gaze"],
    petSkillSlots: ["pet_attack", "pet_defend", "pet_bui_charge", "", "", "pet_stone_gaze", ""],
  }];
  return Object.freeze({
    resolve() {
      return {
        ok: true,
        encounter: {
          zoneId: enabled ? "earth_vein_guardian_floor" : "ordinary_test_zone",
          groupId: enabled ? "earth_vein_guardian_group" : "ordinary_test_group",
          rewardTableId: enabled ? "earth_vein_guardian_group" : "ordinary_test_group",
          bossMechanicId: enabled ? "guardian_targeted_charge_v1" : "",
          interactionId: enabled ? "earth_vein_guardian_npc" : "",
          sourceInteractionId: enabled ? "earth_vein_guardian_npc" : "",
          sourceInteractionName: enabled ? "岩脉守护兽" : "",
          name: enabled ? "岩脉守护层" : "普通测试区",
          formationTemplate: "10v10",
          enemyCount: wildPets.length,
          selectedWildPet: wildPets[0],
          selectedWildPets: wildPets,
          authority: "boss_mechanic_test_authority",
          schemaVersion: 1,
        },
      };
    },
  });
}

function pet(petId, state, extra = {}) {
  return {
    petId,
    name: petId === "active_pet" ? "苔团" : "备用乌力",
    formId: petId === "active_pet" ? "bui_normal_red_fire10" : "wuli_normal_tough_earth10",
    state,
    level: 80,
    hp: 5000,
    maxHp: 5000,
    attack: 80,
    defense: 300,
    quick: 400,
    ...extra,
  };
}

function createFixture(suffix, pets = [pet("active_pet", "battle")], options = {}) {
  const service = createAuthService({
    store: createMemoryAuthStore(),
    petEncounterAuthority: bossEncounterAuthority(options),
  });
  const player = service.register({
    username: `boss${suffix}`,
    password: "test1234",
    displayName: `策略猎人${suffix}`,
  });
  assert.equal(player.ok, true);
  const profile = battleProfileWithPets(`策略猎人${suffix}`, {
    level: 80,
    hp: 5000,
    maxHp: 5000,
    attack: 80,
    defense: 300,
    quick: 500,
    comboRateOverride: 0,
  }, pets);
  if (options.controlSkill) {
    profile.petInstances[0].activeSkillIds = ["pet_attack", "pet_defend", "pet_sleep_powder"];
    profile.petInstances[0].petSkillSlots = ["pet_attack", "pet_defend", "", "pet_sleep_powder", "", "", ""];
  }
  assert.equal(service.saveProfile(player.session.token, {expectedRevision: 0, profile}).ok, true);
  const encounter = service.startPartyEncounter(player.session.token, {
    encounterZone: {id: "fixture_zone", encounterGroupId: "fixture_group"},
  });
  assert.equal(encounter.ok, true, JSON.stringify(encounter));
  return {service, player, room: encounter.room};
}

function actorIds(room, accountId) {
  const actors = room.battle.actors;
  return {
    player: actors.find((actor) => actor.accountId === accountId && actor.kind === "player").actorId,
    pet: actors.find((actor) => actor.accountId === accountId && actor.kind === "pet").actorId,
    boss: actors.find((actor) => actor.actorId === "party_pve_enemy_front_3").actorId,
    firstEnemy: actors.find((actor) => actor.side === "enemy").actorId,
  };
}

function submitRound(fixture, round, commands) {
  let result = null;
  for (const command of commands) {
    result = fixture.service.submitBattleCommand(
      fixture.player.session.token,
      fixture.room.roomId,
      {round, ...command},
    );
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  assert.ok(result.turn, "last submitted command must resolve the round");
  fixture.room = result.room;
  return result;
}

function openTelegraph(fixture) {
  const ids = actorIds(fixture.room, fixture.player.account.accountId);
  const resolved = submitRound(fixture, 1, [{
    actorId: ids.player,
    actionId: "defend",
  }, {
    actorId: ids.pet,
    actionId: "pet_defend",
  }]);
  const telegraph = resolved.turn.events.find((event) => event.eventType === "boss_charge_telegraph");
  assert.ok(telegraph);
  assert.equal(telegraph.targetActorId, ids.pet);
  assert.equal(Object.hasOwn(telegraph, "targetAccountId"), false);
  assert.equal(Object.hasOwn(telegraph, "targetUsername"), false);
  assert.equal(resolved.turn.events.at(-1).eventType, "boss_charge_telegraph");
  assert.equal(resolved.room.battle.bossIntent.targetActorId, ids.pet);
  assert.match(resolved.room.battle.bossIntent.message, /锁定.*防御、换宠.*无法行动.*打断/);
  assert.equal(Object.hasOwn(resolved.room.battle.bossIntent, "targetAccountId"), false);
  assert.equal(Object.hasOwn(resolved.room.battle.bossIntent, "targetUsername"), false);
  return ids;
}

test("ordinary party PVE stays unchanged when the authoritative encounter has no boss mechanic", () => {
  const fixture = createFixture("ordinary", [pet("active_pet", "battle")], {enabled: false});
  assert.equal(fixture.room.battle.bossIntent, null);
  const ids = actorIds(fixture.room, fixture.player.account.accountId);
  const resolved = submitRound(fixture, 1, [{actorId: ids.player, actionId: "defend"}, {actorId: ids.pet, actionId: "pet_defend"}]);
  assert.equal(resolved.turn.events.some((event) => event.eventType === "boss_charge_telegraph"), false);
  assert.equal(resolved.room.battle.bossIntent, null);
});

test("guardian keeps its pure-earth combat identity while using the approved crystal battle appearance", () => {
  const fixture = createFixture("identity");
  const boss = fixture.room.battle.actors.find((actor) => actor.actorId === "party_pve_enemy_front_3");
  assert.ok(boss);
  assert.equal(boss.displayName, "岩脉守护兽");
  assert.equal(boss.formId, "bui_normal_thick_earth10");
  assert.equal(boss.battleAppearanceFormId, "wuli_evolved_crystal_earth8_water2");
  assert.deepEqual(boss.elements, {fire: 0, water: 0, earth: 10, wind: 0});
  assert.equal(boss.catchable, false);
});

test("guardian telegraph survives public room projection and defending the marked pet uses the existing guard formula", () => {
  const fixture = createFixture("guard");
  const ids = openTelegraph(fixture);
  const resolved = submitRound(fixture, 2, [{
    actorId: ids.player,
    actionId: "attack",
    targetActorId: ids.firstEnemy,
  }, {
    actorId: ids.pet,
    actionId: "pet_defend",
  }]);
  const strike = resolved.turn.events.find((event) => event.bossChargeStrike === true);
  assert.ok(strike);
  assert.equal(strike.eventType, "pet_skill");
  assert.equal(strike.actionId, "pet_bui_charge");
  assert.equal(strike.skillName, "岩晶冲撞");
  assert.match(strike.message, /岩晶冲撞/);
  assert.doesNotMatch(strike.message, /布伊冲撞/);
  assert.equal(strike.targetActorId, ids.pet);
  assert.equal(strike.blocked, true);
  assert.equal(strike.guardMultiplier, 0.45);
  assert.equal(resolved.room.battle.bossIntent, null);
});

test("switching the marked pet before the last-resolving charge makes it miss without retargeting", () => {
  const fixture = createFixture("switch", [
    pet("active_pet", "battle"),
    pet("standby_pet", "standby"),
  ]);
  const ids = openTelegraph(fixture);
  const resolved = submitRound(fixture, 2, [{
    actorId: ids.pet,
    actionId: "pet_defend",
  }, {
    actorId: ids.player,
    actionId: "switch_pet",
    petId: "standby_pet",
  }]);
  const evaded = resolved.turn.events.find((event) => event.bossChargeEvaded === true);
  assert.ok(evaded, JSON.stringify(resolved.turn.events, null, 2));
  assert.equal(evaded.eventType, "target_missing");
  assert.match(evaded.message, /备用乌力|苔团.*离开战场|落空/);
  assert.equal(resolved.turn.events.some((event) => event.bossChargeStrike === true && event.eventType === "pet_skill"), false);
  assert.equal(resolved.room.battle.bossIntent, null);
});

test("a successful blocking status interrupts the marked charge after the control event", () => {
  const fixture = createFixture("control", [pet("active_pet", "battle")], {controlSkill: true});
  const ids = openTelegraph(fixture);
  const resolved = submitRound(fixture, 2, [{
    actorId: ids.player,
    actionId: "defend",
  }, {
    actorId: ids.pet,
    actionId: "pet_sleep_powder",
    targetActorId: ids.boss,
  }]);
  const controlIndex = resolved.turn.events.findIndex((event) => event.eventType === "skill_status" && event.targetActorId === ids.boss);
  const interruptedIndex = resolved.turn.events.findIndex((event) => event.bossChargeInterrupted === true);
  assert.equal(controlIndex >= 0, true);
  assert.equal(interruptedIndex > controlIndex, true);
  const interrupted = resolved.turn.events[interruptedIndex];
  assert.equal(interrupted.eventType, "status_skip");
  assert.match(interrupted.message, /冲撞被打断/);
  assert.equal(resolved.room.battle.bossIntent, null);
});

test("blocking the boss before its announcement suppresses the one-shot mechanic without leaving latent state", () => {
  const fixture = createFixture("preempt", [pet("active_pet", "battle")], {controlSkill: true});
  const ids = actorIds(fixture.room, fixture.player.account.accountId);
  const resolved = submitRound(fixture, 1, [{
    actorId: ids.player,
    actionId: "defend",
  }, {
    actorId: ids.pet,
    actionId: "pet_sleep_powder",
    targetActorId: ids.boss,
  }]);
  const suppressed = resolved.turn.events.find((event) => event.bossMechanicSuppressed === true);
  assert.ok(suppressed);
  assert.equal(suppressed.eventType, "status_skip");
  assert.equal(resolved.turn.events.some((event) => event.eventType === "boss_charge_telegraph"), false);
  assert.equal(resolved.room.battle.bossIntent, null);
  const nextRound = submitRound(fixture, 2, [{
    actorId: ids.player,
    actionId: "defend",
  }, {
    actorId: ids.pet,
    actionId: "pet_defend",
  }]);
  assert.equal(nextRound.turn.events.some((event) => event.bossChargeStrike === true), false);
  assert.equal(nextRound.room.battle.bossIntent, null);
});

test("defeating the boss before its last-resolving strike clears the marked intent while guards remain", () => {
  const fixture = createFixture("bossdown", [pet("active_pet", "battle")], {bossHp: 1});
  const ids = openTelegraph(fixture);
  const resolved = submitRound(fixture, 2, [{
    actorId: ids.player,
    actionId: "attack",
    targetActorId: ids.boss,
  }, {
    actorId: ids.pet,
    actionId: "pet_defend",
  }]);
  const bossDefeat = resolved.turn.events.find((event) => event.targetActorId === ids.boss && event.defeated === true);
  assert.ok(bossDefeat);
  assert.equal(resolved.turn.events.some((event) => event.bossChargeStrike === true), false);
  assert.equal(resolved.room.status, "ready");
  assert.equal(resolved.room.battle.bossIntent, null);
});
