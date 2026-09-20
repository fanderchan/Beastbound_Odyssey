"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const {once} = require("node:events");
const {protocolMetadata} = require("../../server/node/src/protocol");
const {startGuardianReview, ENCOUNTER} = require("../guardian_review_backend.cjs");
const {createPetEncounterAuthority} = require("../../server/node/src/auth/pet-encounter-authority");
const {createPetEncounterPermitAuthority} = require("../../server/node/src/auth/pet-encounter-permit-authority");

test("guardian review uses five HTTP accounts, authoritative encounters and settled profiles", {timeout: 60000}, async () => {
  const directory = path.resolve(__dirname, "../../.run", `guardian-review-test-${crypto.randomUUID()}`);
  const review = await startGuardianReview(directory);
  let eventSocket;
  try {
    // A live Main owns upgraded event sockets. HTTP close alone cannot drain them.
    const fixture = JSON.parse(fs.readFileSync(path.join(directory, "fixture.json")));
    const initialProfiles = JSON.parse(fs.readFileSync(path.join(directory, "initial-profiles.json")));
    assert.equal(new Set(initialProfiles.map(row => row.profile.player.appearanceId)).size, 4,
      "the real client review must distinguish all four existing character appearances");
    const roster = await review.request(0, "/players/online?mapId=earth_vein_cave_f4&scope=aoi&cellX=21&cellY=8&radius=12");
    assert.equal(roster.players.length, 5);
    assert.equal(new Set(roster.players.map(row => `${row.position.cellX},${row.position.cellY}`)).size, 5,
      "overlapping all teammates cannot prove each world actor is visible");
    eventSocket = await new Promise((resolve, reject) => {
      const request = http.get(review.baseUrl + "/events?clientVersion=guardian-review&clientProtocolVersion=" + protocolMetadata().protocolVersion,
        {headers: {Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13",
          "Sec-WebSocket-Key": crypto.randomBytes(16).toString("base64"),
          Authorization: "Bearer " + fixture.session.serverSessionToken}});
      request.once("upgrade", (response, socket) => {
        assert.equal(response.statusCode, 101);
        socket.on("data", () => {});
        resolve(socket);
      });
      request.once("error", reject);
      request.once("response", response => { response.resume(); reject(new Error("event stream upgrade rejected")); });
      request.setTimeout(5000, () => request.destroy(new Error("event stream upgrade timed out")));
    });
    const start = await review.request(0, "/battle/party-encounter", ENCOUNTER);
    assert.equal(start.room.mode, "party_pve");
    assert.equal(start.room.participants.length, 5);
    assert.equal(start.room.battle.actors.length, 20);
    for (let tick = 0; tick < 80 && !review.closedRoom(); tick++) {
      await review.tick({includeLeader: true});
    }
    assert.equal(review.closedRoom()?.status, "closed", "normal commands must finish the real encounter");
    assert.ok(review.closedRoom().battle.result.winnerAccountId, "the prepared QA party must win without outcome injection");
    for (let index = 0; index < 5; index++) {
      const recovery = (await review.request(index, "/battle/state")).room;
      assert.equal(recovery.roomId, start.room.roomId);
      assert.equal(recovery.status, "closed");
      assert.equal(recovery.mode, "party_pve");
      assert.deepEqual(recovery.entry, {mapId: "earth_vein_cave_f4"},
        "closed-room polling must not replace the final round's cave backdrop with gray");
      assert.deepEqual(recovery.participants, []);
      assert.equal(recovery.seed, "");
    }
  } finally {
    const socketClosed = eventSocket ? once(eventSocket, "close") : Promise.resolve();
    await review.close();
    await socketClosed;
  }
  const initial = JSON.parse(fs.readFileSync(path.join(directory, "initial-profiles.json")));
  const final = JSON.parse(fs.readFileSync(path.join(directory, "final-profiles.json")));
  for (let index = 0; index < 5; index++) {
    assert.ok(final[index].profileSummary.profileRevision > initial[index].profileSummary.profileRevision,
      "an on-screen outcome alone does not prove profile settlement");
    assert.equal(final[index].profile.player.appearanceId, initial[index].profile.player.appearanceId);
    const rings = profile => profile.backpackSlots.reduce((count, slot) => count +
      (slot.itemId === "ring_earth_trial" ? slot.count : 0), 0);
    assert.equal(rings(final[index].profile) - rings(initial[index].profile), 1);
    assert.equal(initial[index].profile.player.maxHp, index === 0 ? 520 : 1040);
  }
  assert.ok(fs.existsSync(path.join(directory, "closed-room.json")));
  assert.ok(fs.existsSync(path.join(directory, "stopped.json")));
  const streamLog = fs.readFileSync(path.join(directory, "event-stream.ndjson"), "utf8");
  const stream = streamLog.trim().split("\n").map(line => JSON.parse(line));
  assert.ok(stream.some(row => row.connections === 1 && row.acceptedUpgrades === 1));
  assert.equal(stream.at(-1).connections, 0, "stream observations must include completed shutdown");
  assert.equal(stream.at(-1).rejectedUpgrades, 0);
  const privateFixture = JSON.parse(fs.readFileSync(path.join(directory, "fixture.json")));
  assert.equal(streamLog.includes(privateFixture.session.serverSessionToken), false);
  assert.equal(fs.statSync(path.join(directory, "fixture.json")).mode & 0o777, 0o600);
  await assert.rejects(fetch(review.baseUrl + "/health"), "the isolated backend must be stopped");
});

test("guardian transport failure preserves diagnostics without retrying a mutation or logging credentials", async () => {
  const directory = path.resolve(__dirname, "../../.run", `guardian-review-failure-${crypto.randomUUID()}`);
  const review = await startGuardianReview(directory);
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  try {
    globalThis.fetch = async () => {
      attempts++;
      throw new TypeError("Bearer secret-value", {cause: Object.assign(new Error("secret-value"), {
        code: "ECONNRESET", socket: {bytesWritten: 300, bytesRead: 100},
      })});
    };
    await assert.rejects(review.request(0, "/players/position", {privateValue: "secret-value"}), /POST \/players\/position: TypeError ECONNRESET/);
    assert.equal(attempts, 1);
    const raw = fs.readFileSync(path.join(directory, "request-failures.ndjson"), "utf8");
    assert.equal(raw.includes("secret-value"), false);
    const row = JSON.parse(raw);
    assert.equal(row.method, "POST");
    assert.equal(row.route, "/players/position");
    assert.equal(row.causeCode, "ECONNRESET");
    assert.equal(row.bytesRead, 100);
  } finally {
    globalThis.fetch = originalFetch;
    await review.close();
  }
});

test("downed-owner regression discloses its HP fixture and keeps the real battle progressing", {timeout: 60000}, async () => {
  const directory = path.resolve(__dirname, "../../.run", `guardian-review-downed-${crypto.randomUUID()}`);
  const review = await startGuardianReview(directory, {downedOwnerCheck: true});
  try {
    const profiles = JSON.parse(fs.readFileSync(path.join(directory, "initial-profiles.json")));
    assert.equal(profiles[0].profile.player.hp, 1);
    assert.equal(profiles[0].profile.player.maxHp, 10400);
    assert.equal(profiles[0].profile.petInstances[0].hp, 1);
    assert.ok(profiles[0].profile.petInstances[0].maxHp > 1);
    assert.ok(profiles.slice(1).every(row => row.profile.player.hp === 1040 && row.profile.player.maxHp === 1040
      && row.profile.petInstances[0].hp === row.profile.petInstances[0].maxHp));
    const info = JSON.parse(fs.readFileSync(path.join(directory, "server-info.json")));
    assert.equal(info.downedOwnerCheck, true);
    assert.deepEqual(info.characterMaxHp, [10400, 1040, 1040, 1040, 1040]);
    assert.equal(info.encounterSeedSource, "qa_fixed_58x32");
    assert.equal(info.fullProfileSaveEnabled, false);
    const start = await review.request(0, "/battle/party-encounter", ENCOUNTER);
    const leaderId = start.room.participants[0].accountId;
    const owned = start.room.battle.actors.filter(actor => actor.accountId === leaderId);
    assert.equal(owned.length, 2);
    assert.equal(owned.find(actor => actor.kind === "player").hp, 1);
    assert.equal(owned.find(actor => actor.kind === "pet").hp, 1);
    for (let tick = 0; tick < 80 && !review.closedRoom(); tick++) {
      await review.tick({includeLeader: true});
    }
    assert.equal(review.closedRoom()?.status, "closed");
    assert.ok(review.closedRoom().battle.round > 1);
    const rounds = fs.readFileSync(path.join(directory, "rooms.ndjson"), "utf8")
      .trim().split("\n").map(line => JSON.parse(line).room);
    const downed = rounds.find(room => {
      const actors = room.battle.actors.filter(actor => actor.accountId === leaderId);
      return actors.length === 2 && actors.every(actor => actor.hp === 0)
        && room.battle.actors.some(actor => actor.kind === "player" && actor.hp > 0);
    });
    assert.ok(downed, "the fixture must actually leave the owner without either actor while teammates live");
    assert.ok(rounds.some(room => room.battle.round > downed.battle.round),
      "a later ready round must still advance without another owner command");
    // Native evidence separately verifies that Main receives those later states.
  } finally {
    await review.close();
  }
});

test("review teammates continue in a second room and preserve both closures", {timeout: 60000}, async () => {
  const directory = path.resolve(__dirname, "../../.run", `guardian-review-continuation-${crypto.randomUUID()}`);
  const review = await startGuardianReview(directory, {encounterPermitAuthority: createPetEncounterPermitAuthority({
    catalog: createPetEncounterAuthority().catalog, randomFloat: () => 0, eligibleStepIntervalMs: 0,
  })});
  try {
    const first = await review.request(0, "/battle/party-encounter", ENCOUNTER);
    for (let tick = 0; tick < 80 && review.closedRoom()?.roomId !== first.room.roomId; tick++) {
      await review.tick({includeLeader: true});
    }
    assert.equal(review.closedRoom()?.roomId, first.room.roomId);
    // Use real accepted movement and a server-issued permit, not a second ring
    // challenge (which correctly rejects a repeat claim in this rebirth cycle).
    for (let index = 0; index < 5; index++) {
      await review.request(index, "/players/position", {
        mapId: "earth_vein_cave_f3", cellX: 13, cellY: 13, facing: "south", moving: false,
      });
    }
    let permit;
    for (const [fromCellX, fromCellY, toCellX, toCellY] of [
      [13, 13, 14, 13], [14, 13, 14, 14], [14, 14, 13, 14],
    ]) {
      const moved = await review.request(0, "/movement/step", {
        mapId: "earth_vein_cave_f3", fromCellX, fromCellY, toCellX, toCellY, facing: "south", moving: true,
      });
      permit = moved.encounterPermit || permit;
    }
    assert.equal(typeof permit?.token, "string");
    const second = await review.request(0, "/battle/party-encounter", {
      encounterIntent: {zoneId: permit.zoneId, encounterGroupId: permit.encounterGroupId},
      encounterPermitToken: permit.token,
    });
    assert.notEqual(second.room.roomId, first.room.roomId);
    await review.tick();
    const current = (await review.request(0, "/battle/state")).room;
    assert.ok(current.battle.submittedActorIds.length > 0,
      "a previous closed room must not silence the teammates in the next encounter");
    for (let tick = 0; tick < 80 && review.closedRoom()?.roomId !== second.room.roomId; tick++) {
      await review.tick({includeLeader: true});
    }
    assert.equal(review.closedRoom()?.roomId, second.room.roomId,
      "ordinary HTTP commands must finish the second battle without stale submissions");
    const closures = fs.readFileSync(path.join(directory, "closed-rooms.ndjson"), "utf8")
      .trim().split("\n").map(line => JSON.parse(line).room);
    assert.deepEqual(closures.map(room => room.roomId), [first.room.roomId, second.room.roomId]);
    assert.ok(closures.every(room => room.status === "closed"));
  } finally {
    await review.close();
  }
});
