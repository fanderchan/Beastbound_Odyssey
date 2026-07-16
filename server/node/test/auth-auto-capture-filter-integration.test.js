"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
  internalProfileForAccount,
  battleProfile,
  profileItemCount,
} = require("../test-support/auth-service-test-context");
const {AUTO_CAPTURE_SETTINGS_ACTION_ID} = require("../src/auth/auto-capture-settings");

function captureProfile(name) {
  const profile = battleProfile(name, {
    level: 30,
    hp: 260,
    maxHp: 260,
    attack: 48,
    defense: 24,
    quick: 140,
  });
  profile.backpackSlots = [{itemId: "capture_net", count: 1}];
  profile.captureTools = {capture_net: 1};
  profile.petCodexSeenFormIds = [];
  profile.petCodexCapturedFormIds = [];
  return profile;
}

function startCaptureEncounter(service, token, wildPet, enemyCount = 1) {
  const encounter = service.startPartyEncounter(token, {
    enemyCount,
    encounterZone: {
      id: `auto_filter_${wildPet.formId}`,
      name: "自动筛选测试草丛",
      selectedWildPet: {
        ...wildPet,
        catchable: true,
        captureDifficulty: 1,
        captureChanceOverride: 1,
        battleStats: {maxHp: 120, attack: 1, defense: 1, quick: 10},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const player = encounter.room.battle.actors.find((actor) => actor.kind === "player");
  const enemies = encounter.room.battle.actors.filter((actor) => actor.side === "enemy");
  const enemy = enemies[0];
  assert.ok(player && enemy);
  return {encounter, player, enemy, enemies};
}

test("automatic pre-capture mismatch spends no tool or roll while manual capture remains available", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const account = service.register({username: "autofilterpre", password: "test1234", displayName: "前置筛选号"});
  assert.equal(service.saveProfile(account.session.token, {
    expectedRevision: 0,
    profile: captureProfile("前置筛选号"),
  }).ok, true);
  const settings = service.profileAction(account.session.token, {
    action: AUTO_CAPTURE_SETTINGS_ACTION_ID,
    payload: {
      settings: {
        enabled: true,
        targetMode: "all",
        hpPercent: 100,
        levelComparator: "=",
        levelValue: 1,
        preferredToolId: "capture_net",
        filterPolicy: {
          schemaVersion: 1,
          lineIds: ["man_dragon"],
          element: {mode: "any", ids: [], minPoints: 1},
          onlyNewCodexForm: false,
          maxOwnedSameForm: 0,
          levelOneFourV: {
            maxHp: {min: 0, max: 0},
            attack: {min: 0, max: 0},
            defense: {min: 0, max: 0},
            quick: {min: 0, max: 0},
          },
        },
      },
    },
  });
  assert.equal(settings.ok, true);

  const {encounter, player, enemy} = startCaptureEncounter(service, account.session.token, {
    formId: "wuli_normal_orange_fire10",
    name: "不匹配乌力",
    level: 1,
  });
  const candidateBefore = service.snapshot().battleRooms[encounter.room.roomId]
    .battle.captureCandidatesByActorId[enemy.actorId];
  assert.equal(candidateBefore.attemptCount, 0);

  const rejected = service.submitBattleCommand(account.session.token, encounter.room.roomId, {
    round: 1,
    actorId: player.actorId,
    actionId: "capture",
    targetActorId: enemy.actorId,
    captureToolId: "capture_net",
    captureMode: "auto",
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "battle_auto_capture_filter_no_match");
  const candidateAfterReject = service.snapshot().battleRooms[encounter.room.roomId]
    .battle.captureCandidatesByActorId[enemy.actorId];
  assert.equal(candidateAfterReject.attemptCount, 0);
  assert.equal(profileItemCount(service.getProfile(account.session.token).profile, "capture_net"), 1);

  const manual = service.submitBattleCommand(account.session.token, encounter.room.roomId, {
    round: 1,
    actorId: player.actorId,
    actionId: "capture",
    targetActorId: enemy.actorId,
    captureToolId: "capture_net",
  });
  assert.equal(manual.ok, true);
  assert.equal(manual.room.status, "closed");
  const writeback = manual.room.battle.profileWriteback.profiles[0];
  assert.equal(writeback.capturedPets.length, 1);
  assert.equal(writeback.capturedPets[0].captureFilterEvaluation, null);
});

test("automatic post-capture Lv1 mismatch retains the exact captured pet and exposes no hidden growth", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const account = service.register({username: "autofilterpost", password: "test1234", displayName: "抓后筛选号"});
  assert.equal(service.saveProfile(account.session.token, {
    expectedRevision: 0,
    profile: captureProfile("抓后筛选号"),
  }).ok, true);
  const settings = service.profileAction(account.session.token, {
    action: AUTO_CAPTURE_SETTINGS_ACTION_ID,
    payload: {
      settings: {
        enabled: true,
        targetMode: "codex",
        targetFormId: "blue_man_dragon_water10",
        hpPercent: 100,
        levelComparator: "=",
        levelValue: 20,
        preferredToolId: "capture_net",
        filterPolicy: {
          schemaVersion: 1,
          lineIds: ["man_dragon"],
          element: {mode: "all", ids: ["water"], minPoints: 10},
          onlyNewCodexForm: true,
          maxOwnedSameForm: 3,
          levelOneFourV: {
            maxHp: {min: 0, max: 0},
            attack: {min: 999999, max: 0},
            defense: {min: 0, max: 0},
            quick: {min: 0, max: 0},
          },
        },
      },
    },
  });
  assert.equal(settings.ok, true);

  const {encounter, player, enemy} = startCaptureEncounter(service, account.session.token, {
    formId: "blue_man_dragon_water10",
    name: "野生蓝人龙",
    level: 20,
  });
  const candidateBefore = service.snapshot().battleRooms[encounter.room.roomId]
    .battle.captureCandidatesByActorId[enemy.actorId];
  const privateSeed = candidateBefore.pet.petGrowth.private.privateSeed;

  const resolved = service.submitBattleCommand(account.session.token, encounter.room.roomId, {
    round: 1,
    actorId: player.actorId,
    actionId: "capture",
    targetActorId: enemy.actorId,
    captureToolId: "capture_net",
    captureMode: "auto",
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.room.status, "closed");
  const publicRoomJson = JSON.stringify(resolved.room);
  assert.equal(publicRoomJson.includes("captureFilterSettings"), false);
  assert.equal(publicRoomJson.includes("captureFilterPreEvaluation"), false);
  assert.equal(publicRoomJson.includes("auto_capture_v1"), false);
  const writeback = resolved.room.battle.profileWriteback.profiles[0];
  assert.equal(writeback.capturedPets.length, 1);
  const summary = writeback.capturedPets[0];
  assert.equal(summary.captureFilterEvaluation.stage, "post_capture");
  assert.equal(summary.captureFilterEvaluation.status, "not_matched");
  assert.equal(summary.captureFilterEvaluation.matched, false);
  assert.equal(summary.captureFilterEvaluation.retainPet, true);
  assert.equal(
    summary.captureFilterEvaluation.reasons.some((reason) => reason.code === "level_one_attack_below_min"),
    true,
  );
  assert.deepEqual(summary.initialStats, candidateBefore.pet.initialStats);
  const internal = internalProfileForAccount(service, account.account.accountId);
  const captured = internal.petInstances.find((pet) => pet.capturedBattleActorId === enemy.actorId);
  assert.ok(captured);
  assert.deepEqual(captured.initialStats, candidateBefore.pet.initialStats);
  assert.equal(captured.petGrowth.private.privateSeed, privateSeed);
  assert.equal(profileItemCount(service.getProfile(account.session.token).profile, "capture_net"), 0);
  const publicJson = JSON.stringify(writeback);
  assert.equal(publicJson.includes(String(privateSeed)), false);
  assert.equal(publicJson.includes("privateRoll"), false);
  assert.equal(publicJson.includes("individualQualityScore"), false);
});

test("only-new filter treats a same-form pet already captured in the current battle as collected", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const account = service.register({username: "autofilterpending", password: "test1234", displayName: "场内新品种号"});
  const profile = captureProfile("场内新品种号");
  profile.backpackSlots = [{itemId: "capture_net", count: 2}];
  profile.captureTools = {capture_net: 2};
  assert.equal(service.saveProfile(account.session.token, {
    expectedRevision: 0,
    profile,
  }).ok, true);
  const settings = service.profileAction(account.session.token, {
    action: AUTO_CAPTURE_SETTINGS_ACTION_ID,
    payload: {
      settings: {
        enabled: true,
        targetMode: "all",
        hpPercent: 100,
        levelComparator: "=",
        levelValue: 1,
        preferredToolId: "capture_net",
        filterPolicy: {
          schemaVersion: 1,
          lineIds: ["man_dragon"],
          element: {mode: "any", ids: ["water"], minPoints: 10},
          onlyNewCodexForm: true,
          maxOwnedSameForm: 0,
          levelOneFourV: {
            maxHp: {min: 0, max: 0},
            attack: {min: 0, max: 0},
            defense: {min: 0, max: 0},
            quick: {min: 0, max: 0},
          },
        },
      },
    },
  });
  assert.equal(settings.ok, true);

  const {encounter, player, enemies} = startCaptureEncounter(service, account.session.token, {
    formId: "blue_man_dragon_water10",
    name: "野生蓝人龙",
    level: 1,
  }, 2);
  assert.equal(enemies.length, 2);
  const first = service.submitBattleCommand(account.session.token, encounter.room.roomId, {
    round: 1,
    actorId: player.actorId,
    actionId: "capture",
    targetActorId: enemies[0].actorId,
    captureToolId: "capture_net",
    captureMode: "auto",
  });
  assert.equal(first.ok, true);
  assert.equal(first.room.status, "ready");
  const firstCaptureEvent = first.turn.events.find((event) => event.eventType === "capture");
  assert.ok(firstCaptureEvent);
  assert.equal(firstCaptureEvent.remainingCaptureToolCount, 1);
  const remaining = first.room.battle.actors.find((actor) => actor.side === "enemy" && !actor.captured);
  assert.ok(remaining);
  const beforeReject = service.snapshot().battleRooms[encounter.room.roomId]
    .battle.captureCandidatesByActorId[remaining.actorId];
  assert.equal(beforeReject.attemptCount, 0);

  const rejected = service.submitBattleCommand(account.session.token, encounter.room.roomId, {
    round: first.room.battle.round,
    actorId: player.actorId,
    actionId: "capture",
    targetActorId: remaining.actorId,
    captureToolId: "capture_net",
    captureMode: "auto",
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "battle_auto_capture_filter_no_match");
  const afterReject = service.snapshot().battleRooms[encounter.room.roomId]
    .battle.captureCandidatesByActorId[remaining.actorId];
  assert.equal(afterReject.attemptCount, 0);
  // Profile writeback is intentionally deferred until the multi-enemy battle
  // closes; the first event proves one net remains and the rejected command
  // cannot consume it or increment the second candidate's attempt counter.
  assert.equal(profileItemCount(service.getProfile(account.session.token).profile, "capture_net"), 2);
});
