"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
  internalProfileForAccount,
} = require("../test-support/auth-service-test-context");
const {seedPaidResetAccount} = require("../test-support/pet-paid-reset-fixture");

const NOW_MS = Date.parse("2026-07-17T13:00:00.000Z");
const ACTION_ID = "POST /pets/paid-reset";

function resetRequest(account, overrides = {}) {
  return {
    instanceId: account.fixture.pet.instanceId,
    expectedProfileRevision: account.profileRevision,
    expectedPriceConfigRevision: 0,
    ...overrides,
  };
}

function invokeReset(service, account, options = {}) {
  const operationId = String(options.operationId || "paid_reset_service_operation_0001");
  const requestHash = String(options.requestHash || "c".repeat(64));
  const payload = options.payload || resetRequest(account);
  return service.invokeDurable("paidResetPet", [account.session.token, payload], {
    operationId,
    requestHash,
    actionId: ACTION_ID,
  });
}

test("authoritative paid reset atomically debits, resets, unbinds and exposes only public count", async () => {
  const service = createAuthService({store: createMemoryAuthStore(), now: () => NOW_MS});
  const account = seedPaidResetAccount(service, {username: "paidresethappy"});
  const before = structuredClone(internalProfileForAccount(service, account.account.accountId));

  const quote = service.getPetPaidResetQuote(account.session.token, {
    instanceId: account.fixture.pet.instanceId,
  });
  assert.equal(quote.ok, true);
  assert.equal(quote.paidResetQuote.profileRevision, account.profileRevision);
  assert.equal(quote.paidResetQuote.configRevision, 0);
  assert.deepEqual(quote.paidResetQuote.pet, {
    instanceId: account.fixture.pet.instanceId,
    formId: "rebirth_starter_four_spirit_cub",
    formName: "四灵幼兽",
    level: 88,
    rebirthCount: 2,
    enhanceLevel: 3,
    binding: "bound",
    paidResetCount: 0,
  });
  assert.deepEqual(quote.paidResetQuote.payment, {
    currencyId: "diamonds",
    amount: 300,
    affordable: true,
    available: 350,
    shortfall: 0,
    balances: {bound: 250, unbound: 100},
    debits: [{binding: "bound", amount: 250}, {binding: "unbound", amount: 50}],
  });
  assert.deepEqual(quote.paidResetQuote.result, {level: 1, rebirthCount: 0, binding: "unbound"});
  assert.equal(quote.paidResetQuote.consequences.clears.includes("growth_observation"), true);
  assert.equal(quote.paidResetQuote.consequences.preserves.includes("hidden_growth"), true);
  assert.equal(quote.paidResetQuote.consequences.nonRefunded.includes("consumed_rebirth_inputs"), true);
  assert.equal(JSON.stringify(quote).includes(account.fixture.privateSeed), false);
  assert.deepEqual(internalProfileForAccount(service, account.account.accountId), before);

  const direct = service.paidResetPet(account.session.token, resetRequest(account));
  assert.equal(direct.ok, false);
  assert.equal(direct.code, "idempotency_key_required");
  assert.deepEqual(internalProfileForAccount(service, account.account.accountId), before);

  const result = await invokeReset(service, account);
  assert.equal(result.ok, true);
  assert.equal(result.durableCommit.replayed, false);
  assert.equal(result.paidReset.beforeLevel, 88);
  assert.equal(result.paidReset.afterLevel, 1);
  assert.equal(result.paidReset.beforeRebirthCount, 2);
  assert.equal(result.paidReset.afterRebirthCount, 0);
  assert.equal(result.paidReset.paidResetCount, 1);
  assert.equal(result.paidReset.payment.currencyId, "diamonds");
  assert.deepEqual(result.paidReset.payment.debits, [
    {binding: "bound", amount: 250},
    {binding: "unbound", amount: 50},
  ]);
  assert.equal(result.profile.boundDiamonds, 0);
  assert.equal(result.profile.diamonds, 50);
  assert.equal(result.profile.petInstances[0].paidResetCount, 1);
  assert.equal(Object.hasOwn(result.profile.petInstances[0], "paidResetAudit"), false);
  assert.equal(JSON.stringify(result).includes(account.fixture.privateSeed), false);

  const internal = internalProfileForAccount(service, account.account.accountId);
  const pet = internal.petInstances[0];
  assert.equal(pet.level, 1);
  assert.equal(pet.petCultivation.rebirthCount, 0);
  assert.deepEqual(pet.petCultivation.rebirthGrowthBonus, {maxHp: 0, attack: 0, defense: 0, quick: 0});
  assert.equal(pet.binding, "unbound");
  assert.equal(pet.bound, false);
  assert.equal(pet.bindingLocked, false);
  assert.equal(pet.paidResetAudit.records.length, 1);
  assert.equal(pet.paidResetAudit.records[0].operationId, "paid_reset_service_operation_0001");
  assert.equal(pet.petGrowth.private.privateSeed, before.petInstances[0].petGrowth.private.privateSeed);
  assert.deepEqual(pet.initialStats, before.petInstances[0].initialStats);
  assert.equal(internal.boundDiamonds, 0);
  assert.equal(internal.diamonds, 50);
  assert.equal(result.profileBinding.profileRevision, account.profileRevision + 1);
});

test("same paid-reset operation replays once and conflicts cannot debit or reset again", async () => {
  const service = createAuthService({store: createMemoryAuthStore(), now: () => NOW_MS});
  const account = seedPaidResetAccount(service, {username: "paidresetreplay"});
  const first = await invokeReset(service, account);
  assert.equal(first.ok, true);
  const afterFirst = structuredClone(internalProfileForAccount(service, account.account.accountId));

  const replay = await invokeReset(service, account);
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.durableCommit.operationId, first.durableCommit.operationId);
  assert.deepEqual(internalProfileForAccount(service, account.account.accountId), afterFirst);

  const conflict = await invokeReset(service, account, {requestHash: "d".repeat(64)});
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "idempotency_key_conflict");
  assert.deepEqual(internalProfileForAccount(service, account.account.accountId), afterFirst);

  const secondOperation = await invokeReset(service, account, {
    operationId: "paid_reset_service_operation_0002",
    requestHash: "e".repeat(64),
    payload: resetRequest(account, {expectedProfileRevision: account.profileRevision + 1}),
  });
  assert.equal(secondOperation.ok, false);
  assert.equal(secondOperation.code, "pet_paid_reset_cultivation_invalid");
  assert.deepEqual(internalProfileForAccount(service, account.account.accountId), afterFirst);
});

test("stale quote, stale profile, insufficient currency and protected pets remain zero-mutation", async (t) => {
  const cases = [
    {
      name: "stale profile revision",
      account: {username: "prs_staleprof"},
      payload(account) {
        return resetRequest(account, {expectedProfileRevision: account.profileRevision - 1});
      },
      code: "revision_conflict",
    },
    {
      name: "stale price revision",
      account: {username: "prs_staleprice"},
      payload(account) {
        return resetRequest(account, {expectedPriceConfigRevision: 99});
      },
      code: "pet_paid_reset_config_revision_conflict",
    },
    {
      name: "insufficient currency",
      account: {username: "paidresetpoor", diamonds: 10, boundDiamonds: 20},
      payload(account) {
        return resetRequest(account);
      },
      code: "pet_paid_reset_currency_insufficient",
    },
    {
      name: "locked pet",
      account: {username: "paidresetlocked", pet: {locked: true}},
      payload(account) {
        return resetRequest(account);
      },
      code: "pet_locked",
    },
    {
      name: "riding pet",
      account: {username: "paidresetriding", pet: {state: "riding"}},
      payload(account) {
        return resetRequest(account);
      },
      code: "pet_riding",
    },
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const service = createAuthService({store: createMemoryAuthStore(), now: () => NOW_MS});
      const account = seedPaidResetAccount(service, fixture.account);
      const before = structuredClone(service.snapshot());
      const result = await invokeReset(service, account, {
        operationId: `paid_reset_${fixture.account.username}_0001`,
        requestHash: "f".repeat(64),
        payload: fixture.payload(account),
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, fixture.code);
      assert.deepEqual(service.snapshot(), before);
    });
  }
});

test("read-only quote reports a shortfall without mutating the profile", () => {
  const service = createAuthService({store: createMemoryAuthStore(), now: () => NOW_MS});
  const account = seedPaidResetAccount(service, {
    username: "paidresetquotepoor",
    diamonds: 10,
    boundDiamonds: 20,
  });
  const before = structuredClone(service.snapshot());
  const result = service.getPetPaidResetQuote(account.session.token, {
    instanceId: account.fixture.pet.instanceId,
  });
  assert.equal(result.ok, true);
  assert.equal(result.paidResetQuote.payment.affordable, false);
  assert.equal(result.paidResetQuote.payment.available, 30);
  assert.equal(result.paidResetQuote.payment.shortfall, 270);
  assert.deepEqual(result.paidResetQuote.payment.debits, []);
  assert.deepEqual(service.snapshot(), before);
});
