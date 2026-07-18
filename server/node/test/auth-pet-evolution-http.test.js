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
  CLIENT_PROTOCOL_HEADER,
  CLIENT_VERSION_HEADER,
  PROTOCOL_VERSION,
  SERVER_VERSION,
} = require("../test-support/auth-service-test-context");
const {
  ROUTE_ID,
  TARGET_FORM_ID,
  createEnabledPetEvolutionRouteCatalog,
  seedEvolutionAccount,
} = require("../test-support/pet-evolution-fixture");

const NOW_MS = Date.parse("2026-07-18T05:00:00.000Z");

function requestFor(account, catalog, overrides = {}) {
  return {
    instanceId: account.fixture.pet.instanceId,
    routeId: ROUTE_ID,
    expectedProfileRevision: account.profileRevision,
    expectedCatalogId: catalog.catalogId,
    ...overrides,
  };
}

test("HTTP evolution quote and mutation require authority, exact confirmation and one replay-safe key", async (t) => {
  const store = createMemoryAuthStore();
  const catalog = createEnabledPetEvolutionRouteCatalog();
  const service = createAuthService({
    store,
    now: () => NOW_MS,
    petEvolutionRouteCatalog: catalog,
  });
  const account = seedEvolutionAccount(service, {username: "evo_http"});
  const server = createHttpServer({service, store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await service.waitForDurableIdle();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const authorization = {authorization: `Bearer ${account.session.token}`};
  const quoteUrl = `${base}/pets/evolution/quote?instanceId=${encodeURIComponent(account.fixture.pet.instanceId)}&routeId=${encodeURIComponent(ROUTE_ID)}`;
  const before = structuredClone(internalProfileForAccount(service, account.account.accountId));

  const unauthorized = await fetchJson(quoteUrl);
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.code, "session_missing");

  const quote = await fetchJson(quoteUrl, {headers: authorization});
  assert.equal(quote.ok, true);
  assert.equal(quote.petEvolutionQuote.catalogId, catalog.catalogId);
  assert.equal(quote.petEvolutionQuote.pet.minimumIntrinsicCombatPower, 1345);
  assert.equal(quote.petEvolutionQuote.result.terminalStageLabel, "2转/进化/融合");
  assert.equal(quote.petEvolutionQuote.cost.affordable, true);
  assert.equal(JSON.stringify(quote).includes(account.fixture.privateSeed), false);
  assert.deepEqual(internalProfileForAccount(service, account.account.accountId), before);

  const missingKey = await fetchJson(`${base}/pets/evolution`, {
    method: "POST",
    headers: authorization,
    body: JSON.stringify(requestFor(account, catalog)),
  });
  assert.equal(missingKey.ok, false);
  assert.equal(missingKey.code, "idempotency_key_required");

  const clientInjectedRule = await fetchJson(`${base}/pets/evolution`, {
    method: "POST",
    headers: {...authorization, "Idempotency-Key": "pet_evolution_http_injected_rule_0001"},
    body: JSON.stringify({...requestFor(account, catalog), stoneCoins: 1, targetFormId: "forged"}),
  });
  assert.equal(clientInjectedRule.ok, false);
  assert.equal(clientInjectedRule.code, "pet_evolution_request_invalid");
  assert.deepEqual(internalProfileForAccount(service, account.account.accountId), before);

  const staleCatalogResponse = await fetch(`${base}/pets/evolution`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authorization,
      "Idempotency-Key": "pet_evolution_http_stale_catalog_0001",
      [CLIENT_VERSION_HEADER]: SERVER_VERSION,
      [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
    },
    body: JSON.stringify(requestFor(account, catalog, {expectedCatalogId: "pet_evolution_routes_stale"})),
  });
  assert.equal(staleCatalogResponse.status, 409);
  const staleCatalog = await staleCatalogResponse.json();
  assert.equal(staleCatalog.ok, false);
  assert.equal(staleCatalog.code, "pet_evolution_catalog_conflict");
  assert.deepEqual(internalProfileForAccount(service, account.account.accountId), before);

  const operationId = "pet_evolution_http_success_0001";
  const first = await fetchJson(`${base}/pets/evolution`, {
    method: "POST",
    headers: {...authorization, "Idempotency-Key": operationId},
    body: JSON.stringify(requestFor(account, catalog)),
  });
  assert.equal(first.ok, true);
  assert.equal(first.durableCommit.replayed, false);
  assert.equal(first.petEvolution.targetFormId, TARGET_FORM_ID);
  assert.equal(first.profile.petInstances[0].formId, TARGET_FORM_ID);
  assert.equal(first.profile.petInstances[0].evolutionLineage.stageSnapshots[1].level, 140);
  assert.equal(first.profile.boundStoneCoins, 0);
  assert.equal(first.profile.stoneCoins, 50000);
  assert.equal(JSON.stringify(first).includes(account.fixture.privateSeed), false);

  const afterFirst = structuredClone(internalProfileForAccount(service, account.account.accountId));
  const replay = await fetchJson(`${base}/pets/evolution`, {
    method: "POST",
    headers: {...authorization, "Idempotency-Key": operationId},
    body: JSON.stringify(requestFor(account, catalog)),
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.profileBinding.profileRevision, first.profileBinding.profileRevision);
  assert.deepEqual(internalProfileForAccount(service, account.account.accountId), afterFirst);
});
