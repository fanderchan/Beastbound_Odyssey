"use strict";

function createHealthMonitor(store, options = {}) {
  const now = typeof options.now === "function" ? options.now : Date.now;
  const probeIntervalMs = positiveInteger(options.probeIntervalMs, 5 * 1000);
  const probeTimeoutMs = positiveInteger(options.probeTimeoutMs, 2 * 1000);
  const staleAfterMs = positiveInteger(options.staleAfterMs, 15 * 1000);
  const onProbeError = typeof options.onProbeError === "function" ? options.onProbeError : () => {};
  const mode = String(store && (store.mode || store.kind || store.storeMode) || "unknown");
  let current = {
    ok: store ? null : true,
    checked: false,
    checkedAtMs: 0,
    latencyMs: 0,
  };
  let running = false;
  let closed = false;
  let timer = null;
  let inFlight = null;
  const totals = {probes: 0, failures: 0, timeouts: 0, recoveries: 0};

  function start() {
    if (running || closed) {
      return inFlight || Promise.resolve();
    }
    running = true;
    return refresh();
  }

  function refresh() {
    if (closed) {
      return Promise.resolve(snapshot());
    }
    if (inFlight) {
      return inFlight;
    }
    clearTimeout(timer);
    timer = null;
    const startedAt = process.hrtime.bigint();
    totals.probes += 1;
    let probeResult;
    try {
      probeResult = invokeProbe(store);
    } catch (error) {
      probeResult = Promise.reject(error);
    }
    inFlight = withDeadline(Promise.resolve(probeResult), probeTimeoutMs).then((result) => {
      const wasUnhealthy = current.checked && current.ok === false;
      current = {
        ok: !result || result.ok !== false,
        checked: true,
        checkedAtMs: now(),
        latencyMs: durationMsSince(startedAt),
      };
      if (wasUnhealthy && current.ok) {
        totals.recoveries += 1;
      }
      return snapshot();
    }, (error) => {
      totals.failures += 1;
      if (error && error.code === "health_probe_timeout") {
        totals.timeouts += 1;
      }
      current = {
        ok: false,
        checked: true,
        checkedAtMs: now(),
        latencyMs: durationMsSince(startedAt),
      };
      try {
        onProbeError(error);
      } catch {
        // Observability must not break readiness refresh.
      }
      return snapshot();
    }).finally(() => {
      inFlight = null;
      schedule();
    });
    return inFlight;
  }

  function schedule() {
    if (closed) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => refresh(), probeIntervalMs);
    timer.unref?.();
  }

  function snapshot() {
    const ageMs = current.checkedAtMs > 0 ? Math.max(0, now() - current.checkedAtMs) : 0;
    const stale = Boolean(current.checked && ageMs > staleAfterMs);
    return Object.freeze({
      ok: current.checked ? Boolean(current.ok && !stale) : current.ok,
      checked: current.checked,
      stale,
      mode,
      latencyMs: current.latencyMs,
      checkedAgoMs: ageMs,
    });
  }

  function liveSnapshot() {
    return Object.freeze({ok: true, service: "beastbound-auth"});
  }

  function metrics() {
    return Object.freeze({...totals, inFlight: Boolean(inFlight)});
  }

  function close() {
    closed = true;
    clearTimeout(timer);
    timer = null;
  }

  return {start, refresh, snapshot, liveSnapshot, metrics, close};
}

function invokeProbe(store) {
  if (!store) {
    return {ok: true, checked: false};
  }
  if (typeof store.checkHealthAsync === "function") {
    return store.checkHealthAsync();
  }
  if (typeof store.checkHealth === "function") {
    return store.checkHealth();
  }
  return {ok: true, checked: false};
}

function withDeadline(promise, timeoutMs) {
  let timer = null;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error("storage health probe timed out");
      error.code = "health_probe_timeout";
      reject(error);
    }, timeoutMs);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function durationMsSince(startedAt) {
  return Number((Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(3));
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

module.exports = {createHealthMonitor};
