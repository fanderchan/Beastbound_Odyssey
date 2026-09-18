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
