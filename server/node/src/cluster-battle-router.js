"use strict";

const crypto = require("node:crypto");
const {
  DURABLE_OPERATION_ID_PATTERN,
  DURABLE_REQUEST_HASH_PATTERN,
} = require("./auth/durable-mutation-state");

const CONTROL_SCHEMA_VERSION = 1;
const DEFAULT_REQUEST_TIMEOUT_MS = 1500;
const DEFAULT_MAX_PENDING_REQUESTS = 1024;
const DEFAULT_MAX_OPERATION_CACHE = 4096;
const DEFAULT_OPERATION_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_ROOM_OWNER_TTL_MS = 30 * 60 * 1000;
const NODE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const REQUEST_ID_PATTERN = /^battle_route_[A-Za-z0-9_-]{24}$/;
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CONTROL_TYPE_PREFIX = "cluster.control.battle.";
const STATE_REQUEST = `${CONTROL_TYPE_PREFIX}state.request`;
const STATE_RESPONSE = `${CONTROL_TYPE_PREFIX}state.response`;
const COMMAND_REQUEST = `${CONTROL_TYPE_PREFIX}command.request`;
const COMMAND_RESPONSE = `${CONTROL_TYPE_PREFIX}command.response`;
const BATTLE_OWNER_EVENT_TYPES = new Set([
  "battle.room_ready",
  "battle.room_updated",
  "battle.command_submitted",
  "battle.turn_resolved",
  "battle.turn",
  "battle.room_closed",
]);

function createClusterBattleRouter(options = {}) {
  const nodeId = canonicalNodeId(options.nodeId);
  if (nodeId === "") {
    throw configurationError("cluster_battle_node_id_invalid", "Cluster battle node id is invalid");
  }
  const eventHub = options.eventHub || null;
  const accountOwner = options.accountOwner || null;
  const service = options.service || null;
  const runtimeStore = options.runtimeStore || null;
  assertBoundary(eventHub, accountOwner, service);
  assertRuntimeBoundary(runtimeStore, service);
  const now = typeof options.now === "function" ? options.now : Date.now;
  const randomBytes = typeof options.randomBytes === "function" ? options.randomBytes : crypto.randomBytes;
  const requestTimeoutMs = boundedInteger(options.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS, 250, 10000);
  const maxPendingRequests = boundedInteger(options.maxPendingRequests, DEFAULT_MAX_PENDING_REQUESTS, 1, 10000);
  const maxOperationCache = boundedInteger(options.maxOperationCache, DEFAULT_MAX_OPERATION_CACHE, 1, 50000);
  const operationCacheTtlMs = boundedInteger(
    options.operationCacheTtlMs,
    DEFAULT_OPERATION_CACHE_TTL_MS,
    1000,
    60 * 60 * 1000,
  );
  const roomOwnerTtlMs = boundedInteger(
    options.roomOwnerTtlMs,
    DEFAULT_ROOM_OWNER_TTL_MS,
    1000,
    24 * 60 * 60 * 1000,
  );
  const pending = new Map();
  const operationCache = new Map();
  const roomOwners = new Map();
  const checkpointTails = new Map();
  const runtimeCredential = runtimeStore
    ? service._issueClusterBattleRuntimeCredential()
    : null;
  const totals = {
    stateRequests: 0,
    commandRequests: 0,
    responses: 0,
    timeouts: 0,
    staleOwnerRejected: 0,
    duplicateOperations: 0,
    operationConflicts: 0,
    remoteExecutions: 0,
    runtimeCheckpoints: 0,
    runtimeCheckpointFailures: 0,
    runtimeTakeovers: 0,
    runtimeTakeoverMisses: 0,
    runtimeTakeoverFallbacks: 0,
  };
  let closed = false;

  const removeControlHandler = eventHub.setClusterControlHandler(onControlEvent);
  const removeRemoteObserver = eventHub.setClusterRemoteEventObserver(observeRemoteBattleEvent);
  const removeServiceObserver = runtimeStore && typeof service.onEvent === "function"
    ? service.onEvent(observeLocalBattleEvent)
    : () => {};
  let closePromise = null;

  async function routeState(contextValue, localResult) {
    const context = normalizeIngressContext(contextValue);
    const interruption = plainRecord(localResult && localResult.interruption)
      ? localResult.interruption
      : null;
    const roomId = canonicalText(interruption && interruption.roomId, 200);
    if (
      !context
      || !localResult
      || localResult.ok !== true
      || localResult.room
      || roomId === ""
    ) {
      return localResult;
    }
    try {
      const result = await sendRequest("state", context, roomId, {}, null);
      return result;
    } catch (error) {
      if (String(error && error.code || "") !== "cluster_battle_route_timeout") {
        throw error;
      }
      const owner = activeRoomOwner(roomId);
      let ownerKnownDead = false;
      if (owner !== "") {
        const lease = await eventHub.clusterNodeLeaseState(owner);
        ownerKnownDead = Boolean(lease && lease.known === true && lease.alive === false);
        if (lease && lease.known === true && lease.alive === true) {
          throw publicUnavailable(error);
        }
      }
      const takeover = await tryRuntimeTakeover(context, roomId);
      if (takeover.handled) {
        return takeover.state;
      }
      if (ownerKnownDead) {
        totals.runtimeTakeoverFallbacks += 1;
        return localResult;
      }
      throw publicUnavailable(error);
    }
  }

  async function routeCommand(contextValue, roomIdValue, payloadValue, operationValue, localResult, localState) {
    const context = normalizeIngressContext(contextValue);
    const roomId = canonicalText(roomIdValue, 200);
    const interruptionRoomId = canonicalText(
      localState && localState.interruption && localState.interruption.roomId,
      200,
    );
    if (
      !context
      || roomId === ""
      || !localResult
      || String(localResult.code || "") !== "battle_room_missing"
      || interruptionRoomId !== roomId
    ) {
      return localResult;
    }
    const operation = normalizeOperation(operationValue);
    if (!operation) {
      return localResult;
    }
    try {
      return await sendRequest("command", context, roomId, payloadValue, operation);
    } catch (error) {
      if (String(error && error.code || "") !== "cluster_battle_route_timeout") {
        throw error;
      }
      const owner = activeRoomOwner(roomId);
      let ownerKnownDead = false;
      if (owner !== "") {
        const lease = await eventHub.clusterNodeLeaseState(owner);
        ownerKnownDead = Boolean(lease && lease.known === true && lease.alive === false);
        if (lease && lease.known === true && lease.alive === true) {
          throw publicUnavailable(error);
        }
      }
      const takeover = await tryRuntimeTakeover(context, roomId);
      if (takeover.handled) {
        const result = await service.invokeDurable(
          "_clusterSubmitBattleCommand",
          [takeover.accountCredential, roomId, jsonSnapshot(payloadValue)],
          operation,
        );
        await checkpointRoom(roomId);
        return result;
      }
      if (ownerKnownDead) {
        totals.runtimeTakeoverFallbacks += 1;
        return localResult;
      }
      throw publicUnavailable(error);
    }
  }

  function sendRequest(kind, context, roomId, payloadValue, operation) {
    if (closed) {
      return Promise.reject(publicUnavailable(runtimeError(
        "cluster_battle_router_closed",
        "Cluster battle router is closed",
      )));
    }
    if (pending.size >= maxPendingRequests) {
      return Promise.reject(publicUnavailable(runtimeError(
        "cluster_battle_route_capacity_full",
        "Cluster battle route queue is full",
      )));
    }
    pruneCaches();
    const requestId = `battle_route_${Buffer.from(randomBytes(18)).toString("base64url")}`;
    if (!REQUEST_ID_PATTERN.test(requestId)) {
      return Promise.reject(publicUnavailable(runtimeError(
        "cluster_battle_request_id_invalid",
        "Cluster battle request id is invalid",
      )));
    }
    const ownerNodeId = activeRoomOwner(roomId);
    const event = {
      type: kind === "command" ? COMMAND_REQUEST : STATE_REQUEST,
      schemaVersion: CONTROL_SCHEMA_VERSION,
      requestId,
      requesterNodeId: nodeId,
      ...(ownerNodeId ? {targetNodeId: ownerNodeId} : {}),
      accountId: context.accountId,
      playerId: context.playerId,
      selectionEpoch: context.selectionEpoch,
      ownerGeneration: context.ownerGeneration,
      roomId,
      ...(kind === "command" ? {
        payload: jsonSnapshot(payloadValue),
        operation,
      } : {}),
    };
    event.intentHash = controlIntentHash(event);
    if (kind === "command") {
      totals.commandRequests += 1;
    } else {
      totals.stateRequests += 1;
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        totals.timeouts += 1;
        reject(runtimeError("cluster_battle_route_timeout", "Cluster battle route timed out"));
      }, requestTimeoutMs);
      timer.unref?.();
      pending.set(requestId, {
        kind,
        roomId,
        expectedResponderNodeId: ownerNodeId,
        resolve,
        reject,
        timer,
      });
      if (eventHub.publishClusterControl(event) !== true) {
        clearTimeout(timer);
        pending.delete(requestId);
        reject(publicUnavailable(runtimeError(
          "cluster_battle_publish_failed",
          "Cluster battle route publish failed",
        )));
      }
    });
  }

  function onControlEvent(eventValue, metadataValue) {
    const event = plainRecord(eventValue) ? eventValue : {};
    const metadata = plainRecord(metadataValue) ? metadataValue : {};
    if (!validControlEnvelope(event, metadata)) {
      return;
    }
    if (event.type === STATE_RESPONSE || event.type === COMMAND_RESPONSE) {
      receiveResponse(event, metadata);
      return;
    }
    if (event.type === STATE_REQUEST || event.type === COMMAND_REQUEST) {
      void handleRequest(event, metadata).catch(() => undefined);
    }
  }

  async function handleRequest(event, metadata) {
    if (closed || (event.targetNodeId && event.targetNodeId !== nodeId)) {
      return;
    }
    const requesterNodeId = canonicalNodeId(event.requesterNodeId);
    const accountId = canonicalAccountId(event.accountId);
    const ownerGeneration = positiveSafeInteger(event.ownerGeneration);
    if (
      requesterNodeId === ""
      || requesterNodeId !== canonicalNodeId(metadata.originNodeId)
      || accountId === ""
      || ownerGeneration <= 0
    ) {
      return;
    }
    let ownsAccount = false;
    try {
      ownsAccount = await accountOwner.verifyRemoteOwner(accountId, requesterNodeId, ownerGeneration);
    } catch {
      return;
    }
    if (!ownsAccount) {
      totals.staleOwnerRejected += 1;
      publishResponse(event, metadata, null, "owner_stale");
      return;
    }
    const credential = service._issueClusterBattleCredential({
      accountId,
      playerId: canonicalText(event.playerId, 200),
      selectionEpoch: positiveSafeInteger(event.selectionEpoch),
    });
    if (!credential || service._clusterBattleRoomKnown(credential, event.roomId) !== true) {
      return;
    }
    let result;
    try {
      if (event.type === STATE_REQUEST) {
        result = await service.invokeDurable(
          "_clusterGetBattleState",
          [credential, event.roomId],
          {actionId: "CLUSTER battle state"},
        );
      } else {
        result = await executeCommandRequest(event, credential);
        if (result && result.ok === true) {
          await checkpointRoom(event.roomId);
        }
      }
    } catch {
      publishResponse(event, metadata, null, "execution_failed");
      return;
    }
    totals.remoteExecutions += 1;
    publishResponse(event, metadata, result, "");
  }

  async function executeCommandRequest(event, credential) {
    const operation = normalizeOperation(event.operation);
    if (!operation) {
      return {
        ok: false,
        code: "idempotency_request_invalid",
        message: "操作校验信息不完整，请重新发起操作。",
      };
    }
    const cacheKey = `${event.accountId}|${operation.operationId}`;
    const cached = activeOperation(cacheKey);
    if (cached) {
      if (cached.requestHash !== operation.requestHash || cached.actionId !== operation.actionId) {
        totals.operationConflicts += 1;
        return {
          ok: false,
          code: "idempotency_key_conflict",
          message: "这个操作标识已经用于另一项请求，请重新发起操作。",
        };
      }
      totals.duplicateOperations += 1;
      return cached.promise;
    }
    const promise = Promise.resolve(service.invokeDurable(
      "_clusterSubmitBattleCommand",
      [credential, event.roomId, jsonSnapshot(event.payload)],
      operation,
    ));
    operationCache.set(cacheKey, {
      actionId: operation.actionId,
      requestHash: operation.requestHash,
      expiresAtMs: finiteNow(now()) + operationCacheTtlMs,
      promise,
    });
    pruneBoundedMap(operationCache, maxOperationCache);
    try {
      return await promise;
    } catch (error) {
      operationCache.delete(cacheKey);
      throw error;
    }
  }

  function publishResponse(request, metadata, result, errorKind) {
    const targetNodeId = canonicalNodeId(request.requesterNodeId);
    if (targetNodeId === "") {
      return false;
    }
    return eventHub.publishClusterControl({
      type: request.type === COMMAND_REQUEST ? COMMAND_RESPONSE : STATE_RESPONSE,
      schemaVersion: CONTROL_SCHEMA_VERSION,
      requestId: request.requestId,
      requesterNodeId: targetNodeId,
      targetNodeId,
      responderNodeId: nodeId,
      roomId: canonicalText(request.roomId, 200),
      ...(errorKind ? {errorKind} : {result: jsonSnapshot(result)}),
      requestOriginEventId: canonicalText(metadata.eventId, 240),
    });
  }

  function receiveResponse(event, metadata) {
    if (event.targetNodeId !== nodeId || event.requesterNodeId !== nodeId) {
      return;
    }
    const responderNodeId = canonicalNodeId(event.responderNodeId);
    if (responderNodeId === "" || responderNodeId !== canonicalNodeId(metadata.originNodeId)) {
      return;
    }
    const request = pending.get(event.requestId);
    if (!request) {
      return;
    }
    if (
      (request.expectedResponderNodeId && responderNodeId !== request.expectedResponderNodeId)
      || canonicalText(event.roomId, 200) !== request.roomId
    ) {
      return;
    }
    const expectedType = request.kind === "command" ? COMMAND_RESPONSE : STATE_RESPONSE;
    if (event.type !== expectedType) {
      return;
    }
    clearTimeout(request.timer);
    pending.delete(event.requestId);
    totals.responses += 1;
    rememberRoomOwner(event.roomId, responderNodeId);
    if (event.errorKind) {
      request.reject(event.errorKind === "owner_stale"
        ? publicSwitching()
        : publicUnavailable(runtimeError(
          "cluster_battle_remote_failed",
          "Cluster battle remote execution failed",
        )));
      return;
    }
    if (!plainRecord(event.result)) {
      request.reject(publicUnavailable(runtimeError(
        "cluster_battle_response_invalid",
        "Cluster battle response is invalid",
      )));
      return;
    }
    request.resolve(jsonSnapshot(event.result));
  }

  function observeRemoteBattleEvent(eventValue, metadataValue) {
    const event = plainRecord(eventValue) ? eventValue : {};
    const metadata = plainRecord(metadataValue) ? metadataValue : {};
    if (!BATTLE_OWNER_EVENT_TYPES.has(String(event.type || ""))) {
      return;
    }
    const roomId = canonicalText(event.roomId || (event.room && event.room.roomId), 200);
    rememberRoomOwner(roomId, metadata.originNodeId);
  }

  function observeLocalBattleEvent(eventValue) {
    const event = plainRecord(eventValue) ? eventValue : {};
    if (!BATTLE_OWNER_EVENT_TYPES.has(String(event.type || ""))) {
      return;
    }
    const roomId = canonicalText(event.roomId || (event.room && event.room.roomId), 200);
    if (roomId === "") {
      return;
    }
    void checkpointRoom(roomId).catch(() => undefined);
  }

  async function checkpointResult(resultValue, roomIdValue = "") {
    const result = plainRecord(resultValue) ? resultValue : null;
    if (!runtimeStore || !result || result.ok !== true) {
      return resultValue;
    }
    const roomId = canonicalText(
      roomIdValue || result.roomId || (result.room && result.room.roomId),
      200,
    );
    if (roomId !== "") {
      await checkpointRoom(roomId);
    }
    return resultValue;
  }

  function checkpointRoom(roomIdValue) {
    if (!runtimeStore) {
      return Promise.resolve(null);
    }
    const roomId = canonicalText(roomIdValue, 200);
    if (roomId === "") {
      return Promise.resolve(null);
    }
    const previous = checkpointTails.get(roomId) || Promise.resolve();
    const operation = previous.catch(() => undefined).then(() => writeRoomCheckpoint(roomId));
    checkpointTails.set(roomId, operation);
    return operation.finally(() => {
      if (checkpointTails.get(roomId) === operation) {
        checkpointTails.delete(roomId);
      }
    });
  }

  async function writeRoomCheckpoint(roomId) {
    const exported = service._clusterExportBattleRuntime(runtimeCredential, roomId);
    if (!exported || exported.ok !== true) {
      totals.runtimeCheckpointFailures += 1;
      throw publicUnavailable(runtimeError(
        String(exported && exported.code || "cluster_battle_runtime_export_failed"),
        "Cluster battle runtime export failed",
      ));
    }
    try {
      if (exported.active !== true) {
        await runtimeStore.remove(roomId);
        return null;
      }
      const checkpoint = await runtimeStore.checkpoint(exported.snapshot);
      totals.runtimeCheckpoints += 1;
      return checkpoint;
    } catch (error) {
      totals.runtimeCheckpointFailures += 1;
      throw publicUnavailable(error);
    }
  }

  async function tryRuntimeTakeover(context, roomId) {
    if (!runtimeStore) {
      return {handled: false, state: null, accountCredential: null};
    }
    let claim;
    try {
      claim = await runtimeStore.claim(roomId);
    } catch (error) {
      if ([
        "cluster_battle_runtime_snapshot_invalid",
        "cluster_battle_runtime_snapshot_too_large",
      ].includes(String(error && error.code || ""))) {
        await discardClaimedRuntime(roomId);
        return {handled: false, state: null, accountCredential: null};
      }
      throw publicUnavailable(error);
    }
    if (!claim || claim.found !== true) {
      totals.runtimeTakeoverMisses += 1;
      return {handled: false, state: null, accountCredential: null};
    }
    const hydrated = await service.invokeDurable(
      "_clusterHydrateBattleRuntime",
      [runtimeCredential, claim.snapshot],
      {actionId: "CLUSTER battle runtime hydrate"},
    );
    if (!hydrated || hydrated.ok !== true) {
      const safeFallbackCodes = new Set([
        "cluster_battle_runtime_ticket_stale",
        "cluster_battle_runtime_snapshot_invalid",
        "cluster_battle_runtime_participants_invalid",
        "cluster_battle_runtime_account_busy",
      ]);
      if (safeFallbackCodes.has(String(hydrated && hydrated.code || ""))) {
        await discardClaimedRuntime(roomId);
        return {handled: false, state: null, accountCredential: null};
      }
      throw publicUnavailable(runtimeError(
        String(hydrated && hydrated.code || "cluster_battle_runtime_hydrate_failed"),
        "Cluster battle runtime hydration failed",
      ));
    }
    roomOwners.delete(roomId);
    totals.runtimeTakeovers += 1;
    await checkpointRoom(roomId);
    const accountCredential = service._issueClusterBattleCredential({
      accountId: context.accountId,
      playerId: context.playerId,
      selectionEpoch: context.selectionEpoch,
    });
    if (!accountCredential) {
      throw publicSwitching();
    }
    const state = await service.invokeDurable(
      "_clusterGetBattleState",
      [accountCredential, roomId],
      {actionId: "CLUSTER hydrated battle state"},
    );
    if (!state || state.ok !== true || !state.room) {
      throw publicUnavailable(runtimeError(
        String(state && state.code || "cluster_battle_runtime_state_failed"),
        "Hydrated battle state is unavailable",
      ));
    }
    return {handled: true, state, accountCredential};
  }

  async function discardClaimedRuntime(roomId) {
    try {
      const removed = await runtimeStore.remove(roomId);
      if (removed !== true) {
        throw runtimeError(
          "cluster_battle_runtime_discard_failed",
          "Claimed battle runtime could not be discarded",
        );
      }
    } catch (error) {
      throw publicUnavailable(error);
    }
  }

  function rememberRoomOwner(roomIdValue, ownerNodeIdValue) {
    const roomId = canonicalText(roomIdValue, 200);
    const ownerNodeId = canonicalNodeId(ownerNodeIdValue);
    if (roomId === "" || ownerNodeId === "" || ownerNodeId === nodeId) {
      return;
    }
    roomOwners.delete(roomId);
    roomOwners.set(roomId, {
      nodeId: ownerNodeId,
      expiresAtMs: finiteNow(now()) + roomOwnerTtlMs,
    });
  }

  function activeRoomOwner(roomId) {
    const key = canonicalText(roomId, 200);
    const record = roomOwners.get(key);
    if (!record) {
      return "";
    }
    if (record.expiresAtMs <= finiteNow(now())) {
      roomOwners.delete(key);
      return "";
    }
    return record.nodeId;
  }

  function activeOperation(key) {
    const record = operationCache.get(key) || null;
    if (record && record.expiresAtMs <= finiteNow(now())) {
      operationCache.delete(key);
      return null;
    }
    return record;
  }

  function pruneCaches() {
    for (const [key, record] of roomOwners) {
      if (record.expiresAtMs <= finiteNow(now())) {
        roomOwners.delete(key);
      }
    }
    for (const [key, record] of operationCache) {
      if (record.expiresAtMs <= finiteNow(now())) {
        operationCache.delete(key);
      }
    }
  }

  function close() {
    if (closePromise) {
      return closePromise;
    }
    closed = true;
    removeControlHandler?.();
    removeRemoteObserver?.();
    removeServiceObserver?.();
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(publicUnavailable(runtimeError(
        "cluster_battle_router_closed",
        "Cluster battle router is closed",
      )));
    }
    pending.clear();
    operationCache.clear();
    roomOwners.clear();
    const activeCheckpoints = Array.from(new Set(checkpointTails.values()));
    closePromise = Promise.allSettled(activeCheckpoints).then(() => {
      checkpointTails.clear();
    });
    return closePromise;
  }

  function metrics() {
    pruneCaches();
    return Object.freeze({
      enabled: true,
      closed,
      pendingRequests: pending.size,
      cachedOperations: operationCache.size,
      knownRoomOwners: roomOwners.size,
      ...totals,
    });
  }

  return Object.freeze({routeState, routeCommand, checkpointResult, close, metrics});
}

function isClusterBattleControlEvent(eventValue) {
  const event = plainRecord(eventValue) ? eventValue : {};
  return [STATE_REQUEST, STATE_RESPONSE, COMMAND_REQUEST, COMMAND_RESPONSE]
    .includes(String(event.type || ""));
}

function validControlEnvelope(event, metadata) {
  if (
    Number(event.schemaVersion) !== CONTROL_SCHEMA_VERSION
    || !isClusterBattleControlEvent(event)
    || !REQUEST_ID_PATTERN.test(String(event.requestId || ""))
    || canonicalNodeId(metadata.originNodeId) === ""
  ) {
    return false;
  }
  if (event.type === STATE_REQUEST || event.type === COMMAND_REQUEST) {
    return String(event.intentHash || "") === controlIntentHash(event);
  }
  return true;
}

function controlIntentHash(eventValue) {
  const event = plainRecord(eventValue) ? eventValue : {};
  return crypto.createHash("sha256").update(stableJson({
    type: String(event.type || ""),
    requestId: String(event.requestId || ""),
    requesterNodeId: String(event.requesterNodeId || ""),
    targetNodeId: String(event.targetNodeId || ""),
    accountId: String(event.accountId || ""),
    playerId: String(event.playerId || ""),
    selectionEpoch: Number(event.selectionEpoch || 0),
    ownerGeneration: Number(event.ownerGeneration || 0),
    roomId: String(event.roomId || ""),
    payload: event.type === COMMAND_REQUEST ? event.payload : null,
    operation: event.type === COMMAND_REQUEST ? event.operation : null,
  })).digest("hex");
}

function normalizeIngressContext(value) {
  const source = plainRecord(value) ? value : {};
  const accountId = canonicalAccountId(source.accountId);
  const playerId = canonicalText(source.playerId, 200);
  const selectionEpoch = positiveSafeInteger(source.selectionEpoch);
  const ownerGeneration = positiveSafeInteger(source.ownerGeneration || source.generation);
  if (accountId === "" || playerId === "" || selectionEpoch <= 0 || ownerGeneration <= 0) {
    return null;
  }
  return Object.freeze({accountId, playerId, selectionEpoch, ownerGeneration});
}

function normalizeOperation(value) {
  const source = plainRecord(value) ? value : {};
  const operationId = String(source.operationId || "").trim();
  const requestHash = String(source.requestHash || "").trim().toLowerCase();
  const actionId = canonicalText(source.actionId, 160);
  if (
    !DURABLE_OPERATION_ID_PATTERN.test(operationId)
    || !DURABLE_REQUEST_HASH_PATTERN.test(requestHash)
    || actionId === ""
  ) {
    return null;
  }
  return Object.freeze({operationId, requestHash, actionId});
}

function assertBoundary(eventHub, accountOwner, service) {
  if (
    !eventHub
    || typeof eventHub.publishClusterControl !== "function"
    || typeof eventHub.setClusterControlHandler !== "function"
    || typeof eventHub.setClusterRemoteEventObserver !== "function"
    || typeof eventHub.clusterNodeLeaseState !== "function"
    || !accountOwner
    || typeof accountOwner.verifyRemoteOwner !== "function"
    || !service
    || typeof service._issueClusterBattleCredential !== "function"
    || typeof service._clusterBattleRoomKnown !== "function"
    || typeof service.invokeDurable !== "function"
  ) {
    throw configurationError(
      "cluster_battle_boundary_invalid",
      "Cluster battle routing boundary is incomplete",
    );
  }
}

function assertRuntimeBoundary(runtimeStore, service) {
  if (!runtimeStore) {
    return;
  }
  if (
    typeof runtimeStore.checkpoint !== "function"
    || typeof runtimeStore.claim !== "function"
    || typeof runtimeStore.remove !== "function"
    || typeof runtimeStore.health !== "function"
    || !service
    || typeof service.onEvent !== "function"
    || typeof service._issueClusterBattleRuntimeCredential !== "function"
    || typeof service._clusterExportBattleRuntime !== "function"
    || typeof service._clusterHydrateBattleRuntime !== "function"
    || typeof service.invokeDurable !== "function"
  ) {
    throw configurationError(
      "cluster_battle_runtime_boundary_invalid",
      "Cluster battle runtime boundary is incomplete",
    );
  }
  const credential = service._issueClusterBattleRuntimeCredential();
  if (!credential || String(credential.credentialKind || "") !== "cluster_battle_runtime_v1") {
    throw configurationError(
      "cluster_battle_runtime_boundary_invalid",
      "Cluster battle runtime credential boundary is incomplete",
    );
  }
}

function publicUnavailable(cause) {
  const error = new Error("战斗服务器正在同步，请稍后使用同一操作重试。");
  error.name = "ClusterBattleRoutingError";
  error.code = "battle_route_unavailable";
  error.statusCode = 503;
  error.publicMessage = error.message;
  error.retryAfterMs = Number.isFinite(Number(cause && cause.retryAfterMs))
    ? Math.max(250, Math.min(120000, Math.ceil(Number(cause.retryAfterMs))))
    : 500;
  error.cause = cause;
  return error;
}

function publicSwitching() {
  const error = new Error("账号正在切换服务器，请稍后重试。");
  error.name = "ClusterBattleRoutingError";
  error.code = "account_node_switching";
  error.statusCode = 503;
  error.publicMessage = error.message;
  error.retryAfterMs = 500;
  return error;
}

function runtimeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function configurationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function canonicalNodeId(value) {
  const text = String(value || "").trim();
  return NODE_ID_PATTERN.test(text) ? text : "";
}

function canonicalAccountId(value) {
  const text = String(value || "").trim();
  return ACCOUNT_ID_PATTERN.test(text) ? text : "";
}

function canonicalText(value, limit) {
  const text = String(value || "").trim();
  return text !== "" && Buffer.byteLength(text) <= limit && !/[\u0000-\u001f\u007f]/.test(text)
    ? text
    : "";
}

function positiveSafeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function finiteNow(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : Date.now();
}

function plainRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function jsonSnapshot(value) {
  return JSON.parse(JSON.stringify(value === undefined ? null : value));
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (plainRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function pruneBoundedMap(map, maximum) {
  while (map.size > maximum) {
    map.delete(map.keys().next().value);
  }
}

module.exports = {
  COMMAND_REQUEST,
  COMMAND_RESPONSE,
  STATE_REQUEST,
  STATE_RESPONSE,
  createClusterBattleRouter,
  isClusterBattleControlEvent,
};
