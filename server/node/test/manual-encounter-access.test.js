"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const rebirthTrials = require("../../../client/godot/data/rebirth_trials.json");
const {
  loadPetEncounterCatalog,
} = require("../src/auth/pet-encounter-authority");
const {
  createManualEncounterAccess,
} = require("../src/auth/manual-encounter-access");
const {
  loadPetEvolutionRouteCatalog,
} = require("../src/auth/pet-evolution-route-catalog");

const CLAIMS_KEY = "rebirthQualificationClaims";
const FINAL_PROOF_ID = "shadow_oath_rebirth_guardian";
const MM_INTERACTION_ID = "firebud_pet_mm_trial_mentor";
const evolutionRoutes = loadPetEvolutionRouteCatalog();

function createAccess(overrides = {}) {
  return createManualEncounterAccess({
    catalog: loadPetEncounterCatalog(),
    rebirthTrials,
    evolutionRoutes,
    qualificationClaimsKey: CLAIMS_KEY,
    finalProofId: FINAL_PROOF_ID,
    mmTrialInteractionId: MM_INTERACTION_ID,
    profileLevel: (profile) => profile.player.level,
    profileRebirthCycle: (profile) => profile.rebirthCount,
    backpackItemCount: (profile, itemId) => itemCount(profile.backpackSlots, itemId),
    storageItemCount: (profile, itemId) => itemCount(profile.bank && profile.bank.items, itemId),
    canReceiveItem: (profile) => profile.canReceiveItem !== false,
    canReceivePet: (profile) => profile.canReceivePet !== false,
    mmTrialAccess: (profile) => profile.mmTrialAccess || {ok: true},
    ...overrides,
  });
}

function profile(overrides = {}) {
  return {
    player: {level: 140},
    rebirthCount: 0,
    backpackSlots: [],
    bank: {items: []},
    rebirthTrialProofs: {},
    [CLAIMS_KEY]: {},
    canReceiveItem: true,
    canReceivePet: true,
    mmTrialAccess: {ok: true},
    ...overrides,
  };
}

function participant(name, playerProfile, accountId = "account_1") {
  return {accountId, displayName: name, profile: playerProfile};
}

function requestFor(rule) {
  return {
    mapId: rule.mapId,
    request: {encounterIntent: {sourceInteractionId: rule.interactionId}},
  };
}

function itemCount(items, itemId) {
  return Array.isArray(items)
    ? items.reduce((sum, item) => (
      String(item && item.itemId || "") === itemId
        ? sum + Math.max(0, Math.trunc(Number(item.count || 0)))
        : sum
    ), 0)
    : 0;
}

function allRingItems() {
  return rebirthTrials.elementCaves.map((cave) => ({itemId: cave.ringItemId, count: 1}));
}

test("manual encounter rules exactly cover rebirth, MM and the gated evolution material routes", () => {
  const access = createAccess();
  assert.equal(access.rules.length, 9);
  assert.deepEqual(
    access.rules.reduce((counts, rule) => ({
      ...counts,
      [rule.kind]: Number(counts[rule.kind] || 0) + 1,
    }), {}),
    {ring_guardian: 4, final_guardian: 1, mm_trial: 1, evolution_material: 3},
  );
  for (const cave of rebirthTrials.elementCaves) {
    assert.equal(access.rules.some((rule) => (
      rule.kind === "ring_guardian"
      && rule.mapId === cave.guardianFloorMapId
      && rule.interactionId === cave.guardianInteractionId
      && rule.groupId === cave.guardianGroup.id
      && rule.rewardItemId === cave.ringItemId
      && rule.minAttemptLevel === cave.minAttemptLevel
    )), true);
  }
  assert.equal(access.rules.filter((rule) => rule.kind === "evolution_material").every((rule) => rule.runtimeEnabled === false), true);
});

test("evolution material encounters stay closed until the route gate opens, then enforce real-player party, level and reward capacity", () => {
  const access = createAccess();
  const disabledRule = access.rules.find((entry) => entry.groupId === "shadow_oath_evolution_floor_core");
  const leader = participant("进化队长", profile(), "leader");
  let checked = access.authorize({...requestFor(disabledRule), participants: [leader]});
  assert.equal(checked.ok, false);
  assert.equal(checked.code, "manual_evolution_route_disabled");
  assert.match(checked.message, /最终安全验证/);

  const enabledRoutes = {
    ...evolutionRoutes,
    manualEncounterRules: evolutionRoutes.manualEncounterRules.map((rule) => ({...rule, runtimeEnabled: true})),
  };
  const enabled = createAccess({evolutionRoutes: enabledRoutes});
  const coreRule = enabled.rules.find((entry) => entry.groupId === "shadow_oath_evolution_floor_core");
  const member = participant("进化队员", profile(), "member");
  checked = enabled.authorize({...requestFor(coreRule), participants: [leader]});
  assert.equal(checked.code, "manual_evolution_party_required");
  assert.match(checked.message, /2名真实玩家/);

  leader.profile.player.level = 139;
  checked = enabled.authorize({...requestFor(coreRule), participants: [leader, member]});
  assert.equal(checked.code, "manual_evolution_level_required");
  assert.match(checked.message, /Lv140/);

  leader.profile.player.level = 140;
  leader.profile.canReceiveItem = false;
  checked = enabled.authorize({...requestFor(coreRule), participants: [leader, member]});
  assert.equal(checked.code, "manual_evolution_reward_capacity_full");
  assert.match(checked.message, /共鸣兽核/);

  leader.profile.canReceiveItem = true;
  checked = enabled.authorize({...requestFor(coreRule), participants: [leader, member]});
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.claims, []);
});

test("construction fails when a future manual encounter interaction has no qualification rule", () => {
  const catalog = JSON.parse(JSON.stringify(loadPetEncounterCatalog()));
  catalog.mapsById.firebud_village_gate.interactionsById.future_manual_guardian = {
    id: "future_manual_guardian",
    name: "未来守卫",
    actionType: "guardian_battle",
    encounterGroupId: "future_manual_guardian_group",
  };
  assert.throws(
    () => createAccess({catalog}),
    /unregistered manual encounter interaction.*future_manual_guardian/,
  );

  const incompleteTrials = JSON.parse(JSON.stringify(rebirthTrials));
  incompleteTrials.elementCaves.pop();
  assert.throws(
    () => createAccess({rebirthTrials: incompleteTrials}),
    /unregistered manual encounter interaction/,
  );
});

test("ordinary encounter zones pass as notManual while manual zones require their interaction", () => {
  const access = createAccess();
  assert.deepEqual(access.authorize({
    mapId: "firebud_village_gate",
    request: {encounterIntent: {zoneId: "village_grass"}},
  }), {ok: true, manual: false, notManual: true, schemaVersion: 1});

  const blocked = access.authorize({
    mapId: "earth_vein_cave_f4",
    request: {encounterIntent: {zoneId: "earth_vein_guardian_floor"}},
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.manual, true);
  assert.equal(blocked.code, "manual_encounter_interaction_required");
});

test("every party member must meet ring guardian level, ownership, cycle and capacity rules", () => {
  const access = createAccess();
  const rule = access.rules.find((entry) => entry.groupId === "earth_vein_guardian_group");
  const base = requestFor(rule);
  const leader = participant("队长", profile(), "leader");
  const memberProfile = profile();
  const member = participant("小禾", memberProfile, "member");

  const allowed = access.authorize({...base, participants: [leader, member]});
  assert.equal(allowed.ok, true);
  assert.equal(allowed.manual, true);
  assert.deepEqual(allowed.claims, [
    {
      accountId: "leader",
      profileKey: CLAIMS_KEY,
      claimId: "earth_vein_guardian_group",
      rebirthCycle: 0,
      schemaVersion: 1,
    },
    {
      accountId: "member",
      profileKey: CLAIMS_KEY,
      claimId: "earth_vein_guardian_group",
      rebirthCycle: 0,
      schemaVersion: 1,
    },
  ]);

  memberProfile.player.level = 79;
  let denied = access.authorize({...base, participants: [leader, member]});
  assert.equal(denied.code, "manual_guardian_level_required");
  assert.match(denied.message, /小禾.*Lv80/);

  memberProfile.player.level = 80;
  memberProfile[CLAIMS_KEY].earth_vein_guardian_group = {rebirthCycle: 0, claimed: true};
  denied = access.authorize({...base, participants: [leader, member]});
  assert.equal(denied.code, "manual_guardian_reward_claimed");
  assert.match(denied.message, /小禾/);

  memberProfile.rebirthCount = 1;
  denied = access.authorize({...base, participants: [leader, member]});
  assert.equal(denied.ok, true, "a claim from the previous rebirth cycle must not block");

  memberProfile.backpackSlots = [{itemId: "ring_earth_trial", count: 1}];
  denied = access.authorize({...base, participants: [leader, member]});
  assert.equal(denied.code, "manual_guardian_reward_owned");

  memberProfile.backpackSlots = [];
  memberProfile.bank.items = [{itemId: "ring_earth_trial", count: 1}];
  denied = access.authorize({...base, participants: [leader, member]});
  assert.equal(denied.code, "manual_guardian_reward_stored");

  memberProfile.bank.items = [];
  memberProfile.canReceiveItem = false;
  denied = access.authorize({...base, participants: [leader, member]});
  assert.equal(denied.code, "manual_guardian_reward_capacity_full");
  assert.match(denied.message, /小禾.*整理背包/);
});

test("final guardian requires every member to be Lv100 with all rings and no current proof or claim", () => {
  const access = createAccess();
  const rule = access.rules.find((entry) => entry.kind === "final_guardian");
  const base = requestFor(rule);
  const ready = profile({backpackSlots: allRingItems()});
  const leader = participant("玄山", ready, "leader");
  assert.equal(access.authorize({...base, participants: [leader]}).ok, true);

  ready.player.level = 99;
  let denied = access.authorize({...base, participants: [leader]});
  assert.equal(denied.code, "manual_final_guardian_level_required");
  assert.match(denied.message, /玄山.*Lv100/);

  ready.player.level = 100;
  ready.backpackSlots = allRingItems().filter((item) => item.itemId !== "ring_wind_trial");
  denied = access.authorize({...base, participants: [leader]});
  assert.equal(denied.code, "manual_final_guardian_rings_required");
  assert.match(denied.message, /玄山.*风之戒/);

  ready.backpackSlots = allRingItems();
  ready.rebirthTrialProofs[FINAL_PROOF_ID] = 1;
  denied = access.authorize({...base, participants: [leader]});
  assert.equal(denied.code, "manual_final_guardian_proof_owned");

  ready.rebirthTrialProofs = {};
  ready[CLAIMS_KEY][FINAL_PROOF_ID] = {rebirthCycle: 0, claimed: true};
  denied = access.authorize({...base, participants: [leader]});
  assert.equal(denied.code, "manual_final_guardian_claimed");
});

test("MM trial applies the injected access rule and pet capacity to every participant", () => {
  const access = createAccess();
  const rule = access.rules.find((entry) => entry.kind === "mm_trial");
  const base = requestFor(rule);
  const leader = participant("阿石", profile(), "leader");
  const memberProfile = profile({
    mmTrialAccess: {
      ok: false,
      code: "pet_rebirth_mm_guide_required",
      message: "请先接取宠物转生教学。",
    },
  });
  const member = participant("阿澄队员", memberProfile, "member");

  let denied = access.authorize({...base, participants: [leader, member]});
  assert.equal(denied.code, "pet_rebirth_mm_guide_required");
  assert.match(denied.message, /阿澄队员.*先接取/);

  memberProfile.mmTrialAccess = {ok: true};
  memberProfile.canReceivePet = false;
  denied = access.authorize({...base, participants: [leader, member]});
  assert.equal(denied.code, "manual_mm_trial_pet_capacity_full");
  assert.match(denied.message, /阿澄队员.*队伍和兽栏/);

  memberProfile.canReceivePet = true;
  assert.equal(access.authorize({...base, participants: [leader, member]}).ok, true);
});

test("manual access fails closed for missing, duplicate or exceptional participant facts", () => {
  const ringAccess = createAccess();
  const rule = ringAccess.rules.find((entry) => entry.kind === "ring_guardian");
  const base = requestFor(rule);
  assert.equal(
    ringAccess.authorize({...base, participants: []}).code,
    "manual_encounter_participants_missing",
  );
  assert.equal(
    ringAccess.authorize({
      ...base,
      participants: [
        participant("甲", profile(), "same"),
        participant("乙", profile(), "same"),
      ],
    }).code,
    "manual_encounter_participant_invalid",
  );

  const throwing = createAccess({
    profileLevel: () => {
      throw new Error("secret internal detail");
    },
  });
  const failed = throwing.authorize({...base, participants: [participant("甲", profile())]});
  assert.equal(failed.code, "manual_encounter_access_unavailable");
  assert.equal(failed.message.includes("secret internal detail"), false);
});
