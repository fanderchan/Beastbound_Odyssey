"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createSharedMysqlTransactionHarness,
  sharedMysqlOperation,
} = require("../test-support/shared-mysql-transaction-harness");

function profileRow(revision, owner, stoneCoins = 100) {
  return {profileRevision: revision, owner, stoneCoins};
}

function listingRow(status, owner) {
  return {status, owner};
}

function createConditionalProfileStore(harness, writerId) {
  const pool = harness.poolFor(writerId);
  return {
    async save({expectedRevision, nextRevision, owner, stoneCoins}) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.query(sharedMysqlOperation.selectForUpdate("profiles", "player_a"));
        const [update] = await connection.query(sharedMysqlOperation.update("profiles", "player_a", {
          where: {profileRevision: expectedRevision},
          set: {profileRevision: nextRevision, owner, stoneCoins},
        }));
        if (update.affectedRows !== 1) {
          const conflict = new Error("profile revision conflict");
          conflict.code = "profile_revision_conflict";
          throw conflict;
        }
        await connection.commit();
        return {ok: true, owner};
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

function createMultiRowStore(harness, writerId) {
  const pool = harness.poolFor(writerId);
  return {
    async save(owner) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.query(sharedMysqlOperation.selectForUpdate("profiles", "player_a"));
        const [profileUpdate] = await connection.query(sharedMysqlOperation.update("profiles", "player_a", {
          where: {profileRevision: 1},
          set: {profileRevision: 2, owner, stoneCoins: 90},
        }));
        if (profileUpdate.affectedRows !== 1) {
          const conflict = new Error("profile revision conflict");
          conflict.code = "profile_revision_conflict";
          throw conflict;
        }
        await connection.query(sharedMysqlOperation.selectForUpdate("market_listings", "listing_a"));
        const [listingUpdate] = await connection.query(sharedMysqlOperation.update("market_listings", "listing_a", {
          where: {status: "open"},
          set: {status: "sold", owner},
        }));
        if (listingUpdate.affectedRows !== 1) {
          const conflict = new Error("listing state conflict");
          conflict.code = "listing_state_conflict";
          throw conflict;
        }
        await connection.commit();
        return {ok: true, owner};
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

test("unknown operations fail closed instead of returning a fabricated affectedRows", async () => {
  const harness = createSharedMysqlTransactionHarness();
  const pool = harness.poolFor("unknown_writer");
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  await assert.rejects(
    connection.query("UPDATE profiles SET profile_revision = 2"),
    (error) => error && error.code === "shared_mysql_unknown_operation",
  );
  await connection.rollback();
  connection.release();
  await pool.end();
  assert.equal(harness.assertIdle(), true);
});

test("primary-key lock waiters are granted in strict FIFO order", async () => {
  const harness = createSharedMysqlTransactionHarness({
    seed: {profiles: {player_a: profileRow(1, "initial")}},
  });
  const poolA = harness.poolFor("node_a");
  const poolB = harness.poolFor("node_b");
  const poolC = harness.poolFor("node_c");
  const connectionA = await poolA.getConnection();
  const connectionB = await poolB.getConnection();
  const connectionC = await poolC.getConnection();
  await Promise.all([
    connectionA.beginTransaction(),
    connectionB.beginTransaction(),
    connectionC.beginTransaction(),
  ]);

  await connectionA.query(sharedMysqlOperation.selectForUpdate("profiles", "player_a"));
  const waitB = connectionB.query(sharedMysqlOperation.selectForUpdate("profiles", "player_a"));
  await harness.waitForEvent({type: "lock_wait", writerId: "node_b", table: "profiles", key: "player_a"});
  const waitC = connectionC.query(sharedMysqlOperation.selectForUpdate("profiles", "player_a"));
  await harness.waitForEvent({type: "lock_wait", writerId: "node_c", table: "profiles", key: "player_a"});
  const bothWaiters = Promise.allSettled([waitB, waitC]);

  await connectionA.commit();
  connectionA.release();
  await waitB;
  assert.equal(
    harness.events().some((event) => event.type === "lock_granted" && event.writerId === "node_c"),
    false,
  );
  await connectionB.commit();
  connectionB.release();
  await waitC;
  await connectionC.commit();
  connectionC.release();

  const waiterResults = await bothWaiters;
  assert.deepEqual(waiterResults.map((result) => result.status), ["fulfilled", "fulfilled"]);
  assert.deepEqual(
    harness.events()
      .filter((event) => event.type === "lock_granted" && event.table === "profiles")
      .map((event) => event.writerId),
    ["node_b", "node_c"],
  );
  await Promise.all([poolA.end(), poolB.end(), poolC.end()]);
  assert.equal(harness.assertIdle(), true);
});

test("two stores really overlap and the waiter evaluates affectedRows after the winner commits", async (t) => {
  const harness = createSharedMysqlTransactionHarness({
    seed: {profiles: {player_a: profileRow(1, "initial")}},
  });
  const storeA = createConditionalProfileStore(harness, "node_a");
  const storeB = createConditionalProfileStore(harness, "node_b");
  const gateA = harness.blockNext({writerId: "node_a", phase: "before_commit_apply"});

  const settledPromise = Promise.allSettled([
    storeA.save({expectedRevision: 1, nextRevision: 2, owner: "node_a", stoneCoins: 90}),
    storeB.save({expectedRevision: 1, nextRevision: 2, owner: "node_b", stoneCoins: 80}),
  ]);
  t.after(async () => {
    gateA.release();
    await settledPromise;
    await Promise.allSettled([storeA.close(), storeB.close()]);
  });

  await gateA.entered;
  await harness.waitForEvent({type: "lock_wait", writerId: "node_b", table: "profiles", key: "player_a"});
  assert.deepEqual(harness.snapshot().profiles.player_a, profileRow(1, "initial"));
  assert.equal(
    harness.events().some((event) => event.type === "write_staged" && event.writerId === "node_b"),
    false,
  );
  gateA.release();

  const [resultA, resultB] = await settledPromise;
  assert.equal(resultA.status, "fulfilled");
  assert.equal(resultB.status, "rejected");
  assert.equal(resultB.reason && resultB.reason.code, "profile_revision_conflict");
  assert.deepEqual(harness.snapshot().profiles.player_a, profileRow(2, "node_a", 90));
  assert.equal(
    harness.events().some((event) => event.type === "write_condition_missed" && event.writerId === "node_b"),
    true,
  );
  assert.equal(harness.assertIdle(), true);
});

test("a commit failure before apply rolls back the whole private write set before the waiter proceeds", async (t) => {
  const harness = createSharedMysqlTransactionHarness({
    seed: {
      profiles: {player_a: profileRow(1, "initial")},
      market_listings: {listing_a: listingRow("open", "initial")},
    },
  });
  const storeA = createMultiRowStore(harness, "node_a");
  const storeB = createMultiRowStore(harness, "node_b");
  const gateA = harness.blockNext({writerId: "node_a", phase: "before_commit_apply"});
  const injected = new Error("commit failed before durability");
  injected.code = "PROTOCOL_CONNECTION_LOST";
  harness.failNext({writerId: "node_a", phase: "commit_before_apply", error: injected});

  const settledPromise = Promise.allSettled([
    storeA.save("node_a"),
    storeB.save("node_b"),
  ]);
  t.after(async () => {
    gateA.release();
    await settledPromise;
    await Promise.allSettled([storeA.close(), storeB.close()]);
  });
  await gateA.entered;
  await harness.waitForEvent({type: "lock_wait", writerId: "node_b", table: "profiles", key: "player_a"});
  assert.deepEqual(harness.snapshot(), {
    market_listings: {listing_a: listingRow("open", "initial")},
    profiles: {player_a: profileRow(1, "initial")},
  });
  gateA.release();

  const [resultA, resultB] = await settledPromise;
  assert.equal(resultA.status, "rejected");
  assert.equal(resultA.reason, injected);
  assert.equal(resultB.status, "fulfilled");
  assert.deepEqual(harness.snapshot(), {
    market_listings: {listing_a: listingRow("sold", "node_b")},
    profiles: {player_a: profileRow(2, "node_b", 90)},
  });
  assert.equal(
    harness.events().filter((event) => event.type === "write_staged" && event.writerId === "node_a").length,
    2,
  );
  assert.equal(
    harness.events().some((event) => event.type === "rollback_applied" && event.writerId === "node_a"),
    true,
  );
  assert.equal(harness.assertIdle(), true);
});

test("a lost COMMIT response after apply stays durable and a later rollback cannot undo it", async (t) => {
  const committedSnapshots = [];
  const harness = createSharedMysqlTransactionHarness({
    seed: {
      profiles: {player_a: profileRow(1, "initial")},
      market_listings: {listing_a: listingRow("open", "initial")},
    },
    onCommittedSnapshot(snapshot, context) {
      committedSnapshots.push({snapshot, context});
    },
  });
  const storeA = createMultiRowStore(harness, "node_a");
  const storeB = createMultiRowStore(harness, "node_b");
  const gateA = harness.blockNext({writerId: "node_a", phase: "before_commit_apply"});
  const responseLost = new Error("commit response lost after durability");
  responseLost.code = "PROTOCOL_CONNECTION_LOST";
  harness.failNext({writerId: "node_a", phase: "commit_after_apply", error: responseLost});

  const settledPromise = Promise.allSettled([
    storeA.save("node_a"),
    storeB.save("node_b"),
  ]);
  t.after(async () => {
    gateA.release();
    await settledPromise;
    await Promise.allSettled([storeA.close(), storeB.close()]);
  });
  await gateA.entered;
  await harness.waitForEvent({type: "lock_wait", writerId: "node_b", table: "profiles", key: "player_a"});
  gateA.release();

  const [resultA, resultB] = await settledPromise;
  assert.equal(resultA.status, "rejected");
  assert.equal(resultA.reason, responseLost);
  assert.equal(resultB.status, "rejected");
  assert.equal(resultB.reason && resultB.reason.code, "profile_revision_conflict");
  const expected = {
    market_listings: {listing_a: listingRow("sold", "node_a")},
    profiles: {player_a: profileRow(2, "node_a", 90)},
  };
  assert.deepEqual(harness.snapshot(), expected);
  assert.equal(committedSnapshots.length, 1);
  assert.deepEqual(committedSnapshots[0].snapshot, expected);
  assert.equal(committedSnapshots[0].context.writerId, "node_a");
  assert.equal(
    harness.events().some((event) => event.type === "rollback_after_commit_ignored" && event.writerId === "node_a"),
    true,
  );
  assert.equal(harness.assertIdle(), true);
});

test("an unentered gate rejects within its bounded timeout instead of hanging the suite", async () => {
  const harness = createSharedMysqlTransactionHarness();
  const gate = harness.blockNext({phase: "before_commit_apply", timeoutMs: 20});
  await assert.rejects(
    gate.entered,
    (error) => error && error.code === "shared_mysql_gate_timeout",
  );
  gate.release();
  assert.equal(harness.assertIdle(), true);
});
