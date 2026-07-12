"use strict";

const {
  assert,
  test,
  once,
  createAuthService,
  createMemoryAuthStore,
  createAsyncWriteAuthStore,
  createHttpServer,
  fetchJson,
  internalProfileForAccount,
  isValidPetPrivateSeed,
} = require("../test-support/auth-service-test-context");
const {
  GM_PREPARE_QA_PET_SAMPLES_COMMAND_ID,
  QA_PET_SAMPLE_COUNT,
  QA_PET_SAMPLE_MANIFESTS_PROFILE_KEY,
  QA_PET_SAMPLE_PLAN,
  QA_PET_SAMPLES_MANIFEST_ID,
} = require("../src/auth/gm-qa-pets");
const {loadPetGrowthCatalog} = require("../src/auth/pet-growth-catalog");
const {validatePetGrowth} = require("../src/auth/pet-growth-runtime");

const COMMAND_ID = GM_PREPARE_QA_PET_SAMPLES_COMMAND_ID;
const MANIFEST_ID = QA_PET_SAMPLES_MANIFEST_ID;
const SUMMARY_KEYS = [
  "manifestId",
  "changed",
  "alreadyPrepared",
  "sampleCount",
  "presentCount",
  "missingCount",
  "blueManDragonLv1Count",
  "comparisonLv20Count",
  "partyAdded",
  "storageAdded",
  "reservedCaptureSlots",
  "primaryInstanceId",
  "profileRevisionBefore",
  "profileRevisionAfter",
  "schemaVersion",
].sort();

function registerGm(service, username, commandIds = [COMMAND_ID]) {
  const registered = service.register({username, password: "test1234", displayName: username});
  assert.equal(registered.ok, true);
  assert.equal(service.grantGm({username, commandIds, grantedBy: "gm_qa_pets_test"}).ok, true);
  return registered;
}

function currentProfile(service, token) {
  const result = service.getProfile(token);
  assert.equal(result.ok, true);
  return result;
}

function oldPet(index) {
  const id = `old_player_pet_${String(index + 1).padStart(2, "0")}`;
  const state = index === 0
    ? "battle"
    : (index === 1 ? "riding" : (index < 5 ? "standby" : "storage"));
  return {
    instanceId: id,
    petId: id,
    formId: "wuli_normal_orange_fire10",
    templateId: "wuli_normal_orange_fire10",
    name: `旧宠${index + 1}`,
    state,
    level: 1,
    exp: 0,
    nextExp: 120,
    hp: 60,
    maxHp: 60,
    attack: 10,
    defense: 8,
    quick: 12,
    capturedSerial: index + 1,
    oldUnknownField: {index, keep: true},
    schemaVersion: 1,
  };
}

function seedOldPets(service, gm, count) {
  const current = currentProfile(service, gm.session.token);
  const profile = structuredClone(current.profile);
  profile.petInstances = Array.from({length: count}, (_, index) => oldPet(index));
  profile.nextPetInstanceSerial = count + 1;
  profile.activePetInstanceId = count > 0 ? profile.petInstances[0].instanceId : "";
  profile.ridePetInstanceId = count > 1 ? profile.petInstances[1].instanceId : "";
  profile.futureQaPetCanary = {schemaVersion: 99, opaque: "keep"};
  const saved = service.saveProfile(gm.session.token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile,
  });
  assert.equal(saved.ok, true);
  return saved;
}

function accountProfile(snapshot, accountId) {
  const binding = snapshot.profileBindings[accountId];
  return snapshot.profiles[binding.playerId].profile;
}

function targetPets(profile) {
  return profile.petInstances.filter((pet) => pet && pet.qaSample && pet.qaSample.manifestId === MANIFEST_ID);
}

function assertNoPrivateQaFields(value) {
  const text = JSON.stringify(value);
  for (const forbidden of [
    "privateSeed",
    "privateRoll",
    "continuousStats",
    "gmQaPetSampleManifests",
    "qaSample",
    `\"source\":\"gm_qa_pet_manifest\"`,
  ]) {
    assert.equal(text.includes(forbidden), false, `public response leaked ${forbidden}`);
  }
}

test("GM QA pet samples require current-account authorization and the exact fixed payload", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const player = service.register({username: "qapetplayer", password: "test1234"});
  const before = currentProfile(service, player.session.token);

  assert.equal(service.prepareGmQaPetSamples(player.session.token, {manifestId: MANIFEST_ID}).code, "gm_denied");
  assert.equal(service.grantGm({
    username: "qapetplayer",
    commandIds: ["gm_map"],
    grantedBy: "gm_qa_pets_test",
  }).ok, true);
  assert.equal(service.prepareGmQaPetSamples(player.session.token, {manifestId: MANIFEST_ID}).code, "command_denied");
  assert.equal(service.grantGm({
    username: "qapetplayer",
    commandIds: [COMMAND_ID],
    grantedBy: "gm_qa_pets_test",
  }).ok, true);

  for (const payload of [
    {},
    {manifestId: "qa_pet_samples_v2"},
    {manifestId: MANIFEST_ID, targetUsername: "other"},
    {manifestId: MANIFEST_ID, count: 13},
    {manifestId: MANIFEST_ID, targetLevel: 140},
    {manifestId: MANIFEST_ID, privateSeed: "client_seed"},
  ]) {
    const denied = service.prepareGmQaPetSamples(player.session.token, payload);
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "gm_qa_pet_samples_payload_invalid");
  }
  assert.equal(service.prepareGmQaPetSamples("", {manifestId: MANIFEST_ID}).code, "session_missing");
  const after = currentProfile(service, player.session.token);
  assert.equal(after.profileSummary.profileRevision, before.profileSummary.profileRevision);
  assert.deepEqual(after.profile, before.profile);

  const wildcard = registerGm(service, "qapetwildcard", ["*"]);
  const allowed = service.prepareGmQaPetSamples(wildcard.session.token, {manifestId: MANIFEST_ID});
  assert.equal(allowed.ok, true);
  assert.equal(allowed.result.summary.sampleCount, QA_PET_SAMPLE_COUNT);
});

test("fixed manifest creates ten random Lv1 blue dragons and three canonical Lv20 comparisons once", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(service, "qapetmanifest");
  const first = service.prepareGmQaPetSamples(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(first.ok, true);
  assert.deepEqual(Object.keys(first.result.summary).sort(), SUMMARY_KEYS);
  assert.deepEqual(first.result.summary, {
    manifestId: MANIFEST_ID,
    changed: true,
    alreadyPrepared: false,
    sampleCount: 13,
    presentCount: 13,
    missingCount: 0,
    blueManDragonLv1Count: 10,
    comparisonLv20Count: 3,
    partyAdded: 5,
    storageAdded: 8,
    reservedCaptureSlots: 12,
    primaryInstanceId: first.result.summary.primaryInstanceId,
    profileRevisionBefore: 0,
    profileRevisionAfter: 1,
    schemaVersion: 1,
  });
  assert.equal(first.result.summary.primaryInstanceId.startsWith("pet_gmqa_"), true);
  assert.equal(first.profile.petInstances.length, 13);
  assert.equal(first.profile.petInstances.filter((pet) => pet.formId === "blue_man_dragon_water10" && pet.level === 1).length, 10);
  assert.deepEqual(first.profile.petInstances.slice(10).map((pet) => [pet.formId, pet.level]), [
    ["wuli_normal_tough_earth10", 20],
    ["driftfox_highland_wind9_earth1", 20],
    ["tidefin_mist_water8_wind2", 20],
  ]);
  for (const pet of first.profile.petInstances) {
    assert.equal(pet.locked, true);
    assert.equal(pet.binding, "bound");
    assert.equal(pet.bound, true);
    assert.equal(pet.growthAuthority.source, "server");
    assert.equal(Object.hasOwn(pet, "qaSample"), false);
    assert.equal(Object.hasOwn(pet, "source"), false);
  }
  assert.equal(Object.hasOwn(first.profile, QA_PET_SAMPLE_MANIFESTS_PROFILE_KEY), false);
  assertNoPrivateQaFields(first);

  const internal = internalProfileForAccount(service, gm.account.accountId);
  const samples = targetPets(internal);
  assert.equal(samples.length, 13);
  assert.equal(Object.hasOwn(internal, QA_PET_SAMPLE_MANIFESTS_PROFILE_KEY), true);
  assert.equal(internal[QA_PET_SAMPLE_MANIFESTS_PROFILE_KEY][MANIFEST_ID].slots.length, 13);
  assert.equal(service.snapshot().gmCommandAudit.filter((row) => row.commandId === COMMAND_ID).length, 1);
  for (const formId of [
    "blue_man_dragon_water10",
    "wuli_normal_tough_earth10",
    "driftfox_highland_wind9_earth1",
    "tidefin_mist_water8_wind2",
  ]) {
    assert.equal(internal.petCodexCapturedFormIds.includes(formId), true);
  }
  const seeds = samples.map((pet) => pet.petGrowth.private.privateSeed);
  assert.equal(seeds.every(isValidPetPrivateSeed), true);
  assert.equal(new Set(seeds).size, 13);

  const catalog = loadPetGrowthCatalog();
  for (const pet of samples) {
    const growthProfile = catalog.profileById(pet.growthSpeciesProfileId);
    assert.deepEqual(validatePetGrowth(pet, growthProfile), {ok: true, code: "", errors: []});
    assert.equal(pet.petGrowth.settledLevel, pet.level);
    assert.equal(pet.locked, true);
    assert.equal(pet.binding, "bound");
    assert.equal(pet.bound, true);
    assert.equal(pet.source, "gm_qa_pet_manifest");
  }
  for (const pet of samples.filter((entry) => entry.level === 20)) {
    assert.equal(pet.exp, 0);
    assert.equal(pet.nextExp > 0, true);
    assert.equal(["maxHp", "attack", "defense", "quick"].some((key) => pet[key] > pet.initialStats[key]), true);
  }
});

test("old gm_command blue dragons remain ordinary assets and never satisfy manifest slots", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(service, "qapetoldblue", [COMMAND_ID, "gm_grant_pet"]);
  const oldGrant = service.grantGmPet(gm.session.token, {growthSpeciesProfileId: "blue_man_dragon_v1"});
  assert.equal(oldGrant.ok, true);
  const oldInternal = structuredClone(
    internalProfileForAccount(service, gm.account.accountId).petInstances.find((pet) => pet.instanceId === oldGrant.result.instanceId),
  );

  const prepared = service.prepareGmQaPetSamples(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(prepared.ok, true);
  assert.equal(prepared.result.summary.sampleCount, 13);
  assert.equal(prepared.profile.petInstances.length, 14);
  assert.equal(prepared.profile.petInstances.filter((pet) => pet.formId === "blue_man_dragon_water10").length, 11);
  assert.equal(targetPets(internalProfileForAccount(service, gm.account.accountId)).length, 13);
  assert.deepEqual(
    internalProfileForAccount(service, gm.account.accountId).petInstances.find((pet) => pet.instanceId === oldGrant.result.instanceId),
    oldInternal,
  );
});

test("missing profiles and binding or revision mismatches are never repaired by the QA command", () => {
  const seed = createAuthService({store: createMemoryAuthStore()});
  const missingGm = registerGm(seed, "qapetmissing");
  const mismatchGm = registerGm(seed, "qapetmismatch");
  const revisionGm = registerGm(seed, "qapetrevision");
  const snapshot = seed.snapshot();
  const missingBinding = snapshot.profileBindings[missingGm.account.accountId];
  const mismatchBinding = snapshot.profileBindings[mismatchGm.account.accountId];
  const revisionBinding = snapshot.profileBindings[revisionGm.account.accountId];
  delete snapshot.profiles[missingBinding.playerId];
  snapshot.profiles[mismatchBinding.playerId].accountId = missingGm.account.accountId;
  revisionBinding.profileRevision += 1;
  const before = structuredClone(snapshot);
  const service = createAuthService({store: createMemoryAuthStore(snapshot)});

  assert.equal(service.prepareGmQaPetSamples(missingGm.session.token, {manifestId: MANIFEST_ID}).code, "profile_missing");
  assert.equal(service.prepareGmQaPetSamples(mismatchGm.session.token, {manifestId: MANIFEST_ID}).code, "profile_binding_conflict");
  assert.equal(service.prepareGmQaPetSamples(revisionGm.session.token, {manifestId: MANIFEST_ID}).code, "profile_binding_conflict");
  const after = service.snapshot();
  for (const accountId of [missingGm.account.accountId, mismatchGm.account.accountId, revisionGm.account.accountId]) {
    const beforeBinding = before.profileBindings[accountId];
    const afterBinding = after.profileBindings[accountId];
    assert.deepEqual(afterBinding, beforeBinding);
    if (before.profiles[beforeBinding.playerId]) {
      assert.deepEqual(after.profiles[beforeBinding.playerId], before.profiles[beforeBinding.playerId]);
    }
  }
});

test("eleven old pets are preserved at 24 total while twelve old pets fail atomically", () => {
  const successService = createAuthService({store: createMemoryAuthStore()});
  const successGm = registerGm(successService, "qapetcapacity11");
  const saved = seedOldPets(successService, successGm, 11);
  const beforeInternal = structuredClone(internalProfileForAccount(successService, successGm.account.accountId));
  const prepared = successService.prepareGmQaPetSamples(successGm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(prepared.ok, true);
  assert.equal(prepared.profile.petInstances.length, 24);
  assert.equal(prepared.result.summary.partyAdded, 0);
  assert.equal(prepared.result.summary.storageAdded, 13);
  assert.equal(prepared.result.summary.reservedCaptureSlots, 1);
  assert.equal(prepared.result.summary.profileRevisionBefore, saved.profileSummary.profileRevision);
  const successAfter = internalProfileForAccount(successService, successGm.account.accountId);
  assert.deepEqual(successAfter.petInstances.slice(0, 11), beforeInternal.petInstances);
  assert.deepEqual(successAfter.futureQaPetCanary, {schemaVersion: 99, opaque: "keep"});
  assert.equal(successAfter.activePetInstanceId, beforeInternal.activePetInstanceId);
  assert.equal(successAfter.ridePetInstanceId, beforeInternal.ridePetInstanceId);

  const blockedService = createAuthService({store: createMemoryAuthStore()});
  const blockedGm = registerGm(blockedService, "qapetcapacity12");
  seedOldPets(blockedService, blockedGm, 12);
  const before = blockedService.snapshot();
  const binding = before.profileBindings[blockedGm.account.accountId];
  const beforeProfile = structuredClone(before.profiles[binding.playerId].profile);
  const beforeRevision = binding.profileRevision;
  const blocked = blockedService.prepareGmQaPetSamples(blockedGm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "gm_qa_pet_samples_capacity_full");
  const after = blockedService.snapshot();
  assert.equal(after.profileBindings[blockedGm.account.accountId].profileRevision, beforeRevision);
  assert.deepEqual(after.profiles[binding.playerId].profile, beforeProfile);
});

test("permanent ledger makes new calls no-op and deleted samples are never regenerated", () => {
  const base = createMemoryAuthStore();
  const service = createAuthService({store: base});
  const gm = registerGm(service, "qapetledger", [COMMAND_ID, "gm_level_pet"]);
  const first = service.prepareGmQaPetSamples(gm.session.token, {manifestId: MANIFEST_ID});
  const firstRevision = first.profileSummary.profileRevision;
  const primaryId = first.result.summary.primaryInstanceId;

  const leveled = service.levelUpGmPet(gm.session.token, {instanceId: primaryId});
  assert.equal(leveled.ok, true);
  const unlocked = service.profileAction(gm.session.token, {
    action: "pet_lock_toggle",
    payload: {instanceId: primaryId},
  });
  assert.equal(unlocked.ok, true);
  const revisionAfterPlayerChanges = unlocked.profileSummary.profileRevision;
  const noOp = service.prepareGmQaPetSamples(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(noOp.ok, true);
  assert.equal(noOp.result.summary.changed, false);
  assert.equal(noOp.result.summary.alreadyPrepared, true);
  assert.equal(noOp.result.summary.presentCount, 13);
  assert.equal(noOp.result.summary.missingCount, 0);
  assert.equal(noOp.result.summary.primaryInstanceId, primaryId);
  assert.equal(noOp.profileSummary.profileRevision, revisionAfterPlayerChanges);
  assert.equal(noOp.profile.petInstances.find((pet) => pet.instanceId === primaryId).level, 2);
  assert.equal(noOp.profile.petInstances.find((pet) => pet.instanceId === primaryId).locked, false);
  assert.equal(firstRevision < revisionAfterPlayerChanges, true);

  const withDeletion = service.snapshot();
  const profile = accountProfile(withDeletion, gm.account.accountId);
  profile.petInstances = profile.petInstances.filter((pet) => pet.instanceId !== primaryId);
  const deletedRevision = withDeletion.profileBindings[gm.account.accountId].profileRevision;
  const restarted = createAuthService({store: createMemoryAuthStore(withDeletion)});
  const afterDelete = restarted.prepareGmQaPetSamples(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(afterDelete.ok, true);
  assert.equal(afterDelete.result.summary.changed, false);
  assert.equal(afterDelete.result.summary.alreadyPrepared, true);
  assert.equal(afterDelete.result.summary.presentCount, 12);
  assert.equal(afterDelete.result.summary.missingCount, 1);
  assert.equal(afterDelete.result.summary.primaryInstanceId, "");
  assert.equal(afterDelete.profile.petInstances.length, 12);
  assert.equal(afterDelete.profileSummary.profileRevision, deletedRevision);
  assert.equal(targetPets(internalProfileForAccount(restarted, gm.account.accountId)).length, 12);
});

test("damaged ledgers, duplicate slots, marker drift, and partial batches fail closed", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(seedService, "qapetdamage");
  assert.equal(seedService.prepareGmQaPetSamples(gm.session.token, {manifestId: MANIFEST_ID}).ok, true);
  const base = seedService.snapshot();
  const binding = base.profileBindings[gm.account.accountId];
  const playerId = binding.playerId;

  const cases = [
    {
      label: "future profile schema",
      code: "gm_qa_pet_samples_profile_invalid",
      mutate(profile) {
        profile.schemaVersion = 99;
      },
    },
    {
      label: "duplicate pet identity",
      code: "gm_qa_pet_samples_identity_conflict",
      mutate(profile) {
        profile.petInstances[1].instanceId = profile.petInstances[0].instanceId;
        profile.petInstances[1].petId = profile.petInstances[0].instanceId;
      },
    },
    {
      label: "future ledger",
      code: "gm_qa_pet_samples_ledger_invalid",
      mutate(profile) {
        profile[QA_PET_SAMPLE_MANIFESTS_PROFILE_KEY][MANIFEST_ID].schemaVersion = 2;
      },
    },
    {
      label: "duplicate ledger slot",
      code: "gm_qa_pet_samples_ledger_invalid",
      mutate(profile) {
        const slots = profile[QA_PET_SAMPLE_MANIFESTS_PROFILE_KEY][MANIFEST_ID].slots;
        slots[1] = structuredClone(slots[0]);
      },
    },
    {
      label: "marker origin drift",
      code: "gm_qa_pet_samples_provenance_invalid",
      mutate(profile) {
        profile.petInstances[0].qaSample.originFormId = "other_form";
      },
    },
    {
      label: "future marker",
      code: "gm_qa_pet_samples_provenance_invalid",
      mutate(profile) {
        profile.petInstances[0].qaSample.schemaVersion = 2;
      },
    },
    {
      label: "binding drift",
      code: "gm_qa_pet_samples_provenance_conflict",
      mutate(profile) {
        profile.petInstances[0].binding = "unbound";
        profile.petInstances[0].bound = false;
      },
    },
    {
      label: "private growth damage",
      code: "gm_qa_pet_samples_state_invalid",
      mutate(profile) {
        delete profile.petInstances[0].petGrowth.private.privateSeed;
      },
    },
    {
      label: "ledger missing around marked pets",
      code: "gm_qa_pet_samples_provenance_conflict",
      mutate(profile) {
        delete profile[QA_PET_SAMPLE_MANIFESTS_PROFILE_KEY];
      },
    },
    {
      label: "instance drift",
      code: "gm_qa_pet_samples_provenance_conflict",
      mutate(profile) {
        profile.petInstances[0].instanceId += "_drift";
        profile.petInstances[0].petId = profile.petInstances[0].instanceId;
      },
    },
    {
      label: "duplicate provenance",
      code: "gm_qa_pet_samples_provenance_conflict",
      mutate(profile) {
        profile.petInstances[1].qaSample = structuredClone(profile.petInstances[0].qaSample);
      },
    },
  ];

  for (const fixture of cases) {
    const snapshot = structuredClone(base);
    fixture.mutate(snapshot.profiles[playerId].profile);
    const beforeProfile = structuredClone(snapshot.profiles[playerId].profile);
    const beforeRevision = snapshot.profileBindings[gm.account.accountId].profileRevision;
    const service = createAuthService({store: createMemoryAuthStore(snapshot)});
    const blocked = service.prepareGmQaPetSamples(gm.session.token, {manifestId: MANIFEST_ID});
    assert.equal(blocked.ok, false, fixture.label);
    assert.equal(blocked.code, fixture.code, fixture.label);
    const after = service.snapshot();
    assert.equal(after.profileBindings[gm.account.accountId].profileRevision, beforeRevision, fixture.label);
    assert.deepEqual(after.profiles[playerId].profile, beforeProfile, fixture.label);
  }
});

test("sample preparation is locked during battle and active offline hang", () => {
  const battleService = createAuthService({store: createMemoryAuthStore()});
  const gm = registerGm(battleService, "qapetbattle");
  const rival = battleService.register({username: "qapetrival", password: "test1234"});
  battleService.updatePlayerPosition(gm.session.token, {mapId: "village", cellX: 10, cellY: 10, facing: "east", moving: false});
  battleService.updatePlayerPosition(rival.session.token, {mapId: "village", cellX: 11, cellY: 10, facing: "west", moving: false});
  const invite = battleService.inviteToBattle(gm.session.token, {username: "qapetrival"});
  assert.equal(invite.ok, true);
  assert.equal(battleService.acceptBattleInvite(rival.session.token, invite.invite.inviteId).ok, true);
  assert.equal(
    battleService.prepareGmQaPetSamples(gm.session.token, {manifestId: MANIFEST_ID}).code,
    "battle_profile_mutation_locked",
  );

  const offlineSeed = createAuthService({store: createMemoryAuthStore()});
  const offlineGm = registerGm(offlineSeed, "qapetoffline");
  const snapshot = offlineSeed.snapshot();
  accountProfile(snapshot, offlineGm.account.accountId).offlineHang.session.status = "active";
  const offlineService = createAuthService({store: createMemoryAuthStore(snapshot)});
  assert.equal(
    offlineService.prepareGmQaPetSamples(offlineGm.session.token, {manifestId: MANIFEST_ID}).code,
    "offline_hang_active",
  );
});

test("HTTP sample preparation requires a durable key, replays once, and new keys converge by ledger", async (t) => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const gm = registerGm(seed, "httpqapets");
  const otherGm = registerGm(seed, "httpqapetsother");
  let saveCount = 0;
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      saveCount += 1;
      base.save(nextData);
    },
  }, {onError: () => {}});
  const service = createAuthService({store});
  const server = createHttpServer({service, store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await service.waitForDurableIdle();
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  });
  const endpoint = `http://127.0.0.1:${server.address().port}/gm/commands/${COMMAND_ID}`;
  const body = JSON.stringify({manifestId: MANIFEST_ID});

  const missingKey = await fetchJson(endpoint, {
    method: "POST",
    headers: {authorization: `Bearer ${gm.session.token}`},
    body,
  });
  assert.equal(missingKey.code, "idempotency_key_required");
  assert.equal(saveCount, 0);

  const operationId = "bbo_gm_qa_pet_samples_0001";
  const headers = {
    authorization: `Bearer ${gm.session.token}`,
    "Idempotency-Key": operationId,
  };
  const first = await fetchJson(endpoint, {method: "POST", headers, body});
  assert.equal(first.ok, true);
  assert.equal(first.result.summary.changed, true);
  assert.equal(first.durableCommit.operationId, operationId);
  assert.equal(first.durableCommit.replayed, false);
  assertNoPrivateQaFields(first);
  const savesAfterFirst = saveCount;
  const firstAuditId = first.auditId;
  const revisionAfterFirst = first.profileSummary.profileRevision;

  const replay = await fetchJson(endpoint, {method: "POST", headers, body});
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.auditId, firstAuditId);
  assert.equal(saveCount, savesAfterFirst);

  const changedIntent = await fetchJson(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({manifestId: "qa_pet_samples_v2"}),
  });
  assert.equal(changedIntent.code, "idempotency_key_conflict");
  const crossAccount = await fetchJson(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${otherGm.session.token}`,
      "Idempotency-Key": operationId,
    },
    body,
  });
  assert.equal(crossAccount.code, "idempotency_key_conflict");

  const next = await fetchJson(endpoint, {
    method: "POST",
    headers: {...headers, "Idempotency-Key": "bbo_gm_qa_pet_samples_0002"},
    body,
  });
  assert.equal(next.ok, true);
  assert.equal(next.result.summary.changed, false);
  assert.equal(next.result.summary.alreadyPrepared, true);
  assert.equal(next.profileSummary.profileRevision, revisionAfterFirst);
  assert.equal(next.profile.petInstances.length, 13);
  assert.equal(base.load().mutationReceipts[operationId].accountId, gm.account.accountId);

  const restarted = createAuthService({store: createMemoryAuthStore(base.load())});
  const afterRestart = restarted.prepareGmQaPetSamples(gm.session.token, {manifestId: MANIFEST_ID});
  assert.equal(afterRestart.ok, true);
  assert.equal(afterRestart.result.summary.changed, false);
  assert.equal(afterRestart.profile.petInstances.length, 13);
});

test("failed durable COMMIT publishes no samples and the same key recovers exactly one batch", async (t) => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base});
  const gm = registerGm(seed, "httpqapetsfailure");
  const binding = base.load().profileBindings[gm.account.accountId];
  const before = structuredClone(base.load().profiles[binding.playerId].profile);
  let failNextSave = true;
  let saveCount = 0;
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      saveCount += 1;
      if (failNextSave) {
        failNextSave = false;
        throw new Error("injected QA pet sample commit failure");
      }
      base.save(nextData);
    },
  }, {onError: () => {}});
  const service = createAuthService({store});
  const server = createHttpServer({service, store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await service.waitForDurableIdle();
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  });
  const operationId = "bbo_gm_qa_pet_samples_failure_0001";
  const request = {
    method: "POST",
    headers: {
      authorization: `Bearer ${gm.session.token}`,
      "Idempotency-Key": operationId,
    },
    body: JSON.stringify({manifestId: MANIFEST_ID}),
  };
  const endpoint = `http://127.0.0.1:${server.address().port}/gm/commands/${COMMAND_ID}`;

  const failed = await fetchJson(endpoint, request);
  assert.equal(failed.ok, false);
  assert.equal(failed.code, "storage_write_failed");
  assert.deepEqual(base.load().profiles[binding.playerId].profile, before);
  assert.equal(Object.hasOwn(base.load().mutationReceipts, operationId), false);

  const recovered = await fetchJson(endpoint, request);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.result.summary.changed, true);
  assert.equal(recovered.durableCommit.operationId, operationId);
  assert.equal(recovered.durableCommit.replayed, false);
  assert.equal(recovered.profile.petInstances.length, 13);
  assert.equal(targetPets(accountProfile(base.load(), gm.account.accountId)).length, 13);
  assert.equal(saveCount, 2);
});
