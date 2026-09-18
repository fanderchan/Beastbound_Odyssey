"use strict";

const {
  assert, test, createAuthService, createMemoryAuthStore, createAsyncWriteAuthStore, battleProfile,
} = require("../test-support/auth-service-test-context");
const {publicOnlineAppearance} = require("../src/auth/online-player-appearance");
const {normalizeCharacterAppearanceId} = require("../src/auth/account-characters");
const {projectPresenceWirePlayer} = require("../src/auth/online-presence");

test("online appearance reads only the selected character and its living owned riding pet", () => {
  const profile = {
    player: {appearanceId: "frost_whisper_v1", privateField: "secret"},
    ridePetInstanceId: "owned",
    petInstances: [{instanceId: "owned", formId: "bui_novice_sprout_earth5_wind5", state: "riding", hp: 5}],
    wallet: {diamonds: 999},
  };
  const read = () => publicOnlineAppearance(profile, normalizeCharacterAppearanceId);
  const expected = {appearanceId: "frost_whisper_v1", ridingFormId: "bui_novice_sprout_earth5_wind5"};
  const before = structuredClone(profile);
  assert.deepEqual(read(), expected);
  assert.deepEqual(profile, before);
  assert.deepEqual(projectPresenceWirePlayer({accountId: "a", ...profile, ...read()}), {
    accountId: "a", username: "", displayName: "", partyId: "", partyRole: "",
    position: {mapId: "", cellX: 0, cellY: 0, facing: "south", moving: false, hasCell: true},
    ...expected,
  });
  for (const change of [{hp: 0}, {state: "standby"}]) {
    Object.assign(profile.petInstances[0], before.petInstances[0], change);
    assert.equal(read().ridingFormId, "");
  }
  profile.ridePetInstanceId = "not_owned";
  assert.equal(read().ridingFormId, "");
  assert.deepEqual(publicOnlineAppearance(null, normalizeCharacterAppearanceId), {
    appearanceId: "novice_hunter_v1", ridingFormId: "",
  });
  assert.equal(publicOnlineAppearance({player: {appearanceId: "res://untrusted.png"}}, normalizeCharacterAppearanceId).appearanceId, "novice_hunter_v1");
});

test("mounting and dismounting at rest publish only the committed appearance without changing position precision", () => {
  const service = createAuthService({store: createMemoryAuthStore(), allowPositionTeleport: true});
  const actor = service.register({username: "lookrider", password: "test1234", displayName: "骑乘者"});
  const token = actor.session.token;
  const profile = battleProfile("骑乘者", {level: 1, hp: 120, maxHp: 120}, null);
  profile.unlockedAbilities = ["riding"];
  profile.petInstances.push({instanceId: "ride_visual", petId: "ride_visual", formId: "novice_tiger_mount",
    templateId: "novice_tiger_mount", speciesId: "novice_tiger_mount", lineId: "tiger",
    name: "新手老虎", state: "standby", level: 1, hp: 80, maxHp: 80, attack: 20, defense: 16, quick: 28});
  assert.equal(service.saveProfile(token, {profile}).ok, true);
  const position = service.updatePlayerPosition(token, {mapId: "firebud_training_yard", cellX: 10, cellY: 10, scope: "map"});
  assert.equal(position.ok, true);
  const events = [];
  service.onEvent((event) => { if (event.authority === "profile_appearance") events.push(event); });
  const mounted = service.profileAction(token, {action: "pet_state_cycle", payload: {instanceId: "ride_visual"}});
  assert.equal(mounted.ok, true);
  assert.equal(mounted.result.state, "riding");
  assert.equal(events.length, 1);
  assert.equal(events[0].player.ridingFormId, "novice_tiger_mount");
  assert.equal(events[0].position.hasCell, false);
  assert.equal(events[0].position.precision, "map");
  assert.equal(events[0].position.cellX, 0);
  const dismounted = service.profileAction(token, {action: "pet_state_cycle", payload: {instanceId: "ride_visual"}});
  assert.equal(dismounted.ok, true);
  assert.equal(events.length, 2);
  assert.equal(events[1].player.ridingFormId, "");
  assert.equal(events[1].presenceRevision > events[0].presenceRevision, true);
  const failed = service.profileAction(token, {action: "pet_state_cycle", payload: {instanceId: "not_owned"}});
  assert.equal(failed.ok, false);
  assert.equal(events.length, 2);
});

test("AOI roster and delta use the server profile rather than spoofed movement art", () => {
  const service = createAuthService({store: createMemoryAuthStore(), allowPositionTeleport: true});
  const watcher = service.register({username: "lookwatcher", password: "test1234", displayName: "观测者"});
  const actor = service.register({username: "lookactor", password: "test1234", displayName: "同行者"});
  assert.equal(watcher.ok && actor.ok, true);
  const current = service.getProfile(actor.session.token);
  current.profile.player.appearanceId = "ember_spark_v1";
  const saved = service.saveProfile(actor.session.token, {
    expectedRevision: current.profileSummary.profileRevision, profile: current.profile,
  });
  assert.equal(saved.ok, true);
  assert.equal(service.getProfile(actor.session.token).profile.player.appearanceId, "ember_spark_v1");
  assert.equal(service.updatePlayerPosition(watcher.session.token, {mapId: "firebud_training_yard", cellX: 10, cellY: 10}).ok, true);
  const events = [];
  service.onEvent((event) => { if (event.type === "online.position") events.push(event); });
  const moved = service.updatePlayerPosition(actor.session.token, {
    mapId: "firebud_training_yard", cellX: 11, cellY: 10,
    appearanceId: "frost_whisper_v1", ridingFormId: "unowned_mount",
  });
  assert.equal(moved.ok, true);
  const row = service.listOnlinePlayers(watcher.session.token).players.find((entry) => entry.accountId === actor.account.accountId);
  assert.equal(row.appearanceId, "ember_spark_v1");
  assert.equal(row.ridingFormId, "");
  const projected = service.eventForConnection({accountId: watcher.account.accountId, sessionId: watcher.session.sessionId}, events.at(-1));
  assert.equal(projected.visible, true);
  assert.equal(projected.event.player.appearanceId, row.appearanceId);
  assert.equal(projected.event.player.ridingFormId, "");
  assert.equal(Object.hasOwn(projected.event.player, "profile"), false);
  assert.equal(Object.hasOwn(projected.event.player, "petInstances"), false);
});

for (const failWrite of [false, true]) {
  test(`appearance broadcast stays private until commit and ${failWrite ? "disappears on rollback" : "publishes once on success"}`, async (t) => {
    const base = createMemoryAuthStore();
    const seed = createAuthService({store: base});
    const actor = seed.register({username: "lookcommit", password: "test1234"});
    const token = actor.session.token;
    const profile = battleProfile("事务骑手", {level: 1, hp: 120, maxHp: 120}, null);
    profile.unlockedAbilities = ["riding"];
    profile.petInstances.push({instanceId: "ride_commit", petId: "ride_commit", formId: "novice_tiger_mount",
      templateId: "novice_tiger_mount", speciesId: "novice_tiger_mount", lineId: "tiger",
      name: "新手老虎", state: "standby", level: 1, hp: 80, maxHp: 80, attack: 20, defense: 16, quick: 28});
    assert.equal(seed.saveProfile(token, {profile}).ok, true);
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    t.after(() => release.resolve());
    const service = createAuthService({allowPositionTeleport: true, store: createAsyncWriteAuthStore({
      mode: "memory", load: () => base.load(),
      async saveAsync(next) {
        started.resolve();
        await release.promise;
        if (failWrite) throw new Error("appearance test rejects commit");
        base.save(next);
      },
    }, {onError: () => {}})});
    service.updatePlayerPosition(token, {mapId: "firebud_training_yard", cellX: 10, cellY: 10});
    const events = [];
    service.onEvent((event) => { if (event.authority === "profile_appearance") events.push(event); });
    const pending = service.invokeDurable("profileAction", [token, {
      action: "pet_state_cycle", payload: {instanceId: "ride_commit"},
    }], {actionId: "appearance_commit_test"}).then((value) => ({value}), (error) => ({error}));
    await started.promise;
    assert.equal(events.length, 0);
    const before = service.listOnlinePlayers(token).players.find((entry) => entry.accountId === actor.account.accountId);
    assert.equal(before.ridingFormId, "");
    release.resolve();
    const outcome = await pending;
    if (failWrite) {
      assert.equal(outcome.error.code, "storage_write_failed");
      assert.equal(events.length, 0);
      assert.equal(service.listOnlinePlayers(token).players.find((entry) => entry.accountId === actor.account.accountId).ridingFormId, "");
    } else {
      assert.equal(outcome.value.ok, true);
      assert.equal(events.length, 1);
      assert.equal(events[0].player.ridingFormId, "novice_tiger_mount");
    }
  });
}
