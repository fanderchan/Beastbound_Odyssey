"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
  battleProfile,
} = require("../test-support/auth-service-test-context");
const {
  canonicalDurableMutationReceipts,
  durableMutationReceiptCount,
} = require("../src/auth/durable-mutation-state");
const {
  consumedEquipmentEnvelopeLedgerCount,
  readConsumedEquipmentEnvelopeLedger,
} = require("../src/auth/equipment-envelope-consumed-ledger");

function createObservedMemoryStore(initialData = null) {
  const memoryStore = createMemoryAuthStore(initialData);
  const counts = {loads: 0, saves: 0, transactions: 0};
  return {
    counts,
    mode: "memory",
    load() {
      counts.loads += 1;
      return memoryStore.load();
    },
    save(nextData) {
      counts.saves += 1;
      memoryStore.save(nextData);
    },
  };
}

function profileWithCurrency(name, stoneCoins, bankStoneCoins) {
  const profile = battleProfile(name, {
    level: 12,
    hp: 140,
    maxHp: 140,
    attack: 24,
    defense: 10,
    quick: 72,
  }, {
    petId: `capacity_pet_${stoneCoins}`,
    name: "容量测试宠",
    level: 12,
    hp: 100,
    maxHp: 100,
    attack: 18,
    defense: 8,
    quick: 60,
  });
  profile.stoneCoins = stoneCoins;
  profile.bank = {
    stoneCoins: bankStoneCoins,
    items: [],
    schemaVersion: 1,
  };
  profile.capacityTestSecret = "must-not-leak";
  return profile;
}

test("capacity reconciliation projects only whitelisted authority fields without read side effects", () => {
  const store = createObservedMemoryStore();
  const service = createAuthService({store});
  const leader = service.register({username: "capacityviewa", password: "test1234", displayName: "容量甲"});
  const member = service.register({username: "capacityviewb", password: "test1234", displayName: "容量乙"});
  const outsider = service.register({username: "capacityviewc", password: "test1234", displayName: "容量丙"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(outsider.ok, true);
  assert.equal(service.saveProfile(leader.session.token, {
    expectedRevision: 0,
    profile: profileWithCurrency("容量甲", 1234, 5678),
  }).ok, true);
  assert.equal(service.saveProfile(member.session.token, {
    expectedRevision: 0,
    profile: profileWithCurrency("容量乙", 2345, 6789),
  }).ok, true);

  const invite = service.inviteToParty(leader.session.token, {username: member.account.username});
  assert.equal(invite.ok, true);
  const accepted = service.acceptPartyInvite(member.session.token, invite.invite.inviteId);
  assert.equal(accepted.ok, true);
  const encounter = service.startPartyEncounter(leader.session.token, {
    enemyCount: 1,
    encounterZone: {
      id: "capacity_reconciliation_grass",
      name: "容量对账草丛",
      selectedWildPet: {
        formId: "wuli_normal_orange_fire10",
        name: "容量乌力",
        level: 1,
        battleStats: {maxHp: 10, attack: 2, defense: 1, quick: 1},
      },
    },
  });
  assert.equal(encounter.ok, true);

  let emittedEvents = 0;
  const unsubscribe = service.onEvent(() => {
    emittedEvents += 1;
  });
  const storeBefore = {...store.counts};
  const durableBefore = service.durableMutationMetrics();
  const missingAccountId = "acc_capacity_view_missing";
  const requestedAccountIds = [
    leader.account.accountId,
    member.account.accountId,
    leader.account.accountId,
    missingAccountId,
    "",
    null,
  ];
  const view = service._capacityReconciliationView(requestedAccountIds);
  const durableAfter = service.durableMutationMetrics();
  unsubscribe();

  assert.deepEqual(Object.keys(view).sort(), ["battleRooms", "parties", "profiles"]);
  assert.deepEqual(Object.keys(view.profiles).sort(), [
    leader.account.accountId,
    member.account.accountId,
    missingAccountId,
  ].sort());
  assert.deepEqual(view.profiles[leader.account.accountId], {
    playerId: leader.profileBinding.playerId,
    stoneCoins: 1234,
    bankStoneCoins: 5678,
  });
  assert.deepEqual(view.profiles[member.account.accountId], {
    playerId: member.profileBinding.playerId,
    stoneCoins: 2345,
    bankStoneCoins: 6789,
  });
  assert.deepEqual(view.profiles[missingAccountId], {
    playerId: "",
    stoneCoins: 0,
    bankStoneCoins: 0,
  });
  for (const profile of Object.values(view.profiles)) {
    assert.deepEqual(Object.keys(profile).sort(), ["bankStoneCoins", "playerId", "stoneCoins"]);
  }

  assert.deepEqual(Object.keys(view.parties), [accepted.party.partyId]);
  const projectedParty = view.parties[accepted.party.partyId];
  assert.deepEqual(Object.keys(projectedParty).sort(), ["leaderAccountId", "memberAccountIds", "partyId"]);
  assert.equal(projectedParty.leaderAccountId, leader.account.accountId);
  assert.deepEqual(projectedParty.memberAccountIds, [leader.account.accountId, member.account.accountId]);

  assert.deepEqual(Object.keys(view.battleRooms), [encounter.room.roomId]);
  const projectedRoom = view.battleRooms[encounter.room.roomId];
  assert.deepEqual(Object.keys(projectedRoom).sort(), ["actors", "roomId", "status"]);
  assert.equal(projectedRoom.status, "ready");
  assert.equal(projectedRoom.actors.length > 0, true);
  for (const actor of projectedRoom.actors) {
    assert.deepEqual(Object.keys(actor).sort(), ["accountId", "kind", "side"]);
  }
  assert.equal(projectedRoom.actors.some((actor) => actor.kind === "player"), true);
  assert.equal(projectedRoom.actors.some((actor) => actor.kind === "pet"), true);

  const serialized = JSON.stringify(view);
  for (const forbidden of [
    "passwordHash",
    "passwordSalt",
    leader.session.token,
    "capacityTestSecret",
    "backpackSlots",
    "privateSeed",
    "displayName",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(Object.hasOwn(view.profiles, outsider.account.accountId), false);
  assert.deepEqual(store.counts, storeBefore);
  assert.deepEqual(service.durableMutationMetrics(), durableBefore);
  assert.deepEqual(durableAfter, durableBefore);
  assert.equal(emittedEvents, 0);

  const expectedFreshView = structuredClone(view);
  view.profiles[leader.account.accountId].stoneCoins = -1;
  view.profiles[leader.account.accountId].playerId = "caller_corrupted_player";
  view.parties[accepted.party.partyId].memberAccountIds.push("acc_caller_corruption");
  view.battleRooms[encounter.room.roomId].actors[0].side = "caller_corrupted_side";
  delete view.battleRooms[encounter.room.roomId];
  assert.deepEqual(service._capacityReconciliationView(requestedAccountIds), expectedFreshView);
});

function largeEquipmentLedger(count) {
  const raw = Object.create(null);
  for (let index = 0; index < count; index += 1) {
    const envelopeId = `eqx_capacity_${String(index).padStart(6, "0")}`;
    raw[envelopeId] = {schemaVersion: 1, envelopeId};
  }
  const read = readConsumedEquipmentEnvelopeLedger(raw);
  assert.equal(read.ok, true);
  return read.ledger;
}

function largeDurableReceiptLedger(count) {
  const raw = Object.create(null);
  const committedAt = "2026-01-01T00:00:00.000Z";
  const expiresAt = "2026-01-04T00:00:00.000Z";
  for (let index = 0; index < count; index += 1) {
    const operationId = `operation_capacity_${String(index).padStart(5, "0")}`;
    raw[operationId] = {
      schemaVersion: 1,
      operationId,
      requestHash: "a".repeat(64),
      actionId: "capacity_reconciliation_test",
      accountId: "acc_capacity_large",
      committedAt,
      expiresAt,
      response: {ok: true},
    };
  }
  return canonicalDurableMutationReceipts(raw);
}

test("capacity reconciliation never snapshots or serializes 100k tombstones and 20k receipts", () => {
  const consumedEquipmentEnvelopes = largeEquipmentLedger(100_000);
  const mutationReceipts = largeDurableReceiptLedger(20_000);
  assert.equal(consumedEquipmentEnvelopeLedgerCount(consumedEquipmentEnvelopes), 100_000);
  assert.equal(durableMutationReceiptCount(mutationReceipts), 20_000);

  const source = {
    schemaVersion: 1,
    profileBindings: {
      acc_capacity_large: {accountId: "acc_capacity_large", playerId: "player_capacity_large"},
    },
    profiles: {
      player_capacity_large: {
        playerId: "player_capacity_large",
        profileRevision: 1,
        profile: {stoneCoins: 991, bank: {stoneCoins: 77}},
      },
    },
    consumedEquipmentEnvelopes,
    mutationReceipts,
  };
  const counts = {loads: 0, saves: 0, transactions: 0};
  const store = {
    mode: "async:capacity-reconciliation-observer",
    asyncWrites: true,
    load() {
      counts.loads += 1;
      return source;
    },
    save() {
      counts.saves += 1;
      counts.transactions += 1;
      throw new Error("capacity reconciliation must not save");
    },
  };
  const service = createAuthService({store});
  const accountIds = ["acc_capacity_large"];
  const warmView = service._capacityReconciliationView(accountIds);
  assert.deepEqual(warmView.profiles.acc_capacity_large, {
    playerId: "player_capacity_large",
    stoneCoins: 991,
    bankStoneCoins: 77,
  });

  const countsBefore = {...counts};
  const durableBefore = service.durableMutationMetrics();
  const originalSnapshot = service.snapshot;
  const originalStringify = JSON.stringify;
  let snapshotCalls = 0;
  let stringifyCalls = 0;
  service.snapshot = (...args) => {
    snapshotCalls += 1;
    return originalSnapshot(...args);
  };
  JSON.stringify = (...args) => {
    stringifyCalls += 1;
    return originalStringify(...args);
  };
  let repeatedView;
  try {
    for (let index = 0; index < 4; index += 1) {
      repeatedView = service._capacityReconciliationView(accountIds);
    }
  } finally {
    JSON.stringify = originalStringify;
    service.snapshot = originalSnapshot;
  }

  assert.deepEqual(repeatedView, warmView);
  assert.equal(snapshotCalls, 0);
  assert.equal(stringifyCalls, 0);
  assert.deepEqual(counts, countsBefore);
  assert.deepEqual(service.durableMutationMetrics(), durableBefore);
  assert.equal(JSON.stringify(repeatedView).length < 512, true);
});
