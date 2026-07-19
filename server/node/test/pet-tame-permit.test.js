"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PROFILE_KEY,
  defaultState,
  hasRequiredPermit,
  planUnlock,
  readState,
} = require("../src/auth/pet-tame-permit");

const TAMING = Object.freeze({
  tameable: true,
  permitId: "tame_bui_novice_sprout",
  permitItemId: "bui_novice_sprout_taming_certificate",
  legacyRidePermitId: "ride_bui_novice_sprout",
});

test("new profiles require the configured Bui tame permit and unlock it once", () => {
  const profile = {[PROFILE_KEY]: defaultState()};
  assert.equal(hasRequiredPermit(profile, TAMING), false);

  const planned = planUnlock(profile, TAMING, "bui_novice_sprout_taming_certificate");
  assert.equal(planned.ok, true);
  assert.deepEqual(planned.state, {
    schemaVersion: 1,
    permitIds: ["tame_bui_novice_sprout"],
  });
  profile[PROFILE_KEY] = planned.state;
  assert.equal(hasRequiredPermit(profile, TAMING), true);

  const duplicate = planUnlock(profile, TAMING, "bui_novice_sprout_taming_certificate");
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "tame_permit_owned");
});

test("only profiles that consumed the previously miswired certificate inherit taming", () => {
  assert.equal(hasRequiredPermit({}, TAMING), false);
  assert.equal(hasRequiredPermit({petRidePermits: {schemaVersion: 1, permitIds: []}}, TAMING), false);
  assert.equal(hasRequiredPermit({
    petRidePermits: {schemaVersion: 1, permitIds: ["ride_bui_novice_sprout"]},
  }, TAMING), true);
  assert.equal(hasRequiredPermit({
    petRidePermits: {schemaVersion: 1, permitIds: ["ride_another_pet"]},
  }, TAMING), false);
  assert.equal(hasRequiredPermit({}, {}), true);
});

test("malformed or mismatched tame permit state fails closed", () => {
  const malformed = {[PROFILE_KEY]: {schemaVersion: 1, permitIds: ["tame_bui_novice_sprout", "tame_bui_novice_sprout"]}};
  assert.equal(readState(malformed).ok, false);
  assert.equal(hasRequiredPermit(malformed, TAMING), false);
  assert.equal(planUnlock(malformed, TAMING, "bui_novice_sprout_taming_certificate").code, "tame_permit_state_invalid");
  assert.equal(planUnlock({[PROFILE_KEY]: defaultState()}, TAMING, "wrong_certificate").code, "tame_permit_item_mismatch");
});
