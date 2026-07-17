"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
  createAsyncWriteAuthStore,
  internalProfileForAccount,
  battleProfile,
  profileItemCount,
} = require("../test-support/auth-service-test-context");
const {stagePetCapture} = require("../src/auth/pet-capture-shelter");

function captureProfile(name, netCount = 1) {
  const profile = battleProfile(name, {
    level: 30,
    hp: 260,
    maxHp: 260,
    attack: 48,
    defense: 24,
    quick: 140,
  });
  profile.backpackSlots = [{itemId: "capture_net", count: netCount}];
  profile.captureTools = {capture_net: netCount};
  profile.petCodexSeenFormIds = [];
  profile.petCodexCapturedFormIds = [];
  return profile;
}

function capacityPet(index) {
  return {
    instanceId: `pet_capacity_${index + 1}`,
    petId: `pet_capacity_${index + 1}`,
    formId: "wuli_normal_orange_fire10",
    templateId: "wuli_normal_orange_fire10",
    name: `栏位宠${index + 1}`,
    state: index < 5 ? "standby" : "storage",
    level: 1,
    exp: 0,
    hp: 80,
    maxHp: 80,
    attack: 10,
    defense: 5,
    quick: 30,
  };
}

function orphanCapturedPet(accountId, capturedSerial) {
  const roomId = `battle_room_orphan_${capturedSerial}`;
  const actorId = `wild_orphan_${capturedSerial}`;
  const instanceId = `pet_orphan_${capturedSerial}`;
  return {
    roomId,
    actorId,
    pet: {
      instanceId,
      petId: instanceId,
      formId: "blue_man_dragon_water10",
      templateId: "blue_man_dragon_water10",
      speciesId: "blue_man_dragon_water10",
      name: `孤立蓝人龙${capturedSerial}`,
      state: "standby",
      source: "wild_capture",
      capturedSerial,
      capturedBattleRoomId: roomId,
      capturedBattleActorId: actorId,
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
          privateSeed: String(capturedSerial).padStart(64, "0"),
          privateRoll: {innateGrowthBonus: {maxHp: 0, attack: 0, defense: 0, quick: 0}},
        },
      },
    },
    createdAt: new Date(Date.parse("2026-07-17T03:00:00.000Z") + capturedSerial).toISOString(),
  };
}

function seedOrphanCaptures(store, username, capturedSerials) {
  const seed = createAuthService({store, allowFullProfileSave: true});
  const account = seed.register({username, password: "test1234", displayName: "孤立捕捉号"});
  assert.equal(account.ok, true);
  assert.equal(seed.saveProfile(account.session.token, {
    expectedRevision: 0,
    profile: captureProfile("孤立捕捉号"),
  }).ok, true);
  const data = store.load();
  const binding = data.profileBindings[account.account.accountId];
  const profileDoc = data.profiles[binding.playerId];
  for (const capturedSerial of capturedSerials) {
    const input = orphanCapturedPet(account.account.accountId, capturedSerial);
    const staged = stagePetCapture(profileDoc.profile, input);
    assert.equal(staged.ok, true);
  }
  binding.profileRevision += 1;
  profileDoc.profileRevision = binding.profileRevision;
  store.save(data);
  return {account, revision: binding.profileRevision};
}

function startPendingCapture(store, username) {
  const service = createAuthService({store, allowFullProfileSave: true});
  const account = service.register({username, password: "test1234", displayName: "收容测试号"});
  assert.equal(account.ok, true);
  const saved = service.saveProfile(account.session.token, {
    expectedRevision: 0,
    profile: captureProfile("收容测试号"),
  });
  assert.equal(saved.ok, true);
  const encounter = service.startPartyEncounter(account.session.token, {
    enemyCount: 2,
    encounterZone: {
      id: "pet_recovery_shelter_grass",
      name: "收容测试草丛",
      selectedWildPet: {
        formId: "blue_man_dragon_water10",
        name: "野生蓝人龙",
        level: 1,
        catchable: true,
        captureDifficulty: 1,
        captureChanceOverride: 1,
        battleStats: {maxHp: 120, attack: 1, defense: 1, quick: 10},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const player = encounter.room.battle.actors.find((actor) => actor.kind === "player");
  const enemy = encounter.room.battle.actors.find((actor) => actor.side === "enemy");
  const candidate = service.snapshot().battleRooms[encounter.room.roomId]
    .battle.captureCandidatesByActorId[enemy.actorId];
  const captured = service.submitBattleCommand(account.session.token, encounter.room.roomId, {
    round: 1,
    actorId: player.actorId,
    actionId: "capture",
    targetActorId: enemy.actorId,
    captureToolId: "capture_net",
  });
  assert.equal(captured.ok, true);
  assert.equal(captured.room.status, "ready");
  const event = captured.turn.events.find((entry) => entry.eventType === "capture");
  assert.ok(event);
  assert.equal(event.success, true);
  const internal = internalProfileForAccount(service, account.account.accountId);
  const recoveryIds = Object.keys(internal.petRecoveryShelter.pending);
  assert.equal(recoveryIds.length, 1);
  const recoveryId = recoveryIds[0];
  assert.match(recoveryId, /^pet_capture_[a-f0-9]{32}$/);
  assert.equal(JSON.stringify(captured).includes(recoveryId), false);
  const pending = internal.petRecoveryShelter.pending[recoveryId];
  assert.ok(pending);
  assert.deepEqual(pending.pet, {
    ...candidate.pet,
    state: pending.pet.state,
    capturedSerial: pending.pet.capturedSerial,
    capturedBattleRoomId: encounter.room.roomId,
    capturedBattleActorId: enemy.actorId,
    capturedByAccountId: account.account.accountId,
    captureToolId: "capture_net",
    captureStatusIds: pending.pet.captureStatusIds,
    captureAttemptNumber: 1,
    source: "wild_capture",
    isNew: true,
  });
  return {service, account, encounter, enemy, candidate, event, recoveryId, pending};
}

test("a captured private pet survives a mid-battle restart, full capacity, and repeated recovery", () => {
  const store = createMemoryAuthStore();
  const staged = startPendingCapture(store, "recoveryrestart");
  const token = staged.account.session.token;
  const accountId = staged.account.account.accountId;
  const privateSeed = staged.pending.pet.petGrowth.private.privateSeed;
  const exactPet = structuredClone(staged.pending.pet);
  const revisionBeforeActiveRead = staged.service.snapshot().profileBindings[accountId].profileRevision;

  const beforeRestartPublic = staged.service.getProfile(token);
  assert.equal(Object.hasOwn(beforeRestartPublic.profile, "petRecoveryShelter"), false);
  assert.equal(JSON.stringify(beforeRestartPublic).includes(privateSeed), false);
  assert.equal(profileItemCount(beforeRestartPublic.profile, "capture_net"), 0);
  assert.equal(beforeRestartPublic.profileBinding.profileRevision, revisionBeforeActiveRead);
  assert.equal(beforeRestartPublic.profile.petInstances.some((pet) => pet.instanceId === exactPet.instanceId), false);
  assert.equal(
    Object.keys(internalProfileForAccount(staged.service, accountId).petRecoveryShelter.pending).length,
    1,
  );

  const fullData = store.load();
  const fullBinding = fullData.profileBindings[accountId];
  const fullProfileDoc = fullData.profiles[fullBinding.playerId];
  fullProfileDoc.profile.petInstances = Array.from({length: 25}, (_value, index) => capacityPet(index));
  fullBinding.profileRevision += 1;
  fullProfileDoc.profileRevision = fullBinding.profileRevision;
  store.save(fullData);

  const restarted = createAuthService({store, allowFullProfileSave: true});
  assert.deepEqual(restarted.snapshot().battleRooms, {});
  const listed = restarted.listPetRecoveries(token);
  assert.equal(listed.ok, true);
  assert.equal(listed.count, 1);
  assert.equal(listed.recoveries[0].recoveryId, staged.recoveryId);
  assert.equal(listed.recoveries[0].pet.formId, exactPet.formId);
  assert.equal(JSON.stringify(listed).includes(privateSeed), false);
  assert.equal(JSON.stringify(listed).includes("privateRoll"), false);

  const filledPublic = restarted.getProfile(token);
  assert.equal(filledPublic.ok, true);
  const afterFillInternal = internalProfileForAccount(restarted, accountId);
  assert.deepEqual(afterFillInternal.petRecoveryShelter.pending[staged.recoveryId].pet, exactPet);

  const revisionBeforeFullClaim = filledPublic.profileBinding.profileRevision;
  const fullClaim = restarted.claimPetRecovery(token, {recoveryId: staged.recoveryId});
  assert.equal(fullClaim.ok, false);
  assert.equal(fullClaim.code, "pet_capture_shelter_capacity_full");
  assert.equal(restarted.getProfile(token).profileBinding.profileRevision, revisionBeforeFullClaim);
  assert.deepEqual(
    internalProfileForAccount(restarted, accountId).petRecoveryShelter.pending[staged.recoveryId].pet,
    exactPet,
  );

  const privateInjection = structuredClone(filledPublic.profile);
  privateInjection.petRecoveryShelter = {schemaVersion: 1, pending: {}, completed: {}, recentCompletedIds: []};
  const denied = restarted.saveProfile(token, {
    expectedRevision: revisionBeforeFullClaim,
    profile: privateInjection,
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "profile_private_field_denied");

  const oneSlotProfile = structuredClone(filledPublic.profile);
  oneSlotProfile.petInstances.pop();
  const oneSlot = restarted.saveProfile(token, {
    expectedRevision: revisionBeforeFullClaim,
    profile: oneSlotProfile,
  });
  assert.equal(oneSlot.ok, true);
  const recovered = restarted.claimPetRecovery(token, {recoveryId: staged.recoveryId});
  assert.equal(recovered.ok, true);
  assert.equal(recovered.recovery.replayed, false);
  assert.equal(recovered.recovery.instanceId, exactPet.instanceId);
  assert.equal(JSON.stringify(recovered).includes(privateSeed), false);
  const revisionAfterRecovery = recovered.profileBinding.profileRevision;
  const restored = internalProfileForAccount(restarted, accountId)
    .petInstances.find((pet) => pet.instanceId === exactPet.instanceId);
  assert.ok(restored);
  assert.deepEqual({...restored, state: exactPet.state}, exactPet);
  assert.equal(Object.keys(internalProfileForAccount(restarted, accountId).petRecoveryShelter.pending).length, 0);

  const replay = restarted.claimPetRecovery(token, {recoveryId: staged.recoveryId});
  assert.equal(replay.ok, true);
  assert.equal(replay.recovery.replayed, true);
  assert.equal(replay.profileBinding.profileRevision, revisionAfterRecovery);
  assert.equal(
    internalProfileForAccount(restarted, accountId).petInstances
      .filter((pet) => pet.instanceId === exactPet.instanceId).length,
    1,
  );
});

test("an orphaned capture is restored by the next safe profile read with one revision", () => {
  const store = createMemoryAuthStore();
  const seeded = seedOrphanCaptures(store, "recoveryautoread", [3, 1, 2]);
  const service = createAuthService({store});
  assert.deepEqual(service.snapshot().battleRooms, {});

  const restored = service.getProfile(seeded.account.session.token);
  assert.equal(restored.ok, true);
  assert.equal(restored.profileBinding.profileRevision, seeded.revision + 1);
  assert.deepEqual(
    restored.profile.petInstances.map((pet) => pet.instanceId),
    ["pet_orphan_1", "pet_orphan_2", "pet_orphan_3"],
  );
  assert.equal(Object.hasOwn(restored.profile, "petRecoveryShelter"), false);
  assert.equal(JSON.stringify(restored).includes("privateSeed"), false);
  const internal = internalProfileForAccount(service, seeded.account.account.accountId);
  assert.equal(Object.keys(internal.petRecoveryShelter.pending).length, 0);
  assert.equal(Object.keys(internal.petRecoveryShelter.completed).length, 3);

  const repeated = service.getProfile(seeded.account.session.token);
  assert.equal(repeated.profileBinding.profileRevision, restored.profileBinding.profileRevision);
  assert.equal(repeated.profile.petInstances.length, 3);
});

test("a full profile with pending recovery stays on the connected pure-read path", () => {
  const store = createMemoryAuthStore();
  const seeded = seedOrphanCaptures(store, "recoveryfullread", [1]);
  const data = store.load();
  const binding = data.profileBindings[seeded.account.account.accountId];
  data.profiles[binding.playerId].profile.petInstances = Array.from(
    {length: 25},
    (_value, index) => capacityPet(index),
  );
  store.save(data);
  const service = createAuthService({store});
  assert.equal(service.markEventConnection({
    accountId: seeded.account.account.accountId,
    sessionId: seeded.account.session.sessionId,
  }, true).ok, true);

  const read = service._httpTryPureRead("getProfile", [seeded.account.session.token]);
  assert.equal(read.handled, true);
  assert.equal(read.result.ok, true);
  assert.equal(read.result.profileBinding.profileRevision, seeded.revision);
  assert.equal(read.result.profile.petInstances.length, 25);
  assert.equal(
    Object.keys(internalProfileForAccount(service, seeded.account.account.accountId).petRecoveryShelter.pending).length,
    1,
  );
});

test("background recovery discards the whole candidate when a later identity conflicts", () => {
  const store = createMemoryAuthStore();
  const seeded = seedOrphanCaptures(store, "recoveryatomic", [1, 2]);
  const data = store.load();
  const binding = data.profileBindings[seeded.account.account.accountId];
  data.profiles[binding.playerId].profile.petInstances.push({
    instanceId: "pet_orphan_2",
    petId: "pet_orphan_2",
    formId: "wuli_normal_orange_fire10",
    templateId: "wuli_normal_orange_fire10",
    state: "standby",
  });
  store.save(data);
  const service = createAuthService({store});
  const before = structuredClone(internalProfileForAccount(service, seeded.account.account.accountId));

  const result = service.getProfile(seeded.account.session.token);
  assert.equal(result.ok, true);
  assert.equal(result.profileBinding.profileRevision, seeded.revision);
  const after = internalProfileForAccount(service, seeded.account.account.accountId);
  assert.deepEqual(after, before);
  assert.equal(after.petInstances.some((pet) => pet.instanceId === "pet_orphan_1"), false);
  assert.equal(Object.keys(after.petRecoveryShelter.pending).length, 2);
});

function failingMaterializeAuthority() {
  return {
    prepareRoom(room) {
      const next = structuredClone(room);
      next.battle.captureCandidatesByActorId = {};
      for (const actor of next.battle.actors.filter((entry) => entry.side === "enemy")) {
        next.battle.captureCandidatesByActorId[actor.actorId] = {
          actorId: actor.actorId,
          status: "available",
          claimedByAccountId: "",
          attemptCount: 0,
          lastAttempt: null,
        };
      }
      return {ok: true, room: next, candidateCount: Object.keys(next.battle.captureCandidatesByActorId).length};
    },
    validateAttempt() {
      return {ok: true};
    },
    captureRoll(room, input) {
      const next = structuredClone(room);
      const candidate = next.battle.captureCandidatesByActorId[input.actorId];
      candidate.attemptCount += 1;
      candidate.lastAttempt = {
        attemptNumber: candidate.attemptCount,
        accountId: input.accountId,
        captureToolId: input.captureToolId,
      };
      return {ok: true, roll: 0, room: next};
    },
    claim(room, input) {
      const next = structuredClone(room);
      const candidate = next.battle.captureCandidatesByActorId[input.actorId];
      candidate.status = "claimed";
      candidate.claimedByAccountId = input.accountId;
      return {ok: true, room: next};
    },
    materialize() {
      return {ok: false, code: "injected_materialize_failure"};
    },
  };
}

test("materialization failure emits no success and consumes neither net nor pet identity", () => {
  const service = createAuthService({
    store: createMemoryAuthStore(),
    allowFullProfileSave: true,
    petCaptureCandidateAuthority: failingMaterializeAuthority(),
  });
  const account = service.register({username: "recoverymaterialize", password: "test1234", displayName: "落档失败号"});
  const saved = service.saveProfile(account.session.token, {
    expectedRevision: 0,
    profile: captureProfile("落档失败号"),
  });
  assert.equal(saved.ok, true);
  const revisionBefore = saved.profileBinding.profileRevision;
  const encounter = service.startPartyEncounter(account.session.token, {
    enemyCount: 2,
    encounterZone: {
      id: "materialize_failure_grass",
      name: "落档失败草丛",
      selectedWildPet: {
        formId: "blue_man_dragon_water10",
        name: "落档失败蓝人龙",
        level: 1,
        catchable: true,
        captureDifficulty: 1,
        captureChanceOverride: 1,
        battleStats: {maxHp: 120, attack: 1, defense: 1, quick: 10},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const player = encounter.room.battle.actors.find((actor) => actor.kind === "player");
  const enemy = encounter.room.battle.actors.find((actor) => actor.side === "enemy");
  const resolved = service.submitBattleCommand(account.session.token, encounter.room.roomId, {
    round: 1,
    actorId: player.actorId,
    actionId: "capture",
    targetActorId: enemy.actorId,
    captureToolId: "capture_net",
  });
  assert.equal(resolved.ok, true);
  const unavailable = resolved.turn.events.find((event) => event.eventType === "capture_unavailable");
  assert.ok(unavailable);
  assert.equal(resolved.turn.events.some((event) => event.eventType === "capture" && event.success), false);
  const internal = internalProfileForAccount(service, account.account.accountId);
  assert.equal(Object.hasOwn(internal, "petRecoveryShelter"), false);
  assert.equal(profileItemCount(service.getProfile(account.session.token).profile, "capture_net"), 1);
  assert.equal(service.getProfile(account.session.token).profileBinding.profileRevision, revisionBefore);
  const room = service.snapshot().battleRooms[encounter.room.roomId];
  assert.equal(room.battle.actors.find((actor) => actor.actorId === enemy.actorId).captured, false);
  assert.equal(room.battle.captureCandidatesByActorId[enemy.actorId].status, "available");
  assert.equal(room.battle.captureCandidatesByActorId[enemy.actorId].attemptCount, 1);
});

test("durable recovery uses the narrow target-profile consistency scope", async () => {
  const base = createMemoryAuthStore();
  const staged = startPendingCapture(base, "recoveryscope");
  const saveOptions = [];
  const service = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "memory",
      load: () => base.load(),
      async saveAsync(nextData, options) {
        saveOptions.push(structuredClone(options));
        base.save(nextData);
      },
    }, {onError: () => {}}),
  });
  const operation = {
    operationId: "operation_pet_recovery_scope_0001",
    requestHash: "d".repeat(64),
    actionId: "POST /pets/recovery/:id/claim",
  };
  const recovered = await service.invokeDurable("claimPetRecovery", [
    staged.account.session.token,
    {recoveryId: staged.recoveryId},
  ], operation);
  assert.equal(recovered.ok, true);
  assert.equal(saveOptions.length, 1);
  assert.deepEqual(saveOptions[0].consistencyScope, {
    kind: "row_local_profile_v1",
    accountId: staged.account.account.accountId,
    playerId: staged.account.profileBinding.playerId,
    operationId: operation.operationId,
    requestHash: operation.requestHash,
    actionId: operation.actionId,
  });
});

test("durable capture replays the committed success after the runtime battle room is lost", async () => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base, allowFullProfileSave: true});
  const account = seed.register({username: "capturereceipt", password: "test1234", displayName: "捕捉回执号"});
  assert.equal(account.ok, true);
  assert.equal(seed.saveProfile(account.session.token, {
    expectedRevision: 0,
    profile: captureProfile("捕捉回执号"),
  }).ok, true);
  const createDurableStore = () => createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      base.save(nextData);
    },
  }, {onError: () => {}});
  const service = createAuthService({store: createDurableStore()});
  const encounter = await service.invokeDurable("startPartyEncounter", [account.session.token, {
    enemyCount: 2,
    encounterZone: {
      id: "capture_receipt_restart_grass",
      name: "捕捉回执草丛",
      selectedWildPet: {
        formId: "blue_man_dragon_water10",
        name: "回执蓝人龙",
        level: 1,
        catchable: true,
        captureDifficulty: 1,
        captureChanceOverride: 1,
        battleStats: {maxHp: 120, attack: 1, defense: 1, quick: 10},
      },
    },
  }], {actionId: "POST /battle/party-encounter"});
  assert.equal(encounter.ok, true);
  const player = encounter.room.battle.actors.find((actor) => actor.kind === "player");
  const enemy = encounter.room.battle.actors.find((actor) => actor.side === "enemy");
  const command = {
    round: 1,
    actorId: player.actorId,
    actionId: "capture",
    targetActorId: enemy.actorId,
    captureToolId: "capture_net",
  };
  const missingKey = await service.invokeDurable("submitBattleCommand", [
    account.session.token,
    encounter.room.roomId,
    command,
  ], {actionId: "POST /battle/rooms/:id/commands"});
  assert.equal(missingKey.ok, false);
  assert.equal(missingKey.code, "idempotency_key_required");

  const operation = {
    operationId: "operation_battle_capture_restart_0001",
    requestHash: "e".repeat(64),
    actionId: "POST /battle/rooms/:id/commands",
  };
  const first = await service.invokeDurable("submitBattleCommand", [
    account.session.token,
    encounter.room.roomId,
    command,
  ], operation);
  assert.equal(first.ok, true);
  assert.equal(first.room.status, "ready");
  const captureEvent = first.turn.events.find((event) => event.eventType === "capture");
  assert.ok(captureEvent);
  const pendingRecoveryIds = Object.keys(internalProfileForAccount(service, account.account.accountId).petRecoveryShelter.pending);
  assert.equal(pendingRecoveryIds.length, 1);
  assert.match(pendingRecoveryIds[0], /^pet_capture_[a-f0-9]{32}$/);

  const latestWithoutReceipt = base.load();
  delete latestWithoutReceipt.mutationReceipts[operation.operationId];
  let staleLoadCalls = 0;
  let receiptReads = 0;
  let staleSaveCalls = 0;
  const restarted = createAuthService({
    store: createAsyncWriteAuthStore({
      mode: "capture-receipt-stale-node",
      load() {
        staleLoadCalls += 1;
        return staleLoadCalls === 1 ? structuredClone(latestWithoutReceipt) : base.load();
      },
      async readDurableMutationReceipt(operationId) {
        receiptReads += 1;
        return {
          schemaVersion: 1,
          operationId,
          authorityCurrent: false,
          receipt: structuredClone(base.load().mutationReceipts[operationId]),
        };
      },
      async saveAsyncOwned() {
        staleSaveCalls += 1;
      },
    }, {onError: () => {}}),
  });
  assert.deepEqual(restarted.snapshot().battleRooms, {});
  const replay = await restarted.invokeDurable("submitBattleCommand", [
    account.session.token,
    encounter.room.roomId,
    command,
  ], operation);
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.turn.events.some((event) => event.eventType === "capture" && event.success), true);
  assert.equal(receiptReads, 1);
  assert.equal(staleLoadCalls, 2);
  assert.equal(staleSaveCalls, 0);
  const internal = internalProfileForAccount(restarted, account.account.accountId);
  assert.equal(Object.keys(internal.petRecoveryShelter.pending).length, 1);
  assert.equal(profileItemCount(internal, "capture_net"), 0);
});
