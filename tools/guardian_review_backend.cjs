"use strict";

// Local review fixture only. Runtime requests use the same HTTP boundary as Main.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const {createAuthService, createMemoryAuthStore} = require("../server/node/src/auth-service");
const {createHttpServer, drainServerForShutdown} = require("../server/node/src/http-server");
const {protocolMetadata} = require("../server/node/src/protocol");

const MAP_ID = "earth_vein_cave_f4";
const NAMES = ["洞穴探路者", "岩锋", "岚羽", "赤叶", "青岚"];
const FORMS = ["bui_normal_red_fire10", "wuli_normal_tough_earth10", "wuli_normal_orange_fire10", "bui_normal_red_fire10", "wuli_normal_fast_wind10"];
const POSITION = {mapId: MAP_ID, cellX: 21, cellY: 8, facing: "south", moving: false};
const ENCOUNTER = {encounterIntent: {zoneId: "earth_vein_guardian_floor", encounterGroupId: "earth_vein_guardian_group", sourceInteractionId: "earth_vein_guardian_npc"}};

function checked(result) {
  assert.equal(result.ok, true, `${result.code || "unknown"}: ${result.message || ""}`);
  return result;
}

function seedParty() {
  const seed = createAuthService({store: createMemoryAuthStore(), allowFullProfileSave: true,
    autoCreateInitialCharacterForTests: true,
    initialCharacterElementsForTests: {earth: 10, water: 0, fire: 0, wind: 0}});
  const members = NAMES.map((displayName, index) => {
    const member = checked(seed.register({username: `guardianqa${index + 1}`,
      password: crypto.randomBytes(24).toString("hex"), displayName}));
    const original = checked(seed.getProfile(member.session.token));
    const profile = structuredClone(original.profile);
    // Keep the real client's original low HP to exercise downed-player/pet handoff.
    // Durable QA teammates keep that branch observable before the whole party falls.
    const maxHp = index === 0 ? 520 : 1040;
    Object.assign(profile.player, {level: 100, exp: 0, nextExp: 656810, statPoints: 0,
      hp: maxHp, maxHp, baseStats: {maxHp, attack: 168, defense: 41, quick: 82}});
    profile.petInstances = [];
    profile.activePetInstanceId = "";
    checked(seed.saveProfile(member.session.token, {expectedRevision: original.profileSummary.profileRevision, profile}));
    checked(seed.grantGm({username: member.account.username,
      commandIds: ["gm_grant_pet", "gm_level_pet"], policyId: "guardian_qa_seed_v1",
      expiresAt: "2099-01-01T00:00:00.000Z", grantedBy: "isolated_fixture"}));
    const grant = checked(seed.grantGmPet(member.session.token, {formId: FORMS[index]}));
    for (let level = 1; level < 100; level++) {
      checked(seed.levelUpGmPet(member.session.token, {instanceId: grant.result.instanceId}));
    }
    let current = checked(seed.getProfile(member.session.token));
    for (let attempt = 0; attempt < 3 && current.profile.petInstances[0].state !== "battle"; attempt++) {
      checked(seed.profileAction(member.session.token, {action: "pet_state_cycle", payload: {instanceId: grant.result.instanceId}}));
      current = checked(seed.getProfile(member.session.token));
    }
    assert.equal(current.profile.petInstances[0].state, "battle");
    return member;
  });
  const snapshot = seed.snapshot();
  for (const account of Object.values(snapshot.accounts)) account.role = "player";
  snapshot.gmUserGrants = {};
  snapshot.gmCommandGrants = {};
  const store = createMemoryAuthStore(snapshot);
  const service = createAuthService({store, allowPositionTeleport: true, allowFullProfileSave: false});
  // Pre-listen fixture setup ends here. Once HTTP starts, even bot presence uses HTTP.
  for (const member of members) checked(service.updatePlayerPosition(member.session.token, POSITION));
  for (const member of members.slice(1)) {
    const invite = checked(service.inviteToParty(members[0].session.token, {username: member.account.username}));
    checked(service.acceptPartyInvite(member.session.token, invite.invite.inviteId));
  }
  return {service, store, members};
}

async function startGuardianReview(outputDir) {
  fs.mkdirSync(outputDir, {mode: 0o700});
  const write = (name, data) => fs.writeFileSync(path.join(outputDir, name), JSON.stringify(data, null, 2), {mode: 0o600});
  const append = (name, data) => fs.appendFileSync(path.join(outputDir, name), JSON.stringify(data) + "\n", {mode: 0o600});
  const {service, store, members} = seedParty();
  const server = createHttpServer({service, store});
  let closedRoom = null;
  const unsubscribe = service.onEvent((event) => {
    if (event.type === "battle.turn_resolved" || event.type === "battle.room_closed") {
      append("battle-events.ndjson", {at: Date.now(), event});
    }
    if (event.type === "battle.room_closed") {
      closedRoom = structuredClone(event.room);
      write("closed-room.json", closedRoom);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  async function request(index, route, payload) {
    assert.match(route, /^\/(?:battle|players|profiles|party)\//);
    const response = await fetch(baseUrl + route, {
      method: payload === undefined ? "GET" : "POST",
      headers: {Authorization: `Bearer ${members[index].session.token}`,
        "Content-Type": "application/json", "Idempotency-Key": `guardian_${crypto.randomUUID()}`,
        "X-Beastbound-Client-Version": "guardian-review",
        "X-Beastbound-Protocol-Version": String(protocolMetadata().protocolVersion)},
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!result.ok) {
      const error = new Error(`${route}: ${result.code}: ${result.message}`);
      error.code = result.code;
      throw error;
    }
    return result;
  }
  try {
    const profiles = await Promise.all(members.map((_, index) => request(index, "/profiles/me")));
    const leader = members[0];
    const session = leader.session;
    write("fixture.json", {baseUrl, profile: profiles[0].profile,
      profileRevision: profiles[0].profileSummary.profileRevision,
      partyState: await request(0, "/party/state"),
      session: {accountId: leader.account.accountId, username: leader.account.username,
        displayName: NAMES[0], role: "player", effectiveRole: "player", authSource: "server",
        serverBaseUrl: baseUrl, serverSessionToken: session.token, serverSessionId: session.sessionId,
        serverExpiresAt: session.expiresAt, playerId: session.playerId,
        characterSlotIndex: session.slotIndex, selectionEpoch: session.selectionEpoch, selectionRequired: false}});
    write("initial-profiles.json", profiles);
    write("server-info.json", {pid: process.pid, baseUrl, storage: "memory", memberCount: 5,
      fixtureVersion: 2, characterHp: [520, 1040, 1040, 1040, 1040],
      fullProfileSaveEnabled: false, strictEncounterAuthority: true, strictManualAccess: true,
      isolatedPositionTeleport: true, botTransport: "HTTP", scope: "one Main client plus four scripted accounts; not human multiplayer or balance acceptance"});
  } catch (error) {
    unsubscribe();
    const drained = drainServerForShutdown(server, store);
    server.closeAllConnections();
    await drained;
    throw error;
  }
  let lastPresence = 0;
  let lastRoomSignature = "";
  async function tick({includeLeader = false} = {}) {
    const first = includeLeader ? 0 : 1;
    if (Date.now() - lastPresence > 3000) {
      lastPresence = Date.now();
      for (let index = first; index < members.length; index++) {
        await request(index, "/players/position", POSITION);
      }
    }
    for (let index = first; index < members.length; index++) {
      const {room} = await request(index, "/battle/state");
      if (!room || room.status !== "ready" || room.battle.phase !== "command") continue;
      const battle = room.battle;
      const signature = `${room.roomId}:${battle.round}:${battle.turnSeq}`;
      if (signature !== lastRoomSignature) {
        lastRoomSignature = signature;
        append("rooms.ndjson", {at: Date.now(), room});
      }
      const required = new Set(battle.requiredActorIds);
      const submitted = new Set(battle.submittedActorIds);
      const targets = battle.actors.filter(actor => actor.kind === "wild_pet" && actor.hp > 0 && !actor.captured && !actor.launched);
      const target = targets.find(actor => actor.battleAppearanceFormId !== "wuli_evolved_crystal_earth8_water2") || targets[0];
      if (!target) continue;
      for (const actor of battle.actors.filter(entry => entry.accountId === members[index].account.accountId && required.has(entry.actorId) && !submitted.has(entry.actorId))) {
        if (closedRoom) return;
        // Respect the visible boss telegraph. No damage, rewards or outcome injection.
        const defend = battle.bossIntent && battle.bossIntent.targetActorId === actor.actorId;
        await request(index, `/battle/rooms/${room.roomId}/commands`, {
          round: battle.round, actorId: actor.actorId,
          actionId: actor.kind === "player" ? (defend ? "defend" : "attack") : (defend ? "pet_defend" : "pet_attack"),
          targetActorId: defend ? actor.actorId : target.actorId,
        });
      }
    }
  }
  async function close() {
    try {
      write("final-profiles.json", await Promise.all(members.map((_, index) => request(index, "/profiles/me"))));
    } finally {
      unsubscribe();
      const drained = drainServerForShutdown(server, store);
      server.closeAllConnections();
      await drained;
      write("stopped.json", {pid: process.pid, stoppedAt: new Date().toISOString()});
    }
  }
  return {baseUrl, request, tick, close, closedRoom: () => closedRoom};
}

async function main() {
  const outputDir = path.resolve(process.argv[2] || "");
  const runRoot = path.resolve(__dirname, "../.run") + path.sep;
  assert.ok(outputDir.startsWith(runRoot) && !fs.existsSync(outputDir), "choose a fresh directory under .run");
  const review = await startGuardianReview(outputDir);
  let stopping = false;
  process.on("SIGINT", () => {stopping = true;});
  process.on("SIGTERM", () => {stopping = true;});
  console.log(`GUARDIAN_QA_SERVER_READY ${review.baseUrl}`);
  try {
    while (!stopping && !fs.existsSync(path.join(outputDir, "stop-server"))) {
      await review.tick();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } finally {
    await review.close();
  }
}

module.exports = {startGuardianReview, ENCOUNTER};
if (require.main === module) main().catch(error => {console.error(error.message); process.exitCode = 1;});
