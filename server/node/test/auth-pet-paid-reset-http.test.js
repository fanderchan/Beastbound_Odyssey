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
const {seedPaidResetAccount} = require("../test-support/pet-paid-reset-fixture");
const {
  CLIENT_PROTOCOL_HEADER,
  CLIENT_VERSION_HEADER,
  PROTOCOL_VERSION,
  SERVER_VERSION,
} = require("../src/protocol");

const NOW_MS = Date.parse("2026-07-17T14:00:00.000Z");

function requestFor(account, overrides = {}) {
  return {
    instanceId: account.fixture.pet.instanceId,
    expectedProfileRevision: account.profileRevision,
    expectedPriceConfigRevision: 0,
    ...overrides,
  };
}

test("HTTP paid reset requires one operation key, rejects client pricing, and replays the committed public result", async (t) => {
  const store = createMemoryAuthStore();
  const service = createAuthService({store, now: () => NOW_MS});
  const account = seedPaidResetAccount(service, {username: "prs_http"});
  const server = createHttpServer({service, store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await service.waitForDurableIdle();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const authorization = {authorization: `Bearer ${account.session.token}`};
  const before = structuredClone(internalProfileForAccount(service, account.account.accountId));

  const quote = await fetchJson(
    `${base}/pets/paid-reset/quote?instanceId=${encodeURIComponent(account.fixture.pet.instanceId)}`,
    {headers: authorization},
  );
  assert.equal(quote.ok, true);
  assert.equal(quote.paidResetQuote.profileRevision, account.profileRevision);
  assert.equal(quote.paidResetQuote.configRevision, 0);
  assert.equal(quote.paidResetQuote.payment.amount, 300);
  assert.equal(quote.paidResetQuote.payment.affordable, true);
  assert.equal(Object.hasOwn(quote.paidResetQuote, "walletPolicy"), false);
  assert.equal(JSON.stringify(quote).includes(account.fixture.privateSeed), false);
  assert.deepEqual(internalProfileForAccount(service, account.account.accountId), before);

  const missingKey = await fetchJson(`${base}/pets/paid-reset`, {
    method: "POST",
    headers: authorization,
    body: JSON.stringify(requestFor(account)),
  });
  assert.equal(missingKey.ok, false);
  assert.equal(missingKey.code, "idempotency_key_required");

  const malformedKey = await fetchJson(`${base}/pets/paid-reset`, {
    method: "POST",
    headers: {...authorization, "Idempotency-Key": "short"},
    body: JSON.stringify(requestFor(account)),
  });
  assert.equal(malformedKey.ok, false);
  assert.equal(malformedKey.code, "idempotency_key_invalid");

  const clientPricing = await fetchJson(`${base}/pets/paid-reset`, {
    method: "POST",
    headers: {...authorization, "Idempotency-Key": "paid_reset_http_injected_price_0001"},
    body: JSON.stringify({...requestFor(account), amount: 1, currencyId: "stone_coins"}),
  });
  assert.equal(clientPricing.ok, false);
  assert.equal(clientPricing.code, "pet_paid_reset_request_invalid");

  const staleResponse = await fetch(`${base}/pets/paid-reset`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authorization,
      "Idempotency-Key": "paid_reset_http_stale_quote_0001",
      [CLIENT_VERSION_HEADER]: SERVER_VERSION,
      [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
    },
    body: JSON.stringify(requestFor(account, {expectedPriceConfigRevision: 99})),
  });
  assert.equal(staleResponse.status, 409);
  const staleQuote = await staleResponse.json();
  assert.equal(staleQuote.ok, false);
  assert.equal(staleQuote.code, "pet_paid_reset_config_revision_conflict");
  assert.deepEqual(internalProfileForAccount(service, account.account.accountId), before);

  const operationId = "paid_reset_http_success_0001";
  const first = await fetchJson(`${base}/pets/paid-reset`, {
    method: "POST",
    headers: {...authorization, "Idempotency-Key": operationId},
    body: JSON.stringify(requestFor(account)),
  });
  assert.equal(first.ok, true);
  assert.equal(first.durableCommit.replayed, false);
  assert.equal(first.paidReset.paidResetCount, 1);
  assert.equal(first.profile.boundDiamonds, 0);
  assert.equal(first.profile.diamonds, 50);
  assert.equal(Object.hasOwn(first.profile.petInstances[0], "paidResetAudit"), false);
  assert.equal(JSON.stringify(first).includes(account.fixture.privateSeed), false);

  const replay = await fetchJson(`${base}/pets/paid-reset`, {
    method: "POST",
    headers: {...authorization, "Idempotency-Key": operationId},
    body: JSON.stringify(requestFor(account)),
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.profileBinding.profileRevision, first.profileBinding.profileRevision);
  assert.equal(replay.profile.boundDiamonds, 0);
  assert.equal(replay.profile.diamonds, 50);
});
