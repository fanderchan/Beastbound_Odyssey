"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {createValkeyBattleRuntimeStore} = require("../src/valkey-battle-runtime-store");

const TOKEN_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

test("battle runtime checkpoints are fenced and transfer only after owner lease expiry", async () => {
  const clock = fakeClock();
  const backend = fakeValkeyBackend(clock);
  const fatalA = [];
  const storeA = await createStore(backend, clock, "node-a", TOKEN_A, fatalA);
  const storeB = await createStore(backend, clock, "node-b", TOKEN_B);
  const snapshot = {
    schemaVersion: 1,
    roomId: "battle_runtime_room_alpha",
    checksum: "a".repeat(64),
    room: {roomId: "battle_runtime_room_alpha", round: 1},
  };

  try {
    const created = await storeA.checkpoint(snapshot);
    assert.equal(created.created, true);
    assert.equal(created.generation, 1);
    await assert.rejects(
      storeB.claim(snapshot.roomId),
      (error) => error.code === "cluster_battle_runtime_owner_conflict" && error.retryAfterMs > 0,
    );
    assert.equal(backend.keys().some((key) => key.includes(snapshot.roomId)), false);

    clock.advance(3001);
    const takeover = await storeB.claim(snapshot.roomId);
    assert.equal(takeover.found, true);
    assert.equal(takeover.acquired, true);
    assert.equal(takeover.generation, 2);
    assert.deepEqual(takeover.snapshot, snapshot);
    assert.equal(storeB.metrics().takeovers, 1);

    await assert.rejects(
      storeA.checkpoint({...snapshot, checksum: "b".repeat(64)}),
      (error) => error.code === "cluster_battle_runtime_unavailable",
    );
    assert.equal(storeA.health().fatal, true);
    assert.equal(fatalA.includes("cluster_battle_runtime_lease_expired"), true);

    const refreshed = {...snapshot, checksum: "c".repeat(64), room: {...snapshot.room, round: 2}};
    const checkpoint = await storeB.checkpoint(refreshed);
    assert.equal(checkpoint.created, false);
    assert.equal(checkpoint.generation, 2);
    assert.equal(await storeB.remove(snapshot.roomId), true);
    assert.equal((await storeB.claim(snapshot.roomId)).found, false);
    assert.equal(backend.keys().length, 0);
  } finally {
    await Promise.all([storeA.close(), storeB.close()]);
  }
  assert.equal(backend.openClients(), 0);
});

test("battle runtime store validates startup and snapshot byte boundaries", async () => {
  let closeCalls = 0;
  await assert.rejects(
    createValkeyBattleRuntimeStore({
      nodeId: "node-a",
      processToken: TOKEN_A,
      client: {
        customCommand() {
          throw new Error("offline");
        },
        close() {
          closeCalls += 1;
        },
      },
    }),
    (error) => error.code === "cluster_battle_runtime_connect_failed",
  );
  assert.equal(closeCalls, 1);

  const clock = fakeClock();
  const backend = fakeValkeyBackend(clock);
  const store = await createValkeyBattleRuntimeStore({
    nodeId: "node-a",
    processToken: TOKEN_A,
    leaseMs: 3000,
    snapshotTtlMs: 6000,
    maxSnapshotBytes: 64 * 1024,
    now: clock.now,
    client: backend.client(),
  });
  try {
    await assert.rejects(
      store.checkpoint({
        schemaVersion: 1,
        roomId: "battle_runtime_room_large",
        payload: "x".repeat(70 * 1024),
      }),
      (error) => error.code === "cluster_battle_runtime_snapshot_too_large",
    );
  } finally {
    await store.close();
  }
});

test("graceful owner close releases the lease while preserving a takeover snapshot", async () => {
  const clock = fakeClock();
  const backend = fakeValkeyBackend(clock);
  const storeA = await createStore(backend, clock, "node-a", TOKEN_A);
  const storeB = await createStore(backend, clock, "node-b", TOKEN_B);
  const snapshot = {
    schemaVersion: 1,
    roomId: "battle_runtime_room_graceful",
    checksum: "d".repeat(64),
  };
  try {
    assert.equal((await storeA.checkpoint(snapshot)).generation, 1);
    await storeA.close();
    await storeA.close();
    const claimed = await storeB.claim(snapshot.roomId);
    assert.equal(claimed.found, true);
    assert.equal(claimed.acquired, true);
    assert.equal(claimed.generation, 2);
    assert.deepEqual(claimed.snapshot, snapshot);
    assert.equal(await storeB.remove(snapshot.roomId), true);
  } finally {
    await Promise.all([storeA.close(), storeB.close()]);
  }
  assert.equal(backend.openClients(), 0);
});

function createStore(backend, clock, nodeId, processToken, fatalCodes = []) {
  return createValkeyBattleRuntimeStore({
    nodeId,
    processToken,
    leaseMs: 3000,
    snapshotTtlMs: 6000,
    now: clock.now,
    client: backend.client(),
    onFatal(error) {
      fatalCodes.push(String(error && error.code || ""));
    },
  });
}

function fakeClock() {
  let currentMs = 1000;
  return {
    now: () => currentMs,
    advance(ms) {
      currentMs += Number(ms || 0);
    },
  };
}

function fakeValkeyBackend(clock) {
  const values = new Map();
  let clientCount = 0;

  function current(key) {
    const entry = values.get(key) || null;
    if (entry && entry.expiresAtMs !== null && entry.expiresAtMs <= clock.now()) {
      values.delete(key);
      return null;
    }
    return entry;
  }

  function value(key) {
    return current(key)?.value ?? null;
  }

  function set(key, entryValue, ttlMs = null) {
    values.set(key, {
      value: String(entryValue),
      expiresAtMs: ttlMs === null ? null : clock.now() + Number(ttlMs),
    });
  }

  function pexpire(key, ttlMs) {
    const entry = current(key);
    if (entry) {
      entry.expiresAtMs = clock.now() + Number(ttlMs);
    }
  }

  function pttl(key) {
    const entry = current(key);
    return entry && entry.expiresAtMs !== null
      ? Math.max(0, entry.expiresAtMs - clock.now())
      : -1;
  }

  function increment(key) {
    const next = Number(value(key) || 0) + 1;
    set(key, next);
    return next;
  }

  function client() {
    clientCount += 1;
    let closed = false;
    return {
      async customCommand(command) {
        if (command[0] === "PING") {
          return "PONG";
        }
        assert.equal(command[0], "EVAL");
        const script = String(command[1] || "");
        const keyCount = Number(command[2]);
        const keys = command.slice(3, 3 + keyCount).map(String);
        const args = command.slice(3 + keyCount).map(String);

        if (script.includes("beastbound_battle_runtime_checkpoint_v1")) {
          const owner = value(keys[0]);
          if (owner) {
            if (owner !== args[0]) return [0, 0, pttl(keys[0])];
            set(keys[2], args[3], Number(args[2]));
            pexpire(keys[0], Number(args[1]));
            pexpire(keys[1], Number(args[2]));
            return [2, Number(value(keys[1]) || 0), Number(args[1])];
          }
          if (value(keys[2]) !== null) {
            return [-1, Number(value(keys[1]) || 0), 0];
          }
          const generation = increment(keys[1]);
          set(keys[0], args[0], Number(args[1]));
          pexpire(keys[1], Number(args[2]));
          set(keys[2], args[3], Number(args[2]));
          return [1, generation, Number(args[1])];
        }

        if (script.includes("beastbound_battle_runtime_claim_v1")) {
          const owner = value(keys[0]);
          if (owner) {
            if (owner !== args[0]) {
              return [0, Number(value(keys[1]) || 0), pttl(keys[0]), ""];
            }
            const snapshot = value(keys[2]);
            if (snapshot === null) return [-1, 0, 0, ""];
            pexpire(keys[0], Number(args[1]));
            pexpire(keys[1], Number(args[2]));
            pexpire(keys[2], Number(args[2]));
            return [2, Number(value(keys[1]) || 0), Number(args[1]), snapshot];
          }
          const snapshot = value(keys[2]);
          if (snapshot === null) return [-1, 0, 0, ""];
          const generation = increment(keys[1]);
          set(keys[0], args[0], Number(args[1]));
          pexpire(keys[1], Number(args[2]));
          pexpire(keys[2], Number(args[2]));
          return [1, generation, Number(args[1]), snapshot];
        }

        if (script.includes("beastbound_battle_runtime_renew_v1")) {
          if (value(keys[0]) !== args[0]) return 0;
          if (value(keys[2]) === null) return -1;
          if (value(keys[1]) === null) return -2;
          pexpire(keys[0], Number(args[1]));
          pexpire(keys[1], Number(args[2]));
          pexpire(keys[2], Number(args[2]));
          return 1;
        }

        if (script.includes("beastbound_battle_runtime_remove_v1")) {
          if (value(keys[0]) !== args[0]) return 0;
          values.delete(keys[0]);
          values.delete(keys[1]);
          values.delete(keys[2]);
          return 1;
        }

        if (script.includes("beastbound_battle_runtime_release_v1")) {
          if (value(keys[0]) !== args[0]) return 0;
          values.delete(keys[0]);
          if (value(keys[1]) !== null) pexpire(keys[1], Number(args[1]));
          if (value(keys[2]) !== null) pexpire(keys[2], Number(args[1]));
          return 1;
        }

        throw new Error("unexpected fake Valkey command");
      },
      close() {
        if (!closed) {
          closed = true;
          clientCount -= 1;
        }
      },
    };
  }

  return {
    client,
    openClients: () => clientCount,
    keys: () => Array.from(values.keys()),
  };
}
