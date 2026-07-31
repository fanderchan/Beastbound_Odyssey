"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
} = require("../test-support/auth-service-test-context");
const {
  __battleCharacterAuthorityForTest,
} = require("../src/auth-service");

function mismatchedBattleCharacterFixture() {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({
    username: "battlecharsafe",
    password: "test1234",
    displayName: "参战甲",
  });
  assert.equal(registered.ok, true);
  const created = service.createCharacter(registered.session.token, {
    appearanceId: "novice_hunter_v1",
    slotIndex: 1,
    displayName: "参战乙",
    elements: {earth: 6, water: 4, fire: 0, wind: 0},
  });
  assert.equal(created.ok, true);

  const data = service.snapshot();
  const accountId = registered.account.accountId;
  const participantPlayerId = registered.profileBinding.playerId;
  const activePlayerId = created.character.playerId;
  const activeProfile = data.profiles[activePlayerId];
  data.profileBindings[accountId] = {
    ...data.profileBindings[accountId],
    playerId: activePlayerId,
    profileRevision: activeProfile.profileRevision,
  };
  const participant = {
    accountId,
    username: registered.account.username,
    displayName: registered.account.displayName,
    side: "ally",
    profileSummary: {
      playerId: participantPlayerId,
      profileRevision: data.profiles[participantPlayerId].profileRevision,
    },
    teamSnapshot: {
      player: {hp: 80, maxHp: 100},
      battlePets: [],
      battleItemBag: {},
      captureToolBag: {},
    },
    schemaVersion: 1,
  };
  const room = {
    roomId: "room_battle_character_authority",
    participantAccountIds: [accountId],
    participants: [participant],
    departedParticipantsByAccountId: {},
    schemaVersion: 1,
  };
  return {
    accountId,
    activePlayerId,
    battle: {actors: [], captureCandidatesByActorId: {}},
    data,
    participantPlayerId,
    room,
  };
}

test("battle writeback uses the participant player snapshot and skips a changed active binding", () => {
  const fixture = mismatchedBattleCharacterFixture();
  const profilesBefore = structuredClone(fixture.data.profiles);
  const writeback = __battleCharacterAuthorityForTest.applyBattleRoomProfileWriteback(
    fixture.data,
    fixture.room,
    fixture.battle,
    {
      reason: "victory",
      endedAt: "2026-07-31T10:00:00.000Z",
    },
    () => Date.parse("2026-07-31T10:00:00.000Z"),
  );

  assert.equal(
    __battleCharacterAuthorityForTest.battleSettlementPlayerIdForAccount(
      fixture.room,
      fixture.accountId,
    ),
    fixture.participantPlayerId,
  );
  assert.deepEqual(writeback.profiles, []);
  assert.deepEqual(writeback.skippedProfiles, [{
    accountId: fixture.accountId,
    playerId: fixture.activePlayerId,
    expectedPlayerId: fixture.participantPlayerId,
    reason: "character_selection_stale",
  }]);
  assert.deepEqual(fixture.data.profiles, profilesBefore);
});

test("battle capture capacity and shelter settlement fail closed after a binding switch", () => {
  const fixture = mismatchedBattleCharacterFixture();
  const capacity = __battleCharacterAuthorityForTest.battleCaptureCapacityCheck(
    fixture.data,
    fixture.room,
    fixture.battle,
    fixture.accountId,
  );
  assert.equal(capacity.ok, false);
  assert.equal(capacity.code, "battle_capture_character_stale");

  fixture.battle.captureCandidatesByActorId.wild_pet_1 = {
    actorId: "wild_pet_1",
    status: "claimed",
    claimedByAccountId: fixture.accountId,
    pet: {instanceId: "captured_pet_1"},
  };
  const settlement = __battleCharacterAuthorityForTest.preflightBattleCaptureShelterSettlement(
    fixture.data,
    fixture.room,
    fixture.battle,
  );
  assert.equal(settlement.ok, false);
  assert.equal(settlement.code, "battle_capture_settlement_character_stale");
  assert.equal(settlement.details.expectedPlayerId, fixture.participantPlayerId);
});
