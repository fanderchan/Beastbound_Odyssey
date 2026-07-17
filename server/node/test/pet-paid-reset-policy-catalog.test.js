"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  DEFAULT_POLICY_PATH,
  DEFAULT_TEMPLATE_PATH,
  buildUpdatedPetPaidResetConfig,
  createPetPaidResetPolicyCatalog,
  normalizePetPaidResetPolicyCatalog,
  publicPetPaidResetConfig,
  readPetPaidResetConfig,
  resolvePetPaidResetQuote,
} = require("../src/auth/pet-paid-reset-policy-catalog");
const {planPetPaidResetDebit} = require("../src/auth/pet-paid-reset-payment");

function loadedDocuments() {
  return {
    policy: JSON.parse(fs.readFileSync(DEFAULT_POLICY_PATH, "utf8")),
    templates: JSON.parse(fs.readFileSync(DEFAULT_TEMPLATE_PATH, "utf8")),
  };
}

function quote(catalog, formId, config = {}) {
  const result = resolvePetPaidResetQuote(catalog, config, formId);
  assert.equal(result.ok, true, result.message);
  return result.quote;
}

test("paid reset catalog prices every current pet form and freezes universal reset rules", () => {
  const catalog = createPetPaidResetPolicyCatalog();
  assert.equal(catalog.formPolicies.length, 34);
  assert.equal(catalog.formPolicies.length, Object.keys(catalog.formPoliciesById).length);
  assert.deepEqual(catalog.resetContract, {
    pricingMode: "fixed_per_operation",
    unlimited: true,
    resetLevel: 1,
    resetRebirthStage: 0,
    clearBindingOnSuccess: true,
    refundPolicy: "technical_transaction_rollback_only",
  });
  for (const formPolicy of catalog.formPolicies) {
    const resolved = quote(catalog, formPolicy.formId);
    assert.equal(resolved.formId, formPolicy.formId);
    assert.equal(resolved.amount > 0, true);
    assert.equal(resolved.priceSource, "catalog_default");
    assert.equal(resolved.resetContract.unlimited, true);
  }
  assert.equal(quote(catalog, "bui_novice_sprout_earth5_wind5").amount, 50000);
  assert.equal(quote(catalog, "bui_normal_red_fire10").amount, 120000);
  assert.equal(quote(catalog, "blue_man_dragon_water10").amount, 300000);
  assert.deepEqual(
    [
      quote(catalog, "rebirth_starter_earth_cub").amount,
      quote(catalog, "rebirth_starter_four_spirit_cub").amount,
      quote(catalog, "rebirth_starter_shadow_cub").amount,
    ],
    [150, 300, 450],
  );
  assert.equal(catalog.priceTiersById.diamond_commercial.walletPolicyId, "unbound_only");
  assert.equal(catalog.priceTiersById.diamond_evolution.amount, 650);
  assert.equal(catalog.priceTiersById.diamond_fusion.amount, 900);
});

test("paid reset catalog fails closed for missing, duplicate and unknown form policies", () => {
  const {policy, templates} = loadedDocuments();
  const missing = structuredClone(policy);
  missing.formPolicies.pop();
  assert.throws(
    () => normalizePetPaidResetPolicyCatalog(missing, templates),
    (error) => error.code === "pet_paid_reset_catalog_invalid" && /精确覆盖/.test(error.message),
  );

  const duplicate = structuredClone(policy);
  duplicate.formPolicies.push(structuredClone(duplicate.formPolicies[0]));
  assert.throws(
    () => normalizePetPaidResetPolicyCatalog(duplicate, templates),
    (error) => error.code === "pet_paid_reset_catalog_invalid" && /不允许重复/.test(error.message),
  );

  const unknown = structuredClone(policy);
  unknown.formPolicies[0].formId = "future_unconfigured_pet";
  assert.throws(
    () => normalizePetPaidResetPolicyCatalog(unknown, templates),
    (error) => error.code === "pet_paid_reset_catalog_invalid" && /不存在/.test(error.message),
  );
});

test("GM tier and form overrides are revisioned, strict and form override wins", () => {
  const catalog = createPetPaidResetPolicyCatalog();
  const updated = buildUpdatedPetPaidResetConfig({}, {
    expectedRevision: 0,
    tierOverrides: {
      stone_standard: {
        currencyId: "stoneCoins",
        amount: 200000,
        walletPolicyId: "bound_first_split",
      },
    },
    formOverrides: {
      bui_normal_red_fire10: {
        currencyId: "diamonds",
        amount: 25,
        walletPolicyId: "unbound_only",
      },
    },
  }, catalog, {username: "gm_price", nowMs: Date.parse("2026-07-17T12:00:00.000Z")});
  assert.equal(updated.ok, true);
  assert.equal(updated.changed, true);
  assert.equal(updated.config.revision, 1);
  assert.equal(quote(catalog, "bui_normal_yellow_wind10", updated.config).amount, 200000);
  assert.deepEqual(
    {
      amount: quote(catalog, "bui_normal_red_fire10", updated.config).amount,
      currencyId: quote(catalog, "bui_normal_red_fire10", updated.config).currencyId,
      priceSource: quote(catalog, "bui_normal_red_fire10", updated.config).priceSource,
    },
    {amount: 25, currencyId: "diamonds", priceSource: "form_override"},
  );

  const stale = buildUpdatedPetPaidResetConfig(updated.config, {
    expectedRevision: 0,
    tierOverrides: {},
    formOverrides: {},
  }, catalog, {username: "gm_price", nowMs: Date.now()});
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "pet_paid_reset_config_revision_conflict");

  const partialOverride = buildUpdatedPetPaidResetConfig(updated.config, {
    expectedRevision: 1,
    tierOverrides: {},
    formOverrides: {bui_normal_red_fire10: {amount: 1}},
  }, catalog, {username: "gm_price", nowMs: Date.now()});
  assert.equal(partialOverride.ok, false);
  assert.equal(partialOverride.code, "pet_paid_reset_config_invalid");

  const numericString = buildUpdatedPetPaidResetConfig(updated.config, {
    expectedRevision: 1,
    tierOverrides: {
      stone_standard: {
        currencyId: "stoneCoins",
        amount: "200000",
        walletPolicyId: "bound_first_split",
      },
    },
    formOverrides: {},
  }, catalog, {username: "gm_price", nowMs: Date.now()});
  assert.equal(numericString.ok, false);
  assert.equal(numericString.code, "pet_paid_reset_config_invalid");
});

test("legacy empty config stays revision zero and malformed persisted config fails closed", () => {
  const catalog = createPetPaidResetPolicyCatalog();
  assert.deepEqual(readPetPaidResetConfig({}, catalog), {
    ok: true,
    config: {
      schemaVersion: 1,
      revision: 0,
      tierOverrides: {},
      formOverrides: {},
      updatedAt: "",
      updatedBy: "",
    },
  });
  const corrupt = readPetPaidResetConfig({schemaVersion: 1, revision: 9}, catalog);
  assert.equal(corrupt.ok, false);
  assert.equal(corrupt.code, "pet_paid_reset_config_invalid");
  const publicResult = publicPetPaidResetConfig(catalog, {});
  assert.equal(publicResult.ok, true);
  assert.equal(publicResult.resolvedForms.length, 34);
  assert.equal(Object.hasOwn(publicResult.defaults, "policyPath"), false);
});

test("bound-first reset payment plans split without mutating balances", () => {
  const catalog = createPetPaidResetPolicyCatalog();
  const profile = {
    stoneCoins: 50000,
    boundStoneCoins: 90000,
    diamonds: 700,
    boundDiamonds: 200,
  };
  const before = structuredClone(profile);
  const plan = planPetPaidResetDebit(profile, quote(catalog, "bui_normal_red_fire10"));
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.debits, [
    {
      currencyId: "stoneCoins",
      binding: "bound",
      field: "boundStoneCoins",
      amount: 90000,
      before: 90000,
      after: 0,
    },
    {
      currencyId: "stoneCoins",
      binding: "unbound",
      field: "stoneCoins",
      amount: 30000,
      before: 50000,
      after: 20000,
    },
  ]);
  assert.deepEqual(profile, before);
});

test("commercial policy ignores bound diamonds and every debit failure remains no-mutation", () => {
  const catalog = createPetPaidResetPolicyCatalog();
  const commercial = {
    ...quote(catalog, "rebirth_starter_four_spirit_cub"),
    currencyId: catalog.priceTiersById.diamond_commercial.currencyId,
    amount: catalog.priceTiersById.diamond_commercial.amount,
    walletPolicy: structuredClone(catalog.walletPoliciesById.unbound_only),
  };
  const profile = {diamonds: 499, boundDiamonds: 9999};
  const before = structuredClone(profile);
  const insufficient = planPetPaidResetDebit(profile, commercial);
  assert.equal(insufficient.ok, false);
  assert.equal(insufficient.code, "pet_paid_reset_currency_insufficient");
  assert.equal(insufficient.available, 499);
  assert.equal(insufficient.shortfall, 1);
  assert.deepEqual(insufficient.debits, []);
  assert.deepEqual(profile, before);

  profile.diamonds = 500;
  const accepted = planPetPaidResetDebit(profile, commercial);
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.debits.map((entry) => entry.binding), ["unbound"]);
  assert.deepEqual(profile, {...before, diamonds: 500});
});

test("paid reset quote is species policy only and never reads individual grade or reset count", () => {
  const catalog = createPetPaidResetPolicyCatalog();
  const first = resolvePetPaidResetQuote(catalog, {}, "bui_normal_red_fire10", {
    grade: "C",
    resetCount: 0,
    hiddenGrowth: 0.1,
  });
  const second = resolvePetPaidResetQuote(catalog, {}, "bui_normal_red_fire10", {
    grade: "S",
    resetCount: 999,
    hiddenGrowth: 0.99,
  });
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
});
