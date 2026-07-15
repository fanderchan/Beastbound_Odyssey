"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  readConsumedEquipmentEnvelopeLedgerIndex,
} = require("../src/auth/equipment-envelope-consumed-ledger");
const {
  applySharedAssetReadView,
} = require("../src/auth/shared-asset-read-model");
const {
  __assertMysqlSharedAssetRevisionForTest,
  __runMysqlSharedAssetReadForTest,
} = require("../src/mysql-store");

const MYSQL_SESSION_POLICY_SQL =
  "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?";

const ACCOUNT_A = "acc_shared_read_a";
const ACCOUNT_B = "acc_shared_read_b";
const PLAYER_A = "player_shared_read_a";
const PLAYER_B = "player_shared_read_b";
const LISTING_ID = "listing_shared_read_001";
const MAIL_ID = "mail_shared_read_001";
const UPDATED_AT = "2026-07-14T08:00:00.000Z";

function account(accountId, username) {
  return {
    accountId,
    username,
    displayName: username,
    role: "player",
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function binding(accountId, playerId, profileRevision = 2) {
  return {accountId, playerId, profileRevision, updatedAt: UPDATED_AT};
}

function profileRow(accountId, playerId, profileRevision = 2, options = {}) {
  const equipmentInstances = options.originEnvelopeId === undefined ? {} : {
    equip_shared_read_origin: {
      instanceId: "equip_shared_read_origin",
      itemId: "weapon_wooden_club",
      transferProvenance: {originEnvelopeId: options.originEnvelopeId},
    },
  };
  return {
    player_id: playerId,
    account_id: accountId,
    profile_revision: profileRevision,
    updated_at: UPDATED_AT,
    profile_json: {displayName: accountId, stoneCoins: 100, equipmentInstances},
  };
}

function ordinaryListing() {
  return {
    listingId: LISTING_ID,
    sellerAccountId: ACCOUNT_B,
    itemId: "item_meat_small",
    count: 2,
    unitPrice: 30,
    currency: "stoneCoins",
    createdAt: UPDATED_AT,
    schemaVersion: 1,
  };
}

function ordinaryMail(overrides = {}) {
  return {
    mailId: MAIL_ID,
    senderAccountId: "system_market",
    recipientAccountId: ACCOUNT_A,
    title: "跨节点成交邮件",
    items: [{itemId: "item_meat_small", count: 1}],
    currency: {},
    createdAt: UPDATED_AT,
    readAt: null,
    schemaVersion: 1,
    ...overrides,
  };
}

function baseline() {
  const ledger = readConsumedEquipmentEnvelopeLedgerIndex({
    eqx_existing_0001: {schemaVersion: 1, envelopeId: "eqx_existing_0001"},
  });
  assert.equal(ledger.ok, true);
  return {
    schemaVersion: 1,
    accounts: {
      alpha: account(ACCOUNT_A, "alpha"),
      beta: account(ACCOUNT_B, "beta"),
    },
    sessions: {},
    profileBindings: {
      [ACCOUNT_A]: binding(ACCOUNT_A, PLAYER_A, 1),
      [ACCOUNT_B]: binding(ACCOUNT_B, PLAYER_B, 1),
    },
    profiles: {
      [PLAYER_A]: {
        playerId: PLAYER_A,
        accountId: ACCOUNT_A,
        profileRevision: 1,
        updatedAt: UPDATED_AT,
        profile: {displayName: "old-alpha", stoneCoins: 90},
      },
      [PLAYER_B]: {
        playerId: PLAYER_B,
        accountId: ACCOUNT_B,
        profileRevision: 1,
        updatedAt: UPDATED_AT,
        profile: {displayName: "old-beta", stoneCoins: 90},
      },
    },
    mailMessages: {},
    marketListings: {},
    mutationReceipts: {},
    consumedEquipmentEnvelopes: ledger.ledger,
    marketConfig: {defaultTaxBps: 500, itemTaxBps: {}, taxCollected: {stoneCoins: 0, diamonds: 0}, schemaVersion: 1},
  };
}

function marketRows() {
  const listing = ordinaryListing();
  return [{
    listing_id: listing.listingId,
    seller_account_id: listing.sellerAccountId,
    item_id: listing.itemId,
    currency: listing.currency,
    unit_price: listing.unitPrice,
    item_count: listing.count,
    created_at: listing.createdAt,
    document_json: listing,
  }];
}

function accountRows(ids) {
  const records = {
    [ACCOUNT_A]: account(ACCOUNT_A, "alpha"),
    [ACCOUNT_B]: account(ACCOUNT_B, "beta"),
  };
  return ids.map((accountId) => {
    const value = records[accountId];
    return {
      account_id: accountId,
      username: value.username,
      display_name: value.displayName,
      role: value.role,
      created_at: value.createdAt,
      updated_at: value.updatedAt,
      document_json: value,
    };
  });
}

function bindingRows(ids, profileRevision = 2) {
  const records = {
    [ACCOUNT_A]: binding(ACCOUNT_A, PLAYER_A, profileRevision),
    [ACCOUNT_B]: binding(ACCOUNT_B, PLAYER_B, profileRevision),
  };
  return ids.map((accountId) => {
    const value = records[accountId];
    return {
      account_id: accountId,
      player_id: value.playerId,
      profile_revision: value.profileRevision,
      updated_at: value.updatedAt,
      document_json: value,
    };
  });
}

function fakePool(options = {}) {
  const state = {
    begun: 0,
    committed: 0,
    rolledBack: 0,
    released: 0,
    destroyed: 0,
    events: [],
    sessionPolicies: [],
    queries: [],
  };
  const connection = {
    async beginTransaction() {
      state.begun += 1;
      state.events.push("begin");
    },
    async query(statement, params = []) {
      const rawSql = String(statement && statement.sql || statement).trim();
      const sql = rawSql.replace(/\s+/g, " ");
      if (rawSql === MYSQL_SESSION_POLICY_SQL) {
        assert.deepEqual(params, [3, 5]);
        state.sessionPolicies.push(params.slice());
        state.events.push("session");
        return [{affectedRows: 0}, []];
      }
      if (/^SET\s+(?:GLOBAL|PERSIST|PERSIST_ONLY)\b/i.test(sql)
        || /^SET\s+SESSION\b/i.test(sql)) {
        const error = new Error(`shared read fake rejects unsafe or non-default session SQL: ${sql}`);
        error.code = "shared_read_unsafe_session_sql";
        throw error;
      }
      state.queries.push({sql, params: structuredClone(params)});
      if (/^SET TRANSACTION ISOLATION LEVEL REPEATABLE READ$/i.test(sql)) {
        state.events.push("isolation");
        return [{affectedRows: 0}, []];
      }
      state.events.push("query");
      if (/^SELECT revision AS storeRevision FROM auth_store_revisions/i.test(sql)) {
        return [[{storeRevision: 7}], []];
      }
      if (/FROM market_listings ORDER BY listing_id LIMIT/i.test(sql)) {
        return [marketRows(), []];
      }
      if (/FROM mail_messages WHERE recipient_account_id = \?/i.test(sql)) {
        const recipientAccountId = String(params[0] || "");
        if (recipientAccountId !== ACCOUNT_A) {
          return [[], []];
        }
        const mail = ordinaryMail(options.mailOverrides || {});
        return [[{
          mail_id: mail.mailId,
          sender_account_id: mail.senderAccountId,
          recipient_account_id: ACCOUNT_A,
          title: options.rowMailTitle || mail.title,
          created_at: mail.createdAt,
          read_at: null,
          document_json: mail,
        }], []];
      }
      if (/FROM accounts WHERE username = \?/i.test(sql)) {
        if (options.missingRecipient === true) {
          return [[], []];
        }
        const recipientRows = accountRows([ACCOUNT_B]);
        if (options.recipientUsernameDrift === true) {
          recipientRows[0].document_json = {
            ...recipientRows[0].document_json,
            username: "drifted",
          };
        }
        return [recipientRows, []];
      }
      if (/FROM accounts WHERE account_id IN/i.test(sql)) {
        return [accountRows(params), []];
      }
      if (/FROM profile_bindings WHERE account_id IN/i.test(sql)) {
        return [bindingRows(
          params.filter((accountId) => accountId !== options.missingBindingAccountId),
          options.bindingRevision ?? 2,
        ), []];
      }
      if (/FROM profiles WHERE player_id IN/i.test(sql)) {
        return [params
          .filter((playerId) => playerId !== options.missingProfilePlayerId)
          .map((playerId) => (
            playerId === PLAYER_A
              ? profileRow(
                options.profileAccountMismatch || ACCOUNT_A,
                PLAYER_A,
                options.profileRevision ?? 2,
                {originEnvelopeId: options.profileOriginEnvelopeId},
              )
              : profileRow(ACCOUNT_B, PLAYER_B, options.profileRevision ?? 2)
          )), []];
      }
      if (/FROM consumed_equipment_envelopes/i.test(sql)) {
        const consumedIds = new Set(options.consumedEnvelopeIds || []);
        return [params.filter((envelopeId) => consumedIds.has(envelopeId)).map((envelopeId) => ({
          envelope_id: envelopeId,
        })), []];
      }
      if (/^SELECT document_json FROM server_state/i.test(sql)) {
        return [[{document_json: {
          marketConfig: {
            defaultTaxBps: 300,
            itemTaxBps: {},
            taxCollected: {stoneCoins: 9, diamonds: 0},
            schemaVersion: 1,
          },
        }}], []];
      }
      throw new Error(`unexpected shared read SQL: ${sql}`);
    },
    async commit() {
      state.committed += 1;
    },
    async rollback() {
      state.rolledBack += 1;
    },
    release() {
      state.released += 1;
    },
    destroy() {
      state.destroyed += 1;
    },
  };
  return {
    state,
    pool: {async getConnection() { return connection; }},
  };
}

test("market scoped RR read returns one canonical book plus actor and seller resources", async () => {
  const fake = fakePool();
  const result = await __runMysqlSharedAssetReadForTest(fake.pool, {
    scope: "market_mutation",
    accountId: ACCOUNT_A,
    listingId: LISTING_ID,
    includeProfileMailPartitions: true,
  }, baseline());

  assert.equal(result.storeRevision, 7);
  assert.deepEqual(Object.keys(result.view.marketListings), [LISTING_ID]);
  assert.deepEqual(result.view.accounts.keys, [ACCOUNT_A, ACCOUNT_B]);
  assert.deepEqual(result.view.profileBindings.keys, [ACCOUNT_A, ACCOUNT_B]);
  assert.deepEqual(result.view.profiles.keys, [PLAYER_A, PLAYER_B]);
  assert.deepEqual(
    result.view.mailPartitions.map((partition) => partition.recipientAccountId),
    [ACCOUNT_A, ACCOUNT_B],
  );
  assert.deepEqual(
    fake.state.queries
      .filter(({sql}) => /FROM mail_messages/i.test(sql))
      .map(({params}) => params),
    [[ACCOUNT_A], [ACCOUNT_B]],
  );
  assert.equal(result.view.marketConfig.defaultTaxBps, 300);
  assert.deepEqual(fake.state.sessionPolicies, [[3, 5]]);
  assert.deepEqual(fake.state.events.slice(0, 4), ["session", "isolation", "begin", "query"]);
  assert.equal(fake.state.begun, 1);
  assert.equal(fake.state.committed, 1);
  assert.equal(fake.state.rolledBack, 0);
  assert.equal(fake.state.released, 1);
});

test("ordinary market mutation keeps mailbox reads off while retaining scoped profiles", async () => {
  const fake = fakePool();
  const result = await __runMysqlSharedAssetReadForTest(fake.pool, {
    scope: "market_mutation",
    accountId: ACCOUNT_A,
    listingId: LISTING_ID,
    includeProfileMailPartitions: false,
  }, baseline());

  assert.deepEqual(result.view.profileBindings.keys, [ACCOUNT_A, ACCOUNT_B]);
  assert.deepEqual(result.view.mailPartitions, []);
  assert.equal(fake.state.queries.some(({sql}) => /FROM mail_messages/i.test(sql)), false);
});

test("a scoped projection cannot advance an older Node across a global revision", () => {
  assert.doesNotThrow(() => __assertMysqlSharedAssetRevisionForTest(7, 7));
  assert.throws(
    () => __assertMysqlSharedAssetRevisionForTest(6, 7),
    (error) => error
      && error.code === "mysql_shared_asset_full_reload_required"
      && error.expectedRevision === 6
      && error.actualRevision === 7,
  );
});

test("mail scoped RR read is recipient-bound and rejects SQL/document mirror drift", async () => {
  const valid = fakePool();
  const result = await __runMysqlSharedAssetReadForTest(valid.pool, {
    scope: "mail_mutation",
    accountId: ACCOUNT_A,
    mailId: MAIL_ID,
    includeProfileMailPartitions: true,
  }, baseline());
  assert.deepEqual(
    Object.keys(result.view.mailPartitions[0].messages),
    [MAIL_ID],
  );
  assert.equal(result.view.mailPartitions[0].recipientAccountId, ACCOUNT_A);
  assert.equal(valid.state.committed, 1);

  const drift = fakePool({rowMailTitle: "SQL列被篡改"});
  await assert.rejects(
    __runMysqlSharedAssetReadForTest(drift.pool, {
      scope: "mail_mutation",
      accountId: ACCOUNT_A,
      mailId: MAIL_ID,
      includeProfileMailPartitions: true,
    }, baseline()),
    (error) => error && error.code === "mysql_shared_asset_integrity_invalid",
  );
  assert.equal(drift.state.committed, 0);
  assert.equal(drift.state.rolledBack, 1);
  assert.equal(drift.state.released, 1);

  const profileMismatch = fakePool({profileAccountMismatch: ACCOUNT_B});
  await assert.rejects(
    __runMysqlSharedAssetReadForTest(profileMismatch.pool, {
      scope: "mail_mutation",
      accountId: ACCOUNT_A,
      mailId: MAIL_ID,
      includeProfileMailPartitions: true,
    }, baseline()),
    (error) => error
      && error.code === "mysql_shared_asset_integrity_invalid"
      && error.reason === "binding_profile_mismatch",
  );
  assert.equal(profileMismatch.state.rolledBack, 1);
});

test("mail send resolves the recipient by username without reading a mailbox", async () => {
  for (const includeActorProfile of [false, true]) {
    const fake = fakePool();
    const result = await __runMysqlSharedAssetReadForTest(fake.pool, {
      scope: "mail_send",
      accountId: ACCOUNT_A,
      recipientUsername: "beta",
      knownRecipientAccountId: ACCOUNT_B,
      includeActorProfile,
      includeProfileMailPartitions: false,
    }, baseline());

    assert.equal(result.view.recipientUsername, "beta");
    assert.equal(result.view.knownRecipientAccountId, ACCOUNT_B);
    assert.equal(result.view.recipientAccountId, ACCOUNT_B);
    assert.equal(result.view.includeActorProfile, includeActorProfile);
    assert.deepEqual(result.view.accounts.keys, [ACCOUNT_A, ACCOUNT_B]);
    assert.deepEqual(result.view.mailPartitions, []);
    assert.deepEqual(
      result.view.profileBindings.keys,
      includeActorProfile ? [ACCOUNT_A] : [],
    );
    assert.deepEqual(
      result.view.profiles.keys,
      includeActorProfile ? [PLAYER_A] : [],
    );
    assert.equal(fake.state.queries.some(({sql}) => (
      /FROM mail_messages/i.test(sql)
    )), false);
  }

  const drift = fakePool({recipientUsernameDrift: true});
  await assert.rejects(
    __runMysqlSharedAssetReadForTest(drift.pool, {
      scope: "mail_send",
      accountId: ACCOUNT_A,
      recipientUsername: "beta",
      knownRecipientAccountId: "",
      includeActorProfile: false,
      includeProfileMailPartitions: false,
    }, baseline()),
    (error) => error
      && error.code === "mysql_shared_asset_integrity_invalid"
      && error.reason === "mail_recipient_account_row_drift",
  );
  assert.equal(drift.state.rolledBack, 1);
});

test("equipment mail authority pairs the sender profile with its mailbox partition", async () => {
  const fake = fakePool();
  const result = await __runMysqlSharedAssetReadForTest(fake.pool, {
    scope: "mail_send",
    accountId: ACCOUNT_A,
    recipientUsername: "beta",
    knownRecipientAccountId: ACCOUNT_B,
    includeActorProfile: true,
    includeProfileMailPartitions: true,
  }, baseline());

  assert.deepEqual(result.view.profileBindings.keys, [ACCOUNT_A]);
  assert.deepEqual(
    result.view.mailPartitions.map((partition) => partition.recipientAccountId),
    [ACCOUNT_A],
  );
  assert.equal(fake.state.queries.some(({sql}) => /FROM mail_messages/i.test(sql)), true);

  const missingProfile = fakePool();
  await assert.rejects(
    __runMysqlSharedAssetReadForTest(missingProfile.pool, {
      scope: "mail_send",
      accountId: ACCOUNT_A,
      recipientUsername: "beta",
      knownRecipientAccountId: ACCOUNT_B,
      includeActorProfile: false,
      includeProfileMailPartitions: true,
    }, baseline()),
    (error) => error && error.code === "mysql_shared_asset_read_request_invalid",
  );
});

test("scoped profiles require matching non-negative safe-integer revisions", async () => {
  const mismatch = fakePool({bindingRevision: 3, profileRevision: 2});
  await assert.rejects(
    __runMysqlSharedAssetReadForTest(mismatch.pool, {
      scope: "mail_read",
      accountId: ACCOUNT_A,
      includeProfileMailPartitions: true,
    }, baseline()),
    (error) => error
      && error.code === "mysql_shared_asset_integrity_invalid"
      && error.reason === "binding_profile_revision_mismatch",
  );
  assert.equal(mismatch.state.committed, 0);
  assert.equal(mismatch.state.rolledBack, 1);

  const fractional = fakePool({bindingRevision: 2.5, profileRevision: 2.5});
  await assert.rejects(
    __runMysqlSharedAssetReadForTest(fractional.pool, {
      scope: "mail_read",
      accountId: ACCOUNT_A,
      includeProfileMailPartitions: true,
    }, baseline()),
    (error) => error
      && error.code === "mysql_shared_asset_integrity_invalid"
      && error.reason === "profile_revision_invalid",
  );
  assert.equal(fractional.state.committed, 0);
  assert.equal(fractional.state.rolledBack, 1);
});

test("scoped reads fail closed when any required binding or profile is missing", async () => {
  for (const missingBindingAccountId of [ACCOUNT_A, ACCOUNT_B]) {
    const missingBinding = fakePool({missingBindingAccountId});
    await assert.rejects(
      __runMysqlSharedAssetReadForTest(missingBinding.pool, {
        scope: "market_mutation",
        accountId: ACCOUNT_A,
        listingId: LISTING_ID,
        includeProfileMailPartitions: true,
      }, baseline()),
      (error) => error
        && error.code === "mysql_shared_asset_integrity_invalid"
        && error.reason === "profile_binding_missing"
        && error.resourceKey === missingBindingAccountId,
    );
    assert.equal(missingBinding.state.committed, 0);
    assert.equal(missingBinding.state.rolledBack, 1);
    assert.equal(missingBinding.state.released, 1);
    assert.equal(missingBinding.state.queries.some(({sql}) => (
      /^(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql)
    )), false);
  }

  const missingProfile = fakePool({missingProfilePlayerId: PLAYER_B});
  await assert.rejects(
    __runMysqlSharedAssetReadForTest(missingProfile.pool, {
      scope: "market_mutation",
      accountId: ACCOUNT_A,
      listingId: LISTING_ID,
      includeProfileMailPartitions: true,
    }, baseline()),
    (error) => error
      && error.code === "mysql_shared_asset_integrity_invalid"
      && error.reason === "binding_profile_mismatch"
      && error.resourceKey === PLAYER_B,
  );
  assert.equal(missingProfile.state.committed, 0);
  assert.equal(missingProfile.state.rolledBack, 1);
  assert.equal(missingProfile.state.released, 1);
  assert.equal(missingProfile.state.queries.some(({sql}) => (
    /^(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql)
  )), false);
});

test("profile transfer provenance reads only its confirmed tombstone delta", async () => {
  const originEnvelopeId = "eqx_profile_origin_0001";
  const fake = fakePool({
    profileOriginEnvelopeId: originEnvelopeId,
    consumedEnvelopeIds: [originEnvelopeId],
  });
  const root = baseline();
  const result = await __runMysqlSharedAssetReadForTest(fake.pool, {
    scope: "mail_read",
    accountId: ACCOUNT_A,
    includeProfileMailPartitions: true,
  }, root);
  const consumedQuery = fake.state.queries.find((entry) => (
    /FROM consumed_equipment_envelopes/i.test(entry.sql)
  ));
  assert.deepEqual(consumedQuery.params, [originEnvelopeId]);
  assert.deepEqual(result.view.consumedEquipmentEnvelopeIds, [originEnvelopeId]);
  const applied = applySharedAssetReadView(root, result.view);
  const appliedLedger = readConsumedEquipmentEnvelopeLedgerIndex(
    applied.consumedEquipmentEnvelopes,
  );
  assert.equal(appliedLedger.ok, true);
  assert.equal(appliedLedger.index.has(originEnvelopeId), true);
  assert.equal(appliedLedger.index.has("eqx_existing_0001"), true);
  assert.equal(Object.hasOwn(root.consumedEquipmentEnvelopes, originEnvelopeId), false);

  const malformed = fakePool({profileOriginEnvelopeId: "invalid"});
  await assert.rejects(
    __runMysqlSharedAssetReadForTest(malformed.pool, {
      scope: "mail_read",
      accountId: ACCOUNT_A,
      includeProfileMailPartitions: true,
    }, baseline()),
    (error) => error
      && error.code === "mysql_shared_asset_integrity_invalid"
      && error.reason === "equipment_envelope_reference_invalid",
  );
  assert.equal(malformed.state.rolledBack, 1);
});
