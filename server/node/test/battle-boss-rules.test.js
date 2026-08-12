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

test("boss rules load a strict shared catalog and ignore encounters without an explicit mechanic", () => {
  const rules = loadBattleBossRules();
  assert.deepEqual(rules.mechanicIds, ["guardian_targeted_charge_v1"]);
  assert.equal(rules.initialize({roomId: "ordinary", encounter: {groupId: "firebud_grass_01"}}, actors()), null);
  assert.throws(
    () => rules.initialize(room({groupId: "forged_group"}), actors()),
    BattleBossRulesError,
  );
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
    schemaVersion: 1,
    mechanics: [{
      id: "bad",
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
