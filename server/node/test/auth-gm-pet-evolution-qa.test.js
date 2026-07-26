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
const {
  createDisabledPetEvolutionRouteCatalog,
  createEnabledPetEvolutionRouteCatalog,
} = require("../test-support/pet-evolution-fixture");

const COMMAND_ID = "gm_pet_evolution_qa";
const NOW_MS = Date.parse("2026-07-18T08:00:00.000Z");
const ROUTE_CASES = Object.freeze([
  Object.freeze({
    routeId: "wuli_crystal_evolution_v1",
    sourceFormId: "wuli_normal_tough_earth10",
    sourceFormName: "高防乌力",
    targetFormId: "wuli_evolved_crystal_earth8_water2",
    targetFormName: "晶甲乌力",
  }),
  Object.freeze({
    routeId: "driftfox_moon_gale_evolution_v1",
    sourceFormId: "driftfox_highland_wind9_earth1",
    sourceFormName: "高地风狐",
    targetFormId: "driftfox_evolved_moon_gale_wind7_water3",
    targetFormName: "月岚风狐",
  }),
]);

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

test("GM evolution QA prepares both routes above and below P90 against the production-open source", async () => {
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
  for (const routeCase of ROUTE_CASES) {
    const routeSamples = first.result.samples.filter((sample) => sample.routeId === routeCase.routeId);
    assert.equal(routeSamples.length, 2);
    assert.equal(routeSamples.every((sample) => sample.sourceFormName === routeCase.sourceFormName), true);
    assert.equal(routeSamples.every((sample) => sample.targetFormName === routeCase.targetFormName), true);
    assert.deepEqual(
      routeSamples.map((sample) => sample.expectedEligible).sort(),
      [false, true],
    );
    assert.deepEqual(
      routeSamples.map((sample) => sample.eligible).sort(),
      [false, true],
    );
    assert.equal(
      routeSamples.find((sample) => !sample.expectedEligible).eligibilityCode,
      "pet_evolution_power_below_p90",
    );
    assert.equal(routeSamples.find((sample) => sample.expectedEligible).eligibilityCode, "ok");
  }
  assert.equal(first.result.assetGate.runtimeEnabled, true);
  assert.equal(first.result.assetGate.productionOpen, true);
  assert.equal(first.result.assetGate.routes.every((route) => route.status === "formal"), true);
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

test("GM evolution QA keeps an explicit disabled fixture visibly closed", async () => {
  const service = createAuthService({
    store: createMemoryAuthStore(),
    now: () => NOW_MS,
    petEvolutionRouteCatalog: createDisabledPetEvolutionRouteCatalog(),
  });
  const gm = registerGm(service);
  const prepared = await invokeQa(
    service,
    gm,
    "gm_pet_evolution_qa_disabled_fixture_0001",
    "a".repeat(64),
  );
  assert.equal(prepared.ok, true, prepared.message);
  assert.equal(prepared.result.assetGate.runtimeEnabled, false);
  assert.equal(prepared.result.assetGate.productionOpen, false);
  assert.equal(prepared.result.assetGate.routes.every((route) => route.status === "deferred"), true);
});

test("local HTTP QA backend proves two rejected and two successful production evolutions", async (t) => {
  const catalog = createEnabledPetEvolutionRouteCatalog();
  const store = createMemoryAuthStore();
  const service = createAuthService({
    store,
    now: () => NOW_MS,
    petEvolutionRouteCatalog: catalog,
  });
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
  const prepared = await fetchJson(`${base}/gm/pets/evolution/qa`, {
    method: "POST",
    headers: {
      ...authorization,
      "Idempotency-Key": "gm_pet_evolution_qa_two_routes_prepare_0001",
    },
    body: JSON.stringify({manifestId: GM_PET_EVOLUTION_QA_MANIFEST_ID}),
  });
  assert.equal(prepared.ok, true, prepared.message);
  assert.equal(prepared.result.assetGate.productionOpen, true);

  for (const routeCase of ROUTE_CASES) {
    const routeSamples = prepared.result.samples.filter((sample) => sample.routeId === routeCase.routeId);
    const rejectedSample = routeSamples.find((sample) => sample.expectedEligible === false);
    const acceptedSample = routeSamples.find((sample) => sample.expectedEligible === true);
    assert.ok(rejectedSample);
    assert.ok(acceptedSample);

    const beforeRejectedQuote = structuredClone(service.snapshot());
    const rejectedQuote = await fetchJson(
      `${base}/pets/evolution/quote?instanceId=${encodeURIComponent(rejectedSample.instanceId)}&routeId=${encodeURIComponent(routeCase.routeId)}`,
      {headers: authorization},
    );
    assert.equal(rejectedQuote.ok, false);
    assert.equal(rejectedQuote.code, "pet_evolution_power_below_p90");
    assert.deepEqual(service.snapshot(), beforeRejectedQuote);

    const currentProfile = service.getProfile(gm.session.token);
    assert.equal(currentProfile.ok, true);
    const beforeRejectedMutation = structuredClone(service.snapshot());
    const rejectedMutation = await fetchJson(`${base}/pets/evolution`, {
      method: "POST",
      headers: {
        ...authorization,
        "Idempotency-Key": `gm_pet_evolution_qa_${routeCase.routeId}_reject_0001`,
      },
      body: JSON.stringify({
        instanceId: rejectedSample.instanceId,
        routeId: routeCase.routeId,
        expectedProfileRevision: currentProfile.profileSummary.profileRevision,
        expectedCatalogId: catalog.catalogId,
      }),
    });
    assert.equal(rejectedMutation.ok, false);
    assert.equal(rejectedMutation.code, "pet_evolution_power_below_p90");
    assert.deepEqual(service.snapshot(), beforeRejectedMutation);

    const acceptedQuote = await fetchJson(
      `${base}/pets/evolution/quote?instanceId=${encodeURIComponent(acceptedSample.instanceId)}&routeId=${encodeURIComponent(routeCase.routeId)}`,
      {headers: authorization},
    );
    assert.equal(acceptedQuote.ok, true, acceptedQuote.message);
    assert.equal(acceptedQuote.petEvolutionQuote.routeId, routeCase.routeId);
    assert.equal(acceptedQuote.petEvolutionQuote.result.targetFormId, routeCase.targetFormId);
    assert.equal(acceptedQuote.petEvolutionQuote.result.targetFormName, routeCase.targetFormName);

    const evolved = await fetchJson(`${base}/pets/evolution`, {
      method: "POST",
      headers: {
        ...authorization,
        "Idempotency-Key": `gm_pet_evolution_qa_${routeCase.routeId}_success_0001`,
      },
      body: JSON.stringify({
        instanceId: acceptedSample.instanceId,
        routeId: routeCase.routeId,
        expectedProfileRevision: acceptedQuote.petEvolutionQuote.profileRevision,
        expectedCatalogId: catalog.catalogId,
      }),
    });
    assert.equal(evolved.ok, true, evolved.message);
    assert.equal(evolved.petEvolution.routeId, routeCase.routeId);
    assert.equal(evolved.petEvolution.instanceId, acceptedSample.instanceId);
    assert.equal(evolved.petEvolution.targetFormId, routeCase.targetFormId);
    const evolvedPet = evolved.profile.petInstances.find(
      (pet) => pet.instanceId === acceptedSample.instanceId,
    );
    assert.ok(evolvedPet);
    assert.equal(evolvedPet.formId, routeCase.targetFormId);
    assert.equal(evolvedPet.level, 1);
    assert.equal(evolvedPet.petCultivation.rebirthCount, 1);
  }

  const finalProfile = internalProfileForAccount(service, gm.account.accountId);
  assert.equal(finalProfile.petInstances.length, prepared.profile.petInstances.length);
  for (const routeCase of ROUTE_CASES) {
    assert.equal(
      finalProfile.petInstances.filter((pet) => pet.formId === routeCase.targetFormId).length,
      1,
    );
    const rejectedSample = prepared.result.samples.find(
      (sample) => sample.routeId === routeCase.routeId && sample.expectedEligible === false,
    );
    const rejectedPet = finalProfile.petInstances.find(
      (pet) => pet.instanceId === rejectedSample.instanceId,
    );
    assert.ok(rejectedPet);
    assert.equal(rejectedPet.formId, routeCase.sourceFormId);
    assert.equal(rejectedPet.level, 140);
    assert.equal(rejectedPet.petCultivation.rebirthCount, 1);
  }
  for (const material of prepared.result.materials) {
    assert.equal(itemCount(finalProfile, material.itemId), 0);
  }
  assert.equal(finalProfile.boundStoneCoins, 0);
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
