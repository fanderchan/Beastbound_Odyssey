"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const source = require("../../../client/godot/data/pet_evolution_routes.json");
const {createPetPaidResetPolicyCatalog} = require("../src/auth/pet-paid-reset-policy-catalog");
const {
  EXPECTED_ROUTE_COUNT,
  PetEvolutionRouteCatalogError,
  loadPetEvolutionRouteCatalog,
} = require("../src/auth/pet-evolution-route-catalog");

function withRouteDocument(document, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-evolution-routes-"));
  const routePath = path.join(directory, "pet_evolution_routes.json");
  fs.writeFileSync(routePath, `${JSON.stringify(document, null, 2)}\n`);
  try {
    return callback(routePath);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

function expectInvalid(mutator, pattern, options = {}) {
  const document = structuredClone(source);
  mutator(document);
  withRouteDocument(document, (routePath) => {
    assert.throws(
      () => loadPetEvolutionRouteCatalog({routePath, ...options}),
      (error) => (
        error instanceof PetEvolutionRouteCatalogError
        && error.code === "pet_evolution_route_catalog_invalid"
        && pattern.test(error.message)
      ),
    );
  });
}

test("two evolution routes form an owner-attested, production-open and cross-catalog complete acquisition contract", () => {
  const catalog = loadPetEvolutionRouteCatalog();
  const paidResetCatalog = createPetPaidResetPolicyCatalog();
  assert.equal(catalog.catalogId, "pet_evolution_routes_v2");
  assert.equal(catalog.runtimeEnabled, true);
  assert.equal(catalog.releaseAttestation.releaseApproved, true);
  assert.equal(catalog.releaseAttestation.ownerReviewStatus, "approved");
  assert.equal(catalog.routes.length, EXPECTED_ROUTE_COUNT);
  assert.equal(catalog.materialEncounters.length, 3);
  assert.equal(catalog.manualEncounterRules.length, 3);
  assert.equal(catalog.materialEncounters.filter((entry) => entry.kind === "shared_floor_core").length, 1);
  assert.equal(catalog.materialEncounters.filter((entry) => entry.kind === "lineage_material").length, 2);
  assert.equal(catalog.materialEncounters.every((entry) => entry.minPlayerCount === 2), true);
  assert.equal(paidResetCatalog.priceTiersById.diamond_evolution.amount, 650);
  assert.equal(
    paidResetCatalog.formPolicies.some((entry) => entry.priceTierId === "diamond_evolution"),
    false,
  );

  for (const route of catalog.routes) {
    assert.equal(route.eligibility.requiredRebirthCount, 1);
    assert.equal(route.eligibility.requiredLevel, 140);
    assert.equal(route.eligibility.requiredIntrinsicPowerPercentile, 90);
    assert.equal(route.eligibility.thresholdAuditVersion, "pet_evolution_eligibility_p90_v1");
    assert.equal(route.eligibility.thresholdSampleCount, 10000);
    assert.equal(route.cost.stoneCoins, 300000);
    assert.equal(route.cost.walletPolicyId, "bound_first_split");
    assert.equal(route.effort.sharedCoreVictories, 8);
    assert.equal(route.effort.lineageVictories, 12);
    assert.equal(route.effort.deterministicVictories, 20);
    assert.equal(route.effort.normalizedRepeatableEffort, 150);
    assert.equal(route.effort.normalizedFirstUnlockEffort, 170);
    assert.equal(route.result.successRate, 1);
    assert.equal(route.result.failureConsumes, false);
    assert.equal(route.result.normalSecondRebirthAllowed, false);
    assert.equal(route.result.fusionMaterialAllowed, false);
    assert.equal(route.result.paidResetAllowed, false);
    assert.equal(Object.hasOwn(route, "paidResetPriceTierId"), false);
    assert.equal(paidResetCatalog.formPoliciesById[route.sourceFormId].resetAllowed, true);
    assert.deepEqual(
      paidResetCatalog.formPoliciesById[route.targetFormId],
      {
        formId: route.targetFormId,
        acquisitionTier: "evolution",
        resetAllowed: false,
        ineligibleReason: "terminal_evolution",
      },
    );
    assert.equal(route.assetGate.status, "formal");
    assert.equal(route.projectedBasePower.source, route.projectedBasePower.target);
    assert.equal(route.projectedBasePower.intrinsicUplift.min >= 1.484, true);
    assert.equal(route.projectedBasePower.intrinsicUplift.max <= 2.036, true);
  }

  const core = catalog.materialEncountersById.evolution_shared_core_floor_v1;
  assert.equal(core.itemId, "pet_evolution_resonance_core");
  assert.equal(core.itemBinding, "bound");
  assert.equal(core.personalReward, true);
  assert.equal(catalog.materialEncounters.filter((entry) => entry.kind === "lineage_material").every((entry) => entry.itemBinding === "unbound"), true);
  assert.equal(new Set(catalog.routes.map((route) => route.lineId)).size, 2);
  assert.equal(new Set(catalog.routes.map((route) => route.lineageSourceId)).size, 2);
  assert.equal(new Set(catalog.routes.map((route) => route.sharedCoreSourceId)).size, 1);
  assert.deepEqual(
    Object.fromEntries(catalog.routes.map((route) => [route.routeId, route.eligibility.minimumIntrinsicCombatPower])),
    {
      wuli_crystal_evolution_v1: 1345,
      driftfox_moon_gale_evolution_v1: 1437,
    },
  );
});

test("route catalog fails closed for a third route, attestation or asset drift and cost drift", () => {
  expectInvalid((document) => {
    document.routes.push(structuredClone(document.routes[0]));
  }, /exactly 2 routes|duplicate route/);

  expectInvalid((document) => {
    document.releaseAttestation.sha256 = "0".repeat(64);
  }, /release attestation|SHA-256|P1.3e/);

  expectInvalid((document) => {
    document.routes[0].assetGate.status = "deferred";
  }, /runtime gate|deferred assets|cannot run/);

  expectInvalid((document) => {
    document.routes[0].cost.items[0].count = 7;
  }, /effort does not match deterministic costs/);

  expectInvalid((document) => {
    document.materialEncounters[0].minPlayerCount = 1;
  }, /minPlayerCount must equal 2/);
});

test("route catalog rejects binding and independent-quality contract drift", () => {
  expectInvalid((document) => {
    document.materialEncounters[0].itemBinding = "unbound";
  }, /itemBinding does not match/);

  expectInvalid((document) => {
    document.qualityProjection.rerollAllowed = false;
  }, /qualityProjection must exactly match/);
});

test("route catalog locks terminal evolution against reset-price drift and later terminal reuse", () => {
  expectInvalid((document) => {
    document.routes[0].result.paidResetAllowed = true;
  }, /terminal evolution contract/);

  expectInvalid((document) => {
    document.routes[0].paidResetPriceTierId = "diamond_evolution";
  }, /paidResetPriceTierId must be omitted/);

  const paidResetCatalog = structuredClone(createPetPaidResetPolicyCatalog());
  const targetFormId = source.routes[0].targetFormId;
  paidResetCatalog.formPoliciesById[targetFormId] = {
    formId: targetFormId,
    acquisitionTier: "evolution",
    resetAllowed: true,
    priceTierId: "diamond_evolution",
  };
  expectInvalid(
    () => {},
    /ineligible for paid reset as terminal_evolution/,
    {paidResetCatalog},
  );

  const blockedSourceCatalog = structuredClone(createPetPaidResetPolicyCatalog());
  const sourceFormId = source.routes[0].sourceFormId;
  blockedSourceCatalog.formPoliciesById[sourceFormId] = {
    formId: sourceFormId,
    acquisitionTier: "common_wild",
    resetAllowed: false,
    ineligibleReason: "terminal_evolution",
  };
  expectInvalid(
    () => {},
    /source form must remain eligible for paid reset/,
    {paidResetCatalog: blockedSourceCatalog},
  );

  const wrongReasonCatalog = structuredClone(createPetPaidResetPolicyCatalog());
  wrongReasonCatalog.formPoliciesById[targetFormId].ineligibleReason = "manual_disable";
  expectInvalid(
    () => {},
    /ineligible for paid reset as terminal_evolution/,
    {paidResetCatalog: wrongReasonCatalog},
  );

  const pricedTerminalCatalog = structuredClone(createPetPaidResetPolicyCatalog());
  pricedTerminalCatalog.formPoliciesById[targetFormId].priceTierId = "diamond_evolution";
  expectInvalid(
    () => {},
    /ineligible for paid reset as terminal_evolution/,
    {paidResetCatalog: pricedTerminalCatalog},
  );

  expectInvalid((document) => {
    document.routes[0].targetFormId = document.routes[0].sourceFormId;
  }, /terminal evolution target forms cannot be reused/);
});
