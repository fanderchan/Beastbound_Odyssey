"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  authorityRootCertificationRetentionDiagnostics,
  authorityRootCloneDiagnostics,
  authorityRootRecordForMutation,
  authorityRootJournalForMutation,
  authorityRootTrustCompromised,
  certifyOwnedAuthorityRootJsonValue,
  certifyOwnedAuthorityRootTransientJsonValue,
  cloneAuthorityRoot,
  freezeAuthorityRootCowRecordValues,
  freezeAuthorityRootJournal,
  freezeAuthorityRootIdentityRecordValues,
  freezeAuthorityRootPlayerPositionValue,
  freezeAuthorityRootPlayerPositionValues,
  freezeAuthorityRootRecordValues,
  isCertifiedAuthorityRootJsonValue,
  isTrustedAuthorityRoot,
  markAuthorityRootTrusted,
} = require("../src/auth/authority-root-clone");
const {battleRoomForMutation} = require("../src/auth/battle-room-cow");
const {
  __authorityJournalNormalizersForTest,
  createAuthService,
} = require("../src/auth-service");
const {
  materializeAuthorityRootLargeCollections,
} = require("../src/auth/authority-root-materialization");
const {
  commitConsumedEquipmentEnvelopeLedger,
  ensureConsumedEquipmentEnvelopeIds,
  readConsumedEquipmentEnvelopeLedger,
} = require("../src/auth/equipment-envelope-consumed-ledger");
const {
  canonicalDurableMutationReceipts,
  commitDurableMutationReceiptDelta,
  stageDurableMutationReceipt,
} = require("../src/auth/durable-mutation-state");
const {
  commitMailAuthorityDelta,
  readMailAuthorityState,
  stageMailAuthorityUpsert,
} = require("../src/auth/mail-authority-state");

test("authority root clones share only a validated immutable consumed ledger", () => {
  const canonical = readConsumedEquipmentEnvelopeLedger({
    eqx_clone_capacity_0001: {
      schemaVersion: 1,
      envelopeId: "eqx_clone_capacity_0001",
    },
  });
  assert.equal(canonical.ok, true);
  const root = {
    profiles: {player_a: {profile: {stoneCoins: 10}}},
    consumedEquipmentEnvelopes: canonical.ledger,
  };
  const cloned = cloneAuthorityRoot(root);
  assert.notEqual(cloned, root);
  assert.notEqual(cloned.profiles, root.profiles);
  assert.equal(cloned.consumedEquipmentEnvelopes, root.consumedEquipmentEnvelopes);

  cloned.profiles.player_a.profile.stoneCoins = 20;
  assert.equal(root.profiles.player_a.profile.stoneCoins, 10);
  const appended = ensureConsumedEquipmentEnvelopeIds(
    cloned.consumedEquipmentEnvelopes,
    "eqx_clone_capacity_0002",
  );
  assert.equal(appended.ok, true);
  assert.notEqual(appended.ledger, canonical.ledger);
  assert.equal(Object.hasOwn(canonical.ledger, "eqx_clone_capacity_0002"), false);
  assert.equal(Object.hasOwn(appended.ledger, "eqx_clone_capacity_0002"), true);
});

test("authority root clones never share an unvalidated ledger", () => {
  const rawLedger = {
    eqx_clone_untrusted_0001: {
      schemaVersion: 1,
      envelopeId: "eqx_clone_untrusted_0001",
    },
  };
  const root = {profiles: {}, consumedEquipmentEnvelopes: rawLedger};
  const cloned = cloneAuthorityRoot(root);
  assert.notEqual(cloned.consumedEquipmentEnvelopes, rawLedger);
  cloned.consumedEquipmentEnvelopes.eqx_clone_untrusted_0001.schemaVersion = 2;
  assert.equal(rawLedger.eqx_clone_untrusted_0001.schemaVersion, 1);
});

test("trusted roots share frozen journal containers and copy only on mutation", () => {
  const chatMessages = freezeAuthorityRootJournal([{messageId: "chat_1", body: {text: "不可改写"}}]);
  const serviceEvents = freezeAuthorityRootJournal([{eventSeq: 1, type: "chat.message", message: {text: "不可改写"}}]);
  const battleTrace = freezeAuthorityRootJournal([{traceId: "trace_1", details: {round: 1}}]);
  const battleRecords = freezeAuthorityRootJournal([{recordId: "record_1", result: {reason: "victory"}}]);
  const authEvents = freezeAuthorityRootJournal([{eventId: "auth_1", ok: true}]);
  const gmCommandAudit = freezeAuthorityRootJournal([{auditId: "audit_1", details: {commandId: "gm.test"}}]);
  const battleRoomRecoveries = freezeAuthorityRootRecordValues({
    room_1: {roomId: "room_1", battle: {result: {reason: "victory"}}},
  });
  const root = {
    profiles: {player_a: {profile: {stoneCoins: 10}}},
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
    chatMessages,
    serviceEvents,
    battleTrace,
    battleRecords,
    authEvents,
    gmCommandAudit,
    battleRoomRecoveries,
    battleRoomRecoveryByAccountId: {acc_a: "room_1"},
  };
  assert.equal(markAuthorityRootTrusted(root), true);
  assert.equal(Object.isFrozen(root.serviceEvents), true);
  assert.throws(() => root.serviceEvents.push({eventSeq: 2}), TypeError);

  const directWriterRoot = {serviceEvents: root.serviceEvents};
  const mutableServiceEvents = authorityRootJournalForMutation(directWriterRoot, "serviceEvents");
  mutableServiceEvents.push({eventSeq: 2, type: "chat.message"});
  assert.notEqual(directWriterRoot.serviceEvents, root.serviceEvents);
  assert.equal(root.serviceEvents.length, 1);
  assert.equal(directWriterRoot.serviceEvents.length, 2);

  const cloned = cloneAuthorityRoot(root);
  for (const key of ["chatMessages", "serviceEvents", "battleTrace", "battleRecords", "authEvents", "gmCommandAudit"]) {
    assert.equal(cloned[key], root[key], key);
    assert.equal(cloned[key][0], root[key][0], key);
  }
  assert.notEqual(cloned.battleRoomRecoveries, root.battleRoomRecoveries);
  assert.equal(cloned.battleRoomRecoveries.room_1, root.battleRoomRecoveries.room_1);
  assert.notEqual(cloned.battleRoomRecoveryByAccountId, root.battleRoomRecoveryByAccountId);

  authorityRootJournalForMutation(cloned, "chatMessages").push({messageId: "chat_2"});
  authorityRootJournalForMutation(cloned, "battleRecords")[0] = {recordId: "record_2"};
  delete cloned.battleRoomRecoveries.room_1;
  cloned.battleRoomRecoveryByAccountId.acc_a = "room_2";
  assert.equal(root.chatMessages.length, 1);
  assert.equal(root.battleRecords[0].recordId, "record_1");
  assert.ok(root.battleRoomRecoveries.room_1);
  assert.equal(root.battleRoomRecoveryByAccountId.acc_a, "room_1");
  assert.throws(() => {
    cloned.serviceEvents[0].message.text = "已改写";
  }, TypeError);
  assert.equal(root.serviceEvents[0].message.text, "不可改写");
});

test("trusted roots copy only the battleRooms container until one room mutates", () => {
  const battleRooms = freezeAuthorityRootRecordValues(Object.fromEntries(
    [1, 2, 3, 4].map((index) => [`room_${index}`, {
      roomId: `room_${index}`,
      status: "ready",
      participantAccountIds: [`acc_${index}`],
      battle: {
        round: 1,
        commands: {},
        actors: [{actorId: `actor_${index}`, hp: 100}],
      },
    }]),
  ));
  const root = {
    battleRooms,
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
  };
  assert.equal(markAuthorityRootTrusted(root), true);

  const candidate = cloneAuthorityRoot(root);
  assert.notEqual(candidate.battleRooms, root.battleRooms);
  for (const roomId of Object.keys(root.battleRooms)) {
    assert.equal(candidate.battleRooms[roomId], root.battleRooms[roomId], roomId);
  }

  const mutable = battleRoomForMutation(candidate, "room_3");
  mutable.battle.commands.actor_3 = {actionId: "attack"};
  assert.notEqual(candidate.battleRooms.room_3, root.battleRooms.room_3);
  assert.equal(candidate.battleRooms.room_1, root.battleRooms.room_1);
  assert.equal(candidate.battleRooms.room_2, root.battleRooms.room_2);
  assert.equal(candidate.battleRooms.room_4, root.battleRooms.room_4);
  assert.deepEqual(root.battleRooms.room_3.battle.commands, {});
});

test("trusted roots copy only the playerPositions container and keep published positions immutable", () => {
  const playerPositions = freezeAuthorityRootPlayerPositionValues({
    acc_a: {
      accountId: "acc_a",
      mapId: "firebud_village_gate",
      cellX: 10,
      cellY: 17,
      authority: "server_step",
    },
    acc_b: {
      accountId: "acc_b",
      mapId: "firebud_village_gate",
      cellX: 11,
      cellY: 17,
    },
  });
  const root = {
    playerPositions,
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
  };
  assert.equal(markAuthorityRootTrusted(root), true);
  assert.equal(Object.isFrozen(root.playerPositions), true);
  assert.throws(() => {
    root.playerPositions.acc_c = {accountId: "acc_c"};
  }, TypeError);

  const candidate = cloneAuthorityRoot(root);
  assert.notEqual(candidate.playerPositions, root.playerPositions);
  assert.equal(candidate.playerPositions.acc_a, root.playerPositions.acc_a);
  assert.equal(candidate.playerPositions.acc_b, root.playerPositions.acc_b);
  assert.equal(Object.isFrozen(root.playerPositions.acc_a), true);
  assert.deepEqual(JSON.parse(JSON.stringify(root.playerPositions.acc_a)), {
    accountId: "acc_a",
    mapId: "firebud_village_gate",
    cellX: 10,
    cellY: 17,
    authority: "server_step",
  });
  assert.throws(() => {
    candidate.playerPositions.acc_a.cellX = 99;
  }, TypeError);

  const replacement = {...candidate.playerPositions.acc_a, cellX: 12};
  assert.equal(freezeAuthorityRootPlayerPositionValue(replacement), true);
  candidate.playerPositions.acc_a = replacement;
  assert.equal(candidate.playerPositions.acc_a.cellX, 12);
  assert.equal(root.playerPositions.acc_a.cellX, 10);
  assert.equal(candidate.playerPositions.acc_b, root.playerPositions.acc_b);
});

test("player position certification rejects non-flat or non-data JSON records without sharing them", () => {
  let getterReads = 0;
  const accessorPosition = {
    accountId: "acc_accessor",
    mapId: "firebud_village_gate",
  };
  Object.defineProperty(accessorPosition, "cellX", {
    enumerable: true,
    get() {
      getterReads += 1;
      return 10;
    },
  });
  const nestedPosition = {
    accountId: "acc_nested",
    mapId: "firebud_village_gate",
    cellX: 10,
    cellY: 17,
    metadata: {authority: "server_step"},
  };
  const symbolPosition = {
    accountId: "acc_symbol",
    mapId: "firebud_village_gate",
    cellX: 10,
    cellY: 17,
  };
  symbolPosition[Symbol("unexpected")] = true;

  const playerPositions = freezeAuthorityRootPlayerPositionValues({
    acc_accessor: accessorPosition,
    acc_nested: nestedPosition,
    acc_symbol: symbolPosition,
    acc_wrong_key: {
      accountId: "acc_different",
      mapId: "firebud_village_gate",
      cellX: 10,
      cellY: 17,
    },
  });
  assert.equal(getterReads, 0);
  const root = {
    playerPositions,
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
  };
  assert.equal(markAuthorityRootTrusted(root), true);
  assert.equal(authorityRootCloneDiagnostics(root).shared.includes("playerPositions"), false);
  assert.equal(isCertifiedAuthorityRootJsonValue(accessorPosition), false);
  assert.equal(isCertifiedAuthorityRootJsonValue(nestedPosition), false);
  assert.equal(isCertifiedAuthorityRootJsonValue(symbolPosition), false);
});

test("copied player-position symbols cannot forge trusted values or containers", () => {
  const canonicalValue = {
    accountId: "acc_canonical",
    mapId: "firebud_village_gate",
    cellX: 10,
    cellY: 17,
  };
  assert.equal(freezeAuthorityRootPlayerPositionValue(canonicalValue), true);
  const valueMarker = Reflect.ownKeys(canonicalValue).find((key) => typeof key === "symbol");
  assert.ok(valueMarker);

  const forgedValue = {
    accountId: "acc_forged",
    mapId: "firebud_village_gate",
    cellX: 10,
    cellY: 17,
    nested: {mutable: true},
  };
  Object.defineProperty(
    forgedValue,
    valueMarker,
    Object.getOwnPropertyDescriptor(canonicalValue, valueMarker),
  );
  Object.freeze(forgedValue);
  assert.equal(freezeAuthorityRootPlayerPositionValue(forgedValue), false);

  const canonicalContainer = freezeAuthorityRootPlayerPositionValues({
    acc_canonical: canonicalValue,
  });
  const containerMarker = Reflect.ownKeys(canonicalContainer).find((key) => typeof key === "symbol");
  assert.ok(containerMarker);
  let getterReads = 0;
  const forgedContainer = {};
  Object.defineProperty(forgedContainer, "acc_forged", {
    enumerable: true,
    get() {
      getterReads += 1;
      return forgedValue;
    },
  });
  Object.defineProperty(
    forgedContainer,
    containerMarker,
    Object.getOwnPropertyDescriptor(canonicalContainer, containerMarker),
  );
  Object.freeze(forgedContainer);
  freezeAuthorityRootPlayerPositionValues(forgedContainer);
  assert.equal(getterReads, 0);

  const root = {
    playerPositions: forgedContainer,
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
  };
  assert.equal(markAuthorityRootTrusted(root), true);
  assert.equal(authorityRootCloneDiagnostics(root).shared.includes("playerPositions"), false);
});

test("high-churn flat player positions avoid the global deep-freeze certification table", () => {
  let latest = null;
  for (let index = 0; index < 10_000; index += 1) {
    latest = {
      accountId: `acc_${index % 200}`,
      mapId: "firebud_village_gate",
      cellX: index % 80,
      cellY: index % 60,
      movementSeq: index,
      authority: "server_step",
      updatedAt: "2026-07-13T00:00:00.000Z",
      schemaVersion: 1,
    };
    assert.equal(freezeAuthorityRootPlayerPositionValue(latest), true);
  }
  assert.equal(Object.isFrozen(latest), true);
  assert.equal(isCertifiedAuthorityRootJsonValue(latest), false);
});

test("discarded battle room candidate mutations cannot pollute the published root", () => {
  const battleRooms = freezeAuthorityRootRecordValues({
    room_failed: {
      roomId: "room_failed",
      status: "ready",
      battle: {round: 7, commands: {}},
    },
  });
  const root = {
    battleRooms,
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
  };
  assert.equal(markAuthorityRootTrusted(root), true);
  const failedCandidate = cloneAuthorityRoot(root);
  const mutable = battleRoomForMutation(failedCandidate, "room_failed");
  mutable.status = "closed";
  mutable.battle.round = 99;

  assert.equal(root.battleRooms.room_failed.status, "ready");
  assert.equal(root.battleRooms.room_failed.battle.round, 7);
  assert.throws(() => {
    root.battleRooms.room_failed.battle.round = 8;
  }, TypeError);
});

test("trusted roots isolate the profiles container while sharing deeply frozen documents", () => {
  const profiles = freezeAuthorityRootCowRecordValues({
    player_a: {
      playerId: "player_a",
      profileRevision: 1,
      profile: {
        stoneCoins: 10,
        backpackSlots: [{itemId: "item_meat_small", count: 1}],
      },
    },
    player_b: {
      playerId: "player_b",
      profileRevision: 2,
      profile: {stoneCoins: 20},
    },
  });
  const root = {
    profiles,
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
  };
  assert.equal(markAuthorityRootTrusted(root), true);
  assert.equal(Object.isFrozen(root.profiles), true);

  const writerRoot = {profiles: root.profiles};
  const mutableProfiles = authorityRootRecordForMutation(writerRoot, "profiles");
  mutableProfiles.player_a = {
    playerId: "player_a",
    profileRevision: 2,
    profile: {stoneCoins: 11},
  };
  assert.notEqual(writerRoot.profiles, root.profiles);
  assert.equal(root.profiles.player_a.profileRevision, 1);

  const cloned = cloneAuthorityRoot(root);
  assert.notEqual(cloned.profiles, root.profiles);
  assert.equal(cloned.profiles.player_a, root.profiles.player_a);
  assert.equal(cloned.profiles.player_b, root.profiles.player_b);
  assert.equal(Object.isFrozen(root.profiles.player_a), true);
  assert.equal(Object.isFrozen(root.profiles.player_a.profile), true);
  assert.equal(Object.isFrozen(root.profiles.player_a.profile.backpackSlots[0]), true);
  assert.throws(() => {
    cloned.profiles.player_a.profile.stoneCoins = 999;
  }, TypeError);

  cloned.profiles.player_a = {
    playerId: "player_a",
    profileRevision: 2,
    profile: {stoneCoins: 11},
  };
  assert.equal(root.profiles.player_a.profileRevision, 1);
  assert.equal(root.profiles.player_a.profile.stoneCoins, 10);
  assert.equal(cloned.profiles.player_b, root.profiles.player_b);
});

test("trusted roots isolate identity containers while sharing schema-certified frozen records", () => {
  const accounts = freezeAuthorityRootIdentityRecordValues("accounts", {
    authqa: {
      accountId: "acc_authqa",
      username: "authqa",
      role: "player",
      passwordHash: "a".repeat(64),
      metadata: {source: "test"},
    },
  });
  const sessions = freezeAuthorityRootIdentityRecordValues("sessions", {
    sess_authqa: {
      sessionId: "sess_authqa",
      accountId: "acc_authqa",
      tokenHash: "b".repeat(64),
      expiresAt: "2026-07-20T00:00:00.000Z",
      revokedAt: null,
    },
  });
  const profileBindings = freezeAuthorityRootIdentityRecordValues("profileBindings", {
    acc_authqa: {
      accountId: "acc_authqa",
      playerId: "player_authqa",
      profileRevision: 3,
      updatedAt: "2026-07-13T00:00:00.000Z",
    },
  });
  const root = {
    accounts,
    sessions,
    profileBindings,
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
  };
  assert.equal(markAuthorityRootTrusted(root), true);
  for (const key of ["accounts", "sessions", "profileBindings"]) {
    assert.equal(Object.isFrozen(root[key]), true, key);
  }
  assert.throws(() => {
    root.accounts.another = {accountId: "acc_another", username: "another"};
  }, TypeError);

  const writerRoot = {sessions: root.sessions};
  authorityRootRecordForMutation(writerRoot, "sessions").sess_second = {
    sessionId: "sess_second",
    accountId: "acc_authqa",
  };
  assert.notEqual(writerRoot.sessions, root.sessions);
  assert.equal(Object.hasOwn(root.sessions, "sess_second"), false);

  const cloned = cloneAuthorityRoot(root);
  for (const key of ["accounts", "sessions", "profileBindings"]) {
    assert.notEqual(cloned[key], root[key], key);
  }
  assert.equal(cloned.accounts.authqa, root.accounts.authqa);
  assert.equal(cloned.sessions.sess_authqa, root.sessions.sess_authqa);
  assert.equal(cloned.profileBindings.acc_authqa, root.profileBindings.acc_authqa);
  assert.equal(Object.isFrozen(root.accounts.authqa.metadata), true);
  assert.throws(() => {
    cloned.accounts.authqa.metadata.source = "candidate";
  }, TypeError);

  cloned.accounts.authqa = {...cloned.accounts.authqa, role: "gm"};
  cloned.sessions.sess_authqa = {...cloned.sessions.sess_authqa, revokedAt: "2026-07-13T00:01:00.000Z"};
  cloned.profileBindings.acc_authqa = {...cloned.profileBindings.acc_authqa, profileRevision: 4};
  assert.equal(root.accounts.authqa.role, "player");
  assert.equal(root.sessions.sess_authqa.revokedAt, null);
  assert.equal(root.profileBindings.acc_authqa.profileRevision, 3);
});

test("identity sharing rejects generic certification, shallow freeze and mismatched keys", () => {
  const genericAccount = {
    accountId: "acc_generic",
    username: "generic",
    metadata: {mutable: true},
  };
  freezeAuthorityRootRecordValues({generic: genericAccount});
  const shallowSessionChild = {source: "mutable"};
  const shallowSession = Object.freeze({
    sessionId: "sess_shallow",
    accountId: "acc_generic",
    tokenHash: "c".repeat(64),
    expiresAt: "2026-07-20T00:00:00.000Z",
    metadata: shallowSessionChild,
  });
  const mismatchedBinding = freezeAuthorityRootIdentityRecordValues("profileBindings", {
    acc_expected: {
      accountId: "acc_wrong",
      playerId: "player_generic",
      profileRevision: 1,
    },
  }).acc_expected;
  const root = {
    accounts: {generic: genericAccount},
    sessions: {sess_shallow: shallowSession},
    profileBindings: {acc_expected: mismatchedBinding},
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
  };
  assert.equal(markAuthorityRootTrusted(root), true);

  const cloned = cloneAuthorityRoot(root);
  assert.notEqual(cloned.accounts.generic, genericAccount);
  assert.notEqual(cloned.sessions.sess_shallow, shallowSession);
  assert.notEqual(cloned.sessions.sess_shallow.metadata, shallowSessionChild);
  assert.notEqual(cloned.profileBindings.acc_expected, mismatchedBinding);
  cloned.sessions.sess_shallow.metadata.source = "candidate";
  assert.equal(shallowSessionChild.source, "mutable");
});

test("trusted roots deep-clone profile documents until the whole value is certified", () => {
  const mutableProfile = {stoneCoins: 10};
  const shallowFrozenDocument = Object.freeze({
    playerId: "player_unverified",
    profileRevision: 1,
    profile: mutableProfile,
  });
  const root = {
    profiles: {player_unverified: shallowFrozenDocument},
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
  };
  assert.equal(markAuthorityRootTrusted(root), true);

  const isolated = cloneAuthorityRoot(root);
  assert.notEqual(isolated.profiles, root.profiles);
  assert.notEqual(isolated.profiles.player_unverified, shallowFrozenDocument);
  assert.notEqual(isolated.profiles.player_unverified.profile, mutableProfile);
  isolated.profiles.player_unverified.profile.stoneCoins = 30;
  assert.equal(mutableProfile.stoneCoins, 10);

  freezeAuthorityRootRecordValues(root.profiles);
  const safelyShared = cloneAuthorityRoot(root);
  assert.notEqual(safelyShared.profiles, root.profiles);
  assert.equal(safelyShared.profiles.player_unverified, shallowFrozenDocument);
  assert.equal(Object.isFrozen(mutableProfile), true);
});

test("persistent store snapshots restore trust and reuse frozen profile documents on later clones", async () => {
  const saves = [];
  const store = {
    mode: "async:capture",
    asyncWrites: true,
    load: () => ({}),
    async save(value) {
      saves.push(value);
    },
  };
  const service = createAuthService({store});
  const created = await service.invokeDurable("register", [{
    username: "profiletrustqa",
    password: "test1234",
  }], {actionId: "profile_trust_snapshot_check"});
  assert.equal(created.ok, true);
  assert.equal(saves.length, 1);

  const saved = saves[0];
  const playerId = Object.keys(saved.profiles)[0];
  const username = Object.keys(saved.accounts)[0];
  const sessionId = Object.keys(saved.sessions)[0];
  const accountId = saved.accounts[username].accountId;
  assert.equal(isTrustedAuthorityRoot(saved), true);
  assert.equal(Object.isFrozen(saved.profiles[playerId]), true);
  assert.equal(Object.isFrozen(saved.profiles[playerId].profile), true);
  assert.equal(Object.isFrozen(saved.accounts[username]), true);
  assert.equal(Object.isFrozen(saved.sessions[sessionId]), true);
  assert.equal(Object.isFrozen(saved.profileBindings[accountId]), true);
  const recloned = cloneAuthorityRoot(saved);
  assert.notEqual(recloned.profiles, saved.profiles);
  assert.equal(recloned.profiles[playerId], saved.profiles[playerId]);
  assert.notEqual(recloned.accounts, saved.accounts);
  assert.notEqual(recloned.sessions, saved.sessions);
  assert.notEqual(recloned.profileBindings, saved.profileBindings);
  assert.equal(recloned.accounts[username], saved.accounts[username]);
  assert.equal(recloned.sessions[sessionId], saved.sessions[sessionId]);
  assert.equal(recloned.profileBindings[accountId], saved.profileBindings[accountId]);
});

test("identity writers replace frozen records without mutating older committed roots", async () => {
  const saves = [];
  let failNext = false;
  let randomByte = 1;
  const nowMs = Date.parse("2026-07-13T00:00:00.000Z");
  const store = {
    mode: "async:identity-cow-capture",
    asyncWrites: true,
    load: () => ({}),
    async save(value) {
      if (failNext) {
        failNext = false;
        throw new Error("forced identity COMMIT failure");
      }
      saves.push(value);
    },
  };
  const service = createAuthService({
    store,
    allowFullProfileSave: true,
    now: () => nowMs,
    randomId: () => "identitycow",
    randomBytes: (size) => Buffer.alloc(size, randomByte++),
  });
  const registered = await service.invokeDurable("register", [{
    username: "identitycow",
    password: "test1234",
  }], {actionId: "identity_cow_register"});
  assert.equal(registered.ok, true);
  const registrationRoot = saves.at(-1);
  const accountId = registered.account.accountId;
  const registeredSessionId = registered.session.sessionId;
  const registeredAccount = registrationRoot.accounts.identitycow;
  const registeredBinding = registrationRoot.profileBindings[accountId];
  const registeredSession = registrationRoot.sessions[registeredSessionId];

  const loggedIn = await service.invokeDurable("login", [{
    username: "identitycow",
    password: "test1234",
  }], {actionId: "identity_cow_login"});
  assert.equal(loggedIn.ok, true);
  const loginRoot = saves.at(-1);
  assert.equal(registrationRoot.accounts.identitycow, registeredAccount);
  assert.equal(registrationRoot.profileBindings[accountId], registeredBinding);
  assert.equal(registrationRoot.sessions[registeredSessionId], registeredSession);
  assert.equal(registeredSession.revokedAt, null);
  assert.notEqual(loginRoot.sessions[registeredSessionId], registeredSession);
  assert.equal(loginRoot.sessions[registeredSessionId].revokedReason, "replaced_by_login");

  const loginSession = loginRoot.sessions[loggedIn.session.sessionId];
  const refreshed = await service.invokeDurable("refreshSession", [loggedIn.session.token], {
    actionId: "identity_cow_refresh",
  });
  assert.equal(refreshed.ok, true);
  const refreshRoot = saves.at(-1);
  assert.equal(loginSession.revokedAt, null);
  assert.notEqual(refreshRoot.sessions[loggedIn.session.sessionId], loginSession);
  assert.equal(refreshRoot.sessions[loggedIn.session.sessionId].revokedReason, "session_refreshed");
  assert.equal(Object.hasOwn(refreshRoot.sessions[loggedIn.session.sessionId], "revokedCode"), false);

  const profileBefore = service.getProfile(refreshed.session.token);
  assert.equal(profileBefore.ok, true);
  const savedProfile = await service.invokeDurable("saveProfile", [refreshed.session.token, {
    expectedRevision: profileBefore.profileBinding.profileRevision,
    profile: profileBefore.profile,
  }], {actionId: "identity_cow_profile_revision"});
  assert.equal(savedProfile.ok, true);
  const profileRoot = saves.at(-1);
  assert.equal(registeredBinding.profileRevision, 0);
  assert.notEqual(profileRoot.profileBindings[accountId], registeredBinding);
  assert.equal(profileRoot.profileBindings[accountId].profileRevision, 1);

  const refreshedSession = profileRoot.sessions[refreshed.session.sessionId];
  const loggedOut = await service.invokeDurable("logout", [refreshed.session.token], {
    actionId: "identity_cow_logout",
  });
  assert.equal(loggedOut.ok, true);
  const logoutRoot = saves.at(-1);
  assert.equal(refreshedSession.revokedAt, null);
  assert.notEqual(logoutRoot.sessions[refreshed.session.sessionId], refreshedSession);
  assert.notEqual(logoutRoot.sessions[refreshed.session.sessionId].revokedAt, null);

  failNext = true;
  await assert.rejects(
    service.invokeDurable("grantGm", [{
      username: "identitycow",
      commandIds: ["gm_map"],
      policyId: "identity_cow_policy",
      expiresAt: "2026-07-14T00:00:00.000Z",
      grantedBy: "identity_cow_test",
    }], {actionId: "identity_cow_failed_gm_grant"}),
    /服务器存档暂时不可用/,
  );
  assert.equal(service.snapshot().accounts.identitycow.role, "player");
  assert.equal(logoutRoot.accounts.identitycow.role, "player");

  const granted = await service.invokeDurable("grantGm", [{
    username: "identitycow",
    commandIds: ["gm_map"],
    policyId: "identity_cow_policy",
    expiresAt: "2026-07-14T00:00:00.000Z",
    grantedBy: "identity_cow_test",
  }], {actionId: "identity_cow_gm_grant"});
  assert.equal(granted.ok, true);
  const grantRoot = saves.at(-1);
  assert.equal(logoutRoot.accounts.identitycow.role, "player");
  assert.notEqual(grantRoot.accounts.identitycow, logoutRoot.accounts.identitycow);
  assert.equal(grantRoot.accounts.identitycow.role, "gm");
});

test("trusted roots deep-clone journal entries until normalization freezes them", () => {
  const root = {
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
    serviceEvents: [{eventSeq: 1, type: "chat.message", message: {text: "mutable"}}],
  };
  assert.equal(markAuthorityRootTrusted(root), true);
  const diagnostics = authorityRootCloneDiagnostics(root);
  assert.equal(diagnostics.trusted, true);
  assert.equal(diagnostics.shared.includes("serviceEvents"), false);
  assert.equal(Object.hasOwn(diagnostics.clonedFieldBytes, "serviceEvents"), true);
  const cloned = cloneAuthorityRoot(root);
  assert.notEqual(cloned.serviceEvents, root.serviceEvents);
  assert.notEqual(cloned.serviceEvents[0], root.serviceEvents[0]);
  cloned.serviceEvents[0].message.text = "candidate";
  assert.equal(root.serviceEvents[0].message.text, "mutable");
});

test("trusted roots never share an externally shallow-frozen journal entry", () => {
  const mutableChild = {text: "source"};
  const shallowFrozenEntry = Object.freeze({
    eventSeq: 1,
    type: "chat.message",
    message: mutableChild,
  });
  const root = {
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
    serviceEvents: [shallowFrozenEntry],
  };
  assert.equal(markAuthorityRootTrusted(root), true);

  const isolated = cloneAuthorityRoot(root);
  assert.notEqual(isolated.serviceEvents[0], shallowFrozenEntry);
  isolated.serviceEvents[0].message.text = "candidate";
  assert.equal(mutableChild.text, "source");

  freezeAuthorityRootJournal(root.serviceEvents);
  assert.equal(markAuthorityRootTrusted(root), true);
  assert.equal(Object.isFrozen(mutableChild), true);
  const safelyShared = cloneAuthorityRoot(root);
  assert.equal(safelyShared.serviceEvents[0], shallowFrozenEntry);
  assert.throws(() => {
    safelyShared.serviceEvents[0].message.text = "corrupted";
  }, TypeError);
  assert.equal(mutableChild.text, "source");
});

test("trusted roots never share mutable or out-of-order service-event windows", () => {
  const first = {eventSeq: 1, type: "chat.message", message: {text: "one"}};
  const second = {eventSeq: 2, type: "chat.message", message: {text: "two"}};
  assert.equal(certifyOwnedAuthorityRootJsonValue(first), true);
  assert.equal(certifyOwnedAuthorityRootJsonValue(second), true);

  const mutableWindow = [first, second];
  const mutableRoot = {
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
    serviceEvents: mutableWindow,
  };
  assert.equal(markAuthorityRootTrusted(mutableRoot), true);
  const isolated = cloneAuthorityRoot(mutableRoot);
  assert.notEqual(isolated.serviceEvents, mutableWindow);
  isolated.serviceEvents.push({eventSeq: 3, type: "chat.message"});
  assert.equal(mutableWindow.length, 2);

  const outOfOrder = freezeAuthorityRootJournal([second, first]);
  const outOfOrderRoot = {
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
    serviceEvents: outOfOrder,
  };
  assert.equal(markAuthorityRootTrusted(outOfOrderRoot), true);
  assert.equal(authorityRootCloneDiagnostics(outOfOrderRoot).shared.includes("serviceEvents"), false);
  assert.notEqual(cloneAuthorityRoot(outOfOrderRoot).serviceEvents, outOfOrder);
});

test("owned service-event normalization canonicalizes optional fields once and restores sharing", () => {
  const raw = {
    eventSeq: 1,
    type: "party.update",
    party: {
      partyId: "party_optional_field",
      optionalLabel: undefined,
    },
  };
  const normalized = __authorityJournalNormalizersForTest.normalizeServiceEvents([raw], {owned: true});
  assert.equal(normalized.length, 1);
  assert.notEqual(normalized[0], raw);
  assert.notEqual(normalized[0].party, raw.party);
  assert.equal(Object.hasOwn(normalized[0].party, "optionalLabel"), false);
  assert.equal(isCertifiedAuthorityRootJsonValue(normalized[0]), true);
  assert.equal(Object.isFrozen(raw), true);
  assert.equal(Object.isFrozen(raw.party), true);
  assert.equal(
    __authorityJournalNormalizersForTest.normalizeServiceEvents(normalized, {owned: true}),
    normalized,
  );

  const root = {
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
    serviceEvents: normalized,
  };
  assert.equal(markAuthorityRootTrusted(root), true);
  const diagnostics = authorityRootCloneDiagnostics(root);
  assert.equal(diagnostics.shared.includes("serviceEvents"), true);
  assert.equal(Object.hasOwn(diagnostics.clonedFieldBytes, "serviceEvents"), false);
  const cloned = cloneAuthorityRoot(root);
  assert.equal(cloned.serviceEvents, root.serviceEvents);
  assert.equal(cloned.serviceEvents[0], root.serviceEvents[0]);
});

test("owned service-event normalization validates mixed certified windows end to end", () => {
  const uncertifiedFirst = {
    eventSeq: 1,
    type: "party.update",
    party: {partyId: "party_mixed", optionalLabel: undefined},
  };
  const certifiedSecond = {eventSeq: 2, type: "chat.message", message: {text: "second"}};
  assert.equal(certifyOwnedAuthorityRootJsonValue(certifiedSecond), true);

  const ordered = __authorityJournalNormalizersForTest.normalizeServiceEvents([
    uncertifiedFirst,
    certifiedSecond,
  ], {owned: true});
  assert.deepEqual(ordered.map((event) => event.eventSeq), [1, 2]);
  assert.equal(Object.hasOwn(ordered[0].party, "optionalLabel"), false);
  assert.equal(isCertifiedAuthorityRootJsonValue(ordered[0]), true);
  assert.equal(ordered[1], certifiedSecond);
  assert.equal(
    __authorityJournalNormalizersForTest.normalizeServiceEvents(ordered, {owned: true}),
    ordered,
  );

  const outOfOrder = __authorityJournalNormalizersForTest.normalizeServiceEvents([{
    eventSeq: 3,
    type: "party.update",
    party: {partyId: "party_reordered", optionalLabel: undefined},
  }, certifiedSecond], {owned: true});
  assert.deepEqual(outOfOrder.map((event) => event.eventSeq), [2, 3]);
  assert.equal(Object.hasOwn(outOfOrder[1].party, "optionalLabel"), false);
  assert.equal(outOfOrder.every(isCertifiedAuthorityRootJsonValue), true);

  const invalidCertified = {eventSeq: 0, type: ""};
  assert.equal(certifyOwnedAuthorityRootJsonValue(invalidCertified), true);
  const cleaned = __authorityJournalNormalizersForTest.normalizeServiceEvents([{
    eventSeq: 4,
    type: "chat.message",
    message: {text: "keep"},
  }, invalidCertified], {owned: true});
  assert.deepEqual(cleaned.map((event) => event.eventSeq), [4]);
  assert.equal(cleaned.every(isCertifiedAuthorityRootJsonValue), true);
});

test("owned canonical JSON can be certified in place without a second large allocation", () => {
  const value = {
    eventSeq: 1,
    type: "battle.turn_resolved",
    turn: {
      events: Array.from({length: 64}, (_, index) => ({
        sequence: index + 1,
        eventType: "damage",
        amount: index + 10,
      })),
    },
  };
  assert.equal(certifyOwnedAuthorityRootJsonValue(value), true);
  assert.equal(isCertifiedAuthorityRootJsonValue(value), true);
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.turn.events), true);
  assert.throws(() => {
    value.turn.events[0].amount = 999;
  }, TypeError);

  const nonCanonical = {eventSeq: 2, optional: undefined};
  assert.equal(certifyOwnedAuthorityRootJsonValue(nonCanonical), false);
  assert.equal(isCertifiedAuthorityRootJsonValue(nonCanonical), false);

  const sparseEvents = new Array(2);
  sparseEvents[1] = {sequence: 2, eventType: "damage", amount: 10};
  const sparse = {
    eventSeq: 3,
    type: "battle.turn_resolved",
    turn: {events: sparseEvents},
  };
  assert.equal(certifyOwnedAuthorityRootJsonValue(sparse), false);
  assert.equal(isCertifiedAuthorityRootJsonValue(sparse), false);
  assert.equal(isCertifiedAuthorityRootJsonValue(sparseEvents), false);
  assert.equal(0 in sparseEvents, false);
  assert.equal(Object.isFrozen(sparseEvents), true);
});

test("transient JSON certification freezes replay trees without weakening canonical checks", () => {
  const replayEvent = {
    eventSeq: 1,
    type: "battle.turn_resolved",
    turn: {
      events: [{eventType: "damage", amount: 37}],
      actors: [{actorId: "actor_pet_1", hp: 63}],
    },
  };
  assert.equal(certifyOwnedAuthorityRootTransientJsonValue(replayEvent), true);
  assert.equal(isCertifiedAuthorityRootJsonValue(replayEvent), true);
  assert.equal(Object.isFrozen(replayEvent), true);
  assert.equal(Object.isFrozen(replayEvent.turn), true);
  assert.equal(Object.isFrozen(replayEvent.turn.events[0]), true);
  const diagnostics = authorityRootCertificationRetentionDiagnostics([replayEvent]);
  assert.equal(diagnostics.mode, "weak_top_level_identity");
  assert.equal(diagnostics.generationLimit, 0);
  assert.equal(diagnostics.uniqueRetained.count, 0);
  assert.equal(diagnostics.uniqueRetained.jsonBytes, 0);
  assert.equal(diagnostics.activeWindowCertifiedCount, 1);
  assert.ok(diagnostics.activeWindowJsonBytes >= Buffer.byteLength(JSON.stringify(replayEvent)));
  assert.ok(diagnostics.counters.transientCertifiedValues >= 1);
  assert.equal(Object.hasOwn(diagnostics, "events"), false);

  const sparse = [];
  sparse.length = 2;
  const invalid = {eventSeq: 2, type: "battle.turn_resolved", sparse};
  assert.equal(certifyOwnedAuthorityRootTransientJsonValue(invalid), false);
  assert.equal(isCertifiedAuthorityRootJsonValue(invalid), false);
});

test("rolling replay certification keeps no strong generations beyond the active window", () => {
  const events = Array.from({length: 1_500}, (_, index) => ({
    eventSeq: index + 1,
    type: "battle.command_submitted",
    command: {actorId: `actor_${index % 20}`, round: Math.floor(index / 20) + 1},
  }));
  for (const event of events) {
    assert.equal(certifyOwnedAuthorityRootTransientJsonValue(event), true);
  }
  const activeWindow = events.slice(-500);
  const diagnostics = authorityRootCertificationRetentionDiagnostics(activeWindow);
  assert.equal(diagnostics.uniqueRetained.count, 0);
  assert.equal(diagnostics.activeWindowCount, 500);
  assert.equal(diagnostics.activeWindowCertifiedCount, 500);
  assert.equal(activeWindow.every((event) => (
    Object.isFrozen(event)
      && Object.isFrozen(event.command)
      && isCertifiedAuthorityRootJsonValue(event)
  )), true);
});

test("battle journal normalization reuses certified frozen containers", () => {
  const rawTrace = {
    traceId: "trace_normalize_keep",
    createdAt: "2026-07-13T00:00:00.000Z",
    type: "turn_resolved",
    roomId: "room_normalize_keep",
    round: "2",
    turnSeq: "3",
    participantAccountIds: [1, "acc_b", ""],
    details: {nested: {result: "原始详情"}},
    unsafeExtra: "必须清理",
  };
  const rawRecord = {
    recordId: "record_normalize_keep",
    roomId: "room_normalize_keep",
    mode: "duel",
    reason: "victory",
    participantAccountIds: [1, "acc_b", ""],
    participants: [
      {accountId: 1, username: "one", extra: "drop"},
      {accountId: "acc_b", username: "two", extra: "drop"},
    ],
    result: {winner: {accountId: 1}},
    endedAt: "2026-07-13T00:00:00.000Z",
    unsafeExtra: "必须清理",
  };
  const firstTrace = __authorityJournalNormalizersForTest.normalizeBattleTrace([
    rawTrace,
    {traceId: "trace_invalid", type: ""},
  ]);
  const firstRecords = __authorityJournalNormalizersForTest.normalizeBattleRecords([
    rawRecord,
    {recordId: "", roomId: ""},
  ]);
  assert.equal(firstTrace.length, 1);
  assert.equal(firstRecords.length, 1);
  assert.notEqual(firstTrace[0], rawTrace);
  assert.notEqual(firstRecords[0], rawRecord);
  assert.equal(Object.hasOwn(firstTrace[0], "unsafeExtra"), false);
  assert.equal(Object.hasOwn(firstRecords[0], "unsafeExtra"), false);
  assert.deepEqual(firstTrace[0].participantAccountIds, ["1", "acc_b"]);
  assert.deepEqual(firstRecords[0].participantAccountIds, ["1", "acc_b"]);
  assert.equal(Object.hasOwn(firstRecords[0].participants[0], "extra"), false);
  assert.equal(Object.isFrozen(firstTrace[0]), true);
  assert.equal(Object.isFrozen(firstTrace[0].details.nested), true);
  assert.equal(Object.isFrozen(firstRecords[0]), true);
  assert.equal(Object.isFrozen(firstRecords[0].result.winner), true);
  assert.equal(isCertifiedAuthorityRootJsonValue(firstTrace[0]), true);
  assert.equal(isCertifiedAuthorityRootJsonValue(firstRecords[0]), true);

  const secondTrace = __authorityJournalNormalizersForTest.normalizeBattleTrace(firstTrace);
  const secondRecords = __authorityJournalNormalizersForTest.normalizeBattleRecords(firstRecords);
  assert.equal(secondTrace, firstTrace);
  assert.equal(secondRecords, firstRecords);
  assert.equal(secondTrace[0], firstTrace[0]);
  assert.equal(secondRecords[0], firstRecords[0]);

  assert.equal(Object.isFrozen(secondTrace), true);
  assert.equal(Object.isFrozen(secondRecords), true);
  assert.throws(() => secondTrace.push({traceId: "candidate_only"}), TypeError);
  assert.throws(() => { secondRecords[0] = {recordId: "candidate_only"}; }, TypeError);
  const mutableTrace = secondTrace.slice();
  const mutableRecords = secondRecords.slice();
  mutableTrace.push({traceId: "candidate_only"});
  mutableRecords[0] = {recordId: "candidate_only"};
  assert.equal(firstTrace.length, 1);
  assert.equal(firstRecords[0].recordId, "record_normalize_keep");
  assert.throws(() => {
    firstTrace[0].details.nested.result = "越权改写";
  }, TypeError);
  assert.throws(() => {
    firstRecords[0].result.winner.accountId = "越权改写";
  }, TypeError);
});

test("battle journal schema markers reject manually certified and cross-journal values", () => {
  const manuallyCertifiedRecord = freezeAuthorityRootJournal([{
    recordId: "record_manual_certification",
    roomId: "room_manual_certification",
    mode: "duel",
    participantAccountIds: ["acc_a", "acc_b"],
    participants: [
      {accountId: "acc_a", username: "a", unsafeParticipantField: true},
      {accountId: "acc_b", username: "b"},
    ],
    result: {reason: "victory"},
    endedAt: "2026-07-13T00:00:00.000Z",
    unsafeExtra: "不能因为深冻而直通",
  }])[0];
  assert.equal(isCertifiedAuthorityRootJsonValue(manuallyCertifiedRecord), true);
  const cleanedRecords = __authorityJournalNormalizersForTest.normalizeBattleRecords([
    manuallyCertifiedRecord,
  ]);
  assert.equal(cleanedRecords.length, 1);
  assert.notEqual(cleanedRecords[0], manuallyCertifiedRecord);
  assert.equal(Object.hasOwn(cleanedRecords[0], "unsafeExtra"), false);
  assert.equal(Object.hasOwn(cleanedRecords[0].participants[0], "unsafeParticipantField"), false);

  const crossJournalValue = freezeAuthorityRootJournal([{
    traceId: "trace_cross_journal",
    type: "turn_resolved",
    recordId: "record_cross_journal",
    roomId: "room_cross_journal",
    mode: "duel",
    participantAccountIds: ["acc_a", "acc_b"],
    unsafeExtra: "跨journal也不能直通",
  }])[0];
  const normalizedTrace = __authorityJournalNormalizersForTest.normalizeBattleTrace([
    crossJournalValue,
  ]);
  assert.equal(normalizedTrace.length, 1);
  assert.notEqual(normalizedTrace[0], crossJournalValue);
  assert.equal(Object.hasOwn(normalizedTrace[0], "recordId"), false);
  assert.equal(Object.hasOwn(normalizedTrace[0], "unsafeExtra"), false);
  assert.deepEqual(
    __authorityJournalNormalizersForTest.normalizeBattleRecords(normalizedTrace),
    [],
  );
});

test("cyclic and non-JSON frozen values are never certified for journal sharing", () => {
  const cyclic = {};
  cyclic.self = cyclic;
  Object.freeze(cyclic);
  freezeAuthorityRootJournal([cyclic]);
  const cyclicRoot = {
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
    serviceEvents: [cyclic],
  };
  assert.equal(markAuthorityRootTrusted(cyclicRoot), true);
  assert.throws(() => cloneAuthorityRoot(cyclicRoot), TypeError);

  const nonJson = Object.freeze(new Date("2026-07-13T00:00:00.000Z"));
  freezeAuthorityRootJournal([nonJson]);
  const nonJsonRoot = {
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
    serviceEvents: [nonJson],
  };
  assert.equal(markAuthorityRootTrusted(nonJsonRoot), true);
  const cloned = cloneAuthorityRoot(nonJsonRoot);
  assert.notEqual(cloned.serviceEvents[0], nonJson);
  assert.equal(cloned.serviceEvents[0], "2026-07-13T00:00:00.000Z");
});

test("trusted journals and primitive maps share only canonical JSON primitives", () => {
  const invalidPrimitives = [undefined, Symbol("not-json"), Number.NaN, Number.POSITIVE_INFINITY];
  for (const invalid of invalidPrimitives) {
    const root = {
      consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
      mutationReceipts: canonicalDurableMutationReceipts({}),
      serviceEvents: [invalid],
      battleRoomRecoveryByAccountId: {acc_a: invalid},
    };
    assert.equal(markAuthorityRootTrusted(root), true);
    const cloned = cloneAuthorityRoot(root);
    assert.deepEqual(cloned.serviceEvents, [null]);
    if (typeof invalid === "number") {
      assert.equal(cloned.battleRoomRecoveryByAccountId.acc_a, null);
    } else {
      assert.equal(Object.hasOwn(cloned.battleRoomRecoveryByAccountId, "acc_a"), false);
    }
  }

  const bigintRoot = {
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
    serviceEvents: [1n],
  };
  assert.equal(markAuthorityRootTrusted(bigintRoot), true);
  assert.throws(() => cloneAuthorityRoot(bigintRoot), TypeError);

  const validRoot = {
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
    serviceEvents: [null, "text", true, 1.5],
    battleRoomRecoveryByAccountId: {a: null, b: "room_b", c: false, d: 2},
  };
  assert.equal(markAuthorityRootTrusted(validRoot), true);
  const validClone = cloneAuthorityRoot(validRoot);
  assert.deepEqual(validClone.serviceEvents, validRoot.serviceEvents);
  assert.deepEqual(validClone.battleRoomRecoveryByAccountId, validRoot.battleRoomRecoveryByAccountId);
});

test("trusted roots accept same-lineage staged views but reject canonical field replacement", () => {
  const originalLedger = readConsumedEquipmentEnvelopeLedger({
    eqx_trusted_identity_0001: {
      schemaVersion: 1,
      envelopeId: "eqx_trusted_identity_0001",
    },
  }).ledger;
  const originalReceipts = canonicalDurableMutationReceipts({});
  const root = {
    profiles: {},
    consumedEquipmentEnvelopes: originalLedger,
    mutationReceipts: originalReceipts,
  };
  assert.equal(markAuthorityRootTrusted(root), true);
  assert.equal(isTrustedAuthorityRoot(root), true);

  const staged = ensureConsumedEquipmentEnvelopeIds(
    originalLedger,
    "eqx_trusted_identity_0002",
  );
  assert.equal(staged.ok, true);
  root.consumedEquipmentEnvelopes = staged.ledger;
  assert.equal(isTrustedAuthorityRoot(root), true);
  assert.doesNotThrow(() => cloneAuthorityRoot(root));

  commitConsumedEquipmentEnvelopeLedger(staged.ledger);
  assert.equal(markAuthorityRootTrusted(root), true);
  root.consumedEquipmentEnvelopes = originalLedger;
  assert.equal(authorityRootTrustCompromised(root), true);
  root.consumedEquipmentEnvelopes = staged.ledger;
  assert.equal(isTrustedAuthorityRoot(root), true);

  root.mutationReceipts = canonicalDurableMutationReceipts({});
  assert.equal(authorityRootTrustCompromised(root), true);
  assert.throws(
    () => cloneAuthorityRoot(root),
    (error) => error && error.code === "authority_root_large_collection_identity_replaced",
  );
  root.mutationReceipts = originalReceipts;
  assert.equal(isTrustedAuthorityRoot(root), true);

  root.consumedEquipmentEnvelopes = readConsumedEquipmentEnvelopeLedger({}).ledger;
  assert.equal(isTrustedAuthorityRoot(root), false);
  assert.equal(authorityRootTrustCompromised(root), true);
  assert.throws(
    () => cloneAuthorityRoot(root),
    (error) => error && error.code === "authority_root_large_collection_identity_replaced",
  );
});

test("trusted roots share only same-lineage immutable mail views", () => {
  const mail = {
    mailId: "mail_trusted_0001",
    senderAccountId: "system_test",
    recipientAccountId: "acc_trusted_mail",
    title: "可信邮件",
    body: "只允许通过 touched-row 视图修改。",
    items: [],
    createdAt: "2026-07-16T00:00:00.000Z",
    readAt: null,
    schemaVersion: 1,
  };
  const baseline = readMailAuthorityState({[mail.mailId]: mail}).messages;
  const root = {
    profiles: {},
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
    mailMessages: baseline,
  };
  assert.equal(markAuthorityRootTrusted(root), true);

  const cloned = cloneAuthorityRoot(root);
  assert.equal(cloned.mailMessages, baseline);
  assert.throws(() => {
    cloned.mailMessages[mail.mailId] = {...mail, title: "直接篡改"};
  }, TypeError);

  const staged = stageMailAuthorityUpsert(cloned.mailMessages, {
    ...mail,
    readAt: "2026-07-16T00:01:00.000Z",
  });
  assert.equal(staged.ok, true);
  cloned.mailMessages = staged.messages;
  assert.equal(isTrustedAuthorityRoot(cloned), true);
  assert.equal(root.mailMessages[mail.mailId].readAt, null);
  commitMailAuthorityDelta(cloned.mailMessages);
  assert.equal(cloned.mailMessages[mail.mailId].readAt, "2026-07-16T00:01:00.000Z");

  cloned.mailMessages = readMailAuthorityState({[mail.mailId]: mail}).messages;
  assert.equal(authorityRootTrustCompromised(cloned), true);
  assert.throws(
    () => cloneAuthorityRoot(cloned),
    (error) => error && error.code === "authority_root_large_collection_identity_replaced",
  );
});

test("backup and migration materialization produces complete structured-cloneable buckets", () => {
  const baseline = readConsumedEquipmentEnvelopeLedger({
    eqx_materialize_ledger_0001: {schemaVersion: 1, envelopeId: "eqx_materialize_ledger_0001"},
  }).ledger;
  const staged = ensureConsumedEquipmentEnvelopeIds(baseline, "eqx_materialize_ledger_0002");
  const root = {
    profiles: {player_a: {profile: {name: "物化档案"}}},
    consumedEquipmentEnvelopes: staged.ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
    mailMessages: stageMailAuthorityUpsert(
      readMailAuthorityState({}).messages,
      {
        mailId: "mail_materialize_0001",
        senderAccountId: "system_test",
        recipientAccountId: "acc_materialize",
        title: "物化邮件",
        body: "必须导出为普通对象。",
        items: [],
        createdAt: "2026-07-16T00:00:00.000Z",
        readAt: null,
        schemaVersion: 1,
      },
    ).messages,
  };
  markAuthorityRootTrusted(root);
  const materialized = materializeAuthorityRootLargeCollections(root);
  assert.doesNotThrow(() => structuredClone(materialized));
  assert.deepEqual(Object.keys(materialized.consumedEquipmentEnvelopes), [
    "eqx_materialize_ledger_0001",
    "eqx_materialize_ledger_0002",
  ]);
  assert.deepEqual(materialized.mutationReceipts, {});
  assert.deepEqual(Object.keys(materialized.mailMessages), ["mail_materialize_0001"]);
  assert.equal(isTrustedAuthorityRoot(materialized), false);
});

test("trusted receipt views cannot drop pending rows or roll back to an older revision", () => {
  const receipts = canonicalDurableMutationReceipts({});
  const root = {
    profiles: {},
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: receipts,
  };
  markAuthorityRootTrusted(root);
  const staged = stageDurableMutationReceipt(receipts, {
    schemaVersion: 1,
    operationId: "operation_trusted_receipt_0001",
    requestHash: "a".repeat(64),
    actionId: "bank.deposit",
    accountId: "acc_trusted_receipt",
    committedAt: "2026-07-12T00:00:00.000Z",
    expiresAt: "2026-07-15T00:00:00.000Z",
    response: {ok: true},
  }, {nowMs: Date.parse("2026-07-12T00:00:00.000Z")});
  root.mutationReceipts = staged;
  assert.equal(isTrustedAuthorityRoot(root), true);
  markAuthorityRootTrusted(root);

  root.mutationReceipts = receipts;
  assert.equal(authorityRootTrustCompromised(root), true);
  root.mutationReceipts = staged;
  assert.equal(isTrustedAuthorityRoot(root), true);

  commitDurableMutationReceiptDelta(staged);
  markAuthorityRootTrusted(root);
  root.mutationReceipts = receipts;
  assert.equal(authorityRootTrustCompromised(root), true);
});
