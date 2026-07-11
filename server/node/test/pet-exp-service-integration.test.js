"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
  internalProfileForAccount,
  profileItemCount,
  battleProfile,
} = require("../test-support/auth-service-test-context");
const {loadPetGrowthCatalog} = require("../src/auth/pet-growth-catalog");
const {initializePetGrowth, validatePetGrowth} = require("../src/auth/pet-growth-runtime");

const PET_EXP_ITEM_ID = "item_pet_exp_pill_lv131";
const PRIVATE_SEED = `bps1_${"A".repeat(43)}`;
const PRIVATE_RESPONSE_KEYS = new Set([
  "private",
  "privateSeed",
  "privateRoll",
  "continuousStats",
  "cultivation",
  "individualSeed",
  "individualVariance",
  "growthSpeciesSeed",
  "growthSpeciesRoll",
]);

function petStats(pet) {
  return {
    maxHp: pet.maxHp,
    attack: pet.attack,
    defense: pet.defense,
    quick: pet.quick,
  };
}

function firstPrivatePath(value, prefix = "") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = firstPrivatePath(value[index], `${prefix}[${index}]`);
      if (found) return found;
    }
    return "";
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  for (const [key, nested] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (PRIVATE_RESPONSE_KEYS.has(key)) {
      return path;
    }
    const found = firstPrivatePath(nested, path);
    if (found) return found;
  }
  return "";
}

function legacyPet(instanceId = "legacy_exp_pet") {
  return {
    instanceId,
    petId: instanceId,
    formId: "bui_normal_red_fire10",
    templateId: "bui_normal_red_fire10",
    name: "经验布伊",
    state: "battle",
    level: 1,
    exp: 0,
    nextExp: 122,
    hp: 90,
    maxHp: 90,
    attack: 22,
    defense: 6,
    quick: 89,
    activeSkillIds: ["pet_attack", "pet_defend"],
    petSkillSlots: ["pet_attack", "pet_defend", "", "", "", "", ""],
    passiveSkillIds: [],
  };
}

function authorityPet(instanceId = "authority_exp_pet") {
  const catalog = loadPetGrowthCatalog();
  const growthProfile = catalog.requireProfileById("blue_man_dragon_v1");
  const source = {
    instanceId,
    petId: instanceId,
    formId: growthProfile.formId,
    templateId: growthProfile.formId,
    growthSpeciesProfileId: growthProfile.profileId,
    name: "权威成长蓝人龙",
    state: "battle",
    level: 1,
    exp: 0,
    nextExp: 122,
    hp: growthProfile.outputBase.maxHp,
    maxHp: growthProfile.outputBase.maxHp,
    attack: growthProfile.outputBase.attack,
    defense: growthProfile.outputBase.defense,
    quick: growthProfile.outputBase.quick,
    activeSkillIds: ["pet_attack", "pet_defend"],
    petSkillSlots: ["pet_attack", "pet_defend", "", "", "", "", ""],
    passiveSkillIds: [],
  };
  return initializePetGrowth(source, growthProfile, {privateSeed: PRIVATE_SEED}).pet;
}

function profileWithPet(displayName, pet) {
  return {
    player: {
      name: displayName,
      level: 1,
      hp: 120,
      maxHp: 120,
      baseStats: {maxHp: 120, attack: 18, defense: 6, quick: 70},
    },
    activePetInstanceId: pet.instanceId,
    petInstances: [pet],
    backpackSlots: [{itemId: PET_EXP_ITEM_ID, count: 1}],
  };
}

function seededProductionService(username, displayName, profile) {
  const store = createMemoryAuthStore();
  const bootstrap = createAuthService({store});
  const account = bootstrap.register({username, password: "test1234", displayName});
  assert.equal(account.ok, true);
  const saved = bootstrap.saveProfile(account.session.token, {expectedRevision: 0, profile});
  assert.equal(saved.ok, true);
  return {
    account,
    service: createAuthService({store, allowFullProfileSave: false}),
  };
}

test("world pet EXP item uses the dispatcher and preserves legacy pet stats", () => {
  const pet = legacyPet();
  const {account, service} = seededProductionService(
    "petexplegacy",
    "旧成长玩家",
    profileWithPet("旧成长玩家", pet),
  );
  const before = internalProfileForAccount(service, account.account.accountId);
  const beforeRevision = service.snapshot().profileBindings[account.account.accountId].profileRevision;

  const result = service.profileAction(account.session.token, {
    action: "world_item_use",
    payload: {itemId: PET_EXP_ITEM_ID, instanceId: pet.instanceId},
  });

  assert.equal(result.ok, true);
  assert.equal(result.profileBinding.profileRevision, beforeRevision + 1);
  assert.equal(profileItemCount(result.profile, PET_EXP_ITEM_ID), 0);
  const after = internalProfileForAccount(service, account.account.accountId);
  const afterPet = after.petInstances.find((entry) => entry.instanceId === pet.instanceId);
  assert.equal(afterPet.level, 131);
  assert.equal(afterPet.exp, 0);
  assert.equal(afterPet.nextExp > 0, true);
  assert.deepEqual(petStats(afterPet), petStats(before.petInstances[0]));
  assert.equal(profileItemCount(after, PET_EXP_ITEM_ID), 0);
});

test("production service settles authority-v1 EXP items without exposing private growth", () => {
  const pet = authorityPet();
  const {account, service} = seededProductionService(
    "petexpvone",
    "新版成长玩家",
    profileWithPet("新版成长玩家", pet),
  );
  const accountId = account.account.accountId;
  const before = internalProfileForAccount(service, accountId);
  const beforeRevision = service.snapshot().profileBindings[accountId].profileRevision;

  const result = service.profileAction(account.session.token, {
    action: "world_item_use",
    payload: {itemId: PET_EXP_ITEM_ID, instanceId: pet.instanceId},
  });

  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(result).includes(PRIVATE_SEED), false);
  assert.equal(JSON.stringify(result).includes("continuousStats"), false);
  assert.equal(firstPrivatePath(result), "");
  assert.equal(service.snapshot().profileBindings[accountId].profileRevision, beforeRevision + 1);
  assert.equal(profileItemCount(result.profile, PET_EXP_ITEM_ID), 0);
  const after = internalProfileForAccount(service, accountId);
  const afterPet = after.petInstances.find((entry) => entry.instanceId === pet.instanceId);
  assert.equal(afterPet.level, 131);
  assert.equal(afterPet.petGrowth.settledLevel, 131);
  assert.equal(afterPet.petGrowth.private.privateSeed, PRIVATE_SEED);
  assert.equal(validatePetGrowth(afterPet, loadPetGrowthCatalog().requireProfileById("blue_man_dragon_v1")).ok, true);
  assert.equal(profileItemCount(after, PET_EXP_ITEM_ID), 0);
  assert.equal(profileItemCount(before, PET_EXP_ITEM_ID), 1);
});

test("damaged authority-v1 state fails closed before consuming an EXP item", () => {
  const pet = authorityPet("damaged_authority_exp_pet");
  pet.attack += 1;
  const {account, service} = seededProductionService(
    "petexpdamaged",
    "损坏成长玩家",
    profileWithPet("损坏成长玩家", pet),
  );
  const accountId = account.account.accountId;
  const before = internalProfileForAccount(service, accountId);
  const beforeRevision = service.snapshot().profileBindings[accountId].profileRevision;

  const result = service.profileAction(account.session.token, {
    action: "world_item_use",
    payload: {itemId: PET_EXP_ITEM_ID, instanceId: pet.instanceId},
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "pet_growth_state_invalid");
  assert.equal(firstPrivatePath(result), "");
  assert.equal(JSON.stringify(result).includes(PRIVATE_SEED), false);
  assert.equal(service.snapshot().profileBindings[accountId].profileRevision, beforeRevision);
  assert.deepEqual(internalProfileForAccount(service, accountId), before);
  assert.equal(profileItemCount(before, PET_EXP_ITEM_ID), 1);
});

test("a solo authority-v1 battle pet receives deterministic server growth without leaking", () => {
  const pet = authorityPet("solo_authority_battle_pet");
  const {account, service} = seededProductionService(
    "petexpsolovone",
    "单人新版成长",
    profileWithPet("单人新版成长", pet),
  );
  assert.equal(service.updatePlayerPosition(account.session.token, {
    mapId: "firebud_training_yard",
    cellX: 18,
    cellY: 18,
    facing: "east",
    moving: false,
  }).ok, true);
  const encounter = service.startPartyEncounter(account.session.token, {
    enemyCount: 1,
    encounterZone: {
      id: "solo_authority_growth_grass",
      name: "单人成长草丛",
      selectedWildPet: {
        formId: "wuli_normal_orange_fire10",
        name: "成长木桩",
        level: 1,
        expReward: 122,
        battleStats: {maxHp: 1, attack: 1, defense: 1, quick: 1},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const playerActor = encounter.room.battle.actors.find((actor) => actor.kind === "player");
  const petActor = encounter.room.battle.actors.find((actor) => actor.kind === "pet");
  const enemy = encounter.room.battle.actors.find((actor) => actor.side === "enemy");
  assert.equal(service.submitBattleCommand(account.session.token, encounter.room.roomId, {
    round: 1,
    actorId: playerActor.actorId,
    actionId: "defend",
  }).turn, null);
  const resolved = service.submitBattleCommand(account.session.token, encounter.room.roomId, {
    round: 1,
    actorId: petActor.actorId,
    actionId: "pet_attack",
    targetActorId: enemy.actorId,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.room.status, "closed");
  assert.equal(firstPrivatePath(resolved), "");
  const internalPet = internalProfileForAccount(service, account.account.accountId).petInstances[0];
  assert.equal(internalPet.level > 1 || Number(internalPet.exp || 0) > 0, true);
  assert.equal(internalPet.petGrowth.private.privateSeed, PRIVATE_SEED);
  assert.equal(validatePetGrowth(internalPet, loadPetGrowthCatalog().requireProfileById("blue_man_dragon_v1")).ok, true);
});

test("authority-v1, legacy, riding, and partner pets share one successful battle EXP settlement", () => {
  const store = createMemoryAuthStore();
  const bootstrap = createAuthService({store});
  const leader = bootstrap.register({
    username: "petexpbattleone",
    password: "test1234",
    displayName: "经验预检队长",
  });
  const member = bootstrap.register({
    username: "petexpbattletwo",
    password: "test1234",
    displayName: "经验预检队员",
  });
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);

  const leaderProfile = battleProfile("经验预检队长", {
    level: 1,
    hp: 120,
    maxHp: 120,
    attack: 24,
    defense: 8,
    quick: 1,
    comboRateOverride: 0,
  }, {
    petId: "preflight_legacy_pet",
    formId: "bui_normal_red_fire10",
    name: "预检红布伊",
    level: 1,
    hp: 90,
    maxHp: 90,
    attack: 999,
    defense: 6,
    quick: 2,
    comboRateOverride: 0,
  });
  leaderProfile.ridePetInstanceId = "preflight_ride_pet";
  leaderProfile.petInstances.push({
    ...legacyPet("preflight_ride_pet"),
    formId: "bui_normal_yellow_wind10",
    templateId: "bui_normal_yellow_wind10",
    name: "预检骑宠",
    state: "riding",
    quick: 72,
  });
  leaderProfile.trainingPartners = [{
    partnerId: "preflight_partner",
    name: "预检伙伴",
    level: 1,
    exp: 0,
    hp: 120,
    maxHp: 120,
    attack: 18,
    defense: 6,
    quick: 1,
    pet: {
      petId: "preflight_partner_pet",
      name: "预检伙伴宠",
      level: 1,
      exp: 0,
      hp: 90,
      maxHp: 90,
      attack: 18,
      defense: 6,
      quick: 1,
      activeSkillIds: ["pet_attack", "pet_defend"],
      petSkillSlots: ["pet_attack", "pet_defend", "", "", "", "", ""],
    },
  }];

  const memberPet = authorityPet("preflight_authority_pet");
  const memberProfile = battleProfile("经验预检队员", {
    level: 1,
    hp: 120,
    maxHp: 120,
    attack: 18,
    defense: 8,
    quick: 60,
    comboRateOverride: 0,
  }, null);
  memberProfile.activePetInstanceId = memberPet.instanceId;
  memberProfile.petInstances = [memberPet];

  assert.equal(bootstrap.saveProfile(leader.session.token, {
    expectedRevision: 0,
    profile: leaderProfile,
  }).ok, true);
  assert.equal(bootstrap.saveProfile(member.session.token, {
    expectedRevision: 0,
    profile: memberProfile,
  }).ok, true);

  const service = createAuthService({store, allowFullProfileSave: false});
  assert.equal(service.updatePlayerPosition(leader.session.token, {
    mapId: "firebud_training_yard",
    cellX: 18,
    cellY: 18,
    facing: "east",
    moving: false,
  }).ok, true);
  assert.equal(service.updatePlayerPosition(member.session.token, {
    mapId: "firebud_training_yard",
    cellX: 18,
    cellY: 18,
    facing: "east",
    moving: false,
  }).ok, true);
  const invite = service.inviteToParty(leader.session.token, {username: member.account.username});
  assert.equal(invite.ok, true);
  assert.equal(service.acceptPartyInvite(member.session.token, invite.invite.inviteId).ok, true);

  const encounter = service.startPartyEncounter(leader.session.token, {
    enemyCount: 5,
    encounterZone: {
      id: "pet_exp_preflight_grass",
      name: "成长预检草丛",
      selectedWildPet: {
        formId: "wuli_normal_orange_fire10",
        name: "成长预检木桩",
        level: 1,
        expReward: 122,
        battleStats: {maxHp: 1, attack: 1, defense: 1, quick: 1},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const actors = encounter.room.battle.actors;
  const leaderPlayer = actors.find((actor) => actor.username === leader.account.username && actor.kind === "player");
  const leaderPetActor = actors.find((actor) => actor.username === leader.account.username && actor.kind === "pet");
  const memberPlayer = actors.find((actor) => actor.username === member.account.username && actor.kind === "player");
  const memberPetActor = actors.find((actor) => actor.username === member.account.username && actor.kind === "pet");
  assert.equal(Boolean(leaderPlayer && leaderPetActor && memberPlayer && memberPetActor), true);

  let resolved = null;
  let currentRoom = encounter.room;
  for (let attempt = 0; attempt < 10 && currentRoom.status !== "closed"; attempt += 1) {
    const round = currentRoom.battle.round;
    const enemies = currentRoom.battle.actors.filter((actor) => actor.side === "enemy" && actor.hp > 0 && !actor.defeated);
    assert.equal(enemies.length > 0, true);
    const commands = [
      [leader.session.token, leaderPlayer.actorId, "attack"],
      [leader.session.token, leaderPetActor.actorId, "pet_attack"],
      [member.session.token, memberPlayer.actorId, "defend"],
      [member.session.token, memberPetActor.actorId, "pet_attack"],
    ];
    for (let commandIndex = 0; commandIndex < commands.length; commandIndex += 1) {
      const [token, actorId, actionId] = commands[commandIndex];
      const target = enemies[Math.min(commandIndex, enemies.length - 1)];
      const command = {
        round,
        actorId,
        actionId,
      };
      if (actionId === "attack" || actionId === "pet_attack") {
        command.targetActorId = target.actorId;
      }
      resolved = service.submitBattleCommand(token, encounter.room.roomId, command);
      assert.equal(resolved.ok, true);
    }
    currentRoom = resolved.room;
  }
  assert.equal(resolved.ok, true);
  assert.equal(resolved.room.status, "closed");
  assert.equal(firstPrivatePath(resolved), "");
  assert.equal(JSON.stringify(resolved).includes(PRIVATE_SEED), false);

  const storedRoom = service.snapshot().battleRooms[encounter.room.roomId];
  const recipients = storedRoom.battle.expCredits.flatMap((credit) => credit.recipients || []);
  assert.deepEqual(
    Array.from(new Set(recipients.map((entry) => entry.type))).sort(),
    ["pet", "player", "ride_pet", "training_partner_pet", "training_partner_player"].sort(),
  );
  const writebacks = storedRoom.battle.profileWriteback.profiles;
  assert.equal(writebacks.length, 2);
  for (const writeback of writebacks) {
    assert.equal(Boolean(writeback.exp.failed), false);
    assert.equal(String(writeback.exp.code || ""), "");
    assert.equal(writeback.exp.amount > 0, true);
    assert.equal(writeback.exp.baseAmount > 0, true);
    assert.equal(writeback.exp.killCount > 0, true);
    assert.equal(Boolean(writeback.exp.player), true);
  }
  const leaderWriteback = writebacks.find((entry) => entry.accountId === leader.account.accountId);
  const memberWriteback = writebacks.find((entry) => entry.accountId === member.account.accountId);
  assert.equal(leaderWriteback.exp.pets.length, 1);
  assert.equal(leaderWriteback.exp.ridePets.length, 1);
  assert.equal(leaderWriteback.exp.trainingPartners.length, 1);
  assert.equal(memberWriteback.exp.pets.length, 1);
  assert.equal(firstPrivatePath(storedRoom.battle.profileWriteback), "");
  assert.equal(JSON.stringify(storedRoom.battle.profileWriteback).includes(PRIVATE_SEED), false);
  const record = service.snapshot().battleRecords.find((entry) => (
    entry.recordId === storedRoom.battle.result.battleRecordId
  ));
  assert.equal(Boolean(record), true);
  assert.equal(record.expSummaries.length, 2);
  for (const expSummary of record.expSummaries) {
    assert.equal(expSummary.amount > 0, true);
    assert.equal(expSummary.baseAmount > 0, true);
    assert.equal(expSummary.killCount > 0, true);
    assert.equal(expSummary.failed, false);
    assert.equal(expSummary.code, "");
  }

  const leaderAfter = internalProfileForAccount(service, leader.account.accountId);
  const memberAfter = internalProfileForAccount(service, member.account.accountId);
  assert.equal(leaderAfter.player.level > 1 || Number(leaderAfter.player.exp || 0) > 0, true);
  const leaderBattlePet = leaderAfter.petInstances.find((pet) => pet.instanceId === "preflight_legacy_pet");
  const leaderRidePet = leaderAfter.petInstances.find((pet) => pet.instanceId === "preflight_ride_pet");
  assert.equal(leaderBattlePet.level > 1 || Number(leaderBattlePet.exp || 0) > 0, true);
  assert.equal(leaderRidePet.level > 1 || Number(leaderRidePet.exp || 0) > 0, true);
  assert.equal(leaderAfter.trainingPartners[0].level > 1 || Number(leaderAfter.trainingPartners[0].exp || 0) > 0, true);
  assert.equal(leaderAfter.trainingPartners[0].pet.level > 1 || Number(leaderAfter.trainingPartners[0].pet.exp || 0) > 0, true);
  assert.equal(memberAfter.petInstances[0].petGrowth.private.privateSeed, PRIVATE_SEED);
  assert.equal(validatePetGrowth(memberAfter.petInstances[0], loadPetGrowthCatalog().requireProfileById("blue_man_dragon_v1")).ok, true);
});
