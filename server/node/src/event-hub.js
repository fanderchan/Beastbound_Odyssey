"use strict";

const crypto = require("node:crypto");
const {performance} = require("node:perf_hooks");
const {
  protocolCompatibility,
  protocolMetadata,
  protocolMismatchResult,
} = require("./protocol");
const {
  createEventSubscriptionIndex,
} = require("./event-hub-subscriptions");
const {
  DEFAULT_EVENT_HUB_WRITER_LIMITS,
  createEventHubWriter,
  encodeEventFrame,
  encodeFrame,
} = require("./event-hub-writer");
const {
  createEventProjectionCache,
  isReusableEventProjection,
} = require("./event-projection-cache");
const {
  BoundedTokenBucketLimiter,
  requestNetworkIdentity,
} = require("./network-admission");
const {
  createEventStreamCursorAuthority,
  eventWindowFromReplay,
} = require("./event-stream-cursor");
const {
  projectPresenceWirePlayers,
} = require("./auth/online-presence");
const {
  WS_CLOSE_MESSAGE_TOO_BIG,
  WS_CLOSE_PROTOCOL_ERROR,
  WS_CLOSE_UNSUPPORTED_DATA,
  createWebSocketFrameParser,
} = require("./websocket-frame-parser");

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const TEST_AUTH_SUBPROTOCOL = "beastbound.test.auth.v1";
const DEFAULT_PENDING_UPGRADES = 64;
const DEFAULT_PENDING_UPGRADES_PER_IP = 8;
const DEFAULT_CONNECTIONS = 512;
const DEFAULT_CONNECTIONS_PER_IP = 64;
const DEFAULT_CONNECTIONS_PER_ACCOUNT = 3;
const DEFAULT_CONNECTIONS_PER_SESSION = 2;
const DEFAULT_CONNECTIONS_PER_TOKEN = 2;
const DEFAULT_UPGRADE_IP_CAPACITY = 120;
const DEFAULT_UPGRADE_IP_WINDOW_MS = 60 * 1000;
const DEFAULT_UPGRADE_ACCOUNT_CAPACITY = 12;
const DEFAULT_UPGRADE_ACCOUNT_WINDOW_MS = 60 * 1000;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 3000;
const DEFAULT_INBOUND_FRAMES_PER_SECOND = 20;
const DEFAULT_INBOUND_FRAME_BURST = 40;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 25 * 1000;
const DEFAULT_HEARTBEAT_DEADLINE_MS = 10 * 1000;
const DEFAULT_HEARTBEAT_SWEEP_MS = 1000;
const DEFAULT_CLOSE_GRACE_MS = 50;
const SERVER_CLOSE_GOING_AWAY = 1001;
const SERVER_CLOSE_POLICY_VIOLATION = 1008;
const POSITION_PROJECTION_FIELDS = new Set(["change", "aoi", "presenceRebase", "player"]);
const POSITION_SELF_CHANGE = "rebase";
const POSITION_REMOTE_CHANGES = new Set(["upsert", "remove"]);
const DEFAULT_POSITION_EVENTS_PER_TURN = 4;
const DEFAULT_POSITION_CLIENTS_PER_TURN = 512;
const DEFAULT_POSITION_DRAIN_BUDGET_MS = 4;
const DEFAULT_PENDING_POSITION_EVENTS = 512;
const DEFAULT_POSITION_BATCH_WINDOW_MS = 16;
const DEFAULT_POSITION_BATCH_CLIENTS_PER_TURN = 32;
const DEFAULT_POSITION_BATCH_BYTES_PER_TURN = 512 * 1024;
const DEFAULT_POSITION_BATCH_FLUSH_BUDGET_MS = 4;
const MAX_POSITION_BATCH_DELTAS = 64;
const MAX_POSITION_BATCH_BYTES = 64 * 1024;

function createEventHub(service, options = {}) {
  const now = typeof options.now === "function" ? options.now : Date.now;
  const randomBytes = typeof options.randomBytes === "function" ? options.randomBytes : crypto.randomBytes;
  const cursorAuthority = options.cursorAuthority || createEventStreamCursorAuthority({
    eventStreamEpoch: options.eventStreamEpoch,
    randomBytes,
  });
  const admission = createWebSocketAdmission(options, {now, randomBytes});
  const allowedOrigins = canonicalAllowedOrigins(options.allowedOrigins);
  const handshakeTimeoutMs = positiveInteger(options.handshakeTimeoutMs, DEFAULT_HANDSHAKE_TIMEOUT_MS);
  const heartbeatIntervalMs = positiveInteger(options.heartbeatIntervalMs, DEFAULT_HEARTBEAT_INTERVAL_MS);
  const heartbeatDeadlineMs = positiveInteger(options.heartbeatDeadlineMs, DEFAULT_HEARTBEAT_DEADLINE_MS);
  const heartbeatSweepMs = positiveInteger(options.heartbeatSweepMs, DEFAULT_HEARTBEAT_SWEEP_MS);
  const positionEventsPerTurn = positiveInteger(
    options.positionEventsPerTurn,
    DEFAULT_POSITION_EVENTS_PER_TURN,
  );
  const positionClientsPerTurn = positiveInteger(
    options.positionClientsPerTurn,
    DEFAULT_POSITION_CLIENTS_PER_TURN,
  );
  const positionDrainBudgetMs = positiveNumber(
    options.positionDrainBudgetMs,
    DEFAULT_POSITION_DRAIN_BUDGET_MS,
  );
  const maxPendingPositionEvents = positiveInteger(
    options.maxPendingPositionEvents,
    DEFAULT_PENDING_POSITION_EVENTS,
  );
  const positionDrainNow = typeof options.positionDrainNow === "function"
    ? options.positionDrainNow
    : () => performance.now();
  const configuredPositionBatchWindowMs = Number(options.positionBatchWindowMs);
  const positionBatchWindowMs = Number.isFinite(configuredPositionBatchWindowMs) && configuredPositionBatchWindowMs >= 0
    ? configuredPositionBatchWindowMs
    : DEFAULT_POSITION_BATCH_WINDOW_MS;
  const positionBatchNow = typeof options.positionBatchNow === "function"
    ? options.positionBatchNow
    : () => performance.now();
  const positionBatchClientsPerTurn = positiveInteger(
    options.positionBatchClientsPerTurn,
    DEFAULT_POSITION_BATCH_CLIENTS_PER_TURN,
  );
  const positionBatchBytesPerTurn = positiveInteger(
    options.positionBatchBytesPerTurn,
    DEFAULT_POSITION_BATCH_BYTES_PER_TURN,
  );
  const positionBatchFlushBudgetMs = positiveNumber(
    options.positionBatchFlushBudgetMs,
    DEFAULT_POSITION_BATCH_FLUSH_BUDGET_MS,
  );
  const maxOutboundBytes = positiveInteger(
    options.maxQueuedBytes,
    DEFAULT_EVENT_HUB_WRITER_LIMITS.maxQueuedBytes,
  );
  const maxOutboundFrames = positiveInteger(
    options.maxQueuedFrames,
    DEFAULT_EVENT_HUB_WRITER_LIMITS.maxQueuedFrames,
  );
  const clients = new Set();
  const pendingSockets = new Set();
  const subscriptions = createEventSubscriptionIndex({
    bucketSize: options.bucketSize,
    maxAoiRadius: options.maxAoiRadius,
  });
  const battleAcknowledgedAccounts = new Set();
  const battleDesiredStates = new Map();
  const battleTransitions = new Map();
  const eventConnectionCounts = new Map();
  const totals = {
    currentQueuedFrames: 0,
    currentBufferedBytes: 0,
    peakQueuedFrames: 0,
    peakQueuedBytes: 0,
    maxClientQueuedFrames: 0,
    maxClientQueuedBytes: 0,
    sentFrames: 0,
    sentBytes: 0,
    encodedFrames: 0,
    encodedBytes: 0,
    reusedFrames: 0,
    reusedBytes: 0,
    presenceCoalesced: 0,
    slowConsumerDisconnects: 0,
    inboundFrames: 0,
    inboundBytes: 0,
    inboundRateLimited: 0,
    protocolViolations: 0,
    oversizedInboundFrames: 0,
    heartbeatTimeouts: 0,
    cursorResets: 0,
    synchronousPublishTurns: 0,
    synchronousPublishMaxMs: 0,
    synchronousPublishMaxType: "",
    synchronousPublishMaxCandidates: 0,
    peakPendingPositionEvents: 0,
    positionEventsCoalesced: 0,
    positionDrainTurns: 0,
    positionDrainMaxMs: 0,
    positionClientsProcessed: 0,
    positionBatchFlushes: 0,
    positionBatchFlushMaxMs: 0,
    positionBatchFlushClientsMax: 0,
    positionBatchFlushGroupsMax: 0,
    positionBatchFrames: 0,
    positionBatchDeltas: 0,
    positionBatchBytes: 0,
    positionBatchEncodedFrames: 0,
    positionBatchEncodedDeltas: 0,
    positionBatchEncodedBytes: 0,
    positionBatchReusedFrames: 0,
    positionBatchReusedDeltas: 0,
    positionBatchReusedBytes: 0,
    currentPositionBatchBytes: 0,
    peakPositionBatchBytes: 0,
    maxClientCombinedBufferedBytes: 0,
    maxClientCombinedQueuedFrames: 0,
  };
  const pendingPositionEvents = new Map();
  const eventTypeTotals = new Map();
  const initializingSnapshotClients = new Set();
  let activePositionJob = null;
  let positionDrainImmediate = null;
  const pendingPositionBatchClients = new Set();
  let positionBatchTimer = null;
  let positionBatchTimerAt = 0;
  let positionBatchFlushImmediate = null;
  let nextPositionBatchSequenceId = 0;
  let nextConnectionSerial = 0;
  let closing = false;
  let closePromise = null;
  const unsubscribe = service && typeof service.onEvent === "function"
    ? service.onEvent((event) => publish(event))
    : () => {};
  const heartbeatTimer = setInterval(() => heartbeatSweep(), heartbeatSweepMs);
  if (heartbeatTimer && typeof heartbeatTimer.unref === "function") {
    heartbeatTimer.unref();
  }

  async function handleUpgrade(req, socket, head = Buffer.alloc(0)) {
    const handshakeDeadlineAt = Date.now() + handshakeTimeoutMs;
    let url = null;
    let pendingReservation = null;
    let establishedReservation = null;
    let client = null;
    let upgraded = false;
    let pendingSocketHandler = null;
    let pendingSocketAborted = false;
    try {
      if (closing) {
        throw upgradeFailure(503, "ws_server_shutting_down", "server shutting down", {retryAfterMs: 1000});
      }
      const requestTarget = String(req && req.url || "");
      if (
        requestTarget === ""
        || Buffer.byteLength(requestTarget) > 2048
        || !requestTarget.startsWith("/")
        || requestTarget.startsWith("//")
        || requestTarget.includes("#")
      ) {
        throw upgradeFailure(400, "ws_request_target_invalid", "bad request");
      }
      try {
        decodeURIComponent(requestTarget);
        url = new URL(requestTarget, "http://127.0.0.1");
      } catch {
        throw upgradeFailure(400, "ws_request_target_invalid", "bad request");
      }
      if (url.pathname !== "/events") {
        throw upgradeFailure(404, "ws_path_not_found", "not found");
      }
      const transport = validateUpgradeRequest(req, url, {
        allowedOrigins,
        allowTestSubprotocolAuth: options.allowTestSubprotocolAuth === true,
      });
      const protocol = protocolCompatibility(req, url);
      if (!protocol.ok) {
        const failure = upgradeFailure(426, "ws_protocol_version_mismatch", "protocol version mismatch");
        failure.body = protocolMismatchResult(protocol);
        throw failure;
      }
      const networkIdentity = resolveUpgradeNetworkIdentity(req, options);
      pendingReservation = admission.beginPending(networkIdentity.clientIp);
      pendingSockets.add(socket);
      pendingSocketHandler = () => {
        pendingSocketAborted = true;
        pendingSockets.delete(socket);
        if (pendingReservation) {
          pendingReservation.release();
          pendingReservation = null;
        }
        if (establishedReservation) {
          establishedReservation.release();
          establishedReservation = null;
        }
      };
      if (socket && typeof socket.once === "function") {
        socket.once("close", pendingSocketHandler);
        socket.once("error", pendingSocketHandler);
      }
      if (socket.destroyed) {
        pendingSocketHandler();
        throw upgradeFailure(400, "ws_socket_closed", "bad request");
      }
      const modernSessionBoundary = Boolean(service && typeof service.getEventSession === "function");
      const authorized = await withHandshakeDeadline(
        handshakeDeadlineAt,
        () => authorizeEventSession(service, transport.token, modernSessionBoundary),
      );
      if (pendingSocketAborted || socket.destroyed) {
        throw upgradeFailure(400, "ws_socket_closed", "bad request");
      }
      if (closing) {
        throw upgradeFailure(503, "ws_server_shutting_down", "server shutting down", {retryAfterMs: 1000});
      }
      if (!authorized || !authorized.ok) {
        throw upgradeFailure(401, "ws_unauthorized", "unauthorized");
      }
      const account = authorized.account || {};
      const session = authorized.session && typeof authorized.session === "object" ? authorized.session : {};
      const accountId = String(account.accountId || session.accountId || "");
      const sessionId = String(session.sessionId || authorized.sessionId || "");
      if (!accountId || !sessionId) {
        throw upgradeFailure(401, "ws_identity_incomplete", "unauthorized");
      }
      establishedReservation = admission.establish({
        clientIp: networkIdentity.clientIp,
        accountId,
        sessionId,
        token: transport.token,
      });
      const requestedCursor = eventCursorRequest(url);
      const replayCatalog = await withHandshakeDeadline(
        handshakeDeadlineAt,
        () => loadReplayCatalog(service, transport.token, {
          // The service still returns the global earliest/latest window when
          // afterSeq is supplied. Passing the reconnect cursor prevents it
          // from projecting up to 500 already-consumed private events again
          // for every socket in a reconnect storm.
          afterSeq: requestedCursor.cursorPresent
            ? normalizeEventSeq(requestedCursor.lastEventSeq)
            : 0,
        }),
      );
      if (!replayCatalog.ok) {
        throw upgradeFailure(503, "ws_replay_unavailable", "service unavailable", {retryAfterMs: 1000});
      }
      if (pendingSocketAborted || socket.destroyed) {
        throw upgradeFailure(400, "ws_socket_closed", "bad request");
      }
      const cursorDecision = cursorAuthority.classify(
        requestedCursor,
        eventWindowFromReplay(replayCatalog),
      );
      if (cursorDecision.resetRequired) {
        totals.cursorResets += 1;
      }
      const replayEvents = cursorDecision.replayMode === "replay"
        ? replayEventsFromCatalog(replayCatalog.events, cursorDecision.afterSeq, cursorDecision.latestEventSeq)
        : [];
      const accept = crypto.createHash("sha1").update(transport.key + WS_GUID).digest("base64");
      const handshakeHeaders = [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
      ];
      if (transport.selectedSubprotocol) {
        handshakeHeaders.push(`Sec-WebSocket-Protocol: ${transport.selectedSubprotocol}`);
      }
      handshakeHeaders.push("", "");
      const handshakeWritable = socket.write(handshakeHeaders.join("\r\n"));
      upgraded = true;
      admission.recordAccepted();
      if (pendingReservation) {
        pendingReservation.release();
        pendingReservation = null;
      }
      client = {
        socket,
        writer: null,
        parser: createWebSocketFrameParser({
          maxFramePayloadBytes: options.maxInboundFramePayloadBytes,
          maxBufferedBytes: options.maxInboundBufferedBytes,
          maxFramesPerTurn: options.maxInboundFramesPerTurn,
        }),
        admissionReservation: establishedReservation,
        accountId,
        sessionId,
        username: String(account.username || ""),
        token: transport.token,
        lastSentEventSeq: cursorDecision.afterSeq,
        queuedEventSeqs: new Set(),
        initializing: true,
        modernSessionBoundary,
        connectionSerial: ++nextConnectionSerial,
        cleanup: null,
        dataHandler: null,
        closeHandler: null,
        errorHandler: null,
        ingressDrainImmediate: null,
        inboundTokens: positiveInteger(options.inboundFrameBurst, DEFAULT_INBOUND_FRAME_BURST),
        inboundTokenUpdatedAt: now(),
        heartbeatNonce: null,
        heartbeatDeadlineAt: 0,
        nextHeartbeatAt: now() + heartbeatIntervalMs,
        reportedQueuedFrames: 0,
        reportedBufferedBytes: 0,
        positionBatch: null,
        eventConnectionIdentity: null,
      };
      client.writer = createEventHubWriter(socket, {
        paused: true,
        initiallyBlocked: handshakeWritable === false,
        maxQueuedFrames: options.maxQueuedFrames,
        maxQueuedBytes: options.maxQueuedBytes,
        backpressureTimeoutMs: options.backpressureTimeoutMs,
        onFrameSent(bytes, event) {
          totals.sentFrames += 1;
          totals.sentBytes += bytes;
          recordEventTypeMetric(event, "sentFrames", 1);
          recordEventTypeMetric(event, "sentBytes", bytes);
          if (isPositionBatchEvent(event)) {
            totals.positionBatchFrames += 1;
            totals.positionBatchDeltas += event.deltas.length;
            totals.positionBatchBytes += bytes;
          }
          const eventSeq = normalizeEventSeq(event && event.eventSeq);
          if (eventSeq > 0) {
            client.queuedEventSeqs.delete(eventSeq);
            client.lastSentEventSeq = Math.max(client.lastSentEventSeq, eventSeq);
          }
        },
        onPresenceCoalesced(_accountId, previousEvent) {
          totals.presenceCoalesced += 1;
          const previousSeq = normalizeEventSeq(previousEvent && previousEvent.eventSeq);
          if (previousSeq > 0) {
            client.queuedEventSeqs.delete(previousSeq);
          }
        },
        onQueuedFramesChanged(frames) {
          const nextFrames = Math.max(0, Number(frames || 0));
          totals.currentQueuedFrames = Math.max(
            0,
            totals.currentQueuedFrames - client.reportedQueuedFrames + nextFrames,
          );
          client.reportedQueuedFrames = nextFrames;
          totals.peakQueuedFrames = Math.max(totals.peakQueuedFrames, totals.currentQueuedFrames);
          totals.maxClientQueuedFrames = Math.max(totals.maxClientQueuedFrames, nextFrames);
          totals.maxClientCombinedQueuedFrames = Math.max(
            totals.maxClientCombinedQueuedFrames,
            nextFrames + (client.positionBatch ? 1 : 0),
          );
        },
        onBufferedBytesChanged(bytes) {
          const nextBytes = Math.max(0, Number(bytes || 0));
          totals.currentBufferedBytes = Math.max(
            0,
            totals.currentBufferedBytes - client.reportedBufferedBytes + nextBytes,
          );
          client.reportedBufferedBytes = nextBytes;
          totals.peakQueuedBytes = Math.max(totals.peakQueuedBytes, totals.currentBufferedBytes);
          totals.maxClientQueuedBytes = Math.max(totals.maxClientQueuedBytes, nextBytes);
          totals.maxClientCombinedBufferedBytes = Math.max(
            totals.maxClientCombinedBufferedBytes,
            nextBytes + Number(client.positionBatch && client.positionBatch.estimatedBytes || 0),
          );
        },
        onSlowConsumer() {
          totals.slowConsumerDisconnects += 1;
          queueMicrotask(() => cleanupClient(client));
        },
      });
      clients.add(client);
      if (modernSessionBoundary) {
        initializingSnapshotClients.add(client);
      }
      establishedReservation = null;
      subscriptions.register(client);
      client.dataHandler = (chunk) => processSocketIngress(client, chunk);
      client.closeHandler = () => cleanupClient(client);
      client.errorHandler = () => terminateClient(client);
      client.cleanup = client.closeHandler;
      socket.on("data", client.dataHandler);
      socket.on("close", client.closeHandler);
      socket.on("error", client.errorHandler);
      setSocketKeepAlive(socket);
      if (pendingSocketAborted || socket.destroyed) {
        terminateClient(client);
        return true;
      }

      if (head && head.length > 0) {
        processSocketIngress(client, head);
        if (!clients.has(client) || socket.destroyed) {
          return true;
        }
      }
      const catchupCatalog = await withHandshakeDeadline(
        handshakeDeadlineAt,
        // Only the race gap after the first catalog can be relevant here.
        // Asking the service for the whole retained window a second time made
        // mass reconnects repeatedly hydrate already-consumed battle events.
        () => loadReplayCatalog(service, transport.token, {
          afterSeq: cursorDecision.latestEventSeq,
        }),
      );
      if (!catchupCatalog.ok) {
        terminateClient(client);
        return true;
      }
      if (pendingSocketAborted || !clients.has(client) || socket.destroyed) {
        return true;
      }
      for (const event of replayEventsFromCatalog(
        catchupCatalog.events,
        cursorDecision.latestEventSeq,
        catchupCatalog.latestEventSeq,
      )) {
        const eventSeq = normalizeEventSeq(event && event.eventSeq);
        if (eventSeq > 0 && !client.queuedEventSeqs.has(eventSeq)) {
          replayEvents.push(event);
        }
      }

      if (!markEventStreamConnection(client, true)) {
        terminateClient(client);
        return true;
      }
      const initialBattleRoom = Boolean(authorized.activeBattleRoom || !modernSessionBoundary);
      const battleConnectionReady = await withHandshakeDeadline(
        handshakeDeadlineAt,
        () => setBattleConnectionState(client, initialBattleRoom),
      );
      if (pendingSocketAborted || !clients.has(client) || socket.destroyed) {
        return true;
      }
      if (initialBattleRoom && !battleConnectionReady) {
        terminateClient(client);
        return true;
      }

      // The production event-session boundary deliberately requires this
      // authoritative roster read to be synchronous. No I/O callback can
      // interleave between that read and bootstrap below, so deferred
      // positions skip this initializing client and the snapshot supersedes
      // them. Legacy/async adapters retain live-event queuing instead.
      let online;
      if (modernSessionBoundary) {
        try {
          online = service.listOnlinePlayers(transport.token, {scope: "aoi"});
        } catch {
          online = null;
        }
        if (online && typeof online.then === "function") {
          terminateClient(client);
          return true;
        }
      } else {
        online = await withHandshakeDeadline(
          handshakeDeadlineAt,
          () => invokeEventService(
            service,
            "listOnlinePlayers",
            [transport.token, {scope: "aoi"}],
            "ws_online_snapshot",
          ),
        );
      }
      if (!clients.has(client) || socket.destroyed) {
        return true;
      }
      if (!online || !online.ok) {
        terminateClient(client);
        return true;
      }
      subscriptions.update(client, online.aoi);

      const ready = {
        type: "events.ready",
        account,
        eventStreamEpoch: cursorDecision.eventStreamEpoch,
        earliestEventSeq: cursorDecision.earliestEventSeq,
        latestEventSeq: cursorDecision.latestEventSeq,
        replayMode: cursorDecision.replayMode,
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        ...protocolMetadata(),
      };
      const reset = cursorDecision.resetRequired ? {
        type: "events.reset",
        reason: cursorDecision.resetReason,
        eventStreamEpoch: cursorDecision.eventStreamEpoch,
        earliestEventSeq: cursorDecision.earliestEventSeq,
        latestEventSeq: cursorDecision.latestEventSeq,
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
      } : null;
      const snapshot = {
        type: "online.snapshot",
        players: projectPresenceWirePlayers(online.players, {includeRevision: true}),
        party: online.party,
        aoi: online.aoi,
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
      };
      const bootstrap = [ready, ...(reset ? [reset] : []), snapshot, ...replayEvents];
      for (const event of replayEvents) {
        const eventSeq = normalizeEventSeq(event && event.eventSeq);
        if (eventSeq > 0) {
          client.queuedEventSeqs.add(eventSeq);
        }
      }
      initializingSnapshotClients.delete(client);
      client.initializing = false;
      if (!client.writer.startBootstrap(bootstrap)) {
        terminateClient(client);
        return true;
      }
      return true;
    } catch (error) {
      if (client) {
        terminateClient(client);
        return true;
      }
      if (establishedReservation) {
        establishedReservation.release();
        establishedReservation = null;
      }
      const failure = publicUpgradeFailure(error);
      admission.recordReject(failure.code);
      if (!socket.destroyed) {
        if (upgraded) {
          socket.destroy();
        } else {
          writeHttpError(socket, failure.statusCode, failure.statusMessage, failure.body, {
            retryAfterMs: failure.retryAfterMs,
          });
        }
      }
      return Boolean(url && url.pathname === "/events");
    } finally {
      if (pendingSocketHandler) {
        removeSocketListener(socket, "close", pendingSocketHandler);
        removeSocketListener(socket, "error", pendingSocketHandler);
      }
      pendingSockets.delete(socket);
      if (pendingReservation) {
        pendingReservation.release();
      }
    }
  }

  function publish(event) {
    if (!isDeferredPositionEvent(event)) {
      publishNow(event);
      return;
    }
    const accountId = String(event.accountId || "");
    if (!accountId) {
      publishNow(event);
      return;
    }
    const nextEntry = createPendingPositionEntry(event);
    const previous = pendingPositionEvents.get(accountId);
    if (previous) {
      pendingPositionEvents.set(accountId, {
        ...nextEntry,
        event: mergePendingPositionEvent(previous.event, event),
      });
      totals.positionEventsCoalesced += 1;
      return;
    }
    if (pendingPositionWorkCount() >= maxPendingPositionEvents) {
      // Never silently discard authoritative movement. A pathological burst
      // falls back to synchronous fanout after preserving FIFO for every
      // already active/pending job. The incoming event still applies the same
      // initializing/new-connection exclusions as an ordinary deferred job.
      flushPendingPositionWork();
      publishPendingPositionEntry(nextEntry);
      return;
    }
    pendingPositionEvents.set(accountId, nextEntry);
    totals.peakPendingPositionEvents = Math.max(
      totals.peakPendingPositionEvents,
      pendingPositionWorkCount(),
    );
    schedulePositionDrain();
  }

  function createPendingPositionEntry(event) {
    return {
      event,
      throughConnectionSerial: nextConnectionSerial,
      skipClients: initializingSnapshotClients.size > 0
        ? new Set(initializingSnapshotClients)
        : null,
    };
  }

  function publishNow(event) {
    // Projection reuse is deliberately scoped to this one synchronous fanout.
    // AuthService still validates every connection before consulting the cache,
    // and no projected player/AOI state can survive into a later publication.
    const startedAt = positionDrainNow();
    let candidateCount = 0;
    try {
      const context = createPublishContext(event);
      for (const client of subscriptions.candidates(event, clients)) {
        candidateCount += 1;
        publishEventToClient(context, client);
      }
    } finally {
      const elapsedMs = Math.max(0, positionDrainNow() - startedAt);
      totals.synchronousPublishTurns += 1;
      if (elapsedMs >= totals.synchronousPublishMaxMs) {
        totals.synchronousPublishMaxMs = elapsedMs;
        totals.synchronousPublishMaxType = String(event && event.type || "");
        totals.synchronousPublishMaxCandidates = candidateCount;
      }
    }
  }

  function createPublishContext(event) {
    const projectionCache = createEventProjectionCache();
    return {
      event,
      projectionCache,
      batchablePosition: positionBatchWindowMs > 0 && isDeferredPositionEvent(event),
      // This cache belongs to exactly one event job. A deferred job may retain
      // it across turns, but it is discarded before the next event begins.
      publishFrames: null,
    };
  }

  function publishEventToClient(context, client) {
    const event = context.event;
    if (!clients.has(client) || client.closing || !client.socket || client.socket.destroyed) {
      return;
    }
    if (!subscriptions.positionEventMayBeVisible(client, event)) {
      return;
    }
    const prepared = eventForClient(client, event, context.projectionCache);
    if (!prepared.ok) {
      terminateClient(client);
      return;
    }
    if (prepared.hasActiveBattleRoom) {
      setBattleConnectionState(client, prepared.activeBattleRoom);
    }
    if (!prepared.visible) {
      return;
    }
    const outgoing = prepared.event || event;
    if (isPositionEvent(outgoing) && String(client.accountId || "") === String(outgoing.accountId || "")) {
      subscriptions.update(client, outgoing.aoi || event && event.aoi || outgoing.position);
    }
    context.publishFrames ||= createPublishFrameCache(event, context.projectionCache);
    if (context.batchablePosition && isPositionEvent(outgoing)) {
      queueClientPositionDelta(client, outgoing, context.publishFrames);
    } else {
      queueClientEvent(client, outgoing, context.publishFrames);
    }
    if (sessionReplacementTargetsClient(outgoing, client)) {
      client.closing = true;
      subscriptions.unregister(client);
      discardClientPositionBatch(client);
      client.writer.requestCloseAfterFlush();
    }
  }

  function schedulePositionDrain() {
    if (closing || positionDrainImmediate !== null || pendingPositionWorkCount() === 0) {
      return;
    }
    positionDrainImmediate = setImmediate(() => {
      positionDrainImmediate = null;
      drainPendingPositionWorkTurn();
    });
    if (positionDrainImmediate && typeof positionDrainImmediate.unref === "function") {
      positionDrainImmediate.unref();
    }
  }

  function drainPendingPositionWorkTurn() {
    if (closing || pendingPositionWorkCount() === 0) {
      return;
    }
    totals.positionDrainTurns += 1;
    const startedAt = positionDrainNow();
    let clientsProcessed = 0;
    let eventsStarted = 0;
    while (pendingPositionWorkCount() > 0) {
      if (clientsProcessed >= positionClientsPerTurn) {
        break;
      }
      if (clientsProcessed > 0 && positionDrainNow() - startedAt >= positionDrainBudgetMs) {
        break;
      }
      if (!activePositionJob) {
        if (eventsStarted >= positionEventsPerTurn) {
          break;
        }
        activePositionJob = shiftPendingPositionJob();
        if (!activePositionJob) {
          break;
        }
        eventsStarted += 1;
      }
      if (activePositionJob.candidateIndex >= activePositionJob.candidates.length) {
        activePositionJob = null;
        continue;
      }
      const client = activePositionJob.candidates[activePositionJob.candidateIndex];
      activePositionJob.candidateIndex += 1;
      clientsProcessed += 1;
      totals.positionClientsProcessed += 1;
      if (!deferredPositionJobSkipsClient(activePositionJob, client)) {
        publishEventToClient(activePositionJob.context, client);
      }
      if (activePositionJob.candidateIndex >= activePositionJob.candidates.length) {
        activePositionJob = null;
      }
    }
    totals.positionDrainMaxMs = Math.max(
      totals.positionDrainMaxMs,
      positionDrainNow() - startedAt,
    );
    schedulePositionDrain();
  }

  function shiftPendingPositionJob() {
    const first = pendingPositionEvents.entries().next().value;
    if (!first) {
      return null;
    }
    const [accountId, entry] = first;
    pendingPositionEvents.delete(accountId);
    return createPendingPositionJob(entry);
  }

  function createPendingPositionJob(entry) {
    return {
      context: createPublishContext(entry.event),
      candidates: Array.from(subscriptions.candidates(entry.event, clients)),
      candidateIndex: 0,
      throughConnectionSerial: entry.throughConnectionSerial,
      skipClients: entry.skipClients,
    };
  }

  function deferredPositionJobSkipsClient(job, client) {
    return Boolean(
      !client
      || Number(client.connectionSerial || 0) > Number(job.throughConnectionSerial || 0)
      || job.skipClients && job.skipClients.has(client)
    );
  }

  function publishPendingPositionEntry(entry) {
    const job = createPendingPositionJob(entry);
    while (job.candidateIndex < job.candidates.length) {
      const client = job.candidates[job.candidateIndex];
      job.candidateIndex += 1;
      totals.positionClientsProcessed += 1;
      if (!deferredPositionJobSkipsClient(job, client)) {
        publishEventToClient(job.context, client);
      }
    }
  }

  function flushPendingPositionWork() {
    if (positionDrainImmediate !== null) {
      clearImmediate(positionDrainImmediate);
      positionDrainImmediate = null;
    }
    if (pendingPositionWorkCount() === 0) {
      return;
    }
    totals.positionDrainTurns += 1;
    while (pendingPositionWorkCount() > 0) {
      if (!activePositionJob) {
        activePositionJob = shiftPendingPositionJob();
      }
      if (!activePositionJob) {
        break;
      }
      while (activePositionJob.candidateIndex < activePositionJob.candidates.length) {
        const client = activePositionJob.candidates[activePositionJob.candidateIndex];
        activePositionJob.candidateIndex += 1;
        totals.positionClientsProcessed += 1;
        if (!deferredPositionJobSkipsClient(activePositionJob, client)) {
          publishEventToClient(activePositionJob.context, client);
        }
      }
      activePositionJob = null;
    }
  }

  function pendingPositionWorkCount() {
    return pendingPositionEvents.size + (activePositionJob ? 1 : 0);
  }

  function eventForClient(client, event, projectionCache = null) {
    let result;
    if (service && typeof service.eventForConnection === "function") {
      result = service.eventForConnection(eventConnectionIdentity(client), event, projectionCache);
    } else if (service && typeof service.eventForSession === "function") {
      result = service.eventForSession(client.token, event);
    } else {
      result = {ok: true, visible: true, event};
    }
    if (!result || typeof result.then === "function" || result.ok === false) {
      return {ok: false, visible: false, event};
    }
    return {
      ok: true,
      visible: result.visible !== false,
      event: result.event || event,
      hasActiveBattleRoom: Object.hasOwn(result, "activeBattleRoom"),
      activeBattleRoom: Boolean(result.activeBattleRoom),
    };
  }

  function queueClientEvent(client, event, publishFrames = null) {
    if (!client || !client.writer) {
      return false;
    }
    const eventSeq = normalizeEventSeq(event && event.eventSeq);
    if (eventSeq > 0) {
      if (eventSeq <= normalizeEventSeq(client.lastSentEventSeq) || client.queuedEventSeqs.has(eventSeq)) {
        return true;
      }
      client.queuedEventSeqs.add(eventSeq);
    }
    const coalesceKey = isCoalesciblePositionEvent(event) ? String(event.accountId || "") : "";
    const sharedKey = sharedPublishFrameKey(client, event, publishFrames);
    let frame = sharedKey !== null ? publishFrames.frames.get(sharedKey) : null;
    if (frame) {
      totals.reusedFrames += 1;
      totals.reusedBytes += frame.length;
      recordEventTypeMetric(event, "reusedFrames", 1);
      recordEventTypeMetric(event, "reusedBytes", frame.length);
    } else {
      try {
        frame = encodeEventFrame(event);
      } catch {
        client.writer.destroy(false);
        if (eventSeq > 0) {
          client.queuedEventSeqs.delete(eventSeq);
        }
        return false;
      }
      totals.encodedFrames += 1;
      totals.encodedBytes += frame.length;
      recordEventTypeMetric(event, "encodedFrames", 1);
      recordEventTypeMetric(event, "encodedBytes", frame.length);
      if (sharedKey !== null) {
        publishFrames.frames.set(sharedKey, frame);
      }
    }
    // A non-batchable/critical event cannot overtake an older delayed
    // position batch for this client. This remains a synchronous, isolated
    // flush; it never drains another client's timer batch.
    if (client.positionBatch) {
      flushClientPositionBatch(client, publishFrames && publishFrames.positionBatchFrames);
    }
    const queued = client.writer.enqueuePreencoded(event, frame, {coalesceKey});
    if (!queued && eventSeq > 0) {
      client.queuedEventSeqs.delete(eventSeq);
    }
    return queued;
  }

  function queueClientPositionDelta(client, event, publishFrames = null) {
    if (
      !client
      || !clients.has(client)
      || client.closing
      || !client.writer
      || !isPositionEvent(event)
      || normalizeEventSeq(event.eventSeq) > 0
    ) {
      return queueClientEvent(client, event);
    }
    const prepared = preparePositionBatchDelta(client, event, publishFrames);
    if (!prepared) {
      return queueClientEvent(client, event);
    }
    const {snapshot, deltaBytes, sequenceId} = prepared;
    if (positionBatchEncodedSize(deltaBytes, 1) > MAX_POSITION_BATCH_BYTES) {
      return queueClientEvent(client, event);
    }
    let batch = client.positionBatch;
    // Keep byte budgeting O(1): this path runs once per visible recipient and
    // must not spread/reduce the batch's prior delta-size array on every append.
    let nextBatchBytes = positionBatchEncodedSize(
      Number(batch && batch.deltaPayloadBytes || 0) + deltaBytes,
      Number(batch && batch.deltas.length || 0) + 1,
    );
    if (
      batch
      && (
        batch.deltas.length >= MAX_POSITION_BATCH_DELTAS
        || nextBatchBytes > MAX_POSITION_BATCH_BYTES
        || Number(client.reportedBufferedBytes || 0) + nextBatchBytes > maxOutboundBytes
      )
    ) {
      flushClientPositionBatch(client);
      batch = null;
      nextBatchBytes = positionBatchEncodedSize(deltaBytes, 1);
    }
    if (
      !batch
      && (
        Number(client.reportedBufferedBytes || 0) + nextBatchBytes > maxOutboundBytes
        || Number(client.reportedQueuedFrames || 0) + 1 > maxOutboundFrames
      )
    ) {
      return queueClientEvent(client, event);
    }
    if (!batch) {
      const startedAt = positionBatchNow();
      batch = {
        deltas: [],
        deltaPayloadBytes: 0,
        sequenceIds: [],
        estimatedBytes: 0,
        deadlineAt: startedAt + positionBatchWindowMs,
      };
      client.positionBatch = batch;
      pendingPositionBatchClients.add(client);
    }
    batch.deltas.push(snapshot);
    batch.deltaPayloadBytes += deltaBytes;
    batch.sequenceIds.push(sequenceId);
    const previousEstimatedBytes = Number(batch.estimatedBytes || 0);
    batch.estimatedBytes = nextBatchBytes;
    totals.currentPositionBatchBytes += nextBatchBytes - previousEstimatedBytes;
    totals.peakPositionBatchBytes = Math.max(
      totals.peakPositionBatchBytes,
      totals.currentPositionBatchBytes,
    );
    totals.maxClientCombinedBufferedBytes = Math.max(
      totals.maxClientCombinedBufferedBytes,
      Number(client.reportedBufferedBytes || 0) + nextBatchBytes,
    );
    totals.maxClientCombinedQueuedFrames = Math.max(
      totals.maxClientCombinedQueuedFrames,
      Number(client.reportedQueuedFrames || 0) + 1,
    );
    schedulePositionBatchFlush(batch.deadlineAt);
    return true;
  }

  function preparePositionBatchDelta(client, event, publishFrames) {
    const objectCache = publishFrames
      && isReusableEventProjection(publishFrames.projectionCache, event)
      && publishFrames.batchDeltasByOutgoing;
    if (objectCache && objectCache.has(event)) {
      return objectCache.get(event);
    }
    if (
      Object.hasOwn(event, "targetSessionIds")
      || Object.hasOwn(event, "targetAccountIds")
      || !plainDataRecord(event)
      || !stableJsonData(event)
    ) {
      return null;
    }
    let serialized;
    let snapshot;
    try {
      serialized = JSON.stringify(event);
      snapshot = JSON.parse(serialized);
    } catch {
      return null;
    }
    const sequenceIdsBySerialized = publishFrames && publishFrames.batchSequenceIdsBySerialized;
    let sequenceId = sequenceIdsBySerialized && sequenceIdsBySerialized.get(serialized);
    if (!sequenceId) {
      sequenceId = ++nextPositionBatchSequenceId;
      if (sequenceIdsBySerialized) {
        sequenceIdsBySerialized.set(serialized, sequenceId);
      }
    }
    const prepared = Object.freeze({
      serialized,
      snapshot,
      deltaBytes: Buffer.byteLength(serialized),
      sequenceId,
    });
    if (objectCache) {
      objectCache.set(event, prepared);
    }
    return prepared;
  }

  function schedulePositionBatchFlush(preferredDeadlineAt = null) {
    if (
      closing
      || pendingPositionBatchClients.size === 0
      || positionBatchFlushImmediate !== null
    ) {
      return;
    }
    const preferred = Number(preferredDeadlineAt);
    if (positionBatchTimer !== null && Number.isFinite(preferred) && positionBatchTimerAt <= preferred) {
      return;
    }
    let earliest = Number.isFinite(preferred) ? preferred : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(preferred)) {
      for (const client of pendingPositionBatchClients) {
        if (client.positionBatch) {
          earliest = Math.min(earliest, Number(client.positionBatch.deadlineAt || 0));
        }
      }
    }
    if (!Number.isFinite(earliest)) {
      return;
    }
    if (positionBatchTimer !== null && positionBatchTimerAt <= earliest) {
      return;
    }
    clearPositionBatchTimer();
    positionBatchTimerAt = earliest;
    positionBatchTimer = setTimeout(() => {
      positionBatchTimer = null;
      positionBatchTimerAt = 0;
      schedulePositionBatchFlushTurn();
    }, Math.max(0, Math.ceil(earliest - positionBatchNow())));
    if (positionBatchTimer && typeof positionBatchTimer.unref === "function") {
      positionBatchTimer.unref();
    }
  }

  function schedulePositionBatchFlushTurn() {
    if (
      closing
      || pendingPositionBatchClients.size === 0
      || positionBatchFlushImmediate !== null
    ) {
      return;
    }
    clearPositionBatchTimer();
    positionBatchFlushImmediate = setImmediate(() => {
      positionBatchFlushImmediate = null;
      flushPositionBatches(false);
    });
    if (positionBatchFlushImmediate && typeof positionBatchFlushImmediate.unref === "function") {
      positionBatchFlushImmediate.unref();
    }
  }

  function clearPositionBatchTimer() {
    if (positionBatchTimer !== null) {
      clearTimeout(positionBatchTimer);
      positionBatchTimer = null;
    }
    positionBatchTimerAt = 0;
  }

  function clearPositionBatchFlushSchedule() {
    clearPositionBatchTimer();
    if (positionBatchFlushImmediate !== null) {
      clearImmediate(positionBatchFlushImmediate);
      positionBatchFlushImmediate = null;
    }
  }

  function flushPositionBatches(forceAll = false) {
    if (forceAll) {
      clearPositionBatchFlushSchedule();
    }
    const flushStartedAt = positionBatchNow();
    const currentAt = positionBatchNow();
    const due = [];
    let selectedBytes = 0;
    let deferredDue = false;
    let nextDeadlineAt = Number.POSITIVE_INFINITY;
    for (const client of pendingPositionBatchClients) {
      const batch = client.positionBatch;
      if (!batch) {
        pendingPositionBatchClients.delete(client);
        continue;
      }
      if (!forceAll && Number(batch.deadlineAt || 0) > currentAt) {
        nextDeadlineAt = Math.min(nextDeadlineAt, Number(batch.deadlineAt || 0));
        continue;
      }
      if (
        !clients.has(client)
        || client.closing
        || !client.writer
        || batch.deltas.length === 0
      ) {
        detachClientPositionBatch(client);
        continue;
      }
      const estimatedBytes = Math.max(0, Number(batch.estimatedBytes || 0));
      if (
        !forceAll
        && due.length > 0
        && (
          due.length >= positionBatchClientsPerTurn
          || selectedBytes + estimatedBytes > positionBatchBytesPerTurn
          || positionBatchNow() - flushStartedAt >= positionBatchFlushBudgetMs
        )
      ) {
        deferredDue = true;
        break;
      }
      detachClientPositionBatch(client);
      due.push({client, batch});
      selectedBytes += estimatedBytes;
    }
    flushDetachedPositionBatches(due, flushStartedAt);
    if (!forceAll) {
      if (deferredDue) {
        schedulePositionBatchFlushTurn();
      } else if (Number.isFinite(nextDeadlineAt)) {
        schedulePositionBatchFlush(nextDeadlineAt);
      } else {
        schedulePositionBatchFlush();
      }
    }
  }

  function flushClientPositionBatch(client, sharedFrames = null) {
    const flushStartedAt = positionBatchNow();
    const batch = detachClientPositionBatch(client);
    const due = batch
      && clients.has(client)
      && !client.closing
      && client.writer
      && batch.deltas.length > 0
      ? [{client, batch}]
      : [];
    flushDetachedPositionBatches(due, flushStartedAt, sharedFrames);
    return batch !== null;
  }

  function flushDetachedPositionBatches(due, flushStartedAt, sharedFrames = null) {
    const createdAt = new Date().toISOString();
    const groups = new Map();
    for (const entry of due) {
      const key = entry.batch.sequenceIds.join(",");
      let group = groups.get(key);
      if (!group) {
        group = {batch: entry.batch, clients: []};
        groups.set(key, group);
      }
      group.clients.push(entry.client);
    }
    for (const [key, group] of groups) {
      const cached = sharedFrames && sharedFrames.get(key);
      const event = cached ? cached.event : {
        type: "online.position_batch",
        deltas: group.batch.deltas,
        schemaVersion: 1,
        createdAt,
      };
      let frame = cached && cached.frame;
      let accountEncodedFrame = !frame;
      if (!frame) {
        try {
          frame = encodeEventFrame(event);
        } catch {
          for (const client of group.clients) {
            terminateClient(client);
          }
          continue;
        }
      }
      if (frame.length > MAX_POSITION_BATCH_BYTES) {
        for (const client of group.clients) {
          for (const delta of group.batch.deltas) {
            queueClientEvent(client, delta);
          }
        }
        continue;
      }
      if (!cached && sharedFrames) {
        sharedFrames.set(key, {event, frame});
      }
      for (const client of group.clients) {
        if (!clients.has(client) || client.closing || !client.writer) {
          continue;
        }
        if (accountEncodedFrame) {
          totals.encodedFrames += 1;
          totals.encodedBytes += frame.length;
          totals.positionBatchEncodedFrames += 1;
          totals.positionBatchEncodedDeltas += event.deltas.length;
          totals.positionBatchEncodedBytes += frame.length;
          recordEventTypeMetric(event, "encodedFrames", 1);
          recordEventTypeMetric(event, "encodedBytes", frame.length);
          accountEncodedFrame = false;
        } else {
          totals.reusedFrames += 1;
          totals.reusedBytes += frame.length;
          totals.positionBatchReusedFrames += 1;
          totals.positionBatchReusedDeltas += event.deltas.length;
          totals.positionBatchReusedBytes += frame.length;
          recordEventTypeMetric(event, "reusedFrames", 1);
          recordEventTypeMetric(event, "reusedBytes", frame.length);
        }
        client.writer.enqueuePreencoded(event, frame);
      }
    }
    totals.positionBatchFlushes += 1;
    totals.positionBatchFlushMaxMs = Math.max(
      totals.positionBatchFlushMaxMs,
      positionBatchNow() - flushStartedAt,
    );
    totals.positionBatchFlushClientsMax = Math.max(
      totals.positionBatchFlushClientsMax,
      due.length,
    );
    totals.positionBatchFlushGroupsMax = Math.max(
      totals.positionBatchFlushGroupsMax,
      groups.size,
    );
  }

  function detachClientPositionBatch(client) {
    if (!client || !client.positionBatch) {
      return null;
    }
    const batch = client.positionBatch;
    totals.currentPositionBatchBytes = Math.max(
      0,
      totals.currentPositionBatchBytes - Number(batch.estimatedBytes || 0),
    );
    client.positionBatch = null;
    pendingPositionBatchClients.delete(client);
    if (pendingPositionBatchClients.size === 0) {
      clearPositionBatchFlushSchedule();
    }
    return batch;
  }

  function discardClientPositionBatch(client) {
    detachClientPositionBatch(client);
  }

  function processSocketIngress(client, chunk) {
    if (!client || !clients.has(client) || !client.parser) {
      return;
    }
    const input = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk || []);
    totals.inboundBytes += input.length;
    let result;
    try {
      result = client.parser.push(input);
    } catch {
      recordIngressFailure({code: WS_CLOSE_PROTOCOL_ERROR});
      closeClientWithCode(client, WS_CLOSE_PROTOCOL_ERROR, "protocol error");
      return;
    }
    consumeIngressResult(client, result);
  }

  function consumeIngressResult(client, result) {
    if (!client || !clients.has(client) || !result) {
      return;
    }
    for (const frame of result.frames || []) {
      if (!consumeInboundFrameCredit(client)) {
        totals.inboundRateLimited += 1;
        closeClientWithCode(client, SERVER_CLOSE_POLICY_VIOLATION, "frame rate exceeded");
        return;
      }
      totals.inboundFrames += 1;
      if (frame.type === "close") {
        closeClientWithPayload(client, frame.payload);
        return;
      }
      if (frame.type === "ping") {
        if (!client.writer || !client.writer.enqueueRaw(encodeFrame(0xA, frame.payload))) {
          terminateClient(client);
          return;
        }
      } else if (frame.type === "pong") {
        acknowledgeHeartbeat(client, frame.payload);
      }
    }
    if (!result.ok) {
      recordIngressFailure(result.close);
      closeClientWithCode(client, result.close.code, result.close.reason);
      return;
    }
    if (result.limitReached && clients.has(client) && client.ingressDrainImmediate === null) {
      client.ingressDrainImmediate = setImmediate(() => {
        client.ingressDrainImmediate = null;
        if (!clients.has(client)) {
          return;
        }
        consumeIngressResult(client, client.parser.drain());
      });
    }
  }

  function consumeInboundFrameCredit(client) {
    const currentMs = now();
    const elapsedMs = Math.max(0, currentMs - Number(client.inboundTokenUpdatedAt || 0));
    const rate = positiveInteger(options.inboundFramesPerSecond, DEFAULT_INBOUND_FRAMES_PER_SECOND);
    const burst = positiveInteger(options.inboundFrameBurst, DEFAULT_INBOUND_FRAME_BURST);
    client.inboundTokens = Math.min(
      burst,
      Number(client.inboundTokens || 0) + (elapsedMs * rate / 1000),
    );
    client.inboundTokenUpdatedAt = currentMs;
    if (client.inboundTokens + Number.EPSILON < 1) {
      return false;
    }
    client.inboundTokens -= 1;
    return true;
  }

  function acknowledgeHeartbeat(client, payload) {
    if (!client.heartbeatNonce || payload.length !== client.heartbeatNonce.length) {
      return;
    }
    if (!crypto.timingSafeEqual(payload, client.heartbeatNonce)) {
      return;
    }
    client.heartbeatNonce = null;
    client.heartbeatDeadlineAt = 0;
    client.nextHeartbeatAt = now() + heartbeatIntervalMs;
  }

  function recordIngressFailure(close) {
    if (close && close.code === WS_CLOSE_MESSAGE_TOO_BIG) {
      totals.oversizedInboundFrames += 1;
      return;
    }
    if (close && (close.code === WS_CLOSE_PROTOCOL_ERROR || close.code === WS_CLOSE_UNSUPPORTED_DATA)) {
      totals.protocolViolations += 1;
    }
  }

  function setBattleConnectionState(client, activeBattleRoom) {
    const accountId = String(client && client.accountId || "");
    if (!accountId) {
      return true;
    }
    const requestedState = Boolean(activeBattleRoom);
    const existingDesired = battleDesiredStates.get(accountId);
    if (
      existingDesired
      && existingDesired.connected === requestedState
      && !battleTransitions.has(accountId)
      && battleAcknowledgedAccounts.has(accountId) === requestedState
    ) {
      return true;
    }
    battleDesiredStates.set(accountId, {
      connected: requestedState,
      identity: clientIdentity(client),
      token: client.token,
    });
    if (battleTransitions.has(accountId)) {
      return battleTransitions.get(accountId);
    }
    if (battleAcknowledgedAccounts.has(accountId) === requestedState) {
      return true;
    }
    const transition = Promise.resolve().then(async () => {
      while (true) {
        const desired = battleDesiredStates.get(accountId);
        if (!desired) {
          return true;
        }
        const acknowledged = battleAcknowledgedAccounts.has(accountId);
        if (acknowledged === desired.connected) {
          return true;
        }
        const applied = await markBattleConnection(
          service,
          desired.identity,
          desired.token,
          desired.connected,
        );
        if (!applied) {
          return false;
        }
        if (desired.connected) {
          battleAcknowledgedAccounts.add(accountId);
        } else {
          battleAcknowledgedAccounts.delete(accountId);
        }
      }
    }).finally(() => {
      battleTransitions.delete(accountId);
      const hasConnection = Array.from(clients).some((candidate) => candidate.accountId === accountId);
      if (!hasConnection && !battleAcknowledgedAccounts.has(accountId)) {
        battleDesiredStates.delete(accountId);
      }
    });
    battleTransitions.set(accountId, transition);
    return transition;
  }

  function cleanupClient(client) {
    if (!client) {
      return Promise.resolve();
    }
    initializingSnapshotClients.delete(client);
    discardClientPositionBatch(client);
    if (client.ingressDrainImmediate !== null) {
      clearImmediate(client.ingressDrainImmediate);
      client.ingressDrainImmediate = null;
    }
    if (client.admissionReservation) {
      client.admissionReservation.release();
      client.admissionReservation = null;
    }
    if (!clients.delete(client)) {
      return Promise.resolve();
    }
    subscriptions.unregister(client);
    detachClientSocketListeners(client);
    if (client.writer) {
      client.writer.dispose();
    }
    markEventStreamConnection(client, false);
    const accountId = String(client.accountId || "");
    const hasAnotherConnection = Array.from(clients).some((candidate) => candidate.accountId === accountId);
    if (hasAnotherConnection) {
      return Promise.resolve();
    }
    let activeBattleRoom = battleAcknowledgedAccounts.has(accountId)
      || battleTransitions.has(accountId)
      || Boolean(battleDesiredStates.get(accountId) && battleDesiredStates.get(accountId).connected);
    if (!activeBattleRoom && service && typeof service.eventConnectionState === "function") {
      try {
        const state = service.eventConnectionState(clientIdentity(client));
        activeBattleRoom = Boolean(state && state.ok && state.activeBattleRoom);
      } catch {
        activeBattleRoom = false;
      }
    }
    if (!activeBattleRoom) {
      battleDesiredStates.delete(accountId);
      return Promise.resolve();
    }
    return Promise.resolve(setBattleConnectionState(client, false)).finally(() => {
      const connectionRemains = Array.from(clients).some((candidate) => candidate.accountId === accountId);
      if (
        !connectionRemains
        && !battleTransitions.has(accountId)
        && !battleAcknowledgedAccounts.has(accountId)
      ) {
        battleDesiredStates.delete(accountId);
      }
    });
  }

  function terminateClient(client) {
    const cleanup = cleanupClient(client);
    try {
      if (client && client.socket && !client.socket.destroyed) {
        client.socket.destroy();
      }
    } catch {
      // A failed socket destroy must not leak the indexes or shutdown drain.
    }
    return cleanup;
  }

  function closeClientWithCode(client, code, reason) {
    closeClientWithPayload(client, encodeClosePayload(code, reason));
  }

  function closeClientWithPayload(client, payload) {
    if (!client || !clients.has(client)) {
      return Promise.resolve();
    }
    const socket = client.socket;
    try {
      if (
        socket
        && !socket.destroyed
        && socket.writable !== false
        && socket.writableEnded !== true
        && socket.writableFinished !== true
        && typeof socket.write === "function"
      ) {
        const ignoreCloseWriteError = () => {};
        if (typeof socket.once === "function") {
          socket.once("error", ignoreCloseWriteError);
        }
        socket.write(encodeFrame(0x8, payload));
        const destroyTimer = setTimeout(() => {
          try {
            removeSocketListener(socket, "error", ignoreCloseWriteError);
            if (!socket.destroyed && typeof socket.destroy === "function") {
              socket.destroy();
            }
          } catch {
            // Runtime indexes and admissions were already released above.
          }
        }, positiveInteger(options.closeGraceMs, DEFAULT_CLOSE_GRACE_MS));
        if (destroyTimer && typeof destroyTimer.unref === "function") {
          destroyTimer.unref();
        }
      } else if (socket && !socket.destroyed && typeof socket.destroy === "function") {
        socket.destroy();
      }
    } catch {
      try {
        if (socket && !socket.destroyed && typeof socket.destroy === "function") {
          socket.destroy();
        }
      } catch {
        // Cleanup below still releases all runtime indexes and admissions.
      }
    }
    return cleanupClient(client);
  }

  function markEventStreamConnection(client, connected) {
    if (!service || typeof service.markEventConnection !== "function") {
      return true;
    }
    const sessionId = String(client && client.sessionId || "");
    if (!sessionId) {
      return false;
    }
    const previousCount = Number(eventConnectionCounts.get(sessionId) || 0);
    if (connected) {
      eventConnectionCounts.set(sessionId, previousCount + 1);
      if (previousCount > 0) {
        return true;
      }
    } else if (previousCount > 1) {
      eventConnectionCounts.set(sessionId, previousCount - 1);
      return true;
    } else {
      eventConnectionCounts.delete(sessionId);
      if (previousCount <= 0) {
        return true;
      }
    }
    try {
      const result = service.markEventConnection(clientIdentity(client), connected);
      if (result && typeof result.then !== "function" && result.ok !== false) {
        return true;
      }
    } catch {
      // Roll back the local reference transition below.
    }
    if (connected) {
      eventConnectionCounts.delete(sessionId);
    }
    return false;
  }

  function heartbeatSweep() {
    if (closing) {
      return;
    }
    const currentMs = now();
    for (const client of Array.from(clients)) {
      if (!clients.has(client) || !client.socket || client.socket.destroyed) {
        continue;
      }
      if (client.heartbeatDeadlineAt > 0 && currentMs >= client.heartbeatDeadlineAt) {
        totals.heartbeatTimeouts += 1;
        closeClientWithCode(client, SERVER_CLOSE_GOING_AWAY, "heartbeat timeout");
        continue;
      }
      if (client.closing || client.heartbeatNonce || currentMs < client.nextHeartbeatAt) {
        continue;
      }
      let nonce;
      try {
        nonce = Buffer.from(randomBytes(8));
      } catch {
        terminateClient(client);
        continue;
      }
      if (nonce.length !== 8 || !client.writer || !client.writer.enqueueRaw(encodeFrame(0x9, nonce))) {
        terminateClient(client);
        continue;
      }
      client.heartbeatNonce = nonce;
      client.heartbeatDeadlineAt = currentMs + heartbeatDeadlineMs;
    }
  }

  function close() {
    if (closePromise !== null) {
      return closePromise;
    }
    clearPositionBatchFlushSchedule();
    flushPendingPositionWork();
    flushPositionBatches(true);
    closing = true;
    clearInterval(heartbeatTimer);
    if (positionDrainImmediate !== null) {
      clearImmediate(positionDrainImmediate);
      positionDrainImmediate = null;
    }
    pendingPositionEvents.clear();
    activePositionJob = null;
    initializingSnapshotClients.clear();
    try {
      unsubscribe();
    } catch {
      // Shutdown must still disconnect and drain the accepted clients.
    }
    for (const socket of Array.from(pendingSockets)) {
      try {
        if (socket && !socket.destroyed && typeof socket.destroy === "function") {
          socket.destroy();
        }
      } catch {
        // Pending admission release is idempotent and also runs in finally.
      }
    }
    pendingSockets.clear();
    const disconnects = Array.from(clients).map((client) => terminateClient(client));
    closePromise = Promise.allSettled(disconnects).then(() => undefined);
    return closePromise;
  }

  function clientCount() {
    return clients.size;
  }

  function metrics() {
    let backpressureConnections = 0;
    let queuedFrames = 0;
    let queuedBytes = 0;
    let combinedBufferedBytes = 0;
    let maxClientCombinedBufferedBytes = 0;
    let combinedQueuedFrames = 0;
    let maxClientCombinedQueuedFrames = 0;
    for (const client of clients) {
      const writerMetrics = client.writer ? client.writer.metrics() : {};
      if (writerMetrics.blocked) {
        backpressureConnections += 1;
      }
      queuedFrames += Number(writerMetrics.queuedFrames || 0);
      queuedBytes += Number(writerMetrics.queuedBytes || 0);
      const combined = Number(writerMetrics.queuedBytes || 0)
        + Number(client.positionBatch && client.positionBatch.estimatedBytes || 0);
      combinedBufferedBytes += combined;
      maxClientCombinedBufferedBytes = Math.max(maxClientCombinedBufferedBytes, combined);
      const combinedFrames = Number(writerMetrics.queuedFrames || 0) + (client.positionBatch ? 1 : 0);
      combinedQueuedFrames += combinedFrames;
      maxClientCombinedQueuedFrames = Math.max(maxClientCombinedQueuedFrames, combinedFrames);
    }
    const admissionMetrics = admission.metrics();
    return Object.freeze({
      connections: clients.size,
      establishedConnections: admissionMetrics.establishedConnections,
      pendingUpgrades: admissionMetrics.pendingUpgrades,
      pendingIpKeys: admissionMetrics.pendingIpKeys,
      establishedIpKeys: admissionMetrics.establishedIpKeys,
      establishedAccountKeys: admissionMetrics.establishedAccountKeys,
      establishedSessionKeys: admissionMetrics.establishedSessionKeys,
      establishedTokenKeys: admissionMetrics.establishedTokenKeys,
      peakPendingUpgrades: admissionMetrics.peakPendingUpgrades,
      acceptedUpgrades: admissionMetrics.acceptedUpgrades,
      rejectedUpgrades: admissionMetrics.rejectedUpgrades,
      upgradeRejectReasons: admissionMetrics.rejectReasons,
      backpressureConnections,
      queuedFrames,
      queuedBytes,
      combinedBufferedBytes,
      maxClientCombinedBufferedBytes,
      combinedQueuedFrames,
      maxClientCombinedQueuedFrames,
      peakQueuedFrames: totals.peakQueuedFrames,
      peakQueuedBytes: totals.peakQueuedBytes,
      maxClientQueuedFrames: totals.maxClientQueuedFrames,
      maxClientQueuedBytes: totals.maxClientQueuedBytes,
      sentFrames: totals.sentFrames,
      sentBytes: totals.sentBytes,
      // These four counters cover live publish fanout only. Bootstrap replay
      // and WebSocket control frames are intentionally outside this profile.
      encodedFrames: totals.encodedFrames,
      encodedBytes: totals.encodedBytes,
      reusedFrames: totals.reusedFrames,
      reusedBytes: totals.reusedBytes,
      presenceCoalesced: totals.presenceCoalesced,
      slowConsumerDisconnects: totals.slowConsumerDisconnects,
      inboundFrames: totals.inboundFrames,
      inboundBytes: totals.inboundBytes,
      inboundRateLimited: totals.inboundRateLimited,
      protocolViolations: totals.protocolViolations,
      oversizedInboundFrames: totals.oversizedInboundFrames,
      heartbeatTimeouts: totals.heartbeatTimeouts,
      cursorResets: totals.cursorResets,
      synchronousPublishTurns: totals.synchronousPublishTurns,
      synchronousPublishMaxMs: totals.synchronousPublishMaxMs,
      synchronousPublishMaxType: totals.synchronousPublishMaxType,
      synchronousPublishMaxCandidates: totals.synchronousPublishMaxCandidates,
      pendingPositionEvents: pendingPositionWorkCount(),
      peakPendingPositionEvents: totals.peakPendingPositionEvents,
      positionEventsCoalesced: totals.positionEventsCoalesced,
      positionDrainTurns: totals.positionDrainTurns,
      positionDrainBudgetMs,
      positionDrainMaxMs: totals.positionDrainMaxMs,
      positionEventsPerTurn,
      positionClientsPerTurn,
      activePositionJob: activePositionJob ? 1 : 0,
      positionClientsProcessed: totals.positionClientsProcessed,
      pendingPositionBatchClients: pendingPositionBatchClients.size,
      pendingPositionBatchDeltas: pendingPositionBatchDeltaCount(pendingPositionBatchClients),
      positionBatchWindowMs,
      positionBatchClientsPerTurn,
      positionBatchBytesPerTurn,
      positionBatchFlushBudgetMs,
      positionBatchFlushes: totals.positionBatchFlushes,
      positionBatchFlushMaxMs: totals.positionBatchFlushMaxMs,
      positionBatchFlushClientsMax: totals.positionBatchFlushClientsMax,
      positionBatchFlushGroupsMax: totals.positionBatchFlushGroupsMax,
      positionBatchFrames: totals.positionBatchFrames,
      positionBatchDeltas: totals.positionBatchDeltas,
      positionBatchBytes: totals.positionBatchBytes,
      positionBatchEncodedFrames: totals.positionBatchEncodedFrames,
      positionBatchEncodedDeltas: totals.positionBatchEncodedDeltas,
      positionBatchEncodedBytes: totals.positionBatchEncodedBytes,
      positionBatchReusedFrames: totals.positionBatchReusedFrames,
      positionBatchReusedDeltas: totals.positionBatchReusedDeltas,
      positionBatchReusedBytes: totals.positionBatchReusedBytes,
      currentPositionBatchBytes: totals.currentPositionBatchBytes,
      peakPositionBatchBytes: totals.peakPositionBatchBytes,
      peakClientCombinedBufferedBytes: totals.maxClientCombinedBufferedBytes,
      peakClientCombinedQueuedFrames: totals.maxClientCombinedQueuedFrames,
      eventTypes: eventTypeMetricsSnapshot(),
    });
  }

  function recordEventTypeMetric(event, field, amount) {
    let type = eventMetricType(event);
    if (!eventTypeTotals.has(type) && eventTypeTotals.size >= 64) {
      type = "other";
    }
    let metrics = eventTypeTotals.get(type);
    if (!metrics) {
      metrics = {
        sentFrames: 0,
        sentBytes: 0,
        encodedFrames: 0,
        encodedBytes: 0,
        reusedFrames: 0,
        reusedBytes: 0,
      };
      eventTypeTotals.set(type, metrics);
    }
    metrics[field] = Math.max(0, Number(metrics[field] || 0) + Math.max(0, Number(amount || 0)));
  }

  function eventTypeMetricsSnapshot() {
    const result = {};
    for (const [type, metrics] of eventTypeTotals.entries()) {
      result[type] = Object.freeze({...metrics});
    }
    return Object.freeze(result);
  }

  return {
    handleUpgrade,
    publish,
    close,
    clientCount,
    metrics,
  };
}

async function authorizeEventSession(service, token, modernSessionBoundary) {
  if (!modernSessionBoundary) {
    return invokeEventService(service, "getSession", [token], "ws_session");
  }
  let result = await Promise.resolve(service.getEventSession(token));
  if (!result || !result.ok || !result.needsRepair) {
    return result;
  }
  const repaired = await invokeEventService(service, "getSession", [token], "ws_session_repair");
  if (!repaired || !repaired.ok) {
    return repaired;
  }
  result = await Promise.resolve(service.getEventSession(token));
  return result;
}

function invokeEventService(service, methodName, args, actionId) {
  if (service && typeof service.invokeDurable === "function") {
    return service.invokeDurable(methodName, args, {actionId});
  }
  return Promise.resolve(service[methodName](...args));
}

function markBattleConnection(service, identity, token, connected) {
  const modernMethod = "markBattleConnectionForEventConnection";
  const useModernMethod = Boolean(service && typeof service[modernMethod] === "function");
  const methodName = useModernMethod ? modernMethod : "markBattleConnection";
  if (!service || typeof service[methodName] !== "function") {
    return Promise.resolve(true);
  }
  const args = useModernMethod ? [identity, connected] : [token, connected];
  try {
    const result = typeof service.invokeDurable === "function"
      ? service.invokeDurable(methodName, args, {
        actionId: connected ? "ws_battle_connect" : "ws_battle_disconnect",
      })
      : service[methodName](...args);
    return Promise.resolve(result).then(
      (value) => Boolean(value && value.ok),
      () => false,
    );
  } catch {
    // A later connection transition retries because failed results are not
    // committed into the local acknowledged-account set.
    return Promise.resolve(false);
  }
}

async function loadReplayCatalog(service, token, payload = {}) {
  if (!service || typeof service.listEventsForSession !== "function") {
    const latestEventSeq = normalizeEventSeq(
      service && typeof service.latestEventSeq === "function" ? service.latestEventSeq() : 0,
    );
    return {
      ok: true,
      events: [],
      earliestEventSeq: latestEventSeq + 1,
      latestEventSeq,
    };
  }
  let replay;
  try {
    replay = await Promise.resolve(service.listEventsForSession(token, {
      afterSeq: normalizeEventSeq(payload.afterSeq),
    }));
  } catch {
    return {ok: false, events: [], earliestEventSeq: 1, latestEventSeq: 0};
  }
  if (!replay || !replay.ok || !Array.isArray(replay.events)) {
    return {ok: false, events: [], earliestEventSeq: 1, latestEventSeq: 0};
  }
  const events = replay.events.slice();
  const latestEventSeq = normalizeEventSeq(replay.latestEventSeq ?? (
    service && typeof service.latestEventSeq === "function" ? service.latestEventSeq() : 0
  ));
  const firstVisible = events
    .map((event) => normalizeEventSeq(event && event.eventSeq))
    .find((eventSeq) => eventSeq > 0) || 0;
  const earliestEventSeq = normalizeEventSeq(replay.earliestEventSeq)
    || firstVisible
    || latestEventSeq + 1;
  return {
    ok: true,
    events,
    earliestEventSeq,
    latestEventSeq,
  };
}

function replayEventsFromCatalog(events, afterSeq, throughSeq) {
  return (Array.isArray(events) ? events : []).filter((event) => {
    const eventSeq = normalizeEventSeq(event && event.eventSeq);
    return eventSeq > afterSeq && eventSeq <= throughSeq;
  });
}

function eventCursorRequest(url) {
  const sequenceValues = [
    ...url.searchParams.getAll("lastEventSeq"),
    ...url.searchParams.getAll("afterSeq"),
  ];
  const epochValues = url.searchParams.getAll("eventStreamEpoch");
  return {
    cursorPresent: sequenceValues.length > 0,
    lastEventSeq: sequenceValues.length === 1 ? sequenceValues[0] : Number.NaN,
    eventStreamEpoch: epochValues.length === 1 ? epochValues[0] : "",
  };
}

function validateUpgradeRequest(req, url, options = {}) {
  if (String(req && req.method || "").toUpperCase() !== "GET") {
    throw upgradeFailure(400, "ws_method_invalid", "bad request");
  }
  if (url.searchParams.has("token")) {
    throw upgradeFailure(400, "ws_query_token_forbidden", "bad request");
  }
  const connectionTokens = commaHeaderTokens(singleHeader(req, "connection"));
  if (!connectionTokens.includes("upgrade")) {
    throw upgradeFailure(400, "ws_connection_header_invalid", "bad request");
  }
  if (singleHeader(req, "upgrade").trim().toLowerCase() !== "websocket") {
    throw upgradeFailure(400, "ws_upgrade_header_invalid", "bad request");
  }
  if (singleHeader(req, "sec-websocket-version").trim() !== "13") {
    throw upgradeFailure(426, "ws_version_invalid", "upgrade required");
  }
  const key = singleHeader(req, "sec-websocket-key").trim();
  if (!canonicalWebSocketKey(key)) {
    throw upgradeFailure(400, "ws_key_invalid", "bad request");
  }
  const originHeader = rawHeader(req, "origin");
  if (originHeader !== undefined) {
    if (Array.isArray(originHeader)) {
      throw upgradeFailure(403, "ws_origin_denied", "forbidden");
    }
    const origin = String(originHeader).trim();
    if (!options.allowedOrigins || !options.allowedOrigins.has(origin)) {
      throw upgradeFailure(403, "ws_origin_denied", "forbidden");
    }
  }

  const authorization = singleHeader(req, "authorization").trim();
  const bearerMatch = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(authorization);
  const protocolTokens = commaHeaderTokens(singleHeader(req, "sec-websocket-protocol"), {preserveCase: true});
  if (bearerMatch) {
    if (protocolTokens.includes(TEST_AUTH_SUBPROTOCOL)) {
      throw upgradeFailure(400, "ws_auth_ambiguous", "bad request");
    }
    return {key, token: bearerMatch[1], selectedSubprotocol: ""};
  }
  if (authorization !== "") {
    throw upgradeFailure(401, "ws_authorization_invalid", "unauthorized");
  }
  if (options.allowTestSubprotocolAuth === true) {
    const markerIndex = protocolTokens.indexOf(TEST_AUTH_SUBPROTOCOL);
    const token = markerIndex >= 0 ? String(protocolTokens[markerIndex + 1] || "") : "";
    if (
      markerIndex !== 0
      || protocolTokens.length !== 2
      || !/^[A-Za-z0-9_-]{1,128}$/.test(token)
    ) {
      throw upgradeFailure(401, "ws_test_auth_invalid", "unauthorized");
    }
    return {key, token, selectedSubprotocol: TEST_AUTH_SUBPROTOCOL};
  }
  throw upgradeFailure(401, "ws_authorization_required", "unauthorized");
}

function resolveUpgradeNetworkIdentity(req, options = {}) {
  if (typeof options.networkIdentity === "function") {
    return options.networkIdentity(req);
  }
  if (
    options.networkAdmission
    && typeof options.networkAdmission.networkIdentity === "function"
  ) {
    return options.networkAdmission.networkIdentity(req);
  }
  return requestNetworkIdentity(req);
}

function createWebSocketAdmission(options = {}, dependencies = {}) {
  const now = dependencies.now || Date.now;
  const randomBytes = dependencies.randomBytes || crypto.randomBytes;
  const ipLimiter = options.upgradeIpLimiter || new BoundedTokenBucketLimiter({now});
  const accountLimiter = options.upgradeAccountLimiter || new BoundedTokenBucketLimiter({now});
  const salt = Buffer.from(options.admissionSalt || randomBytes(32));
  if (salt.length < 16) {
    throw new Error("websocket admission salt must contain at least 16 bytes");
  }
  const maxPending = positiveInteger(options.maxPendingUpgrades, DEFAULT_PENDING_UPGRADES);
  const maxPendingPerIp = positiveInteger(options.maxPendingUpgradesPerIp, DEFAULT_PENDING_UPGRADES_PER_IP);
  const maxConnections = positiveInteger(options.maxConnections, DEFAULT_CONNECTIONS);
  const maxConnectionsPerIp = positiveInteger(options.maxConnectionsPerIp, DEFAULT_CONNECTIONS_PER_IP);
  const maxConnectionsPerAccount = positiveInteger(options.maxConnectionsPerAccount, DEFAULT_CONNECTIONS_PER_ACCOUNT);
  const maxConnectionsPerSession = positiveInteger(options.maxConnectionsPerSession, DEFAULT_CONNECTIONS_PER_SESSION);
  const maxConnectionsPerToken = positiveInteger(options.maxConnectionsPerToken, DEFAULT_CONNECTIONS_PER_TOKEN);
  const pendingByIp = new Map();
  const establishedByIp = new Map();
  const establishedByAccount = new Map();
  const establishedBySession = new Map();
  const establishedByToken = new Map();
  const rejectReasons = new Map();
  let pendingUpgrades = 0;
  let peakPendingUpgrades = 0;
  let establishedConnections = 0;
  let acceptedUpgrades = 0;
  let rejectedUpgrades = 0;

  function beginPending(clientIpValue) {
    const clientIp = String(clientIpValue || "unknown");
    const ipKey = opaqueKey("ip", clientIp, salt);
    const rate = ipLimiter.consume(`ws-upgrade:${ipKey}`, {
      capacity: positiveInteger(options.upgradeIpCapacity, DEFAULT_UPGRADE_IP_CAPACITY),
      windowMs: positiveInteger(options.upgradeIpWindowMs, DEFAULT_UPGRADE_IP_WINDOW_MS),
    });
    if (!rate.ok) {
      throw upgradeFailure(429, "ws_upgrade_ip_rate_limited", "too many requests", {
        retryAfterMs: rate.retryAfterMs,
      });
    }
    if (pendingUpgrades >= maxPending) {
      throw upgradeFailure(503, "ws_pending_capacity_full", "service unavailable", {retryAfterMs: 1000});
    }
    if (mapCount(pendingByIp, ipKey) >= maxPendingPerIp) {
      throw upgradeFailure(429, "ws_pending_ip_full", "too many requests", {retryAfterMs: 1000});
    }
    pendingUpgrades += 1;
    incrementMapCount(pendingByIp, ipKey);
    peakPendingUpgrades = Math.max(peakPendingUpgrades, pendingUpgrades);
    return releaseHandle(() => {
      pendingUpgrades = Math.max(0, pendingUpgrades - 1);
      decrementMapCount(pendingByIp, ipKey);
    });
  }

  function establish(identity = {}) {
    const ipKey = opaqueKey("ip", identity.clientIp, salt);
    const accountKey = opaqueKey("account", identity.accountId, salt);
    const sessionKey = opaqueKey("session", identity.sessionId, salt);
    const tokenKey = opaqueKey("token", identity.token, salt);
    const accountRate = accountLimiter.consume(`ws-account:${accountKey}`, {
      capacity: positiveInteger(options.upgradeAccountCapacity, DEFAULT_UPGRADE_ACCOUNT_CAPACITY),
      windowMs: positiveInteger(options.upgradeAccountWindowMs, DEFAULT_UPGRADE_ACCOUNT_WINDOW_MS),
    });
    if (!accountRate.ok) {
      throw upgradeFailure(429, "ws_upgrade_account_rate_limited", "too many requests", {
        retryAfterMs: accountRate.retryAfterMs,
      });
    }
    assertConnectionCapacity(establishedConnections, maxConnections, "ws_connection_capacity_full", 503);
    assertMapCapacity(establishedByIp, ipKey, maxConnectionsPerIp, "ws_connection_ip_full");
    assertMapCapacity(establishedByAccount, accountKey, maxConnectionsPerAccount, "ws_connection_account_full");
    assertMapCapacity(establishedBySession, sessionKey, maxConnectionsPerSession, "ws_connection_session_full");
    assertMapCapacity(establishedByToken, tokenKey, maxConnectionsPerToken, "ws_connection_token_full");
    establishedConnections += 1;
    for (const [map, key] of [
      [establishedByIp, ipKey],
      [establishedByAccount, accountKey],
      [establishedBySession, sessionKey],
      [establishedByToken, tokenKey],
    ]) {
      incrementMapCount(map, key);
    }
    return releaseHandle(() => {
      establishedConnections = Math.max(0, establishedConnections - 1);
      for (const [map, key] of [
        [establishedByIp, ipKey],
        [establishedByAccount, accountKey],
        [establishedBySession, sessionKey],
        [establishedByToken, tokenKey],
      ]) {
        decrementMapCount(map, key);
      }
    });
  }

  function recordReject(reasonValue) {
    const reason = String(reasonValue || "ws_upgrade_rejected");
    rejectedUpgrades += 1;
    rejectReasons.set(reason, Number(rejectReasons.get(reason) || 0) + 1);
  }

  function recordAccepted() {
    acceptedUpgrades += 1;
  }

  function metrics() {
    return Object.freeze({
      pendingUpgrades,
      peakPendingUpgrades,
      establishedConnections,
      pendingIpKeys: pendingByIp.size,
      establishedIpKeys: establishedByIp.size,
      establishedAccountKeys: establishedByAccount.size,
      establishedSessionKeys: establishedBySession.size,
      establishedTokenKeys: establishedByToken.size,
      acceptedUpgrades,
      rejectedUpgrades,
      rejectReasons: Object.freeze(Object.fromEntries(Array.from(rejectReasons.entries()).sort())),
    });
  }

  return Object.freeze({beginPending, establish, recordAccepted, recordReject, metrics});
}

function assertConnectionCapacity(current, maximum, code, statusCode) {
  if (current >= maximum) {
    throw upgradeFailure(statusCode, code, statusCode === 503 ? "service unavailable" : "too many requests", {
      retryAfterMs: 1000,
    });
  }
}

function assertMapCapacity(map, key, maximum, code) {
  if (mapCount(map, key) >= maximum) {
    throw upgradeFailure(429, code, "too many requests", {retryAfterMs: 1000});
  }
}

function mapCount(map, key) {
  return Number(map.get(key) || 0);
}

function incrementMapCount(map, key) {
  map.set(key, mapCount(map, key) + 1);
}

function decrementMapCount(map, key) {
  const count = mapCount(map, key);
  if (count <= 1) {
    map.delete(key);
  } else {
    map.set(key, count - 1);
  }
}

function releaseHandle(release) {
  let released = false;
  return Object.freeze({
    release() {
      if (released) {
        return;
      }
      released = true;
      release();
    },
  });
}

function opaqueKey(kind, value, salt) {
  return crypto.createHmac("sha256", salt)
    .update(`${String(kind || "key")}:${String(value || "")}`)
    .digest("hex")
    .slice(0, 24);
}

function canonicalAllowedOrigins(values) {
  const result = new Set();
  const rows = Array.isArray(values) ? values : String(values || "").split(",");
  for (const rawValue of rows) {
    const value = String(rawValue || "").trim();
    if (!value) {
      continue;
    }
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`invalid websocket allowed origin: ${value}`);
    }
    if (!/^https?:$/.test(parsed.protocol) || parsed.origin !== value) {
      throw new Error(`invalid websocket allowed origin: ${value}`);
    }
    result.add(value);
  }
  return result;
}

function canonicalWebSocketKey(value) {
  if (!/^[A-Za-z0-9+/]{22}==$/.test(value)) {
    return false;
  }
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length === 16 && decoded.toString("base64") === value;
  } catch {
    return false;
  }
}

function rawHeader(req, name) {
  return req && req.headers ? req.headers[String(name).toLowerCase()] : undefined;
}

function singleHeader(req, name) {
  const value = rawHeader(req, name);
  return Array.isArray(value) ? "" : String(value || "");
}

function commaHeaderTokens(value, options = {}) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => options.preserveCase ? entry : entry.toLowerCase());
}

function setSocketKeepAlive(socket) {
  if (!socket || typeof socket.setKeepAlive !== "function") {
    return;
  }
  try {
    socket.setKeepAlive(true, 30 * 1000);
  } catch {
    // TCP keepalive is defense in depth; protocol heartbeat remains authoritative.
  }
}

function encodeClosePayload(code, reasonValue) {
  const reason = String(reasonValue || "").replace(/[^\x20-\x7E]/g, "?").slice(0, 123);
  const reasonBytes = Buffer.from(reason, "utf8");
  const payload = Buffer.alloc(2 + reasonBytes.length);
  payload.writeUInt16BE(code, 0);
  reasonBytes.copy(payload, 2);
  return payload;
}

function withDeadline(value, timeoutMs) {
  let timer = null;
  return Promise.race([
    Promise.resolve(value),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(upgradeFailure(
        503,
        "ws_handshake_timeout",
        "service unavailable",
        {retryAfterMs: 1000},
      )), timeoutMs);
      if (timer && typeof timer.unref === "function") {
        timer.unref();
      }
    }),
  ]).finally(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  });
}

async function withHandshakeDeadline(deadlineAt, operation) {
  handshakeDeadlineRemainingMs(deadlineAt);
  const value = operation();
  return withDeadline(value, handshakeDeadlineRemainingMs(deadlineAt));
}

function handshakeDeadlineRemainingMs(deadlineAt) {
  const remainingMs = Math.floor(Number(deadlineAt || 0) - Date.now());
  if (remainingMs <= 0) {
    throw upgradeFailure(
      503,
      "ws_handshake_timeout",
      "service unavailable",
      {retryAfterMs: 1000},
    );
  }
  return remainingMs;
}

function upgradeFailure(statusCode, code, statusMessage, options = {}) {
  const error = new Error(String(code || "ws_upgrade_rejected"));
  error.statusCode = statusCode;
  error.code = code;
  error.statusMessage = statusMessage;
  error.retryAfterMs = Math.max(0, Math.ceil(Number(options.retryAfterMs || 0)));
  error.body = options.body || null;
  return error;
}

function publicUpgradeFailure(error) {
  const statusCode = [400, 401, 403, 404, 426, 429, 503].includes(Number(error && error.statusCode))
    ? Number(error.statusCode)
    : 503;
  const statusMessages = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    426: "Upgrade Required",
    429: "Too Many Requests",
    503: "Service Unavailable",
  };
  return {
    statusCode,
    statusMessage: statusMessages[statusCode],
    code: String(error && error.code || "ws_upgrade_failed"),
    retryAfterMs: Math.max(0, Math.ceil(Number(error && error.retryAfterMs || 0))),
    body: error && error.body || null,
  };
}

function normalizeEventSeq(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number));
}

function clientIdentity(client) {
  return Object.freeze({
    accountId: String(client && client.accountId || ""),
    sessionId: String(client && client.sessionId || ""),
  });
}

function eventConnectionIdentity(client) {
  const accountId = String(client && client.accountId || "");
  const sessionId = String(client && client.sessionId || "");
  // Subscription AOIs are normalized and frozen by EventSubscriptionIndex.
  // Reuse is safe only while that exact AOI object remains installed; a self
  // rebase replaces it and rebuilds this identity before the next projection.
  const aoi = client && client.presenceSubscription || null;
  const cached = client && client.eventConnectionIdentity;
  if (
    cached
    && cached.accountId === accountId
    && cached.sessionId === sessionId
    && cached.aoi === aoi
  ) {
    return cached;
  }
  const identity = Object.freeze({accountId, sessionId, aoi});
  if (client) {
    client.eventConnectionIdentity = identity;
  }
  return identity;
}

function isPositionEvent(event) {
  return Boolean(event && String(event.type || "") === "online.position");
}

function isPositionBatchEvent(event) {
  return Boolean(
    event
    && String(event.type || "") === "online.position_batch"
    && Array.isArray(event.deltas)
    && event.deltas.length > 0
    && event.deltas.length <= MAX_POSITION_BATCH_DELTAS
  );
}

function positionBatchEncodedSize(deltaPayloadBytes, deltaCount) {
  const payloadBytes = Math.max(0, Number(deltaPayloadBytes || 0));
  const count = Math.max(0, Math.trunc(Number(deltaCount || 0)));
  return 128 + payloadBytes + Math.max(0, count - 1);
}

function pendingPositionBatchDeltaCount(clients) {
  let total = 0;
  for (const client of clients || []) {
    total += Array.isArray(client && client.positionBatch && client.positionBatch.deltas)
      ? client.positionBatch.deltas.length
      : 0;
  }
  return total;
}

function eventMetricType(event) {
  const type = String(event && event.type || "");
  return /^[a-z][a-z0-9_.-]{0,63}$/.test(type) ? type : "other";
}

function isDeferredPositionEvent(event) {
  return Boolean(
    isPositionEvent(event)
    && normalizeEventSeq(event.eventSeq) === 0
    && !Object.hasOwn(event, "targetSessionIds")
    && !Object.hasOwn(event, "targetAccountIds")
  );
}

function mergePendingPositionEvent(first, latest) {
  const firstHasPreviousPosition = Object.hasOwn(first, "previousPosition");
  const latestHasPreviousPosition = Object.hasOwn(latest, "previousPosition");
  if (
    firstHasPreviousPosition === latestHasPreviousPosition
    && (
      !firstHasPreviousPosition
      || first.previousPosition === latest.previousPosition
    )
  ) {
    return latest;
  }
  const merged = {...latest};
  if (firstHasPreviousPosition) {
    merged.previousPosition = first.previousPosition;
  } else {
    delete merged.previousPosition;
  }
  return merged;
}

function createPublishFrameCache(sourceEvent, projectionCache = null) {
  return {
    sourceEvent,
    sourceShareable: stableJsonData(sourceEvent),
    frames: new Map(),
    // AuthService may return the same immutable projected object to viewers
    // with the same normalized AOI. Remember its already-audited key without
    // weakening the defensive fallback for custom/new projection objects.
    frameKeysByOutgoing: new WeakMap(),
    batchDeltasByOutgoing: new WeakMap(),
    batchSequenceIdsBySerialized: new Map(),
    // An older per-client batch may need to flush before a critical fanout.
    // Keep exact Buffer reuse scoped to that one synchronous publication.
    positionBatchFrames: new Map(),
    projectionCache,
  };
}

function sharedPublishFrameKey(client, outgoing, publishFrames) {
  if (!publishFrames || !publishFrames.sourceShareable) {
    return null;
  }
  const source = publishFrames.sourceEvent;
  if (outgoing === source) {
    return "source";
  }
  if (!isPositionEvent(source) || !isPositionEvent(outgoing)) {
    // AuthService has already performed every per-connection authorization
    // check before explicitly marking a publish-local immutable projection.
    // Object identity keeps public battle frames reusable without ever merging
    // different accounts' private settlement projections.
    return isReusableEventProjection(publishFrames.projectionCache, outgoing)
      ? outgoing
      : null;
  }
  const isSelf = String(client && client.accountId || "") === String(outgoing.accountId || "");
  const viewerClass = isSelf ? "self" : "remote";
  const reusableProjection = isReusableEventProjection(publishFrames.projectionCache, outgoing);
  let memoizedKeys = reusableProjection
    ? publishFrames.frameKeysByOutgoing.get(outgoing)
    : null;
  if (reusableProjection && memoizedKeys && memoizedKeys.has(viewerClass)) {
    return memoizedKeys.get(viewerClass);
  }
  if (!positionProjectionSharesSourceValues(source, outgoing)) {
    if (reusableProjection) {
      memoizedKeys ||= new Map();
      memoizedKeys.set(viewerClass, null);
      publishFrames.frameKeysByOutgoing.set(outgoing, memoizedKeys);
    }
    return null;
  }
  const hasChange = Object.hasOwn(outgoing, "change");
  const hasAoi = Object.hasOwn(outgoing, "aoi");
  const hasPresenceRebase = Object.hasOwn(outgoing, "presenceRebase");
  const hasPlayer = Object.hasOwn(outgoing, "player");
  const change = hasChange ? outgoing.change : null;
  const aoi = hasAoi ? outgoing.aoi : null;
  const presenceRebase = hasPresenceRebase ? outgoing.presenceRebase : null;
  const player = hasPlayer ? outgoing.player : null;
  if (
    !hasChange
    || typeof change !== "string"
    || hasAoi && (!plainDataRecord(aoi) || !stableJsonData(aoi))
    || hasPlayer && (!plainDataRecord(player) || !stableJsonData(player))
  ) {
    return null;
  }
  if (isSelf) {
    if (
      change !== POSITION_SELF_CHANGE
      || !hasAoi
      || !hasPresenceRebase
      || !plainDataRecord(presenceRebase)
      || !stableJsonData(presenceRebase)
    ) {
      return null;
    }
  } else if (!POSITION_REMOTE_CHANGES.has(change) || hasPresenceRebase) {
    return null;
  }
  try {
    // The source event is constant for this publication. For the supported
    // position projection, only self/nonself, change, projected player, AOI
    // and (for a self rebase) the rebase body may alter serialized bytes. Object-key order is
    // included so custom service projections cannot accidentally collide.
    const sharedKey = JSON.stringify([
      "online.position",
      isSelf,
      change,
      Object.keys(outgoing),
      hasPlayer ? player : null,
      hasAoi ? aoi : null,
      isSelf ? presenceRebase : null,
    ]);
    if (reusableProjection) {
      memoizedKeys ||= new Map();
      memoizedKeys.set(viewerClass, sharedKey);
      publishFrames.frameKeysByOutgoing.set(outgoing, memoizedKeys);
    }
    return sharedKey;
  } catch {
    if (reusableProjection) {
      memoizedKeys ||= new Map();
      memoizedKeys.set(viewerClass, null);
      publishFrames.frameKeysByOutgoing.set(outgoing, memoizedKeys);
    }
    return null;
  }
}

function positionProjectionSharesSourceValues(source, outgoing) {
  if (!plainDataRecord(outgoing)) {
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(outgoing);
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable) {
      continue;
    }
    if (descriptor.get || descriptor.set) {
      return false;
    }
    if (POSITION_PROJECTION_FIELDS.has(key)) {
      continue;
    }
    if (!Object.hasOwn(source, key) || !Object.is(descriptor.value, source[key])) {
      return false;
    }
  }
  return true;
}

function stableJsonData(value, stack = new Set()) {
  if (value === null) {
    return true;
  }
  const type = typeof value;
  if (type !== "object") {
    return type !== "bigint" && type !== "function";
  }
  if (
    stack.has(value)
    || (Array.isArray(value) && Object.getPrototypeOf(value) !== Array.prototype)
    || (!Array.isArray(value) && !plainDataRecord(value))
    || Object.hasOwn(value, "toJSON")
  ) {
    return false;
  }
  stack.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable) {
        continue;
      }
      if (descriptor.get || descriptor.set || !stableJsonData(descriptor.value, stack)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  } finally {
    stack.delete(value);
  }
}

function plainDataRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isCoalesciblePositionEvent(event) {
  if (!isPositionEvent(event)) {
    return false;
  }
  const change = String(event.change || "").trim().toLowerCase();
  return change === "upsert" || change === "remove";
}

function sessionReplacementTargetsClient(event, client) {
  if (!event || event.type !== "session.replaced" || !Array.isArray(event.targetSessionIds)) {
    return false;
  }
  return event.targetSessionIds.map((value) => String(value || "")).includes(String(client && client.sessionId || ""));
}

function detachClientSocketListeners(client) {
  const socket = client && client.socket;
  if (!socket) {
    return;
  }
  removeSocketListener(socket, "data", client.dataHandler);
  removeSocketListener(socket, "close", client.closeHandler);
  removeSocketListener(socket, "error", client.errorHandler);
}

function removeSocketListener(socket, eventName, listener) {
  if (typeof listener !== "function") {
    return;
  }
  if (typeof socket.off === "function") {
    socket.off(eventName, listener);
  } else if (typeof socket.removeListener === "function") {
    socket.removeListener(eventName, listener);
  }
}

function writeHttpError(socket, status, message, body = null, options = {}) {
  const text = body ? JSON.stringify(body) : "";
  const headers = [
    `HTTP/1.1 ${status} ${message}`,
    "Connection: close",
    "Cache-Control: no-store",
    "X-Content-Type-Options: nosniff",
  ];
  if (Number(status) === 426) {
    headers.push("Sec-WebSocket-Version: 13");
  }
  if (text !== "") {
    headers.push("Content-Type: application/json; charset=utf-8");
  }
  if (Number(options.retryAfterMs || 0) > 0) {
    headers.push(`Retry-After: ${Math.max(1, Math.ceil(Number(options.retryAfterMs) / 1000))}`);
  }
  headers.push(`Content-Length: ${Buffer.byteLength(text)}`);
  const response = [
    ...headers,
    "",
    text,
  ].join("\r\n");
  try {
    if (socket && typeof socket.end === "function") {
      socket.end(response);
    } else {
      socket.write(response);
      socket.destroy();
    }
  } catch {
    if (socket && !socket.destroyed && typeof socket.destroy === "function") {
      socket.destroy();
    }
  }
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

module.exports = {
  TEST_AUTH_SUBPROTOCOL,
  createEventHub,
};
