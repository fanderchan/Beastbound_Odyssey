"use strict";

const DEFAULT_MAX_QUEUED_FRAMES = 128;
const DEFAULT_MAX_QUEUED_BYTES = 256 * 1024;
const DEFAULT_BACKPRESSURE_TIMEOUT_MS = 2000;
const DEFAULT_EVENT_HUB_WRITER_LIMITS = Object.freeze({
  maxQueuedFrames: DEFAULT_MAX_QUEUED_FRAMES,
  maxQueuedBytes: DEFAULT_MAX_QUEUED_BYTES,
  backpressureTimeoutMs: DEFAULT_BACKPRESSURE_TIMEOUT_MS,
});

function createEventHubWriter(socket, options = {}) {
  const maxQueuedFrames = positiveInteger(options.maxQueuedFrames, DEFAULT_MAX_QUEUED_FRAMES);
  const maxQueuedBytes = positiveInteger(options.maxQueuedBytes, DEFAULT_MAX_QUEUED_BYTES);
  const backpressureTimeoutMs = positiveInteger(
    options.backpressureTimeoutMs,
    DEFAULT_BACKPRESSURE_TIMEOUT_MS,
  );
  const outboundQueue = [];
  const presenceByAccountId = new Map();
  let queuedBytes = 0;
  let paused = options.paused === true;
  let blocked = options.initiallyBlocked === true || Boolean(socket && socket.writableNeedDrain);
  let disposed = false;
  let closeAfterFlush = false;
  let accepting = true;
  let bootstrapQueue = [];
  let bootstrapBytes = 0;
  let pressureTimer = null;
  let peakQueuedFrames = 0;
  let peakQueuedBytes = 0;
  let lastReportedQueuedFrames = 0;
  let lastReportedBufferedBytes = 0;

  const onDrain = () => {
    if (disposed) {
      return;
    }
    blocked = false;
    clearPressureTimer();
    recordPeak();
    flush();
  };
  if (socket && typeof socket.on === "function") {
    socket.on("drain", onDrain);
  }
  if (blocked) {
    armPressureTimer();
  }

  function enqueue(event, enqueueOptions = {}) {
    if (disposed || !accepting || !socket || socket.destroyed) {
      return false;
    }
    const entry = safeEventEntry(event);
    if (!entry) {
      destroy(false);
      return false;
    }
    return enqueueEntry(entry, enqueueOptions);
  }

  // Trusted zero-copy path for frames encoded by EventHub. The caller owns the
  // immutability contract and must not mutate `frame` after handing it to any
  // writer, because multiple sockets may hold this exact Buffer concurrently.
  function enqueuePreencoded(event, frame, enqueueOptions = {}) {
    if (disposed || !accepting || !socket || socket.destroyed) {
      return false;
    }
    if (!Buffer.isBuffer(frame)) {
      destroy(false);
      return false;
    }
    return enqueueEntry({event, frame}, enqueueOptions);
  }

  function enqueueEntry(entry, enqueueOptions) {
    if (canWriteDirectly()) {
      if (!reserve(1, entry.frame.length)) {
        return false;
      }
      return writeDirectly(entry);
    }
    const coalesceKey = String(enqueueOptions.coalesceKey || "");
    if (coalesceKey) {
      const previous = presenceByAccountId.get(coalesceKey) || null;
      const deltaBytes = entry.frame.length - Number(previous && previous.frame.length || 0);
      const deltaFrames = previous ? 0 : 1;
      if (!reserve(deltaFrames, deltaBytes)) {
        return false;
      }
      if (previous) {
        notify("onPresenceCoalesced", coalesceKey, previous.event, entry.event);
        const previousIndex = outboundQueue.indexOf(previous);
        if (previousIndex >= 0) {
          outboundQueue.splice(previousIndex, 1);
        }
        queuedBytes = Math.max(0, queuedBytes - previous.frame.length);
      }
      entry.coalesceKey = coalesceKey;
      outboundQueue.push(entry);
      queuedBytes += entry.frame.length;
      presenceByAccountId.set(coalesceKey, entry);
    } else {
      if (!reserve(1, entry.frame.length)) {
        return false;
      }
      outboundQueue.push(entry);
      queuedBytes += entry.frame.length;
    }
    recordPeak();
    flush();
    return !disposed;
  }

  function enqueueRaw(frame) {
    if (disposed || !accepting || !socket || socket.destroyed) {
      return false;
    }
    return enqueueEntry({event: null, frame: Buffer.from(frame)}, {});
  }

  function canWriteDirectly() {
    return !paused
      && !blocked
      && bootstrapQueue.length === 0
      && outboundQueue.length === 0;
  }

  function writeDirectly(entry) {
    let writable;
    try {
      writable = socket.write(entry.frame);
    } catch {
      destroy(false);
      return false;
    }
    notify("onFrameSent", entry.frame.length, entry.event);
    if (writable === false) {
      blocked = true;
      recordPeak();
      if (!withinHardBudget()) {
        disconnectSlowConsumer(hardBudgetReason());
        return false;
      }
      armPressureTimer();
    } else {
      // Preserve socket-buffer peak accounting without the former temporary
      // application queue push/shift and its two queue-metric transitions.
      recordPeak();
    }
    return !disposed;
  }

  function start() {
    if (disposed) {
      return;
    }
    paused = false;
    flush();
  }

  function startBootstrap(events) {
    if (disposed || !paused || bootstrapQueue.length > 0) {
      return false;
    }
    bootstrapQueue = Array.isArray(events) ? events.map(safeEventEntry) : [];
    if (bootstrapQueue.some((entry) => entry === null)) {
      destroy(false);
      return false;
    }
    bootstrapBytes = bootstrapQueue.reduce((total, entry) => total + entry.frame.length, 0);
    paused = false;
    recordPeak();
    if (blocked && !withinHardBudget()) {
      disconnectSlowConsumer(hardBudgetReason());
      return false;
    }
    flush();
    return !disposed;
  }

  function flush() {
    if (disposed || paused || blocked || !socket || socket.destroyed) {
      return;
    }
    while (!disposed && !blocked) {
      const entry = shiftEntry();
      if (!entry) {
        maybeCloseAfterFlush();
        return;
      }
      let writable;
      try {
        writable = socket.write(entry.frame);
      } catch {
        destroy(false);
        return;
      }
      notify("onFrameSent", entry.frame.length, entry.event);
      if (writable === false) {
        blocked = true;
        recordPeak();
        if (!withinHardBudget()) {
          disconnectSlowConsumer(hardBudgetReason());
          return;
        }
        armPressureTimer();
      } else {
        recordPeak();
      }
    }
  }

  function shiftEntry() {
    let entry = null;
    if (bootstrapQueue.length > 0) {
      entry = bootstrapQueue.shift();
      bootstrapBytes = Math.max(0, bootstrapBytes - entry.frame.length);
      return entry;
    }
    if (outboundQueue.length > 0) {
      entry = outboundQueue.shift();
      const coalesceKey = String(entry && entry.coalesceKey || "");
      if (coalesceKey && presenceByAccountId.get(coalesceKey) === entry) {
        presenceByAccountId.delete(coalesceKey);
      }
    }
    if (entry) {
      queuedBytes = Math.max(0, queuedBytes - entry.frame.length);
    }
    return entry;
  }

  function reserve(deltaFrames, deltaBytes) {
    const nextFrames = queuedFrames() + deltaFrames;
    const nextBytes = bufferedBytes() + deltaBytes;
    if (nextFrames > maxQueuedFrames) {
      disconnectSlowConsumer("outbound_frames_exceeded");
      return false;
    }
    if (nextBytes > maxQueuedBytes) {
      disconnectSlowConsumer("outbound_bytes_exceeded");
      return false;
    }
    return true;
  }

  function requestCloseAfterFlush() {
    if (disposed) {
      return;
    }
    closeAfterFlush = true;
    accepting = false;
    if (blocked) {
      armPressureTimer();
      return;
    }
    flush();
  }

  function maybeCloseAfterFlush() {
    if (
      !closeAfterFlush
      || disposed
      || paused
      || blocked
      || bootstrapQueue.length > 0
      || queuedFrames() > 0
    ) {
      return;
    }
    disposed = true;
    clearPressureTimer();
    removeDrainListener();
    try {
      if (socket && !socket.destroyed && typeof socket.end === "function") {
        socket.end(encodeFrame(0x8, Buffer.alloc(0)));
      } else if (socket && !socket.destroyed) {
        socket.destroy();
      }
    } catch {
      if (socket && !socket.destroyed && typeof socket.destroy === "function") {
        socket.destroy();
      }
    }
  }

  function disconnectSlowConsumer(reason) {
    if (disposed) {
      return;
    }
    notify("onSlowConsumer", reason);
    destroy(true);
  }

  function destroy(slowConsumer = false) {
    if (disposed) {
      return;
    }
    disposed = true;
    clearPressureTimer();
    removeDrainListener();
    outboundQueue.length = 0;
    bootstrapQueue = [];
    bootstrapBytes = 0;
    presenceByAccountId.clear();
    queuedBytes = 0;
    reportQueuedFrames(0);
    reportBufferedBytes(0);
    try {
      if (socket && !socket.destroyed && typeof socket.destroy === "function") {
        socket.destroy();
      }
    } catch {
      // Socket cleanup must not escape into event publication.
    }
    if (!slowConsumer) {
      notify("onWriterDestroyed");
    }
  }

  function dispose() {
    if (disposed) {
      reportQueuedFrames(0);
      reportBufferedBytes(0);
      return;
    }
    disposed = true;
    clearPressureTimer();
    removeDrainListener();
    outboundQueue.length = 0;
    bootstrapQueue = [];
    bootstrapBytes = 0;
    presenceByAccountId.clear();
    queuedBytes = 0;
    reportQueuedFrames(0);
    reportBufferedBytes(0);
  }

  function armPressureTimer() {
    if (pressureTimer !== null || disposed) {
      return;
    }
    pressureTimer = setTimeout(() => {
      pressureTimer = null;
      if (blocked && !disposed) {
        disconnectSlowConsumer("outbound_backpressure_timeout");
      }
    }, backpressureTimeoutMs);
    if (pressureTimer && typeof pressureTimer.unref === "function") {
      pressureTimer.unref();
    }
  }

  function clearPressureTimer() {
    if (pressureTimer !== null) {
      clearTimeout(pressureTimer);
      pressureTimer = null;
    }
  }

  function removeDrainListener() {
    if (!socket) {
      return;
    }
    if (typeof socket.off === "function") {
      socket.off("drain", onDrain);
    } else if (typeof socket.removeListener === "function") {
      socket.removeListener("drain", onDrain);
    }
  }

  function queuedFrames() {
    return outboundQueue.length + (blocked ? bootstrapQueue.length : 0);
  }

  function bufferedBytes() {
    return queuedBytes + (blocked ? bootstrapBytes : 0) + socketWritableLength(socket);
  }

  function withinHardBudget() {
    return queuedFrames() <= maxQueuedFrames && bufferedBytes() <= maxQueuedBytes;
  }

  function hardBudgetReason() {
    return queuedFrames() > maxQueuedFrames ? "outbound_frames_exceeded" : "outbound_bytes_exceeded";
  }

  function recordPeak() {
    const frames = queuedFrames();
    const current = bufferedBytes();
    peakQueuedFrames = Math.max(peakQueuedFrames, frames);
    peakQueuedBytes = Math.max(peakQueuedBytes, current);
    notify("onPeakQueuedFrames", peakQueuedFrames);
    notify("onPeakQueuedBytes", peakQueuedBytes);
    reportQueuedFrames(frames);
    reportBufferedBytes(current);
  }

  function reportQueuedFrames(value) {
    const current = Math.max(0, Number(value || 0));
    if (current === lastReportedQueuedFrames) {
      return;
    }
    lastReportedQueuedFrames = current;
    notify("onQueuedFramesChanged", current);
  }

  function reportBufferedBytes(value) {
    const current = Math.max(0, Number(value || 0));
    if (current === lastReportedBufferedBytes) {
      return;
    }
    lastReportedBufferedBytes = current;
    notify("onBufferedBytesChanged", current);
  }

  function metrics() {
    const currentBufferedBytes = bufferedBytes();
    return Object.freeze({
      queuedFrames: queuedFrames(),
      queuedBytes: currentBufferedBytes,
      applicationQueuedBytes: queuedBytes,
      bufferedBytes: currentBufferedBytes,
      replayFramesRemaining: bootstrapQueue.length,
      peakQueuedFrames,
      peakQueuedBytes,
      blocked,
      paused,
      accepting,
      disposed,
    });
  }

  function notify(name, ...args) {
    const callback = options[name];
    if (typeof callback !== "function") {
      return;
    }
    try {
      callback(...args);
    } catch {
      // Metrics and lifecycle callbacks must not affect socket delivery.
    }
  }

  return Object.freeze({
    enqueue,
    enqueuePreencoded,
    enqueueRaw,
    start,
    startBootstrap,
    requestCloseAfterFlush,
    destroy,
    dispose,
    metrics,
  });
}

function eventEntry(event) {
  const text = JSON.stringify(event);
  return {
    event,
    frame: encodeFrame(0x1, Buffer.from(text, "utf8")),
  };
}

function encodeEventFrame(event) {
  return eventEntry(event).frame;
}

function safeEventEntry(event) {
  try {
    return eventEntry(event);
  } catch {
    return null;
  }
}

function encodeFrame(opcode, payload) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || "");
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x80 | opcode, data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  return Buffer.concat([header, data]);
}

function socketWritableLength(socket) {
  const value = Number(socket && socket.writableLength || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

module.exports = {
  DEFAULT_EVENT_HUB_WRITER_LIMITS,
  createEventHubWriter,
  encodeEventFrame,
  encodeFrame,
};
