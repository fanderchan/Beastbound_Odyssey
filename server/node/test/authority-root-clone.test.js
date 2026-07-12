"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {cloneAuthorityRoot} = require("../src/auth/authority-root-clone");
const {
  ensureConsumedEquipmentEnvelopeIds,
  readConsumedEquipmentEnvelopeLedger,
} = require("../src/auth/equipment-envelope-consumed-ledger");

test("authority root clones share only a validated immutable consumed ledger", () => {
  const canonical = readConsumedEquipmentEnvelopeLedger({
    eqx_clone_capacity_0001: {
      schemaVersion: 1,
      envelopeId: "eqx_clone_capacity_0001",
    },
  });
  assert.equal(canonical.ok, true);
  const root = {
    profiles: {player_a: {profile: {stoneCoins: 10}}},
    consumedEquipmentEnvelopes: canonical.ledger,
  };
  const cloned = cloneAuthorityRoot(root);
  assert.notEqual(cloned, root);
  assert.notEqual(cloned.profiles, root.profiles);
  assert.equal(cloned.consumedEquipmentEnvelopes, root.consumedEquipmentEnvelopes);

  cloned.profiles.player_a.profile.stoneCoins = 20;
  assert.equal(root.profiles.player_a.profile.stoneCoins, 10);
  const appended = ensureConsumedEquipmentEnvelopeIds(
    cloned.consumedEquipmentEnvelopes,
    "eqx_clone_capacity_0002",
  );
  assert.equal(appended.ok, true);
  assert.notEqual(appended.ledger, canonical.ledger);
  assert.equal(Object.hasOwn(canonical.ledger, "eqx_clone_capacity_0002"), false);
  assert.equal(Object.hasOwn(appended.ledger, "eqx_clone_capacity_0002"), true);
});

test("authority root clones never share an unvalidated ledger", () => {
  const rawLedger = {
    eqx_clone_untrusted_0001: {
      schemaVersion: 1,
      envelopeId: "eqx_clone_untrusted_0001",
    },
  };
  const root = {profiles: {}, consumedEquipmentEnvelopes: rawLedger};
  const cloned = cloneAuthorityRoot(root);
  assert.notEqual(cloned.consumedEquipmentEnvelopes, rawLedger);
  cloned.consumedEquipmentEnvelopes.eqx_clone_untrusted_0001.schemaVersion = 2;
  assert.equal(rawLedger.eqx_clone_untrusted_0001.schemaVersion, 1);
});
