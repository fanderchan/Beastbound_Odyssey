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

  const beforeRestartPublic = staged.service.getProfile(token);
  assert.equal(Object.hasOwn(beforeRestartPublic.profile, "petRecoveryShelter"), false);
  assert.equal(JSON.stringify(beforeRestartPublic).includes(privateSeed), false);
  assert.equal(profileItemCount(beforeRestartPublic.profile, "capture_net"), 0);

  const restarted = createAuthService({store, allowFullProfileSave: true});
  assert.deepEqual(restarted.snapshot().battleRooms, {});
  const listed = restarted.listPetRecoveries(token);
  assert.equal(listed.ok, true);
  assert.equal(listed.count, 1);
  assert.equal(listed.recoveries[0].recoveryId, staged.recoveryId);
  assert.equal(listed.recoveries[0].pet.formId, exactPet.formId);
  assert.equal(JSON.stringify(listed).includes(privateSeed), false);
  assert.equal(JSON.stringify(listed).includes("privateRoll"), false);

  const current = restarted.getProfile(token);
  const fullProfile = structuredClone(current.profile);
  fullProfile.petInstances = Array.from({length: 25}, (_value, index) => capacityPet(index));
  delete fullProfile.pets;
  const filled = restarted.saveProfile(token, {
    expectedRevision: current.profileBinding.profileRevision,
    profile: fullProfile,
  });
  assert.equal(filled.ok, true);
  const filledPublic = restarted.getProfile(token);
  assert.equal(filledPublic.ok, true);
  const afterFillInternal = internalProfileForAccount(restarted, accountId);
  assert.deepEqual(afterFillInternal.petRecoveryShelter.pending[staged.recoveryId].pet, exactPet);

  const revisionBeforeFullClaim = filled.profileBinding.profileRevision;
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
  assert.equal(profileItemCount(restarted.getProfile(account.session.token).profile, "capture_net"), 0);
});
