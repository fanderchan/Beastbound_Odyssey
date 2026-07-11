"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
  battleProfile,
  internalProfileForAccount,
} = require("../test-support/auth-service-test-context");

function deterministicBattleRandomAuthority(rollForContext = null) {
  const rooms = new Set();
  return Object.freeze({
    openRoom(roomId) {
      const id = String(roomId || "");
      if (rooms.has(id)) {
        return false;
      }
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
      return typeof rollForContext === "function" ? rollForContext(context) : 0.9999;
    },
    index(roomId, _context, size) {
      assert.equal(rooms.has(String(roomId || "")), true);
      return Math.max(0, Math.trunc(Number(size || 1)) - 1);
    },
  });
}

function profileWithEquipment(name, playerStats, equipment = {}) {
  const profile = battleProfile(name, {
    comboRateOverride: 0,
    ...playerStats,
  }, null);
  const slots = {...(equipment.slots || {})};
  const durability = {...(equipment.durability || {})};
  const enhancement = {...(equipment.enhancement || {})};
  const wearCounters = {...(equipment.wearCounters || {})};
  const instances = {};
  const slotInstanceIds = {};
  let serial = 1;
  for (const [slotId, itemId] of Object.entries(slots)) {
    const instanceId = `equip_${String(serial).padStart(6, "0")}`;
    serial += 1;
    slotInstanceIds[slotId] = instanceId;
    instances[instanceId] = {
      schemaVersion: 1,
      instanceId,
      itemId,
      location: "equipped",
      slotId,
      durability: Number(durability[slotId] ?? 30),
      enhancement: enhancement[slotId] || {itemId, level: 0, history: []},
      wearCounters: wearCounters[slotId] || {itemId, attackCount: 0, hitCount: 0},
      source: "p04g_test",
    };
  }
  profile.equipmentSlots = slots;
  profile.equipmentDurability = durability;
  profile.equipmentEnhancement = enhancement;
  profile.equipmentWearCounters = wearCounters;
  profile.equipmentInstances = instances;
  profile.equipmentSlotInstanceIds = slotInstanceIds;
  profile.equipmentSlotsVersion = 5;
  profile.nextEquipmentInstanceSerial = serial;
  return profile;
}

function createEquipmentDuel({suffix, challengerProfile, opponentProfile}) {
  const service = createAuthService({
    store: createMemoryAuthStore(),
    battleRandomAuthority: deterministicBattleRandomAuthority(),
  });
  const challenger = service.register({username: `eqa${suffix}`, password: "test1234", displayName: "装备甲"});
  const opponent = service.register({username: `eqb${suffix}`, password: "test1234", displayName: "装备乙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  assert.equal(service.saveProfile(challenger.session.token, {expectedRevision: 0, profile: challengerProfile}).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {expectedRevision: 0, profile: opponentProfile}).ok, true);
  assert.equal(service.updatePlayerPosition(challenger.session.token, {
    mapId: "firebud_training_yard",
    cellX: 10,
    cellY: 10,
    facing: "east",
    moving: false,
  }).ok, true);
  assert.equal(service.updatePlayerPosition(opponent.session.token, {
    mapId: "firebud_training_yard",
    cellX: 11,
    cellY: 10,
    facing: "west",
    moving: false,
  }).ok, true);
  const invite = service.inviteToBattle(challenger.session.token, {username: opponent.account.username});
  assert.equal(invite.ok, true);
  const accepted = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accepted.ok, true);
  return {service, challenger, opponent, room: accepted.room};
}

test("server battle snapshot materializes effective equipment and enhancement stats", () => {
  const challengerProfile = profileWithEquipment("装备甲", {
    level: 20,
    hp: 120,
    maxHp: 120,
    attack: 18,
    defense: 6,
    quick: 70,
  }, {
    slots: {
      right_hand_weapon: "weapon_wooden_club",
      body: "armor_hide_vest",
    },
    durability: {
      right_hand_weapon: 30,
      body: 30,
    },
    enhancement: {
      right_hand_weapon: {itemId: "weapon_wooden_club", level: 1, history: []},
      body: {itemId: "armor_hide_vest", level: 2, history: []},
    },
  });
  const opponentProfile = profileWithEquipment("装备乙", {
    level: 20,
    hp: 120,
    maxHp: 120,
    attack: 18,
    defense: 20,
    quick: 60,
  });
  const fixture = createEquipmentDuel({suffix: "stats", challengerProfile, opponentProfile});
  const actor = fixture.room.battle.actors.find((entry) => entry.accountId === fixture.challenger.account.accountId);
  assert.equal(actor.attack, 25);
  assert.equal(actor.defense, 13);
  assert.equal(actor.speed, 70);
  assert.deepEqual(actor.equipmentStatBonus, {maxHp: 0, attack: 7, defense: 7, quick: 0});
});

test("server battle damage consumes the materialized attack and target defense", () => {
  const challengerProfile = profileWithEquipment("伤害甲", {
    level: 20,
    hp: 180,
    maxHp: 180,
    attack: 18,
    defense: 6,
    quick: 70,
  }, {
    slots: {right_hand_weapon: "weapon_wooden_club"},
    durability: {right_hand_weapon: 30},
    enhancement: {right_hand_weapon: {itemId: "weapon_wooden_club", level: 1, history: []}},
  });
  const opponentProfile = profileWithEquipment("伤害乙", {
    level: 20,
    hp: 180,
    maxHp: 180,
    attack: 18,
    defense: 20,
    quick: 60,
  });
  const fixture = createEquipmentDuel({suffix: "damage", challengerProfile, opponentProfile});
  assert.equal(fixture.service.submitBattleCommand(fixture.challenger.session.token, fixture.room.roomId, {
    round: 1,
    actionId: "attack",
    targetUsername: fixture.opponent.account.username,
  }).ok, true);
  const resolved = fixture.service.submitBattleCommand(fixture.opponent.session.token, fixture.room.roomId, {
    round: 1,
    actionId: "attack",
    targetUsername: fixture.challenger.account.username,
  });
  assert.equal(resolved.ok, true);
  const attack = resolved.turn.events.find((event) => (
    event.eventType === "basic_attack" && event.actorAccountId === fixture.challenger.account.accountId
  ));
  assert.equal(attack.damage, 18);
  assert.equal(attack.combatFormulaId, "combat_v1");
  assert.equal(attack.attackStat, 25);
  assert.equal(attack.defenseStat, 20);
  assert.equal(attack.defenseReduction, 7);
  assert.equal(attack.minimumDamage, 1);
});

test("broken and requirement-inactive equipment cannot affect the public actor", () => {
  const challengerProfile = profileWithEquipment("损坏甲", {
    level: 20,
    hp: 120,
    maxHp: 120,
    attack: 18,
    defense: 6,
    quick: 70,
  }, {
    slots: {
      right_hand_weapon: "weapon_shadow_group_bow",
      body: "armor_moist_cloth",
    },
    durability: {
      right_hand_weapon: 50,
      body: 0,
    },
  });
  const opponentProfile = profileWithEquipment("损坏乙", {
    level: 20,
    hp: 120,
    maxHp: 120,
    attack: 18,
    defense: 20,
    quick: 60,
  });
  const fixture = createEquipmentDuel({suffix: "inactive", challengerProfile, opponentProfile});
  const actor = fixture.room.battle.actors.find((entry) => entry.accountId === fixture.challenger.account.accountId);
  assert.equal(actor.attack, 18);
  assert.equal(actor.defense, 6);
  assert.equal(actor.attackActionId, "");
  assert.equal(actor.rideAttackStyle, "");
  assert.deepEqual(actor.spiritIds, []);
});

test("a weapon placed in the wrong slot cannot grant an equipment spirit", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const challenger = seedService.register({username: "eqawrongslotspirit", password: "test1234", displayName: "错槽甲"});
  const opponent = seedService.register({username: "eqbwrongslotspirit", password: "test1234", displayName: "错槽乙"});
  const challengerProfile = profileWithEquipment("错槽甲", {
    level: 20,
    hp: 120,
    maxHp: 120,
    attack: 18,
    defense: 6,
    quick: 70,
  });
  const opponentProfile = profileWithEquipment("错槽乙", {
    level: 20,
    hp: 120,
    maxHp: 120,
    attack: 18,
    defense: 6,
    quick: 60,
  });
  assert.equal(seedService.saveProfile(challenger.session.token, {expectedRevision: 0, profile: challengerProfile}).ok, true);
  assert.equal(seedService.saveProfile(opponent.session.token, {expectedRevision: 0, profile: opponentProfile}).ok, true);
  const seed = seedService.snapshot();
  const binding = seed.profileBindings[challenger.account.accountId];
  const unsafe = seed.profiles[binding.playerId].profile;
  unsafe.equipmentSlots = {head: "weapon_training_spear"};
  unsafe.equipmentDurability = {head: 30};
  unsafe.equipmentEnhancement = {head: {itemId: "weapon_training_spear", level: 0, history: []}};
  unsafe.equipmentWearCounters = {head: {itemId: "weapon_training_spear", attackCount: 0, hitCount: 0}};
  unsafe.equipmentInstances = {
    equip_wrong_slot: {
      schemaVersion: 1,
      instanceId: "equip_wrong_slot",
      itemId: "weapon_training_spear",
      location: "equipped",
      slotId: "head",
      durability: 30,
      enhancement: {itemId: "weapon_training_spear", level: 0, history: []},
      wearCounters: {itemId: "weapon_training_spear", attackCount: 0, hitCount: 0},
      expPillCharge: {},
    },
  };
  unsafe.equipmentSlotInstanceIds = {head: "equip_wrong_slot"};
  unsafe.equipmentSlotsVersion = 5;
  const service = createAuthService({store: createMemoryAuthStore(seed)});
  assert.equal(service.updatePlayerPosition(challenger.session.token, {
    mapId: "firebud_training_yard", cellX: 10, cellY: 10, facing: "east", moving: false,
  }).ok, true);
  assert.equal(service.updatePlayerPosition(opponent.session.token, {
    mapId: "firebud_training_yard", cellX: 11, cellY: 10, facing: "west", moving: false,
  }).ok, true);

  const invite = service.inviteToBattle(challenger.session.token, {username: opponent.account.username});

  assert.equal(invite.ok, false);
  assert.equal(invite.code, "equipment_profile_field_invalid");
  assert.deepEqual(service.snapshot().battleRooms, {});
});

test("equipment stats are applied before the established melee and ranged riding formulas", () => {
  const meleeProfile = profileWithEquipment("骑乘甲", {
    level: 20,
    hp: 120,
    maxHp: 120,
    attack: 18,
    defense: 6,
    quick: 70,
  }, {
    slots: {right_hand_weapon: "weapon_wooden_club"},
    durability: {right_hand_weapon: 30},
  });
  meleeProfile.ridePetInstanceId = "ride_melee";
  meleeProfile.petInstances = [{
    instanceId: "ride_melee",
    petId: "ride_melee",
    formId: "novice_tiger_mount",
    name: "骑宠",
    state: "riding",
    level: 20,
    hp: 200,
    maxHp: 200,
    attack: 40,
    defense: 20,
    quick: 90,
  }];
  const plainOpponent = profileWithEquipment("骑乘乙", {
    level: 20,
    hp: 120,
    maxHp: 120,
    attack: 18,
    defense: 6,
    quick: 60,
  });
  let fixture = createEquipmentDuel({suffix: "melee", challengerProfile: meleeProfile, opponentProfile: plainOpponent});
  let actor = fixture.room.battle.actors.find((entry) => entry.accountId === fixture.challenger.account.accountId);
  assert.deepEqual(actor.rideBaseStats, {attack: 24, defense: 6, quick: 70});
  assert.equal(actor.attack, 51);
  assert.equal(actor.defense, 18);
  assert.equal(actor.speed, 86);
  assert.equal(actor.rideAttackStyle, "melee");

  const rangedProfile = profileWithEquipment("远程甲", {
    level: 20,
    hp: 120,
    maxHp: 120,
    attack: 18,
    defense: 6,
    quick: 70,
  }, {
    slots: {right_hand_weapon: "weapon_shadow_group_bow"},
    durability: {right_hand_weapon: 50},
  });
  rangedProfile.rebirthCount = 6;
  rangedProfile.ridePetInstanceId = "ride_ranged";
  rangedProfile.petInstances = [{...meleeProfile.petInstances[0], instanceId: "ride_ranged", petId: "ride_ranged"}];
  fixture = createEquipmentDuel({suffix: "ranged", challengerProfile: rangedProfile, opponentProfile: plainOpponent});
  actor = fixture.room.battle.actors.find((entry) => entry.accountId === fixture.challenger.account.accountId);
  assert.deepEqual(actor.rideBaseStats, {attack: 50, defense: 6, quick: 75});
  assert.equal(actor.attack, 66);
  assert.equal(actor.defense, 18);
  assert.equal(actor.speed, 78);
  assert.equal(actor.rideAttackStyle, "ranged");
  assert.equal(actor.attackActionId, "weapon_shadow_group_shot");
});

test("battle writeback persists 99 plus 1 weapon use and 9 plus 1 armor hit by instance", () => {
  function wearProfile(name, quick) {
    return profileWithEquipment(name, {
      level: 20,
      hp: 300,
      maxHp: 300,
      attack: 18,
      defense: 20,
      quick,
    }, {
      slots: {
        right_hand_weapon: "weapon_wooden_club",
        body: "armor_hide_vest",
      },
      durability: {
        right_hand_weapon: 30,
        body: 30,
      },
      wearCounters: {
        right_hand_weapon: {itemId: "weapon_wooden_club", attackCount: 99, hitCount: 0},
        body: {itemId: "armor_hide_vest", attackCount: 0, hitCount: 9},
      },
    });
  }
  const fixture = createEquipmentDuel({
    suffix: "wear",
    challengerProfile: wearProfile("耐久甲", 70),
    opponentProfile: wearProfile("耐久乙", 60),
  });
  assert.equal(fixture.service.submitBattleCommand(fixture.challenger.session.token, fixture.room.roomId, {
    round: 1,
    actionId: "attack",
    targetUsername: fixture.opponent.account.username,
  }).ok, true);
  const resolved = fixture.service.submitBattleCommand(fixture.opponent.session.token, fixture.room.roomId, {
    round: 1,
    actionId: "attack",
    targetUsername: fixture.challenger.account.username,
  });
  assert.equal(resolved.ok, true);
  assert.equal(fixture.service.leaveBattleRoom(fixture.challenger.session.token, fixture.room.roomId).ok, true);

  for (const account of [fixture.challenger.account, fixture.opponent.account]) {
    const profile = internalProfileForAccount(fixture.service, account.accountId);
    assert.equal(profile.equipmentDurability.right_hand_weapon, 29);
    assert.equal(profile.equipmentDurability.body, 29);
    assert.equal(profile.equipmentWearCounters.right_hand_weapon.attackCount, 0);
    assert.equal(profile.equipmentWearCounters.body.hitCount, 0);
    const weaponInstanceId = profile.equipmentSlotInstanceIds.right_hand_weapon;
    const armorInstanceId = profile.equipmentSlotInstanceIds.body;
    assert.equal(profile.equipmentInstances[weaponInstanceId].durability, 29);
    assert.equal(profile.equipmentInstances[armorInstanceId].durability, 29);
    assert.equal(profile.equipmentInstances[weaponInstanceId].wearCounters.attackCount, 0);
    assert.equal(profile.equipmentInstances[armorInstanceId].wearCounters.hitCount, 0);
  }
});

test("battle writeback persists sub-threshold wear counters without reducing durability", () => {
  function wearProfile(name, quick) {
    return profileWithEquipment(name, {
      level: 20,
      hp: 300,
      maxHp: 300,
      attack: 18,
      defense: 20,
      quick,
    }, {
      slots: {
        right_hand_weapon: "weapon_wooden_club",
        body: "armor_hide_vest",
      },
      durability: {
        right_hand_weapon: 30,
        body: 30,
      },
      wearCounters: {
        right_hand_weapon: {itemId: "weapon_wooden_club", attackCount: 98, hitCount: 0},
        body: {itemId: "armor_hide_vest", attackCount: 0, hitCount: 8},
      },
    });
  }
  const fixture = createEquipmentDuel({
    suffix: "wearcounter",
    challengerProfile: wearProfile("计数甲", 70),
    opponentProfile: wearProfile("计数乙", 60),
  });
  assert.equal(fixture.service.submitBattleCommand(fixture.challenger.session.token, fixture.room.roomId, {
    round: 1,
    actionId: "attack",
    targetUsername: fixture.opponent.account.username,
  }).ok, true);
  const resolved = fixture.service.submitBattleCommand(fixture.opponent.session.token, fixture.room.roomId, {
    round: 1,
    actionId: "attack",
    targetUsername: fixture.challenger.account.username,
  });
  assert.equal(resolved.ok, true);
  assert.equal(fixture.service.leaveBattleRoom(fixture.challenger.session.token, fixture.room.roomId).ok, true);

  for (const account of [fixture.challenger.account, fixture.opponent.account]) {
    const profile = internalProfileForAccount(fixture.service, account.accountId);
    assert.equal(profile.equipmentDurability.right_hand_weapon, 30);
    assert.equal(profile.equipmentDurability.body, 30);
    assert.equal(profile.equipmentWearCounters.right_hand_weapon.attackCount, 99);
    assert.equal(profile.equipmentWearCounters.body.hitCount, 9);
    const weaponInstanceId = profile.equipmentSlotInstanceIds.right_hand_weapon;
    const armorInstanceId = profile.equipmentSlotInstanceIds.body;
    assert.equal(profile.equipmentInstances[weaponInstanceId].durability, 30);
    assert.equal(profile.equipmentInstances[armorInstanceId].durability, 30);
    assert.equal(profile.equipmentInstances[weaponInstanceId].wearCounters.attackCount, 99);
    assert.equal(profile.equipmentInstances[armorInstanceId].wearCounters.hitCount, 9);
  }
});

test("authoritative shadow bow selects and resolves ten unique targets as one weapon use", () => {
  const service = createAuthService({
    store: createMemoryAuthStore(),
    battleRandomAuthority: deterministicBattleRandomAuthority((context) => {
      if (String(context.purpose || "") === "dodge.v1" && Number(context.ordinal || 0) === 0) {
        return 0;
      }
      return String(context.purpose || "") === "critical.v1" ? 0 : 0.9999;
    }),
  });
  const player = service.register({username: "eqshadowbow", password: "test1234", displayName: "玄影猎人"});
  const member = service.register({username: "eqshadowally", password: "test1234", displayName: "玄影队友"});
  assert.equal(player.ok, true);
  assert.equal(member.ok, true);
  const profile = profileWithEquipment("玄影猎人", {
    level: 140,
    hp: 1000,
    maxHp: 1000,
    attack: 18,
    defense: 20,
    quick: 100,
  }, {
    slots: {right_hand_weapon: "weapon_shadow_group_bow"},
    durability: {right_hand_weapon: 50},
    wearCounters: {
      right_hand_weapon: {itemId: "weapon_shadow_group_bow", attackCount: 99, hitCount: 0},
    },
  });
  profile.rebirthCount = 6;
  profile.activePetInstanceId = "shadow_bow_pet";
  profile.petInstances = [{
    instanceId: "shadow_bow_pet",
    petId: "shadow_bow_pet",
    formId: "bui_normal_red_fire10",
    name: "玄影布伊",
    state: "battle",
    level: 140,
    hp: 1000,
    maxHp: 1000,
    attack: 1,
    defense: 20,
    quick: 90,
    activeSkillIds: ["pet_attack", "pet_defend"],
    petSkillSlots: ["pet_attack", "pet_defend", "", "", "", "", ""],
    passiveSkillIds: [],
    comboRateOverride: 0,
  }];
  assert.equal(service.saveProfile(player.session.token, {expectedRevision: 0, profile}).ok, true);
  const memberProfile = profileWithEquipment("玄影队友", {
    level: 140,
    hp: 1000,
    maxHp: 1000,
    attack: 18,
    defense: 20,
    quick: 1,
  });
  memberProfile.activePetInstanceId = "shadow_ally_pet";
  memberProfile.petInstances = [{...profile.petInstances[0], instanceId: "shadow_ally_pet", petId: "shadow_ally_pet", name: "队友布伊", quick: 80}];
  assert.equal(service.saveProfile(member.session.token, {
    expectedRevision: 0,
    profile: memberProfile,
  }).ok, true);
  assert.equal(service.updatePlayerPosition(player.session.token, {
    mapId: "firebud_training_yard",
    cellX: 20,
    cellY: 20,
    facing: "east",
    moving: false,
  }).ok, true);
  assert.equal(service.updatePlayerPosition(member.session.token, {
    mapId: "firebud_training_yard",
    cellX: 20,
    cellY: 20,
    facing: "east",
    moving: false,
  }).ok, true);
  const partyInvite = service.inviteToParty(player.session.token, {username: member.account.username});
  assert.equal(partyInvite.ok, true);
  assert.equal(service.acceptPartyInvite(member.session.token, partyInvite.invite.inviteId).ok, true);
  const encounter = service.startPartyEncounter(player.session.token, {
    enemyCount: 10,
    encounterZone: {
      id: "shadow_bow_authority_fixture",
      name: "玄影弓靶场",
      formationTemplate: "10v10",
      selectedWildPet: {
        formId: "wuli_normal_orange_fire10",
        name: "玄影木桩",
        level: 140,
        battleStats: {maxHp: 500, attack: 1, defense: 20, quick: 10},
      },
    },
  });
  assert.equal(encounter.ok, true);
  assert.equal(encounter.room.battle.actors.filter((entry) => entry.side === "enemy").length, 10);
  const actor = encounter.room.battle.actors.find((entry) => entry.accountId === player.account.accountId && entry.kind === "player");
  const actorPet = encounter.room.battle.actors.find((entry) => entry.accountId === player.account.accountId && entry.kind === "pet");
  const memberActor = encounter.room.battle.actors.find((entry) => entry.accountId === member.account.accountId && entry.kind === "player");
  const memberPet = encounter.room.battle.actors.find((entry) => entry.accountId === member.account.accountId && entry.kind === "pet");
  const target = encounter.room.battle.actors.find((entry) => entry.side === "enemy");
  const waiting = service.submitBattleCommand(player.session.token, encounter.room.roomId, {
    round: 1,
    actorId: actor.actorId,
    actionId: "attack",
    targetActorId: target.actorId,
  });
  assert.equal(waiting.ok, true);
  assert.equal(waiting.turn, null);
  assert.equal(service.submitBattleCommand(player.session.token, encounter.room.roomId, {
    round: 1,
    actorId: actorPet.actorId,
    actionId: "pet_defend",
  }).turn, null);
  assert.equal(service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    round: 1,
    actorId: memberActor.actorId,
    actionId: "defend",
  }).turn, null);
  const resolved = service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    round: 1,
    actorId: memberPet.actorId,
    actionId: "pet_defend",
  });
  assert.equal(resolved.ok, true);
  const event = resolved.turn.events.find((entry) => entry.eventType === "multi_attack");
  assert.equal(Boolean(event), true);
  assert.equal(event.actionId, "weapon_shadow_group_shot");
  assert.equal(event.targetCount, 10, JSON.stringify({
    requestedTargetCount: event.requestedTargetCount,
    candidateTargetCount: event.candidateTargetCount,
    targets: event.targetActorIds,
  }));
  assert.equal(new Set(event.targetActorIds).size, 10);
  assert.equal(event.targets.length, 10);
  assert.equal(event.targets.filter((entry) => entry.dodged).length, 1);
  assert.equal(event.targets.find((entry) => entry.dodged).damage, 0);
  assert.equal(event.targets.filter((entry) => !entry.dodged).every((entry) => entry.damage === 28 && entry.critical === true), true);
  assert.equal(event.damage, 252);
  assert.equal(event.critical, true);
  assert.equal(event.counterTriggered, false);
  assert.equal(event.combatFormulaId, "combat_v1");
  assert.equal(service.leaveBattleRoom(player.session.token, encounter.room.roomId).ok, true);
  const stored = internalProfileForAccount(service, player.account.accountId);
  assert.equal(stored.equipmentDurability.right_hand_weapon, 49);
  assert.equal(stored.equipmentWearCounters.right_hand_weapon.attackCount, 0);
  const instanceId = stored.equipmentSlotInstanceIds.right_hand_weapon;
  assert.equal(stored.equipmentInstances[instanceId].durability, 49);
});

test("a slower shadow bow user keeps its multi attack instead of joining a normal combo", () => {
  const service = createAuthService({
    store: createMemoryAuthStore(),
    battleRandomAuthority: deterministicBattleRandomAuthority(),
  });
  const fast = service.register({username: "eqfastcombo", password: "test1234", displayName: "快手"});
  const bow = service.register({username: "eqslowbow", password: "test1234", displayName: "弓手"});
  assert.equal(fast.ok, true);
  assert.equal(bow.ok, true);
  const fastProfile = profileWithEquipment("快手", {
    level: 140,
    hp: 1000,
    maxHp: 1000,
    attack: 18,
    defense: 20,
    quick: 100,
    comboRateOverride: 1,
  });
  const bowProfile = profileWithEquipment("弓手", {
    level: 140,
    hp: 1000,
    maxHp: 1000,
    attack: 18,
    defense: 20,
    quick: 50,
    comboRateOverride: 0,
  }, {
    slots: {right_hand_weapon: "weapon_shadow_group_bow"},
    durability: {right_hand_weapon: 50},
  });
  bowProfile.rebirthCount = 6;
  assert.equal(service.saveProfile(fast.session.token, {expectedRevision: 0, profile: fastProfile}).ok, true);
  assert.equal(service.saveProfile(bow.session.token, {expectedRevision: 0, profile: bowProfile}).ok, true);
  for (const account of [fast, bow]) {
    assert.equal(service.updatePlayerPosition(account.session.token, {
      mapId: "firebud_training_yard",
      cellX: 25,
      cellY: 25,
      facing: "east",
      moving: false,
    }).ok, true);
  }
  const partyInvite = service.inviteToParty(fast.session.token, {username: bow.account.username});
  assert.equal(partyInvite.ok, true);
  assert.equal(service.acceptPartyInvite(bow.session.token, partyInvite.invite.inviteId).ok, true);
  const encounter = service.startPartyEncounter(fast.session.token, {
    enemyCount: 1,
    encounterZone: {
      id: "shadow_bow_combo_fixture",
      name: "合击靶场",
      formationTemplate: "10v10",
      selectedWildPet: {
        formId: "wuli_normal_orange_fire10",
        name: "合击木桩",
        level: 140,
        battleStats: {maxHp: 1000, attack: 1, defense: 20, quick: 1},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const target = encounter.room.battle.actors.find((entry) => entry.side === "enemy");
  const fastActor = encounter.room.battle.actors.find((entry) => entry.accountId === fast.account.accountId && entry.kind === "player");
  const bowActor = encounter.room.battle.actors.find((entry) => entry.accountId === bow.account.accountId && entry.kind === "player");
  assert.equal(service.submitBattleCommand(fast.session.token, encounter.room.roomId, {
    round: 1,
    actorId: fastActor.actorId,
    actionId: "attack",
    targetActorId: target.actorId,
  }).turn, null);
  const resolved = service.submitBattleCommand(bow.session.token, encounter.room.roomId, {
    round: 1,
    actorId: bowActor.actorId,
    actionId: "attack",
    targetActorId: target.actorId,
  });
  assert.equal(resolved.ok, true);
  const playerEvents = resolved.turn.events.filter((event) => (
    event.actorAccountId === fast.account.accountId || event.actorAccountId === bow.account.accountId
  ));
  assert.equal(playerEvents.some((event) => event.eventType === "combo_attack"), false);
  assert.equal(playerEvents.some((event) => event.eventType === "basic_attack" && event.actorAccountId === fast.account.accountId), true);
  assert.equal(playerEvents.some((event) => event.eventType === "multi_attack" && event.actorAccountId === bow.account.accountId), true);
});
