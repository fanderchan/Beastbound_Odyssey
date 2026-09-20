"use strict";

// Local review fixture only. Runtime requests use the same HTTP boundary as Main.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const {createAuthService, createMemoryAuthStore} = require("../server/node/src/auth-service");
const {createHttpServer, drainServerForShutdown} = require("../server/node/src/http-server");
const {protocolMetadata} = require("../server/node/src/protocol");
const {createPetEncounterAuthority} = require("../server/node/src/auth/pet-encounter-authority");
const {createPetEncounterPermitAuthority} = require("../server/node/src/auth/pet-encounter-permit-authority");

const MAP_ID = "earth_vein_cave_f4";
const NAMES = ["洞穴探路者", "岩锋", "岚羽", "赤叶", "青岚"];
const APPEARANCES = ["novice_hunter_v1", "obsidian_scout_v1", "frost_whisper_v1", "ember_spark_v1", "novice_hunter_v1"];
const FORMS = ["bui_normal_red_fire10", "wuli_normal_tough_earth10", "wuli_normal_orange_fire10", "bui_normal_red_fire10", "wuli_normal_fast_wind10"];
const POSITIONS = [[21, 8], [18, 8], [20, 11], [23, 12], [24, 8]].map(([cellX, cellY]) =>
  ({mapId: MAP_ID, cellX, cellY, facing: "south", moving: false}));
const ENCOUNTER = {encounterIntent: {zoneId: "earth_vein_guardian_floor", encounterGroupId: "earth_vein_guardian_group", sourceInteractionId: "earth_vein_guardian_npc"}};
// Retained from a real downed-owner run. Direct NPC challenges use the
// battle-room seed rather than the walking-encounter permit's 32-byte seed.
const DOWNED_BATTLE_SEED = "0494e6b2c3959de9";

function checked(result) {
  assert.equal(result.ok, true, `${result.code || "unknown"}: ${result.message || ""}`);
  return result;
}

function seedParty({encounterPermitAuthority, downedOwnerCheck = false, caveJourney = false} = {}) {
  // Actor identities participate in targeting rolls. Pet private growth and
  // credentials retain their normal cryptographic randomness.
  let fixtureSerial = 0;
  const fixtureRandomId = downedOwnerCheck
    ? () => `${String(++fixtureSerial).padStart(8, "0")}-0000-4000-8000-000000000000`
    : undefined;
  const seed = createAuthService({store: createMemoryAuthStore(), allowFullProfileSave: true,
    randomId: fixtureRandomId,
    autoCreateInitialCharacterForTests: true,
    initialCharacterElementsForTests: {earth: 10, water: 0, fire: 0, wind: 0}});
  const members = NAMES.map((displayName, index) => {
    const member = checked(seed.register({username: `guardianqa${index + 1}`,
      password: crypto.randomBytes(24).toString("hex"), displayName}));
    const original = checked(seed.getProfile(member.session.token));
    const profile = structuredClone(original.profile);
    // Keep the real client's original low HP to exercise downed-player/pet handoff.
    // Durable QA teammates keep that branch observable before the whole party falls.
    // The downed-owner fixture uses a high cap with 1 current HP so overkill
    // does not immediately eject its low-HP leader via the normal launch rule.
    // Route review needs a durable party across encounters. This is disclosed
    // pre-listen QA data, not a balance profile or runtime healing shortcut.
    const maxHp = caveJourney ? 10400 : (index === 0 ? (downedOwnerCheck ? 10400 : 520) : 1040);
    Object.assign(profile.player, {appearanceId: APPEARANCES[index], level: 100, exp: 0, nextExp: 656810, statPoints: 0,
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
    if (downedOwnerCheck && index === 0) {
      // Pre-listen regression setup only: healthy teammates keep fighting
      // after both low-HP actors owned by the real client fall.
      // No damage, targeting, commands or settlement are injected at runtime.
      current.profile.player.hp = 1;
      current.profile.petInstances[0].hp = 1;
      checked(seed.saveProfile(member.session.token, {
        expectedRevision: current.profileSummary.profileRevision, profile: current.profile,
      }));
    }
    return member;
  });
  const snapshot = seed.snapshot();
  for (const account of Object.values(snapshot.accounts)) account.role = "player";
  snapshot.gmUserGrants = {};
  snapshot.gmCommandGrants = {};
  const store = createMemoryAuthStore(snapshot);
  const service = createAuthService({store, allowPositionTeleport: true, allowFullProfileSave: false,
    randomBytes: downedOwnerCheck
      ? size => size === 8 ? Buffer.from(DOWNED_BATTLE_SEED, "hex") : crypto.randomBytes(size)
      : undefined,
    petEncounterPermitAuthority: encounterPermitAuthority});
  // Pre-listen fixture setup ends here. Once HTTP starts, even bot presence uses HTTP.
  for (const [index, member] of members.entries()) checked(service.updatePlayerPosition(member.session.token, POSITIONS[index]));
  for (const member of members.slice(1)) {
    const invite = checked(service.inviteToParty(members[0].session.token, {username: member.account.username}));
    checked(service.acceptPartyInvite(member.session.token, invite.invite.inviteId));
  }
  return {service, store, members};
}

async function startGuardianReview(outputDir, {encounterPermitAuthority, downedOwnerCheck = false, caveJourney = false} = {}) {
  assert.ok(!(downedOwnerCheck && caveJourney), "choose either downed-owner or continuous-route fixture");
  fs.mkdirSync(outputDir, {mode: 0o700});
  const write = (name, data) => fs.writeFileSync(path.join(outputDir, name), JSON.stringify(data, null, 2), {mode: 0o600});
  const append = (name, data) => fs.appendFileSync(path.join(outputDir, name), JSON.stringify(data) + "\n", {mode: 0o600});
  const fixedEncounterSeed = downedOwnerCheck && !encounterPermitAuthority;
  const permitAuthority = encounterPermitAuthority || (fixedEncounterSeed ? createPetEncounterPermitAuthority({
    catalog: createPetEncounterAuthority().catalog,
    // Reproducible encounter/AI target order only. Tokens, reaction rolls and
    // all runtime commands/settlement retain their normal implementations.
    randomBytes: size => size === 32 ? Buffer.alloc(size, 0x58) : crypto.randomBytes(size),
  }) : undefined);
  const {service, store, members} = seedParty({encounterPermitAuthority: permitAuthority, downedOwnerCheck, caveJourney});
  const server = createHttpServer({service, store});
  let closedRoom = null;
  const closedRoomIds = new Set();
  const unsubscribe = service.onEvent((event) => {
    if (event.type === "battle.turn_resolved" || event.type === "battle.room_closed") {
      append("battle-events.ndjson", {at: Date.now(), event});
    }
    if (event.type === "battle.room_closed") {
      closedRoom = structuredClone(event.room);
      closedRoomIds.add(closedRoom.roomId);
      append("closed-rooms.ndjson", {at: Date.now(), room: closedRoom});
      write("closed-room.json", closedRoom);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  async function request(index, route, payload) {
    assert.match(route, /^\/(?:battle|players|profiles|party|movement)\//);
    const method = payload === undefined ? "GET" : "POST";
    const started = performance.now();
    let response;
    let result;
    try {
      response = await fetch(baseUrl + route, {
        method,
        headers: {Authorization: `Bearer ${members[index].session.token}`,
          "Content-Type": "application/json", "Idempotency-Key": `guardian_${crypto.randomUUID()}`,
          "X-Beastbound-Client-Version": "guardian-review",
          "X-Beastbound-Protocol-Version": String(protocolMetadata().protocolVersion)},
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      result = await response.json();
    } catch (error) {
      // A failed mutation is outcome-ambiguous: keep the failed run, never
      // replay it. Record transport facts without tokens, headers or payloads.
      const failure = {at: new Date().toISOString(), memberIndex: index, method, route,
        elapsedMs: Math.round(performance.now() - started), responseCode: response?.status ?? null,
        errorName: String(error.name || "Error"),
        errorCode: String(error.code || ""), causeName: String(error.cause?.name || ""),
        causeCode: String(error.cause?.code || ""),
        bytesWritten: error.cause?.socket?.bytesWritten ?? null,
        bytesRead: error.cause?.socket?.bytesRead ?? null};
      append("request-failures.ndjson", failure);
      throw new Error(`${method} ${route}: ${failure.errorName} ${failure.causeCode || failure.errorCode}; inspect request-failures.ndjson`, {cause: error});
    }
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
      expectedWorldPlayers: members.slice(1).map((member, index) => ({
        accountId: member.account.accountId, displayName: NAMES[index + 1],
        appearanceId: APPEARANCES[index + 1], position: POSITIONS[index + 1]})),
      session: {accountId: leader.account.accountId, username: leader.account.username,
        displayName: NAMES[0], role: "player", effectiveRole: "player", authSource: "server",
        serverBaseUrl: baseUrl, serverSessionToken: session.token, serverSessionId: session.sessionId,
        serverExpiresAt: session.expiresAt, playerId: session.playerId,
        characterSlotIndex: session.slotIndex, selectionEpoch: session.selectionEpoch, selectionRequired: false}});
    write("initial-profiles.json", profiles);
    write("server-info.json", {pid: process.pid, baseUrl, storage: "memory", memberCount: 5,
      fixtureVersion: 5, downedOwnerCheck, caveJourney,
      profileIdentitySource: downedOwnerCheck ? "qa_sequential_uuid_v1" : "runtime_random",
      characterHp: profiles.map(row => row.profile.player.hp),
      characterMaxHp: profiles.map(row => row.profile.player.maxHp),
      activePetHp: profiles.map(row => row.profile.petInstances.find(pet => pet.state === "battle")?.hp),
      fullProfileSaveEnabled: false, strictEncounterAuthority: true, strictManualAccess: true,
      encounterPermitSource: fixedEncounterSeed ? "qa_fixed_seed_authority" : (encounterPermitAuthority ? "injected_test_authority" : "runtime_default"),
      encounterSeedSource: fixedEncounterSeed ? "qa_fixed_58x32" : "authority_default",
      directBattleSeed: downedOwnerCheck ? DOWNED_BATTLE_SEED : null,
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
  let lastStreamSignature = "";
  function recordEventStream() {
    const metrics = server.eventHub.metrics();
    const state = {
      connections: metrics.connections, acceptedUpgrades: metrics.acceptedUpgrades,
      rejectedUpgrades: metrics.rejectedUpgrades, upgradeRejectReasons: metrics.upgradeRejectReasons,
      heartbeatTimeouts: metrics.heartbeatTimeouts,
      protocolViolations: metrics.protocolViolations, inboundRateLimited: metrics.inboundRateLimited,
      slowConsumerDisconnects: metrics.slowConsumerDisconnects,
    };
    const signature = JSON.stringify(state);
    if (signature !== lastStreamSignature) {
      lastStreamSignature = signature;
      append("event-stream.ndjson", {at: Date.now(), ...state});
    }
  }
  async function tick({includeLeader = false} = {}) {
    recordEventStream();
    const first = includeLeader ? 0 : 1;
    if (Date.now() - lastPresence > 3000) {
      lastPresence = Date.now();
      for (let index = first; index < members.length; index++) {
        await request(index, "/players/position", POSITIONS[index]);
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
        // A final command may close this room before the remaining cached
        // actors are visited. Skip that room, not every later encounter.
        if (closedRoomIds.has(room.roomId)) break;
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
      recordEventStream();
      write("stopped.json", {pid: process.pid, stoppedAt: new Date().toISOString()});
    }
  }
  return {baseUrl, request, tick, close, closedRoom: () => closedRoom};
}

async function main() {
  const outputDir = path.resolve(process.argv[2] || "");
  const runRoot = path.resolve(__dirname, "../.run") + path.sep;
  assert.ok(outputDir.startsWith(runRoot) && !fs.existsSync(outputDir), "choose a fresh directory under .run");
  const review = await startGuardianReview(outputDir, {
    downedOwnerCheck: process.argv.includes("--downed-owner-check"), caveJourney: process.argv.includes("--cave-journey"),
  });
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
