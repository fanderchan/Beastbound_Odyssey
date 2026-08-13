"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  authorityRecordCollectionMetrics,
  authorityRecordDeltaFrom,
  authorityRecordStateDiagnostics,
  cloneAuthorityRoot,
  freezeAuthorityRootCowRecordValues,
} = require("../src/auth/authority-root-clone");

function profileDocument(playerId, revision = 1) {
  return {
    playerId,
    accountId: `acc_${playerId}`,
    profileRevision: revision,
    updatedAt: `2026-08-14T00:00:0${revision}.000Z`,
    profile: {displayName: playerId, stoneCoins: 100 - revision},
  };
}

function listing(listingId, sellerAccountId) {
  return {
    listingId,
    sellerAccountId,
    itemId: "item_pet_food_small",
    count: 1,
    unitPrice: 10,
    currency: "stoneCoins",
    createdAt: "2026-08-14T00:00:00.000Z",
    schemaVersion: 1,
  };
}

test("tracked record clones expose exact direct set, delete, and insert deltas", () => {
  const profiles = freezeAuthorityRootCowRecordValues({
    player_a: profileDocument("player_a"),
    player_b: profileDocument("player_b"),
  }, "profiles");
  const candidate = cloneAuthorityRoot({profiles});

  candidate.profiles.player_a = profileDocument("player_a", 2);
  delete candidate.profiles.player_b;
  candidate.profiles.player_c = profileDocument("player_c");

  const delta = authorityRecordDeltaFrom(profiles, candidate.profiles, "profiles");
  assert.equal(delta.ok, true);
  assert.deepEqual(delta.changes.map(({recordId, disposition}) => [recordId, disposition]), [
    ["player_a", "update"],
    ["player_b", "delete"],
    ["player_c", "insert"],
  ]);
  assert.equal(profiles.player_a.profileRevision, 1);
  assert.equal(Object.hasOwn(profiles, "player_b"), true);
  assert.equal(Object.hasOwn(profiles, "player_c"), false);
});

test("market metrics descend with tracked mutations without rescanning the source", () => {
  const marketListings = {};
  for (let index = 0; index < 120; index += 1) {
    const listingId = `listing_${String(index).padStart(3, "0")}`;
    marketListings[listingId] = listing(
      listingId,
      index < 7 ? "acc_actor" : `acc_seller_${index}`,
    );
  }
  const published = freezeAuthorityRootCowRecordValues(marketListings, "marketListings");
  const candidate = cloneAuthorityRoot({marketListings: published});
  delete candidate.marketListings.listing_000;
  candidate.marketListings.listing_new = listing("listing_new", "acc_actor");

  const metrics = authorityRecordCollectionMetrics(candidate.marketListings, "marketListings");
  assert.ok(metrics);
  assert.equal(metrics.recordCount, 120);
  assert.equal(metrics.sellerAccountCount("acc_actor"), 7);
});

test("the 1025th mutation creates an explicit checkpoint fallback", () => {
  const profiles = freezeAuthorityRootCowRecordValues({
    player_base: profileDocument("player_base"),
  }, "profiles");
  const candidate = cloneAuthorityRoot({profiles});
  const beforeDiagnostics = authorityRecordStateDiagnostics();
  for (let index = 0; index < 1025; index += 1) {
    const playerId = `player_checkpoint_${String(index).padStart(4, "0")}`;
    candidate.profiles[playerId] = profileDocument(playerId);
  }

  const delta = authorityRecordDeltaFrom(profiles, candidate.profiles, "profiles");
  const afterDiagnostics = authorityRecordStateDiagnostics();
  assert.equal(delta.ok, false);
  assert.equal(delta.reason, "checkpoint");
  assert.equal(
    afterDiagnostics.journalCheckpoints - beforeDiagnostics.journalCheckpoints,
    1,
  );
  assert.equal(
    afterDiagnostics.plannerCheckpointFallbacks - beforeDiagnostics.plannerCheckpointFallbacks,
    1,
  );
});

test("record certification rejects a container key that disagrees with its entity identity", () => {
  const profiles = freezeAuthorityRootCowRecordValues({
    wrong_outer_key: profileDocument("player_actual"),
  }, "profiles");
  const candidate = cloneAuthorityRoot({profiles});
  candidate.profiles.wrong_outer_key = profileDocument("player_actual", 2);

  const delta = authorityRecordDeltaFrom(profiles, candidate.profiles, "profiles");
  assert.equal(delta.ok, false);
  assert.equal(delta.reason, "uncertified_lineage");
});
