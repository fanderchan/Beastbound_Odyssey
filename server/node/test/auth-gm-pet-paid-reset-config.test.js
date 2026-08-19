"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createAuthService,
  createAsyncWriteAuthStore,
  createMemoryAuthStore,
} = require("../src/auth-service");
const {
  registerSelectedCharacterFixture,
} = require("../test-support/selected-character-fixture");
const PET_PAID_RESET_FORM_POLICY_COUNT = require(
  "../../../client/godot/data/balance/pet_paid_reset_policy.json",
).formPolicies.length;

const COMMAND_ID = "gm_pet_paid_reset_config";
const NOW_MS = Date.parse("2026-07-17T12:00:00.000Z");

function registerGm(service, username = "paidresetgm") {
  const registered = registerSelectedCharacterFixture(service, {
    username,
    displayName: "重置配置GM",
    characterDisplayName: "重置猎人",
  });
  assert.equal(service.grantGm({
    username,
    commandIds: [COMMAND_ID],
    policyId: "test_explicit_gm_v1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    grantedBy: "paid_reset_config_test",
  }).ok, true);
  return registered;
}

test("GM paid reset config is command-scoped, revisioned, audited, and profile-neutral", () => {
  const store = createMemoryAuthStore();
  const service = createAuthService({store, now: () => NOW_MS});
  const player = registerSelectedCharacterFixture(service, {
    username: "paidresetdeny",
    displayName: "重置配置普通玩家",
  });
  const denied = service.getPetPaidResetConfig(player.session.token);
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "gm_denied");

  const gm = registerGm(service);
  const profileBefore = structuredClone(
    service.snapshot().profiles[service.snapshot().profileBindings[gm.account.accountId].playerId],
  );
  const defaults = service.getPetPaidResetConfig(gm.session.token);
  assert.equal(defaults.ok, true);
  assert.equal(defaults.config.revision, 0);
  assert.equal(defaults.resolvedForms.length, PET_PAID_RESET_FORM_POLICY_COUNT);
  assert.equal(defaults.resolvedForms.find((entry) => entry.formId === "bui_normal_red_fire10").amount, 120000);
  const defaultTerminal = defaults.resolvedForms
    .find((entry) => entry.formId === "wuli_evolved_crystal_earth8_water2");
  assert.equal(defaultTerminal.resetAllowed, false);
  assert.equal(defaultTerminal.ineligibleReason, "terminal_evolution");
  assert.equal(Object.hasOwn(defaultTerminal, "amount"), false);
  assert.equal(Object.hasOwn(defaultTerminal, "currencyId"), false);
  assert.equal(Object.hasOwn(defaultTerminal, "priceTierId"), false);

  const updated = service.updatePetPaidResetConfig(gm.session.token, {
    expectedRevision: 0,
    tierOverrides: {
      stone_standard: {
        currencyId: "stoneCoins",
        amount: 180000,
        walletPolicyId: "bound_first_split",
      },
    },
    formOverrides: {
      blue_man_dragon_water10: {
        currencyId: "diamonds",
        amount: 80,
        walletPolicyId: "unbound_only",
      },
      wuli_evolved_crystal_earth8_water2: {
        currencyId: "diamonds",
        amount: 1,
        walletPolicyId: "unbound_only",
      },
    },
  });
  assert.equal(updated.ok, true, updated.message);
  assert.equal(updated.changed, true);
  assert.equal(updated.config.revision, 1);
  assert.equal(updated.config.updatedBy, "paidresetgm");
  assert.equal(updated.resolvedForms.find((entry) => entry.formId === "bui_normal_red_fire10").amount, 180000);
  const dragon = updated.resolvedForms.find((entry) => entry.formId === "blue_man_dragon_water10");
  assert.deepEqual(
    {currencyId: dragon.currencyId, amount: dragon.amount, source: dragon.priceSource},
    {currencyId: "diamonds", amount: 80, source: "form_override"},
  );
  const terminal = updated.resolvedForms
    .find((entry) => entry.formId === "wuli_evolved_crystal_earth8_water2");
  assert.equal(terminal.resetAllowed, false);
  assert.equal(terminal.ineligibleReason, "terminal_evolution");
  assert.equal(Object.hasOwn(terminal, "amount"), false);
  assert.equal(Object.hasOwn(terminal, "priceSource"), false);

  const stale = service.updatePetPaidResetConfig(gm.session.token, {
    expectedRevision: 0,
    tierOverrides: {},
    formOverrides: {},
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "pet_paid_reset_config_revision_conflict");
  const unknown = service.updatePetPaidResetConfig(gm.session.token, {
    expectedRevision: 1,
    tierOverrides: {},
    formOverrides: {
      unknown_pet_form: {
        currencyId: "stoneCoins",
        amount: 1,
        walletPolicyId: "bound_first_split",
      },
    },
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, "pet_paid_reset_config_invalid");

  const snapshot = service.snapshot();
  assert.equal(snapshot.petPaidResetConfig.revision, 1);
  assert.equal(snapshot.gmCommandAudit.length >= 5, true);
  const updateAudit = snapshot.gmCommandAudit.find((entry) => (
    entry.commandId === COMMAND_ID
    && entry.ok === true
    && entry.details
    && entry.details.configRevision === 1
  ));
  assert.equal(updateAudit.details.tierOverrides.stone_standard.amount, 180000);
  assert.equal(updateAudit.details.formOverrides.blue_man_dragon_water10.amount, 80);
  assert.equal(updateAudit.details.formOverrides.wuli_evolved_crystal_earth8_water2.amount, 1);
  assert.deepEqual(snapshot.profiles[snapshot.profileBindings[gm.account.accountId].playerId], profileBefore);

  const restarted = createAuthService({store, now: () => NOW_MS});
  const reloaded = restarted.getPetPaidResetConfig(gm.session.token);
  assert.equal(reloaded.ok, true);
  assert.equal(reloaded.config.revision, 1);
  assert.equal(reloaded.resolvedForms.find((entry) => entry.formId === "blue_man_dragon_water10").amount, 80);
});

test("malformed persisted paid reset config fails closed without replacing it", () => {
  const seed = createAuthService({store: createMemoryAuthStore(), now: () => NOW_MS});
  const gm = registerGm(seed, "paidresetcorrupt");
  const corrupted = seed.snapshot();
  corrupted.petPaidResetConfig = {schemaVersion: 1, revision: 99};
  const service = createAuthService({store: createMemoryAuthStore(corrupted), now: () => NOW_MS});

  const read = service.getPetPaidResetConfig(gm.session.token);
  assert.equal(read.ok, false);
  assert.equal(read.code, "pet_paid_reset_config_invalid");
  const update = service.updatePetPaidResetConfig(gm.session.token, {
    expectedRevision: 0,
    tierOverrides: {},
    formOverrides: {},
  });
  assert.equal(update.ok, false);
  assert.equal(update.code, "pet_paid_reset_config_invalid");
  assert.deepEqual(service.snapshot().petPaidResetConfig, {schemaVersion: 1, revision: 99});
});

test("paid reset config is published only after the owning durable save succeeds", async () => {
  const base = createMemoryAuthStore();
  const seed = createAuthService({store: base, now: () => NOW_MS});
  const gm = registerGm(seed, "paidresetcommit");
  let rejectNextSave = true;
  const store = createAsyncWriteAuthStore({
    mode: "memory",
    load: () => base.load(),
    async saveAsync(nextData) {
      if (rejectNextSave) {
        rejectNextSave = false;
        const error = new Error("synthetic paid reset config commit failure");
        error.outcomeUnknown = false;
        throw error;
      }
      base.save(nextData);
    },
  }, {onError: () => {}});
  const service = createAuthService({store, now: () => NOW_MS});
  const payload = {
    expectedRevision: 0,
    tierOverrides: {
      stone_standard: {
        currencyId: "stoneCoins",
        amount: 190000,
        walletPolicyId: "bound_first_split",
      },
    },
    formOverrides: {},
  };

  await assert.rejects(
    service.invokeDurable("updatePetPaidResetConfig", [gm.session.token, payload], {
      actionId: "test_paid_reset_config_commit",
    }),
    (error) => error && error.code === "storage_write_failed",
  );
  assert.deepEqual(service.snapshot().petPaidResetConfig, {});
  assert.deepEqual(base.load().petPaidResetConfig, {});

  const committed = await service.invokeDurable("updatePetPaidResetConfig", [gm.session.token, payload], {
    actionId: "test_paid_reset_config_commit",
  });
  assert.equal(committed.ok, true);
  assert.equal(committed.config.revision, 1);
  assert.equal(service.snapshot().petPaidResetConfig.revision, 1);
  assert.equal(base.load().petPaidResetConfig.revision, 1);
});
