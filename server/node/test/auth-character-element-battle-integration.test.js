"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
  internalProfileForAccount,
} = require("../test-support/auth-service-test-context");

const EARTH_CHARACTER_ELEMENTS = Object.freeze({earth: 10, water: 0, fire: 0, wind: 0});
const WATER_CHARACTER_ELEMENTS = Object.freeze({earth: 0, water: 10, fire: 0, wind: 0});

function createSelectedCharacter(service, {username, displayName, elements}) {
  const registered = service.register({
    username,
    password: "test1234",
    displayName: `${displayName}账号`,
  });
  assert.equal(registered.ok, true);
  assert.equal(registered.selectionRequired, true);

  const created = service.createCharacter(registered.session.token, {
    slotIndex: 0,
    appearanceId: "novice_hunter_v1",
    displayName,
    elements: {...elements},
  });
  assert.equal(created.ok, true);
  assert.deepEqual(created.character.elements, elements);

  const selected = service.selectCharacter(registered.session.token, {slotIndex: 0});
  assert.equal(selected.ok, true);
  assert.equal(selected.selectionRequired, false);
  return {
    account: registered.account,
    character: selected.selectedCharacter,
    token: selected.session.token,
  };
}

test("created character elements enter real duel actors and damage events", () => {
  const service = createAuthService({
    autoCreateInitialCharacterForTests: false,
    store: createMemoryAuthStore(),
  });
  const attacker = createSelectedCharacter(service, {
    username: "elementduela",
    displayName: "地系猎人",
    elements: EARTH_CHARACTER_ELEMENTS,
  });
  const target = createSelectedCharacter(service, {
    username: "elementduelb",
    displayName: "水系猎人",
    elements: WATER_CHARACTER_ELEMENTS,
  });

  assert.equal(service.updatePlayerPosition(attacker.token, {
    mapId: "firebud_training_yard",
    cellX: 10,
    cellY: 10,
    facing: "east",
    moving: false,
  }).ok, true);
  assert.equal(service.updatePlayerPosition(target.token, {
    mapId: "firebud_training_yard",
    cellX: 11,
    cellY: 10,
    facing: "west",
    moving: false,
  }).ok, true);

  const invited = service.inviteToBattle(attacker.token, {username: target.account.username});
  assert.equal(invited.ok, true);
  const accepted = service.acceptBattleInvite(target.token, invited.invite.inviteId);
  assert.equal(accepted.ok, true);

  const attackerActor = accepted.room.battle.actors.find((actor) => (
    actor.accountId === attacker.account.accountId && actor.kind === "player"
  ));
  const targetActor = accepted.room.battle.actors.find((actor) => (
    actor.accountId === target.account.accountId && actor.kind === "player"
  ));
  assert.ok(attackerActor);
  assert.ok(targetActor);
  assert.deepEqual(attackerActor.elements, EARTH_CHARACTER_ELEMENTS);
  assert.deepEqual(targetActor.elements, WATER_CHARACTER_ELEMENTS);

  const submittedAttack = service.submitBattleCommand(attacker.token, accepted.room.roomId, {
    round: 1,
    actorId: attackerActor.actorId,
    actionId: "attack",
    targetActorId: targetActor.actorId,
  });
  assert.equal(submittedAttack.ok, true);
  assert.equal(submittedAttack.turn, null);
  const resolved = service.submitBattleCommand(target.token, accepted.room.roomId, {
    round: 1,
    actorId: targetActor.actorId,
    actionId: "defend",
  });
  assert.equal(resolved.ok, true);
  assert.ok(resolved.turn);

  const attackEvent = resolved.turn.events.find((event) => (
    event.eventType === "basic_attack"
    && event.actorId === attackerActor.actorId
    && event.targetActorId === targetActor.actorId
  ));
  assert.ok(attackEvent);
  assert.equal(attackEvent.dodged, false);
  assert.deepEqual(attackEvent.attackerElements, EARTH_CHARACTER_ELEMENTS);
  assert.deepEqual(attackEvent.targetElements, WATER_CHARACTER_ELEMENTS);
  assert.equal(Number.isFinite(attackEvent.damageBeforeElement), true);
  assert.equal(attackEvent.damageBeforeElement > 0, true);
  assert.equal(Number.isFinite(attackEvent.elementMultiplier), true);
  assert.equal(attackEvent.elementMultiplier > 1, true);
  assert.equal(
    attackEvent.damage,
    Math.round(attackEvent.damageBeforeElement * attackEvent.elementMultiplier),
  );
});

test("legacy characters without elements cannot create a battle invite", () => {
  const service = createAuthService({
    initialCharacterElementsForTests: null,
    store: createMemoryAuthStore(),
  });
  const legacy = service.register({
    username: "legacyelementa",
    password: "test1234",
    displayName: "旧角色甲",
  });
  const opponent = service.register({
    username: "legacyelementb",
    password: "test1234",
    displayName: "旧角色乙",
  });
  assert.equal(legacy.ok, true);
  assert.equal(opponent.ok, true);

  const legacyProfile = internalProfileForAccount(service, legacy.account.accountId);
  assert.equal(Object.hasOwn(legacyProfile.player, "elements"), false);
  const blocked = service.inviteToBattle(legacy.session.token, {username: opponent.account.username});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "player_elements_required");
  assert.deepEqual(service.snapshot().battleInvites, {});
});

test("legacy characters remain visible to party UI while encounter admission stays closed", () => {
  const service = createAuthService({
    initialCharacterElementsForTests: null,
    store: createMemoryAuthStore(),
  });
  const leader = service.register({
    username: "legacyelementparty_a",
    password: "test1234",
    displayName: "旧队长",
  });
  const member = service.register({
    username: "legacyelementparty_b",
    password: "test1234",
    displayName: "旧队员",
  });
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);

  const invite = service.inviteToParty(leader.session.token, {username: member.account.username});
  assert.equal(invite.ok, true);
  const accepted = service.acceptPartyInvite(member.session.token, invite.invite.inviteId);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.party.members.length, 2);
  for (const partyMember of accepted.party.members) {
    assert.equal(partyMember.teamSnapshot.player.needsElementAllocation, true);
    assert.deepEqual(partyMember.teamSnapshot.player.elements, {});
  }

  const blocked = service.startPartyEncounter(leader.session.token, {enemyCount: 1});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "player_elements_required");
  assert.deepEqual(service.snapshot().battleRooms, {});
});
