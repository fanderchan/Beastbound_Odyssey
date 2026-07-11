"use strict";

const crypto = require("node:crypto");
const {safeEncounterIntent, zoneContainsCell} = require("./pet-encounter-authority");

const DEFAULT_SAFE_STEPS = 2;
const DEFAULT_TTL_MS = 10 * 1000;
const DEFAULT_TOMBSTONE_TTL_MS = 30 * 1000;
const DEFAULT_ELIGIBLE_STEP_INTERVAL_MS = 150;
const DEFAULT_ELIGIBLE_STEP_BURST = 2;
const TOKEN_BYTES = 24;
const ENCOUNTER_SEED_BYTES = 32;

function createPetEncounterPermitAuthority(options = {}) {
  const catalog = options.catalog;
  validatePermitCatalog(catalog);
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const randomBytes = typeof options.randomBytes === "function" ? options.randomBytes : (size) => crypto.randomBytes(size);
  const randomFloat = typeof options.randomFloat === "function"
    ? options.randomFloat
    : () => secureRandomFloat(randomBytes);
  const safeSteps = clampInt(options.safeSteps, 0, 20, DEFAULT_SAFE_STEPS);
  const ttlMs = clampInt(options.ttlMs, 1000, 5 * 60 * 1000, DEFAULT_TTL_MS);
  const tombstoneTtlMs = clampInt(
    options.tombstoneTtlMs,
    ttlMs,
    10 * 60 * 1000,
    Math.max(ttlMs, DEFAULT_TOMBSTONE_TTL_MS),
  );
  const eligibleStepIntervalMs = clampInt(
    options.eligibleStepIntervalMs,
    0,
    5000,
    DEFAULT_ELIGIBLE_STEP_INTERVAL_MS,
  );
  const eligibleStepBurst = clampInt(
    options.eligibleStepBurst,
    1,
    10,
    DEFAULT_ELIGIBLE_STEP_BURST,
  );
  const progressByAccountId = new Map();
  const creditsByAccountId = new Map();
  const pendingByAccountId = new Map();
  const tombstonesByToken = new Map();
  const timedSlotsBySource = new Map();
  let lastGlobalCleanupAtMs = Number.NEGATIVE_INFINITY;

  function cleanupExpired(nowMs, force = false) {
    if (!force && nowMs - lastGlobalCleanupAtMs < 1000) {
      return;
    }
    lastGlobalCleanupAtMs = nowMs;
    for (const [accountId, permit] of pendingByAccountId) {
      if (permit.expiresAtMs <= nowMs) {
        pendingByAccountId.delete(accountId);
        rememberTombstone(permit, "expired", nowMs);
      }
    }
    for (const [token, tombstone] of tombstonesByToken) {
      if (tombstone.expiresAtMs <= nowMs) {
        tombstonesByToken.delete(token);
      }
    }
    for (const [sourceKey, state] of timedSlotsBySource) {
      if (state.expiresAtMs <= nowMs) {
        timedSlotsBySource.delete(sourceKey);
      }
    }
  }

  function rememberTombstone(permit, reason, nowMs) {
    if (!permit || !permit.token) {
      return;
    }
    tombstonesByToken.set(permit.token, {
      accountId: permit.accountId,
      reason,
      expiresAtMs: nowMs + tombstoneTtlMs,
    });
  }

  function observeAcceptedStep(input = {}) {
    const nowMs = now();
    cleanupExpired(nowMs);
    const accountId = requiredRuntimeText(input.accountId);
    const sessionId = requiredRuntimeText(input.sessionId);
    const mapId = requiredRuntimeText(input.mapId);
    const movementSeq = nonNegativeInteger(input.movementSeq);
    const cellX = integer(input.cellX);
    const cellY = integer(input.cellY);
    if (!accountId || !sessionId || !mapId || movementSeq < 1 || cellX === null || cellY === null) {
      return failure("encounter_permit_step_invalid", "服务端移动证据不完整，未触发遇敌。");
    }

    const oldPending = pendingByAccountId.get(accountId) || null;
    if (oldPending) {
      pendingByAccountId.delete(accountId);
      rememberTombstone(oldPending, "moved", nowMs);
    }

    const zoneResult = normalEncounterZoneAt(catalog, mapId, cellX, cellY);
    if (zoneResult.outside) {
      progressByAccountId.delete(accountId);
      return {ok: true, permit: null};
    }
    if (!zoneResult.ok) {
      progressByAccountId.delete(accountId);
      return zoneResult;
    }
    const zone = zoneResult.zone;
    const zoneId = String(zone.id || "");
    const encounterGroupId = String(zone.encounterGroupId || "");
    const previous = progressByAccountId.get(accountId) || null;
    const partyFingerprint = requiredRuntimeText(input.partyFingerprint);
    const rosterFingerprint = requiredRuntimeText(input.rosterFingerprint);
    const continuesSameZone = Boolean(
      previous &&
      previous.sessionId === sessionId &&
      previous.mapId === mapId &&
      previous.zoneId === zoneId &&
      previous.partyFingerprint === partyFingerprint &&
      previous.movementSeq + 1 === movementSeq
    );
    const eligibleStep = consumeEncounterStepCredit(
      creditsByAccountId,
      accountId,
      sessionId,
      nowMs,
      eligibleStepIntervalMs,
      eligibleStepBurst,
    );
    const progress = {
      accountId,
      sessionId,
      mapId,
      zoneId,
      encounterGroupId,
      movementSeq,
      partyFingerprint,
      rosterFingerprint,
      stepCount: continuesSameZone
        ? previous.stepCount + (eligibleStep ? 1 : 0)
        : (eligibleStep ? 1 : 0),
    };
    progressByAccountId.set(accountId, progress);
    if (!eligibleStep || progress.stepCount <= safeSteps) {
      return {ok: true, permit: null};
    }
    const encounterRate = Number(zone.encounterRate);
    let roll = 1;
    try {
      roll = normalizedRoll(randomFloat());
    } catch {
      return failure("encounter_permit_entropy_failed", "服务端暂时无法签发遇敌许可，请继续移动。");
    }
    if (!(roll < encounterRate)) {
      return {ok: true, permit: null};
    }

    let token = "";
    let encounterSeed = "";
    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidateBytes = Buffer.from(randomBytes(TOKEN_BYTES));
        const candidate = candidateBytes.length === TOKEN_BYTES ? candidateBytes.toString("base64url") : "";
        if (candidate && !tombstonesByToken.has(candidate) && !pendingTokenExists(pendingByAccountId, candidate)) {
          token = candidate;
          break;
        }
      }
      const seedBytes = Buffer.from(randomBytes(ENCOUNTER_SEED_BYTES));
      encounterSeed = seedBytes.length === ENCOUNTER_SEED_BYTES ? seedBytes.toString("hex") : "";
    } catch {
      return failure("encounter_permit_entropy_failed", "服务端暂时无法签发遇敌许可，请继续移动。");
    }
    if (!token || encounterSeed.length !== ENCOUNTER_SEED_BYTES * 2) {
      return failure("encounter_permit_entropy_failed", "服务端暂时无法签发遇敌许可，请继续移动。");
    }
    const expiresAtMs = nowMs + ttlMs;
    const permit = {
      token,
      accountId,
      sessionId,
      mapId,
      zoneId,
      encounterGroupId,
      cellX,
      cellY,
      movementSeq,
      partyFingerprint,
      rosterFingerprint,
      encounterSeed,
      expiresAtMs,
    };
    pendingByAccountId.set(accountId, permit);
    return {ok: true, permit: publicPermit(permit)};
  }

  function authorizeEncounter(input = {}) {
    const request = objectOrEmpty(input.request);
    const intent = safeEncounterIntent(request);
    const accountId = requiredRuntimeText(input.accountId);
    const sessionId = requiredRuntimeText(input.sessionId);
    if (intent.interactionId) {
      return {
        ok: true,
        mode: "direct",
        authorization: {mode: "direct", accountId, sessionId},
      };
    }
    if (!intent.zoneId) {
      return failure("encounter_zone_missing", "缺少遇敌区域标识。");
    }
    const token = String(request.encounterPermitToken || "").trim();
    if (!token) {
      return failure("encounter_permit_required", "需要通过移动触发本次野外遭遇。");
    }
    const nowMs = now();
    cleanupExpired(nowMs);
    const position = objectOrEmpty(input.position);
    const pending = pendingByAccountId.get(accountId) || null;
    if (!pending || pending.token !== token) {
      const tombstone = tombstonesByToken.get(token) || null;
      if (tombstone && tombstone.accountId === accountId) {
        if (tombstone.reason === "expired") {
          return failure("encounter_permit_expired", "本次遇敌许可已过期，请继续移动。");
        }
        return failure("encounter_permit_replayed", "本次遇敌许可已经使用或失效。");
      }
      return failure("encounter_permit_invalid", "本次遇敌许可无效，请继续移动。");
    }
    if (pending.expiresAtMs <= nowMs) {
      pendingByAccountId.delete(accountId);
      rememberTombstone(pending, "expired", nowMs);
      return failure("encounter_permit_expired", "本次遇敌许可已过期，请继续移动。");
    }
    const exactBinding = (
      pending.accountId === accountId &&
      pending.sessionId === sessionId &&
      pending.mapId === String(position.mapId || "") &&
      pending.cellX === integer(position.cellX) &&
      pending.cellY === integer(position.cellY) &&
      pending.movementSeq === nonNegativeInteger(position.movementSeq) &&
      pending.zoneId === intent.zoneId &&
      (!intent.groupId || pending.encounterGroupId === intent.groupId) &&
      pending.partyFingerprint === requiredRuntimeText(input.partyFingerprint) &&
      pending.rosterFingerprint === requiredRuntimeText(input.rosterFingerprint)
    );
    if (!exactBinding) {
      return failure("encounter_permit_binding_mismatch", "队伍或位置已经变化，请继续移动后重新触发遇敌。");
    }
    const zone = ownValue(ownValue(catalog.mapsById, pending.mapId) && ownValue(catalog.mapsById, pending.mapId).zonesById, pending.zoneId);
    if (!zone || Boolean(zone.manualOnly) || !zoneContainsCell(zone, pending.cellX, pending.cellY)) {
      return failure("encounter_permit_binding_mismatch", "遇敌区域已经变化，请继续移动后重新触发遇敌。");
    }
    return {
      ok: true,
      mode: "permit",
      authorization: {
        mode: "permit",
        token: pending.token,
        accountId: pending.accountId,
        sessionId: pending.sessionId,
        mapId: pending.mapId,
        zoneId: pending.zoneId,
        encounterGroupId: pending.encounterGroupId,
        cellX: pending.cellX,
        cellY: pending.cellY,
        movementSeq: pending.movementSeq,
        partyFingerprint: pending.partyFingerprint,
        rosterFingerprint: pending.rosterFingerprint,
        encounterSeed: pending.encounterSeed,
      },
    };
  }

  function authorizeTimedEncounter(input = {}) {
    const nowMs = now();
    cleanupExpired(nowMs);
    const accountId = requiredRuntimeText(input.accountId);
    const sessionId = requiredRuntimeText(input.sessionId);
    const sourceId = requiredRuntimeText(input.sourceId);
    const startedAtMs = Number(input.startedAtMs);
    const expiresAtMs = Number(input.expiresAtMs);
    const intervalMs = Math.trunc(Number(input.intervalMs));
    const position = objectOrEmpty(input.position);
    const mapId = String(position.mapId || "");
    const cellX = integer(position.cellX);
    const cellY = integer(position.cellY);
    const movementSeq = nonNegativeInteger(position.movementSeq);
    const originCell = Array.isArray(input.originCell) ? input.originCell : [];
    const originCellX = integer(originCell[0]);
    const originCellY = integer(originCell[1]);
    if (
      !accountId || !sessionId || !sourceId || !mapId ||
      cellX === null || cellY === null || movementSeq < 0 || Boolean(position.moving) ||
      !Number.isFinite(startedAtMs) || !Number.isFinite(expiresAtMs) ||
      intervalMs < 1000 || expiresAtMs <= startedAtMs ||
      String(input.originMapId || "") !== mapId || originCellX !== cellX || originCellY !== cellY
    ) {
      return failure("encounter_stone_binding_mismatch", "遇敌石位置或时效已经变化，请重新使用遇敌石。");
    }
    if (nowMs >= expiresAtMs) {
      return failure("encounter_stone_expired", "遇敌石效果已经结束。");
    }
    if (nowMs < startedAtMs + intervalMs) {
      return failure("encounter_stone_interval_pending", "遇敌石正在积累下一次遇敌。");
    }
    const intent = safeEncounterIntent(input.request);
    if (intent.interactionId || !intent.zoneId) {
      return failure("encounter_stone_binding_mismatch", "遇敌石只能触发当前区域的普通遭遇。");
    }
    const zoneResult = normalEncounterZoneAt(catalog, mapId, cellX, cellY);
    if (!zoneResult.ok || zoneResult.outside) {
      return failure("encounter_stone_binding_mismatch", "当前位置已不在遇敌石生效区域。");
    }
    const zone = zoneResult.zone;
    const zoneId = String(zone.id || "");
    const encounterGroupId = String(zone.encounterGroupId || "");
    if (
      zoneId !== String(input.zoneId || "") ||
      encounterGroupId !== String(input.encounterGroupId || "") ||
      intent.zoneId !== zoneId ||
      (intent.groupId && intent.groupId !== encounterGroupId)
    ) {
      return failure("encounter_stone_binding_mismatch", "遇敌石区域已经变化，请重新使用遇敌石。");
    }
    const slot = Math.floor((nowMs - startedAtMs) / intervalMs);
    const lastConsumedSlot = nonNegativeInteger(input.lastConsumedSlot);
    if (lastConsumedSlot < 0 || lastConsumedSlot >= slot) {
      return failure("encounter_stone_interval_pending", "遇敌石正在积累下一次遇敌。");
    }
    const sourceKey = `${accountId}:${sourceId}:${Math.trunc(startedAtMs)}`;
    const consumedState = timedSlotsBySource.get(sourceKey) || null;
    if (consumedState && consumedState.slot >= slot) {
      return failure("encounter_stone_interval_pending", "遇敌石正在积累下一次遇敌。");
    }
    let encounterSeed = "";
    let nonce = "";
    try {
      const seedBytes = Buffer.from(randomBytes(ENCOUNTER_SEED_BYTES));
      const nonceBytes = Buffer.from(randomBytes(TOKEN_BYTES));
      encounterSeed = seedBytes.length === ENCOUNTER_SEED_BYTES ? seedBytes.toString("hex") : "";
      nonce = nonceBytes.length === TOKEN_BYTES ? nonceBytes.toString("base64url") : "";
    } catch {
      return failure("encounter_permit_entropy_failed", "服务端暂时无法签发遇敌许可，请稍后重试。");
    }
    if (!encounterSeed || !nonce) {
      return failure("encounter_permit_entropy_failed", "服务端暂时无法签发遇敌许可，请稍后重试。");
    }
    return {
      ok: true,
      mode: "timed",
      authorization: {
        mode: "timed",
        nonce,
        sourceKey,
        sourceId,
        slot,
        previousConsumedSlot: lastConsumedSlot,
        expiresAtMs,
        accountId,
        sessionId,
        mapId,
        zoneId,
        encounterGroupId,
        cellX,
        cellY,
        movementSeq,
        partyFingerprint: requiredRuntimeText(input.partyFingerprint),
        rosterFingerprint: requiredRuntimeText(input.rosterFingerprint),
        encounterSeed,
      },
    };
  }

  function consume(authorizationValue = {}) {
    const authorization = objectOrEmpty(authorizationValue);
    if (String(authorization.mode || "") === "direct") {
      return {ok: true};
    }
    if (String(authorization.mode || "") === "timed") {
      const sourceKey = requiredRuntimeText(authorization.sourceKey);
      const slot = nonNegativeInteger(authorization.slot);
      const expiresAtMs = Number(authorization.expiresAtMs);
      if (!sourceKey || slot < 1 || !Number.isFinite(expiresAtMs) || expiresAtMs <= now()) {
        return failure("encounter_stone_expired", "遇敌石效果已经结束。");
      }
      const consumedState = timedSlotsBySource.get(sourceKey) || null;
      if (consumedState && consumedState.slot >= slot) {
        return failure("encounter_stone_interval_pending", "本轮遇敌石资格已经使用。");
      }
      timedSlotsBySource.set(sourceKey, {slot, expiresAtMs});
      return {ok: true};
    }
    if (String(authorization.mode || "") !== "permit") {
      return failure("encounter_permit_invalid", "本次遇敌许可无效，请继续移动。");
    }
    const nowMs = now();
    cleanupExpired(nowMs);
    const accountId = requiredRuntimeText(authorization.accountId);
    const token = requiredRuntimeText(authorization.token);
    const pending = pendingByAccountId.get(accountId) || null;
    if (!pending || pending.token !== token) {
      const tombstone = tombstonesByToken.get(token) || null;
      if (tombstone && tombstone.accountId === accountId && tombstone.reason === "expired") {
        return failure("encounter_permit_expired", "本次遇敌许可已过期，请继续移动。");
      }
      return failure("encounter_permit_replayed", "本次遇敌许可已经使用或失效。");
    }
    if (pending.expiresAtMs <= nowMs) {
      pendingByAccountId.delete(accountId);
      rememberTombstone(pending, "expired", nowMs);
      return failure("encounter_permit_expired", "本次遇敌许可已过期，请继续移动。");
    }
    pendingByAccountId.delete(accountId);
    rememberTombstone(pending, "consumed", nowMs);
    progressByAccountId.delete(accountId);
    return {ok: true};
  }

  function runtimeStats() {
    cleanupExpired(now(), true);
    return Object.freeze({
      progressCount: progressByAccountId.size,
      creditCount: creditsByAccountId.size,
      pendingCount: pendingByAccountId.size,
      tombstoneCount: tombstonesByToken.size,
      timedSourceCount: timedSlotsBySource.size,
    });
  }

  function invalidateAccount(accountIdValue, reason = "state_changed") {
    const accountId = requiredRuntimeText(accountIdValue);
    if (!accountId) {
      return {ok: true, changed: false};
    }
    const nowMs = now();
    const pending = pendingByAccountId.get(accountId) || null;
    if (pending) {
      pendingByAccountId.delete(accountId);
      rememberTombstone(pending, String(reason || "state_changed"), nowMs);
    }
    const changed = Boolean(
      pending || progressByAccountId.has(accountId) || creditsByAccountId.has(accountId),
    );
    progressByAccountId.delete(accountId);
    creditsByAccountId.delete(accountId);
    return {ok: true, changed};
  }

  return Object.freeze({
    observeAcceptedStep,
    authorizeEncounter,
    authorizeTimedEncounter,
    consume,
    invalidateAccount,
    runtimeStats,
  });
}

function normalEncounterZoneAt(catalog, mapId, cellX, cellY) {
  const map = ownValue(catalog.mapsById, mapId);
  if (!map) {
    return {ok: true, outside: true, zone: null};
  }
  const matches = Object.values(map.zonesById || {})
    .filter((zone) => zone && !Boolean(zone.manualOnly) && zoneContainsCell(zone, cellX, cellY))
    .sort((left, right) => String(left.id || "").localeCompare(String(right.id || "")));
  if (matches.length < 1) {
    return {ok: true, outside: true, zone: null};
  }
  if (matches.length > 1) {
    return failure("encounter_permit_zone_ambiguous", "当前位置的遇敌区域配置冲突，未触发遇敌。");
  }
  return {ok: true, outside: false, zone: matches[0]};
}

function validatePermitCatalog(catalog) {
  if (!catalog || !catalog.mapsById || typeof catalog.mapsById !== "object") {
    throw new Error("pet encounter permit authority requires a catalog");
  }
  for (const map of Object.values(catalog.mapsById)) {
    for (const zone of Object.values(map && map.zonesById || {})) {
      if (!zone || Boolean(zone.manualOnly)) {
        continue;
      }
      const rate = Number(zone.encounterRate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
        throw new Error(`invalid encounterRate for ${String(map && map.id || "")}/${String(zone.id || "")}`);
      }
    }
  }
}

function publicPermit(permit) {
  return Object.freeze({
    token: permit.token,
    mapId: permit.mapId,
    zoneId: permit.zoneId,
    encounterGroupId: permit.encounterGroupId,
    cellX: permit.cellX,
    cellY: permit.cellY,
    movementSeq: permit.movementSeq,
    expiresAt: new Date(permit.expiresAtMs).toISOString(),
    schemaVersion: 1,
  });
}

function pendingTokenExists(pendingByAccountId, token) {
  for (const permit of pendingByAccountId.values()) {
    if (permit.token === token) {
      return true;
    }
  }
  return false;
}

function consumeEncounterStepCredit(states, accountId, sessionId, nowMs, intervalMs, burst) {
  if (intervalMs <= 0) {
    states.set(accountId, {sessionId, tokens: burst, lastRefillAtMs: nowMs});
    return true;
  }
  const previous = states.get(accountId) || null;
  let tokens = burst;
  let lastRefillAtMs = nowMs;
  if (previous && previous.sessionId === sessionId) {
    const elapsedMs = Math.max(0, nowMs - Number(previous.lastRefillAtMs || nowMs));
    tokens = Math.min(burst, Number(previous.tokens || 0) + elapsedMs / intervalMs);
    lastRefillAtMs = nowMs;
  }
  const eligible = tokens >= 1;
  if (eligible) {
    tokens -= 1;
  }
  states.set(accountId, {sessionId, tokens, lastRefillAtMs});
  return eligible;
}

function secureRandomFloat(randomBytes) {
  const bytes = Buffer.from(randomBytes(6));
  if (bytes.length !== 6) {
    throw new Error("secure random float requires six bytes");
  }
  return bytes.readUIntBE(0, 6) / 281474976710656;
}

function normalizedRoll(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 1;
  }
  return Math.max(0, Math.min(1, number));
}

function ownValue(record, key) {
  return record && typeof record === "object" && Object.hasOwn(record, key) ? record[key] || null : null;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function requiredRuntimeText(value) {
  return String(value || "").trim();
}

function integer(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function nonNegativeInteger(value) {
  const number = integer(value);
  return number !== null && number >= 0 ? number : -1;
}

function clampInt(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function failure(code, message) {
  return {ok: false, code, message};
}

module.exports = {createPetEncounterPermitAuthority};
