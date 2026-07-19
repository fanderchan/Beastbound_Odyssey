"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PROFILE_KEY,
  defaultState,
  hasRequiredPermit,
  planUnlock,
  readState,
} = require("../src/auth/pet-ride-permit");

const RIDING = Object.freeze({
  rideable: true,
  permitId: "ride_bui_novice_sprout",
  permitItemId: "bui_novice_sprout_riding_certificate",
  legacyProfilesGranted: true,
});

test("new profiles require the configured Bui permit and unlock it once", () => {
  const profile = {[PROFILE_KEY]: defaultState()};
  assert.equal(hasRequiredPermit(profile, RIDING), false);

  const planned = planUnlock(profile, RIDING, "bui_novice_sprout_riding_certificate");
  assert.equal(planned.ok, true);
  assert.deepEqual(planned.state, {
    schemaVersion: 1,
    permitIds: ["ride_bui_novice_sprout"],
  });
  profile[PROFILE_KEY] = planned.state;
  assert.equal(hasRequiredPermit(profile, RIDING), true);

  const duplicate = planUnlock(profile, RIDING, "bui_novice_sprout_riding_certificate");
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "ride_permit_owned");
});

test("only the explicitly grandfathered form accepts a missing legacy field", () => {
  assert.equal(hasRequiredPermit({}, RIDING), true);
  assert.equal(hasRequiredPermit({}, {...RIDING, legacyProfilesGranted: false}), false);
  assert.equal(hasRequiredPermit({}, {}), true);
});

test("malformed or mismatched permit state fails closed", () => {
  const malformed = {[PROFILE_KEY]: {schemaVersion: 1, permitIds: ["ride_bui_novice_sprout", "ride_bui_novice_sprout"]}};
  assert.equal(readState(malformed).ok, false);
  assert.equal(hasRequiredPermit(malformed, RIDING), false);
  assert.equal(planUnlock(malformed, RIDING, "bui_novice_sprout_riding_certificate").code, "ride_permit_state_invalid");
  assert.equal(planUnlock({[PROFILE_KEY]: defaultState()}, RIDING, "wrong_certificate").code, "ride_permit_item_mismatch");
});
