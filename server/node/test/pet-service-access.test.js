"use strict";

const {
  assert,
  test,
  once,
  createAuthService,
  createMemoryAuthStore,
  createHttpServer,
  battleProfile,
  fetchJson,
  internalProfileForAccount,
} = require("../test-support/auth-service-test-context");
const {
  authorizePetServiceAction,
} = require("../src/auth/pet-service-access");
const {
  loadAuthoritativeMap,
  authoritativeInteractionPoint,
  authoritativeSpawnCell,
  standableCellAtDistance,
  standableCellFarFrom,
} = require("../test-support/authoritative-map-test-fixture");

const FIREBUD_VILLAGE_MAP = loadAuthoritativeMap("firebud_village_gate");
const FIREBUD_TRAINING_MAP = loadAuthoritativeMap("firebud_training_yard");
const FIREBUD_TRAINING_SPAWN = authoritativeSpawnCell(FIREBUD_TRAINING_MAP);
const FIREBUD_STABLE = authoritativeInteractionPoint(
  FIREBUD_VILLAGE_MAP,
  "firebud_stable_keeper",
  {kind: "npc", actionType: "stable", movementCollision: "block"},
);
const FIREBUD_STABLE_NEAR = standableCellAtDistance(FIREBUD_VILLAGE_MAP, FIREBUD_STABLE.cell, 1);
const FIREBUD_STABLE_TWO_AWAY = standableCellAtDistance(FIREBUD_VILLAGE_MAP, FIREBUD_STABLE.cell, 2);
const FIREBUD_STABLE_FAR = standableCellFarFrom(FIREBUD_VILLAGE_MAP, [FIREBUD_STABLE.cell], 3);
const FIREBUD_PET_SKILL_TRAINER = authoritativeInteractionPoint(
  FIREBUD_VILLAGE_MAP,
  "firebud_pet_skill_trainer",
  {
    kind: "npc",
    actionType: "pet_skill_trainer",
    trainerId: "firebud_pet_skill_trainer",
    movementCollision: "block",
  },
);
const FIREBUD_TRAINER_NEAR = standableCellAtDistance(FIREBUD_VILLAGE_MAP, FIREBUD_PET_SKILL_TRAINER.cell, 1);
const FIREBUD_TRAINER_TWO_AWAY = standableCellAtDistance(FIREBUD_VILLAGE_MAP, FIREBUD_PET_SKILL_TRAINER.cell, 2);
const FIREBUD_TRAINER_FAR = standableCellFarFrom(FIREBUD_VILLAGE_MAP, [FIREBUD_PET_SKILL_TRAINER.cell], 3);

function authoritativePosition(mapDocument, cell, moving = false) {
  return {
    mapId: String(mapDocument.id),
    cellX: Number(cell[0]),
    cellY: Number(cell[1]),
    moving,
  };
}

function profileRevision(service, accountId) {
  const snapshot = service.snapshot();
  return Number(snapshot.profileBindings[accountId].profileRevision || 0);
}

function petState(service, accountId, instanceId) {
  const profile = internalProfileForAccount(service, accountId);
  const pet = profile.petInstances.find((entry) => entry && entry.instanceId === instanceId);
  return String(pet && pet.state || "");
}

function servicePet(instanceId, state = "standby") {
  return {
    instanceId,
    petId: instanceId,
    formId: "bui_normal_red_fire10",
    templateId: "bui_normal_red_fire10",
    name: instanceId,
    state,
    level: 10,
    hp: 90,
    maxHp: 90,
    attack: 30,
    defense: 12,
    quick: 42,
    activeSkillIds: [],
    petSkillSlots: ["", "", "", "", "", "", ""],
  };
}

function strictService() {
  return createAuthService({
    store: createMemoryAuthStore(),
    useStrictPetServiceAccess: true,
    allowPositionTeleport: true,
  });
}

test("stable mutations require an authoritative remote ability or nearby stable service", () => {
  const service = strictService();
  const registered = service.register({
    username: "petstableaccess",
    password: "test1234",
    displayName: "兽栏权限号",
  });
  const {accountId} = registered.account;
  const token = registered.session.token;
  const profile = battleProfile("兽栏权限号", {level: 10, hp: 120, maxHp: 120}, null);
  profile.petInstances = [
    servicePet("stable_toggle_pet"),
    servicePet("stable_batch_pet"),
  ];
  assert.equal(service.saveProfile(token, {expectedRevision: 0, profile}).ok, true);
  const initialRevision = profileRevision(service, accountId);
  const initialProfile = structuredClone(internalProfileForAccount(service, accountId));

  const forgedPanelAccess = service.profileAction(token, {
    action: "pet_stable_toggle",
    payload: {instanceId: "stable_toggle_pet", openedFromStable: true},
  });
  assert.equal(forgedPanelAccess.ok, false);
  assert.equal(forgedPanelAccess.code, "pet_stable_access_required");
  const forgedBatchAccess = service.profileAction(token, {
    action: "pet_batch_store",
    payload: {openedFromStable: true},
  });
  assert.equal(forgedBatchAccess.ok, false);
  assert.equal(forgedBatchAccess.code, "pet_stable_access_required");
  assert.equal(profileRevision(service, accountId), initialRevision);
  assert.deepEqual(internalProfileForAccount(service, accountId), initialProfile);

  assert.equal(service.updatePlayerPosition(
    token,
    authoritativePosition(FIREBUD_TRAINING_MAP, FIREBUD_TRAINING_SPAWN),
  ).ok, true);
  const wrongMap = service.profileAction(token, {
    action: "pet_stable_toggle",
    payload: {instanceId: "stable_toggle_pet"},
  });
  assert.equal(wrongMap.ok, false);
  assert.equal(wrongMap.code, "pet_stable_access_required");
  assert.equal(profileRevision(service, accountId), initialRevision);

  assert.equal(service.updatePlayerPosition(
    token,
    authoritativePosition(FIREBUD_VILLAGE_MAP, FIREBUD_STABLE_TWO_AWAY),
  ).ok, true);
  const twoCellsAway = service.profileAction(token, {
    action: "pet_stable_toggle",
    payload: {instanceId: "stable_toggle_pet", openedFromStable: true},
  });
  assert.equal(twoCellsAway.ok, false);
  assert.equal(twoCellsAway.code, "pet_stable_access_required");
  assert.equal(profileRevision(service, accountId), initialRevision);

  assert.equal(service.updatePlayerPosition(
    token,
    authoritativePosition(FIREBUD_VILLAGE_MAP, FIREBUD_STABLE_NEAR, true),
  ).ok, true);
  const movingNearby = service.profileAction(token, {
    action: "pet_stable_toggle",
    payload: {instanceId: "stable_toggle_pet"},
  });
  assert.equal(movingNearby.ok, false);
  assert.equal(movingNearby.code, "pet_stable_access_required");
  assert.equal(profileRevision(service, accountId), initialRevision);

  assert.equal(service.updatePlayerPosition(
    token,
    authoritativePosition(FIREBUD_VILLAGE_MAP, FIREBUD_STABLE_NEAR),
  ).ok, true);
  const stored = service.profileAction(token, {
    action: "pet_stable_toggle",
    payload: {instanceId: "stable_toggle_pet"},
  });
  assert.equal(stored.ok, true);
  assert.equal(petState(service, accountId, "stable_toggle_pet"), "storage");
  const batchStored = service.profileAction(token, {
    action: "pet_batch_store",
    payload: {},
  });
  assert.equal(batchStored.ok, true);
  assert.equal(batchStored.result.changedCount, 1);
  assert.equal(petState(service, accountId, "stable_batch_pet"), "storage");
  const revisionAfterNearbySuccess = profileRevision(service, accountId);

  assert.equal(service.updatePlayerPosition(
    token,
    authoritativePosition(FIREBUD_VILLAGE_MAP, FIREBUD_STABLE_FAR),
  ).ok, true);
  const remoteWithdrawDenied = service.profileAction(token, {
    action: "pet_stable_toggle",
    payload: {instanceId: "stable_toggle_pet"},
  });
  assert.equal(remoteWithdrawDenied.ok, false);
  assert.equal(remoteWithdrawDenied.code, "pet_stable_access_required");
  assert.equal(profileRevision(service, accountId), revisionAfterNearbySuccess);
  assert.equal(petState(service, accountId, "stable_toggle_pet"), "storage");

  const remoteService = strictService();
  const remoteRegistered = remoteService.register({
    username: "petremotestable",
    password: "test1234",
    displayName: "远程兽栏号",
  });
  const remoteProfile = battleProfile("远程兽栏号", {level: 10, hp: 120, maxHp: 120}, null);
  remoteProfile.unlockedAbilities = ["remoteStable"];
  remoteProfile.petInstances = [
    servicePet("remote_toggle_pet"),
    servicePet("remote_batch_pet"),
  ];
  assert.equal(remoteService.saveProfile(remoteRegistered.session.token, {
    expectedRevision: 0,
    profile: remoteProfile,
  }).ok, true);
  assert.equal(remoteService.profileAction(remoteRegistered.session.token, {
    action: "pet_stable_toggle",
    payload: {instanceId: "remote_toggle_pet"},
  }).ok, true);
  assert.equal(remoteService.profileAction(remoteRegistered.session.token, {
    action: "pet_batch_store",
    payload: {},
  }).ok, true);
});

test("skill slot mutation requires the claimed trainer at the authoritative current position", () => {
  const service = strictService();
  const registered = service.register({
    username: "petskillaccess",
    password: "test1234",
    displayName: "宠技权限号",
  });
  const {accountId} = registered.account;
  const token = registered.session.token;
  const profile = battleProfile("宠技权限号", {level: 10, hp: 120, maxHp: 120}, null);
  profile.stoneCoins = 100;
  profile.unlockedAbilities = ["remoteStable"];
  profile.petInstances = [servicePet("trainer_pet")];
  assert.equal(service.saveProfile(token, {expectedRevision: 0, profile}).ok, true);
  const initialRevision = profileRevision(service, accountId);

  const forgedPanelAccess = service.profileAction(token, {
    action: "pet_skill_set_slot",
    payload: {
      instanceId: "trainer_pet",
      slot: 7,
      skillId: "pet_focus_bite",
      trainerId: "firebud_pet_skill_trainer",
      openedFromTrainer: true,
    },
  });
  assert.equal(forgedPanelAccess.ok, false);
  assert.equal(forgedPanelAccess.code, "pet_skill_trainer_access_required");
  assert.equal(profileRevision(service, accountId), initialRevision);
  assert.equal(internalProfileForAccount(service, accountId).stoneCoins, 100);

  assert.equal(service.updatePlayerPosition(
    token,
    authoritativePosition(FIREBUD_TRAINING_MAP, FIREBUD_TRAINING_SPAWN),
  ).ok, true);
  const wrongMap = service.profileAction(token, {
    action: "pet_skill_set_slot",
    payload: {
      instanceId: "trainer_pet",
      slot: 7,
      skillId: "pet_focus_bite",
      trainerId: "firebud_pet_skill_trainer",
    },
  });
  assert.equal(wrongMap.ok, false);
  assert.equal(wrongMap.code, "pet_skill_trainer_access_required");
  assert.equal(profileRevision(service, accountId), initialRevision);
  assert.equal(internalProfileForAccount(service, accountId).stoneCoins, 100);

  assert.equal(service.updatePlayerPosition(
    token,
    authoritativePosition(FIREBUD_VILLAGE_MAP, FIREBUD_TRAINER_TWO_AWAY),
  ).ok, true);
  const twoCellsAway = service.profileAction(token, {
    action: "pet_skill_set_slot",
    payload: {
      instanceId: "trainer_pet",
      slot: 7,
      skillId: "pet_focus_bite",
      trainerId: "firebud_pet_skill_trainer",
    },
  });
  assert.equal(twoCellsAway.ok, false);
  assert.equal(twoCellsAway.code, "pet_skill_trainer_access_required");
  assert.equal(profileRevision(service, accountId), initialRevision);

  assert.equal(service.updatePlayerPosition(
    token,
    authoritativePosition(FIREBUD_VILLAGE_MAP, FIREBUD_TRAINER_NEAR, true),
  ).ok, true);
  const movingNearby = service.profileAction(token, {
    action: "pet_skill_set_slot",
    payload: {
      instanceId: "trainer_pet",
      slot: 7,
      skillId: "pet_focus_bite",
      trainerId: "firebud_pet_skill_trainer",
    },
  });
  assert.equal(movingNearby.ok, false);
  assert.equal(movingNearby.code, "pet_skill_trainer_access_required");
  assert.equal(profileRevision(service, accountId), initialRevision);
  assert.equal(internalProfileForAccount(service, accountId).stoneCoins, 100);

  assert.equal(service.updatePlayerPosition(
    token,
    authoritativePosition(FIREBUD_VILLAGE_MAP, FIREBUD_TRAINER_NEAR),
  ).ok, true);
  const missingTrainer = service.profileAction(token, {
    action: "pet_skill_set_slot",
    payload: {
      instanceId: "trainer_pet",
      slot: 7,
      skillId: "pet_focus_bite",
    },
  });
  assert.equal(missingTrainer.ok, false);
  assert.equal(missingTrainer.code, "pet_skill_trainer_required");
  const forgedTrainer = service.profileAction(token, {
    action: "pet_skill_set_slot",
    payload: {
      instanceId: "trainer_pet",
      slot: 7,
      skillId: "pet_focus_bite",
      trainerId: "forged_remote_trainer",
    },
  });
  assert.equal(forgedTrainer.ok, false);
  assert.equal(forgedTrainer.code, "pet_skill_trainer_access_required");
  assert.equal(profileRevision(service, accountId), initialRevision);
  assert.equal(internalProfileForAccount(service, accountId).stoneCoins, 100);

  const learned = service.profileAction(token, {
    action: "pet_skill_set_slot",
    payload: {
      instanceId: "trainer_pet",
      slot: 7,
      skillId: "pet_focus_bite",
      trainerId: "firebud_pet_skill_trainer",
    },
  });
  assert.equal(learned.ok, true);
  assert.equal(learned.result.cost, 28);
  assert.equal(learned.profile.stoneCoins, 72);
  assert.equal(
    learned.profile.petInstances.find((pet) => pet.instanceId === "trainer_pet").petSkillSlots[6],
    "pet_focus_bite",
  );
  const learnedRevision = profileRevision(service, accountId);

  assert.equal(service.updatePlayerPosition(
    token,
    authoritativePosition(FIREBUD_VILLAGE_MAP, FIREBUD_TRAINER_FAR),
  ).ok, true);
  const farClearDenied = service.profileAction(token, {
    action: "pet_skill_set_slot",
    payload: {
      instanceId: "trainer_pet",
      slot: 7,
      skillId: "",
      trainerId: "firebud_pet_skill_trainer",
    },
  });
  assert.equal(farClearDenied.ok, false);
  assert.equal(farClearDenied.code, "pet_skill_trainer_access_required");
  assert.equal(profileRevision(service, accountId), learnedRevision);
  const unchanged = internalProfileForAccount(service, accountId);
  assert.equal(unchanged.stoneCoins, 72);
  assert.equal(
    unchanged.petInstances.find((pet) => pet.instanceId === "trainer_pet").petSkillSlots[6],
    "pet_focus_bite",
  );
});

test("service metadata without an exact NPC identity never grants pet access", () => {
  const position = {
    mapId: "metadata_only_map",
    cellX: 4,
    cellY: 5,
    moving: false,
    hasCell: true,
  };
  const resolveMap = () => ({
    id: "metadata_only_map",
    interactionPoints: [
      {
        id: "stable_counter",
        kind: "marker",
        actionType: "stable",
        facilityType: "stable",
        cell: [5, 5],
      },
      {
        id: "different_interaction_id",
        kind: "npc",
        actionType: "pet_skill_trainer",
        facilityType: "trainer",
        trainerId: "firebud_pet_skill_trainer",
        cell: [5, 5],
      },
    ],
  });
  const dependencies = {
    resolveMap,
    positionHasCell: () => true,
    maxDistanceCells: 1,
  };

  const stable = authorizePetServiceAction({
    action: "pet_stable_toggle",
    params: {instanceId: "pet"},
    profile: {},
    position,
  }, dependencies);
  assert.equal(stable.ok, false);
  assert.equal(stable.code, "pet_stable_access_required");

  const trainer = authorizePetServiceAction({
    action: "pet_skill_set_slot",
    params: {
      instanceId: "pet",
      trainerId: "firebud_pet_skill_trainer",
      skillId: "pet_focus_bite",
      slot: 7,
    },
    profile: {},
    position,
  }, dependencies);
  assert.equal(trainer.ok, false);
  assert.equal(trainer.code, "pet_skill_trainer_access_required");
});

test("durable stable replay keeps the committed result while a new key rechecks current access", async (t) => {
  const service = strictService();
  const registered = service.register({
    username: "petstabledurable",
    password: "test1234",
    displayName: "兽栏幂等号",
  });
  const {accountId} = registered.account;
  const token = registered.session.token;
  const profile = battleProfile("兽栏幂等号", {level: 10, hp: 120, maxHp: 120}, null);
  profile.petInstances = [servicePet("durable_stable_pet")];
  assert.equal(service.saveProfile(token, {expectedRevision: 0, profile}).ok, true);
  assert.equal(service.updatePlayerPosition(
    token,
    authoritativePosition(FIREBUD_VILLAGE_MAP, FIREBUD_STABLE_NEAR),
  ).ok, true);

  const server = createHttpServer({service, logger: false});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = JSON.stringify({
    action: "pet_stable_toggle",
    payload: {instanceId: "durable_stable_pet"},
  });
  const headers = {
    authorization: `Bearer ${token}`,
    "Idempotency-Key": "pet_stable_durable_0001",
  };

  const first = await fetchJson(`${base}/profile/action`, {
    method: "POST",
    headers,
    body,
  });
  assert.equal(first.ok, true);
  assert.equal(first.durableCommit.replayed, false);
  assert.equal(petState(service, accountId, "durable_stable_pet"), "storage");
  const committedRevision = profileRevision(service, accountId);

  assert.equal(service.updatePlayerPosition(
    token,
    authoritativePosition(FIREBUD_VILLAGE_MAP, FIREBUD_STABLE_FAR),
  ).ok, true);
  const replay = await fetchJson(`${base}/profile/action`, {
    method: "POST",
    headers,
    body,
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.durableCommit.replayed, true);
  assert.equal(replay.profileBinding.profileRevision, committedRevision);
  assert.equal(profileRevision(service, accountId), committedRevision);
  assert.equal(petState(service, accountId, "durable_stable_pet"), "storage");

  const rechecked = await fetchJson(`${base}/profile/action`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "Idempotency-Key": "pet_stable_durable_0002",
    },
    body,
  });
  assert.equal(rechecked.ok, false);
  assert.equal(rechecked.code, "pet_stable_access_required");
  assert.equal(profileRevision(service, accountId), committedRevision);
  assert.equal(petState(service, accountId, "durable_stable_pet"), "storage");
});
