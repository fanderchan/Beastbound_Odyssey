"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
  battleProfile,
} = require("../test-support/auth-service-test-context");

function offlineService(options = {}) {
  let id = 0;
  return createAuthService({
    store: createMemoryAuthStore(),
    allowPositionTeleport: true,
    useStrictPetEncounterAuthority: true,
    randomId: () => `fixed_${++id}`,
    ...options,
  });
}

function seedRouteProfile(service, username, displayName = "离线修行者") {
  const player = service.register({username, password: "test1234", displayName});
  const profile = battleProfile(displayName, {
    level: 20,
    exp: 0,
    hp: 500,
    maxHp: 500,
    attack: 100,
    defense: 80,
    quick: 80,
  }, {
    petId: `${username}_pet`,
    name: "离线战宠",
    level: 20,
    exp: 0,
    hp: 300,
    maxHp: 300,
    attack: 70,
    defense: 60,
    quick: 60,
  });
  profile.stoneCoins = 0;
  profile.backpackSlots = [];
  assert.equal(service.saveProfile(player.session.token, {expectedRevision: 0, profile}).ok, true);
  assert.equal(service.updatePlayerPosition(player.session.token, {
    mapId: "mistcap_marsh",
    cellX: 20,
    cellY: 9,
    moving: false,
  }).ok, true);
  return player;
}

test("offline hang defaults to half-rate training, pays a capped ledger once, and preserves active pet growth", () => {
  let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
  const service = offlineService({now: () => nowMs});
  const player = seedRouteProfile(service, "offlinehalf");

  const started = service.startOfflineHang(player.session.token, {
    mapId: "mistcap_marsh",
    cellX: 20,
    cellY: 9,
  });
  assert.equal(started.ok, true);
  assert.equal(started.config.rewardRatePercent, 50);
  assert.equal(started.config.maxMinutes, 480);
  assert.equal(started.config.battleIntervalSeconds, 30);
  assert.equal(started.offlineHang.pending, true);
  assert.equal(started.profile.hangSession.enabled, false);
  const sessionId = started.offlineHang.session.sessionId;
  const blocked = service.shopTransaction(player.session.token, {mode: "buy", shopId: "firebud_item_shop", itemId: "item_meat_small", amount: 1});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "offline_hang_active");

  nowMs += 60 * 60 * 1000;
  const status = service.offlineHangStatus(player.session.token);
  assert.equal(status.ok, true);
  assert.equal(status.offlineHang.creditedMinutes, 60);
  assert.equal(status.offlineHang.capped, false);

  const claimed = service.claimOfflineHang(player.session.token, {sessionId});
  assert.equal(claimed.ok, true);
  assert.equal(claimed.claim.equivalentBattles, 60);
  assert.equal(claimed.claim.rewardTableId, "growth_training_01");
  assert.equal(claimed.claim.playerExp > 0, true);
  assert.equal(claimed.claim.petExp > 0, true);
  assert.equal(claimed.claim.stoneCoins, 4080);
  assert.equal(claimed.claim.stoneCoinOverflow, 0);
  assert.equal(claimed.profile.player.level > 20, true);
  assert.equal(claimed.profile.petInstances.find((pet) => pet.instanceId === "offlinehalf_pet").level > 20, true);
  assert.equal(claimed.profile.offlineHang.ledger.length, 1);
  const revisionAfterClaim = claimed.profileBinding.profileRevision;

  const replay = service.claimOfflineHang(player.session.token, {sessionId});
  assert.equal(replay.ok, true);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.claim.claimId, claimed.claim.claimId);
  assert.equal(service.getProfile(player.session.token).profileSummary.profileRevision, revisionAfterClaim);
});

test("offline hang enforces minimum time, formal route level, and the configured duration cap", () => {
  let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
  const service = offlineService({now: () => nowMs});
  const player = seedRouteProfile(service, "offlinecap");
  const started = service.startOfflineHang(player.session.token, {mapId: "mistcap_marsh", cellX: 20, cellY: 9});
  assert.equal(started.ok, true);

  nowMs += 4 * 60 * 1000;
  const tooEarly = service.claimOfflineHang(player.session.token, {sessionId: started.offlineHang.session.sessionId});
  assert.equal(tooEarly.ok, false);
  assert.equal(tooEarly.code, "offline_hang_claim_too_early");

  nowMs += 20 * 60 * 60 * 1000;
  const claimed = service.claimOfflineHang(player.session.token, {sessionId: started.offlineHang.session.sessionId});
  assert.equal(claimed.ok, true);
  assert.equal(claimed.claim.creditedMinutes, 480);
  assert.equal(claimed.claim.equivalentBattles, 480);

  const wrongLevel = service.register({username: "offroutelevel", password: "test1234", displayName: "越级号"});
  const wrongProfile = battleProfile("越级号", {level: 80, hp: 500, maxHp: 500}, null);
  assert.equal(service.saveProfile(wrongLevel.session.token, {expectedRevision: 0, profile: wrongProfile}).ok, true);
  assert.equal(service.updatePlayerPosition(wrongLevel.session.token, {
    mapId: "mistcap_marsh", cellX: 20, cellY: 9, moving: false,
  }).ok, true);
  const denied = service.startOfflineHang(wrongLevel.session.token, {mapId: "mistcap_marsh", cellX: 20, cellY: 9});
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "offline_hang_formal_route_required");

  const cancellable = seedRouteProfile(service, "offlinecancel");
  const cancellableStart = service.startOfflineHang(cancellable.session.token, {mapId: "mistcap_marsh", cellX: 20, cellY: 9});
  assert.equal(cancellableStart.ok, true);
  const cancelled = service.cancelOfflineHang(cancellable.session.token);
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.offlineHang.pending, false);
  assert.equal(cancelled.offlineHang.session.status, "cancelled");
  assert.equal(cancelled.profile.offlineHang.ledger.length, 0);
});

test("offline hang writers preserve unsafe backpack and equipment instance state", () => {
  let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
  const seedService = offlineService({now: () => nowMs});

  const startPlayer = seedRouteProfile(seedService, "offlineunsafestart");
  const startSeed = seedService.snapshot();
  const startBinding = startSeed.profileBindings[startPlayer.account.accountId];
  startSeed.profiles[startBinding.playerId].profile.backpackSlots = [{
    itemId: "future_offline_relic_999",
    count: 1,
    futureEnvelope: {schemaVersion: 99},
  }];
  const startBefore = structuredClone(startSeed.profiles[startBinding.playerId].profile);
  const startRevision = startBinding.profileRevision;
  const unsafeStartService = offlineService({store: createMemoryAuthStore(startSeed), now: () => nowMs});
  const blockedStart = unsafeStartService.startOfflineHang(startPlayer.session.token, {
    mapId: "mistcap_marsh",
    cellX: 20,
    cellY: 9,
  });
  assert.equal(blockedStart.ok, false);
  assert.equal(blockedStart.code, "backpack_item_unknown");
  const startAfter = unsafeStartService.snapshot();
  assert.equal(startAfter.profileBindings[startPlayer.account.accountId].profileRevision, startRevision);
  assert.deepEqual(startAfter.profiles[startBinding.playerId].profile, startBefore);

  const claimPlayer = seedRouteProfile(seedService, "offlineunsafeclaim");
  const started = seedService.startOfflineHang(claimPlayer.session.token, {
    mapId: "mistcap_marsh",
    cellX: 20,
    cellY: 9,
  });
  assert.equal(started.ok, true);
  nowMs += 10 * 60 * 1000;
  const claimSeed = seedService.snapshot();
  const claimBinding = claimSeed.profileBindings[claimPlayer.account.accountId];
  const claimProfile = claimSeed.profiles[claimBinding.playerId].profile;
  claimProfile.backpackSlots = [{itemId: "weapon_wooden_club", count: 1}];
  claimProfile.equipmentInstances = {
    equip_future_offline: {
      schemaVersion: 2,
      instanceId: "equip_future_offline",
      itemId: "weapon_wooden_club",
      location: "backpack",
      slotId: "",
      durability: 30,
      enhancement: {itemId: "weapon_wooden_club", level: 7, history: []},
      wearCounters: {itemId: "weapon_wooden_club", attackCount: 0, hitCount: 0},
      expPillCharge: {},
      futureAffixes: [{id: "future_offline_power", value: 99}],
    },
  };
  claimProfile.nextEquipmentInstanceSerial = 2;
  claimProfile.equipmentSlotsVersion = 5;
  const claimBefore = structuredClone(claimProfile);
  const claimRevision = claimBinding.profileRevision;
  const unsafeClaimService = offlineService({store: createMemoryAuthStore(claimSeed), now: () => nowMs});
  assert.equal(unsafeClaimService.offlineHangStatus(claimPlayer.session.token).ok, true);

  const blockedClaim = unsafeClaimService.claimOfflineHang(claimPlayer.session.token, {
    sessionId: started.offlineHang.session.sessionId,
  });
  assert.equal(blockedClaim.ok, false);
  assert.equal(blockedClaim.code, "equipment_instance_schema_future");
  const blockedCancel = unsafeClaimService.cancelOfflineHang(claimPlayer.session.token);
  assert.equal(blockedCancel.ok, false);
  assert.equal(blockedCancel.code, "equipment_instance_schema_future");
  const claimAfter = unsafeClaimService.snapshot();
  assert.equal(claimAfter.profileBindings[claimPlayer.account.accountId].profileRevision, claimRevision);
  assert.deepEqual(claimAfter.profiles[claimBinding.playerId].profile, claimBefore);
});

test("GM offline hang configuration is authorized, audited, validated, and changes later claims", () => {
  let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
  const service = offlineService({now: () => nowMs});
  const gm = service.register({username: "offlinegm", password: "test1234", displayName: "离线GM"});

  const denied = service.updateOfflineHangConfig(gm.session.token, {rewardRateBps: 2500});
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "gm_denied");
  assert.equal(service.grantGm({
    username: "offlinegm",
    commandIds: ["gm_offline_hang_config"],
    policyId: "test_explicit_gm_v1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    grantedBy: "unit_test",
  }).ok, true);

  const invalid = service.updateOfflineHangConfig(gm.session.token, {rewardRateBps: "half"});
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "offline_hang_config_invalid");
  const updated = service.updateOfflineHangConfig(gm.session.token, {
    rewardRateBps: 2500,
    maxMinutes: 120,
    battleIntervalSeconds: 60,
    minClaimMinutes: 2,
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.config.rewardRatePercent, 25);
  assert.equal(updated.config.maxMinutes, 120);
  assert.equal(updated.config.battleIntervalSeconds, 60);
  assert.equal(typeof updated.auditId, "string");
  assert.equal(service.snapshot().gmCommandAudit.length >= 3, true);
  assert.equal(service.snapshot().offlineHangConfig.updatedBy, "offlinegm");

  const player = seedRouteProfile(service, "offlinequarter");
  const started = service.startOfflineHang(player.session.token, {mapId: "mistcap_marsh", cellX: 20, cellY: 9});
  nowMs += 60 * 60 * 1000;
  const claimed = service.claimOfflineHang(player.session.token, {sessionId: started.offlineHang.session.sessionId});
  assert.equal(claimed.ok, true);
  assert.equal(claimed.claim.rewardRateBps, 2500);
  assert.equal(claimed.claim.equivalentBattles, 15);
  assert.equal(claimed.claim.stoneCoins, 1020);
});
