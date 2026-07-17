"use strict";

const {
  assert,
  test,
  once,
  createAuthService,
  createMemoryAuthStore,
  createHttpServer,
  battleProfile,
  fetchJson,
  internalProfileForAccount,
} = require("../test-support/auth-service-test-context");
const {
  GM_PET_CAPTURE_RECOVERY_COMMAND_ID,
} = require("../src/auth/gm-pet-capture-recovery");
const {stagePetCapture} = require("../src/auth/pet-capture-shelter");

function capturedPet(accountId, suffix = "1") {
  return {
    instanceId: `pet_gm_recovery_${suffix}`,
    petId: `pet_gm_recovery_${suffix}`,
    formId: "blue_man_dragon_water10",
    templateId: "blue_man_dragon_water10",
    speciesId: "blue_man_dragon_water10",
    name: `异常蓝人龙${suffix}`,
    state: "standby",
    source: "wild_capture",
    capturedSerial: Number(suffix) || 1,
    capturedBattleRoomId: `battle_room_gm_recovery_${suffix}`,
    capturedBattleActorId: `wild_gm_recovery_${suffix}`,
    capturedByAccountId: accountId,
    level: 1,
    exp: 0,
    hp: 65,
    maxHp: 65,
    attack: 14,
    defense: 9,
    quick: 6,
    initialStats: {maxHp: 65, attack: 14, defense: 9, quick: 6},
    petGrowth: {
      schemaVersion: 1,
      private: {
        privateSeed: String(suffix).padStart(64, "a"),
        privateRoll: {innateGrowthBonus: {maxHp: 1.2, attack: 0.3, defense: -0.1, quick: 0.2}},
      },
    },
  };
}

function seedFixture(options = {}) {
  const store = createMemoryAuthStore();
  const seed = createAuthService({store, allowFullProfileSave: true});
  const gm = seed.register({username: options.gmUsername || "gmrecovery", password: "test1234", displayName: "恢复GM"});
  const target = seed.register({username: options.targetUsername || "recoverytarget", password: "test1234", displayName: "恢复目标"});
  assert.equal(gm.ok, true);
  assert.equal(target.ok, true);
  assert.equal(seed.grantGm({
    username: gm.account.username,
    commandIds: options.commandIds || [GM_PET_CAPTURE_RECOVERY_COMMAND_ID],
    policyId: "test_explicit_gm_v2",
    expiresAt: "2099-01-01T00:00:00.000Z",
    grantedBy: "gm_pet_recovery_test",
  }).ok, true);
  const profile = battleProfile("恢复目标", {
    level: 20,
    hp: 220,
    maxHp: 220,
    attack: 30,
    defense: 18,
    quick: 90,
  });
  if (options.full === true) {
    profile.petInstances = [
      ...Array.from({length: 5}, (_value, index) => capacityPet(index, "standby")),
      ...Array.from({length: 20}, (_value, index) => capacityPet(index + 5, "storage")),
    ];
  }
  assert.equal(seed.saveProfile(target.session.token, {expectedRevision: 0, profile}).ok, true);
  const snapshot = seed.snapshot();
  const binding = snapshot.profileBindings[target.account.accountId];
  const internal = snapshot.profiles[binding.playerId].profile;
  const pet = capturedPet(target.account.accountId, options.suffix || "1");
  const staged = stagePetCapture(internal, {
    roomId: pet.capturedBattleRoomId,
    actorId: pet.capturedBattleActorId,
    pet,
    createdAt: "2026-07-17T08:00:00.000Z",
  });
  assert.equal(staged.ok, true);
  if (options.existingLivePet === true) {
    internal.petInstances.push({...structuredClone(pet), captureOverflowPending: true});
  }
  store.save(snapshot);
  return {
    store,
    service: createAuthService({store}),
    gm,
    target,
    pet,
    staged,
    revision: binding.profileRevision,
  };
}

function capacityPet(index, state) {
  return {
    instanceId: `capacity_pet_${state}_${index}`,
    petId: `capacity_pet_${state}_${index}`,
    formId: "wuli_normal_orange_fire10",
    templateId: "wuli_normal_orange_fire10",
    name: `容量宠${index}`,
    state,
    level: 1,
  };
}

function payload(action, targetUsername, selector = "") {
  return {
    action,
    targetUsername,
    recoveryId: selector.startsWith("pet_capture_") ? selector : "",
    petInstanceId: selector !== "" && !selector.startsWith("pet_capture_") ? selector : "",
  };
}

test("GM capture recovery search is exact, audited, and private", () => {
  const fixture = seedFixture();
  const {service, gm, target, staged, pet} = fixture;
  const playerDenied = service.gmPetCaptureRecovery(target.session.token, payload("search", target.account.username));
  assert.equal(playerDenied.ok, false);
  assert.equal(playerDenied.code, "gm_denied");
  const injected = service.gmPetCaptureRecovery(gm.session.token, {
    ...payload("search", target.account.username),
    includePrivatePet: true,
  });
  assert.equal(injected.ok, false);
  assert.equal(injected.code, "gm_pet_recovery_payload_invalid");

  const before = service.snapshot();
  const beforeBinding = before.profileBindings[target.account.accountId];
  const searched = service.gmPetCaptureRecovery(gm.session.token, payload("search", target.account.username));
  assert.equal(searched.ok, true);
  assert.equal(searched.result.action, "search");
  assert.equal(searched.result.target.username, target.account.username);
  assert.equal(searched.result.target.profileRevision, beforeBinding.profileRevision);
  assert.equal(searched.result.counts.pending, 1);
  assert.equal(searched.result.counts.matched, 1);
  assert.equal(searched.result.records[0].recoveryId, staged.recoveryId);
  assert.equal(searched.result.records[0].petInstanceId, pet.instanceId);
  assert.equal(Object.hasOwn(searched.result.target, "accountId"), false);
  const serialized = JSON.stringify(searched);
  assert.equal(serialized.includes(pet.petGrowth.private.privateSeed), false);
  assert.equal(serialized.includes("privateRoll"), false);
  assert.equal(serialized.includes("petRecoveryShelter"), false);

  const byRecovery = service.gmPetCaptureRecovery(
    gm.session.token,
    payload("search", target.account.username, staged.recoveryId),
  );
  assert.equal(byRecovery.result.counts.matched, 1);
  const byPet = service.gmPetCaptureRecovery(
    gm.session.token,
    payload("search", target.account.username, pet.instanceId),
  );
  assert.equal(byPet.result.counts.matched, 1);
  const missing = service.gmPetCaptureRecovery(
    gm.session.token,
    payload("search", target.account.username, "pet_missing_exact"),
  );
  assert.equal(missing.ok, true);
  assert.equal(missing.result.counts.matched, 0);
  const after = service.snapshot();
  assert.equal(after.profileBindings[target.account.accountId].profileRevision, beforeBinding.profileRevision);
  const audit = after.gmCommandAudit.at(-1);
  assert.equal(audit.commandId, GM_PET_CAPTURE_RECOVERY_COMMAND_ID);
  assert.equal(audit.details.targetAccountId, target.account.accountId);
  assert.equal(audit.details.petInstanceId, "pet_missing_exact");
  assert.equal(JSON.stringify(after.gmCommandAudit).includes(pet.petGrowth.private.privateSeed), false);
});

test("GM capture recovery restores once by pet ID and replays without duplication", () => {
  const fixture = seedFixture({gmUsername: "gmrecoveronce", targetUsername: "recoveronce"});
  const {service, gm, target, staged, pet, revision} = fixture;
  const recovered = service.gmPetCaptureRecovery(
    gm.session.token,
    payload("recover", target.account.username, pet.instanceId),
  );
  assert.equal(recovered.ok, true);
  assert.equal(recovered.result.recovery.changed, true);
  assert.equal(recovered.result.recovery.replayed, false);
  assert.equal(recovered.result.records[0].status, "completed");
  assert.equal(recovered.result.records[0].recoveryId, staged.recoveryId);
  let internal = internalProfileForAccount(service, target.account.accountId);
  assert.equal(internal.petInstances.filter((entry) => entry.instanceId === pet.instanceId).length, 1);
  assert.equal(Object.keys(internal.petRecoveryShelter.pending).length, 0);
  assert.equal(Object.keys(internal.petRecoveryShelter.completed).length, 1);
  assert.equal(service.snapshot().profileBindings[target.account.accountId].profileRevision, revision + 1);

  const replay = service.gmPetCaptureRecovery(
    gm.session.token,
    payload("recover", target.account.username, staged.recoveryId),
  );
  assert.equal(replay.ok, true);
  assert.equal(replay.result.recovery.changed, false);
  assert.equal(replay.result.recovery.replayed, true);
  internal = internalProfileForAccount(service, target.account.accountId);
  assert.equal(internal.petInstances.filter((entry) => entry.instanceId === pet.instanceId).length, 1);
  assert.equal(service.snapshot().profileBindings[target.account.accountId].profileRevision, revision + 1);
  assert.equal(JSON.stringify(replay).includes(pet.petGrowth.private.privateSeed), false);
  const audit = service.snapshot().gmCommandAudit.at(-1);
  assert.equal(audit.details.replayed, true);
  assert.equal(audit.details.profileRevisionBefore, revision + 1);
  assert.equal(audit.details.profileRevisionAfter, revision + 1);
});

test("GM capture recovery closes a legacy live-pet pending record without cloning the pet", () => {
  const fixture = seedFixture({
    gmUsername: "gmrecoverlegacy",
    targetUsername: "recoverlegacy",
    existingLivePet: true,
  });
  const {service, gm, target, staged, pet, revision} = fixture;
  const recovered = service.gmPetCaptureRecovery(
    gm.session.token,
    payload("recover", target.account.username, staged.recoveryId),
  );
  assert.equal(recovered.ok, true);
  assert.equal(recovered.result.recovery.changed, true);
  assert.equal(recovered.result.recovery.replayed, true);
  assert.equal(recovered.result.recovery.disposition, "overflow_fallback");
  assert.match(recovered.message, /未生成第二只/);
  let internal = internalProfileForAccount(service, target.account.accountId);
  assert.equal(internal.petInstances.filter((entry) => entry.instanceId === pet.instanceId).length, 1);
  assert.equal(internal.petInstances.find((entry) => entry.instanceId === pet.instanceId).captureOverflowPending, undefined);
  assert.equal(Object.keys(internal.petRecoveryShelter.pending).length, 0);
  assert.equal(internal.petRecoveryShelter.completed[staged.recoveryId].disposition, "overflow_fallback");
  assert.equal(service.snapshot().profileBindings[target.account.accountId].profileRevision, revision + 1);

  const replay = service.gmPetCaptureRecovery(
    gm.session.token,
    payload("recover", target.account.username, staged.recoveryId),
  );
  assert.equal(replay.ok, true);
  assert.equal(replay.result.recovery.changed, false);
  assert.equal(replay.result.recovery.replayed, true);
  internal = internalProfileForAccount(service, target.account.accountId);
  assert.equal(internal.petInstances.filter((entry) => entry.instanceId === pet.instanceId).length, 1);
  assert.equal(service.snapshot().profileBindings[target.account.accountId].profileRevision, revision + 1);
});

test("GM capture recovery fails closed for full capacity and an active target battle", () => {
  const full = seedFixture({gmUsername: "gmrecoveryfull", targetUsername: "recoveryfull", full: true});
  const fullBefore = structuredClone(internalProfileForAccount(full.service, full.target.account.accountId));
  const blockedFull = full.service.gmPetCaptureRecovery(
    full.gm.session.token,
    payload("recover", full.target.account.username, full.staged.recoveryId),
  );
  assert.equal(blockedFull.ok, false);
  assert.equal(blockedFull.code, "pet_capture_shelter_capacity_full");
  assert.deepEqual(internalProfileForAccount(full.service, full.target.account.accountId), fullBefore);

  const active = seedFixture({gmUsername: "gmrecoverybattle", targetUsername: "recoverybattle"});
  const rival = active.service.register({username: "recoverybattlerival", password: "test1234"});
  active.service.updatePlayerPosition(active.target.session.token, {mapId: "village", cellX: 10, cellY: 10, facing: "east", moving: false});
  active.service.updatePlayerPosition(rival.session.token, {mapId: "village", cellX: 11, cellY: 10, facing: "west", moving: false});
  const invite = active.service.inviteToBattle(active.target.session.token, {username: rival.account.username});
  assert.equal(invite.ok, true);
  assert.equal(active.service.acceptBattleInvite(rival.session.token, invite.invite.inviteId).ok, true);
  const activeBefore = structuredClone(internalProfileForAccount(active.service, active.target.account.accountId));
  const blockedBattle = active.service.gmPetCaptureRecovery(
    active.gm.session.token,
    payload("recover", active.target.account.username, active.staged.recoveryId),
  );
  assert.equal(blockedBattle.ok, false);
  assert.equal(blockedBattle.code, "gm_pet_recovery_target_in_battle");
  assert.deepEqual(internalProfileForAccount(active.service, active.target.account.accountId), activeBefore);
});

test("HTTP GM capture recovery requires idempotency and replays one audited result", async (t) => {
  const fixture = seedFixture({gmUsername: "httpgmrecovery", targetUsername: "httprecoverytarget"});
  const server = createHttpServer({service: fixture.service, store: fixture.store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const url = `${base}/gm/commands/${GM_PET_CAPTURE_RECOVERY_COMMAND_ID}`;
  const authorization = {authorization: `Bearer ${fixture.gm.session.token}`};

  const missingKey = await fetchJson(url, {
    method: "POST",
    headers: authorization,
    body: JSON.stringify(payload("search", fixture.target.account.username)),
  });
  assert.equal(missingKey.ok, false);
  assert.equal(missingKey.code, "idempotency_key_required");

  const operationId = "operation_gm_pet_recovery_search_0001";
  const first = await fetchJson(url, {
    method: "POST",
    headers: {...authorization, "Idempotency-Key": operationId},
    body: JSON.stringify(payload("search", fixture.target.account.username)),
  });
  assert.equal(first.ok, true);
  assert.equal(first.result.records[0].recoveryId, fixture.staged.recoveryId);
  assert.equal(JSON.stringify(first).includes(fixture.pet.petGrowth.private.privateSeed), false);
  const auditCount = fixture.service.snapshot().gmCommandAudit.length;

  const replay = await fetchJson(url, {
    method: "POST",
    headers: {...authorization, "Idempotency-Key": operationId},
    body: JSON.stringify(payload("search", fixture.target.account.username)),
  });
  assert.deepEqual(replay.result, first.result);
  assert.equal(replay.auditId, first.auditId);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(first.durableCommit.replayed, false);
  assert.equal(fixture.service.snapshot().gmCommandAudit.length, auditCount);
});
