"use strict";

const {
  assert,
  once,
  test,
  createAuthService,
  createHttpServer,
  createMemoryAuthStore,
  fetchJson,
  internalProfileForPlayer,
} = require("../test-support/auth-service-test-context");

const TEST_CHARACTER_ELEMENTS = Object.freeze({earth: 6, water: 4, fire: 0, wind: 0});

function characterCreationPayload(displayName, slotIndex) {
  const payload = {
    appearanceId: "novice_hunter_v1",
    displayName,
    elements: {...TEST_CHARACTER_ELEMENTS},
  };
  if (slotIndex !== undefined) {
    payload.slotIndex = slotIndex;
  }
  return payload;
}

test("new accounts begin with four empty slots and create one complete authoritative character", () => {
  const store = createMemoryAuthStore();
  const service = createAuthService({
    autoCreateInitialCharacterForTests: false,
    store,
  });
  const registered = service.register({
    username: "characterzero",
    password: "test1234",
    displayName: "账号称呼",
  });
  assert.equal(registered.ok, true);
  assert.equal(registered.selectionRequired, true);
  assert.equal(registered.session.playerId, undefined);
  assert.equal(registered.profileBinding, null);
  assert.equal(registered.profileSummary, null);
  assert.equal(registered.selectedCharacter, null);
  assert.deepEqual(registered.characters.map((entry) => entry.occupied), [false, false, false, false]);
  const emptySnapshot = service.snapshot();
  assert.equal(emptySnapshot.accounts.characterzero.characterSlotsInitialized, true);
  assert.deepEqual(emptySnapshot.accountCharacterSlots[registered.account.accountId], [null, null, null, null]);
  assert.deepEqual(emptySnapshot.profileBindings, {});
  assert.deepEqual(emptySnapshot.profiles, {});

  const refreshed = service.refreshSession(registered.session.token);
  assert.equal(refreshed.ok, true);
  assert.equal(refreshed.selectionRequired, true);
  assert.deepEqual(refreshed.characters.map((entry) => entry.occupied), [false, false, false, false]);
  assert.deepEqual(service.snapshot().profiles, {});

  const persistedWithoutSlotRows = service.snapshot();
  delete persistedWithoutSlotRows.accountCharacterSlots[registered.account.accountId];
  const restarted = createAuthService({
    autoCreateInitialCharacterForTests: false,
    store: createMemoryAuthStore(persistedWithoutSlotRows),
  });
  const login = restarted.login({username: "characterzero", password: "test1234"});
  assert.equal(login.ok, true);
  assert.equal(login.selectionRequired, true);
  assert.deepEqual(login.characters.map((entry) => entry.occupied), [false, false, false, false]);
  assert.deepEqual(restarted.snapshot().profiles, {});

  const missingAppearance = restarted.createCharacter(login.session.token, {
    displayName: "完整角色",
    elements: {...TEST_CHARACTER_ELEMENTS},
  });
  assert.equal(missingAppearance.code, "character_appearance_invalid");
  const invalidAppearance = restarted.createCharacter(login.session.token, {
    ...characterCreationPayload("完整角色", 0),
    appearanceId: "unlisted_character_v1",
  });
  assert.equal(invalidAppearance.code, "character_appearance_invalid");
  const invalidTotal = restarted.createCharacter(login.session.token, {
    ...characterCreationPayload("完整角色", 0),
    elements: {earth: 3, water: 3, fire: 0, wind: 0},
  });
  assert.equal(invalidTotal.code, "character_elements_total_invalid");
  const tooMany = restarted.createCharacter(login.session.token, {
    ...characterCreationPayload("完整角色", 0),
    elements: {earth: 4, water: 3, fire: 0, wind: 3},
  });
  assert.equal(tooMany.code, "character_elements_affinity_limit");
  const earthFireConflict = restarted.createCharacter(login.session.token, {
    ...characterCreationPayload("完整角色", 0),
    elements: {earth: 5, water: 0, fire: 5, wind: 0},
  });
  assert.equal(earthFireConflict.code, "character_elements_conflict");
  const waterWindConflict = restarted.createCharacter(login.session.token, {
    ...characterCreationPayload("完整角色", 0),
    elements: {earth: 0, water: 5, fire: 0, wind: 5},
  });
  assert.equal(waterWindConflict.code, "character_elements_conflict");

  const created = restarted.createCharacter(login.session.token, {
    ...characterCreationPayload("完整角色", 0),
    appearanceId: "obsidian_scout_v1",
  });
  assert.equal(created.ok, true);
  assert.equal(created.selectionRequired, true);
  assert.equal(created.selectedCharacter, null);
  assert.equal(created.character.appearanceId, "obsidian_scout_v1");
  assert.deepEqual(created.character.elements, TEST_CHARACTER_ELEMENTS);
  assert.equal(created.character.needsElementAllocation, false);
  const profile = internalProfileForPlayer(
    restarted,
    registered.account.accountId,
    created.character.playerId,
  );
  assert.equal(profile.player.name, "完整角色");
  assert.equal(profile.player.appearanceId, "obsidian_scout_v1");
  assert.deepEqual(profile.player.elements, TEST_CHARACTER_ELEMENTS);
  const selected = restarted.selectCharacter(login.session.token, {slotIndex: 0});
  assert.equal(selected.ok, true);
  assert.equal(selected.session.playerId, created.character.playerId);
  const selectedProfile = restarted.getProfile(selected.session.token);
  assert.equal(selectedProfile.ok, true);
  assert.equal(selectedProfile.profile.player.appearanceId, "obsidian_scout_v1");
  assert.deepEqual(selectedProfile.profile.player.elements, TEST_CHARACTER_ELEMENTS);
});

test("legacy characters map to the default appearance and receive elements exactly once", () => {
  const service = createAuthService({
    initialCharacterElementsForTests: null,
    store: createMemoryAuthStore(),
  });
  const registered = service.register({
    username: "charlegacyalloc",
    password: "test1234",
    displayName: "旧配点角色",
  });
  const legacyProfile = service.snapshot().profiles[registered.profileBinding.playerId].profile;
  assert.equal(Object.hasOwn(legacyProfile.player, "elements"), false);
  const listed = service.listCharacters(registered.session.token);
  assert.equal(listed.ok, true);
  assert.equal(listed.characters[0].appearanceId, "novice_hunter_v1");
  assert.equal(listed.characters[0].elements, null);
  assert.equal(listed.characters[0].needsElementAllocation, true);

  const invalid = service.allocateCharacterElements(registered.session.token, {
    elements: {earth: 5, water: 0, fire: 5, wind: 0},
  });
  assert.equal(invalid.code, "character_elements_conflict");
  const beforeRevision = registered.profileBinding.profileRevision;
  const allocated = service.allocateCharacterElements(registered.session.token, {
    elements: {earth: 0, water: 7, fire: 3, wind: 0},
  });
  assert.equal(allocated.ok, true);
  assert.equal(allocated.profileBinding.profileRevision, beforeRevision + 1);
  assert.deepEqual(allocated.character.elements, {earth: 0, water: 7, fire: 3, wind: 0});
  assert.equal(allocated.character.needsElementAllocation, false);
  const repeated = service.allocateCharacterElements(registered.session.token, {
    elements: {...TEST_CHARACTER_ELEMENTS},
  });
  assert.equal(repeated.ok, false);
  assert.equal(repeated.code, "character_elements_already_allocated");
  assert.deepEqual(
    internalProfileForPlayer(service, registered.account.accountId, registered.profileBinding.playerId).player.elements,
    {earth: 0, water: 7, fire: 3, wind: 0},
  );
});

test("legacy single profile becomes slot zero without changing its identity or assets", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const registered = seedService.register({
    username: "characterlegacy",
    password: "test1234",
    displayName: "旧角色",
  });
  assert.equal(registered.ok, true);
  const originalPlayerId = registered.profileBinding.playerId;
  const original = seedService.getProfile(registered.session.token);
  const profile = structuredClone(original.profile);
  profile.stoneCoins = 987;
  const saved = seedService.saveProfile(registered.session.token, {
    expectedRevision: original.profileSummary.profileRevision,
    profile,
  });
  assert.equal(saved.ok, true);

  const legacySnapshot = seedService.snapshot();
  delete legacySnapshot.accountCharacterSlots;
  const service = createAuthService({store: createMemoryAuthStore(legacySnapshot)});
  const login = service.login({username: "characterlegacy", password: "test1234"});
  assert.equal(login.ok, true);
  assert.equal(login.selectionRequired, false);
  assert.equal(login.session.playerId, originalPlayerId);
  assert.equal(login.session.slotIndex, 0);
  assert.equal(login.characters.length, 4);
  assert.equal(login.characters[0].playerId, originalPlayerId);
  assert.equal(login.characters[0].displayName, "旧角色");
  assert.deepEqual(login.characters.slice(1).map((entry) => entry.occupied), [false, false, false]);
  assert.equal(internalProfileForPlayer(service, registered.account.accountId, originalPlayerId).stoneCoins, 987);

  const snapshot = service.snapshot();
  assert.equal(Array.isArray(snapshot.accountCharacterSlots[registered.account.accountId]), true);
  assert.equal(snapshot.accountCharacterSlots[registered.account.accountId].length, 4);
  assert.equal(snapshot.accountCharacterSlots[registered.account.accountId][0].playerId, originalPlayerId);
  assert.equal(Object.keys(snapshot.profiles).length, 1);
});

test("four character slots isolate profiles and require selection once the account has multiple characters", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const events = [];
  service.onEvent((event) => events.push(event));
  const registered = service.register({
    username: "characterisolation",
    password: "test1234",
    displayName: "角色甲",
  });
  assert.equal(registered.ok, true);
  const firstPlayerId = registered.session.playerId;
  const firstProfileResult = service.getProfile(registered.session.token);
  const firstProfile = structuredClone(firstProfileResult.profile);
  firstProfile.stoneCoins = 777;
  assert.equal(service.saveProfile(registered.session.token, {
    expectedRevision: firstProfileResult.profileSummary.profileRevision,
    profile: firstProfile,
  }).ok, true);

  const second = service.createCharacter(
    registered.session.token,
    characterCreationPayload("角色乙", 1),
  );
  assert.equal(second.ok, true);
  assert.equal(second.selectedCharacter.playerId, firstPlayerId);
  const secondPlayerId = second.character.playerId;
  assert.notEqual(secondPlayerId, firstPlayerId);
  assert.equal(internalProfileForPlayer(service, registered.account.accountId, secondPlayerId).stoneCoins, 120);
  assert.equal(internalProfileForPlayer(service, registered.account.accountId, secondPlayerId).player.name, "角色乙");

  assert.equal(service.createCharacter(
    registered.session.token,
    characterCreationPayload("角色丙", 2),
  ).ok, true);
  assert.equal(service.createCharacter(
    registered.session.token,
    characterCreationPayload("角色丁", 3),
  ).ok, true);
  const fifth = service.createCharacter(
    registered.session.token,
    characterCreationPayload("角色戊"),
  );
  assert.equal(fifth.ok, false);
  assert.equal(fifth.code, "character_slot_limit");
  assert.equal(service.updatePlayerPosition(registered.session.token, {
    mapId: "firebud_training_yard",
    cellX: 10,
    cellY: 10,
    facing: "east",
    moving: false,
  }).ok, true);

  const login = service.login({username: "characterisolation", password: "test1234"});
  assert.equal(login.ok, true);
  assert.equal(login.selectionRequired, true);
  assert.equal(login.session.playerId, undefined);
  assert.equal(login.profileBinding, null);
  assert.equal(login.profileSummary, null);
  assert.equal(login.runtimePosition, null);
  assert.equal(events.some((event) => (
    event.type === "online.position"
    && event.position === null
    && event.authority === "character_selection_required"
  )), true);
  assert.equal(service.getProfile(login.session.token).code, "character_selection_required");
  const unselectedSession = service.getSession(login.session.token);
  assert.equal(unselectedSession.ok, true);
  assert.equal(unselectedSession.profileBinding, null);
  assert.equal(unselectedSession.profileSummary, null);
  assert.equal(unselectedSession.recovery, null);
  const mismatchedSelection = service.selectCharacter(login.session.token, {
    slotIndex: 2,
    playerId: secondPlayerId,
  });
  assert.equal(mismatchedSelection.ok, false);
  assert.equal(mismatchedSelection.code, "character_select_mismatch");
  assert.equal(service.getSession(login.session.token).ok, true);

  const selectedSecond = service.selectCharacter(login.session.token, {slotIndex: 1});
  assert.equal(selectedSecond.ok, true);
  assert.equal(selectedSecond.session.playerId, secondPlayerId);
  assert.equal(selectedSecond.session.slotIndex, 1);
  assert.equal(Number.isSafeInteger(selectedSecond.session.selectionEpoch), true);
  assert.equal(service.getSession(login.session.token).code, "character_session_rotated");
  const switchEvent = events.find((event) => event.code === "character_session_rotated");
  assert.ok(switchEvent);
  assert.equal(switchEvent.type, "session.replaced");
  assert.equal(switchEvent.reason, "character_selected");
  assert.deepEqual(switchEvent.targetSessionIds, [login.session.sessionId]);
  const secondProfileResult = service.getProfile(selectedSecond.session.token);
  assert.equal(secondProfileResult.ok, true);
  assert.equal(secondProfileResult.profile.player.name, "角色乙");
  assert.equal(secondProfileResult.profile.stoneCoins, 120);

  const refreshed = service.refreshSession(selectedSecond.session.token);
  assert.equal(refreshed.ok, true);
  assert.equal(refreshed.session.playerId, secondPlayerId);
  assert.equal(refreshed.session.slotIndex, 1);
  assert.equal(refreshed.session.selectionEpoch, selectedSecond.session.selectionEpoch);
  assert.equal(service.updatePlayerPosition(refreshed.session.token, {
    mapId: "firebud_training_yard",
    cellX: 12,
    cellY: 10,
    facing: "west",
    moving: false,
  }).ok, true);

  const selectedFirst = service.selectCharacter(refreshed.session.token, {playerId: firstPlayerId});
  assert.equal(selectedFirst.ok, true);
  assert.equal(events.some((event) => (
    event.type === "online.position"
    && event.position === null
    && event.authority === "character_selected"
  )), true);
  const restoredFirst = service.getProfile(selectedFirst.session.token);
  assert.equal(restoredFirst.ok, true);
  assert.equal(restoredFirst.profile.player.name, "角色甲");
  assert.equal(restoredFirst.profile.stoneCoins, 777);
});

test("a lost character-selection response can recover by logging in and selecting again", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({
    username: "charselrecover",
    password: "test1234",
    displayName: "恢复甲",
  });
  const created = service.createCharacter(
    registered.session.token,
    characterCreationPayload("恢复乙", 1),
  );
  assert.equal(created.ok, true);

  const firstLogin = service.login({
    username: "charselrecover",
    password: "test1234",
  });
  assert.equal(firstLogin.ok, true);
  assert.equal(firstLogin.selectionRequired, true);
  const lostResponse = service.selectCharacter(firstLogin.session.token, {
    playerId: created.character.playerId,
  });
  assert.equal(lostResponse.ok, true);
  assert.equal(service.getSession(firstLogin.session.token).code, "character_session_rotated");

  // Simulate the client losing `lostResponse` (including its replacement
  // token). A normal credential login must return to the selection gate.
  const recoveryLogin = service.login({
    username: "charselrecover",
    password: "test1234",
  });
  assert.equal(recoveryLogin.ok, true);
  assert.equal(recoveryLogin.selectionRequired, true);
  assert.equal(recoveryLogin.profileBinding, null);
  assert.equal(recoveryLogin.profileSummary, null);
  assert.equal(recoveryLogin.runtimePosition, null);
  const recoveryRefresh = service.refreshSession(recoveryLogin.session.token);
  assert.equal(recoveryRefresh.ok, true);
  assert.equal(recoveryRefresh.selectionRequired, true);
  assert.equal(recoveryRefresh.profileBinding, null);
  assert.equal(recoveryRefresh.profileSummary, null);
  assert.equal(recoveryRefresh.runtimePosition, null);
  const recoveredSelection = service.selectCharacter(recoveryRefresh.session.token, {
    playerId: created.character.playerId,
  });
  assert.equal(recoveredSelection.ok, true);
  assert.equal(recoveredSelection.session.playerId, created.character.playerId);
  assert.equal(service.getProfile(recoveredSelection.session.token).profile.player.name, "恢复乙");
});

test("character selection fails closed while account-scoped asset escrow is active", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const registered = seedService.register({
    username: "characterescrow",
    password: "test1234",
    displayName: "托管甲",
  });
  const created = seedService.createCharacter(
    registered.session.token,
    characterCreationPayload("托管乙", 1),
  );
  assert.equal(created.ok, true);
  const snapshot = seedService.snapshot();
  snapshot.marketListings.listing_character_guard = {
    listingId: "listing_character_guard",
    sellerAccountId: registered.account.accountId,
    itemId: "item_meat_small",
    count: 1,
    unitPrice: 1,
    currency: "stoneCoins",
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
  };
  const service = createAuthService({store: createMemoryAuthStore(snapshot)});
  const login = service.login({username: "characterescrow", password: "test1234"});
  assert.equal(login.selectionRequired, true);
  const blocked = service.selectCharacter(login.session.token, {slotIndex: 1});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "character_select_market_active");
  assert.equal(service.getSession(login.session.token).ok, true);
});

test("pending party invitations and scheduled manor participation block a role switch", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const registered = seedService.register({
    username: "characterengagement",
    password: "test1234",
    displayName: "参战甲",
  });
  const created = seedService.createCharacter(
    registered.session.token,
    characterCreationPayload("参战乙", 1),
  );
  assert.equal(created.ok, true);
  const inviter = seedService.register({
    username: "characterinviter",
    password: "test1234",
    displayName: "邀请者",
  });
  assert.equal(seedService.inviteToParty(inviter.session.token, {
    username: "characterengagement",
  }).ok, true);
  const loginWithInvite = seedService.login({
    username: "characterengagement",
    password: "test1234",
  });
  const onlineWhileUnselected = seedService.listOnlinePlayers(inviter.session.token);
  assert.equal(onlineWhileUnselected.ok, true);
  assert.equal(onlineWhileUnselected.players.some((player) => (
    player.accountId === registered.account.accountId
  )), false);
  const partyBlocked = seedService.selectCharacter(loginWithInvite.session.token, {slotIndex: 1});
  assert.equal(partyBlocked.ok, false);
  assert.equal(partyBlocked.code, "character_select_party_invite_active");
  const currentCharacterAllowed = seedService.selectCharacter(
    loginWithInvite.session.token,
    {slotIndex: 0},
  );
  assert.equal(currentCharacterAllowed.ok, true);
  const differentCharacterStillBlocked = seedService.selectCharacter(
    currentCharacterAllowed.session.token,
    {slotIndex: 1},
  );
  assert.equal(differentCharacterStillBlocked.ok, false);
  assert.equal(differentCharacterStillBlocked.code, "character_select_party_invite_active");

  const manorSnapshot = seedService.snapshot();
  manorSnapshot.manorWars.push({
    warId: "manor_war_character_guard",
    status: "scheduled",
    challengerParticipantAccountIds: [registered.account.accountId],
    defenderParticipantAccountIds: [],
    schemaVersion: 1,
  });
  const manorService = createAuthService({store: createMemoryAuthStore(manorSnapshot)});
  const manorLogin = manorService.login({
    username: "characterengagement",
    password: "test1234",
  });
  const manorBlocked = manorService.selectCharacter(manorLogin.session.token, {slotIndex: 1});
  assert.equal(manorBlocked.ok, false);
  assert.equal(manorBlocked.code, "character_select_manor_war_active");
});

test("an unselected multi-character session cannot replay a legacy account-only asset receipt", async () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const registered = seedService.register({
    username: "charlegacyreceipt",
    password: "test1234",
    displayName: "回执甲",
  });
  const operationId = "character_legacy_asset_receipt_0001";
  const payload = {
    action: "training_partner_set_count",
    payload: {count: 1},
  };
  const committed = await seedService.invokeDurable(
    "profileAction",
    [registered.session.token, payload],
    {
      operationId,
      actionId: "profileAction",
      requestHash: "c".repeat(64),
    },
  );
  assert.equal(committed.ok, true);
  assert.equal(seedService.createCharacter(
    registered.session.token,
    characterCreationPayload("回执乙", 1),
  ).ok, true);

  const legacySnapshot = seedService.snapshot();
  delete legacySnapshot.mutationReceipts[operationId].scopeKind;
  delete legacySnapshot.mutationReceipts[operationId].playerId;
  delete legacySnapshot.mutationReceipts[operationId].selectionEpoch;
  const service = createAuthService({store: createMemoryAuthStore(legacySnapshot)});
  const login = service.login({
    username: "charlegacyreceipt",
    password: "test1234",
  });
  assert.equal(login.selectionRequired, true);
  const replay = await service.invokeDurable(
    "profileAction",
    [login.session.token, payload],
    {
      operationId,
      actionId: "profileAction",
      requestHash: "c".repeat(64),
    },
  );
  assert.equal(replay.ok, false);
  assert.equal(replay.code, "idempotency_key_conflict");

  const selected = service.selectCharacter(login.session.token, {slotIndex: 0});
  assert.equal(selected.ok, true);
  const selectedReplay = await service.invokeDurable(
    "profileAction",
    [selected.session.token, payload],
    {
      operationId,
      actionId: "profileAction",
      requestHash: "c".repeat(64),
    },
  );
  assert.equal(selectedReplay.ok, false);
  assert.equal(selectedReplay.code, "idempotency_key_conflict");
});

test("HTTP character routes enforce durable create and rotate into the selected profile", async (t) => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await service.waitForDurableIdle();
    await new Promise((resolve) => server.close(resolve));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const registered = await fetchJson(`${baseUrl}/auth/register`, {
    method: "POST",
    body: JSON.stringify({
      username: "characterhttp",
      password: "test1234",
      displayName: "网络甲",
    }),
  });
  assert.equal(registered.ok, true);
  assert.equal(registered.characters.length, 4);
  assert.equal(registered.session.slotIndex, 0);

  const missingKey = await fetchJson(`${baseUrl}/characters`, {
    method: "POST",
    headers: {authorization: `Bearer ${registered.session.token}`},
    body: JSON.stringify(characterCreationPayload("网络乙", 1)),
  });
  assert.equal(missingKey.ok, false);
  assert.equal(missingKey.code, "idempotency_key_required");

  const createHeaders = {
    authorization: `Bearer ${registered.session.token}`,
    "Idempotency-Key": "character_create_http_0001",
  };
  const created = await fetchJson(`${baseUrl}/characters`, {
    method: "POST",
    headers: createHeaders,
    body: JSON.stringify(characterCreationPayload("网络乙", 1)),
  });
  assert.equal(created.ok, true);
  assert.equal(created.character.slotIndex, 1);
  assert.equal(created.character.displayName, "网络乙");
  assert.equal(created.profile, undefined);
  const createReceipt = service.snapshot().mutationReceipts.character_create_http_0001;
  assert.equal(createReceipt.scopeKind, "account");
  assert.equal(Object.hasOwn(createReceipt, "playerId"), false);
  assert.equal(Object.hasOwn(createReceipt, "selectionEpoch"), false);
  const crossMethodReplay = await service.invokeDurable(
    "profileAction",
    [
      registered.session.token,
      {action: "training_partner_set_count", payload: {count: 1}},
    ],
    {
      operationId: createReceipt.operationId,
      actionId: createReceipt.actionId,
      requestHash: createReceipt.requestHash,
    },
  );
  assert.equal(crossMethodReplay.ok, false);
  assert.equal(crossMethodReplay.code, "idempotency_key_conflict");

  const replayed = await fetchJson(`${baseUrl}/characters`, {
    method: "POST",
    headers: createHeaders,
    body: JSON.stringify(characterCreationPayload("网络乙", 1)),
  });
  assert.equal(replayed.ok, true);
  assert.equal(replayed.character.playerId, created.character.playerId);
  assert.equal(replayed.durableCommit.replayed, true);

  const login = await fetchJson(`${baseUrl}/auth/login`, {
    method: "POST",
    body: JSON.stringify({username: "characterhttp", password: "test1234"}),
  });
  assert.equal(login.ok, true);
  assert.equal(login.selectionRequired, true);
  const replayedWhileUnselected = await fetchJson(`${baseUrl}/characters`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${login.session.token}`,
      "Idempotency-Key": "character_create_http_0001",
    },
    body: JSON.stringify(characterCreationPayload("网络乙", 1)),
  });
  assert.equal(replayedWhileUnselected.ok, true);
  assert.equal(replayedWhileUnselected.character.playerId, created.character.playerId);
  assert.equal(replayedWhileUnselected.durableCommit.replayed, true);
  const unselectedProfile = await fetchJson(`${baseUrl}/profiles/me`, {
    headers: {authorization: `Bearer ${login.session.token}`},
  });
  assert.equal(unselectedProfile.code, "character_selection_required");

  const selected = await fetchJson(`${baseUrl}/characters/select`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${login.session.token}`,
      "Idempotency-Key": "character_select_http_not_persisted_0001",
    },
    body: JSON.stringify({playerId: created.character.playerId}),
  });
  assert.equal(selected.ok, true);
  assert.equal(selected.session.playerId, created.character.playerId);
  assert.equal(selected.session.slotIndex, 1);
  assert.notEqual(selected.session.token, login.session.token);
  assert.equal(
    Object.hasOwn(
      service.snapshot().mutationReceipts,
      "character_select_http_not_persisted_0001",
    ),
    false,
  );
  const replayedAfterSelection = await fetchJson(`${baseUrl}/characters`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${selected.session.token}`,
      "Idempotency-Key": "character_create_http_0001",
    },
    body: JSON.stringify(characterCreationPayload("网络乙", 1)),
  });
  assert.equal(replayedAfterSelection.ok, true);
  assert.equal(replayedAfterSelection.character.playerId, created.character.playerId);
  assert.equal(replayedAfterSelection.durableCommit.replayed, true);

  const selectedProfile = await fetchJson(`${baseUrl}/profiles/me`, {
    headers: {authorization: `Bearer ${selected.session.token}`},
  });
  assert.equal(selectedProfile.ok, true);
  assert.equal(selectedProfile.profileBinding.playerId, created.character.playerId);
  assert.equal(selectedProfile.profile.player.name, "网络乙");

  const profileActionBody = JSON.stringify({
    action: "training_partner_set_count",
    payload: {count: 1},
  });
  const actionOnSecond = await fetchJson(`${baseUrl}/profile/action`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${selected.session.token}`,
      "Idempotency-Key": "character_cross_profile_action_0002",
    },
    body: profileActionBody,
  });
  assert.equal(actionOnSecond.ok, true);
  assert.equal(actionOnSecond.profile.trainingPartners.length, 1);
  const characterReceipt = service.snapshot()
    .mutationReceipts.character_cross_profile_action_0002;
  assert.equal(characterReceipt.scopeKind, "character");
  assert.equal(characterReceipt.playerId, created.character.playerId);
  assert.equal(
    Number.isSafeInteger(characterReceipt.selectionEpoch)
      && characterReceipt.selectionEpoch >= 1,
    true,
  );

  const selectedFirst = await fetchJson(`${baseUrl}/characters/select`, {
    method: "POST",
    headers: {authorization: `Bearer ${selected.session.token}`},
    body: JSON.stringify({playerId: registered.characters[0].playerId}),
  });
  assert.equal(selectedFirst.ok, true);
  const crossCharacterReplay = await fetchJson(`${baseUrl}/profile/action`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${selectedFirst.session.token}`,
      "Idempotency-Key": "character_cross_profile_action_0002",
    },
    body: profileActionBody,
  });
  assert.equal(crossCharacterReplay.ok, false);
  assert.equal(crossCharacterReplay.code, "idempotency_key_conflict");
  const untouchedFirst = await fetchJson(`${baseUrl}/profiles/me`, {
    headers: {authorization: `Bearer ${selectedFirst.session.token}`},
  });
  assert.equal(untouchedFirst.ok, true);
  assert.equal(untouchedFirst.profile.player.name, "网络甲");
  assert.equal(untouchedFirst.profile.trainingPartners.length, 0);
});

test("HTTP legacy element allocation is authenticated, durable, and replay-safe", async (t) => {
  const service = createAuthService({
    initialCharacterElementsForTests: null,
    store: createMemoryAuthStore(),
  });
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await service.waitForDurableIdle();
    await new Promise((resolve) => server.close(resolve));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const registered = await fetchJson(`${baseUrl}/auth/register`, {
    method: "POST",
    body: JSON.stringify({
      username: "charallochttp",
      password: "test1234",
      displayName: "补点网络角色",
    }),
  });
  assert.equal(registered.ok, true);
  assert.equal(registered.characters[0].needsElementAllocation, true);

  const allocationBody = JSON.stringify({
    elements: {earth: 0, water: 6, fire: 4, wind: 0},
  });
  const missingKey = await fetchJson(`${baseUrl}/characters/allocate-elements`, {
    method: "POST",
    headers: {authorization: `Bearer ${registered.session.token}`},
    body: allocationBody,
  });
  assert.equal(missingKey.ok, false);
  assert.equal(missingKey.code, "idempotency_key_required");

  const unauthorized = await fetchJson(`${baseUrl}/characters/allocate-elements`, {
    method: "POST",
    headers: {"Idempotency-Key": "character_allocate_unauthorized_0001"},
    body: allocationBody,
  });
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.code, "session_missing");

  const headers = {
    authorization: `Bearer ${registered.session.token}`,
    "Idempotency-Key": "character_allocate_http_0001",
  };
  const allocated = await fetchJson(`${baseUrl}/characters/allocate-elements`, {
    method: "POST",
    headers,
    body: allocationBody,
  });
  assert.equal(allocated.ok, true);
  assert.deepEqual(allocated.character.elements, {earth: 0, water: 6, fire: 4, wind: 0});
  assert.equal(allocated.character.needsElementAllocation, false);
  const receipt = service.snapshot().mutationReceipts.character_allocate_http_0001;
  assert.equal(receipt.scopeKind, "character");
  assert.equal(receipt.playerId, registered.profileBinding.playerId);
  assert.equal(receipt.selectionEpoch, registered.session.selectionEpoch);

  const replay = await fetchJson(`${baseUrl}/characters/allocate-elements`, {
    method: "POST",
    headers,
    body: allocationBody,
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.deepEqual(replay.character.elements, allocated.character.elements);
});
