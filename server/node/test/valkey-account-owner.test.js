"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const {
  PRESENCE_REVISION_STRIDE,
  createValkeyAccountOwner,
} = require("../src/valkey-account-owner");

const TOKEN_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const TOKEN_C = "cccccccccccccccccccccccc";

test("account owner rejects a second node, then advances generation and presence floor after release", async () => {
  const clock = fakeClock();
  const backend = createFakeValkeyBackend(clock);
  const observedA = [];
  const observedB = [];
  const ownerA = await createOwner(backend, clock, "node-a", TOKEN_A, (accountId, floor, _ceiling, metadata) => {
    observedA.push([accountId, floor, metadata]);
    return floor;
  });
  const ownerB = await createOwner(backend, clock, "node-b", TOKEN_B, (accountId, floor, _ceiling, metadata) => {
    observedB.push([accountId, floor, metadata]);
    return floor;
  });

  try {
    const first = await ownerA.admit("acc_alpha");
    assert.deepEqual(first, {
      ok: true,
      acquired: true,
      generation: 1,
      presenceRevisionFloor: PRESENCE_REVISION_STRIDE,
      leaseMs: 3000,
    });
    const reused = await ownerA.admit("acc_alpha");
    assert.equal(reused.acquired, false);
    assert.equal(reused.generation, 1);
    assert.equal(backend.ownerKeys()[0].includes("acc_alpha"), false);
    assert.equal(backend.ownerKeys()[0].endsWith(accountDigest("acc_alpha")), true);
    clock.advance(1600);
    const renewed = await ownerA.admit("acc_alpha");
    assert.equal(renewed.acquired, false);
    assert.equal(renewed.generation, 1);

    await assert.rejects(
      ownerB.admit("acc_alpha"),
      (error) => (
        error.code === "cluster_account_owner_conflict"
        && error.retryAfterMs > 0
        && error.retryAfterMs <= 3000
      ),
    );
    assert.equal(await ownerA.release("acc_alpha", {generation: 999}), false);
    assert.equal(await ownerA.release("acc_alpha", {generation: 1}), true);

    const takeover = await ownerB.admit("acc_alpha");
    assert.equal(takeover.acquired, true);
    assert.equal(takeover.generation, 2);
    assert.equal(takeover.presenceRevisionFloor, PRESENCE_REVISION_STRIDE * 2);
    assert.deepEqual(observedA, [
      ["acc_alpha", PRESENCE_REVISION_STRIDE, {
        acquired: true,
        generation: 1,
        reused: false,
      }],
      ["acc_alpha", PRESENCE_REVISION_STRIDE, {
        acquired: false,
        generation: 1,
        reused: true,
      }],
    ]);
    assert.deepEqual(observedB, [["acc_alpha", PRESENCE_REVISION_STRIDE * 2, {
      acquired: true,
      generation: 2,
      reused: false,
    }]]);
    assert.equal(ownerA.health().ok, true);
    assert.equal(ownerB.health().ok, true);
    assert.equal(JSON.stringify(ownerB.metrics()).includes("acc_alpha"), false);
    assert.equal(JSON.stringify(ownerB.metrics()).includes(TOKEN_B), false);
  } finally {
    await Promise.all([ownerA.close(), ownerB.close()]);
  }
  assert.equal(backend.openClients(), 0);
});

test("account owner requires a revision observer and bounds invalid or concurrent admission", async () => {
  const clock = fakeClock();
  const backend = createFakeValkeyBackend(clock);
  const owner = await createValkeyAccountOwner({
    nodeId: "node-a",
    processToken: TOKEN_A,
    leaseMs: 3000,
    maxOwnedAccounts: 1,
    maxPendingAdmissions: 2,
    now: clock.now,
    client: backend.client(),
  });

  try {
    await assert.rejects(
      owner.admit("acc_observer"),
      (error) => error.code === "cluster_account_presence_observer_missing",
    );
    owner.setPresenceRevisionObserver((_accountId, floor) => floor);
    await assert.rejects(
      owner.admit("not allowed/identity"),
      (error) => error.code === "cluster_account_id_invalid",
    );
    const [first, second] = await Promise.allSettled([
      owner.admit("acc_first"),
      owner.admit("acc_second"),
    ]);
    assert.equal(first.status, "fulfilled");
    assert.equal(second.status, "rejected");
    assert.equal(second.reason.code, "cluster_account_owner_capacity_full");
    assert.equal(owner.metrics().invalidRejected, 1);
    assert.equal(owner.metrics().capacityRejected, 1);
  } finally {
    await owner.close();
  }
});

test("revision floor rejection releases the lease and fails the node closed", async () => {
  const clock = fakeClock();
  const backend = createFakeValkeyBackend(clock);
  const fatalErrors = [];
  const ownerA = await createValkeyAccountOwner({
    nodeId: "node-a",
    processToken: TOKEN_A,
    leaseMs: 3000,
    now: clock.now,
    client: backend.client(),
    onPresenceRevisionFloor(_accountId, floor) {
      return floor - 1;
    },
    onFatal(error) {
      fatalErrors.push(error.code);
    },
  });
  const ownerB = await createOwner(
    backend,
    clock,
    "node-b",
    TOKEN_B,
    (_accountId, floor) => floor,
  );

  try {
    await assert.rejects(
      ownerA.admit("acc_floor"),
      (error) => error.code === "cluster_account_presence_floor_rejected",
    );
    assert.equal(ownerA.health().ok, false);
    assert.equal(ownerA.health().fatal, true);
    assert.deepEqual(fatalErrors, ["cluster_account_presence_floor_rejected"]);
    assert.equal(backend.ownerCount(), 0);

    const takeover = await ownerB.admit("acc_floor");
    assert.equal(takeover.generation, 2);
    assert.equal(takeover.presenceRevisionFloor, PRESENCE_REVISION_STRIDE * 2);
  } finally {
    await Promise.all([ownerA.close(), ownerB.close()]);
  }
});

test("an expired or stolen local lease cannot be silently reacquired", async () => {
  const clock = fakeClock();
  const backend = createFakeValkeyBackend(clock);
  const ownerA = await createOwner(
    backend,
    clock,
    "node-a",
    TOKEN_A,
    (_accountId, floor) => floor,
  );
  const ownerB = await createOwner(
    backend,
    clock,
    "node-b",
    TOKEN_B,
    (_accountId, floor) => floor,
  );

  try {
    await ownerA.admit("acc_expired");
    clock.advance(3001);
    await assert.rejects(
      ownerA.admit("acc_expired"),
      (error) => error.code === "cluster_account_owner_unavailable",
    );
    assert.equal(ownerA.health().fatal, true);
    const takeover = await ownerB.admit("acc_expired");
    assert.equal(takeover.generation, 2);
  } finally {
    await Promise.all([ownerA.close(), ownerB.close()]);
  }

  const secondClock = fakeClock();
  const secondBackend = createFakeValkeyBackend(secondClock);
  const stolenOwner = await createOwner(
    secondBackend,
    secondClock,
    "node-c",
    TOKEN_C,
    (_accountId, floor) => floor,
  );
  try {
    await stolenOwner.admit("acc_stolen");
    secondClock.advance(1600);
    secondBackend.stealFirst(TOKEN_B, 3000);
    await assert.rejects(
      stolenOwner.admit("acc_stolen"),
      (error) => error.code === "cluster_account_owner_conflict",
    );
    assert.equal(stolenOwner.health().fatal, true);
  } finally {
    await stolenOwner.close();
  }
});

test("control connection failures turn readiness red until a real command recovers", async () => {
  const clock = fakeClock();
  const backend = createFakeValkeyBackend(clock);
  const owner = await createOwner(
    backend,
    clock,
    "node-a",
    TOKEN_A,
    (_accountId, floor) => floor,
  );
  try {
    await owner.admit("acc_health");
    clock.advance(1600);
    backend.failNext(new Error("connection unavailable"));
    await assert.rejects(
      owner.admit("acc_health"),
      (error) => error.code === "cluster_account_owner_acquire_failed",
    );
    assert.equal(owner.health().ok, false);
    assert.equal(owner.health().runtimeHealthy, false);
    assert.equal((await owner.admit("acc_health")).generation, 1);
    assert.equal(owner.health().ok, true);
    assert.equal(owner.health().runtimeHealthy, true);
  } finally {
    await owner.close();
  }
});

test("account owner validates its dedicated control connection at startup", async () => {
  let closeCalls = 0;
  await assert.rejects(
    createValkeyAccountOwner({
      nodeId: "node-a",
      processToken: TOKEN_A,
      client: {
        customCommand() {
          throw new Error("cannot ping");
        },
        close() {
          closeCalls += 1;
        },
      },
    }),
    (error) => error.code === "cluster_account_owner_connect_failed",
  );
  assert.equal(closeCalls, 1);
});

async function createOwner(backend, clock, nodeId, processToken, observer) {
  return createValkeyAccountOwner({
    nodeId,
    processToken,
    leaseMs: 3000,
    now: clock.now,
    client: backend.client(),
    onPresenceRevisionFloor: observer,
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

function createFakeValkeyBackend(clock) {
  const owners = new Map();
  const generations = new Map();
  let openClientCount = 0;
  let nextCommandError = null;

  function liveOwner(key) {
    const owner = owners.get(key) || null;
    if (owner && owner.expiresAtMs <= clock.now()) {
      owners.delete(key);
      return null;
    }
    return owner;
  }

  function client() {
    openClientCount += 1;
    let closed = false;
    return {
      async customCommand(command) {
        if (command[0] === "PING") {
          return "PONG";
        }
        if (nextCommandError) {
          const error = nextCommandError;
          nextCommandError = null;
          throw error;
        }
        assert.equal(command[0], "EVAL");
        const script = String(command[1] || "");
        const keyCount = Number(command[2] || 0);
        const keys = command.slice(3, 3 + keyCount).map(String);
        const args = command.slice(3 + keyCount).map(String);
        if (script.includes("redis.call('INCR', KEYS[2])")) {
          const current = liveOwner(keys[0]);
          const leaseMs = Number(args[1]);
          if (current) {
            if (current.token === args[0]) {
              current.expiresAtMs = clock.now() + leaseMs;
              return [2, generations.get(keys[1]) || 0, leaseMs];
            }
            return [0, 0, Math.max(0, current.expiresAtMs - clock.now())];
          }
          const generation = (generations.get(keys[1]) || 0) + 1;
          generations.set(keys[1], generation);
          owners.set(keys[0], {token: args[0], expiresAtMs: clock.now() + leaseMs});
          return [1, generation, leaseMs];
        }
        if (script.includes("redis.call('PEXPIRE', KEYS[1], ARGV[2])")) {
          const current = liveOwner(keys[0]);
          if (!current || current.token !== args[0]) {
            return 0;
          }
          current.expiresAtMs = clock.now() + Number(args[1]);
          return 1;
        }
        if (script.includes("redis.call('DEL', KEYS[1])")) {
          const current = liveOwner(keys[0]);
          if (!current || current.token !== args[0]) {
            return 0;
          }
          owners.delete(keys[0]);
          return 1;
        }
        throw new Error("unexpected fake Valkey command");
      },
      close() {
        if (!closed) {
          closed = true;
          openClientCount -= 1;
        }
      },
    };
  }

  return {
    client,
    openClients: () => openClientCount,
    ownerCount() {
      for (const key of Array.from(owners.keys())) {
        liveOwner(key);
      }
      return owners.size;
    },
    ownerKeys: () => Array.from(owners.keys()),
    failNext(error) {
      nextCommandError = error;
    },
    stealFirst(token, leaseMs) {
      const key = Array.from(owners.keys())[0];
      assert.ok(key);
      owners.set(key, {token, expiresAtMs: clock.now() + leaseMs});
    },
  };
}

function accountDigest(accountId) {
  return crypto.createHash("sha256").update(accountId).digest("hex");
}
