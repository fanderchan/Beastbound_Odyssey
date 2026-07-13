"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildPresenceRebase,
  createPresenceRevisionTracker,
  projectOnlinePositionDelta,
  projectOnlinePositionRebase,
  projectPresenceWirePlayers,
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
    username: "actor_name",
    presenceRevision: 7,
    player: {
      accountId: "actor",
      username: "actor_name",
      displayName: "远端猎人",
      playerId: "private_player_id",
      partyId: "party_1",
      partyRole: "leader",
      position: {
        mapId: "map_a",
        cellX: 2,
        cellY: 3,
        facing: "east",
        moving: true,
        movementSeq: 91,
        authority: "server_step",
        hasCell: true,
        precision: "cell",
        updatedAt: "private-time",
        schemaVersion: 1,
      },
      presenceRevision: 7,
    },
    position: {mapId: "map_a", cellX: 2, cellY: 3, authority: "server_step"},
    previousPosition: {mapId: "map_a", cellX: 1, cellY: 3},
    aoi: {scope: "aoi", mapId: "map_a", cellX: 2, cellY: 3, radius: 18},
    authority: "server_step",
    movement: {stepAccepted: true},
    players: [{accountId: "legacy_roster_must_not_leak"}],
    schemaVersion: 1,
    createdAt: "2026-07-13T00:00:00.000Z",
  };
  const upsert = projectOnlinePositionDelta({
    event,
    viewerAccountId: "viewer",
    currentVisible: true,
    previousVisible: false,
  });
  assert.equal(upsert.visible, true);
  assert.deepEqual(upsert.event, {
    type: "online.position",
    change: "upsert",
    accountId: "actor",
    presenceRevision: 7,
    player: {
      accountId: "actor",
      username: "actor_name",
      displayName: "远端猎人",
      partyId: "party_1",
      partyRole: "leader",
      position: {mapId: "map_a", cellX: 2, cellY: 3, facing: "east", moving: true, hasCell: true},
    },
    schemaVersion: 1,
    createdAt: "2026-07-13T00:00:00.000Z",
  });

  const remove = projectOnlinePositionDelta({
    event,
    viewerAccountId: "viewer",
    currentVisible: false,
    previousVisible: true,
  });
  assert.equal(remove.visible, true);
  assert.deepEqual(remove.event, {
    type: "online.position",
    change: "remove",
    accountId: "actor",
    presenceRevision: 7,
    schemaVersion: 1,
    createdAt: "2026-07-13T00:00:00.000Z",
  });

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

test("protocol v10 snapshot and self rebase rows keep only consumed public fields", () => {
  const fullPlayer = {
    accountId: "remote",
    username: "remote_user",
    displayName: "远端玩家",
    playerId: "must_not_leak",
    partyId: "party_a",
    partyRole: "member",
    presenceRevision: 12,
    position: {
      mapId: "map_a",
      cellX: 6,
      cellY: 7,
      facing: "north",
      moving: false,
      movementSeq: 300,
      authority: "server_step",
      hasCell: true,
      precision: "cell",
      updatedAt: "private",
      schemaVersion: 1,
    },
  };
  assert.deepEqual(projectPresenceWirePlayers([fullPlayer], {includeRevision: true}), [{
    accountId: "remote",
    username: "remote_user",
    displayName: "远端玩家",
    partyId: "party_a",
    partyRole: "member",
    position: {mapId: "map_a", cellX: 6, cellY: 7, facing: "north", moving: false, hasCell: true},
    presenceRevision: 12,
  }]);

  const rebase = projectOnlinePositionRebase({
    event: {
      type: "online.position",
      accountId: "self",
      presenceRevision: 19,
      position: {mapId: "map_a", cellX: 2, cellY: 2},
      previousPosition: {mapId: "map_a", cellX: 1, cellY: 2},
      schemaVersion: 1,
      createdAt: "2026-07-13T00:00:00.000Z",
    },
    aoi: {scope: "aoi", mapId: "map_a", cellX: 2, cellY: 2, radius: 18, private: "drop"},
    presenceRebase: {upserts: [fullPlayer], removedAccountIds: ["left"]},
  });
  assert.deepEqual(Object.keys(rebase), [
    "type", "change", "accountId", "presenceRevision", "aoi", "presenceRebase", "schemaVersion", "createdAt",
  ]);
  assert.deepEqual(rebase.presenceRebase.removedAccountIds, ["left"]);
  assert.deepEqual(rebase.presenceRebase.upserts, projectPresenceWirePlayers([fullPlayer], {includeRevision: true}));
  assert.equal(Object.hasOwn(rebase, "position"), false);
  assert.equal(Object.hasOwn(rebase, "previousPosition"), false);
});
