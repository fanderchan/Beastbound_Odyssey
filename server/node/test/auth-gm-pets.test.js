"use strict";

const {
  assert,
  test,
  once,
  createAuthService,
  createMemoryAuthStore,
  createHttpServer,
  fetchJson,
  isValidPetPrivateSeed,
} = require("../test-support/auth-service-test-context");

function registerGm(service, username, commandIds = ["gm_grant_pet", "gm_level_pet"]) {
  const registered = service.register({username, password: "test1234", displayName: username});
  assert.equal(registered.ok, true);
  assert.equal(service.grantGm({username, commandIds, grantedBy: "gm_pet_test"}).ok, true);
  return registered;
}

function internalProfile(service, accountId) {
  const snapshot = service.snapshot();
  const binding = snapshot.profileBindings[accountId];
  return snapshot.profiles[binding.playerId].profile;
}

test("GM pet commands enforce role, command grants, and exact payloads without changing profiles", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const player = service.register({username: "gmpetdeny", password: "test1234"});
  const playerDenied = service.grantGmPet(player.session.token, {growthSpeciesProfileId: "blue_man_dragon_v1"});
  assert.equal(playerDenied.ok, false);
  assert.equal(playerDenied.code, "gm_denied");

  assert.equal(service.grantGm({
    username: "gmpetdeny",
    commandIds: ["gm_grant_pet"],
    grantedBy: "gm_pet_test",
  }).ok, true);
  const beforeRevision = service.getProfile(player.session.token).profileSummary.profileRevision;
  const injected = service.grantGmPet(player.session.token, {
    growthSpeciesProfileId: "blue_man_dragon_v1",
    level: 140,
  });
  assert.equal(injected.ok, false);
  assert.equal(injected.code, "gm_pet_grant_payload_invalid");
  const bothSelectors = service.grantGmPet(player.session.token, {
    growthSpeciesProfileId: "blue_man_dragon_v1",
    formId: "blue_man_dragon_water10",
  });
  assert.equal(bothSelectors.ok, false);
  assert.equal(bothSelectors.code, "gm_pet_grant_payload_invalid");
  const commandDenied = service.levelUpGmPet(player.session.token, {instanceId: "anything"});
  assert.equal(commandDenied.ok, false);
  assert.equal(commandDenied.code, "command_denied");
  assert.equal(service.getProfile(player.session.token).profileSummary.profileRevision, beforeRevision);
  assert.equal(service.snapshot().gmCommandAudit.length, 4);
});

test("GM pet grant uses server catalogs, CSPRNG private growth, capacity, codex, and one revision", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(service, "gmpetgrant");
  const first = service.grantGmPet(gm.session.token, {growthSpeciesProfileId: "blue_man_dragon_v1"});
  assert.equal(first.ok, true);
  assert.equal(first.profileSummary.profileRevision, 1);
  assert.equal(first.result.formId, "blue_man_dragon_water10");
  assert.equal(first.result.level, 1);
  assert.equal(first.profile.petCodexCapturedFormIds.includes("blue_man_dragon_water10"), true);
  assert.equal(JSON.stringify(first).includes("privateSeed"), false);
  assert.equal(JSON.stringify(first).includes("individualSeed"), false);

  const firstInternal = internalProfile(service, gm.account.accountId).petInstances[0];
  assert.equal(isValidPetPrivateSeed(firstInternal.petGrowth.private.privateSeed), true);
  const second = service.grantGmPet(gm.session.token, {formId: "blue_man_dragon_water10"});
  assert.equal(second.ok, true);
  assert.equal(second.profileSummary.profileRevision, 2);
  assert.notEqual(second.result.instanceId, first.result.instanceId);
  const secondInternal = internalProfile(service, gm.account.accountId).petInstances[1];
  assert.notEqual(secondInternal.petGrowth.private.privateSeed, firstInternal.petGrowth.private.privateSeed);
  assert.equal(service.snapshot().gmCommandAudit.length, 2);

  const profile = service.getProfile(gm.session.token).profile;
  profile.petInstances = [
    ...Array.from({length: 5}, (_, index) => ({
      instanceId: `party_${index}`,
      petId: `party_${index}`,
      formId: "wuli_normal_orange_fire10",
      state: "standby",
      level: 1,
    })),
    ...Array.from({length: 20}, (_, index) => ({
      instanceId: `storage_${index}`,
      petId: `storage_${index}`,
      formId: "wuli_normal_orange_fire10",
      state: "storage",
      level: 1,
    })),
  ];
  profile.nextPetInstanceSerial = 26;
  assert.equal(service.saveProfile(gm.session.token, {expectedRevision: 2, profile}).ok, true);
  const fullRevision = service.getProfile(gm.session.token).profileSummary.profileRevision;
  const full = service.grantGmPet(gm.session.token, {formId: "wuli_normal_orange_fire10"});
  assert.equal(full.ok, false);
  assert.equal(full.code, "pet_capacity_full");
  assert.equal(service.getProfile(gm.session.token).profileSummary.profileRevision, fullRevision);
});

test("GM pet level-up grows newly linked common pets, preserves legacy pets, and rejects damaged v1", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(service, "gmpetlevel");
  const linkedGrant = service.grantGmPet(gm.session.token, {growthSpeciesProfileId: "blue_man_dragon_v1"});
  const linkedBefore = internalProfile(service, gm.account.accountId).petInstances[0];
  const linkedLevel = service.levelUpGmPet(gm.session.token, {instanceId: linkedGrant.result.instanceId});
  assert.equal(linkedLevel.ok, true);
  assert.equal(linkedLevel.result.beforeLevel, 1);
  assert.equal(linkedLevel.result.level, 2);
  const linkedAfter = internalProfile(service, gm.account.accountId).petInstances[0];
  assert.equal(linkedAfter.petGrowth.settledLevel, 2);
  assert.equal(["maxHp", "attack", "defense", "quick"].some((key) => linkedAfter[key] > linkedBefore[key]), true);

  const commonGrant = service.grantGmPet(gm.session.token, {formId: "wuli_normal_orange_fire10"});
  const commonBefore = internalProfile(service, gm.account.accountId).petInstances
    .find((pet) => pet.instanceId === commonGrant.result.instanceId);
  assert.equal(commonBefore.growthSpeciesProfileId, "wuli_normal_orange_fire10_v1");
  assert.equal(Object.hasOwn(commonBefore, "individualSeed"), false);
  const commonLevel = service.levelUpGmPet(gm.session.token, {instanceId: commonGrant.result.instanceId});
  assert.equal(commonLevel.ok, true);
  const commonAfter = internalProfile(service, gm.account.accountId).petInstances
    .find((pet) => pet.instanceId === commonGrant.result.instanceId);
  assert.equal(commonAfter.petGrowth.settledLevel, 2);
  assert.equal(["maxHp", "attack", "defense", "quick"].some((key) => commonAfter[key] > commonBefore[key]), true);

  const legacyGrant = service.grantGmPet(gm.session.token, {formId: "novice_tiger_mount"});
  const legacyBefore = internalProfile(service, gm.account.accountId).petInstances
    .find((pet) => pet.instanceId === legacyGrant.result.instanceId);
  assert.equal(isValidPetPrivateSeed(legacyBefore.individualSeed), true);
  const legacyStats = [legacyBefore.maxHp, legacyBefore.attack, legacyBefore.defense, legacyBefore.quick];
  const legacyLevel = service.levelUpGmPet(gm.session.token, {instanceId: legacyGrant.result.instanceId});
  assert.equal(legacyLevel.ok, true);
  const legacyAfter = internalProfile(service, gm.account.accountId).petInstances
    .find((pet) => pet.instanceId === legacyGrant.result.instanceId);
  assert.equal(legacyAfter.level, 2);
  assert.deepEqual([legacyAfter.maxHp, legacyAfter.attack, legacyAfter.defense, legacyAfter.quick], legacyStats);

  const damagedProfile = internalProfile(service, gm.account.accountId);
  const damaged = damagedProfile.petInstances.find((pet) => pet.instanceId === linkedGrant.result.instanceId);
  delete damaged.petGrowth.private.privateSeed;
  const revision = service.getProfile(gm.session.token).profileSummary.profileRevision;
  assert.equal(service.saveProfile(gm.session.token, {expectedRevision: revision, profile: damagedProfile}).ok, true);
  const damagedRevision = service.getProfile(gm.session.token).profileSummary.profileRevision;
  const rejected = service.levelUpGmPet(gm.session.token, {instanceId: linkedGrant.result.instanceId});
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "pet_growth_state_invalid");
  assert.equal(service.getProfile(gm.session.token).profileSummary.profileRevision, damagedRevision);
});

test("GM pet mutations are locked while the GM participates in a battle room", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(service, "gmpetbattle");
  const rival = service.register({username: "gmpetrival", password: "test1234"});
  service.updatePlayerPosition(gm.session.token, {mapId: "village", cellX: 10, cellY: 10, facing: "east", moving: false});
  service.updatePlayerPosition(rival.session.token, {mapId: "village", cellX: 11, cellY: 10, facing: "west", moving: false});
  const invite = service.inviteToBattle(gm.session.token, {username: "gmpetrival"});
  assert.equal(invite.ok, true);
  const accepted = service.acceptBattleInvite(rival.session.token, invite.invite.inviteId);
  assert.equal(accepted.ok, true);
  const revision = service.getProfile(gm.session.token).profileSummary.profileRevision;
  const locked = service.grantGmPet(gm.session.token, {formId: "wuli_normal_orange_fire10"});
  assert.equal(locked.ok, false);
  assert.equal(locked.code, "battle_profile_mutation_locked");
  assert.equal(service.getProfile(gm.session.token).profileSummary.profileRevision, revision);
});

test("existing HTTP GM command paths execute pet mutations without exposing raw pets", async (t) => {
  const store = createMemoryAuthStore();
  const service = createAuthService({store});
  const server = createHttpServer({service, store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const gm = await fetchJson(`${base}/auth/register`, {
    method: "POST",
    body: JSON.stringify({username: "httpgmpet", password: "test1234"}),
  });
  assert.equal(gm.ok, true);
  assert.equal(service.grantGm({
    username: "httpgmpet",
    commandIds: ["gm_map", "gm_grant_pet", "gm_level_pet"],
    grantedBy: "gm_pet_http_test",
  }).ok, true);
  const headers = {authorization: `Bearer ${gm.session.token}`};
  const grant = await fetchJson(`${base}/gm/commands/gm_grant_pet`, {
    method: "POST",
    headers,
    body: JSON.stringify({growthSpeciesProfileId: "blue_man_dragon_v1"}),
  });
  assert.equal(grant.ok, true);
  assert.equal(JSON.stringify(grant).includes("privateSeed"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(grant.result, "pet"), false);
  const level = await fetchJson(`${base}/gm/commands/gm_level_pet`, {
    method: "POST",
    headers,
    body: JSON.stringify({instanceId: grant.result.instanceId}),
  });
  assert.equal(level.ok, true);
  assert.equal(level.result.level, 2);
  const genericAuthorize = await fetchJson(`${base}/gm/commands/gm_map`, {method: "POST", headers});
  assert.equal(genericAuthorize.ok, true);
  assert.equal(genericAuthorize.commandId, "gm_map");
});
