"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {createPetEncounterPermitAuthority} = require("../src/auth/pet-encounter-permit-authority");

function catalog() {
  return {
    mapsById: {
      test_map: {
        id: "test_map",
        zonesById: {
          grass: {id: "grass", encounterGroupId: "grass_group", encounterRate: 1, rects: [[1, 1, 4, 4]]},
          dry: {id: "dry", encounterGroupId: "dry_group", encounterRate: 0, rects: [[6, 1, 2, 2]]},
          guardian: {id: "guardian", encounterGroupId: "guardian_group", manualOnly: true, rects: [[1, 6, 2, 2]]},
        },
      },
    },
  };
}

function deterministicBytes() {
  let counter = 0;
  return (size) => Buffer.alloc(size, ++counter);
}

function step(authority, movementSeq, overrides = {}) {
  return authority.observeAcceptedStep({
    accountId: "acc_a",
    sessionId: "sess_a",
    mapId: "test_map",
    cellX: 1 + movementSeq,
    cellY: 1,
    movementSeq,
    partyFingerprint: "party_a",
    rosterFingerprint: "roster_a",
    ...overrides,
  });
}

test("movement permit preserves two safe steps and signs one opaque ticket on the third eligible step", () => {
  const authority = createPetEncounterPermitAuthority({
    catalog: catalog(),
    now: () => Date.parse("2026-07-11T00:00:00.000Z"),
    randomBytes: deterministicBytes(),
    randomFloat: () => 0,
    eligibleStepIntervalMs: 0,
  });
  assert.equal(step(authority, 1).permit, null);
  assert.equal(step(authority, 2).permit, null);
  const issued = step(authority, 3).permit;
  assert.equal(typeof issued.token, "string");
  assert.equal(issued.token.length >= 32, true);
  assert.equal(issued.zoneId, "grass");
  assert.equal(issued.encounterGroupId, "grass_group");
  assert.equal(issued.movementSeq, 3);
  assert.equal(Object.hasOwn(issued, "encounterSeed"), false);
  assert.equal(JSON.stringify(issued).includes("pet"), false);
  assert.equal(authority.runtimeStats().pendingCount, 1);
});

test("encounter step credits cap request-speed movement without rejecting movement itself", () => {
  let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
  const authority = createPetEncounterPermitAuthority({
    catalog: catalog(),
    now: () => nowMs,
    randomBytes: deterministicBytes(),
    randomFloat: () => 0,
    eligibleStepIntervalMs: 150,
    eligibleStepBurst: 2,
  });
  assert.equal(step(authority, 1).permit, null);
  assert.equal(step(authority, 2).permit, null);
  const tooFast = step(authority, 3);
  assert.equal(tooFast.ok, true);
  assert.equal(tooFast.permit, null);
  nowMs += 150;
  const paced = step(authority, 4, {cellX: 2, cellY: 2});
  assert.notEqual(paced.permit, null);
});

test("zero-rate zones never sign and leaving or changing zones resets safe-step progress", () => {
  const authority = createPetEncounterPermitAuthority({catalog: catalog(), randomBytes: deterministicBytes(), randomFloat: () => 0, eligibleStepIntervalMs: 0});
  for (let seq = 1; seq <= 8; seq += 1) {
    const result = step(authority, seq, {cellX: 6 + (seq % 2), cellY: 1});
    assert.equal(result.ok, true);
    assert.equal(result.permit, null);
  }
  assert.equal(step(authority, 9, {cellX: 9, cellY: 9}).permit, null);
  assert.equal(step(authority, 10, {cellX: 2, cellY: 2}).permit, null);
  assert.equal(step(authority, 11, {cellX: 3, cellY: 2}).permit, null);
  assert.notEqual(step(authority, 12, {cellX: 4, cellY: 2}).permit, null);
});

test("ordinary wild encounters require exact account, session, location, sequence, party and roster bindings", () => {
  const authority = createPetEncounterPermitAuthority({catalog: catalog(), randomBytes: deterministicBytes(), randomFloat: () => 0, eligibleStepIntervalMs: 0});
  step(authority, 1);
  step(authority, 2);
  const permit = step(authority, 3).permit;
  const base = {
    accountId: "acc_a",
    sessionId: "sess_a",
    request: {encounterIntent: {zoneId: "grass", encounterGroupId: "grass_group"}, encounterPermitToken: permit.token},
    position: {mapId: "test_map", cellX: 4, cellY: 1, movementSeq: 3},
    partyFingerprint: "party_a",
    rosterFingerprint: "roster_a",
  };
  assert.equal(authority.authorizeEncounter({...base, request: {encounterIntent: {zoneId: "grass"}}}).code, "encounter_permit_required");
  assert.equal(authority.authorizeEncounter({...base, sessionId: "sess_b"}).code, "encounter_permit_binding_mismatch");
  assert.equal(authority.authorizeEncounter({...base, position: {...base.position, movementSeq: 4}}).code, "encounter_permit_binding_mismatch");
  assert.equal(authority.authorizeEncounter({...base, partyFingerprint: "party_b"}).code, "encounter_permit_binding_mismatch");
  assert.equal(authority.authorizeEncounter({...base, rosterFingerprint: "roster_b"}).code, "encounter_permit_binding_mismatch");
  const authorized = authority.authorizeEncounter(base);
  assert.equal(authorized.ok, true);
  assert.equal(authorized.authorization.mode, "permit");
  assert.equal(typeof authorized.authorization.encounterSeed, "string");
  assert.equal(authority.consume(authorized.authorization).ok, true);
  assert.equal(authority.authorizeEncounter(base).code, "encounter_permit_replayed");
  assert.equal(authority.consume(authorized.authorization).code, "encounter_permit_replayed");
});

test("moving after issuance invalidates the previous ticket without blocking a later roll", () => {
  const authority = createPetEncounterPermitAuthority({catalog: catalog(), randomBytes: deterministicBytes(), randomFloat: () => 0, eligibleStepIntervalMs: 0});
  step(authority, 1);
  step(authority, 2);
  const first = step(authority, 3).permit;
  const second = step(authority, 4, {cellX: 2, cellY: 2}).permit;
  assert.notEqual(second, null);
  assert.notEqual(second.token, first.token);
  const replay = authority.authorizeEncounter({
    accountId: "acc_a",
    sessionId: "sess_a",
    request: {encounterIntent: {zoneId: "grass"}, encounterPermitToken: first.token},
    position: {mapId: "test_map", cellX: 2, cellY: 2, movementSeq: 4},
    partyFingerprint: "party_a",
    rosterFingerprint: "roster_a",
  });
  assert.equal(replay.code, "encounter_permit_replayed");
  assert.equal(authority.runtimeStats().pendingCount, 1);
});

test("expired tickets fail closed and manual registered interactions stay on their direct guard path", () => {
  let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
  const authority = createPetEncounterPermitAuthority({catalog: catalog(), now: () => nowMs, ttlMs: 1000, randomBytes: deterministicBytes(), randomFloat: () => 0, eligibleStepIntervalMs: 0});
  step(authority, 1);
  step(authority, 2);
  const permit = step(authority, 3).permit;
  nowMs += 1001;
  const expired = authority.authorizeEncounter({
    accountId: "acc_a",
    sessionId: "sess_a",
    request: {encounterIntent: {zoneId: "grass"}, encounterPermitToken: permit.token},
    position: {mapId: "test_map", cellX: 4, cellY: 1, movementSeq: 3},
    partyFingerprint: "party_a",
    rosterFingerprint: "roster_a",
  });
  assert.equal(expired.code, "encounter_permit_expired");
  const manual = authority.authorizeEncounter({
    accountId: "acc_a",
    sessionId: "sess_a",
    request: {encounterIntent: {sourceInteractionId: "guardian_npc"}},
  });
  assert.equal(manual.ok, true);
  assert.equal(manual.authorization.mode, "direct");
  assert.equal(authority.consume(manual.authorization).ok, true);
});

test("stationary encounter-stone slots are server-timed, position-bound and consumable once", () => {
  const startedAtMs = Date.parse("2026-07-11T00:00:00.000Z");
  let nowMs = startedAtMs + 3000;
  const authority = createPetEncounterPermitAuthority({
    catalog: catalog(),
    now: () => nowMs,
    randomBytes: deterministicBytes(),
  });
  const input = {
    accountId: "acc_a",
    sessionId: "sess_a",
    sourceId: "encounter_stone_low",
    startedAtMs,
    expiresAtMs: startedAtMs + 60_000,
    intervalMs: 3000,
    lastConsumedSlot: 0,
    originMapId: "test_map",
    originCell: [2, 2],
    zoneId: "grass",
    encounterGroupId: "grass_group",
    request: {encounterIntent: {zoneId: "grass", encounterGroupId: "grass_group"}},
    position: {mapId: "test_map", cellX: 2, cellY: 2, movementSeq: 7, moving: false},
    partyFingerprint: "party_a",
    rosterFingerprint: "roster_a",
  };
  const authorized = authority.authorizeTimedEncounter(input);
  assert.equal(authorized.ok, true);
  assert.equal(authorized.authorization.mode, "timed");
  assert.equal(typeof authorized.authorization.encounterSeed, "string");
  assert.equal(authority.consume(authorized.authorization).ok, true);
  assert.equal(authority.authorizeTimedEncounter(input).code, "encounter_stone_interval_pending");
  nowMs += 3000;
  const second = authority.authorizeTimedEncounter({...input, lastConsumedSlot: 1});
  assert.equal(second.ok, true);
  assert.equal(authority.consume(second.authorization).ok, true);
  assert.equal(authority.authorizeTimedEncounter({...input, position: {...input.position, cellX: 3}}).code, "encounter_stone_binding_mismatch");
  nowMs = input.expiresAtMs;
  assert.equal(authority.authorizeTimedEncounter(input).code, "encounter_stone_expired");
});
