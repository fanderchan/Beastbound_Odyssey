"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  backfillConsumedEquipmentEnvelopeLedger,
  collectMaterializedEquipmentEnvelopeTraces,
  ensureConsumedEquipmentEnvelopeIds,
  readConsumedEquipmentEnvelopeLedger,
} = require("../src/auth/equipment-envelope-consumed-ledger");

function rootWithOrigins() {
  return {
    profiles: {
      player_alpha: {
        playerId: "player_alpha",
        profile: {
          equipmentInstances: {
            equip_000001: {
              transferProvenance: {originEnvelopeId: "eqx_mail_consumed_origin_0001"},
            },
          },
          bank: {
            slots: [{
              equipmentEnvelopes: [{
                instanceState: {
                  transferProvenance: {originEnvelopeId: "eqx_bank_consumed_origin_0002"},
                },
              }],
            }],
          },
        },
      },
    },
    mailMessages: {
      mail_alpha: {
        equipmentEnvelopes: [{
          instanceState: {
            transferProvenance: {originEnvelopeId: "eqx_market_consumed_origin_0003"},
          },
        }],
      },
    },
    marketListings: {
      market_alpha: {
        equipmentEnvelope: {
          instanceState: {
            transferProvenance: {originEnvelopeId: "eqx_bank_consumed_origin_0004"},
          },
        },
      },
    },
  };
}

test("consumed ledger backfills every materialized origin as a permanent canonical tombstone", () => {
  const root = rootWithOrigins();
  const before = structuredClone(root);
  const result = backfillConsumedEquipmentEnvelopeLedger(root);

  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.ledger), [
    "eqx_bank_consumed_origin_0002",
    "eqx_bank_consumed_origin_0004",
    "eqx_mail_consumed_origin_0001",
    "eqx_market_consumed_origin_0003",
  ]);
  for (const [envelopeId, record] of Object.entries(result.ledger)) {
    assert.deepEqual(record, {schemaVersion: 1, envelopeId});
  }
  assert.equal(result.traces.length, 4);
  assert.deepEqual(root, before);
});

test("consumed ledger writes are idempotent but never normalize malformed identities or records", () => {
  const first = ensureConsumedEquipmentEnvelopeIds({}, [
    "eqx_mail_consumed_write_0001",
    "eqx_mail_consumed_write_0001",
  ]);
  assert.equal(first.ok, true);
  assert.deepEqual(first.addedIds, ["eqx_mail_consumed_write_0001"]);
  const second = ensureConsumedEquipmentEnvelopeIds(first.ledger, "eqx_mail_consumed_write_0001");
  assert.equal(second.ok, true);
  assert.deepEqual(second.addedIds, []);
  assert.deepEqual(second.ledger, first.ledger);
  const repeated = ensureConsumedEquipmentEnvelopeIds(
    {},
    Array.from({length: 5000}, (_, index) => (
      index % 2 === 0 ? "eqx_mail_consumed_write_0002" : "eqx_mail_consumed_write_0001"
    )),
  );
  assert.equal(repeated.ok, true);
  assert.deepEqual(repeated.addedIds, [
    "eqx_mail_consumed_write_0001",
    "eqx_mail_consumed_write_0002",
  ]);

  for (const [value, code] of [
    [null, "equipment_consumed_ledger_invalid"],
    [[], "equipment_consumed_ledger_invalid"],
    [{bad: {schemaVersion: 1, envelopeId: "bad"}}, "equipment_consumed_ledger_identity_invalid"],
    [{eqx_mail_consumed_bad_0001: {schemaVersion: 2, envelopeId: "eqx_mail_consumed_bad_0001"}}, "equipment_consumed_ledger_schema_future"],
    [{eqx_mail_consumed_bad_0001: {schemaVersion: 1, envelopeId: "eqx_mail_consumed_other_0002"}}, "equipment_consumed_ledger_identity_conflict"],
    [{eqx_mail_consumed_bad_0001: {schemaVersion: 1, envelopeId: "eqx_mail_consumed_bad_0001", extra: true}}, "equipment_consumed_ledger_record_invalid"],
  ]) {
    const read = readConsumedEquipmentEnvelopeLedger(value);
    assert.equal(read.ok, false);
    assert.equal(read.code, code);
  }
});

test("invalid materialized origins fail closed instead of disappearing during backfill", () => {
  const root = rootWithOrigins();
  root.profiles.player_alpha.profile.equipmentInstances.equip_000001.transferProvenance.originEnvelopeId = " bad ";
  const before = structuredClone(root);
  const result = backfillConsumedEquipmentEnvelopeLedger(root);
  assert.equal(result.ok, false);
  assert.equal(result.code, "equipment_materialized_origin_invalid");
  assert.match(result.path, /equip_000001/);
  assert.deepEqual(root, before);
  assert.equal(collectMaterializedEquipmentEnvelopeTraces(root).length, 4);

  for (const transferProvenance of [null, {}]) {
    const malformed = rootWithOrigins();
    malformed.profiles.player_alpha.profile.equipmentInstances.equip_000001.transferProvenance = transferProvenance;
    const malformedResult = backfillConsumedEquipmentEnvelopeLedger(malformed);
    assert.equal(malformedResult.ok, false);
    assert.equal(malformedResult.code, "equipment_materialized_origin_invalid");
  }

  const malformedEnvelope = rootWithOrigins();
  malformedEnvelope.mailMessages.mail_alpha.equipmentEnvelopes[0].instanceState.transferProvenance = [];
  const malformedEnvelopeResult = backfillConsumedEquipmentEnvelopeLedger(malformedEnvelope);
  assert.equal(malformedEnvelopeResult.ok, false);
  assert.equal(malformedEnvelopeResult.code, "equipment_materialized_origin_invalid");
});
