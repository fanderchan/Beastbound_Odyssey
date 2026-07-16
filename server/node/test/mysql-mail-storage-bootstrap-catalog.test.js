"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  createMailStorageBootstrapAttachmentCertifier,
} = require("../src/mysql-mail-storage-bootstrap-catalog");

const fixture = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, "../../../tools/fixtures/equipment_transfer_public_v1_vectors.json"),
  "utf8",
));

function mail(overrides = {}) {
  return {
    mailId: "mail_bootstrap_catalog_1",
    mailKind: "player",
    senderAccountId: "account_sender",
    senderUsername: "sender",
    senderDisplayName: "寄件人",
    recipientAccountId: "account_recipient",
    recipientUsername: "recipient",
    recipientDisplayName: "收件人",
    title: "真实目录认证测试",
    body: "附件只能按服务端真实目录认证。",
    items: [],
    equipmentEnvelopes: [],
    currency: {},
    createdAt: "2026-07-16T06:00:00.000Z",
    readAt: null,
    schemaVersion: 2,
    ...overrides,
  };
}

test("default certifier accepts an ordinary item from the authoritative bag catalog", () => {
  const certifyAttachment = createMailStorageBootstrapAttachmentCertifier();
  const source = mail({items: [{itemId: "item_meat_small", count: 3}]});
  const before = structuredClone(source);
  const result = certifyAttachment(source);

  assert.equal(result.ok, true);
  assert.deepEqual(result.ordinaryItems, [{itemId: "item_meat_small", count: 3}]);
  assert.deepEqual(result.equipmentItems, []);
  assert.deepEqual(source, before);
});

test("default certifier validates a complete private equipment envelope with production rules", () => {
  const certifyAttachment = createMailStorageBootstrapAttachmentCertifier();
  const envelope = structuredClone(fixture.vectors[0].internalEnvelope);
  const source = mail({
    items: [{itemId: envelope.itemId, count: 1}],
    equipmentEnvelopes: [envelope],
  });
  const result = certifyAttachment(source);

  assert.equal(result.ok, true);
  assert.deepEqual(result.equipmentItems, [{itemId: "weapon_wooden_club", count: 1}]);
  assert.equal(result.equipmentEnvelopes.length, 1);
  assert.equal(result.equipmentEnvelopes[0].stateFingerprint, envelope.stateFingerprint);
  assert.equal(result.equipmentEnvelopes[0].instanceState.source, "market_escrow");
});

test("catalog-only and bag equipment use-context identities are both treated as equipment", () => {
  const equipmentCatalog = {
    itemById: new Map([["catalog_equipment", {id: "catalog_equipment"}]]),
  };
  const bagItemCatalog = {
    itemById: new Map([
      ["catalog_equipment", {id: "catalog_equipment", useContexts: []}],
      ["bag_context_equipment", {id: "bag_context_equipment", useContexts: ["equipment"]}],
      ["ordinary", {id: "ordinary", useContexts: []}],
    ]),
  };
  const certifyAttachment = createMailStorageBootstrapAttachmentCertifier({
    equipmentCatalog,
    bagItemCatalog,
    playerLevelRuntime: {maxPlayerLevel: 140, expToNextLevel: () => 100},
    equipmentWearRules: {weaponAttacksPerDurability: 100, armorHitsPerDurability: 10},
  });

  for (const itemId of ["catalog_equipment", "bag_context_equipment"]) {
    const legacy = mail({items: [{itemId, count: 1}], schemaVersion: 1});
    delete legacy.equipmentEnvelopes;
    const result = certifyAttachment(legacy);
    assert.equal(result.ok, false, itemId);
    assert.equal(result.code, "mail_equipment_transfer_unsupported", itemId);
  }
  const ordinary = mail({items: [{itemId: "ordinary", count: 1}], schemaVersion: 1});
  delete ordinary.equipmentEnvelopes;
  assert.equal(certifyAttachment(ordinary).ok, true);
});

test("unknown items and future mail or envelope schemas fail closed without mutation", () => {
  const certifyAttachment = createMailStorageBootstrapAttachmentCertifier();
  const validEnvelope = fixture.vectors[0].internalEnvelope;
  const scenarios = [
    {
      source: mail({items: [{itemId: "future_item_unknown", count: 1}]}),
      code: "mail_item_unknown",
    },
    {
      source: mail({schemaVersion: 3}),
      code: "mail_schema_future",
    },
    {
      source: mail({
        items: [{itemId: validEnvelope.itemId, count: 1}],
        equipmentEnvelopes: [{...structuredClone(validEnvelope), schemaVersion: 2}],
      }),
      code: "equipment_transfer_envelope_schema_future",
    },
  ];

  for (const scenario of scenarios) {
    const before = structuredClone(scenario.source);
    const result = certifyAttachment(scenario.source);
    assert.equal(result.ok, false, scenario.code);
    assert.equal(result.code, scenario.code);
    assert.deepEqual(scenario.source, before, scenario.code);
  }
});

test("bootstrap catalog module stays independent from service and transport entrypoints", () => {
  const modulePath = require.resolve("../src/mysql-mail-storage-bootstrap-catalog");
  const authServicePath = require.resolve("../src/auth-service");
  const httpServerPath = require.resolve("../src/http-server");
  const source = fs.readFileSync(modulePath, "utf8");

  assert.equal(source.includes("./auth-service"), false);
  assert.equal(source.includes("./http-server"), false);
  assert.equal(Object.hasOwn(require.cache, authServicePath), false);
  assert.equal(Object.hasOwn(require.cache, httpServerPath), false);
});
