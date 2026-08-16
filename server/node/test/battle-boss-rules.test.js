"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BattleBossRulesError,
  createBattleBossRules,
  loadBattleBossRules,
} = require("../src/auth/battle-boss-rules");

function actors() {
  return [{
    actorId: "party_pve_enemy_front_3",
    accountId: "",
    displayName: "岩脉守护兽",
    side: "enemy",
    kind: "wild_pet",
    slotId: "enemy.front.3",
    hp: 1688,
    activeSkillIds: ["pet_attack", "pet_defend", "pet_bui_charge"],
  }, {
    actorId: "party_pve_ally_front_3_pet_a",
    accountId: "account_a",
    username: "hunter_a",
    displayName: "苔团",
    side: "ally",
    kind: "pet",
    hp: 420,
  }, {
    actorId: "party_pve_ally_back_3_player_a",
    accountId: "account_a",
    username: "hunter_a",
    displayName: "猎人甲",
    side: "ally",
    kind: "player",
    hp: 520,
  }];
}

function tideActors() {
  return [{
    actorId: "party_pve_enemy_front_3",
    accountId: "",
    displayName: "潮回守护兽",
    side: "enemy",
    kind: "wild_pet",
    slotId: "enemy.front.3",
    hp: 1100,
    maxHp: 1600,
    defense: 112,
    activeInBattle: true,
    activeSkillIds: ["pet_attack", "pet_defend"],
  }, {
    actorId: "party_pve_enemy_front_1",
    accountId: "",
    displayName: "潮回乌力甲",
    side: "enemy",
    kind: "wild_pet",
    slotId: "enemy.front.1",
    hp: 990,
    maxHp: 990,
    defense: 84,
    activeInBattle: true,
  }, {
    actorId: "party_pve_enemy_front_2",
    accountId: "",
    displayName: "潮回乌力乙",
    side: "enemy",
    kind: "wild_pet",
    slotId: "enemy.front.2",
    hp: 960,
    maxHp: 960,
    defense: 78,
    activeInBattle: true,
  }];
}

function emberActors() {
  return [{
    actorId: "party_pve_enemy_front_3",
    accountId: "",
    displayName: "焰心守护兽",
    side: "enemy",
    kind: "wild_pet",
    slotId: "enemy.front.3",
    hp: 900,
    maxHp: 1580,
    attack: 204,
    defense: 106,
    activeInBattle: true,
  }, {
    actorId: "party_pve_ally_front_3_pet_a",
    accountId: "account_a",
    username: "hunter_a",
    displayName: "苔团",
    side: "ally",
    kind: "pet",
    hp: 420,
    activeInBattle: true,
  }, {
    actorId: "party_pve_ally_back_3_player_a",
    accountId: "account_a",
    username: "hunter_a",
    displayName: "猎人甲",
    side: "ally",
    kind: "player",
    hp: 520,
    activeInBattle: true,
  }, {
    actorId: "party_pve_ally_back_4_partner",
    accountId: "",
    ownerAccountId: "account_a",
    displayName: "训练伙伴",
    side: "ally",
    kind: "player",
    hp: 520,
    activeInBattle: true,
  }];
}

function room(overrides = {}) {
  return {
    roomId: "battle_room_boss_rules",
    seed: "boss-rules-seed",
    encounter: {
      groupId: "earth_vein_guardian_group",
      bossMechanicId: "guardian_targeted_charge_v1",
      ...overrides,
    },
  };
}

function tideRoom(overrides = {}) {
  return {
    roomId: "battle_room_tide_rules",
    seed: "tide-rules-seed",
    encounter: {
      groupId: "tide_echo_guardian_group",
      bossMechanicId: "guardian_tide_core_v1",
      ...overrides,
    },
  };
}

function emberRoom(overrides = {}) {
  return {
    roomId: "battle_room_ember_rules",
    seed: "ember-rules-seed",
    encounter: {
      groupId: "ember_core_guardian_group",
      bossMechanicId: "guardian_ember_pressure_v1",
      ...overrides,
    },
  };
}

test("boss rules load a strict shared catalog and ignore encounters without an explicit mechanic", () => {
  const rules = loadBattleBossRules();
  assert.deepEqual(rules.mechanicIds, [
    "guardian_targeted_charge_v1",
    "guardian_tide_core_v1",
    "guardian_ember_pressure_v1",
  ]);
  assert.deepEqual(rules.runtimeMechanicIds, [
    "guardian_targeted_charge_v1",
    "guardian_tide_core_v1",
  ]);
  assert.equal(rules.initialize({roomId: "ordinary", encounter: {groupId: "firebud_grass_01"}}, actors()), null);
  assert.equal(rules.initialize(emberRoom(), emberActors()), null);
  assert.throws(
    () => rules.initialize(room({groupId: "forged_group"}), actors()),
    BattleBossRulesError,
  );
});

test("boss rules require an explicit runtime gate and keep QA presentation off active mechanics", () => {
  const catalogRules = loadBattleBossRules();
  const mechanic = structuredClone(catalogRules.mechanicById("guardian_ember_pressure_v1"));
  delete mechanic.runtimeEnabled;
  assert.throws(
    () => createBattleBossRules({document: {schemaVersion: 2, mechanics: [mechanic]}}),
    /runtimeEnabled must be a boolean/,
  );
  mechanic.runtimeEnabled = true;
  assert.throws(
    () => createBattleBossRules({document: {schemaVersion: 2, mechanics: [mechanic]}}),
    /qaPresentation is allowed only while runtimeEnabled is false/,
  );
});

test("ember pressure freezes a player-controlled hit cap and rewards one safe active hit for one round", () => {
  const rules = loadBattleBossRules({allowPendingMechanics: true});
  const battleActors = emberActors();
  const battle = {actors: battleActors, bossMechanic: rules.initialize(emberRoom(), battleActors), bossIntent: null};
  const opened = rules.resolveRoundEnd(emberRoom(), battle, 1, 1, []);
  assert.equal(opened[0].eventType, "boss_ember_pressure_open");
  assert.equal(battle.bossMechanic.safeHitCap, 1);
  assert.deepEqual(battle.bossMechanic.eligibleActorIds, [
    "party_pve_ally_back_3_player_a",
    "party_pve_ally_front_3_pet_a",
  ]);
  assert.equal(battle.bossIntent.safeHitCap, 1);
  assert.match(battle.bossIntent.message, /命中1～1次：破甲\n超过1次：强化攻击/);

  const exposed = rules.resolveRoundEnd(emberRoom(), battle, 2, 1, [{
    eventType: "basic_attack",
    actorId: "party_pve_ally_back_3_player_a",
    targetActorId: "party_pve_enemy_front_3",
    damage: 100,
    dodged: false,
  }, {
    eventType: "basic_attack",
    actorId: "party_pve_ally_back_4_partner",
    targetActorId: "party_pve_enemy_front_3",
    damage: 100,
    dodged: false,
  }, {
    eventType: "poison_tick",
    actorId: "party_pve_ally_front_3_pet_a",
    targetActorId: "party_pve_enemy_front_3",
    damage: 20,
  }]);
  assert.equal(exposed[0].eventType, "boss_ember_pressure_exposed");
  assert.equal(exposed[0].hitCount, 1);
  assert.equal(battleActors[0].defense, 74);
  assert.equal(battleActors[0].attack, 204);
  assert.equal(battle.bossIntent, null);

  const ended = rules.resolveRoundEnd(emberRoom(), battle, 3, 1, []);
  assert.equal(ended[0].eventType, "boss_ember_pressure_end");
  assert.equal(battleActors[0].defense, 106);
  assert.equal(battleActors[0].attack, 204);
  assert.equal(battle.bossMechanic.completed, true);
});

test("ember pressure counts each eligible combo participant and overheat restores authoritative attack", () => {
  const rules = loadBattleBossRules({allowPendingMechanics: true});
  const battleActors = emberActors();
  const battle = {actors: battleActors, bossMechanic: rules.initialize(emberRoom(), battleActors), bossIntent: null};
  rules.resolveRoundEnd(emberRoom(), battle, 1, 1, []);
  const overheated = rules.resolveRoundEnd(emberRoom(), battle, 2, 1, [{
    eventType: "combo_attack",
    actorId: "party_pve_ally_back_3_player_a",
    participantActorIds: [
      "party_pve_ally_back_3_player_a",
      "party_pve_ally_front_3_pet_a",
      "party_pve_ally_back_4_partner",
    ],
    targetActorId: "party_pve_enemy_front_3",
    damage: 200,
  }]);
  assert.equal(overheated[0].eventType, "boss_ember_pressure_overheated");
  assert.equal(overheated[0].hitCount, 2);
  assert.equal(battleActors[0].attack, 266);
  assert.equal(battleActors[0].defense, 106);

  battleActors[0].attack = 999;
  const normalized = rules.normalizeState(emberRoom(), battleActors, battle.bossMechanic);
  assert.equal(normalized.phase, "overheated");
  assert.equal(battleActors[0].attack, 266);
  const ended = rules.resolveRoundEnd(emberRoom(), {...battle, bossMechanic: normalized}, 3, 1, []);
  assert.equal(ended[0].eventType, "boss_ember_pressure_end");
  assert.equal(battleActors[0].attack, 204);
});

test("ember pressure counts an eligible active multi-target hit once and excludes reactive or ongoing damage", () => {
  const rules = loadBattleBossRules({allowPendingMechanics: true});
  const battleActors = emberActors();
  const battle = {actors: battleActors, bossMechanic: rules.initialize(emberRoom(), battleActors), bossIntent: null};
  rules.resolveRoundEnd(emberRoom(), battle, 1, 1, []);
  const exposed = rules.resolveRoundEnd(emberRoom(), battle, 2, 1, [{
    eventType: "multi_attack",
    actorId: "party_pve_ally_back_3_player_a",
    targetActorId: "party_pve_enemy_front_1",
    damage: 180,
    targets: [{
      targetActorId: "party_pve_enemy_front_1",
      damage: 100,
      dodged: false,
    }, {
      targetActorId: "party_pve_enemy_front_3",
      damage: 80,
      dodged: false,
    }],
  }, {
    eventType: "counter_attack",
    actorId: "party_pve_ally_front_3_pet_a",
    targetActorId: "party_pve_enemy_front_3",
    damage: 60,
    dodged: false,
  }, {
    eventType: "poison_tick",
    actorId: "party_pve_ally_front_3_pet_a",
    targetActorId: "party_pve_enemy_front_3",
    damage: 20,
  }]);
  assert.equal(exposed[0].eventType, "boss_ember_pressure_exposed");
  assert.equal(exposed[0].hitCount, 1);
  assert.equal(battleActors[0].defense, 74);
});

test("ember pressure zero-hit outcome is neutral and reconnect normalization rejects a forged cap", () => {
  const rules = loadBattleBossRules({allowPendingMechanics: true});
  const battleActors = emberActors();
  const battle = {actors: battleActors, bossMechanic: rules.initialize(emberRoom(), battleActors), bossIntent: null};
  rules.resolveRoundEnd(emberRoom(), battle, 1, 1, []);
  const forgedIntent = {...battle.bossIntent, safeHitCap: 99, bossName: "伪守护兽", message: "伪造提示"};
  const normalizedState = rules.normalizeState(emberRoom(), battleActors, {
    ...battle.bossMechanic,
    safeHitCap: 99,
    eligibleActorIds: [...battle.bossMechanic.eligibleActorIds, "party_pve_ally_back_4_partner"],
  });
  assert.equal(normalizedState.safeHitCap, 1);
  assert.equal(normalizedState.eligibleActorIds.includes("party_pve_ally_back_4_partner"), false);
  const normalizedIntent = rules.normalizeIntent({...emberRoom(), battle: {round: 2}}, battleActors, normalizedState, forgedIntent);
  assert.equal(normalizedIntent.safeHitCap, 1);
  assert.equal(normalizedIntent.bossName, "焰心守护兽");
  assert.match(normalizedIntent.message, /命中1～1次：破甲\n超过1次：强化攻击/);

  battle.bossMechanic = normalizedState;
  const quiet = rules.resolveRoundEnd(emberRoom(), battle, 2, 1, [{
    eventType: "basic_attack",
    actorId: "party_pve_ally_back_3_player_a",
    targetActorId: "party_pve_enemy_front_3",
    damage: 0,
    dodged: true,
  }]);
  assert.equal(quiet[0].eventType, "boss_ember_pressure_quiet");
  assert.equal(battleActors[0].attack, 204);
  assert.equal(battleActors[0].defense, 106);
  assert.equal(battle.bossMechanic.completed, true);
});

test("tide core opens below 60 percent and heals the boss when its marked minion survives", () => {
  const rules = loadBattleBossRules();
  const battleActors = tideActors();
  const battle = {actors: battleActors, bossMechanic: rules.initialize(tideRoom(), battleActors), bossIntent: null};
  assert.deepEqual(rules.resolveRoundEnd(tideRoom(), battle, 1, 1), []);
  battleActors[0].hp = 900;
  const opened = rules.resolveRoundEnd(tideRoom(), battle, 2, 1);
  assert.equal(opened[0].eventType, "boss_tide_core_open");
  assert.equal(battle.bossMechanic.phase, "open");
  assert.equal(battle.bossIntent.resolveRound, 3);
  assert.equal(battle.bossIntent.markerStyle, "tide_core");
  const hpBefore = battleActors[0].hp;
  const healed = rules.resolveRoundEnd(tideRoom(), battle, 3, 1);
  assert.equal(healed[0].eventType, "boss_tide_core_heal");
  assert.equal(healed[0].healed, 288);
  assert.equal(battleActors[0].hp, hpBefore + 288);
  assert.equal(battle.bossMechanic.completed, true);
  assert.equal(battle.bossIntent, null);
});

test("breaking tide core creates exactly one lower-defense ebb round and then restores authority", () => {
  const rules = loadBattleBossRules();
  const battleActors = tideActors();
  const battle = {actors: battleActors, bossMechanic: rules.initialize(tideRoom(), battleActors), bossIntent: null};
  battleActors[0].hp = 900;
  rules.resolveRoundEnd(tideRoom(), battle, 1, 1);
  const core = battleActors.find((actor) => actor.actorId === battle.bossMechanic.coreActorId);
  core.hp = 0;
  const broken = rules.resolveRoundEnd(tideRoom(), battle, 2, 1);
  assert.equal(broken[0].eventType, "boss_tide_core_broken");
  assert.equal(battleActors[0].defense, 72);
  assert.equal(battle.bossMechanic.ebbRestoreRound, 3);
  const ended = rules.resolveRoundEnd(tideRoom(), battle, 3, 1);
  assert.equal(ended[0].eventType, "boss_tide_ebb_end");
  assert.equal(battleActors[0].defense, 112);
  assert.equal(battle.bossMechanic.completed, true);
});

test("tide core reconnect normalization rebuilds trusted names and rejects forged targets", () => {
  const rules = loadBattleBossRules();
  const battleActors = tideActors();
  const state = rules.initialize(tideRoom(), battleActors);
  const battle = {actors: battleActors, bossMechanic: state, bossIntent: null};
  battleActors[0].hp = 900;
  rules.resolveRoundEnd(tideRoom(), battle, 1, 1);
  const forged = {...battle.bossIntent, bossName: "伪首领", targetName: "伪潮核"};
  const tamperedState = {...battle.bossMechanic, resolveRound: 999, ebbRestoreRound: 999};
  const normalizedState = rules.normalizeState(tideRoom(), battleActors, tamperedState);
  assert.equal(normalizedState.resolveRound, normalizedState.openedRound + 1);
  assert.equal(normalizedState.ebbRestoreRound, 0);
  const normalizedIntent = rules.normalizeIntent({...tideRoom(), battle: {round: 2}}, battleActors, normalizedState, forged);
  assert.equal(normalizedIntent.bossName, "潮回守护兽");
  assert.match(normalizedIntent.targetName, /潮回乌力/);
  forged.targetActorId = "party_pve_enemy_forged";
  assert.equal(rules.normalizeIntent({...tideRoom(), battle: {round: 2}}, battleActors, normalizedState, forged), null);

  const bossAsCore = rules.normalizeState(tideRoom(), battleActors, {
    ...battle.bossMechanic,
    coreActorId: battleActors[0].actorId,
  });
  assert.equal(bossAsCore.phase, "waiting");
  assert.equal(bossAsCore.coreActorId, "");

  const playerOwnedActors = structuredClone(battleActors);
  const ownedCore = playerOwnedActors.find((actor) => actor.actorId === battle.bossMechanic.coreActorId);
  ownedCore.accountId = "forged_account";
  const playerOwnedState = rules.normalizeState(tideRoom(), playerOwnedActors, battle.bossMechanic);
  assert.equal(playerOwnedState.phase, "waiting");

  const deadCoreActors = structuredClone(battleActors);
  deadCoreActors.find((actor) => actor.actorId === battle.bossMechanic.coreActorId).hp = 0;
  assert.equal(
    rules.normalizeIntent({...tideRoom(), battle: {round: 2}}, deadCoreActors, normalizedState, battle.bossIntent),
    null,
  );
});

test("tide ebb normalization re-applies the server defense modifier and later restores its base", () => {
  const rules = loadBattleBossRules();
  const battleActors = tideActors();
  battleActors[0].hp = 900;
  const battle = {actors: battleActors, bossMechanic: rules.initialize(tideRoom(), battleActors), bossIntent: null};
  rules.resolveRoundEnd(tideRoom(), battle, 1, 1);
  battleActors.find((actor) => actor.actorId === battle.bossMechanic.coreActorId).hp = 0;
  rules.resolveRoundEnd(tideRoom(), battle, 2, 1);
  battleActors[0].defense = 999;
  const normalized = rules.normalizeState(tideRoom(), battleActors, battle.bossMechanic);
  assert.equal(normalized.phase, "ebb");
  assert.equal(battleActors[0].defense, 72);
  normalized.completed = true;
  normalized.phase = "completed";
  battleActors[0].defense = 1;
  rules.normalizeState(tideRoom(), battleActors, normalized);
  assert.equal(battleActors[0].defense, 112);
});

test("targeted charge selects a living pet, persists a public-safe intent and strikes exactly next round", () => {
  const rules = loadBattleBossRules();
  const battleActors = actors();
  const battle = {actors: battleActors, bossMechanic: rules.initialize(room(), battleActors), bossIntent: null};
  const boss = battleActors[0];
  const telegraph = rules.commandForRound(room(), battle, boss, 1);
  assert.equal(telegraph.actionKind, "boss_charge_telegraph");
  assert.equal(telegraph.targetActorId, battleActors[1].actorId);
  assert.equal(telegraph.resolvesLast, true);
  const event = rules.telegraphEvent(room(), battle, telegraph, boss, battleActors[1], 1, 1);
  assert.equal(event.eventType, "boss_charge_telegraph");
  assert.match(event.message, /防御、换宠.*无法行动.*打断/);
  assert.equal(battle.bossIntent.targetActorId, battleActors[1].actorId);
  assert.equal(battle.bossIntent.resolveRound, 2);
  const strike = rules.commandForRound(room(), battle, boss, 2);
  assert.equal(strike.actionId, "pet_bui_charge");
  assert.equal(strike.skillName, "岩晶冲撞");
  assert.equal(strike.disableRetarget, true);
  assert.equal(strike.bossChargeStrike, true);
  assert.equal(rules.commandForRound(room(), battle, boss, 3), null);
  rules.finishMechanic(battle);
  assert.equal(battle.bossMechanic.completed, true);
  assert.equal(battle.bossIntent, null);
});

test("telegraph retargets only when its originally selected target left before the last-resolving announcement", () => {
  const rules = loadBattleBossRules();
  const battleActors = actors();
  const battle = {actors: battleActors, bossMechanic: rules.initialize(room(), battleActors), bossIntent: null};
  const boss = battleActors[0];
  const telegraph = rules.commandForRound(room(), battle, boss, 1);
  battleActors[1].hp = 0;
  const event = rules.telegraphEvent(room(), battle, telegraph, boss, battleActors[1], 1, 1);
  assert.equal(event.targetActorId, battleActors[2].actorId);
  assert.equal(battle.bossIntent.targetActorId, battleActors[2].actorId);
});

test("an unavailable boss clears its intent instead of leaving a stale client marker", () => {
  const rules = loadBattleBossRules();
  const battleActors = actors();
  const battle = {actors: battleActors, bossMechanic: rules.initialize(room(), battleActors), bossIntent: {targetActorId: battleActors[1].actorId}};
  battleActors[0].hp = 0;
  assert.equal(rules.finishIfBossUnavailable(battle), true);
  assert.equal(battle.bossMechanic.completed, true);
  assert.equal(battle.bossIntent, null);
});

test("state normalization re-derives authority from the encounter and drops stale mechanics from ordinary battles", () => {
  const rules = loadBattleBossRules();
  const battleActors = actors();
  const forgedState = {
    mechanicId: "guardian_targeted_charge_v1",
    bossActorId: "forged_boss",
    completed: true,
  };
  const normalized = rules.normalizeState(room(), battleActors, forgedState);
  assert.equal(normalized.bossActorId, battleActors[0].actorId);
  assert.equal(normalized.completed, false);
  assert.equal(rules.normalizeState({roomId: "ordinary", encounter: {groupId: "ordinary"}}, battleActors, forgedState), null);

  battleActors[0].hp = 0;
  const completedState = rules.normalizeState(room(), battleActors, {
    mechanicId: "guardian_targeted_charge_v1",
    bossActorId: battleActors[0].actorId,
    completed: true,
  });
  assert.equal(completedState.completed, true);
});

test("intent normalization re-derives names and ownership while rejecting dead bosses and departed targets", () => {
  const rules = loadBattleBossRules();
  const battleActors = actors();
  const state = rules.initialize(room(), battleActors);
  const strikeRoom = {...room(), battle: {round: 2}};
  const forgedIntent = {
    mechanicId: "guardian_targeted_charge_v1",
    bossActorId: battleActors[0].actorId,
    bossName: "伪造首领",
    targetActorId: battleActors[1].actorId,
    targetAccountId: "forged_account",
    targetUsername: "forged_user",
    targetName: "伪造目标",
    announcedRound: 1,
    resolveRound: 2,
    actionId: "pet_bui_charge",
  };
  const normalized = rules.normalizeIntent(strikeRoom, battleActors, state, forgedIntent);
  assert.equal(normalized.bossName, "岩脉守护兽");
  assert.equal(normalized.targetName, "苔团");
  assert.equal(normalized.targetAccountId, "account_a");
  assert.equal(normalized.targetUsername, "hunter_a");
  assert.match(normalized.message, /岩脉守护兽锁定苔团/);

  battleActors[0].hp = 0;
  assert.equal(rules.normalizeIntent(strikeRoom, battleActors, state, forgedIntent), null);
  battleActors[0].hp = 1688;
  battleActors[1].activeInBattle = false;
  assert.equal(rules.normalizeIntent(strikeRoom, battleActors, state, forgedIntent), null);
});

test("boss rules reject invalid timing, target kinds and missing boss skills", () => {
  const document = JSON.parse(JSON.stringify({
    schemaVersion: 2,
    mechanics: [{
      id: "bad",
      kind: "targeted_charge",
      runtimeEnabled: true,
      label: "坏规则",
      encounterGroupId: "bad_group",
      bossActorSlot: "enemy.front.3",
      telegraphRound: 1,
      strikeRound: 3,
      strikeActionId: "missing_skill",
      targetKindPriority: ["debug_actor"],
      telegraphText: "{boss}{target}",
      commandText: "{boss}{target}",
      evadedText: "落空",
      interruptedText: "打断",
    }],
  }));
  assert.throws(() => createBattleBossRules({document}), /strikeRound.*targetKindPriority/);
  const rules = loadBattleBossRules();
  const missingSkillActors = actors();
  missingSkillActors[0].activeSkillIds = ["pet_attack"];
  assert.throws(() => rules.initialize(room(), missingSkillActors), /lacks pet_bui_charge/);
});
