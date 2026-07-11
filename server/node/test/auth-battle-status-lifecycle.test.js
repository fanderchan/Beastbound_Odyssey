"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
  battleProfile,
} = require("../test-support/auth-service-test-context");

function statusFriendlyAuthority(rollForContext = null) {
  const rooms = new Set();
  const contexts = [];
  return {
    contexts,
    openRoom(roomId) {
      const id = String(roomId || "");
      if (rooms.has(id)) return false;
      rooms.add(id);
      return true;
    },
    closeRoom(roomId) {
      return rooms.delete(String(roomId || ""));
    },
    hasRoom(roomId) {
      return rooms.has(String(roomId || ""));
    },
    roll(roomId, context = {}) {
      assert.equal(rooms.has(String(roomId || "")), true);
      contexts.push({roomId, ...context});
      if (typeof rollForContext === "function") {
        const override = rollForContext(context);
        if (override !== null && override !== undefined) {
          return Number(override);
        }
      }
      return String(context.purpose || "") === "status.v1" ? 0 : 0.9999;
    },
    index(roomId, context, size) {
      const count = Math.max(1, Math.trunc(Number(size || 0)));
      return Math.min(count - 1, Math.floor(this.roll(roomId, context) * count));
    },
  };
}

function placeDuelPlayers(service, challenger, opponent) {
  assert.equal(service.updatePlayerPosition(challenger.session.token, {
    mapId: "firebud_training_yard", cellX: 10, cellY: 10, facing: "east", moving: false,
  }).ok, true);
  assert.equal(service.updatePlayerPosition(opponent.session.token, {
    mapId: "firebud_training_yard", cellX: 11, cellY: 10, facing: "west", moving: false,
  }).ok, true);
}

function submitFourActorRound(fixture, round, commands) {
  const {service, challenger, opponent, roomId, actors} = fixture;
  return submitActorRound(service, roomId, round, [
    [challenger.session.token, actors.challengerPlayer, commands.challengerPlayer],
    [challenger.session.token, actors.challengerPet, commands.challengerPet],
    [opponent.session.token, actors.opponentPlayer, commands.opponentPlayer],
    [opponent.session.token, actors.opponentPet, commands.opponentPet],
  ]);
}

function submitActorRound(service, roomId, round, values) {
  let result = null;
  for (const [token, actor, command] of values) {
    result = service.submitBattleCommand(token, roomId, {round, actorId: actor.actorId, ...command});
    assert.equal(result.ok, true);
  }
  assert.ok(result && result.turn);
  return result;
}

test("sleep wakes on direct positive damage while stone keeps its exact action-opportunity decrement", () => {
  const authority = statusFriendlyAuthority();
  const service = createAuthService({store: createMemoryAuthStore(), battleRandomAuthority: authority});
  const challenger = service.register({username: "statuslifea", password: "test1234", displayName: "状态生命甲"});
  const opponent = service.register({username: "statuslifeb", password: "test1234", displayName: "状态生命乙"});
  const challengerProfile = battleProfile("状态生命甲", {
    level: 20, hp: 300, maxHp: 300, attack: 30, defense: 8, quick: 200, comboRateOverride: 0,
  }, {
    petId: "status_source_pet", formId: "bui_normal_red_fire10", name: "慢速状态宠",
    level: 20, hp: 220, maxHp: 220, attack: 15, defense: 8, quick: 20, comboRateOverride: 0,
  });
  challengerProfile.petInstances[0].activeSkillIds = ["pet_attack", "pet_defend", "pet_bui_charge", "pet_sleep_powder", "pet_stone_gaze"];
  challengerProfile.petInstances[0].petSkillSlots = ["pet_attack", "pet_defend", "pet_bui_charge", "pet_sleep_powder", "pet_stone_gaze", "", ""];
  challengerProfile.backpackSlots = [{itemId: "item_poison_single_5", count: 1}];
  const opponentProfile = battleProfile("状态生命乙", {
    level: 20, hp: 300, maxHp: 300, attack: 20, defense: 8, quick: 130, comboRateOverride: 0,
  }, {
    petId: "status_target_pet", formId: "bui_normal_yellow_wind10", name: "快速受术宠",
    level: 20, hp: 300, maxHp: 300, attack: 15, defense: 8, quick: 120, comboRateOverride: 0,
  });
  assert.equal(service.saveProfile(challenger.session.token, {expectedRevision: 0, profile: challengerProfile}).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {expectedRevision: 0, profile: opponentProfile}).ok, true);
  placeDuelPlayers(service, challenger, opponent);
  const invite = service.inviteToBattle(challenger.session.token, {username: opponent.account.username});
  const accepted = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  const actors = {
    challengerPlayer: accepted.room.battle.actors.find((actor) => actor.accountId === challenger.account.accountId && actor.kind === "player"),
    challengerPet: accepted.room.battle.actors.find((actor) => actor.accountId === challenger.account.accountId && actor.kind === "pet"),
    opponentPlayer: accepted.room.battle.actors.find((actor) => actor.accountId === opponent.account.accountId && actor.kind === "player"),
    opponentPet: accepted.room.battle.actors.find((actor) => actor.accountId === opponent.account.accountId && actor.kind === "pet"),
  };
  const fixture = {service, challenger, opponent, roomId: accepted.room.roomId, actors};

  const sleepRound = submitFourActorRound(fixture, 1, {
    challengerPlayer: {actionId: "defend"},
    challengerPet: {actionId: "pet_sleep_powder", targetActorId: actors.opponentPet.actorId},
    opponentPlayer: {actionId: "defend"},
    opponentPet: {actionId: "pet_defend"},
  });
  const sleepApply = sleepRound.turn.events.find((event) => event.eventType === "skill_status");
  assert.equal(sleepApply.sourceActorId, actors.challengerPet.actorId);
  assert.equal(sleepApply.statusChanges.find((change) => change.change === "apply").sourceId, actors.challengerPet.actorId);
  assert.equal(sleepRound.turn.events.some((event) => event.eventType === "status_skip" && event.actorId === actors.opponentPet.actorId), false);
  assert.equal(sleepRound.room.battle.actors.find((actor) => actor.actorId === actors.opponentPet.actorId).statuses.sleep.turns, 2);

  const wakeRound = submitFourActorRound(fixture, 2, {
    challengerPlayer: {actionId: "attack", targetActorId: actors.opponentPet.actorId},
    challengerPet: {actionId: "pet_defend"},
    opponentPlayer: {actionId: "defend"},
    opponentPet: {actionId: "pet_defend"},
  });
  const wakeAttack = wakeRound.turn.events.find((event) => event.eventType === "basic_attack" && event.targetActorId === actors.opponentPet.actorId);
  assert.equal(wakeAttack.damage > 0, true);
  assert.deepEqual(wakeAttack.statusChanges.map((change) => change.change), ["remove_on_damage"]);
  assert.equal(wakeAttack.statusChanges[0].statusId, "sleep");
  assert.equal(wakeRound.turn.events.some((event) => event.eventType === "status_skip" && event.actorId === actors.opponentPet.actorId), false);
  assert.equal(wakeRound.turn.events.some((event) => event.eventType === "defend" && event.actorId === actors.opponentPet.actorId), true);
  assert.equal(Boolean(wakeRound.room.battle.actors.find((actor) => actor.actorId === actors.opponentPet.actorId).statuses.sleep), false);
  const wakeBefore = wakeRound.turn.actorsBefore.find((actor) => actor.actorId === actors.opponentPet.actorId);
  assert.equal(wakeBefore.statuses.sleep.turns, 2);
  const reconnected = service.getBattleState(opponent.session.token);
  assert.equal(reconnected.room.battle.lastEventList.actorsBefore.find((actor) => actor.actorId === actors.opponentPet.actorId).statuses.sleep.turns, 2);
  const internalHistory = service.snapshot().battleRooms[accepted.room.roomId].battle.eventLog;
  assert.equal(internalHistory.some((entry) => Object.prototype.hasOwnProperty.call(entry, "actorsBefore")), false);
  assert.equal(internalHistory.some((entry) => Object.prototype.hasOwnProperty.call(entry, "actors")), false);

  const stoneRound = submitFourActorRound(fixture, 3, {
    challengerPlayer: {actionId: "defend"},
    challengerPet: {actionId: "pet_stone_gaze", targetActorId: actors.opponentPet.actorId},
    opponentPlayer: {actionId: "defend"},
    opponentPet: {actionId: "pet_defend"},
  });
  assert.equal(stoneRound.room.battle.actors.find((actor) => actor.actorId === actors.opponentPet.actorId).statuses.stone.turns, 2);
  const stoneHitRound = submitFourActorRound(fixture, 4, {
    challengerPlayer: {actionId: "attack", targetActorId: actors.opponentPet.actorId},
    challengerPet: {actionId: "pet_bui_charge", targetActorId: actors.opponentPet.actorId},
    opponentPlayer: {actionId: "attack", targetActorId: actors.challengerPlayer.actorId},
    opponentPet: {actionId: "pet_attack", targetActorId: actors.challengerPlayer.actorId},
  });
  const stoneAttack = stoneHitRound.turn.events.find((event) => event.eventType === "basic_attack" && event.targetActorId === actors.opponentPet.actorId);
  const stonePetSkill = stoneHitRound.turn.events.find((event) => event.eventType === "pet_skill" && event.targetActorId === actors.opponentPet.actorId);
  assert.equal(stoneAttack.stoneDefenseApplied, true);
  assert.equal(stoneAttack.stoneDefenseExtraReduction, 3);
  assert.equal(stonePetSkill.stoneDefenseApplied, true);
  assert.equal(stonePetSkill.stoneDefenseExtraReduction, 2);
  assert.deepEqual(stoneAttack.statusChanges, []);
  const stoneSkip = stoneHitRound.turn.events.find((event) => event.eventType === "status_skip" && event.actorId === actors.opponentPet.actorId);
  assert.equal(stoneSkip.schemaVersion, 3);
  assert.equal(stoneSkip.fromTurns, 2);
  assert.equal(stoneSkip.toTurns, 1);
  assert.equal(stoneSkip.statusBefore.turns, 2);
  assert.equal(stoneSkip.statusAfter.turns, 1);
  assert.equal(stoneSkip.sourceActorId, actors.challengerPet.actorId);
  assert.equal(stoneSkip.hpBefore, stoneSkip.hpAfter);
  assert.equal(stoneSkip.damage, 0);
  assert.equal(stoneSkip.defeated, false);
  assert.equal(stoneSkip.launched, false);
  assert.equal(stoneSkip.dodged, false);
  assert.equal(stoneSkip.critical, false);
  assert.equal(stoneSkip.counterTriggered, false);
  assert.equal(stoneHitRound.turn.events.some((event) => (
    event.eventType === "combo_attack" && Array.isArray(event.participantActorIds) && event.participantActorIds.includes(actors.opponentPet.actorId)
  )), false);
  assert.equal(stoneHitRound.turn.events.some((event) => event.eventType === "basic_attack" && event.actorId === actors.opponentPlayer.actorId), true);
  assert.equal(stoneHitRound.room.battle.actors.find((actor) => actor.actorId === actors.opponentPet.actorId).statuses.stone.turns, 1);

  const secondSleepRound = submitFourActorRound(fixture, 5, {
    challengerPlayer: {actionId: "defend"},
    challengerPet: {actionId: "pet_sleep_powder", targetActorId: actors.opponentPet.actorId},
    opponentPlayer: {actionId: "defend"},
    opponentPet: {actionId: "pet_defend"},
  });
  assert.equal(secondSleepRound.room.battle.actors.find((actor) => actor.actorId === actors.opponentPet.actorId).statuses.sleep.turns, 2);
  const poisonDoesNotWakeRound = submitFourActorRound(fixture, 6, {
    challengerPlayer: {actionId: "item_poison_single_5", itemId: "item_poison_single_5", targetActorId: actors.opponentPet.actorId},
    challengerPet: {actionId: "pet_defend"},
    opponentPlayer: {actionId: "defend"},
    opponentPet: {actionId: "pet_defend"},
  });
  const poisonEvent = poisonDoesNotWakeRound.turn.events.find((event) => event.eventType === "item_poison");
  assert.equal(poisonEvent.statusChanges.some((change) => change.statusId === "sleep" && change.change === "remove_on_damage"), false);
  assert.equal(poisonDoesNotWakeRound.turn.events.some((event) => event.eventType === "status_tick"), true);
  assert.equal(poisonDoesNotWakeRound.turn.events.some((event) => event.eventType === "status_skip" && event.actorId === actors.opponentPet.actorId), true);
  assert.equal(poisonDoesNotWakeRound.room.battle.actors.find((actor) => actor.actorId === actors.opponentPet.actorId).statuses.sleep.turns, 1);
  assert.equal(authority.contexts.filter((context) => context.purpose === "status.v1").every((context) => ["sleep", "stone", "poison"].includes(context.statusId)), true);
});

test("confusion redirects direct, combo and counter attacks while stone covers combo damage", () => {
  const authority = statusFriendlyAuthority((context) => (
    ["critical.v1", "counter.v1"].includes(String(context.purpose || "")) ? 0 : null
  ));
  const service = createAuthService({store: createMemoryAuthStore(), battleRandomAuthority: authority});
  const challenger = service.register({username: "confuselifea", password: "test1234", displayName: "混乱甲"});
  const opponent = service.register({username: "confuselifeb", password: "test1234", displayName: "混乱乙"});
  const challengerProfile = battleProfile("混乱甲", {
    level: 20, hp: 300, maxHp: 300, attack: 30, defense: 8, quick: 300, comboRateOverride: 1,
  }, {
    petId: "confusion_source_pet", formId: "bui_normal_red_fire10", name: "混乱施术宠",
    level: 20, hp: 300, maxHp: 300, attack: 15, defense: 8, quick: 250, comboRateOverride: 0,
  });
  challengerProfile.petInstances[0].activeSkillIds = ["pet_attack", "pet_defend", "pet_confuse_cry", "pet_stone_gaze"];
  challengerProfile.petInstances[0].petSkillSlots = ["pet_attack", "pet_defend", "pet_confuse_cry", "pet_stone_gaze", "", "", ""];
  const opponentProfile = battleProfile("混乱乙", {
    level: 20, hp: 300, maxHp: 300, attack: 30, defense: 8, quick: 220, comboRateOverride: 0,
  }, {
    petId: "confusion_friendly_target", formId: "bui_normal_yellow_wind10", name: "混乱友军宠",
    level: 20, hp: 400, maxHp: 400, attack: 15, defense: 20, quick: 230, comboRateOverride: 1,
  });
  assert.equal(service.saveProfile(challenger.session.token, {expectedRevision: 0, profile: challengerProfile}).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {expectedRevision: 0, profile: opponentProfile}).ok, true);
  placeDuelPlayers(service, challenger, opponent);
  const invite = service.inviteToBattle(challenger.session.token, {username: opponent.account.username});
  const accepted = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  const actors = {
    challengerPlayer: accepted.room.battle.actors.find((actor) => actor.accountId === challenger.account.accountId && actor.kind === "player"),
    challengerPet: accepted.room.battle.actors.find((actor) => actor.accountId === challenger.account.accountId && actor.kind === "pet"),
    opponentPlayer: accepted.room.battle.actors.find((actor) => actor.accountId === opponent.account.accountId && actor.kind === "player"),
    opponentPet: accepted.room.battle.actors.find((actor) => actor.accountId === opponent.account.accountId && actor.kind === "pet"),
  };
  const fixture = {service, challenger, opponent, roomId: accepted.room.roomId, actors};

  const applied = submitFourActorRound(fixture, 1, {
    challengerPlayer: {actionId: "defend"},
    challengerPet: {actionId: "pet_confuse_cry", targetActorId: actors.opponentPlayer.actorId},
    opponentPlayer: {actionId: "defend"},
    opponentPet: {actionId: "pet_defend"},
  });
  assert.equal(applied.room.battle.actors.find((actor) => actor.actorId === actors.opponentPlayer.actorId).statuses.confusion.turns, 2);

  const declaredHpBefore = applied.room.battle.actors.find((actor) => actor.actorId === actors.challengerPlayer.actorId).hp;
  const friendlyHpBefore = applied.room.battle.actors.find((actor) => actor.actorId === actors.opponentPet.actorId).hp;
  const redirected = submitFourActorRound(fixture, 2, {
    challengerPlayer: {actionId: "defend"},
    challengerPet: {actionId: "pet_defend"},
    opponentPlayer: {actionId: "attack", targetActorId: actors.challengerPlayer.actorId},
    opponentPet: {actionId: "pet_defend"},
  });
  const event = redirected.turn.events.find((entry) => entry.eventType === "basic_attack" && entry.actorId === actors.opponentPlayer.actorId);
  assert.ok(event);
  assert.equal(event.declaredTargetActorId, actors.challengerPlayer.actorId);
  assert.equal(event.targetActorId, actors.opponentPet.actorId);
  assert.equal(event.confusionRetargeted, true);
  assert.equal(event.targetRule, "confusion_same_side");
  assert.equal(event.statusId, "confusion");
  assert.equal(event.statusResult, "confused_retarget");
  assert.equal(event.blocked, true);
  assert.equal(event.critical, true);
  const decrement = event.statusChanges.find((change) => change.actorId === actors.opponentPlayer.actorId && change.statusId === "confusion");
  assert.deepEqual({change: decrement.change, fromTurns: decrement.fromTurns, toTurns: decrement.toTurns}, {
    change: "decrement", fromTurns: 2, toTurns: 1,
  });
  assert.equal(redirected.room.battle.actors.find((actor) => actor.actorId === actors.challengerPlayer.actorId).hp, declaredHpBefore);
  assert.equal(redirected.room.battle.actors.find((actor) => actor.actorId === actors.opponentPet.actorId).hp < friendlyHpBefore, true);
  assert.equal(redirected.room.battle.actors.find((actor) => actor.actorId === actors.opponentPlayer.actorId).statuses.confusion.turns, 1);
  const counter = redirected.turn.events.find((entry) => entry.eventType === "counter_attack" && entry.counterSourceEventId === event.eventId);
  assert.ok(counter);
  assert.equal(counter.actorId, actors.opponentPet.actorId);
  assert.equal(counter.targetActorId, actors.opponentPlayer.actorId);
  assert.equal(counter.counterTriggered, false);
  assert.match(event.message, /混乱/);
  assert.equal(authority.contexts.filter((context) => context.purpose === "confusion_target.v1").length, 1);
  assert.equal(/rawRoll|secret/i.test(JSON.stringify(event)), false);

  const expired = submitFourActorRound(fixture, 3, {
    challengerPlayer: {actionId: "defend"},
    challengerPet: {actionId: "pet_defend"},
    opponentPlayer: {actionId: "attack", targetActorId: actors.challengerPlayer.actorId},
    opponentPet: {actionId: "pet_defend"},
  });
  const expiryEvent = expired.turn.events.find((entry) => entry.eventType === "basic_attack" && entry.actorId === actors.opponentPlayer.actorId);
  const expiryChange = expiryEvent.statusChanges.find((change) => change.actorId === actors.opponentPlayer.actorId && change.statusId === "confusion");
  assert.deepEqual({fromTurns: expiryChange.fromTurns, toTurns: expiryChange.toTurns, statusAfter: expiryChange.statusAfter}, {
    fromTurns: 1, toTurns: 0, statusAfter: null,
  });
  assert.equal(Boolean(expired.room.battle.actors.find((actor) => actor.actorId === actors.opponentPlayer.actorId).statuses.confusion), false);
  assert.equal(authority.contexts.filter((context) => context.purpose === "confusion_target.v1").length, 2);

  const reapplied = submitFourActorRound(fixture, 4, {
    challengerPlayer: {actionId: "defend"},
    challengerPet: {actionId: "pet_confuse_cry", targetActorId: actors.opponentPlayer.actorId},
    opponentPlayer: {actionId: "defend"},
    opponentPet: {actionId: "pet_defend"},
  });
  assert.equal(reapplied.room.battle.actors.find((actor) => actor.actorId === actors.opponentPlayer.actorId).statuses.confusion.turns, 2);

  const petrified = submitFourActorRound(fixture, 5, {
    challengerPlayer: {actionId: "defend"},
    challengerPet: {actionId: "pet_stone_gaze", targetActorId: actors.opponentPet.actorId},
    opponentPlayer: {actionId: "defend"},
    opponentPet: {actionId: "pet_defend"},
  });
  assert.equal(petrified.room.battle.actors.find((actor) => actor.actorId === actors.opponentPet.actorId).statuses.stone.turns, 1);

  const comboRound = submitFourActorRound(fixture, 6, {
    challengerPlayer: {actionId: "attack", targetActorId: actors.opponentPet.actorId},
    challengerPet: {actionId: "pet_attack", targetActorId: actors.opponentPet.actorId},
    opponentPlayer: {actionId: "defend"},
    opponentPet: {actionId: "pet_defend"},
  });
  const combo = comboRound.turn.events.find((entry) => entry.eventType === "combo_attack");
  assert.ok(combo);
  assert.deepEqual(combo.participantActorIds, [actors.challengerPlayer.actorId, actors.challengerPet.actorId]);
  assert.equal(combo.stoneDefenseApplied, true);
  assert.equal(combo.stoneDefenseExtraReduction, 14);

  submitFourActorRound(fixture, 7, {
    challengerPlayer: {actionId: "defend"},
    challengerPet: {actionId: "pet_stone_gaze", targetActorId: actors.opponentPet.actorId},
    opponentPlayer: {actionId: "defend"},
    opponentPet: {actionId: "pet_defend"},
  });
  const counterRound = submitFourActorRound(fixture, 8, {
    challengerPlayer: {actionId: "attack", targetActorId: actors.opponentPlayer.actorId},
    challengerPet: {actionId: "pet_defend"},
    opponentPlayer: {actionId: "defend"},
    opponentPet: {actionId: "pet_defend"},
  });
  const counterSource = counterRound.turn.events.find((entry) => entry.eventType === "basic_attack" && entry.actorId === actors.challengerPlayer.actorId);
  const confusedCounter = counterRound.turn.events.find((entry) => entry.eventType === "counter_attack" && entry.counterSourceEventId === counterSource.eventId);
  assert.ok(confusedCounter);
  assert.equal(confusedCounter.actorId, actors.opponentPlayer.actorId);
  assert.equal(confusedCounter.declaredTargetActorId, actors.challengerPlayer.actorId);
  assert.equal(confusedCounter.targetActorId, actors.opponentPet.actorId);
  assert.equal(confusedCounter.confusionRetargeted, true);
  assert.equal(confusedCounter.stoneDefenseApplied, true);
  assert.equal(confusedCounter.stoneDefenseExtraReduction, 7);
  assert.deepEqual(confusedCounter.statusChanges.map((change) => [change.statusId, change.fromTurns, change.toTurns]), [["confusion", 2, 1]]);

  const confusedComboRound = submitFourActorRound(fixture, 9, {
    challengerPlayer: {actionId: "defend"},
    challengerPet: {actionId: "pet_confuse_cry", targetActorId: actors.opponentPet.actorId},
    opponentPlayer: {actionId: "attack", targetActorId: actors.challengerPlayer.actorId},
    opponentPet: {actionId: "pet_attack", targetActorId: actors.challengerPlayer.actorId},
  });
  const confusedCombo = confusedComboRound.turn.events.find((entry) => entry.eventType === "combo_attack" && entry.actorId === actors.opponentPet.actorId);
  assert.ok(confusedCombo);
  assert.equal(confusedCombo.declaredTargetActorId, actors.challengerPlayer.actorId);
  assert.equal(confusedCombo.targetActorId, actors.opponentPlayer.actorId);
  assert.equal(confusedCombo.confusionRetargeted, true);
  assert.deepEqual(confusedCombo.participantActorIds, [actors.opponentPet.actorId, actors.opponentPlayer.actorId]);
  assert.deepEqual(confusedCombo.statusChanges.map((change) => [change.actorId, change.statusId, change.fromTurns, change.toTurns]), [
    [actors.opponentPet.actorId, "confusion", 2, 1],
  ]);
  assert.equal(confusedComboRound.room.battle.actors.find((actor) => actor.actorId === actors.opponentPlayer.actorId).statuses.confusion.turns, 1);
});

test("confusion makes the only surviving actor hit itself", () => {
  const authority = statusFriendlyAuthority();
  const service = createAuthService({store: createMemoryAuthStore(), battleRandomAuthority: authority});
  const challenger = service.register({username: "confuseselfa", password: "test1234", displayName: "自伤甲"});
  const opponent = service.register({username: "confuseselfb", password: "test1234", displayName: "自伤乙"});
  const challengerProfile = battleProfile("自伤甲", {
    level: 20, hp: 300, maxHp: 300, attack: 30, defense: 8, quick: 20, comboRateOverride: 0,
  }, {
    petId: "confusion_self_source", formId: "bui_normal_red_fire10", name: "自伤施术宠",
    level: 20, hp: 220, maxHp: 220, attack: 15, defense: 8, quick: 200, comboRateOverride: 0,
  });
  challengerProfile.petInstances[0].activeSkillIds = ["pet_attack", "pet_defend", "pet_confuse_cry"];
  challengerProfile.petInstances[0].petSkillSlots = ["pet_attack", "pet_defend", "pet_confuse_cry", "", "", "", ""];
  const opponentProfile = battleProfile("自伤乙", {
    level: 20, hp: 300, maxHp: 300, attack: 30, defense: 8, quick: 100, comboRateOverride: 0,
  }, null);
  assert.equal(service.saveProfile(challenger.session.token, {expectedRevision: 0, profile: challengerProfile}).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {expectedRevision: 0, profile: opponentProfile}).ok, true);
  placeDuelPlayers(service, challenger, opponent);
  const invite = service.inviteToBattle(challenger.session.token, {username: opponent.account.username});
  const accepted = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  const challengerPlayer = accepted.room.battle.actors.find((actor) => actor.accountId === challenger.account.accountId && actor.kind === "player");
  const challengerPet = accepted.room.battle.actors.find((actor) => actor.accountId === challenger.account.accountId && actor.kind === "pet");
  const opponentPlayer = accepted.room.battle.actors.find((actor) => actor.accountId === opponent.account.accountId && actor.kind === "player");
  assert.equal(accepted.room.battle.actors.filter((actor) => actor.side === opponentPlayer.side).length, 1);

  const applied = submitActorRound(service, accepted.room.roomId, 1, [
    [challenger.session.token, challengerPlayer, {actionId: "defend"}],
    [challenger.session.token, challengerPet, {actionId: "pet_confuse_cry", targetActorId: opponentPlayer.actorId}],
    [opponent.session.token, opponentPlayer, {actionId: "defend"}],
  ]);
  assert.equal(applied.room.battle.actors.find((actor) => actor.actorId === opponentPlayer.actorId).statuses.confusion.turns, 2);
  const hpBefore = applied.room.battle.actors.find((actor) => actor.actorId === opponentPlayer.actorId).hp;
  const selfHit = submitActorRound(service, accepted.room.roomId, 2, [
    [challenger.session.token, challengerPlayer, {actionId: "defend"}],
    [challenger.session.token, challengerPet, {actionId: "pet_defend"}],
    [opponent.session.token, opponentPlayer, {actionId: "attack", targetActorId: challengerPlayer.actorId}],
  ]);
  const event = selfHit.turn.events.find((entry) => entry.eventType === "basic_attack" && entry.actorId === opponentPlayer.actorId);
  assert.equal(event.declaredTargetActorId, challengerPlayer.actorId);
  assert.equal(event.targetActorId, opponentPlayer.actorId);
  assert.equal(event.confusionRetargeted, true);
  assert.equal(event.hpAfter < hpBefore, true);
  assert.deepEqual(event.statusChanges.map((change) => [change.statusId, change.fromTurns, change.toTurns]), [["confusion", 2, 1]]);
  assert.equal(selfHit.room.battle.actors.find((actor) => actor.actorId === opponentPlayer.actorId).statuses.confusion.turns, 1);
});

test("new poison ticks in its apply round, expires 3 to 0, and cleanse suppresses the pending tick", () => {
  const authority = statusFriendlyAuthority();
  const service = createAuthService({store: createMemoryAuthStore(), battleRandomAuthority: authority});
  const challenger = service.register({username: "poisonticka", password: "test1234", displayName: "毒轮甲"});
  const opponent = service.register({username: "poisontickb", password: "test1234", displayName: "毒轮乙"});
  const challengerProfile = battleProfile("毒轮甲", {level: 12, hp: 240, maxHp: 240, quick: 100}, null);
  challengerProfile.backpackSlots = [{itemId: "item_poison_single_5", count: 2}];
  const opponentProfile = battleProfile("毒轮乙", {level: 12, hp: 240, maxHp: 240, quick: 80}, null);
  opponentProfile.backpackSlots = [{itemId: "item_cleanse_single_5", count: 1}];
  assert.equal(service.saveProfile(challenger.session.token, {expectedRevision: 0, profile: challengerProfile}).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {expectedRevision: 0, profile: opponentProfile}).ok, true);
  placeDuelPlayers(service, challenger, opponent);
  const invite = service.inviteToBattle(challenger.session.token, {username: opponent.account.username});
  const accepted = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  const source = accepted.room.battle.actors.find((actor) => actor.accountId === challenger.account.accountId);
  const target = accepted.room.battle.actors.find((actor) => actor.accountId === opponent.account.accountId);

  assert.equal(service.submitBattleCommand(challenger.session.token, accepted.room.roomId, {
    round: 1, actorId: source.actorId, actionId: "item_poison_single_5", itemId: "item_poison_single_5", targetActorId: target.actorId,
  }).ok, true);
  const first = service.submitBattleCommand(opponent.session.token, accepted.room.roomId, {
    round: 1, actorId: target.actorId, actionId: "defend",
  });
  const applyEvent = first.turn.events.find((event) => event.eventType === "item_poison");
  const firstTick = first.turn.events.find((event) => event.eventType === "status_tick");
  assert.equal(applyEvent.hpBefore, 240);
  assert.equal(applyEvent.hpAfter, 228);
  assert.equal(applyEvent.sourceActorId, source.actorId);
  assert.equal(applyEvent.statusChanges.find((change) => change.change === "apply").sourceId, source.actorId);
  assert.equal(firstTick.schemaVersion, 3);
  assert.equal(firstTick.sourceActorId, source.actorId);
  assert.equal(firstTick.hpBefore, 228);
  assert.equal(firstTick.hpAfter, 222);
  assert.equal(firstTick.damage, 6);
  assert.equal(firstTick.fromTurns, 3);
  assert.equal(firstTick.toTurns, 2);
  assert.equal(firstTick.statusBefore.turns, 3);
  assert.equal(firstTick.statusAfter.turns, 2);
  assert.equal(firstTick.launched, false);
  assert.equal(first.room.battle.actors.find((actor) => actor.actorId === target.actorId).statuses.poison.turns, 2);
  assert.equal(JSON.stringify(first.room).includes("sourceCredit"), false);

  assert.equal(service.submitBattleCommand(challenger.session.token, accepted.room.roomId, {
    round: 2, actorId: source.actorId, actionId: "defend",
  }).ok, true);
  const cleansed = service.submitBattleCommand(opponent.session.token, accepted.room.roomId, {
    round: 2, actorId: target.actorId, actionId: "item_cleanse_single_5", itemId: "item_cleanse_single_5", targetActorId: target.actorId,
  });
  assert.equal(cleansed.turn.events.some((event) => event.eventType === "item_cleanse"), true);
  assert.equal(cleansed.turn.events.some((event) => event.eventType === "status_tick"), false);
  assert.equal(Boolean(cleansed.room.battle.actors.find((actor) => actor.actorId === target.actorId).statuses.poison), false);

  assert.equal(service.submitBattleCommand(challenger.session.token, accepted.room.roomId, {
    round: 3, actorId: source.actorId, actionId: "item_poison_single_5", itemId: "item_poison_single_5", targetActorId: target.actorId,
  }).ok, true);
  const reapplied = service.submitBattleCommand(opponent.session.token, accepted.room.roomId, {
    round: 3, actorId: target.actorId, actionId: "defend",
  });
  assert.equal(reapplied.turn.events.find((event) => event.eventType === "status_tick").toTurns, 2);
  for (const round of [4, 5]) {
    assert.equal(service.submitBattleCommand(challenger.session.token, accepted.room.roomId, {
      round, actorId: source.actorId, actionId: "defend",
    }).ok, true);
    const resolved = service.submitBattleCommand(opponent.session.token, accepted.room.roomId, {
      round, actorId: target.actorId, actionId: "defend",
    });
    const tick = resolved.turn.events.find((event) => event.eventType === "status_tick");
    assert.equal(tick.fromTurns, round === 4 ? 2 : 1);
    assert.equal(tick.toTurns, round === 4 ? 1 : 0);
    if (round === 5) {
      assert.equal(tick.statusAfter, null);
      assert.equal(Boolean(resolved.room.battle.actors.find((actor) => actor.actorId === target.actorId).statuses.poison), false);
    }
  }
});

test("lethal poison tick credits its frozen player and riding pet without launch", () => {
  const authority = statusFriendlyAuthority();
  const service = createAuthService({store: createMemoryAuthStore(), battleRandomAuthority: authority});
  const player = service.register({username: "poisonkilla", password: "test1234", displayName: "毒杀甲"});
  const profile = battleProfile("毒杀甲", {level: 1, hp: 240, maxHp: 240, quick: 120}, null);
  profile.backpackSlots = [{itemId: "item_poison_single_5", count: 1}];
  profile.ridePetInstanceId = "poison_ride_pet";
  profile.petInstances = [{
    instanceId: "poison_ride_pet", petId: "poison_ride_pet", formId: "bui_normal_yellow_wind10",
    name: "施毒时骑宠", state: "riding", level: 1, hp: 95, maxHp: 95,
    attack: 12, defense: 7, quick: 72, activeSkillIds: ["pet_attack", "pet_defend"],
    petSkillSlots: ["pet_attack", "pet_defend", "", "", "", "", ""],
  }];
  assert.equal(service.saveProfile(player.session.token, {expectedRevision: 0, profile}).ok, true);
  assert.equal(service.updatePlayerPosition(player.session.token, {
    mapId: "firebud_training_yard", cellX: 12, cellY: 12, facing: "east", moving: false,
  }).ok, true);
  const encounter = service.startPartyEncounter(player.session.token, {
    enemyCount: 1,
    encounterZone: {
      id: "poison_lethal_fixture",
      name: "毒杀夹具",
      selectedWildPet: {
        formId: "bui_normal_red_fire10", name: "低血目标", level: 1,
        battleStats: {maxHp: 15, attack: 1, defense: 1, agility: 1},
      },
    },
  });
  const source = encounter.room.battle.actors.find((actor) => actor.accountId === player.account.accountId && actor.kind === "player");
  const target = encounter.room.battle.actors.find((actor) => actor.side === "enemy");
  const resolved = service.submitBattleCommand(player.session.token, encounter.room.roomId, {
    round: 1,
    actorId: source.actorId,
    actionId: "item_poison_single_5",
    itemId: "item_poison_single_5",
    targetActorId: target.actorId,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.room.status, "closed");
  const tick = resolved.turn.events.find((event) => event.eventType === "status_tick");
  assert.equal(tick.hpBefore, 3);
  assert.equal(tick.hpAfter, 0);
  assert.equal(tick.defeated, true);
  assert.equal(tick.launched, false);
  assert.equal(tick.dodged, false);
  assert.equal(tick.critical, false);
  assert.equal(tick.counterTriggered, false);
  assert.deepEqual(tick.expCredits[0].recipients.map((recipient) => recipient.type).sort(), ["player", "ride_pet"]);
  assert.equal(tick.expCredits[0].recipients.find((recipient) => recipient.type === "ride_pet").petId, "poison_ride_pet");
  const writeback = resolved.room.battle.profileWriteback.profiles.find((entry) => entry.accountId === player.account.accountId);
  assert.equal(writeback.exp.player.amount > 0, true);
  assert.equal(writeback.exp.ridePets.find((entry) => entry.petId === "poison_ride_pet").amount > 0, true);
});
