"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildPresenceRebase,
  createPresenceRevisionTracker,
  projectOnlinePositionDelta,
} = require("../src/auth/online-presence");

test("presence revisions advance independently per account", () => {
  const revisions = createPresenceRevisionTracker();
  assert.equal(revisions.current("account_a"), 0);
  assert.equal(revisions.next("account_a"), 1);
  assert.equal(revisions.next("account_a"), 2);
  assert.equal(revisions.next("account_b"), 1);
  assert.equal(revisions.current("account_a"), 2);
  assert.equal(revisions.ensure("account_a"), 2);
  assert.equal(revisions.ensure("account_c"), 1);
  assert.equal(revisions.next("account_c"), 2);
  revisions.clear("account_a");
  assert.equal(revisions.current("account_a"), 0);
});

test("presence rebase contains only AOI membership differences", () => {
  const stable = {accountId: "stable", position: {mapId: "map_a", cellX: 2, cellY: 2}};
  const entered = {accountId: "z_entered_near", position: {mapId: "map_a", cellX: 3, cellY: 2}};
  const enteredFar = {accountId: "a_entered_far", position: {mapId: "map_a", cellX: 4, cellY: 2}};
  const left = {accountId: "left", position: {mapId: "map_a", cellX: 20, cellY: 20}};
  const self = {accountId: "self", position: {mapId: "map_a", cellX: 1, cellY: 1}};
  const rebase = buildPresenceRebase([self, stable, entered, enteredFar], [self, stable, left], "self");
  assert.deepEqual(rebase.upserts, [entered, enteredFar]);
  assert.deepEqual(rebase.removedAccountIds, ["left"]);
  assert.equal(rebase.schemaVersion, 1);
});

test("position projection emits one-account upsert, remove, or nothing", () => {
  const event = {
    type: "online.position",
    accountId: "actor",
    presenceRevision: 7,
    player: {accountId: "actor", position: {mapId: "map_a", cellX: 2, cellY: 3}},
    players: [{accountId: "legacy_roster_must_not_leak"}],
  };
  const upsert = projectOnlinePositionDelta({
    event,
    viewerAccountId: "viewer",
    currentVisible: true,
    previousVisible: false,
  });
  assert.equal(upsert.visible, true);
  assert.equal(upsert.event.change, "upsert");
  assert.equal(upsert.event.player.accountId, "actor");
  assert.equal(Object.hasOwn(upsert.event, "players"), false);
  assert.equal(Object.hasOwn(upsert.event, "previousPosition"), false);
  assert.equal(Object.hasOwn(upsert.event, "position"), false);

  const remove = projectOnlinePositionDelta({
    event,
    viewerAccountId: "viewer",
    currentVisible: false,
    previousVisible: true,
  });
  assert.equal(remove.visible, true);
  assert.equal(remove.event.change, "remove");
  assert.equal(Object.hasOwn(remove.event, "player"), false);
  assert.equal(Object.hasOwn(remove.event, "previousPosition"), false);
  assert.equal(Object.hasOwn(remove.event, "position"), false);

  const hidden = projectOnlinePositionDelta({
    event,
    viewerAccountId: "viewer",
    currentVisible: false,
    previousVisible: false,
  });
  assert.equal(hidden.visible, false);

  const self = projectOnlinePositionDelta({
    event,
    viewerAccountId: "actor",
    currentVisible: false,
    previousVisible: false,
  });
  assert.equal(self.visible, true);
  assert.equal(self.event.change, "upsert");
});
