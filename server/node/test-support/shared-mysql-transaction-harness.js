"use strict";

const OPERATION_MARKER = Symbol("beastbound.sharedMysqlHarnessOperation");

function createSharedMysqlTransactionHarness(options = {}) {
  let committedTables = normalizeSeed(options.seed);
  const statementHandler = typeof options.statementHandler === "function"
    ? options.statementHandler
    : null;
  const onCommittedSnapshot = typeof options.onCommittedSnapshot === "function"
    ? options.onCommittedSnapshot
    : null;
  const locks = new Map();
  const transactions = new Map();
  const connections = new Set();
  const pools = new Set();
  const eventLog = [];
  const eventWaiters = new Set();
  const gates = [];
  const faults = [];
  let nextConnectionId = 1;
  let nextTransactionId = 1;
  let nextEventSequence = 1;
  let nextWaitSequence = 1;

  function poolFor(writerIdValue) {
    const writerId = requiredIdentity(writerIdValue, "writerId");
    const pool = {
      writerId,
      ended: false,
      async getConnection() {
        if (pool.ended) {
          throw harnessError("shared_mysql_pool_closed", `测试连接池已关闭：${writerId}`);
        }
        const connectionState = {
          connectionId: nextConnectionId++,
          writerId,
          released: false,
          transaction: null,
        };
        connections.add(connectionState);
        recordEvent("connection_acquired", connectionState);
        return createConnection(connectionState);
      },
      async query(statement) {
        throw unknownOperationError(statement, "连接池级 query 未建模；请显式获取事务连接。", writerId);
      },
      async end() {
        if (!pool.ended) {
          pool.ended = true;
          recordEvent("pool_ended", {writerId});
        }
      },
    };
    pools.add(pool);
    return pool;
  }

  function createConnection(connectionState) {
    return {
      async beginTransaction() {
        assertConnectionOpen(connectionState);
        if (connectionState.transaction !== null
          && connectionState.transaction.state === "active") {
          throw harnessError("shared_mysql_transaction_active", "同一测试连接不能重复开启事务。");
        }
        const transaction = {
          transactionId: nextTransactionId++,
          connectionId: connectionState.connectionId,
          writerId: connectionState.writerId,
          state: "active",
          heldLocks: new Set(),
          waitingLocks: new Set(),
          writes: new Map(),
          queryCount: 0,
        };
        connectionState.transaction = transaction;
        transactions.set(transaction.transactionId, transaction);
        recordEvent("transaction_begun", transaction);
      },

      async query(statement, params = []) {
        assertConnectionOpen(connectionState);
        const transaction = activeTransaction(connectionState);
        transaction.queryCount += 1;
        const operation = await resolveOperation(statement, params, transaction);
        recordEvent("query_started", {
          ...transaction,
          operationType: operation.type,
        });
        const result = await executeOperation(transaction, operation);
        recordEvent("query_completed", {
          ...transaction,
          operationType: operation.type,
        });
        return result;
      },

      async commit() {
        assertConnectionOpen(connectionState);
        const transaction = activeTransaction(connectionState);
        await commitTransaction(transaction);
      },

      async rollback() {
        assertConnectionOpen(connectionState);
        const transaction = connectionState.transaction;
        if (transaction === null) {
          recordEvent("rollback_without_transaction", connectionState);
          return;
        }
        rollbackTransaction(transaction);
      },

      release() {
        if (connectionState.released) {
          return;
        }
        connectionState.released = true;
        const transaction = connectionState.transaction;
        recordEvent(
          transaction !== null && transaction.state === "active"
            ? "connection_released_with_active_transaction"
            : "connection_released",
          transaction || connectionState,
        );
      },
    };
  }

  async function resolveOperation(statement, params, transaction) {
    if (isHarnessOperation(statement)) {
      return statement;
    }
    if (statementHandler !== null) {
      const resolved = await statementHandler({
        statement,
        sql: statementSql(statement),
        params: cloneValue(params),
        transactionId: transaction.transactionId,
        writerId: transaction.writerId,
        operation: sharedMysqlOperation,
      });
      if (isHarnessOperation(resolved)) {
        return resolved;
      }
    }
    throw unknownOperationError(statement, "共享 MySQL harness 遇到未建模操作。", transaction.writerId);
  }

  async function executeOperation(transaction, operation) {
    switch (operation.type) {
      case "select_for_update": {
        await acquirePrimaryKeyLock(transaction, operation.table, operation.key);
        const row = visibleRow(transaction, operation.table, operation.key);
        return [[...(row === null ? [] : [cloneValue(row)])], []];
      }
      case "read": {
        const row = visibleRow(transaction, operation.table, operation.key);
        return [[...(row === null ? [] : [cloneValue(row)])], []];
      }
      case "insert": {
        await acquirePrimaryKeyLock(transaction, operation.table, operation.key);
        if (visibleRow(transaction, operation.table, operation.key) !== null) {
          const duplicate = harnessError(
            "ER_DUP_ENTRY",
            `Duplicate entry '${operation.key}' for key '${operation.table}.PRIMARY'`,
          );
          duplicate.errno = 1062;
          duplicate.sqlState = "23000";
          throw duplicate;
        }
        stageSet(transaction, operation.table, operation.key, operation.row, "insert");
        return [{affectedRows: 1}, []];
      }
      case "update": {
        await acquirePrimaryKeyLock(transaction, operation.table, operation.key);
        const current = visibleRow(transaction, operation.table, operation.key);
        if (current === null || !matchesWhere(current, operation.where)) {
          recordEvent("write_condition_missed", {
            ...transaction,
            table: operation.table,
            key: operation.key,
          });
          return [{affectedRows: 0}, []];
        }
        const next = {...cloneValue(current), ...cloneValue(operation.set)};
        stageSet(transaction, operation.table, operation.key, next, "update");
        return [{affectedRows: 1}, []];
      }
      case "delete": {
        await acquirePrimaryKeyLock(transaction, operation.table, operation.key);
        const current = visibleRow(transaction, operation.table, operation.key);
        if (current === null || !matchesWhere(current, operation.where)) {
          recordEvent("write_condition_missed", {
            ...transaction,
            table: operation.table,
            key: operation.key,
          });
          return [{affectedRows: 0}, []];
        }
        stageDelete(transaction, operation.table, operation.key);
        return [{affectedRows: 1}, []];
      }
      default:
        throw unknownOperationError(operation, `未知 harness operation type：${operation.type}`, transaction.writerId);
    }
  }

  async function acquirePrimaryKeyLock(transaction, tableValue, keyValue) {
    assertActive(transaction);
    const table = requiredIdentity(tableValue, "table");
    const key = requiredIdentity(keyValue, "primaryKey");
    const encoded = encodeRowKey(table, key);
    let lock = locks.get(encoded);
    if (!lock) {
      lock = {table, key, ownerTransactionId: null, waiters: []};
      locks.set(encoded, lock);
    }
    if (lock.ownerTransactionId === transaction.transactionId) {
      recordEvent("lock_reentered", {...transaction, table, key});
      return;
    }
    if (lock.ownerTransactionId === null) {
      lock.ownerTransactionId = transaction.transactionId;
      transaction.heldLocks.add(encoded);
      recordEvent("lock_acquired", {...transaction, table, key});
      return;
    }

    const owner = transactions.get(lock.ownerTransactionId) || null;
    const deferred = createDeferred();
    const waiter = {
      sequence: nextWaitSequence++,
      transactionId: transaction.transactionId,
      resolve: deferred.resolve,
      reject: deferred.reject,
    };
    lock.waiters.push(waiter);
    transaction.waitingLocks.add(encoded);
    recordEvent("lock_wait", {
      ...transaction,
      table,
      key,
      ownerTransactionId: lock.ownerTransactionId,
      ownerWriterId: owner ? owner.writerId : "",
      waitSequence: waiter.sequence,
    });
    await deferred.promise;
    assertActive(transaction);
  }

  async function commitTransaction(transaction) {
    assertActive(transaction);
    await enterGate(transaction, "before_commit_apply");
    const beforeFault = consumeFault(transaction, "commit_before_apply");
    if (beforeFault !== null) {
      recordEvent("commit_failed_before_apply", transaction);
      throw beforeFault;
    }

    const nextTables = cloneTables(committedTables);
    for (const write of [...transaction.writes.values()].sort((left, right) => left.sequence - right.sequence)) {
      let table = nextTables.get(write.table);
      if (!table) {
        table = new Map();
        nextTables.set(write.table, table);
      }
      if (write.kind === "delete") {
        table.delete(write.key);
      } else {
        table.set(write.key, cloneValue(write.row));
      }
    }
    committedTables = nextTables;
    transaction.state = "committed";
    recordEvent("commit_applied", {
      ...transaction,
      writeCount: transaction.writes.size,
    });
    releaseAllLocks(transaction);

    if (onCommittedSnapshot !== null) {
      await onCommittedSnapshot(snapshot(), {
        transactionId: transaction.transactionId,
        writerId: transaction.writerId,
      });
    }

    const afterFault = consumeFault(transaction, "commit_after_apply");
    if (afterFault !== null) {
      recordEvent("commit_response_lost_after_apply", transaction);
      throw afterFault;
    }
    recordEvent("commit_completed", transaction);
  }

  function rollbackTransaction(transaction) {
    if (transaction.state === "committed") {
      recordEvent("rollback_after_commit_ignored", transaction);
      return;
    }
    if (transaction.state === "rolled_back") {
      recordEvent("rollback_repeated", transaction);
      return;
    }
    cancelWaitingLocks(transaction);
    transaction.writes.clear();
    transaction.state = "rolled_back";
    recordEvent("rollback_applied", transaction);
    releaseAllLocks(transaction);
  }

  function releaseAllLocks(transaction) {
    const encodedKeys = [...transaction.heldLocks].sort();
    transaction.heldLocks.clear();
    for (const encoded of encodedKeys) {
      const lock = locks.get(encoded);
      if (!lock || lock.ownerTransactionId !== transaction.transactionId) {
        continue;
      }
      lock.ownerTransactionId = null;
      recordEvent("lock_released", {
        ...transaction,
        table: lock.table,
        key: lock.key,
      });
      grantNextWaiter(lock, encoded);
    }
  }

  function grantNextWaiter(lock, encoded) {
    while (lock.waiters.length > 0) {
      const waiter = lock.waiters.shift();
      const next = transactions.get(waiter.transactionId) || null;
      if (next === null || next.state !== "active") {
        waiter.reject(harnessError("shared_mysql_waiter_cancelled", "等待锁的测试事务已取消。"));
        continue;
      }
      lock.ownerTransactionId = next.transactionId;
      next.waitingLocks.delete(encoded);
      next.heldLocks.add(encoded);
      recordEvent("lock_granted", {
        ...next,
        table: lock.table,
        key: lock.key,
        waitSequence: waiter.sequence,
      });
      waiter.resolve();
      return;
    }
    locks.delete(encoded);
  }

  function cancelWaitingLocks(transaction) {
    for (const encoded of transaction.waitingLocks) {
      const lock = locks.get(encoded);
      if (!lock) {
        continue;
      }
      const retained = [];
      for (const waiter of lock.waiters) {
        if (waiter.transactionId === transaction.transactionId) {
          waiter.reject(harnessError("shared_mysql_transaction_rolled_back", "事务等待锁时已回滚。"));
        } else {
          retained.push(waiter);
        }
      }
      lock.waiters = retained;
      if (lock.ownerTransactionId === null && lock.waiters.length === 0) {
        locks.delete(encoded);
      }
    }
    transaction.waitingLocks.clear();
  }

  function visibleRow(transaction, tableValue, keyValue) {
    const table = requiredIdentity(tableValue, "table");
    const key = requiredIdentity(keyValue, "primaryKey");
    const encoded = encodeRowKey(table, key);
    if (transaction.writes.has(encoded)) {
      const write = transaction.writes.get(encoded);
      return write.kind === "delete" ? null : cloneValue(write.row);
    }
    const committedTable = committedTables.get(table);
    return committedTable && committedTable.has(key)
      ? cloneValue(committedTable.get(key))
      : null;
  }

  function stageSet(transaction, tableValue, keyValue, rowValue, source) {
    assertActive(transaction);
    const table = requiredIdentity(tableValue, "table");
    const key = requiredIdentity(keyValue, "primaryKey");
    const encoded = encodeRowKey(table, key);
    transaction.writes.set(encoded, {
      sequence: nextWaitSequence++,
      table,
      key,
      kind: "set",
      row: cloneValue(rowValue),
    });
    recordEvent("write_staged", {...transaction, table, key, source});
  }

  function stageDelete(transaction, tableValue, keyValue) {
    assertActive(transaction);
    const table = requiredIdentity(tableValue, "table");
    const key = requiredIdentity(keyValue, "primaryKey");
    const encoded = encodeRowKey(table, key);
    transaction.writes.set(encoded, {
      sequence: nextWaitSequence++,
      table,
      key,
      kind: "delete",
      row: null,
    });
    recordEvent("write_staged", {...transaction, table, key, source: "delete"});
  }

  function snapshot() {
    const result = {};
    for (const tableName of [...committedTables.keys()].sort()) {
      result[tableName] = {};
      const table = committedTables.get(tableName);
      for (const key of [...table.keys()].sort()) {
        result[tableName][key] = cloneValue(table.get(key));
      }
    }
    return result;
  }

  function recordEvent(type, source = {}) {
    const event = Object.freeze({
      sequence: nextEventSequence++,
      type,
      writerId: String(source.writerId || ""),
      connectionId: Number(source.connectionId || 0),
      transactionId: Number(source.transactionId || 0),
      table: String(source.table || ""),
      key: String(source.key || ""),
      ownerTransactionId: Number(source.ownerTransactionId || 0),
      ownerWriterId: String(source.ownerWriterId || ""),
      waitSequence: Number(source.waitSequence || 0),
      operationType: String(source.operationType || ""),
      source: String(source.source || ""),
      writeCount: Number(source.writeCount || 0),
    });
    eventLog.push(event);
    for (const waiter of [...eventWaiters]) {
      if (!waiter.predicate(event)) {
        continue;
      }
      eventWaiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(cloneValue(event));
    }
    return event;
  }

  function events() {
    return eventLog.map((event) => cloneValue(event));
  }

  function waitForEvent(match, timeoutMs = 1000) {
    const predicate = eventPredicate(match);
    const existing = eventLog.find(predicate);
    if (existing) {
      return Promise.resolve(cloneValue(existing));
    }
    return new Promise((resolve, reject) => {
      const waiter = {predicate, resolve, reject, timer: null};
      waiter.timer = setTimeout(() => {
        eventWaiters.delete(waiter);
        reject(harnessError(
          "shared_mysql_event_timeout",
          `等待共享 MySQL harness 事件超时：${describeMatch(match)}`,
        ));
      }, positiveTimeout(timeoutMs));
      eventWaiters.add(waiter);
    });
  }

  function blockNext(input = {}) {
    const phase = requiredIdentity(input.phase, "phase");
    const writerId = String(input.writerId || "");
    const timeoutMs = positiveTimeout(input.timeoutMs ?? 1000);
    const entered = createDeferred();
    const released = createDeferred();
    const gate = {
      phase,
      writerId,
      consumed: false,
      expired: false,
      released: false,
      entered,
      releasedDeferred: released,
      timer: null,
    };
    gate.timer = setTimeout(() => {
      if (gate.consumed || gate.released) {
        return;
      }
      gate.expired = true;
      gate.released = true;
      entered.reject(harnessError(
        "shared_mysql_gate_timeout",
        `等待共享 MySQL harness gate 进入超时：${phase}/${writerId || "*"}`,
      ));
      released.resolve();
    }, timeoutMs);
    gates.push(gate);
    return Object.freeze({
      entered: entered.promise,
      release() {
        if (!gate.released) {
          gate.released = true;
          clearTimeout(gate.timer);
          if (!gate.consumed) {
            entered.reject(harnessError(
              "shared_mysql_gate_released_before_enter",
              `共享 MySQL harness gate 在进入前被释放：${phase}/${writerId || "*"}`,
            ));
          }
          released.resolve();
        }
      },
    });
  }

  async function enterGate(transaction, phase) {
    const gate = gates.find((candidate) => (
      !candidate.consumed
      && !candidate.expired
      && !candidate.released
      && candidate.phase === phase
      && (candidate.writerId === "" || candidate.writerId === transaction.writerId)
    ));
    if (!gate) {
      return;
    }
    gate.consumed = true;
    clearTimeout(gate.timer);
    recordEvent("phase_blocked", {...transaction, source: phase});
    gate.entered.resolve();
    await gate.releasedDeferred.promise;
    recordEvent("phase_released", {...transaction, source: phase});
  }

  function failNext(input = {}) {
    const phase = requiredIdentity(input.phase, "phase");
    const writerId = String(input.writerId || "");
    const error = input.error instanceof Error
      ? input.error
      : harnessError(
        String(input.code || "shared_mysql_injected_failure"),
        String(input.message || `注入测试故障：${phase}`),
      );
    faults.push({phase, writerId, error, consumed: false});
  }

  function consumeFault(transaction, phase) {
    const fault = faults.find((candidate) => (
      !candidate.consumed
      && candidate.phase === phase
      && (candidate.writerId === "" || candidate.writerId === transaction.writerId)
    ));
    if (!fault) {
      return null;
    }
    fault.consumed = true;
    return fault.error;
  }

  function assertIdle() {
    const problems = [];
    for (const transaction of transactions.values()) {
      if (transaction.state === "active") {
        problems.push(`transaction ${transaction.transactionId} still active`);
      }
      if (transaction.heldLocks.size > 0 || transaction.waitingLocks.size > 0) {
        problems.push(`transaction ${transaction.transactionId} retains locks`);
      }
    }
    for (const lock of locks.values()) {
      if (lock.ownerTransactionId !== null || lock.waiters.length > 0) {
        problems.push(`lock ${lock.table}/${lock.key} is not idle`);
      }
    }
    for (const connection of connections) {
      if (!connection.released) {
        problems.push(`connection ${connection.connectionId} not released`);
      }
    }
    if (eventWaiters.size > 0) {
      problems.push(`${eventWaiters.size} event waiter(s) remain`);
    }
    const unreleasedGates = gates.filter((gate) => gate.consumed && !gate.released).length;
    if (unreleasedGates > 0) {
      problems.push(`${unreleasedGates} consumed gate(s) remain blocked`);
    }
    if (problems.length > 0) {
      throw harnessError("shared_mysql_harness_not_idle", problems.join("; "));
    }
    return true;
  }

  return Object.freeze({
    assertIdle,
    blockNext,
    events,
    failNext,
    poolFor,
    snapshot,
    waitForEvent,
  });
}

const sharedMysqlOperation = Object.freeze({
  selectForUpdate(table, key) {
    return harnessOperation("select_for_update", {table, key});
  },
  read(table, key) {
    return harnessOperation("read", {table, key});
  },
  insert(table, key, row) {
    return harnessOperation("insert", {table, key, row: cloneValue(row)});
  },
  update(table, key, options = {}) {
    return harnessOperation("update", {
      table,
      key,
      where: cloneValue(options.where || {}),
      set: cloneValue(options.set || {}),
    });
  },
  delete(table, key, options = {}) {
    return harnessOperation("delete", {
      table,
      key,
      where: cloneValue(options.where || {}),
    });
  },
});

function harnessOperation(type, fields) {
  const operation = {...fields, type};
  Object.defineProperty(operation, OPERATION_MARKER, {
    enumerable: false,
    configurable: false,
    writable: false,
    value: true,
  });
  return Object.freeze(operation);
}

function isHarnessOperation(value) {
  return Boolean(value && typeof value === "object" && value[OPERATION_MARKER] === true);
}

function normalizeSeed(seedValue) {
  const tables = new Map();
  const seed = seedValue && typeof seedValue === "object" && !Array.isArray(seedValue)
    ? seedValue
    : {};
  for (const tableName of Object.keys(seed)) {
    const table = new Map();
    const rows = seed[tableName] && typeof seed[tableName] === "object" && !Array.isArray(seed[tableName])
      ? seed[tableName]
      : {};
    for (const key of Object.keys(rows)) {
      table.set(String(key), cloneValue(rows[key]));
    }
    tables.set(String(tableName), table);
  }
  return tables;
}

function cloneTables(source) {
  const result = new Map();
  for (const [tableName, table] of source.entries()) {
    const clonedTable = new Map();
    for (const [key, row] of table.entries()) {
      clonedTable.set(key, cloneValue(row));
    }
    result.set(tableName, clonedTable);
  }
  return result;
}

function matchesWhere(row, whereValue) {
  const where = whereValue && typeof whereValue === "object" && !Array.isArray(whereValue)
    ? whereValue
    : {};
  for (const key of Object.keys(where)) {
    if (JSON.stringify(row && row[key]) !== JSON.stringify(where[key])) {
      return false;
    }
  }
  return true;
}

function activeTransaction(connectionState) {
  const transaction = connectionState.transaction;
  if (transaction === null) {
    throw harnessError("shared_mysql_transaction_missing", "测试 query/commit 必须位于事务内。");
  }
  assertActive(transaction);
  return transaction;
}

function assertActive(transaction) {
  if (!transaction || transaction.state !== "active") {
    throw harnessError(
      "shared_mysql_transaction_inactive",
      `测试事务不是 active：${transaction ? transaction.state : "missing"}`,
    );
  }
}

function assertConnectionOpen(connectionState) {
  if (connectionState.released) {
    throw harnessError("shared_mysql_connection_released", "测试连接已经释放。");
  }
}

function encodeRowKey(table, key) {
  return JSON.stringify([table, key]);
}

function requiredIdentity(value, label) {
  const normalized = String(value || "").trim();
  if (normalized === "") {
    throw harnessError("shared_mysql_identity_missing", `${label} 不能为空。`);
  }
  return normalized;
}

function eventPredicate(match) {
  if (typeof match === "function") {
    return match;
  }
  const expected = match && typeof match === "object" && !Array.isArray(match) ? match : {};
  return (event) => Object.keys(expected).every((key) => (
    JSON.stringify(event[key]) === JSON.stringify(expected[key])
  ));
}

function describeMatch(match) {
  if (typeof match === "function") {
    return "predicate";
  }
  try {
    return JSON.stringify(match || {});
  } catch {
    return "event";
  }
}

function positiveTimeout(value) {
  const timeout = Number(value);
  return Number.isFinite(timeout) && timeout > 0 ? Math.trunc(timeout) : 1000;
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
}

function statementSql(statement) {
  return typeof statement === "string"
    ? statement
    : String(statement && statement.sql || "");
}

function unknownOperationError(statement, message, writerId = "") {
  const error = harnessError("shared_mysql_unknown_operation", message);
  error.writerId = writerId;
  error.sql = statementSql(statement);
  return error;
}

function harnessError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cloneValue(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  createSharedMysqlTransactionHarness,
  sharedMysqlOperation,
};
