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
  GM_PET_PAID_RESET_QA_MANIFEST_ID,
  QA_WALLET_MINIMUMS,
} = require("../src/auth/gm-pet-paid-reset-qa");

const COMMAND_ID = "gm_pet_paid_reset_config";
const NOW_MS = Date.parse("2026-07-17T15:00:00.000Z");

function registerGm(service) {
  const registered = service.register({
    username: "auth1373",
    password: "test1234",
    displayName: "宠物重置验收GM",
  });
  assert.equal(registered.ok, true);
  assert.equal(service.grantGm({
    username: "auth1373",
    commandIds: [COMMAND_ID],
    policyId: "test_paid_reset_qa_v1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    grantedBy: "paid_reset_qa_test",
  }).ok, true);
  return registered;
}

function invokeQa(service, gm, operationId, requestHash) {
  return service.invokeDurable("prepareGmPetPaidResetQa", [gm.session.token, {
    manifestId: GM_PET_PAID_RESET_QA_MANIFEST_ID,
  }], {
    actionId: "POST /gm/pets/paid-reset/qa",
    operationId,
    requestHash,
  });
}

test("GM reset QA keeps its two-slot v1 manifest while treating stage two as terminal", async () => {
  const service = createAuthService({store: createMemoryAuthStore(), now: () => NOW_MS});
  const gm = registerGm(service);
  const first = await invokeQa(
    service,
    gm,
    "gm_paid_reset_qa_prepare_0001",
    "a".repeat(64),
  );
  assert.equal(first.ok, true, first.message);
  assert.equal(first.result.summary.samplesCreated, 2);
  assert.equal(first.result.summary.sampleCount, 2);
  assert.equal(first.result.summary.presentCount, 2);
  assert.equal(first.result.summary.expectationMatchedCount, 2);
  assert.deepEqual(first.result.samples.map((sample) => ({
    slotId: sample.slotId,
    rebirthCount: sample.rebirthCount,
    eligible: sample.eligible,
    expectedEligible: sample.expectedEligible,
    expectedEligibilityCode: sample.expectedEligibilityCode,
    expectedRebirthCount: sample.expectedRebirthCount,
    matchesExpectation: sample.matchesExpectation,
    eligibilityCode: sample.eligibilityCode,
  })), [
    {
      slotId: "paid_reset_stage1",
      rebirthCount: 1,
      eligible: true,
      expectedEligible: true,
      expectedEligibilityCode: "ok",
      expectedRebirthCount: 1,
      matchesExpectation: true,
      eligibilityCode: "ok",
    },
    {
      slotId: "paid_reset_stage2",
      rebirthCount: 2,
      eligible: false,
      expectedEligible: false,
      expectedEligibilityCode: "pet_paid_reset_terminal_stage",
      expectedRebirthCount: 2,
      matchesExpectation: true,
      eligibilityCode: "pet_paid_reset_terminal_stage",
    },
  ]);
  assert.equal(first.result.negativeChecks.legacyRejected, true);
  assert.equal(first.result.negativeChecks.damagedRejected, true);
  assert.deepEqual(first.result.summary.wallets, QA_WALLET_MINIMUMS);
  assert.equal(first.result.price.currencyId, "diamonds");
  assert.equal(first.result.price.amount, 300);
  assert.equal(JSON.stringify(first).includes("privateSeed"), false);

  const internal = internalProfileForAccount(service, gm.account.accountId);
  const sampleIds = first.result.samples.map((sample) => sample.instanceId);
  const internalSamples = internal.petInstances.filter((pet) => sampleIds.includes(pet.instanceId));
  assert.equal(internalSamples.length, 2);
  assert.equal(internalSamples.every((pet) => pet.binding === "bound" && pet.locked === false), true);
  assert.equal(internalSamples.every((pet) => String(pet.petGrowth.private.privateSeed || "") !== ""), true);
  assert.equal(internal.gmQaPetSampleManifests[GM_PET_PAID_RESET_QA_MANIFEST_ID].slots.length, 2);

  const replay = await invokeQa(
    service,
    gm,
    "gm_paid_reset_qa_prepare_0001",
    "a".repeat(64),
  );
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(internalProfileForAccount(service, gm.account.accountId).petInstances.length, internal.petInstances.length);

  const v1ReloadedService = createAuthService({
    store: createMemoryAuthStore(structuredClone(service.snapshot())),
    now: () => NOW_MS,
  });
  const v1Reloaded = await invokeQa(
    v1ReloadedService,
    gm,
    "gm_paid_reset_qa_v1_reload_0001",
    "e".repeat(64),
  );
  assert.equal(v1Reloaded.ok, true, v1Reloaded.message);
  assert.equal(v1Reloaded.result.summary.samplesCreated, 0);
  assert.equal(v1Reloaded.result.summary.sampleCount, 2);
  assert.equal(v1Reloaded.result.summary.presentCount, 2);
  assert.equal(v1Reloaded.result.summary.expectationMatchedCount, 2);
  assert.deepEqual(v1Reloaded.result.samples.map((sample) => sample.eligible), [true, false]);
  assert.equal(
    internalProfileForAccount(
      v1ReloadedService,
      gm.account.accountId,
    ).gmQaPetSampleManifests[GM_PET_PAID_RESET_QA_MANIFEST_ID].slots.length,
    2,
  );

  const terminalPet = first.result.samples.find((sample) => sample.slotId === "paid_reset_stage2");
  const beforeTerminalAttempt = structuredClone(service.snapshot());
  const terminalQuote = service.getPetPaidResetQuote(gm.session.token, {instanceId: terminalPet.instanceId});
  assert.equal(terminalQuote.ok, false);
  assert.equal(terminalQuote.code, "pet_paid_reset_terminal_stage");
  assert.deepEqual(service.snapshot(), beforeTerminalAttempt);
  const terminalReset = await service.invokeDurable("paidResetPet", [gm.session.token, {
    instanceId: terminalPet.instanceId,
    expectedProfileRevision: first.result.summary.profileRevisionAfter,
    expectedPriceConfigRevision: 0,
  }], {
    actionId: "POST /pets/paid-reset",
    operationId: "gm_paid_reset_qa_terminal_0001",
    requestHash: "d".repeat(64),
  });
  assert.equal(terminalReset.ok, false);
  assert.equal(terminalReset.code, "pet_paid_reset_terminal_stage");
  assert.deepEqual(service.snapshot(), beforeTerminalAttempt);

  const resettablePet = first.result.samples.find((sample) => sample.slotId === "paid_reset_stage1");
  const quote = service.getPetPaidResetQuote(gm.session.token, {instanceId: resettablePet.instanceId});
  assert.equal(quote.ok, true);
  const reset = await service.invokeDurable("paidResetPet", [gm.session.token, {
    instanceId: resettablePet.instanceId,
    expectedProfileRevision: first.result.summary.profileRevisionAfter,
    expectedPriceConfigRevision: quote.paidResetQuote.configRevision,
  }], {
    actionId: "POST /pets/paid-reset",
    operationId: "gm_paid_reset_qa_reset_0001",
    requestHash: "b".repeat(64),
  });
  assert.equal(reset.ok, true, reset.message);
  assert.equal(reset.paidReset.paidResetCount, 1);

  const inspected = await invokeQa(
    service,
    gm,
    "gm_paid_reset_qa_inspect_0002",
    "c".repeat(64),
  );
  assert.equal(inspected.ok, true);
  assert.equal(inspected.result.summary.samplesCreated, 0);
  assert.equal(inspected.result.summary.expectationMatchedCount, 1);
  const afterReset = inspected.result.samples.find((sample) => sample.instanceId === resettablePet.instanceId);
  assert.equal(afterReset.level, 1);
  assert.equal(afterReset.rebirthCount, 0);
  assert.equal(afterReset.eligible, false);
  assert.equal(afterReset.expectedEligible, true);
  assert.equal(afterReset.matchesExpectation, false);
  assert.equal(afterReset.paidResetCount, 1);
  assert.equal(afterReset.audit.totalCount, 1);
  assert.equal(afterReset.audit.records[0].operationId, "gm_paid_reset_qa_reset_0001");
  assert.equal(JSON.stringify(inspected).includes("privateSeed"), false);
});

test("GM reset QA does not count a damaged or previously reset stage-two slot as the expected terminal sample", async (t) => {
  const seedService = createAuthService({store: createMemoryAuthStore(), now: () => NOW_MS});
  const gm = registerGm(seedService);
  const prepared = await invokeQa(
    seedService,
    gm,
    "gm_paid_reset_qa_mismatch_seed_0001",
    "f".repeat(64),
  );
  assert.equal(prepared.ok, true, prepared.message);
  const stageTwo = prepared.result.samples.find((sample) => sample.slotId === "paid_reset_stage2");
  const cases = [
    {
      id: "different_rejection_code",
      mutate(pet) {
        pet.petCultivation.rebirthCount = 1;
        delete pet.petGrowth;
        delete pet.growthAuthority;
      },
    },
    {
      id: "previously_reset_to_zero",
      mutate(pet) {
        pet.level = 1;
        pet.exp = 0;
        pet.petCultivation.rebirthCount = 0;
      },
    },
  ];
  for (const [index, fixture] of cases.entries()) {
    await t.test(fixture.id, async () => {
      const data = structuredClone(seedService.snapshot());
      const binding = data.profileBindings[gm.account.accountId];
      const profile = data.profiles[binding.playerId].profile;
      const pet = profile.petInstances.find((candidate) => candidate.instanceId === stageTwo.instanceId);
      fixture.mutate(pet);
      const service = createAuthService({
        store: createMemoryAuthStore(data),
        now: () => NOW_MS,
      });
      const inspected = await invokeQa(
        service,
        gm,
        `gm_paid_reset_qa_mismatch_${index}_0001`,
        String(index + 7).repeat(64),
      );
      assert.equal(inspected.ok, true, inspected.message);
      assert.equal(inspected.result.summary.samplesCreated, 0);
      assert.equal(inspected.result.summary.expectationMatchedCount, 1);
      const sample = inspected.result.samples.find((candidate) => candidate.slotId === "paid_reset_stage2");
      assert.equal(sample.eligible, false);
      assert.equal(sample.expectedEligible, false);
      assert.equal(sample.expectedEligibilityCode, "pet_paid_reset_terminal_stage");
      assert.equal(sample.expectedRebirthCount, 2);
      assert.equal(sample.matchesExpectation, false);
      if (fixture.id === "different_rejection_code") {
        assert.notEqual(sample.eligibilityCode, "pet_paid_reset_terminal_stage");
      } else {
        assert.equal(sample.rebirthCount, 0);
      }
    });
  }
});

test("HTTP GM reset QA requires idempotency and returns a committed public profile", async (t) => {
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
  const body = JSON.stringify({manifestId: GM_PET_PAID_RESET_QA_MANIFEST_ID});

  const missing = await fetchJson(`${base}/gm/pets/paid-reset/qa`, {
    method: "POST",
    headers: authorization,
    body,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "idempotency_key_required");

  const prepared = await fetchJson(`${base}/gm/pets/paid-reset/qa`, {
    method: "POST",
    headers: {...authorization, "Idempotency-Key": "gm_paid_reset_qa_http_0001"},
    body,
  });
  assert.equal(prepared.ok, true, prepared.message);
  assert.equal(prepared.result.summary.presentCount, 2);
  assert.equal(prepared.result.summary.expectationMatchedCount, 2);
  assert.equal(Array.isArray(prepared.profile.petInstances), true);
  assert.equal(Object.hasOwn(prepared.profile, "gmQaPetSampleManifests"), false);
  assert.equal(JSON.stringify(prepared).includes("privateSeed"), false);
  assert.equal(JSON.stringify(prepared).includes("fusionLineage"), false);
});
