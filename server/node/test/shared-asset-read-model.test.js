"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applySharedAssetReadView,
  assertSharedAssetReadViewMatchesRequest,
  compareCanonicalIds,
} = require("../src/auth/shared-asset-read-model");
const {
  cloneAuthorityRoot,
  isTrustedAuthorityRoot,
  markAuthorityRootTrusted,
} = require("../src/auth/authority-root-clone");
const {
  readConsumedEquipmentEnvelopeLedgerIndex,
} = require("../src/auth/equipment-envelope-consumed-ledger");
const {
  canonicalDurableMutationReceipts,
} = require("../src/auth/durable-mutation-state");

function ledger(ids = []) {
  const raw = {};
  for (const envelopeId of ids) {
    raw[envelopeId] = {schemaVersion: 1, envelopeId};
  }
  const read = readConsumedEquipmentEnvelopeLedgerIndex(raw);
  assert.equal(read.ok, true, JSON.stringify(read));
  return read.ledger;
}

function baseline() {
  return {
    schemaVersion: 1,
    accounts: {
      alpha: {accountId: "acc_a", username: "alpha"},
      beta: {accountId: "acc_b", username: "beta"},
    },
    profileBindings: {
      acc_a: {accountId: "acc_a", playerId: "player_a", profileRevision: 1},
      acc_b: {accountId: "acc_b", playerId: "player_b", profileRevision: 1},
    },
    profiles: {
      player_a: {playerId: "player_a", accountId: "acc_a", profileRevision: 1, profile: {}},
      player_b: {playerId: "player_b", accountId: "acc_b", profileRevision: 1, profile: {}},
    },
    marketListings: {
      listing_old: {listingId: "listing_old", sellerAccountId: "acc_a"},
    },
    mailMessages: {
      mail_a_old: {mailId: "mail_a_old", recipientAccountId: "acc_a"},
      mail_b_keep: {mailId: "mail_b_keep", recipientAccountId: "acc_b"},
    },
    marketConfig: {defaultTaxBps: 500},
    mutationReceipts: canonicalDurableMutationReceipts({}),
    consumedEquipmentEnvelopes: ledger(["eqx_existing_0001"]),
  };
}

function replacement(keys, values) {
  return {keys, values};
}

test("market view atomically replaces the complete market book and exact actor resources", () => {
  const source = baseline();
  const result = applySharedAssetReadView(source, {
    schemaVersion: 1,
    scope: "market_mutation",
    accountId: "acc_a",
    includeProfileMailPartitions: true,
    accounts: replacement(["acc_a", "acc_b"], {
      acc_a: {accountId: "acc_a", username: "alpha_new"},
      acc_b: {accountId: "acc_b", username: "beta"},
    }),
    profileBindings: replacement(["acc_a", "acc_b"], {
      acc_a: {accountId: "acc_a", playerId: "player_a", profileRevision: 2},
      acc_b: {accountId: "acc_b", playerId: "player_b", profileRevision: 1},
    }),
    profiles: replacement(["player_a", "player_b"], {
      player_a: {playerId: "player_a", accountId: "acc_a", profileRevision: 2, profile: {}},
      player_b: {playerId: "player_b", accountId: "acc_b", profileRevision: 1, profile: {}},
    }),
    marketListings: {
      listing_new: {
        listingId: "listing_new",
        sellerAccountId: "acc_b",
        equipmentEnvelope: {
          envelopeId: "eqx_remote_0002",
          instanceState: {
            transferProvenance: {originEnvelopeId: "eqx_prior_remote_0001"},
          },
        },
      },
    },
    marketConfig: {defaultTaxBps: 300},
    mailPartitions: [
      {
        recipientAccountId: "acc_a",
        messages: {
          mail_a_old: {mailId: "mail_a_old", recipientAccountId: "acc_a"},
        },
      },
      {
        recipientAccountId: "acc_b",
        messages: {
          mail_b_keep: {mailId: "mail_b_keep", recipientAccountId: "acc_b"},
        },
      },
    ],
    consumedEquipmentEnvelopeIds: ["eqx_prior_remote_0001", "eqx_remote_0002"],
  });

  assert.deepEqual(Object.keys(result.marketListings), ["listing_new"]);
  assert.equal(Object.hasOwn(result.accounts, "alpha"), false);
  assert.equal(result.accounts.alpha_new.accountId, "acc_a");
  assert.equal(result.profileBindings.acc_a.profileRevision, 2);
  assert.equal(result.marketConfig.defaultTaxBps, 300);
  assert.equal(Object.hasOwn(result.consumedEquipmentEnvelopes, "eqx_prior_remote_0001"), true);
  assert.equal(Object.hasOwn(result.consumedEquipmentEnvelopes, "eqx_remote_0002"), true);
  assert.equal(Object.hasOwn(source.consumedEquipmentEnvelopes, "eqx_remote_0002"), false);
  assert.deepEqual(result.mailMessages, source.mailMessages);
  assert.deepEqual(source.marketListings, {
    listing_old: {listingId: "listing_old", sellerAccountId: "acc_a"},
  });
});

test("mail mark-read view replaces only its authenticated target row", () => {
  const request = {
    schemaVersion: 1,
    scope: "mail_mark_read",
    accountId: "acc_a",
    mailId: "mail_a_old",
    includeProfileMailPartitions: false,
  };
  const view = {
    schemaVersion: 1,
    scope: "mail_mark_read",
    accountId: "acc_a",
    targetMailId: "mail_a_old",
    includeProfileMailPartitions: false,
    accounts: replacement(["acc_a"], {
      acc_a: {accountId: "acc_a", username: "alpha"},
    }),
    profileBindings: replacement([], {}),
    profiles: replacement([], {}),
    marketListings: null,
    marketConfig: null,
    mailRows: replacement(["mail_a_old"], {
      mail_a_old: {
        mailId: "mail_a_old",
        recipientAccountId: "acc_a",
        readAt: "2026-07-16T08:00:00.000Z",
      },
    }),
    mailPartitions: [],
    consumedEquipmentEnvelopeIds: [],
  };

  assert.equal(assertSharedAssetReadViewMatchesRequest(view, request), true);
  const updated = applySharedAssetReadView(baseline(), view);
  assert.equal(updated.mailMessages.mail_a_old.readAt, "2026-07-16T08:00:00.000Z");
  assert.equal(updated.mailMessages.mail_b_keep.recipientAccountId, "acc_b");

  const missing = applySharedAssetReadView(updated, {
    ...view,
    mailRows: replacement(["mail_a_old"], {}),
  });
  assert.equal(Object.hasOwn(missing.mailMessages, "mail_a_old"), false);
  assert.equal(Object.hasOwn(missing.mailMessages, "mail_b_keep"), true);

  assert.throws(() => applySharedAssetReadView(baseline(), {
    ...view,
    mailRows: replacement(["mail_a_old"], {
      mail_a_old: {mailId: "mail_a_old", recipientAccountId: "acc_b"},
    }),
  }), (error) => error
    && error.code === "shared_asset_read_view_invalid"
    && error.reason === "mail_rows");
  assert.throws(() => assertSharedAssetReadViewMatchesRequest(view, {
    ...request,
    mailId: "mail_other",
  }), (error) => error
    && error.code === "shared_asset_read_view_invalid"
    && error.reason === "request_identity");
});

test("market mutation view is bound to the requested listing actor and seller partitions", () => {
  const actorOnly = {
    schemaVersion: 1,
    scope: "market_mutation",
    accountId: "acc_a",
    includeProfileMailPartitions: true,
    accounts: replacement(["acc_a", "acc_b"], {
      acc_a: {accountId: "acc_a", username: "alpha"},
      acc_b: {accountId: "acc_b", username: "beta"},
    }),
    profileBindings: replacement(["acc_a"], {
      acc_a: {accountId: "acc_a", playerId: "player_a", profileRevision: 1},
    }),
    profiles: replacement(["player_a"], {
      player_a: {
        playerId: "player_a",
        accountId: "acc_a",
        profileRevision: 1,
        profile: {},
      },
    }),
    marketListings: {
      listing_target: {listingId: "listing_target", sellerAccountId: "acc_b"},
    },
    marketConfig: {defaultTaxBps: 500},
    mailPartitions: [{recipientAccountId: "acc_a", messages: {}}],
    consumedEquipmentEnvelopeIds: [],
  };

  assert.throws(() => assertSharedAssetReadViewMatchesRequest(actorOnly, {
    scope: "market_mutation",
    accountId: "acc_a",
    listingId: "listing_target",
    includeProfileMailPartitions: true,
  }), (error) => error
    && error.code === "shared_asset_read_view_invalid"
    && error.reason === "request_identity");
  assert.throws(() => applySharedAssetReadView(baseline(), {
    ...actorOnly,
    profileBindings: replacement([], {}),
    profiles: replacement([], {}),
    mailPartitions: [],
  }), (error) => error
    && error.code === "shared_asset_read_view_invalid"
    && error.reason === "market_profile_bindings.keys");

  const complete = {
    ...actorOnly,
    profileBindings: replacement(["acc_a", "acc_b"], {
      acc_a: {accountId: "acc_a", playerId: "player_a", profileRevision: 1},
      acc_b: {accountId: "acc_b", playerId: "player_b", profileRevision: 1},
    }),
    profiles: replacement(["player_a", "player_b"], {
      player_a: {
        playerId: "player_a",
        accountId: "acc_a",
        profileRevision: 1,
        profile: {},
      },
      player_b: {
        playerId: "player_b",
        accountId: "acc_b",
        profileRevision: 1,
        profile: {},
      },
    }),
    mailPartitions: [
      {recipientAccountId: "acc_a", messages: {}},
      {recipientAccountId: "acc_b", messages: {}},
    ],
  };
  assert.equal(assertSharedAssetReadViewMatchesRequest(complete, {
    scope: "market_mutation",
    accountId: "acc_a",
    listingId: "listing_target",
    includeProfileMailPartitions: true,
  }), true);
});

test("equipment ownership view binds one actor profile to its mail, market and tombstones", () => {
  const source = baseline();
  const originEnvelopeId = "eqx_bank_origin_0001";
  const view = {
    schemaVersion: 1,
    scope: "equipment_ownership",
    accountId: "acc_a",
    includeProfileMailPartitions: true,
    accounts: replacement(["acc_a", "acc_b"], {
      acc_a: {accountId: "acc_a", username: "alpha"},
      acc_b: {accountId: "acc_b", username: "beta"},
    }),
    profileBindings: replacement(["acc_a"], {
      acc_a: {accountId: "acc_a", playerId: "player_a", profileRevision: 2},
    }),
    profiles: replacement(["player_a"], {
      player_a: {
        playerId: "player_a",
        accountId: "acc_a",
        profileRevision: 2,
        profile: {
          equipmentInstances: {
            equip_bank_remote: {
              instanceId: "equip_bank_remote",
              transferProvenance: {originEnvelopeId},
            },
          },
        },
      },
    }),
    marketListings: {
      listing_remote: {
        listingId: "listing_remote",
        sellerAccountId: "acc_b",
      },
    },
    marketConfig: {defaultTaxBps: 300},
    mailPartitions: [{
      recipientAccountId: "acc_a",
      messages: {},
    }],
    consumedEquipmentEnvelopeIds: [originEnvelopeId],
  };
  const request = {
    schemaVersion: 1,
    scope: "equipment_ownership",
    accountId: "acc_a",
    includeProfileMailPartitions: true,
  };

  assert.equal(assertSharedAssetReadViewMatchesRequest(view, request), true);
  const applied = applySharedAssetReadView(source, view);
  assert.equal(applied.profileBindings.acc_a.profileRevision, 2);
  assert.equal(Object.hasOwn(applied.mailMessages, "mail_a_old"), false);
  assert.equal(Object.hasOwn(applied.mailMessages, "mail_b_keep"), true);
  assert.deepEqual(Object.keys(applied.marketListings), ["listing_remote"]);
  assert.equal(Object.hasOwn(applied.consumedEquipmentEnvelopes, originEnvelopeId), true);

  assert.throws(() => applySharedAssetReadView(source, {
    ...view,
    includeProfileMailPartitions: false,
    mailPartitions: [],
  }), (error) => error
    && error.code === "shared_asset_read_view_invalid"
    && error.reason === "mail_partitions");
  assert.throws(() => applySharedAssetReadView(source, {
    ...view,
    profileBindings: replacement(["acc_a", "acc_b"], {
      ...view.profileBindings.values,
      acc_b: {accountId: "acc_b", playerId: "player_b", profileRevision: 1},
    }),
    profiles: replacement(["player_a", "player_b"], {
      ...view.profiles.values,
      player_b: {
        playerId: "player_b",
        accountId: "acc_b",
        profileRevision: 1,
        profile: {},
      },
    }),
  }), (error) => error
    && error.code === "shared_asset_read_view_invalid"
    && error.reason === "market_profile_bindings.keys");
});

test("trusted roots stage database-confirmed tombstones on the current lineage", () => {
  const source = baseline();
  assert.equal(markAuthorityRootTrusted(source), true);
  const result = applySharedAssetReadView(source, {
    schemaVersion: 1,
    scope: "mail_read",
    accountId: "acc_a",
    includeProfileMailPartitions: true,
    accounts: replacement(["acc_a"], {
      acc_a: {accountId: "acc_a", username: "alpha"},
    }),
    profileBindings: replacement(["acc_a"], {
      acc_a: {accountId: "acc_a", playerId: "player_a", profileRevision: 1},
    }),
    profiles: replacement(["player_a"], {
      player_a: {
        playerId: "player_a",
        accountId: "acc_a",
        profileRevision: 1,
        profile: {
          equipmentInstances: {
            equip_remote_0002: {
              transferProvenance: {originEnvelopeId: "eqx_remote_0002"},
            },
          },
        },
      },
    }),
    marketListings: null,
    marketConfig: null,
    mailPartitions: [{recipientAccountId: "acc_a", messages: {}}],
    consumedEquipmentEnvelopeIds: ["eqx_remote_0002"],
  });

  assert.equal(isTrustedAuthorityRoot(source), true);
  assert.equal(isTrustedAuthorityRoot(result), true);
  assert.notEqual(result.consumedEquipmentEnvelopes, source.consumedEquipmentEnvelopes);
  assert.equal(Object.hasOwn(result.consumedEquipmentEnvelopes, "eqx_remote_0002"), true);
  assert.equal(Object.hasOwn(source.consumedEquipmentEnvelopes, "eqx_remote_0002"), false);
  assert.doesNotThrow(() => cloneAuthorityRoot(result));
});

test("mail view replaces only the certified recipient partition", () => {
  const source = baseline();
  const result = applySharedAssetReadView(source, {
    schemaVersion: 1,
    scope: "mail_read",
    accountId: "acc_a",
    includeProfileMailPartitions: true,
    accounts: replacement(["acc_a"], {
      acc_a: {accountId: "acc_a", username: "alpha"},
    }),
    profileBindings: replacement(["acc_a"], {
      acc_a: {accountId: "acc_a", playerId: "player_a", profileRevision: 1},
    }),
    profiles: replacement(["player_a"], {
      player_a: {playerId: "player_a", accountId: "acc_a", profileRevision: 1, profile: {}},
    }),
    marketListings: null,
    marketConfig: null,
    mailPartitions: [{
      recipientAccountId: "acc_a",
      messages: {
        mail_a_new: {mailId: "mail_a_new", recipientAccountId: "acc_a"},
      },
    }],
    consumedEquipmentEnvelopeIds: [],
  });

  assert.equal(Object.hasOwn(result.mailMessages, "mail_a_old"), false);
  assert.equal(Object.hasOwn(result.mailMessages, "mail_a_new"), true);
  assert.equal(Object.hasOwn(result.mailMessages, "mail_b_keep"), true);
});

test("separate applications isolate immutable mail and mutable market documents", () => {
  const mailView = {
    schemaVersion: 1,
    scope: "mail_read",
    accountId: "acc_a",
    includeProfileMailPartitions: true,
    accounts: replacement(["acc_a"], {
      acc_a: {accountId: "acc_a", username: "alpha"},
    }),
    profileBindings: replacement([], {}),
    profiles: replacement([], {}),
    marketListings: null,
    marketConfig: null,
    mailPartitions: [{
      recipientAccountId: "acc_a",
      messages: {
        mail_alias: {
          mailId: "mail_alias",
          recipientAccountId: "acc_a",
          items: [{itemId: "item_meat_small", count: 2}],
          readAt: null,
        },
      },
    }],
    consumedEquipmentEnvelopeIds: [],
  };
  const mailA = applySharedAssetReadView(baseline(), mailView);
  const mailB = applySharedAssetReadView(baseline(), mailView);
  assert.notEqual(mailA.mailMessages.mail_alias, mailB.mailMessages.mail_alias);
  assert.notEqual(mailA.mailMessages.mail_alias, mailView.mailPartitions[0].messages.mail_alias);
  assert.throws(() => {
    mailB.mailMessages.mail_alias.readAt = "2026-07-14T10:00:00.000Z";
  }, TypeError);
  assert.throws(() => {
    mailB.mailMessages.mail_alias.items[0].count = 1;
  }, TypeError);
  assert.equal(mailA.mailMessages.mail_alias.readAt, null);
  assert.equal(mailA.mailMessages.mail_alias.items[0].count, 2);
  assert.equal(mailView.mailPartitions[0].messages.mail_alias.items[0].count, 2);

  const marketView = {
    ...mailView,
    scope: "market_read",
    includeProfileMailPartitions: false,
    profileBindings: replacement(["acc_a"], {
      acc_a: {accountId: "acc_a", playerId: "player_a", profileRevision: 1},
    }),
    profiles: replacement(["player_a"], {
      player_a: {
        playerId: "player_a",
        accountId: "acc_a",
        profileRevision: 1,
        profile: {},
      },
    }),
    marketListings: {
      listing_alias: {
        listingId: "listing_alias",
        sellerAccountId: "acc_a",
        equipmentEnvelope: {
          envelopeId: "eqx_market_alias_0001",
          instanceState: {durability: 20},
        },
      },
    },
    marketConfig: {defaultTaxBps: 500},
    mailPartitions: [],
  };
  const marketA = applySharedAssetReadView(baseline(), marketView);
  const marketB = applySharedAssetReadView(baseline(), marketView);
  assert.notEqual(marketA.marketListings.listing_alias, marketB.marketListings.listing_alias);
  assert.notEqual(
    marketA.marketListings.listing_alias.equipmentEnvelope,
    marketView.marketListings.listing_alias.equipmentEnvelope,
  );
  marketB.marketListings.listing_alias.equipmentEnvelope.instanceState.durability = 1;
  assert.equal(marketA.marketListings.listing_alias.equipmentEnvelope.instanceState.durability, 20);
  assert.equal(marketView.marketListings.listing_alias.equipmentEnvelope.instanceState.durability, 20);
});

test("view certifier rejects unordered keys, wrong recipient partitions, and extra replacements", () => {
  const source = baseline();
  const valid = {
    schemaVersion: 1,
    scope: "mail_read",
    accountId: "acc_a",
    includeProfileMailPartitions: true,
    accounts: replacement(["acc_a"], {acc_a: {accountId: "acc_a", username: "alpha"}}),
    profileBindings: replacement([], {}),
    profiles: replacement([], {}),
    marketListings: null,
    marketConfig: null,
    mailPartitions: [{recipientAccountId: "acc_a", messages: {}}],
    consumedEquipmentEnvelopeIds: [],
  };

  assert.throws(() => applySharedAssetReadView(source, {
    ...valid,
    accounts: replacement(["acc_a"], {
      acc_b: {accountId: "acc_b"},
      acc_a: {accountId: "acc_a"},
    }),
  }), (error) => error && error.code === "shared_asset_read_view_invalid");
  assert.throws(() => applySharedAssetReadView(source, {
    ...valid,
    mailPartitions: [
      ...valid.mailPartitions,
      {recipientAccountId: "acc_b", messages: {}},
    ],
  }), (error) => error && error.code === "shared_asset_read_view_invalid");
  assert.throws(() => applySharedAssetReadView(source, {
    ...valid,
    mailPartitions: [{
      recipientAccountId: "acc_a",
      messages: {mail_wrong: {mailId: "mail_wrong", recipientAccountId: "acc_b"}},
    }],
  }), (error) => error && error.code === "shared_asset_read_view_invalid");
  assert.throws(() => applySharedAssetReadView(source, {
    ...valid,
    profileBindings: replacement(["acc_b", "acc_a"], {
      acc_a: {accountId: "acc_a"},
      acc_b: {accountId: "acc_b"},
    }),
  }), (error) => error && error.code === "shared_asset_read_view_invalid");
  assert.throws(() => applySharedAssetReadView(source, {
    ...valid,
    consumedEquipmentEnvelopeIds: ["eqx_z_remote_0002", "eqx_a_remote_0001"],
  }), (error) => error && error.code === "shared_asset_read_view_invalid");
  assert.throws(() => applySharedAssetReadView(source, {
    ...valid,
    consumedEquipmentEnvelopeIds: ["invalid"],
  }), (error) => error && error.code === "shared_asset_read_view_invalid");
  assert.throws(() => applySharedAssetReadView(source, {
    ...valid,
    consumedEquipmentEnvelopeIds: ["eqx_unreferenced_0001"],
  }), (error) => error
    && error.code === "shared_asset_read_view_invalid"
    && error.reason === "consumedEquipmentEnvelopeIds.unreferenced");
});

test("a certified view must match the exact requested scope and account", () => {
  const source = baseline();
  const view = {
    schemaVersion: 1,
    scope: "mail_read",
    accountId: "acc_a",
    includeProfileMailPartitions: true,
    accounts: replacement(["acc_a"], {
      acc_a: {accountId: "acc_a", username: "alpha"},
    }),
    profileBindings: replacement([], {}),
    profiles: replacement([], {}),
    marketListings: null,
    marketConfig: null,
    mailPartitions: [{recipientAccountId: "acc_a", messages: {}}],
    consumedEquipmentEnvelopeIds: [],
  };
  assert.equal(assertSharedAssetReadViewMatchesRequest(view, {
    scope: "mail_read",
    accountId: "acc_a",
    includeProfileMailPartitions: true,
  }), true);
  assert.throws(() => assertSharedAssetReadViewMatchesRequest(view, {
    scope: "mail_read",
    accountId: "acc_b",
    includeProfileMailPartitions: true,
  }), (error) => error
    && error.code === "shared_asset_read_view_invalid"
    && error.reason === "request_identity");
  assert.doesNotThrow(() => applySharedAssetReadView(source, view));
});

test("canonical id comparator is locale-independent code-unit ordering", () => {
  assert.deepEqual(
    ["b", "A", "a", "10", "2"].sort(compareCanonicalIds),
    ["10", "2", "A", "a", "b"],
  );
});
