"use strict";

const {
  assert,
  test,
  once,
  createAuthService,
  createMemoryAuthStore,
  createHttpServer,
  fetchJson,
  internalProfileForAccount,
} = require("../test-support/auth-service-test-context");
const {
  GM_PET_EVOLUTION_QA_MANIFEST_ID,
  QA_STONE_COIN_MINIMUM,
} = require("../src/auth/gm-pet-evolution-qa");

const COMMAND_ID = "gm_pet_evolution_qa";
const NOW_MS = Date.parse("2026-07-18T08:00:00.000Z");

function registerGm(service) {
  const registered = service.register({
    username: "auth1373",
    password: "test1234",
    displayName: "宠物进化验收GM",
  });
  assert.equal(registered.ok, true);
  assert.equal(service.grantGm({
    username: "auth1373",
    commandIds: [COMMAND_ID],
    policyId: "test_pet_evolution_qa_v1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    grantedBy: "pet_evolution_qa_test",
  }).ok, true);
  return registered;
}

function invokeQa(service, gm, operationId, requestHash) {
  return service.invokeDurable("prepareGmPetEvolutionQa", [gm.session.token, {
    manifestId: GM_PET_EVOLUTION_QA_MANIFEST_ID,
  }], {
    actionId: "POST /gm/pets/evolution/qa",
    operationId,
    requestHash,
  });
}

function itemCount(profile, itemId) {
  return (Array.isArray(profile.backpackSlots) ? profile.backpackSlots : [])
    .filter((slot) => String(slot && slot.itemId || "") === itemId)
    .reduce((sum, slot) => sum + Math.max(0, Math.trunc(Number(slot.count || 0))), 0);
}

test("GM evolution QA prepares both routes above and below P90 without opening production", async () => {
  const service = createAuthService({store: createMemoryAuthStore(), now: () => NOW_MS});
  const gm = registerGm(service);
  const first = await invokeQa(
    service,
    gm,
    "gm_pet_evolution_qa_prepare_0001",
    "d".repeat(64),
  );
  assert.equal(first.ok, true, first.message);
  assert.equal(first.result.summary.samplesCreated, 4);
  assert.equal(first.result.summary.sampleCount, 4);
  assert.equal(first.result.summary.presentCount, 4);
  assert.equal(first.result.summary.expectationMatchedCount, 4);
  assert.equal(first.result.samples.length, 4);
  assert.equal(first.result.samples.every((sample) => sample.level === 140 && sample.rebirthCount === 1), true);
  assert.equal(first.result.samples.filter((sample) => sample.eligible).length, 2);
  assert.equal(first.result.samples.filter((sample) => !sample.eligible).length, 2);
  for (const sample of first.result.samples) {
    assert.equal(sample.matchesExpectation, true);
    assert.equal(sample.requiredPercentile, 90);
    assert.equal(sample.eligible, sample.intrinsicCombatPower >= sample.minimumIntrinsicCombatPower);
  }
  assert.equal(first.result.assetGate.runtimeEnabled, false);
  assert.equal(first.result.assetGate.productionOpen, false);
  assert.equal(first.result.assetGate.routes.every((route) => route.status === "deferred"), true);
  assert.equal(first.result.summary.boundStoneCoins, QA_STONE_COIN_MINIMUM);
  assert.equal(first.result.materials.length, 3);
  assert.equal(first.result.materials.every((item) => item.available >= item.required), true);
  assert.equal(JSON.stringify(first).includes("privateSeed"), false);
  assert.equal(JSON.stringify(first).includes("privateRoll"), false);

  const internal = internalProfileForAccount(service, gm.account.accountId);
  const sampleIds = first.result.samples.map((sample) => sample.instanceId);
  const internalSamples = internal.petInstances.filter((pet) => sampleIds.includes(pet.instanceId));
  assert.equal(internalSamples.length, 4);
  assert.equal(internalSamples.every((pet) => String(pet.petGrowth.private.privateSeed || "") !== ""), true);
  assert.equal(internalSamples.every((pet) => pet.level === 140 && pet.petCultivation.rebirthCount === 1), true);
  assert.equal(internal.gmQaPetSampleManifests[GM_PET_EVOLUTION_QA_MANIFEST_ID].slots.length, 4);
  assert.equal(internal.unlockedAbilities.includes("pet_evolution_wuli_license"), true);
  assert.equal(internal.unlockedAbilities.includes("pet_evolution_driftfox_license"), true);
  for (const material of first.result.materials) {
    assert.equal(itemCount(internal, material.itemId), material.required);
  }

  const replay = await invokeQa(
    service,
    gm,
    "gm_pet_evolution_qa_prepare_0001",
    "d".repeat(64),
  );
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(internalProfileForAccount(service, gm.account.accountId).petInstances.length, internal.petInstances.length);

  const refreshed = await invokeQa(
    service,
    gm,
    "gm_pet_evolution_qa_refresh_0002",
    "e".repeat(64),
  );
  assert.equal(refreshed.ok, true);
  assert.equal(refreshed.result.summary.samplesCreated, 0);
  assert.equal(refreshed.result.summary.alreadyPrepared, true);
  assert.equal(refreshed.result.summary.expectationMatchedCount, 4);
  assert.equal(internalProfileForAccount(service, gm.account.accountId).petInstances.length, internal.petInstances.length);
});

test("HTTP GM evolution QA requires idempotency and returns only public pet data", async (t) => {
  const store = createMemoryAuthStore();
  const service = createAuthService({store, now: () => NOW_MS});
  const gm = registerGm(service);
  const server = createHttpServer({service, store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await service.waitForDurableIdle();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const authorization = {authorization: `Bearer ${gm.session.token}`};
  const body = JSON.stringify({manifestId: GM_PET_EVOLUTION_QA_MANIFEST_ID});

  const unauthenticated = await fetchJson(`${base}/gm/pets/evolution/qa`, {
    method: "POST",
    headers: {"Idempotency-Key": "gm_pet_evolution_qa_unauthenticated_0001"},
    body,
  });
  assert.equal(unauthenticated.ok, false);
  assert.equal(unauthenticated.code, "session_missing");

  const ordinary = service.register({
    username: "evolutionqaplayer",
    password: "test1234",
    displayName: "普通玩家",
  });
  assert.equal(ordinary.ok, true);
  const unauthorized = await fetchJson(`${base}/gm/pets/evolution/qa`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ordinary.session.token}`,
      "Idempotency-Key": "gm_pet_evolution_qa_unauthorized_0001",
    },
    body,
  });
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.code, "gm_denied");

  const missing = await fetchJson(`${base}/gm/pets/evolution/qa`, {
    method: "POST",
    headers: authorization,
    body,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "idempotency_key_required");

  const prepared = await fetchJson(`${base}/gm/pets/evolution/qa`, {
    method: "POST",
    headers: {...authorization, "Idempotency-Key": "gm_pet_evolution_qa_http_0001"},
    body,
  });
  assert.equal(prepared.ok, true, prepared.message);
  assert.equal(prepared.result.summary.presentCount, 4);
  assert.equal(prepared.result.summary.expectationMatchedCount, 4);
  assert.equal(Array.isArray(prepared.profile.petInstances), true);
  assert.equal(Object.hasOwn(prepared.profile, "gmQaPetSampleManifests"), false);
  assert.equal(JSON.stringify(prepared).includes("privateSeed"), false);
  assert.equal(JSON.stringify(prepared).includes("privateRoll"), false);

  const replay = await fetchJson(`${base}/gm/pets/evolution/qa`, {
    method: "POST",
    headers: {...authorization, "Idempotency-Key": "gm_pet_evolution_qa_http_0001"},
    body,
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.deepEqual(replay.result.samples, prepared.result.samples);

  const conflictingIntent = await fetchJson(`${base}/gm/pets/evolution/qa`, {
    method: "POST",
    headers: {...authorization, "Idempotency-Key": "gm_pet_evolution_qa_http_0001"},
    body: JSON.stringify({manifestId: "pet_evolution_qa_v2"}),
  });
  assert.equal(conflictingIntent.ok, false);
  assert.equal(conflictingIntent.code, "idempotency_key_conflict");
});
